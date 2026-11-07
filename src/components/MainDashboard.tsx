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

export const ProFeatureBadge: React.FC<{ isPro: boolean }> = ({ isPro }) => (
  <span
    data-testid="comments-sorter-pro-badge"
    className="gio-badge-pro inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#8B7CFF]/15 text-[#C4B5FD] border border-[#8B7CFF]/40 text-[11px] font-bold uppercase tracking-wider shadow-[0_0_12px_rgba(139,124,255,0.18)]"
  >
    {isPro ? (
      <Crown className="w-3 h-3 text-[#8B7CFF] shrink-0" />
    ) : (
      <Lock className="w-3 h-3 text-[#C4B5FD] shrink-0" />
    )}
    <span className="text-[#C4B5FD]">PRO</span>
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
    <div className="space-y-8 animate-fade-in min-w-0 pb-6">
      {/* 1. Hero Operational Console — Foco Editorial e Hierarquia Clara */}
      <section
        aria-label="Console Operacional Principal"
        className="relative overflow-hidden rounded-2xl bg-[#101F3D] border border-white/10 shadow-xl"
      >
        {/* Subtle Radial Atmosphere and Top Hairline Accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 right-1/4 w-96 h-96 bg-[#0866F5]/10 rounded-full blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0866F5] via-[#00A9FF] to-[#8B7CFF]"
        />

        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3.5 max-w-2xl min-w-0">
            {/* Context & Tag */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0866F5]/15 border border-[#00A9FF]/30 font-mono text-[11px] font-bold text-[#00A9FF] uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Painel Operacional · CSPRNG Ativo
              </span>
              <span className="font-mono text-xs text-slate-400 font-semibold tabular-nums">
                #{raffleCode}
              </span>
              <button
                type="button"
                onClick={onOpenOnboardingTour}
                className="px-2.5 py-0.5 rounded-md bg-[#0B1730] hover:bg-white/[0.06] border border-white/10 text-xs text-[#00A9FF] font-medium inline-flex items-center gap-1 transition-all"
              >
                <Compass className="w-3.5 h-3.5 shrink-0" />
                <span>Tutorial rápido</span>
              </button>
            </div>

            {/* Main Title */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                Controle de Sorteios & Transmissões
              </h1>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                Gerencie participantes, conecte lives do TikTok e realize sorteios auditáveis com integridade matemática.
              </p>
            </div>

            {/* Active Draw Metadata Strip */}
            <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#00A9FF] shrink-0" />
                <span>Sorteio ativo:</span>
                <strong className="text-white font-semibold">{raffleTitle}</strong>
              </div>
              <span className="hidden sm:inline text-slate-700">•</span>
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#F5B942] shrink-0" />
                <span>Prêmio em disputa:</span>
                <strong className="text-[#F5B942] font-semibold">{currentPrize}</strong>
              </div>
              <span className="hidden sm:inline text-slate-700">•</span>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#35B9F5] shrink-0" />
                <span>Taxa de conversão:</span>
                <strong className="font-mono text-white tabular-nums font-medium">
                  {settings.rate} moedas = 1 bilhete
                </strong>
              </div>
            </div>
          </div>

          {/* Primary Action Buttons with Clear Visual Weight */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenTraditionalDraw}
              className="gio-btn-primary px-6 py-3.5 text-sm font-bold shadow-lg shadow-blue-600/25"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>Abrir Mesa de Sorteio</span>
            </button>

            <button
              type="button"
              onClick={onStartNewRaffleWizard}
              className="gio-btn-secondary px-5 py-3.5 text-sm font-semibold"
            >
              <Plus className="w-4 h-4 text-[#00A9FF] shrink-0" />
              <span>Criar Novo Sorteio</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Structured Operational KPIs — Hierarquia e Clareza Visual */}
      <section aria-label="Indicadores Operacionais Chave" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
            Métricas em Tempo Real
          </h2>
          <span className="text-xs text-slate-400 font-mono">
            {formatDateTime(Date.now())}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Bilhetes Emitidos (Métrica Primária) */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 border-l-4 border-l-[#0866F5]">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">
                Bilhetes Emitidos
              </span>
              <Ticket className="w-4 h-4 text-[#00A9FF]" />
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-white tabular-nums tracking-tight">
                {totalTicketsIssued.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-slate-400 mt-1 tabular-nums">
                {computed.usedCount} locais · {liveTicketsTotal} via TikTok
              </p>
            </div>
          </div>

          {/* KPI 2: Total de Participantes */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">
                Participantes
              </span>
              <Users className="w-4 h-4 text-[#00A9FF]" />
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-white tabular-nums tracking-tight">
                {totalParticipantsCount.toLocaleString('pt-BR')}
              </div>
              <p className="text-xs text-slate-400 mt-1 tabular-nums">
                {participants.length} na lista · {liveSupportersTotal} em transmissão
              </p>
            </div>
          </div>

          {/* KPI 3: Status TikTok LIVE */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">
                TikTok LIVE
              </span>
              <Radio
                className={`w-4 h-4 ${
                  liveConnectionState === 'CONNECTED' ? 'text-[#20C997]' : 'text-slate-400'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    liveConnectionState === 'CONNECTED'
                      ? 'bg-[#20C997] animate-pulse'
                      : liveConnectionState === 'CONNECTING' ||
                        liveConnectionState === 'RECONNECTING'
                      ? 'bg-[#F5B942] animate-pulse'
                      : liveConnectionState === 'ERROR'
                      ? 'bg-[#F05262]'
                      : 'bg-slate-500'
                  }`}
                />
                <span className="text-base font-bold text-white truncate">
                  {liveDashboardStatusText}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenLivePro('feed')}
                className="text-xs font-semibold text-[#00A9FF] hover:text-[#35B9F5] inline-flex items-center gap-1 mt-1 transition-colors"
              >
                <span>{liveDashboardActionText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KPI 4: Plano e Assinatura */}
          <div className="gio-card p-5 flex flex-col justify-between gap-3 border-r-4 border-r-[#8B7CFF]/50">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold tracking-wider uppercase">
                Seu Plano
              </span>
              <Crown className="w-4 h-4 text-[#8B7CFF]" />
            </div>
            <div>
              <div className="text-base font-bold text-white flex items-center gap-2">
                {isPro ? (
                  <span className="text-[#C4B5FD]">Plano PRO Ativo</span>
                ) : (
                  <span className="text-slate-200">Plano Gratuito (FREE)</span>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenSubscription}
                className="text-xs font-semibold text-[#C4B5FD] hover:text-[#8B7CFF] inline-flex items-center gap-1 mt-1 transition-colors"
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
          <h2 className="text-base font-bold text-white tracking-tight">
            Modalidades de Sorteio & Ferramentas
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Selecione o motor de sorteio mais apropriado para sua transmissão ou evento.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Mesa de Sorteio Oficial */}
          <div
            onClick={onOpenTraditionalDraw}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-white/10 hover:border-[#0866F5]/60"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenTraditionalDraw();
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#0866F5]/15 border border-[#0866F5]/30 flex items-center justify-center text-[#00A9FF]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="gio-badge-free">Gratuito</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-[#00A9FF] transition-colors">
                  Mesa de Sorteio Oficial
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Globo Digital, Roleta Proporcional e Battle Royale com validação criptográfica SHA-256.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-bold text-[#00A9FF] inline-flex items-center gap-1">
                <span>Abrir mesa</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {computed.eligibleTickets.length} elegíveis
              </span>
            </div>
          </div>

          {/* Card 2: TikTok LIVE PRO */}
          <div
            onClick={() => onOpenLivePro('feed')}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-white/10 hover:border-[#8B7CFF]/60"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenLivePro('feed');
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/30 flex items-center justify-center text-[#C4B5FD]">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="gio-badge-pro">
                  {isPro ? <Crown className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>PRO</span>
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-[#C4B5FD] transition-colors">
                  Sorteio por Presentes LIVE
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Conecte sua transmissão, capture presentes ao vivo e converta moedas em bilhetes imediatos.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-bold text-[#C4B5FD] inline-flex items-center gap-1">
                <span>Painel da LIVE</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                {liveSessions.length} sessões
              </span>
            </div>
          </div>

          {/* Card 3: Sorteador de Comentários PRO (Preservando ID & Data Attributes) */}
          <div
            id="comments-sorter-card"
            onClick={handleCommentsSorterAccess}
            data-pro-exclusive="true"
            data-pro-locked={isFreeUser}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-white/10 hover:border-[#8B7CFF]/60"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleCommentsSorterAccess();
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#8B7CFF]/15 border border-[#8B7CFF]/30 flex items-center justify-center text-[#C4B5FD]">
                  <MessageSquare className="w-5 h-5 text-[#8B7CFF]" />
                </div>
                <ProFeatureBadge isPro={isPro} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-[#C4B5FD] transition-colors">
                  Sorteador de Comentários
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Filtre por palavras-chave, @arrobas e selecione vencedores com transparência total.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-bold text-[#C4B5FD] inline-flex items-center gap-1">
                <span>{isPro ? 'Abrir sorteador' : 'Desbloquear no PRO'}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#8B7CFF] group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                PRO Exclusivo
              </span>
            </div>
          </div>

          {/* Card 4: Participantes & Consulta */}
          <div
            onClick={onOpenParticipants}
            className="gio-card gio-card-interactive p-6 flex flex-col justify-between gap-5 group border-white/10 hover:border-[#20C997]/60"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenParticipants();
            }}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-xl bg-[#20C997]/15 border border-[#20C997]/30 flex items-center justify-center text-[#20C997]">
                  <Search className="w-5 h-5" />
                </div>
                <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums">
                  {participants.length} inscritos
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold text-white group-hover:text-[#20C997] transition-colors">
                  Participantes & Cotas
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  Cadastre participantes, importe arquivos CSV e consulte bilhetes em segundos.
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-xs font-bold text-[#20C997] inline-flex items-center gap-1">
                <span>Gerenciar cotas</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="font-mono text-[11px] text-slate-400">
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
              <div className="w-8 h-8 rounded-lg bg-[#F5B942]/15 border border-[#F5B942]/30 flex items-center justify-center text-[#F5B942]">
                <Trophy className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">
                Últimos Ganhadores Registrados
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenReports}
              className="text-xs font-semibold text-[#00A9FF] hover:text-[#35B9F5] transition-colors"
            >
              Ver relatórios completos &rarr;
            </button>
          </div>

          {winners.length === 0 ? (
            <div className="py-8 px-6 rounded-xl bg-[#081226] border border-white/5 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-200">
                Nenhum ganhador registrado na sessão atual
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Abra a Mesa de Sorteio acima para realizar o primeiro sorteio auditado e emitir o certificado.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {winners.slice(0, 5).map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl bg-[#081226] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="px-3 py-1 rounded-lg bg-[#101F3D] border border-[#F5B942]/40 font-mono font-bold text-[#F5B942] tabular-nums shrink-0 text-sm">
                      #{w.number}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm truncate">{w.name}</div>
                      <div className="text-xs text-slate-400 truncate tabular-nums mt-0.5">
                        {w.prize} · {formatDateTime(w.drawnAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    className="px-3 py-1.5 rounded-lg bg-[#101F3D] hover:bg-[#14274E] text-[#F5B942] border border-[#F5B942]/30 text-xs font-semibold shrink-0 transition-all"
                  >
                    Cartão VIP
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right (5 cols): Transmissões TikTok LIVE */}
        <div className="lg:col-span-5 gio-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#8B7CFF]/15 border border-[#8B7CFF]/30 flex items-center justify-center text-[#C4B5FD]">
                <Radio className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">
                Transmissões TikTok LIVE
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('motor1')}
              className="text-xs font-semibold text-[#C4B5FD] hover:text-[#8B7CFF] transition-colors"
            >
              Gerenciar &rarr;
            </button>
          </div>

          {liveSessions.length === 0 ? (
            <div className="py-8 px-6 rounded-xl bg-[#081226] border border-white/5 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-200">
                Nenhuma transmissão registrada
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Conecte uma LIVE no módulo TikTok LIVE PRO para visualizar as coletas de moedas e presentes aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {liveSessions.slice(0, 4).map((sess) => (
                <div
                  key={sess.sessionId}
                  className="p-3.5 rounded-xl bg-[#081226] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white text-sm truncate">
                      @{sess.username}
                    </div>
                    <div className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                      {(sess.totalCoins || 0).toLocaleString('pt-BR')} moedas ·{' '}
                      {(sess.uniqueSupportersCount || 0).toLocaleString('pt-BR')} apoiadores
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <span className="font-bold text-sm text-[#00A9FF]">
                      {(sess.currentTicketCounter || 0).toLocaleString('pt-BR')}
                    </span>
                    <span className="block text-[11px] text-slate-400">bilhetes</span>
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
