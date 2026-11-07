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

  const liveTicketsTotal = liveSessions.reduce((acc, s) => acc + (s.currentTicketCounter || 0), 0);
  const liveSupportersTotal = liveSessions.reduce(
    (acc, s) => acc + (s.uniqueSupportersCount || 0),
    0
  );

  const totalRafflesCompleted =
    winners.length + liveSessions.filter((s) => s.latestDrawFrozenTicketMax).length;
  const totalParticipantsCount = participants.length + liveSupportersTotal;
  const totalTicketsIssued = computed.usedCount + liveTicketsTotal;

  const latestWinner = winners.length > 0 ? winners[0] : null;
  const latestLiveSession = liveSessions.length > 0 ? liveSessions[0] : null;

  const lastActivityLabel = latestWinner
    ? `Sorteio "${latestWinner.prize}" vencido por ${latestWinner.name}`
    : latestLiveSession
    ? `Sessão LIVE @${latestLiveSession.username} (${latestLiveSession.currentTicketCounter || 0} bilhetes)`
    : `${participants.length} participantes prontos na lista atual`;

  const currentPrize = settings.prizeName || settings.currentPrize || 'Prêmio Principal';
  const raffleTitle = settings.raffleTitle || 'Sorteio Oficial GIO DA SORTE';
  const raffleCode = settings.raffleCode || 'GIO-7492';

  return (
    <div className="space-y-6 animate-fade-in min-w-0">
      {/* 1. Primary Operational Welcome Header (Clean, Focused, Uncluttered) */}
      <section
        aria-label="Boas-vindas e Ação Principal"
        className="relative overflow-hidden p-5 sm:p-7 rounded-2xl bg-[#101F3D] border border-[#182943] shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-6"
      >
        {/* Top Accent Line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#8B7CFF]"
        />

        <div className="space-y-2.5 max-w-3xl min-w-0">
          {/* Status & Metadata Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0866F5]/20 border border-[#00A9FF]/35 font-bold text-[#35B9F5] uppercase tracking-wider text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00A9FF]" />
              Painel Operacional
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-[#0B1730] border border-[#182943] font-mono font-semibold text-[#94A3B8] tabular-nums">
              #{raffleCode}
            </span>
            <button
              type="button"
              onClick={onOpenOnboardingTour}
              className="px-2.5 py-0.5 rounded-md bg-[#0B1730] hover:bg-[#182943] border border-[#182943] text-[#00A9FF] font-semibold inline-flex items-center gap-1 transition-colors"
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span>Tutorial rápido</span>
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC] tracking-tight leading-tight">
            Bem-vindo ao <span className="text-[#00A9FF]">GIO DA SORTE</span>
          </h1>

          {/* Active Raffle Context Strip */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs sm:text-sm text-[#94A3B8]">
            <div className="flex items-center gap-1.5">
              <Ticket className="w-4 h-4 text-[#00A9FF]" />
              <span>Sorteio ativo:</span>
              <strong className="text-[#F8FAFC] font-semibold">{raffleTitle}</strong>
            </div>
            <span className="hidden sm:inline text-[#182943]">•</span>
            <div className="flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-[#F5B942]" />
              <span>Prêmio:</span>
              <strong className="text-[#F5B942] font-semibold">{currentPrize}</strong>
            </div>
            <span className="hidden sm:inline text-[#182943]">•</span>
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-[#35B9F5]" />
              <span>Conversão:</span>
              <strong className="font-mono text-[#F8FAFC] tabular-nums">
                {settings.rate} moedas = 1 bilhete
              </strong>
            </div>
          </div>
        </div>

        {/* Focused Primary & Secondary Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenTraditionalDraw}
            className="gio-btn-primary px-5 py-3 text-sm font-bold"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Abrir Mesa de Sorteio</span>
          </button>

          <button
            type="button"
            onClick={onStartNewRaffleWizard}
            className="gio-btn-secondary px-4 py-3 text-sm font-semibold"
          >
            <Plus className="w-4 h-4 text-[#00A9FF]" />
            <span>Criar Novo Sorteio</span>
          </button>
        </div>
      </section>

      {/* 2. Essential Metrics Grid (6 Objective, Scannable KPI Cards) */}
      <section
        aria-label="Indicadores Operacionais do Painel"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {/* 1. Total de Sorteios Realizados */}
        <div className="gio-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Sorteios Realizados
            </span>
            <div className="text-3xl font-mono font-bold text-[#F8FAFC] tabular-nums tracking-tight">
              {totalRafflesCompleted.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#94A3B8] tabular-nums">
              {winners.length} na mesa atual · {liveSessions.length} sessões LIVE salvas
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#F5B942]/15 border border-[#F5B942]/35 flex items-center justify-center text-[#F5B942] shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Total de Participantes */}
        <div className="gio-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Total de Participantes
            </span>
            <div className="text-3xl font-mono font-bold text-[#F8FAFC] tabular-nums tracking-tight">
              {totalParticipantsCount.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#94A3B8] tabular-nums">
              {participants.length} na lista local · {liveSupportersTotal} apoiadores em LIVE
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF] shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Total de Bilhetes Emitidos */}
        <div className="gio-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Bilhetes Emitidos
            </span>
            <div className="text-3xl font-mono font-bold text-[#00A9FF] tabular-nums tracking-tight">
              {totalTicketsIssued.toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-[#94A3B8] tabular-nums">
              {computed.usedCount} bilhetes locais · {liveTicketsTotal} bilhetes LIVE
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#00A9FF]/15 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF] shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Status da Conexão TikTok LIVE */}
        <div className="gio-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Conexão TikTok LIVE
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  liveConnectionState === 'CONNECTED'
                    ? 'bg-[#20C997] animate-pulse'
                    : liveConnectionState === 'CONNECTING' ||
                      liveConnectionState === 'RECONNECTING'
                    ? 'bg-[#F5B942] animate-pulse'
                    : liveConnectionState === 'ERROR'
                    ? 'bg-[#F05262]'
                    : 'bg-[#64748B]'
                }`}
              />
              <span className="text-base font-bold text-[#F8FAFC] truncate">
                {liveDashboardStatusText}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('feed')}
              className="text-xs font-semibold text-[#00A9FF] hover:text-[#35B9F5] inline-flex items-center gap-1 pt-0.5 transition-colors"
            >
              <span>{liveDashboardActionText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              liveConnectionState === 'CONNECTED'
                ? 'bg-[#20C997]/15 border-[#20C997]/40 text-[#20C997]'
                : 'bg-[#0866F5]/15 border-[#0866F5]/40 text-[#00A9FF]'
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
        </div>

        {/* 5. Situação da Assinatura */}
        <div className="gio-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Assinatura e Plano
            </span>
            <div className="text-base font-bold text-[#F8FAFC] flex items-center gap-2">
              {isPro ? (
                <span className="text-[#C4B5FD]">Plano PRO Ativo</span>
              ) : (
                <span className="text-[#F8FAFC]">Plano Gratuito (FREE)</span>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenSubscription}
              className="text-xs font-semibold text-[#C4B5FD] hover:text-[#8B7CFF] inline-flex items-center gap-1 pt-0.5 transition-colors"
            >
              <span>{isPro ? 'Ver detalhes do plano' : 'Conhecer recursos PRO'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 flex items-center justify-center text-[#C4B5FD] shrink-0">
            {isPro ? <Crown className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
        </div>

        {/* 6. Última Atividade */}
        <div className="gio-card p-5 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
              Última Atividade
            </span>
            <div className="text-sm font-bold text-[#F8FAFC] truncate" title={lastActivityLabel}>
              {lastActivityLabel}
            </div>
            <p className="text-xs text-[#94A3B8] font-mono tabular-nums">
              {latestWinner
                ? formatDateTime(latestWinner.drawnAt)
                : latestLiveSession
                ? formatDateTime(latestLiveSession.startedAt)
                : 'Sincronizado automaticamente'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </section>

      {/* 3. Prioritized Shortcuts Grid (Ordered by Operational Importance) */}
      <section aria-label="Atalhos Rápidos" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#F8FAFC]">
            Módulos e Ferramentas Principais
          </h2>
          <span className="text-xs text-[#94A3B8]">
            Selecione a modalidade de sorteio ou gestão desejada
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Priority 1: Mesa de Sorteio Oficial (Globo & Roleta) */}
          <button
            type="button"
            onClick={onOpenTraditionalDraw}
            className="gio-card gio-card-interactive p-5 text-left flex flex-col justify-between gap-4 group border-[#0866F5]/45"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="gio-badge-free">Gratuito</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F8FAFC] group-hover:text-[#00A9FF] transition-colors">
                  Mesa de Sorteio Oficial
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Globo Digital, Roleta Proporcional e Battle Royale com certificado SHA-256.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#00A9FF] inline-flex items-center gap-1">
              <span>Abrir Mesa de Sorteio</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* Priority 2: TikTok LIVE PRO */}
          <button
            type="button"
            onClick={() => onOpenLivePro('feed')}
            className="gio-card gio-card-interactive p-5 text-left flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 flex items-center justify-center text-[#C4B5FD]">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="gio-badge-pro">
                  {isPro ? <Crown className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>PRO</span>
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F8FAFC] group-hover:text-[#C4B5FD] transition-colors">
                  Sorteio por Presentes LIVE
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Conecte sua transmissão, capture presentes em tempo real e emita bilhetes automáticos.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#C4B5FD] inline-flex items-center gap-1">
              <span>Abrir TikTok LIVE PRO</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* Priority 3: Sorteador de Comentários PRO */}
          <button
            type="button"
            onClick={isPro ? onOpenCommentsSorter : onOpenSubscription}
            className="gio-card gio-card-interactive p-5 text-left flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/40 flex items-center justify-center text-[#C4B5FD]">
                  {isPro ? <MessageSquare className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                </div>
                <span className="gio-badge-pro">
                  {isPro ? <Crown className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>PRO</span>
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F8FAFC] group-hover:text-[#C4B5FD] transition-colors">
                  Sorteador de Comentários
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  {isPro
                    ? 'Sorteie entre comentários do TikTok, palavras-chave ou listas de arrobas.'
                    : 'Recurso exclusivo do plano PRO. Clique para fazer upgrade e desbloquear.'}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#C4B5FD] inline-flex items-center gap-1">
              <span>{isPro ? 'Abrir Sorteador' : 'Desbloquear no Plano PRO'}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>

          {/* Priority 4: Participantes & Consulta */}
          <button
            type="button"
            onClick={onOpenParticipants}
            className="gio-card gio-card-interactive p-5 text-left flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997]">
                  <Search className="w-5 h-5" />
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[#0B1730] border border-[#182943] text-[11px] font-mono font-semibold text-[#94A3B8] tabular-nums">
                  {participants.length} inscritos
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#F8FAFC] group-hover:text-[#20C997] transition-colors">
                  Participantes & Consulta
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                  Cadastre participantes, importe listas CSV e consulte bilhetes por @usuário.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-[#20C997] inline-flex items-center gap-1">
              <span>Gerenciar Participantes</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>
      </section>

      {/* 4. Recent Winners & Recent TikTok LIVE Sessions */}
      <section
        aria-label="Últimos Ganhadores e Transmissões Recentes"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* Left (7 cols): Recent Winners */}
        <div className="lg:col-span-7 gio-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#182943]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F5B942]/15 border border-[#F5B942]/35 flex items-center justify-center text-[#F5B942]">
                <Trophy className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">
                Últimos Ganhadores Registrados
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenReports}
              className="text-xs font-semibold text-[#00A9FF] hover:text-[#35B9F5] hover:underline transition-colors"
            >
              Ver relatórios completos
            </button>
          </div>

          {winners.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0B1730] border border-[#182943] text-center space-y-1.5">
              <p className="text-sm font-semibold text-[#F8FAFC]">
                Nenhum ganhador registrado na sessão atual
              </p>
              <p className="text-xs text-[#94A3B8]">
                Abra a Mesa de Sorteio acima para realizar o primeiro sorteio auditado.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {winners.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] flex items-center justify-between gap-3 text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2.5 py-1 rounded-lg bg-[#101F3D] border border-[#F5B942]/40 font-mono font-bold text-[#F5B942] tabular-nums shrink-0">
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
                    className="px-3 py-1.5 rounded-lg bg-[#101F3D] hover:bg-[#182943] text-[#F5B942] border border-[#F5B942]/35 text-xs font-semibold shrink-0 transition"
                  >
                    Cartão VIP
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right (5 cols): Recent TikTok LIVE Sessions */}
        <div className="lg:col-span-5 gio-card p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#182943]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#8B7CFF]/15 border border-[#8B7CFF]/35 flex items-center justify-center text-[#C4B5FD]">
                <Radio className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-[#F8FAFC]">
                Transmissões TikTok LIVE
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('motor1')}
              className="text-xs font-semibold text-[#C4B5FD] hover:text-[#8B7CFF] hover:underline transition-colors"
            >
              Gerenciar LIVES
            </button>
          </div>

          {liveSessions.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0B1730] border border-[#182943] text-center space-y-1.5">
              <p className="text-sm font-semibold text-[#F8FAFC]">
                Nenhuma transmissão conectada recentemente
              </p>
              <p className="text-xs text-[#94A3B8]">
                Conecte uma LIVE no módulo TikTok LIVE PRO para visualizar as coletas aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {liveSessions.slice(0, 4).map((sess) => (
                <div
                  key={sess.sessionId}
                  className="p-3 rounded-xl bg-[#0B1730] border border-[#182943] flex items-center justify-between gap-3 text-xs sm:text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#F8FAFC] truncate">
                      @{sess.username} — {sess.raffleTitle || sess.roomTitle || 'Sorteio LIVE'}
                    </div>
                    <div className="text-xs text-[#94A3B8] font-mono tabular-nums">
                      {(sess.totalCoins || 0).toLocaleString('pt-BR')} moedas ·{' '}
                      {(sess.uniqueSupportersCount || 0).toLocaleString('pt-BR')} participantes
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <span className="font-bold text-sm text-[#00A9FF]">
                      {(sess.currentTicketCounter || 0).toLocaleString('pt-BR')}
                    </span>
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
