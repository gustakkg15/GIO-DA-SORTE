import React from 'react';
import { Sparkles, Trophy, Ticket, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { ThemeMode } from '../types';

interface TicketDisplayProps {
  displayNumber: number | string;
  isSpinning: boolean;
  winnerName?: string | null;
  winnerPrize?: string | null;
  themeMode?: ThemeMode;
}

export const TicketDisplay: React.FC<TicketDisplayProps> = ({
  displayNumber,
  isSpinning,
  winnerName,
  winnerPrize,
}) => {
  const isDefaultPlaceholder = displayNumber === '?' || displayNumber === '';

  return (
    <div className="relative w-full max-w-xl mx-auto my-2 select-none">
      {/* Glow Effect Backdrop for Stage Presence */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -inset-1 rounded-3xl blur-xl opacity-40 transition-opacity duration-300 ${
          isSpinning
            ? 'bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#0866F5] opacity-50'
            : winnerName
            ? 'bg-gradient-to-r from-[#F5B942]/40 via-[#F5B942]/20 to-[#F5B942]/40 opacity-60'
            : 'bg-transparent opacity-0'
        }`}
      />

      {/* Main Ticket / Globo Digital Stage */}
      <div
        className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
          isSpinning
            ? 'border-[#00A9FF]/60 bg-[#081226] shadow-2xl ring-1 ring-[#00A9FF]/30'
            : winnerName
            ? 'border-[#F5B942]/50 bg-[#0B1528] shadow-2xl ring-1 ring-[#F5B942]/30'
            : 'border-white/10 bg-[#081226] shadow-xl'
        }`}
      >
        {/* Top Atmosphere Accent Line */}
        <div
          className={`h-1 w-full transition-colors duration-300 ${
            isSpinning
              ? 'bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#35B9F5]'
              : winnerName
              ? 'bg-gradient-to-r from-[#F5B942] via-[#FDE047] to-[#F5B942]'
              : 'bg-gradient-to-r from-white/10 via-[#00A9FF]/30 to-white/10'
          }`}
        />

        {/* Ticket Perforation Stubs (Left & Right) */}
        <div className="hidden min-[420px]:block absolute top-1/2 -left-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-[#101F3D] border-r border-white/10 z-20 shadow-inner" />
        <div className="hidden min-[420px]:block absolute top-1/2 -right-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-[#101F3D] border-l border-white/10 z-20 shadow-inner" />

        {/* Top Header Strip */}
        <div className="px-5 py-3 bg-[#0B1730] border-b border-white/[0.08] flex items-center justify-between text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-2 text-white">
            <Ticket className="w-4 h-4 text-[#00A9FF]" />
            <span className="tracking-tight">Globo Digital Oficial</span>
          </span>

          <span
            className={`px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold tracking-wider uppercase tabular-nums transition-colors ${
              isSpinning
                ? 'bg-[#00A9FF]/15 text-[#00A9FF] border border-[#00A9FF]/40 animate-pulse'
                : winnerName
                ? 'bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/40'
                : 'bg-white/5 text-slate-400 border border-white/10'
            }`}
          >
            {isSpinning ? 'EXTRAÇÃO AO VIVO' : winnerName ? 'CONTEMPLADO' : 'PRONTO PARA EXTRAÇÃO'}
          </span>
        </div>

        {/* Center Stage: High-Precision Ticket Tumbler */}
        <div className="px-6 sm:px-10 py-8 sm:py-12 flex flex-col items-center justify-center text-center relative z-10">
          <div className="font-mono text-xs uppercase tracking-widest text-slate-400 font-semibold mb-3">
            {isSpinning
              ? 'Processando extração criptográfica CSPRNG...'
              : winnerName
              ? 'Bilhete Sorteado Oficial'
              : 'Aguardando Disparo do Sorteio'}
          </div>

          {/* Main Lucky Number Display */}
          <div
            className={`font-mono font-extrabold text-5xl sm:text-6xl md:text-7xl tracking-tight tabular-nums transition-all duration-150 ${
              isSpinning
                ? 'scale-105 text-[#00A9FF] drop-shadow-[0_0_24px_rgba(0,169,255,0.4)] motion-reduce:scale-100 motion-reduce:transition-none'
                : winnerName
                ? 'text-[#F5B942] scale-100 drop-shadow-[0_0_28px_rgba(245,185,66,0.35)]'
                : isDefaultPlaceholder
                ? 'text-slate-600'
                : 'text-white scale-100'
            }`}
          >
            {isDefaultPlaceholder ? '#000' : `#${displayNumber}`}
          </div>

          {/* Winner Showcase Card embedded inside stage */}
          <div className="mt-6 min-h-[3.5rem] flex items-center justify-center w-full">
            {winnerName && !isSpinning ? (
              <div className="w-full max-w-md px-5 py-3.5 rounded-xl bg-[#101F3D] border border-[#F5B942]/40 flex flex-col items-center gap-1.5 animate-fade-in shadow-xl">
                <div className="flex items-center gap-2 text-white font-bold text-base sm:text-lg max-w-full">
                  <Trophy className="w-5 h-5 text-[#F5B942] shrink-0" />
                  <span className="truncate">{winnerName}</span>
                </div>
                {winnerPrize && (
                  <span className="text-xs font-semibold text-[#F5B942] tracking-wide truncate max-w-full font-mono">
                    Prêmio: {winnerPrize}
                  </span>
                )}
              </div>
            ) : isSpinning ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1730] border border-[#00A9FF]/30 text-xs text-[#00A9FF] font-semibold shadow-inner">
                <Sparkles className="w-4 h-4 animate-spin text-[#00A9FF]" />
                <span className="font-mono">Sorteando com semente criptográfica CSPRNG...</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-medium">
                Pressione o botão <strong className="text-white">Sortear Agora</strong> para girar o globo
              </p>
            )}
          </div>
        </div>

        {/* Cryptographic Footer with Verifiable Security Marker */}
        <div className="px-5 py-2.5 bg-[#0B1730] border-t border-dashed border-white/10 flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#20C997]" />
            <span>MECANISMO CSPRNG AUDITÁVEL</span>
          </span>
          <span className="text-[#00A9FF] font-bold tracking-wider">GIO DA SORTE PRO</span>
        </div>
      </div>
    </div>
  );
};
