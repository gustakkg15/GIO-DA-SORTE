import crypto from 'crypto';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../src/firebase.js';
import {
  TikTokOAuthService,
  DEV_APP_ORIGIN,
  PROD_APP_ORIGIN,
  OAUTH_CALLBACK_PATH,
  TIKTOK_OAUTH_V2_ENDPOINTS,
  resolveAuthorizedRedirectConfig,
  resolveValidatedScopes,
  resolveUserInfoEndpointForScope,
  diagnoseOAuthConfiguration,
  decryptTokenAes256Gcm,
  decryptTokenWithRotationInfo,
  OAuthSecurityError,
  FirestoreOAuthSessionDoc,
  FirestoreOAuthStateDoc,
} from '../src/server/tiktokOAuthService.js';

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`FALHA DE ASSERÇÃO: ${message}`);
  }
}

async function runOAuthProductionVerification() {
  console.log('========================================================================');
  console.log('AUDITORIA TÉCNICA FINAL — TIKTOK OAUTH 2.0 (FIRESTORE + AES-256-GCM)');
  console.log('========================================================================\n');

  const originalEnvKey = process.env.OAUTH_ENCRYPTION_KEY;
  const originalEnvPrevKey = process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;
  const originalEnvClientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const originalEnvClientKey = process.env.TIKTOK_CLIENT_KEY;

  const testClientKey = 'aw_prod_client_key_test_991';
  const testClientSecret = 'sec_prod_client_secret_high_entropy_882211_do_not_reuse_as_enc_key';

  // Chave exclusiva de 256 bits (64 hex chars = 32 bytes) para testes criptográficos reais
  const exclusiveKeyV1 = crypto.randomBytes(32).toString('hex');
  // Segunda chave exclusiva de 256 bits para testar rotação de chaves sem perda de sessão
  const exclusiveKeyV2 = crypto.randomBytes(32).toString('hex');

  // -------------------------------------------------------------------------
  // TESTE 1: [REAL] Allowlist Explícita de Domínios & Bloqueio de Host / Origin Forjados
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 1 | REAL] Validando Allowlist HTTPS e bloqueio de Host/Origin forjados...');

  const devConfig = resolveAuthorizedRedirectConfig({ explicitOrigin: DEV_APP_ORIGIN });
  const prodConfig = resolveAuthorizedRedirectConfig({ explicitOrigin: PROD_APP_ORIGIN });

  assertCondition(
    devConfig.redirectUri === `${DEV_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    `Redirect URI Dev incorreto: ${devConfig.redirectUri}`
  );
  assertCondition(
    prodConfig.redirectUri === `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    `Redirect URI Prod incorreto: ${prodConfig.redirectUri}`
  );

  let forgedBlocked = false;
  try {
    const fakeReq = {
      headers: { 'x-forwarded-host': 'evil-attacker.example.com' },
      get: () => 'evil-attacker.example.com',
    } as any;
    resolveAuthorizedRedirectConfig({ req: fakeReq, strictHeaderCheck: true });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'UNTRUSTED_HOST_HEADER') {
      forgedBlocked = true;
    }
  }
  assertCondition(forgedBlocked, 'Cabeçalho X-Forwarded-Host forjado NÃO foi bloqueado!');

  let forgedOriginBlocked = false;
  try {
    resolveAuthorizedRedirectConfig({ explicitOrigin: 'https://phishing-tiktok.com' });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'UNTRUSTED_ORIGIN') {
      forgedOriginBlocked = true;
    }
  }
  assertCondition(forgedOriginBlocked, 'Origin não autorizado NÃO foi bloqueado!');
  console.log('   ✅ SUCESSO: Allowlist HTTPS validada; Host e Origin forjados bloqueados.\n');

  // -------------------------------------------------------------------------
  // TESTE 2: [REAL] Revisão de Escopos TikTok (user.info.basic vs user.info.profile)
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 2 | REAL] Verificando escopos (user.info.basic sem username vs user.info.profile)...');

  // Por padrão, user.info.basic solicita APENAS open_id, display_name, avatar_url (NÃO solicita username)
  const defaultScopes = resolveValidatedScopes('user.info.basic');
  assertCondition(defaultScopes === 'user.info.basic', 'Escopo padrão deve ser user.info.basic');

  const basicEndpoint = resolveUserInfoEndpointForScope(defaultScopes);
  assertCondition(
    basicEndpoint === 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
    `Endpoint para user.info.basic não deve solicitar username: ${basicEndpoint}`
  );
  assertCondition(
    !basicEndpoint.includes('username'),
    'Endpoint básico NÃO pode incluir o campo username sem user.info.profile aprovado.'
  );

  // Se user.info.profile for passado mas NÃO estiver aprovado (profileScopeApproved=false), deve ser filtrado para user.info.basic
  const unapprovedProfileScope = resolveValidatedScopes('user.info.basic,user.info.profile', {
    profileScopeApproved: false,
  });
  assertCondition(
    unapprovedProfileScope === 'user.info.basic',
    `user.info.profile não aprovado deveria ter sido filtrado: ${unapprovedProfileScope}`
  );

  // Somente quando profileScopeApproved=true o escopo user.info.profile e o campo username são habilitados
  const approvedProfileScope = resolveValidatedScopes('user.info.basic,user.info.profile', {
    profileScopeApproved: true,
  });
  assertCondition(
    approvedProfileScope === 'user.info.basic,user.info.profile',
    'user.info.profile aprovado deveria ser mantido.'
  );
  const profileEndpoint = resolveUserInfoEndpointForScope(approvedProfileScope);
  assertCondition(
    profileEndpoint.includes('username'),
    'Endpoint com user.info.profile aprovado deve incluir username.'
  );
  console.log('   ✅ SUCESSO: user.info.basic usa estritamente open_id,display_name,avatar_url; user.info.profile exigido para username.\n');

  // -------------------------------------------------------------------------
  // TESTE 3: [REAL] Exigência de OAUTH_ENCRYPTION_KEY Exclusiva de 256 Bits
  //          (Sem fallback para TIKTOK_CLIENT_SECRET)
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 3 | REAL] Validando exigência de OAUTH_ENCRYPTION_KEY exclusiva de 256 bits...');

  process.env.TIKTOK_CLIENT_SECRET = testClientSecret;

  // 3a. Ausência de OAUTH_ENCRYPTION_KEY deve falhar (NÃO pode fazer fallback para TIKTOK_CLIENT_SECRET)
  delete process.env.OAUTH_ENCRYPTION_KEY;
  delete process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;
  let missingKeyBlocked = false;
  try {
    const instNoKey = new TikTokOAuthService('inst_no_key');
    await instNoKey.createAuthorizationUrl({
      explicitOrigin: PROD_APP_ORIGIN,
      clientKeyOverride: testClientKey,
    });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'MISSING_ENCRYPTION_KEY') {
      missingKeyBlocked = true;
    }
  }
  assertCondition(
    missingKeyBlocked,
    'Ausência de OAUTH_ENCRYPTION_KEY NÃO foi bloqueada (fallback indevido ainda ativo)!'
  );

  // 3b. Tentativa de usar TIKTOK_CLIENT_SECRET como OAUTH_ENCRYPTION_KEY deve ser rejeitada
  process.env.OAUTH_ENCRYPTION_KEY = testClientSecret;
  let reuseSecretBlocked = false;
  try {
    const instReuse = new TikTokOAuthService('inst_reuse_key');
    await instReuse.createAuthorizationUrl({
      explicitOrigin: PROD_APP_ORIGIN,
      clientKeyOverride: testClientKey,
    });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'ENCRYPTION_KEY_REUSE_FORBIDDEN') {
      reuseSecretBlocked = true;
    }
  }
  assertCondition(
    reuseSecretBlocked,
    'Reutilização de TIKTOK_CLIENT_SECRET como OAUTH_ENCRYPTION_KEY NÃO foi bloqueada!'
  );

  // 3c. Chave fraca (< 256 bits / < 32 bytes) deve ser rejeitada
  process.env.OAUTH_ENCRYPTION_KEY = 'chave_curta_123';
  let weakKeyBlocked = false;
  try {
    const instWeak = new TikTokOAuthService('inst_weak_key');
    await instWeak.createAuthorizationUrl({
      explicitOrigin: PROD_APP_ORIGIN,
      clientKeyOverride: testClientKey,
    });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'WEAK_ENCRYPTION_KEY') {
      weakKeyBlocked = true;
    }
  }
  assertCondition(weakKeyBlocked, 'Chave com menos de 256 bits NÃO foi bloqueada!');

  // Configurar a chave exclusiva de 256 bits V1 para os próximos testes
  process.env.OAUTH_ENCRYPTION_KEY = exclusiveKeyV1;
  console.log('   ✅ SUCESSO: Fallback removido; ausência de chave, reuso de Client Secret e chaves < 256 bits bloqueados.\n');

  // -------------------------------------------------------------------------
  // TESTE 4: [REAL FIRESTORE] Fluxo Web Oficial (Padrão sem PKCE) + Compatibilidade PKCE Opcional
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 4 | REAL FIRESTORE] Verificando Fluxo Web oficial (sem PKCE obrigatório) e persistência de state + ttlExpireAt...');

  const instanceA = new TikTokOAuthService('cloudrun_instance_A');

  // Fluxo Web padrão (usePkce = false por padrão na especificação TikTok Login Kit Web)
  const webAuthUrlData = await instanceA.createAuthorizationUrl({
    explicitOrigin: PROD_APP_ORIGIN,
    clientKeyOverride: testClientKey,
  });

  const parsedWebUrl = new URL(webAuthUrlData.url);
  assertCondition(
    `${parsedWebUrl.origin}${parsedWebUrl.pathname}` === TIKTOK_OAUTH_V2_ENDPOINTS.authorize,
    `URL de autorização não usa o endpoint v2 oficial: ${webAuthUrlData.url}`
  );
  assertCondition(
    webAuthUrlData.pkceEnabled === false && !parsedWebUrl.searchParams.has('code_challenge'),
    'Fluxo Web padrão não deve presumir obrigatoriedade de PKCE.'
  );
  assertCondition(
    parsedWebUrl.searchParams.get('scope') === 'user.info.basic',
    'Escopo padrão na URL deve ser user.info.basic.'
  );

  // Verificar documento oauth_states no Firestore real (incluindo ttlExpireAt Timestamp e expiresAt numérico)
  const stateSnapBefore = await getDoc(doc(db, 'oauth_states', webAuthUrlData.stateHash));
  assertCondition(stateSnapBefore.exists(), 'Documento oauth_states não foi persistido no Firestore.');
  const stateDocBefore = stateSnapBefore.data() as FirestoreOAuthStateDoc;
  assertCondition(stateDocBefore.consumed === false, 'State recém-criado já consta como consumido.');
  assertCondition(
    typeof stateDocBefore.expiresAt === 'number' && stateDocBefore.expiresAt > Date.now(),
    'Campo numérico expiresAt ausente ou inválido em oauth_states.'
  );
  assertCondition(
    stateDocBefore.ttlExpireAt && typeof stateDocBefore.ttlExpireAt.toMillis === 'function',
    'Campo Timestamp ttlExpireAt (política TTL do Firestore) ausente em oauth_states.'
  );

  // Também validar que PKCE opcional (usePkce: true) continua suportado se habilitado
  const pkceAuthUrlData = await instanceA.createAuthorizationUrl({
    explicitOrigin: PROD_APP_ORIGIN,
    clientKeyOverride: testClientKey,
    usePkce: true,
  });
  const parsedPkceUrl = new URL(pkceAuthUrlData.url);
  assertCondition(
    pkceAuthUrlData.pkceEnabled === true &&
      parsedPkceUrl.searchParams.get('code_challenge_method') === 'S256',
    'Modo opcional PKCE S256 falhou ao ser habilitado explicitamente.'
  );
  console.log('   ✅ SUCESSO: Fluxo Web oficial (state CSRF + client_secret backend) e campo ttlExpireAt validados no Firestore.\n');

  // -------------------------------------------------------------------------
  // TESTE 5: [FIRESTORE REAL + API TIKTOK SIMULADA] Múltiplas Instâncias Cloud Run
  //          (Instância A cria state -> Instância B atende callback) + AES-256-GCM
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 5 | FIRESTORE REAL + RESPOSTA TIKTOK SIMULADA] Callback na Instância B e criptografia AES-256-GCM...');

  let revokeEndpointCalled = false;
  let userInfoUrlCalled = '';

  const simulatedTikTokApiFetcher = async (url: string, init?: RequestInit) => {
    const bodyStr = typeof init?.body === 'string' ? init.body : '';
    const params = new URLSearchParams(bodyStr);

    if (url === TIKTOK_OAUTH_V2_ENDPOINTS.token) {
      const grantType = params.get('grant_type');
      if (grantType === 'authorization_code') {
        assertCondition(
          params.get('client_secret') === testClientSecret,
          'client_secret incorreto na troca no backend.'
        );
        // No fluxo Web padrão (pkceEnabled=false), code_verifier não é enviado
        assertCondition(
          !params.has('code_verifier'),
          'code_verifier não deve ser enviado quando pkceEnabled=false no fluxo Web padrão.'
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'act_live_secret_token_initial_111',
            refresh_token: 'rft_live_secret_refresh_initial_222',
            open_id: 'tiktok_openid_gioborelli_001',
            scope: 'user.info.basic',
            expires_in: 120, // 2 minutos (dentro da janela de auto-refresh de 5 min)
            refresh_expires_in: 86400 * 30,
          }),
        };
      }

      if (grantType === 'refresh_token') {
        const sentRefresh = params.get('refresh_token');
        assertCondition(
          sentRefresh === 'rft_live_secret_refresh_initial_222',
          `Refresh token enviado incorreto: ${sentRefresh}`
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'act_live_secret_token_ROTATED_333',
            refresh_token: 'rft_live_secret_refresh_ROTATED_444',
            open_id: 'tiktok_openid_gioborelli_001',
            scope: 'user.info.basic',
            expires_in: 86400,
            refresh_expires_in: 86400 * 30,
          }),
        };
      }
    }

    if (url.startsWith('https://open.tiktokapis.com/v2/user/info/')) {
      userInfoUrlCalled = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            user: {
              open_id: 'tiktok_openid_gioborelli_001',
              display_name: 'Gio Borelli Oficial',
              avatar_url: 'https://example.com/avatar.jpg',
            },
          },
        }),
      };
    }

    if (url === TIKTOK_OAUTH_V2_ENDPOINTS.revoke) {
      revokeEndpointCalled = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: {} }),
      };
    }

    throw new Error(`URL não reconhecida no fetcher simulado: ${url}`);
  };

  const instanceB = new TikTokOAuthService('cloudrun_instance_B', simulatedTikTokApiFetcher);
  const callbackOutcome = await instanceB.handleCallbackExchange({
    code: 'tiktok_auth_code_xyz_987',
    state: webAuthUrlData.state,
    clientKeyOverride: testClientKey,
    clientSecretOverride: testClientSecret,
  });

  assertCondition(
    userInfoUrlCalled === 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
    `URL de userInfo chamada incorretamente: ${userInfoUrlCalled}`
  );
  assertCondition(
    callbackOutcome.sessionDoc.userProfile.open_id === 'tiktok_openid_gioborelli_001' &&
      callbackOutcome.sessionDoc.userProfile.display_name === 'Gio Borelli Oficial' &&
      callbackOutcome.sessionDoc.userProfile.avatar_url === 'https://example.com/avatar.jpg' &&
      callbackOutcome.sessionDoc.userProfile.username === undefined,
    'Perfil salvo não respeitou estritamente open_id, display_name e avatar_url.'
  );

  // Verificar documento gravado no Firestore real
  const sessionSnap = await getDoc(doc(db, 'oauth_sessions', callbackOutcome.sessionIdHash));
  assertCondition(sessionSnap.exists(), 'Sessão não foi salva em oauth_sessions no Firestore.');
  const rawFirestoreSession = sessionSnap.data() as FirestoreOAuthSessionDoc;
  const serializedSession = JSON.stringify(rawFirestoreSession);

  assertCondition(
    !serializedSession.includes('act_live_secret_token_initial_111') &&
      !serializedSession.includes('rft_live_secret_refresh_initial_222'),
    'VAZAMENTO DETECTADO: token encontrado em texto puro no Firestore!'
  );
  assertCondition(
    rawFirestoreSession.encryptedAccessToken.keySource === 'SECRET_MANAGER_OAUTH_KEY' &&
      rawFirestoreSession.encryptedAccessToken.keyId.startsWith('kid_'),
    'Metadados de chave exclusiva (SECRET_MANAGER_OAUTH_KEY / keyId) ausentes no Firestore.'
  );
  assertCondition(
    rawFirestoreSession.ttlExpireAt && typeof rawFirestoreSession.ttlExpireAt.toMillis === 'function',
    'Campo ttlExpireAt (Timestamp para política TTL do Firestore) ausente em oauth_sessions.'
  );

  const keyIdV1 = rawFirestoreSession.encryptedAccessToken.keyId;
  console.log(`   ✅ SUCESSO: Sessão gravada no Firestore com AES-256-GCM (keyId=${keyIdV1}) e ttlExpireAt.\n`);

  // -------------------------------------------------------------------------
  // TESTE 6: [REAL FIRESTORE + REAL AES-256-GCM] Procedimento de Rotação de Chave
  //          (OAUTH_ENCRYPTION_KEY_PREVIOUS -> Nova OAUTH_ENCRYPTION_KEY sem perda de sessão)
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 6 | REAL FIRESTORE] Testando rotação de OAUTH_ENCRYPTION_KEY sem perda de acesso às sessões...');

  // Rotacionar chaves no ambiente: V2 passa a ser a primária, V1 vai para OAUTH_ENCRYPTION_KEY_PREVIOUS
  process.env.OAUTH_ENCRYPTION_KEY = exclusiveKeyV2;
  process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS = exclusiveKeyV1;

  // Descriptografia deve identificar que o ciphertext usava a chave anterior (usedPreviousKey = true)
  const rotCheckBefore = decryptTokenWithRotationInfo(rawFirestoreSession.encryptedAccessToken);
  assertCondition(
    rotCheckBefore.plaintext === 'act_live_secret_token_initial_111' &&
      rotCheckBefore.usedPreviousKey === true,
    'Keyring deveria descriptografar com a chave anterior e sinalizar usedPreviousKey=true.'
  );

  // Executar rotação transparente da chave na sessão sem perder o acesso nem invalidar o cookie atual
  const keyRotOutcome = await instanceB.rotateSessionEncryptionKey(callbackOutcome.sessionToken);
  assertCondition(keyRotOutcome.rotatedKey === true, 'Sessão deveria ter tido sua chave rotacionada.');
  assertCondition(
    keyRotOutcome.activeKeyId !== keyIdV1,
    `Novo keyId (${keyRotOutcome.activeKeyId}) deveria ser diferente do anterior (${keyIdV1}).`
  );

  // Agora remover completamente a chave antiga V1 de OAUTH_ENCRYPTION_KEY_PREVIOUS e provar que a sessão continua acessível com V2!
  delete process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;
  const sessionSnapAfterKeyRot = await getDoc(doc(db, 'oauth_sessions', callbackOutcome.sessionIdHash));
  const sessionAfterKeyRot = sessionSnapAfterKeyRot.data() as FirestoreOAuthSessionDoc;
  const decryptedWithNewKeyOnly = decryptTokenAes256Gcm(sessionAfterKeyRot.encryptedAccessToken);
  assertCondition(
    decryptedWithNewKeyOnly === 'act_live_secret_token_initial_111',
    'Sessão perdeu acesso após remoção da chave antiga!'
  );
  console.log(`   ✅ SUCESSO: Chave rotacionada (${keyIdV1} -> ${keyRotOutcome.activeKeyId}) no Firestore sem perda de sessão!\n`);

  // -------------------------------------------------------------------------
  // TESTE 7: [REAL FIRESTORE] Uso Único Estrito (Bloqueio de Replay Attack)
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 7 | REAL FIRESTORE] Testando bloqueio de Replay Attack do state...');
  let replayBlocked = false;
  try {
    await instanceA.handleCallbackExchange({
      code: 'tiktok_auth_code_replay',
      state: webAuthUrlData.state,
      clientKeyOverride: testClientKey,
      clientSecretOverride: testClientSecret,
    });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'CSRF_STATE_REPLAYED') {
      replayBlocked = true;
    }
  }
  assertCondition(replayBlocked, 'Replay attack com o mesmo state NÃO foi bloqueado!');
  console.log('   ✅ SUCESSO: Replay bloqueado pela transação atômica do Firestore (CSRF_STATE_REPLAYED).\n');

  // -------------------------------------------------------------------------
  // TESTE 8: [REAL FIRESTORE] Validação de expiresAt em TODAS as Operações
  //          (Sem depender da exclusão automática assíncrona do TTL do Firestore)
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 8 | REAL FIRESTORE] Validando expiresAt em todas as operações (independente da exclusão TTL)...');

  // 8a. State expirado ainda presente no Firestore (antes do TTL deletar)
  const expiredAuthReq = await instanceA.createAuthorizationUrl({
    explicitOrigin: DEV_APP_ORIGIN,
    clientKeyOverride: testClientKey,
    ttlMs: -15000,
  });
  let expiredStateBlocked = false;
  try {
    await instanceB.handleCallbackExchange({
      code: 'code_exp',
      state: expiredAuthReq.state,
      clientKeyOverride: testClientKey,
      clientSecretOverride: testClientSecret,
    });
  } catch (err) {
    if (err instanceof OAuthSecurityError && err.code === 'CSRF_STATE_EXPIRED') {
      expiredStateBlocked = true;
    }
  }
  assertCondition(expiredStateBlocked, 'State expirado presente no banco NÃO foi bloqueado em consumeStateAtomic!');

  // 8b. Criar uma sessão de teste e forçar sessionExpiresAt no passado no Firestore (documento ainda não excluído pelo TTL)
  const tempStateForExpSession = await instanceA.createAuthorizationUrl({
    explicitOrigin: PROD_APP_ORIGIN,
    clientKeyOverride: testClientKey,
  });
  const expSessionCallback = await instanceB.handleCallbackExchange({
    code: 'code_for_exp_session',
    state: tempStateForExpSession.state,
    clientKeyOverride: testClientKey,
    clientSecretOverride: testClientSecret,
  });

  // Forçar expiração da sessão mantendo o documento vivo no Firestore
  await updateDoc(doc(db, 'oauth_sessions', expSessionCallback.sessionIdHash), {
    sessionExpiresAt: Date.now() - 60000,
    refreshTokenExpiresAt: Date.now() - 60000,
  });

  // validateAndResolveSession deve rejeitar imediatamente com SESSION_EXPIRED
  const valExp = await instanceB.validateAndResolveSession({
    sessionToken: expSessionCallback.sessionToken,
  });
  assertCondition(
    valExp.valid === false && valExp.reason === 'SESSION_EXPIRED',
    'validateAndResolveSession não bloqueou sessão expirada ainda existente no Firestore!'
  );

  // refreshAndRotateSession também deve rejeitar sessão expirada
  let refreshExpBlocked = false;
  try {
    await instanceB.refreshAndRotateSession({
      sessionToken: expSessionCallback.sessionToken,
      clientKeyOverride: testClientKey,
      clientSecretOverride: testClientSecret,
    });
  } catch (err) {
    if (err instanceof OAuthSecurityError && (err.code === 'SESSION_EXPIRED' || err.code === 'SESSION_REVOKED')) {
      refreshExpBlocked = true;
    }
  }
  assertCondition(refreshExpBlocked, 'refreshAndRotateSession não bloqueou sessão expirada!');
  console.log('   ✅ SUCESSO: expiresAt e sessionExpiresAt validados em todas as operações sem depender da exclusão TTL.\n');

  // -------------------------------------------------------------------------
  // TESTE 9: [FIRESTORE REAL + API TIKTOK SIMULADA] Reinicialização do Servidor (Instância C)
  //          + Auto-Refresh + Rotação de Sessão + Logout
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 9 | FIRESTORE REAL + RESPOSTA TIKTOK SIMULADA] Restart (Instância C), Auto-Refresh, Rotação e Logout...');

  const instanceCAfterRestart = new TikTokOAuthService(
    'cloudrun_instance_C_restarted',
    simulatedTikTokApiFetcher
  );

  const validationAfterRestart = await instanceCAfterRestart.validateAndResolveSession({
    sessionToken: callbackOutcome.sessionToken,
    autoRefresh: true,
    clientKeyOverride: testClientKey,
    clientSecretOverride: testClientSecret,
  });

  assertCondition(validationAfterRestart.valid === true, 'Sessão deveria ser válida após restart.');
  assertCondition(validationAfterRestart.rotated === true, 'Sessão deveria ter sido rotacionada no auto-refresh.');
  assertCondition(
    Boolean(validationAfterRestart.newSessionToken) &&
      validationAfterRestart.newSessionToken !== callbackOutcome.sessionToken,
    'Novo sessionToken rotacionado não foi emitido.'
  );

  const rotatedRefreshDecrypted = decryptTokenAes256Gcm(
    validationAfterRestart.sessionDoc!.encryptedRefreshToken
  );
  assertCondition(
    rotatedRefreshDecrypted === 'rft_live_secret_refresh_ROTATED_444',
    'Novo refresh_token do TikTok NÃO foi atualizado no Firestore!'
  );

  const logoutOutcome = await instanceCAfterRestart.revokeAndLogoutSession({
    sessionToken: validationAfterRestart.newSessionToken!,
    clientKeyOverride: testClientKey,
    clientSecretOverride: testClientSecret,
  });
  assertCondition(
    logoutOutcome.revokedInFirestore === true && logoutOutcome.revokedAtTikTok === true && revokeEndpointCalled,
    'Logout não revogou e limpou a sessão corretamente.'
  );
  console.log('   ✅ SUCESSO: Restart, Auto-Refresh, atualização de refresh_token, rotação de sessão e Logout validados.\n');

  // -------------------------------------------------------------------------
  // TESTE 10: [CHAMADA HTTP REAL AO TIKTOK] Verificação Direta nos Endpoints Reais
  //           (open.tiktokapis.com) vs Credenciais do Ambiente
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 10 | CHAMADA HTTP REAL AO TIKTOK] Testando conectividade real com open.tiktokapis.com...');

  // Restaurar variáveis originais do ambiente para inspecionar o estado real do container
  if (originalEnvKey !== undefined) process.env.OAUTH_ENCRYPTION_KEY = originalEnvKey;
  else delete process.env.OAUTH_ENCRYPTION_KEY;
  if (originalEnvPrevKey !== undefined) process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS = originalEnvPrevKey;
  else delete process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;
  if (originalEnvClientSecret !== undefined) process.env.TIKTOK_CLIENT_SECRET = originalEnvClientSecret;
  else delete process.env.TIKTOK_CLIENT_SECRET;
  if (originalEnvClientKey !== undefined) process.env.TIKTOK_CLIENT_KEY = originalEnvClientKey;
  else delete process.env.TIKTOK_CLIENT_KEY;

  // Executar chamada HTTP REAL (sem mock) ao endpoint de token v2 do TikTok
  const realTikTokTokenProbe = await fetch(TIKTOK_OAUTH_V2_ENDPOINTS.token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || 'probe_unconfigured_client_key',
      client_secret: process.env.TIKTOK_CLIENT_SECRET || 'probe_unconfigured_client_secret',
      code: 'probe_authorization_code',
      grant_type: 'authorization_code',
      redirect_uri: `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    }).toString(),
  });
  const realTokenJson: Record<string, any> = await realTikTokTokenProbe.json().catch(() => ({}));

  assertCondition(
    realTikTokTokenProbe.status >= 200 && realTikTokTokenProbe.status < 500 && Boolean(realTokenJson.error),
    `Resposta inesperada do servidor real open.tiktokapis.com: HTTP ${realTikTokTokenProbe.status}`
  );

  // Executar chamada HTTP REAL (sem mock) ao endpoint userInfoBasic v2 do TikTok
  const realTikTokUserProbe = await fetch(TIKTOK_OAUTH_V2_ENDPOINTS.userInfoBasic, {
    method: 'GET',
    headers: { Authorization: 'Bearer probe_invalid_token_check' },
  });
  const realUserJson: Record<string, any> = await realTikTokUserProbe.json().catch(() => ({}));
  assertCondition(
    realTikTokUserProbe.status === 401 || Boolean(realUserJson.error),
    `Resposta inesperada do endpoint real user/info v2: HTTP ${realTikTokUserProbe.status}`
  );

  const hasRealClientKey = Boolean(process.env.TIKTOK_CLIENT_KEY?.trim());
  const hasRealClientSecret = Boolean(process.env.TIKTOK_CLIENT_SECRET?.trim());
  const hasRealEncKey = Boolean(process.env.OAUTH_ENCRYPTION_KEY?.trim());

  console.log(`   ✅ Conectividade HTTP real com ${TIKTOK_OAUTH_V2_ENDPOINTS.token}: HTTP ${realTikTokTokenProbe.status} (resposta oficial TikTok: error="${realTokenJson.error}")`);
  console.log(`   ✅ Conectividade HTTP real com ${TIKTOK_OAUTH_V2_ENDPOINTS.userInfoBasic}: HTTP ${realTikTokUserProbe.status} (resposta oficial TikTok: code="${realUserJson?.error?.code || 'access_token_invalid'}")`);
  console.log(`   ℹ️ Status das variáveis de ambiente reais neste container:`);
  console.log(`      - TIKTOK_CLIENT_KEY configurada:    ${hasRealClientKey ? 'SIM' : 'NÃO (aguardando cadastro no Secret Manager)'}`);
  console.log(`      - TIKTOK_CLIENT_SECRET configurada: ${hasRealClientSecret ? 'SIM' : 'NÃO (aguardando cadastro no Secret Manager)'}`);
  console.log(`      - OAUTH_ENCRYPTION_KEY configurada: ${hasRealEncKey ? 'SIM' : 'NÃO (aguardando cadastro no Secret Manager)'}\n`);

  // -------------------------------------------------------------------------
  // TESTE 11: [REAL] Diagnóstico Completo (/api/tiktok/auth/status & diagnoseOAuthConfiguration)
  // -------------------------------------------------------------------------
  console.log('▶ [TESTE 11 | REAL] Validando motor de diagnóstico de credenciais e prontidão do fluxo OAuth...');

  // 11a. Estado sem credenciais: deve apontar canInitiateAuthFlow=false e detalhar as variáveis ausentes
  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_SECRET;
  delete process.env.OAUTH_ENCRYPTION_KEY;
  delete process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;

  const diagMissing = diagnoseOAuthConfiguration({ explicitOrigin: PROD_APP_ORIGIN });
  assertCondition(
    diagMissing.status === 'MISCONFIGURED' &&
      diagMissing.canInitiateAuthFlow === false &&
      diagMissing.clientKeyConfigured === false &&
      diagMissing.clientSecretConfigured === false &&
      diagMissing.encryptionKeyConfigured === false &&
      diagMissing.configurationErrors.length >= 3,
    'Diagnóstico deveria detectar ausência de TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e OAUTH_ENCRYPTION_KEY!'
  );

  // 11b. Estado com as 3 variáveis populadas corretamente (e OAUTH_ENCRYPTION_KEY_PREVIOUS vazia):
  // deve aprovar canInitiateAuthFlow=true, autoteste AES-256-GCM e preflight da URL de autorização
  process.env.TIKTOK_CLIENT_KEY = testClientKey;
  process.env.TIKTOK_CLIENT_SECRET = testClientSecret;
  process.env.OAUTH_ENCRYPTION_KEY = exclusiveKeyV1;
  delete process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;

  const diagReady = diagnoseOAuthConfiguration({ explicitOrigin: PROD_APP_ORIGIN });
  assertCondition(
    diagReady.status === 'READY' &&
      diagReady.canInitiateAuthFlow === true &&
      diagReady.authFlowReady === true &&
      diagReady.clientKeyConfigured === true &&
      diagReady.clientSecretConfigured === true &&
      diagReady.encryptionKeyConfigured === true &&
      diagReady.encryptionSelfTestPassed === true &&
      diagReady.authFlowPreflight.ready === true &&
      diagReady.authFlowPreflight.sampleAuthUrlConstructed === true &&
      diagReady.configurationErrors.length === 0,
    `Diagnóstico deveria aprovar início do fluxo com variáveis válidas! Erros: ${diagReady.configurationErrors.join(', ')}`
  );

  // Restaurar variáveis originais do ambiente
  if (originalEnvKey !== undefined) process.env.OAUTH_ENCRYPTION_KEY = originalEnvKey;
  else delete process.env.OAUTH_ENCRYPTION_KEY;
  if (originalEnvPrevKey !== undefined) process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS = originalEnvPrevKey;
  else delete process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS;
  if (originalEnvClientSecret !== undefined) process.env.TIKTOK_CLIENT_SECRET = originalEnvClientSecret;
  else delete process.env.TIKTOK_CLIENT_SECRET;
  if (originalEnvClientKey !== undefined) process.env.TIKTOK_CLIENT_KEY = originalEnvClientKey;
  else delete process.env.TIKTOK_CLIENT_KEY;

  console.log('   ✅ SUCESSO: Motor de diagnóstico valida TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, OAUTH_ENCRYPTION_KEY e início do fluxo sem erros.\n');

  console.log('========================================================================');
  console.log('🏆 TODOS OS 11 BLOCOS DE AUDITORIA E TESTES EXECUTADOS COM SUCESSO!');
  console.log('========================================================================');
}

runOAuthProductionVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ ERRO FATAL NOS TESTES DE PRODUÇÃO OAUTH:', err);
    process.exit(1);
  });
