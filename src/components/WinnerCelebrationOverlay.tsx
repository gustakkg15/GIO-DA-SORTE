import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Sparkles,
  Award,
  Gift,
  Share2,
  Copy,
  CheckCircle2,
  X,
  Flame,
  Image as ImageIcon,
} from 'lucide-react';
import { Winner, Participant, RaffleSettings } from '../types';
import { fireWinnerConfetti } from '../utils/confetti';
import { playWinnerFanfare } from '../utils/audio';

interface WinnerCelebrationOverlayProps {
  winner: Winner | null;
  participant?: Participant;
  settings: RaffleSettings;
  onClose: () => void;
  onOpenVictoryCard: (winner: Winner) => void;
}

export const WinnerCelebrationOverlay: React.FC<WinnerCelebrationOverlayProps> = ({
  winner,
  participant,
  settings,
  onClose,
  onOpenVictoryCard,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!winner) return;

    // Play fanfare sound
    playWinnerFanfare();

    // Fire initial confetti burst
    fireWinnerConfetti();

    // Fire secondary celebration bursts
    const timer1 = setTimeout(() => {
      fireWinnerConfetti();
    }, 800);

    const timer2 = setTimeout(() => {
      fireWinnerConfetti();
    }, 1800);

    // Keyboard escape listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [winner, onClose]);

  if (!winner) return null;

  const prizeTitle = winner.prize || settings.prizeName || settings.currentPrize || 'Prêmio Oficial';
  const prizeImage = settings.prizeImage;

  const handleCopyText = () => {
    const text = `🎉 GIO DA SORTE - TEMOS UM GANHADOR!\n\n🏆 Prêmio: ${prizeTitle}\n👤 Vencedor(a): ${winner.name}\n🎟️ Bilhete Premiado: #${winner.number}\n\nParabéns! 🍀✨`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleFireMoreConfetti = () => {
    fireWinnerConfetti();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Celebração do ganhador em tela cheia"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in zoom-in-95 duration-300"
    >
      {/* Background Ambient Glow Lights */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-blue-600/30 via-indigo-600/20 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-t from-amber-500/20 via-sky-600/20 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Close Button Top Right */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar celebração"
        className="absolute top-4 right-4 z-50 min-w-[44px] min-h-[44px] p-2.5 flex items-center justify-center text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Main Fullscreen Showcase Card */}
      <div className="relative z-10 max-w-2xl w-full my-auto text-center space-y-6 sm:space-y-7 py-6">
        {/* Kicker Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/30 via-yellow-400/20 to-amber-500/30 border border-amber-400/60 text-amber-300 text-xs sm:text-sm font-extrabold uppercase tracking-widest shadow-lg shadow-amber-500/20 animate-bounce">
          <Trophy className="w-4 h-4 text-amber-300 fill-amber-300" />
          <span>Grande Campeão(ã) do Sorteio!</span>
          <Sparkles className="w-4 h-4 text-yellow-300" />
        </div>

        {/* Prize Showcase Card */}
        <div className="bg-gradient-to-br from-blue-950/80 via-slate-900/90 to-indigo-950/80 border-2 border-amber-400/70 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-blue-900/40 relative overflow-hidden ring-4 ring-amber-400/20">
          <div className="space-y-4">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-amber-400 bg-amber-950/80 border border-amber-500/50 px-3 py-1 rounded-full inline-block">
              🎁 Prêmio Conquistado
            </span>

            {/* Prize Image if available, or 3D Gift Box */}
            <div className="flex justify-center">
              {prizeImage ? (
                <div className="relative group">
                  <div className="absolute -inset-2 bg-gradient-to-r from-amber-400 to-yellow-300 rounded-3xl blur-md opacity-70 group-hover:opacity-100 transition duration-300" />
                  <img
                    src={prizeImage}
                    alt={prizeTitle}
                    className="relative w-36 h-36 sm:w-48 sm:h-48 rounded-2xl object-cover border-2 border-white shadow-2xl mx-auto"
                  />
                </div>
              ) : (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/30 ring-4 ring-amber-300/40 mx-auto">
                  <Gift className="w-12 h-12 sm:w-14 sm:h-14 stroke-[2.2]" />
                </div>
              )}
            </div>

            {/* Prize Title */}
            <h3 className="font-display font-black text-2xl sm:text-3xl md:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 drop-shadow-sm">
              {prizeTitle}
            </h3>
          </div>
        </div>

        {/* Winner Highlight Display */}
        <div className="space-y-3">
          <div className="text-xs uppercase font-extrabold tracking-widest text-sky-300/90">
            Parabéns ao ganhador oficial:
          </div>

          <div className="font-display font-black text-4xl sm:text-6xl md:text-7xl text-white tracking-tight break-words drop-shadow-[0_8px_24px_rgba(37,99,235,0.6)]">
            {winner.name}
          </div>

          {/* Ticket Number Badge */}
          <div className="inline-flex items-center gap-2.5 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 px-6 py-2.5 rounded-2xl border-2 border-sky-300/60 shadow-xl shadow-blue-600/40">
            <Award className="w-5 h-5 text-white" />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-100">
              Bilhete Premiado:
            </span>
            <span className="font-mono font-black text-2xl sm:text-3xl text-white tabular-nums drop-shadow-sm">
              #{winner.number}
            </span>
          </div>

          {participant && (
            <div className="text-xs text-slate-400">
              Concorria com <b>{participant.coins} moedas</b> no total da rodada.
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenVictoryCard(winner);
            }}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-600/40 transition active:scale-95 flex items-center justify-center gap-2 border border-sky-400/40"
          >
            <ImageIcon className="w-4 h-4 text-sky-200" />
            <span>Gerar Card de Vitória</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm border border-slate-700 transition active:scale-95 flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Mensagem Copiada!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-sky-400" />
                <span>Copiar Resultado</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleFireMoreConfetti}
            className="w-full sm:w-auto min-h-[48px] px-4 py-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 font-bold text-sm transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Mais Confetes!</span>
          </button>
        </div>

        {/* Subtitle helper */}
        <p className="text-xs text-slate-500">
          Pressione <b>Esc</b> ou clique em qualquer lugar para fechar
        </p>
      </div>
    </div>
  );
};
