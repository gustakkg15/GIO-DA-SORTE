import React from 'react';
import { Sparkles, Trophy, Ticket } from 'lucide-react';
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
  const isDefaultPlaceholder = displayNumber === '?';

  return (
    <div className="relative w-full max-w-md mx-auto my-2 select-none px-1 sm:px-0">
      {/* Main Ticket / Globo Digital Body */}
      <div
        className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
          isSpinning
            ? 'border-[#00A9FF] bg-[#0B1730] shadow-lg'
            : winnerName
            ? 'border-[#F5B942] bg-[#0B1730] shadow-lg'
            : 'border-[#182943] bg-[#0B1730]'
        }`}
      >
        {/* Left Ticket Stub Cutout */}
        <div className="hidden min-[380px]:block absolute top-1/2 -left-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-[#101F3D] border-r border-[#182943] z-20" />

        {/* Right Ticket Stub Cutout */}
        <div className="hidden min-[380px]:block absolute top-1/2 -right-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-[#101F3D] border-l border-[#182943] z-20" />

        {/* Top Header Strip */}
        <div className="px-4 py-2.5 bg-[#182943]/80 border-b border-[#182943] flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          <span className="flex items-center gap-1.5 text-[#F8FAFC]">
            <Ticket className="w-3.5 h-3.5 text-[#00A9FF]" />
            <span>Globo Digital · Bilhete Oficial</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums ${
              isSpinning
                ? 'bg-[#00A9FF]/20 text-[#00A9FF] border border-[#00A9FF]/40'
                : winnerName
                ? 'bg-[#F5B942]/20 text-[#F5B942] border border-[#F5B942]/40'
                : 'bg-[#101F3D] text-[#94A3B8] border border-[#182943]'
            }`}
          >
            {isSpinning ? 'SORTEANDO...' : winnerName ? 'PREMIADO' : 'AGUARDANDO'}
          </span>
        </div>

        {/* Center Number Display */}
        <div className="px-4 sm:px-6 py-7 sm:py-9 flex flex-col items-center justify-center text-center relative z-10">
          <div className="text-[11px] uppercase tracking-widest text-[#94A3B8] font-medium mb-1.5">
            {isSpinning
              ? 'Girando bilhetes elegíveis...'
              : isDefaultPlaceholder
              ? 'Pronto para sortear'
              : 'Bilhete Sorteado'}
          </div>

          <div
            className={`font-mono font-bold text-5xl sm:text-6xl md:text-7xl tracking-tight tabular-nums transition-transform duration-150 ${
              isSpinning
                ? 'scale-105 text-[#00A9FF]'
                : isDefaultPlaceholder
                ? 'text-[#94A3B8]/40'
                : 'text-[#F8FAFC] scale-100'
            }`}
          >
            {isDefaultPlaceholder ? '—' : `#${displayNumber}`}
          </div>

          {/* Winner Name Banner inside Ticket */}
          <div className="mt-4 min-h-[2.5rem] flex items-center justify-center w-full">
            {winnerName && !isSpinning ? (
              <div className="inline-flex flex-col items-center gap-1 px-4 py-2 rounded-lg bg-[#101F3D] border border-[#F5B942]/50 max-w-full animate-fade-in">
                <div className="flex items-center gap-2 text-[#F8FAFC] font-semibold text-sm sm:text-base max-w-full">
                  <Trophy className="w-4 h-4 text-[#F5B942] shrink-0" />
                  <span className="truncate">{winnerName}</span>
                </div>
                {winnerPrize && (
                  <span className="text-[11px] font-medium text-[#F5B942] tracking-wide truncate max-w-full">
                    Prêmio: {winnerPrize}
                  </span>
                )}
              </div>
            ) : isSpinning ? (
              <div className="inline-flex items-center gap-2 text-xs text-[#00A9FF] font-medium">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Selecionando bilhete com criptografia CSPRNG...</span>
              </div>
            ) : (
              <div className="text-xs text-[#94A3B8]">
                Clique em <strong className="text-[#F8FAFC]">Sortear Agora</strong> para revelar o ganhador
              </div>
            )}
          </div>
        </div>

        {/* Bottom Perforated Line & Serial Footer */}
        <div className="px-4 py-2 bg-[#101F3D] border-t border-dashed border-[#182943] flex items-center justify-between text-[11px] font-mono text-[#94A3B8] tabular-nums">
          <span>SÉRIE AUDITADA SHA-256</span>
          <span className="text-[#F5B942]">GIO DA SORTE PRO</span>
        </div>
      </div>
    </div>
  );
};
