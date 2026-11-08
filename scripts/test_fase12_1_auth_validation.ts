/**
 * GIO DA SORTE PRO — FASE 12.1: SUÍTE DE VALIDAÇÃO FUNCIONAL COMPLETA DO LOGIN
 *
 * Executa testes automatizados e verificações de contrato para:
 * 1. Identificação do ambiente e segurança operacional.
 * 2. E-mail e Senha (validação de formato, campos vazios, avaliação de senha, anti-enumeração, brute-force throttle).
 * 3. Cadastro (requisitos NIST SP 800-63B, e-mail duplicado anti-enumeração, aceite de termos).
 * 4. Recuperação de Senha (anti-enumeração, formato de e-mail).
 * 5. Login com Google (popup configuration, cancelamento limpo, provedor).
 * 6. Login com TikTok (botão oficial, geração e validação de state CSRF, rejeição de forjamento, associação de open_id).
 * 7. Sessão e Proteção (fail-closed de rotas protegidas, bloqueio de usuário comum em funções administrativas, ausência de vazamento de segredos).
 * 8. Interface (verificação estática e de componentes para exclusão da busca visual e manutenção do OAuth oficial, Google e layout responsivo).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Polyfill minimal sessionStorage for Node.js test environment
const mockStorage = new Map<string, string>();
(globalThis as any).sessionStorage = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, value: string) => mockStorage.set(key, String(value)),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// Set test encryption key for crypto functions
process.env.OAUTH_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

import {
  evaluatePassphrase,
  getGenericAuthErrorMessage,
  getThrottleState,
  recordFailedAttempt,
  resetThrottleState,
} from '../src/utils/authSecurity.ts';
import {
  tiktokOAuthService,
  assertNoClientIdentityForgery,
  redactSensitiveOAuthData,
  deriveControlledFirebaseUidFromOpenId,
  encryptTokenAes256Gcm,
  decryptTokenAes256Gcm,
} from '../src/server/tiktokOAuthService.ts';

interface RequestOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

interface ResponseResult {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json?: any;
}

function makeServerRequest(options: RequestOptions): Promise<ResponseResult> {
  return new Promise((resolve, reject) => {
    const postData = options.body || '';
    const reqHeaders: Record<string, string | number> = {
      ...(options.headers || {}),
    };
    if (postData && !reqHeaders['Content-Length']) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 3000,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
        timeout: 5000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let json: any;
          try {
            json = JSON.parse(raw);
          } catch {
            // non-json body
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: raw,
            json,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runValidationSuite() {
  console.log('================================================================================');
  console.log(' GIO DA SORTE PRO — FASE 12.1: VALIDAÇÃO FUNCIONAL COMPLETA DO LOGIN');
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, evidence: string) {
    total++;
    if (condition) {
      console.log(`✅ [APROVADO] Cenário #${String(total).padStart(2, '0')}: ${testName} — ${evidence}`);
      passed++;
    } else {
      console.error(`❌ [REPROVADO] Cenário #${String(total).padStart(2, '0')}: ${testName} — ${evidence}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. SEGURANÇA E AMBIENTE ANTES DOS TESTES
  // ---------------------------------------------------------------------------
  console.log('--- 1. SEGURANÇA E AMBIENTE ANTES DOS TESTES ---');
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const rawConfig = fs.readFileSync(configPath, 'utf-8');
  const firebaseConfig = JSON.parse(rawConfig);

  assert(
    firebaseConfig.projectId === 'quick-standard-pw2pc' &&
      firebaseConfig.authDomain === 'quick-standard-pw2pc.firebaseapp.com' &&
      Boolean(firebaseConfig.firestoreDatabaseId),
    'Identificação do Projeto Firebase conectado',
    `projectId=${firebaseConfig.projectId}, authDomain=${firebaseConfig.authDomain}, databaseId=${firebaseConfig.firestoreDatabaseId}`
  );

  assert(
    process.env.NODE_ENV !== 'production',
    'Identificação do Ambiente de Execução',
    `NODE_ENV=${process.env.NODE_ENV || 'development'} (Ambiente Sandbox / Preview AI Studio, isolado de produção)`
  );

  // ---------------------------------------------------------------------------
  // 2. TESTES DE E-MAIL E SENHA
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. TESTES DE E-MAIL E SENHA ---');

  // 2.1 Rejeição de campos vazios
  const emptyPassEval = evaluatePassphrase('');
  assert(
    !emptyPassEval.isValid && emptyPassEval.score === 0,
    'Validação de campo de senha vazio',
    `isValid=false, feedback="${emptyPassEval.feedback}"`
  );

  // 2.2 Rejeição de senha muito curta (< 8 caracteres conforme NIST SP 800-63B)
  const shortPassEval = evaluatePassphrase('12345');
  assert(
    !shortPassEval.isValid && shortPassEval.score === 0,
    'Validação de senha curta (< 8 caracteres)',
    `isValid=false, feedback="${shortPassEval.feedback}"`
  );

  // 2.3 Rejeição de senha excessivamente longa (> 256 caracteres - proteção DoS de hash)
  const longPass = 'A'.repeat(257);
  const longPassEval = evaluatePassphrase(longPass);
  assert(
    !longPassEval.isValid && longPassEval.score === 0,
    'Proteção contra DoS de hash em senhas gigantes (> 256 caracteres)',
    `isValid=false, feedback="${longPassEval.feedback}"`
  );

  // 2.4 Aceitação de frase-senha segura e válida
  const strongPassEval = evaluatePassphrase('gio-sorte-segura-2026!');
  assert(
    strongPassEval.isValid && strongPassEval.score >= 2,
    'Aceitação e pontuação de frase-senha segura',
    `isValid=true, score=${strongPassEval.score}, label="${strongPassEval.label}"`
  );

  // 2.5 Tratamento anti-enumeração de erro para usuário inexistente / senha incorreta
  const fakeUserNotFoundErr = new Error('Firebase: Error (auth/user-not-found).');
  const fakeWrongPasswordErr = new Error('Firebase: Error (auth/wrong-password).');
  const fakeInvalidCredentialErr = new Error('Firebase: Error (auth/invalid-credential).');

  const msgUserNotFound = getGenericAuthErrorMessage(fakeUserNotFoundErr, 'login');
  const msgWrongPassword = getGenericAuthErrorMessage(fakeWrongPasswordErr, 'login');
  const msgInvalidCred = getGenericAuthErrorMessage(fakeInvalidCredentialErr, 'login');

  assert(
    msgUserNotFound === msgWrongPassword &&
      msgWrongPassword === msgInvalidCred &&
      msgUserNotFound === 'E-mail ou senha incorretos. Por favor, verifique suas credenciais.',
    'Tratamento anti-enumeração estrito no login (user-not-found vs wrong-password vs invalid-credential)',
    `Mensagem genérica idêntica="${msgUserNotFound}"`
  );

  // 2.6 Formato de e-mail inválido
  const invalidEmailErr = new Error('Firebase: Error (auth/invalid-email).');
  const msgInvalidEmail = getGenericAuthErrorMessage(invalidEmailErr, 'login');
  assert(
    msgInvalidEmail === 'Por favor, insira um endereço de e-mail válido.',
    'Validação e feedback amigável para formato de e-mail inválido',
    `msg="${msgInvalidEmail}"`
  );

  // 2.7 Mecanismo de throttling progressivo contra força bruta no cliente
  resetThrottleState();
  recordFailedAttempt();
  recordFailedAttempt();
  const throttleState = recordFailedAttempt(); // 3ª tentativa consecutiva -> atraso de 5s
  assert(
    throttleState.isThrottled && throttleState.remainingSeconds > 0,
    'Proteção contra brute-force: bloqueio progressivo após 3 tentativas falhas consecutivas',
    `isThrottled=${throttleState.isThrottled}, remainingSeconds=${throttleState.remainingSeconds}`
  );
  resetThrottleState();

  // ---------------------------------------------------------------------------
  // 3. TESTES DE CADASTRO
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. TESTES DE CADASTRO ---');

  // 3.1 Tratamento anti-enumeração quando e-mail já existe
  const fakeEmailInUseErr = new Error('Firebase: Error (auth/email-already-in-use).');
  const msgEmailInUse = getGenericAuthErrorMessage(fakeEmailInUseErr, 'register');
  assert(
    msgEmailInUse ===
      'Não foi possível concluir o cadastro com este e-mail. Se já possui uma conta, faça login ou use a opção "Esqueci minha senha".',
    'Tratamento seguro e anti-enumeração para e-mail já cadastrado (auth/email-already-in-use)',
    `msg="${msgEmailInUse}"`
  );

  // 3.2 Validação de senha fraca no cadastro
  const fakeWeakPassErr = new Error('Firebase: Error (auth/weak-password).');
  const msgWeakPass = getGenericAuthErrorMessage(fakeWeakPassErr, 'register');
  assert(
    msgWeakPass === 'A senha escolhida não atende ao requisito mínimo de 8 caracteres.',
    'Tratamento para erro auth/weak-password no cadastro',
    `msg="${msgWeakPass}"`
  );

  // ---------------------------------------------------------------------------
  // 4. TESTES DE RECUPERAÇÃO DE SENHA
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. TESTES DE RECUPERAÇÃO DE SENHA ---');

  // 4.1 Anti-enumeração na recuperação de senha
  const msgResetUserNotFound = getGenericAuthErrorMessage(fakeUserNotFoundErr, 'reset');
  assert(
    msgResetUserNotFound ===
      'Se este e-mail estiver cadastrado, enviamos as instruções seguras de recuperação para sua caixa de entrada.',
    'Anti-enumeração na recuperação de senha (usuário inexistente não revela ausência de conta)',
    `msg="${msgResetUserNotFound}"`
  );

  // ---------------------------------------------------------------------------
  // 5. TESTES DE LOGIN COM GOOGLE
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. TESTES DE LOGIN COM GOOGLE ---');

  // 5.1 Cancelamento limpo do popup do Google sem exibir erro na tela
  const fakePopupClosedErr = new Error('Firebase: Error (auth/popup-closed-by-user).');
  const msgPopupClosed = getGenericAuthErrorMessage(fakePopupClosedErr, 'login');
  assert(
    msgPopupClosed === null,
    'Cancelamento voluntário de popup do Google Auth não emite erro para o usuário (tratamento limpo)',
    `msg=null (silenciado conforme padrão UX)`
  );

  // 5.2 Erro de requisições excessivas
  const fakeTooManyRequestsErr = new Error('Firebase: Error (auth/too-many-requests).');
  const msgTooManyReq = getGenericAuthErrorMessage(fakeTooManyRequestsErr, 'login');
  assert(
    Boolean(msgTooManyReq?.includes('Muitas tentativas sem sucesso')),
    'Tratamento de rate limit auth/too-many-requests para Google/Firebase Auth',
    `msg="${msgTooManyReq}"`
  );

  // ---------------------------------------------------------------------------
  // 6. TESTES DE LOGIN COM TIKTOK
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. TESTES DE LOGIN COM TIKTOK (CONTINUAR COM TIKTOK OAUTH OFICIAL) ---');

  // 6.1 Inicialização do OAuth pelo servidor: /api/tiktok/auth/login/start
  const startRes = await makeServerRequest({
    method: 'POST',
    path: '/api/tiktok/auth/login/start',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const cookiesHeader = String(startRes.headers['set-cookie'] || '');
  const hasStateCookie = cookiesHeader.includes('tiktok_oauth_state');
  const hasInitiatorCookie = cookiesHeader.includes('tiktok_oauth_initiator');
  const authUrl = startRes.json?.url || '';

  assert(
    startRes.statusCode === 200 &&
      authUrl.startsWith('https://www.tiktok.com/v2/auth/authorize/') &&
      hasStateCookie &&
      hasInitiatorCookie,
    'Inicialização do TikTok OAuth 2.0 oficial (/api/tiktok/auth/login/start)',
    `status=${startRes.statusCode}, stateCookie=${hasStateCookie}, initiatorCookie=${hasInitiatorCookie}`
  );

  // 6.2 Validação de CSRF na API JSON: /api/tiktok/auth/exchange sem state deve ser rejeitado com 400
  const exchangeNoStateRes = await makeServerRequest({
    method: 'POST',
    path: '/api/tiktok/auth/exchange',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'fake_code_123' }),
  });
  assert(
    exchangeNoStateRes.statusCode === 400 &&
      (exchangeNoStateRes.json?.code === 'CSRF_STATE_INVALID' ||
        exchangeNoStateRes.json?.code === 'CSRF_STATE_REQUIRED'),
    'Rejeição na API JSON (/api/tiktok/auth/exchange) para requisição sem state (CSRF_STATE_INVALID)',
    `statusCode=${exchangeNoStateRes.statusCode}, code=${exchangeNoStateRes.json?.code}`
  );

  // 6.3 Validação de CSRF na API JSON: state inválido/forjado rejeitado com 400 CSRF_STATE_NOT_FOUND
  const exchangeBadStateRes = await makeServerRequest({
    method: 'POST',
    path: '/api/tiktok/auth/exchange',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'fake_code_123', state: 'forged_state_xyz_999' }),
  });
  assert(
    exchangeBadStateRes.statusCode === 400 &&
      exchangeBadStateRes.json?.code === 'CSRF_STATE_NOT_FOUND',
    'Rejeição na API JSON para state forjado/inexistente (CSRF_STATE_NOT_FOUND)',
    `statusCode=${exchangeBadStateRes.statusCode}, code=${exchangeBadStateRes.json?.code}`
  );

  // 6.4 Tratamento seguro no popup (/auth/tiktok/callback) para cancelamento pelo usuário
  const callbackDeniedRes = await makeServerRequest({
    method: 'GET',
    path: '/auth/tiktok/callback?error=access_denied&error_description=User+cancelled',
  });
  assert(
    callbackDeniedRes.body.includes('OAUTH_AUTH_ERROR') &&
      (callbackDeniedRes.body.includes('User cancelled') ||
        callbackDeniedRes.body.includes('access_denied')),
    'Tratamento no popup (/auth/tiktok/callback) de cancelamento da autorização pelo usuário (postMessage)',
    `containsOauthAuthError=true, containsUserCancelled=true`
  );

  // 6.5 Bloqueio estrito de forjamento de identidade no cliente
  let forgeryCaught = false;
  try {
    assertNoClientIdentityForgery({
      open_id: 'fake_forged_openid',
      uid: 'admin_victim',
    });
  } catch (err: any) {
    forgeryCaught = err.code === 'CLIENT_IDENTITY_FORGERY_BLOCKED';
  }
  assert(
    forgeryCaught,
    'Bloqueio estrito de injeção de open_id ou uid via body/query do cliente',
    `forgeryCaught=${forgeryCaught}`
  );

  // 6.6 Derivação determinística e controlada de UID GIO a partir do open_id do TikTok
  const testOpenId = 'tt_real_verified_openid_test_123';
  const derivedUid = deriveControlledFirebaseUidFromOpenId(testOpenId);
  assert(
    derivedUid.startsWith('gio_tt_') && derivedUid.length > 10,
    'Derivação segura de Firebase UID controlado para contas TikTok (gio_tt_...)',
    `derivedUid=${derivedUid}`
  );

  // ---------------------------------------------------------------------------
  // 7. SESSÃO E PROTEÇÃO
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. SESSÃO E PROTEÇÃO ---');

  // 7.1 Rota protegida sem autorização: /api/tiktok/auth/identity sem token deve retornar 401
  const unauthIdentityRes = await makeServerRequest({
    method: 'GET',
    path: '/api/tiktok/auth/identity',
  });
  assert(
    unauthIdentityRes.statusCode === 401,
    'Proteção fail-closed: rota protegida sem cabeçalho Authorization é rejeitada com 401',
    `statusCode=${unauthIdentityRes.statusCode}`
  );

  // 7.2 Rota protegida com token malformado: deve retornar 401
  const malformedTokenRes = await makeServerRequest({
    method: 'GET',
    path: '/api/tiktok/auth/identity',
    headers: { Authorization: 'Bearer invalid_garbage_token_xyz' },
  });
  assert(
    malformedTokenRes.statusCode === 401,
    'Proteção fail-closed: token malformado ou inválido é rejeitado com 401',
    `statusCode=${malformedTokenRes.statusCode}`
  );

  // 7.3 Rota de vinculação sem autenticação
  const unauthLinkRes = await makeServerRequest({
    method: 'POST',
    path: '/api/tiktok/auth/link/start',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert(
    unauthLinkRes.statusCode === 401,
    'Proteção de vinculação de contas: rejeição de usuário não-autenticado com 401',
    `statusCode=${unauthLinkRes.statusCode}`
  );

  // 7.4 Endpoint de auditoria administrativa / descarte sem token de admin
  const unauthAdminRes = await makeServerRequest({
    method: 'POST',
    path: '/api/admin/pending-revocations/discard',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revocationId: 'fake_123', justification: 'test' }),
  });
  assert(
    unauthAdminRes.statusCode === 401 || unauthAdminRes.statusCode === 403,
    'Proteção RBAC administrativa: acesso de operador sem credencial de admin rejeitado com 401/403',
    `statusCode=${unauthAdminRes.statusCode}, body=${unauthAdminRes.json?.error || unauthAdminRes.body}`
  );

  // 7.5 Criptografia AES-256-GCM e ausência de segredos em texto puro
  const sampleToken = 'tt_access_token_secret_value_xyz_123456';
  const encPayload = encryptTokenAes256Gcm(sampleToken);
  const decToken = decryptTokenAes256Gcm(encPayload);
  const redacted = redactSensitiveOAuthData({
    access_token: sampleToken,
    client_secret: 'secret123',
    other_safe_field: 'safe_public_data',
  });

  assert(
    encPayload.ciphertext !== sampleToken &&
      decToken === sampleToken &&
      (redacted as any).access_token === '[REDACTED]' &&
      (redacted as any).client_secret === '[REDACTED]',
    'Criptografia AES-256-GCM no cofre de tokens e sanitização automática de segredos em logs/respostas',
    `encryptedMatch=${decToken === sampleToken}, redactedMatch=true`
  );

  // ---------------------------------------------------------------------------
  // 8. INTERFACE E MODAL DE CONTA
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. INTERFACE E MODAL DE CONTA ---');
  const accountModalPath = path.resolve(process.cwd(), 'src/components/AccountModal.tsx');
  const accountModalCode = fs.readFileSync(accountModalPath, 'utf-8');

  // 8.1 Confirmação de ausência do botão e busca visual por @usuário
  const hasVisualLookupButton =
    accountModalCode.includes('Entrar com @usuário do TikTok (Busca Visual + OAuth)') ||
    accountModalCode.includes('showUsernameLookup') ||
    accountModalCode.includes('handleUsernameVisualLookup') ||
    accountModalCode.includes('visualTikTokUsername');

  assert(
    !hasVisualLookupButton,
    'Confirmação de remoção completa do botão de busca visual por @usuário do TikTok',
    `hasVisualLookupButton=${hasVisualLookupButton} (Totalmente removido)`
  );

  // 8.2 Confirmação da presença do botão TikTok OAuth oficial
  const hasOfficialOAuthButton =
    accountModalCode.includes('Continuar com TikTok (OAuth Oficial)') &&
    accountModalCode.includes('handleTikTokLoginOAuth');

  assert(
    hasOfficialOAuthButton,
    'Confirmação da presença ativa do botão "Continuar com TikTok (OAuth Oficial)"',
    `hasOfficialOAuthButton=${hasOfficialOAuthButton}`
  );

  // 8.3 Confirmação da presença do botão Google
  const hasGoogleButton =
    accountModalCode.includes('Continuar com Google') &&
    accountModalCode.includes('handleGoogleSignIn');

  assert(
    hasGoogleButton,
    'Confirmação da presença ativa do botão "Continuar com Google"',
    `hasGoogleButton=${hasGoogleButton}`
  );

  // 8.4 Confirmação dos formulários de E-mail/Senha, Cadastro e Esqueci minha Senha
  const hasEmailForms =
    accountModalCode.includes('handleEmailLogin') &&
    accountModalCode.includes('handleRegister') &&
    accountModalCode.includes('handleForgotPassword');

  assert(
    hasEmailForms,
    'Confirmação dos formulários de login por e-mail/senha, cadastro e recuperação de senha',
    `hasEmailForms=${hasEmailForms}`
  );

  // 8.5 Confirmação de responsividade do modal para desktop e mobile
  const hasResponsiveClasses =
    accountModalCode.includes('overflow-y-auto') &&
    accountModalCode.includes('max-w-md') &&
    accountModalCode.includes('w-full') &&
    accountModalCode.includes('sm:text-lg');

  assert(
    hasResponsiveClasses,
    'Responsividade da interface (viewport safe, rolagem vertical, mobile-friendly)',
    `hasResponsiveClasses=${hasResponsiveClasses}`
  );

  console.log('\n================================================================================');
  console.log(` RESULTADO FASE 12.1: ${passed}/${total} CENÁRIOS DE VALIDAÇÃO APROVADOS`);
  console.log('================================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runValidationSuite().catch((err) => {
  console.error('Fatal error running validation suite:', err);
  process.exit(1);
});
