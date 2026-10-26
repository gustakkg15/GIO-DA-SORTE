import React, { useEffect } from 'react';
import {
  Sparkles,
  Zap,
  X,
  Gift,
  Flame,
  Award,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { RaffleSettings } from '../types';

interface DrawCountdownOverlayProps {
  isOpen: boolean;
  secondsRemaining: number;
  totalSeconds: number;
  settings: RaffleSettings;
  eligibleTicketsCount: number;
  participantsCount: number;
  onSkip: () => void;
  onCancel: () => void;
}

export const DrawCountdownOverlay: React.FC<DrawCountdownOverlayProps> = ({
  isOpen,
  secondsRemaining,
  totalSeconds,
  settings,
  eligibleTicketsCount,
  participantsCount,
  onSkip,
  onCancel,
}) => {
  // Keyboard listener for Space/Enter (skip) and Esc (cancel)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onSkip, onCancel]);

  if (!isOpen) return null;

  const currentPrizeTitle = settings.prizeName || settings.currentPrize || 'Prêmio Oficial';
  const prizeImage = settings.prizeImage;
  const isUrgent = secondsRemaining <= 3;
  const progressRatio = totalSeconds > 0 ? (totalSeconds - secondsRemaining) / totalSeconds : 0;

  // SVG Circular Meter Calculation (radius = 90)
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contagem regressiva para início do sorteio"
      className="fixed inset-0 z-[65] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
    >
      {/* Dynamic Background Tension Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[900px] h-[500px] sm:h-[600px] rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
            isUrgent
              ? 'bg-gradient-to-r from-red-600/30 via-amber-500/35 to-yellow-500/25 animate-pulse'
              : 'bg-gradient-to-r from-blue-600/30 via-indigo-600/25 to-sky-500/20'
          }`}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(2,6,23,0.85)_100%)]" />
      </div>

      {/* Top Bar: Cancel button & mode indicators */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-slate-300 backdrop-blur-md">
          <Clock className="w-3.5 h-3.5 text-sky-400" />
          <span>Contagem Regressiva de Sorteio</span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95"
          title="Cancelar contagem (Esc)"
        >
          <X className="w-4 h-4 text-slate-400" />
          <span>Cancelar (Esc)</span>
        </button>
      </div>

      {/* Center Countdown Showcase Stage */}
      <div className="relative z-10 max-w-lg w-full text-center space-y-6 sm:space-y-7 py-8 px-2">
        {/* Kicker Announcement */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs sm:text-sm font-black uppercase tracking-widest shadow-xl">
          {isUrgent ? (
            <>
              <Flame className="w-4 h-4 text-amber-400 fill-amber-400 animate-bounce" />
              <span className="text-amber-300 animate-pulse">PREPAREM OS CORAÇÕES!</span>
              <Flame className="w-4 h-4 text-amber-400 fill-amber-400 animate-bounce" />
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span className="text-sky-300">O SORTEIO VAI COMEÇAR!</span>
              <Sparkles className="w-4 h-4 text-sky-400" />
            </>
          )}
        </div>

        {/* Central Circular Progress Meter with Giant Pulsating Digit */}
        <div className="relative mx-auto w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center select-none">
          {/* Radial Aura under circle */}
          <div
            className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 opacity-60 ${
              isUrgent ? 'bg-amber-500/40 animate-pulse scale-110' : 'bg-blue-600/30 scale-100'
            }`}
          />

          {/* SVG Circular Track & Progress */}
          <svg className="w-full h-full -rotate-90 transform overflow-visible" viewBox="0 0 220 220">
            {/* Background Track */}
            <circle
              cx="110"
              cy="110"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              fill="transparent"
              className="text-slate-800/80"
            />
            {/* Animated Dynamic Progress Stroke */}
            <circle
              cx="110"
              cy="110"
              r={radius}
              stroke="currentColor"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className={`transition-all duration-300 ${
                isUrgent ? 'text-amber-400 drop-shadow-[0_0_16px_rgba(251,191,36,0.8)]' : 'text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]'
              }`}
            />
          </svg>

          {/* Center Digital Counter */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {secondsRemaining > 0 ? (
              <div
                key={secondsRemaining}
                className={`font-display font-black leading-none tracking-tight tabular-nums animate-in zoom-in-75 duration-300 ${
                  isUrgent
                    ? 'text-7xl sm:text-8xl text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-amber-300 to-amber-500 drop-shadow-[0_8px_30px_rgba(245,158,11,0.8)]'
                    : 'text-7xl sm:text-8xl text-transparent bg-clip-text bg-gradient-to-b from-white via-slate-100 to-sky-300 drop-shadow-[0_8px_25px_rgba(56,189,248,0.6)]'
                }`}
              >
                {secondsRemaining}
              </div>
            ) : (
              <div className="font-display font-black text-3xl sm:text-4xl text-amber-300 tracking-tight animate-bounce drop-shadow-[0_0_20px_rgba(245,158,11,0.8)]">
                SORTEANDO!
              </div>
            )}
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400 mt-1">
              {secondsRemaining > 1 ? 'Segundos' : secondsRemaining === 1 ? 'Segundo' : 'Começou!'}
            </span>
          </div>
        </div>

        {/* Prize Showcase Card */}
        <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-blue-950/80 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-xl text-left flex items-center gap-3.5">
          {prizeImage ? (
            <img
              src={prizeImage}
              alt={currentPrizeTitle}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-amber-400/50 shadow-md shrink-0"
            />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold shadow-md shrink-0 ring-2 ring-amber-300/40">
              <Gift className="w-7 h-7 stroke-[2.2]" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-400">
              Disputando agora:
            </span>
            <h4 className="font-display font-bold text-base sm:text-lg text-white truncate drop-shadow-sm">
              {currentPrizeTitle}
            </h4>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>🎟️ <b>{eligibleTicketsCount}</b> bilhetes</span>
              <span>·</span>
              <span>👥 <b>{participantsCount}</b> participantes</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-display font-black text-base shadow-xl shadow-blue-600/40 transition active:scale-95 flex items-center justify-center gap-2 border border-sky-300/40 cursor-pointer"
          >
            <Zap className="w-5 h-5 fill-white text-white" />
            <span>Sortear Imediatamente (Pular Contagem)</span>
          </button>

          <p className="text-xs text-slate-400 flex items-center justify-center gap-2">
            <span>Pressione <b>Espaço</b> para sortear direto ou <b>Esc</b> para cancelar</span>
          </p>
        </div>
      </div>
    </div>
  );
};
