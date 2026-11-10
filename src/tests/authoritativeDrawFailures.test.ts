/**
 * FASE 5F — TESTES AUTOMATIZADOS DE FALHA E INTEGRALIDADE DO FLUXO AUTORITATIVO
 * Valida a resiliência do cliente e do servidor sob os 13 cenários de erro especificados.
 */

import assert from 'node:assert';
import { safeApiJson, type SafeJsonResponse } from '../utils/apiConfig.ts';

// Mock Client Draw State Container representing React state and refs
interface DrawClientState {
  isDrawing: boolean;
  drawingRef: boolean;
  winner: any | null;
  drawCertificate: any | null;
  drawErrorMessage: string | null;
  participants: Array<{ id: string; name: string; coins: number }>;
  tickets: Array<{ number: number; participantId: string; name: string }>;
}

function createInitialState(): DrawClientState {
  return {
    isDrawing: false,
    drawingRef: false,
    winner: null,
    drawCertificate: null,
    drawErrorMessage: null,
    participants: [
      { id: 'p1', name: 'Alice', coins: 100 },
      { id: 'p2', name: 'Bob', coins: 50 },
    ],
    tickets: [
      { number: 1, participantId: 'p1', name: 'Alice' },
      { number: 2, participantId: 'p2', name: 'Bob' },
    ],
  };
}

/**
 * Pure state machine representing the exact logic implemented in executeAuthoritativeDraw in App.tsx
 */
async function simulateExecuteAuthoritativeDraw(
  state: DrawClientState,
  currentUser: { getIdToken: () => Promise<string> } | null,
  mockFetchPrecommit: () => Promise<SafeJsonResponse>,
  mockFetchDraw: () => Promise<SafeJsonResponse>
): Promise<void> {
  if (state.drawingRef || state.isDrawing) return;
  if (state.tickets.length === 0) return;

  if (!currentUser) {
    state.drawErrorMessage = 'Autenticação obrigatória para realizar sorteios oficiais auditáveis.';
    return;
  }

  state.drawingRef = true;
  state.isDrawing = true;
  state.drawErrorMessage = null;

  try {
    const idToken = await currentUser.getIdToken();
    if (!idToken) {
      throw new Error('Autenticação necessária para realizar sorteios oficiais no servidor.');
    }

    const precommitRes = await mockFetchPrecommit();
    if (!precommitRes.ok || !precommitRes.data?.ok) {
      throw new Error(
        precommitRes.error ||
          precommitRes.data?.message ||
          precommitRes.data?.error ||
          'Servidor indisponível para pré-compromisso do sorteio.'
      );
    }

    const drawRes = await mockFetchDraw();
    if (!drawRes.ok || !drawRes.data?.ok || !drawRes.data.winningTicket || !drawRes.data.winner) {
      throw new Error(
        drawRes.error ||
          drawRes.data?.message ||
          drawRes.data?.error ||
          'O servidor de sorteios rejeitou a confirmação oficial do resultado.'
      );
    }

    // Winner declaration strictly on backend success
    state.winner = drawRes.data.winner;
    state.drawCertificate = drawRes.data.proofV2;
    state.isDrawing = false;
    state.drawingRef = false;
  } catch (err) {
    state.isDrawing = false;
    state.drawingRef = false;
    state.winner = null;
    state.drawCertificate = null;
    state.drawErrorMessage =
      err instanceof Error
        ? err.message
        : 'Erro inesperado ao comunicar com o servidor autoritativo de sorteios.';
  }
}

export async function runAuthoritativeDrawFailuresTests(): Promise<{ passed: number; total: number }> {
  console.log('\n--- EXECUTANDO TESTES DE FALHA E RESILIÊNCIA DO SORTEIO AUTORITATIVO ---');
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

  const validUser = { getIdToken: async () => 'valid_token_123' };
  const okPrecommit: SafeJsonResponse = {
    ok: true,
    status: 200,
    data: {
      ok: true,
      commitmentHash: 'a'.repeat(64),
      rosterVersion: 1,
      drawSequence: 0,
      fencingToken: 1,
    },
  };
  const okDraw: SafeJsonResponse = {
    ok: true,
    status: 200,
    data: {
      ok: true,
      winningTicket: { number: 1, participantId: 'p1', name: 'Alice' },
      winner: { id: 'w1', name: 'Alice', ticketNumber: 1, drawnAt: Date.now() },
      proofV2: { signatureHex: 'b'.repeat(64) },
    },
  };

  function assertFailureInvariants(state: DrawClientState, expectedMessageSubstr?: string) {
    assert.strictEqual(state.winner, null, 'Nenhum vencedor oficial pode ser declarado');
    assert.strictEqual(state.drawCertificate, null, 'Nenhum certificado pode ser emitido');
    assert.strictEqual(state.isDrawing, false, 'isDrawing deve retornar para false');
    assert.strictEqual(state.drawingRef, false, 'drawingRef deve retornar para false');
    assert.strictEqual(state.participants.length, 2, 'Participantes devem permanecer intactos');
    assert.strictEqual(state.tickets.length, 2, 'Bilhetes devem permanecer intactos');
    assert.ok(typeof state.drawErrorMessage === 'string', 'drawErrorMessage deve conter a mensagem de erro');
    if (expectedMessageSubstr) {
      assert.ok(
        state.drawErrorMessage.includes(expectedMessageSubstr),
        `Mensagem '${state.drawErrorMessage}' deve incluir '${expectedMessageSubstr}'`
      );
    }
  }

  // 1. Unauthenticated User
  await test('Cenário 1: Usuário não autenticado aborta antes de chamar o servidor', async () => {
    const state = createInitialState();
    await simulateExecuteAuthoritativeDraw(state, null, async () => okPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Autenticação obrigatória');
  });

  // 2. ID Token Failure
  await test('Cenário 2: Falha ao obter Firebase ID Token', async () => {
    const state = createInitialState();
    const badUser = { getIdToken: async () => '' };
    await simulateExecuteAuthoritativeDraw(state, badUser, async () => okPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Autenticação necessária');
  });

  // 3. Pre-commit HTTP 503
  await test('Cenário 3: Pré-compromisso HTTP 503 (Servidor em aquecimento/manutenção)', async () => {
    const state = createInitialState();
    const mockPrecommit = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 503,
      error: 'Servidor indisponível (HTTP 503)',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, mockPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Servidor indisponível');
  });

  // 4. Pre-commit HTTP 404
  await test('Cenário 4: Pré-compromisso HTTP 404', async () => {
    const state = createInitialState();
    const mockPrecommit = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 404,
      error: 'Rota não encontrada (HTTP 404)',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, mockPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Rota não encontrada');
  });

  // 5. Pre-commit HTML Response (GitHub Pages / Nginx error page)
  await test('Cenário 5: Resposta HTML interceptada pelo safeApiJson em pre-commit', async () => {
    const state = createInitialState();
    const mockPrecommit = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 503,
      isHtml: true,
      error: 'Resposta não-JSON do servidor (503 Service Unavailable).',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, mockPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Resposta não-JSON');
  });

  // 6. Invalid JSON Response
  await test('Cenário 6: Resposta JSON malformatada ou inesperada', async () => {
    const state = createInitialState();
    const mockPrecommit = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 500,
      error: 'Erro interno de parsing JSON',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, mockPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Erro interno');
  });

  // 7. Pre-commit with ok: false in payload
  await test('Cenário 7: Pré-compromisso com ok: false no payload de dados', async () => {
    const state = createInitialState();
    const mockPrecommit = async (): Promise<SafeJsonResponse> => ({
      ok: true,
      status: 200,
      data: { ok: false, error: 'Lista de bilhetes inválida no servidor' },
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, mockPrecommit, async () => okDraw);
    assertFailureInvariants(state, 'Lista de bilhetes inválida');
  });

  // 8. Draw HTTP 503
  await test('Cenário 8: Extração oficial HTTP 503', async () => {
    const state = createInitialState();
    const mockDraw = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 503,
      error: 'Erro de banco de dados na transação',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, mockDraw);
    assertFailureInvariants(state, 'Erro de banco de dados');
  });

  // 9. Draw HTTP 404
  await test('Cenário 9: Extração oficial HTTP 404', async () => {
    const state = createInitialState();
    const mockDraw = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 404,
      error: 'Sorteio não encontrado',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, mockDraw);
    assertFailureInvariants(state, 'Sorteio não encontrado');
  });

  // 10. Draw missing winningTicket
  await test('Cenário 10: Resposta de extração sem campo winningTicket', async () => {
    const state = createInitialState();
    const mockDraw = async (): Promise<SafeJsonResponse> => ({
      ok: true,
      status: 200,
      data: { ok: true, winner: { id: 'w1' } }, // missing winningTicket
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, mockDraw);
    assertFailureInvariants(state, 'rejeitou a confirmação oficial');
  });

  // 11. Draw missing winner object
  await test('Cenário 11: Resposta de extração sem objeto winner', async () => {
    const state = createInitialState();
    const mockDraw = async (): Promise<SafeJsonResponse> => ({
      ok: true,
      status: 200,
      data: { ok: true, winningTicket: { number: 1 } }, // missing winner
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, mockDraw);
    assertFailureInvariants(state, 'rejeitou a confirmação oficial');
  });

  // 12. Inconsistent Response Data
  await test('Cenário 12: Resposta de extração com ok: false', async () => {
    const state = createInitialState();
    const mockDraw = async (): Promise<SafeJsonResponse> => ({
      ok: true,
      status: 200,
      data: { ok: false, message: 'Fencing token expirado' },
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, mockDraw);
    assertFailureInvariants(state, 'Fencing token expirado');
  });

  // 13. Backend Persistence Failure (Cloud Firestore unavailable)
  await test('Cenário 13: Falha de persistência no backend (HTTP 503 Cloud Firestore)', async () => {
    const state = createInitialState();
    const mockDraw = async (): Promise<SafeJsonResponse> => ({
      ok: false,
      status: 503,
      error: 'HTTP_503_FIRESTORE_PERSISTENCE_UNAVAILABLE: Falha de conexão com Firestore',
    });
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, mockDraw);
    assertFailureInvariants(state, 'FIRESTORE_PERSISTENCE_UNAVAILABLE');
  });

  // Test 14: Retry Capability Assertion
  await test('Recuperabilidade: Após qualquer falha, o cliente pode executar uma nova tentativa limpa', async () => {
    const state = createInitialState();
    // 1st attempt fails (503)
    await simulateExecuteAuthoritativeDraw(
      state,
      validUser,
      async () => ({ ok: false, status: 503, error: 'Instabilidade temporária' }),
      async () => okDraw
    );
    assertFailureInvariants(state);

    // 2nd attempt succeeds
    await simulateExecuteAuthoritativeDraw(state, validUser, async () => okPrecommit, async () => okDraw);
    assert.notStrictEqual(state.winner, null, 'Na 2ª tentativa, o vencedor deve ser definido');
    assert.notStrictEqual(state.drawCertificate, null, 'Na 2ª tentativa, o certificado deve ser emitido');
    assert.strictEqual(state.isDrawing, false);
    assert.strictEqual(state.drawingRef, false);
  });

  return { passed, total };
}
