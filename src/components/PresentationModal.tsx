import React, { useEffect } from 'react';
import { X, Trophy, Sparkles, Play, Award, Gift, Volume2, VolumeX } from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Winner } from '../types';

interface PresentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  computed: ComputedRaffle;
  settings: RaffleSettings;
  latestWinner: Winner | null;
  currentDisplayNumber: number | string;
  isDrawing: boolean;
  onDraw: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export const PresentationModal: React.FC<PresentationModalProps> = ({
  isOpen,
  onClose,
  computed,
  settings,
  latestWinner,
  currentDisplayNumber,
  isDrawing,
  onDraw,
  soundEnabled,
  onToggleSound,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.code === 'Space' && !isDrawing && computed.eligibleTickets.length > 0) {
        e.preventDefault();
        onDraw();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDrawing, computed.eligibleTickets.length, onClose, onDraw]);

  if (!isOpen) return null;

  const eligibleCount = computed.eligibleTickets.length;
  const canDraw = eligibleCount > 0 && !isDrawing;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-8 animate-in fade-in duration-200">
      {/* Presentation Top Bar */}
      <div className="flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold flex items-center justify-center shadow-lg shadow-blue-500/30 ring-1 ring-sky-300/40">
            <Sparkles className="w-6 h-6 fill-white" />
          </div>
          <div>
            <h1 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
              GIO DA SORTE
            </h1>
            <p className="text-xs text-sky-400 font-medium">
              {settings.currentPrize ? `Prêmio em Disputa: ${settings.currentPrize}` : 'Modo Apresentação ao Vivo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSound}
            className="p-2.5 text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition"
            title="Alternar som"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-sky-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-4 h-4" />
            <span>Sair do Telão</span>
          </button>
        </div>
      </div>

      {/* Center Giant Ticket */}
      <div className="max-w-2xl w-full mx-auto my-auto py-6">
        <div className="relative">
          {latestWinner && !isDrawing && (
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-600/40 via-sky-400/50 to-indigo-600/40 rounded-3xl blur-2xl animate-pulse-subtle pointer-events-none" />
          )}

          <div
            className={`relative ticket-notch-lg bg-gradient-to-br from-blue-600 via-sky-500 to-indigo-700 text-white px-8 sm:px-14 py-10 rounded-2xl shadow-2xl transition-all duration-300 ${
              isDrawing
                ? 'scale-[1.02] shadow-blue-500/50'
                : latestWinner
                ? 'scale-100 ring-4 ring-sky-300 shadow-blue-600/60'
                : 'border-t-2 border-sky-300/40'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-sky-200/30 pb-4">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold uppercase tracking-widest text-sky-100">
                <Award className="w-5 h-5 text-sky-200" />
                <span>GIO DA SORTE · BILHETE OFICIAL</span>
              </div>
              <div className="font-mono text-xs sm:text-sm font-bold text-sky-100">
                {eligibleCount} BILHETES NO PÁREO
              </div>
            </div>

            {(settings.currentPrize || settings.prizeImage) && (
              <div className="mt-4 flex items-center justify-center gap-3 text-xs sm:text-sm font-bold text-blue-950 bg-white/95 py-1.5 px-5 rounded-full mx-auto w-fit shadow-md">
                {settings.prizeImage ? (
                  <img
                    src={settings.prizeImage}
                    alt={settings.currentPrize || 'Prêmio'}
                    className="w-7 h-7 rounded-full object-cover border border-amber-400 shadow-sm shrink-0"
                  />
                ) : (
                  <Gift className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <span className="font-extrabold text-blue-950">{settings.currentPrize || 'Prêmio Oficial'}</span>
              </div>
            )}

            {/* Giant Number */}
            <div className="py-8 sm:py-12 text-center">
              <div className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-sky-100/80 mb-2">
                {isDrawing ? 'Sorteando bilhete...' : latestWinner ? 'Número Premiado' : 'Número Sorteado'}
              </div>
              <div
                className={`font-mono font-black tabular-nums tracking-tighter leading-none select-none transition-transform duration-75 ${
                  isDrawing
                    ? 'text-8xl sm:text-9xl md:text-[140px] text-white scale-105 drop-shadow-xl'
                    : latestWinner
                    ? 'text-8xl sm:text-9xl md:text-[140px] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                    : 'text-8xl sm:text-9xl md:text-[140px] text-white/50'
                }`}
              >
                {currentDisplayNumber}
              </div>
            </div>

            {/* Perforated Line */}
            <div className="border-t-2 border-dashed border-sky-200/40 my-2" />

            {/* Stub Winner Details */}
            <div className="pt-4 min-h-[90px] flex flex-col items-center justify-center text-center">
              {isDrawing ? (
                <div className="flex items-center gap-2.5 text-white font-bold text-lg animate-pulse">
                  <Sparkles className="w-5 h-5 animate-spin text-sky-300" />
                  <span>Embaralhando e sorteando bilhete...</span>
                </div>
              ) : latestWinner ? (
                <div className="space-y-1">
                  <div className="text-xs uppercase font-extrabold tracking-wider text-sky-200">
                    Parabéns ao grande vencedor(a)!
                  </div>
                  <div className="text-3xl sm:text-5xl font-display font-black text-white tracking-tight drop-shadow-md">
                    {latestWinner.name}
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-sky-100">
                    Bilhete #{latestWinner.number} · {latestWinner.prize}
                  </div>
                </div>
              ) : (
                <div className="text-sm font-bold text-sky-100">
                  {eligibleCount > 0 ? (
                    <span>Pressione Espaço ou clique em Sortear abaixo</span>
                  ) : (
                    <span>Nenhum bilhete disponível no momento.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Big Presentation CTA */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={!canDraw}
            onClick={onDraw}
            className={`py-4 px-10 rounded-2xl font-display font-black text-2xl tracking-wide flex items-center justify-center gap-3 transition-all duration-200 active:scale-95 ${
              canDraw
                ? 'bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-xl shadow-blue-600/40 hover:shadow-blue-600/60 cursor-pointer ring-1 ring-sky-300/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
            }`}
          >
            {isDrawing ? (
              <>
                <Sparkles className="w-7 h-7 animate-spin" />
                <span>Girando...</span>
              </>
            ) : (
              <>
                <Play className="w-7 h-7 fill-white" />
                <span>SORTEAR AGORA</span>
              </>
            )}
          </button>
          <span className="text-xs text-slate-500">
            Dica para o apresentador: você pode pressionar a tecla <b>Espaço</b> para sortear.
          </span>
        </div>
      </div>

      {/* Footer info */}
      <div className="max-w-6xl mx-auto w-full text-center text-xs text-slate-500">
        GIO DA SORTE · Sorteio proporcional com algoritmo criptográfico · Taxa de {settings.rate} moedas por bilhete
      </div>
    </div>
  );
};
