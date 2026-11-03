import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Radio,
  Sparkles,
  Trophy,
  Layers,
  Users,
  MessageSquare,
  Gift,
  Coins,
  Ticket,
  Play,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ExternalLink,
  ShieldCheck,
  FileSpreadsheet,
  Download,
  Plus,
  Eye,
  Info,
  Sliders,
  Pause,
  Square,
  History,
  UserCheck,
  Activity,
  Search,
  Lock,
  Crown,
  Settings,
  Check,
} from 'lucide-react';
import {
  TikTokLiveSession,
  TikTokLiveParticipant,
  TikTokLiveTicket,
  TikTokGlobalParticipant,
  TikTokGlobalSessionRecord,
  TikTokConnectionStatus,
  TikTokMemberPresenceEvent,
  TikTokLiveGiftEvent,
  TikTokLiveStreak,
  AuditLogEntry,
  LiveDrawRecord,
  Campaign,
  CampaignSession,
  DrawSnapshot,
  SnapshotTicketEntry,
  RaffleSettings,
  Winner,
  GiftPersistenceStatus,
  TikTokPerformanceDiagnostics,
  ProPlanEntitlement,
  SubscriptionPlanTier,
} from '../types.js';
import {
  getOrCreateLiveSession,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
  updateSessionConversionRate,
  updateLiveSessionConfigAndRules,
  fetchSessionParticipants,
  fetchSessionTickets,
  fetchGlobalParticipantHistory,
  pauseLiveSessionCollection,
  resumeLiveSessionCollection,
  endLiveSessionCollection,
  fetchAllLiveSessions,
  fetchSessionDraws,
  fetchSnapshotById,
  fetchRecentSessionEvents,
  fetchSessionStreaks,
  fetchRecentAuditLogs,
  getProPlanEntitlement,
  setProPlanTier,
} from '../utils/tiktokLiveService.js';
import {
  fetchCampaigns,
  fetchCampaignById,
  updateCampaignRulesConfig,
  addSessionToCampaign,
  freezeCampaignSnapshot,
  executeCampaignDraw,
  fetchCampaignDraws,
  fetchCampaignSessions,
} from '../utils/campaignService.js';
import { downloadTikTokLivePdfCertificate } from '../utils/pdfReport.js';
import { TikTokRaffle } from './TikTokRaffle.js';
import { TikTokLiveDrawModal } from './TikTokLiveDrawModal.js';
import { CampaignCreateModal } from './CampaignCreateModal.js';
import { LiveSystemMonitor } from './LiveSystemMonitor.js';
import {
  tiktokConnector,
  tiktokEventBus,
  eventBus,
  EventBus,
  processEvent,
  processAndPersistGiftEvent,
  DeduplicationStats,
  RawTikTokGiftMessage,
} from '../utils/tiktokConnector.js';

interface TikTokLiveManagerProps {
  settings: RaffleSettings;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenVictoryCard?: (winner: Winner) => void;
  isAdminAuthorized?: boolean;
  adminLabel?: string;
  initialProTab?: 'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor';
  initialPlatformMode?: 'live_pro' | 'traditional_comments';
}

export interface LiveFeedGiftItem {
  id: string;
  eventKey: string;
  eventId: string;
  dedupeKey?: string;
  tiktokUserId: string;
  username: string;
  displayHandle: string;
  handleAvailable: boolean;
  nickname: string;
  giftName: string;
  coins: number;
  tickets: number[];
  isStreak: boolean;
  repeatCount: number;
  deltaCount: number;
  timestamp: number;
  status: GiftPersistenceStatus;
  persistenceLatencyMs?: number;
}

const GiftFeedItemRow: React.FC<{ item: LiveFeedGiftItem }> = React.memo(({ item }) => {
  const isHandleValid =
    item.handleAvailable && item.username && item.username !== 'arroba_indisponivel';
  const handleLabel = isHandleValid
    ? `@${item.username}`
    : 'Usuário não identificado (Arroba indisponível)';
  const avatarInitial = isHandleValid ? item.username.charAt(0).toUpperCase() : '?';

  return (
    <div
      data-event-key={item.eventKey}
      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-1"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-rose-500 text-white font-bold flex items-center justify-center shrink-0">
          {avatarInitial}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-white truncate">
              {handleLabel}{' '}
              <span className="font-normal text-slate-400">({item.nickname})</span>
            </p>
            <span
              className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                item.status === 'CONFIRMED'
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                  : item.status === 'FAILED'
                  ? 'bg-rose-950/70 text-rose-300 border-rose-700/60'
                  : 'bg-cyan-950/70 text-cyan-300 border-cyan-700/60 animate-pulse'
              }`}
            >
              {item.status === 'CONFIRMED'
                ? 'Confirmado'
                : item.status === 'FAILED'
                ? 'Retentando'
                : 'Processando...'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5 flex-wrap">
            <span>enviou</span>
            <span className="font-bold text-rose-400">{item.giftName}</span>
            <span className="text-slate-300 font-mono">+{item.deltaCount || 1} un.</span>
            {item.isStreak && (
              <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-bold flex items-center gap-0.5">
                <Flame className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                combo {item.repeatCount}x
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <span className="font-mono font-bold text-amber-400">+{item.coins} moedas</span>
        {item.tickets.length > 0 ? (
          <p className="text-[10px] font-mono text-emerald-400 font-bold">
            Bilhetes #{item.tickets.slice(0, 6).join(', #')}
            {item.tickets.length > 6 ? ` (+${item.tickets.length - 6})` : ''}
          </p>
        ) : item.status === 'PENDING' ? (
          <p className="text-[10px] font-mono text-cyan-400/80">Calculando bilhetes...</p>
        ) : null}
      </div>
    </div>
  );
});
GiftFeedItemRow.displayName = 'GiftFeedItemRow';

export const TikTokLiveManager: React.FC<TikTokLiveManagerProps> = ({
  settings,
  soundEnabled,
  onToggleSound,
  onOpenVictoryCard,
  isAdminAuthorized = true,
  adminLabel = 'Organizador / Admin Autorizado',
  initialProTab = 'feed',
  initialPlatformMode = 'live_pro',
}) => {
  // Main mode toggle: 'live_pro' (default) vs 'traditional_comments'
  const [platformMode, setPlatformMode] = useState<'live_pro' | 'traditional_comments'>(initialPlatformMode);

  // Active sub-tab inside Live Pro
  const [activeProTab, setActiveProTab] = useState<'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor'>(initialProTab);

  useEffect(() => {
    setPlatformMode(initialPlatformMode);
  }, [initialPlatformMode]);

  useEffect(() => {
    setActiveProTab(initialProTab);
  }, [initialProTab]);

  // TikTok Live Connection State
  const [roomUsername, setRoomUsername] = useState('gioborelli');
  const [connectionStatus, setConnectionStatus] = useState<TikTokConnectionStatus>({
    state: 'DISCONNECTED',
    roomUsername: 'gioborelli',
    viewerCount: 0,
    totalGiftsReceived: 0,
    totalCoinsCollected: 0,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [probeResult, setProbeResult] = useState<{ isLive: boolean; message: string; viewerCount?: number } | null>(null);
  const [systemNotice, setSystemNotice] = useState<{ type: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null);
  const [oauthStatus, setOauthStatus] = useState<{
    status?: 'READY' | 'MISCONFIGURED';
    oauthConfigured: boolean;
    canInitiateAuthFlow?: boolean;
    clientKeyConfigured?: boolean;
    clientSecretConfigured?: boolean;
    encryptionKeyConfigured?: boolean;
    encryptionSelfTestPassed?: boolean;
    directWebcastAvailable: boolean;
    redirectUri?: string;
    configurationErrors?: string[];
    message?: string;
    activeSession?: boolean;
    sessionState?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'DISCONNECTED';
    authenticatedAt?: number | null;
  }>({ oauthConfigured: false, directWebcastAvailable: true, sessionState: 'DISCONNECTED' });
  const [oauthUser, setOauthUser] = useState<{
    open_id?: string;
    union_id?: string;
    display_name?: string;
    avatar_url?: string;
    username?: string;
    scope?: string;
    authenticatedAt?: number;
  } | null>(null);

  // Active Live Session State & All Recorded Sessions
  const [currentSessionId, setCurrentSessionId] = useState<string>(`live_${Date.now()}`);
  const [activeSession, setActiveSession] = useState<TikTokLiveSession | null>(null);
  const [allSessions, setAllSessions] = useState<TikTokLiveSession[]>([]);
  const [liveGiftsFeed, setLiveGiftsFeed] = useState<LiveFeedGiftItem[]>([]);
  const [memberPresenceFeed, setMemberPresenceFeed] = useState<TikTokMemberPresenceEvent[]>([]);
  const [sessionParticipants, setSessionParticipants] = useState<TikTokLiveParticipant[]>([]);
  const [sessionTickets, setSessionTickets] = useState<TikTokLiveTicket[]>([]);

  // PRO Plan Entitlement (validated on Backend)
  const [planEntitlement, setPlanEntitlement] = useState<ProPlanEntitlement>(() => getProPlanEntitlement());
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);

  // LIVE Raffle Configuration & Rules Form State
  const [editingRate, setEditingRate] = useState(false);
  const [newRateValue, setNewRateValue] = useState('100');
  const [raffleTitleInput, setRaffleTitleInput] = useState('Sorteio Oficial da LIVE');
  const [minCoinsPerGiftInput, setMinCoinsPerGiftInput] = useState('1');
  const [maxTicketsPerUserInput, setMaxTicketsPerUserInput] = useState('');
  const [maxTotalTicketsInput, setMaxTotalTicketsInput] = useState('');
  const [allowDuplicateWinnersInput, setAllowDuplicateWinnersInput] = useState(true);
  const [participationRulesNotesInput, setParticipationRulesNotesInput] = useState(
    'Moedas enviadas em presentes durante a transmissão convertem-se automaticamente em bilhetes numerados.'
  );
  const [isSavingSessionRules, setIsSavingSessionRules] = useState(false);

  // Participant & Ticket Search State (@usuário or #bilhete)
  const [participantSearchQuery, setParticipantSearchQuery] = useState('');

  // Motor 1 Draw State & History
  const [motor1Snapshot, setMotor1Snapshot] = useState<DrawSnapshot | null>(null);
  const [isFreezingMotor1, setIsFreezingMotor1] = useState(false);
  const [isMotor1DrawModalOpen, setIsMotor1DrawModalOpen] = useState(false);
  const [motor1PrizeInput, setMotor1PrizeInput] = useState('Prêmio Especial da LIVE');
  const [sessionDraws, setSessionDraws] = useState<LiveDrawRecord[]>([]);

  // Motor 2 Campaigns State & History
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCreateCampaignModalOpen, setIsCreateCampaignModalOpen] = useState(false);
  const [campaignSnapshot, setCampaignSnapshot] = useState<DrawSnapshot | null>(null);
  const [isCampaignDrawModalOpen, setIsCampaignDrawModalOpen] = useState(false);
  const [campaignDrawsMap, setCampaignDrawsMap] = useState<Record<string, LiveDrawRecord[]>>({});
  const [campaignSessionsMap, setCampaignSessionsMap] = useState<Record<string, CampaignSession[]>>({});
  const [sessionToLinkByCampaign, setSessionToLinkByCampaign] = useState<Record<string, string>>({});
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [editCampRateInput, setEditCampRateInput] = useState('10');
  const [editCampMaxUserInput, setEditCampMaxUserInput] = useState('');
  const [editCampMaxTotalInput, setEditCampMaxTotalInput] = useState('');
  const [editCampRulesInput, setEditCampRulesInput] = useState('');

  // Global Participants, Persisted Events, Streaks & Audit State
  const [selectedGlobalParticipant, setSelectedGlobalParticipant] = useState<{
    global: TikTokGlobalParticipant;
    participations: TikTokGlobalSessionRecord[];
  } | null>(null);
  const [persistedSessionEvents, setPersistedSessionEvents] = useState<TikTokLiveGiftEvent[]>([]);
  const [persistedSessionStreaks, setPersistedSessionStreaks] = useState<TikTokLiveStreak[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // EventBus Deduplication Stats & State
  const [dedupeStats, setDedupeStats] = useState<DeduplicationStats>({
    totalReceived: 0,
    duplicatesDropped: 0,
    uniqueProcessed: 0,
    cacheSize: 0,
  });
  const [lastDedupeAlert, setLastDedupeAlert] = useState<{
    type: 'duplicate' | 'success';
    message: string;
    transactionId: string;
    timestamp: number;
  } | null>(null);

  // Real-time Performance & Queue Diagnostics State (Admin Panel)
  const [perfDiagnostics, setPerfDiagnostics] = useState<TikTokPerformanceDiagnostics | null>(null);
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState<boolean>(true);
  const [isRecoveringQueue, setIsRecoveringQueue] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const giftPersistQueueRef = useRef<Promise<any>>(Promise.resolve());
  const localSendSeqRef = useRef<number>(0);
  const sseClientIdRef = useRef<string>(`gio_tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const sseClientSecretRef = useRef<string>(`sec_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`);
  const lastSseEventIdRef = useRef<string>('');
  const lastConfirmedSequenceRef = useRef<number>(0);
  const appliedSequenceNumbersRef = useRef<Set<number>>(new Set());
  const appliedEventKeysRef = useRef<Set<string>>(new Set());
  const isRecoveringSseRef = useRef<boolean>(false);
  const recoveryLiveBufferRef = useRef<any[]>([]);
  const sseReconnectAttemptRef = useRef<number>(0);
  const debouncedSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientLatencySamplesRef = useRef<{ display: number[]; persist: number[] }>({
    display: [],
    persist: [],
  });
  const pendingCaptureTimesRef = useRef<Map<string, number>>(new Map());

  // Check TikTok OAuth 2.0 server configuration & listen for popup callback messages
  useEffect(() => {
    fetch('/api/tiktok/auth/status')
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setOauthStatus(data);
          if (data.authenticated && data.user) {
            setOauthUser(data.user);
            if (data.user.username) {
              setRoomUsername(data.user.username);
            }
          }
        }
      })
      .catch(() => {});

    const ALLOWED_POPUP_ORIGINS = new Set([
      window.location.origin,
      'https://ais-dev-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app',
      'https://ais-pre-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app',
    ]);

    const handlePopupMessage = (event: MessageEvent) => {
      // Strictly validate message origin against authorized HTTPS domains
      if (!ALLOWED_POPUP_ORIGINS.has(event.origin)) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === 'tiktok') {
        const user = event.data.user || {};
        setOauthUser(user);
        if (user.username) {
          setRoomUsername(user.username);
        }
        setSystemNotice({
          type: 'success',
          text: `Conta TikTok autenticada via OAuth 2.0 (${user.display_name || user.open_id || 'Conectado'})!`,
        });
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR' && event.data?.provider === 'tiktok') {
        setSystemNotice({
          type: 'warning',
          text: `Aviso OAuth TikTok: ${event.data.error}`,
        });
      }
    };

    fetch('/api/tiktok/plan/status')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.tier) {
          setPlanEntitlement(data);
          setProPlanTier(data.tier);
        }
      })
      .catch(() => {});

    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, []);

  // Load / initialize active live session on Firestore + all recorded sessions, draws, events, streaks, tickets & audit logs
  const initOrRefreshSession = useCallback(async (sid: string, user: string) => {
    try {
      const sess = await getOrCreateLiveSession(sid, user, 100);
      setActiveSession(sess);
      setNewRateValue(String(sess.currentRate || 100));
      setRaffleTitleInput(sess.raffleTitle || sess.roomTitle || `Sorteio LIVE @${sess.username}`);
      setMotor1PrizeInput(sess.prizeName || 'Prêmio Especial da LIVE');
      setMinCoinsPerGiftInput(String(sess.minCoinsPerGift ?? 1));
      setMaxTicketsPerUserInput(
        sess.maxTicketsPerUser !== undefined && sess.maxTicketsPerUser !== null && sess.maxTicketsPerUser > 0
          ? String(sess.maxTicketsPerUser)
          : ''
      );
      setMaxTotalTicketsInput(
        sess.maxTotalTickets !== undefined && sess.maxTotalTickets !== null && sess.maxTotalTickets > 0
          ? String(sess.maxTotalTickets)
          : ''
      );
      setAllowDuplicateWinnersInput(sess.allowDuplicateWinners !== false);
      setParticipationRulesNotesInput(
        sess.participationRulesNotes ||
          'Moedas enviadas em presentes durante a transmissão convertem-se automaticamente em bilhetes numerados.'
      );

      const [parts, allSess, draws, events, streaks, logs, tickets] = await Promise.all([
        fetchSessionParticipants(sid),
        fetchAllLiveSessions(40),
        fetchSessionDraws(sid),
        fetchRecentSessionEvents(sid, 40),
        fetchSessionStreaks(sid),
        fetchRecentAuditLogs(30),
        fetchSessionTickets(sid, 600),
      ]);
      setSessionParticipants(parts);
      setAllSessions(allSess.length > 0 ? allSess : [sess]);
      setSessionDraws(draws);
      setPersistedSessionEvents(events);
      setPersistedSessionStreaks(streaks);
      setAuditLogs(logs);
      setSessionTickets(tickets);
    } catch (err) {
      console.warn('Notice loading session:', err);
    }
  }, []);

  useEffect(() => {
    initOrRefreshSession(currentSessionId, roomUsername);
  }, [currentSessionId, roomUsername, initOrRefreshSession]);

  // Load campaigns and their participating sessions + completed draws
  const refreshCampaigns = useCallback(async () => {
    try {
      const camps = await fetchCampaigns();
      setCampaigns(camps);
      if (selectedCampaign) {
        const updated = camps.find((c) => c.campaignId === selectedCampaign.campaignId);
        if (updated) setSelectedCampaign(updated);
      }

      const drawsEntries: Record<string, LiveDrawRecord[]> = {};
      const sessionsEntries: Record<string, CampaignSession[]> = {};
      await Promise.all(
        camps.slice(0, 15).map(async (c) => {
          const [cDraws, cSessions] = await Promise.all([
            fetchCampaignDraws(c.campaignId),
            fetchCampaignSessions(c.campaignId),
          ]);
          drawsEntries[c.campaignId] = cDraws;
          sessionsEntries[c.campaignId] = cSessions;
        })
      );
      setCampaignDrawsMap(drawsEntries);
      setCampaignSessionsMap(sessionsEntries);
    } catch (err) {
      console.warn('Error refreshing campaigns:', err);
    }
  }, [selectedCampaign]);

  useEffect(() => {
    refreshCampaigns();
  }, [refreshCampaigns]);

  /**
   * Process incoming gift events strictly through EventBus.
   * Extracts real sender identity (@usuario or explicit "Arroba indisponível" when absent),
   * filters out technical duplicate transaction IDs BEFORE triggering Firestore writes,
   * and serializes atomic ticket issuance so simultaneous gifts never collide.
   */
  const processGiftEventThroughEventBus = useCallback(
    async (rawEvent: Partial<RawTikTokGiftMessage> & Record<string, any>) => {
      const seq = ++localSendSeqRef.current;
      const userObj = rawEvent.user || rawEvent.fromUser || rawEvent.sender || {};

      const candidateHandles = [
        rawEvent.uniqueId,
        userObj.uniqueId,
        rawEvent.username,
        userObj.username,
      ];
      const invalidPlaceholders = new Set([
        'anonimo',
        'anônimo',
        'anonymous',
        'unknown',
        'anon',
        'anon_user',
        'apoiador_ao_vivo',
        'arroba_indisponivel',
        'indisponivel',
      ]);

      let cleanHandle = '';
      for (const cand of candidateHandles) {
        if (cand !== undefined && cand !== null) {
          const stripped = String(cand).trim().replace(/^@+/, '');
          if (stripped && !invalidPlaceholders.has(stripped.toLowerCase())) {
            cleanHandle = stripped;
            break;
          }
        }
      }

      const handleAvailable =
        rawEvent.handleAvailable !== undefined
          ? Boolean(rawEvent.handleAvailable) && cleanHandle.length > 0
          : cleanHandle.length > 0;
      const username = handleAvailable ? cleanHandle : 'arroba_indisponivel';
      const displayHandle =
        rawEvent.displayHandle ||
        (handleAvailable ? `@${cleanHandle}` : 'Usuário não identificado (Arroba indisponível)');

      const rawUserId = String(
        rawEvent.tiktokUserId ||
          userObj.userId ||
          userObj.id ||
          rawEvent.userId ||
          userObj.secUid ||
          rawEvent.secUid ||
          ''
      ).trim();

      const tiktokUserId =
        rawUserId && !invalidPlaceholders.has(rawUserId.toLowerCase())
          ? rawUserId
          : handleAvailable
          ? `u_${cleanHandle.toLowerCase()}`
          : `sem_id_${rawEvent.transactionId || rawEvent.eventId || `${Date.now()}_${seq}`}`;

      const rawNickname = String(rawEvent.nickname || userObj.nickname || '').trim();
      const nickname =
        rawNickname && !invalidPlaceholders.has(rawNickname.toLowerCase())
          ? rawNickname
          : handleAvailable
          ? cleanHandle
          : 'Usuário não identificado';

      const giftDetails = rawEvent.giftDetails || rawEvent.gift || {};
      const giftId = Number(rawEvent.giftId ?? giftDetails.giftId ?? 5655);
      const giftName = String(rawEvent.giftName || giftDetails.giftName || 'Rosa');
      const diamondCount = Math.max(1, Number(rawEvent.diamondCount ?? giftDetails.diamondCount ?? 1));
      const repeatCount = Math.max(1, Number(rawEvent.repeatCount || 1));
      const deltaCount = Math.max(1, Number(rawEvent.deltaCount || 1));
      const coinsGranted = Math.max(
        1,
        Number(rawEvent.coinsGranted ?? rawEvent.coins ?? deltaCount * diamondCount)
      );
      const repeatEnd = rawEvent.repeatEnd !== undefined ? Boolean(rawEvent.repeatEnd) : true;
      const groupId = String(rawEvent.groupId || `send_${tiktokUserId}_${giftId}_${seq}`);
      const streakKey = rawEvent.streakKey ? String(rawEvent.streakKey) : `${tiktokUserId}_${giftId}_${groupId}`;

      const rawOrigTs =
        rawEvent.originalTimestamp ??
        rawEvent.createTime ??
        rawEvent.common?.createTime ??
        rawEvent.sendTime ??
        undefined;
      const originalTimestamp =
        rawOrigTs !== undefined && rawOrigTs !== null && String(rawOrigTs).trim() !== '0'
          ? String(rawOrigTs).trim()
          : undefined;

      const giftPayload: RawTikTokGiftMessage = {
        transactionId: rawEvent.transactionId || rawEvent.msgId || rawEvent.messageId,
        eventId: rawEvent.eventId,
        eventKey: rawEvent.eventKey,
        technicalSignature: rawEvent.technicalSignature,
        ...(originalTimestamp ? { originalTimestamp } : {}),
        streakKey,
        sessionId: currentSessionId,
        tiktokUserId,
        username,
        displayHandle,
        handleAvailable,
        nickname,
        avatarUrl: rawEvent.avatarUrl || userObj.profilePictureUrl || '',
        giftId,
        giftName,
        diamondCount,
        repeatCount,
        deltaCount,
        coinsGranted,
        repeatEnd,
        groupId,
      };

      // 1. Resolve canonical deduplication key and exclusive visual eventKey for UI rendering
      const capturePerfT0 = performance.now();
      const dedupeKey = tiktokEventBus.resolveDeduplicationKey(giftPayload);
      const resolvedEventKey = giftPayload.eventKey || dedupeKey;
      giftPayload.eventKey = resolvedEventKey;
      pendingCaptureTimesRef.current.set(resolvedEventKey, capturePerfT0);

      // 2. Process event through EventBus: returns whether transaction is unique and needs to be persisted
      const isUnique = tiktokEventBus.processEvent(giftPayload);
      const displayLatMs = Math.max(0.1, Number((performance.now() - capturePerfT0).toFixed(2)));
      clientLatencySamplesRef.current.display.push(displayLatMs);
      if (clientLatencySamplesRef.current.display.length > 300) {
        clientLatencySamplesRef.current.display.shift();
      }

      if (!isUnique) {
        console.warn(
          `[TikTokLiveManager] Transação duplicada detectada (${dedupeKey}). Gravação no Firestore bloqueada.`
        );
        setDedupeStats(tiktokEventBus.getStats());
        setLastDedupeAlert({
          type: 'duplicate',
          transactionId: giftPayload.transactionId || dedupeKey,
          message: `Transação duplicada detectada (${giftPayload.transactionId || dedupeKey})! Gravação no Firestore bloqueada com sucesso pelo EventBus.`,
          timestamp: Date.now(),
        });
        return { persisted: false, isDuplicate: true };
      }

      // If persistence is already managed by the server durable queue (SSE stream), do NOT run a duplicate client transaction
      if (rawEvent.serverManagedPersistence) {
        setDedupeStats(tiktokEventBus.getStats());
        return { persisted: false, isDuplicate: false, serverManaged: true };
      }

      // 3. Unique client-initiated event: serialize persistence through queue so simultaneous gifts never collide
      const runPersistence = async () => {
        const persistOutcome = await tiktokEventBus.persistGiftEvent(giftPayload);
        setDedupeStats(tiktokEventBus.getStats());

        if (persistOutcome.persisted) {
          const persistLatMs = Math.max(1, Math.round(performance.now() - capturePerfT0));
          clientLatencySamplesRef.current.persist.push(persistLatMs);
          if (clientLatencySamplesRef.current.persist.length > 300) {
            clientLatencySamplesRef.current.persist.shift();
          }

          const issuedTickets = persistOutcome.result?.ticketNumbers || [];
          const grantedCoins = persistOutcome.result?.event?.coinsGranted ?? giftPayload.coinsGranted;
          const grantedDelta = persistOutcome.result?.event?.deltaCount ?? giftPayload.deltaCount;
          const newCarryover = persistOutcome.result?.carryover ?? 0;

          // Synchronize issued ticket numbers, exact coins, and CONFIRMED status onto the live feed item by its exclusive eventKey
          setLiveGiftsFeed((prev) =>
            prev.map((item) =>
              item.eventKey === resolvedEventKey || item.dedupeKey === dedupeKey
                ? {
                    ...item,
                    coins: grantedCoins,
                    deltaCount: grantedDelta,
                    tickets: issuedTickets,
                    status: 'CONFIRMED',
                    persistenceLatencyMs: persistLatMs,
                  }
                : item
            )
          );

          // Incremental update of activeSession & sessionParticipants (avoiding 4 full Firestore reads per gift!)
          setActiveSession((prev) =>
            prev
              ? {
                  ...prev,
                  totalCoins: (prev.totalCoins || 0) + grantedCoins,
                  totalGiftsCount: (prev.totalGiftsCount || 0) + grantedDelta,
                  currentTicketCounter: (prev.currentTicketCounter || 0) + issuedTickets.length,
                }
              : prev
          );

          setSessionParticipants((prev) => {
            const idx = prev.findIndex((p) => p.tiktokUserId === tiktokUserId);
            let updatedList: TikTokLiveParticipant[];
            if (idx >= 0) {
              updatedList = [...prev];
              const existing = updatedList[idx];
              updatedList[idx] = {
                ...existing,
                username: handleAvailable ? username : existing.username,
                displayHandle: handleAvailable ? displayHandle : existing.displayHandle,
                handleAvailable: handleAvailable || existing.handleAvailable,
                nickname: nickname || existing.nickname,
                coinsInSession: (existing.coinsInSession || 0) + grantedCoins,
                ticketsInSession: (existing.ticketsInSession || 0) + issuedTickets.length,
                carryoverCoins: newCarryover,
                lastGiftAt: Date.now(),
              };
            } else {
              updatedList = [
                ...prev,
                {
                  tiktokUserId,
                  sessionId: currentSessionId,
                  username,
                  displayHandle,
                  handleAvailable,
                  nickname,
                  avatarUrl: giftPayload.avatarUrl || '',
                  coinsInSession: grantedCoins,
                  ticketsInSession: issuedTickets.length,
                  carryoverCoins: newCarryover,
                  lastGiftAt: Date.now(),
                },
              ];
            }
            return updatedList.sort((a, b) => b.coinsInSession - a.coinsInSession);
          });

          setLastDedupeAlert({
            type: 'success',
            transactionId: giftPayload.transactionId || dedupeKey,
            message: `Presente de ${displayHandle} confirmado (${giftPayload.giftName} +${grantedDelta}x = +${grantedCoins} moedas${
              issuedTickets.length > 0 ? ` • Bilhetes #${issuedTickets.join(', #')}` : ''
            } • ${persistLatMs}ms)!`,
            timestamp: Date.now(),
          });

          // Debounced background reconciliation (runs at most once every 2.5s after bursts instead of 4 queries per gift)
          if (debouncedSyncTimerRef.current) {
            clearTimeout(debouncedSyncTimerRef.current);
          }
          debouncedSyncTimerRef.current = setTimeout(async () => {
            try {
              const [parts, sess, events, streaks] = await Promise.all([
                fetchSessionParticipants(currentSessionId),
                getOrCreateLiveSession(currentSessionId, roomUsername, 100),
                fetchRecentSessionEvents(currentSessionId, 40),
                fetchSessionStreaks(currentSessionId),
              ]);
              setSessionParticipants(parts);
              setActiveSession(sess);
              setPersistedSessionEvents(events);
              setPersistedSessionStreaks(streaks);
            } catch {}
          }, 2500);
        }
        return { persisted: true, isDuplicate: false, result: persistOutcome.result };
      };

      try {
        const queuedPromise = giftPersistQueueRef.current.then(runPersistence, runPersistence);
        giftPersistQueueRef.current = queuedPromise.catch(() => {});
        return await queuedPromise;
      } catch (err) {
        console.error('[TikTokLiveManager] Erro ao persistir presente:', err);
        throw err;
      }
    },
    [currentSessionId, roomUsername]
  );

  // Poll / refresh real-time server diagnostics for the Admin Panel
  const refreshDiagnostics = useCallback(async () => {
    try {
      const res = await fetch(`/api/tiktok/diagnostics?sessionId=${encodeURIComponent(currentSessionId)}`);
      if (res.ok) {
        const data = (await res.json()) as TikTokPerformanceDiagnostics;
        setPerfDiagnostics(data);
      }
    } catch {}
  }, [currentSessionId]);

  useEffect(() => {
    refreshDiagnostics();
    const timer = setInterval(refreshDiagnostics, 3000);
    return () => clearInterval(timer);
  }, [refreshDiagnostics]);

  // Handler: Recover Pending Queue & WAL
  const handleRecoverQueue = async () => {
    setIsRecoveringQueue(true);
    try {
      const res = await fetch('/api/tiktok/queue/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId }),
      });
      const data = await res.json();
      if (data.diagnostics) {
        setPerfDiagnostics(data.diagnostics);
      }
      await initOrRefreshSession(currentSessionId, roomUsername);
      setSystemNotice({
        type: 'success',
        text: `Recuperação concluída: ${data.walRecovered || 0} evento(s) do WAL e ${data.restoredStreaks || 0} combo(s) sincronizados com o Firestore!`,
      });
    } catch (err) {
      setSystemNotice({
        type: 'error',
        text: `Erro ao recuperar fila: ${(err as Error).message}`,
      });
    } finally {
      setIsRecoveringQueue(false);
    }
  };

  // Connect to EventBus and manage real-time event pipeline with optimistic display & SSE Last-Event-ID replay
  useEffect(() => {
    // 1. Subscribe to deduplicated unique gift events for the live UI feed (optimistic PENDING display)
    const unsubGift = tiktokEventBus.subscribe('gift', (event: any) => {
      const handleAvailable =
        event.handleAvailable !== undefined
          ? Boolean(event.handleAvailable)
          : Boolean(event.username && event.username !== 'arroba_indisponivel');
      const displayHandle =
        event.displayHandle || (handleAvailable ? `@${String(event.username).replace(/^@+/, '')}` : 'Arroba indisponível');
      const delta = Number(event.deltaCount || 1);

      const resolvedEventKey = String(
        event.eventKey ||
          event.dedupeKey ||
          `evt_${event.eventId || event.transactionId || event.streakKey}_r${event.repeatCount || 1}`
      );
      const resolvedEventId = String(event.eventId || event.transactionId || resolvedEventKey);
      const initialTickets = Array.isArray(event.ticketNumbers)
        ? event.ticketNumbers
        : Array.isArray(event.ticketsIssued)
        ? event.ticketsIssued
        : [];
      const initialStatus: GiftPersistenceStatus =
        event.persistenceStatus === 'CONFIRMED' || initialTickets.length > 0 ? 'CONFIRMED' : 'PENDING';

      setLiveGiftsFeed((prev) => {
        if (prev.some((existing) => existing.eventKey === resolvedEventKey)) {
          return prev;
        }
        return [
          {
            id: resolvedEventKey,
            eventKey: resolvedEventKey,
            eventId: resolvedEventId,
            dedupeKey: event.dedupeKey || resolvedEventKey,
            tiktokUserId: String(event.tiktokUserId || ''),
            username: String(event.username || 'arroba_indisponivel'),
            displayHandle,
            handleAvailable,
            nickname: String(event.nickname || displayHandle),
            giftName: String(event.giftName || 'Presente'),
            coins: Number(event.coinsGranted || event.coins || 1),
            tickets: initialTickets,
            isStreak: Number(event.repeatCount || 1) > 1,
            repeatCount: Number(event.repeatCount || 1),
            deltaCount: delta,
            timestamp: Number(event.originalTimestamp || event.receivedAt || Date.now()),
            status: initialStatus,
          },
          ...prev.slice(0, 99),
        ];
      });
      setDedupeStats(tiktokEventBus.getStats());
      setConnectionStatus((prev) => ({
        ...prev,
        totalGiftsReceived: prev.totalGiftsReceived + delta,
        totalCoinsCollected: prev.totalCoinsCollected + Number(event.coinsGranted || event.coins || 0),
      }));
    });

    // 2. Subscribe to duplicate dropped notifications
    const unsubDuplicate = tiktokEventBus.subscribe('duplicate_dropped', () => {
      setDedupeStats(tiktokEventBus.getStats());
    });

    // 3. Subscribe to connection state updates from WebSocket client
    const unsubState = tiktokEventBus.subscribe('connection_state', (state: any) => {
      setConnectionStatus((prev) => ({
        ...prev,
        state: state as TikTokConnectionStatus['state'],
      }));
    });

    // 4. Subscribe to room status updates
    const unsubStatus = tiktokEventBus.subscribe('status', (data: any) => {
      if (data) {
        setConnectionStatus((prev) => ({
          ...prev,
          roomUsername: data.roomUsername || prev.roomUsername,
          roomId: data.roomId || prev.roomId,
          roomTitle: data.roomTitle || prev.roomTitle,
          viewerCount: data.viewerCount !== undefined ? data.viewerCount : prev.viewerCount,
        }));
      }
    });

    // 5. Connect resilient single-instance SSE stream with Durable Outbox recovery, temporary live buffer,
    // ordered application, deduplication, and post-render cursor ACK
    let isDisposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const sendBrowserCursorAck = (sequenceNumber: number, eventId: string, recvMonoT0: number) => {
      if (!sequenceNumber || sequenceNumber <= 0) return;
      const scheduleFrame =
        typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame
          : (cb: () => void) => setTimeout(cb, 4);

      scheduleFrame(() => {
        if (isDisposed) return;
        const browserRenderLatencyMs = Math.max(0.05, Number((performance.now() - recvMonoT0).toFixed(2)));
        if (sequenceNumber > lastConfirmedSequenceRef.current) {
          lastConfirmedSequenceRef.current = sequenceNumber;
          lastSseEventIdRef.current = `${currentSessionId}:${sequenceNumber}`;
        }
        fetch('/api/tiktok/stream/ack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            clientId: sseClientIdRef.current,
            clientSecret: sseClientSecretRef.current,
            sequenceNumber,
            eventId,
            browserRenderLatencyMs,
          }),
        }).catch(() => {});
      });
    };

    const applyPersistedOutboxPayload = (data: any, recvMonoT0: number) => {
      const seqNum = Number(data.sequenceNumber || 0);
      const confirmedKey = String(data.eventKey || data.event?.eventKey || '');
      const confirmedEventId = String(data.eventId || data.event?.eventId || '');

      // Deduplicate already-applied sequenceNumber for this session
      if (seqNum > 0 && appliedSequenceNumbersRef.current.has(seqNum)) {
        return;
      }
      if (seqNum > 0) {
        appliedSequenceNumbersRef.current.add(seqNum);
      }
      if (confirmedKey) {
        appliedEventKeysRef.current.add(confirmedKey);
      }

      const issuedTickets: number[] = Array.isArray(data.ticketNumbers) ? data.ticketNumbers : [];
      const evObj = data.event || data;
      const grantedCoins = Number(data.coinsGranted ?? evObj.coinsGranted ?? 0);
      const grantedDelta = Number(data.deltaCount ?? evObj.deltaCount ?? 1);
      const persistLatencyMs = Number(data.persistenceLatencyMs || 0);

      setLiveGiftsFeed((prev) => {
        const existsIdx = prev.findIndex(
          (item) => item.eventKey === confirmedKey || item.eventId === confirmedEventId
        );
        if (existsIdx >= 0) {
          return prev.map((item, idx) =>
            idx === existsIdx
              ? {
                  ...item,
                  coins: grantedCoins || item.coins,
                  deltaCount: grantedDelta || item.deltaCount,
                  tickets: issuedTickets,
                  status: 'CONFIRMED',
                  persistenceLatencyMs: persistLatencyMs,
                }
              : item
          );
        }

        // If this event arrived during disconnect (replayed via Durable Outbox), insert it in chronological order!
        const handleAvailable =
          evObj.handleAvailable !== undefined
            ? Boolean(evObj.handleAvailable)
            : Boolean(evObj.username && evObj.username !== 'arroba_indisponivel');
        const displayHandle =
          evObj.displayHandle ||
          (handleAvailable ? `@${String(evObj.username).replace(/^@+/, '')}` : 'Arroba indisponível');

        const newItem: LiveFeedGiftItem = {
          id: confirmedKey || `evt_${confirmedEventId}`,
          eventKey: confirmedKey || `evt_${confirmedEventId}`,
          eventId: confirmedEventId,
          dedupeKey: confirmedKey,
          tiktokUserId: String(evObj.tiktokUserId || data.senderId || ''),
          username: String(evObj.username || 'arroba_indisponivel'),
          displayHandle,
          handleAvailable,
          nickname: String(evObj.nickname || displayHandle),
          giftName: String(evObj.giftName || 'Presente'),
          coins: grantedCoins || 1,
          tickets: issuedTickets,
          isStreak: Number(evObj.repeatCount || 1) > 1,
          repeatCount: Number(evObj.repeatCount || 1),
          deltaCount: grantedDelta,
          timestamp: Number(evObj.originalTimestamp || data.receivedAt || Date.now()),
          status: 'CONFIRMED',
          persistenceLatencyMs: persistLatencyMs,
        };
        return [newItem, ...prev.slice(0, 99)];
      });

      if (data.sessionId === currentSessionId) {
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                totalCoins: Math.max(
                  (prev.totalCoins || 0) + (data.replayed ? 0 : grantedCoins),
                  Number(data.totalCoinsInSession || 0)
                ),
                totalGiftsCount: (prev.totalGiftsCount || 0) + (data.replayed ? 0 : grantedDelta),
                currentTicketCounter: Math.max(
                  prev.currentTicketCounter || 0,
                  issuedTickets.length > 0 ? Math.max(...issuedTickets) : prev.currentTicketCounter || 0
                ),
              }
            : prev
        );

        if (debouncedSyncTimerRef.current) {
          clearTimeout(debouncedSyncTimerRef.current);
        }
        debouncedSyncTimerRef.current = setTimeout(async () => {
          try {
            const [parts, sess, events, streaks] = await Promise.all([
              fetchSessionParticipants(currentSessionId),
              getOrCreateLiveSession(currentSessionId, roomUsername, 100),
              fetchRecentSessionEvents(currentSessionId, 40),
              fetchSessionStreaks(currentSessionId),
            ]);
            setSessionParticipants(parts);
            setActiveSession(sess);
            setPersistedSessionEvents(events);
            setPersistedSessionStreaks(streaks);
          } catch {}
        }, 2000);
      }

      // Update cursor ONLY after successful application in client state!
      if (seqNum > 0) {
        sendBrowserCursorAck(seqNum, confirmedEventId, recvMonoT0);
      }
    };

    const flushRecoveryBufferInOrder = () => {
      if (recoveryLiveBufferRef.current.length === 0) return;
      const buffered = [...recoveryLiveBufferRef.current];
      recoveryLiveBufferRef.current = [];
      buffered.sort((a, b) => Number(a.data?.sequenceNumber || 0) - Number(b.data?.sequenceNumber || 0));
      for (const item of buffered) {
        applyPersistedOutboxPayload(item.data, item.recvMonoT0);
      }
    };

    const openSseConnection = () => {
      if (isDisposed) return;
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {}
      }

      const hasPriorCursor = lastConfirmedSequenceRef.current > 0 || Boolean(lastSseEventIdRef.current);
      if (hasPriorCursor) {
        isRecoveringSseRef.current = true;
      }

      const params = new URLSearchParams({
        clientId: sseClientIdRef.current,
        clientSecret: sseClientSecretRef.current,
        sessionId: currentSessionId,
      });
      if (lastConfirmedSequenceRef.current > 0) {
        params.set('lastConfirmedCursor', `${currentSessionId}:${lastConfirmedSequenceRef.current}`);
      } else if (lastSseEventIdRef.current) {
        params.set('lastEventId', lastSseEventIdRef.current);
      }

      const sse = new EventSource(`/api/tiktok/stream?${params.toString()}`);
      eventSourceRef.current = sse;

      sse.onopen = () => {
        sseReconnectAttemptRef.current = 0;
        // Release recovery buffer shortly after initial replay frames arrive
        setTimeout(() => {
          if (isRecoveringSseRef.current) {
            isRecoveringSseRef.current = false;
            flushRecoveryBufferInOrder();
          }
        }, 120);
      };

      sse.addEventListener('connected', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setConnectionStatus((prev) => ({
            ...prev,
            state: 'CONNECTED',
            roomUsername: data.roomUsername || prev.roomUsername,
            roomId: data.roomId,
            roomTitle: data.roomTitle,
            viewerCount: data.viewerCount || 0,
          }));
        } catch {}
      });

      sse.addEventListener('reconnecting', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setConnectionStatus((prev) => ({
            ...prev,
            state: 'RECONNECTING',
            warning: data.warning,
          }));
        } catch {}
      });

      sse.addEventListener('disconnected', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setConnectionStatus((prev) => ({
            ...prev,
            state: 'DISCONNECTED',
            disconnectReason: data.reason,
          }));
        } catch {}
      });

      sse.addEventListener('sync_required', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          isRecoveringSseRef.current = false;
          recoveryLiveBufferRef.current = [];
          if (data.latestSequence && Number.isFinite(Number(data.latestSequence))) {
            lastConfirmedSequenceRef.current = Number(data.latestSequence);
            lastSseEventIdRef.current = `${currentSessionId}:${data.latestSequence}`;
          }
          initOrRefreshSession(currentSessionId, roomUsername);
          setSystemNotice({
            type: 'warning',
            text:
              data.message ||
              'Cursor anterior fora da janela de retenção. O histórico intermediário não está mais disponível e o estado completo da sessão foi sincronizado.',
          });
        } catch {}
      });

      sse.addEventListener('gift', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const eventData = data.event || data;
          processGiftEventThroughEventBus({
            ...eventData,
            serverManagedPersistence: Boolean(data.serverManagedPersistence),
          }).catch((err) => {
            console.warn('Erro ao processar presente via EventBus:', err);
          });
        } catch {}
      });

      sse.addEventListener('gift_confirmed', (e: MessageEvent) => {
        const recvMonoT0 = performance.now();
        try {
          const data = JSON.parse(e.data);
          // If currently replaying missed events during reconnect and a new live (non-replayed) event arrives,
          // buffer it temporarily so recovered events are applied strictly first!
          if (isRecoveringSseRef.current && !data.replayed) {
            recoveryLiveBufferRef.current.push({ data, recvMonoT0 });
            return;
          }
          applyPersistedOutboxPayload(data, recvMonoT0);
        } catch {}
      });

      sse.addEventListener('diagnostics', (e: MessageEvent) => {
        try {
          const diag = JSON.parse(e.data) as TikTokPerformanceDiagnostics;
          if (diag) {
            setPerfDiagnostics(diag);
          }
        } catch {}
      });

      sse.addEventListener('member', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const memberEv = (data.event || data) as TikTokMemberPresenceEvent;
          if (memberEv && memberEv.username) {
            setMemberPresenceFeed((prev) => [memberEv, ...prev.slice(0, 19)]);
          }
        } catch {}
      });

      sse.onerror = () => {
        try {
          sse.close();
        } catch {}
        if (!isDisposed) {
          const attempt = sseReconnectAttemptRef.current;
          sseReconnectAttemptRef.current = Math.min(10, attempt + 1);
          const baseDelay = Math.min(15000, 1000 * Math.pow(1.8, attempt));
          const jitterDelay = Math.round(baseDelay * (0.85 + Math.random() * 0.3));
          reconnectTimer = setTimeout(openSseConnection, jitterDelay);
        }
      };
    };

    openSseConnection();

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      unsubGift();
      unsubDuplicate();
      unsubState();
      unsubStatus();
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch {}
      }
    };
  }, [processGiftEventThroughEventBus, currentSessionId, roomUsername, initOrRefreshSession]);

  // Handler: Pause LIVE Ticket Collection
  const handlePauseCollection = async () => {
    try {
      const updated = await pauseLiveSessionCollection(currentSessionId);
      setActiveSession(updated);
      await initOrRefreshSession(currentSessionId, roomUsername);
      setSystemNotice({
        type: 'warning',
        text: `Coleta de bilhetes da LIVE (${currentSessionId}) PAUSADA. Novos presentes não gerarão bilhetes até a retomada.`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao pausar coleta: ${(err as Error).message}` });
    }
  };

  // Handler: Resume LIVE Ticket Collection
  const handleResumeCollection = async () => {
    try {
      const updated = await resumeLiveSessionCollection(currentSessionId);
      setActiveSession(updated);
      await initOrRefreshSession(currentSessionId, roomUsername);
      setSystemNotice({
        type: 'success',
        text: `Coleta de bilhetes da LIVE (${currentSessionId}) RETOMADA!`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao retomar coleta: ${(err as Error).message}` });
    }
  };

  // Handler: End LIVE Ticket Collection
  const handleEndCollection = async () => {
    try {
      const updated = await endLiveSessionCollection(currentSessionId);
      setActiveSession(updated);
      await initOrRefreshSession(currentSessionId, roomUsername);
      setSystemNotice({
        type: 'info',
        text: `Coleta da transmissão (${currentSessionId}) ENCERRADA permanentemente. Os bilhetes emitidos permanecem prontos para sorteio.`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao encerrar coleta: ${(err as Error).message}` });
    }
  };

  // Handler: Start a brand new LIVE session
  const handleStartNewLiveSession = async () => {
    const newSid = `live_${Date.now()}`;
    setCurrentSessionId(newSid);
    setLiveGiftsFeed([]);
    setMotor1Snapshot(null);
    await initOrRefreshSession(newSid, roomUsername);
    setSystemNotice({
      type: 'success',
      text: `Nova sessão de transmissão criada (${newSid}) com numeração independente!`,
    });
  };

  // Handler: Probe TikTok Live
  const handleProbeLive = async () => {
    setProbeResult(null);
    const cleanUser = roomUsername.trim().replace(/^@/, '') || 'gioborelli';
    try {
      const res = await fetch(`/api/tiktok/probe/${encodeURIComponent(cleanUser)}`);
      const data = await res.json();
      setProbeResult({
        isLive: Boolean(data.isLive),
        message:
          data.message ||
          (data.isLive
            ? `Transmissão AO VIVO detectada para @${cleanUser}!`
            : `A conta @${cleanUser} não está em transmissão ao vivo neste momento (${data.error || 'offline'}).`),
        viewerCount: data.viewerCount,
      });
    } catch (err) {
      setProbeResult({ isLive: false, message: `Erro ao testar status: ${(err as Error).message}` });
    }
  };

  // Handler: Connect to TikTok Live using TikTokLiveConnector with exponential backoff
  const handleConnect = async () => {
    setIsConnecting(true);
    setSystemNotice(null);
    setConnectionStatus((prev) => ({ ...prev, state: 'CONNECTING', warning: null }));
    try {
      const cleanUser = roomUsername.trim().replace(/^@/, '') || 'gioborelli';
      const outcome = await tiktokConnector.connect(cleanUser, currentSessionId, {
        rate: activeSession?.currentRate || 100,
      });

      if (outcome.success) {
        setConnectionStatus((prev) => ({
          ...prev,
          state: 'CONNECTED',
          roomUsername: cleanUser,
          roomId: outcome.status?.roomId || prev.roomId,
          roomTitle: outcome.status?.roomTitle || prev.roomTitle,
          warning: null,
        }));
        setSystemNotice({
          type: 'success',
          text: `Conectado em tempo real à transmissão AO VIVO de @${cleanUser}!`,
        });
      } else {
        setConnectionStatus((prev) => ({
          ...prev,
          state: 'RECONNECTING',
          roomUsername: cleanUser,
          warning: `Escuta ativa para @${cleanUser}: a conta não está em LIVE neste instante (${outcome.error || 'aguardando início da transmissão'}). O conector reconectará automaticamente com backoff exponencial assim que a LIVE iniciar.`,
        }));
      }
    } catch (err) {
      setConnectionStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        warning: (err as Error).message,
      }));
    } finally {
      setIsConnecting(false);
    }
  };

  // Handler: TikTok OAuth 2.0 Login Kit Popup
  const handleTikTokOAuthLogin = async () => {
    setSystemNotice(null);
    try {
      const [statusRes, urlRes] = await Promise.all([
        fetch('/api/tiktok/auth/status'),
        fetch('/api/tiktok/auth/url'),
      ]);
      const statusData = await statusRes.json().catch(() => null);
      if (statusData) {
        setOauthStatus(statusData);
      }

      const data = await urlRes.json().catch(() => ({}));
      if (!urlRes.ok || !data.url) {
        setSystemNotice({
          type: 'info',
          text:
            data.error ||
            'OAuth 2.0 requer TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e OAUTH_ENCRYPTION_KEY (256 bits) configuradas no painel Secrets. A conexão direta via @username já está 100% funcional sem exigir senha.',
        });
        return;
      }
      window.open(data.url, 'tiktok_oauth_popup', 'width=600,height=720');
    } catch (err) {
      setSystemNotice({
        type: 'warning',
        text: `Não foi possível iniciar o fluxo OAuth: ${(err as Error).message}`,
      });
    }
  };

  // Handler: TikTok OAuth 2.0 Diagnostic Check (/api/tiktok/auth/status)
  const handleRunOAuthDiagnostic = async () => {
    setSystemNotice(null);
    try {
      const res = await fetch('/api/tiktok/auth/status');
      const data = await res.json();
      setOauthStatus(data);

      const ck = data.clientKeyConfigured ? 'OK' : 'AUSENTE';
      const cs = data.clientSecretConfigured ? 'OK' : 'AUSENTE';
      const ek = data.encryptionKeyConfigured ? 'OK (AES-256-GCM)' : 'AUSENTE/INVÁLIDA';
      const flow = data.canInitiateAuthFlow ? 'PRONTO PARA INICIAR' : 'PENDENTE';

      setSystemNotice({
        type: data.canInitiateAuthFlow ? 'success' : 'info',
        text: `Diagnóstico /api/tiktok/auth/status → TIKTOK_CLIENT_KEY: ${ck} | TIKTOK_CLIENT_SECRET: ${cs} | OAUTH_ENCRYPTION_KEY: ${ek} | Fluxo de Autorização: ${flow}. ${
          data.canInitiateAuthFlow
            ? `Redirect URI: ${data.redirectUri}`
            : (data.configurationErrors || []).join(' ')
        }`,
      });
    } catch (err) {
      setSystemNotice({
        type: 'error',
        text: `Erro ao consultar /api/tiktok/auth/status: ${(err as Error).message}`,
      });
    }
  };

  // Handler: TikTok OAuth 2.0 Logout & Revocation
  const handleTikTokOAuthLogout = async () => {
    setSystemNotice(null);
    try {
      await fetch('/api/tiktok/auth/logout', { method: 'POST' });
      setOauthUser(null);
      setSystemNotice({
        type: 'info',
        text: 'Sessão OAuth 2.0 revogada no TikTok e removida do banco de dados com segurança.',
      });
    } catch (err) {
      setSystemNotice({
        type: 'warning',
        text: `Erro ao revogar sessão OAuth: ${(err as Error).message}`,
      });
    }
  };

  // Handler: Download Full Safety Backup JSON
  const handleDownloadBackupJson = () => {
    const backupPayload = {
      exportedAt: new Date().toISOString(),
      sessionId: currentSessionId,
      roomUsername,
      activeSession,
      sessionParticipants,
      campaigns,
      deduplicationStats: dedupeStats,
    };
    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-giodasorte-${currentSessionId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setSystemNotice({
      type: 'success',
      text: 'Backup completo de segurança (JSON) exportado com sucesso!',
    });
  };

  // Handler: Disconnect from TikTok Live
  const handleDisconnect = async () => {
    try {
      await tiktokConnector.disconnect();
      setConnectionStatus((prev) => ({ ...prev, state: 'DISCONNECTED', warning: null }));
      setSystemNotice({
        type: 'info',
        text: 'Conexão com TikTok LIVE encerrada com segurança.',
      });
    } catch (err) {
      console.warn('Disconnect error:', err);
    }
  };

  // Handler: Switch / Validate PRO Plan Tier on the Backend
  const handleSwitchPlanTier = async (targetTier: SubscriptionPlanTier) => {
    setIsUpdatingPlan(true);
    try {
      const res = await fetch('/api/tiktok/plan/tier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
        },
        body: JSON.stringify({ tier: targetTier }),
      });
      const data = await res.json();
      if (data.entitlement) {
        setPlanEntitlement(data.entitlement);
        setProPlanTier(data.entitlement.tier);
      } else {
        const fallback = setProPlanTier(targetTier);
        setPlanEntitlement(fallback);
      }
      setSystemNotice({
        type: targetTier === 'PRO' ? 'success' : 'warning',
        text:
          data.message ||
          (targetTier === 'PRO'
            ? 'Plano TIKTOK LIVE PRO validado no backend.'
            : 'Plano alterado para FREE no backend. As automações LIVE foram bloqueadas.'),
      });
    } catch (err) {
      const fallback = setProPlanTier(targetTier);
      setPlanEntitlement(fallback);
      setSystemNotice({
        type: 'warning',
        text: `Plano atualizado localmente (${targetTier}): ${(err as Error).message}`,
      });
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  // Handler: Save Full LIVE Raffle Settings, Conversion Rate, Participation Rules & Limits
  const handleSaveSessionRulesAndConfig = async () => {
    const rate = parseInt(newRateValue, 10);
    if (!rate || rate <= 0) {
      setSystemNotice({ type: 'warning', text: 'Informe uma taxa válida de moedas enviadas por bilhete (ex: 10 ou 100).' });
      return;
    }
    const minCoins = Math.max(1, parseInt(minCoinsPerGiftInput, 10) || 1);
    const maxPerUser =
      maxTicketsPerUserInput.trim() !== '' && Number(maxTicketsPerUserInput) > 0
        ? Math.floor(Number(maxTicketsPerUserInput))
        : null;
    const maxTotal =
      maxTotalTicketsInput.trim() !== '' && Number(maxTotalTicketsInput) > 0
        ? Math.floor(Number(maxTotalTicketsInput))
        : null;

    setIsSavingSessionRules(true);
    try {
      await fetch('/api/tiktok/pro/session-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          raffleTitle: raffleTitleInput.trim() || `Sorteio LIVE @${roomUsername}`,
          prizeName: motor1PrizeInput.trim() || 'Prêmio Especial da LIVE',
          coinsPerTicket: rate,
          minCoinsPerGift: minCoins,
          maxTicketsPerUser: maxPerUser,
          maxTotalTickets: maxTotal,
          allowDuplicateWinners: allowDuplicateWinnersInput,
          participationRulesNotes: participationRulesNotesInput.trim(),
        }),
      }).catch(() => {});

      await updateLiveSessionConfigAndRules(currentSessionId, {
        raffleTitle: raffleTitleInput.trim() || `Sorteio LIVE @${roomUsername}`,
        prizeName: motor1PrizeInput.trim() || 'Prêmio Especial da LIVE',
        coinsPerTicket: rate,
        minCoinsPerGift: minCoins,
        maxTicketsPerUser: maxPerUser,
        maxTotalTickets: maxTotal,
        allowDuplicateWinners: allowDuplicateWinnersInput,
        participationRulesNotes: participationRulesNotesInput.trim(),
      });

      setEditingRate(false);
      await initOrRefreshSession(currentSessionId, roomUsername);
      setSystemNotice({
        type: 'success',
        text: `Configurações do Sorteio da LIVE salvas com sucesso (1 bilhete a cada ${rate} moedas enviadas • Mínimo: ${minCoins} moeda(s)${
          maxPerUser ? ` • Máx/usuário: ${maxPerUser}` : ''
        }${maxTotal ? ` • Teto da LIVE: ${maxTotal}` : ''})!`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao salvar configurações da LIVE: ${(err as Error).message}` });
    } finally {
      setIsSavingSessionRules(false);
    }
  };

  // Handler: Save Campaign Rules & Limits
  const handleSaveCampaignRules = async (campaignId: string) => {
    const rate = Math.max(1, parseInt(editCampRateInput, 10) || 10);
    const maxUser =
      editCampMaxUserInput.trim() !== '' && Number(editCampMaxUserInput) > 0
        ? Math.floor(Number(editCampMaxUserInput))
        : null;
    const maxTotal =
      editCampMaxTotalInput.trim() !== '' && Number(editCampMaxTotalInput) > 0
        ? Math.floor(Number(editCampMaxTotalInput))
        : null;

    try {
      await fetch('/api/tiktok/pro/campaign-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          defaultRate: rate,
          maxTicketsPerUser: maxUser,
          maxTotalTickets: maxTotal,
          rulesSummary: editCampRulesInput.trim(),
        }),
      }).catch(() => {});

      await updateCampaignRulesConfig(campaignId, {
        defaultRate: rate,
        maxTicketsPerUser: maxUser,
        maxTotalTickets: maxTotal,
        rulesSummary: editCampRulesInput.trim(),
      });
      setEditingCampaignId(null);
      await refreshCampaigns();
      setSystemNotice({
        type: 'success',
        text: 'Regras e limites da campanha acumulada salvos no Firestore!',
      });
    } catch (err) {
      setSystemNotice({
        type: 'error',
        text: `Erro ao salvar regras da campanha: ${(err as Error).message}`,
      });
    }
  };

  // Helper: Map participant -> issued ticket numbers (#1, #2...)
  const ticketsByParticipantMap = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const t of sessionTickets) {
      const list = map.get(t.tiktokUserId) || [];
      list.push(t.ticketNumber);
      map.set(t.tiktokUserId, list);
    }
    return map;
  }, [sessionTickets]);

  // Helper: Filter participants by @usuário, nickname, tiktokUserId, or #ticketNumber
  const filteredSessionParticipants = React.useMemo(() => {
    const q = participantSearchQuery.trim().toLowerCase();
    if (!q) return sessionParticipants;
    const cleanHandleQuery = q.replace(/^@+/, '');
    const ticketNumQuery = q.startsWith('#') ? parseInt(q.slice(1), 10) : /^\d+$/.test(q) ? parseInt(q, 10) : NaN;

    return sessionParticipants.filter((p) => {
      const uname = (p.username || '').toLowerCase();
      const nick = (p.nickname || '').toLowerCase();
      const uid = (p.tiktokUserId || '').toLowerCase();
      const userTickets = ticketsByParticipantMap.get(p.tiktokUserId) || [];
      const matchesTicket = Number.isFinite(ticketNumQuery) && userTickets.includes(ticketNumQuery);
      return (
        uname.includes(cleanHandleQuery) ||
        nick.includes(cleanHandleQuery) ||
        uid.includes(cleanHandleQuery) ||
        matchesTicket
      );
    });
  }, [sessionParticipants, participantSearchQuery, ticketsByParticipantMap]);

  // Handler: Freeze Motor 1 Snapshot
  const handleFreezeMotor1 = async () => {
    setIsFreezingMotor1(true);
    try {
      const snapshot = await createNonBlockingSessionSnapshot(currentSessionId);
      setMotor1Snapshot(snapshot);
      setIsMotor1DrawModalOpen(true);
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao congelar rodada: ${(err as Error).message}` });
    } finally {
      setIsFreezingMotor1(false);
    }
  };

  // Handler: Freeze Motor 2 Snapshot
  const handleFreezeCampaign = async (campaignId: string) => {
    try {
      const snapshot = await freezeCampaignSnapshot(campaignId);
      setCampaignSnapshot(snapshot);
      setIsCampaignDrawModalOpen(true);
      await refreshCampaigns();
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao congelar lista da campanha: ${(err as Error).message}` });
    }
  };

  // Handler: Inspect global participant history
  const handleInspectParticipant = async (tiktokUserId: string) => {
    try {
      const history = await fetchGlobalParticipantHistory(tiktokUserId);
      if (history.global) {
        setSelectedGlobalParticipant(history as {
          global: TikTokGlobalParticipant;
          participations: TikTokGlobalSessionRecord[];
        });
      }
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao carregar histórico: ${(err as Error).message}` });
    }
  };

  // Handler: Export CSV of session participants & their individual ticket numbers
  const handleExportCsv = () => {
    if (sessionParticipants.length === 0) {
      setSystemNotice({ type: 'warning', text: 'Nenhum participante registrado nesta LIVE para exportar.' });
      return;
    }
    const headers = [
      'ID TikTok',
      'Usuário',
      'Apelido',
      'Moedas Enviadas na LIVE',
      'Qtd Bilhetes Emitidos',
      'Saldo Residual (Moedas)',
      'Números dos Bilhetes',
    ];
    const rows = sessionParticipants.map((p) => {
      const tNums = (ticketsByParticipantMap.get(p.tiktokUserId) || []).map((n) => `#${n}`).join(' ');
      return [
        p.tiktokUserId,
        `@${p.username}`,
        `"${p.nickname.replace(/"/g, '""')}"`,
        p.coinsInSession,
        p.ticketsInSession,
        p.carryoverCoins,
        `"${tNums}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `participantes-bilhetes-${currentSessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Platform Mode Selector — Official Logo + Sapphire-Blue, Metallic Red & Deep Dark Theme */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#050814] via-[#0A1128] to-[#0F172A] flex flex-col lg:flex-row lg:items-center justify-between gap-4 border border-[#E11D48]/35 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <img
            src="/logo.png"
            alt="GIO DA SORTE PRO"
            className="w-13 h-13 object-contain shrink-0 drop-shadow-[0_0_10px_rgba(225,29,72,0.4)]"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-display font-black text-white tracking-tight">
                GIO DA SORTE PRO — <span className="text-[#FDA4AF]">TIKTOK LIVE PRO</span>
              </h1>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-[#E11D48]/20 text-[#FDA4AF] border border-[#E11D48]/50">
                Automação Completa de Sorteios
              </span>
              <span
                className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${
                  planEntitlement.active
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50'
                    : 'bg-rose-950/80 text-rose-300 border-rose-600/50'
                }`}
              >
                {planEntitlement.active ? 'PLANO PRO ATIVO (BACKEND VALIDADO)' : 'PLANO FREE (BLOQUEADO)'}
              </span>
            </div>
            <p className="text-xs text-blue-100/80 mt-0.5">
              Contabilização automática de moedas enviadas em presentes via Webcast, emissão atômica de bilhetes e sorteio auditável SHA-256.
            </p>
          </div>
        </div>

        {/* Plan Validation Switcher & Mode Switcher Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center bg-[#050814] p-1 rounded-xl border border-[#E11D48]/30">
            <button
              onClick={() => handleSwitchPlanTier('PRO')}
              disabled={isUpdatingPlan}
              title="Valida e ativa as permissões do plano PRO no backend (/api/tiktok/plan/tier)"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                planEntitlement.tier === 'PRO'
                  ? 'bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white shadow-sm'
                  : 'text-slate-400 hover:text-[#FDA4AF]'
              }`}
            >
              <Crown className="w-3 h-3" />
              <span>Plano PRO</span>
            </button>
            <button
              onClick={() => handleSwitchPlanTier('FREE')}
              disabled={isUpdatingPlan}
              title="Testa o bloqueio de segurança do backend para contas no plano FREE"
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                planEntitlement.tier === 'FREE'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              <Lock className="w-3 h-3" />
              <span>Plano FREE</span>
            </button>
          </div>

          <div className="flex items-center bg-[#050814] p-1 rounded-xl border border-blue-900/60">
            <button
              onClick={() => setPlatformMode('live_pro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                platformMode === 'live_pro'
                  ? 'bg-gradient-to-r from-[#1E3A8A] to-[#E11D48] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-[#FDA4AF]" />
              <span>TikTok LIVE Pro</span>
            </button>
            <button
              onClick={() => setPlatformMode('traditional_comments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                platformMode === 'traditional_comments'
                  ? 'bg-blue-950 text-[#FDA4AF] border border-[#E11D48]/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Modo Clássico (Comentários)</span>
            </button>
          </div>
        </div>
      </div>

      {/* RENDER CLASSIC MODE IF SELECTED */}
      {platformMode === 'traditional_comments' ? (
        <TikTokRaffle
          settings={settings}
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          onOpenVictoryCard={onOpenVictoryCard}
        />
      ) : (!planEntitlement.active || planEntitlement.tier !== 'PRO') && activeProTab !== 'audit' ? (
        /* PRO PLAN EXCLUSIVE GATE (VALIDATED ON BACKEND) — Historical data in 'audit' remains unlocked! */
        <div className="p-8 rounded-2xl bg-gradient-to-b from-[#0A1128] to-[#050814] border border-[#E11D48]/50 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#E11D48] to-[#F43F5E] text-white mx-auto flex items-center justify-center shadow-lg shadow-[#E11D48]/30">
            <Lock className="w-8 h-8" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[#E11D48]/20 text-[#FDA4AF] border border-[#E11D48]/40">
              Exclusivo Plano PRO • Validação Backend Ativa
            </span>
            <h2 className="text-xl sm:text-2xl font-display font-black text-white pt-1">
              Automação ao Vivo Bloqueada no Plano FREE
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/80 leading-relaxed">
              A conexão em tempo real com TikTok LIVE, captura automática de presentes, emissão de bilhetes e campanhas acumuladas são exclusivas do plano <strong className="text-[#FDA4AF]">PRO</strong>. Seus históricos anteriores, participantes salvos e bilhetes já emitidos continuam 100% liberados para consulta e exportação.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => handleSwitchPlanTier('PRO')}
              disabled={isUpdatingPlan}
              className="px-6 py-3 rounded-xl font-black text-xs text-white bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] hover:brightness-110 transition shadow-lg shadow-[#E11D48]/25 flex items-center gap-2"
            >
              <Crown className="w-4 h-4" />
              <span>Ativar e Validar Plano PRO no Servidor</span>
            </button>
            <button
              onClick={() => setActiveProTab('audit')}
              className="px-4 py-3 rounded-xl font-bold text-xs text-[#FDA4AF] bg-[#1E3A8A]/70 hover:bg-[#1E3A8A] border border-[#E11D48]/40 transition flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>Consultar Meu Histórico & Participantes Salvos</span>
            </button>
            <button
              onClick={() => setPlatformMode('traditional_comments')}
              className="px-4 py-3 rounded-xl font-semibold text-xs text-blue-200 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 transition"
            >
              Usar Sorteador de Comentários (Gratuito)
            </button>
          </div>
        </div>
      ) : (
        /* RENDER LIVE PRO SYSTEM */
        <div className="space-y-6">
          {/* Sub-tabs Navigation — Sapphire-Blue & Metallic Red */}
          <div className="flex items-center gap-2 overflow-x-auto border-b border-blue-900/60 pb-2 no-scrollbar">
            <button
              onClick={() => setActiveProTab('feed')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
                activeProTab === 'feed'
                  ? 'bg-[#1E3A8A]/50 text-[#FDA4AF] border border-[#E11D48]/60 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-[#0A1128]/60 border border-blue-900/40'
              }`}
            >
              <Radio className="w-4 h-4 text-[#F43F5E]" />
              <span>1. Conexão LIVE & Contabilização Automática</span>
              {connectionStatus.state === 'CONNECTED' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveProTab('motor1')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
                activeProTab === 'motor1'
                  ? 'bg-[#1E3A8A]/50 text-[#FDA4AF] border border-[#E11D48]/60 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-[#0A1128]/60 border border-blue-900/40'
              }`}
            >
              <Trophy className="w-4 h-4 text-[#F43F5E]" />
              <span>2. Organização & Sorteio da LIVE (Motor 1)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#050814] text-[#FDA4AF] border border-[#E11D48]/40 font-mono">
                {activeSession?.currentTicketCounter || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveProTab('motor2')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
                activeProTab === 'motor2'
                  ? 'bg-[#1E3A8A]/50 text-[#FDA4AF] border border-[#E11D48]/60 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-[#0A1128]/60 border border-blue-900/40'
              }`}
            >
              <Layers className="w-4 h-4 text-[#F43F5E]" />
              <span>3. Campanhas Acumuladas Multi-LIVE (Motor 2)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#050814] text-[#FDA4AF] border border-[#E11D48]/40 font-mono">
                {campaigns.length}
              </span>
            </button>

            <button
              onClick={() => setActiveProTab('audit')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
                activeProTab === 'audit'
                  ? 'bg-[#1E3A8A]/50 text-[#FDA4AF] border border-[#E11D48]/60 shadow-sm'
                  : 'text-slate-300 hover:text-white bg-[#0A1128]/60 border border-blue-900/40'
              }`}
            >
              <Users className="w-4 h-4 text-[#F43F5E]" />
              <span>4. Participantes, Busca @usuário & Histórico</span>
            </button>

            <button
              onClick={() => setActiveProTab('monitor')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 ${
                activeProTab === 'monitor'
                  ? 'bg-[#1E3A8A]/50 text-[#FDA4AF] border border-[#E11D48]/60 shadow-sm'
                  : 'text-[#FDA4AF]/80 hover:text-[#FDA4AF] bg-[#0A1128]/70 border border-[#E11D48]/25'
              }`}
            >
              <Activity className="w-4 h-4 text-[#F43F5E]" />
              <span>LIVE SYSTEM MONITOR</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#E11D48]/20 text-[#FDA4AF] border border-[#E11D48]/40 font-mono uppercase">
                Admin
              </span>
            </button>
          </div>

          {/* TAB 1: TRANSMISSÃO AO VIVO & PRESENTES */}
          {activeProTab === 'feed' && (
            <div className="space-y-6">
              {/* Connection Controls Card */}
              <div className="p-5 sm:p-6 rounded-2xl bg-[#0A1128]/90 border border-[#E11D48]/30 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm sm:text-base font-display font-bold text-white flex items-center gap-2">
                      <Radio className="w-4 h-4 text-[#F43F5E]" />
                      <span>Conexão LIVE & Identificação da Transmissão</span>
                    </h2>
                    <p className="text-xs text-blue-200/80 mt-0.5">
                      Captura em tempo real da sala pública via Webcast (<code className="text-[#FDA4AF]">tiktok-live-connector</code>) • Criador: <strong className="text-white">@{connectionStatus.roomUsername || roomUsername}</strong>
                      {connectionStatus.roomId ? ` • Room ID: ${connectionStatus.roomId}` : ''}
                      {connectionStatus.viewerCount ? ` • ${connectionStatus.viewerCount} espectadores` : ''}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      title="Barramento de eventos com cache em memória (LRU/TTL) e bloqueio de transactionId duplicado"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-[#050814] text-[#FDA4AF] border border-[#E11D48]/40"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#F43F5E]" />
                      <span>EventBus: {dedupeStats.uniqueProcessed} únicos</span>
                      {dedupeStats.duplicatesDropped > 0 && (
                        <span className="text-amber-400 font-semibold">
                          ({dedupeStats.duplicatesDropped} duplicatas bloqueadas)
                        </span>
                      )}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${
                        connectionStatus.state === 'CONNECTED'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : connectionStatus.state === 'CONNECTING'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                          : connectionStatus.state === 'RECONNECTING'
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 animate-pulse'
                          : 'bg-[#050814] text-slate-400 border border-blue-900/60'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          connectionStatus.state === 'CONNECTED'
                            ? 'bg-emerald-400'
                            : connectionStatus.state === 'CONNECTING' || connectionStatus.state === 'RECONNECTING'
                            ? 'bg-amber-400'
                            : 'bg-slate-500'
                        }`}
                      />
                      <span>
                        {connectionStatus.state === 'CONNECTED'
                          ? 'AO VIVO CONECTADO'
                          : connectionStatus.state === 'CONNECTING'
                          ? 'CONECTANDO...'
                          : connectionStatus.state === 'RECONNECTING'
                          ? 'RECONECTANDO...'
                          : 'DESCONECTADO'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Connection Form */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-6 relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 text-sm font-bold">
                      @
                    </div>
                    <input
                      type="text"
                      value={roomUsername}
                      onChange={(e) => setRoomUsername(e.target.value)}
                      placeholder="gioborelli"
                      disabled={connectionStatus.state === 'CONNECTED'}
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-sm font-semibold text-white focus:outline-none focus:border-cyan-400 disabled:opacity-60"
                    />
                  </div>

                  <div className="sm:col-span-6 flex items-center gap-2">
                    <button
                      onClick={handleProbeLive}
                      className="flex-1 py-2.5 px-3.5 rounded-xl font-semibold text-xs text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Verificar Sala</span>
                    </button>

                    {connectionStatus.state === 'CONNECTED' || connectionStatus.state === 'RECONNECTING' ? (
                      <button
                        onClick={handleDisconnect}
                        className="flex-1 py-2.5 px-3.5 rounded-xl font-semibold text-xs text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 transition active:scale-95"
                      >
                        Encerrar Conexão
                      </button>
                    ) : (
                      <button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="flex-1 py-2.5 px-3.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-cyan-400 to-rose-400 hover:brightness-110 active:scale-95 transition shadow-md shadow-cyan-500/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isConnecting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-slate-950" />}
                        <span>Conectar TikTok LIVE</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Secondary Action Row: TikTok OAuth 2.0 Login Kit (Fase 3.4 Complete Panel) + Safety Backup JSON */}
                <div className="pt-3 border-t border-white/[0.06] space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleTikTokOAuthLogin}
                        className="py-1.5 px-3 rounded-lg text-[11px] font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/10 transition flex items-center gap-1.5"
                      >
                        {oauthUser?.avatar_url ? (
                          <img
                            src={oauthUser.avatar_url}
                            alt={oauthUser.display_name || 'TikTok'}
                            className="w-4 h-4 rounded-full object-cover border border-cyan-400/50"
                          />
                        ) : (
                          <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                        )}
                        <span>
                          {oauthUser
                            ? `Reconectar TikTok (${oauthUser.display_name || oauthUser.open_id})`
                            : 'Conectar com TikTok (Login Kit OAuth 2.0)'}
                        </span>
                      </button>
                      {oauthUser && (
                        <button
                          onClick={handleTikTokOAuthLogout}
                          className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-700/40 transition"
                        >
                          Desconectar / Revogar OAuth
                        </button>
                      )}
                      <button
                        onClick={handleRunOAuthDiagnostic}
                        title="Executar diagnóstico de TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, OAUTH_ENCRYPTION_KEY e prontidão do fluxo OAuth (/api/tiktok/auth/status)"
                        className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border border-cyan-800/50 transition flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Diagnóstico OAuth</span>
                      </button>
                    </div>

                    <button
                      onClick={handleDownloadBackupJson}
                      className="py-1.5 px-3 rounded-lg text-[11px] font-semibold bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-700/40 transition flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Backup de Segurança (JSON)</span>
                    </button>
                  </div>

                  {/* Fase 3.4: Complete TikTok Login Kit Connection Details Grid */}
                  <div className="p-3 rounded-xl bg-[#050814]/90 border border-blue-900/60 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-[11px]">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Status Login Kit</span>
                      <span
                        className={`font-mono font-bold ${
                          oauthUser
                            ? 'text-emerald-400'
                            : oauthStatus.canInitiateAuthFlow
                            ? 'text-cyan-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {oauthUser
                          ? 'CONECTADO'
                          : oauthStatus.canInitiateAuthFlow
                          ? 'PRONTO PARA CONECTAR'
                          : 'AGUARDANDO CREDENCIAIS'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Nome de Exibição</span>
                      <span className="font-bold text-white truncate block">
                        {oauthUser?.display_name || 'Não conectado'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">@username (OAuth)</span>
                      <span className="font-mono text-[#FDA4AF] truncate block">
                        {oauthUser?.username
                          ? `@${oauthUser.username.replace(/^@/, '')}`
                          : oauthUser
                          ? 'Escopo user.info.basic (sem @)'
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Avatar Oficial</span>
                      <span className="text-slate-300 flex items-center gap-1.5">
                        {oauthUser?.avatar_url ? (
                          <>
                            <img
                              src={oauthUser.avatar_url}
                              alt="Avatar"
                              className="w-4 h-4 rounded-full object-cover"
                            />
                            <span className="text-emerald-300 font-semibold">Carregado</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Data da Conexão</span>
                      <span className="font-mono text-slate-300">
                        {oauthUser?.authenticatedAt || oauthStatus.authenticatedAt
                          ? new Date(
                              Number(oauthUser?.authenticatedAt || oauthStatus.authenticatedAt)
                            ).toLocaleString('pt-BR')
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Estado da Sessão</span>
                      <span className="font-mono font-bold text-blue-300">
                        {oauthUser
                          ? oauthStatus.sessionState || 'ACTIVE (AES-256-GCM)'
                          : oauthStatus.sessionState || 'DISCONNECTED'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Session Switcher & Collection Lifecycle Bar (Pause / Resume / End / New Session) */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Sessão da LIVE:
                    </span>
                    <select
                      value={currentSessionId}
                      onChange={(e) => setCurrentSessionId(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                    >
                      {allSessions.map((s) => (
                        <option key={s.sessionId} value={s.sessionId}>
                          {s.sessionId} (@{s.username} • {s.currentTicketCounter} bilhetes •{' '}
                          {s.status === 'paused' ? 'PAUSADA' : s.status === 'ended' ? 'ENCERRADA' : 'ATIVA'})
                        </option>
                      ))}
                    </select>

                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                        activeSession?.status === 'paused'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                          : activeSession?.status === 'ended'
                          ? 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                      }`}
                    >
                      {activeSession?.status === 'paused'
                        ? 'COLETA PAUSADA'
                        : activeSession?.status === 'ended'
                        ? 'COLETA ENCERRADA'
                        : 'COLETA ATIVA'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeSession?.status === 'active' && (
                      <button
                        onClick={handlePauseCollection}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                      >
                        <Pause className="w-3 h-3" />
                        <span>Pausar Coleta</span>
                      </button>
                    )}
                    {activeSession?.status === 'paused' && (
                      <button
                        onClick={handleResumeCollection}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        <span>Retomar Coleta</span>
                      </button>
                    )}
                    {activeSession?.status !== 'ended' && (
                      <button
                        onClick={handleEndCollection}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                      >
                        <Square className="w-3 h-3" />
                        <span>Encerrar Coleta</span>
                      </button>
                    )}
                    <button
                      onClick={handleStartNewLiveSession}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova Sessão LIVE</span>
                    </button>
                  </div>
                </div>

                {/* Technical Transparency: Event Origin (Webcast vs OAuth 2.0) & Viewer Coins vs Creator Diamonds */}
                <div className="p-3.5 rounded-xl bg-[#050814]/90 border border-[#E11D48]/30 text-[11px] text-blue-100/80 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#F43F5E] shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[#FDA4AF]">Transparência Técnica sobre Origem dos Eventos (OAuth 2.0 vs. Webcast):</strong> O login via TikTok OAuth 2.0 (<code className="text-rose-300">user.info.basic</code>) autentica exclusivamente a identidade do organizador e <strong>não concede</strong> acesso oficial a eventos de presentes da TikTok LIVE. A captura de presentes em tempo real é realizada via leitura da sala pública Webcast (<code className="text-rose-300">tiktok-live-connector</code>), sem anunciar API oficial inexistente.
                    </div>
                  </div>
                  <div className="flex items-start gap-2 pl-6 text-[10px] text-slate-300">
                    <span>
                      <strong className="text-rose-300">Contabilização Estrita de Moedas Enviadas:</strong> O sistema contabiliza exclusivamente o valor nominal em <strong>Moedas TikTok enviadas pelo participante</strong> no evento do presente (multiplicado pelo delta real de combos/repetições), jamais confundindo moedas enviadas pelo público com diamantes ou saldo financeiro líquido do criador.
                    </span>
                  </div>
                </div>

                {/* System Notice Feedback */}
                {systemNotice && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      systemNotice.type === 'success'
                        ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-200'
                        : systemNotice.type === 'error'
                        ? 'bg-rose-950/50 border-rose-700/60 text-rose-200'
                        : systemNotice.type === 'warning'
                        ? 'bg-amber-950/50 border-amber-700/60 text-[#FDA4AF]'
                        : 'bg-blue-950/60 border-blue-700/60 text-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>{systemNotice.text}</span>
                    </div>
                    <button
                      onClick={() => setSystemNotice(null)}
                      className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Probe Result Feedback */}
                {probeResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      probeResult.isLive
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                    }`}
                  >
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{probeResult.message}</span>
                  </div>
                )}

                {/* Reconnecting Warning Notice */}
                {connectionStatus.warning && (
                  <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800 text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{connectionStatus.warning}</span>
                  </div>
                )}
              </div>

              {/* Real-Time Live Metrics 4-Grid — Sapphire-Blue & Metallic Red */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-[#0A1128] border border-[#E11D48]/30 space-y-1 shadow-lg">
                  <div className="flex items-center justify-between text-blue-200/80 text-xs font-semibold">
                    <span>Moedas Contabilizadas</span>
                    <Coins className="w-4 h-4 text-[#F43F5E]" />
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-[#FDA4AF] font-mono tabular-nums">
                    {(activeSession?.totalCoins || connectionStatus.totalCoinsCollected).toLocaleString('pt-BR')}
                  </p>
                  <span className="text-[10px] text-blue-300/60">Moedas enviadas pelos participantes</span>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-[#0A1128] border border-blue-900/70 space-y-1 shadow-lg">
                  <div className="flex items-center justify-between text-blue-200/80 text-xs font-semibold">
                    <span>Total de Presentes</span>
                    <Gift className="w-4 h-4 text-[#F43F5E]" />
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums">
                    {(activeSession?.totalGiftsCount || connectionStatus.totalGiftsReceived).toLocaleString('pt-BR')}
                  </p>
                  <span className="text-[10px] text-blue-300/60">Unidades em tempo real (combos processados)</span>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-[#0A1128] border border-blue-900/70 space-y-1 shadow-lg">
                  <div className="flex items-center justify-between text-blue-200/80 text-xs font-semibold">
                    <span>Total de Participantes</span>
                    <Users className="w-4 h-4 text-[#F43F5E]" />
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums">
                    {sessionParticipants.length.toLocaleString('pt-BR')}
                  </p>
                  <span className="text-[10px] text-blue-300/60">Identificados por ID estável + @usuário</span>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-[#0A1128] border border-[#E11D48]/40 space-y-1 shadow-lg">
                  <div className="flex items-center justify-between text-blue-200/80 text-xs font-semibold">
                    <span>Bilhetes Emitidos</span>
                    <Ticket className="w-4 h-4 text-[#F43F5E]" />
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tabular-nums">
                    {activeSession?.currentTicketCounter || 0}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-blue-200/70">
                      1 bilhete a cada {activeSession?.currentRate || 100} moedas
                    </span>
                    <button
                      onClick={() => setEditingRate(!editingRate)}
                      className="text-[10px] font-bold text-[#FDA4AF] hover:underline flex items-center gap-1"
                    >
                      <Settings className="w-3 h-3" />
                      <span>Configurar Sorteio</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Intuitive LIVE Raffle Configuration & Participation Rules Card */}
              <div className="p-5 rounded-2xl bg-[#0A1128] border border-[#E11D48]/35 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-900/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#E11D48]/20 border border-[#E11D48]/40 flex items-center justify-center text-[#FDA4AF]">
                      <Sliders className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white">
                        Configuração do Sorteio da LIVE & Regras de Emissão Automática
                      </h3>
                      <p className="text-[11px] text-blue-200/70">
                        Defina a conversão de moedas em bilhetes, regras de participação e limites opcionais (versão ativa: <span className="font-mono text-[#FDA4AF]">{activeSession?.currentRuleId}</span>)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingRate((v) => !v)}
                    className="px-3 py-1.5 rounded-lg bg-[#050814] hover:bg-blue-950 text-[#FDA4AF] border border-[#E11D48]/40 text-xs font-bold transition self-start sm:self-auto"
                  >
                    {editingRate ? 'Recolher Configurações' : 'Editar Regras e Limites'}
                  </button>
                </div>

                {/* Summary Pills when collapsed */}
                {!editingRate && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#050814]/80 border border-blue-900/60">
                      <span className="text-[10px] text-blue-300/70 block">Conversão Atual</span>
                      <span className="font-mono font-bold text-[#FDA4AF]">
                        {activeSession?.currentRate || 100} moedas = 1 bilhete
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#050814]/80 border border-blue-900/60">
                      <span className="text-[10px] text-blue-300/70 block">Mínimo por Presente</span>
                      <span className="font-mono font-bold text-white">
                        {activeSession?.minCoinsPerGift ?? 1} moeda(s)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#050814]/80 border border-blue-900/60">
                      <span className="text-[10px] text-blue-300/70 block">Limite por Usuário</span>
                      <span className="font-mono font-bold text-white">
                        {activeSession?.maxTicketsPerUser ? `${activeSession.maxTicketsPerUser} bilhetes` : 'Sem limite'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#050814]/80 border border-blue-900/60">
                      <span className="text-[10px] text-blue-300/70 block">Limite Total da LIVE</span>
                      <span className="font-mono font-bold text-white">
                        {activeSession?.maxTotalTickets ? `${activeSession.maxTotalTickets} bilhetes` : 'Sem limite'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#050814]/80 border border-blue-900/60">
                      <span className="text-[10px] text-blue-300/70 block">Prêmio Configurado</span>
                      <span className="font-bold text-[#FDA4AF] truncate block">
                        {activeSession?.prizeName || motor1PrizeInput}
                      </span>
                    </div>
                  </div>
                )}

                {editingRate && (
                  <div className="space-y-4 pt-1 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#FDA4AF] mb-1">
                          Título do Sorteio da LIVE
                        </label>
                        <input
                          type="text"
                          value={raffleTitleInput}
                          onChange={(e) => setRaffleTitleInput(e.target.value)}
                          placeholder="Ex: Sorteio Oficial da LIVE"
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-blue-900 text-xs text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#FDA4AF] mb-1">
                          Prêmio em Disputa nesta LIVE
                        </label>
                        <input
                          type="text"
                          value={motor1PrizeInput}
                          onChange={(e) => setMotor1PrizeInput(e.target.value)}
                          placeholder="Ex: Pix R$ 500 ou iPhone"
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-blue-900 text-xs text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#FDA4AF] mb-1">
                          Conversão: Moedas Enviadas por 1 Bilhete *
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newRateValue}
                          onChange={(e) => setNewRateValue(e.target.value)}
                          placeholder="100"
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-[#E11D48]/60 text-xs font-mono font-bold text-[#FDA4AF] focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-blue-200 mb-1">
                          Mínimo de Moedas no Presente para Pontuar
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={minCoinsPerGiftInput}
                          onChange={(e) => setMinCoinsPerGiftInput(e.target.value)}
                          placeholder="1"
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-blue-900 text-xs font-mono text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-blue-200 mb-1">
                          Limite Máx. de Bilhetes por Participante (Opcional)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={maxTicketsPerUserInput}
                          onChange={(e) => setMaxTicketsPerUserInput(e.target.value)}
                          placeholder="Sem limite"
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-blue-900 text-xs font-mono text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-blue-200 mb-1">
                          Limite Total de Bilhetes na LIVE (Opcional)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={maxTotalTicketsInput}
                          onChange={(e) => setMaxTotalTicketsInput(e.target.value)}
                          placeholder="Sem limite"
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-blue-900 text-xs font-mono text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-8">
                        <label className="block text-[11px] font-semibold text-blue-200 mb-1">
                          Regras de Participação / Observações da LIVE
                        </label>
                        <input
                          type="text"
                          value={participationRulesNotesInput}
                          onChange={(e) => setParticipationRulesNotesInput(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#050814] border border-blue-900 text-xs text-white focus:outline-none focus:border-[#E11D48]"
                        />
                      </div>

                      <div className="sm:col-span-4 flex items-center gap-2 pt-4">
                        <input
                          id="allow-dup-winners"
                          type="checkbox"
                          checked={allowDuplicateWinnersInput}
                          onChange={(e) => setAllowDuplicateWinnersInput(e.target.checked)}
                          className="rounded border-blue-800 bg-[#050814] text-[#E11D48]"
                        />
                        <label htmlFor="allow-dup-winners" className="text-xs text-blue-100 cursor-pointer">
                          Permitir múltiplos prêmios ao mesmo usuário
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-blue-900/60">
                      <span className="text-[11px] text-blue-200/70">
                        As regras são versionadas no Firestore. Bilhetes já emitidos permanecem imutáveis.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingRate(false)}
                          className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveSessionRulesAndConfig}
                          disabled={isSavingSessionRules}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white font-black text-xs hover:brightness-110 transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSavingSessionRules ? 'Salvando...' : 'Salvar Configuração do Sorteio'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Feed & Ranking 2-Column Section */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Live Gifts Feed */}
                <div className="lg:col-span-7 p-5 rounded-2xl bg-[#0A1128]/90 border border-blue-900/70 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-blue-900/60 pb-3 gap-2">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-[#F43F5E]" />
                      <h3 className="text-sm font-display font-bold text-white">
                        Feed de Presentes Recebidos em Tempo Real
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-[#050814] text-[#FDA4AF] border border-[#E11D48]/40">
                        Persist-Before-SSE Ativo • Sem Simulação
                      </span>
                    </div>
                  </div>

                  {/* Anti-Duplicate EventBus Verification Banner */}
                  {lastDedupeAlert && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 animate-in fade-in duration-200 ${
                        lastDedupeAlert.type === 'duplicate'
                          ? 'bg-amber-950/70 border-amber-600/70 text-[#FDA4AF]'
                          : 'bg-emerald-950/70 border-emerald-600/70 text-emerald-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {lastDedupeAlert.type === 'duplicate' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        <div className="truncate">
                          <span className="font-bold">
                            {lastDedupeAlert.type === 'duplicate'
                              ? 'ESCUDO EVENTBUS (DEDUPLICAÇÃO ATIVA): '
                              : 'TRANSAÇÃO PERSISTIDA: '}
                          </span>
                          <span className="opacity-90">{lastDedupeAlert.message}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setLastDedupeAlert(null)}
                        className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Real-Time Admin Performance & Queue Diagnostics Panel */}
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-cyan-500/25 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold text-white">
                          Painel de Diagnóstico em Tempo Real (Baixa Latência & Fila WAL)
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                          EPS: {perfDiagnostics?.eventsPerSecond ?? 0}/s (Pico: {perfDiagnostics?.peakEventsPerSecond ?? 0}/s)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={refreshDiagnostics}
                          className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-semibold text-slate-300 border border-slate-700 transition flex items-center gap-1"
                        >
                          <RotateCw className="w-3 h-3 text-cyan-400" />
                          <span>Atualizar</span>
                        </button>
                        <button
                          onClick={handleRecoverQueue}
                          disabled={isRecoveringQueue}
                          className="px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 text-[10px] font-semibold text-emerald-300 border border-emerald-700/50 transition flex items-center gap-1 disabled:opacity-50"
                        >
                          < RotateCw className={`w-3 h-3 ${isRecoveringQueue ? 'animate-spin' : ''}`} />
                          <span>Sincronizar WAL</span>
                        </button>
                        <button
                          onClick={() => setActiveProTab('monitor')}
                          className="px-2 py-1 rounded-lg bg-[#0A1128] hover:bg-[#1E3A8A]/60 text-[10px] font-bold text-[#FDA4AF] border border-[#E11D48]/50 transition flex items-center gap-1"
                        >
                          <Activity className="w-3 h-3 text-[#F43F5E]" />
                          <span>Abrir LIVE SYSTEM MONITOR</span>
                        </button>
                        <button
                          onClick={() => setShowDiagnosticsPanel((v) => !v)}
                          className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-semibold text-slate-400"
                        >
                          {showDiagnosticsPanel ? 'Ocultar' : 'Expandir'}
                        </button>
                      </div>
                    </div>

                    {/* Automatic Threshold Alerts */}
                    {perfDiagnostics?.alerts && perfDiagnostics.alerts.length > 0 && (
                      <div className="space-y-1.5">
                        {perfDiagnostics.alerts.map((alert) => (
                          <div
                            key={alert.id}
                            className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
                              alert.severity === 'error'
                                ? 'bg-rose-950/70 border-rose-700/60 text-rose-200'
                                : 'bg-amber-950/70 border-amber-700/60 text-[#E6D3A7]'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{alert.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {showDiagnosticsPanel && (
                      <div className="space-y-2.5 pt-1">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Estado / Uptime LIVE</span>
                            <span className="font-mono font-bold text-white">
                              {perfDiagnostics?.connectionState || connectionStatus.state} •{' '}
                              {Math.floor((perfDiagnostics?.liveUptimeMs || 0) / 1000)}s
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Processados / Persistidos</span>
                            <span className="font-mono font-bold text-emerald-400">
                              {(perfDiagnostics?.totalProcessedEvents || 0) + dedupeStats.uniqueProcessed} /{' '}
                              {perfDiagnostics?.totalPersistedEvents || 0}
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Pendentes / Fila (Idade)</span>
                            <span className="font-mono font-bold text-cyan-300">
                              {perfDiagnostics?.totalPendingEvents || 0} itens ({perfDiagnostics?.oldestPendingAgeMs || 0}ms)
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-slate-400 block text-[10px]">Duplicados / Reconexões / Erros</span>
                            <span className="font-mono font-bold text-amber-300">
                              {(perfDiagnostics?.duplicatesBlocked || 0) + dedupeStats.duplicatesDropped} dup •{' '}
                              {perfDiagnostics?.reconnectCount || 0} rec • {perfDiagnostics?.errorsAndFailuresCount || 0} err
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                            <span className="text-slate-400">Latência Captura → Exibição:</span>
                            <span className="font-mono font-bold text-cyan-300">
                              p50: {perfDiagnostics?.captureToDisplayLatency.p50 ?? 0}ms | p95:{' '}
                              {perfDiagnostics?.captureToDisplayLatency.p95 ?? 0}ms | p99:{' '}
                              {perfDiagnostics?.captureToDisplayLatency.p99 ?? 0}ms
                            </span>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                            <span className="text-slate-400">Latência Captura → Persistência:</span>
                            <span className="font-mono font-bold text-emerald-300">
                              p50: {perfDiagnostics?.captureToPersistenceLatency.p50 ?? 0}ms | p95:{' '}
                              {perfDiagnostics?.captureToPersistenceLatency.p95 ?? 0}ms | p99:{' '}
                              {perfDiagnostics?.captureToPersistenceLatency.p99 ?? 0}ms
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono text-slate-400">
                          <div className="truncate">
                            <strong className="text-slate-300">Último Recebido:</strong>{' '}
                            {perfDiagnostics?.lastEventReceived
                              ? `${perfDiagnostics.lastEventReceived.displayHandle} (${perfDiagnostics.lastEventReceived.giftName} +${perfDiagnostics.lastEventReceived.coinsGranted})`
                              : liveGiftsFeed[0]
                              ? `${liveGiftsFeed[0].displayHandle} (${liveGiftsFeed[0].giftName} +${liveGiftsFeed[0].coins})`
                              : 'Nenhum'}
                          </div>
                          <div className="truncate">
                            <strong className="text-slate-300">Último Confirmado:</strong>{' '}
                            {perfDiagnostics?.lastEventConfirmed
                              ? `${perfDiagnostics.lastEventConfirmed.displayHandle} (${perfDiagnostics.lastEventConfirmed.giftName} • ${perfDiagnostics.lastEventConfirmed.persistenceLatencyMs}ms)`
                              : liveGiftsFeed.find((i) => i.status === 'CONFIRMED')
                              ? `${liveGiftsFeed.find((i) => i.status === 'CONFIRMED')?.displayHandle} (${
                                  liveGiftsFeed.find((i) => i.status === 'CONFIRMED')?.giftName
                                })`
                              : 'Nenhum'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {liveGiftsFeed.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs space-y-2">
                      <Gift className="w-8 h-8 mx-auto text-[#F43F5E]/60 animate-pulse" />
                      <p className="font-semibold text-white">Aguardando presentes reais da transmissão ao vivo...</p>
                      <p className="text-[11px] text-blue-200/70">
                        Conecte a sala da transmissão (@{roomUsername}) para capturar presentes, contabilizar moedas enviadas e emitir bilhetes automaticamente.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {liveGiftsFeed.map((item) => (
                        <GiftFeedItemRow key={item.eventKey} item={item} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Supporters Podium Ranking */}
                <div className="lg:col-span-5 p-5 rounded-2xl bg-[#0A1128]/90 border border-blue-900/70 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-blue-900/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-[#F43F5E]" />
                      <h3 className="text-sm font-display font-bold text-white">Ranking de Participantes</h3>
                    </div>
                    <span className="text-[10px] text-[#FDA4AF] font-mono">LIVE Atual</span>
                  </div>

                  {sessionParticipants.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      Nenhum apoiador registrado nesta LIVE ainda.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {sessionParticipants.slice(0, 10).map((participant, index) => {
                        const hasHandle =
                          participant.handleAvailable !== false &&
                          participant.username &&
                          participant.username !== 'arroba_indisponivel';
                        const participantLabel = hasHandle
                          ? `@${participant.username}`
                          : 'Arroba indisponível';
                        const pTickets = ticketsByParticipantMap.get(participant.tiktokUserId) || [];
                        return (
                          <div
                            key={participant.tiktokUserId}
                            onClick={() => handleInspectParticipant(participant.tiktokUserId)}
                            className="p-2.5 rounded-xl bg-[#050814]/80 border border-blue-900/60 hover:border-[#E11D48]/60 cursor-pointer transition flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-lg font-black flex items-center justify-center shrink-0 ${
                                  index === 0
                                    ? 'bg-[#E11D48] text-white shadow-sm'
                                    : index === 1
                                    ? 'bg-slate-300 text-slate-950'
                                    : index === 2
                                    ? 'bg-rose-800 text-white'
                                    : 'bg-blue-950 text-blue-300'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div className="truncate">
                                <p className="font-bold text-white truncate">{participantLabel}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {participant.nickname}
                                  {pTickets.length > 0
                                    ? ` • #${pTickets.slice(0, 4).join(', #')}${
                                        pTickets.length > 4 ? ` (+${pTickets.length - 4})` : ''
                                      }`
                                    : ''}
                                </p>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="font-mono font-bold text-[#FDA4AF]">
                                {participant.coinsInSession.toLocaleString('pt-BR')} moedas
                              </p>
                              <p className="text-[10px] font-mono text-emerald-400 font-bold">
                                {participant.ticketsInSession} bilhete(s)
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Real-Time Participant Presence (Enter / Leave Detection when available) */}
                  <div className="pt-3 border-t border-blue-900/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#F43F5E]" />
                        <span>Entrada / Saída na Sala (Tempo Real)</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {(memberPresenceFeed.length || connectionStatus.recentMembers?.length || 0)} eventos
                      </span>
                    </div>
                    {(memberPresenceFeed.length > 0 ? memberPresenceFeed : connectionStatus.recentMembers || []).length === 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Eventos de entrada/saída aparecerão automaticamente quando transmitidos pela sala da LIVE.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {(memberPresenceFeed.length > 0 ? memberPresenceFeed : connectionStatus.recentMembers || [])
                          .slice(0, 12)
                          .map((m) => (
                            <span
                              key={m.eventId}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${
                                m.action === 'JOINED'
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50'
                                  : 'bg-[#050814] text-slate-400 border-blue-900/50'
                              }`}
                            >
                              {m.action === 'JOINED' ? '→ Entrou:' : '← Saiu:'} @{m.username}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MOTOR 1 — ORGANIZAÇÃO E SORTEIO POR LIVE */}
          {activeProTab === 'motor1' && (
            <div className="p-6 rounded-2xl bg-[#0A1128] border border-[#E11D48]/35 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-900/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#F43F5E]" />
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Organização do Sorteio Individual por LIVE (Motor 1)
                    </h2>
                  </div>
                  <p className="text-xs text-blue-200/80">
                    Consulte todos os participantes, busque por <code className="text-[#FDA4AF]">@usuário</code> ou <code className="text-[#FDA4AF]">#bilhete</code>, exporte a lista, congele com hash SHA-256 e realize o sorteio auditável.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeSession?.status === 'active' && (
                    <button
                      onClick={handlePauseCollection}
                      className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-semibold text-amber-300 transition flex items-center gap-1.5"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pausar Coleta</span>
                    </button>
                  )}
                  {activeSession?.status === 'paused' && (
                    <button
                      onClick={handleResumeCollection}
                      className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 transition flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Retomar Coleta</span>
                    </button>
                  )}
                  {activeSession?.status !== 'ended' && (
                    <button
                      onClick={handleEndCollection}
                      className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-rose-300 transition flex items-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Encerrar Coleta</span>
                    </button>
                  )}
                  <button
                    onClick={handleExportCsv}
                    className="px-3 py-2 rounded-xl bg-[#050814] hover:bg-blue-950 border border-[#E11D48]/40 text-xs font-semibold text-[#FDA4AF] transition flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-[#F43F5E]" />
                    <span>Exportar Lista (CSV)</span>
                  </button>
                  <button
                    onClick={handleDownloadBackupJson}
                    className="px-3 py-2 rounded-xl bg-[#050814] hover:bg-blue-950 border border-blue-800 text-xs font-semibold text-blue-200 transition flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4 text-blue-400" />
                    <span>Exportar JSON</span>
                  </button>
                </div>
              </div>

              {/* Round Status & Freeze Banner */}
              <div className="p-4 sm:p-5 rounded-xl bg-[#050814] border border-[#E11D48]/30 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200/70">Bilhetes Emitidos</span>
                    <span
                      className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                        activeSession?.status === 'paused'
                          ? 'bg-amber-950 text-amber-300 border border-amber-700/60'
                          : activeSession?.status === 'ended'
                          ? 'bg-rose-950 text-rose-300 border border-rose-700/60'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                      }`}
                    >
                      {activeSession?.status === 'paused'
                        ? 'PAUSADA'
                        : activeSession?.status === 'ended'
                        ? 'ENCERRADA'
                        : 'ATIVA'}
                    </span>
                  </div>
                  <p className="text-2xl font-black text-[#FDA4AF] font-mono">
                    {activeSession?.currentTicketCounter || 0}
                  </p>
                  <p className="text-xs text-blue-200/70">
                    Concorrem nesta transmissão (Conversão: {activeSession?.currentRate || 100} moedas enviadas = 1 bilhete)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#FDA4AF] mb-1">Prêmio da Rodada</label>
                  <input
                    type="text"
                    value={motor1PrizeInput}
                    onChange={(e) => setMotor1PrizeInput(e.target.value)}
                    placeholder="Ex: iPhone 16 Pro Max"
                    className="w-full px-3 py-2 rounded-lg bg-[#0A1128] border border-blue-900 text-xs text-white focus:outline-none focus:border-[#E11D48]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleFreezeMotor1}
                    disabled={isFreezingMotor1 || (activeSession?.currentTicketCounter || 0) === 0}
                    className="w-full sm:w-auto py-3 px-5 rounded-xl font-black text-xs text-white bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-[#E11D48]/25 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isFreezingMotor1 ? <RotateCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                    <span>Congelar Lista de Participantes & Sortear</span>
                  </button>
                </div>
              </div>

              {/* Explanatory note about non-blocking freeze */}
              <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-800/60 text-xs text-blue-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 text-[#F43F5E] mt-0.5" />
                <div>
                  <strong className="text-white">Garantia de Congelamento Imutável & CSPRNG:</strong> Ao congelar a lista para o sorteio, um snapshot criptográfico SHA-256 de todos os bilhetes emitidos (<code className="text-[#FDA4AF]">#1 até #{activeSession?.currentTicketCounter || 0}</code>) é salvo antes da seleção do ganhador.
                </div>
              </div>

              {/* Search Bar & Session Participants Table */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">
                    Lista de Participantes, Moedas e Bilhetes Emitidos ({filteredSessionParticipants.length} de {sessionParticipants.length})
                  </h3>

                  <div className="relative w-full sm:w-80">
                    <Search className="w-3.5 h-3.5 text-[#F43F5E] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={participantSearchQuery}
                      onChange={(e) => setParticipantSearchQuery(e.target.value)}
                      placeholder="Buscar por @usuário, nome, ID ou #bilhete..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#050814] border border-blue-800 text-xs text-white focus:outline-none focus:border-[#E11D48]"
                    />
                  </div>
                </div>

                <div className="border border-blue-900/70 rounded-xl overflow-hidden bg-[#050814]/80">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0A1128] text-blue-200 font-semibold border-b border-blue-900/70">
                      <tr>
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-4">Participante (@usuário)</th>
                        <th className="py-2.5 px-4">ID Estável TikTok</th>
                        <th className="py-2.5 px-4">Moedas Enviadas</th>
                        <th className="py-2.5 px-4">Qtd. Bilhetes</th>
                        <th className="py-2.5 px-4">Bilhetes Individualizados</th>
                        <th className="py-2.5 px-4">Saldo Residual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-950/70">
                      {filteredSessionParticipants.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500">
                            {participantSearchQuery
                              ? `Nenhum participante ou bilhete encontrado para "${participantSearchQuery}".`
                              : 'Nenhum bilhete emitido nesta LIVE ainda.'}
                          </td>
                        </tr>
                      ) : (
                        filteredSessionParticipants.map((p, idx) => {
                          const hasHandle = p.handleAvailable !== false && p.username && p.username !== 'arroba_indisponivel';
                          const pHandle = hasHandle ? `@${p.username}` : 'Arroba indisponível';
                          const pTickets = ticketsByParticipantMap.get(p.tiktokUserId) || [];
                          return (
                            <tr
                              key={p.tiktokUserId}
                              onClick={() => handleInspectParticipant(p.tiktokUserId)}
                              className="hover:bg-blue-950/40 cursor-pointer transition"
                            >
                              <td className="py-2.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                              <td className="py-2.5 px-4 font-bold text-white">
                                {pHandle} <span className="text-slate-400 font-normal">({p.nickname})</span>
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-400">{p.tiktokUserId}</td>
                              <td className="py-2.5 px-4 font-mono text-[#FDA4AF] font-bold">
                                {p.coinsInSession.toLocaleString('pt-BR')}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-emerald-400 font-bold">
                                {p.ticketsInSession}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-[11px] text-[#FDA4AF] max-w-xs truncate">
                                {pTickets.length > 0
                                  ? `#${pTickets.slice(0, 8).join(', #')}${
                                      pTickets.length > 8 ? ` (+${pTickets.length - 8})` : ''
                                    }`
                                  : '—'}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-400">
                                {p.carryoverCoins} moedas
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Completed Draws History for this LIVE Session */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-rose-400" />
                    <span>Histórico de Resultados desta LIVE ({sessionDraws.length})</span>
                  </h3>
                </div>

                {sessionDraws.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-500 text-center">
                    Nenhum sorteio realizado nesta sessão de LIVE ainda.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessionDraws.map((d) => (
                      <div
                        key={d.drawId}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-emerald-400 text-sm">
                              Bilhete #{d.winningTicketNumber}
                            </span>
                            <span className="font-bold text-white">@{d.winnerName}</span>
                            <span className="text-amber-300 font-semibold">• {d.prizeName}</span>
                          </div>
                          <p className="font-mono text-[10px] text-slate-400 truncate max-w-xl">
                            SHA-256 Roster: {d.frozenRosterHash} | Seed: {d.seedCommitment.slice(0, 24)}...
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(d.drawnAt).toLocaleString('pt-BR')}
                          </span>
                          <button
                            onClick={() =>
                              downloadTikTokLivePdfCertificate({
                                drawType: 'INDIVIDUAL_LIVE',
                                targetTitle: activeSession?.roomTitle || `LIVE @${roomUsername}`,
                                prizeName: d.prizeName,
                                drawDate: d.drawnAt,
                                winnerUsername: d.winnerName,
                                winnerNickname: d.winnerName,
                                winnerTiktokUserId: d.winnerTiktokUserId,
                                winningTicketNumber: d.winningTicketNumber,
                                totalTickets: activeSession?.currentTicketCounter || d.winningTicketNumber,
                                rosterSha256Hash: d.frozenRosterHash,
                                seedCommitment: d.seedCommitment,
                                seedRevealed: d.seedRevealed,
                                sessionId: currentSessionId,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 font-semibold text-[11px] flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Certificado PDF</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MOTOR 2 — CAMPANHAS ESPECIAIS MULTI-LIVE */}
          {activeProTab === 'motor2' && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Motor 2: Campanhas Especiais Multi-LIVE
                    </h2>
                  </div>
                  <p className="text-xs text-slate-400">
                    Reúna bilhetes acumulados de várias transmissões sem duplicação, com snapshots imutáveis e auditoria SHA-256
                  </p>
                </div>

                <button
                  onClick={() => setIsCreateCampaignModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-cyan-400 to-indigo-400 hover:brightness-110 active:scale-[0.99] transition shadow-md shadow-indigo-500/20 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Campanha Especial</span>
                </button>
              </div>

              {campaigns.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs space-y-3">
                  <Layers className="w-8 h-8 mx-auto text-slate-600" />
                  <p>Nenhuma campanha especial criada ainda.</p>
                  <button
                    onClick={() => setIsCreateCampaignModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-900/60 text-indigo-300 border border-indigo-700/60 text-xs font-semibold"
                  >
                    Criar Primeira Campanha
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {campaigns.map((camp) => {
                    const campDraws = campaignDrawsMap[camp.campaignId] || [];
                    const campSessions = campaignSessionsMap[camp.campaignId] || [];
                    const selectedSidForLink = sessionToLinkByCampaign[camp.campaignId] || currentSessionId;

                    return (
                      <div
                        key={camp.campaignId}
                        className="p-5 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-black text-white">{camp.title}</h3>
                              <span
                                className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                                  camp.status === 'OPEN'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : camp.status === 'FROZEN'
                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {camp.status}
                              </span>
                              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-blue-950 text-[#FDA4AF] border border-blue-800">
                                Status Legal: {camp.legalStatus || 'Pendente de análise'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 mt-1">{camp.description}</p>
                            {camp.organizerName && (
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Organizador: <strong className="text-slate-300">{camp.organizerName}</strong>
                                {camp.modality ? ` • ${camp.modality}` : ''}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                          <div>
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Prêmio</span>
                            <p className="font-bold text-amber-300 truncate">{camp.prizeName}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Bilhetes Acumulados</span>
                            <p className="font-mono font-bold text-indigo-300">
                              {camp.totalAccumulatedTickets.toLocaleString('pt-BR')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>LIVEs participantes: {camp.participatingSessionIds.length}</span>
                          <span>
                            Período: {new Date(camp.startDate).toLocaleDateString('pt-BR')} até{' '}
                            {new Date(camp.cutoffDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>

                        {/* Linked Sessions List */}
                        {campSessions.length > 0 && (
                          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                              Transmissões Vinculadas ({campSessions.length}):
                            </span>
                            <div className="space-y-1 max-h-24 overflow-y-auto">
                              {campSessions.map((cs) => (
                                <div key={cs.sessionId} className="flex items-center justify-between text-[11px]">
                                  <span className="font-mono text-slate-300 truncate">{cs.sessionId}</span>
                                  <span className="font-mono text-cyan-400">{cs.indexedTicketsCount} bilhetes</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Completed Campaign Draws History */}
                        {campDraws.length > 0 && (
                          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/60 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase text-emerald-400">
                                Resultado Oficial da Campanha
                              </span>
                              <button
                                onClick={() => {
                                  const d = campDraws[0];
                                  downloadTikTokLivePdfCertificate({
                                    drawType: 'CAMPAIGN',
                                    targetTitle: camp.title,
                                    prizeName: d.prizeName,
                                    drawDate: d.drawnAt,
                                    winnerUsername: d.winnerName,
                                    winnerNickname: d.winnerName,
                                    winnerTiktokUserId: d.winnerTiktokUserId,
                                    winningTicketNumber: d.winningTicketNumber,
                                    totalTickets: camp.totalAccumulatedTickets,
                                    rosterSha256Hash: d.frozenRosterHash,
                                    seedCommitment: d.seedCommitment,
                                    seedRevealed: d.seedRevealed,
                                    campaignId: camp.campaignId,
                                  });
                                }}
                                className="text-[10px] font-semibold text-cyan-300 hover:underline flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                <span>Baixar PDF</span>
                              </button>
                            </div>
                            <p className="font-bold text-white">
                              Ganhador(a): @{campDraws[0].winnerName} • Bilhete #{campDraws[0].winningTicketNumber}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              LIVE Origem: {campDraws[0].winnerSessionId} | Hash: {campDraws[0].frozenRosterHash.slice(0, 20)}...
                            </p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2 border-t border-slate-800 space-y-2">
                          {camp.status === 'OPEN' && (
                            <div className="flex items-center gap-2">
                              <select
                                value={selectedSidForLink}
                                onChange={(e) =>
                                  setSessionToLinkByCampaign((prev) => ({
                                    ...prev,
                                    [camp.campaignId]: e.target.value,
                                  }))
                                }
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200"
                              >
                                {allSessions.map((s) => (
                                  <option key={s.sessionId} value={s.sessionId}>
                                    {s.sessionId} ({s.currentTicketCounter} bilhetes)
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => {
                                  addSessionToCampaign(camp.campaignId, selectedSidForLink)
                                    .then((res) => {
                                      refreshCampaigns();
                                      setSystemNotice({
                                        type: 'success',
                                        text: `LIVE (${selectedSidForLink}) sincronizada na campanha: +${res.addedTicketsCount} novos bilhetes (${res.skippedDuplicatesCount} duplicados ignorados; total: ${res.totalCampaignTickets}).`,
                                      });
                                    })
                                    .catch((err) => {
                                      setSystemNotice({
                                        type: 'error',
                                        text: `Erro ao vincular LIVE: ${(err as Error).message}`,
                                      });
                                    });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-xs font-semibold shrink-0"
                              >
                                + Acumular LIVE
                              </button>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2">
                            {camp.status === 'OPEN' && (
                              <button
                                onClick={() => {
                                  setSelectedCampaign(camp);
                                  handleFreezeCampaign(camp.campaignId);
                                }}
                                disabled={camp.totalAccumulatedTickets === 0}
                                className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-rose-500 text-white font-bold text-xs shadow-md disabled:opacity-50"
                              >
                                Congelar Lista Final & Sortear
                              </button>
                            )}

                            {camp.status === 'FROZEN' && (
                              <button
                                onClick={async () => {
                                  if (camp.latestSnapshotId) {
                                    const realSnap = await fetchSnapshotById(camp.latestSnapshotId);
                                    if (realSnap) {
                                      setCampaignSnapshot(realSnap);
                                      setSelectedCampaign(camp);
                                      setIsCampaignDrawModalOpen(true);
                                    }
                                  }
                                }}
                                className="w-full py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white font-bold text-xs"
                              >
                                Abrir Mesa de Sorteio Congelada
                              </button>
                            )}

                            {camp.status === 'COMPLETED' && (
                              <span className="text-xs text-emerald-400 font-semibold">
                                ✓ Sorteio Acumulado Concluído e Auditado
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PARTICIPANTES & AUDITORIA GERAL */}
          {activeProTab === 'audit' && (
            <div className="p-6 rounded-2xl bg-[#0A1128] border border-[#E11D48]/35 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-900/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#F43F5E]" />
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      Participantes, Busca por @usuário, Combos & Trilha de Auditoria
                    </h2>
                  </div>
                  <p className="text-xs text-blue-200/80">
                    Consulte todos os participantes, filtre por <code className="text-[#FDA4AF]">@usuário</code> ou <code className="text-[#FDA4AF]">#bilhete</code>, inspecione o histórico individual e exporte os relatórios.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCsv}
                    className="px-3.5 py-2 rounded-xl bg-[#050814] hover:bg-blue-950 border border-[#E11D48]/40 text-xs font-semibold text-[#FDA4AF] transition flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4 text-[#F43F5E]" />
                    <span>Exportar Relatório CSV</span>
                  </button>
                </div>
              </div>

              {/* Search & Instructions Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#050814] border border-blue-900/70">
                <div className="flex items-center gap-2 text-xs text-blue-200">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-[#F43F5E]" />
                  <span>
                    Clique em qualquer participante para abrir o histórico individual consolidado em todas as transmissões LIVE.
                  </span>
                </div>
                <div className="relative w-full sm:w-80 shrink-0">
                  <Search className="w-3.5 h-3.5 text-[#F43F5E] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={participantSearchQuery}
                    onChange={(e) => setParticipantSearchQuery(e.target.value)}
                    placeholder="Buscar @usuário, apelido, ID ou #bilhete..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#0A1128] border border-blue-800 text-xs text-white focus:outline-none focus:border-[#E11D48]"
                  />
                </div>
              </div>

              {/* Table of Participants */}
              <div className="border border-blue-900/70 rounded-xl overflow-hidden bg-[#050814]/80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0A1128] text-blue-200 font-semibold border-b border-blue-900/70">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Usuário TikTok</th>
                      <th className="py-2.5 px-4">ID Numérico TikTok</th>
                      <th className="py-2.5 px-4">Moedas Enviadas na LIVE</th>
                      <th className="py-2.5 px-4">Bilhetes Emitidos</th>
                      <th className="py-2.5 px-4">Números dos Bilhetes</th>
                      <th className="py-2.5 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-950/70">
                    {filteredSessionParticipants.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          {participantSearchQuery
                            ? `Nenhum participante encontrado para "${participantSearchQuery}".`
                            : 'Nenhum participante registrado.'}
                        </td>
                      </tr>
                    ) : (
                      filteredSessionParticipants.map((p, idx) => {
                        const hasHandle = p.handleAvailable !== false && p.username && p.username !== 'arroba_indisponivel';
                        const pHandle = hasHandle ? `@${p.username}` : 'Arroba indisponível';
                        const pTickets = ticketsByParticipantMap.get(p.tiktokUserId) || [];
                        return (
                          <tr
                            key={p.tiktokUserId}
                            onClick={() => handleInspectParticipant(p.tiktokUserId)}
                            className="hover:bg-blue-950/40 cursor-pointer transition"
                          >
                            <td className="py-2.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-bold text-white">
                              {pHandle} <span className="text-slate-400 font-normal">({p.nickname})</span>
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-400">{p.tiktokUserId}</td>
                            <td className="py-2.5 px-4 font-mono text-[#FDA4AF] font-bold">
                              {p.coinsInSession.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-emerald-400 font-bold">{p.ticketsInSession}</td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-[#FDA4AF] max-w-xs truncate">
                              {pTickets.length > 0
                                ? `#${pTickets.slice(0, 8).join(', #')}${
                                    pTickets.length > 8 ? ` (+${pTickets.length - 8})` : ''
                                  }`
                                : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <span className="text-[11px] text-[#FDA4AF] font-semibold hover:underline">
                                Histórico Individual
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Persisted Combo Streaks & Complete Event History Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                {/* Persisted Combo Streaks (Survives Server Restart) */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <span>Estado Persistido de Combos / Streaks ({persistedSessionStreaks.length})</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">Recuperável pós-restart</span>
                  </div>
                  {persistedSessionStreaks.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      Nenhum combo registrado nesta sessão ainda.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {persistedSessionStreaks.slice(0, 20).map((st) => (
                        <div
                          key={st.streakKey}
                          className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div className="truncate">
                            <span className="font-mono text-white font-semibold">{st.streakKey}</span>
                            <p className="text-[10px] text-slate-400">
                              Último repeatCount processado: <strong className="text-amber-300">{st.lastProcessedRepeatCount}x</strong>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono text-amber-400 font-bold">{st.totalCoins} moedas</span>
                            <span
                              className={`block text-[9px] font-mono uppercase ${
                                st.status === 'COMPLETED' ? 'text-emerald-400' : 'text-cyan-400'
                              }`}
                            >
                              {st.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Complete Persisted Gift Events Log */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-cyan-400" />
                      <span>Histórico Completo de Eventos ({persistedSessionEvents.length})</span>
                    </h3>
                    <span className="text-[10px] font-mono text-slate-500">Idempotente no Firestore</span>
                  </div>
                  {persistedSessionEvents.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      Nenhum evento persistido nesta sessão ainda.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {persistedSessionEvents.slice(0, 25).map((ev) => {
                        const hasHandle = ev.handleAvailable !== false && ev.username && ev.username !== 'arroba_indisponivel';
                        const evHandle = hasHandle ? `@${ev.username}` : 'Arroba indisponível';
                        return (
                          <div
                            key={ev.eventId}
                            className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="truncate">
                              <span className="font-bold text-white">{evHandle}</span>{' '}
                              <span className="text-rose-400 font-semibold">{ev.giftName}</span>{' '}
                              <span className="text-slate-400 font-mono">
                                (delta +{ev.deltaCount} / repeat {ev.repeatCount}x)
                              </span>
                              <p className="text-[10px] font-mono text-slate-500 truncate">
                                ID: {ev.eventId} | Regra: {ev.rateApplied} moedas/nº
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-amber-400">+{ev.coinsGranted}</span>
                              <span className="block text-[10px] font-mono text-slate-500">
                                {new Date(ev.receivedAt).toLocaleTimeString('pt-BR')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* System Cryptographic & Operational Audit Trail */}
              {auditLogs.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Trilha de Auditoria Operacional ({auditLogs.length} registros recentes)
                  </h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto font-mono text-[11px] text-slate-400">
                    {auditLogs.slice(0, 15).map((log) => (
                      <div key={log.logId} className="flex items-center justify-between py-1 border-b border-slate-900">
                        <span className="truncate">
                          <strong className="text-cyan-400">[{log.category}]</strong> {log.action}
                        </span>
                        <span className="text-slate-500 shrink-0 ml-2">
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drilldown Modal if participant selected */}
              {selectedGlobalParticipant && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                  <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-white">
                          @{selectedGlobalParticipant.global.currentUsername}
                        </h3>
                        <p className="text-xs text-slate-400">
                          ID TikTok: {selectedGlobalParticipant.global.tiktokUserId}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedGlobalParticipant(null)}
                        className="text-xs text-slate-400 hover:text-white"
                      >
                        Fechar
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase">Moedas Vitalícias</span>
                        <p className="text-lg font-mono font-bold text-amber-400">
                          {selectedGlobalParticipant.global.totalCoinsLifetime.toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase">Bilhetes Vitalícios</span>
                        <p className="text-lg font-mono font-bold text-emerald-400">
                          {selectedGlobalParticipant.global.totalTicketsLifetime.toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Transmissões Participadas ({selectedGlobalParticipant.participations.length})
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {selectedGlobalParticipant.participations.map((part) => (
                          <div
                            key={part.sessionId}
                            className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                          >
                            <span className="font-mono text-slate-300 truncate max-w-[200px]">
                              {part.sessionId}
                            </span>
                            <div className="text-right">
                              <span className="font-mono text-amber-400 font-bold">{part.coinsContributed} moedas</span>
                              <span className="text-slate-500 text-[10px] ml-2">({part.ticketsIssued} bilhetes)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: LIVE SYSTEM MONITOR (EXCLUSIVE ADMIN HEALTH & SSE DURABLE RECOVERY PANEL) */}
          {activeProTab === 'monitor' && (
            <LiveSystemMonitor
              sessionId={currentSessionId}
              roomUsername={roomUsername}
              isAdminAuthorized={isAdminAuthorized}
              adminLabel={oauthUser?.display_name || adminLabel}
              onTriggerQueueRecovery={handleRecoverQueue}
              isRecoveringQueue={isRecoveringQueue}
              externalSnapshot={perfDiagnostics?.monitorSnapshot || null}
            />
          )}
        </div>
      )}

      {/* MOTOR 1 DRAW MODAL */}
      {motor1Snapshot && (
        <TikTokLiveDrawModal
          isOpen={isMotor1DrawModalOpen}
          onClose={() => setIsMotor1DrawModalOpen(false)}
          drawType="INDIVIDUAL_LIVE"
          targetTitle={activeSession?.roomTitle || `LIVE @${roomUsername}`}
          prizeName={motor1PrizeInput}
          snapshot={motor1Snapshot}
          onDrawCompleted={() => {
            initOrRefreshSession(currentSessionId, roomUsername);
          }}
          onExecuteDraw={async () => {
            return await executeIndividualLiveDraw(
              currentSessionId,
              motor1Snapshot.snapshotId,
              motor1PrizeInput
            );
          }}
        />
      )}

      {/* MOTOR 2 DRAW MODAL */}
      {campaignSnapshot && (
        <TikTokLiveDrawModal
          isOpen={isCampaignDrawModalOpen}
          onClose={() => setIsCampaignDrawModalOpen(false)}
          drawType="CAMPAIGN"
          targetTitle={selectedCampaign?.title || 'Campanha Especial Multi-LIVE'}
          prizeName={selectedCampaign?.prizeName || 'Super Prêmio'}
          snapshot={campaignSnapshot}
          onDrawCompleted={() => {
            refreshCampaigns();
          }}
          onExecuteDraw={async () => {
            return await executeCampaignDraw(
              campaignSnapshot.targetId,
              campaignSnapshot.snapshotId,
              selectedCampaign?.prizeName
            );
          }}
        />
      )}

      {/* CREATE CAMPAIGN MODAL */}
      <CampaignCreateModal
        isOpen={isCreateCampaignModalOpen}
        onClose={() => setIsCreateCampaignModalOpen(false)}
        availableSessions={allSessions.length > 0 ? allSessions : activeSession ? [activeSession] : []}
        onCampaignCreated={() => {
          refreshCampaigns();
        }}
      />
    </div>
  );
};
