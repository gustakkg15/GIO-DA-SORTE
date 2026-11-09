import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Participant,
  RaffleSettings,
  Winner,
  PublicRaffle,
  ProPlanEntitlement,
  SubscriptionPlanTier,
  SubscriptionStatusState,
  TikTokLiveSession,
  LegalDocumentSlug,
} from './types';
import { fetchPublicRaffle } from './utils/publicRaffle';
import {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  INITIAL_SAMPLE_PARTICIPANTS,
  computeRaffle,
  secureRandomInt,
  generateUid,
  exportToCsv,
  formatDateTime,
} from './utils/raffle';
import {
  isSoundEnabled,
  setSoundEnabled,
  playTick,
  playWinnerFanfare,
  playCountdownTick,
  playCountdownLaunch,
} from './utils/audio';
import { fireWinnerConfetti } from './utils/confetti';
import { generateRosterHash } from './utils/hash';
import {
  auth,
  db,
  onAuthStateChanged,
  User as FirebaseUser,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  fetchAllLiveSessions,
  getProPlanEntitlement,
  setProPlanTier,
  getAuthBearerHeaders,
} from './utils/tiktokLiveService';
import { tiktokConnector, tiktokEventBus } from './utils/tiktokConnector';
import { AppNavigationTab } from './components/Header';
import { Sidebar } from './components/layout/Sidebar';
import { AppHeader } from './components/layout/AppHeader';
import { MainDashboard } from './components/MainDashboard';
import { GuidedRaffleWizard } from './components/GuidedRaffleWizard';
import { SubscriptionPlanView } from './components/SubscriptionPlanView';
import { OnboardingTourModal } from './components/OnboardingTourModal';
import { DrawSection } from './components/DrawSection';
import { ParticipantManager } from './components/ParticipantManager';
import { TicketSearch } from './components/TicketSearch';
import { StatsProbabilities } from './components/StatsProbabilities';
import { SettingsBackup } from './components/SettingsBackup';
import { HowItWorks } from './components/HowItWorks';
import { PresentationModal } from './components/PresentationModal';
import { PrintSheetModal } from './components/PrintSheetModal';
import { BattleRoyaleModal } from './components/BattleRoyaleModal';
import { VictoryCardModal } from './components/VictoryCardModal';
import { MonteCarloModal } from './components/MonteCarloModal';
import { PrizeQueueModal } from './components/PrizeQueueModal';
import { ObsOverlayModal } from './components/ObsOverlayModal';
import { AccountModal } from './components/AccountModal';
import { SupportTab } from './components/SupportTab';
import { WinnerCelebrationOverlay } from './components/WinnerCelebrationOverlay';
import { DrawCountdownOverlay } from './components/DrawCountdownOverlay';
import { TikTokLiveManager } from './components/TikTokLiveManager';
import { AuditReportModal } from './components/AuditReportModal';
import { LegalTrustCenter } from './components/LegalTrustCenter';
import { CookieConsentBanner } from './components/CookieConsentBanner';
import { Footer } from './components/Footer';
import { useIdleAutoSave } from './hooks/useIdleAutoSave';
import { idleStorage } from './utils/idleStorage';
import {
  Sparkles,
  Ticket,
  MessageSquare,
  Radio,
  Trophy,
  Users,
  Search,
  BarChart3,
  FileText,
  Download,
  Printer,
  Settings,
  User,
  HelpCircle,
  Heart,
  Award,
  Plus,
  Scale,
  Play,
  ShieldCheck,
  Gift,
  Coins,
  RefreshCw,
  Maximize2,
  Trash2,
} from 'lucide-react';

const ONBOARDING_STORAGE_KEY = 'gio_onboarding_completed_v1';

export default function App() {
  const [settings, setSettings] = useState<RaffleSettings>(() => {
    const baseDefaults: RaffleSettings = {
      ...DEFAULT_SETTINGS,
      drawMode: 'drum',
      prizes: [
        { id: 'pz1', name: '1º Lugar - Prêmio Principal', rank: 1 },
        { id: 'pz2', name: '2º Lugar - Prêmio Especial', rank: 2 },
        { id: 'pz3', name: '3º Lugar - Prêmio de Participação', rank: 3 },
      ],
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.settings) {
          return {
            ...baseDefaults,
            ...parsed.settings,
            countdownSeconds:
              parsed.settings.countdownSeconds !== undefined ? parsed.settings.countdownSeconds : 10,
            drawMode: parsed.settings.drawMode || 'drum',
            prizes: Array.isArray(parsed.settings.prizes) ? parsed.settings.prizes : baseDefaults.prizes,
          };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return baseDefaults;
  });

  const [participants, setParticipants] = useState<Participant[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.participants)) {
          return parsed.participants;
        }
      }
    } catch {
      // Ignore
    }
    return INITIAL_SAMPLE_PARTICIPANTS;
  });

  const [winners, setWinners] = useState<Winner[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.winners)) {
          return parsed.winners;
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });

  // Main Navigation & Sub-Navigation States
  const [activeTab, setActiveTab] = useState<AppNavigationTab>('dashboard');
  const [rafflesSubTab, setRafflesSubTab] = useState<'arena' | 'participants' | 'history' | 'wizard'>('arena');
  const [participantsSubTab, setParticipantsSubTab] = useState<'manage' | 'lookup'>('manage');
  const [reportsSubTab, setReportsSubTab] = useState<'overview' | 'ExportAndHistory'>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'preferences' | 'profile' | 'help' | 'support' | 'legal'>('preferences');
  const [tiktokInitialTab, setTiktokInitialTab] = useState<'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor'>('feed');
  const [tiktokInitialMode, setTiktokInitialMode] = useState<'live_pro' | 'traditional_comments'>('live_pro');
  const [legalInitialSlug, setLegalInitialSlug] = useState<LegalDocumentSlug>('termos-de-uso');
  const [legalInitialPortalTab, setLegalInitialPortalTab] = useState<'documents' | 'privacy_lgpd' | 'help_support' | 'admin_legal'>('documents');
  const [isCookiePreferencesOpen, setIsCookiePreferencesOpen] = useState(false);

  // Desktop Sidebar Collapsed state (persisted) & Mobile Drawer state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gio_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gio_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  }, []);

  const [soundActive, setSoundActive] = useState<boolean>(() => isSoundEnabled());

  // Onboarding Modal State (shown only once on first visit)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'true';
    } catch {
      return false;
    }
  });

  const handleCloseOnboarding = useCallback(() => {
    setIsOnboardingOpen(false);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // Ignore
    }
  }, []);

  // Backend-validated PRO Plan & Live Session Summary State
  const [planEntitlement, setPlanEntitlement] = useState<ProPlanEntitlement>(() => getProPlanEntitlement());
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  const [liveSessionsSummary, setLiveSessionsSummary] = useState<TikTokLiveSession[]>([]);
  const [liveConnectionState, setLiveConnectionState] = useState<string>(() => tiktokConnector.getState());
  const [liveConnectedUsername, setLiveConnectedUsername] = useState<string>(() => tiktokConnector.getRoomUsername());
  const statusPollInFlightRef = useRef<boolean>(false);

  const fetchAndSyncTikTokStatus = useCallback(async () => {
    if (statusPollInFlightRef.current) return;
    statusPollInFlightRef.current = true;
    try {
      await tiktokConnector.syncWithBackendStatus();
    } catch {
      // Ignore transient network errors during background poll
    } finally {
      statusPollInFlightRef.current = false;
    }
  }, []);

  // Firebase Auth State (declared before refreshPlatformStatus)
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);

  const refreshPlatformStatus = useCallback(async () => {
    const activeUid = currentUser?.uid || auth.currentUser?.uid;
    try {
      const authHeaders = await getAuthBearerHeaders();
      const planRes = await fetch('/api/tiktok/plan/status', {
        headers: authHeaders,
      });
      if (planRes.ok) {
        const planData = await planRes.json();
        if (planData && planData.tier) {
          setPlanEntitlement(planData);
          setProPlanTier(planData.tier, planData.statusState, activeUid);
        }
      }
    } catch {
      // Fallback to local service state
    }

    await fetchAndSyncTikTokStatus();

    if (!activeUid) {
      setLiveSessionsSummary([]);
      return;
    }

    try {
      const authHeaders = await getAuthBearerHeaders();
      if (!authHeaders['Authorization']) {
        setLiveSessionsSummary([]);
        return;
      }
      const sessionsRes = await fetch('/api/tiktok/live/sessions?limit=15', {
        headers: authHeaders,
      });
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        if (sessionsData?.success && Array.isArray(sessionsData.sessions)) {
          setLiveSessionsSummary(
            sessionsData.sessions.filter(
              (s: TikTokLiveSession) =>
                Boolean(s && s.ownerUid && String(s.ownerUid).trim() === activeUid) &&
                (s as unknown as { isDemo?: boolean }).isDemo !== true
            )
          );
          return;
        }
      } else if (sessionsRes.status === 401 || sessionsRes.status === 403) {
        setLiveSessionsSummary([]);
        return;
      }
      const sessions = await fetchAllLiveSessions(15, activeUid);
      setLiveSessionsSummary(sessions);
    } catch {
      setLiveSessionsSummary([]);
    }
  }, [fetchAndSyncTikTokStatus, currentUser]);

  useEffect(() => {
    refreshPlatformStatus();
  }, [refreshPlatformStatus, activeTab, rafflesSubTab]);

  // Lightweight 5s polling ONLY when outside the TikTok tab and connection is active/connecting/reconnecting
  useEffect(() => {
    const needsBackgroundPolling =
      activeTab !== 'tiktok' &&
      (liveConnectionState === 'CONNECTED' ||
        liveConnectionState === 'CONNECTING' ||
        liveConnectionState === 'RECONNECTING');

    if (!needsBackgroundPolling) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchAndSyncTikTokStatus();
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeTab, liveConnectionState, fetchAndSyncTikTokStatus]);

  // Real-time synchronization with TikTokLiveConnector & TikTokLiveManager via shared EventBus
  useEffect(() => {
    const unsubState = tiktokEventBus.subscribe('connection_state', (state: string) => {
      if (state) {
        setLiveConnectionState(state);
      }
    });
    const unsubStatus = tiktokEventBus.subscribe('status', (data: any) => {
      if (data) {
        if (data.state) {
          setLiveConnectionState(data.state);
        }
        if (data.roomUsername !== undefined) {
          setLiveConnectedUsername(data.roomUsername || '');
        }
      }
    });
    return () => {
      unsubState();
      unsubStatus();
    };
  }, []);

  const handleSwitchPlanTier = useCallback(
    async (tier: SubscriptionPlanTier, statusState?: SubscriptionStatusState) => {
      setIsUpdatingPlan(true);
      try {
        const authHeaders = await getAuthBearerHeaders({
          'Content-Type': 'application/json',
          'x-admin-authorized': 'true',
        });
        const res = await fetch('/api/tiktok/plan/tier', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ tier, statusState }),
        });
        const data = await res.json();
        if (res.ok && data.entitlement) {
          setPlanEntitlement(data.entitlement);
          setProPlanTier(data.entitlement.tier, data.entitlement.statusState);
        } else {
          const fallback = setProPlanTier(tier, statusState);
          setPlanEntitlement(fallback);
        }
      } catch {
        const fallback = setProPlanTier(tier, statusState);
        setPlanEntitlement(fallback);
      } finally {
        setIsUpdatingPlan(false);
      }
    },
    []
  );

  // Cloud Sync & Account Modal State
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline' | 'error'>('synced');

  // Interactive Modals State
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [isPrintSheetOpen, setIsPrintSheetOpen] = useState(false);
  const [isBattleRoyaleOpen, setIsBattleRoyaleOpen] = useState(false);
  const [isMonteCarloOpen, setIsMonteCarloOpen] = useState(false);
  const [isPrizeQueueOpen, setIsPrizeQueueOpen] = useState(false);
  const [isObsOverlayOpen, setIsObsOverlayOpen] = useState(false);
  const [selectedWinnerForCard, setSelectedWinnerForCard] = useState<Winner | null>(null);
  const [celebrationWinner, setCelebrationWinner] = useState<Winner | null>(null);
  const [isAuditReportOpen, setIsAuditReportOpen] = useState(false);
  const [rosterHash, setRosterHash] = useState<string>('');

  // Sorteio Countdown State
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [pendingDrawType, setPendingDrawType] = useState<'drum' | 'wheel'>('drum');
  const [wheelSpinSignal, setWheelSpinSignal] = useState(0);

  // Drawing Animation State
  const [isDrawing, setIsDrawing] = useState(false);
  const [displayNumber, setDisplayNumber] = useState<number | string>(() => {
    return winners.length > 0 ? winners[0].number : '?';
  });

  // Support for viewing another organizer's external raffle
  const [isViewingExternalRaffle, setIsViewingExternalRaffle] = useState(false);
  const [localBackupRaffle, setLocalBackupRaffle] = useState<{
    settings: RaffleSettings;
    participants: Participant[];
    winners: Winner[];
  } | null>(null);

  // URL query parameter support (e.g. ?sorteio=GIO-7492 or ?legal=termos-de-uso)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const legalParam = urlParams.get('legal') || urlParams.get('doc');
    if (legalParam) {
      setLegalInitialSlug(legalParam as LegalDocumentSlug);
      setLegalInitialPortalTab('documents');
      setActiveTab('legal');
      return;
    }
    const raffleParam = urlParams.get('sorteio') || urlParams.get('code') || urlParams.get('raffle');
    if (raffleParam) {
      setActiveTab('search');
      setParticipantsSubTab('lookup');
      fetchPublicRaffle(raffleParam).then((publicRaffle) => {
        if (publicRaffle) {
          setLocalBackupRaffle({ settings, participants, winners });
          setSettings(publicRaffle.settings);
          setParticipants(publicRaffle.participants);
          setWinners(publicRaffle.winners);
          setIsViewingExternalRaffle(true);
        }
      });
    }
  }, []);

  const handleLoadPublicRaffle = useCallback(
    (raffle: PublicRaffle) => {
      if (!isViewingExternalRaffle) {
        setLocalBackupRaffle({ settings, participants, winners });
      }
      setSettings(raffle.settings);
      setParticipants(raffle.participants);
      setWinners(raffle.winners);
      setIsViewingExternalRaffle(true);
      setActiveTab('search');
      setParticipantsSubTab('lookup');
    },
    [isViewingExternalRaffle, settings, participants, winners]
  );

  const handleResetToLocal = useCallback(() => {
    if (localBackupRaffle) {
      setSettings(localBackupRaffle.settings);
      setParticipants(localBackupRaffle.participants);
      setWinners(localBackupRaffle.winners);
    }
    setIsViewingExternalRaffle(false);
  }, [localBackupRaffle]);

  // Auth state listener (R-03: Loads authoritative state from backend API, never clobbering governance fields)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        try {
          await setDoc(
            userRef,
            {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              photoURL: user.photoURL || '',
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (err) {
          console.warn('Profile sync notice:', err);
        }

        try {
          const idToken = await user.getIdToken();
          const authHeaders = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          };
          const stateRes = await fetch('/api/raffle/state?raffleId=default', {
            headers: authHeaders,
          });
          if (stateRes.ok) {
            const stateData = await stateRes.json();
            if (stateData?.ok && stateData.raffle) {
              if (Array.isArray(stateData.raffle.participants)) {
                setParticipants(stateData.raffle.participants);
              }
              if (stateData.raffle.settings) {
                setSettings((s) => ({ ...s, ...stateData.raffle.settings }));
              }
              if (Array.isArray(stateData.raffle.winners)) {
                setWinners(stateData.raffle.winners);
              }
              setSyncStatus('synced');
            }
          } else if (stateRes.status === 404) {
            // Bootstrap initial authoritative raffle once when document does not exist yet
            const bootRes = await fetch('/api/raffle/sync', {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                raffleId: 'default',
                title: settings.raffleTitle || 'GIO DA SORTE',
                settings,
                participants,
              }),
            });
            if (bootRes.ok) {
              const bootData = await bootRes.json();
              if (bootData?.ok && bootData.raffle) {
                setParticipants(bootData.raffle.participants || []);
                if (bootData.raffle.settings) {
                  setSettings((s) => ({ ...s, ...bootData.raffle.settings }));
                }
                if (Array.isArray(bootData.raffle.winners)) {
                  setWinners(bootData.raffle.winners);
                }
                setSyncStatus('synced');
              }
            }
          }
        } catch (err) {
          console.warn('Initial authoritative raffle fetch notice:', err);
        }
      } else {
        setLiveSessionsSummary([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // R-03: Save to Cloud Function — NEVER writes to `users/{uid}/raffles/default` via Client SDK
  // and NEVER sends `participants`, `winners`, or governance fields (`rosterVersion`, `drawSequence`,
  // `fencingToken`, `operationalState`, `commitmentHash`, `drawNonce`).
  // Only syncs non-allocation UI presentation preferences when idle.
  const saveToCloud = useCallback(async () => {
    if (!currentUser) return;
    if (isDrawing || countdownRemaining !== null) return;
    setSyncStatus('saving');
    try {
      const idToken = await currentUser.getIdToken();
      const nonAllocationUiSettingsPatch: Partial<RaffleSettings> = {
        currentPrize: settings.currentPrize,
        spinDuration: settings.spinDuration,
        countdownSeconds: settings.countdownSeconds,
        themeMode: settings.themeMode,
        prizes: settings.prizes,
        drawMode: settings.drawMode,
        supportPixKey: settings.supportPixKey,
        supportPaypalEmail: settings.supportPaypalEmail,
        raffleCode: settings.raffleCode,
        organizerName: settings.organizerName,
        raffleTitle: settings.raffleTitle,
        prizeName: settings.prizeName,
        prizeImage: settings.prizeImage,
      };
      const res = await fetch('/api/raffle/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          raffleId: 'default',
          title: settings.raffleTitle || 'GIO DA SORTE',
          settings: nonAllocationUiSettingsPatch,
        }),
      });
      if (res.ok || res.status === 409) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
      }
    } catch {
      setSyncStatus('error');
    }
  }, [currentUser, isDrawing, countdownRemaining, settings]);

  // R-03: Load from Cloud Function — Reads authoritative raffle state exclusively from backend API
  const loadFromCloud = useCallback(async () => {
    if (!currentUser) return;
    try {
      const idToken = await currentUser.getIdToken();
      const res = await fetch('/api/raffle/state?raffleId=default', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data.raffle) {
          if (data.raffle.settings) setSettings((s) => ({ ...s, ...data.raffle.settings }));
          if (Array.isArray(data.raffle.participants)) setParticipants(data.raffle.participants);
          if (Array.isArray(data.raffle.winners)) setWinners(data.raffle.winners);
          setSyncStatus('synced');
        }
      }
    } catch {
      setSyncStatus('error');
    }
  }, [currentUser]);

  // Idle Auto-Save (local browser backup only)
  const { autoSaveStatus, lastSavedAt, flushNow } = useIdleAutoSave({
    settings,
    participants,
    winners,
    isDrawing: isDrawing || countdownRemaining !== null,
  });

  // Debounced UI preferences cloud save if logged in and not drawing
  const cloudSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (currentUser && !isDrawing && countdownRemaining === null) {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      setSyncStatus('saving');
      cloudSaveTimerRef.current = setTimeout(() => {
        saveToCloud().catch(() => {});
      }, 1500);
    }
  }, [
    settings.raffleTitle,
    settings.prizeName,
    settings.currentPrize,
    settings.spinDuration,
    settings.countdownSeconds,
    settings.themeMode,
    settings.drawMode,
    currentUser,
    isDrawing,
    countdownRemaining,
    saveToCloud,
  ]);

  // Keep hash updated
  useEffect(() => {
    generateRosterHash(participants, settings).then(setRosterHash);
  }, [participants, settings]);

  // Compute live raffle status
  const computed = useMemo(() => {
    return computeRaffle(participants, settings, winners);
  }, [participants, settings, winners]);

  // Sound toggle handler
  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
  };

  // R-04: Central helper to execute authoritative roster/settings mutations on the backend
  const mutateAuthoritativeRaffle = useCallback(
    async (mutationPayload: Record<string, unknown>) => {
      if (!currentUser) return;
      setSyncStatus('saving');
      try {
        const idToken = await currentUser.getIdToken();
        const res = await fetch('/api/raffle/participant/mutate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            raffleId: 'default',
            ...mutationPayload,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.ok && data.raffle) {
          if (Array.isArray(data.raffle.participants)) {
            setParticipants(data.raffle.participants);
          }
          if (data.raffle.settings) {
            setSettings((prev) => ({ ...prev, ...data.raffle.settings }));
          }
          if (Array.isArray(data.raffle.winners)) {
            setWinners(data.raffle.winners);
          }
          setSyncStatus('synced');
        } else {
          setSyncStatus('error');
        }
      } catch {
        setSyncStatus('error');
      }
    },
    [currentUser]
  );

  // R-04 Handler 1: Add Participant -> POST /api/raffle/participant/mutate (action: 'addParticipant')
  const handleAddParticipant = useCallback(
    (name: string, coins: number) => {
      const cleanName = name.trim();
      if (!cleanName) return;

      const addedParticipant: Participant = {
        id: generateUid(),
        name: cleanName,
        coins,
        addedAt: Date.now(),
      };

      setParticipants((prev) => {
        const existingIdx = prev.findIndex((p) => p.name.toLowerCase() === cleanName.toLowerCase());
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            coins: updated[existingIdx].coins + coins,
          };
          return updated;
        }
        return [...prev, addedParticipant];
      });

      void mutateAuthoritativeRaffle({
        action: 'addParticipant',
        participant: addedParticipant,
        mergeIfSameName: true,
      });
    },
    [mutateAuthoritativeRaffle]
  );

  // R-04 Handler 2: Update Participant Coins -> POST /api/raffle/participant/mutate (action: 'updateParticipantCoins')
  const handleUpdateCoins = useCallback(
    (id: string, coins: number) => {
      const normalizedCoins = Math.max(0, coins);
      setParticipants((prev) =>
        prev.map((p) => (p.id === id ? { ...p, coins: normalizedCoins } : p))
      );
      void mutateAuthoritativeRaffle({
        action: 'updateParticipantCoins',
        participantId: id,
        coins: normalizedCoins,
      });
    },
    [mutateAuthoritativeRaffle]
  );

  // R-04 Handler 3: Remove Participant -> POST /api/raffle/participant/mutate (action: 'removeParticipant')
  const handleRemoveParticipant = useCallback(
    (id: string) => {
      setParticipants((prev) => prev.filter((p) => p.id !== id));
      void mutateAuthoritativeRaffle({
        action: 'removeParticipant',
        participantId: id,
      });
    },
    [mutateAuthoritativeRaffle]
  );

  // R-04 Handler 4: Clear All Participants -> POST /api/raffle/participant/mutate (action: 'clearAllParticipants')
  const handleClearAllParticipants = useCallback(() => {
    setParticipants([]);
    setDisplayNumber('?');
    void mutateAuthoritativeRaffle({
      action: 'clearAllParticipants',
    });
  }, [mutateAuthoritativeRaffle]);

  // R-04 Handler 5: Bulk Add Participants -> POST /api/raffle/participant/mutate (action: 'bulkAddParticipants')
  const handleBulkAdd = useCallback(
    (list: { name: string; coins: number }[], replace: boolean) => {
      const now = Date.now();
      const itemsWithIds = list.map((item) => ({
        id: generateUid(),
        name: item.name,
        coins: item.coins,
        addedAt: now,
      }));

      setParticipants((prev) => {
        const base = replace ? [] : [...prev];
        itemsWithIds.forEach((item) => {
          const idx = base.findIndex((p) => p.name.toLowerCase() === item.name.toLowerCase());
          if (idx >= 0) {
            base[idx] = { ...base[idx], coins: base[idx].coins + item.coins };
          } else {
            base.push(item);
          }
        });
        return base;
      });

      void mutateAuthoritativeRaffle({
        action: 'bulkAddParticipants',
        items: itemsWithIds,
        replace,
      });
    },
    [mutateAuthoritativeRaffle]
  );

  // R-04 Handler 6: Update Raffle Allocation & Presentation Settings -> POST /api/raffle/participant/mutate (action: 'updateRaffleAllocationSettings')
  const handleUpdateSettings = useCallback(
    (patch: Partial<RaffleSettings>) => {
      setSettings((s) => ({ ...s, ...patch }));
      void mutateAuthoritativeRaffle({
        action: 'updateRaffleAllocationSettings',
        settingsPatch: patch,
      });
    },
    [mutateAuthoritativeRaffle]
  );

  // Winner actions
  const handleRemoveWinner = (winnerId: string) => {
    setWinners((prev) => prev.filter((w) => w.id !== winnerId));
  };

  const handleClearWinners = () => {
    setWinners([]);
  };

  // Authoritative Backend Draw State (Fase 1.7.0 / Fase 1.7.2)
  const [predeterminedWinningTicket, setPredeterminedWinningTicket] = useState<{
    number: number;
    participantId: string;
    name: string;
  } | null>(null);
  const [drawErrorMessage, setDrawErrorMessage] = useState<string | null>(null);
  const pendingAuthoritativeWinnerRef = useRef<Winner | null>(null);

  // Wheel spin conclusion handler (records the authoritative backend Winner after animation completes)
  const handleWheelSpinEnd = (chosenTicket: { number: number; participantId: string; name: string }) => {
    setDisplayNumber(chosenTicket.number);
    setIsDrawing(false);
    drawingRef.current = false;

    const authoritativeWinner: Winner = pendingAuthoritativeWinnerRef.current || {
      id: generateUid(),
      participantId: chosenTicket.participantId,
      name: chosenTicket.name,
      number: chosenTicket.number,
      prize: settings.prizeName || settings.currentPrize || 'Roleta da Fortuna',
      drawnAt: Date.now(),
    };
    pendingAuthoritativeWinnerRef.current = null;

    setWinners((prev) => {
      const next = [authoritativeWinner, ...prev];
      idleStorage.scheduleSave({ settings, participants, winners: next }, true);
      return next;
    });
    setCelebrationWinner(authoritativeWinner);
  };

  // Authoritative Traditional Draw execution (Backend Provably Fair V2 — R-04 compliant)
  const drawingRef = useRef(false);
  const executeAuthoritativeDraw = useCallback(
    async (mode: 'drum' | 'wheel' = 'drum') => {
      if (drawingRef.current || isDrawing) return;
      const pool = computed.eligibleTickets;
      if (pool.length === 0) return;

      if (!currentUser) {
        setDrawErrorMessage('Autenticação obrigatória para realizar sorteios oficiais auditáveis.');
        return;
      }

      drawingRef.current = true;
      setIsDrawing(true);
      setDrawErrorMessage(null);

      try {
        const idToken = await currentUser.getIdToken();
        const authHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        };

        // 1. Request cryptographic pre-commitment directly against the backend's authoritative persisted state.
        // R-04: Never overwrites the backend roster with the local array before the draw.
        let precommitRes = await fetch('/api/raffle/draw/pre-commit', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ raffleId: 'default' }),
        });

        // If the raffle document has never been created on the backend yet (404), bootstrap once and retry pre-commit
        if (precommitRes.status === 404) {
          const bootRes = await fetch('/api/raffle/sync', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              raffleId: 'default',
              title: settings.raffleTitle || 'Sorteio Oficial GIO DA SORTE',
              settings,
              participants,
            }),
          });
          if (!bootRes.ok) {
            const bootErr = await bootRes.json().catch(() => ({}));
            throw new Error(bootErr.message || bootErr.error || 'Falha ao inicializar rifa no servidor.');
          }
          precommitRes = await fetch('/api/raffle/draw/pre-commit', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ raffleId: 'default' }),
          });
        }

        const precommitData = await precommitRes.json();
        if (!precommitRes.ok || !precommitData.ok) {
          throw new Error(
            precommitData.message || precommitData.error || 'Falha ao criar pré-compromisso criptográfico.'
          );
        }

        // 2. Generate 256-bit client entropy (E_client) using WebCrypto CSPRNG
        const entropyBytes = new Uint8Array(32);
        window.crypto.getRandomValues(entropyBytes);
        const clientEntropy = Array.from(entropyBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        const randSuffix = Array.from(entropyBytes.slice(0, 6))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const drawId = `draw_trad_${Date.now()}_${randSuffix}`;
        const idempotencyKey = `idem_${drawId}`;

        // 3. Execute authoritative draw on backend
        const drawRes = await fetch('/api/raffle/draw', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            raffleId: 'default',
            drawId,
            idempotencyKey,
            commitmentHash: precommitData.commitmentHash,
            clientEntropy,
            expectedRosterVersion: precommitData.rosterVersion,
            expectedDrawSequence: precommitData.drawSequence,
            fencingToken: precommitData.fencingToken,
            drawMode: mode,
            winnerCount: 1,
            prizeId: 'NONE',
            prizeName: settings.prizeName || settings.currentPrize || 'Prêmio Oficial',
          }),
        });
        const drawData = await drawRes.json();
        if (!drawRes.ok || !drawData.ok) {
          throw new Error(
            drawData.message || drawData.error || 'O servidor rejeitou a confirmação do sorteio.'
          );
        }

        const chosenTicket: { number: number; participantId: string; name: string } =
          drawData.winningTicket;
        const authoritativeWinner: Winner = drawData.winner;

        if (mode === 'wheel') {
          pendingAuthoritativeWinnerRef.current = authoritativeWinner;
          setPredeterminedWinningTicket(chosenTicket);
          setWheelSpinSignal((s) => s + 1);
          return;
        }

        // Visual drum roll animation landing strictly on the backend-determined winning ticket
        const duration = settings.spinDuration || 3000;
        const startTime = Date.now();
        let tickCount = 0;

        const tick = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(1, elapsed / duration);

          if (progress >= 1) {
            setDisplayNumber(chosenTicket.number);
            setIsDrawing(false);
            drawingRef.current = false;

            setWinners((prev) => {
              const next = [authoritativeWinner, ...prev];
              idleStorage.scheduleSave({ settings, participants, winners: next }, true);
              return next;
            });
            setCelebrationWinner(authoritativeWinner);
            playWinnerFanfare();
            fireWinnerConfetti();
            return;
          }

          const visualTickTicket = pool[tickCount % pool.length];
          setDisplayNumber(visualTickTicket.number);

          tickCount++;
          if (tickCount % 2 === 0) {
            playTick(1 + progress * 0.4);
          }

          const nextDelay = 35 + Math.pow(progress, 2.5) * 220;
          setTimeout(tick, nextDelay);
        };

        tick();
      } catch (err) {
        setIsDrawing(false);
        drawingRef.current = false;
        setDrawErrorMessage(
          err instanceof Error ? err.message : 'Erro inesperado ao executar sorteio oficial no servidor.'
        );
      }
    },
    [
      isDrawing,
      computed.eligibleTickets,
      currentUser,
      settings,
      participants,
    ]
  );

  // Unified Draw Trigger
  const handleTriggerDraw = useCallback(
    (mode: 'drum' | 'wheel' = 'drum') => {
      if (drawingRef.current || isDrawing || countdownRemaining !== null) return;
      if (computed.eligibleTickets.length === 0) return;

      const countdownTime = settings.countdownSeconds !== undefined ? settings.countdownSeconds : 10;
      if (countdownTime <= 0) {
        executeAuthoritativeDraw(mode);
        return;
      }

      setPendingDrawType(mode);
      setCountdownRemaining(countdownTime);
      playCountdownTick(countdownTime);
    },
    [isDrawing, countdownRemaining, computed.eligibleTickets.length, settings.countdownSeconds, executeAuthoritativeDraw]
  );

  // Countdown timer decrement effect
  useEffect(() => {
    if (countdownRemaining === null) return;

    if (countdownRemaining <= 0) {
      playCountdownLaunch();
      setCountdownRemaining(null);
      executeAuthoritativeDraw(pendingDrawType);
      return;
    }

    const timer = setTimeout(() => {
      const next = countdownRemaining - 1;
      setCountdownRemaining(next);
      if (next > 0) {
        playCountdownTick(next);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdownRemaining, pendingDrawType, executeAuthoritativeDraw]);

  const handleSkipCountdown = useCallback(() => {
    if (countdownRemaining === null) return;
    playCountdownLaunch();
    setCountdownRemaining(null);
    executeAuthoritativeDraw(pendingDrawType);
  }, [countdownRemaining, pendingDrawType, executeAuthoritativeDraw]);

  const handleCancelCountdown = useCallback(() => {
    setCountdownRemaining(null);
  }, []);

  // Navigation helpers
  const handleSelectNavigationTab = useCallback((tab: AppNavigationTab) => {
    if (tab === 'help') {
      setLegalInitialSlug('central-de-ajuda');
      setLegalInitialPortalTab('help_support');
      setActiveTab('legal');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (tab === 'support') {
      setLegalInitialSlug('contato-e-suporte');
      setLegalInitialPortalTab('help_support');
      setActiveTab('legal');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenLegalDocument = useCallback((slug: LegalDocumentSlug) => {
    setLegalInitialSlug(slug);
    setLegalInitialPortalTab('documents');
    setActiveTab('legal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenPrivacyPortal = useCallback(() => {
    setLegalInitialPortalTab('privacy_lgpd');
    setActiveTab('legal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenSupportPortal = useCallback(() => {
    setLegalInitialPortalTab('help_support');
    setActiveTab('legal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleStartNewRaffle = useCallback(() => {
    setActiveTab('draw');
    setRafflesSubTab('arena');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleStartGuidedWizard = useCallback(() => {
    setActiveTab('draw');
    setRafflesSubTab('wizard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenLiveProTab = useCallback(
    (subTab: 'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor' = 'feed') => {
      setTiktokInitialMode('live_pro');
      setTiktokInitialTab(subTab);
      setActiveTab('tiktok');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  const handleExportFullReportCsv = useCallback(() => {
    if (participants.length === 0) return;
    const csvContent = exportToCsv(computed.allocations, settings);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-gio-da-sorte-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [participants.length, computed.allocations, settings]);

  return (
    <div className="min-h-screen bg-[#080A0F] text-[#FFFFFF] flex font-sans transition-colors duration-300">
      {/* Sidebar: Fixa no Desktop (260px ou 76px) & Drawer no Mobile */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectNavigationTab}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        isProPlan={planEntitlement.active && planEntitlement.tier === 'PRO'}
        currentUser={currentUser}
        onOpenAccount={() => setIsAccountOpen(true)}
        onStartNewRaffle={handleStartNewRaffle}
      />

      {/* Coluna de Conteúdo Principal (compensada pela largura da Sidebar no desktop) */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[260px]'
        }`}
      >
        {/* Cabeçalho Contextual com Breadcrumb e Status */}
        <AppHeader
          activeTab={activeTab}
          onSelectTab={handleSelectNavigationTab}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
          soundEnabled={soundActive}
          onToggleSound={handleToggleSound}
          onOpenPresentation={() => setIsPresentationOpen(true)}
          onOpenPrintSheet={() => setIsPrintSheetOpen(true)}
          onOpenObsOverlay={() => setIsObsOverlayOpen(true)}
          currentUser={currentUser}
          onOpenAccount={() => setIsAccountOpen(true)}
          onStartNewRaffle={handleStartNewRaffle}
          syncStatus={syncStatus}
          totalParticipants={participants.length}
          liveConnected={liveConnectionState === 'CONNECTED'}
          liveConnectionState={liveConnectionState}
          liveConnectedUsername={liveConnectedUsername}
        />

        {/* Área de Conteúdo */}
        <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* 1. PAINEL PRINCIPAL (DASHBOARD) */}
        {activeTab === 'dashboard' && (
          <MainDashboard
            settings={settings}
            participants={participants}
            winners={winners}
            computed={computed}
            entitlement={planEntitlement}
            liveSessions={liveSessionsSummary}
            liveConnectionState={liveConnectionState}
            liveConnectedUsername={liveConnectedUsername}
            currentOwnerUid={currentUser?.uid || null}
            syncStatus={syncStatus}
            onStartNewRaffleWizard={handleStartGuidedWizard}
            onOpenTraditionalDraw={() => {
              setActiveTab('draw');
              setRafflesSubTab('arena');
            }}
            onOpenCommentsSorter={() => {
              setTiktokInitialTab('feed');
              setTiktokInitialMode('traditional_comments');
              setActiveTab('tiktok');
            }}
            onOpenLivePro={handleOpenLiveProTab}
            onOpenParticipants={() => {
              setActiveTab('search');
              setParticipantsSubTab('manage');
            }}
            onOpenReports={() => {
              setActiveTab('stats');
              setReportsSubTab('overview');
            }}
            onOpenSubscription={() => setActiveTab('subscription')}
            onOpenOnboardingTour={() => setIsOnboardingOpen(true)}
            onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
          />
        )}

        {/* 2. SORTEIOS (MODALIDADES OFICIAIS — REDESIGN 2.0) */}
        {activeTab === 'draw' && (
          <div className="space-y-6 animate-fade-in min-w-0">
            {/* Cabeçalho Contextual e Barra das Modalidades de Sorteio */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#10141E] border border-[var(--gio-border-subtle)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h1 className="text-lg sm:text-xl font-bold text-[#FFFFFF] tracking-tight">
                    Central de Sorteios
                  </h1>
                  <p className="text-xs text-[#94A3B8]">
                    Escolha a modalidade desejada abaixo para configurar, validar participantes e realizar o sorteio.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-[#94A3B8] tabular-nums">
                  <span className="px-3 py-1.5 rounded-xl bg-[#080A0F] border border-[var(--gio-border-subtle)]">
                    Participantes: <strong className="text-[#FFFFFF] font-mono">{participants.length}</strong>
                  </span>
                  <span className="px-3 py-1.5 rounded-xl bg-[#080A0F] border border-[var(--gio-border-subtle)]">
                    Bilhetes Elegíveis: <strong className="text-[#B9FC01] font-mono">{computed.eligibleTickets.length}</strong>
                  </span>
                </div>
              </div>

              {/* 4 Opções de Navegação da Área Sorteios */}
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3"
                role="tablist"
                aria-label="Modalidades de Sorteio"
              >
                {/* 1. Roleta e Globo (Destaque Principal) */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={rafflesSubTab === 'arena'}
                  onClick={() => setRafflesSubTab('arena')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                    rafflesSubTab === 'arena'
                      ? 'bg-[#0131CD] text-white border-[#B9FC01]/60 shadow-[0_6px_20px_rgba(1,49,205,0.45)]'
                      : 'bg-[#080A0F] text-[#FFFFFF] border-[var(--gio-border-subtle)] hover:bg-[#161C2C] hover:border-[var(--gio-border-active)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Ticket className="w-4 h-4 shrink-0 text-[#B9FC01]" />
                      <span>1. Roleta e Globo</span>
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        rafflesSubTab === 'arena'
                          ? 'bg-[#B9FC01] text-[#080A0F]'
                          : 'bg-[#10141E] text-[#B9FC01] border border-[#B9FC01]/35'
                      }`}
                    >
                      Principal
                    </span>
                  </div>
                  <span
                    className={`text-[11px] leading-tight ${
                      rafflesSubTab === 'arena' ? 'text-white/90 font-medium' : 'text-[#94A3B8]'
                    }`}
                  >
                    Mesa visual por moedas ou nomes
                  </span>
                </button>

                {/* 2. Gestão de Participantes */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={rafflesSubTab === 'participants'}
                  onClick={() => setRafflesSubTab('participants')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                    rafflesSubTab === 'participants'
                      ? 'bg-[#0131CD] text-white border-[#B9FC01]/60 shadow-[0_6px_20px_rgba(1,49,205,0.45)]'
                      : 'bg-[#080A0F] text-[#FFFFFF] border-[var(--gio-border-subtle)] hover:bg-[#161C2C] hover:border-[var(--gio-border-active)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Users className="w-4 h-4 shrink-0 text-[#B9FC01]" />
                      <span>2. Participantes ({participants.length})</span>
                    </span>
                  </div>
                  <span
                    className={`text-[11px] leading-tight ${
                      rafflesSubTab === 'participants' ? 'text-white/90 font-medium' : 'text-[#94A3B8]'
                    }`}
                  >
                    Nomes, bilhetes e moedas
                  </span>
                </button>

                {/* 3. Histórico e Certificados */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={rafflesSubTab === 'history'}
                  onClick={() => setRafflesSubTab('history')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                    rafflesSubTab === 'history'
                      ? 'bg-[#0131CD] text-white border-[#B9FC01]/60 shadow-[0_6px_20px_rgba(1,49,205,0.45)]'
                      : 'bg-[#080A0F] text-[#FFFFFF] border-[var(--gio-border-subtle)] hover:bg-[#161C2C] hover:border-[var(--gio-border-active)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Trophy className={`w-4 h-4 shrink-0 ${rafflesSubTab === 'history' ? 'text-[#B9FC01]' : 'text-[#F5B942]'}`} />
                      <span>3. Histórico ({winners.length})</span>
                    </span>
                  </div>
                  <span
                    className={`text-[11px] leading-tight ${
                      rafflesSubTab === 'history' ? 'text-white/90 font-medium' : 'text-[#94A3B8]'
                    }`}
                  >
                    Resultados, certificados e auditoria
                  </span>
                </button>

                {/* 4. Assistente Guiado (Secundário e Discreto) */}
                <button
                  type="button"
                  role="tab"
                  aria-selected={rafflesSubTab === 'wizard'}
                  onClick={() => setRafflesSubTab('wizard')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                    rafflesSubTab === 'wizard'
                      ? 'bg-[#161C2C] text-[#FFFFFF] border-[#B9FC01]/60'
                      : 'bg-[#080A0F]/85 text-[#94A3B8] border-[var(--gio-border-subtle)] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 shrink-0 text-[#B9FC01]" />
                      <span>4. Assistente Guiado</span>
                    </span>
                    <span className="text-[10px] text-[#94A3B8]">Opcional</span>
                  </div>
                  <span className="text-[11px] leading-tight text-[#94A3B8]">
                    Configuração passo a passo
                  </span>
                </button>
              </div>
            </div>

            {/* OPÇÃO 1: ROLETA E GLOBO (Desktop: 2 colunas equilibradas | Mobile: Mesa primeiro e Participantes abaixo) */}
            {rafflesSubTab === 'arena' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-w-0">
                <div className="lg:col-span-6 lg:sticky lg:top-24 space-y-6 min-w-0">
                  <DrawSection
                    computed={computed}
                    settings={settings}
                    winners={winners}
                    participants={participants}
                    isDrawing={isDrawing}
                    currentDisplayNumber={displayNumber}
                    onDraw={() => handleTriggerDraw('drum')}
                    onRequestWheelSpin={() => handleTriggerDraw('wheel')}
                    wheelSpinSignal={wheelSpinSignal}
                    onWheelSpinEnd={handleWheelSpinEnd}
                    onUpdateSettings={handleUpdateSettings}
                    onRemoveWinner={handleRemoveWinner}
                    onClearWinners={handleClearWinners}
                    onOpenBattleRoyale={() => setIsBattleRoyaleOpen(true)}
                    onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
                    onOpenMonteCarlo={() => setIsMonteCarloOpen(true)}
                    onOpenPrizeQueue={() => setIsPrizeQueueOpen(true)}
                    onOpenCelebration={(w) => setCelebrationWinner(w)}
                    onOpenAuditReport={() => setIsAuditReportOpen(true)}
                    rosterHash={rosterHash}
                    onRestoreState={(state) => {
                      setSettings(state.settings);
                      setParticipants(state.participants);
                      setWinners(state.winners);
                    }}
                    onResetToSample={() => {
                      setParticipants(INITIAL_SAMPLE_PARTICIPANTS);
                      setWinners([]);
                      setDisplayNumber('?');
                    }}
                    onResetCoinsOnly={() => {
                      setParticipants((prev) => prev.map((p) => ({ ...p, coins: 0 })));
                    }}
                    predeterminedWinningTicket={predeterminedWinningTicket}
                    drawErrorMessage={drawErrorMessage}
                  />
                </div>

                <div className="lg:col-span-6 space-y-6 min-w-0">
                  <ParticipantManager
                    participants={participants}
                    computed={computed}
                    settings={settings}
                    winners={winners}
                    onAddParticipant={handleAddParticipant}
                    onUpdateCoins={handleUpdateCoins}
                    onRemoveParticipant={handleRemoveParticipant}
                    onClearAll={handleClearAllParticipants}
                    onBulkAdd={handleBulkAdd}
                    onSetParticipants={setParticipants}
                    onUpdateSettings={handleUpdateSettings}
                  />
                </div>
              </div>
            )}

            {/* SUBTAB 2: GESTÃO DE PARTICIPANTES */}
            {rafflesSubTab === 'participants' && (
              <div className="space-y-6 min-w-0">
                <ParticipantManager
                  participants={participants}
                  computed={computed}
                  settings={settings}
                  winners={winners}
                  onAddParticipant={handleAddParticipant}
                  onUpdateCoins={handleUpdateCoins}
                  onRemoveParticipant={handleRemoveParticipant}
                  onClearAll={handleClearAllParticipants}
                  onBulkAdd={handleBulkAdd}
                  onSetParticipants={setParticipants}
                  onUpdateSettings={handleUpdateSettings}
                />
              </div>
            )}



            {/* OPÇÃO 3: HISTÓRICO (Ganhadores, Cartão VIP, Certificados e Auditoria — Redesign 2.0) */}
            {rafflesSubTab === 'history' && (
              <div className="p-5 sm:p-6 rounded-2xl bg-[#10141E] border border-[var(--gio-border-subtle)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--gio-border-subtle)]">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-[#FFFFFF]">
                      Histórico de Resultados e Certificados
                    </h2>
                    <p className="text-xs text-[#94A3B8]">
                      Consulte todos os ganhadores registrados, emita o Cartão VIP ou baixe o Relatório Oficial em PDF com hash SHA-256.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPrizeQueueOpen(true)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#161C2C] hover:bg-white/[0.08] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] text-xs font-semibold transition"
                    >
                      Gerenciar Fila de Prêmios
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAuditReportOpen(true)}
                      className="gio-btn-primary min-h-[40px] px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Relatório Oficial em PDF</span>
                    </button>
                  </div>
                </div>

                {/* Integrity Summary Strip */}
                <div className="p-3.5 rounded-xl bg-[#080A0F] border border-[var(--gio-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-[#20C997] font-semibold">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Hash SHA-256 da Série Atual:</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#94A3B8] truncate select-all tabular-nums">
                    {rosterHash || 'Calculando hash...'}
                  </span>
                </div>

                {winners.length === 0 ? (
                  <div className="p-8 rounded-xl bg-[#080A0F] border border-[var(--gio-border-subtle)] text-center space-y-3">
                    <Trophy className="w-8 h-8 text-[#F5B942] mx-auto" />
                    <p className="text-sm font-bold text-[#FFFFFF]">Nenhum resultado registrado nesta sessão</p>
                    <p className="text-xs text-[#94A3B8]">
                      Realize um sorteio na aba Roleta e Globo para registrar o primeiro ganhador.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRafflesSubTab('arena')}
                      className="gio-btn-primary px-4 py-2 rounded-xl text-white font-semibold text-xs transition"
                    >
                      Ir para Roleta e Globo
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--gio-border-subtle)] rounded-xl border border-[var(--gio-border-subtle)] bg-[#080A0F] overflow-hidden">
                    {winners.map((w) => (
                      <div key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm hover:bg-[#161C2C]/40 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="px-2.5 py-1 rounded-lg bg-[#10141E] border border-[#F5B942]/40 text-[#F5B942] font-mono font-bold tabular-nums shrink-0">
                            #{w.number}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-[#FFFFFF] truncate">{w.name}</div>
                            <div className="text-xs text-[#94A3B8] tabular-nums">
                              {w.prize} · {formatDateTime(w.drawnAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setCelebrationWinner(w)}
                            className="px-3 py-1.5 rounded-lg bg-[#10141E] hover:bg-[#161C2C] text-[#FFFFFF] border border-[var(--gio-border-subtle)] font-medium text-xs flex items-center gap-1.5 transition"
                          >
                            <Maximize2 className="w-3.5 h-3.5 text-[#B9FC01]" />
                            <span>Telão</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedWinnerForCard(w)}
                            className="px-3 py-1.5 rounded-lg bg-[#10141E] hover:bg-[#161C2C] text-[#F5B942] border border-[#F5B942]/40 font-semibold text-xs flex items-center gap-1.5 transition"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Cartão VIP</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveWinner(w.id)}
                            title="Remover ganhador"
                            className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] p-2 flex items-center justify-center rounded-lg bg-[#10141E] hover:bg-[#F05262]/15 text-[#94A3B8] hover:text-[#F05262] border border-[var(--gio-border-subtle)] transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* OPÇÃO 5: ASSISTENTE GUIADO (Última opção, secundária e discreta) */}
            {rafflesSubTab === 'wizard' && (
              <GuidedRaffleWizard
                settings={settings}
                participants={participants}
                winners={winners}
                computed={computed}
                entitlement={planEntitlement}
                isDrawing={isDrawing}
                currentDisplayNumber={displayNumber}
                onUpdateSettings={handleUpdateSettings}
                onAddParticipant={handleAddParticipant}
                onBulkAdd={handleBulkAdd}
                onTriggerDraw={handleTriggerDraw}
                onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
                onOpenAuditReport={() => setIsAuditReportOpen(true)}
                onOpenLivePro={handleOpenLiveProTab}
                onOpenCommentsSorter={() => {
                  setTiktokInitialTab('feed');
                  setTiktokInitialMode('traditional_comments');
                  setActiveTab('tiktok');
                }}
                onOpenSubscription={() => setActiveTab('subscription')}
                onCloseWizard={() => setRafflesSubTab('arena')}
              />
            )}
          </div>
        )}

        {/* 3. TIKTOK LIVE PRO */}
        {activeTab === 'tiktok' && (
          <TikTokLiveManager
            settings={settings}
            soundEnabled={soundActive}
            onToggleSound={handleToggleSound}
            onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
            adminLabel={currentUser?.email || currentUser?.displayName || 'Organizador Autorizado'}
            initialProTab={tiktokInitialTab}
            initialPlatformMode={tiktokInitialMode}
          />
        )}

        {/* 4. PARTICIPANTES (CADASTRO, LISTA, FILTROS E CONSULTA DE BILHETES) */}
        {activeTab === 'search' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-2.5 rounded-2xl bg-[#10141E] border border-[var(--gio-border-subtle)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setParticipantsSubTab('manage')}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                    participantsSubTab === 'manage'
                      ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                      : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                  }`}
                >
                  <Users className={`w-4 h-4 ${participantsSubTab === 'manage' ? 'text-[#B9FC01]' : ''}`} />
                  <span>Lista de Participantes ({participants.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setParticipantsSubTab('lookup')}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                    participantsSubTab === 'lookup'
                      ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                      : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                  }`}
                >
                  <Search className={`w-4 h-4 ${participantsSubTab === 'lookup' ? 'text-[#B9FC01]' : ''}`} />
                  <span>Consultar Bilhetes e QR Code</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenLiveProTab('audit')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#080A0F] hover:bg-[#161C2C] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Radio className="w-3.5 h-3.5 text-[#B9FC01]" />
                <span>Participantes da TikTok LIVE</span>
              </button>
            </div>

            {participantsSubTab === 'manage' ? (
              <ParticipantManager
                participants={participants}
                computed={computed}
                settings={settings}
                winners={winners}
                onAddParticipant={handleAddParticipant}
                onUpdateCoins={handleUpdateCoins}
                onRemoveParticipant={handleRemoveParticipant}
                onClearAll={handleClearAllParticipants}
                onBulkAdd={handleBulkAdd}
                onSetParticipants={setParticipants}
              />
            ) : (
              <TicketSearch
                computed={computed}
                settings={settings}
                winners={winners}
                participants={participants}
                onUpdateSettings={handleUpdateSettings}
                onLoadPublicRaffle={handleLoadPublicRaffle}
                onResetToLocal={handleResetToLocal}
                isViewingExternalRaffle={isViewingExternalRaffle}
                currentUser={currentUser}
              />
            )}
          </div>
        )}

        {/* 5. RELATÓRIOS (ESTATÍSTICAS, BILHETES EMITIDOS, HISTÓRICO E EXPORTAÇÃO) */}
        {activeTab === 'stats' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-5 rounded-2xl bg-[#10141E] border border-[var(--gio-border-subtle)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-[#FFFFFF] tracking-tight">
                  Relatórios, Estatísticas e Exportação
                </h1>
                <p className="text-xs text-[#94A3B8]">
                  Analise as probabilidades matemáticas de cada participante, emita certificados PDF e exporte planilhas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportFullReportCsv}
                  disabled={participants.length === 0}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080A0F] hover:bg-[#161C2C] disabled:opacity-40 text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4 text-[#B9FC01]" />
                  <span>Exportar Planilha CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintSheetOpen(true)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#080A0F] hover:bg-[#161C2C] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Printer className="w-4 h-4 text-[#F5B942]" />
                  <span>Folha de Bilhetes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAuditReportOpen(true)}
                  className="gio-btn-primary min-h-[40px] px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Certificado Oficial PDF</span>
                </button>
              </div>
            </div>

            <StatsProbabilities computed={computed} settings={settings} winners={winners} />
          </div>
        )}

        {/* 6. ASSINATURA (MEU PLANO FREE vs PRO) */}
        {activeTab === 'subscription' && (
          <SubscriptionPlanView
            entitlement={planEntitlement}
            onSwitchPlan={(tier, state) => handleSwitchPlanTier(tier, state)}
            onNavigateToLivePro={() => handleOpenLiveProTab('feed')}
            onNavigateToParticipants={() => {
              setActiveTab('search');
              setParticipantsSubTab('manage');
            }}
            onOpenLegalDocument={handleOpenLegalDocument}
            userId={currentUser?.uid}
            userEmail={currentUser?.email || undefined}
            emailVerified={Boolean(currentUser?.emailVerified)}
          />
        )}

        {/* 6B. CENTRAL DE TRANSPARÊNCIA, TERMOS, PRIVACIDADE (LGPD), FAQ & SUPORTE */}
        {activeTab === 'legal' && (
          <LegalTrustCenter
            initialSlug={legalInitialSlug}
            initialPortalTab={legalInitialPortalTab}
            userId={currentUser?.uid}
            userEmail={currentUser?.email || undefined}
            userName={currentUser?.displayName || undefined}
            isAdminAuthorized={true}
            onOpenCookieSettings={() => setIsCookiePreferencesOpen(true)}
          />
        )}

        {/* 7. CONFIGURAÇÕES (REGRAS, PERFIL, AJUDA, SUPORTE & CENTRAL LEGAL) */}
        {(activeTab === 'settings' || activeTab === 'help' || activeTab === 'support') && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-2.5 rounded-2xl bg-[#10141E] border border-[var(--gio-border-subtle)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSettingsSubTab('preferences')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  settingsSubTab === 'preferences'
                    ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                }`}
              >
                <Settings className={`w-4 h-4 ${settingsSubTab === 'preferences' ? 'text-[#B9FC01]' : ''}`} />
                <span>Regras, Backup e Áudio</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('profile')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  settingsSubTab === 'profile'
                    ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                }`}
              >
                <User className={`w-4 h-4 ${settingsSubTab === 'profile' ? 'text-[#B9FC01]' : ''}`} />
                <span>Minha Conta e Nuvem</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('help')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  settingsSubTab === 'help'
                    ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                }`}
              >
                <HelpCircle className={`w-4 h-4 ${settingsSubTab === 'help' ? 'text-[#B9FC01]' : ''}`} />
                <span>Como Funciona</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('support')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  settingsSubTab === 'support'
                    ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                }`}
              >
                <Heart className={`w-4 h-4 ${settingsSubTab === 'support' ? 'text-[#B9FC01]' : ''}`} />
                <span>Suporte</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('legal')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                  settingsSubTab === 'legal'
                    ? 'bg-[#0131CD] text-white border border-[#B9FC01]/50 shadow-[0_4px_14px_rgba(1,49,205,0.4)]'
                    : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
                }`}
              >
                <Scale className={`w-4 h-4 ${settingsSubTab === 'legal' ? 'text-[#B9FC01]' : ''}`} />
                <span>Central Legal e LGPD</span>
              </button>
            </div>

            {settingsSubTab === 'preferences' && (
              <SettingsBackup
                settings={settings}
                participants={participants}
                winners={winners}
                computed={computed}
                onUpdateSettings={handleUpdateSettings}
                onRestoreState={(state) => {
                  setSettings(state.settings);
                  setParticipants(state.participants);
                  setWinners(state.winners);
                }}
                onResetToSample={() => {
                  setParticipants(INITIAL_SAMPLE_PARTICIPANTS);
                  setWinners([]);
                  setDisplayNumber('?');
                }}
                onResetCoinsOnly={() => {
                  setParticipants((prev) => prev.map((p) => ({ ...p, coins: 0 })));
                }}
                onOpenAuditReport={() => setIsAuditReportOpen(true)}
                rosterHash={rosterHash}
              />
            )}

            {settingsSubTab === 'profile' && (
              <div className="p-6 rounded-2xl bg-[#10141E] border border-[var(--gio-border-subtle)] shadow-[0_10px_30px_rgba(0,0,0,0.45)] space-y-4">
                <h2 className="text-lg font-bold text-[#FFFFFF]">
                  Perfil do Organizador e Sincronização na Nuvem
                </h2>
                <p className="text-xs sm:text-sm text-[#94A3B8]">
                  {currentUser
                    ? `Conectado como ${currentUser.displayName || currentUser.email}. Seus sorteios são sincronizados automaticamente.`
                    : 'Conecte sua conta para salvar seus sorteios na nuvem e acessá-los de qualquer dispositivo.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAccountOpen(true)}
                    className="gio-btn-primary min-h-[42px] px-5 py-2.5 rounded-xl text-white font-semibold text-xs transition"
                  >
                    {currentUser ? 'Gerenciar Conta e Backup na Nuvem' : 'Conectar Minha Conta'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOnboardingOpen(true)}
                    className="min-h-[42px] px-4 py-2.5 rounded-xl bg-[#080A0F] hover:bg-[#161C2C] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] font-semibold text-xs transition"
                  >
                    Reabrir Tutorial de Boas-Vindas
                  </button>
                </div>
              </div>
            )}

            {settingsSubTab === 'help' && <HowItWorks settings={settings} />}

            {settingsSubTab === 'support' && (
              <SupportTab
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
              />
            )}

            {settingsSubTab === 'legal' && (
              <LegalTrustCenter
                initialSlug={legalInitialSlug}
                initialPortalTab={legalInitialPortalTab}
                userId={currentUser?.uid}
                userEmail={currentUser?.email || undefined}
                userName={currentUser?.displayName || undefined}
                isAdminAuthorized={true}
                onOpenCookieSettings={() => setIsCookiePreferencesOpen(true)}
              />
            )}
          </div>
        )}
      </main>

      {/* First-Time User Onboarding Tour Modal */}
      <OnboardingTourModal
        isOpen={isOnboardingOpen}
        onClose={handleCloseOnboarding}
        onStartGuidedWizard={handleStartGuidedWizard}
        onGoToLivePro={() => handleOpenLiveProTab('feed')}
      />

      {/* Account / Cloud Sync Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        currentUser={currentUser}
        syncStatus={syncStatus}
        onSaveToCloud={saveToCloud}
        onLoadFromCloud={loadFromCloud}
        settings={settings}
        participants={participants}
        winners={winners}
        onOpenLegalDocument={(slug) => {
          setIsAccountOpen(false);
          handleOpenLegalDocument(slug);
        }}
      />

      {/* Fullscreen Presentation Modal (Modo Telão) */}
      <PresentationModal
        isOpen={isPresentationOpen}
        onClose={() => setIsPresentationOpen(false)}
        computed={computed}
        settings={settings}
        latestWinner={winners.length > 0 ? winners[0] : null}
        currentDisplayNumber={displayNumber}
        isDrawing={isDrawing}
        onDraw={() => handleTriggerDraw('drum')}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* Battle Royale Elimination Tournament Modal */}
      <BattleRoyaleModal
        isOpen={isBattleRoyaleOpen}
        onClose={() => setIsBattleRoyaleOpen(false)}
        computed={computed}
        settings={settings}
        onRecordWinner={(winner) => {
          setWinners((prev) => [winner, ...prev]);
          setCelebrationWinner(winner);
        }}
      />

      {/* Social Media VIP Victory Card Modal */}
      <VictoryCardModal
        isOpen={Boolean(selectedWinnerForCard)}
        onClose={() => setSelectedWinnerForCard(null)}
        winner={selectedWinnerForCard}
        participant={participants.find((p) => p.id === selectedWinnerForCard?.participantId)}
        settings={settings}
        rosterHash={rosterHash}
        allWinners={winners}
        onSelectWinner={(w) => setSelectedWinnerForCard(w)}
      />

      {/* Monte Carlo & Fairness Audit Modal */}
      <MonteCarloModal
        isOpen={isMonteCarloOpen}
        onClose={() => setIsMonteCarloOpen(false)}
        computed={computed}
        settings={settings}
        participants={participants}
      />

      {/* Prize Queue & Podium Modal */}
      <PrizeQueueModal
        isOpen={isPrizeQueueOpen}
        onClose={() => setIsPrizeQueueOpen(false)}
        settings={settings}
        winners={winners}
        onUpdateSettings={handleUpdateSettings}
        onSetCurrentPrize={(pName) => setSettings((s) => ({ ...s, currentPrize: pName }))}
      />

      {/* OBS Studio Transparent Stream Overlay Modal */}
      <ObsOverlayModal
        isOpen={isObsOverlayOpen}
        onClose={() => setIsObsOverlayOpen(false)}
        computed={computed}
        settings={settings}
        latestWinner={winners.length > 0 ? winners[0] : null}
        currentDisplayNumber={displayNumber}
        isDrawing={isDrawing}
        onDraw={() => handleTriggerDraw('drum')}
      />

      {/* Print Sheet Modal */}
      <PrintSheetModal
        isOpen={isPrintSheetOpen}
        onClose={() => setIsPrintSheetOpen(false)}
        computed={computed}
        settings={settings}
      />

      {/* Official Audited PDF Report Modal */}
      <AuditReportModal
        isOpen={isAuditReportOpen}
        onClose={() => setIsAuditReportOpen(false)}
        winners={winners}
        rosterHash={rosterHash}
        settings={settings}
        computed={computed}
        participantsCount={participants.length}
      />

      {/* Dramatic Suspense Countdown Overlay */}
      <DrawCountdownOverlay
        isOpen={countdownRemaining !== null}
        secondsRemaining={countdownRemaining ?? 0}
        totalSeconds={settings.countdownSeconds ?? 10}
        settings={settings}
        eligibleTicketsCount={computed.eligibleTickets.length}
        participantsCount={computed.allocations.filter((a) => a.assignedTickets > 0).length}
        onSkip={handleSkipCountdown}
        onCancel={handleCancelCountdown}
      />

      {/* Fullscreen Dramatic Celebration Overlay */}
      <WinnerCelebrationOverlay
        winner={celebrationWinner}
        participant={participants.find((p) => p.id === celebrationWinner?.participantId)}
        settings={settings}
        winners={winners}
        rosterHash={rosterHash}
        computed={computed}
        participantsCount={participants.length}
        onClose={() => setCelebrationWinner(null)}
        onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
      />

      {/* Professional Full-Featured Footer */}
      <Footer
        onNavigateTab={handleSelectNavigationTab}
        onOpenLegalDocument={handleOpenLegalDocument}
        onOpenPrivacyPortal={handleOpenPrivacyPortal}
        onOpenSupportPortal={handleOpenSupportPortal}
        onOpenCookieSettings={() => setIsCookiePreferencesOpen(true)}
      />
      </div>

      {/* LGPD Cookie Consent Banner & Preferences Modal */}
      <CookieConsentBanner
        userId={currentUser?.uid}
        forceOpenPreferences={isCookiePreferencesOpen}
        onClosePreferences={() => setIsCookiePreferencesOpen(false)}
        onOpenLegalDocument={handleOpenLegalDocument}
      />
    </div>
  );
}
