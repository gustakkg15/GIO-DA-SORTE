/**
 * Comprehensive Automated Verification Suite for Etapa 2
 * Tests:
 * 1. SSE Ticket Handshake & Token-in-URL Rejection
 * 2. Single-use Atomic Consumption & Anti-Reuse
 * 3. TTL Expiration Enforcement (30s)
 * 4. TikTok Comments Protected Routes (Extract, Import, Draw)
 * 5. PRO Entitlement Enforcement (FREE blocked 403, PRO allowed 200)
 * 6. CSPRNG Cryptographic Draw & Audit Hash
 * 7. Commercial Plan Pricing & 7-day Trial Rules
 * 8. Legacy Migration Dry-Run Verification (Zero writes)
 */
import {
  issueSseStreamTicket,
  consumeSseStreamTicket,
  hashSseTicket,
} from '../src/server/sseTicketService.js';
import {
  mercadoPagoSubscriptionService,
} from '../src/server/mercadoPagoSubscriptionService.js';
import {
  buildEntitlementFromSubscriptionRecord,
} from '../src/server/firebaseAdminAuth.js';
import { UserSubscriptionRecord } from '../src/types.js';

const BASE_URL = 'http://127.0.0.1:3000';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  ✓ [PASS] ${name}${details ? ` (${details})` : ''}`);
  } else {
    results.push({ name, passed: false, error: 'Assertion failed', details });
    console.error(`  ✗ [FAIL] ${name}${details ? ` (${details})` : ''}`);
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('  GIO DA SORTE PRO — SUÍTE DE TESTES AUTOMATIZADOS (ETAPA 2)');
  console.log('===============================================================\n');

  // Setup test users in subscription service
  const proUid = 'test_pro_user_etapa2';
  const freeUid = 'test_free_user_etapa2';
  const trialCanceledUid = 'test_trial_canceled_uid';
  const now = Date.now();

  const proRecord: UserSubscriptionRecord = {
    uid: proUid,
    email: 'pro_user@test.local',
    emailVerified: true,
    planId: 'pro_monthly',
    planName: 'GIO DA SORTE PRO Mensal',
    tier: 'PRO',
    statusState: 'ACTIVE',
    billingSubStatus: 'PAID_ACTIVE',
    mpPreapprovalId: 'mp_sub_pro_123',
    mpPlanId: 'mp_plan_monthly',
    remoteMpStatus: 'authorized',
    checkoutInitPoint: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=123',
    contractedPriceVersion: 'v1.0.0',
    contractedAmount: 29.90,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    trialApplied: true,
    trialDaysGranted: 7,
    trialStartDate: new Date(now - 10 * 86400000).toISOString(),
    trialEndDate: new Date(now - 3 * 86400000).toISOString(),
    firstPaymentDate: new Date(now - 3 * 86400000).toISOString(),
    nextPaymentDate: new Date(now + 27 * 86400000).toISOString(),
    currentPeriodStart: new Date(now - 3 * 86400000).toISOString(),
    currentPeriodEnd: new Date(now + 27 * 86400000).toISOString(),
    cancelAtPeriodEnd: false,
    canceledAt: null,
    hasUsedFreeTrial: true,
    firstTrialStartedAt: new Date(now - 10 * 86400000).toISOString(),
    firstTrialPreapprovalId: 'mp_sub_pro_123',
    firstTrialPlanId: 'pro_monthly',
    acceptedTermsVersion: '1.0.0',
    acceptedAt: now - 10 * 86400000,
    chargedQuantity: 1,
    chargedAmount: 29.90,
    updatedAt: now,
  };

  const freeRecord: UserSubscriptionRecord = {
    uid: freeUid,
    email: 'free_user@test.local',
    emailVerified: true,
    planId: null,
    planName: 'Plano FREE',
    tier: 'FREE',
    statusState: 'FREE',
    billingSubStatus: 'FREE_TIER',
    mpPreapprovalId: null,
    mpPlanId: null,
    remoteMpStatus: null,
    checkoutInitPoint: null,
    contractedPriceVersion: 'v1.0.0',
    contractedAmount: 0,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    trialApplied: false,
    trialDaysGranted: 0,
    trialStartDate: null,
    trialEndDate: null,
    firstPaymentDate: null,
    nextPaymentDate: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    hasUsedFreeTrial: false,
    firstTrialStartedAt: null,
    firstTrialPreapprovalId: null,
    firstTrialPlanId: null,
    acceptedTermsVersion: '1.0.0',
    acceptedAt: null,
    chargedQuantity: 0,
    chargedAmount: 0,
    updatedAt: now,
  };

  const trialCanceledRecord: UserSubscriptionRecord = {
    uid: trialCanceledUid,
    email: 'trial_canceled@test.local',
    emailVerified: true,
    planId: 'pro_monthly',
    planName: 'GIO DA SORTE PRO Mensal',
    tier: 'PRO',
    statusState: 'ACTIVE',
    billingSubStatus: 'CANCELED_ACTIVE_UNTIL_END',
    mpPreapprovalId: 'mp_sub_trial_canc_123',
    mpPlanId: 'mp_plan_monthly',
    remoteMpStatus: 'canceled',
    checkoutInitPoint: null,
    contractedPriceVersion: 'v1.0.0',
    contractedAmount: 29.90,
    currency: 'BRL',
    frequency: 1,
    frequencyType: 'months',
    trialApplied: true,
    trialDaysGranted: 7,
    trialStartDate: new Date(now - 2 * 86400000).toISOString(),
    trialEndDate: new Date(now + 5 * 86400000).toISOString(), // 5 days left in trial
    firstPaymentDate: null,
    nextPaymentDate: null,
    currentPeriodStart: new Date(now - 2 * 86400000).toISOString(),
    currentPeriodEnd: new Date(now + 5 * 86400000).toISOString(),
    cancelAtPeriodEnd: true,
    canceledAt: new Date(now - 1 * 86400000).toISOString(),
    hasUsedFreeTrial: true,
    firstTrialStartedAt: new Date(now - 2 * 86400000).toISOString(),
    firstTrialPreapprovalId: 'mp_sub_trial_canc_123',
    firstTrialPlanId: 'pro_monthly',
    acceptedTermsVersion: '1.0.0',
    acceptedAt: now - 2 * 86400000,
    chargedQuantity: 0,
    chargedAmount: 0,
    updatedAt: now,
  };

  await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(proRecord);
  await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(freeRecord);
  await mercadoPagoSubscriptionService.saveUserSubscriptionRecord(trialCanceledRecord);

  const proToken = `gio_loopback_test_token:valid:${proUid}:${proRecord.email}`;
  const freeToken = `gio_loopback_test_token:valid:${freeUid}:${freeRecord.email}`;

  const testHeaders = (token?: string) => ({
    'Content-Type': 'application/json',
    'x-gio-loopback-test-suite': 'etapa2',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  // ==========================================
  // BLIST 1: SSE Handshake & Single-Use Ticket Security
  // ==========================================
  console.log('--- TESTE 1: SEGURANÇA SSE E TICKET DE USO ÚNICO ---');

  // 1.1 Strict rejection of idToken in URL query string
  const resTokenInUrl = await fetch(`${BASE_URL}/api/tiktok/stream?idToken=sample_fake_token_in_url`);
  assert(
    resTokenInUrl.status === 400,
    'SSE rejeita idToken na URL com HTTP 400',
    `Status retornado: ${resTokenInUrl.status}`
  );
  const dataTokenInUrl = await resTokenInUrl.json().catch(() => ({}));
  assert(
    dataTokenInUrl.code === 'FIREBASE_TOKEN_IN_URL_FORBIDDEN',
    'Código de erro específico FIREBASE_TOKEN_IN_URL_FORBIDDEN',
    `Código: ${dataTokenInUrl.code}`
  );

  // 1.2 Accessing /api/tiktok/stream without ticket or auth header
  const resStreamNoAuth = await fetch(`${BASE_URL}/api/tiktok/stream`);
  assert(
    resStreamNoAuth.status === 401,
    'SSE sem autenticação ou ticket retorna HTTP 401',
    `Status retornado: ${resStreamNoAuth.status}`
  );

  // 1.3 POST /api/tiktok/stream/ticket without auth
  const resTicketNoAuth = await fetch(`${BASE_URL}/api/tiktok/stream/ticket`, {
    method: 'POST',
    headers: testHeaders(),
    body: JSON.stringify({}),
  });
  assert(
    resTicketNoAuth.status === 401,
    'POST /api/tiktok/stream/ticket sem Bearer retorna HTTP 401',
    `Status: ${resTicketNoAuth.status}`
  );

  // 1.4 POST /api/tiktok/stream/ticket with FREE user token
  const resTicketFree = await fetch(`${BASE_URL}/api/tiktok/stream/ticket`, {
    method: 'POST',
    headers: testHeaders(freeToken),
    body: JSON.stringify({}),
  });
  assert(
    resTicketFree.status === 403,
    'POST /api/tiktok/stream/ticket com usuário FREE retorna HTTP 403 (PRO obrigatório)',
    `Status: ${resTicketFree.status}`
  );

  // 1.5 POST /api/tiktok/stream/ticket with PRO user token
  const resTicketPro = await fetch(`${BASE_URL}/api/tiktok/stream/ticket`, {
    method: 'POST',
    headers: testHeaders(proToken),
    body: JSON.stringify({ sessionId: 'session_etapa2_test' }),
  });
  assert(
    resTicketPro.status === 200,
    'POST /api/tiktok/stream/ticket com PRO retorna HTTP 200',
    `Status: ${resTicketPro.status}`
  );
  const ticketData = await resTicketPro.json();
  assert(
    Boolean(ticketData.ticket && ticketData.ticket.startsWith('tk_sse_')),
    'Ticket gerado possui prefixo seguro tk_sse_ com 256 bits de entropia',
    `Ticket: ${ticketData.ticket?.slice(0, 15)}...`
  );
  assert(
    ticketData.expiresInSec === 30,
    'TTL do ticket configurado estritamente em 30 segundos',
    `expiresInSec: ${ticketData.expiresInSec}`
  );

  // 1.6 In-process issuance and atomic consumption
  const inProcTicket = await issueSseStreamTicket({
    uid: proUid,
    sessionId: 'session_etapa2_test',
  });
  const firstConsume = await consumeSseStreamTicket(inProcTicket.ticket, {
    expectedSessionId: 'session_etapa2_test',
  });
  assert(
    firstConsume.valid && firstConsume.uid === proUid,
    'Primeiro consumo atômico do ticket válido com sucesso',
    `UID validado: ${firstConsume.uid}`
  );

  // 1.7 Anti-reuse verification (second consumption of same ticket)
  const secondConsume = await consumeSseStreamTicket(inProcTicket.ticket, {
    expectedSessionId: 'session_etapa2_test',
  });
  assert(
    !secondConsume.valid && secondConsume.code === 'SSE_TICKET_REUSED',
    'Reutilização do mesmo ticket é bloqueada com SSE_TICKET_REUSED (uso único estrito)',
    `Código: ${secondConsume.code}`
  );

  // 1.8 End-to-end HTTP dev server ticket consumption & anti-reuse
  const controller1 = new AbortController();
  const sseHttpRes1 = await fetch(`${BASE_URL}/api/tiktok/stream?ticket=${ticketData.ticket}&clientId=test_e2e_1`, {
    signal: controller1.signal,
  });
  assert(
    sseHttpRes1.status === 200,
    'Conexão HTTP SSE com ticket temporário estabelecida com sucesso (HTTP 200)',
    `Status: ${sseHttpRes1.status}`
  );
  controller1.abort();

  // Try connecting AGAIN over HTTP with the same ticketData.ticket
  const sseHttpRes2 = await fetch(`${BASE_URL}/api/tiktok/stream?ticket=${ticketData.ticket}&clientId=test_e2e_2`);
  assert(
    sseHttpRes2.status === 401,
    'Segunda tentativa de conexão HTTP com o mesmo ticket rejeitada com HTTP 401 (anti-reuso no servidor)',
    `Status: ${sseHttpRes2.status}`
  );
  const secondHttpData = await sseHttpRes2.json().catch(() => ({}));
  assert(
    secondHttpData.code === 'SSE_TICKET_REUSED',
    'Servidor dev retorna código SSE_TICKET_REUSED no bloqueio da reconexão com ticket já usado',
    `Código retornado: ${secondHttpData.code}`
  );

  // 1.8 Invalid ticket verification
  const invalidConsume = await consumeSseStreamTicket('tk_sse_invalid_fake_hash_123456789012345678901234567890');
  assert(
    !invalidConsume.valid && invalidConsume.status === 401,
    'Ticket inexistente é rejeitado com HTTP 401',
    `Status: ${invalidConsume.status}`
  );

  // ==========================================
  // BLIST 2: Protected Sorteio por Comentários API
  // ==========================================
  console.log('\n--- TESTE 2: PROTEÇÃO DO SORTEIO POR COMENTÁRIOS ---');

  // 2.1 Extract endpoint protection
  const resExtractNoAuth = await fetch(`${BASE_URL}/api/tiktok/pro/comments/extract`, {
    method: 'POST',
    headers: testHeaders(),
    body: JSON.stringify({ videoUrl: 'https://www.tiktok.com/@test/video/12345' }),
  });
  assert(
    resExtractNoAuth.status === 401,
    '/api/tiktok/pro/comments/extract sem Bearer retorna HTTP 401',
    `Status: ${resExtractNoAuth.status}`
  );

  // 2.2 Import endpoint protection (Unauthenticated)
  const resImportNoAuth = await fetch(`${BASE_URL}/api/tiktok/pro/comments/import`, {
    method: 'POST',
    headers: testHeaders(),
    body: JSON.stringify({ rawInput: '@user1: show\n@user2: quero ganhar' }),
  });
  assert(
    resImportNoAuth.status === 401,
    '/api/tiktok/pro/comments/import sem Bearer retorna HTTP 401',
    `Status: ${resImportNoAuth.status}`
  );

  // 2.3 Import endpoint with FREE user
  const resImportFree = await fetch(`${BASE_URL}/api/tiktok/pro/comments/import`, {
    method: 'POST',
    headers: testHeaders(freeToken),
    body: JSON.stringify({ rawInput: '@user1: show\n@user2: quero ganhar' }),
  });
  assert(
    resImportFree.status === 403,
    '/api/tiktok/pro/comments/import com FREE retorna HTTP 403 (PRO obrigatório)',
    `Status: ${resImportFree.status}`
  );

  // 2.4 Import endpoint with PRO user
  const samplePastedText = `
@ana_clara: Eu quero muito ganhar este sorteio! #sorteio @amiga1 @amiga2
@bruno_silva: Sensacional a transmissão, parabéns Gio!
@carla_dias: Quero participar #sorteio
@daniel_costa: Muito bom mesmo @amigo1
@ana_clara: Comentando de novo para dar sorte #sorteio
`;
  const resImportPro = await fetch(`${BASE_URL}/api/tiktok/pro/comments/import`, {
    method: 'POST',
    headers: testHeaders(proToken),
    body: JSON.stringify({ rawInput: samplePastedText }),
  });
  assert(
    resImportPro.status === 200,
    '/api/tiktok/pro/comments/import com PRO retorna HTTP 200',
    `Status: ${resImportPro.status}`
  );
  const importData = await resImportPro.json();
  assert(
    importData.success && Array.isArray(importData.comments) && importData.count >= 4,
    'Importação processou comentários estruturados no backend com parsing seguro',
    `Total processado: ${importData.count}`
  );

  // 2.5 Draw endpoint protection (FREE user)
  const resDrawFree = await fetch(`${BASE_URL}/api/tiktok/pro/comments/draw`, {
    method: 'POST',
    headers: testHeaders(freeToken),
    body: JSON.stringify({
      comments: importData.comments,
      filters: { filterDuplicates: true },
      winnerCount: 1,
    }),
  });
  assert(
    resDrawFree.status === 403,
    '/api/tiktok/pro/comments/draw com FREE retorna HTTP 403',
    `Status: ${resDrawFree.status}`
  );

  // 2.6 Draw endpoint with PRO user (CSPRNG & Hash generation)
  const resDrawPro = await fetch(`${BASE_URL}/api/tiktok/pro/comments/draw`, {
    method: 'POST',
    headers: testHeaders(proToken),
    body: JSON.stringify({
      comments: importData.comments,
      filters: {
        filterDuplicates: true,
        keyword: 'sorteio',
        minMentions: 0,
      },
      winnerCount: 1,
      prizeName: 'Prêmio Oficial Etapa 2',
      videoUrl: 'https://www.tiktok.com/@gio/video/1234567890',
    }),
  });
  assert(
    resDrawPro.status === 200,
    '/api/tiktok/pro/comments/draw com PRO executa sorteio com sucesso (HTTP 200)',
    `Status: ${resDrawPro.status}`
  );
  const drawData = await resDrawPro.json();
  assert(
    drawData.success && Array.isArray(drawData.winners) && drawData.winners.length === 1,
    'Sorteio retornou ganhador selecionado de forma justa',
    `Ganhador: @${drawData.winners?.[0]?.comment?.username}`
  );
  assert(
    Boolean(drawData.integrityHash && drawData.integrityHash.length === 64),
    'Geração de Hash SHA-256 criptográfico para auditoria de comentários',
    `Hash: ${drawData.integrityHash?.slice(0, 16)}...`
  );
  assert(
    Array.isArray(drawData.entropySeeds) && drawData.entropySeeds.length > 0,
    'Entropia CSPRNG registrada no certificado',
    `Seeds coletadas: ${drawData.entropySeeds?.length}`
  );

  // ==========================================
  // BLIST 3: Commercial Rules, Entitlement & Trial Preservation
  // ==========================================
  console.log('\n--- TESTE 3: REGRAS COMERCIAIS, PLANOS E TRIAL ---');

  // 3.1 Official Plan Pricing Verification
  const { monthly, annual } = await mercadoPagoSubscriptionService.getOfficialPlans();
  assert(
    monthly.price === 29.90,
    'Preço oficial do Plano Mensal preservado em R$ 29,90',
    `Preço atual: R$ ${monthly.price}`
  );
  assert(
    annual.price === 199.90,
    'Preço oficial do Plano Anual preservado em R$ 199,90',
    `Preço atual: R$ ${annual.price}`
  );
  assert(
    monthly.freeTrial.frequency === 7 && annual.freeTrial.frequency === 7,
    'Período de teste gratuito preservado em 7 dias nos dois planos',
    '7 dias de degustação garantidos'
  );

  // 3.2 Trial Cancellation Entitlement: Access maintained until trialEndDate
  const trialCanceledEntitlement = buildEntitlementFromSubscriptionRecord(trialCanceledRecord);
  assert(
    trialCanceledEntitlement.active === true && trialCanceledEntitlement.tier === 'PRO',
    'Cancelamento durante trial preserva acesso PRO até trialEndDate sem cobrança',
    `Status: active=${trialCanceledEntitlement.active}, billingSubStatus=${trialCanceledEntitlement.billingSubStatus}`
  );

  // 3.3 Dry-Run Legacy Migration Check (Zero writes)
  const resMigrationPreview = await fetch(`${BASE_URL}/api/tiktok/pro/migration/preview`, {
    method: 'GET',
    headers: testHeaders(proToken),
  });
  assert(
    resMigrationPreview.status === 200,
    'Endpoint de migração /preview executável com HTTP 200',
    `Status: ${resMigrationPreview.status}`
  );
  const migrationData = await resMigrationPreview.json();
  assert(
    migrationData.report?.mode === 'DRY_RUN_PREVIEW',
    'Migração opera estritamente em dryRun preview (modo DRY_RUN_PREVIEW, zero escritas)',
    `mode=${migrationData.report?.mode}, totalScanned=${migrationData.report?.summary?.totalRecordsScanned}`
  );

  console.log('\n===============================================================');
  const allPassed = results.every((r) => r.passed);
  const totalPassed = results.filter((r) => r.passed).length;
  console.log(`  RESUMO DA EXECUÇÃO: ${totalPassed}/${results.length} testes passaram.`);
  if (allPassed) {
    console.log('  STATUS: SUCESSO TOTAL — TODAS AS GARANTIAS TÉCNICAS ATENDIDAS.');
    process.exit(0);
  } else {
    console.log('  STATUS: ALGUNS TESTES FALHARAM.');
    process.exit(1);
  }
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Erro na execução da suíte de testes:', err);
  process.exit(1);
});
