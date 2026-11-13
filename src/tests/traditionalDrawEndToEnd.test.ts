/**
 * SUÍTE END-TO-END DA MESA OFICIAL DE SORTEIO (BACKEND AUTORITATIVO + FLUXO CLIENTE)
 *
 * Valida:
 * - Reserva e reivindicação de prêmios ranqueados (`prizeId`) no backend autoritativo
 * - Remoção e limpeza de vencedores da sessão sem apagar trilha de auditoria ou ledger imutável
 * - Isolamento multi-tenant nos novos endpoints de mutação de sessão
 * - Pré-validação antes da contagem regressiva (`validateDrawPreflight`)
 * - Fluxo completo de 2 fases (`pre-commit` + `draw`) em modo Globo Digital e Roleta Visual
 * - Bootstrap automático em 404 JSON e rejeição estrita (fail-closed) em 401/403/503/HTML
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import http from 'node:http';
import {
  InMemoryTransactionalStore,
  TraditionalRaffleError,
  TraditionalRaffleService,
} from '../server/traditionalRaffleService.ts';
import { DEFAULT_SETTINGS } from '../utils/raffle.ts';
import {
  applyAuthoritativeDrawOutcome,
  executeAuthoritativeTraditionalDrawFlow,
  mergeWinnerList,
  resolveActivePrizeContext,
  validateDrawPreflight,
  type ApiJsonCaller,
} from '../utils/traditionalDrawClient.ts';
import { safeApiJson, type SafeJsonResponse } from '../utils/apiConfig.ts';
import type { RaffleSettings, Winner } from '../types.ts';
import { app as expressApp } from '../../server.ts';

function buildRankedSettings(overrides?: Partial<RaffleSettings>): RaffleSettings {
  return {
    ...DEFAULT_SETTINGS,
    rate: 100,
    total: 50,
    exclude: true,
    drawMode: 'drum',
    countdownSeconds: 10,
    prizeName: '1º Lugar - PIX R$ 500',
    currentPrize: '1º Lugar - PIX R$ 500',
    prizes: [
      { id: 'pz1', name: '1º Lugar - PIX R$ 500', rank: 1 },
      { id: 'pz2', name: '2º Lugar - Headset Gamer', rank: 2 },
      { id: 'pz3', name: '3º Lugar - Gift Card', rank: 3 },
    ],
    ...overrides,
  };
}

export async function runTraditionalDrawEndToEndTests(): Promise<{
  passed: number;
  total: number;
}> {
  console.log('\n--- EXECUTANDO TESTES E2E DA MESA OFICIAL DE SORTEIO ---');
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void>) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  // Test 1: Backend ranked prize claim + updatedWinners & updatedSettings returned atomically
  await test('Backend: Sorteio oficial reivindica PrizeTier ranqueado e retorna updatedWinners/updatedSettings', async () => {
    const store = new InMemoryTransactionalStore();
    const service = new TraditionalRaffleService(store);
    const ownerUid = 'uid_mesa_ranked_01';
    const settings = buildRankedSettings();

    await service.syncOrInitRaffleState({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      settings,
      participants: [
        { id: 'p1', name: 'Alice', coins: 200, addedAt: 1000 },
        { id: 'p2', name: 'Bob', coins: 100, addedAt: 1001 },
        { id: 'p3', name: 'Carol', coins: 100, addedAt: 1002 },
      ],
      strictClientGovernance: true,
    });

    const precommit = await service.createDrawPrecommit({
      authenticatedUid: ownerUid,
      raffleId: 'default',
    });

    const clientEntropy = crypto.randomBytes(32).toString('hex');
    const drawRes = await service.executeOfficialDraw({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      drawId: 'draw_ranked_001',
      idempotencyKey: 'idem_draw_ranked_001',
      commitmentHash: precommit.commitmentHash,
      clientEntropy,
      expectedRosterVersion: precommit.rosterVersion,
      expectedDrawSequence: precommit.drawSequence,
      fencingToken: precommit.fencingToken,
      drawMode: 'drum',
      winnerCount: 1,
      prizeId: 'pz1',
      prizeName: '1º Lugar - PIX R$ 500',
    });

    assert.strictEqual(drawRes.statusCode, 200);
    const body = drawRes.body as any;
    assert.strictEqual(body.ok, true);
    assert.ok(body.winningTicket && typeof body.winningTicket.number === 'number');
    assert.ok(body.winner && body.winner.drawId === 'draw_ranked_001');
    assert.strictEqual(body.winner.prize, '1º Lugar - PIX R$ 500');
    assert.ok(Array.isArray(body.updatedWinners) && body.updatedWinners.length === 1);
    assert.ok(body.updatedSettings && Array.isArray(body.updatedSettings.prizes));
    assert.strictEqual(
      body.updatedSettings.prizes[0].winnerId,
      body.winningTicket.participantId,
      'pz1 deve ser atribuído ao participante sorteado'
    );
    assert.strictEqual(
      body.updatedSettings.prizes[0].ticketNumber,
      body.winningTicket.number,
      'pz1 deve registrar o número exato do bilhete contemplado'
    );
    assert.strictEqual(
      body.updatedSettings.currentPrize,
      '2º Lugar - Headset Gamer',
      'currentPrize deve avançar automaticamente para o próximo prêmio da fila'
    );
  });

  // Test 2: removeSessionWinner unclaims tier and preserves immutable audit docs & ledger chain
  await test('Backend: removeSessionWinner libera o prêmio na sessão sem alterar draws/{drawId} ou ledger público', async () => {
    const store = new InMemoryTransactionalStore();
    const service = new TraditionalRaffleService(store);
    const ownerUid = 'uid_mesa_remove_02';
    const settings = buildRankedSettings();

    await service.syncOrInitRaffleState({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      settings,
      participants: [
        { id: 'p1', name: 'Alice', coins: 100, addedAt: 1000 },
        { id: 'p2', name: 'Bob', coins: 100, addedAt: 1001 },
      ],
      strictClientGovernance: true,
    });

    const precommit = await service.createDrawPrecommit({
      authenticatedUid: ownerUid,
      raffleId: 'default',
    });

    const drawRes = await service.executeOfficialDraw({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      drawId: 'draw_remove_001',
      idempotencyKey: 'idem_draw_remove_001',
      commitmentHash: precommit.commitmentHash,
      clientEntropy: crypto.randomBytes(32).toString('hex'),
      expectedRosterVersion: precommit.rosterVersion,
      expectedDrawSequence: precommit.drawSequence,
      fencingToken: precommit.fencingToken,
      drawMode: 'wheel',
      winnerCount: 1,
      prizeId: 'pz1',
      prizeName: '1º Lugar - PIX R$ 500',
    });

    const winner = (drawRes.body as any).winner as Winner;
    const beforeSnap = await store.getDocDirect<any>(service.rafflePath(ownerUid, 'default'));
    const rosterBeforeRemoval = Number(beforeSnap.data()!.rosterVersion);

    const updated = await service.removeSessionWinner({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      winnerId: winner.id,
    });

    assert.strictEqual(updated.winners.length, 0, 'Lista de vencedores da sessão deve remover o item');
    assert.strictEqual(updated.settings.prizes?.[0].winnerId, undefined, 'Prêmio pz1 deve ser desmarcado');
    assert.strictEqual(
      updated.settings.currentPrize,
      '1º Lugar - PIX R$ 500',
      'currentPrize deve retornar ao 1º prêmio disponível'
    );
    assert.strictEqual(updated.operationalState, 'IDLE');
    assert.strictEqual(updated.rosterVersion, rosterBeforeRemoval + 1);

    // Permanent audit record and ledger hash chain MUST remain untouched and valid!
    const permDrawSnap = await store.getDocDirect(
      service.permanentDrawPath(ownerUid, 'default', 'draw_remove_001')
    );
    assert.ok(permDrawSnap.exists, 'Registro permanente em draws/{drawId} deve permanecer imutável');

    const ledgerBundle = await service.getVerifiedLedgerBundle(precommit.commitmentHash);
    assert.strictEqual(ledgerBundle.valid, true, 'Ledger público deve continuar criptograficamente válido');
    assert.strictEqual(ledgerBundle.terminalType, 'REVEALED');
  });

  // Test 3: clearSessionWinners resets round + rejects invalid/missing winner & cross-tenant access
  await test('Backend: clearSessionWinners reinicia rodada mantendo histórico imutável e bloqueia cross-tenant (404/403)', async () => {
    const store = new InMemoryTransactionalStore();
    const service = new TraditionalRaffleService(store);
    const ownerUid = 'uid_mesa_clear_03';
    const attackerUid = 'uid_attacker_99';

    await service.syncOrInitRaffleState({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      settings: buildRankedSettings(),
      participants: [
        { id: 'p1', name: 'Alice', coins: 100, addedAt: 1000 },
        { id: 'p2', name: 'Bob', coins: 100, addedAt: 1001 },
      ],
      strictClientGovernance: true,
    });

    const p1 = await service.createDrawPrecommit({ authenticatedUid: ownerUid, raffleId: 'default' });
    await service.executeOfficialDraw({
      authenticatedUid: ownerUid,
      raffleId: 'default',
      drawId: 'draw_clear_001',
      idempotencyKey: 'idem_clear_001',
      commitmentHash: p1.commitmentHash,
      clientEntropy: crypto.randomBytes(32).toString('hex'),
      expectedRosterVersion: p1.rosterVersion,
      expectedDrawSequence: p1.drawSequence,
      fencingToken: p1.fencingToken,
      drawMode: 'drum',
      winnerCount: 1,
      prizeId: 'pz1',
      prizeName: '1º Lugar - PIX R$ 500',
    });

    // Attacker cannot touch owner's session winners
    await assert.rejects(
      async () =>
        service.clearSessionWinners({
          authenticatedUid: attackerUid,
          raffleId: 'default',
        }),
      (err: unknown) => err instanceof TraditionalRaffleError && err.statusCode === 404
    );

    // Invalid empty winnerId throws 400
    await assert.rejects(
      async () =>
        service.removeSessionWinner({
          authenticatedUid: ownerUid,
          raffleId: 'default',
          winnerId: '',
        }),
      (err: unknown) => err instanceof TraditionalRaffleError && err.statusCode === 400
    );

    const cleared = await service.clearSessionWinners({
      authenticatedUid: ownerUid,
      raffleId: 'default',
    });
    assert.strictEqual(cleared.winners.length, 0);
    assert.strictEqual(cleared.operationalState, 'IDLE');
    assert.strictEqual(cleared.settings.prizes?.every((p) => !p.winnerId), true);

    const ledgerBundle = await service.getVerifiedLedgerBundle(p1.commitmentHash);
    assert.strictEqual(ledgerBundle.valid, true, 'Ledger da rodada anterior continua íntegro após limpar sessão');
  });

  // Test 4: validateDrawPreflight blocks unauthenticated users BEFORE starting 10s countdown
  await test('Cliente Preflight: bloqueia usuário desconectado antes da contagem regressiva e aceita sessão autenticada', async () => {
    const noAuth = validateDrawPreflight({
      isAuthenticated: false,
      isDrawing: false,
      isCountdownActive: false,
      eligibleTicketsCount: 5,
    });
    assert.strictEqual(noAuth.canProceed, false);
    assert.strictEqual(noAuth.code, 'UNAUTHENTICATED');
    assert.ok(noAuth.errorMessage && noAuth.errorMessage.includes('Conecte sua conta'));

    const noTickets = validateDrawPreflight({
      isAuthenticated: true,
      isDrawing: false,
      isCountdownActive: false,
      eligibleTicketsCount: 0,
    });
    assert.strictEqual(noTickets.canProceed, false);
    assert.strictEqual(noTickets.code, 'NO_ELIGIBLE_TICKETS');

    const ready = validateDrawPreflight({
      isAuthenticated: true,
      isDrawing: false,
      isCountdownActive: false,
      eligibleTicketsCount: 5,
    });
    assert.strictEqual(ready.canProceed, true);
    assert.strictEqual(ready.code, 'OK');
    assert.strictEqual(ready.errorMessage, null);
  });

  // Test 5: resolveActivePrizeContext prioritizes ranked unclaimed prize tiers and falls back safely
  await test('Cliente PrizeContext: seleciona o próximo prêmio ranqueado livre e recorre a NONE quando todos forem entregues', async () => {
    const partialSettings = buildRankedSettings({
      prizes: [
        { id: 'pz1', name: '1º Lugar - PIX R$ 500', rank: 1, winnerId: 'p1', winnerName: 'Alice', ticketNumber: 1 },
        { id: 'pz2', name: '2º Lugar - Headset Gamer', rank: 2 },
      ],
    });
    const ctx1 = resolveActivePrizeContext(partialSettings);
    assert.strictEqual(ctx1.prizeId, 'pz2');
    assert.strictEqual(ctx1.prizeName, '2º Lugar - Headset Gamer');

    const exhaustedSettings = buildRankedSettings({
      prizeName: 'Prêmio Extra',
      prizes: [
        { id: 'pz1', name: '1º Lugar', rank: 1, winnerId: 'p1', winnerName: 'Alice', ticketNumber: 1 },
      ],
    });
    const ctx2 = resolveActivePrizeContext(exhaustedSettings);
    assert.strictEqual(ctx2.prizeId, 'NONE');
    assert.strictEqual(ctx2.prizeName, 'Prêmio Extra');
  });

  // Test 6: executeAuthoritativeTraditionalDrawFlow handles 404 JSON bootstrap + wheel mode + outcome merge
  await test('Cliente DrawFlow: executa bootstrap em 404 JSON, envia prizeId correto e mescla vencedor sem duplicar', async () => {
    const settings = buildRankedSettings();
    const participants = [
      { id: 'p1', name: 'Alice', coins: 200, addedAt: 1000 },
      { id: 'p2', name: 'Bob', coins: 100, addedAt: 1001 },
    ];
    const callLog: Array<{ path: string; body: any }> = [];
    let precommitAttempts = 0;

    const fakeApiCall: ApiJsonCaller = (async <T = any>(
      endpointPath: string,
      init?: RequestInit
    ): Promise<SafeJsonResponse<T>> => {
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : null;
      callLog.push({ path: endpointPath, body: parsedBody });

      if (endpointPath === '/api/raffle/draw/pre-commit') {
        precommitAttempts++;
        if (precommitAttempts === 1) {
          return { ok: false, status: 404, isHtml: false, error: 'HTTP_404_RAFFLE_NOT_FOUND' };
        }
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            commitmentHash: 'c'.repeat(64),
            rosterVersion: 2,
            drawSequence: 0,
            fencingToken: 1,
          } as unknown as T,
        };
      }

      if (endpointPath === '/api/raffle/sync') {
        return { ok: true, status: 200, data: { ok: true } as unknown as T };
      }

      if (endpointPath === '/api/raffle/draw') {
        assert.strictEqual(parsedBody.drawMode, 'wheel');
        assert.strictEqual(parsedBody.prizeId, 'pz1');
        assert.strictEqual(parsedBody.prizeName, '1º Lugar - PIX R$ 500');
        assert.match(parsedBody.clientEntropy, /^[0-9a-f]{64}$/);

        const winner: Winner = {
          id: `win_${parsedBody.drawId}`,
          drawId: parsedBody.drawId,
          participantId: 'p2',
          name: 'Bob',
          number: 3,
          prize: parsedBody.prizeName,
          drawnAt: 1700000000000,
        };
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            winningTicket: { number: 3, participantId: 'p2', name: 'Bob' },
            winner,
            updatedWinners: [winner],
            updatedSettings: {
              currentPrize: '2º Lugar - Headset Gamer',
              prizes: [
                { id: 'pz1', name: '1º Lugar - PIX R$ 500', rank: 1, winnerId: 'p2', winnerName: 'Bob', ticketNumber: 3 },
                { id: 'pz2', name: '2º Lugar - Headset Gamer', rank: 2 },
                { id: 'pz3', name: '3º Lugar - Gift Card', rank: 3 },
              ],
            },
          } as unknown as T,
        };
      }

      throw new Error(`Unexpected endpoint call: ${endpointPath}`);
    }) as ApiJsonCaller;

    const outcome = await executeAuthoritativeTraditionalDrawFlow({
      idToken: 'firebase_test_token',
      mode: 'wheel',
      settings,
      participants,
      apiCall: fakeApiCall,
    });

    assert.deepStrictEqual(
      callLog.map((c) => c.path),
      ['/api/raffle/draw/pre-commit', '/api/raffle/sync', '/api/raffle/draw/pre-commit', '/api/raffle/draw']
    );
    assert.strictEqual(outcome.winningTicket.number, 3);
    assert.strictEqual(outcome.winner.name, 'Bob');

    const applied = applyAuthoritativeDrawOutcome({
      prevSettings: settings,
      prevWinners: [],
      outcome,
    });
    assert.strictEqual(applied.winners.length, 1);
    assert.strictEqual(applied.settings.currentPrize, '2º Lugar - Headset Gamer');

    // Dedup check on mergeWinnerList
    const deduped = mergeWinnerList(applied.winners, { ...outcome.winner });
    assert.strictEqual(deduped.length, 1, 'mergeWinnerList nunca deve duplicar vencedor com mesmo id/drawId');
  });

  // Test 7: Fail-closed when backend returns HTML or 503 during draw
  await test('Cliente Fail-Closed: nunca fabrica vencedor local quando servidor devolve HTML 503 no pre-commit ou draw', async () => {
    const htmlFailureCaller: ApiJsonCaller = async () => ({
      ok: false,
      status: 503,
      isHtml: true,
      error: 'O servidor retornou HTML inesperado (HTTP 503).',
    });

    await assert.rejects(
      async () =>
        executeAuthoritativeTraditionalDrawFlow({
          idToken: 'firebase_test_token',
          mode: 'drum',
          settings: buildRankedSettings(),
          participants: [{ id: 'p1', name: 'Alice', coins: 100, addedAt: 1000 }],
          apiCall: htmlFailureCaller,
        }),
      (err: unknown) => err instanceof Error && err.message.includes('HTML inesperado')
    );
  });

  // Test 8: safeApiJson detects 200 HTML from /__cookie_check.html redirect cleanly
  await test('safeApiJson: detecta 200 HTML de redirecionamento /__cookie_check.html com diagnóstico claro', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const fakeResponse = new Response(
        '<!doctype html><html><head><meta charset="utf-8"><title>Cookie check</title></head><body><script>function authFlowTestCookieIsSet(){}</script></body></html>',
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }
      );
      Object.defineProperty(fakeResponse, 'redirected', { value: true });
      Object.defineProperty(fakeResponse, 'url', {
        value: 'https://ais-dev-example.run.app/__cookie_check.html?return_url=%2Fapi%2Fraffle%2Fdraw%2Fpre-commit',
      });
      return fakeResponse;
    };

    try {
      const res = await safeApiJson<any>('/api/raffle/draw/pre-commit', { method: 'POST' });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.isHtml, true);
      assert.strictEqual(res.redirected, true);
      assert.strictEqual(res.htmlReason, 'COOKIE_CHECK_REDIRECT');
      assert.ok(res.finalUrl?.endsWith('/__cookie_check.html'));
      assert.ok(res.error?.includes('__cookie_check.html'));
      assert.ok(!res.error?.includes('200 HTML'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Test 9: safeApiJson detects SPA HTML fallback and malformed JSON payloads gracefully
  await test('safeApiJson: identifica SPA HTML Fallback (200 HTML) e JSON malformado sem SyntaxError não tratado', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(
          '<!doctype html><html><head><title>GIO DA SORTE</title></head><body><div id="root"></div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );

      const spaRes = await safeApiJson<any>('/api/raffle/draw/pre-commit', { method: 'POST' });
      assert.strictEqual(spaRes.ok, false);
      assert.strictEqual(spaRes.isHtml, true);
      assert.strictEqual(spaRes.htmlReason, 'SPA_FALLBACK_HTML');
      assert.ok(spaRes.error?.includes('SPA HTML Fallback'));

      globalThis.fetch = async () =>
        new Response('{corrupted_json', {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });

      const badJsonRes = await safeApiJson<any>('/api/raffle/draw/pre-commit', { method: 'POST' });
      assert.strictEqual(badJsonRes.ok, false);
      assert.strictEqual(badJsonRes.status, 200);
      assert.ok(badJsonRes.error?.includes('JSON inválida'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Test 10: executeAuthoritativeTraditionalDrawFlow refreshes token once on JSON 401
  await test('Cliente DrawFlow: renova Firebase ID Token uma vez quando pre-commit retorna 401 JSON', async () => {
    let attempts = 0;
    const apiCall: ApiJsonCaller = (async <T = any>(
      endpointPath: string,
      init?: RequestInit
    ): Promise<SafeJsonResponse<T>> => {
      const authHeader = (init?.headers as Record<string, string>)?.Authorization || '';
      if (endpointPath === '/api/raffle/draw/pre-commit') {
        attempts++;
        if (attempts === 1) {
          assert.strictEqual(authHeader, 'Bearer expired_tok');
          return { ok: false, status: 401, isHtml: false, error: 'FIREBASE_TOKEN_EXPIRED' };
        }
        assert.strictEqual(authHeader, 'Bearer fresh_tok');
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            commitmentHash: 'd'.repeat(64),
            rosterVersion: 1,
            drawSequence: 0,
            fencingToken: 1,
          } as unknown as T,
        };
      }
      if (endpointPath === '/api/raffle/draw') {
        assert.strictEqual(authHeader, 'Bearer fresh_tok');
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            winningTicket: { number: 1, participantId: 'p1', name: 'Alice' },
            winner: { id: 'w1', participantId: 'p1', name: 'Alice', number: 1, prize: 'Prêmio', drawnAt: 1700000000000 },
          } as unknown as T,
        };
      }
      throw new Error(`Unexpected path: ${endpointPath}`);
    }) as ApiJsonCaller;

    const outcome = await executeAuthoritativeTraditionalDrawFlow({
      idToken: 'expired_tok',
      refreshIdToken: async () => 'fresh_tok',
      mode: 'drum',
      settings: buildRankedSettings(),
      participants: [{ id: 'p1', name: 'Alice', coins: 100, addedAt: 1000 }],
      apiCall,
    });
    assert.strictEqual(attempts, 2);
    assert.strictEqual(outcome.winner.name, 'Alice');
  });

  // Test 11: Real Express HTTP barriers guarantee /api/* NEVER returns HTML
  await test('Express Backend: /api/raffle/draw/pre-commit e rotas /api/* desconhecidas ou JSON inválido retornam JSON (nunca HTML)', async () => {
    const server = http.createServer(expressApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 11a. Unauthenticated POST /api/raffle/draw/pre-commit -> 401 JSON + no-store
      const resAuth = await fetch(`${baseUrl}/api/raffle/draw/pre-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raffleId: 'default' }),
      });
      assert.strictEqual(resAuth.status, 401);
      assert.ok((resAuth.headers.get('content-type') || '').includes('application/json'));
      assert.ok((resAuth.headers.get('cache-control') || '').includes('no-store'));
      const jsonAuth = await resAuth.json();
      assert.strictEqual(jsonAuth.code, 'FIREBASE_AUTH_REQUIRED');

      // 11b. Malformed JSON body -> 400 JSON (NOT Express HTML SyntaxError)
      const resBadJson = await fetch(`${baseUrl}/api/raffle/draw/pre-commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{malformed',
      });
      assert.strictEqual(resBadJson.status, 400);
      assert.ok((resBadJson.headers.get('content-type') || '').includes('application/json'));
      const jsonBad = await resBadJson.json();
      assert.strictEqual(jsonBad.code, 'INVALID_JSON_BODY');

      // 11c. Unknown GET & POST /api/* -> 404 JSON (NOT 200 HTML SPA fallback)
      const resUnknownGet = await fetch(`${baseUrl}/api/nonexistent-health-check`);
      assert.strictEqual(resUnknownGet.status, 404);
      assert.ok((resUnknownGet.headers.get('content-type') || '').includes('application/json'));
      const jsonUnknownGet = await resUnknownGet.json();
      assert.strictEqual(jsonUnknownGet.code, 'API_ROUTE_NOT_FOUND');

      const resUnknownPost = await fetch(`${baseUrl}/api/nonexistent-endpoint`, { method: 'POST' });
      assert.strictEqual(resUnknownPost.status, 404);
      assert.ok((resUnknownPost.headers.get('content-type') || '').includes('application/json'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Test 12: executeAuthoritativeTraditionalDrawFlow synchronizes roster when backend doc has 0 eligible tickets
  await test('Cliente DrawFlow: sincroniza lista via /api/raffle/participant/mutate quando pre-commit retorna HTTP_400_NO_ELIGIBLE_TICKETS', async () => {
    const settings = buildRankedSettings();
    const participants = [
      { id: 'p1', name: 'Helena', coins: 300, addedAt: 1000 },
      { id: 'p2', name: 'Igor', coins: 200, addedAt: 1001 },
    ];
    const callSequence: string[] = [];
    let precommitCount = 0;

    const apiCall: ApiJsonCaller = (async <T = any>(
      endpointPath: string,
      init?: RequestInit
    ): Promise<SafeJsonResponse<T>> => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      callSequence.push(
        endpointPath === '/api/raffle/participant/mutate'
          ? `${endpointPath}:${body.action}`
          : endpointPath
      );

      if (endpointPath === '/api/raffle/draw/pre-commit') {
        precommitCount++;
        if (precommitCount === 1) {
          return {
            ok: false,
            status: 400,
            isHtml: false,
            error: 'Não há bilhetes elegíveis para realizar o pré-compromisso do sorteio.',
            data: {
              ok: false,
              code: 'HTTP_400_NO_ELIGIBLE_TICKETS',
              message: 'Não há bilhetes elegíveis para realizar o pré-compromisso do sorteio.',
            } as unknown as T,
          };
        }
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            commitmentHash: 'e'.repeat(64),
            rosterVersion: 3,
            drawSequence: 0,
            fencingToken: 1,
          } as unknown as T,
        };
      }

      if (endpointPath === '/api/raffle/participant/mutate') {
        return {
          ok: true,
          status: 200,
          data: { ok: true, raffle: { participants } } as unknown as T,
        };
      }

      if (endpointPath === '/api/raffle/draw') {
        const winner: Winner = {
          id: `win_${body.drawId}`,
          drawId: body.drawId,
          participantId: 'p1',
          name: 'Helena',
          number: 1,
          prize: body.prizeName,
          drawnAt: 1700000000000,
        };
        return {
          ok: true,
          status: 200,
          data: {
            ok: true,
            winningTicket: { number: 1, participantId: 'p1', name: 'Helena' },
            winner,
            updatedWinners: [winner],
          } as unknown as T,
        };
      }

      throw new Error(`Unexpected endpoint: ${endpointPath}`);
    }) as ApiJsonCaller;

    const outcome = await executeAuthoritativeTraditionalDrawFlow({
      idToken: 'valid_tok',
      mode: 'drum',
      settings,
      participants,
      apiCall,
    });

    assert.deepStrictEqual(callSequence, [
      '/api/raffle/draw/pre-commit',
      '/api/raffle/participant/mutate:updateRaffleAllocationSettings',
      '/api/raffle/participant/mutate:bulkAddParticipants',
      '/api/raffle/draw/pre-commit',
      '/api/raffle/draw',
    ]);
    assert.strictEqual(outcome.winner.name, 'Helena');
    assert.strictEqual(outcome.winningTicket.number, 1);
  });

  // Test 13: Default production traditionalRaffleService instance completes full official draw without 503 ADC error
  await test('Production Service Instance: traditionalRaffleService executa sorteio completo e persiste vencedor com prova Provably Fair V2', async () => {
    const { traditionalRaffleService } = await import('../server/traditionalRaffleService.ts');
    const ownerUid = `uid_prod_mesa_${Date.now()}`;
    const raffleId = 'default';
    const settings = buildRankedSettings();

    await traditionalRaffleService.syncOrInitRaffleState({
      authenticatedUid: ownerUid,
      raffleId,
      settings,
      participants: [
        { id: 'p1', name: 'Lucas Sorteado', coins: 200, addedAt: 1000 },
        { id: 'p2', name: 'Mariana', coins: 100, addedAt: 1001 },
      ],
      strictClientGovernance: true,
    });

    const pre = await traditionalRaffleService.createDrawPrecommit({
      authenticatedUid: ownerUid,
      raffleId,
    });
    assert.match(pre.commitmentHash, /^[0-9a-f]{64}$/);

    const drawId = `draw_prod_${Date.now()}`;
    const res = await traditionalRaffleService.executeOfficialDraw({
      authenticatedUid: ownerUid,
      raffleId,
      drawId,
      idempotencyKey: `idem_${drawId}`,
      commitmentHash: pre.commitmentHash,
      clientEntropy: crypto.randomBytes(32).toString('hex'),
      expectedRosterVersion: pre.rosterVersion,
      expectedDrawSequence: pre.drawSequence,
      fencingToken: pre.fencingToken,
      drawMode: 'drum',
      winnerCount: 1,
      prizeId: 'pz1',
      prizeName: '1º Lugar - PIX R$ 500',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.body as any;
    assert.strictEqual(body.ok, true);
    assert.ok(body.winner && body.winner.name);
    assert.ok(typeof body.winner.number === 'number');
    assert.ok(body.proof && body.proof.protocolVersion === 'GIO_PF_V2');

    const persistedState = await traditionalRaffleService.getRaffleStateForOwner(ownerUid, raffleId);
    assert.strictEqual(persistedState.winners.length, 1);
    assert.strictEqual(persistedState.winners[0].id, body.winner.id);

    const ledgerBundle = await traditionalRaffleService.getVerifiedLedgerBundle(pre.commitmentHash);
    assert.strictEqual(ledgerBundle.valid, true);
    assert.strictEqual(ledgerBundle.terminalType, 'REVEALED');
  });

  return { passed, total };
}
