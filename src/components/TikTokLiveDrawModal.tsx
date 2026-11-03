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
    const text = `PROVA DE AUDITORIA GIO DA SORTE PRO:\nPrêmio: ${winnerResult.prizeName}\nVencedor: @${winnerResult.winningTicket.username} (#${winnerResult.winningTicket.ticketNumber})\nHash da Lista (SHA-256): ${snapshot.rosterSha256Hash}\nCompromisso de Semente: ${winnerResult.seedCommitment}\nSemente Revelada: ${winnerResult.seedRevealed}`;
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171D1C]/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#222B28] border border-[#313D39] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#313D39] bg-[#171D1C]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#2B3632] border border-[#313D39] flex items-center justify-center text-[#C6A56A]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-semibold text-[#EAE7DE]">
                  Mesa de Sorteio Oficial
                </h2>
                <span className="text-xs font-mono text-[#9BA8A3]">
                  · {drawType === 'INDIVIDUAL_LIVE' ? 'Transmissão Ao Vivo' : 'Campanha Multi-LIVE'}
                </span>
              </div>
              <p className="text-xs text-[#9BA8A3] truncate max-w-md">{targetTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-[#9BA8A3] hover:text-[#EAE7DE] rounded-lg hover:bg-[#2B3632] transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {drawError && (
            <div className="p-3.5 rounded-lg bg-[#D96B6B]/15 border border-[#D96B6B]/40 text-xs text-[#EAE7DE]">
              {drawError}
            </div>
          )}

          {/* Prize Banner */}
          <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] flex items-center justify-between">
            <div>
              <span className="text-xs text-[#9BA8A3] block">Prêmio em disputa</span>
              <p className="text-lg sm:text-xl font-semibold text-[#C6A56A] mt-0.5">{prizeName}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#9BA8A3] block">Bilhetes concorrendo</span>
              <p className="text-base sm:text-lg font-mono font-semibold text-[#EAE7DE] tabular-nums mt-0.5">
                {snapshot.totalEligibleTickets.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Central Draw Display Box */}
          <div className="py-8 px-4 rounded-xl bg-[#171D1C] border border-[#313D39] flex flex-col items-center justify-center text-center relative overflow-hidden">
            <span className="text-xs font-medium text-[#9BA8A3] mb-2">
              {stage === 'IDLE' && 'Pronto para sortear o bilhete vencedor'}
              {stage === 'SPINNING' && 'Sorteando bilhete com auditoria criptográfica...'}
              {stage === 'WINNER_REVEALED' && 'Bilhete contemplado'}
            </span>

            {/* Huge Number Display */}
            <div
              className={`font-mono font-bold text-6xl sm:text-7xl tracking-wider tabular-nums transition-all duration-300 ${
                stage === 'WINNER_REVEALED'
                  ? 'text-[#6EAA90] scale-105'
                  : stage === 'SPINNING'
                  ? 'text-[#C6A56A]'
                  : 'text-[#9BA8A3]'
              }`}
            >
              #{displayNumber}
            </div>

            {/* Winner Details Card when revealed */}
            {stage === 'WINNER_REVEALED' && winnerResult && (
              <div className="mt-6 w-full max-w-md p-4 rounded-lg bg-[#222B28] border border-[#6EAA90]/50 text-left animate-in zoom-in-95 duration-300">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#2B3632] border border-[#6EAA90] text-[#EAE7DE] flex items-center justify-center font-semibold text-lg shrink-0">
                    {winnerResult.winningTicket.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-[#6EAA90] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Ganhador(a) confirmado(a)
                    </span>
                    <h3 className="text-base sm:text-lg font-semibold text-[#EAE7DE] truncate">
                      @{winnerResult.winningTicket.username}
                    </h3>
                    <p className="text-xs text-[#9BA8A3] font-mono truncate">
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
              className="w-full py-3.5 px-6 rounded-lg font-semibold text-base text-[#171D1C] bg-[#6EAA90] hover:bg-[#5E997F] transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Play className="w-5 h-5 fill-[#171D1C]" />
              <span>Realizar Sorteio Agora</span>
            </button>
          )}

          {stage === 'SPINNING' && (
            <div className="w-full py-3.5 px-6 rounded-lg font-medium text-center text-[#EAE7DE] bg-[#2B3632] border border-[#313D39] flex items-center justify-center gap-2">
              <RotateCw className="w-4 h-4 animate-spin text-[#6EAA90]" />
              <span>Calculando seleção justa em alta velocidade...</span>
            </div>
          )}

          {/* Post Draw Actions: PDF & Audit Box */}
          {stage === 'WINNER_REVEALED' && winnerResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadCertificate}
                  className="py-3 px-4 rounded-lg font-semibold text-sm text-[#171D1C] bg-[#6EAA90] hover:bg-[#5E997F] transition flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Certificado Oficial PDF</span>
                </button>
                <button
                  onClick={handleCopyProof}
                  className="py-3 px-4 rounded-lg font-semibold text-sm text-[#EAE7DE] bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] transition flex items-center justify-center gap-2"
                >
                  {copiedHash ? <Check className="w-4 h-4 text-[#6EAA90]" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedHash ? 'Prova Copiada!' : 'Copiar Hash de Auditoria'}</span>
                </button>
              </div>

              {/* Cryptographic Proof Details */}
              <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#6EAA90]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Prova Criptográfica Imutável (CSPRNG + Semente SHA-256)</span>
                </div>
                <div className="space-y-1 font-mono text-[11px] text-[#9BA8A3] break-all">
                  <p>
                    <strong className="text-[#EAE7DE]">Roster SHA-256:</strong> {snapshot.rosterSha256Hash}
                  </p>
                  <p>
                    <strong className="text-[#EAE7DE]">Compromisso Semente:</strong> {winnerResult.seedCommitment}
                  </p>
                  <p>
                    <strong className="text-[#EAE7DE]">Semente Revelada:</strong> {winnerResult.seedRevealed}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Snapshot Info Summary */}
          {stage === 'IDLE' && (
            <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs text-[#9BA8A3] space-y-1">
              <div className="flex items-center gap-1.5 text-[#EAE7DE] font-medium">
                <Hash className="w-3.5 h-3.5 text-[#6EAA90]" />
                <span>Relação de Bilhetes Congelada</span>
              </div>
              <p className="font-mono text-[11px] truncate">
                Hash SHA-256: {snapshot.rosterSha256Hash}
              </p>
              <p className="text-[11px] text-[#9BA8A3]">
                A lista está protegida contra edições retroativas. Novos presentes recebidos na LIVE continuarão sendo somados para as próximas rodadas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
