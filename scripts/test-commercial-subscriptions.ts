import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  MercadoPagoSubscriptionService,
  MercadoPagoTransport,
  isMpCanceledStatus,
  normalizeMpRemoteStatus,
  redactSensitiveMpData,
} from '../src/server/mercadoPagoSubscriptionService.js';
import { saveCommercialSubscriptionConfig } from '../src/utils/legalAndComplianceService.js';
import { getProPlanEntitlement } from '../src/utils/tiktokLiveService.js';

async function runTests() {
  console.log('================================================================================');
  console.log('GIO DA SORTE PRO — SUITE DE TESTES LOCAIS SIMULADOS (PLANOS COMERCIAIS & MP)');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // PARTE 1: VERIFICAÇÃO DA TRAVA FAIL-CLOSED E VALIDAÇÃO DE CONTA (GET /users/me)
  // ---------------------------------------------------------------------------
  console.log('[PARTE 1] Verificando trava Fail-Closed e validação de identidade via GET /users/me...');
  const savedEnvToken = process.env.MP_ACCESS_TOKEN;
  process.env.MP_ACCESS_TOKEN = '';

  const liveService = new MercadoPagoSubscriptionService();
  const credStatusEmpty = liveService.getEnvironmentCredentialStatus();
  assert.equal(
    credStatusEmpty.accessTokenConfigured,
    false,
    'Quando MP_ACCESS_TOKEN está ausente, accessTokenConfigured deve ser false'
  );

  // Garante estado inicial PENDING_CREDENTIALS
  await saveCommercialSubscriptionConfig({
    mpHomologationStatus: 'PENDING_CREDENTIALS',
  });

  const liveHomologReport = await liveService.executeTenStepHomologationVerification();
  assert.equal(liveHomologReport.status, 'PENDING_CREDENTIALS');
  assert.equal(liveHomologReport.steps.length, 10);
  assert.ok(liveHomologReport.steps.every((s) => s.status === 'BLOCKED_PENDING_CREDENTIALS'));

  const blockedCheckout = await liveService.initiateCheckout({
    uid: 'uid_real_check_001',
    email: 'organizador@giodasorte.com',
    emailVerified: true,
    planId: 'pro_monthly',
    acceptedTerms: true,
    backUrl: 'https://giodasorte.com/?mp_return=1',
  });
  assert.equal(blockedCheckout.allowed, false);
  assert.equal(blockedCheckout.status, 503);
  assert.equal(blockedCheckout.code, 'CONTRACTING_BLOCKED_PENDING_MP_HOMOLOGATION');

  // Restaura o token de ambiente após o teste de ausência
  if (savedEnvToken !== undefined) {
    process.env.MP_ACCESS_TOKEN = savedEnvToken;
  }

  // Teste 1.B: Token APP_USR- pertencente a conta test_user deve ser ACEITO em DEV
  const testUserAppUsrTransport: MercadoPagoTransport = {
    createPreapprovalPlan: async () => ({ status: 201, data: {} }),
    getPreapprovalPlan: async () => ({ status: 200, data: {} }),
    createPreapproval: async () => ({ status: 201, data: {} }),
    getPreapproval: async () => ({ status: 200, data: {} }),
    updatePreapproval: async () => ({ status: 200, data: { status: 'cancelled' } }),
    getCollectorIdentity: async () => ({
      status: 200,
      data: {
        id: 3809511744,
        site_id: 'MLB',
        nickname: 'TESTUSER123',
        tags: ['user_product_seller', 'test_user', 'normal'],
      },
    }),
  };
  const testAccountCheck = await liveService.verifyCollectorAccountIdentity(testUserAppUsrTransport);
  assert.equal(testAccountCheck.isTestUserAccount, true);
  assert.equal(testAccountCheck.allowedInDev, true);

  // Teste 1.C: Token pertencente a conta REAL de produção (sem tag test_user) deve ser BLOQUEADO em DEV
  const prodAccountTransport: MercadoPagoTransport = {
    createPreapprovalPlan: async () => ({ status: 201, data: {} }),
    getPreapprovalPlan: async () => ({ status: 200, data: {} }),
    createPreapproval: async () => ({ status: 201, data: {} }),
    getPreapproval: async () => ({ status: 200, data: {} }),
    updatePreapproval: async () => ({ status: 200, data: { status: 'cancelled' } }),
    getCollectorIdentity: async () => ({
      status: 200,
      data: {
        id: 999888777,
        site_id: 'MLB',
        nickname: 'CONTA_REAL_PROD',
        tags: ['user_product_seller', 'normal'],
      },
    }),
  };
  const prodAccountCheck = await liveService.verifyCollectorAccountIdentity(prodAccountTransport);
  assert.equal(prodAccountCheck.isTestUserAccount, false);
  assert.equal(prodAccountCheck.allowedInDev, false);
  assert.ok(prodAccountCheck.reason.includes('PRODUCTION_ACCOUNT_BLOCKED_IN_DEV'));

  const blockedProdReport = await liveService.executeTenStepHomologationVerification({
    customTransport: prodAccountTransport,
    isSimulatedTransport: true,
  });
  assert.equal(blockedProdReport.status, 'PENDING_CREDENTIALS');
  assert.equal(blockedProdReport.contractingUnlocked, false);
  assert.ok(blockedProdReport.blockReason?.includes('PRODUCTION_ACCOUNT_BLOCKED_IN_DEV'));
  console.log('  ✔ Trava Fail-Closed, aceitação de test_user APP_USR- e bloqueio de conta de produção em DEV validados.');

  // ---------------------------------------------------------------------------
  // PARTE 2: VALIDAÇÃO DE PAYLOADS OFICIAIS E CANCELAMENTO {"status":"cancelled"} + NORMALIZAÇÃO
  // ---------------------------------------------------------------------------
  console.log('\n[PARTE 2] Validando payloads oficiais do Mercado Pago e cancelamento {"status":"cancelled"}...');
  const plans = await liveService.getOfficialPlans();
  assert.equal(plans.monthly.price, 29.9);
  assert.equal(plans.monthly.frequency, 1);
  assert.equal(plans.monthly.frequencyType, 'months');
  assert.deepEqual(plans.monthly.freeTrial, { frequency: 3, frequencyType: 'days' });

  assert.equal(plans.annual.price, 199.9);
  assert.equal(plans.annual.frequency, 12);
  assert.equal(plans.annual.frequencyType, 'months');
  assert.deepEqual(plans.annual.freeTrial, { frequency: 3, frequencyType: 'days' });
  assert.equal(plans.annual.monthlyEquivalent, 16.66);
  assert.equal(plans.annual.annualSavingsAmount, 158.9);
  assert.equal(plans.annual.annualDiscountPercent, 44.3);

  const monthlyIndividualPayload = liveService.buildOfficialIndividualPreapprovalPayload({
    plan: plans.monthly,
    uid: 'firebase_uid_12345',
    payerEmail: 'comprador@teste.com',
    backUrl: 'https://giodasorte.com/return',
    includeFreeTrial: true,
  });
  assert.equal(monthlyIndividualPayload.status, 'pending');
  assert.equal(monthlyIndividualPayload.external_reference, 'firebase_uid_12345');
  assert.equal(monthlyIndividualPayload.payer_email, 'comprador@teste.com');
  assert.equal((monthlyIndividualPayload.auto_recurring as any).transaction_amount, 29.9);
  assert.equal((monthlyIndividualPayload.auto_recurring as any).frequency, 1);
  assert.deepEqual((monthlyIndividualPayload.auto_recurring as any).free_trial, {
    frequency: 3,
    frequency_type: 'days',
  });
  assert.equal('preapproval_plan_id' in monthlyIndividualPayload, false);

  const annualPlanPayload = liveService.buildOfficialPreapprovalPlanPayload(
    plans.annual,
    'https://giodasorte.com/return',
    true
  );
  assert.equal((annualPlanPayload.auto_recurring as any).transaction_amount, 199.9);
  assert.equal((annualPlanPayload.auto_recurring as any).frequency, 12);
  assert.equal((annualPlanPayload.auto_recurring as any).frequency_type, 'months');

  const altAPayload = liveService.buildOfficialAssociatedPlanTransparentPayload({
    preapprovalPlanId: 'plan_mp_annual_001',
    plan: plans.annual,
    uid: 'firebase_uid_12345',
    payerEmail: 'comprador@teste.com',
    cardTokenId: 'tok_test_999',
    backUrl: 'https://giodasorte.com/return',
  });
  assert.equal(altAPayload.preapproval_plan_id, 'plan_mp_annual_001');
  assert.equal(altAPayload.card_token_id, 'tok_test_999');
  assert.equal(altAPayload.external_reference, 'firebase_uid_12345');

  const cancelPayload = liveService.buildOfficialCancelPayload();
  assert.deepEqual(cancelPayload, { status: 'cancelled' });
  assert.equal(isMpCanceledStatus('cancelled'), true);
  assert.equal(isMpCanceledStatus('canceled'), true);
  assert.equal(normalizeMpRemoteStatus('cancelled'), 'canceled');
  assert.equal(normalizeMpRemoteStatus('canceled'), 'canceled');

  const redacted = redactSensitiveMpData({
    card_token_id: 'secret_card_token',
    access_token: 'APP_USR-12345',
    external_reference: 'firebase_uid_12345',
  });
  assert.equal(redacted.card_token_id, '[REDACTED]');
  assert.equal(redacted.access_token, '[REDACTED]');
  assert.equal(redacted.external_reference, 'firebase_uid_12345');
  console.log('  ✔ Payloads Mensal (R$ 29,90), Anual (R$ 199,90 integral) e Cancelamento ({"status":"cancelled"} -> normalizado "canceled") validados.');

  // ---------------------------------------------------------------------------
  // PARTE 3: TESTE AUTOMATIZADO SIMULADO DE DIVERGÊNCIA DE FREE_TRIAL NA HOMOLOGAÇÃO
  // ---------------------------------------------------------------------------
  console.log('\n[PARTE 3] Testando detecção de divergência quando free_trial não é aplicado...');
  const divergentTransport: MercadoPagoTransport = {
    createPreapprovalPlan: async () => ({ status: 201, data: {} }),
    getPreapprovalPlan: async () => ({ status: 200, data: {} }),
    createPreapproval: async (payload) => ({
      status: 201,
      data: {
        id: 'mp_divergent_001',
        status: 'pending',
        reason: payload.reason,
        external_reference: payload.external_reference,
        payer_email: payload.payer_email,
        init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=mp_divergent_001',
        date_created: new Date().toISOString(),
        next_payment_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 29.9,
          currency_id: 'BRL',
        },
      },
    }),
    getPreapproval: async (id) => ({
      status: 200,
      data: {
        id,
        status: 'authorized',
        reason: 'GIO DA SORTE PRO Mensal',
        external_reference: 'uid_test',
        payer_email: 'test@testuser.com',
        date_created: new Date().toISOString(),
        // Divergência: cobrança no mesmo dia em vez de +3 dias!
        next_payment_date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 29.9,
          currency_id: 'BRL',
        },
      },
    }),
    updatePreapproval: async (id, payload) => ({
      status: 200,
      data: { id, status: payload.status },
    }),
  };

  const divergentService = new MercadoPagoSubscriptionService();
  const divergentReport = await divergentService.executeTenStepHomologationVerification({
    customTransport: divergentTransport,
    isSimulatedTransport: true,
  });
  assert.equal(divergentReport.status, 'FAILED_TRIAL_CHECK');
  assert.equal(divergentReport.trialConfirmedSevenDays, false);
  assert.equal(divergentReport.contractingUnlocked, false);
  console.log('  ✔ Divergência de free_trial/next_payment_date detectada e bloqueada (FAILED_TRIAL_CHECK).');

  // ---------------------------------------------------------------------------
  // PARTE 4: SIMULAÇÃO AUTOMATIZADA DOS 12 CENÁRIOS OBRIGATÓRIOS DE NEGÓCIO
  // ---------------------------------------------------------------------------
  console.log('\n[PARTE 4] Executando os 12 cenários obrigatórios de regras de negócio (Transporte Simulado)...');

  const remotePreapprovals = new Map<string, any>();
  let seqCounter = 1000;

  const mockMpTransport: MercadoPagoTransport = {
    createPreapprovalPlan: async (payload) => ({ status: 201, data: { id: 'plan_1', ...payload } }),
    getPreapprovalPlan: async (id) => ({ status: 200, data: { id } }),
    createPreapproval: async (payload) => {
      seqCounter += 1;
      const id = `mp_sub_${seqCounter}`;
      const nowMs = Date.now();
      const autoRec = (payload.auto_recurring || {}) as Record<string, any>;
      const hasTrial = Boolean(autoRec.free_trial && autoRec.free_trial.frequency === 3);
      const nextPaymentMs = hasTrial
        ? nowMs + 3 * 24 * 60 * 60 * 1000
        : nowMs + (autoRec.frequency === 12 ? 365 : 30) * 24 * 60 * 60 * 1000;

      const created = {
        id,
        status: 'pending',
        reason: String(payload.reason || ''),
        external_reference: String(payload.external_reference || ''),
        payer_email: String(payload.payer_email || ''),
        init_point: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`,
        date_created: new Date(nowMs).toISOString(),
        next_payment_date: new Date(nextPaymentMs).toISOString(),
        auto_recurring: {
          frequency: Number(autoRec.frequency || 1),
          frequency_type: 'months',
          transaction_amount: Number(autoRec.transaction_amount || 29.9),
          currency_id: 'BRL',
          free_trial: hasTrial ? { frequency: 3, frequency_type: 'days' } : undefined,
        },
        summarized: {
          charged_quantity: 0,
          charged_amount: 0,
          semaphore: 'green',
        },
      };
      remotePreapprovals.set(id, created);
      return { status: 201, data: created };
    },
    getPreapproval: async (id) => {
      const found = remotePreapprovals.get(id);
      if (!found) return { status: 404, data: {} };
      return { status: 200, data: found };
    },
    updatePreapproval: async (id, payload) => {
      const found = remotePreapprovals.get(id);
      if (!found) return { status: 404, data: {} };
      if (payload.status) {
        found.status = payload.status;
      }
      remotePreapprovals.set(id, found);
      return { status: 200, data: found };
    },
  };

  const simService = new MercadoPagoSubscriptionService();
  simService.setCustomTransportForTesting(mockMpTransport);

  // Valida as 10 etapas no transporte simulado
  const simHomolog = await simService.executeTenStepHomologationVerification({
    customTransport: mockMpTransport,
    isSimulatedTransport: true,
  });
  assert.equal(simHomolog.steps.every((s) => s.status === 'PASSED'), true);
  assert.equal(simHomolog.trialConfirmedSevenDays, true);
  assert.equal(simHomolog.noImmediateChargeConfirmed, true);
  assert.equal(simHomolog.externalReferenceUidConfirmed, true);
  assert.equal(simHomolog.canceledStopsFutureChargesConfirmed, true);
  // Importante: como isSimulatedTransport === true, contractingUnlocked continua false para não simular liberação em produção!
  assert.equal(simHomolog.contractingUnlocked, false);
  console.log('  ✔ Protocolo de 10 etapas validado no transporte simulado (sem liberar produção sem API real).');

  // Habilita temporariamente mpHomologationStatus = VERIFIED apenas para testar os cenários de contratação no transporte simulado
  await saveCommercialSubscriptionConfig({
    mpHomologationStatus: 'VERIFIED',
  });

  // Cenário 1: Contratação do Plano PRO Mensal (R$ 29,90 + 3 dias grátis)
  const uidMonthly = `user_monthly_${Date.now()}`;
  const checkoutMonthly = await simService.initiateCheckout({
    uid: uidMonthly,
    email: 'mensal@teste.com',
    emailVerified: true,
    planId: 'pro_monthly',
    acceptedTerms: true,
    backUrl: 'https://giodasorte.com/return',
  });
  assert.equal(checkoutMonthly.allowed, true);
  assert.ok(checkoutMonthly.preapprovalId);
  assert.ok(checkoutMonthly.initPoint?.includes(checkoutMonthly.preapprovalId!));
  assert.equal(checkoutMonthly.subscription?.statusState, 'PENDING');
  assert.equal(checkoutMonthly.subscription?.contractedAmount, 29.9);
  assert.equal(checkoutMonthly.subscription?.frequency, 1);
  console.log('  ✔ Cenário 1: Contratação Mensal (R$ 29,90, status inicial PENDING, init_point individual).');

  // Cenário 2: Contratação do Plano PRO Anual (R$ 199,90 integral + 3 dias grátis)
  const uidAnnual = `user_annual_${Date.now()}`;
  const checkoutAnnual = await simService.initiateCheckout({
    uid: uidAnnual,
    email: 'anual@teste.com',
    emailVerified: true,
    planId: 'pro_annual',
    acceptedTerms: true,
    backUrl: 'https://giodasorte.com/return',
  });
  assert.equal(checkoutAnnual.allowed, true);
  assert.ok(checkoutAnnual.preapprovalId);
  assert.equal(checkoutAnnual.subscription?.contractedAmount, 199.9);
  assert.equal(checkoutAnnual.subscription?.frequency, 12);
  console.log('  ✔ Cenário 2: Contratação Anual (R$ 199,90 integral por 12 meses, sem parcelamento mensal).');

  // Cenário 3: Acesso ativo durante os 3 dias de teste gratuito após autorização no Mercado Pago
  const mpMonthlyObj = remotePreapprovals.get(checkoutMonthly.preapprovalId!);
  mpMonthlyObj.status = 'authorized';
  const verifyMonthlyTrial = await simService.verifyAndSyncUserSubscription({
    authenticatedUid: uidMonthly,
    requestedPreapprovalId: checkoutMonthly.preapprovalId!,
  });
  assert.equal(verifyMonthlyTrial.success, true);
  assert.equal(verifyMonthlyTrial.subscription?.statusState, 'ACTIVE');
  assert.equal(verifyMonthlyTrial.subscription?.billingSubStatus, 'TRIAL_ACTIVE');
  assert.equal(verifyMonthlyTrial.subscription?.hasUsedFreeTrial, true);
  assert.equal(getProPlanEntitlement(uidMonthly).active, true);
  console.log('  ✔ Cenário 3: Acesso PRO liberado durante os 3 dias de teste gratuito (TRIAL_ACTIVE / ACTIVE).');

  // Cenário 12: Bloqueio de tentativa de sequestro de assinatura por outra conta (Account B -> Account A)
  const hijackAttempt = await simService.verifyAndSyncUserSubscription({
    authenticatedUid: 'uid_attacker_account_b',
    requestedPreapprovalId: checkoutMonthly.preapprovalId!,
  });
  assert.equal(hijackAttempt.success, false);
  assert.equal(hijackAttempt.status, 403);
  assert.equal(hijackAttempt.code, 'SUBSCRIPTION_OWNERSHIP_MISMATCH_BLOCKED');
  console.log('  ✔ Cenário 12: Tentativa de reivindicação cruzada por outra conta bloqueada (403 Ownership Mismatch).');

  // Cenário 5: Cancelamento durante os 3 dias de teste gratuito ("status": "cancelled" no HTTP -> normalizado "canceled" + retenção até trialEndDate)
  const cancelDuringTrial = await simService.cancelSubscription({
    uid: uidMonthly,
    actor: 'mensal@teste.com',
  });
  assert.equal(cancelDuringTrial.success, true);
  assert.deepEqual(cancelDuringTrial.payloadSentToMp, { status: 'cancelled' });
  assert.equal(remotePreapprovals.get(checkoutMonthly.preapprovalId!).status, 'cancelled');
  assert.equal(cancelDuringTrial.subscription?.remoteMpStatus, 'canceled');
  assert.equal(cancelDuringTrial.subscription?.cancelAtPeriodEnd, true);
  assert.equal(cancelDuringTrial.subscription?.statusState, 'ACTIVE');
  assert.equal(cancelDuringTrial.subscription?.billingSubStatus, 'CANCELED_ACTIVE_UNTIL_END');
  console.log(
    '  ✔ Cenário 5: Cancelamento no teste enviou {"status":"cancelled"} (normalizado para "canceled") e manteve acesso PRO até trialEndDate.'
  );

  // Cenário 10: Prevenção de reutilização dos 3 dias de teste pelo mesmo Firebase UID
  const secondCheckoutSameUid = await simService.initiateCheckout({
    uid: uidMonthly,
    email: 'mensal@teste.com',
    emailVerified: true,
    planId: 'pro_monthly',
    acceptedTerms: true,
    backUrl: 'https://giodasorte.com/return',
  });
  assert.equal(secondCheckoutSameUid.allowed, true);
  assert.equal(secondCheckoutSameUid.preview?.trialEligible, false);
  assert.equal(secondCheckoutSameUid.preview?.trialDays, 0);
  assert.equal(secondCheckoutSameUid.subscription?.trialApplied, false);
  // Verifica que o e-mail real do cliente foi preservado na operação normal (não substituído por @testuser.com)
  assert.equal(remotePreapprovals.get(secondCheckoutSameUid.preapprovalId!).payer_email, 'mensal@teste.com');
  console.log('  ✔ Cenário 10: Reutilização dos 3 dias grátis pelo mesmo Firebase UID bloqueada (trialEligible = false) e e-mail real preservado.');

  // Cenário 4: Cobrança recorrente após término do teste (Ciclo Pago Ativo)
  const mpAnnualObj = remotePreapprovals.get(checkoutAnnual.preapprovalId!);
  mpAnnualObj.status = 'authorized';
  const pastCreatedDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const nextAnnualDate = new Date(Date.now() + 357 * 24 * 60 * 60 * 1000).toISOString();
  mpAnnualObj.date_created = pastCreatedDate;
  mpAnnualObj.next_payment_date = nextAnnualDate;
  mpAnnualObj.summarized = {
    charged_quantity: 1,
    charged_amount: 199.9,
    last_charged_date: new Date().toISOString(),
    semaphore: 'green',
  };

  const verifyAnnualPaid = await simService.verifyAndSyncUserSubscription({
    authenticatedUid: uidAnnual,
    requestedPreapprovalId: checkoutAnnual.preapprovalId!,
  });
  assert.equal(verifyAnnualPaid.success, true);
  assert.equal(verifyAnnualPaid.subscription?.statusState, 'ACTIVE');
  assert.equal(verifyAnnualPaid.subscription?.billingSubStatus, 'PAID_ACTIVE');
  console.log('  ✔ Cenário 4: Ciclo pago recorrente ativo após término dos 3 dias de teste (PAID_ACTIVE).');

  // Cenário 6: Cancelamento em ciclo pago mantém acesso até currentPeriodEnd
  const cancelPaidCycle = await simService.cancelSubscription({
    uid: uidAnnual,
    actor: 'anual@teste.com',
  });
  assert.equal(cancelPaidCycle.success, true);
  assert.deepEqual(cancelPaidCycle.payloadSentToMp, { status: 'cancelled' });
  assert.equal(cancelPaidCycle.subscription?.remoteMpStatus, 'canceled');
  assert.equal(cancelPaidCycle.subscription?.statusState, 'ACTIVE');
  assert.equal(cancelPaidCycle.subscription?.billingSubStatus, 'CANCELED_ACTIVE_UNTIL_END');
  console.log('  ✔ Cenário 6: Cancelamento em ciclo pago manteve acesso PRO até currentPeriodEnd.');

  // Cenário 7: Recusa de pagamento / suspensão bloqueia acesso PRO imediatamente
  mpAnnualObj.status = 'paused';
  mpAnnualObj.summarized.semaphore = 'red';
  // Limpa flag de cancelAtPeriodEnd para testar transição direta para PAST_DUE
  const annualRecBeforePause = await simService.getUserSubscriptionRecord(uidAnnual);
  annualRecBeforePause.cancelAtPeriodEnd = false;
  annualRecBeforePause.remoteMpStatus = 'paused';
  await simService.saveUserSubscriptionRecord(annualRecBeforePause);

  const verifyPastDue = await simService.verifyAndSyncUserSubscription({
    authenticatedUid: uidAnnual,
    requestedPreapprovalId: checkoutAnnual.preapprovalId!,
  });
  assert.equal(verifyPastDue.subscription?.statusState, 'PAST_DUE');
  assert.equal(verifyPastDue.subscription?.billingSubStatus, 'PAYMENT_REJECTED');
  assert.equal(getProPlanEntitlement(uidAnnual).active, false);
  console.log('  ✔ Cenário 7: Recusa de cobrança atualizou estado para PAST_DUE e bloqueou motor PRO.');

  // Cenário 8: Idempotência e validação HMAC-SHA256 de Webhooks duplicados
  const webhookSecret = 'mp_webhook_secret_test_key';
  const dataId = checkoutAnnual.preapprovalId!;
  const requestId = `req_idemp_${Date.now()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
  const xSignature = `ts=${ts},v1=${v1}`;

  const sigCheck = simService.verifyWebhookSignature({
    xSignature,
    xRequestId: requestId,
    dataId,
    secret: webhookSecret,
  });
  assert.equal(sigCheck.valid, true);

  const whFirst = await simService.processWebhookNotification({
    webhookId: `wh_${requestId}`,
    type: 'subscription_preapproval',
    action: 'updated',
    dataId,
    enforceSignature: false,
  });
  assert.equal(whFirst.processed, true);
  assert.equal(whFirst.duplicateIgnored, false);

  const whDuplicate = await simService.processWebhookNotification({
    webhookId: `wh_${requestId}`,
    type: 'subscription_preapproval',
    action: 'updated',
    dataId,
    enforceSignature: false,
  });
  assert.equal(whDuplicate.processed, false);
  assert.equal(whDuplicate.duplicateIgnored, true);
  console.log('  ✔ Cenário 8: Assinatura HMAC-SHA256 validada e webhook duplicado tratado de forma idempotente.');

  // Cenário 9: Validador estrito de free_trial e next_payment_date
  const validTrialCheck = simService.verifySevenDayFreeTrialFromMpResponse(
    remotePreapprovals.get(checkoutMonthly.preapprovalId!),
    Date.parse(remotePreapprovals.get(checkoutMonthly.preapprovalId!).date_created)
  );
  assert.equal(validTrialCheck.valid, true);
  console.log('  ✔ Cenário 9: Validação autoritativa de backend para acesso PRO e datas do Mercado Pago.');

  // Cenário 11: Alteração administrativa de preço gera nova versão sem alterar assinaturas vigentes
  const previousSubPrice = (await simService.getUserSubscriptionRecord(uidAnnual)).contractedAmount;
  const updatedConfig = await simService.updateCommercialPlansAdmin({
    monthlyPrice: 34.9,
    annualPrice: 219.9,
    trialOfferEnabled: true,
    adminEmail: 'gustakkg15@gmail.com',
  });
  assert.equal(updatedConfig.monthlyPrice, 34.9);
  assert.equal(updatedConfig.annualPrice, 219.9);
  const subAfterPriceChange = await simService.getUserSubscriptionRecord(uidAnnual);
  assert.equal(subAfterPriceChange.contractedAmount, previousSubPrice);

  // Restaura os preços oficiais aprovados (R$ 29,90 e R$ 199,90) e o estado Fail-Closed PENDING_CREDENTIALS
  await simService.updateCommercialPlansAdmin({
    monthlyPrice: 29.9,
    annualPrice: 199.9,
    trialOfferEnabled: true,
    adminEmail: 'gustakkg15@gmail.com',
  });
  await saveCommercialSubscriptionConfig({
    mpHomologationStatus: 'PENDING_CREDENTIALS',
    priceVersion: 'v1.0.0',
  });
  const restoredPlans = await simService.getOfficialPlans();
  assert.equal(restoredPlans.monthly.price, 29.9);
  assert.equal(restoredPlans.annual.price, 199.9);
  console.log(
    '  ✔ Cenário 11: Alteração administrativa de preços versionada sem afetar ciclos vigentes (restaurado para R$ 29,90 e R$ 199,90).'
  );

  console.log('\n================================================================================');
  console.log('TODOS OS TESTES AUTOMATIZADOS FORAM CONCLUÍDOS COM 100% DE SUCESSO!');
  console.log('================================================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('FALHA NOS TESTES AUTOMATIZADOS:', err);
  process.exit(1);
});
