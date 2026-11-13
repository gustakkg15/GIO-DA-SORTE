import React, { useEffect } from 'react';
import {
  Sparkles,
  Zap,
  X,
  Gift,
  Flame,
  Clock,
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
      className="fixed inset-0 z-[65] bg-[#080D18]/95 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in"
    >
      {/* Dynamic Background Tension Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] sm:w-[900px] h-[500px] sm:h-[600px] rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
            isUrgent
              ? 'bg-[#A6C957]/20 animate-pulse'
              : 'bg-[#0131CD]/25'
          }`}
        />
      </div>

      {/* Top Bar: Cancel button & mode indicators */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111B30] border border-[#A5B1C5]/20 text-xs text-[#A5B1C5] backdrop-blur-md">
          <Clock className="w-3.5 h-3.5 text-[#A6C957]" />
          <span>Contagem Regressiva de Sorteio</span>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#111B30] hover:border-[#0131CD] border border-[#A5B1C5]/20 text-[#A5B1C5] hover:text-[#FFFFFF] text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95"
          title="Cancelar contagem (Esc)"
        >
          <X className="w-4 h-4 text-[#A5B1C5]" />
          <span>Cancelar (Esc)</span>
        </button>
      </div>

      {/* Center Countdown Showcase Stage */}
      <div className="relative z-10 max-w-lg w-full text-center space-y-6 sm:space-y-7 py-8 px-2 animate-slide-up">
        {/* Kicker Announcement */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#111B30] border border-[#A5B1C5]/20 text-xs sm:text-sm font-semibold tracking-wider uppercase shadow-xl">
          {isUrgent ? (
            <>
              <Flame className="w-4 h-4 text-[#A6C957] fill-[#A6C957] animate-bounce" />
              <span className="text-[#A6C957] animate-pulse">Preparem os corações!</span>
              <Flame className="w-4 h-4 text-[#A6C957] fill-[#A6C957] animate-bounce" />
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-[#A6C957]" />
              <span className="text-[#A6C957]">O sorteio vai começar</span>
              <Sparkles className="w-4 h-4 text-[#A6C957]" />
            </>
          )}
        </div>

        {/* Central Circular Progress Meter with Giant Pulsating Digit */}
        <div className="relative mx-auto w-52 h-52 sm:w-60 sm:h-60 flex items-center justify-center select-none">
          {/* Radial Aura under circle */}
          <div
            className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 opacity-60 ${
              isUrgent ? 'bg-[#A6C957]/20 animate-pulse scale-110' : 'bg-[#0131CD]/30 scale-100'
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
              className="text-[#111B30]"
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
              className="transition-all duration-300 text-[#A6C957]"
            />
          </svg>

          {/* Center Digital Counter */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {secondsRemaining > 0 ? (
              <div
                key={secondsRemaining}
                className={`font-bold leading-none tracking-tight tabular-nums animate-in zoom-in-75 duration-300 ${
                  isUrgent
                    ? 'text-7xl sm:text-8xl text-[#A6C957]'
                    : 'text-7xl sm:text-8xl text-[#FFFFFF]'
                }`}
              >
                {secondsRemaining}
              </div>
            ) : (
              <div className="font-bold text-3xl sm:text-4xl text-[#A6C957] tracking-tight animate-bounce">
                SORTEANDO!
              </div>
            )}
            <span className="text-[11px] uppercase font-semibold tracking-wider text-[#A5B1C5] mt-1">
              {secondsRemaining > 1 ? 'Segundos' : secondsRemaining === 1 ? 'Segundo' : 'Começou!'}
            </span>
          </div>
        </div>

        {/* Prize Showcase Card */}
        <div className="bg-[#111B30] border border-[#A5B1C5]/20 rounded-2xl p-3.5 sm:p-4 shadow-xl text-left flex items-center gap-3.5">
          {prizeImage ? (
            <img
              src={prizeImage}
              alt={currentPrizeTitle}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover border border-[#A6C957]/45 shadow-md shrink-0"
            />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-[#A6C957] text-[#080D18] flex items-center justify-center font-bold shadow-md shrink-0">
              <Gift className="w-7 h-7 stroke-[2.2]" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-xs font-semibold tracking-wide text-[#A6C957]">
              Disputando agora
            </span>
            <h4 className="font-bold text-base sm:text-lg text-[#FFFFFF] truncate">
              {currentPrizeTitle}
            </h4>
            <div className="flex items-center gap-2 text-xs text-[#A5B1C5] mt-0.5 tabular-nums">
              <span>🎟️ <b className="text-[#FFFFFF]">{eligibleTicketsCount}</b> bilhetes</span>
              <span>·</span>
              <span>👥 <b className="text-[#FFFFFF]">{participantsCount}</b> participantes</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onSkip}
            className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-base shadow-xl transition active:scale-95 flex items-center justify-center gap-2 border border-[#0131CD]/40 cursor-pointer"
          >
            <Zap className="w-5 h-5 fill-[#FFFFFF] text-[#FFFFFF]" />
            <span>Sortear Imediatamente (Pular Contagem)</span>
          </button>

          <p className="text-xs text-[#A5B1C5] flex items-center justify-center gap-2">
            <span>Pressione <b>Espaço</b> para sortear direto ou <b>Esc</b> para cancelar</span>
          </p>
        </div>
      </div>
    </div>
  );
};
