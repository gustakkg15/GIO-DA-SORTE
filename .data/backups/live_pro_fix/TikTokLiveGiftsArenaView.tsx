import React, { useState } from 'react';
import {
  Radio,
  RefreshCw,
  Play,
  Users,
  Gift,
  Trophy,
  History,
  AlertTriangle,
  RotateCw,
  Clock,
  ArrowRight,
  X,
  FileText,
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

  const getDeliveryStatusMeta = (status?: DeliveryStatus) => {
    switch (status) {
      case 'DELIVERED':
        return { label: 'Prêmio Entregue', badgeClass: 'bg-[#6EAA90]/20 text-[#6EAA90] border-[#6EAA90]/40' };
      case 'CONTACTED':
        return { label: 'Contatado', badgeClass: 'bg-[#60A5FA]/20 text-[#60A5FA] border-[#60A5FA]/40' };
      case 'UNCLAIMED_EXPIRED':
        return { label: 'Não Reclamado / Expirado', badgeClass: 'bg-[#D96B6B]/20 text-[#D96B6B] border-[#D96B6B]/40' };
      case 'REDRAWN':
        return { label: 'Resorteado (Substituído)', badgeClass: 'bg-[#C084FC]/20 text-[#C084FC] border-[#C084FC]/40' };
      case 'PENDING_CONTACT':
      default:
        return { label: 'Pendente Contato', badgeClass: 'bg-[#C6A56A]/20 text-[#C6A56A] border-[#C6A56A]/40' };
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
      alert(`Não foi possível avançar o ciclo: ${(err as Error).message}`);
    } finally {
      setIsAdvancingCycle(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="p-5 sm:p-6 rounded-xl bg-[#222B28] border border-[#313D39] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#313D39]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#171D1C] border border-[#313D39] text-[#C6A56A]">
                <Radio className="w-3.5 h-3.5 text-[#6EAA90]" />
                <span>Motor Oficial TikTok LIVE</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                  liveConnectionState === 'CONNECTED'
                    ? 'bg-[#6EAA90]/20 text-[#6EAA90] border border-[#6EAA90]/40'
                    : 'bg-[#171D1C] text-[#9BA8A3] border border-[#313D39]'
                }`}
              >
                {liveConnectionState === 'CONNECTED'
                  ? `Transmissão Conectada (${liveConnectedUsername ? `@${liveConnectedUsername.replace(/^@/, '')}` : 'Ativa'})`
                  : 'Transmissão Desconectada'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-[#EAE7DE]">
              Sorteio por Presentes LIVE
            </h2>
            <p className="text-xs text-[#9BA8A3]">
              Selecione abaixo uma sessão real da sua transmissão ou uma campanha acumulada para realizar o sorteio com snapshot SHA-256 certificado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refreshPlatformStatus()}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-medium flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#6EAA90] ${isLoadingLiveDetails ? 'animate-spin' : ''}`} />
              <span>Atualizar Sessões</span>
            </button>
            {onOpenManageConnection && (
              <button
                type="button"
                onClick={onOpenManageConnection}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Radio className="w-3.5 h-3.5 text-[#C6A56A]" />
                <span>Gerenciar Conexão TikTok LIVE</span>
              </button>
            )}
          </div>
        </div>

        {liveDrawFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium ${
              liveDrawFeedback.type === 'error'
                ? 'bg-[#D96B6B]/10 border-[#D96B6B]/40 text-[#D96B6B]'
                : 'bg-[#6EAA90]/15 border-[#6EAA90]/40 text-[#6EAA90]'
            }`}
          >
            {liveDrawFeedback.text}
          </div>
        )}

        {/* Seletor de Origem Real: Sessão Individual vs Campanha Acumulada */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Configuração e Botão Sortear Agora */}
          <div className="lg:col-span-5 space-y-4 bg-[#171D1C] border border-[#313D39] rounded-xl p-5">
            <div className="flex items-center bg-[#222B28] p-1 rounded-lg border border-[#313D39]">
              <button
                type="button"
                onClick={() => setLiveDrawTargetMode('SESSION')}
                className={`flex-1 min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  liveDrawTargetMode === 'SESSION'
                    ? 'bg-[#6EAA90] text-[#171D1C]'
                    : 'text-[#9BA8A3] hover:text-[#EAE7DE]'
                }`}
              >
                Sessão da LIVE ({liveSessionsSummary.length})
              </button>
              <button
                type="button"
                onClick={() => setLiveDrawTargetMode('CAMPAIGN')}
                className={`flex-1 min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  liveDrawTargetMode === 'CAMPAIGN'
                    ? 'bg-[#6EAA90] text-[#171D1C]'
                    : 'text-[#9BA8A3] hover:text-[#EAE7DE]'
                }`}
              >
                Campanha Multi-LIVE ({liveCampaigns.length})
              </button>
            </div>

            {liveDrawTargetMode === 'SESSION' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#9BA8A3] mb-1.5">
                    Sessão LIVE Real
                  </label>
                  {liveSessionsSummary.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#9BA8A3]">
                      Nenhuma sessão registrada ainda. Conecte uma transmissão na aba TikTok LIVE para contabilizar presentes e bilhetes.
                    </div>
                  ) : (
                    <select
                      value={activeLiveSession?.sessionId || ''}
                      onChange={(e) => setSelectedLiveSessionId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs sm:text-sm text-[#EAE7DE] focus:border-[#6EAA90] focus:outline-none"
                    >
                      {liveSessionsSummary.map((sess) => (
                        <option key={sess.sessionId} value={sess.sessionId}>
                          @{sess.username} · {sess.raffleTitle || sess.roomTitle || 'Sessão LIVE'} ({sess.currentTicketCounter || 0} bilhetes · {sess.currentRate} moedas/bil.)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {activeLiveSession && (
                  <div className="grid grid-cols-3 gap-2.5 text-center tabular-nums">
                    <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                      <span className="text-[11px] text-[#9BA8A3] block">Participantes</span>
                      <strong className="text-base font-mono text-[#EAE7DE]">
                        {activeLiveSession.uniqueSupportersCount || 0}
                      </strong>
                    </div>
                    <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                      <span className="text-[11px] text-[#9BA8A3] block">Moedas LIVE</span>
                      <strong className="text-base font-mono text-[#C6A56A]">
                        {activeLiveSession.totalCoins || 0}
                      </strong>
                    </div>
                    <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                      <span className="text-[11px] text-[#9BA8A3] block">Bilhetes Reais</span>
                      <strong className="text-base font-mono text-[#6EAA90]">
                        {activeLiveSession.currentTicketCounter || 0}
                      </strong>
                    </div>
                  </div>
                )}

                {activeLiveSession && (
                  <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-between text-xs tabular-nums">
                    <span className="text-[#9BA8A3]">Taxa persistida na sessão:</span>
                    <strong className="text-[#EAE7DE] font-mono">
                      {activeLiveSession.currentRate} moedas = 1 bilhete
                    </strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#9BA8A3] mb-1.5">
                    Campanha Acumulada Real
                  </label>
                  {liveCampaigns.length === 0 ? (
                    <div className="p-3.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs text-[#9BA8A3]">
                      Nenhuma campanha acumulada encontrada. Crie ou vincule sessões no módulo TikTok LIVE.
                    </div>
                  ) : (
                    <select
                      value={activeLiveCampaign?.campaignId || ''}
                      onChange={(e) => setSelectedCampaignId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs sm:text-sm text-[#EAE7DE] focus:border-[#6EAA90] focus:outline-none"
                    >
                      {liveCampaigns.map((camp) => (
                        <option key={camp.campaignId} value={camp.campaignId}>
                          {camp.title} ({camp.totalAccumulatedTickets || 0} bilhetes · {camp.defaultRate || settings.rate} moedas/bil.)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {activeLiveCampaign && (
                  <div className="grid grid-cols-3 gap-2.5 text-center tabular-nums">
                    <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                      <span className="text-[11px] text-[#9BA8A3] block">LIVEs</span>
                      <strong className="text-base font-mono text-[#EAE7DE]">
                        {activeLiveCampaign.participatingSessionIds?.length || 0}
                      </strong>
                    </div>
                    <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                      <span className="text-[11px] text-[#9BA8A3] block">Status</span>
                      <strong className="text-sm font-mono text-[#C6A56A]">
                        {activeLiveCampaign.status}
                      </strong>
                    </div>
                    <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39]">
                      <span className="text-[11px] text-[#9BA8A3] block">Bilhetes</span>
                      <strong className="text-base font-mono text-[#6EAA90]">
                        {activeLiveCampaign.totalAccumulatedTickets || 0}
                      </strong>
                    </div>
                  </div>
                )}

                {activeLiveCampaign && (
                  <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#9BA8A3]">Modalidade:</span>
                      <span className="font-mono text-[#EAE7DE] font-semibold">
                        {activeLiveCampaign.campaignMode === 'RECURRING_CUMULATIVE'
                          ? 'Recorrente Acumulativa'
                          : activeLiveCampaign.campaignMode === 'RECURRING_RESET'
                          ? 'Recorrente com Reset'
                          : 'Sorteio Único'}
                      </span>
                    </div>

                    {(activeLiveCampaign.campaignMode === 'RECURRING_RESET' ||
                      activeLiveCampaign.campaignMode === 'RECURRING_CUMULATIVE') && (
                      <div className="flex items-center justify-between pt-1 border-t border-[#313D39]">
                        <span className="text-[#9BA8A3]">Ciclo Atual:</span>
                        <span className="px-2 py-0.5 rounded bg-[#171D1C] border border-[#6EAA90]/40 text-[#6EAA90] font-mono font-bold">
                          Ciclo #{activeLiveCampaign.currentCycleIndex || 1}
                        </span>
                      </div>
                    )}

                    {(activeLiveCampaign.campaignMode === 'RECURRING_RESET' ||
                      activeLiveCampaign.campaignMode === 'RECURRING_CUMULATIVE') && (
                      <div className="pt-2">
                        {Boolean(activeLiveCampaign.pendingDeliveryCount && activeLiveCampaign.pendingDeliveryCount > 0) ? (
                          <div className="p-2.5 rounded bg-[#D96B6B]/15 border border-[#D96B6B]/40 text-[11px] text-[#D96B6B] space-y-1">
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
                            className="w-full py-1.5 px-3 rounded-lg bg-[#2B3632] hover:bg-[#313D39] border border-[#313D39] text-xs font-semibold text-[#6EAA90] flex items-center justify-center gap-1.5 transition"
                          >
                            <RotateCw className={`w-3.5 h-3.5 ${isAdvancingCycle ? 'animate-spin' : ''}`} />
                            <span>Abrir Novo Ciclo da Campanha</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-[#313D39]">
                      <span className="text-[#9BA8A3]">Taxa persistida:</span>
                      <strong className="text-[#EAE7DE] font-mono">
                        {activeLiveCampaign.defaultRate || settings.rate} moedas = 1 bilhete
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#9BA8A3] mb-1.5">
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
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#222B28] border border-[#313D39] text-xs sm:text-sm text-[#EAE7DE] focus:border-[#6EAA90] focus:outline-none"
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
              className="w-full min-h-[48px] py-3.5 px-5 rounded-xl bg-[#6EAA90] hover:bg-[#5E9980] disabled:bg-[#2B3632] disabled:text-[#9BA8A3] disabled:border disabled:border-[#313D39] disabled:opacity-60 disabled:cursor-not-allowed text-[#171D1C] font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                {isFreezingLiveSnapshot
                  ? 'Congelando Snapshot SHA-256...'
                  : 'Sortear Agora com Bilhetes LIVE'}
              </span>
            </button>

            {((liveDrawTargetMode === 'SESSION' && (!activeLiveSession || (activeLiveSession.currentTicketCounter || 0) <= 0)) ||
              (liveDrawTargetMode === 'CAMPAIGN' && (!activeLiveCampaign || (activeLiveCampaign.totalAccumulatedTickets || 0) <= 0))) && (
              <p className="text-xs text-[#D96B6B] text-center">
                O botão Sortear Agora requer pelo menos 1 bilhete elegível emitido na sessão/campanha selecionada.
              </p>
            )}
          </div>

          {/* Coluna Direita: Participantes e Bilhetes Reais da Sessão Selecionada */}
          <div className="lg:col-span-7 space-y-4 bg-[#171D1C] border border-[#313D39] rounded-xl p-5 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#313D39]">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-[#EAE7DE] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#6EAA90]" />
                  <span>
                    {liveDrawTargetMode === 'SESSION' && activeLiveSession
                      ? `Participantes e Bilhetes da Sessão @${activeLiveSession.username}`
                      : 'Participantes e Bilhetes Contabilizados'}
                  </span>
                </h3>
                <p className="text-xs text-[#9BA8A3]">
                  Dados reais sincronizados do motor TikTok LIVE no Firestore
                </p>
              </div>

              {selectedLiveDraws.length > 0 && (
                <span className="px-2.5 py-1 rounded bg-[#222B28] border border-[#C6A56A]/40 text-xs font-mono text-[#C6A56A] tabular-nums">
                  {selectedLiveDraws.length} {selectedLiveDraws.length === 1 ? 'sorteio certificado' : 'sorteios certificados'}
                </span>
              )}
            </div>

            {selectedLiveParticipants.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-[#313D39] rounded-xl">
                <Gift className="w-7 h-7 text-[#9BA8A3] mx-auto" />
                <p className="text-sm font-semibold text-[#EAE7DE]">
                  Nenhum participante com presentes nesta sessão
                </p>
                <p className="text-xs text-[#9BA8A3] max-w-md mx-auto">
                  Assim que sua transmissão receber presentes no TikTok LIVE, os participantes e seus bilhetes aparecerão aqui automaticamente.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-[#313D39] rounded-xl border border-[#313D39] bg-[#222B28]">
                {selectedLiveParticipants.map((part) => (
                  <div
                    key={part.tiktokUserId}
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#EAE7DE] truncate">
                        @{part.username}
                        {part.nickname && part.nickname !== part.username ? (
                          <span className="text-[#9BA8A3] font-normal ml-1.5">({part.nickname})</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-[#9BA8A3] tabular-nums">
                        Sobras acumuladas: {part.carryoverCoins || 0} moedas
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                      <span className="px-2 py-1 rounded bg-[#171D1C] border border-[#313D39] text-[#C6A56A]">
                        {part.coinsInSession} moedas
                      </span>
                      <span className="px-2.5 py-1 rounded bg-[#6EAA90]/15 border border-[#6EAA90]/40 text-[#6EAA90] font-bold">
                        {part.ticketsInSession} bilhete(s)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bloco de Sorteios Certificados e Auditoria de Entrega */}
        {selectedLiveDraws.length > 0 && (
          <div className="p-5 sm:p-6 rounded-xl bg-[#222B28] border border-[#313D39] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#313D39]">
              <div className="space-y-0.5">
                <h3 className="text-sm sm:text-base font-semibold text-[#EAE7DE] flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#C6A56A]" />
                  <span>Sorteios Certificados e Gestão de Entrega ({selectedLiveDraws.length})</span>
                </h3>
                <p className="text-xs text-[#9BA8A3]">
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
                    className="p-4 rounded-xl bg-[#171D1C] border border-[#313D39] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#313D39]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#6EAA90] px-2 py-0.5 rounded bg-[#6EAA90]/15 border border-[#6EAA90]/40">
                          Bilhete #{d.winningTicketNumber}
                        </span>
                        <span className="font-semibold text-sm text-[#EAE7DE]">
                          @{d.winnerName}
                        </span>
                        <span className="text-xs text-[#C6A56A] font-medium">
                          · {d.prizeName}
                        </span>
                        {d.cycleId && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#222B28] text-[#9BA8A3] border border-[#313D39]">
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
                        <span className="text-[11px] font-mono text-[#9BA8A3]">
                          {new Date(d.drawnAt).toLocaleDateString('pt-BR')} às {new Date(d.drawnAt).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="space-y-1 font-mono text-[11px] text-[#9BA8A3] truncate max-w-xl">
                        <div>
                          Hash Roster SHA-256: <span className="text-[#EAE7DE]">{d.frozenRosterHash?.slice(0, 24)}...</span>
                        </div>
                        {d.parentDrawId && (
                          <div className="text-[#C084FC]">
                            ↳ Substituto do sorteio original: <span className="underline">{d.parentDrawId}</span>
                          </div>
                        )}
                        {d.redrawnAsDrawId && (
                          <div className="text-[#D96B6B]">
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
                          className="px-2.5 py-1.5 rounded-lg bg-[#222B28] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-medium flex items-center gap-1.5 transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#6EAA90]" />
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
                            className="px-2.5 py-1.5 rounded-lg bg-[#2B3632] hover:bg-[#313D39] text-[#EAE7DE] border border-[#313D39] text-xs font-medium flex items-center gap-1.5 transition"
                          >
                            <Clock className="w-3.5 h-3.5 text-[#C6A56A]" />
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
                            className="px-3 py-1.5 rounded-lg bg-[#D96B6B] hover:bg-[#C25858] text-[#171D1C] text-xs font-bold flex items-center gap-1.5 transition shadow"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171D1C]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#222B28] border border-[#313D39] rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#313D39]">
              <div>
                <h3 className="text-sm font-semibold text-[#EAE7DE]">
                  Atualizar Status de Entrega do Prêmio
                </h3>
                <p className="text-xs text-[#9BA8A3]">
                  Ganhador(a): @{statusModalDraw.winnerName} · Bilhete #{statusModalDraw.winningTicketNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusModalDraw(null)}
                className="text-[#9BA8A3] hover:text-[#EAE7DE] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  modalFeedback.type === 'error'
                    ? 'bg-[#D96B6B]/15 text-[#D96B6B] border border-[#D96B6B]/40'
                    : 'bg-[#6EAA90]/15 text-[#6EAA90] border border-[#6EAA90]/40'
                }`}
              >
                {modalFeedback.text}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-[#EAE7DE] mb-1.5">
                  Novo Status Formal
                </label>
                <select
                  value={selectedNewStatus}
                  onChange={(e) => setSelectedNewStatus(e.target.value as DeliveryStatus)}
                  className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] font-medium focus:outline-none focus:border-[#6EAA90]"
                >
                  <option value="CONTACTED">Contatado (Tentativa de contato realizada)</option>
                  <option value="DELIVERED">Prêmio Entregue (Comprovado e concluído)</option>
                  <option value="UNCLAIMED_EXPIRED">Não Reclamado / Expirado (Permite novo sorteio)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#EAE7DE] mb-1.5">
                  Canal / Método de Contato
                </label>
                <input
                  type="text"
                  value={contactMethod}
                  onChange={(e) => setContactMethod(e.target.value)}
                  placeholder="Ex: Chat TikTok LIVE / Direct / WhatsApp / Email"
                  className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#EAE7DE] mb-1.5">
                  Código de Rastreio / Comprovante (opcional)
                </label>
                <input
                  type="text"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="Ex: Correios BR123456789BR ou link de comprovante"
                  className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] font-mono focus:outline-none focus:border-[#6EAA90]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#EAE7DE] mb-1.5">
                  Observações / Justificativa da Transição
                </label>
                <textarea
                  rows={3}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Registre os detalhes deste contato ou confirmação de entrega para auditoria imutável..."
                  className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#313D39]">
              <button
                type="button"
                onClick={() => setStatusModalDraw(null)}
                className="px-4 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingDelivery}
                onClick={handleUpdateDeliveryStatus}
                className="px-4 py-2 rounded-lg bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isSubmittingDelivery ? 'Registrando...' : 'Confirmar e Gravar Auditoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Trilha Imutável de Auditoria de Entrega */}
      {auditModalDraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171D1C]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#222B28] border border-[#313D39] rounded-xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#313D39]">
              <div>
                <h3 className="text-sm font-semibold text-[#EAE7DE] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#6EAA90]" />
                  <span>Trilha de Auditoria Imutável de Entrega</span>
                </h3>
                <p className="text-xs text-[#9BA8A3]">
                  Sorteio #{auditModalDraw.winningTicketNumber} · Ganhador(a): @{auditModalDraw.winnerName} · {auditModalDraw.prizeName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditModalDraw(null)}
                className="text-[#9BA8A3] hover:text-[#EAE7DE] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {(!auditModalDraw.deliveryAuditTrail || auditModalDraw.deliveryAuditTrail.length === 0) ? (
                <p className="text-xs text-[#9BA8A3] py-6 text-center">
                  Nenhuma transição de status registrada até o momento. O sorteio iniciou como Pendente de Contato.
                </p>
              ) : (
                auditModalDraw.deliveryAuditTrail.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-[#171D1C] border border-[#313D39] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-[#9BA8A3]">#{idx + 1}</span>
                        <span className="text-[#EAE7DE] font-semibold">{entry.previousStatus}</span>
                        <ArrowRight className="w-3 h-3 text-[#6EAA90]" />
                        <span className="text-[#6EAA90] font-bold">{entry.newStatus}</span>
                      </div>
                      <span className="text-[#9BA8A3] font-mono">
                        {new Date(entry.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    {entry.reason && (
                      <p className="text-xs text-[#EAE7DE]">
                        <strong className="text-[#9BA8A3]">Justificativa:</strong> {entry.reason}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-[#9BA8A3] border-t border-[#313D39]/50">
                      <span>Operador: {entry.operatorUid}</span>
                      {entry.method && <span>Método: {entry.method}</span>}
                      {entry.referenceDrawId && (
                        <span className="text-[#C6A56A]">Ref: {entry.referenceDrawId}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#313D39] flex justify-end">
              <button
                type="button"
                onClick={() => setAuditModalDraw(null)}
                className="px-4 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-medium transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Confirmação de Novo Sorteio por Não Comparecimento */}
      {redrawModalDraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171D1C]/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#222B28] border border-[#313D39] rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#313D39]">
              <div>
                <h3 className="text-sm font-semibold text-[#EAE7DE] flex items-center gap-2">
                  <RotateCw className="w-4 h-4 text-[#D96B6B]" />
                  <span>Novo Sorteio por Não Comparecimento</span>
                </h3>
                <p className="text-xs text-[#9BA8A3]">
                  Substituição oficial auditada com exclusão do vencedor original
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRedrawModalDraw(null)}
                className="text-[#9BA8A3] hover:text-[#EAE7DE] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalFeedback && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  modalFeedback.type === 'error'
                    ? 'bg-[#D96B6B]/15 text-[#D96B6B] border border-[#D96B6B]/40'
                    : 'bg-[#6EAA90]/15 text-[#6EAA90] border border-[#6EAA90]/40'
                }`}
              >
                {modalFeedback.text}
              </div>
            )}

            <div className="p-3.5 rounded-lg bg-[#D96B6B]/15 border border-[#D96B6B]/40 text-xs space-y-1 text-[#EAE7DE]">
              <strong className="block text-[#D96B6B] font-semibold">Regras Mandatórias de Redraw:</strong>
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
              <label className="block text-xs font-medium text-[#EAE7DE]">
                Justificativa Formal / Motivo do Novo Sorteio *
              </label>
              <textarea
                rows={3}
                required
                value={redrawReason}
                onChange={(e) => setRedrawReason(e.target.value)}
                placeholder="Informe o motivo formal do novo sorteio (ex: não respondeu às tentativas de contato no prazo regulamentar)..."
                className="w-full px-3 py-2 rounded-lg bg-[#171D1C] border border-[#313D39] text-[#EAE7DE] focus:outline-none focus:border-[#6EAA90]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#313D39]">
              <button
                type="button"
                onClick={() => setRedrawModalDraw(null)}
                className="px-4 py-2 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] text-xs font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingRedraw}
                onClick={handleExecuteRedraw}
                className="px-4 py-2 rounded-lg bg-[#D96B6B] hover:bg-[#C25858] text-[#171D1C] text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
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
