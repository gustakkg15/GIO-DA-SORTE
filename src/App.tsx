import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Participant,
  RaffleSettings,
  Winner,
  PublicRaffle,
} from './types';
import { fetchPublicRaffle } from './utils/publicRaffle';
import {
  STORAGE_KEY,
  DEFAULT_SETTINGS,
  INITIAL_SAMPLE_PARTICIPANTS,
  computeRaffle,
  secureRandomInt,
  generateUid,
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
import { Header } from './components/Header';
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
            countdownSeconds: parsed.settings.countdownSeconds !== undefined ? parsed.settings.countdownSeconds : 10,
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

  // Navigation & Sound State
  const [activeTab, setActiveTab] = useState<'draw' | 'search' | 'stats' | 'settings' | 'help' | 'support'>('draw');
  const [soundActive, setSoundActive] = useState<boolean>(() => isSoundEnabled());

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
  const [rosterHash, setRosterHash] = useState<string>('');

  // Sorteio Countdown State (10 Segundos)
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

  // URL query parameter support (e.g. ?sorteio=GIO-7492)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const raffleParam = urlParams.get('sorteio') || urlParams.get('code') || urlParams.get('raffle');
    if (raffleParam) {
      setActiveTab('search');
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

  const handleLoadPublicRaffle = useCallback((raffle: PublicRaffle) => {
    if (!isViewingExternalRaffle) {
      setLocalBackupRaffle({ settings, participants, winners });
    }
    setSettings(raffle.settings);
    setParticipants(raffle.participants);
    setWinners(raffle.winners);
    setIsViewingExternalRaffle(true);
    setActiveTab('search');
  }, [isViewingExternalRaffle, settings, participants, winners]);

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
        // Sync user profile document
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

        // Check if user has saved cloud raffle data
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

  // Persistent storage local auto-save & debounced cloud save
  const cloudSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    try {
      const data = {
        settings,
        participants,
        winners,
        updatedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Ignore local storage errors
    }

    // Debounce cloud save if logged in
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

    setWinners((prev) => [newWinner, ...prev]);
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

        setWinners((prev) => [newWinner, ...prev]);
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

  // Unified Draw Trigger with 10-second suspense countdown
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

  // Skip countdown immediately
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

  // Cancel countdown
  const handleCancelCountdown = useCallback(() => {
    setCountdownRemaining(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header adhering to Top Bar Contract */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        onOpenPresentation={() => setIsPresentationOpen(true)}
        onOpenPrintSheet={() => setIsPrintSheetOpen(true)}
        onOpenObsOverlay={() => setIsObsOverlayOpen(true)}
        currentUser={currentUser}
        onOpenAccount={() => setIsAccountOpen(true)}
        totalParticipants={participants.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'draw' && (
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

        {activeTab === 'search' && (
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

        {activeTab === 'stats' && (
          <StatsProbabilities computed={computed} settings={settings} winners={winners} />
        )}

        {activeTab === 'settings' && (
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
          />
        )}

        {activeTab === 'help' && <HowItWorks settings={settings} />}

        {activeTab === 'support' && (
          <SupportTab
            settings={settings}
            onUpdateSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          />
        )}
      </main>

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

      {/* Social Media VIP Victory Card Modal with Full Customization Editor */}
      <VictoryCardModal
        isOpen={Boolean(selectedWinnerForCard)}
        onClose={() => setSelectedWinnerForCard(null)}
        winner={selectedWinnerForCard}
        participant={participants.find((p) => p.id === selectedWinnerForCard?.participantId)}
        settings={settings}
        rosterHash={rosterHash}
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

      {/* Dramatic Suspense Countdown Overlay (Contagem de 10 segundos para Início do Sorteio) */}
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

      {/* Fullscreen Dramatic Celebration Overlay (Prêmio e Ganhador na Tela Toda) */}
      <WinnerCelebrationOverlay
        winner={celebrationWinner}
        participant={participants.find((p) => p.id === celebrationWinner?.participantId)}
        settings={settings}
        onClose={() => setCelebrationWinner(null)}
        onOpenVictoryCard={(w) => setSelectedWinnerForCard(w)}
      />

      {/* Discreet Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>GIO DA SORTE · Distribuição e sorteio proporcional com garantia criptográfica</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('support')}
              className="hover:text-sky-300 text-slate-400 font-medium transition flex items-center gap-1 underline underline-offset-2"
            >
              <span>Apoiar o Projeto</span>
            </button>
            <span>·</span>
            <span>{currentUser ? 'Nuvem Conectada' : 'Salvo no navegador'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
