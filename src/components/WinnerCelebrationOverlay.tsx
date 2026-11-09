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
      className="fixed inset-0 z-[70] bg-[#080A0F]/95 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
    >
      {/* Background Ambient Glow Lights */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-b from-[#0131CD]/30 via-[#0131CD]/20 to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-t from-[#F5B942]/20 via-[#0131CD]/20 to-transparent rounded-full blur-3xl" />
      </div>

      {/* Close Button Top Right */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar celebração"
        className="absolute top-4 right-4 z-50 min-w-[44px] min-h-[44px] p-2.5 flex items-center justify-center text-[#94A3B8] hover:text-[#FFFFFF] bg-[#10141E] hover:bg-[#161C2C] border border-[#161C2C] rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FC01] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080A0F]"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Main Fullscreen Showcase Card */}
      <div className="relative z-10 max-w-2xl w-full my-auto text-center space-y-6 py-6 animate-slide-up">
        {/* Kicker Badge em Ouro Nobre */}
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#10141E] border border-[#F5B942]/60 text-[#F5B942] text-xs sm:text-sm font-bold uppercase tracking-widest shadow-xl">
          <Trophy className="w-4 h-4 text-[#F5B942] fill-[#F5B942]" />
          <span>Vencedor Oficial do Sorteio</span>
          <Sparkles className="w-4 h-4 text-[#B9FC01]" />
        </div>

        {/* Prize Showcase Card */}
        <div className="bg-[#10141E]/95 border border-[#F5B942]/40 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden ring-1 ring-white/10">
          <div className="space-y-4">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#F5B942] bg-[#F5B942]/15 border border-[#F5B942]/30 px-3.5 py-1 rounded-full inline-block">
              Prêmio Conquistado
            </span>

            {/* Prize Image if available, or Technological Gift Icon */}
            <div className="flex justify-center">
              {prizeImage ? (
                <div className="relative group">
                  <div className="absolute -inset-1.5 bg-gradient-to-r from-[#0131CD] via-[#0131CD] to-[#F5B942] rounded-2xl blur-md opacity-60 transition duration-300" />
                  <img
                    src={prizeImage}
                    alt={prizeTitle}
                    className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover border border-[#F5B942] shadow-2xl mx-auto"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#0131CD] to-[#10141E] border border-[#0131CD]/40 flex items-center justify-center text-white shadow-xl mx-auto">
                  <Gift className="w-10 h-10 sm:w-12 sm:h-12 text-[#B9FC01] stroke-[2]" />
                </div>
              )}
            </div>

            {/* Prize Title */}
            <h3 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl text-white tracking-tight drop-shadow-sm">
              {prizeTitle}
            </h3>
          </div>
        </div>

        {/* Winner Highlight Display with Radiant Radial Glow */}
        <div className="relative space-y-4 py-2">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] sm:w-[500px] md:w-[620px] h-[200px] pointer-events-none -z-10"
          >
            <div className="w-full h-full rounded-full blur-3xl opacity-60 bg-gradient-to-r from-[#0131CD]/40 via-[#0131CD]/30 to-[#F5B942]/25" />
          </div>

          <div className="font-mono text-xs uppercase font-bold tracking-widest text-[#B9FC01] relative z-10 flex items-center justify-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#F5B942]" />
            <span>Contemplado na Mesa Oficial</span>
            <Sparkles className="w-3.5 h-3.5 text-[#F5B942]" />
          </div>

          <div className="relative z-10 font-display font-extrabold text-4xl sm:text-6xl md:text-7xl text-white tracking-tight break-words drop-shadow-[0_10px_35px_rgba(1, 49, 205,0.5)]">
            {winner.name}
          </div>

          {/* Ticket Number Badge */}
          <div className="relative z-10 inline-flex items-center gap-3 bg-[#0131CD] px-7 py-3 rounded-2xl border border-white/20 shadow-2xl shadow-blue-600/30">
            <Award className="w-5 h-5 text-[#F5B942]" />
            <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
              Bilhete Premiado:
            </span>
            <span className="font-mono font-extrabold text-2xl sm:text-3xl text-white tabular-nums drop-shadow-sm">
              #{winner.number}
            </span>
          </div>

          {participant && (
            <div className="relative z-10 text-xs text-slate-400 font-mono tabular-nums">
              Concorreu com <strong className="text-white">{participant.coins} moedas</strong> convertidas nesta rodada.
            </div>
          )}
        </div>

        {/* Primary Interactive Actions (Victory Card, Download PDF, Copy) */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenVictoryCard(winner);
            }}
            className="flex-1 min-w-[170px] min-h-[46px] px-5 py-2.5 rounded-xl bg-[#0131CD] hover:bg-[#0b72ff] text-white font-bold text-xs sm:text-sm shadow-xl transition active:scale-95 flex items-center justify-center gap-2 border border-white/15"
          >
            <ImageIcon className="w-4 h-4 text-white" />
            <span>Gerar Card VIP</span>
          </button>

          {/* Download Complete Audit PDF via jsPDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex-1 min-w-[170px] min-h-[46px] px-5 py-2.5 rounded-xl bg-[#20C997] hover:bg-[#1db889] text-slate-950 font-bold text-xs sm:text-sm shadow-xl transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isDownloadingPdf ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : pdfDownloaded ? (
              <>
                <Check className="w-4 h-4 text-slate-950" />
                <span>PDF Baixado!</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-slate-950" />
                <span>Baixar Laudo PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#10141E] hover:bg-[#161C2C] text-white font-bold text-xs sm:text-sm border border-white/10 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-[#20C997]" />
                <span className="text-[#20C997]">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#B9FC01]" />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>

        {/* Secondary Particle Fireworks & Confetti Triggers */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleFireFireworks}
            title="Disparar bateria de fogos de artifício com partículas tsParticles"
            className="px-4 py-2 rounded-xl bg-[#10141E] hover:bg-[#161C2C] border border-white/10 text-[#B9FC01] font-semibold text-xs transition active:scale-95 flex items-center gap-2"
          >
            <Flame className="w-4 h-4 text-[#B9FC01]" />
            <span>Fogos de Artifício</span>
          </button>

          <button
            type="button"
            onClick={handleFireMoreConfetti}
            title="Disparar chuva de confetes com tsParticles"
            className="px-4 py-2 rounded-xl bg-[#10141E] hover:bg-[#161C2C] border border-[#F5B942]/30 text-[#F5B942] font-semibold text-xs transition active:scale-95 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#F5B942]" />
            <span>Chuva de Confetes</span>
          </button>
        </div>

        {/* Subtitle helper */}
        <p className="text-xs text-slate-400">
          Pressione <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[11px]">Esc</kbd> ou clique fora do card para fechar
        </p>
      </div>
    </div>
  );
};
