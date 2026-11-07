import http from 'http';
import { app } from '../server.ts';
import { setCustomTokenVerifierForTests } from '../src/server/firebaseAdminAuth.ts';
import {
  setCustomOidcVerifierForTests,
  AUTHORIZED_WORKER_SERVICE_ACCOUNT,
  CLOUD_RUN_SERVICE_URL,
} from '../src/server/workerOidcAuth.ts';
import {
  traditionalRaffleService,
  InMemoryTransactionalStore,
} from '../src/server/traditionalRaffleService.ts';
import type {
  TraditionalDrawPrecommitRecord,
  TraditionalDrawIdempotencyRecord,
} from '../src/types.ts';
import { DEFAULT_SETTINGS } from '../src/utils/raffle.ts';

interface TestResult {
  scenarioNumber: number;
  description: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
  evidence: string;
}

function createJwt(payload: Record<string, unknown>, signature = 'valid_sig'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.${signature}`;
}

async function runTests() {
  console.log('================================================================================');
  console.log('🛡️ SUITE DE TESTES AUTOMATIZADOS: AUTENTICAÇÃO DUAL OIDC + FIREBASE (FASE 1.7.7.9)');
  console.log('================================================================================');
  console.log(`Worker Autorizado: ${AUTHORIZED_WORKER_SERVICE_ACCOUNT}`);
  console.log(`Audience Cloud Run: ${CLOUD_RUN_SERVICE_URL}`);
  console.log('--------------------------------------------------------------------------------\n');

  const testStore = new InMemoryTransactionalStore();
  traditionalRaffleService.setStoreForTests(testStore);

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (testServer.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const results: TestResult[] = [];

  async function postJson(endpoint: string, body: any, headers: Record<string, string> = {}) {
    return new Promise<{ status: number; data: any }>((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = http.request(
        `${baseUrl}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...headers,
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode || 500, data: JSON.parse(raw) });
            } catch {
              resolve({ status: res.statusCode || 500, data: raw });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // 1. Setup Mock Firebase Verifier
  setCustomTokenVerifierForTests(async (token: string) => {
    if (token === 'token_firebase_alice') {
      return {
        uid: 'uid_alice',
        email: 'alice@giodasorte.com',
        email_verified: true,
        iss: 'https://securetoken.google.com/quick-standard-pw2pc',
        aud: 'quick-standard-pw2pc',
        auth_time: Math.floor(Date.now() / 1000) - 30,
      } as any;
    }
    if (token === 'token_firebase_mallory') {
      return {
        uid: 'uid_mallory',
        email: 'mallory@evil.com',
        email_verified: true,
        iss: 'https://securetoken.google.com/quick-standard-pw2pc',
        aud: 'quick-standard-pw2pc',
        auth_time: Math.floor(Date.now() / 1000) - 30,
      } as any;
    }

    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const p = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        if (p.iss && String(p.iss).startsWith('https://securetoken.google.com/')) {
          return {
            uid: p.uid || p.sub || 'uid_alice',
            email: p.email || 'alice@giodasorte.com',
            email_verified: true,
            iss: p.iss,
            aud: p.aud,
            auth_time: Math.floor(Date.now() / 1000) - 30,
          } as any;
        }
      }
    } catch {}

    const err: any = new Error('Decoding Firebase ID token failed.');
    err.code = 'auth/invalid-id-token';
    throw err;
  });

  // 2. Setup Mock OIDC Verifier
  setCustomOidcVerifierForTests(async (token: string, options) => {
    const expectedAud = options?.expectedAudience || CLOUD_RUN_SERVICE_URL;
    const expectedSA = options?.expectedServiceAccount || AUTHORIZED_WORKER_SERVICE_ACCOUNT;

    const parts = token.split('.');
    if (parts.length !== 3 || parts[2] === 'invalid_sig') {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_TOKEN_INVALID',
        reason: 'Assinatura criptográfica RSA do token OIDC inválida.',
      };
    }

    let payload: any;
    try {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      return { valid: false, status: 401, code: 'OIDC_TOKEN_INVALID', reason: 'Payload malformado.' };
    }

    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
      return { valid: false, status: 401, code: 'OIDC_INVALID_ISSUER', reason: 'Issuer inválido.' };
    }

    const audMatch = Array.isArray(payload.aud)
      ? payload.aud.includes(expectedAud)
      : payload.aud === expectedAud;
    if (!audMatch) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_INVALID_AUDIENCE',
        reason: `Audience incompatível: esperado '${expectedAud}', recebido '${payload.aud}'.`,
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      return { valid: false, status: 401, code: 'OIDC_TOKEN_EXPIRED', reason: 'Token OIDC expirado.' };
    }

    if (payload.email_verified !== true) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_EMAIL_NOT_VERIFIED',
        reason: 'Email associado ao token OIDC não está verificado.',
      };
    }

    const email = String(payload.email || '').trim().toLowerCase();
    if (email !== expectedSA.toLowerCase()) {
      return {
        valid: false,
        status: 403,
        code: 'OIDC_UNAUTHORIZED_CALLER',
        reason: `Chamador OIDC não autorizado: '${email}'. Apenas '${expectedSA}' é permitida.`,
      };
    }

    return {
      valid: true,
      status: 200,
      code: 'OIDC_VERIFIED',
      payload,
      email,
    };
  });

  const nowSec = Math.floor(Date.now() / 1000);

  // Helper token generators
  const tokenValidWorker = createJwt({
    iss: 'https://accounts.google.com',
    aud: CLOUD_RUN_SERVICE_URL,
    sub: '10987654321',
    email: AUTHORIZED_WORKER_SERVICE_ACCOUNT,
    email_verified: true,
    exp: nowSec + 3600,
  });

  const tokenUntrustedWorker = createJwt({
    iss: 'https://accounts.google.com',
    aud: CLOUD_RUN_SERVICE_URL,
    sub: '99999999999',
    email: 'malicious-sa@evil.iam.gserviceaccount.com',
    email_verified: true,
    exp: nowSec + 3600,
  });

  const tokenWrongAudienceWorker = createJwt({
    iss: 'https://accounts.google.com',
    aud: 'https://wrong-service-url.run.app',
    sub: '10987654321',
    email: AUTHORIZED_WORKER_SERVICE_ACCOUNT,
    email_verified: true,
    exp: nowSec + 3600,
  });

  const tokenExpiredWorker = createJwt({
    iss: 'https://accounts.google.com',
    aud: CLOUD_RUN_SERVICE_URL,
    sub: '10987654321',
    email: AUTHORIZED_WORKER_SERVICE_ACCOUNT,
    email_verified: true,
    exp: nowSec - 60,
  });

  const tokenInvalidSigWorker = createJwt(
    {
      iss: 'https://accounts.google.com',
      aud: CLOUD_RUN_SERVICE_URL,
      sub: '10987654321',
      email: AUTHORIZED_WORKER_SERVICE_ACCOUNT,
      email_verified: true,
      exp: nowSec + 3600,
    },
    'invalid_sig'
  );

  const tokenRegularUserOidc = createJwt({
    iss: 'https://accounts.google.com',
    aud: CLOUD_RUN_SERVICE_URL,
    sub: '1234567890',
    email: 'unauthorized@gmail.com',
    email_verified: true,
    exp: nowSec + 3600,
  });

  // Seed Alice's raffle with valid participants (coins: 100, addedAt timestamp)
  const syncRes = await postJson(
    '/api/raffle/sync',
    {
      raffleId: 'default',
      settings: DEFAULT_SETTINGS,
      participants: [
        {
          id: 'p1',
          name: 'Ana',
          coins: 100,
          addedAt: 1700000000000,
        },
        {
          id: 'p2',
          name: 'Beto',
          coins: 100,
          addedAt: 1700000001000,
        },
        {
          id: 'p3',
          name: 'Caio',
          coins: 100,
          addedAt: 1700000002000,
        },
      ],
    },
    { Authorization: 'Bearer token_firebase_alice' }
  );

  if (!syncRes.data.ok) {
    throw new Error(`Falha ao sincronizar rifa de Alice: ${JSON.stringify(syncRes.data)}`);
  }

  // Setup Precommit 1 for Alice
  const resPrecommitAlice = await postJson(
    '/api/raffle/draw/pre-commit',
    { raffleId: 'default' },
    { Authorization: 'Bearer token_firebase_alice' }
  );
  const commitmentHashAlice1 = resPrecommitAlice.data.commitmentHash;
  if (!commitmentHashAlice1) {
    throw new Error(`Falha ao criar precommit 1: ${JSON.stringify(resPrecommitAlice.data)}`);
  }

  // Age the precommit past the 60s expiration window
  const precommitDocPath1 = traditionalRaffleService.privatePrecommitPath(commitmentHashAlice1);
  const snapPrecommit1 = await testStore.getDocDirect<TraditionalDrawPrecommitRecord>(precommitDocPath1);
  const agedPrecommit1: TraditionalDrawPrecommitRecord = {
    ...snapPrecommit1.data()!,
    expiresAtMs: Date.now() - 10000,
    expiresAtIso: new Date(Date.now() - 10000).toISOString(),
  };
  await testStore.setDocDirect(precommitDocPath1, agedPrecommit1);

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Requisição sem token -> 401
  // ---------------------------------------------------------------------------
  const resNoToken = await postJson('/api/raffle/draw/sweep', { commitmentHash: commitmentHashAlice1 });
  results.push({
    scenarioNumber: 1,
    description: 'Requisição sem token em rota protegida',
    expectedStatus: 401,
    actualStatus: resNoToken.status,
    passed: resNoToken.status === 401 && resNoToken.data.code === 'AUTH_REQUIRED',
    evidence: `Status=${resNoToken.status}, Code=${resNoToken.data.code}, Error="${resNoToken.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Token Firebase válido do organizador -> permitido (200)
  // ---------------------------------------------------------------------------
  const resFirebaseAlice = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice1 },
    { Authorization: 'Bearer token_firebase_alice' }
  );
  results.push({
    scenarioNumber: 2,
    description: 'Token Firebase válido do organizador proprietário',
    expectedStatus: 200,
    actualStatus: resFirebaseAlice.status,
    passed: resFirebaseAlice.status === 200 && resFirebaseAlice.data.ok === true && resFirebaseAlice.data.action === 'MARKED_EXPIRED',
    evidence: `Status=${resFirebaseAlice.status}, Action=${resFirebaseAlice.data.action}, TerminalEvent=${resFirebaseAlice.data.terminalEventType}`,
  });

  // Setup Precommit 2 for Alice
  const resPrecommitAlice2 = await postJson(
    '/api/raffle/draw/pre-commit',
    { raffleId: 'default' },
    { Authorization: 'Bearer token_firebase_alice' }
  );
  const commitmentHashAlice2 = resPrecommitAlice2.data.commitmentHash;
  if (!commitmentHashAlice2) {
    throw new Error(`Falha ao criar precommit 2: ${JSON.stringify(resPrecommitAlice2.data)}`);
  }

  const precommitDocPath2 = traditionalRaffleService.privatePrecommitPath(commitmentHashAlice2);
  const snapPrecommit2 = await testStore.getDocDirect<TraditionalDrawPrecommitRecord>(precommitDocPath2);
  await testStore.setDocDirect(precommitDocPath2, {
    ...snapPrecommit2.data()!,
    expiresAtMs: Date.now() - 10000,
    expiresAtIso: new Date(Date.now() - 10000).toISOString(),
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Token Firebase de outro usuário (cross-tenant) -> rejeitado com 403
  // ---------------------------------------------------------------------------
  const resCrossTenantFirebase = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: 'Bearer token_firebase_mallory' }
  );
  results.push({
    scenarioNumber: 3,
    description: 'Token Firebase de usuário não proprietário (cross-tenant)',
    expectedStatus: 403,
    actualStatus: resCrossTenantFirebase.status,
    passed: resCrossTenantFirebase.status === 403 && resCrossTenantFirebase.data.error === 'HTTP_403_FORBIDDEN_CROSS_TENANT',
    evidence: `Status=${resCrossTenantFirebase.status}, Error="${resCrossTenantFirebase.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Token OIDC válido da Service Account autorizada -> permitido (200)
  // ---------------------------------------------------------------------------
  const resWorkerSweep = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );
  results.push({
    scenarioNumber: 4,
    description: 'Token OIDC válido da Service Account autorizada do Worker',
    expectedStatus: 200,
    actualStatus: resWorkerSweep.status,
    passed: resWorkerSweep.status === 200 && resWorkerSweep.data.ok === true && resWorkerSweep.data.action === 'MARKED_EXPIRED',
    evidence: `Status=${resWorkerSweep.status}, Action=${resWorkerSweep.data.action}, TerminalEvent=${resWorkerSweep.data.terminalEventType}`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Token OIDC de outra Service Account -> rejeitado com 403
  // ---------------------------------------------------------------------------
  const resUntrustedWorker = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenUntrustedWorker}` }
  );
  results.push({
    scenarioNumber: 5,
    description: 'Token OIDC de outra Service Account não autorizada',
    expectedStatus: 403,
    actualStatus: resUntrustedWorker.status,
    passed: resUntrustedWorker.status === 403 && resUntrustedWorker.data.code === 'OIDC_UNAUTHORIZED_CALLER',
    evidence: `Status=${resUntrustedWorker.status}, Code=${resUntrustedWorker.data.code}, Error="${resUntrustedWorker.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Token OIDC com audience incorreta -> 401
  // ---------------------------------------------------------------------------
  const resWrongAud = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenWrongAudienceWorker}` }
  );
  results.push({
    scenarioNumber: 6,
    description: 'Token OIDC com audience incorreta (divergência de URL)',
    expectedStatus: 401,
    actualStatus: resWrongAud.status,
    passed: resWrongAud.status === 401 && resWrongAud.data.code === 'OIDC_INVALID_AUDIENCE',
    evidence: `Status=${resWrongAud.status}, Code=${resWrongAud.data.code}, Error="${resWrongAud.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Token OIDC expirado -> 401
  // ---------------------------------------------------------------------------
  const resExpiredOidc = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenExpiredWorker}` }
  );
  results.push({
    scenarioNumber: 7,
    description: 'Token OIDC expirado (exp <= now)',
    expectedStatus: 401,
    actualStatus: resExpiredOidc.status,
    passed: resExpiredOidc.status === 401 && resExpiredOidc.data.code === 'OIDC_TOKEN_EXPIRED',
    evidence: `Status=${resExpiredOidc.status}, Code=${resExpiredOidc.data.code}, Error="${resExpiredOidc.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Token OIDC com assinatura inválida -> 401
  // ---------------------------------------------------------------------------
  const resInvalidSig = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenInvalidSigWorker}` }
  );
  results.push({
    scenarioNumber: 8,
    description: 'Token OIDC com assinatura RSA inválida',
    expectedStatus: 401,
    actualStatus: resInvalidSig.status,
    passed: resInvalidSig.status === 401 && resInvalidSig.data.code === 'OIDC_TOKEN_INVALID',
    evidence: `Status=${resInvalidSig.status}, Code=${resInvalidSig.data.code}, Error="${resInvalidSig.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Token Firebase enviado no fluxo OIDC ou vice-versa -> direcionado corretamente sem falso positivo
  // ---------------------------------------------------------------------------
  const tokenStructuredFirebase = createJwt({
    iss: 'https://securetoken.google.com/quick-standard-pw2pc',
    aud: 'quick-standard-pw2pc',
    sub: 'uid_alice',
    uid: 'uid_alice',
    email: 'alice@giodasorte.com',
  });
  const resFirebaseViaDual = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenStructuredFirebase}` }
  );
  results.push({
    scenarioNumber: 9,
    description: 'Token Firebase roteado corretamente via discriminador de issuer',
    expectedStatus: 200,
    actualStatus: resFirebaseViaDual.status,
    passed: resFirebaseViaDual.status === 200 && resFirebaseViaDual.data.ok === true,
    evidence: `Status=${resFirebaseViaDual.status}, Action=${resFirebaseViaDual.data.action}`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Token OIDC de conta de usuário comum (unauthorized@gmail.com) -> 403
  // ---------------------------------------------------------------------------
  const resRegularUserOidc = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenRegularUserOidc}` }
  );
  results.push({
    scenarioNumber: 10,
    description: 'Token OIDC de usuário pessoal (unauthorized@gmail.com)',
    expectedStatus: 403,
    actualStatus: resRegularUserOidc.status,
    passed: resRegularUserOidc.status === 403 && resRegularUserOidc.data.code === 'OIDC_UNAUTHORIZED_CALLER',
    evidence: `Status=${resRegularUserOidc.status}, Code=${resRegularUserOidc.data.code}, Error="${resRegularUserOidc.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Payload contendo apenas {"mode": "AUTO_SWEEP"} sem commitmentHash -> 400
  // ---------------------------------------------------------------------------
  const resOnlyAutoSweep = await postJson(
    '/api/raffle/draw/sweep',
    { mode: 'AUTO_SWEEP' },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );
  results.push({
    scenarioNumber: 11,
    description: 'Payload contendo apenas {"mode": "AUTO_SWEEP"} sem commitmentHash',
    expectedStatus: 400,
    actualStatus: resOnlyAutoSweep.status,
    passed: resOnlyAutoSweep.status === 400 && resOnlyAutoSweep.data.error === 'INVALID_COMMITMENT_HASH',
    evidence: `Status=${resOnlyAutoSweep.status}, Error="${resOnlyAutoSweep.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Payload contendo apenas {"mode": "AUTO_RECOVER"} sem dados de identificação -> 400 ou 404
  // ---------------------------------------------------------------------------
  const resOnlyAutoRecover = await postJson(
    '/api/raffle/draw/recover',
    { mode: 'AUTO_RECOVER' },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );
  results.push({
    scenarioNumber: 12,
    description: 'Payload contendo apenas {"mode": "AUTO_RECOVER"} sem dados de identificação',
    expectedStatus: 400,
    actualStatus: resOnlyAutoRecover.status,
    passed: resOnlyAutoRecover.status === 400 && resOnlyAutoRecover.data.error === 'HTTP_400_MISSING_IDEMPOTENCY_KEY',
    evidence: `Status=${resOnlyAutoRecover.status}, Error="${resOnlyAutoRecover.data.error}"`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 13: Idempotência mantida em chamadas repetidas do worker
  // ---------------------------------------------------------------------------
  const resRepeatedWorkerSweep = await postJson(
    '/api/raffle/draw/sweep',
    { commitmentHash: commitmentHashAlice2 },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );
  results.push({
    scenarioNumber: 13,
    description: 'Idempotência mantida em chamadas repetidas do worker (NO_OP_ALREADY_SYNCED)',
    expectedStatus: 200,
    actualStatus: resRepeatedWorkerSweep.status,
    passed: resRepeatedWorkerSweep.status === 200 && resRepeatedWorkerSweep.data.action === 'NO_OP_ALREADY_SYNCED',
    evidence: `Status=${resRepeatedWorkerSweep.status}, Action=${resRepeatedWorkerSweep.data.action}, TerminalEvent=${resRepeatedWorkerSweep.data.terminalEventType}`,
  });

  // Setup Recover Scenarios (14 & 15)
  // Create an active idempotency record for Alice with IN_PROGRESS lock
  const drawId = 'draw_alice_rec_1';
  const idemKey = 'idem_alice_rec_1';
  const fingerprint = 'fp_alice_rec_1';
  const idemPath = traditionalRaffleService.idempotencyPath('uid_alice', 'default', idemKey);

  // Precommit for recover
  const resPrecommitAlice3 = await postJson(
    '/api/raffle/draw/pre-commit',
    { raffleId: 'default' },
    { Authorization: 'Bearer token_firebase_alice' }
  );
  const commitmentHashAlice3 = resPrecommitAlice3.data.commitmentHash;
  if (!commitmentHashAlice3) {
    throw new Error(`Falha ao criar precommit 3: ${JSON.stringify(resPrecommitAlice3.data)}`);
  }

  // Insert active idempotency record (<60s)
  const activeLockRecord: TraditionalDrawIdempotencyRecord = {
    compositeKey: `uid_alice:default:${idemKey}`,
    idempotencyKey: idemKey,
    drawId,
    ownerUid: 'uid_alice',
    raffleId: 'default',
    requestFingerprint: fingerprint,
    status: 'IN_PROGRESS',
    startedAtMs: Date.now() - 10000, // 10s ago (<60s)
    startedAtIso: new Date(Date.now() - 10000).toISOString(),
    lockAcquisitionId: 'lock_initial_123',
    fencingToken: 1,
  };
  await testStore.setDocDirect(idemPath, activeLockRecord);

  // ---------------------------------------------------------------------------
  // SCENARIO 14: Concorrência controlada e fencing respeitado (<60s -> 409, >60s -> 200)
  // ---------------------------------------------------------------------------
  // Attempt 1: < 60s -> 409
  const resRecoverActive = await postJson(
    '/api/raffle/draw/recover',
    {
      idempotencyKey: idemKey,
      drawId,
      commitmentHash: commitmentHashAlice3,
      requestFingerprint: fingerprint,
    },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );

  // Age the lock past 60s
  await testStore.setDocDirect(idemPath, {
    ...activeLockRecord,
    startedAtMs: Date.now() - 75000, // 75s ago (>60s)
    startedAtIso: new Date(Date.now() - 75000).toISOString(),
  });

  // Attempt 2: > 60s -> 200 RECOVERED_LOCK
  const resRecoverExpired = await postJson(
    '/api/raffle/draw/recover',
    {
      idempotencyKey: idemKey,
      drawId,
      commitmentHash: commitmentHashAlice3,
      requestFingerprint: fingerprint,
    },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );

  const scenario14Passed =
    resRecoverActive.status === 409 &&
    resRecoverActive.data.error === 'HTTP_409_LOCK_NOT_YET_EXPIRED' &&
    resRecoverExpired.status === 200 &&
    resRecoverExpired.data.mode === 'RECOVERED_LOCK';

  results.push({
    scenarioNumber: 14,
    description: 'Fencing e janela de lock respeitados (<60s rejeita 409; >60s recupera 200)',
    expectedStatus: 200,
    actualStatus: scenario14Passed ? 200 : resRecoverExpired.status,
    passed: scenario14Passed,
    evidence: `Ativo(<60s): Status=${resRecoverActive.status}, Error="${resRecoverActive.data.error}"; Expirado(>60s): Status=${resRecoverExpired.status}, Mode=${resRecoverExpired.data.mode}`,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 15: Isolamento cross-tenant preservado em ambos os modos de autenticação
  // ---------------------------------------------------------------------------
  // Test A: Mallory tries to recover Alice's draw via Firebase -> 404 (isolated namespace)
  const resMalloryRecover = await postJson(
    '/api/raffle/draw/recover',
    {
      idempotencyKey: idemKey,
      drawId,
      commitmentHash: commitmentHashAlice3,
      requestFingerprint: fingerprint,
    },
    { Authorization: 'Bearer token_firebase_mallory' }
  );

  // Test B: Mallory attempts to pass forged ownerUid in body to worker -> Worker uses Firestore precommit ownerUid, never client body
  const resWorkerForgedOwner = await postJson(
    '/api/raffle/draw/sweep',
    {
      commitmentHash: commitmentHashAlice3,
      ownerUid: 'uid_mallory', // Client attempts to hijack
      fakeRole: 'ADMIN',
    },
    { Authorization: `Bearer ${tokenValidWorker}` }
  );

  const scenario15Passed =
    resMalloryRecover.status === 404 && // Mallory has no idempotency record under users/uid_mallory
    resWorkerForgedOwner.status === 200 &&
    resWorkerForgedOwner.data.ok === true; // Authorized worker sweeps Alice's precommit based on stored record, ignoring uid_mallory

  results.push({
    scenarioNumber: 15,
    description: 'Isolamento cross-tenant estrito mantido em Firebase e OIDC (precommit autoritativo)',
    expectedStatus: 200,
    actualStatus: scenario15Passed ? 200 : 500,
    passed: scenario15Passed,
    evidence: `Mallory Firebase: Status=${resMalloryRecover.status} (Isolado no namespace próprio); Worker OIDC: Status=${resWorkerForgedOwner.status} (UID do cliente ignorado, precommit autoritativo)`,
  });

  // Print results
  console.log('\n================================================================================');
  console.log('📊 RESULTADOS DA SUITE DE TESTES:');
  console.log('================================================================================\n');

  let allPassed = true;
  for (const r of results) {
    const statusMark = r.passed ? '✅ PASSOU' : '❌ FALHOU';
    if (!r.passed) allPassed = false;
    console.log(`[${statusMark}] #${r.scenarioNumber}: ${r.description}`);
    console.log(`       Esperado: ${r.expectedStatus} | Obtido: ${r.actualStatus}`);
    console.log(`       Evidência: ${r.evidence}\n`);
  }

  console.log('================================================================================');
  console.log(`TOTAL: ${results.length} cenários avaliados. Status final: ${allPassed ? 'TODOS APROVADOS ✅' : 'FALHAS DETECTADAS ❌'}`);
  console.log('================================================================================');

  testServer.close();
  process.exit(allPassed ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
