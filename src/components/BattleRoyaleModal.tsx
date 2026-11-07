import React, { useState, useEffect } from 'react';
import { X, Flame, ShieldAlert, Trophy, Play, RotateCcw, Sparkles } from 'lucide-react';
import { ComputedRaffle, Winner, RaffleSettings } from '../types';
import { playHeartbeat, playEliminationDrop, playWinnerFanfare } from '../utils/audio';
import { fireWinnerConfetti } from '../utils/confetti';
import { generateUid } from '../utils/raffle';

interface BattleRoyaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  computed: ComputedRaffle;
  settings: RaffleSettings;
  onRecordWinner: (winner: Winner) => void;
}

export const BattleRoyaleModal: React.FC<BattleRoyaleModalProps> = ({
  isOpen,
  onClose,
  computed,
  settings,
  onRecordWinner,
}) => {
  // Surviving pool of tickets
  const [survivingTickets, setSurvivingTickets] = useState<{ number: number; participantId: string; name: string }[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  const [isEliminating, setIsEliminating] = useState(false);
  const [champion, setChampion] = useState<{ number: number; participantId: string; name: string } | null>(null);
  const [recentEliminated, setRecentEliminated] = useState<string[]>([]);

  // Initialize pool when opened
  useEffect(() => {
    if (isOpen) {
      setSurvivingTickets([...computed.eligibleTickets]);
      setRoundNumber(1);
      setChampion(null);
      setRecentEliminated([]);
      setIsEliminating(false);
    }
  }, [isOpen, computed.eligibleTickets]);

  if (!isOpen) return null;

  // Group surviving tickets by participant
  const survivingParticipantsMap = new Map<string, { name: string; ticketsCount: number; numbers: number[] }>();
  survivingTickets.forEach((t) => {
    const existing = survivingParticipantsMap.get(t.participantId);
    if (existing) {
      existing.ticketsCount++;
      existing.numbers.push(t.number);
    } else {
      survivingParticipantsMap.set(t.participantId, {
        name: t.name,
        ticketsCount: 1,
        numbers: [t.number],
      });
    }
  });

  const survivorsList = Array.from(survivingParticipantsMap.entries()).map(([id, data]) => ({
    id,
    ...data,
  }));

  // Perform elimination round
  const handleNextElimination = () => {
    if (isEliminating || survivingTickets.length <= 1) return;

    setIsEliminating(true);
    playHeartbeat();

    // Determine target size for next round
    const currentCount = survivingTickets.length;
    let targetSurvivors: number;

    if (currentCount > 16) {
      targetSurvivors = Math.max(8, Math.floor(currentCount * 0.5));
    } else if (currentCount > 8) {
      targetSurvivors = 4;
    } else if (currentCount > 4) {
      targetSurvivors = 2;
    } else {
      targetSurvivors = 1;
    }

    // Shuffle and pick target survivors
    const shuffled = [...survivingTickets].sort(() => Math.random() - 0.5);
    const survivors = shuffled.slice(0, targetSurvivors);
    const eliminated = shuffled.slice(targetSurvivors);

    // Get eliminated participant names
    const eliminatedNames = Array.from(new Set(eliminated.map((t) => t.name)));

    setTimeout(() => {
      playEliminationDrop();
      setRecentEliminated(eliminatedNames.slice(0, 5));
      setSurvivingTickets(survivors);
      setRoundNumber((r) => r + 1);
      setIsEliminating(false);

      if (targetSurvivors === 1) {
        // Champion found!
        const champ = survivors[0];
        setChampion(champ);
        playWinnerFanfare();
        fireWinnerConfetti();

        const winnerRecord: Winner = {
          id: generateUid(),
          participantId: champ.participantId,
          name: champ.name,
          number: champ.number,
          prize: `${settings.currentPrize || 'Sorteio'} (Battle Royale)`,
          drawnAt: Date.now(),
        };
        onRecordWinner(winnerRecord);
      }
    }, 1200);
  };

  const handleReset = () => {
    setSurvivingTickets([...computed.eligibleTickets]);
    setRoundNumber(1);
    setChampion(null);
    setRecentEliminated([]);
    setIsEliminating(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#050D20]/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="animate-slide-up max-w-5xl mx-auto w-full flex flex-col flex-1 justify-between space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between w-full pb-3 sm:pb-4 border-b border-[#182943] gap-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#F5B942]/20 border border-[#F5B942]/40 text-[#F5B942] font-bold flex items-center justify-center shadow-lg shrink-0">
              <Flame className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg sm:text-xl text-[#F8FAFC] truncate">Battle Royale</h2>
              <p className="text-[11px] sm:text-xs text-[#94A3B8] truncate">Eliminatória por fases até o campeão</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReset}
              title="Reiniciar torneio"
              aria-label="Reiniciar torneio eliminatório"
              className="min-w-[40px] min-h-[40px] p-2 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] bg-[#101F3D] border border-[#182943] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Fechar torneio"
              aria-label="Fechar torneio eliminatório"
              className="min-w-[40px] min-h-[40px] p-2 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] bg-[#101F3D] border border-[#182943] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Battle Arena */}
        <div className="max-w-4xl w-full mx-auto my-auto py-6 space-y-6">
          {/* Round HUD */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#101F3D] border border-[#00A9FF]/40 text-[#00A9FF] text-xs font-bold uppercase tracking-wider">
              <ShieldAlert className="w-3.5 h-3.5 text-[#F5B942]" />
              <span className="font-mono tabular-nums">
                {champion
                  ? 'Torneio Concluído'
                  : `Fase ${roundNumber} · Restam ${survivorsList.length} Sobreviventes (${survivingTickets.length} Bilhetes)`}
              </span>
            </div>

            <h3 className="font-display font-bold text-3xl sm:text-4xl text-[#F8FAFC] tracking-tight">
              {champion
                ? 'TEMOS UM GRANDE CAMPEÃO!'
                : survivorsList.length === 2
                ? 'DUELO FINAL 1 x 1'
                : survivorsList.length <= 4
                ? 'GRANDE SEMIFINAL'
                : 'Sobrevivência dos Bilhetes'}
            </h3>
          </div>

          {/* Champion Reveal Card */}
          {champion ? (
            <div className="bg-[#101F3D] border-2 border-[#F5B942] text-[#F8FAFC] rounded-2xl p-8 sm:p-12 text-center shadow-2xl max-w-xl mx-auto space-y-4 ring-4 ring-[#F5B942]/20 animate-in zoom-in-95 duration-300">
              <Trophy className="w-16 h-16 mx-auto text-[#F5B942] drop-shadow-md" />
              <div className="text-xs font-bold uppercase tracking-widest text-[#F5B942]">Vencedor Supremo</div>
              <div className="text-4xl sm:text-5xl font-display font-bold text-[#F8FAFC] tracking-tight">
                {champion.name}
              </div>
              <div className="font-mono font-bold text-2xl text-[#00A9FF] tabular-nums">Bilhete Premiado: #{champion.number}</div>
              <p className="text-xs font-medium text-[#94A3B8]">
                Sobreviveu a todas as etapas eliminatórias do Battle Royale!
              </p>
            </div>
          ) : (
            /* Surviving Contenders Grid */
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
                {survivorsList.map((contender) => (
                  <div
                    key={contender.id}
                    className="bg-[#101F3D] border border-[#182943] rounded-xl p-3 flex flex-col justify-between transition-all"
                  >
                    <div className="font-bold text-sm text-[#F8FAFC] truncate">{contender.name}</div>
                    <div className="mt-2 flex items-center justify-between text-xs text-[#94A3B8] font-mono tabular-nums">
                      <span className="text-[#F5B942] font-semibold">{contender.ticketsCount} bilhetes</span>
                      <span className="text-[10px] text-[#94A3B8]">
                        #{contender.numbers[0]}
                        {contender.numbers.length > 1 ? `…` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recently eliminated callout */}
              {recentEliminated.length > 0 && (
                <div className="text-center text-xs text-[#F05262] animate-fade-in">
                  Eliminados na última rodada: {recentEliminated.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Elimination Action Button */}
          {!champion && (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={isEliminating || survivingTickets.length <= 1}
                onClick={handleNextElimination}
                className={`py-4 px-8 rounded-xl font-display font-bold text-lg flex items-center gap-3 transition-all active:scale-95 shadow-xl ${
                  isEliminating
                    ? 'bg-[#182943] text-[#94A3B8] cursor-not-allowed'
                    : 'bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] cursor-pointer'
                }`}
              >
                {isEliminating ? (
                  <>
                    <Sparkles className="w-5 h-5 animate-spin" />
                    <span>Eliminando concorrentes...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-[#F8FAFC]" />
                    <span>
                      {survivorsList.length === 2 ? 'REVELAR O CAMPEÃO' : `EXECUTAR CORTE DA FASE ${roundNumber}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-[#94A3B8]">
          Cada bilhete concorre igualmente. Quem possui mais moedas tem mais bilhetes e maior chance de sobreviver!
        </div>
      </div>
    </div>
  );
};
