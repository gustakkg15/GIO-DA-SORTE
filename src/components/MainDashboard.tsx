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

  const hasParticipants = totalParticipantsCount > 0;
  const hasEligibleTickets = traditionalEligibleTickets > 0;
  const hasWinners = traditionalWinnersCount > 0;

  return (
    <div className="space-y-7 animate-fade-in min-w-0 pb-6 font-sans">
      {/* 1. Hero Operational Console — Clareza Imediata e Resumo da Rifa Ativa */}
      <section
        aria-label="Console Operacional Principal"
        className="relative overflow-hidden rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] shadow-2xl animate-slide-up-fade"
      >
        {/* Top Royal Blue + Lime Green Brand Accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#0131CD] via-[#0131CD] to-[#A6C957]"
        />

        <div className="relative p-6 sm:p-7 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl min-w-0">
              {/* Context & Status Row */}
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0131CD]/25 border border-[#0131CD]/55 text-xs font-semibold text-[#FFFFFF]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>Painel Principal · Sorteio Auditável</span>
                </span>
                <span
                  data-testid="dashboard-data-source-badge"
                  data-source-kind={dataSourceKind}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    dataSourceKind === 'PERSISTED'
                      ? 'bg-[#A6C957]/15 border-[#A6C957]/40 text-[#A6C957]'
                      : dataSourceKind === 'DEMO'
                      ? 'bg-[#0131CD]/20 border-[#0131CD]/45 text-[#FFFFFF]'
                      : 'bg-[#080D18] border-[var(--gio-border-subtle)] text-[#A5B1C5]'
                  }`}
                >
                  <span>{dataSourceLabel}</span>
                </span>
                <span className="font-mono text-xs text-[#A5B1C5] bg-[#080D18] px-2.5 py-1 rounded-lg border border-[var(--gio-border-subtle)] tabular-nums">
                  Código: #{raffleCode}
                </span>
                <button
                  type="button"
                  onClick={onOpenOnboardingTour}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[#080D18] hover:bg-[#0131CD]/25 border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/60 text-xs text-[#FFFFFF] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 shrink-0 text-[#A6C957]" />
                  <span>Como funciona (Tour)</span>
                </button>
              </div>

              {/* Main Title & Clear Subtitle */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#FFFFFF] tracking-tight leading-tight">
                  Central de Controle dos Seus Sorteios
                </h1>
                <p className="text-sm text-[#A5B1C5] mt-1 leading-relaxed">
                  Acompanhe os números da sua rifa atual, adicione participantes ou inicie o sorteio ao vivo com apenas 1 clique.
                </p>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenTraditionalDraw}
                className="gio-btn-primary btn-tactile inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold text-[#FFFFFF] rounded-xl shadow-lg shadow-[#0131CD]/30 cursor-pointer"
              >
                <Play className="w-4 h-4 text-[#A6C957] fill-[#A6C957] shrink-0" />
                <span>Realizar Sorteio Agora</span>
              </button>

              <button
                type="button"
                onClick={onStartNewRaffleWizard}
                className="btn-tactile inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-semibold text-[#FFFFFF] bg-[#080D18] hover:bg-[#0131CD]/20 rounded-xl border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/55 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#A6C957] shrink-0" />
                <span>Configurar Novo Sorteio</span>
              </button>
            </div>
          </div>

          {/* Resumo Visual do Sorteio Ativo (3 Colunas Fáceis de Ler) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-[var(--gio-border-subtle)]">
            <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#0131CD]/25 border border-[#0131CD]/50 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4 text-[#FFFFFF]" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  Sorteio Carregado no Painel
                </span>
                <strong className="text-sm font-bold text-[#FFFFFF] block truncate">
                  {raffleTitle}
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#A6C957]/15 border border-[#A6C957]/40 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-[#A6C957]" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  Prêmio Atual em Disputa
                </span>
                <strong className="text-sm font-bold text-[#A6C957] block truncate">
                  {currentPrize}
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#0131CD]/25 border border-[#0131CD]/50 flex items-center justify-center shrink-0">
                <Coins className="w-4 h-4 text-[#A6C957]" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-medium text-[#A5B1C5] block">
                  Regra de Geração de Bilhetes
                </span>
                <strong className="text-sm font-bold text-[#FFFFFF] tabular-nums block truncate">
                  Cada {settings.rate} {settings.rate === 1 ? 'moeda gera' : 'moedas geram'} 1 bilhete
                </strong>
              </div>
            </div>
          </div>

          {/* Aviso Amigável quando estiver em Modo de Demonstração */}
          {dataSourceKind === 'DEMO' && (
            <div className="p-3.5 rounded-xl bg-[#0131CD]/15 border border-[#0131CD]/45 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-2.5 text-[#FFFFFF]">
                <Sparkles className="w-4 h-4 text-[#A6C957] shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  <strong>Modo de Exemplo Ativo:</strong> Os participantes abaixo são apenas uma demonstração para você testar a roleta. Você pode limpar ou cadastrar sua própria lista quando quiser.
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenParticipants}
                className="px-3 py-1.5 rounded-lg bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-semibold whitespace-nowrap shrink-0 transition cursor-pointer"
              >
                Editar Lista de Participantes &rarr;
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 1.5. Guia Rápido em 3 Passos — "Como Realizar seu Sorteio" */}
      <section
        aria-label="Passo a Passo do Sorteio"
        className="p-5 rounded-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#FFFFFF]">
              Roteiro Rápido: Como Realizar Seu Sorteio em 3 Passos
            </h2>
            <p className="text-xs text-[#A5B1C5]">
              Siga a ordem abaixo para configurar, conferir os bilhetes e sortear o vencedor com segurança.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs font-semibold text-[#A6C957] tabular-nums self-start sm:self-auto">
            <span>
              Status: {hasEligibleTickets ? 'Pronto para sortear' : 'Aguardando participantes'}
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Passo 1 */}
          <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FFFFFF]">
                  <span className="w-5 h-5 rounded-md bg-[#0131CD] text-[#FFFFFF] text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
                    1
                  </span>
                  <span>Cadastrar Participantes</span>
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    hasParticipants
                      ? 'bg-[#A6C957]/15 text-[#A6C957]'
                      : 'bg-[#111B30] text-[#A5B1C5]'
                  }`}
                >
                  {hasParticipants ? `${totalParticipantsCount} inscritos` : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-[#A5B1C5] leading-relaxed">
                Adicione os nomes manualmente, cole uma lista ou importe uma planilha CSV com as moedas/cotas de cada participante.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenParticipants}
              className="w-full py-2 px-3 rounded-lg bg-[#111B30] hover:bg-[#0131CD] text-xs font-semibold text-[#FFFFFF] border border-[var(--gio-border-subtle)] flex items-center justify-between transition cursor-pointer"
            >
              <span>1. Ir para Participantes</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#A6C957]" />
            </button>
          </div>

          {/* Passo 2 */}
          <div className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FFFFFF]">
                  <span className="w-5 h-5 rounded-md bg-[#0131CD] text-[#FFFFFF] text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
                    2
                  </span>
                  <span>Conferir Bilhetes na Urna</span>
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md tabular-nums ${
                    hasEligibleTickets
                      ? 'bg-[#A6C957]/15 text-[#A6C957]'
                      : 'bg-[#111B30] text-[#A5B1C5]'
                  }`}
                >
                  {traditionalEligibleTickets} elegíveis
                </span>
              </div>
              <p className="text-xs text-[#A5B1C5] leading-relaxed">
                O sistema calcula automaticamente os números da sorte de cada pessoa de acordo com a taxa ({settings.rate} moedas = 1 bilhete).
              </p>
            </div>
            <button
              type="button"
              onClick={onStartNewRaffleWizard}
              className="w-full py-2 px-3 rounded-lg bg-[#111B30] hover:bg-[#0131CD] text-xs font-semibold text-[#FFFFFF] border border-[var(--gio-border-subtle)] flex items-center justify-between transition cursor-pointer"
            >
              <span>2. Ajustar Prêmio ou Regra</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#A6C957]" />
            </button>
          </div>

          {/* Passo 3 */}
          <div className="p-4 rounded-xl bg-[#080D18] border border-[#0131CD]/50 flex flex-col justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FFFFFF]">
                  <span className="w-5 h-5 rounded-md bg-[#A6C957] text-[#080D18] text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
                    3
                  </span>
                  <span>Sortear e Emitir Certificado</span>
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#0131CD]/25 text-[#FFFFFF] tabular-nums">
                  {hasWinners ? `${traditionalWinnersCount} sorteado(s)` : 'Pronto'}
                </span>
              </div>
              <p className="text-xs text-[#A5B1C5] leading-relaxed">
                Abra a Mesa de Sorteio Oficial para girar a Roleta, o Globo ou o Battle Royale e gerar o Cartão VIP do vencedor.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenTraditionalDraw}
              className="w-full py-2 px-3 rounded-lg bg-[#0131CD] hover:brightness-110 text-xs font-bold text-[#FFFFFF] flex items-center justify-between transition cursor-pointer shadow-sm"
            >
              <span>3. Abrir Mesa de Sorteio</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#A6C957]" />
            </button>
          </div>
        </div>
      </section>

      {/* 2. Indicadores Principais Explicados — Leitura Rápida */}
      <section aria-label="Indicadores Operacionais Chave" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#FFFFFF]">
              Resumo dos Números em Tempo Real
            </h2>
            <p className="text-xs text-[#A5B1C5]">
              Visão direta dos bilhetes, participantes, conexão com TikTok LIVE e status do seu plano ({dataSourceLabel}).
            </p>
          </div>
          <span className="text-xs text-[#A5B1C5] tabular-nums">
            Atualizado em {formatDateTime(Date.now())}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Bilhetes Emitidos do Sorteio Tradicional Ativo */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FFFFFF]">
                Bilhetes Gerados
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#0131CD]/20 border border-[#0131CD]/45 flex items-center justify-center">
                <Ticket className="w-4 h-4 text-[#A6C957]" />
              </div>
            </div>
            <div>
              <div
                data-testid="kpi-traditional-tickets"
                className="text-3xl font-bold text-[#FFFFFF] tabular-nums tracking-tight"
              >
                {totalTicketsIssued.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
                <strong className="text-[#A6C957]">{traditionalEligibleTickets}</strong> concorrendo agora ·{' '}
                <strong className="text-[#FFFFFF]">{traditionalWinnersCount}</strong> já sorteados
              </p>
              <button
                type="button"
                onClick={onOpenTraditionalDraw}
                className="mt-2.5 text-xs font-semibold text-[#A6C957] hover:text-[#B5D477] inline-flex items-center gap-1 transition cursor-pointer"
              >
                <span>Ir para a urna de sorteio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KPI 2: Total de Participantes do Sorteio Tradicional Ativo */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FFFFFF]">
                Participantes na Lista
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#0131CD]/20 border border-[#0131CD]/45 flex items-center justify-center">
                <Users className="w-4 h-4 text-[#FFFFFF]" />
              </div>
            </div>
            <div>
              <div
                data-testid="kpi-traditional-participants"
                className="text-3xl font-bold text-[#FFFFFF] tabular-nums tracking-tight"
              >
                {totalParticipantsCount.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-[#A5B1C5] mt-1 tabular-nums">
                <strong className="text-[#FFFFFF]">{traditionalParticipantsWithTicketsCount}</strong> participantes com bilhetes ativos
              </p>
              <button
                type="button"
                onClick={onOpenParticipants}
                className="mt-2.5 text-xs font-semibold text-[#A6C957] hover:text-[#B5D477] inline-flex items-center gap-1 transition cursor-pointer"
              >
                <span>Adicionar ou editar nomes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KPI 3: Status TikTok LIVE */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FFFFFF]">
                Transmissão TikTok LIVE
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center">
                <Radio
                  className={`w-4 h-4 ${
                    liveConnectionState === 'CONNECTED' ? 'text-[#A6C957]' : 'text-[#A5B1C5]'
                  }`}
                />
              </div>
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
              <p className="text-xs text-[#A5B1C5] mt-1">
                Captura presentes da LIVE e cria bilhetes ao vivo.
              </p>
              <button
                type="button"
                onClick={() => onOpenLivePro('feed')}
                className="mt-2.5 text-xs font-semibold text-[#A6C957] hover:text-[#B5D477] inline-flex items-center gap-1 transition cursor-pointer"
              >
                <span>{liveDashboardActionText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KPI 4: Plano e Assinatura */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 animate-slide-up-fade stagger-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#FFFFFF]">
                Sua Assinatura
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center">
                <Crown className={`w-4 h-4 ${isPro ? 'text-[#A6C957]' : 'text-[#FFFFFF]'}`} />
              </div>
            </div>
            <div>
              <div className="text-base font-bold text-[#FFFFFF] flex items-center gap-2">
                {isPro ? (
                  <span className="text-[#A6C957]">Plano PRO Ativo</span>
                ) : (
                  <span className="text-[#FFFFFF]">Plano Gratuito (FREE)</span>
                )}
              </div>
              <p className="text-xs text-[#A5B1C5] mt-1">
                {isPro
                  ? 'Automação TikTok LIVE e Comentários liberados.'
                  : 'Sorteios manuais e rifas tradicionais ilimitadas.'}
              </p>
              <button
                type="button"
                onClick={onOpenSubscription}
                className="mt-2.5 text-xs font-semibold text-[#A6C957] hover:text-[#B5D477] inline-flex items-center gap-1 transition cursor-pointer"
              >
                <span>{isPro ? 'Gerenciar assinatura' : 'Conhecer recursos do PRO'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Módulos e Ferramentas Principais — "Qual modalidade você quer abrir?" */}
      <section aria-label="Ferramentas Operacionais" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#FFFFFF] tracking-tight">
              Escolha a Modalidade de Sorteio ou Ferramenta
            </h2>
            <p className="text-xs text-[#A5B1C5] mt-0.5">
              Cada card abaixo explica exatamente quando usar cada ferramenta da plataforma.
            </p>
          </div>
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
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                  <Sparkles className="w-5 h-5 text-[#A6C957]" />
                </div>
                <span className="gio-badge-free">Gratuito</span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#A6C957] block">
                  Rifas e Listas Manuais / CSV
                </span>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors mt-0.5">
                  Mesa de Sorteio Oficial
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Use para sortear entre os participantes cadastrados usando Roleta, Globo Digital ou Battle Royale.
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] inline-flex items-center gap-1 transition-colors">
                <span>Abrir mesa</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                {computed.eligibleTickets.length} bilhetes
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
            <div className="space-y-3.5">
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
                <span className="text-[11px] font-semibold text-[#A6C957] block">
                  Automação em Tempo Real na LIVE
                </span>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors mt-0.5">
                  Sorteio por Presentes LIVE
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Use durante sua transmissão no TikTok para transformar presentes e moedas em bilhetes automaticamente.
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#A6C957] inline-flex items-center gap-1">
                <span>Abrir TikTok LIVE</span>
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
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <ProFeatureBadge isPro={isPro} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#A6C957] block">
                  Interação pelo Chat da Transmissão
                </span>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors mt-0.5">
                  Sorteador de Comentários
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Use para sortear espectadores que digitarem uma palavra-chave ou comentarem no chat ao vivo.
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
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
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
                  <Search className="w-5 h-5" />
                </div>
                <span className="text-xs font-semibold text-[#A5B1C5] tabular-nums">
                  {participants.length} inscritos
                </span>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[#A6C957] block">
                  Cadastro de Nomes e Busca de Bilhetes
                </span>
                <h3 className="text-base font-bold text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors mt-0.5">
                  Participantes & Cotas
                </h3>
                <p className="text-xs text-[#A5B1C5] mt-1.5 leading-relaxed">
                  Use para adicionar pessoas, ajustar a quantidade de moedas e consultar quais bilhetes cada um recebeu.
                </p>
              </div>
            </div>
            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FFFFFF] group-hover:text-[#A6C957] inline-flex items-center gap-1 transition-colors">
                <span>Gerenciar lista</span>
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
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF]">
                  Últimos Ganhadores Sorteados
                </h3>
                <p className="text-[11px] text-[#A5B1C5]">
                  Histórico de premiados da sessão atual com acesso ao Cartão VIP
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenReports}
              className="btn-tactile min-h-[36px] px-2.5 py-1.5 rounded-lg inline-flex items-center text-xs font-semibold text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18]/60 transition-colors cursor-pointer"
            >
              Ver relatórios completos &rarr;
            </button>
          </div>

          {winners.length === 0 ? (
            <div className="py-8 px-6 rounded-xl bg-[#080D18] border border-white/5 text-center space-y-3">
              <p className="text-sm font-semibold text-[#FFFFFF]">
                Ainda não há ganhadores sorteados nesta sessão
              </p>
              <p className="text-xs text-[#A5B1C5] max-w-md mx-auto">
                Assim que você realizar um sorteio na Mesa Oficial, o nome do vencedor, o bilhete premiado e o Cartão VIP aparecerão aqui.
              </p>
              <button
                type="button"
                onClick={onOpenTraditionalDraw}
                className="px-4 py-2 rounded-xl bg-[#0131CD] hover:brightness-110 text-xs font-semibold text-[#FFFFFF] inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-[#A6C957] fill-[#A6C957]" />
                <span>Ir para a Mesa de Sorteio</span>
              </button>
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
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#0131CD] text-[#FFFFFF] border border-[var(--gio-border-subtle)] hover:border-[#0131CD] text-xs font-semibold inline-flex items-center justify-center shrink-0 transition-all cursor-pointer"
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
                <Radio className="w-4 h-4 text-[#A6C957]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#FFFFFF]">
                  Suas Transmissões TikTok LIVE
                </h3>
                <p className="text-[11px] text-[#A5B1C5] tabular-nums">
                  {authorizedLiveSessions.length} sessões · {liveTicketsTotal} bilhetes LIVE · {liveSupportersTotal} apoiadores
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('motor1')}
              className="btn-tactile min-h-[36px] px-2.5 py-1.5 rounded-lg inline-flex items-center text-xs font-semibold text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18]/60 transition-colors cursor-pointer"
            >
              Gerenciar &rarr;
            </button>
          </div>

          {authorizedLiveSessions.length === 0 ? (
            <div className="py-8 px-6 rounded-xl bg-[#080D18] border border-white/5 text-center space-y-3">
              <p className="text-sm font-semibold text-[#FFFFFF]">
                Nenhuma transmissão registrada na sua conta
              </p>
              <p className="text-xs text-[#A5B1C5] max-w-sm mx-auto">
                Ao conectar uma transmissão no módulo TikTok LIVE, as moedas e os bilhetes gerados pelos apoiadores aparecerão aqui.
              </p>
              <button
                type="button"
                onClick={() => onOpenLivePro('feed')}
                className="px-4 py-2 rounded-xl bg-[#111B30] hover:bg-[#0131CD] text-xs font-semibold text-[#FFFFFF] border border-[var(--gio-border-subtle)] inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-[#A6C957]" />
                <span>Abrir Módulo TikTok LIVE</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {authorizedLiveSessions.slice(0, 4).map((sess) => (
                <div
                  key={sess.sessionId}
                  className="p-3.5 rounded-xl bg-[#080D18] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[#FFFFFF] text-sm truncate">
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
