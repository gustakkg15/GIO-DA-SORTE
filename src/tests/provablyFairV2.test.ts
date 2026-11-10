/**
 * FASE 5F — TESTES AUTOMATIZADOS DE UNIDADE
 * MOTOR PROVABLY FAIR V2 & REJECTION SAMPLING CRIPTOGRÁFICO
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  computeRejectionSamplingDraw,
  computeServerCommitment,
  computeRosterSha256,
  sha256HexUtf8,
  type RejectionSamplingParams,
} from '../server/traditionalRaffleService.ts';
import type { CanonicalTicketEntry } from '../types.ts';

export async function runProvablyFairV2Tests(): Promise<{ passed: number; total: number }> {
  console.log('\n--- EXECUTANDO TESTES PROVABLY FAIR V2 ---');
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  const sampleServerSeed = crypto.randomBytes(32).toString('hex');
  const sampleClientEntropy = crypto.randomBytes(32).toString('hex');
  const sampleRosterHash = crypto.randomBytes(32).toString('hex');

  const baseParams: RejectionSamplingParams = {
    serverSeed: sampleServerSeed,
    rosterSha256Hash: sampleRosterHash,
    clientEntropy: sampleClientEntropy,
    drawNonce: 'nonce_test_123',
    drawId: 'draw_test_001',
    fencingToken: 1,
    rosterVersion: 1,
    drawSequence: 0,
    totalTickets: 759,
  };

  // Test 1: Rejection Sampling executes and returns valid index
  test('Rejection sampling retorna um índice válido dentro dos limites (0 <= winningIndex < totalTickets)', () => {
    const res = computeRejectionSamplingDraw(baseParams);
    assert.ok(typeof res.winningIndex === 'number', 'winningIndex deve ser numérico');
    assert.ok(res.winningIndex >= 0, 'winningIndex deve ser >= 0');
    assert.ok(res.winningIndex < 759, 'winningIndex deve ser menor que totalTickets (759)');
    assert.ok(res.uint32Value < res.limitN, 'uint32Value deve ser aceito estritamente dentro do limite de amostragem');
  });

  // Test 2: Absolute Determinism
  test('Determinismo: mesmas entradas criptográficas geram exatamente o mesmo resultado', () => {
    const res1 = computeRejectionSamplingDraw(baseParams);
    const res2 = computeRejectionSamplingDraw(baseParams);
    assert.strictEqual(res1.winningIndex, res2.winningIndex, 'Índices devem ser idênticos');
    assert.strictEqual(res1.uint32Value, res2.uint32Value, 'Valores uint32 gerados devem ser idênticos');
    assert.strictEqual(res1.mBase, res2.mBase, 'Mensagem mBase HMAC deve ser idêntica');
  });

  // Test 3: Output Divergence on Client Entropy Change
  test('Divergência: alterar 1 caractere da entropia do cliente altera a mensagem HMAC mBase', () => {
    const modifiedEntropy = sampleClientEntropy.substring(0, 63) + (sampleClientEntropy.slice(-1) === 'a' ? 'b' : 'a');
    const res2 = computeRejectionSamplingDraw({
      ...baseParams,
      clientEntropy: modifiedEntropy,
    });
    assert.notStrictEqual(res1_mbase(baseParams), res2.mBase, 'mBase deve ser diferente com entropia diferente');
  });

  function res1_mbase(p: RejectionSamplingParams) {
    return computeRejectionSamplingDraw(p).mBase;
  }

  // Test 4: Modulo Bias Absence & Sampling Limit Check
  test('Ausência de viés de módulo (Modulo Bias): limitN calcula múltiplos perfeitos de totalTickets', () => {
    const totalTickets = 759;
    const TWO_POW_32 = 4294967296;
    const expectedLimit = Math.floor(TWO_POW_32 / totalTickets) * totalTickets;
    const res = computeRejectionSamplingDraw(baseParams);
    assert.strictEqual(res.limitN, expectedLimit, 'limitN deve ser o múltiplo truncado de 2^32');
    assert.strictEqual(expectedLimit % totalTickets, 0, 'limitN % totalTickets deve ser zero');
  });

  // Test 5: Commitment Hash Verification
  test('Verificação de compromisso SHA-256 do servidor (computeServerCommitment)', () => {
    const seed = 'a'.repeat(64);
    const salt = 'b'.repeat(32);
    const hash = computeServerCommitment(seed, salt);
    const expected = crypto.createHash('sha256').update(`${seed}:${salt}`).digest('hex');
    assert.strictEqual(hash, expected, 'Hash de compromisso deve ser SHA-256 de seed:salt');
  });

  // Test 6: Roster SHA-256 Hash Integrity
  test('Integridade de Roster Hash SHA-256 (canonicalize & hash)', () => {
    const rawTickets: CanonicalTicketEntry[] = [
      { number: 1, participantId: 'p1', name: 'Alice' },
      { number: 2, participantId: 'p2', name: 'Bob' },
    ];
    const r1 = computeRosterSha256(rawTickets);
    assert.strictEqual(r1.sortedTickets.length, 2);
    assert.ok(/^[0-9a-f]{64}$/.test(r1.rosterSha256Hash), 'Roster hash deve ser hexadecimal de 64 caracteres');

    // Order change does not break determinism if canonicalized
    const rawTicketsReordered: CanonicalTicketEntry[] = [
      { number: 2, participantId: 'p2', name: 'Bob' },
      { number: 1, participantId: 'p1', name: 'Alice' },
    ];
    const r2 = computeRosterSha256(rawTicketsReordered);
    assert.strictEqual(r1.rosterSha256Hash, r2.rosterSha256Hash, 'Roster hash deve ser imutável independente da ordem dos tickets');
  });

  // Test 7: Rejection of Invalid Cryptographic Inputs
  test('Rejeição estrita de entradas malformatadas no Rejection Sampling', () => {
    assert.throws(
      () => computeRejectionSamplingDraw({ ...baseParams, serverSeed: 'invalid_short' }),
      /INVALID_SERVER_SEED/
    );
    assert.throws(
      () => computeRejectionSamplingDraw({ ...baseParams, clientEntropy: 'not_hex' }),
      /INVALID_CLIENT_ENTROPY/
    );
    assert.throws(
      () => computeRejectionSamplingDraw({ ...baseParams, fencingToken: -1 }),
      (err: any) => err?.errorCode === 'HTTP_409_INVALID_FENCING_TOKEN' || /fencingToken/.test(err?.message || '')
    );
  });

  return { passed, total };
}
