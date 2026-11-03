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

/**
 * TikTokWebSocketClient
 * Robust WebSocket client with Jittered Exponential Backoff for reconnections.
 * Automatically falls back to resilient SSE stream if standard WebSocket handshake is closed.
 */
export class TikTokWebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private config: BackoffConfig;
  private eventBus: EventBus;

  private currentAttempt = 0;
  private isExplicitlyClosed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingIntervalId: NodeJS.Timeout | null = null;
  private lastEventId = '';
  private clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

  public getEventBus(): EventBus {
    return this.eventBus;
  }

  public getState(): TikTokConnectionState {
    return this.state;
  }

  public getLastEventId(): string {
    return this.lastEventId;
  }

  public getClientId(): string {
    return this.clientId;
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
   * Connect using SSE (for HTTP/relative stream endpoints) or WebSocket (for ws/wss endpoints) with automatic reconnect
   */
  public connect(): void {
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
          // Fall back gracefully
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
   * Fallback to Server-Sent Events (SSE) stream with Last-Event-ID resumption and single clientId deduplication
   */
  private fallbackToEventSource(): void {
    if (this.isExplicitlyClosed) return;
    this.cleanupSockets();

    void (async () => {
      try {
        if (this.isExplicitlyClosed) return;
        let idToken = '';
        try {
          if (auth.currentUser) {
            idToken = await auth.currentUser.getIdToken();
          }
        } catch {}

        const basePath = this.url.startsWith('http') || this.url.startsWith('/')
          ? this.url
          : '/api/tiktok/stream';
        const separator = basePath.includes('?') ? '&' : '?';
        const queryParams = `clientId=${encodeURIComponent(this.clientId)}${
          this.lastEventId ? `&lastEventId=${encodeURIComponent(this.lastEventId)}` : ''
        }${idToken ? `&idToken=${encodeURIComponent(idToken)}` : ''}`;
        const ssePath = `${basePath}${separator}${queryParams}`;

        const sse = new EventSource(ssePath);
        this.eventSource = sse;

      sse.addEventListener('connected', () => {
        this.currentAttempt = 0;
        this.setState('CONNECTED');
      });

      sse.addEventListener('gift', (e: MessageEvent) => {
        if (e.lastEventId) {
          this.lastEventId = String(e.lastEventId);
        }
        this.handleIncomingRawMessage(e.data);
      });

      sse.addEventListener('gift_confirmed', (e: MessageEvent) => {
        if (e.lastEventId) {
          this.lastEventId = String(e.lastEventId);
        }
        try {
          const data = JSON.parse(e.data);
          this.eventBus.emit('gift_confirmed', data);
        } catch {}
      });

      sse.addEventListener('diagnostics', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.eventBus.emit('diagnostics', data);
        } catch {}
      });

      sse.addEventListener('status', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          this.eventBus.emit('status', data);
        } catch {}
      });

      sse.onerror = () => {
        if (!this.isExplicitlyClosed) {
          sse.close();
          this.scheduleReconnect('Queda de conexão SSE');
        }
      };
      } catch (err) {
        this.scheduleReconnect((err as Error).message);
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
          sessionId: event.sessionId || 'current_live',
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

        // Process through EventBus and persist atomically
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
        this.connect();
      }
    }, delayMs);
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
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
 * High-level orchestration manager coordinating the WebSocket/SSE client,
 * backend connection requests, and atomic Firestore persistence.
 */
export class TikTokLiveConnector {
  private client: TikTokWebSocketClient;
  private eventBus: EventBus;
  private currentSessionId = '';
  private currentUsername = '';
  private connectorState: TikTokConnectionState = 'DISCONNECTED';
  private mutationSeq = 0;

  constructor(config: Partial<BackoffConfig> = {}, eventBus?: EventBus) {
    this.eventBus = eventBus || new EventBus();
    this.client = new TikTokWebSocketClient('/api/tiktok/stream', config, this.eventBus);
    this.eventBus.subscribe('connection_state', (state: TikTokConnectionState) => {
      if (state) {
        this.connectorState = state;
      }
    });
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

  public getRoomUsername(): string {
    return this.currentUsername;
  }

  public getMutationSeq(): number {
    return this.mutationSeq;
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
      this.currentUsername = status.roomUsername;
    }
    this.eventBus.emit('connection_state', status.state);
    this.eventBus.emit('status', {
      ...status,
      state: status.state,
      roomUsername: status.roomUsername || this.currentUsername,
    });
  }

  public getDeduplicationStats(): DeduplicationStats {
    return this.eventBus.getStats();
  }

  /**
   * Start connecting to a live session
   */
  public async connect(
    username: string,
    sessionId: string,
    options?: { ruleId?: string; rate?: number; openClientStream?: boolean }
  ): Promise<{ success: boolean; error?: string; status?: TikTokConnectionStatus }> {
    this.currentUsername = username.trim().replace(/^@/, '');
    this.currentSessionId = sessionId;
    this.publishConnectionStatus({
      state: 'CONNECTING',
      roomUsername: this.currentUsername,
      warning: null,
    });

    let res: Response;
    try {
      // 1. Post connection intent to backend with verified Firebase ID Token
      const authHeaders = await getAuthBearerHeaders();
      res = await fetch('/api/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          username: this.currentUsername,
          roomUsername: this.currentUsername,
          sessionId: this.currentSessionId,
          ruleId: options?.ruleId,
          rate: options?.rate || 100,
        }),
      });
    } catch (networkErr) {
      const errorMessage =
        networkErr instanceof Error ? networkErr.message : 'Falha de rede ao comunicar com o servidor';
      this.publishConnectionStatus({
        state: 'ERROR',
        roomUsername: this.currentUsername,
        warning: errorMessage,
      });
      throw new Error(errorMessage);
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const serverError = data.error || 'Falha ao iniciar conector no servidor';
      this.publishConnectionStatus({
        state: 'ERROR',
        roomUsername: this.currentUsername,
        warning: serverError,
      });
      throw new Error(serverError);
    }

    // 2. Only open standalone client socket if explicitly requested (TikTokLiveManager manages its own unified SSE stream)
    if (options?.openClientStream) {
      this.client.connect();
    }

    const nextState: TikTokConnectionState = data.success
      ? 'CONNECTED'
      : (data.status?.state as TikTokConnectionState) || 'RECONNECTING';

    this.publishConnectionStatus({
      ...(data.status || {}),
      state: nextState,
      roomUsername: data.status?.roomUsername || this.currentUsername,
    });

    return {
      success: Boolean(data.success),
      error: data.error,
      status: data.status,
    };
  }

  public async disconnect(): Promise<void> {
    this.client.disconnect();
    try {
      const authHeaders = await getAuthBearerHeaders();
      await fetch('/api/tiktok/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          sessionId: this.currentSessionId || undefined,
        }),
      });
    } catch {}
    this.publishConnectionStatus({
      state: 'DISCONNECTED',
      roomUsername: this.currentUsername,
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
