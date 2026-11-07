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
  FileText,
  ArrowRight,
  Sparkles,
  Award,
  CheckCircle2,
  Compass,
} from 'lucide-react';
import {
  Participant,
  RaffleSettings,
  Winner,
  ComputedRaffle,
  ProPlanEntitlement,
  TikTokLiveSession,
} from '../types';
import { formatDateTime } from '../utils/raffle';
import { mapTikTokConnectionState } from '../utils/tiktokStatusMapper';

interface MainDashboardProps {
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  computed: ComputedRaffle;
  entitlement: ProPlanEntitlement;
  liveSessions: TikTokLiveSession[];
  liveConnectionState: string;
  liveConnectedUsername?: string;
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

export const MainDashboard: React.FC<MainDashboardProps> = ({
  settings,
  participants,
  winners,
  computed,
  entitlement,
  liveSessions,
  liveConnectionState,
  liveConnectedUsername,
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

  // Aggregate real metrics from both local raffle and persisted TikTok LIVE sessions
  const liveTicketsTotal = liveSessions.reduce((acc, s) => acc + (s.currentTicketCounter || 0), 0);
  const liveSupportersTotal = liveSessions.reduce((acc, s) => acc + (s.uniqueSupportersCount || 0), 0);

  const totalRafflesCompleted = winners.length + liveSessions.filter((s) => s.latestDrawFrozenTicketMax).length;
  const totalParticipantsCount = participants.length + liveSupportersTotal;
  const totalTicketsIssued = computed.usedCount + liveTicketsTotal;

  const latestWinner = winners.length > 0 ? winners[0] : null;
  const latestLiveSession = liveSessions.length > 0 ? liveSessions[0] : null;

  const lastActivityLabel = latestWinner
    ? `Sorteio "${latestWinner.prize}" vencido por ${latestWinner.name}`
    : latestLiveSession
    ? `Sessão LIVE @${latestLiveSession.username} (${latestLiveSession.currentTicketCounter || 0} bilhetes)`
    : `${participants.length} participantes prontos na lista atual`;

  return (
    <div className="space-y-7 animate-fade-in min-w-0">
      {/* Primary Hero Banner with Single Dominant Action: + CRIAR NOVO SORTEIO */}
      <section
        aria-label="Boas-vindas e Ação Principal"
        className="relative overflow-hidden p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#0B1730] via-[#101F3D] to-[#082456] border border-[var(--gio-border-active)] shadow-[0_18px_45px_rgba(2,8,23,0.55)] flex flex-col lg:flex-row lg:items-center justify-between gap-6"
      >
        {/* Subtle top electric light accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#8B7CFF]"
        />

        <div className="flex items-start gap-4 sm:gap-5 max-w-2xl min-w-0">
          <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-[#050D20] border border-[#00A9FF]/40 items-center justify-center p-1.5 shadow-[0_8px_24px_rgba(8,102,245,0.28)] shrink-0">
            <img
              src="/logo.png"
              alt="Logo Oficial GIO DA SORTE"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#94A3B8]">
              <span className="px-2.5 py-0.5 rounded-md bg-[#0866F5]/20 border border-[#00A9FF]/35 font-semibold text-[#00A9FF]">
                Painel Principal
              </span>
              <span aria-hidden="true" className="text-[#94A3B8]/50">·</span>
              <span className="text-[#F8FAFC]/90 font-medium truncate">
                Prêmio Atual: <strong className="text-[#F8FAFC]">{settings.prizeName || settings.currentPrize || 'Prêmio Principal'}</strong>
              </span>
              <span aria-hidden="true" className="text-[#94A3B8]/50">·</span>
              <button
                type="button"
                onClick={onOpenOnboardingTour}
                className="text-[#00A9FF] hover:text-[#35B9F5] underline underline-offset-2 font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>Ver tutorial rápido</span>
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black text-[#F8FAFC] tracking-tight leading-tight">
              Bem-vindo ao <span className="text-[#00A9FF]">GIO DA SORTE</span>
            </h1>

            <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed">
              Inicie um novo sorteio passo a passo, conecte sua transmissão do TikTok LIVE para emitir bilhetes
              automaticamente ou gerencie seus participantes em segundos.
            </p>
          </div>
        </div>

        {/* Dominant Primary CTA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onStartNewRaffleWizard}
            className="min-h-[52px] px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] text-white font-display font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-[0_10px_28px_rgba(8,102,245,0.42)] ring-1 ring-[#35B9F5]/45 hover:brightness-110 active:scale-98 transition"
          >
            <Plus className="w-5 h-5 stroke-[2.75]" />
            <span>+ CRIAR NOVO SORTEIO</span>
          </button>
        </div>
      </section>

      {/* Essential Metrics Grid (6 Objective Indicators) */}
      <section aria-label="Indicadores Operacionais do Painel" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Total de Sorteios Realizados */}
        <div className="p-5 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] flex items-start justify-between gap-4 transition-colors">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Total de Sorteios Realizados
            </span>
            <div className="text-3xl sm:text-4xl font-mono-tech font-bold text-[#F8FAFC] tabular-nums">
              {totalRafflesCompleted}
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8] tabular-nums">
              {winners.length} na mesa atual · {liveSessions.length} sessões LIVE salvas
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#F5B942]/15 border border-[#F5B942]/40 flex items-center justify-center text-[#F5B942] shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Total de Participantes */}
        <div className="p-5 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] flex items-start justify-between gap-4 transition-colors">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Total de Participantes
            </span>
            <div className="text-3xl sm:text-4xl font-mono-tech font-bold text-[#F8FAFC] tabular-nums">
              {totalParticipantsCount}
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8] tabular-nums">
              {participants.length} na lista local · {liveSupportersTotal} apoiadores em LIVE
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#00A9FF]/15 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF] shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Total de Bilhetes Emitidos */}
        <div className="p-5 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] flex items-start justify-between gap-4 transition-colors">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Total de Bilhetes Emitidos
            </span>
            <div className="text-3xl sm:text-4xl font-mono-tech font-bold text-[#00A9FF] tabular-nums">
              {totalTicketsIssued}
            </div>
            <p className="text-xs sm:text-sm text-[#94A3B8] tabular-nums">
              {computed.usedCount} bilhetes locais · {liveTicketsTotal} bilhetes automáticos LIVE
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#00A9FF]/15 border border-[#00A9FF]/40 flex items-center justify-center text-[#00A9FF] shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Status da Conexão TikTok */}
        <div className="p-5 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] flex items-start justify-between gap-4 transition-colors">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Status da Conexão TikTok LIVE
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  liveConnectionState === 'CONNECTED'
                    ? 'bg-[#20C997] animate-pulse shadow-[0_0_8px_#20C997]'
                    : liveConnectionState === 'CONNECTING' || liveConnectionState === 'RECONNECTING'
                    ? 'bg-[#F5B942] animate-pulse'
                    : liveConnectionState === 'ERROR'
                    ? 'bg-[#F05262]'
                    : 'bg-[#64748B]'
                }`}
              />
              <span className="text-base sm:text-lg font-display font-bold text-[#F8FAFC] truncate">
                {liveDashboardStatusText}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('feed')}
              className="text-xs sm:text-sm font-semibold text-[#00A9FF] hover:text-[#35B9F5] inline-flex items-center gap-1 pt-0.5 transition-colors"
            >
              <span>{liveDashboardActionText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              liveConnectionState === 'CONNECTED'
                ? 'bg-[#20C997]/15 border-[#20C997]/40 text-[#20C997]'
                : liveConnectionState === 'CONNECTING' || liveConnectionState === 'RECONNECTING'
                ? 'bg-[#F5B942]/15 border-[#F5B942]/40 text-[#F5B942]'
                : liveConnectionState === 'ERROR'
                ? 'bg-[#F05262]/15 border-[#F05262]/40 text-[#F05262]'
                : 'bg-[#0866F5]/15 border-[#0866F5]/40 text-[#00A9FF]'
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
        </div>

        {/* 5. Situação da Assinatura */}
        <div className="p-5 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] flex items-start justify-between gap-4 transition-colors">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Situação da Assinatura
            </span>
            <div className="text-base sm:text-lg font-display font-bold text-[#F8FAFC] flex items-center gap-2">
              {isPro ? (
                <span className="text-[#C4B5FD]">Plano PRO Ativo</span>
              ) : (
                <span className="text-[#F8FAFC]">Plano Gratuito (FREE)</span>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenSubscription}
              className="text-xs sm:text-sm font-semibold text-[#C4B5FD] hover:text-[#8B7CFF] hover:underline inline-flex items-center gap-1 pt-0.5 transition-colors"
            >
              <span>{isPro ? 'Ver recursos do meu plano' : 'Conhecer vantagens do PRO'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 flex items-center justify-center text-[#8B7CFF] shrink-0">
            {isPro ? <Crown className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
        </div>

        {/* 6. Última Atividade */}
        <div className="p-5 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] flex items-start justify-between gap-4 transition-colors">
          <div className="space-y-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">
              Última Atividade Registrada
            </span>
            <div className="text-sm sm:text-base font-bold text-[#F8FAFC] truncate">{lastActivityLabel}</div>
            <p className="text-xs sm:text-sm text-[#94A3B8] tabular-nums">
              {latestWinner
                ? formatDateTime(latestWinner.drawnAt)
                : latestLiveSession
                ? formatDateTime(latestLiveSession.startedAt)
                : 'Sincronizado automaticamente'}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* Main Shortcuts Grid */}
      <section aria-label="Atalhos Rápidos" className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h2 className="text-lg sm:text-xl font-display font-bold text-[#F8FAFC]">
            Atalhos Rápidos para Principais Funções
          </h2>
          <span className="text-xs sm:text-sm text-[#94A3B8]">Escolha o que deseja fazer agora</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Shortcut 1: TikTok LIVE PRO */}
          <button
            type="button"
            onClick={() => onOpenLivePro('feed')}
            className="p-5 rounded-2xl bg-gradient-to-b from-[#182943] to-[#101F3D] hover:border-[#8B7CFF] border border-[#8B7CFF]/45 shadow-[0_10px_28px_rgba(2,8,23,0.35)] text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 flex items-center justify-center text-[#8B7CFF]">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 text-[11px] font-bold text-[#C4B5FD] flex items-center gap-1">
                  {isPro ? <Crown className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>PRO</span>
                </span>
              </div>
              <h3 className="text-base font-display font-bold text-[#F8FAFC] group-hover:text-[#C4B5FD] transition-colors">
                Sorteio por Presentes da LIVE
              </h3>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Conecte sua LIVE, capture presentes em tempo real e emita bilhetes automáticos.
              </p>
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#C4B5FD] inline-flex items-center gap-1">
              <span>Abrir TikTok LIVE PRO</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Shortcut 2: TikTok Comments Sorter (PRO Exclusive) */}
          <button
            type="button"
            onClick={isPro ? onOpenCommentsSorter : onOpenSubscription}
            className={`p-5 rounded-2xl bg-[#101F3D] hover:bg-[#182943]/80 border shadow-[0_10px_28px_rgba(2,8,23,0.35)] text-left transition flex flex-col justify-between gap-4 group ${
              isPro ? 'hover:border-[#8B7CFF] border-[#8B7CFF]/40' : 'hover:border-[#8B7CFF]/60 border-[#8B7CFF]/35'
            }`}
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 flex items-center justify-center text-[#8B7CFF]">
                  {isPro ? <MessageSquare className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 text-[11px] font-bold text-[#C4B5FD] flex items-center gap-1">
                  {isPro ? <Crown className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>PRO</span>
                </span>
              </div>
              <h3 className="text-base font-display font-bold text-[#F8FAFC] group-hover:text-[#C4B5FD] transition-colors">
                Sorteador de Comentários
              </h3>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                {isPro
                  ? 'Sorteie entre comentários do TikTok, palavras-chave ou listas rápidas de arrobas.'
                  : 'Recurso exclusivo do plano PRO. Clique para fazer upgrade e desbloquear.'}
              </p>
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#C4B5FD] inline-flex items-center gap-1">
              <span>{isPro ? 'Abrir Sorteador' : 'Fazer Upgrade para Usar'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Shortcut 3: Traditional Drum & Wheel */}
          <button
            type="button"
            onClick={onOpenTraditionalDraw}
            className="p-5 rounded-2xl bg-[#101F3D] hover:bg-[#182943]/80 hover:border-[#00A9FF] border border-[var(--gio-border-subtle)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#0866F5]/20 border border-[#0866F5]/45 flex items-center justify-center text-[#35B9F5]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#20C997]/15 border border-[#20C997]/35 text-[11px] font-semibold text-[#20C997]">
                  Gratuito
                </span>
              </div>
              <h3 className="text-base font-display font-bold text-[#F8FAFC] group-hover:text-[#00A9FF] transition-colors">
                Mesa de Sorteio (Tambor & Roleta)
              </h3>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Sorteio proporcional por moedas com Tambor 3D, Roleta da Fortuna e Battle Royale.
              </p>
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#00A9FF] inline-flex items-center gap-1">
              <span>Ir para Mesa de Sorteio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Shortcut 4: Participants & Ticket Lookup */}
          <button
            type="button"
            onClick={onOpenParticipants}
            className="p-5 rounded-2xl bg-[#101F3D] hover:bg-[#182943]/80 hover:border-[#20C997] border border-[var(--gio-border-subtle)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997]">
                  <Search className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#0B1730] border border-[var(--gio-border-subtle)] text-[11px] font-mono-tech font-semibold text-[#94A3B8] tabular-nums">
                  {participants.length} cadastrados
                </span>
              </div>
              <h3 className="text-base font-display font-bold text-[#F8FAFC] group-hover:text-[#20C997] transition-colors">
                Participantes & Consulta
              </h3>
              <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
                Pesquise por @usuário ou #bilhete, importe planilhas e consulte o histórico.
              </p>
            </div>
            <span className="text-xs sm:text-sm font-bold text-[#20C997] inline-flex items-center gap-1">
              <span>Gerenciar Participantes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>
      </section>

      {/* Recent Winners & Activity Section */}
      <section aria-label="Últimos Ganhadores e Transmissões Recentes" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base sm:text-lg font-display font-bold text-[#F8FAFC]">
              Últimos Ganhadores Registrados
            </h3>
            <button
              type="button"
              onClick={onOpenReports}
              className="text-xs sm:text-sm font-semibold text-[#00A9FF] hover:text-[#35B9F5] hover:underline transition-colors"
            >
              Ver histórico completo
            </button>
          </div>

          {winners.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0B1730] border border-[var(--gio-border-subtle)] text-center space-y-2">
              <p className="text-sm font-semibold text-[#F8FAFC]">
                Ainda não há ganhadores salvos na sessão atual.
              </p>
              <p className="text-xs sm:text-sm text-[#94A3B8]">
                Clique em &ldquo;+ Criar Novo Sorteio&rdquo; no topo para realizar seu primeiro sorteio.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--gio-border-subtle)]">
              {winners.slice(0, 5).map((w) => (
                <div key={w.id} className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2.5 py-1 rounded-md bg-[#0B1730] border border-[#F5B942]/40 font-mono-tech font-bold text-[#F5B942] tabular-nums shrink-0">
                      #{w.number}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-[#F8FAFC] truncate">{w.name}</div>
                      <div className="text-xs text-[#94A3B8] truncate tabular-nums">
                        {w.prize} · {formatDateTime(w.drawnAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    className="px-3 py-1.5 rounded-lg bg-[#0866F5]/20 hover:bg-[#0866F5]/35 text-[#00A9FF] border border-[#00A9FF]/40 text-xs font-semibold shrink-0 transition"
                  >
                    Ver Cartão
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent TikTok LIVE Sessions Summary */}
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-[#101F3D] border border-[var(--gio-border-subtle)] shadow-[0_10px_28px_rgba(2,8,23,0.35)] space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base sm:text-lg font-display font-bold text-[#F8FAFC]">
              Transmissões TikTok LIVE Recentes
            </h3>
            <button
              type="button"
              onClick={() => onOpenLivePro('motor1')}
              className="text-xs sm:text-sm font-semibold text-[#C4B5FD] hover:text-[#8B7CFF] hover:underline transition-colors"
            >
              Gerenciar LIVES
            </button>
          </div>

          {liveSessions.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0B1730] border border-[var(--gio-border-subtle)] text-center space-y-2">
              <p className="text-sm font-semibold text-[#F8FAFC]">
                Nenhuma transmissão conectada recentemente.
              </p>
              <p className="text-xs sm:text-sm text-[#94A3B8]">
                Ao conectar uma LIVE no módulo TikTok LIVE PRO, as sessões e bilhetes aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--gio-border-subtle)]">
              {liveSessions.slice(0, 4).map((sess) => (
                <div key={sess.sessionId} className="py-3 flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <div className="font-bold text-[#F8FAFC] truncate">
                      @{sess.username} — {sess.raffleTitle || sess.roomTitle || 'Sorteio LIVE'}
                    </div>
                    <div className="text-xs text-[#94A3B8] tabular-nums">
                      {sess.totalCoins || 0} moedas · {sess.uniqueSupportersCount || 0} participantes
                    </div>
                  </div>
                  <div className="text-right font-mono-tech tabular-nums shrink-0">
                    <span className="font-bold text-sm sm:text-base text-[#00A9FF]">{sess.currentTicketCounter || 0}</span>
                    <span className="block text-[11px] text-[#94A3B8]">bilhetes</span>
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
