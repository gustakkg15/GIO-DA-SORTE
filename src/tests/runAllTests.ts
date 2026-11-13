/**
 * FASE 5H — MASTER TEST RUNNER & AUDITORIA DE AMBIENTE
 * Executa toda a suíte de testes automatizados de integridade, falha, concorrência e Provably Fair V2,
 * e audita os recursos de integração com Firestore.
 */

import { runProvablyFairV2Tests } from './provablyFairV2.test.ts';
import { runAuthoritativeDrawFailuresTests } from './authoritativeDrawFailures.test.ts';
import { runConcurrencyIdempotencyTests } from './concurrencyIdempotency.test.ts';
import { runProvablyFairVerificationV2Tests } from './provablyFairVerificationV2.test.ts';
import { runConcurrencyAdvancedTests } from './concurrencyAdvanced.test.ts';
import { runFirestoreIntegrationAudit } from './firestoreIntegration.test.ts';
import { runPayPalIntegrationTests } from './paypalIntegration.test.ts';
import { runPayPalCheckoutRouteDiagnostics } from './paypalCheckoutRoute.test.ts';
import { runTraditionalDrawEndToEndTests } from './traditionalDrawEndToEnd.test.ts';
import { runUserProfileWorkspaceTests } from './userProfileWorkspace.test.ts';
import { runArchitectureRulesTests } from './architectureRules.test.ts';

async function main() {
  console.log('========================================================================');
  console.log('  GIO DA SORTE PRO — SUÍTE AUTOMATIZADA DE INTEGRIDADE & PAGAMENTOS');
  console.log('========================================================================');

  const startTime = Date.now();
  let grandTotalPassed = 0;
  let grandTotalCount = 0;

  try {
    // 1. Provably Fair V2 Base Unit Tests (7 tests)
    const pfResults = await runProvablyFairV2Tests();
    grandTotalPassed += pfResults.passed;
    grandTotalCount += pfResults.total;

    // 2. Authoritative Draw Failure Scenarios & Invariants (14 tests)
    const failResults = await runAuthoritativeDrawFailuresTests();
    grandTotalPassed += failResults.passed;
    grandTotalCount += failResults.total;

    // 3. Concurrency & Idempotency Base Tests (5 tests)
    const concResults = await runConcurrencyIdempotencyTests();
    grandTotalPassed += concResults.passed;
    grandTotalCount += concResults.total;

    // 4. Provably Fair V2 Cryptographic Verification & Tampering Tests (7 tests — FASE 5G)
    const pfVerifyResults = await runProvablyFairVerificationV2Tests();
    grandTotalPassed += pfVerifyResults.passed;
    grandTotalCount += pfVerifyResults.total;

    // 5. Advanced Concurrency, Idempotency & Ledger Integrity Tests (6 tests — FASE 5G)
    const concAdvResults = await runConcurrencyAdvancedTests();
    grandTotalPassed += concAdvResults.passed;
    grandTotalCount += concAdvResults.total;

    // 6. PayPal Integration & Mercado Pago Coexistence Tests (15 tests)
    const ppResults = await runPayPalIntegrationTests();
    grandTotalPassed += ppResults.passed;
    grandTotalCount += ppResults.total;

    // 7. PayPal Checkout Route Diagnostics & Safe API Handling Tests (7 tests)
    const ppRouteResults = await runPayPalCheckoutRouteDiagnostics();
    grandTotalPassed += ppRouteResults.passed;
    grandTotalCount += ppRouteResults.total;

    // 8. Traditional Draw End-to-End & Session Winner Integrity Tests (11 tests)
    const mesaE2EResults = await runTraditionalDrawEndToEndTests();
    grandTotalPassed += mesaE2EResults.passed;
    grandTotalCount += mesaE2EResults.total;

    // 9. User Profile & Settings Workspace Tests (6 tests)
    const profileWorkspaceResults = await runUserProfileWorkspaceTests();
    grandTotalPassed += profileWorkspaceResults.passed;
    grandTotalCount += profileWorkspaceResults.total;

    // 10. Fundamental Architecture Rules Tests (6 tests)
    const archRulesResults = await runArchitectureRulesTests();
    grandTotalPassed += archRulesResults.passed;
    grandTotalCount += archRulesResults.total;

    // 11. Firestore Environment Integration Audit (FASE 5H)
    await runFirestoreIntegrationAudit();

    const durationMs = Date.now() - startTime;

    console.log('\n========================================================================');
    console.log(`  RESULTADO FINAL DA SUÍTE AUTOMATIZADA:`);
    console.log(`  ✓ TOTAL DE TESTES PASSADOS: ${grandTotalPassed} / ${grandTotalCount}`);
    console.log(`  ⏱ TEMPO DE EXECUÇÃO: ${durationMs} ms`);
    console.log('========================================================================\n');

    if (grandTotalPassed !== grandTotalCount) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERRO NA EXECUÇÃO DA SUÍTE DE TESTES:', err);
    process.exit(1);
  }
}

main();
