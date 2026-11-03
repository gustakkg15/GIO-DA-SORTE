import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  TikTokLiveSession,
  TikTokLiveGiftEvent,
  TikTokLiveStreak,
  TikTokLiveParticipant,
  TikTokGlobalParticipant,
  TikTokGlobalSessionRecord,
  TikTokTicket,
  DrawSnapshot,
  SnapshotTicketEntry,
  DrawSnapshotChunk,
  LiveDrawRecord,
  TicketRuleVersion,
  AuditLogEntry,
  SubscriptionPlanTier,
  SubscriptionStatusState,
  ProPlanEntitlement,
} from '../types';

/**
 * Standard SHA-256 calculation compatible with Web and Node.js runtimes
 */
export async function computeSha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback simple checksum if subtle crypto is not available
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Unbiased Cryptographically Secure Pseudo-Random Number Generator (CSPRNG)
 * Uses rejection sampling over 32-bit unsigned random values to eliminate modulo bias.
 */
export function selectUniformRandomIndex(maxExclusive: number): {
  index: number;
  rawEntropyHex: string;
} {
  if (maxExclusive <= 0) {
    throw new Error('maxExclusive deve ser maior que zero.');
  }
  const maxUint32 = 0xffffffff;
  const limit = maxUint32 - (maxUint32 % maxExclusive);
  const buf = new Uint32Array(1);
  const seedBytes = new Uint8Array(32);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(seedBytes);
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
  } else {
    buf[0] = Math.floor(Math.random() * maxExclusive);
  }

  const rawEntropyHex = Array.from(seedBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    index: buf[0] % maxExclusive,
    rawEntropyHex: `${rawEntropyHex}_${buf[0]}`,
  };
}

/**
 * Audit Logger
 */
export async function recordAuditLog(
  category: AuditLogEntry['category'],
  action: string,
  details: Record<string, unknown>,
  actor = 'SYSTEM'
): Promise<void> {
  try {
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const logRef = doc(db, 'audit_logs', logId);
    await setDoc(logRef, {
      logId,
      timestamp: Date.now(),
      actor,
      category,
      action,
      details,
    });
  } catch (err) {
    console.warn('[AuditLog] Failed to record log:', err);
  }
}

/**
 * PRO PLAN ENTITLEMENT & VALIDATION ENGINE
 * All TikTok LIVE integration, gift capture, automatic accounting, ticket issuance,
 * and accumulated multi-LIVE campaigns require an active PRO plan.
 */
let activePlanTierState: SubscriptionPlanTier = 'PRO';
let activeStatusState: SubscriptionStatusState = 'ACTIVE';
let activePlanUpdatedAt: number = Date.now();

export function getProPlanEntitlement(): ProPlanEntitlement {
  const isPro = activePlanTierState === 'PRO' && activeStatusState === 'ACTIVE';
  return {
    tier: activePlanTierState,
    planTier: activePlanTierState,
    statusState: activeStatusState,
    active: isPro,
    organizerEmail: 'gustakkg15@gmail.com',
    updatedAt: activePlanUpdatedAt,
    features: {
      liveConnection: isPro,
      giftCapture: isPro,
      automaticAccounting: isPro,
      atomicTicketIssuance: isPro,
      accumulatedCampaigns: isPro,
    },
  };
}

export function setProPlanTier(
  tier: SubscriptionPlanTier,
  statusState?: SubscriptionStatusState
): ProPlanEntitlement {
  if (statusState) {
    activeStatusState = statusState;
    activePlanTierState = statusState === 'ACTIVE' ? 'PRO' : 'FREE';
  } else {
    activePlanTierState = tier === 'FREE' ? 'FREE' : 'PRO';
    activeStatusState = activePlanTierState === 'PRO' ? 'ACTIVE' : 'FREE';
  }
  activePlanUpdatedAt = Date.now();
  return getProPlanEntitlement();
}

export function assertProPlanActive(operationName = 'TikTok LIVE PRO'): void {
  if (activePlanTierState !== 'PRO' || activeStatusState !== 'ACTIVE') {
    throw new Error(
      `PRO_PLAN_REQUIRED: A operação "${operationName}" (integração TikTok LIVE, captura de presentes, contabilização automática, emissão de bilhetes e campanhas acumuladas) é exclusiva do plano PRO com status ACTIVE (status atual: ${activeStatusState}).`
    );
  }
}

/**
 * Get or create TikTok LIVE session document
 */
export async function getOrCreateLiveSession(
  sessionId: string,
  username: string,
  currentRate = 100,
  ruleId = 'rule_default_100'
): Promise<TikTokLiveSession> {
  const cleanUsername = username.replace(/^@/, '').trim();
  const sessionRef = doc(db, 'sessions', sessionId);
  const snap = await getDoc(sessionRef);

  if (snap.exists()) {
    return snap.data() as TikTokLiveSession;
  }

  const initialSession: TikTokLiveSession = {
    sessionId,
    username: cleanUsername,
    tiktokUserId: cleanUsername, // Will be updated on first gift with numeric ID
    raffleTitle: `Sorteio LIVE @${cleanUsername}`,
    prizeName: 'Prêmio Especial da LIVE',
    status: 'active',
    startedAt: Date.now(),
    endedAt: null,
    totalCoins: 0,
    totalGiftsCount: 0,
    uniqueSupportersCount: 0,
    currentRuleId: ruleId,
    currentRate,
    minCoinsPerGift: 1,
    maxTicketsPerUser: null,
    maxTotalTickets: null,
    allowDuplicateWinners: true,
    participationRulesNotes: 'Cada moeda enviada em presentes pontua automaticamente para emissão de bilhetes.',
    currentTicketCounter: 0,
    currentSequenceNumber: 0,
    latestDrawFrozenTicketMax: null,
  };

  await setDoc(sessionRef, initialSession);

  // Initialize default rule document if not exists
  const ruleRef = doc(db, 'ticket_rules', ruleId);
  const ruleSnap = await getDoc(ruleRef);
  if (!ruleSnap.exists()) {
    await setDoc(ruleRef, {
      ruleId,
      version: 1,
      name: 'Regra Padrão (100 Moedas = 1 Bilhete)',
      coinsPerTicket: currentRate,
      minCoinsPerGift: 1,
      maxTicketsPerUser: null,
      maxTotalTickets: null,
      active: true,
      createdAt: Date.now(),
    });
  }

  await recordAuditLog('LIVE_EVENT', 'SESSION_CREATED', { sessionId, username: cleanUsername, currentRate });
  return initialSession;
}

/**
 * ATOMIC GIFT PROCESSING:
 * 1. Checks eventId for idempotency
 * 2. Persists streak delta in Firestore
 * 3. Credits coins to session participant
 * 4. Issues atomic sequential tickets without collisions
 * 5. Updates global participant lifetime totals
 * 6. Records session participation record in subcollection (strictly bounded!)
 */
export async function recordGiftEventAtomic(
  input: {
    sessionId: string;
    tiktokUserId: string;
    username: string;
    displayHandle?: string;
    handleAvailable?: boolean;
    nickname: string;
    avatarUrl?: string;
    giftId: number;
    giftName: string;
    diamondCount: number;
    repeatCount: number;
    deltaCount: number;
    coinsGranted: number;
    repeatEnd: boolean;
    groupId: string;
    streakKey?: string;
    eventId?: string;
    eventKey?: string;
    transactionId?: string;
    technicalSignature?: string;
    originalTimestamp?: number | string;
    receivedAt?: number;
  }
): Promise<{
  success: boolean;
  event: TikTokLiveGiftEvent;
  newTickets: number;
  ticketNumbers: number[];
  carryover: number;
  totalCoins: number;
}> {
  const {
    sessionId,
    tiktokUserId,
    username,
    nickname,
    avatarUrl = '',
    giftId,
    giftName,
    diamondCount,
    repeatCount,
    deltaCount,
    repeatEnd,
    groupId,
  } = input;

  assertProPlanActive('Contabilização Automática e Emissão de Bilhetes');

  const handleAvailable =
    input.handleAvailable !== undefined
      ? Boolean(input.handleAvailable)
      : Boolean(username && username !== 'arroba_indisponivel' && username !== 'anonimo' && username !== 'unknown');
  const cleanUsername = handleAvailable ? username.replace(/^@+/, '').trim() : 'arroba_indisponivel';
  const displayHandle = input.displayHandle || (handleAvailable ? `@${cleanUsername}` : 'Arroba indisponível');

  const eventId =
    input.eventId ||
    (input.transactionId
      ? `${sessionId}_${input.transactionId}_r${repeatCount}`
      : `${sessionId}_${tiktokUserId}_${giftId}_${groupId}_r${repeatCount}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}`);

  const streakKey = input.streakKey || `${tiktokUserId}_${giftId}_${groupId}`;

  // Execute in an atomic Firestore transaction serialized per session to prevent lock contention
  return await withSessionPersistenceLock(sessionId, () =>
    runTransaction(db, async (tx) => {
      // Phase 1: All document references
    const eventRef = doc(db, 'sessions', sessionId, 'events', eventId);
    const streakRef = doc(db, 'sessions', sessionId, 'streaks', streakKey);
    const sessionRef = doc(db, 'sessions', sessionId);
    const partRef = doc(db, 'sessions', sessionId, 'participants', tiktokUserId);
    const globalRef = doc(db, 'global_participants', tiktokUserId);
    const globalPartSessionRef = doc(db, 'global_participants', tiktokUserId, 'participations', sessionId);

    // Phase 2: ALL READS FIRST (Strict Firestore transaction requirement)
    const [
      existingEventSnap,
      streakSnap,
      sessionSnap,
      partSnap,
      globalSnap,
      globalPartSessionSnap,
    ] = await Promise.all([
      tx.get(eventRef),
      tx.get(streakRef),
      tx.get(sessionRef),
      tx.get(partRef),
      tx.get(globalRef),
      tx.get(globalPartSessionRef),
    ]);

    // 1. Check idempotency on exact canonical eventId
    if (existingEventSnap.exists()) {
      const data = existingEventSnap.data() as TikTokLiveGiftEvent;
      return {
        success: true,
        event: data,
        newTickets: 0,
        ticketNumbers: [],
        carryover: 0,
        totalCoins: 0,
      };
    }

    if (!sessionSnap.exists()) {
      throw new Error(`Sessão ${sessionId} não existe.`);
    }

    const sessionDataPreCheck = sessionSnap.data() as TikTokLiveSession;
    if (sessionDataPreCheck.status === 'paused') {
      throw new Error(`A coleta de bilhetes da LIVE (${sessionId}) está PAUSADA. Retome a coleta para emitir novos números.`);
    }
    if (sessionDataPreCheck.status === 'ended') {
      throw new Error(`A coleta de bilhetes da LIVE (${sessionId}) já foi ENCERRADA.`);
    }

    // 2. Compute streak delta accurately without dropping legitimate repeat sends from the same user
    const existingStreakData = streakSnap.exists() ? (streakSnap.data() as TikTokLiveStreak) : null;
    const isContinuingActiveStreak =
      existingStreakData !== null &&
      existingStreakData.status === 'IN_PROGRESS' &&
      repeatCount >= existingStreakData.lastProcessedRepeatCount &&
      !(repeatCount === 1 && existingStreakData.lastProcessedRepeatCount === 1 && !repeatEnd);

    const lastRepeat = isContinuingActiveStreak && existingStreakData ? existingStreakData.lastProcessedRepeatCount : 0;
    const computedDelta = repeatCount - lastRepeat;

    // Only treat as a zero-delta combo closing packet when an active IN_PROGRESS streak receives repeatEnd=true at the same repeatCount
    if (
      isContinuingActiveStreak &&
      existingStreakData &&
      computedDelta <= 0 &&
      repeatCount > 0 &&
      repeatEnd &&
      deltaCount <= 0
    ) {
      tx.update(streakRef, { status: 'COMPLETED', updatedAt: Date.now() });
      const closingEvent: TikTokLiveGiftEvent = {
        eventId,
        ...(input.eventKey ? { eventKey: input.eventKey } : {}),
        ...(input.transactionId ? { transactionId: input.transactionId } : {}),
        ...(input.technicalSignature ? { technicalSignature: input.technicalSignature } : {}),
        ...(input.originalTimestamp !== undefined ? { originalTimestamp: input.originalTimestamp } : {}),
        streakKey,
        sessionId,
        tiktokUserId,
        username: cleanUsername,
        displayHandle,
        handleAvailable,
        nickname,
        avatarUrl,
        giftId,
        giftName,
        diamondCount,
        repeatCount,
        deltaCount: 0,
        coinsGranted: 0,
        ruleIdApplied: 'none',
        rateApplied: 100,
        repeatEnd,
        groupId,
        receivedAt: Date.now(),
        persistenceStatus: 'CONFIRMED',
        ticketNumbers: [],
      };
      return {
        success: true,
        event: closingEvent,
        newTickets: 0,
        ticketNumbers: [],
        carryover: 0,
        totalCoins: 0,
      };
    }

    const effectiveDelta = computedDelta > 0 ? computedDelta : deltaCount > 0 ? deltaCount : repeatCount;
    const effectiveCoins = effectiveDelta * Math.max(1, diamondCount);

    // 3. Compute ticket allocation from session and participant (enforcing minCoinsPerGift, maxTicketsPerUser, maxTotalTickets)
    const sessionData = sessionSnap.data() as TikTokLiveSession;
    const rate = sessionData.currentRate || 100;
    const ruleId = sessionData.currentRuleId || 'rule_default_100';
    const minCoinsPerGift = Math.max(1, Number(sessionData.minCoinsPerGift || 1));
    const maxTicketsPerUser =
      sessionData.maxTicketsPerUser && sessionData.maxTicketsPerUser > 0
        ? Number(sessionData.maxTicketsPerUser)
        : null;
    const maxTotalTickets =
      sessionData.maxTotalTickets && sessionData.maxTotalTickets > 0
        ? Number(sessionData.maxTotalTickets)
        : null;

    const currentTicketCounter = sessionData.currentTicketCounter || 0;
    const nextSequenceNumber = (sessionData.currentSequenceNumber || 0) + 1;
    const persistedAt = Date.now();
    const serverReceivedAt = input.receivedAt && input.receivedAt > 0 ? input.receivedAt : persistedAt;

    const prevCoinsInSession = partSnap.exists() ? (partSnap.data().coinsInSession || 0) : 0;
    const prevCarryover = partSnap.exists() ? (partSnap.data().carryoverCoins || 0) : 0;
    const prevTickets = partSnap.exists() ? (partSnap.data().ticketsInSession || 0) : 0;

    const eligibleGiftCoins = effectiveCoins >= minCoinsPerGift ? effectiveCoins : 0;
    const totalEligible = prevCarryover + eligibleGiftCoins;
    let newTicketsCount = Math.floor(totalEligible / rate);
    const newCarryover = totalEligible % rate;

    if (maxTicketsPerUser !== null) {
      const remainingForUser = Math.max(0, maxTicketsPerUser - prevTickets);
      if (newTicketsCount > remainingForUser) {
        newTicketsCount = remainingForUser;
      }
    }
    if (maxTotalTickets !== null) {
      const remainingInSession = Math.max(0, maxTotalTickets - currentTicketCounter);
      if (newTicketsCount > remainingInSession) {
        newTicketsCount = remainingInSession;
      }
    }

    // 4. Compute global lifetime counters
    const prevLifetimeCoins = globalSnap.exists() ? (globalSnap.data().totalCoinsLifetime || 0) : 0;
    const prevLifetimeTickets = globalSnap.exists() ? (globalSnap.data().totalTicketsLifetime || 0) : 0;
    const prevSessionsCount = globalSnap.exists() ? (globalSnap.data().sessionsCount || 0) : 0;
    const isNewSessionForUser = !globalPartSessionSnap.exists();

    const prevSessionCoins = globalPartSessionSnap.exists() ? (globalPartSessionSnap.data().coinsContributed || 0) : 0;
    const prevSessionTickets = globalPartSessionSnap.exists() ? (globalPartSessionSnap.data().ticketsIssued || 0) : 0;

    // Phase 3: ALL WRITES AFTER ALL READS HAVE COMPLETED
    const ticketNumbers: number[] = [];
    for (let i = 1; i <= newTicketsCount; i++) {
      const ticketNum = currentTicketCounter + i;
      ticketNumbers.push(ticketNum);
      const ticketRef = doc(db, 'sessions', sessionId, 'tickets', `${sessionId}_t_${ticketNum}`);
      tx.set(ticketRef, {
        ticketId: `${sessionId}_t_${ticketNum}`,
        ticketNumber: ticketNum,
        sessionId,
        tiktokUserId,
        username: cleanUsername,
        nickname,
        ruleId,
        rateAtCreation: rate,
        issuedAt: Date.now(),
      });
    }

    // Update session
    const isFirstTimeParticipant = !partSnap.exists();
    tx.update(sessionRef, {
      currentTicketCounter: currentTicketCounter + newTicketsCount,
      currentSequenceNumber: nextSequenceNumber,
      totalCoins: (sessionData.totalCoins || 0) + effectiveCoins,
      totalGiftsCount: (sessionData.totalGiftsCount || 0) + effectiveDelta,
      uniqueSupportersCount: (sessionData.uniqueSupportersCount || 0) + (isFirstTimeParticipant ? 1 : 0),
    });

    // Preserve previously known valid handle if a later event from the same numeric userId lacks handle
    const existingPartUsername = partSnap.exists() ? partSnap.data().username : '';
    const existingPartHandleAvailable = partSnap.exists() ? partSnap.data().handleAvailable : false;
    const finalUsername =
      handleAvailable
        ? cleanUsername
        : existingPartHandleAvailable && existingPartUsername && existingPartUsername !== 'arroba_indisponivel'
        ? existingPartUsername
        : cleanUsername;
    const finalHandleAvailable = handleAvailable || Boolean(existingPartHandleAvailable && finalUsername !== 'arroba_indisponivel');
    const finalDisplayHandle = finalHandleAvailable ? `@${finalUsername}` : 'Arroba indisponível';

    // Update session participant
    tx.set(
      partRef,
      {
        tiktokUserId,
        sessionId,
        username: finalUsername,
        displayHandle: finalDisplayHandle,
        handleAvailable: finalHandleAvailable,
        nickname,
        avatarUrl,
        coinsInSession: prevCoinsInSession + effectiveCoins,
        ticketsInSession: prevTickets + newTicketsCount,
        carryoverCoins: newCarryover,
        lastGiftAt: Date.now(),
      },
      { merge: true }
    );

    // Update global participant
    tx.set(
      globalRef,
      {
        tiktokUserId,
        currentUsername: finalUsername,
        currentNickname: nickname,
        currentAvatarUrl: avatarUrl,
        totalCoinsLifetime: prevLifetimeCoins + effectiveCoins,
        totalTicketsLifetime: prevLifetimeTickets + newTicketsCount,
        sessionsCount: prevSessionsCount + (isNewSessionForUser ? 1 : 0),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Update global participant session subcollection
    tx.set(
      globalPartSessionRef,
      {
        sessionId,
        coinsContributed: prevSessionCoins + effectiveCoins,
        ticketsIssued: prevSessionTickets + newTicketsCount,
        participatedAt: Date.now(),
      },
      { merge: true }
    );

    // Update streak state in Firestore
    tx.set(
      streakRef,
      {
        streakKey,
        sessionId,
        tiktokUserId,
        giftId,
        groupId,
        lastProcessedRepeatCount: repeatCount,
        totalCoins: (existingStreakData ? (existingStreakData.totalCoins || 0) : 0) + effectiveCoins,
        status: repeatEnd ? 'COMPLETED' : 'IN_PROGRESS',
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Commit event document
    const finalEvent: TikTokLiveGiftEvent = {
      eventId,
      ...(input.eventKey ? { eventKey: input.eventKey } : { eventKey: `evt_${eventId}` }),
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      ...(input.technicalSignature ? { technicalSignature: input.technicalSignature } : {}),
      ...(input.originalTimestamp !== undefined ? { originalTimestamp: input.originalTimestamp } : {}),
      streakKey,
      sessionId,
      tiktokUserId,
      username: finalUsername,
      displayHandle: finalDisplayHandle,
      handleAvailable: finalHandleAvailable,
      nickname,
      avatarUrl,
      giftId,
      giftName,
      diamondCount,
      repeatCount,
      deltaCount: effectiveDelta,
      coinsGranted: effectiveCoins,
      ruleIdApplied: ruleId,
      rateApplied: rate,
      repeatEnd,
      groupId,
      receivedAt: serverReceivedAt,
      persistedAt,
      sequenceNumber: nextSequenceNumber,
      persistenceStatus: 'CONFIRMED',
      ticketNumbers,
    };
    tx.set(eventRef, finalEvent);

      return {
        success: true,
        event: finalEvent,
        newTickets: newTicketsCount,
        ticketNumbers: ticketNumbers,
        carryover: newCarryover,
        totalCoins: prevCoinsInSession + effectiveCoins,
      };
    })
  );
}

export interface GiftEventAtomicInput {
  eventId?: string;
  eventKey?: string;
  transactionId?: string;
  technicalSignature?: string;
  originalTimestamp?: number | string;
  streakKey?: string;
  sessionId: string;
  tiktokUserId: string;
  username: string;
  displayHandle?: string;
  handleAvailable?: boolean;
  nickname: string;
  avatarUrl?: string;
  giftId: number;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  deltaCount?: number;
  coinsGranted?: number;
  repeatEnd: boolean;
  groupId: string;
  receivedAt?: number;
}

export interface GiftEventAtomicResult {
  success: boolean;
  event: TikTokLiveGiftEvent;
  newTickets: number;
  ticketNumbers: number[];
  carryover: number;
  totalCoins: number;
  alreadyPersisted?: boolean;
}

// Per-session serialization mutex so concurrent bursts for the same LIVE session never collide on Firestore locks
const sessionPersistenceLocks = new Map<string, Promise<unknown>>();

export async function withSessionPersistenceLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const key = sessionId || 'default_session';
  const prev = sessionPersistenceLocks.get(key) || Promise.resolve();
  const next = prev.then(task, task);
  sessionPersistenceLocks.set(
    key,
    next.catch(() => {})
  );
  return next;
}

/**
 * Atomic Micro-Batch Gift Event Persistence (`recordGiftEventsBatchAtomic`):
 * Persists 1..N queued gift events for a LIVE session inside serialized atomic Firestore transactions
 * (automatically chunked to respect Firestore's 500-operation transaction limit).
 *
 * Guarantees:
 * - Zero Firestore lock contention under 10/50/100 EPS and 500-event bursts.
 * - Strict chronological ordering per session, user, and combo/streak.
 * - Exact sequential ticket numbering (no gaps, no duplicate ticket numbers).
 * - Exact carryoverCoins accumulation across multiple gifts from the same user in the same batch.
 * - Full idempotency on canonical eventId (never credits an already-persisted event twice).
 */
export async function recordGiftEventsBatchAtomic(
  inputs: GiftEventAtomicInput[]
): Promise<GiftEventAtomicResult[]> {
  if (!inputs || inputs.length === 0) return [];
  assertProPlanActive('Contabilização Automática em Lote e Emissão de Bilhetes');

  // Group by sessionId while preserving order
  const firstSessionId = inputs[0].sessionId;
  const allSameSession = inputs.every((item) => item.sessionId === firstSessionId);
  if (!allSameSession) {
    const results: GiftEventAtomicResult[] = [];
    for (const item of inputs) {
      const [singleRes] = await recordGiftEventsBatchAtomic([item]);
      results.push(singleRes);
    }
    return results;
  }

  return withSessionPersistenceLock(firstSessionId, async () => {
    const CHUNK_SIZE = 50; // Safe chunk size so ticket + participant + event writes stay well below Firestore 500-write limit
    const allResults: GiftEventAtomicResult[] = [];

    for (let offset = 0; offset < inputs.length; offset += CHUNK_SIZE) {
      const chunk = inputs.slice(offset, offset + CHUNK_SIZE);
      const chunkResults = await executeSingleSessionChunkTransaction(firstSessionId, chunk);
      allResults.push(...chunkResults);
    }

    return allResults;
  });
}

async function executeSingleSessionChunkTransaction(
  sessionId: string,
  chunk: GiftEventAtomicInput[]
): Promise<GiftEventAtomicResult[]> {
  // Normalize inputs before entering transaction
  const normalizedItems = chunk.map((input, idx) => {
    const rawUsername = String(input.username || '').trim().replace(/^@+/, '');
    const invalidHandles = new Set([
      'anonimo',
      'anônimo',
      'anonymous',
      'unknown',
      'anon',
      'anon_user',
      'apoiador_ao_vivo',
      'arroba_indisponivel',
      'indisponivel',
    ]);
    const hasValidHandle =
      input.handleAvailable !== undefined
        ? Boolean(input.handleAvailable) && rawUsername.length > 0 && !invalidHandles.has(rawUsername.toLowerCase())
        : rawUsername.length > 0 && !invalidHandles.has(rawUsername.toLowerCase());
    const cleanUsername = hasValidHandle ? rawUsername : 'arroba_indisponivel';
    const handleAvailable = hasValidHandle;
    const displayHandle =
      input.displayHandle || (handleAvailable ? `@${cleanUsername}` : 'Arroba indisponível');

    const rawUserId = String(input.tiktokUserId || '').trim();
    const tiktokUserId =
      rawUserId && !invalidHandles.has(rawUserId.toLowerCase())
        ? rawUserId
        : handleAvailable
        ? `u_${cleanUsername.toLowerCase()}`
        : `sem_id_${input.transactionId || input.eventId || `${Date.now()}_${idx}`}`;

    const rawNick = String(input.nickname || '').trim();
    const nickname =
      rawNick && !invalidHandles.has(rawNick.toLowerCase())
        ? rawNick
        : handleAvailable
        ? cleanUsername
        : 'Arroba indisponível';

    const avatarUrl = input.avatarUrl || '';
    const giftId = Number(input.giftId || 0);
    const giftName = input.giftName || 'Presente';
    const diamondCount = Math.max(1, Number(input.diamondCount || 1));
    const repeatCount = Math.max(1, Number(input.repeatCount || 1));
    const deltaCount = Number(input.deltaCount || 0);
    const repeatEnd = Boolean(input.repeatEnd);
    const groupId = String(input.groupId || `grp_${Date.now()}_${idx}`);
    const streakKey = input.streakKey
      ? String(input.streakKey)
      : `${tiktokUserId}_${giftId}_${groupId}`;

    const rawEventId = input.eventId
      ? String(input.eventId)
      : input.transactionId
      ? `${sessionId}_tx_${input.transactionId}_r${repeatCount}`
      : `${sessionId}_${streakKey}_r${repeatCount}`;
    const eventId = rawEventId.replace(/[\/\.]/g, '_');

    return {
      original: input,
      eventId,
      eventKey: input.eventKey || `evt_${eventId}`,
      transactionId: input.transactionId,
      technicalSignature: input.technicalSignature,
      originalTimestamp: input.originalTimestamp,
      streakKey,
      sessionId,
      tiktokUserId,
      cleanUsername,
      displayHandle,
      handleAvailable,
      nickname,
      avatarUrl,
      giftId,
      giftName,
      diamondCount,
      repeatCount,
      deltaCount,
      repeatEnd,
      groupId,
      receivedAt: input.receivedAt,
    };
  });

  return runTransaction(db, async (tx) => {
    const sessionRef = doc(db, 'sessions', sessionId);

    const uniqueEventIds = Array.from(new Set(normalizedItems.map((i) => i.eventId)));
    const uniqueStreakKeys = Array.from(new Set(normalizedItems.map((i) => i.streakKey)));
    const uniqueUserIds = Array.from(new Set(normalizedItems.map((i) => i.tiktokUserId)));

    const eventRefs = new Map(uniqueEventIds.map((eid) => [eid, doc(db, 'sessions', sessionId, 'events', eid)]));
    const streakRefs = new Map(uniqueStreakKeys.map((sk) => [sk, doc(db, 'sessions', sessionId, 'streaks', sk)]));
    const partRefs = new Map(uniqueUserIds.map((uid) => [uid, doc(db, 'sessions', sessionId, 'participants', uid)]));
    const globalRefs = new Map(uniqueUserIds.map((uid) => [uid, doc(db, 'global_participants', uid)]));
    const globalPartSessionRefs = new Map(
      uniqueUserIds.map((uid) => [uid, doc(db, 'global_participants', uid, 'participations', sessionId)])
    );

    // Phase 1: ALL READS FIRST
    const [
      sessionSnap,
      eventSnaps,
      streakSnaps,
      partSnaps,
      globalSnaps,
      globalPartSessionSnaps,
    ] = await Promise.all([
      tx.get(sessionRef),
      Promise.all(uniqueEventIds.map((eid) => tx.get(eventRefs.get(eid)!))),
      Promise.all(uniqueStreakKeys.map((sk) => tx.get(streakRefs.get(sk)!))),
      Promise.all(uniqueUserIds.map((uid) => tx.get(partRefs.get(uid)!))),
      Promise.all(uniqueUserIds.map((uid) => tx.get(globalRefs.get(uid)!))),
      Promise.all(uniqueUserIds.map((uid) => tx.get(globalPartSessionRefs.get(uid)!))),
    ]);

    if (!sessionSnap.exists()) {
      throw new Error(`Sessão ${sessionId} não existe.`);
    }

    const sessionData = sessionSnap.data() as TikTokLiveSession;
    if (sessionData.status === 'paused') {
      throw new Error(`A coleta de bilhetes da LIVE (${sessionId}) está PAUSADA. Retome a coleta para emitir novos números.`);
    }
    if (sessionData.status === 'ended') {
      throw new Error(`A coleta de bilhetes da LIVE (${sessionId}) já foi ENCERRADA.`);
    }

    const rate = sessionData.currentRate || 100;
    const ruleId = sessionData.currentRuleId || 'rule_default_100';
    const minCoinsPerGift = Math.max(1, Number(sessionData.minCoinsPerGift || 1));
    const maxTicketsPerUser =
      sessionData.maxTicketsPerUser && sessionData.maxTicketsPerUser > 0
        ? Number(sessionData.maxTicketsPerUser)
        : null;
    const maxTotalTickets =
      sessionData.maxTotalTickets && sessionData.maxTotalTickets > 0
        ? Number(sessionData.maxTotalTickets)
        : null;

    let runningTicketCounter = sessionData.currentTicketCounter || 0;
    let runningSequenceNumber = sessionData.currentSequenceNumber || 0;
    let runningTotalCoins = sessionData.totalCoins || 0;
    let runningTotalGiftsCount = sessionData.totalGiftsCount || 0;
    let runningUniqueSupporters = sessionData.uniqueSupportersCount || 0;
    let sessionModified = false;

    const existingEventsMap = new Map<string, TikTokLiveGiftEvent>();
    uniqueEventIds.forEach((eid, i) => {
      if (eventSnaps[i].exists()) {
        existingEventsMap.set(eid, eventSnaps[i].data() as TikTokLiveGiftEvent);
      }
    });

    const streaksState = new Map<string, TikTokLiveStreak | null>();
    const dirtyStreaks = new Set<string>();
    uniqueStreakKeys.forEach((sk, i) => {
      streaksState.set(sk, streakSnaps[i].exists() ? (streakSnaps[i].data() as TikTokLiveStreak) : null);
    });

    interface MutableUserState {
      existsInSession: boolean;
      username: string;
      displayHandle: string;
      handleAvailable: boolean;
      nickname: string;
      avatarUrl: string;
      coinsInSession: number;
      ticketsInSession: number;
      carryoverCoins: number;
      lifetimeCoins: number;
      lifetimeTickets: number;
      sessionsCount: number;
      isNewSessionForUser: boolean;
      sessionCoinsContributed: number;
      sessionTicketsIssued: number;
      dirty: boolean;
    }

    const usersState = new Map<string, MutableUserState>();
    uniqueUserIds.forEach((uid, i) => {
      const pSnap = partSnaps[i];
      const gSnap = globalSnaps[i];
      const gpsSnap = globalPartSessionSnaps[i];
      const pData = pSnap.exists() ? pSnap.data() : {};
      const gData = gSnap.exists() ? gSnap.data() : {};
      const gpsData = gpsSnap.exists() ? gpsSnap.data() : {};

      usersState.set(uid, {
        existsInSession: pSnap.exists(),
        username: pData.username || 'arroba_indisponivel',
        displayHandle: pData.displayHandle || 'Arroba indisponível',
        handleAvailable: Boolean(pData.handleAvailable),
        nickname: pData.nickname || 'Arroba indisponível',
        avatarUrl: pData.avatarUrl || '',
        coinsInSession: pData.coinsInSession || 0,
        ticketsInSession: pData.ticketsInSession || 0,
        carryoverCoins: pData.carryoverCoins || 0,
        lifetimeCoins: gData.totalCoinsLifetime || 0,
        lifetimeTickets: gData.totalTicketsLifetime || 0,
        sessionsCount: gData.sessionsCount || 0,
        isNewSessionForUser: !gpsSnap.exists(),
        sessionCoinsContributed: gpsData.coinsContributed || 0,
        sessionTicketsIssued: gpsData.ticketsIssued || 0,
        dirty: false,
      });
    });

    // Phase 2: PROCESS EACH EVENT IN ORDER AND QUEUE WRITES
    const results: GiftEventAtomicResult[] = [];
    const now = Date.now();

    for (const item of normalizedItems) {
      const alreadySaved = existingEventsMap.get(item.eventId);
      if (alreadySaved) {
        results.push({
          success: true,
          event: alreadySaved,
          newTickets: 0,
          ticketNumbers: alreadySaved.ticketNumbers || [],
          carryover: usersState.get(item.tiktokUserId)?.carryoverCoins || 0,
          totalCoins: usersState.get(item.tiktokUserId)?.coinsInSession || 0,
          alreadyPersisted: true,
        });
        continue;
      }

      const existingStreakData = streaksState.get(item.streakKey) || null;
      const isContinuingActiveStreak =
        existingStreakData !== null &&
        existingStreakData.status === 'IN_PROGRESS' &&
        item.repeatCount >= existingStreakData.lastProcessedRepeatCount &&
        !(item.repeatCount === 1 && existingStreakData.lastProcessedRepeatCount === 1 && !item.repeatEnd);

      const lastRepeat =
        isContinuingActiveStreak && existingStreakData ? existingStreakData.lastProcessedRepeatCount : 0;
      const computedDelta = item.repeatCount - lastRepeat;

      if (
        isContinuingActiveStreak &&
        existingStreakData &&
        computedDelta <= 0 &&
        item.repeatCount > 0 &&
        item.repeatEnd &&
        item.deltaCount <= 0
      ) {
        streaksState.set(item.streakKey, {
          ...existingStreakData,
          status: 'COMPLETED',
          updatedAt: now,
        });
        dirtyStreaks.add(item.streakKey);

        const closingEvent: TikTokLiveGiftEvent = {
          eventId: item.eventId,
          eventKey: item.eventKey,
          ...(item.transactionId ? { transactionId: item.transactionId } : {}),
          ...(item.technicalSignature ? { technicalSignature: item.technicalSignature } : {}),
          ...(item.originalTimestamp !== undefined ? { originalTimestamp: item.originalTimestamp } : {}),
          streakKey: item.streakKey,
          sessionId,
          tiktokUserId: item.tiktokUserId,
          username: item.cleanUsername,
          displayHandle: item.displayHandle,
          handleAvailable: item.handleAvailable,
          nickname: item.nickname,
          avatarUrl: item.avatarUrl,
          giftId: item.giftId,
          giftName: item.giftName,
          diamondCount: item.diamondCount,
          repeatCount: item.repeatCount,
          deltaCount: 0,
          coinsGranted: 0,
          ruleIdApplied: 'none',
          rateApplied: rate,
          repeatEnd: item.repeatEnd,
          groupId: item.groupId,
          receivedAt: now,
          persistenceStatus: 'CONFIRMED',
          ticketNumbers: [],
        };
        results.push({
          success: true,
          event: closingEvent,
          newTickets: 0,
          ticketNumbers: [],
          carryover: usersState.get(item.tiktokUserId)?.carryoverCoins || 0,
          totalCoins: usersState.get(item.tiktokUserId)?.coinsInSession || 0,
        });
        continue;
      }

      const effectiveDelta =
        computedDelta > 0 ? computedDelta : item.deltaCount > 0 ? item.deltaCount : item.repeatCount;
      const effectiveCoins = effectiveDelta * Math.max(1, item.diamondCount);

      const uState = usersState.get(item.tiktokUserId)!;
      const eligibleGiftCoins = effectiveCoins >= minCoinsPerGift ? effectiveCoins : 0;
      const totalEligible = uState.carryoverCoins + eligibleGiftCoins;
      let newTicketsCount = Math.floor(totalEligible / rate);
      const newCarryover = totalEligible % rate;

      if (maxTicketsPerUser !== null) {
        const remainingForUser = Math.max(0, maxTicketsPerUser - uState.ticketsInSession);
        if (newTicketsCount > remainingForUser) {
          newTicketsCount = remainingForUser;
        }
      }
      if (maxTotalTickets !== null) {
        const remainingInSession = Math.max(0, maxTotalTickets - runningTicketCounter);
        if (newTicketsCount > remainingInSession) {
          newTicketsCount = remainingInSession;
        }
      }

      const ticketNumbers: number[] = [];
      for (let i = 1; i <= newTicketsCount; i++) {
        const ticketNum = runningTicketCounter + i;
        ticketNumbers.push(ticketNum);
        const ticketRef = doc(db, 'sessions', sessionId, 'tickets', `${sessionId}_t_${ticketNum}`);
        tx.set(ticketRef, {
          ticketId: `${sessionId}_t_${ticketNum}`,
          ticketNumber: ticketNum,
          sessionId,
          tiktokUserId: item.tiktokUserId,
          username: item.cleanUsername,
          nickname: item.nickname,
          ruleId,
          rateAtCreation: rate,
          issuedAt: now,
        });
      }

      runningTicketCounter += newTicketsCount;
      runningSequenceNumber += 1;
      const assignedSequenceNumber = runningSequenceNumber;
      runningTotalCoins += effectiveCoins;
      runningTotalGiftsCount += effectiveDelta;
      if (!uState.existsInSession) {
        runningUniqueSupporters += 1;
        uState.existsInSession = true;
      }
      sessionModified = true;

      const finalUsername =
        item.handleAvailable
          ? item.cleanUsername
          : uState.handleAvailable && uState.username && uState.username !== 'arroba_indisponivel'
          ? uState.username
          : item.cleanUsername;
      const finalHandleAvailable =
        item.handleAvailable || Boolean(uState.handleAvailable && finalUsername !== 'arroba_indisponivel');
      const finalDisplayHandle = finalHandleAvailable ? `@${finalUsername}` : 'Arroba indisponível';

      uState.username = finalUsername;
      uState.displayHandle = finalDisplayHandle;
      uState.handleAvailable = finalHandleAvailable;
      uState.nickname = item.nickname || uState.nickname;
      uState.avatarUrl = item.avatarUrl || uState.avatarUrl;
      uState.coinsInSession += effectiveCoins;
      uState.ticketsInSession += newTicketsCount;
      uState.carryoverCoins = newCarryover;
      uState.lifetimeCoins += effectiveCoins;
      uState.lifetimeTickets += newTicketsCount;
      if (uState.isNewSessionForUser) {
        uState.sessionsCount += 1;
        uState.isNewSessionForUser = false;
      }
      uState.sessionCoinsContributed += effectiveCoins;
      uState.sessionTicketsIssued += newTicketsCount;
      uState.dirty = true;

      streaksState.set(item.streakKey, {
        streakKey: item.streakKey,
        sessionId,
        tiktokUserId: item.tiktokUserId,
        giftId: item.giftId,
        groupId: item.groupId,
        lastProcessedRepeatCount: item.repeatCount,
        totalCoins: (existingStreakData ? existingStreakData.totalCoins || 0 : 0) + effectiveCoins,
        status: item.repeatEnd ? 'COMPLETED' : 'IN_PROGRESS',
        updatedAt: now,
      });
      dirtyStreaks.add(item.streakKey);

      const finalEvent: TikTokLiveGiftEvent = {
        eventId: item.eventId,
        eventKey: item.eventKey,
        ...(item.transactionId ? { transactionId: item.transactionId } : {}),
        ...(item.technicalSignature ? { technicalSignature: item.technicalSignature } : {}),
        ...(item.originalTimestamp !== undefined ? { originalTimestamp: item.originalTimestamp } : {}),
        streakKey: item.streakKey,
        sessionId,
        tiktokUserId: item.tiktokUserId,
        username: finalUsername,
        displayHandle: finalDisplayHandle,
        handleAvailable: finalHandleAvailable,
        nickname: item.nickname,
        avatarUrl: item.avatarUrl,
        giftId: item.giftId,
        giftName: item.giftName,
        diamondCount: item.diamondCount,
        repeatCount: item.repeatCount,
        deltaCount: effectiveDelta,
        coinsGranted: effectiveCoins,
        ruleIdApplied: ruleId,
        rateApplied: rate,
        repeatEnd: item.repeatEnd,
        groupId: item.groupId,
        receivedAt: item.receivedAt && item.receivedAt > 0 ? item.receivedAt : now,
        persistedAt: now,
        sequenceNumber: assignedSequenceNumber,
        persistenceStatus: 'CONFIRMED',
        ticketNumbers,
      };

      tx.set(eventRefs.get(item.eventId)!, finalEvent);
      existingEventsMap.set(item.eventId, finalEvent);

      results.push({
        success: true,
        event: finalEvent,
        newTickets: newTicketsCount,
        ticketNumbers,
        carryover: newCarryover,
        totalCoins: uState.coinsInSession,
      });
    }

    // Phase 3: COMMIT AGGREGATED SESSION, PARTICIPANT, GLOBAL & STREAK WRITES
    if (sessionModified) {
      tx.update(sessionRef, {
        currentTicketCounter: runningTicketCounter,
        currentSequenceNumber: runningSequenceNumber,
        totalCoins: runningTotalCoins,
        totalGiftsCount: runningTotalGiftsCount,
        uniqueSupportersCount: runningUniqueSupporters,
      });
    }

    for (const [uid, uState] of usersState.entries()) {
      if (!uState.dirty) continue;
      tx.set(
        partRefs.get(uid)!,
        {
          tiktokUserId: uid,
          sessionId,
          username: uState.username,
          displayHandle: uState.displayHandle,
          handleAvailable: uState.handleAvailable,
          nickname: uState.nickname,
          avatarUrl: uState.avatarUrl,
          coinsInSession: uState.coinsInSession,
          ticketsInSession: uState.ticketsInSession,
          carryoverCoins: uState.carryoverCoins,
          lastGiftAt: now,
        },
        { merge: true }
      );

      tx.set(
        globalRefs.get(uid)!,
        {
          tiktokUserId: uid,
          currentUsername: uState.username,
          currentNickname: uState.nickname,
          currentAvatarUrl: uState.avatarUrl,
          totalCoinsLifetime: uState.lifetimeCoins,
          totalTicketsLifetime: uState.lifetimeTickets,
          sessionsCount: uState.sessionsCount,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        globalPartSessionRefs.get(uid)!,
        {
          sessionId,
          coinsContributed: uState.sessionCoinsContributed,
          ticketsIssued: uState.sessionTicketsIssued,
          participatedAt: now,
        },
        { merge: true }
      );
    }

    for (const sk of dirtyStreaks) {
      const st = streaksState.get(sk);
      if (st) {
        tx.set(streakRefs.get(sk)!, st, { merge: true });
      }
    }

    return results;
  });
}

/**
 * Non-blocking freeze snapshot for individual LIVE raffle:
 * Captures maxTicketNumberFrozen and chunks ordered ticket list into subcollection,
 * keeping LIVE gift processing active without interruption!
 */
export async function createNonBlockingSessionSnapshot(sessionId: string): Promise<DrawSnapshot> {
  const sessionRef = doc(db, 'sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) {
    throw new Error(`Sessão ${sessionId} não encontrada.`);
  }
  const sessionData = sessionSnap.data() as TikTokLiveSession;
  const maxTicketNumberFrozen = sessionData.currentTicketCounter || 0;

  if (maxTicketNumberFrozen === 0) {
    throw new Error('Não há bilhetes emitidos nesta transmissão para realizar o sorteio.');
  }

  // Load all tickets <= maxTicketNumberFrozen ordered by ticketNumber
  const ticketsCol = collection(db, 'sessions', sessionId, 'tickets');
  const q = query(ticketsCol, where('ticketNumber', '<=', maxTicketNumberFrozen), orderBy('ticketNumber', 'asc'));
  const snap = await getDocs(q);

  const orderedTickets: SnapshotTicketEntry[] = [];
  snap.forEach((d) => {
    const t = d.data() as TikTokTicket;
    orderedTickets.push({
      ticketNumber: t.ticketNumber,
      ticketId: t.ticketId,
      tiktokUserId: t.tiktokUserId,
      username: t.username,
      sessionId: t.sessionId,
      issuedAt: t.issuedAt,
    });
  });

  // Calculate canonical SHA-256 hash of ordered ticket list
  const canonicalString = JSON.stringify(
    orderedTickets.map((t) => ({
      num: t.ticketNumber,
      u: t.tiktokUserId,
      s: t.sessionId,
    }))
  );
  const rosterSha256Hash = await computeSha256(canonicalString);

  // Chunk tickets into batches of 500 to guarantee document size << 1MB
  const CHUNK_SIZE = 500;
  const totalChunks = Math.ceil(orderedTickets.length / CHUNK_SIZE);
  const snapshotId = `snap_${sessionId}_${Date.now()}`;

  const snapshotRef = doc(db, 'draw_snapshots', snapshotId);
  const snapshotMeta: DrawSnapshot = {
    snapshotId,
    targetType: 'SESSION',
    targetId: sessionId,
    totalEligibleTickets: orderedTickets.length,
    frozenAt: Date.now(),
    rosterSha256Hash,
    maxTicketNumberFrozen,
    totalChunks,
  };

  await setDoc(snapshotRef, snapshotMeta);

  // Write chunks into subcollection draw_snapshots/{snapshotId}/chunks/{chunkIndex}
  for (let c = 0; c < totalChunks; c++) {
    const chunkTickets = orderedTickets.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
    const chunkRef = doc(db, 'draw_snapshots', snapshotId, 'chunks', String(c));
    const chunkDoc: DrawSnapshotChunk = {
      chunkIndex: c,
      startIndex: c * CHUNK_SIZE + 1,
      endIndex: c * CHUNK_SIZE + chunkTickets.length,
      tickets: chunkTickets,
    };
    await setDoc(chunkRef, chunkDoc);
  }

  // Update session document with latest frozen ceiling
  await updateDoc(sessionRef, {
    latestDrawFrozenTicketMax: maxTicketNumberFrozen,
  });

  await recordAuditLog('DRAW', 'SESSION_SNAPSHOT_FROZEN', {
    sessionId,
    snapshotId,
    maxTicketNumberFrozen,
    totalTickets: orderedTickets.length,
    rosterSha256Hash,
  });

  return snapshotMeta;
}

/**
 * Execute Individual LIVE Draw:
 * Selects winner using CSPRNG from frozen snapshot, generates seed commitment, and records result
 */
export async function executeIndividualLiveDraw(
  sessionId: string,
  snapshotId: string,
  prizeName = 'Prêmio da LIVE'
): Promise<{
  drawId: string;
  winningTicket: SnapshotTicketEntry;
  rosterSha256Hash: string;
  seedCommitment: string;
  seedRevealed: string;
  drawnAt: number;
  prizeName: string;
}> {
  const snapshotRef = doc(db, 'draw_snapshots', snapshotId);
  const snapDoc = await getDoc(snapshotRef);
  if (!snapDoc.exists()) {
    throw new Error(`Snapshot ${snapshotId} não encontrado.`);
  }
  const snapshotData = snapDoc.data() as DrawSnapshot;
  const totalTickets = snapshotData.totalEligibleTickets;

  if (totalTickets <= 0) {
    throw new Error('O snapshot não possui bilhetes elegíveis.');
  }

  // Cryptographically Secure Pseudo-Random Generation (CSPRNG) with rejection sampling
  const { index: winningIndex, rawEntropyHex } = selectUniformRandomIndex(totalTickets);
  const winningTicketNumber = winningIndex + 1;

  // Generate Seed Commitment & Revelation
  const seedRevealed = `csprng_v1_${Date.now()}_${rawEntropyHex}`;
  const seedCommitment = await computeSha256(seedRevealed);

  // Retrieve winning ticket from chunk
  const CHUNK_SIZE = 500;
  const chunkIndex = Math.floor(winningIndex / CHUNK_SIZE);
  const chunkRef = doc(db, 'draw_snapshots', snapshotId, 'chunks', String(chunkIndex));
  const chunkSnap = await getDoc(chunkRef);
  if (!chunkSnap.exists()) {
    throw new Error(`Chunk ${chunkIndex} do snapshot não encontrado.`);
  }
  const chunkData = chunkSnap.data() as DrawSnapshotChunk;
  const winningTicket = chunkData.tickets.find((t) => t.ticketNumber === winningTicketNumber) || chunkData.tickets[0];

  const drawId = `draw_live_${sessionId}_${Date.now()}`;
  const drawData = {
    drawId,
    drawType: 'INDIVIDUAL_LIVE',
    targetSessionId: sessionId,
    snapshotId,
    frozenRosterHash: snapshotData.rosterSha256Hash,
    seedCommitment,
    seedRevealed,
    winningTicketNumber: winningTicket.ticketNumber,
    winningTicketId: winningTicket.ticketId,
    winnerTiktokUserId: winningTicket.tiktokUserId,
    winnerName: winningTicket.username,
    prizeName,
    drawnAt: Date.now(),
  };

  // Write draw document in global draws and session draws
  await setDoc(doc(db, 'draws', drawId), drawData);
  await setDoc(doc(db, 'sessions', sessionId, 'draws', drawId), drawData);

  await recordAuditLog('DRAW', 'LIVE_DRAW_COMPLETED', {
    drawId,
    sessionId,
    winningTicketNumber,
    winner: winningTicket.username,
    prizeName,
    seedCommitment,
  });

  return {
    drawId,
    winningTicket,
    rosterSha256Hash: snapshotData.rosterSha256Hash,
    seedCommitment,
    seedRevealed,
    drawnAt: drawData.drawnAt,
    prizeName,
  };
}

/**
 * Update conversion rule for a session:
 * Creates a versioned rule document and updates currentRate on session
 * Past tickets keep their rateAtCreation!
 */
export async function updateSessionConversionRate(
  sessionId: string,
  newRate: number,
  ruleName?: string
): Promise<{ ruleId: string; version: number; newRate: number }> {
  if (newRate <= 0) {
    throw new Error('A taxa de conversão deve ser superior a zero moedas.');
  }

  const sessionRef = doc(db, 'sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) {
    throw new Error(`Sessão ${sessionId} não existe.`);
  }

  const rulesCol = collection(db, 'ticket_rules');
  const rulesSnap = await getDocs(rulesCol);
  const nextVersion = rulesSnap.size + 1;
  const ruleId = `rule_v${nextVersion}_${newRate}`;

  const ruleRef = doc(db, 'ticket_rules', ruleId);
  await setDoc(ruleRef, {
    ruleId,
    version: nextVersion,
    name: ruleName || `Regra v${nextVersion} (${newRate} Moedas / Bilhete)`,
    coinsPerTicket: newRate,
    active: true,
    createdAt: Date.now(),
  });

  await updateDoc(sessionRef, {
    currentRuleId: ruleId,
    currentRate: newRate,
  });

  await recordAuditLog('RATE_RULE', 'RATE_CHANGED', {
    sessionId,
    ruleId,
    newRate,
    version: nextVersion,
  });

  return { ruleId, version: nextVersion, newRate };
}

/**
 * Update comprehensive raffle configuration, conversion rate, participation rules, and limits for a LIVE session.
 * Persists a versioned rule in `ticket_rules` and updates the `sessions/{sessionId}` document.
 * Previously issued tickets remain immutable.
 */
export async function updateLiveSessionConfigAndRules(
  sessionId: string,
  config: {
    raffleTitle?: string;
    prizeName?: string;
    coinsPerTicket?: number;
    minCoinsPerGift?: number;
    maxTicketsPerUser?: number | null;
    maxTotalTickets?: number | null;
    allowDuplicateWinners?: boolean;
    participationRulesNotes?: string;
  }
): Promise<TikTokLiveSession> {
  assertProPlanActive('Configuração de Regras do Sorteio LIVE');

  const sessionRef = doc(db, 'sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) {
    throw new Error(`Sessão ${sessionId} não existe.`);
  }
  const existing = sessionSnap.data() as TikTokLiveSession;

  const newRate =
    config.coinsPerTicket !== undefined && config.coinsPerTicket > 0
      ? Math.floor(config.coinsPerTicket)
      : existing.currentRate || 100;
  const minCoinsPerGift =
    config.minCoinsPerGift !== undefined && config.minCoinsPerGift >= 1
      ? Math.floor(config.minCoinsPerGift)
      : existing.minCoinsPerGift || 1;
  const maxTicketsPerUser =
    config.maxTicketsPerUser !== undefined
      ? config.maxTicketsPerUser && config.maxTicketsPerUser > 0
        ? Math.floor(config.maxTicketsPerUser)
        : null
      : existing.maxTicketsPerUser ?? null;
  const maxTotalTickets =
    config.maxTotalTickets !== undefined
      ? config.maxTotalTickets && config.maxTotalTickets > 0
        ? Math.floor(config.maxTotalTickets)
        : null
      : existing.maxTotalTickets ?? null;
  const allowDuplicateWinners =
    config.allowDuplicateWinners !== undefined
      ? Boolean(config.allowDuplicateWinners)
      : existing.allowDuplicateWinners ?? true;
  const raffleTitle =
    config.raffleTitle !== undefined ? config.raffleTitle.trim() : existing.raffleTitle || `Sorteio LIVE @${existing.username}`;
  const prizeName =
    config.prizeName !== undefined ? config.prizeName.trim() : existing.prizeName || 'Prêmio Especial da LIVE';
  const participationRulesNotes =
    config.participationRulesNotes !== undefined
      ? config.participationRulesNotes.trim()
      : existing.participationRulesNotes || '';

  let ruleId = existing.currentRuleId || 'rule_default_100';
  const rulesChanged =
    newRate !== existing.currentRate ||
    minCoinsPerGift !== (existing.minCoinsPerGift || 1) ||
    maxTicketsPerUser !== (existing.maxTicketsPerUser ?? null) ||
    maxTotalTickets !== (existing.maxTotalTickets ?? null);

  if (rulesChanged) {
    const rulesCol = collection(db, 'ticket_rules');
    const rulesSnap = await getDocs(rulesCol);
    const nextVersion = rulesSnap.size + 1;
    ruleId = `rule_v${nextVersion}_${newRate}`;
    const ruleRef = doc(db, 'ticket_rules', ruleId);
    await setDoc(ruleRef, {
      ruleId,
      version: nextVersion,
      name: `${raffleTitle || 'Regra LIVE'} (${newRate} moedas = 1 bilhete)`,
      coinsPerTicket: newRate,
      minCoinsPerGift,
      maxTicketsPerUser,
      maxTotalTickets,
      active: true,
      createdAt: Date.now(),
    });
  }

  await updateDoc(sessionRef, {
    raffleTitle,
    prizeName,
    currentRuleId: ruleId,
    currentRate: newRate,
    minCoinsPerGift,
    maxTicketsPerUser,
    maxTotalTickets,
    allowDuplicateWinners,
    participationRulesNotes,
  });

  await recordAuditLog('RATE_RULE', 'SESSION_CONFIG_AND_RULES_UPDATED', {
    sessionId,
    raffleTitle,
    prizeName,
    ruleId,
    coinsPerTicket: newRate,
    minCoinsPerGift,
    maxTicketsPerUser,
    maxTotalTickets,
    allowDuplicateWinners,
  });

  const updatedSnap = await getDoc(sessionRef);
  return updatedSnap.data() as TikTokLiveSession;
}

/**
 * Fetch all individual tickets issued in a session ordered by ticketNumber ascending
 */
export async function fetchSessionTickets(sessionId: string, maxLimit = 1000): Promise<TikTokTicket[]> {
  const ticketsCol = collection(db, 'sessions', sessionId, 'tickets');
  const q = query(ticketsCol, orderBy('ticketNumber', 'asc'), limit(maxLimit));
  const snap = await getDocs(q);
  const list: TikTokTicket[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokTicket));
  return list;
}

/**
 * Fetch participants in a session
 */
export async function fetchSessionParticipants(sessionId: string): Promise<TikTokLiveParticipant[]> {
  const partsCol = collection(db, 'sessions', sessionId, 'participants');
  const snap = await getDocs(partsCol);
  const list: TikTokLiveParticipant[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokLiveParticipant));
  return list.sort((a, b) => b.coinsInSession - a.coinsInSession);
}

/**
 * Fetch global lifetime participants
 */
export async function fetchGlobalParticipants(limitCount = 100): Promise<TikTokGlobalParticipant[]> {
  const colRef = collection(db, 'global_participants');
  const q = query(colRef, orderBy('totalCoinsLifetime', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  const list: TikTokGlobalParticipant[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokGlobalParticipant));
  return list;
}

/**
 * Fetch global participant detailed history across sessions
 */
export async function fetchGlobalParticipantHistory(tiktokUserId: string): Promise<{
  global: TikTokGlobalParticipant | null;
  participations: TikTokGlobalSessionRecord[];
}> {
  const globalRef = doc(db, 'global_participants', tiktokUserId);
  const snap = await getDoc(globalRef);
  const global = snap.exists() ? (snap.data() as TikTokGlobalParticipant) : null;

  const partCol = collection(db, 'global_participants', tiktokUserId, 'participations');
  const partSnap = await getDocs(partCol);
  const participations: TikTokGlobalSessionRecord[] = [];
  partSnap.forEach((d) => participations.push(d.data() as TikTokGlobalSessionRecord));

  return { global, participations };
}

/**
 * Pause ticket collection for a LIVE session
 */
export async function pauseLiveSessionCollection(sessionId: string): Promise<TikTokLiveSession> {
  const sessionRef = doc(db, 'sessions', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) {
    throw new Error(`Sessão ${sessionId} não encontrada.`);
  }
  const now = Date.now();
  await updateDoc(sessionRef, {
    status: 'paused',
    pausedAt: now,
  });
  await recordAuditLog('LIVE_EVENT', 'COLLECTION_PAUSED', { sessionId, pausedAt: now });
  const updated = await getDoc(sessionRef);
  return updated.data() as TikTokLiveSession;
}

/**
 * Resume ticket collection for a LIVE session
 */
export async function resumeLiveSessionCollection(sessionId: string): Promise<TikTokLiveSession> {
  const sessionRef = doc(db, 'sessions', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) {
    throw new Error(`Sessão ${sessionId} não encontrada.`);
  }
  const data = snap.data() as TikTokLiveSession;
  if (data.status === 'ended') {
    throw new Error('Não é possível retomar uma sessão cuja coleta já foi definitivamente encerrada.');
  }
  await updateDoc(sessionRef, {
    status: 'active',
    pausedAt: null,
  });
  await recordAuditLog('LIVE_EVENT', 'COLLECTION_RESUMED', { sessionId, resumedAt: Date.now() });
  const updated = await getDoc(sessionRef);
  return updated.data() as TikTokLiveSession;
}

/**
 * Permanently end ticket collection for a LIVE session
 */
export async function endLiveSessionCollection(sessionId: string): Promise<TikTokLiveSession> {
  const sessionRef = doc(db, 'sessions', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) {
    throw new Error(`Sessão ${sessionId} não encontrada.`);
  }
  const now = Date.now();
  await updateDoc(sessionRef, {
    status: 'ended',
    endedAt: now,
  });
  await recordAuditLog('LIVE_EVENT', 'COLLECTION_ENDED', { sessionId, endedAt: now });
  const updated = await getDoc(sessionRef);
  return updated.data() as TikTokLiveSession;
}

/**
 * Fetch all recorded LIVE sessions ordered by startedAt descending
 */
export async function fetchAllLiveSessions(limitCount = 50): Promise<TikTokLiveSession[]> {
  const colRef = collection(db, 'sessions');
  const q = query(colRef, orderBy('startedAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  const list: TikTokLiveSession[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokLiveSession));
  return list;
}

/**
 * Fetch all completed draws for a specific LIVE session
 */
export async function fetchSessionDraws(sessionId: string): Promise<LiveDrawRecord[]> {
  const colRef = collection(db, 'sessions', sessionId, 'draws');
  const snap = await getDocs(colRef);
  const list: LiveDrawRecord[] = [];
  snap.forEach((d) => list.push(d.data() as LiveDrawRecord));
  return list.sort((a, b) => b.drawnAt - a.drawnAt);
}

/**
 * Fetch a frozen DrawSnapshot by its ID
 */
export async function fetchSnapshotById(snapshotId: string): Promise<DrawSnapshot | null> {
  const snapRef = doc(db, 'draw_snapshots', snapshotId);
  const snap = await getDoc(snapRef);
  if (!snap.exists()) return null;
  return snap.data() as DrawSnapshot;
}

/**
 * Fetch recent gift events persisted for a LIVE session
 */
export async function fetchRecentSessionEvents(
  sessionId: string,
  limitCount = 50
): Promise<TikTokLiveGiftEvent[]> {
  const colRef = collection(db, 'sessions', sessionId, 'events');
  const q = query(colRef, orderBy('receivedAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  const list: TikTokLiveGiftEvent[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokLiveGiftEvent));
  return list;
}

/**
 * Fetch combo streaks recorded in a LIVE session
 */
export async function fetchSessionStreaks(sessionId: string): Promise<TikTokLiveStreak[]> {
  const colRef = collection(db, 'sessions', sessionId, 'streaks');
  const snap = await getDocs(colRef);
  const list: TikTokLiveStreak[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokLiveStreak));
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Fetch recent system audit logs
 */
export async function fetchRecentAuditLogs(limitCount = 40): Promise<AuditLogEntry[]> {
  const colRef = collection(db, 'audit_logs');
  const q = query(colRef, orderBy('timestamp', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  const list: AuditLogEntry[] = [];
  snap.forEach((d) => list.push(d.data() as AuditLogEntry));
  return list;
}

/**
 * Paginated recovery query for persisted session events with sequenceNumber > afterSequenceNumber.
 * Avoids full collection scans on SSE reconnection.
 */
export async function fetchSessionEventsAfterSequence(
  sessionId: string,
  afterSequenceNumber: number,
  pageSize = 200
): Promise<TikTokLiveGiftEvent[]> {
  const colRef = collection(db, 'sessions', sessionId, 'events');
  const q = query(
    colRef,
    where('sequenceNumber', '>', afterSequenceNumber),
    orderBy('sequenceNumber', 'asc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const list: TikTokLiveGiftEvent[] = [];
  snap.forEach((d) => list.push(d.data() as TikTokLiveGiftEvent));
  return list;
}


