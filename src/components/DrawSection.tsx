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
  predeterminedWinningTicket?: { number: number; participantId: string; name: string } | null;
  drawErrorMessage?: string | null;
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
  predeterminedWinningTicket,
  drawErrorMessage,
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

  const prizes = settings.prizes || [];
  const nextRankedPrize = [...prizes]
    .sort((a, b) => a.rank - b.rank)
    .find((p) => !p.winnerId);

  const activePrizeLabel = nextRankedPrize
    ? nextRankedPrize.name
    : settings.prizeName || settings.currentPrize || 'Prêmio Principal';

  const canDraw = !isDrawing && eligibleCount > 0;

  return (
    <div className="space-y-6 min-w-0 pb-6">
      {/* Main Draw Mesa Card — Central Visual Protagonist */}
      <section
        aria-label="Mesa Oficial de Sorteio"
        className="relative overflow-hidden rounded-2xl bg-[#101F3D] border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl"
      >
        {/* Subtle Radial Glow & Top Electric Accent Bar */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#0866F5]/10 rounded-full blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#35B9F5]"
        />

        {/* 1. Header & Mode Selector (Globo Digital vs Roleta Visual) */}
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0866F5]/15 border border-[#00A9FF]/30 flex items-center justify-center text-[#00A9FF] shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Mesa Oficial de Sorteio
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-[10px] font-bold uppercase bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30">
                  <ShieldCheck className="w-3 h-3" />
                  CSPRNG ATIVO
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                <strong className="text-[#00A9FF] font-bold">{eligibleCount}</strong>{' '}
                {eligibleCount === 1 ? 'bilhete elegível' : 'bilhetes elegíveis'} · Regra de Conversão:{' '}
                <strong className="text-white">{settings.rate} moedas = 1 bilhete</strong>
              </p>
            </div>
          </div>

          {/* Segmented Mode Switcher */}
          <div className="flex items-center bg-[#081226] p-1 rounded-xl border border-white/10 self-start sm:self-auto shadow-inner">
            <button
              type="button"
              onClick={() => onUpdateSettings({ drawMode: 'drum' })}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                drawMode === 'drum'
                  ? 'bg-[#0866F5] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TicketIcon className="w-4 h-4" />
              <span>Globo Digital</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ drawMode: 'wheel' })}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                drawMode === 'wheel'
                  ? 'bg-[#0866F5] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Disc className="w-4 h-4" />
              <span>Roleta Visual</span>
            </button>
          </div>
        </div>

        {/* 2. Prominent Prize Showcase Card */}
        <div className="relative p-4 sm:p-5 rounded-xl bg-[#081226] border border-white/10 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5 min-w-0">
            {settings.prizeImage ? (
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#F5B942]/40 shrink-0 bg-[#101F3D]">
                <img
                  src={settings.prizeImage}
                  alt={activePrizeLabel}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#F5B942]/15 border border-[#F5B942]/30 flex items-center justify-center shrink-0 text-[#F5B942]">
                <Gift className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Prêmio em Disputa Nesta Rodada
                </span>
                {nextRankedPrize && (
                  <span className="px-2 py-0.5 rounded bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/30 text-[10px] font-mono font-bold tabular-nums">
                    #{nextRankedPrize.rank}º Lugar
                  </span>
                )}
              </div>
              <div className="text-base sm:text-lg font-extrabold text-[#F5B942] truncate mt-0.5 tracking-tight">
                {activePrizeLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPrizeModalOpen(true)}
            className="gio-btn-secondary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#00A9FF]" />
            <span>Editar Prêmio</span>
          </button>
        </div>

        {/* 3. Main Draw Visualization Stage: Globo Digital or Roleta Visual */}
        {drawMode === 'drum' ? (
          <div className="space-y-5">
            <div className="p-4 sm:p-6 rounded-2xl bg-[#081226]/80 border border-white/10">
              <TicketDisplay
                displayNumber={currentDisplayNumber}
                isSpinning={isDrawing}
                winnerName={latestWinner ? latestWinner.name : null}
                winnerPrize={latestWinner ? latestWinner.prize : null}
                themeMode={settings.themeMode}
              />
            </div>

            {/* High-Impact Primary Draw CTA Button */}
            <button
              type="button"
              disabled={!canDraw}
              onClick={onDraw}
              className={`w-full min-h-[58px] py-4 px-6 rounded-xl font-extrabold text-base sm:text-lg tracking-wide flex items-center justify-center gap-3 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF] ${
                canDraw
                  ? 'bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#0866F5] hover:brightness-110 text-white shadow-xl shadow-blue-600/30 cursor-pointer'
                  : 'bg-[#081226] text-slate-500 border border-white/5 cursor-not-allowed opacity-60'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-5 h-5 animate-spin text-white" />
                  <span className="tracking-wider font-mono">EXTRAINDO NÚMERO CONTEMPLADO...</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>SORTEAR AGORA NO GLOBO DIGITAL</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="p-4 sm:p-6 rounded-2xl bg-[#081226]/80 border border-white/10">
            <FortuneWheel
              computed={computed}
              isDrawing={isDrawing}
              onSpinStart={() => {}}
              onSpinEnd={onWheelSpinEnd}
              latestWinner={latestWinner}
              onRequestSpin={onRequestWheelSpin}
              spinSignal={wheelSpinSignal}
              predeterminedWinningTicket={predeterminedWinningTicket}
            />
          </div>
        )}

        {drawErrorMessage && (
          <div className="flex items-start gap-3 text-xs text-[#F05262] bg-[#F05262]/10 border border-[#F05262]/30 rounded-xl p-4 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F05262]" />
            <div className="leading-relaxed font-medium">{drawErrorMessage}</div>
          </div>
        )}

        {/* Eligibility Alert when no eligible tickets exist */}
        {eligibleCount === 0 && (
          <div className="flex items-start gap-3 text-xs text-[#F05262] bg-[#F05262]/10 border border-[#F05262]/30 rounded-xl p-4 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F05262]" />
            <div className="leading-relaxed">
              {computed.usedCount === 0
                ? `Nenhum bilhete elegível emitido no momento. Adicione participantes com pelo menos ${settings.rate} moedas na lista ao lado para liberar o sorteio.`
                : 'Todos os participantes com bilhetes já foram premiados nesta série! Desmarque a opção "Não repetir ganhador" nos recursos extras abaixo ou limpe o histórico para nova rodada.'}
            </div>
          </div>
        )}

        {/* 4. Winner Spotlight & Verification Bar in Ouro Nobre */}
        {latestWinner && !isDrawing && (
          <div className="p-5 rounded-xl bg-[#081226] border border-[#F5B942]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in shadow-xl">
            <div className="min-w-0">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#F5B942] block">
                Último Ganhador Contemplado
              </span>
              <div className="text-base sm:text-lg font-bold text-white truncate font-mono tabular-nums mt-0.5">
                <span className="text-[#F5B942]">#{latestWinner.number}</span> ·{' '}
                <span className="font-sans font-extrabold text-white">{latestWinner.name}</span>
              </div>
              {latestWinner.proof && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                  <span className="px-1.5 py-0.5 rounded bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30 font-bold">
                    PROVABLY FAIR V2 (BACKEND AUTORITATIVO)
                  </span>
                  <span title={latestWinner.proof.commitmentHash}>
                    C_server: {latestWinner.proof.commitmentHash.slice(0, 12)}…
                  </span>
                  <span title={latestWinner.proof.eventHash}>
                    Ledger H1: {latestWinner.proof.eventHash.slice(0, 12)}…
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenCelebration(latestWinner)}
                className="gio-btn-secondary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
                title="Abrir tela cheia de celebração para telão ou live"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#00A9FF]" />
                <span>Telão</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenVictoryCard(latestWinner)}
                className="px-3.5 py-2 rounded-xl bg-[#F5B942] hover:bg-[#E5A932] text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-[0.98]"
                title="Gerar Cartão VIP para redes sociais"
              >
                <Award className="w-4 h-4" />
                <span>Cartão VIP</span>
              </button>
              <button
                type="button"
                onClick={onOpenAuditReport}
                className="gio-btn-secondary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 text-[#00A9FF] border-[#00A9FF]/30 hover:border-[#00A9FF]"
                title="Emitir laudo PDF oficial auditado"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Certificado PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* 5. Collapsible Advanced Block: Recursos Extras da Mesa */}
        <div className="pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={() => setIsExtrasOpen((prev) => !prev)}
            aria-expanded={isExtrasOpen}
            className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#081226] hover:bg-[#0B1730] border border-white/10 flex items-center justify-between text-xs font-semibold text-white transition-all"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#00A9FF]" />
              <span>Recursos Extras da Mesa (Battle Royale, Fila de Prêmios e Hash SHA-256)</span>
            </span>
            {isExtrasOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isExtrasOpen && (
            <div className="mt-3 p-5 rounded-xl bg-[#081226] border border-white/10 space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/[0.08]">
                <label className="flex items-center gap-2.5 text-xs text-white cursor-pointer select-none font-medium">
                  <input
                    type="checkbox"
                    checked={settings.exclude}
                    onChange={(e) => onUpdateSettings({ exclude: e.target.checked })}
                    className="w-4 h-4 rounded border-white/20 bg-[#101F3D] text-[#0866F5] focus:ring-[#00A9FF]"
                  />
                  <span>Não repetir ganhador em sorteios seguidos</span>
                </label>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Contagem regressiva:</span>
                  <select
                    value={settings.countdownSeconds ?? 10}
                    onChange={(e) =>
                      onUpdateSettings({ countdownSeconds: Number(e.target.value) })
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#101F3D] border border-white/10 text-xs text-white font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-[#00A9FF]"
                  >
                    <option value={0}>Desativada (0s)</option>
                    <option value={3}>3 segundos</option>
                    <option value={5}>5 segundos</option>
                    <option value={10}>10 segundos</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={eligibleCount < 2}
                  onClick={onOpenBattleRoyale}
                  className="p-3.5 rounded-xl bg-[#101F3D] hover:bg-[#14274E] disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#F5B942]/15 border border-[#F5B942]/30 flex items-center justify-center text-[#F5B942] shrink-0">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Modo Eliminatória</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Battle Royale até restar 1 campeão
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenPrizeQueue}
                  className="p-3.5 rounded-xl bg-[#101F3D] hover:bg-[#14274E] border border-white/10 text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#00A9FF]/15 border border-[#00A9FF]/30 flex items-center justify-center text-[#00A9FF] shrink-0">
                    <ListOrdered className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">
                      Fila de Prêmios ({prizes.length})
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Configurar 1º, 2º e 3º lugares
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={eligibleCount === 0}
                  onClick={onOpenMonteCarlo}
                  className="p-3.5 rounded-xl bg-[#101F3D] hover:bg-[#14274E] disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#00A9FF]/15 border border-[#00A9FF]/30 flex items-center justify-center text-[#00A9FF] shrink-0">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Simulação 10k</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Testar probabilidades (Monte Carlo)
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenAuditReport}
                  className="p-3.5 rounded-xl bg-[#101F3D] hover:bg-[#14274E] border border-white/10 text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#F5B942]/15 border border-[#F5B942]/30 flex items-center justify-center text-[#F5B942] shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">
                      Certificado e Laudo PDF
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Relatório oficial com QR Code
                    </div>
                  </div>
                </button>
              </div>

              {/* SHA-256 Roster Integrity Hash (Verifiable Security) */}
              <div className="p-3.5 rounded-xl bg-[#081226] border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#20C997]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Hash SHA-256 Verificável da Lista de Bilhetes</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="px-2.5 py-1 rounded-lg bg-[#101F3D] hover:bg-[#182943] border border-white/10 text-[11px] font-medium text-white flex items-center gap-1.5 transition-all"
                  >
                    {copiedHash ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#20C997]" />
                        <span className="text-[#20C997]">Hash Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Copiar Hash</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-[11px] text-slate-400 truncate bg-[#050D20] px-3 py-2 rounded-lg border border-white/5 select-all">
                  {rosterHash || 'Calculando hash de integridade...'}
                </div>
              </div>

              <SettingsBackup
                settings={settings}
                participants={participants}
                winners={winners}
                computed={computed}
                onUpdateSettings={onUpdateSettings}
                onOpenAuditReport={onOpenAuditReport}
                rosterHash={rosterHash}
                onRestoreState={onRestoreState || (() => {})}
                onResetToSample={onResetToSample || (() => {})}
                onResetCoinsOnly={onResetCoinsOnly || (() => {})}
              />
            </div>
          )}
        </div>
      </section>

      {/* Recent Winners History Table below Mesa */}
      {winners.length > 0 && (
        <section aria-label="Histórico de Ganhadores" className="gio-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-5 h-5 text-[#F5B942]" />
              <h3 className="text-base font-bold text-white">
                Ganhadores Desta Sessão ({winners.length})
              </h3>
            </div>

            {isConfirmingClearWinners ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClearWinners();
                    setIsConfirmingClearWinners(false);
                  }}
                  className="px-3 py-1 text-xs font-semibold bg-[#F05262] text-white rounded-lg transition"
                >
                  Confirmar Limpeza
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClearWinners(false)}
                  className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClearWinners(true)}
                className="text-xs text-slate-400 hover:text-[#F05262] transition"
              >
                Limpar histórico
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {winners.map((w, index) => (
              <div
                key={w.id}
                className="p-3 rounded-xl bg-[#081226] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="px-3 py-1 rounded-lg bg-[#101F3D] border border-[#F5B942]/40 text-[#F5B942] font-mono font-bold text-sm tabular-nums shrink-0">
                    #{w.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white truncate">{w.name}</span>
                      {index === 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#20C997]/15 text-[#20C997] font-semibold border border-[#20C997]/30 shrink-0">
                          Mais recente
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate tabular-nums mt-0.5">
                      {w.prize || 'Prêmio'} · {formatDateTime(w.drawnAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    title="Gerar Cartão VIP"
                    className="px-3 py-1.5 rounded-lg bg-[#101F3D] hover:bg-[#14274E] text-[#F5B942] border border-[#F5B942]/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cartão VIP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveWinner(w.id)}
                    title="Remover registro"
                    className="p-1.5 text-slate-400 hover:text-[#F05262] rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
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
