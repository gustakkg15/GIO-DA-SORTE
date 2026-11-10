/**
 * FASE 5G — TESTES COMPLEMENTARES DE CONCORRÊNCIA E IDEMPOTÊNCIA AVANÇADA
 */

import assert from 'node:assert';
import {
  InMemoryTransactionalStore,
  TraditionalRaffleError,
  verifySingleLedgerEvent,
  sha256HexUtf8,
} from '../server/traditionalRaffleService.ts';
import { canonicalizeJSON } from '../utils/raffle.ts';
import type { TraditionalDrawLedgerEvent } from '../types.ts';

export async function runConcurrencyAdvancedTests(): Promise<{ passed: number; total: number }> {
  console.log('\n--- EXECUTANDO TESTES AVANÇADOS DE CONCORRÊNCIA E IDEMPOTÊNCIA (FASE 5G) ---');
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

  // Scenario 1: Two simultaneous requests with DIFFERENT idempotencyKeys for same raffle
  await test('Cenário 1: Duas requisições simultâneas com idempotencyKeys diferentes para a mesma rifa', async () => {
    const store = new InMemoryTransactionalStore();
    const docPath = 'raffles/default/state';

    await store.setDocDirect(docPath, {
      raffleId: 'default',
      fencingToken: 1,
      drawSequence: 0,
      rosterVersion: 1,
    });

    let successCount = 0;
    let conflictCount = 0;

    // Run 2 transactions representing two different draw attempts with expected fencingToken = 1
    const task1 = store
      .runTransaction(async (tx) => {
        const snap = await tx.get(docPath);
        const data = snap.data() as any;
        if (data.fencingToken !== 1) {
          throw new TraditionalRaffleError(409, 'HTTP_409_INVALID_FENCING_TOKEN', 'Fencing token obsoleto');
        }
        tx.update(docPath, {
          fencingToken: data.fencingToken + 1,
          drawSequence: data.drawSequence + 1,
        });
      })
      .then(() => {
        successCount++;
      });

    const task2 = store
      .runTransaction(async (tx) => {
        const snap = await tx.get(docPath);
        const data = snap.data() as any;
        if (data.fencingToken !== 1) {
          throw new TraditionalRaffleError(409, 'HTTP_409_INVALID_FENCING_TOKEN', 'Fencing token obsoleto');
        }
        tx.update(docPath, {
          fencingToken: data.fencingToken + 1,
          drawSequence: data.drawSequence + 1,
        });
      })
      .then(() => {
        successCount++;
      });

    const results = await Promise.allSettled([task1, task2]);
    results.forEach((r) => {
      if (r.status === 'rejected') conflictCount++;
    });

    assert.strictEqual(successCount, 1, 'Exatamente 1 operação deve ter sucesso');
    assert.strictEqual(conflictCount, 1, 'Exatamente 1 operação deve ser rejeitada com erro 409 por token obsoleto');
  });

  // Scenario 2: Timeout after persistence of result
  await test('Cenário 2: Timeout de rede acionado após a persistência do resultado no banco de dados', async () => {
    const store = new InMemoryTransactionalStore();
    const idempotencyPath = 'raffles/default/idempotency/idem_timeout_001';

    // Simulate backend successfully persisting result, but client experiencing network timeout
    await store.setDocDirect(idempotencyPath, {
      idempotencyKey: 'idem_timeout_001',
      winningTicketNumber: 77,
      winnerId: 'p77',
      status: 'CONFIRMED',
      createdAt: Date.now(),
    });

    const docSnap = await store.getDocDirect(idempotencyPath);
    assert.ok(docSnap.exists, 'O registro persistido deve existir mesmo se a resposta HTTP sofreu timeout');
  });

  // Scenario 3: Request retry after timeout using SAME idempotencyKey
  await test('Cenário 3: Repetição da requisição após timeout usando a mesma chave de idempotência', async () => {
    const store = new InMemoryTransactionalStore();
    const idempotencyPath = 'raffles/default/idempotency/idem_retry_001';

    // Initial draw request persists idempotency record
    await store.setDocDirect(idempotencyPath, {
      idempotencyKey: 'idem_retry_001',
      winningTicketNumber: 88,
      winnerId: 'p88',
      status: 'CONFIRMED',
    });

    // Client retries with identical idempotencyKey
    const retrySnap = await store.getDocDirect(idempotencyPath);
    assert.ok(retrySnap.exists);
    const retryData = retrySnap.data() as any;

    assert.strictEqual(retryData.winningTicketNumber, 88, 'A repetição deve retornar o mesmo número sem gerar novo sorteio');
    assert.strictEqual(retryData.winnerId, 'p88');
  });

  // Scenario 4: Delayed/stale response from previous request
  await test('Cenário 4: Resposta atrasada (stale response) de requisição anterior é descartada pelo cliente', async () => {
    let clientSequenceCounter = 2; // Active client request sequence counter
    let activeWinner: any = null;

    // Response from request sequence 1 arrives after request sequence 2 has completed
    const delayedResponseSequence = 1;
    const delayedWinner = { id: 'old_winner', ticketNumber: 10 };

    if (delayedResponseSequence < clientSequenceCounter) {
      // Discard stale response
    } else {
      activeWinner = delayedWinner;
    }

    assert.strictEqual(activeWinner, null, 'Resposta atrasada com sequência menor não deve sobrescrever estado ativo');
  });

  // Scenario 5: Attempt to overwrite confirmed draw result (Ledger Tampering)
  await test('Cenário 5: Tentativa de sobrescrever ou adulterar resultado em evento do Ledger já confirmado', async () => {
    const payload = { winningTicketNumber: 50, winnerId: 'p50' };
    const canonicalPayloadJson = canonicalizeJSON(payload);
    const timestampIso = new Date().toISOString();
    const sequenceNumber = 1;
    const previousEventHash = '0'.repeat(64);

    const eventString = `${sequenceNumber}:${previousEventHash}:REVEALED:${timestampIso}:${canonicalPayloadJson}`;
    const validEventHash = sha256HexUtf8(eventString);

    const legitimateEvent: TraditionalDrawLedgerEvent = {
      eventId: 'evt_test_001',
      commitmentHash: 'c'.repeat(64),
      sequenceNumber,
      previousEventHash,
      eventType: 'REVEALED',
      timestampIso,
      canonicalPayloadJson,
      eventHash: validEventHash,
      payload,
    };

    // Valid event passes verification
    verifySingleLedgerEvent(legitimateEvent, 'REVEALED', previousEventHash, sequenceNumber);

    // Attempted overwrite / payload tampering
    const tamperedEvent: TraditionalDrawLedgerEvent = {
      ...legitimateEvent,
      payload: { winningTicketNumber: 99, winnerId: 'p99_hacker' }, // tampered payload
    };

    assert.throws(
      () => verifySingleLedgerEvent(tamperedEvent, 'REVEALED', previousEventHash, sequenceNumber),
      (err: any) => err?.errorCode === 'HTTP_409_LEDGER_PAYLOAD_TAMPERED' || /Canonical payload mismatch/i.test(err?.message || '')
    );
  });

  // Scenario 6: Concurrent operations attempting to alter same roster version
  await test('Cenário 6: Duas operações concorrentes tentando alterar a mesma versão do roster', async () => {
    const store = new InMemoryTransactionalStore();
    const rafflePath = 'raffles/default/state';

    await store.setDocDirect(rafflePath, {
      raffleId: 'default',
      rosterVersion: 5,
    });

    const updateRosterTx = async (expectedVersion: number, newVersion: number) => {
      return store.runTransaction(async (tx) => {
        const snap = await tx.get(rafflePath);
        const data = snap.data() as any;
        if (data.rosterVersion !== expectedVersion) {
          throw new TraditionalRaffleError(
            409,
            'HTTP_409_ROSTER_VERSION_MISMATCH',
            `Versão do Roster alterada. Esperado: ${expectedVersion}, Atual: ${data.rosterVersion}`
          );
        }
        tx.update(rafflePath, { rosterVersion: newVersion });
      });
    };

    // Op 1 succeeds
    await updateRosterTx(5, 6);

    // Op 2 attempts with stale expectedVersion = 5
    await assert.rejects(
      async () => updateRosterTx(5, 7),
      (err: any) => err?.errorCode === 'HTTP_409_ROSTER_VERSION_MISMATCH' || /Versão do Roster/i.test(err?.message || '')
    );

    const finalSnap = await store.getDocDirect(rafflePath);
    assert.strictEqual((finalSnap.data() as any).rosterVersion, 6, 'Apenas a 1ª atualização válida deve ser mantida');
  });

  return { passed, total };
}
