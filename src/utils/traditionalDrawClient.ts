import type {
  Participant,
  PrizeTier,
  RaffleSettings,
  TraditionalDrawProofV2,
  Winner,
} from '../types';
import { safeApiJson, type SafeJsonResponse } from './apiConfig';

export interface AuthoritativeDrawResultPayload {
  winningTicket: {
    number: number;
    participantId: string;
    name: string;
  };
  winner: Winner;
  proof?: TraditionalDrawProofV2;
  updatedWinners?: Winner[];
  updatedSettings?: Pick<RaffleSettings, 'currentPrize' | 'prizes'>;
}

export interface DrawPreflightResult {
  canProceed: boolean;
  code: 'OK' | 'ALREADY_DRAWING' | 'NO_ELIGIBLE_TICKETS' | 'UNAUTHENTICATED';
  errorMessage: string | null;
}

/**
 * Validates all prerequisites BEFORE launching a countdown or network draw call.
 * Prevents the UX trap of running a 10s countdown only to fail with 401 afterward.
 */
export function validateDrawPreflight(params: {
  isAuthenticated: boolean;
  isDrawing: boolean;
  isCountdownActive: boolean;
  eligibleTicketsCount: number;
}): DrawPreflightResult {
  if (params.isDrawing || params.isCountdownActive) {
    return {
      canProceed: false,
      code: 'ALREADY_DRAWING',
      errorMessage: null,
    };
  }

  if (params.eligibleTicketsCount <= 0) {
    return {
      canProceed: false,
      code: 'NO_ELIGIBLE_TICKETS',
      errorMessage:
        'Não há bilhetes elegíveis para sortear. Adicione participantes com moedas suficientes ou verifique a regra de não repetir ganhadores.',
    };
  }

  if (!params.isAuthenticated) {
    return {
      canProceed: false,
      code: 'UNAUTHENTICATED',
      errorMessage:
        'Conecte sua conta antes de sortear. A extração oficial usa criptografia Provably Fair V2 auditada no servidor.',
    };
  }

  return {
    canProceed: true,
    code: 'OK',
    errorMessage: null,
  };
}

/**
 * Resolves the active prize tier and display label consistently across DrawSection,
 * FortuneWheel, TicketDisplay, and backend POST /api/raffle/draw payloads.
 */
export function resolveActivePrizeContext(settings: RaffleSettings): {
  prizeId: string;
  prizeName: string;
  rankedTier: PrizeTier | null;
} {
  const prizes = Array.isArray(settings.prizes) ? settings.prizes : [];
  const nextRankedTier = [...prizes]
    .sort((a, b) => a.rank - b.rank)
    .find((p) => !p.winnerId);

  if (nextRankedTier) {
    return {
      prizeId: nextRankedTier.id,
      prizeName: nextRankedTier.name,
      rankedTier: nextRankedTier,
    };
  }

  return {
    prizeId: 'NONE',
    prizeName: settings.prizeName || settings.currentPrize || 'Prêmio Principal',
    rankedTier: null,
  };
}

/**
 * Merges a newly drawn authoritative winner into the session winners list without duplication.
 */
export function mergeWinnerList(prevWinners: Winner[], newWinner: Winner): Winner[] {
  const filtered = prevWinners.filter((w) => {
    if (w.id === newWinner.id) return false;
    if (newWinner.drawId && w.drawId && w.drawId === newWinner.drawId) return false;
    return true;
  });
  return [newWinner, ...filtered];
}

/**
 * Applies the backend draw outcome deterministically onto frontend settings & winners.
 */
export function applyAuthoritativeDrawOutcome(params: {
  prevSettings: RaffleSettings;
  prevWinners: Winner[];
  outcome: AuthoritativeDrawResultPayload;
}): {
  winners: Winner[];
  settings: RaffleSettings;
} {
  const { prevSettings, prevWinners, outcome } = params;

  const winners =
    Array.isArray(outcome.updatedWinners) && outcome.updatedWinners.length > 0
      ? outcome.updatedWinners
      : mergeWinnerList(prevWinners, outcome.winner);

  const settings: RaffleSettings = outcome.updatedSettings
    ? {
        ...prevSettings,
        currentPrize: outcome.updatedSettings.currentPrize ?? prevSettings.currentPrize,
        prizes: Array.isArray(outcome.updatedSettings.prizes)
          ? outcome.updatedSettings.prizes
          : prevSettings.prizes,
      }
    : prevSettings;

  return { winners, settings };
}

/**
 * Generates 256-bit client entropy (`E_client`) formatted as 64 lowercase hex characters.
 */
export function generateClientEntropyHex(): { clientEntropy: string; randomSuffix: string } {
  const cryptoObj =
    typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : undefined;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('WebCrypto CSPRNG indisponível neste navegador para gerar entropia do cliente.');
  }
  const entropyBytes = new Uint8Array(32);
  cryptoObj.getRandomValues(entropyBytes);
  const clientEntropy = Array.from(entropyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const randomSuffix = Array.from(entropyBytes.slice(0, 6))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { clientEntropy, randomSuffix };
}

export type ApiJsonCaller = <T = any>(
  endpointPath: string,
  init?: RequestInit
) => Promise<SafeJsonResponse<T>>;

/**
 * Executes the strict two-phase Provably Fair V2 authoritative draw against the backend:
 * 1) POST /api/raffle/draw/pre-commit (bootstrapping /api/raffle/sync only on 404 JSON)
 * 2) Generate 256-bit client entropy via WebCrypto CSPRNG
 * 3) POST /api/raffle/draw with fencingToken, expectedRosterVersion, expectedDrawSequence, prizeId & prizeName
 *
 * NEVER falls back to client-side random selection on any failure.
 */
export async function executeAuthoritativeTraditionalDrawFlow(params: {
  idToken: string;
  refreshIdToken?: () => Promise<string>;
  mode: 'drum' | 'wheel';
  settings: RaffleSettings;
  participants: Participant[];
  raffleId?: string;
  apiCall?: ApiJsonCaller;
}): Promise<AuthoritativeDrawResultPayload> {
  const apiCall = params.apiCall || safeApiJson;
  const raffleId = params.raffleId || 'default';

  if (!params.idToken) {
    throw new Error('Autenticação necessária para realizar sorteios oficiais no servidor.');
  }

  let currentToken = params.idToken;
  const makeAuthHeaders = (token: string) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  // 1. Cryptographic Pre-Commit on Authoritative Backend
  let precommitRes = await apiCall<any>('/api/raffle/draw/pre-commit', {
    method: 'POST',
    headers: makeAuthHeaders(currentToken),
    body: JSON.stringify({ raffleId }),
  });

  // Retry once with a force-refreshed Firebase ID Token if token expired (JSON 401)
  if (precommitRes.status === 401 && !precommitRes.isHtml && params.refreshIdToken) {
    const refreshed = await params.refreshIdToken().catch(() => '');
    if (refreshed && refreshed !== currentToken) {
      currentToken = refreshed;
      precommitRes = await apiCall<any>('/api/raffle/draw/pre-commit', {
        method: 'POST',
        headers: makeAuthHeaders(currentToken),
        body: JSON.stringify({ raffleId }),
      });
    }
  }

  // Bootstrap once only when the authoritative raffle doc doesn't exist yet (JSON 404)
  if (precommitRes.status === 404 && !precommitRes.isHtml) {
    const bootRes = await apiCall<any>('/api/raffle/sync', {
      method: 'POST',
      headers: makeAuthHeaders(currentToken),
      body: JSON.stringify({
        raffleId,
        title: params.settings.raffleTitle || 'Sorteio Oficial GIO DA SORTE',
        settings: params.settings,
        participants: params.participants,
      }),
    });

    if (!bootRes.ok || !bootRes.data?.ok) {
      throw new Error(
        bootRes.error ||
          bootRes.data?.message ||
          bootRes.data?.error ||
          'Servidor indisponível para inicializar a mesa de sorteio.'
      );
    }

    precommitRes = await apiCall<any>('/api/raffle/draw/pre-commit', {
      method: 'POST',
      headers: makeAuthHeaders(currentToken),
      body: JSON.stringify({ raffleId }),
    });
  }

  if (!precommitRes.ok || !precommitRes.data?.ok) {
    throw new Error(
      precommitRes.error ||
        precommitRes.data?.message ||
        precommitRes.data?.error ||
        'Servidor indisponível para pré-compromisso do sorteio.'
    );
  }

  const authHeaders = makeAuthHeaders(currentToken);

  const precommitData = precommitRes.data;
  const { clientEntropy, randomSuffix } = generateClientEntropyHex();
  const drawId = `draw_trad_${Date.now()}_${randomSuffix}`;
  const idempotencyKey = `idem_${drawId}`;
  const { prizeId, prizeName } = resolveActivePrizeContext(params.settings);

  // 2. Execute Official Draw on Authoritative Backend
  const drawRes = await apiCall<any>('/api/raffle/draw', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      raffleId,
      drawId,
      idempotencyKey,
      commitmentHash: precommitData.commitmentHash,
      clientEntropy,
      expectedRosterVersion: precommitData.rosterVersion,
      expectedDrawSequence: precommitData.drawSequence,
      fencingToken: precommitData.fencingToken,
      drawMode: params.mode,
      winnerCount: 1,
      prizeId,
      prizeName,
    }),
  });

  if (!drawRes.ok || !drawRes.data?.ok || !drawRes.data.winningTicket || !drawRes.data.winner) {
    throw new Error(
      drawRes.error ||
        drawRes.data?.message ||
        drawRes.data?.error ||
        'O servidor de sorteios rejeitou a confirmação oficial do resultado.'
    );
  }

  const rawTicket = drawRes.data.winningTicket;
  const rawWinner = drawRes.data.winner as Winner;
  const proof = (drawRes.data.proof || rawWinner.proof) as TraditionalDrawProofV2 | undefined;

  const winner: Winner = {
    ...rawWinner,
    number: Number(rawWinner.number ?? rawTicket.number),
    proof: rawWinner.proof || proof,
  };

  return {
    winningTicket: {
      number: Number(rawTicket.number),
      participantId: String(rawTicket.participantId),
      name: String(rawTicket.name),
    },
    winner,
    proof,
    updatedWinners: Array.isArray(drawRes.data.updatedWinners)
      ? (drawRes.data.updatedWinners as Winner[])
      : undefined,
    updatedSettings: drawRes.data.updatedSettings
      ? (drawRes.data.updatedSettings as Pick<RaffleSettings, 'currentPrize' | 'prizes'>)
      : undefined,
  };
}
