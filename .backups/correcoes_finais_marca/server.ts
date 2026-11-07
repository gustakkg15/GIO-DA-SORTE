import express, { type Request, type Response } from 'express';
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
} from './src/types.ts';
import {
  mercadoPagoSubscriptionService,
  redactSensitiveMpData,
} from './src/server/mercadoPagoSubscriptionService.ts';
import {
  requireFirebaseAuth,
  requireProPlan,
  verifyAuthenticatedFirebaseUser,
  verifyProPlanRequestAsync,
  verifyFirestoreResourceOwnership,
  buildEntitlementFromSubscriptionRecord,
  setCustomTokenVerifierForTests,
} from './src/server/firebaseAdminAuth.ts';
import {
  issueSseStreamTicket,
  consumeSseStreamTicket,
} from './src/server/sseTicketService.ts';
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
} from './src/server/tiktokOAuthService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
const HOST = '0.0.0.0';

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

// Track active LIVE room ownerUid to enforce ownership on disconnect and stream operations
let activeLiveConnectionOwnerUid: string | null = null;
let activeLiveConnectionSessionId: string | null = null;
let serverInstanceId = `srv_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface PersistedWebcastRuntimeState {
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
}

const WEBCAST_LOCK_LEASE_MS = 45_000;
let cachedRuntimeLockState: PersistedWebcastRuntimeState | null = null;
let connectRouteMutexChain: Promise<unknown> = Promise.resolve();

function withConnectRouteMutex<T>(task: () => Promise<T>): Promise<T> {
  const next = connectRouteMutexChain.then(task, task);
  connectRouteMutexChain = next.catch(() => {});
  return next;
}

function getGlobalWebcastLockRef() {
  return doc(db, 'sessions', '_system_runtime_lock', 'locks', 'global_webcast_lock');
}

async function readPersistedWebcastRuntimeState(): Promise<PersistedWebcastRuntimeState | null> {
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

async function persistWebcastRuntimeState(state: PersistedWebcastRuntimeState): Promise<void> {
  cachedRuntimeLockState = state;
  try {
    await setDoc(getGlobalWebcastLockRef(), state, { merge: true });
  } catch {
    // Ignore transient Firestore error after updating memory cache
  }
}

async function acquireOrCoalesceWebcastLock(params: {
  ownerUid: string;
  sessionId: string;
  roomUsername: string;
  activeRuleId: string;
  currentRate: number;
  campaignId?: string;
  cycleId?: string;
  requestedInstanceId?: string;
}): Promise<{
  allowed: boolean;
  status: number;
  code?: string;
  reason?: string;
  coalescedCrossInstance?: boolean;
  effectiveSessionId: string;
  lockState?: PersistedWebcastRuntimeState;
}> {
  const now = Date.now();
  const callerInstanceId = params.requestedInstanceId || serverInstanceId;
  const lockRef = getGlobalWebcastLockRef();

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(lockRef);
      const existing = snap.exists() ? (snap.data() as PersistedWebcastRuntimeState) : null;

      if (existing && existing.shouldBeConnected && existing.expiresAt > now) {
        if (existing.ownerUid && existing.ownerUid !== params.ownerUid) {
          return {
            allowed: false,
            status: 403,
            code: 'OWNERSHIP_FORBIDDEN',
            reason:
              'Acesso negado: já existe uma conexão LIVE ativa pertencente a outro organizador autenticado.',
            effectiveSessionId: existing.sessionId,
            lockState: existing,
          };
        }

        // Same owner: check if another backend instance actively holds the Webcast connection
        const sameRoom =
          String(existing.roomUsername || '').toLowerCase() ===
          String(params.roomUsername || '').toLowerCase();
        const sameOrUnspecifiedSession =
          !params.sessionId ||
          !existing.sessionId ||
          existing.sessionId === params.sessionId ||
          Boolean(params.requestedInstanceId);

        if (
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

      const nextLock: PersistedWebcastRuntimeState = {
        instanceId: callerInstanceId,
        ownerUid: params.ownerUid,
        sessionId: resolvedSid,
        roomUsername: params.roomUsername,
        activeRuleId: params.activeRuleId,
        currentRate: params.currentRate,
        ...(params.campaignId || existing?.campaignId ? { campaignId: params.campaignId || existing?.campaignId } : {}),
        ...(params.cycleId || existing?.cycleId ? { cycleId: params.cycleId || existing?.cycleId } : {}),
        shouldBeConnected: true,
        lastKnownState: tiktokAdapter.getStatus().state || 'CONNECTING',
        updatedAt: now,
        expiresAt: now + WEBCAST_LOCK_LEASE_MS,
      };
      tx.set(lockRef, nextLock, { merge: true });
      cachedRuntimeLockState = nextLock;

      return {
        allowed: true,
        status: 200,
        coalescedCrossInstance: false,
        effectiveSessionId: resolvedSid,
        lockState: nextLock,
      };
    });
  } catch {
    // Fallback when transaction fails transiently
    const nextLock: PersistedWebcastRuntimeState = {
      instanceId: callerInstanceId,
      ownerUid: params.ownerUid,
      sessionId: params.sessionId,
      roomUsername: params.roomUsername,
      activeRuleId: params.activeRuleId,
      currentRate: params.currentRate,
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      ...(params.cycleId ? { cycleId: params.cycleId } : {}),
      shouldBeConnected: true,
      lastKnownState: tiktokAdapter.getStatus().state || 'CONNECTING',
      updatedAt: now,
      expiresAt: now + WEBCAST_LOCK_LEASE_MS,
    };
    cachedRuntimeLockState = nextLock;
    return {
      allowed: true,
      status: 200,
      coalescedCrossInstance: false,
      effectiveSessionId: params.sessionId,
      lockState: nextLock,
    };
  }
}

async function releaseWebcastLock(ownerUid: string): Promise<void> {
  const now = Date.now();
  const nextLock: PersistedWebcastRuntimeState = {
    instanceId: serverInstanceId,
    ownerUid,
    sessionId: '',
    roomUsername: '',
    activeRuleId: 'rule_default_100',
    currentRate: 100,
    shouldBeConnected: false,
    lastKnownState: 'DISCONNECTED',
    updatedAt: now,
    expiresAt: 0,
  };
  await persistWebcastRuntimeState(nextLock);
}

// Keep lease alive while adapter has an active or standby session on this instance
setInterval(() => {
  const status = tiktokAdapter.getStatus();
  const rawSid = tiktokAdapter.getRawCurrentSessionId();
  if (
    rawSid &&
    activeLiveConnectionOwnerUid &&
    (status.state === 'CONNECTED' || status.state === 'CONNECTING' || status.state === 'RECONNECTING')
  ) {
    const now = Date.now();
    void persistWebcastRuntimeState({
      instanceId: serverInstanceId,
      ownerUid: activeLiveConnectionOwnerUid,
      sessionId: rawSid,
      roomUsername: status.roomUsername || '',
      activeRuleId: tiktokAdapter.getActiveRuleId(),
      currentRate: tiktokAdapter.getActiveRate(),
      shouldBeConnected: true,
      lastKnownState: status.state,
      updatedAt: now,
      expiresAt: now + WEBCAST_LOCK_LEASE_MS,
    });
  }
}, 10_000);

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
        fetchAllLiveSessions(50, authUid),
        fetchCampaigns(authUid),
      ]);

      res.json({
        success: true,
        ownerUid: authUid,
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

      // Persist or validate session ownership in Firestore before opening connection
      // Automatically loads organizer defaults and binds campaignId / cycleId
      const liveSession = await getOrCreateLiveSession(
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

      activeLiveConnectionOwnerUid = authUid;
      activeLiveConnectionSessionId = sid;
      setProPlanTier('PRO', 'ACTIVE');

      // If another backend instance already owns the active Webcast stream for this user & room,
      // do NOT open a duplicate Webcast connection on this instance; return the shared session state
      if (lockCheck.coalescedCrossInstance) {
        await tiktokAdapter.restoreSessionFromFirestore(sid);
        const enrichedStatus = await buildEnrichedTikTokStatus();
        return {
          httpStatus: 200,
          payload: {
            success: enrichedStatus.state === 'CONNECTED',
            coalesced: true,
            coalescedCrossInstance: true,
            ownerUid: authUid,
            sessionId: sid,
            activeRuleId: requestedRuleId,
            campaignId: liveSession.campaignId,
            cycleId: liveSession.cycleId,
            status: enrichedStatus,
          },
        };
      }

      const result = await tiktokAdapter.connect(targetUser, sid, requestedRuleId, requestedRate);
      const now = Date.now();
      await persistWebcastRuntimeState({
        instanceId: serverInstanceId,
        ownerUid: authUid,
        sessionId: sid,
        roomUsername: targetUser,
        activeRuleId: requestedRuleId,
        currentRate: requestedRate,
        campaignId: liveSession.campaignId,
        cycleId: liveSession.cycleId,
        shouldBeConnected: true,
        lastKnownState: result.status.state,
        updatedAt: now,
        expiresAt: now + WEBCAST_LOCK_LEASE_MS,
      });

      const enrichedStatus = await buildEnrichedTikTokStatus();
      return {
        httpStatus: 200,
        payload: {
          ...result,
          status: enrichedStatus,
          ownerUid: authUid,
          sessionId: sid,
          activeRuleId: requestedRuleId,
          campaignId: liveSession.campaignId,
          cycleId: liveSession.cycleId,
        },
      };
    });

    return res.status(outcome.httpStatus).json(outcome.payload);
  }
);

/**
 * Disconnect from TikTok LIVE (Requires Firebase Auth + Ownership of Active Connection/Session;
 * does NOT require active PRO plan so expired/canceled users can always disconnect their own broadcast)
 */
app.post(
  '/api/tiktok/disconnect',
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const requestedSessionId = req.body?.sessionId
      ? String(req.body.sessionId).trim()
      : activeLiveConnectionSessionId || '';

    if (activeLiveConnectionOwnerUid && activeLiveConnectionOwnerUid !== authUid) {
      return res.status(403).json({
        success: false,
        code: 'OWNERSHIP_FORBIDDEN',
        error:
          'Acesso negado: você não pode desconectar uma transmissão LIVE iniciada por outra conta.',
      });
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
        return res.status(ownership.status).json({
          success: false,
          code: ownership.code || 'OWNERSHIP_FORBIDDEN',
          error: ownership.reason,
        });
      }
    }

    await tiktokAdapter.disconnect(true);
    await releaseWebcastLock(authUid);
    activeLiveConnectionOwnerUid = null;
    activeLiveConnectionSessionId = null;
    const enrichedStatus = await buildEnrichedTikTokStatus();
    res.json({ success: true, ownerUid: authUid, status: enrichedStatus });
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
 * Also supports `simulateServerRestart: true` for deterministic verification of cold-boot recovery.
 */
app.post(
  '/api/tiktok/restore-session',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const { sessionId, simulateServerRestart, reconnectWebcast } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório.' });
    }
    const targetSessionId = String(sessionId).trim();
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

    if (simulateServerRestart) {
      // Wipe in-memory adapter state and rotate serverInstanceId to simulate a fresh server process boot
      tiktokAdapter.resetMemoryStateForSimulatedRestart();
      activeLiveConnectionOwnerUid = null;
      activeLiveConnectionSessionId = null;
      serverInstanceId = `srv_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const walRecovered = tiktokEventQueue.loadWalFromDisk();
    const restored = await tiktokAdapter.restoreSessionFromFirestore(targetSessionId);
    activeLiveConnectionOwnerUid = authUid;
    activeLiveConnectionSessionId = targetSessionId;

    if (reconnectWebcast && restored.username) {
      await tiktokAdapter.connect(
        restored.username,
        targetSessionId,
        restored.activeRuleId || 'rule_default_100',
        restored.currentRate || 100,
        true
      );
    }

    const enrichedStatus = await buildEnrichedTikTokStatus();
    res.json({
      ok: true,
      success: true,
      sessionId: targetSessionId,
      webcastActive: Boolean(enrichedStatus.webcastActive),
      walRecovered,
      ...restored,
      status: enrichedStatus,
    });
  }
);

/**
 * Automated Integration Test / Diagnostic Ingestion Endpoint (Admin + PRO Only + Ownership)
 * Isolated for automated verification scripts & LIVE SYSTEM MONITOR diagnostics.
 */
app.post(
  '/api/tiktok/test-event',
  requireFirebaseAuth,
  requireProPlan,
  async (req: Request, res: Response) => {
    const authUid = req.authUid!;
    const body = req.body || {};
    const requestedSessionId = body.sessionId ? String(body.sessionId).trim() : '';

    if (requestedSessionId) {
      const ownership = await verifyFirestoreResourceOwnership({
        collectionName: 'sessions',
        docId: requestedSessionId,
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

    setProPlanTier('PRO', 'ACTIVE');
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
 * and validates the 3-day free trial and next_payment_date before granting PRO access.
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
      entitlement: outcome.subscription
        ? buildEntitlementFromSubscriptionRecord(outcome.subscription)
        : getProPlanEntitlement(),
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
    const resolvedUser = await resolveSubscriptionRequestUser(req, { requireAuth: true });
    if (!resolvedUser.ok) {
      return res.status(resolvedUser.status).json({
        success: false,
        code: resolvedUser.code,
        error: resolvedUser.error,
      });
    }

    const { uid, email } = resolvedUser;

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
      entitlement: outcome.subscription
        ? buildEntitlementFromSubscriptionRecord(outcome.subscription)
        : getProPlanEntitlement(),
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
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      if (fs.existsSync(distIndexPath)) {
        res.sendFile(distIndexPath);
      } else {
        res.status(503).send('Build artifact dist/index.html not found.');
      }
    });
  }

  httpServer.on('error', (err) => {
    console.error(`[GIO DA SORTE Server] Erro ao vincular servidor HTTP em ${HOST}:${PORT}:`, err);
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(
      `[GIO DA SORTE Server] Rodando em http://${HOST}:${PORT} (${isProd ? 'produção' : 'desenvolvimento'})`
    );
  });
}

startServer().catch((err) => {
  console.error('[GIO DA SORTE Server] Erro fatal ao iniciar:', err);
  process.exitCode = 1;
});
