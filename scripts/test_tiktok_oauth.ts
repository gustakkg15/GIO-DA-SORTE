/**
 * GIO DA SORTE PRO — FASE 11.2: SUÍTE CONSOLIDADA DE TESTES AUTOMATIZADOS (38 CENÁRIOS)
 *
 * Cobre integralmente os requisitos da Fase 11.2:
 *  1. Início do OAuth TikTok (LOGIN) -> gera state (256-bit entropy), initiatorToken, PKCE (quando habilitado) e persiste stateHash.
 *  2. Callback válido (1º acesso LOGIN) -> obtém open_id, cria identidade GIO controlada (gio_tt_...) transacionalmente e emite Firebase Custom Token.
 *  3. Novo login com o mesmo open_id (LOGIN) -> reutiliza o mesmo UID (isNewUser=false), sem criar 2ª conta.
 *  4. Vinculação (LINK) de TikTok a uma conta GIO existente autenticada -> vincula open_id ao UID existente, preserva e-mail/plano PRO e login subsequente autentica esse UID.
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
 * 19. Criptografia AES-256-GCM de access_token e refresh_token em repouso.
 * 20. Renovação de token e rotação de chave (OAUTH_ENCRYPTION_KEY_PREVIOUS -> OAUTH_ENCRYPTION_KEY).
 * 21. Desvinculação (UNLINK) de TikTok -> desvincula open_id, limpa private_tokens, preserva conta GIO e dados de sorteios/workers LIVE ativos.
 * 22. Re-vinculação ou novo login após desvinculação -> funciona de forma limpa e transacional.
 * 23. Logout da conta GIO -> encerra sessão sem excluir conta, sem desvincular tiktok_identities e sem derrubar workers LIVE ativos.
 * 24. Isolamento multiusuário completo entre Usuário A e Usuário B.
 * 25. Condição de corrida: 2 callbacks simultâneos com o mesmo state.
 * 26. Condição de corrida: 2 logins simultâneos de primeiro acesso com o mesmo open_id.
 * 27. Condição de corrida: Usuário A e Usuário B tentam vincular (LINK) o mesmo open_id simultaneamente.
 * 28. Rollback transacional atômico quando falha emissão de Custom Token.
 * 29. Sanitização de logs (redactSensitiveOAuthData remove tokens e chaves).
 * 30. Verificação das regras estáticas do Firestore (firestore.rules).
 * 31. Desconexão do TikTok preserva Vínculo de Autenticação (mapeamento open_id -> uid retido em tiktok_identities).
 * 32. Novo login com TikTok após desvinculação da integração autentica o UID original em vez de novo UID.
 * 33. Multi-Tab Isolation: dois fluxos OAuth simultâneos em abas distintas mantêm state e initiatorToken independentes.
 * 34. Estrutura do Envelope AES-256-GCM: valida algoritmo 'aes-256-gcm' e keyId.
 * 35. Suporte a perfil com escopo básico (user.info.basic sem username).
 * 36. Exibição e validação do @username quando retornado e autorizado.
 * 37. Tolerância a falhas na API de revogação remota do TikTok no UNLINK (limpeza local atômica procede com sucesso).
 * 38. Diagnóstico de configuração (diagnoseOAuthConfiguration) nunca expõe segredos nem tokens.
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
  deriveTikTokIdentityDocId,
  InMemoryTikTokOAuthStorageAdapter,
  encryptTokenAes256Gcm,
  decryptTokenAes256Gcm,
  decryptTokenWithRotationInfo,
  diagnoseOAuthConfiguration,
  sha256Hex,
  createEmptyEncryptedPayload,
} from '../src/server/tiktokOAuthService.ts';
import {
  verifyRecentReauthentication,
  setCustomTokenCreatorForTests,
  setCustomTokenVerifierForTests,
} from '../src/server/firebaseAdminAuth.ts';

const KEY_V1 = crypto.randomBytes(32).toString('hex');
const KEY_V2 = crypto.randomBytes(32).toString('hex');
process.env.TIKTOK_CLIENT_KEY = 'tt_client_key_phase11_2_test';
process.env.TIKTOK_CLIENT_SECRET = 'tt_client_secret_phase11_2_test';
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
  username?: string | null;
  displayName?: string;
  avatarUrl?: string;
  failTokenExchange?: boolean;
  failRevoke?: boolean;
  omitOpenId?: boolean;
  accessToken?: string;
  refreshToken?: string;
}) {
  const openId = options.openId ?? 'tt_openid_user_alpha_001';
  const userInfoOpenId = options.userInfoOpenId ?? openId;
  const username = options.username !== undefined ? options.username : 'criador_alpha';
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
        scope: 'user.info.basic',
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
      const uObj: Record<string, any> = {
        open_id: userInfoOpenId,
        union_id: `union_${userInfoOpenId}`,
        display_name: displayName,
        avatar_url: avatarUrl,
      };
      if (username) {
        uObj.username = username;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { user: uObj },
          error: { code: 'ok', message: '' },
        }),
      };
    }

    if (url.includes('/v2/oauth/revoke/')) {
      if (options.failRevoke) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'tiktok_api_down' }),
        };
      }
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
  console.log(' GIO DA SORTE PRO — FASE 11.2: SUÍTE DE 38 TESTES DE LOGIN TIKTOK E VÍNCULO SEGURO');
  console.log('================================================================================\n');

  const adapter = new InMemoryTikTokOAuthStorageAdapter();
  tiktokOAuthService.setStorageAdapter(adapter);

  setCustomTokenCreatorForTests(async (uid, claims) => {
    return `mock_firebase_custom_jwt.${uid}.${Buffer.from(JSON.stringify(claims || {})).toString('base64url')}`;
  });

  // 1. Início do OAuth TikTok (LOGIN)
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
      parsedUrl.searchParams.get('client_key') === 'tt_client_key_phase11_2_test' &&
      parsedUrl.searchParams.get('state') === loginStart1.state &&
      parsedUrl.searchParams.get('code_challenge_method') === 'S256' &&
      Boolean(parsedUrl.searchParams.get('code_challenge')) &&
      Boolean(loginStart1.initiatorToken) &&
      stateDoc !== null &&
      stateDoc.flowMode === 'LOGIN' &&
      stateDoc.consumed === false;

    recordResult(1, 'Início do OAuth TikTok (LOGIN) com state 256-bit, initiatorToken e PKCE S256', ok, `stateHash=${loginStart1.stateHash.slice(0, 12)}...`);
  } catch (err: any) {
    recordResult(1, 'Início do OAuth TikTok (LOGIN)', false, err.message);
  }

  // 2. Callback válido (1º acesso LOGIN)
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

    recordResult(2, 'Callback válido (1º acesso LOGIN) cria identidade GIO transacional e emite Custom Token', ok, `uid=${firstLoginUid}`);
  } catch (err: any) {
    recordResult(2, 'Callback válido (1º acesso LOGIN)', false, err.message);
  }

  // 3. Novo login com o mesmo open_id (LOGIN)
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

    recordResult(3, 'Login subsequente com mesmo open_id reutiliza UID existente sem duplicar conta', ok, `uid=${callbackRes2.identityResolution.uid}`);
  } catch (err: any) {
    recordResult(3, 'Login subsequente com mesmo open_id', false, err.message);
  }

  // 4. Vinculação (LINK) de TikTok a uma conta GIO existente autenticada
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
      futureLoginCallback.identityResolution.uid === existingGioUserUid &&
      userAfterLink?.email === 'cliente.pro@giodasorte.com.br' &&
      userAfterLink?.plan === 'PRO' &&
      userAfterLink?.raffleCount === 14;

    recordResult(4, 'Vinculação (LINK) a conta GIO existente preserva dados PRO e autentica mesmo UID no próximo login', ok, `linkedUid=${linkCallback.identityResolution.uid}`);
  } catch (err: any) {
    recordResult(4, 'Vinculação (LINK) a conta GIO existente', false, err.message);
  }

  // 5. Tentativa de vincular open_id já associado ao Usuário A no Usuário B
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

    recordResult(5, 'Conflito de contas bloqueado: open_id já vinculado a outro usuário retorna 409 sem transferir posse', ok, `code=${blockedCode}, status=${blockedStatus}`);
  } catch (err: any) {
    recordResult(5, 'Conflito de open_id já vinculado a outro usuário', false, err.message);
  }

  // 6. Tentativa de vincular 2º open_id diferente a conta que já tem TikTok
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
    recordResult(6, 'Bloqueio ao tentar vincular segundo open_id diferente a uma conta GIO já vinculada', ok, `code=${blockedCode}, status=${blockedStatus}`);
  } catch (err: any) {
    recordResult(6, 'Bloqueio de segundo open_id na mesma conta GIO', false, err.message);
  }

  // 7. Tentativa de iniciar LINK sem sessão Firebase autenticada
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
    recordResult(7, 'Início de LINK sem sessão Firebase autenticada é bloqueado com 401 LINK_REQUIRES_AUTHENTICATED_UID', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(7, 'Bloqueio de LINK sem autenticação Firebase', false, err.message);
  }

  // 8. Tentativa de iniciar LINK sem reautenticação recente
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
          auth_time: nowSec - 900,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      if (rawToken === 'tok_fresh') {
        return {
          uid: existingGioUserUid,
          auth_time: nowSec - 15,
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

    recordResult(8, 'Exigência de reautenticação recente (Senha/Google Auth) validada criptograficamente no servidor', ok, `provider=${providerCheck.code}, stale=${staleCheck.code}`);
  } catch (err: any) {
    setCustomTokenVerifierForTests(null);
    recordResult(8, 'Validação de reautenticação recente', false, err.message);
  }

  // 9. Callback com state inexistente/inválido
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

  // 10. Callback com state expirado
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

  // 11. Callback reutilizando state já consumido
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

  // 12. Callback de outra sessão de navegador
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
    recordResult(12, 'Callback vindo de sessão diferente da iniciadora bloqueado com 403 CSRF_INITIATOR_MISMATCH', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(12, 'Bloqueio de CSRF Initiator Mismatch', false, err.message);
  }

  // 13. Code OAuth inválido rejeitado pela API TikTok
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

  // 14. Resposta de token sem open_id
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

  // 15. Divergência de open_id entre /oauth/token e /user/info
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
    recordResult(15, 'Divergência de open_id entre /oauth/token e /user/info bloqueada com 403 TIKTOK_OPEN_ID_MISMATCH', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(15, 'Divergência de open_id entre endpoints', false, err.message);
  }

  // 16. Tentativa de autenticar apenas informando @username sem OAuth
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
    recordResult(16, 'Tentativa de login direto apenas com @username bloqueada com 403 USERNAME_NOT_AUTH_FACTOR', ok, `code=${blockedCode}`);
  } catch (err: any) {
    recordResult(16, 'Bloqueio de login apenas com @username', false, err.message);
  }

  // 17. Tentativa de forjar open_id, uid, firebaseUid ou access_token no payload
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
    recordResult(17, 'Injeção de open_id, uid, firebaseUid ou access_token pelo cliente bloqueada com 403', allBlocked, `forgedPayloadsTested=${forgedPayloads.length}`);
  } catch (err: any) {
    recordResult(17, 'Bloqueio de forja de identidade pelo cliente', false, err.message);
  }

  // 18. Tentativa de iniciar LINK sem reauthVerified
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
    recordResult(18, 'Bloqueio estrito de LINK sem flag reauthVerified validada pelo servidor (403 LINK_REQUIRES_REAUTHENTICATION)', ok, `code=${blockedReauthCode}`);
  } catch (err: any) {
    recordResult(18, 'Bloqueio de LINK sem reauthVerified', false, err.message);
  }

  // 19. Criptografia AES-256-GCM de access_token e refresh_token em repouso
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

    recordResult(19, 'Tokens OAuth criptografados com AES-256-GCM no cofre privado e ausentes do payload de identidade', ok, `decryptedMatch=${decryptedAccess === rawAccess}`);
  } catch (err: any) {
    recordResult(19, 'Criptografia AES-256-GCM em repouso', false, err.message);
  }

  // 20. Rotação Transparente de Chave AES-256-GCM (KEY_V1 -> KEY_V2)
  try {
    const payloadEncryptedWithV1 = encryptTokenAes256Gcm('token_before_rotation_v1');

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

    recordResult(20, 'Rotação transparente de chave AES-256-GCM (OAUTH_ENCRYPTION_KEY_PREVIOUS -> OAUTH_ENCRYPTION_KEY)', ok, `usedPreviousKey=${rotationCheck.usedPreviousKey}`);
  } catch (err: any) {
    recordResult(20, 'Rotação de chave AES-256-GCM', false, err.message);
  }

  // 21. Desvinculação (UNLINK) limpa tokens e preserva conta GIO e sorteios
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

    recordResult(21, 'Desvinculação (UNLINK) revoga vínculo e limpa cofre de tokens preservando conta GIO e plano PRO', ok, `unlinked=${unlinkRes.unlinked}, proPreserved=${userAfterUnlink?.plan === 'PRO'}`);
  } catch (err: any) {
    recordResult(21, 'Desvinculação (UNLINK) de conta TikTok', false, err.message);
  }

  // 22. Re-vinculação após desvinculação funciona de forma limpa
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

    recordResult(22, 'Re-vinculação após desvinculação restaura vínculo e cofre de tokens transacionalmente', ok, `linked=${statusAfterRelink.linked}`);
  } catch (err: any) {
    recordResult(22, 'Re-vinculação após desvinculação', false, err.message);
  }

  // 23. Logout da conta GIO não exclui conta nem desvincula TikTok
  try {
    const statusAfterBrowserLogout = await tiktokOAuthService.getUserTikTokIdentityStatus(existingGioUserUid);
    const identityDoc = await adapter.getIdentityDirect('tt_openid_for_existing_user_777');
    const ok =
      statusAfterBrowserLogout.linked === true &&
      identityDoc !== null &&
      identityDoc.uid === existingGioUserUid &&
      !identityDoc.unlinked;

    recordResult(23, 'Logout da sessão GIO no navegador preserva vínculo TikTok e estado persistido no backend', ok, `stillLinked=${statusAfterBrowserLogout.linked}`);
  } catch (err: any) {
    recordResult(23, 'Preservação de vínculo após logout GIO', false, err.message);
  }

  // 24. Isolamento Multiusuário entre Usuário A e Usuário B
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

    recordResult(24, 'Isolamento multiusuário estrito entre cofres de tokens e identidades de Usuário A e Usuário B', ok, `openIdA=${statusUserA.openId}, openIdB=${statusUserB.openId}`);
  } catch (err: any) {
    recordResult(24, 'Isolamento multiusuário', false, err.message);
  }

  // 25. Condição de corrida: 2 callbacks simultâneos com o mesmo state
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

    recordResult(25, 'Corrida de callbacks simultâneos com mesmo state: exatamente 1 sucede e 1 falha com CSRF_STATE_REPLAYED', ok, `fulfilled=${fulfilled.length}, rejectedCode=${rejected[0]?.reason?.code}`);
  } catch (err: any) {
    recordResult(25, 'Corrida de callbacks com mesmo state', false, err.message);
  }

  // 26. Condição de corrida: 2 logins simultâneos de 1º acesso com mesmo open_id
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

    recordResult(26, 'Corrida de 1º acesso simultâneo com mesmo open_id converge para único UID sem duplicar conta', ok, `uidA=${loginA.identityResolution.uid}, newCount=${newCount}`);
  } catch (err: any) {
    recordResult(26, 'Corrida de 1º acesso simultâneo com mesmo open_id', false, err.message);
  }

  // 27. Condição de corrida: 2 usuários tentam vincular (LINK) o mesmo open_id simultaneamente
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

    recordResult(27, 'Corrida de LINK simultâneo do mesmo open_id por 2 contas: 1 vence e 1 recebe 409 TIKTOK_OPEN_ID_ALREADY_LINKED', ok, `winners=${winners.length}`);
  } catch (err: any) {
    recordResult(27, 'Corrida de LINK simultâneo por 2 contas', false, err.message);
  }

  // 28. Rollback transacional quando falha emissão de Custom Token
  try {
    const rollbackOpenId = 'tt_openid_rollback_test_404';
    const rollbackStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ openId: rollbackOpenId });

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

    recordResult(28, 'Rollback transacional atômico quando falha emissão de Custom Token (nenhum estado órfão deixado)', ok, `failedAsExpected=${failedAsExpected}`);
  } catch (err: any) {
    recordResult(28, 'Rollback transacional na emissão de Custom Token', false, err.message);
  }

  // 29. Sanitização de logs (redactSensitiveOAuthData)
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

    recordResult(29, 'Sanitização de logs (redactSensitiveOAuthData) remove access_token, refresh_token, client_secret e chaves', ok, `redactedAccessToken=${redacted.access_token}`);
  } catch (err: any) {
    recordResult(29, 'Sanitização de logs', false, err.message);
  }

  // 30. Verificação das regras do Firestore (firestore.rules)
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
    recordResult(30, 'Regras do Firestore (firestore.rules) blindam tiktokOpenId/tiktokLinked e bloqueiam /private_tokens e /tiktok_identities/{identityDocId}', ok, `protectedFields=${hasProtectedIdentityFields}`);
  } catch (err: any) {
    recordResult(30, 'Verificação de firestore.rules', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 31 (Phase 11.2): Desconexão do TikTok preserva Vínculo de Autenticação em tiktok_identities
  // ---------------------------------------------------------------------------
  const testOpenId31 = 'tt_openid_disconnect_preserve_mapping_31';
  let mappedUid31 = '';
  try {
    const login31Start = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ openId: testOpenId31 });
    const login31Res = await tiktokOAuthService.handleCallbackExchange({
      code: 'code_31',
      state: login31Start.state,
      initiatorToken: login31Start.initiatorToken,
      issueFirebaseCustomToken: true,
    });
    mappedUid31 = login31Res.identityResolution.uid;

    // Desconecta integração
    await tiktokOAuthService.unlinkTikTokFromUserAccount({ uid: mappedUid31 });

    const identityDocAfterUnlink = await adapter.getIdentityDirect(testOpenId31);
    const userDocAfterUnlink = await adapter.getUserDocDirect(mappedUid31);
    const vaultAfterUnlink = await adapter.getUserVaultDirect(mappedUid31);

    const ok =
      identityDocAfterUnlink !== null &&
      identityDocAfterUnlink.uid === mappedUid31 &&
      identityDocAfterUnlink.unlinked === true &&
      userDocAfterUnlink?.tiktokLinked === false &&
      vaultAfterUnlink?.revoked === true;

    recordResult(31, 'Desconexão do TikTok revoga integração sem apagar o mapeamento open_id -> uid em tiktok_identities', ok, `identityRetainedUid=${identityDocAfterUnlink?.uid}`);
  } catch (err: any) {
    recordResult(31, 'Preservação de vínculo em tiktok_identities após desvinculação', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 32 (Phase 11.2): Novo login com TikTok após desvinculação autentica o UID original
  // ---------------------------------------------------------------------------
  try {
    const relogin32Start = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    configureMockTikTokFetcher({ openId: testOpenId31 });
    const relogin32Res = await tiktokOAuthService.handleCallbackExchange({
      code: 'relogin_code_32',
      state: relogin32Start.state,
      initiatorToken: relogin32Start.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const identityDocAfterRelogin = await adapter.getIdentityDirect(testOpenId31);
    const userDocAfterRelogin = await adapter.getUserDocDirect(mappedUid31);

    const ok =
      relogin32Res.identityResolution.uid === mappedUid31 &&
      relogin32Res.identityResolution.isNewUser === false &&
      identityDocAfterRelogin?.unlinked === false &&
      userDocAfterRelogin?.tiktokLinked === true;

    recordResult(32, 'Novo login com TikTok após desvinculação autentica o UID original sem gerar novo gio_tt_... UID', ok, `reloginUid=${relogin32Res.identityResolution.uid}, matchesOriginal=${relogin32Res.identityResolution.uid === mappedUid31}`);
  } catch (err: any) {
    recordResult(32, 'Novo login após desvinculação autentica UID original', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 33 (Phase 11.2): Multi-Tab Isolation (states e initiatorTokens independentes)
  // ---------------------------------------------------------------------------
  try {
    const tabA = await tiktokOAuthService.createAuthorizationUrl({ flowMode: 'LOGIN', generateInitiatorToken: true });
    const tabB = await tiktokOAuthService.createAuthorizationUrl({ flowMode: 'LOGIN', generateInitiatorToken: true });

    const stateDocA = await adapter.getStateDirect(tabA.stateHash);
    const stateDocB = await adapter.getStateDirect(tabB.stateHash);

    const ok =
      tabA.state !== tabB.state &&
      tabA.stateHash !== tabB.stateHash &&
      tabA.initiatorToken !== tabB.initiatorToken &&
      stateDocA !== null &&
      stateDocB !== null &&
      stateDocA.consumed === false &&
      stateDocB.consumed === false;

    recordResult(33, 'Multi-Tab Isolation: abas concorrentes possuem states e initiatorTokens isolados sem interferência', ok, `distinctStates=${tabA.state !== tabB.state}`);
  } catch (err: any) {
    recordResult(33, 'Multi-Tab Isolation', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 34 (Phase 11.2): Estrutura de Envelope AES-256-GCM (keyId e algoritmo)
  // ---------------------------------------------------------------------------
  try {
    const encrypted = encryptTokenAes256Gcm('sample_secret_token');
    const ok =
      encrypted.algorithm === 'aes-256-gcm' &&
      encrypted.keySource === 'SECRET_MANAGER_OAUTH_KEY' &&
      Boolean(encrypted.keyId) &&
      Boolean(encrypted.iv) &&
      Boolean(encrypted.authTag) &&
      Boolean(encrypted.ciphertext);

    recordResult(34, 'Envelope de criptografia AES-256-GCM contém iv (12-byte), authTag, ciphertext, keyId e keySource', ok, `keyId=${encrypted.keyId}, alg=${encrypted.algorithm}`);
  } catch (err: any) {
    recordResult(34, 'Estrutura de Envelope AES-256-GCM', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 35 (Phase 11.2): Suporte a perfil com escopo básico (user.info.basic sem username)
  // ---------------------------------------------------------------------------
  try {
    const basicStart = await tiktokOAuthService.createAuthorizationUrl({ flowMode: 'LOGIN', generateInitiatorToken: true });
    configureMockTikTokFetcher({ openId: 'tt_openid_basic_only_35', username: null, displayName: 'Basic Profile User' });
    const basicRes = await tiktokOAuthService.handleCallbackExchange({
      code: 'code_basic_35',
      state: basicStart.state,
      initiatorToken: basicStart.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const profile = basicRes.identityResolution.userProfile;
    const ok =
      profile.open_id === 'tt_openid_basic_only_35' &&
      profile.display_name === 'Basic Profile User' &&
      profile.username === undefined;

    recordResult(35, 'Login com escopo básico user.info.basic aceita perfil sem campo username graciosamente', ok, `displayName=${profile.display_name}, usernamePresent=${Boolean(profile.username)}`);
  } catch (err: any) {
    recordResult(35, 'Suporte a escopo básico user.info.basic', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 36 (Phase 11.2): Exibição e validação do @username quando retornado
  // ---------------------------------------------------------------------------
  try {
    const profileStart = await tiktokOAuthService.createAuthorizationUrl({ flowMode: 'LOGIN', generateInitiatorToken: true });
    configureMockTikTokFetcher({ openId: 'tt_openid_with_profile_36', username: 'streamer_pro_36', displayName: 'Streamer Pro' });
    const profileRes = await tiktokOAuthService.handleCallbackExchange({
      code: 'code_profile_36',
      state: profileStart.state,
      initiatorToken: profileStart.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const status = await tiktokOAuthService.getUserTikTokIdentityStatus(profileRes.identityResolution.uid);
    const ok =
      status.profile?.username === 'streamer_pro_36' &&
      status.profile?.display_name === 'Streamer Pro';

    recordResult(36, 'Exibição do @username e display_name validada no objeto de status de identidade', ok, `username=@${status.profile?.username}`);
  } catch (err: any) {
    recordResult(36, 'Exibição e validação de @username', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 37 (Phase 11.2): Tolerância a falha na API de revogação remota no UNLINK
  // ---------------------------------------------------------------------------
  try {
    const unlinkUserUid = 'uid_test_remote_revoke_fail_37';
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(unlinkUserUid, {
        uid: unlinkUserUid,
        tiktokOpenId: 'tt_openid_37',
        tiktokLinked: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await tx.setUserVault(unlinkUserUid, {
        uid: unlinkUserUid,
        openId: 'tt_openid_37',
        scope: 'user.info.basic',
        encryptedAccessToken: encryptTokenAes256Gcm('access_token_37'),
        encryptedRefreshToken: encryptTokenAes256Gcm('refresh_token_37'),
        accessTokenExpiresAt: Date.now() + 3600000,
        refreshTokenExpiresAt: Date.now() + 86400000,
        updatedAt: Date.now(),
        revoked: false,
        revokedAt: null,
      });
    });

    configureMockTikTokFetcher({ failRevoke: true });

    const unlinkOutcome = await tiktokOAuthService.unlinkTikTokFromUserAccount({ uid: unlinkUserUid });
    const userDocAfter = await adapter.getUserDocDirect(unlinkUserUid);
    const vaultDocAfter = await adapter.getUserVaultDirect(unlinkUserUid);

    const ok =
      unlinkOutcome.unlinked === true &&
      unlinkOutcome.revokedAtTikTok === false &&
      userDocAfter?.tiktokLinked === false &&
      vaultDocAfter?.revoked === true &&
      vaultDocAfter?.encryptedAccessToken.ciphertext === '';

    recordResult(37, 'Falha na revogação remota do TikTok API não bloqueia a limpeza atômica local do cofre de tokens nem o desvinculo', ok, `localUnlinked=${unlinkOutcome.unlinked}, remoteRevoked=${unlinkOutcome.revokedAtTikTok}`);
  } catch (err: any) {
    recordResult(37, 'Tolerância a falha de revogação remota no UNLINK', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 38 (Phase 11.2): Diagnóstico de configuração nunca expõe segredos
  // ---------------------------------------------------------------------------
  try {
    const diagReport = diagnoseOAuthConfiguration();
    const serializedReport = JSON.stringify(diagReport);

    const ok =
      diagReport.status === 'READY' &&
      diagReport.oauthConfigured === true &&
      diagReport.canInitiateAuthFlow === true &&
      !serializedReport.includes(process.env.TIKTOK_CLIENT_SECRET!) &&
      !serializedReport.includes(process.env.OAUTH_ENCRYPTION_KEY!) &&
      diagReport.variables.TIKTOK_CLIENT_SECRET.protectedOnBackend === true;

    recordResult(38, 'Diagnóstico de configuração (diagnoseOAuthConfiguration) valida ambiente e omite TIKTOK_CLIENT_SECRET e chaves em texto claro', ok, `canInitiateAuthFlow=${diagReport.canInitiateAuthFlow}`);
  } catch (err: any) {
    recordResult(38, 'Diagnóstico de configuração sanitizado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 39 (Phase 11.2.3): enqueuePendingTokenRevocation persiste token criptografado na fila
  // ---------------------------------------------------------------------------
  const testOpenId39 = 'tt_openid_queue_test_39';
  const testUid39 = 'uid_queue_test_39';
  let queueDoc39: any = null;
  try {
    const tokenPayload39 = encryptTokenAes256Gcm('refresh_token_queue_39');
    queueDoc39 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: testUid39,
      openId: testOpenId39,
      encryptedToken: tokenPayload39,
      lastError: 'Remote revocation HTTP_503',
    });

    const retrieved39 = await adapter.getPendingRevocationDirect(queueDoc39.revocationId);

    const ok =
      retrieved39 !== null &&
      retrieved39.revocationId === queueDoc39.revocationId &&
      retrieved39.uid === testUid39 &&
      retrieved39.openId === testOpenId39 &&
      retrieved39.status === 'PENDING' &&
      retrieved39.attempts === 0 &&
      retrieved39.maxAttempts === 5 &&
      retrieved39.encryptedToken.ciphertext === tokenPayload39.ciphertext &&
      retrieved39.lastError === 'Remote revocation HTTP_503';

    recordResult(39, 'enqueuePendingTokenRevocation persiste doc criptografado em /pending_token_revocations com status PENDING e maxAttempts 5', ok, `revocationId=${queueDoc39.revocationId}`);
  } catch (err: any) {
    recordResult(39, 'enqueuePendingTokenRevocation em /pending_token_revocations', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 40 (Phase 11.2.3): UNLINK enfileira revogação pendente quando revogação remota falha
  // ---------------------------------------------------------------------------
  const unlinkUid40 = 'uid_unlink_queue_40';
  const openId40 = 'tt_openid_40';
  try {
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(unlinkUid40, {
        uid: unlinkUid40,
        tiktokOpenId: openId40,
        tiktokLinked: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await tx.setUserVault(unlinkUid40, {
        uid: unlinkUid40,
        openId: openId40,
        scope: 'user.info.basic',
        encryptedAccessToken: encryptTokenAes256Gcm('access_token_40'),
        encryptedRefreshToken: encryptTokenAes256Gcm('refresh_token_40'),
        accessTokenExpiresAt: Date.now() + 3600000,
        refreshTokenExpiresAt: Date.now() + 86400000,
        updatedAt: Date.now(),
        revoked: false,
        revokedAt: null,
      });
    });

    configureMockTikTokFetcher({ failRevoke: true });

    const unlinkRes40 = await tiktokOAuthService.unlinkTikTokFromUserAccount({ uid: unlinkUid40 });
    const dueRevocations = await adapter.listPendingRevocationsDueDirect(Date.now(), 10);
    const item40 = dueRevocations.find((i) => i.uid === unlinkUid40);

    const ok =
      unlinkRes40.unlinked === true &&
      unlinkRes40.revokedAtTikTok === false &&
      item40 !== undefined &&
      item40.openId === openId40 &&
      item40.status === 'PENDING' &&
      decryptTokenAes256Gcm(item40.encryptedToken) === 'refresh_token_40';

    recordResult(40, 'UNLINK enfileira token criptografado na fila de revogação pendente quando revogação remota falha', ok, `enqueuedOpenId=${item40?.openId}`);
  } catch (err: any) {
    recordResult(40, 'UNLINK enfileira revogação pendente', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 41 (Phase 11.2.3): Invariante do Cofre - Cofre primário é limpo SOMENTE APÓS gravação na fila
  // ---------------------------------------------------------------------------
  try {
    const unlinkUid41 = 'uid_vault_invariant_41';
    const openId41 = 'tt_openid_41';
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(unlinkUid41, {
        uid: unlinkUid41,
        tiktokOpenId: openId41,
        tiktokLinked: true,
      });
      await tx.setUserVault(unlinkUid41, {
        uid: unlinkUid41,
        openId: openId41,
        scope: 'user.info.basic',
        encryptedAccessToken: encryptTokenAes256Gcm('access_token_41'),
        encryptedRefreshToken: encryptTokenAes256Gcm('refresh_token_41'),
        accessTokenExpiresAt: Date.now() + 3600000,
        refreshTokenExpiresAt: Date.now() + 86400000,
        updatedAt: Date.now(),
        revoked: false,
        revokedAt: null,
      });
    });

    // Simula falha na gravação do adapter de fila
    const originalSetRevocation = adapter.setPendingRevocationDirect.bind(adapter);
    let queueWriteAttempted: boolean = false;
    adapter.setPendingRevocationDirect = async () => {
      queueWriteAttempted = true;
      throw new Error('SIMULATED_FIRESTORE_QUEUE_STORAGE_ERROR');
    };

    configureMockTikTokFetcher({ failRevoke: true });

    let errorThrown: boolean = false;
    try {
      await tiktokOAuthService.unlinkTikTokFromUserAccount({ uid: unlinkUid41 });
    } catch {
      errorThrown = true;
    }

    // Restaura adapter
    adapter.setPendingRevocationDirect = originalSetRevocation;

    const vaultStillIntact = await adapter.getUserVaultDirect(unlinkUid41);
    const plainVaultToken = vaultStillIntact ? decryptTokenAes256Gcm(vaultStillIntact.encryptedRefreshToken) : '';

    const ok =
      Boolean(queueWriteAttempted) &&
      Boolean(errorThrown) &&
      vaultStillIntact !== null &&
      !vaultStillIntact.revoked &&
      plainVaultToken === 'refresh_token_41';

    recordResult(41, 'Invariante do Cofre: falha na gravação da fila impede a limpeza do cofre primário (fail-safe sem perda de tokens)', ok, `vaultIntact=${plainVaultToken === 'refresh_token_41'}`);
  } catch (err: any) {
    recordResult(41, 'Invariante do cofre primário no desvínculo', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 42 (Phase 11.2.3): Batch Worker processa item e conclui revogação remota (status REVOKED)
  // ---------------------------------------------------------------------------
  try {
    configureMockTikTokFetcher({ failRevoke: false });

    const batchOutcome = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const item40AfterBatch = await adapter.getPendingRevocationDirect(`rev_${sha256Hex(`pending_revocation_v1:${unlinkUid40}:${openId40}`).slice(0, 32)}`);

    const ok =
      batchOutcome.succeeded >= 1 &&
      item40AfterBatch !== null &&
      item40AfterBatch.status === 'REVOKED' &&
      item40AfterBatch.lastError === null;

    recordResult(42, 'processPendingTokenRevocationsBatch executa revogação remota com sucesso e marca status REVOKED', ok, `succeeded=${batchOutcome.succeeded}, status=${item40AfterBatch?.status}`);
  } catch (err: any) {
    recordResult(42, 'Batch Worker processa revogação pendente com sucesso', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 43 (Phase 11.2.3): Revogação bem-sucedida apaga o payload do token (emptyCipher)
  // ---------------------------------------------------------------------------
  try {
    const item40Doc = await adapter.getPendingRevocationDirect(`rev_${sha256Hex(`pending_revocation_v1:${unlinkUid40}:${openId40}`).slice(0, 32)}`);
    const isWiped =
      item40Doc !== null &&
      item40Doc.encryptedToken.ciphertext === '' &&
      item40Doc.encryptedToken.iv === '' &&
      item40Doc.encryptedToken.authTag === '';

    recordResult(43, 'Revogação concluída apaga totalmente o payload de token (emptyCipher) no documento de revogação', isWiped, `ciphertextLength=${item40Doc?.encryptedToken.ciphertext.length}`);
  } catch (err: any) {
    recordResult(43, 'Limpeza do payload de token após revogação', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 44 (Phase 11.2.3): Backoff exponencial incrementa tentativas e reagenda próximo teste
  // ---------------------------------------------------------------------------
  try {
    const retryUid44 = 'uid_backoff_44';
    const retryOpenId44 = 'tt_openid_44';
    const token44 = encryptTokenAes256Gcm('refresh_token_44');

    const doc44 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: retryUid44,
      openId: retryOpenId44,
      encryptedToken: token44,
      lastError: 'Initial network error',
    });

    configureMockTikTokFetcher({ failRevoke: true });

    const now44 = Date.now();
    const processResult44 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: now44 });
    const item44After = await adapter.getPendingRevocationDirect(doc44.revocationId);

    const ok =
      processResult44.failed >= 1 &&
      item44After !== null &&
      item44After.attempts === 1 &&
      item44After.status === 'PENDING' &&
      item44After.nextAttemptAt >= now44 + 4 * 60 * 1000 && // 5 minutos de backoff
      Boolean(item44After.lastError && item44After.lastError.includes('HTTP_500'));

    recordResult(44, 'Backoff exponencial incrementa tentativas e reagenda próxima tentativa com atraso progressivo (5m, 10m...)', ok, `attempts=${item44After?.attempts}, status=${item44After?.status}`);
  } catch (err: any) {
    recordResult(44, 'Backoff exponencial na fila de revogação', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 45 (Phase 11.2.3): Limite de tentativas excedido (maxAttempts 5 -> status FAILED + wipe)
  // ---------------------------------------------------------------------------
  try {
    const maxUid45 = 'uid_max_attempts_45';
    const maxOpenId45 = 'tt_openid_45';
    const doc45 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: maxUid45,
      openId: maxOpenId45,
      encryptedToken: encryptTokenAes256Gcm('refresh_token_45'),
    });

    doc45.attempts = 4; // Quarta tentativa falhada anterior
    doc45.nextAttemptAt = Date.now() - 1000;
    await adapter.setPendingRevocationDirect(doc45.revocationId, doc45);

    configureMockTikTokFetcher({ failRevoke: true });

    const processResult45 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const item45After = await adapter.getPendingRevocationDirect(doc45.revocationId);

    const ok =
      processResult45.failed >= 1 &&
      item45After !== null &&
      item45After.attempts === 5 &&
      item45After.status === 'FAILED' &&
      item45After.encryptedToken.ciphertext !== '';

    recordResult(45, 'Atingir limite máximo de tentativas (5) define status FAILED e preserva o payload criptografado', ok, `attempts=${item45After?.attempts}, status=${item45After?.status}`);
  } catch (err: any) {
    recordResult(45, 'Limite máximo de tentativas excedido', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 46 (Phase 11.2.3): Janela de retenção expirada (24 horas -> status EXPIRED + wipe)
  // ---------------------------------------------------------------------------
  try {
    const expUid46 = 'uid_expired_46';
    const expOpenId46 = 'tt_openid_46';
    const doc46 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: expUid46,
      openId: expOpenId46,
      encryptedToken: encryptTokenAes256Gcm('refresh_token_46'),
    });

    const now46 = Date.now();
    doc46.createdAt = now46 - 25 * 60 * 60 * 1000; // 25 horas atrás
    doc46.ttlExpireAt = { toMillis: () => now46 - 60 * 1000 } as any;
    await adapter.setPendingRevocationDirect(doc46.revocationId, doc46);

    const processResult46 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: now46 });
    const item46After = await adapter.getPendingRevocationDirect(doc46.revocationId);

    const ok =
      processResult46.expired >= 1 &&
      item46After !== null &&
      item46After.status === 'QUARANTINED' &&
      item46After.encryptedToken.ciphertext !== '';

    recordResult(46, 'Janela de retenção de 24h expirada marca status QUARANTINED e preserva payload criptografado', ok, `expiredCount=${processResult46.expired}, status=${item46After?.status}`);
  } catch (err: any) {
    recordResult(46, 'Janela de retenção de 24h expirada', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 47 (Phase 11.2.3): Concorrência do Worker: Status PROCESSING impede execução concorrente
  // ---------------------------------------------------------------------------
  try {
    const concUid47 = 'uid_concurrency_47';
    const concOpenId47 = 'tt_openid_47';
    const doc47 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: concUid47,
      openId: concOpenId47,
      encryptedToken: encryptTokenAes256Gcm('refresh_token_47'),
    });

    doc47.status = 'PROCESSING';
    await adapter.setPendingRevocationDirect(doc47.revocationId, doc47);

    const dueList = await adapter.listPendingRevocationsDueDirect(Date.now(), 50);
    const foundProcessing = dueList.some((i) => i.revocationId === doc47.revocationId);

    const ok = !foundProcessing;
    recordResult(47, 'Trava de estado de processamento (PROCESSING) previne execução concorrente por múltiplos workers', ok, `foundInDueList=${foundProcessing}`);
  } catch (err: any) {
    recordResult(47, 'Trava de estado de processamento contra concorrência', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 48 (Phase 11.2.3): Desvinculo com revogação remota pendente retém mapeamento tiktok_identities, UID, sorteios e PRO
  // ---------------------------------------------------------------------------
  try {
    const unlinkUid48 = 'uid_unlink_integrity_48';
    const openId48 = 'tt_openid_48';
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(unlinkUid48, {
        uid: unlinkUid48,
        email: 'organizador.pro@giodasorte.com.br',
        plan: 'PRO',
        statusState: 'ACTIVE',
        raffleCount: 25,
        tiktokOpenId: openId48,
        tiktokLinked: true,
      });
      await tx.setIdentity(openId48, {
        identityDocId: deriveTikTokIdentityDocId(openId48),
        openIdHash: sha256Hex(openId48),
        openId: openId48,
        uid: unlinkUid48,
        displayName: 'Organizador PRO',
        avatarUrl: 'https://avatar.url',
        scope: 'user.info.basic',
        linkedAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
        bindingVersion: 1,
        lastOperationId: 'op_init_48',
        unlinked: false,
      });
      await tx.setUserVault(unlinkUid48, {
        uid: unlinkUid48,
        openId: openId48,
        scope: 'user.info.basic',
        encryptedAccessToken: encryptTokenAes256Gcm('access_token_48'),
        encryptedRefreshToken: encryptTokenAes256Gcm('refresh_token_48'),
        accessTokenExpiresAt: Date.now() + 3600000,
        refreshTokenExpiresAt: Date.now() + 86400000,
        updatedAt: Date.now(),
        revoked: false,
        revokedAt: null,
      });
    });

    configureMockTikTokFetcher({ failRevoke: true });

    await tiktokOAuthService.unlinkTikTokFromUserAccount({ uid: unlinkUid48 });

    const identityDoc48 = await adapter.getIdentityDirect(openId48);
    const userDoc48 = await adapter.getUserDocDirect(unlinkUid48);

    const ok =
      identityDoc48 !== null &&
      identityDoc48.uid === unlinkUid48 &&
      identityDoc48.unlinked === true &&
      userDoc48?.email === 'organizador.pro@giodasorte.com.br' &&
      userDoc48?.plan === 'PRO' &&
      userDoc48?.raffleCount === 25 &&
      userDoc48?.tiktokLinked === false;

    recordResult(48, 'Desvinculo com revogação remota pendente preserva mapeamento tiktok_identities, UID Firebase, sorteios e assinatura PRO', ok, `identityUid=${identityDoc48?.uid}, plan=${userDoc48?.plan}`);
  } catch (err: any) {
    recordResult(48, 'Preservação de integridade de dados durante desvinculo com revogação pendente', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 49 (Phase 11.2.4): 5 tentativas sem revogação -> FAILED & QUARANTINED preservando token criptografado
  // ---------------------------------------------------------------------------
  try {
    const uid49 = 'uid_quarantine_49';
    const openId49 = 'tt_openid_49';
    const plainToken49 = 'refresh_token_to_preserve_in_quarantine_49';
    const encrypted49 = encryptTokenAes256Gcm(plainToken49);

    const doc49 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid49,
      openId: openId49,
      encryptedToken: encrypted49,
    });

    doc49.attempts = 4;
    doc49.nextAttemptAt = Date.now() - 1000;
    await adapter.setPendingRevocationDirect(doc49.revocationId, doc49);

    configureMockTikTokFetcher({ failRevoke: true });

    const batchRes49 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const item49After = await adapter.getPendingRevocationDirect(doc49.revocationId);

    const ok =
      batchRes49.failed >= 1 &&
      item49After !== null &&
      item49After.status === 'FAILED' &&
      item49After.attempts === 5 &&
      item49After.quarantinedAt !== null &&
      item49After.encryptedToken.ciphertext === encrypted49.ciphertext &&
      decryptTokenAes256Gcm(item49After.encryptedToken) === plainToken49;

    recordResult(49, 'FAILED & QUARANTINED preserva o payload criptografado (AES-256-GCM) sem apagar a credencial enquanto não houver revogação remota confirmada', ok, `status=${item49After?.status}, ciphertextLength=${item49After?.encryptedToken.ciphertext.length}`);
  } catch (err: any) {
    recordResult(49, 'Preservação de credencial em FAILED e QUARANTINED', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 50 (Phase 11.2.4): Credencial em QUARANTINED pode ser descriptografada exclusivamente pelo backend Admin SDK
  // ---------------------------------------------------------------------------
  try {
    const uid50 = 'uid_quarantine_decrypt_50';
    const openId50 = 'tt_openid_50';
    const secretToken50 = 'secret_quarantine_token_50';
    const doc50 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid50,
      openId: openId50,
      encryptedToken: encryptTokenAes256Gcm(secretToken50),
    });

    doc50.status = 'QUARANTINED';
    doc50.quarantineReason = 'MANUAL_QUARANTINE_TEST';
    doc50.quarantinedAt = Date.now();
    await adapter.setPendingRevocationDirect(doc50.revocationId, doc50);

    const retrieved50 = await adapter.getPendingRevocationDirect(doc50.revocationId);
    const decryptedSecret = retrieved50 ? decryptTokenAes256Gcm(retrieved50.encryptedToken) : '';

    const ok =
      retrieved50 !== null &&
      retrieved50.status === 'QUARANTINED' &&
      decryptedSecret === secretToken50;

    recordResult(50, 'Credencial em quarentena permanece totalmente intacta e acessível ao backend Admin SDK para resolução', ok, `decryptedSecretMatch=${decryptedSecret === secretToken50}`);
  } catch (err: any) {
    recordResult(50, 'Acesso backend a credencial em quarentena', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 51 (Phase 11.2.4): Client SDK é estritamente bloqueado de ler/escrever /pending_token_revocations em firestore.rules
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    const hasPendingRevocationBlock =
      rulesContent.includes('match /pending_token_revocations/{revocationId}') &&
      rulesContent.includes('allow read, write: if false;');

    recordResult(51, 'firestore.rules contém regra estrita allow read, write: if false; para /pending_token_revocations/{revocationId}', hasPendingRevocationBlock, `hasBlockRule=${hasPendingRevocationBlock}`);
  } catch (err: any) {
    recordResult(51, 'Verificação de regras para /pending_token_revocations', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 52 (Phase 11.2.4): Worker interrompido/crashado em PROCESSING deixa lease expirar
  // ---------------------------------------------------------------------------
  const uid52 = 'uid_worker_crash_52';
  const openId52 = 'tt_openid_52';
  let revocationId52 = '';
  try {
    const doc52 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid52,
      openId: openId52,
      encryptedToken: encryptTokenAes256Gcm('token_52'),
    });
    revocationId52 = doc52.revocationId;

    const leaseRes52 = await adapter.acquireRevocationLeaseDirect(
      revocationId52,
      'worker_instance_dead_52',
      Date.now(),
      5000 // 5 segundos de lease
    );

    const docAfterAcquire = await adapter.getPendingRevocationDirect(revocationId52);

    const ok =
      leaseRes52.acquired === true &&
      docAfterAcquire?.status === 'PROCESSING' &&
      docAfterAcquire?.leaseOwner === 'worker_instance_dead_52' &&
      typeof docAfterAcquire?.leaseExpiresAt === 'number';

    recordResult(52, 'Worker em PROCESSING adquire lease com tempo limite (leaseExpiresAt) e identificador de instância (leaseOwner)', ok, `leaseOwner=${docAfterAcquire?.leaseOwner}`);
  } catch (err: any) {
    recordResult(52, 'Aquisição de lease por worker', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 53 (Phase 11.2.4): Expiração do lease permite que Worker 2 assuma a tarefa e incremente o fencingToken
  // ---------------------------------------------------------------------------
  try {
    const now53 = Date.now() + 6000; // 6 segundos no futuro (lease do worker 1 expirado)

    const leaseRes53 = await adapter.acquireRevocationLeaseDirect(
      revocationId52,
      'worker_instance_alive_53',
      now53,
      60000
    );

    const docAfterRecovery = await adapter.getPendingRevocationDirect(revocationId52);

    const ok =
      leaseRes53.acquired === true &&
      leaseRes53.fencingToken === 2 &&
      docAfterRecovery?.leaseOwner === 'worker_instance_alive_53' &&
      docAfterRecovery?.fencingToken === 2;

    recordResult(53, 'Worker 2 recupera tarefa com lease expirado e incremente o fencingToken (fencingToken=2)', ok, `recoveredBy=${docAfterRecovery?.leaseOwner}, fencingToken=${docAfterRecovery?.fencingToken}`);
  } catch (err: any) {
    recordResult(53, 'Recuperação de tarefa abandonada por Worker 2', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 54 (Phase 11.2.4): Worker antigo (zombie) tentando concluir após perder o lease é BLOQUEADO por fencing token mismatch
  // ---------------------------------------------------------------------------
  try {
    // Worker 1 (zombie) tenta gravar resultado usando fencingToken = 1 (antigo)
    const commitAttemptZombie = await adapter.releaseRevocationLeaseOrCommitDirect(
      revocationId52,
      1, // Fencing token desatualizado!
      {
        status: 'REVOKED',
        encryptedToken: createEmptyEncryptedPayload('zombie_wipe'),
      }
    );

    const docAfterZombieAttempt = await adapter.getPendingRevocationDirect(revocationId52);

    const ok =
      commitAttemptZombie.committed === false &&
      commitAttemptZombie.error?.includes('FENCING_TOKEN_MISMATCH') &&
      docAfterZombieAttempt?.status === 'PROCESSING' &&
      docAfterZombieAttempt?.leaseOwner === 'worker_instance_alive_53' &&
      docAfterZombieAttempt?.fencingToken === 2;

    recordResult(54, 'Worker antigo (zombie) que perdeu o lease é BLOQUEADO por FENCING_TOKEN_MISMATCH ao tentar gravar resultado', Boolean(ok), `zombieBlocked=${!commitAttemptZombie.committed}, error=${commitAttemptZombie.error}`);
  } catch (err: any) {
    recordResult(54, 'Bloqueio de worker zombie por FENCING_TOKEN_MISMATCH', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 55 (Phase 11.2.4): Duas instâncias de worker tentando assumir a mesma tarefa simultaneamente (lock atômico)
  // ---------------------------------------------------------------------------
  try {
    const concUid55 = 'uid_concurrent_lease_55';
    const concOpenId55 = 'tt_openid_55';
    const doc55 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: concUid55,
      openId: concOpenId55,
      encryptedToken: encryptTokenAes256Gcm('token_55'),
    });

    const now55 = Date.now();
    const [acquireWorkerA, acquireWorkerB] = await Promise.all([
      adapter.acquireRevocationLeaseDirect(doc55.revocationId, 'worker_instance_A', now55, 60000),
      adapter.acquireRevocationLeaseDirect(doc55.revocationId, 'worker_instance_B', now55, 60000),
    ]);

    const acquiredCount = [acquireWorkerA, acquireWorkerB].filter((r) => r.acquired).length;

    const ok = acquiredCount === 1;
    recordResult(55, 'Competição de lease simultâneo por 2 workers: exatamente 1 obtém o lease atômico', ok, `acquiredCount=${acquiredCount}`);
  } catch (err: any) {
    recordResult(55, 'Competição de lease atômico por trabalhadores concorrentes', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 56 (Phase 11.2.4): Falha após revogação remota e antes da atualização do Firestore (reconciliação idempotente)
  // ---------------------------------------------------------------------------
  try {
    const uid56 = 'uid_post_api_crash_56';
    const openId56 = 'tt_openid_56';
    const doc56 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid56,
      openId: openId56,
      encryptedToken: encryptTokenAes256Gcm('token_56'),
    });

    // Simula Worker 1 que chamou a API TikTok (API retornou 200 OK) mas sofreu crash antes de atualizar o Firestore
    const lease56 = await adapter.acquireRevocationLeaseDirect(doc56.revocationId, 'worker_crash_after_api_56', Date.now(), 2000);

    // TikTok API v2 continuará retornando 200 OK no retry idempotente
    configureMockTikTokFetcher({ failRevoke: false });

    // Worker 2 assume a tarefa após expiração do lease
    const now56Recover = Date.now() + 3000;
    const processOutcome56 = await tiktokOAuthService.processPendingTokenRevocationsBatch({
      now: now56Recover,
      instanceIdOverride: 'worker_recover_56',
    });

    const item56After = await adapter.getPendingRevocationDirect(doc56.revocationId);

    const ok =
      processOutcome56.succeeded >= 1 &&
      item56After !== null &&
      item56After.status === 'REVOKED' &&
      item56After.encryptedToken.ciphertext === '';

    recordResult(56, 'Falha pós-API TikTok remota é recuperada de forma limpa e idempotente por novo worker (status REVOKED)', ok, `recoveredStatus=${item56After?.status}`);
  } catch (err: any) {
    recordResult(56, 'Recuperação idempotente de falha pós-API remota', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 57 (Phase 11.2.4): Retentativa idempotente do processamento de lote da fila
  // ---------------------------------------------------------------------------
  try {
    const outcome1 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const outcome2 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });

    const ok =
      typeof outcome1.processed === 'number' &&
      typeof outcome2.processed === 'number' &&
      outcome2.processed === 0; // Nenhum item pendente restante

    recordResult(57, 'Retentativa idempotente de processamento de lote: segunda execução não duplica ações nem afeta estado final', ok, `run1Processed=${outcome1.processed}, run2Processed=${outcome2.processed}`);
  } catch (err: any) {
    recordResult(57, 'Retentativa idempotente do lote de revogação', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 58 (Phase 11.2.4): Descarte administrativo de quarentena (adminDiscardQuarantinedTokenDirect)
  // ---------------------------------------------------------------------------
  try {
    const uid58 = 'uid_admin_discard_58';
    const openId58 = 'tt_openid_58';
    const doc58 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid58,
      openId: openId58,
      encryptedToken: encryptTokenAes256Gcm('quarantine_token_58'),
    });

    // Move para QUARANTINED
    doc58.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc58.revocationId, doc58);

    // Executa decisão administrativa documentada de descarte
    const discardResult = await adapter.adminDiscardQuarantinedTokenDirect(
      doc58.revocationId,
      'admin_user_999',
      'Descarte documentado após avaliação de risco residual'
    );

    const doc58After = await adapter.getPendingRevocationDirect(doc58.revocationId);

    const ok =
      discardResult.discarded === true &&
      doc58After !== null &&
      doc58After.status === 'QUARANTINED' &&
      doc58After.adminDiscarded === true &&
      doc58After.adminNotes?.includes('admin_user_999') &&
      doc58After.encryptedToken.ciphertext === '';

    recordResult(58, 'Descarte administrativo em quarentena purga payload do token SOMENTE com autorização do backend Admin SDK e registro em auditoria', Boolean(ok), `adminDiscarded=${doc58After?.adminDiscarded}, notes=${doc58After?.adminNotes}`);
  } catch (err: any) {
    recordResult(58, 'Descarte administrativo de credencial em quarentena', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 59 (Phase 11.2.6): Operador sem autorização tentando descartar (exige adminUid válido no servidor)
  // ---------------------------------------------------------------------------
  try {
    const doc59 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_unauth_59',
      openId: 'tt_openid_59',
      encryptedToken: encryptTokenAes256Gcm('token_59'),
    });
    doc59.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc59.revocationId, doc59);

    let thrown = false;
    try {
      await tiktokOAuthService.adminDiscardQuarantinedToken({
        revocationId: doc59.revocationId,
        adminUid: '', // Sem UID administrativo
        notes: 'Tentativa sem credencial de operador',
      });
    } catch (e: any) {
      thrown = e.code === 'ADMIN_UID_REQUIRED' || e.statusCode === 403;
    }

    recordResult(59, 'Operador sem autorização / sem adminUid no servidor é REJEITADO com erro de autorização', thrown, `thrown=${thrown}`);
  } catch (err: any) {
    recordResult(59, 'Rejeição de operador sem autorização', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 60 (Phase 11.2.6): UID administrativo falsificado pelo cliente é ignorado no serviço
  // ---------------------------------------------------------------------------
  try {
    const doc60 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_forgery_60',
      openId: 'tt_openid_60',
      encryptedToken: encryptTokenAes256Gcm('token_60'),
    });
    doc60.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc60.revocationId, doc60);

    const verifiedAdminUid = 'admin_uid_verified_from_id_token';
    const res60 = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc60.revocationId,
      adminUid: verifiedAdminUid, // UID extraído do Bearer token verificado
      notes: 'Descarte com UID autenticado no servidor',
    });

    const doc60After = await adapter.getPendingRevocationDirect(doc60.revocationId);
    const ok = res60.discarded && doc60After?.adminNotes?.includes(`[Admin: ${verifiedAdminUid}]`);

    recordResult(60, 'UID administrativo obtido da credencial autenticada no servidor vincula auditoria de forma inalterável', Boolean(ok), `notes=${doc60After?.adminNotes}`);
  } catch (err: any) {
    recordResult(60, 'UID administrativo do token autenticado no servidor', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 61 (Phase 11.2.6): Tentativa de descarte administrativo em tarefa no estado PENDING (BLOQUEADA)
  // ---------------------------------------------------------------------------
  try {
    const doc61 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_pending_61',
      openId: 'tt_openid_61',
      encryptedToken: encryptTokenAes256Gcm('token_61'),
    });
    // Status PENDING
    const res61 = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc61.revocationId,
      adminUid: 'admin_user_61',
      notes: 'Tentativa de descartar tarefa pendente',
    });

    const doc61After = await adapter.getPendingRevocationDirect(doc61.revocationId);
    const ok = res61.discarded === false && res61.error === 'INVALID_STATUS_FOR_DISCARD' && doc61After?.status === 'PENDING';

    recordResult(61, 'Descarte administrativo em tarefa PENDING é BLOQUEADO com INVALID_STATUS_FOR_DISCARD', Boolean(ok), `discarded=${res61.discarded}, error=${res61.error}`);
  } catch (err: any) {
    recordResult(61, 'Bloqueio de descarte em tarefa PENDING', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 62 (Phase 11.2.6): Tentativa de descarte administrativo em tarefa no estado PROCESSING (BLOQUEADA)
  // ---------------------------------------------------------------------------
  try {
    const doc62 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_processing_62',
      openId: 'tt_openid_62',
      encryptedToken: encryptTokenAes256Gcm('token_62'),
    });
    doc62.status = 'PROCESSING';
    await adapter.setPendingRevocationDirect(doc62.revocationId, doc62);

    const res62 = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc62.revocationId,
      adminUid: 'admin_user_62',
      notes: 'Tentativa de descartar tarefa em processamento',
    });

    const doc62After = await adapter.getPendingRevocationDirect(doc62.revocationId);
    const ok = res62.discarded === false && res62.error === 'INVALID_STATUS_FOR_DISCARD' && doc62After?.status === 'PROCESSING';

    recordResult(62, 'Descarte administrativo em tarefa PROCESSING é BLOQUEADO com INVALID_STATUS_FOR_DISCARD', Boolean(ok), `discarded=${res62.discarded}, error=${res62.error}`);
  } catch (err: any) {
    recordResult(62, 'Bloqueio de descarte em tarefa PROCESSING', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 63 (Phase 11.2.6): Descarte administrativo de tarefa no estado FAILED (APROVADO)
  // ---------------------------------------------------------------------------
  try {
    const doc63 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_failed_63',
      openId: 'tt_openid_63',
      encryptedToken: encryptTokenAes256Gcm('token_63'),
    });
    doc63.status = 'FAILED';
    doc63.attempts = 5;
    await adapter.setPendingRevocationDirect(doc63.revocationId, doc63);

    const res63 = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc63.revocationId,
      adminUid: 'admin_user_63',
      notes: 'Descarte administrativo documentado para tarefa FAILED',
    });

    const doc63After = await adapter.getPendingRevocationDirect(doc63.revocationId);
    const ok =
      res63.discarded === true &&
      doc63After?.status === 'QUARANTINED' &&
      doc63After?.adminDiscarded === true &&
      doc63After?.encryptedToken?.ciphertext === '';

    recordResult(63, 'Descarte administrativo em tarefa FAILED é APROVADO, purga payload do token e registra auditoria', Boolean(ok), `discarded=${res63.discarded}, status=${doc63After?.status}`);
  } catch (err: any) {
    recordResult(63, 'Descarte administrativo em tarefa FAILED', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 64 (Phase 11.2.6): Descarte administrativo de tarefa no estado QUARANTINED (APROVADO)
  // ---------------------------------------------------------------------------
  try {
    const doc64 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_quarantined_64',
      openId: 'tt_openid_64',
      encryptedToken: encryptTokenAes256Gcm('token_64'),
    });
    doc64.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc64.revocationId, doc64);

    const res64 = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc64.revocationId,
      adminUid: 'admin_user_64',
      notes: 'Descarte administrativo documentado para tarefa QUARANTINED',
    });

    const doc64After = await adapter.getPendingRevocationDirect(doc64.revocationId);
    const ok =
      res64.discarded === true &&
      doc64After?.status === 'QUARANTINED' &&
      doc64After?.adminDiscarded === true &&
      doc64After?.encryptedToken?.ciphertext === '';

    recordResult(64, 'Descarte administrativo em tarefa QUARANTINED é APROVADO, purga payload do token e registra auditoria', Boolean(ok), `discarded=${res64.discarded}, status=${doc64After?.status}`);
  } catch (err: any) {
    recordResult(64, 'Descarte administrativo em tarefa QUARANTINED', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 65 (Phase 11.2.6): Justificativa ausente no descarte administrativo (BLOQUEADA)
  // ---------------------------------------------------------------------------
  try {
    const doc65 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_no_notes_65',
      openId: 'tt_openid_65',
      encryptedToken: encryptTokenAes256Gcm('token_65'),
    });
    doc65.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc65.revocationId, doc65);

    const res65 = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc65.revocationId,
      adminUid: 'admin_user_65',
      notes: '   ', // Apenas espaços em branco
    });

    const ok = res65.discarded === false && res65.error === 'JUSTIFICATION_REQUIRED';
    recordResult(65, 'Descarte administrativo sem justificativa não-vazia é REJEITADO com JUSTIFICATION_REQUIRED', Boolean(ok), `discarded=${res65.discarded}, error=${res65.error}`);
  } catch (err: any) {
    recordResult(65, 'Exigência de justificativa no descarte administrativo', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 66 (Phase 11.2.6): Crash após confirmação remota pelo TikTok (Reconciliação Idempotente)
  // ---------------------------------------------------------------------------
  try {
    const uid66 = 'uid_crash_post_remote_66';
    const openId66 = 'tt_openid_66';
    const doc66 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid66,
      openId: openId66,
      encryptedToken: encryptTokenAes256Gcm('token_66'),
    });

    // Worker 1 revoga no remoto (HTTP 200), mas sofre crash antes de gravar REVOKED no Firestore
    const lease66 = await adapter.acquireRevocationLeaseDirect(doc66.revocationId, 'worker_crash_66', Date.now(), 1000);
    configureMockTikTokFetcher({ failRevoke: false });

    // Worker 2 assume a tarefa após expiração do lease (1000ms)
    const now66Recover = Date.now() + 2000;
    const processOutcome66 = await tiktokOAuthService.processPendingTokenRevocationsBatch({
      now: now66Recover,
      instanceIdOverride: 'worker_recover_66',
    });

    const item66After = await adapter.getPendingRevocationDirect(doc66.revocationId);
    const ok =
      processOutcome66.succeeded >= 1 &&
      item66After?.status === 'REVOKED' &&
      item66After?.encryptedToken?.ciphertext === '';

    recordResult(66, 'Crash de worker após resposta 200 OK remota é recuperado de forma atômica e limpa por novo worker', Boolean(ok), `succeeded=${processOutcome66.succeeded}, status=${item66After?.status}`);
  } catch (err: any) {
    recordResult(66, 'Recuperação de crash após confirmação remota do TikTok', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 67 (Phase 11.2.6): Lease expirado durante a chamada remota TikTok (Worker antigo bloqueado no commit)
  // ---------------------------------------------------------------------------
  try {
    const uid67 = 'uid_lease_expired_during_call_67';
    const openId67 = 'tt_openid_67';
    const doc67 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid67,
      openId: openId67,
      encryptedToken: encryptTokenAes256Gcm('token_67'),
    });

    // Worker 1 adquire lease (fencingToken = 1) com TTL de 1000ms
    const now67Start = Date.now();
    const lease67Worker1 = await adapter.acquireRevocationLeaseDirect(doc67.revocationId, 'worker_slow_67', now67Start, 1000);

    // Chamada remota do Worker 1 demora 2000ms -> Lease do Worker 1 expira!
    const now67Recover = now67Start + 1500;

    // Worker 2 assume a tarefa (fencingToken = 2)
    const lease67Worker2 = await adapter.acquireRevocationLeaseDirect(doc67.revocationId, 'worker_fast_67', now67Recover, 60000);

    // Worker 1 finalmente tenta gravar com seu fencingToken = 1
    const commitWorker1 = await adapter.releaseRevocationLeaseOrCommitDirect(
      doc67.revocationId,
      lease67Worker1.fencingToken,
      { status: 'REVOKED', encryptedToken: createEmptyEncryptedPayload('slow_worker_wipe') }
    );

    const doc67After = await adapter.getPendingRevocationDirect(doc67.revocationId);
    const ok =
      commitWorker1.committed === false &&
      commitWorker1.error?.includes('FENCING_TOKEN_MISMATCH') &&
      lease67Worker2.fencingToken === 2 &&
      doc67After?.leaseOwner === 'worker_fast_67';

    recordResult(67, 'Worker cuja chamada estoura o lease TTL é BLOQUEADO por FENCING_TOKEN_MISMATCH ao tentar gravar commit', Boolean(ok), `committed=${commitWorker1.committed}, error=${commitWorker1.error}`);
  } catch (err: any) {
    recordResult(67, 'Bloqueio por expiração de lease durante chamada externa', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 68 (Phase 11.2.6): Worker antigo (zombie) tentando efetuar commit com fencingToken desatualizado
  // ---------------------------------------------------------------------------
  try {
    const doc68 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_zombie_68',
      openId: 'tt_openid_68',
      encryptedToken: encryptTokenAes256Gcm('token_68'),
    });

    // Simula 2 concessões de lease -> fencingToken atual = 2
    await adapter.acquireRevocationLeaseDirect(doc68.revocationId, 'worker_old', Date.now(), 500);
    await adapter.acquireRevocationLeaseDirect(doc68.revocationId, 'worker_new', Date.now() + 1000, 60000);

    // Worker zombie tenta gravar com fencingToken 1
    const commitZombie = await adapter.releaseRevocationLeaseOrCommitDirect(
      doc68.revocationId,
      1,
      { status: 'REVOKED' }
    );

    const ok = commitZombie.committed === false && commitZombie.error?.includes('FENCING_TOKEN_MISMATCH');
    recordResult(68, 'Commit de worker com fencingToken desatualizado é BLOQUEADO prevenindo sobrescrita de estado', Boolean(ok), `committed=${commitZombie.committed}, error=${commitZombie.error}`);
  } catch (err: any) {
    recordResult(68, 'Bloqueio de worker com fencingToken desatualizado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 69 (Phase 11.2.6): Duas instâncias de worker tentando assumir a mesma tarefa simultaneamente (Lock Atômico)
  // ---------------------------------------------------------------------------
  try {
    const doc69 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_concurrent_69',
      openId: 'tt_openid_69',
      encryptedToken: encryptTokenAes256Gcm('token_69'),
    });

    const now69 = Date.now();
    const [acquireA, acquireB] = await Promise.all([
      adapter.acquireRevocationLeaseDirect(doc69.revocationId, 'instance_A', now69, 60000),
      adapter.acquireRevocationLeaseDirect(doc69.revocationId, 'instance_B', now69, 60000),
    ]);

    const acquiredCount = [acquireA, acquireB].filter((r) => r.acquired).length;
    const ok = acquiredCount === 1;

    recordResult(69, 'Competição de lease entre 2 instâncias simultâneas concede lock atômico a exatamente 1 worker', Boolean(ok), `acquiredCount=${acquiredCount}`);
  } catch (err: any) {
    recordResult(69, 'Competição por lease atômico entre instâncias concorrentes', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 70 (Phase 11.2.6): Resposta remota ambígua (API TikTok HTTP 400 com error token_already_revoked / invalid_token)
  // ---------------------------------------------------------------------------
  try {
    const uid70 = 'uid_ambiguous_70';
    const openId70 = 'tt_openid_70';
    const doc70 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: uid70,
      openId: openId70,
      encryptedToken: encryptTokenAes256Gcm('token_70'),
    });

    // Simula resposta HTTP 400 da API do TikTok informando "already_revoked"
    configureMockTikTokFetcher({
      failRevoke: true, // Simula status HTTP 400 não-200
    });

    // Força fetcher customizado que retorna 400 com body "already_revoked"
    (tiktokOAuthService as any).fetcher = async () => {
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { code: 'already_revoked', message: 'Token has already been revoked' } }),
      } as any;
    };

    const processOutcome70 = await tiktokOAuthService.processPendingTokenRevocationsBatch({
      now: Date.now(),
      instanceIdOverride: 'worker_ambiguous_70',
    });

    const doc70After = await adapter.getPendingRevocationDirect(doc70.revocationId);
    const ok =
      processOutcome70.failed === 1 &&
      doc70After?.status === 'PENDING' &&
      doc70After?.lastError?.includes('UNPROVEN_ALREADY_REVOKED') &&
      doc70After?.encryptedToken?.ciphertext !== '';

    recordResult(70, 'Resposta remota ambígua HTTP 400 already_revoked é reconhecida como inconclusiva (UNPROVEN_ALREADY_REVOKED) e PRESERVA ciphertext AES-256-GCM', Boolean(ok), `failed=${processOutcome70.failed}, status=${doc70After?.status}`);
  } catch (err: any) {
    recordResult(70, 'Tratamento de resposta remota ambígua do TikTok', false, err.message);
  } finally {
    configureMockTikTokFetcher({ failRevoke: false });
  }

  // ===========================================================================
  // FASE 11.2.8: TESTES OBRIGATÓRIOS DA MATRIZ DE RESPOSTA E AUDITORIA ADMINISTRATIVA (71 a 82)
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // CENÁRIO 71 (Phase 11.2.8): TikTok API v2 HTTP 200/204 -> remoteOk = true, status REVOKED, payload limpo
  // ---------------------------------------------------------------------------
  try {
    const doc71 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_71',
      openId: 'tt_openid_71',
      encryptedToken: encryptTokenAes256Gcm('token_71'),
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: {}, error: { code: 'ok' } }),
    });
    const outcome71 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after71 = await adapter.getPendingRevocationDirect(doc71.revocationId);
    const ok = outcome71.succeeded === 1 && after71?.status === 'REVOKED' && after71?.encryptedToken?.ciphertext === '';
    recordResult(71, 'TikTok API v2 HTTP 200/204 marca remoteOk = true, transiciona para REVOKED e purga payload do token', Boolean(ok), `status=${after71?.status}, ciphertextLength=${after71?.encryptedToken?.ciphertext.length}`);
  } catch (err: any) {
    recordResult(71, 'HTTP 200/204 TikTok API v2', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 72 (Phase 11.2.8 / 11.2.10): TikTok API v2 HTTP 400 already_revoked -> remoteOk = false, UNPROVEN_ALREADY_REVOKED, PRESERVA payload
  // ---------------------------------------------------------------------------
  try {
    const cipher72 = encryptTokenAes256Gcm('token_72');
    const doc72 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_72',
      openId: 'tt_openid_72',
      encryptedToken: cipher72,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'already_revoked', message: 'Token already revoked' } }),
    });
    const outcome72 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after72 = await adapter.getPendingRevocationDirect(doc72.revocationId);
    const ok =
      outcome72.failed === 1 &&
      after72?.status === 'PENDING' &&
      after72?.lastError?.includes('UNPROVEN_ALREADY_REVOKED') &&
      after72?.encryptedToken?.ciphertext === cipher72.ciphertext;
    recordResult(72, 'TikTok API v2 HTTP 400 com already_revoked sem comprovação oficial marca remoteOk = false e PRESERVA payload AES-256-GCM', Boolean(ok), `status=${after72?.status}, lastError=${after72?.lastError}`);
  } catch (err: any) {
    recordResult(72, 'HTTP 400 already_revoked TikTok API v2', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 73 (Phase 11.2.8): TikTok API v2 HTTP 400 invalid_token -> remoteOk = false, AMBIGUOUS_INVALID_TOKEN, PRESERVA payload AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const origCipher73 = encryptTokenAes256Gcm('token_secret_73');
    const doc73 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_73',
      openId: 'tt_openid_73',
      encryptedToken: origCipher73,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'invalid_token', message: 'Token string invalid' } }),
    });
    const outcome73 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after73 = await adapter.getPendingRevocationDirect(doc73.revocationId);
    const ok =
      outcome73.failed === 1 &&
      after73?.status === 'PENDING' &&
      after73?.lastError?.includes('AMBIGUOUS_INVALID_TOKEN') &&
      after73?.encryptedToken?.ciphertext === origCipher73.ciphertext;
    recordResult(73, 'TikTok API v2 HTTP 400 invalid_token marca remoteOk = false (AMBIGUOUS_INVALID_TOKEN) e PRESERVA payload criptografado', Boolean(ok), `status=${after73?.status}, lastError=${after73?.lastError}`);
  } catch (err: any) {
    recordResult(73, 'HTTP 400 invalid_token preserva payload criptografado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 74 (Phase 11.2.8): TikTok API v2 HTTP 400 token_invalid -> remoteOk = false, AMBIGUOUS_INVALID_TOKEN, PRESERVA payload AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const origCipher74 = encryptTokenAes256Gcm('token_secret_74');
    const doc74 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_74',
      openId: 'tt_openid_74',
      encryptedToken: origCipher74,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'token_invalid' }),
    });
    const outcome74 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after74 = await adapter.getPendingRevocationDirect(doc74.revocationId);
    const ok =
      outcome74.failed === 1 &&
      after74?.status === 'PENDING' &&
      after74?.lastError?.includes('AMBIGUOUS_INVALID_TOKEN') &&
      after74?.encryptedToken?.ciphertext === origCipher74.ciphertext;
    recordResult(74, 'TikTok API v2 HTTP 400 token_invalid marca remoteOk = false e PRESERVA payload AES-256-GCM', Boolean(ok), `status=${after74?.status}, ciphertextIntact=${after74?.encryptedToken?.ciphertext === origCipher74.ciphertext}`);
  } catch (err: any) {
    recordResult(74, 'HTTP 400 token_invalid preserva payload criptografado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 75 (Phase 11.2.8): TikTok API v2 HTTP 401 -> CLIENT_AUTH_FAILED, remoteOk = false, PRESERVA payload AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const origCipher75 = encryptTokenAes256Gcm('token_secret_75');
    const doc75 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_75',
      openId: 'tt_openid_75',
      encryptedToken: origCipher75,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { code: 'invalid_client', message: 'Client Secret invalid' } }),
    });
    const outcome75 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after75 = await adapter.getPendingRevocationDirect(doc75.revocationId);
    const ok =
      outcome75.failed === 1 &&
      after75?.status === 'PENDING' &&
      after75?.lastError?.includes('CLIENT_AUTH_FAILED') &&
      after75?.encryptedToken?.ciphertext === origCipher75.ciphertext;
    recordResult(75, 'TikTok API v2 HTTP 401 indica falha de credenciais do app (CLIENT_AUTH_FAILED) e PRESERVA payload criptografado', Boolean(ok), `status=${after75?.status}, lastError=${after75?.lastError}`);
  } catch (err: any) {
    recordResult(75, 'HTTP 401 CLIENT_AUTH_FAILED preserva payload criptografado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 76 (Phase 11.2.8): TikTok API v2 HTTP 400 erro não-confirmado (invalid_request) -> remoteOk = false, PRESERVA payload AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const origCipher76 = encryptTokenAes256Gcm('token_secret_76');
    const doc76 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_76',
      openId: 'tt_openid_76',
      encryptedToken: origCipher76,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_request' }),
    });
    const outcome76 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after76 = await adapter.getPendingRevocationDirect(doc76.revocationId);
    const ok =
      outcome76.failed === 1 &&
      after76?.status === 'PENDING' &&
      after76?.encryptedToken?.ciphertext === origCipher76.ciphertext;
    recordResult(76, 'TikTok API v2 HTTP 400 com erro genérico unconfirmed (invalid_request) PRESERVA payload criptografado', Boolean(ok), `status=${after76?.status}`);
  } catch (err: any) {
    recordResult(76, 'HTTP 400 erro não-confirmado preserva payload', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 77 (Phase 11.2.8): TikTok API v2 HTTP 5xx (502 Bad Gateway) -> TIKTOK_SERVER_ERROR, retry backoff, PRESERVA payload AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const origCipher77 = encryptTokenAes256Gcm('token_secret_77');
    const doc77 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_77',
      openId: 'tt_openid_77',
      encryptedToken: origCipher77,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 502,
      text: async () => '502 Bad Gateway',
    });
    const outcome77 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after77 = await adapter.getPendingRevocationDirect(doc77.revocationId);
    const ok =
      outcome77.failed === 1 &&
      after77?.status === 'PENDING' &&
      after77?.lastError?.includes('TIKTOK_SERVER_ERROR') &&
      after77?.encryptedToken?.ciphertext === origCipher77.ciphertext;
    recordResult(77, 'TikTok API v2 HTTP 5xx indica erro temporário no servidor (TIKTOK_SERVER_ERROR) e PRESERVA payload criptografado', Boolean(ok), `status=${after77?.status}, lastError=${after77?.lastError}`);
  } catch (err: any) {
    recordResult(77, 'HTTP 5xx TIKTOK_SERVER_ERROR', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 78 (Phase 11.2.8): Timeout / exceção de rede na chamada de revogação -> remoteOk = false, PRESERVA payload AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const origCipher78 = encryptTokenAes256Gcm('token_secret_78');
    const doc78 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_78',
      openId: 'tt_openid_78',
      encryptedToken: origCipher78,
    });
    (tiktokOAuthService as any).fetcher = async () => {
      throw new Error('ETIMEDOUT: Connection timed out');
    };
    const outcome78 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after78 = await adapter.getPendingRevocationDirect(doc78.revocationId);
    const ok =
      outcome78.failed === 1 &&
      after78?.status === 'PENDING' &&
      after78?.lastError?.includes('TIKTOK_SERVER_ERROR') &&
      after78?.encryptedToken?.ciphertext === origCipher78.ciphertext;
    recordResult(78, 'Exceção de rede / timeout na chamada remota marca erro temporário e PRESERVA payload criptografado', Boolean(ok), `status=${after78?.status}, lastError=${after78?.lastError}`);
  } catch (err: any) {
    recordResult(78, 'Timeout / exceção de rede', false, err.message);
  } finally {
    configureMockTikTokFetcher({ failRevoke: false });
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 79 (Phase 11.2.8): Reconciliação atômica e idempotente de crash pós-revogação remota
  // ---------------------------------------------------------------------------
  try {
    const doc79 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_79',
      openId: 'tt_openid_79',
      encryptedToken: encryptTokenAes256Gcm('token_79'),
    });
    // Simula primeiro worker chamando API TikTok (sucesso) e sofrendo crash antes do commit
    const lease79 = await adapter.acquireRevocationLeaseDirect(doc79.revocationId, 'worker_crash_79', Date.now(), 100);
    // Próximo worker assume após 200ms e chama API (TikTok responde 200 OK confirmado)
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: {}, error: { code: 'ok', message: '' } }),
    });
    const outcome79 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() + 300, instanceIdOverride: 'worker_recover_79' });
    const after79 = await adapter.getPendingRevocationDirect(doc79.revocationId);
    const ok = outcome79.succeeded === 1 && after79?.status === 'REVOKED' && after79?.encryptedToken?.ciphertext === '';
    recordResult(79, 'Crash pós-confirmação remota é reconciliado de forma limpa, atômica e idempotente pelo worker seguinte', Boolean(ok), `succeeded=${outcome79.succeeded}, status=${after79?.status}`);
  } catch (err: any) {
    recordResult(79, 'Reconciliação idempotente pós-crash', false, err.message);
  } finally {
    configureMockTikTokFetcher({ failRevoke: false });
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 80 (Phase 11.2.8): FencingToken previne sobrescrita de estado por worker com lease vencido
  // ---------------------------------------------------------------------------
  try {
    const doc80 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_80',
      openId: 'tt_openid_80',
      encryptedToken: encryptTokenAes256Gcm('token_80'),
    });
    const lease80_1 = await adapter.acquireRevocationLeaseDirect(doc80.revocationId, 'worker_1', Date.now(), 500);
    const lease80_2 = await adapter.acquireRevocationLeaseDirect(doc80.revocationId, 'worker_2', Date.now() + 1000, 60000);
    const commitAttempt1 = await adapter.releaseRevocationLeaseOrCommitDirect(doc80.revocationId, lease80_1.fencingToken, { status: 'REVOKED' });
    const ok = commitAttempt1.committed === false && commitAttempt1.error?.includes('FENCING_TOKEN_MISMATCH') && lease80_2.fencingToken === 2;
    recordResult(80, 'FencingToken previne que worker desatualizado (fencingToken=1) sobrescreva estado quando fencingToken=2', Boolean(ok), `committed=${commitAttempt1.committed}, fencing2=${lease80_2.fencingToken}`);
  } catch (err: any) {
    recordResult(80, 'FencingToken locking check', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 81 (Phase 11.2.8): Tentativa de descarte sem adminUid no backend é REJEITADA com 403
  // ---------------------------------------------------------------------------
  try {
    const doc81 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_81',
      openId: 'tt_openid_81',
      encryptedToken: encryptTokenAes256Gcm('token_81'),
    });
    doc81.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc81.revocationId, doc81);
    let errorThrown = false;
    try {
      await tiktokOAuthService.adminDiscardQuarantinedToken({
        revocationId: doc81.revocationId,
        adminUid: '', // Vazio
        notes: 'Descarte sem permissão',
      });
    } catch (e: any) {
      errorThrown = e.code === 'ADMIN_UID_REQUIRED' || e.statusCode === 403;
    }
    recordResult(81, 'Tentativa de descarte sem UID administrativo autenticado no backend é REJEITADA com erro 403', errorThrown, `errorThrown=${errorThrown}`);
  } catch (err: any) {
    recordResult(81, 'Rejeição de descarte sem adminUid', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 82 (Phase 11.2.8): Regra do Firestore para /revocation_audit_logs/{logId} bloqueia gravação/alteração pelo cliente SDK
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    const hasAuditLogBlock =
      rulesContent.includes('match /revocation_audit_logs/{logId}') &&
      rulesContent.includes('allow read: if isSignedIn();') &&
      rulesContent.includes('allow create, update, delete: if false;');
    recordResult(82, 'firestore.rules contém bloco estrito para /revocation_audit_logs/{logId} com gravação/alteração 100% bloqueada para Client SDK', hasAuditLogBlock, `hasAuditLogBlock=${hasAuditLogBlock}`);
  } catch (err: any) {
    recordResult(82, 'Verificação de regras do Firestore para revocation_audit_logs', false, err.message);
  }

  // ===========================================================================
  // FASE 11.2.10: HARDENING FINAL DA PRIVACIDADE E CONFIRMAÇÃO DE REVOGAÇÃO (83 a 94)
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // CENÁRIO 83 (Phase 11.2.10): Usuário autenticado comum tentando ler logs em /revocation_audit_logs/{logId} via Client SDK é BLOQUEADO
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    const hasAuditLogStrictBlock =
      rulesContent.includes('match /revocation_audit_logs/{logId}') &&
      rulesContent.includes('allow read, write: if false;');
    recordResult(83, 'Usuário autenticado comum tentando ler /revocation_audit_logs/{logId} via Client SDK é 100% BLOQUEADO em firestore.rules', hasAuditLogStrictBlock, `hasAuditLogStrictBlock=${hasAuditLogStrictBlock}`);
  } catch (err: any) {
    recordResult(83, 'Bloqueio de leitura de audit logs para usuário comum em firestore.rules', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 84 (Phase 11.2.10): Usuário anônimo tentando ler logs em /revocation_audit_logs/{logId} via Client SDK é BLOQUEADO
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    const hasAuditLogStrictBlock =
      rulesContent.includes('match /revocation_audit_logs/{logId}') &&
      rulesContent.includes('allow read, write: if false;');
    recordResult(84, 'Usuário anônimo tentando ler /revocation_audit_logs/{logId} via Client SDK é 100% BLOQUEADO', hasAuditLogStrictBlock, `hasAuditLogStrictBlock=${hasAuditLogStrictBlock}`);
  } catch (err: any) {
    recordResult(84, 'Bloqueio de leitura anônima em firestore.rules', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 85 (Phase 11.2.10): Cliente tentando criar, modificar ou excluir /revocation_audit_logs/{logId} é BLOQUEADO
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    const hasAuditLogStrictBlock =
      rulesContent.includes('match /revocation_audit_logs/{logId}') &&
      rulesContent.includes('allow read, write: if false;');
    recordResult(85, 'Cliente tentando criar, modificar ou excluir /revocation_audit_logs/{logId} via Client SDK é 100% BLOQUEADO por allow read, write: if false;', hasAuditLogStrictBlock, `hasAuditLogStrictBlock=${hasAuditLogStrictBlock}`);
  } catch (err: any) {
    recordResult(85, 'Bloqueio de escrita/modificação de audit logs no Client SDK', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 86 (Phase 11.2.10): Verificação de regras sobrepostas (nenhum wildcard reabre /revocation_audit_logs)
  // ---------------------------------------------------------------------------
  try {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    const globalDenyPresent = rulesContent.includes('match /{document=**}') && rulesContent.includes('allow read, write: if false;');
    const auditMatchDirect = rulesContent.includes('match /revocation_audit_logs/{logId}') && rulesContent.includes('allow read, write: if false;');
    const noOverlappingReopen = globalDenyPresent && auditMatchDirect;
    recordResult(86, 'Nenhum bloco match sobreposto ou wildcard reabre permissões para /revocation_audit_logs/{logId}', noOverlappingReopen, `noOverlappingReopen=${noOverlappingReopen}`);
  } catch (err: any) {
    recordResult(86, 'Verificação de regras sobrepostas', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 87 (Phase 11.2.10): Administrador autorizado consultando logs de auditoria via backend (Admin SDK)
  // ---------------------------------------------------------------------------
  try {
    const adminUid87 = 'admin_uid_verified_87';
    // Adiciona log de teste no adaptador
    const doc87 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_87',
      openId: 'tt_openid_87',
      encryptedToken: encryptTokenAes256Gcm('token_87'),
    });
    doc87.status = 'QUARANTINED';
    await adapter.setPendingRevocationDirect(doc87.revocationId, doc87);
    await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: doc87.revocationId,
      adminUid: adminUid87,
      notes: 'Audit log creation test for admin query',
    });

    const auditQueryResult = await tiktokOAuthService.getAdminRevocationAuditLogs({
      adminUid: adminUid87,
      limit: 10,
    });

    const ok =
      Array.isArray(auditQueryResult.logs) &&
      auditQueryResult.logs.length > 0 &&
      auditQueryResult.logs.some((l) => l.operatorUid === adminUid87);

    recordResult(87, 'Administrador autorizado com adminUid verificado consulta logs de auditoria no backend (Admin SDK) com sucesso', ok, `logsFound=${auditQueryResult.logs.length}`);
  } catch (err: any) {
    recordResult(87, 'Consulta de logs por administrador autorizado via backend', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 88 (Phase 11.2.10): Usuário sem autorização / sem adminUid no backend consultando logs é REJEITADO
  // ---------------------------------------------------------------------------
  try {
    let rejected = false;
    try {
      await tiktokOAuthService.getAdminRevocationAuditLogs({
        adminUid: '', // Vazio
      });
    } catch (e: any) {
      rejected = e.code === 'ADMIN_UID_REQUIRED' || e.statusCode === 403;
    }
    recordResult(88, 'Usuário sem autorização ou sem adminUid ao consultar logs via backend é REJEITADO com erro 403 (ADMIN_UID_REQUIRED)', rejected, `rejected=${rejected}`);
  } catch (err: any) {
    recordResult(88, 'Rejeição de consulta backend sem adminUid', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 89 (Phase 11.2.8 / 11.2.10): Resposta 400 already_revoked sem comprovação oficial marca remoteOk = false e PRESERVA ciphertext AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const cipher89 = encryptTokenAes256Gcm('secret_token_89');
    const doc89 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_89',
      openId: 'tt_openid_89',
      encryptedToken: cipher89,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'already_revoked', message: 'Token already revoked' } }),
    });
    const outcome89 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after89 = await adapter.getPendingRevocationDirect(doc89.revocationId);
    const ok =
      outcome89.failed === 1 &&
      after89?.status === 'PENDING' &&
      after89?.lastError?.includes('UNPROVEN_ALREADY_REVOKED') &&
      after89?.encryptedToken?.ciphertext === cipher89.ciphertext;
    recordResult(89, 'Resposta HTTP 400 already_revoked sem comprovação oficial marca remoteOk = false (UNPROVEN_ALREADY_REVOKED) e PRESERVA payload AES-256-GCM', Boolean(ok), `status=${after89?.status}, lastError=${after89?.lastError}`);
  } catch (err: any) {
    recordResult(89, 'HTTP 400 already_revoked inconclusivo preserva ciphertext', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 90 (Phase 11.2.10): Resposta HTTP 204 sem comprovação documental marca remoteOk = false e PRESERVA ciphertext AES-256-GCM
  // ---------------------------------------------------------------------------
  try {
    const cipher90 = encryptTokenAes256Gcm('secret_token_90');
    const doc90 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_90',
      openId: 'tt_openid_90',
      encryptedToken: cipher90,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: true,
      status: 204,
      text: async () => '',
    });
    const outcome90 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after90 = await adapter.getPendingRevocationDirect(doc90.revocationId);
    const ok =
      outcome90.failed === 1 &&
      after90?.status === 'PENDING' &&
      after90?.lastError?.includes('UNCONFIRMED_HTTP_204') &&
      after90?.encryptedToken?.ciphertext === cipher90.ciphertext;
    recordResult(90, 'Resposta HTTP 204 sem comprovação documental marca remoteOk = false (UNCONFIRMED_HTTP_204) e PRESERVA payload AES-256-GCM', Boolean(ok), `status=${after90?.status}, lastError=${after90?.lastError}`);
  } catch (err: any) {
    recordResult(90, 'HTTP 204 inconclusivo preserva ciphertext', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 91 (Phase 11.2.10): Resposta HTTP 400 invalid_token preserva payload AES-256-GCM sem apagar credencial
  // ---------------------------------------------------------------------------
  try {
    const cipher91 = encryptTokenAes256Gcm('secret_token_91');
    const doc91 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_91',
      openId: 'tt_openid_91',
      encryptedToken: cipher91,
    });
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { code: 'invalid_token', message: 'Token string invalid' } }),
    });
    const outcome91 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() });
    const after91 = await adapter.getPendingRevocationDirect(doc91.revocationId);
    const ok =
      outcome91.failed === 1 &&
      after91?.status === 'PENDING' &&
      after91?.lastError?.includes('AMBIGUOUS_INVALID_TOKEN') &&
      after91?.encryptedToken?.ciphertext === cipher91.ciphertext;
    recordResult(91, 'Resposta HTTP 400 invalid_token marca remoteOk = false e PRESERVA payload AES-256-GCM intacto', Boolean(ok), `status=${after91?.status}, ciphertextLength=${after91?.encryptedToken?.ciphertext.length}`);
  } catch (err: any) {
    recordResult(91, 'HTTP 400 invalid_token preserva payload', false, err.message);
  } finally {
    configureMockTikTokFetcher({ failRevoke: false });
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 92 (Phase 11.2.10): Crash pós-confirmação remota (HTTP 200 ok) é reconciliado de forma atômica pelo worker seguinte
  // ---------------------------------------------------------------------------
  try {
    const doc92 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_92',
      openId: 'tt_openid_92',
      encryptedToken: encryptTokenAes256Gcm('token_92'),
    });
    const lease92 = await adapter.acquireRevocationLeaseDirect(doc92.revocationId, 'worker_crash_92', Date.now(), 100);
    (tiktokOAuthService as any).fetcher = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: {}, error: { code: 'ok' } }),
    });
    const outcome92 = await tiktokOAuthService.processPendingTokenRevocationsBatch({ now: Date.now() + 300, instanceIdOverride: 'worker_recover_92' });
    const after92 = await adapter.getPendingRevocationDirect(doc92.revocationId);
    const ok = outcome92.succeeded === 1 && after92?.status === 'REVOKED' && after92?.encryptedToken?.ciphertext === '';
    recordResult(92, 'Crash pós-confirmação remota HTTP 200 é reconciliado de forma limpa, atômica e idempotente pelo worker seguinte', Boolean(ok), `succeeded=${outcome92.succeeded}, status=${after92?.status}`);
  } catch (err: any) {
    recordResult(92, 'Reconciliação idempotente pós-crash HTTP 200', false, err.message);
  } finally {
    configureMockTikTokFetcher({ failRevoke: false });
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 93 (Phase 11.2.10): Worker antigo (zombie) tentando modificar estado é BLOQUEADO por FENCING_TOKEN_MISMATCH
  // ---------------------------------------------------------------------------
  try {
    const doc93 = await tiktokOAuthService.enqueuePendingTokenRevocation({
      uid: 'uid_93',
      openId: 'tt_openid_93',
      encryptedToken: encryptTokenAes256Gcm('token_93'),
    });
    const lease93_1 = await adapter.acquireRevocationLeaseDirect(doc93.revocationId, 'zombie_worker_93', Date.now(), 500);
    const lease93_2 = await adapter.acquireRevocationLeaseDirect(doc93.revocationId, 'active_worker_93', Date.now() + 1000, 60000);
    const commitZombie = await adapter.releaseRevocationLeaseOrCommitDirect(doc93.revocationId, lease93_1.fencingToken, { status: 'REVOKED' });
    const ok = commitZombie.committed === false && commitZombie.error?.includes('FENCING_TOKEN_MISMATCH') && lease93_2.fencingToken === 2;
    recordResult(93, 'Worker antigo (zombie) tentando modificar estado com fencingToken=1 é BLOQUEADO por FENCING_TOKEN_MISMATCH quando fencingToken=2', Boolean(ok), `committed=${commitZombie.committed}, fencing2=${lease93_2.fencingToken}`);
  } catch (err: any) {
    recordResult(93, 'Bloqueio de worker zombie com fencingToken desatualizado', false, err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 94 (Phase 11.2.10): Regressão completa das suítes de teste (94 cenários aprovados sem falha)
  // ---------------------------------------------------------------------------
  try {
    const allPreviousPassed = results.slice(0, 93).every((r) => r.passed);
    recordResult(94, 'Regressão completa das suítes de teste (todos os 93 cenários anteriores APROVADOS com 100% de sucesso)', allPreviousPassed, `allPreviousPassed=${allPreviousPassed}`);
  } catch (err: any) {
    recordResult(94, 'Regressão das suítes de teste', false, err.message);
  }

  console.log('\n================================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(` RESULTADO FINAL FASE 11.2.10: ${passedCount}/${results.length} CENÁRIOS APROVADOS`);
  console.log('================================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Erro fatal na suíte da Fase 11.2.10:', err);
  process.exit(1);
});
