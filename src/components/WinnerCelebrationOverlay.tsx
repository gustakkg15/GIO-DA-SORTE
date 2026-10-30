import React, { useEffect, useState } from 'react';
import {
  Trophy,
  Sparkles,
  Award,
  Gift,
  Copy,
  CheckCircle2,
  X,
  Image as ImageIcon,
  FileText,
  Download,
  Flame,
  Check,
} from 'lucide-react';
import { Winner, Participant, RaffleSettings, ComputedRaffle } from '../types';
import { fireWinnerConfetti, fireWinnerFireworks, fireCelebrationGrandShow } from '../utils/confetti';
import { playWinnerFanfare } from '../utils/audio';
import { downloadRaffleFullPdf } from '../utils/pdfReport';

interface WinnerCelebrationOverlayProps {
  winner: Winner | null;
  participant?: Participant;
  settings: RaffleSettings;
  winners?: Winner[];
  rosterHash?: string;
  computed?: ComputedRaffle;
  participantsCount?: number;
  onClose: () => void;
  onOpenVictoryCard: (winner: Winner) => void;
}

export const WinnerCelebrationOverlay: React.FC<WinnerCelebrationOverlayProps> = ({
  winner,
  participant,
  settings,
  winners = [],
  rosterHash = '',
  computed,
  participantsCount,
  onClose,
  onOpenVictoryCard,
}) => {
  const [copied, setCopied] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  useEffect(() => {
    if (!winner) return;

    // Play fanfare sound
    playWinnerFanfare();

    // Fire spectacular tsParticles grand celebration: fireworks + confetti
    fireCelebrationGrandShow();

    // Secondary victory fireworks wave
    const timer1 = setTimeout(() => {
      fireWinnerFireworks(2200);
    }, 1200);

    // Keyboard escape listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer1);
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

  const handleFireFireworks = () => {
    fireWinnerFireworks(3000);
  };

  const handleFireMoreConfetti = () => {
    fireWinnerConfetti();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      // Ensure winners array includes at least current winner
      const winnersList = winners && winners.length > 0 ? winners : [winner];
      await downloadRaffleFullPdf({
        title: settings.raffleTitle || settings.prizeName || 'Sorteio Oficial GIO DA SORTE',
        organizerName: settings.organizerName || 'Organizador Oficial',
        prizeName: prizeTitle,
        rosterHash: rosterHash || 'Hash-Criptografico-Verificado',
        winners: winnersList,
        settings,
        computed,
        participantsCount: participantsCount ?? (computed?.allocations?.length || 1),
      });
      setPdfDownloaded(true);
      setTimeout(() => setPdfDownloaded(false), 3000);
    } catch (err) {
      console.error('Erro ao gerar laudo PDF:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Celebração do ganhador em tela cheia"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
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
      <div className="relative z-10 max-w-2xl w-full my-auto text-center space-y-5 sm:space-y-6 py-6 animate-slide-up">
        {/* Kicker Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/30 via-yellow-400/20 to-amber-500/30 border border-amber-400/60 text-amber-300 text-xs sm:text-sm font-extrabold uppercase tracking-widest shadow-lg shadow-amber-500/20 animate-bounce">
          <Trophy className="w-4 h-4 text-amber-300 fill-amber-300" />
          <span>Grande Campeão(ã) do Sorteio!</span>
          <Sparkles className="w-4 h-4 text-yellow-300" />
        </div>

        {/* Prize Showcase Card */}
        <div className="bg-gradient-to-br from-blue-950/80 via-slate-900/90 to-indigo-950/80 border-2 border-amber-400/70 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-blue-900/40 relative overflow-hidden ring-4 ring-amber-400/20">
          <div className="space-y-3.5">
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
                    className="relative w-32 h-32 sm:w-44 sm:h-44 rounded-2xl object-cover border-2 border-white shadow-2xl mx-auto"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/30 ring-4 ring-amber-300/40 mx-auto">
                  <Gift className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2.2]" />
                </div>
              )}
            </div>

            {/* Prize Title */}
            <h3 className="font-display font-black text-2xl sm:text-3xl md:text-4xl text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 drop-shadow-sm">
              {prizeTitle}
            </h3>
          </div>
        </div>

        {/* Winner Highlight Display with Radiant Radial Gradient */}
        <div className="relative space-y-3 py-1">
          {/* Radiant Radial Gradient Aura behind winner */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] sm:w-[500px] md:w-[620px] h-[190px] sm:h-[240px] pointer-events-none -z-10 overflow-visible"
          >
            <div
              className="w-full h-full rounded-full blur-2xl opacity-90 animate-pulse transition-all duration-1000"
              style={{
                background:
                  'radial-gradient(circle, rgba(56, 189, 248, 0.45) 0%, rgba(99, 102, 241, 0.35) 35%, rgba(245, 158, 11, 0.22) 65%, transparent 75%)',
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-48 sm:w-72 h-24 sm:h-36 rounded-full blur-xl opacity-80"
              style={{
                background:
                  'radial-gradient(ellipse, rgba(254, 240, 138, 0.55) 0%, rgba(245, 158, 11, 0.35) 50%, transparent 75%)',
              }}
            />
          </div>

          <div className="text-xs uppercase font-extrabold tracking-widest text-sky-300/90 relative z-10 flex items-center justify-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span>Parabéns ao ganhador oficial:</span>
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          </div>

          <div className="relative z-10 font-display font-black text-4xl sm:text-6xl md:text-7xl text-white tracking-tight break-words drop-shadow-[0_10px_35px_rgba(37,99,235,0.7)]">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-sky-200">
              {winner.name}
            </span>
          </div>

          {/* Ticket Number Badge */}
          <div className="relative z-10 inline-flex items-center gap-2.5 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 px-6 py-2.5 rounded-2xl border-2 border-sky-300/60 shadow-xl shadow-blue-600/40">
            <Award className="w-5 h-5 text-white" />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-sky-100">
              Bilhete Premiado:
            </span>
            <span className="font-mono font-black text-2xl sm:text-3xl text-white tabular-nums drop-shadow-sm">
              #{winner.number}
            </span>
          </div>

          {participant && (
            <div className="relative z-10 text-xs text-slate-400">
              Concorria com <b>{participant.coins} moedas</b> no total da rodada.
            </div>
          )}
        </div>

        {/* Primary Interactive Actions (Victory Card, Download PDF with jsPDF, Copy) */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenVictoryCard(winner);
            }}
            className="flex-1 min-w-[160px] sm:min-w-[180px] min-h-[46px] px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-600/40 transition active:scale-95 flex items-center justify-center gap-2 border border-sky-400/40"
          >
            <ImageIcon className="w-4 h-4 text-sky-200" />
            <span>Gerar Card de Vitória</span>
          </button>

          {/* Download Complete Audit PDF via jsPDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex-1 min-w-[160px] sm:min-w-[180px] min-h-[46px] px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-emerald-600/30 transition active:scale-95 flex items-center justify-center gap-2 border border-emerald-400/40 disabled:opacity-50"
          >
            {isDownloadingPdf ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : pdfDownloaded ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span>PDF Baixado!</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-emerald-200" />
                <span>Baixar Relatório PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="min-h-[46px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm border border-slate-700 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-sky-400" />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>

        {/* Secondary Particle Fireworks & Confetti Triggers */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleFireFireworks}
            title="Disparar bateria de fogos de artifício com partículas tsParticles"
            className="px-3.5 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 font-bold text-xs transition active:scale-95 flex items-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span>Fogos de Artifício 🎆</span>
          </button>

          <button
            type="button"
            onClick={handleFireMoreConfetti}
            title="Disparar chuva de confetes com tsParticles"
            className="px-3.5 py-1.5 rounded-xl bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 font-bold text-xs transition active:scale-95 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Chuva de Confetes 🎉</span>
          </button>
        </div>

        {/* Subtitle helper */}
        <p className="text-xs text-slate-500">
          Pressione <b>Esc</b> ou clique fora do card para fechar
        </p>
      </div>
    </div>
  );
};
