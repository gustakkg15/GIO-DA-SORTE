import { collection, doc, setDoc, Timestamp, deleteDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import {
  DiagnosticEventOrigin,
  DiagnosticTtlStatus,
  TikTokDiagnostic6Stages,
  TikTokDiagnosticAuditEntry,
  TikTokDiagnosticStats,
} from '../types.js';

const SENSITIVE_KEYS = new Set([
  'access_token',
  'refreshtoken',
  'refresh_token',
  'client_secret',
  'clientsecret',
  'cookie',
  'cookies',
  'authorization',
  'auth',
  'password',
  'secret',
  'key',
  'encryptionkey',
  'encryption_key',
  'open_id',
  'openid',
  'token',
]);

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB
const MAX_DEPTH = 5;
const MAX_KEYS_PER_OBJECT = 50;
const MAX_STRING_LENGTH = 1000;
const BUFFER_CAPACITY = 2000;
const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 Hours

export interface SanitizationResult {
  sanitized: Record<string, unknown>;
  sanitizedFieldsCount: number;
  sizeBytes: number;
  isTruncated: boolean;
}

/**
 * Deep recursive sanitizer that removes credentials and enforces depth, key count, and string length bounds.
 */
export function sanitizeRawPayload(raw: any, depth = 0, counter = { redactedCount: 0 }): SanitizationResult {
  let isTruncated = false;

  function walk(node: any, currentDepth: number): any {
    if (node === null || node === undefined) {
      return node;
    }
    if (typeof node === 'string') {
      if (node.length > MAX_STRING_LENGTH) {
        isTruncated = true;
        return node.slice(0, MAX_STRING_LENGTH) + '...[TRUNCATED_MAX_LENGTH]';
      }
      return node;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
      return node;
    }
    if (currentDepth >= MAX_DEPTH) {
      isTruncated = true;
      return '[TRUNCATED_MAX_DEPTH]';
    }
    if (Array.isArray(node)) {
      const maxItems = 30;
      const sliced = node.slice(0, maxItems).map((item) => walk(item, currentDepth + 1));
      if (node.length > maxItems) {
        isTruncated = true;
        sliced.push('[TRUNCATED_MAX_ARRAY_ITEMS]');
      }
      return sliced;
    }
    if (typeof node === 'object') {
      const out: Record<string, unknown> = {};
      const keys = Object.keys(node);
      const boundedKeys = keys.slice(0, MAX_KEYS_PER_OBJECT);
      if (keys.length > MAX_KEYS_PER_OBJECT) {
        isTruncated = true;
      }

      for (const k of boundedKeys) {
        const lowerKey = k.toLowerCase().replace(/[-_]/g, '');
        if (SENSITIVE_KEYS.has(lowerKey) || SENSITIVE_KEYS.has(k.toLowerCase())) {
          out[k] = '[REDACTED_CREDENTIAL]';
          counter.redactedCount++;
        } else {
          out[k] = walk(node[k], currentDepth + 1);
        }
      }

      if (keys.length > MAX_KEYS_PER_OBJECT) {
        out['_warning_keys_limit'] = `Objeto continha ${keys.length} chaves; limitado a ${MAX_KEYS_PER_OBJECT}.`;
      }
      return out;
    }
    return String(node);
  }

  const sanitized = (walk(raw, depth) || {}) as Record<string, unknown>;
  let jsonString = '';
  try {
    jsonString = JSON.stringify(sanitized);
  } catch {
    jsonString = '{"error": "Failed to serialize raw payload"}';
  }

  let sizeBytes = Buffer.byteLength(jsonString, 'utf8');
  if (sizeBytes > MAX_PAYLOAD_BYTES) {
    isTruncated = true;
    const truncatedStr = jsonString.slice(0, MAX_PAYLOAD_BYTES - 100);
    return {
      sanitized: {
        _truncated_payload: truncatedStr + '...[TRUNCATED_MAX_SIZE]',
        _byte_size_original: sizeBytes,
      },
      sanitizedFieldsCount: counter.redactedCount,
      sizeBytes: MAX_PAYLOAD_BYTES,
      isTruncated: true,
    };
  }

  return {
    sanitized,
    sanitizedFieldsCount: counter.redactedCount,
    sizeBytes,
    isTruncated,
  };
}

export class TikTokDiagnosticService {
  private runtimeDebugActive = false;
  private ringBuffer: TikTokDiagnostic6Stages[] = [];
  private traceMap: Map<string, TikTokDiagnostic6Stages> = new Map();
  private auditLog: TikTokDiagnosticAuditEntry[] = [];

  // Aggregated Counters
  private totalEventsCaptured = 0;
  private validGiftsProcessed = 0;
  private blockedDuplicatesCount = 0;
  private eventsWithHandleAvailable = 0;
  private eventsWithoutHandleAvailable = 0;
  private eventsWithoutSenderId = 0;
  private persistenceFailuresCount = 0;
  private comboEventsCount = 0;
  private lastCapturedAt?: number;

  // TTL notice status
  private ttlStatus: DiagnosticTtlStatus = 'PENDING_GCP_POLICY_SETUP';
  private periodicPruneTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startPeriodicPruner();
  }

  /**
   * Master Environment Variable Check:
   * TIKTOK_LIVE_DEBUG=false blocks diagnostic activation completely,
   * even if an administrator tries to toggle it from the admin UI.
   */
  public isMasterEnvActive(): boolean {
    const val = process.env.TIKTOK_LIVE_DEBUG;
    return val === 'true' || val === '1';
  }

  /**
   * Effective activation check:
   * Requires BOTH the master environment variable to be true AND the runtime toggle to be active.
   */
  public isDiagnosticsActive(): boolean {
    return this.isMasterEnvActive() && this.runtimeDebugActive;
  }

  public getMasterEnvStatus(): boolean {
    return this.isMasterEnvActive();
  }

  public getRuntimeStatus(): boolean {
    return this.runtimeDebugActive;
  }

  /**
   * Sets runtime debug state with master environment enforcement.
   */
  public setRuntimeDebugActive(
    active: boolean,
    adminInfo: { uid?: string; email?: string } = {}
  ): { success: boolean; active: boolean; reason?: string; message: string } {
    const adminUid = adminInfo.uid || 'admin_user';
    const adminEmail = adminInfo.email || 'admin@giodasorte.pro';

    if (active && !this.isMasterEnvActive()) {
      this.recordAudit({
        action: 'TOGGLE_REJECTED',
        adminUid,
        adminEmail,
        details: 'Tentativa de ativar diagnóstico rejeitada: TIKTOK_LIVE_DEBUG=false no servidor.',
      });

      return {
        success: false,
        active: false,
        reason: 'MASTER_ENV_LOCK_DISABLED',
        message:
          'Chave-mestra de ambiente bloqueada: a variável TIKTOK_LIVE_DEBUG está configurada como false no servidor. Altere para true no ambiente para permitir ativação.',
      };
    }

    this.runtimeDebugActive = active;
    this.recordAudit({
      action: active ? 'ENABLE_DEBUG' : 'DISABLE_DEBUG',
      adminUid,
      adminEmail,
      details: active
        ? 'Diagnóstico avançado ativado em tempo de execução.'
        : 'Diagnóstico avançado desativado em tempo de execução.',
    });

    return {
      success: true,
      active: this.isDiagnosticsActive(),
      message: active
        ? 'LIVE EVENT DEBUGGER ativado com sucesso.'
        : 'LIVE EVENT DEBUGGER desativado.',
    };
  }

  public recordAudit(entry: Omit<TikTokDiagnosticAuditEntry, 'id' | 'timestamp'>): void {
    const record: TikTokDiagnosticAuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...entry,
    };
    this.auditLog.unshift(record);
    if (this.auditLog.length > 200) {
      this.auditLog.pop();
    }
  }

  public getAuditLog(): TikTokDiagnosticAuditEntry[] {
    return [...this.auditLog];
  }

  public getStats(): TikTokDiagnosticStats {
    const masterActive = this.isMasterEnvActive();
    const runtimeActive = this.runtimeDebugActive;
    return {
      debugMasterEnvActive: masterActive,
      debugRuntimeActive: runtimeActive,
      activeEffective: masterActive && runtimeActive,
      firestoreTtlStatus: this.ttlStatus,
      ttlNotice:
        'A coleção "tiktok_live_diagnostic_events" armazena o campo "ttlExpireAt" (Timestamp, 24 horas). Configure a política de TTL nativa do Firestore na coleção "tiktok_live_diagnostic_events" sobre o campo "ttlExpireAt" no GCP Console para deleção gerenciada. O servidor também executa limpeza interna a cada 1 hora.',
      totalEventsCaptured: this.totalEventsCaptured,
      validGiftsProcessed: this.validGiftsProcessed,
      blockedDuplicatesCount: this.blockedDuplicatesCount,
      eventsWithHandleAvailable: this.eventsWithHandleAvailable,
      eventsWithoutHandleAvailable: this.eventsWithoutHandleAvailable,
      eventsWithoutSenderId: this.eventsWithoutSenderId,
      persistenceFailuresCount: this.persistenceFailuresCount,
      comboEventsCount: this.comboEventsCount,
      inMemoryBufferSize: this.ringBuffer.length,
      retentionHours: 24,
      lastCapturedAt: this.lastCapturedAt,
    };
  }

  /**
   * STAGE A: Start diagnostic trace and capture raw payload before normalization & deduplication.
   * Returns traceId if active, or null if diagnostics is inactive.
   */
  public startTrace(
    rawPayload: any,
    options: {
      origin?: DiagnosticEventOrigin;
      sessionId?: string;
      roomUsername?: string;
      eventType?: string;
      connectorVersion?: string;
    } = {}
  ): string | null {
    if (!this.isDiagnosticsActive()) {
      return null;
    }

    try {
      const now = Date.now();
      const traceId = `diag_${now}_${Math.random().toString(36).slice(2, 9)}`;
      const origin = options.origin || 'LIVE_REAL';
      const sessionId = options.sessionId || 'live_default';
      const roomUsername = options.roomUsername || 'gioborelli';
      const eventType = options.eventType || 'gift';
      const connectorVersion = options.connectorVersion || 'tiktok-live-connector@2.x';

      const sanitization = sanitizeRawPayload(rawPayload);

      const expiresAt = now + RETENTION_MS;

      const diagnosticRecord: TikTokDiagnostic6Stages = {
        traceId,
        sessionId,
        roomUsername,
        origin,
        connectorVersion,
        timestamp: now,
        timestampIso: new Date(now).toISOString(),
        stageA: {
          rawPayload: sanitization.sanitized,
          originalEventType: eventType,
          receivedTimestamp: now,
          receivedTimestampIso: new Date(now).toISOString(),
          sanitizationApplied: sanitization.sanitizedFieldsCount > 0,
          sanitizedFieldsCount: sanitization.sanitizedFieldsCount,
          sizeBytes: sanitization.sizeBytes,
          isTruncated: sanitization.isTruncated,
        },
        stageB: {
          handleAvailable: false,
          candidateHandlesInspected: [],
          candidateUserIdsInspected: [],
          rawFieldsFound: [],
          rawFieldsMissing: [],
          isOAuthHostAccountExcluded: true,
        },
        stageC: {
          stableId: '',
          resultingHandle: '',
          nickname: '',
          giftId: 0,
          giftName: '',
          diamondCount: 0,
          repeatCount: 1,
          repeatEnd: true,
          groupId: '',
          normalizedAt: now,
        },
        stageD: {
          accepted: false,
          isDuplicate: false,
          reason: 'PENDING_EVALUATION',
          isComboContinuation: false,
          isComboFinalization: false,
        },
        stageE: {
          deltaCount: 0,
          coinsGranted: 0,
          ticketsGenerated: 0,
          accountedAt: now,
        },
        stageF: {
          persistedToFirestore: false,
          status: 'SKIPPED',
        },
        expiresAt,
      };

      // Store in memory ring buffer (FIFO)
      this.ringBuffer.push(diagnosticRecord);
      this.traceMap.set(traceId, diagnosticRecord);
      if (this.ringBuffer.length > BUFFER_CAPACITY) {
        const removed = this.ringBuffer.shift();
        if (removed) {
          this.traceMap.delete(removed.traceId);
        }
      }

      this.totalEventsCaptured += 1;
      this.lastCapturedAt = now;

      return traceId;
    } catch (err) {
      // Diagnostic failure must NEVER crash or stop normal processing
      console.warn('[TikTokDiagnosticService] Erro ao iniciar trace de diagnóstico:', err);
      return null;
    }
  }

  /**
   * STAGE B: Record raw extracted identity fields.
   */
  public recordExtractedIdentity(
    traceId: string | null,
    data: {
      userId?: string;
      uniqueId?: string;
      nickname?: string;
      displayHandle?: string;
      avatarUrl?: string;
      handleAvailable: boolean;
      secUid?: string;
      candidateHandlesInspected?: string[];
      candidateUserIdsInspected?: string[];
      rawFieldsFound?: string[];
      rawFieldsMissing?: string[];
    }
  ): void {
    if (!traceId) return;
    const record = this.traceMap.get(traceId);
    if (!record) return;

    record.stageB = {
      userId: data.userId,
      uniqueId: data.uniqueId,
      nickname: data.nickname,
      displayHandle: data.displayHandle,
      avatarUrl: data.avatarUrl,
      handleAvailable: data.handleAvailable,
      secUid: data.secUid,
      candidateHandlesInspected: data.candidateHandlesInspected || [],
      candidateUserIdsInspected: data.candidateUserIdsInspected || [],
      rawFieldsFound: data.rawFieldsFound || [],
      rawFieldsMissing: data.rawFieldsMissing || [],
      isOAuthHostAccountExcluded: true,
    };

    if (data.handleAvailable) {
      this.eventsWithHandleAvailable += 1;
    } else {
      this.eventsWithoutHandleAvailable += 1;
    }

    if (!data.userId || data.userId.startsWith('sem_id_')) {
      this.eventsWithoutSenderId += 1;
    }
  }

  /**
   * STAGE C: Record normalization outcome.
   */
  public recordNormalization(
    traceId: string | null,
    data: {
      stableId: string;
      resultingHandle: string;
      nickname: string;
      giftId: number;
      giftName: string;
      diamondCount: number;
      repeatCount: number;
      repeatEnd: boolean;
      groupId: string;
      explicitTransactionId?: string;
      explicitEventId?: string;
      originalTimestamp?: string;
    }
  ): void {
    if (!traceId) return;
    const record = this.traceMap.get(traceId);
    if (!record) return;

    record.stageC = {
      ...data,
      normalizedAt: Date.now(),
    };
  }

  /**
   * STAGE D: Record deduplication outcome.
   */
  public recordDeduplication(
    traceId: string | null,
    data: {
      accepted: boolean;
      isDuplicate: boolean;
      reason: string;
      signatureUsed?: string;
      eventId?: string;
      streakKey?: string;
      isComboContinuation?: boolean;
      isComboFinalization?: boolean;
    }
  ): void {
    if (!traceId) return;
    const record = this.traceMap.get(traceId);
    if (!record) return;

    record.stageD = {
      accepted: data.accepted,
      isDuplicate: data.isDuplicate,
      reason: data.reason,
      signatureUsed: data.signatureUsed,
      eventId: data.eventId,
      streakKey: data.streakKey,
      isComboContinuation: Boolean(data.isComboContinuation),
      isComboFinalization: Boolean(data.isComboFinalization),
    };

    if (data.accepted) {
      this.validGiftsProcessed += 1;
    }
    if (data.isDuplicate) {
      this.blockedDuplicatesCount += 1;
    }
    if (data.isComboContinuation || data.isComboFinalization) {
      this.comboEventsCount += 1;
    }
  }

  /**
   * STAGE E: Record accounting result (tickets, coins).
   */
  public recordAccounting(
    traceId: string | null,
    data: {
      deltaCount: number;
      coinsGranted: number;
      ticketsGenerated: number;
      ticketNumbers?: number[];
      ruleIdApplied?: string;
      rateApplied?: number;
    }
  ): void {
    if (!traceId) return;
    const record = this.traceMap.get(traceId);
    if (!record) return;

    record.stageE = {
      ...data,
      accountedAt: Date.now(),
    };
  }

  /**
   * STAGE F: Record persistence outcome & write asynchronously to Firestore without blocking.
   */
  public recordPersistence(
    traceId: string | null,
    data: {
      persistedToFirestore: boolean;
      firestoreDocId?: string;
      error?: string;
      serverReceiveLatencyMs?: number;
      processingLatencyMs?: number;
      persistenceLatencyMs?: number;
      totalTraceLatencyMs?: number;
      persistedAt?: number;
      status?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    }
  ): void {
    if (!traceId) return;
    const record = this.traceMap.get(traceId);
    if (!record) return;

    record.stageF = {
      persistedToFirestore: data.persistedToFirestore,
      firestoreDocId: data.firestoreDocId,
      error: data.error,
      serverReceiveLatencyMs: data.serverReceiveLatencyMs,
      processingLatencyMs: data.processingLatencyMs,
      persistenceLatencyMs: data.persistenceLatencyMs,
      totalTraceLatencyMs: data.totalTraceLatencyMs,
      persistedAt: data.persistedAt || Date.now(),
      status: data.status || (data.persistedToFirestore ? 'SUCCESS' : data.error ? 'FAILED' : 'SKIPPED'),
    };

    if (data.error) {
      this.persistenceFailuresCount += 1;
    }

    // Fire-and-forget save to separate Firestore collection with TTL field
    this.persistTraceToFirestoreAsync(record);
  }

  /**
   * Resilient, non-blocking asynchronous Firestore persistence.
   * If Firestore fails, records the failure metric without retrying infinitely or blocking.
   */
  private async persistTraceToFirestoreAsync(record: TikTokDiagnostic6Stages): Promise<void> {
    try {
      const docRef = doc(db, 'tiktok_live_diagnostic_events', record.traceId);
      // Clean undefined fields to satisfy Firestore setDoc constraints
      const serialized = JSON.parse(JSON.stringify(record));
      const firestorePayload = {
        ...serialized,
        ttlExpireAt: Timestamp.fromDate(new Date(record.expiresAt)),
      };
      await setDoc(docRef, firestorePayload);
    } catch (err: unknown) {
      this.persistenceFailuresCount += 1;
      // Do NOT throw. Diagnostics is purely observational.
      console.warn(`[TikTokDiagnosticService] Falha assíncrona ao persistir log diagnóstico ${record.traceId}:`, err);
    }
  }

  /**
   * Query in-memory and Firestore diagnostic logs with multi-field filtering.
   */
  public queryEvents(filters: {
    sessionId?: string;
    origin?: DiagnosticEventOrigin;
    userQuery?: string;
    giftId?: number;
    status?: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'ALL';
    limit?: number;
    offset?: number;
  }): { total: number; events: TikTokDiagnostic6Stages[] } {
    let list = [...this.ringBuffer];

    if (filters.sessionId) {
      list = list.filter((e) => e.sessionId === filters.sessionId);
    }
    if (filters.origin) {
      list = list.filter((e) => e.origin === filters.origin);
    }
    if (filters.giftId) {
      list = list.filter((e) => e.stageC.giftId === filters.giftId);
    }
    if (filters.userQuery) {
      const q = filters.userQuery.toLowerCase().trim().replace(/^@+/, '');
      list = list.filter(
        (e) =>
          e.stageC.resultingHandle.toLowerCase().includes(q) ||
          e.stageC.nickname.toLowerCase().includes(q) ||
          e.stageB.userId?.toLowerCase().includes(q) ||
          e.stageB.uniqueId?.toLowerCase().includes(q)
      );
    }
    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'ACCEPTED') {
        list = list.filter((e) => e.stageD.accepted);
      } else if (filters.status === 'DUPLICATE') {
        list = list.filter((e) => e.stageD.isDuplicate);
      } else if (filters.status === 'REJECTED') {
        list = list.filter((e) => !e.stageD.accepted && !e.stageD.isDuplicate);
      }
    }

    // Newest first
    list.reverse();

    const total = list.length;
    const offset = Math.max(0, filters.offset || 0);
    const maxLimit = Math.min(200, Math.max(1, filters.limit || 50));
    const events = list.slice(offset, offset + maxLimit);

    return { total, events };
  }

  public getEventByTraceId(traceId: string): TikTokDiagnostic6Stages | undefined {
    return this.traceMap.get(traceId);
  }

  public clearBuffer(adminInfo: { uid?: string; email?: string } = {}): void {
    this.ringBuffer = [];
    this.traceMap.clear();
    this.recordAudit({
      action: 'CLEAR_BUFFER',
      adminUid: adminInfo.uid || 'admin_user',
      adminEmail: adminInfo.email || 'admin@giodasorte.pro',
      details: 'Buffer de diagnóstico em memória esvaziado manualmente.',
    });
  }

  /**
   * Internal periodic pruner to clean up expired events from memory and Firestore
   */
  private startPeriodicPruner(): void {
    if (this.periodicPruneTimer) clearInterval(this.periodicPruneTimer);
    this.periodicPruneTimer = setInterval(() => {
      this.pruneExpiredEntries();
    }, 60 * 60 * 1000); // Hourly
  }

  public pruneExpiredEntries(): void {
    const now = Date.now();
    this.ringBuffer = this.ringBuffer.filter((e) => e.expiresAt > now);
    for (const [id, e] of this.traceMap.entries()) {
      if (e.expiresAt <= now) {
        this.traceMap.delete(id);
      }
    }

    // Async prune Firestore collection for docs where ttlExpireAt < now
    this.pruneFirestoreTtlAsync();
  }

  private async pruneFirestoreTtlAsync(): Promise<void> {
    try {
      const q = query(
        collection(db, 'tiktok_live_diagnostic_events'),
        where('ttlExpireAt', '<=', Timestamp.now()),
        limit(100)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
    } catch {
      // ignore
    }
  }
}

// Global Singleton instance
export const tiktokDiagnosticService = new TikTokDiagnosticService();
