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
      <div className="rounded-xl bg-[#222B28] border border-[#313D39] p-5 sm:p-6 space-y-5">
        {/* Header & Mode Selector (Globo Digital vs Roleta Proporcional) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#313D39]">
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-[#EAE7DE]">
              Mesa de Sorteio
            </h2>
            <p className="text-xs text-[#9BA8A3] tabular-nums">
              {eligibleCount} {eligibleCount === 1 ? 'bilhete elegível' : 'bilhetes elegíveis'} · Regra ativa: {settings.rate} moedas = 1 bilhete
            </p>
          </div>

          {/* Segmented Mode Switcher */}
          <div className="flex items-center bg-[#171D1C] p-1 rounded-lg border border-[#313D39] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onUpdateSettings({ drawMode: 'drum' })}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                drawMode === 'drum'
                  ? 'bg-[#6EAA90] text-[#171D1C]'
                  : 'text-[#9BA8A3] hover:text-[#EAE7DE]'
              }`}
            >
              <TicketIcon className="w-3.5 h-3.5" />
              <span>Globo Digital</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ drawMode: 'wheel' })}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                drawMode === 'wheel'
                  ? 'bg-[#6EAA90] text-[#171D1C]'
                  : 'text-[#9BA8A3] hover:text-[#EAE7DE]'
              }`}
            >
              <Disc className="w-3.5 h-3.5" />
              <span>Roleta Visual</span>
            </button>
          </div>
        </div>

        {/* Active Prize Card (Discrete & Editable) */}
        <div className="p-3.5 rounded-xl bg-[#171D1C] border border-[#313D39] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {settings.prizeImage ? (
              <div className="w-11 h-11 rounded-lg overflow-hidden border border-[#C6A56A]/40 shrink-0 bg-[#222B28]">
                <img
                  src={settings.prizeImage}
                  alt={activePrizeLabel}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#2B3632] border border-[#C6A56A]/40 flex items-center justify-center shrink-0 text-[#C6A56A]">
                <Gift className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[#9BA8A3]">
                  Prêmio em Disputa
                </span>
                {nextRankedPrize && (
                  <span className="px-1.5 py-0.5 rounded bg-[#C6A56A]/15 text-[#C6A56A] text-[10px] font-mono font-semibold tabular-nums">
                    #{nextRankedPrize.rank}º da Fila
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-[#EAE7DE] truncate">
                {activePrizeLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPrizeModalOpen(true)}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] text-xs font-medium flex items-center gap-1.5 shrink-0 transition"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#C6A56A]" />
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
              className={`w-full min-h-[50px] py-3.5 px-6 rounded-xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2.5 transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90] ${
                canDraw
                  ? 'bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] shadow-md cursor-pointer'
                  : 'bg-[#2B3632] text-[#9BA8A3] border border-[#313D39] cursor-not-allowed opacity-60'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-5 h-5 animate-spin text-[#171D1C]" />
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
          <div className="flex items-start gap-2.5 text-xs text-[#D96B6B] bg-[#D96B6B]/10 border border-[#D96B6B]/30 rounded-xl p-3.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#D96B6B]" />
            <span>
              {computed.usedCount === 0
                ? `Nenhum bilhete elegível emitido. Adicione participantes com pelo menos ${settings.rate} moedas na lista ao lado para liberar o sorteio.`
                : 'Todos os participantes com bilhetes já foram premiados! Desmarque a opção "Não repetir ganhador" nos recursos extras ou limpe o histórico para sortear novamente.'}
            </span>
          </div>
        )}

        {/* Quick Winner Actions Bar (when at least 1 winner exists) */}
        {latestWinner && !isDrawing && (
          <div className="p-3.5 rounded-xl bg-[#171D1C] border border-[#C6A56A]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-[#C6A56A] block">
                Último Ganhador Sorteado
              </span>
              <div className="text-sm font-semibold text-[#EAE7DE] truncate tabular-nums">
                #{latestWinner.number} · {latestWinner.name}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenCelebration(latestWinner)}
                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#6EAA90]" />
                <span>Telão</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenVictoryCard(latestWinner)}
                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#C6A56A] border border-[#C6A56A]/40 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Award className="w-3.5 h-3.5" />
                <span>Cartão VIP</span>
              </button>
              <button
                type="button"
                onClick={onOpenAuditReport}
                className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-[#6EAA90]/15 hover:bg-[#6EAA90]/25 text-[#6EAA90] border border-[#6EAA90]/40 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Certificado PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Collapsible Advanced Block: Recursos Extras da Mesa */}
        <div className="pt-2 border-t border-[#313D39]">
          <button
            type="button"
            onClick={() => setIsExtrasOpen((prev) => !prev)}
            aria-expanded={isExtrasOpen}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] border border-[#313D39] flex items-center justify-between text-xs font-semibold text-[#EAE7DE] transition"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-[#6EAA90]" />
              <span>Recursos Extras da Mesa (Eliminatória, Fila de Prêmios e Auditoria)</span>
            </span>
            {isExtrasOpen ? (
              <ChevronUp className="w-4 h-4 text-[#9BA8A3]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#9BA8A3]" />
            )}
          </button>

          {isExtrasOpen && (
            <div className="mt-3 p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-4 animate-fade-in">
              {/* Quick Rules Toggle: Exclude previous winners & Countdown */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#313D39]">
                <label className="flex items-center gap-2 text-xs text-[#EAE7DE] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.exclude}
                    onChange={(e) => onUpdateSettings({ exclude: e.target.checked })}
                    className="w-4 h-4 rounded border-[#313D39] bg-[#222B28] text-[#6EAA90] focus:ring-[#6EAA90]"
                  />
                  <span>Não repetir ganhador em sorteios seguidos</span>
                </label>

                <div className="flex items-center gap-2 text-xs text-[#9BA8A3]">
                  <span>Contagem regressiva:</span>
                  <select
                    value={settings.countdownSeconds ?? 10}
                    onChange={(e) => onUpdateSettings({ countdownSeconds: Number(e.target.value) })}
                    className="px-2 py-1 rounded bg-[#222B28] border border-[#313D39] text-xs text-[#EAE7DE] font-mono tabular-nums"
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
                  className="p-3 rounded-lg bg-[#222B28] hover:bg-[#2B3632] disabled:opacity-40 disabled:cursor-not-allowed border border-[#313D39] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#2B3632] border border-[#C6A56A]/40 flex items-center justify-center text-[#C6A56A] shrink-0">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#EAE7DE]">Modo Eliminatória</div>
                    <div className="text-[11px] text-[#9BA8A3] truncate">Battle Royale até restar 1 campeão</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenPrizeQueue}
                  className="p-3 rounded-lg bg-[#222B28] hover:bg-[#2B3632] border border-[#313D39] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#2B3632] border border-[#313D39] flex items-center justify-center text-[#6EAA90] shrink-0">
                    <ListOrdered className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#EAE7DE]">Fila de Prêmios ({prizes.length})</div>
                    <div className="text-[11px] text-[#9BA8A3] truncate">Configurar 1º, 2º e 3º lugares</div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={eligibleCount === 0}
                  onClick={onOpenMonteCarlo}
                  className="p-3 rounded-lg bg-[#222B28] hover:bg-[#2B3632] disabled:opacity-40 disabled:cursor-not-allowed border border-[#313D39] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#2B3632] border border-[#313D39] flex items-center justify-center text-[#6EAA90] shrink-0">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#EAE7DE]">Simulação 10k</div>
                    <div className="text-[11px] text-[#9BA8A3] truncate">Testar probabilidades (Monte Carlo)</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenAuditReport}
                  className="p-3 rounded-lg bg-[#222B28] hover:bg-[#2B3632] border border-[#313D39] text-left flex items-center gap-2.5 transition"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#2B3632] border border-[#C6A56A]/40 flex items-center justify-center text-[#C6A56A] shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#EAE7DE]">Certificado e Laudo PDF</div>
                    <div className="text-[11px] text-[#9BA8A3] truncate">Relatório oficial com QR Code</div>
                  </div>
                </button>
              </div>

              {/* SHA-256 Roster Integrity Hash */}
              <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6EAA90]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Hash SHA-256 da Lista de Bilhetes</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="px-2 py-0.5 rounded bg-[#171D1C] hover:bg-[#2B3632] border border-[#313D39] text-[10px] font-medium text-[#EAE7DE] flex items-center gap-1 transition"
                  >
                    {copiedHash ? (
                      <>
                        <Check className="w-3 h-3 text-[#6EAA90]" />
                        <span className="text-[#6EAA90]">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-[#9BA8A3]" />
                        <span>Copiar Hash</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-[10px] text-[#9BA8A3] truncate bg-[#171D1C] px-2.5 py-1.5 rounded border border-[#313D39] select-all">
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
        <div className="rounded-xl bg-[#222B28] border border-[#313D39] p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#313D39]">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#C6A56A]" />
              <h3 className="text-sm font-semibold text-[#EAE7DE]">
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
                  className="px-2.5 py-1 text-[11px] font-semibold bg-[#D96B6B] text-[#171D1C] rounded transition"
                >
                  Confirmar Limpeza
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClearWinners(false)}
                  className="px-2 py-1 text-[11px] text-[#9BA8A3] hover:text-[#EAE7DE]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClearWinners(true)}
                className="text-xs text-[#9BA8A3] hover:text-[#D96B6B] transition"
              >
                Limpar histórico
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {winners.map((w, index) => (
              <div
                key={w.id}
                className="p-2.5 rounded-lg bg-[#171D1C] border border-[#313D39] flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-1 rounded bg-[#2B3632] border border-[#C6A56A]/40 text-[#C6A56A] font-mono font-bold text-xs tabular-nums shrink-0">
                    #{w.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-[#EAE7DE] truncate">
                        {w.name}
                      </span>
                      {index === 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#6EAA90]/20 text-[#6EAA90] font-medium shrink-0">
                          Mais recente
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#9BA8A3] truncate tabular-nums">
                      {w.prize || 'Prêmio'} · {formatDateTime(w.drawnAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    title="Gerar Cartão VIP"
                    className="px-2 py-1 rounded bg-[#222B28] hover:bg-[#2B3632] text-[#C6A56A] border border-[#313D39] text-[11px] font-medium flex items-center gap-1 transition"
                  >
                    <Award className="w-3 h-3" />
                    <span className="hidden sm:inline">Cartão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveWinner(w.id)}
                    title="Remover registro"
                    className="p-1.5 text-[#9BA8A3] hover:text-[#D96B6B] rounded transition"
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
