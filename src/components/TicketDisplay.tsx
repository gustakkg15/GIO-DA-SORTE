import React from 'react';
import { Sparkles, Trophy, Ticket, ShieldCheck } from 'lucide-react';
import { ThemeMode } from '../types';

interface TicketDisplayProps {
  displayNumber: number | string;
  isSpinning: boolean;
  winnerName?: string | null;
  winnerPrize?: string | null;
  themeMode?: ThemeMode;
  isProofVerified?: boolean;
}

export const TicketDisplay: React.FC<TicketDisplayProps> = ({
  displayNumber,
  isSpinning,
  winnerName,
  winnerPrize,
  isProofVerified = false,
}) => {
  const isDefaultPlaceholder = displayNumber === '?' || displayNumber === '';

  return (
    <div className="relative w-full max-w-xl mx-auto my-1 select-none">
      {/* Glow Effect Backdrop for Stage Presence */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-1 rounded-3xl blur-xl opacity-30 transition-opacity duration-300 ${
          isSpinning
            ? 'bg-[#0131CD]'
            : winnerName
            ? 'bg-[#A6C957]/25'
            : 'bg-transparent opacity-0'
        }`}
      />

      {/* Main Ticket / Globo Digital Stage */}
      <div
        className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
          isSpinning
            ? 'border-[#0131CD]/60 bg-[#080D18] shadow-2xl ring-1 ring-[#0131CD]/30'
            : winnerName
            ? 'border-[#A6C957]/55 bg-[#080D18] shadow-2xl ring-1 ring-[#A6C957]/25'
            : 'border-[#A5B1C5]/15 bg-[#080D18] shadow-xl'
        }`}
      >
        {/* Top Atmosphere Accent Line */}
        <div
          className={`h-1 w-full transition-colors duration-300 ${
            isSpinning
              ? 'bg-[#0131CD]'
              : winnerName
              ? 'bg-[#A6C957]'
              : 'bg-[#0131CD]/40'
          }`}
        />

        {/* Ticket Perforation Stubs (Left & Right) */}
        <div className="hidden min-[420px]:block absolute top-1/2 -left-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-[#111B30] border-r border-[#A5B1C5]/15 z-20 shadow-inner" />
        <div className="hidden min-[420px]:block absolute top-1/2 -right-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-[#111B30] border-l border-[#A5B1C5]/15 z-20 shadow-inner" />

        {/* Top Header Strip */}
        <div className="px-5 py-3 bg-[#111B30] border-b border-[#A5B1C5]/15 flex items-center justify-between text-xs font-semibold text-[#A5B1C5]">
          <span className="flex items-center gap-2 text-[#FFFFFF]">
            <Ticket className="w-4 h-4 text-[#A5B1C5]" />
            <span className="tracking-tight">Globo Digital Oficial</span>
          </span>

          <span
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
              isSpinning
                ? 'bg-[#0131CD] text-[#FFFFFF] border border-[#0131CD] animate-pulse'
                : winnerName
                ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35'
                : 'bg-[#080D18] text-[#A5B1C5] border border-[#A5B1C5]/20'
            }`}
          >
            {isSpinning ? 'Extração ao vivo' : winnerName ? 'Vencedor confirmado' : 'Pronto para extração'}
          </span>
        </div>

        {/* Center Stage: High-Precision Ticket Tumbler */}
        <div className="px-6 sm:px-10 py-8 sm:py-10 flex flex-col items-center justify-center text-center relative z-10">
          <div className="text-xs text-[#A5B1C5] font-medium mb-3">
            {isSpinning
              ? 'Processando extração criptográfica CSPRNG...'
              : winnerName
              ? 'Bilhete sorteado oficial'
              : 'Aguardando disparo do sorteio'}
          </div>

          {/* Main Lucky Number Display */}
          <div
            aria-live="polite"
            className={`font-bold text-5xl sm:text-6xl md:text-7xl tracking-tight tabular-nums transition-all duration-150 ${
              isSpinning
                ? 'scale-105 text-[#A6C957] motion-reduce:scale-100 motion-reduce:transition-none'
                : winnerName
                ? 'text-[#A6C957] scale-100'
                : isDefaultPlaceholder
                ? 'text-[#A5B1C5]'
                : 'text-[#FFFFFF] scale-100'
            }`}
          >
            {isDefaultPlaceholder ? '#000' : `#${displayNumber}`}
          </div>

          {/* Winner Showcase Card embedded inside stage */}
          <div className="mt-6 min-h-[4rem] flex items-center justify-center w-full">
            {winnerName && !isSpinning ? (
              <div className="w-full max-w-md px-5 py-3.5 rounded-xl bg-[#111B30] border border-[#A6C957]/45 flex flex-col items-center gap-1.5 animate-fade-in shadow-xl">
                <div className="flex items-center gap-2 text-[#FFFFFF] font-bold text-base sm:text-xl max-w-full">
                  <Trophy className="w-5 h-5 text-[#A6C957] shrink-0" />
                  <span className="truncate">{winnerName}</span>
                </div>
                {winnerPrize && (
                  <span className="text-xs font-semibold text-[#A6C957] truncate max-w-full">
                    Prêmio: {winnerPrize}
                  </span>
                )}
              </div>
            ) : isSpinning ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111B30] border border-[#0131CD]/50 text-xs text-[#FFFFFF] font-semibold shadow-inner">
                <Sparkles className="w-4 h-4 animate-spin text-[#A6C957]" />
                <span>Sorteando com semente criptográfica CSPRNG...</span>
              </div>
            ) : (
              <p className="text-xs text-[#A5B1C5] font-medium">
                Pressione o botão <strong className="text-[#FFFFFF]">Sortear Agora</strong> para girar o globo
              </p>
            )}
          </div>
        </div>

        {/* Cryptographic Footer with Verifiable Security Marker */}
        <div className="px-5 py-2.5 bg-[#111B30] border-t border-dashed border-[#A5B1C5]/15 flex items-center justify-between text-xs text-[#A5B1C5] tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#A6C957]" />
            <span>{isProofVerified ? 'Provably Fair V2 auditado' : 'Mecanismo CSPRNG auditável'}</span>
          </span>
          <span className="text-[#A5B1C5] font-semibold">GIO DA SORTE PRO</span>
        </div>
      </div>
    </div>
  );
};
