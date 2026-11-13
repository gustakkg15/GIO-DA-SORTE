import React, { useState } from 'react';
import {
  RefreshCw,
  Play,
  Users,
  Gift,
  Trophy,
  AlertTriangle,
  RotateCw,
  Clock,
  ArrowRight,
  X,
  FileText,
  Search,
  FileSpreadsheet,
  Pause,
  Square,
  Plus,
  Settings,
  Layers,
} from 'lucide-react';
import {
  TikTokLiveSession,
  TikTokLiveParticipant,
  LiveDrawRecord,
  Campaign,
  RaffleSettings,
  DeliveryStatus,
} from '../types.js';
import { getAuthBearerHeaders } from '../utils/tiktokLiveService.js';
import {
  mapTikTokConnectionState,
  mapLiveSessionCommercialStatus,
} from '../utils/tiktokStatusMapper.js';

export interface TikTokLiveGiftsArenaViewProps {
  liveConnectionState: string;
  liveConnectedUsername: string;
  refreshPlatformStatus: () => void;
  isLoadingLiveDetails: boolean;
  onOpenManageConnection?: () => void;
  liveDrawFeedback: { type: 'success' | 'error'; text: string } | null;
  liveDrawTargetMode: 'SESSION' | 'CAMPAIGN';
  setLiveDrawTargetMode: (mode: 'SESSION' | 'CAMPAIGN') => void;
  liveSessionsSummary: TikTokLiveSession[];
  activeLiveSession: TikTokLiveSession | null;
  setSelectedLiveSessionId: (id: string) => void;
  liveCampaigns: Campaign[];
  activeLiveCampaign: Campaign | null;
  setSelectedCampaignId: (id: string) => void;
  settings: RaffleSettings;
  livePrizeInput: string;
  setLivePrizeInput: (prize: string) => void;
  isFreezingLiveSnapshot: boolean;
  handlePrepareLiveGiftsDraw: () => void;
  selectedLiveDraws: LiveDrawRecord[];
  selectedLiveParticipants: TikTokLiveParticipant[];
  onDrawsUpdated?: () => void;
  // Consolidated Arena Props (Search, CSV Export, Ticket Map, Session Commercial Controls & Campaign Sync)
  participantSearchQuery?: string;
  setParticipantSearchQuery?: (query: string) => void;
  totalParticipantsCount?: number;
  ticketsByParticipantMap?: Map<string, number[]>;
  onExportCsv?: () => void;
  onInspectParticipant?: (tiktokUserId: string) => void;
  onPauseCollection?: () => void;
  onResumeCollection?: () => void;
  onEndCollection?: () => void;
  onStartNewSession?: () => void;
  onToggleSessionRules?: () => void;
  isEditingSessionRules?: boolean;
  missingLinkedCampaignWarning?: string | null;
}

export const TikTokLiveGiftsArenaView: React.FC<TikTokLiveGiftsArenaViewProps> = ({
  liveConnectionState,
  liveConnectedUsername,
  refreshPlatformStatus,
  isLoadingLiveDetails,
  onOpenManageConnection,
  liveDrawFeedback,
  liveDrawTargetMode,
  setLiveDrawTargetMode,
  liveSessionsSummary,
  activeLiveSession,
  setSelectedLiveSessionId,
  liveCampaigns,
  activeLiveCampaign,
  setSelectedCampaignId,
  settings,
  livePrizeInput,
  setLivePrizeInput,
  isFreezingLiveSnapshot,
  handlePrepareLiveGiftsDraw,
  selectedLiveDraws,
  selectedLiveParticipants,
  onDrawsUpdated,
  participantSearchQuery = '',
  setParticipantSearchQuery,
  totalParticipantsCount,
  ticketsByParticipantMap,
  onExportCsv,
  onInspectParticipant,
  onPauseCollection,
  onResumeCollection,
  onEndCollection,
  onStartNewSession,
  onToggleSessionRules,
  isEditingSessionRules,
  missingLinkedCampaignWarning,
}) => {
  // Modal states for Etapa 2 Delivery and Redraw
  const [statusModalDraw, setStatusModalDraw] = useState<LiveDrawRecord | null>(null);
  const [auditModalDraw, setAuditModalDraw] = useState<LiveDrawRecord | null>(null);
  const [redrawModalDraw, setRedrawModalDraw] = useState<LiveDrawRecord | null>(null);

  // Form states
  const [selectedNewStatus, setSelectedNewStatus] = useState<DeliveryStatus>('CONTACTED');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [contactMethod, setContactMethod] = useState('Chat TikTok LIVE / Direct');
  const [trackingCode, setTrackingCode] = useState('');
  const [redrawReason, setRedrawReason] = useState('Prazo regulamentar de comparecimento expirou sem manifestação do ganhador original.');

  // Loading & feedback
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
  const [isSubmittingRedraw, setIsSubmittingRedraw] = useState(false);
  const [isAdvancingCycle, setIsAdvancingCycle] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const connMeta = mapTikTokConnectionState(
    liveConnectionState,
    false,
    liveConnectedUsername
  );
  const sessionCommercialMeta = mapLiveSessionCommercialStatus(activeLiveSession?.status);

  const linkedCampaignObj = activeLiveSession?.campaignId
    ? liveCampaigns.find((c) => c.campaignId === activeLiveSession.campaignId) || null
    : null;
  const resolvedCycleId =
    activeLiveSession?.cycleId ||
    activeLiveCampaign?.activeCycleId ||
    linkedCampaignObj?.activeCycleId ||
    null;

  const getDeliveryStatusMeta = (status?: DeliveryStatus) => {
    switch (status) {
      case 'DELIVERED':
        return { label: 'Prêmio Entregue', badgeClass: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/40' };
      case 'CONTACTED':
        return { label: 'Contatado', badgeClass: 'bg-[#0131CD]/25 text-[#FFFFFF] border-[#0131CD]/50' };
      case 'UNCLAIMED_EXPIRED':
        return { label: 'Não Reclamado / Expirado', badgeClass: 'bg-[#F05262]/20 text-[#F05262] border-[#F05262]/40' };
      case 'REDRAWN':
        return { label: 'Resorteado (Substituído)', badgeClass: 'bg-[#080D18] text-[#A6C957] border-[#A6C957]/40' };
      case 'PENDING_CONTACT':
      default:
        return { label: 'Pendente Contato', badgeClass: 'bg-[#080D18] text-[#A5B1C5] border-[var(--gio-border-subtle)]' };
    }
  };

  const handleUpdateDeliveryStatus = async () => {
    if (!statusModalDraw) return;
    setIsSubmittingDelivery(true);
    setModalFeedback(null);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/tiktok/pro/draws/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          drawId: statusModalDraw.drawId,
          status: selectedNewStatus,
          details: {
            notes: deliveryNotes.trim() || undefined,
            contactMethod: contactMethod.trim() || undefined,
            trackingCode: trackingCode.trim() || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao atualizar status de entrega.');
      }
      setStatusModalDraw(null);
      setDeliveryNotes('');
      setTrackingCode('');
      refreshPlatformStatus();
      if (onDrawsUpdated) onDrawsUpdated();
    } catch (err) {
      setModalFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  const handleExecuteRedraw = async () => {
    if (!redrawModalDraw) return;
    if (!redrawReason.trim()) {
      setModalFeedback({ type: 'error', text: 'Informe a justificativa do novo sorteio.' });
      return;
    }
    setIsSubmittingRedraw(true);
    setModalFeedback(null);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/tiktok/pro/draws/redraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          drawId: redrawModalDraw.drawId,
          reason: redrawReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao realizar novo sorteio por não comparecimento.');
      }
      setRedrawModalDraw(null);
      refreshPlatformStatus();
      if (onDrawsUpdated) onDrawsUpdated();
    } catch (err) {
      setModalFeedback({ type: 'error', text: (err as Error).message });
    } finally {
      setIsSubmittingRedraw(false);
    }
  };

  const handleAdvanceCampaignCycle = async (campaignId: string) => {
    setIsAdvancingCycle(true);
    try {
      const authHeaders = await getAuthBearerHeaders();
      const res = await fetch('/api/tiktok/pro/campaigns/cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ campaignId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao avançar ciclo da campanha.');
      }
      refreshPlatformStatus();
      if (onDrawsUpdated) onDrawsUpdated();
    } catch (err) {
      setModalFeedback({ type: 'error', text: `Não foi possível avançar o ciclo: ${(err as Error).message}` });
    } finally {
      setIsAdvancingCycle(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="p-5 sm:p-6 rounded-xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--gio-border-subtle)]">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="gio-badge-pro">
                <Trophy className="w-3.5 h-3.5 text-[#A6C957]" />
                <span>ARENA OFICIAL · PRESENTES LIVE</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                  liveDrawTargetMode === 'CAMPAIGN'
                    ? 'bg-[#A6C957]/15 border-[#A6C957]/40 text-[#A6C957]'
                    : 'bg-[#0131CD]/15 border-[#0131CD]/40 text-[#FFFFFF]'
                }`}
              >
                {liveDrawTargetMode === 'CAMPAIGN' ? 'Modo Campanha Multi-LIVE' : 'Modo Sessão Individual'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#FFFFFF] flex items-center gap-2 tracking-tight">
              <span>Mesa Oficial de Sorteio — Presentes LIVE</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#A5B1C5]">
              Selecione abaixo a sessão da transmissão ou a campanha vinculada para auditar bilhetes e realizar o sorteio com snapshot SHA-256 certificado.
            </p>
          </div>

          {/* Separar visualmente o estado de conexão (Webcast) do estado comercial da sessão */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* 1. Indicador Oficial de Conexão Webcast */}
            <div
              title={connMeta.titleHint}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${connMeta.badgeClass}`}
            >
              <span className={`w-2 h-2 rounded-full ${connMeta.dotClass}`} />
              <span>{connMeta.label}</span>
              {connMeta.state === 'CONNECTED' && liveConnectedUsername && (
                <span className="font-mono text-[#FFFFFF]">
                  · @{liveConnectedUsername.replace(/^@+/, '')}
                </span>
              )}
            </div>

            {/* 2. Indicador do Estado Comercial da Sessão */}
            <div
              title="Estado comercial da sessão para contabilização de presentes em bilhetes"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${sessionCommercialMeta.badgeClass}`}
            >
              <span className={`w-2 h-2 rounded-full ${sessionCommercialMeta.dotClass}`} />
              <span>{sessionCommercialMeta.label}</span>
            </div>

            <button
              type="button"
              onClick={() => refreshPlatformStatus()}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#A5B1C5] ${isLoadingLiveDetails ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            {onToggleSessionRules && (
              <button
                type="button"
                onClick={onToggleSessionRules}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Settings className="w-3.5 h-3.5 text-[#A5B1C5]" />
                <span>{isEditingSessionRules ? 'Fechar Regras da Sessão' : 'Regras da Sessão'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Warning when activeSession.campaignId is not found in loaded campaigns */}
        {missingLinkedCampaignWarning && (
          <div className="p-3.5 rounded-xl bg-[#A6C957]/15 border border-[#A6C957]/35 text-xs text-[#FFFFFF] flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#A6C957] shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold text-[#A6C957] block">
                Vínculo de Campanha Não Localizado
              </strong>
              <span>{missingLinkedCampaignWarning}</span>
            </div>
          </div>
        )}

        {liveDrawFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium ${
              liveDrawFeedback.type === 'error'
                ? 'bg-[#F05262]/10 border-[#F05262]/40 text-[#F05262]'
                : 'bg-[#A6C957]/15 border-[#A6C957]/40 text-[#A6C957]'
            }`}
          >
            {liveDrawFeedback.text}
          </div>
        )}

        {/* Seletor de Origem Real: Sessão Individual vs Campanha Acumulada */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Configuração e Botão Sortear Agora */}
          <div
            className={`lg:col-span-5 space-y-4 rounded-xl p-5 border transition-colors ${
              liveDrawTargetMode === 'CAMPAIGN'
                ? 'bg-[#111B30] border-[#A6C957]/45'
                : 'bg-[#111B30] border-[var(--gio-border-subtle)]'
            }`}
          >
            <div className="grid grid-cols-2 gap-1.5 bg-[#080D18] p-1.5 rounded-xl border border-[var(--gio-border-subtle)]">
              <button
                type="button"
                onClick={() => setLiveDrawTargetMode('SESSION')}
                className={`min-h-[38px] px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  liveDrawTargetMode === 'SESSION'
                    ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm shadow-[#0131CD]/30'
                    : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                }`}
              >
                <Gift className="w-3.5 h-3.5 shrink-0" />
                <span>Sessão da LIVE ({liveSessionsSummary.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setLiveDrawTargetMode('CAMPAIGN')}
                className={`min-h-[38px] px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  liveDrawTargetMode === 'CAMPAIGN'
                    ? 'bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold shadow-sm shadow-[#A6C957]/25'
                    : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Multi-LIVE ({liveCampaigns.length})</span>
              </button>
            </div>

            {liveDrawTargetMode === 'SESSION' ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-[#080D18]/80 border border-[#0131CD]/25 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#FFFFFF] font-semibold flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-[#A6C957]" />
                    <span>Sorteio de Transmissão Única</span>
                  </span>
                  <span className="text-[11px] font-medium text-[#A5B1C5] tabular-nums">1 LIVE = 1 Urna</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#A5B1C5] mb-1.5">
                    Sessão LIVE Real
                  </label>
                  {liveSessionsSummary.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs text-[#A5B1C5]">
                      Nenhuma sessão registrada ainda. Conecte uma transmissão acima para contabilizar presentes e bilhetes.
                    </div>
                  ) : (
                    <select
                      value={activeLiveSession?.sessionId || ''}
                      onChange={(e) => setSelectedLiveSessionId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs sm:text-sm text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                    >
                      {liveSessionsSummary.map((sess) => {
                        const sMeta = mapLiveSessionCommercialStatus(sess.status);
                        return (
                          <option key={sess.sessionId} value={sess.sessionId}>
                            @{sess.username} · {sess.raffleTitle || sess.roomTitle || 'Sessão LIVE'} ({sess.currentTicketCounter || 0} bilhetes · {sMeta.label})
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {activeLiveSession && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5 text-center tabular-nums">
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] min-w-0">
                      <span className="text-[11px] font-medium text-[#A5B1C5] block mb-0.5 truncate">Participantes</span>
                      <strong
                        title={`Participantes: ${(totalParticipantsCount !== undefined ? totalParticipantsCount : activeLiveSession.uniqueSupportersCount || 0).toLocaleString('pt-BR')}`}
                        className="text-base sm:text-lg font-bold text-[#FFFFFF] tabular-nums block truncate"
                      >
                        {totalParticipantsCount !== undefined
                          ? totalParticipantsCount
                          : activeLiveSession.uniqueSupportersCount || 0}
                      </strong>
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] min-w-0">
                      <span className="text-[11px] font-medium text-[#A5B1C5] block mb-0.5 truncate">Moedas LIVE</span>
                      <strong
                        title={`Moedas LIVE: ${(activeLiveSession.totalCoins || 0).toLocaleString('pt-BR')}`}
                        className="text-base sm:text-lg font-bold text-[#FFFFFF] tabular-nums block truncate"
                      >
                        {(activeLiveSession.totalCoins || 0).toLocaleString('pt-BR')}
                      </strong>
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#080D18] border border-[#A6C957]/30 min-w-0">
                      <span className="text-[11px] font-medium text-[#A5B1C5] block mb-0.5 truncate">Bilhetes Reais</span>
                      <strong
                        title={`Bilhetes Reais: ${(activeLiveSession.currentTicketCounter || 0).toLocaleString('pt-BR')}`}
                        className="text-base sm:text-lg font-bold text-[#A6C957] tabular-nums block truncate"
                      >
                        {(activeLiveSession.currentTicketCounter || 0).toLocaleString('pt-BR')}
                      </strong>
                    </div>
                  </div>
                )}

                {activeLiveSession && (
                  <div className="p-3 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2 text-xs tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A5B1C5]">Taxa persistida na sessão:</span>
                      <strong className="text-[#FFFFFF] font-semibold tabular-nums">
                        {activeLiveSession.currentRate} moedas = 1 bilhete
                      </strong>
                    </div>

                    {activeLiveSession.campaignId && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--gio-border-subtle)]">
                        <span className="text-[#A5B1C5] flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-[#A6C957]" />
                          <span>Campanha vinculada:</span>
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[#FFFFFF]">
                            {linkedCampaignObj ? linkedCampaignObj.title : activeLiveSession.campaignId}
                          </span>
                          {(activeLiveSession.cycleId || linkedCampaignObj?.currentCycleIndex) && (
                            <span className="px-2 py-0.5 rounded bg-[#A6C957]/15 border border-[#A6C957]/35 text-[#A6C957] font-mono text-[11px] font-bold">
                              {linkedCampaignObj?.currentCycleIndex
                                ? `Ciclo #${linkedCampaignObj.currentCycleIndex}`
                                : activeLiveSession.cycleId}
                              {activeLiveSession.cycleId && linkedCampaignObj?.currentCycleIndex
                                ? ` (${activeLiveSession.cycleId})`
                                : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Controles Comerciais da Sessão (Ingressão de Presentes) */}
                {activeLiveSession && (onPauseCollection || onResumeCollection || onEndCollection || onStartNewSession) && (
                  <div className="pt-2 border-t border-[var(--gio-border-subtle)] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {activeLiveSession.status === 'active' && onPauseCollection && (
                        <button
                          type="button"
                          onClick={onPauseCollection}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#A6C957] border border-[var(--gio-border-subtle)] text-xs font-medium transition flex items-center gap-1.5"
                        >
                          <Pause className="w-3 h-3" />
                          <span>Pausar Ingressão</span>
                        </button>
                      )}
                      {activeLiveSession.status === 'paused' && onResumeCollection && (
                        <button
                          type="button"
                          onClick={onResumeCollection}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#A6C957]/15 hover:bg-[#A6C957]/25 text-[#A6C957] border border-[#A6C957]/40 text-xs font-medium transition flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3" />
                          <span>Retomar Ingressão</span>
                        </button>
                      )}
                      {activeLiveSession.status !== 'ended' && onEndCollection && (
                        <button
                          type="button"
                          onClick={onEndCollection}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#F05262] border border-[var(--gio-border-subtle)] text-xs font-medium transition flex items-center gap-1.5"
                        >
                          <Square className="w-3 h-3" />
                          <span>Encerrar Ingressão</span>
                        </button>
                      )}
                    </div>

                    {onStartNewSession && (
                      <button
                        type="button"
                        onClick={onStartNewSession}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium transition flex items-center gap-1.5"
                      >
                        <Plus className="w-3 h-3 text-[#A5B1C5]" />
                        <span>Nova Sessão</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-[#A6C957]/12 border border-[#A6C957]/35 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#A6C957] font-semibold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Campanha Multi-LIVE Acumulada</span>
                  </span>
                  <span className="text-[11px] font-medium text-[#A6C957]">Múltiplas LIVEs</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-[#A6C957] mb-1.5">
                    Campanha Acumulada Real
                  </label>
                  {liveCampaigns.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs text-[#A5B1C5]">
                      Nenhuma campanha acumulada encontrada. Crie ou vincule sessões em Recursos Avançados (Multi-LIVE).
                    </div>
                  ) : (
                    <select
                      value={activeLiveCampaign?.campaignId || ''}
                      onChange={(e) => setSelectedCampaignId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#080D18] border border-[#A6C957]/40 text-xs sm:text-sm text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                    >
                      {!activeLiveCampaign && (
                        <option value="">Selecione uma campanha...</option>
                      )}
                      {liveCampaigns.map((camp) => (
                        <option key={camp.campaignId} value={camp.campaignId}>
                          {camp.title} ({camp.totalAccumulatedTickets || 0} bilhetes · {camp.defaultRate || settings.rate} moedas/bil.)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {activeLiveCampaign && (
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5 text-center tabular-nums">
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] min-w-0">
                      <span className="text-[11px] font-medium text-[#A5B1C5] block mb-0.5 truncate">LIVEs</span>
                      <strong
                        title={`LIVEs vinculadas: ${activeLiveCampaign.participatingSessionIds?.length || 0}`}
                        className="text-base sm:text-lg font-bold text-[#FFFFFF] tabular-nums block truncate"
                      >
                        {activeLiveCampaign.participatingSessionIds?.length || 0}
                      </strong>
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] min-w-0">
                      <span className="text-[11px] font-medium text-[#A5B1C5] block mb-0.5 truncate">Status</span>
                      <strong
                        title={`Status da campanha: ${activeLiveCampaign.status}`}
                        className="text-xs sm:text-sm font-bold text-[#A6C957] block truncate"
                      >
                        {activeLiveCampaign.status}
                      </strong>
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-xl bg-[#080D18] border border-[#A6C957]/30 min-w-0">
                      <span className="text-[11px] font-medium text-[#A5B1C5] block mb-0.5 truncate">Bilhetes</span>
                      <strong
                        title={`Bilhetes acumulados: ${(activeLiveCampaign.totalAccumulatedTickets || 0).toLocaleString('pt-BR')}`}
                        className="text-base sm:text-lg font-bold text-[#A6C957] tabular-nums block truncate"
                      >
                        {(activeLiveCampaign.totalAccumulatedTickets || 0).toLocaleString('pt-BR')}
                      </strong>
                    </div>
                  </div>
                )}

                {activeLiveCampaign && (
                  <div className="p-3 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#A5B1C5]">Modalidade:</span>
                      <span className="text-[#FFFFFF] font-semibold">
                        {activeLiveCampaign.campaignMode === 'RECURRING_CUMULATIVE'
                          ? 'Recorrente Acumulativa'
                          : activeLiveCampaign.campaignMode === 'RECURRING_RESET'
                          ? 'Recorrente com Reset'
                          : 'Sorteio Único'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-[var(--gio-border-subtle)]">
                      <span className="text-[#A5B1C5]">Ciclo Ativo:</span>
                      <span className="px-2 py-0.5 rounded bg-[#A6C957]/15 border border-[#A6C957]/35 text-[#A6C957] font-mono font-bold">
                        Ciclo #{activeLiveCampaign.currentCycleIndex || 1}
                        {resolvedCycleId ? ` · ${resolvedCycleId}` : ''}
                      </span>
                    </div>

                    {(activeLiveCampaign.campaignMode === 'RECURRING_RESET' ||
                      activeLiveCampaign.campaignMode === 'RECURRING_CUMULATIVE') && (
                      <div className="pt-2">
                        {Boolean(activeLiveCampaign.pendingDeliveryCount && activeLiveCampaign.pendingDeliveryCount > 0) ? (
                          <div className="p-2.5 rounded bg-[#F05262]/15 border border-[#F05262]/40 text-[11px] text-[#F05262] space-y-1">
                            <div className="font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span>Próximo Ciclo Bloqueado</span>
                            </div>
                            <p>
                              Existe 1 ou mais prêmios com entrega pendente ({activeLiveCampaign.pendingDeliveryCount}).
                              Confirme a entrega (DELIVERED) ou declare o prêmio como Não Reclamado/Novo Sorteio para liberar o próximo ciclo.
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isAdvancingCycle}
                            onClick={() => handleAdvanceCampaignCycle(activeLiveCampaign.campaignId)}
                            className="w-full min-h-[36px] py-1.5 px-3 rounded-lg bg-[#111B30] hover:bg-[#080D18] border border-[#A6C957]/40 text-xs font-semibold text-[#A6C957] flex items-center justify-center gap-1.5 transition"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${isAdvancingCycle ? 'animate-spin' : ''}`} />
                            <span>Abrir Novo Ciclo da Campanha</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--gio-border-subtle)] tabular-nums">
                      <span className="text-[#A5B1C5]">Taxa persistida:</span>
                      <strong className="text-[#FFFFFF] font-semibold tabular-nums">
                        {activeLiveCampaign.defaultRate || settings.rate} moedas = 1 bilhete
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#A5B1C5] mb-1.5">
                Prêmio deste Sorteio LIVE
              </label>
              <input
                type="text"
                value={livePrizeInput}
                onChange={(e) => setLivePrizeInput(e.target.value)}
                placeholder={
                  liveDrawTargetMode === 'SESSION'
                    ? activeLiveSession?.prizeName || settings.prizeName || 'Prêmio Especial da LIVE'
                    : activeLiveCampaign?.prizeName || 'Prêmio Acumulado da Campanha'
                }
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs sm:text-sm text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
              />
            </div>

            <button
              type="button"
              disabled={
                isFreezingLiveSnapshot ||
                (liveDrawTargetMode === 'SESSION'
                  ? !activeLiveSession || (activeLiveSession.currentTicketCounter || 0) <= 0
                  : !activeLiveCampaign || (activeLiveCampaign.totalAccumulatedTickets || 0) <= 0)
              }
              onClick={handlePrepareLiveGiftsDraw}
              className={`w-full min-h-[48px] py-3.5 px-5 rounded-xl disabled:bg-[#111B30] disabled:text-[#A5B1C5] disabled:border disabled:border-[var(--gio-border-subtle)] disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition shadow-lg ${
                liveDrawTargetMode === 'CAMPAIGN'
                  ? 'bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold shadow-[#A6C957]/20'
                  : 'bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] shadow-[#0131CD]/25'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isFreezingLiveSnapshot
                  ? 'Congelando Snapshot SHA-256...'
                  : liveDrawTargetMode === 'CAMPAIGN'
                  ? 'Sortear Agora na Campanha Multi-LIVE'
                  : 'Sortear Agora com Bilhetes LIVE'}
              </span>
            </button>

            {((liveDrawTargetMode === 'SESSION' && (!activeLiveSession || (activeLiveSession.currentTicketCounter || 0) <= 0)) ||
              (liveDrawTargetMode === 'CAMPAIGN' && (!activeLiveCampaign || (activeLiveCampaign.totalAccumulatedTickets || 0) <= 0))) && (
              <p className="text-xs text-[#F05262] text-center">
                O botão Sortear Agora requer pelo menos 1 bilhete elegível emitido na sessão/campanha selecionada.
              </p>
            )}
          </div>

          {/* Coluna Direita: Participantes e Bilhetes Reais da Sessão Selecionada (com Busca e Exportação Oficial) */}
          <div className="lg:col-span-7 space-y-4 bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl p-5 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--gio-border-subtle)]">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-[#FFFFFF] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#A6C957]" />
                  <span>
                    {liveDrawTargetMode === 'SESSION' && activeLiveSession
                      ? `Participantes e Bilhetes da Sessão @${activeLiveSession.username}`
                      : 'Participantes e Bilhetes Contabilizados'}
                  </span>
                </h3>
                <p className="text-xs text-[#A5B1C5]">
                  Dados reais sincronizados do motor TikTok LIVE no Firestore
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedLiveDraws.length > 0 && (
                  <span className="px-2.5 py-1 rounded bg-[#080D18] border border-[#A6C957]/35 text-xs font-semibold text-[#A6C957] tabular-nums">
                    {selectedLiveDraws.length} {selectedLiveDraws.length === 1 ? 'sorteio certificado' : 'sorteios certificados'}
                  </span>
                )}
                {onExportCsv && (
                  <button
                    type="button"
                    onClick={onExportCsv}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#080D18] hover:bg-[#111B30] border border-[var(--gio-border-subtle)] text-xs font-medium text-[#FFFFFF] transition flex items-center gap-1.5 shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-[#A5B1C5]" />
                    <span>Exportar CSV</span>
                  </button>
                )}
              </div>
            </div>

            {/* Busca Oficial de Participantes e Bilhetes (Exclusiva na Arena Oficial) */}
            {setParticipantSearchQuery && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#A5B1C5] absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={participantSearchQuery}
                  onChange={(e) => setParticipantSearchQuery(e.target.value)}
                  placeholder="Buscar participante por @usuário, nome ou #bilhete..."
                  aria-label="Buscar participante na Arena Oficial"
                  className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-[#080D18] border border-[var(--gio-border-subtle)] text-xs text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                />
              </div>
            )}

            {selectedLiveParticipants.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-[var(--gio-border-subtle)] rounded-xl">
                <Gift className="w-7 h-7 text-[#A5B1C5] mx-auto" />
                <p className="text-sm font-semibold text-[#FFFFFF]">
                  {participantSearchQuery
                    ? `Nenhum participante ou bilhete encontrado para "${participantSearchQuery}"`
                    : 'Nenhum participante com presentes nesta sessão'}
                </p>
                <p className="text-xs text-[#A5B1C5] max-w-md mx-auto">
                  {participantSearchQuery
                    ? 'Tente buscar outro @usuário, apelido ou número de bilhete.'
                    : 'Assim que sua transmissão receber presentes no TikTok LIVE, os participantes e seus bilhetes aparecerão aqui automaticamente.'}
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--gio-border-subtle)] rounded-xl border border-[var(--gio-border-subtle)] bg-[#080D18]">
                {selectedLiveParticipants.map((part) => {
                  const pTickets = ticketsByParticipantMap?.get(part.tiktokUserId) || [];
                  const hasHandle =
                    part.handleAvailable !== false &&
                    part.username &&
                    part.username !== 'arroba_indisponivel';
                  const displayUser = hasHandle ? `@${part.username.replace(/^@+/, '')}` : 'Arroba indisponível';

                  return (
                    <div
                      key={part.tiktokUserId}
                      onClick={() => onInspectParticipant && onInspectParticipant(part.tiktokUserId)}
                      className={`p-3.5 flex items-center justify-between gap-3 text-xs ${
                        onInspectParticipant ? 'hover:bg-[#111B30]/80 cursor-pointer transition' : ''
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-semibold text-[#FFFFFF] truncate">
                          {displayUser}
                          {part.nickname && part.nickname !== part.username ? (
                            <span className="text-[#A5B1C5] font-normal ml-1.5">({part.nickname})</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-[#A5B1C5] tabular-nums flex flex-wrap items-center gap-2">
                          <span>Sobras acumuladas: {part.carryoverCoins || 0} moedas</span>
                          {pTickets.length > 0 && (
                            <span className="font-medium text-[#A6C957] truncate max-w-xs tabular-nums">
                              · #{pTickets.slice(0, 6).join(', #')}
                              {pTickets.length > 6 ? ` (+${pTickets.length - 6})` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 tabular-nums">
                        <span className="px-2 py-1 rounded bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] font-medium">
                          {part.coinsInSession.toLocaleString('pt-BR')} moedas
                        </span>
                        <span className="px-2.5 py-1 rounded bg-[#A6C957]/15 border border-[#A6C957]/35 text-[#A6C957] font-bold">
                          {part.ticketsInSession} bilhete(s)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bloco de Sorteios Certificados e Auditoria de Entrega */}
        {selectedLiveDraws.length > 0 && (
          <div className="p-5 sm:p-6 rounded-xl bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--gio-border-subtle)]">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-semibold text-[#FFFFFF] flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#A6C957]" />
                  <span>Sorteios Certificados e Gestão de Entrega ({selectedLiveDraws.length})</span>
                </h3>
                <p className="text-xs text-[#A5B1C5]">
                  Acompanhe o status formal de entrega de prêmios, auditoria imutável e resolução de não comparecimento.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {selectedLiveDraws.map((d) => {
                const statusMeta = getDeliveryStatusMeta(d.deliveryStatus);
                return (
                  <div
                    key={d.drawId}
                    className="p-4 rounded-xl bg-[#080D18] border border-[var(--gio-border-subtle)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--gio-border-subtle)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-[#A6C957] px-2 py-0.5 rounded bg-[#A6C957]/15 border border-[#A6C957]/35 tabular-nums">
                          Bilhete #{d.winningTicketNumber}
                        </span>
                        <span className="font-semibold text-sm text-[#FFFFFF]">
                          @{d.winnerName}
                        </span>
                        <span className="text-xs text-[#A6C957] font-medium">
                          · {d.prizeName}
                        </span>
                        {d.cycleId && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#111B30] text-[#A5B1C5] border border-[var(--gio-border-subtle)]">
                            {d.cycleId}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-semibold border ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                        <span className="text-[11px] text-[#A5B1C5] tabular-nums">
                          {new Date(d.drawnAt).toLocaleDateString('pt-BR')} às {new Date(d.drawnAt).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 font-mono text-[11px] text-[#A5B1C5] truncate max-w-xl">
                        <div>
                          Hash Roster SHA-256: <span className="text-[#FFFFFF]">{d.frozenRosterHash?.slice(0, 24)}...</span>
                        </div>
                        {d.parentDrawId && (
                          <div className="text-[#A6C957]">
                            ↳ Substituto do sorteio original: <span className="underline">{d.parentDrawId}</span>
                          </div>
                        )}
                        {d.redrawnAsDrawId && (
                          <div className="text-[#F05262]">
                            ↳ Sorteio original anulado. Substituído por: <span className="underline">{d.redrawnAsDrawId}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAuditModalDraw(d);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#A5B1C5]" />
                          <span>Ver Auditoria</span>
                        </button>

                        {d.deliveryStatus !== 'DELIVERED' && d.deliveryStatus !== 'REDRAWN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setStatusModalDraw(d);
                              setSelectedNewStatus(
                                d.deliveryStatus === 'PENDING_CONTACT'
                                  ? 'CONTACTED'
                                  : 'DELIVERED'
                              );
                              setDeliveryNotes('');
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium flex items-center gap-1.5 transition"
                          >
                            <Clock className="w-3.5 h-3.5 text-[#A5B1C5]" />
                            <span>Atualizar Entrega</span>
                          </button>
                        )}

                        {d.deliveryStatus === 'UNCLAIMED_EXPIRED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setRedrawModalDraw(d);
                              setRedrawReason('Prazo regulamentar de 48h expirou sem manifestação do ganhador original.');
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#F05262] hover:bg-[#F05262]/90 text-[#FFFFFF] text-xs font-bold flex items-center gap-1.5 transition shadow"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                            <span>Realizar Novo Sorteio</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal 1: Alterar Status de Entrega */}
      {statusModalDraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080D18]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--gio-border-subtle)]">
              <div>
                <h3 className="text-sm font-semibold text-[#FFFFFF]">
                  Atualizar Status de Entrega do Prêmio
                </h3>
                <p className="text-xs text-[#A5B1C5]">
                  Ganhador(a): @{statusModalDraw.winnerName} · Bilhete #{statusModalDraw.winningTicketNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusModalDraw(null)}
                className="text-[#A5B1C5] hover:text-[#FFFFFF] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  modalFeedback.type === 'error'
                    ? 'bg-[#F05262]/15 text-[#F05262] border border-[#F05262]/40'
                    : 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/40'
                }`}
              >
                {modalFeedback.text}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-[#FFFFFF] mb-1.5">
                  Novo Status Formal
                </label>
                <select
                  value={selectedNewStatus}
                  onChange={(e) => setSelectedNewStatus(e.target.value as DeliveryStatus)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] font-medium focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                >
                  <option value="CONTACTED">Contatado (Tentativa de contato realizada)</option>
                  <option value="DELIVERED">Prêmio Entregue (Comprovado e concluído)</option>
                  <option value="UNCLAIMED_EXPIRED">Não Reclamado / Expirado (Permite novo sorteio)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#FFFFFF] mb-1.5">
                  Canal / Método de Contato
                </label>
                <input
                  type="text"
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                  placeholder="Ex: Chat TikTok LIVE / Direct / WhatsApp / Email"
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#FFFFFF] mb-1.5">
                  Código de Rastreio / Comprovante (opcional)
                </label>
                <input
                  type="text"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="Ex: Correios BR123456789BR ou link de comprovante"
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] font-mono focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#FFFFFF] mb-1.5">
                  Observações / Justificativa da Transição
                </label>
                <textarea
                  rows={3}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Registre os detalhes deste contato ou confirmação de entrega para auditoria imutável..."
                  className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--gio-border-subtle)]">
              <button
                type="button"
                onClick={() => setStatusModalDraw(null)}
                className="px-4 py-2 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingDelivery}
                onClick={handleUpdateDeliveryStatus}
                className="px-4 py-2 rounded-lg bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isSubmittingDelivery ? 'Registrando...' : 'Confirmar e Gravar Auditoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Trilha Imutável de Auditoria de Entrega */}
      {auditModalDraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080D18]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--gio-border-subtle)]">
              <div>
                <h3 className="text-sm font-semibold text-[#FFFFFF] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#A6C957]" />
                  <span>Trilha de Auditoria Imutável de Entrega</span>
                </h3>
                <p className="text-xs text-[#A5B1C5]">
                  Sorteio #{auditModalDraw.winningTicketNumber} · Ganhador(a): @{auditModalDraw.winnerName} · {auditModalDraw.prizeName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditModalDraw(null)}
                className="text-[#A5B1C5] hover:text-[#FFFFFF] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {(!auditModalDraw.deliveryAuditTrail || auditModalDraw.deliveryAuditTrail.length === 0) ? (
                <p className="text-xs text-[#A5B1C5] py-6 text-center">
                  Nenhuma transição de status registrada até o momento. O sorteio iniciou como Pendente de Contato.
                </p>
              ) : (
                auditModalDraw.deliveryAuditTrail.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] tabular-nums">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[#A5B1C5]">#{idx + 1}</span>
                        <span className="text-[#FFFFFF] font-semibold">{entry.previousStatus}</span>
                        <ArrowRight className="w-3 h-3 text-[#A6C957]" />
                        <span className="text-[#A6C957] font-bold">{entry.newStatus}</span>
                      </div>
                      <span className="text-[#A5B1C5] tabular-nums">
                        {new Date(entry.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    {entry.reason && (
                      <p className="text-xs text-[#FFFFFF]">
                        <strong className="text-[#A5B1C5]">Justificativa:</strong> {entry.reason}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-[#A5B1C5] border-t border-[var(--gio-border-subtle)]/50">
                      <span>Operador: {entry.operatorUid}</span>
                      {entry.method && <span>Método: {entry.method}</span>}
                      {entry.referenceDrawId && (
                        <span className="text-[#A6C957]">Ref: {entry.referenceDrawId}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[var(--gio-border-subtle)] flex justify-end">
              <button
                type="button"
                onClick={() => setAuditModalDraw(null)}
                className="px-4 py-2 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Confirmação de Novo Sorteio por Não Comparecimento */}
      {redrawModalDraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#080D18]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--gio-border-subtle)]">
              <div>
                <h3 className="text-sm font-semibold text-[#FFFFFF] flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-[#F05262]" />
                  <span>Novo Sorteio por Não Comparecimento</span>
                </h3>
                <p className="text-xs text-[#A5B1C5]">
                  Substituição oficial auditada com exclusão do vencedor original
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRedrawModalDraw(null)}
                className="text-[#A5B1C5] hover:text-[#FFFFFF] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  modalFeedback.type === 'error'
                    ? 'bg-[#F05262]/15 text-[#F05262] border border-[#F05262]/40'
                    : 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/40'
                }`}
              >
                {modalFeedback.text}
              </div>
            )}

            <div className="p-3.5 rounded-lg bg-[#F05262]/15 border border-[#F05262]/40 text-xs space-y-1 text-[#FFFFFF]">
              <strong className="block text-[#F05262] font-semibold">Regras Mandatórias de Redraw:</strong>
              <p>
                1. O vencedor original <strong>@{redrawModalDraw.winnerName}</strong> (UID: {redrawModalDraw.winnerTiktokUserId}) será permanentemente excluído dos bilhetes elegíveis deste novo sorteio.
              </p>
              <p>
                2. Um novo snapshot com hash SHA-256 e semente CSPRNG independente será congelado e auditado.
              </p>
              <p>
                3. O sorteio original será marcado como <strong>REDRAWN</strong> e referenciará bilateralmente o novo sorteio substituto.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-xs font-medium text-[#FFFFFF]">
                Justificativa Formal / Motivo do Novo Sorteio *
              </label>
              <textarea
                rows={3}
                required
                value={redrawReason}
                onChange={(e) => setRedrawReason(e.target.value)}
                placeholder="Informe o motivo formal do novo sorteio (ex: não respondeu às tentativas de contato no prazo regulamentar)..."
                className="w-full px-3 py-2 rounded-lg bg-[#111B30] border border-[var(--gio-border-subtle)] text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/35"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--gio-border-subtle)]">
              <button
                type="button"
                onClick={() => setRedrawModalDraw(null)}
                className="px-4 py-2 rounded-lg bg-[#111B30] hover:bg-[#080D18] text-[#FFFFFF] border border-[var(--gio-border-subtle)] text-xs font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingRedraw}
                onClick={handleExecuteRedraw}
                className="px-4 py-2 rounded-lg bg-[#F05262] hover:bg-[#F05262]/90 text-[#FFFFFF] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isSubmittingRedraw ? 'Executando Sorteio CSPRNG...' : 'Executar Novo Sorteio Certificado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
