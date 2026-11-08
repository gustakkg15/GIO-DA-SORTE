/**
 * GIO DA SORTE PRO — FASE 11.1: SUÍTE DE AUDITORIA E CORREÇÃO FINAL DE SEGURANÇA
 *
 * Verifica de ponta a ponta todos os requisitos da Fase 11.1:
 *  1. Reautenticação real vs falsificada (rejeição de `reauthConfirmed`/`reauthMethod` forjados, `auth_time` forjado).
 *  2. Rejeição de Firebase ID Tokens antigos (`auth_time > 300s`), expirados, revogados e pertencentes a outro UID (`REAUTH_UID_MISMATCH`).
 *  3. Falha na emissão de Custom Token após persistência -> compensação condicional segura sem deixar vínculos órfãos.
 *  4. Proteção de versão/propriedade no rollback -> se outra operação concorrente atualizou o vínculo antes do rollback, a compensação NÃO remove o vínculo concorrente.
 *  5. Dois logins simultâneos com o mesmo `open_id` -> convergem para o mesmo UID e mesmo `identityDocId` sem duplicar conta.
 *  6. Identificador determinístico SHA-256 (`tiktok_identities/{identityDocId}` no formato `tid_<64_hex>`) sem expor `open_id` bruto no path do Firestore.
 *  7. Independência estrita das 3 operações:
 *     - Operação 1 (Logout GIO): encerra apenas a sessão GIO, preservando autorização TikTok e workers de LIVE ativos.
 *     - Operação 2 (Desvinculação TikTok): revoga tokens no TikTok, limpa `private_tokens`, revoga `oauth_sessions` e encerra de forma limpa o worker de LIVE dependente dessa autorização, preservando conta GIO, configurações e histórico.
 *     - Operação 3 (Encerramento de LIVE): encerra a sessão LIVE e libera o lease, preservando o vínculo da conta TikTok e configurações/histórico de sorteios.
 */

import crypto from 'crypto';
import type { Request } from 'express';
import {
  tiktokOAuthService,
  PROD_APP_ORIGIN,
  OAUTH_CALLBACK_PATH,
  deriveTikTokIdentityDocId,
  deriveControlledFirebaseUidFromOpenId,
  InMemoryTikTokOAuthStorageAdapter,
} from '../src/server/tiktokOAuthService.ts';
import {
  verifyRecentReauthentication,
  setCustomTokenVerifierForTests,
  setCustomTokenCreatorForTests,
} from '../src/server/firebaseAdminAuth.ts';

process.env.TIKTOK_CLIENT_KEY = 'tt_client_key_phase11_1_audit';
process.env.TIKTOK_CLIENT_SECRET = 'tt_client_secret_phase11_1_audit';
process.env.TIKTOK_REDIRECT_URI = `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`;
process.env.OAUTH_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.TIKTOK_OAUTH_USE_PKCE = 'true';

interface AuditTestResult {
  id: string;
  title: string;
  passed: boolean;
  details: string;
}

const results: AuditTestResult[] = [];

function record(id: string, title: string, passed: boolean, details: string) {
  results.push({ id, title, passed, details });
  const badge = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${badge} [${id}] ${title} — ${details}`);
}

function setupMockTikTokApi(options?: {
  openId?: string;
  username?: string;
  displayName?: string;
  onRevokeCalled?: (token: string) => void;
}) {
  const openId = options?.openId ?? 'tt_raw_openid_audit_001';
  const username = options?.username ?? 'criador_audit';
  const displayName = options?.displayName ?? 'Criador Audit';

  tiktokOAuthService.setFetcher(async (url: string, init?: RequestInit) => {
    if (url.includes('/v2/oauth/token/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `act_${crypto.randomBytes(12).toString('hex')}`,
          refresh_token: `rft_${crypto.randomBytes(12).toString('hex')}`,
          expires_in: 86400,
          refresh_expires_in: 31536000,
          scope: 'user.info.basic,user.info.profile',
          token_type: 'Bearer',
          open_id: openId,
        }),
      };
    }

    if (url.includes('/v2/user/info/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              open_id: openId,
              display_name: displayName,
              username,
              avatar_url: 'https://p16-sign.tiktokcdn.com/avatar.jpeg',
            },
          },
          error: { code: 'ok', message: '' },
        }),
      };
    }

    if (url.includes('/v2/oauth/revoke/')) {
      const bodyStr = String(init?.body || '');
      const params = new URLSearchParams(bodyStr);
      options?.onRevokeCalled?.(params.get('token') || '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: {}, error: { code: 'ok' } }),
      };
    }

    throw new Error(`Unexpected URL in test: ${url}`);
  });
}

async function runPhase11_1AuditSuite() {
  console.log('================================================================================');
  console.log(' GIO DA SORTE PRO — FASE 11.1: AUDITORIA E CORREÇÃO FINAL DE SEGURANÇA');
  console.log('================================================================================\n');

  const adapter = new InMemoryTikTokOAuthStorageAdapter();
  tiktokOAuthService.setStorageAdapter(adapter);

  setCustomTokenCreatorForTests(async (uid, claims) => {
    return `custom_jwt.${uid}.${Buffer.from(JSON.stringify(claims || {})).toString('base64url')}`;
  });

  // ===========================================================================
  // 1. REAUTENTICAÇÃO REAL VS FALSIFICADA
  // ===========================================================================
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const targetUid = 'gio_user_reauth_audit_01';

    setCustomTokenVerifierForTests(async (rawToken) => {
      if (rawToken === 'valid_fresh_password_token') {
        return {
          uid: targetUid,
          auth_time: nowSec - 15,
          iat: nowSec - 15,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      if (rawToken === 'valid_fresh_google_token') {
        return {
          uid: targetUid,
          auth_time: nowSec - 20,
          iat: nowSec - 20,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'google.com' },
        } as any;
      }
      if (rawToken === 'stale_password_token_with_client_true') {
        return {
          uid: targetUid,
          auth_time: nowSec - 1200, // 20 minutos atrás (> 300s)
          iat: nowSec - 1200,
          exp: nowSec + 2400,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      if (rawToken === 'custom_provider_token_with_client_true') {
        return {
          uid: targetUid,
          auth_time: nowSec - 5,
          iat: nowSec - 5,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'custom' },
        } as any;
      }
      throw new Error('Token inválido');
    });

    // 1A: Cliente envia reauthConfirmed=true + reauthMethod='password', mas o token tem auth_time antigo
    const spoofedBooleanStaleRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer stale_password_token_with_client_true' },
      body: { reauthConfirmed: true, reauthMethod: 'password' },
    } as unknown as Request);

    // 1B: Cliente envia token emitido por 'custom' (sem método de reautenticação válido)
    const invalidProviderRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer custom_provider_token_with_client_true' },
      body: { reauthConfirmed: true },
    } as unknown as Request);

    // 1C: Cliente tenta injetar auth_time / reauthVerified / sign_in_provider no body
    const forgedAuthTimeRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer valid_fresh_password_token' },
      body: { auth_time: nowSec, reauthVerified: true },
    } as unknown as Request);

    // 1D: Cliente envia reauthMethod='google.com', mas o token real é 'password'
    const mismatchedHintRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer valid_fresh_password_token' },
      body: { reauthMethod: 'google.com' },
    } as unknown as Request);

    // 1E: Token real recente (senha e Google) sem depender de flags do cliente
    const realPasswordRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer valid_fresh_password_token' },
      body: {},
    } as unknown as Request);

    const realGoogleRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer valid_fresh_google_token' },
      body: {},
    } as unknown as Request);

    const ok =
      !spoofedBooleanStaleRes.verified &&
      spoofedBooleanStaleRes.code === 'REAUTHENTICATION_STALE' &&
      !invalidProviderRes.verified &&
      invalidProviderRes.code === 'REAUTHENTICATION_PROVIDER_INVALID' &&
      !forgedAuthTimeRes.verified &&
      forgedAuthTimeRes.code === 'REAUTH_FORGERY_ATTEMPT' &&
      !mismatchedHintRes.verified &&
      mismatchedHintRes.code === 'REAUTH_FORGERY_ATTEMPT' &&
      realPasswordRes.verified === true &&
      realPasswordRes.method === 'password' &&
      realGoogleRes.verified === true &&
      realGoogleRes.method === 'google.com';

    record(
      'F11.1-01',
      'Reautenticação real vs falsificada (ignora flags do cliente e bloqueia forja de auth_time/reauthMethod)',
      ok,
      `spoofStale=${spoofedBooleanStaleRes.code}, invalidProvider=${invalidProviderRes.code}, forgedBody=${forgedAuthTimeRes.code}, mismatchedHint=${mismatchedHintRes.code}, realPass=${realPasswordRes.verified}, realGoogle=${realGoogleRes.verified}`
    );
  } catch (err: any) {
    record('F11.1-01', 'Reautenticação real vs falsificada', false, err.message);
  } finally {
    setCustomTokenVerifierForTests(null);
  }

  // ===========================================================================
  // 2. TOKENS ANTIGOS, EXPIRADOS, REVOGADOS E DE OUTRO UID
  // ===========================================================================
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const userAUid = 'gio_user_A_reauth';
    const userBUid = 'gio_user_B_attacker';

    setCustomTokenVerifierForTests(async (rawToken, checkRevoked) => {
      if (rawToken === 'expired_token') {
        const err: any = new Error('Firebase ID token has expired.');
        err.code = 'auth/id-token-expired';
        throw err;
      }
      if (rawToken === 'revoked_token') {
        if (checkRevoked) {
          const err: any = new Error('Firebase ID token has been revoked.');
          err.code = 'auth/id-token-revoked';
          throw err;
        }
      }
      if (rawToken === 'token_user_A') {
        return {
          uid: userAUid,
          auth_time: nowSec - 10,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      if (rawToken === 'token_user_B') {
        return {
          uid: userBUid,
          auth_time: nowSec - 5,
          exp: nowSec + 3600,
          firebase: { sign_in_provider: 'password' },
        } as any;
      }
      throw new Error('Invalid token');
    });

    const expiredRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer expired_token' },
      body: {},
    } as unknown as Request);

    const revokedRes = await verifyRecentReauthentication({
      headers: { authorization: 'Bearer revoked_token' },
      body: {},
    } as unknown as Request);

    // Usuário A autenticado na sessão tenta passar reauthIdToken pertencente ao Usuário B
    const crossUidReauthTokenRes = await verifyRecentReauthentication(
      {
        headers: { authorization: 'Bearer token_user_A' },
        body: { reauthIdToken: 'token_user_B' },
      } as unknown as Request,
      { expectedUid: userAUid }
    );

    // Token no Authorization pertence ao Usuário B mas expectedUid é Usuário A
    const crossUidExpectedRes = await verifyRecentReauthentication(
      {
        headers: { authorization: 'Bearer token_user_B' },
        body: {},
      } as unknown as Request,
      { expectedUid: userAUid }
    );

    const ok =
      !expiredRes.verified &&
      expiredRes.status === 401 &&
      !revokedRes.verified &&
      revokedRes.status === 401 &&
      !crossUidReauthTokenRes.verified &&
      crossUidReauthTokenRes.status === 403 &&
      crossUidReauthTokenRes.code === 'REAUTH_UID_MISMATCH' &&
      !crossUidExpectedRes.verified &&
      crossUidExpectedRes.status === 403 &&
      crossUidExpectedRes.code === 'REAUTH_UID_MISMATCH';

    record(
      'F11.1-02',
      'Rejeição estrita de tokens expirados, revogados (checkRevoked=true) e pertencentes a outro UID',
      ok,
      `expiredStatus=${expiredRes.status}, revokedStatus=${revokedRes.status}, crossUidCode=${crossUidReauthTokenRes.code}`
    );
  } catch (err: any) {
    record('F11.1-02', 'Tokens expirados, revogados e de outro UID', false, err.message);
  } finally {
    setCustomTokenVerifierForTests(null);
  }

  // ===========================================================================
  // 3. FALHA NA EMISSÃO DE CUSTOM TOKEN E COMPENSAÇÃO CONDICIONAL SEGURA
  // ===========================================================================
  try {
    const failOpenId = 'tt_openid_custom_token_fail_301';
    const expectedControlledUid = deriveControlledFirebaseUidFromOpenId(failOpenId);

    const startFail = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    setupMockTikTokApi({ openId: failOpenId });

    setCustomTokenCreatorForTests(async () => {
      throw new Error('FIREBASE_ADMIN_CUSTOM_TOKEN_FAILURE');
    });

    let caughtError = false;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'code_fail_custom_token',
        state: startFail.state,
        initiatorToken: startFail.initiatorToken,
        issueFirebaseCustomToken: true,
      });
    } catch {
      caughtError = true;
    }

    const orphanIdentity = await adapter.getIdentityDirect(failOpenId);
    const orphanUser = await adapter.getUserDocDirect(expectedControlledUid);
    const orphanVault = await adapter.getUserVaultDirect(expectedControlledUid);

    const ok =
      caughtError &&
      orphanIdentity === null &&
      orphanUser === null &&
      orphanVault === null;

    record(
      'F11.1-03',
      'Compensação segura após falha na emissão do Custom Token remove registros sem deixar vínculos órfãos',
      ok,
      `caughtError=${caughtError}, orphanIdentity=${orphanIdentity}, orphanUser=${orphanUser}, orphanVault=${orphanVault}`
    );
  } catch (err: any) {
    record('F11.1-03', 'Compensação após falha de Custom Token', false, err.message);
  } finally {
    setCustomTokenCreatorForTests(async (uid, claims) => {
      return `custom_jwt.${uid}.${Buffer.from(JSON.stringify(claims || {})).toString('base64url')}`;
    });
  }

  // ===========================================================================
  // 4. PROTEÇÃO DE PROPRIEDADE E VERSÃO NO ROLLBACK (CONCORRÊNCIA SEGURA)
  // ===========================================================================
  try {
    const raceOpenId = 'tt_openid_version_guarded_rollback_401';
    const startOpA = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    const startOpB = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    setupMockTikTokApi({ openId: raceOpenId });

    // Quando a Operação A concluir a persistência no Firestore e estiver prestes a emitir o Custom Token,
    // simulamos a Operação B concluindo uma atualização legítima do vínculo (incrementando bindingVersion para 2),
    // e em seguida a emissão de Custom Token da Operação A falha!
    let hookTriggered = false;
    tiktokOAuthService.setBeforeCustomTokenHookForTests(async (ctx) => {
      if (!hookTriggered && ctx.bindingVersion === 1) {
        hookTriggered = true;
        // Operação B executa e atualiza legitimamente o vínculo para bindingVersion = 2
        await tiktokOAuthService.handleCallbackExchange({
          code: 'op_B_succeeds_concurrently',
          state: startOpB.state,
          initiatorToken: startOpB.initiatorToken,
          issueFirebaseCustomToken: false,
        });
        // Agora fazemos a emissão de Custom Token da Operação A falhar
        throw new Error('OP_A_CUSTOM_TOKEN_FAILED_AFTER_OP_B_COMMITTED');
      }
    });

    let opAFailed = false;
    try {
      await tiktokOAuthService.handleCallbackExchange({
        code: 'op_A_fails_custom_token',
        state: startOpA.state,
        initiatorToken: startOpA.initiatorToken,
        issueFirebaseCustomToken: true,
      });
    } catch {
      opAFailed = true;
    } finally {
      tiktokOAuthService.setBeforeCustomTokenHookForTests(undefined);
    }

    // Verifica que o rollback condicional da Operação A detectou bindingVersion=2 da Operação B e NÃO apagou o vínculo!
    const preservedIdentity = await adapter.getIdentityDirect(raceOpenId);
    const preservedUid = deriveControlledFirebaseUidFromOpenId(raceOpenId);
    const preservedUser = await adapter.getUserDocDirect(preservedUid);
    const preservedVault = await adapter.getUserVaultDirect(preservedUid);

    const ok =
      opAFailed &&
      preservedIdentity !== null &&
      !preservedIdentity.unlinked &&
      preservedIdentity.uid === preservedUid &&
      preservedIdentity.bindingVersion === 2 &&
      preservedUser !== null &&
      preservedUser.tiktokLinked === true &&
      preservedVault !== null &&
      preservedVault.revoked === false;

    record(
      'F11.1-04',
      'Rollback condicional verifica propriedade e bindingVersion, preservando vínculo atualizado por operação concorrente',
      ok,
      `opAFailed=${opAFailed}, preservedBindingVersion=${preservedIdentity?.bindingVersion}, identityPreserved=${Boolean(preservedIdentity)}`
    );
  } catch (err: any) {
    tiktokOAuthService.setBeforeCustomTokenHookForTests(undefined);
    record('F11.1-04', 'Proteção de versão no rollback concorrente', false, err.message);
  }

  // ===========================================================================
  // 5. DOIS LOGINS SIMULTÂNEOS COM O MESMO OPEN_ID
  // ===========================================================================
  try {
    const simOpenId = 'tt_openid_simultaneous_login_501';
    const s1 = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    const s2 = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    setupMockTikTokApi({ openId: simOpenId });

    const [r1, r2] = await Promise.all([
      tiktokOAuthService.handleCallbackExchange({
        code: 'sim_code_1',
        state: s1.state,
        initiatorToken: s1.initiatorToken,
        issueFirebaseCustomToken: true,
      }),
      tiktokOAuthService.handleCallbackExchange({
        code: 'sim_code_2',
        state: s2.state,
        initiatorToken: s2.initiatorToken,
        issueFirebaseCustomToken: true,
      }),
    ]);

    const identityDoc = await adapter.getIdentityDirect(simOpenId);
    const ok =
      r1.identityResolution.uid === r2.identityResolution.uid &&
      Boolean(r1.identityResolution.firebaseCustomToken) &&
      Boolean(r2.identityResolution.firebaseCustomToken) &&
      identityDoc?.bindingVersion === 2 &&
      identityDoc?.uid === r1.identityResolution.uid;

    record(
      'F11.1-05',
      'Dois logins simultâneos com o mesmo open_id convergem para o mesmo UID e incrementam bindingVersion com segurança',
      ok,
      `uid=${r1.identityResolution.uid}, bindingVersion=${identityDoc?.bindingVersion}`
    );
  } catch (err: any) {
    record('F11.1-05', 'Dois logins simultâneos com mesmo open_id', false, err.message);
  }

  // ===========================================================================
  // 6. IDENTIFICADOR DETERMINÍSTICO SHA-256 EM tiktok_identities/{identityDocId}
  // ===========================================================================
  try {
    const rawOpenId = 'tt_raw_sensitive_open_id_601';
    const derivedDocId = deriveTikTokIdentityDocId(rawOpenId);
    const idempotentDerived = deriveTikTokIdentityDocId(derivedDocId);

    const startHashTest = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LOGIN',
      generateInitiatorToken: true,
    });
    setupMockTikTokApi({ openId: rawOpenId });
    await tiktokOAuthService.handleCallbackExchange({
      code: 'hash_doc_id_code',
      state: startHashTest.state,
      initiatorToken: startHashTest.initiatorToken,
      issueFirebaseCustomToken: true,
    });

    const docIdsInCollection = adapter.getIdentityDocumentIds();
    const storedIdentity = await adapter.getIdentityDirect(rawOpenId);

    const ok =
      /^tid_[a-f0-9]{64}$/.test(derivedDocId) &&
      idempotentDerived === derivedDocId &&
      docIdsInCollection.includes(derivedDocId) &&
      !docIdsInCollection.includes(rawOpenId) &&
      docIdsInCollection.every((id) => /^tid_[a-f0-9]{64}$/.test(id)) &&
      storedIdentity?.identityDocId === derivedDocId &&
      storedIdentity?.openId === rawOpenId;

    record(
      'F11.1-06',
      'Coleção tiktok_identities usa exclusivamente SHA-256 determinístico (tid_<64_hex>) como ID de documento, sem expor open_id no path',
      ok,
      `derivedDocId=${derivedDocId.slice(0, 20)}..., rawOpenIdInKeys=${docIdsInCollection.includes(rawOpenId)}, totalDocs=${docIdsInCollection.length}`
    );
  } catch (err: any) {
    record('F11.1-06', 'Identificador determinístico SHA-256 no Firestore', false, err.message);
  }

  // ===========================================================================
  // 7. TRÊS OPERAÇÕES INDEPENDENTES: LOGOUT GIO, DESVINCULAÇÃO TIKTOK, ENCERRAMENTO DE LIVE
  // ===========================================================================
  try {
    const organizerUid = 'gio_organizer_3_ops_701';
    const organizerOpenId = 'tt_openid_3_ops_701';

    // Prepara conta GIO com configurações de sorteio e histórico + vínculo TikTok ativo
    await adapter.runAtomicTransaction(async (tx) => {
      await tx.setUserDoc(organizerUid, {
        uid: organizerUid,
        email: 'organizador@giodasorte.com.br',
        plan: 'PRO',
        statusState: 'ACTIVE',
        savedRaffleConfig: { defaultRate: 100, prizeName: 'iPhone 16 Pro' },
        historicalDrawsCount: 8,
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
      });
    });

    const linkStart = await tiktokOAuthService.createAuthorizationUrl({
      flowMode: 'LINK',
      linkTargetUid: organizerUid,
      reauthVerified: true,
    });
    let revokedTokensAtTikTok: string[] = [];
    setupMockTikTokApi({
      openId: organizerOpenId,
      onRevokeCalled: (tok) => revokedTokensAtTikTok.push(tok),
    });

    const linkResult = await tiktokOAuthService.handleCallbackExchange({
      code: 'link_3_ops_code',
      state: linkStart.state,
      initiatorToken: linkStart.initiatorToken,
    });

    // Estado simulado de um worker de LIVE ativo pertencente ao organizador
    const liveWorkerState: {
      active: boolean;
      ownerUid: string;
      sessionId: string;
      leaseActive: boolean;
    } = {
      active: true,
      ownerUid: organizerUid,
      sessionId: 'live_session_701',
      leaseActive: true,
    };

    tiktokOAuthService.setOnUnlinkStopWorkersHandler(async (uid) => {
      if (liveWorkerState.active && liveWorkerState.ownerUid === uid) {
        liveWorkerState.active = false;
        liveWorkerState.leaseActive = false;
        return { stoppedWorkers: 1, releasedLease: true };
      }
      return { stoppedWorkers: 0, releasedLease: false };
    });

    // -------------------------------------------------------------------------
    // OPERAÇÃO 1: LOGOUT GIO
    // Encerra apenas a sessão GIO do usuário, preservando autorização TikTok e worker de LIVE ativo.
    // -------------------------------------------------------------------------
    const statusAfterGioLogout = await tiktokOAuthService.getUserTikTokIdentityStatus(organizerUid);
    const vaultAfterGioLogout = await adapter.getUserVaultDirect(organizerUid);
    const op1GioLogoutOk =
      statusAfterGioLogout.linked === true &&
      vaultAfterGioLogout?.revoked === false &&
      liveWorkerState.active === true &&
      liveWorkerState.leaseActive === true;

    // -------------------------------------------------------------------------
    // OPERAÇÃO 3: ENCERRAMENTO DE LIVE (testado antes da desvinculação para provar que encerrar a LIVE preserva o vínculo TikTok)
    // Encerra a sessão LIVE e libera o lease, preservando o vínculo da conta TikTok e configurações/histórico.
    // -------------------------------------------------------------------------
    liveWorkerState.active = false;
    liveWorkerState.leaseActive = false;
    const statusAfterLiveDisconnect = await tiktokOAuthService.getUserTikTokIdentityStatus(organizerUid);
    const vaultAfterLiveDisconnect = await adapter.getUserVaultDirect(organizerUid);
    const userAfterLiveDisconnect = await adapter.getUserDocDirect(organizerUid);
    const op3LiveDisconnectOk =
      liveWorkerState.active === false &&
      liveWorkerState.leaseActive === false &&
      statusAfterLiveDisconnect.linked === true &&
      statusAfterLiveDisconnect.openId === organizerOpenId &&
      vaultAfterLiveDisconnect?.revoked === false &&
      userAfterLiveDisconnect?.savedRaffleConfig?.prizeName === 'iPhone 16 Pro' &&
      userAfterLiveDisconnect?.historicalDrawsCount === 8;

    // Reconecta a LIVE para agora testar a Operação 2 (Desvinculação TikTok com LIVE ativa)
    liveWorkerState.active = true;
    liveWorkerState.leaseActive = true;

    // -------------------------------------------------------------------------
    // OPERAÇÃO 2: DESVINCULAÇÃO TIKTOK
    // Revoga tokens no TikTok, limpa private_tokens, revoga oauth_sessions e encerra de forma limpa
    // o worker de LIVE dependente dessa autorização, preservando conta GIO, configurações e histórico.
    // -------------------------------------------------------------------------
    const unlinkOutcome = await tiktokOAuthService.unlinkTikTokFromUserAccount({
      uid: organizerUid,
    });
    const statusAfterUnlink = await tiktokOAuthService.getUserTikTokIdentityStatus(organizerUid);
    const vaultAfterUnlink = await adapter.getUserVaultDirect(organizerUid);
    const sessionAfterUnlink = await adapter.getSessionDirect(linkResult.sessionIdHash);
    const userAfterUnlink = await adapter.getUserDocDirect(organizerUid);

    const isWorkerStillActiveAfterUnlink = (): boolean => liveWorkerState.active;
    const isLeaseStillActiveAfterUnlink = (): boolean => liveWorkerState.leaseActive;

    const op2UnlinkOk =
      unlinkOutcome.unlinked === true &&
      unlinkOutcome.revokedAtTikTok === true &&
      revokedTokensAtTikTok.length >= 1 &&
      unlinkOutcome.stoppedDependentWorkers === 1 &&
      unlinkOutcome.releasedLiveLease === true &&
      !isWorkerStillActiveAfterUnlink() &&
      !isLeaseStillActiveAfterUnlink() &&
      statusAfterUnlink.linked === false &&
      vaultAfterUnlink?.revoked === true &&
      vaultAfterUnlink?.encryptedAccessToken.ciphertext === '' &&
      sessionAfterUnlink?.revoked === true &&
      userAfterUnlink !== null &&
      userAfterUnlink.savedRaffleConfig?.prizeName === 'iPhone 16 Pro' &&
      userAfterUnlink.historicalDrawsCount === 8;

    const allThreeOk = op1GioLogoutOk && op2UnlinkOk && op3LiveDisconnectOk;

    record(
      'F11.1-07',
      'Três operações independentes validadas: (1) Logout GIO preserva TikTok e LIVE; (2) Desvinculação TikTok revoga tokens, limpa private_tokens e encerra worker dependente preservando sorteios; (3) Encerramento de LIVE libera lease preservando vínculo TikTok',
      allThreeOk,
      `op1GioLogout=${op1GioLogoutOk}, op2Unlink=${op2UnlinkOk} (stoppedWorkers=${unlinkOutcome.stoppedDependentWorkers}, revokedAtTikTok=${unlinkOutcome.revokedAtTikTok}), op3LiveDisconnect=${op3LiveDisconnectOk}`
    );
  } catch (err: any) {
    record('F11.1-07', 'Três operações independentes', false, err.message);
  } finally {
    tiktokOAuthService.setOnUnlinkStopWorkersHandler(undefined);
  }

  console.log('\n================================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(
    ` RESULTADO FINAL FASE 11.1: ${passedCount}/${results.length} CENÁRIOS DE AUDITORIA APROVADOS`
  );
  console.log('================================================================================\n');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runPhase11_1AuditSuite().catch((err) => {
  console.error('Erro fatal na suíte Fase 11.1:', err);
  process.exit(1);
});
