import assert from 'node:assert/strict';

// Must be set BEFORE importing server.ts so startServer() and background timers do not auto-start
process.env.GIO_TEST_MODE = 'true';

import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  setCustomTokenVerifierForTests,
  setCustomFirestoreResourceReaderForTests,
} from '../src/server/firebaseAdminAuth.ts';
import { mercadoPagoSubscriptionService } from '../src/server/mercadoPagoSubscriptionService.ts';
import { tiktokAdapter } from '../src/server/tiktokLiveAdapter.ts';
import { tiktokEventQueue } from '../src/server/tiktokEventQueue.ts';
import {
  getProPlanEntitlement,
  setProPlanTier,
  assertProPlanActive,
  registerSessionOwner,
  clearOrganizerPlanStatesForTests,
} from '../src/utils/tiktokLiveService.ts';
import {
  app,
  acquireOrCoalesceWebcastLock,
  releaseWebcastLock,
  renewWebcastLeaseTransaction,
  setServerRuntimeTestHooks,
  getServerRuntimeTestState,
  resetServerRuntimeStateForTests,
  type PersistedWebcastRuntimeState,
  type WebcastLockTxContext,
} from '../server.ts';

const UID_OWNER_A = 'uid_organizer_alpha_001';
const EMAIL_OWNER_A = 'gustakkg15@gmail.com'; // Authorized Super Admin & Organizer A

const UID_OWNER_B = 'uid_organizer_bravo_002';
const EMAIL_OWNER_B = 'bravo_organizer@example.com'; // Non-admin PRO Organizer B

const UID_ADMIN_DIAG = 'uid_admin_diag_003';
const EMAIL_ADMIN_DIAG = 'gustakkg15@gmail.com';

const SESSION_A = 'live_session_alpha_101';
const SESSION_B = 'live_session_bravo_202';
const SESSION_NON_EXISTENT = 'live_session_inexistente_999';

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function seedProSubscription(uid: string, email: string) {
  const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
    uid,
    email,
    emailVerified: true,
    planId: 'pro_monthly',
    planName: 'GIO DA SORTE PRO Mensal',
    tier: 'PRO',
    statusState: 'ACTIVE',
    billingSubStatus: 'PAID_ACTIVE',
    mpPreapprovalId: `pre_${uid}`,
    mpPlanId: 'mp_plan_mensal',
    remoteMpStatus: 'authorized',
    checkoutInitPoint: null,
    contractedPriceVersion: 'v1.0.0',
    contractedAmount: 49.9,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    trialApplied: false,
    trialDaysGranted: 0,
    trialStartDate: null,
    trialEndDate: null,
    firstPaymentDate: new Date().toISOString(),
    nextPaymentDate: futureEnd,
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: futureEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    hasUsedFreeTrial: true,
    firstTrialStartedAt: null,
    firstTrialPreapprovalId: null,
    firstTrialPlanId: null,
    acceptedTermsVersion: '1.0.0',
    acceptedAt: Date.now(),
    chargedQuantity: 1,
    chargedAmount: 49.9,
    updatedAt: Date.now(),
  });
}

async function seedFreeSubscription(uid: string, email: string) {
  await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
    uid,
    email,
    emailVerified: true,
    planId: null,
    planName: 'Plano FREE',
    tier: 'FREE',
    statusState: 'FREE',
    billingSubStatus: 'FREE_TIER',
    mpPreapprovalId: null,
    mpPlanId: null,
    remoteMpStatus: null,
    checkoutInitPoint: null,
    contractedPriceVersion: 'v1.0.0',
    contractedAmount: 0,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    trialApplied: false,
    trialDaysGranted: 0,
    trialStartDate: null,
    trialEndDate: null,
    firstPaymentDate: null,
    nextPaymentDate: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    hasUsedFreeTrial: false,
    firstTrialStartedAt: null,
    firstTrialPreapprovalId: null,
    firstTrialPlanId: null,
    acceptedTermsVersion: '1.0.0',
    acceptedAt: null,
    chargedQuantity: 0,
    chargedAmount: 0,
    updatedAt: Date.now(),
  });
}

async function runTests() {
  console.log('=== INICIANDO SUÍTE DE TESTES FASE 1.3.2 (HANDLERS REAIS + ISOLAMENTO + CONCORRÊNCIA) ===');

  // 1. Setup token verifier for test identities
  setCustomTokenVerifierForTests(async (token: string): Promise<DecodedIdToken> => {
    const nowSec = Math.floor(Date.now() / 1000);
    if (token === 'valid_token_owner_a_admin') {
      return {
        uid: UID_OWNER_A,
        sub: UID_OWNER_A,
        email: EMAIL_OWNER_A,
        email_verified: true,
        admin: true,
        role: 'admin',
        auth_time: nowSec - 60,
        iat: nowSec - 60,
        exp: nowSec + 3600,
        aud: 'gio-test',
        iss: 'https://securetoken.google.com/gio-test',
        firebase: { identities: {}, sign_in_provider: 'google.com' },
      } as DecodedIdToken;
    }
    if (token === 'valid_token_owner_b_non_admin') {
      return {
        uid: UID_OWNER_B,
        sub: UID_OWNER_B,
        email: EMAIL_OWNER_B,
        email_verified: true,
        auth_time: nowSec - 60,
        iat: nowSec - 60,
        exp: nowSec + 3600,
        aud: 'gio-test',
        iss: 'https://securetoken.google.com/gio-test',
        firebase: { identities: {}, sign_in_provider: 'password' },
      };
    }
    if (token === 'valid_token_admin_diag') {
      return {
        uid: UID_ADMIN_DIAG,
        sub: UID_ADMIN_DIAG,
        email: EMAIL_ADMIN_DIAG,
        email_verified: true,
        admin: true,
        role: 'admin',
        auth_time: nowSec - 60,
        iat: nowSec - 60,
        exp: nowSec + 3600,
        aud: 'gio-test',
        iss: 'https://securetoken.google.com/gio-test',
        firebase: { identities: {}, sign_in_provider: 'google.com' },
      } as DecodedIdToken;
    }
    const err = new Error('Firebase ID token is invalid.') as Error & { code: string };
    err.code = 'auth/argument-error';
    throw err;
  });

  // 2. Setup controllable in-memory Firestore session documents & transactional lock store
  const sessionStore = new Map<string, Record<string, any>>();
  const resetSessionStore = () => {
    sessionStore.clear();
    sessionStore.set(SESSION_A, {
      sessionId: SESSION_A,
      ownerUid: UID_OWNER_A,
      username: 'creator_alpha',
      status: 'active',
      currentRuleId: 'rule_default_100',
      currentRate: 100,
    });
    sessionStore.set(SESSION_B, {
      sessionId: SESSION_B,
      ownerUid: UID_OWNER_B,
      username: 'creator_bravo',
      status: 'active',
      currentRuleId: 'rule_default_100',
      currentRate: 100,
    });
  };
  resetSessionStore();

  setCustomFirestoreResourceReaderForTests(async (collectionName, docId) => {
    if (collectionName === 'sessions') {
      const docData = sessionStore.get(docId);
      if (docData) {
        return { exists: true, data: { ...docData } };
      }
      return { exists: false };
    }
    return { exists: false };
  });

  // Transactional lock store with serializable atomic execution
  let persistedLockStore: PersistedWebcastRuntimeState | null = null;
  const getPersistedLock = (): PersistedWebcastRuntimeState | null => persistedLockStore;
  let txMutexChain: Promise<unknown> = Promise.resolve();

  const defaultLockTxRunner = async <T>(
    fn: (tx: WebcastLockTxContext) => Promise<T>
  ): Promise<T> => {
    const runAtomic = async () => {
      const snapshot = persistedLockStore ? { ...persistedLockStore } : null;
      let stagedWrite: PersistedWebcastRuntimeState | null | undefined = undefined;
      const out = await fn({
        get: async () => (snapshot ? { ...snapshot } : null),
        set: (nextState: PersistedWebcastRuntimeState) => {
          stagedWrite = { ...nextState };
        },
      });
      if (stagedWrite !== undefined) {
        persistedLockStore = stagedWrite;
      }
      return out;
    };
    const next = txMutexChain.then(runAtomic, runAtomic);
    txMutexChain = next.catch(() => {});
    return next;
  };

  const resetAllTestRuntime = async () => {
    persistedLockStore = null;
    clearOrganizerPlanStatesForTests();
    resetSessionStore();
    resetServerRuntimeStateForTests();
    await seedProSubscription(UID_OWNER_A, EMAIL_OWNER_A);
    await seedProSubscription(UID_OWNER_B, EMAIL_OWNER_B);
    await seedProSubscription(UID_ADMIN_DIAG, EMAIL_ADMIN_DIAG);

    setServerRuntimeTestHooks({
      customLockTxRunner: defaultLockTxRunner,
      customLockReader: async () => (persistedLockStore ? { ...persistedLockStore } : null),
      customLockWriter: async (state) => {
        persistedLockStore = { ...state };
      },
      customGetOrCreateLiveSession: async (sid, username, rate, ruleId, ownerUid) => {
        const existing = sessionStore.get(sid);
        const created = {
          sessionId: sid,
          ownerUid: ownerUid || existing?.ownerUid || UID_OWNER_A,
          username: username.replace(/^@/, ''),
          tiktokUserId: username.replace(/^@/, ''),
          status: 'active' as const,
          startedAt: Date.now(),
          totalCoins: 0,
          totalGiftsCount: 0,
          uniqueSupportersCount: 0,
          currentRuleId: ruleId || 'rule_default_100',
          currentRate: rate || 100,
          currentTicketCounter: 0,
        };
        sessionStore.set(sid, created);
        if (created.ownerUid) {
          registerSessionOwner(sid, created.ownerUid);
        }
        return created;
      },
      customRestoreSessionFromFirestore: async (sid) => {
        const sData = sessionStore.get(sid);
        if (sData) {
          (tiktokAdapter as any).currentSessionId = sid;
          (tiktokAdapter as any).currentUsername = sData.username || 'creator';
          tiktokAdapter.setCurrentOwnerUid(sData.ownerUid || '');
        }
        return {
          restoredStreaks: 2,
          restoredEvents: 5,
          sessionFound: Boolean(sData),
          ownerUid: sData?.ownerUid,
          username: sData?.username || 'creator',
          activeRuleId: sData?.currentRuleId || 'rule_default_100',
          currentRate: sData?.currentRate || 100,
        };
      },
      customAdapterConnect: async (username, sid, ruleId, rate) => {
        (tiktokAdapter as any).currentUsername = username.replace(/^@/, '');
        (tiktokAdapter as any).currentSessionId = sid;
        (tiktokAdapter as any).activeRuleId = ruleId || 'rule_default_100';
        (tiktokAdapter as any).activeRate = rate || 100;
        (tiktokAdapter as any).state = 'CONNECTED';
        return {
          success: true,
          status: tiktokAdapter.getStatus(),
        };
      },
    });
  };

  await resetAllTestRuntime();

  // Bind the REAL Express `app` from `server.ts` on an ephemeral port
  const server = await new Promise< ReturnType<typeof app.listen> >((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // =========================================================================
    // BLOCO 1 — REGRESSÃO P0 NOS HANDLERS REAIS DE `server.ts` (ISO-02 & ISO-03)
    // =========================================================================
    console.log('\n--- BLOCO 1: Regressão P0 nos Handlers Reais de server.ts ---');

    // T01: POST /api/tiktok/test-event sem autenticação -> 401
    {
      const res = await fetch(`${baseUrl}/api/tiktok/test-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_A, giftName: 'Rosa', diamondCount: 1 }),
      });
      assert.equal(res.status, 401);
      console.log('✓ [B1-01] POST /api/tiktok/test-event sem autenticação no handler real -> 401');
    }

    // T02: POST /api/tiktok/test-event autenticado sem admin (Organizer B) -> 403 ADMIN_FORBIDDEN
    {
      const res = await fetch(`${baseUrl}/api/tiktok/test-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B, giftName: 'Rosa', diamondCount: 1 }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.code, 'ADMIN_FORBIDDEN');
      console.log('✓ [B1-02] POST /api/tiktok/test-event sem admin no handler real -> 403 ADMIN_FORBIDDEN');
    }

    // T03: POST /api/tiktok/test-event admin sem sessionId -> 400 INVALID_SESSION_ID
    {
      const res = await fetch(`${baseUrl}/api/tiktok/test-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ giftName: 'Rosa', diamondCount: 1 }),
      });
      const body = await res.json();
      assert.equal(res.status, 400);
      assert.equal(body.code, 'INVALID_SESSION_ID');
      console.log('✓ [B1-03] POST /api/tiktok/test-event sem sessionId no handler real -> 400 INVALID_SESSION_ID');
    }

    // T04: POST /api/tiktok/test-event com sessionId inexistente -> 404 RESOURCE_NOT_FOUND
    {
      const res = await fetch(`${baseUrl}/api/tiktok/test-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_NON_EXISTENT, giftName: 'Rosa', diamondCount: 1 }),
      });
      const body = await res.json();
      assert.equal(res.status, 404);
      assert.equal(body.code, 'RESOURCE_NOT_FOUND');
      console.log('✓ [B1-04] POST /api/tiktok/test-event com sessionId inexistente -> 404 RESOURCE_NOT_FOUND');
    }

    // T05: POST /api/tiktok/test-event com sessionId de outro usuário -> 403 OWNERSHIP_FORBIDDEN
    {
      const res = await fetch(`${baseUrl}/api/tiktok/test-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B, giftName: 'Rosa', diamondCount: 1 }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.code, 'OWNERSHIP_FORBIDDEN');
      console.log('✓ [B1-05] POST /api/tiktok/test-event com sessionId de outro organizador -> 403 OWNERSHIP_FORBIDDEN');
    }

    // T06: POST /api/tiktok/restore-session de sessão de outro usuário -> 403 OWNERSHIP_FORBIDDEN
    {
      const res = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_A }),
      });
      const body = await res.json();
      assert.equal(res.status, 403);
      assert.equal(body.code, 'OWNERSHIP_FORBIDDEN');
      console.log('✓ [B1-06] POST /api/tiktok/restore-session em sessão de outro organizador -> 403 OWNERSHIP_FORBIDDEN');
    }

    // =========================================================================
    // BLOCO 2 — ISOLAMENTO DE PLANOS POR OWNERUID (R-1.3.1-A — 6 CENÁRIOS)
    // =========================================================================
    console.log('\n--- BLOCO 2: Isolamento de Planos por ownerUid (R-1.3.1-A) ---');
    await resetAllTestRuntime();

    // P-01: Organizador A FREE e Organizador B PRO simultâneos
    {
      await seedFreeSubscription(UID_OWNER_A, EMAIL_OWNER_A);
      await seedProSubscription(UID_OWNER_B, EMAIL_OWNER_B);

      const entA = getProPlanEntitlement(UID_OWNER_A);
      const entB = getProPlanEntitlement(UID_OWNER_B);

      assert.equal(entA.tier, 'FREE');
      assert.equal(entA.statusState, 'FREE');
      assert.equal(entA.active, false);

      assert.equal(entB.tier, 'PRO');
      assert.equal(entB.statusState, 'ACTIVE');
      assert.equal(entB.active, true);
      console.log('✓ [P-01] Organizador A (FREE) e Organizador B (PRO) coexistem com estados isolados por ownerUid');
    }

    // P-02: A atualiza assinatura para FREE sem afetar B
    {
      setProPlanTier('PRO', 'ACTIVE', UID_OWNER_A);
      setProPlanTier('PRO', 'ACTIVE', UID_OWNER_B);
      assert.equal(getProPlanEntitlement(UID_OWNER_A).active, true);
      assert.equal(getProPlanEntitlement(UID_OWNER_B).active, true);

      // A muda para FREE
      await seedFreeSubscription(UID_OWNER_A, EMAIL_OWNER_A);

      assert.equal(getProPlanEntitlement(UID_OWNER_A).active, false);
      assert.equal(getProPlanEntitlement(UID_OWNER_B).active, true);
      assert.doesNotThrow(() => assertProPlanActive('Teste B continua PRO', UID_OWNER_B));
      assert.throws(() => assertProPlanActive('Teste A bloqueado FREE', UID_OWNER_A), /PRO_PLAN_REQUIRED/);
      console.log('✓ [P-02] Atualização de assinatura de A para FREE não altera o estado PRO de B');
    }

    // P-03: B continua autorizado a processar presentes no listener onGift enquanto A está bloqueado
    {
      registerSessionOwner(SESSION_A, UID_OWNER_A);
      registerSessionOwner(SESSION_B, UID_OWNER_B);

      const enqueuedForSessions: string[] = [];
      const origEnqueue = tiktokEventQueue.enqueueGiftEvent.bind(tiktokEventQueue);
      tiktokEventQueue.enqueueGiftEvent = ((event: any, perfStart?: number) => {
        enqueuedForSessions.push(`${event.sessionId}:${event.ownerUid}`);
        return origEnqueue(event, perfStart, { skipPersistence: true });
      }) as typeof tiktokEventQueue.enqueueGiftEvent;

      try {
        // Presente na sessão de B (PRO) -> Deve ser aceito e enfileirado em tiktokEventQueue
        tiktokAdapter.setCurrentOwnerUid(UID_OWNER_B);
        const outB = tiktokAdapter.handleIncomingGift(
          {
            sessionId: SESSION_B,
            ownerUid: UID_OWNER_B,
            uniqueId: 'viewer_b1',
            userId: '90001',
            giftId: 5655,
            giftName: 'Rosa',
            diamondCount: 10,
            repeatCount: 1,
            repeatEnd: true,
          },
          'SIMULATED_TEST'
        );
        assert.equal(outB.accepted, true);
        assert.equal(enqueuedForSessions.includes(`${SESSION_B}:${UID_OWNER_B}`), true);

        // Presente na sessão de A (FREE) -> onGift deve barrar antes de enfileirar no tiktokEventQueue
        tiktokAdapter.setCurrentOwnerUid(UID_OWNER_A);
        tiktokAdapter.handleIncomingGift(
          {
            sessionId: SESSION_A,
            ownerUid: UID_OWNER_A,
            uniqueId: 'viewer_a1',
            userId: '90002',
            giftId: 5655,
            giftName: 'Rosa',
            diamondCount: 10,
            repeatCount: 1,
            repeatEnd: true,
          },
          'SIMULATED_TEST'
        );
        assert.equal(enqueuedForSessions.some((x) => x.startsWith(`${SESSION_A}:`)), false);
      } finally {
        tiktokEventQueue.enqueueGiftEvent = origEnqueue;
      }
      console.log('✓ [P-03] Organizador B (PRO) processa e enfileira presentes normalmente enquanto A (FREE) é bloqueado');
    }

    // P-04: Execução de test-event administrativo não altera entitlement de A nem de B
    {
      // A é FREE, B é PRO, Admin Diag (UID_ADMIN_DIAG) é PRO e dono da sessão diag
      const SESSION_DIAG = 'live_session_diag_303';
      sessionStore.set(SESSION_DIAG, {
        sessionId: SESSION_DIAG,
        ownerUid: UID_ADMIN_DIAG,
        username: 'creator_diag',
        status: 'active',
        currentRuleId: 'rule_default_100',
        currentRate: 100,
      });
      await seedFreeSubscription(UID_OWNER_A, EMAIL_OWNER_A);
      await seedProSubscription(UID_OWNER_B, EMAIL_OWNER_B);
      await seedProSubscription(UID_ADMIN_DIAG, EMAIL_ADMIN_DIAG);

      const origEnqueue = tiktokEventQueue.enqueueGiftEvent.bind(tiktokEventQueue);
      tiktokEventQueue.enqueueGiftEvent = ((event: any, perfStart?: number) => {
        return origEnqueue(event, perfStart, { skipPersistence: true });
      }) as typeof tiktokEventQueue.enqueueGiftEvent;

      try {
        const res = await fetch(`${baseUrl}/api/tiktok/test-event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid_token_admin_diag',
          },
          body: JSON.stringify({
            sessionId: SESSION_DIAG,
            uniqueId: 'apoiador_diag',
            userId: '77701',
            giftId: 5655,
            giftName: 'Rosa',
            diamondCount: 5,
            repeatCount: 1,
            repeatEnd: true,
          }),
        });
        assert.equal(res.status, 200);

        // Verificar que o entitlement de A continua FREE e o de B continua PRO
        assert.equal(getProPlanEntitlement(UID_OWNER_A).tier, 'FREE');
        assert.equal(getProPlanEntitlement(UID_OWNER_A).active, false);
        assert.equal(getProPlanEntitlement(UID_OWNER_B).tier, 'PRO');
        assert.equal(getProPlanEntitlement(UID_OWNER_B).active, true);
      } finally {
        tiktokEventQueue.enqueueGiftEvent = origEnqueue;
      }
      console.log('✓ [P-04] Execução de POST /api/tiktok/test-event administrativo não altera entitlement de A nem de B');
    }

    // P-05: Expiração de A não afeta B
    {
      await seedProSubscription(UID_OWNER_A, EMAIL_OWNER_A);
      await seedProSubscription(UID_OWNER_B, EMAIL_OWNER_B);
      assert.equal(getProPlanEntitlement(UID_OWNER_A).active, true);
      assert.equal(getProPlanEntitlement(UID_OWNER_B).active, true);

      // Simular expiração do período de A (> 24h após currentPeriodEnd)
      const pastDate = new Date(Date.now() - 48 * 3600_000).toISOString();
      const recA = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(UID_OWNER_A);
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        ...recA,
        currentPeriodEnd: pastDate,
        nextPaymentDate: pastDate,
        remoteMpStatus: 'authorized',
        cancelAtPeriodEnd: false,
      });

      const entAAfter = getProPlanEntitlement(UID_OWNER_A);
      const entBAfter = getProPlanEntitlement(UID_OWNER_B);

      assert.equal(entAAfter.statusState, 'EXPIRED');
      assert.equal(entAAfter.tier, 'FREE');
      assert.equal(entAAfter.active, false);
      assert.equal(entBAfter.statusState, 'ACTIVE');
      assert.equal(entBAfter.tier, 'PRO');
      assert.equal(entBAfter.active, true);
      console.log('✓ [P-05] Expiração da assinatura de A rebaixa apenas A (EXPIRED/FREE) sem afetar B (ACTIVE/PRO)');
    }

    // P-06: Operações de A (FREE) bloqueadas e impedidas de acessar dados de B
    {
      // A (FREE) tenta chamar restore-session na sessão de B -> bloqueado por requireProPlan (403 PRO_PLAN_REQUIRED)
      const resRestoreFree = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });
      const bodyFree = await resRestoreFree.json();
      assert.equal(resRestoreFree.status, 403);
      assert.equal(bodyFree.code, 'PRO_PLAN_REQUIRED');

      // Mesmo quando A volta a ser PRO, A não acessa a sessão de B -> 403 OWNERSHIP_FORBIDDEN
      await seedProSubscription(UID_OWNER_A, EMAIL_OWNER_A);
      const resCrossOwner = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });
      const bodyCrossOwner = await resCrossOwner.json();
      assert.equal(resCrossOwner.status, 403);
      assert.equal(bodyCrossOwner.code, 'OWNERSHIP_FORBIDDEN');
      console.log('✓ [P-06] Operações de A não acessam dados nem sessões de B (PRO_PLAN_REQUIRED / OWNERSHIP_FORBIDDEN)');
    }

    // P-07: Usuário FREE sem documento prévio no Firestore recebe FREE/FREE via getUserSubscriptionRecord (P1-ISO-A1)
    {
      const UID_NEW_USER = 'uid_new_unregistered_organizer_999';
      const subRec = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(UID_NEW_USER);
      assert.equal(subRec.tier, 'FREE');
      assert.equal(subRec.statusState, 'FREE');

      const entNew = getProPlanEntitlement(UID_NEW_USER);
      assert.equal(entNew.tier, 'FREE');
      assert.equal(entNew.statusState, 'FREE');
      assert.equal(entNew.active, false);
      assert.throws(() => assertProPlanActive('Teste novo usuário sem PRO', UID_NEW_USER), /PRO_PLAN_REQUIRED/);
      console.log('✓ [P-07] Usuário sem documento no Firestore recebe plano FREE/FREE seguro (P1-ISO-A1)');
    }

    // P-08: Usuário não registrado após restart simulado recebe FREE/FREE e assertProPlanActive sem ownerUid falha no servidor (P1-ISO-A2)
    {
      clearOrganizerPlanStatesForTests();
      const UID_UNKNOWN = 'uid_never_seen_organizer_888';
      const entUnknown = getProPlanEntitlement(UID_UNKNOWN);
      assert.equal(entUnknown.tier, 'FREE');
      assert.equal(entUnknown.statusState, 'FREE');
      assert.equal(entUnknown.active, false);
      assert.throws(() => assertProPlanActive('Teste unknown', UID_UNKNOWN), /PRO_PLAN_REQUIRED/);

      // No backend (Node.js), chamar assertProPlanActive sem ownerUid DEVE lançar exceção
      assert.throws(() => assertProPlanActive('Teste sem ownerUid no backend'), /PRO_PLAN_REQUIRED/);
      console.log('✓ [P-08] Fallback para usuário não registrado é fail-closed (FREE) e sem ownerUid falha no backend (P1-ISO-A2)');
    }

    // P-09: POST /api/tiktok/plan/tier sem uid retorna 400 INVALID_OWNER_UID e com uid altera apenas o organizador alvo
    {
      // 1. Sem uid no body -> 400 INVALID_OWNER_UID
      const resNoUid = await fetch(`${baseUrl}/api/tiktok/plan/tier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ tier: 'FREE' }),
      });
      const bodyNoUid = await resNoUid.json();
      assert.equal(resNoUid.status, 400);
      assert.equal(bodyNoUid.code, 'INVALID_OWNER_UID');

      // 2. Com uid do próprio A -> 200 e altera somente A
      await seedProSubscription(UID_OWNER_A, EMAIL_OWNER_A);
      await seedProSubscription(UID_OWNER_B, EMAIL_OWNER_B);

      const resWithUid = await fetch(`${baseUrl}/api/tiktok/plan/tier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ uid: UID_OWNER_A, tier: 'FREE', statusState: 'FREE' }),
      });
      assert.equal(resWithUid.status, 200);

      // Confirmar que A agora é FREE e B continua PRO
      assert.equal(getProPlanEntitlement(UID_OWNER_A).tier, 'FREE');
      assert.equal(getProPlanEntitlement(UID_OWNER_A).active, false);
      assert.equal(getProPlanEntitlement(UID_OWNER_B).tier, 'PRO');
      assert.equal(getProPlanEntitlement(UID_OWNER_B).active, true);
      console.log('✓ [P-09] POST /api/tiktok/plan/tier exige uid (400) e não afeta outros organizadores (P1-ISO-A2)');
    }

    // =========================================================================
    // BLOCO 3 — CONCORRÊNCIA, FENCING TOKEN E TRANSAÇÕES (R-1.3.1-B & R-1.3.1-C)
    // =========================================================================
    console.log('\n--- BLOCO 3: Concorrência, Atomicidade e Fencing Token (R-1.3.1-B & R-1.3.1-C) ---');

    // C-01: restore-session de B competindo com connect de A simultaneamente
    {
      await resetAllTestRuntime();
      const connectEnteredBarrier = createDeferred<void>();
      const releaseConnectGate = createDeferred<void>();

      setServerRuntimeTestHooks({
        customLockTxRunner: defaultLockTxRunner,
        customLockReader: async () => (persistedLockStore ? { ...persistedLockStore } : null),
        customLockWriter: async (state) => {
          persistedLockStore = { ...state };
        },
        customGetOrCreateLiveSession: async (sid, username, rate, ruleId, ownerUid) => {
          connectEnteredBarrier.resolve();
          await releaseConnectGate.promise;
          return {
            sessionId: sid,
            ownerUid: ownerUid || UID_OWNER_A,
            username,
            tiktokUserId: username,
            status: 'active',
            startedAt: Date.now(),
            totalCoins: 0,
            totalGiftsCount: 0,
            uniqueSupportersCount: 0,
            currentRuleId: ruleId || 'rule_default_100',
            currentRate: rate || 100,
            currentTicketCounter: 0,
          };
        },
        customRestoreSessionFromFirestore: async (sid) => {
          const sData = sessionStore.get(sid);
          return {
            restoredStreaks: 1,
            restoredEvents: 1,
            sessionFound: true,
            ownerUid: sData?.ownerUid,
            username: sData?.username || 'creator',
          };
        },
        customAdapterConnect: async (username, sid) => {
          (tiktokAdapter as any).currentUsername = username;
          (tiktokAdapter as any).currentSessionId = sid;
          (tiktokAdapter as any).state = 'CONNECTED';
          return { success: true, status: tiktokAdapter.getStatus() };
        },
      });

      // Disparar connect de A e, enquanto A está dentro da rota, disparar restore-session de B
      const connectPromiseA = fetch(`${baseUrl}/api/tiktok/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ username: 'creator_alpha', sessionId: SESSION_A }),
      });

      await connectEnteredBarrier.promise;

      const restorePromiseB = fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });

      // Liberar A para concluir connect
      releaseConnectGate.resolve();

      const [resConnectA, resRestoreB] = await Promise.all([connectPromiseA, restorePromiseB]);
      const bodyConnectA = await resConnectA.json();
      const bodyRestoreB = await resRestoreB.json();

      assert.equal(resConnectA.status, 200);
      assert.equal(bodyConnectA.ownerUid, UID_OWNER_A);
      assert.equal(resRestoreB.status, 403);
      assert.equal(bodyRestoreB.code, 'OWNERSHIP_FORBIDDEN');

      // Verificar estado final em memória e lock persistido
      const finalState = getServerRuntimeTestState();
      assert.equal(finalState.activeLiveConnectionOwnerUid, UID_OWNER_A);
      assert.equal(finalState.activeLiveConnectionSessionId, SESSION_A);
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_A);
      assert.equal(getPersistedLock()?.sessionId, SESSION_A);
      assert.equal(getPersistedLock()?.shouldBeConnected, true);
      console.log('✓ [C-01] restore-session de B competindo com connect de A é serializado e bloqueado (403); estado final pertence a A');
    }

    // C-02: Duas restaurações simultâneas de proprietários diferentes (A e B)
    {
      await resetAllTestRuntime();
      const restoreAStarted = createDeferred<void>();
      const allowRestoreAFinish = createDeferred<void>();

      setServerRuntimeTestHooks({
        bypassConnectRouteMutex: true,
        customLockTxRunner: defaultLockTxRunner,
        customLockReader: async () => (persistedLockStore ? { ...persistedLockStore } : null),
        customLockWriter: async (state) => {
          persistedLockStore = { ...state };
        },
        customRestoreSessionFromFirestore: async (sid) => {
          if (sid === SESSION_A) {
            restoreAStarted.resolve();
            await allowRestoreAFinish.promise;
          }
          const sData = sessionStore.get(sid);
          (tiktokAdapter as any).currentSessionId = sid;
          tiktokAdapter.setCurrentOwnerUid(sData?.ownerUid || '');
          return {
            restoredStreaks: 2,
            restoredEvents: 4,
            sessionFound: true,
            ownerUid: sData?.ownerUid,
            username: sData?.username,
          };
        },
      });

      const pA = fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_A }),
      });

      await restoreAStarted.promise;

      const pB = fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });

      const resB = await pB;
      const bodyB = await resB.json();
      assert.equal(resB.status, 403);
      assert.equal(bodyB.code, 'OWNERSHIP_FORBIDDEN');

      allowRestoreAFinish.resolve();
      const resA = await pA;
      const bodyA = await resA.json();
      assert.equal(resA.status, 200);
      assert.equal(bodyA.ownerUid, UID_OWNER_A);

      const finalState = getServerRuntimeTestState();
      assert.equal(finalState.activeLiveConnectionOwnerUid, UID_OWNER_A);
      assert.equal(finalState.activeLiveConnectionSessionId, SESSION_A);
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_A);
      assert.equal(getPersistedLock()?.sessionId, SESSION_A);
      console.log('✓ [C-02] Duas restaurações simultâneas de proprietários diferentes (A e B): lock transacional rejeita B (403) e preserva A');
    }

    // C-03: releaseWebcastLock de A enquanto B adquire novo lock (nunca sobrescreve o lock de B + idempotência)
    {
      await resetAllTestRuntime();

      // A adquire o lock inicial (fencingToken = 1) e seu lease expira
      const lockA = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        roomUsername: 'creator_alpha',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
      });
      assert.equal(lockA.allowed, true);
      assert.equal(lockA.fencingToken, 1);

      // Simular expiração do lease de A no banco
      const currentA = getPersistedLock()!;
      persistedLockStore = {
        ...currentA,
        expiresAt: Date.now() - 1000,
      };

      // B adquire legitimamente um novo lock (fencingToken = 2)
      const lockB = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_B,
        sessionId: SESSION_B,
        roomUsername: 'creator_bravo',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
      });
      assert.equal(lockB.allowed, true);
      assert.equal(lockB.fencingToken, 2);
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);

      // Agora A tenta executar releaseWebcastLock tardiamente -> DEVE FALHAR com 403 e NÃO SOBRESCREVER o lock de B!
      const releaseAttemptByA = await releaseWebcastLock(UID_OWNER_A, {
        sessionId: SESSION_A,
        expectedFencingToken: lockA.fencingToken,
      });
      assert.equal(releaseAttemptByA.released, false);
      assert.equal(releaseAttemptByA.status, 403);
      assert.equal(releaseAttemptByA.code, 'OWNERSHIP_FORBIDDEN');

      // Verificar que o lock persistido continua pertencendo a B e ativo!
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.sessionId, SESSION_B);
      assert.equal(getPersistedLock()?.shouldBeConnected, true);
      assert.equal(getPersistedLock()?.fencingToken, 2);

      // Quando o próprio B libera seu lock, a liberação funciona e segunda chamada é idempotente
      const releaseByB1 = await releaseWebcastLock(UID_OWNER_B, {
        sessionId: SESSION_B,
        expectedFencingToken: lockB.fencingToken,
      });
      assert.equal(releaseByB1.released, true);
      assert.equal(releaseByB1.idempotent, false);
      assert.equal(getPersistedLock()?.shouldBeConnected, false);
      assert.equal(getPersistedLock()?.expiresAt, 0);

      const releaseByB2 = await releaseWebcastLock(UID_OWNER_B);
      assert.equal(releaseByB2.released, true);
      assert.equal(releaseByB2.idempotent, true);
      console.log('✓ [C-03] releaseWebcastLock transacional impede que A apague o lock adquirido por B e garante idempotência');
    }

    // C-04: Falha durante restauração após adquirir o lease -> libera o lock no catch e não deixa lock preso
    {
      await resetAllTestRuntime();

      setServerRuntimeTestHooks({
        customLockTxRunner: defaultLockTxRunner,
        customLockReader: async () => (persistedLockStore ? { ...persistedLockStore } : null),
        customLockWriter: async (state) => {
          persistedLockStore = { ...state };
        },
        customRestoreSessionFromFirestore: async (sid) => {
          if (sid === SESSION_A) {
            throw new Error('FALHA_SIMULADA_FIRESTORE_RESTORE');
          }
          const sData = sessionStore.get(sid);
          return {
            restoredStreaks: 1,
            restoredEvents: 1,
            sessionFound: true,
            ownerUid: sData?.ownerUid,
            username: sData?.username,
          };
        },
      });

      // A tenta restaurar e sofre falha após adquirir o lease
      const resFailA = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_A }),
      });
      const bodyFailA = await resFailA.json();
      assert.equal(resFailA.status, 500);
      assert.equal(bodyFailA.code, 'RESTORE_SESSION_FAILED');

      // Verificar que o lock foi liberado automaticamente e a memória está limpa
      const stateAfterFail = getServerRuntimeTestState();
      assert.equal(stateAfterFail.activeLiveConnectionOwnerUid, null);
      assert.equal(stateAfterFail.activeLiveConnectionSessionId, null);
      assert.equal(getPersistedLock()?.shouldBeConnected, false);
      assert.equal(getPersistedLock()?.expiresAt, 0);

      // Verificar que B consegue restaurar imediatamente depois sem ficar bloqueado por lock preso!
      const resSuccessB = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });
      assert.equal(resSuccessB.status, 200);
      assert.equal(getServerRuntimeTestState().activeLiveConnectionOwnerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.shouldBeConnected, true);
      console.log('✓ [C-04] Falha durante restauração após adquirir lease libera o lock automaticamente e permite nova sessão de B');
    }

    // C-05: Operação atrasada (stale) tentando comitar estado após perder o lease (rejeição por fencingToken)
    {
      await resetAllTestRuntime();
      const slowRestoreAEntered = createDeferred<void>();
      const resumeSlowRestoreA = createDeferred<void>();

      setServerRuntimeTestHooks({
        bypassConnectRouteMutex: true,
        customLockTxRunner: defaultLockTxRunner,
        customLockReader: async () => (persistedLockStore ? { ...persistedLockStore } : null),
        customLockWriter: async (state) => {
          persistedLockStore = { ...state };
        },
        customRestoreSessionFromFirestore: async (sid) => {
          if (sid === SESSION_A) {
            slowRestoreAEntered.resolve();
            await resumeSlowRestoreA.promise;
          }
          const sData = sessionStore.get(sid);
          return {
            restoredStreaks: 3,
            restoredEvents: 7,
            sessionFound: true,
            ownerUid: sData?.ownerUid,
            username: sData?.username,
          };
        },
      });

      // 1. A inicia restore-session (adquire fencingToken = 1) e pausa na barreira assíncrona
      const slowPromiseA = fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_A }),
      });

      await slowRestoreAEntered.promise;
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_A);
      assert.equal(getPersistedLock()?.fencingToken, 1);

      // 2. Enquanto A está pausada na restauração, seu lease expira e B adquire legitimamente o lock (fencingToken = 2)
      const currentSlowA = getPersistedLock()!;
      persistedLockStore = {
        ...currentSlowA,
        expiresAt: Date.now() - 1000,
      };

      const fastResB = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });
      const fastBodyB = await fastResB.json();
      assert.equal(fastResB.status, 200);
      assert.equal(fastBodyB.fencingToken, 2);
      assert.equal(getServerRuntimeTestState().activeLiveConnectionOwnerUid, UID_OWNER_B);

      // 3. Agora a operação atrasada de A retoma e tenta comitar seu estado com fencingToken = 1 -> DEVE SER REJEITADA (409 STALE_FENCING_TOKEN)!
      resumeSlowRestoreA.resolve();
      const slowResA = await slowPromiseA;
      const slowBodyA = await slowResA.json();

      assert.equal(slowResA.status, 409);
      assert.equal(slowBodyA.code, 'STALE_FENCING_TOKEN');

      // 4. Confirmar que o estado em memória e o lock persistido permanecem intactos com B (fencingToken = 2)!
      const finalState = getServerRuntimeTestState();
      assert.equal(finalState.activeLiveConnectionOwnerUid, UID_OWNER_B);
      assert.equal(finalState.activeLiveConnectionSessionId, SESSION_B);
      assert.equal(finalState.activeLiveConnectionFencingToken, 2);
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.sessionId, SESSION_B);
      assert.equal(getPersistedLock()?.fencingToken, 2);
      console.log('✓ [C-05] Operação atrasada de A (fencingToken=1) é rejeitada com 409 STALE_FENCING_TOKEN após B adquirir lease (fencingToken=2)');
    }

    // C-06: Duas instâncias simuladas disputando o mesmo lock simultaneamente
    {
      await resetAllTestRuntime();

      // Cenário 6A: Duas instâncias de organizadores distintos (srv_node_1 para A, srv_node_2 para B) disputando lock vazio simultaneamente
      const [claim1, claim2] = await Promise.all([
        acquireOrCoalesceWebcastLock({
          ownerUid: UID_OWNER_A,
          sessionId: SESSION_A,
          roomUsername: 'creator_alpha',
          activeRuleId: 'rule_default_100',
          currentRate: 100,
          requestedInstanceId: 'srv_node_1',
        }),
        acquireOrCoalesceWebcastLock({
          ownerUid: UID_OWNER_B,
          sessionId: SESSION_B,
          roomUsername: 'creator_bravo',
          activeRuleId: 'rule_default_100',
          currentRate: 100,
          requestedInstanceId: 'srv_node_2',
        }),
      ]);

      // Exatamente uma instância deve vencer (200) e a outra deve ser negada (403 OWNERSHIP_FORBIDDEN)
      const allowedClaims = [claim1, claim2].filter((c) => c.allowed);
      const deniedClaims = [claim1, claim2].filter((c) => !c.allowed);
      assert.equal(allowedClaims.length, 1);
      assert.equal(deniedClaims.length, 1);
      assert.equal(deniedClaims[0].status, 403);
      assert.equal(deniedClaims[0].code, 'OWNERSHIP_FORBIDDEN');
      assert.equal(getPersistedLock()?.ownerUid, allowedClaims[0].lockState?.ownerUid);
      assert.equal(getPersistedLock()?.fencingToken, 1);

      // Cenário 6B: Mesma conta (A) em segunda instância (srv_node_2) coalescia sem duplicar Webcast
      const coalesceClaim = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        roomUsername: 'creator_alpha',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        requestedInstanceId: 'srv_node_2',
      });
      assert.equal(coalesceClaim.allowed, true);
      assert.equal(coalesceClaim.coalescedCrossInstance, true);
      assert.equal(coalesceClaim.effectiveSessionId, SESSION_A);
      assert.equal(getPersistedLock()?.instanceId, 'srv_node_1');
      console.log('✓ [C-06] Disputa concorrente entre duas instâncias simuladas garante exclusão mútua entre organizadores e coalescência para o mesmo dono');
    }

    // C-07: Renovação transacional de lease (Heartbeat) estende expiresAt e preserva fencingToken (P1-LOCK-B3)
    {
      await resetAllTestRuntime();
      const claim = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        roomUsername: 'creator_alpha',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        requestedInstanceId: 'srv_node_1',
      });
      assert.equal(claim.allowed, true);
      const originalToken = claim.fencingToken;
      const originalExpiresAt = claim.lockState?.expiresAt || 0;

      // Executar renovação de heartbeat
      const renewal = await renewWebcastLeaseTransaction({
        instanceId: 'srv_node_1',
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        fencingToken: originalToken,
        lastKnownState: 'CONNECTED',
      });
      assert.equal(renewal.renewed, true);
      assert.equal(renewal.status, 200);
      assert.equal(getPersistedLock()?.fencingToken, originalToken);
      assert.ok((getPersistedLock()?.expiresAt || 0) >= originalExpiresAt);
      console.log('✓ [C-07] Renovação transacional de lease estende expiresAt e preserva fencingToken intacto (P1-LOCK-B3)');
    }

    // C-08: Renovação transacional de lease expirado é rejeitada com 410 LEASE_EXPIRED (P1-LOCK-B3)
    {
      await resetAllTestRuntime();
      const claim = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        roomUsername: 'creator_alpha',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        requestedInstanceId: 'srv_node_1',
      });
      assert.equal(claim.allowed, true);

      // Simular lease expirado no banco
      const current = getPersistedLock()!;
      persistedLockStore = {
        ...current,
        expiresAt: Date.now() - 5000,
      };

      const renewal = await renewWebcastLeaseTransaction({
        instanceId: 'srv_node_1',
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        fencingToken: claim.fencingToken,
        lastKnownState: 'CONNECTED',
      });
      assert.equal(renewal.renewed, false);
      assert.equal(renewal.status, 410);
      assert.equal(renewal.code, 'LEASE_EXPIRED');
      console.log('✓ [C-08] Renovação transacional de lease expirado é rejeitada com 410 LEASE_EXPIRED (P1-LOCK-B3)');
    }

    // C-09: Renovação transacional por A com token desatualizado após lease adquirido por B é rejeitada (P1-LOCK-B3)
    {
      await resetAllTestRuntime();
      const claimA = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        roomUsername: 'creator_alpha',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        requestedInstanceId: 'srv_node_1',
      });
      assert.equal(claimA.allowed, true);

      // Lease de A expira
      persistedLockStore = {
        ...getPersistedLock()!,
        expiresAt: Date.now() - 1000,
      };

      // B adquire lease legitimamente
      const claimB = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_B,
        sessionId: SESSION_B,
        roomUsername: 'creator_bravo',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        requestedInstanceId: 'srv_node_2',
      });
      assert.equal(claimB.allowed, true);
      assert.equal(claimB.fencingToken, 2);

      // Heartbeat atrasado de A tenta renovar com seus dados antigos
      const staleRenewal = await renewWebcastLeaseTransaction({
        instanceId: 'srv_node_1',
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        fencingToken: claimA.fencingToken,
        lastKnownState: 'CONNECTED',
      });
      assert.equal(staleRenewal.renewed, false);
      assert.equal(staleRenewal.status, 403);
      assert.equal(staleRenewal.code, 'OWNERSHIP_FORBIDDEN');
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.fencingToken, 2);
      console.log('✓ [C-09] Renovação de lease com ownerUid ou token desatualizado é rejeitada e preserva lock de B (P1-LOCK-B3)');
    }

    // C-10: Renovação transacional impede regressão de token ou sobrescrita do lock de B por worker defasado (P1-LOCK-B3)
    {
      await resetAllTestRuntime();
      persistedLockStore = {
        instanceId: 'srv_node_2',
        ownerUid: UID_OWNER_B,
        sessionId: SESSION_B,
        roomUsername: 'creator_bravo',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        shouldBeConnected: true,
        lastKnownState: 'CONNECTED',
        updatedAt: Date.now(),
        expiresAt: Date.now() + 30000,
        fencingToken: 5,
      };

      const lateHeartbeat = await renewWebcastLeaseTransaction({
        instanceId: 'srv_node_1',
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        fencingToken: 2,
        lastKnownState: 'CONNECTED',
      });
      assert.equal(lateHeartbeat.renewed, false);
      assert.equal(getPersistedLock()?.fencingToken, 5);
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      console.log('✓ [C-10] Renovação transacional impede que worker defasado regrida fencingToken ou sobrescreva lock de B (P1-LOCK-B3)');
    }

    // C-11: POST /api/tiktok/disconnect sob mutex e isolado contra desconexão cruzada (P1-LOCK-B2)
    {
      await resetAllTestRuntime();

      const claimB = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_B,
        sessionId: SESSION_B,
        roomUsername: 'creator_bravo',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
      });
      assert.equal(claimB.allowed, true);
      tiktokAdapter.setCurrentOwnerUid(UID_OWNER_B);
      (tiktokAdapter as any).currentSessionId = SESSION_B;
      (tiktokAdapter as any).state = 'CONNECTED';

      // A envia disconnect na sua própria sessão SESSION_A -> releaseWebcastLock falha com 403 e NÃO desconecta o adapter de B!
      const resDiscCross = await fetch(`${baseUrl}/api/tiktok/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_A }),
      });
      const bodyDiscCross = await resDiscCross.json();
      assert.equal(resDiscCross.status, 403);
      assert.equal(bodyDiscCross.code, 'OWNERSHIP_FORBIDDEN');

      assert.equal(tiktokAdapter.getCurrentOwnerUid(), UID_OWNER_B);
      assert.equal(tiktokAdapter.getStatus().state, 'CONNECTED');
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.shouldBeConnected, true);

      // Agora o próprio B envia disconnect -> desconecta com sucesso
      const resDiscB = await fetch(`${baseUrl}/api/tiktok/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_b_non_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_B }),
      });
      assert.equal(resDiscB.status, 200);
      assert.equal(tiktokAdapter.getStatus().state, 'DISCONNECTED');
      assert.equal(getPersistedLock()?.shouldBeConnected, false);
      console.log('✓ [C-11] POST /api/tiktok/disconnect sob mutex protege conexão ativa de B contra disconnect indevido de A (P1-LOCK-B2)');
    }

    // C-12: Rollback após STALE_FENCING_TOKEN reseta o adapter apenas se coincidir com o proprietário falhado (P1-LOCK-B1)
    {
      await resetAllTestRuntime();
      let restoreAFencingToken = 0;

      setServerRuntimeTestHooks({
        bypassConnectRouteMutex: true,
        customLockTxRunner: defaultLockTxRunner,
        customLockReader: async () => (persistedLockStore ? { ...persistedLockStore } : null),
        customLockWriter: async (state) => {
          persistedLockStore = { ...state };
        },
        customRestoreSessionFromFirestore: async (sid) => {
          if (sid === SESSION_A) {
            restoreAFencingToken = getPersistedLock()?.fencingToken || 1;
            persistedLockStore = {
              instanceId: 'srv_node_2',
              ownerUid: UID_OWNER_B,
              sessionId: SESSION_B,
              roomUsername: 'creator_bravo',
              activeRuleId: 'rule_default_100',
              currentRate: 100,
              shouldBeConnected: true,
              lastKnownState: 'CONNECTED',
              updatedAt: Date.now(),
              expiresAt: Date.now() + 30000,
              fencingToken: restoreAFencingToken + 1,
            };
            tiktokAdapter.setCurrentOwnerUid(UID_OWNER_A);
            (tiktokAdapter as any).currentSessionId = SESSION_A;
            (tiktokAdapter as any).state = 'CONNECTED';
          }
          return {
            restoredStreaks: 1,
            restoredEvents: 1,
            sessionFound: true,
            ownerUid: UID_OWNER_A,
            username: 'creator_alpha',
          };
        },
      });

      const resA = await fetch(`${baseUrl}/api/tiktok/restore-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token_owner_a_admin',
        },
        body: JSON.stringify({ sessionId: SESSION_A }),
      });
      const bodyA = await resA.json();
      assert.equal(resA.status, 409);
      assert.equal(bodyA.code, 'STALE_FENCING_TOKEN');

      assert.notEqual(tiktokAdapter.getCurrentOwnerUid(), UID_OWNER_A);
      assert.equal(tiktokAdapter.getStatus().state, 'DISCONNECTED');
      assert.equal(getPersistedLock()?.ownerUid, UID_OWNER_B);
      assert.equal(getPersistedLock()?.fencingToken, 2);
      console.log('✓ [C-12] Rollback após STALE_FENCING_TOKEN executa rollback no adapter de A sem afetar o lock de B (P1-LOCK-B1)');
    }

    // C-13: Falha no Firestore retorna 503 LOCK_UNAVAILABLE em vez de conceder lock local mock (fail-closed) (P1-LOCK-B4)
    {
      await resetAllTestRuntime();
      setServerRuntimeTestHooks({
        customLockTxRunner: async () => {
          throw new Error('SIMULATED_FIRESTORE_DEADLOCK_OR_UNAVAILABLE');
        },
      });

      const claimUnavailable = await acquireOrCoalesceWebcastLock({
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        roomUsername: 'creator_alpha',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
      });
      assert.equal(claimUnavailable.allowed, false);
      assert.equal(claimUnavailable.status, 503);
      assert.equal(claimUnavailable.code, 'LOCK_UNAVAILABLE');

      const releaseUnavailable = await releaseWebcastLock(UID_OWNER_A, { sessionId: SESSION_A });
      assert.equal(releaseUnavailable.released, false);
      assert.equal(releaseUnavailable.status, 503);
      assert.equal(releaseUnavailable.code, 'LOCK_UNAVAILABLE');

      const renewUnavailable = await renewWebcastLeaseTransaction({
        instanceId: 'srv_node_1',
        ownerUid: UID_OWNER_A,
        sessionId: SESSION_A,
        fencingToken: 1,
      });
      assert.equal(renewUnavailable.renewed, false);
      assert.equal(renewUnavailable.status, 503);
      assert.equal(renewUnavailable.code, 'LOCK_UNAVAILABLE');
      console.log('✓ [C-13] Indisponibilidade de lock no Firestore retorna fail-closed 503 LOCK_UNAVAILABLE (P1-LOCK-B4)');
    }

    console.log('\n=== TODOS OS 28 TESTES DAS FASES 1.3, 1.3.1 E 1.3.2 PASSARAM COM SUCESSO (100%) ===');
  } finally {
    setCustomTokenVerifierForTests(null);
    setCustomFirestoreResourceReaderForTests(null);
    setServerRuntimeTestHooks(null);
    resetServerRuntimeStateForTests();
    clearOrganizerPlanStatesForTests();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('FALHA NOS TESTES DA FASE 1.3.2:', err);
    process.exit(1);
  });
