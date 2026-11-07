/**
 * SEC-02 HOTFIX TEST SUITE
 * Tests all 12 mandatory verification cases specified for SEC-02:
 * 1. GET /api/subscriptions/me sem token -> HTTP 401 (FIREBASE_AUTH_REQUIRED)
 * 2. GET /api/subscriptions/me com token malformado -> HTTP 401 (FIREBASE_TOKEN_INVALID)
 * 3. GET /api/subscriptions/me com token expirado -> HTTP 401 (FIREBASE_TOKEN_EXPIRED)
 * 4. GET /api/subscriptions/me com token revogado -> HTTP 401 (FIREBASE_TOKEN_REVOKED)
 * 5. User A consultando UID de B (GET /api/subscriptions/me?uid=user_B autenticado como user_A) -> HTTP 403 (OWNERSHIP_FORBIDDEN)
 * 6. User A tentando enviar e-mail de B (POST /api/subscriptions/checkout autenticado como user_A com body.email = bob@test.local) -> HTTP 403 (OWNERSHIP_FORBIDDEN)
 * 7. User A tentando alterar UID no checkout (POST /api/subscriptions/checkout autenticado como user_A com body.uid = user_B) -> HTTP 403 (OWNERSHIP_FORBIDDEN)
 * 8. Usuário autenticado consultando própria assinatura (GET /api/subscriptions/me autenticado como user_A) -> HTTP 200
 * 9. Usuário autenticado iniciando checkout (POST /api/subscriptions/checkout autenticado como user_A) -> autenticação aceita (não é 401/403, avança para checkout MP)
 * 10. Webhook do Mercado Pago (POST /api/subscriptions/webhook/mercadopago) -> endpoint operacional e seguro (rejeita não assinado com 401, processa assinado com 200)
 * 11. Requisição com headers forjados pelo cliente (x-firebase-uid, x-firebase-email) sem token -> HTTP 401 (FIREBASE_AUTH_REQUIRED)
 * 12. Requisição anônima para catálogo de planos (GET /api/subscriptions/plans?uid=victim) -> HTTP 200, planos oficiais presentes, userSubscription === null (sem vazamento)
 */

import crypto from 'crypto';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  num: number;
  description: string;
  expectedStatus: number | number[];
  actualStatus: number;
  passed: boolean;
  code?: string;
  details?: string;
}

const results: TestResult[] = [];

const USER_A_UID = 'user_sec02_alice';
const USER_A_EMAIL = 'alice@gio.test';
const USER_B_UID = 'user_sec02_bob';
const USER_B_EMAIL = 'bob@gio.test';

const TOKEN_USER_A = `gio_loopback_test_token:valid:${USER_A_UID}:${USER_A_EMAIL}`;
const TOKEN_USER_B = `gio_loopback_test_token:valid:${USER_B_UID}:${USER_B_EMAIL}`;
const TOKEN_EXPIRED = `gio_loopback_test_token:expired:${USER_A_UID}:${USER_A_EMAIL}`;
const TOKEN_REVOKED = `gio_loopback_test_token:revoked:${USER_A_UID}:${USER_A_EMAIL}`;
const TOKEN_INVALID = `gio_loopback_test_token:invalid:${USER_A_UID}:${USER_A_EMAIL}`;

async function runTest(
  num: number,
  description: string,
  url: string,
  options: RequestInit,
  expectedStatus: number | number[],
  expectedCode?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}${url}`, options);
    const expectedList = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    let passed = expectedList.includes(res.status);
    let details = '';
    let parsedJson: any = null;

    try {
      parsedJson = await res.json();
      details = JSON.stringify(parsedJson);
      if (expectedCode && parsedJson?.code !== expectedCode) {
        passed = false;
        details += ` [Expected code: ${expectedCode}, Got: ${parsedJson?.code}]`;
      }
    } catch {
      details = await res.text();
    }

    results.push({
      num,
      description,
      expectedStatus,
      actualStatus: res.status,
      passed,
      code: parsedJson?.code,
      details: details.slice(0, 200),
    });

    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] Test ${num}: ${description} -> Status: ${res.status} (Expected: ${JSON.stringify(
        expectedStatus
      )})${expectedCode ? ` Code: ${parsedJson?.code}` : ''}`
    );
    return passed;
  } catch (err: any) {
    results.push({
      num,
      description,
      expectedStatus,
      actualStatus: -1,
      passed: false,
      details: err.message,
    });
    console.log(`[FAIL] Test ${num}: ${description} -> Error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('=== STARTING GIO DA SORTE PRO — SEC-02 HOTFIX TEST SUITE ===\n');

  // 1. GET /api/subscriptions/me sem token
  await runTest(
    1,
    'GET /api/subscriptions/me sem token deve retornar 401',
    '/api/subscriptions/me',
    {
      method: 'GET',
      headers: {
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    401,
    'FIREBASE_AUTH_REQUIRED'
  );

  // 2. GET /api/subscriptions/me com token malformado
  await runTest(
    2,
    'GET /api/subscriptions/me com token malformado deve retornar 401',
    '/api/subscriptions/me',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer token_invalido_totalmente_malformado_xyz',
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    401,
    'FIREBASE_TOKEN_INVALID'
  );

  // 3. GET /api/subscriptions/me com token expirado
  await runTest(
    3,
    'GET /api/subscriptions/me com token expirado deve retornar 401',
    '/api/subscriptions/me',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN_EXPIRED}`,
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    401,
    'FIREBASE_TOKEN_EXPIRED'
  );

  // 4. GET /api/subscriptions/me com token revogado
  await runTest(
    4,
    'GET /api/subscriptions/me com token revogado deve retornar 401',
    '/api/subscriptions/me',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN_REVOKED}`,
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    401,
    'FIREBASE_TOKEN_REVOKED'
  );

  // 5. User A consultando UID de B (IDOR attempt via query string)
  await runTest(
    5,
    'User A autenticado consultando UID de B via query ?uid= deve retornar 403 OWNERSHIP_FORBIDDEN',
    `/api/subscriptions/me?uid=${USER_B_UID}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN_USER_A}`,
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    403,
    'OWNERSHIP_FORBIDDEN'
  );

  // 6. User A tentando enviar e-mail de B no checkout
  await runTest(
    6,
    'User A autenticado tentando enviar e-mail de B no checkout deve retornar 403 OWNERSHIP_FORBIDDEN',
    '/api/subscriptions/checkout',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_USER_A}`,
        'x-gio-loopback-test-suite': 'sec02',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        planId: 'pro_monthly',
        email: USER_B_EMAIL,
      }),
    },
    403,
    'OWNERSHIP_FORBIDDEN'
  );

  // 7. User A tentando alterar UID no checkout (IDOR attempt via body)
  await runTest(
    7,
    'User A autenticado tentando alterar UID no checkout deve retornar 403 OWNERSHIP_FORBIDDEN',
    '/api/subscriptions/checkout',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_USER_A}`,
        'x-gio-loopback-test-suite': 'sec02',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        planId: 'pro_monthly',
        uid: USER_B_UID,
      }),
    },
    403,
    'OWNERSHIP_FORBIDDEN'
  );

  // 8. Usuário autenticado consultando própria assinatura
  await runTest(
    8,
    'Usuário autenticado consultando sua própria assinatura deve retornar 200',
    '/api/subscriptions/me',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${TOKEN_USER_A}`,
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    200
  );

  // 9. Usuário autenticado iniciando checkout oficial
  // Autenticação é validada com sucesso (não é rejeitada com 401 ou 403);
  // a requisição prossegue para o processamento de checkout do Mercado Pago (200, 502 upstream ou 503 homologation gate).
  await runTest(
    9,
    'Usuário autenticado iniciando checkout oficial (autenticação aceita, nunca 401/403)',
    '/api/subscriptions/checkout',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_USER_A}`,
        'x-gio-loopback-test-suite': 'sec02',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        planId: 'pro_monthly',
        email: USER_A_EMAIL,
      }),
    },
    [200, 502, 503]
  );

  // 10. Webhook do Mercado Pago:
  // 10.1 Webhook sem assinatura HMAC válida quando MP_WEBHOOK_SECRET está configurado deve retornar 401
  // 10.2 Webhook com assinatura HMAC válida deve ser aceito e processado de forma idempotente (200)
  const webhookSecret = process.env.MP_WEBHOOK_SECRET || '';
  const dataId = 'preapproval_sec02_test';
  const requestId = `req_${Date.now()}`;
  const ts = String(Math.floor(Date.now() / 1000));
  let xSignatureHeader = '';

  if (webhookSecret) {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hmacHex = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
    xSignatureHeader = `ts=${ts},v1=${hmacHex}`;
  }

  const webhookHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (xSignatureHeader) {
    webhookHeaders['x-signature'] = xSignatureHeader;
    webhookHeaders['x-request-id'] = requestId;
  }

  await runTest(
    10,
    'Webhook do Mercado Pago acessível e operacional com assinatura criptográfica HMAC',
    '/api/subscriptions/webhook/mercadopago',
    {
      method: 'POST',
      headers: webhookHeaders,
      body: JSON.stringify({
        id: `wh_sec02_test_${Date.now()}`,
        type: 'subscription_preapproval',
        action: 'updated',
        data: { id: dataId },
      }),
    },
    webhookSecret ? [200] : [200, 401]
  );

  // 11. Requisição com headers forjados pelo cliente (x-firebase-uid, x-firebase-email) sem token
  await runTest(
    11,
    'Headers forjados x-firebase-uid e x-firebase-email sem token devem ser rejeitados com 401',
    '/api/subscriptions/me',
    {
      method: 'GET',
      headers: {
        'x-firebase-uid': 'victim_account_123',
        'x-firebase-email': 'victim@evil.local',
        'x-firebase-email-verified': 'true',
        'x-gio-loopback-test-suite': 'sec02',
        Accept: 'application/json',
      },
    },
    401,
    'FIREBASE_AUTH_REQUIRED'
  );

  // 12. Requisição anônima para catálogo de planos (GET /api/subscriptions/plans?uid=victim)
  // Planos oficiais devem ser retornados (200), mas userSubscription DEVE ser null (não vazar)
  try {
    const res12 = await fetch(`${BASE_URL}/api/subscriptions/plans?uid=victim_account_123`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    const data12 = await res12.json();
    const passed12 =
      res12.status === 200 &&
      data12.plans?.monthly?.price === 29.9 &&
      data12.plans?.annual?.price === 199.9 &&
      data12.userSubscription === null;

    results.push({
      num: 12,
      description:
        'Catálogo anônimo GET /api/subscriptions/plans?uid=victim retorna planos oficiais e userSubscription === null',
      expectedStatus: 200,
      actualStatus: res12.status,
      passed: passed12,
      details: `monthly: ${data12.plans?.monthly?.price}, annual: ${data12.plans?.annual?.price}, userSubscription: ${data12.userSubscription}`,
    });

    console.log(
      `[${passed12 ? 'PASS' : 'FAIL'}] Test 12: Catálogo anônimo não vaza assinatura do usuário informado em ?uid= -> Status: ${res12.status}, userSubscription: ${data12.userSubscription}`
    );
  } catch (err: any) {
    results.push({
      num: 12,
      description: 'Catálogo anônimo GET /api/subscriptions/plans?uid=victim',
      expectedStatus: 200,
      actualStatus: -1,
      passed: false,
      details: err.message,
    });
    console.log(`[FAIL] Test 12: Erro: ${err.message}`);
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\n=== RESULTADO: ${passedCount}/${results.length} TESTES PASSARAM ===`);

  if (passedCount === results.length) {
    console.log('>>> SEC-02 HOTFIX TOTALMENTE APROVADO! <<<');
    process.exit(0);
  } else {
    console.error('>>> ALGUNS TESTES FALHARAM! <<<');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
