import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import {
  extractBearerIdToken,
  verifyAuthenticatedFirebaseUser,
} from './firebaseAdminAuth.ts';

// Extend Express Request with worker authentication fields
declare global {
  namespace Express {
    interface Request {
      authType?: 'FIREBASE' | 'OIDC_WORKER';
      workerEmail?: string;
      decodedOidcToken?: Record<string, unknown>;
    }
  }
}

export const AUTHORIZED_WORKER_SERVICE_ACCOUNT =
  process.env.WORKER_SERVICE_ACCOUNT_EMAIL ||
  'gio-sorte-worker@gio-sorte-homolog.iam.gserviceaccount.com';

export const CLOUD_RUN_SERVICE_URL =
  process.env.CLOUD_RUN_SERVICE_URL ||
  process.env.CLOUD_RUN_URL ||
  'https://gio-sorte-homolog-service.a.run.app';

export interface GoogleOidcVerificationResult {
  valid: boolean;
  status: number;
  code: string;
  reason?: string;
  payload?: TokenPayload;
  email?: string;
}

export type CustomOidcVerifier = (
  token: string,
  options?: { expectedAudience?: string; expectedServiceAccount?: string }
) => Promise<GoogleOidcVerificationResult>;

let customOidcVerifierForTests: CustomOidcVerifier | null = null;

/**
 * In-process hook for automated testing suites to mock OIDC verification
 * without requiring real Google OAuth2 cert endpoint network calls.
 */
export function setCustomOidcVerifierForTests(verifier: CustomOidcVerifier | null): void {
  customOidcVerifierForTests = verifier;
}

/**
 * Safely inspects the unverified payload of a JWT without decoding verification.
 * Used exclusively for routing hints (distinguishing Firebase vs Google OIDC issuer).
 */
export function inspectJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Safely extracts the unverified `iss` claim from a JWT.
 */
export function inspectJwtIssuer(token: string): string | null {
  const payload = inspectJwtPayloadUnsafe(token);
  return typeof payload?.iss === 'string' ? payload.iss : null;
}

/**
 * Cryptographically verifies a Google OIDC ID Token issued for Cloud Run invocation.
 * Enforces:
 * 1. RSA signature verification against Google's public certs.
 * 2. Issuer must be 'https://accounts.google.com' or 'accounts.google.com'.
 * 3. Audience must match the official Cloud Run Service URL.
 * 4. Token must not be expired (`exp > now`).
 * 5. `email_verified` must be true.
 * 6. `email` must match the authorized worker Service Account:
 *    `gio-sorte-worker@gio-sorte-homolog.iam.gserviceaccount.com`.
 */
export async function verifyGoogleOidcToken(
  token: string,
  options?: {
    expectedAudience?: string;
    expectedServiceAccount?: string;
  }
): Promise<GoogleOidcVerificationResult> {
  const expectedAudience = options?.expectedAudience || CLOUD_RUN_SERVICE_URL;
  const expectedServiceAccount =
    options?.expectedServiceAccount || AUTHORIZED_WORKER_SERVICE_ACCOUNT;

  if (customOidcVerifierForTests) {
    return customOidcVerifierForTests(token, {
      expectedAudience,
      expectedServiceAccount,
    });
  }

  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      status: 401,
      code: 'OIDC_TOKEN_REQUIRED',
      reason: 'Token OIDC ausente ou em formato inválido.',
    };
  }

  try {
    const oauth2Client = new OAuth2Client();
    const ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: expectedAudience,
    });
    const payload = ticket.getPayload();

    if (!payload) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_PAYLOAD_MISSING',
        reason: 'Token OIDC não contém claims válidos no payload.',
      };
    }

    // 1. Validate Issuer
    const iss = String(payload.iss || '').trim();
    if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_INVALID_ISSUER',
        reason: `Issuer do token OIDC inválido: esperado 'https://accounts.google.com', recebido '${iss}'.`,
      };
    }

    // 2. Validate Audience
    const aud = payload.aud;
    const isAudienceMatch = Array.isArray(aud)
      ? aud.includes(expectedAudience)
      : aud === expectedAudience;
    if (!isAudienceMatch) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_INVALID_AUDIENCE',
        reason: `Audience do token OIDC não corresponde ao serviço Cloud Run esperado.`,
      };
    }

    // 3. Validate Expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_TOKEN_EXPIRED',
        reason: 'Token OIDC do Google expirado.',
      };
    }

    // 4. Validate Email Verified
    if (payload.email_verified !== true && (payload as any).email_verified !== 'true') {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_EMAIL_NOT_VERIFIED',
        reason: 'O e-mail associado ao token OIDC não está verificado.',
      };
    }

    // 5. Validate Caller Identity (must be the dedicated authorized worker SA)
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email || email !== expectedServiceAccount.toLowerCase()) {
      return {
        valid: false,
        status: 403,
        code: 'OIDC_UNAUTHORIZED_CALLER',
        reason: `Chamador OIDC não autorizado: '${email || 'sem email'}'. Apenas '${expectedServiceAccount}' tem permissão de worker.`,
      };
    }

    return {
      valid: true,
      status: 200,
      code: 'OIDC_VERIFIED',
      payload,
      email,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('expired')) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_TOKEN_EXPIRED',
        reason: `Token OIDC expirado: ${msg}`,
      };
    }
    if (msg.includes('Wrong recipient') || msg.includes('audience')) {
      return {
        valid: false,
        status: 401,
        code: 'OIDC_INVALID_AUDIENCE',
        reason: `Audience do token OIDC incompatível: ${msg}`,
      };
    }
    return {
      valid: false,
      status: 401,
      code: 'OIDC_TOKEN_INVALID',
      reason: `Assinatura ou formato do token OIDC inválido: ${msg}`,
    };
  }
}

/**
 * Express middleware that enforces Dual Authentication for worker endpoints:
 * - Path A: Human Organizer via Firebase ID Token (sets req.authType = 'FIREBASE', req.authUid).
 * - Path B: Automated Worker via Google Cloud OIDC Token (sets req.authType = 'OIDC_WORKER', req.workerEmail).
 *
 * Never trusts client headers (`x-is-internal`, `x-worker-auth`) or query parameters.
 */
export async function requireWorkerOrFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerIdToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      error:
        'Autenticação obrigatória: envie um token Bearer válido (Firebase ID Token ou Google OIDC Token) no cabeçalho Authorization.',
    });
    return;
  }

  const iss = inspectJwtIssuer(token);
  const isFirebaseHint =
    token.startsWith('gio_loopback_test_token:') ||
    (Boolean(iss) && iss!.startsWith('https://securetoken.google.com/'));
  const isOidcHint =
    token.startsWith('gio_oidc_test_token:') ||
    iss === 'https://accounts.google.com' ||
    iss === 'accounts.google.com';

  if (isOidcHint) {
    const oidcResult = await verifyGoogleOidcToken(token);
    if (!oidcResult.valid) {
      res.status(oidcResult.status || 401).json({
        success: false,
        code: oidcResult.code || 'OIDC_TOKEN_INVALID',
        error: oidcResult.reason || 'Token OIDC do Google inválido.',
      });
      return;
    }

    req.authType = 'OIDC_WORKER';
    req.workerEmail = oidcResult.email;
    req.decodedOidcToken = oidcResult.payload as unknown as Record<string, unknown>;
    next();
    return;
  }

  if (isFirebaseHint) {
    const fbResult = await verifyAuthenticatedFirebaseUser(req);
    if (!fbResult.authenticated || !fbResult.uid) {
      res.status(fbResult.status || 401).json({
        success: false,
        code: fbResult.code || 'FIREBASE_AUTH_REQUIRED',
        error: fbResult.reason || 'Autenticação Firebase obrigatória.',
      });
      return;
    }

    req.authType = 'FIREBASE';
    req.authUid = fbResult.uid;
    req.authEmail = fbResult.email;
    req.authEmailVerified = fbResult.emailVerified;
    req.decodedFirebaseToken = fbResult.decodedToken;
    next();
    return;
  }

  // Fallback for non-standard test tokens: try Firebase first
  const fbResult = await verifyAuthenticatedFirebaseUser(req);
  if (fbResult.authenticated && fbResult.uid) {
    req.authType = 'FIREBASE';
    req.authUid = fbResult.uid;
    req.authEmail = fbResult.email;
    req.authEmailVerified = fbResult.emailVerified;
    req.decodedFirebaseToken = fbResult.decodedToken;
    next();
    return;
  }

  // Try OIDC second
  const oidcResult = await verifyGoogleOidcToken(token);
  if (oidcResult.valid) {
    req.authType = 'OIDC_WORKER';
    req.workerEmail = oidcResult.email;
    req.decodedOidcToken = oidcResult.payload as unknown as Record<string, unknown>;
    next();
    return;
  }

  res.status(401).json({
    success: false,
    code: 'AUTH_TOKEN_INVALID',
    error: 'Token fornecido não é um Firebase ID Token nem um Google OIDC Token válido.',
  });
}
