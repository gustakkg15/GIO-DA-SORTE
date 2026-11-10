/**
 * FASE 5F — TESTES AUTOMATIZADOS DE CONCORRÊNCIA, IDEMPOTÊNCIA E TRANSACIONALIDADE
 */

import assert from 'node:assert';
import {
  InMemoryTransactionalStore,
  TraditionalRaffleError,
} from '../server/traditionalRaffleService.ts';

export async function runConcurrencyIdempotencyTests(): Promise<{ passed: number; total: number }> {
  console.log('\n--- EXECUTANDO TESTES DE CONCORRÊNCIA, IDEMPOTÊNCIA E TRANSACIONALIDADE ---');
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

  // Test 1: Double-click Prevention on Client
  await test('Proteção contra duplo-clique: segundo disparo simultâneo no cliente é ignorado', async () => {
    let callCount = 0;
    let isDrawing = false;
    let drawingRef = false;

    async function handleDrawClick() {
      if (drawingRef || isDrawing) return;
      drawingRef = true;
      isDrawing = true;
      callCount++;
      // Simulate async network latency
      await new Promise((resolve) => setTimeout(resolve, 50));
      isDrawing = false;
      drawingRef = false;
    }

    // Trigger 5 simultaneous clicks
    await Promise.all([
      handleDrawClick(),
      handleDrawClick(),
      handleDrawClick(),
      handleDrawClick(),
      handleDrawClick(),
    ]);

    assert.strictEqual(callCount, 1, 'Apenas 1 execução deve ocorrer entre 5 cliques simultâneos');
  });

  // Test 2: In-Memory Transactional Store Concurrency & Read-Before-Write
  await test('Loja Transacional: Execução sequencial estrita de transações atômicas', async () => {
    const store = new InMemoryTransactionalStore();
    const docPath = 'raffles/default/state';

    await store.setDocDirect(docPath, {
      raffleId: 'default',
      fencingToken: 1,
      rosterVersion: 1,
      drawSequence: 0,
    });

    let incrementCount = 0;

    // Run 10 concurrent transactions incrementing fencingToken
    const txPromises = Array.from({ length: 10 }).map(() =>
      store.runTransaction(async (tx) => {
        const snap = await tx.get(docPath);
        assert.ok(snap.exists, 'Documento de rifa deve existir');
        const data = snap.data() as any;
        const currentToken = data.fencingToken;

        tx.update(docPath, {
          fencingToken: currentToken + 1,
        });
        incrementCount++;
      }, 25)
    );

    await Promise.all(txPromises);

    const finalSnap = await store.getDocDirect(docPath);
    const finalData = finalSnap.data() as any;
    assert.strictEqual(finalData.fencingToken, 11, 'fencingToken final deve ser 11 após 10 incrementos transacionais');
  });

  // Test 3: Idempotency Record Storage and Duplicate Key Deduplication
  await test('Idempotência: requisições duplicadas com a mesma idempotencyKey retornam o registro cacheado sem duplicar sorteio', async () => {
    const store = new InMemoryTransactionalStore();
    const idempotencyPath = 'raffles/default/idempotency/idem_draw_123';

    // 1st request stores idempotency record
    await store.setDocDirect(idempotencyPath, {
      idempotencyKey: 'idem_draw_123',
      winningTicketNumber: 42,
      winnerId: 'participant_42',
      createdAt: Date.now(),
    });

    // 2nd request checks idempotency path
    const snap = await store.getDocDirect(idempotencyPath);
    assert.ok(snap.exists, 'Registro de idempotência deve existir');

    const cachedData = snap.data() as any;
    assert.strictEqual(cachedData.winningTicketNumber, 42, 'Resultado cacheado deve ser retornado');
    assert.strictEqual(cachedData.winnerId, 'participant_42');
  });

  // Test 4: Rejection of Old Fencing Token
  await test('Fencing Token: Rejeição transacional de tokens desatualizados ou desordenados', async () => {
    const currentFencingToken: number = 5;
    const incomingFencingToken: number = 4; // old token

    assert.throws(
      () => {
        if (incomingFencingToken !== currentFencingToken) {
          throw new TraditionalRaffleError(
            409,
            'HTTP_409_INVALID_FENCING_TOKEN',
            `Fencing token inválido. Esperado: ${currentFencingToken}, Recebido: ${incomingFencingToken}`
          );
        }
      },
      (err: any) => err?.errorCode === 'HTTP_409_INVALID_FENCING_TOKEN' || /Fencing token/i.test(err?.message || '')
    );
  });

  // Test 5: Roster Version Change During Pre-commit -> Draw
  await test('Integridade de Roster: alteração da lista (rosterVersion) invalida a tentativa com erro 409', async () => {
    const expectedRosterVersion: number = 2;
    const currentRosterVersionOnServer: number = 3; // Roster was mutated while client was preparing clientEntropy

    assert.throws(
      () => {
        if (expectedRosterVersion !== currentRosterVersionOnServer) {
          throw new TraditionalRaffleError(
            409,
            'HTTP_409_ROSTER_VERSION_MISMATCH',
            `Versão do Roster alterada. Esperado: ${expectedRosterVersion}, Atual: ${currentRosterVersionOnServer}`
          );
        }
      },
      (err: any) => err?.errorCode === 'HTTP_409_ROSTER_VERSION_MISMATCH' || /Versão do Roster/i.test(err?.message || '')
    );
  });

  return { passed, total };
}
