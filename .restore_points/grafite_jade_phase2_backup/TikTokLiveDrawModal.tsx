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
      // Rapid ticker numbers flickering during spin animation
      let ticks = 0;
      interval = setInterval(() => {
        ticks++;
        const randNum = Math.floor(Math.random() * snapshot.totalEligibleTickets) + 1;
        setDisplayNumber(String(randNum).padStart(3, '0'));
        playCountdownTick(10 - Math.min(9, Math.floor(ticks / 3)));
      }, 100);

      // Execute cryptographic CSPRNG draw in parallel
      const result = await onExecuteDraw();

      // Wait 2.6 seconds for dramatic suspense
      setTimeout(() => {
        if (interval) clearInterval(interval);
        setDisplayNumber(String(result.winningTicket.ticketNumber));
        setWinnerResult(result);
        setStage('WINNER_REVEALED');
        setIsProcessing(false);
        onDrawCompleted?.();

        // Sound fanfare & confetti
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl shadow-2xl shadow-blue-950/50 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Mesa de Sorteio Oficial</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                  {drawType === 'INDIVIDUAL_LIVE' ? 'Motor 1 (LIVE)' : 'Motor 2 (Campanha)'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-md">{targetTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {drawError && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-700/80 text-xs text-rose-200">
              {drawError}
            </div>
          )}

          {/* Prize Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#E11D48]/15 via-[#E11D48]/5 to-transparent border border-[#E11D48]/35 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#F43F5E]">Prêmio em Disputa</span>
              <p className="text-lg sm:text-xl font-black text-[#FDA4AF]">{prizeName}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bilhetes Concorrendo</span>
              <p className="text-base sm:text-lg font-mono font-bold text-cyan-400">
                {snapshot.totalEligibleTickets.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Central Draw Display Box */}
          <div className="py-8 px-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 flex flex-col items-center justify-center text-center relative overflow-hidden">
            {stage === 'SPINNING' && (
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-rose-500/10 to-[#E11D48]/10 animate-pulse pointer-events-none" />
            )}

            <span className="text-xs font-semibold text-slate-400 mb-2">
              {stage === 'IDLE' && 'Pronto para girar o tambor criptográfico'}
              {stage === 'SPINNING' && 'Sorteando bilhete com entropia CSPRNG...'}
              {stage === 'WINNER_REVEALED' && '🎉 BILHETE CONTEMPLADO 🎉'}
            </span>

            {/* Huge Number Display */}
            <div
              className={`font-mono font-black text-6xl sm:text-7xl tracking-wider transition-all duration-300 ${
                stage === 'WINNER_REVEALED'
                  ? 'text-transparent bg-clip-text bg-gradient-to-r from-[#FDA4AF] via-[#F43F5E] to-cyan-300 scale-105'
                  : stage === 'SPINNING'
                  ? 'text-cyan-400 animate-bounce'
                  : 'text-slate-500'
              }`}
            >
              #{displayNumber}
            </div>

            {/* Winner Details Card when revealed */}
            {stage === 'WINNER_REVEALED' && winnerResult && (
              <div className="mt-6 w-full max-w-md p-4 rounded-xl bg-slate-900/90 border border-emerald-500/40 text-left animate-in zoom-in-95 duration-300 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#E11D48] to-[#F43F5E] text-white flex items-center justify-center font-black text-lg shadow-md">
                    {winnerResult.winningTicket.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Ganhador(a) Confirmado(a)
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-white truncate">
                      @{winnerResult.winningTicket.username}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono truncate">
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
              className="w-full py-4 px-6 rounded-xl font-black text-base sm:text-lg text-slate-950 bg-gradient-to-r from-cyan-400 via-sky-400 to-rose-500 hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-slate-950" />
              <span>Realizar Sorteio Agora</span>
            </button>
          )}

          {stage === 'SPINNING' && (
            <div className="w-full py-3.5 px-6 rounded-xl font-bold text-center text-cyan-300 bg-cyan-950/40 border border-cyan-800/60 flex items-center justify-center gap-2">
              <RotateCw className="w-5 h-5 animate-spin" />
              <span>Calculando seleção justa em alta velocidade...</span>
            </div>
          )}

          {/* Post Draw Actions: PDF & Audit Box */}
          {stage === 'WINNER_REVEALED' && winnerResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadCertificate}
                  className="py-3 px-4 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 transition shadow-md shadow-blue-600/30 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Certificado Oficial PDF</span>
                </button>
                <button
                  onClick={handleCopyProof}
                  className="py-3 px-4 rounded-xl font-bold text-sm text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition flex items-center justify-center gap-2"
                >
                  {copiedHash ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedHash ? 'Prova Copiada!' : 'Copiar Hash de Auditoria'}</span>
                </button>
              </div>

              {/* Cryptographic Proof Details */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Prova Criptográfica Imutável (CSPRNG + Semente SHA-256)</span>
                </div>
                <div className="space-y-1 font-mono text-[11px] text-slate-400 break-all">
                  <p>
                    <strong className="text-slate-300">Roster SHA-256:</strong> {snapshot.rosterSha256Hash}
                  </p>
                  <p>
                    <strong className="text-slate-300">Compromisso Semente:</strong> {winnerResult.seedCommitment}
                  </p>
                  <p>
                    <strong className="text-slate-300">Semente Revelada:</strong> {winnerResult.seedRevealed}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Snapshot Info Summary */}
          {stage === 'IDLE' && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Hash className="w-3.5 h-3.5 text-cyan-400" />
                <span>Relação de Bilhetes Congelada</span>
              </div>
              <p className="font-mono text-[11px] truncate">
                Hash SHA-256: {snapshot.rosterSha256Hash}
              </p>
              <p className="text-[11px] text-slate-500">
                A lista está blindada contra edições retroativas. Novos presentes recebidos na LIVE continuarão sendo somados para as próximas rodadas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
