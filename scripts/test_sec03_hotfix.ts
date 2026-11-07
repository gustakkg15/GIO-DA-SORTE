/**
 * SEC-03 HOTFIX TEST SUITE
 * Tests all 10 mandatory verification items specified by the user:
 * 1. Anonymous request with Accept: application/json -> 401.
 * 2. Request with external Referer and no token -> 401.
 * 3. Request with ?admin=1 -> 401.
 * 4. Request with x-gio-admin-access: authorized -> 401.
 * 5. Request with forged x-gio-admin-uid -> 401.
 * 6. Authenticated user without administrative privileges -> 403.
 * 7. Invalid or expired token -> 401.
 * 8. Legitimate administrator with verified claim -> 200 (Authorized).
 * 9. Protection across all administrative routes.
 * 10. Alternative bypass attempts blocked.
 */

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  num: number;
  description: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

async function runTest(
  num: number,
  description: string,
  url: string,
  options: RequestInit,
  expectedStatus: number
) {
  try {
    const res = await fetch(`${BASE_URL}${url}`, options);
    const passed = res.status === expectedStatus;
    let details = '';
    try {
      const data = await res.json();
      details = JSON.stringify(data);
    } catch {
      details = await res.text();
    }

    results.push({
      num,
      description,
      expectedStatus,
      actualStatus: res.status,
      passed,
      details: details.slice(0, 150),
    });

    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] Test ${num}: ${description} -> Status: ${res.status} (Expected: ${expectedStatus})`
    );
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
  }
}

async function main() {
  console.log('=== STARTING GIO DA SORTE PRO — SEC-03 HOTFIX TEST SUITE ===\n');

  // 1. Anonymous request with Accept: application/json
  await runTest(
    1,
    'Anonymous request with Accept: application/json',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
    401
  );

  // 2. Request with external Referer and without token
  await runTest(
    2,
    'Request with external Referer and no token',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        Referer: 'https://evil-attacker.com/dashboard',
        Accept: 'application/json',
      },
    },
    401
  );

  // 3. Request with ?admin=1
  await runTest(
    3,
    'Request with ?admin=1 query parameter',
    '/api/subscriptions/admin/summary?admin=1',
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
    401
  );

  // 4. Request with x-gio-admin-access: authorized
  await runTest(
    4,
    'Request with x-gio-admin-access: authorized header',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        'x-gio-admin-access': 'authorized',
        Accept: 'application/json',
      },
    },
    401
  );

  // 5. Request with forged x-gio-admin-uid
  await runTest(
    5,
    'Request with forged x-gio-admin-uid header',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        'x-gio-admin-uid': 'fake_admin_uid_777',
        Accept: 'application/json',
      },
    },
    401
  );

  // 6. Authenticated user without administrative privileges -> 403 Forbidden
  await runTest(
    6,
    'Authenticated user without admin privilege',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer gio_loopback_test_token:valid:user_regular_123:user@test.local',
        'x-gio-loopback-test-suite': 'sec03',
        Accept: 'application/json',
      },
    },
    403
  );

  // 7. Token expired or invalid -> 401 Unauthorized
  await runTest(
    7,
    'Token expired',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer gio_loopback_test_token:expired:user_123:user@test.local',
        'x-gio-loopback-test-suite': 'sec03',
        Accept: 'application/json',
      },
    },
    401
  );

  await runTest(
    7.1,
    'Token invalid signature / malformed',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer invalid.malformed.token',
        Accept: 'application/json',
      },
    },
    401
  );

  // 8. Legitimate administrator with verified custom claim -> 200 OK
  await runTest(
    8,
    'Legitimate administrator with verified admin claim',
    '/api/subscriptions/admin/summary',
    {
      method: 'GET',
      headers: {
        Authorization: 'Bearer gio_loopback_test_token:admin:admin_user_999:admin@test.local:admin',
        'x-gio-loopback-test-suite': 'sec03',
        Accept: 'application/json',
      },
    },
    200
  );

  // 9. All administrative routes protected against unauthenticated access (must return 401)
  console.log('\n--- Checking all administrative endpoints for 401 on unauthenticated access ---');
  const adminRoutes = [
    { method: 'POST', path: '/api/tiktok/plan/tier', body: { tier: 'PRO' } },
    { method: 'GET', path: '/api/tiktok/diagnostics' },
    { method: 'GET', path: '/api/tiktok/monitor/snapshot' },
    { method: 'POST', path: '/api/tiktok/monitor/config', body: { retentionWindowMs: 60000 } },
    { method: 'POST', path: '/api/tiktok/queue/recover', body: { sessionId: 'test' } },
    { method: 'GET', path: '/api/tiktok/diagnostic/status' },
    { method: 'GET', path: '/api/tiktok/diagnostic/events' },
    { method: 'GET', path: '/api/tiktok/diagnostic/events/trace_test_123' },
    { method: 'POST', path: '/api/tiktok/diagnostic/toggle', body: { active: true } },
    { method: 'POST', path: '/api/tiktok/diagnostic/clear', body: {} },
    { method: 'GET', path: '/api/tiktok/diagnostic/audit' },
    { method: 'POST', path: '/api/legal/documents/draft', body: { slug: 'termos-de-uso' } },
    { method: 'POST', path: '/api/legal/documents/publish', body: { slug: 'termos-de-uso', newVersion: '1.2.0' } },
    { method: 'PATCH', path: '/api/lgpd/requests/req_test_1', body: { status: 'CONCLUIDA' } },
    { method: 'PATCH', path: '/api/support/tickets/tick_test_1', body: { status: 'RESOLVIDO' } },
    { method: 'POST', path: '/api/admin/company-settings', body: { razaoSocial: 'Hacked' } },
    { method: 'POST', path: '/api/admin/subscription-settings', body: { monthlyPrice: 1 } },
    { method: 'GET', path: '/api/subscriptions/admin/summary' },
    { method: 'POST', path: '/api/subscriptions/admin/plans', body: { monthlyPrice: 1 } },
    { method: 'POST', path: '/api/subscriptions/admin/homologation/verify', body: {} },
  ];

  let allRoutesProtected = true;
  for (const route of adminRoutes) {
    const res = await fetch(`${BASE_URL}${route.path}`, {
      method: route.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-gio-admin-access': 'authorized', // attempt bypass
        Referer: 'http://localhost:3000/admin', // attempt bypass
      },
      body: route.body ? JSON.stringify(route.body) : undefined,
    });

    const isBlocked = res.status === 401;
    if (!isBlocked) {
      allRoutesProtected = false;
      console.log(`[FAIL] Route ${route.method} ${route.path} returned ${res.status} (expected 401)`);
    } else {
      console.log(`[PASS] Route ${route.method} ${route.path} -> 401 Unauthorized`);
    }
  }

  results.push({
    num: 9,
    description: 'All 20 administrative routes return 401 when called without valid admin token',
    expectedStatus: 401,
    actualStatus: allRoutesProtected ? 401 : -1,
    passed: allRoutesProtected,
  });

  // 10. Attempt bypasses via composite attacks (cookies, query params, headers together)
  const compositeRes = await fetch(`${BASE_URL}/api/admin/subscription-settings?admin=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-gio-admin-access': 'authorized',
      'x-gio-admin-uid': 'superadmin',
      'x-admin-authorized': 'true',
      Cookie: 'gio_session=authorized; admin=1',
      Referer: 'http://localhost:3000/internal-dashboard',
    },
    body: JSON.stringify({ monthlyPrice: 1 }),
  });

  results.push({
    num: 10,
    description: 'Composite header/cookie/query bypass attempt -> blocked with 401',
    expectedStatus: 401,
    actualStatus: compositeRes.status,
    passed: compositeRes.status === 401,
  });
  console.log(
    `[${compositeRes.status === 401 ? 'PASS' : 'FAIL'}] Test 10: Composite bypass attempt -> Status: ${compositeRes.status} (Expected: 401)`
  );

  console.log('\n=== TEST SUMMARY ===');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${results.filter((r) => !r.passed).length}`);
  console.log(`Overall Result: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
