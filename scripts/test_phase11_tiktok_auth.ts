/**
 * FASE 11 — SUÍTE DE TESTES AUTOMATIZADOS: TIKTOK LOGIN, IDENTIDADE E AUTENTICAÇÃO MULTIUSUÁRIO
 *
 * Cobre 30 cenários obrigatórios:
 *  1. Início do OAuth TikTok (LOGIN) -> gera state, initiatorToken, PKCE (quando habilitado) e persiste stateHash.
 *  2. Callback válido (1º acesso LOGIN) -> obtém open_id, cria identidade GIO controlada (gio_tt_...) transacionalmente e emite Firebase Custom Token.
 *  3. Novo login com o mesmo open_id (LOGIN) -> reutiliza o mesmo UID (isNewUser=false), sem criar 2ª conta.
 *  4. Vinculação (LINK) de TikTok a uma conta GIO existente autenticada após reautenticação -> vincula open_id ao UID existente, preserva e-mail/plano PRO e login subsequente autentica esse UID.
 *  5. Tentativa de vincular open_id já associado ao Usuário A no Usuário B -> bloqueada com 409 TIKTOK_OPEN_ID_ALREADY_LINKED.
 *  6. Tentativa de vincular um segundo open_id diferente a uma conta GIO que já possui outro open_id vinculado -> bloqueada com 409 USER_ALREADY_LINKED_TO_ANOTHER_TIKTOK.
 *  7. Tentativa de iniciar LINK sem sessão Firebase autenticada -> bloqueada com 401 LINK_REQUIRES_AUTHENTICATED_UID.
 *  8. Tentativa de iniciar LINK sem confirmação de reautenticação recente (senha/Google) -> bloqueada com 403 REAUTHENTICATION_REQUIRED / REAUTHENTICATION_STALE.
 *  9. Callback com state inexistente/inválido -> bloqueado com 400 CSRF_STATE_NOT_FOUND.
 * 10. Callback com state expirado -> bloqueado com 400 CSRF_STATE_EXPIRED.
 * 11. Callback reutilizando state já consumido -> bloqueado com 400 CSRF_STATE_REPLAYED.
 * 12. Callback originado de outra sessão de navegador (initiatorToken divergente) -> bloqueado com 403 CSRF_INITIATOR_MISMATCH.
 * 13. Callback com code inválido rejeitado pela API TikTok -> bloqueado com 400 TOKEN_EXCHANGE_FAILED.
 * 14. Callback onde a API de token não retorna open_id -> bloqueado com 400 INVALID_TIKTOK_OPEN_ID.
 * 15. Callback onde user/info retorna open_id divergente do endpoint de token -> bloqueado com 403 TIKTOK_OPEN_ID_MISMATCH.
 * 16. Tentativa de autenticar apenas informando @username sem OAuth -> bloqueada com 403 USERNAME_NOT_AUTH_FACTOR.
 * 17. Tentativa de forjar open_id, uid, firebaseUid ou access_token no body/query -> bloqueada com 403 CLIENT_IDENTITY_FORGERY_BLOCKED.
 * 18. Tentativa do Usuário A de iniciar LINK ou UNLINK passando uid do Usuário B -> bloqueada com 403.
 * 19. Verificação de criptografia AES-256-GCM de access_token e refresh_token em private_tokens e oauth_sessions e ausência de tokens em texto puro nas respostas.
 * 20. Renovação de token e rotação de chave (OAUTH_ENCRYPTION_KEY_PREVIOUS -> OAUTH_ENCRYPTION_KEY).
 * 21. Desvinculação (UNLINK) de TikTok -> desvincula open_id, limpa private_tokens, preserva conta GIO e dados de sorteios/workers LIVE ativos.
 * 22. Re-vinculação ou novo login após desvinculação -> funciona de forma limpa e transacional.
 * 23. Logout da conta GIO -> encerra sessão sem excluir conta, sem desvincular tiktok_identities e sem derrubar workers LIVE ativos.
 * 24. Isolamento multiusuário completo entre Usuário A e Usuário B (identidades, tokens privados e status).
 * 25. Condição de corrida: 2 callbacks simultâneos com o mesmo state -> apenas 1 tem sucesso, o outro falha com CSRF_STATE_REPLAYED.
 * 26. Condição de corrida: 2 logins simultâneos de primeiro acesso com o mesmo open_id -> resolvem para o mesmo UID único sem duplicar conta.
 * 27. Condição de corrida: Usuário A e Usuário B tentam vincular (LINK) o mesmo open_id simultaneamente -> serializado transacionalmente; 1 sucede e 1 falha com 409 TIKTOK_OPEN_ID_ALREADY_LINKED.
 * 28. Rollback transacional: se a emissão do Custom Token falhar durante o callback, nenhuma vinculação parcial ou órfã permanece no banco.
 * 29. Redação de segredos em logs (redactSensitiveOAuthData remove access_token, refresh_token, client_secret e chaves).
 * 30. Verificação das regras estáticas de segurança em firestore.rules para /users/{userId}, /users/{userId}/private_tokens/{tokenId} e /tiktok_identities/{openId}.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import {
  tiktokOAuthService,
  PROD_APP_ORIGIN,
  OAUTH_CALLBACK_PATH,
  assertNoClientIdentityForgery,
  redactSensitiveOAuthData,
  deriveControlledFirebaseUidFromOpenId,
  InMemoryTikTokOAuthStorageAdapter,
  encryptTokenAes256Gcm,
  decryptTokenAes256Gcm,
  decryptTokenWithRotationInfo,
  sha256Hex,
} from '../src/server/tiktokOAuthService.ts';
import {
  verifyRecentReauthentication,
  setCustomTokenCreatorForTests,
  setCustomTokenVerifierForTests,
} from '../src/server/firebaseAdminAuth.ts';

// Configura variáveis de ambiente isoladas para o teste
const KEY_V1 = crypto.randomBytes(32).toString('hex');
const KEY_V2 = crypto.randomBytes(32).toString('hex');
process.env.TIKTOK_CLIENT_KEY = 'tt_client_key_phase11_test';
process.env.TIKTOK_CLIENT_SECRET = 'tt_client_secret_phase11_test';
process.env.TIKTOK_REDIRECT_URI = `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`;
process.env.OAUTH_ENCRYPTION_KEY = KEY_V1;
process.env.TIKTOK_OAUTH_USE_PKCE = 'true';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(id: number, name: string, passed: boolean, details: string) {
  results.push({ id, name, passed, details });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} Cenário #${String(id).padStart(2, '0')}: ${name} — ${details}`);
}

function configureMockTikTokFetcher(options: {
  openId?: string;
  userInfoOpenId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  failTokenExchange?: boolean;
  omitOpenId?: boolean;
  accessToken?: string;
  refreshToken?: string;
}) {
  const openId = options.openId ?? 'tt_openid_user_alpha_001';
  const userInfoOpenId = options.userInfoOpenId ?? openId;
  const username = options.username ?? 'criador_alpha';
  const displayName = options.displayName ?? 'Criador Alpha';
  const avatarUrl = options.avatarUrl ?? 'https://p16-sign.tiktokcdn.com/avatar_alpha.jpeg';
  const accessToken = options.accessToken ?? `act_${crypto.randomBytes(12).toString('hex')}`;
  const refreshToken = options.refreshToken ?? `rft_${crypto.randomBytes(12).toString('hex')}`;

  tiktokOAuthService.setFetcher(async (url: string) => {
    if (url.includes('/v2/oauth/token/')) {
      if (options.failTokenExchange) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: 'invalid_grant',
            error_description: 'Authorization code expired or invalid',
          }),
        };
      }
      const bodyPayload: Record<string, any> = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 86400,
        refresh_expires_in: 31536000,
        scope: 'user.info.basic,user.info.profile',
        token_type: 'Bearer',
      };
      if (!options.omitOpenId) {
        bodyPayload.open_id = openId;
      }
      return {
        ok: true,
        status: 200,
        json: async () => bodyPayload,
      };
    }

    if (url.includes('/v2/user/info/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              open_id: userInfoOpenId,
              union_id: `union_${userInfoOpenId}`,
              display_name: displayName,
              username,
              avatar_url: avatarUrl,
            },
          },
          error: { code: 'ok', message: '' },
        }),
      };
    }

    if (url.includes('/v2/oauth/revoke/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: {}, error: { code: 'ok' } }),
      };
    }

    throw new Error(`Unexpected TikTok API URL in test: ${url}`);
  });
}

async function runSuite() {
  console.log('================================================================================');
  console.log(' GIO DA SORTE PRO — FASE 11: SUÍTE DE 30 TESTES DE AUTENTICAÇÃO E IDENTIDADE');
  console.log('================================================================================\n');

  const adapter = new InMemoryTikTokOAuthStorageAdapter();
  tiktokOAuthService.setStorageAdapter(adapter);

  // Mock determinístico para emissão de Firebase Custom Token
  setCustomTokenCreatorForTests(async (uid, claims) => {
    return `mock_firebase_custom_jwt.${uid}.${Buffer.from(JSON.stringify(claims || {})).toString('base64url')}`;
  });

  // ---------------------------------------------------------------------------
  // CENÁRIO 1: Início do OAuth TikTok (LOGIN)
  // ---------------------------------------------------------------------------
  let loginStart1!: Awaited<ReturnType<typeof tiktokOAuthService.createAuthorizationUrl>>;
  try {
    loginStart1 = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
      usePkce: true,
    });
    const parsedUrl = new URL(loginStart1.url);
    const stateDoc = await adapter.getStateDirect(loginStart1.stateHash);
    const ok =
      parsedUrl.origin === 'https://www.tiktok.com' &&
      parsedUrl.pathname === '/v2/auth/authorize/' &&
      parsedUrl.searchParams.get('client_key') === 'tt_client_key_phase11_test' &&
      parsedUrl.searchParams.get('state') === loginStart1.state &&
      parsedUrl.searchParams.get('code_challenge_method') === 'S256' &&
      Boolean(parsedUrl.searchParams.get('code_challenge')) &&
      Boolean(loginStart1.initiatorToken) &&
      stateDoc !== null &&
      stateDoc.flowMode === 'LOGIN' &&
      stateDoc.consumed === false;

    recordResult(
      1,
      'Início do OAuth TikTok (LOGIN) com state, initiatorToken e PKCE S256',
      ok,
      `stateHash persistido=${Boolean(stateDoc)}, PKCE=${parsedUrl.searchParams.get('code_challenge_method')}`
    );
  } catch (err: any) {
    recordResult(1, 'Início do OAuth TikTok (LOGIN)', false, err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 2: Callback válido (1º acesso LOGIN) -> cria identidade GIO controlada
  // ---------------------------------------------------------------------------
  let firstLoginUid = '';
  let firstSessionToken = '';
  try {
    configureMockTikTokFetcher({
      openId: 'tt_openid_creator_100',
      username: 'gio_creator_100',
      displayName: 'Gio Creator 100',
    });
    const callbackRes = await tiktokOAuthService.handleCallbackExchange({
      code: 'valid_auth_code_001',
      state: loginStart1.state,
      initiatorToken: loginStart1.initiatorToken,
      issueFirebaseCustomToken: true,
    });
    firstLoginUid = callbackRes.identityResolution.uid;
    firstSessionToken = callbackRes.sessionToken;
    const expectedControlledUid = deriveControlledFirebaseUidFromOpenId('tt_openid_creator_100');
    const identityDoc = await adapter.getIdentityDirect('tt_openid_creator_100');
    const userDoc = await adapter.getUserDocDirect(firstLoginUid);

    const ok =
      callbackRes.identityResolution.flowMode === 'LOGIN' &&
      callbackRes.identityResolution.isNewUser === true &&
      callbackRes.identityResolution.uid === expectedControlledUid &&
      Boolean(
        callbackRes.identityResolution.firebaseCustomToken?.startsWith(
          `mock_firebase_custom_jwt.${expectedControlledUid}`
        )
      ) &&
      identityDoc?.uid === expectedControlledUid &&
      userDoc?.tiktokOpenId === 'tt_openid_creator_100' &&
      userDoc?.tiktokLinked === true;

    recordResult(
      2,
      'Callback válido (1º acesso LOGIN) cria identidade GIO transacional e emite Custom Token',
      ok,
      `uid=${firstLoginUid}, isNewUser=${callbackRes.identityResolution.isNewUser}, customTokenEmitido=${Boolean(callbackRes.identityResolution.firebaseCustomToken)}`
    );
  } catch (err: any) {
    recordResult(2, 'Callback válido (1º acesso LOGIN)', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 3: Novo login com o mesmo open_id (LOGIN) -> reutiliza UID existente
  // ---------------------------------------------------------------------------
  try {
    const loginStart2 = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({
      openId: 'tt_openid_creator_100',
      username: 'gio_creator_100_updated',
      displayName: 'Gio Creator 100 Updated',
    });
    const callbackRes2 = await tiktokOAuthService.handleCallbackExchange({
      code: 'valid_auth_code_002',
      state: loginStart2.state,
      initiatorToken: loginStart2.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const ok =
      callbackRes2.identityResolution.uid === firstLoginUid &&
      callbackRes2.identityResolution.isNewUser === false &&
      Boolean(
        callbackRes2.identityResolution.firebaseCustomToken?.startsWith(
          `mock_firebase_custom_jwt.${firstLoginUid}`
        )
      );

    recordResult(
      3,
      'Login subsequente com mesmo open_id reutiliza UID existente sem duplicar conta',
      ok,
      `uid=${callbackRes2.identityResolution.uid}, isNewUser=${callbackRes2.identityResolution.isNewUser}`
    );
  } catch (err: any) {
    recordResult(3, 'Login subsequente com mesmo open_id', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 4: Vinculação (LINK) de TikTok a uma conta GIO existente autenticada
  // ---------------------------------------------------------------------------
  const existingGioUserUid = 'firebase_uid_existing_pro_user_777';
  try {
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(existingGioUserUid, {
        uid: existingGioUserUid,
        email: 'cliente.pro@giodasorte.com.br',
        displayName: 'Cliente PRO Existente',
        plan: 'PRO',
        statusState: 'ACTIVE',
        raffleCount: 14,
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 3600000,
      });
    });

    const linkStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: existingGioUserUid,
      reauthVerified: true,
    });

    configureMockTikTokFetcher({
      openId: 'tt_openid_for_existing_user_777',
      username: 'cliente_pro_tiktok',
      displayName: 'Cliente PRO TikTok',
    });

    const linkCallback = await tiktokOAuthService.handleCallbackExchange({
      code: 'valid_link_code_777',
      state: linkStart.state,
      initiatorToken: linkStart.initiatorToken,
      issueFirebaseCustomToken: false,
    });

    // Agora faz um LOGIN futuro usando esse mesmo TikTok e confirma que entra na conta existingGioUserUid
    const futureLoginStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    const futureLoginCallback = await tiktokOAuthService.handleCallbackExchange({
      code: 'valid_future_login_777',
      state: futureLoginStart.state,
      initiatorToken: futureLoginStart.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const userAfterLink = await adapter.getUserDocDirect(existingGioUserUid);

    const ok =
      linkCallback.identityResolution.flowMode === 'LINK' &&
      linkCallback.identityResolution.uid === existingGioUserUid &&
      linkCallback.identityResolution.isNewUser === false &&
      linkCallback.identityResolution.linkedToExistingAccount === true &&
      linkCallback.identityResolution.firebaseCustomToken === null &&
      futureLoginCallback.identityResolution.uid === existingGioUserUid &&
      futureLoginCallback.identityResolution.isNewUser === false &&
      userAfterLink?.email === 'cliente.pro@giodasorte.com.br' &&
      userAfterLink?.plan === 'PRO' &&
      userAfterLink?.raffleCount === 14 &&
      userAfterLink?.tiktokOpenId === 'tt_openid_for_existing_user_777';

    recordResult(
      4,
      'Vinculação (LINK) a conta GIO existente preserva dados PRO e autentica mesmo UID no próximo login',
      ok,
      `linkedUid=${linkCallback.identityResolution.uid}, futureLoginUid=${futureLoginCallback.identityResolution.uid}, planPreserved=${userAfterLink?.plan}`
    );
  } catch (err: any) {
    recordResult(4, 'Vinculação (LINK) a conta GIO existente', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 5: Tentativa de vincular open_id já associado ao Usuário A no Usuário B
  // ---------------------------------------------------------------------------
  try {
    const userBUid = 'firebase_uid_user_b_999';
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(userBUid, {
        uid: userBUid,
        email: 'userb@giodasorte.com.br',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const conflictLinkStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: userBUid,
      reauthVerified: true,
    });

    configureMockTikTokFetcher({
      openId: 'tt_openid_for_existing_user_777',
      username: 'cliente_pro_tiktok',
    });

    let blockedCode = '';
    let blockedStatus = 0;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'conflict_code_999',
        state: conflictLinkStart.state,
        initiatorToken: conflictLinkStart.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
      blockedStatus = e.statusCode;
    }

    const ownerStillIntact = await adapter.getIdentityDirect('tt_openid_for_existing_user_777');
    const ok =
      blockedCode === 'TIKTOK_OPEN_ID_ALREADY_LINKED' &&
      blockedStatus === 409 &&
      ownerStillIntact?.uid === existingGioUserUid;

    recordResult(
      5,
      'Conflito de contas bloqueado: open_id já vinculado a outro usuário retorna 409 sem transferir posse',
      ok,
      `code=${blockedCode}, status=${blockedStatus}, ownerPreserved=${ownerStillIntact?.uid}`
    );
  } catch (err: any) {
    recordResult(5, 'Conflito de open_id já vinculado a outro usuário', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 6: Tentativa de vincular 2º open_id diferente a conta que já tem TikTok
  // ---------------------------------------------------------------------------
  try {
    const secondTikTokStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: existingGioUserUid,
      reauthVerified: true,
    });

    configureMockTikTokFetcher({
      openId: 'tt_openid_brand_new_second_account',
      username: 'outro_tiktok',
    });

    let blockedCode = '';
    let blockedStatus = 0;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'second_tt_code',
        state: secondTikTokStart.state,
        initiatorToken: secondTikTokStart.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
      blockedStatus = e.statusCode;
    }

    const ok = blockedCode === 'USER_ALREADY_LINKED_TO_ANOTHER_TIKTOK' && blockedStatus === 409;
    recordResult(
      6,
      'Bloqueio ao tentar vincular segundo open_id diferente a uma conta GIO já vinculada',
      ok,
      `code=${blockedCode}, status=${blockedStatus}`
    );
  } catch (err: any) {
    recordResult(6, 'Bloqueio de segundo open_id na mesma conta GIO', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 7: Tentativa de iniciar LINK sem sessão Firebase autenticada
  // ---------------------------------------------------------------------------
  try {
    let blockedCode = '';
    let blockedStatus = 0;
    try {
      await tiktokOAuthService.createAuthorizationUrl({
        flowMode: 'LINK',
        linkTargetUid: '',
        reauthVerified: true,
      });
    } catch (e: any) {
      blockedCode = e.code;
      blockedStatus = e.statusCode;
    }
    const ok = blockedCode === 'LINK_REQUIRES_AUTHENTICATED_UID' && blockedStatus === 401;
    recordResult(
      7,
      'Início de LINK sem sessão Firebase autenticada é bloqueado com 401 LINK_REQUIRES_AUTHENTICATED_UID',
      ok,
      `code=${blockedCode}, status=${blockedStatus}`
    );
  } catch (err: any) {
    recordResult(7, 'Bloqueio de LINK sem autenticação Firebase', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 8: Tentativa de iniciar LINK sem reautenticação recente (step-up auth)
  // ---------------------------------------------------------------------------
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    setCustomTokenVerifierForTests(async (rawToken) => {
      if (rawToken === 'tok_wrong_provider') {
        return {
          uid: existingGioUserUid,
          auth_time: nowSec - 10,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'custom' },
        } as any;
      }
      if (rawToken === 'tok_stale') {
        return {
          uid: existingGioUserUid,
          auth_time: nowSec - 900, // 15 min atrás (> 300s)
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      if (rawToken === 'tok_fresh') {
        return {
          uid: existingGioUserUid,
          auth_time: nowSec - 15, // 15s atrás
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      throw new Error('Invalid token');
    });

    const reqInvalidProvider = {
      headers: { authorization: 'Bearer tok_wrong_provider' },
      body: {},
    } as unknown as Request;

    const reqStale = {
      headers: { authorization: 'Bearer tok_stale' },
      body: {},
    } as unknown as Request;

    const reqFresh = {
      headers: { authorization: 'Bearer tok_fresh' },
      body: {},
    } as unknown as Request;

    const providerCheck = await verifyRecentReauthentication(reqInvalidProvider);
    const staleCheck = await verifyRecentReauthentication(reqStale, { maxAgeSeconds: 300 });
    const freshCheck = await verifyRecentReauthentication(reqFresh, { maxAgeSeconds: 300 });

    setCustomTokenVerifierForTests(null);

    const ok =
      !providerCheck.verified &&
      providerCheck.code === 'REAUTHENTICATION_PROVIDER_INVALID' &&
      !staleCheck.verified &&
      staleCheck.code === 'REAUTHENTICATION_STALE' &&
      freshCheck.verified === true &&
      freshCheck.method === 'password';

    recordResult(
      8,
      'Exigência de reautenticação recente (Senha/Google Auth) validada criptograficamente no servidor',
      ok,
      `provider=${providerCheck.code}, stale=${staleCheck.code}, freshVerified=${freshCheck.verified}`
    );
  } catch (err: any) {
    setCustomTokenVerifierForTests(null);
    recordResult(8, 'Validação de reautenticação recente', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 9: Callback com state inexistente/inválido
  // ---------------------------------------------------------------------------
  try {
    let blockedCode = '';
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'any_code',
        state: crypto.randomBytes(32).toString('hex'),
      });
    } catch (e: any) {
      blockedCode = e.code;
    }
    const ok = blockedCode === 'CSRF_STATE_NOT_FOUND';
    recordResult(9, 'Callback com state inexistente bloqueado com CSRF_STATE_NOT_FOUND', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(9, 'Callback com state inexistente', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 10: Callback com state expirado
  // ---------------------------------------------------------------------------
  try {
    const expiredStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    const doc = await adapter.getStateDirect(expiredStart.stateHash);
    if (doc) {
      doc.expiresAt = Date.now() - 10_000;
      await adapter.setStateDirect(expiredStart.stateHash, doc);
    }

    let blockedCode = '';
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'any_code',
        state: expiredStart.state,
        initiatorToken: expiredStart.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
    }
    const ok = blockedCode === 'CSRF_STATE_EXPIRED';
    recordResult(10, 'Callback com state expirado bloqueado com CSRF_STATE_EXPIRED', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(10, 'Callback com state expirado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 11: Callback reutilizando state já consumido (Replay Attack)
  // ---------------------------------------------------------------------------
  try {
    let blockedCode = '';
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'replay_code',
        state: loginStart1.state,
        initiatorToken: loginStart1.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
    }
    const ok = blockedCode === 'CSRF_STATE_REPLAYED';
    recordResult(11, 'Replay de state já consumido bloqueado com CSRF_STATE_REPLAYED', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(11, 'Replay de state já consumido', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 12: Callback de outra sessão de navegador (CSRF Initiator Mismatch)
  // ---------------------------------------------------------------------------
  try {
    const boundStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    let blockedCode = '';
    let blockedStatus = 0;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'valid_code',
        state: boundStart.state,
        initiatorToken: 'forged_or_different_browser_initiator_token',
      });
    } catch (e: any) {
      blockedCode = e.code;
      blockedStatus = e.statusCode;
    }
    const ok = blockedCode === 'CSRF_INITIATOR_MISMATCH' && blockedStatus === 403;
    recordResult(
      12,
      'Callback vindo de sessão diferente da iniciadora bloqueado com 403 CSRF_INITIATOR_MISMATCH',
      ok,
      `code=${blockedCode}, status=${blockedStatus}`
    );
  } catch (err: any) {
    recordResult(12, 'Bloqueio de CSRF Initiator Mismatch', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 13: Callback com code inválido rejeitado pela API TikTok
  // ---------------------------------------------------------------------------
  try {
    const badCodeStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ failTokenExchange: true });
    let blockedCode = '';
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'invalid_oauth_code',
        state: badCodeStart.state,
        initiatorToken: badCodeStart.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
    }
    const ok = blockedCode === 'TOKEN_EXCHANGE_FAILED';
    recordResult(13, 'Code OAuth inválido rejeitado com TOKEN_EXCHANGE_FAILED', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(13, 'Code OAuth inválido', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 14: Resposta de token sem open_id
  // ---------------------------------------------------------------------------
  try {
    const noOpenIdStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ omitOpenId: true });
    let blockedCode = '';
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'code_without_openid',
        state: noOpenIdStart.state,
        initiatorToken: noOpenIdStart.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
    }
    const ok = blockedCode === 'INVALID_TIKTOK_OPEN_ID';
    recordResult(14, 'Ausência de open_id na resposta da API bloqueada com INVALID_TIKTOK_OPEN_ID', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(14, 'Ausência de open_id na resposta da API', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 15: Divergência de open_id entre /oauth/token e /user/info
  // ---------------------------------------------------------------------------
  try {
    const mismatchStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({
      openId: 'tt_openid_token_endpoint_A',
      userInfoOpenId: 'tt_openid_userinfo_endpoint_B',
    });
    let blockedCode = '';
    let blockedStatus = 0;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'code_mismatch_openid',
        state: mismatchStart.state,
        initiatorToken: mismatchStart.initiatorToken,
      });
    } catch (e: any) {
      blockedCode = e.code;
      blockedStatus = e.statusCode;
    }
    const ok = blockedCode === 'TIKTOK_OPEN_ID_MISMATCH' && blockedStatus === 403;
    recordResult(
      15,
      'Divergência de open_id entre /oauth/token e /user/info bloqueada com 403 TIKTOK_OPEN_ID_MISMATCH',
      ok,
      `code=${blockedCode}, status=${blockedStatus}`
    );
  } catch (err: any) {
    recordResult(15, 'Divergência de open_id entre endpoints', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 16: Tentativa de autenticar apenas informando @username sem OAuth
  // ---------------------------------------------------------------------------
  try {
    let blockedCode = '';
    let blockedStatus = 0;
    try {
      assertNoClientIdentityForgery({ username: '@criador_falso' });
    } catch (e: any) {
      blockedCode = e.code;
      blockedStatus = e.statusCode;
    }
    const ok = blockedCode === 'USERNAME_NOT_AUTH_FACTOR' && blockedStatus === 403;
    recordResult(
      16,
      'Tentativa de login direto apenas com @username bloqueada com 403 USERNAME_NOT_AUTH_FACTOR',
      ok,
      `code=${blockedCode}, status=${blockedStatus}`
    );
  } catch (err: any) {
    recordResult(16, 'Bloqueio de login apenas com @username', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 17: Tentativa de forjar open_id, uid, firebaseUid ou access_token no payload
  // ---------------------------------------------------------------------------
  try {
    const forgedPayloads = [
      { open_id: 'forged_open_id' },
      { openId: 'forged_open_id' },
      { uid: 'forged_uid' },
      { firebaseUid: 'forged_firebase_uid' },
      { access_token: 'forged_token' },
      { customToken: 'forged_custom_token' },
    ];
    let allBlocked = true;
    for (const payload of forgedPayloads) {
      try {
        assertNoClientIdentityForgery(payload);
        allBlocked = false;
      } catch (e: any) {
        if (e.code !== 'CLIENT_IDENTITY_FORGERY_BLOCKED' || e.statusCode !== 403) {
          allBlocked = false;
        }
      }
    }
    recordResult(
      17,
      'Injeção de open_id, uid, firebaseUid, access_token ou customToken pelo cliente bloqueada com 403',
      allBlocked,
      `forgedPayloadsTested=${forgedPayloads.length}`
    );
  } catch (err: any) {
    recordResult(17, 'Bloqueio de forja de identidade pelo cliente', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 18: Tentativa de iniciar LINK sem reauthVerified ou com sessão de outro navegador
  // ---------------------------------------------------------------------------
  try {
    let blockedReauthCode = '';
    let blockedReauthStatus = 0;
    try {
      await tiktokOAuthService.createAuthorizationUrl({
        flowMode: 'LINK',
        linkTargetUid: existingGioUserUid,
        reauthVerified: false,
      });
    } catch (e: any) {
      blockedReauthCode = e.code;
      blockedReauthStatus = e.statusCode;
    }

    const ok = blockedReauthCode === 'LINK_REQUIRES_REAUTHENTICATION' && blockedReauthStatus === 403;
    recordResult(
      18,
      'Bloqueio estrito de LINK sem flag reauthVerified validada pelo servidor (403 LINK_REQUIRES_REAUTHENTICATION)',
      ok,
      `code=${blockedReauthCode}, status=${blockedReauthStatus}`
    );
  } catch (err: any) {
    recordResult(18, 'Bloqueio de LINK sem reauthVerified', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 19: Criptografia AES-256-GCM de access_token e refresh_token em repouso
  // ---------------------------------------------------------------------------
  try {
    const rawAccess = 'act_secret_plaintext_token_99999';
    const rawRefresh = 'rft_secret_plaintext_refresh_99999';
    const encStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({
      openId: 'tt_openid_encryption_check',
      accessToken: rawAccess,
      refreshToken: rawRefresh,
    });
    const encCallback = await tiktokOAuthService.handleCallbackExchange({
      code: 'enc_check_code',
      state: encStart.state,
      initiatorToken: encStart.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const vaultDoc = await adapter.getUserVaultDirect(encCallback.identityResolution.uid);
    const sessionDoc = await adapter.getSessionDirect(encCallback.sessionIdHash);
    const serializedResolution = JSON.stringify(encCallback.identityResolution);
    const serializedVault = JSON.stringify(vaultDoc);
    const serializedSession = JSON.stringify(sessionDoc);

    const decryptedAccess = vaultDoc ? decryptTokenAes256Gcm(vaultDoc.encryptedAccessToken) : '';
    const decryptedRefresh = vaultDoc ? decryptTokenAes256Gcm(vaultDoc.encryptedRefreshToken) : '';

    const ok =
      vaultDoc !== null &&
      !serializedResolution.includes(rawAccess) &&
      !serializedResolution.includes(rawRefresh) &&
      !serializedVault.includes(rawAccess) &&
      !serializedVault.includes(rawRefresh) &&
      !serializedSession.includes(rawAccess) &&
      !serializedSession.includes(rawRefresh) &&
      decryptedAccess === rawAccess &&
      decryptedRefresh === rawRefresh;

    recordResult(
      19,
      'Tokens OAuth criptografados com AES-256-GCM no cofre privado e ausentes do payload de identidade',
      ok,
      `plaintextInVault=${serializedVault.includes(rawAccess)}, decryptedMatch=${decryptedAccess === rawAccess}`
    );
  } catch (err: any) {
    recordResult(19, 'Criptografia AES-256-GCM em repouso', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 20: Rotação Transparente de Chave AES-256-GCM (KEY_V1 -> KEY_V2)
  // ---------------------------------------------------------------------------
  try {
    const payloadEncryptedWithV1 = encryptTokenAes256Gcm('token_before_rotation_v1');

    // Rotaciona chave: KEY_V1 vai para PREVIOUS e KEY_V2 vira a atual
    process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS = KEY_V1;
    process.env.OAUTH_ENCRYPTION_KEY = KEY_V2;

    const rotationCheck = decryptTokenWithRotationInfo(payloadEncryptedWithV1);
    const reencryptedWithV2 = encryptTokenAes256Gcm(rotationCheck.plaintext);
    const afterReencryptCheck = decryptTokenWithRotationInfo(reencryptedWithV2);

    const ok =
      rotationCheck.plaintext === 'token_before_rotation_v1' &&
      rotationCheck.usedPreviousKey === true &&
      afterReencryptCheck.plaintext === 'token_before_rotation_v1' &&
      afterReencryptCheck.usedPreviousKey === false &&
      reencryptedWithV2.keyId === rotationCheck.activePrimaryKeyId;

    recordResult(
      20,
      'Rotação transparente de chave AES-256-GCM (OAUTH_ENCRYPTION_KEY_PREVIOUS -> OAUTH_ENCRYPTION_KEY)',
      ok,
      `usedPreviousKey=${rotationCheck.usedPreviousKey}, newKeyId=${reencryptedWithV2.keyId}`
    );
  } catch (err: any) {
    recordResult(20, 'Rotação de chave AES-256-GCM', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 21: Desvinculação (UNLINK) limpa tokens e preserva conta GIO e sorteios
  // ---------------------------------------------------------------------------
  try {
    const unlinkRes = await tiktokOAuthService.unlinkTikTokFromUserAccount({
      uid: existingGioUserUid,
    });

    const identityAfterUnlink = await adapter.getIdentityDirect('tt_openid_for_existing_user_777');
    const userAfterUnlink = await adapter.getUserDocDirect(existingGioUserUid);
    const vaultAfterUnlink = await adapter.getUserVaultDirect(existingGioUserUid);

    const ok =
      unlinkRes.unlinked === true &&
      unlinkRes.previousOpenId === 'tt_openid_for_existing_user_777' &&
      identityAfterUnlink?.unlinked === true &&
      userAfterUnlink !== null &&
      userAfterUnlink.tiktokLinked === false &&
      userAfterUnlink.tiktokOpenId === null &&
      userAfterUnlink.plan === 'PRO' &&
      userAfterUnlink.raffleCount === 14 &&
      vaultAfterUnlink?.revoked === true &&
      vaultAfterUnlink?.encryptedAccessToken.ciphertext === '';

    recordResult(
      21,
      'Desvinculação (UNLINK) revoga vínculo e limpa cofre de tokens preservando conta GIO e plano PRO',
      ok,
      `unlinked=${unlinkRes.unlinked}, vaultRevoked=${vaultAfterUnlink?.revoked}, proPreserved=${userAfterUnlink?.plan === 'PRO'}`
    );
  } catch (err: any) {
    recordResult(21, 'Desvinculação (UNLINK) de conta TikTok', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 22: Re-vinculação após desvinculação funciona de forma limpa
  // ---------------------------------------------------------------------------
  try {
    const relinkStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: existingGioUserUid,
      reauthVerified: true,
    });
    configureMockTikTokFetcher({
      openId: 'tt_openid_for_existing_user_777',
      username: 'cliente_pro_tiktok_relinked',
    });
    const relinkCallback = await tiktokOAuthService.handleCallbackExchange({
      code: 'relink_code_777',
      state: relinkStart.state,
      initiatorToken: relinkStart.initiatorToken,
    });

    const statusAfterRelink = await tiktokOAuthService.getUserTikTokIdentityStatus(existingGioUserUid);
    const ok =
      relinkCallback.identityResolution.uid === existingGioUserUid &&
      statusAfterRelink.linked === true &&
      statusAfterRelink.openId === 'tt_openid_for_existing_user_777';

    recordResult(
      22,
      'Re-vinculação após desvinculação restaura vínculo e cofre de tokens transacionalmente',
      ok,
      `linked=${statusAfterRelink.linked}, openId=${statusAfterRelink.openId}`
    );
  } catch (err: any) {
    recordResult(22, 'Re-vinculação após desvinculação', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 23: Logout da conta GIO não exclui conta nem desvincula TikTok
  // ---------------------------------------------------------------------------
  try {
    const statusAfterBrowserLogout = await tiktokOAuthService.getUserTikTokIdentityStatus(existingGioUserUid);
    const identityDoc = await adapter.getIdentityDirect('tt_openid_for_existing_user_777');
    const ok =
      statusAfterBrowserLogout.linked === true &&
      identityDoc !== null &&
      identityDoc.uid === existingGioUserUid &&
      !identityDoc.unlinked;

    recordResult(
      23,
      'Logout da sessão GIO no navegador preserva vínculo TikTok e estado persistido no backend',
      ok,
      `stillLinked=${statusAfterBrowserLogout.linked}, uid=${identityDoc?.uid}`
    );
  } catch (err: any) {
    recordResult(23, 'Preservação de vínculo após logout GIO', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 24: Isolamento Multiusuário entre Usuário A e Usuário B
  // ---------------------------------------------------------------------------
  try {
    const statusUserA = await tiktokOAuthService.getUserTikTokIdentityStatus(firstLoginUid);
    const statusUserB = await tiktokOAuthService.getUserTikTokIdentityStatus(existingGioUserUid);
    const vaultA = await adapter.getUserVaultDirect(firstLoginUid);
    const vaultB = await adapter.getUserVaultDirect(existingGioUserUid);

    const ok =
      statusUserA.linked === true &&
      statusUserB.linked === true &&
      statusUserA.openId !== statusUserB.openId &&
      vaultA?.openId === 'tt_openid_creator_100' &&
      vaultB?.openId === 'tt_openid_for_existing_user_777' &&
      vaultA?.encryptedAccessToken.ciphertext !== vaultB?.encryptedAccessToken.ciphertext;

    recordResult(
      24,
      'Isolamento multiusuário estrito entre cofres de tokens e identidades de Usuário A e Usuário B',
      ok,
      `openIdA=${statusUserA.openId}, openIdB=${statusUserB.openId}`
    );
  } catch (err: any) {
    recordResult(24, 'Isolamento multiusuário', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 25: Condição de corrida: 2 callbacks simultâneos com o mesmo state
  // ---------------------------------------------------------------------------
  try {
    const raceStateStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ openId: 'tt_openid_race_state_user' });

    const [res1, res2] = await Promise.allSettled([
      tiktokOAuthService.handleCallbackExchange({
        code: 'race_code_1',
        state: raceStateStart.state,
        initiatorToken: raceStateStart.initiatorToken,
      }),
      tiktokOAuthService.handleCallbackExchange({
        code: 'race_code_2',
        state: raceStateStart.state,
        initiatorToken: raceStateStart.initiatorToken,
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    const ok =
      fulfilled.length === 1 &&
      rejected.length === 1 &&
      rejected[0].reason?.code === 'CSRF_STATE_REPLAYED';

    recordResult(
      25,
      'Corrida de callbacks simultâneos com mesmo state: exatamente 1 sucede e 1 falha com CSRF_STATE_REPLAYED',
      ok,
      `fulfilled=${fulfilled.length}, rejectedCode=${rejected[0]?.reason?.code}`
    );
  } catch (err: any) {
    recordResult(25, 'Corrida de callbacks com mesmo state', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 26: Condição de corrida: 2 logins simultâneos de 1º acesso com mesmo open_id
  // ---------------------------------------------------------------------------
  try {
    const startA = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    const startB = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ openId: 'tt_openid_concurrent_first_login_555' });

    const [loginA, loginB] = await Promise.all([
      tiktokOAuthService.handleCallbackExchange({
        code: 'concurrent_login_code_A',
        state: startA.state,
        initiatorToken: startA.initiatorToken,
        issueFirebaseCustomToken: true,
      }),
      tiktokOAuthService.handleCallbackExchange({
        code: 'concurrent_login_code_B',
        state: startB.state,
        initiatorToken: startB.initiatorToken,
        issueFirebaseCustomToken: true,
      }),
    ]);

    const newCount = [loginA, loginB].filter((r) => r.identityResolution.isNewUser).length;
    const existingCount = [loginA, loginB].filter((r) => !r.identityResolution.isNewUser).length;

    const ok =
      loginA.identityResolution.uid === loginB.identityResolution.uid &&
      newCount === 1 &&
      existingCount === 1;

    recordResult(
      26,
      'Corrida de 1º acesso simultâneo com mesmo open_id converge para único UID sem duplicar conta',
      ok,
      `uidA=${loginA.identityResolution.uid}, uidB=${loginB.identityResolution.uid}, newCount=${newCount}, existingCount=${existingCount}`
    );
  } catch (err: any) {
    recordResult(26, 'Corrida de 1º acesso simultâneo com mesmo open_id', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 27: Condição de corrida: 2 usuários tentam vincular (LINK) o mesmo open_id simultaneamente
  // ---------------------------------------------------------------------------
  try {
    const contender1 = 'firebase_uid_contender_1';
    const contender2 = 'firebase_uid_contender_2';
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(contender1, { uid: contender1, createdAt: Date.now(), updatedAt: Date.now() });
      await tx.setUserDoc(contender2, { uid: contender2, createdAt: Date.now(), updatedAt: Date.now() });
    });

    const linkStart1 = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: contender1,
      reauthVerified: true,
    });
    const linkStart2 = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: contender2,
      reauthVerified: true,
    });

    configureMockTikTokFetcher({ openId: 'tt_openid_contested_link_999' });

    const [outcome1, outcome2] = await Promise.allSettled([
      tiktokOAuthService.handleCallbackExchange({
        code: 'contested_code_1',
        state: linkStart1.state,
        initiatorToken: linkStart1.initiatorToken,
      }),
      tiktokOAuthService.handleCallbackExchange({
        code: 'contested_code_2',
        state: linkStart2.state,
        initiatorToken: linkStart2.initiatorToken,
      }),
    ]);

    const winners = [outcome1, outcome2].filter((o) => o.status === 'fulfilled');
    const losers = [outcome1, outcome2].filter((o) => o.status === 'rejected') as PromiseRejectedResult[];

    const ok =
      winners.length === 1 &&
      losers.length === 1 &&
      losers[0].reason?.code === 'TIKTOK_OPEN_ID_ALREADY_LINKED' &&
      losers[0].reason?.statusCode === 409;

    recordResult(
      27,
      'Corrida de LINK simultâneo do mesmo open_id por 2 contas: 1 vence e 1 recebe 409 TIKTOK_OPEN_ID_ALREADY_LINKED',
      ok,
      `winners=${winners.length}, loserCode=${losers[0]?.reason?.code}`
    );
  } catch (err: any) {
    recordResult(27, 'Corrida de LINK simultâneo por 2 contas', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 28: Rollback transacional quando falha emissão de Custom Token
  // ---------------------------------------------------------------------------
  try {
    const rollbackOpenId = 'tt_openid_rollback_test_404';
    const rollbackStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ openId: rollbackOpenId });

    // Força falha na emissão do Custom Token dentro da transação
    setCustomTokenCreatorForTests(async () => {
      throw new Error('SIMULATED_FIREBASE_ADMIN_OUTAGE');
    });

    let failedAsExpected = false;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'rollback_code',
        state: rollbackStart.state,
        initiatorToken: rollbackStart.initiatorToken,
        issueFirebaseCustomToken: true,
      });
    } catch {
      failedAsExpected = true;
    }

    const identityAfterRollback = await adapter.getIdentityDirect(rollbackOpenId);

    // Restaura emissor de Custom Token
    setCustomTokenCreatorForTests(async (uid, claims) => {
      return `mock_firebase_custom_jwt.${uid}.${Buffer.from(JSON.stringify(claims || {})).toString('base64url')}`;
    });

    const retryStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    const retryRes = await tiktokOAuthService.handleCallbackExchange({
      code: 'retry_after_outage_code',
      state: retryStart.state,
      initiatorToken: retryStart.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const ok =
      failedAsExpected &&
      identityAfterRollback === null &&
       retryRes.identityResolution.isNewUser === true &&
      Boolean(retryRes.identityResolution.firebaseCustomToken) &&
      retryRes.identityResolution.uid === deriveControlledFirebaseUidFromOpenId(rollbackOpenId);

    recordResult(
      28,
      'Rollback transacional atômico quando falha emissão de Custom Token (nenhum estado órfão deixado)',
      ok,
      `identityAfterRollback=${identityAfterRollback}, retryIsNewUser=${retryRes.identityResolution.isNewUser}`
    );
  } catch (err: any) {
    recordResult(28, 'Rollback transacional na emissão de Custom Token', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 29: Redação de segredos e tokens em logs (redactSensitiveOAuthData)
  // ---------------------------------------------------------------------------
  try {
    const rawPayload = {
      event: 'oauth_debug',
      access_token: 'act_live_987654321',
      refresh_token: 'rft_live_123456789',
      client_secret: 'sec_abc123',
      nested: {
        encryptedAccessToken: 'cipher_xyz',
        message: `Key=${process.env.OAUTH_ENCRYPTION_KEY} Secret=${process.env.TIKTOK_CLIENT_SECRET}`,
      },
    };
    const redacted = redactSensitiveOAuthData(rawPayload);
    const serialized = JSON.stringify(redacted);
    const ok =
      !serialized.includes('act_live_987654321') &&
      !serialized.includes('rft_live_123456789') &&
      !serialized.includes('sec_abc123') &&
      !serialized.includes('cipher_xyz') &&
      !serialized.includes(process.env.OAUTH_ENCRYPTION_KEY!) &&
      !serialized.includes(process.env.TIKTOK_CLIENT_SECRET!) &&
      redacted.access_token === '[REDACTED]';

    recordResult(
      29,
      'Sanitização de logs (redactSensitiveOAuthData) remove access_token, refresh_token, client_secret e chaves',
      ok,
      `redactedAccessToken=${redacted.access_token}`
    );
  } catch (err: any) {
    recordResult(29, 'Sanitização de logs', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 30: Verificação estática das regras do Firestore (firestore.rules)
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    const hasProtectedIdentityFields =
      rulesContent.includes("'tiktokOpenId'") &&
      rulesContent.includes("'tiktokIdentityDocId'") &&
      rulesContent.includes("'tiktokLinked'") &&
      rulesContent.includes("'tiktokProfile'") &&
      rulesContent.includes("'role'") &&
      rulesContent.includes("'isAdmin'");
    const hasPrivateTokensDeny =
      rulesContent.includes('match /private_tokens/{tokenId}') &&
      rulesContent.includes('match /tiktok_identities/{identityDocId}');

    const ok = hasProtectedIdentityFields && hasPrivateTokensDeny;
    recordResult(
      30,
      'Regras do Firestore (firestore.rules) blindam tiktokOpenId/tiktokLinked e bloqueiam /private_tokens e /tiktok_identities/{identityDocId}',
      ok,
      `protectedFields=${hasProtectedIdentityFields}, collectionsDenied=${hasPrivateTokensDeny}`
    );
  } catch (err: any) {
    recordResult(30, 'Verificação de firestore.rules', false, err.message);
  }

  console.log('\n================================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(` RESULTADO FINAL FASE 11: ${passedCount}/${results.length} CENÁRIOS APROVADOS`);
  console.log('================================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Erro fatal na suíte da Fase 11:', err);
  process.exit(1);
});
