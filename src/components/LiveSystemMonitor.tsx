import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Server,
  Database,
  Radio,
  Clock,
  Layers,
  CheckCircle2,
  Lock,
  Terminal,
  Zap,
  Bug,
  Eye,
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
import { getAuthBearerHeaders } from '../utils/tiktokLiveService.js';

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
    bg: 'bg-[#20C997]/15',
    border: 'border-[#20C997]/40',
    text: 'text-[#20C997]',
    dot: 'bg-[#20C997]',
    label: 'CONECTADO',
  },
  DEGRADED: {
    bg: 'bg-[#F5B942]/15',
    border: 'border-[#F5B942]/40',
    text: 'text-[#F5B942]',
    dot: 'bg-[#F5B942]',
    label: 'DEGRADADO',
  },
  DISCONNECTED: {
    bg: 'bg-[#0B1730]',
    border: 'border-[#182943]',
    text: 'text-[#94A3B8]',
    dot: 'bg-[#94A3B8]',
    label: 'DESCONECTADO',
  },
  ERROR: {
    bg: 'bg-[#F05262]/15',
    border: 'border-[#F05262]/40',
    text: 'text-[#F05262]',
    dot: 'bg-[#F05262]',
    label: 'ERRO',
  },
  UNKNOWN: {
    bg: 'bg-[#101F3D]',
    border: 'border-[#182943]',
    text: 'text-[#94A3B8]',
    dot: 'bg-[#94A3B8]',
    label: 'AGUARDANDO',
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
  const titleColorMap = {
    gold: 'text-[#F5B942]',
    sapphire: 'text-[#00A9FF]',
    emerald: 'text-[#20C997]',
    cyan: 'text-[#35B9F5]',
  };

  return (
    <div className="p-4 rounded-lg border border-[#182943] bg-[#0B1730] space-y-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-[#182943] pb-2">
        <div>
          <h4 className={`text-xs font-semibold ${titleColorMap[accentColor]}`}>
            {title}
          </h4>
          <p className="text-[11px] text-[#94A3B8]">{subtitle}</p>
        </div>
        {milestone?.sequenceNumber !== undefined && (
          <span className="text-[#F5B942] font-mono text-[11px] font-semibold tabular-nums">
            seq #{milestone.sequenceNumber}
          </span>
        )}
      </div>

      {!milestone ? (
        <div className="py-5 text-center text-xs text-[#94A3B8] font-mono">
          Aguardando evento nesta etapa...
        </div>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#F8FAFC] truncate">{milestone.displayHandle}</span>
            <span className="font-mono font-semibold text-[#F5B942] tabular-nums">
              +{milestone.coinsGranted} moedas
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
            <span>
              {milestone.giftName} <strong className="font-mono text-[#F8FAFC]">({milestone.repeatCount}x)</strong>
            </span>
            {milestone.latencyMs !== undefined && (
              <span className="font-mono text-[#20C997] tabular-nums">{milestone.latencyMs} ms</span>
            )}
          </div>
          {milestone.ticketNumbers && milestone.ticketNumbers.length > 0 && (
            <div className="text-[11px] font-mono text-[#20C997] truncate">
              Bilhetes: #{milestone.ticketNumbers.slice(0, 5).join(', #')}
              {milestone.ticketNumbers.length > 5 ? ` (+${milestone.ticketNumbers.length - 5})` : ''}
            </div>
          )}
          <div className="pt-1.5 border-t border-[#182943] text-[10px] font-mono text-[#94A3B8] space-y-0.5">
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
      const authHeaders = await getAuthBearerHeaders({
        'x-gio-admin-access': 'authorized',
      });
      const res = await fetch(
        `/api/tiktok/monitor/snapshot?sessionId=${encodeURIComponent(sessionId)}`,
        {
          headers: authHeaders,
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
      const authHeaders = await getAuthBearerHeaders({
        'Content-Type': 'application/json',
        'x-gio-admin-access': 'authorized',
      });
      await fetch('/api/tiktok/monitor/config', {
        method: 'POST',
        headers: authHeaders,
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

      const authHeaders = await getAuthBearerHeaders({
        'x-gio-admin-access': 'authorized',
      });

      const [resStats, resEvents] = await Promise.all([
        fetch('/api/tiktok/diagnostic/status', {
          headers: authHeaders,
        }),
        fetch(`/api/tiktok/diagnostic/events?${params.toString()}`, {
          headers: authHeaders,
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
      const authHeaders = await getAuthBearerHeaders({
        'Content-Type': 'application/json',
        'x-gio-admin-access': 'authorized',
        'x-gio-admin-email': 'gustakkg15@gmail.com',
      });
      const res = await fetch('/api/tiktok/diagnostic/toggle', {
        method: 'POST',
        headers: authHeaders,
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
      const authHeaders = await getAuthBearerHeaders({
        'Content-Type': 'application/json',
        'x-gio-admin-access': 'authorized',
        'x-gio-admin-email': 'gustakkg15@gmail.com',
      });
      await fetch('/api/tiktok/diagnostic/clear', {
        method: 'POST',
        headers: authHeaders,
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
      <div className="p-8 rounded-xl bg-[#101F3D] border border-[#182943] text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#0B1730] border border-[#182943] flex items-center justify-center mx-auto text-[#F5B942]">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-[#F8FAFC]">
          Monitor Técnico — Acesso Restrito
        </h2>
        <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
          Esta tela administrativa de saúde, telemetria monotônica e diagnóstico de recuperação SSE é
          exclusiva para administradores autorizados do GIO DA SORTE.
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
    <div className="space-y-6 rounded-xl p-5 sm:p-6 bg-[#101F3D] border border-[#182943] text-[#F8FAFC]">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#182943] pb-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0B1730] border border-[#182943] flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-[#00A9FF]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-[#F8FAFC]">
                Monitor Técnico e Recuperação SSE
              </h2>
              <span className="text-xs text-[#94A3B8]">
                · {adminLabel}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Telemetria monotônica em tempo real, verificação real de 9 componentes, classificador em 6 estágios e Outbox SSE durável.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1730] border border-[#182943] text-xs font-mono text-[#94A3B8]">
            <Clock className="w-3.5 h-3.5 text-[#00A9FF]" />
            <span>Atualização:</span>
            <select
              value={autoRefreshMs}
              onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
              className="bg-transparent text-[#F8FAFC] font-semibold focus:outline-none"
            >
              <option value={1000} className="bg-[#0B1730]">1s</option>
              <option value={2000} className="bg-[#0B1730]">2s</option>
              <option value={5000} className="bg-[#0B1730]">5s</option>
            </select>
          </div>

          <button
            onClick={fetchSnapshot}
            className="px-3 py-2 rounded-lg bg-[#0B1730] hover:bg-[#182943] border border-[#182943] text-xs font-medium text-[#F8FAFC] transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#00A9FF] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Agora</span>
          </button>

          <button
            onClick={onTriggerQueueRecovery}
            disabled={isRecoveringQueue}
            className="px-3.5 py-2 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isRecoveringQueue ? 'Recuperando WAL...' : 'Forçar Sincronização WAL'}</span>
          </button>
        </div>
      </div>

      {/* MONITOR NAVIGATION TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#182943] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'telemetry'
                ? 'bg-[#0866F5]/15 text-[#F8FAFC] border border-[#00A9FF]/50'
                : 'bg-[#0B1730] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
            }`}
          >
            <Activity className="w-4 h-4 text-[#00A9FF]" />
            <span>Métricas Operacionais e Telemetria</span>
          </button>

          <button
            onClick={() => setActiveTab('debugger')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'debugger'
                ? 'bg-[#F5B942]/15 text-[#F8FAFC] border border-[#F5B942]/50'
                : 'bg-[#0B1730] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
            }`}
          >
            <Bug className="w-4 h-4 text-[#F5B942]" />
            <span>Live Event Debugger (6 Etapas)</span>
            {diagStats?.activeEffective && (
              <span className="w-2 h-2 rounded-full bg-[#20C997]" />
            )}
          </button>
        </div>

        {activeTab === 'debugger' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearBuffer}
              className="px-3 py-1.5 rounded-lg bg-[#0B1730] hover:bg-[#182943] border border-[#182943] text-xs font-mono text-[#94A3B8] hover:text-[#F8FAFC] transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#F05262]" />
              <span>Esvaziar Buffer ({diagStats?.inMemoryBufferSize ?? 0}/2000)</span>
            </button>
            <button
              onClick={() => fetchDiagnosticData()}
              className="px-3 py-1.5 rounded-lg bg-[#0B1730] hover:bg-[#182943] border border-[#182943] text-xs font-mono text-[#F8FAFC] transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00A9FF] ${isLoadingDiag ? 'animate-spin' : ''}`} />
              <span>Atualizar Eventos</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'telemetry' && (
        <>
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#F05262]/15 border border-[#F05262]/40 text-xs text-[#F8FAFC] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F05262] shrink-0" />
              <span>Falha ao consultar telemetria administrativa: {errorMsg}</span>
            </div>
          )}

          {/* CLOCK DISCIPLINE & SESSION METADATA BANNER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-lg bg-[#0B1730] border border-[#182943] text-xs">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-[#00A9FF] shrink-0" />
              <div>
                <span className="text-[11px] text-[#94A3B8] block">Sessão monitorada</span>
                <span className="font-mono font-semibold text-[#F8FAFC]">
                  {snapshot?.sessionId || sessionId} (@{snapshot?.roomUsername || roomUsername})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#F5B942] shrink-0" />
              <div>
                <span className="text-[11px] text-[#94A3B8] block">Medição de duração</span>
                <span className="font-mono font-semibold text-[#F8FAFC]">
                  Relógio Monotônico (performance.now)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#20C997] shrink-0" />
              <div>
                <span className="text-[11px] text-[#94A3B8] block">Auditoria temporal</span>
                <span className="font-mono font-semibold text-[#20C997]">
                  receivedAt (Servidor UTC) ≠ originalTimestamp (TikTok)
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1: REAL-TIME THROUGHPUT & QUEUE INDICATORS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#00A9FF]" />
                <span>1. Indicadores de Vazão (Eventos/s) e Saúde da Fila em Tempo Real</span>
              </h3>
              <span className="text-[11px] font-mono text-[#94A3B8] tabular-nums">
                Última leitura: {formatUtcTime(snapshot?.updatedAt)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-lg bg-[#0B1730] border border-[#182943]">
                <span className="text-[11px] text-[#94A3B8] block">Recebidos / s</span>
                <p className="text-xl font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                  {snapshot?.rates.receivedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#94A3B8] tabular-nums">
                  Pico: {snapshot?.rates.peakReceivedEps ?? 0}/s · Total: {snapshot?.totals.receivedEvents ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B1730] border border-[#182943]">
                <span className="text-[11px] text-[#94A3B8] block">Processados / s</span>
                <p className="text-xl font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                  {snapshot?.rates.processedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#94A3B8] tabular-nums">
                  Total: {snapshot?.totals.processedEvents ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B1730] border border-[#182943]">
                <span className="text-[11px] text-[#94A3B8] block">Persistidos / s</span>
                <p className="text-xl font-mono font-bold text-[#20C997] tabular-nums mt-0.5">
                  {snapshot?.rates.persistedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#94A3B8] tabular-nums">
                  Total: {snapshot?.totals.persistedEvents ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B1730] border border-[#182943]">
                <span className="text-[11px] text-[#94A3B8] block">Transmitidos SSE / s</span>
                <p className="text-xl font-mono font-bold text-[#F5B942] tabular-nums mt-0.5">
                  {snapshot?.rates.transmittedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#94A3B8] tabular-nums">
                  Total: {snapshot?.totals.transmittedEvents ?? 0} (ACK: {snapshot?.totals.confirmedByBrowserEvents ?? 0})
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B1730] border border-[#182943]">
                <span className="text-[11px] text-[#94A3B8] block">Fila Pendente (Idade)</span>
                <p className="text-xl font-mono font-bold text-[#F5B942] tabular-nums mt-0.5">
                  {snapshot?.totals.pendingInQueue ?? 0}
                </p>
                <span className="text-[10px] font-mono text-[#94A3B8] tabular-nums">
                  Mais antigo: {snapshot?.totals.oldestPendingAgeMs ?? 0} ms · Retry: {snapshot?.totals.retryingInQueue ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0B1730] border border-[#182943]">
                <span className="text-[11px] text-[#94A3B8] block">Retransmissões / Falhas</span>
                <p className="text-xl font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                  {snapshot?.totals.technicalRetransmissionsDetected ?? 0}{' '}
                  <span className="text-xs font-normal text-[#94A3B8]">dup</span>
                </p>
                <span className="text-[10px] font-mono text-[#94A3B8] tabular-nums">
                  Falhas BD: {snapshot?.totals.persistenceFailures ?? 0} · Rec: {(snapshot?.totals.tiktokReconnects ?? 0) + (snapshot?.totals.sseReconnects ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1B: 6-STAGE LATENCY PERCENTILES TABLE */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00A9FF]" />
              <span>Latências por Etapa do Pipeline (Percentis p50, p95 e p99 — Relógio Monotônico)</span>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-[#182943] bg-[#0B1730]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#050D20] text-[#F8FAFC] font-semibold border-b border-[#182943]">
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
                <tbody className="divide-y divide-[#182943] font-mono tabular-nums">
                  {[
                    {
                      label: '1. Recebimento pelo Servidor (Webcast → Adapter)',
                      stat: snapshot?.latencies.serverReceive,
                      color: 'text-[#F8FAFC]',
                    },
                    {
                      label: '2. Processamento e Normalização (Adapter → WAL)',
                      stat: snapshot?.latencies.processing,
                      color: 'text-[#F8FAFC]',
                    },
                    {
                      label: '3. Persistência Atômica no Firestore (WAL → Commit)',
                      stat: snapshot?.latencies.firestorePersistence,
                      color: 'text-[#20C997]',
                    },
                    {
                      label: '4. Entrega pelo Canal SSE (Outbox → Socket Write)',
                      stat: snapshot?.latencies.sseDelivery,
                      color: 'text-[#F5B942]',
                    },
                    {
                      label: '5. Recebimento no Navegador → Renderização Visual (React DOM)',
                      stat: snapshot?.latencies.browserRender,
                      color: 'text-[#F8FAFC]',
                    },
                    {
                      label: '6. Latência Total End-to-End (Captura Servidor → Feed Renderizado)',
                      stat: snapshot?.latencies.totalEndToEnd,
                      color: 'text-[#20C997] font-semibold',
                    },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-[#101F3D] transition">
                      <td className="py-2.5 px-4 font-sans font-medium text-[#F8FAFC]">{row.label}</td>
                      <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p50 ?? 0} ms</td>
                      <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p95 ?? 0} ms</td>
                      <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p99 ?? 0} ms</td>
                      <td className="py-2.5 px-4 text-right text-[#94A3B8]">{row.stat?.avg ?? 0} ms</td>
                      <td className="py-2.5 px-4 text-right text-[#94A3B8]">{row.stat?.last ?? 0} ms</td>
                      <td className="py-2.5 px-4 text-right text-[#94A3B8]">{row.stat?.samples ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3A: HISTORICAL CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#F8FAFC]">
                  Gráfico Histórico: Taxa de Eventos / Segundo
                </h4>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-[#00A9FF]">● Recebidos</span>
                  <span className="text-[#20C997]">● Persistidos</span>
                  <span className="text-[#F5B942]">● SSE</span>
                </div>
              </div>

              <div className="h-36 w-full bg-[#050D20] rounded-lg border border-[#182943] p-2 flex items-end gap-1 overflow-hidden">
                {timeSeries.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[#94A3B8] font-mono">
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
                        <div style={{ height: `${recvH}%` }} className="w-1/3 bg-[#00A9FF]/80 rounded-t" />
                        <div style={{ height: `${persH}%` }} className="w-1/3 bg-[#20C997] rounded-t" />
                        <div style={{ height: `${sseH}%` }} className="w-1/3 bg-[#F5B942] rounded-t" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#F8FAFC]">
                  Gráfico Histórico: Latência End-to-End (p50 / p95 / p99)
                </h4>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-[#20C997]">● p50</span>
                  <span className="text-[#F5B942]">● p95</span>
                  <span className="text-[#F05262]">● p99</span>
                </div>
              </div>

              <div className="h-36 w-full bg-[#050D20] rounded-lg border border-[#182943] p-2 flex items-end gap-1 overflow-hidden">
                {timeSeries.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[#94A3B8] font-mono">
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
                        <div style={{ height: `${p50H}%` }} className="w-1/3 bg-[#20C997] rounded-t" />
                        <div style={{ height: `${p95H}%` }} className="w-1/3 bg-[#F5B942] rounded-t" />
                        <div style={{ height: `${p99H}%` }} className="w-1/3 bg-[#F05262] rounded-t" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3B: 4 MILESTONE EVENT CARDS */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#00A9FF]" />
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
              <h3 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#00A9FF]" />
                <span>2. Diagnóstico Verificado por Componente (9 Subsistemas Independentes)</span>
              </h3>
              <span className="text-[11px] text-[#94A3B8]">
                Verificação real de estado
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(snapshot?.components || []).map((comp) => {
                const st = STATUS_BADGE_STYLES[comp.status] || STATUS_BADGE_STYLES.UNKNOWN;
                return (
                  <div
                    key={comp.id}
                    className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#F8FAFC]">{comp.name}</span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${st.bg} ${st.border} ${st.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#94A3B8] leading-relaxed">{comp.reason}</p>
                    </div>

                    {comp.metrics && (
                      <div className="pt-2 border-t border-[#182943] flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#94A3B8]">
                        {Object.entries(comp.metrics).map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-[#050D20] text-[#F8FAFC] border border-[#182943]">
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
            <h3 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#20C997]" />
              <span>4. Diagnóstico e Classificador de Perda de Eventos (6 Estágios)</span>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-[#182943] bg-[#0B1730]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#050D20] text-[#F8FAFC] font-semibold border-b border-[#182943]">
                  <tr>
                    <th className="py-2.5 px-4">Estágio de Classificação</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right font-mono">Em Trânsito</th>
                    <th className="py-2.5 px-4 text-right font-mono">Perdas / Falhas</th>
                    <th className="py-2.5 px-4">Diagnóstico Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#182943]">
                  {(snapshot?.lossClassification || []).map((stage) => (
                    <tr key={stage.stage} className="hover:bg-[#101F3D] transition">
                      <td className="py-2.5 px-4 font-medium text-[#F8FAFC] whitespace-nowrap">{stage.label}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                            stage.status === 'OK'
                              ? 'bg-[#20C997]/15 border-[#20C997]/40 text-[#20C997]'
                              : stage.status === 'IN_FLIGHT'
                              ? 'bg-[#0866F5]/15 border-[#00A9FF]/40 text-[#00A9FF]'
                              : stage.status === 'UNVERIFIABLE_AT_ORIGIN'
                              ? 'bg-[#101F3D] border-[#182943] text-[#94A3B8]'
                              : stage.status === 'WARNING'
                              ? 'bg-[#F5B942]/15 border-[#F5B942]/40 text-[#F5B942]'
                              : 'bg-[#F05262]/15 border-[#F05262]/40 text-[#F05262]'
                          }`}
                        >
                          {stage.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#F8FAFC] tabular-nums">
                        {stage.inFlightCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#F5B942] tabular-nums">
                        {stage.count}
                      </td>
                      <td className="py-2.5 px-4 text-[#94A3B8]">{stage.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 5: DURABLE SSE RECOVERY CURSORS & QUEUE INSPECTOR */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#182943] pb-2.5">
                <div>
                  <h4 className="text-xs font-semibold text-[#F8FAFC]">
                    Cursores SSE por Cliente e Janela de Retenção Outbox
                  </h4>
                  <p className="text-[11px] text-[#94A3B8]">
                    Retenção atual: seq #{snapshot?.sseRecovery.sessionMinRetainedSequence ?? 1} até #
                    {snapshot?.sseRecovery.sessionLatestSequence ?? 0}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={retentionInput}
                    onChange={(e) => setRetentionInput(e.target.value)}
                    className="w-20 px-2 py-1 rounded bg-[#050D20] border border-[#182943] text-xs font-mono text-[#F8FAFC]"
                    title="Máximo de eventos retidos por sessão para replay SSE"
                  />
                  <button
                    onClick={handleSaveRetention}
                    disabled={isUpdatingRetention}
                    className="px-2.5 py-1 rounded bg-[#101F3D] hover:bg-[#182943] border border-[#182943] text-[#F8FAFC] text-[11px] font-medium transition"
                  >
                    Salvar Retenção
                  </button>
                </div>
              </div>

              {(snapshot?.sseRecovery.activeClients || []).length === 0 ? (
                <p className="text-xs text-[#94A3B8] font-mono py-4 text-center">
                  Nenhum cliente SSE registrado nesta sessão.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(snapshot?.sseRecovery.activeClients || []).map((client) => (
                    <div
                      key={`${client.sessionId}_${client.clientId}`}
                      className="p-2.5 rounded-lg bg-[#050D20] border border-[#182943] flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              client.disconnectedAt ? 'bg-[#F5B942]' : 'bg-[#20C997]'
                            }`}
                          />
                          <span className="text-[#F8FAFC] font-semibold truncate">{client.clientId}</span>
                        </div>
                        <span className="text-[10px] text-[#94A3B8] block">
                          Reconexões: {client.reconnectCount} · Último ACK: {formatUtcTime(client.lastAckAt)}
                        </span>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <span className="text-[#94A3B8] block">Enviado: #{client.lastSentSequenceNumber}</span>
                        <span className="text-[#20C997] font-semibold block">
                          Confirmado: #{client.lastConfirmedSequenceNumber}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-3">
              <div className="flex items-center justify-between border-b border-[#182943] pb-2.5">
                <div>
                  <h4 className="text-xs font-semibold text-[#F8FAFC]">
                    Inspetor da Fila de Eventos (WAL e Outbox)
                  </h4>
                  <p className="text-[11px] text-[#94A3B8]">
                    Últimos registros processados pela fila durável da sessão
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[#20C997]">
                  {(snapshot?.queueItems || []).length} registros recentes
                </span>
              </div>

              {(snapshot?.queueItems || []).length === 0 ? (
                <p className="text-xs text-[#94A3B8] font-mono py-4 text-center">
                  Fila vazia — nenhum evento registrado ainda.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(snapshot?.queueItems || []).slice(0, 15).map((item) => (
                    <div
                      key={item.walId}
                      className="p-2 rounded-lg bg-[#050D20] border border-[#182943] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {item.sequenceNumber !== undefined && (
                            <span className="text-[10px] font-mono font-semibold text-[#F5B942]">
                              #{item.sequenceNumber}
                            </span>
                          )}
                          <span className="font-semibold text-[#F8FAFC] truncate">{item.displayHandle}</span>
                          <span className="text-[#94A3B8] truncate">({item.giftName})</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#94A3B8] block truncate">
                          {item.eventId} · Tentativas: {item.attempts}
                        </span>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                            item.status === 'CONFIRMED'
                              ? 'bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/40'
                              : item.status === 'FAILED'
                              ? 'bg-[#F05262]/15 text-[#F05262] border border-[#F05262]/40'
                              : 'bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/40'
                          }`}
                        >
                          {item.status}
                        </span>
                        <span className="block text-[10px] text-[#94A3B8] mt-0.5">{item.ageMs} ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 6: RECONNECTION HISTORY & RECENT ERRORS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-2.5">
              <h4 className="text-xs font-semibold text-[#F8FAFC]">
                Histórico de Reconexões e Retomadas SSE ({(snapshot?.reconnectHistory || []).length})
              </h4>
              {(snapshot?.reconnectHistory || []).length === 0 ? (
                <p className="text-xs text-[#94A3B8] font-mono py-3 text-center">
                  Nenhuma reconexão registrada nesta sessão.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs font-mono">
                  {(snapshot?.reconnectHistory || []).map((rec) => (
                    <div
                      key={rec.id}
                      className="p-2 rounded bg-[#050D20] border border-[#182943] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold text-[#F5B942] mr-1.5">
                          [{rec.source}]
                        </span>
                        <span className="text-[#F8FAFC]">{rec.reason}</span>
                      </div>
                      <span className="text-[10px] text-[#94A3B8] shrink-0">{formatUtcTime(rec.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-2.5">
              <h4 className="text-xs font-semibold text-[#F8FAFC]">
                Registro de Erros e Alertas Recentes ({(snapshot?.recentErrors || []).length})
              </h4>
              {(snapshot?.recentErrors || []).length === 0 ? (
                <p className="text-xs text-[#20C997] font-mono py-3 text-center">
                  ✓ Zero erros operacionais registrados.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs font-mono">
                  {(snapshot?.recentErrors || []).map((err) => (
                    <div
                      key={err.id}
                      className="p-2 rounded bg-[#F05262]/10 border border-[#F05262]/30 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase text-[#F05262] mr-1.5">
                          [{err.component}]
                        </span>
                        <span className="text-[#F8FAFC]">{err.message}</span>
                      </div>
                      <span className="text-[10px] text-[#94A3B8] shrink-0">{formatUtcTime(err.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: LIVE EVENT DEBUGGER */}
      {activeTab === 'debugger' && (
        <div className="space-y-6">
          <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#182943] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#050D20] border border-[#182943] text-[#F5B942]">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#F8FAFC] flex items-center gap-2">
                    <span>Diagnóstico Condicional de Eventos TikTok LIVE</span>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        diagStats?.activeEffective ? 'text-[#20C997]' : 'text-[#94A3B8]'
                      }`}
                    >
                      · {diagStats?.activeEffective ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    Observabilidade estrita sem alteração de regras de sorteio, bilhetes ou persistência.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleDebug(!diagStats?.debugRuntimeActive)}
                  disabled={isTogglingDebug || !diagStats?.debugMasterEnvActive}
                  className={`px-4 py-2 rounded-lg font-semibold text-xs transition flex items-center gap-2 ${
                    diagStats?.debugRuntimeActive
                      ? 'bg-[#F05262]/20 hover:bg-[#F05262]/30 border border-[#F05262]/40 text-[#F8FAFC]'
                      : 'bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {isTogglingDebug ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : diagStats?.debugRuntimeActive ? (
                    <X className="w-3.5 h-3.5" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {diagStats?.debugRuntimeActive ? 'Desativar Diagnóstico' : 'Ativar Diagnóstico'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#050D20] border border-[#182943] flex items-start gap-2.5">
                {diagStats?.debugMasterEnvActive ? (
                  <ShieldCheck className="w-4 h-4 text-[#20C997] shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-[#F5B942] shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold block font-mono text-[11px] text-[#F8FAFC]">
                    CHAVE-MESTRA: TIKTOK_LIVE_DEBUG = {diagStats?.debugMasterEnvActive ? 'true' : 'false'}
                  </span>
                  <span className="text-[11px] text-[#94A3B8]">
                    {diagStats?.debugMasterEnvActive
                      ? 'Chave de ambiente ativa. O painel administrativo possui autorização para ligar/desligar a coleta.'
                      : 'Variável desativada no servidor. A ativação via interface exige TIKTOK_LIVE_DEBUG=true no ambiente.'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#050D20] border border-[#182943] text-xs flex items-start gap-2.5">
                <Database className="w-4 h-4 text-[#00A9FF] shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold font-mono text-[11px] text-[#F8FAFC]">RETENÇÃO E POLÍTICA TTL (24H)</span>
                    <span className="text-[10px] font-mono text-[#F5B942]">
                      {diagStats?.firestoreTtlStatus || 'PENDING_GCP_POLICY_SETUP'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#94A3B8]">
                    Coleção dedicada <code className="text-[#F8FAFC]">tiktok_live_diagnostic_events</code> com campo <code className="text-[#F8FAFC]">ttlExpireAt</code>.
                  </span>
                </div>
              </div>
            </div>

            {toggleFeedback && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  toggleFeedback.type === 'success'
                    ? 'bg-[#20C997]/15 border border-[#20C997]/40 text-[#F8FAFC]'
                    : 'bg-[#F05262]/15 border border-[#F05262]/40 text-[#F8FAFC]'
                }`}
              >
                {toggleFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#F05262] shrink-0" />
                )}
                <span>{toggleFeedback.msg}</span>
              </div>
            )}
          </div>

          {/* 2. DIAGNOSTIC KPIS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Total Capturados</span>
              <p className="text-lg font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                {diagStats?.totalEventsCaptured ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">Buffer: {diagStats?.inMemoryBufferSize ?? 0}/2000</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Presentes Válidos</span>
              <p className="text-lg font-mono font-bold text-[#20C997] tabular-nums mt-0.5">
                {diagStats?.validGiftsProcessed ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">Aceitos</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Retransmissões</span>
              <p className="text-lg font-mono font-bold text-[#F5B942] tabular-nums mt-0.5">
                {diagStats?.blockedDuplicatesCount ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">Bloqueadas</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Com @Arroba</span>
              <p className="text-lg font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                {diagStats?.eventsWithHandleAvailable ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">uniqueId ok</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Sem @Arroba</span>
              <p className="text-lg font-mono font-bold text-[#F5B942] tabular-nums mt-0.5">
                {diagStats?.eventsWithoutHandleAvailable ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">Limitação</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Sem ID Numérico</span>
              <p className="text-lg font-mono font-bold text-[#F8FAFC] tabular-nums mt-0.5">
                {diagStats?.eventsWithoutSenderId ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">ID gerado</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Falhas BD</span>
              <p className="text-lg font-mono font-bold text-[#F05262] tabular-nums mt-0.5">
                {diagStats?.persistenceFailuresCount ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">Isoladas</span>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943]">
              <span className="text-[10px] text-[#94A3B8] block">Combos / Streaks</span>
              <p className="text-lg font-mono font-bold text-[#F5B942] tabular-nums mt-0.5">
                {diagStats?.comboEventsCount ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#94A3B8]">Deltas</span>
            </div>
          </div>

          {/* 3. FILTERS & SEARCH BAR */}
          <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 grow">
              <div className="relative min-w-[200px] grow sm:grow-0">
                <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por @usuário, nome ou ID..."
                  value={diagFilterUser}
                  onChange={(e) => setDiagFilterUser(e.target.value)}
                  className="w-full bg-[#050D20] border border-[#182943] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#F8FAFC] placeholder-[#94A3B8]/60 focus:outline-none focus:border-[#00A9FF]"
                />
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#050D20] border border-[#182943]">
                <span className="text-[#94A3B8] font-mono text-[10px]">Origem:</span>
                <select
                  value={diagFilterOrigin}
                  onChange={(e) => setDiagFilterOrigin(e.target.value)}
                  className="bg-transparent text-[#F8FAFC] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#0B1730]">Todas as Origens</option>
                  <option value="LIVE_REAL" className="bg-[#0B1730]">LIVE_REAL (TikTok Webcast)</option>
                  <option value="SIMULATED_TEST" className="bg-[#0B1730]">SIMULATED_TEST (Testes)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#050D20] border border-[#182943]">
                <span className="text-[#94A3B8] font-mono text-[10px]">Status:</span>
                <select
                  value={diagFilterStatus}
                  onChange={(e) => setDiagFilterStatus(e.target.value)}
                  className="bg-transparent text-[#F8FAFC] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#0B1730]">Todos os Status</option>
                  <option value="ACCEPTED" className="bg-[#0B1730]">Aceitos</option>
                  <option value="DUPLICATE" className="bg-[#0B1730]">Duplicados / Retransmitidos</option>
                  <option value="REJECTED" className="bg-[#0B1730]">Rejeitados</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => fetchDiagnosticData()}
              className="px-3 py-1.5 rounded-lg bg-[#101F3D] hover:bg-[#182943] border border-[#182943] text-[#F8FAFC] font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Filter className="w-3.5 h-3.5 text-[#00A9FF]" />
              <span>Filtrar</span>
            </button>
          </div>

          {/* 4. DIAGNOSTIC EVENTS TABLE */}
          <div className="p-4 rounded-lg bg-[#0B1730] border border-[#182943] space-y-3">
            <div className="flex items-center justify-between border-b border-[#182943] pb-2.5">
              <div>
                <h4 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#00A9FF]" />
                  <span>Eventos Diagnosticados ({diagEvents.length})</span>
                </h4>
                <p className="text-[11px] text-[#94A3B8]">
                  Clique em um evento para abrir o comparador detalhado das 6 etapas.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#94A3B8]">
                Retenção: 24h · Buffer: {diagStats?.inMemoryBufferSize ?? 0}/2000
              </span>
            </div>

            {diagEvents.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs text-[#94A3B8] font-mono">
                  Nenhum evento registrado no buffer diagnóstico com os filtros atuais.
                </p>
                {!diagStats?.activeEffective && (
                  <p className="text-[11px] text-[#F5B942] font-mono">
                    Aviso: O modo diagnóstico está atualmente desativado. Ative-o acima para iniciar o rastreamento das 6 etapas.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] font-semibold text-[#F8FAFC] bg-[#050D20] border-b border-[#182943]">
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
                  <tbody className="divide-y divide-[#182943] font-mono">
                    {diagEvents.map((ev) => {
                      const isSelected = selectedTrace?.traceId === ev.traceId;
                      return (
                        <tr
                          key={ev.traceId}
                          onClick={() => setSelectedTrace(ev)}
                          className={`cursor-pointer transition hover:bg-[#101F3D] ${
                            isSelected ? 'bg-[#101F3D] border-l-2 border-l-[#00A9FF]' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-[#F5B942] font-semibold truncate max-w-[140px]">
                            {ev.traceId}
                          </td>
                          <td className="py-2.5 px-3 text-[#94A3B8] text-[11px]">
                            {formatUtcTime(ev.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 text-[#F8FAFC]">
                            {ev.origin}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-sans font-semibold text-[#F8FAFC] truncate max-w-[160px]">
                              {ev.stageC.resultingHandle}
                            </div>
                            <span className="text-[10px] text-[#94A3B8] block truncate max-w-[160px]">
                              ID: {ev.stageC.stableId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[#F8FAFC] font-semibold">{ev.stageC.giftName}</span>{' '}
                            <span className="text-[#94A3B8]">({ev.stageC.repeatCount}x)</span>
                            <span className="text-[#20C997] text-[10px] block">
                              +{ev.stageE.coinsGranted} moedas ({ev.stageE.ticketsGenerated} bilhetes)
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-[#F8FAFC]">
                            {ev.stageD.reason}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[11px] font-semibold ${
                                ev.stageF.status === 'SUCCESS'
                                  ? 'text-[#20C997]'
                                  : ev.stageF.status === 'FAILED'
                                  ? 'text-[#F05262]'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              {ev.stageF.status}
                            </span>
                            {ev.stageF.totalTraceLatencyMs !== undefined && (
                              <span className="text-[10px] text-[#94A3B8] block">
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
                              className="px-2.5 py-1 rounded bg-[#050D20] hover:bg-[#182943] border border-[#182943] text-[10px] font-semibold text-[#F8FAFC] transition flex items-center gap-1 ml-auto"
                            >
                              <Eye className="w-3 h-3 text-[#00A9FF]" />
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

          {/* 5. 6-STAGE DEEP INSPECTION PANEL */}
          {selectedTrace && (
            <div className="p-5 rounded-xl bg-[#0B1730] border border-[#00A9FF]/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#182943] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[#050D20] border border-[#182943] text-[#00A9FF]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#F8FAFC]">
                        Inspeção do Trace: <span className="font-mono text-[#F5B942]">{selectedTrace.traceId}</span>
                      </h3>
                      <button
                        onClick={() => copyToClipboard(selectedTrace.traceId, selectedTrace.traceId)}
                        className="p-1 rounded bg-[#050D20] hover:bg-[#182943] text-[#94A3B8] hover:text-[#F8FAFC]"
                        title="Copiar Trace ID"
                      >
                        {copiedTraceId === selectedTrace.traceId ? (
                          <Check className="w-3 h-3 text-[#20C997]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-[#94A3B8] font-mono">
                      Sessão: {selectedTrace.sessionId} · Origem: {selectedTrace.origin} · Conector: {selectedTrace.connectorVersion} · Timestamp: {formatUtcTime(selectedTrace.timestamp)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTrace(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#050D20] hover:bg-[#182943] border border-[#182943] text-xs font-mono text-[#F8FAFC] self-start sm:self-auto"
                >
                  Fechar Inspeção
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* ETAPA A */}
                <div className="p-4 rounded-lg bg-[#101F3D] border border-[#182943] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#182943] pb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC]">
                      A. Payload Original
                    </span>
                    <span className="text-[10px] font-mono text-[#94A3B8]">
                      {selectedTrace.stageA.sizeBytes} bytes
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#94A3B8] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Sanitizados: <strong className="text-[#20C997]">{selectedTrace.stageA.sanitizedFieldsCount}</strong></span>
                      <span>Truncado: <strong>{selectedTrace.stageA.isTruncated ? 'SIM' : 'NÃO'}</strong></span>
                    </div>
                    <div className="bg-[#050D20] p-2.5 rounded border border-[#182943] text-[10px] overflow-x-auto max-h-56">
                      <pre className="text-[#F8FAFC]">
                        {JSON.stringify(selectedTrace.stageA.rawPayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* ETAPA B */}
                <div className="p-4 rounded-lg bg-[#101F3D] border border-[#182943] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#182943] pb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC]">
                      B. Identidade Extraída
                    </span>
                    <span className="text-[10px] font-mono text-[#20C997]">
                      {selectedTrace.stageB.handleAvailable ? '@arroba disponível' : 'Arroba indisponível'}
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 text-[#94A3B8]">
                    <div className="p-2 rounded bg-[#050D20] border border-[#182943] space-y-1">
                      <div><span>userId:</span> <strong className="text-[#F8FAFC]">{selectedTrace.stageB.userId || 'N/A'}</strong></div>
                      <div><span>uniqueId:</span> <strong className="text-[#F8FAFC]">{selectedTrace.stageB.uniqueId || 'N/A'}</strong></div>
                      <div><span>nickname:</span> <strong className="text-[#F8FAFC]">{selectedTrace.stageB.nickname || 'N/A'}</strong></div>
                      <div><span>secUid:</span> <span className="text-[10px] truncate block">{selectedTrace.stageB.secUid || 'N/A'}</span></div>
                    </div>
                    <div className="text-[10px] space-y-1 pt-1">
                      <div>Encontrados: <span className="text-[#F8FAFC]">{selectedTrace.stageB.rawFieldsFound?.join(', ') || 'Nenhum'}</span></div>
                      <div>Ausentes: <span>{selectedTrace.stageB.rawFieldsMissing?.join(', ') || 'Nenhum'}</span></div>
                      <div className="text-[#20C997] font-semibold text-[10px] pt-1">
                        ✓ Conta OAuth do anfitrião (@{selectedTrace.roomUsername}) isolada
                      </div>
                    </div>
                  </div>
                </div>

                {/* ETAPA C */}
                <div className="p-4 rounded-lg bg-[#101F3D] border border-[#182943] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#182943] pb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC]">
                      C. Normalização
                    </span>
                    <span className="text-[10px] font-mono text-[#94A3B8]">ID Canônico</span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050D20] border border-[#182943] text-[#94A3B8]">
                    <div><span>stableId:</span> <strong className="text-[#F8FAFC]">{selectedTrace.stageC.stableId}</strong></div>
                    <div><span>displayHandle:</span> <strong className="text-[#F8FAFC]">{selectedTrace.stageC.resultingHandle}</strong></div>
                    <div><span>presente:</span> <strong className="text-[#20C997]">{selectedTrace.stageC.giftName} (#{selectedTrace.stageC.giftId})</strong></div>
                    <div><span>repeatCount:</span> <strong className="text-[#F5B942]">{selectedTrace.stageC.repeatCount}x</strong> (final: {selectedTrace.stageC.repeatEnd ? 'Sim' : 'Não'})</div>
                    <div><span>groupId:</span> <span className="text-[10px] block truncate">{selectedTrace.stageC.groupId}</span></div>
                  </div>
                </div>

                {/* ETAPA D */}
                <div className="p-4 rounded-lg bg-[#101F3D] border border-[#182943] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#182943] pb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC]">
                      D. Deduplicação
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-[#20C997]">
                      {selectedTrace.stageD.accepted ? 'ACEITO' : 'REJEITADO / DUP'}
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050D20] border border-[#182943] text-[#94A3B8]">
                    <div><span>motivo:</span> <strong className="text-[#F8FAFC]">{selectedTrace.stageD.reason}</strong></div>
                    <div><span>duplicata:</span> <strong className={selectedTrace.stageD.isDuplicate ? 'text-[#F05262]' : 'text-[#20C997]'}>{selectedTrace.stageD.isDuplicate ? 'SIM' : 'NÃO'}</strong></div>
                    <div><span>tipo combo:</span> <span className="text-[#F8FAFC]">{selectedTrace.stageD.isComboContinuation ? 'Continuação de Combo' : selectedTrace.stageD.isComboFinalization ? 'Finalização de Combo' : 'Presente Individual'}</span></div>
                    <div><span>streakKey:</span> <span className="text-[10px] block truncate">{selectedTrace.stageD.streakKey || 'N/A'}</span></div>
                  </div>
                </div>

                {/* ETAPA E */}
                <div className="p-4 rounded-lg bg-[#101F3D] border border-[#182943] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#182943] pb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC]">
                      E. Contabilização
                    </span>
                    <span className="text-[10px] font-mono text-[#F5B942] font-semibold">
                      +{selectedTrace.stageE.coinsGranted} moedas
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050D20] border border-[#182943] text-[#94A3B8]">
                    <div><span>delta incremental:</span> <strong className="text-[#F8FAFC]">+{selectedTrace.stageE.deltaCount} presentes</strong></div>
                    <div><span>moedas concedidas:</span> <strong className="text-[#F5B942]">+{selectedTrace.stageE.coinsGranted}</strong></div>
                    <div><span>bilhetes gerados:</span> <strong className="text-[#20C997]">{selectedTrace.stageE.ticketsGenerated}</strong></div>
                    <div><span>números bilhetes:</span> <span className="text-[#20C997] text-[10px] block truncate">{selectedTrace.stageE.ticketNumbers?.join(', ') || 'Nenhum bilhete emitido'}</span></div>
                    <div><span>regra aplicada:</span> <span className="text-[10px]">{selectedTrace.stageE.ruleIdApplied || 'Padrão'} ({selectedTrace.stageE.rateApplied || 100} moedas/bilhete)</span></div>
                  </div>
                </div>

                {/* ETAPA F */}
                <div className="p-4 rounded-lg bg-[#101F3D] border border-[#182943] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#182943] pb-2">
                    <span className="text-xs font-semibold text-[#F8FAFC]">
                      F. Persistência e SSE
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-[#20C997]">
                      {selectedTrace.stageF.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#050D20] border border-[#182943] text-[#94A3B8]">
                    <div><span>doc Firestore:</span> <span className="text-[10px] text-[#F8FAFC] block truncate">{selectedTrace.stageF.firestoreDocId || 'N/A'}</span></div>
                    <div><span>latência recepção:</span> <span className="text-[#F8FAFC]">{selectedTrace.stageF.serverReceiveLatencyMs ?? '—'} ms</span></div>
                    <div><span>latência processamento:</span> <span className="text-[#F8FAFC]">{selectedTrace.stageF.processingLatencyMs ?? '—'} ms</span></div>
                    <div><span>latência gravação BD:</span> <span className="text-[#F8FAFC]">{selectedTrace.stageF.persistenceLatencyMs ?? '—'} ms</span></div>
                    <div><span>latência total trace:</span> <strong className="text-[#20C997]">{selectedTrace.stageF.totalTraceLatencyMs ?? '—'} ms</strong></div>
                    {selectedTrace.stageF.error && (
                      <div className="text-[#F05262] text-[10px]"><span>erro:</span> {selectedTrace.stageF.error}</div>
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
