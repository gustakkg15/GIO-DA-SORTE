import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Sparkles,
  Download,
  Copy,
  Check,
  X,
  ShieldCheck,
  Hash,
  Play,
  RotateCw,
} from 'lucide-react';
import { DrawSnapshot, SnapshotTicketEntry } from '../types.js';
import { playCountdownTick, playWinnerFanfare } from '../utils/audio.js';
import { fireCelebrationGrandShow } from '../utils/confetti.js';
import { downloadTikTokLivePdfCertificate } from '../utils/pdfReport.js';

interface TikTokLiveDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawType: 'INDIVIDUAL_LIVE' | 'CAMPAIGN';
  targetTitle: string;
  prizeName: string;
  snapshot: DrawSnapshot;
  onExecuteDraw: () => Promise<{
    drawId: string;
    winningTicket: SnapshotTicketEntry;
    seedCommitment: string;
    seedRevealed: string;
    drawnAt: number;
    prizeName: string;
  }>;
  onDrawCompleted?: () => void;
}

export const TikTokLiveDrawModal: React.FC<TikTokLiveDrawModalProps> = ({
  isOpen,
  onClose,
  drawType,
  targetTitle,
  prizeName,
  snapshot,
  onExecuteDraw,
  onDrawCompleted,
}) => {
  const [stage, setStage] = useState<'IDLE' | 'SPINNING' | 'WINNER_REVEALED'>('IDLE');
  const [displayNumber, setDisplayNumber] = useState<string>('???');
  const [winnerResult, setWinnerResult] = useState<{
    drawId: string;
    winningTicket: SnapshotTicketEntry;
    seedCommitment: string;
    seedRevealed: string;
    drawnAt: number;
    prizeName: string;
  } | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStage('IDLE');
      setDisplayNumber('???');
      setWinnerResult(null);
      setCopiedHash(false);
      setIsProcessing(false);
      setDrawError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartDraw = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setDrawError(null);
    setStage('SPINNING');

    let interval: ReturnType<typeof setInterval> | null = null;
    try {
      let ticks = 0;
      interval = setInterval(() => {
        ticks++;
        const randNum = Math.floor(Math.random() * snapshot.totalEligibleTickets) + 1;
        setDisplayNumber(String(randNum).padStart(3, '0'));
        playCountdownTick(10 - Math.min(9, Math.floor(ticks / 3)));
      }, 100);

      const result = await onExecuteDraw();

      setTimeout(() => {
        if (interval) clearInterval(interval);
        setDisplayNumber(String(result.winningTicket.ticketNumber));
        setWinnerResult(result);
        setStage('WINNER_REVEALED');
        setIsProcessing(false);
        onDrawCompleted?.();

        playWinnerFanfare();
        fireCelebrationGrandShow();
      }, 2600);
    } catch (err) {
      if (interval) clearInterval(interval);
      setIsProcessing(false);
      setStage('IDLE');
      setDrawError(`Erro ao processar sorteio: ${(err as Error).message}`);
    }
  };

  const handleDownloadCertificate = () => {
    if (!winnerResult) return;
    downloadTikTokLivePdfCertificate({
      drawType,
      targetTitle,
      prizeName: winnerResult.prizeName || prizeName,
      drawDate: winnerResult.drawnAt,
      winnerUsername: winnerResult.winningTicket.username,
      winnerNickname: winnerResult.winningTicket.username,
      winnerTiktokUserId: winnerResult.winningTicket.tiktokUserId,
      winningTicketNumber: winnerResult.winningTicket.ticketNumber,
      totalTickets: snapshot.totalEligibleTickets,
      rosterSha256Hash: snapshot.rosterSha256Hash,
      seedCommitment: winnerResult.seedCommitment,
      seedRevealed: winnerResult.seedRevealed,
      sessionId: drawType === 'INDIVIDUAL_LIVE' ? snapshot.targetId : undefined,
      campaignId: drawType === 'CAMPAIGN' ? snapshot.targetId : undefined,
    });
  };

  const handleCopyProof = () => {
    if (!winnerResult) return;
    const text = `PROVA DE AUDITORIA GIO DA SORTE:\nPrêmio: ${winnerResult.prizeName}\nVencedor: @${winnerResult.winningTicket.username} (#${winnerResult.winningTicket.ticketNumber})\nHash da Lista (SHA-256): ${snapshot.rosterSha256Hash}\nCompromisso de Semente: ${winnerResult.seedCommitment}\nSemente Revelada: ${winnerResult.seedRevealed}`;
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tiktok-live-draw-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#050D20]/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl bg-[#101F3D] border border-[#182943] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#182943] bg-[#0B1730]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#101F3D] border border-[#182943] flex items-center justify-center text-[#F5B942]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="tiktok-live-draw-modal-title" className="text-base sm:text-lg font-bold text-[#F8FAFC] tracking-tight">
                  Mesa de Sorteio Oficial
                </h2>
                <span className="text-xs font-mono text-[#00A9FF]">
                  · {drawType === 'INDIVIDUAL_LIVE' ? 'Transmissão Ao Vivo' : 'Campanha Multi-LIVE'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] truncate max-w-md">{targetTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Fechar modal"
            className="p-1.5 text-[#94A3B8] hover:text-[#F8FAFC] rounded-lg hover:bg-[#182943] transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {drawError && (
            <div className="p-3.5 rounded-xl bg-[#F05262]/15 border border-[#F05262]/40 text-xs text-[#F8FAFC]">
              {drawError}
            </div>
          )}

          {/* Prize Banner */}
          <div className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] flex items-center justify-between">
            <div>
              <span className="text-xs text-[#94A3B8] block">Prêmio em disputa</span>
              <p className="text-lg sm:text-xl font-bold text-[#F5B942] mt-0.5">{prizeName}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#94A3B8] block">Bilhetes concorrendo</span>
              <p className="text-base sm:text-lg font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                {snapshot.totalEligibleTickets.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Central Draw Display Box */}
          <div className="py-8 px-4 rounded-2xl bg-[#0B1730] border border-[#182943] flex flex-col items-center justify-center text-center relative overflow-hidden">
            <span className="text-xs font-medium text-[#94A3B8] mb-2">
              {stage === 'IDLE' && 'Pronto para sortear o bilhete vencedor'}
              {stage === 'SPINNING' && 'Sorteando bilhete com auditoria criptográfica...'}
              {stage === 'WINNER_REVEALED' && 'Bilhete contemplado'}
            </span>

            {/* Huge Number Display */}
            <div
              className={`font-mono font-bold text-6xl sm:text-7xl tracking-wider tabular-nums transition-all duration-300 ${
                stage === 'WINNER_REVEALED'
                  ? 'text-[#20C997] scale-105'
                  : stage === 'SPINNING'
                  ? 'text-[#00A9FF]'
                  : 'text-[#94A3B8]'
              }`}
            >
              #{displayNumber}
            </div>

            {/* Winner Details Card when revealed */}
            {stage === 'WINNER_REVEALED' && winnerResult && (
              <div className="mt-6 w-full max-w-md p-4 rounded-xl bg-[#101F3D] border border-[#20C997]/50 text-left animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#182943] border border-[#20C997] text-[#F8FAFC] flex items-center justify-center font-bold text-lg shrink-0">
                    {winnerResult.winningTicket.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-[#20C997] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Ganhador(a) confirmado(a)
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-[#F8FAFC] truncate">
                      @{winnerResult.winningTicket.username}
                    </h3>
                    <p className="text-xs text-[#94A3B8] font-mono tabular-nums truncate">
                      ID TikTok: {winnerResult.winningTicket.tiktokUserId}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Button: Trigger Draw */}
          {stage === 'IDLE' && (
            <button
              onClick={handleStartDraw}
              disabled={isProcessing}
              className="w-full py-3.5 px-6 rounded-xl font-semibold text-base text-[#F8FAFC] bg-[#0866F5] hover:bg-[#00A9FF] transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_8px_24px_rgba(8,102,245,0.35)]"
            >
              <Play className="w-5 h-5 fill-[#F8FAFC]" />
              <span>Realizar Sorteio Agora</span>
            </button>
          )}

          {stage === 'SPINNING' && (
            <div className="w-full py-3.5 px-6 rounded-xl font-medium text-center text-[#F8FAFC] bg-[#0B1730] border border-[#182943] flex items-center justify-center gap-2">
              <RotateCw className="w-4 h-4 animate-spin text-[#00A9FF]" />
              <span>Calculando seleção justa em alta velocidade...</span>
            </div>
          )}

          {/* Post Draw Actions: PDF & Audit Box */}
          {stage === 'WINNER_REVEALED' && winnerResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadCertificate}
                  className="py-3 px-4 rounded-xl font-semibold text-sm text-[#F8FAFC] bg-[#0866F5] hover:bg-[#00A9FF] transition flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(8,102,245,0.3)]"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Certificado Oficial PDF</span>
                </button>
                <button
                  onClick={handleCopyProof}
                  className="py-3 px-4 rounded-xl font-semibold text-sm text-[#F8FAFC] bg-[#0B1730] hover:bg-[#182943] border border-[#182943] transition flex items-center justify-center gap-2"
                >
                  {copiedHash ? <Check className="w-4 h-4 text-[#20C997]" /> : <Copy className="w-4 h-4 text-[#00A9FF]" />}
                  <span>{copiedHash ? 'Prova Copiada!' : 'Copiar Hash de Auditoria'}</span>
                </button>
              </div>

              {/* Cryptographic Proof Details */}
              <div className="p-4 rounded-xl bg-[#0B1730] border border-[#182943] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#20C997]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Prova Criptográfica Imutável (CSPRNG + Semente SHA-256)</span>
                </div>
                <div className="space-y-1 font-mono text-[11px] text-[#94A3B8] break-all">
                  <p>
                    <strong className="text-[#F8FAFC]">Roster SHA-256:</strong> {snapshot.rosterSha256Hash}
                  </p>
                  <p>
                    <strong className="text-[#F8FAFC]">Compromisso Semente:</strong> {winnerResult.seedCommitment}
                  </p>
                  <p>
                    <strong className="text-[#F8FAFC]">Semente Revelada:</strong> {winnerResult.seedRevealed}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Snapshot Info Summary */}
          {stage === 'IDLE' && (
            <div className="p-3.5 rounded-xl bg-[#0B1730] border border-[#182943] text-xs text-[#94A3B8] space-y-1">
              <div className="flex items-center gap-1.5 text-[#F8FAFC] font-semibold">
                <Hash className="w-3.5 h-3.5 text-[#00A9FF]" />
                <span>Relação de Bilhetes Congelada</span>
              </div>
              <p className="font-mono text-[11px] text-[#35B9F5] truncate">
                Hash SHA-256: {snapshot.rosterSha256Hash}
              </p>
              <p className="text-[11px] text-[#94A3B8]">
                A lista está protegida contra edições retroativas. Novos presentes recebidos na LIVE continuarão sendo somados para as próximas rodadas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
