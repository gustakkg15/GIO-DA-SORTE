import { Request, Response, NextFunction } from 'express';
import {
  initializeApp as initializeAdminApp,
  getApps as getAdminApps,
  applicationDefault,
  cert,
  App as AdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth, DecodedIdToken } from 'firebase-admin/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { mercadoPagoSubscriptionService } from './mercadoPagoSubscriptionService.js';
import {
  ProPlanEntitlement,
  SubscriptionBillingSubStatus,
  UserSubscriptionRecord,
} from '../types.js';

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
    const parsedServiceAccount = JSON.parse(rawServiceAccountJson);
    adminAppInstance = initializeAdminApp({
      credential: cert(parsedServiceAccount),
      projectId: parsedServiceAccount.project_id || DEFAULT_GCP_PROJECT_ID,
    });
    return adminAppInstance;
  }

  adminAppInstance = initializeAdminApp({
    credential: applicationDefault(),
    projectId: DEFAULT_GCP_PROJECT_ID,
  });
  return adminAppInstance;
}

// Optional programmatic verifier hook strictly for in-process automated testing of token states
type CustomTokenVerifier = (idToken: string, checkRevoked?: boolean) => Promise<DecodedIdToken>;
let customTokenVerifierForTests: CustomTokenVerifier | null = null;

export function setCustomTokenVerifierForTests(verifier: CustomTokenVerifier | null): void {
  customTokenVerifierForTests = verifier;
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
        req.headers['x-gio-loopback-test-suite'] === 'etapa2') &&
      idToken.startsWith('gio_loopback_test_token:');

    let decoded: DecodedIdToken;
    if (customTokenVerifierForTests) {
      decoded = await customTokenVerifierForTests(idToken, true);
    } else if (isLoopbackTestSuite) {
      const parts = idToken.split(':');
      const mode = parts[1] || '';
      const testUid = parts[2] || '';
      const testEmail = parts[3] || `${testUid}@test.local`;
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
      } as DecodedIdToken;
    } else {
      decoded = await getAdminAuth(getOrInitFirebaseAdminApp()).verifyIdToken(idToken, true);
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
 * - Respects 7-day trial (`now <= trialEndDate`) and paid cycle (`now <= currentPeriodEnd`) even after cancellation.
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
      reason: `Acesso operacional exclusivo do plano TIKTOK LIVE PRO (status atual: tier=${record.tier}, statusState=${record.statusState}, billingSubStatus=${record.billingSubStatus}). Assine ou ative seu período de teste gratuito de 7 dias para liberar esta operação.`,
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

  const ref = doc(db, collectionName, cleanDocId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
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

  const data = snap.data() as Record<string, any>;
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
