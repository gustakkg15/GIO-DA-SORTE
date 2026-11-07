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
    <div className="space-y-8 animate-fade-in">
      {/* Primary Hero Card with Single Dominant Action: + CRIAR NOVO SORTEIO */}
      <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-[#050814] via-[#0A1128] to-[#0F172A] border border-[#E11D48]/50 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4 max-w-2xl">
          <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-[#050814] border border-[#E11D48]/45 items-center justify-center p-1.5 shadow-lg shadow-[#E11D48]/20 shrink-0">
            <img
              src="/logo.png"
              alt="Logo Oficial GIO DA SORTE PRO"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="font-semibold text-[#FDA4AF]">Painel Principal</span>
              <span aria-hidden="true">·</span>
              <span>Prêmio Atual: {settings.prizeName || settings.currentPrize || 'Prêmio Principal'}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onOpenOnboardingTour}
                className="text-sky-400 hover:text-sky-300 underline font-medium inline-flex items-center gap-1"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Ver tutorial rápido</span>
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
              Bem-vindo ao <span className="text-[#FDA4AF]">GIO DA SORTE PRO</span>
            </h1>

            <p className="text-sm text-slate-300 leading-relaxed">
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
            className="min-h-[52px] px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] text-white font-display font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-[#E11D48]/30 ring-1 ring-[#FDA4AF]/35 hover:brightness-110 active:scale-98 transition"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>+ CRIAR NOVO SORTEIO</span>
          </button>
        </div>
      </div>

      {/* Essential Metrics Grid (6 Objective Indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Total de Sorteios Realizados */}
        <div className="p-5 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400">Total de Sorteios Realizados</span>
            <div className="text-2xl sm:text-3xl font-display font-black text-white tabular-nums">
              {totalRafflesCompleted}
            </div>
            <p className="text-xs text-slate-400">
              {winners.length} na mesa atual · {liveSessions.length} sessões LIVE salvas
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#E11D48]/15 border border-[#E11D48]/40 flex items-center justify-center text-[#FDA4AF] shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Total de Participantes */}
        <div className="p-5 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400">Total de Participantes</span>
            <div className="text-2xl sm:text-3xl font-display font-black text-white tabular-nums">
              {totalParticipantsCount}
            </div>
            <p className="text-xs text-slate-400">
              {participants.length} na lista local · {liveSupportersTotal} apoiadores em LIVE
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Total de Bilhetes Emitidos */}
        <div className="p-5 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400">Total de Bilhetes Emitidos</span>
            <div className="text-2xl sm:text-3xl font-display font-black text-[#FDA4AF] tabular-nums">
              {totalTicketsIssued}
            </div>
            <p className="text-xs text-slate-400">
              {computed.usedCount} bilhetes locais · {liveTicketsTotal} bilhetes automáticos LIVE
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#E11D48]/15 border border-[#E11D48]/40 flex items-center justify-center text-[#FDA4AF] shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Status da Conexão TikTok */}
        <div className="p-5 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-semibold text-slate-400">Status da Conexão TikTok LIVE</span>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  liveConnectionState === 'CONNECTED'
                    ? 'bg-emerald-400 animate-pulse'
                    : liveConnectionState === 'CONNECTING' || liveConnectionState === 'RECONNECTING'
                    ? 'bg-amber-400 animate-pulse'
                    : liveConnectionState === 'ERROR'
                    ? 'bg-rose-400'
                    : 'bg-slate-500'
                }`}
              />
              <span className="text-base sm:text-lg font-display font-bold text-white truncate">
                {liveDashboardStatusText}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenLivePro('feed')}
              className="text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 pt-0.5"
            >
              <span>{liveDashboardActionText}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#E11D48]/15 border border-[#E11D48]/40 flex items-center justify-center text-[#FDA4AF] shrink-0">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        {/* 5. Situação da Assinatura */}
        <div className="p-5 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-400">Situação da Assinatura</span>
            <div className="text-base sm:text-lg font-display font-bold text-white flex items-center gap-2">
              {isPro ? (
                <span className="text-[#FDA4AF]">Plano PRO Ativo</span>
              ) : (
                <span className="text-slate-200">Plano Gratuito (FREE)</span>
              )}
            </div>
            <button
              type="button"
              onClick={onOpenSubscription}
              className="text-xs font-semibold text-[#FDA4AF] hover:underline inline-flex items-center gap-1 pt-0.5"
            >
              <span>{isPro ? 'Ver recursos do meu plano' : 'Conhecer vantagens do PRO'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/45 flex items-center justify-center text-[#FDA4AF] shrink-0">
            {isPro ? <Crown className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
        </div>

        {/* 6. Última Atividade */}
        <div className="p-5 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <span className="text-xs font-semibold text-slate-400">Última Atividade Registrada</span>
            <div className="text-sm sm:text-base font-bold text-white truncate">{lastActivityLabel}</div>
            <p className="text-xs text-slate-400">
              {latestWinner
                ? formatDateTime(latestWinner.drawnAt)
                : latestLiveSession
                ? formatDateTime(latestLiveSession.startedAt)
                : 'Sincronizado automaticamente'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Shortcuts Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-display font-bold text-white">
            Atalhos Rápidos para Principais Funções
          </h2>
          <span className="text-xs text-slate-400">Escolha o que deseja fazer agora</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Shortcut 1: TikTok LIVE PRO */}
          <button
            type="button"
            onClick={() => onOpenLivePro('feed')}
            className="p-5 rounded-2xl bg-gradient-to-b from-[#0F172A] to-[#0A1128] hover:border-[#F43F5E] border border-[#E11D48]/50 text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#E11D48]/20 border border-[#E11D48]/50 flex items-center justify-center text-[#FDA4AF]">
                  <Radio className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-[#FDA4AF] flex items-center gap-1">
                  {isPro ? <Crown className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>PRO</span>
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-display font-bold text-white group-hover:text-[#FDA4AF] transition">
                Sorteio por Presentes da LIVE
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Conecte sua LIVE, capture presentes em tempo real e emita bilhetes automáticos.
              </p>
            </div>
            <span className="text-xs font-bold text-[#FDA4AF] inline-flex items-center gap-1">
              <span>Abrir TikTok LIVE PRO</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Shortcut 2: TikTok Comments Sorter */}
          <button
            type="button"
            onClick={onOpenCommentsSorter}
            className="p-5 rounded-2xl bg-[#0A1128]/90 hover:border-sky-400/60 border border-blue-900/60 text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-400/30 flex items-center justify-center text-sky-300">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-emerald-400">Gratuito</span>
              </div>
              <h3 className="text-sm sm:text-base font-display font-bold text-white group-hover:text-sky-300 transition">
                Sorteador de Comentários
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sorteie entre comentários do TikTok, palavras-chave ou listas rápidas de arrobas.
              </p>
            </div>
            <span className="text-xs font-bold text-sky-300 inline-flex items-center gap-1">
              <span>Abrir Sorteador</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Shortcut 3: Traditional Drum & Wheel */}
          <button
            type="button"
            onClick={onOpenTraditionalDraw}
            className="p-5 rounded-2xl bg-[#0A1128]/90 hover:border-sky-400/60 border border-blue-900/60 text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-emerald-400">Gratuito</span>
              </div>
              <h3 className="text-sm sm:text-base font-display font-bold text-white group-hover:text-sky-300 transition">
                Mesa de Sorteio (Tambor & Roleta)
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sorteio proporcional por moedas com Tambor 3D, Roleta da Fortuna e Battle Royale.
              </p>
            </div>
            <span className="text-xs font-bold text-sky-300 inline-flex items-center gap-1">
              <span>Ir para Mesa de Sorteio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>

          {/* Shortcut 4: Participants & Ticket Lookup */}
          <button
            type="button"
            onClick={onOpenParticipants}
            className="p-5 rounded-2xl bg-[#0A1128]/90 hover:border-sky-400/60 border border-blue-900/60 text-left transition flex flex-col justify-between gap-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                  <Search className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-semibold text-slate-400">{participants.length} cadastrados</span>
              </div>
              <h3 className="text-sm sm:text-base font-display font-bold text-white group-hover:text-emerald-300 transition">
                Participantes & Consulta
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Pesquise por @usuário ou #bilhete, importe planilhas e consulte o histórico.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-300 inline-flex items-center gap-1">
              <span>Gerenciar Participantes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        </div>
      </div>

      {/* Recent Winners & Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-5 sm:p-6 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-display font-bold text-white">
              Últimos Ganhadores Registrados
            </h3>
            <button
              type="button"
              onClick={onOpenReports}
              className="text-xs font-semibold text-sky-400 hover:underline"
            >
              Ver histórico completo
            </button>
          </div>

          {winners.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#050814]/60 border border-slate-800/80 text-center space-y-2">
              <p className="text-xs sm:text-sm font-semibold text-slate-300">
                Ainda não há ganhadores salvos na sessão atual.
              </p>
              <p className="text-xs text-slate-400">
                Clique em &ldquo;+ Criar Novo Sorteio&rdquo; no topo para realizar seu primeiro sorteio.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {winners.slice(0, 5).map((w) => (
                <div key={w.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono font-bold text-[#FDA4AF]">#{w.number}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{w.name}</div>
                      <div className="text-slate-400 truncate">
                        {w.prize} · {formatDateTime(w.drawnAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenVictoryCard(w)}
                    className="px-3 py-1.5 rounded-lg bg-[#E11D48]/20 hover:bg-[#E11D48]/35 text-[#FDA4AF] border border-[#E11D48]/45 font-semibold shrink-0 transition"
                  >
                    Ver Cartão
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent TikTok LIVE Sessions Summary */}
        <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl bg-[#0A1128]/85 border border-blue-900/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm sm:text-base font-display font-bold text-white">
              Transmissões TikTok LIVE Recentes
            </h3>
            <button
              type="button"
              onClick={() => onOpenLivePro('motor1')}
              className="text-xs font-semibold text-[#FDA4AF] hover:underline"
            >
              Gerenciar LIVES
            </button>
          </div>

          {liveSessions.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#050814]/60 border border-slate-800/80 text-center space-y-2">
              <p className="text-xs sm:text-sm font-semibold text-slate-300">
                Nenhuma transmissão conectada recentemente.
              </p>
              <p className="text-xs text-slate-400">
                Ao conectar uma LIVE no módulo TikTok LIVE PRO, as sessões e bilhetes aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {liveSessions.slice(0, 4).map((sess) => (
                <div key={sess.sessionId} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      @{sess.username} — {sess.raffleTitle || sess.roomTitle || 'Sorteio LIVE'}
                    </div>
                    <div className="text-slate-400">
                      {sess.totalCoins || 0} moedas · {sess.uniqueSupportersCount || 0} participantes
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    <span className="font-bold text-[#FDA4AF]">{sess.currentTicketCounter || 0}</span>
                    <span className="block text-[10px] text-slate-400">bilhetes</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
