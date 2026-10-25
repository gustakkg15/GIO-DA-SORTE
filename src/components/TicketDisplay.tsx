import React from 'react';
import { Sparkles, Trophy, Award, Gift } from 'lucide-react';
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
    <div className="relative w-full max-w-lg mx-auto">
      {/* Glow aura behind ticket when winning */}
      {latestWinner && !isDrawing && (
        <div className="absolute -inset-2 bg-gradient-to-r from-blue-600/40 via-sky-400/50 to-indigo-600/40 rounded-2xl blur-xl animate-pulse-subtle pointer-events-none" />
      )}

      {/* Main Royal Sapphire Ticket Surface */}
      <div
        className={`relative ticket-notch bg-gradient-to-br from-blue-600 via-sky-500 to-indigo-700 text-white px-6 sm:px-10 py-7 rounded-xl shadow-2xl transition-all duration-300 ${
          isDrawing
            ? 'scale-[1.01] shadow-sky-500/40 border-t-2 border-sky-300'
            : latestWinner
            ? 'scale-100 ring-2 ring-sky-300/80 shadow-blue-500/50'
            : 'border-t border-sky-300/30'
        }`}
      >
        {/* Ticket Header & Watermark */}
        <div className="flex items-center justify-between border-b border-sky-200/30 pb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-100">
            <Award className="w-4 h-4 text-sky-200" />
            <span>Bilhete Oficial · GIO DA SORTE</span>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono font-bold text-sky-100/90">
            <span>SÉRIE #{(totalCapacity).toString().padStart(4, '0')}</span>
          </div>
        </div>

        {/* Current Prize Badge & Photo */}
        {(currentPrize || prizeImage) && (
          <div className="mt-3 flex items-center justify-center gap-2 bg-slate-950/40 backdrop-blur-md border border-white/25 py-1 px-3.5 rounded-full mx-auto w-fit shadow-md">
            {prizeImage ? (
              <img
                src={prizeImage}
                alt={currentPrize || 'Prêmio'}
                className="w-6 h-6 rounded-full object-cover border border-amber-300/80 shadow-sm shrink-0"
              />
            ) : (
              <Gift className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            )}
            <div className="flex items-center gap-1.5 text-xs font-bold text-white">
              <span className="text-sky-200/90 text-[10px] uppercase tracking-wider">Prêmio:</span>
              <span className="font-extrabold text-white truncate max-w-[200px] sm:max-w-[260px]">
                {currentPrize || 'Prêmio da Rodada'}
              </span>
            </div>
          </div>
        )}

        {/* Giant Number Display (Slot / Drum Animation) */}
        <div className="py-5 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-sky-100/80 mb-1">
            {isDrawing ? 'Sorteando bilhete...' : latestWinner ? 'Número Premiado' : 'Número Sorteado'}
          </div>

          <div
            className={`font-mono font-black tabular-nums select-none tracking-tight leading-none transition-transform duration-100 ${
              isDrawing
                ? 'text-7xl sm:text-8xl md:text-9xl text-white blur-[0.4px] scale-105 drop-shadow-lg'
                : latestWinner
                ? 'text-7xl sm:text-8xl md:text-9xl text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)] scale-100'
                : 'text-7xl sm:text-8xl md:text-9xl text-white/50'
            }`}
          >
            {currentNumber}
          </div>
        </div>

        {/* Perforated Divider Line */}
        <div className="relative my-2">
          <div className="border-t-2 border-dashed border-sky-200/40 w-full" />
        </div>

        {/* Ticket Stub (Who won / Status) */}
        <div className="pt-3 min-h-[64px] flex flex-col items-center justify-center text-center">
          {isDrawing ? (
            <div className="flex items-center gap-2 text-white font-bold text-sm sm:text-base animate-pulse">
              <Sparkles className="w-4 h-4 animate-spin text-sky-200" />
              <span>Girando o tambor da sorte...</span>
            </div>
          ) : latestWinner ? (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-sky-200 text-xs font-bold tracking-wide uppercase">
                <Trophy className="w-4 h-4 fill-sky-300 text-sky-950" />
                <span>Ganhador Confirmado</span>
              </div>
              <div className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight break-words drop-shadow-sm">
                {latestWinner.name}
              </div>
              <div className="text-xs font-medium text-sky-100">
                Bilhete premiado entre {eligibleCount} concorrentes
              </div>
            </div>
          ) : (
            <div className="text-xs sm:text-sm font-medium text-sky-100">
              {eligibleCount > 0 ? (
                <span>
                  Pronto para o sorteio! <b>{eligibleCount}</b> bilhetes estão concorrendo.
                </span>
              ) : (
                <span>Cadastre participantes e adicione moedas para começar.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
