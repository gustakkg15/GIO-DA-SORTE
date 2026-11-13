import React, { useState, useEffect } from 'react';
import { X, Video, Play, Sparkles, Trophy, AlertCircle } from 'lucide-react';
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
  drawErrorMessage?: string | null;
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
  drawErrorMessage = null,
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
      : 'bg-[#080D18]/95';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col justify-between p-3 sm:p-4 overflow-y-auto ${bgStyle} select-none animate-fade-in`}>
      {/* Streamer Controls Bar */}
      <div
        className={`flex flex-wrap items-center justify-between max-w-4xl mx-auto w-full p-2.5 sm:p-3 rounded-xl bg-[#111B30]/95 border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] backdrop-blur-md transition-opacity duration-300 gap-2 shrink-0 ${
          showControls ? 'opacity-100' : 'opacity-10 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-[#A6C957] shrink-0" />
          <span className="font-bold truncate">Overlay OBS</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[#A5B1C5]">Fundo:</span>
          <button
            type="button"
            onClick={() => setBackgroundMode('transparent')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'transparent' ? 'bg-[#0131CD] text-[#FFFFFF]' : 'bg-[#080D18] text-[#A5B1C5]'
            }`}
          >
            Transparente
          </button>
          <button
            type="button"
            onClick={() => setBackgroundMode('green')}
            className={`px-2 py-1 rounded font-semibold transition ${
              backgroundMode === 'green' ? 'bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18]' : 'bg-[#080D18] text-[#A5B1C5]'
            }`}
          >
            Chroma Verde
          </button>
          <button
            type="button"
            onClick={() => setBackgroundMode('dark')}
            className={`px-2 py-1 rounded font-semibold ${
              backgroundMode === 'dark' ? 'bg-[#0131CD] text-[#FFFFFF]' : 'bg-[#080D18] text-[#A5B1C5]'
            }`}
          >
            Escuro
          </button>

          <button
            type="button"
            onClick={() => setShowControls(!showControls)}
            className="px-2 py-1 bg-[#080D18] text-[#A5B1C5] hover:text-[#FFFFFF] rounded"
          >
            {showControls ? 'Ocultar barra' : 'Fixar barra'}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#A5B1C5] hover:text-[#FFFFFF] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Live Stream Card */}
      <div className="max-w-md w-full mx-auto my-auto animate-slide-up">
        <div className="bg-[#111B30]/95 border-2 border-[#0131CD] rounded-2xl p-6 shadow-2xl backdrop-blur-md text-center space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--gio-border-subtle)] pb-2 text-xs">
            <span className="font-semibold text-[#A6C957] tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>GIO DA SORTE · Ao Vivo</span>
            </span>
            <span className="text-[#A5B1C5] tabular-nums">
              {computed.eligibleTickets.length} bilhetes
            </span>
          </div>

          {(settings.currentPrize || settings.prizeImage) && (
            <div className="text-xs font-bold text-[#FFFFFF] bg-[#080D18] py-1 px-3 rounded-full border border-[#0131CD]/40 flex items-center justify-center gap-2 mx-auto w-fit">
              {settings.prizeImage && (
                <img
                  src={settings.prizeImage}
                  alt={settings.currentPrize || 'Prêmio'}
                  className="w-5 h-5 rounded-full object-cover border border-[#A6C957] shrink-0"
                />
              )}
              <span>Prêmio: {settings.currentPrize || 'Sorteio Oficial'}</span>
            </div>
          )}

          {/* Large Number */}
          <div className="py-2">
            <div
              className={`font-bold tabular-nums tracking-tight select-none leading-none ${
                isDrawing
                  ? 'text-7xl sm:text-8xl text-[#A6C957] scale-105 drop-shadow-md'
                  : latestWinner
                  ? 'text-7xl sm:text-8xl text-[#FFFFFF] drop-shadow-lg'
                  : 'text-7xl sm:text-8xl text-[#A5B1C5]/50'
              }`}
            >
              {currentDisplayNumber}
            </div>
          </div>

          {/* Winner Details */}
          {latestWinner && !isDrawing ? (
            <div className="bg-[#0131CD] text-[#FFFFFF] p-3 rounded-xl shadow-lg space-y-0.5 animate-in zoom-in-95 border border-[#0131CD]/40">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#A6C957] flex items-center justify-center gap-1">
                <Trophy className="w-3.5 h-3.5 fill-[#A6C957] text-[#A6C957]" />
                <span>Ganhador(a)</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate">
                {latestWinner.name}
              </div>
              <div className="text-[11px] font-bold text-[#FFFFFF] tabular-nums">
                Bilhete #{latestWinner.number}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#A5B1C5]">
              {isDrawing ? 'Sorteando ao vivo...' : 'Pressione Espaço ou clique abaixo'}
            </div>
          )}

          {drawErrorMessage && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-[#F05262]/15 border border-[#F05262]/40 text-left flex items-start gap-2 text-[11px] text-[#FFFFFF]"
            >
              <AlertCircle className="w-3.5 h-3.5 text-[#F05262] shrink-0 mt-0.5" />
              <span>{drawErrorMessage}</span>
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
                : 'bg-[#080D18] text-[#A5B1C5] cursor-not-allowed'
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

      <div className="text-center text-[10px] text-[#A5B1C5]">
        Dica para o OBS: crie uma fonte de navegador com o tamanho 800x600 e ative a transparência.
      </div>
    </div>
  );
};
