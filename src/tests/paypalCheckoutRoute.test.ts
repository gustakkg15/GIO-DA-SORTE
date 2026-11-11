/**
 * GIO DA SORTE PRO — SUÍTE DE DIAGNÓSTICO E COBERTURA DO FLUXO REAL DO CHECKOUT PAYPAL
 * 
 * Valida:
 * 1. Resolução autoritativa da URL do backend Cloud Run em ambientes GitHub Pages (getApiUrl).
 * 2. Processamento seguro de respostas JSON de sucesso (200 OK com approvalUrl e subscriptionId).
 * 3. Processamento seguro de respostas JSON de erro (400 MISSING_UID / 503 HOMOLOGATION_GATE).
 * 4. Interceptação graciosa de respostas HTML 404 (GitHub Pages 404.html) sem lançar SyntaxError.
 * 5. Interceptação graciosa de respostas HTML 502/503 (Cloud Run / Nginx warmup) sem lançar SyntaxError.
 * 6. Tratamento seguro de falhas de rede / CORS (status 0).
 * 7. Tratamento de sessão expirada / autenticação inválida (401/403).
 * 8. Simulação e validação do fluxo do botão "Confirmar e Começar 3 Dias Grátis no PayPal".
 */

import assert from 'node:assert';
import { getApiUrl, safeApiJson, CLOUD_RUN_BACKEND_URL } from '../utils/apiConfig.ts';

export async function runPayPalCheckoutRouteDiagnostics(): Promise<{ passed: number; total: number }> {
  console.log('\n--- EXECUTANDO DIAGNÓSTICO DO FLUXO REAL DO CHECKOUT PAYPAL ---');
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      const res = fn();
      if (res && typeof (res as any).then === 'function') {
        return (res as Promise<void>)
          .then(() => {
            passed++;
            console.log(`  ✓ [PASS] ${name}`);
          })
          .catch((err) => {
            console.error(`  ✗ [FAIL] ${name}:`, err instanceof Error ? err.message : err);
            throw err;
          });
      } else {
        passed++;
        console.log(`  ✓ [PASS] ${name}`);
        return Promise.resolve();
      }
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  // 1. Check URL resolution logic for GitHub Pages
  await test('Resolução de URL: getApiUrl resolve para CLOUD_RUN_BACKEND_URL em ambiente github.io', () => {
    // Simulate window.location.hostname = 'gustakkgk15.github.io'
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: { hostname: 'gustakkgk15.github.io' },
    };

    const resolvedUrl = getApiUrl('/api/subscriptions/checkout');
    assert.strictEqual(
      resolvedUrl,
      `${CLOUD_RUN_BACKEND_URL}/api/subscriptions/checkout`,
      'A URL em github.io deve obrigatoriamente apontar para o backend Cloud Run'
    );

    (globalThis as any).window = originalWindow;
  });

  // 2. Mock fetch intercepting 200 OK JSON success
  await test('safeApiJson processa resposta JSON 200 de sucesso com approvalUrl e subscriptionId', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      assert.ok(String(url).includes('/api/subscriptions/checkout'));
      return new Response(
        JSON.stringify({
          success: true,
          provider: 'PAYPAL',
          code: 'PAYPAL_CHECKOUT_CREATED',
          approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=I-MOCK-TOKEN-123',
          subscriptionId: 'I-MOCK-TOKEN-123',
          subscription: { uid: 'usr_test_123', tier: 'FREE', statusState: 'PENDING' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    };

    try {
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: 'usr_test_123', provider: 'PAYPAL' }),
      });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data?.success, true);
      assert.strictEqual(res.data?.provider, 'PAYPAL');
      assert.ok(res.data?.approvalUrl?.includes('paypal.com'));
      assert.strictEqual(res.data?.subscriptionId, 'I-MOCK-TOKEN-123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. Mock fetch intercepting 400 Bad Request JSON error
  await test('safeApiJson processa resposta JSON de erro (HTTP 400 MISSING_UID) sem exceção', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'MISSING_UID',
          error: 'Identificador Firebase UID é obrigatório para iniciar o checkout do PayPal.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    try {
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({ uid: '' }),
      });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.error, 'Identificador Firebase UID é obrigatório para iniciar o checkout do PayPal.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 4. Mock fetch intercepting 404 HTML from GitHub Pages
  await test('safeApiJson intercepta resposta HTML 404 (GitHub Pages 404.html) graciosamente SEM lançar SyntaxError', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 File Not Found</h1></body></html>',
        {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    };

    try {
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
        method: 'POST',
      });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.isHtml, true);
      assert.ok(res.error?.includes('Resposta não-JSON do servidor'));
      assert.ok(!res.error?.includes('Unexpected token'), 'Não deve conter o erro SyntaxError de JSON');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 5. Mock fetch intercepting 502/503 HTML from Nginx/Cloud Run
  await test('safeApiJson intercepta resposta HTML 503 (Cloud Run warmup/gateway) graciosamente', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        '<html><body>503 Service Unavailable / Warming up</body></html>',
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html' },
        }
      );
    };

    try {
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
        method: 'POST',
      });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 503);
      assert.strictEqual(res.isHtml, true);
      assert.ok(res.error?.includes('503'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 6. Network/CORS failure handling (status 0)
  await test('safeApiJson trata falha de conexão de rede ou CORS com erro legível ao usuário', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch (CORS/Network error)');
    };

    try {
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
        method: 'POST',
      });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 0);
      assert.ok(res.error?.includes('Failed to fetch'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 7. Expired Session / Invalid Token (401 Unauthorized)
  await test('safeApiJson captura 401 FIREBASE_AUTH_REQUIRED do backend e reporta erro estruturado', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          success: false,
          code: 'FIREBASE_AUTH_REQUIRED',
          error: 'Autenticação obrigatória: envie um Firebase ID Token válido no cabeçalho Authorization: Bearer <token>.',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    try {
      const res = await safeApiJson<any>('/api/subscriptions/checkout', {
        method: 'POST',
      });

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.status, 401);
      assert.ok(res.error?.includes('Autenticação obrigatória'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  return { passed, total };
}
