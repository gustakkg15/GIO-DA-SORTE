import React, { useEffect } from 'react';
import { X, Sparkles, Play, Award, Gift, Volume2, VolumeX, Clock, AlertCircle, LogIn } from 'lucide-react';
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
  drawErrorMessage?: string | null;
  isAuthenticated?: boolean;
  onOpenAccount?: () => void;
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
  drawErrorMessage = null,
  isAuthenticated = true,
  onOpenAccount,
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
    <div className="fixed inset-0 z-50 bg-[#080A0F]/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-6 md:p-8 overflow-y-auto animate-fade-in">
      <div className="animate-slide-up max-w-6xl mx-auto w-full flex flex-col flex-1 justify-between space-y-6">
        {/* Presentation Top Bar */}
        <div className="flex items-center justify-between w-full gap-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#0131CD] to-[#0131CD] text-[#FFFFFF] font-bold flex items-center justify-center shadow-lg ring-1 ring-[#0131CD]/40 shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 fill-[#FFFFFF]" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xl sm:text-2xl md:text-3xl text-[#FFFFFF] tracking-tight truncate">
                GIO DA SORTE
              </h1>
              <p className="text-[11px] sm:text-xs text-[#B9FC01] font-medium truncate">
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
                className="min-h-[40px] px-3 py-2 flex items-center gap-1.5 text-xs font-bold text-[#94A3B8] hover:text-[#FFFFFF] bg-[#10141E] border border-[#161C2C] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FC01] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080A0F]"
                title="Clique para alternar o tempo da contagem regressiva (10s, 5s, 3s, 0s)"
              >
                <Clock className="w-4 h-4 text-[#B9FC01]" />
                <span className="font-mono tabular-nums">{(settings.countdownSeconds ?? 10) > 0 ? `${settings.countdownSeconds ?? 10}s` : 'Imediato'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleSound}
              className="min-w-[40px] min-h-[40px] p-2 flex items-center justify-center text-[#94A3B8] hover:text-[#FFFFFF] bg-[#10141E] border border-[#161C2C] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FC01] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080A0F]"
              title={soundEnabled ? 'Desativar som' : 'Ativar som'}
              aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-[#B9FC01]" /> : <VolumeX className="w-5 h-5 text-[#94A3B8]" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-bold text-[#94A3B8] hover:text-[#FFFFFF] bg-[#10141E] border border-[#161C2C] hover:bg-[#161C2C] rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B9FC01] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080A0F]"
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
              <div className="absolute -inset-4 bg-gradient-to-r from-[#0131CD]/40 via-[#0131CD]/50 to-[#B9FC01]/40 rounded-3xl blur-2xl animate-pulse-subtle pointer-events-none" />
            )}

            <div
              className={`relative ticket-notch-lg bg-gradient-to-br from-[#0131CD] via-[#0131CD] to-[#10141E] text-[#FFFFFF] px-5 sm:px-10 md:px-14 py-6 sm:py-10 rounded-2xl shadow-2xl transition-all duration-300 ${
                isDrawing
                  ? 'scale-[1.01] shadow-[#0131CD]/40'
                  : latestWinner
                  ? 'scale-100 ring-4 ring-[#F5B942] shadow-[#0131CD]/60'
                  : 'border-t-2 border-[#0131CD]/40'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-[#FFFFFF]/20 pb-3 sm:pb-4 gap-2">
                <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs md:text-sm font-bold uppercase tracking-widest text-[#FFFFFF] truncate">
                  <Award className="w-4 h-4 sm:w-5 sm:h-5 text-[#F5B942] shrink-0" />
                  <span className="truncate">GIO DA SORTE · BILHETE OFICIAL</span>
                </div>
                <div className="font-mono text-[11px] sm:text-xs md:text-sm font-bold text-[#FFFFFF] shrink-0 tabular-nums">
                  {eligibleCount} NO PÁREO
                </div>
              </div>

              {(settings.currentPrize || settings.prizeImage) && (
                <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold text-[#FFFFFF] bg-[#080A0F] border border-[#B9FC01]/40 py-1.5 px-4 sm:px-5 rounded-full mx-auto w-fit max-w-full shadow-md">
                  {settings.prizeImage ? (
                    <img
                      src={settings.prizeImage}
                      alt={settings.currentPrize || 'Prêmio'}
                      className="w-5 h-5 sm:w-7 sm:h-7 rounded-full object-cover border border-[#F5B942] shadow-sm shrink-0"
                    />
                  ) : (
                    <Gift className="w-4 h-4 text-[#B9FC01] shrink-0" />
                  )}
                  <span className="font-bold text-[#FFFFFF] truncate max-w-[200px] sm:max-w-[320px]">{settings.currentPrize || 'Prêmio Oficial'}</span>
                </div>
              )}

              {/* Giant Number */}
              <div className="py-6 sm:py-10 md:py-12 text-center overflow-hidden">
                <div className="text-[10px] sm:text-xs md:text-sm font-bold uppercase tracking-widest text-[#FFFFFF]/80 mb-2">
                  {isDrawing ? 'Sorteando bilhete...' : latestWinner ? 'Número Premiado' : 'Número Sorteado'}
                </div>
                <div
                  className={`font-mono font-bold tabular-nums tracking-tighter leading-none select-none transition-transform duration-75 truncate ${
                    isDrawing
                      ? 'text-6xl sm:text-8xl md:text-9xl lg:text-[130px] text-[#FFFFFF] scale-105 drop-shadow-xl'
                      : latestWinner
                      ? 'text-6xl sm:text-8xl md:text-9xl lg:text-[130px] text-[#FFFFFF] drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                      : 'text-6xl sm:text-8xl md:text-9xl lg:text-[130px] text-[#FFFFFF]/50'
                  }`}
                >
                  {currentDisplayNumber}
                </div>
              </div>

              {/* Perforated Line */}
              <div className="border-t-2 border-dashed border-[#FFFFFF]/30 my-2" />

              {/* Stub Winner Details */}
              <div className="pt-4 min-h-[90px] flex flex-col items-center justify-center text-center">
                {isDrawing ? (
                  <div className="flex items-center gap-2.5 text-[#FFFFFF] font-bold text-lg animate-pulse">
                    <Sparkles className="w-5 h-5 animate-spin text-[#F5B942]" />
                    <span>Embaralhando e sorteando bilhete...</span>
                  </div>
                ) : latestWinner ? (
                  <div className="space-y-1">
                    <div className="text-xs uppercase font-bold tracking-wider text-[#F5B942]">
                      Parabéns ao grande vencedor(a)!
                    </div>
                    <div className="text-3xl sm:text-5xl font-display font-bold text-[#FFFFFF] tracking-tight drop-shadow-md">
                      {latestWinner.name}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-[#FFFFFF] font-mono tabular-nums">
                      Bilhete #{latestWinner.number} · {latestWinner.prize}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-[#FFFFFF]">
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
            {drawErrorMessage && (
              <div
                role="alert"
                className="w-full max-w-xl p-3.5 rounded-xl bg-[#F05262]/15 border border-[#F05262]/40 text-xs text-[#FFFFFF] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#F05262] shrink-0 mt-0.5" />
                  <span>{drawErrorMessage}</span>
                </div>
                {!isAuthenticated && onOpenAccount && (
                  <button
                    type="button"
                    onClick={onOpenAccount}
                    className="px-3 py-1.5 rounded-lg bg-[#F5B942] text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Conectar Conta</span>
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={!canDraw}
              onClick={onDraw}
              className={`py-4 px-10 rounded-2xl font-display font-bold text-2xl tracking-wide flex items-center justify-center gap-3 transition-all duration-200 active:scale-95 ${
                canDraw
                  ? 'bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] shadow-xl cursor-pointer ring-1 ring-[#0131CD]/40'
                  : 'bg-[#161C2C] text-[#94A3B8] border border-[#161C2C] cursor-not-allowed opacity-60'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-7 h-7 animate-spin" />
                  <span>Girando...</span>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Play className="w-7 h-7 fill-[#FFFFFF]" />
                  <span>SORTEAR AGORA</span>
                  {(settings.countdownSeconds ?? 10) > 0 && (
                    <span className="text-sm font-mono font-semibold bg-[#080A0F]/40 px-2.5 py-0.5 rounded-full text-[#FFFFFF] tabular-nums">
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
