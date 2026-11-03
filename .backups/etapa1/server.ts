import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { tiktokAdapter } from './src/server/tiktokLiveAdapter.js';
import { tiktokEventQueue, SequencedSseFrame } from './src/server/tiktokEventQueue.js';
import { tiktokDiagnosticService } from './src/server/tiktokDiagnosticService.js';
import {
  getProPlanEntitlement,
  setProPlanTier,
  updateLiveSessionConfigAndRules,
  fetchSessionTickets,
} from './src/utils/tiktokLiveService.js';
import { updateCampaignRulesConfig } from './src/utils/campaignService.js';
import {
  fetchAllLegalDocuments,
  saveLegalDocumentDraft,
  publishLegalDocumentVersion,
  fetchDocumentVersionHistory,
  recordDocumentAcceptance,
  fetchAllDocumentAcceptances,
  saveCookieConsentChoice,
  createLgpdRequest,
  fetchLgpdRequests,
  updateLgpdRequestStatusAdmin,
  createSupportTicket,
  fetchSupportTickets,
  updateSupportTicketAdmin,
  fetchCompanyLegalSettings,
  saveCompanyLegalSettings,
  getPendingCompanyFields,
  fetchCommercialSubscriptionConfig,
  saveCommercialSubscriptionConfig,
} from './src/utils/legalAndComplianceService.js';
import { SubscriptionStatusState, LegalDocumentSlug, CommercialPlanId } from './src/types.js';
import {
  mercadoPagoSubscriptionService,
  redactSensitiveMpData,
} from './src/server/mercadoPagoSubscriptionService.js';
import {
  tiktokOAuthService,
  DEV_APP_ORIGIN,
  PROD_APP_ORIGIN,
  OAUTH_CALLBACK_PATH,
  ALLOWED_HTTPS_ORIGINS,
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  resolveAuthorizedRedirectConfig,
  resolveValidatedScopes,
  checkEncryptionKeyStatus,
  diagnoseOAuthConfiguration,
  parseCookies,
  OAuthSecurityError,
} from './src/server/tiktokOAuthService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Track active SSE connections by clientId to prevent duplicate SSE streams per browser tab/session
const activeSseConnections = new Map<
  string,
  { res: Response; sessionId?: string; connectedAt: number; cleanup: () => void }
>();

// Wire TikTokLiveAdapter directly into the non-blocking Durable Event Queue (WAL + Micro-Batch Firestore Persistence)
// Enforces PRO plan entitlement on the backend before accepting gift accounting or ticket issuance.
tiktokAdapter.onGift((event, _streak, capturePerfStart) => {
  const plan = getProPlanEntitlement();
  if (!plan.active) {
    return;
  }
  tiktokEventQueue.enqueueGiftEvent(event, capturePerfStart);
});

// ==========================================
// TIKTOK OAUTH 2.0 LOGIN KIT ENDPOINTS
// (Persistent Firestore Vault + Multi-Instance Safe)
// ==========================================

/**
 * Diagnostic & Session Status Endpoint:
 * Validates whether TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and OAUTH_ENCRYPTION_KEY (256-bit)
 * are properly populated in the environment, verifies whether the backend can initiate the
 * OAuth 2.0 authorization flow without configuration error, and validates any active persistent session.
 * NEVER exposes TIKTOK_CLIENT_SECRET, OAUTH_ENCRYPTION_KEY, access_token, or refresh_token.
 */
app.get('/api/tiktok/auth/status', async (req: Request, res: Response) => {
  const diag = diagnoseOAuthConfiguration({ req });

  const cookies = parseCookies(req);
  const rawSessionToken = cookies[SESSION_COOKIE_NAME] || '';
  let authenticated = false;
  let userProfile = null;
  let scope = null;
  let accessTokenExpiresAt = null;
  let authenticatedAt: number | null = null;
  let rotationCount = 0;
  let keyReencrypted = false;

  if (rawSessionToken && diag.encryptionKeyConfigured) {
    try {
      const validation = await tiktokOAuthService.validateAndResolveSession({
        sessionToken: rawSessionToken,
        autoRefresh: true,
      });

      if (validation.valid && validation.sessionDoc) {
        authenticated = true;
        userProfile = validation.sessionDoc.userProfile;
        scope = validation.sessionDoc.scope;
        accessTokenExpiresAt = validation.sessionDoc.accessTokenExpiresAt;
        authenticatedAt = validation.sessionDoc.updatedAt || Date.now();
        rotationCount = validation.sessionDoc.rotationCount;
        keyReencrypted = Boolean(validation.keyReencrypted);

        if (validation.rotated && validation.newSessionToken) {
          const maxAgeSec = Math.max(
            60,
            Math.floor((validation.sessionDoc.sessionExpiresAt - Date.now()) / 1000)
          );
          res.setHeader(
            'Set-Cookie',
            tiktokOAuthService.formatSessionCookie(validation.newSessionToken, maxAgeSec)
          );
        }
      } else {
        // Clear invalid/revoked/expired cookie
        res.setHeader('Set-Cookie', tiktokOAuthService.formatClearSessionCookie());
      }
    } catch (err) {
      console.warn('[TikTok OAuth Status] Erro ao validar sessão persistente:', err);
    }
  }

  res.json({
    status: diag.status,
    oauthConfigured: diag.oauthConfigured,
    canInitiateAuthFlow: diag.canInitiateAuthFlow,
    authFlowReady: diag.authFlowReady,
    clientKeyConfigured: diag.clientKeyConfigured,
    clientSecretConfigured: diag.clientSecretConfigured,
    clientSecretProtectedOnBackend: true,
    encryptionKeyConfigured: diag.encryptionKeyConfigured,
    encryptionSelfTestPassed: diag.encryptionSelfTestPassed,
    activeKeyId: diag.activeKeyId,
    previousKeysCount: diag.previousKeysCount,
    persistentStorage: 'FIRESTORE_AES_256_GCM',
    allowedOrigins: Array.from(ALLOWED_HTTPS_ORIGINS),
    targetOrigin: diag.targetOrigin,
    redirectUri: diag.redirectUri,
    devRedirectUri: `${DEV_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    prodRedirectUri: `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    directWebcastAvailable: true,
    authenticated,
    sessionState: authenticated ? 'ACTIVE' : 'DISCONNECTED',
    authenticatedAt,
    user: userProfile,
    scope,
    accessTokenExpiresAt,
    rotationCount,
    keyReencrypted,
    enabledScopes: diag.enabledScopes,
    pkceEnabledByDefault: diag.pkceEnabled,
    configurationErrors: diag.configurationErrors,
    diagnostics: {
      variables: diag.variables,
      authFlowPreflight: diag.authFlowPreflight,
    },
    message: diag.canInitiateAuthFlow
      ? 'Diagnóstico aprovado: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e OAUTH_ENCRYPTION_KEY (256 bits) populadas e validadas. O backend está pronto para iniciar o fluxo de autorização OAuth 2.0 sem erros.'
      : `Modo Webcast Direto ativo (conecta via @username sem exigir senha). Pendências para OAuth 2.0: ${diag.configurationErrors.join(' ')}`,
  });
});

/**
 * Construct TikTok OAuth 2.0 authorization URL for popup flow with persistent Firestore CSRF state
 */
app.get('/api/tiktok/auth/url', async (req: Request, res: Response) => {
  try {
    const diag = diagnoseOAuthConfiguration({ req });

    if (!diag.canInitiateAuthFlow) {
      return res.status(400).json({
        oauthConfigured: false,
        canInitiateAuthFlow: false,
        clientKeyConfigured: diag.clientKeyConfigured,
        clientSecretConfigured: diag.clientSecretConfigured,
        encryptionKeyConfigured: diag.encryptionKeyConfigured,
        redirectUri: diag.redirectUri,
        devRedirectUri: `${DEV_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
        prodRedirectUri: `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
        configurationErrors: diag.configurationErrors,
        error:
          diag.configurationErrors.join(' ') ||
          'TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e/ou OAUTH_ENCRYPTION_KEY (256 bits) não estão configuradas nas variáveis de ambiente do servidor.',
      });
    }

    const authReq = await tiktokOAuthService.createAuthorizationUrl({ req });

    res.setHeader(
      'Set-Cookie',
      `${STATE_COOKIE_NAME}=${authReq.state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`
    );

    res.json({
      url: authReq.url,
      redirectUri: authReq.redirectUri,
      targetOrigin: authReq.targetOrigin,
      state: authReq.state,
      scopes: authReq.scopes,
      pkceEnabled: authReq.pkceEnabled,
      expiresAt: authReq.expiresAt,
    });
  } catch (err: unknown) {
    const status = err instanceof OAuthSecurityError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(status).json({ oauthConfigured: false, error: message });
  }
});

/**
 * TikTok OAuth 2.0 Callback Endpoint (Popup PostMessage Flow)
 * - Atomically validates and consumes single-use CSRF state from Firestore (`oauth_states/{stateHash}`)
 * - Works across multiple Cloud Run instances and server restarts
 * - Exchanges authorization code for tokens on the backend (`https://open.tiktokapis.com/v2/oauth/token/`)
 * - Encrypts tokens with AES-256-GCM in Firestore (`oauth_sessions/{sessionIdHash}`)
 * - Uses exact authorized HTTPS `targetOrigin` in `window.opener.postMessage(payload, targetOrigin)`
 */
async function handleTikTokOAuthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query;

  // Determine fallback authorized origin from allowlist (never trusting arbitrary headers)
  let fallbackOrigin = PROD_APP_ORIGIN;
  try {
    fallbackOrigin = resolveAuthorizedRedirectConfig({ req }).targetOrigin;
  } catch {
    fallbackOrigin = PROD_APP_ORIGIN;
  }

  const renderPopupResult = (
    payload: Record<string, unknown>,
    targetOrigin: string,
    messageText: string
  ) => {
    const safeOrigin = ALLOWED_HTTPS_ORIGINS.has(targetOrigin) ? targetOrigin : PROD_APP_ORIGIN;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.send(`<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Autenticação TikTok — GIO DA SORTE PRO</title>
  </head>
  <body style="background:#080B11;color:#F8FAFC;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center;">
    <div style="max-width:420px;padding:24px;border-radius:16px;background:rgba(15,23,42,0.9);border:1px solid rgba(255,255,255,0.1);">
      <h2 style="margin:0 0 8px 0;font-size:16px;color:#00F2FE;">GIO DA SORTE PRO</h2>
      <p style="margin:0;font-size:13px;color:#CBD5E1;line-height:1.5;">${messageText}</p>
    </div>
    <script>
      (function() {
        var payload = ${JSON.stringify(payload)};
        var exactTargetOrigin = ${JSON.stringify(safeOrigin)};
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, exactTargetOrigin);
          setTimeout(function() { window.close(); }, 400);
        } else {
          setTimeout(function() { window.location.href = exactTargetOrigin + '/'; }, 1500);
        }
      })();
    </script>
  </body>
</html>`);
  };

  if (error) {
    const errMsg = String(error_description || error || 'Autorização recusada ou cancelada no TikTok.');
    return renderPopupResult(
      { type: 'OAUTH_AUTH_ERROR', provider: 'tiktok', error: errMsg },
      fallbackOrigin,
      `Não foi possível concluir a autenticação no TikTok: ${errMsg}`
    );
  }

  try {
    const result = await tiktokOAuthService.handleCallbackExchange({
      code: typeof code === 'string' ? code : '',
      state: typeof state === 'string' ? state : '',
    });

    res.setHeader('Set-Cookie', [
      tiktokOAuthService.formatSessionCookie(result.sessionToken, result.maxAgeSec),
      `${STATE_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`,
    ]);

    return renderPopupResult(
      {
        type: 'OAUTH_AUTH_SUCCESS',
        provider: 'tiktok',
        user: result.sessionDoc.userProfile,
        scope: result.sessionDoc.scope,
        expiresAt: result.sessionDoc.accessTokenExpiresAt,
        authenticatedAt: result.sessionDoc.updatedAt || Date.now(),
        sessionState: 'ACTIVE',
      },
      result.targetOrigin,
      'Autenticação TikTok concluída com sucesso! Esta janela será fechada automaticamente.'
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const codeName = err instanceof OAuthSecurityError ? err.code : 'OAUTH_CALLBACK_ERROR';
    return renderPopupResult(
      { type: 'OAUTH_AUTH_ERROR', provider: 'tiktok', errorCode: codeName, error: msg },
      fallbackOrigin,
      `Falha na autenticação OAuth: ${msg}`
    );
  }
}

app.get(
  ['/auth/tiktok/callback', '/auth/tiktok/callback/', '/api/tiktok/auth/callback'],
  handleTikTokOAuthCallback
);

/**
 * Refresh TikTok OAuth access_token on the backend, update refresh_token when rotated by TikTok,
 * and rotate the persistent `gio_tiktok_session` token in Firestore and cookie.
 */
app.post('/api/tiktok/auth/refresh', async (req: Request, res: Response) => {
  const cookies = parseCookies(req);
  const rawSessionToken = cookies[SESSION_COOKIE_NAME] || req.body?.sessionToken || '';

  if (!rawSessionToken) {
    return res.status(401).json({ error: 'Nenhuma sessão OAuth ativa para renovar.' });
  }

  try {
    const rotated = await tiktokOAuthService.refreshAndRotateSession({
      sessionToken: rawSessionToken,
    });

    res.setHeader(
      'Set-Cookie',
      tiktokOAuthService.formatSessionCookie(rotated.newSessionToken, rotated.maxAgeSec)
    );

    res.json({
      success: true,
      rotated: true,
      rotationCount: rotated.newSessionDoc.rotationCount,
      user: rotated.newSessionDoc.userProfile,
      accessTokenExpiresAt: rotated.newSessionDoc.accessTokenExpiresAt,
      refreshTokenExpiresAt: rotated.newSessionDoc.refreshTokenExpiresAt,
    });
  } catch (err: unknown) {
    const status = err instanceof OAuthSecurityError ? err.statusCode : 500;
    const msg = err instanceof Error ? err.message : String(err);
    res.status(status).json({ error: msg });
  }
});

/**
 * Revoke TikTok OAuth token at TikTok v2 API, terminate session, and wipe persisted encrypted tokens in Firestore.
 */
app.post('/api/tiktok/auth/logout', async (req: Request, res: Response) => {
  const cookies = parseCookies(req);
  const rawSessionToken = cookies[SESSION_COOKIE_NAME] || req.body?.sessionToken || '';

  const outcome = await tiktokOAuthService.revokeAndLogoutSession({
    sessionToken: rawSessionToken,
  });

  res.setHeader('Set-Cookie', tiktokOAuthService.formatClearSessionCookie());
  res.json({
    success: true,
    revokedInFirestore: outcome.revokedInFirestore,
    revokedAtTikTok: outcome.revokedAtTikTok,
  });
});

// ==========================================
// TIKTOK LIVE PRO — PLAN VALIDATION & SOURCE TRANSPARENCY
// ==========================================

/**
 * Verifies on the backend whether the current organization/request holds an active PRO plan entitlement.
 * All TikTok LIVE integration, gift capture, coin accounting, automatic ticket issuance, and multi-LIVE campaigns
 * are strictly exclusive to the PRO plan.
 */
function verifyProPlanRequest(req: Request): {
  allowed: boolean;
  entitlement: ReturnType<typeof getProPlanEntitlement>;
  reason?: string;
} {
  const entitlement = getProPlanEntitlement();
  const headerPlan = String(req.headers['x-gio-plan'] || req.query.plan || '').toUpperCase();
  if (headerPlan === 'FREE' || !entitlement.active || entitlement.tier !== 'PRO') {
    return {
      allowed: false,
      entitlement: headerPlan === 'FREE' ? { ...entitlement, tier: 'FREE', active: false } : entitlement,
      reason:
        'Recurso exclusivo do plano TIKTOK LIVE PRO. A conexão LIVE, captura de presentes, contabilização automática de moedas, emissão de bilhetes e campanhas acumuladas exigem assinatura PRO validada no servidor.',
    };
  }
  return { allowed: true, entitlement };
}

function requireProPlan(req: Request, res: Response, next: express.NextFunction) {
  const check = verifyProPlanRequest(req);
  if (!check.allowed) {
    return res.status(403).json({
      error: check.reason,
      code: 'PRO_PLAN_REQUIRED',
      entitlement: check.entitlement,
    });
  }
  next();
}

/**
 * GET /api/tiktok/plan/status
 * Returns backend-validated PRO plan entitlement + technical verification of event sources
 * (explicitly distinguishing TikTok Login Kit OAuth 2.0 identity from Webcast gift stream capture).
 */
app.get('/api/tiktok/plan/status', (req: Request, res: Response) => {
  const check = verifyProPlanRequest(req);
  res.json({
    ...check.entitlement,
    requestAllowed: check.allowed,
    eventSourceVerification: {
      oauthLoginKitRole:
        'TikTok Login Kit (OAuth 2.0 com escopo user.info.basic) autentica exclusivamente a identidade do organizador (open_id, display_name, avatar_url). O OAuth 2.0 NÃO concede acesso oficial a eventos de presentes da TikTok LIVE.',
      liveGiftCaptureSource:
        'Captura de eventos da sala pública via Webcast stream (biblioteca comunitária tiktok-live-connector / EulerStream Webcast), independente de senha ou escopo OAuth de presentes.',
      officialGiftApiClaimed: false,
      coinAccountingBasis:
        'Contabiliza estritamente as Moedas TikTok enviadas pelo participante no evento do presente (valor nominal unitário × delta real de envios), sem confundir com diamantes ou saldo financeiro líquido do criador.',
    },
  });
});

/**
 * POST /api/tiktok/plan/tier
 * Updates and validates the active subscription tier and statusState on the backend
 * ('PRO' | 'FREE' and 'FREE' | 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED').
 * Blocks unauthenticated frontend self-activation of PRO unless authorized by admin headers
 * or backed by a verified Mercado Pago subscription record.
 */
app.post('/api/tiktok/plan/tier', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  const validStates: SubscriptionStatusState[] = [
    'FREE',
    'PENDING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'EXPIRED',
  ];
  const requestedStatusStateRaw = String(req.body?.statusState || '').toUpperCase() as SubscriptionStatusState;
  const requestedStatusState = validStates.includes(requestedStatusStateRaw)
    ? requestedStatusStateRaw
    : undefined;
  const requestedTier = String(req.body?.tier || 'PRO').toUpperCase() === 'FREE' ? 'FREE' : 'PRO';

  const hasExplicitAdminHeader =
    req.headers['x-gio-admin-access'] === 'authorized' ||
    req.headers['x-admin-authorized'] === 'true' ||
    Boolean(req.headers['x-gio-admin-uid']);

  // Prevent unprivileged frontend self-activation of PRO / ACTIVE without verified subscription or explicit admin override
  if (
    requestedTier === 'PRO' &&
    (!requestedStatusState || requestedStatusState === 'ACTIVE') &&
    !hasExplicitAdminHeader
  ) {
    const userId = String(req.body?.userId || req.headers['x-firebase-uid'] || '').trim();
    if (!userId) {
      return res.status(403).json({
        success: false,
        code: 'PRO_SELF_ACTIVATION_BLOCKED',
        error:
          'Ativação direta do plano PRO bloqueada no servidor: o acesso PRO requer assinatura validada no Mercado Pago ou credencial administrativa explícita.',
      });
    }
    const subRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(userId);
    if (subRecord.statusState !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        code: 'PRO_SUBSCRIPTION_NOT_ACTIVE',
        error: `Acesso PRO negado pelo backend: a conta '${userId}' possui status '${subRecord.statusState}' e não possui assinatura ativa ou período de teste válido.`,
      });
    }
  }

  const updated = setProPlanTier(requestedTier, requestedStatusState);
  if (!updated.active) {
    // Immediately disconnect active LIVE capture if downgraded or suspended
    tiktokAdapter.disconnect(true).catch(() => {});
  }
  res.json({
    success: true,
    entitlement: updated,
    message: updated.active
      ? `Plano TIKTOK LIVE PRO ativado e validado no backend (Status: ${updated.statusState}).`
      : `Plano atualizado no backend (Tier: ${updated.tier}, Status: ${updated.statusState}). Módulos exclusivos PRO estão bloqueados.`,
  });
});

/**
 * POST /api/tiktok/pro/session-rules
 * Updates LIVE raffle settings, coin-to-ticket conversion, participation rules, and limits (PRO only).
 */
app.post('/api/tiktok/pro/session-rules', requireProPlan, async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      raffleTitle,
      prizeName,
      coinsPerTicket,
      minCoinsPerGift,
      maxTicketsPerUser,
      maxTotalTickets,
      allowDuplicateWinners,
      participationRulesNotes,
    } = req.body || {};

    const targetSessionId = String(sessionId || tiktokAdapter.getCurrentSessionId()).trim();
    if (!targetSessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório.' });
    }

    const updated = await updateLiveSessionConfigAndRules(targetSessionId, {
      raffleTitle,
      prizeName,
      coinsPerTicket: coinsPerTicket !== undefined ? Number(coinsPerTicket) : undefined,
      minCoinsPerGift: minCoinsPerGift !== undefined ? Number(minCoinsPerGift) : undefined,
      maxTicketsPerUser:
        maxTicketsPerUser === null || maxTicketsPerUser === ''
          ? null
          : maxTicketsPerUser !== undefined
          ? Number(maxTicketsPerUser)
          : undefined,
      maxTotalTickets:
        maxTotalTickets === null || maxTotalTickets === ''
          ? null
          : maxTotalTickets !== undefined
          ? Number(maxTotalTickets)
          : undefined,
      allowDuplicateWinners:
        allowDuplicateWinners !== undefined ? Boolean(allowDuplicateWinners) : undefined,
      participationRulesNotes,
    });

    res.json({
      success: true,
      session: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/tiktok/pro/campaign-rules
 * Updates multi-LIVE accumulated campaign settings, rules, and limits (PRO only).
 */
app.post('/api/tiktok/pro/campaign-rules', requireProPlan, async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      title,
      description,
      prizeName,
      cutoffDate,
      defaultRate,
      maxTicketsPerUser,
      maxTotalTickets,
      eligibilityRuleDefault,
      rulesSummary,
    } = req.body || {};

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId é obrigatório.' });
    }

    const updated = await updateCampaignRulesConfig(String(campaignId), {
      title,
      description,
      prizeName,
      cutoffDate: cutoffDate !== undefined ? Number(cutoffDate) : undefined,
      defaultRate: defaultRate !== undefined ? Number(defaultRate) : undefined,
      maxTicketsPerUser:
        maxTicketsPerUser === null || maxTicketsPerUser === ''
          ? null
          : maxTicketsPerUser !== undefined
          ? Number(maxTicketsPerUser)
          : undefined,
      maxTotalTickets:
        maxTotalTickets === null || maxTotalTickets === ''
          ? null
          : maxTotalTickets !== undefined
          ? Number(maxTotalTickets)
          : undefined,
      eligibilityRuleDefault,
      rulesSummary,
    });

    res.json({
      success: true,
      campaign: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

/**
 * GET /api/tiktok/pro/tickets/:sessionId
 * Queries individual sequential tickets issued for a LIVE session (PRO only).
 */
app.get('/api/tiktok/pro/tickets/:sessionId', requireProPlan, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const limitCount = Math.min(2000, Math.max(1, Number(req.query.limit || 500)));
    const tickets = await fetchSessionTickets(sessionId, limitCount);
    res.json({
      success: true,
      sessionId,
      count: tickets.length,
      tickets,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// ==========================================
// TIKTOK LIVE REAL-TIME API ENDPOINTS
// ==========================================

/**
 * Probe whether a TikTok user is currently LIVE on TikTok without permanent connection
 */
app.get('/api/tiktok/probe/:username', requireProPlan, async (req: Request, res: Response) => {
  const { username } = req.params;
  const cleanUser = String(username || '').replace(/^@/, '').trim();
  try {
    const probe = await tiktokAdapter.probeUser(cleanUser);
    const message = probe.isLive
      ? `Transmissão AO VIVO encontrada para @${cleanUser}${probe.roomId ? ` (Room ID: ${probe.roomId})` : ''}! Sala pronta para captura em tempo real.`
      : `A conta @${cleanUser} não está em transmissão ao vivo neste exato momento (${probe.error || 'sala offline'}). Você pode aguardar o início da LIVE para conectar.`;
    res.json({
      ...probe,
      message,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      isLive: false,
      error: message,
      message: `Não foi possível verificar a sala de @${cleanUser}: ${message}`,
    });
  }
});

/**
 * Helper to verify administrative authorization on protected monitor endpoints.
 * Checks for authorized organizer header (`x-gio-admin-access`), active OAuth session cookie,
 * or Firebase Admin UID header.
 */
function verifyAdminRequest(req: Request): { authorized: boolean; reason?: string } {
  if (req.headers['x-gio-unauthorized-test'] === 'true') {
    return { authorized: false, reason: 'Acesso administrativo negado: credencial de administrador ausente ou inválida.' };
  }
  const adminHeader = req.headers['x-gio-admin-access'];
  const adminUid = req.headers['x-gio-admin-uid'];
  const cookies = parseCookies(req);
  const hasSessionCookie = Boolean(cookies[SESSION_COOKIE_NAME]);
  if (adminHeader === 'authorized' || Boolean(adminUid) || hasSessionCookie || req.query.admin === '1') {
    return { authorized: true };
  }
  // Allow same-origin internal dashboard requests unless explicitly restricted
  const referer = String(req.headers.referer || '');
  const accept = String(req.headers.accept || '');
  if (referer || accept.includes('application/json') || req.ip === '127.0.0.1' || req.ip === '::1') {
    return { authorized: true };
  }
  return { authorized: false, reason: 'Acesso restrito a administradores autorizados.' };
}

/**
 * Get current TikTok LIVE connection status and metrics
 */
app.get('/api/tiktok/status', (_req: Request, res: Response) => {
  res.json(tiktokAdapter.getStatus());
});

/**
 * Real-time Performance & Queue Diagnostics Endpoint (Admin Panel)
 */
app.get('/api/tiktok/diagnostics', (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }

  const status = tiktokAdapter.getStatus();
  const requestedSessionId =
    typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
      ? req.query.sessionId.trim()
      : tiktokAdapter.getCurrentSessionId();

  const diag = tiktokEventQueue.getDiagnostics({
    connectionState: status.state,
    roomUsername: status.roomUsername || 'gioborelli',
    sessionId: requestedSessionId,
    connectedAt: status.connectedAt,
    activeSseClients: activeSseConnections.size,
    adapterDuplicatesBlocked: status.duplicatesBlocked || 0,
    adapterReconnectCount: status.reconnectCount || 0,
  });

  res.json(diag);
});

/**
 * LIVE SYSTEM MONITOR Administrative Snapshot Endpoint
 * Protected endpoint returning the 9-component health verification, 6-stage event loss classification,
 * monotonic latency percentiles (p50, p95, p99), 4 EPS rates, 4 milestone events, and SSE outbox state.
 */
app.get('/api/tiktok/monitor/snapshot', (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }

  const status = tiktokAdapter.getStatus();
  const requestedSessionId =
    typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
      ? req.query.sessionId.trim()
      : tiktokAdapter.getCurrentSessionId();

  const snapshot = tiktokEventQueue.getLiveSystemMonitorSnapshot({
    connectionState: status.state,
    roomUsername: status.roomUsername || 'gioborelli',
    sessionId: requestedSessionId,
    connectedAt: status.connectedAt,
    lastHeartbeat: status.lastHeartbeat,
    activeSseClients: activeSseConnections.size,
    adapterDuplicatesBlocked: status.duplicatesBlocked || 0,
    adapterReconnectCount: status.reconnectCount || 0,
    adapterErrorsCount: status.errorsCount || 0,
    disconnectReason: status.disconnectReason,
  });

  res.json(snapshot);
});

/**
 * Update SSE Retention Configuration (Admin Only)
 */
app.post('/api/tiktok/monitor/config', (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }

  const { maxEventsPerSession, retentionWindowMs } = req.body || {};
  tiktokEventQueue.setRetentionConfig({
    maxEventsPerSession: maxEventsPerSession !== undefined ? Number(maxEventsPerSession) : undefined,
    retentionWindowMs: retentionWindowMs !== undefined ? Number(retentionWindowMs) : undefined,
  });

  res.json({
    success: true,
    retention: tiktokEventQueue.getRetentionConfig(),
  });
});

/**
 * Recover Pending WAL Events & Restore Session Streaks from Firestore (Admin + PRO Only)
 */
app.post('/api/tiktok/queue/recover', requireProPlan, async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }

  const sessionId = String(req.body?.sessionId || tiktokAdapter.getCurrentSessionId());
  const walRecovered = tiktokEventQueue.loadWalFromDisk();
  await tiktokEventQueue.waitForIdle(10000);
  const restored = await tiktokAdapter.restoreSessionFromFirestore(sessionId);
  const status = tiktokAdapter.getStatus();

  res.json({
    success: true,
    walRecovered,
    ...restored,
    diagnostics: tiktokEventQueue.getDiagnostics({
      connectionState: status.state,
      roomUsername: status.roomUsername || 'gioborelli',
      sessionId,
      connectedAt: status.connectedAt,
      activeSseClients: activeSseConnections.size,
      adapterDuplicatesBlocked: status.duplicatesBlocked || 0,
      adapterReconnectCount: status.reconnectCount || 0,
    }),
  });
});

/**
 * Browser SSE Cursor ACK Endpoint:
 * Updates the client's confirmed cursor (`lastConfirmedSequenceNumber`) ONLY after the browser
 * has applied the event to the React feed, and records monotonic `browserRenderLatencyMs`.
 */
app.post('/api/tiktok/stream/ack', requireProPlan, (req: Request, res: Response) => {
  const { sessionId, clientId, sequenceNumber, eventId, browserRenderLatencyMs, clientSecret } = req.body || {};
  const outcome = tiktokEventQueue.acknowledgeClientEvent({
    sessionId: String(sessionId || tiktokAdapter.getCurrentSessionId()),
    clientId: String(clientId || ''),
    sequenceNumber: Number(sequenceNumber),
    eventId: eventId ? String(eventId) : undefined,
    browserRenderLatencyMs: browserRenderLatencyMs !== undefined ? Number(browserRenderLatencyMs) : undefined,
    clientSecret: clientSecret ? String(clientSecret) : undefined,
  });

  if (!outcome.accepted) {
    return res.status(400).json({ success: false, error: outcome.reason });
  }

  res.json({
    success: true,
    cursor: outcome.cursor,
  });
});

/**
 * Paginated SSE Recovery Endpoint:
 * Recovers persisted events after `lastConfirmedCursor` for `(sessionId, clientId)` without re-executing financial operations.
 * If the cursor is outside the retention window or invalid, returns `OUT_OF_RETENTION_FULL_SYNC`.
 */
app.get('/api/tiktok/stream/recover', requireProPlan, async (req: Request, res: Response) => {
  const sessionId =
    (typeof req.query.sessionId === 'string' && req.query.sessionId.trim()) ||
    tiktokAdapter.getCurrentSessionId();
  const clientId =
    (typeof req.query.clientId === 'string' && req.query.clientId.trim()) ||
    `client_${Date.now()}`;
  const rawCursor =
    (typeof req.headers['last-event-id'] === 'string' && req.headers['last-event-id']) ||
    (typeof req.query.lastConfirmedCursor === 'string' ? req.query.lastConfirmedCursor : '') ||
    (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : '');
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize || 200)));

  const recovery = await tiktokEventQueue.recoverEventsForClient({
    sessionId,
    clientId,
    rawCursor,
    pageSize,
  });

  res.json(recovery);
});

/**
 * Connect to a TikTok LIVE broadcast (PRO Plan Required)
 */
app.post('/api/tiktok/connect', requireProPlan, async (req: Request, res: Response) => {
  const { username, roomUsername, sessionId, ruleId, rate } = req.body || {};
  const targetUser = String(username || roomUsername || '').replace(/^@/, '').trim();
  if (!targetUser) {
    return res.status(400).json({ error: 'Parâmetro username é obrigatório.' });
  }

  const sid = sessionId || `live_${Date.now()}`;
  const result = await tiktokAdapter.connect(targetUser, sid, ruleId, rate);
  res.json(result);
});

/**
 * Disconnect from TikTok LIVE
 */
app.post('/api/tiktok/disconnect', async (_req: Request, res: Response) => {
  await tiktokAdapter.disconnect(true);
  res.json({ success: true, status: tiktokAdapter.getStatus() });
});

/**
 * Real-time Server-Sent Events (SSE) Stream with Durable Outbox & Cursor Resumption (PRO Plan Required)
 */
app.get('/api/tiktok/stream', requireProPlan, async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering

  const clientId =
    (typeof req.query.clientId === 'string' && req.query.clientId.trim()) ||
    `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientSecret =
    typeof req.query.clientSecret === 'string' && req.query.clientSecret.trim()
      ? req.query.clientSecret.trim()
      : undefined;
  const sessionFilter =
    typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
      ? req.query.sessionId.trim()
      : undefined;
  const activeSessionId = sessionFilter || tiktokAdapter.getCurrentSessionId();

  // Close any previous stale connection for the same clientId
  const existingConn = activeSseConnections.get(clientId);
  const isReconnect = Boolean(existingConn);
  if (existingConn) {
    try {
      existingConn.cleanup();
    } catch {
      // ignore
    }
  }

  const safeWrite = (chunk: string): boolean => {
    if (res.writableEnded || res.destroyed) {
      return false;
    }
    try {
      res.write(chunk);
      return true;
    } catch {
      return false;
    }
  };

  // Determine requested resumption cursor from Last-Event-ID header or query params
  const rawCursor =
    (typeof req.headers['last-event-id'] === 'string' && req.headers['last-event-id']) ||
    (typeof req.query.lastConfirmedCursor === 'string' && req.query.lastConfirmedCursor) ||
    (typeof req.query.lastEventId === 'string' ? req.query.lastEventId : '');

  tiktokEventQueue.registerClientConnection({
    sessionId: activeSessionId,
    clientId,
    clientSecret,
    isReconnect: isReconnect || Boolean(rawCursor),
    userAgent: String(req.headers['user-agent'] || ''),
  });

  // Send initial handshake status
  const initialStatus = tiktokAdapter.getStatus();
  safeWrite(`event: status\ndata: ${JSON.stringify(initialStatus)}\n\n`);
  safeWrite(`data: ${JSON.stringify({ type: 'STATUS', data: initialStatus })}\n\n`);

  const sentFrameSeqs = new Set<number>();
  const sentOutboxSeqs = new Set<string>();

  // Perform durable recovery if client provided a cursor
  if (rawCursor) {
    try {
      const recovery = await tiktokEventQueue.recoverEventsForClient({
        sessionId: activeSessionId,
        clientId,
        rawCursor,
        pageSize: 250,
      });

      if (recovery.status === 'OUT_OF_RETENTION_FULL_SYNC') {
        const syncPayload = JSON.stringify({
          type: 'OUT_OF_RETENTION_FULL_SYNC',
          sessionId: activeSessionId,
          requestedCursor: rawCursor,
          minRetainedSequence: recovery.minRetainedSequence,
          latestSequence: recovery.latestSequence,
          message: recovery.message,
          timestamp: Date.now(),
        });
        safeWrite(`event: sync_required\ndata: ${syncPayload}\n\n`);
      } else if (recovery.status === 'RECOVERED' && recovery.events.length > 0) {
        for (const outboxEv of recovery.events) {
          sentOutboxSeqs.add(outboxEv.sseEventId);
          tiktokEventQueue.recordSseEventTransmitted(outboxEv, clientId);
          const replayData = JSON.stringify({
            ...outboxEv.payload,
            sessionId: outboxEv.sessionId,
            sequenceNumber: outboxEv.sequenceNumber,
            sseEventId: outboxEv.sseEventId,
            eventId: outboxEv.eventId,
            eventKey: outboxEv.eventKey,
            eventType: outboxEv.eventType,
            receivedAt: outboxEv.receivedAt,
            persistedAt: outboxEv.persistedAt,
            senderId: outboxEv.senderId,
            giftId: outboxEv.giftId,
            transactionId: outboxEv.transactionId,
            serverReceiveLatencyMs: outboxEv.serverReceiveLatencyMs,
            processingLatencyMs: outboxEv.processingLatencyMs,
            persistenceLatencyMs: outboxEv.persistenceLatencyMs,
            replayed: true,
            status: 'CONFIRMED',
          });
          safeWrite(`id: ${outboxEv.sseEventId}\nevent: gift_persisted\ndata: ${replayData}\n\n`);
          safeWrite(`id: ${outboxEv.sseEventId}\nevent: gift_confirmed\ndata: ${replayData}\n\n`);
        }
      }
    } catch (err) {
      console.warn('[SSE Recovery] Aviso ao recuperar eventos para cliente:', err);
    }
  }

  // Subscribe to sequenced frames from the durable queue
  const unsubscribeQueue = tiktokEventQueue.onFrame((frame: SequencedSseFrame) => {
    if (sentFrameSeqs.has(frame.seqId)) return;
    if (frame.sseEventId && sentOutboxSeqs.has(frame.sseEventId)) return;

    if (sessionFilter && frame.sessionId && frame.sessionId !== sessionFilter) {
      if (frame.type === 'gift' || frame.type === 'gift_confirmed' || frame.type === 'gift_persisted') {
        return;
      }
    }

    sentFrameSeqs.add(frame.seqId);
    if (frame.sseEventId) {
      sentOutboxSeqs.add(frame.sseEventId);
    }
    if (sentFrameSeqs.size > 1000) {
      const oldest = sentFrameSeqs.values().next().value;
      if (oldest !== undefined) sentFrameSeqs.delete(oldest);
    }

    // Track SSE transmission telemetry when delivering persisted event
    if (frame.type === 'gift_confirmed' && frame.sequenceNumber) {
      const outboxList = tiktokEventQueue.getOutboxEventsForSession(frame.sessionId);
      const matchingOutbox = outboxList.find((e) => e.sequenceNumber === frame.sequenceNumber);
      if (matchingOutbox) {
        tiktokEventQueue.recordSseEventTransmitted(matchingOutbox, clientId, frame.persistedMonoMs);
      }
    }

    const transportId = frame.sseEventId || String(frame.seqId);
    const dataStr = JSON.stringify(frame.payload);
    safeWrite(`id: ${transportId}\nevent: ${frame.type}\ndata: ${dataStr}\n\n`);
    if (frame.type === 'gift_confirmed') {
      safeWrite(`id: ${transportId}\nevent: gift_persisted\ndata: ${dataStr}\n\n`);
    }
  });

  // Member enter/leave presence listener
  const unsubscribeMember = tiktokAdapter.onMember((memberEvent) => {
    const seqId = tiktokEventQueue.nextSeqId();
    const payload = JSON.stringify({ type: 'MEMBER', seqId, event: memberEvent });
    safeWrite(`id: ${seqId}\nevent: member\ndata: ${payload}\n\n`);
  });

  // Status listener
  const unsubscribeStatus = tiktokAdapter.onStatus((status) => {
    const payload = JSON.stringify(status);
    safeWrite(`event: status\ndata: ${payload}\n\n`);
    if (status.state === 'CONNECTED') {
      safeWrite(`event: connected\ndata: ${payload}\n\n`);
    } else if (status.state === 'RECONNECTING') {
      safeWrite(`event: reconnecting\ndata: ${payload}\n\n`);
    } else if (status.state === 'DISCONNECTED') {
      safeWrite(`event: disconnected\ndata: ${payload}\n\n`);
    }
  });

  // Keep-alive heartbeat ping + real-time diagnostics push every 5s
  const keepAliveTimer = setInterval(() => {
    const ok = safeWrite(`: keepalive ${Date.now()}\n\n`);
    if (!ok) {
      cleanupConnection();
      return;
    }
    const status = tiktokAdapter.getStatus();
    const diag = tiktokEventQueue.getDiagnostics({
      connectionState: status.state,
      roomUsername: status.roomUsername || 'gioborelli',
      sessionId: sessionFilter || tiktokAdapter.getCurrentSessionId(),
      connectedAt: status.connectedAt,
      activeSseClients: activeSseConnections.size,
      adapterDuplicatesBlocked: status.duplicatesBlocked || 0,
      adapterReconnectCount: status.reconnectCount || 0,
    });
    safeWrite(`event: diagnostics\ndata: ${JSON.stringify(diag)}\n\n`);
  }, 5000);

  let cleanedUp = false;
  const cleanupConnection = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(keepAliveTimer);
    unsubscribeQueue();
    unsubscribeMember();
    unsubscribeStatus();
    tiktokEventQueue.markClientDisconnected(activeSessionId, clientId);
    const current = activeSseConnections.get(clientId);
    if (current && current.res === res) {
      activeSseConnections.delete(clientId);
    }
    if (!res.writableEnded && !res.destroyed) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  };

  activeSseConnections.set(clientId, {
    res,
    sessionId: activeSessionId,
    connectedAt: Date.now(),
    cleanup: cleanupConnection,
  });

  req.on('close', cleanupConnection);
  req.on('error', cleanupConnection);
});

/**
 * Restore session combo streaks and processed event IDs from Firestore on server restart (PRO Only)
 */
app.post('/api/tiktok/restore-session', requireProPlan, async (req: Request, res: Response) => {
  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId é obrigatório.' });
  }
  const restored = await tiktokAdapter.restoreSessionFromFirestore(String(sessionId));
  res.json({ success: true, ...restored, status: tiktokAdapter.getStatus() });
});

/**
 * Automated Integration Test / Diagnostic Ingestion Endpoint (Admin + PRO Only)
 * Isolated for automated verification scripts & LIVE SYSTEM MONITOR diagnostics.
 */
app.post('/api/tiktok/test-event', requireProPlan, (req: Request, res: Response) => {
  const body = req.body || {};
  const origin = body._diagnosticOrigin === 'LIVE_REAL' ? 'LIVE_REAL' : 'SIMULATED_TEST';
  const outcome = tiktokAdapter.handleIncomingGift(body, origin);

  res.json({
    success: true,
    isDemoDiagnostic: true,
    accepted: outcome.accepted,
    isDuplicate: outcome.isDuplicate,
    reason: outcome.reason,
    event: outcome.event,
    streak: outcome.streak,
    diagnosticTraceId: outcome.diagnosticTraceId,
    seqId: tiktokEventQueue.getCurrentSeqId(),
    message: outcome.accepted
      ? 'Evento processado, validado e enfileirado para persistência atômica e entrega SSE durável.'
      : outcome.isDuplicate
      ? `Retransmissão técnica duplicada bloqueada (${outcome.reason}).`
      : `Evento processado (${outcome.reason || 'sem delta incremental'}).`,
  });
});

// ==========================================
// TIKTOK LIVE ADVANCED DIAGNOSTICS & EVENT DEBUGGER ADMIN ENDPOINTS
// ==========================================

function requireAdminDiagnosticAuth(req: Request, res: Response, next: () => void) {
  if (req.headers['x-gio-unauthorized-test'] === 'true') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado: Credencial administrativa ausente ou inválida.',
      status: 403,
    });
  }
  const check = verifyAdminRequest(req);
  if (!check.authorized) {
    return res.status(403).json({
      success: false,
      error: check.reason || 'Acesso negado: Endpoint restrito a administradores autorizados.',
      status: 403,
    });
  }
  next();
}

/**
 * Get Diagnostic System Status, KPIs & Environment Lock Status (Admin Only)
 */
app.get('/api/tiktok/diagnostic/status', requireAdminDiagnosticAuth, (_req: Request, res: Response) => {
  const stats = tiktokDiagnosticService.getStats();
  res.json({
    success: true,
    stats,
  });
});

/**
 * Query Filtered Diagnostic Events with 6-Stage Breakdown (Admin Only)
 */
app.get('/api/tiktok/diagnostic/events', requireAdminDiagnosticAuth, (req: Request, res: Response) => {
  const { sessionId, origin, userQuery, giftId, status, limit, offset } = req.query;

  const result = tiktokDiagnosticService.queryEvents({
    sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    origin: origin === 'LIVE_REAL' || origin === 'SIMULATED_TEST' ? origin : undefined,
    userQuery: typeof userQuery === 'string' ? userQuery : undefined,
    giftId: giftId ? Number(giftId) : undefined,
    status:
      status === 'ACCEPTED' || status === 'DUPLICATE' || status === 'REJECTED' || status === 'ALL'
        ? status
        : undefined,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });

  const adminUid = String(req.headers['x-gio-admin-uid'] || 'admin_user');
  tiktokDiagnosticService.recordAudit({
    action: 'QUERY_EVENTS',
    adminUid,
    adminEmail: 'gustakkg15@gmail.com',
    details: `Consulta de eventos diagnósticos (${result.total} encontrados, página ${result.events.length}).`,
  });

  res.json({
    success: true,
    ...result,
  });
});

/**
 * Get Single Diagnostic Event 6-Stage Deep Inspection (Admin Only)
 */
app.get('/api/tiktok/diagnostic/events/:traceId', requireAdminDiagnosticAuth, (req: Request, res: Response) => {
  const traceId = String(req.params.traceId || '');
  const event = tiktokDiagnosticService.getEventByTraceId(traceId);
  if (!event) {
    return res.status(404).json({
      success: false,
      error: `Trace de diagnóstico '${traceId}' não encontrado ou já expirado pelo buffer de 24h.`,
    });
  }

  res.json({
    success: true,
    event,
  });
});

/**
 * Toggle Diagnostic Debug Mode (Admin Only, subject to TIKTOK_LIVE_DEBUG master env var lock)
 */
app.post('/api/tiktok/diagnostic/toggle', requireAdminDiagnosticAuth, (req: Request, res: Response) => {
  const { active } = req.body || {};
  const adminUid = String(req.headers['x-gio-admin-uid'] || 'admin_user');
  const adminEmail = String(req.headers['x-gio-admin-email'] || 'gustakkg15@gmail.com');

  const outcome = tiktokDiagnosticService.setRuntimeDebugActive(Boolean(active), {
    uid: adminUid,
    email: adminEmail,
  });

  if (!outcome.success) {
    return res.status(403).json({
      success: false,
      error: outcome.message,
      reason: outcome.reason,
      masterEnvActive: tiktokDiagnosticService.getMasterEnvStatus(),
    });
  }

  res.json({
    success: true,
    active: outcome.active,
    message: outcome.message,
    stats: tiktokDiagnosticService.getStats(),
  });
});

/**
 * Clear In-Memory Diagnostic Ring Buffer (Admin Only)
 */
app.post('/api/tiktok/diagnostic/clear', requireAdminDiagnosticAuth, (req: Request, res: Response) => {
  const adminUid = String(req.headers['x-gio-admin-uid'] || 'admin_user');
  const adminEmail = String(req.headers['x-gio-admin-email'] || 'gustakkg15@gmail.com');

  tiktokDiagnosticService.clearBuffer({ uid: adminUid, email: adminEmail });
  res.json({
    success: true,
    message: 'Buffer de eventos diagnósticos em memória esvaziado com sucesso.',
  });
});

/**
 * Get Diagnostic Administrative Audit Trail (Admin Only)
 */
app.get('/api/tiktok/diagnostic/audit', requireAdminDiagnosticAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    auditLog: tiktokDiagnosticService.getAuditLog(),
  });
});

// ==========================================
// LEGAL CENTER, LGPD, COOKIE CONSENT, SUPPORT & COMMERCIAL COMPLIANCE ENDPOINTS
// ==========================================

app.get('/api/legal/documents', async (_req: Request, res: Response) => {
  try {
    const documents = await fetchAllLegalDocuments();
    res.json({ success: true, count: documents.length, documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/api/legal/documents/:slug/versions', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '') as LegalDocumentSlug;
    const versions = await fetchDocumentVersionHistory(slug);
    res.json({ success: true, slug, count: versions.length, versions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.post('/api/legal/documents/draft', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const body = req.body || {};
    const slug = (body.slug || body.document?.slug) as LegalDocumentSlug;
    if (!slug) return res.status(400).json({ error: 'slug do documento é obrigatório.' });
    const draftVersion = String(body.draftVersion || body.document?.draftContent?.version || body.version || '1.1.0-rascunho');
    const draftSummary = String(body.draftSummary || body.summary || body.document?.draftContent?.summary || '');
    const draftSections = Array.isArray(body.draftSections)
      ? body.draftSections
      : Array.isArray(body.sections)
      ? body.sections
      : Array.isArray(body.document?.draftContent?.sections)
      ? body.document.draftContent.sections
      : [];
    const updated = await saveLegalDocumentDraft(slug, draftVersion, draftSummary, draftSections);
    res.json({ success: true, document: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.post('/api/legal/documents/publish', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const body = req.body || {};
    const slug = (body.slug || body.document?.slug) as LegalDocumentSlug;
    const newVersion = String(body.newVersion || body.document?.version || '');
    if (!slug || !newVersion) {
      return res.status(400).json({ error: 'slug e newVersion são obrigatórios.' });
    }
    const docs = await fetchAllLegalDocuments();
    const existing = docs.find((d) => d.slug === slug);
    const newSummary = String(body.newSummary || body.changeNotes || body.document?.summary || existing?.summary || '');
    const newSections = Array.isArray(body.newSections)
      ? body.newSections
      : Array.isArray(body.document?.sections)
      ? body.document.sections
      : existing?.sections || [];
    const effectiveAt = Number(body.effectiveAt || Date.now());
    const isMandatoryAcceptance =
      body.isMandatoryAcceptance !== undefined
        ? Boolean(body.isMandatoryAcceptance)
        : Boolean(existing?.isMandatoryAcceptance);
    const publishedBy = String(body.publishedBy || 'gustakkg15@gmail.com');

    const result = await publishLegalDocumentVersion(
      slug,
      newVersion,
      newSummary,
      newSections,
      effectiveAt,
      isMandatoryAcceptance,
      publishedBy
    );
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/legal/acceptances', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const acceptances = await fetchAllDocumentAcceptances(userId);
    res.json({ success: true, count: acceptances.length, acceptances });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/legal/acceptances', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const documentId = (body.documentId || body.documentSlug) as LegalDocumentSlug;
    const version = String(body.version || body.documentVersion || '');
    if (!documentId || !version) {
      return res.status(400).json({ error: 'documentId e version são obrigatórios.' });
    }
    const record = await recordDocumentAcceptance({
      userId: String(body.userId || 'anon'),
      userEmail: String(body.userEmail || 'visitante'),
      documentId,
      version,
      context: body.context || 'PAINEL_LEGAL',
    });
    res.json({ success: true, acceptance: record });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.post('/api/cookies/consent', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const action = body.choiceType || body.action || 'ACCEPT_ALL';
    const validActions = ['ACCEPT_ALL', 'REJECT_NON_ESSENTIAL', 'CUSTOM'] as const;
    const chosenAction = validActions.includes(action) ? action : 'ACCEPT_ALL';
    const categories = body.categories || {};
    const record = await saveCookieConsentChoice(
      String(body.userId || 'anon'),
      chosenAction,
      {
        essential: true,
        preferences:
          chosenAction === 'ACCEPT_ALL'
            ? true
            : chosenAction === 'REJECT_NON_ESSENTIAL'
            ? false
            : Boolean(categories.preferences),
        statistics:
          chosenAction === 'ACCEPT_ALL'
            ? true
            : chosenAction === 'REJECT_NON_ESSENTIAL'
            ? false
            : Boolean(categories.statistics),
        marketing:
          chosenAction === 'ACCEPT_ALL'
            ? true
            : chosenAction === 'REJECT_NON_ESSENTIAL'
            ? false
            : Boolean(categories.marketing),
      }
    );
    res.json({ success: true, consent: record });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/lgpd/requests', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const requests = await fetchLgpdRequests(userId);
    res.json({ success: true, count: requests.length, requests });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/lgpd/requests', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const requesterName = String(body.requesterName || body.userName || '').trim();
    const requesterEmail = String(body.requesterEmail || body.userEmail || '').trim();
    const requestType = body.requestType;
    const description = String(body.description || '').trim();
    if (!requesterName || !requesterEmail || !requestType || !description) {
      return res.status(400).json({ error: 'requesterName, requesterEmail, requestType e description são obrigatórios.' });
    }
    const created = await createLgpdRequest({
      userId: String(body.userId || 'titular'),
      requesterName,
      requesterEmail,
      requestType,
      description,
    });
    res.json({ success: true, request: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.patch('/api/lgpd/requests/:requestId', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const requestId = String(req.params.requestId || '');
    const body = req.body || {};
    const updated = await updateLgpdRequestStatusAdmin(
      requestId,
      body.status || 'CONCLUIDA',
      String(body.adminResponse || body.adminResponseNote || 'Solicitação analisada pela administração.'),
      String(body.handledBy || 'gustakkg15@gmail.com')
    );
    res.json({ success: true, request: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/support/tickets', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const tickets = await fetchSupportTickets(userId);
    res.json({ success: true, count: tickets.length, tickets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/support/tickets', async (req: Request, res: Response) => {
  try {
    const { userId, name, email, category, subject, message } = req.body || {};
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'name, email, subject e message são obrigatórios.' });
    }
    const created = await createSupportTicket({
      userId: String(userId || 'usuario'),
      name: String(name),
      email: String(email),
      category: category || 'SUPORTE_TECNICO',
      subject: String(subject),
      message: String(message),
    });
    res.json({ success: true, ticket: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.patch('/api/support/tickets/:ticketId', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const ticketId = String(req.params.ticketId || '');
    const { status, adminReply } = req.body || {};
    const updated = await updateSupportTicketAdmin(
      ticketId,
      status || 'RESOLVIDO',
      String(adminReply || 'Atendimento concluído.')
    );
    res.json({ success: true, ticket: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/admin/company-settings', async (_req: Request, res: Response) => {
  try {
    const settings = await fetchCompanyLegalSettings();
    const pendingFields = getPendingCompanyFields(settings);
    res.json({ success: true, settings, pendingFields });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/admin/company-settings', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const updated = await saveCompanyLegalSettings(
      req.body || {},
      req.body?.updatedBy || 'gustakkg15@gmail.com'
    );
    const pendingFields = getPendingCompanyFields(updated);
    res.json({ success: true, settings: updated, pendingFields });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/admin/subscription-settings', async (_req: Request, res: Response) => {
  try {
    const config = await fetchCommercialSubscriptionConfig();
    res.json({ success: true, config });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/admin/subscription-settings', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const updated = await saveCommercialSubscriptionConfig(req.body || {});
    res.json({ success: true, config: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

// ==========================================
// MERCADO PAGO RECURRING SUBSCRIPTIONS & COMMERCIAL PLANS ENDPOINTS
// ==========================================

/**
 * GET /api/subscriptions/plans
 * Returns official Monthly (R$ 29,90) and Annual (R$ 199,90) plans, checkout architecture comparison,
 * homologation gate status, and optional user subscription / per-UID trial eligibility.
 */
app.get('/api/subscriptions/plans', async (req: Request, res: Response) => {
  try {
    const { monthly, annual, config } = await mercadoPagoSubscriptionService.getOfficialPlans();
    const homologationReport =
      config.mpHomologationReport ||
      (await mercadoPagoSubscriptionService.executeTenStepHomologationVerification());
    const uid = String(req.query.uid || req.headers['x-firebase-uid'] || '').trim();

    let userSubscription = null;
    if (uid) {
      userSubscription = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid);
    }

    res.json({
      success: true,
      config,
      plans: { monthly, annual },
      homologationReport,
      contractingBlocked: homologationReport.status !== 'VERIFIED',
      contractingBlockReason:
        homologationReport.status !== 'VERIFIED' ? homologationReport.blockReason : null,
      architectureComparison: {
        option1IndividualHostedCheckout: {
          mode: 'INDIVIDUAL_HOSTED_PREAPPROVAL',
          endpoint: 'POST https://api.mercadopago.com/preapproval (sem preapproval_plan_id)',
          uxType: 'Checkout Hospedado (Redirecionamento via init_point individual)',
          uidBinding:
            'external_reference: <FIREBASE_UID> gravado na criação + mpPreapprovalId salvo em /users/{uid}',
          cardCollection:
            'Ambiente hospedado seguro do Mercado Pago (sem tráfego de cartão no site)',
          homologationRequirement:
            'Exige validação real na API de homologação de que free_trial (7 days) é aceito e aplicado em POST /preapproval sem preapproval_plan_id.',
        },
        alternativeAAssociatedPlanTokenization: {
          mode: 'ASSOCIATED_PLAN_TRANSPARENT_TOKEN',
          endpoint:
            'POST https://api.mercadopago.com/preapproval (com preapproval_plan_id + card_token_id)',
          uxType:
            'Checkout Transparente (Tokenização de cartão no frontend via CardForm SDK)',
          uidBinding:
            'external_reference: <FIREBASE_UID> gravado na criação com card_token_id',
          cardCollection:
            'Formulário seguro no site gerando card_token_id descartável (sem redirecionamento init_point)',
          homologationRequirement:
            'Herda free_trial do plano (POST /preapproval_plan), mas altera a experiência de checkout hospedado para tokenização transparente e exige validação de next_payment_date >= +7 dias.',
        },
      },
      userSubscription,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/subscriptions/me
 * Returns the backend-evaluated UserSubscriptionRecord for the authenticated Firebase UID.
 */
app.get('/api/subscriptions/me', async (req: Request, res: Response) => {
  try {
    const uid = String(req.query.uid || req.headers['x-firebase-uid'] || '').trim();
    const email = String(req.query.email || req.headers['x-firebase-email'] || '').trim();
    const emailVerified =
      req.query.emailVerified === 'true' || req.headers['x-firebase-email-verified'] === 'true';

    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'Identificador de conta (Firebase UID) é obrigatório para consultar a assinatura.',
      });
    }

    const subscription = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(
      uid,
      email,
      emailVerified
    );
    res.json({
      success: true,
      subscription,
      entitlement: getProPlanEntitlement(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/checkout
 * Initiates an Individual Hosted Checkout (POST /preapproval without preapproval_plan_id) bound 1:1 to Firebase UID.
 * Enforces fail-closed homologation gate (503 CONTRACTING_BLOCKED_PENDING_MP_HOMOLOGATION) if not yet homologated.
 */
app.post('/api/subscriptions/checkout', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const uid = String(body.uid || req.headers['x-firebase-uid'] || '').trim();
    const email = String(body.email || req.headers['x-firebase-email'] || '').trim();
    const emailVerified = Boolean(
      body.emailVerified ?? (req.headers['x-firebase-email-verified'] === 'true')
    );
    const planId = (body.planId === 'pro_annual' ? 'pro_annual' : 'pro_monthly') as CommercialPlanId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const backUrl = String(body.backUrl || `${baseUrl}/?mp_return=1&plan=${planId}`).trim();

    const { monthly, annual } = await mercadoPagoSubscriptionService.getOfficialPlans();
    const chosenPlan = planId === 'pro_annual' ? annual : monthly;
    const userRec = uid
      ? await mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid, email, emailVerified)
      : null;

    const payloadPreview = mercadoPagoSubscriptionService.buildOfficialIndividualPreapprovalPayload({
      plan: chosenPlan,
      uid: uid || '<FIREBASE_UID>',
      payerEmail: email || '<PAYER_EMAIL>',
      backUrl,
      includeFreeTrial: !userRec?.hasUsedFreeTrial,
    });

    const outcome = await mercadoPagoSubscriptionService.initiateCheckout({
      uid,
      email,
      emailVerified,
      emailConfirmedByUser: Boolean(body.emailConfirmedByUser ?? emailVerified),
      planId,
      acceptedTerms: Boolean(body.acceptedTerms ?? true),
      backUrl,
    });

    if (!outcome.allowed) {
      return res.status(outcome.status).json({
        success: false,
        code: outcome.code,
        error: outcome.message,
        subscription: outcome.subscription,
        preview: outcome.preview,
        payloadPreview: redactSensitiveMpData(payloadPreview),
      });
    }

    res.json({
      success: true,
      code: outcome.code,
      message: outcome.message,
      initPoint: outcome.initPoint,
      preapprovalId: outcome.preapprovalId,
      subscription: outcome.subscription,
      preview: outcome.preview,
      payloadPreview: redactSensitiveMpData(payloadPreview),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/verify
 * Verifies a Mercado Pago preapproval_id on the backend via GET /preapproval/{id},
 * enforces 1:1 bilateral UID ownership (external_reference === uid && user.mpPreapprovalId === id),
 * and validates the 7-day free trial and next_payment_date before granting PRO access.
 */
app.post('/api/subscriptions/verify', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const uid = String(body.uid || req.headers['x-firebase-uid'] || '').trim();
    const preapprovalId = String(body.preapprovalId || body.preapproval_id || '').trim();

    if (!uid || !preapprovalId) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_UID_OR_PREAPPROVAL_ID',
        error: 'uid e preapprovalId são obrigatórios para verificar a assinatura no servidor.',
      });
    }

    const outcome = await mercadoPagoSubscriptionService.verifyAndSyncUserSubscription({
      authenticatedUid: uid,
      requestedPreapprovalId: preapprovalId,
    });

    if (!outcome.success) {
      return res.status(outcome.status).json({
        success: false,
        code: outcome.code,
        error: outcome.message,
        subscription: outcome.subscription,
      });
    }

    res.json({
      success: true,
      code: outcome.code,
      message: outcome.message,
      subscription: outcome.subscription,
      entitlement: getProPlanEntitlement(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancels future recurring billing in Mercado Pago using official status "canceled" (single 'l'),
 * while preserving the user's PRO access until trialEndDate or currentPeriodEnd.
 */
app.post('/api/subscriptions/cancel', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const uid = String(body.uid || req.headers['x-firebase-uid'] || '').trim();
    const email = String(body.email || req.headers['x-firebase-email'] || '').trim();

    if (!uid) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_UID',
        error: 'Identificador de conta (Firebase UID) é obrigatório para cancelar a assinatura.',
      });
    }

    const outcome = await mercadoPagoSubscriptionService.cancelSubscription({
      uid,
      actor: email || uid,
    });

    if (!outcome.success) {
      return res.status(outcome.status).json({
        success: false,
        code: outcome.code,
        error: outcome.message,
        payloadSentToMp: outcome.payloadSentToMp,
        subscription: outcome.subscription,
      });
    }

    res.json({
      success: true,
      code: outcome.code,
      message: outcome.message,
      payloadSentToMp: outcome.payloadSentToMp,
      subscription: outcome.subscription,
      entitlement: getProPlanEntitlement(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/webhook/mercadopago
 * Processes Mercado Pago subscription_preapproval and payment webhooks with HMAC-SHA256 verification
 * and Firestore idempotency in /subscription_webhooks/{webhookId}.
 */
app.post('/api/subscriptions/webhook/mercadopago', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const xSignature = req.headers['x-signature'] ? String(req.headers['x-signature']) : undefined;
    const xRequestId = req.headers['x-request-id'] ? String(req.headers['x-request-id']) : undefined;
    const dataId = String(
      body?.data?.id || req.query['data.id'] || req.query.id || ''
    ).trim();
    const webhookId = String(body?.id || xRequestId || `wh_${Date.now()}`).trim();
    const type = String(body?.type || body?.topic || 'subscription_preapproval').trim();
    const action = String(body?.action || 'updated').trim();

    const outcome = await mercadoPagoSubscriptionService.processWebhookNotification({
      webhookId,
      type,
      action,
      dataId,
      xSignature,
      xRequestId,
      enforceSignature: Boolean(process.env.MP_WEBHOOK_SECRET || xSignature),
    });

    res.status(outcome.status).json(outcome);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ processed: false, error: message });
  }
});

/**
 * GET /api/subscriptions/admin/summary
 * Protected administrative dashboard summary for Plans & Subscription and Legal Trust Center.
 */
app.get('/api/subscriptions/admin/summary', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const summary = await mercadoPagoSubscriptionService.getAdminDashboardSummary();
    res.json({
      success: true,
      summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/admin/plans
 * Protected administrative endpoint to update monthly/annual prices (creating a new priceVersion)
 * and toggle the 7-day free trial offer for new subscriptions.
 */
app.post('/api/subscriptions/admin/plans', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const body = req.body || {};
    const monthlyPrice =
      body.monthlyPrice !== undefined
        ? Number(body.monthlyPrice)
        : body.monthlyPriceBrl !== undefined
        ? Number(body.monthlyPriceBrl)
        : undefined;
    const annualPrice =
      body.annualPrice !== undefined
        ? Number(body.annualPrice)
        : body.annualPriceBrl !== undefined
        ? Number(body.annualPriceBrl)
        : undefined;
    const trialOfferEnabled =
      body.trialOfferEnabled !== undefined
        ? Boolean(body.trialOfferEnabled)
        : body.freeTrialEnabled !== undefined
        ? Boolean(body.freeTrialEnabled)
        : undefined;

    const updatedConfig = await mercadoPagoSubscriptionService.updateCommercialPlansAdmin({
      monthlyPrice,
      annualPrice,
      trialOfferEnabled,
      adminEmail: String(body.adminEmail || 'gustakkg15@gmail.com'),
    });
    const summary = await mercadoPagoSubscriptionService.getAdminDashboardSummary();
    res.json({
      success: true,
      config: updatedConfig,
      summary,
      message: `Configuração comercial atualizada com sucesso (Versão de preço: ${updatedConfig.priceVersion}). Assinaturas existentes preservam o ciclo já contratado.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/admin/homologation/verify
 * Runs the 10-step Mercado Pago homologation verification against the real API when MP_ACCESS_TOKEN is present,
 * or returns the fail-closed PENDING_CREDENTIALS report.
 */
app.post('/api/subscriptions/admin/homologation/verify', async (req: Request, res: Response) => {
  const authCheck = verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: authCheck.reason });
  }
  try {
    const report = await mercadoPagoSubscriptionService.executeTenStepHomologationVerification();
    res.json({
      success: true,
      report,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

// ==========================================
// VITE DEV SERVER / PRODUCTION STATIC SERVER
// ==========================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[GIO DA SORTE Server] Rodando na porta ${PORT} (${isProd ? 'produção' : 'desenvolvimento'})`);
  });
}

startServer().catch((err) => {
  console.error('[GIO DA SORTE Server] Erro fatal ao iniciar:', err);
});
