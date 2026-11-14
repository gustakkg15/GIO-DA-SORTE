import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from './src/firebase.ts';
import { tiktokAdapter } from './src/server/tiktokLiveAdapter.ts';
import { tiktokEventQueue, type SequencedSseFrame } from './src/server/tiktokEventQueue.ts';
import { tiktokDiagnosticService } from './src/server/tiktokDiagnosticService.ts';
import {
  getProPlanEntitlement,
  setProPlanTier,
  registerSessionOwner,
  getRegisteredSessionOwner,
  getOrCreateLiveSession,
  getOrganizerRaffleDefaults,
  saveOrganizerRaffleDefaults,
  updateLiveSessionConfigAndRules,
  pauseLiveSessionCollection,
  resumeLiveSessionCollection,
  endLiveSessionCollection,
  createNonBlockingSessionSnapshot,
  executeIndividualLiveDraw,
  fetchSessionTickets,
  fetchAllLiveSessions,
  fetchSessionDraws,
  fetchSnapshotById,
  computeSha256,
  selectUniformRandomIndex,
  recordAuditLog,
  previewLegacyOwnershipMigration,
} from './src/utils/tiktokLiveService.ts';
import {
  createCampaign,
  updateCampaignRulesConfig,
  addSessionToCampaign,
  freezeCampaignSnapshot,
  executeCampaignDraw,
  fetchCampaigns,
  fetchCampaignDraws,
  fetchCampaignCycles,
  advanceCampaignCycle,
  updateDrawDeliveryStatus,
  executeUnclaimedRedraw,
} from './src/utils/campaignService.ts';
import {
  loadTikTokComments,
  parseImportedComments,
  filterComments,
} from './src/utils/tiktok.ts';
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
} from './src/utils/legalAndComplianceService.ts';
import type {
  SubscriptionStatusState,
  LegalDocumentSlug,
  CommercialPlanId,
  TikTokComment,
  TikTokFilterSettings,
  TikTokWinner,
  TraditionalDrawPrecommitRecord,
} from './src/types.ts';
import {
  mercadoPagoSubscriptionService,
  redactSensitiveMpData,
} from './src/server/mercadoPagoSubscriptionService.ts';
import { paypalSubscriptionService } from './src/server/paypalSubscriptionService.ts';
import {
  requireFirebaseAuth,
  requireProPlan,
  verifyAuthenticatedFirebaseUser,
  verifyProPlanRequestAsync,
  verifyFirestoreResourceOwnership,
  buildEntitlementFromSubscriptionRecord,
  setCustomTokenVerifierForTests,
  setCustomTokenCreatorForTests,
  verifyRecentReauthentication,
} from './src/server/firebaseAdminAuth.ts';
import {
  issueSseStreamTicket,
  consumeSseStreamTicket,
} from './src/server/sseTicketService.ts';
import {
  tiktokOAuthService,
  DEV_APP_ORIGIN,
  PROD_APP_ORIGIN,
  PREVIEW_APP_ORIGIN,
  CLOUD_RUN_APP_ORIGIN,
  OAUTH_CALLBACK_PATH,
  ALLOWED_HTTPS_ORIGINS,
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  INITIATOR_COOKIE_NAME,
  resolveAuthorizedRedirectConfig,
  resolveValidatedScopes,
  checkEncryptionKeyStatus,
  diagnoseOAuthConfiguration,
  parseCookies,
  assertNoClientIdentityForgery,
  OAuthSecurityError,
} from './src/server/tiktokOAuthService.ts';
import {
  traditionalRaffleService,
  TraditionalRaffleError,
} from './src/server/traditionalRaffleService.ts';
import { requireWorkerOrFirebaseAuth } from './src/server/workerOidcAuth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseValidPort(raw: string | undefined | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const val = Number.parseInt(trimmed, 10);
  if (Number.isFinite(val) && val >= 1 && val <= 65535) {
    return val;
  }
  return null;
}

export function resolveServerPort(
  argv: string[] = process.argv,
  envPort: string | undefined = process.env.PORT
): number {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' || arg === '-p') {
      const next = argv[i + 1];
      const parsed = parseValidPort(next);
      if (parsed !== null) return parsed;
    } else if (arg.startsWith('--port=') || arg.startsWith('-p=')) {
      const parts = arg.split('=');
      const valStr = parts.slice(1).join('=');
      const parsed = parseValidPort(valStr);
      if (parsed !== null) return parsed;
    }
  }
  const envParsed = parseValidPort(envPort);
  if (envParsed !== null) return envParsed;
  return 3000;
}

const app = express();
const httpServer = http.createServer(app);
const PORT = resolveServerPort();
const HOST = '0.0.0.0';

app.use(express.json());

// CORS configuration for GitHub Pages frontend, Cloud Run and AI Studio preview environments
const ALLOWED_CORS_ORIGINS = new Set<string>([
  'https://gustakk15.github.io',
  'https://gustakkg15.github.io',
  'https://gio-da-sorte-1042651147403.europe-west2.run.app',
  'https://ais-pre-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app',
  'https://ais-dev-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_CORS_ORIGINS.has(origin) || origin.endsWith('.github.io'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    const requestHeaders = req.headers['access-control-request-headers'];
    const allowedHeaders = requestHeaders
      ? String(requestHeaders)
      : 'Content-Type, Authorization, x-firebase-uid, x-firebase-email, x-firebase-email-verified, x-tiktok-oauth-initiator, x-tiktok-oauth-state';
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Garantir que nenhuma resposta /api/* seja armazenada em cache por navegador, proxy ou Service Worker
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Track active SSE connections by clientId to prevent duplicate SSE streams per browser tab/session
const activeSseConnections = new Map<
  string,
  { res: Response; sessionId?: string; connectedAt: number; cleanup: () => void }
>();

// Wire TikTokLiveAdapter directly into the non-blocking Durable Event Queue (WAL + Micro-Batch Firestore Persistence)
// Enforces PRO plan entitlement per session ownerUid on the backend before accepting gift accounting or ticket issuance.
tiktokAdapter.onGift((event, _streak, capturePerfStart) => {
  const eventOwnerUid =
    event.ownerUid ||
    getRegisteredSessionOwner(event.sessionId) ||
    tiktokAdapter.getCurrentOwnerUid() ||
    activeLiveConnectionOwnerUid ||
    undefined;
  const plan = getProPlanEntitlement(eventOwnerUid);
  if (!plan.active) {
    return;
  }
  const enrichedEvent =
    eventOwnerUid && !event.ownerUid ? { ...event, ownerUid: eventOwnerUid } : event;
  tiktokEventQueue.enqueueGiftEvent(enrichedEvent, capturePerfStart);
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
    prodRedirectUri: `${CLOUD_RUN_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    previewRedirectUri: `${PREVIEW_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
    devRedirectUri: `${DEV_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
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
 * Flow 1 (First Access / Login with TikTok) — Start OAuth Authorization
 * Supports both GET /api/tiktok/auth/url and POST /api/tiktok/auth/login/start
 */
async function handleStartTikTokLoginOAuth(req: Request, res: Response) {
  try {
    assertNoClientIdentityForgery({
      ...(req.query as Record<string, any>),
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
    });

    const diag = diagnoseOAuthConfiguration({ req });

    if (!diag.canInitiateAuthFlow) {
      return res.status(400).json({
        oauthConfigured: false,
        canInitiateAuthFlow: false,
        clientKeyConfigured: diag.clientKeyConfigured,
        clientSecretConfigured: diag.clientSecretConfigured,
        encryptionKeyConfigured: diag.encryptionKeyConfigured,
        redirectUri: diag.redirectUri,
        prodRedirectUri: `${CLOUD_RUN_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
        previewRedirectUri: `${PREVIEW_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
        devRedirectUri: `${DEV_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
        configurationErrors: diag.configurationErrors,
        error:
          diag.configurationErrors.join(' ') ||
          'TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET e/ou OAUTH_ENCRYPTION_KEY (256 bits) não estão configuradas nas variáveis de ambiente do servidor.',
      });
    }

    const cookies = parseCookies(req);
    const existingInitiator = cookies[INITIATOR_COOKIE_NAME] || undefined;

    const authReq = await tiktokOAuthService.createAuthorizationUrl({
      req,
      flowMode: 'LOGIN',
      initiatorToken: existingInitiator,
      generateInitiatorToken: true,
    });

    const setCookies: string[] = [
      `${STATE_COOKIE_NAME}=${authReq.state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`,
    ];
    if (authReq.initiatorToken) {
      setCookies.push(tiktokOAuthService.formatInitiatorCookie(authReq.initiatorToken, 600));
    }
    res.setHeader('Set-Cookie', setCookies);

    return res.json({
      url: authReq.url,
      redirectUri: authReq.redirectUri,
      targetOrigin: authReq.targetOrigin,
      state: authReq.state,
      initiatorToken: authReq.initiatorToken,
      flowMode: authReq.flowMode,
      scopes: authReq.scopes,
      pkceEnabled: authReq.pkceEnabled,
      expiresAt: authReq.expiresAt,
    });
  } catch (err: unknown) {
    const status = err instanceof OAuthSecurityError ? err.statusCode : 500;
    const code = err instanceof OAuthSecurityError ? err.code : 'OAUTH_START_ERROR';
    const message = err instanceof Error ? err.message : String(err);
    return res.status(status).json({ oauthConfigured: false, code, error: message });
  }
}

app.get('/api/tiktok/auth/url', handleStartTikTokLoginOAuth);
app.post('/api/tiktok/auth/login/start', handleStartTikTokLoginOAuth);

/**
 * Flow 2 (Link TikTok to Existing GIO Account) — Start OAuth Account Linking
 * Requires:
 * 1. Active authenticated Firebase session (`requireFirebaseAuth`)
 * 2. Recent step-up reauthentication via password or Google Auth (`verifyRecentReauthentication`)
 */
app.post(
  '/api/tiktok/auth/link/start',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const body = req.body && typeof req.body === 'object' ? req.body : {};

      // Block if client tries to specify a different UID or forge open_id/tokens
      if (body.uid && String(body.uid).trim() !== authUid) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error: 'Não é permitido vincular conta TikTok em nome de outro UID.',
        });
      }
      const sanitizedPayloadCheck = { ...body };
      delete sanitizedPayloadCheck.uid;
      assertNoClientIdentityForgery(sanitizedPayloadCheck);

      // Mandatory Cryptographic Backend Step-Up Reauthentication Check
      const reauthCheck = await verifyRecentReauthentication(req, {
        expectedUid: authUid,
      });
      if (!reauthCheck.verified) {
        return res.status(reauthCheck.status).json({
          success: false,
          code: reauthCheck.code || 'REAUTHENTICATION_REQUIRED',
          error: reauthCheck.reason,
        });
      }

      const diag = diagnoseOAuthConfiguration({ req });
      if (!diag.canInitiateAuthFlow) {
        return res.status(400).json({
          success: false,
          oauthConfigured: false,
          canInitiateAuthFlow: false,
          configurationErrors: diag.configurationErrors,
          error:
            diag.configurationErrors.join(' ') ||
            'Credenciais OAuth do TikTok não estão configuradas no servidor.',
        });
      }

      const cookies = parseCookies(req);
      const existingInitiator = cookies[INITIATOR_COOKIE_NAME] || undefined;

      const authReq = await tiktokOAuthService.createAuthorizationUrl({
        req,
        flowMode: 'LINK',
        linkTargetUid: authUid,
        reauthVerified: true,
        initiatorToken: existingInitiator,
        generateInitiatorToken: true,
      });

      const setCookies: string[] = [
        `${STATE_COOKIE_NAME}=${authReq.state}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=600`,
      ];
      if (authReq.initiatorToken) {
        setCookies.push(tiktokOAuthService.formatInitiatorCookie(authReq.initiatorToken, 600));
      }
      res.setHeader('Set-Cookie', setCookies);

      return res.json({
        success: true,
        url: authReq.url,
        redirectUri: authReq.redirectUri,
        targetOrigin: authReq.targetOrigin,
        state: authReq.state,
        initiatorToken: authReq.initiatorToken,
        flowMode: 'LINK',
        linkTargetUid: authUid,
        scopes: authReq.scopes,
        pkceEnabled: authReq.pkceEnabled,
        expiresAt: authReq.expiresAt,
      });
    } catch (err: unknown) {
      const status = err instanceof OAuthSecurityError ? err.statusCode : 500;
      const code = err instanceof OAuthSecurityError ? err.code : 'OAUTH_LINK_START_ERROR';
      const message = err instanceof Error ? err.message : String(err);
      return res.status(status).json({ success: false, code, error: message });
    }
  }
);

/**
 * TikTok OAuth 2.0 Callback Endpoint (Popup PostMessage Flow)
 * - Atomically validates and consumes single-use CSRF state + initiator session binding
 * - Executes Flow 1 (`LOGIN`) or Flow 2 (`LINK`) transactionally on the backend
 * - Issues `firebaseCustomToken` (for `LOGIN`) only after complete identity and binding verification
 * - NEVER returns `access_token` or `refresh_token` to the browser
 */
async function handleTikTokOAuthCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query;

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
    <title>Autenticação TikTok — GIO DA SORTE</title>
  </head>
  <body style="background:#080A0F;color:#FFFFFF;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center;">
    <div style="max-width:420px;padding:24px;border-radius:16px;background:#10141E;border:1px solid rgba(255,255,255,0.1);">
      <h2 style="margin:0 0 8px 0;font-size:16px;color:#B9FC01;">GIO DA SORTE</h2>
      <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.5;">${messageText}</p>
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
    const errMsg = String(
      error_description || error || 'Autorização recusada ou cancelada no TikTok.'
    );
    return renderPopupResult(
      { type: 'OAUTH_AUTH_ERROR', provider: 'tiktok', error: errMsg },
      fallbackOrigin,
      `Não foi possível concluir a autenticação no TikTok: ${errMsg}`
    );
  }

  try {
    const cookies = parseCookies(req);
    const initiatorToken =
      cookies[INITIATOR_COOKIE_NAME] ||
      (typeof req.headers['x-tiktok-oauth-initiator'] === 'string'
        ? req.headers['x-tiktok-oauth-initiator']
        : undefined) ||
      (typeof req.query.initiatorToken === 'string' ? req.query.initiatorToken : undefined);

    const rawQueryCopy: Record<string, any> = { ...(req.query as Record<string, any>) };
    delete rawQueryCopy.code;
    delete rawQueryCopy.state;
    delete rawQueryCopy.scopes;
    delete rawQueryCopy.initiatorToken;

    const result = await tiktokOAuthService.handleCallbackExchange({
      code: typeof code === 'string' ? code : '',
      state: typeof state === 'string' ? state : '',
      initiatorToken,
      rawClientPayload: rawQueryCopy,
      issueFirebaseCustomToken: true,
    });

    res.setHeader('Set-Cookie', [
      tiktokOAuthService.formatSessionCookie(result.sessionToken, result.maxAgeSec),
      `${STATE_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`,
      tiktokOAuthService.formatClearInitiatorCookie(),
    ]);

    return renderPopupResult(
      {
        type: 'OAUTH_AUTH_SUCCESS',
        provider: 'tiktok',
        flowMode: result.identityResolution.flowMode,
        uid: result.identityResolution.uid,
        isNewUser: result.identityResolution.isNewUser,
        linkedToExistingAccount: result.identityResolution.linkedToExistingAccount,
        firebaseCustomToken: result.identityResolution.firebaseCustomToken || null,
        user: result.sessionDoc.userProfile,
        scope: result.sessionDoc.scope,
        expiresAt: result.sessionDoc.accessTokenExpiresAt,
        authenticatedAt: result.sessionDoc.updatedAt || Date.now(),
        sessionState: 'ACTIVE',
      },
      result.targetOrigin,
      result.identityResolution.flowMode === 'LINK'
        ? 'Conta TikTok vinculada com sucesso à sua conta GIO da Sorte! Esta janela será fechada automaticamente.'
        : 'Autenticação TikTok concluída com sucesso! Esta janela será fechada automaticamente.'
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
 * POST /api/tiktok/auth/exchange
 * Programmatic JSON callback exchange endpoint for SPA/Integration verification.
 * Enforces identical CSRF state, initiator binding, and client forgery protections.
 * NEVER returns `access_token` or `refresh_token`.
 */
app.post('/api/tiktok/auth/exchange', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cookies = parseCookies(req);
    const initiatorToken =
      cookies[INITIATOR_COOKIE_NAME] ||
      (typeof req.headers['x-tiktok-oauth-initiator'] === 'string'
        ? req.headers['x-tiktok-oauth-initiator']
        : undefined) ||
      (typeof body.initiatorToken === 'string' ? body.initiatorToken : undefined);

    const payloadToCheck = { ...body };
    delete payloadToCheck.code;
    delete payloadToCheck.state;
    delete payloadToCheck.initiatorToken;

    const result = await tiktokOAuthService.handleCallbackExchange({
      code: typeof body.code === 'string' ? body.code : '',
      state: typeof body.state === 'string' ? body.state : '',
      initiatorToken,
      rawClientPayload: payloadToCheck,
      issueFirebaseCustomToken: true,
    });

    res.setHeader('Set-Cookie', [
      tiktokOAuthService.formatSessionCookie(result.sessionToken, result.maxAgeSec),
      `${STATE_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`,
      tiktokOAuthService.formatClearInitiatorCookie(),
    ]);

    return res.status(200).json({
      success: true,
      flowMode: result.identityResolution.flowMode,
      uid: result.identityResolution.uid,
      openId: result.identityResolution.openId,
      isNewUser: result.identityResolution.isNewUser,
      linkedToExistingAccount: result.identityResolution.linkedToExistingAccount,
      firebaseCustomToken: result.identityResolution.firebaseCustomToken || null,
      user: result.sessionDoc.userProfile,
      scope: result.sessionDoc.scope,
      expiresAt: result.sessionDoc.accessTokenExpiresAt,
      authenticatedAt: result.sessionDoc.updatedAt || Date.now(),
      sessionState: 'ACTIVE',
    });
  } catch (err: unknown) {
    const status = err instanceof OAuthSecurityError ? err.statusCode : 400;
    const code = err instanceof OAuthSecurityError ? err.code : 'OAUTH_EXCHANGE_ERROR';
    const message = err instanceof Error ? err.message : String(err);
    return res.status(status).json({
      success: false,
      code,
      error: message,
    });
  }
});

/**
 * POST /api/tiktok/auth/username-login
 * Explicitly blocks any attempt to authenticate using only `@username` or `open_id` without OAuth.
 * `@username` is strictly a visual lookup aid and never an authentication factor.
 */
app.post('/api/tiktok/auth/username-login', (req: Request, res: Response) => {
  const rawHandle = String(req.body?.username || req.body?.handle || '')
    .replace(/^@/, '')
    .trim();
  return res.status(403).json({
    success: false,
    code: 'USERNAME_NOT_AUTH_FACTOR',
    requiresOfficialOAuth: true,
    visualHandle: rawHandle ? `@${rawHandle}` : null,
    error:
      'Autenticação bloqueada: @usuário é apenas um identificador visual e não comprova propriedade da conta. Conclua o login oficial via TikTok OAuth 2.0 para autenticar.',
  });
});

/**
 * GET /api/tiktok/auth/identity
 * Returns the authenticated GIO user's linked TikTok identity metadata.
 * NEVER exposes `access_token` or `refresh_token`.
 */
app.get(
  '/api/tiktok/auth/identity',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const status = await tiktokOAuthService.getUserTikTokIdentityStatus(authUid);
      return res.status(200).json({
        success: true,
        ...status,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * Operation 1 — Logout GIO (`POST /api/auth/gio-logout`)
 * Ends ONLY the user's GIO browser session.
 * - Preserves TikTok authorization (`tiktok_identities/{identityDocId}`, `users/{uid}/private_tokens/tiktok`).
 * - Preserves active and authorized TikTok LIVE workers (`activeLiveConnectionOwnerUid`, `tiktokAdapter`, Webcast lease).
 * - Preserves raffle settings and draw history.
 */
app.post(
  '/api/auth/gio-logout',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const identityStatus = await tiktokOAuthService.getUserTikTokIdentityStatus(authUid);
    const persistedLock = await readPersistedWebcastRuntimeState();
    const hasActiveAuthorizedLiveWorker =
      activeLiveConnectionOwnerUid === authUid ||
      tiktokAdapter.getCurrentOwnerUid() === authUid ||
      Boolean(
        persistedLock &&
          persistedLock.shouldBeConnected &&
          persistedLock.ownerUid === authUid &&
          persistedLock.expiresAt > Date.now()
      );

    return res.status(200).json({
      success: true,
      operation: 'GIO_LOGOUT',
      uid: authUid,
      gioSessionEnded: true,
      tiktokAuthorizationPreserved: identityStatus.linked,
      activeLiveWorkerPreserved: hasActiveAuthorizedLiveWorker,
      raffleSettingsAndHistoryPreserved: true,
    });
  }
);

/**
 * Operation 2 — Desvinculação TikTok (`POST /api/tiktok/auth/unlink`)
 * - Revokes OAuth tokens at TikTok API v2.
 * - Wipes the encrypted token vault (`users/{uid}/private_tokens/tiktok`) and revokes `oauth_sessions`.
 * - Cleanly stops any active tasks/LIVE workers that depend on this user's TikTok authorization.
 * - Preserves the GIO account (`users/{uid}`), raffle configurations, and draw history.
 */
app.post(
  '/api/tiktok/auth/unlink',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      if (req.body?.uid && String(req.body.uid).trim() !== authUid) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error: 'Não é permitido desvincular a conta TikTok de outro usuário.',
        });
      }

      const cookies = parseCookies(req);
      const rawSessionToken = cookies[SESSION_COOKIE_NAME] || req.body?.sessionToken || '';

      const outcome = await tiktokOAuthService.unlinkTikTokFromUserAccount({
        uid: authUid,
        sessionToken: rawSessionToken,
      });

      res.setHeader('Set-Cookie', tiktokOAuthService.formatClearSessionCookie());
      return res.status(200).json({
        success: true,
        operation: 'TIKTOK_UNLINK',
        unlinked: outcome.unlinked,
        uid: outcome.uid,
        previousOpenId: outcome.previousOpenId,
        revokedAtTikTok: outcome.revokedAtTikTok,
        revokedSessionsCount: outcome.revokedSessionsCount,
        dependentLiveWorkersStopped: outcome.stoppedDependentWorkers,
        releasedLiveLease: outcome.releasedLiveLease,
        gioAccountPreserved: true,
        raffleSettingsAndHistoryPreserved: true,
      });
    } catch (err: unknown) {
      const status = err instanceof OAuthSecurityError ? err.statusCode : 500;
      const code = err instanceof OAuthSecurityError ? err.code : 'UNLINK_ERROR';
      const message = err instanceof Error ? err.message : String(err);
      return res.status(status).json({ success: false, code, error: message });
    }
  }
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

// Track active LIVE room ownerUid, sessionId, and fencingToken to enforce ownership and prevent stale lease commits
let activeLiveConnectionOwnerUid: string | null = null;
let activeLiveConnectionSessionId: string | null = null;
let activeLiveConnectionFencingToken = 0;
let serverInstanceId = `srv_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export interface PersistedWebcastRuntimeState {
  instanceId: string;
  ownerUid: string;
  sessionId: string;
  roomUsername: string;
  activeRuleId: string;
  currentRate: number;
  campaignId?: string;
  cycleId?: string;
  shouldBeConnected: boolean;
  lastKnownState: string;
  updatedAt: number;
  expiresAt: number;
  fencingToken: number;
}

export interface WebcastLockTxContext {
  get: () => Promise<PersistedWebcastRuntimeState | null>;
  set: (nextState: PersistedWebcastRuntimeState) => Promise<void> | void;
}

export interface ServerRuntimeTestHooks {
  bypassConnectRouteMutex?: boolean;
  customLockTxRunner?: (<T>(fn: (tx: WebcastLockTxContext) => Promise<T>) => Promise<T>) | null;
  customLockReader?: (() => Promise<PersistedWebcastRuntimeState | null>) | null;
  customLockWriter?: ((state: PersistedWebcastRuntimeState) => Promise<void>) | null;
  customRenewLeaseRunner?: ((params: any) => Promise<any>) | null;
  customGetOrCreateLiveSession?: typeof getOrCreateLiveSession | null;
  customRestoreSessionFromFirestore?: ((sessionId: string) => Promise<{
    restoredStreaks: number;
    restoredEvents: number;
    sessionFound?: boolean;
    ownerUid?: string;
    username?: string;
    activeRuleId?: string;
    currentRate?: number;
  }>) | null;
  customAdapterConnect?: typeof tiktokAdapter.connect | null;
}

let serverTestHooks: ServerRuntimeTestHooks = {};

export function setServerRuntimeTestHooks(hooks: ServerRuntimeTestHooks | null): void {
  serverTestHooks = hooks || {};
}

export function getServerRuntimeTestState() {
  return {
    activeLiveConnectionOwnerUid,
    activeLiveConnectionSessionId,
    activeLiveConnectionFencingToken,
    serverInstanceId,
    cachedRuntimeLockState,
    adapterCurrentSessionId: tiktokAdapter.getRawCurrentSessionId(),
    adapterCurrentOwnerUid: tiktokAdapter.getCurrentOwnerUid(),
    adapterState: tiktokAdapter.getStatus().state,
  };
}

export function resetServerRuntimeStateForTests(): void {
  activeLiveConnectionOwnerUid = null;
  activeLiveConnectionSessionId = null;
  activeLiveConnectionFencingToken = 0;
  cachedRuntimeLockState = null;
  tiktokAdapter.resetMemoryStateForSimulatedRestart();
}

const WEBCAST_LOCK_LEASE_MS = 45_000;
let cachedRuntimeLockState: PersistedWebcastRuntimeState | null = null;
let connectRouteMutexChain: Promise<unknown> = Promise.resolve();

export function withConnectRouteMutex<T>(task: () => Promise<T>): Promise<T> {
  const next = connectRouteMutexChain.then(task, task);
  connectRouteMutexChain = next.catch(() => {});
  return next;
}

function getGlobalWebcastLockRef() {
  return doc(db, 'sessions', '_system_runtime_lock', 'locks', 'global_webcast_lock');
}

async function runWebcastLockTransaction<T>(
  fn: (txCtx: WebcastLockTxContext) => Promise<T>
): Promise<T> {
  if (serverTestHooks.customLockTxRunner) {
    return await serverTestHooks.customLockTxRunner(fn);
  }
  const lockRef = getGlobalWebcastLockRef();
  return await runTransaction(db, async (tx) => {
    return await fn({
      get: async () => {
        const snap = await tx.get(lockRef);
        return snap.exists() ? (snap.data() as PersistedWebcastRuntimeState) : null;
      },
      set: (nextState: PersistedWebcastRuntimeState) => {
        tx.set(lockRef, nextState, { merge: true });
      },
    });
  });
}

export async function readPersistedWebcastRuntimeState(): Promise<PersistedWebcastRuntimeState | null> {
  if (serverTestHooks.customLockReader) {
    const customState = await serverTestHooks.customLockReader();
    if (customState) {
      cachedRuntimeLockState = customState;
    }
    return customState;
  }
  try {
    const snap = await getDoc(getGlobalWebcastLockRef());
    if (snap.exists()) {
      const data = snap.data() as PersistedWebcastRuntimeState;
      cachedRuntimeLockState = data;
      return data;
    }
  } catch {
    // Fallback to in-memory cache if Firestore read transiently fails
  }
  return cachedRuntimeLockState;
}

export async function persistWebcastRuntimeState(state: PersistedWebcastRuntimeState): Promise<void> {
  cachedRuntimeLockState = state;
  if (serverTestHooks.customLockWriter) {
    await serverTestHooks.customLockWriter(state);
    return;
  }
  try {
    await setDoc(getGlobalWebcastLockRef(), state, { merge: true });
  } catch {
    // Ignore transient Firestore error after updating memory cache
  }
}

export async function verifyActiveLeaseFencingToken(
  expectedOwnerUid: string,
  expectedSessionId: string,
  expectedFencingToken: number
): Promise<{
  valid: boolean;
  reason?: string;
  currentLockState?: PersistedWebcastRuntimeState | null;
}> {
  const persisted = await readPersistedWebcastRuntimeState();
  const now = Date.now();
  if (persisted) {
    if ((persisted.fencingToken || 0) > expectedFencingToken) {
      return {
        valid: false,
        reason: `Fencing token obsoleto (esperado=${expectedFencingToken}, atual=${persisted.fencingToken}). Operação descartada após perda do lease.`,
        currentLockState: persisted,
      };
    }
    if (
      persisted.shouldBeConnected &&
      persisted.expiresAt > now &&
      persisted.ownerUid &&
      persisted.ownerUid !== expectedOwnerUid
    ) {
      return {
        valid: false,
        reason: 'Lease adquirido por outro organizador durante a execução.',
        currentLockState: persisted,
      };
    }
    if (
      persisted.shouldBeConnected &&
      persisted.expiresAt > now &&
      persisted.sessionId &&
      expectedSessionId &&
      persisted.sessionId !== expectedSessionId
    ) {
      return {
        valid: false,
        reason: 'Lease transferido para outra sessão durante a execução.',
        currentLockState: persisted,
      };
    }
  }

  if (activeLiveConnectionFencingToken > expectedFencingToken) {
    return {
      valid: false,
      reason: `Fencing token em memória (${activeLiveConnectionFencingToken}) é superior ao token da operação (${expectedFencingToken}).`,
      currentLockState: persisted,
    };
  }
  if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== expectedOwnerUid) {
    return {
      valid: false,
      reason: 'A conexão ativa em memória pertence a outro organizador.',
      currentLockState: persisted,
    };
  }

  return { valid: true, currentLockState: persisted };
}

export async function acquireOrCoalesceWebcastLock(params: {
  ownerUid: string;
  sessionId: string;
  roomUsername: string;
  activeRuleId: string;
  currentRate: number;
  campaignId?: string;
  cycleId?: string;
  requestedInstanceId?: string;
  isRestoreOperation?: boolean;
}): Promise<{
  allowed: boolean;
  status: number;
  code?: string;
  reason?: string;
  coalescedCrossInstance?: boolean;
  effectiveSessionId: string;
  fencingToken: number;
  lockState?: PersistedWebcastRuntimeState;
}> {
  const now = Date.now();
  const callerInstanceId = params.requestedInstanceId || serverInstanceId;

  try {
    return await runWebcastLockTransaction(async (tx) => {
      const existing = await tx.get();

      if (existing && existing.shouldBeConnected && existing.expiresAt > now) {
        if (existing.ownerUid && existing.ownerUid !== params.ownerUid) {
          return {
            allowed: false,
            status: 403,
            code: 'OWNERSHIP_FORBIDDEN',
            reason:
              'Acesso negado: já existe uma conexão LIVE ativa pertencente a outro organizador autenticado.',
            effectiveSessionId: existing.sessionId,
            fencingToken: existing.fencingToken || 0,
            lockState: existing,
          };
        }

        // Same owner: check if another backend instance actively holds the Webcast connection
        const sameRoom =
          !params.roomUsername ||
          !existing.roomUsername ||
          String(existing.roomUsername || '').toLowerCase() ===
            String(params.roomUsername || '').toLowerCase();
        const sameOrUnspecifiedSession =
          !params.sessionId ||
          !existing.sessionId ||
          existing.sessionId === params.sessionId ||
          Boolean(params.requestedInstanceId);

        if (
          !params.isRestoreOperation &&
          sameRoom &&
          sameOrUnspecifiedSession &&
          existing.instanceId &&
          existing.instanceId !== callerInstanceId
        ) {
          return {
            allowed: true,
            status: 200,
            coalescedCrossInstance: true,
            effectiveSessionId: existing.sessionId || params.sessionId,
            fencingToken: existing.fencingToken || 1,
            lockState: existing,
          };
        }
      }

      const resolvedSid =
        existing &&
        existing.shouldBeConnected &&
        existing.ownerUid === params.ownerUid &&
        String(existing.roomUsername || '').toLowerCase() ===
          String(params.roomUsername || '').toLowerCase() &&
        existing.sessionId &&
        !params.sessionId
          ? existing.sessionId
          : params.sessionId;

      const isSameActiveLease =
        Boolean(existing) &&
        existing!.shouldBeConnected &&
        existing!.expiresAt > now &&
        existing!.ownerUid === params.ownerUid &&
        existing!.sessionId === resolvedSid &&
        existing!.instanceId === callerInstanceId;

      const nextFencingToken = isSameActiveLease
        ? (existing!.fencingToken || 1)
        : (existing?.fencingToken || 0) + 1;
      const nextLock: PersistedWebcastRuntimeState = {
        instanceId: callerInstanceId,
        ownerUid: params.ownerUid,
        sessionId: resolvedSid,
        roomUsername: params.roomUsername || existing?.roomUsername || '',
        activeRuleId: params.activeRuleId || existing?.activeRuleId || 'rule_default_100',
        currentRate: params.currentRate || existing?.currentRate || 100,
        ...(params.campaignId || existing?.campaignId
          ? { campaignId: params.campaignId || existing?.campaignId }
          : {}),
        ...(params.cycleId || existing?.cycleId
          ? { cycleId: params.cycleId || existing?.cycleId }
          : {}),
        shouldBeConnected: true,
        lastKnownState: tiktokAdapter.getStatus().state || 'CONNECTING',
        updatedAt: now,
        expiresAt: now + WEBCAST_LOCK_LEASE_MS,
        fencingToken: nextFencingToken,
      };
      await tx.set(nextLock);
      cachedRuntimeLockState = nextLock;

      return {
        allowed: true,
        status: 200,
        coalescedCrossInstance: false,
        effectiveSessionId: resolvedSid,
        fencingToken: nextFencingToken,
        lockState: nextLock,
      };
    });
  } catch (err) {
    // P1-LOCK-B4: Fail-closed when Firestore transaction fails (never grant connection locally)
    const message = err instanceof Error ? err.message : String(err);
    return {
      allowed: false,
      status: 503,
      code: 'LOCK_UNAVAILABLE',
      reason: `Não foi possível verificar ou adquirir o lock distribuído no Firestore: ${message}`,
      effectiveSessionId: params.sessionId,
      fencingToken: 0,
    };
  }
}

export async function releaseWebcastLock(
  ownerUid: string,
  options?: {
    sessionId?: string;
    expectedFencingToken?: number;
  }
): Promise<{
  released: boolean;
  idempotent: boolean;
  status: number;
  code?: string;
  reason?: string;
  lockState?: PersistedWebcastRuntimeState | null;
}> {
  const cleanOwnerUid = String(ownerUid || '').trim();
  const now = Date.now();

  try {
    return await runWebcastLockTransaction(async (tx) => {
      const existing = await tx.get();

      if (!existing) {
        return {
          released: true,
          idempotent: true,
          status: 200,
          lockState: null,
        };
      }

      // Never overwrite a lock belonging to another organizer
      if (existing.ownerUid && existing.ownerUid !== cleanOwnerUid) {
        return {
          released: false,
          idempotent: false,
          status: 403,
          code: 'OWNERSHIP_FORBIDDEN',
          reason:
            'Acesso negado: o lock distribuído pertence a outro organizador e não pode ser liberado por esta conta.',
          lockState: existing,
        };
      }

      // Validate expectedFencingToken when provided: never release a newer lease
      if (
        options?.expectedFencingToken !== undefined &&
        (existing.fencingToken || 0) > options.expectedFencingToken
      ) {
        return {
          released: false,
          idempotent: true,
          status: 409,
          code: 'STALE_FENCING_TOKEN',
          reason:
            'Não foi possível liberar o lock: um lease mais recente (fencingToken superior) já está ativo.',
          lockState: existing,
        };
      }

      // Validate sessionId when provided and lock is active on a different session
      if (
        options?.sessionId &&
        existing.shouldBeConnected &&
        existing.sessionId &&
        existing.sessionId !== options.sessionId
      ) {
        return {
          released: false,
          idempotent: true,
          status: 409,
          code: 'SESSION_MISMATCH',
          reason: 'Não foi possível liberar o lock: o lease ativo pertence a outra sessão.',
          lockState: existing,
        };
      }

      // Idempotent when already released/disconnected for the same owner
      if (!existing.shouldBeConnected && existing.lastKnownState === 'DISCONNECTED' && existing.expiresAt === 0) {
        return {
          released: true,
          idempotent: true,
          status: 200,
          lockState: existing,
        };
      }

      const nextFencingToken = (existing.fencingToken || 0) + 1;
      const nextLock: PersistedWebcastRuntimeState = {
        instanceId: serverInstanceId,
        ownerUid: cleanOwnerUid,
        sessionId: '',
        roomUsername: '',
        activeRuleId: 'rule_default_100',
        currentRate: 100,
        shouldBeConnected: false,
        lastKnownState: 'DISCONNECTED',
        updatedAt: now,
        expiresAt: 0,
        fencingToken: nextFencingToken,
      };
      await tx.set(nextLock);
      cachedRuntimeLockState = nextLock;

      return {
        released: true,
        idempotent: false,
        status: 200,
        lockState: nextLock,
      };
    });
  } catch (err) {
    // P1-LOCK-B4: Fail-closed on release failure
    const message = err instanceof Error ? err.message : String(err);
    return {
      released: false,
      idempotent: false,
      status: 503,
      code: 'LOCK_UNAVAILABLE',
      reason: `Não foi possível liberar o lock distribuído no Firestore: ${message}`,
    };
  }
}

// Register handler so Operation 2 (Desvinculação TikTok) cleanly stops any active TikTok LIVE
// worker/task belonging to the unlinking user without deleting raffle configurations or history.
tiktokOAuthService.setOnUnlinkStopWorkersHandler(async (uid: string) => {
  return await withConnectRouteMutex(async () => {
    let stoppedWorkers = 0;
    let releasedLease = false;

    const persistedLock = await readPersistedWebcastRuntimeState();
    const ownsPersistedLock = Boolean(
      persistedLock && persistedLock.shouldBeConnected && persistedLock.ownerUid === uid
    );
    const ownsActiveConnection =
      activeLiveConnectionOwnerUid === uid || tiktokAdapter.getCurrentOwnerUid() === uid;

    if (ownsPersistedLock || ownsActiveConnection) {
      const releaseRes = await releaseWebcastLock(uid).catch(() => ({ released: false }));
      releasedLease = Boolean(releaseRes.released);
    }

    if (tiktokAdapter.getCurrentOwnerUid() === uid || activeLiveConnectionOwnerUid === uid) {
      await tiktokAdapter.disconnect(true).catch(() => {});
      stoppedWorkers += 1;
    }

    if (activeLiveConnectionOwnerUid === uid) {
      activeLiveConnectionOwnerUid = null;
      activeLiveConnectionSessionId = null;
      activeLiveConnectionFencingToken = 0;
    }

    return { stoppedWorkers, releasedLease };
  });
});

/**
 * P1-LOCK-B3: Transactional lease renewal for the active session (Heartbeat).
 * Validates instanceId, ownerUid, sessionId, and fencingToken before extending expiresAt.
 * Preserves fencingToken on renewal and rejects expired or hijacked leases.
 */
export async function renewWebcastLeaseTransaction(params: {
  instanceId: string;
  ownerUid: string;
  sessionId: string;
  fencingToken: number;
  lastKnownState?: string;
  roomUsername?: string;
  activeRuleId?: string;
  currentRate?: number;
  campaignId?: string;
  cycleId?: string;
}): Promise<{
  renewed: boolean;
  status: number;
  code?: string;
  reason?: string;
  lockState?: PersistedWebcastRuntimeState | null;
}> {
  if (serverTestHooks.customRenewLeaseRunner) {
    return await serverTestHooks.customRenewLeaseRunner(params);
  }
  const now = Date.now();
  try {
    return await runWebcastLockTransaction(async (tx) => {
      const existing = await tx.get();
      if (!existing) {
        return {
          renewed: false,
          status: 404,
          code: 'LEASE_NOT_FOUND',
          reason: 'Documento de lock não existe no Firestore.',
        };
      }

      if (existing.ownerUid !== params.ownerUid) {
        return {
          renewed: false,
          status: 403,
          code: 'OWNERSHIP_FORBIDDEN',
          reason: 'O lease pertence a outro organizador.',
          lockState: existing,
        };
      }

      if ((existing.fencingToken || 0) !== params.fencingToken) {
        return {
          renewed: false,
          status: 409,
          code: 'STALE_FENCING_TOKEN',
          reason: `Fencing token divergente (esperado=${params.fencingToken}, atual=${existing.fencingToken}).`,
          lockState: existing,
        };
      }

      if (existing.sessionId && params.sessionId && existing.sessionId !== params.sessionId) {
        return {
          renewed: false,
          status: 409,
          code: 'SESSION_MISMATCH',
          reason: 'O lease está associado a outra sessão.',
          lockState: existing,
        };
      }

      if (existing.expiresAt <= now) {
        return {
          renewed: false,
          status: 410,
          code: 'LEASE_EXPIRED',
          reason: 'O lease expirou no Firestore e não pode ser renovado sem reaquisição.',
          lockState: existing,
        };
      }

      if (existing.instanceId && existing.instanceId !== params.instanceId) {
        return {
          renewed: false,
          status: 409,
          code: 'INSTANCE_MISMATCH',
          reason: 'O lease está registrado para outra instância.',
          lockState: existing,
        };
      }

      if (!existing.shouldBeConnected) {
        return {
          renewed: false,
          status: 409,
          code: 'LEASE_DISCONNECTED',
          reason: 'O lease já foi marcado como desconectado.',
          lockState: existing,
        };
      }

      const updatedLock: PersistedWebcastRuntimeState = {
        ...existing,
        instanceId: params.instanceId,
        ownerUid: params.ownerUid,
        sessionId: params.sessionId || existing.sessionId,
        roomUsername: params.roomUsername || existing.roomUsername,
        activeRuleId: params.activeRuleId || existing.activeRuleId,
        currentRate: params.currentRate || existing.currentRate,
        ...(params.campaignId ? { campaignId: params.campaignId } : {}),
        ...(params.cycleId ? { cycleId: params.cycleId } : {}),
        shouldBeConnected: true,
        lastKnownState: params.lastKnownState || existing.lastKnownState,
        updatedAt: now,
        expiresAt: now + WEBCAST_LOCK_LEASE_MS,
        fencingToken: existing.fencingToken,
      };

      await tx.set(updatedLock);
      cachedRuntimeLockState = updatedLock;

      return {
        renewed: true,
        status: 200,
        lockState: updatedLock,
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      renewed: false,
      status: 503,
      code: 'LOCK_UNAVAILABLE',
      reason: `Falha ao renovar lease no Firestore: ${message}`,
    };
  }
}

const isDirectServerEntry =
  process.env.GIO_TEST_MODE !== 'true' &&
  Boolean(process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename));

// P1-LOCK-B3: Transactional heartbeat lease renewal (never blind setDoc)
if (isDirectServerEntry) {
  setInterval(async () => {
    const status = tiktokAdapter.getStatus();
    const rawSid = tiktokAdapter.getRawCurrentSessionId();
    const currentOwnerUid = activeLiveConnectionOwnerUid;
    const currentToken = activeLiveConnectionFencingToken;
    if (
      rawSid &&
      currentOwnerUid &&
      currentToken > 0 &&
      (status.state === 'CONNECTED' || status.state === 'CONNECTING' || status.state === 'RECONNECTING')
    ) {
      const outcome = await renewWebcastLeaseTransaction({
        instanceId: serverInstanceId,
        ownerUid: currentOwnerUid,
        sessionId: rawSid,
        fencingToken: currentToken,
        roomUsername: status.roomUsername || '',
        activeRuleId: tiktokAdapter.getActiveRuleId(),
        currentRate: tiktokAdapter.getActiveRate(),
        lastKnownState: status.state,
      });

      if (!outcome.renewed) {
        if (
          activeLiveConnectionOwnerUid === currentOwnerUid &&
          activeLiveConnectionFencingToken === currentToken
        ) {
          activeLiveConnectionOwnerUid = null;
          activeLiveConnectionSessionId = null;
          activeLiveConnectionFencingToken = 0;
          if (tiktokAdapter.getCurrentOwnerUid() === currentOwnerUid) {
            void tiktokAdapter.disconnect(true).catch(() => {});
          }
        }
      }
    }
  }, 10_000);
}

let restartRecoveryInFlight: Promise<void> | null = null;

async function buildEnrichedTikTokStatus(options?: { triggerAutoRecovery?: boolean }) {
  const baseStatus = tiktokAdapter.getStatus();
  const rawAdapterSessionId = tiktokAdapter.getRawCurrentSessionId();
  const isAdapterActive =
    Boolean(rawAdapterSessionId) &&
    (baseStatus.state === 'CONNECTED' ||
      baseStatus.state === 'CONNECTING' ||
      baseStatus.state === 'RECONNECTING');

  if (isAdapterActive) {
    return {
      ...baseStatus,
      sessionId: rawAdapterSessionId,
      activeRuleId: tiktokAdapter.getActiveRuleId(),
      currentRate: tiktokAdapter.getActiveRate(),
      campaignId: cachedRuntimeLockState?.campaignId || undefined,
      cycleId: cachedRuntimeLockState?.cycleId || undefined,
      webcastActive: tiktokAdapter.isWebcastGenuinelyActive(),
      persistedSessionActive: true,
      requiresWebcastRecovery: !tiktokAdapter.isWebcastGenuinelyActive(),
      ownerUid: activeLiveConnectionOwnerUid,
      activeWebcastInstancesCount: tiktokAdapter.getActiveWebcastInstancesCount(),
    };
  }

  // Adapter is DISCONNECTED in memory: check if a persisted active session exists in Firestore (e.g. after server restart)
  const persisted = await readPersistedWebcastRuntimeState();
  if (persisted && persisted.shouldBeConnected && persisted.sessionId) {
    if (!activeLiveConnectionOwnerUid && persisted.ownerUid) {
      activeLiveConnectionOwnerUid = persisted.ownerUid;
    }
    if (!activeLiveConnectionSessionId && persisted.sessionId) {
      activeLiveConnectionSessionId = persisted.sessionId;
    }

    // Restore session streaks and processed event IDs into memory without falsely claiming Webcast is connected
    if (!rawAdapterSessionId && !restartRecoveryInFlight) {
      restartRecoveryInFlight = (async () => {
        try {
          tiktokEventQueue.loadWalFromDisk();
          await tiktokAdapter.restoreSessionFromFirestore(persisted.sessionId);
          if (options?.triggerAutoRecovery && persisted.roomUsername) {
            void tiktokAdapter.connect(
              persisted.roomUsername,
              persisted.sessionId,
              persisted.activeRuleId || 'rule_default_100',
              persisted.currentRate || 100,
              true
            );
          }
        } finally {
          restartRecoveryInFlight = null;
        }
      })();
      await restartRecoveryInFlight;
    }

    const updatedStatus = tiktokAdapter.getStatus();
    const webcastActiveNow = tiktokAdapter.isWebcastGenuinelyActive();

    return {
      ...updatedStatus,
      sessionId: persisted.sessionId,
      activeRuleId: persisted.activeRuleId || updatedStatus.activeRuleId || 'rule_default_100',
      currentRate: persisted.currentRate || updatedStatus.currentRate || 100,
      campaignId: persisted.campaignId || cachedRuntimeLockState?.campaignId || undefined,
      cycleId: persisted.cycleId || cachedRuntimeLockState?.cycleId || undefined,
      roomUsername: updatedStatus.roomUsername || persisted.roomUsername || '',
      webcastActive: webcastActiveNow,
      persistedSessionActive: true,
      requiresWebcastRecovery: !webcastActiveNow,
      ownerUid: persisted.ownerUid || activeLiveConnectionOwnerUid,
      activeWebcastInstancesCount: tiktokAdapter.getActiveWebcastInstancesCount(),
    };
  }

  return {
    ...baseStatus,
    sessionId: rawAdapterSessionId || undefined,
    activeRuleId: rawAdapterSessionId ? tiktokAdapter.getActiveRuleId() : undefined,
    currentRate: tiktokAdapter.getActiveRate(),
    campaignId: cachedRuntimeLockState?.campaignId || undefined,
    cycleId: cachedRuntimeLockState?.cycleId || undefined,
    webcastActive: false,
    persistedSessionActive: false,
    requiresWebcastRecovery: false,
    ownerUid: activeLiveConnectionOwnerUid,
    activeWebcastInstancesCount: tiktokAdapter.getActiveWebcastInstancesCount(),
  };
}

/**
 * GET /api/tiktok/plan/status
 * Returns backend-validated PRO plan entitlement bound to the verified Firebase ID Token
 * (never trusting x-gio-plan, query parameters, or unverified x-firebase-uid).
 */
app.get('/api/tiktok/plan/status', async (req: Request, res: Response) => {
  const check = await verifyProPlanRequestAsync(req);
  res.json({
    ...check.entitlement,
    authenticated: check.authenticated,
    requestAllowed: check.allowed,
    subscription: check.subscription
      ? {
          uid: check.subscription.uid,
          tier: check.subscription.tier,
          statusState: check.subscription.statusState,
          billingSubStatus: check.subscription.billingSubStatus,
          trialEndDate: check.subscription.trialEndDate,
          currentPeriodEnd: check.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: check.subscription.cancelAtPeriodEnd,
        }
      : null,
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
  const targetOwnerUid =
    typeof req.body?.uid === 'string' && req.body.uid.trim() ? req.body.uid.trim() : undefined;
  if (!targetOwnerUid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_OWNER_UID',
      error: 'Parâmetro uid é obrigatório para modificar o plano de um organizador.',
    });
  }

  const updated = setProPlanTier(requestedTier, requestedStatusState, targetOwnerUid);
  if (!updated.active && activeLiveConnectionOwnerUid === targetOwnerUid) {
    // Immediately disconnect active LIVE capture if the active owner is downgraded or suspended
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
 * POST /api/tiktok/pro/sessions
 * Creates or loads a TikTok LIVE session bound to `ownerUid = req.authUid` (PRO only).
 */
app.post(
  '/api/tiktok/pro/sessions',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const { sessionId, username, currentRate, ruleId } = req.body || {};
      const targetSessionId = String(sessionId || `live_${Date.now()}`).trim();
      const targetUsername = String(username || 'gioborelli').replace(/^@/, '').trim();

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: true,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const session = await getOrCreateLiveSession(
        targetSessionId,
        targetUsername,
        currentRate ? Number(currentRate) : 100,
        ruleId ? String(ruleId) : 'rule_default_100',
        authUid
      );

      res.json({
        success: true,
        session,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'SESSION_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/session-status
 * Pauses, resumes, or permanently ends ticket collection for a LIVE session owned by `req.authUid` (PRO only).
 */
app.post(
  '/api/tiktok/pro/session-status',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const { sessionId, action } = req.body || {};
      const targetSessionId = String(sessionId || tiktokAdapter.getCurrentSessionId()).trim();
      if (!targetSessionId) {
        return res.status(400).json({ success: false, error: 'sessionId é obrigatório.' });
      }

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const normalizedAction = String(action || '').toUpperCase();
      let updated;
      if (normalizedAction === 'PAUSE') {
        updated = await pauseLiveSessionCollection(targetSessionId, authUid);
      } else if (normalizedAction === 'RESUME') {
        updated = await resumeLiveSessionCollection(targetSessionId, authUid);
      } else if (normalizedAction === 'END') {
        updated = await endLiveSessionCollection(targetSessionId, authUid);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Ação inválida. Use action: "PAUSE" | "RESUME" | "END".',
        });
      }

      res.json({
        success: true,
        session: updated,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'SESSION_STATUS_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/session-rules
 * Updates LIVE raffle settings, coin-to-ticket conversion, participation rules, and limits (PRO only + ownerUid === req.authUid).
 */
app.post(
  '/api/tiktok/pro/session-rules',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
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

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const updated = await updateLiveSessionConfigAndRules(
        targetSessionId,
        {
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
        },
        authUid
      );

      res.json({
        success: true,
        session: updated,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'SESSION_RULES_ERROR',
        error: message,
      });
    }
  }
);

/**
 * GET /api/tiktok/pro/organizer-config
 * Retrieves permanent raffle defaults for the authenticated organizer (PRO only).
 */
app.get(
  '/api/tiktok/pro/organizer-config',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const config = await getOrganizerRaffleDefaults(authUid);
      res.json({
        success: true,
        config,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/tiktok/pro/organizer-config
 * Saves permanent raffle defaults for the authenticated organizer in `/users/{uid}/settings/raffle_config` (PRO only).
 */
app.post(
  '/api/tiktok/pro/organizer-config',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const saved = await saveOrganizerRaffleDefaults(req.body || {}, authUid);
      res.json({
        success: true,
        config: saved,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/tiktok/pro/campaigns
 * Creates a Multi-LIVE Campaign bound to `ownerUid = req.authUid`, or links an owned session to an owned campaign (PRO only).
 */
app.post(
  '/api/tiktok/pro/campaigns',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const body = req.body || {};
      const action = String(body.action || 'CREATE').toUpperCase();

      if (action === 'ADD_SESSION') {
        const campaignId = String(body.campaignId || '').trim();
        const sessionId = String(body.sessionId || '').trim();
        if (!campaignId || !sessionId) {
          return res.status(400).json({
            success: false,
            error: 'campaignId e sessionId são obrigatórios para vincular sessão à campanha.',
          });
        }

        const [campOwnership, sessOwnership] = await Promise.all([
          verifyFirestoreResourceOwnership({
            collectionName: 'campaigns',
            docId: campaignId,
            authUid,
            allowIfNotExists: false,
            requireExplicitOwner: true,
          }),
          verifyFirestoreResourceOwnership({
            collectionName: 'sessions',
            docId: sessionId,
            authUid,
            allowIfNotExists: false,
            requireExplicitOwner: true,
          }),
        ]);

        if (!campOwnership.allowed) {
          return res.status(campOwnership.status).json({
            success: false,
            code: campOwnership.code || 'OWNERSHIP_FORBIDDEN',
            error: campOwnership.reason,
          });
        }
        if (!sessOwnership.allowed) {
          return res.status(sessOwnership.status).json({
            success: false,
            code: sessOwnership.code || 'OWNERSHIP_FORBIDDEN',
            error: sessOwnership.reason,
          });
        }

        const result = await addSessionToCampaign(
          campaignId,
          sessionId,
          {
            eligibilityRule: body.eligibilityRule,
            cutoffTimestamp: body.cutoffTimestamp !== undefined ? Number(body.cutoffTimestamp) : undefined,
            ownerUid: authUid,
          },
          authUid
        );
        return res.json({
          success: true,
          ...result,
        });
      }

      if (!body.title || !String(body.title).trim()) {
        return res.status(400).json({
          success: false,
          error: 'title é obrigatório para criar uma campanha Multi-LIVE.',
        });
      }

      const campaign = await createCampaign(
        {
          title: String(body.title),
          description: String(body.description || 'Campanha Acumulada Multi-LIVE'),
          prizeName: String(body.prizeName || 'Prêmio Especial da Campanha'),
          ownerUid: authUid,
          campaignMode: body.campaignMode,
          allowDuplicateWinners: body.allowDuplicateWinners,
          startDate: body.startDate !== undefined ? Number(body.startDate) : undefined,
          cutoffDate: body.cutoffDate !== undefined ? Number(body.cutoffDate) : undefined,
          defaultRate: body.defaultRate !== undefined ? Number(body.defaultRate) : undefined,
          maxTicketsPerUser:
            body.maxTicketsPerUser !== undefined && body.maxTicketsPerUser !== null
              ? Number(body.maxTicketsPerUser)
              : null,
          maxTotalTickets:
            body.maxTotalTickets !== undefined && body.maxTotalTickets !== null
              ? Number(body.maxTotalTickets)
              : null,
          eligibilityRuleDefault: body.eligibilityRuleDefault,
          rulesSummary: body.rulesSummary,
          legalStatus: body.legalStatus,
          organizerName: body.organizerName,
        },
        authUid
      );

      res.json({
        success: true,
        campaign,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'CAMPAIGN_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/campaigns/cycle
 * Advances a recurring campaign to the next cycle (PRO only).
 * Strictly blocked if previous cycle's prize is in PENDING_CONTACT or CONTACTED.
 */
app.post(
  '/api/tiktok/pro/campaigns/cycle',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const { campaignId } = req.body || {};
      const targetCampaignId = String(campaignId || '').trim();
      if (!targetCampaignId) {
        return res.status(400).json({ success: false, error: 'campaignId é obrigatório.' });
      }

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'campaigns',
        docId: targetCampaignId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const result = await advanceCampaignCycle(targetCampaignId, authUid);
      res.json({
        success: true,
        campaign: result.campaign,
        newCycle: result.newCycle,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'CYCLE_ADVANCE_ERROR',
        error: message,
      });
    }
  }
);

/**
 * GET /api/tiktok/pro/campaigns/:campaignId/cycles
 * Fetches all cycles of a campaign (PRO only).
 */
app.get(
  '/api/tiktok/pro/campaigns/:campaignId/cycles',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const targetCampaignId = String(req.params.campaignId || '').trim();
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'campaigns',
        docId: targetCampaignId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const cycles = await fetchCampaignCycles(targetCampaignId);
      res.json({
        success: true,
        campaignId: targetCampaignId,
        cycles,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/tiktok/pro/campaign-rules
 * Updates multi-LIVE accumulated campaign settings, rules, and limits (PRO only + ownerUid === req.authUid).
 */
app.post(
  '/api/tiktok/pro/campaign-rules',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
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

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'campaigns',
        docId: String(campaignId),
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const updated = await updateCampaignRulesConfig(
        String(campaignId),
        {
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
        },
        authUid
      );

      res.json({
        success: true,
        campaign: updated,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'CAMPAIGN_RULES_ERROR',
        error: message,
      });
    }
  }
);

/**
 * GET /api/tiktok/pro/tickets/:sessionId
 * Queries individual sequential tickets issued for a LIVE session (PRO only + ownerUid === req.authUid).
 */
app.get(
  '/api/tiktok/pro/tickets/:sessionId',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const sessionId = String(req.params.sessionId || '').trim();
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: sessionId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

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
  }
);

/**
 * POST /api/tiktok/pro/live-draw/snapshot
 * Freezes an immutable SHA-256 snapshot for a LIVE session or Multi-LIVE campaign owned by `req.authUid` (PRO only).
 */
app.post(
  '/api/tiktok/pro/live-draw/snapshot',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const { targetType, sessionId, campaignId } = req.body || {};
      const isCampaign = String(targetType || '').toUpperCase() === 'CAMPAIGN' || Boolean(campaignId);

      if (isCampaign) {
        const targetCampaignId = String(campaignId || '').trim();
        const ownership = await verifyFirestoreResourceOwnership({
          collectionName: 'campaigns',
          docId: targetCampaignId,
          authUid,
          allowIfNotExists: false,
          requireExplicitOwner: true,
        });
        if (!ownership.allowed) {
          return res.status(ownership.status).json({
            success: false,
            code: ownership.code || 'OWNERSHIP_FORBIDDEN',
            error: ownership.reason,
          });
        }
        const snapshot = await freezeCampaignSnapshot(targetCampaignId, authUid);
        return res.json({ success: true, snapshot });
      }

      const targetSessionId = String(sessionId || tiktokAdapter.getCurrentSessionId()).trim();
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const snapshot = await createNonBlockingSessionSnapshot(targetSessionId, authUid);
      res.json({ success: true, snapshot });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'SNAPSHOT_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/live-draw/execute
 * Executes an unbiased CSPRNG draw over an owned frozen snapshot for a LIVE session or Multi-LIVE campaign (PRO only).
 */
app.post(
  '/api/tiktok/pro/live-draw/execute',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const { drawType, sessionId, campaignId, snapshotId, prizeName } = req.body || {};
      const cleanSnapshotId = String(snapshotId || '').trim();
      if (!cleanSnapshotId) {
        return res.status(400).json({ success: false, error: 'snapshotId é obrigatório.' });
      }

      const snapOwnership = await verifyFirestoreResourceOwnership({
        collectionName: 'draw_snapshots',
        docId: cleanSnapshotId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!snapOwnership.allowed) {
        return res.status(snapOwnership.status).json({
          success: false,
          code: snapOwnership.code || 'OWNERSHIP_FORBIDDEN',
          error: snapOwnership.reason,
        });
      }

      const isCampaign = String(drawType || '').toUpperCase() === 'CAMPAIGN' || Boolean(campaignId);
      if (isCampaign) {
        const targetCampaignId = String(campaignId || '').trim();
        const campOwnership = await verifyFirestoreResourceOwnership({
          collectionName: 'campaigns',
          docId: targetCampaignId,
          authUid,
          allowIfNotExists: false,
          requireExplicitOwner: true,
        });
        if (!campOwnership.allowed) {
          return res.status(campOwnership.status).json({
            success: false,
            code: campOwnership.code || 'OWNERSHIP_FORBIDDEN',
            error: campOwnership.reason,
          });
        }
        const drawResult = await executeCampaignDraw(
          targetCampaignId,
          cleanSnapshotId,
          prizeName ? String(prizeName) : undefined,
          authUid
        );
        return res.json({ success: true, draw: drawResult });
      }

      const targetSessionId = String(sessionId || tiktokAdapter.getCurrentSessionId()).trim();
      const sessOwnership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!sessOwnership.allowed) {
        return res.status(sessOwnership.status).json({
          success: false,
          code: sessOwnership.code || 'OWNERSHIP_FORBIDDEN',
          error: sessOwnership.reason,
        });
      }

      const drawResult = await executeIndividualLiveDraw(
        targetSessionId,
        cleanSnapshotId,
        prizeName ? String(prizeName) : 'Prêmio da LIVE',
        authUid
      );
      res.json({ success: true, draw: drawResult });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'LIVE_DRAW_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/draws/delivery
 * Updates prize delivery status with an append-only, immutable audit trail (PRO only).
 * Validates ownerUid === authUid.
 */
app.post(
  '/api/tiktok/pro/draws/delivery',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const {
        drawId,
        status,
        reason,
        method,
        notes,
        trackingCode,
        deliveryProofUrl,
        referenceDrawId,
      } = req.body || {};

      const cleanDrawId = String(drawId || '').trim();
      if (!cleanDrawId) {
        return res.status(400).json({ success: false, error: 'drawId é obrigatório.' });
      }

      const validStatuses = [
        'PENDING_CONTACT',
        'CONTACTED',
        'DELIVERED',
        'UNCLAIMED_EXPIRED',
        'REDRAWN',
      ];
      if (!validStatuses.includes(String(status))) {
        return res.status(400).json({
          success: false,
          error: `Status inválido. Use um dos seguintes: ${validStatuses.join(', ')}`,
        });
      }

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'draws',
        docId: cleanDrawId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const updated = await updateDrawDeliveryStatus(
        cleanDrawId,
        {
          status,
          reason: String(reason || ''),
          method,
          notes,
          trackingCode,
          deliveryProofUrl,
          referenceDrawId,
        },
        authUid
      );

      res.json({
        success: true,
        draw: updated,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'DELIVERY_UPDATE_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/draws/redraw
 * Executes an auditable redraw for an unclaimed expired prize (UNCLAIMED_EXPIRED).
 * Strictly excludes previous winners, freezes new snapshot with SHA-256 hash,
 * and generates verifiable CSPRNG result linked by parentDrawId / redrawnAsDrawId.
 */
app.post(
  '/api/tiktok/pro/draws/redraw',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const { originalDrawId, reason, confirmRedraw } = req.body || {};
      const cleanOriginalId = String(originalDrawId || '').trim();

      if (!cleanOriginalId) {
        return res.status(400).json({ success: false, error: 'originalDrawId é obrigatório.' });
      }

      if (confirmRedraw !== true) {
        return res.status(400).json({
          success: false,
          error:
            'Confirmação explícita do organizador é obrigatória (confirmRedraw: true) para realizar o novo sorteio.',
        });
      }

      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'draws',
        docId: cleanOriginalId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }

      const result = await executeUnclaimedRedraw(cleanOriginalId, authUid, reason);
      res.json({
        success: true,
        newDraw: result.newDraw,
        originalDraw: result.originalDraw,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'REDRAW_ERROR',
        error: message,
      });
    }
  }
);

/**
 * POST /api/tiktok/pro/comments/extract
 * Extracts TikTok video details and comments on the backend (PRO only).
 */
app.post(
  '/api/tiktok/pro/comments/extract',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const { videoUrl, maxPages, forceRefresh } = req.body || {};
      const cleanUrl = String(videoUrl || '').trim();
      if (!cleanUrl) {
        return res.status(400).json({ success: false, error: 'videoUrl é obrigatório.' });
      }

      const result = await loadTikTokComments(cleanUrl, {
        maxPages: maxPages ? Math.min(10, Math.max(1, Number(maxPages))) : 3,
        forceRefresh: Boolean(forceRefresh),
      });

      res.json({
        success: true,
        ownerUid: req.authUid,
        ...result,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/tiktok/pro/comments/import
 * Parses and validates imported/pasted comments on the backend (PRO only).
 */
app.post(
  '/api/tiktok/pro/comments/import',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const { rawInput } = req.body || {};
      const text = String(rawInput || '').trim();
      if (!text) {
        return res.status(400).json({ success: false, error: 'rawInput é obrigatório.' });
      }

      const comments = parseImportedComments(text);
      res.json({
        success: true,
        ownerUid: req.authUid,
        count: comments.length,
        comments,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

/**
 * POST /api/tiktok/pro/comments/draw
 * Filters eligible comments and executes an unbiased CSPRNG draw with SHA-256 integrity hash on the backend (PRO only).
 */
app.post(
  '/api/tiktok/pro/comments/draw',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const {
        comments,
        filters,
        authorName,
        winnerCount = 1,
        prizeName = 'Prêmio Especial TikTok',
        videoUrl = '',
      } = req.body || {};

      if (!Array.isArray(comments) || comments.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Lista de comentários é obrigatória para realizar o sorteio.',
        });
      }

      const normalizedFilters: TikTokFilterSettings = {
        filterDuplicates: filters?.filterDuplicates !== false,
        keyword: String(filters?.keyword || ''),
        minMentions: Math.max(0, Number(filters?.minMentions || 0)),
        excludeAuthor: filters?.excludeAuthor !== false,
        minCharacters: Math.max(0, Number(filters?.minCharacters || 0)),
      };

      const { eligible, totalEligibleUsers } = filterComments(
        comments as TikTokComment[],
        normalizedFilters,
        authorName ? String(authorName) : undefined
      );

      if (eligible.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum comentário elegível encontrado após aplicação dos filtros.',
        });
      }

      const needed = Math.min(Math.max(1, Number(winnerCount) || 1), eligible.length);
      const pool = [...eligible];
      const winners: TikTokWinner[] = [];
      const entropySeeds: string[] = [];
      const drawnAt = Date.now();

      for (let i = 0; i < needed; i++) {
        if (pool.length === 0) break;
        const { index, rawEntropyHex } = selectUniformRandomIndex(pool.length);
        entropySeeds.push(rawEntropyHex);
        const chosenComment = pool.splice(index, 1)[0];
        winners.push({
          id: `tk-win-${drawnAt}-${i + 1}`,
          rank: i + 1,
          comment: chosenComment,
          prize: String(prizeName || `Prêmio ${i + 1}º Lugar`),
          drawnAt,
        });
      }

      const canonicalPayload = JSON.stringify({
        ownerUid: authUid,
        videoUrl,
        totalComments: comments.length,
        eligibleCount: eligible.length,
        winners: winners.map((w) => ({
          rank: w.rank,
          username: w.comment.username,
          commentId: w.comment.id,
          drawnAt: w.drawnAt,
        })),
        entropySeeds,
      });
      const integrityHash = await computeSha256(canonicalPayload);

      await recordAuditLog(
        'DRAW',
        'TIKTOK_COMMENTS_DRAW_COMPLETED',
        {
          ownerUid: authUid,
          videoUrl,
          totalComments: comments.length,
          eligibleCount: eligible.length,
          totalEligibleUsers,
          winnersCount: winners.length,
          integrityHash,
        },
        authUid
      );

      res.json({
        success: true,
        ownerUid: authUid,
        eligibleCount: eligible.length,
        totalEligibleUsers,
        winners,
        entropySeeds,
        integrityHash,
        drawnAt,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ success: false, error: message });
    }
  }
);

/**
 * GET /api/tiktok/pro/history
 * Returns historical sessions, campaigns, snapshots, and draws owned by `req.authUid`.
 * Requires ONLY `requireFirebaseAuth` (does NOT require active PRO) so ex-subscribers and expired trial users
 * retain full read and export access to their own historical records while blocking cross-UID access.
 */
app.get(
  '/api/tiktok/pro/history',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const requestedOwnerParam =
        typeof req.query.ownerUid === 'string'
          ? req.query.ownerUid.trim()
          : typeof req.query.uid === 'string'
          ? req.query.uid.trim()
          : '';
      if (requestedOwnerParam && requestedOwnerParam !== authUid) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error:
            'OWNERSHIP_FORBIDDEN: Acesso cruzado negado. Não é permitido consultar sessões ou histórico de outro usuário (ownerUid !== authUid).',
        });
      }

      const requestedLimitRaw = Number(req.query.limit);
      const requestedLimit =
        Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
          ? Math.max(1, Math.min(100, Math.floor(requestedLimitRaw)))
          : 50;

      const requestedSessionId =
        typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
      const requestedCampaignId =
        typeof req.query.campaignId === 'string' ? req.query.campaignId.trim() : '';
      const requestedSnapshotId =
        typeof req.query.snapshotId === 'string' ? req.query.snapshotId.trim() : '';

      if (requestedSessionId) {
        const ownership = await verifyFirestoreResourceOwnership({
          collectionName: 'sessions',
          docId: requestedSessionId,
          authUid,
          allowIfNotExists: false,
          requireExplicitOwner: true,
        });
        if (!ownership.allowed) {
          return res.status(ownership.status).json({
            success: false,
            code: ownership.code || 'OWNERSHIP_FORBIDDEN',
            error: ownership.reason,
          });
        }
        const draws = await fetchSessionDraws(requestedSessionId, authUid);
        return res.json({
          success: true,
          ownerUid: authUid,
          session: ownership.data,
          draws,
        });
      }

      if (requestedCampaignId) {
        const ownership = await verifyFirestoreResourceOwnership({
          collectionName: 'campaigns',
          docId: requestedCampaignId,
          authUid,
          allowIfNotExists: false,
          requireExplicitOwner: true,
        });
        if (!ownership.allowed) {
          return res.status(ownership.status).json({
            success: false,
            code: ownership.code || 'OWNERSHIP_FORBIDDEN',
            error: ownership.reason,
          });
        }
        const draws = await fetchCampaignDraws(requestedCampaignId, authUid);
        return res.json({
          success: true,
          ownerUid: authUid,
          campaign: ownership.data,
          draws,
        });
      }

      if (requestedSnapshotId) {
        const ownership = await verifyFirestoreResourceOwnership({
          collectionName: 'draw_snapshots',
          docId: requestedSnapshotId,
          authUid,
          allowIfNotExists: false,
          requireExplicitOwner: true,
        });
        if (!ownership.allowed) {
          return res.status(ownership.status).json({
            success: false,
            code: ownership.code || 'OWNERSHIP_FORBIDDEN',
            error: ownership.reason,
          });
        }
        const snapshot = await fetchSnapshotById(requestedSnapshotId, authUid);
        return res.json({
          success: true,
          ownerUid: authUid,
          snapshot,
        });
      }

      const [sessions, campaigns] = await Promise.all([
        fetchAllLiveSessions(requestedLimit, authUid),
        fetchCampaigns(authUid),
      ]);

      res.json({
        success: true,
        ownerUid: authUid,
        limit: requestedLimit,
        sessions,
        campaigns,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isForbidden = message.includes('OWNERSHIP_FORBIDDEN');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        code: isForbidden ? 'OWNERSHIP_FORBIDDEN' : 'HISTORY_ERROR',
        error: message,
      });
    }
  }
);

/**
 * GET /api/tiktok/live/sessions
 * Dedicated authenticated endpoint returning strictly the authenticated user's own TikTok LIVE sessions.
 * Enforces backend token verification (`requireFirebaseAuth`) and rejects any cross-UID query attempt.
 */
app.get(
  '/api/tiktok/live/sessions',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const requestedOwnerParam =
        typeof req.query.ownerUid === 'string'
          ? req.query.ownerUid.trim()
          : typeof req.query.uid === 'string'
          ? req.query.uid.trim()
          : '';
      if (requestedOwnerParam && requestedOwnerParam !== authUid) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error:
            'OWNERSHIP_FORBIDDEN: Acesso cruzado negado. Não é permitido consultar sessões LIVE de outro usuário (ownerUid !== authUid).',
        });
      }

      const requestedLimitRaw = Number(req.query.limit);
      const requestedLimit =
        Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
          ? Math.max(1, Math.min(100, Math.floor(requestedLimitRaw)))
          : 15;

      const sessions = await fetchAllLiveSessions(requestedLimit, authUid);
      return res.json({
        success: true,
        ownerUid: authUid,
        limit: requestedLimit,
        sessions,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        success: false,
        code: 'LIVE_SESSIONS_QUERY_ERROR',
        error: message,
      });
    }
  }
);

/**
 * GET /api/tiktok/pro/migration/preview
 * Runs a read-only dry-run preview (`dryRun: true`) of legacy records without `ownerUid`
 * without executing any writes in production.
 */
app.get(
  '/api/tiktok/pro/migration/preview',
  requireFirebaseAuth,
  async (_req: Request, res: Response) => {
    try {
      const report = await previewLegacyOwnershipMigration();
      res.json({
        success: true,
        report,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  }
);

// ==========================================
// TIKTOK LIVE REAL-TIME API ENDPOINTS
// ==========================================

/**
 * Probe whether a TikTok user is currently LIVE on TikTok without permanent connection (PRO only)
 */
app.get(
  '/api/tiktok/probe/:username',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
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
  }
);

/**
 * Helper to cryptographically verify administrative authorization on protected endpoints.
 * Requires a valid Firebase ID Token in `Authorization: Bearer <token>`.
 * Validates either:
 * 1. Firebase Custom Claim `admin === true` or `role === 'admin'`.
 * 2. Authenticated UID presence in the server-side environment variable `ADMIN_UIDS`.
 *
 * Strictly eliminates all client-controlled bypasses: Accept, Referer, ?admin=1,
 * x-gio-admin-access, x-gio-admin-uid, unauthenticated cookies, or local IP alone.
 */
async function verifyAdminRequest(req: Request): Promise<{
  authorized: boolean;
  status: 401 | 403 | 200;
  uid?: string;
  email?: string;
  reason?: string;
}> {
  if (req.headers['x-gio-unauthorized-test'] === 'true') {
    return {
      authorized: false,
      status: 401,
      reason: 'Acesso administrativo negado: credencial de administrador ausente ou inválida.',
    };
  }

  const authResult = await verifyAuthenticatedFirebaseUser(req);
  if (!authResult.authenticated || !authResult.uid) {
    return {
      authorized: false,
      status: 401,
      reason:
        authResult.reason ||
        'Acesso administrativo negado: autenticação obrigatória via Firebase ID Token no cabeçalho Authorization: Bearer <token>.',
    };
  }

  const verifiedUid = authResult.uid;
  const decodedToken = authResult.decodedToken;

  const hasAdminClaim = Boolean(
    decodedToken?.admin === true || (decodedToken as any)?.role === 'admin'
  );

  const configuredAdminUids = (process.env.ADMIN_UIDS || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
  const isServerConfiguredAdmin = configuredAdminUids.includes(verifiedUid);

  if (!hasAdminClaim && !isServerConfiguredAdmin) {
    return {
      authorized: false,
      status: 403,
      uid: verifiedUid,
      email: authResult.email,
      reason: `Acesso negado: o usuário '${verifiedUid}' está autenticado, mas não possui privilégios administrativos.`,
    };
  }

  return {
    authorized: true,
    status: 200,
    uid: verifiedUid,
    email: authResult.email,
  };
}

/**
 * Get current TikTok LIVE connection status, active sessionId, activeRuleId,
 * and distinction between persisted session state and genuinely active Webcast connection.
 */
app.get('/api/tiktok/status', async (req: Request, res: Response) => {
  const triggerAutoRecovery = req.query.recover === '1' || req.query.autoReconnect === '1';
  const enrichedStatus = await buildEnrichedTikTokStatus({ triggerAutoRecovery });
  res.json(enrichedStatus);
});

/**
 * Real-time Performance & Queue Diagnostics Endpoint (Admin Panel)
 */
app.get('/api/tiktok/diagnostics', async (req: Request, res: Response) => {
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
app.get('/api/tiktok/monitor/snapshot', async (req: Request, res: Response) => {
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
app.post('/api/tiktok/monitor/config', async (req: Request, res: Response) => {
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
 * Recover Pending WAL Events & Restore Session Streaks from Firestore (Admin + PRO Only + Ownership)
 */
app.post(
  '/api/tiktok/queue/recover',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authCheck = await verifyAdminRequest(req);
    if (!authCheck.authorized) {
      return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
    }

    const authUid = req.authUid!;
    const sessionId = String(req.body?.sessionId || tiktokAdapter.getCurrentSessionId()).trim();
    if (sessionId) {
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: sessionId,
        authUid,
        allowIfNotExists: true,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }
    }

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
  }
);

/**
 * Browser SSE Cursor ACK Endpoint:
 * Updates the client's confirmed cursor (`lastConfirmedSequenceNumber`) ONLY after the browser
 * has applied the event to the React feed, and records monotonic `browserRenderLatencyMs`.
 */
app.post(
  '/api/tiktok/stream/ack',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const { sessionId, clientId, sequenceNumber, eventId, browserRenderLatencyMs, clientSecret } =
      req.body || {};
    const targetSessionId = String(sessionId || tiktokAdapter.getCurrentSessionId()).trim();

    if (targetSessionId) {
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: true,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }
    }

    const outcome = tiktokEventQueue.acknowledgeClientEvent({
      sessionId: targetSessionId,
      clientId: String(clientId || ''),
      sequenceNumber: Number(sequenceNumber),
      eventId: eventId ? String(eventId) : undefined,
      browserRenderLatencyMs:
        browserRenderLatencyMs !== undefined ? Number(browserRenderLatencyMs) : undefined,
      clientSecret: clientSecret ? String(clientSecret) : undefined,
    });

    if (!outcome.accepted) {
      return res.status(400).json({ success: false, error: outcome.reason });
    }

    res.json({
      success: true,
      cursor: outcome.cursor,
    });
  }
);

/**
 * Paginated SSE Recovery Endpoint:
 * Recovers persisted events after `lastConfirmedCursor` for `(sessionId, clientId)` without re-executing financial operations.
 * If the cursor is outside the retention window or invalid, returns `OUT_OF_RETENTION_FULL_SYNC`.
 */
app.get(
  '/api/tiktok/stream/recover',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const sessionId =
      (typeof req.query.sessionId === 'string' && req.query.sessionId.trim()) ||
      tiktokAdapter.getCurrentSessionId();

    if (sessionId) {
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: sessionId,
        authUid,
        allowIfNotExists: true,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }
    }

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
  }
);

/**
 * Connect to a TikTok LIVE broadcast (PRO Plan Required + Session Ownership + Multi-Instance Concurrency Lock)
 */
app.post(
  '/api/tiktok/connect',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const {
      username,
      roomUsername,
      sessionId,
      ruleId,
      rate,
      currentRate,
      campaignId,
      cycleId,
      raffleTitle,
      prizeName,
      minCoinsPerGift,
      maxTicketsPerUser,
      maxTotalTickets,
      allowDuplicateWinners,
      instanceId,
    } = req.body || {};
    const targetUser = String(username || roomUsername || '').replace(/^@/, '').trim();
    if (!targetUser) {
      return res.status(400).json({ error: 'Parâmetro username é obrigatório.' });
    }

    const requestedRuleId = ruleId ? String(ruleId).trim() : 'rule_default_100';
    const rawRate = rate !== undefined ? rate : currentRate;
    const requestedRate = rawRate ? Number(rawRate) : 100;
    const requestedSid = String(
      sessionId || activeLiveConnectionSessionId || tiktokAdapter.getRawCurrentSessionId() || `live_${Date.now()}`
    ).trim();

    const ownership = await verifyFirestoreResourceOwnership({
      collectionName: 'sessions',
      docId: requestedSid,
      authUid,
      allowIfNotExists: true,
      requireExplicitOwner: true,
    });
    if (!ownership.allowed) {
      return res.status(ownership.status).json({
        success: false,
        code: ownership.code || 'OWNERSHIP_FORBIDDEN',
        error: ownership.reason,
      });
    }

    if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
      const currentStatus = tiktokAdapter.getStatus();
      if (
        currentStatus.state === 'CONNECTED' ||
        currentStatus.state === 'CONNECTING' ||
        currentStatus.state === 'RECONNECTING'
      ) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error:
            'Acesso negado: já existe uma conexão LIVE ativa pertencente a outro organizador autenticado.',
        });
      }
    }

    // Serialize concurrent connect calls and check multi-instance lock in Firestore
    const outcome = await withConnectRouteMutex(async () => {
      const lockCheck = await acquireOrCoalesceWebcastLock({
        ownerUid: authUid,
        sessionId: requestedSid,
        roomUsername: targetUser,
        activeRuleId: requestedRuleId,
        currentRate: requestedRate,
        campaignId: campaignId ? String(campaignId).trim() : undefined,
        cycleId: cycleId ? String(cycleId).trim() : undefined,
        requestedInstanceId: typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : undefined,
      });

      if (!lockCheck.allowed) {
        return {
          httpStatus: lockCheck.status || 403,
          payload: {
            success: false,
            code: lockCheck.code || 'OWNERSHIP_FORBIDDEN',
            error: lockCheck.reason,
          },
        };
      }

      const sid = lockCheck.effectiveSessionId || requestedSid;
      const acquiredFencingToken = lockCheck.fencingToken;

      try {
        // Persist or validate session ownership in Firestore before opening connection
        // Automatically loads organizer defaults and binds campaignId / cycleId
        const createSessionFn = serverTestHooks.customGetOrCreateLiveSession || getOrCreateLiveSession;
        const liveSession = await createSessionFn(
          sid,
          targetUser,
          requestedRate,
          requestedRuleId,
          authUid,
          {
            campaignId: campaignId ? String(campaignId).trim() : undefined,
            cycleId: cycleId ? String(cycleId).trim() : undefined,
            raffleTitle: raffleTitle ? String(raffleTitle).trim() : undefined,
            prizeName: prizeName ? String(prizeName).trim() : undefined,
            minCoinsPerGift: minCoinsPerGift !== undefined ? Number(minCoinsPerGift) : undefined,
            maxTicketsPerUser:
              maxTicketsPerUser !== undefined && maxTicketsPerUser !== null
                ? Number(maxTicketsPerUser)
                : undefined,
            maxTotalTickets:
              maxTotalTickets !== undefined && maxTotalTickets !== null
                ? Number(maxTotalTickets)
                : undefined,
            allowDuplicateWinners:
              allowDuplicateWinners !== undefined ? Boolean(allowDuplicateWinners) : undefined,
          }
        );

        const leaseCheckBeforeCommit = await verifyActiveLeaseFencingToken(
          authUid,
          sid,
          acquiredFencingToken
        );
        if (!leaseCheckBeforeCommit.valid) {
          return {
            httpStatus: 409,
            payload: {
              success: false,
              code: 'STALE_FENCING_TOKEN',
              error: leaseCheckBeforeCommit.reason,
            },
          };
        }

        // If another backend instance already owns the active Webcast stream for this user & room,
        // do NOT open a duplicate Webcast connection on this instance; return the shared session state
        if (lockCheck.coalescedCrossInstance) {
          const restoreFn =
            serverTestHooks.customRestoreSessionFromFirestore ||
            ((s: string) => tiktokAdapter.restoreSessionFromFirestore(s));
          await restoreFn(sid);
          activeLiveConnectionOwnerUid = authUid;
          activeLiveConnectionSessionId = sid;
          activeLiveConnectionFencingToken = acquiredFencingToken;
          tiktokAdapter.setCurrentOwnerUid(authUid);
          registerSessionOwner(sid, authUid);

          const enrichedStatus = await buildEnrichedTikTokStatus();
          return {
            httpStatus: 200,
            payload: {
              success: enrichedStatus.state === 'CONNECTED',
              coalesced: true,
              coalescedCrossInstance: true,
              ownerUid: authUid,
              sessionId: sid,
              fencingToken: acquiredFencingToken,
              activeRuleId: requestedRuleId,
              campaignId: liveSession.campaignId,
              cycleId: liveSession.cycleId,
              status: enrichedStatus,
            },
          };
        }

        const connectFn =
          serverTestHooks.customAdapterConnect ||
          ((u: string, s: string, r: string, rt: number) => tiktokAdapter.connect(u, s, r, rt));
        const result = await connectFn(targetUser, sid, requestedRuleId, requestedRate);

        const leaseCheckAfterConnect = await verifyActiveLeaseFencingToken(
          authUid,
          sid,
          acquiredFencingToken
        );
        if (!leaseCheckAfterConnect.valid) {
          // P1-LOCK-B1: Safe rollback if lease lost during async connection
          if (
            tiktokAdapter.getCurrentOwnerUid() === authUid &&
            tiktokAdapter.getRawCurrentSessionId() === sid
          ) {
            await tiktokAdapter.disconnect(true).catch(() => {});
            tiktokAdapter.resetMemoryStateForSimulatedRestart();
          }
          if (
            activeLiveConnectionOwnerUid === authUid &&
            activeLiveConnectionFencingToken === acquiredFencingToken
          ) {
            activeLiveConnectionOwnerUid = null;
            activeLiveConnectionSessionId = null;
            activeLiveConnectionFencingToken = 0;
          }
          return {
            httpStatus: 409,
            payload: {
              success: false,
              code: 'STALE_FENCING_TOKEN',
              error: leaseCheckAfterConnect.reason,
            },
          };
        }

        // P1-LOCK-B3: Confirm lease renewal transactionally (never blind setDoc)
        const renewOutcome = await renewWebcastLeaseTransaction({
          instanceId: serverInstanceId,
          ownerUid: authUid,
          sessionId: sid,
          fencingToken: acquiredFencingToken,
          roomUsername: targetUser,
          activeRuleId: requestedRuleId,
          currentRate: requestedRate,
          campaignId: liveSession.campaignId,
          cycleId: liveSession.cycleId,
          lastKnownState: result.status.state,
        });

        if (!renewOutcome.renewed) {
          if (
            tiktokAdapter.getCurrentOwnerUid() === authUid &&
            tiktokAdapter.getRawCurrentSessionId() === sid
          ) {
            await tiktokAdapter.disconnect(true).catch(() => {});
            tiktokAdapter.resetMemoryStateForSimulatedRestart();
          }
          if (
            activeLiveConnectionOwnerUid === authUid &&
            activeLiveConnectionFencingToken === acquiredFencingToken
          ) {
            activeLiveConnectionOwnerUid = null;
            activeLiveConnectionSessionId = null;
            activeLiveConnectionFencingToken = 0;
          }
          return {
            httpStatus: renewOutcome.status === 403 ? 403 : 409,
            payload: {
              success: false,
              code: renewOutcome.code || 'STALE_FENCING_TOKEN',
              error: renewOutcome.reason || 'Falha ao confirmar o lease no Firestore após conexão.',
            },
          };
        }

        activeLiveConnectionOwnerUid = authUid;
        activeLiveConnectionSessionId = sid;
        activeLiveConnectionFencingToken = acquiredFencingToken;
        tiktokAdapter.setCurrentOwnerUid(authUid);
        registerSessionOwner(sid, authUid);

        const enrichedStatus = await buildEnrichedTikTokStatus();
        return {
          httpStatus: 200,
          payload: {
            ...result,
            status: enrichedStatus,
            ownerUid: authUid,
            sessionId: sid,
            fencingToken: acquiredFencingToken,
            activeRuleId: requestedRuleId,
            campaignId: liveSession.campaignId,
            cycleId: liveSession.cycleId,
          },
        };
      } catch (err: unknown) {
        await releaseWebcastLock(authUid, {
          sessionId: sid,
          expectedFencingToken: acquiredFencingToken,
        }).catch(() => {});
        if (
          activeLiveConnectionOwnerUid === authUid &&
          activeLiveConnectionFencingToken === acquiredFencingToken
        ) {
          activeLiveConnectionOwnerUid = null;
          activeLiveConnectionSessionId = null;
          activeLiveConnectionFencingToken = 0;
        }
        if (
          tiktokAdapter.getCurrentOwnerUid() === authUid &&
          tiktokAdapter.getRawCurrentSessionId() === sid
        ) {
          await tiktokAdapter.disconnect(true).catch(() => {});
          tiktokAdapter.resetMemoryStateForSimulatedRestart();
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          httpStatus: 500,
          payload: {
            success: false,
            code: 'CONNECT_SESSION_FAILED',
            error: `Falha ao conectar sessão LIVE: ${message}`,
          },
        };
      }
    });

    return res.status(outcome.httpStatus).json(outcome.payload);
  }
);

/**
 * Disconnect from TikTok LIVE (Requires Firebase Auth + Ownership of Active Connection/Session;
 * does NOT require active PRO plan so expired/canceled users can always disconnect their own broadcast)
 * P1-LOCK-B2: Fully serialized under withConnectRouteMutex with transactional lease release and ownership check.
 */
app.post(
  '/api/tiktok/disconnect',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const requestedSessionId = req.body?.sessionId
      ? String(req.body.sessionId).trim()
      : activeLiveConnectionSessionId || '';
    const rawFencingToken = req.body?.expectedFencingToken ?? req.body?.fencingToken;
    const expectedFencingToken =
      rawFencingToken !== undefined && Number.isFinite(Number(rawFencingToken))
        ? Number(rawFencingToken)
        : undefined;

    const outcome = await withConnectRouteMutex(async () => {
      if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
        return {
          status: 403,
          payload: {
            success: false,
            code: 'OWNERSHIP_FORBIDDEN',
            error:
              'Acesso negado: você não pode desconectar uma transmissão LIVE iniciada por outra conta.',
          },
        };
      }

      if (requestedSessionId) {
        const ownership = await verifyFirestoreResourceOwnership({
          collectionName: 'sessions',
          docId: requestedSessionId,
          authUid,
          allowIfNotExists: true,
          requireExplicitOwner: true,
        });
        if (!ownership.allowed) {
          return {
            status: ownership.status,
            payload: {
              success: false,
              code: ownership.code || 'OWNERSHIP_FORBIDDEN',
              error: ownership.reason,
            },
          };
        }
      }

      const lockRelease = await releaseWebcastLock(authUid, {
        sessionId: requestedSessionId || undefined,
        expectedFencingToken,
      });

      if (!lockRelease.released) {
        return {
          status: lockRelease.status || 403,
          payload: {
            success: false,
            code: lockRelease.code || 'OWNERSHIP_FORBIDDEN',
            error: lockRelease.reason || 'Não foi possível liberar o lease.',
          },
        };
      }

      // Safe disconnect: only disconnect adapter if it belongs to this owner and session
      const currentAdapterOwner = tiktokAdapter.getCurrentOwnerUid();
      const currentAdapterSid = tiktokAdapter.getRawCurrentSessionId();
      if (
        (!currentAdapterOwner || currentAdapterOwner === authUid) &&
        (!requestedSessionId || !currentAdapterSid || currentAdapterSid === requestedSessionId)
      ) {
        await tiktokAdapter.disconnect(true);
      }

      if (!activeLiveConnectionOwnerUid || activeLiveConnectionOwnerUid === authUid) {
        activeLiveConnectionOwnerUid = null;
        activeLiveConnectionSessionId = null;
        activeLiveConnectionFencingToken = 0;
      }

      const enrichedStatus = await buildEnrichedTikTokStatus();
      const identityStatus = await tiktokOAuthService
        .getUserTikTokIdentityStatus(authUid)
        .catch(() => ({ linked: true }));
      return {
        status: 200,
        payload: {
          success: true,
          operation: 'LIVE_DISCONNECT',
          ownerUid: authUid,
          status: enrichedStatus,
          tiktokIdentityPreserved: identityStatus.linked,
          raffleSettingsAndHistoryPreserved: true,
        },
      };
    });

    return res.status(outcome.status).json(outcome.payload);
  }
);

/**
 * POST /api/tiktok/stream/ticket
 * Issues a cryptographically secure, short-lived (max 30s) single-use ticket for the SSE stream handshake.
 * Authenticated strictly via Authorization: Bearer <idToken> with PRO plan entitlement verification.
 * Shared across multi-instance Cloud Run via Firestore (sse_stream_tickets).
 */
app.post(
  '/api/tiktok/stream/ticket',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    try {
      const authUid = req.authUid!;
      const sessionId =
        (typeof req.body?.sessionId === 'string' && req.body.sessionId.trim()) ||
        (typeof req.query?.sessionId === 'string' && req.query.sessionId.trim()) ||
        undefined;

      if (sessionId) {
        const ownership = await verifyFirestoreResourceOwnership({
          collectionName: 'sessions',
          docId: sessionId,
          authUid,
          allowIfNotExists: true,
          requireExplicitOwner: true,
        });
        if (!ownership.allowed) {
          return res.status(ownership.status).json({
            success: false,
            code: ownership.code || 'OWNERSHIP_FORBIDDEN',
            error: ownership.reason,
          });
        }
      }

      if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error:
            'Acesso negado: a transmissão ativa pertence a outro organizador autenticado.',
        });
      }

      const ticketResult = await issueSseStreamTicket({
        uid: authUid,
        sessionId,
        email: req.authEmail,
      });

      res.json({
        success: true,
        ticket: ticketResult.ticket,
        expiresAt: ticketResult.expiresAt,
        expiresInSec: ticketResult.expiresInSec,
        sessionId: sessionId || tiktokAdapter.getRawCurrentSessionId() || tiktokAdapter.getCurrentSessionId(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  }
);

/**
 * Real-time Server-Sent Events (SSE) Stream with Durable Outbox & Cursor Resumption.
 * Handshake Authentication:
 * 1. Single-use short-lived ticket (?ticket=tk_sse_...) atomically consumed from Firestore.
 * 2. OR standard Authorization: Bearer <idToken> header.
 * 3. Rejects any attempt to pass ?idToken= in URL query string with 400.
 */
app.get(
  '/api/tiktok/stream',
  async (req: Request, res: Response) => {
    // 1. Strict rejection of raw idToken in URL query string
    if (typeof req.query?.idToken === 'string' && req.query.idToken.trim().length > 0) {
      return res.status(400).json({
        success: false,
        code: 'FIREBASE_TOKEN_IN_URL_FORBIDDEN',
        error:
          'Transmissão de Firebase ID Token na URL é proibida por segurança. Obtenha um ticket descartável de uso único via POST /api/tiktok/stream/ticket.',
      });
    }

    const rawTicket = typeof req.query?.ticket === 'string' ? req.query.ticket.trim() : '';
    const hasBearerHeader =
      typeof req.headers.authorization === 'string' &&
      req.headers.authorization.trim().toLowerCase().startsWith('bearer ');

    let authUid = '';

    if (rawTicket) {
      const sessionFilter =
        typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
          ? req.query.sessionId.trim()
          : undefined;

      const consumption = await consumeSseStreamTicket(rawTicket, {
        expectedSessionId: sessionFilter,
      });

      if (!consumption.valid || !consumption.uid) {
        return res.status(consumption.status || 401).json({
          success: false,
          code: consumption.code || 'SSE_TICKET_INVALID',
          error: consumption.reason || 'Ticket SSE inválido.',
        });
      }

      authUid = consumption.uid;

      // Validate PRO entitlement for the ticket owner
      const subRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(authUid);
      const entitlement = buildEntitlementFromSubscriptionRecord(subRecord);
      if (!entitlement.active || entitlement.tier !== 'PRO' || entitlement.statusState !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          code: 'PRO_PLAN_REQUIRED',
          error:
            'Acesso ao stream SSE restrito a assinantes do Plano GIO DA SORTE PRO ativo.',
          tier: entitlement.tier,
          statusState: entitlement.statusState,
          billingSubStatus: entitlement.billingSubStatus,
        });
      }
    } else if (hasBearerHeader) {
      const authResult = await verifyAuthenticatedFirebaseUser(req);
      if (!authResult.authenticated || !authResult.uid) {
        return res.status(authResult.status || 401).json({
          success: false,
          code: authResult.code || 'FIREBASE_AUTH_REQUIRED',
          error: authResult.reason || 'Autenticação Firebase obrigatória.',
        });
      }
      authUid = authResult.uid;

      const subRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(authUid);
      const entitlement = buildEntitlementFromSubscriptionRecord(subRecord);
      if (!entitlement.active || entitlement.tier !== 'PRO' || entitlement.statusState !== 'ACTIVE') {
        return res.status(403).json({
          success: false,
          code: 'PRO_PLAN_REQUIRED',
          error:
            'Acesso ao stream SSE restrito a assinantes do Plano GIO DA SORTE PRO ativo.',
          tier: entitlement.tier,
          statusState: entitlement.statusState,
          billingSubStatus: entitlement.billingSubStatus,
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        code: 'FIREBASE_AUTH_REQUIRED',
        error:
          'Autenticação obrigatória: envie um ticket temporário (?ticket=...) emitido via POST /api/tiktok/stream/ticket ou o cabeçalho Authorization: Bearer <token>.',
      });
    }

    const sessionFilter =
      typeof req.query.sessionId === 'string' && req.query.sessionId.trim()
        ? req.query.sessionId.trim()
        : undefined;
    const activeSessionId = sessionFilter || tiktokAdapter.getCurrentSessionId();

    if (sessionFilter) {
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: sessionFilter,
        authUid,
        allowIfNotExists: true,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }
    } else if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
      return res.status(403).json({
        success: false,
        code: 'OWNERSHIP_FORBIDDEN',
        error:
          'Acesso negado: o stream ativo pertence a outro organizador autenticado.',
      });
    }

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
        if (
          frame.type === 'gift' ||
          frame.type === 'gift_confirmed' ||
          frame.type === 'gift_persisted'
        ) {
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
          tiktokEventQueue.recordSseEventTransmitted(
            matchingOutbox,
            clientId,
            frame.persistedMonoMs
          );
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
  }
);

/**
 * Restore session combo streaks and processed event IDs from Firestore on server restart (PRO Only + Ownership)
 * Also supports `simulateServerRestart: true` (Admin Only) for deterministic verification of cold-boot recovery.
 */
app.post(
  '/api/tiktok/restore-session',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const { sessionId, simulateServerRestart, reconnectWebcast, instanceId } = req.body || {};
    if (
      typeof sessionId !== 'string' ||
      !sessionId.trim() ||
      sessionId.trim().length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(sessionId.trim())
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SESSION_ID',
        error: 'sessionId é obrigatório e deve ser um identificador válido.',
      });
    }
    const targetSessionId = sessionId.trim();

    // ISO-02 (6): Require real administrative authorization when simulateServerRestart is requested
    if (simulateServerRestart === true || Boolean(simulateServerRestart)) {
      const adminCheck = await verifyAdminRequest(req);
      if (!adminCheck.authorized) {
        return res.status(adminCheck.status || 403).json({
          success: false,
          code: adminCheck.status === 401 ? 'FIREBASE_AUTH_REQUIRED' : 'ADMIN_FORBIDDEN',
          error:
            adminCheck.reason ||
            'Acesso negado: o parâmetro simulateServerRestart exige privilégios administrativos.',
        });
      }
    }

    const executeRestoreAtomically = async () => {
      // ISO-02 (1): Validate explicit ownership of the target session in Firestore before any state change
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: targetSessionId,
        authUid,
        allowIfNotExists: false,
        requireExplicitOwner: true,
      });
      if (!ownership.allowed) {
        return {
          httpStatus: ownership.status,
          payload: {
            success: false,
            code: ownership.code || 'OWNERSHIP_FORBIDDEN',
            error: ownership.reason,
          },
        };
      }

      // ISO-02 (2, 4, 5): Block if in-memory singleton is currently assigned to another organizer
      if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
        return {
          httpStatus: 403,
          payload: {
            success: false,
            code: 'OWNERSHIP_FORBIDDEN',
            error:
              'Acesso negado: a instância global está operando uma sessão LIVE pertencente a outro organizador autenticado.',
          },
        };
      }

      // ISO-02 (2, 4, 5): Prevent replacing currentSessionId or disconnecting if adapter holds another organizer's session
      const currentAdapterSessionId = tiktokAdapter.getRawCurrentSessionId();
      const currentAdapterStatus = tiktokAdapter.getStatus();
      const isAdapterBusy =
        currentAdapterStatus.state === 'CONNECTED' ||
        currentAdapterStatus.state === 'CONNECTING' ||
        currentAdapterStatus.state === 'RECONNECTING' ||
        tiktokAdapter.isWebcastGenuinelyActive();

      if (currentAdapterSessionId && currentAdapterSessionId !== targetSessionId) {
        const currentSessionOwnership = await verifyFirestoreResourceOwnership({
          collectionName: 'sessions',
          docId: currentAdapterSessionId,
          authUid,
          allowIfNotExists: true,
          requireExplicitOwner: true,
        });
        if (!currentSessionOwnership.allowed || (isAdapterBusy && activeLiveConnectionOwnerUid !== authUid)) {
          return {
            httpStatus: 403,
            payload: {
              success: false,
              code: 'OWNERSHIP_FORBIDDEN',
              error:
                'Acesso negado: não é permitido substituir ou desconectar a sessão LIVE ativa de outro organizador.',
            },
          };
        }
      }

      // R-1.3.1-B: Atomically validate and acquire distributed lock via Firestore transaction with fencingToken
      const sessionDocData = ownership.data || {};
      const lockCheck = await acquireOrCoalesceWebcastLock({
        ownerUid: authUid,
        sessionId: targetSessionId,
        roomUsername: String(
          sessionDocData.username || tiktokAdapter.getStatus().roomUsername || ''
        ).replace(/^@/, ''),
        activeRuleId: String(
          sessionDocData.currentRuleId || tiktokAdapter.getActiveRuleId() || 'rule_default_100'
        ),
        currentRate: Number(sessionDocData.currentRate || tiktokAdapter.getActiveRate() || 100),
        requestedInstanceId:
          typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : undefined,
        isRestoreOperation: true,
      });

      if (!lockCheck.allowed) {
        return {
          httpStatus: lockCheck.status || 403,
          payload: {
            success: false,
            code: lockCheck.code || 'OWNERSHIP_FORBIDDEN',
            error:
              lockCheck.reason ||
              'Acesso negado: existe um lock de transmissão LIVE ativo pertencente a outro organizador autenticado.',
          },
        };
      }

      const acquiredFencingToken = lockCheck.fencingToken;

      try {
        const preCheckLease = await verifyActiveLeaseFencingToken(
          authUid,
          targetSessionId,
          acquiredFencingToken
        );
        if (!preCheckLease.valid) {
          return {
            httpStatus: 409,
            payload: {
              success: false,
              code: 'STALE_FENCING_TOKEN',
              error: preCheckLease.reason,
            },
          };
        }

        if (simulateServerRestart === true || Boolean(simulateServerRestart)) {
          // Wipe in-memory adapter state and rotate serverInstanceId to simulate a fresh server process boot
          tiktokAdapter.resetMemoryStateForSimulatedRestart();
          activeLiveConnectionOwnerUid = null;
          activeLiveConnectionSessionId = null;
          serverInstanceId = `srv_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }

        const walRecovered = tiktokEventQueue.loadWalFromDisk();
        const restoreFn =
          serverTestHooks.customRestoreSessionFromFirestore ||
          ((s: string) => tiktokAdapter.restoreSessionFromFirestore(s));
        const restored = await restoreFn(targetSessionId);

        // R-1.3.1-B & P1-LOCK-B1: Verify fencingToken after async restoration before committing state
        const postRestoreLease = await verifyActiveLeaseFencingToken(
          authUid,
          targetSessionId,
          acquiredFencingToken
        );
        if (!postRestoreLease.valid) {
          if (
            tiktokAdapter.getCurrentOwnerUid() === authUid &&
            tiktokAdapter.getRawCurrentSessionId() === targetSessionId
          ) {
            tiktokAdapter.resetMemoryStateForSimulatedRestart();
          }
          return {
            httpStatus: 409,
            payload: {
              success: false,
              code: 'STALE_FENCING_TOKEN',
              error: postRestoreLease.reason,
            },
          };
        }

        if (reconnectWebcast && restored.username) {
          const connectFn =
            serverTestHooks.customAdapterConnect ||
            ((u: string, s: string, r: string, rt: number, retry?: boolean) =>
              tiktokAdapter.connect(u, s, r, rt, retry));
          await connectFn(
            restored.username,
            targetSessionId,
            restored.activeRuleId || 'rule_default_100',
            restored.currentRate || 100,
            true
          );

          const postConnectLease = await verifyActiveLeaseFencingToken(
            authUid,
            targetSessionId,
            acquiredFencingToken
          );
          if (!postConnectLease.valid) {
            if (
              tiktokAdapter.getCurrentOwnerUid() === authUid &&
              tiktokAdapter.getRawCurrentSessionId() === targetSessionId
            ) {
              await tiktokAdapter.disconnect(true).catch(() => {});
              tiktokAdapter.resetMemoryStateForSimulatedRestart();
            }
            return {
              httpStatus: 409,
              payload: {
                success: false,
                code: 'STALE_FENCING_TOKEN',
                error: postConnectLease.reason,
              },
            };
          }
        }

        activeLiveConnectionOwnerUid = authUid;
        activeLiveConnectionSessionId = targetSessionId;
        activeLiveConnectionFencingToken = acquiredFencingToken;
        tiktokAdapter.setCurrentOwnerUid(authUid);
        registerSessionOwner(targetSessionId, authUid);

        const enrichedStatus = await buildEnrichedTikTokStatus();
        return {
          httpStatus: 200,
          payload: {
            ok: true,
            success: true,
            sessionId: targetSessionId,
            ownerUid: authUid,
            fencingToken: acquiredFencingToken,
            webcastActive: Boolean(enrichedStatus.webcastActive),
            walRecovered,
            ...restored,
            status: enrichedStatus,
          },
        };
      } catch (err: unknown) {
        // R-1.3.1-B & R-1.3.1-C: Release lease safely if restoration or reconnection fails so lock never stays stuck
        await releaseWebcastLock(authUid, {
          sessionId: targetSessionId,
          expectedFencingToken: acquiredFencingToken,
        }).catch(() => {});
        if (
          activeLiveConnectionOwnerUid === authUid &&
          activeLiveConnectionFencingToken === acquiredFencingToken
        ) {
          activeLiveConnectionOwnerUid = null;
          activeLiveConnectionSessionId = null;
          activeLiveConnectionFencingToken = 0;
        }
        if (
          tiktokAdapter.getCurrentOwnerUid() === authUid &&
          tiktokAdapter.getRawCurrentSessionId() === targetSessionId
        ) {
          await tiktokAdapter.disconnect(true).catch(() => {});
          tiktokAdapter.resetMemoryStateForSimulatedRestart();
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          httpStatus: 500,
          payload: {
            success: false,
            code: 'RESTORE_SESSION_FAILED',
            error: `Falha durante restauração da sessão LIVE: ${message}`,
          },
        };
      }
    };

    const outcome =
      process.env.GIO_TEST_MODE === 'true' && serverTestHooks.bypassConnectRouteMutex === true
        ? await executeRestoreAtomically()
        : await withConnectRouteMutex(executeRestoreAtomically);

    return res.status(outcome.httpStatus).json(outcome.payload);
  }
);

/**
 * Automated Integration Test / Diagnostic Ingestion Endpoint (Admin + PRO Only + Explicit Session Ownership)
 * Isolated for automated verification scripts & LIVE SYSTEM MONITOR diagnostics.
 */
app.post(
  '/api/tiktok/test-event',
  requireFirebaseAuth,
  async (req: Request, res: Response, next) => {
    // ISO-03 (1, 2, 8): Require real administrative authorization before any processing
    const adminCheck = await verifyAdminRequest(req);
    if (!adminCheck.authorized) {
      return res.status(adminCheck.status || 403).json({
        success: false,
        code: adminCheck.status === 401 ? 'FIREBASE_AUTH_REQUIRED' : 'ADMIN_FORBIDDEN',
        error:
          adminCheck.reason ||
          'Acesso negado: este endpoint de teste é restrito a administradores autorizados.',
      });
    }
    return next();
  },
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    // ISO-03 (3, 6, 9): Require explicit, valid sessionId in request body; forbid fallback to tiktokAdapter.getCurrentSessionId()
    const rawSessionId = body.sessionId;
    if (
      typeof rawSessionId !== 'string' ||
      !rawSessionId.trim() ||
      rawSessionId.trim().length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(rawSessionId.trim())
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SESSION_ID',
        error:
          'Parâmetro sessionId explícito e válido é obrigatório no corpo da requisição (fallback implícito desativado por segurança).',
      });
    }
    const requestedSessionId = rawSessionId.trim();

    // ISO-03 (4, 5, 7): Reject non-existent sessions and validate explicit ownership (allowIfNotExists: false)
    const ownership = await verifyFirestoreResourceOwnership({
      collectionName: 'sessions',
      docId: requestedSessionId,
      authUid,
      allowIfNotExists: false,
      requireExplicitOwner: true,
    });
    if (!ownership.allowed) {
      return res.status(ownership.status).json({
        success: false,
        code: ownership.code || (ownership.status === 404 ? 'RESOURCE_NOT_FOUND' : 'OWNERSHIP_FORBIDDEN'),
        error: ownership.reason,
      });
    }

    // Prevent cross-session interference if the singleton is currently operating another organizer's LIVE session
    if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
      return res.status(403).json({
        success: false,
        code: 'OWNERSHIP_FORBIDDEN',
        error:
          'Acesso negado: a instância global está operando uma sessão LIVE pertencente a outro organizador.',
      });
    }

    const currentAdapterSessionId = tiktokAdapter.getRawCurrentSessionId();
    if (currentAdapterSessionId && currentAdapterSessionId !== requestedSessionId) {
      const currentSessionOwnership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: currentAdapterSessionId,
        authUid,
        allowIfNotExists: true,
        requireExplicitOwner: true,
      });
      if (!currentSessionOwnership.allowed) {
        return res.status(403).json({
          success: false,
          code: 'OWNERSHIP_FORBIDDEN',
          error:
            'Acesso negado: a instância global contém uma sessão ativa pertencente a outro organizador.',
        });
      }
    }

    // R-1.3.1-A: Do NOT call setProPlanTier('PRO', 'ACTIVE') globally; bind session ownerUid instead
    const sessionOwnerUid = ownership.data?.ownerUid
      ? String(ownership.data.ownerUid).trim()
      : authUid;
    registerSessionOwner(requestedSessionId, sessionOwnerUid);

    const origin = body._diagnosticOrigin === 'LIVE_REAL' ? 'LIVE_REAL' : 'SIMULATED_TEST';
    const explicitGiftPayload = {
      ...body,
      sessionId: requestedSessionId,
      ownerUid: sessionOwnerUid,
    };
    const outcome = tiktokAdapter.handleIncomingGift(explicitGiftPayload, origin);

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
  }
);

// ==========================================
// TIKTOK LIVE ADVANCED DIAGNOSTICS & EVENT DEBUGGER ADMIN ENDPOINTS
// ==========================================

async function requireAdminDiagnosticAuth(req: Request, res: Response, next: () => void) {
  if (req.headers['x-gio-unauthorized-test'] === 'true') {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado: Credencial administrativa ausente ou inválida.',
      status: 401,
    });
  }
  const check = await verifyAdminRequest(req);
  if (!check.authorized) {
    return res.status(check.status || 401).json({
      success: false,
      error: check.reason || 'Acesso negado: Endpoint restrito a administradores autorizados.',
      status: check.status || 401,
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

  const adminUid = String(req.authUid || 'admin_user');
  tiktokDiagnosticService.recordAudit({
    action: 'QUERY_EVENTS',
    adminUid,
    adminEmail: req.authEmail || 'admin@local',
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
  const adminUid = String(req.authUid || 'admin_user');
  const adminEmail = String(req.authEmail || 'admin@local');

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
  const adminUid = String(req.authUid || 'admin_user');
  const adminEmail = String(req.authEmail || 'admin@local');

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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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

async function authorizeComplianceReadRequest(req: Request): Promise<{
  allowed: boolean;
  status: 200 | 400 | 401 | 403;
  code?: string;
  error?: string;
  targetUserId?: string;
}> {
  const rawUserId = req.query.userId;
  const hasUserIdParam =
    rawUserId !== undefined &&
    rawUserId !== null &&
    String(rawUserId).trim() !== '';
  const requestedUserId = hasUserIdParam ? String(rawUserId).trim() : undefined;

  // Cenário A — Listagem global (sem parâmetro userId): exige administrador autenticado e autorizado no servidor
  if (!requestedUserId) {
    const adminCheck = await verifyAdminRequest(req);
    if (!adminCheck.authorized) {
      const status = (adminCheck.status as 400 | 401 | 403) || 401;
      return {
        allowed: false,
        status,
        code: status === 401 ? 'FIREBASE_AUTH_REQUIRED' : 'ADMIN_FORBIDDEN',
        error:
          adminCheck.reason ||
          'Acesso negado: a listagem global exige autenticação administrativa verificada no servidor.',
      };
    }
    return {
      allowed: true,
      status: 200,
      targetUserId: undefined,
    };
  }

  // Cenário B — Consulta individual (com parâmetro userId): exige Firebase ID Token válido (titular === userId ou Admin autorizado)
  if (req.headers['x-gio-unauthorized-test'] === 'true') {
    return {
      allowed: false,
      status: 401,
      code: 'FIREBASE_AUTH_REQUIRED',
      error: 'Autenticação obrigatória via cabeçalho Authorization: Bearer <Firebase ID Token>.',
    };
  }

  const authResult = await verifyAuthenticatedFirebaseUser(req);
  if (!authResult.authenticated || !authResult.uid) {
    const status = (authResult.status as 400 | 401) || 401;
    return {
      allowed: false,
      status,
      code: authResult.code || 'FIREBASE_AUTH_REQUIRED',
      error:
        authResult.reason ||
        'Autenticação obrigatória: envie um Firebase ID Token válido no cabeçalho Authorization: Bearer <token>.',
    };
  }

  const authenticatedUid = authResult.uid;
  if (authenticatedUid === requestedUserId) {
    return {
      allowed: true,
      status: 200,
      targetUserId: authenticatedUid,
    };
  }

  // Consulta cruzada: permitida exclusivamente se o chamador autenticado for administrador confirmado pelo servidor
  const adminCheck = await verifyAdminRequest(req);
  if (adminCheck.authorized) {
    return {
      allowed: true,
      status: 200,
      targetUserId: requestedUserId,
    };
  }

  return {
    allowed: false,
    status: 403,
    code: 'OWNERSHIP_FORBIDDEN',
    error: 'Acesso negado: não é permitido consultar registros pertencentes a outro usuário.',
  };
}

app.get('/api/legal/acceptances', async (req: Request, res: Response) => {
  const access = await authorizeComplianceReadRequest(req);
  if (!access.allowed) {
    return res.status(access.status).json({
      success: false,
      code: access.code,
      error: access.error,
    });
  }
  try {
    const acceptances = await fetchAllDocumentAcceptances(access.targetUserId);
    res.json({ success: true, count: acceptances.length, acceptances });
  } catch {
    res.status(500).json({
      success: false,
      error: 'Não foi possível consultar os registros de aceite no momento.',
    });
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
  const access = await authorizeComplianceReadRequest(req);
  if (!access.allowed) {
    return res.status(access.status).json({
      success: false,
      code: access.code,
      error: access.error,
    });
  }
  try {
    const requests = await fetchLgpdRequests(access.targetUserId);
    res.json({ success: true, count: requests.length, requests });
  } catch {
    res.status(500).json({
      success: false,
      error: 'Não foi possível consultar as solicitações LGPD no momento.',
    });
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
  }
  try {
    const requestId = String(req.params.requestId || '');
    const body = req.body || {};
    const updated = await updateLgpdRequestStatusAdmin(
      requestId,
      body.status || 'CONCLUIDA',
      String(body.adminResponse || body.adminResponseNote || 'Solicitação analisada pela administração.'),
      String(body.handledBy || authCheck.email || 'admin@local')
    );
    res.json({ success: true, request: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

app.get('/api/support/tickets', async (req: Request, res: Response) => {
  const access = await authorizeComplianceReadRequest(req);
  if (!access.allowed) {
    return res.status(access.status).json({
      success: false,
      code: access.code,
      error: access.error,
    });
  }
  try {
    const tickets = await fetchSupportTickets(access.targetUserId);
    res.json({ success: true, count: tickets.length, tickets });
  } catch {
    res.status(500).json({
      success: false,
      error: 'Não foi possível consultar os chamados de suporte no momento.',
    });
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
  }
  try {
    const updated = await saveCompanyLegalSettings(
      req.body || {},
      authCheck.email || 'admin@local'
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
  }
  try {
    const updated = await saveCommercialSubscriptionConfig(req.body || {});
    res.json({ success: true, config: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: message });
  }
});

/**
 * POST /api/admin/pending-revocations/discard
 * Protected administrative endpoint to discard a quarantined or failed TikTok token revocation task.
 * Requires verified administrative authorization (verifyAdminRequest).
 * Uses verified authCheck.uid as operator identity, ignoring any client-supplied adminUid.
 * Rejects requests without non-empty justification (notes/reason) or for tasks not in QUARANTINED/FAILED status.
 */
app.post('/api/admin/pending-revocations/discard', async (req: Request, res: Response) => {
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({
      success: false,
      code: authCheck.status === 401 ? 'FIREBASE_AUTH_REQUIRED' : 'ADMIN_FORBIDDEN',
      error: authCheck.reason || 'Acesso negado: Endpoint restrito a administradores autorizados.',
    });
  }

  try {
    const { revocationId, notes, reason } = req.body || {};
    const cleanRevId = String(revocationId || '').trim();
    const cleanNotes = String(notes || reason || '').trim();

    if (!cleanRevId) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_REVOCATION_ID',
        error: 'ID da revogação pendente é obrigatório.',
      });
    }

    if (!cleanNotes) {
      return res.status(400).json({
        success: false,
        code: 'JUSTIFICATION_REQUIRED',
        error: 'A justificativa para o descarte administrativo é obrigatória.',
      });
    }

    const outcome = await tiktokOAuthService.adminDiscardQuarantinedToken({
      revocationId: cleanRevId,
      adminUid: String(authCheck.uid || 'admin_user'),
      notes: cleanNotes,
    });

    if (!outcome.discarded) {
      if (outcome.error === 'DOC_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          code: 'DOC_NOT_FOUND',
          error: 'Documento de revogação pendente não encontrado.',
        });
      }
      if (outcome.error === 'INVALID_STATUS_FOR_DISCARD') {
        return res.status(409).json({
          success: false,
          code: 'INVALID_STATUS_FOR_DISCARD',
          error: 'O descarte administrativo é permitido somente para tarefas nos estados QUARANTINED ou FAILED.',
          docStatus: outcome.doc?.status,
        });
      }
      return res.status(400).json({
        success: false,
        code: outcome.error || 'DISCARD_FAILED',
        error: `Falha ao descartar tarefa: ${outcome.error}`,
      });
    }

    return res.json({
      success: true,
      discarded: true,
      revocationId: cleanRevId,
      status: outcome.doc?.status,
      adminDiscarded: outcome.doc?.adminDiscarded,
      adminNotes: outcome.doc?.adminNotes,
      adminDiscardedAt: outcome.doc?.adminDiscardedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/admin/pending-revocations/audit-logs
 * Protected administrative endpoint to query TikTok token revocation audit logs.
 * Requires verified administrative authorization (verifyAdminRequest).
 * Unauthenticated users or non-admin users receive 401 / 403.
 */
app.get('/api/admin/pending-revocations/audit-logs', async (req: Request, res: Response) => {
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({
      success: false,
      code: authCheck.status === 401 ? 'FIREBASE_AUTH_REQUIRED' : 'ADMIN_FORBIDDEN',
      error: authCheck.reason || 'Acesso negado: Endpoint restrito a administradores autorizados.',
    });
  }

  try {
    const outcome = await tiktokOAuthService.getAdminRevocationAuditLogs({
      adminUid: String(authCheck.uid),
    });
    return res.json({
      success: true,
      logs: outcome.logs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: message });
  }
});

// ==========================================
// MERCADO PAGO RECURRING SUBSCRIPTIONS & COMMERCIAL PLANS ENDPOINTS
// ==========================================

/**
 * Helper to resolve and validate UID on subscription endpoints:
 * - If Authorization: Bearer <idToken> is present, cryptographically verifies the token and extracts decodedToken.uid.
 * - Rejects with 401 if a provided Bearer token is invalid, expired, or revoked.
 * - Rejects with 403 OWNERSHIP_FORBIDDEN if a client attempts to pass a conflicting uid or email in body/query/header.
 * - For private endpoints (requireAuth: true), returns 401 if no Bearer token is provided.
 * - For public/catalog endpoints (requireAuth: false), returns empty UID if no token is provided, never trusting spoofed parameters.
 */
async function resolveSubscriptionRequestUser(
  req: Request,
  options: { requireAuth?: boolean } = { requireAuth: true }
): Promise<{
  ok: boolean;
  status: number;
  code?: string;
  error?: string;
  uid: string;
  email: string;
  emailVerified: boolean;
  verifiedByToken: boolean;
}> {
  const requireAuth = options.requireAuth !== false;
  const hasBearerOrToken =
    (typeof req.headers.authorization === 'string' &&
      req.headers.authorization.trim().toLowerCase().startsWith('bearer ')) ||
    (typeof req.query?.idToken === 'string' && req.query.idToken.trim().length > 0);

  const clientSuppliedUid = String(
    req.body?.uid || req.query?.uid || req.headers['x-firebase-uid'] || ''
  ).trim();
  const clientSuppliedEmail = String(
    req.body?.email || req.query?.email || req.headers['x-firebase-email'] || ''
  ).trim();
  const clientSuppliedEmailVerified = Boolean(
    req.body?.emailVerified ??
      (req.query?.emailVerified === 'true' || req.headers['x-firebase-email-verified'] === 'true')
  );

  if (hasBearerOrToken) {
    const authResult = await verifyAuthenticatedFirebaseUser(req);
    if (!authResult.authenticated || !authResult.uid) {
      return {
        ok: false,
        status: authResult.status || 401,
        code: authResult.code || 'FIREBASE_TOKEN_INVALID',
        error: authResult.reason || 'Firebase ID Token inválido, expirado ou revogado.',
        uid: '',
        email: '',
        emailVerified: false,
        verifiedByToken: false,
      };
    }
    if (clientSuppliedUid && clientSuppliedUid !== authResult.uid) {
      return {
        ok: false,
        status: 403,
        code: 'OWNERSHIP_FORBIDDEN',
        error: `Acesso negado: o token autenticado pertence a '${authResult.uid}', não sendo permitido operar sobre a conta '${clientSuppliedUid}'.`,
        uid: authResult.uid,
        email: authResult.email || '',
        emailVerified: authResult.emailVerified ?? false,
        verifiedByToken: true,
      };
    }
    if (
      clientSuppliedEmail &&
      authResult.email &&
      clientSuppliedEmail.toLowerCase() !== authResult.email.toLowerCase()
    ) {
      return {
        ok: false,
        status: 403,
        code: 'OWNERSHIP_FORBIDDEN',
        error: `Acesso negado: o e-mail informado ('${clientSuppliedEmail}') não corresponde à conta autenticada ('${authResult.email}').`,
        uid: authResult.uid,
        email: authResult.email,
        emailVerified: authResult.emailVerified ?? false,
        verifiedByToken: true,
      };
    }
    return {
      ok: true,
      status: 200,
      uid: authResult.uid,
      email: authResult.email || clientSuppliedEmail,
      emailVerified: authResult.emailVerified ?? clientSuppliedEmailVerified,
      verifiedByToken: true,
    };
  }

  if (requireAuth) {
    return {
      ok: false,
      status: 401,
      code: 'FIREBASE_AUTH_REQUIRED',
      error:
        'Autenticação obrigatória: envie um Firebase ID Token válido no cabeçalho Authorization: Bearer <token>.',
      uid: '',
      email: '',
      emailVerified: false,
      verifiedByToken: false,
    };
  }

  // Anonymous request allowed (e.g. GET /api/subscriptions/plans)
  // CRITICAL SEC-02: Never trust clientSuppliedUid or clientSuppliedEmail without cryptographic verification!
  return {
    ok: true,
    status: 200,
    uid: '',
    email: '',
    emailVerified: false,
    verifiedByToken: false,
  };
}

/**
 * GET /api/subscriptions/plans
 * Returns official Monthly (R$ 29,90) and Annual (R$ 199,90) plans, checkout architecture comparison,
 * homologation gate status, and optional user subscription / per-UID trial eligibility.
 */
app.get('/api/subscriptions/plans', async (req: Request, res: Response) => {
  try {
    const resolvedUser = await resolveSubscriptionRequestUser(req, { requireAuth: false });
    if (!resolvedUser.ok) {
      return res.status(resolvedUser.status).json({
        success: false,
        code: resolvedUser.code,
        error: resolvedUser.error,
      });
    }

    const { monthly, annual, config } = await mercadoPagoSubscriptionService.getOfficialPlans();
    const paypalPlans = paypalSubscriptionService.getOfficialPlans();
    const homologationReport =
      config.mpHomologationReport ||
      (await mercadoPagoSubscriptionService.executeTenStepHomologationVerification());
    const uid = resolvedUser.uid;

    let userSubscription = null;
    if (uid) {
      userSubscription = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid);
    }

    res.json({
      success: true,
      config,
      plans: { monthly, annual },
      paypalPlans,
      providers: ['MERCADO_PAGO', 'PAYPAL'],
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
            'Exige validação real na API de homologação de que free_trial (3 days) é aceito e aplicado em POST /preapproval sem preapproval_plan_id.',
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
            'Herda free_trial do plano (POST /preapproval_plan), mas altera a experiência de checkout hospedado para tokenização transparente e exige validação de next_payment_date >= +3 dias.',
        },
        paypalRecurringSubscription: {
          mode: 'PAYPAL_REST_V1_SUBSCRIPTIONS',
          endpoint: 'POST https://api-m.paypal.com/v1/billing/subscriptions',
          uxType: 'PayPal Smart Subscription Checkout (Redirecionamento seguro ou popup oficial)',
          uidBinding: 'custom_id: <FIREBASE_UID> vinculado 1:1 e validado no backend',
          cardCollection: 'Infraestrutura global protegida PayPal (PCI-DSS Nível 1)',
          trialRequirement: 'Ciclo inicial de 3 dias com valor R$ 0,00 aplicado automaticamente.',
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
    const resolvedUser = await resolveSubscriptionRequestUser(req, { requireAuth: true });
    if (!resolvedUser.ok) {
      return res.status(resolvedUser.status).json({
        success: false,
        code: resolvedUser.code,
        error: resolvedUser.error,
      });
    }

    const { uid, email, emailVerified } = resolvedUser;

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
      entitlement: buildEntitlementFromSubscriptionRecord(subscription),
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
    const resolvedUser = await resolveSubscriptionRequestUser(req, { requireAuth: true });
    if (!resolvedUser.ok) {
      return res.status(resolvedUser.status).json({
        success: false,
        code: resolvedUser.code,
        error: resolvedUser.error,
      });
    }

    const body = req.body || {};
    const { uid, email, emailVerified } = resolvedUser;
    const planId = (body.planId === 'pro_annual' ? 'pro_annual' : 'pro_monthly') as CommercialPlanId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const provider = String(body.provider || 'MERCADO_PAGO').toUpperCase();

    // PayPal Checkout Route
    if (provider === 'PAYPAL') {
      const returnUrl = String(body.returnUrl || body.backUrl || `${baseUrl}/?paypal_return=1&plan=${planId}`).trim();
      const cancelUrl = String(body.cancelUrl || `${baseUrl}/?paypal_cancel=1`).trim();

      const outcome = await paypalSubscriptionService.initiateCheckout({
        uid: uid || '',
        email: email || '',
        emailVerified: Boolean(emailVerified),
        planId,
        returnUrl,
        cancelUrl,
      });

      if (!outcome.allowed) {
        return res.status(outcome.status).json({
          success: false,
          code: outcome.code,
          error: outcome.message,
          subscription: outcome.subscription,
        });
      }

      return res.json({
        success: true,
        provider: 'PAYPAL',
        code: outcome.code,
        message: outcome.message,
        initPoint: outcome.approvalUrl,
        approvalUrl: outcome.approvalUrl,
        subscriptionId: outcome.subscriptionId,
        subscription: outcome.subscription,
      });
    }

    // Mercado Pago Checkout Route (Preserved 100% Intact)
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
      provider: 'MERCADO_PAGO',
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
 * Verifies a subscription on the backend via GET from official provider (Mercado Pago or PayPal),
 * enforces 1:1 bilateral UID ownership, and activates PRO access.
 */
app.post('/api/subscriptions/verify', async (req: Request, res: Response) => {
  try {
    const resolvedUser = await resolveSubscriptionRequestUser(req, { requireAuth: true });
    if (!resolvedUser.ok) {
      return res.status(resolvedUser.status).json({
        success: false,
        code: resolvedUser.code,
        error: resolvedUser.error,
      });
    }

    const body = req.body || {};
    const { uid } = resolvedUser;
    const provider = String(body.provider || '').toUpperCase();
    const preapprovalId = String(body.preapprovalId || body.preapproval_id || '').trim();
    const paypalSubscriptionId = String(body.paypalSubscriptionId || body.subscriptionId || '').trim();

    if (!uid) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_UID',
        error: 'Identificador Firebase UID é obrigatório para verificar a assinatura no servidor.',
      });
    }

    // PayPal Verification
    if (provider === 'PAYPAL' || paypalSubscriptionId || preapprovalId.startsWith('I-')) {
      const subId = paypalSubscriptionId || preapprovalId;
      if (!subId) {
        return res.status(400).json({
          success: false,
          code: 'MISSING_PAYPAL_SUBSCRIPTION_ID',
          error: 'ID da assinatura PayPal é obrigatório para verificação.',
        });
      }

      const outcome = await paypalSubscriptionService.verifyAndSyncUserSubscription({
        authenticatedUid: uid,
        requestedSubscriptionId: subId,
      });

      if (!outcome.success) {
        return res.status(outcome.status).json({
          success: false,
          code: outcome.code,
          error: outcome.message,
          subscription: outcome.subscription,
        });
      }

      return res.json({
        success: true,
        provider: 'PAYPAL',
        code: outcome.code,
        message: outcome.message,
        subscription: outcome.subscription,
        entitlement: outcome.subscription
          ? buildEntitlementFromSubscriptionRecord(outcome.subscription)
          : getProPlanEntitlement(uid),
      });
    }

    // Mercado Pago Verification (Preserved 100% Intact)
    if (!preapprovalId) {
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
      provider: 'MERCADO_PAGO',
      code: outcome.code,
      message: outcome.message,
      subscription: outcome.subscription,
      entitlement: outcome.subscription
        ? buildEntitlementFromSubscriptionRecord(outcome.subscription)
        : getProPlanEntitlement(uid),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancels future recurring billing in Mercado Pago or PayPal,
 * while preserving the user's PRO access until trialEndDate or currentPeriodEnd.
 */
app.post('/api/subscriptions/cancel', async (req: Request, res: Response) => {
  try {
    const resolvedUser = await resolveSubscriptionRequestUser(req, { requireAuth: true });
    if (!resolvedUser.ok) {
      return res.status(resolvedUser.status).json({
        success: false,
        code: resolvedUser.code,
        error: resolvedUser.error,
      });
    }

    const { uid, email } = resolvedUser;
    const body = req.body || {};

    if (!uid) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_UID',
        error: 'Identificador de conta (Firebase UID) é obrigatório para cancelar a assinatura.',
      });
    }

    const userRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid);
    const provider = String(body.provider || userRecord.provider || 'MERCADO_PAGO').toUpperCase();

    // PayPal Cancellation
    if (provider === 'PAYPAL' || userRecord.paypalSubscriptionId) {
      const outcome = await paypalSubscriptionService.cancelSubscription({
        uid,
        reason: body.reason || 'Cancelamento solicitado pelo usuário no painel GIO DA SORTE PRO',
      });

      if (!outcome.success) {
        return res.status(outcome.status).json({
          success: false,
          code: outcome.code,
          error: outcome.message,
          subscription: outcome.subscription,
        });
      }

      return res.json({
        success: true,
        provider: 'PAYPAL',
        code: outcome.code,
        message: outcome.message,
        subscription: outcome.subscription,
        entitlement: outcome.subscription
          ? buildEntitlementFromSubscriptionRecord(outcome.subscription)
          : getProPlanEntitlement(uid),
      });
    }

    // Mercado Pago Cancellation (Preserved 100% Intact)
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
      provider: 'MERCADO_PAGO',
      code: outcome.code,
      message: outcome.message,
      payloadSentToMp: outcome.payloadSentToMp,
      subscription: outcome.subscription,
      entitlement: outcome.subscription
        ? buildEntitlementFromSubscriptionRecord(outcome.subscription)
        : getProPlanEntitlement(uid),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/subscriptions/webhook/paypal
 * Official PayPal Webhook Handler with cryptographic signature verification and idempotency.
 */
app.post('/api/subscriptions/webhook/paypal', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const webhookId = String(body.id || `ppwh_${Date.now()}`).trim();
    const eventType = String(body.event_type || '').trim();
    const resource = body.resource || {};

    const headers = {
      authAlgo: String(req.headers['paypal-auth-algo'] || req.headers['x-paypal-auth-algo'] || ''),
      certUrl: String(req.headers['paypal-cert-url'] || req.headers['x-paypal-cert-url'] || ''),
      transmissionId: String(req.headers['paypal-transmission-id'] || req.headers['x-paypal-transmission-id'] || ''),
      transmissionSig: String(req.headers['paypal-transmission-sig'] || req.headers['x-paypal-transmission-sig'] || ''),
      transmissionTime: String(req.headers['paypal-transmission-time'] || req.headers['x-paypal-transmission-time'] || ''),
    };

    const outcome = await paypalSubscriptionService.processWebhookNotification({
      webhookId,
      eventType,
      resource,
      headers,
      rawBody: body,
      enforceSignature: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    });

    res.status(outcome.status).json(outcome);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ processed: false, error: message });
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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
      adminEmail: String(body.adminEmail || authCheck.email || 'admin@local'),
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
  const authCheck = await verifyAdminRequest(req);
  if (!authCheck.authorized) {
    return res.status(authCheck.status || 401).json({ success: false, error: authCheck.reason });
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

// ============================================================================
// SORTEADOR TRADICIONAL BACKEND AUTORITATIVO V2.0 (FASE 1.7.0)
// ============================================================================

function handleTraditionalRaffleError(res: Response, err: unknown): void {
  if (err instanceof TraditionalRaffleError) {
    res.status(err.statusCode).json({
      ok: false,
      error: err.errorCode,
      message: err.message,
      details: err.details,
    });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    ok: false,
    error: 'INTERNAL_SERVER_ERROR',
    message,
  });
}

/**
 * POST /api/raffle/sync
 * Bootstraps an uninitialized raffle or updates non-authoritative UI metadata for `req.authUid`.
 * R-03 & R-04: Rejects protected governance fields (`rosterVersion`, `drawSequence`, `fencingToken`, etc.),
 * blocks sync during active `COMMITTED` state, and forbids direct roster overwrite after initialization.
 */
app.post('/api/raffle/sync', requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUid = req.authUid!;
    const { ownerUid: requestedOwnerUid, raffleId, title, settings, participants, winners } =
      req.body || {};

    traditionalRaffleService.assertAuthenticatedOwner(authenticatedUid, requestedOwnerUid);

    const synced = await traditionalRaffleService.syncOrInitRaffleState({
      authenticatedUid,
      raffleId: typeof raffleId === 'string' && raffleId.trim() ? raffleId.trim() : 'default',
      title,
      settings,
      participants,
      winners,
      strictClientGovernance: true,
      rawClientBody: req.body || {},
    });

    res.status(200).json({
      ok: true,
      raffle: synced,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * GET /api/raffle/state
 * Fetches the authoritative raffle state for the authenticated owner.
 */
app.get('/api/raffle/state', requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUid = req.authUid!;
    const raffleId =
      typeof req.query.raffleId === 'string' && req.query.raffleId.trim()
        ? req.query.raffleId.trim()
        : 'default';
    const requestedOwnerUid =
      typeof req.query.ownerUid === 'string' ? req.query.ownerUid : undefined;

    const state = await traditionalRaffleService.getRaffleStateForOwner(
      authenticatedUid,
      raffleId,
      requestedOwnerUid
    );

    res.status(200).json({
      ok: true,
      raffle: state,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * GET /api/raffle/draws
 * R-02: Lists permanent traditional draw records from `users/{ownerUid}/raffles/{raffleId}/draws`.
 */
app.get('/api/raffle/draws', requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUid = req.authUid!;
    const raffleId =
      typeof req.query.raffleId === 'string' && req.query.raffleId.trim()
        ? req.query.raffleId.trim()
        : 'default';
    const requestedOwnerUid =
      typeof req.query.ownerUid === 'string' ? req.query.ownerUid : undefined;

    const draws = await traditionalRaffleService.listRaffleDrawsForOwner(
      authenticatedUid,
      raffleId,
      requestedOwnerUid
    );

    res.status(200).json({
      ok: true,
      draws,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * POST /api/raffle/participant/mutate
 * R-04: Central authoritative roster & allocation settings mutations that atomically increment `rosterVersion`.
 * Supports all 6 frontend handlers (`addParticipant`, `updateParticipantCoins`, `removeParticipant`,
 * `clearAllParticipants`, `bulkAddParticipants`, `updateRaffleAllocationSettings`) plus eligibility & canonical name updates.
 */
app.post('/api/raffle/participant/mutate', requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUid = req.authUid!;
    const {
      ownerUid: requestedOwnerUid,
      raffleId = 'default',
      action,
      participant,
      participantId,
      winnerId,
      eligible,
      coins,
      name,
      items,
      replace,
      mergeIfSameName,
      settingsPatch,
    } = req.body || {};

    traditionalRaffleService.assertAuthenticatedOwner(authenticatedUid, requestedOwnerUid);
    traditionalRaffleService.assertNoProtectedGovernanceFieldsInClientPayload(req.body || {}, {
      forbidClientWinners: true,
    });

    let updated;
    if (action === 'addParticipant') {
      updated = await traditionalRaffleService.addParticipant({
        authenticatedUid,
        raffleId,
        participant,
        mergeIfSameName: Boolean(mergeIfSameName),
        autoCreateIfMissing: true,
      });
    } else if (action === 'removeParticipant') {
      updated = await traditionalRaffleService.removeParticipant({
        authenticatedUid,
        raffleId,
        participantId,
      });
    } else if (action === 'clearAllParticipants') {
      updated = await traditionalRaffleService.clearAllParticipants({
        authenticatedUid,
        raffleId,
        autoCreateIfMissing: true,
      });
    } else if (action === 'bulkAddParticipants') {
      updated = await traditionalRaffleService.bulkAddParticipants({
        authenticatedUid,
        raffleId,
        items: Array.isArray(items) ? items : [],
        replace: Boolean(replace),
        autoCreateIfMissing: true,
      });
    } else if (action === 'updateParticipantEligibility') {
      updated = await traditionalRaffleService.updateParticipantEligibility({
        authenticatedUid,
        raffleId,
        participantId,
        eligible: Boolean(eligible),
      });
    } else if (action === 'updateParticipantCoins') {
      updated = await traditionalRaffleService.updateParticipantCoins({
        authenticatedUid,
        raffleId,
        participantId,
        coins: Number(coins),
      });
    } else if (action === 'updateParticipantCanonicalDetails') {
      updated = await traditionalRaffleService.updateParticipantCanonicalDetails({
        authenticatedUid,
        raffleId,
        participantId,
        name: String(name || ''),
      });
    } else if (action === 'updateRaffleAllocationSettings') {
      updated = await traditionalRaffleService.updateRaffleAllocationSettings({
        authenticatedUid,
        raffleId,
        settingsPatch: settingsPatch || {},
        autoCreateIfMissing: true,
      });
    } else if (action === 'removeSessionWinner') {
      updated = await traditionalRaffleService.removeSessionWinner({
        authenticatedUid,
        raffleId,
        winnerId: String(winnerId || ''),
      });
    } else if (action === 'clearSessionWinners') {
      updated = await traditionalRaffleService.clearSessionWinners({
        authenticatedUid,
        raffleId,
        autoCreateIfMissing: true,
      });
    } else {
      throw new TraditionalRaffleError(400, 'INVALID_MUTATION_ACTION');
    }

    res.status(200).json({
      ok: true,
      raffle: updated,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * POST /api/raffle/draw/pre-commit
 * Generates a cryptographic pre-commitment (`C_server`, `drawNonce`, `fencingToken`) for the authenticated owner's raffle.
 */
app.post('/api/raffle/draw/pre-commit', requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUid = req.authUid!;
    const { ownerUid: requestedOwnerUid, raffleId = 'default' } = req.body || {};

    const result = await traditionalRaffleService.createDrawPrecommit({
      authenticatedUid,
      requestedOwnerUid,
      raffleId,
    });

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * POST /api/raffle/draw
 * Executes the authoritative Provably Fair V2 draw on the backend.
 * Never trusts client-provided winner, roster, or ownerUid.
 */
app.post('/api/raffle/draw', requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const authenticatedUid = req.authUid!;
    const {
      ownerUid: requestedOwnerUid,
      raffleId = 'default',
      drawId,
      idempotencyKey,
      commitmentHash,
      clientEntropy,
      expectedRosterVersion,
      expectedDrawSequence,
      fencingToken,
      drawMode = 'drum',
      winnerCount = 1,
      prizeId = 'NONE',
      prizeName,
      drawNonce: clientSuppliedDrawNonce,
    } = req.body || {};

    const outcome = await traditionalRaffleService.executeOfficialDraw({
      authenticatedUid,
      requestedOwnerUid,
      raffleId,
      drawId: String(drawId || ''),
      idempotencyKey: String(idempotencyKey || ''),
      commitmentHash: String(commitmentHash || ''),
      clientEntropy: String(clientEntropy || ''),
      expectedRosterVersion: Number(expectedRosterVersion),
      expectedDrawSequence: Number(expectedDrawSequence),
      fencingToken: Number(fencingToken),
      drawMode,
      winnerCount: Number(winnerCount),
      prizeId: prizeId ? String(prizeId) : 'NONE',
      prizeName: typeof prizeName === 'string' ? prizeName : undefined,
      clientSuppliedDrawNonce:
        typeof clientSuppliedDrawNonce === 'string' ? clientSuppliedDrawNonce : undefined,
    });

    res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * POST /api/raffle/draw/recover
 * R-06: Recovers an abandoned `IN_PROGRESS` draw lock (> 60s).
 * Dual Auth: Accepts Organizer Firebase ID Token OR Authorized Worker Google OIDC Token.
 */
app.post('/api/raffle/draw/recover', requireWorkerOrFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const {
      raffleId = 'default',
      idempotencyKey,
      drawId,
      commitmentHash,
      requestFingerprint,
    } = req.body || {};

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      throw new TraditionalRaffleError(
        400,
        'HTTP_400_MISSING_IDEMPOTENCY_KEY',
        'Parâmetro idempotencyKey é obrigatório.'
      );
    }

    if (!drawId || typeof drawId !== 'string') {
      throw new TraditionalRaffleError(
        400,
        'HTTP_400_MISSING_DRAW_ID',
        'Parâmetro drawId é obrigatório.'
      );
    }

    let authenticatedUid: string;
    let targetRaffleId = String(raffleId || 'default').trim();

    if (req.authType === 'OIDC_WORKER') {
      // Path B: Automated Worker via Cloud Scheduler OIDC
      // Must supply commitmentHash to locate precommit and derive authentic ownerUid
      if (!commitmentHash || typeof commitmentHash !== 'string' || !commitmentHash.trim()) {
        throw new TraditionalRaffleError(
          400,
          'INVALID_COMMITMENT_HASH',
          'Parâmetro commitmentHash é obrigatório para recuperação automatizada por worker.'
        );
      }

      const precommitPath = traditionalRaffleService.privatePrecommitPath(commitmentHash.trim());
      const precommitSnap = await traditionalRaffleService
        .getStore()
        .getDocDirect<TraditionalDrawPrecommitRecord>(precommitPath);

      if (!precommitSnap.exists) {
        throw new TraditionalRaffleError(
          404,
          'HTTP_404_PRECOMMIT_NOT_FOUND',
          'Pré-compromisso não encontrado para recuperação.'
        );
      }
      const precommit = precommitSnap.data()!;
      authenticatedUid = precommit.ownerUid;
      if (precommit.raffleId) {
        targetRaffleId = precommit.raffleId;
      }
    } else {
      // Path A: Human Organizer via Firebase ID Token
      authenticatedUid = req.authUid!;
    }

    const recovered = await traditionalRaffleService.recoverAbandonedDraw({
      authenticatedUid,
      raffleId: targetRaffleId,
      idempotencyKey: String(idempotencyKey || ''),
      drawId: String(drawId || ''),
      commitmentHash: typeof commitmentHash === 'string' ? commitmentHash : undefined,
      requestFingerprint: String(requestFingerprint || ''),
    });

    res.status(200).json({
      ok: true,
      ...recovered,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * POST /api/raffle/draw/sweep
 * R-07: Executes the normative Sweeper & Reconciliation for a commitmentHash.
 * Dual Auth: Accepts Organizer Firebase ID Token OR Authorized Worker Google OIDC Token.
 */
app.post('/api/raffle/draw/sweep', requireWorkerOrFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { commitmentHash } = req.body || {};
    if (!commitmentHash || typeof commitmentHash !== 'string' || !commitmentHash.trim()) {
      throw new TraditionalRaffleError(
        400,
        'INVALID_COMMITMENT_HASH',
        'Parâmetro commitmentHash é obrigatório.'
      );
    }

    let result;
    if (req.authType === 'OIDC_WORKER') {
      // Path B: Automated Worker via Cloud Scheduler OIDC (isInternalAuthorizedJob: true)
      result = await traditionalRaffleService.sweepExpiredPrecommit({
        isInternalAuthorizedJob: true,
        commitmentHash: commitmentHash.trim(),
      });
    } else {
      // Path A: Human Organizer via Firebase ID Token (enforces authenticatedUid === precommit.ownerUid)
      result = await traditionalRaffleService.sweepExpiredPrecommit({
        authenticatedUid: req.authUid!,
        commitmentHash: commitmentHash.trim(),
      });
    }

    res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

/**
 * GET /api/raffle/ledger/:commitmentHash
 * Public cryptographic verification endpoint for the Hash Chain ledger of a draw.
 */
app.get('/api/raffle/ledger/:commitmentHash', async (req: Request, res: Response) => {
  try {
    const commitmentHash = String(req.params.commitmentHash || '').trim();
    const bundle = await traditionalRaffleService.getVerifiedLedgerBundle(commitmentHash);
    res.status(200).json({
      ok: true,
      ...bundle,
    });
  } catch (err) {
    handleTraditionalRaffleError(res, err);
  }
});

// Garantir que nenhuma rota /api/* inexistente caia no SPA fallback HTML do Vite ou dist/index.html
app.use('/api', (req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    success: false,
    code: 'API_ROUTE_NOT_FOUND',
    error: `Rota de API não encontrada: ${req.method} ${req.originalUrl}`,
  });
});

// Garantir que erros do Express/body-parser (JSON malformado ou exceções não tratadas em /api/*)
// sempre retornem JSON estruturado, nunca páginas HTML padrão do Express.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  const isApiRequest = req.originalUrl?.startsWith('/api') || req.path?.startsWith('/api');
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && (err as any).status === 400)) {
    return res.status(400).json({
      ok: false,
      success: false,
      code: 'INVALID_JSON_BODY',
      error: 'Corpo JSON da requisição é inválido ou malformado.',
    });
  }
  if (isApiRequest) {
    const statusCode =
      typeof err?.status === 'number' && err.status >= 400 && err.status < 600
        ? err.status
        : typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
          ? err.statusCode
          : 500;
    return res.status(statusCode).json({
      ok: false,
      success: false,
      code: err?.code || 'INTERNAL_SERVER_ERROR',
      error: err instanceof Error ? err.message : 'Erro interno no servidor de API.',
    });
  }
  return next(err);
});

// ==========================================
// VITE DEV SERVER / PRODUCTION STATIC SERVER
// ==========================================

async function startServer() {
  const distPath = path.resolve(__dirname, 'dist');
  const distIndexPath = path.resolve(distPath, 'index.html');
  const isRunningUnderTsx =
    process.execArgv.some((arg) => arg.includes('tsx')) ||
    Boolean(process.env.npm_lifecycle_event === 'dev');
  const hasBuiltDist = fs.existsSync(distIndexPath);
  const isProd =
    hasBuiltDist &&
    (process.env.NODE_ENV === 'production' || !isRunningUnderTsx);

  if (!isProd) {
    // Dev-only Service Worker & Workbox cache cleanup routes (prevents text/html MIME errors and evicts stale precached bundles in Preview)
    const devCleanupSwScript = [
      "self.addEventListener('install', function() { self.skipWaiting(); });",
      "self.addEventListener('activate', function(event) {",
      "  event.waitUntil(",
      "    caches.keys().then(function(keys) {",
      "      return Promise.all(keys.map(function(key) { return caches.delete(key); }));",
      "    }).then(function() {",
      "      return self.registration.unregister();",
      "    }).then(function() {",
      "      return self.clients.matchAll({ type: 'window' });",
      "    }).then(function(clients) {",
      "      clients.forEach(function(client) {",
      "        if ('navigate' in client) { client.navigate(client.url); }",
      "      });",
      "    })",
      "  );",
      "});",
    ].join('\n');

    const devRegisterSwCleanupScript = [
      "if ('serviceWorker' in navigator) {",
      "  navigator.serviceWorker.getRegistrations().then(function(regs) {",
      "    regs.forEach(function(r) { r.unregister(); });",
      "  }).catch(function() {});",
      "}",
      "if ('caches' in window) {",
      "  caches.keys().then(function(keys) {",
      "    keys.forEach(function(k) { caches.delete(k); });",
      "  }).catch(function() {});",
      "}",
    ].join('\n');

    app.get(['/sw.js', '/dev-sw.js'], (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
      res.status(200).send(devCleanupSwScript);
    });

    app.get('/registerSW.js', (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.status(200).send(devRegisterSwCleanupScript);
    });

    app.get('/manifest.webmanifest', (_req: Request, res: Response) => {
      const distManifest = path.resolve(distPath, 'manifest.webmanifest');
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      if (fs.existsSync(distManifest)) {
        res.sendFile(distManifest);
      } else {
        res.status(200).json({
          id: './',
          name: 'GIO DA SORTE',
          short_name: 'GIODASORTE',
          start_url: './',
          display: 'standalone',
          background_color: '#080A0F',
          theme_color: '#0131CD',
        });
      }
    });

    app.use((req: Request, res: Response, next) => {
      if (
        req.path === '/' ||
        req.path === '/index.html' ||
        req.path === '/logo.png' ||
        req.path === '/icon.svg' ||
        req.path === '/favicon.ico' ||
        req.path === '/apple-touch-icon.png' ||
        req.path.startsWith('/src/')
      ) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      }
      next();
    });

    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer },
        watch: {
          ignored: ['**/node_modules/**', '**/dist/**', '**/.backups/**', '**/.git/**'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndexPath)) {
        res.sendFile(distIndexPath);
      } else {
        res.status(503).send('Build artifact dist/index.html not found.');
      }
    });
  }

  httpServer.on('error', (err: any) => {
    console.error(`[GIO DA SORTE Server] Erro ao vincular servidor HTTP em ${HOST}:${PORT}:`, err);
    if (err && err.code === 'EADDRINUSE') {
      process.exit(1);
    }
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(
      `[GIO DA SORTE Server] Rodando em http://${HOST}:${PORT} (${isProd ? 'produção' : 'desenvolvimento'})`
    );
  });
}

export { app, httpServer };

if (isDirectServerEntry) {
  startServer().catch((err) => {
    console.error('[GIO DA SORTE Server] Erro fatal ao iniciar:', err);
    process.exitCode = 1;
  });
}
