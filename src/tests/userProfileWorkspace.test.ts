import assert from 'node:assert/strict';
import {
  PROFILE_WORKSPACE_SECTIONS,
  deriveUsernameHandle,
  buildPaymentHistoryFromSubscription,
  generateSubscriptionReceiptHtml,
  buildCompleteUserPortabilityArchive,
  buildParticipantsCsvExport,
} from '../utils/userProfileWorkspaceUtils.ts';
import { DEFAULT_SETTINGS } from '../utils/raffle.ts';
import type { UserSubscriptionRecord, ProPlanEntitlement } from '../types.ts';

export async function runUserProfileWorkspaceTests(): Promise<{ passed: number; total: number }> {
  console.log('\n------------------------------------------------------------------------');
  console.log('  SUÍTE 9: AMBIENTE DE PERFIL DO USUÁRIO E CONFIGURAÇÕES (7 SEÇÕES)');
  console.log('------------------------------------------------------------------------');

  let passed = 0;
  const total = 6;

  // Test 1: All 7 independent sections exist and match specification
  {
    const expectedIds = [
      'profile',
      'connections',
      'security',
      'subscription',
      'payments',
      'preferences',
      'privacy',
    ];
    assert.equal(PROFILE_WORKSPACE_SECTIONS.length, 7);
    assert.deepEqual(
      PROFILE_WORKSPACE_SECTIONS.map((s) => s.id),
      expectedIds
    );
    for (const sec of PROFILE_WORKSPACE_SECTIONS) {
      assert.ok(sec.label.length > 0);
      assert.ok(sec.subtitle.length > 0);
      assert.ok(sec.description.length > 10);
      assert.ok(['CONTA', 'FINANCEIRO', 'SISTEMA'].includes(sec.group));
    }
    console.log('  ✓ [9.1] Estrutura das 7 seções independentes do menu secundário validada');
    passed++;
  }

  // Test 2: deriveUsernameHandle normalization
  {
    assert.equal(deriveUsernameHandle('@Gusta.Live', 'Gustavo', 'gusta@test.com'), '@gusta.live');
    assert.equal(deriveUsernameHandle('', 'João da Sorte!', 'joao@test.com'), '@joao_da_sorte');
    assert.equal(deriveUsernameHandle(null, '', 'maria.oficial@exemplo.com'), '@maria.oficial');
    assert.equal(deriveUsernameHandle(null, null, null), '@organizador_gio');
    console.log('  ✓ [9.2] Normalização de @usuário do organizador validada');
    passed++;
  }

  // Test 3: buildPaymentHistoryFromSubscription (FREE vs ACTIVE PayPal/MercadoPago)
  {
    const emptyHistory = buildPaymentHistoryFromSubscription(null);
    assert.equal(emptyHistory.length, 0);

    const mockPayPalSub: UserSubscriptionRecord = {
      uid: 'uid_test_123456',
      email: 'organizador@gio.com',
      emailVerified: true,
      provider: 'PAYPAL',
      planId: 'pro_annual',
      planName: 'GIO DA SORTE PRO Anual',
      tier: 'PRO',
      statusState: 'ACTIVE',
      billingSubStatus: 'PAID_ACTIVE',
      mpPreapprovalId: null,
      mpPlanId: null,
      remoteMpStatus: null,
      paypalSubscriptionId: 'I-PAYPAL987654',
      paypalPlanId: 'P-PLAN123',
      remotePaypalStatus: 'ACTIVE',
      checkoutInitPoint: null,
      contractedPriceVersion: 'v1.0.0',
      contractedAmount: 199.9,
      currency: 'BRL',
      frequency: 12,
      frequencyType: 'months',
      trialApplied: true,
      trialDaysGranted: 3,
      trialStartDate: '2026-11-01T10:00:00.000Z',
      trialEndDate: '2026-11-04T10:00:00.000Z',
      firstPaymentDate: '2026-11-04T10:00:00.000Z',
      nextPaymentDate: '2027-11-04T10:00:00.000Z',
      currentPeriodStart: '2026-11-04T10:00:00.000Z',
      currentPeriodEnd: '2027-11-04T10:00:00.000Z',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      hasUsedFreeTrial: true,
      firstTrialStartedAt: '2026-11-01T10:00:00.000Z',
      firstTrialPreapprovalId: 'I-PAYPAL987654',
      firstTrialPlanId: 'pro_annual',
      acceptedTermsVersion: 'v1.0.0',
      acceptedAt: 1762000000000,
      chargedQuantity: 1,
      chargedAmount: 199.9,
      updatedAt: 1762250000000,
    };

    const history = buildPaymentHistoryFromSubscription(mockPayPalSub);
    assert.equal(history.length, 2);
    assert.equal(history[0].status, 'PAID');
    assert.equal(history[0].provider, 'PAYPAL');
    assert.equal(history[0].amount, 199.9);
    assert.equal(history[1].status, 'TRIAL');
    assert.equal(history[1].amount, 0);
    console.log('  ✓ [9.3] Geração de histórico de pagamentos e ciclos (PayPal / Mercado Pago) validada');
    passed++;
  }

  // Test 4: generateSubscriptionReceiptHtml
  {
    const html = generateSubscriptionReceiptHtml(
      {
        receiptId: 'REC-AL987654-PAID',
        referenceId: 'I-PAYPAL987654',
        provider: 'PAYPAL',
        planId: 'pro_annual',
        planName: 'GIO DA SORTE PRO Anual',
        description: 'Assinatura GIO DA SORTE PRO Anual',
        amount: 199.9,
        currency: 'BRL',
        status: 'PAID',
        issuedAtIso: '2026-11-04T10:00:00.000Z',
        periodStartIso: '2026-11-04T10:00:00.000Z',
        periodEndIso: '2027-11-04T10:00:00.000Z',
      },
      {
        uid: 'uid_test_123456',
        displayName: 'Organizador Teste',
        email: 'organizador@gio.com',
      }
    );
    assert.ok(html.includes('REC-AL987654-PAID'));
    assert.ok(html.includes('I-PAYPAL987654'));
    assert.ok(html.includes('PayPal Subscriptions'));
    assert.ok(html.includes('Organizador Teste'));
    console.log('  ✓ [9.4] Emissão de recibo HTML da assinatura validada');
    passed++;
  }

  // Test 5: buildCompleteUserPortabilityArchive (LGPD Art. 18 JSON)
  {
    const entitlement: ProPlanEntitlement = {
      tier: 'PRO',
      planTier: 'PRO',
      statusState: 'ACTIVE',
      active: true,
      updatedAt: Date.now(),
      features: {
        liveConnection: true,
        giftCapture: true,
        automaticAccounting: true,
        atomicTicketIssuance: true,
        accumulatedCampaigns: true,
      },
    };
    const archive = buildCompleteUserPortabilityArchive({
      user: {
        uid: 'uid_123',
        email: 'user@gio.com',
        displayName: 'Gusta Pro',
        emailVerified: true,
        photoURL: null,
      },
      organizerHandle: '@gusta_pro',
      organizerBio: 'Canal oficial',
      settings: DEFAULT_SETTINGS,
      participants: [{ id: 'p1', name: 'Ana', coins: 200, addedAt: 1700000000000 }],
      winners: [],
      entitlement,
      subscription: null,
      lgpdRequests: [],
    });
    assert.equal(archive.schemaVersion, 'GIO_PORTABILITY_V2');
    assert.equal(archive.profile.usernameHandle, '@gusta_pro');
    assert.equal(archive.raffleData.participantsCount, 1);
    assert.equal(archive.subscriptionSummary.tier, 'PRO');
    console.log('  ✓ [9.5] Pacote de portabilidade de dados JSON (LGPD Art. 18) validado');
    passed++;
  }

  // Test 6: buildParticipantsCsvExport
  {
    const csv = buildParticipantsCsvExport(
      [{ id: 'p1', name: 'Carlos, Jr.', coins: 250, addedAt: 1700000000000 }],
      [
        {
          participant: { id: 'p1', name: 'Carlos, Jr.', coins: 250, addedAt: 1700000000000 },
          wantedTickets: 2,
          assignedTickets: 2,
          tickets: [10, 11],
          remainderCoins: 50,
          winProbability: 100,
        },
      ]
    );
    assert.ok(csv.startsWith('\uFEFFID_Participante,Nome_Participante'));
    assert.ok(csv.includes('"Carlos, Jr."'));
    assert.ok(csv.includes('10 | 11'));
    console.log('  ✓ [9.6] Exportação CSV de participantes e bilhetes com escape RFC-4180 validada');
    passed++;
  }

  return { passed, total };
}
