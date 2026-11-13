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
  Lock,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Winner, Participant } from '../types';
import { TicketDisplay } from './TicketDisplay';
import { FortuneWheel } from './FortuneWheel';
import { formatDateTime } from '../utils/raffle';
import { resolveActivePrizeContext } from '../utils/traditionalDrawClient';
import { safeApiJson } from '../utils/apiConfig';
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
  isAuthenticated?: boolean;
  onOpenAccount?: () => void;
  syncStatus?: 'synced' | 'saving' | 'offline' | 'error';
  syncErrorMessage?: string | null;
  onRetrySync?: () => void;
  onVerifyLedger?: (commitmentHash: string) => Promise<{
    ok: boolean;
    valid?: boolean;
    terminalType?: string;
    error?: string;
  }>;
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
  isAuthenticated = false,
  onOpenAccount,
  syncStatus = 'synced',
  syncErrorMessage = null,
  onRetrySync,
  onVerifyLedger,
}) => {
  const [isConfirmingClearWinners, setIsConfirmingClearWinners] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedProof, setCopiedProof] = useState(false);
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [isExtrasOpen, setIsExtrasOpen] = useState(false);
  const [isProofOpen, setIsProofOpen] = useState(false);
  const [verifyingLedger, setVerifyingLedger] = useState(false);
  const [ledgerCheckResult, setLedgerCheckResult] = useState<{
    commitmentHash: string;
    ok: boolean;
    valid?: boolean;
    terminalType?: string;
    message: string;
  } | null>(null);

  const handleCopyHash = () => {
    if (!rosterHash) return;
    navigator.clipboard.writeText(rosterHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopyProofJson = (winner: Winner) => {
    if (!winner.proof) return;
    const payload = {
      winnerId: winner.id,
      winnerName: winner.name,
      ticketNumber: winner.number,
      prize: winner.prize,
      drawnAt: winner.drawnAt,
      proof: winner.proof,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedProof(true);
    setTimeout(() => setCopiedProof(false), 2000);
  };

  const handleVerifyLedgerProof = async (commitmentHash: string) => {
    if (!commitmentHash || verifyingLedger) return;
    setVerifyingLedger(true);
    try {
      const result = onVerifyLedger
        ? await onVerifyLedger(commitmentHash)
        : await (async () => {
            const res = await safeApiJson<any>(
              `/api/raffle/ledger/${encodeURIComponent(commitmentHash)}`
            );
            return {
              ok: Boolean(res.ok && res.data?.ok),
              valid: Boolean(res.data?.valid),
              terminalType: res.data?.terminalType,
              error: res.error || res.data?.message || res.data?.error,
            };
          })();

      if (result.ok && result.valid) {
        setLedgerCheckResult({
          commitmentHash,
          ok: true,
          valid: true,
          terminalType: result.terminalType,
          message: `Cadeia criptográfica validada no servidor (${result.terminalType || 'REVEALED'}).`,
        });
      } else {
        setLedgerCheckResult({
          commitmentHash,
          ok: false,
          valid: false,
          message: result.error || 'Não foi possível validar o ledger no momento.',
        });
      }
    } catch {
      setLedgerCheckResult({
        commitmentHash,
        ok: false,
        valid: false,
        message: 'Falha de comunicação ao consultar o ledger público.',
      });
    } finally {
      setVerifyingLedger(false);
    }
  };

  const eligibleCount = computed.eligibleTickets.length;
  const latestWinner = winners.length > 0 ? winners[0] : null;
  const drawMode = settings.drawMode || 'drum';

  const prizes = settings.prizes || [];
  const activePrizeContext = resolveActivePrizeContext(settings);
  const nextRankedPrize = activePrizeContext.rankedTier;
  const activePrizeLabel = activePrizeContext.prizeName;

  const canDraw = !isDrawing && eligibleCount > 0;

  return (
    <div className="space-y-6 min-w-0 pb-6">
      {/* Main Draw Mesa Card — Central Visual Protagonist */}
      <section
        aria-label="Mesa Oficial de Sorteio"
        className="relative overflow-hidden rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] p-6 sm:p-8 space-y-6 shadow-2xl"
      >
        {/* Subtle Radial Glow & Top Electric Accent Bar */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#0131CD]/10 rounded-full blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#0131CD]"
        />

        {/* 1. Header & Mode Selector (Globo Digital vs Roleta Visual) */}
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF] shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold text-[#FFFFFF] tracking-tight">
                  Mesa Oficial de Sorteio
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35">
                  <ShieldCheck className="w-3 h-3" />
                  CSPRNG Ativo
                </span>
              </div>
              <p className="text-xs text-[#A5B1C5] tabular-nums mt-0.5">
                <strong className="text-[#A6C957] font-semibold">{eligibleCount}</strong>{' '}
                {eligibleCount === 1 ? 'bilhete elegível' : 'bilhetes elegíveis'} · Regra de Conversão:{' '}
                <strong className="text-[#FFFFFF] font-semibold">{settings.rate} moedas = 1 bilhete</strong>
              </p>
            </div>
          </div>

          {/* Segmented Mode Switcher */}
          <div className="flex items-center bg-[#080D18] p-1 rounded-xl border border-[var(--gio-border-subtle)] self-start sm:self-auto shadow-inner">
            <button
              type="button"
              disabled={isDrawing}
              onClick={() => onUpdateSettings({ drawMode: 'drum' })}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50 ${
                drawMode === 'drum'
                  ? 'bg-[#0131CD] text-[#FFFFFF] shadow-md'
                  : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
              }`}
            >
              <TicketIcon className="w-4 h-4" />
              <span>Globo Digital</span>
            </button>
            <button
              type="button"
              disabled={isDrawing}
              onClick={() => onUpdateSettings({ drawMode: 'wheel' })}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all disabled:opacity-50 ${
                drawMode === 'wheel'
                  ? 'bg-[#0131CD] text-[#FFFFFF] shadow-md'
                  : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
              }`}
            >
              <Disc className="w-4 h-4" />
              <span>Roleta Visual</span>
            </button>
          </div>
        </div>

        {/* 1B. Readiness & Security Banner (Auth / Cloud Sync / Roster Hash) */}
        {!isAuthenticated ? (
          <div className="relative p-3.5 sm:p-4 rounded-xl bg-[#A6C957]/10 border border-[#A6C957]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-[#FFFFFF]">
              <Lock className="w-4 h-4 text-[#A6C957] shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-semibold text-[#A6C957]">Conta desconectada: </span>
                <span className="text-[#A5B1C5]">
                  O sorteio oficial exige sessão autenticada para gerar compromisso criptográfico (Provably Fair V2) e gravar no ledger do servidor.
                </span>
              </div>
            </div>
            {onOpenAccount && (
              <button
                type="button"
                onClick={onOpenAccount}
                className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Conectar Conta</span>
              </button>
            )}
          </div>
        ) : (syncStatus === 'error' || syncStatus === 'offline' || syncErrorMessage) ? (
          <div className="relative p-3.5 sm:p-4 rounded-xl bg-[#F05262]/10 border border-[#F05262]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 text-xs text-[#FFFFFF]">
              <AlertCircle className="w-4 h-4 text-[#F05262] shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-[#F05262]">
                  {syncStatus === 'offline' ? 'Servidor temporariamente inacessível: ' : 'Pendência de sincronização: '}
                </span>
                <span className="text-[#A5B1C5]">
                  {syncErrorMessage || 'Sincronize a lista de participantes com o servidor antes de iniciar o sorteio oficial.'}
                </span>
              </div>
            </div>
            {onRetrySync && (
              <button
                type="button"
                onClick={onRetrySync}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#0131CD] text-[#FFFFFF] border border-[var(--gio-border-subtle)] font-semibold text-xs flex items-center justify-center gap-1.5 shrink-0 transition"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#A6C957]" />
                <span>Sincronizar Lista</span>
              </button>
            )}
          </div>
        ) : (
          <div className="relative px-3.5 py-2.5 rounded-xl bg-[#080D18]/80 border border-white/[0.07] flex flex-wrap items-center justify-between gap-2 text-xs text-[#A5B1C5]">
            <span className="inline-flex items-center gap-1.5 text-[#A6C957] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Provably Fair V2 · Servidor Sincronizado</span>
            </span>
            {rosterHash && (
              <span className="truncate max-w-[240px] sm:max-w-xs" title={rosterHash}>
                Hash Lista: <code className="font-mono text-[11px] text-[#FFFFFF]">{rosterHash.slice(0, 14)}…</code>
              </span>
            )}
          </div>
        )}

        {/* 2. Prominent Prize Showcase Card */}
        <div className="relative p-4 sm:p-5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5 min-w-0">
            {settings.prizeImage ? (
              <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#A6C957]/40 shrink-0 bg-[#111B30]">
                <img
                  src={settings.prizeImage}
                  alt={activePrizeLabel}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center shrink-0 text-[#FFFFFF]">
                <Gift className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#A5B1C5]">
                  Prêmio em disputa nesta rodada
                </span>
                {nextRankedPrize && (
                  <span className="px-2 py-0.5 rounded bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 text-[11px] font-semibold tabular-nums">
                    #{nextRankedPrize.rank}º Lugar
                  </span>
                )}
              </div>
              <div className="text-base sm:text-lg font-bold text-[#FFFFFF] truncate mt-0.5 tracking-tight">
                {activePrizeLabel}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPrizeModalOpen(true)}
            className="gio-btn-secondary min-h-[38px] px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#A5B1C5]" />
            <span>Editar Prêmio</span>
          </button>
        </div>

        {/* 3. Main Draw Visualization Stage: Globo Digital or Roleta Visual */}
        {drawMode === 'drum' ? (
          <div className="space-y-5">
            <div className="p-4 sm:p-6 rounded-2xl bg-[#080D18]/80 border border-[var(--gio-border-subtle)]">
              <TicketDisplay
                displayNumber={currentDisplayNumber}
                isSpinning={isDrawing}
                winnerName={latestWinner ? latestWinner.name : null}
                winnerPrize={latestWinner ? latestWinner.prize : null}
                themeMode={settings.themeMode}
                isProofVerified={Boolean(latestWinner?.proof?.eventHash)}
              />
            </div>

            {/* High-Impact Primary Draw CTA Button */}
            <button
              type="button"
              disabled={!canDraw}
              onClick={onDraw}
              className={`w-full min-h-[58px] py-4 px-6 rounded-xl font-bold text-base sm:text-lg tracking-normal flex items-center justify-center gap-3 transition-all active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080D18] ${
                canDraw
                  ? 'bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] shadow-[0_8px_24px_rgba(1,49,205,0.3)] cursor-pointer'
                  : 'bg-[#080D18] text-[#A5B1C5]/60 border border-white/5 cursor-not-allowed opacity-60'
              }`}
            >
              {isDrawing ? (
                <>
                  <Sparkles className="w-5 h-5 animate-spin text-[#FFFFFF]" />
                  <span>Extraindo número contemplado...</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>Sortear Agora no Globo Digital</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="p-4 sm:p-6 rounded-2xl bg-[#080D18]/80 border border-[var(--gio-border-subtle)]">
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

        {/* 3.5. Official Winner Spotlight Card (Mesa Oficial de Sorteio) */}
        {latestWinner && !isDrawing && (
          <div
            data-testid="official-winner-spotlight"
            className="relative p-4 sm:p-5 rounded-2xl bg-[#080D18] border border-[#A6C957]/50 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-[#A6C957]/15 border border-[#A6C957]/40 flex flex-col items-center justify-center shrink-0 text-[#A6C957] shadow-inner">
                <span className="text-[10px] font-medium text-[#A6C957]/80">
                  Bilhete
                </span>
                <span className="text-base font-bold tabular-nums leading-none mt-0.5">
                  #{latestWinner.number}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 text-[11px] font-semibold">
                    <Trophy className="w-3 h-3" />
                    Vencedor Oficial Contemplado
                  </span>
                  {latestWinner.proof?.eventHash && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0131CD]/25 text-[#FFFFFF] border border-[#0131CD]/45 text-[11px] font-semibold">
                      <ShieldCheck className="w-3 h-3 text-[#A6C957]" />
                      Provably Fair V2 Auditado
                    </span>
                  )}
                </div>
                <div className="text-lg sm:text-xl font-bold text-[#FFFFFF] truncate mt-1">
                  {latestWinner.name}
                </div>
                <div className="text-xs text-[#A5B1C5] flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                  <span className="text-[#A6C957] font-semibold">{latestWinner.prize}</span>
                  <span className="text-[#A5B1C5]/40">•</span>
                  <span className="text-xs tabular-nums text-[#A5B1C5]">
                    {formatDateTime(latestWinner.drawnAt)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenCelebration(latestWinner)}
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#A6C957]/15 hover:bg-[#A6C957]/25 text-[#A6C957] border border-[#A6C957]/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Trophy className="w-4 h-4" />
                <span>Tela de Celebração</span>
              </button>
              {latestWinner.proof && (
                <button
                  type="button"
                  onClick={() => setIsProofOpen((prev) => !prev)}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#111B30] hover:bg-[#0131CD] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <ShieldCheck className="w-4 h-4 text-[#A6C957]" />
                  <span>
                    {isProofOpen ? 'Ocultar Prova Criptográfica' : 'Ver Prova Criptográfica'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {drawErrorMessage && (
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#F05262] bg-[#F05262]/10 border border-[#F05262]/30 rounded-xl p-4 animate-fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#F05262]" />
              <div className="leading-relaxed font-medium">{drawErrorMessage}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {(drawErrorMessage.includes('__cookie_check') ||
                drawErrorMessage.includes('cookies do Preview')) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') window.location.reload();
                    }}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-semibold text-xs flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Recarregar Página</span>
                  </button>
                  {typeof window !== 'undefined' && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#0131CD] text-[#FFFFFF] border border-[var(--gio-border-subtle)] font-semibold text-xs flex items-center gap-1.5 transition"
                    >
                      <span>Abrir em Nova Aba</span>
                    </a>
                  )}
                </>
              )}
              {!isAuthenticated && onOpenAccount && (
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Conectar Conta</span>
                </button>
              )}
              {isAuthenticated && onRetrySync && (
                <button
                  type="button"
                  onClick={onRetrySync}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#0131CD] text-[#FFFFFF] border border-[var(--gio-border-subtle)] font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>Ressincronizar</span>
                </button>
              )}
            </div>
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

        {/* 5. Collapsible Advanced Block: Recursos Extras da Mesa */}
        <div className="pt-2 border-t border-[var(--gio-border-subtle)]">
          <button
            type="button"
            onClick={() => setIsExtrasOpen((prev) => !prev)}
            aria-expanded={isExtrasOpen}
            className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] flex items-center justify-between text-xs font-semibold text-[#FFFFFF] transition-all"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#A5B1C5]" />
              <span>Recursos Extras da Mesa (Battle Royale, Fila de Prêmios e Hash SHA-256)</span>
            </span>
            {isExtrasOpen ? (
              <ChevronUp className="w-4 h-4 text-[#A5B1C5]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#A5B1C5]" />
            )}
          </button>

          {isExtrasOpen && (
            <div className="mt-3 p-5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[var(--gio-border-subtle)]">
                <label className="flex items-center gap-2.5 text-xs text-[#FFFFFF] cursor-pointer select-none font-medium">
                  <input
                    type="checkbox"
                    checked={settings.exclude}
                    onChange={(e) => onUpdateSettings({ exclude: e.target.checked })}
                    className="w-4 h-4 rounded border-[var(--gio-border-subtle)] bg-[#111B30] text-[#0131CD] focus:ring-2 focus:ring-[#A6C957] focus:ring-offset-1 focus:ring-offset-[#080D18]"
                  />
                  <span>Não repetir ganhador em sorteios seguidos</span>
                </label>

                <div className="flex items-center gap-2 text-xs text-[#A5B1C5]">
                  <span>Contagem regressiva:</span>
                  <select
                    value={settings.countdownSeconds ?? 10}
                    onChange={(e) =>
                      onUpdateSettings({ countdownSeconds: Number(e.target.value) })
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] tabular-nums focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/40"
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
                  className="p-3.5 rounded-xl bg-[#111B30] hover:border-[#0131CD]/50 disabled:opacity-40 disabled:cursor-not-allowed border border-[var(--gio-border-subtle)] text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center text-[#A6C957] shrink-0">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#FFFFFF]">Modo Eliminatória</div>
                    <div className="text-[11px] text-[#A5B1C5] truncate">
                      Battle Royale até restar 1 campeão
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenPrizeQueue}
                  className="p-3.5 rounded-xl bg-[#111B30] hover:border-[#0131CD]/50 border border-[var(--gio-border-subtle)] text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF] shrink-0">
                    <ListOrdered className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#FFFFFF]">
                      Fila de Prêmios ({prizes.length})
                    </div>
                    <div className="text-[11px] text-[#A5B1C5] truncate">
                      Configurar 1º, 2º e 3º lugares
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={eligibleCount === 0}
                  onClick={onOpenMonteCarlo}
                  className="p-3.5 rounded-xl bg-[#111B30] hover:border-[#0131CD]/50 disabled:opacity-40 disabled:cursor-not-allowed border border-[var(--gio-border-subtle)] text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF] shrink-0">
                    <BarChart2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#FFFFFF]">Simulação 10k</div>
                    <div className="text-[11px] text-[#A5B1C5] truncate">
                      Testar probabilidades (Monte Carlo)
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={onOpenAuditReport}
                  className="p-3.5 rounded-xl bg-[#111B30] hover:border-[#0131CD]/50 border border-[var(--gio-border-subtle)] text-left flex items-center gap-3 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF] shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#FFFFFF]">
                      Certificado e Laudo PDF
                    </div>
                    <div className="text-[11px] text-[#A5B1C5] truncate">
                      Relatório oficial com QR Code
                    </div>
                  </div>
                </button>
              </div>

              {/* SHA-256 Roster Integrity Hash (Verifiable Security) */}
              <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#A6C957]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Hash SHA-256 Verificável da Lista de Bilhetes</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyHash}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#0131CD] border border-[var(--gio-border-subtle)] text-[11px] font-medium text-[#FFFFFF] inline-flex items-center justify-center gap-1.5 transition-all shrink-0"
                  >
                    {copiedHash ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#A6C957]" />
                        <span className="text-[#A6C957]">Hash Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#A5B1C5]" />
                        <span>Copiar Hash</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="font-mono text-[11px] text-[#A5B1C5] truncate bg-[#111B30] px-3 py-2 rounded-lg border border-[var(--gio-border-subtle)] select-all">
                  {rosterHash || 'Calculando hash de integridade...'}
                </div>
              </div>

              <SettingsBackup
                compact
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
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--gio-border-subtle)]">
            <div className="flex items-center gap-2.5">
              <Trophy className="w-5 h-5 text-[#A6C957]" />
              <h3 className="text-base font-bold text-[#FFFFFF]">
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
                  className="min-h-[36px] px-3 py-1.5 text-xs font-semibold bg-[#F05262] text-[#FFFFFF] rounded-lg inline-flex items-center justify-center transition"
                >
                  Confirmar Limpeza
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClearWinners(false)}
                  className="min-h-[36px] px-3 py-1.5 text-xs text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] rounded-lg inline-flex items-center justify-center transition"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClearWinners(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs text-[#A5B1C5] hover:text-[#F05262] hover:bg-[#080D18] inline-flex items-center justify-center transition"
              >
                Limpar histórico
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {winners.map((w, index) => (
              <div
                key={w.id}
                className="p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="px-3 py-1 rounded-lg bg-[#111B30] border border-[#A6C957]/40 text-[#A6C957] font-bold text-sm tabular-nums shrink-0">
                    #{w.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#FFFFFF] truncate">{w.name}</span>
                      {index === 0 && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#A6C957]/15 text-[#A6C957] font-semibold border border-[#A6C957]/35 shrink-0">
                          Mais recente
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#A5B1C5] truncate tabular-nums mt-0.5">
                      {w.prize || 'Prêmio'} · {formatDateTime(w.drawnAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    title="Gerar Cartão VIP"
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#A6C957] text-[#A6C957] hover:text-[#080D18] border border-[#A6C957]/40 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cartão VIP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveWinner(w.id)}
                    title="Remover registro"
                    aria-label={`Remover registro de ${w.name}`}
                    className="min-w-[36px] min-h-[36px] p-2 text-[#A5B1C5] hover:text-[#F05262] hover:bg-[#111B30] rounded-lg inline-flex items-center justify-center transition"
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
