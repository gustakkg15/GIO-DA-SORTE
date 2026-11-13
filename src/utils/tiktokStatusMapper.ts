import { TikTokConnectionState } from '../types.js';

export interface MappedTikTokConnectionState {
  state: TikTokConnectionState;
  label: string;
  badgeClass: string;
  dotClass: string;
  titleHint: string;
}

export interface MappedLiveSessionCommercialStatus {
  status: 'active' | 'paused' | 'ended';
  label: string;
  badgeClass: string;
  dotClass: string;
}

/**
 * Official mapping function for TikTokConnectionState across AppHeader,
 * TikTokLiveManager, and TikTokLiveGiftsArenaView.
 * Never collapses ERROR, CONNECTING, or RECONNECTING into a generic "Desconectado".
 */
export function mapTikTokConnectionState(
  rawState?: TikTokConnectionState | string | null,
  fallbackConnected?: boolean,
  username?: string | null
): MappedTikTokConnectionState {
  const normalized = String(rawState || '')
    .trim()
    .toUpperCase();

  const resolvedState: TikTokConnectionState =
    normalized === 'CONNECTED' ||
    normalized === 'CONNECTING' ||
    normalized === 'RECONNECTING' ||
    normalized === 'ERROR' ||
    normalized === 'DISCONNECTED'
      ? (normalized as TikTokConnectionState)
      : fallbackConnected
      ? 'CONNECTED'
      : 'DISCONNECTED';

  const cleanHandle = username ? `@${String(username).trim().replace(/^@+/, '')}` : '';

  switch (resolvedState) {
    case 'CONNECTED':
      return {
        state: 'CONNECTED',
        label: 'Conectado',
        badgeClass: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/40',
        dotClass: 'bg-[#A6C957] animate-pulse',
        titleHint: `TikTok LIVE conectada${cleanHandle ? ` (${cleanHandle})` : ''}`,
      };
    case 'CONNECTING':
      return {
        state: 'CONNECTING',
        label: 'Conectando',
        badgeClass: 'bg-[#0131CD]/25 text-[#FFFFFF] border-[#0131CD]/50',
        dotClass: 'bg-[#A6C957] animate-pulse',
        titleHint: 'Conectando à transmissão TikTok LIVE',
      };
    case 'RECONNECTING':
      return {
        state: 'RECONNECTING',
        label: 'Aguardando LIVE / Reconectando',
        badgeClass: 'bg-[#0131CD]/25 text-[#FFFFFF] border-[#0131CD]/50',
        dotClass: 'bg-[#A6C957] animate-pulse',
        titleHint: 'Aguardando início da LIVE ou reconectando automaticamente',
      };
    case 'ERROR':
      return {
        state: 'ERROR',
        label: 'Erro na conexão',
        badgeClass: 'bg-[#F05262]/15 text-[#F05262] border-[#F05262]/40',
        dotClass: 'bg-[#F05262]',
        titleHint: 'Erro na conexão com TikTok LIVE',
      };
    case 'DISCONNECTED':
    default:
      return {
        state: 'DISCONNECTED',
        label: 'Desconectado',
        badgeClass: 'bg-[#111B30] text-[#A5B1C5] border-[#A5B1C5]/20',
        dotClass: 'bg-[#A5B1C5]/60',
        titleHint: 'TikTok LIVE desconectada',
      };
  }
}

/**
 * Official mapping function for the commercial session state (gift ingestion),
 * visually and semantically separated from the Webcast network connection state.
 */
export function mapLiveSessionCommercialStatus(
  rawStatus?: 'active' | 'paused' | 'ended' | string | null
): MappedLiveSessionCommercialStatus {
  const normalized = String(rawStatus || 'active')
    .trim()
    .toLowerCase();

  if (normalized === 'paused') {
    return {
      status: 'paused',
      label: 'Ingressão de presentes pausada',
      badgeClass: 'bg-[#0131CD]/25 text-[#FFFFFF] border-[#0131CD]/50',
      dotClass: 'bg-[#FFFFFF]',
    };
  }

  if (normalized === 'ended') {
    return {
      status: 'ended',
      label: 'Ingressão de presentes encerrada',
      badgeClass: 'bg-[#F05262]/15 text-[#F05262] border-[#F05262]/40',
      dotClass: 'bg-[#F05262]',
    };
  }

  return {
    status: 'active',
    label: 'Ingressão de presentes aberta',
    badgeClass: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/40',
    dotClass: 'bg-[#A6C957]',
  };
}
