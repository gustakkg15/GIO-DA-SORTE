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
export const INITIATOR_COOKIE_NAME = 'tiktok_oauth_initiator';
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

export type TikTokOAuthFlowMode = 'LOGIN' | 'LINK';

export interface FirestoreOAuthStateDoc {
  stateHash: string;
  redirectUri: string;
  targetOrigin: string;
  codeVerifier: string | null;
  pkceEnabled: boolean;
  requestedScopes: string;
  flowMode?: TikTokOAuthFlowMode;
  initiatorBindingHash?: string | null;
  linkTargetUid?: string | null;
  reauthVerified?: boolean;
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
  firebaseUid?: string | null;
  flowMode?: TikTokOAuthFlowMode;
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

export interface FirestoreTikTokIdentityDoc {
  identityDocId: string;
  openIdHash: string;
  openId: string;
  uid: string;
  displayName: string;
  avatarUrl: string;
  username?: string | null;
  scope: string;
  linkedAt: number;
  updatedAt: number;
  bindingVersion: number;
  lastOperationId: string;
  createdInOperationId?: string | null;
  unlinked?: boolean;
  unlinkedAt?: number | null;
}

export interface FirestoreUserTikTokVaultDoc {
  uid: string;
  openId: string;
  scope: string;
  encryptedAccessToken: EncryptedPayload;
  encryptedRefreshToken: EncryptedPayload;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  updatedAt: number;
  bindingVersion?: number;
  lastOperationId?: string;
  revoked: boolean;
  revokedAt?: number | null;
}

export interface TikTokIdentityResolutionResult {
  flowMode: TikTokOAuthFlowMode;
  uid: string;
  identityDocId: string;
  openId: string;
  isNewUser: boolean;
  linkedToExistingAccount: boolean;
  bindingVersion: number;
  operationId: string;
  userProfile: TikTokPublicUserProfile;
  firebaseCustomToken?: string | null;
}

export interface TokenFetcherResponse {
  ok: boolean;
  status: number;
  json: () => Promise<Record<string, any>>;
}

export type HttpFetcher = (url: string, init?: RequestInit) => Promise<TokenFetcherResponse>;

/**
 * Generates a deterministic, namespaced SHA-256 document ID for `tiktok_identities/{identityDocId}`.
 * Preserves 1-to-1 uniqueness and O(1) lookup without exposing the raw `open_id` in the Firestore document path.
 */
export function deriveTikTokIdentityDocId(openIdOrDocId: string): string {
  const clean = typeof openIdOrDocId === 'string' ? openIdOrDocId.trim() : '';
  if (!clean || clean.length < 3 || /\s/.test(clean)) {
    throw new OAuthSecurityError(
      'INVALID_TIKTOK_OPEN_ID',
      'O identificador open_id retornado pelo TikTok é inválido ou vazio.',
      400
    );
  }
  if (/^tid_[a-f0-9]{64}$/.test(clean)) {
    return clean;
  }
  return `tid_${sha256Hex(`gio_da_sorte_tiktok_identity_doc_v1:${clean}`)}`;
}

// ==========================================
// 1.5 TRANSACTIONAL IDENTITY STORAGE ADAPTER
// ==========================================

export interface ITikTokOAuthTransactionContext {
  getState(stateHash: string): Promise<FirestoreOAuthStateDoc | null>;
  setState(stateHash: string, docData: FirestoreOAuthStateDoc): Promise<void>;
  updateState(stateHash: string, patch: Partial<FirestoreOAuthStateDoc>): Promise<void>;
  getSession(sessionIdHash: string): Promise<FirestoreOAuthSessionDoc | null>;
  setSession(sessionIdHash: string, docData: FirestoreOAuthSessionDoc): Promise<void>;
  updateSession(sessionIdHash: string, patch: Partial<FirestoreOAuthSessionDoc>): Promise<void>;
  getIdentity(openIdOrDocId: string): Promise<FirestoreTikTokIdentityDoc | null>;
  setIdentity(openIdOrDocId: string, docData: FirestoreTikTokIdentityDoc): Promise<void>;
  deleteIdentity(openIdOrDocId: string): Promise<void>;
  getUserDoc(uid: string): Promise<Record<string, any> | null>;
  setUserDoc(uid: string, docData: Record<string, any>, merge?: boolean): Promise<void>;
  deleteUserDoc(uid: string): Promise<void>;
  getUserVault(uid: string): Promise<FirestoreUserTikTokVaultDoc | null>;
  setUserVault(uid: string, docData: FirestoreUserTikTokVaultDoc): Promise<void>;
  deleteUserVault(uid: string): Promise<void>;
}

export interface ITikTokOAuthStorageAdapter {
  setStateDirect(stateHash: string, docData: FirestoreOAuthStateDoc): Promise<void>;
  getStateDirect(stateHash: string): Promise<FirestoreOAuthStateDoc | null>;
  setSessionDirect(sessionIdHash: string, docData: FirestoreOAuthSessionDoc): Promise<void>;
  getSessionDirect(sessionIdHash: string): Promise<FirestoreOAuthSessionDoc | null>;
  updateSessionDirect(sessionIdHash: string, patch: Partial<FirestoreOAuthSessionDoc>): Promise<void>;
  revokeSessionsForUidDirect(uid: string, reason: string): Promise<number>;
  getIdentityDirect(openIdOrDocId: string): Promise<FirestoreTikTokIdentityDoc | null>;
  getUserDocDirect(uid: string): Promise<Record<string, any> | null>;
  getUserVaultDirect(uid: string): Promise<FirestoreUserTikTokVaultDoc | null>;
  runAtomicTransaction<T>(fn: (tx: ITikTokOAuthTransactionContext) => Promise<T>): Promise<T>;
}

/**
 * In-memory ACID transactional storage adapter with serialized mutex locking and snapshot rollback.
 * Keyed strictly by `deriveTikTokIdentityDocId(openId)` (`tid_<64_hex>`) for `identities`.
 */
export class InMemoryTikTokOAuthStorageAdapter implements ITikTokOAuthStorageAdapter {
  public readonly states = new Map<string, FirestoreOAuthStateDoc>();
  public readonly sessions = new Map<string, FirestoreOAuthSessionDoc>();
  public readonly identities = new Map<string, FirestoreTikTokIdentityDoc>();
  public readonly users = new Map<string, Record<string, any>>();
  public readonly vaults = new Map<string, FirestoreUserTikTokVaultDoc>();
  private txMutex: Promise<void> = Promise.resolve();

  private clone<V>(val: V): V {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    if (typeof (val as any).toMillis === 'function') {
      return Timestamp.fromMillis((val as any).toMillis()) as unknown as V;
    }
    if (Array.isArray(val)) {
      return val.map((item) => this.clone(item)) as unknown as V;
    }
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      copy[k] = this.clone(v);
    }
    return copy as V;
  }

  public async setStateDirect(stateHash: string, docData: FirestoreOAuthStateDoc): Promise<void> {
    this.states.set(stateHash, this.clone(docData));
  }

  public async getStateDirect(stateHash: string): Promise<FirestoreOAuthStateDoc | null> {
    const found = this.states.get(stateHash);
    return found ? this.clone(found) : null;
  }

  public async setSessionDirect(sessionIdHash: string, docData: FirestoreOAuthSessionDoc): Promise<void> {
    this.sessions.set(sessionIdHash, this.clone(docData));
  }

  public async getSessionDirect(sessionIdHash: string): Promise<FirestoreOAuthSessionDoc | null> {
    const found = this.sessions.get(sessionIdHash);
    return found ? this.clone(found) : null;
  }

  public async updateSessionDirect(sessionIdHash: string, patch: Partial<FirestoreOAuthSessionDoc>): Promise<void> {
    const existing = this.sessions.get(sessionIdHash);
    if (!existing) {
      throw new OAuthSecurityError('SESSION_NOT_FOUND', 'Sessão não encontrada.', 401);
    }
    this.sessions.set(sessionIdHash, this.clone({ ...existing, ...patch }));
  }

  public async revokeSessionsForUidDirect(uid: string, reason: string): Promise<number> {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return 0;
    let count = 0;
    const now = Date.now();
    const emptyCipher = createEmptyEncryptedPayload('wiped_on_unlink');
    for (const [hash, sess] of this.sessions.entries()) {
      if (sess.firebaseUid === cleanUid && !sess.revoked) {
        this.sessions.set(
          hash,
          this.clone({
            ...sess,
            revoked: true,
            revokedAt: now,
            revokedReason: reason,
            encryptedAccessToken: emptyCipher,
            encryptedRefreshToken: emptyCipher,
            updatedAt: now,
          })
        );
        count++;
      }
    }
    return count;
  }

  public async getIdentityDirect(openIdOrDocId: string): Promise<FirestoreTikTokIdentityDoc | null> {
    const docId = deriveTikTokIdentityDocId(openIdOrDocId);
    const found = this.identities.get(docId);
    return found ? this.clone(found) : null;
  }

  public getIdentityDocumentIds(): string[] {
    return Array.from(this.identities.keys());
  }

  public async getUserDocDirect(uid: string): Promise<Record<string, any> | null> {
    const found = this.users.get(uid);
    return found ? this.clone(found) : null;
  }

  public async getUserVaultDirect(uid: string): Promise<FirestoreUserTikTokVaultDoc | null> {
    const found = this.vaults.get(uid);
    return found ? this.clone(found) : null;
  }

  public async runAtomicTransaction<T>(
    fn: (tx: ITikTokOAuthTransactionContext) => Promise<T>
  ): Promise<T> {
    let releaseLock!: () => void;
    const prevMutex = this.txMutex;
    this.txMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await prevMutex;

    // Take full snapshot before transaction for atomic rollback on failure
    const snapStates = new Map(this.states);
    const snapSessions = new Map(this.sessions);
    const snapIdentities = new Map(this.identities);
    const snapUsers = new Map(this.users);
    const snapVaults = new Map(this.vaults);

    const txContext: ITikTokOAuthTransactionContext = {
      getState: async (stateHash) => this.getStateDirect(stateHash),
      setState: async (stateHash, docData) => this.setStateDirect(stateHash, docData),
      updateState: async (stateHash, patch) => {
        const cur = this.states.get(stateHash);
        if (!cur) throw new Error(`State ${stateHash} not found`);
        this.states.set(stateHash, this.clone({ ...cur, ...patch }));
      },
      getSession: async (sessionIdHash) => this.getSessionDirect(sessionIdHash),
      setSession: async (sessionIdHash, docData) => this.setSessionDirect(sessionIdHash, docData),
      updateSession: async (sessionIdHash, patch) => this.updateSessionDirect(sessionIdHash, patch),
      getIdentity: async (openIdOrDocId) => this.getIdentityDirect(openIdOrDocId),
      setIdentity: async (openIdOrDocId, docData) => {
        const docId = deriveTikTokIdentityDocId(openIdOrDocId);
        this.identities.set(docId, this.clone({ ...docData, identityDocId: docId }));
      },
      deleteIdentity: async (openIdOrDocId) => {
        const docId = deriveTikTokIdentityDocId(openIdOrDocId);
        this.identities.delete(docId);
      },
      getUserDoc: async (uid) => this.getUserDocDirect(uid),
      setUserDoc: async (uid, docData, merge = true) => {
        const cur = this.users.get(uid) || {};
        const next = merge ? { ...cur, ...docData } : { ...docData };
        this.users.set(uid, this.clone(next));
      },
      deleteUserDoc: async (uid) => {
        this.users.delete(uid);
      },
      getUserVault: async (uid) => this.getUserVaultDirect(uid),
      setUserVault: async (uid, docData) => {
        this.vaults.set(uid, this.clone(docData));
      },
      deleteUserVault: async (uid) => {
        this.vaults.delete(uid);
      },
    };

    try {
      const result = await fn(txContext);
      return result;
    } catch (err) {
      // Atomic rollback on error
      this.states.clear();
      for (const [k, v] of snapStates.entries()) this.states.set(k, v);
      this.sessions.clear();
      for (const [k, v] of snapSessions.entries()) this.sessions.set(k, v);
      this.identities.clear();
      for (const [k, v] of snapIdentities.entries()) this.identities.set(k, v);
      this.users.clear();
      for (const [k, v] of snapUsers.entries()) this.users.set(k, v);
      this.vaults.clear();
      for (const [k, v] of snapVaults.entries()) this.vaults.set(k, v);
      throw err;
    } finally {
      releaseLock();
    }
  }
}

/**
 * Default Firestore storage adapter.
 * Uses real Firestore (`oauth_states` and `oauth_sessions`) and synchronizes identity bindings
 * (`tiktok_identities/{identityDocId}`, `users/{uid}`, `users/{uid}/private_tokens/tiktok`) with
 * deterministic SHA-256 namespaced document IDs (`tid_<64_hex>`), never exposing raw `open_id` in the path.
 */
export class FirestoreTikTokOAuthStorageAdapter implements ITikTokOAuthStorageAdapter {
  private readonly identityMirror = new InMemoryTikTokOAuthStorageAdapter();

  public async setStateDirect(stateHash: string, docData: FirestoreOAuthStateDoc): Promise<void> {
    await setDoc(doc(db, 'oauth_states', stateHash), docData);
    await this.identityMirror.setStateDirect(stateHash, docData);
  }

  public async getStateDirect(stateHash: string): Promise<FirestoreOAuthStateDoc | null> {
    const snap = await getDoc(doc(db, 'oauth_states', stateHash));
    if (!snap.exists()) return null;
    return snap.data() as FirestoreOAuthStateDoc;
  }

  public async setSessionDirect(sessionIdHash: string, docData: FirestoreOAuthSessionDoc): Promise<void> {
    await setDoc(doc(db, 'oauth_sessions', sessionIdHash), docData);
    await this.identityMirror.setSessionDirect(sessionIdHash, docData);
  }

  public async getSessionDirect(sessionIdHash: string): Promise<FirestoreOAuthSessionDoc | null> {
    const snap = await getDoc(doc(db, 'oauth_sessions', sessionIdHash));
    if (!snap.exists()) return null;
    return snap.data() as FirestoreOAuthSessionDoc;
  }

  public async updateSessionDirect(sessionIdHash: string, patch: Partial<FirestoreOAuthSessionDoc>): Promise<void> {
    await updateDoc(doc(db, 'oauth_sessions', sessionIdHash), patch as Record<string, any>);
    try {
      await this.identityMirror.updateSessionDirect(sessionIdHash, patch);
    } catch {
      // Ignore if session was not mirrored in memory
    }
  }

  public async revokeSessionsForUidDirect(uid: string, reason: string): Promise<number> {
    return await this.identityMirror.revokeSessionsForUidDirect(uid, reason);
  }

  public async getIdentityDirect(openIdOrDocId: string): Promise<FirestoreTikTokIdentityDoc | null> {
    const docId = deriveTikTokIdentityDocId(openIdOrDocId);
    const local = await this.identityMirror.getIdentityDirect(docId);
    if (local) return local;
    try {
      const snap = await getDoc(doc(db, 'tiktok_identities', docId));
      if (snap.exists()) {
        const data = snap.data() as FirestoreTikTokIdentityDoc;
        await this.identityMirror.runAtomicTransaction(async (tx) => {
          await tx.setIdentity(docId, data);
        });
        return data;
      }
    } catch {
      // Locked by firestore.rules when accessed via unprivileged client SDK
    }
    return null;
  }

  public async getUserDocDirect(uid: string): Promise<Record<string, any> | null> {
    const local = await this.identityMirror.getUserDocDirect(uid);
    if (local) return local;
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data() as Record<string, any>;
        await this.identityMirror.runAtomicTransaction(async (tx) => {
          await tx.setUserDoc(uid, data, true);
        });
        return data;
      }
    } catch {
      // Ignore client SDK rule restriction when reading from backend without user auth context
    }
    return null;
  }

  public async getUserVaultDirect(uid: string): Promise<FirestoreUserTikTokVaultDoc | null> {
    return await this.identityMirror.getUserVaultDirect(uid);
  }

  public async runAtomicTransaction<T>(
    fn: (tx: ITikTokOAuthTransactionContext) => Promise<T>
  ): Promise<T> {
    return await this.identityMirror.runAtomicTransaction(fn);
  }
}

/**
 * Generates a deterministic, controlled GIO Firebase UID from a verified TikTok `open_id`.
 * Ensures `open_id` is never confused with a raw Firebase UID or username, while guaranteeing
 * idempotency if two concurrent requests resolve the same new TikTok identity.
 */
export function deriveControlledFirebaseUidFromOpenId(openId: string): string {
  const cleanOpenId = typeof openId === 'string' ? openId.trim() : '';
  if (!cleanOpenId || cleanOpenId.length < 3 || /\s/.test(cleanOpenId)) {
    throw new OAuthSecurityError(
      'INVALID_TIKTOK_OPEN_ID',
      'O identificador open_id retornado pelo TikTok é inválido ou vazio.',
      400
    );
  }
  return `gio_tt_${sha256Hex(`tiktok_open_id_v1:${cleanOpenId}`).slice(0, 24)}`;
}

/**
 * Blocks any attempt by the client/frontend to supply `open_id`, `uid`, `firebaseUid`,
 * `access_token`, `refresh_token`, or authenticate using only `@username`.
 */
export function assertNoClientIdentityForgery(
  payload: Record<string, any> | null | undefined
): void {
  if (!payload || typeof payload !== 'object') return;

  const forbiddenIdentityFields = [
    'open_id',
    'openId',
    'uid',
    'firebaseUid',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'customToken',
    'firebaseCustomToken',
  ];

  for (const field of forbiddenIdentityFields) {
    if (payload[field] !== undefined && payload[field] !== null && String(payload[field]).trim() !== '') {
      throw new OAuthSecurityError(
        'CLIENT_IDENTITY_FORGERY_BLOCKED',
        `Tentativa de falsificação de identidade bloqueada: o cliente não pode informar o campo "${field}". A identidade é obtida exclusivamente pela API oficial do TikTok no backend.`,
        403
      );
    }
  }

  if (
    (payload.username !== undefined || payload.handle !== undefined) &&
    !payload.code &&
    !payload.state
  ) {
    throw new OAuthSecurityError(
      'USERNAME_NOT_AUTH_FACTOR',
      'Autenticação recusada: @username é apenas um identificador visual e nunca pode autenticar uma conta sem validação OAuth oficial do TikTok.',
      403
    );
  }
}

/**
 * Deeply redacts any sensitive OAuth tokens, ciphertexts, secrets, or encryption keys
 * before logging or returning diagnostic payloads.
 */
export function redactSensitiveOAuthData<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    const rawEncKey = process.env.OAUTH_ENCRYPTION_KEY?.trim();
    const rawSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    let sanitized = input as string;
    if (rawEncKey && rawEncKey.length >= 8 && sanitized.includes(rawEncKey)) {
      sanitized = sanitized.split(rawEncKey).join('[REDACTED_OAUTH_ENCRYPTION_KEY]');
    }
    if (rawSecret && rawSecret.length >= 8 && sanitized.includes(rawSecret)) {
      sanitized = sanitized.split(rawSecret).join('[REDACTED_TIKTOK_CLIENT_SECRET]');
    }
    return sanitized as unknown as T;
  }
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveOAuthData(item)) as unknown as T;
  }

  const sensitiveKeys = new Set([
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'encryptedAccessToken',
    'encryptedRefreshToken',
    'client_secret',
    'clientSecret',
    'OAUTH_ENCRYPTION_KEY',
    'OAUTH_ENCRYPTION_KEY_PREVIOUS',
    'TIKTOK_CLIENT_SECRET',
    'ciphertext',
    'private_key',
  ]);

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input as Record<string, any>)) {
    if (sensitiveKeys.has(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSensitiveOAuthData(v);
    }
  }
  return out as T;
}

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
  private storageAdapter: ITikTokOAuthStorageAdapter;
  private customTokenGenerator?: (uid: string, claims?: Record<string, any>) => Promise<string>;
  private onUnlinkStopWorkersHandler?: (
    uid: string,
    openId: string | null
  ) => Promise<{ stoppedWorkers: number; releasedLease: boolean }>;
  private beforeCustomTokenHookForTests?: (ctx: {
    uid: string;
    openId: string;
    identityDocId: string;
    operationId: string;
    bindingVersion: number;
  }) => Promise<void>;

  constructor(
    instanceId?: string,
    customFetcher?: HttpFetcher,
    customStorageAdapter?: ITikTokOAuthStorageAdapter,
    customTokenGenerator?: (uid: string, claims?: Record<string, any>) => Promise<string>
  ) {
    this.instanceId = instanceId || `cloudrun_inst_${crypto.randomBytes(6).toString('hex')}`;
    this.fetcher = customFetcher || ((url, init) => fetch(url, init));
    this.storageAdapter = customStorageAdapter || new FirestoreTikTokOAuthStorageAdapter();
    this.customTokenGenerator = customTokenGenerator;
  }

  public setFetcher(customFetcher: HttpFetcher): void {
    this.fetcher = customFetcher;
  }

  public setStorageAdapter(adapter: ITikTokOAuthStorageAdapter): void {
    this.storageAdapter = adapter;
  }

  public getStorageAdapter(): ITikTokOAuthStorageAdapter {
    return this.storageAdapter;
  }

  public setCustomTokenGenerator(
    generator: ((uid: string, claims?: Record<string, any>) => Promise<string>) | undefined
  ): void {
    this.customTokenGenerator = generator;
  }

  public setOnUnlinkStopWorkersHandler(
    handler:
      | ((
          uid: string,
          openId: string | null
        ) => Promise<{ stoppedWorkers: number; releasedLease: boolean }>)
      | undefined
  ): void {
    this.onUnlinkStopWorkersHandler = handler;
  }

  public setBeforeCustomTokenHookForTests(
    hook:
      | ((ctx: {
          uid: string;
          openId: string;
          identityDocId: string;
          operationId: string;
          bindingVersion: number;
        }) => Promise<void>)
      | undefined
  ): void {
    this.beforeCustomTokenHookForTests = hook;
  }

  public diagnoseConfiguration(options?: {
    req?: Request;
    explicitOrigin?: string;
  }): OAuthDiagnosticReport {
    return diagnoseOAuthConfiguration(options);
  }

  /**
   * Step 1: Creates a persistent, shared OAuth CSRF state (`oauth_states/{stateHash}`)
   * and returns the TikTok Login Kit for Web v2 Authorization URL.
   *
   * Supports two strictly separated flows:
   * - `LOGIN` (Flow 1 — First Access / Login with TikTok): Authenticates existing linked UID or creates a new controlled GIO identity.
   * - `LINK` (Flow 2 — Link TikTok to Existing GIO Account): Requires authenticated Firebase UID + recent step-up reauthentication.
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
    flowMode?: TikTokOAuthFlowMode;
    initiatorToken?: string;
    generateInitiatorToken?: boolean;
    linkTargetUid?: string;
    reauthVerified?: boolean;
  }): Promise<{
    url: string;
    state: string;
    stateHash: string;
    initiatorToken: string | null;
    initiatorBindingHash: string | null;
    flowMode: TikTokOAuthFlowMode;
    linkTargetUid: string | null;
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

    const flowMode: TikTokOAuthFlowMode = options?.flowMode === 'LINK' ? 'LINK' : 'LOGIN';
    const linkTargetUid = options?.linkTargetUid ? String(options.linkTargetUid).trim() : null;

    if (flowMode === 'LINK') {
      if (!linkTargetUid) {
        throw new OAuthSecurityError(
          'LINK_REQUIRES_AUTHENTICATED_UID',
          'Vincular uma conta TikTok exige uma sessão GIO autenticada (UID ausente).',
          401
        );
      }
      if (options?.reauthVerified !== true) {
        throw new OAuthSecurityError(
          'LINK_REQUIRES_REAUTHENTICATION',
          'Vincular uma conta TikTok a uma conta GIO existente exige confirmação de senha ou Google Auth recente.',
          403
        );
      }
    }

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

    let initiatorToken: string | null = null;
    let initiatorBindingHash: string | null = null;
    if (options?.initiatorToken && options.initiatorToken.trim().length >= 16) {
      initiatorToken = options.initiatorToken.trim();
      initiatorBindingHash = sha256Hex(initiatorToken);
    } else if (options?.generateInitiatorToken || flowMode === 'LINK') {
      initiatorToken = crypto.randomBytes(32).toString('hex');
      initiatorBindingHash = sha256Hex(initiatorToken);
    }

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
      flowMode,
      initiatorBindingHash,
      linkTargetUid: flowMode === 'LINK' ? linkTargetUid : null,
      reauthVerified: flowMode === 'LINK' ? true : false,
      createdAt: now,
      expiresAt,
      ttlExpireAt: Timestamp.fromMillis(expiresAt),
      consumed: false,
      consumedAt: null,
      createdByInstance: this.instanceId,
    };

    await this.storageAdapter.setStateDirect(stateHash, stateDoc);

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
      initiatorToken,
      initiatorBindingHash,
      flowMode,
      linkTargetUid: flowMode === 'LINK' ? linkTargetUid : null,
      redirectUri,
      targetOrigin,
      scopes: validatedScopes,
      pkceEnabled: usePkce,
      expiresAt,
    };
  }

  /**
   * Step 2: Atomically validates and consumes the OAuth `state` (`runTransaction`).
   * Guarantees single-use, validates `expiresAt` (never relying on automatic Firestore TTL deletion),
   * and verifies `initiatorToken` binding when `initiatorBindingHash` was set on the state.
   */
  public async consumeStateAtomic(
    rawState: string,
    options?: { initiatorToken?: string | null }
  ): Promise<FirestoreOAuthStateDoc> {
    const cleanState = typeof rawState === 'string' ? rawState.trim() : '';
    if (!cleanState || cleanState.length < 16) {
      throw new OAuthSecurityError(
        'CSRF_STATE_INVALID',
        'Falha na validação de segurança CSRF: parâmetro state ausente ou malformado.',
        400
      );
    }

    const stateHash = sha256Hex(cleanState);

    if (this.storageAdapter instanceof FirestoreTikTokOAuthStorageAdapter) {
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

        if (data.initiatorBindingHash) {
          const providedInitiator = options?.initiatorToken
            ? String(options.initiatorToken).trim()
            : '';
          if (!providedInitiator || sha256Hex(providedInitiator) !== data.initiatorBindingHash) {
            throw new OAuthSecurityError(
              'CSRF_INITIATOR_MISMATCH',
              'Violação de sessão OAuth (CSRF): o callback não pertence à sessão/navegador que iniciou o fluxo.',
              403
            );
          }
        }

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

    // Isolated transactional adapter path (used in automated unit/integration test suites)
    return await this.storageAdapter.runAtomicTransaction(async (tx) => {
      const data = await tx.getState(stateHash);
      if (!data) {
        throw new OAuthSecurityError(
          'CSRF_STATE_NOT_FOUND',
          'Falha na validação de segurança CSRF: state inexistente ou não emitido por este aplicativo.',
          400
        );
      }

      if (data.consumed) {
        throw new OAuthSecurityError(
          'CSRF_STATE_REPLAYED',
          'Tentativa de replay bloqueada: este parâmetro state já foi utilizado anteriormente.',
          400
        );
      }

      const now = Date.now();
      if (typeof data.expiresAt !== 'number' || now >= data.expiresAt) {
        await tx.updateState(stateHash, {
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

      if (data.initiatorBindingHash) {
        const providedInitiator = options?.initiatorToken
          ? String(options.initiatorToken).trim()
          : '';
        if (!providedInitiator || sha256Hex(providedInitiator) !== data.initiatorBindingHash) {
          throw new OAuthSecurityError(
            'CSRF_INITIATOR_MISMATCH',
            'Violação de sessão OAuth (CSRF): o callback não pertence à sessão/navegador que iniciou o fluxo.',
            403
          );
        }
      }

      await tx.updateState(stateHash, {
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
   * Conditional, version-and-ownership-verified compensation executed ONLY if external
   * Firebase Custom Token issuance fails AFTER the Firestore transaction has already committed.
   *
   * Critical invariants:
   * 1. Firestore transactions and Firebase Admin Custom Token issuance are two distinct systems;
   *    we never claim they execute in a single atomic transaction.
   * 2. Before rolling back or removing any record, this compensation transaction verifies that:
   *    - `currentIdentity.uid === outcome.uid`
   *    - `currentIdentity.bindingVersion === outcome.bindingVersion`
   *    - `currentIdentity.lastOperationId === outcome.operationId`
   * 3. If a concurrent operation has already updated the binding (`bindingVersion` incremented or
   *    `lastOperationId` changed), compensation MUST NOT delete or overwrite the newer state.
   */
  private async compensateFailedIdentityBinding(outcome: {
    operationId: string;
    identityDocId: string;
    openId: string;
    uid: string;
    bindingVersion: number;
    createdNewIdentityDoc: boolean;
    previousIdentitySnapshot: FirestoreTikTokIdentityDoc | null;
    createdNewUserDoc: boolean;
    previousUserSnapshot: Record<string, any> | null;
    createdNewVaultDoc: boolean;
    previousVaultSnapshot: FirestoreUserTikTokVaultDoc | null;
  }): Promise<{ compensated: boolean; skippedReason?: string }> {
    return await this.storageAdapter.runAtomicTransaction(async (tx) => {
      const currentIdentity = await tx.getIdentity(outcome.openId);
      if (!currentIdentity) {
        return { compensated: false, skippedReason: 'IDENTITY_ALREADY_REMOVED' };
      }

      // Strictly verify ownership and version before rolling back
      if (
        currentIdentity.uid !== outcome.uid ||
        currentIdentity.bindingVersion !== outcome.bindingVersion ||
        currentIdentity.lastOperationId !== outcome.operationId
      ) {
        return {
          compensated: false,
          skippedReason: 'CONCURRENT_MODIFICATION_DETECTED',
        };
      }

      if (outcome.createdNewIdentityDoc || !outcome.previousIdentitySnapshot) {
        await tx.deleteIdentity(outcome.openId);
      } else {
        await tx.setIdentity(outcome.openId, outcome.previousIdentitySnapshot);
      }

      const currentUserDoc = await tx.getUserDoc(outcome.uid);
      if (
        currentUserDoc &&
        currentUserDoc.lastTikTokOperationId === outcome.operationId
      ) {
        if (outcome.createdNewUserDoc || !outcome.previousUserSnapshot) {
          await tx.deleteUserDoc(outcome.uid);
        } else {
          await tx.setUserDoc(outcome.uid, outcome.previousUserSnapshot, false);
        }
      }

      const currentVault = await tx.getUserVault(outcome.uid);
      if (currentVault) {
        if (outcome.createdNewVaultDoc || !outcome.previousVaultSnapshot) {
          await tx.deleteUserVault(outcome.uid);
        } else {
          await tx.setUserVault(outcome.uid, outcome.previousVaultSnapshot);
        }
      }

      return { compensated: true };
    });
  }

  /**
   * Step 3: Exchanges authorization code for tokens on the backend, validates `open_id` from TikTok v2,
   * fetches public profile, executes the Firestore persistence transaction (`tiktok_identities/{identityDocId}`,
   * `users/{uid}`, `users/{uid}/private_tokens/tiktok`), and THEN issues a Firebase Custom Token outside the
   * Firestore transaction with version-and-ownership-checked compensation if token issuance fails.
   */
  public async handleCallbackExchange(params: {
    code: string;
    state: string;
    initiatorToken?: string | null;
    rawClientPayload?: Record<string, any> | null;
    issueFirebaseCustomToken?: boolean;
    clientKeyOverride?: string;
    clientSecretOverride?: string;
  }): Promise<{
    sessionToken: string;
    sessionIdHash: string;
    sessionDoc: FirestoreOAuthSessionDoc;
    targetOrigin: string;
    maxAgeSec: number;
    identityResolution: TikTokIdentityResolutionResult;
  }> {
    // 0. Block any client identity forgery (`open_id`, `uid`, `username`-only login, etc.)
    assertNoClientIdentityForgery(params.rawClientPayload);

    // 1. Ensure exclusive 256-bit encryption key is configured BEFORE consuming state or exchanging code
    resolveEncryptionKeyRing();

    // 2. Consume state atomically (including initiator session check if bound)
    const stateRecord = await this.consumeStateAtomic(params.state, {
      initiatorToken: params.initiatorToken,
    });

    const flowMode: TikTokOAuthFlowMode = stateRecord.flowMode === 'LINK' ? 'LINK' : 'LOGIN';

    if (flowMode === 'LINK') {
      if (!stateRecord.linkTargetUid || stateRecord.reauthVerified !== true) {
        throw new OAuthSecurityError(
          'LINK_STATE_INVALID',
          'O estado OAuth de vinculação não possui um UID autenticado ou confirmação de reautenticação válida.',
          403
        );
      }
    }

    // 3. Validate code and backend credentials
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

    // 4. Exchange code for tokens at TikTok OAuth v2 endpoint
    const tokenBodyParams: Record<string, string> = {
      client_key: clientKey,
      client_secret: clientSecret,
      code: authCode,
      grant_type: 'authorization_code',
      redirect_uri: stateRecord.redirectUri,
    };

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

    const accessToken = String(tokenData.access_token).trim();
    const refreshToken = String(tokenData.refresh_token || '').trim();
    const openId = String(tokenData.open_id || '').trim();

    if (!openId || openId.length < 3 || /\s/.test(openId)) {
      throw new OAuthSecurityError(
        'INVALID_TIKTOK_OPEN_ID',
        'A resposta de token do TikTok não retornou um open_id válido.',
        400
      );
    }

    const identityDocId = deriveTikTokIdentityDocId(openId);
    const openIdHash = sha256Hex(openId);

    const grantedScope = String(
      tokenData.scope || stateRecord.requestedScopes || 'user.info.basic'
    );
    const expiresInSec = Math.max(60, Number(tokenData.expires_in || 86400));
    const refreshExpiresInSec = Math.max(
      expiresInSec,
      Number(tokenData.refresh_expires_in || 31536000)
    );

    // 5. Fetch public user profile from TikTok API v2 using ONLY fields permitted by grantedScope
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
        if (u.open_id && String(u.open_id).trim() !== openId) {
          throw new OAuthSecurityError(
            'TIKTOK_OPEN_ID_MISMATCH',
            'Divergência de segurança: o open_id retornado pelo user info difere do open_id do token.',
            403
          );
        }
        userProfile = {
          open_id: openId,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          ...(u.username ? { username: u.username } : {}),
        };
      }
    } catch (err) {
      if (err instanceof OAuthSecurityError) throw err;
      console.warn('[TikTokOAuthService] Aviso ao buscar perfil v2:', err);
    }

    const now = Date.now();
    const sessionExpiresAt = now + refreshExpiresInSec * 1000;
    const encryptedAccessToken = encryptTokenAes256Gcm(accessToken);
    const encryptedRefreshToken = encryptTokenAes256Gcm(refreshToken);
    const operationId = `op_${crypto.randomBytes(12).toString('hex')}`;

    // 6. Execute atomic Firestore transaction for identity resolution & binding (`tiktok_identities/{identityDocId}`).
    //    NOTE: Firebase Admin Custom Token generation is an external RPC/crypto operation and is NOT executed inside
    //    this Firestore transaction. Instead, we record explicit version/operation metadata (`bindingVersion`,
    //    `lastOperationId`, and pre-operation snapshots) so Step 7b can perform safe, conditional compensation if needed.
    const txOutcome = await this.storageAdapter.runAtomicTransaction(async (tx) => {
      const existingIdentity = await tx.getIdentity(openId);
      const isCurrentlyBound =
        existingIdentity !== null &&
        !existingIdentity.unlinked &&
        Boolean(existingIdentity.uid);

      const nextBindingVersion = (existingIdentity?.bindingVersion ?? 0) + 1;
      const createdInOperationId =
        existingIdentity?.createdInOperationId || operationId;

      let resolvedUid = '';
      let isNewUser = false;
      let linkedToExistingAccount = false;
      let previousUserSnapshot: Record<string, any> | null = null;
      let createdNewUserDoc = false;

      if (flowMode === 'LINK') {
        const targetUid = String(stateRecord.linkTargetUid || '').trim();
        if (!targetUid) {
          throw new OAuthSecurityError(
            'LINK_REQUIRES_AUTHENTICATED_UID',
            'UID de destino ausente para vinculação.',
            401
          );
        }

        // Check if this TikTok open_id already belongs to a DIFFERENT GIO user
        if (isCurrentlyBound && existingIdentity!.uid !== targetUid) {
          throw new OAuthSecurityError(
            'TIKTOK_OPEN_ID_ALREADY_LINKED',
            'Conflito de identidade bloqueado: esta conta TikTok já está vinculada a outra conta GIO da Sorte. Não é permitida transferência automática de propriedade.',
            409
          );
        }

        // Check if the target GIO account is already linked to a DIFFERENT TikTok open_id
        const existingTargetUser = await tx.getUserDoc(targetUid);
        if (
          existingTargetUser &&
          existingTargetUser.tiktokLinked === true &&
          existingTargetUser.tiktokOpenId &&
          String(existingTargetUser.tiktokOpenId).trim() !== openId
        ) {
          throw new OAuthSecurityError(
            'USER_ALREADY_LINKED_TO_ANOTHER_TIKTOK',
            'Sua conta GIO já possui outro perfil do TikTok vinculado. Desconecte o perfil atual antes de vincular outro.',
            409
          );
        }

        resolvedUid = targetUid;
        isNewUser = false;
        linkedToExistingAccount = true;
        previousUserSnapshot = existingTargetUser ? { ...existingTargetUser } : null;
        createdNewUserDoc = !existingTargetUser;

        const identityDoc: FirestoreTikTokIdentityDoc = {
          identityDocId,
          openIdHash,
          openId,
          uid: resolvedUid,
          displayName: userProfile.display_name || 'Criador TikTok',
          avatarUrl: userProfile.avatar_url || '',
          username: userProfile.username || null,
          scope: grantedScope,
          linkedAt: isCurrentlyBound ? existingIdentity!.linkedAt : now,
          updatedAt: now,
          unlinked: false,
          unlinkedAt: null,
          bindingVersion: nextBindingVersion,
          lastOperationId: operationId,
          createdInOperationId,
        };
        await tx.setIdentity(openId, identityDoc);

        // Preserve all existing user fields (email, displayName, role, PRO plan, etc.)
        const updatedUserFields: Record<string, any> = {
          ...(existingTargetUser || { uid: resolvedUid, createdAt: now }),
          uid: resolvedUid,
          tiktokOpenId: openId,
          tiktokIdentityDocId: identityDocId,
          tiktokLinked: true,
          tiktokProfile: {
            openId,
            displayName: userProfile.display_name || 'Criador TikTok',
            avatarUrl: userProfile.avatar_url || '',
            username: userProfile.username || null,
            scope: grantedScope,
            updatedAt: now,
          },
          lastTikTokOperationId: operationId,
          updatedAt: now,
        };
        await tx.setUserDoc(resolvedUid, updatedUserFields, true);
      } else {
        // Flow 1: LOGIN (First Access or Returning Login with TikTok)
        if (isCurrentlyBound) {
          // Returning user (or user who previously linked this TikTok to their GIO account):
          // Authenticate the existing UID — NEVER create a duplicate account!
          resolvedUid = existingIdentity!.uid;
          isNewUser = false;
          linkedToExistingAccount = !resolvedUid.startsWith('gio_tt_');

          const existingUserDoc = await tx.getUserDoc(resolvedUid);
          previousUserSnapshot = existingUserDoc ? { ...existingUserDoc } : null;
          createdNewUserDoc = !existingUserDoc;

          const identityDoc: FirestoreTikTokIdentityDoc = {
            identityDocId,
            openIdHash,
            openId,
            uid: resolvedUid,
            displayName: userProfile.display_name || existingIdentity!.displayName || 'Criador TikTok',
            avatarUrl: userProfile.avatar_url || existingIdentity!.avatarUrl || '',
            username: userProfile.username ?? existingIdentity!.username ?? null,
            scope: grantedScope,
            linkedAt: existingIdentity!.linkedAt || now,
            updatedAt: now,
            unlinked: false,
            unlinkedAt: null,
            bindingVersion: nextBindingVersion,
            lastOperationId: operationId,
            createdInOperationId,
          };
          await tx.setIdentity(openId, identityDoc);

          const updatedUserFields: Record<string, any> = {
            ...(existingUserDoc || { uid: resolvedUid, createdAt: now }),
            uid: resolvedUid,
            displayName:
              existingUserDoc?.displayName || userProfile.display_name || 'Criador TikTok',
            photoURL: existingUserDoc?.photoURL || userProfile.avatar_url || '',
            tiktokOpenId: openId,
            tiktokIdentityDocId: identityDocId,
            tiktokLinked: true,
            tiktokProfile: {
              openId,
              displayName: userProfile.display_name || 'Criador TikTok',
              avatarUrl: userProfile.avatar_url || '',
              username: userProfile.username || null,
              scope: grantedScope,
              updatedAt: now,
            },
            lastTikTokOperationId: operationId,
            lastLoginAt: now,
            updatedAt: now,
          };
          await tx.setUserDoc(resolvedUid, updatedUserFields, true);
        } else {
          // First access with an unlinked TikTok open_id: create controlled GIO identity transactionally
          resolvedUid = deriveControlledFirebaseUidFromOpenId(openId);
          const existingControlledUser = await tx.getUserDoc(resolvedUid);
          previousUserSnapshot = existingControlledUser ? { ...existingControlledUser } : null;
          createdNewUserDoc = !existingControlledUser;
          isNewUser = !existingControlledUser;
          linkedToExistingAccount = false;

          const identityDoc: FirestoreTikTokIdentityDoc = {
            identityDocId,
            openIdHash,
            openId,
            uid: resolvedUid,
            displayName: userProfile.display_name || 'Criador TikTok',
            avatarUrl: userProfile.avatar_url || '',
            username: userProfile.username || null,
            scope: grantedScope,
            linkedAt: now,
            updatedAt: now,
            unlinked: false,
            unlinkedAt: null,
            bindingVersion: nextBindingVersion,
            lastOperationId: operationId,
            createdInOperationId,
          };
          await tx.setIdentity(openId, identityDoc);

          const newUserFields: Record<string, any> = {
            ...(existingControlledUser || {}),
            uid: resolvedUid,
            displayName:
              existingControlledUser?.displayName || userProfile.display_name || 'Criador TikTok',
            photoURL: existingControlledUser?.photoURL || userProfile.avatar_url || '',
            authProvider: existingControlledUser?.authProvider || 'tiktok',
            tiktokOpenId: openId,
            tiktokIdentityDocId: identityDocId,
            tiktokLinked: true,
            tiktokProfile: {
              openId,
              displayName: userProfile.display_name || 'Criador TikTok',
              avatarUrl: userProfile.avatar_url || '',
              username: userProfile.username || null,
              scope: grantedScope,
              updatedAt: now,
            },
            createdAt: existingControlledUser?.createdAt || now,
            lastTikTokOperationId: operationId,
            lastLoginAt: now,
            updatedAt: now,
          };
          await tx.setUserDoc(resolvedUid, newUserFields, true);
        }
      }

      const existingVault = await tx.getUserVault(resolvedUid);
      const previousVaultSnapshot = existingVault ? { ...existingVault } : null;
      const createdNewVaultDoc = !existingVault;

      // Store AES-256-GCM encrypted tokens in the user's private backend vault (`users/{uid}/private_tokens/tiktok`)
      const vaultDoc: FirestoreUserTikTokVaultDoc = {
        uid: resolvedUid,
        openId,
        scope: grantedScope,
        encryptedAccessToken,
        encryptedRefreshToken,
        accessTokenExpiresAt: now + expiresInSec * 1000,
        refreshTokenExpiresAt: sessionExpiresAt,
        updatedAt: now,
        revoked: false,
        revokedAt: null,
      };
      await tx.setUserVault(resolvedUid, vaultDoc);

      return {
        operationId,
        identityDocId,
        openId,
        uid: resolvedUid,
        isNewUser,
        linkedToExistingAccount,
        bindingVersion: nextBindingVersion,
        createdNewIdentityDoc: !existingIdentity,
        previousIdentitySnapshot: existingIdentity ? { ...existingIdentity } : null,
        createdNewUserDoc,
        previousUserSnapshot,
        createdNewVaultDoc,
        previousVaultSnapshot,
      };
    });

    // 7. Issue Firebase Custom Token AFTER the Firestore persistence transaction commits.
    //    If Custom Token generation fails, execute conditional version-and-ownership-checked compensation (`Step 7b`).
    let generatedCustomToken: string | null = null;
    if (flowMode === 'LOGIN' && params.issueFirebaseCustomToken === true) {
      try {
        if (this.beforeCustomTokenHookForTests) {
          await this.beforeCustomTokenHookForTests({
            uid: txOutcome.uid,
            openId,
            identityDocId: txOutcome.identityDocId,
            operationId: txOutcome.operationId,
            bindingVersion: txOutcome.bindingVersion,
          });
        }

        if (this.customTokenGenerator) {
          generatedCustomToken = await this.customTokenGenerator(txOutcome.uid, {
            tiktokOpenId: openId,
            authProvider: 'tiktok',
          });
        } else {
          const { createFirebaseCustomTokenForUid } = await import('./firebaseAdminAuth.ts');
          generatedCustomToken = await createFirebaseCustomTokenForUid(txOutcome.uid, {
            tiktokOpenId: openId,
            authProvider: 'tiktok',
          });
        }
      } catch (customTokenErr) {
        // Step 7b: Safe, version-verified compensation
        await this.compensateFailedIdentityBinding(txOutcome).catch((compErr) => {
          console.error(
            '[TikTokOAuthService] Erro durante compensação condicional de identidade:',
            compErr
          );
        });
        throw customTokenErr;
      }
    }

    // 8. Persist encrypted session in `oauth_sessions/{sessionIdHash}`
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionIdHash = sha256Hex(sessionToken);

    const sessionDoc: FirestoreOAuthSessionDoc = {
      sessionIdHash,
      openId,
      firebaseUid: txOutcome.uid,
      flowMode,
      scope: grantedScope,
      encryptedAccessToken,
      encryptedRefreshToken,
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

    await this.storageAdapter.setSessionDirect(sessionIdHash, sessionDoc);

    const identityResolution: TikTokIdentityResolutionResult = {
      flowMode,
      uid: txOutcome.uid,
      openId,
      identityDocId: txOutcome.identityDocId,
      isNewUser: txOutcome.isNewUser,
      linkedToExistingAccount: txOutcome.linkedToExistingAccount,
      userProfile,
      firebaseCustomToken: generatedCustomToken,
      bindingVersion: txOutcome.bindingVersion,
      operationId: txOutcome.operationId,
    };

    return {
      sessionToken,
      sessionIdHash,
      sessionDoc,
      targetOrigin: stateRecord.targetOrigin,
      maxAgeSec: refreshExpiresInSec,
      identityResolution,
    };
  }

  /**
   * Operation 2 — Desvinculação TikTok:
   * - Revokes TikTok OAuth tokens at TikTok API v2 (from active session and/or user's private token vault).
   * - Revokes all `oauth_sessions` bound to this `uid`.
   * - Atomically unlinks `tiktok_identities/{identityDocId}`, clears `tiktokOpenId`/`tiktokLinked` on `users/{uid}`,
   *   and wipes `users/{uid}/private_tokens/tiktok`.
   * - Cleanly stops any active TikTok LIVE workers/tasks that depend on this user's TikTok authorization.
   * - Preserves the GIO account (`users/{uid}`), raffle configurations, and draw history.
   */
  public async unlinkTikTokFromUserAccount(params: {
    uid: string;
    sessionToken?: string | null;
    clientKeyOverride?: string;
    clientSecretOverride?: string;
  }): Promise<{
    unlinked: boolean;
    uid: string;
    previousOpenId: string | null;
    revokedAtTikTok: boolean;
    revokedSessionsCount: number;
    stoppedDependentWorkers: number;
    releasedLiveLease: boolean;
  }> {
    const cleanUid = typeof params.uid === 'string' ? params.uid.trim() : '';
    if (!cleanUid) {
      throw new OAuthSecurityError(
        'MISSING_AUTH_UID',
        'Sessão Firebase autenticada é obrigatória para desvincular o TikTok.',
        401
      );
    }

    let revokedAtTikTok = false;
    if (params.sessionToken) {
      try {
        const logoutOutcome = await this.revokeAndLogoutSession({
          sessionToken: params.sessionToken,
          clientKeyOverride: params.clientKeyOverride,
          clientSecretOverride: params.clientSecretOverride,
        });
        revokedAtTikTok = logoutOutcome.revokedAtTikTok;
      } catch {
        // Proceed with identity unlinking even if session token revocation fails
      }
    }

    // If not yet revoked at TikTok via cookie/sessionToken, revoke using the encrypted vault token
    if (!revokedAtTikTok) {
      try {
        const existingVault = await this.storageAdapter.getUserVaultDirect(cleanUid);
        if (existingVault && !existingVault.revoked && existingVault.encryptedAccessToken?.ciphertext) {
          const clientKey = params.clientKeyOverride || process.env.TIKTOK_CLIENT_KEY?.trim();
          const clientSecret =
            params.clientSecretOverride || process.env.TIKTOK_CLIENT_SECRET?.trim();
          const plainToken =
            decryptTokenWithRotationInfo(existingVault.encryptedRefreshToken).plaintext ||
            decryptTokenWithRotationInfo(existingVault.encryptedAccessToken).plaintext;
          if (clientKey && clientSecret && plainToken) {
            const revokeRes = await this.fetcher(TIKTOK_OAUTH_V2_ENDPOINTS.revoke, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cache-Control': 'no-cache',
              },
              body: new URLSearchParams({
                client_key: clientKey,
                client_secret: clientSecret,
                token: plainToken,
              }).toString(),
            });
            revokedAtTikTok = revokeRes.ok;
          }
        }
      } catch {
        // Best-effort remote revocation; local vault wipe and session revocation always proceed
      }
    }

    const emptyCipher = createEmptyEncryptedPayload('wiped_on_unlink');
    const now = Date.now();
    const unlinkOpId = `unlink_${crypto.randomBytes(8).toString('hex')}`;

    const txResult = await this.storageAdapter.runAtomicTransaction(async (tx) => {
      const userDoc = await tx.getUserDoc(cleanUid);
      const vaultDoc = await tx.getUserVault(cleanUid);
      const previousOpenId =
        (userDoc?.tiktokOpenId ? String(userDoc.tiktokOpenId).trim() : '') ||
        (vaultDoc?.openId ? String(vaultDoc.openId).trim() : '') ||
        null;

      if (!previousOpenId && (!userDoc || !userDoc.tiktokLinked)) {
        return { unlinked: false, previousOpenId: null };
      }

      if (previousOpenId) {
        const existingIdentity = await tx.getIdentity(previousOpenId);
        if (existingIdentity && existingIdentity.uid === cleanUid) {
          await tx.setIdentity(previousOpenId, {
            ...existingIdentity,
            identityDocId: deriveTikTokIdentityDocId(previousOpenId),
            openIdHash: sha256Hex(previousOpenId),
            unlinked: true,
            unlinkedAt: now,
            updatedAt: now,
            bindingVersion: (existingIdentity.bindingVersion ?? 0) + 1,
            lastOperationId: unlinkOpId,
          });
        }
      }

      if (userDoc) {
        await tx.setUserDoc(
          cleanUid,
          {
            ...userDoc,
            tiktokOpenId: null,
            tiktokIdentityDocId: null,
            tiktokLinked: false,
            tiktokProfile: null,
            lastTikTokOperationId: unlinkOpId,
            updatedAt: now,
          },
          false
        );
      }

      if (vaultDoc) {
        await tx.setUserVault(cleanUid, {
          ...vaultDoc,
          encryptedAccessToken: emptyCipher,
          encryptedRefreshToken: emptyCipher,
          revoked: true,
          revokedAt: now,
          updatedAt: now,
        });
      }

      return { unlinked: true, previousOpenId };
    });

    // Revoke all remaining OAuth sessions belonging to this UID
    const revokedSessionsCount = await this.storageAdapter
      .revokeSessionsForUidDirect(cleanUid, 'TIKTOK_UNLINKED')
      .catch(() => 0);

    // Cleanly stop any active TikTok LIVE workers/tasks dependent on this user's TikTok authorization
    let stoppedDependentWorkers = 0;
    let releasedLiveLease = false;
    if (this.onUnlinkStopWorkersHandler) {
      try {
        const stopOutcome = await this.onUnlinkStopWorkersHandler(
          cleanUid,
          txResult.previousOpenId
        );
        stoppedDependentWorkers = stopOutcome.stoppedWorkers;
        releasedLiveLease = stopOutcome.releasedLease;
      } catch (err) {
        console.warn('[TikTokOAuthService] Aviso ao encerrar workers dependentes no unlink:', err);
      }
    }

    return {
      unlinked: txResult.unlinked,
      uid: cleanUid,
      previousOpenId: txResult.previousOpenId,
      revokedAtTikTok,
      revokedSessionsCount,
      stoppedDependentWorkers,
      releasedLiveLease,
    };
  }

  /**
   * Returns the non-sensitive TikTok identity status linked to a GIO user (`uid`).
   * NEVER returns `access_token`, `refresh_token`, or encrypted payloads.
   */
  public async getUserTikTokIdentityStatus(uid: string): Promise<{
    linked: boolean;
    uid: string;
    openId: string | null;
    identityDocId: string | null;
    profile: TikTokPublicUserProfile | null;
    scope: string | null;
    linkedAt: number | null;
  }> {
    const cleanUid = typeof uid === 'string' ? uid.trim() : '';
    if (!cleanUid) {
      return {
        linked: false,
        uid: '',
        openId: null,
        identityDocId: null,
        profile: null,
        scope: null,
        linkedAt: null,
      };
    }

    const userDoc = await this.storageAdapter.getUserDocDirect(cleanUid);
    if (!userDoc || !userDoc.tiktokLinked || !userDoc.tiktokOpenId) {
      return {
        linked: false,
        uid: cleanUid,
        openId: null,
        identityDocId: null,
        profile: null,
        scope: null,
        linkedAt: null,
      };
    }

    const openId = String(userDoc.tiktokOpenId);
    const identityDocId = deriveTikTokIdentityDocId(openId);
    const identityDoc = await this.storageAdapter.getIdentityDirect(openId);
    const p = userDoc.tiktokProfile || {};

    return {
      linked: true,
      uid: cleanUid,
      openId,
      identityDocId,
      profile: {
        open_id: openId,
        display_name: p.displayName || identityDoc?.displayName || 'Criador TikTok',
        avatar_url: p.avatarUrl || identityDoc?.avatarUrl || '',
        ...(p.username || identityDoc?.username
          ? { username: p.username || identityDoc?.username || undefined }
          : {}),
      },
      scope: p.scope || identityDoc?.scope || 'user.info.basic',
      linkedAt: identityDoc?.linkedAt || p.updatedAt || null,
    };
  }

  public formatInitiatorCookie(initiatorToken: string, maxAgeSec = 600): string {
    return `${INITIATOR_COOKIE_NAME}=${initiatorToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${Math.max(
      0,
      Math.floor(maxAgeSec)
    )}`;
  }

  public formatClearInitiatorCookie(): string {
    return `${INITIATOR_COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`;
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
