import React from 'react';
import {
  Radio,
  RefreshCw,
  Play,
  Users,
  Gift,
} from 'lucide-react';
import {
  TikTokLiveSession,
  TikTokLiveParticipant,
  LiveDrawRecord,
  Campaign,
  RaffleSettings,
} from '../types.js';

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
}) => {
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
                  <div className="p-3 rounded-lg bg-[#222B28] border border-[#313D39] flex items-center justify-between text-xs tabular-nums">
                    <span className="text-[#9BA8A3]">Taxa persistida na campanha:</span>
                    <strong className="text-[#EAE7DE] font-mono">
                      {activeLiveCampaign.defaultRate || settings.rate} moedas = 1 bilhete
                    </strong>
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
      </div>
    </div>
  );
};
