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
    bg: 'bg-[#6EAA90]/15',
    border: 'border-[#6EAA90]/40',
    text: 'text-[#6EAA90]',
    dot: 'bg-[#6EAA90]',
    label: 'CONECTADO',
  },
  DEGRADED: {
    bg: 'bg-[#C6A56A]/15',
    border: 'border-[#C6A56A]/40',
    text: 'text-[#C6A56A]',
    dot: 'bg-[#C6A56A]',
    label: 'DEGRADADO',
  },
  DISCONNECTED: {
    bg: 'bg-[#171D1C]',
    border: 'border-[#313D39]',
    text: 'text-[#9BA8A3]',
    dot: 'bg-[#9BA8A3]',
    label: 'DESCONECTADO',
  },
  ERROR: {
    bg: 'bg-[#D96B6B]/15',
    border: 'border-[#D96B6B]/40',
    text: 'text-[#D96B6B]',
    dot: 'bg-[#D96B6B]',
    label: 'ERRO',
  },
  UNKNOWN: {
    bg: 'bg-[#2B3632]',
    border: 'border-[#313D39]',
    text: 'text-[#9BA8A3]',
    dot: 'bg-[#9BA8A3]',
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
    gold: 'text-[#C6A56A]',
    sapphire: 'text-[#EAE7DE]',
    emerald: 'text-[#6EAA90]',
    cyan: 'text-[#6EAA90]',
  };

  return (
    <div className="p-4 rounded-lg border border-[#313D39] bg-[#171D1C] space-y-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-[#313D39] pb-2">
        <div>
          <h4 className={`text-xs font-semibold ${titleColorMap[accentColor]}`}>
            {title}
          </h4>
          <p className="text-[11px] text-[#9BA8A3]">{subtitle}</p>
        </div>
        {milestone?.sequenceNumber !== undefined && (
          <span className="text-[#C6A56A] font-mono text-[11px] font-semibold tabular-nums">
            seq #{milestone.sequenceNumber}
          </span>
        )}
      </div>

      {!milestone ? (
        <div className="py-5 text-center text-xs text-[#9BA8A3] font-mono">
          Aguardando evento nesta etapa...
        </div>
      ) : (
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[#EAE7DE] truncate">{milestone.displayHandle}</span>
            <span className="font-mono font-semibold text-[#C6A56A] tabular-nums">
              +{milestone.coinsGranted} moedas
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#9BA8A3]">
            <span>
              {milestone.giftName} <strong className="font-mono text-[#EAE7DE]">({milestone.repeatCount}x)</strong>
            </span>
            {milestone.latencyMs !== undefined && (
              <span className="font-mono text-[#6EAA90] tabular-nums">{milestone.latencyMs} ms</span>
            )}
          </div>
          {milestone.ticketNumbers && milestone.ticketNumbers.length > 0 && (
            <div className="text-[11px] font-mono text-[#6EAA90] truncate">
              Bilhetes: #{milestone.ticketNumbers.slice(0, 5).join(', #')}
              {milestone.ticketNumbers.length > 5 ? ` (+${milestone.ticketNumbers.length - 5})` : ''}
            </div>
          )}
          <div className="pt-1.5 border-t border-[#313D39] text-[10px] font-mono text-[#9BA8A3] space-y-0.5">
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
      <div className="p-8 rounded-xl bg-[#222B28] border border-[#313D39] text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#171D1C] border border-[#313D39] flex items-center justify-center mx-auto text-[#C6A56A]">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-[#EAE7DE]">
          Monitor Técnico — Acesso Restrito
        </h2>
        <p className="text-xs text-[#9BA8A3] max-w-md mx-auto">
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
    <div className="space-y-6 rounded-xl p-5 sm:p-6 bg-[#222B28] border border-[#313D39] text-[#EAE7DE]">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#313D39] pb-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#171D1C] border border-[#313D39] flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-[#6EAA90]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-[#EAE7DE]">
                Monitor Técnico e Recuperação SSE
              </h2>
              <span className="text-xs text-[#9BA8A3]">
                · {adminLabel}
              </span>
            </div>
            <p className="text-xs text-[#9BA8A3] mt-0.5">
              Telemetria monotônica em tempo real, verificação real de 9 componentes, classificador em 6 estágios e Outbox SSE durável.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs font-mono text-[#9BA8A3]">
            <Clock className="w-3.5 h-3.5 text-[#6EAA90]" />
            <span>Atualização:</span>
            <select
              value={autoRefreshMs}
              onChange={(e) => setAutoRefreshMs(Number(e.target.value))}
              className="bg-transparent text-[#EAE7DE] font-semibold focus:outline-none"
            >
              <option value={1000} className="bg-[#171D1C]">1s</option>
              <option value={2000} className="bg-[#171D1C]">2s</option>
              <option value={5000} className="bg-[#171D1C]">5s</option>
            </select>
          </div>

          <button
            onClick={fetchSnapshot}
            className="px-3 py-2 rounded-lg bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] text-xs font-medium text-[#EAE7DE] transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#6EAA90] ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Agora</span>
          </button>

          <button
            onClick={onTriggerQueueRecovery}
            disabled={isRecoveringQueue}
            className="px-3.5 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E997F] text-[#171D1C] font-semibold text-xs transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{isRecoveringQueue ? 'Recuperando WAL...' : 'Forçar Sincronização WAL'}</span>
          </button>
        </div>
      </div>

      {/* MONITOR NAVIGATION TABS */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#313D39] pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'telemetry'
                ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#6EAA90]/60'
                : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
            }`}
          >
            <Activity className="w-4 h-4 text-[#6EAA90]" />
            <span>Métricas Operacionais e Telemetria</span>
          </button>

          <button
            onClick={() => setActiveTab('debugger')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              activeTab === 'debugger'
                ? 'bg-[#2B3632] text-[#EAE7DE] border border-[#C6A56A]/60'
                : 'bg-[#171D1C] text-[#9BA8A3] hover:text-[#EAE7DE] border border-[#313D39]'
            }`}
          >
            <Bug className="w-4 h-4 text-[#C6A56A]" />
            <span>Live Event Debugger (6 Etapas)</span>
            {diagStats?.activeEffective && (
              <span className="w-2 h-2 rounded-full bg-[#6EAA90]" />
            )}
          </button>
        </div>

        {activeTab === 'debugger' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearBuffer}
              className="px-3 py-1.5 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] border border-[#313D39] text-xs font-mono text-[#9BA8A3] hover:text-[#EAE7DE] transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#D96B6B]" />
              <span>Esvaziar Buffer ({diagStats?.inMemoryBufferSize ?? 0}/2000)</span>
            </button>
            <button
              onClick={() => fetchDiagnosticData()}
              className="px-3 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] text-xs font-mono text-[#EAE7DE] transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#6EAA90] ${isLoadingDiag ? 'animate-spin' : ''}`} />
              <span>Atualizar Eventos</span>
            </button>
          </div>
        )}
      </div>

      {activeTab === 'telemetry' && (
        <>
          {errorMsg && (
            <div className="p-3 rounded-lg bg-[#D96B6B]/15 border border-[#D96B6B]/40 text-xs text-[#EAE7DE] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D96B6B] shrink-0" />
              <span>Falha ao consultar telemetria administrativa: {errorMsg}</span>
            </div>
          )}

          {/* CLOCK DISCIPLINE & SESSION METADATA BANNER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39] text-xs">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-[#6EAA90] shrink-0" />
              <div>
                <span className="text-[11px] text-[#9BA8A3] block">Sessão monitorada</span>
                <span className="font-mono font-semibold text-[#EAE7DE]">
                  {snapshot?.sessionId || sessionId} (@{snapshot?.roomUsername || roomUsername})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#C6A56A] shrink-0" />
              <div>
                <span className="text-[11px] text-[#9BA8A3] block">Medição de duração</span>
                <span className="font-mono font-semibold text-[#EAE7DE]">
                  Relógio Monotônico (performance.now)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#6EAA90] shrink-0" />
              <div>
                <span className="text-[11px] text-[#9BA8A3] block">Auditoria temporal</span>
                <span className="font-mono font-semibold text-[#6EAA90]">
                  receivedAt (Servidor UTC) ≠ originalTimestamp (TikTok)
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1: REAL-TIME THROUGHPUT & QUEUE INDICATORS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#6EAA90]" />
                <span>1. Indicadores de Vazão (Eventos/s) e Saúde da Fila em Tempo Real</span>
              </h3>
              <span className="text-[11px] font-mono text-[#9BA8A3] tabular-nums">
                Última leitura: {formatUtcTime(snapshot?.updatedAt)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39]">
                <span className="text-[11px] text-[#9BA8A3] block">Recebidos / s</span>
                <p className="text-xl font-mono font-bold text-[#EAE7DE] tabular-nums mt-0.5">
                  {snapshot?.rates.receivedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#9BA8A3] tabular-nums">
                  Pico: {snapshot?.rates.peakReceivedEps ?? 0}/s · Total: {snapshot?.totals.receivedEvents ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39]">
                <span className="text-[11px] text-[#9BA8A3] block">Processados / s</span>
                <p className="text-xl font-mono font-bold text-[#EAE7DE] tabular-nums mt-0.5">
                  {snapshot?.rates.processedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#9BA8A3] tabular-nums">
                  Total: {snapshot?.totals.processedEvents ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39]">
                <span className="text-[11px] text-[#9BA8A3] block">Persistidos / s</span>
                <p className="text-xl font-mono font-bold text-[#6EAA90] tabular-nums mt-0.5">
                  {snapshot?.rates.persistedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#9BA8A3] tabular-nums">
                  Total: {snapshot?.totals.persistedEvents ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39]">
                <span className="text-[11px] text-[#9BA8A3] block">Transmitidos SSE / s</span>
                <p className="text-xl font-mono font-bold text-[#C6A56A] tabular-nums mt-0.5">
                  {snapshot?.rates.transmittedEps ?? 0}/s
                </p>
                <span className="text-[10px] font-mono text-[#9BA8A3] tabular-nums">
                  Total: {snapshot?.totals.transmittedEvents ?? 0} (ACK: {snapshot?.totals.confirmedByBrowserEvents ?? 0})
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39]">
                <span className="text-[11px] text-[#9BA8A3] block">Fila Pendente (Idade)</span>
                <p className="text-xl font-mono font-bold text-[#C6A56A] tabular-nums mt-0.5">
                  {snapshot?.totals.pendingInQueue ?? 0}
                </p>
                <span className="text-[10px] font-mono text-[#9BA8A3] tabular-nums">
                  Mais antigo: {snapshot?.totals.oldestPendingAgeMs ?? 0} ms · Retry: {snapshot?.totals.retryingInQueue ?? 0}
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39]">
                <span className="text-[11px] text-[#9BA8A3] block">Retransmissões / Falhas</span>
                <p className="text-xl font-mono font-bold text-[#EAE7DE] tabular-nums mt-0.5">
                  {snapshot?.totals.technicalRetransmissionsDetected ?? 0}{' '}
                  <span className="text-xs font-normal text-[#9BA8A3]">dup</span>
                </p>
                <span className="text-[10px] font-mono text-[#9BA8A3] tabular-nums">
                  Falhas BD: {snapshot?.totals.persistenceFailures ?? 0} · Rec: {(snapshot?.totals.tiktokReconnects ?? 0) + (snapshot?.totals.sseReconnects ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 1B: 6-STAGE LATENCY PERCENTILES TABLE */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#6EAA90]" />
              <span>Latências por Etapa do Pipeline (Percentis p50, p95 e p99 — Relógio Monotônico)</span>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-[#313D39] bg-[#171D1C]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#2B3632] text-[#EAE7DE] font-semibold border-b border-[#313D39]">
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
                <tbody className="divide-y divide-[#313D39] font-mono tabular-nums">
                  {[
                    {
                      label: '1. Recebimento pelo Servidor (Webcast → Adapter)',
                      stat: snapshot?.latencies.serverReceive,
                      color: 'text-[#EAE7DE]',
                    },
                    {
                      label: '2. Processamento e Normalização (Adapter → WAL)',
                      stat: snapshot?.latencies.processing,
                      color: 'text-[#EAE7DE]',
                    },
                    {
                      label: '3. Persistência Atômica no Firestore (WAL → Commit)',
                      stat: snapshot?.latencies.firestorePersistence,
                      color: 'text-[#6EAA90]',
                    },
                    {
                      label: '4. Entrega pelo Canal SSE (Outbox → Socket Write)',
                      stat: snapshot?.latencies.sseDelivery,
                      color: 'text-[#C6A56A]',
                    },
                    {
                      label: '5. Recebimento no Navegador → Renderização Visual (React DOM)',
                      stat: snapshot?.latencies.browserRender,
                      color: 'text-[#EAE7DE]',
                    },
                    {
                      label: '6. Latência Total End-to-End (Captura Servidor → Feed Renderizado)',
                      stat: snapshot?.latencies.totalEndToEnd,
                      color: 'text-[#6EAA90] font-semibold',
                    },
                  ].map((row) => (
                    <tr key={row.label} className="hover:bg-[#222B28] transition">
                      <td className="py-2.5 px-4 font-sans font-medium text-[#EAE7DE]">{row.label}</td>
                      <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p50 ?? 0} ms</td>
                      <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p95 ?? 0} ms</td>
                      <td className={`py-2.5 px-4 text-right ${row.color}`}>{row.stat?.p99 ?? 0} ms</td>
                      <td className="py-2.5 px-4 text-right text-[#9BA8A3]">{row.stat?.avg ?? 0} ms</td>
                      <td className="py-2.5 px-4 text-right text-[#9BA8A3]">{row.stat?.last ?? 0} ms</td>
                      <td className="py-2.5 px-4 text-right text-[#9BA8A3]">{row.stat?.samples ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3A: HISTORICAL CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#EAE7DE]">
                  Gráfico Histórico: Taxa de Eventos / Segundo
                </h4>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-[#EAE7DE]">● Recebidos</span>
                  <span className="text-[#6EAA90]">● Persistidos</span>
                  <span className="text-[#C6A56A]">● SSE</span>
                </div>
              </div>

              <div className="h-36 w-full bg-[#222B28] rounded-lg border border-[#313D39] p-2 flex items-end gap-1 overflow-hidden">
                {timeSeries.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[#9BA8A3] font-mono">
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
                        <div style={{ height: `${recvH}%` }} className="w-1/3 bg-[#EAE7DE]/70 rounded-t" />
                        <div style={{ height: `${persH}%` }} className="w-1/3 bg-[#6EAA90] rounded-t" />
                        <div style={{ height: `${sseH}%` }} className="w-1/3 bg-[#C6A56A] rounded-t" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#EAE7DE]">
                  Gráfico Histórico: Latência End-to-End (p50 / p95 / p99)
                </h4>
                <div className="flex items-center gap-3 text-[10px] font-mono">
                  <span className="text-[#6EAA90]">● p50</span>
                  <span className="text-[#C6A56A]">● p95</span>
                  <span className="text-[#D96B6B]">● p99</span>
                </div>
              </div>

              <div className="h-36 w-full bg-[#222B28] rounded-lg border border-[#313D39] p-2 flex items-end gap-1 overflow-hidden">
                {timeSeries.length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[#9BA8A3] font-mono">
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
                        <div style={{ height: `${p50H}%` }} className="w-1/3 bg-[#6EAA90] rounded-t" />
                        <div style={{ height: `${p95H}%` }} className="w-1/3 bg-[#C6A56A] rounded-t" />
                        <div style={{ height: `${p99H}%` }} className="w-1/3 bg-[#D96B6B] rounded-t" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* SECTION 3B: 4 MILESTONE EVENT CARDS */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#6EAA90]" />
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
              <h3 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
                <Server className="w-4 h-4 text-[#6EAA90]" />
                <span>2. Diagnóstico Verificado por Componente (9 Subsistemas Independentes)</span>
              </h3>
              <span className="text-[11px] text-[#9BA8A3]">
                Verificação real de estado
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(snapshot?.components || []).map((comp) => {
                const st = STATUS_BADGE_STYLES[comp.status] || STATUS_BADGE_STYLES.UNKNOWN;
                return (
                  <div
                    key={comp.id}
                    className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#EAE7DE]">{comp.name}</span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${st.bg} ${st.border} ${st.text}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#9BA8A3] leading-relaxed">{comp.reason}</p>
                    </div>

                    {comp.metrics && (
                      <div className="pt-2 border-t border-[#313D39] flex flex-wrap items-center gap-2 text-[10px] font-mono text-[#9BA8A3]">
                        {Object.entries(comp.metrics).map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-[#222B28] text-[#EAE7DE] border border-[#313D39]">
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
            <h3 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#6EAA90]" />
              <span>4. Diagnóstico e Classificador de Perda de Eventos (6 Estágios)</span>
            </h3>

            <div className="overflow-x-auto rounded-lg border border-[#313D39] bg-[#171D1C]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#2B3632] text-[#EAE7DE] font-semibold border-b border-[#313D39]">
                  <tr>
                    <th className="py-2.5 px-4">Estágio de Classificação</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right font-mono">Em Trânsito</th>
                    <th className="py-2.5 px-4 text-right font-mono">Perdas / Falhas</th>
                    <th className="py-2.5 px-4">Diagnóstico Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#313D39]">
                  {(snapshot?.lossClassification || []).map((stage) => (
                    <tr key={stage.stage} className="hover:bg-[#222B28] transition">
                      <td className="py-2.5 px-4 font-medium text-[#EAE7DE] whitespace-nowrap">{stage.label}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                            stage.status === 'OK'
                              ? 'bg-[#6EAA90]/15 border-[#6EAA90]/40 text-[#6EAA90]'
                              : stage.status === 'IN_FLIGHT'
                              ? 'bg-[#2B3632] border-[#313D39] text-[#EAE7DE]'
                              : stage.status === 'UNVERIFIABLE_AT_ORIGIN'
                              ? 'bg-[#2B3632] border-[#313D39] text-[#9BA8A3]'
                              : stage.status === 'WARNING'
                              ? 'bg-[#C6A56A]/15 border-[#C6A56A]/40 text-[#C6A56A]'
                              : 'bg-[#D96B6B]/15 border-[#D96B6B]/40 text-[#D96B6B]'
                          }`}
                        >
                          {stage.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-[#EAE7DE] tabular-nums">
                        {stage.inFlightCount}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#C6A56A] tabular-nums">
                        {stage.count}
                      </td>
                      <td className="py-2.5 px-4 text-[#9BA8A3]">{stage.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 5: DURABLE SSE RECOVERY CURSORS & QUEUE INSPECTOR */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#313D39] pb-2.5">
                <div>
                  <h4 className="text-xs font-semibold text-[#EAE7DE]">
                    Cursores SSE por Cliente e Janela de Retenção Outbox
                  </h4>
                  <p className="text-[11px] text-[#9BA8A3]">
                    Retenção atual: seq #{snapshot?.sseRecovery.sessionMinRetainedSequence ?? 1} até #
                    {snapshot?.sseRecovery.sessionLatestSequence ?? 0}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={retentionInput}
                    onChange={(e) => setRetentionInput(e.target.value)}
                    className="w-20 px-2 py-1 rounded bg-[#222B28] border border-[#313D39] text-xs font-mono text-[#EAE7DE]"
                    title="Máximo de eventos retidos por sessão para replay SSE"
                  />
                  <button
                    onClick={handleSaveRetention}
                    disabled={isUpdatingRetention}
                    className="px-2.5 py-1 rounded bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] text-[#EAE7DE] text-[11px] font-medium transition"
                  >
                    Salvar Retenção
                  </button>
                </div>
              </div>

              {(snapshot?.sseRecovery.activeClients || []).length === 0 ? (
                <p className="text-xs text-[#9BA8A3] font-mono py-4 text-center">
                  Nenhum cliente SSE registrado nesta sessão.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(snapshot?.sseRecovery.activeClients || []).map((client) => (
                    <div
                      key={`${client.sessionId}_${client.clientId}`}
                      className="p-2.5 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              client.disconnectedAt ? 'bg-[#C6A56A]' : 'bg-[#6EAA90]'
                            }`}
                          />
                          <span className="text-[#EAE7DE] font-semibold truncate">{client.clientId}</span>
                        </div>
                        <span className="text-[10px] text-[#9BA8A3] block">
                          Reconexões: {client.reconnectCount} · Último ACK: {formatUtcTime(client.lastAckAt)}
                        </span>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <span className="text-[#9BA8A3] block">Enviado: #{client.lastSentSequenceNumber}</span>
                        <span className="text-[#6EAA90] font-semibold block">
                          Confirmado: #{client.lastConfirmedSequenceNumber}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-3">
              <div className="flex items-center justify-between border-b border-[#313D39] pb-2.5">
                <div>
                  <h4 className="text-xs font-semibold text-[#EAE7DE]">
                    Inspetor da Fila de Eventos (WAL e Outbox)
                  </h4>
                  <p className="text-[11px] text-[#9BA8A3]">
                    Últimos registros processados pela fila durável da sessão
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[#6EAA90]">
                  {(snapshot?.queueItems || []).length} registros recentes
                </span>
              </div>

              {(snapshot?.queueItems || []).length === 0 ? (
                <p className="text-xs text-[#9BA8A3] font-mono py-4 text-center">
                  Fila vazia — nenhum evento registrado ainda.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(snapshot?.queueItems || []).slice(0, 15).map((item) => (
                    <div
                      key={item.walId}
                      className="p-2 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {item.sequenceNumber !== undefined && (
                            <span className="text-[10px] font-mono font-semibold text-[#C6A56A]">
                              #{item.sequenceNumber}
                            </span>
                          )}
                          <span className="font-semibold text-[#EAE7DE] truncate">{item.displayHandle}</span>
                          <span className="text-[#9BA8A3] truncate">({item.giftName})</span>
                        </div>
                        <span className="text-[10px] font-mono text-[#9BA8A3] block truncate">
                          {item.eventId} · Tentativas: {item.attempts}
                        </span>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                            item.status === 'CONFIRMED'
                              ? 'bg-[#6EAA90]/15 text-[#6EAA90] border border-[#6EAA90]/40'
                              : item.status === 'FAILED'
                              ? 'bg-[#D96B6B]/15 text-[#D96B6B] border border-[#D96B6B]/40'
                              : 'bg-[#C6A56A]/15 text-[#C6A56A] border border-[#C6A56A]/40'
                          }`}
                        >
                          {item.status}
                        </span>
                        <span className="block text-[10px] text-[#9BA8A3] mt-0.5">{item.ageMs} ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 6: RECONNECTION HISTORY & RECENT ERRORS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-2.5">
              <h4 className="text-xs font-semibold text-[#EAE7DE]">
                Histórico de Reconexões e Retomadas SSE ({(snapshot?.reconnectHistory || []).length})
              </h4>
              {(snapshot?.reconnectHistory || []).length === 0 ? (
                <p className="text-xs text-[#9BA8A3] font-mono py-3 text-center">
                  Nenhuma reconexão registrada nesta sessão.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs font-mono">
                  {(snapshot?.reconnectHistory || []).map((rec) => (
                    <div
                      key={rec.id}
                      className="p-2 rounded bg-[#222B28] border border-[#313D39] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold text-[#C6A56A] mr-1.5">
                          [{rec.source}]
                        </span>
                        <span className="text-[#EAE7DE]">{rec.reason}</span>
                      </div>
                      <span className="text-[10px] text-[#9BA8A3] shrink-0">{formatUtcTime(rec.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-2.5">
              <h4 className="text-xs font-semibold text-[#EAE7DE]">
                Registro de Erros e Alertas Recentes ({(snapshot?.recentErrors || []).length})
              </h4>
              {(snapshot?.recentErrors || []).length === 0 ? (
                <p className="text-xs text-[#6EAA90] font-mono py-3 text-center">
                  ✓ Zero erros operacionais registrados.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 text-xs font-mono">
                  {(snapshot?.recentErrors || []).map((err) => (
                    <div
                      key={err.id}
                      className="p-2 rounded bg-[#D96B6B]/10 border border-[#D96B6B]/30 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold uppercase text-[#D96B6B] mr-1.5">
                          [{err.component}]
                        </span>
                        <span className="text-[#EAE7DE]">{err.message}</span>
                      </div>
                      <span className="text-[10px] text-[#9BA8A3] shrink-0">{formatUtcTime(err.timestamp)}</span>
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
          <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#313D39] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#222B28] border border-[#313D39] text-[#C6A56A]">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#EAE7DE] flex items-center gap-2">
                    <span>Diagnóstico Condicional de Eventos TikTok LIVE</span>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        diagStats?.activeEffective ? 'text-[#6EAA90]' : 'text-[#9BA8A3]'
                      }`}
                    >
                      · {diagStats?.activeEffective ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </h3>
                  <p className="text-xs text-[#9BA8A3]">
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
                      ? 'bg-[#D96B6B]/20 hover:bg-[#D96B6B]/30 border border-[#D96B6B]/40 text-[#EAE7DE]'
                      : 'bg-[#6EAA90] hover:bg-[#5E997F] text-[#171D1C] disabled:opacity-40 disabled:cursor-not-allowed'
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
              <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] flex items-start gap-2.5">
                {diagStats?.debugMasterEnvActive ? (
                  <ShieldCheck className="w-4 h-4 text-[#6EAA90] shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-[#C6A56A] shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold block font-mono text-[11px] text-[#EAE7DE]">
                    CHAVE-MESTRA: TIKTOK_LIVE_DEBUG = {diagStats?.debugMasterEnvActive ? 'true' : 'false'}
                  </span>
                  <span className="text-[11px] text-[#9BA8A3]">
                    {diagStats?.debugMasterEnvActive
                      ? 'Chave de ambiente ativa. O painel administrativo possui autorização para ligar/desligar a coleta.'
                      : 'Variável desativada no servidor. A ativação via interface exige TIKTOK_LIVE_DEBUG=true no ambiente.'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] text-xs flex items-start gap-2.5">
                <Database className="w-4 h-4 text-[#6EAA90] shrink-0 mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold font-mono text-[11px] text-[#EAE7DE]">RETENÇÃO E POLÍTICA TTL (24H)</span>
                    <span className="text-[10px] font-mono text-[#C6A56A]">
                      {diagStats?.firestoreTtlStatus || 'PENDING_GCP_POLICY_SETUP'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#9BA8A3]">
                    Coleção dedicada <code className="text-[#EAE7DE]">tiktok_live_diagnostic_events</code> com campo <code className="text-[#EAE7DE]">ttlExpireAt</code>.
                  </span>
                </div>
              </div>
            </div>

            {toggleFeedback && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  toggleFeedback.type === 'success'
                    ? 'bg-[#6EAA90]/15 border border-[#6EAA90]/40 text-[#EAE7DE]'
                    : 'bg-[#D96B6B]/15 border border-[#D96B6B]/40 text-[#EAE7DE]'
                }`}
              >
                {toggleFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#6EAA90] shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-[#D96B6B] shrink-0" />
                )}
                <span>{toggleFeedback.msg}</span>
              </div>
            )}
          </div>

          {/* 2. DIAGNOSTIC KPIS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Total Capturados</span>
              <p className="text-lg font-mono font-bold text-[#EAE7DE] tabular-nums mt-0.5">
                {diagStats?.totalEventsCaptured ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">Buffer: {diagStats?.inMemoryBufferSize ?? 0}/2000</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Presentes Válidos</span>
              <p className="text-lg font-mono font-bold text-[#6EAA90] tabular-nums mt-0.5">
                {diagStats?.validGiftsProcessed ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">Aceitos</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Retransmissões</span>
              <p className="text-lg font-mono font-bold text-[#C6A56A] tabular-nums mt-0.5">
                {diagStats?.blockedDuplicatesCount ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">Bloqueadas</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Com @Arroba</span>
              <p className="text-lg font-mono font-bold text-[#EAE7DE] tabular-nums mt-0.5">
                {diagStats?.eventsWithHandleAvailable ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">uniqueId ok</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Sem @Arroba</span>
              <p className="text-lg font-mono font-bold text-[#C6A56A] tabular-nums mt-0.5">
                {diagStats?.eventsWithoutHandleAvailable ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">Limitação</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Sem ID Numérico</span>
              <p className="text-lg font-mono font-bold text-[#EAE7DE] tabular-nums mt-0.5">
                {diagStats?.eventsWithoutSenderId ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">ID gerado</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Falhas BD</span>
              <p className="text-lg font-mono font-bold text-[#D96B6B] tabular-nums mt-0.5">
                {diagStats?.persistenceFailuresCount ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">Isoladas</span>
            </div>

            <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39]">
              <span className="text-[10px] text-[#9BA8A3] block">Combos / Streaks</span>
              <p className="text-lg font-mono font-bold text-[#C6A56A] tabular-nums mt-0.5">
                {diagStats?.comboEventsCount ?? 0}
              </p>
              <span className="text-[10px] font-mono text-[#9BA8A3]">Deltas</span>
            </div>
          </div>

          {/* 3. FILTERS & SEARCH BAR */}
          <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 grow">
              <div className="relative min-w-[200px] grow sm:grow-0">
                <Search className="w-3.5 h-3.5 text-[#9BA8A3] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por @usuário, nome ou ID..."
                  value={diagFilterUser}
                  onChange={(e) => setDiagFilterUser(e.target.value)}
                  className="w-full bg-[#222B28] border border-[#313D39] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#EAE7DE] placeholder-[#9BA8A3]/60 focus:outline-none focus:border-[#6EAA90]"
                />
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#222B28] border border-[#313D39]">
                <span className="text-[#9BA8A3] font-mono text-[10px]">Origem:</span>
                <select
                  value={diagFilterOrigin}
                  onChange={(e) => setDiagFilterOrigin(e.target.value)}
                  className="bg-transparent text-[#EAE7DE] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#171D1C]">Todas as Origens</option>
                  <option value="LIVE_REAL" className="bg-[#171D1C]">LIVE_REAL (TikTok Webcast)</option>
                  <option value="SIMULATED_TEST" className="bg-[#171D1C]">SIMULATED_TEST (Testes)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#222B28] border border-[#313D39]">
                <span className="text-[#9BA8A3] font-mono text-[10px]">Status:</span>
                <select
                  value={diagFilterStatus}
                  onChange={(e) => setDiagFilterStatus(e.target.value)}
                  className="bg-transparent text-[#EAE7DE] font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-[#171D1C]">Todos os Status</option>
                  <option value="ACCEPTED" className="bg-[#171D1C]">Aceitos</option>
                  <option value="DUPLICATE" className="bg-[#171D1C]">Duplicados / Retransmitidos</option>
                  <option value="REJECTED" className="bg-[#171D1C]">Rejeitados</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => fetchDiagnosticData()}
              className="px-3 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] text-[#EAE7DE] font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Filter className="w-3.5 h-3.5 text-[#6EAA90]" />
              <span>Filtrar</span>
            </button>
          </div>

          {/* 4. DIAGNOSTIC EVENTS TABLE */}
          <div className="p-4 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-3">
            <div className="flex items-center justify-between border-b border-[#313D39] pb-2.5">
              <div>
                <h4 className="text-xs font-semibold text-[#EAE7DE] flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#6EAA90]" />
                  <span>Eventos Diagnosticados ({diagEvents.length})</span>
                </h4>
                <p className="text-[11px] text-[#9BA8A3]">
                  Clique em um evento para abrir o comparador detalhado das 6 etapas.
                </p>
              </div>
              <span className="text-[11px] font-mono text-[#9BA8A3]">
                Retenção: 24h · Buffer: {diagStats?.inMemoryBufferSize ?? 0}/2000
              </span>
            </div>

            {diagEvents.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-xs text-[#9BA8A3] font-mono">
                  Nenhum evento registrado no buffer diagnóstico com os filtros atuais.
                </p>
                {!diagStats?.activeEffective && (
                  <p className="text-[11px] text-[#C6A56A] font-mono">
                    Aviso: O modo diagnóstico está atualmente desativado. Ative-o acima para iniciar o rastreamento das 6 etapas.
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] font-semibold text-[#EAE7DE] bg-[#2B3632] border-b border-[#313D39]">
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
                  <tbody className="divide-y divide-[#313D39] font-mono">
                    {diagEvents.map((ev) => {
                      const isSelected = selectedTrace?.traceId === ev.traceId;
                      return (
                        <tr
                          key={ev.traceId}
                          onClick={() => setSelectedTrace(ev)}
                          className={`cursor-pointer transition hover:bg-[#222B28] ${
                            isSelected ? 'bg-[#2B3632]' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-[#C6A56A] font-semibold truncate max-w-[140px]">
                            {ev.traceId}
                          </td>
                          <td className="py-2.5 px-3 text-[#9BA8A3] text-[11px]">
                            {formatUtcTime(ev.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 text-[#EAE7DE]">
                            {ev.origin}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-sans font-semibold text-[#EAE7DE] truncate max-w-[160px]">
                              {ev.stageC.resultingHandle}
                            </div>
                            <span className="text-[10px] text-[#9BA8A3] block truncate max-w-[160px]">
                              ID: {ev.stageC.stableId}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-[#EAE7DE] font-semibold">{ev.stageC.giftName}</span>{' '}
                            <span className="text-[#9BA8A3]">({ev.stageC.repeatCount}x)</span>
                            <span className="text-[#6EAA90] text-[10px] block">
                              +{ev.stageE.coinsGranted} moedas ({ev.stageE.ticketsGenerated} bilhetes)
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-[#EAE7DE]">
                            {ev.stageD.reason}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[11px] font-semibold ${
                                ev.stageF.status === 'SUCCESS'
                                  ? 'text-[#6EAA90]'
                                  : ev.stageF.status === 'FAILED'
                                  ? 'text-[#D96B6B]'
                                  : 'text-[#9BA8A3]'
                              }`}
                            >
                              {ev.stageF.status}
                            </span>
                            {ev.stageF.totalTraceLatencyMs !== undefined && (
                              <span className="text-[10px] text-[#9BA8A3] block">
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
                              className="px-2.5 py-1 rounded bg-[#222B28] hover:bg-[#2B3632] border border-[#313D39] text-[10px] font-semibold text-[#EAE7DE] transition flex items-center gap-1 ml-auto"
                            >
                              <Eye className="w-3 h-3 text-[#6EAA90]" />
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
            <div className="p-5 rounded-xl bg-[#171D1C] border border-[#6EAA90]/50 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#313D39] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[#222B28] border border-[#313D39] text-[#6EAA90]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#EAE7DE]">
                        Inspeção do Trace: <span className="font-mono text-[#C6A56A]">{selectedTrace.traceId}</span>
                      </h3>
                      <button
                        onClick={() => copyToClipboard(selectedTrace.traceId, selectedTrace.traceId)}
                        className="p-1 rounded bg-[#222B28] hover:bg-[#2B3632] text-[#9BA8A3] hover:text-[#EAE7DE]"
                        title="Copiar Trace ID"
                      >
                        {copiedTraceId === selectedTrace.traceId ? (
                          <Check className="w-3 h-3 text-[#6EAA90]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-[#9BA8A3] font-mono">
                      Sessão: {selectedTrace.sessionId} · Origem: {selectedTrace.origin} · Conector: {selectedTrace.connectorVersion} · Timestamp: {formatUtcTime(selectedTrace.timestamp)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTrace(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#222B28] hover:bg-[#2B3632] border border-[#313D39] text-xs font-mono text-[#EAE7DE] self-start sm:self-auto"
                >
                  Fechar Inspeção
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {/* ETAPA A */}
                <div className="p-4 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#313D39] pb-2">
                    <span className="text-xs font-semibold text-[#EAE7DE]">
                      A. Payload Original
                    </span>
                    <span className="text-[10px] font-mono text-[#9BA8A3]">
                      {selectedTrace.stageA.sizeBytes} bytes
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#9BA8A3] space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Sanitizados: <strong className="text-[#6EAA90]">{selectedTrace.stageA.sanitizedFieldsCount}</strong></span>
                      <span>Truncado: <strong>{selectedTrace.stageA.isTruncated ? 'SIM' : 'NÃO'}</strong></span>
                    </div>
                    <div className="bg-[#171D1C] p-2.5 rounded border border-[#313D39] text-[10px] overflow-x-auto max-h-56">
                      <pre className="text-[#EAE7DE]">
                        {JSON.stringify(selectedTrace.stageA.rawPayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* ETAPA B */}
                <div className="p-4 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#313D39] pb-2">
                    <span className="text-xs font-semibold text-[#EAE7DE]">
                      B. Identidade Extraída
                    </span>
                    <span className="text-[10px] font-mono text-[#6EAA90]">
                      {selectedTrace.stageB.handleAvailable ? '@arroba disponível' : 'Arroba indisponível'}
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 text-[#9BA8A3]">
                    <div className="p-2 rounded bg-[#171D1C] border border-[#313D39] space-y-1">
                      <div><span>userId:</span> <strong className="text-[#EAE7DE]">{selectedTrace.stageB.userId || 'N/A'}</strong></div>
                      <div><span>uniqueId:</span> <strong className="text-[#EAE7DE]">{selectedTrace.stageB.uniqueId || 'N/A'}</strong></div>
                      <div><span>nickname:</span> <strong className="text-[#EAE7DE]">{selectedTrace.stageB.nickname || 'N/A'}</strong></div>
                      <div><span>secUid:</span> <span className="text-[10px] truncate block">{selectedTrace.stageB.secUid || 'N/A'}</span></div>
                    </div>
                    <div className="text-[10px] space-y-1 pt-1">
                      <div>Encontrados: <span className="text-[#EAE7DE]">{selectedTrace.stageB.rawFieldsFound?.join(', ') || 'Nenhum'}</span></div>
                      <div>Ausentes: <span>{selectedTrace.stageB.rawFieldsMissing?.join(', ') || 'Nenhum'}</span></div>
                      <div className="text-[#6EAA90] font-semibold text-[10px] pt-1">
                        ✓ Conta OAuth do anfitrião (@{selectedTrace.roomUsername}) isolada
                      </div>
                    </div>
                  </div>
                </div>

                {/* ETAPA C */}
                <div className="p-4 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#313D39] pb-2">
                    <span className="text-xs font-semibold text-[#EAE7DE]">
                      C. Normalização
                    </span>
                    <span className="text-[10px] font-mono text-[#9BA8A3]">ID Canônico</span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#171D1C] border border-[#313D39] text-[#9BA8A3]">
                    <div><span>stableId:</span> <strong className="text-[#EAE7DE]">{selectedTrace.stageC.stableId}</strong></div>
                    <div><span>displayHandle:</span> <strong className="text-[#EAE7DE]">{selectedTrace.stageC.resultingHandle}</strong></div>
                    <div><span>presente:</span> <strong className="text-[#6EAA90]">{selectedTrace.stageC.giftName} (#{selectedTrace.stageC.giftId})</strong></div>
                    <div><span>repeatCount:</span> <strong className="text-[#C6A56A]">{selectedTrace.stageC.repeatCount}x</strong> (final: {selectedTrace.stageC.repeatEnd ? 'Sim' : 'Não'})</div>
                    <div><span>groupId:</span> <span className="text-[10px] block truncate">{selectedTrace.stageC.groupId}</span></div>
                  </div>
                </div>

                {/* ETAPA D */}
                <div className="p-4 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#313D39] pb-2">
                    <span className="text-xs font-semibold text-[#EAE7DE]">
                      D. Deduplicação
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-[#6EAA90]">
                      {selectedTrace.stageD.accepted ? 'ACEITO' : 'REJEITADO / DUP'}
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#171D1C] border border-[#313D39] text-[#9BA8A3]">
                    <div><span>motivo:</span> <strong className="text-[#EAE7DE]">{selectedTrace.stageD.reason}</strong></div>
                    <div><span>duplicata:</span> <strong className={selectedTrace.stageD.isDuplicate ? 'text-[#D96B6B]' : 'text-[#6EAA90]'}>{selectedTrace.stageD.isDuplicate ? 'SIM' : 'NÃO'}</strong></div>
                    <div><span>tipo combo:</span> <span className="text-[#EAE7DE]">{selectedTrace.stageD.isComboContinuation ? 'Continuação de Combo' : selectedTrace.stageD.isComboFinalization ? 'Finalização de Combo' : 'Presente Individual'}</span></div>
                    <div><span>streakKey:</span> <span className="text-[10px] block truncate">{selectedTrace.stageD.streakKey || 'N/A'}</span></div>
                  </div>
                </div>

                {/* ETAPA E */}
                <div className="p-4 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#313D39] pb-2">
                    <span className="text-xs font-semibold text-[#EAE7DE]">
                      E. Contabilização
                    </span>
                    <span className="text-[10px] font-mono text-[#C6A56A] font-semibold">
                      +{selectedTrace.stageE.coinsGranted} moedas
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#171D1C] border border-[#313D39] text-[#9BA8A3]">
                    <div><span>delta incremental:</span> <strong className="text-[#EAE7DE]">+{selectedTrace.stageE.deltaCount} presentes</strong></div>
                    <div><span>moedas concedidas:</span> <strong className="text-[#C6A56A]">+{selectedTrace.stageE.coinsGranted}</strong></div>
                    <div><span>bilhetes gerados:</span> <strong className="text-[#6EAA90]">{selectedTrace.stageE.ticketsGenerated}</strong></div>
                    <div><span>números bilhetes:</span> <span className="text-[#6EAA90] text-[10px] block truncate">{selectedTrace.stageE.ticketNumbers?.join(', ') || 'Nenhum bilhete emitido'}</span></div>
                    <div><span>regra aplicada:</span> <span className="text-[10px]">{selectedTrace.stageE.ruleIdApplied || 'Padrão'} ({selectedTrace.stageE.rateApplied || 100} moedas/bilhete)</span></div>
                  </div>
                </div>

                {/* ETAPA F */}
                <div className="p-4 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#313D39] pb-2">
                    <span className="text-xs font-semibold text-[#EAE7DE]">
                      F. Persistência e SSE
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-[#6EAA90]">
                      {selectedTrace.stageF.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono space-y-1.5 p-2 rounded bg-[#171D1C] border border-[#313D39] text-[#9BA8A3]">
                    <div><span>doc Firestore:</span> <span className="text-[10px] text-[#EAE7DE] block truncate">{selectedTrace.stageF.firestoreDocId || 'N/A'}</span></div>
                    <div><span>latência recepção:</span> <span className="text-[#EAE7DE]">{selectedTrace.stageF.serverReceiveLatencyMs ?? '—'} ms</span></div>
                    <div><span>latência processamento:</span> <span className="text-[#EAE7DE]">{selectedTrace.stageF.processingLatencyMs ?? '—'} ms</span></div>
                    <div><span>latência gravação BD:</span> <span className="text-[#EAE7DE]">{selectedTrace.stageF.persistenceLatencyMs ?? '—'} ms</span></div>
                    <div><span>latência total trace:</span> <strong className="text-[#6EAA90]">{selectedTrace.stageF.totalTraceLatencyMs ?? '—'} ms</strong></div>
                    {selectedTrace.stageF.error && (
                      <div className="text-[#D96B6B] text-[10px]"><span>erro:</span> {selectedTrace.stageF.error}</div>
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
