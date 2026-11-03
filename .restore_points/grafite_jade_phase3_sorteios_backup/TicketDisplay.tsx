import React from 'react';
import { Trophy, Award, Gift, Sparkles, CheckCircle2 } from 'lucide-react';
import { Winner } from '../types';

interface TicketDisplayProps {
  currentNumber: number | string;
  isDrawing: boolean;
  latestWinner: Winner | null;
  currentPrize: string;
  prizeImage?: string;
  eligibleCount: number;
  totalCapacity: number;
}

export const TicketDisplay: React.FC<TicketDisplayProps> = ({
  currentNumber,
  isDrawing,
  latestWinner,
  currentPrize,
  prizeImage,
  eligibleCount,
  totalCapacity,
}) => {
  return (
    <div className="relative w-full max-w-lg mx-auto select-none">
      {/* Subtle ambient light aura behind ticket when winner announced */}
      {latestWinner && !isDrawing && (
        <div className="absolute -inset-2 bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-blue-600/20 rounded-2xl blur-xl pointer-events-none animate-pulse-subtle" />
      )}

      {/* Main Luxury Digital Ticket Surface */}
      <div
        className={`relative ticket-notch bg-gradient-to-br from-[#0B1528] via-[#0E1A33] to-[#080E1C] text-white px-5 sm:px-8 md:px-10 py-6 sm:py-7 rounded-2xl shadow-2xl transition-all duration-300 border border-white/10 ${
          isDrawing
            ? 'scale-[1.01] border-sky-400/50 shadow-sky-500/20'
            : latestWinner
            ? 'border-sky-400/70 shadow-2xl shadow-sky-500/20 ring-1 ring-sky-300/40'
            : 'hover:border-white/15'
        }`}
      >
        {/* Ticket Header & Watermark */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-300 truncate">
            <Award className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="truncate">Bilhete Oficial · GIO DA SORTE</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-sky-300/90 shrink-0">
            <span className="text-slate-400 text-[10px] uppercase font-sans">Série</span>
            <span>#{(totalCapacity).toString().padStart(4, '0')}</span>
          </div>
        </div>

        {/* Current Prize Badge & Photo */}
        {(currentPrize || prizeImage) && (
          <div className="mt-3.5 flex items-center justify-center gap-2 bg-slate-950/60 backdrop-blur-md border border-[#E11D48]/30 py-1.5 px-3.5 rounded-full mx-auto w-fit max-w-full shadow-inner">
            {prizeImage ? (
              <img
                src={prizeImage}
                alt={currentPrize || 'Prêmio'}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover border border-[#E11D48]/70 shadow-sm shrink-0"
              />
            ) : (
              <Gift className="w-3.5 h-3.5 text-[#F43F5E] shrink-0" />
            )}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white truncate min-w-0">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider shrink-0">Prêmio:</span>
              <span className="font-bold text-[#FDA4AF] truncate max-w-[180px] sm:max-w-[260px]">
                {currentPrize || 'Prêmio da Rodada'}
              </span>
            </div>
          </div>
        )}

        {/* Giant Number Display (Slot / Drum Animation) */}
        <div className="py-5 sm:py-6 text-center overflow-hidden">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            {isDrawing ? 'Sorteando bilhete...' : latestWinner ? 'Número Premiado' : 'Número Sorteado'}
          </div>

          <div
            className={`font-mono font-black tabular-nums tracking-tight leading-none transition-transform duration-100 truncate ${
              isDrawing
                ? 'text-6xl sm:text-7xl md:text-8xl text-sky-200 scale-105 drop-shadow-[0_4px_16px_rgba(56,189,248,0.35)]'
                : latestWinner
                ? 'text-6xl sm:text-7xl md:text-8xl text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.7)] scale-100'
                : 'text-6xl sm:text-7xl md:text-8xl text-slate-500/80'
            }`}
          >
            {currentNumber}
          </div>
        </div>

        {/* Laser Perforation Divider Line */}
        <div className="relative my-2.5">
          <div className="border-t border-dashed border-white/15 w-full" />
        </div>

        {/* Ticket Stub (Who won / Status) */}
        <div className="pt-3 min-h-[68px] flex flex-col items-center justify-center text-center">
          {isDrawing ? (
            <div className="flex items-center gap-2 text-sky-200 font-bold text-sm sm:text-base animate-pulse">
              <Sparkles className="w-4 h-4 text-sky-400 animate-spin" />
              <span>Sorteando com aleatoriedade criptográfica...</span>
            </div>
          ) : latestWinner ? (
            <div className="space-y-1 animate-in fade-in duration-300">
              <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold tracking-wide uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ganhador Confirmado</span>
              </div>
              <div className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight break-words">
                {latestWinner.name}
              </div>
              <div className="text-xs text-slate-400">
                Bilhete #{latestWinner.number} · {eligibleCount} concorrentes na rodada
              </div>
            </div>
          ) : (
            <div className="text-xs sm:text-sm text-slate-300">
              {eligibleCount > 0 ? (
                <span>
                  Pronto para o sorteio! <b className="text-sky-300 font-semibold">{eligibleCount}</b> bilhetes concorrendo.
                </span>
              ) : (
                <span className="text-slate-400">Cadastre participantes e adicione moedas para começar.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
