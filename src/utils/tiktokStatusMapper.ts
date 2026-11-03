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
        badgeClass: 'bg-[#6EAA90]/15 text-[#6EAA90] border-[#6EAA90]/40',
        dotClass: 'bg-[#6EAA90] animate-pulse',
        titleHint: `TikTok LIVE conectada${cleanHandle ? ` (${cleanHandle})` : ''}`,
      };
    case 'CONNECTING':
      return {
        state: 'CONNECTING',
        label: 'Conectando',
        badgeClass: 'bg-[#C6A56A]/15 text-[#C6A56A] border-[#C6A56A]/40',
        dotClass: 'bg-[#C6A56A] animate-pulse',
        titleHint: 'Conectando à transmissão TikTok LIVE',
      };
    case 'RECONNECTING':
      return {
        state: 'RECONNECTING',
        label: 'Aguardando LIVE / Reconectando',
        badgeClass: 'bg-[#C6A56A]/15 text-[#C6A56A] border-[#C6A56A]/40',
        dotClass: 'bg-[#C6A56A] animate-pulse',
        titleHint: 'Aguardando início da LIVE ou reconectando automaticamente',
      };
    case 'ERROR':
      return {
        state: 'ERROR',
        label: 'Erro na conexão',
        badgeClass: 'bg-[#D96B6B]/15 text-[#D96B6B] border-[#D96B6B]/40',
        dotClass: 'bg-[#D96B6B]',
        titleHint: 'Erro na conexão com TikTok LIVE',
      };
    case 'DISCONNECTED':
    default:
      return {
        state: 'DISCONNECTED',
        label: 'Desconectado',
        badgeClass: 'bg-[#171D1C] text-[#9BA8A3] border-[#313D39]',
        dotClass: 'bg-[#9BA8A3]/60',
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
      badgeClass: 'bg-[#C6A56A]/15 text-[#C6A56A] border-[#C6A56A]/40',
      dotClass: 'bg-[#C6A56A]',
    };
  }

  if (normalized === 'ended') {
    return {
      status: 'ended',
      label: 'Ingressão de presentes encerrada',
      badgeClass: 'bg-[#D96B6B]/15 text-[#D96B6B] border-[#D96B6B]/40',
      dotClass: 'bg-[#D96B6B]',
    };
  }

  return {
    status: 'active',
    label: 'Ingressão de presentes aberta',
    badgeClass: 'bg-[#6EAA90]/15 text-[#6EAA90] border-[#6EAA90]/40',
    dotClass: 'bg-[#6EAA90]',
  };
}
