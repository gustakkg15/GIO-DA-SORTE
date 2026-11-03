export interface Participant {
  id: string;
  name: string;
  coins: number;
  addedAt: number;
}

export type TicketOrder = 'asc' | 'desc' | 'random';
export type DrawMode = 'drum' | 'wheel' | 'battleroyale';

export interface PrizeTier {
  id: string;
  name: string;
  rank: number; // 1 = 1º Lugar, 2 = 2º Lugar, etc.
  winnerId?: string;
  winnerName?: string;
  ticketNumber?: number;
}

export type ThemeMode = 'default' | 'neon';

export interface RaffleSettings {
  rate: number;         // Moedas por número (default: 100)
  total: number;        // Total de números disponíveis (default: 100)
  start: number;        // Primeiro número (default: 1)
  order: TicketOrder;   // Ordem dos números
  seed: number;         // Seed para ordem aleatória determinística
  exclude: boolean;     // Excluir quem já ganhou de sorteios subsequentes
  currentPrize: string; // Nome do prêmio atual
  spinDuration: number; // Duração da rotação em ms (1500, 3000, 5000)
  countdownSeconds?: number; // Contagem regressiva antes do sorteio em segundos (ex: 10, 5, 3, 0 = desativado)
  themeMode?: ThemeMode; // 'default' (Clássico / Dark Elegante) | 'neon' (Neon Night com gradientes e luzes vibrantes)
  prizes: PrizeTier[];  // Lista de prêmios escalonados
  drawMode: DrawMode;   // 'drum' (bilhete) | 'wheel' (roleta) | 'battleroyale'
  supportPixKey?: string; // Chave Pix para colaboração espontânea
  supportPaypalEmail?: string; // E-mail ou link PayPal para colaboração internacional/cartão
  raffleCode?: string; // Código de consulta amigável para participantes (ex: GIO-7492)
  organizerName?: string; // Nome do sorteador ou canal (ex: Gusta Games)
  raffleTitle?: string; // Título do sorteio atual
  prizeName?: string; // Nome do prêmio principal do sorteio
  prizeImage?: string; // Imagem/foto do prêmio (URL ou base64 data)
}

export interface PublicRaffle {
  code: string;
  userId?: string;
  title: string;
  organizerName: string;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  updatedAt: string;
  isLive?: boolean;
}

export interface Winner {
  id: string;
  participantId: string;
  name: string;
  number: number;
  prize: string;
  drawnAt: number;
}

export interface TicketAllocation {
  participant: Participant;
  wantedTickets: number;
  assignedTickets: number;
  tickets: number[];
  remainderCoins: number;
  winProbability: number; // 0 to 100 %
}

export interface ComputedRaffle {
  allocations: TicketAllocation[];
  allTickets: { number: number; participantId: string; name: string }[];
  usedCount: number;
  totalCapacity: number;
  eligibleTickets: { number: number; participantId: string; name: string }[];
}

export interface MonteCarloResult {
  participantId: string;
  name: string;
  coins: number;
  tickets: number;
  simulatedWins: number;
  simulatedPct: number;
  theoreticalPct: number;
  difference: number;
}

// TikTok Giveaway Types
export interface TikTokVideoInfo {
  url: string;
  videoId?: string;
  authorName?: string;
  authorUrl?: string;
  authorAvatar?: string;
  title?: string;
  thumbnailUrl?: string;
  commentCount?: number;
  hasMoreComments?: boolean;
  nextCursor?: number | string;
}

export interface TikTokComment {
  id: string;
  username: string;
  nickname?: string;
  avatarUrl?: string;
  text: string;
  timestamp?: number;
  likes?: number;
  mentions: string[];
}

export interface TikTokFilterSettings {
  filterDuplicates: boolean; // 1 chance por @usuário
  keyword: string;           // Palavra-chave ou hashtag obrigatória
  minMentions: number;       // Mínimo de @amigos marcados
  excludeAuthor: boolean;    // Excluir comentários do autor do vídeo
  minCharacters: number;     // Mínimo de caracteres
}

export interface TikTokWinner {
  id: string;
  rank: number;
  comment: TikTokComment;
  prize: string;
  drawnAt: number;
}

// ==========================================
// TIKTOK LIVE REAL-TIME INTEGRATION TYPES
// ==========================================

export type TikTokConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

export interface TikTokMemberPresenceEvent {
  eventId: string;
  sessionId: string;
  tiktokUserId: string;
  username: string;
  nickname: string;
  avatarUrl?: string;
  action: 'JOINED' | 'LEFT';
  timestamp: number;
}

export interface TikTokConnectionStatus {
  state: TikTokConnectionState;
  sessionId?: string;
  activeRuleId?: string;
  currentRate?: number;
  webcastActive?: boolean;
  persistedSessionActive?: boolean;
  requiresWebcastRecovery?: boolean;
  ownerUid?: string | null;
  roomUsername: string;
  roomId?: string;
  roomTitle?: string;
  viewerCount: number;
  connectedAt?: number | null;
  lastHeartbeat?: number;
  disconnectReason?: string | null;
  warning?: string | null;
  totalGiftsReceived: number;
  totalCoinsCollected: number;
  recentMembers?: TikTokMemberPresenceEvent[];
  activeStreaksCount?: number;
  reconnectCount?: number;
  duplicatesBlocked?: number;
  errorsCount?: number;
}

export interface TikTokLiveSession {
  sessionId: string;
  ownerUid?: string;
  ownerAuditNote?: string;
  migratedOwnerAt?: number;
  username: string;
  tiktokUserId: string;
  roomTitle?: string;
  raffleTitle?: string;
  prizeName?: string;
  status: 'active' | 'paused' | 'ended' | 'reconnecting' | 'disconnected';
  startedAt: number;
  pausedAt?: number | null;
  endedAt?: number | null;
  totalCoins: number;
  totalGiftsCount: number;
  uniqueSupportersCount: number;
  currentRuleId: string;
  currentRate: number; // Moedas enviadas por bilhete (ex: 100)
  minCoinsPerGift?: number; // Mínimo de moedas enviadas no presente para pontuar (default: 1)
  maxTicketsPerUser?: number | null; // Limite máximo de bilhetes por participante nesta LIVE (null/0 = sem limite)
  maxTotalTickets?: number | null; // Limite máximo total de bilhetes nesta LIVE (null/0 = sem limite)
  allowDuplicateWinners?: boolean; // Permitir ou bloquear que o mesmo @usuário vença múltiplos prêmios na mesma LIVE
  participationRulesNotes?: string; // Regras adicionais da transmissão
  campaignId?: string; // Sincronização automática com campanha Multi-LIVE
  cycleId?: string; // Ciclo ativo vinculado da campanha recorrente
  currentTicketCounter: number;
  currentSequenceNumber?: number; // Monotonic durable SSE sequence counter per session
  viewerCount?: number;
  latestDrawFrozenTicketMax?: number | null;
}

export type GiftPersistenceStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface TikTokLiveGiftEvent {
  eventId: string; // Idempotent key scoped to the gift send / combo step
  eventKey?: string; // Exclusive deterministic key for UI rendering and deduplication
  transactionId?: string; // Canonical TikTok transaction / gift message ID
  technicalSignature?: string; // Deterministic signature built from original event fields
  originalTimestamp?: number | string; // High-precision original timestamp from TikTok payload
  streakKey?: string; // Scoped streak key for this combo cycle
  sessionId: string;
  tiktokUserId: string; // Stable numeric TikTok user ID
  username: string;
  displayHandle?: string; // "@usuario" or "Arroba indisponível"
  handleAvailable?: boolean; // true when real uniqueId was present in event
  nickname: string;
  avatarUrl?: string;
  giftId: number;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  deltaCount: number;
  coinsGranted: number;
  ruleIdApplied: string;
  rateApplied: number;
  repeatEnd: boolean;
  groupId: string;
  receivedAt: number;
  persistedAt?: number;
  sequenceNumber?: number; // Sequential durable SSE outbox number per sessionId
  persistenceStatus?: GiftPersistenceStatus;
  ticketNumbers?: number[];
  diagnosticTraceId?: string; // Correlated trace ID for LIVE EVENT DEBUGGER
  sseSeqId?: number;
  captureToFeedLatencyMs?: number;
  serverReceiveLatencyMs?: number;
  processingLatencyMs?: number;
  persistenceLatencyMs?: number;
  sseDeliveryLatencyMs?: number;
  browserRenderLatencyMs?: number;
  totalEndToEndLatencyMs?: number;
}

export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  last: number;
  samples: number;
}

export type ComponentHealthStatus = 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'ERROR' | 'UNKNOWN';

export type MonitoredComponentId =
  | 'tiktok_webcast'
  | 'tiktok_live_adapter'
  | 'event_bus'
  | 'processing_queue'
  | 'tiktok_live_service'
  | 'firestore'
  | 'sse_channel'
  | 'frontend_react'
  | 'ticket_persistence';

export interface ComponentDiagnosticEntry {
  id: MonitoredComponentId;
  name: string;
  status: ComponentHealthStatus;
  verifiedAt: number;
  reason: string;
  metrics?: Record<string, string | number | boolean>;
}

export interface EventLossStageEntry {
  stage:
    | 'NOT_RECEIVED_BY_SERVER'
    | 'RECEIVED_NOT_ENQUEUED'
    | 'ENQUEUED_NOT_PROCESSED'
    | 'PROCESSED_NOT_PERSISTED'
    | 'PERSISTED_NOT_TRANSMITTED_SSE'
    | 'TRANSMITTED_NOT_APPLIED_BROWSER';
  label: string;
  count: number;
  inFlightCount: number;
  status: 'OK' | 'IN_FLIGHT' | 'WARNING' | 'LOSS_DETECTED' | 'UNVERIFIABLE_AT_ORIGIN';
  explanation: string;
  lastDetectedAt?: number | null;
}

export interface DurableSseOutboxEvent {
  sessionId: string;
  sequenceNumber: number; // Sequential and durable per sessionId (1, 2, 3...)
  sseEventId: string; // Transport event_id: `${sessionId}:${sequenceNumber}`
  eventId: string; // Canonical gift eventId
  eventKey: string;
  eventType: 'gift_persisted' | 'member' | 'status';
  receivedAt: number; // UTC timestamp (ms) when server received the event
  persistedAt: number; // UTC timestamp (ms) when Firestore confirmed persistence
  transmittedAt?: number; // UTC timestamp (ms) when SSE transmitted the event
  confirmedByBrowserAt?: number; // UTC timestamp (ms) when browser confirmed application
  senderId: string; // Stable TikTok user ID
  giftId: number;
  transactionId?: string;
  serverReceiveLatencyMs: number;
  processingLatencyMs: number;
  persistenceLatencyMs: number;
  sseDeliveryLatencyMs?: number;
  browserRenderLatencyMs?: number;
  totalEndToEndLatencyMs?: number;
  payload: {
    event: TikTokLiveGiftEvent;
    ticketNumbers: number[];
    newTickets: number;
    carryover: number;
    totalCoinsInSession: number;
  };
}

export interface ClientSseCursorRecord {
  clientId: string;
  sessionId: string;
  lastSentSequenceNumber: number;
  lastConfirmedSequenceNumber: number;
  connectedAt: number;
  lastAckAt?: number;
  disconnectedAt?: number | null;
  reconnectCount: number;
  userAgent?: string;
}

export interface TimeSeriesMetricPoint {
  timestamp: number;
  receivedEps: number;
  processedEps: number;
  persistedEps: number;
  transmittedEps: number;
  p50EndToEndMs: number;
  p95EndToEndMs: number;
  p99EndToEndMs: number;
  p95PersistenceMs: number;
  queuePending: number;
}

export interface ReconnectHistoryEntry {
  id: string;
  source: 'TIKTOK_WEBCAST' | 'SSE_CLIENT';
  sessionId: string;
  clientId?: string;
  timestamp: number;
  reason: string;
  recoveredEventsCount?: number;
  lastConfirmedSequenceNumber?: number;
  outOfRetentionFullSync?: boolean;
}

export interface MonitorErrorLogEntry {
  id: string;
  timestamp: number;
  component: MonitoredComponentId;
  severity: 'warning' | 'error';
  message: string;
  sessionId?: string;
  eventId?: string;
  attempts?: number;
}

export interface MilestoneEventSummary {
  sequenceNumber?: number;
  sseEventId?: string;
  eventId: string;
  eventKey: string;
  sessionId: string;
  senderId: string;
  displayHandle: string;
  giftId: number;
  giftName: string;
  coinsGranted: number;
  repeatCount: number;
  ticketNumbers: number[];
  receivedAt: number;
  persistedAt?: number;
  deliveredAt?: number;
  confirmedByBrowserAt?: number;
  latencyMs?: number;
}

export interface LiveSystemMonitorSnapshot {
  sessionId: string;
  roomUsername: string;
  connectionState: TikTokConnectionState;
  liveUptimeMs: number;
  updatedAt: number;
  clockInfo: {
    durationClock: 'MONOTONIC_PERFORMANCE_NOW';
    auditTimestampFormat: 'UTC_EPOCH_MS';
  };
  rates: {
    receivedEps: number;
    processedEps: number;
    persistedEps: number;
    transmittedEps: number;
    peakReceivedEps: number;
  };
  totals: {
    receivedEvents: number;
    processedEvents: number;
    persistedEvents: number;
    transmittedEvents: number;
    confirmedByBrowserEvents: number;
    pendingInQueue: number;
    oldestPendingAgeMs: number;
    retryingInQueue: number;
    persistenceFailures: number;
    technicalRetransmissionsDetected: number;
    tiktokReconnects: number;
    sseReconnects: number;
  };
  latencies: {
    serverReceive: LatencyPercentiles;
    processing: LatencyPercentiles;
    firestorePersistence: LatencyPercentiles;
    sseDelivery: LatencyPercentiles;
    browserRender: LatencyPercentiles;
    totalEndToEnd: LatencyPercentiles;
  };
  components: ComponentDiagnosticEntry[];
  lossClassification: EventLossStageEntry[];
  milestones: {
    lastEventReceived: MilestoneEventSummary | null;
    lastEventPersisted: MilestoneEventSummary | null;
    lastEventDeliveredToBrowser: MilestoneEventSummary | null;
    lastEventConfirmedByBrowser: MilestoneEventSummary | null;
  };
  sseRecovery: {
    retentionMaxEventsPerSession: number;
    retentionWindowMs: number;
    sessionMinRetainedSequence: number;
    sessionLatestSequence: number;
    activeClients: ClientSseCursorRecord[];
  };
  queueItems: {
    walId: string;
    eventId: string;
    sessionId: string;
    displayHandle: string;
    giftName: string;
    coinsGranted: number;
    status: 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'FAILED';
    attempts: number;
    enqueuedAt: number;
    ageMs: number;
    sequenceNumber?: number;
    lastError?: string;
  }[];
  timeSeries: TimeSeriesMetricPoint[];
  reconnectHistory: ReconnectHistoryEntry[];
  recentErrors: MonitorErrorLogEntry[];
}

export interface TikTokDiagnosticAlert {
  id: string;
  severity: 'warning' | 'error' | 'info';
  code: 'QUEUE_BACKLOG' | 'HIGH_PERSIST_LATENCY' | 'HIGH_DISPLAY_LATENCY' | 'CONNECTION_DROP' | 'PERSISTENCE_ERROR';
  message: string;
  timestamp: number;
}

export interface TikTokPerformanceDiagnostics {
  connectionState: TikTokConnectionState;
  roomUsername: string;
  sessionId: string;
  liveUptimeMs: number;
  eventsPerSecond: number;
  peakEventsPerSecond: number;
  totalReceivedEvents: number;
  totalProcessedEvents: number;
  totalPersistedEvents: number;
  totalPendingEvents: number;
  duplicatesBlocked: number;
  queueSize: number;
  oldestPendingAgeMs: number;
  captureToDisplayLatency: LatencyPercentiles;
  captureToPersistenceLatency: LatencyPercentiles;
  reconnectCount: number;
  errorsAndFailuresCount: number;
  lastErrorMessage?: string | null;
  lastEventReceived?: {
    eventKey: string;
    eventId: string;
    displayHandle: string;
    giftName: string;
    coinsGranted: number;
    repeatCount: number;
    receivedAt: number;
  } | null;
  lastEventConfirmed?: {
    eventKey: string;
    eventId: string;
    displayHandle: string;
    giftName: string;
    coinsGranted: number;
    ticketNumbers: number[];
    confirmedAt: number;
    persistenceLatencyMs: number;
  } | null;
  activeSseClients: number;
  lastSseSeqId: number;
  walPendingCount: number;
  alerts: TikTokDiagnosticAlert[];
  monitorSnapshot?: LiveSystemMonitorSnapshot;
  updatedAt: number;
}

export interface TikTokLiveStreak {
  streakKey: string; // ${tiktokUserId}_${giftId}_${groupId} (or cycle-scoped)
  sessionId: string;
  tiktokUserId: string;
  giftId: number;
  groupId: string;
  lastProcessedRepeatCount: number;
  totalCoins: number;
  status: 'IN_PROGRESS' | 'COMPLETED';
  updatedAt: number;
}

export interface TikTokLiveParticipant {
  tiktokUserId: string; // Stable primary key
  sessionId: string;
  username: string;
  displayHandle?: string;
  handleAvailable?: boolean;
  nickname: string;
  avatarUrl?: string;
  coinsInSession: number;
  ticketsInSession: number;
  carryoverCoins: number;
  lastGiftAt: number;
}

export interface TikTokGlobalParticipant {
  tiktokUserId: string; // Stable primary ID
  currentUsername: string;
  currentNickname: string;
  currentAvatarUrl?: string;
  totalCoinsLifetime: number;
  totalTicketsLifetime: number;
  sessionsCount: number;
  updatedAt: number;
}

export interface TikTokGlobalSessionRecord {
  sessionId: string;
  coinsContributed: number;
  ticketsIssued: number;
  participatedAt: number;
}

export interface TikTokTicket {
  ticketId: string; // ${sessionId}_t_${ticketNumber}
  ticketNumber: number;
  sessionId: string;
  tiktokUserId: string;
  username: string;
  nickname: string;
  ruleId: string;
  rateAtCreation: number;
  issuedAt: number;
}

export interface TicketBatchRecord {
  batchId: string;
  sessionId: string;
  tiktokUserId: string;
  startTicket: number;
  endTicket: number;
  totalTicketsInBatch: number;
  status: 'PENDING' | 'COMMITTED';
  createdAt: number;
}

// ==========================================
// SPECIAL CAMPAIGNS (MULTI-LIVE RAFFLE)
// ==========================================

export type CampaignStatus = 'OPEN' | 'FROZEN' | 'COMPLETED';

export type CampaignMode = 'SINGLE_DRAW' | 'RECURRING_RESET' | 'RECURRING_CUMULATIVE';

export type DeliveryStatus =
  | 'PENDING_CONTACT'
  | 'CONTACTED'
  | 'DELIVERED'
  | 'UNCLAIMED_EXPIRED'
  | 'REDRAWN';

export interface DeliveryAuditEntry {
  drawId: string;
  previousStatus: DeliveryStatus;
  newStatus: DeliveryStatus;
  timestamp: number;
  operatorUid: string;
  reason: string;
  method?: string;
  referenceDrawId?: string;
}

export interface DeliveryDetails {
  updatedAt: number;
  updatedByUid: string;
  contactMethod?: string;
  notes?: string;
  deliveryProofUrl?: string;
  trackingCode?: string;
  recipientConfirmedAt?: number | null;
}

export interface OrganizerRaffleDefaults {
  uid?: string;
  defaultRaffleTitle: string;
  defaultPrizeName: string;
  coinsPerTicket: number;
  defaultRate?: number;
  minCoinsPerGift: number;
  defaultMinCoinsPerGift?: number;
  maxTicketsPerUser: number | null;
  defaultMaxTicketsPerUser?: number | null;
  maxTotalTickets: number | null;
  defaultMaxTotalTickets?: number | null;
  eligibilityRuleDefault?: 'ALL_TICKETS' | 'CUTOFF_TIMESTAMP' | 'CAMPAIGN_WINDOW';
  allowDuplicateWinners: boolean;
  defaultParticipationRulesNotes?: string;
  updatedAt: number;
}

export interface CampaignCycleRecord {
  cycleId: string; // Determinístico: campaign_${campaignId}_cycle_${cycleIndex}
  campaignId: string;
  cycleIndex: number;
  status: 'OPEN' | 'FROZEN' | 'DRAWN' | 'COMPLETED';
  startDate: number;
  closedAt?: number | null;
  drawId?: string | null;
  prizeName: string;
  winnerUsername?: string | null;
  winnerTiktokUserId?: string | null;
  winningTicketNumber?: number | null;
  deliveryStatus: DeliveryStatus;
  ticketsCount?: number;
  createdAt: number;
  updatedAt: number;
}

export type CampaignLegalStatus =
  | 'Pendente de análise'
  | 'Documentação pendente'
  | 'Aguardando autorização'
  | 'Autorizada, após validação documental'
  | 'Não autorizada'
  | 'Encerrada';

export interface Campaign {
  campaignId: string;
  ownerUid?: string;
  ownerAuditNote?: string;
  migratedOwnerAt?: number;
  title: string;
  description: string;
  status: CampaignStatus;
  campaignMode?: CampaignMode; // 'SINGLE_DRAW' | 'RECURRING_RESET' | 'RECURRING_CUMULATIVE'
  currentCycleIndex?: number;
  activeCycleId?: string;
  pendingDeliveryCount?: number; // Bloqueia abertura automática de ciclo se > 0
  allowDuplicateWinners?: boolean; // Permite ou bloqueia ganhador repetido entre ciclos cumulativos
  startDate: number;
  cutoffDate: number;
  closedAt?: number | null;
  prizeName: string;
  defaultRate?: number;
  maxTicketsPerUser?: number | null;
  maxTotalTickets?: number | null;
  eligibilityRuleDefault?: 'ALL_TICKETS' | 'CUTOFF_TIMESTAMP' | 'CAMPAIGN_WINDOW';
  rulesSummary?: string;
  totalAccumulatedTickets: number;
  participatingSessionIds: string[];
  latestSnapshotId?: string | null;
  createdAt: number;
  updatedAt?: number;
  // Fase 9: Individual Campaign Regulation & Legal Status fields
  legalStatus?: CampaignLegalStatus;
  organizerName?: string;
  modality?: string;
  eligibilityRules?: string;
  ticketEmissionCriteria?: string;
  drawMethodDescription?: string;
  resultsDisclosureChannel?: string;
  contestationProcedure?: string;
  authorizationDocumentation?: string;
  regulationVersion?: string;
}

export interface CampaignSession {
  sessionId: string;
  sessionTitle: string;
  addedAt: number;
  eligibilityRule: 'ALL_TICKETS' | 'CUTOFF_TIMESTAMP' | 'CAMPAIGN_WINDOW';
  cutoffTimestamp?: number | null;
  indexedTicketsCount: number;
}

export interface CampaignTicket {
  campaignTicketId: string; // ${campaignId}_${originalTicketId}
  campaignId: string;
  originalTicketId: string;
  originalSessionId: string;
  originalTicketNumber: number;
  tiktokUserId: string;
  username: string;
  nickname: string;
  indexedAt: number;
}

export interface DrawSnapshot {
  snapshotId: string;
  ownerUid?: string;
  ownerAuditNote?: string;
  migratedOwnerAt?: number;
  targetType: 'SESSION' | 'CAMPAIGN';
  targetId: string; // sessionId or campaignId
  totalEligibleTickets: number;
  frozenAt: number;
  rosterSha256Hash: string;
  maxTicketNumberFrozen: number;
  totalChunks: number;
}

export interface SnapshotTicketEntry {
  ticketNumber: number;
  ticketId: string;
  tiktokUserId: string;
  username: string;
  sessionId: string;
  issuedAt: number;
}

export interface DrawSnapshotChunk {
  chunkIndex: number;
  startIndex: number;
  endIndex: number;
  tickets: SnapshotTicketEntry[];
}

export interface LiveDrawRecord {
  drawId: string;
  ownerUid?: string;
  ownerAuditNote?: string;
  migratedOwnerAt?: number;
  drawType: 'INDIVIDUAL_LIVE' | 'CAMPAIGN';
  targetSessionId?: string;
  targetId?: string;
  campaignId?: string;
  cycleId?: string;
  snapshotId: string;
  frozenRosterHash: string;
  seedCommitment: string;
  seedRevealed: string;
  winningTicketNumber: number;
  winningTicketId: string;
  winnerTiktokUserId: string;
  winnerName: string;
  winnerSessionId?: string;
  prizeName: string;
  drawnAt: number;
  deliveryStatus?: DeliveryStatus;
  deliveryDetails?: DeliveryDetails;
  deliveryAuditTrail?: DeliveryAuditEntry[];
  parentDrawId?: string;
  redrawnAsDrawId?: string;
  excludedPreviousWinnerUids?: string[];
}

export interface TicketRuleVersion {
  ruleId: string;
  version: number;
  name: string;
  coinsPerTicket: number;
  minCoinsPerGift?: number;
  maxTicketsPerUser?: number | null;
  maxTotalTickets?: number | null;
  active: boolean;
  createdAt: number;
}

export type SubscriptionPlanTier = 'FREE' | 'PRO';

export type SubscriptionStatusState =
  | 'FREE'
  | 'PENDING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED';

export type TikTokLiveTicket = TikTokTicket;

export interface ProPlanEntitlement {
  tier: SubscriptionPlanTier;
  planTier: SubscriptionPlanTier;
  statusState?: SubscriptionStatusState;
  billingSubStatus?: SubscriptionBillingSubStatus;
  ownerUid?: string;
  active: boolean;
  organizerEmail?: string;
  updatedAt: number;
  features: {
    liveConnection: boolean;
    giftCapture: boolean;
    automaticAccounting: boolean;
    atomicTicketIssuance: boolean;
    accumulatedCampaigns: boolean;
  };
}

export interface AuditLogEntry {
  logId: string;
  timestamp: number;
  actor: string;
  category:
    | 'LIVE_EVENT'
    | 'STREAK'
    | 'CAMPAIGN'
    | 'DRAW'
    | 'CONNECTION'
    | 'RATE_RULE'
    | 'MANUAL_EDIT'
    | 'PLAN_VALIDATION'
    | 'LEGAL'
    | 'LGPD'
    | 'COOKIE';
  action: string;
  details: Record<string, unknown>;
}

export type LegalDocumentSlug =
  | 'sobre-nos'
  | 'termos-de-uso'
  | 'politica-de-privacidade'
  | 'politica-de-cookies'
  | 'politica-de-assinaturas-e-pagamentos'
  | 'politica-de-cancelamento-e-reembolso'
  | 'regulamento-de-sorteios-e-campanhas'
  | 'politica-antifraude'
  | 'politica-de-exclusao-de-conta-e-dados'
  | 'aviso-de-independencia-do-tiktok'
  | 'aviso-legal-e-isencao-de-responsabilidade'
  | 'politica-de-uso-aceitavel'
  | 'politica-de-seguranca'
  | 'central-de-ajuda'
  | 'contato-e-suporte';

export interface LegalDocumentSection {
  id: string;
  title: string;
  content: string;
}

export interface LegalDocument {
  id: LegalDocumentSlug;
  slug: LegalDocumentSlug;
  title: string;
  subtitle: string;
  category: 'PLATAFORMA' | 'SUPORTE' | 'LEGAL' | 'TRANSPARENCIA';
  version: string;
  publishedAt: number;
  updatedAt: number;
  effectiveAt: number;
  isMandatoryAcceptance: boolean;
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  summary: string;
  sections: LegalDocumentSection[];
  relatedSlugs: LegalDocumentSlug[];
  draftContent?: {
    version: string;
    summary: string;
    sections: LegalDocumentSection[];
    savedAt: number;
  } | null;
}

export interface LegalDocumentVersion {
  versionId: string;
  documentId: LegalDocumentSlug;
  version: string;
  title: string;
  summary: string;
  sections: LegalDocumentSection[];
  publishedAt: number;
  effectiveAt: number;
  publishedBy: string;
  archived: boolean;
}

export interface DocumentAcceptanceRecord {
  acceptanceId: string;
  userId: string;
  userEmail?: string;
  documentId: LegalDocumentSlug;
  version: string;
  acceptedAt: number;
  context: 'CADASTRO' | 'ATIVACAO_PRO' | 'ATUALIZACAO_TERMOS' | 'PAINEL_LEGAL';
  technicalEvidence: {
    userAgent: string;
    origin: string;
    timestampIso: string;
  };
}

export interface CookieConsentCategories {
  essential: boolean;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
}

export interface CookieConsentRecord {
  consentId: string;
  userId: string;
  noticeVersion: string;
  choiceType: 'ACCEPT_ALL' | 'REJECT_NON_ESSENTIAL' | 'CUSTOM';
  categories: CookieConsentCategories;
  decidedAt: number;
  userAgent?: string;
}

export type LgpdRequestType =
  | 'ACESSO_DADOS'
  | 'CORRECAO_DADOS'
  | 'EXCLUSAO_DADOS'
  | 'PORTABILIDADE'
  | 'REVOGACAO_CONSENTIMENTO'
  | 'INFORMACOES_COMPARTILHAMENTO';

export type LgpdRequestStatus =
  | 'RECEBIDA'
  | 'EM_ANALISE'
  | 'ATENDIDA'
  | 'PARCIALMENTE_ATENDIDA_RETENCAO_LEGAL'
  | 'REJEITADA_JUSTIFICADA';

export interface LgpdRequestRecord {
  requestId: string;
  protocol: string;
  userId: string;
  requesterName: string;
  requesterEmail: string;
  requestType: LgpdRequestType;
  description: string;
  status: LgpdRequestStatus;
  createdAt: number;
  updatedAt: number;
  adminResponse?: string;
  handledBy?: string;
}

export type SupportTicketCategory =
  | 'INTEGRACAO_TIKTOK'
  | 'SORTEIO_E_BILHETES'
  | 'CAMPANHAS_ACUMULADAS'
  | 'ASSINATURA_E_PAGAMENTO'
  | 'RELATO_DE_ERRO'
  | 'PRIVACIDADE_E_JURIDICO'
  | 'OUTROS';

export type SupportTicketStatus = 'ABERTO' | 'EM_ATENDIMENTO' | 'RESOLVIDO' | 'FECHADO';

export interface SupportTicketRecord {
  ticketId: string;
  protocol: string;
  userId: string;
  name: string;
  email: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  createdAt: number;
  updatedAt: number;
  adminReply?: string;
}

export interface CompanyLegalSettings {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  vatOrTaxId: string;
  enderecoEmpresarial: string;
  emailAtendimento: string;
  canalPrivacidade: string;
  representanteLegal: string;
  dpoEncarregado: string;
  telefoneOuContato: string;
  identificacaoOrganizador: string;
  updatedAt: number;
  updatedBy: string;
}

export type CommercialPlanId = 'pro_monthly' | 'pro_annual';

export type MercadoPagoRemoteStatus = 'pending' | 'authorized' | 'paused' | 'canceled' | 'cancelled';

export type SubscriptionBillingSubStatus =
  | 'FREE_TIER'
  | 'TRIAL_ACTIVE'
  | 'PAID_ACTIVE'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_REJECTED'
  | 'CANCELED_ACTIVE_UNTIL_END'
  | 'CANCELED'
  | 'TRIAL_ENDED';

export type MercadoPagoCheckoutFlowMode =
  | 'INDIVIDUAL_HOSTED_PREAPPROVAL'
  | 'ASSOCIATED_PLAN_TRANSPARENT_TOKEN';

export type MercadoPagoHomologationStatus =
  | 'PENDING_CREDENTIALS'
  | 'PENDING_EXECUTION'
  | 'VERIFIED'
  | 'FAILED_TRIAL_CHECK';

export interface OfficialSubscriptionPlanDefinition {
  planId: CommercialPlanId;
  name: string;
  price: number;
  currency: 'BRL';
  frequency: number;
  frequencyType: 'months';
  freeTrial: {
    frequency: 7;
    frequencyType: 'days';
  };
  monthlyEquivalent: number;
  annualSavingsAmount: number;
  annualDiscountPercent: number;
  priceVersion: string;
  mpPreapprovalPlanId?: string;
  mpPlanVerified?: boolean;
  mpPlanVerifiedAt?: number | null;
}

export interface HomologationStepResult {
  stepNumber: number;
  code: string;
  title: string;
  status: 'PASSED' | 'FAILED' | 'BLOCKED_PENDING_CREDENTIALS' | 'SKIPPED';
  details: string;
  evidence?: Record<string, unknown>;
  verifiedAt: number;
}

export interface MercadoPagoHomologationReport {
  status: MercadoPagoHomologationStatus;
  flowEvaluated: MercadoPagoCheckoutFlowMode;
  executedAgainstLiveApi: boolean;
  credentialsConfigured: boolean;
  isTestCredential: boolean;
  collectorTestUserVerified?: boolean;
  collectorSiteId?: string | null;
  trialConfirmedSevenDays: boolean;
  noImmediateChargeConfirmed: boolean;
  externalReferenceUidConfirmed: boolean;
  canceledStopsFutureChargesConfirmed: boolean;
  contractingUnlocked: boolean;
  blockReason: string | null;
  steps: HomologationStepResult[];
  evaluatedAt: number;
}

export interface UserSubscriptionRecord {
  uid: string;
  email: string;
  emailVerified: boolean;
  planId: CommercialPlanId | null;
  planName: string;
  tier: SubscriptionPlanTier;
  statusState: SubscriptionStatusState;
  billingSubStatus: SubscriptionBillingSubStatus;
  mpPreapprovalId: string | null;
  mpPlanId: string | null;
  remoteMpStatus: MercadoPagoRemoteStatus | null;
  checkoutInitPoint: string | null;
  contractedPriceVersion: string;
  contractedAmount: number;
  currency: 'BRL';
  frequency: number;
  frequencyType: 'months';
  trialApplied: boolean;
  trialDaysGranted: number;
  trialStartDate: string | null;
  trialEndDate: string | null;
  firstPaymentDate: string | null;
  nextPaymentDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  hasUsedFreeTrial: boolean;
  firstTrialStartedAt: string | null;
  firstTrialPreapprovalId: string | null;
  firstTrialPlanId: CommercialPlanId | null;
  acceptedTermsVersion: string;
  acceptedAt: number | null;
  chargedQuantity: number;
  chargedAmount: number;
  updatedAt: number;
}

export interface CommercialSubscriptionConfig {
  planName: string;
  billingCycle: string;
  priceDisplay: string;
  currency: string;
  paymentMethodsInfo: string;
  renewalPolicy: string;
  cancellationPolicy: string;
  refundPolicySummary: string;
  delinquencyGracePeriodDays: number;
  configuredByAdmin: boolean;
  updatedAt: number;
  // Extended official recurring plans configuration (reusing /subscription_settings/commercial)
  monthlyPrice?: number;
  annualPrice?: number;
  freeTrialDays?: number;
  trialOfferEnabled?: boolean;
  priceVersion?: string;
  mpMonthlyPlanId?: string;
  mpAnnualPlanId?: string;
  mpPlansVerified?: boolean;
  mpPlansVerifiedAt?: number | null;
  activeCheckoutFlow?: MercadoPagoCheckoutFlowMode;
  mpHomologationStatus?: MercadoPagoHomologationStatus;
  mpHomologationReport?: MercadoPagoHomologationReport | null;
}


// ==========================================
// TIKTOK LIVE ADVANCED DIAGNOSTICS & EVENT DEBUGGER TYPES
// ==========================================

export type DiagnosticEventOrigin = 'LIVE_REAL' | 'SIMULATED_TEST';
export type DiagnosticTtlStatus = 'VERIFIED_ACTIVE' | 'PENDING_GCP_POLICY_SETUP' | 'UNKNOWN';

export interface DiagnosticStageA_RawPayload {
  rawPayload: Record<string, unknown>;
  originalEventType: string;
  receivedTimestamp: number;
  receivedTimestampIso: string;
  sanitizationApplied: boolean;
  sanitizedFieldsCount: number;
  sizeBytes: number;
  isTruncated: boolean;
}

export interface DiagnosticStageB_ExtractedIdentity {
  userId?: string;
  uniqueId?: string;
  nickname?: string;
  displayHandle?: string;
  avatarUrl?: string;
  handleAvailable: boolean;
  secUid?: string;
  candidateHandlesInspected: string[];
  candidateUserIdsInspected: string[];
  rawFieldsFound: string[];
  rawFieldsMissing: string[];
  isOAuthHostAccountExcluded: boolean;
}

export interface DiagnosticStageC_Normalization {
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
  normalizedAt: number;
}

export interface DiagnosticStageD_Deduplication {
  accepted: boolean;
  isDuplicate: boolean;
  reason: string;
  signatureUsed?: string;
  eventId?: string;
  streakKey?: string;
  isComboContinuation: boolean;
  isComboFinalization: boolean;
}

export interface DiagnosticStageE_Accounting {
  deltaCount: number;
  coinsGranted: number;
  ticketsGenerated: number;
  ticketNumbers?: number[];
  ruleIdApplied?: string;
  rateApplied?: number;
  accountedAt: number;
}

export interface DiagnosticStageF_Persistence {
  persistedToFirestore: boolean;
  firestoreDocId?: string;
  error?: string;
  serverReceiveLatencyMs?: number;
  processingLatencyMs?: number;
  persistenceLatencyMs?: number;
  totalTraceLatencyMs?: number;
  persistedAt?: number;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
}

export interface TikTokDiagnostic6Stages {
  traceId: string;
  sessionId: string;
  roomUsername: string;
  origin: DiagnosticEventOrigin;
  connectorVersion: string;
  timestamp: number;
  timestampIso: string;
  stageA: DiagnosticStageA_RawPayload;
  stageB: DiagnosticStageB_ExtractedIdentity;
  stageC: DiagnosticStageC_Normalization;
  stageD: DiagnosticStageD_Deduplication;
  stageE: DiagnosticStageE_Accounting;
  stageF: DiagnosticStageF_Persistence;
  expiresAt: number;
  ttlExpireAt?: any;
}

export interface TikTokDiagnosticStats {
  debugMasterEnvActive: boolean;
  debugRuntimeActive: boolean;
  activeEffective: boolean;
  firestoreTtlStatus: DiagnosticTtlStatus;
  ttlNotice: string;
  totalEventsCaptured: number;
  validGiftsProcessed: number;
  blockedDuplicatesCount: number;
  eventsWithHandleAvailable: number;
  eventsWithoutHandleAvailable: number;
  eventsWithoutSenderId: number;
  persistenceFailuresCount: number;
  comboEventsCount: number;
  inMemoryBufferSize: number;
  retentionHours: number;
  lastCapturedAt?: number;
}

export interface TikTokDiagnosticAuditEntry {
  id: string;
  action: 'ENABLE_DEBUG' | 'DISABLE_DEBUG' | 'CLEAR_BUFFER' | 'QUERY_EVENTS' | 'TOGGLE_REJECTED';
  adminUid: string;
  adminEmail: string;
  timestamp: number;
  details?: string;
}




