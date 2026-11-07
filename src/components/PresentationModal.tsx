import React, { useEffect } from 'react';
import { X, Sparkles, Play, Award, Gift, Volume2, VolumeX, Clock } from 'lucide-react';
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
  onUpdateSettings?: (patch: Partial<RaffleSettings>) => void;
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
  onUpdateSettings,
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
    <div className="fixed inset-0 z-50 bg-[#050D20]/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-6 md:p-8 overflow-y-auto animate-fade-in">
      <div className="animate-slide-up max-w-6xl mx-auto w-full flex flex-col flex-1 justify-between space-y-6">
        {/* Presentation Top Bar */}
        <div className="flex items-center justify-between w-full gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#0866F5] to-[#00A9FF] text-[#F8FAFC] font-bold flex items-center justify-center shadow-lg ring-1 ring-[#35B9F5]/40 shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 fill-[#F8FAFC]" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xl sm:text-2xl md:text-3xl text-[#F8FAFC] tracking-tight truncate">
                GIO DA SORTE
              </h1>
              <p className="text-[11px] sm:text-xs text-[#00A9FF] font-medium truncate">
                {settings.currentPrize ? `Prêmio: ${settings.currentPrize}` : 'Modo Telão ao Vivo'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {onUpdateSettings && (
              <button
                type="button"
                onClick={() => {
                  const current = settings.countdownSeconds ?? 10;
                  const next = current === 10 ? 5 : current === 5 ? 3 : current === 3 ? 0 : 10;
                  onUpdateSettings({ countdownSeconds: next });
                }}
                className="min-h-[40px] px-3 py-2 flex items-center gap-1.5 text-xs font-bold text-[#94A3B8] hover:text-[#F8FAFC] bg-[#101F3D] border border-[#182943] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
                title="Clique para alternar o tempo da contagem regressiva (10s, 5s, 3s, 0s)"
              >
                <Clock className="w-4 h-4 text-[#00A9FF]" />
                <span className="font-mono tabular-nums">{(settings.countdownSeconds ?? 10) > 0 ? `${settings.countdownSeconds ?? 10}s` : 'Imediato'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleSound}
              className="min-w-[40px] min-h-[40px] p-2 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] bg-[#101F3D] border border-[#182943] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
              title={soundEnabled ? 'Desativar som' : 'Ativar som'}
              aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-[#00A9FF]" /> : <VolumeX className="w-5 h-5 text-[#94A3B8]" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-bold text-[#94A3B8] hover:text-[#F8FAFC] bg-[#101F3D] border border-[#182943] hover:bg-[#182943] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Sair do Telão</span>
              <span className="sm:hidden">Sair</span>
            </button>
          </div>
        </div>

        {/* Center Giant Ticket */}
        <div className="max-w-2xl w-full mx-auto my-auto py-4 sm:py-6">
          <div className="relative">
            {latestWinner && !isDrawing && (
              <div className="absolute -inset-4 bg-gradient-to-r from-[#0866F5]/40 via-[#00A9FF]/50 to-[#35B9F5]/40 rounded-3xl blur-2xl animate-pulse-subtle pointer-events-none" />
            )}

            <div
              className={`relative ticket-notch-lg bg-gradient-to-br from-[#0866F5] via-[#00A9FF] to-[#101F3D] text-[#F8FAFC] px-5 sm:px-10 md:px-14 py-6 sm:py-10 rounded-2xl shadow-2xl transition-all duration-300 ${
                isDrawing
                  ? 'scale-[1.01] shadow-[#00A9FF]/40'
                  : latestWinner
                  ? 'scale-100 ring-4 ring-[#F5B942] shadow-[#0866F5]/60'
                  : 'border-t-2 border-[#35B9F5]/40'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-[#F8FAFC]/20 pb-3 sm:pb-4 gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs md:text-sm font-bold uppercase tracking-widest text-[#F8FAFC] truncate">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5 text-[#F5B942] shrink-0" />
                  <span className="truncate">GIO DA SORTE · BILHETE OFICIAL</span>
                </div>
                <div className="font-mono text-[11px] sm:text-xs md:text-sm font-bold text-[#F8FAFC] shrink-0 tabular-nums">
                  {eligibleCount} NO PÁREO
                </div>
              </div>

              {(settings.currentPrize || settings.prizeImage) && (
                <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold text-[#050D20] bg-[#F8FAFC] py-1 px-4 sm:px-5 rounded-full mx-auto w-fit max-w-full shadow-md">
                  {settings.prizeImage ? (
                    <img
                      src={settings.prizeImage}
                      alt={settings.currentPrize || 'Prêmio'}
                      className="w-5 h-5 sm:w-7 sm:h-7 rounded-full object-cover border border-[#F5B942] shadow-sm shrink-0"
                    />
                  ) : (
                    <Gift className="w-4 h-4 text-[#0866F5] shrink-0" />
                  )}
                  <span className="font-bold text-[#050D20] truncate max-w-[200px] sm:max-w-[320px]">{settings.currentPrize || 'Prêmio Oficial'}</span>
                </div>
              )}

              {/* Giant Number */}
              <div className="py-6 sm:py-10 md:py-12 text-center overflow-hidden">
                <div className="text-[10px] sm:text-xs md:text-sm font-bold uppercase tracking-widest text-[#F8FAFC]/80 mb-2">
                  {isDrawing ? 'Sorteando bilhete...' : latestWinner ? 'Número Premiado' : 'Número Sorteado'}
                </div>
                <div
                  className={`font-mono font-bold tabular-nums tracking-tighter leading-none select-none transition-transform duration-75 truncate ${
                    isDrawing
                      ? 'text-6xl sm:text-8xl md:text-9xl lg:text-[130px] text-[#F8FAFC] scale-105 drop-shadow-xl'
                      : latestWinner
                      ? 'text-6xl sm:text-8xl md:text-9xl lg:text-[130px] text-[#F8FAFC] drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                      : 'text-6xl sm:text-8xl md:text-9xl lg:text-[130px] text-[#F8FAFC]/50'
                  }`}
                >
                  {currentDisplayNumber}
                </div>
              </div>

              {/* Perforated Line */}
              <div className="border-t-2 border-dashed border-[#F8FAFC]/30 my-2" />

              {/* Stub Winner Details */}
              <div className="pt-4 min-h-[90px] flex flex-col items-center justify-center text-center">
                {isDrawing ? (
                  <div className="flex items-center gap-2.5 text-[#F8FAFC] font-bold text-lg animate-pulse">
                    <Sparkles className="w-5 h-5 animate-spin text-[#F5B942]" />
                    <span>Embaralhando e sorteando bilhete...</span>
                  </div>
                ) : latestWinner ? (
                  <div className="space-y-1">
                    <div className="text-xs uppercase font-bold tracking-wider text-[#F5B942]">
                      Parabéns ao grande vencedor(a)!
                    </div>
                    <div className="text-3xl sm:text-5xl font-display font-bold text-[#F8FAFC] tracking-tight drop-shadow-md">
                      {latestWinner.name}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-[#F8FAFC] font-mono tabular-nums">
                      Bilhete #{latestWinner.number} · {latestWinner.prize}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-[#F8FAFC]">
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
              className={`py-4 px-10 rounded-2xl font-display font-bold text-2xl tracking-wide flex items-center justify-center gap-3 transition-all duration-200 active:scale-95 ${
                canDraw
                  ? 'bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] shadow-xl cursor-pointer ring-1 ring-[#35B9F5]/40'
                  : 'bg-[#182943] text-[#94A3B8] border border-[#182943] cursor-not-allowed opacity-60'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-7 h-7 animate-spin" />
                  <span>Girando...</span>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Play className="w-7 h-7 fill-[#F8FAFC]" />
                  <span>SORTEAR AGORA</span>
                  {(settings.countdownSeconds ?? 10) > 0 && (
                    <span className="text-sm font-mono font-semibold bg-[#050D20]/40 px-2.5 py-0.5 rounded-full text-[#F8FAFC] tabular-nums">
                      ⏱️ {(settings.countdownSeconds ?? 10)}s
                    </span>
                  )}
                </div>
              )}
            </button>
            <span className="text-xs text-[#94A3B8]">
              Dica para o apresentador: pressione a tecla <b>Espaço</b> para sortear{(settings.countdownSeconds ?? 10) > 0 ? ` (inicia contagem de ${settings.countdownSeconds ?? 10}s)` : ''}.
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="max-w-6xl mx-auto w-full text-center text-xs text-[#94A3B8] font-mono tabular-nums">
          GIO DA SORTE · Sorteio proporcional com algoritmo criptográfico · Taxa de {settings.rate} moedas por bilhete
        </div>
      </div>
    </div>
  );
};
