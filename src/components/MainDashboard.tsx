import React from 'react';
import {
  Plus,
  Trophy,
  Users,
  Ticket,
  Clock,
  Radio,
  Crown,
  Lock,
  MessageSquare,
  Search,
  ArrowRight,
  Sparkles,
  Compass,
  Gift,
  Coins,
  ShieldCheck,
  Play,
  TrendingUp,
} from 'lucide-react';
import {
  Participant,
  RaffleSettings,
  Winner,
  ComputedRaffle,
  ProPlanEntitlement,
  TikTokLiveSession,
} from '../types';
import { formatDateTime, INITIAL_SAMPLE_PARTICIPANTS } from '../utils/raffle';
import { mapTikTokConnectionState } from '../utils/tiktokStatusMapper';

export type RaffleDataSourceKind = 'DEMO' | 'LOCAL' | 'PERSISTED';

export interface DashboardKpiSummary {
  traditionalTicketsIssued: number;
  traditionalEligibleTickets: number;
  traditionalParticipantsCount: number;
  traditionalParticipantsWithTicketsCount: number;
  traditionalWinnersCount: number;
  authorizedLiveSessions: TikTokLiveSession[];
  liveSessionsCount: number;
  liveTicketsTotal: number;
  liveSupportersTotal: number;
  liveCoinsTotal: number;
  dataSourceKind: RaffleDataSourceKind;
  dataSourceLabel: string;
}

export function isDefaultDemoRoster(
  participants: Participant[],
  winners: Winner[] = []
): boolean {
  if (winners.length > 0) return false;
  if (participants.length !== INITIAL_SAMPLE_PARTICIPANTS.length) return false;
  return INITIAL_SAMPLE_PARTICIPANTS.every((sample, idx) => {
    const p = participants[idx];
    return Boolean(p && p.id === sample.id && p.name === sample.name && p.coins === sample.coins);
  });
}

export function computeDashboardKpiSummary(params: {
  participants: Participant[];
  winners: Winner[];
  computed: ComputedRaffle;
  liveSessions: TikTokLiveSession[];
  currentOwnerUid?: string | null;
  syncStatus?: 'synced' | 'saving' | 'offline' | 'error';
}): DashboardKpiSummary {
  const {
    participants,
    winners,
    computed,
    liveSessions,
    currentOwnerUid,
    syncStatus = 'synced',
  } = params;

  const cleanOwnerUid = currentOwnerUid ? String(currentOwnerUid).trim() : '';

  // Strictly isolate LIVE sessions to the authenticated owner and exclude demo/unowned records
  const authorizedLiveSessions = cleanOwnerUid
    ? (liveSessions || []).filter((s) => {
        if (!s || !s.ownerUid || String(s.ownerUid).trim() !== cleanOwnerUid) {
          return false;
        }
        if ((s as unknown as { isDemo?: boolean }).isDemo === true) {
          return false;
        }
        return true;
      })
    : [];

  const liveTicketsTotal = authorizedLiveSessions.reduce(
    (acc, s) => acc + (s.currentTicketCounter || 0),
    0
  );
  const liveSupportersTotal = authorizedLiveSessions.reduce(
    (acc, s) => acc + (s.uniqueSupportersCount || 0),
    0
  );
  const liveCoinsTotal = authorizedLiveSessions.reduce(
    (acc, s) => acc + (s.totalCoins || 0),
    0
  );

  // Traditional Raffle KPIs represent EXCLUSIVELY the active traditional raffle (100% parity with Participantes, Central de Sorteios, and Relatórios)
  const traditionalTicketsIssued = computed.usedCount;
  const traditionalEligibleTickets = computed.eligibleTickets.length;
  const traditionalParticipantsCount = participants.length;
  const traditionalParticipantsWithTicketsCount = computed.allocations.filter(
    (a) => a.tickets.length > 0
  ).length;
  const traditionalWinnersCount = winners.length;

  let dataSourceKind: RaffleDataSourceKind = 'LOCAL';
  let dataSourceLabel = 'Dados Locais (Navegador)';

  if (!cleanOwnerUid && isDefaultDemoRoster(participants, winners)) {
    dataSourceKind = 'DEMO';
    dataSourceLabel = 'Dados de Demonstração';
  } else if (cleanOwnerUid && syncStatus === 'synced') {
    dataSourceKind = 'PERSISTED';
    dataSourceLabel = 'Dados Persistidos (Sincronizados)';
  }

  return {
    traditionalTicketsIssued,
    traditionalEligibleTickets,
    traditionalParticipantsCount,
    traditionalParticipantsWithTicketsCount,
    traditionalWinnersCount,
    authorizedLiveSessions,
    liveSessionsCount: authorizedLiveSessions.length,
    liveTicketsTotal,
    liveSupportersTotal,
    liveCoinsTotal,
    dataSourceKind,
    dataSourceLabel,
  };
}

interface MainDashboardProps {
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  computed: ComputedRaffle;
  entitlement: ProPlanEntitlement;
  liveSessions: TikTokLiveSession[];
  liveConnectionState: string;
  liveConnectedUsername?: string;
  currentOwnerUid?: string | null;
  syncStatus?: 'synced' | 'saving' | 'offline' | 'error';
  onStartNewRaffleWizard: () => void;
  onOpenTraditionalDraw: () => void;
  onOpenCommentsSorter: () => void;
  onOpenLivePro: (subTab?: 'feed' | 'motor1' | 'motor2' | 'audit' | 'monitor') => void;
  onOpenParticipants: () => void;
  onOpenReports: () => void;
  onOpenSubscription: () => void;
  onOpenOnboardingTour: () => void;
  onOpenVictoryCard: (winner: Winner) => void;
}

export const ProFeatureBadge: React.FC<{ isPro: boolean }> = ({ isPro }) => (
  <span
    data-testid="comments-sorter-pro-badge"
    className="gio-badge-pro inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 text-[11px] font-semibold tracking-wide"
  >
    {isPro ? (
      <Crown className="w-3 h-3 text-[#A6C957] shrink-0" />
    ) : (
      <Lock className="w-3 h-3 text-[#A6C957] shrink-0" />
    )}
    <span className="text-[#A6C957]">PRO</span>
  </span>
);

export const MainDashboard: React.FC<MainDashboardProps> = ({
  settings,
  participants,
  winners,
  computed,
  entitlement,
  liveSessions,
  liveConnectionState,
  liveConnectedUsername,
  currentOwnerUid,
  syncStatus = 'synced',
  onStartNewRaffleWizard,
  onOpenTraditionalDraw,
  onOpenCommentsSorter,
  onOpenLivePro,
  onOpenParticipants,
  onOpenReports,
  onOpenSubscription,
  onOpenOnboardingTour,
  onOpenVictoryCard,
}) => {
  const isPro = entitlement.active && entitlement.tier === 'PRO';
  const isFreeUser = !isPro;

  const handleCommentsSorterAccess = () => {
    if (isFreeUser) {
      onOpenSubscription();
      return;
    }
    onOpenCommentsSorter();
  };

  const cleanLiveUsername = (liveConnectedUsername || '').replace(/^@+/, '');
  const connMeta = mapTikTokConnectionState(liveConnectionState, false, cleanLiveUsername);

  const liveDashboardStatusText =
    connMeta.state === 'CONNECTED' && cleanLiveUsername
      ? `${connMeta.label} (@${cleanLiveUsername})`
      : connMeta.label;

  const liveDashboardActionText =
    liveConnectionState === 'CONNECTED'
      ? 'Acompanhar presentes ao vivo'
      : liveConnectionState === 'CONNECTING' || liveConnectionState === 'RECONNECTING'
      ? 'Acompanhar conexão da LIVE'
      : liveConnectionState === 'ERROR'
      ? 'Verificar conexão da LIVE'
      : 'Conectar transmissão agora';

  const kpiSummary = computeDashboardKpiSummary({
    participants,
    winners,
    computed,
    liveSessions,
    currentOwnerUid,
    syncStatus,
  });

  const {
    traditionalTicketsIssued: totalTicketsIssued,
    traditionalEligibleTickets,
    traditionalParticipantsCount: totalParticipantsCount,
    traditionalParticipantsWithTicketsCount,
    traditionalWinnersCount,
    authorizedLiveSessions,
    liveTicketsTotal,
    liveSupportersTotal,
    dataSourceKind,
    dataSourceLabel,
  } = kpiSummary;

  const currentPrize = settings.prizeName || settings.currentPrize || 'Prêmio Principal';
  const raffleTitle = settings.raffleTitle || 'Sorteio Oficial GIO DA SORTE';
  const raffleCode = settings.raffleCode || 'GIO-7492';

  return (
    <div className="space-y-8 animate-fade-in min-w-0 pb-6">
      {/* 1. Hero Operational Console — Identidade Oficial GIO DA SORTE */}
      <section
        aria-label="Console Operacional Principal"
        className="relative overflow-hidden rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-2xl animate-slide-up-fade"
      >
        {/* Top Hairline Accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[#0131CD]"
        />

        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3.5 max-w-2xl min-w-0">
            {/* Context & Tag */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0131CD]/25 border border-[#0131CD]/45 text-[11px] font-semibold text-[#FFFFFF]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#A6C957]" />
                Painel Operacional · CSPRNG Ativo
              </span>
              <span
                data-testid="dashboard-data-source-badge"
                data-source-kind={dataSourceKind}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                  dataSourceKind === 'PERSISTED'
                    ? 'bg-[#A6C957]/15 border-[#A6C957]/35 text-[#A6C957]'
                    : dataSourceKind === 'DEMO'
                    ? 'bg-[#0131CD]/20 border-[#0131CD]/40 text-[#FFFFFF]'
                    : 'bg-white/[0.06] border-white/15 text-[#A5B1C5]'
                }`}
              >
                <span>{dataSourceLabel}</span>
              </span>
              <span className="font-mono text-xs text-[#A5B1C5] font-medium tabular-nums">
                #{raffleCode}
              </span>
              <button
                type="button"
                onClick={onOpenOnboardingTour}
                className="min-h-[36px] px-3 py-1.5 rounded-md bg-[#080D18] hover:bg-white/[0.06] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] font-medium inline-flex items-center gap-1.5 transition-all btn-tactile"
              >
                <Compass className="w-3.5 h-3.5 shrink-0 text-[#A5B1C5]" />
                <span>Tutorial rápido</span>
              </button>
            </div>

            {/* Main Title */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#FFFFFF] tracking-tight leading-tight">
                Controle de Sorteios & Transmissões
              </h1>
              <p className="text-sm text-[#A5B1C5] mt-1 leading-relaxed">
                Gerencie participantes, conecte lives do TikTok e realize sorteios auditáveis com integridade matemática.
              </p>
            </div>

            {/* Active Draw Metadata Strip */}
            <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#A5B1C5]">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#A5B1C5] shrink-0" />
                <span>Sorteio ativo:</span>
                <strong className="text-[#FFFFFF] font-semibold">{raffleTitle}</strong>
              </div>
              <span className="hidden sm:inline text-[#A5B1C5]/40">•</span>
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#A6C957] shrink-0" />
                <span>Prêmio em disputa:</span>
                <strong className="text-[#A6C957] font-semibold">{currentPrize}</strong>
              </div>
              <span className="hidden sm:inline text-[#A5B1C5]/40">•</span>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#A5B1C5] shrink-0" />
                <span>Taxa de conversão:</span>
                <strong className="text-[#FFFFFF] tabular-nums font-medium">
                  {settings.rate} moedas = 1 bilhete
                </strong>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenTraditionalDraw}
              className="gio-btn-primary btn-tactile inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-[#FFFFFF] rounded-xl"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>Abrir Mesa de Sorteio</span>
            </button>

            <button
              type="button"
              onClick={onStartNewRaffleWizard}
              className="btn-tactile inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#FFFFFF] bg-[#080D18] hover:bg-white/[0.08] rounded-xl border border-[var(--gio-border-subtle)]"
            >
              <Plus className="w-4 h-4 text-[#A5B1C5] shrink-0" />
              <span>Criar Novo Sorteio</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Structured Operational KPIs — Hierarquia e Clareza Visual */}
      <section aria-label="Indicadores Operacionais Chave" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-[#A5B1C5]">
            Métricas do Sorteio Tradicional Ativo ({dataSourceLabel})
          </h2>
          <span className="text-xs text-[#A5B1C5] tabular-nums">
            {formatDateTime(Date.now())}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Bilhetes Emitidos do Sorteio Tradicional Ativo */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-1">
            <div className="flex items-center justify-between text-[#A5B1C5]">
              <span className="text-xs font-medium text-[#A5B1C5]">
                Bilhetes Emitidos
              </span>
              <Ticket className="w-4 h-4 text-[#A6C957]" />
            </div>
            <div>
              <div
                data-testid="kpi-traditional-tickets"
                className="text-3xl font-bold text-[#FFFFFF] tabular-nums tracking-tight"
              >
                {totalTicketsIssued.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
                {traditionalEligibleTickets} elegíveis · {traditionalWinnersCount} sorteados
              </p>
            </div>
          </div>

          {/* KPI 2: Total de Participantes do Sorteio Tradicional Ativo */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-2">
            <div className="flex items-center justify-between text-[#A5B1C5]">
              <span className="text-xs font-medium text-[#A5B1C5]">
                Participantes
              </span>
              <Users className="w-4 h-4 text-[#FFFFFF]" />
            </div>
            <div>
              <div
                data-testid="kpi-traditional-participants"
                className="text-3xl font-bold text-[#FFFFFF] tabular-nums tracking-tight"
              >
                {totalParticipantsCount.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
                {traditionalParticipantsWithTicketsCount} com bilhetes · {dataSourceLabel}
              </p>
            </div>
          </div>

          {/* KPI 3: Status TikTok LIVE */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-3">
            <div className="flex items-center justify-between text-[#A5B1C5]">
              <span className="text-xs font-medium text-[#A5B1C5]">
                TikTok LIVE
              </span>
              <Radio
                className={`w-4 h-4 ${
                  liveConnectionState === 'CONNECTED' ? 'text-[#A6C957]' : 'text-[#A5B1C5]'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    liveConnectionState === 'CONNECTED'
                      ? 'bg-[#A6C957] animate-pulse'
                      : liveConnectionState === 'CONNECTING' ||
                        liveConnectionState === 'RECONNECTING'
                      ? 'bg-[#0131CD] animate-pulse'
                      : liveConnectionState === 'ERROR'
                      ? 'bg-[#F05262]'
                      : 'bg-[#A5B1C5]'
                  }`}
                />
                <span className="text-base font-bold text-[#FFFFFF] truncate">
                  {liveDashboardStatusText}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenLivePro('feed')}
                className="btn-tactile min-h-[36px] px-2.5 py-1.5 -ml-2.5 rounded-lg text-xs font-semibold text-[#A6C957] hover:text-[#B5D477] hover:bg-[#080D18]/60 inline-flex items-center gap-1 mt-1 transition-colors"
              >
                <span>{liveDashboardActionText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KPI 4: Plano e Assinatura */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-4">
            <div className="flex items-center justify-between text-[#A5B1C5]">
              <span className="text-xs font-medium text-[#A5B1C5]">
                Seu Plano
              </span>
              <Crown className={`w-4 h-4 ${isPro ? 'text-[#A6C957]' : 'text-[#FFFFFF]'}`} />
            </div>
            <div>
              <div className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                {isPro ? (
                  <span className="text-[#A6C957]">Plano PRO Ativo</span>
                ) : (
                  <span className="text-[#FFFFFF]">Plano Gratuito (FREE)</span>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenSubscription}
                className="btn-tactile min-h-[36px] px-2.5 py-1.5 -ml-2.5 rounded-lg text-xs font-semibold text-[#FFFFFF] hover:text-[#A6C957] hover:bg-[#080D18]/60 inline-flex items-center gap-1 mt-1 transition-colors"
              >
                <span>{isPro ? 'Gerenciar assinatura' : 'Testar PRO por 3 dias grátis'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Módulos e Ferramentas Principais — 4 Modos Operacionais Bem Resolvidos */}
      <section aria-label="Ferramentas Operacionais" className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#FFFFFF] tracking-tight">
            Modalidades de Sorteio & Ferramentas
          </h2>
          <p className="text-xs text-[#A5B1C5] mt-0.5">
            Selecione o motor de sorteio mais apropriado para sua transmissão ou evento.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Mesa de Sorteio Oficial */}
          <div
            onClick={onOpenTraditionalDraw}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-[var(--gio-border-subtle)] hover:border-[#0131CD]/70"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenTraditionalDraw();
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="gio-badge-free">Gratuito</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors">
                  Mesa de Sorteio Oficial
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Globo Digital, Roleta Proporcional e Battle Royale com validação criptográfica SHA-256.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] inline-flex items-center gap-1 transition-colors">
                <span>Abrir mesa</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                {computed.eligibleTickets.length} elegíveis
              </span>
            </div>
          </div>

          {/* Card 2: TikTok LIVE PRO */}
          <div
            onClick={() => onOpenLivePro('feed')}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-[var(--gio-border-subtle)] hover:border-[#0131CD]/70"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenLivePro('feed');
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center text-[#A6C957]">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="gio-badge-pro">
                  {isPro ? <Crown className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>PRO</span>
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors">
                  Sorteio por Presentes LIVE
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Conecte sua transmissão, capture presentes ao vivo e converta moedas em bilhetes imediatos.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#A6C957] inline-flex items-center gap-1">
                <span>Painel da LIVE</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                {authorizedLiveSessions.length} sessões
              </span>
            </div>
          </div>

          {/* Card 3: Sorteador de Comentários PRO (Preservando ID & Data Attributes) */}
          <div
            id="comments-sorter-card"
            onClick={handleCommentsSorterAccess}
            data-pro-exclusive="true"
            data-pro-locked={isFreeUser}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-[var(--gio-border-subtle)] hover:border-[#0131CD]/70"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleCommentsSorterAccess();
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <ProFeatureBadge isPro={isPro} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors">
                  Sorteador de Comentários
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Filtre por palavras-chave, @arrobas e selecione vencedores com transparência total.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#A6C957] inline-flex items-center gap-1">
                <span>{isPro ? 'Abrir sorteador' : 'Desbloquear no PRO'}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="text-[11px] text-[#A5B1C5]">
                PRO Exclusivo
              </span>
            </div>
          </div>

          {/* Card 4: Participantes & Consulta */}
          <div
            onClick={onOpenParticipants}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-[var(--gio-border-subtle)] hover:border-[#0131CD]/70"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenParticipants();
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                  <Search className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-[#A5B1C5] tabular-nums">
                  {participants.length} inscritos
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors">
                  Participantes & Cotas
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Cadastre participantes, importe arquivos CSV e consulte bilhetes em segundos.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] inline-flex items-center gap-1 transition-colors">
                <span>Gerenciar cotas</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="text-[11px] text-[#A5B1C5]">
                CSV & Manual
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Histórico Recente — Ganhadores Registrados e Sessões de LIVE */}
      <section
        aria-label="Atividades Recentes e Auditoria"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* Left (7 cols): Ganhadores Oficiais */}
        <div className="lg:col-span-7 gio-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center text-[#A6C957]">
                <Trophy className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#FFFFFF]">
                Últimos Ganhadores Registrados
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenReports}
              className="btn-tactile min-h-[36px] px-2.5 py-1.5 rounded-lg inline-flex items-center text-xs font-semibold text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18]/60 transition-colors"
            >
              Ver relatórios completos &rarr;
            </button>
          </div>

          {winners.length === 0 ? (
            <div className="py-8 px-6 rounded-xl bg-[#080D18] border border-white/5 text-center space-y-2">
              <p className="text-sm font-semibold text-[#FFFFFF]">
                Nenhum ganhador registrado na sessão atual
              </p>
              <p className="text-xs text-[#A5B1C5] max-w-md mx-auto">
                Abra a Mesa de Sorteio acima para realizar o primeiro sorteio auditado e emitir o certificado.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {winners.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl bg-[#080D18] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="px-3 py-1 rounded-lg bg-[#111B30] border border-[#A6C957]/35 font-semibold text-[#A6C957] tabular-nums shrink-0 text-sm">
                      #{w.number}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-[#FFFFFF] text-sm truncate">{w.name}</div>
                      <div className="text-xs text-[#A5B1C5] truncate tabular-nums mt-0.5">
                        {w.prize} · {formatDateTime(w.drawnAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#0131CD] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-all"
                  >
                    Cartão VIP
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right (5 cols): Transmissões TikTok LIVE (Seção Própria Isolada por UID) */}
        <div
          data-testid="dashboard-live-sessions-section"
          className="lg:col-span-5 gio-card p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF]">
                  Transmissões TikTok LIVE
                </h3>
                <p className="text-[11px] text-[#A5B1C5] tabular-nums">
                  {authorizedLiveSessions.length} sessões · {liveTicketsTotal} bilhetes LIVE · {liveSupportersTotal} apoiadores
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('motor1')}
              className="btn-tactile min-h-[36px] px-2.5 py-1.5 rounded-lg inline-flex items-center text-xs font-semibold text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18]/60 transition-colors"
            >
              Gerenciar &rarr;
            </button>
          </div>

          {authorizedLiveSessions.length === 0 ? (
            <div className="py-8 px-6 rounded-xl bg-[#080D18] border border-white/5 text-center space-y-2">
              <p className="text-sm font-semibold text-[#FFFFFF]">
                Nenhuma transmissão registrada na sua conta
              </p>
              <p className="text-xs text-[#A5B1C5] max-w-sm mx-auto">
                Conecte uma LIVE no módulo TikTok LIVE PRO para visualizar as coletas de moedas e presentes da sua conta aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {authorizedLiveSessions.slice(0, 4).map((sess) => (
                <div
                  key={sess.sessionId}
                  className="p-3.5 rounded-xl bg-[#080D18] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#FFFFFF] text-sm truncate">
                      @{sess.username}
                    </div>
                    <div className="text-xs text-[#A5B1C5] tabular-nums mt-0.5">
                      {(sess.totalCoins || 0).toLocaleString('pt-BR')} moedas ·{' '}
                      {(sess.uniqueSupportersCount || 0).toLocaleString('pt-BR')} apoiadores
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
                    <span className="font-bold text-sm text-[#A6C957]">
                      {(sess.currentTicketCounter || 0).toLocaleString('pt-BR')}
                    </span>
                    <span className="block text-[11px] text-[#A5B1C5]">bilhetes</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
