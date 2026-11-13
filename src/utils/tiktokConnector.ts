import {
  TikTokConnectionStatus,
  TikTokConnectionState,
  TikTokLiveGiftEvent,
} from '../types.js';
import { auth } from '../firebase.js';
import {
  recordGiftEventAtomic,
  recordGiftEventsBatchAtomic,
  GiftEventAtomicResult,
  getAuthBearerHeaders,
} from './tiktokLiveService.js';
import { getApiUrl, safeApiJson } from './apiConfig.js';

export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  jitter: boolean;
  maxRetries: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  jitter: true,
  maxRetries: 10,
};

export interface DeduplicationStats {
  totalReceived: number;
  duplicatesDropped: number;
  uniqueProcessed: number;
  lastDroppedId?: string;
  cacheSize: number;
}

export type EventBusListener<T = unknown> = (data: T) => void | Promise<void>;

export interface RawTikTokGiftMessage {
  transactionId?: string; // Original TikTok transaction/message identifier
  eventId?: string;
  eventKey?: string;
  technicalSignature?: string;
  originalTimestamp?: number | string;
  streakKey?: string;
  sessionId: string;
  tiktokUserId: string;
  username: string;
  displayHandle?: string;
  handleAvailable?: boolean;
  nickname: string;
  avatarUrl?: string;
  giftId: number;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  deltaCount: number;
  coinsGranted: number;
  repeatEnd: boolean;
  groupId: string;
}

/**
 * EventBus
 * Centralized in-memory event bus with LRU/TTL deduplication filter.
 * Strictly maintains a memory cache of processed TikTok transaction IDs,
 * providing the `processEvent` method to determine whether a transaction is unique
 * and needs to be persisted to Firestore.
 */
export class EventBus {
  private listeners: Map<string, Set<EventBusListener<any>>> = new Map();
  private processedTransactionIds: Map<string, number> = new Map(); // transactionId / dedupeKey -> timestamp
  private maxCacheSize: number;
  private ttlMs: number;
  private autoSequence = 0;

  private stats: DeduplicationStats = {
    totalReceived: 0,
    duplicatesDropped: 0,
    uniqueProcessed: 0,
    cacheSize: 0,
  };

  constructor(maxCacheSize = 20000, ttlMs = 30 * 60 * 1000) {
    this.maxCacheSize = maxCacheSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Resolve canonical deduplication key from a gift event or transaction ID.
   * 1. Prioritizes original eventId or transactionId/msgId provided by TikTok (scoped by repeatCount for combos).
   * 2. If no unique ID exists, builds a deterministic technical signature from original high-precision timestamp,
   *    senderId (tiktokUserId), giftId, groupId/streakKey, and repeatCount.
   * 3. Never uses only senderId + giftId as a deduplication key.
   * 4. Never uses browser arrival time (Date.now()) as the primary identifier.
   */
  public resolveDeduplicationKey(
    event:
      | {
          transactionId?: string;
          eventId?: string;
          eventKey?: string;
          technicalSignature?: string;
          originalTimestamp?: number | string;
          createTime?: number | string;
          id?: string;
          sessionId?: string;
          tiktokUserId?: string;
          giftId?: number;
          groupId?: string;
          streakKey?: string;
          repeatCount?: number;
        }
      | string
  ): string {
    if (typeof event === 'string') {
      const clean = event.trim();
      return clean.startsWith('tx_') ||
        clean.startsWith('evt_') ||
        clean.startsWith('sig_') ||
        clean.startsWith('id_')
        ? clean
        : `tx_${clean}`;
    }

    const repeat = Math.max(1, Number(event.repeatCount || 1));

    // 1. Prioritize original eventId when explicitly distinct from synthetic fallback
    if (event.eventId && String(event.eventId).trim()) {
      const cleanEvt = String(event.eventId).trim();
      const baseEvt = cleanEvt.startsWith('evt_') ? cleanEvt : `evt_${cleanEvt}`;
      return repeat > 1 && !baseEvt.endsWith(`_r${repeat}`) ? `${baseEvt}_r${repeat}` : baseEvt;
    }

    // 2. Or original transactionId / msgId provided by TikTok
    if (event.transactionId && String(event.transactionId).trim()) {
      const cleanTx = String(event.transactionId).trim();
      const baseTx = cleanTx.startsWith('tx_') ? cleanTx : `tx_${cleanTx}`;
      return repeat > 1 && !baseTx.endsWith(`_r${repeat}`) ? `${baseTx}_r${repeat}` : baseTx;
    }

    // 3. Or pre-computed technical signature / explicit id
    if (event.technicalSignature && String(event.technicalSignature).trim()) {
      return `sig_${String(event.technicalSignature).trim()}`;
    }
    if (event.id && String(event.id).trim()) {
      return `id_${String(event.id).trim()}`;
    }

    // 4. Deterministic technical signature from available event metadata (NEVER senderId + giftId alone, NEVER browser Date.now())
    const session = String(event.sessionId || 'session').trim();
    const sender = String(event.tiktokUserId || 'sender').trim();
    const gift = Number(event.giftId || 0);
    const origTs = String(event.originalTimestamp ?? event.createTime ?? '').trim();
    const groupOrStreak = String(event.streakKey || event.groupId || '').trim();

    if (origTs || groupOrStreak) {
      return `sig_${session}_ts:${origTs || 'no_ts'}_u:${sender}_g:${gift}_grp:${groupOrStreak || 'single'}_r:${repeat}`;
    }

    const seq = ++this.autoSequence;
    return `sig_${session}_u:${sender}_g:${gift}_seq:${seq}_r:${repeat}`;
  }

  /**
   * Subscribe to a topic on the event bus
   */
  public subscribe<T = unknown>(topic: string, listener: EventBusListener<T>): () => void {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    const set = this.listeners.get(topic)!;
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(topic);
      }
    };
  }

  /**
   * Publish an event to subscribers
   */
  public emit<T = unknown>(topic: string, data: T): void {
    const topicListeners = this.listeners.get(topic);
    if (topicListeners) {
      topicListeners.forEach((fn) => {
        try {
          const res = fn(data);
          if (res instanceof Promise) {
            res.catch((err) =>
              console.error(`[EventBus] Erro assíncrono no listener de "${topic}":`, err)
            );
          }
        } catch (err) {
          console.error(`[EventBus] Erro síncrono no listener de "${topic}":`, err);
        }
      });
    }
  }

  /**
   * Check whether a transaction ID or event ID has already been recorded in memory
   */
  public isDuplicate(
    keyOrEvent:
      | string
      | {
          transactionId?: string;
          eventId?: string;
          id?: string;
          sessionId?: string;
          groupId?: string;
          repeatCount?: number;
        }
  ): boolean {
    this.cleanExpiredCache();
    const key = typeof keyOrEvent === 'string' ? this.resolveDeduplicationKey(keyOrEvent) : this.resolveDeduplicationKey(keyOrEvent);
    return this.processedTransactionIds.has(key);
  }

  /**
   * Check whether a specific TikTok transaction ID has already been recorded
   */
  public hasTransaction(transactionId: string): boolean {
    return this.isDuplicate(transactionId);
  }

  /**
   * Mark an ID as processed with LRU eviction when hitting max size
   */
  public markProcessed(
    keyOrEvent:
      | string
      | {
          transactionId?: string;
          eventId?: string;
          id?: string;
          sessionId?: string;
          groupId?: string;
          repeatCount?: number;
        }
  ): void {
    const key = typeof keyOrEvent === 'string' ? this.resolveDeduplicationKey(keyOrEvent) : this.resolveDeduplicationKey(keyOrEvent);
    if (this.processedTransactionIds.size >= this.maxCacheSize) {
      const oldestKey = this.processedTransactionIds.keys().next().value;
      if (oldestKey) {
        this.processedTransactionIds.delete(oldestKey);
      }
    }
    this.processedTransactionIds.set(key, Date.now());
    this.stats.cacheSize = this.processedTransactionIds.size;
  }

  /**
   * Remove an ID from the processed set (used for rollback or manual invalidation)
   */
  public unmarkProcessed(
    keyOrEvent:
      | string
      | {
          transactionId?: string;
          eventId?: string;
          id?: string;
          sessionId?: string;
          groupId?: string;
          repeatCount?: number;
        }
  ): void {
    const key = typeof keyOrEvent === 'string' ? this.resolveDeduplicationKey(keyOrEvent) : this.resolveDeduplicationKey(keyOrEvent);
    this.processedTransactionIds.delete(key);
    this.stats.cacheSize = this.processedTransactionIds.size;
  }

  /**
   * Process an incoming TikTok event or transaction through the memory cache.
   * Returns whether the transaction is UNIQUE and needs to be persisted to Firestore (true),
   * or is a duplicate entry that must be dropped (false).
   *
   * @param event The gift event object or transaction ID string
   * @returns true if unique and needs to be persisted; false if duplicate
   */
  public processEvent(
    event:
      | RawTikTokGiftMessage
      | {
          transactionId?: string;
          eventId?: string;
          id?: string;
          sessionId?: string;
          groupId?: string;
          repeatCount?: number;
          [key: string]: any;
        }
      | string
  ): boolean {
    this.stats.totalReceived++;
    const dedupeKey = this.resolveDeduplicationKey(event);

    if (this.isDuplicate(dedupeKey)) {
      this.stats.duplicatesDropped++;
      this.stats.lastDroppedId = dedupeKey;
      const eventObj = typeof event === 'object' && event !== null ? event : {};
      this.emit('duplicate_dropped', {
        dedupeKey,
        transactionId: (eventObj as any).transactionId || (typeof event === 'string' ? event : undefined),
        eventId: (eventObj as any).eventId,
        username: (eventObj as any).username,
        giftName: (eventObj as any).giftName,
        repeatCount: (eventObj as any).repeatCount,
      });
      return false; // Duplicate detected: do NOT persist to Firestore
    }

    // Mark as processed in the memory cache
    this.markProcessed(dedupeKey);
    this.stats.uniqueProcessed++;

    if (typeof event === 'object' && event !== null) {
      const eventKey = (event as any).eventKey || dedupeKey;
      this.emit('gift', { ...event, dedupeKey, eventKey });
    } else {
      this.emit('transaction_processed', { dedupeKey, transactionId: event });
    }

    return true; // Unique transaction: needs to be persisted to Firestore
  }

  /**
   * Ingest and filter an incoming gift message through the deduplication bus.
   * Delegates to processEvent.
   * Returns true if event is unique and accepted; false if duplicate and dropped.
   */
  public processIncomingGiftEvent(event: RawTikTokGiftMessage): boolean {
    return this.processEvent(event);
  }

  /**
   * Persists an already-validated unique gift event to Firestore.
   * Automatically rolls back in-memory reservation if Firestore throws.
   */
  public async persistGiftEvent(
    event: RawTikTokGiftMessage
  ): Promise<{
    persisted: boolean;
    result?: Awaited<ReturnType<typeof recordGiftEventAtomic>>;
  }> {
    const canonicalEventId =
      event.eventId ||
      event.transactionId ||
      `${event.sessionId}_${event.groupId}_${event.repeatCount}`;

    try {
      const firestoreResult = await recordGiftEventAtomic({
        ...event,
        eventId: canonicalEventId,
      });
      this.emit('persisted', { event, result: firestoreResult });
      return { persisted: true, result: firestoreResult };
    } catch (err) {
      // Revert in-memory mark on persistence failure so caller can retry safely
      const dedupeKey = this.resolveDeduplicationKey(event);
      this.unmarkProcessed(dedupeKey);
      if (this.stats.uniqueProcessed > 0) {
        this.stats.uniqueProcessed--;
      }
      console.error('[EventBus] Falha ao persistir presente no Firestore:', err);
      this.emit('persist_error', { event, error: err });
      throw err;
    }
  }

  /**
   * High-level method: Validates deduplication and atomically persists to Firestore
   * Ensures no duplicate events are ever saved for the same TikTok transaction ID.
   */
  public async processAndPersistGiftEvent(
    event: RawTikTokGiftMessage
  ): Promise<{
    persisted: boolean;
    isDuplicate: boolean;
    result?: Awaited<ReturnType<typeof recordGiftEventAtomic>>;
  }> {
    const isNew = this.processEvent(event);
    if (!isNew) {
      return { persisted: false, isDuplicate: true };
    }

    const persistRes = await this.persistGiftEvent(event);
    return {
      persisted: persistRes.persisted,
      isDuplicate: false,
      result: persistRes.result,
    };
  }

  /**
   * High-throughput batch persistence for multiple unique gift events
   */
  public async persistGiftEventsBatch(
    events: RawTikTokGiftMessage[]
  ): Promise<GiftEventAtomicResult[]> {
    if (!events || events.length === 0) return [];
    const results = await recordGiftEventsBatchAtomic(
      events.map((ev) => ({
        ...ev,
        eventId:
          ev.eventId ||
          ev.transactionId ||
          `${ev.sessionId}_${ev.groupId}_${ev.repeatCount}`,
      }))
    );
    results.forEach((res, idx) => {
      this.emit('persisted', { event: events[idx], result: res });
    });
    return results;
  }

  /**
   * Sliding window TTL cleaner - removes expired entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [id, timestamp] of this.processedTransactionIds.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.processedTransactionIds.delete(id);
      }
    }
    this.stats.cacheSize = this.processedTransactionIds.size;
  }

  public getStats(): DeduplicationStats {
    return { ...this.stats, cacheSize: this.processedTransactionIds.size };
  }

  public getMemoryCache(): Map<string, number> {
    return new Map(this.processedTransactionIds);
  }

  public getProcessedCount(): number {
    return this.processedTransactionIds.size;
  }

  public getProcessedTransactionIds(): string[] {
    return Array.from(this.processedTransactionIds.keys());
  }

  public clear(): void {
    this.processedTransactionIds.clear();
    this.listeners.clear();
    this.stats = {
      totalReceived: 0,
      duplicatesDropped: 0,
      uniqueProcessed: 0,
      cacheSize: 0,
    };
  }
}

/**
 * TikTokEventBus
 * Backwards-compatible alias for EventBus.
 */
export class TikTokEventBus extends EventBus {}

const ACTIVE_SESSION_STORAGE_KEY = 'gio_active_live_session_id';
const ACTIVE_USERNAME_STORAGE_KEY = 'gio_active_live_username';
const ACTIVE_RULE_STORAGE_KEY = 'gio_active_live_rule_id';

function readStoredValue(key: string): string {
  try {
    if (typeof window !== 'undefined') {
      const fromSession = window.sessionStorage?.getItem(key);
      if (fromSession && fromSession.trim()) return fromSession.trim();
      const fromLocal = window.localStorage?.getItem(key);
      if (fromLocal && fromLocal.trim()) return fromLocal.trim();
    }
  } catch {
    // ignore storage errors
  }
  return '';
}

function writeStoredValue(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      if (value) {
        window.sessionStorage?.setItem(key, value);
        window.localStorage?.setItem(key, value);
      } else {
        window.sessionStorage?.removeItem(key);
        window.localStorage?.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * TikTokWebSocketClient
 * Unified SSE/WebSocket client with Jittered Exponential Backoff, single-use SSE ticket handshake,
 * durable outbox cursor resumption (`lastConfirmedCursor`), and ordered replay buffering.
 */
export class TikTokWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private config: BackoffConfig;
  private eventBus: EventBus;

  private currentAttempt = 0;
  private isExplicitlyClosed = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastEventId = '';
  private lastConfirmedSequence = 0;
  private clientId = `gio_tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  private clientSecret = `sec_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
  private currentSessionId?: string;
  private connectionGeneration = 0;
  private isRecoveringSse = false;
  private recoveryLiveBuffer: Array<{ data: any; recvMonoT0: number }> = [];
  private ticketsIssuedCount = 0;
  private lastTicketPrefix = '';
  private isTicketHandshakeInFlight = false;

  private state: TikTokConnectionState = 'DISCONNECTED';

  constructor(
    url = '/api/tiktok/stream',
    config: Partial<BackoffConfig> = {},
    eventBus?: EventBus
  ) {
    this.url = url;
    this.config = { ...DEFAULT_BACKOFF_CONFIG, ...config };
    this.eventBus = eventBus || new EventBus();
  }

  public setSessionId(sessionId?: string): void {
    const clean = sessionId ? sessionId.trim() : undefined;
    if (clean && this.currentSessionId && clean !== this.currentSessionId) {
      // Reset per-session sequence cursor when switching to a brand new sessionId
      this.lastConfirmedSequence = 0;
      this.lastEventId = '';
      this.recoveryLiveBuffer = [];
      this.isRecoveringSse = false;
    }
    this.currentSessionId = clean;
  }

  public getSessionId(): string | undefined {
    return this.currentSessionId;
  }

  public getEventBus(): EventBus {
    return this.eventBus;
  }

  public getState(): TikTokConnectionState {
    return this.state;
  }

  public getLastEventId(): string {
    return this.lastEventId;
  }

  public getLastConfirmedSequence(): number {
    return this.lastConfirmedSequence;
  }

  public setLastConfirmedSequence(seq: number, sessionId?: string): void {
    if (seq > this.lastConfirmedSequence) {
      this.lastConfirmedSequence = seq;
      const sid = sessionId || this.currentSessionId || 'live_default';
      this.lastEventId = `${sid}:${seq}`;
    }
  }

  public getClientId(): string {
    return this.clientId;
  }

  public getClientSecret(): string {
    return this.clientSecret;
  }

  public getTicketsIssuedCount(): number {
    return this.ticketsIssuedCount;
  }

  public getLastTicketPrefix(): string {
    return this.lastTicketPrefix;
  }

  public isSseOpenOrConnecting(): boolean {
    if (this.isTicketHandshakeInFlight) return true;
    if (!this.eventSource) return false;
    // EventSource.CONNECTING = 0, EventSource.OPEN = 1, EventSource.CLOSED = 2
    return this.eventSource.readyState === 0 || this.eventSource.readyState === 1;
  }

  public calculateBackoffDelay(attempt: number): number {
    const rawDelay = this.config.initialDelayMs * Math.pow(this.config.backoffFactor, attempt);
    const cappedDelay = Math.min(rawDelay, this.config.maxDelayMs);

    if (!this.config.jitter) {
      return Math.round(cappedDelay);
    }
    const jitterFactor = 0.85 + Math.random() * 0.3;
    return Math.round(cappedDelay * jitterFactor);
  }

  /**
   * Connect using SSE (for HTTP/relative stream endpoints) or WebSocket (for ws/wss endpoints) with automatic reconnect.
   * Safe against duplicate calls: if already connected/connecting to the same sessionId, reuses the active stream
   * unless `forceReconnect` is true.
   */
  public connect(options?: { forceReconnect?: boolean }): void {
    if (
      !options?.forceReconnect &&
      !this.isExplicitlyClosed &&
      this.isSseOpenOrConnecting()
    ) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.cleanupSockets();
    this.setState('CONNECTING');

    // If URL is an HTTP/SSE path (e.g. /api/tiktok/stream) and EventSource is available in the browser, use SSE directly
    if (!this.url.startsWith('ws') && typeof EventSource !== 'undefined') {
      this.fallbackToEventSource();
      return;
    }

    // Determine WebSocket protocol
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const wsProtocol = isHttps ? 'wss:' : 'ws:';
    const wsHost = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    const wsUrl = this.url.startsWith('ws')
      ? this.url
      : `${wsProtocol}//${wsHost}${this.url.startsWith('/') ? '' : '/'}${this.url}`;

    try {
      if (typeof WebSocket !== 'undefined') {
        const socket = new WebSocket(wsUrl);
        this.ws = socket;

        socket.onopen = () => {
          this.currentAttempt = 0;
          this.setState('CONNECTED');
          this.startHeartbeat();
        };

        socket.onmessage = (event) => {
          this.handleIncomingRawMessage(event.data);
        };

        socket.onerror = () => {
          if (this.state === 'CONNECTING') {
            this.fallbackToEventSource();
          }
        };

        socket.onclose = (event) => {
          this.stopHeartbeat();
          if (!this.isExplicitlyClosed) {
            this.scheduleReconnect(`WebSocket encerrado (${event.code || 'sem código'})`);
          }
        };
      } else {
        this.fallbackToEventSource();
      }
    } catch {
      this.fallbackToEventSource();
    }
  }

  /**
   * Requests a fresh single-use short-lived SSE ticket via POST /api/tiktok/stream/ticket
   * authenticated exclusively with Authorization: Bearer <idToken>.
   * NEVER places the Firebase ID Token in URL query parameters.
   */
  public async requestSingleUseSseTicket(sessionId?: string): Promise<string> {
    try {
      const authHeaders = await getAuthBearerHeaders();
      if (!authHeaders.Authorization) {
        return '';
      }
      const ticketRes = await safeApiJson<any>('/api/tiktok/stream/ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          sessionId: sessionId || this.currentSessionId || undefined,
        }),
      });
      if (ticketRes.ok && ticketRes.data) {
        const ticketData = ticketRes.data;
        const rawTicket = typeof ticketData.ticket === 'string' ? ticketData.ticket.trim() : '';
        if (rawTicket) {
          this.ticketsIssuedCount++;
          this.lastTicketPrefix = rawTicket.slice(0, 12);
          return rawTicket;
        }
      }
    } catch {
      // Ignore transient network errors; scheduleReconnect will retry
    }
    return '';
  }

  public buildSseUrlWithTicket(
    ticket: string,
    sessionId?: string,
    lastConfirmedSeq?: number
  ): string {
    const targetSessionId = sessionId || this.currentSessionId || 'live_default';
    const basePath =
      this.url.startsWith('http') || this.url.startsWith('/')
        ? this.url
        : '/api/tiktok/stream';
    const resolvedBasePath = getApiUrl(basePath);
    const params = new URLSearchParams({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      sessionId: targetSessionId,
      ticket,
    });

    const seq = lastConfirmedSeq !== undefined ? lastConfirmedSeq : this.lastConfirmedSequence;
    if (seq > 0) {
      params.set('lastConfirmedCursor', `${targetSessionId}:${seq}`);
    } else if (this.lastEventId) {
      params.set('lastEventId', this.lastEventId);
    }

    const separator = basePath.includes('?') ? '&' : '?';
    return `${basePath}${separator}${params.toString()}`;
  }

  private flushRecoveryBufferInOrder(): void {
    if (this.recoveryLiveBuffer.length === 0) return;
    const buffered = [...this.recoveryLiveBuffer];
    this.recoveryLiveBuffer = [];
    buffered.sort((a, b) => Number(a.data?.sequenceNumber || 0) - Number(b.data?.sequenceNumber || 0));
    for (const item of buffered) {
      this.eventBus.emit('gift_confirmed', {
        ...item.data,
        _recvMonoT0: item.recvMonoT0,
      });
    }
  }

  /**
   * Opens the unified Server-Sent Events (SSE) stream using a single-use ticket (`?ticket=tk_sse_...`)
   * and Last-Event-ID / `lastConfirmedCursor` resumption.
   */
  private fallbackToEventSource(): void {
    if (this.isExplicitlyClosed) return;
    this.cleanupSockets();

    const gen = ++this.connectionGeneration;
    const targetSessionId = this.currentSessionId || 'live_default';

    const hasPriorCursor = this.lastConfirmedSequence > 0 || Boolean(this.lastEventId);
    if (hasPriorCursor) {
      this.isRecoveringSse = true;
    }

    this.isTicketHandshakeInFlight = true;
    void (async () => {
      try {
        if (this.isExplicitlyClosed || gen !== this.connectionGeneration) {
          this.isTicketHandshakeInFlight = false;
          return;
        }

        // Obtain a brand-new single-use ticket via POST /api/tiktok/stream/ticket with Bearer header
        const ticket = await this.requestSingleUseSseTicket(targetSessionId);
        this.isTicketHandshakeInFlight = false;
        if (this.isExplicitlyClosed || gen !== this.connectionGeneration) return;

        // If user is not authenticated yet or has no ticket, wait for auth state or retry cleanly without putting idToken in URL
        if (!ticket) {
          this.scheduleReconnect('Aguardando autenticação PRO para emitir ticket SSE descartável');
          return;
        }

        const ssePath = this.buildSseUrlWithTicket(
          ticket,
          targetSessionId,
          this.lastConfirmedSequence
        );

        const sse = new EventSource(ssePath);
        this.eventSource = sse;

        sse.onopen = () => {
          if (gen !== this.connectionGeneration) return;
          this.currentAttempt = 0;
          setTimeout(() => {
            if (this.isRecoveringSse) {
              this.isRecoveringSse = false;
              this.flushRecoveryBufferInOrder();
            }
          }, 120);
        };

        sse.addEventListener('connected', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          this.currentAttempt = 0;
          this.setState('CONNECTED');
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('connected', data);
            this.eventBus.emit('status', { ...data, state: 'CONNECTED' });
          } catch {}
        });

        sse.addEventListener('reconnecting', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('reconnecting_webcast', data);
            this.eventBus.emit('status', { ...data, state: 'RECONNECTING' });
          } catch {}
        });

        sse.addEventListener('disconnected', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('disconnected', data);
            this.eventBus.emit('status', { ...data, state: 'DISCONNECTED' });
          } catch {}
        });

        sse.addEventListener('sync_required', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          try {
            const data = JSON.parse(e.data);
            this.isRecoveringSse = false;
            this.recoveryLiveBuffer = [];
            if (data.latestSequence && Number.isFinite(Number(data.latestSequence))) {
              this.setLastConfirmedSequence(Number(data.latestSequence), targetSessionId);
            }
            this.eventBus.emit('sync_required', data);
          } catch {}
        });

        sse.addEventListener('gift', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          if (e.lastEventId) {
            this.lastEventId = String(e.lastEventId);
          }
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('raw_sse_gift', data);
          } catch {
            this.handleIncomingRawMessage(e.data);
          }
        });

        sse.addEventListener('gift_confirmed', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          const recvMonoT0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (e.lastEventId) {
            this.lastEventId = String(e.lastEventId);
          }
          try {
            const data = JSON.parse(e.data);
            const seqNum = Number(data.sequenceNumber || 0);
            if (seqNum > 0) {
              this.setLastConfirmedSequence(seqNum, data.sessionId || targetSessionId);
            }
            if (this.isRecoveringSse && !data.replayed) {
              this.recoveryLiveBuffer.push({ data, recvMonoT0 });
              return;
            }
            this.eventBus.emit('gift_confirmed', {
              ...data,
              _recvMonoT0: recvMonoT0,
            });
          } catch {}
        });

        sse.addEventListener('diagnostics', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('diagnostics', data);
          } catch {}
        });

        sse.addEventListener('member', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('member', data);
          } catch {}
        });

        sse.addEventListener('status', (e: MessageEvent) => {
          if (gen !== this.connectionGeneration) return;
          try {
            const data = JSON.parse(e.data);
            this.eventBus.emit('status', data);
          } catch {}
        });

        sse.onerror = () => {
          if (gen !== this.connectionGeneration) return;
          if (!this.isExplicitlyClosed) {
            try {
              sse.close();
            } catch {}
            this.eventSource = null;
            this.scheduleReconnect('Queda de conexão SSE (novo ticket será emitido na reconexão)');
          }
        };
      } catch (err) {
        if (gen === this.connectionGeneration) {
          this.scheduleReconnect((err as Error).message);
        }
      }
    })();
  }

  /**
   * Parse message and pass to EventBus deduplication and persistence
   */
  private handleIncomingRawMessage(data: string): void {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      const event = parsed.event || parsed;
      if (parsed.seqId) {
        this.lastEventId = String(parsed.seqId);
      }

      if (parsed.type === 'STATUS') {
        this.eventBus.emit('status', parsed.data || parsed);
        return;
      }

      if (parsed.type === 'GIFT' || event.giftId) {
        const giftPayload: RawTikTokGiftMessage = {
          transactionId: event.transactionId || event.msgId || event.messageId,
          eventId: event.eventId,
          sessionId: event.sessionId || this.currentSessionId || 'current_live',
          tiktokUserId: String(event.tiktokUserId || event.userId || 'anon'),
          username: event.username || event.uniqueId || 'anon',
          nickname: event.nickname || 'Apoiador',
          avatarUrl: event.avatarUrl,
          giftId: Number(event.giftId || 0),
          giftName: event.giftName || 'Presente',
          diamondCount: Number(event.diamondCount || 1),
          repeatCount: Number(event.repeatCount || 1),
          deltaCount: Number(event.deltaCount || 1),
          coinsGranted: Number(event.coinsGranted || event.coins || 1),
          repeatEnd: Boolean(event.repeatEnd),
          groupId: String(event.groupId || 'grp'),
        };

        this.eventBus.processAndPersistGiftEvent(giftPayload).catch((err) => {
          console.error('[TikTokWebSocketClient] Erro ao gravar presente:', err);
        });
      }
    } catch (err) {
      console.warn('[TikTokWebSocketClient] Mensagem não pôde ser parseada:', err);
    }
  }

  /**
   * Schedule automatic reconnect with exponential backoff
   */
  private scheduleReconnect(reason: string): void {
    if (this.isExplicitlyClosed) return;

    if (this.currentAttempt >= this.config.maxRetries) {
      this.setState('ERROR');
      this.eventBus.emit('error', {
        message: `Limite de reconexões excedido (${this.config.maxRetries}). Motivo: ${reason}`,
      });
      return;
    }

    const delayMs = this.calculateBackoffDelay(this.currentAttempt);
    this.currentAttempt++;

    this.setState('RECONNECTING');
    this.eventBus.emit('reconnecting', {
      attempt: this.currentAttempt,
      maxRetries: this.config.maxRetries,
      delayMs,
      reason,
    });

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect({ forceReconnect: true });
      }
    }, delayMs);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.connectionGeneration++;
    this.cleanupSockets();
    this.currentAttempt = 0;
    this.setState('DISCONNECTED');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', time: Date.now() }));
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private cleanupSockets(): void {
    this.isTicketHandshakeInFlight = false;
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
  }

  private setState(newState: TikTokConnectionState): void {
    this.state = newState;
    this.eventBus.emit('connection_state', newState);
  }
}

/**
 * TikTokLiveConnector
 * High-level singleton orchestration manager coordinating the unified SSE stream,
 * persistent sessionId recovery across tab navigation and F5 reloads,
 * backend connection requests, and atomic Firestore persistence.
 */
export class TikTokLiveConnector {
  private client: TikTokWebSocketClient;
  private eventBus: EventBus;
  private currentSessionId: string;
  private currentUsername: string;
  private activeRuleId: string;
  private connectorState: TikTokConnectionState = 'DISCONNECTED';
  private lastKnownStatus: TikTokConnectionStatus;
  private mutationSeq = 0;
  private cachedGiftsFeed: any[] = [];
  private cachedMemberFeed: any[] = [];
  private cachedDiagnostics: any = null;
  private appliedSequenceNumbers: Set<number> = new Set();
  private appliedEventKeys: Set<string> = new Set();

  constructor(config: Partial<BackoffConfig> = {}, eventBus?: EventBus) {
    this.eventBus = eventBus || new EventBus();
    this.client = new TikTokWebSocketClient('/api/tiktok/stream', config, this.eventBus);

    const storedSid = readStoredValue(ACTIVE_SESSION_STORAGE_KEY);
    const initialSid = storedSid || `live_${Date.now()}`;
    writeStoredValue(ACTIVE_SESSION_STORAGE_KEY, initialSid);
    this.currentSessionId = initialSid;
    this.client.setSessionId(initialSid);

    const storedUser = readStoredValue(ACTIVE_USERNAME_STORAGE_KEY);
    this.currentUsername = storedUser || 'gioborelli';

    const storedRule = readStoredValue(ACTIVE_RULE_STORAGE_KEY);
    this.activeRuleId = storedRule || 'rule_default_100';

    this.lastKnownStatus = {
      state: 'DISCONNECTED',
      sessionId: this.currentSessionId,
      activeRuleId: this.activeRuleId,
      roomUsername: this.currentUsername,
      viewerCount: 0,
      totalGiftsReceived: 0,
      totalCoinsCollected: 0,
    };

    this.eventBus.subscribe('connection_state', (state: TikTokConnectionState) => {
      if (state) {
        this.connectorState = state;
      }
    });

    this.eventBus.subscribe('status', (data: any) => {
      if (!data) return;
      const resolvedState = data.state || data.status?.state;
      const resolvedSid = data.sessionId || data.status?.sessionId;
      const resolvedRule = data.activeRuleId || data.status?.activeRuleId;
      const resolvedUser = data.roomUsername ?? data.status?.roomUsername;
      const isBackendSessionActive =
        resolvedState === 'CONNECTED' ||
        resolvedState === 'CONNECTING' ||
        resolvedState === 'RECONNECTING' ||
        Boolean(data.persistedSessionActive);

      if (resolvedSid && isBackendSessionActive && resolvedSid !== this.currentSessionId) {
        this.setSessionId(resolvedSid, { reconnectStreamIfSessionChanged: true });
      }
      if (resolvedRule) {
        this.setActiveRuleId(resolvedRule);
      }
      if (resolvedUser) {
        this.setRoomUsername(resolvedUser);
      }
      this.lastKnownStatus = {
        ...this.lastKnownStatus,
        ...(data.status || data),
        state: resolvedState || this.lastKnownStatus.state,
        sessionId: this.currentSessionId,
        activeRuleId: this.activeRuleId,
        roomUsername: this.currentUsername,
      };
    });

    this.eventBus.subscribe('diagnostics', (diag: any) => {
      if (diag) {
        this.cachedDiagnostics = diag;
      }
    });

    // Rule 4: When the user closes the site/tab, detach ONLY the client SSE stream
    // so server-side TikTok LIVE workers continue processing events uninterrupted.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => {
        this.detachClientStreamOnly({ clearLocalCache: false });
      });
    }
  }

  public getEventBus(): EventBus {
    return this.eventBus;
  }

  public getClient(): TikTokWebSocketClient {
    return this.client;
  }

  public getState(): TikTokConnectionState {
    return this.connectorState;
  }

  public getLastKnownStatus(): TikTokConnectionStatus {
    return this.lastKnownStatus;
  }

  public getSessionId(): string {
    return this.currentSessionId;
  }

  public setSessionId(
    sessionId: string,
    options?: { reconnectStreamIfSessionChanged?: boolean; clearFeeds?: boolean }
  ): void {
    const clean = String(sessionId || '').trim();
    if (!clean) return;
    const changed = clean !== this.currentSessionId;
    this.currentSessionId = clean;
    writeStoredValue(ACTIVE_SESSION_STORAGE_KEY, clean);
    this.client.setSessionId(clean);
    this.lastKnownStatus = {
      ...this.lastKnownStatus,
      sessionId: clean,
    };

    if (changed) {
      this.appliedSequenceNumbers.clear();
      this.appliedEventKeys.clear();
      if (options?.clearFeeds) {
        this.cachedGiftsFeed = [];
        this.cachedMemberFeed = [];
      }
      this.eventBus.emit('session_changed', {
        sessionId: clean,
        activeRuleId: this.activeRuleId,
        roomUsername: this.currentUsername,
      });
      if (options?.reconnectStreamIfSessionChanged && this.client.isSseOpenOrConnecting()) {
        this.client.connect({ forceReconnect: true });
      }
    }
  }

  public getActiveRuleId(): string {
    return this.activeRuleId;
  }

  public setActiveRuleId(ruleId: string): void {
    const clean = String(ruleId || '').trim();
    if (!clean) return;
    this.activeRuleId = clean;
    writeStoredValue(ACTIVE_RULE_STORAGE_KEY, clean);
    this.lastKnownStatus = {
      ...this.lastKnownStatus,
      activeRuleId: clean,
    };
  }

  public getRoomUsername(): string {
    return this.currentUsername;
  }

  public setRoomUsername(username: string): void {
    const clean = String(username || '').trim().replace(/^@/, '');
    if (!clean) return;
    this.currentUsername = clean;
    writeStoredValue(ACTIVE_USERNAME_STORAGE_KEY, clean);
    this.lastKnownStatus = {
      ...this.lastKnownStatus,
      roomUsername: clean,
    };
  }

  public getCachedGiftsFeed(): any[] {
    return this.cachedGiftsFeed;
  }

  public setCachedGiftsFeed(updater: any[] | ((prev: any[]) => any[])): void {
    this.cachedGiftsFeed =
      typeof updater === 'function' ? updater(this.cachedGiftsFeed) : updater;
  }

  public getCachedMemberFeed(): any[] {
    return this.cachedMemberFeed;
  }

  public setCachedMemberFeed(updater: any[] | ((prev: any[]) => any[])): void {
    this.cachedMemberFeed =
      typeof updater === 'function' ? updater(this.cachedMemberFeed) : updater;
  }

  public getCachedDiagnostics(): any {
    return this.cachedDiagnostics;
  }

  public hasAppliedSequence(seqNum: number): boolean {
    return seqNum > 0 && this.appliedSequenceNumbers.has(seqNum);
  }

  public markSequenceApplied(seqNum: number, eventKey?: string): void {
    if (seqNum > 0) {
      this.appliedSequenceNumbers.add(seqNum);
    }
    if (eventKey) {
      this.appliedEventKeys.add(eventKey);
    }
  }

  public getMutationSeq(): number {
    return this.mutationSeq;
  }

  /**
   * Ensures the unified SSE stream managed by this singleton is open without creating duplicates.
   * Never closes on component unmount so internal navigation preserves the stream.
   */
  public ensureSseStream(sessionId?: string): void {
    if (sessionId && sessionId.trim() && sessionId.trim() !== this.currentSessionId) {
      this.setSessionId(sessionId.trim(), { reconnectStreamIfSessionChanged: true });
    }
    if (!this.client.isSseOpenOrConnecting()) {
      this.client.connect();
    }
  }

  /**
   * Synchronizes sessionId, activeRuleId, and connection state from GET /api/tiktok/status.
   * Ensures F5 reloads and page transitions always recover the active backend sessionId.
   */
  public async syncWithBackendStatus(options?: { triggerAutoRecovery?: boolean }): Promise<TikTokConnectionStatus | null> {
    try {
      const query = options?.triggerAutoRecovery ? '?recover=1' : '';
      const authHeaders = await getAuthBearerHeaders().catch(() => ({} as Record<string, string>));
      const statusRes = await safeApiJson<any>(`/api/tiktok/status${query}`, {
        headers: authHeaders,
      });
      if (!statusRes.ok || !statusRes.data) return null;
      const statusData = statusRes.data;

      const resolvedState = (statusData.state || statusData.status?.state || 'DISCONNECTED') as TikTokConnectionState;
      const resolvedSid = statusData.sessionId || statusData.status?.sessionId;
      const resolvedRuleId = statusData.activeRuleId || statusData.status?.activeRuleId;
      const resolvedUser = statusData.roomUsername ?? statusData.status?.roomUsername;
      const isBackendActiveOrPersisted =
        resolvedState === 'CONNECTED' ||
        resolvedState === 'CONNECTING' ||
        resolvedState === 'RECONNECTING' ||
        Boolean(statusData.persistedSessionActive);

      if (resolvedSid && isBackendActiveOrPersisted) {
        this.setSessionId(resolvedSid, { reconnectStreamIfSessionChanged: true });
      }
      if (resolvedRuleId) {
        this.setActiveRuleId(resolvedRuleId);
      }
      if (resolvedUser) {
        this.setRoomUsername(resolvedUser);
      }

      if (isBackendActiveOrPersisted) {
        this.ensureSseStream(this.currentSessionId);
      }

      this.publishConnectionStatus(
        {
          ...statusData,
          state: resolvedState,
          sessionId: this.currentSessionId,
          activeRuleId: this.activeRuleId,
          roomUsername: resolvedUser || this.currentUsername,
        },
        { bumpMutationSeq: false }
      );

      return this.lastKnownStatus;
    } catch {
      return null;
    }
  }

  public publishConnectionStatus(
    status: Partial<TikTokConnectionStatus> & { state: TikTokConnectionState },
    options?: { bumpMutationSeq?: boolean }
  ): void {
    if (options?.bumpMutationSeq !== false) {
      this.mutationSeq++;
    }
    this.connectorState = status.state;
    if (status.roomUsername !== undefined && status.roomUsername !== '') {
      this.setRoomUsername(status.roomUsername);
    }
    if (status.sessionId && (status.state !== 'DISCONNECTED' || status.persistedSessionActive)) {
      this.setSessionId(status.sessionId);
    }
    if (status.activeRuleId) {
      this.setActiveRuleId(status.activeRuleId);
    }
    this.lastKnownStatus = {
      ...this.lastKnownStatus,
      ...status,
      state: status.state,
      sessionId: this.currentSessionId,
      activeRuleId: this.activeRuleId,
      roomUsername: status.roomUsername || this.currentUsername,
    };
    this.eventBus.emit('connection_state', status.state);
    this.eventBus.emit('status', this.lastKnownStatus);
  }

  public getDeduplicationStats(): DeduplicationStats {
    return this.eventBus.getStats();
  }

  /**
   * Start connecting to a live session and ensure the unified SSE stream is active.
   */
  public async connect(
    username: string,
    sessionId: string,
    options?: {
      ruleId?: string;
      rate?: number;
      openClientStream?: boolean;
      campaignId?: string;
      cycleId?: string;
      raffleTitle?: string;
      prizeName?: string;
      minCoinsPerGift?: number;
      maxTicketsPerUser?: number | null;
      maxTotalTickets?: number | null;
      allowDuplicateWinners?: boolean;
      participationRulesNotes?: string;
    }
  ): Promise<{ success: boolean; error?: string; status?: TikTokConnectionStatus; sessionId?: string }> {
    const cleanUser = username.trim().replace(/^@/, '');
    this.setRoomUsername(cleanUser);
    if (sessionId) {
      this.setSessionId(sessionId);
    }
    if (options?.ruleId) {
      this.setActiveRuleId(options.ruleId);
    }

    this.publishConnectionStatus({
      state: 'CONNECTING',
      sessionId: this.currentSessionId,
      activeRuleId: this.activeRuleId,
      roomUsername: this.currentUsername,
      warning: null,
    });

    try {
      // 1. Post connection intent to backend with verified Firebase ID Token
      const authHeaders = await getAuthBearerHeaders();
      const connectRes = await safeApiJson<any>('/api/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          username: this.currentUsername,
          roomUsername: this.currentUsername,
          sessionId: this.currentSessionId,
          ruleId: options?.ruleId || this.activeRuleId,
          rate: options?.rate || 100,
          campaignId: options?.campaignId || undefined,
          cycleId: options?.cycleId || undefined,
          raffleTitle: options?.raffleTitle || undefined,
          prizeName: options?.prizeName || undefined,
          minCoinsPerGift: options?.minCoinsPerGift !== undefined ? options.minCoinsPerGift : undefined,
          maxTicketsPerUser: options?.maxTicketsPerUser !== undefined ? options.maxTicketsPerUser : undefined,
          maxTotalTickets: options?.maxTotalTickets !== undefined ? options.maxTotalTickets : undefined,
          allowDuplicateWinners: options?.allowDuplicateWinners !== undefined ? options.allowDuplicateWinners : undefined,
          participationRulesNotes: options?.participationRulesNotes || undefined,
        }),
      });

      const data = connectRes.data || {};
      if (!connectRes.ok) {
        const serverError = data.error || connectRes.error || 'Falha ao iniciar conector no servidor';
        this.publishConnectionStatus({
          state: 'ERROR',
          sessionId: this.currentSessionId,
          roomUsername: this.currentUsername,
          warning: serverError,
        });
        throw new Error(serverError);
      }

      const effectiveSid = data.sessionId || data.status?.sessionId || this.currentSessionId;
      if (effectiveSid && effectiveSid !== this.currentSessionId) {
        this.setSessionId(effectiveSid, { reconnectStreamIfSessionChanged: true });
      }
      if (data.activeRuleId || data.status?.activeRuleId) {
        this.setActiveRuleId(data.activeRuleId || data.status?.activeRuleId);
      }

      // 2. Always ensure the unified SSE stream is open on the singleton connector
      if (options?.openClientStream !== false) {
        this.ensureSseStream(this.currentSessionId);
      }

      const nextState: TikTokConnectionState = data.success
        ? 'CONNECTED'
        : (data.status?.state as TikTokConnectionState) || 'RECONNECTING';

      this.publishConnectionStatus({
        ...(data.status || {}),
        state: nextState,
        sessionId: this.currentSessionId,
        activeRuleId: this.activeRuleId,
        roomUsername: data.status?.roomUsername || this.currentUsername,
      });

      return {
        success: Boolean(data.success),
        error: data.error,
        status: data.status,
        sessionId: this.currentSessionId,
      };
    } catch (networkErr) {
      const errorMessage =
        networkErr instanceof Error ? networkErr.message : 'Falha de rede ao comunicar com o servidor';
      this.publishConnectionStatus({
        state: 'ERROR',
        sessionId: this.currentSessionId,
        roomUsername: this.currentUsername,
        warning: errorMessage,
      });
      throw new Error(errorMessage);
    }
  }

  /**
   * Rule 3 & Rule 4: Detaches ONLY the browser SSE/WebSocket listener without calling
   * POST /api/tiktok/disconnect. Ensures server-side workers keep processing events
   * when the user closes the browser tab or logs out of the browser session.
   */
  public detachClientStreamOnly(options?: { clearLocalCache?: boolean }): void {
    this.client.disconnect();
    if (options?.clearLocalCache) {
      this.cachedGiftsFeed = [];
      this.cachedMemberFeed = [];
      this.cachedDiagnostics = null;
      this.appliedSequenceNumbers.clear();
      this.appliedEventKeys.clear();
      writeStoredValue(ACTIVE_SESSION_STORAGE_KEY, '');
      writeStoredValue(ACTIVE_USERNAME_STORAGE_KEY, '');
      writeStoredValue(ACTIVE_RULE_STORAGE_KEY, '');
      this.connectorState = 'DISCONNECTED';
      this.lastKnownStatus = {
        state: 'DISCONNECTED',
        sessionId: this.currentSessionId,
        activeRuleId: this.activeRuleId,
        roomUsername: this.currentUsername,
        viewerCount: 0,
        totalGiftsReceived: 0,
        totalCoinsCollected: 0,
      };
      this.eventBus.emit('connection_state', 'DISCONNECTED');
      this.eventBus.emit('status', this.lastKnownStatus);
    }
  }

  public async disconnect(): Promise<void> {
    this.client.disconnect();
    try {
      const authHeaders = await getAuthBearerHeaders();
      await safeApiJson('/api/tiktok/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          sessionId: this.currentSessionId || undefined,
        }),
      });
    } catch {}
    this.publishConnectionStatus({
      state: 'DISCONNECTED',
      sessionId: this.currentSessionId,
      roomUsername: this.currentUsername,
      webcastActive: false,
      persistedSessionActive: false,
      warning: null,
    });
  }
}

// Global Singleton instances
export const eventBus = new EventBus();
export const tiktokEventBus = eventBus;
export const tiktokConnector = new TikTokLiveConnector(DEFAULT_BACKOFF_CONFIG, eventBus);

/**
 * Convenience helper method: processes an event and returns whether it is unique and needs to be persisted.
 */
export function processEvent(
  event:
    | RawTikTokGiftMessage
    | {
        transactionId?: string;
        eventId?: string;
        id?: string;
        sessionId?: string;
        groupId?: string;
        repeatCount?: number;
        [key: string]: any;
      }
    | string
): boolean {
  return eventBus.processEvent(event);
}

/**
 * High-level helper: validates deduplication and atomically persists to Firestore.
 * Ensures no duplicate events are ever saved for the same TikTok transaction ID.
 */
export async function processAndPersistGiftEvent(
  event: RawTikTokGiftMessage
): Promise<{
  persisted: boolean;
  isDuplicate: boolean;
  result?: Awaited<ReturnType<typeof recordGiftEventAtomic>>;
}> {
  return eventBus.processAndPersistGiftEvent(event);
}
