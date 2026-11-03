import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio,
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
  ChevronDown,
  ChevronUp,
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
  RaffleSettings,
  Winner,
  GiftPersistenceStatus,
  TikTokPerformanceDiagnostics,
  ProPlanEntitlement,
  SubscriptionPlanTier,
  OrganizerRaffleDefaults,
  DeliveryStatus,
} from '../types.js';
import {
  getOrCreateLiveSession,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
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
  getAuthBearerHeaders,
  getOrganizerRaffleDefaults,
  saveOrganizerRaffleDefaults,
} from '../utils/tiktokLiveService.js';
import { auth } from '../firebase.js';
import {
  fetchCampaigns,
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
import { TikTokLiveGiftsArenaView } from './TikTokLiveGiftsArenaView.js';
import { CampaignCreateModal } from './CampaignCreateModal.js';
import { LiveSystemMonitor } from './LiveSystemMonitor.js';
import {
  tiktokConnector,
  tiktokEventBus,
  DeduplicationStats,
  RawTikTokGiftMessage,
} from '../utils/tiktokConnector.js';
import {
  mapTikTokConnectionState,
  mapLiveSessionCommercialStatus,
} from '../utils/tiktokStatusMapper.js';

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
  avatarUrl?: string;
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

const GiftAvatarCell: React.FC<{
  avatarUrl?: string;
  nickname: string;
  username: string;
  handleAvailable: boolean;
}> = React.memo(({ avatarUrl, nickname, username, handleAvailable }) => {
  const [imgError, setImgError] = useState(false);
  const cleanName = (nickname || '').trim();
  const cleanUser = (username || '').trim().replace(/^@+/, '');
  const initialSource =
    cleanName && cleanName !== 'Usuário não identificado'
      ? cleanName
      : handleAvailable && cleanUser && cleanUser !== 'arroba_indisponivel'
      ? cleanUser
      : '?';
  const initial = initialSource.charAt(0).toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={cleanName || cleanUser || 'Participante'}
        onError={() => setImgError(true)}
        className="w-8 h-8 rounded-full object-cover border border-[#313D39] shrink-0 bg-[#171D1C]"
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-[#2B3632] border border-[#313D39] text-[#EAE7DE] font-semibold text-xs flex items-center justify-center shrink-0">
      {initial}
    </div>
  );
});
GiftAvatarCell.displayName = 'GiftAvatarCell';

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

  // Active sub-tab inside Advanced Resources
  const [activeProTab, setActiveProTab] = useState<'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor'>(initialProTab);

  // Collapsible Advanced Resources section (closed by default per Phase 2 specification)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(() =>
    initialProTab === 'motor2' || initialProTab === 'monitor' || initialProTab === 'audit'
  );
  const [advancedTab, setAdvancedTab] = useState<'campaigns' | 'oauth' | 'monitor' | 'history'>(() => {
    if (initialProTab === 'motor2') return 'campaigns';
    if (initialProTab === 'monitor') return 'monitor';
    if (initialProTab === 'audit') return 'history';
    return 'campaigns';
  });

  // View mode inside Block 4 (Real-time gifts table vs Participants ranking)
  const [block4View, setBlock4View] = useState<'gifts' | 'participants'>('gifts');

  useEffect(() => {
    setPlatformMode(initialPlatformMode);
  }, [initialPlatformMode]);

  useEffect(() => {
    setActiveProTab(initialProTab);
    if (initialProTab === 'motor2') {
      setIsAdvancedOpen(true);
      setAdvancedTab('campaigns');
    } else if (initialProTab === 'monitor') {
      setIsAdvancedOpen(true);
      setAdvancedTab('monitor');
    } else if (initialProTab === 'audit') {
      setIsAdvancedOpen(true);
      setAdvancedTab('history');
    }
  }, [initialProTab]);

  // TikTok Live Connection State (initialized from shared tiktokConnector singleton)
  const [roomUsername, setRoomUsername] = useState(() => tiktokConnector.getRoomUsername() || 'gioborelli');
  const [connectionStatus, setConnectionStatus] = useState<TikTokConnectionStatus>(() =>
    tiktokConnector.getLastKnownStatus()
  );
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

  // Active Live Session State & All Recorded Sessions (persisted via tiktokConnector across navigation & F5)
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => tiktokConnector.getSessionId());
  const [activeSession, setActiveSession] = useState<TikTokLiveSession | null>(null);
  const [allSessions, setAllSessions] = useState<TikTokLiveSession[]>([]);
  const [liveGiftsFeed, setLiveGiftsFeed] = useState<LiveFeedGiftItem[]>(() =>
    tiktokConnector.getCachedGiftsFeed()
  );
  const [memberPresenceFeed, setMemberPresenceFeed] = useState<TikTokMemberPresenceEvent[]>(() =>
    tiktokConnector.getCachedMemberFeed()
  );
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

  // Etapa 2: Organizer Defaults & Campaign Pre-Selection State
  const [organizerDefaults, setOrganizerDefaults] = useState<OrganizerRaffleDefaults | null>(null);
  const [isOrganizerConfigModalOpen, setIsOrganizerConfigModalOpen] = useState(false);
  const [selectedCampaignIdForConnect, setSelectedCampaignIdForConnect] = useState<string>('');
  const [isSavingOrganizerDefaults, setIsSavingOrganizerDefaults] = useState(false);

  // Form states for Organizer Defaults Modal
  const [defRaffleTitle, setDefRaffleTitle] = useState('Sorteio Oficial da LIVE');
  const [defPrizeName, setDefPrizeName] = useState('Prêmio Especial da LIVE');
  const [defRate, setDefRate] = useState('100');
  const [defMinCoins, setDefMinCoins] = useState('1');
  const [defMaxUserTickets, setDefMaxUserTickets] = useState('');
  const [defMaxTotalTickets, setDefMaxTotalTickets] = useState('');
  const [defAllowDuplicateWinners, setDefAllowDuplicateWinners] = useState(true);
  const [defRulesNotes, setDefRulesNotes] = useState(
    'Moedas enviadas em presentes durante a transmissão convertem-se automaticamente em bilhetes numerados.'
  );

  // Load Organizer Defaults on mount
  useEffect(() => {
    let isSubscribed = true;
    getOrganizerRaffleDefaults()
      .then((def) => {
        if (!isSubscribed || !def) return;
        setOrganizerDefaults(def);
        if (def.defaultRaffleTitle) {
          setDefRaffleTitle(def.defaultRaffleTitle);
          setRaffleTitleInput(def.defaultRaffleTitle);
        }
        if (def.defaultPrizeName) {
          setDefPrizeName(def.defaultPrizeName);
          setMotor1PrizeInput(def.defaultPrizeName);
        }
        if (def.defaultRate) {
          setDefRate(String(def.defaultRate));
          setNewRateValue(String(def.defaultRate));
        }
        if (def.defaultMinCoinsPerGift) {
          setDefMinCoins(String(def.defaultMinCoinsPerGift));
          setMinCoinsPerGiftInput(String(def.defaultMinCoinsPerGift));
        }
        if (def.defaultMaxTicketsPerUser) {
          setDefMaxUserTickets(String(def.defaultMaxTicketsPerUser));
          setMaxTicketsPerUserInput(String(def.defaultMaxTicketsPerUser));
        }
        if (def.defaultMaxTotalTickets) {
          setDefMaxTotalTickets(String(def.defaultMaxTotalTickets));
          setMaxTotalTicketsInput(String(def.defaultMaxTotalTickets));
        }
        if (def.allowDuplicateWinners !== undefined) {
          setDefAllowDuplicateWinners(def.allowDuplicateWinners);
          setAllowDuplicateWinnersInput(def.allowDuplicateWinners);
        }
        if (def.defaultParticipationRulesNotes) {
          setDefRulesNotes(def.defaultParticipationRulesNotes);
          setParticipationRulesNotesInput(def.defaultParticipationRulesNotes);
        }
      })
      .catch((err) => {
        console.warn('Could not load organizer defaults:', err);
      });
    return () => {
      isSubscribed = false;
    };
  }, []);

  // Handler: Save Organizer Defaults
  const handleSaveOrganizerDefaults = async () => {
    setIsSavingOrganizerDefaults(true);
    try {
      const payload: Partial<OrganizerRaffleDefaults> = {
        defaultRaffleTitle: defRaffleTitle.trim() || 'Sorteio Oficial da LIVE',
        defaultPrizeName: defPrizeName.trim() || 'Prêmio Especial da LIVE',
        coinsPerTicket: Math.max(1, parseInt(defRate, 10) || 100),
        defaultRate: Math.max(1, parseInt(defRate, 10) || 100),
        minCoinsPerGift: Math.max(1, parseInt(defMinCoins, 10) || 1),
        defaultMinCoinsPerGift: Math.max(1, parseInt(defMinCoins, 10) || 1),
        maxTicketsPerUser:
          defMaxUserTickets.trim() !== '' && Number(defMaxUserTickets) > 0
            ? Math.floor(Number(defMaxUserTickets))
            : null,
        defaultMaxTicketsPerUser:
          defMaxUserTickets.trim() !== '' && Number(defMaxUserTickets) > 0
            ? Math.floor(Number(defMaxUserTickets))
            : null,
        maxTotalTickets:
          defMaxTotalTickets.trim() !== '' && Number(defMaxTotalTickets) > 0
            ? Math.floor(Number(defMaxTotalTickets))
            : null,
        defaultMaxTotalTickets:
          defMaxTotalTickets.trim() !== '' && Number(defMaxTotalTickets) > 0
            ? Math.floor(Number(defMaxTotalTickets))
            : null,
        allowDuplicateWinners: defAllowDuplicateWinners,
        defaultParticipationRulesNotes: defRulesNotes.trim(),
      };
      const saved = await saveOrganizerRaffleDefaults(payload);
      setOrganizerDefaults(saved);
      setIsOrganizerConfigModalOpen(false);
      setSystemNotice({
        type: 'success',
        text: 'Configuração permanente do organizador salva com sucesso! Será adotada automaticamente em novas transmissões.',
      });
    } catch (err) {
      setSystemNotice({
        type: 'error',
        text: `Erro ao salvar configuração permanente: ${(err as Error).message}`,
      });
    } finally {
      setIsSavingOrganizerDefaults(false);
    }
  };

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
  const [hasLoadedCampaigns, setHasLoadedCampaigns] = useState<boolean>(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [missingLinkedCampaignWarning, setMissingLinkedCampaignWarning] = useState<string | null>(null);
  const recoveredSessionCampaignRef = useRef<string>('');
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
  const [liveDrawTargetMode, setLiveDrawTargetMode] = useState<'SESSION' | 'CAMPAIGN'>('SESSION');
  const [isLoadingLiveDetails, setIsLoadingLiveDetails] = useState<boolean>(false);
  const [isFreezingCampaign, setIsFreezingCampaign] = useState<boolean>(false);
  const [liveDrawFeedback, setLiveDrawFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
  const [perfDiagnostics, setPerfDiagnostics] = useState<TikTokPerformanceDiagnostics | null>(() =>
    tiktokConnector.getCachedDiagnostics()
  );
  const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState<boolean>(true);
  const [isRecoveringQueue, setIsRecoveringQueue] = useState<boolean>(false);

  const giftPersistQueueRef = useRef<Promise<any>>(Promise.resolve());
  const localSendSeqRef = useRef<number>(0);
  const debouncedSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clientLatencySamplesRef = useRef<{ display: number[]; persist: number[] }>({
    display: [],
    persist: [],
  });
  const pendingCaptureTimesRef = useRef<Map<string, number>>(new Map());

  // Synchronize initial connection status & active sessionId with /api/tiktok/status & check OAuth 2.0 status
  useEffect(() => {
    tiktokConnector
      .syncWithBackendStatus()
      .then((syncedStatus) => {
        if (syncedStatus) {
          setConnectionStatus((prev) => ({
            ...prev,
            ...syncedStatus,
          }));
          if (syncedStatus.roomUsername) {
            setRoomUsername(syncedStatus.roomUsername);
          }
          if (syncedStatus.sessionId && syncedStatus.sessionId !== currentSessionId) {
            setCurrentSessionId(syncedStatus.sessionId);
          }
        }
      })
      .catch(() => {});

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

    getAuthBearerHeaders()
      .then((authHeaders) => fetch('/api/tiktok/plan/status', { headers: { ...authHeaders } }))
      .then((r) => r.json())
      .then((data) => {
        if (data && data.tier) {
          setPlanEntitlement(data);
          setProPlanTier(data.tier, data.statusState);
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
      if (sess.campaignId) {
        setSelectedCampaignIdForConnect(sess.campaignId);
      }
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
      setHasLoadedCampaigns(true);
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

  // Automatic Campaign & Cycle Recovery on Session Init / F5
  useEffect(() => {
    if (!activeSession?.campaignId) {
      setMissingLinkedCampaignWarning(null);
      return;
    }

    const linkedCid = activeSession.campaignId;
    setSelectedCampaignIdForConnect(linkedCid);

    if (!hasLoadedCampaigns) return;

    const found = campaigns.find((c) => c.campaignId === linkedCid) || null;
    if (found) {
      const recoveryKey = `${activeSession.sessionId}:${linkedCid}:${activeSession.cycleId || ''}`;
      if (
        recoveredSessionCampaignRef.current !== recoveryKey ||
        !selectedCampaign ||
        selectedCampaign.campaignId === linkedCid
      ) {
        recoveredSessionCampaignRef.current = recoveryKey;
        setSelectedCampaign(found);
      }
      setMissingLinkedCampaignWarning(null);
    } else {
      setSelectedCampaign(null);
      setMissingLinkedCampaignWarning(
        `A sessão ativa (${activeSession.sessionId}) está vinculada à campanha "${linkedCid}"${
          activeSession.cycleId ? ` (Ciclo: ${activeSession.cycleId})` : ''
        }, que não foi encontrada na lista de campanhas. O vínculo original foi preservado sem substituição silenciosa.`
      );
    }
  }, [
    activeSession?.sessionId,
    activeSession?.campaignId,
    activeSession?.cycleId,
    campaigns,
    hasLoadedCampaigns,
    selectedCampaign,
  ]);

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

      const capturePerfT0 = performance.now();
      const dedupeKey = tiktokEventBus.resolveDeduplicationKey(giftPayload);
      const resolvedEventKey = giftPayload.eventKey || dedupeKey;
      giftPayload.eventKey = resolvedEventKey;
      pendingCaptureTimesRef.current.set(resolvedEventKey, capturePerfT0);

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

      if (rawEvent.serverManagedPersistence) {
        setDedupeStats(tiktokEventBus.getStats());
        return { persisted: false, isDuplicate: false, serverManaged: true };
      }

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
                avatarUrl: giftPayload.avatarUrl || existing.avatarUrl,
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
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/tiktok/queue/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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

  // Connect to EventBus and manage real-time event pipeline via unified tiktokConnector singleton SSE stream.
  // Unmounting TikTokLiveManager NEVER closes the SSE stream or the Webcast connection.
  useEffect(() => {
    let isDisposed = false;

    // Ensure the unified singleton SSE stream is open for the current sessionId
    tiktokConnector.ensureSseStream(currentSessionId);

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
        const next = [
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
            avatarUrl: String(event.avatarUrl || ''),
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
        tiktokConnector.setCachedGiftsFeed(next);
        return next;
      });
      setDedupeStats(tiktokEventBus.getStats());
      setConnectionStatus((prev) => ({
        ...prev,
        totalGiftsReceived: prev.totalGiftsReceived + delta,
        totalCoinsCollected: prev.totalCoinsCollected + Number(event.coinsGranted || event.coins || 0),
      }));
    });

    const unsubDuplicate = tiktokEventBus.subscribe('duplicate_dropped', () => {
      setDedupeStats(tiktokEventBus.getStats());
    });

    const unsubState = tiktokEventBus.subscribe('connection_state', (state: any) => {
      setConnectionStatus((prev) => ({
        ...prev,
        state: state as TikTokConnectionStatus['state'],
      }));
    });

    const unsubStatus = tiktokEventBus.subscribe('status', (data: any) => {
      if (data) {
        const resolvedSid = data.sessionId || data.status?.sessionId;
        const resolvedState = (data.state as TikTokConnectionStatus['state']) || undefined;
        const isBackendActive =
          resolvedState === 'CONNECTED' ||
          resolvedState === 'CONNECTING' ||
          resolvedState === 'RECONNECTING' ||
          Boolean(data.persistedSessionActive);

        if (resolvedSid && isBackendActive && resolvedSid !== currentSessionId) {
          setCurrentSessionId(resolvedSid);
        }
        if (data.roomUsername) {
          setRoomUsername(data.roomUsername);
        }

        setConnectionStatus((prev) => ({
          ...prev,
          state: resolvedState || prev.state,
          sessionId: resolvedSid || prev.sessionId,
          activeRuleId: data.activeRuleId || prev.activeRuleId,
          roomUsername: data.roomUsername || prev.roomUsername,
          roomId: data.roomId || prev.roomId,
          roomTitle: data.roomTitle || prev.roomTitle,
          viewerCount: data.viewerCount !== undefined ? data.viewerCount : prev.viewerCount,
          warning: data.warning !== undefined ? data.warning : prev.warning,
          disconnectReason: data.disconnectReason !== undefined ? data.disconnectReason : prev.disconnectReason,
        }));
      }
    });

    const unsubSessionChanged = tiktokEventBus.subscribe('session_changed', (data: any) => {
      if (data?.sessionId && data.sessionId !== currentSessionId) {
        setCurrentSessionId(data.sessionId);
      }
    });

    const sendBrowserCursorAck = (sequenceNumber: number, eventId: string, recvMonoT0: number) => {
      if (!sequenceNumber || sequenceNumber <= 0) return;
      const scheduleFrame =
        typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame
          : (cb: () => void) => setTimeout(cb, 4);

      scheduleFrame(() => {
        if (isDisposed) return;
        const browserRenderLatencyMs = Math.max(0.05, Number((performance.now() - recvMonoT0).toFixed(2)));
        const client = tiktokConnector.getClient();
        client.setLastConfirmedSequence(sequenceNumber, currentSessionId);

        getAuthBearerHeaders()
          .then((authHeaders) =>
            fetch('/api/tiktok/stream/ack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({
                sessionId: currentSessionId,
                clientId: client.getClientId(),
                clientSecret: client.getClientSecret(),
                sequenceNumber,
                eventId,
                browserRenderLatencyMs,
              }),
            })
          )
          .catch(() => {});
      });
    };

    const applyPersistedOutboxPayload = (data: any, recvMonoT0: number) => {
      const seqNum = Number(data.sequenceNumber || 0);
      const confirmedKey = String(data.eventKey || data.event?.eventKey || '');
      const confirmedEventId = String(data.eventId || data.event?.eventId || '');

      if (seqNum > 0 && tiktokConnector.hasAppliedSequence(seqNum)) {
        return;
      }
      tiktokConnector.markSequenceApplied(seqNum, confirmedKey);

      const issuedTickets: number[] = Array.isArray(data.ticketNumbers) ? data.ticketNumbers : [];
      const evObj = data.event || data;
      const grantedCoins = Number(data.coinsGranted ?? evObj.coinsGranted ?? 0);
      const grantedDelta = Number(data.deltaCount ?? evObj.deltaCount ?? 1);
      const persistLatencyMs = Number(data.persistenceLatencyMs || 0);

      setLiveGiftsFeed((prev) => {
        const existsIdx = prev.findIndex(
          (item) => item.eventKey === confirmedKey || item.eventId === confirmedEventId
        );
        let next: LiveFeedGiftItem[];
        if (existsIdx >= 0) {
          next = prev.map((item, idx) =>
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
        } else {
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
            avatarUrl: String(evObj.avatarUrl || data.avatarUrl || ''),
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
          next = [newItem, ...prev.slice(0, 99)];
        }
        tiktokConnector.setCachedGiftsFeed(next);
        return next;
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

      if (seqNum > 0) {
        sendBrowserCursorAck(seqNum, confirmedEventId, recvMonoT0);
      }
    };

    const unsubRawGift = tiktokEventBus.subscribe('raw_sse_gift', (data: any) => {
      const eventData = data?.event || data;
      processGiftEventThroughEventBus({
        ...eventData,
        serverManagedPersistence: Boolean(data?.serverManagedPersistence),
      }).catch((err) => {
        console.warn('Erro ao processar presente via EventBus:', err);
      });
    });

    const unsubGiftConfirmed = tiktokEventBus.subscribe('gift_confirmed', (data: any) => {
      if (!data) return;
      const recvMonoT0 = typeof data._recvMonoT0 === 'number' ? data._recvMonoT0 : performance.now();
      applyPersistedOutboxPayload(data, recvMonoT0);
    });

    const unsubSyncRequired = tiktokEventBus.subscribe('sync_required', (data: any) => {
      initOrRefreshSession(currentSessionId, roomUsername);
      setSystemNotice({
        type: 'warning',
        text:
          data?.message ||
          'Cursor anterior fora da janela de retenção. O histórico intermediário não está mais disponível e o estado completo da sessão foi sincronizado.',
      });
    });

    const unsubDiagnostics = tiktokEventBus.subscribe('diagnostics', (diag: any) => {
      if (diag) {
        setPerfDiagnostics(diag as TikTokPerformanceDiagnostics);
      }
    });

    const unsubMember = tiktokEventBus.subscribe('member', (data: any) => {
      const memberEv = (data?.event || data) as TikTokMemberPresenceEvent;
      if (memberEv && memberEv.username) {
        setMemberPresenceFeed((prev) => {
          const next = [memberEv, ...prev.slice(0, 19)];
          tiktokConnector.setCachedMemberFeed(next);
          return next;
        });
      }
    });

    return () => {
      isDisposed = true;
      unsubGift();
      unsubDuplicate();
      unsubState();
      unsubStatus();
      unsubSessionChanged();
      unsubRawGift();
      unsubGiftConfirmed();
      unsubSyncRequired();
      unsubDiagnostics();
      unsubMember();
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
        text: `Ingressão de presentes pausada (${currentSessionId}). Novos presentes não gerarão bilhetes até a retomada.`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao pausar ingressão de presentes: ${(err as Error).message}` });
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
        text: `Ingressão de presentes aberta novamente (${currentSessionId})!`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao retomar ingressão de presentes: ${(err as Error).message}` });
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
        text: `Ingressão de presentes encerrada (${currentSessionId}). Os bilhetes emitidos permanecem prontos para sorteio.`,
      });
    } catch (err) {
      setSystemNotice({ type: 'error', text: `Erro ao encerrar ingressão de presentes: ${(err as Error).message}` });
    }
  };

  // Handler: Start a brand new LIVE session
  const handleStartNewLiveSession = async () => {
    const newSid = `live_${Date.now()}`;
    tiktokConnector.setSessionId(newSid, { reconnectStreamIfSessionChanged: true, clearFeeds: true });
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
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch(`/api/tiktok/probe/${encodeURIComponent(cleanUser)}`, {
        headers: { ...authHeaders },
      });
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
    const cleanUser = roomUsername.trim().replace(/^@/, '') || 'gioborelli';
    const chosenCampaign = campaigns.find((c) => c.campaignId === selectedCampaignIdForConnect);
    const effectiveCampaignId = chosenCampaign?.campaignId || selectedCampaignIdForConnect || undefined;
    const effectiveCycleId = chosenCampaign?.activeCycleId || activeSession?.cycleId || undefined;
    try {
      const outcome = await tiktokConnector.connect(cleanUser, currentSessionId, {
        rate: activeSession?.currentRate || organizerDefaults?.defaultRate || Number(newRateValue) || 100,
        campaignId: effectiveCampaignId,
        cycleId: effectiveCycleId,
        raffleTitle: activeSession?.raffleTitle || raffleTitleInput || organizerDefaults?.defaultRaffleTitle || 'Sorteio Oficial da LIVE',
        prizeName: activeSession?.prizeName || motor1PrizeInput || organizerDefaults?.defaultPrizeName || 'Prêmio Especial da LIVE',
        minCoinsPerGift: Number(minCoinsPerGiftInput || organizerDefaults?.defaultMinCoinsPerGift || 1),
        maxTicketsPerUser: maxTicketsPerUserInput ? Number(maxTicketsPerUserInput) : organizerDefaults?.defaultMaxTicketsPerUser || null,
        maxTotalTickets: maxTotalTicketsInput ? Number(maxTotalTicketsInput) : organizerDefaults?.defaultMaxTotalTickets || null,
        allowDuplicateWinners: allowDuplicateWinnersInput,
        participationRulesNotes: participationRulesNotesInput || organizerDefaults?.defaultParticipationRulesNotes || '',
      });

      const resolvedSid = outcome.sessionId || currentSessionId;
      await Promise.all([
        initOrRefreshSession(resolvedSid, cleanUser),
        refreshCampaigns(),
      ]);
      if (chosenCampaign) {
        setSelectedCampaign(chosenCampaign);
      }

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
          text: `Conectado em tempo real à transmissão ao vivo de @${cleanUser}!`,
        });
      } else {
        setConnectionStatus((prev) => ({
          ...prev,
          state: 'RECONNECTING',
          roomUsername: cleanUser,
          warning: `Escuta ativa para @${cleanUser}: a conta não está em LIVE neste instante (${outcome.error || 'aguardando início da transmissão'}). O conector reconectará automaticamente assim que a LIVE iniciar.`,
        }));
      }
    } catch (err) {
      const errorMsg = (err as Error).message || 'Falha ao conectar à transmissão';
      tiktokConnector.publishConnectionStatus({
        state: 'ERROR',
        roomUsername: cleanUser,
        warning: errorMsg,
      });
      setConnectionStatus((prev) => ({
        ...prev,
        state: 'ERROR',
        roomUsername: cleanUser,
        warning: errorMsg,
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
            'OAuth 2.0 requer TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e OAUTH_ENCRYPTION_KEY (256 bits) configuradas no servidor. A conexão direta via @username já está 100% funcional.',
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
        text: `Diagnóstico OAuth → TIKTOK_CLIENT_KEY: ${ck} | TIKTOK_CLIENT_SECRET: ${cs} | OAUTH_ENCRYPTION_KEY: ${ek} | Fluxo: ${flow}. ${
          data.canInitiateAuthFlow
            ? `Redirect URI: ${data.redirectUri}`
            : (data.configurationErrors || []).join(' ')
        }`,
      });
    } catch (err) {
      setSystemNotice({
        type: 'error',
        text: `Erro ao consultar diagnóstico OAuth: ${(err as Error).message}`,
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
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/tiktok/plan/tier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
          ...authHeaders,
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
      const authHeaders = await getAuthBearerHeaders();
      await fetch('/api/tiktok/pro/session-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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
        text: `Configurações do Sorteio salvas (${rate} moedas = 1 bilhete · Mínimo: ${minCoins} moeda(s)${
          maxPerUser ? ` · Máx/usuário: ${maxPerUser}` : ''
        }${maxTotal ? ` · Limite total: ${maxTotal}` : ''})!`,
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
      const authHeaders = await getAuthBearerHeaders();
      await fetch('/api/tiktok/pro/campaign-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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

  // Unified real-time gifts list (combines live stream items with persisted session events without duplicates)
  const unifiedGiftRows = React.useMemo<LiveFeedGiftItem[]>(() => {
    const seenIds = new Set<string>();
    const combined: LiveFeedGiftItem[] = [];

    for (const item of liveGiftsFeed) {
      seenIds.add(item.eventId);
      seenIds.add(item.eventKey);
      combined.push(item);
    }

    const participantAvatarMap = new Map<string, string>();
    const participantNicknameMap = new Map<string, string>();
    for (const p of sessionParticipants) {
      if (p.avatarUrl) participantAvatarMap.set(p.tiktokUserId, p.avatarUrl);
      if (p.nickname) participantNicknameMap.set(p.tiktokUserId, p.nickname);
    }

    for (const ev of persistedSessionEvents) {
      if (seenIds.has(ev.eventId)) continue;
      seenIds.add(ev.eventId);
      const hasHandle = Boolean(
        ev.handleAvailable !== false && ev.username && ev.username !== 'arroba_indisponivel'
      );
      const displayHandle =
        ev.displayHandle || (hasHandle ? `@${ev.username.replace(/^@+/, '')}` : 'Arroba indisponível');
      const nickname =
        ev.nickname ||
        participantNicknameMap.get(ev.tiktokUserId) ||
        (hasHandle ? ev.username : 'Participante');
      const avatarUrl = ev.avatarUrl || participantAvatarMap.get(ev.tiktokUserId) || '';
      const evTickets = Array.isArray(ev.ticketNumbers) ? ev.ticketNumbers : [];

      combined.push({
        id: ev.eventId,
        eventKey: ev.eventId,
        eventId: ev.eventId,
        tiktokUserId: ev.tiktokUserId,
        username: ev.username,
        displayHandle,
        handleAvailable: hasHandle,
        nickname,
        avatarUrl,
        giftName: ev.giftName,
        coins: ev.coinsGranted,
        tickets: evTickets,
        isStreak: ev.repeatCount > 1,
        repeatCount: ev.repeatCount,
        deltaCount: ev.deltaCount,
        timestamp: ev.receivedAt,
        status: 'CONFIRMED',
      });
    }

    const q = participantSearchQuery.trim().toLowerCase();
    if (!q) return combined;
    const cleanQ = q.replace(/^@+/, '');
    const ticketNumQuery = q.startsWith('#') ? parseInt(q.slice(1), 10) : /^\d+$/.test(q) ? parseInt(q, 10) : NaN;

    return combined.filter((item) => {
      const matchesUser =
        item.username.toLowerCase().includes(cleanQ) ||
        item.nickname.toLowerCase().includes(cleanQ) ||
        item.displayHandle.toLowerCase().includes(cleanQ) ||
        item.giftName.toLowerCase().includes(cleanQ);
      const matchesTicket = Number.isFinite(ticketNumQuery) && item.tickets.includes(ticketNumQuery);
      return matchesUser || matchesTicket;
    });
  }, [liveGiftsFeed, persistedSessionEvents, sessionParticipants, sessionTickets, participantSearchQuery]);

  // Handler: Freeze Motor 1 Snapshot
  const handleFreezeMotor1 = async () => {
    setIsFreezingMotor1(true);
    setLiveDrawFeedback(null);
    try {
      const snapshot = await createNonBlockingSessionSnapshot(currentSessionId);
      setMotor1Snapshot(snapshot);
      setIsMotor1DrawModalOpen(true);
    } catch (err) {
      const msg = (err as Error).message || 'Não foi possível preparar o snapshot da sessão.';
      setSystemNotice({ type: 'error', text: `Erro ao congelar rodada: ${msg}` });
      setLiveDrawFeedback({ type: 'error', text: msg });
    } finally {
      setIsFreezingMotor1(false);
    }
  };

  // Handler: Freeze Motor 2 Snapshot
  const handleFreezeCampaign = async (campaignId: string) => {
    setIsFreezingCampaign(true);
    setLiveDrawFeedback(null);
    try {
      const snapshot = await freezeCampaignSnapshot(campaignId);
      setCampaignSnapshot(snapshot);
      setIsCampaignDrawModalOpen(true);
      await refreshCampaigns();
    } catch (err) {
      const msg = (err as Error).message || 'Não foi possível preparar o snapshot da campanha.';
      setSystemNotice({ type: 'error', text: `Erro ao congelar lista da campanha: ${msg}` });
      setLiveDrawFeedback({ type: 'error', text: msg });
    } finally {
      setIsFreezingCampaign(false);
    }
  };

  // Never fall back to campaigns[0] when activeSession.campaignId is already bound
  const activeArenaCampaign = React.useMemo(() => {
    if (selectedCampaign) return selectedCampaign;
    if (activeSession?.campaignId) {
      return campaigns.find((c) => c.campaignId === activeSession.campaignId) || null;
    }
    return campaigns[0] || null;
  }, [selectedCampaign, activeSession?.campaignId, campaigns]);

  const handleRefreshArenaSessionsAndCampaigns = useCallback(async () => {
    setIsLoadingLiveDetails(true);
    setLiveDrawFeedback(null);
    try {
      await Promise.all([
        initOrRefreshSession(currentSessionId, roomUsername),
        refreshCampaigns(),
      ]);
    } finally {
      setIsLoadingLiveDetails(false);
    }
  }, [currentSessionId, roomUsername, initOrRefreshSession, refreshCampaigns]);

  const handlePrepareArenaLiveGiftsDraw = async () => {
    setLiveDrawFeedback(null);
    if (liveDrawTargetMode === 'SESSION') {
      if (!activeSession || (activeSession.currentTicketCounter || 0) <= 0) {
        setLiveDrawFeedback({
          type: 'error',
          text: 'Esta sessão LIVE ainda não possui bilhetes elegíveis emitidos.',
        });
        return;
      }
      await handleFreezeMotor1();
    } else {
      if (!activeArenaCampaign || (activeArenaCampaign.totalAccumulatedTickets || 0) <= 0) {
        setLiveDrawFeedback({
          type: 'error',
          text: 'Esta campanha não possui bilhetes acumulados elegíveis.',
        });
        return;
      }
      setSelectedCampaign(activeArenaCampaign);
      await handleFreezeCampaign(activeArenaCampaign.campaignId);
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

  const connMeta = mapTikTokConnectionState(
    connectionStatus.state,
    false,
    connectionStatus.roomUsername || roomUsername
  );
  const sessionCommercialMeta = mapLiveSessionCommercialStatus(activeSession?.status);

  const totalCoinsValue = activeSession?.totalCoins || connectionStatus.totalCoinsCollected || 0;
  const totalTicketsValue = activeSession?.currentTicketCounter || 0;
  const totalParticipantsValue = sessionParticipants.length;

  return (
    <div className="space-y-6 text-[#EAE7DE]">
      {(!planEntitlement.active || planEntitlement.tier !== 'PRO' || planEntitlement.statusState !== 'ACTIVE') && activeProTab !== 'audit' ? (
        /* PRO PLAN EXCLUSIVE GATE (VALIDATED ON BACKEND) */
        <div className="p-8 rounded-xl bg-[#222B28] border border-[#313D39] text-center space-y-5">
          <div className="w-14 h-14 rounded-xl bg-[#171D1C] border border-[#313D39] text-[#C6A56A] mx-auto flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <span className="text-xs font-mono font-semibold text-[#C6A56A]">
              Exclusivo TikTok LIVE PRO · Validação Backend Ativa
            </span>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#EAE7DE]">
              Módulos TikTok LIVE PRO Bloqueados no Plano FREE
            </h2>
            <p className="text-xs sm:text-sm text-[#9BA8A3] leading-relaxed">
              As ferramentas da área TikTok LIVE — incluindo a conexão em tempo real para <strong className="text-[#EAE7DE]">Sorteio por Presentes LIVE</strong>, contabilização automática de moedas em bilhetes, campanhas acumuladas e o <strong className="text-[#EAE7DE]">Sorteio por Comentários TikTok</strong> com auditoria criptográfica — são exclusivas dos assinantes do plano <strong className="text-[#6EAA90]">PRO</strong>.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => handleSwitchPlanTier('PRO')}
              disabled={isUpdatingPlan}
              className="px-5 py-2.5 rounded-lg font-semibold text-xs text-[#171D1C] bg-[#6EAA90] hover:bg-[#5E997F] transition flex items-center gap-2"
            >
              <Crown className="w-4 h-4" />
              <span>Ativar e Validar Plano PRO</span>
            </button>
            <button
              onClick={() => {
                setActiveProTab('audit');
                setIsAdvancedOpen(true);
                setAdvancedTab('history');
              }}
              className="px-4 py-2.5 rounded-lg font-medium text-xs text-[#EAE7DE] bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] transition flex items-center gap-1.5"
            >
              <Users className="w-4 h-4 text-[#6EAA90]" />
              <span>Consultar Histórico e Participantes Salvos</span>
            </button>
          </div>
        </div>
      ) : (
        /* ==============================================================
           TIKTOK LIVE PRO EXPERIENCE (MODALITY NAVIGATION)
           ============================================================== */
        <div className="space-y-6">
          {/* Top Modality Navigation Bar */}
          <div className="p-2 rounded-xl bg-[#222B28] border border-[#313D39] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPlatformMode('live_pro')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                  platformMode === 'live_pro'
                    ? 'bg-[#6EAA90] text-[#171D1C] shadow-sm'
                    : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                }`}
              >
                <Gift className="w-4 h-4" />
                <span>1. Presentes LIVE (Tempo Real)</span>
              </button>

              <button
                type="button"
                onClick={() => setPlatformMode('traditional_comments')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                  platformMode === 'traditional_comments'
                    ? 'bg-[#6EAA90] text-[#171D1C] shadow-sm'
                    : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>2. Sorteio por Comentários</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlatformMode('live_pro');
                  setIsAdvancedOpen(true);
                  setAdvancedTab('campaigns');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  isAdvancedOpen && advancedTab === 'campaigns' && platformMode === 'live_pro'
                    ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/60'
                    : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-[#6EAA90]" />
                <span>Multi-LIVE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPlatformMode('live_pro');
                  setIsAdvancedOpen(true);
                  setAdvancedTab('history');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  isAdvancedOpen && advancedTab === 'history' && platformMode === 'live_pro'
                    ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/60'
                    : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                }`}
              >
                <History className="w-3.5 h-3.5 text-[#6EAA90]" />
                <span>Histórico</span>
              </button>
            </div>
          </div>

          {platformMode === 'traditional_comments' ? (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#222B28] border border-[#313D39] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-[#C6A56A]">TIKTOK LIVE PRO</span>
                    <span className="text-xs text-[#9BA8A3]">·</span>
                    <span className="text-xs font-semibold text-[#6EAA90]">Auditoria Criptográfica CSPRNG</span>
                  </div>
                  <h2 className="text-base font-semibold text-[#EAE7DE] mt-0.5">
                    Sorteio por Comentários TikTok
                  </h2>
                  <p className="text-xs text-[#9BA8A3]">
                    Extração oficial via backend PRO, filtros avançados, contagem regressiva e laudo pericial em PDF com hash SHA-256.
                  </p>
                </div>
                <button
                  onClick={() => setPlatformMode('live_pro')}
                  className="px-4 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] border border-[#313D39] text-[#EAE7DE] font-semibold text-xs transition flex items-center gap-2 self-start sm:self-auto"
                >
                  <Gift className="w-4 h-4 text-[#6EAA90]" />
                  <span>Ir para Presentes LIVE</span>
                </button>
              </div>
              <TikTokRaffle
                settings={settings}
                soundEnabled={soundEnabled}
                onToggleSound={onToggleSound}
                onOpenVictoryCard={onOpenVictoryCard}
              />
            </div>
          ) : (
            <div className="space-y-6">
              {/* ==========================================================
                  BLOCO 1 — CONEXÃO TIKTOK LIVE, @USERNAME, CAMPANHA E CONFIGURAÇÃO PERMANENTE
                  ========================================================== */}
              <section
                id="tiktok-live-connection-section"
                className="p-5 sm:p-6 rounded-xl bg-[#222B28] border border-[#313D39] space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-lg sm:text-xl font-semibold text-[#EAE7DE] tracking-tight">
                        TikTok LIVE
                      </h1>
                      <span className="text-xs font-mono text-[#C6A56A]">· PRO</span>
                    </div>
                    <p className="text-xs text-[#9BA8A3] mt-0.5">
                      Informe o @ da transmissão ao vivo para acompanhar presentes e converter moedas em bilhetes automaticamente.
                    </p>
                  </div>

                  {/* Indicadores Oficiais Separados: Conexão Webcast vs Estado Comercial da Sessão */}
                  <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                    <div
                      title={connMeta.titleHint}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${connMeta.badgeClass}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${connMeta.dotClass}`} />
                      <span>{connMeta.label}</span>
                      {connMeta.state === 'CONNECTED' && connectionStatus.roomUsername && (
                        <span className="font-mono text-[#EAE7DE]">
                          · @{connectionStatus.roomUsername.replace(/^@+/, '')}
                        </span>
                      )}
                    </div>

                    <div
                      title="Estado comercial da sessão para contabilização de presentes"
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${sessionCommercialMeta.badgeClass}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${sessionCommercialMeta.dotClass}`} />
                      <span>{sessionCommercialMeta.label}</span>
                    </div>
                  </div>
                </div>

                {/* Connection Input & Primary Button */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-6 relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9BA8A3] text-sm font-mono">
                      @
                    </div>
                    <input
                      id="tiktok-live-username-input"
                      type="text"
                      value={roomUsername}
                      onChange={(e) => setRoomUsername(e.target.value)}
                      placeholder="usuario_da_live"
                      disabled={connectionStatus.state === 'CONNECTED'}
                      aria-label="Usuário da transmissão TikTok LIVE"
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-sm font-medium text-[#EAE7DE] placeholder-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90] disabled:opacity-60"
                    />
                  </div>

                  <div className="md:col-span-6 flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                    {connectionStatus.state === 'CONNECTED' || connectionStatus.state === 'RECONNECTING' ? (
                      <button
                        onClick={handleDisconnect}
                        className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs text-[#EAE7DE] bg-[#D96B6B]/20 hover:bg-[#D96B6B]/30 border border-[#D96B6B]/40 transition flex items-center justify-center gap-2"
                      >
                        <Square className="w-3.5 h-3.5 text-[#D96B6B]" />
                        <span>Desconectar da LIVE</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleConnect}
                        disabled={isConnecting}
                        className="flex-1 py-2.5 px-4 rounded-lg font-semibold text-xs text-[#171D1C] bg-[#6EAA90] hover:bg-[#5E997F] transition flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-[#171D1C]" />
                        )}
                        <span>Conectar ao TikTok LIVE</span>
                      </button>
                    )}

                    <button
                      onClick={handleProbeLive}
                      className="py-2.5 px-3.5 rounded-lg font-medium text-xs text-[#EAE7DE] bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] transition flex items-center justify-center gap-1.5 shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#6EAA90]" />
                      <span>Verificar Sala</span>
                    </button>
                  </div>
                </div>

                {/* Campaign Pre-selection & Organizer Defaults Control Row */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-2 border-t border-[#313D39]">
                  <div className="md:col-span-8 flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="text-xs text-[#9BA8A3] shrink-0 font-medium">
                      Vincular à Campanha:
                    </label>
                    <select
                      disabled={connectionStatus.state === 'CONNECTED'}
                      value={selectedCampaignIdForConnect}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setSelectedCampaignIdForConnect(cid);
                        const found = campaigns.find((c) => c.campaignId === cid) || null;
                        setSelectedCampaign(found);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90] disabled:opacity-60"
                    >
                      <option value="">Sorteio Avulso (sem campanha vinculada)</option>
                      {activeSession?.campaignId &&
                        !campaigns.some((c) => c.campaignId === activeSession.campaignId) && (
                          <option value={activeSession.campaignId}>
                            {activeSession.campaignId} (Vínculo preservado — não encontrada na lista)
                          </option>
                        )}
                      {campaigns.map((camp) => (
                        <option key={camp.campaignId} value={camp.campaignId}>
                          {camp.title} (
                          {camp.campaignMode === 'RECURRING_CUMULATIVE'
                            ? 'Recorrente Acumulativa'
                            : camp.campaignMode === 'RECURRING_RESET'
                            ? 'Recorrente com Reset'
                            : 'Sorteio Único'}
                          {camp.currentCycleIndex ? ` · Ciclo #${camp.currentCycleIndex}` : ''})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setIsOrganizerConfigModalOpen(true)}
                      className="w-full sm:w-auto py-2 px-3 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#C6A56A] border border-[#313D39] text-xs font-medium flex items-center justify-center gap-1.5 transition"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#C6A56A]" />
                      <span>Configuração Permanente</span>
                    </button>
                  </div>
                </div>

                {/* Clear Distinction: OAuth Identity vs Live Room Connection */}
                <div className="pt-2 border-t border-[#313D39] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#9BA8A3]">
                  <span>
                    Captura em tempo real via leitura da sala pública (<code className="text-[#EAE7DE] font-mono">tiktok-live-connector</code>). A conta OAuth identifica apenas o organizador e não substitui a conexão da sala.
                  </span>
                  {connectionStatus.viewerCount ? (
                    <span className="font-mono text-[#EAE7DE] shrink-0">
                      {connectionStatus.viewerCount.toLocaleString('pt-BR')} espectadores na sala
                    </span>
                  ) : null}
                </div>

                {/* System Notice / Probe Feedback / Connection Warning */}
                {systemNotice && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      systemNotice.type === 'success'
                        ? 'bg-[#6EAA90]/15 border-[#6EAA90]/40 text-[#EAE7DE]'
                        : systemNotice.type === 'error'
                        ? 'bg-[#D96B6B]/15 border-[#D96B6B]/40 text-[#EAE7DE]'
                        : systemNotice.type === 'warning'
                        ? 'bg-[#C6A56A]/15 border-[#C6A56A]/40 text-[#EAE7DE]'
                        : 'bg-[#171D1C] border-[#313D39] text-[#EAE7DE]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-[#6EAA90]" />
                      <span>{systemNotice.text}</span>
                    </div>
                    <button
                      onClick={() => setSystemNotice(null)}
                      className="text-xs text-[#9BA8A3] hover:text-[#EAE7DE] px-1.5 py-0.5 rounded"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {probeResult && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                      probeResult.isLive
                        ? 'bg-[#6EAA90]/15 border-[#6EAA90]/40 text-[#EAE7DE]'
                        : 'bg-[#C6A56A]/15 border-[#C6A56A]/40 text-[#EAE7DE]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-[#C6A56A]" />
                      <span>{probeResult.message}</span>
                    </div>
                    <button
                      onClick={() => setProbeResult(null)}
                      className="text-xs text-[#9BA8A3] hover:text-[#EAE7DE] px-1.5 py-0.5 rounded"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {connectionStatus.warning && (
                  <div className="p-3 rounded-lg bg-[#C6A56A]/15 border border-[#C6A56A]/40 text-xs text-[#EAE7DE] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-[#C6A56A]" />
                    <span>{connectionStatus.warning}</span>
                  </div>
                )}
              </section>

              {/* ==========================================================
                  BLOCO 2 — ARENA OFICIAL DE SORTEIO POR PRESENTES LIVE (2 COLUNAS)
                  ========================================================== */}
              <TikTokLiveGiftsArenaView
                liveConnectionState={connectionStatus.state}
                liveConnectedUsername={connectionStatus.roomUsername || roomUsername}
                refreshPlatformStatus={handleRefreshArenaSessionsAndCampaigns}
                isLoadingLiveDetails={isLoadingLiveDetails}
                onOpenManageConnection={() => {
                  const el = document.getElementById('tiktok-live-connection-section');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                  const inputEl = document.getElementById('tiktok-live-username-input');
                  if (inputEl) {
                    inputEl.focus();
                  }
                }}
                liveDrawFeedback={liveDrawFeedback}
                liveDrawTargetMode={liveDrawTargetMode}
                setLiveDrawTargetMode={setLiveDrawTargetMode}
                liveSessionsSummary={allSessions.length > 0 ? allSessions : activeSession ? [activeSession] : []}
                activeLiveSession={activeSession || allSessions[0] || null}
                setSelectedLiveSessionId={(sid) => {
                  tiktokConnector.setSessionId(sid, { reconnectStreamIfSessionChanged: true });
                  setCurrentSessionId(sid);
                }}
                liveCampaigns={campaigns}
                activeLiveCampaign={activeArenaCampaign}
                setSelectedCampaignId={(cid) => {
                  const found = campaigns.find((c) => c.campaignId === cid) || null;
                  setSelectedCampaign(found);
                }}
                settings={settings}
                livePrizeInput={motor1PrizeInput}
                setLivePrizeInput={setMotor1PrizeInput}
                isFreezingLiveSnapshot={isFreezingMotor1 || isFreezingCampaign}
                handlePrepareLiveGiftsDraw={handlePrepareArenaLiveGiftsDraw}
                selectedLiveDraws={
                  liveDrawTargetMode === 'SESSION'
                    ? sessionDraws
                    : (activeArenaCampaign ? campaignDrawsMap[activeArenaCampaign.campaignId] || [] : [])
                }
                selectedLiveParticipants={filteredSessionParticipants}
                onDrawsUpdated={() => {
                  initOrRefreshSession(currentSessionId, roomUsername);
                  refreshCampaigns();
                }}
                participantSearchQuery={participantSearchQuery}
                setParticipantSearchQuery={setParticipantSearchQuery}
                totalParticipantsCount={sessionParticipants.length}
                ticketsByParticipantMap={ticketsByParticipantMap}
                onExportCsv={handleExportCsv}
                onInspectParticipant={handleInspectParticipant}
                onPauseCollection={handlePauseCollection}
                onResumeCollection={handleResumeCollection}
                onEndCollection={handleEndCollection}
                onStartNewSession={handleStartNewLiveSession}
                onToggleSessionRules={() => setEditingRate((v) => !v)}
                isEditingSessionRules={editingRate}
                missingLinkedCampaignWarning={missingLinkedCampaignWarning}
              />

              {/* Expandable Session Rule Configuration Form (triggered from Arena Header) */}
              {editingRate && (
                <section className="p-5 rounded-xl bg-[#222B28] border border-[#313D39] space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-[#313D39]">
                    <h3 className="text-sm font-semibold text-[#EAE7DE] flex items-center gap-2">
                      <Settings className="w-4 h-4 text-[#C6A56A]" />
                      <span>Regras de Conversão e Elegibilidade da Sessão ({currentSessionId})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingRate(false)}
                      className="text-xs text-[#9BA8A3] hover:text-[#EAE7DE]"
                    >
                      Fechar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                        Nome do Sorteio da Sessão
                      </label>
                      <input
                        type="text"
                        value={raffleTitleInput}
                        onChange={(e) => setRaffleTitleInput(e.target.value)}
                        placeholder="Ex: Sorteio Oficial da LIVE"
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                        Prêmio em Disputa
                      </label>
                      <input
                        type="text"
                        value={motor1PrizeInput}
                        onChange={(e) => setMotor1PrizeInput(e.target.value)}
                        placeholder="Ex: Pix R$ 500 ou iPhone"
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#C6A56A] mb-1">
                        Moedas para Gerar 1 Bilhete *
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={newRateValue}
                        onChange={(e) => setNewRateValue(e.target.value)}
                        placeholder="100"
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#C6A56A]/60 text-xs font-mono font-semibold text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#9BA8A3] mb-1">
                        Mínimo de Moedas por Presente
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={minCoinsPerGiftInput}
                        onChange={(e) => setMinCoinsPerGiftInput(e.target.value)}
                        placeholder="1"
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#9BA8A3] mb-1">
                        Limite Máx. por Participante (Opcional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={maxTicketsPerUserInput}
                        onChange={(e) => setMaxTicketsPerUserInput(e.target.value)}
                        placeholder="Sem limite"
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#EAE7DE] placeholder-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#9BA8A3] mb-1">
                        Limite Total de Bilhetes na LIVE (Opcional)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={maxTotalTicketsInput}
                        onChange={(e) => setMaxTotalTicketsInput(e.target.value)}
                        placeholder="Sem limite"
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#EAE7DE] placeholder-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-8">
                      <label className="block text-xs text-[#9BA8A3] mb-1">
                        Observações da Regra
                      </label>
                      <input
                        type="text"
                        value={participationRulesNotesInput}
                        onChange={(e) => setParticipationRulesNotesInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                      />
                    </div>

                    <div className="sm:col-span-4 flex items-center gap-2 pt-4">
                      <input
                        id="allow-dup-winners"
                        type="checkbox"
                        checked={allowDuplicateWinnersInput}
                        onChange={(e) => setAllowDuplicateWinnersInput(e.target.checked)}
                        className="rounded border-[#313D39] bg-[#171D1C] text-[#6EAA90]"
                      />
                      <label htmlFor="allow-dup-winners" className="text-xs text-[#EAE7DE] cursor-pointer">
                        Permitir múltiplos prêmios ao mesmo usuário
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-[#313D39]">
                    <span className="text-[11px] text-[#9BA8A3]">
                      Bilhetes já emitidos permanecem inalterados. A nova regra vale imediatamente para os próximos presentes.
                    </span>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => setEditingRate(false)}
                        className="px-3 py-2 text-xs text-[#9BA8A3] hover:text-[#EAE7DE]"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveSessionRulesAndConfig}
                        disabled={isSavingSessionRules}
                        className="px-4 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E997F] text-[#171D1C] font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingSessionRules ? 'Salvando...' : 'Salvar Regra'}</span>
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {/* ==========================================================
                  BLOCO 3 — FEED DE PRESENTES RECEBIDOS EM TEMPO REAL (COM ANIMAÇÕES E COMBOS)
                  ========================================================== */}
              <section className="p-5 sm:p-6 rounded-xl bg-[#222B28] border border-[#313D39] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#313D39] pb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-[#EAE7DE] flex items-center gap-2">
                      <Gift className="w-4 h-4 text-[#6EAA90]" />
                      <span>Presentes Recebidos em Tempo Real</span>
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#6EAA90] tabular-nums">
                      {unifiedGiftRows.length} evento(s)
                    </span>
                  </div>
                  <p className="text-xs text-[#9BA8A3]">
                    Stream unificado com deduplicação idempotente, combos e geração atômica de bilhetes
                  </p>
                </div>

                {unifiedGiftRows.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-lg bg-[#171D1C] border border-[#313D39] space-y-2">
                    <Gift className="w-7 h-7 mx-auto text-[#9BA8A3]" />
                    <p className="text-sm font-medium text-[#EAE7DE]">
                      Nenhum presente recebido nesta transmissão ainda
                    </p>
                    <p className="text-xs text-[#9BA8A3] max-w-md mx-auto">
                      Assim que espectadores enviarem presentes para @{roomUsername}, cada evento aparecerá aqui em tempo real com moedas e bilhetes gerados.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-[#313D39] bg-[#171D1C]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#2B3632] text-[#9BA8A3] font-medium border-b border-[#313D39]">
                        <tr>
                          <th className="py-3 px-4">Participante</th>
                          <th className="py-3 px-4">@username</th>
                          <th className="py-3 px-4">Presente enviado</th>
                          <th className="py-3 px-4 text-right">Moedas</th>
                          <th className="py-3 px-4">Bilhetes gerados</th>
                          <th className="py-3 px-4 text-right">Horário</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#313D39]">
                        {unifiedGiftRows.map((item) => {
                          const isHandleValid =
                            item.handleAvailable &&
                            item.username &&
                            item.username !== 'arroba_indisponivel';
                          const handleText = isHandleValid
                            ? `@${item.username.replace(/^@+/, '')}`
                            : 'Arroba indisponível';
                          const timeString = new Date(item.timestamp).toLocaleTimeString('pt-BR', {
                            hour12: false,
                          });

                          return (
                            <tr
                              key={item.eventKey}
                              data-event-key={item.eventKey}
                              className="hover:bg-[#222B28] transition"
                            >
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <GiftAvatarCell
                                    avatarUrl={item.avatarUrl}
                                    nickname={item.nickname}
                                    username={item.username}
                                    handleAvailable={item.handleAvailable}
                                  />
                                  <span className="font-medium text-[#EAE7DE] truncate max-w-[160px]">
                                    {item.nickname || handleText}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-mono text-[#9BA8A3]">
                                {handleText}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-[#EAE7DE]">{item.giftName}</span>
                                  <span className="font-mono text-[#9BA8A3]">
                                    +{item.deltaCount || 1} un.
                                  </span>
                                  {item.isStreak && (
                                    <span className="text-[11px] font-mono text-[#C6A56A] flex items-center gap-0.5">
                                      <Flame className="w-3 h-3 text-[#C6A56A]" />
                                      {item.repeatCount}x
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-semibold text-[#C6A56A] tabular-nums">
                                +{item.coins.toLocaleString('pt-BR')}
                              </td>
                              <td className="py-3 px-4 font-mono">
                                {item.tickets.length > 0 ? (
                                  <span className="text-[#6EAA90] font-semibold">
                                    #{item.tickets.slice(0, 6).join(', #')}
                                    {item.tickets.length > 6 ? ` (+${item.tickets.length - 6})` : ''}
                                  </span>
                                ) : item.status === 'PENDING' ? (
                                  <span className="text-[#9BA8A3]">Processando...</span>
                                ) : (
                                  <span className="text-[#9BA8A3]">Saldo acumulado</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-[#9BA8A3] tabular-nums">
                                {timeString}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

          {/* ==========================================================
              BLOCO 5 — RECURSOS AVANÇADOS (RECOLHÍVEL, FECHADO POR PADRÃO)
              ========================================================== */}
          <section className="rounded-xl bg-[#222B28] border border-[#313D39] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsAdvancedOpen((prev) => !prev)}
              aria-expanded={isAdvancedOpen}
              className="w-full px-5 sm:px-6 py-4 flex items-center justify-between text-left hover:bg-[#2B3632]/50 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#171D1C] border border-[#313D39] flex items-center justify-center text-[#9BA8A3]">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[#EAE7DE]">
                    Recursos Avançados
                  </h2>
                  <p className="text-xs text-[#9BA8A3]">
                    Campanhas Multi-LIVE, conta OAuth TikTok, monitor técnico, recuperação SSE, fila WAL, snapshots e histórico de auditoria
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-[#9BA8A3] shrink-0">
                <span>{isAdvancedOpen ? 'Recolher' : 'Expandir'}</span>
                {isAdvancedOpen ? (
                  <ChevronUp className="w-4 h-4 text-[#EAE7DE]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#EAE7DE]" />
                )}
              </div>
            </button>

            {isAdvancedOpen && (
              <div className="p-5 sm:p-6 border-t border-[#313D39] space-y-6 bg-[#171D1C]/40">
                {/* Sub-navigation inside Advanced Resources */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#313D39] pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setAdvancedTab('campaigns')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
                        advancedTab === 'campaigns'
                          ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/50'
                          : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-[#6EAA90]" />
                      <span>Várias Transmissões (Multi-LIVE)</span>
                      <span className="font-mono text-[11px] text-[#C6A56A]">{campaigns.length}</span>
                    </button>

                    <button
                      onClick={() => setAdvancedTab('oauth')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
                        advancedTab === 'oauth'
                          ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/50'
                          : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#6EAA90]" />
                      <span>Conta TikTok e Diagnóstico OAuth</span>
                    </button>

                    <button
                      onClick={() => setAdvancedTab('monitor')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
                        advancedTab === 'monitor'
                          ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/50'
                          : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                      }`}
                    >
                      <Activity className="w-3.5 h-3.5 text-[#C6A56A]" />
                      <span>Monitor Técnico, SSE e Fila WAL</span>
                    </button>

                    <button
                      onClick={() => setAdvancedTab('history')}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
                        advancedTab === 'history'
                          ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/50'
                          : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
                      }`}
                    >
                      <History className="w-3.5 h-3.5 text-[#6EAA90]" />
                      <span>Snapshots, Histórico e Auditoria</span>
                    </button>
                  </div>

                  {/* Secondary Mode & Plan Controls */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setPlatformMode('traditional_comments')}
                      className="px-3 py-1.5 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] border border-[#313D39] text-xs text-[#9BA8A3] hover:text-[#EAE7DE] transition flex items-center gap-1.5"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Sorteador de Comentários</span>
                    </button>
                  </div>
                </div>

                {/* 1. SUB-TAB: MULTI-LIVE CAMPAIGNS (MOTOR 2) */}
                {advancedTab === 'campaigns' && (
                  <div className="space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[#EAE7DE]">
                          Gerenciar Várias Transmissões (Campanhas Multi-LIVE — Motor 2)
                        </h3>
                        <p className="text-xs text-[#9BA8A3]">
                          Reúna bilhetes acumulados de várias transmissões sem duplicação, com snapshots imutáveis e auditoria SHA-256.
                        </p>
                      </div>

                      <button
                        onClick={() => setIsCreateCampaignModalOpen(true)}
                        className="px-4 py-2 rounded-lg font-semibold text-xs text-[#171D1C] bg-[#6EAA90] hover:bg-[#5E997F] transition flex items-center gap-1.5 self-start sm:self-auto"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Nova Campanha Multi-LIVE</span>
                      </button>
                    </div>

                    {campaigns.length === 0 ? (
                      <div className="py-10 text-center rounded-lg bg-[#171D1C] border border-[#313D39] text-[#9BA8A3] text-xs space-y-3">
                        <Layers className="w-7 h-7 mx-auto text-[#9BA8A3]" />
                        <p>Nenhuma campanha acumulada criada ainda.</p>
                        <button
                          onClick={() => setIsCreateCampaignModalOpen(true)}
                          className="px-3.5 py-2 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] text-xs font-medium"
                        >
                          Criar Primeira Campanha
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {campaigns.map((camp) => {
                          const campDraws = campaignDrawsMap[camp.campaignId] || [];
                          const campSessions = campaignSessionsMap[camp.campaignId] || [];
                          const selectedSidForLink =
                            sessionToLinkByCampaign[camp.campaignId] || currentSessionId;
                          const isEditingThisCamp = editingCampaignId === camp.campaignId;

                          return (
                            <div
                              key={camp.campaignId}
                              className="p-5 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-4"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h4 className="text-sm font-semibold text-[#EAE7DE]">{camp.title}</h4>
                                    <span className="text-xs font-mono text-[#6EAA90]">
                                      · {camp.status}
                                    </span>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#222B28] text-[#C6A56A] border border-[#313D39]">
                                      {camp.campaignMode === 'RECURRING_CUMULATIVE'
                                        ? 'Recorrente Acumulativa'
                                        : camp.campaignMode === 'RECURRING_RESET'
                                        ? 'Recorrente com Reset'
                                        : 'Sorteio Único'}
                                    </span>
                                    {(camp.campaignMode === 'RECURRING_RESET' ||
                                      camp.campaignMode === 'RECURRING_CUMULATIVE') && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#171D1C] text-[#6EAA90] border border-[#6EAA90]/40 font-bold">
                                        Ciclo #{camp.currentCycleIndex || 1}
                                      </span>
                                    )}
                                    <span className="text-[11px] text-[#9BA8A3]">
                                      · {camp.legalStatus || 'Pendente de análise'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#9BA8A3] line-clamp-2 mt-1">{camp.description}</p>
                                </div>

                                <button
                                  onClick={() => {
                                    if (isEditingThisCamp) {
                                      setEditingCampaignId(null);
                                    } else {
                                      setEditingCampaignId(camp.campaignId);
                                      setEditCampRateInput(String(camp.defaultRate || 10));
                                      setEditCampMaxUserInput(
                                        camp.maxTicketsPerUser ? String(camp.maxTicketsPerUser) : ''
                                      );
                                      setEditCampMaxTotalInput(
                                        camp.maxTotalTickets ? String(camp.maxTotalTickets) : ''
                                      );
                                      setEditCampRulesInput(camp.rulesSummary || camp.description || '');
                                    }
                                  }}
                                  className="text-xs text-[#9BA8A3] hover:text-[#EAE7DE] px-2 py-1 rounded bg-[#222B28] border border-[#313D39]"
                                >
                                  {isEditingThisCamp ? 'Fechar' : 'Regras'}
                                </button>
                              </div>

                              {isEditingThisCamp && (
                                <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] space-y-3 text-xs">
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-[10px] text-[#9BA8A3] mb-1">Moedas/Bilhete</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={editCampRateInput}
                                        onChange={(e) => setEditCampRateInput(e.target.value)}
                                        className="w-full px-2 py-1.5 rounded bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#EAE7DE]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-[#9BA8A3] mb-1">Máx/Usuário</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={editCampMaxUserInput}
                                        onChange={(e) => setEditCampMaxUserInput(e.target.value)}
                                        placeholder="Livre"
                                        className="w-full px-2 py-1.5 rounded bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#EAE7DE]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[10px] text-[#9BA8A3] mb-1">Teto Total</label>
                                      <input
                                        type="number"
                                        min={1}
                                        value={editCampMaxTotalInput}
                                        onChange={(e) => setEditCampMaxTotalInput(e.target.value)}
                                        placeholder="Livre"
                                        className="w-full px-2 py-1.5 rounded bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#EAE7DE]"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => handleSaveCampaignRules(camp.campaignId)}
                                      className="px-3 py-1.5 rounded bg-[#6EAA90] text-[#171D1C] font-semibold text-xs"
                                    >
                                      Salvar Regras da Campanha
                                    </button>
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                                <div>
                                  <span className="text-[11px] text-[#9BA8A3]">Prêmio</span>
                                  <p className="font-semibold text-[#C6A56A] truncate">{camp.prizeName}</p>
                                </div>
                                <div>
                                  <span className="text-[11px] text-[#9BA8A3]">Bilhetes Acumulados</span>
                                  <p className="font-mono font-semibold text-[#6EAA90] tabular-nums">
                                    {camp.totalAccumulatedTickets.toLocaleString('pt-BR')}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-[#9BA8A3]">
                                <span>LIVEs participantes: {camp.participatingSessionIds.length}</span>
                                <span>
                                  Período: {new Date(camp.startDate).toLocaleDateString('pt-BR')} até{' '}
                                  {new Date(camp.cutoffDate).toLocaleDateString('pt-BR')}
                                </span>
                              </div>

                              {campSessions.length > 0 && (
                                <div className="p-2.5 rounded-lg bg-[#222B28] border border-[#313D39] space-y-1">
                                  <span className="text-[11px] font-medium text-[#9BA8A3]">
                                    Transmissões Vinculadas ({campSessions.length}):
                                  </span>
                                  <div className="space-y-1 max-h-24 overflow-y-auto">
                                    {campSessions.map((cs) => (
                                      <div key={cs.sessionId} className="flex items-center justify-between text-[11px]">
                                        <span className="font-mono text-[#EAE7DE] truncate">{cs.sessionId}</span>
                                        <span className="font-mono text-[#6EAA90]">{cs.indexedTicketsCount} bilhetes</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {campDraws.length > 0 && (
                                <div className="p-3 rounded-lg bg-[#222B28] border border-[#6EAA90]/40 space-y-1.5 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-[#6EAA90]">
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
                                      className="text-[11px] font-medium text-[#6EAA90] hover:underline flex items-center gap-1"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Baixar PDF</span>
                                    </button>
                                  </div>
                                  <p className="font-semibold text-[#EAE7DE]">
                                    Ganhador(a): @{campDraws[0].winnerName} · Bilhete #{campDraws[0].winningTicketNumber}
                                  </p>
                                  <p className="text-[10px] font-mono text-[#9BA8A3] truncate">
                                    LIVE Origem: {campDraws[0].winnerSessionId} | Hash: {campDraws[0].frozenRosterHash.slice(0, 20)}...
                                  </p>
                                </div>
                              )}

                              <div className="pt-2 border-t border-[#313D39] space-y-2">
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
                                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs font-mono text-[#EAE7DE]"
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
                                      className="px-3 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] text-xs font-medium shrink-0"
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
                                      className="w-full py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E997F] text-[#171D1C] font-semibold text-xs transition disabled:opacity-45"
                                    >
                                      Congelar Lista Final e Sortear
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
                                      className="w-full py-2 rounded-lg bg-[#C6A56A] text-[#171D1C] font-semibold text-xs"
                                    >
                                      Abrir Mesa de Sorteio Congelada
                                    </button>
                                  )}

                                  {camp.status === 'COMPLETED' && camp.campaignMode === 'SINGLE_DRAW' && (
                                    <span className="text-xs text-[#6EAA90] font-medium">
                                      ✓ Sorteio Acumulado Concluído e Auditado
                                    </span>
                                  )}

                                  {(camp.campaignMode === 'RECURRING_RESET' ||
                                    camp.campaignMode === 'RECURRING_CUMULATIVE') && (
                                    <div className="w-full pt-2">
                                      {Boolean(camp.pendingDeliveryCount && camp.pendingDeliveryCount > 0) ? (
                                        <div className="p-2.5 rounded bg-[#D96B6B]/15 border border-[#D96B6B]/40 text-[11px] text-[#D96B6B] space-y-1">
                                          <div className="font-semibold flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            <span>Próximo Ciclo Bloqueado</span>
                                          </div>
                                          <p>
                                            Entrega pendente ({camp.pendingDeliveryCount} prêmio(s)). Entregue o prêmio (DELIVERED) ou declare não comparecimento para liberar o ciclo seguinte.
                                          </p>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              const authHeaders = await getAuthBearerHeaders();
                                              const res = await fetch('/api/tiktok/pro/campaigns/cycle', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', ...authHeaders },
                                                body: JSON.stringify({ campaignId: camp.campaignId }),
                                              });
                                              const data = await res.json();
                                              if (!res.ok) {
                                                throw new Error(data.error || 'Erro ao avançar ciclo');
                                              }
                                              refreshCampaigns();
                                              setSystemNotice({
                                                type: 'success',
                                                text: `Ciclo #${data.cycleIndex || (camp.currentCycleIndex || 1) + 1} aberto com sucesso para "${camp.title}"!`,
                                              });
                                            } catch (err) {
                                              setSystemNotice({
                                                type: 'error',
                                                text: (err as Error).message,
                                              });
                                            }
                                          }}
                                          className="w-full py-1.5 px-3 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#6EAA90] border border-[#313D39] font-semibold text-xs transition flex items-center justify-center gap-1.5"
                                        >
                                          <RotateCw className="w-3.5 h-3.5" />
                                          <span>Abrir Próximo Ciclo (Ciclo #{(camp.currentCycleIndex || 1) + 1})</span>
                                        </button>
                                      )}
                                    </div>
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

                {/* 2. SUB-TAB: CONTA TIKTOK, OAUTH 2.0 & BACKUP */}
                {advancedTab === 'oauth' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-[#EAE7DE]">
                            Autenticação de Conta TikTok (Login Kit OAuth 2.0)
                          </h3>
                          <p className="text-xs text-[#9BA8A3]">
                            Opcional: autentica a identidade básica do organizador (<code className="font-mono text-[#EAE7DE]">user.info.basic</code>). Não substitui nem interfere na leitura da transmissão ao vivo.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={handleTikTokOAuthLogin}
                            className="py-2 px-3.5 rounded-lg text-xs font-medium bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] transition flex items-center gap-1.5"
                          >
                            {oauthUser?.avatar_url ? (
                              <img
                                src={oauthUser.avatar_url}
                                alt={oauthUser.display_name || 'TikTok'}
                                className="w-4 h-4 rounded-full object-cover"
                              />
                            ) : (
                              <ExternalLink className="w-3.5 h-3.5 text-[#6EAA90]" />
                            )}
                            <span>
                              {oauthUser
                                ? `Reconectar TikTok (${oauthUser.display_name || oauthUser.open_id})`
                                : 'Conectar Conta TikTok (OAuth 2.0)'}
                            </span>
                          </button>

                          {oauthUser && (
                            <button
                              onClick={handleTikTokOAuthLogout}
                              className="py-2 px-3 rounded-lg text-xs font-medium bg-[#D96B6B]/15 hover:bg-[#D96B6B]/25 text-[#D96B6B] border border-[#D96B6B]/40 transition"
                            >
                              Revogar OAuth
                            </button>
                          )}

                          <button
                            onClick={handleRunOAuthDiagnostic}
                            className="py-2 px-3 rounded-lg text-xs font-medium bg-[#222B28] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] transition flex items-center gap-1.5"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-[#6EAA90]" />
                            <span>Diagnóstico OAuth</span>
                          </button>

                          <button
                            onClick={handleDownloadBackupJson}
                            className="py-2 px-3 rounded-lg text-xs font-medium bg-[#222B28] hover:bg-[#2B3632] text-[#6EAA90] border border-[#313D39] transition flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Backup JSON</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[#222B28] border border-[#313D39] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                        <div>
                          <span className="text-[11px] text-[#9BA8A3] block">Status Login Kit</span>
                          <span
                            className={`font-mono font-semibold ${
                              oauthUser
                                ? 'text-[#6EAA90]'
                                : oauthStatus.canInitiateAuthFlow
                                ? 'text-[#EAE7DE]'
                                : 'text-[#C6A56A]'
                            }`}
                          >
                            {oauthUser
                              ? 'Autenticado'
                              : oauthStatus.canInitiateAuthFlow
                              ? 'Pronto'
                              : 'Aguardando Chave'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#9BA8A3] block">Nome de Exibição</span>
                          <span className="font-semibold text-[#EAE7DE] truncate block">
                            {oauthUser?.display_name || 'Não autenticado'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#9BA8A3] block">@username (OAuth)</span>
                          <span className="font-mono text-[#EAE7DE] truncate block">
                            {oauthUser?.username
                              ? `@${oauthUser.username.replace(/^@/, '')}`
                              : oauthUser
                              ? 'Escopo básico'
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#9BA8A3] block">Avatar Oficial</span>
                          <span className="text-[#EAE7DE] flex items-center gap-1.5">
                            {oauthUser?.avatar_url ? (
                              <>
                                <img
                                  src={oauthUser.avatar_url}
                                  alt="Avatar"
                                  className="w-4 h-4 rounded-full object-cover"
                                />
                                <span className="text-[#6EAA90]">Carregado</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#9BA8A3] block">Data da Autenticação</span>
                          <span className="font-mono text-[#9BA8A3]">
                            {oauthUser?.authenticatedAt || oauthStatus.authenticatedAt
                              ? new Date(
                                  Number(oauthUser?.authenticatedAt || oauthStatus.authenticatedAt)
                                ).toLocaleString('pt-BR')
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[#9BA8A3] block">Criptografia de Sessão</span>
                          <span className="font-mono text-[#EAE7DE]">
                            {oauthUser
                              ? oauthStatus.sessionState || 'ACTIVE (AES-256-GCM)'
                              : oauthStatus.sessionState || 'DISCONNECTED'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Backend Plan Entitlement Verification Control */}
                    <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-[#EAE7DE]">
                          Validação de Permissão de Plano no Servidor
                        </h4>
                        <p className="text-xs text-[#9BA8A3]">
                          Status atual no backend:{' '}
                          <strong className="text-[#6EAA90] font-mono">
                            {planEntitlement.active ? 'PRO ATIVO' : 'FREE'}
                          </strong>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSwitchPlanTier('PRO')}
                          disabled={isUpdatingPlan}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                            planEntitlement.tier === 'PRO'
                              ? 'bg-[#6EAA90] text-[#171D1C]'
                              : 'bg-[#222B28] text-[#9BA8A3] border border-[#313D39]'
                          }`}
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span>Plano PRO</span>
                        </button>
                        <button
                          onClick={() => handleSwitchPlanTier('FREE')}
                          disabled={isUpdatingPlan}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                            planEntitlement.tier === 'FREE'
                              ? 'bg-[#D96B6B] text-[#171D1C]'
                              : 'bg-[#222B28] text-[#9BA8A3] border border-[#313D39]'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Testar Bloqueio FREE</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SUB-TAB: MONITOR TÉCNICO, FILA WAL E RECUPERAÇÃO SSE */}
                {advancedTab === 'monitor' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ShieldCheck className="w-4 h-4 text-[#6EAA90]" />
                        <div className="text-xs">
                          <span className="font-semibold text-[#EAE7DE]">
                            Fila Durável WAL e EventBus Anti-Duplicação
                          </span>
                          <span className="text-[#9BA8A3] font-mono ml-2">
                            · Únicos: {dedupeStats.uniqueProcessed} · Duplicatas bloqueadas: {dedupeStats.duplicatesDropped} · EPS: {perfDiagnostics?.eventsPerSecond ?? 0}/s
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={refreshDiagnostics}
                          className="px-3 py-1.5 rounded-lg bg-[#222B28] hover:bg-[#2B3632] text-xs font-medium text-[#EAE7DE] border border-[#313D39] transition flex items-center gap-1.5"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-[#6EAA90]" />
                          <span>Atualizar Diagnóstico</span>
                        </button>
                        <button
                          onClick={handleRecoverQueue}
                          disabled={isRecoveringQueue}
                          className="px-3 py-1.5 rounded-lg bg-[#6EAA90]/15 hover:bg-[#6EAA90]/25 text-xs font-semibold text-[#6EAA90] border border-[#6EAA90]/40 transition flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isRecoveringQueue ? 'animate-spin' : ''}`} />
                          <span>Sincronizar Fila WAL</span>
                        </button>
                      </div>
                    </div>

                    <LiveSystemMonitor
                      sessionId={currentSessionId}
                      roomUsername={roomUsername}
                      isAdminAuthorized={isAdminAuthorized}
                      adminLabel={oauthUser?.display_name || adminLabel}
                      onTriggerQueueRecovery={handleRecoverQueue}
                      isRecoveringQueue={isRecoveringQueue}
                      externalSnapshot={perfDiagnostics?.monitorSnapshot || null}
                    />
                  </div>
                )}

                {/* 4. SUB-TAB: SNAPSHOTS, HISTÓRICO DE SORTEIOS & AUDITORIA */}
                {advancedTab === 'history' && (
                  <div className="space-y-6">
                    {/* Completed Draws History for this LIVE Session */}
                    <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-3">
                      <h3 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-[#C6A56A]" />
                        <span>Histórico de Sorteios desta LIVE ({sessionDraws.length})</span>
                      </h3>

                      {sessionDraws.length === 0 ? (
                        <p className="text-xs text-[#9BA8A3] py-4 text-center">
                          Nenhum sorteio realizado nesta sessão de LIVE ainda.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {sessionDraws.map((d) => (
                            <div
                              key={d.drawId}
                              className="p-3.5 rounded-lg bg-[#222B28] border border-[#313D39] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-semibold text-[#6EAA90] text-sm">
                                    Bilhete #{d.winningTicketNumber}
                                  </span>
                                  <span className="font-semibold text-[#EAE7DE]">@{d.winnerName}</span>
                                  <span className="text-[#C6A56A] font-medium">· {d.prizeName}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                      d.deliveryStatus === 'DELIVERED'
                                        ? 'bg-[#6EAA90]/20 text-[#6EAA90] border-[#6EAA90]/40'
                                        : d.deliveryStatus === 'CONTACTED'
                                        ? 'bg-[#60A5FA]/20 text-[#60A5FA] border-[#60A5FA]/40'
                                        : d.deliveryStatus === 'UNCLAIMED_EXPIRED'
                                        ? 'bg-[#D96B6B]/20 text-[#D96B6B] border-[#D96B6B]/40'
                                        : d.deliveryStatus === 'REDRAWN'
                                        ? 'bg-[#C084FC]/20 text-[#C084FC] border-[#C084FC]/40'
                                        : 'bg-[#C6A56A]/20 text-[#C6A56A] border-[#C6A56A]/40'
                                    }`}
                                  >
                                    {d.deliveryStatus === 'DELIVERED'
                                      ? 'Prêmio Entregue'
                                      : d.deliveryStatus === 'CONTACTED'
                                      ? 'Contatado'
                                      : d.deliveryStatus === 'UNCLAIMED_EXPIRED'
                                      ? 'Não Reclamado'
                                      : d.deliveryStatus === 'REDRAWN'
                                      ? 'Resorteado'
                                      : 'Pendente Contato'}
                                  </span>
                                </div>
                                <p className="font-mono text-[10px] text-[#9BA8A3] truncate max-w-xl">
                                  SHA-256 Roster: {d.frozenRosterHash} | Seed: {d.seedCommitment.slice(0, 24)}...
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-mono text-[#9BA8A3]">
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
                                  className="px-2.5 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] font-medium text-xs flex items-center gap-1"
                                >
                                  <Download className="w-3 h-3 text-[#6EAA90]" />
                                  <span>Certificado PDF</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Persisted Combo Streaks & Complete Event Log */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-1.5">
                            <Flame className="w-4 h-4 text-[#C6A56A]" />
                            <span>Combos / Streaks Persistidos ({persistedSessionStreaks.length})</span>
                          </h4>
                          <span className="text-[11px] font-mono text-[#9BA8A3]">Recuperável pós-restart</span>
                        </div>
                        {persistedSessionStreaks.length === 0 ? (
                          <p className="text-xs text-[#9BA8A3] py-4 text-center">
                            Nenhum combo registrado nesta sessão ainda.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {persistedSessionStreaks.slice(0, 20).map((st) => (
                              <div
                                key={st.streakKey}
                                className="p-2.5 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-between text-xs"
                              >
                                <div className="truncate">
                                  <span className="font-mono text-[#EAE7DE] font-medium">{st.streakKey}</span>
                                  <p className="text-[11px] text-[#9BA8A3]">
                                    Último repeatCount: <strong className="text-[#C6A56A]">{st.lastProcessedRepeatCount}x</strong>
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-mono text-[#C6A56A] font-semibold">{st.totalCoins} moedas</span>
                                  <span className="block text-[10px] font-mono text-[#6EAA90]">
                                    {st.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-1.5">
                            <History className="w-4 h-4 text-[#6EAA90]" />
                            <span>Eventos Persistidos no Firestore ({persistedSessionEvents.length})</span>
                          </h4>
                          <span className="text-[11px] font-mono text-[#9BA8A3]">Idempotente</span>
                        </div>
                        {persistedSessionEvents.length === 0 ? (
                          <p className="text-xs text-[#9BA8A3] py-4 text-center">
                            Nenhum evento persistido nesta sessão ainda.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                            {persistedSessionEvents.slice(0, 25).map((ev) => {
                              const hasHandle =
                                ev.handleAvailable !== false &&
                                ev.username &&
                                ev.username !== 'arroba_indisponivel';
                              const evHandle = hasHandle ? `@${ev.username}` : 'Arroba indisponível';
                              return (
                                <div
                                  key={ev.eventId}
                                  className="p-2.5 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-between text-xs"
                                >
                                  <div className="truncate">
                                    <span className="font-semibold text-[#EAE7DE]">{evHandle}</span>{' '}
                                    <span className="text-[#6EAA90] font-medium">{ev.giftName}</span>{' '}
                                    <span className="text-[#9BA8A3] font-mono">
                                      (+{ev.deltaCount} / {ev.repeatCount}x)
                                    </span>
                                    <p className="text-[10px] font-mono text-[#9BA8A3] truncate">
                                      ID: {ev.eventId} | Regra: {ev.rateApplied} moedas/bilhete
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-semibold text-[#C6A56A]">+{ev.coinsGranted}</span>
                                    <span className="block text-[10px] font-mono text-[#9BA8A3]">
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

                    {/* Room Member Presence & Cryptographic Operational Audit Trail */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-[#6EAA90]" />
                            <span>Entrada / Saída na Sala em Tempo Real</span>
                          </h4>
                          <span className="text-[11px] font-mono text-[#9BA8A3]">
                            {memberPresenceFeed.length || connectionStatus.recentMembers?.length || 0} eventos
                          </span>
                        </div>
                        {(memberPresenceFeed.length > 0 ? memberPresenceFeed : connectionStatus.recentMembers || []).length === 0 ? (
                          <p className="text-xs text-[#9BA8A3] py-2">
                            Eventos de entrada aparecerão quando transmitidos pela sala da LIVE.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                            {(memberPresenceFeed.length > 0 ? memberPresenceFeed : connectionStatus.recentMembers || [])
                              .slice(0, 15)
                              .map((m) => (
                                <span
                                  key={m.eventId}
                                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#222B28] text-[#EAE7DE] border border-[#313D39]"
                                >
                                  {m.action === 'JOINED' ? '→' : '←'} @{m.username}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>

                      <div className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-2">
                        <h4 className="text-xs font-semibold text-[#EAE7DE]">
                          Trilha de Auditoria Operacional ({auditLogs.length} registros recentes)
                        </h4>
                        {auditLogs.length === 0 ? (
                          <p className="text-xs text-[#9BA8A3] py-2">Nenhum registro de auditoria recente.</p>
                        ) : (
                          <div className="space-y-1 max-h-28 overflow-y-auto font-mono text-[11px] text-[#9BA8A3]">
                            {auditLogs.slice(0, 15).map((log) => (
                              <div key={log.logId} className="flex items-center justify-between py-1 border-b border-[#313D39]">
                                <span className="truncate">
                                  <strong className="text-[#6EAA90]">[{log.category}]</strong>{' '}
                                  <span className="text-[#EAE7DE]">{log.action}</span>
                                </span>
                                <span className="text-[#9BA8A3] shrink-0 ml-2">
                                  {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Drilldown Modal if participant selected */}
          {selectedGlobalParticipant && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171D1C]/85 backdrop-blur-sm">
              <div className="w-full max-w-lg bg-[#222B28] border border-[#313D39] rounded-xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-[#313D39] pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#EAE7DE]">
                      @{selectedGlobalParticipant.global.currentUsername}
                    </h3>
                    <p className="text-xs text-[#9BA8A3] font-mono">
                      ID TikTok: {selectedGlobalParticipant.global.tiktokUserId}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedGlobalParticipant(null)}
                    className="text-xs text-[#9BA8A3] hover:text-[#EAE7DE] px-2 py-1 rounded bg-[#171D1C] border border-[#313D39]"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs">
                  <div>
                    <span className="text-[11px] text-[#9BA8A3]">Moedas Vitalícias</span>
                    <p className="text-lg font-mono font-semibold text-[#C6A56A] tabular-nums">
                      {selectedGlobalParticipant.global.totalCoinsLifetime.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#9BA8A3]">Bilhetes Vitalícios</span>
                    <p className="text-lg font-mono font-semibold text-[#6EAA90] tabular-nums">
                      {selectedGlobalParticipant.global.totalTicketsLifetime.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[#EAE7DE]">
                    Transmissões Participadas ({selectedGlobalParticipant.participations.length})
                  </h4>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedGlobalParticipant.participations.map((part) => (
                      <div
                        key={part.sessionId}
                        className="p-2.5 rounded-lg bg-[#171D1C] border border-[#313D39] flex items-center justify-between text-xs"
                      >
                        <span className="font-mono text-[#EAE7DE] truncate max-w-[200px]">
                          {part.sessionId}
                        </span>
                        <div className="text-right font-mono tabular-nums">
                          <span className="text-[#C6A56A] font-semibold">{part.coinsContributed} moedas</span>
                          <span className="text-[#6EAA90] text-[11px] ml-2">({part.ticketsIssued} bilhetes)</span>
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
          prizeName={motor1PrizeInput.trim() || selectedCampaign?.prizeName || 'Super Prêmio'}
          snapshot={campaignSnapshot}
          onDrawCompleted={() => {
            refreshCampaigns();
          }}
          onExecuteDraw={async () => {
            return await executeCampaignDraw(
              campaignSnapshot.targetId,
              campaignSnapshot.snapshotId,
              motor1PrizeInput.trim() || selectedCampaign?.prizeName
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

      {/* ORGANIZER PERMANENT CONFIG MODAL */}
      {isOrganizerConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171D1C]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-[#222B28] border border-[#313D39] rounded-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#313D39]">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-[#C6A56A]" />
                <div>
                  <h3 className="text-base font-semibold text-[#EAE7DE]">
                    Configuração Permanente do Sorteio
                  </h3>
                  <p className="text-xs text-[#9BA8A3]">
                    Parâmetros oficiais adotados automaticamente ao iniciar novas transmissões LIVE
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOrganizerConfigModalOpen(false)}
                className="text-[#9BA8A3] hover:text-[#EAE7DE] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                    Nome Padrão do Sorteio
                  </label>
                  <input
                    type="text"
                    value={defRaffleTitle}
                    onChange={(e) => setDefRaffleTitle(e.target.value)}
                    placeholder="Ex: Sorteio Oficial da LIVE"
                    className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                    Nome Padrão do Prêmio
                  </label>
                  <input
                    type="text"
                    value={defPrizeName}
                    onChange={(e) => setDefPrizeName(e.target.value)}
                    placeholder="Ex: Prêmio Especial da LIVE"
                    className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                    Taxa (Moedas = 1 Bilhete)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={defRate}
                    onChange={(e) => setDefRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] font-mono font-semibold focus:outline-none focus:border-[#6EAA90]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                    Mínimo Moedas / Presente
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={defMinCoins}
                    onChange={(e) => setDefMinCoins(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] font-mono focus:outline-none focus:border-[#6EAA90]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                    Máx. Bilhetes / Usuário
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={defMaxUserTickets}
                    onChange={(e) => setDefMaxUserTickets(e.target.value)}
                    placeholder="Sem limite"
                    className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] font-mono focus:outline-none focus:border-[#6EAA90]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                  Limite Total de Bilhetes da Sessão (opcional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={defMaxTotalTickets}
                  onChange={(e) => setDefMaxTotalTickets(e.target.value)}
                  placeholder="Sem limite geral"
                  className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] font-mono focus:outline-none focus:border-[#6EAA90]"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#EAE7DE]">
                  <input
                    type="checkbox"
                    checked={defAllowDuplicateWinners}
                    onChange={(e) => setDefAllowDuplicateWinners(e.target.checked)}
                    className="w-4 h-4 rounded border-[#313D39] bg-[#171D1C] text-[#6EAA90] focus:ring-0 focus:ring-offset-0"
                  />
                  <span>Permitir ganhadores repetidos entre sorteios da mesma transmissão</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#EAE7DE] mb-1">
                  Regulamento Padrão e Instruções ao Espectador
                </label>
                <textarea
                  rows={2}
                  value={defRulesNotes}
                  onChange={(e) => setDefRulesNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#313D39]">
              <button
                type="button"
                onClick={() => setIsOrganizerConfigModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingOrganizerDefaults}
                onClick={handleSaveOrganizerDefaults}
                className="px-4 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isSavingOrganizerDefaults ? 'Gravando...' : 'Salvar Configuração Permanente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
