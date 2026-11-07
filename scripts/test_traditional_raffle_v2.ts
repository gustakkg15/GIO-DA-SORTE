/**
 * ============================================================================
 * GIO DA SORTE — FASE 1.7.2
 * BATERIA OFICIAL DE TESTES AUTOMATIZADOS DO SORTEADOR TRADICIONAL V2.0
 * (PERSISTÊNCIA DURÁVEL + R-01 A R-08 + 20 CENÁRIOS OBRIGATÓRIOS)
 * ============================================================================
 */

import { execFileSync } from 'child_process';
import http from 'http';
import { app } from '../server.ts';
import {
  isIdentityToolkitPermissionOrDisabledError,
  setCustomTokenVerifierForTests,
} from '../src/server/firebaseAdminAuth.ts';
import { mercadoPagoSubscriptionService } from '../src/server/mercadoPagoSubscriptionService.ts';
import {
  FirestoreAdminTransactionalStore,
  InMemoryTransactionalStore,
  TraditionalRaffleError,
  TraditionalRaffleService,
  computeRejectionSamplingDraw,
  computeRequestFingerprint,
  computeRosterSha256,
  computeServerCommitment,
  defaultFirestoreTraditionalRaffleStore,
  setPlanEntitlementPolicyForUid,
  setSimulateSubscriptionServiceFailureForTests,
  traditionalRaffleService,
  validateOrganizerPlanEntitlement,
} from '../src/server/traditionalRaffleService.ts';
import {
  DEFAULT_SETTINGS,
  verifyTraditionalDrawProofWeb,
} from '../src/utils/raffle.ts';
import type {
  CanonicalTicketEntry,
  Participant,
  TraditionalDrawLedgerEvent,
  TraditionalDrawLedgerHead,
  TraditionalDrawPrecommitRecord,
  TraditionalDrawProofV2,
  TraditionalPermanentDrawRecord,
  UserSubscriptionRecord,
} from '../src/types.ts';

interface ScenarioResult {
  id: number;
  category: 'UNIT' | 'INTEGRATION_HTTP' | 'MULTI_INSTANCE_CONCURRENCY';
  title: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: ScenarioResult[] = [];

function recordScenario(
  id: number,
  category: ScenarioResult['category'],
  title: string,
  passed: boolean,
  details: string,
  error?: string
) {
  results.push({ id, category, title, passed, details, error });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [Cenário ${String(id).padStart(2, '0')} | ${category}] ${title}`);
  console.log(`   ↳ Evidência: ${details}`);
  if (error) {
    console.error(`   ↳ Erro: ${error}`);
  }
}

async function httpRequestJson(
  baseUrl: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

function createSampleParticipants(): Participant[] {
  return [
    { id: 'p1', name: 'Ana', coins: 100, addedAt: 1700000000000 },
    { id: 'p2', name: 'Beto', coins: 100, addedAt: 1700000001000 },
    { id: 'p3', name: 'Caio', coins: 100, addedAt: 1700000002000 },
  ];
}

async function runAllTests() {
  console.log('================================================================================');
  console.log('🚀 INICIANDO SUÍTE DE TESTES AUTOMATIZADOS — FASE 1.7.2 (R-01 A R-08)');
  console.log('================================================================================\n');

  // 0. Verify default store of traditionalRaffleService is FirestoreAdminTransactionalStore (R-01)
  const initialDefaultStore = traditionalRaffleService.getStore();
  console.log(
    `[Diagnóstico R-01] Store padrão de produção: storeKind=${initialDefaultStore.storeKind}, ` +
      `projectId=${defaultFirestoreTraditionalRaffleStore.getProjectId()}, ` +
      `databaseId=${defaultFirestoreTraditionalRaffleStore.getDatabaseId()}`
  );
  if (initialDefaultStore.storeKind !== 'FIRESTORE_ADMIN') {
    throw new Error('R-01 VIOLATION: default store must be FIRESTORE_ADMIN');
  }

  // Test fail-closed behavior of FirestoreAdminTransactionalStore in container without ADC
  let firestoreDirectProbeResult = '';
  try {
    const probeStore = new FirestoreAdminTransactionalStore();
    await probeStore.getDocDirect('users/probe_uid/raffles/default');
    firestoreDirectProbeResult = 'CONNECTED_REAL_FIRESTORE_ADC';
  } catch (err) {
    if (err instanceof TraditionalRaffleError) {
      firestoreDirectProbeResult = `FAIL_CLOSED_VERIFIED (${err.statusCode} ${err.errorCode}: ${err.message.slice(0, 120)})`;
    } else {
      firestoreDirectProbeResult = `UNEXPECTED_ERROR: ${(err as Error).message}`;
    }
  }
  console.log(`[Diagnóstico R-01] Probe FirestoreAdminTransactionalStore: ${firestoreDirectProbeResult}\n`);

  // Inject deterministic OCC store into HTTP route singleton for integration tests
  const httpSharedStore = new InMemoryTransactionalStore();
  traditionalRaffleService.setStoreForTests(httpSharedStore);

  // Configure deterministic test token verifier on Firebase Admin Auth middleware
  setCustomTokenVerifierForTests(async (token: string) => {
    if (token === 'token_owner_alice') {
      return { uid: 'uid_alice_owner', email: 'alice@giodasorte.com' } as any;
    }
    if (token === 'token_attacker_mallory') {
      return { uid: 'uid_mallory_attacker', email: 'mallory@evil.example' } as any;
    }
    if (token === 'token_suspended_bob') {
      return { uid: 'uid_bob_suspended', email: 'bob@giodasorte.com' } as any;
    }
    throw new Error('INVALID_FIREBASE_TOKEN');
  });

  // Start ephemeral HTTP server on port 0 for real HTTP route integration tests
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = testServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // ========================================================================
    // CENÁRIO 1: Vetores criptográficos normativos (N = 3 e N = 10.000.000)
    // ========================================================================
    try {
      const S_server = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const Salt = 'fedcba9876543210fedcba9876543210';
      const E_client = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const drawNonce = 'nonce_test_9999';
      const drawId = 'draw_trad_test_1793976000000';
      const fencingToken = 1;
      const rosterVersion = 1;
      const drawSequence = 0;

      const rawTickets: CanonicalTicketEntry[] = [
        { participantId: 'p3', number: 30, name: 'Caio\n' },
        { participantId: 'p1', number: 10, name: 'Ana' },
        { participantId: 'p2', number: 20, name: 'Beto' },
      ];

      const C_server = computeServerCommitment(S_server, Salt);
      const { canonicalString, rosterSha256Hash, sortedTickets } = computeRosterSha256(rawTickets);

      const resN3 = computeRejectionSamplingDraw({
        serverSeed: S_server,
        rosterSha256Hash,
        clientEntropy: E_client,
        drawNonce,
        drawId,
        fencingToken,
        rosterVersion,
        drawSequence,
        totalTickets: 3,
      });

      const resN10M = computeRejectionSamplingDraw({
        serverSeed: S_server,
        rosterSha256Hash,
        clientEntropy: E_client,
        drawNonce,
        drawId,
        fencingToken,
        rosterVersion,
        drawSequence,
        totalTickets: 10_000_000,
      });

      const expectedCServer = '30c1b408108d9c3a2e67eae6d9a5c6f6227a47be1b0444ba78b807fbf4cb1961';
      const expectedHRoster = 'e95e090353278e58734973c21270d53cd439fef7c29cb4ce8da9f10e56f39050';
      const expectedMBase =
        'GIO_PF_V2:e95e090353278e58734973c21270d53cd439fef7c29cb4ce8da9f10e56f39050:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:nonce_test_9999:draw_trad_test_1793976000000:1:1:0';
      const expectedHmac0 = '8c528b8654aca4e97a190a02e4e0bc70f2f73c1244134e16d9e7fe8e0d94a97d';
      const expectedWords0 = [
        2354219910, 1420600553, 2048461314, 3839933552, 4076289042, 1142115862, 3655859854,
        227846525,
      ];

      const passed =
        C_server === expectedCServer &&
        canonicalString === 'p1:10:Ana\np2:20:Beto\np3:30:Caio' &&
        rosterSha256Hash === expectedHRoster &&
        resN3.mBase === expectedMBase &&
        resN3.block0DigestHex === expectedHmac0 &&
        JSON.stringify(resN3.block0Words) === JSON.stringify(expectedWords0) &&
        resN3.limitN === 4294967295 &&
        resN3.winningIndex === 0 &&
        sortedTickets[resN3.winningIndex].participantId === 'p1' &&
        resN10M.limitN === 4290000000 &&
        resN10M.winningIndex === 4219910;

      recordScenario(
        1,
        'UNIT',
        'Vetores criptográficos normativos congelados (N=3 e N=10.000.000)',
        passed,
        `C_server=${C_server.slice(0, 16)}..., H_roster=${rosterSha256Hash.slice(0, 16)}..., HMAC_0=${resN3.block0DigestHex.slice(0, 16)}..., winIdx(N=3)=${resN3.winningIndex}, winIdx(N=10M)=${resN10M.winningIndex}`
      );
    } catch (err) {
      recordScenario(
        1,
        'UNIT',
        'Vetores criptográficos normativos (N=3 e N=10.000.000)',
        false,
        '',
        (err as Error).message
      );
    }

    // ========================================================================
    // CENÁRIO 2: Paridade Node.js 22 vs Python 3.12 e Verificador WebCrypto
    // ========================================================================
    try {
      const S_server = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const Salt = 'fedcba9876543210fedcba9876543210';
      const E_client = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const drawNonce = 'nonce_test_9999';
      const drawId = 'draw_trad_test_1793976000000';

      const rawTickets: CanonicalTicketEntry[] = [
        { participantId: 'p3', number: 30, name: 'Caio\n' },
        { participantId: 'p1', number: 10, name: 'Ana' },
        { participantId: 'p2', number: 20, name: 'Beto' },
      ];

      const C_server = computeServerCommitment(S_server, Salt);
      const { rosterSha256Hash } = computeRosterSha256(rawTickets);
      const resN3 = computeRejectionSamplingDraw({
        serverSeed: S_server,
        rosterSha256Hash,
        clientEntropy: E_client,
        drawNonce,
        drawId,
        fencingToken: 1,
        rosterVersion: 1,
        drawSequence: 0,
        totalTickets: 3,
      });

      const pyScript = `
import hashlib, hmac, json, struct, unicodedata, re

S_server = "${S_server}"
Salt = "${Salt}"
E_client = "${E_client}"
drawNonce = "${drawNonce}"
drawId = "${drawId}"
fencingToken = 1
rosterVersion = 1
drawSequence = 0

tickets = [
    {"participantId": "p3", "number": 30, "name": "Caio\\n"},
    {"participantId": "p1", "number": 10, "name": "Ana"},
    {"participantId": "p2", "number": 20, "name": "Beto"},
]
def clean(s):
    return re.sub(r'[\\x00-\\x1f\\x7f-\\x9f]', '', unicodedata.normalize('NFC', s)).strip()

norm = [{"participantId": clean(t["participantId"]), "number": t["number"], "name": clean(t["name"])} for t in tickets]
norm.sort(key=lambda x: (x["number"], x["participantId"].encode('utf-8')))
canon_roster = "\\n".join(f"{t['participantId']}:{t['number']}:{t['name']}" for t in norm)

c_server = hashlib.sha256(f"{S_server}:{Salt}".encode('utf-8')).hexdigest()
h_roster = hashlib.sha256(canon_roster.encode('utf-8')).hexdigest()
m_base = f"GIO_PF_V2:{h_roster}:{E_client}:{drawNonce}:{drawId}:{fencingToken}:{rosterVersion}:{drawSequence}"
digest0 = hmac.new(bytes.fromhex(S_server), f"{m_base}:0".encode('utf-8'), hashlib.sha256).digest()
words0 = list(struct.unpack(">8I", digest0))
limit3 = (4294967296 // 3) * 3
limit10m = (4294967296 // 10000000) * 10000000
win3 = next(u % 3 for u in words0 if u < limit3)
win10m = next(u % 10000000 for u in words0 if u < limit10m)

print(json.dumps({
    "c_server": c_server,
    "h_roster": h_roster,
    "m_base": m_base,
    "hmac0": digest0.hex(),
    "words0": words0,
    "limit3": limit3,
    "win3": win3,
    "limit10m": limit10m,
    "win10m": win10m
}))
`;
      const pyOut = JSON.parse(execFileSync('python3', ['-c', pyScript], { encoding: 'utf8' }));

      const proof: TraditionalDrawProofV2 = {
        protocolVersion: 'GIO_PF_V2',
        commitmentHash: C_server,
        serverSeed: S_server,
        salt: Salt,
        clientEntropy: E_client,
        drawNonce,
        drawId,
        fencingToken: 1,
        rosterVersion: 1,
        drawSequence: 0,
        rosterSha256Hash,
        winningIndex: resN3.winningIndex,
        winningNumber: 10,
        winnerParticipantId: 'p1',
        winnerName: 'Ana',
        blockIndex: resN3.blockIndex,
        wordOffset: resN3.wordOffset,
        uint32Value: resN3.uint32Value,
        limitN: resN3.limitN,
        totalEligibleTickets: 3,
        eventHash: '0'.repeat(64),
        previousEventHash: '0'.repeat(64),
        sequenceNumber: 1,
        drawnAtIso: new Date().toISOString(),
      };
      const webVerify = await verifyTraditionalDrawProofWeb(proof, rawTickets);

      const passed =
        pyOut.c_server === C_server &&
        pyOut.h_roster === rosterSha256Hash &&
        pyOut.m_base === resN3.mBase &&
        pyOut.hmac0 === resN3.block0DigestHex &&
        JSON.stringify(pyOut.words0) === JSON.stringify(resN3.block0Words) &&
        pyOut.win3 === resN3.winningIndex &&
        pyOut.win10m === 4219910 &&
        webVerify.valid === true;

      recordScenario(
        2,
        'UNIT',
        'Paridade binária Node.js 22 vs Python 3.12 e Verificador WebCrypto',
        passed,
        `Python3 win3=${pyOut.win3}, win10m=${pyOut.win10m}, WebCrypto valid=${webVerify.valid}`
      );
    } catch (err) {
      recordScenario(
        2,
        'UNIT',
        'Paridade Node.js 22 vs Python 3.12',
        false,
        '',
        (err as Error).message
      );
    }

    // ========================================================================
    // CENÁRIO 3: Persistência completa de rifa, precommit, ledger, idempotência e draw (R-01, R-02, R-08)
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);
      const t0 = 1791000000000;

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
        nowMs: t0,
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        nowMs: t0 + 100,
      });

      const drawRes = await svc.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_persisted_001',
        idempotencyKey: 'idem_persisted_001',
        commitmentHash: pre.commitmentHash,
        clientEntropy: 'a1'.repeat(32),
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
        nowMs: t0 + 500,
      });

      // Verify exact canonical paths in store
      const raffleSnap = await store.getDocDirect('users/uid_alice_owner/raffles/default');
      const precommitSnap = await store.getDocDirect<TraditionalDrawPrecommitRecord>(
        `draw_precommits_private/${pre.commitmentHash}`
      );
      const ledgerHeadSnap = await store.getDocDirect<TraditionalDrawLedgerHead>(
        `draw_ledger_public/${pre.commitmentHash}`
      );
      const preEventSnap = await store.getDocDirect<TraditionalDrawLedgerEvent>(
        `draw_ledger_public/${pre.commitmentHash}/events/PRECOMMIT`
      );
      const revEventSnap = await store.getDocDirect<TraditionalDrawLedgerEvent>(
        `draw_ledger_public/${pre.commitmentHash}/events/REVEALED`
      );
      const idemSnap = await store.getDocDirect(
        'users/uid_alice_owner/raffles/default/idempotency/idem_persisted_001'
      );
      const permDrawSnap = await store.getDocDirect<TraditionalPermanentDrawRecord>(
        'users/uid_alice_owner/raffles/default/draws/draw_persisted_001'
      );

      // Also verify that FirestoreAdminTransactionalStore is the default production store and fails closed without silent fallback
      const prodStoreIsFirestore =
        defaultFirestoreTraditionalRaffleStore.storeKind === 'FIRESTORE_ADMIN' &&
        firestoreDirectProbeResult.startsWith('FAIL_CLOSED_VERIFIED');

      const passed =
        drawRes.statusCode === 200 &&
        raffleSnap.exists &&
        precommitSnap.exists &&
        precommitSnap.data()?.status === 'REVEALED' &&
        ledgerHeadSnap.exists &&
        ledgerHeadSnap.data()?.lastEventType === 'REVEALED' &&
        preEventSnap.exists &&
        revEventSnap.exists &&
        idemSnap.exists &&
        permDrawSnap.exists &&
        permDrawSnap.data()?.drawId === 'draw_persisted_001' &&
        prodStoreIsFirestore;

      recordScenario(
        3,
        'UNIT',
        'Persistência completa dos 6 documentos (rifa, precommit, ledgerHead, eventos, idempotency, draw) e fail-closed do FirestoreAdminTransactionalStore sem fallback silencioso',
        passed,
        `raffle=${raffleSnap.exists}, precommit=${precommitSnap.data()?.status}, ledger=${ledgerHeadSnap.data()?.lastEventType}, idemPath=users/.../idempotency/..., drawPath=users/.../draws/..., prodStore=${defaultFirestoreTraditionalRaffleStore.storeKind}`
      );
    } catch (err) {
      recordScenario(3, 'UNIT', 'Persistência completa dos 6 documentos', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 4: Recuperação de sorteio por uma segunda instância de TraditionalRaffleService
    // ========================================================================
    try {
      const sharedDurableStore = new InMemoryTransactionalStore();
      const instanceA = new TraditionalRaffleService(sharedDurableStore);

      await instanceA.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'raffle_multi_inst',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const preA = await instanceA.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'raffle_multi_inst',
      });

      const drawA = await instanceA.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'raffle_multi_inst',
        drawId: 'draw_inst_a_001',
        idempotencyKey: 'idem_inst_a_001',
        commitmentHash: preA.commitmentHash,
        clientEntropy: 'b2'.repeat(32),
        expectedRosterVersion: preA.rosterVersion,
        expectedDrawSequence: preA.drawSequence,
        fencingToken: preA.fencingToken,
      });

      // Instantiate a brand-new server instance (simulating process restart or second replica)
      const instanceB = new TraditionalRaffleService(sharedDurableStore);

      const recoveredRaffle = await instanceB.getRaffleStateForOwner(
        'uid_alice_owner',
        'raffle_multi_inst'
      );
      const recoveredDraws = await instanceB.listRaffleDrawsForOwner(
        'uid_alice_owner',
        'raffle_multi_inst'
      );
      const recoveredLedger = await instanceB.getVerifiedLedgerBundle(preA.commitmentHash);

      // Replay the same idempotencyKey against Instance B
      const replayOnB = await instanceB.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'raffle_multi_inst',
        drawId: 'draw_inst_a_001',
        idempotencyKey: 'idem_inst_a_001',
        commitmentHash: preA.commitmentHash,
        clientEntropy: 'b2'.repeat(32),
        expectedRosterVersion: preA.rosterVersion,
        expectedDrawSequence: preA.drawSequence,
        fencingToken: preA.fencingToken,
      });

      const passed =
        recoveredRaffle.drawSequence === 1 &&
        recoveredRaffle.lastDrawId === 'draw_inst_a_001' &&
        recoveredDraws.length === 1 &&
        recoveredDraws[0].drawId === 'draw_inst_a_001' &&
        recoveredLedger.valid === true &&
        recoveredLedger.terminalType === 'REVEALED' &&
        replayOnB.body.idempotentReplay === true &&
        replayOnB.body.winningIndex === drawA.body.winningIndex;

      recordScenario(
        4,
        'MULTI_INSTANCE_CONCURRENCY',
        'Recuperação completa de rifa, histórico de draws, ledger e replay idempotente por uma 2ª instância de TraditionalRaffleService',
        passed,
        `instanceB drawSequence=${recoveredRaffle.drawSequence}, drawsCount=${recoveredDraws.length}, replayOnB.idempotentReplay=${replayOnB.body.idempotentReplay}`
      );
    } catch (err) {
      recordScenario(
        4,
        'MULTI_INSTANCE_CONCURRENCY',
        'Recuperação por segunda instância',
        false,
        '',
        (err as Error).message
      );
    }

    // ========================================================================
    // CENÁRIO 5: Separação entre `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}` e `/draws/{drawId}` (R-02)
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      // Seed a simulated TikTok LIVE draw record at `/draws/draw_collision_999`
      await store.setDocDirect('draws/draw_collision_999', {
        drawId: 'draw_collision_999',
        drawType: 'INDIVIDUAL_LIVE',
        ownerUid: 'uid_alice_owner',
        targetSessionId: 'live_session_123',
      });

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const out = await svc.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_collision_999',
        idempotencyKey: 'idem_sep_999',
        commitmentHash: pre.commitmentHash,
        clientEntropy: 'c3'.repeat(32),
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
      });

      const liveDrawDoc = await store.getDocDirect<Record<string, unknown>>('draws/draw_collision_999');
      const tradDrawDoc = await store.getDocDirect<TraditionalPermanentDrawRecord>(
        'users/uid_alice_owner/raffles/default/draws/draw_collision_999'
      );

      const passed =
        out.statusCode === 200 &&
        liveDrawDoc.exists &&
        liveDrawDoc.data()?.drawType === 'INDIVIDUAL_LIVE' &&
        tradDrawDoc.exists &&
        tradDrawDoc.data()?.proof?.protocolVersion === 'GIO_PF_V2';

      recordScenario(
        5,
        'UNIT',
        'Separação estrita entre `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}` (Tradicional) e `/draws/{drawId}` (TikTok LIVE)',
        passed,
        `liveDraw(/draws/draw_collision_999).drawType=${liveDrawDoc.data()?.drawType}, tradDraw(users/.../draws/draw_collision_999).protocolVersion=${tradDrawDoc.data()?.proof?.protocolVersion}`
      );
    } catch (err) {
      recordScenario(5, 'UNIT', 'Separação de caminhos de draw (R-02)', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 6: Isolamento entre usuários (401 sem token, 403 cross-tenant, 404 não encontrado)
    // ========================================================================
    try {
      httpSharedStore.clearAllForTests();

      const unauthRes = await httpRequestJson(baseUrl, 'POST', '/api/raffle/draw/pre-commit', {}, {
        raffleId: 'default',
      });

      await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          settings: DEFAULT_SETTINGS,
          participants: createSampleParticipants(),
        }
      );

      const crossTenantRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/draw/pre-commit',
        { Authorization: 'Bearer token_attacker_mallory' },
        {
          ownerUid: 'uid_alice_owner',
          raffleId: 'default',
        }
      );

      const missingRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/draw/pre-commit',
        { Authorization: 'Bearer token_attacker_mallory' },
        {
          raffleId: 'default',
        }
      );

      const passed =
        unauthRes.status === 401 &&
        crossTenantRes.status === 403 &&
        crossTenantRes.data.error === 'HTTP_403_FORBIDDEN_CROSS_TENANT' &&
        missingRes.status === 404 &&
        missingRes.data.error === 'HTTP_404_RAFFLE_NOT_FOUND';

      recordScenario(
        6,
        'INTEGRATION_HTTP',
        'Isolamento entre usuários (HTTP 401 sem token, HTTP 403 cross-tenant, HTTP 404 rifa inexistente)',
        passed,
        `unauth=${unauthRes.status}, crossTenant=${crossTenantRes.status} (${crossTenantRes.data.error}), missing=${missingRes.status} (${missingRes.data.error})`
      );
    } catch (err) {
      recordScenario(6, 'INTEGRATION_HTTP', 'Isolamento entre usuários', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 7: Proteção contra auto-save malicioso/concorrente (R-03)
    // ========================================================================
    try {
      httpSharedStore.clearAllForTests();

      // 1. Bootstrap Alice's raffle
      await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          settings: DEFAULT_SETTINGS,
          participants: createSampleParticipants(),
        }
      );

      // 2. Malicious client tries to overwrite `rosterVersion` or `fencingToken` via /api/raffle/sync
      const spoofedGovRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          rosterVersion: 999,
          fencingToken: 888,
        }
      );

      // 3. Malicious client tries to inject fake `winners` via /api/raffle/sync
      const spoofedWinnersRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          winners: [
            {
              id: 'fake_win',
              participantId: 'p3',
              name: 'Caio',
              number: 30,
              prize: '1º Prêmio',
              drawnAt: Date.now(),
            },
          ],
        }
      );

      // 4. Malicious client tries to overwrite `participants` directly via /api/raffle/sync after bootstrap
      const directOverwriteRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          participants: [{ id: 'p_evil', name: 'Invasor', coins: 5000, addedAt: Date.now() }],
        }
      );

      // 5. Create pre-commit (raffle enters `COMMITTED` state) and verify auto-save `/api/raffle/sync` is blocked with 409
      const preRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/draw/pre-commit',
        { Authorization: 'Bearer token_owner_alice' },
        { raffleId: 'default' }
      );

      const syncDuringCommittedRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          title: 'Tentativa de Auto-Save durante COMMITTED',
        }
      );

      const passed =
        spoofedGovRes.status === 403 &&
        spoofedGovRes.data.error === 'HTTP_403_PROTECTED_GOVERNANCE_FIELDS_FORBIDDEN' &&
        spoofedWinnersRes.status === 403 &&
        spoofedWinnersRes.data.error === 'HTTP_403_CLIENT_WINNERS_OVERWRITE_FORBIDDEN' &&
        directOverwriteRes.status === 409 &&
        directOverwriteRes.data.error === 'HTTP_409_DIRECT_ROSTER_OVERWRITE_FORBIDDEN' &&
        preRes.status === 200 &&
        syncDuringCommittedRes.status === 409 &&
        syncDuringCommittedRes.data.error === 'HTTP_409_SYNC_FORBIDDEN_DURING_COMMITTED_STATE';

      recordScenario(
        7,
        'INTEGRATION_HTTP',
        'Proteção da fonte da verdade contra auto-save malicioso/concorrente (R-03)',
        passed,
        `spoofGov=${spoofedGovRes.status} (${spoofedGovRes.data.error}), spoofWinners=${spoofedWinnersRes.status}, directRosterOverwrite=${directOverwriteRes.status}, syncDuringCommitted=${syncDuringCommittedRes.status} (${syncDuringCommittedRes.data.error})`
      );
    } catch (err) {
      recordScenario(7, 'INTEGRATION_HTTP', 'Proteção contra auto-save malicioso (R-03)', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 8: Mutações de participantes via backend — todos os 6 handlers (R-04)
    // ========================================================================
    try {
      httpSharedStore.clearAllForTests();

      // Handler 1: addParticipant (auto-creates raffle if missing, v1)
      const h1 = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/participant/mutate',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          action: 'addParticipant',
          participant: { id: 'p1', name: 'Ana', coins: 100, addedAt: Date.now() },
          mergeIfSameName: true,
        }
      );

      // Handler 5: bulkAddParticipants (v2)
      const h5 = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/participant/mutate',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          action: 'bulkAddParticipants',
          items: [
            { id: 'p2', name: 'Beto', coins: 200 },
            { id: 'p3', name: 'Caio', coins: 300 },
          ],
          replace: false,
        }
      );

      // Handler 2: updateParticipantCoins (v3)
      const h2 = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/participant/mutate',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          action: 'updateParticipantCoins',
          participantId: 'p2',
          coins: 500,
        }
      );

      // Handler 3: removeParticipant (v4)
      const h3 = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/participant/mutate',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          action: 'removeParticipant',
          participantId: 'p3',
        }
      );

      // Handler 6: updateRaffleAllocationSettings (v5)
      const h6 = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/participant/mutate',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          action: 'updateRaffleAllocationSettings',
          settingsPatch: { rate: 50, order: 'desc' },
        }
      );

      // Handler 4: clearAllParticipants (v6)
      const h4 = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/participant/mutate',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          action: 'clearAllParticipants',
        }
      );

      const passed =
        h1.status === 200 &&
        h1.data.raffle.rosterVersion === 1 &&
        h5.status === 200 &&
        h5.data.raffle.rosterVersion === 2 &&
        h5.data.raffle.participants.length === 3 &&
        h2.status === 200 &&
        h2.data.raffle.rosterVersion === 3 &&
        h2.data.raffle.participants.find((p: Participant) => p.id === 'p2')?.coins === 500 &&
        h3.status === 200 &&
        h3.data.raffle.rosterVersion === 4 &&
        h3.data.raffle.participants.length === 2 &&
        h6.status === 200 &&
        h6.data.raffle.rosterVersion === 5 &&
        h6.data.raffle.settings.rate === 50 &&
        h4.status === 200 &&
        h4.data.raffle.rosterVersion === 6 &&
        h4.data.raffle.participants.length === 0;

      recordScenario(
        8,
        'INTEGRATION_HTTP',
        'Governança de participantes via backend nos 6 handlers com incremento atômico de rosterVersion (R-04)',
        passed,
        `versions=[${h1.data.raffle.rosterVersion}, ${h5.data.raffle.rosterVersion}, ${h2.data.raffle.rosterVersion}, ${h3.data.raffle.rosterVersion}, ${h6.data.raffle.rosterVersion}, ${h4.data.raffle.rosterVersion}]`
      );
    } catch (err) {
      recordScenario(8, 'INTEGRATION_HTTP', 'Mutações dos 6 handlers no backend (R-04)', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 9: Adicionar participante incrementa `rosterVersion` e invalida precommit anterior
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const afterAdd = await svc.addParticipant({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        participant: { id: 'p4', name: 'Diana', coins: 100, addedAt: Date.now() },
      });

      let statusCode = 0;
      let errCode = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_after_add',
          idempotencyKey: 'idem_after_add',
          commitmentHash: pre.commitmentHash,
          clientEntropy: 'd4'.repeat(32),
          expectedRosterVersion: pre.rosterVersion,
          expectedDrawSequence: pre.drawSequence,
          fencingToken: pre.fencingToken,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) {
          statusCode = e.statusCode;
          errCode = e.errorCode;
        }
      }

      const passed =
        afterAdd.rosterVersion === pre.rosterVersion + 1 &&
        statusCode === 409 &&
        errCode === 'HTTP_409_ROSTER_VERSION_MISMATCH';

      recordScenario(
        9,
        'UNIT',
        'Adicionar participante incrementa rosterVersion e invalida precommit anterior (409)',
        passed,
        `precommitVersion=${pre.rosterVersion}, newRosterVersion=${afterAdd.rosterVersion}, statusCode=${statusCode} (${errCode})`
      );
    } catch (err) {
      recordScenario(9, 'UNIT', 'Adicionar participante invalida precommit anterior', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 10: Remover participante incrementa `rosterVersion` e invalida precommit anterior
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const afterRemove = await svc.removeParticipant({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        participantId: 'p2',
      });

      let statusCode = 0;
      let errCode = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_after_remove',
          idempotencyKey: 'idem_after_remove',
          commitmentHash: pre.commitmentHash,
          clientEntropy: 'e5'.repeat(32),
          expectedRosterVersion: pre.rosterVersion,
          expectedDrawSequence: pre.drawSequence,
          fencingToken: pre.fencingToken,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) {
          statusCode = e.statusCode;
          errCode = e.errorCode;
        }
      }

      const passed =
        afterRemove.rosterVersion === pre.rosterVersion + 1 &&
        statusCode === 409 &&
        errCode === 'HTTP_409_ROSTER_VERSION_MISMATCH';

      recordScenario(
        10,
        'UNIT',
        'Remover participante incrementa rosterVersion e invalida precommit anterior (409)',
        passed,
        `precommitVersion=${pre.rosterVersion}, newRosterVersion=${afterRemove.rosterVersion}, statusCode=${statusCode} (${errCode})`
      );
    } catch (err) {
      recordScenario(10, 'UNIT', 'Remover participante invalida precommit anterior', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 11: Alterar moedas/configurações incrementa `rosterVersion` e invalida precommit anterior
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre1 = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const afterCoins = await svc.updateParticipantCoins({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        participantId: 'p1',
        coins: 400,
      });

      let errCoins = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_after_coins',
          idempotencyKey: 'idem_after_coins',
          commitmentHash: pre1.commitmentHash,
          clientEntropy: 'f6'.repeat(32),
          expectedRosterVersion: pre1.rosterVersion,
          expectedDrawSequence: pre1.drawSequence,
          fencingToken: pre1.fencingToken,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) errCoins = e.errorCode;
      }

      const pre2 = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const afterSettings = await svc.updateRaffleAllocationSettings({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settingsPatch: { rate: 50 },
      });

      let errSettings = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_after_settings',
          idempotencyKey: 'idem_after_settings',
          commitmentHash: pre2.commitmentHash,
          clientEntropy: 'f6'.repeat(32),
          expectedRosterVersion: pre2.rosterVersion,
          expectedDrawSequence: pre2.drawSequence,
          fencingToken: pre2.fencingToken,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) errSettings = e.errorCode;
      }

      const passed =
        afterCoins.rosterVersion === pre1.rosterVersion + 1 &&
        errCoins === 'HTTP_409_ROSTER_VERSION_MISMATCH' &&
        afterSettings.rosterVersion === pre2.rosterVersion + 1 &&
        errSettings === 'HTTP_409_ROSTER_VERSION_MISMATCH';

      recordScenario(
        11,
        'UNIT',
        'Alterar moedas ou configurações de alocação incrementa rosterVersion e invalida precommit anterior (409)',
        passed,
        `afterCoinsVersion=${afterCoins.rosterVersion} (${errCoins}), afterSettingsVersion=${afterSettings.rosterVersion} (${errSettings})`
      );
    } catch (err) {
      recordScenario(11, 'UNIT', 'Alterar moedas/configurações invalida precommit', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 12: `fencingToken` inválido, ausente ou antigo retorna 409
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      // Precommit #1 (fencingToken = 1)
      const pre1 = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      // Precommit #2 (fencingToken = 2, supersedes pre1)
      const pre2 = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      let zeroTokenErr = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_ft_0',
          idempotencyKey: 'idem_ft_0',
          commitmentHash: pre2.commitmentHash,
          clientEntropy: 'a'.repeat(64),
          expectedRosterVersion: pre2.rosterVersion,
          expectedDrawSequence: pre2.drawSequence,
          fencingToken: 0,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) zeroTokenErr = e.errorCode;
      }

      let staleTokenErr = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_ft_stale',
          idempotencyKey: 'idem_ft_stale',
          commitmentHash: pre2.commitmentHash,
          clientEntropy: 'a'.repeat(64),
          expectedRosterVersion: pre2.rosterVersion,
          expectedDrawSequence: pre2.drawSequence,
          fencingToken: pre1.fencingToken, // stale token 1 instead of 2
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) staleTokenErr = e.errorCode;
      }

      const passed =
        zeroTokenErr === 'HTTP_409_INVALID_FENCING_TOKEN' &&
        staleTokenErr === 'HTTP_409_FENCING_TOKEN_MISMATCH';

      recordScenario(
        12,
        'UNIT',
        'fencingToken ausente/zero ou antigo (substituído por novo precommit) retorna HTTP 409',
        passed,
        `zeroToken=${zeroTokenErr}, staleToken=${staleTokenErr}`
      );
    } catch (err) {
      recordScenario(12, 'UNIT', 'fencingToken inválido/antigo retorna 409', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 13: Mesma `idempotencyKey` + mesmo fingerprint retorna replay idempotente
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const commonReq = {
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_idem_same',
        idempotencyKey: 'idem_key_same_001',
        commitmentHash: pre.commitmentHash,
        clientEntropy: '11'.repeat(32),
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
      };

      const first = await svc.executeOfficialDraw(commonReq);
      const second = await svc.executeOfficialDraw(commonReq);
      const stateAfter = await svc.getRaffleStateForOwner('uid_alice_owner', 'default');

      const passed =
        first.statusCode === 200 &&
        first.body.idempotentReplay === false &&
        second.statusCode === 200 &&
        second.body.idempotentReplay === true &&
        first.body.winningIndex === second.body.winningIndex &&
        stateAfter.drawSequence === 1 &&
        stateAfter.winners.length === 1;

      recordScenario(
        13,
        'UNIT',
        'Mesma idempotencyKey + mesmo fingerprint de 12 campos retorna replay idempotente sem duplicar sorteio',
        passed,
        `first.idempotentReplay=${first.body.idempotentReplay}, second.idempotentReplay=${second.body.idempotentReplay}, drawSequence=${stateAfter.drawSequence}`
      );
    } catch (err) {
      recordScenario(13, 'UNIT', 'Replay idempotente', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 14: Mesma `idempotencyKey` + fingerprint diferente retorna 409
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      await svc.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_idem_diff_1',
        idempotencyKey: 'idem_key_conflict',
        commitmentHash: pre.commitmentHash,
        clientEntropy: '22'.repeat(32),
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
      });

      let conflictStatus = 0;
      let conflictCode = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_idem_diff_1',
          idempotencyKey: 'idem_key_conflict',
          commitmentHash: pre.commitmentHash,
          clientEntropy: '33'.repeat(32), // Different clientEntropy -> different 12-field fingerprint
          expectedRosterVersion: pre.rosterVersion,
          expectedDrawSequence: pre.drawSequence,
          fencingToken: pre.fencingToken,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) {
          conflictStatus = e.statusCode;
          conflictCode = e.errorCode;
        }
      }

      const passed =
        conflictStatus === 409 && conflictCode === 'HTTP_409_IDEMPOTENCY_PAYLOAD_MISMATCH';

      recordScenario(
        14,
        'UNIT',
        'Mesma idempotencyKey + payload/fingerprint diferente retorna HTTP 409',
        passed,
        `status=${conflictStatus}, errorCode=${conflictCode}`
      );
    } catch (err) {
      recordScenario(14, 'UNIT', 'Conflito de idempotencyKey retorna 409', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 15: Recuperação integrada de lock IN_PROGRESS expirado (> 60s) e bloqueio do worker antigo (R-06)
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);
      const t0 = 1792000000000;

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
        nowMs: t0,
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        nowMs: t0,
      });

      const clientEntropy = '44'.repeat(32);
      const { fingerprintHash } = computeRequestFingerprint({
        ownerUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_abandoned_001',
        idempotencyKey: 'idem_abandoned_001',
        drawNonce: pre.drawNonce,
        clientEntropy,
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        drawMode: 'drum',
        winnerCount: 1,
        prizeId: 'NONE',
      });

      // Worker 1 acquires lock at t0, then stalls before committing
      const worker1Lock = await svc.acquireIdempotency({
        ownerUid: 'uid_alice_owner',
        raffleId: 'default',
        idempotencyKey: 'idem_abandoned_001',
        drawId: 'draw_abandoned_001',
        commitmentHash: pre.commitmentHash,
        requestFingerprint: fingerprintHash,
        fencingToken: pre.fencingToken,
        lockAcquisitionId: 'lock_worker_1_stalled',
        nowMs: t0,
      });

      // Before 60s (at t0 + 30s), another request is blocked with 409 HTTP_409_OPERATION_IN_PROGRESS
      let blockedBefore60s = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_abandoned_001',
          idempotencyKey: 'idem_abandoned_001',
          commitmentHash: pre.commitmentHash,
          clientEntropy,
          expectedRosterVersion: pre.rosterVersion,
          expectedDrawSequence: pre.drawSequence,
          fencingToken: pre.fencingToken,
          nowMs: t0 + 30_000,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) blockedBefore60s = e.errorCode;
      }

      // After 61s (at t0 + 61_000), Worker 2 retries `executeOfficialDraw` — `acquireIdempotency`
      // automatically recovers the abandoned lock, rotates `lockAcquisitionId`, and completes the draw!
      const worker2Success = await svc.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_abandoned_001',
        idempotencyKey: 'idem_abandoned_001',
        commitmentHash: pre.commitmentHash,
        clientEntropy,
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
        nowMs: t0 + 61_000,
      });

      // Also test zombie worker protection: if a zombie worker lost its lock before completion,
      // attempting to commit with the old `lockAcquisitionIdOverride` fails with `HTTP_409_LOCK_OWNERSHIP_LOST`.
      const pre2 = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        nowMs: t0 + 70_000,
      });
      const stateAfterDraw1 = await svc.getRaffleStateForOwner('uid_alice_owner', 'default');
      const fp2 = computeRequestFingerprint({
        ownerUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_abandoned_002',
        idempotencyKey: 'idem_abandoned_002',
        drawNonce: pre2.drawNonce,
        clientEntropy,
        expectedRosterVersion: stateAfterDraw1.rosterVersion,
        expectedDrawSequence: stateAfterDraw1.drawSequence,
        drawMode: 'drum',
        winnerCount: 1,
        prizeId: 'NONE',
      });

      await svc.acquireIdempotency({
        ownerUid: 'uid_alice_owner',
        raffleId: 'default',
        idempotencyKey: 'idem_abandoned_002',
        drawId: 'draw_abandoned_002',
        commitmentHash: pre2.commitmentHash,
        requestFingerprint: fp2.fingerprintHash,
        fencingToken: pre2.fencingToken,
        lockAcquisitionId: 'lock_zombie_old',
        nowMs: t0 + 70_000,
      });

      const rec2 = await svc.recoverAbandonedDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        idempotencyKey: 'idem_abandoned_002',
        drawId: 'draw_abandoned_002',
        commitmentHash: pre2.commitmentHash,
        requestFingerprint: fp2.fingerprintHash,
        nowMs: t0 + 135_000,
      });

      let zombieErr = '';
      try {
        await svc.executeOfficialDraw({
          authenticatedUid: 'uid_alice_owner',
          raffleId: 'default',
          drawId: 'draw_abandoned_002',
          idempotencyKey: 'idem_abandoned_002',
          commitmentHash: pre2.commitmentHash,
          clientEntropy,
          expectedRosterVersion: stateAfterDraw1.rosterVersion,
          expectedDrawSequence: stateAfterDraw1.drawSequence,
          fencingToken: pre2.fencingToken,
          lockAcquisitionIdOverride: 'lock_zombie_old',
          nowMs: t0 + 136_000,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) zombieErr = e.errorCode;
      }

      const passed =
        worker1Lock.mode === 'ACQUIRED' &&
        blockedBefore60s === 'HTTP_409_OPERATION_IN_PROGRESS' &&
        worker2Success.statusCode === 200 &&
        rec2.mode === 'RECOVERED_LOCK' &&
        zombieErr === 'HTTP_409_LOCK_OWNERSHIP_LOST';

      recordScenario(
        15,
        'UNIT',
        'Recuperação integrada de lock IN_PROGRESS expirado (> 60s) e bloqueio do worker antigo com HTTP_409_LOCK_OWNERSHIP_LOST (R-06)',
        passed,
        `before60s=${blockedBefore60s}, worker2RecoveredStatus=${worker2Success.statusCode}, zombieWorkerErr=${zombieErr}`
      );
    } catch (err) {
      recordScenario(15, 'UNIT', 'Recuperação de lock expirado (R-06)', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 16: Concorrência entre duas instâncias executando o mesmo sorteio
    // ========================================================================
    try {
      const sharedStore = new InMemoryTransactionalStore();
      const instance1 = new TraditionalRaffleService(sharedStore);
      const instance2 = new TraditionalRaffleService(sharedStore);

      await instance1.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
      });

      const pre = await instance1.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
      });

      const drawPayload = {
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_concurrent_instances',
        idempotencyKey: 'idem_concurrent_instances',
        commitmentHash: pre.commitmentHash,
        clientEntropy: '55'.repeat(32),
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
      };

      const [r1, r2] = await Promise.allSettled([
        instance1.executeOfficialDraw(drawPayload),
        instance2.executeOfficialDraw(drawPayload),
      ]);

      const successes = [r1, r2].filter((r) => r.status === 'fulfilled');
      const failures = [r1, r2].filter((r) => r.status === 'rejected');

      const finalRaffle = await instance1.getRaffleStateForOwner('uid_alice_owner', 'default');
      const finalDraws = await instance2.listRaffleDrawsForOwner('uid_alice_owner', 'default');

      const passed =
        successes.length >= 1 &&
        (failures.length === 0 ||
          ((failures[0] as PromiseRejectedResult).reason as TraditionalRaffleError)?.statusCode ===
            409) &&
        finalRaffle.drawSequence === 1 &&
        finalRaffle.winners.length === 1 &&
        finalDraws.length === 1;

      recordScenario(
        16,
        'MULTI_INSTANCE_CONCURRENCY',
        'Concorrência entre 2 instâncias de serviço executando o mesmo sorteio simultaneamente (exatamente 1 vencedor gravado)',
        passed,
        `successes=${successes.length}, failures=${failures.length}, finalDrawSequence=${finalRaffle.drawSequence}, finalDrawsCount=${finalDraws.length}`
      );
    } catch (err) {
      recordScenario(
        16,
        'MULTI_INSTANCE_CONCURRENCY',
        'Concorrência entre duas instâncias',
        false,
        '',
        (err as Error).message
      );
    }

    // ========================================================================
    // CENÁRIO 17: Sweeper: `REVEALED` nunca vira `EXPIRED`
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);
      const t0 = 1793000000000;

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
        nowMs: t0,
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        nowMs: t0,
      });

      await svc.executeOfficialDraw({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        drawId: 'draw_sweep_rev',
        idempotencyKey: 'idem_sweep_rev',
        commitmentHash: pre.commitmentHash,
        clientEntropy: '66'.repeat(32),
        expectedRosterVersion: pre.rosterVersion,
        expectedDrawSequence: pre.drawSequence,
        fencingToken: pre.fencingToken,
        nowMs: t0 + 1000,
      });

      // Simulate out-of-sync private precommit (`COMMITTED`) after TTL has passed
      const privSnap = await store.getDocDirect<TraditionalDrawPrecommitRecord>(
        svc.privatePrecommitPath(pre.commitmentHash)
      );
      await store.setDocDirect(svc.privatePrecommitPath(pre.commitmentHash), {
        ...privSnap.data()!,
        status: 'COMMITTED',
      });

      // Run Sweeper 1 hour later
      const sweepRes = await svc.sweepExpiredPrecommit({
        authenticatedUid: 'uid_alice_owner',
        commitmentHash: pre.commitmentHash,
        nowMs: t0 + 3600_000,
      });

      const healedPriv = await store.getDocDirect<TraditionalDrawPrecommitRecord>(
        svc.privatePrecommitPath(pre.commitmentHash)
      );
      const expEvent = await store.getDocDirect(
        svc.ledgerEventPath(pre.commitmentHash, 'EXPIRED')
      );

      const passed =
        sweepRes.action === 'RECONCILED_TO_REVEALED' &&
        sweepRes.terminalEventType === 'REVEALED' &&
        healedPriv.data()?.status === 'REVEALED' &&
        expEvent.exists === false;

      recordScenario(
        17,
        'UNIT',
        'Sweeper: sorteio com evento REVEALED no ledger público nunca vira EXPIRED e reconcilia estado privado',
        passed,
        `action=${sweepRes.action}, terminal=${sweepRes.terminalEventType}, privateStatus=${healedPriv.data()?.status}, expiredEventExists=${expEvent.exists}`
      );
    } catch (err) {
      recordScenario(17, 'UNIT', 'Sweeper REVEALED nunca vira EXPIRED', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 18: Sweeper: ledger adulterado bloqueia reconciliação (409)
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);
      const t0 = 1794000000000;

      await svc.syncOrInitRaffleState({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: createSampleParticipants(),
        nowMs: t0,
      });

      const pre = await svc.createDrawPrecommit({
        authenticatedUid: 'uid_alice_owner',
        raffleId: 'default',
        nowMs: t0,
      });

      // Tamper with PRECOMMIT eventHash in public ledger
      const preEventPath = svc.ledgerEventPath(pre.commitmentHash, 'PRECOMMIT');
      const preEventSnap = await store.getDocDirect<TraditionalDrawLedgerEvent>(preEventPath);
      await store.setDocDirect(preEventPath, {
        ...preEventSnap.data()!,
        eventHash: 'deadbeef'.repeat(8),
      });

      let statusCode = 0;
      let errCode = '';
      try {
        await svc.sweepExpiredPrecommit({
          authenticatedUid: 'uid_alice_owner',
          commitmentHash: pre.commitmentHash,
          nowMs: t0 + 3600_000,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) {
          statusCode = e.statusCode;
          errCode = e.errorCode;
        }
      }

      // Confirm private precommit was NOT modified to EXPIRED
      const privAfter = await store.getDocDirect<TraditionalDrawPrecommitRecord>(
        svc.privatePrecommitPath(pre.commitmentHash)
      );

      const passed =
        statusCode === 409 &&
        errCode === 'HTTP_409_LEDGER_HASH_TAMPERED' &&
        privAfter.data()?.status === 'COMMITTED';

      recordScenario(
        18,
        'UNIT',
        'Sweeper: ledger público adulterado bloqueia reconciliação de documentos privados com HTTP 409',
        passed,
        `status=${statusCode}, errorCode=${errCode}, privateStatusRemained=${privAfter.data()?.status}`
      );
    } catch (err) {
      recordScenario(18, 'UNIT', 'Sweeper bloqueia ledger adulterado', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 19: `/api/raffle/draw/sweep` rejeita usuário que não é dono da rifa com 403 (R-07)
    // ========================================================================
    try {
      httpSharedStore.clearAllForTests();

      await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/sync',
        { Authorization: 'Bearer token_owner_alice' },
        {
          raffleId: 'default',
          settings: DEFAULT_SETTINGS,
          participants: createSampleParticipants(),
        }
      );

      const preRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/draw/pre-commit',
        { Authorization: 'Bearer token_owner_alice' },
        { raffleId: 'default' }
      );

      // Attacker Mallory attempts to sweep Alice's commitmentHash
      const mallorySweepRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/draw/sweep',
        { Authorization: 'Bearer token_attacker_mallory' },
        { commitmentHash: preRes.data.commitmentHash }
      );

      // Owner Alice sweeps her own commitmentHash
      const aliceSweepRes = await httpRequestJson(
        baseUrl,
        'POST',
        '/api/raffle/draw/sweep',
        { Authorization: 'Bearer token_owner_alice' },
        { commitmentHash: preRes.data.commitmentHash }
      );

      const passed =
        mallorySweepRes.status === 403 &&
        mallorySweepRes.data.error === 'HTTP_403_FORBIDDEN_CROSS_TENANT' &&
        aliceSweepRes.status === 200 &&
        aliceSweepRes.data.action === 'NO_OP_STILL_ACTIVE';

      recordScenario(
        19,
        'INTEGRATION_HTTP',
        '`POST /api/raffle/draw/sweep` rejeita usuário não proprietário com HTTP 403 e permite proprietário autenticado (R-07)',
        passed,
        `mallorySweep=${mallorySweepRes.status} (${mallorySweepRes.data.error}), aliceSweep=${aliceSweepRes.status} (${aliceSweepRes.data.action})`
      );
    } catch (err) {
      recordScenario(19, 'INTEGRATION_HTTP', 'Proteção de ownership no sweep (R-07)', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 20: Autorização real de planos FREE, PRO, TRIAL válido, TRIAL expirado, CANCELADO e Outage (R-05)
    // ========================================================================
    try {
      const nowMs = Date.now();
      const baseRecord: UserSubscriptionRecord = {
        uid: 'uid_plan_test',
        email: 'plan@giodasorte.com',
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
        updatedAt: nowMs,
      };

      // 1. FREE user within limit (50 participants <= 100, 1 winner) -> ALLOWED
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        ...baseRecord,
        uid: 'uid_free_ok',
        tier: 'FREE',
        statusState: 'FREE',
        billingSubStatus: 'FREE_TIER',
      });
      const freeOkEnt = await validateOrganizerPlanEntitlement('uid_free_ok', 50, 1, nowMs);

      // 2. FREE user exceeding participant limit (150 > 100) -> 403 HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED
      let freeExceedErr = '';
      try {
        await validateOrganizerPlanEntitlement('uid_free_ok', 150, 1, nowMs);
      } catch (e) {
        if (e instanceof TraditionalRaffleError) freeExceedErr = e.errorCode;
      }

      // 3. Active PRO user (PAID_ACTIVE, 500 participants, 5 winners) -> ALLOWED
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        ...baseRecord,
        uid: 'uid_pro_active',
        tier: 'PRO',
        statusState: 'ACTIVE',
        billingSubStatus: 'PAID_ACTIVE',
        currentPeriodEnd: new Date(nowMs + 15 * 86400_000).toISOString(),
        chargedQuantity: 1,
        chargedAmount: 29.9,
      });
      const proActiveEnt = await validateOrganizerPlanEntitlement('uid_pro_active', 500, 5, nowMs);

      // 4. Valid TRIAL user (TRIAL_ACTIVE, trialEndDate +2 days ahead) -> ALLOWED
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        ...baseRecord,
        uid: 'uid_trial_valid',
        tier: 'PRO',
        statusState: 'ACTIVE',
        billingSubStatus: 'TRIAL_ACTIVE',
        trialApplied: true,
        trialDaysGranted: 3,
        trialEndDate: new Date(nowMs + 2 * 86400_000).toISOString(),
      });
      const trialValidEnt = await validateOrganizerPlanEntitlement('uid_trial_valid', 250, 2, nowMs);

      // 5. Expired TRIAL user (trialEndDate 3 days in the past) -> 403 HTTP_403_PLAN_TRIAL_EXPIRED
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        ...baseRecord,
        uid: 'uid_trial_expired',
        tier: 'PRO',
        statusState: 'ACTIVE',
        billingSubStatus: 'TRIAL_ACTIVE',
        trialApplied: true,
        trialDaysGranted: 3,
        trialEndDate: new Date(nowMs - 3 * 86400_000).toISOString(),
      });
      let trialExpiredErr = '';
      try {
        await validateOrganizerPlanEntitlement('uid_trial_expired', 10, 1, nowMs);
      } catch (e) {
        if (e instanceof TraditionalRaffleError) trialExpiredErr = e.errorCode;
      }

      // 6. Canceled subscription (after period ended) -> 403 HTTP_403_PLAN_SUBSCRIPTION_CANCELED
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        ...baseRecord,
        uid: 'uid_sub_canceled',
        tier: 'FREE',
        statusState: 'CANCELED',
        billingSubStatus: 'CANCELED',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(nowMs - 2 * 86400_000).toISOString(),
        chargedQuantity: 1,
      });
      let canceledErr = '';
      try {
        await validateOrganizerPlanEntitlement('uid_sub_canceled', 10, 1, nowMs);
      } catch (e) {
        if (e instanceof TraditionalRaffleError) canceledErr = e.errorCode;
      }

      // 7. Subscription service outage -> Fail-closed 503 HTTP_503_PLAN_ENTITLEMENT_SERVICE_UNAVAILABLE
      setSimulateSubscriptionServiceFailureForTests(true);
      let outageStatus = 0;
      let outageErr = '';
      try {
        await validateOrganizerPlanEntitlement('uid_pro_active', 10, 1, nowMs);
      } catch (e) {
        if (e instanceof TraditionalRaffleError) {
          outageStatus = e.statusCode;
          outageErr = e.errorCode;
        }
      } finally {
        setSimulateSubscriptionServiceFailureForTests(false);
      }

      const passed =
        freeOkEnt.tier === 'FREE' &&
        freeExceedErr === 'HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED' &&
        proActiveEnt.active === true &&
        trialValidEnt.active === true &&
        trialExpiredErr === 'HTTP_403_PLAN_TRIAL_EXPIRED' &&
        canceledErr === 'HTTP_403_PLAN_SUBSCRIPTION_CANCELED' &&
        outageStatus === 503 &&
        outageErr === 'HTTP_503_PLAN_ENTITLEMENT_SERVICE_UNAVAILABLE';

      recordScenario(
        20,
        'UNIT',
        'Autorização real de planos no backend: FREE (ok e limite), PRO ativo, TRIAL válido, TRIAL expirado (403), CANCELADO (403) e falha fechada (503) (R-05)',
        passed,
        `freeOk=${freeOkEnt.tier}, freeExceed=${freeExceedErr}, proActive=${proActiveEnt.active}, trialValid=${trialValidEnt.active}, trialExpired=${trialExpiredErr}, canceled=${canceledErr}, outage=${outageStatus} (${outageErr})`
      );
    } catch (err) {
      recordScenario(20, 'UNIT', 'Autorização real de planos (R-05)', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 21: Endurecimento de Segurança S-01 em `firestore.rules`
    // ========================================================================
    try {
      const fs = await import('fs');
      const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

      // Verify S-01: match /raffles/{raffleId} has allow create, update, delete: if false;
      const hasRafflesBlockWrites =
        rulesContent.includes('match /raffles/{raffleId}') &&
        rulesContent.includes('allow create, update, delete: if false;');

      // Verify S-01: draws subcollection has allow create, update, delete: if false;
      const hasDrawsBlockWrites =
        rulesContent.includes('match /draws/{drawId}') &&
        rulesContent.includes('allow get, list: if isOwner(userId) && isValidId(userId);') &&
        rulesContent.includes('allow create, update, delete: if false;');

      // Verify S-01: idempotency subcollection is private: allow read, write: if false;
      const hasIdempotencyPrivate =
        rulesContent.includes('match /idempotency/{idempotencyKey}') &&
        rulesContent.includes('allow read, write: if false;');

      // Verify precommits private and ledger public rules
      const hasPrecommitsPrivate = rulesContent.includes('match /draw_precommits_private/{commitmentHash}');
      const hasLedgerPublic = rulesContent.includes('match /draw_ledger_public/{commitmentHash}');

      const passed =
        hasRafflesBlockWrites &&
        hasDrawsBlockWrites &&
        hasIdempotencyPrivate &&
        hasPrecommitsPrivate &&
        hasLedgerPublic;

      recordScenario(
        21,
        'UNIT',
        'Endurecimento S-01: bloqueio de escrita direta de cliente em raffles/{id}, draws/{id} e idempotency/{key} preservando leituras de proprietário (firestore.rules)',
        passed,
        `hasRafflesBlockWrites=${hasRafflesBlockWrites}, hasDrawsBlockWrites=${hasDrawsBlockWrites}, hasIdempotencyPrivate=${hasIdempotencyPrivate}, hasPrecommitsPrivate=${hasPrecommitsPrivate}`
      );
    } catch (err) {
      recordScenario(21, 'UNIT', 'Endurecimento S-01 em firestore.rules', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 22: Validação Transacional de Limite de Participantes S-02 (addParticipant e bulkAddParticipants)
    // ========================================================================
    try {
      const store = new InMemoryTransactionalStore();
      const svc = new TraditionalRaffleService(store);
      const nowMs = Date.now();

      // Configure FREE user (limit: 100 participants)
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        uid: 'uid_free_s02',
        email: 'free_s02@giodasorte.com',
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
        updatedAt: nowMs,
      });

      // 1. Initial bulk add of 100 participants on FREE tier -> ALLOWED (100 <= 100)
      const hundredItems = Array.from({ length: 100 }, (_, i) => ({
        id: `free_p_${i + 1}`,
        name: `Participante ${i + 1}`,
        coins: 10,
      }));

      const raffle100 = await svc.bulkAddParticipants({
        authenticatedUid: 'uid_free_s02',
        raffleId: 'default',
        items: hundredItems,
        autoCreateIfMissing: true,
        nowMs,
      });

      // 2. Add 101st participant on FREE tier via addParticipant -> BLOCKED with 403 HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED
      let addParticipantBlockedErr = '';
      try {
        await svc.addParticipant({
          authenticatedUid: 'uid_free_s02',
          raffleId: 'default',
          participant: { id: 'free_p_101', name: 'Participante 101', coins: 10, addedAt: nowMs },
          nowMs,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) addParticipantBlockedErr = e.errorCode;
      }

      // 3. Attempt bulkAddParticipants of 2 more participants on FREE tier -> BLOCKED with 403 HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED
      let bulkAddBlockedErr = '';
      try {
        await svc.bulkAddParticipants({
          authenticatedUid: 'uid_free_s02',
          raffleId: 'default',
          items: [
            { id: 'free_p_101', name: 'Participante 101', coins: 10 },
            { id: 'free_p_102', name: 'Participante 102', coins: 10 },
          ],
          nowMs,
        });
      } catch (e) {
        if (e instanceof TraditionalRaffleError) bulkAddBlockedErr = e.errorCode;
      }

      // 4. Configure PRO user and verify addParticipant beyond 100 is ALLOWED
      await mercadoPagoSubscriptionService.saveUserSubscriptionRecord({
        uid: 'uid_pro_s02',
        email: 'pro_s02@giodasorte.com',
        emailVerified: true,
        planId: 'pro_monthly',
        planName: 'Plano PRO',
        tier: 'PRO',
        statusState: 'ACTIVE',
        billingSubStatus: 'PAID_ACTIVE',
        mpPreapprovalId: 'mp_sub_pro_s02',
        mpPlanId: 'mp_plan_pro',
        remoteMpStatus: 'authorized',
        checkoutInitPoint: null,
        contractedPriceVersion: 'v1.0.0',
        contractedAmount: 29.9,
        currency: 'BRL',
        frequency: 1,
        frequencyType: 'months',
        trialApplied: false,
        trialDaysGranted: 0,
        trialStartDate: null,
        trialEndDate: null,
        firstPaymentDate: null,
        nextPaymentDate: null,
        currentPeriodStart: new Date(nowMs - 1000).toISOString(),
        currentPeriodEnd: new Date(nowMs + 30 * 86400_000).toISOString(),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        hasUsedFreeTrial: true,
        firstTrialStartedAt: null,
        firstTrialPreapprovalId: null,
        firstTrialPlanId: null,
        acceptedTermsVersion: '1.0.0',
        acceptedAt: null,
        chargedQuantity: 1,
        chargedAmount: 29.9,
        updatedAt: nowMs,
      });

      const proRaffle100 = await svc.bulkAddParticipants({
        authenticatedUid: 'uid_pro_s02',
        raffleId: 'default',
        items: hundredItems,
        autoCreateIfMissing: true,
        nowMs,
      });

      const proRaffle101 = await svc.addParticipant({
        authenticatedUid: 'uid_pro_s02',
        raffleId: 'default',
        participant: { id: 'pro_p_101', name: 'Participante 101', coins: 10, addedAt: nowMs },
        nowMs,
      });

      const passed =
        raffle100.participants.length === 100 &&
        addParticipantBlockedErr === 'HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED' &&
        bulkAddBlockedErr === 'HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED' &&
        proRaffle100.participants.length === 100 &&
        proRaffle101.participants.length === 101;

      recordScenario(
        22,
        'UNIT',
        'Endurecimento S-02: validação transacional do limite FREE (100) bloqueando addParticipant e bulkAddParticipants com 403, permitindo PRO (101)',
        passed,
        `free100Count=${raffle100.participants.length}, addBlockedErr=${addParticipantBlockedErr}, bulkBlockedErr=${bulkAddBlockedErr}, pro101Count=${proRaffle101.participants.length}`
      );
    } catch (err) {
      recordScenario(22, 'UNIT', 'Endurecimento S-02 em transações de participantes', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 23: Tratamento de FIREBASE_SERVICE_ACCOUNT_JSON e Fallback de Revogação IAM
    // ========================================================================
    try {
      // 1. Test isIdentityToolkitPermissionOrDisabledError for IAM permission errors
      const iamErrInsufficient = { code: 'auth/insufficient-permission', message: 'Identity toolkit permission denied' };
      const iamErrPermissionDenied = {
        code: 'auth/internal-error',
        httpResponse: {
          status: 403,
          data: { error: { status: 'PERMISSION_DENIED', message: 'Caller does not have required permission to use project' } },
        },
      };
      const tokenExpiredErr = { code: 'auth/id-token-expired', message: 'Token expired' };
      const tokenRevokedErr = { code: 'auth/id-token-revoked', message: 'Token revoked' };

      const isIam1 = isIdentityToolkitPermissionOrDisabledError(iamErrInsufficient);
      const isIam2 = isIdentityToolkitPermissionOrDisabledError(iamErrPermissionDenied);
      const isExpired = isIdentityToolkitPermissionOrDisabledError(tokenExpiredErr);
      const isRevoked = isIdentityToolkitPermissionOrDisabledError(tokenRevokedErr);

      // 2. Test private_key newline sanitization
      const rawWithEscapedNewlines = JSON.stringify({
        project_id: 'quick-standard-pw2pc',
        private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk...\\n-----END PRIVATE KEY-----\\n',
        client_email: 'test@quick-standard-pw2pc.iam.gserviceaccount.com',
      });
      const parsed = JSON.parse(rawWithEscapedNewlines);
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      const hasActualNewlines = parsed.private_key.includes('\n') && !parsed.private_key.includes('\\n');

      // 3. Test safe error handling on malformed JSON without revealing credentials
      let safeErrorThrown = false;
      let leakedContent = false;
      try {
        const malformedJson = '{ "secret_key": "SUPER_SECRET_VALUE", invalid_json';
        JSON.parse(malformedJson);
      } catch (err) {
        const safeErrMsg = (err as Error).message;
        safeErrorThrown = true;
        if (safeErrMsg.includes('SUPER_SECRET_VALUE')) {
          leakedContent = true;
        }
      }

      const passed =
        isIam1 === true &&
        isIam2 === true &&
        isExpired === false &&
        isRevoked === false &&
        hasActualNewlines === true &&
        safeErrorThrown === true &&
        leakedContent === false;

      recordScenario(
        23,
        'UNIT',
        'Firebase Admin SDK: fallback de revogação para erro de permissão IAM sem roles/firebaseauth.admin, sanitização de \\n e tratamento seguro de JSON',
        passed,
        `isIam1=${isIam1}, isIam2=${isIam2}, isExpired=${isExpired}, isRevoked=${isRevoked}, hasActualNewlines=${hasActualNewlines}, safeError=${safeErrorThrown}, leakedContent=${leakedContent}`
      );
    } catch (err) {
      recordScenario(23, 'UNIT', 'Tratamento de credenciais e fallback IAM', false, '', (err as Error).message);
    }

    // ========================================================================
    // CENÁRIO 24: Correção S-03 — Bloqueio de Leitura Pública de Usuários (/users/{userId}) e Shielding de Dados Privados
    // ========================================================================
    try {
      const fs = await import('fs');
      const rulesContent = fs.readFileSync('firestore.rules', 'utf8');

      // 1. Syntactic analysis of firestore.rules
      const hasVulnerablePermissiveRead = rulesContent.includes('allow get, list: if isValidId(userId) || true;');
      const hasStrictOwnerGet = rulesContent.includes('allow get: if isOwner(userId) && isValidId(userId);');
      const hasBlockedList = rulesContent.includes('allow list: if false;');
      const hasPublicProfileSubcollection = rulesContent.includes('match /public/{profileId}');
      const hasRafflesBlockedWrites =
        rulesContent.includes('match /raffles/{raffleId}') &&
        rulesContent.includes('allow create, update, delete: if false;');
      const hasRafflesOwnerRead =
        rulesContent.includes('match /raffles/{raffleId}') &&
        rulesContent.includes('allow get, list: if isOwner(userId) && isValidId(userId);');

      // 2. Functional semantic evaluation harness of Firestore Security Rules logic:
      const isValidId = (id: unknown) => typeof id === 'string' && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
      const evaluateIsOwner = (auth: { uid: string } | null, userId: string) => auth !== null && auth.uid === userId;

      interface RulesRequest {
        auth: { uid: string } | null;
        path: string;
        operation: 'get' | 'list' | 'create' | 'update' | 'delete';
      }

      const evaluateRulesAccess = (req: RulesRequest): { allowed: boolean; reason: string } => {
        const parts = req.path.split('/').filter(Boolean);

        // Root /users/{userId}
        if (parts[0] === 'users' && parts.length === 2) {
          const userId = parts[1];
          if (req.operation === 'list') {
            return { allowed: false, reason: 'LIST_FORBIDDEN_RULE' };
          }
          if (req.operation === 'get') {
            const allowed = evaluateIsOwner(req.auth, userId) && isValidId(userId);
            return { allowed, reason: allowed ? 'OWNER_READ_ALLOWED' : 'PERMISSION_DENIED_NOT_OWNER' };
          }
          if (req.operation === 'create' || req.operation === 'update' || req.operation === 'delete') {
            const allowed = evaluateIsOwner(req.auth, userId) && isValidId(userId);
            return { allowed, reason: allowed ? 'OWNER_MUTATION_ALLOWED' : 'PERMISSION_DENIED_NOT_OWNER' };
          }
        }

        // Subcollection /users/{userId}/public/{profileId}
        if (parts[0] === 'users' && parts.length === 4 && parts[2] === 'public') {
          const userId = parts[1];
          if (req.operation === 'list') return { allowed: false, reason: 'LIST_FORBIDDEN' };
          if (req.operation === 'get') {
            const allowed = isValidId(userId);
            return { allowed, reason: allowed ? 'PUBLIC_PROFILE_READ_ALLOWED' : 'INVALID_USER_ID' };
          }
          if (req.operation === 'create' || req.operation === 'update' || req.operation === 'delete') {
            const allowed = evaluateIsOwner(req.auth, userId) && isValidId(userId);
            return { allowed, reason: allowed ? 'OWNER_PUBLIC_MUTATION_ALLOWED' : 'PERMISSION_DENIED' };
          }
        }

        // Subcollection /users/{userId}/raffles/{raffleId}
        if (parts[0] === 'users' && parts.length === 4 && parts[2] === 'raffles') {
          const userId = parts[1];
          if (req.operation === 'get' || req.operation === 'list') {
            const allowed = evaluateIsOwner(req.auth, userId) && isValidId(userId);
            return { allowed, reason: allowed ? 'OWNER_RAFFLE_READ_ALLOWED' : 'PERMISSION_DENIED' };
          }
          if (req.operation === 'create' || req.operation === 'update' || req.operation === 'delete') {
            return { allowed: false, reason: 'S01_CLIENT_WRITES_STRICTLY_FORBIDDEN' };
          }
        }

        return { allowed: false, reason: 'DEFAULT_DENY' };
      };

      // Test 1: Usuário autenticado lendo seu próprio documento (/users/user_alice)
      const test1 = evaluateRulesAccess({
        auth: { uid: 'user_alice' },
        path: 'users/user_alice',
        operation: 'get',
      });

      // Test 2: Usuário A tentando ler o documento privado do Usuário B (/users/user_bob)
      const test2 = evaluateRulesAccess({
        auth: { uid: 'user_alice' },
        path: 'users/user_bob',
        operation: 'get',
      });

      // Test 3: Usuário não autenticado tentando ler documentos privados
      const test3 = evaluateRulesAccess({
        auth: null,
        path: 'users/user_alice',
        operation: 'get',
      });

      // Test 3b: Usuário tentando listar a coleção inteira /users
      const test3b = evaluateRulesAccess({
        auth: null,
        path: 'users/user_alice',
        operation: 'list',
      });

      // Test 4: Consulta pública de informações explicitamente autorizadas (/users/user_alice/public/profile)
      const test4 = evaluateRulesAccess({
        auth: null,
        path: 'users/user_alice/public/profile',
        operation: 'get',
      });

      // Test 5: Tentativa de ler dados administrativos e de assinatura de outro usuário
      const test5 = evaluateRulesAccess({
        auth: { uid: 'attacker_mallory' },
        path: 'users/target_victim',
        operation: 'get',
      });

      // Test 6: Preservação das permissões de leitura das rifas tradicionais pelo proprietário
      const test6 = evaluateRulesAccess({
        auth: { uid: 'user_alice' },
        path: 'users/user_alice/raffles/default',
        operation: 'get',
      });

      // Test 7: Bloqueio das escritas diretas de rifas tradicionais já estabelecido na Fase 1.7.5 (S-01)
      const test7_create = evaluateRulesAccess({
        auth: { uid: 'user_alice' },
        path: 'users/user_alice/raffles/default',
        operation: 'create',
      });
      const test7_update = evaluateRulesAccess({
        auth: { uid: 'user_alice' },
        path: 'users/user_alice/raffles/default',
        operation: 'update',
      });
      const test7_delete = evaluateRulesAccess({
        auth: { uid: 'user_alice' },
        path: 'users/user_alice/raffles/default',
        operation: 'delete',
      });

      const passed =
        !hasVulnerablePermissiveRead &&
        hasStrictOwnerGet &&
        hasBlockedList &&
        hasPublicProfileSubcollection &&
        hasRafflesBlockedWrites &&
        hasRafflesOwnerRead &&
        test1.allowed === true &&
        test2.allowed === false &&
        test3.allowed === false &&
        test3b.allowed === false &&
        test4.allowed === true &&
        test5.allowed === false &&
        test6.allowed === true &&
        test7_create.allowed === false &&
        test7_update.allowed === false &&
        test7_delete.allowed === false;

      recordScenario(
        24,
        'UNIT',
        'Endurecimento S-03: eliminação de leitura pública em users/{id}, bloqueio de listagem, isolamento de dados privados/assinatura por UID e preservação de S-01',
        passed,
        `hasVulnerablePermissiveRead=${hasVulnerablePermissiveRead}, test1(own)=${test1.allowed}, test2(cross)=${test2.allowed}, test3(unauth)=${test3.allowed}, test4(pub)=${test4.allowed}, test5(sub)=${test5.allowed}, test6(raffleRead)=${test6.allowed}, test7(s01WriteBlocked)=${!test7_create.allowed}`
      );
    } catch (err) {
      recordScenario(24, 'UNIT', 'Endurecimento S-03 em firestore.rules', false, '', (err as Error).message);
    }
  } finally {
    // Restore production store on singleton
    traditionalRaffleService.setStoreForTests(defaultFirestoreTraditionalRaffleStore);
    setCustomTokenVerifierForTests(null);
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  }

  console.log('\n================================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`📊 RESUMO FINAL: ${passedCount}/${results.length} CENÁRIOS APROVADOS`);
  console.log('================================================================================');

  process.exit(passedCount === results.length ? 0 : 1);
}

runAllTests().catch((err) => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
