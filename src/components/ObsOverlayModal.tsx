import React, { useState, useEffect } from 'react';
import { X, Video, Play, Sparkles, Trophy } from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Winner } from '../types';

interface ObsOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  computed: ComputedRaffle;
  settings: RaffleSettings;
  latestWinner: Winner | null;
  currentDisplayNumber: number | string;
  isDrawing: boolean;
  onDraw: () => void;
}

export const ObsOverlayModal: React.FC<ObsOverlayModalProps> = ({
  isOpen,
  onClose,
  computed,
  settings,
  latestWinner,
  currentDisplayNumber,
  isDrawing,
  onDraw,
}) => {
  const [backgroundMode, setBackgroundMode] = useState<'transparent' | 'green' | 'dark'>('transparent');
  const [showControls, setShowControls] = useState(true);

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

  const bgStyle =
    backgroundMode === 'transparent'
      ? 'bg-transparent'
      : backgroundMode === 'green'
      ? 'bg-[#00b140]'
      : 'bg-slate-950/95';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col justify-between p-4 ${bgStyle} select-none`}>
      {/* Streamer Controls Bar */}
      <div
        className={`flex items-center justify-between max-w-4xl mx-auto w-full p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white backdrop-blur-md transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-10 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-sky-400" />
          <span className="font-bold">GIO DA SORTE · Overlay OBS Studio</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Fundo:</span>
          <button
            type="button"
            onClick={() => setBackgroundMode('transparent')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'transparent' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Transparente
          </button>
          <button
            type="button"
            onClick={() => setBackgroundMode('green')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'green' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Chroma Verde
          </button>
          <button
            type="button"
            onClick={() => setBackgroundMode('dark')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'dark' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            Escuro
          </button>

          <button
            type="button"
            onClick={() => setShowControls(!showControls)}
            className="px-2 py-1 bg-slate-800 text-slate-400 hover:text-white rounded"
          >
            {showControls ? 'Ocultar barra' : 'Fixar barra'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Live Stream Card */}
      <div className="max-w-md w-full mx-auto my-auto">
        <div className="bg-slate-900/95 border-2 border-blue-500/80 rounded-2xl p-6 shadow-2xl backdrop-blur-md text-center space-y-4 shadow-blue-500/20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
            <span className="font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>GIO DA SORTE · Ao Vivo</span>
            </span>
            <span className="text-slate-400 font-mono">
              {computed.eligibleTickets.length} bilhetes
            </span>
          </div>

          {(settings.currentPrize || settings.prizeImage) && (
            <div className="text-xs font-bold text-white bg-blue-600/30 py-1 px-3 rounded-full border border-blue-500/40 flex items-center justify-center gap-2 mx-auto w-fit">
              {settings.prizeImage && (
                <img
                  src={settings.prizeImage}
                  alt={settings.currentPrize || 'Prêmio'}
                  className="w-5 h-5 rounded-full object-cover border border-amber-300 shrink-0"
                />
              )}
              <span>Prêmio: {settings.currentPrize || 'Sorteio Oficial'}</span>
            </div>
          )}

          {/* Large Number */}
          <div className="py-2">
            <div
              className={`font-mono font-black tabular-nums tracking-tight select-none leading-none ${
                isDrawing
                  ? 'text-7xl sm:text-8xl text-sky-300 scale-105 drop-shadow-md'
                  : latestWinner
                  ? 'text-7xl sm:text-8xl text-sky-400 drop-shadow-lg'
                  : 'text-7xl sm:text-8xl text-slate-600'
              }`}
            >
              {currentDisplayNumber}
            </div>
          </div>

          {/* Winner Details */}
          {latestWinner && !isDrawing ? (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-xl shadow-lg space-y-0.5 animate-in zoom-in-95 border border-sky-300/40">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-sky-200 flex items-center justify-center gap-1">
                <Trophy className="w-3.5 h-3.5 fill-sky-200 text-white" />
                <span>Ganhador(a)</span>
              </div>
              <div className="text-xl sm:text-2xl font-display font-black truncate">
                {latestWinner.name}
              </div>
              <div className="text-[11px] font-bold text-sky-100">
                Bilhete #{latestWinner.number}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              {isDrawing ? 'Sorteando ao vivo...' : 'Pressione Espaço ou clique abaixo'}
            </div>
          )}

          {/* Draw Trigger */}
          <button
            type="button"
            disabled={isDrawing || computed.eligibleTickets.length === 0}
            onClick={onDraw}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition active:scale-95 ${
              !isDrawing && computed.eligibleTickets.length > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            {isDrawing ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Sorteando...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>SORTEAR AO VIVO</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-500">
        Dica para o OBS: crie uma fonte de navegador com o tamanho 800x600 e ative a transparência.
      </div>
    </div>
  );
};
