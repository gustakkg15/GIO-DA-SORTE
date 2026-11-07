import http from 'http';
import { app } from '../server.ts';
import { setCustomTokenVerifierForTests } from '../src/server/firebaseAdminAuth.ts';
import {
  traditionalRaffleService,
  defaultFirestoreTraditionalRaffleStore,
  InMemoryTransactionalStore,
} from '../src/server/traditionalRaffleService.ts';
import { DEFAULT_SETTINGS } from '../src/utils/raffle.ts';

interface AuditResult {
  scenario: string;
  expectedStatus: number | string;
  actualStatus: number | string;
  passed: boolean;
  evidence: string;
}

async function runAudit() {
  console.log('================================================================================');
  console.log('🔍 AUDITORIA E COMPROVAÇÃO DE ROTAS — FASE 1.7.7.8');
  console.log('================================================================================');

  const testStore = new InMemoryTransactionalStore();
  traditionalRaffleService.setStoreForTests(testStore);

  // Setup test server
  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (testServer.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const results: AuditResult[] = [];

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

  try {
    // Configure mock Firebase token verifier
    setCustomTokenVerifierForTests(async (token: string) => {
      if (token === 'token_firebase_alice') {
        return { uid: 'uid_alice', email: 'alice@giodasorte.com' } as any;
      }
      if (token === 'token_firebase_mallory') {
        return { uid: 'uid_mallory', email: 'mallory@evil.com' } as any;
      }
      // Any other token (like simulated Google Cloud OIDC tokens) throws invalid token error
      const err: any = new Error('Decoding Firebase ID token failed. Invalid token specified.');
      err.code = 'auth/invalid-id-token';
      throw err;
    });

    // 1. Chamada sem autenticação em /api/raffle/draw/sweep
    const resNoAuthSweep = await postJson('/api/raffle/draw/sweep', { commitmentHash: 'hash_test_123' });
    results.push({
      scenario: '1. Rejeição de chamada sem autenticação em /api/raffle/draw/sweep',
      expectedStatus: 401,
      actualStatus: resNoAuthSweep.status,
      passed: resNoAuthSweep.status === 401,
      evidence: `Status=${resNoAuthSweep.status}, Code=${resNoAuthSweep.data.code}, Error="${resNoAuthSweep.data.error}"`,
    });

    // 2. Chamada sem autenticação em /api/raffle/draw/recover
    const resNoAuthRecover = await postJson('/api/raffle/draw/recover', { drawId: 'draw_test_123' });
    results.push({
      scenario: '2. Rejeição de chamada sem autenticação em /api/raffle/draw/recover',
      expectedStatus: 401,
      actualStatus: resNoAuthRecover.status,
      passed: resNoAuthRecover.status === 401,
      evidence: `Status=${resNoAuthRecover.status}, Code=${resNoAuthRecover.data.code}, Error="${resNoAuthRecover.data.error}"`,
    });

    // 3. Chamada com Token OIDC simulado do Google Cloud Scheduler (rejeitado por esperar Firebase JWT)
    const simulatedOidcToken = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.simulated_google_cloud_oidc_token.sig';
    const resOidcSweep = await postJson(
      '/api/raffle/draw/sweep',
      { commitmentHash: 'hash_test_123' },
      { Authorization: `Bearer ${simulatedOidcToken}` }
    );
    results.push({
      scenario: '3. Token OIDC do Google Cloud enviado para /api/raffle/draw/sweep (Rejeitado por esperar Firebase JWT)',
      expectedStatus: 401,
      actualStatus: resOidcSweep.status,
      passed: resOidcSweep.status === 401,
      evidence: `Status=${resOidcSweep.status}, Code=${resOidcSweep.data.code} (Firebase Admin rejeita OIDC token: "${resOidcSweep.data.error}")`,
    });

    // 4. Chamada que contém SOMENTE {"mode": "AUTO_SWEEP"}
    const resAutoSweepOnly = await postJson(
      '/api/raffle/draw/sweep',
      { mode: 'AUTO_SWEEP' },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '4. Rejeição de payload contendo apenas {"mode": "AUTO_SWEEP"} sem commitmentHash',
      expectedStatus: 400,
      actualStatus: resAutoSweepOnly.status,
      passed: resAutoSweepOnly.status === 400 && resAutoSweepOnly.data.error === 'INVALID_COMMITMENT_HASH',
      evidence: `Status=${resAutoSweepOnly.status}, Error="${resAutoSweepOnly.data.error}" (Rejeitado por ausência de commitmentHash)`,
    });

    // 5. Chamada que contém SOMENTE {"mode": "AUTO_RECOVER"}
    const resAutoRecoverOnly = await postJson(
      '/api/raffle/draw/recover',
      { mode: 'AUTO_RECOVER' },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '5. Rejeição de payload contendo apenas {"mode": "AUTO_RECOVER"} sem drawId / idempotencyKey',
      expectedStatus: '400 ou 404',
      actualStatus: resAutoRecoverOnly.status,
      passed: (resAutoRecoverOnly.status === 400 || resAutoRecoverOnly.status === 404) &&
        (resAutoRecoverOnly.data.error === 'HTTP_400_MISSING_IDEMPOTENCY_KEY' || resAutoRecoverOnly.data.error === 'HTTP_404_IDEMPOTENCY_RECORD_NOT_FOUND'),
      evidence: `Status=${resAutoRecoverOnly.status}, Error="${resAutoRecoverOnly.data.error}" (Rejeitado por ausência de parâmetros obrigatórios de identificação)`,
    });

    // 6. Alice sincroniza sua rifa com participantes válidos e bilhetes calculados
    await postJson(
      '/api/raffle/sync',
      {
        raffleId: 'default',
        settings: DEFAULT_SETTINGS,
        participants: [
          { id: 'p1', name: 'Ana', coins: 100, addedAt: 1700000000000 },
          { id: 'p2', name: 'Beto', coins: 100, addedAt: 1700000001000 },
          { id: 'p3', name: 'Caio', coins: 100, addedAt: 1700000002000 },
        ],
      },
      { Authorization: 'Bearer token_firebase_alice' }
    );

    // Precommit legítimo criado por Alice
    const precommitRes = await postJson(
      '/api/raffle/draw/pre-commit',
      { raffleId: 'default' },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    const commitmentHash = precommitRes.data.commitmentHash;

    // 7. Tentativa de Mallory (atacante) executar sweep na rifa de Alice
    const resMalloryCrossTenantSweep = await postJson(
      '/api/raffle/draw/sweep',
      { commitmentHash },
      { Authorization: 'Bearer token_firebase_mallory' }
    );
    results.push({
      scenario: '6. Rejeição de sweep manual por usuário não-proprietário (Mallory vs Alice)',
      expectedStatus: 403,
      actualStatus: resMalloryCrossTenantSweep.status,
      passed: resMalloryCrossTenantSweep.status === 403 && resMalloryCrossTenantSweep.data.error === 'HTTP_403_FORBIDDEN_CROSS_TENANT',
      evidence: `Status=${resMalloryCrossTenantSweep.status}, Error="${resMalloryCrossTenantSweep.data.error}" (Cross-tenant bloqueado)`,
    });

    // 8. Sweep manual legítimo executado pela proprietária Alice
    const resAliceLegitSweep = await postJson(
      '/api/raffle/draw/sweep',
      { commitmentHash },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '7. Sweep manual autorizado pela proprietária legítima Alice',
      expectedStatus: 200,
      actualStatus: resAliceLegitSweep.status,
      passed: resAliceLegitSweep.status === 200 && resAliceLegitSweep.data.action === 'NO_OP_STILL_ACTIVE',
      evidence: `Status=${resAliceLegitSweep.status}, Action="${resAliceLegitSweep.data.action}", Ok=${resAliceLegitSweep.data.ok}`,
    });

    // 9. Recover de lock ativo (<60s) bloqueado com 409
    const idemKey = `idem_audit_${Date.now()}`;
    const drawId = `draw_audit_${Date.now()}`;
    const fingerprint = 'sample_fingerprint_12_fields';
    const idemDocPath = traditionalRaffleService.idempotencyPath('uid_alice', 'default', idemKey);

    // Simula lock em andamento criado agora (<60s)
    await testStore.runTransaction(async (tx) => {
      tx.set(idemDocPath, {
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: fingerprint,
        status: 'IN_PROGRESS',
        startedAtMs: Date.now(),
        startedAtIso: new Date().toISOString(),
        fencingToken: 1,
        ownerUid: 'uid_alice',
        raffleId: 'default',
        lockAcquisitionId: 'lock_active_1',
      });
    });

    const resRecoverInProgress = await postJson(
      '/api/raffle/draw/recover',
      {
        raffleId: 'default',
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: fingerprint,
      },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '8. Recover de lock IN_PROGRESS recente (<60s) bloqueado com 409',
      expectedStatus: 409,
      actualStatus: resRecoverInProgress.status,
      passed: resRecoverInProgress.status === 409 && resRecoverInProgress.data.error === 'HTTP_409_LOCK_NOT_YET_EXPIRED',
      evidence: `Status=${resRecoverInProgress.status}, Error="${resRecoverInProgress.data.error}"`,
    });

    // 10. Recover de lock IN_PROGRESS expirado (>60s) recuperado com sucesso
    await testStore.runTransaction(async (tx) => {
      tx.set(idemDocPath, {
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: fingerprint,
        status: 'IN_PROGRESS',
        startedAtMs: Date.now() - 75_000, // 75s atrás (> 60s)
        startedAtIso: new Date(Date.now() - 75_000).toISOString(),
        fencingToken: 1,
        ownerUid: 'uid_alice',
        raffleId: 'default',
        lockAcquisitionId: 'lock_expired_1',
      });
    });

    const resRecoverExpired = await postJson(
      '/api/raffle/draw/recover',
      {
        raffleId: 'default',
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: fingerprint,
      },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '9. Recover de lock IN_PROGRESS expirado (>60s) recuperado com sucesso',
      expectedStatus: 200,
      actualStatus: resRecoverExpired.status,
      passed: resRecoverExpired.status === 200 && resRecoverExpired.data.mode === 'RECOVERED_LOCK',
      evidence: `Status=${resRecoverExpired.status}, Mode="${resRecoverExpired.data.mode}", Ok=${resRecoverExpired.data.ok}`,
    });

    // 11. Idempotência estrita: Replay com mesma idempotencyKey e mesmo fingerprint
    await testStore.runTransaction(async (tx) => {
      tx.set(idemDocPath, {
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: fingerprint,
        status: 'COMPLETED',
        startedAtMs: Date.now() - 10_000,
        completedAtMs: Date.now(),
        completedAtIso: new Date().toISOString(),
        responseStatus: 200,
        responseBody: {
          drawId,
          winnerIndex: 0,
          winnerTicketNumber: 1,
          winnerName: 'Ana',
          proof: { commitmentHash },
        },
      });
    });

    const resIdempotentReplay = await postJson(
      '/api/raffle/draw/recover',
      {
        raffleId: 'default',
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: fingerprint,
      },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '10. Replay idempotente com mesmo fingerprint retorna resultado em cache',
      expectedStatus: 200,
      actualStatus: resIdempotentReplay.status,
      passed: resIdempotentReplay.status === 200 && resIdempotentReplay.data.mode === 'ALREADY_COMPLETED' && resIdempotentReplay.data.responseBody?.idempotentReplay === true,
      evidence: `Status=${resIdempotentReplay.status}, Mode="${resIdempotentReplay.data.mode}", Replay=${resIdempotentReplay.data.responseBody?.idempotentReplay}`,
    });

    // 12. Idempotência com colisão de payload: mesma idempotencyKey e fingerprint divergente
    const resIdempotentMismatch = await postJson(
      '/api/raffle/draw/recover',
      {
        raffleId: 'default',
        idempotencyKey: idemKey,
        drawId,
        commitmentHash,
        requestFingerprint: 'divergent_tampered_fingerprint',
      },
      { Authorization: 'Bearer token_firebase_alice' }
    );
    results.push({
      scenario: '11. Mesma idempotencyKey com payload divergente rejeitada com 409',
      expectedStatus: 409,
      actualStatus: resIdempotentMismatch.status,
      passed: resIdempotentMismatch.status === 409 && resIdempotentMismatch.data.error === 'HTTP_409_IDEMPOTENCY_PAYLOAD_MISMATCH',
      evidence: `Status=${resIdempotentMismatch.status}, Error="${resIdempotentMismatch.data.error}"`,
    });

  } finally {
    traditionalRaffleService.setStoreForTests(defaultFirestoreTraditionalRaffleStore);
    setCustomTokenVerifierForTests(null);
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  }

  console.log('\n--- RESULTADOS DA AUDITORIA ---');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} [${r.actualStatus}] ${r.scenario}`);
    console.log(`   ↳ Evidência: ${r.evidence}`);
    if (!r.passed) allPassed = false;
  }
  console.log('================================================================================');
  console.log(`STATUS GERAL: ${results.filter((r) => r.passed).length}/${results.length} CENÁRIOS CONFORME ESPECIFICADO`);
  console.log('================================================================================');

  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

runAudit().catch((err) => {
  console.error('Falha fatal na auditoria:', err);
  process.exit(1);
});
