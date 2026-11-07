import React, { useState } from 'react';
import {
  Sparkles,
  Trophy,
  Trash2,
  AlertCircle,
  Play,
  Disc,
  Ticket as TicketIcon,
  Award,
  Flame,
  BarChart2,
  ListOrdered,
  Gift,
  Maximize2,
  ShieldCheck,
  FileText,
  Copy,
  Check,
  Edit3,
  ChevronDown,
  ChevronUp,
  Sliders,
} from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Winner, Participant } from '../types';
import { TicketDisplay } from './TicketDisplay';
import { FortuneWheel } from './FortuneWheel';
import { formatDateTime } from '../utils/raffle';
import { PrizeConfigModal } from './PrizeConfigModal';
import { SettingsBackup } from './SettingsBackup';

interface DrawSectionProps {
  computed: ComputedRaffle;
  settings: RaffleSettings;
  winners: Winner[];
  participants: Participant[];
  isDrawing: boolean;
  currentDisplayNumber: number | string;
  onDraw: () => void;
  onRequestWheelSpin?: () => void;
  wheelSpinSignal?: number;
  onWheelSpinEnd: (chosenTicket: { number: number; participantId: string; name: string }) => void;
  onUpdateSettings: (patch: Partial<RaffleSettings>) => void;
  onRemoveWinner: (id: string) => void;
  onClearWinners: () => void;
  onOpenBattleRoyale: () => void;
  onOpenVictoryCard: (winner: Winner) => void;
  onOpenMonteCarlo: () => void;
  onOpenPrizeQueue: () => void;
  onOpenCelebration: (winner: Winner) => void;
  onOpenAuditReport: () => void;
  rosterHash: string;
  onRestoreState: (state: {
    settings: RaffleSettings;
    participants: Participant[];
    winners: Winner[];
  }) => void;
  onResetToSample: () => void;
  onResetCoinsOnly: () => void;
}

export const DrawSection: React.FC<DrawSectionProps> = ({
  computed,
  settings,
  winners,
  participants,
  isDrawing,
  currentDisplayNumber,
  onDraw,
  onRequestWheelSpin,
  wheelSpinSignal,
  onWheelSpinEnd,
  onUpdateSettings,
  onRemoveWinner,
  onClearWinners,
  onOpenBattleRoyale,
  onOpenVictoryCard,
  onOpenMonteCarlo,
  onOpenPrizeQueue,
  onOpenCelebration,
  onOpenAuditReport,
  rosterHash,
  onRestoreState,
  onResetToSample,
  onResetCoinsOnly,
}) => {
  const [isConfirmingClearWinners, setIsConfirmingClearWinners] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);

  const handleCopyHash = () => {
    if (!rosterHash) return;
    navigator.clipboard.writeText(rosterHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const eligibleCount = computed.eligibleTickets.length;
  const latestWinner = winners.length > 0 ? winners[0] : null;
  const drawMode = settings.drawMode || 'drum';

  // Determine next ranked prize from queue if available
  const prizes = settings.prizes || [];
  const nextRankedPrize = [...prizes]
    .sort((a, b) => a.rank - b.rank)
    .find((p) => !p.winnerId);

  const activePrizeLabel = nextRankedPrize
    ? nextRankedPrize.name
    : settings.prizeName || settings.currentPrize || 'Prêmio Principal';

  const canDraw = !isDrawing && eligibleCount > 0;

  return (
    <div className="space-y-5 min-w-0">
      {/* Main Draw Mesa Card */}
      <div className="rounded-xl bg-[#101F3D] border border-[#182943] p-5 sm:p-6 space-y-5 shadow-lg">
        {/* Header & Mode Selector (Globo Digital vs Roleta Proporcional) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#182943]">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-[#F8FAFC]">
              Mesa de Sorteio
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] font-mono tabular-nums">
              <strong className="text-[#00A9FF]">{eligibleCount}</strong> {eligibleCount === 1 ? 'bilhete elegível' : 'bilhetes elegíveis'} · Regra ativa: <strong className="text-[#F8FAFC]">{settings.rate} moedas = 1 bilhete</strong>
            </p>
          </div>

          {/* Segmented Mode Switcher */}
          <div className="flex items-center bg-[#0B1730] p-1 rounded-lg border border-[#182943] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onUpdateSettings({ drawMode: 'drum' })}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                drawMode === 'drum'
                  ? 'bg-[#0866F5] text-[#F8FAFC] shadow-sm'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <TicketIcon className="w-4 h-4" />
              <span>Globo Digital</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ drawMode: 'wheel' })}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                drawMode === 'wheel'
                  ? 'bg-[#0866F5] text-[#F8FAFC] shadow-sm'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
            >
              <Disc className="w-4 h-4" />
              <span>Roleta Visual</span>
            </button>
          </div>
        </div>

        {/* Active Prize Card (Discrete & Editable) */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-[#0B1730] border border-[#182943] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {settings.prizeImage ? (
              <div className="w-11 h-11 rounded-lg overflow-hidden border border-[#F5B942]/40 shrink-0 bg-[#101F3D]">
                <img
                  src={settings.prizeImage}
                  alt={activePrizeLabel}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#182943] border border-[#F5B942]/40 flex items-center justify-center shrink-0 text-[#F5B942]">
                <Gift className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[#94A3B8]">
                  Prêmio em Disputa
                </span>
                {nextRankedPrize && (
                  <span className="px-1.5 py-0.5 rounded bg-[#F5B942]/15 text-[#F5B942] text-[11px] font-mono font-semibold tabular-nums">
                    #{nextRankedPrize.rank}º da Fila
                  </span>
                )}
              </div>
              <div className="text-sm sm:text-base font-semibold text-[#F8FAFC] truncate">
                {activePrizeLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPrizeModalOpen(true)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#182943] hover:bg-[#0866F5]/20 text-[#F8FAFC] border border-[#00A9FF]/30 text-xs sm:text-sm font-medium flex items-center gap-1.5 shrink-0 transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#00A9FF]" />
            <span>Editar Prêmio</span>
          </button>
        </div>

        {/* Display Arena: Globo Digital or Roleta Visual */}
        {drawMode === 'drum' ? (
          <div className="space-y-4">
            <TicketDisplay
              displayNumber={currentDisplayNumber}
              isSpinning={isDrawing}
              winnerName={latestWinner ? latestWinner.name : null}
              winnerPrize={latestWinner ? latestWinner.prize : null}
              themeMode={settings.themeMode}
            />

            {/* Primary Draw CTA Button */}
            <button
              type="button"
              disabled={!canDraw}
              onClick={onDraw}
              className={`w-full min-h-[50px] py-3.5 px-6 rounded-xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2.5 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF] ${
                canDraw
                  ? 'bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] shadow-md cursor-pointer'
                  : 'bg-[#182943] text-[#94A3B8] border border-[#182943] cursor-not-allowed opacity-60'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-5 h-5 animate-spin text-[#F8FAFC]" />
                  <span>Sorteando Bilhete...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Sortear Agora no Globo</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="py-1">
            <FortuneWheel
              computed={computed}
              isDrawing={isDrawing}
              onSpinStart={() => {}}
              onSpinEnd={onWheelSpinEnd}
              latestWinner={latestWinner}
              onRequestSpin={onRequestWheelSpin}
              spinSignal={wheelSpinSignal}
            />
          </div>
        )}

        {/* Eligibility Alert when no eligible tickets exist */}
        {eligibleCount === 0 && (
          <div className="flex items-start gap-2.5 text-xs text-[#F05262] bg-[#F05262]/10 border border-[#F05262]/30 rounded-xl p-3.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F05262]" />
            <span>
              {computed.usedCount === 0
                ? `Nenhum bilhete elegível emitido. Adicione participantes com pelo menos ${settings.rate} moedas na lista ao lado para liberar o sorteio.`
                : 'Todos os participantes com bilhetes já foram premiados! Desmarque a opção "Não repetir ganhador" nos recursos extras ou limpe o histórico para sortear novamente.'}
            </span>
          </div>
        )}

        {/* Quick Winner Actions Bar (when at least 1 winner exists) */}
        {latestWinner && !isDrawing && (
          <div className="p-3.5 rounded-xl bg-[#0B1730] border border-[#F5B942]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-[#F5B942] block">
                Último Ganhador Sorteado
              </span>
              <div className="text-sm font-semibold text-[#F8FAFC] truncate font-mono tabular-nums">
                #{latestWinner.number} · <span className="font-sans">{latestWinner.name}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenCelebration(latestWinner)}
                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#182943] hover:bg-[#0866F5]/20 text-[#F8FAFC] border border-[#182943] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#00A9FF]" />
                <span>Telão</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenVictoryCard(latestWinner)}
                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#182943] hover:bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/40 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Award className="w-3.5 h-3.5" />
                <span>Cartão VIP</span>
              </button>
              <button
                type="button"
                onClick={onOpenAuditReport}
                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#0866F5]/20 hover:bg-[#0866F5]/30 text-[#00A9FF] border border-[#00A9FF]/40 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Certificado PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Advanced Block: Recursos Extras da Mesa */}
        <div className="pt-2 border-t border-[#182943]">
          <button
            type="button"
            onClick={() => setIsExtrasOpen((prev) => !prev)}
            aria-expanded={isExtrasOpen}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-lg bg-[#0B1730] hover:bg-[#182943] border border-[#182943] flex items-center justify-between text-xs font-semibold text-[#F8FAFC] transition"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#00A9FF]" />
              <span>Recursos Extras da Mesa (Eliminatória, Fila de Prêmios e Auditoria)</span>
            </span>
            {isExtrasOpen ? (
              <ChevronUp className="w-4 h-4 text-[#94A3B8]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#94A3B8]" />
            )}
          </button>

          {isExtrasOpen && (
            <div className="mt-3 p-4 rounded-xl bg-[#0B1730] border border-[#182943] space-y-4 animate-fade-in">
              {/* Quick Rules Toggle: Exclude previous winners & Countdown */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#182943]">
                <label className="flex items-center gap-2 text-xs text-[#F8FAFC] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.exclude}
                    onChange={(e) => onUpdateSettings({ exclude: e.target.checked })}
                    className="w-4 h-4 rounded border-[#182943] bg-[#101F3D] text-[#0866F5] focus:ring-[#00A9FF]"
                  />
                  <span>Não repetir ganhador em sorteios seguidos</span>
                </label>

                <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
                  <span>Contagem regressiva:</span>
                  <select
                    value={settings.countdownSeconds ?? 10}
                    onChange={(e) => onUpdateSettings({ countdownSeconds: Number(e.target.value) })}
                    className="px-2 py-1 rounded bg-[#101F3D] border border-[#182943] text-xs text-[#F8FAFC] font-mono tabular-nums"
                  >
                    <option value={0}>Desativada (0s)</option>
                    <option value={3}>3 segundos</option>
                    <option value={5}>5 segundos</option>
                    <option value={10}>10 segundos</option>
                  </select>
                </div>
              </div>

              {/* Advanced Tools Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={eligibleCount < 2}
                  onClick={onOpenBattleRoyale}
                  className="p-3 rounded-lg bg-[#101F3D] hover:bg-[#182943] disabled:opacity-40 disabled:cursor-not-allowed border border-[#182943] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#182943] border border-[#F5B942]/40 flex items-center justify-center text-[#F5B942] shrink-0">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F8FAFC]">Modo Eliminatória</div>
                    <div className="text-[11px] text-[#94A3B8] truncate">Battle Royale até restar 1 campeão</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenPrizeQueue}
                  className="p-3 rounded-lg bg-[#101F3D] hover:bg-[#182943] border border-[#182943] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#182943] border border-[#00A9FF]/30 flex items-center justify-center text-[#00A9FF] shrink-0">
                    <ListOrdered className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F8FAFC]">Fila de Prêmios ({prizes.length})</div>
                    <div className="text-[11px] text-[#94A3B8] truncate">Configurar 1º, 2º e 3º lugares</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={eligibleCount === 0}
                  onClick={onOpenMonteCarlo}
                  className="p-3 rounded-lg bg-[#101F3D] hover:bg-[#182943] disabled:opacity-40 disabled:cursor-not-allowed border border-[#182943] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#182943] border border-[#00A9FF]/30 flex items-center justify-center text-[#00A9FF] shrink-0">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F8FAFC]">Simulação 10k</div>
                    <div className="text-[11px] text-[#94A3B8] truncate">Testar probabilidades (Monte Carlo)</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenAuditReport}
                  className="p-3 rounded-lg bg-[#101F3D] hover:bg-[#182943] border border-[#182943] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#182943] border border-[#F5B942]/40 flex items-center justify-center text-[#F5B942] shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F8FAFC]">Certificado e Laudo PDF</div>
                    <div className="text-[11px] text-[#94A3B8] truncate">Relatório oficial com QR Code</div>
                  </div>
                </button>
              </div>

              {/* SHA-256 Roster Integrity Hash */}
              <div className="p-3 rounded-lg bg-[#101F3D] border border-[#182943] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#20C997]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Hash SHA-256 da Lista de Bilhetes</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="px-2 py-0.5 rounded bg-[#0B1730] hover:bg-[#182943] border border-[#182943] text-[10px] font-medium text-[#F8FAFC] flex items-center gap-1 transition"
                  >
                    {copiedHash ? (
                      <>
                        <Check className="w-3 h-3 text-[#20C997]" />
                        <span className="text-[#20C997]">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#94A3B8]" />
                        <span>Copiar Hash</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-[10px] text-[#94A3B8] truncate bg-[#0B1730] px-2.5 py-1.5 rounded border border-[#182943] select-all">
                  {rosterHash || 'Calculando hash de integridade...'}
                </div>
              </div>

              {/* Settings Backup & Quick Reset Controls */}
              <SettingsBackup
                settings={settings}
                participants={participants}
                winners={winners}
                computed={computed}
                onUpdateSettings={onUpdateSettings}
                onOpenAuditReport={onOpenAuditReport}
                rosterHash={rosterHash}
                onRestoreState={
                  onRestoreState ||
                  (() => {
                    /* fallback */
                  })
                }
                onResetToSample={
                  onResetToSample ||
                  (() => {
                    /* fallback */
                  })
                }
                onResetCoinsOnly={
                  onResetCoinsOnly ||
                  (() => {
                    /* fallback */
                  })
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Compact Recent Winners Card below Mesa */}
      {winners.length > 0 && (
        <div className="rounded-xl bg-[#101F3D] border border-[#182943] p-5 space-y-3.5 shadow-lg">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#182943]">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#F5B942]" />
              <h3 className="text-sm font-semibold text-[#F8FAFC]">
                Ganhadores desta Sessão ({winners.length})
              </h3>
            </div>

            {isConfirmingClearWinners ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClearWinners();
                    setIsConfirmingClearWinners(false);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-[#F05262] text-[#F8FAFC] rounded transition"
                >
                  Confirmar Limpeza
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClearWinners(false)}
                  className="px-2 py-1 text-[11px] text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClearWinners(true)}
                className="text-xs text-[#94A3B8] hover:text-[#F05262] transition"
              >
                Limpar histórico
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {winners.map((w, index) => (
              <div
                key={w.id}
                className="p-2.5 rounded-lg bg-[#0B1730] border border-[#182943] flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-1 rounded bg-[#182943] border border-[#F5B942]/40 text-[#F5B942] font-mono font-bold text-xs tabular-nums shrink-0">
                    #{w.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-[#F8FAFC] truncate">
                        {w.name}
                      </span>
                      {index === 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#20C997]/20 text-[#20C997] font-medium shrink-0">
                          Mais recente
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#94A3B8] truncate tabular-nums">
                      {w.prize || 'Prêmio'} · {formatDateTime(w.drawnAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    title="Gerar Cartão VIP"
                    className="px-2 py-1 rounded bg-[#101F3D] hover:bg-[#182943] text-[#F5B942] border border-[#182943] text-[11px] font-medium flex items-center gap-1 transition"
                  >
                    <Award className="w-3 h-3" />
                    <span className="hidden sm:inline">Cartão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveWinner(w.id)}
                    title="Remover registro"
                    className="p-1.5 text-[#94A3B8] hover:text-[#F05262] rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prize Config Modal */}
      <PrizeConfigModal
        isOpen={isPrizeModalOpen}
        onClose={() => setIsPrizeModalOpen(false)}
        currentPrizeName={settings.prizeName || settings.currentPrize || 'Prêmio Oficial'}
        currentPrizeImage={settings.prizeImage}
        onSavePrize={(name, image) => {
          onUpdateSettings({
            prizeName: name,
            currentPrize: name,
            prizeImage: image,
          });
        }}
      />
    </div>
  );
};
