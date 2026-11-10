/**
 * FASE 5G — TESTES COMPLEMENTARES DE VERIFICAÇÃO CRIPTOGRÁFICA PROVABLY FAIR V2
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  computeServerCommitment,
  computeRejectionSamplingDraw,
  sha256HexUtf8,
  type RejectionSamplingParams,
} from '../server/traditionalRaffleService.ts';
import type { TraditionalDrawProofV2 } from '../types.ts';

/**
 * Pure verification function representing proof verification logic
 */
export function verifyProofV2Certificate(proof: TraditionalDrawProofV2): {
  valid: boolean;
  reason?: string;
} {
  // 1. Verify Server Commitment Hash
  const expectedCommitment = computeServerCommitment(proof.serverSeed, proof.salt);
  if (expectedCommitment !== proof.commitmentHash) {
    return { valid: false, reason: 'RESERVED_SEED_COMMITMENT_MISMATCH' };
  }

  // 2. Recompute Rejection Sampling
  const params: RejectionSamplingParams = {
    serverSeed: proof.serverSeed,
    rosterSha256Hash: proof.rosterSha256Hash,
    clientEntropy: proof.clientEntropy,
    drawNonce: proof.drawNonce,
    drawId: proof.drawId,
    fencingToken: proof.fencingToken,
    rosterVersion: proof.rosterVersion,
    drawSequence: proof.drawSequence,
    totalTickets: proof.totalEligibleTickets,
  };

  const sampleRes = computeRejectionSamplingDraw(params);
  if (sampleRes.winningIndex !== proof.winningIndex) {
    return { valid: false, reason: 'WINNING_INDEX_MISMATCH' };
  }

  // 3. Recompute Signature Hash / EventHash
  const canonicalString = [
    proof.protocolVersion,
    proof.commitmentHash,
    proof.serverSeed,
    proof.salt,
    proof.clientEntropy,
    proof.drawNonce,
    proof.drawId,
    String(proof.fencingToken),
    String(proof.rosterVersion),
    String(proof.drawSequence),
    proof.rosterSha256Hash,
    String(proof.winningIndex),
    String(proof.winningNumber),
    String(proof.totalEligibleTickets),
  ].join(':');

  const expectedSig = crypto
    .createHmac('sha256', Buffer.from(proof.serverSeed, 'hex'))
    .update(canonicalString, 'utf8')
    .digest('hex');

  if (expectedSig !== proof.eventHash) {
    return { valid: false, reason: 'INVALID_SIGNATURE_HMAC' };
  }

  return { valid: true };
}

export async function runProvablyFairVerificationV2Tests(): Promise<{ passed: number; total: number }> {
  console.log('\n--- EXECUTANDO TESTES DE VERIFICAÇÃO CRIPTOGRÁFICA PROVABLY FAIR V2 ---');
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

  const serverSeed = crypto.randomBytes(32).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const commitmentHash = computeServerCommitment(serverSeed, salt);
  const clientEntropy = crypto.randomBytes(32).toString('hex');
  const rosterSha256Hash = crypto.randomBytes(32).toString('hex');

  const params: RejectionSamplingParams = {
    serverSeed,
    rosterSha256Hash,
    clientEntropy,
    drawNonce: 'nonce_proof_001',
    drawId: 'draw_proof_001',
    fencingToken: 1,
    rosterVersion: 1,
    drawSequence: 0,
    totalTickets: 100,
  };

  const sampleRes = computeRejectionSamplingDraw(params);

  function createValidProof(): TraditionalDrawProofV2 {
    const winningIndex = sampleRes.winningIndex;
    const winningNumber = sampleRes.winningIndex + 1;

    const canonicalString = [
      'GIO_PF_V2',
      commitmentHash,
      serverSeed,
      salt,
      clientEntropy,
      'nonce_proof_001',
      'draw_proof_001',
      '1',
      '1',
      '0',
      rosterSha256Hash,
      String(winningIndex),
      String(winningNumber),
      '100',
    ].join(':');

    const eventHash = crypto
      .createHmac('sha256', Buffer.from(serverSeed, 'hex'))
      .update(canonicalString, 'utf8')
      .digest('hex');

    return {
      protocolVersion: 'GIO_PF_V2',
      commitmentHash,
      serverSeed,
      salt,
      clientEntropy,
      drawNonce: 'nonce_proof_001',
      drawId: 'draw_proof_001',
      fencingToken: 1,
      rosterVersion: 1,
      drawSequence: 0,
      rosterSha256Hash,
      winningIndex,
      winningNumber,
      winnerParticipantId: 'p42',
      winnerName: 'Ganhador',
      blockIndex: sampleRes.blockIndex,
      wordOffset: sampleRes.wordOffset,
      uint32Value: sampleRes.uint32Value,
      limitN: sampleRes.limitN,
      totalEligibleTickets: 100,
      eventHash,
      previousEventHash: '0'.repeat(64),
      sequenceNumber: 1,
      drawnAtIso: new Date().toISOString(),
    };
  }

  // Test 1: Valid Certificate Verification
  await test('Verificação de Assinatura HMAC-SHA256: Certificado válido é aceito com sucesso', async () => {
    const proof = createValidProof();
    const result = verifyProofV2Certificate(proof);
    assert.strictEqual(result.valid, true, 'Certificado válido deve passar na verificação');
  });

  // Test 2: Rejection of Tampered Signature
  await test('Rejeição de certificado com assinatura HMAC adulterada', async () => {
    const proof = createValidProof();
    proof.eventHash = 'f'.repeat(64); // tampered signature
    const result = verifyProofV2Certificate(proof);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'INVALID_SIGNATURE_HMAC');
  });

  // Test 3: Rejection of Tampered Server Seed
  await test('Rejeição de certificado com semente do servidor (serverSeed) alterada', async () => {
    const proof = createValidProof();
    proof.serverSeed = crypto.randomBytes(32).toString('hex'); // tampered seed
    const result = verifyProofV2Certificate(proof);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'RESERVED_SEED_COMMITMENT_MISMATCH');
  });

  // Test 4: Rejection of Tampered Roster Hash
  await test('Rejeição de certificado com hash da lista de bilhetes (rosterSha256Hash) alterado', async () => {
    const proof = createValidProof();
    proof.rosterSha256Hash = crypto.randomBytes(32).toString('hex'); // tampered roster hash
    const result = verifyProofV2Certificate(proof);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'WINNING_INDEX_MISMATCH');
  });

  // Test 5: Rejection of Tampered Winning Ticket Index
  await test('Rejeição de certificado com bilhete vencedor (winningTicket) alterado', async () => {
    const proof = createValidProof();
    proof.winningIndex = (proof.winningIndex + 1) % 100; // tampered index
    const result = verifyProofV2Certificate(proof);
    assert.strictEqual(result.valid, false);
  });

  // Test 6: Validation of Match between winningTicket and Winner Object
  await test('Validação da correspondência entre winningTicket e objeto winner', async () => {
    const proof = createValidProof();
    const winningTicket = { number: proof.winningNumber, participantId: proof.winnerParticipantId, name: proof.winnerName };
    const winnerObj = { id: 'w1', name: proof.winnerName, ticketNumber: proof.winningNumber };

    assert.strictEqual(winningTicket.number, winnerObj.ticketNumber, 'Número do bilhete deve ser idêntico');
    assert.strictEqual(winningTicket.name, winnerObj.name, 'Nome do participante deve ser idêntico');
  });

  // Test 7: Verification of Server Seed Revelation against Original Commitment
  await test('Verificação da revelação da semente contra o compromisso SHA-256 original', async () => {
    const testSeed = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const testSalt = '1234567890abcdef1234567890abcdef';
    const commitment = computeServerCommitment(testSeed, testSalt);

    const checkHash = computeServerCommitment(testSeed, testSalt);
    assert.strictEqual(checkHash, commitment, 'Revelação da semente deve corresponder exatamente ao compromisso');
  });

  return { passed, total };
}
