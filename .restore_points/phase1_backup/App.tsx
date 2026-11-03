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
} from './utils/tiktokLiveService';
import { Header, AppNavigationTab } from './components/Header';
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
import { TikTokRaffle } from './components/TikTokRaffle';
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
  const [rafflesSubTab, setRafflesSubTab] = useState<'arena' | 'wizard' | 'comments' | 'history'>('arena');
  const [participantsSubTab, setParticipantsSubTab] = useState<'manage' | 'lookup'>('manage');
  const [reportsSubTab, setReportsSubTab] = useState<'overview' | 'ExportAndHistory'>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'preferences' | 'profile' | 'help' | 'support'>('preferences');
  const [tiktokInitialTab, setTiktokInitialTab] = useState<'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor'>('feed');
  const [tiktokInitialMode, setTiktokInitialMode] = useState<'live_pro' | 'traditional_comments'>('live_pro');
  const [legalInitialSlug, setLegalInitialSlug] = useState<LegalDocumentSlug>('termos-de-uso');
  const [legalInitialPortalTab, setLegalInitialPortalTab] = useState<'documents' | 'privacy_lgpd' | 'help_support' | 'admin_legal'>('documents');
  const [isCookiePreferencesOpen, setIsCookiePreferencesOpen] = useState(false);

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
  const [liveConnectionState, setLiveConnectionState] = useState<string>('DISCONNECTED');
  const [liveConnectedUsername, setLiveConnectedUsername] = useState<string>('');

  const refreshPlatformStatus = useCallback(async () => {
    try {
      const planRes = await fetch('/api/tiktok/plan/status');
      if (planRes.ok) {
        const planData = await planRes.json();
        if (planData && planData.tier) {
          setPlanEntitlement(planData);
          setProPlanTier(planData.tier);
        }
      }
    } catch {
      // Fallback to local service state
    }

    try {
      const statusRes = await fetch('/api/tiktok/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData?.status?.state) {
          setLiveConnectionState(statusData.status.state);
          setLiveConnectedUsername(statusData.status.roomUsername || '');
        }
      }
    } catch {
      // Ignore
    }

    try {
      const sessions = await fetchAllLiveSessions(15);
      setLiveSessionsSummary(sessions);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    refreshPlatformStatus();
  }, [refreshPlatformStatus, activeTab]);

  const handleSwitchPlanTier = useCallback(
    async (tier: SubscriptionPlanTier, statusState?: SubscriptionStatusState) => {
      setIsUpdatingPlan(true);
      try {
        const res = await fetch('/api/tiktok/plan/tier', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-authorized': 'true',
          },
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

  // Firebase Auth & Cloud Sync State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
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

  // Auth state listener
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
          const raffleRef = doc(db, 'users', user.uid, 'raffles', 'default');
          const snap = await getDoc(raffleRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data && Array.isArray(data.participants) && data.participants.length > 0) {
              setParticipants(data.participants);
              if (data.settings) setSettings((s) => ({ ...s, ...data.settings }));
              if (Array.isArray(data.winners)) setWinners(data.winners);
            }
          }
        } catch (err) {
          console.warn('Initial cloud fetch notice:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Save to Cloud Function
  const saveToCloud = useCallback(async () => {
    if (!currentUser) return;
    setSyncStatus('saving');
    const rafflePath = `users/${currentUser.uid}/raffles/default`;
    try {
      const raffleRef = doc(db, 'users', currentUser.uid, 'raffles', 'default');
      await setDoc(raffleRef, {
        userId: currentUser.uid,
        title: 'GIO DA SORTE',
        settings,
        participants,
        winners,
        updatedAt: new Date().toISOString(),
      });
      setSyncStatus('synced');
    } catch (error) {
      setSyncStatus('error');
      handleFirestoreError(error, OperationType.WRITE, rafflePath);
    }
  }, [currentUser, settings, participants, winners]);

  // Load from Cloud Function
  const loadFromCloud = useCallback(async () => {
    if (!currentUser) return;
    const rafflePath = `users/${currentUser.uid}/raffles/default`;
    try {
      const raffleRef = doc(db, 'users', currentUser.uid, 'raffles', 'default');
      const snap = await getDoc(raffleRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.settings) setSettings((s) => ({ ...s, ...data.settings }));
        if (Array.isArray(data.participants)) setParticipants(data.participants);
        if (Array.isArray(data.winners)) setWinners(data.winners);
        setSyncStatus('synced');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, rafflePath);
    }
  }, [currentUser]);

  // Idle Auto-Save
  const { autoSaveStatus, lastSavedAt, flushNow } = useIdleAutoSave({
    settings,
    participants,
    winners,
    isDrawing: isDrawing || countdownRemaining !== null,
  });

  // Debounced cloud save if logged in
  const cloudSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (currentUser) {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      setSyncStatus('saving');
      cloudSaveTimerRef.current = setTimeout(() => {
        saveToCloud().catch(() => {});
      }, 1500);
    }
  }, [settings, participants, winners, currentUser, saveToCloud]);

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

  // Participant management actions
  const handleAddParticipant = (name: string, coins: number) => {
    const cleanName = name.trim();
    if (!cleanName) return;

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
      return [
        ...prev,
        {
          id: generateUid(),
          name: cleanName,
          coins,
          addedAt: Date.now(),
        },
      ];
    });
  };

  const handleUpdateCoins = (id: string, coins: number) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, coins: Math.max(0, coins) } : p))
    );
  };

  const handleRemoveParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleClearAllParticipants = () => {
    setParticipants([]);
    setWinners([]);
    setDisplayNumber('?');
  };

  const handleBulkAdd = (list: { name: string; coins: number }[], replace: boolean) => {
    setParticipants((prev) => {
      const base = replace ? [] : [...prev];
      list.forEach((item) => {
        const idx = base.findIndex((p) => p.name.toLowerCase() === item.name.toLowerCase());
        if (idx >= 0) {
          base[idx] = { ...base[idx], coins: base[idx].coins + item.coins };
        } else {
          base.push({
            id: generateUid(),
            name: item.name,
            coins: item.coins,
            addedAt: Date.now(),
          });
        }
      });
      return base;
    });
  };

  // Winner actions
  const handleRemoveWinner = (winnerId: string) => {
    setWinners((prev) => prev.filter((w) => w.id !== winnerId));
  };

  const handleClearWinners = () => {
    setWinners([]);
  };

  // Wheel spin conclusion handler
  const handleWheelSpinEnd = (chosenTicket: { number: number; participantId: string; name: string }) => {
    setDisplayNumber(chosenTicket.number);
    setIsDrawing(false);

    const newWinner: Winner = {
      id: generateUid(),
      participantId: chosenTicket.participantId,
      name: chosenTicket.name,
      number: chosenTicket.number,
      prize: settings.prizeName || settings.currentPrize || 'Roleta da Fortuna',
      drawnAt: Date.now(),
    };

    setWinners((prev) => {
      const next = [newWinner, ...prev];
      idleStorage.scheduleSave({ settings, participants, winners: next }, true);
      return next;
    });
    setCelebrationWinner(newWinner);
  };

  // Traditional Ticket Draw execution (Drum Roll)
  const drawingRef = useRef(false);
  const executeDrumDraw = useCallback(() => {
    if (drawingRef.current || isDrawing) return;
    const pool = computed.eligibleTickets;
    if (pool.length === 0) return;

    drawingRef.current = true;
    setIsDrawing(true);

    const winningIndex = secureRandomInt(pool.length);
    const chosenTicket = pool[winningIndex];

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

        const newWinner: Winner = {
          id: generateUid(),
          participantId: chosenTicket.participantId,
          name: chosenTicket.name,
          number: chosenTicket.number,
          prize: settings.prizeName || settings.currentPrize || 'Prêmio Oficial',
          drawnAt: Date.now(),
        };

        setWinners((prev) => {
          const next = [newWinner, ...prev];
          idleStorage.scheduleSave({ settings, participants, winners: next }, true);
          return next;
        });
        setCelebrationWinner(newWinner);
        playWinnerFanfare();
        fireWinnerConfetti();
        return;
      }

      const randomTicket = pool[secureRandomInt(pool.length)];
      setDisplayNumber(randomTicket.number);

      tickCount++;
      if (tickCount % 2 === 0) {
        playTick(1 + progress * 0.4);
      }

      const nextDelay = 35 + Math.pow(progress, 2.5) * 220;
      setTimeout(tick, nextDelay);
    };

    tick();
  }, [isDrawing, computed.eligibleTickets, settings.spinDuration, settings.currentPrize, settings.prizeName]);

  // Unified Draw Trigger
  const handleTriggerDraw = useCallback(
    (mode: 'drum' | 'wheel' = 'drum') => {
      if (drawingRef.current || isDrawing || countdownRemaining !== null) return;
      if (computed.eligibleTickets.length === 0) return;

      const countdownTime = settings.countdownSeconds !== undefined ? settings.countdownSeconds : 10;
      if (countdownTime <= 0) {
        if (mode === 'drum') {
          executeDrumDraw();
        } else {
          setWheelSpinSignal((s) => s + 1);
        }
        return;
      }

      setPendingDrawType(mode);
      setCountdownRemaining(countdownTime);
      playCountdownTick(countdownTime);
    },
    [isDrawing, countdownRemaining, computed.eligibleTickets.length, settings.countdownSeconds, executeDrumDraw]
  );

  // Countdown timer decrement effect
  useEffect(() => {
    if (countdownRemaining === null) return;

    if (countdownRemaining <= 0) {
      playCountdownLaunch();
      setCountdownRemaining(null);
      if (pendingDrawType === 'drum') {
        executeDrumDraw();
      } else {
        setWheelSpinSignal((s) => s + 1);
      }
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
  }, [countdownRemaining, pendingDrawType, executeDrumDraw]);

  const handleSkipCountdown = useCallback(() => {
    if (countdownRemaining === null) return;
    playCountdownLaunch();
    setCountdownRemaining(null);
    if (pendingDrawType === 'drum') {
      executeDrumDraw();
    } else {
      setWheelSpinSignal((s) => s + 1);
    }
  }, [countdownRemaining, pendingDrawType, executeDrumDraw]);

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
    <div
      className={`min-h-screen pb-20 lg:pb-0 ${
        settings.themeMode === 'neon' ? 'theme-neon theme-neon-canvas' : 'studio-canvas'
      } text-slate-100 flex flex-col font-sans transition-colors duration-300`}
    >
      {/* Top Navigation Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectNavigationTab}
        onStartNewRaffle={handleStartGuidedWizard}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        isProPlan={planEntitlement.active && planEntitlement.tier === 'PRO'}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        onOpenPresentation={() => setIsPresentationOpen(true)}
        onOpenPrintSheet={() => setIsPrintSheetOpen(true)}
        onOpenObsOverlay={() => setIsObsOverlayOpen(true)}
        currentUser={currentUser}
        onOpenAccount={() => setIsAccountOpen(true)}
        totalParticipants={participants.length}
        themeMode={settings.themeMode || 'default'}
        onToggleTheme={() =>
          setSettings((s) => ({
            ...s,
            themeMode: s.themeMode === 'neon' ? 'default' : 'neon',
          }))
        }
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
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
            onStartNewRaffleWizard={handleStartGuidedWizard}
            onOpenTraditionalDraw={() => {
              setActiveTab('draw');
              setRafflesSubTab('arena');
            }}
            onOpenCommentsSorter={() => {
              setActiveTab('draw');
              setRafflesSubTab('comments');
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

        {/* 2. SORTEIOS (TRADICIONAL, ASSISTENTE GUIADO, COMENTÁRIOS E HISTÓRICO) */}
        {activeTab === 'draw' && (
          <div className="space-y-6 animate-fade-in">
            {/* Sorteios Sub-Navigation */}
            <div className="p-2 rounded-2xl bg-[#0A1128]/90 border border-blue-900/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRafflesSubTab('arena')}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    rafflesSubTab === 'arena'
                      ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Ticket className="w-4 h-4 text-sky-400" />
                  <span>Mesa de Sorteio (Tambor & Roleta)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRafflesSubTab('wizard')}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    rafflesSubTab === 'wizard'
                      ? 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white shadow-sm font-black'
                      : 'text-[#FDA4AF] hover:bg-white/[0.04]'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Assistente Passo a Passo (6 Etapas)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRafflesSubTab('comments')}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    rafflesSubTab === 'comments'
                      ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span>Sorteador de Comentários TikTok</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRafflesSubTab('history')}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    rafflesSubTab === 'history'
                      ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Trophy className="w-4 h-4 text-[#F43F5E]" />
                  <span>Meus Sorteios & Resultados ({winners.length})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenLiveProTab('feed')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#050814] hover:bg-slate-900 text-[#FDA4AF] border border-[#E11D48]/45 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Radio className="w-3.5 h-3.5 text-[#F43F5E]" />
                <span>Sorteio por Presentes da LIVE</span>
              </button>
            </div>

            {rafflesSubTab === 'wizard' && (
              <GuidedRaffleWizard
                settings={settings}
                participants={participants}
                winners={winners}
                computed={computed}
                entitlement={planEntitlement}
                isDrawing={isDrawing}
                currentDisplayNumber={displayNumber}
                onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
                onAddParticipant={handleAddParticipant}
                onBulkAdd={handleBulkAdd}
                onTriggerDraw={handleTriggerDraw}
                onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
                onOpenAuditReport={() => setIsAuditReportOpen(true)}
                onOpenLivePro={handleOpenLiveProTab}
                onOpenCommentsSorter={() => setRafflesSubTab('comments')}
                onOpenSubscription={() => setActiveTab('subscription')}
                onCloseWizard={() => setRafflesSubTab('arena')}
              />
            )}

            {rafflesSubTab === 'arena' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
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
                    onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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
                  />
                </div>

                <div className="lg:col-span-7 space-y-6">
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
                </div>
              </div>
            )}

            {rafflesSubTab === 'comments' && (
              <TikTokRaffle
                settings={settings}
                soundEnabled={soundActive}
                onToggleSound={handleToggleSound}
                onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
              />
            )}

            {rafflesSubTab === 'history' && (
              <div className="p-6 rounded-2xl bg-[#0A1128]/90 border border-blue-900/60 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg sm:text-xl font-display font-black text-white">
                      Meus Sorteios & Histórico de Resultados
                    </h2>
                    <p className="text-xs text-slate-300">
                      Consulte os ganhadores sorteados, gere cartões para redes sociais ou emita o certificado PDF.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPrizeQueueOpen(true)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold"
                    >
                      Gerenciar Fila de Prêmios
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAuditReportOpen(true)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white text-xs font-black flex items-center gap-1.5"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Relatório Oficial em PDF</span>
                    </button>
                  </div>
                </div>

                {winners.length === 0 ? (
                  <div className="p-8 rounded-xl bg-[#050814]/60 border border-slate-800 text-center space-y-3">
                    <Trophy className="w-8 h-8 text-[#F43F5E] mx-auto" />
                    <p className="text-sm font-bold text-white">Nenhum resultado registrado nesta sessão</p>
                    <button
                      type="button"
                      onClick={() => setRafflesSubTab('wizard')}
                      className="px-4 py-2 rounded-xl bg-[#E11D48] text-white font-bold text-xs"
                    >
                      Iniciar Sorteio Passo a Passo
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {winners.map((w) => (
                      <div key={w.id} className="py-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm">
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-lg bg-[#E11D48]/20 text-[#FDA4AF] font-mono font-bold">
                            #{w.number}
                          </span>
                          <div>
                            <div className="font-bold text-white">{w.name}</div>
                            <div className="text-xs text-slate-400">
                              {w.prize} · {formatDateTime(w.drawnAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedWinnerForCard(w)}
                            className="px-3 py-1.5 rounded-lg bg-[#E11D48]/20 text-[#FDA4AF] border border-[#E11D48]/45 font-bold text-xs flex items-center gap-1"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Cartão VIP</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
            <div className="p-2 rounded-2xl bg-[#0A1128]/90 border border-blue-900/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setParticipantsSubTab('manage')}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    participantsSubTab === 'manage'
                      ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4 text-sky-400" />
                  <span>Lista de Usuários, Importação & Filtros ({participants.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setParticipantsSubTab('lookup')}
                  className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                    participantsSubTab === 'lookup'
                      ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Search className="w-4 h-4 text-[#F43F5E]" />
                  <span>Consultar Bilhetes, Rifas Públicas & QR Code</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleOpenLiveProTab('audit')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#050814] text-[#FDA4AF] border border-[#E11D48]/45 text-xs font-bold flex items-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5 text-[#F43F5E]" />
                <span>Histórico de Participantes da TikTok LIVE</span>
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
                onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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
            <div className="p-5 rounded-2xl bg-[#0A1128]/90 border border-blue-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-display font-black text-white">
                  Relatórios, Estatísticas e Exportação de Dados
                </h1>
                <p className="text-xs text-slate-300">
                  Analise as probabilidades matemáticas de cada participante, emita certificados PDF e exporte planilhas.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportFullReportCsv}
                  disabled={participants.length === 0}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Planilha CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintSheetOpen(true)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Folha de Bilhetes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAuditReportOpen(true)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white text-xs font-black flex items-center gap-1.5 transition"
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

        {/* 7. CONFIGURAÇÕES (PREFERÊNCIAS, PERFIL, SEGURANÇA, AJUDA & SUPORTE) */}
        {(activeTab === 'settings' || activeTab === 'help' || activeTab === 'support') && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-2 rounded-2xl bg-[#0A1128]/90 border border-blue-900/60 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSettingsSubTab('preferences')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  settingsSubTab === 'preferences'
                    ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4 text-sky-400" />
                <span>Preferências, Regras & Segurança</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('profile')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  settingsSubTab === 'profile'
                    ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <User className="w-4 h-4 text-[#F43F5E]" />
                <span>Perfil & Sincronização na Nuvem</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('help')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  settingsSubTab === 'help'
                    ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                <span>Ajuda & Regulamento</span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsSubTab('support')}
                className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                  settingsSubTab === 'support'
                    ? 'bg-[#1E3A8A] text-white border border-sky-400/40 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Heart className="w-4 h-4 text-rose-400" />
                <span>Suporte & Apoiar</span>
              </button>
            </div>

            {settingsSubTab === 'preferences' && (
              <SettingsBackup
                settings={settings}
                participants={participants}
                winners={winners}
                computed={computed}
                onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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
              <div className="p-6 rounded-2xl bg-[#0A1128]/90 border border-blue-900/60 space-y-4">
                <h2 className="text-lg font-display font-bold text-white">
                  Perfil do Organizador & Sincronização na Nuvem
                </h2>
                <p className="text-xs sm:text-sm text-slate-300">
                  {currentUser
                    ? `Conectado como ${currentUser.displayName || currentUser.email}. Seus sorteios são sincronizados automaticamente.`
                    : 'Conecte sua conta Google para salvar seus sorteios na nuvem e acessá-los de qualquer dispositivo.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAccountOpen(true)}
                    className="min-h-[42px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#E11D48] to-[#F43F5E] text-white font-black text-xs"
                  >
                    {currentUser ? 'Gerenciar Conta e Backup na Nuvem' : 'Conectar Minha Conta Agora'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOnboardingOpen(true)}
                    className="min-h-[42px] px-4 py-2.5 rounded-xl bg-slate-900 text-slate-200 border border-slate-700 font-semibold text-xs"
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
                onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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
        onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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
        onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
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
