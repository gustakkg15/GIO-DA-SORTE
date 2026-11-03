import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Radio,
  Cpu,
  Clock,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Lock,
  Terminal,
  Zap,
  Sliders,
  ArrowUpRight,
  Bug,
  Eye,
  ChevronRight,
  Filter,
  Search,
  Trash2,
  ShieldAlert,
  Copy,
  FileText,
  Check,
  X,
} from 'lucide-react';
import {
  ComponentHealthStatus,
  LiveSystemMonitorSnapshot,
  MilestoneEventSummary,
  TikTokDiagnostic6Stages,
  TikTokDiagnosticStats,
} from '../types.js';

interface LiveSystemMonitorProps {
  sessionId: string;
  roomUsername: string;
  isAdminAuthorized: boolean;
  adminLabel?: string;
  onTriggerQueueRecovery: () => Promise<void>;
  isRecoveringQueue: boolean;
  externalSnapshot?: LiveSystemMonitorSnapshot | null;
}

const STATUS_BADGE_STYLES: Record<
  ComponentHealthStatus,
  { bg: string; border: string; text: string; dot: string; label: string }
> = {
  CONNECTED: {
    bg: 'bg-emerald-950/70',
    border: 'border-emerald-500/40',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
    label: 'CONNECTED',
  },
  DEGRADED: {
    bg: 'bg-amber-950/70',
    border: 'border-amber-500/40',
    text: 'text-amber-300',
    dot: 'bg-amber-400 animate-pulse',
    label: 'DEGRADED',
  },
  DISCONNECTED: {
    bg: 'bg-slate-900/90',
    border: 'border-slate-700',
    text: 'text-slate-400',
    dot: 'bg-slate-500',
    label: 'DISCONNECTED',
  },
  ERROR: {
    bg: 'bg-rose-950/80',
    border: 'border-rose-500/50',
    text: 'text-rose-300',
    dot: 'bg-rose-400 animate-ping',
    label: 'ERROR',
  },
  UNKNOWN: {
    bg: 'bg-indigo-950/60',
    border: 'border-indigo-500/30',
    text: 'text-indigo-300',
    dot: 'bg-indigo-400',
    label: 'UNKNOWN',
  },
};

function formatUtcTime(epochMs?: number | null): string {
  if (!epochMs || !Number.isFinite(epochMs)) return '—';
  const d = new Date(epochMs);
  return `${d.toLocaleTimeString('pt-BR', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')} UTC`;
}

const MilestoneCard: React.FC<{
  title: string;
  subtitle: string;
  accentColor: 'gold' | 'sapphire' | 'emerald' | 'cyan';
  milestone: MilestoneEventSummary | null;
}> = ({ title, subtitle, accentColor, milestone }) => {
  const borderMap = {
    gold: 'border-[#E11D48]/40 bg-gradient-to-b from-[#0F1B3D]/95 to-[#0A1128]/95',
    sapphire: 'border-blue-500/35 bg-gradient-to-b from-[#0F1B3D]/95 to-[#0A1128]/95',
    emerald: 'border-emerald-500/35 bg-gradient-to-b from-[#0F1B3D]/95 to-[#0A1128]/95',
    cyan: 'border-cyan-500/35 bg-gradient-to-b from-[#0F1B3D]/95 to-[#0A1128]/95',
  };

  const titleColorMap = {
    gold: 'text-[#FDA4AF]',
    sapphire: 'text-blue-300',
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
  };

  return (
    <div className={`p-4 rounded-xl border ${borderMap[accentColor]} shadow-lg space-y-2.5`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <h4 className={`text-xs font-bold uppercase tracking-wider ${titleColorMap[accentColor]}`}>
            {title}
          </h4>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
        {milestone?.sequenceNumber !== undefined && (
          <span className="px-2 py-0.5 rounded bg-[#E11D48]/15 border border-[#E11D48]/40 text-[#FDA4AF] font-mono text-[10px] font-bold tabular-nums">
            seq #{milestone.sequenceNumber}
          </span>
        )}
      </div>

      {!milestone ? (
        <div className="py-5 text-center text-xs text-slate-500 font-mono">
          Aguardando evento nesta etapa...
        </div>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white truncate">{milestone.displayHandle}</span>
            <span className="font-mono font-bold text-[#FDA4AF] tabular-nums">
              +{milestone.coinsGranted} moedas
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-300">
            <span>
              {milestone.giftName} <strong className="font-mono">({milestone.repeatCount}x)</strong>
            </span>
            {milestone.latencyMs !== undefined && (
              <span className="font-mono text-cyan-300 tabular-nums">{milestone.latencyMs} ms</span>
            )}
          </div>
          {milestone.ticketNumbers && milestone.ticketNumbers.length > 0 && (
            <div className="text-[10px] font-mono text-emerald-300 truncate">
              Bilhetes: #{milestone.ticketNumbers.slice(0, 5).join(', #')}
              {milestone.ticketNumbers.length > 5 ? ` (+${milestone.ticketNumbers.length - 5})` : ''}
            </div>
          )}
          <div className="pt-1 border-t border-white/[0.06] text-[10px] font-mono text-slate-400 space-y-0.5">
            <div className="truncate">ID: {milestone.eventId}</div>
            <div>
              Timestamp:{' '}
              {formatUtcTime(
                milestone.confirmedByBrowserAt ||
                  milestone.deliveredAt ||
                  milestone.persistedAt ||
                  milestone.receivedAt
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const LiveSystemMonitor: React.FC<LiveSystemMonitorProps> = ({
  sessionId,
  roomUsername,
  isAdminAuthorized,
  adminLabel = 'Administrador Autorizado',
  onTriggerQueueRecovery,
  isRecoveringQueue,
  externalSnapshot,
}) => {
  const [snapshot, setSnapshot] = useState<LiveSystemMonitorSnapshot | null>(externalSnapshot || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(2000);
  const [retentionInput, setRetentionInput] = useState<string>('1000');
  const [isUpdatingRetention, setIsUpdatingRetention] = useState<boolean>(false);

  const fetchSnapshot = useCallback(async () => {
    if (!isAdminAuthorized) return;
    try {
      setIsLoading(true);
      const res = await fetch(
        `/api/tiktok/monitor/snapshot?sessionId=${encodeURIComponent(sessionId)}&admin=1`,
        {
          headers: {
            'x-gio-admin-access': 'authorized',
          },
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }
      const data = (await res.json()) as LiveSystemMonitorSnapshot;
      setSnapshot(data);
      setRetentionInput(String(data.sseRecovery.retentionMaxEventsPerSession || 1000));
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isAdminAuthorized]);

  useEffect(() => {
    if (externalSnapshot) {
      setSnapshot(externalSnapshot);
    }
  }, [externalSnapshot]);

  useEffect(() => {
    fetchSnapshot();
    if (!autoRefreshMs || !isAdminAuthorized) return;
    const timer = setInterval(fetchSnapshot, autoRefreshMs);
    return () => clearInterval(timer);
  }, [fetchSnapshot, autoRefreshMs, isAdminAuthorized]);

  const handleSaveRetention = async () => {
    const val = parseInt(retentionInput, 10);
    if (!val || val < 10) return;
    setIsUpdatingRetention(true);
    try {
      await fetch('/api/tiktok/monitor/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
        },
        body: JSON.stringify({ maxEventsPerSession: val }),
      });
      await fetchSnapshot();
    } catch {
      // ignore
    } finally {
      setIsUpdatingRetention(false);
    }
  };

  // ==========================================
  // LIVE EVENT DEBUGGER (6-STAGE DIAGNOSTIC) STATE & ACTIONS
  // ==========================================
  const [activeTab, setActiveTab] = useState<'telemetry' | 'debugger'>('telemetry');
  const [diagStats, setDiagStats] = useState<TikTokDiagnosticStats | null>(null);
  const [diagEvents, setDiagEvents] = useState<TikTokDiagnostic6Stages[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<TikTokDiagnostic6Stages | null>(null);
  const [diagFilterUser, setDiagFilterUser] = useState<string>('');
  const [diagFilterOrigin, setDiagFilterOrigin] = useState<string>('ALL');
  const [diagFilterStatus, setDiagFilterStatus] = useState<string>('ALL');
  const [isTogglingDebug, setIsTogglingDebug] = useState<boolean>(false);
  const [toggleFeedback, setToggleFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isLoadingDiag, setIsLoadingDiag] = useState<boolean>(false);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  const fetchDiagnosticData = useCallback(async () => {
    if (!isAdminAuthorized) return;
    try {
      setIsLoadingDiag(true);
      const params = new URLSearchParams();
      if (sessionId) params.set('sessionId', sessionId);
      if (diagFilterOrigin !== 'ALL') params.set('origin', diagFilterOrigin);
      if (diagFilterStatus !== 'ALL') params.set('status', diagFilterStatus);
      if (diagFilterUser.trim()) params.set('userQuery', diagFilterUser.trim());
      params.set('limit', '100');

      const [resStats, resEvents] = await Promise.all([
        fetch('/api/tiktok/diagnostic/status', {
          headers: { 'x-gio-admin-access': 'authorized' },
        }),
        fetch(`/api/tiktok/diagnostic/events?${params.toString()}`, {
          headers: { 'x-gio-admin-access': 'authorized' },
        }),
      ]);

      if (resStats.ok) {
        const statsData = await resStats.json();
        setDiagStats(statsData.stats);
      }
      if (resEvents.ok) {
        const eventsData = await resEvents.json();
        setDiagEvents(eventsData.events || []);
      }
    } catch {
      // Diagnostic query failure does not crash the UI
    } finally {
      setIsLoadingDiag(false);
    }
  }, [sessionId, isAdminAuthorized, diagFilterOrigin, diagFilterStatus, diagFilterUser]);

  useEffect(() => {
    if (activeTab === 'debugger') {
      fetchDiagnosticData();
      const interval = setInterval(fetchDiagnosticData, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchDiagnosticData]);

  const handleToggleDebug = async (nextState: boolean) => {
    setIsTogglingDebug(true);
    setToggleFeedback(null);
    try {
      const res = await fetch('/api/tiktok/diagnostic/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
          'x-gio-admin-email': 'gustakkg15@gmail.com',
        },
        body: JSON.stringify({ active: nextState }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToggleFeedback({
          type: 'error',
          msg: data.error || 'Erro ao alternar o modo diagnóstico.',
        });
      } else {
        setToggleFeedback({
          type: 'success',
          msg: data.message || 'Status do diagnóstico atualizado.',
        });
        if (data.stats) setDiagStats(data.stats);
      }
      await fetchDiagnosticData();
    } catch (err) {
      setToggleFeedback({
        type: 'error',
        msg: (err as Error).message || 'Falha na comunicação com o servidor.',
      });
    } finally {
      setIsTogglingDebug(false);
    }
  };

  const handleClearBuffer = async () => {
    if (!window.confirm('Tem certeza de que deseja esvaziar o buffer de eventos do diagnóstico em memória?')) return;
    try {
      await fetch('/api/tiktok/diagnostic/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gio-admin-access': 'authorized',
          'x-gio-admin-email': 'gustakkg15@gmail.com',
        },
      });
      setSelectedTrace(null);
      await fetchDiagnosticData();
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTraceId(id);
    setTimeout(() => setCopiedTraceId(null), 2000);
  };

  if (!isAdminAuthorized) {
    return (
      <div className="p-8 rounded-2xl bg-[#0A1128] border border-[#E11D48]/40 text-center space-y-4 shadow-2xl">
        <div className="w-12 h-12 rounded-xl bg-[#E11D48]/15 border border-[#E11D48]/40 flex items-center justify-center mx-auto text-[#FDA4AF]">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-display font-black text-white">
          LIVE SYSTEM MONITOR — Acesso Restrito
        </h2>
        <p className="text-xs text-slate-300 max-w-md mx-auto">
          Esta tela administrativa de saúde, telemetria monotônica e diagnóstico de recuperação SSE é
          exclusiva para administradores autorizados do GIO DA SORTE PRO.
        </p>
      </div>
    );
  }

  const timeSeries = snapshot?.timeSeries || [];
  const maxEpsChart = Math.max(
    10,
    ...timeSeries.map((p) => Math.max(p.receivedEps, p.processedEps, p.persistedEps, p.transmittedEps))
  );
  const maxLatencyChart = Math.max(
    50,
    ...timeSeries.map((p) => Math.max(p.p99EndToEndMs, p.p95PersistenceMs, p.p50EndToEndMs))
  );

  return (
    <div className="space-y-6 rounded-2xl p-5 sm:p-6 bg-gradient-to-b from-[#0A1128] via-[#0B1536] to-[#080D21] border border-[#E11D48]/35 shadow-2xl text-slate-100">
      {/* HEADER: SAPPHIRE BLUE & METALLIC RED ADMINISTRATIVE BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E11D48]/25 pb-5">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#E11D48] via-[#BE123C] to-[#1E3A8A] p-0.5 shadow-lg shadow-[#E11D48]/20 shrink-0">
            <div className="w-full h-full bg-[#0A1128] rounded-[10px] flex items-center justify-center">
              <Activity className="w-6 h-6 text-[#FDA4AF]" />
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-xl font-display font-black tracking-tight text-white">
                LIVE SYSTEM MONITOR
              </h2>
              <span className="px-2.5 py-0.5 rounded bg-[#E11D48]/20 border border-[#E11D48]/50 text-[#FDA4AF] text-[10px] font-mono font-bold uppercase tracking-wider">
                Painel Administrativo Exclusivo
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-950/90 border border-blue-500/40 text-blue-200 text-[10px] font-mono">
                {adminLabel}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Telemetria monotônica em tempo real, verificação real de 9 componentes, classificador de perda em 6 estágios e Outbox SSE durável.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0F1B3D] border border-blue-500/30 text-[11px] font-mono text-blue-200">
            <Clock className="w-3.5 h-3.5 text-[#FDA4AF]" />
            <span>Atualização:</span>
            <select
              value={autoRefreshMs}
              onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
              className="bg-transparent text-[#FDA4AF] font-bold focus:outline-none"
            >
              <option value={1000} className="bg-slate-900">1s</option>
              <option value={2000} className="bg-slate-900">2s</option>
              <option value={5000} className="bg-slate-900">5s</option>
            </select>
          </div>

          <button
            onClick={fetchSnapshot}
            className="px-3 py-2 rounded-xl bg-[#1E3A8A]/70 hover:bg-[#1E3A8A] border border-blue-400/40 text-xs font-bold text-white transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#FDA4AF] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Agora</span>
          </button>

          <button
            onClick={onTriggerQueueRecovery}
            disabled={isRecoveringQueue}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#E11D48] via-[#F43F5E] to-[#BE123C] hover:brightness-110 text-white font-black text-xs transition flex items-center gap-1.5 shadow-md shadow-[#E11D48]/25 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 fill-white" />
            <span>{isRecoveringQueue ? 'Recuperando WAL...' : 'Forçar Sincronização WAL / Streaks'}</span>
          </button>
        </div>
      </div>

      {/* MONITOR NAVIGATION TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'telemetry'
                ? 'bg-[#1E3A8A] text-white border border-blue-400/50 shadow-md shadow-blue-900/30'
                : 'bg-[#080F26] text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Activity className="w-4 h-4 text-[#FDA4AF]" />
            <span>Métricas Operacionais & Telemetria</span>
          </button>

          <button
            onClick={() => setActiveTab('debugger')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'debugger'
                ? 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white border border-[#E11D48]/60 shadow-md shadow-[#E11D48]/25'
                : 'bg-[#080F26] text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Bug className="w-4 h-4 text-[#FDA4AF]" />
            <span>LIVE EVENT DEBUGGER (Diagnóstico 6 Etapas)</span>
            {diagStats?.activeEffective && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>
        </div>

        {activeTab === 'debugger' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearBuffer}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Esvaziar Buffer ({diagStats?.inMemoryBufferSize ?? 0}/2000)</span>
            </button>
            <button
              onClick={() => fetchDiagnosticData()}
              className="px-3 py-1.5 rounded-xl bg-[#1E3A8A]/60 hover:bg-[#1E3A8A] border border-blue-400/30 text-xs font-mono text-cyan-200 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDiag ? 'animate-spin' : ''}`} />
              <span>Atualizar Eventos</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'telemetry' && (
        <>
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Falha ao consultar telemetria administrativa: {errorMsg}</span>
            </div>
          )}

          {/* CLOCK DISCIPLINE & SESSION METADATA BANNER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25 text-xs">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#FDA4AF] shrink-0" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Sessão Monitorada</span>
            <span className="font-mono font-bold text-white">
              {snapshot?.sessionId || sessionId} (@{snapshot?.roomUsername || roomUsername})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Medição de Duração</span>
            <span className="font-mono font-bold text-cyan-300">
              Relógio Monotônico (performance.now)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Auditoria Temporal</span>
            <span className="font-mono font-bold text-emerald-300">
              receivedAt (Servidor UTC) ≠ originalTimestamp (TikTok)
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 1: REAL-TIME THROUGHPUT (4 EPS RATES) & QUEUE INDICATORS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#F43F5E]" />
            <span>1. Indicadores de Vazão (Eventos/s) & Saúde da Fila em Tempo Real</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums">
            Última leitura: {formatUtcTime(snapshot?.updatedAt)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">Recebidos / s</span>
            <p className="text-xl font-mono font-black text-white tabular-nums mt-0.5">
              {snapshot?.rates.receivedEps ?? 0}/s
            </p>
            <span className="text-[10px] font-mono text-[#FDA4AF] tabular-nums">
              Pico: {snapshot?.rates.peakReceivedEps ?? 0}/s • Total: {snapshot?.totals.receivedEvents ?? 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">Processados / s</span>
            <p className="text-xl font-mono font-black text-cyan-300 tabular-nums mt-0.5">
              {snapshot?.rates.processedEps ?? 0}/s
            </p>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              Total: {snapshot?.totals.processedEvents ?? 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">Persistidos / s</span>
            <p className="text-xl font-mono font-black text-emerald-300 tabular-nums mt-0.5">
              {snapshot?.rates.persistedEps ?? 0}/s
            </p>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              Total: {snapshot?.totals.persistedEvents ?? 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">Transmitidos SSE / s</span>
            <p className="text-xl font-mono font-black text-[#FDA4AF] tabular-nums mt-0.5">
              {snapshot?.rates.transmittedEps ?? 0}/s
            </p>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              Total: {snapshot?.totals.transmittedEvents ?? 0} (ACK: {snapshot?.totals.confirmedByBrowserEvents ?? 0})
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">Fila Pendente (Idade)</span>
            <p className="text-xl font-mono font-black text-amber-300 tabular-nums mt-0.5">
              {snapshot?.totals.pendingInQueue ?? 0}
            </p>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              Mais antigo: {snapshot?.totals.oldestPendingAgeMs ?? 0} ms • Retry: {snapshot?.totals.retryingInQueue ?? 0}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30">
            <span className="text-[10px] uppercase text-slate-400 font-semibold block">Retransmissões / Falhas</span>
            <p className="text-xl font-mono font-black text-white tabular-nums mt-0.5">
              {snapshot?.totals.technicalRetransmissionsDetected ?? 0}{' '}
              <span className="text-xs font-normal text-slate-400">dup</span>
            </p>
            <span className="text-[10px] font-mono text-slate-400 tabular-nums">
              Falhas BD: {snapshot?.totals.persistenceFailures ?? 0} • Rec: {(snapshot?.totals.tiktokReconnects ?? 0) + (snapshot?.totals.sseReconnects ?? 0)}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 1B: 6-STAGE LATENCY PERCENTILES TABLE (p50, p95, p99) */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF] flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#F43F5E]" />
          <span>Latências por Etapa do Pipeline (Percentis p50, p95 e p99 — Relógio Monotônico)</span>
        </h3>

        <div className="overflow-x-auto rounded-xl border border-blue-500/30 bg-[#0B1536]/90">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#132352] text-[#FDA4AF] font-semibold border-b border-blue-500/30">
              <tr>
                <th className="py-2.5 px-4">Etapa de Latência</th>
                <th className="py-2.5 px-4 text-right font-mono">p50 (Mediana)</th>
                <th className="py-2.5 px-4 text-right font-mono">p95</th>
                <th className="py-2.5 px-4 text-right font-mono">p99</th>
                <th className="py-2.5 px-4 text-right font-mono">Média</th>
                <th className="py-2.5 px-4 text-right font-mono">Última</th>
                <th className="py-2.5 px-4 text-right font-mono">Amostras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-500/15 font-mono tabular-nums">
              {[
                {
                  label: '1. Recebimento pelo Servidor (Webcast → Adapter)',
                  stat: snapshot?.latencies.serverReceive,
                  color: 'text-cyan-300',
                },
                {
                  label: '2. Processamento & Normalização (Adapter → WAL)',
                  stat: snapshot?.latencies.processing,
                  color: 'text-blue-300',
                },
                {
                  label: '3. Persistência Atômica no Firestore (WAL → Commit)',
                  stat: snapshot?.latencies.firestorePersistence,
                  color: 'text-emerald-300',
                },
                {
                  label: '4. Entrega pelo Canal SSE (Outbox → Socket Write)',
                  stat: snapshot?.latencies.sseDelivery,
                  color: 'text-[#FDA4AF]',
                },
                {
                  label: '5. Recebimento no Navegador → Renderização Visual (React DOM)',
                  stat: snapshot?.latencies.browserRender,
                  color: 'text-purple-300',
                },
                {
                  label: '6. Latência Total End-to-End (Captura Servidor → Feed Renderizado)',
                  stat: snapshot?.latencies.totalEndToEnd,
                  color: 'text-[#F43F5E] font-bold',
                },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-white/[0.03] transition">
                  <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">{row.label}</td>
                  <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p50 ?? 0} ms</td>
                  <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p95 ?? 0} ms</td>
                  <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p99 ?? 0} ms</td>
                  <td className="py-2.5 px-4 text-right text-slate-300">{row.stat?.avg ?? 0} ms</td>
                  <td className="py-2.5 px-4 text-right text-slate-300">{row.stat?.last ?? 0} ms</td>
                  <td className="py-2.5 px-4 text-right text-slate-400">{row.stat?.samples ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 3A: HISTORICAL CHARTS (EPS RATE & LATENCY PERCENTILES OVER TIME) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: EPS over time */}
        <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Gráfico Histórico: Taxa de Eventos / Segundo
            </h4>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-cyan-300">● Recebidos</span>
              <span className="text-emerald-300">● Persistidos</span>
              <span className="text-[#FDA4AF]">● SSE</span>
            </div>
          </div>

          <div className="h-36 w-full bg-[#080F26] rounded-lg border border-blue-500/20 p-2 flex items-end gap-1 overflow-hidden">
            {timeSeries.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Coletando amostras em tempo real...
              </div>
            ) : (
              timeSeries.slice(-36).map((pt, i) => {
                const recvH = Math.max(4, Math.round((pt.receivedEps / maxEpsChart) * 100));
                const persH = Math.max(4, Math.round((pt.persistedEps / maxEpsChart) * 100));
                const sseH = Math.max(4, Math.round((pt.transmittedEps / maxEpsChart) * 100));
                return (
                  <div
                    key={`${pt.timestamp}_${i}`}
                    className="flex-1 h-full flex items-end justify-center gap-[1px]"
                    title={`${new Date(pt.timestamp).toLocaleTimeString('pt-BR')} — Rec: ${pt.receivedEps}/s | Pers: ${pt.persistedEps}/s | SSE: ${pt.transmittedEps}/s`}
                  >
                    <div style={{ height: `${recvH}%` }} className="w-1/3 bg-cyan-400/80 rounded-t" />
                    <div style={{ height: `${persH}%` }} className="w-1/3 bg-emerald-400/80 rounded-t" />
                    <div style={{ height: `${sseH}%` }} className="w-1/3 bg-[#E11D48] rounded-t" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chart 2: Latency p50 / p95 / p99 over time */}
        <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Gráfico Histórico: Latência End-to-End (p50 / p95 / p99)
            </h4>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-emerald-300">● p50</span>
              <span className="text-[#FDA4AF]">● p95</span>
              <span className="text-rose-400">● p99</span>
            </div>
          </div>

          <div className="h-36 w-full bg-[#080F26] rounded-lg border border-blue-500/20 p-2 flex items-end gap-1 overflow-hidden">
            {timeSeries.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                Coletando amostras de latência...
              </div>
            ) : (
              timeSeries.slice(-36).map((pt, i) => {
                const p50H = Math.max(4, Math.min(100, Math.round((pt.p50EndToEndMs / maxLatencyChart) * 100)));
                const p95H = Math.max(4, Math.min(100, Math.round((pt.p95EndToEndMs / maxLatencyChart) * 100)));
                const p99H = Math.max(4, Math.min(100, Math.round((pt.p99EndToEndMs / maxLatencyChart) * 100)));
                return (
                  <div
                    key={`${pt.timestamp}_lat_${i}`}
                    className="flex-1 h-full flex items-end justify-center gap-[1px]"
                    title={`${new Date(pt.timestamp).toLocaleTimeString('pt-BR')} — p50: ${pt.p50EndToEndMs}ms | p95: ${pt.p95EndToEndMs}ms | p99: ${pt.p99EndToEndMs}ms`}
                  >
                    <div style={{ height: `${p50H}%` }} className="w-1/3 bg-emerald-400/80 rounded-t" />
                    <div style={{ height: `${p95H}%` }} className="w-1/3 bg-[#E11D48] rounded-t" />
                    <div style={{ height: `${p99H}%` }} className="w-1/3 bg-rose-400/80 rounded-t" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3B: 4 MILESTONE EVENT CARDS */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF] flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#F43F5E]" />
          <span>Rastreabilidade Individual dos 4 Eventos-Marco (Pipeline Persist-Before-SSE)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MilestoneCard
            title="1. Último Evento Recebido"
            subtitle="Capturado pelo servidor (Webcast/Adapter)"
            accentColor="cyan"
            milestone={snapshot?.milestones.lastEventReceived || null}
          />
          <MilestoneCard
            title="2. Último Evento Persistido"
            subtitle="Confirmado atomicamente no Firestore"
            accentColor="emerald"
            milestone={snapshot?.milestones.lastEventPersisted || null}
          />
          <MilestoneCard
            title="3. Último Entregue ao Navegador"
            subtitle="Transmitido pelo Outbox SSE com seq #"
            accentColor="gold"
            milestone={snapshot?.milestones.lastEventDeliveredToBrowser || null}
          />
          <MilestoneCard
            title="4. Último Confirmado pelo Navegador"
            subtitle="Renderizado no feed React + Cursor ACK"
            accentColor="sapphire"
            milestone={snapshot?.milestones.lastEventConfirmedByBrowser || null}
          />
        </div>
      </div>

      {/* SECTION 2: 9-COMPONENT VERIFIED DIAGNOSTIC MATRIX */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF] flex items-center gap-2">
            <Server className="w-4 h-4 text-[#F43F5E]" />
            <span>2. Diagnóstico Verificado por Componente (9 Subsistemas Independentes)</span>
          </h3>
          <span className="text-[10px] text-slate-400">
            Nenhum componente recebe status saudável sem verificação real de estado
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(snapshot?.components || []).map((comp) => {
            const st = STATUS_BADGE_STYLES[comp.status] || STATUS_BADGE_STYLES.UNKNOWN;
            return (
              <div
                key={comp.id}
                className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 flex flex-col justify-between gap-2.5"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{comp.name}</span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${st.bg} ${st.border} ${st.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{comp.reason}</p>
                </div>

                {comp.metrics && (
                  <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-400">
                    {Object.entries(comp.metrics).map(([k, v]) => (
                      <span key={k} className="px-1.5 py-0.5 rounded bg-[#080F26] text-blue-200 border border-blue-500/20">
                        {k}: <strong>{String(v)}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: 6-STAGE EVENT LOSS DIAGNOSTIC CLASSIFIER */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#F43F5E]" />
          <span>4. Diagnóstico e Classificador de Perda de Eventos (6 Estágios)</span>
        </h3>

        <div className="overflow-x-auto rounded-xl border border-blue-500/30 bg-[#0B1536]/90">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#132352] text-[#FDA4AF] font-semibold border-b border-blue-500/30">
              <tr>
                <th className="py-2.5 px-4">Estágio de Classificação</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right font-mono">Em Trânsito</th>
                <th className="py-2.5 px-4 text-right font-mono">Perdas / Falhas</th>
                <th className="py-2.5 px-4">Diagnóstico Técnico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-500/15">
              {(snapshot?.lossClassification || []).map((stage) => (
                <tr key={stage.stage} className="hover:bg-white/[0.03] transition">
                  <td className="py-2.5 px-4 font-semibold text-white whitespace-nowrap">{stage.label}</td>
                  <td className="py-2.5 px-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        stage.status === 'OK'
                          ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                          : stage.status === 'IN_FLIGHT'
                          ? 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300'
                          : stage.status === 'UNVERIFIABLE_AT_ORIGIN'
                          ? 'bg-indigo-950/70 border-indigo-500/40 text-indigo-300'
                          : stage.status === 'WARNING'
                          ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                          : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                      }`}
                    >
                      {stage.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-cyan-300 tabular-nums">
                    {stage.inFlightCount}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-[#FDA4AF] tabular-nums">
                    {stage.count}
                  </td>
                  <td className="py-2.5 px-4 text-slate-300">{stage.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 5: DURABLE SSE RECOVERY CURSORS, RETENTION CONFIG & QUEUE INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SSE Clients & Outbox Retention */}
        <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">
                Cursores SSE por Cliente & Janela de Retenção Outbox
              </h4>
              <p className="text-[10px] text-slate-400">
                Retenção atual: seq #{snapshot?.sseRecovery.sessionMinRetainedSequence ?? 1} até #
                {snapshot?.sseRecovery.sessionLatestSequence ?? 0}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={retentionInput}
                onChange={(e) => setRetentionInput(e.target.value)}
                className="w-20 px-2 py-1 rounded bg-[#080F26] border border-blue-500/40 text-xs font-mono text-white"
                title="Máximo de eventos retidos por sessão para replay SSE"
              />
              <button
                onClick={handleSaveRetention}
                disabled={isUpdatingRetention}
                className="px-2.5 py-1 rounded bg-[#E11D48]/20 hover:bg-[#E11D48]/30 border border-[#E11D48]/50 text-[#FDA4AF] text-[10px] font-bold transition"
              >
                Salvar Retenção
              </button>
            </div>
          </div>

          {(snapshot?.sseRecovery.activeClients || []).length === 0 ? (
            <p className="text-xs text-slate-500 font-mono py-4 text-center">
              Nenhum cliente SSE registrado nesta sessão.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {(snapshot?.sseRecovery.activeClients || []).map((client) => (
                <div
                  key={`${client.sessionId}_${client.clientId}`}
                  className="p-2.5 rounded-lg bg-[#080F26] border border-blue-500/20 flex items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          client.disconnectedAt ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                      />
                      <span className="text-white font-bold truncate">{client.clientId}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      Reconexões: {client.reconnectCount} • Último ACK: {formatUtcTime(client.lastAckAt)}
                    </span>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <span className="text-cyan-300 block">Enviado: #{client.lastSentSequenceNumber}</span>
                    <span className="text-emerald-300 font-bold block">
                      Confirmado: #{client.lastConfirmedSequenceNumber}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event Queue (WAL) Inspector */}
        <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">
                Inspetor da Fila de Eventos (WAL & Outbox)
              </h4>
              <p className="text-[10px] text-slate-400">
                Últimos registros processados pela fila durável da sessão
              </p>
            </div>
            <span className="text-[10px] font-mono text-cyan-300">
              {(snapshot?.queueItems || []).length} registros recentes
            </span>
          </div>

          {(snapshot?.queueItems || []).length === 0 ? (
            <p className="text-xs text-slate-500 font-mono py-4 text-center">
              Fila vazia — nenhum evento registrado ainda.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {(snapshot?.queueItems || []).slice(0, 15).map((item) => (
                <div
                  key={item.walId}
                  className="p-2 rounded-lg bg-[#080F26] border border-blue-500/20 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.sequenceNumber !== undefined && (
                        <span className="text-[10px] font-mono font-bold text-[#FDA4AF]">
                          #{item.sequenceNumber}
                        </span>
                      )}
                      <span className="font-bold text-white truncate">{item.displayHandle}</span>
                      <span className="text-slate-400 truncate">({item.giftName})</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 block truncate">
                      {item.eventId} • Tentativas: {item.attempts}
                    </span>
                  </div>
                  <div className="text-right shrink-0 font-mono tabular-nums">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        item.status === 'CONFIRMED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                          : item.status === 'FAILED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-700/50'
                          : 'bg-amber-950 text-amber-300 border border-amber-700/50'
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">{item.ageMs} ms</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 6: RECONNECTION HISTORY & RECENT ERRORS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Reconnection History */}
        <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF]">
            Histórico de Reconexões e Retomadas SSE ({(snapshot?.reconnectHistory || []).length})
          </h4>
          {(snapshot?.reconnectHistory || []).length === 0 ? (
            <p className="text-xs text-slate-500 font-mono py-3 text-center">
              Nenhuma reconexão registrada nesta sessão.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs font-mono">
              {(snapshot?.reconnectHistory || []).map((rec) => (
                <div
                  key={rec.id}
                  className="p-2 rounded bg-[#080F26] border border-blue-500/20 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5 ${
                        rec.outOfRetentionFullSync
                          ? 'bg-amber-950 text-amber-300 border border-amber-700/50'
                          : 'bg-cyan-950 text-cyan-300 border border-cyan-700/50'
                      }`}
                    >
                      {rec.source}
                    </span>
                    <span className="text-slate-200">{rec.reason}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{formatUtcTime(rec.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Errors */}
        <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-2.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
            Registro de Erros e Alertas Recentes ({(snapshot?.recentErrors || []).length})
          </h4>
          {(snapshot?.recentErrors || []).length === 0 ? (
            <p className="text-xs text-emerald-400/80 font-mono py-3 text-center">
              ✓ Zero erros operacionais registrados.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs font-mono">
              {(snapshot?.recentErrors || []).map((err) => (
                <div
                  key={err.id}
                  className="p-2 rounded bg-rose-950/40 border border-rose-500/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-rose-300 mr-1.5">
                      [{err.component}]
                    </span>
                    <span className="text-rose-100">{err.message}</span>
                  </div>
                  <span className="text-[10px] text-rose-300/80 shrink-0">{formatUtcTime(err.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )}

  {/* ==========================================
      TAB 2: LIVE EVENT DEBUGGER (6-STAGE DIAGNOSTIC SYSTEM)
      ========================================== */}
  {activeTab === 'debugger' && (
    <div className="space-y-6">
      {/* 1. MASTER ENVIRONMENT KEY & RUNTIME TOGGLE STATUS BANNER */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-[#0F1B3D] via-[#0A1128] to-[#0F1B3D] border border-blue-500/30 shadow-lg space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#E11D48]/15 border border-[#E11D48]/40 text-[#FDA4AF]">
              <Bug className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Diagnóstico Condicional de Eventos TikTok LIVE</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    diagStats?.activeEffective
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                      : 'bg-slate-900 text-slate-400 border border-slate-700'
                  }`}
                >
                  {diagStats?.activeEffective ? '● ATIVO' : '○ INATIVO'}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Observabilidade estrita sem alteração de regras de sorteio, tickets ou persistência.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleDebug(!diagStats?.debugRuntimeActive)}
              disabled={isTogglingDebug || !diagStats?.debugMasterEnvActive}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center gap-2 shadow-md ${
                diagStats?.debugRuntimeActive
                  ? 'bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200'
                  : 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:brightness-110 text-white border border-[#E11D48]/50 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              {isTogglingDebug ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : diagStats?.debugRuntimeActive ? (
                <X className="w-3.5 h-3.5 text-rose-300" />
              ) : (
                <Check className="w-3.5 h-3.5 text-white" />
              )}
              <span>
                {diagStats?.debugRuntimeActive ? 'Desativar Diagnóstico' : 'Ativar Diagnóstico'}
              </span>
            </button>
          </div>
        </div>

        {/* Master Env Var Lock Alert */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 ${
              diagStats?.debugMasterEnvActive
                ? 'bg-blue-950/40 border-blue-500/30 text-blue-200'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            }`}
          >
            {diagStats?.debugMasterEnvActive ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-bold block font-mono text-[11px]">
                CHAVE-MESTRA: TIKTOK_LIVE_DEBUG = {diagStats?.debugMasterEnvActive ? 'true' : 'false'}
              </span>
              <span className="text-[11px] text-slate-300">
                {diagStats?.debugMasterEnvActive
                  ? 'Chave de ambiente ativa. O painel administrativo possui autorização para ligar/desligar a coleta.'
                  : 'Variável desativada no servidor. Por política estrita, a ativação via UI está bloqueada até que TIKTOK_LIVE_DEBUG=true seja definido no ambiente.'}
              </span>
            </div>
          </div>

          {/* Firestore TTL Native Policy Alert */}
          <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 flex items-start gap-2.5">
            <Database className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono text-[11px]">RETENÇÃO & POLÍTICA TTL (24H)</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-900 border border-indigo-400/40 text-indigo-200">
                  {diagStats?.firestoreTtlStatus || 'PENDING_GCP_POLICY_SETUP'}
                </span>
              </div>
              <span className="text-[11px] text-slate-300">
                Coleção dedicada <code className="text-cyan-300">tiktok_live_diagnostic_events</code> com campo <code className="text-cyan-300">ttlExpireAt</code>. Limpeza horária automática em execução.
              </span>
            </div>
          </div>
        </div>

        {toggleFeedback && (
          <div
            className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
              toggleFeedback.type === 'success'
                ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-200'
                : 'bg-rose-950/80 border border-rose-500/50 text-rose-200'
            }`}
          >
            {toggleFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toggleFeedback.msg}</span>
          </div>
        )}
      </div>

      {/* 2. DIAGNOSTIC KPIS GRID (8 METRICS) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Total Capturados</span>
          <p className="text-lg font-mono font-black text-white tabular-nums mt-0.5">
            {diagStats?.totalEventsCaptured ?? 0}
          </p>
          <span className="text-[9px] font-mono text-slate-400">Buffer: {diagStats?.inMemoryBufferSize ?? 0}/2000</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Presentes Válidos</span>
          <p className="text-lg font-mono font-black text-emerald-300 tabular-nums mt-0.5">
            {diagStats?.validGiftsProcessed ?? 0}
          </p>
          <span className="text-[9px] font-mono text-emerald-400/70">Aceitos pelo motor</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Retransmissões Dup</span>
          <p className="text-lg font-mono font-black text-[#FDA4AF] tabular-nums mt-0.5">
            {diagStats?.blockedDuplicatesCount ?? 0}
          </p>
          <span className="text-[9px] font-mono text-slate-400">Bloqueadas</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Com @Arroba</span>
          <p className="text-lg font-mono font-black text-cyan-300 tabular-nums mt-0.5">
            {diagStats?.eventsWithHandleAvailable ?? 0}
          </p>
          <span className="text-[9px] font-mono text-cyan-400/70">uniqueId presente</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Sem @Arroba</span>
          <p className="text-lg font-mono font-black text-amber-300 tabular-nums mt-0.5">
            {diagStats?.eventsWithoutHandleAvailable ?? 0}
          </p>
          <span className="text-[9px] font-mono text-amber-400/70">Limitação técnica</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Sem ID Numérico</span>
          <p className="text-lg font-mono font-black text-slate-300 tabular-nums mt-0.5">
            {diagStats?.eventsWithoutSenderId ?? 0}
          </p>
          <span className="text-[9px] font-mono text-slate-400">ID per-event gerado</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Falhas Persistência</span>
          <p className="text-lg font-mono font-black text-rose-300 tabular-nums mt-0.5">
            {diagStats?.persistenceFailuresCount ?? 0}
          </p>
          <span className="text-[9px] font-mono text-rose-400/70">Erros BD isolados</span>
        </div>

        <div className="p-3 rounded-xl bg-[#0F1B3D]/80 border border-blue-500/25">
          <span className="text-[9px] uppercase text-slate-400 font-bold block">Combos / Streaks</span>
          <p className="text-lg font-mono font-black text-purple-300 tabular-nums mt-0.5">
            {diagStats?.comboEventsCount ?? 0}
          </p>
          <span className="text-[9px] font-mono text-purple-400/70">Deltas calculados</span>
        </div>
      </div>

      {/* 3. FILTERS & SEARCH BAR */}
      <div className="p-3 rounded-xl bg-[#0F1B3D]/70 border border-blue-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 grow">
          <div className="relative min-w-[200px] grow sm:grow-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por @usuário, nome ou ID..."
              value={diagFilterUser}
              onChange={(e) => setDiagFilterUser(e.target.value)}
              className="w-full bg-[#080F26] border border-blue-500/30 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#E11D48]"
            />
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#080F26] border border-blue-500/30">
            <span className="text-slate-400 font-mono text-[10px]">Origem:</span>
            <select
              value={diagFilterOrigin}
              onChange={(e) => setDiagFilterOrigin(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Todas as Origens</option>
              <option value="LIVE_REAL" className="bg-slate-900">LIVE_REAL (TikTok Webcast)</option>
              <option value="SIMULATED_TEST" className="bg-slate-900">SIMULATED_TEST (Testes)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#080F26] border border-blue-500/30">
            <span className="text-slate-400 font-mono text-[10px]">Status:</span>
            <select
              value={diagFilterStatus}
              onChange={(e) => setDiagFilterStatus(e.target.value)}
              className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900">Todos os Status</option>
              <option value="ACCEPTED" className="bg-slate-900">Aceitos</option>
              <option value="DUPLICATE" className="bg-slate-900">Duplicados / Retransmitidos</option>
              <option value="REJECTED" className="bg-slate-900">Rejeitados</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => fetchDiagnosticData()}
          className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold text-xs flex items-center gap-1.5 transition"
        >
          <Filter className="w-3.5 h-3.5 text-[#FDA4AF]" />
          <span>Filtrar</span>
        </button>
      </div>

      {/* 4. DIAGNOSTIC EVENTS TABLE */}
      <div className="p-4 rounded-xl bg-[#0F1B3D]/90 border border-blue-500/30 space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#FDA4AF] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#F43F5E]" />
              <span>Eventos Diagnosticados ({diagEvents.length})</span>
            </h4>
            <p className="text-[10px] text-slate-400">
              Clique em um evento para abrir o comparador detalhado das 6 etapas.
            </p>
          </div>
          <span className="text-[10px] font-mono text-cyan-300">
            Retenção: 24h • Buffer: {diagStats?.inMemoryBufferSize ?? 0}/2000
          </span>
        </div>

        {diagEvents.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-xs text-slate-400 font-mono">
              Nenhum evento registrado no buffer diagnóstico com os filtros atuais.
            </p>
            {!diagStats?.activeEffective && (
              <p className="text-[11px] text-amber-300 font-mono">
                Aviso: O modo diagnóstico está atualmente desativado. Ative-o acima para iniciar o rastreamento das 6 etapas.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase font-bold text-slate-400 bg-[#080F26] border-b border-white/10">
                <tr>
                  <th className="py-2.5 px-3">Trace ID</th>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Origem</th>
                  <th className="py-2.5 px-3">Remetente</th>
                  <th className="py-2.5 px-3">Presente</th>
                  <th className="py-2.5 px-3">Deduplicação</th>
                  <th className="py-2.5 px-3">Persistência</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono">
                {diagEvents.map((ev) => {
                  const isSelected = selectedTrace?.traceId === ev.traceId;
                  return (
                    <tr
                      key={ev.traceId}
                      onClick={() => setSelectedTrace(ev)}
                      className={`cursor-pointer transition hover:bg-white/[0.04] ${
                        isSelected ? 'bg-blue-900/30 border-l-2 border-[#E11D48]' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-[#FDA4AF] font-bold truncate max-w-[140px]">
                        {ev.traceId}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                        {formatUtcTime(ev.timestamp)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            ev.origin === 'LIVE_REAL'
                              ? 'bg-rose-950 text-rose-300 border border-rose-700/50'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-700/50'
                          }`}
                        >
                          {ev.origin}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-sans font-bold text-white truncate max-w-[160px]">
                          {ev.stageC.resultingHandle}
                        </div>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[160px]">
                          ID: {ev.stageC.stableId}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-white font-bold">{ev.stageC.giftName}</span>{' '}
                        <span className="text-slate-400">({ev.stageC.repeatCount}x)</span>
                        <span className="text-emerald-300 text-[10px] block">
                          +{ev.stageE.coinsGranted} moedas ({ev.stageE.ticketsGenerated} bilhetes)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            ev.stageD.accepted
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                              : ev.stageD.isDuplicate
                              ? 'bg-rose-950 text-rose-300 border border-rose-700/50'
                              : 'bg-amber-950 text-amber-300 border border-amber-700/50'
                          }`}
                        >
                          {ev.stageD.reason}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            ev.stageF.status === 'SUCCESS'
                              ? 'bg-emerald-950 text-emerald-300'
                              : ev.stageF.status === 'FAILED'
                              ? 'bg-rose-950 text-rose-300'
                              : 'bg-slate-900 text-slate-400'
                          }`}
                        >
                          {ev.stageF.status}
                        </span>
                        {ev.stageF.totalTraceLatencyMs !== undefined && (
                          <span className="text-[10px] text-slate-400 block">
                            {ev.stageF.totalTraceLatencyMs} ms
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTrace(ev);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#1E3A8A]/70 hover:bg-[#1E3A8A] border border-blue-400/40 text-[10px] font-bold text-white transition flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3 h-3 text-[#FDA4AF]" />
                          <span>Inspecionar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. 6-STAGE DEEP INSPECTION MODAL / PANEL */}
      {selectedTrace && (
        <div className="p-5 rounded-2xl bg-gradient-to-b from-[#0A1128] via-[#0F1B3D] to-[#0A1128] border-2 border-[#E11D48]/60 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-gradient-to-br from-[#E11D48] to-[#1E3A8A] text-white">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Inspeção Profunda do Trace: <span className="font-mono text-[#FDA4AF]">{selectedTrace.traceId}</span>
                  </h3>
                  <button
                    onClick={() => copyToClipboard(selectedTrace.traceId, selectedTrace.traceId)}
                    className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
                    title="Copiar Trace ID"
                  >
                    {copiedTraceId === selectedTrace.traceId ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Sessão: {selectedTrace.sessionId} • Origem: {selectedTrace.origin} • Conector: {selectedTrace.connectorVersion} • Timestamp: {formatUtcTime(selectedTrace.timestamp)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedTrace(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 self-start sm:self-auto"
            >
              Fechar Inspeção
            </button>
          </div>

          {/* 6-Stage Timeline / Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* ETAPA A: PAYLOAD ORIGINAL */}
            <div className="p-4 rounded-xl bg-[#080F26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500 flex items-center justify-center text-[10px] text-cyan-300">A</span>
                  Payload Original
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {selectedTrace.stageA.sizeBytes} bytes
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-300 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Campos Sanitizados: <strong className="text-emerald-400">{selectedTrace.stageA.sanitizedFieldsCount}</strong></span>
                  <span>Truncado: <strong className={selectedTrace.stageA.isTruncated ? 'text-amber-400' : 'text-slate-400'}>{selectedTrace.stageA.isTruncated ? 'SIM' : 'NÃO'}</strong></span>
                </div>
                <div className="bg-[#050A1A] p-2.5 rounded-lg border border-slate-800 text-[10px] overflow-x-auto max-h-56">
                  <pre className="text-cyan-200">
                    {JSON.stringify(selectedTrace.stageA.rawPayload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>

            {/* ETAPA B: IDENTIDADE EXTRAÍDA */}
            <div className="p-4 rounded-xl bg-[#080F26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-950 border border-indigo-500 flex items-center justify-center text-[10px] text-indigo-300">B</span>
                  Identidade Extraída
                </span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                    selectedTrace.stageB.handleAvailable
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {selectedTrace.stageB.handleAvailable ? '@arroba disponível' : 'Arroba indisponível'}
                </span>
              </div>
              <div className="text-xs font-mono space-y-1.5 text-slate-300">
                <div className="p-2 rounded bg-[#050A1A] border border-slate-800 space-y-1">
                  <div><span className="text-slate-500">userId:</span> <strong className="text-white">{selectedTrace.stageB.userId || 'N/A'}</strong></div>
                  <div><span className="text-slate-500">uniqueId:</span> <strong className="text-white">{selectedTrace.stageB.uniqueId || 'N/A'}</strong></div>
                  <div><span className="text-slate-500">nickname:</span> <strong className="text-white">{selectedTrace.stageB.nickname || 'N/A'}</strong></div>
                  <div><span className="text-slate-500">secUid:</span> <span className="text-slate-400 text-[10px] truncate block">{selectedTrace.stageB.secUid || 'N/A'}</span></div>
                </div>
                <div className="text-[10px] space-y-1 text-slate-400 pt-1">
                  <div>Campos Encontrados: <span className="text-cyan-300">{selectedTrace.stageB.rawFieldsFound?.join(', ') || 'Nenhum'}</span></div>
                  <div>Campos Ausentes: <span className="text-slate-500">{selectedTrace.stageB.rawFieldsMissing?.join(', ') || 'Nenhum'}</span></div>
                  <div className="text-emerald-400 font-bold text-[10px] pt-1">
                    ✓ Conta OAuth do anfitrião (@{selectedTrace.roomUsername}) isolada e não atribuída
                  </div>
                </div>
              </div>
            </div>

            {/* ETAPA C: RESULTADO DA NORMALIZAÇÃO */}
            <div className="p-4 rounded-xl bg-[#080F26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-[#FDA4AF] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-rose-950 border border-[#E11D48] flex items-center justify-center text-[10px] text-[#FDA4AF]">C</span>
                  Normalização
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  ID Canônico
                </span>
              </div>
              <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050A1A] border border-slate-800 text-slate-300">
                <div><span className="text-slate-500">stableId:</span> <strong className="text-white">{selectedTrace.stageC.stableId}</strong></div>
                <div><span className="text-slate-500">displayHandle:</span> <strong className="text-white">{selectedTrace.stageC.resultingHandle}</strong></div>
                <div><span className="text-slate-500">presente:</span> <strong className="text-emerald-300">{selectedTrace.stageC.giftName} (#{selectedTrace.stageC.giftId})</strong></div>
                <div><span className="text-slate-500">repeatCount:</span> <strong className="text-cyan-300">{selectedTrace.stageC.repeatCount}x</strong> (final: {selectedTrace.stageC.repeatEnd ? 'Sim' : 'Não'})</div>
                <div><span className="text-slate-500">groupId:</span> <span className="text-[10px] text-slate-400 block truncate">{selectedTrace.stageC.groupId}</span></div>
                <div><span className="text-slate-500">txId / eventId:</span> <span className="text-[10px] text-slate-400 block truncate">{selectedTrace.stageC.explicitTransactionId || selectedTrace.stageC.explicitEventId || 'N/A'}</span></div>
              </div>
            </div>

            {/* ETAPA D: RESULTADO DA DEDUPLICAÇÃO */}
            <div className="p-4 rounded-xl bg-[#080F26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-amber-950 border border-amber-500 flex items-center justify-center text-[10px] text-amber-300">D</span>
                  Deduplicação
                </span>
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    selectedTrace.stageD.accepted
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                      : 'bg-rose-950 text-rose-300 border border-rose-500/50'
                  }`}
                >
                  {selectedTrace.stageD.accepted ? 'ACEITO' : 'REJEITADO / DUP'}
                </span>
              </div>
              <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050A1A] border border-slate-800 text-slate-300">
                <div><span className="text-slate-500">motivo:</span> <strong className="text-white">{selectedTrace.stageD.reason}</strong></div>
                <div><span className="text-slate-500">duplicata:</span> <strong className={selectedTrace.stageD.isDuplicate ? 'text-rose-400' : 'text-emerald-400'}>{selectedTrace.stageD.isDuplicate ? 'SIM' : 'NÃO'}</strong></div>
                <div><span className="text-slate-500">tipo combo:</span> <span className="text-cyan-300">{selectedTrace.stageD.isComboContinuation ? 'Continuação de Combo' : selectedTrace.stageD.isComboFinalization ? 'Finalização de Combo' : 'Presente Individual'}</span></div>
                <div><span className="text-slate-500">streakKey:</span> <span className="text-[10px] text-slate-400 block truncate">{selectedTrace.stageD.streakKey || 'N/A'}</span></div>
                <div><span className="text-slate-500">assinatura técnica:</span> <span className="text-[9px] text-slate-500 block truncate">{selectedTrace.stageD.signatureUsed || 'N/A'}</span></div>
              </div>
            </div>

            {/* ETAPA E: RESULTADO DA CONTABILIZAÇÃO */}
            <div className="p-4 rounded-xl bg-[#080F26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-500 flex items-center justify-center text-[10px] text-emerald-300">E</span>
                  Contabilização
                </span>
                <span className="text-[10px] font-mono text-emerald-300 font-bold">
                  +{selectedTrace.stageE.coinsGranted} moedas
                </span>
              </div>
              <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050A1A] border border-slate-800 text-slate-300">
                <div><span className="text-slate-500">delta incremental:</span> <strong className="text-white">+{selectedTrace.stageE.deltaCount} presentes</strong></div>
                <div><span className="text-slate-500">moedas concedidas:</span> <strong className="text-emerald-400">+{selectedTrace.stageE.coinsGranted}</strong></div>
                <div><span className="text-slate-500">bilhetes gerados:</span> <strong className="text-cyan-300">{selectedTrace.stageE.ticketsGenerated}</strong></div>
                <div><span className="text-slate-500">números bilhetes:</span> <span className="text-emerald-300 text-[10px] block truncate">{selectedTrace.stageE.ticketNumbers?.join(', ') || 'Nenhum bilhete emitido'}</span></div>
                <div><span className="text-slate-500">regra aplicada:</span> <span className="text-[10px] text-slate-400">{selectedTrace.stageE.ruleIdApplied || 'Padrão'} ({selectedTrace.stageE.rateApplied || 100} moedas/bilhete)</span></div>
              </div>
            </div>

            {/* ETAPA F: RESULTADO DA PERSISTÊNCIA & SSE */}
            <div className="p-4 rounded-xl bg-[#080F26] border border-blue-500/30 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500 flex items-center justify-center text-[10px] text-cyan-300">F</span>
                  Persistência & SSE
                </span>
                <span
                  className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    selectedTrace.stageF.status === 'SUCCESS'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                      : selectedTrace.stageF.status === 'FAILED'
                      ? 'bg-rose-950 text-rose-300 border border-rose-500/50'
                      : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {selectedTrace.stageF.status}
                </span>
              </div>
              <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050A1A] border border-slate-800 text-slate-300">
                <div><span className="text-slate-500">doc Firestore:</span> <span className="text-[10px] text-cyan-200 block truncate">{selectedTrace.stageF.firestoreDocId || 'N/A'}</span></div>
                <div><span className="text-slate-500">latência recepção:</span> <span className="text-white">{selectedTrace.stageF.serverReceiveLatencyMs ?? '—'} ms</span></div>
                <div><span className="text-slate-500">latência processamento:</span> <span className="text-white">{selectedTrace.stageF.processingLatencyMs ?? '—'} ms</span></div>
                <div><span className="text-slate-500">latência gravação BD:</span> <span className="text-white">{selectedTrace.stageF.persistenceLatencyMs ?? '—'} ms</span></div>
                <div><span className="text-slate-500">latência total trace:</span> <strong className="text-cyan-300">{selectedTrace.stageF.totalTraceLatencyMs ?? '—'} ms</strong></div>
                {selectedTrace.stageF.error && (
                  <div className="text-rose-400 text-[10px]"><span className="text-slate-500">erro:</span> {selectedTrace.stageF.error}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )}
</div>
  );
};
