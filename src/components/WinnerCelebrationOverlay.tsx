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
  const onCloseRef = React.useRef(onClose);
  const celebratedWinnerKeyRef = React.useRef<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!winner) {
      celebratedWinnerKeyRef.current = null;
      return;
    }

    const winnerKey = `${winner.id}_${winner.drawnAt}`;
    let timer1: ReturnType<typeof setTimeout> | null = null;

    if (celebratedWinnerKeyRef.current !== winnerKey) {
      celebratedWinnerKeyRef.current = winnerKey;
      playWinnerFanfare();
      fireCelebrationGrandShow();
      timer1 = setTimeout(() => {
        fireWinnerFireworks(2200);
      }, 1200);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (timer1) clearTimeout(timer1);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [winner]);

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
      className="fixed inset-0 z-[70] bg-[#080D18]/95 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
    >
      {/* Background Ambient Glow Lights */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[#0131CD]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-[#A6C957]/10 rounded-full blur-3xl" />
      </div>

      {/* Close Button Top Right */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar celebração"
        className="absolute top-4 right-4 z-50 min-w-[44px] min-h-[44px] p-2.5 flex items-center justify-center text-[#A5B1C5] hover:text-[#FFFFFF] bg-[#111B30] hover:bg-[#0131CD] border border-[#A5B1C5]/20 rounded-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080D18]"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Main Fullscreen Showcase Card */}
      <div className="relative z-10 max-w-2xl w-full my-auto text-center space-y-6 py-6 animate-slide-up">
        {/* Kicker Badge Oficial */}
        <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#111B30] border border-[#A6C957]/45 text-[#A6C957] text-xs sm:text-sm font-semibold tracking-wider uppercase shadow-xl">
          <Trophy className="w-4 h-4 text-[#A6C957]" />
          <span>Vencedor Oficial do Sorteio</span>
          <Sparkles className="w-4 h-4 text-[#A6C957]" />
        </div>

        {/* Prize Showcase Card */}
        <div className="bg-[#111B30]/95 border border-[#0131CD]/50 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="space-y-4">
            <span className="text-xs font-semibold tracking-wide text-[#A6C957] bg-[#A6C957]/15 border border-[#A6C957]/35 px-3.5 py-1 rounded-full inline-block">
              Prêmio Conquistado
            </span>

            {/* Prize Image if available, or Technological Gift Icon */}
            <div className="flex justify-center">
              {prizeImage ? (
                <div className="relative group">
                  <div className="absolute -inset-1.5 bg-[#0131CD]/40 rounded-2xl blur-md opacity-60 transition duration-300" />
                  <img
                    src={prizeImage}
                    alt={prizeTitle}
                    className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl object-cover border border-[#A6C957] shadow-2xl mx-auto"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#080D18] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF] shadow-xl mx-auto">
                  <Gift className="w-10 h-10 sm:w-12 sm:h-12 text-[#A6C957] stroke-[2]" />
                </div>
              )}
            </div>

            {/* Prize Title */}
            <h3 className="font-bold text-2xl sm:text-3xl md:text-4xl text-[#FFFFFF] tracking-tight drop-shadow-sm">
              {prizeTitle}
            </h3>
          </div>
        </div>

        {/* Winner Highlight Display */}
        <div className="relative space-y-4 py-2">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] sm:w-[500px] md:w-[620px] h-[200px] pointer-events-none -z-10"
          >
            <div className="w-full h-full rounded-full blur-3xl opacity-50 bg-[#0131CD]/30" />
          </div>

          <div className="text-xs font-semibold tracking-wider uppercase text-[#A6C957] relative z-10 flex items-center justify-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#A6C957]" />
            <span>Contemplado na Mesa Oficial</span>
            <Sparkles className="w-3.5 h-3.5 text-[#A6C957]" />
          </div>

          <div className="relative z-10 font-extrabold text-4xl sm:text-6xl md:text-7xl text-[#FFFFFF] tracking-tight break-words">
            {winner.name}
          </div>

          {/* Ticket Number Badge */}
          <div className="relative z-10 inline-flex items-center gap-3 bg-[#0131CD] px-7 py-3 rounded-2xl border border-[#FFFFFF]/20 shadow-2xl">
            <Award className="w-5 h-5 text-[#A6C957]" />
            <span className="text-xs sm:text-sm font-semibold tracking-wide text-[#FFFFFF]">
              Bilhete Premiado:
            </span>
            <span className="font-extrabold text-2xl sm:text-3xl text-[#FFFFFF] tabular-nums drop-shadow-sm">
              #{winner.number}
            </span>
          </div>

          {participant && (
            <div className="relative z-10 text-xs text-[#A5B1C5] tabular-nums">
              Concorreu com <strong className="text-[#FFFFFF]">{participant.coins} moedas</strong> convertidas nesta rodada.
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
            className="flex-1 min-w-[170px] min-h-[46px] px-5 py-2.5 rounded-xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs sm:text-sm shadow-xl transition active:scale-95 flex items-center justify-center gap-2 border border-[#FFFFFF]/15"
          >
            <ImageIcon className="w-4 h-4 text-[#FFFFFF]" />
            <span>Gerar Card VIP</span>
          </button>

          {/* Download Complete Audit PDF via jsPDF */}
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf}
            className="flex-1 min-w-[170px] min-h-[46px] px-5 py-2.5 rounded-xl bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs sm:text-sm shadow-xl transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isDownloadingPdf ? (
              <>
                <div className="w-4 h-4 border-2 border-[#080D18] border-t-transparent rounded-full animate-spin" />
                <span>Gerando PDF...</span>
              </>
            ) : pdfDownloaded ? (
              <>
                <Check className="w-4 h-4 text-[#080D18]" />
                <span>PDF Baixado!</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 text-[#080D18]" />
                <span>Baixar Laudo PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#111B30] hover:border-[#0131CD] text-[#FFFFFF] font-bold text-xs sm:text-sm border border-[#A5B1C5]/20 transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-[#A6C957]" />
                <span className="text-[#A6C957]">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#A5B1C5]" />
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
            className="px-4 py-2 rounded-xl bg-[#111B30] hover:border-[#0131CD] border border-[#A5B1C5]/20 text-[#A6C957] font-semibold text-xs transition active:scale-95 flex items-center gap-2"
          >
            <Flame className="w-4 h-4 text-[#A6C957]" />
            <span>Fogos de Artifício</span>
          </button>

          <button
            type="button"
            onClick={handleFireMoreConfetti}
            title="Disparar chuva de confetes com tsParticles"
            className="px-4 py-2 rounded-xl bg-[#111B30] hover:border-[#0131CD] border border-[#A5B1C5]/20 text-[#FFFFFF] font-semibold text-xs transition active:scale-95 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#A5B1C5]" />
            <span>Chuva de Confetes</span>
          </button>
        </div>

        {/* Subtitle helper */}
        <p className="text-xs text-[#A5B1C5]">
          Pressione <kbd className="px-1.5 py-0.5 rounded bg-[#111B30] text-[#FFFFFF] font-mono text-[11px]">Esc</kbd> ou clique fora do card para fechar
        </p>
      </div>
    </div>
  );
};
