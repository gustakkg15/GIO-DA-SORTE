import crypto from 'crypto';
import type { Request } from 'express';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase.ts';

// ==========================================
// 1. EXPLICIT DOMAIN & REDIRECT URI ALLOWLIST
// ==========================================

export const DEV_APP_ORIGIN =
  'https://ais-dev-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app';
export const PROD_APP_ORIGIN =
  'https://ais-pre-bodr7wggvyyl4p2jtskel4-749434257827.europe-west2.run.app';

export const OAUTH_CALLBACK_PATH = '/auth/tiktok/callback';
export const SESSION_COOKIE_NAME = 'gio_tiktok_session';
export const STATE_COOKIE_NAME = 'tiktok_oauth_state';
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const TOKEN_AUTO_REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes before expiry

/**
 * Explicit allowlist of authorized HTTPS origins for Redirect URI and window.opener.postMessage.
 * Arbitrary Host or X-Forwarded-Host headers are NEVER trusted unless they match this list.
 */
export const ALLOWED_HTTPS_ORIGINS: ReadonlySet<string> = new Set([
  PROD_APP_ORIGIN,
  DEV_APP_ORIGIN,
]);

/**
 * Current TikTok OAuth v2 endpoints (Login Kit for Web v2 specification)
 * Note on userInfo fields:
 * - `user.info.basic` grants ONLY: `open_id`, `union_id`, `display_name`, `avatar_url`, `avatar_url_100`, `avatar_large_url`.
 * - `username` requires `user.info.profile` scope approval in TikTok Developer Portal.
 */
export const TIKTOK_OAUTH_V2_ENDPOINTS = {
  authorize: 'https://www.tiktok.com/v2/auth/authorize/',
  token: 'https://open.tiktokapis.com/v2/oauth/token/',
  revoke: 'https://open.tiktokapis.com/v2/oauth/revoke/',
  userInfoBasic:
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
  userInfoWithProfile:
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username',
  // Alias for default basic endpoint
  userInfo:
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
} as const;

/**
 * Allowed TikTok Login Kit v2 scopes.
 * By default ONLY `user.info.basic` is requested because it is granted by default in Login Kit.
 * `user.info.profile` (which provides `username`) is only requested if explicitly enabled AND approved.
 */
export const ALLOWED_TIKTOK_SCOPES: ReadonlySet<string> = new Set([
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
]);

export class OAuthSecurityError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'OAuthSecurityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
  algorithm: 'aes-256-gcm';
  keyId: string;
  keySource: 'SECRET_MANAGER_OAUTH_KEY';
}

export interface TikTokPublicUserProfile {
  open_id: string;
  display_name?: string;
  avatar_url?: string;
  username?: string;
}

export interface FirestoreOAuthStateDoc {
  stateHash: string;
  redirectUri: string;
  targetOrigin: string;
  codeVerifier: string | null;
  pkceEnabled: boolean;
  requestedScopes: string;
  createdAt: number;
  expiresAt: number;
  /**
   * Native Google Cloud Firestore TTL Policy field (`Timestamp`).
   * Security NEVER relies on automatic TTL deletion: `expiresAt` is validated in every operation.
   */
  ttlExpireAt: Timestamp;
  consumed: boolean;
  consumedAt: number | null;
  createdByInstance: string;
  consumedByInstance?: string | null;
}

export interface FirestoreOAuthSessionDoc {
  sessionIdHash: string;
  openId: string;
  scope: string;
  encryptedAccessToken: EncryptedPayload;
  encryptedRefreshToken: EncryptedPayload;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  sessionExpiresAt: number;
  /**
   * Native Google Cloud Firestore TTL Policy field (`Timestamp`).
   * Security NEVER relies on automatic TTL deletion: `sessionExpiresAt` and `refreshTokenExpiresAt`
   * are strictly validated in every backend operation.
   */
  ttlExpireAt: Timestamp;
  userProfile: TikTokPublicUserProfile;
  authenticatedAt: number;
  updatedAt: number;
  rotationCount: number;
  keyRotationCount?: number;
  rotatedFromHash?: string | null;
  rotatedToHash?: string | null;
  revoked: boolean;
  revokedAt?: number | null;
  revokedReason?: string | null;
}

export interface TokenFetcherResponse {
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, any>>;
}

export type HttpFetcher = (url: string, init?: RequestInit) => Promise<TokenFetcherResponse>;

// ==========================================
// 2. CRYPTOGRAPHIC KEY RING & AES-256-GCM
// (Exclusive 256-bit OAUTH_ENCRYPTION_KEY + Key Rotation)
// ==========================================

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  return { codeVerifier, codeChallenge };
}

export interface DerivedKeyEntry {
  key: Buffer;
  keyId: string;
  isPrimary: boolean;
}

/**
 * Parses and validates a single 256-bit encryption key secret.
 * Strictly forbids reusing TIKTOK_CLIENT_SECRET or keys with less than 256 bits (32 bytes) of security.
 */
function parseAndValidate256BitSecret(rawSecret: string, label: string): DerivedKeyEntry {
  const clean = rawSecret.trim();
  if (!clean) {
    throw new OAuthSecurityError(
      'MISSING_ENCRYPTION_KEY',
      `${label} ausente. Configure uma chave exclusiva de 256 bits (32 bytes / 64 hex chars) no Secret Manager.`,
      503
    );
  }

  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (clientSecret && clean === clientSecret) {
    throw new OAuthSecurityError(
      'ENCRYPTION_KEY_REUSE_FORBIDDEN',
      'Violação de segurança: OAUTH_ENCRYPTION_KEY não pode ser igual a TIKTOK_CLIENT_SECRET. Utilize uma chave exclusiva de 256 bits.',
      503
    );
  }

  let keyBuffer: Buffer;

  // Case 1: 64-character hex string (exact 256 bits / 32 bytes)
  if (/^[a-fA-F0-9]{64}$/.test(clean)) {
    keyBuffer = Buffer.from(clean, 'hex');
  } else {
    // Case 2: Base64 / Base64URL or high-entropy secret string >= 32 bytes
    const utf8Bytes = Buffer.byteLength(clean, 'utf8');
    if (utf8Bytes < 32) {
      throw new OAuthSecurityError(
        'WEAK_ENCRYPTION_KEY',
        `${label} possui entropia insuficiente (${utf8Bytes * 8} bits). Exige-se chave exclusiva com no mínimo 256 bits (32 bytes ou 64 caracteres hexadecimais).`,
        503
      );
    }
    // Derive 32-byte key via HKDF-SHA256
    keyBuffer = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        Buffer.from(clean, 'utf8'),
        Buffer.from('gio_tiktok_oauth_aes256gcm_hkdf_salt_v3', 'utf8'),
        Buffer.from('aes-256-gcm-token-vault', 'utf8'),
        32
      )
    );
  }

  if (keyBuffer.length !== 32) {
    throw new OAuthSecurityError(
      'INVALID_ENCRYPTION_KEY_LENGTH',
      `${label} deve resultar em exatamente 256 bits (32 bytes).`,
      503
    );
  }

  const keyId = `kid_${crypto.createHash('sha256').update(keyBuffer).digest('hex').slice(0, 16)}`;
  return {
    key: keyBuffer,
    keyId,
    isPrimary: label === 'OAUTH_ENCRYPTION_KEY',
  };
}

/**
 * Resolves the active primary 256-bit key (`OAUTH_ENCRYPTION_KEY`) and optional retired keys
 * (`OAUTH_ENCRYPTION_KEY_PREVIOUS`, comma-separated) for zero-downtime key rotation.
 * NEVER falls back to TIKTOK_CLIENT_SECRET or hardcoded strings.
 */
export function resolveEncryptionKeyRing(): {
  primary: DerivedKeyEntry;
  allKeys: DerivedKeyEntry[];
} {
  const rawPrimary = process.env.OAUTH_ENCRYPTION_KEY?.trim() || '';
  if (!rawPrimary) {
    throw new OAuthSecurityError(
      'MISSING_ENCRYPTION_KEY',
      'OAUTH_ENCRYPTION_KEY não está configurada no Secret Manager / ambiente. A persistência de tokens OAuth exige chave exclusiva de 256 bits.',
      503
    );
  }

  const primary = parseAndValidate256BitSecret(rawPrimary, 'OAUTH_ENCRYPTION_KEY');
  const allKeys: DerivedKeyEntry[] = [primary];

  const rawPreviousList = (process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS || '').trim();
  const isIgnoredPlaceholder =
    !rawPreviousList ||
    ['none', 'null', 'false', 'empty', 'undefined', '""', "''"].includes(
      rawPreviousList.toLowerCase()
    );

  if (!isIgnoredPlaceholder) {
    const parts = rawPreviousList
      .split(',')
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && !['none', 'null', 'false', 'empty'].includes(s.toLowerCase()));
    for (let i = 0; i < parts.length; i++) {
      const prevEntry = parseAndValidate256BitSecret(
        parts[i],
        `OAUTH_ENCRYPTION_KEY_PREVIOUS[${i}]`
      );
      prevEntry.isPrimary = false;
      if (!allKeys.some((k) => k.keyId === prevEntry.keyId)) {
        allKeys.push(prevEntry);
      }
    }
  }

  return { primary, allKeys };
}

/**
 * Safe check to inspect whether a valid 256-bit exclusive OAUTH_ENCRYPTION_KEY is configured
 * without throwing an unhandled exception on status endpoints.
 * OAUTH_ENCRYPTION_KEY_PREVIOUS is strictly optional on initial installation.
 */
export function checkEncryptionKeyStatus(): {
  configured: boolean;
  activeKeyId: string | null;
  previousKeysCount: number;
  previousKeyOptional: true;
  error?: string;
} {
  try {
    const ring = resolveEncryptionKeyRing();
    return {
      configured: true,
      activeKeyId: ring.primary.keyId,
      previousKeysCount: ring.allKeys.length - 1,
      previousKeyOptional: true,
    };
  } catch (err) {
    return {
      configured: false,
      activeKeyId: null,
      previousKeysCount: 0,
      previousKeyOptional: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createEmptyEncryptedPayload(keyId = 'wiped'): EncryptedPayload {
  return {
    iv: '',
    authTag: '',
    ciphertext: '',
    algorithm: 'aes-256-gcm',
    keyId,
    keySource: 'SECRET_MANAGER_OAUTH_KEY',
  };
}

/**
 * Encrypts a token with AES-256-GCM using the primary exclusive 256-bit `OAUTH_ENCRYPTION_KEY`.
 */
export function encryptTokenAes256Gcm(plainText: string): EncryptedPayload {
  const { primary } = resolveEncryptionKeyRing();
  if (!plainText) {
    return createEmptyEncryptedPayload(primary.keyId);
  }
  const iv = crypto.randomBytes(12); // 96-bit IV recommended by NIST SP 800-38D for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', primary.key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted.toString('hex'),
    algorithm: 'aes-256-gcm',
    keyId: primary.keyId,
    keySource: 'SECRET_MANAGER_OAUTH_KEY',
  };
}

/**
 * Decrypts an AES-256-GCM payload using the keyring (`OAUTH_ENCRYPTION_KEY` + `OAUTH_ENCRYPTION_KEY_PREVIOUS`),
 * reporting whether a previous key was used so the caller can seamlessly rotate the ciphertext to the new primary key.
 */
export function decryptTokenWithRotationInfo(payload: EncryptedPayload): {
  plaintext: string;
  usedPreviousKey: boolean;
  decryptedWithKeyId: string;
  activePrimaryKeyId: string;
} {
  const { primary, allKeys } = resolveEncryptionKeyRing();

  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    return {
      plaintext: '',
      usedPreviousKey: false,
      decryptedWithKeyId: primary.keyId,
      activePrimaryKeyId: primary.keyId,
    };
  }

  // Order candidate keys: exact keyId match first, then primary, then remaining keys in ring
  const orderedCandidates: DerivedKeyEntry[] = [];
  if (payload.keyId) {
    const matched = allKeys.find((k) => k.keyId === payload.keyId);
    if (matched) orderedCandidates.push(matched);
  }
  for (const k of allKeys) {
    if (!orderedCandidates.some((c) => c.keyId === k.keyId)) {
      orderedCandidates.push(k);
    }
  }

  const ivBuf = Buffer.from(payload.iv, 'hex');
  const authTagBuf = Buffer.from(payload.authTag, 'hex');
  const cipherBuf = Buffer.from(payload.ciphertext, 'hex');

  let lastError: Error | null = null;
  for (const candidate of orderedCandidates) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', candidate.key, ivBuf);
      decipher.setAuthTag(authTagBuf);
      const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
      return {
        plaintext: decrypted.toString('utf8'),
        usedPreviousKey: candidate.keyId !== primary.keyId,
        decryptedWithKeyId: candidate.keyId,
        activePrimaryKeyId: primary.keyId,
      };
    } catch (err) {
      lastError = err as Error;
    }
  }

  throw new OAuthSecurityError(
    'TOKEN_DECRYPTION_FAILED',
    `Falha ao descriptografar token OAuth com AES-256-GCM (keyId=${payload.keyId || 'desconhecido'}). Verifique OAUTH_ENCRYPTION_KEY / OAUTH_ENCRYPTION_KEY_PREVIOUS: ${lastError?.message || 'Autenticação GCM inválida'}`,
    500
  );
}

export function decryptTokenAes256Gcm(payload: EncryptedPayload): string {
  return decryptTokenWithRotationInfo(payload).plaintext;
}

// ==========================================
// 3. ALLOWLIST ORIGIN, REDIRECT URI & SCOPES
// ==========================================

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/$/, '');
  return ALLOWED_HTTPS_ORIGINS.has(normalized);
}

/**
 * Validates and resolves the exact authorized HTTPS origin and Redirect URI.
 * Rejects any forged Host or X-Forwarded-Host header not present in ALLOWED_HTTPS_ORIGINS.
 */
export function resolveAuthorizedRedirectConfig(options?: {
  req?: Request;
  explicitOrigin?: string;
  strictHeaderCheck?: boolean;
}): { targetOrigin: string; redirectUri: string } {
  if (options?.explicitOrigin) {
    const cleanExplicit = options.explicitOrigin.trim().replace(/\/$/, '');
    if (!isAllowedOrigin(cleanExplicit)) {
      throw new OAuthSecurityError(
        'UNTRUSTED_ORIGIN',
        `Origem não autorizada na allowlist OAuth: ${cleanExplicit}`,
        403
      );
    }
    return {
      targetOrigin: cleanExplicit,
      redirectUri: `${cleanExplicit}${OAUTH_CALLBACK_PATH}`,
    };
  }

  let verifiedReqOrigin: string | null = null;

  if (options?.req) {
    const req = options.req;
    const originHeader =
      typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/$/, '') : '';
    if (originHeader) {
      if (!isAllowedOrigin(originHeader)) {
        throw new OAuthSecurityError(
          'UNTRUSTED_ORIGIN_HEADER',
          `Cabeçalho Origin não pertence aos domínios autorizados: ${originHeader}`,
          403
        );
      }
      verifiedReqOrigin = originHeader;
    } else {
      const forwardedHost =
        typeof req.headers['x-forwarded-host'] === 'string'
          ? req.headers['x-forwarded-host'].split(',')[0].trim()
          : '';
      const hostToCheck = forwardedHost || req.get('host') || '';

      if (hostToCheck) {
        const candidateHttpsOrigin = `https://${hostToCheck.replace(/\/$/, '')}`;
        if (isAllowedOrigin(candidateHttpsOrigin)) {
          verifiedReqOrigin = candidateHttpsOrigin;
        } else {
          const isLocalLoopback =
            hostToCheck === 'localhost:3000' || hostToCheck === '127.0.0.1:3000';
          if (!isLocalLoopback || options?.strictHeaderCheck) {
            throw new OAuthSecurityError(
              'UNTRUSTED_HOST_HEADER',
              `Domínio Host/X-Forwarded-Host (${hostToCheck}) bloqueado: não consta na lista explícita de domínios HTTPS permitidos.`,
              403
            );
          }
        }
      }
    }
  }

  const envRedirectUri = process.env.TIKTOK_REDIRECT_URI?.trim();
  if (envRedirectUri) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(envRedirectUri);
    } catch {
      throw new OAuthSecurityError(
        'INVALID_REDIRECT_URI_ENV',
        `TIKTOK_REDIRECT_URI inválida: ${envRedirectUri}`,
        500
      );
    }
    if (!isAllowedOrigin(parsedUrl.origin) || parsedUrl.pathname !== OAUTH_CALLBACK_PATH) {
      throw new OAuthSecurityError(
        'UNTRUSTED_REDIRECT_URI_ENV',
        `TIKTOK_REDIRECT_URI (${envRedirectUri}) não pertence à allowlist oficial.`,
        500
      );
    }
    return {
      targetOrigin: verifiedReqOrigin || parsedUrl.origin,
      redirectUri: `${parsedUrl.origin}${OAUTH_CALLBACK_PATH}`,
    };
  }

  if (verifiedReqOrigin) {
    return {
      targetOrigin: verifiedReqOrigin,
      redirectUri: `${verifiedReqOrigin}${OAUTH_CALLBACK_PATH}`,
    };
  }

  const envAppUrl = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (envAppUrl && isAllowedOrigin(envAppUrl)) {
    return {
      targetOrigin: envAppUrl,
      redirectUri: `${envAppUrl}${OAUTH_CALLBACK_PATH}`,
    };
  }

  return {
    targetOrigin: PROD_APP_ORIGIN,
    redirectUri: `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`,
  };
}

/**
 * Validates and sanitizes requested TikTok OAuth v2 scopes.
 * - By default requests ONLY `user.info.basic` (which grants `open_id`, `display_name`, `avatar_url`).
 * - `user.info.profile` (which grants `username`) is ONLY included if explicitly requested AND
 *   confirmed as approved via `TIKTOK_PROFILE_SCOPE_APPROVED=true` or `options.profileScopeApproved=true`.
 */
export function resolveValidatedScopes(
  customScopes?: string,
  options?: { profileScopeApproved?: boolean }
): string {
  const raw = customScopes || process.env.TIKTOK_OAUTH_SCOPES || 'user.info.basic';
  const isProfileApproved =
    options?.profileScopeApproved ?? process.env.TIKTOK_PROFILE_SCOPE_APPROVED === 'true';

  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const valid = requested.filter((scope) => {
    if (!ALLOWED_TIKTOK_SCOPES.has(scope)) return false;
    if (scope === 'user.info.profile' && !isProfileApproved) {
      // Do not request unapproved user.info.profile scope; stick to user.info.basic
      return false;
    }
    return true;
  });

  if (valid.length === 0) {
    // If requested contained only unapproved user.info.profile, fall back safely to user.info.basic
    if (requested.includes('user.info.profile')) {
      return 'user.info.basic';
    }
    throw new OAuthSecurityError(
      'INVALID_OAUTH_SCOPE',
      `Nenhum escopo válido solicitado (${raw}). Escopos suportados: ${Array.from(ALLOWED_TIKTOK_SCOPES).join(', ')}`,
      400
    );
  }

  if (!valid.includes('user.info.basic')) {
    valid.unshift('user.info.basic');
  }

  return Array.from(new Set(valid)).join(',');
}

/**
 * Returns the exact TikTok v2 User Info endpoint matching the granted scopes:
 * - Only `open_id,display_name,avatar_url` when `user.info.basic` is used.
 * - Appends `,username` ONLY when `user.info.profile` is present in the granted scopes.
 */
export function resolveUserInfoEndpointForScope(grantedScope: string): string {
  const scopes = grantedScope
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (scopes.includes('user.info.profile')) {
    return TIKTOK_OAUTH_V2_ENDPOINTS.userInfoWithProfile;
  }
  return TIKTOK_OAUTH_V2_ENDPOINTS.userInfoBasic;
}

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      acc[key] = val;
    }
    return acc;
  }, {});
}

export interface OAuthDiagnosticReport {
  status: 'READY' | 'MISCONFIGURED';
  canInitiateAuthFlow: boolean;
  authFlowReady: boolean;
  oauthConfigured: boolean;
  clientKeyConfigured: boolean;
  clientSecretConfigured: boolean;
  encryptionKeyConfigured: boolean;
  encryptionSelfTestPassed: boolean;
  activeKeyId: string | null;
  previousKeysCount: number;
  targetOrigin: string;
  redirectUri: string;
  enabledScopes: string;
  pkceEnabled: boolean;
  configurationErrors: string[];
  variables: {
    TIKTOK_CLIENT_KEY: {
      populated: boolean;
      valid: boolean;
      length: number;
      error: string | null;
    };
    TIKTOK_CLIENT_SECRET: {
      populated: boolean;
      valid: boolean;
      length: number;
      protectedOnBackend: true;
      error: string | null;
    };
    OAUTH_ENCRYPTION_KEY: {
      populated: boolean;
      valid: boolean;
      activeKeyId: string | null;
      aes256GcmSelfTestPassed: boolean;
      distinctFromClientSecret: boolean;
      error: string | null;
    };
    OAUTH_ENCRYPTION_KEY_PREVIOUS: {
      populated: boolean;
      optionalOnInitialInstall: true;
      previousKeysCount: number;
    };
    TIKTOK_REDIRECT_URI: {
      configuredInEnv: boolean;
      valid: boolean;
      resolvedRedirectUri: string;
      targetOrigin: string;
      error: string | null;
    };
    TIKTOK_OAUTH_SCOPES: {
      valid: boolean;
      resolvedScopes: string;
      profileScopeApproved: boolean;
      error: string | null;
    };
    TIKTOK_OAUTH_USE_PKCE: {
      enabled: boolean;
    };
  };
  authFlowPreflight: {
    ready: boolean;
    authorizeEndpoint: string;
    redirectUriValid: boolean;
    scopesValid: boolean;
    encryptionSelfTestPassed: boolean;
    sampleAuthUrlConstructed: boolean;
    errors: string[];
  };
}

/**
 * Performs a full diagnostic check of TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
 * OAUTH_ENCRYPTION_KEY, redirect URI allowlist, scopes, and performs a non-destructive
 * preflight verification of the TikTok OAuth 2.0 authorization URL generation.
 * Never exposes secret values in the returned report.
 */
export function diagnoseOAuthConfiguration(options?: {
  req?: Request;
  explicitOrigin?: string;
}): OAuthDiagnosticReport {
  const errors: string[] = [];

  // 1. Validate TIKTOK_CLIENT_KEY
  const rawClientKey = process.env.TIKTOK_CLIENT_KEY?.trim() || '';
  const clientKeyPopulated = rawClientKey.length > 0;
  let clientKeyValid = false;
  let clientKeyError: string | null = null;
  if (!clientKeyPopulated) {
    clientKeyError = 'TIKTOK_CLIENT_KEY ausente ou vazia no ambiente.';
    errors.push(clientKeyError);
  } else if (rawClientKey.length < 4 || /\s/.test(rawClientKey)) {
    clientKeyError = 'TIKTOK_CLIENT_KEY possui formato inválido (muito curta ou contém espaços).';
    errors.push(clientKeyError);
  } else {
    clientKeyValid = true;
  }

  // 2. Validate TIKTOK_CLIENT_SECRET
  const rawClientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim() || '';
  const clientSecretPopulated = rawClientSecret.length > 0;
  let clientSecretValid = false;
  let clientSecretError: string | null = null;
  if (!clientSecretPopulated) {
    clientSecretError = 'TIKTOK_CLIENT_SECRET ausente ou vazia no ambiente.';
    errors.push(clientSecretError);
  } else if (rawClientSecret.length < 8 || /\s/.test(rawClientSecret)) {
    clientSecretError =
      'TIKTOK_CLIENT_SECRET possui formato inválido (muito curta ou contém espaços).';
    errors.push(clientSecretError);
  } else if (clientKeyPopulated && rawClientSecret === rawClientKey) {
    clientSecretError = 'TIKTOK_CLIENT_SECRET não pode ser idêntica ao TIKTOK_CLIENT_KEY.';
    errors.push(clientSecretError);
  } else {
    clientSecretValid = true;
  }

  // 3. Validate OAUTH_ENCRYPTION_KEY & AES-256-GCM roundtrip self-test
  const rawEncKey = process.env.OAUTH_ENCRYPTION_KEY?.trim() || '';
  const encKeyPopulated = rawEncKey.length > 0;
  const distinctFromClientSecret =
    !encKeyPopulated || !clientSecretPopulated || rawEncKey !== rawClientSecret;
  const keyStatus = checkEncryptionKeyStatus();
  let aes256GcmSelfTestPassed = false;
  let encKeyError: string | null = keyStatus.error || null;

  if (keyStatus.configured) {
    try {
      const probePlaintext = `oauth_diag_probe_${Date.now()}`;
      const encrypted = encryptTokenAes256Gcm(probePlaintext);
      const decrypted = decryptTokenAes256Gcm(encrypted);
      if (decrypted === probePlaintext && encrypted.ciphertext && encrypted.iv && encrypted.authTag) {
        aes256GcmSelfTestPassed = true;
      } else {
        encKeyError = 'Falha no autoteste AES-256-GCM: payload descriptografado diverge do original.';
      }
    } catch (err) {
      encKeyError =
        err instanceof Error
          ? `Falha no autoteste AES-256-GCM: ${err.message}`
          : 'Falha inesperada no autoteste AES-256-GCM.';
    }
  }

  const encKeyValid = Boolean(
    encKeyPopulated && keyStatus.configured && aes256GcmSelfTestPassed && distinctFromClientSecret
  );
  if (!encKeyValid && encKeyError) {
    errors.push(encKeyError);
  }

  const rawPrevKey = (process.env.OAUTH_ENCRYPTION_KEY_PREVIOUS || '').trim();
  const prevKeyPopulated = Boolean(
    rawPrevKey &&
      !['none', 'null', 'false', 'empty', 'undefined', '""', "''"].includes(rawPrevKey.toLowerCase())
  );

  // 4. Validate Redirect URI & Target Origin resolution
  const envRedirectUri = process.env.TIKTOK_REDIRECT_URI?.trim() || '';
  let targetOrigin = PROD_APP_ORIGIN;
  let redirectUri = `${PROD_APP_ORIGIN}${OAUTH_CALLBACK_PATH}`;
  let redirectUriValid = false;
  let redirectUriError: string | null = null;
  try {
    const resolved = resolveAuthorizedRedirectConfig({
      req: options?.req,
      explicitOrigin: options?.explicitOrigin,
    });
    targetOrigin = resolved.targetOrigin;
    redirectUri = resolved.redirectUri;
    redirectUriValid = true;
  } catch (err) {
    redirectUriError =
      err instanceof Error ? err.message : 'Erro ao resolver Redirect URI autorizada.';
    errors.push(redirectUriError);
  }

  // 5. Validate Scopes
  let resolvedScopes = 'user.info.basic';
  let scopesValid = false;
  let scopesError: string | null = null;
  const profileScopeApproved = process.env.TIKTOK_PROFILE_SCOPE_APPROVED === 'true';
  try {
    resolvedScopes = resolveValidatedScopes();
    scopesValid = Boolean(resolvedScopes);
  } catch (err) {
    scopesError = err instanceof Error ? err.message : 'Erro ao validar escopos do TikTok OAuth.';
    errors.push(scopesError);
  }

  // 6. Preflight dry-run of Authorization URL generation
  const pkceEnabled = process.env.TIKTOK_OAUTH_USE_PKCE === 'true';
  let sampleAuthUrlConstructed = false;
  if (clientKeyValid && encKeyValid && redirectUriValid && scopesValid) {
    try {
      const sampleState = crypto.randomBytes(32).toString('hex');
      const params = new URLSearchParams({
        client_key: rawClientKey,
        scope: resolvedScopes,
        response_type: 'code',
        redirect_uri: redirectUri,
        state: sampleState,
      });
      if (pkceEnabled) {
        const pkce = generatePkcePair();
        params.set('code_challenge', pkce.codeChallenge);
        params.set('code_challenge_method', 'S256');
      }
      const parsedAuthUrl = new URL(`${TIKTOK_OAUTH_V2_ENDPOINTS.authorize}?${params.toString()}`);
      sampleAuthUrlConstructed =
        parsedAuthUrl.origin === 'https://www.tiktok.com' &&
        parsedAuthUrl.pathname === '/v2/auth/authorize/' &&
        parsedAuthUrl.searchParams.get('client_key') === rawClientKey &&
        parsedAuthUrl.searchParams.get('redirect_uri') === redirectUri &&
        parsedAuthUrl.searchParams.get('response_type') === 'code' &&
        Boolean(parsedAuthUrl.searchParams.get('state'));
      if (!sampleAuthUrlConstructed) {
        errors.push('Falha ao validar a estrutura da URL de autorização do TikTok v2.');
      }
    } catch (err) {
      errors.push(
        err instanceof Error
          ? `Erro ao construir URL de autorização: ${err.message}`
          : 'Erro ao construir URL de autorização.'
      );
    }
  }

  const canInitiateAuthFlow = Boolean(
    clientKeyValid &&
      clientSecretValid &&
      encKeyValid &&
      redirectUriValid &&
      scopesValid &&
      sampleAuthUrlConstructed &&
      errors.length === 0
  );

  return {
    status: canInitiateAuthFlow ? 'READY' : 'MISCONFIGURED',
    canInitiateAuthFlow,
    authFlowReady: canInitiateAuthFlow,
    oauthConfigured: canInitiateAuthFlow,
    clientKeyConfigured: clientKeyValid,
    clientSecretConfigured: clientSecretValid,
    encryptionKeyConfigured: encKeyValid,
    encryptionSelfTestPassed: aes256GcmSelfTestPassed,
    activeKeyId: keyStatus.activeKeyId,
    previousKeysCount: keyStatus.previousKeysCount,
    targetOrigin,
    redirectUri,
    enabledScopes: resolvedScopes,
    pkceEnabled,
    configurationErrors: errors,
    variables: {
      TIKTOK_CLIENT_KEY: {
        populated: clientKeyPopulated,
        valid: clientKeyValid,
        length: rawClientKey.length,
        error: clientKeyError,
      },
      TIKTOK_CLIENT_SECRET: {
        populated: clientSecretPopulated,
        valid: clientSecretValid,
        length: rawClientSecret.length,
        protectedOnBackend: true,
        error: clientSecretError,
      },
      OAUTH_ENCRYPTION_KEY: {
        populated: encKeyPopulated,
        valid: encKeyValid,
        activeKeyId: keyStatus.activeKeyId,
        aes256GcmSelfTestPassed,
        distinctFromClientSecret,
        error: encKeyError,
      },
      OAUTH_ENCRYPTION_KEY_PREVIOUS: {
        populated: prevKeyPopulated,
        optionalOnInitialInstall: true,
        previousKeysCount: keyStatus.previousKeysCount,
      },
      TIKTOK_REDIRECT_URI: {
        configuredInEnv: Boolean(envRedirectUri),
        valid: redirectUriValid,
        resolvedRedirectUri: redirectUri,
        targetOrigin,
        error: redirectUriError,
      },
      TIKTOK_OAUTH_SCOPES: {
        valid: scopesValid,
        resolvedScopes,
        profileScopeApproved,
        error: scopesError,
      },
      TIKTOK_OAUTH_USE_PKCE: {
        enabled: pkceEnabled,
      },
    },
    authFlowPreflight: {
      ready: canInitiateAuthFlow,
      authorizeEndpoint: TIKTOK_OAUTH_V2_ENDPOINTS.authorize,
      redirectUriValid,
      scopesValid,
      encryptionSelfTestPassed: aes256GcmSelfTestPassed,
      sampleAuthUrlConstructed,
      errors,
    },
  };
}

// ==========================================
// 4. PERSISTENT MULTI-INSTANCE OAUTH SERVICE
// ==========================================

export class TikTokOAuthService {
  public readonly instanceId: string;
  private fetcher: HttpFetcher;

  constructor(instanceId?: string, customFetcher?: HttpFetcher) {
    this.instanceId = instanceId || `cloudrun_inst_${crypto.randomBytes(6).toString('hex')}`;
    this.fetcher = customFetcher || ((url, init) => fetch(url, init));
  }

  public setFetcher(customFetcher: HttpFetcher): void {
    this.fetcher = customFetcher;
  }

  public diagnoseConfiguration(options?: {
    req?: Request;
    explicitOrigin?: string;
  }): OAuthDiagnosticReport {
    return diagnoseOAuthConfiguration(options);
  }

  /**
   * Step 1: Creates a persistent, shared OAuth CSRF state in Firestore (`oauth_states/{stateHash}`)
   * and returns the TikTok Login Kit for Web v2 Authorization URL.
   *
   * Web Flow vs PKCE compatibility:
   * - According to the official TikTok Login Kit for Web v2 specification (`developers.tiktok.com/doc/login-kit-web`),
   *   the Web confidential server-side flow requires `client_key`, `scope`, `response_type=code`, `redirect_uri`, and `state`,
   *   and authenticates the token exchange on the backend using `client_secret` (without requiring PKCE).
   * - PKCE (`code_challenge` / `code_verifier`) remains supported as an opt-in (`usePkce: true` or `TIKTOK_OAUTH_USE_PKCE=true`).
   */
  public async createAuthorizationUrl(options?: {
    req?: Request;
    explicitOrigin?: string;
    strictHeaderCheck?: boolean;
    scopes?: string;
    profileScopeApproved?: boolean;
    usePkce?: boolean;
    ttlMs?: number;
    clientKeyOverride?: string;
  }): Promise<{
    url: string;
    state: string;
    stateHash: string;
    redirectUri: string;
    targetOrigin: string;
    scopes: string;
    pkceEnabled: boolean;
    expiresAt: number;
  }> {
    const clientKey = options?.clientKeyOverride || process.env.TIKTOK_CLIENT_KEY?.trim();
    if (!clientKey) {
      throw new OAuthSecurityError(
        'MISSING_CLIENT_KEY',
        'TIKTOK_CLIENT_KEY não configurada no servidor.',
        400
      );
    }

    // Verify early that OAUTH_ENCRYPTION_KEY is valid so we never start an OAuth flow that cannot persist tokens securely
    resolveEncryptionKeyRing();

    const { targetOrigin, redirectUri } = resolveAuthorizedRedirectConfig({
      req: options?.req,
      explicitOrigin: options?.explicitOrigin,
      strictHeaderCheck: options?.strictHeaderCheck,
    });

    const validatedScopes = resolveValidatedScopes(options?.scopes, {
      profileScopeApproved: options?.profileScopeApproved,
    });

    const usePkce =
      options?.usePkce !== undefined
        ? options.usePkce
        : process.env.TIKTOK_OAUTH_USE_PKCE === 'true';

    const rawState = crypto.randomBytes(32).toString('hex');
    const stateHash = sha256Hex(rawState);

    let codeVerifier: string | null = null;
    let codeChallenge: string | null = null;
    if (usePkce) {
      const pkce = generatePkcePair();
      codeVerifier = pkce.codeVerifier;
      codeChallenge = pkce.codeChallenge;
    }

    const now = Date.now();
    const ttlMs = options?.ttlMs ?? OAUTH_STATE_TTL_MS;
    const expiresAt = now + ttlMs;

    const stateDoc: FirestoreOAuthStateDoc = {
      stateHash,
      redirectUri,
      targetOrigin,
      codeVerifier,
      pkceEnabled: usePkce,
      requestedScopes: validatedScopes,
      createdAt: now,
      expiresAt,
      ttlExpireAt: Timestamp.fromMillis(expiresAt),
      consumed: false,
      consumedAt: null,
      createdByInstance: this.instanceId,
    };

    // Persist in Firestore so ANY Cloud Run instance can validate and consume it
    await setDoc(doc(db, 'oauth_states', stateHash), stateDoc);

    const params = new URLSearchParams({
      client_key: clientKey,
      scope: validatedScopes,
      response_type: 'code',
      redirect_uri: redirectUri,
      state: rawState,
    });

    if (usePkce && codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const url = `${TIKTOK_OAUTH_V2_ENDPOINTS.authorize}?${params.toString()}`;
    return {
      url,
      state: rawState,
      stateHash,
      redirectUri,
      targetOrigin,
      scopes: validatedScopes,
      pkceEnabled: usePkce,
      expiresAt,
    };
  }

  /**
   * Step 2: Atomically validates and consumes the OAuth `state` from Firestore (`runTransaction`).
   * Guarantees single-use across multiple Cloud Run instances and explicitly validates `expiresAt`
   * (never relying on automatic Firestore TTL deletion).
   */
  public async consumeStateAtomic(rawState: string): Promise<FirestoreOAuthStateDoc> {
    const cleanState = typeof rawState === 'string' ? rawState.trim() : '';
    if (!cleanState || cleanState.length < 16) {
      throw new OAuthSecurityError(
        'CSRF_STATE_INVALID',
        'Falha na validação de segurança CSRF: parâmetro state ausente ou malformado.',
        400
      );
    }

    const stateHash = sha256Hex(cleanState);
    const stateRef = doc(db, 'oauth_states', stateHash);

    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(stateRef);
      if (!snap.exists()) {
        throw new OAuthSecurityError(
          'CSRF_STATE_NOT_FOUND',
          'Falha na validação de segurança CSRF: state inexistente ou não emitido por este aplicativo.',
          400
        );
      }

      const data = snap.data() as FirestoreOAuthStateDoc;

      if (data.consumed) {
        throw new OAuthSecurityError(
          'CSRF_STATE_REPLAYED',
          'Tentativa de replay bloqueada: este parâmetro state já foi utilizado anteriormente.',
          400
        );
      }

      const now = Date.now();
      // Mandatory application-level expiration check (independent of Firestore TTL background sweep)
      if (typeof data.expiresAt !== 'number' || now >= data.expiresAt) {
        tx.update(stateRef, {
          consumed: true,
          consumedAt: now,
          consumedByInstance: this.instanceId,
        });
        throw new OAuthSecurityError(
          'CSRF_STATE_EXPIRED',
          'Falha na validação de segurança CSRF: o parâmetro state expirou (limite de 10 minutos excedido).',
          400
        );
      }

      // Atomically mark state as consumed (single-use enforcement)
      tx.update(stateRef, {
        consumed: true,
        consumedAt: now,
        consumedByInstance: this.instanceId,
      });

      return {
        ...data,
        consumed: true,
        consumedAt: now,
        consumedByInstance: this.instanceId,
      };
    });
  }

  /**
   * Step 3: Exchanges authorization code for tokens on the backend, fetches user profile
   * (`open_id, display_name, avatar_url`, plus `username` ONLY if `user.info.profile` was granted),
   * encrypts tokens with exclusive 256-bit `OAUTH_ENCRYPTION_KEY` (AES-256-GCM),
   * and persists session in Firestore (`oauth_sessions/{sessionIdHash}`).
   */
  public async handleCallbackExchange(params: {
    code: string;
    state: string;
    clientKeyOverride?: string;
    clientSecretOverride?: string;
  }): Promise<{
    sessionToken: string;
    sessionIdHash: string;
    sessionDoc: FirestoreOAuthSessionDoc;
    targetOrigin: string;
    maxAgeSec: number;
  }> {
    // 0. Ensure exclusive 256-bit encryption key is configured BEFORE consuming state or exchanging code
    resolveEncryptionKeyRing();

    // 1. Consume state atomically from Firestore first
    const stateRecord = await this.consumeStateAtomic(params.state);

    // 2. Validate code and backend credentials
    const authCode = typeof params.code === 'string' ? params.code.trim() : '';
    if (!authCode) {
      throw new OAuthSecurityError(
        'MISSING_AUTH_CODE',
        'Código de autorização (code) ausente no callback do TikTok.',
        400
      );
    }

    const clientKey = params.clientKeyOverride || process.env.TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = params.clientSecretOverride || process.env.TIKTOK_CLIENT_SECRET?.trim();
    if (!clientKey || !clientSecret) {
      throw new OAuthSecurityError(
        'MISSING_SERVER_CREDENTIALS',
        'Credenciais OAuth (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET) ausentes no backend.',
        500
      );
    }

    // 3. Exchange code for tokens at TikTok OAuth v2 endpoint
    const tokenBodyParams: Record<string, string> = {
      client_key: clientKey,
      client_secret: clientSecret,
      code: authCode,
      grant_type: 'authorization_code',
      redirect_uri: stateRecord.redirectUri,
    };

    // Include code_verifier ONLY when PKCE was enabled for this authorization request
    if (stateRecord.pkceEnabled && stateRecord.codeVerifier) {
      tokenBodyParams.code_verifier = stateRecord.codeVerifier;
    }

    const tokenRes = await this.fetcher(TIKTOK_OAUTH_V2_ENDPOINTS.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: new URLSearchParams(tokenBodyParams).toString(),
    });

    const tokenData: Record<string, any> = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      const apiErrMsg = String(
        tokenData.error_description ||
          tokenData.message ||
          tokenData.error ||
          `Falha ao trocar código por token (HTTP ${tokenRes.status}).`
      );
      throw new OAuthSecurityError('TOKEN_EXCHANGE_FAILED', apiErrMsg, 400);
    }

    const accessToken = String(tokenData.access_token);
    const refreshToken = String(tokenData.refresh_token || '');
    const openId = String(tokenData.open_id || '');
    const grantedScope = String(
      tokenData.scope || stateRecord.requestedScopes || 'user.info.basic'
    );
    const expiresInSec = Math.max(60, Number(tokenData.expires_in || 86400));
    const refreshExpiresInSec = Math.max(
      expiresInSec,
      Number(tokenData.refresh_expires_in || 31536000)
    );

    // 4. Fetch public user profile from TikTok API v2 using ONLY fields permitted by grantedScope
    const userInfoEndpoint = resolveUserInfoEndpointForScope(grantedScope);
    let userProfile: TikTokPublicUserProfile = { open_id: openId };
    try {
      const userRes = await this.fetcher(userInfoEndpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userJson: Record<string, any> = await userRes.json().catch(() => ({}));
      if (userJson?.data?.user) {
        const u = userJson.data.user;
        userProfile = {
          open_id: u.open_id || openId,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          ...(u.username ? { username: u.username } : {}),
        };
      }
    } catch (err) {
      console.warn('[TikTokOAuthService] Aviso ao buscar perfil v2:', err);
    }

    // 5. Encrypt tokens with AES-256-GCM (exclusive 256-bit key) and persist session in Firestore
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionIdHash = sha256Hex(sessionToken);
    const now = Date.now();
    const sessionExpiresAt = now + refreshExpiresInSec * 1000;

    const sessionDoc: FirestoreOAuthSessionDoc = {
      sessionIdHash,
      openId,
      scope: grantedScope,
      encryptedAccessToken: encryptTokenAes256Gcm(accessToken),
      encryptedRefreshToken: encryptTokenAes256Gcm(refreshToken),
      accessTokenExpiresAt: now + expiresInSec * 1000,
      refreshTokenExpiresAt: sessionExpiresAt,
      sessionExpiresAt,
      ttlExpireAt: Timestamp.fromMillis(sessionExpiresAt),
      userProfile,
      authenticatedAt: now,
      updatedAt: now,
      rotationCount: 0,
      keyRotationCount: 0,
      rotatedFromHash: null,
      rotatedToHash: null,
      revoked: false,
      revokedAt: null,
      revokedReason: null,
    };

    await setDoc(doc(db, 'oauth_sessions', sessionIdHash), sessionDoc);

    return {
      sessionToken,
      sessionIdHash,
      sessionDoc,
      targetOrigin: stateRecord.targetOrigin,
      maxAgeSec: refreshExpiresInSec,
    };
  }

  /**
   * Rotates the encryption key of an existing persistent session in-place in Firestore
   * when `OAUTH_ENCRYPTION_KEY` has been rotated (previous key -> new primary key)
   * without invalidating the session or losing user access.
   */
  public async rotateSessionEncryptionKey(sessionToken: string): Promise<{
    rotatedKey: boolean;
    activeKeyId: string;
    sessionDoc: FirestoreOAuthSessionDoc;
  }> {
    const cleanToken = typeof sessionToken === 'string' ? sessionToken.trim() : '';
    if (!cleanToken || cleanToken.length < 32) {
      throw new OAuthSecurityError('INVALID_SESSION_TOKEN', 'Token de sessão inválido.', 401);
    }

    const sessionIdHash = sha256Hex(cleanToken);
    const sessionRef = doc(db, 'oauth_sessions', sessionIdHash);

    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists()) {
        throw new OAuthSecurityError('SESSION_NOT_FOUND', 'Sessão não encontrada.', 401);
      }

      const sessionDoc = snap.data() as FirestoreOAuthSessionDoc;
      const now = Date.now();

      if (sessionDoc.revoked) {
        throw new OAuthSecurityError('SESSION_REVOKED', 'Sessão revogada.', 401);
      }

      if (
        typeof sessionDoc.sessionExpiresAt !== 'number' ||
        now >= sessionDoc.sessionExpiresAt ||
        now >= sessionDoc.refreshTokenExpiresAt
      ) {
        tx.update(sessionRef, {
          revoked: true,
          revokedAt: now,
          revokedReason: 'SESSION_EXPIRED',
        });
        throw new OAuthSecurityError('SESSION_EXPIRED', 'Sessão expirada.', 401);
      }

      const accessInfo = decryptTokenWithRotationInfo(sessionDoc.encryptedAccessToken);
      const refreshInfo = decryptTokenWithRotationInfo(sessionDoc.encryptedRefreshToken);

      if (!accessInfo.usedPreviousKey && !refreshInfo.usedPreviousKey) {
        return {
          rotatedKey: false,
          activeKeyId: accessInfo.activePrimaryKeyId,
          sessionDoc,
        };
      }

      const reencryptedAccess = encryptTokenAes256Gcm(accessInfo.plaintext);
      const reencryptedRefresh = encryptTokenAes256Gcm(refreshInfo.plaintext);
      const nextKeyRotationCount = (sessionDoc.keyRotationCount || 0) + 1;

      tx.update(sessionRef, {
        encryptedAccessToken: reencryptedAccess,
        encryptedRefreshToken: reencryptedRefresh,
        keyRotationCount: nextKeyRotationCount,
        updatedAt: now,
      });

      const updatedDoc: FirestoreOAuthSessionDoc = {
        ...sessionDoc,
        encryptedAccessToken: reencryptedAccess,
        encryptedRefreshToken: reencryptedRefresh,
        keyRotationCount: nextKeyRotationCount,
        updatedAt: now,
      };

      return {
        rotatedKey: true,
        activeKeyId: reencryptedAccess.keyId,
        sessionDoc: updatedDoc,
      };
    });
  }

  /**
   * Step 4: Validates a `gio_tiktok_session` token against Firestore (`oauth_sessions/{sessionIdHash}`).
   * - Strictly checks `sessionExpiresAt` and `refreshTokenExpiresAt` on every call (never relying on TTL deletion).
   * - Seamlessly re-encrypts tokens if `OAUTH_ENCRYPTION_KEY` was rotated (`usedPreviousKey === true`).
   * - Automatically refreshes tokens and rotates the session token if `access_token` is expired or expiring soon.
   */
  public async validateAndResolveSession(options: {
    sessionToken: string;
    autoRefresh?: boolean;
    clientKeyOverride?: string;
    clientSecretOverride?: string;
  }): Promise<{
    valid: boolean;
    rotated: boolean;
    keyReencrypted?: boolean;
    newSessionToken?: string;
    sessionDoc?: FirestoreOAuthSessionDoc;
    reason?: string;
  }> {
    const cleanToken = typeof options.sessionToken === 'string' ? options.sessionToken.trim() : '';
    if (!cleanToken || cleanToken.length < 32) {
      return { valid: false, rotated: false, reason: 'MISSING_OR_MALFORMED_TOKEN' };
    }

    const sessionIdHash = sha256Hex(cleanToken);
    const sessionRef = doc(db, 'oauth_sessions', sessionIdHash);
    const snap = await getDoc(sessionRef);

    if (!snap.exists()) {
      return { valid: false, rotated: false, reason: 'SESSION_NOT_FOUND' };
    }

    let sessionDoc = snap.data() as FirestoreOAuthSessionDoc;
    const now = Date.now();

    if (sessionDoc.revoked) {
      return {
        valid: false,
        rotated: false,
        reason: `SESSION_REVOKED:${sessionDoc.revokedReason || 'UNKNOWN'}`,
      };
    }

    // Mandatory application-level expiration check (independent of Firestore TTL sweep)
    if (
      typeof sessionDoc.sessionExpiresAt !== 'number' ||
      typeof sessionDoc.refreshTokenExpiresAt !== 'number' ||
      now >= sessionDoc.sessionExpiresAt ||
      now >= sessionDoc.refreshTokenExpiresAt
    ) {
      await updateDoc(sessionRef, {
        revoked: true,
        revokedAt: now,
        revokedReason: 'SESSION_EXPIRED',
      });
      return { valid: false, rotated: false, reason: 'SESSION_EXPIRED' };
    }

    // Verify token encryption integrity and transparently rotate key if encrypted with OAUTH_ENCRYPTION_KEY_PREVIOUS
    let keyReencrypted = false;
    try {
      const accessCheck = decryptTokenWithRotationInfo(sessionDoc.encryptedAccessToken);
      const refreshCheck = decryptTokenWithRotationInfo(sessionDoc.encryptedRefreshToken);
      if (accessCheck.usedPreviousKey || refreshCheck.usedPreviousKey) {
        const keyRotResult = await this.rotateSessionEncryptionKey(cleanToken);
        keyReencrypted = keyRotResult.rotatedKey;
        sessionDoc = keyRotResult.sessionDoc;
      }
    } catch (err) {
      return {
        valid: false,
        rotated: false,
        reason: `ENCRYPTION_KEY_ERROR:${(err as Error).message}`,
      };
    }

    // Check if access_token is expired or within auto-refresh window (5 minutes)
    const shouldAutoRefresh = options.autoRefresh !== false;
    const isAccessExpiringOrExpired =
      sessionDoc.accessTokenExpiresAt - now <= TOKEN_AUTO_REFRESH_WINDOW_MS;

    if (shouldAutoRefresh && isAccessExpiringOrExpired) {
      try {
        const refreshed = await this.refreshAndRotateSession({
          sessionToken: cleanToken,
          clientKeyOverride: options.clientKeyOverride,
          clientSecretOverride: options.clientSecretOverride,
        });
        return {
          valid: true,
          rotated: true,
          keyReencrypted,
          newSessionToken: refreshed.newSessionToken,
          sessionDoc: refreshed.newSessionDoc,
        };
      } catch (err) {
        if (now >= sessionDoc.accessTokenExpiresAt) {
          return {
            valid: false,
            rotated: false,
            reason: `AUTO_REFRESH_FAILED:${(err as Error).message}`,
          };
        }
      }
    }

    return {
      valid: true,
      rotated: false,
      keyReencrypted,
      sessionDoc,
    };
  }

  /**
   * Step 5: Refreshes OAuth tokens with TikTok v2 (`grant_type=refresh_token`),
   * updates `refresh_token` if TikTok returns a new one, re-encrypts with AES-256-GCM
   * using the primary 256-bit `OAUTH_ENCRYPTION_KEY`, and rotates the persistent session ID (`gio_tiktok_session`).
   */
  public async refreshAndRotateSession(params: {
    sessionToken: string;
    clientKeyOverride?: string;
    clientSecretOverride?: string;
  }): Promise<{
    newSessionToken: string;
    newSessionIdHash: string;
    oldSessionIdHash: string;
    newSessionDoc: FirestoreOAuthSessionDoc;
    maxAgeSec: number;
  }> {
    const cleanToken = typeof params.sessionToken === 'string' ? params.sessionToken.trim() : '';
    if (!cleanToken) {
      throw new OAuthSecurityError('INVALID_SESSION_TOKEN', 'Token de sessão ausente.', 401);
    }

    const oldSessionIdHash = sha256Hex(cleanToken);
    const oldSessionRef = doc(db, 'oauth_sessions', oldSessionIdHash);
    const snap = await getDoc(oldSessionRef);

    if (!snap.exists()) {
      throw new OAuthSecurityError(
        'SESSION_NOT_FOUND',
        'Sessão OAuth não encontrada no banco.',
        401
      );
    }

    const oldSession = snap.data() as FirestoreOAuthSessionDoc;
    if (oldSession.revoked) {
      throw new OAuthSecurityError(
        'SESSION_REVOKED',
        `Sessão já foi revogada ou rotacionada (${oldSession.revokedReason}).`,
        401
      );
    }

    const nowCheck = Date.now();
    // Explicit expiration check before attempting refresh (never relying on Firestore TTL deletion)
    if (
      typeof oldSession.sessionExpiresAt !== 'number' ||
      typeof oldSession.refreshTokenExpiresAt !== 'number' ||
      nowCheck >= oldSession.sessionExpiresAt ||
      nowCheck >= oldSession.refreshTokenExpiresAt
    ) {
      await updateDoc(oldSessionRef, {
        revoked: true,
        revokedAt: nowCheck,
        revokedReason: 'SESSION_EXPIRED',
      });
      throw new OAuthSecurityError(
        'SESSION_EXPIRED',
        'A sessão ou o refresh_token expirou e não pode ser renovada.',
        401
      );
    }

    const currentRefreshToken = decryptTokenAes256Gcm(oldSession.encryptedRefreshToken);
    if (!currentRefreshToken) {
      throw new OAuthSecurityError(
        'MISSING_REFRESH_TOKEN',
        'Refresh token indisponível ou inválido para renovação.',
        401
      );
    }

    const clientKey = params.clientKeyOverride || process.env.TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = params.clientSecretOverride || process.env.TIKTOK_CLIENT_SECRET?.trim();
    if (!clientKey || !clientSecret) {
      throw new OAuthSecurityError(
        'MISSING_SERVER_CREDENTIALS',
        'Credenciais OAuth não configuradas no backend para renovação.',
        500
      );
    }

    const tokenRes = await this.fetcher(TIKTOK_OAUTH_V2_ENDPOINTS.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: currentRefreshToken,
      }).toString(),
    });

    const tokenData: Record<string, any> = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      const errMsg = String(
        tokenData.error_description || tokenData.error || 'Falha ao renovar token OAuth no TikTok.'
      );
      throw new OAuthSecurityError('REFRESH_FAILED', errMsg, 401);
    }

    const newAccessToken = String(tokenData.access_token);
    const updatedRefreshToken = tokenData.refresh_token
      ? String(tokenData.refresh_token)
      : currentRefreshToken;

    const now = Date.now();
    const expiresInSec = Math.max(60, Number(tokenData.expires_in || 86400));
    const refreshExpiresInSec = tokenData.refresh_expires_in
      ? Math.max(expiresInSec, Number(tokenData.refresh_expires_in))
      : Math.max(expiresInSec, Math.floor((oldSession.refreshTokenExpiresAt - now) / 1000));

    const newSessionToken = crypto.randomBytes(32).toString('hex');
    const newSessionIdHash = sha256Hex(newSessionToken);
    const newSessionRef = doc(db, 'oauth_sessions', newSessionIdHash);
    const newSessionExpiresAt = now + refreshExpiresInSec * 1000;

    const newSessionDoc: FirestoreOAuthSessionDoc = {
      sessionIdHash: newSessionIdHash,
      openId: String(tokenData.open_id || oldSession.openId),
      scope: String(tokenData.scope || oldSession.scope),
      encryptedAccessToken: encryptTokenAes256Gcm(newAccessToken),
      encryptedRefreshToken: encryptTokenAes256Gcm(updatedRefreshToken),
      accessTokenExpiresAt: now + expiresInSec * 1000,
      refreshTokenExpiresAt: newSessionExpiresAt,
      sessionExpiresAt: newSessionExpiresAt,
      ttlExpireAt: Timestamp.fromMillis(newSessionExpiresAt),
      userProfile: oldSession.userProfile,
      authenticatedAt: oldSession.authenticatedAt,
      updatedAt: now,
      rotationCount: (oldSession.rotationCount || 0) + 1,
      keyRotationCount: oldSession.keyRotationCount || 0,
      rotatedFromHash: oldSessionIdHash,
      rotatedToHash: null,
      revoked: false,
      revokedAt: null,
      revokedReason: null,
    };

    const emptyCipher = createEmptyEncryptedPayload(newSessionDoc.encryptedAccessToken.keyId);

    await runTransaction(db, async (tx) => {
      const checkSnap = await tx.get(oldSessionRef);
      if (!checkSnap.exists() || checkSnap.data()?.revoked) {
        throw new OAuthSecurityError(
          'CONCURRENT_ROTATION_DETECTED',
          'A sessão já foi rotacionada ou revogada por outra requisição.',
          401
        );
      }

      tx.update(oldSessionRef, {
        revoked: true,
        revokedAt: now,
        revokedReason: 'ROTATED',
        rotatedToHash: newSessionIdHash,
        encryptedAccessToken: emptyCipher,
        encryptedRefreshToken: emptyCipher,
        updatedAt: now,
      });

      tx.set(newSessionRef, newSessionDoc);
    });

    return {
      newSessionToken,
      newSessionIdHash,
      oldSessionIdHash,
      newSessionDoc,
      maxAgeSec: refreshExpiresInSec,
    };
  }

  /**
   * Step 6: Revokes tokens on TikTok v2 (`POST https://open.tiktokapis.com/v2/oauth/revoke/`),
   * terminates the session, and wipes encrypted token ciphertexts in Firestore.
   */
  public async revokeAndLogoutSession(params: {
    sessionToken: string;
    clientKeyOverride?: string;
    clientSecretOverride?: string;
  }): Promise<{ revokedInFirestore: boolean; revokedAtTikTok: boolean }> {
    const cleanToken = typeof params.sessionToken === 'string' ? params.sessionToken.trim() : '';
    if (!cleanToken) {
      return { revokedInFirestore: false, revokedAtTikTok: false };
    }

    const sessionIdHash = sha256Hex(cleanToken);
    const sessionRef = doc(db, 'oauth_sessions', sessionIdHash);
    const snap = await getDoc(sessionRef);

    if (!snap.exists()) {
      return { revokedInFirestore: false, revokedAtTikTok: false };
    }

    const sessionDoc = snap.data() as FirestoreOAuthSessionDoc;
    let revokedAtTikTok = false;

    const clientKey = params.clientKeyOverride || process.env.TIKTOK_CLIENT_KEY?.trim();
    const clientSecret = params.clientSecretOverride || process.env.TIKTOK_CLIENT_SECRET?.trim();

    if (!sessionDoc.revoked && Date.now() < sessionDoc.sessionExpiresAt) {
      try {
        const accessToken = decryptTokenAes256Gcm(sessionDoc.encryptedAccessToken);
        if (accessToken && clientKey && clientSecret) {
          const revokeRes = await this.fetcher(TIKTOK_OAUTH_V2_ENDPOINTS.revoke, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_key: clientKey,
              client_secret: clientSecret,
              token: accessToken,
            }).toString(),
          });
          revokedAtTikTok = revokeRes.ok;
        }
      } catch (err) {
        console.warn('[TikTokOAuthService] Aviso ao revogar token no TikTok:', err);
      }
    }

    const emptyCipher = createEmptyEncryptedPayload('wiped_on_logout');

    const now = Date.now();
    await updateDoc(sessionRef, {
      revoked: true,
      revokedAt: now,
      revokedReason: 'USER_LOGOUT',
      encryptedAccessToken: emptyCipher,
      encryptedRefreshToken: emptyCipher,
      updatedAt: now,
    });

    return { revokedInFirestore: true, revokedAtTikTok };
  }

  public formatSessionCookie(sessionToken: string, maxAgeSec: number): string {
    return `${SESSION_COOKIE_NAME}=${sessionToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${Math.max(
      0,
      Math.floor(maxAgeSec)
    )}`;
  }

  public formatClearSessionCookie(): string {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
  }
}

export const tiktokOAuthService = new TikTokOAuthService();
