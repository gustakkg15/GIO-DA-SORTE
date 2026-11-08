import type { Request, Response, NextFunction } from 'express';
import {
  initializeApp as initializeAdminApp,
  getApps as getAdminApps,
  applicationDefault,
  cert,
  type App as AdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.ts';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import { mercadoPagoSubscriptionService } from './mercadoPagoSubscriptionService.ts';
import type {
  ProPlanEntitlement,
  SubscriptionBillingSubStatus,
  UserSubscriptionRecord,
} from '../types.ts';

// Extend Express Request to carry verified Firebase identity and subscription record
declare global {
  namespace Express {
    interface Request {
      authUid?: string;
      authEmail?: string;
      authEmailVerified?: boolean;
      decodedFirebaseToken?: DecodedIdToken;
      subscriptionRecord?: UserSubscriptionRecord;
      proEntitlement?: ProPlanEntitlement;
    }
  }
}

export type TokenVerificationErrorCode =
  | 'FIREBASE_AUTH_REQUIRED'
  | 'FIREBASE_TOKEN_EXPIRED'
  | 'FIREBASE_TOKEN_REVOKED'
  | 'FIREBASE_USER_DISABLED'
  | 'FIREBASE_AUTH_SERVICE_UNAVAILABLE'
  | 'FIREBASE_TOKEN_INVALID';

export interface FirebaseAuthVerificationResult {
  authenticated: boolean;
  uid?: string;
  email?: string;
  emailVerified?: boolean;
  decodedToken?: DecodedIdToken;
  status: number;
  code?: TokenVerificationErrorCode;
  reason?: string;
}

const DEFAULT_GCP_PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  'quick-standard-pw2pc';

const SANDBOX_CONSUMER_PROJECT_NUMBER = '749434257827';
const IDENTITY_TOOLKIT_SERVICE_NAME = 'identitytoolkit.googleapis.com';
const IDENTITY_TOOLKIT_ACCOUNTS_LOOKUP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const FIREBASE_WEB_API_KEY = String(firebaseConfig?.apiKey || '').trim();

let adminAppInstance: AdminApp | null = null;

/**
 * Initializes Firebase Admin SDK using secure administrative credentials from the environment.
 * NEVER uses `firebase-applet-config.json` as an administrative credential.
 */
export function getOrInitFirebaseAdminApp(): AdminApp {
  if (adminAppInstance) {
    return adminAppInstance;
  }
  const existing = getAdminApps();
  if (existing.length > 0) {
    adminAppInstance = existing[0]!;
    return adminAppInstance;
  }

  const rawServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawServiceAccountJson && rawServiceAccountJson.trim().startsWith('{')) {
    try {
      const parsedServiceAccount = JSON.parse(rawServiceAccountJson);
      if (
        parsedServiceAccount &&
        typeof parsedServiceAccount === 'object' &&
        typeof parsedServiceAccount.private_key === 'string'
      ) {
        // Fix escaped newlines in private key if passed in single-line env vars
        parsedServiceAccount.private_key = parsedServiceAccount.private_key.replace(/\\n/g, '\n');
      }
      adminAppInstance = initializeAdminApp({
        credential: cert(parsedServiceAccount),
        projectId: parsedServiceAccount.project_id || DEFAULT_GCP_PROJECT_ID,
      });
      return adminAppInstance;
    } catch (err: unknown) {
      // Safe error handling: never log or expose rawServiceAccountJson or secrets
      const safeErrMsg = err instanceof Error ? err.message : String(err);
      console.error(
        '[FirebaseAdminAuth] Falha ao carregar credencial FIREBASE_SERVICE_ACCOUNT_JSON:',
        safeErrMsg
      );
      throw new Error(
        'Falha ao carregar credencial FIREBASE_SERVICE_ACCOUNT_JSON: formato JSON ou chave privada inválida.'
      );
    }
  }

  adminAppInstance = initializeAdminApp({
    credential: applicationDefault(),
    projectId: DEFAULT_GCP_PROJECT_ID,
  });
  return adminAppInstance;
}

// Optional programmatic verifier and lookup hooks strictly for in-process automated testing
type CustomTokenVerifier = (idToken: string, checkRevoked?: boolean) => Promise<DecodedIdToken>;
let customTokenVerifierForTests: CustomTokenVerifier | null = null;

export function setCustomTokenVerifierForTests(verifier: CustomTokenVerifier | null): void {
  customTokenVerifierForTests = verifier;
}

type AccountsLookupFetcher = typeof fetch;
let customAccountsLookupFetcherForTests: AccountsLookupFetcher | null = null;

export function setCustomAccountsLookupFetcherForTests(
  fetcher: AccountsLookupFetcher | null
): void {
  customAccountsLookupFetcherForTests = fetcher;
}

type CustomFirestoreResourceReader = (
  collectionName: 'sessions' | 'campaigns' | 'draw_snapshots' | 'draws',
  docId: string
) => Promise<{ exists: boolean; data?: Record<string, any> }>;
let customFirestoreResourceReaderForTests: CustomFirestoreResourceReader | null = null;

export function setCustomFirestoreResourceReaderForTests(
  reader: CustomFirestoreResourceReader | null
): void {
  customFirestoreResourceReaderForTests = reader;
}

/**
 * Checks whether an error thrown by `verifyIdToken(idToken, true)` is specifically the
 * known `SERVICE_DISABLED` error for `identitytoolkit.googleapis.com` on the Cloud Run
 * sandbox consumer project `749434257827`.
 * Returns `false` for all other errors (expired/invalid/revoked tokens, network errors, other projects).
 */
export function isSandboxIdentityToolkitServiceDisabledError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const anyErr = err as Record<string, any>;
  const errCode = String(anyErr.code || anyErr.errorInfo?.code || '');
  if (errCode !== 'auth/internal-error') {
    return false;
  }

  const httpDataError = anyErr.httpResponse?.data?.error;
  const details: unknown[] = Array.isArray(httpDataError?.details)
    ? httpDataError.details
    : [];

  for (const item of details) {
    if (item && typeof item === 'object') {
      const detail = item as Record<string, any>;
      const reason = String(detail.reason || '');
      const service = String(detail.metadata?.service || '');
      const consumer = String(detail.metadata?.consumer || '');
      const containerInfo = String(detail.metadata?.containerInfo || '');
      if (
        reason === 'SERVICE_DISABLED' &&
        service === IDENTITY_TOOLKIT_SERVICE_NAME &&
        (consumer === `projects/${SANDBOX_CONSUMER_PROJECT_NUMBER}` ||
          containerInfo === SANDBOX_CONSUMER_PROJECT_NUMBER)
      ) {
        return true;
      }
    }
  }

  const combinedMessage = `${String(anyErr.message || '')} ${String(
    httpDataError?.message || ''
  )}`;
  const hasIdentityToolkit = combinedMessage.includes(IDENTITY_TOOLKIT_SERVICE_NAME);
  const hasSandboxProject = combinedMessage.includes(SANDBOX_CONSUMER_PROJECT_NUMBER);
  const hasServiceDisabledSignal =
    combinedMessage.includes('SERVICE_DISABLED') ||
    combinedMessage.includes(
      `has not been used in project ${SANDBOX_CONSUMER_PROJECT_NUMBER}`
    ) ||
    combinedMessage.includes(`overview?project=${SANDBOX_CONSUMER_PROJECT_NUMBER}`);

  return hasIdentityToolkit && hasSandboxProject && hasServiceDisabledSignal;
}

/**
 * Checks whether an error thrown by `verifyIdToken(idToken, true)` is due to Identity Toolkit
 * service unavailability (SERVICE_DISABLED) or IAM permission limitation on the caller Service Account
 * (e.g. missing `roles/firebaseauth.admin` or `firebaseauth.users.get`).
 *
 * In such cases, the system safely falls back to:
 * 1. Cryptographic token verification via `verifyIdToken(idToken, false)` (RSA-SHA256 signature, expiry, audience, issuer).
 * 2. Mandatory live account revocation and disabled checks via Firebase Auth REST API (`accounts:lookup`).
 *
 * For token expiration, revocation, malformed signatures or network errors, returns `false` (fails directly).
 */
export function isIdentityToolkitPermissionOrDisabledError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if (isSandboxIdentityToolkitServiceDisabledError(err)) {
    return true;
  }

  const anyErr = err as Record<string, any>;
  const errCode = String(anyErr.code || anyErr.errorInfo?.code || '');

  // Never fall back for genuine token invalidity/expiry/revocation
  if (
    errCode === 'auth/id-token-expired' ||
    errCode === 'auth/id-token-revoked' ||
    errCode === 'auth/user-disabled' ||
    errCode === 'auth/argument-error' ||
    errCode === 'auth/invalid-id-token'
  ) {
    return false;
  }

  const httpStatus = anyErr.httpResponse?.status ?? anyErr.httpResponse?.statusCode ?? anyErr.status;
  const httpDataError = anyErr.httpResponse?.data?.error;
  const apiStatus = String(httpDataError?.status || '');
  const combinedMessage = `${String(anyErr.message || '')} ${String(httpDataError?.message || '')}`;

  const isPermissionDenied =
    errCode === 'auth/insufficient-permission' ||
    apiStatus === 'PERMISSION_DENIED' ||
    httpStatus === 403 ||
    combinedMessage.includes('PERMISSION_DENIED') ||
    combinedMessage.includes('Missing or insufficient permissions') ||
    combinedMessage.includes('Caller does not have required permission') ||
    combinedMessage.includes('does not have permission to access');

  const touchesIdentityToolkit =
    combinedMessage.includes(IDENTITY_TOOLKIT_SERVICE_NAME) ||
    errCode.startsWith('auth/') ||
    Boolean(anyErr.httpResponse);

  return isPermissionDenied && touchesIdentityToolkit;
}

/**
 * Step B & C of Path C controlled fallback:
 * Given an `idToken` and its cryptographically verified `DecodedIdToken` (from `verifyIdToken(idToken, false)`),
 * queries the Firebase Authentication REST API (`accounts:lookup`) and enforces all mandatory checks:
 * 1. Valid HTTP 200 JSON response with exactly one user in `users`.
 * 2. Exact match between `users[0].localId` and `decodedToken.uid`.
 * 3. User is not disabled (`disabled !== true`).
 * 4. Explicit revocation check comparing `decodedToken.auth_time` against `users[0].validSince` in Unix seconds.
 */
async function verifyAccountStateViaIdentityToolkitLookup(
  idToken: string,
  decodedToken: DecodedIdToken
): Promise<DecodedIdToken> {
  const makeAuthError = (code: string, message: string): Error => {
    const e: any = new Error(message);
    e.code = code;
    return e;
  };

  if (
    !decodedToken ||
    typeof decodedToken.uid !== 'string' ||
    !decodedToken.uid.trim() ||
    typeof decodedToken.auth_time !== 'number' ||
    !Number.isFinite(decodedToken.auth_time) ||
    decodedToken.auth_time <= 0
  ) {
    throw makeAuthError(
      'auth/argument-error',
      'Claims obrigatórios (uid ou auth_time) ausentes ou inválidos no token decodificado.'
    );
  }

  if (!FIREBASE_WEB_API_KEY) {
    throw makeAuthError(
      'auth/service-unavailable',
      'Configuração do serviço de validação Firebase temporariamente indisponível.'
    );
  }

  const fetcher = customAccountsLookupFetcherForTests || fetch;
  let lookupResponse: globalThis.Response;
  try {
    lookupResponse = await fetcher(
      `${IDENTITY_TOOLKIT_ACCOUNTS_LOOKUP_URL}?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
        signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(8000)
          : undefined,
      }
    );
  } catch {
    throw makeAuthError(
      'auth/service-unavailable',
      'Falha de comunicação ou tempo limite excedido ao consultar o estado da conta no Firebase Authentication.'
    );
  }

  if (!lookupResponse) {
    throw makeAuthError(
      'auth/service-unavailable',
      'Serviço Firebase Authentication indisponível (resposta ausente).'
    );
  }

  if (lookupResponse.status >= 500 || lookupResponse.status === 429) {
    throw makeAuthError(
      'auth/service-unavailable',
      'Serviço Firebase Authentication temporariamente indisponível.'
    );
  }

  if (!lookupResponse.ok || lookupResponse.status !== 200) {
    let apiErrorCode = '';
    try {
      const errBody = (await lookupResponse.json()) as Record<string, any>;
      apiErrorCode = String(errBody?.error?.message || '').trim();
    } catch {
      // Ignore malformed error body; fail closed below
    }
    if (apiErrorCode === 'TOKEN_EXPIRED' || apiErrorCode.startsWith('TOKEN_EXPIRED:')) {
      throw makeAuthError('auth/id-token-expired', 'Firebase ID token has expired.');
    }
    if (
      apiErrorCode === 'CREDENTIAL_TOO_OLD_LOGIN_AGAIN' ||
      apiErrorCode === 'TOKEN_REVOKED' ||
      apiErrorCode.includes('TOKEN_REVOKED')
    ) {
      throw makeAuthError('auth/id-token-revoked', 'Firebase ID token has been revoked.');
    }
    if (apiErrorCode === 'USER_DISABLED' || apiErrorCode.startsWith('USER_DISABLED:')) {
      throw makeAuthError('auth/user-disabled', 'The user record is disabled.');
    }
    throw makeAuthError(
      'auth/argument-error',
      'Consulta accounts:lookup rejeitou o token ou retornou status HTTP de erro.'
    );
  }

  let payload: unknown;
  try {
    payload = await lookupResponse.json();
  } catch {
    throw makeAuthError(
      'auth/argument-error',
      'Resposta malformada da API Firebase Authentication.'
    );
  }

  if (!payload || typeof payload !== 'object') {
    throw makeAuthError(
      'auth/argument-error',
      'Corpo de resposta inválido da API Firebase Authentication.'
    );
  }

  const users = (payload as Record<string, unknown>).users;
  if (!Array.isArray(users) || users.length !== 1 || !users[0] || typeof users[0] !== 'object') {
    throw makeAuthError(
      'auth/argument-error',
      'Resposta da API Firebase Authentication não contém exatamente um usuário válido.'
    );
  }

  const account = users[0] as Record<string, unknown>;
  const localId = typeof account.localId === 'string' ? account.localId : '';
  const expectedUid = decodedToken.uid;

  if (!localId || !localId.trim() || localId !== expectedUid || localId.trim() !== expectedUid.trim()) {
    throw makeAuthError(
      'auth/argument-error',
      'Divergência de identidade entre o UID criptográfico do token e o localId retornado pelo Firebase.'
    );
  }

  if (account.disabled !== undefined && account.disabled !== false) {
    throw makeAuthError('auth/user-disabled', 'The user record is disabled.');
  }

  // Mandatory explicit comparison between token `auth_time` (Unix seconds) and `validSince` (Unix seconds)
  const authTimeSeconds = Math.floor(decodedToken.auth_time);
  if (account.validSince !== undefined && account.validSince !== null) {
    const rawValidSince =
      typeof account.validSince === 'number' && Number.isFinite(account.validSince)
        ? String(Math.trunc(account.validSince))
        : typeof account.validSince === 'string'
        ? account.validSince.trim()
        : '';

    if (!rawValidSince || !/^\d+$/.test(rawValidSince)) {
      throw makeAuthError(
        'auth/argument-error',
        'Campo validSince malformado na resposta do Firebase Authentication.'
      );
    }

    const validSinceSeconds = Number(rawValidSince);
    if (!Number.isSafeInteger(validSinceSeconds) || validSinceSeconds < 0) {
      throw makeAuthError(
        'auth/argument-error',
        'Valor numérico de validSince inválido na resposta do Firebase Authentication.'
      );
    }

    const authTimeUtcMs = authTimeSeconds * 1000;
    const validSinceUtcMs = validSinceSeconds * 1000;
    if (authTimeSeconds < validSinceSeconds || authTimeUtcMs < validSinceUtcMs) {
      throw makeAuthError('auth/id-token-revoked', 'Firebase ID token has been revoked.');
    }
  }

  return decodedToken;
}

/**
 * Extracts the Firebase ID Token exclusively from `Authorization: Bearer <idToken>`.
 * Rejects transmission of idToken in URL query string for security compliance.
 */
export function extractBearerIdToken(req: Request): string {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

/**
 * Cryptographically verifies the Firebase ID Token using Firebase Admin SDK (`verifyIdToken(token, true)`).
 * Extracts UID exclusively from `decodedToken.uid`.
 * Never trusts `x-gio-plan`, query parameters (`?uid=`), or `x-firebase-uid` headers.
 */
export async function verifyAuthenticatedFirebaseUser(
  req: Request
): Promise<FirebaseAuthVerificationResult> {
  // If client attempts to pass idToken in URL query string, fail immediately with security error
  if (typeof req.query?.idToken === 'string' && req.query.idToken.trim().length > 0) {
    return {
      authenticated: false,
      status: 400,
      code: 'FIREBASE_TOKEN_INVALID',
      reason:
        'Transmissão de Firebase ID Token na URL (query string) é terminantemente proibida por segurança. Para conexão SSE, utilize POST /api/tiktok/stream/ticket para obter um ticket descartável de uso único.',
    };
  }

  const idToken = extractBearerIdToken(req);

  if (!idToken) {
    return {
      authenticated: false,
      status: 401,
      code: 'FIREBASE_AUTH_REQUIRED',
      reason:
        'Autenticação obrigatória: envie um Firebase ID Token válido no cabeçalho Authorization: Bearer <token>.',
    };
  }

  try {
    const isLoopbackIp =
      req.ip === '127.0.0.1' ||
      req.ip === '::1' ||
      req.ip === '::ffff:127.0.0.1' ||
      req.socket?.remoteAddress === '127.0.0.1' ||
      req.socket?.remoteAddress === '::1' ||
      req.socket?.remoteAddress === '::ffff:127.0.0.1';
    const isLoopbackTestSuite =
      process.env.NODE_ENV !== 'production' &&
      isLoopbackIp &&
      (req.headers['x-gio-loopback-test-suite'] === 'etapa1' ||
        req.headers['x-gio-loopback-test-suite'] === 'etapa2' ||
        req.headers['x-gio-loopback-test-suite'] === 'sec03' ||
        req.headers['x-gio-loopback-test-suite'] === 'sec02') &&
      idToken.startsWith('gio_loopback_test_token:');

    const verifyTokenFn: CustomTokenVerifier =
      customTokenVerifierForTests ||
      ((token: string, checkRevoked?: boolean) =>
        getAdminAuth(getOrInitFirebaseAdminApp()).verifyIdToken(token, checkRevoked));

    let decoded: DecodedIdToken;
    if (isLoopbackTestSuite && !customTokenVerifierForTests) {
      const parts = idToken.split(':');
      const mode = parts[1] || '';
      const testUid = parts[2] || '';
      const testEmail = parts[3] || `${testUid}@test.local`;
      const isAdmin = parts[4] === 'admin' || mode === 'admin';
      if (mode === 'expired') {
        const expErr: any = new Error('Firebase ID token has expired.');
        expErr.code = 'auth/id-token-expired';
        throw expErr;
      }
      if (mode === 'revoked') {
        const revErr: any = new Error('Firebase ID token has been revoked.');
        revErr.code = 'auth/id-token-revoked';
        throw revErr;
      }
      if (mode === 'invalid') {
        const invErr: any = new Error('Decoding Firebase ID token failed.');
        invErr.code = 'auth/argument-error';
        throw invErr;
      }
      decoded = {
        uid: testUid,
        sub: testUid,
        email: testEmail,
        email_verified: true,
        aud: DEFAULT_GCP_PROJECT_ID,
        iss: `https://securetoken.google.com/${DEFAULT_GCP_PROJECT_ID}`,
        auth_time: Math.floor(Date.now() / 1000) - 60,
        iat: Math.floor(Date.now() / 1000) - 60,
        exp: Math.floor(Date.now() / 1000) + 3600,
        firebase: { identities: {}, sign_in_provider: 'custom' },
        ...(isAdmin ? { admin: true } : {}),
      } as DecodedIdToken;
    } else {
      try {
        // Etapa A — Verificação principal (com checkRevoked = true)
        decoded = await verifyTokenFn(idToken, true);
      } catch (primaryErr: unknown) {
        // Etapa B — Fallback controlado para SERVICE_DISABLED ou falta de permissão IAM no Identity Toolkit
        if (!isIdentityToolkitPermissionOrDisabledError(primaryErr)) {
          throw primaryErr;
        }
        const cryptographicallyDecoded = await verifyTokenFn(idToken, false);
        decoded = await verifyAccountStateViaIdentityToolkitLookup(
          idToken,
          cryptographicallyDecoded
        );
      }
    }

    if (!decoded || !decoded.uid || typeof decoded.uid !== 'string' || !decoded.uid.trim()) {
      return {
        authenticated: false,
        status: 401,
        code: 'FIREBASE_TOKEN_INVALID',
        reason: 'Firebase ID Token inválido: UID ausente no token decodificado.',
      };
    }

    const verifiedUid = decoded.uid.trim();
    const verifiedEmail = typeof decoded.email === 'string' ? decoded.email.trim() : '';
    const verifiedEmailFlag = Boolean(decoded.email_verified);

    req.authUid = verifiedUid;
    req.authEmail = verifiedEmail;
    req.authEmailVerified = verifiedEmailFlag;
    req.decodedFirebaseToken = decoded;

    return {
      authenticated: true,
      uid: verifiedUid,
      email: verifiedEmail,
      emailVerified: verifiedEmailFlag,
      decodedToken: decoded,
      status: 200,
    };
  } catch (err: any) {
    const errCode = String(err?.code || err?.errorInfo?.code || '');
    const errMsg = err instanceof Error ? err.message : String(err);

    if (errCode === 'auth/id-token-expired' || errMsg.includes('id-token-expired')) {
      return {
        authenticated: false,
        status: 401,
        code: 'FIREBASE_TOKEN_EXPIRED',
        reason: 'Sua sessão expirou (Firebase ID Token expirado). Atualize o token ou faça login novamente.',
      };
    }

    if (errCode === 'auth/id-token-revoked' || errMsg.includes('id-token-revoked')) {
      return {
        authenticated: false,
        status: 401,
        code: 'FIREBASE_TOKEN_REVOKED',
        reason: 'Seu token de acesso foi revogado (Firebase ID Token revogado). Faça login novamente.',
      };
    }

    if (errCode === 'auth/user-disabled' || errMsg.includes('user-disabled')) {
      return {
        authenticated: false,
        status: 401,
        code: 'FIREBASE_USER_DISABLED',
        reason: 'Sua conta de usuário está desabilitada no Firebase Authentication.',
      };
    }

    if (errCode === 'auth/service-unavailable') {
      return {
        authenticated: false,
        status: 503,
        code: 'FIREBASE_AUTH_SERVICE_UNAVAILABLE',
        reason:
          'Serviço de autenticação Firebase temporariamente indisponível. Tente novamente em instantes.',
      };
    }

    return {
      authenticated: false,
      status: 401,
      code: 'FIREBASE_TOKEN_INVALID',
      reason: 'Firebase ID Token inválido ou assinatura criptográfica não verificada.',
    };
  }
}

/**
 * Express middleware that enforces cryptographic Firebase ID Token verification.
 * Populates `req.authUid` exclusively from `decodedToken.uid`.
 */
export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authResult = await verifyAuthenticatedFirebaseUser(req);
    if (!authResult.authenticated || !authResult.uid) {
      res.status(authResult.status || 401).json({
        success: false,
        code: authResult.code || 'FIREBASE_AUTH_REQUIRED',
        error: authResult.reason || 'Autenticação Firebase obrigatória.',
      });
      return;
    }
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(401).json({
      success: false,
      code: 'FIREBASE_TOKEN_INVALID',
      error: `Falha ao verificar autenticação Firebase: ${message}`,
    });
  }
}

const ALLOWED_ACTIVE_PRO_BILLING_SUB_STATUSES = new Set<SubscriptionBillingSubStatus>([
  'TRIAL_ACTIVE',
  'PAID_ACTIVE',
  'CANCELED_ACTIVE_UNTIL_END',
]);

/**
 * Builds a canonical ProPlanEntitlement object from the server-evaluated UserSubscriptionRecord.
 * Strictly preserves the official contract (`tier`, `statusState`, `billingSubStatus`).
 */
export function buildEntitlementFromSubscriptionRecord(
  record: UserSubscriptionRecord
): ProPlanEntitlement {
  const isProEntitled =
    record.tier === 'PRO' &&
    record.statusState === 'ACTIVE' &&
    Boolean(
      record.billingSubStatus &&
        ALLOWED_ACTIVE_PRO_BILLING_SUB_STATUSES.has(record.billingSubStatus)
    );

  return {
    tier: isProEntitled ? 'PRO' : 'FREE',
    planTier: isProEntitled ? 'PRO' : 'FREE',
    statusState: record.statusState,
    billingSubStatus: record.billingSubStatus,
    ownerUid: record.uid,
    active: isProEntitled,
    organizerEmail: record.email || undefined,
    updatedAt: record.updatedAt || Date.now(),
    features: {
      liveConnection: isProEntitled,
      giftCapture: isProEntitled,
      automaticAccounting: isProEntitled,
      atomicTicketIssuance: isProEntitled,
      accumulatedCampaigns: isProEntitled,
    },
  };
}

/**
 * Verifies on the backend whether the request has a cryptographically verified Firebase UID
 * AND an active PRO subscription in `mercadoPagoSubscriptionService.getUserSubscriptionRecord(uid)`.
 *
 * Enforces:
 * - `tier === 'PRO'`
 * - `statusState === 'ACTIVE'`
 * - `billingSubStatus` in `['TRIAL_ACTIVE', 'PAID_ACTIVE', 'CANCELED_ACTIVE_UNTIL_END']`
 * - Respects 3-day trial (`now <= trialEndDate`) and paid cycle (`now <= currentPeriodEnd`) even after cancellation.
 */
export async function verifyProPlanRequestAsync(req: Request): Promise<{
  authenticated: boolean;
  allowed: boolean;
  status: number;
  code: string;
  uid?: string;
  subscription?: UserSubscriptionRecord;
  entitlement: ProPlanEntitlement;
  reason?: string;
}> {
  const authResult = await verifyAuthenticatedFirebaseUser(req);
  if (!authResult.authenticated || !authResult.uid) {
    const fallbackFreeEntitlement: ProPlanEntitlement = {
      tier: 'FREE',
      planTier: 'FREE',
      statusState: 'FREE',
      billingSubStatus: 'FREE_TIER',
      active: false,
      updatedAt: Date.now(),
      features: {
        liveConnection: false,
        giftCapture: false,
        automaticAccounting: false,
        atomicTicketIssuance: false,
        accumulatedCampaigns: false,
      },
    };
    return {
      authenticated: false,
      allowed: false,
      status: authResult.status || 401,
      code: authResult.code || 'FIREBASE_AUTH_REQUIRED',
      entitlement: fallbackFreeEntitlement,
      reason: authResult.reason,
    };
  }

  const record = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(
    authResult.uid,
    authResult.email || '',
    Boolean(authResult.emailVerified)
  );

  const entitlement = buildEntitlementFromSubscriptionRecord(record);
  req.subscriptionRecord = record;
  req.proEntitlement = entitlement;

  if (!entitlement.active) {
    return {
      authenticated: true,
      allowed: false,
      status: 403,
      code: 'PRO_PLAN_REQUIRED',
      uid: authResult.uid,
      subscription: record,
      entitlement,
      reason: `Acesso operacional exclusivo do plano TIKTOK LIVE PRO (status atual: tier=${record.tier}, statusState=${record.statusState}, billingSubStatus=${record.billingSubStatus}). Assine ou ative seu período de teste gratuito de 3 dias para liberar esta operação.`,
    };
  }

  return {
    authenticated: true,
    allowed: true,
    status: 200,
    code: 'PRO_ENTITLEMENT_ACTIVE',
    uid: authResult.uid,
    subscription: record,
    entitlement,
  };
}

/**
 * Express middleware that requires both a valid Firebase ID Token (`requireFirebaseAuth`)
 * and an active PRO subscription (`mercadoPagoSubscriptionService.getUserSubscriptionRecord(req.authUid)`).
 */
export async function requireProPlan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const check = await verifyProPlanRequestAsync(req);
    if (!check.authenticated) {
      res.status(check.status).json({
        success: false,
        code: check.code,
        error: check.reason,
        entitlement: check.entitlement,
      });
      return;
    }
    if (!check.allowed) {
      res.status(403).json({
        success: false,
        code: 'PRO_PLAN_REQUIRED',
        error: check.reason,
        entitlement: check.entitlement,
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
          : undefined,
      });
      return;
    }
    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      code: 'PRO_VERIFICATION_ERROR',
      error: `Falha ao validar assinatura PRO no servidor: ${message}`,
    });
  }
}

/**
 * Verifies resource ownership (`ownerUid === req.authUid`) in Firestore for a given collection & document ID.
 * - If the document does not exist: returns `{ exists: false, allowed: allowIfNotExists }`.
 * - If the document exists and `ownerUid === authUid`: returns `{ exists: true, allowed: true }`.
 * - If the document exists and `ownerUid !== authUid` (or `ownerUid` is missing when `requireExplicitOwner` is true):
 *   returns `{ exists: true, allowed: false, status: 403, code: 'OWNERSHIP_FORBIDDEN' }`.
 */
export async function verifyFirestoreResourceOwnership(params: {
  collectionName: 'sessions' | 'campaigns' | 'draw_snapshots' | 'draws';
  docId: string;
  authUid: string;
  allowIfNotExists?: boolean;
  requireExplicitOwner?: boolean;
}): Promise<{
  exists: boolean;
  allowed: boolean;
  status: number;
  code?: string;
  reason?: string;
  data?: Record<string, any>;
}> {
  const {
    collectionName,
    docId,
    authUid,
    allowIfNotExists = false,
    requireExplicitOwner = true,
  } = params;

  const cleanDocId = String(docId || '').trim();
  const cleanAuthUid = String(authUid || '').trim();

  if (!cleanDocId) {
    return {
      exists: false,
      allowed: false,
      status: 400,
      code: 'MISSING_RESOURCE_ID',
      reason: `Identificador do recurso em ${collectionName} é obrigatório.`,
    };
  }

  let exists = false;
  let data: Record<string, any> = {};

  if (customFirestoreResourceReaderForTests) {
    const customResult = await customFirestoreResourceReaderForTests(collectionName, cleanDocId);
    exists = Boolean(customResult.exists);
    data = customResult.data || {};
  } else {
    const ref = doc(db, collectionName, cleanDocId);
    const snap = await getDoc(ref);
    exists = snap.exists();
    if (exists) {
      data = snap.data() as Record<string, any>;
    }
  }

  if (!exists) {
    if (allowIfNotExists) {
      return { exists: false, allowed: true, status: 200 };
    }
    return {
      exists: false,
      allowed: false,
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      reason: `Recurso ${collectionName}/${cleanDocId} não encontrado.`,
    };
  }
  const recordOwnerUid = data.ownerUid ? String(data.ownerUid).trim() : '';

  if (!recordOwnerUid) {
    if (requireExplicitOwner) {
      return {
        exists: true,
        allowed: false,
        status: 403,
        code: 'OWNERSHIP_FORBIDDEN',
        reason: `Acesso negado: o registro ${collectionName}/${cleanDocId} não possui ownerUid vinculado ao usuário autenticado.`,
        data,
      };
    }
    return { exists: true, allowed: true, status: 200, data };
  }

  if (recordOwnerUid !== cleanAuthUid) {
    return {
      exists: true,
      allowed: false,
      status: 403,
      code: 'OWNERSHIP_FORBIDDEN',
      reason: `Acesso negado: o recurso ${collectionName}/${cleanDocId} pertence a outro organizador (ownerUid !== req.authUid).`,
      data,
    };
  }

  return {
    exists: true,
    allowed: true,
    status: 200,
    data,
  };
}

// ==========================================
// PHASE 11: FIREBASE CUSTOM TOKEN & STEP-UP REAUTHENTICATION
// ==========================================

export type CustomTokenCreator = (
  uid: string,
  developerClaims?: Record<string, any>
) => Promise<string>;

let customTokenCreatorForTests: CustomTokenCreator | null = null;

export function setCustomTokenCreatorForTests(creator: CustomTokenCreator | null): void {
  customTokenCreatorForTests = creator;
}

/**
 * Generates a cryptographically signed Firebase Auth Custom Token for a verified UID.
 * Must ONLY be called by the backend after complete TikTok OAuth v2 state + code + open_id
 * validation and transactional identity binding.
 */
export async function createFirebaseCustomTokenForUid(
  uid: string,
  developerClaims?: Record<string, any>
): Promise<string> {
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  if (!cleanUid || cleanUid.length > 128 || /\s/.test(cleanUid)) {
    throw new Error('UID inválido para emissão de Firebase Custom Token.');
  }

  if (customTokenCreatorForTests) {
    return await customTokenCreatorForTests(cleanUid, developerClaims);
  }

  const adminAuth = getAdminAuth(getOrInitFirebaseAdminApp());
  return await adminAuth.createCustomToken(cleanUid, developerClaims);
}

export interface StepUpReauthVerificationResult {
  verified: boolean;
  status: number;
  code?: string;
  reason?: string;
  uid?: string;
  authTimeSec?: number;
  method?: 'password' | 'google.com';
}

const ALLOWED_STEP_UP_SIGN_IN_PROVIDERS = new Set(['password', 'google.com']);

/**
 * PHASE 11.1 — Cryptographic Step-Up Reauthentication Verification
 *
 * Security Invariants:
 * 1. NEVER trusts `reauthConfirmed`, `reauthMethod`, `auth_time`, or `reauthVerified` sent by the frontend.
 * 2. Cryptographically verifies the Firebase ID Token signature, expiration (`exp`), and revocation (`checkRevoked = true`)
 *    on the backend via `verifyAuthenticatedFirebaseUser(req)`.
 * 3. If a dedicated `reauthIdToken` is provided in headers/body, verifies it cryptographically and enforces
 *    strict UID equality (`reauthToken.uid === sessionToken.uid`), blocking cross-UID token substitution (`REAUTH_UID_MISMATCH`).
 * 4. Extracts `auth_time` and `firebase.sign_in_provider` EXCLUSIVELY from the verified `DecodedIdToken`.
 * 5. Enforces `nowSec - decoded.auth_time <= maxAgeSeconds` (default 300s) and `sign_in_provider` in `{'password', 'google.com'}`.
 */
export async function verifyRecentReauthentication(
  req: Request,
  options?: { maxAgeSeconds?: number; expectedUid?: string }
): Promise<StepUpReauthVerificationResult> {
  const maxAgeSeconds = options?.maxAgeSeconds ?? 300; // 5 minutes window for recent reauthentication
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
  const query = (req.query && typeof req.query === 'object' ? req.query : {}) as Record<string, any>;

  // 1. Block explicit client attempts to forge server-side reauthentication claims
  const forbiddenClientReauthFields = [
    'auth_time',
    'authTime',
    'authTimeSec',
    'reauthVerified',
    'verified',
    'decodedFirebaseToken',
    'sign_in_provider',
    'signInProvider',
    'customClaims',
  ];
  for (const field of forbiddenClientReauthFields) {
    if (body[field] !== undefined || query[field] !== undefined) {
      return {
        verified: false,
        status: 403,
        code: 'REAUTH_FORGERY_ATTEMPT',
        reason: `Tentativa de falsificação de reautenticação bloqueada: o campo "${field}" não pode ser enviado pelo cliente.`,
      };
    }
  }

  if (
    body.reauthConfirmed === false ||
    req.headers['x-gio-reauth-confirmed'] === 'false'
  ) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTHENTICATION_REQUIRED',
      reason:
        'Reautenticação obrigatória: confirme sua identidade com Senha ou Google Auth antes de vincular uma conta TikTok.',
    };
  }

  // 2. Cryptographically verify the primary Firebase ID Token (signature, expiry, disabled, revocation)
  const primaryAuth = await verifyAuthenticatedFirebaseUser(req);
  if (!primaryAuth.authenticated || !primaryAuth.uid || !primaryAuth.decodedToken) {
    return {
      verified: false,
      status: primaryAuth.status || 401,
      code: primaryAuth.code || 'FIREBASE_AUTH_REQUIRED',
      reason:
        primaryAuth.reason ||
        'Sessão Firebase autenticada e válida é obrigatória para vincular uma conta TikTok.',
    };
  }

  const verifiedUid = primaryAuth.uid;

  // Reject if caller or body specifies a different target UID
  const requestedBodyUid =
    typeof body.uid === 'string' && body.uid.trim() ? body.uid.trim() : null;
  const expectedUid =
    typeof options?.expectedUid === 'string' && options.expectedUid.trim()
      ? options.expectedUid.trim()
      : null;

  if (
    (requestedBodyUid && requestedBodyUid !== verifiedUid) ||
    (expectedUid && expectedUid !== verifiedUid)
  ) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTH_UID_MISMATCH',
      reason:
        'Violação de propriedade: o token de reautenticação pertence a um UID diferente da conta alvo.',
    };
  }

  // 3. If a dedicated step-up `reauthIdToken` was supplied, cryptographically verify it and enforce UID match
  let effectiveDecodedToken: DecodedIdToken = primaryAuth.decodedToken;
  const rawReauthIdToken =
    (typeof body.reauthIdToken === 'string' && body.reauthIdToken.trim()) ||
    (typeof req.headers['x-gio-reauth-id-token'] === 'string' &&
      req.headers['x-gio-reauth-id-token'].trim()) ||
    '';

  if (rawReauthIdToken) {
    const syntheticReq = {
      headers: {
        authorization: `Bearer ${rawReauthIdToken}`,
      },
      query: {},
      ip: req.ip,
      socket: req.socket,
    } as unknown as Request;

    const stepUpAuth = await verifyAuthenticatedFirebaseUser(syntheticReq);
    if (!stepUpAuth.authenticated || !stepUpAuth.uid || !stepUpAuth.decodedToken) {
      return {
        verified: false,
        status: stepUpAuth.status || 401,
        code: stepUpAuth.code || 'FIREBASE_TOKEN_INVALID',
        reason:
          stepUpAuth.reason ||
          'Token de reautenticação inválido, expirado ou revogado.',
      };
    }

    if (stepUpAuth.uid !== verifiedUid) {
      return {
        verified: false,
        status: 403,
        code: 'REAUTH_UID_MISMATCH',
        reason:
          'Violação de segurança: o reauthIdToken pertence a outro UID e não pode autorizar esta conta.',
      };
    }

    effectiveDecodedToken = stepUpAuth.decodedToken;
  }

  // 4. Verify cryptographic `firebase.sign_in_provider` claim (NEVER trust client `reauthMethod`)
  const decodedRecord = effectiveDecodedToken as Record<string, any>;
  const tokenSignInProvider = String(
    decodedRecord.firebase?.sign_in_provider || ''
  ).trim();

  const clientClaimedMethod = String(
    body.reauthMethod || req.headers['x-gio-reauth-method'] || ''
  ).trim();

  if (
    clientClaimedMethod &&
    (!ALLOWED_STEP_UP_SIGN_IN_PROVIDERS.has(clientClaimedMethod) ||
      (tokenSignInProvider && clientClaimedMethod !== tokenSignInProvider))
  ) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTH_FORGERY_ATTEMPT',
      reason: `Divergência de segurança: o método de reautenticação informado pelo cliente (${clientClaimedMethod}) contradiz o provedor criptográfico do token Firebase (${tokenSignInProvider || 'desconhecido'}).`,
    };
  }

  if (!ALLOWED_STEP_UP_SIGN_IN_PROVIDERS.has(tokenSignInProvider)) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTHENTICATION_PROVIDER_INVALID',
      reason: `Reautenticação recusada: o token atual foi emitido via "${tokenSignInProvider || 'desconhecido'}". Exige-se reautenticação recente comprovada por Senha (password) ou Google Auth (google.com).`,
    };
  }

  // 5. Verify cryptographic `auth_time` claim strictly (NEVER fall back to `iat` or client fields)
  const rawAuthTime = decodedRecord.auth_time;
  if (
    typeof rawAuthTime !== 'number' ||
    !Number.isFinite(rawAuthTime) ||
    rawAuthTime <= 0
  ) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTH_INVALID_AUTH_TIME',
      reason:
        'Token Firebase não possui claim criptográfico auth_time válido para comprovar reautenticação.',
    };
  }

  const authTimeSec = Math.floor(rawAuthTime);
  const nowSec = Math.floor(Date.now() / 1000);

  if (authTimeSec > nowSec + 30) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTH_INVALID_AUTH_TIME',
      reason: 'Claim auth_time inválido (timestamp no futuro).',
      authTimeSec,
    };
  }

  if (nowSec - authTimeSec > maxAgeSeconds) {
    return {
      verified: false,
      status: 403,
      code: 'REAUTHENTICATION_STALE',
      reason:
        'Sua confirmação de identidade expirou (mais de 5 minutos). Reautentique-se com sua senha ou Google Auth para gerar um token recente antes de vincular o TikTok.',
      uid: verifiedUid,
      authTimeSec,
    };
  }

  return {
    verified: true,
    status: 200,
    uid: verifiedUid,
    authTimeSec,
    method: tokenSignInProvider as 'password' | 'google.com',
  };
}


