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
      : 'bg-[#080A0F]/95';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col justify-between p-3 sm:p-4 overflow-y-auto ${bgStyle} select-none animate-fade-in`}>
      {/* Streamer Controls Bar */}
      <div
        className={`flex flex-wrap items-center justify-between max-w-4xl mx-auto w-full p-2.5 sm:p-3 rounded-xl bg-[#10141E]/95 border border-[#161C2C] text-xs text-[#FFFFFF] backdrop-blur-md transition-opacity duration-300 gap-2 shrink-0 ${
          showControls ? 'opacity-100' : 'opacity-10 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-[#B9FC01] shrink-0" />
          <span className="font-bold truncate">Overlay OBS</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#94A3B8]">Fundo:</span>
          <button
            type="button"
            onClick={() => setBackgroundMode('transparent')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'transparent' ? 'bg-[#0131CD] text-[#FFFFFF]' : 'bg-[#161C2C] text-[#94A3B8]'
            }`}
          >
            Transparente
          </button>
          <button
            type="button"
            onClick={() => setBackgroundMode('green')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'green' ? 'bg-[#20C997] text-[#080A0F]' : 'bg-[#161C2C] text-[#94A3B8]'
            }`}
          >
            Chroma Verde
          </button>
          <button
            type="button"
            onClick={() => setBackgroundMode('dark')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'dark' ? 'bg-[#0131CD] text-[#FFFFFF]' : 'bg-[#161C2C] text-[#94A3B8]'
            }`}
          >
            Escuro
          </button>

          <button
            type="button"
            onClick={() => setShowControls(!showControls)}
            className="px-2 py-1 bg-[#161C2C] text-[#94A3B8] hover:text-[#FFFFFF] rounded"
          >
            {showControls ? 'Ocultar barra' : 'Fixar barra'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#94A3B8] hover:text-[#FFFFFF] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Live Stream Card */}
      <div className="max-w-md w-full mx-auto my-auto animate-slide-up">
        <div className="bg-[#10141E]/95 border-2 border-[#0131CD] rounded-2xl p-6 shadow-2xl backdrop-blur-md text-center space-y-4">
          <div className="flex items-center justify-between border-b border-[#161C2C] pb-2 text-xs">
            <span className="font-bold text-[#B9FC01] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>GIO DA SORTE · Ao Vivo</span>
            </span>
            <span className="text-[#94A3B8] font-mono tabular-nums">
              {computed.eligibleTickets.length} bilhetes
            </span>
          </div>

          {(settings.currentPrize || settings.prizeImage) && (
            <div className="text-xs font-bold text-[#FFFFFF] bg-[#0131CD]/20 py-1 px-3 rounded-full border border-[#0131CD]/40 flex items-center justify-center gap-2 mx-auto w-fit">
              {settings.prizeImage && (
                <img
                  src={settings.prizeImage}
                  alt={settings.currentPrize || 'Prêmio'}
                  className="w-5 h-5 rounded-full object-cover border border-[#F5B942] shrink-0"
                />
              )}
              <span>Prêmio: {settings.currentPrize || 'Sorteio Oficial'}</span>
            </div>
          )}

          {/* Large Number */}
          <div className="py-2">
            <div
              className={`font-mono font-bold tabular-nums tracking-tight select-none leading-none ${
                isDrawing
                  ? 'text-7xl sm:text-8xl text-[#B9FC01] scale-105 drop-shadow-md'
                  : latestWinner
                  ? 'text-7xl sm:text-8xl text-[#FFFFFF] drop-shadow-lg'
                  : 'text-7xl sm:text-8xl text-[#94A3B8]/50'
              }`}
            >
              {currentDisplayNumber}
            </div>
          </div>

          {/* Winner Details */}
          {latestWinner && !isDrawing ? (
            <div className="bg-[#0131CD] text-[#FFFFFF] p-3 rounded-xl shadow-lg space-y-0.5 animate-in zoom-in-95 border border-[#0131CD]/40">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#F5B942] flex items-center justify-center gap-1">
                <Trophy className="w-3.5 h-3.5 fill-[#F5B942] text-[#F5B942]" />
                <span>Ganhador(a)</span>
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold truncate">
                {latestWinner.name}
              </div>
              <div className="text-[11px] font-mono font-bold text-[#FFFFFF] tabular-nums">
                Bilhete #{latestWinner.number}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#94A3B8]">
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
                ? 'bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] shadow-md'
                : 'bg-[#161C2C] text-[#94A3B8] cursor-not-allowed'
            }`}
          >
            {isDrawing ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Sorteando...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-[#FFFFFF]" />
                <span>SORTEAR AO VIVO</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="text-center text-[10px] text-[#94A3B8]">
        Dica para o OBS: crie uma fonte de navegador com o tamanho 800x600 e ative a transparência.
      </div>
    </div>
  );
};
