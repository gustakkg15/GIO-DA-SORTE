import crypto from 'crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import {
  buildEntitlementFromSubscriptionRecord,
  getOrInitFirebaseAdminApp,
} from './firebaseAdminAuth.ts';
import { mercadoPagoSubscriptionService } from './mercadoPagoSubscriptionService.ts';
import type {
  AuthoritativeTraditionalRaffleDocument,
  CanonicalTicketEntry,
  DrawMode,
  Participant,
  ProPlanEntitlement,
  RaffleSettings,
  TraditionalDrawIdempotencyRecord,
  TraditionalDrawLedgerEvent,
  TraditionalDrawLedgerHead,
  TraditionalDrawPrecommitRecord,
  TraditionalDrawProofV2,
  TraditionalPermanentDrawRecord,
  Winner,
} from '../types.ts';
import {
  DEFAULT_SETTINGS,
  canonicalizeJSON,
  canonicalizeRosterStrictWithTickets,
  computeRaffle,
  generateUid,
} from '../utils/raffle.ts';

// ============================================================================
// CUSTOM TYPED HTTP ERROR FOR AUTHORITATIVE TRADITIONAL RAFFLE
// ============================================================================

export class TraditionalRaffleError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    errorCode: string,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(message || errorCode);
    this.name = 'TraditionalRaffleError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

// ============================================================================
// TRANSACTIONAL DOCUMENT STORE CONTRACT (R-01: REAL FIRESTORE + TEST STORE)
// ============================================================================

export interface DocumentSnapshot<T = Record<string, unknown>> {
  exists: boolean;
  path: string;
  version: number;
  data(): T | undefined;
}

export interface TransactionContext {
  get<T = Record<string, unknown>>(path: string): Promise<DocumentSnapshot<T>>;
  set(path: string, data: unknown, options?: { merge?: boolean }): void;
  update(path: string, data: Record<string, unknown>): void;
  delete(path: string): void;
}

export interface TransactionalStoreHooks {
  onBeforeCommit?: (attempt: number, readPaths: string[], writePaths: string[]) => Promise<void> | void;
  simulateCommitFailureOnce?: boolean;
}

export interface ITransactionalDrawStore {
  readonly storeKind: 'FIRESTORE_ADMIN' | 'IN_MEMORY_TEST';
  getDocDirect<T = Record<string, unknown>>(path: string): Promise<DocumentSnapshot<T>>;
  setDocDirect(path: string, data: unknown, options?: { merge?: boolean }): Promise<void>;
  listCollectionDocs<T = Record<string, unknown>>(collectionPath: string, limitCount?: number): Promise<T[]>;
  runTransaction<R>(
    updateFunction: (tx: TransactionContext) => Promise<R>,
    maxAttempts?: number
  ): Promise<R>;
}

function deepClone<T>(val: T): T {
  if (val === undefined || val === null) return val;
  return JSON.parse(JSON.stringify(val));
}

function normalizeDocPath(p: string): string {
  return p.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * R-01: Production Firestore Admin SDK Transactional Store.
 * - Uses `getOrInitFirebaseAdminApp()` from `src/server/firebaseAdminAuth.ts`.
 * - Connects to the official named Firestore database (`firebaseConfig.firestoreDatabaseId`:
 *   "ai-studio-siteremixgiodaso-cba1d97e-fec2-493e-8038-9980f929138a") in project `quick-standard-pw2pc`.
 * - Executes genuine `db.runTransaction()` with strict read-before-write enforcement.
 * - NEVER falls back silently to memory: if Firestore or ADC credentials are unavailable,
 *   fails closed with `TraditionalRaffleError(503, 'HTTP_503_FIRESTORE_PERSISTENCE_UNAVAILABLE', ...)`.
 */
export class FirestoreAdminTransactionalStore implements ITransactionalDrawStore {
  public readonly storeKind = 'FIRESTORE_ADMIN' as const;
  private firestoreInstance: Firestore | null = null;
  private readonly databaseId: string;

  constructor(databaseId?: string) {
    this.databaseId = (databaseId || firebaseConfig.firestoreDatabaseId || '(default)').trim();
  }

  public getDatabaseId(): string {
    return this.databaseId;
  }

  public getProjectId(): string {
    return firebaseConfig.projectId;
  }

  private getDb(): Firestore {
    if (this.firestoreInstance) {
      return this.firestoreInstance;
    }
    try {
      const app = getOrInitFirebaseAdminApp();
      this.firestoreInstance =
        this.databaseId && this.databaseId !== '(default)'
          ? getFirestore(app, this.databaseId)
          : getFirestore(app);
      return this.firestoreInstance;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new TraditionalRaffleError(
        503,
        'HTTP_503_FIRESTORE_PERSISTENCE_UNAVAILABLE',
        `Falha ao inicializar Firebase Admin Firestore (projectId=${firebaseConfig.projectId}, databaseId=${this.databaseId}): ${msg}`
      );
    }
  }

  private wrapFirestoreError(err: unknown, operation: string, path?: string): never {
    if (err instanceof TraditionalRaffleError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new TraditionalRaffleError(
      503,
      'HTTP_503_FIRESTORE_PERSISTENCE_UNAVAILABLE',
      `Erro de persistência no Cloud Firestore durante ${operation}${path ? ` (${path})` : ''}: ${msg}`,
      {
        projectId: firebaseConfig.projectId,
        databaseId: this.databaseId,
        operation,
        path: path || null,
      }
    );
  }

  public async getDocDirect<T = Record<string, unknown>>(rawPath: string): Promise<DocumentSnapshot<T>> {
    const cleanPath = normalizeDocPath(rawPath);
    try {
      const db = this.getDb();
      const snap = await db.doc(cleanPath).get();
      if (!snap.exists) {
        return {
          exists: false,
          path: cleanPath,
          version: 0,
          data: () => undefined,
        };
      }
      const rawData = snap.data() as T;
      const updateTimeMillis = snap.updateTime ? snap.updateTime.toMillis() : 1;
      return {
        exists: true,
        path: cleanPath,
        version: updateTimeMillis,
        data: () => deepClone(rawData),
      };
    } catch (err) {
      this.wrapFirestoreError(err, 'getDocDirect', cleanPath);
    }
  }

  public async setDocDirect(
    rawPath: string,
    data: unknown,
    options?: { merge?: boolean }
  ): Promise<void> {
    const cleanPath = normalizeDocPath(rawPath);
    try {
      const db = this.getDb();
      const serialized = deepClone(data as Record<string, unknown>);
      if (options?.merge) {
        await db.doc(cleanPath).set(serialized, { merge: true });
      } else {
        await db.doc(cleanPath).set(serialized);
      }
    } catch (err) {
      this.wrapFirestoreError(err, 'setDocDirect', cleanPath);
    }
  }

  public async listCollectionDocs<T = Record<string, unknown>>(
    rawCollectionPath: string,
    limitCount = 100
  ): Promise<T[]> {
    const cleanCollectionPath = normalizeDocPath(rawCollectionPath);
    try {
      const db = this.getDb();
      const querySnap = await db.collection(cleanCollectionPath).limit(limitCount).get();
      const items: T[] = [];
      for (const docSnap of querySnap.docs) {
        if (docSnap.exists) {
          items.push(deepClone(docSnap.data() as T));
        }
      }
      return items;
    } catch (err) {
      this.wrapFirestoreError(err, 'listCollectionDocs', cleanCollectionPath);
    }
  }

  public async runTransaction<R>(
    updateFunction: (tx: TransactionContext) => Promise<R>,
    maxAttempts = 5
  ): Promise<R> {
    try {
      const db = this.getDb();
      return await db.runTransaction(
        async (firestoreTx) => {
          let hasStartedWriting = false;

          const tx: TransactionContext = {
            get: async <T = Record<string, unknown>>(rawPath: string): Promise<DocumentSnapshot<T>> => {
              if (hasStartedWriting) {
                throw new TraditionalRaffleError(
                  500,
                  'FIRESTORE_READ_AFTER_WRITE_VIOLATION',
                  'Firestore transactions require all reads to be executed before all writes.'
                );
              }
              const cleanPath = normalizeDocPath(rawPath);
              const docRef = db.doc(cleanPath);
              const snap = await firestoreTx.get(docRef);
              if (!snap.exists) {
                return {
                  exists: false,
                  path: cleanPath,
                  version: 0,
                  data: () => undefined,
                };
              }
              const docData = snap.data() as T;
              const ver = snap.updateTime ? snap.updateTime.toMillis() : 1;
              return {
                exists: true,
                path: cleanPath,
                version: ver,
                data: () => deepClone(docData),
              };
            },
            set: (rawPath: string, data: unknown, options?: { merge?: boolean }) => {
              hasStartedWriting = true;
              const cleanPath = normalizeDocPath(rawPath);
              const docRef = db.doc(cleanPath);
              const serialized = deepClone(data as Record<string, unknown>);
              if (options?.merge) {
                firestoreTx.set(docRef, serialized, { merge: true });
              } else {
                firestoreTx.set(docRef, serialized);
              }
            },
            update: (rawPath: string, data: Record<string, unknown>) => {
              hasStartedWriting = true;
              const cleanPath = normalizeDocPath(rawPath);
              const docRef = db.doc(cleanPath);
              firestoreTx.update(docRef, deepClone(data));
            },
            delete: (rawPath: string) => {
              hasStartedWriting = true;
              const cleanPath = normalizeDocPath(rawPath);
              const docRef = db.doc(cleanPath);
              firestoreTx.delete(docRef);
            },
          };

          return await updateFunction(tx);
        },
        { maxAttempts }
      );
    } catch (err) {
      this.wrapFirestoreError(err, 'runTransaction');
    }
  }
}

/**
 * Deterministic Optimistic Concurrency Control (OCC) store used ONLY when explicitly injected
 * in automated unit and concurrency tests.
 * - Enforces read-before-write (matching Cloud Firestore semantics)
 * - Tracks read-set versions and retries on concurrent modifications
 * - Rolls back all staged writes on any error
 */
export class InMemoryTransactionalStore implements ITransactionalDrawStore {
  public readonly storeKind = 'IN_MEMORY_TEST' as const;
  private docs = new Map<string, { version: number; data: Record<string, unknown> }>();
  private commitChain: Promise<void> = Promise.resolve();
  private hooks: TransactionalStoreHooks = {};

  public setHooks(hooks: TransactionalStoreHooks): void {
    this.hooks = hooks;
  }

  public clearAllForTests(): void {
    this.docs.clear();
  }

  public async getDocDirect<T = Record<string, unknown>>(path: string): Promise<DocumentSnapshot<T>> {
    const cleanPath = normalizeDocPath(path);
    const entry = this.docs.get(cleanPath);
    if (!entry) {
      return {
        exists: false,
        path: cleanPath,
        version: 0,
        data: () => undefined,
      };
    }
    const cloned = deepClone(entry.data) as T;
    return {
      exists: true,
      path: cleanPath,
      version: entry.version,
      data: () => deepClone(cloned),
    };
  }

  public async setDocDirect(path: string, data: unknown, options?: { merge?: boolean }): Promise<void> {
    await this.runTransaction(async (tx) => {
      await tx.get(path);
      tx.set(path, data, options);
    });
  }

  public async listCollectionDocs<T = Record<string, unknown>>(
    rawCollectionPath: string,
    limitCount = 100
  ): Promise<T[]> {
    const prefix = `${normalizeDocPath(rawCollectionPath)}/`;
    const results: T[] = [];
    for (const [docPath, entry] of this.docs.entries()) {
      if (docPath.startsWith(prefix)) {
        const remainder = docPath.slice(prefix.length);
        // Only direct children of the collection (no deeper subcollections)
        if (remainder.length > 0 && !remainder.includes('/')) {
          results.push(deepClone(entry.data) as T);
          if (results.length >= limitCount) break;
        }
      }
    }
    return results;
  }

  public async runTransaction<R>(
    updateFunction: (tx: TransactionContext) => Promise<R>,
    maxAttempts = 6
  ): Promise<R> {
    let lastConflictError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const readVersions = new Map<string, number>();
      const stagedWrites = new Map<
        string,
        | { type: 'set'; data: Record<string, unknown>; merge?: boolean }
        | { type: 'update'; data: Record<string, unknown> }
        | { type: 'delete' }
      >();
      let hasStartedWriting = false;

      const tx: TransactionContext = {
        get: async <T = Record<string, unknown>>(rawPath: string): Promise<DocumentSnapshot<T>> => {
          if (hasStartedWriting) {
            throw new TraditionalRaffleError(
              500,
              'FIRESTORE_READ_AFTER_WRITE_VIOLATION',
              'Firestore transactions require all reads to be executed before all writes.'
            );
          }
          const path = normalizeDocPath(rawPath);
          const current = this.docs.get(path);
          const version = current ? current.version : 0;
          if (!readVersions.has(path)) {
            readVersions.set(path, version);
          }
          if (!current) {
            return {
              exists: false,
              path,
              version: 0,
              data: () => undefined,
            };
          }
          const snapshotData = deepClone(current.data) as T;
          return {
            exists: true,
            path,
            version,
            data: () => deepClone(snapshotData),
          };
        },
        set: (rawPath: string, data: unknown, options?: { merge?: boolean }) => {
          hasStartedWriting = true;
          const path = normalizeDocPath(rawPath);
          stagedWrites.set(path, {
            type: 'set',
            data: deepClone(data as Record<string, unknown>),
            merge: options?.merge,
          });
        },
        update: (rawPath: string, data: Record<string, unknown>) => {
          hasStartedWriting = true;
          const path = normalizeDocPath(rawPath);
          stagedWrites.set(path, {
            type: 'update',
            data: deepClone(data),
          });
        },
        delete: (rawPath: string) => {
          hasStartedWriting = true;
          const path = normalizeDocPath(rawPath);
          stagedWrites.set(path, { type: 'delete' });
        },
      };

      const result = await updateFunction(tx);

      if (this.hooks.onBeforeCommit) {
        await this.hooks.onBeforeCommit(
          attempt,
          Array.from(readVersions.keys()),
          Array.from(stagedWrites.keys())
        );
      }

      let conflictDetected = false;
      await this.withCommitLock(async () => {
        if (this.hooks.simulateCommitFailureOnce) {
          this.hooks.simulateCommitFailureOnce = false;
          throw new TraditionalRaffleError(
            500,
            'SIMULATED_PERSISTENCE_COMMIT_FAILURE',
            'Falha simulada de persistência durante o commit transacional.'
          );
        }

        for (const [path, readVer] of readVersions.entries()) {
          const currentVer = this.docs.get(path)?.version ?? 0;
          if (currentVer !== readVer) {
            conflictDetected = true;
            return;
          }
        }

        for (const [path, op] of stagedWrites.entries()) {
          const existing = this.docs.get(path);
          if (op.type === 'update' && !existing) {
            throw new TraditionalRaffleError(
              404,
              'DOCUMENT_TO_UPDATE_NOT_FOUND',
              `Cannot update non-existent document at ${path}`
            );
          }
        }

        for (const [path, op] of stagedWrites.entries()) {
          const existing = this.docs.get(path);
          const nextVersion = (existing?.version ?? 0) + 1;
          if (op.type === 'delete') {
            this.docs.delete(path);
          } else if (op.type === 'set') {
            if (op.merge && existing) {
              this.docs.set(path, {
                version: nextVersion,
                data: { ...deepClone(existing.data), ...deepClone(op.data) },
              });
            } else {
              this.docs.set(path, {
                version: nextVersion,
                data: deepClone(op.data),
              });
            }
          } else if (op.type === 'update') {
            this.docs.set(path, {
              version: nextVersion,
              data: { ...deepClone(existing!.data), ...deepClone(op.data) },
            });
          }
        }
      });

      if (!conflictDetected) {
        return result;
      }

      lastConflictError = new TraditionalRaffleError(
        409,
        'TRANSACTION_ABORTED_CONCURRENT_MODIFICATION',
        `Transaction conflicted on attempt ${attempt}/${maxAttempts}`
      );
    }

    throw (
      lastConflictError ||
      new TraditionalRaffleError(409, 'TRANSACTION_MAX_RETRIES_EXCEEDED', 'Max transaction attempts exceeded.')
    );
  }

  private async withCommitLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.commitChain;
    this.commitChain = prev.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * R-01: Default production store is strictly `FirestoreAdminTransactionalStore`
 * (backed by `firebase-admin/firestore` and `firebaseConfig.firestoreDatabaseId`).
 * No silent fallback to memory is permitted.
 */
export const defaultFirestoreTraditionalRaffleStore = new FirestoreAdminTransactionalStore();

// Exported only for explicit injection in automated unit/integration test suites
export const defaultTraditionalRaffleStore = new InMemoryTransactionalStore();

// ============================================================================
// R-05: REAL PRO & FREE PLAN ENTITLEMENT VALIDATION
// ============================================================================

export const FREE_TIER_MAX_PARTICIPANTS = 100;
export const FREE_TIER_MAX_WINNERS_PER_DRAW = 1;
export const PRO_TIER_MAX_PARTICIPANTS = 100_000;
export const PRO_TIER_MAX_WINNERS_PER_DRAW = 100;

export interface PlanEntitlementPolicy {
  planTier: 'FREE' | 'PRO';
  suspended?: boolean;
  maxParticipants?: number;
  maxWinnersPerDraw?: number;
}

const customPlanPoliciesByUid = new Map<string, PlanEntitlementPolicy>();
let simulateSubscriptionServiceFailureForTests = false;

export function setPlanEntitlementPolicyForUid(uid: string, policy: PlanEntitlementPolicy | null): void {
  if (!policy) {
    customPlanPoliciesByUid.delete(uid);
  } else {
    customPlanPoliciesByUid.set(uid, policy);
  }
}

export function setSimulateSubscriptionServiceFailureForTests(simulateFailure: boolean): void {
  simulateSubscriptionServiceFailureForTests = simulateFailure;
}

/**
 * R-05: Validates the organizer's real subscription state on the backend via
 * `mercadoPagoSubscriptionService.getUserSubscriptionRecord(ownerUid)` and
 * `buildEntitlementFromSubscriptionRecord(record)`.
 *
 * Enforces:
 * - Service outage / failure -> Fail-closed (`503 HTTP_503_PLAN_ENTITLEMENT_SERVICE_UNAVAILABLE`)
 * - Expired TRIAL (`statusState === 'EXPIRED'` or `billingSubStatus === 'TRIAL_ENDED'`) -> `403 HTTP_403_PLAN_TRIAL_EXPIRED`
 * - Canceled or past-due subscription (`statusState === 'CANCELED'` or `statusState === 'PAST_DUE'`) -> `403 HTTP_403_PLAN_SUBSCRIPTION_CANCELED`
 * - Active PRO or Valid TRIAL (`entitlement.active === true`) -> Allowed up to PRO limits (`100_000` participants, `100` winners)
 * - Standard FREE tier (`statusState === 'FREE'`) -> Allowed within FREE tier limits (`<= 100` participants, `1` winner per draw)
 */
export async function validateOrganizerPlanEntitlement(
  ownerUid: string,
  participantCount: number,
  winnerCount: number,
  nowMs = Date.now()
): Promise<ProPlanEntitlement> {
  if (simulateSubscriptionServiceFailureForTests) {
    throw new TraditionalRaffleError(
      503,
      'HTTP_503_PLAN_ENTITLEMENT_SERVICE_UNAVAILABLE',
      'Serviço de validação de assinatura indisponível. Operação bloqueada por segurança (fail-closed).'
    );
  }

  const customPolicy = customPlanPoliciesByUid.get(ownerUid);
  if (customPolicy) {
    if (customPolicy.suspended) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_ENTITLEMENT_DENIED',
        'A assinatura ou conta do organizador está suspensa para execução de sorteios.'
      );
    }
    if (
      typeof customPolicy.maxParticipants === 'number' &&
      participantCount > customPolicy.maxParticipants
    ) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED',
        `O plano atual (${customPolicy.planTier}) permite no máximo ${customPolicy.maxParticipants} participantes.`
      );
    }
    if (
      typeof customPolicy.maxWinnersPerDraw === 'number' &&
      winnerCount > customPolicy.maxWinnersPerDraw
    ) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_WINNER_LIMIT_EXCEEDED',
        `O plano atual (${customPolicy.planTier}) permite no máximo ${customPolicy.maxWinnersPerDraw} ganhador(es) por operação.`
      );
    }
  }

  let rawRecord;
  try {
    rawRecord = await mercadoPagoSubscriptionService.getUserSubscriptionRecord(ownerUid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new TraditionalRaffleError(
      503,
      'HTTP_503_PLAN_ENTITLEMENT_SERVICE_UNAVAILABLE',
      `Falha ao consultar serviço de assinaturas para ${ownerUid} (fail-closed): ${msg}`
    );
  }

  const evaluatedRecord = mercadoPagoSubscriptionService.evaluateEffectiveEntitlement(
    rawRecord,
    nowMs
  );
  const entitlement = buildEntitlementFromSubscriptionRecord(evaluatedRecord);

  // 1. Expired Trial check
  if (
    evaluatedRecord.statusState === 'EXPIRED' ||
    evaluatedRecord.billingSubStatus === 'TRIAL_ENDED'
  ) {
    throw new TraditionalRaffleError(
      403,
      'HTTP_403_PLAN_TRIAL_EXPIRED',
      'O período de teste gratuito (TRIAL) expirou. Assine o plano PRO para continuar executando sorteios.'
    );
  }

  // 2. Canceled or Past-Due Subscription check (after active period ended)
  if (
    evaluatedRecord.statusState === 'CANCELED' ||
    evaluatedRecord.statusState === 'PAST_DUE' ||
    evaluatedRecord.billingSubStatus === 'CANCELED' ||
    evaluatedRecord.billingSubStatus === 'PAYMENT_REJECTED'
  ) {
    throw new TraditionalRaffleError(
      403,
      'HTTP_403_PLAN_SUBSCRIPTION_CANCELED',
      `A assinatura encontra-se ${evaluatedRecord.statusState} (${evaluatedRecord.billingSubStatus}). Regularize seu plano para executar novos sorteios.`
    );
  }

  // 3. Active PRO or Active Trial (or Canceled but still within paid/trial period)
  if (entitlement.active) {
    const maxParticipants = customPolicy?.maxParticipants ?? PRO_TIER_MAX_PARTICIPANTS;
    const maxWinners = customPolicy?.maxWinnersPerDraw ?? PRO_TIER_MAX_WINNERS_PER_DRAW;
    if (participantCount > maxParticipants) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED',
        `Limite máximo de participantes do plano PRO (${maxParticipants}) excedido.`
      );
    }
    if (winnerCount > maxWinners) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_WINNER_LIMIT_EXCEEDED',
        `Limite máximo de ganhadores por operação do plano PRO (${maxWinners}) excedido.`
      );
    }
    return entitlement;
  }

  // 4. Standard FREE tier check
  if (evaluatedRecord.tier === 'FREE' && evaluatedRecord.statusState === 'FREE') {
    const maxFreeParticipants = customPolicy?.maxParticipants ?? FREE_TIER_MAX_PARTICIPANTS;
    const maxFreeWinners = customPolicy?.maxWinnersPerDraw ?? FREE_TIER_MAX_WINNERS_PER_DRAW;

    if (participantCount > maxFreeParticipants) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_PARTICIPANT_LIMIT_EXCEEDED',
        `O plano FREE permite até ${maxFreeParticipants} participantes por rifa (atual: ${participantCount}). Faça upgrade para o plano PRO.`
      );
    }
    if (winnerCount > maxFreeWinners) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_PLAN_WINNER_LIMIT_EXCEEDED',
        `O plano FREE permite até ${maxFreeWinners} ganhador por operação (solicitado: ${winnerCount}). Faça upgrade para o plano PRO.`
      );
    }
    return entitlement;
  }

  // Fail-closed for any unknown or inconsistent state
  throw new TraditionalRaffleError(
    403,
    'HTTP_403_PLAN_ENTITLEMENT_DENIED',
    `Estado de assinatura não autorizado para sorteio (tier=${evaluatedRecord.tier}, statusState=${evaluatedRecord.statusState}).`
  );
}

// ============================================================================
// 1. NORMATIVE CRYPTOGRAPHIC FUNCTIONS (FROZEN SPEC 1.5.10 / 1.5.11 / 1.6.8)
// ============================================================================

export function sha256HexUtf8(input: string): string {
  return crypto.createHash('sha256').update(Buffer.from(input, 'utf8')).digest('hex');
}

/**
 * Normative Formula:
 * `C_server = SHA256(utf8(S_server || ":" || Salt))`
 */
export function computeServerCommitment(serverSeed: string, salt: string): string {
  if (typeof serverSeed !== 'string' || !/^[0-9a-f]{64}$/i.test(serverSeed)) {
    throw new TraditionalRaffleError(
      400,
      'INVALID_SERVER_SEED_FORMAT',
      'S_server must be a 64-character hexadecimal string (32 bytes).'
    );
  }
  if (typeof salt !== 'string' || !/^[0-9a-f]{32,64}$/i.test(salt)) {
    throw new TraditionalRaffleError(
      400,
      'INVALID_SALT_FORMAT',
      'Salt must be a 32-to-64 character hexadecimal string.'
    );
  }
  return sha256HexUtf8(`${serverSeed.toLowerCase()}:${salt.toLowerCase()}`);
}

/**
 * Normative Formula:
 * `H_roster = SHA256(utf8(canonicalizeRosterStrict(RawTickets)))`
 */
export function computeRosterSha256(rawTickets: CanonicalTicketEntry[]): {
  canonicalString: string;
  rosterSha256Hash: string;
  sortedTickets: CanonicalTicketEntry[];
} {
  try {
    const { canonicalString, sortedTickets } = canonicalizeRosterStrictWithTickets(rawTickets);
    const rosterSha256Hash = sha256HexUtf8(canonicalString);
    return {
      canonicalString,
      rosterSha256Hash,
      sortedTickets,
    };
  } catch (err) {
    throw new TraditionalRaffleError(
      400,
      'ROSTER_CANONICALIZATION_FAILED',
      (err as Error).message
    );
  }
}

export interface RequestFingerprintParams {
  ownerUid: string;
  raffleId: string;
  drawId: string;
  idempotencyKey: string;
  drawNonce: string;
  clientEntropy: string;
  expectedRosterVersion: number;
  expectedDrawSequence: number;
  drawMode: string;
  winnerCount: number;
  prizeId?: string | null;
}

/**
 * Normative 12-Field Fingerprint Formula (Frozen Spec 1.5.11 & 1.6.7):
 * `GIO_REQ_V1:ownerUid:raffleId:drawId:idempotencyKey:drawNonce:clientEntropy:expectedRosterVersion:expectedDrawSequence:drawMode:winnerCount:prizeId`
 */
export function computeRequestFingerprint(params: RequestFingerprintParams): {
  rawString: string;
  fingerprintHash: string;
} {
  const prizeIdNormalized =
    params.prizeId !== undefined && params.prizeId !== null && String(params.prizeId).trim() !== ''
      ? String(params.prizeId).trim()
      : 'NONE';

  const stringFields: Array<[string, string]> = [
    ['ownerUid', params.ownerUid],
    ['raffleId', params.raffleId],
    ['drawId', params.drawId],
    ['idempotencyKey', params.idempotencyKey],
    ['drawNonce', params.drawNonce],
    ['clientEntropy', params.clientEntropy],
    ['drawMode', params.drawMode],
    ['prizeId', prizeIdNormalized],
  ];

  for (const [name, value] of stringFields) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TraditionalRaffleError(400, `INVALID_FINGERPRINT_FIELD_${name.toUpperCase()}`);
    }
    if (value.includes(':')) {
      throw new TraditionalRaffleError(
        400,
        `COLON_FORBIDDEN_IN_FINGERPRINT_FIELD_${name.toUpperCase()}`
      );
    }
  }

  if (
    !Number.isSafeInteger(params.expectedRosterVersion) ||
    params.expectedRosterVersion < 1 ||
    !Number.isSafeInteger(params.expectedDrawSequence) ||
    params.expectedDrawSequence < 0 ||
    !Number.isSafeInteger(params.winnerCount) ||
    params.winnerCount < 1
  ) {
    throw new TraditionalRaffleError(400, 'INVALID_FINGERPRINT_INTEGER_FIELDS');
  }

  const parts = [
    'GIO_REQ_V1',
    params.ownerUid,
    params.raffleId,
    params.drawId,
    params.idempotencyKey,
    params.drawNonce,
    params.clientEntropy.toLowerCase(),
    String(params.expectedRosterVersion),
    String(params.expectedDrawSequence),
    params.drawMode,
    String(params.winnerCount),
    prizeIdNormalized,
  ];

  if (parts.length !== 12) {
    throw new TraditionalRaffleError(500, 'FINGERPRINT_FIELD_COUNT_INVARIANT_BROKEN');
  }

  const rawString = parts.join(':');
  return {
    rawString,
    fingerprintHash: sha256HexUtf8(rawString),
  };
}

export interface RejectionSamplingParams {
  serverSeed: string;
  rosterSha256Hash: string;
  clientEntropy: string;
  drawNonce: string;
  drawId: string;
  fencingToken: number;
  rosterVersion: number;
  drawSequence: number;
  totalTickets: number;
}

export interface RejectionSamplingResult {
  winningIndex: number;
  blockIndex: number;
  wordOffset: number;
  uint32Value: number;
  limitN: number;
  mBase: string;
  block0DigestHex: string;
  block0Words: number[];
}

/**
 * Frozen Normative Specification (Phases 1.5.10 / 1.5.11 / 1.6.8):
 * - `M_base = "GIO_PF_V2:" || H_roster || ":" || E_client || ":" || drawNonce || ":" || drawId || ":" || fencingToken || ":" || rosterVersion || ":" || drawSequence`
 * - `M_block_i = M_base || ":" || i` for `i = 0..99`
 * - HMAC key: `Buffer.from(S_server, "hex")` (32 raw bytes)
 * - HMAC message: `utf8(M_block_i)`
 * - 8 `uint32BE` words per block at byte offsets 0, 4, 8, 12, 16, 20, 24, 28
 * - `Limit_N = Math.floor(4294967296 / N) * N`
 * - Accept iff `U < Limit_N`; `winningIndex = U % N`
 */
export function computeRejectionSamplingDraw(
  params: RejectionSamplingParams
): RejectionSamplingResult {
  const {
    serverSeed,
    rosterSha256Hash,
    clientEntropy,
    drawNonce,
    drawId,
    fencingToken,
    rosterVersion,
    drawSequence,
    totalTickets,
  } = params;

  if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_INVALID_FENCING_TOKEN',
      'fencingToken deve ser um inteiro seguro estritamente positivo (>= 1).'
    );
  }
  if (!Number.isSafeInteger(rosterVersion) || rosterVersion < 1) {
    throw new TraditionalRaffleError(400, 'INVALID_ROSTER_VERSION');
  }
  if (!Number.isSafeInteger(drawSequence) || drawSequence < 0) {
    throw new TraditionalRaffleError(400, 'INVALID_DRAW_SEQUENCE');
  }
  if (!Number.isSafeInteger(totalTickets) || totalTickets <= 0 || totalTickets > 4294967296) {
    throw new TraditionalRaffleError(400, 'INVALID_TOTAL_TICKETS');
  }
  if (typeof serverSeed !== 'string' || !/^[0-9a-f]{64}$/i.test(serverSeed)) {
    throw new TraditionalRaffleError(400, 'INVALID_SERVER_SEED');
  }
  if (typeof rosterSha256Hash !== 'string' || !/^[0-9a-f]{64}$/i.test(rosterSha256Hash)) {
    throw new TraditionalRaffleError(400, 'INVALID_ROSTER_SHA256_HASH');
  }
  if (typeof clientEntropy !== 'string' || !/^[0-9a-f]{64}$/i.test(clientEntropy)) {
    throw new TraditionalRaffleError(400, 'INVALID_CLIENT_ENTROPY');
  }
  if (typeof drawNonce !== 'string' || drawNonce.trim().length === 0) {
    throw new TraditionalRaffleError(409, 'HTTP_409_INVALID_DRAW_NONCE');
  }
  if (typeof drawId !== 'string' || drawId.trim().length === 0) {
    throw new TraditionalRaffleError(400, 'INVALID_DRAW_ID');
  }

  const mBase = [
    'GIO_PF_V2',
    rosterSha256Hash.toLowerCase(),
    clientEntropy.toLowerCase(),
    drawNonce,
    drawId,
    String(fencingToken),
    String(rosterVersion),
    String(drawSequence),
  ].join(':');

  const keyBuffer = Buffer.from(serverSeed.toLowerCase(), 'hex');
  const TWO_POW_32 = 4294967296;
  const limitN = Math.floor(TWO_POW_32 / totalTickets) * totalTickets;

  let block0DigestHex = '';
  const block0Words: number[] = [];

  for (let blockIndex = 0; blockIndex < 100; blockIndex++) {
    const blockMsg = `${mBase}:${blockIndex}`;
    const digest = crypto.createHmac('sha256', keyBuffer).update(blockMsg, 'utf8').digest();

    if (blockIndex === 0) {
      block0DigestHex = digest.toString('hex');
      for (let w = 0; w < 32; w += 4) {
        block0Words.push(digest.readUInt32BE(w));
      }
    }

    for (let wordOffset = 0; wordOffset < 32; wordOffset += 4) {
      const u = digest.readUInt32BE(wordOffset);
      if (u < limitN) {
        const winningIndex = u % totalTickets;
        return {
          winningIndex,
          blockIndex,
          wordOffset,
          uint32Value: u,
          limitN,
          mBase,
          block0DigestHex,
          block0Words,
        };
      }
    }
  }

  throw new TraditionalRaffleError(
    500,
    'REJECTION_SAMPLING_EXHAUSTED',
    'All 800 uint32 candidates across 100 HMAC-SHA256 blocks were rejected.'
  );
}

/**
 * Normative Hash Chain Event Builder & Verifier:
 * `EventString = sequenceNumber:previousEventHash:eventType:timestampIso:canonicalPayloadJson`
 * `EventHash = SHA256(utf8(EventString))`
 */
export function buildLedgerEvent(params: {
  commitmentHash: string;
  sequenceNumber: number;
  previousEventHash: string;
  eventType: 'PRECOMMIT' | 'REVEALED' | 'EXPIRED';
  timestampIso: string;
  payload: Record<string, unknown>;
}): TraditionalDrawLedgerEvent {
  const canonicalPayloadJson = canonicalizeJSON(params.payload);
  const eventString = `${params.sequenceNumber}:${params.previousEventHash}:${params.eventType}:${params.timestampIso}:${canonicalPayloadJson}`;
  const eventHash = sha256HexUtf8(eventString);

  return {
    eventId: params.eventType,
    commitmentHash: params.commitmentHash,
    sequenceNumber: params.sequenceNumber,
    previousEventHash: params.previousEventHash,
    eventType: params.eventType,
    timestampIso: params.timestampIso,
    canonicalPayloadJson,
    payload: deepClone(params.payload),
    eventHash,
  };
}

const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

/**
 * Validates a single ledger event against its persisted fields and expected predecessor.
 */
export function verifySingleLedgerEvent(
  event: TraditionalDrawLedgerEvent | undefined,
  expectedEventType: 'PRECOMMIT' | 'REVEALED' | 'EXPIRED',
  expectedPreviousHash?: string,
  expectedSequenceNumber?: number
): void {
  if (!event) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_EVENT_MISSING',
      `Ledger event ${expectedEventType} is missing.`
    );
  }
  if (event.eventType !== expectedEventType) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_EVENT_TYPE_MISMATCH',
      `Expected eventType ${expectedEventType}, got ${event.eventType}`
    );
  }
  if (!Number.isSafeInteger(event.sequenceNumber) || event.sequenceNumber < 0) {
    throw new TraditionalRaffleError(409, 'HTTP_409_LEDGER_INVALID_SEQUENCE');
  }
  if (expectedSequenceNumber !== undefined && event.sequenceNumber !== expectedSequenceNumber) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_SEQUENCE_MISMATCH',
      `Expected sequenceNumber ${expectedSequenceNumber}, got ${event.sequenceNumber}`
    );
  }
  if (expectedPreviousHash !== undefined && event.previousEventHash !== expectedPreviousHash) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_PREVIOUS_HASH_MISMATCH',
      `Expected previousEventHash ${expectedPreviousHash}, got ${event.previousEventHash}`
    );
  }
  if (typeof event.timestampIso !== 'string' || Number.isNaN(Date.parse(event.timestampIso))) {
    throw new TraditionalRaffleError(409, 'HTTP_409_LEDGER_INVALID_TIMESTAMP');
  }

  const recomputedCanonicalJson = canonicalizeJSON(event.payload);
  if (recomputedCanonicalJson !== event.canonicalPayloadJson) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_PAYLOAD_TAMPERED',
      `Canonical payload mismatch on event ${event.eventType}`
    );
  }

  const eventString = `${event.sequenceNumber}:${event.previousEventHash}:${event.eventType}:${event.timestampIso}:${recomputedCanonicalJson}`;
  const recomputedHash = sha256HexUtf8(eventString);
  if (recomputedHash !== event.eventHash) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_HASH_TAMPERED',
      `EventHash mismatch on event ${event.eventType}: expected ${recomputedHash}, got ${event.eventHash}`
    );
  }
}

/**
 * Validates the complete per-commitment ledger chain (`PRECOMMIT` -> `REVEALED` or `PRECOMMIT` -> `EXPIRED`)
 * and verifies exact correspondence with `ledgerHead`.
 */
export function verifyLedgerChainIntegrity(params: {
  precommitEvent?: TraditionalDrawLedgerEvent;
  revealedEvent?: TraditionalDrawLedgerEvent;
  expiredEvent?: TraditionalDrawLedgerEvent;
  ledgerHead?: TraditionalDrawLedgerHead;
}): {
  terminalType: 'PRECOMMIT' | 'REVEALED' | 'EXPIRED';
  terminalEvent: TraditionalDrawLedgerEvent;
} {
  const { precommitEvent, revealedEvent, expiredEvent, ledgerHead } = params;

  if (!precommitEvent) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_INTEGRITY_VIOLATION',
      'PRECOMMIT genesis event is missing from public ledger.'
    );
  }
  if (!ledgerHead) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_INTEGRITY_VIOLATION',
      'Ledger head document is missing.'
    );
  }
  if (revealedEvent && expiredEvent) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_BIFURCATION_DETECTED',
      'Both REVEALED and EXPIRED events exist for the same commitment.'
    );
  }

  verifySingleLedgerEvent(precommitEvent, 'PRECOMMIT', GENESIS_PREVIOUS_HASH, 0);

  let terminalEvent: TraditionalDrawLedgerEvent = precommitEvent;

  if (revealedEvent) {
    verifySingleLedgerEvent(
      revealedEvent,
      'REVEALED',
      precommitEvent.eventHash,
      precommitEvent.sequenceNumber + 1
    );
    terminalEvent = revealedEvent;
  } else if (expiredEvent) {
    verifySingleLedgerEvent(
      expiredEvent,
      'EXPIRED',
      precommitEvent.eventHash,
      precommitEvent.sequenceNumber + 1
    );
    terminalEvent = expiredEvent;
  }

  if (
    ledgerHead.lastSequenceNumber !== terminalEvent.sequenceNumber ||
    ledgerHead.lastEventHash !== terminalEvent.eventHash ||
    ledgerHead.lastEventType !== terminalEvent.eventType
  ) {
    throw new TraditionalRaffleError(
      409,
      'HTTP_409_LEDGER_HEAD_DIVERGENCE',
      'Ledger head does not match the validated terminal event of the chain.'
    );
  }

  return {
    terminalType: terminalEvent.eventType,
    terminalEvent,
  };
}

// ============================================================================
// 2. AUTHORITATIVE TRADITIONAL RAFFLE SERVICE (R-01 THROUGH R-08)
// ============================================================================

export const PRECOMMIT_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const IDEMPOTENCY_LOCK_TIMEOUT_MS = 60 * 1000; // 60 seconds

export const PROTECTED_GOVERNANCE_FIELDS = [
  'rosterVersion',
  'drawSequence',
  'drawStateVersion',
  'fencingToken',
  'operationalState',
  'commitmentHash',
  'drawNonce',
  'lastDrawId',
] as const;

export class TraditionalRaffleService {
  private store: ITransactionalDrawStore;

  /**
   * R-01: By default, `TraditionalRaffleService` uses `defaultFirestoreTraditionalRaffleStore`
   * (`FirestoreAdminTransactionalStore`) connected to the named Cloud Firestore database.
   * `InMemoryTransactionalStore` is only used when explicitly passed in tests.
   */
  constructor(store: ITransactionalDrawStore = defaultFirestoreTraditionalRaffleStore) {
    this.store = store;
  }

  public getStore(): ITransactionalDrawStore {
    return this.store;
  }

  public setStoreForTests(store: ITransactionalDrawStore): void {
    this.store = store;
  }

  // ==========================================================================
  // DOCUMENT PATH BUILDERS (R-02 & R-08 COMPLIANT)
  // ==========================================================================

  public rafflePath(ownerUid: string, raffleId: string): string {
    return `users/${ownerUid}/raffles/${raffleId}`;
  }

  public uiPreferencesPath(ownerUid: string, raffleId: string): string {
    return `users/${ownerUid}/raffle_ui_preferences/${raffleId}`;
  }

  public privatePrecommitPath(commitmentHash: string): string {
    return `draw_precommits_private/${commitmentHash}`;
  }

  public ledgerHeadPath(commitmentHash: string): string {
    return `draw_ledger_public/${commitmentHash}`;
  }

  public ledgerEventPath(
    commitmentHash: string,
    eventType: 'PRECOMMIT' | 'REVEALED' | 'EXPIRED'
  ): string {
    return `draw_ledger_public/${commitmentHash}/events/${eventType}`;
  }

  /**
   * R-08: Idempotency records are strictly isolated under the owner's raffle hierarchy:
   * `users/{ownerUid}/raffles/{raffleId}/idempotency/{idempotencyKey}`
   */
  public idempotencyPath(ownerUid: string, raffleId: string, idempotencyKey: string): string {
    return `users/${ownerUid}/raffles/${raffleId}/idempotency/${idempotencyKey}`;
  }

  /**
   * R-02: Traditional Raffle permanent draw records are strictly isolated from TikTok LIVE (`/draws/{drawId}`):
   * `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}`
   */
  public permanentDrawPath(ownerUid: string, raffleId: string, drawId: string): string {
    return `users/${ownerUid}/raffles/${raffleId}/draws/${drawId}`;
  }

  public drawsCollectionPath(ownerUid: string, raffleId: string): string {
    return `users/${ownerUid}/raffles/${raffleId}/draws`;
  }

  /**
   * Enforces tenant ownership isolation:
   * - `authenticatedUid` comes strictly from the verified Firebase Auth token.
   * - If `requestedOwnerUid` is supplied and differs from `authenticatedUid`, throws HTTP 403.
   */
  public assertAuthenticatedOwner(
    authenticatedUid: string | undefined | null,
    requestedOwnerUid?: string | null
  ): string {
    if (!authenticatedUid || typeof authenticatedUid !== 'string' || !authenticatedUid.trim()) {
      throw new TraditionalRaffleError(
        401,
        'HTTP_401_UNAUTHENTICATED',
        'Autenticação Firebase obrigatória.'
      );
    }
    const cleanAuthUid = authenticatedUid.trim();
    if (
      requestedOwnerUid !== undefined &&
      requestedOwnerUid !== null &&
      String(requestedOwnerUid).trim() !== '' &&
      String(requestedOwnerUid).trim() !== cleanAuthUid
    ) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_FORBIDDEN_CROSS_TENANT',
        'Acesso negado: tentativa de operar sobre recurso de outro proprietário.'
      );
    }
    return cleanAuthUid;
  }

  /**
   * R-03: Rejects any client request body that attempts to inject or overwrite authoritative
   * governance fields (`rosterVersion`, `drawSequence`, `drawStateVersion`, `fencingToken`,
   * `operationalState`, `commitmentHash`, `drawNonce`, `lastDrawId`, or official `winners`).
   */
  public assertNoProtectedGovernanceFieldsInClientPayload(
    rawPayload: Record<string, unknown> | undefined | null,
    options?: { forbidClientWinners?: boolean }
  ): void {
    if (!rawPayload || typeof rawPayload !== 'object') return;
    for (const field of PROTECTED_GOVERNANCE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(rawPayload, field) && rawPayload[field] !== undefined) {
        throw new TraditionalRaffleError(
          403,
          'HTTP_403_PROTECTED_GOVERNANCE_FIELDS_FORBIDDEN',
          `O cliente não tem permissão para definir ou sobrescrever o campo de governança '${field}'.`
        );
      }
    }
    if (
      options?.forbidClientWinners &&
      Object.prototype.hasOwnProperty.call(rawPayload, 'winners') &&
      Array.isArray(rawPayload.winners) &&
      rawPayload.winners.length > 0
    ) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_CLIENT_WINNERS_OVERWRITE_FORBIDDEN',
        'O cliente não tem permissão para gravar ou sobrescrever ganhadores oficiais.'
      );
    }
  }

  /**
   * Computes the authoritative flat list of eligible tickets (`CanonicalTicketEntry[]`)
   * from the persisted `AuthoritativeTraditionalRaffleDocument`.
   */
  public computeAuthoritativeEligibleTickets(
    raffle: AuthoritativeTraditionalRaffleDocument
  ): CanonicalTicketEntry[] {
    const excludedSet = new Set<string>(raffle.excludedParticipantIds || []);
    const eligibleParticipants = (raffle.participants || []).filter(
      (p) => p && typeof p.id === 'string' && !excludedSet.has(p.id)
    );

    const computed = computeRaffle(eligibleParticipants, raffle.settings, raffle.winners || []);
    const tickets: CanonicalTicketEntry[] = [];

    for (const alloc of computed.allocations) {
      for (const ticketNumber of alloc.tickets) {
        tickets.push({
          participantId: alloc.participant.id,
          number: ticketNumber,
          name: alloc.participant.name,
        });
      }
    }

    return tickets;
  }

  /**
   * R-03 & R-04: Initializes a traditional raffle or updates non-authoritative UI metadata.
   * - Never overwrites `rosterVersion`, `drawSequence`, `drawStateVersion`, `fencingToken`,
   *   `operationalState`, `commitmentHash`, `drawNonce`, or official `winners`.
   * - Blocks sync when `operationalState === 'COMMITTED'`.
   * - When `strictClientGovernance === true` (HTTP `/api/raffle/sync`), forbids overwriting an
   *   already-populated roster (`existing.participants.length > 0 || existing.rosterVersion > 1 || existing.drawSequence > 0`),
   *   forcing all participant/allocation changes through `/api/raffle/participant/mutate`.
   */
  public async syncOrInitRaffleState(params: {
    authenticatedUid: string;
    raffleId?: string;
    title?: string;
    settings?: RaffleSettings;
    participants?: Participant[];
    winners?: Winner[];
    nowMs?: number;
    strictClientGovernance?: boolean;
    rawClientBody?: Record<string, unknown>;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    if (params.strictClientGovernance && params.rawClientBody) {
      this.assertNoProtectedGovernanceFieldsInClientPayload(params.rawClientBody, {
        forbidClientWinners: true,
      });
    }

    const raffleId = (params.raffleId || 'default').trim();
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists) {
        const initialDoc: AuthoritativeTraditionalRaffleDocument = {
          userId: ownerUid,
          raffleId,
          title:
            params.title ||
            params.settings?.raffleTitle ||
            DEFAULT_SETTINGS.raffleTitle ||
            'Sorteio Oficial',
          settings: params.settings ? deepClone(params.settings) : deepClone(DEFAULT_SETTINGS),
          participants: params.participants ? deepClone(params.participants) : [],
          excludedParticipantIds: [],
          winners: params.strictClientGovernance ? [] : params.winners ? deepClone(params.winners) : [],
          rosterVersion: 1,
          drawSequence: 0,
          drawStateVersion: 1,
          fencingToken: 0,
          operationalState: 'IDLE',
          commitmentHash: null,
          drawNonce: null,
          lastDrawId: null,
          updatedAt: nowIso,
        };
        tx.set(path, initialDoc);
        return initialDoc;
      }

      const existing = snap.data()!;
      if (existing.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }

      // R-03: Auto-save / sync must NEVER clobber an active COMMITTED draw state
      if (existing.operationalState === 'COMMITTED') {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_SYNC_FORBIDDEN_DURING_COMMITTED_STATE',
          'Não é permitido sincronizar ou sobrescrever a rifa enquanto houver um pré-compromisso criptográfico ativo (COMMITTED).'
        );
      }

      let rosterChanged = false;
      let nextParticipants = existing.participants;

      if (params.participants !== undefined) {
        const candidateParticipants = deepClone(params.participants);
        const prevSerialized = canonicalizeJSON(
          existing.participants.map((p) => ({ id: p.id, name: p.name, coins: p.coins }))
        );
        const nextSerialized = canonicalizeJSON(
          candidateParticipants.map((p) => ({ id: p.id, name: p.name, coins: p.coins }))
        );

        if (prevSerialized !== nextSerialized) {
          const isAlreadyBootstrapped =
            existing.participants.length > 0 ||
            existing.rosterVersion > 1 ||
            existing.drawSequence > 0;

          if (params.strictClientGovernance && isAlreadyBootstrapped) {
            throw new TraditionalRaffleError(
              409,
              'HTTP_409_DIRECT_ROSTER_OVERWRITE_FORBIDDEN',
              'A sobrescrita direta de participantes via /api/raffle/sync é proibida após a inicialização. Utilize POST /api/raffle/participant/mutate.'
            );
          }

          nextParticipants = candidateParticipants;
          rosterChanged = true;
        }
      }

      const nextSettings: RaffleSettings = params.settings
        ? {
            ...existing.settings,
            ...deepClone(params.settings),
          }
        : existing.settings;

      if (params.settings) {
        const allocationKeys: Array<keyof RaffleSettings> = [
          'rate',
          'total',
          'start',
          'order',
          'seed',
          'exclude',
        ];
        for (const k of allocationKeys) {
          if (existing.settings[k] !== nextSettings[k]) {
            if (
              params.strictClientGovernance &&
              (existing.participants.length > 0 || existing.rosterVersion > 1 || existing.drawSequence > 0)
            ) {
              throw new TraditionalRaffleError(
                409,
                'HTTP_409_DIRECT_ALLOCATION_SETTINGS_OVERWRITE_FORBIDDEN',
                `A alteração direta da regra de alocação '${k}' via /api/raffle/sync é proibida. Utilize POST /api/raffle/participant/mutate com action='updateRaffleAllocationSettings'.`
              );
            }
            rosterChanged = true;
            break;
          }
        }
      }

      // R-03: Preserve all authoritative governance fields and official winners
      const updatedDoc: AuthoritativeTraditionalRaffleDocument = {
        ...existing,
        title: params.title ?? nextSettings.raffleTitle ?? existing.title,
        settings: nextSettings,
        participants: nextParticipants,
        winners: existing.winners,
        rosterVersion: rosterChanged ? existing.rosterVersion + 1 : existing.rosterVersion,
        drawSequence: existing.drawSequence,
        drawStateVersion: existing.drawStateVersion + 1,
        fencingToken: existing.fencingToken,
        operationalState: existing.operationalState,
        commitmentHash: existing.commitmentHash,
        drawNonce: existing.drawNonce,
        lastDrawId: existing.lastDrawId,
        updatedAt: nowIso,
      };

      tx.set(path, updatedDoc);
      return updatedDoc;
    });
  }

  public async getRaffleStateForOwner(
    authenticatedUid: string,
    raffleId = 'default',
    targetOwnerUid?: string
  ): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(authenticatedUid, targetOwnerUid);
    const snap = await this.store.getDocDirect<AuthoritativeTraditionalRaffleDocument>(
      this.rafflePath(ownerUid, raffleId)
    );
    if (!snap.exists) {
      throw new TraditionalRaffleError(
        404,
        'HTTP_404_RAFFLE_NOT_FOUND',
        `Rifa '${raffleId}' não encontrada para o organizador autenticado.`
      );
    }
    const data = snap.data()!;
    if (data.userId !== ownerUid) {
      throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
    }
    return data;
  }

  /**
   * R-02: Lists permanent draw records for a traditional raffle from
   * `users/{ownerUid}/raffles/{raffleId}/draws`.
   */
  public async listRaffleDrawsForOwner(
    authenticatedUid: string,
    raffleId = 'default',
    targetOwnerUid?: string
  ): Promise<TraditionalPermanentDrawRecord[]> {
    const ownerUid = this.assertAuthenticatedOwner(authenticatedUid, targetOwnerUid);
    const collectionPath = this.drawsCollectionPath(ownerUid, (raffleId || 'default').trim());
    const docs = await this.store.listCollectionDocs<TraditionalPermanentDrawRecord>(
      collectionPath,
      100
    );
    return docs
      .filter((d) => d && d.ownerUid === ownerUid)
      .sort((a, b) => (b.drawnAtMs || 0) - (a.drawnAtMs || 0));
  }

  // ==========================================================================
  // R-04: ROSTER GOVERNANCE OPERATIONS (ALL 6 HANDLERS + ATOMIC rosterVersion++)
  // ==========================================================================

  private buildInitialRaffleIfMissing(
    ownerUid: string,
    raffleId: string,
    nowIso: string
  ): AuthoritativeTraditionalRaffleDocument {
    return {
      userId: ownerUid,
      raffleId,
      title: DEFAULT_SETTINGS.raffleTitle || 'Sorteio Oficial',
      settings: deepClone(DEFAULT_SETTINGS),
      participants: [],
      excludedParticipantIds: [],
      winners: [],
      rosterVersion: 1,
      drawSequence: 0,
      drawStateVersion: 1,
      fencingToken: 0,
      operationalState: 'IDLE',
      commitmentHash: null,
      drawNonce: null,
      lastDrawId: null,
      updatedAt: nowIso,
    };
  }

  /**
   * Handler 1: `addParticipant`
   * Adds a new participant (or merges coins if a participant with the same case-insensitive name
   * already exists and `mergeIfSameName !== false`), atomically incrementing `rosterVersion`.
   */
  public async addParticipant(params: {
    authenticatedUid: string;
    raffleId?: string;
    participant: Participant;
    mergeIfSameName?: boolean;
    autoCreateIfMissing?: boolean;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    if (!params.participant || typeof params.participant.name !== 'string') {
      throw new TraditionalRaffleError(400, 'INVALID_PARTICIPANT_PAYLOAD');
    }
    const cleanName = params.participant.name
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();
    if (!cleanName) {
      throw new TraditionalRaffleError(400, 'INVALID_PARTICIPANT_NAME');
    }
    const coins = Number(params.participant.coins);
    if (!Number.isFinite(coins) || coins < 0) {
      throw new TraditionalRaffleError(400, 'INVALID_PARTICIPANT_COINS');
    }

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists && !params.autoCreateIfMissing) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.exists
        ? snap.data()!
        : this.buildInitialRaffleIfMissing(ownerUid, raffleId, nowIso);
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }

      const nextParticipants = [...raffle.participants];
      const existingIdx =
        params.mergeIfSameName === true
          ? nextParticipants.findIndex((p) => p.name.toLowerCase() === cleanName.toLowerCase())
          : -1;

      if (existingIdx >= 0) {
        nextParticipants[existingIdx] = {
          ...nextParticipants[existingIdx],
          coins: nextParticipants[existingIdx].coins + coins,
        };
      } else {
        nextParticipants.push({
          id: params.participant.id || generateUid(),
          name: cleanName,
          coins,
          addedAt: params.participant.addedAt || nowMs,
        });
      }

      // S-02: Validate FREE/PRO participant limit inside transaction BEFORE write
      await validateOrganizerPlanEntitlement(
        ownerUid,
        nextParticipants.length,
        1,
        nowMs
      );

      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        participants: nextParticipants,
        rosterVersion: snap.exists ? raffle.rosterVersion + 1 : 1,
        drawStateVersion: snap.exists ? raffle.drawStateVersion + 1 : 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  /**
   * Handler 2: `updateParticipantCoins`
   */
  public async updateParticipantCoins(params: {
    authenticatedUid: string;
    raffleId?: string;
    participantId: string;
    coins: number;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    if (typeof params.coins !== 'number' || !Number.isFinite(params.coins) || params.coins < 0) {
      throw new TraditionalRaffleError(400, 'INVALID_PARTICIPANT_COINS');
    }

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.data()!;
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }
      let found = false;
      const nextParticipants = raffle.participants.map((p) => {
        if (p.id === params.participantId) {
          found = true;
          return { ...p, coins: params.coins };
        }
        return p;
      });
      if (!found) {
        throw new TraditionalRaffleError(404, 'HTTP_404_PARTICIPANT_NOT_FOUND');
      }
      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        participants: nextParticipants,
        rosterVersion: raffle.rosterVersion + 1,
        drawStateVersion: raffle.drawStateVersion + 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  /**
   * Handler 3: `removeParticipant`
   */
  public async removeParticipant(params: {
    authenticatedUid: string;
    raffleId?: string;
    participantId: string;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.data()!;
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }
      const filtered = raffle.participants.filter((p) => p.id !== params.participantId);
      if (filtered.length === raffle.participants.length) {
        throw new TraditionalRaffleError(404, 'HTTP_404_PARTICIPANT_NOT_FOUND');
      }
      const excluded = (raffle.excludedParticipantIds || []).filter(
        (id) => id !== params.participantId
      );
      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        participants: filtered,
        excludedParticipantIds: excluded,
        rosterVersion: raffle.rosterVersion + 1,
        drawStateVersion: raffle.drawStateVersion + 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  /**
   * Handler 4: `clearAllParticipants`
   * Clears all participants from the active roster and increments `rosterVersion`.
   */
  public async clearAllParticipants(params: {
    authenticatedUid: string;
    raffleId?: string;
    autoCreateIfMissing?: boolean;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists && !params.autoCreateIfMissing) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.exists
        ? snap.data()!
        : this.buildInitialRaffleIfMissing(ownerUid, raffleId, nowIso);
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }
      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        participants: [],
        excludedParticipantIds: [],
        rosterVersion: raffle.rosterVersion + 1,
        drawStateVersion: raffle.drawStateVersion + 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  /**
   * Handler 5: `bulkAddParticipants`
   * Adds or replaces a batch of participants, merging coins by case-insensitive name,
   * and atomically increments `rosterVersion`.
   */
  public async bulkAddParticipants(params: {
    authenticatedUid: string;
    raffleId?: string;
    items: Array<{ id?: string; name: string; coins: number; addedAt?: number }>;
    replace?: boolean;
    autoCreateIfMissing?: boolean;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    if (!Array.isArray(params.items)) {
      throw new TraditionalRaffleError(400, 'INVALID_BULK_PARTICIPANTS_PAYLOAD');
    }

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists && !params.autoCreateIfMissing) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.exists
        ? snap.data()!
        : this.buildInitialRaffleIfMissing(ownerUid, raffleId, nowIso);
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }

      const base: Participant[] = params.replace ? [] : deepClone(raffle.participants);

      for (const rawItem of params.items) {
        if (!rawItem || typeof rawItem.name !== 'string') continue;
        const cleanName = rawItem.name
          .normalize('NFC')
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          .trim();
        const coins = Number(rawItem.coins);
        if (!cleanName || !Number.isFinite(coins) || coins < 0) continue;

        const existingIdx = base.findIndex(
          (p) => p.name.toLowerCase() === cleanName.toLowerCase()
        );
        if (existingIdx >= 0) {
          base[existingIdx] = {
            ...base[existingIdx],
            coins: base[existingIdx].coins + coins,
          };
        } else {
          base.push({
            id: rawItem.id || generateUid(),
            name: cleanName,
            coins,
            addedAt: rawItem.addedAt || nowMs,
          });
        }
      }

      // S-02: Validate FREE/PRO participant limit inside transaction BEFORE write
      await validateOrganizerPlanEntitlement(
        ownerUid,
        base.length,
        1,
        nowMs
      );

      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        participants: base,
        excludedParticipantIds: params.replace ? [] : raffle.excludedParticipantIds || [],
        rosterVersion: snap.exists ? raffle.rosterVersion + 1 : 1,
        drawStateVersion: snap.exists ? raffle.drawStateVersion + 1 : 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  public async updateParticipantEligibility(params: {
    authenticatedUid: string;
    raffleId?: string;
    participantId: string;
    eligible: boolean;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.data()!;
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }
      const exists = raffle.participants.some((p) => p.id === params.participantId);
      if (!exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_PARTICIPANT_NOT_FOUND');
      }
      const excluded = new Set<string>(raffle.excludedParticipantIds || []);
      if (params.eligible) {
        excluded.delete(params.participantId);
      } else {
        excluded.add(params.participantId);
      }
      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        excludedParticipantIds: Array.from(excluded),
        rosterVersion: raffle.rosterVersion + 1,
        drawStateVersion: raffle.drawStateVersion + 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  public async updateParticipantCanonicalDetails(params: {
    authenticatedUid: string;
    raffleId?: string;
    participantId: string;
    name: string;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    const cleanName = String(params.name || '')
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();
    if (!cleanName) {
      throw new TraditionalRaffleError(400, 'INVALID_PARTICIPANT_NAME');
    }

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.data()!;
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }
      let found = false;
      const nextParticipants = raffle.participants.map((p) => {
        if (p.id === params.participantId) {
          found = true;
          return { ...p, name: cleanName };
        }
        return p;
      });
      if (!found) {
        throw new TraditionalRaffleError(404, 'HTTP_404_PARTICIPANT_NOT_FOUND');
      }
      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        participants: nextParticipants,
        rosterVersion: raffle.rosterVersion + 1,
        drawStateVersion: raffle.drawStateVersion + 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  /**
   * Handler 6: `updateRaffleAllocationSettings`
   * Updates raffle settings and atomically increments `rosterVersion`.
   */
  public async updateRaffleAllocationSettings(params: {
    authenticatedUid: string;
    raffleId?: string;
    settingsPatch: Partial<RaffleSettings>;
    autoCreateIfMissing?: boolean;
    nowMs?: number;
  }): Promise<AuthoritativeTraditionalRaffleDocument> {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowIso = new Date(params.nowMs ?? Date.now()).toISOString();
    const path = this.rafflePath(ownerUid, raffleId);

    return this.store.runTransaction(async (tx) => {
      const snap = await tx.get<AuthoritativeTraditionalRaffleDocument>(path);
      if (!snap.exists && !params.autoCreateIfMissing) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = snap.exists
        ? snap.data()!
        : this.buildInitialRaffleIfMissing(ownerUid, raffleId, nowIso);
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }
      const nextSettings: RaffleSettings = {
        ...raffle.settings,
        ...deepClone(params.settingsPatch),
      };
      const updated: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        title: nextSettings.raffleTitle || raffle.title,
        settings: nextSettings,
        rosterVersion: snap.exists ? raffle.rosterVersion + 1 : 1,
        drawStateVersion: snap.exists ? raffle.drawStateVersion + 1 : 1,
        updatedAt: nowIso,
      };
      tx.set(path, updated);
      return updated;
    });
  }

  // ==========================================================================
  // PRE-COMMIT CREATION (NON-DETERMINISTIC INPUTS GENERATED OUTSIDE TRANSACTION)
  // ==========================================================================

  public async createDrawPrecommit(params: {
    authenticatedUid: string;
    raffleId?: string;
    requestedOwnerUid?: string;
    nowMs?: number;
    ttlMs?: number;
    deterministicSeedForTests?: {
      serverSeed: string;
      salt: string;
      drawNonce: string;
    };
  }): Promise<{
    commitmentHash: string;
    drawNonce: string;
    fencingToken: number;
    rosterVersion: number;
    drawSequence: number;
    expiresAtIso: string;
    ledgerEventHash: string;
  }> {
    const ownerUid = this.assertAuthenticatedOwner(
      params.authenticatedUid,
      params.requestedOwnerUid
    );
    const raffleId = (params.raffleId || 'default').trim();

    // Generate all non-deterministic inputs BEFORE entering the transaction callback
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const ttlMs = params.ttlMs ?? PRECOMMIT_TTL_MS;
    const expiresAtMs = nowMs + ttlMs;
    const expiresAtIso = new Date(expiresAtMs).toISOString();

    const serverSeed = params.deterministicSeedForTests
      ? params.deterministicSeedForTests.serverSeed.toLowerCase()
      : crypto.randomBytes(32).toString('hex');
    const salt = params.deterministicSeedForTests
      ? params.deterministicSeedForTests.salt.toLowerCase()
      : crypto.randomBytes(16).toString('hex');
    const drawNonce = params.deterministicSeedForTests
      ? params.deterministicSeedForTests.drawNonce
      : `nonce_${crypto.randomBytes(12).toString('hex')}`;

    const commitmentHash = computeServerCommitment(serverSeed, salt);

    const raffleDocPath = this.rafflePath(ownerUid, raffleId);
    const precommitDocPath = this.privatePrecommitPath(commitmentHash);
    const ledgerHeadDocPath = this.ledgerHeadPath(commitmentHash);
    const precommitEventDocPath = this.ledgerEventPath(commitmentHash, 'PRECOMMIT');

    // Preliminary check of raffle & plan entitlement outside transaction
    const preliminarySnap = await this.store.getDocDirect<AuthoritativeTraditionalRaffleDocument>(
      raffleDocPath
    );
    if (!preliminarySnap.exists) {
      throw new TraditionalRaffleError(
        404,
        'HTTP_404_RAFFLE_NOT_FOUND',
        `Rifa '${raffleId}' não encontrada para o organizador autenticado.`
      );
    }
    const preliminaryRaffle = preliminarySnap.data()!;
    if (preliminaryRaffle.userId !== ownerUid) {
      throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
    }

    await validateOrganizerPlanEntitlement(
      ownerUid,
      preliminaryRaffle.participants.length,
      1,
      nowMs
    );

    return this.store.runTransaction(async (tx) => {
      // 1. ALL READS FIRST
      const raffleSnap = await tx.get<AuthoritativeTraditionalRaffleDocument>(raffleDocPath);
      const existingPrecommitSnap = await tx.get<TraditionalDrawPrecommitRecord>(precommitDocPath);

      if (!raffleSnap.exists) {
        throw new TraditionalRaffleError(
          404,
          'HTTP_404_RAFFLE_NOT_FOUND',
          `Rifa '${raffleId}' não encontrada para o organizador autenticado.`
        );
      }

      const raffle = raffleSnap.data()!;
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }

      // S-02: Validate FREE/PRO participant limit inside transaction before writes
      await validateOrganizerPlanEntitlement(
        ownerUid,
        raffle.participants.length,
        1,
        nowMs
      );

      const eligibleTickets = this.computeAuthoritativeEligibleTickets(raffle);
      if (eligibleTickets.length === 0) {
        throw new TraditionalRaffleError(
          400,
          'HTTP_400_NO_ELIGIBLE_TICKETS',
          'Não há bilhetes elegíveis para realizar o pré-compromisso do sorteio.'
        );
      }

      if (existingPrecommitSnap.exists) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_COMMITMENT_COLLISION',
          'CommitmentHash já existente.'
        );
      }

      const nextFencingToken = (raffle.fencingToken || 0) + 1;

      const precommitRecord: TraditionalDrawPrecommitRecord = {
        commitmentHash,
        ownerUid,
        raffleId,
        serverSeed,
        salt,
        drawNonce,
        fencingToken: nextFencingToken,
        rosterVersionAtCommit: raffle.rosterVersion,
        drawSequenceAtCommit: raffle.drawSequence,
        status: 'COMMITTED',
        createdAtMs: nowMs,
        createdAtIso: nowIso,
        expiresAtMs,
        expiresAtIso,
      };

      const precommitEvent = buildLedgerEvent({
        commitmentHash,
        sequenceNumber: 0,
        previousEventHash: GENESIS_PREVIOUS_HASH,
        eventType: 'PRECOMMIT',
        timestampIso: nowIso,
        payload: {
          commitmentHash,
          drawNonce,
          drawSequenceAtCommit: raffle.drawSequence,
          expiresAtIso,
          fencingToken: nextFencingToken,
          ownerUid,
          protocolVersion: 'GIO_PF_V2',
          raffleId,
          rosterVersionAtCommit: raffle.rosterVersion,
        },
      });

      const ledgerHead: TraditionalDrawLedgerHead = {
        commitmentHash,
        raffleId,
        ownerUid,
        lastSequenceNumber: 0,
        lastEventHash: precommitEvent.eventHash,
        lastEventType: 'PRECOMMIT',
        updatedAtIso: nowIso,
      };

      const updatedRaffle: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        fencingToken: nextFencingToken,
        drawStateVersion: raffle.drawStateVersion + 1,
        operationalState: 'COMMITTED',
        commitmentHash,
        drawNonce,
        updatedAt: nowIso,
      };

      // 2. ALL WRITES
      tx.set(precommitDocPath, precommitRecord);
      tx.set(precommitEventDocPath, precommitEvent);
      tx.set(ledgerHeadDocPath, ledgerHead);
      tx.set(raffleDocPath, updatedRaffle);

      return {
        commitmentHash,
        drawNonce,
        fencingToken: nextFencingToken,
        rosterVersion: raffle.rosterVersion,
        drawSequence: raffle.drawSequence,
        expiresAtIso,
        ledgerEventHash: precommitEvent.eventHash,
      };
    });
  }

  // ==========================================================================
  // R-06 & R-08: IDEMPOTENCY ACQUISITION & INTEGRATED ABANDONED LOCK RECOVERY
  // ==========================================================================

  /**
   * Acquires or replays an idempotency record at
   * `users/{ownerUid}/raffles/{raffleId}/idempotency/{idempotencyKey}`.
   *
   * R-06 Integration:
   * If an `IN_PROGRESS` lock exists with the same 12-field `requestFingerprint`,
   * no permanent draw exists at `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}`,
   * and `nowMs - existing.startedAtMs > IDEMPOTENCY_LOCK_TIMEOUT_MS` (60s),
   * it validates the active `precommit` (when `commitmentHash` is provided),
   * atomically rotates `lockAcquisitionId`, increments `recoveredCount`, and allows
   * the new worker to complete while blocking any stale worker with `409 HTTP_409_LOCK_OWNERSHIP_LOST`.
   */
  public async acquireIdempotency(params: {
    ownerUid: string;
    raffleId: string;
    idempotencyKey: string;
    drawId: string;
    commitmentHash?: string;
    requestFingerprint: string;
    fencingToken: number;
    lockAcquisitionId: string;
    nowMs: number;
  }): Promise<
    | { mode: 'ACQUIRED'; lockAcquisitionId: string; recoveredFromAbandoned?: boolean }
    | { mode: 'REPLAY'; responseStatus: number; responseBody: Record<string, unknown> }
  > {
    const {
      ownerUid,
      raffleId,
      idempotencyKey,
      drawId,
      commitmentHash,
      requestFingerprint,
      fencingToken,
      lockAcquisitionId,
      nowMs,
    } = params;

    const nowIso = new Date(nowMs).toISOString();
    const idemDocPath = this.idempotencyPath(ownerUid, raffleId, idempotencyKey);
    const permanentDrawDocPath = this.permanentDrawPath(ownerUid, raffleId, drawId);
    const precommitDocPath = commitmentHash ? this.privatePrecommitPath(commitmentHash) : null;

    return this.store.runTransaction(async (tx) => {
      // ALL READS FIRST
      const idemSnap = await tx.get<TraditionalDrawIdempotencyRecord>(idemDocPath);
      const drawSnap = await tx.get<TraditionalPermanentDrawRecord>(permanentDrawDocPath);
      const precommitSnap = precommitDocPath
        ? await tx.get<TraditionalDrawPrecommitRecord>(precommitDocPath)
        : null;

      if (idemSnap.exists) {
        const existing = idemSnap.data()!;
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new TraditionalRaffleError(
            409,
            'HTTP_409_IDEMPOTENCY_PAYLOAD_MISMATCH',
            'A mesma idempotencyKey foi reutilizada com um payload (fingerprint) diferente.'
          );
        }

        if (existing.status === 'COMPLETED' && existing.responseBody) {
          return {
            mode: 'REPLAY',
            responseStatus: existing.responseStatus ?? 200,
            responseBody: {
              ...deepClone(existing.responseBody),
              idempotentReplay: true,
            },
          };
        }

        // If permanent draw record already exists at `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}`,
        // heal the idempotency record and return the persisted draw result!
        if (drawSnap.exists) {
          const permDraw = drawSnap.data()!;
          const healedBody = this.buildDrawResponseBody(permDraw, true);
          tx.set(
            idemDocPath,
            {
              ...existing,
              status: 'COMPLETED',
              completedAtMs: nowMs,
              completedAtIso: nowIso,
              responseStatus: 200,
              responseBody: healedBody,
            } satisfies TraditionalDrawIdempotencyRecord
          );
          return {
            mode: 'REPLAY',
            responseStatus: 200,
            responseBody: healedBody,
          };
        }

        // R-06: Check if the `IN_PROGRESS` lock has expired (> 60s)
        const elapsedMs = nowMs - existing.startedAtMs;
        if (elapsedMs <= IDEMPOTENCY_LOCK_TIMEOUT_MS) {
          throw new TraditionalRaffleError(
            409,
            'HTTP_409_OPERATION_IN_PROGRESS',
            'Uma operação com esta chave de idempotência já está em andamento.'
          );
        }

        // R-06: Lock is expired (> 60s). Validate precommit if supplied before rotating lockAcquisitionId
        if (precommitSnap) {
          if (!precommitSnap.exists) {
            throw new TraditionalRaffleError(404, 'HTTP_404_PRECOMMIT_NOT_FOUND');
          }
          const precommit = precommitSnap.data()!;
          if (precommit.ownerUid !== ownerUid || precommit.raffleId !== raffleId) {
            throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_PRECOMMIT_OWNERSHIP');
          }
          if (precommit.status !== 'COMMITTED') {
            throw new TraditionalRaffleError(
              409,
              `HTTP_409_PRECOMMIT_ALREADY_${precommit.status}`,
              `O pré-compromisso não está mais ativo para recuperação (status=${precommit.status}).`
            );
          }
          if (nowMs > precommit.expiresAtMs) {
            throw new TraditionalRaffleError(
              409,
              'HTTP_409_PRECOMMIT_EXPIRED',
              'O pré-compromisso criptográfico expirou antes da recuperação do lock.'
            );
          }
        }

        const recoveredRecord: TraditionalDrawIdempotencyRecord = {
          ...existing,
          lockAcquisitionId,
          fencingToken,
          startedAtMs: nowMs,
          startedAtIso: nowIso,
          recoveredCount: (existing.recoveredCount || 0) + 1,
          lastRecoveredAtIso: nowIso,
        };
        tx.set(idemDocPath, recoveredRecord);
        return {
          mode: 'ACQUIRED',
          lockAcquisitionId,
          recoveredFromAbandoned: true,
        };
      }

      // Even if idempotency record was evicted by TTL, check permanent `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}`
      if (drawSnap.exists) {
        const permDraw = drawSnap.data()!;
        if (permDraw.ownerUid !== ownerUid || permDraw.raffleId !== raffleId) {
          throw new TraditionalRaffleError(409, 'HTTP_409_DRAW_ID_ALREADY_EXISTS');
        }
        if (
          permDraw.idempotencyKey === idempotencyKey &&
          permDraw.requestFingerprint === requestFingerprint
        ) {
          return {
            mode: 'REPLAY',
            responseStatus: 200,
            responseBody: this.buildDrawResponseBody(permDraw, true),
          };
        }
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_DRAW_ID_ALREADY_CONSUMED',
          `O drawId '${drawId}' já foi utilizado em outro sorteio permanente.`
        );
      }

      const newRecord: TraditionalDrawIdempotencyRecord = {
        compositeKey: `${ownerUid}_${raffleId}_${idempotencyKey}`,
        ownerUid,
        raffleId,
        idempotencyKey,
        drawId,
        requestFingerprint,
        status: 'IN_PROGRESS',
        lockAcquisitionId,
        fencingToken,
        startedAtMs: nowMs,
        startedAtIso: nowIso,
      };

      tx.set(idemDocPath, newRecord);
      return { mode: 'ACQUIRED', lockAcquisitionId };
    });
  }

  /**
   * R-06: Explicit abandoned lock recovery method (`recoverAbandonedDraw`).
   * Validates:
   * - Lock `IN_PROGRESS` expired (`> 60s`)
   * - Exact same 12-field `requestFingerprint`
   * - Absence of permanent draw at `users/{ownerUid}/raffles/{raffleId}/draws/{drawId}`
   * - Valid active precommit (when `commitmentHash` is supplied)
   * - Rotates `lockAcquisitionId` so any zombie worker fails with `HTTP_409_LOCK_OWNERSHIP_LOST`.
   */
  public async recoverAbandonedDraw(params: {
    authenticatedUid: string;
    raffleId?: string;
    idempotencyKey: string;
    drawId: string;
    commitmentHash?: string;
    requestFingerprint: string;
    nowMs?: number;
    newLockAcquisitionId?: string;
  }): Promise<
    | { mode: 'RECOVERED_LOCK'; lockAcquisitionId: string }
    | { mode: 'ALREADY_COMPLETED'; responseBody: Record<string, unknown> }
  > {
    const ownerUid = this.assertAuthenticatedOwner(params.authenticatedUid);
    const raffleId = (params.raffleId || 'default').trim();
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const newLockAcquisitionId =
      params.newLockAcquisitionId || `lock_rec_${crypto.randomBytes(12).toString('hex')}`;

    const idemDocPath = this.idempotencyPath(ownerUid, raffleId, params.idempotencyKey);
    const permanentDrawDocPath = this.permanentDrawPath(ownerUid, raffleId, params.drawId);
    const precommitDocPath = params.commitmentHash
      ? this.privatePrecommitPath(params.commitmentHash)
      : null;

    return this.store.runTransaction(async (tx) => {
      const idemSnap = await tx.get<TraditionalDrawIdempotencyRecord>(idemDocPath);
      const drawSnap = await tx.get<TraditionalPermanentDrawRecord>(permanentDrawDocPath);
      const precommitSnap = precommitDocPath
        ? await tx.get<TraditionalDrawPrecommitRecord>(precommitDocPath)
        : null;

      if (!idemSnap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_IDEMPOTENCY_RECORD_NOT_FOUND');
      }

      const idemData = idemSnap.data()!;
      if (idemData.requestFingerprint !== params.requestFingerprint) {
        throw new TraditionalRaffleError(409, 'HTTP_409_IDEMPOTENCY_PAYLOAD_MISMATCH');
      }

      if (idemData.status === 'COMPLETED' && idemData.responseBody) {
        return {
          mode: 'ALREADY_COMPLETED',
          responseBody: {
            ...deepClone(idemData.responseBody),
            idempotentReplay: true,
          },
        };
      }

      if (drawSnap.exists) {
        const permDraw = drawSnap.data()!;
        const responseBody = this.buildDrawResponseBody(permDraw, true);
        tx.set(idemDocPath, {
          ...idemData,
          status: 'COMPLETED',
          completedAtMs: nowMs,
          completedAtIso: nowIso,
          responseStatus: 200,
          responseBody,
        } satisfies TraditionalDrawIdempotencyRecord);
        return {
          mode: 'ALREADY_COMPLETED',
          responseBody,
        };
      }

      const elapsedMs = nowMs - idemData.startedAtMs;
      if (elapsedMs <= IDEMPOTENCY_LOCK_TIMEOUT_MS) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_LOCK_NOT_YET_EXPIRED',
          `A operação ainda está dentro da janela ativa de lock (${elapsedMs}ms <= ${IDEMPOTENCY_LOCK_TIMEOUT_MS}ms).`
        );
      }

      if (precommitSnap) {
        if (!precommitSnap.exists) {
          throw new TraditionalRaffleError(404, 'HTTP_404_PRECOMMIT_NOT_FOUND');
        }
        const precommit = precommitSnap.data()!;
        if (precommit.ownerUid !== ownerUid || precommit.raffleId !== raffleId) {
          throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_PRECOMMIT_OWNERSHIP');
        }
        if (precommit.status !== 'COMMITTED') {
          throw new TraditionalRaffleError(
            409,
            `HTTP_409_PRECOMMIT_ALREADY_${precommit.status}`,
            `O pré-compromisso não está mais ativo (status=${precommit.status}).`
          );
        }
        if (nowMs > precommit.expiresAtMs) {
          throw new TraditionalRaffleError(
            409,
            'HTTP_409_PRECOMMIT_EXPIRED',
            'O pré-compromisso criptográfico expirou.'
          );
        }
      }

      const updatedLock: TraditionalDrawIdempotencyRecord = {
        ...idemData,
        lockAcquisitionId: newLockAcquisitionId,
        startedAtMs: nowMs,
        startedAtIso: nowIso,
        recoveredCount: (idemData.recoveredCount || 0) + 1,
        lastRecoveredAtIso: nowIso,
      };

      tx.set(idemDocPath, updatedLock);
      return {
        mode: 'RECOVERED_LOCK',
        lockAcquisitionId: newLockAcquisitionId,
      };
    });
  }

  // ==========================================================================
  // OFFICIAL DRAW EXECUTION (AUTHORITATIVE BACKEND COMMIT)
  // ==========================================================================

  public async executeOfficialDraw(params: {
    authenticatedUid: string;
    requestedOwnerUid?: string;
    raffleId?: string;
    drawId: string;
    idempotencyKey: string;
    commitmentHash: string;
    clientEntropy: string;
    expectedRosterVersion: number;
    expectedDrawSequence: number;
    fencingToken: number;
    drawMode?: DrawMode;
    winnerCount?: number;
    prizeId?: string | null;
    prizeName?: string;
    clientSuppliedDrawNonce?: string;
    nowMs?: number;
    lockAcquisitionIdOverride?: string;
  }): Promise<{
    statusCode: number;
    body: Record<string, unknown>;
  }> {
    // 1. Validate Firebase Auth & 2. Identify owner strictly from verified token
    const ownerUid = this.assertAuthenticatedOwner(
      params.authenticatedUid,
      params.requestedOwnerUid
    );
    const raffleId = (params.raffleId || 'default').trim();
    const drawMode: DrawMode = params.drawMode || 'drum';
    const winnerCount = params.winnerCount ?? 1;
    const prizeId = params.prizeId ?? 'NONE';
    const nowMs = params.nowMs ?? Date.now();

    if (!Number.isSafeInteger(params.fencingToken) || params.fencingToken <= 0) {
      throw new TraditionalRaffleError(
        409,
        'HTTP_409_INVALID_FENCING_TOKEN',
        'fencingToken ausente ou inválido.'
      );
    }

    if (
      typeof params.clientEntropy !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(params.clientEntropy)
    ) {
      throw new TraditionalRaffleError(
        400,
        'HTTP_400_INVALID_CLIENT_ENTROPY',
        'clientEntropy deve conter 64 caracteres hexadecimais (256 bits).'
      );
    }

    // Verify raffle existence & ownership before precommit check
    const raffleCheckSnap = await this.store.getDocDirect<AuthoritativeTraditionalRaffleDocument>(
      this.rafflePath(ownerUid, raffleId)
    );
    if (!raffleCheckSnap.exists) {
      throw new TraditionalRaffleError(
        404,
        'HTTP_404_RAFFLE_NOT_FOUND',
        `Rifa '${raffleId}' não encontrada para o organizador autenticado.`
      );
    }
    const raffleCheck = raffleCheckSnap.data()!;
    if (raffleCheck.userId !== ownerUid) {
      throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
    }

    // R-05: Real async plan & subscription validation
    await validateOrganizerPlanEntitlement(
      ownerUid,
      raffleCheck.participants.length,
      winnerCount,
      nowMs
    );

    // 3. Obtain private precommit & 4. Extract authoritative drawNonce on backend
    const precommitSnap = await this.store.getDocDirect<TraditionalDrawPrecommitRecord>(
      this.privatePrecommitPath(params.commitmentHash)
    );
    if (!precommitSnap.exists) {
      throw new TraditionalRaffleError(
        404,
        'HTTP_404_PRECOMMIT_NOT_FOUND',
        'Pré-compromisso criptográfico não encontrado.'
      );
    }
    const precommitPreliminary = precommitSnap.data()!;
    if (precommitPreliminary.ownerUid !== ownerUid || precommitPreliminary.raffleId !== raffleId) {
      throw new TraditionalRaffleError(
        403,
        'HTTP_403_FORBIDDEN_PRECOMMIT_OWNERSHIP',
        'O pré-compromisso informado não pertence a este organizador ou rifa.'
      );
    }

    if (
      params.clientSuppliedDrawNonce !== undefined &&
      params.clientSuppliedDrawNonce !== precommitPreliminary.drawNonce
    ) {
      throw new TraditionalRaffleError(
        409,
        'HTTP_409_INVALID_DRAW_NONCE',
        'O drawNonce informado diverge do pré-compromisso oficial no servidor.'
      );
    }

    const authoritativeDrawNonce = precommitPreliminary.drawNonce;

    // 5. Calculate the 12-field normative requestFingerprint
    const { fingerprintHash: requestFingerprint } = computeRequestFingerprint({
      ownerUid,
      raffleId,
      drawId: params.drawId,
      idempotencyKey: params.idempotencyKey,
      drawNonce: authoritativeDrawNonce,
      clientEntropy: params.clientEntropy,
      expectedRosterVersion: params.expectedRosterVersion,
      expectedDrawSequence: params.expectedDrawSequence,
      drawMode,
      winnerCount,
      prizeId,
    });

    // 6. Acquire idempotency lock (or automatically recover if abandoned > 60s per R-06)
    let activeLockAcquisitionId = params.lockAcquisitionIdOverride;
    if (!activeLockAcquisitionId) {
      const candidateLockId = `lock_${crypto.randomBytes(12).toString('hex')}`;
      const acq = await this.acquireIdempotency({
        ownerUid,
        raffleId,
        idempotencyKey: params.idempotencyKey,
        drawId: params.drawId,
        commitmentHash: params.commitmentHash,
        requestFingerprint,
        fencingToken: params.fencingToken,
        lockAcquisitionId: candidateLockId,
        nowMs,
      });

      if (acq.mode === 'REPLAY') {
        return {
          statusCode: acq.responseStatus,
          body: acq.responseBody,
        };
      }
      activeLockAcquisitionId = acq.lockAcquisitionId;
    }

    // 7. Commit official draw in a single atomic transaction
    const committedBody = await this.commitOfficialDrawTransaction({
      ownerUid,
      raffleId,
      drawId: params.drawId,
      idempotencyKey: params.idempotencyKey,
      commitmentHash: params.commitmentHash,
      drawNonce: authoritativeDrawNonce,
      clientEntropy: params.clientEntropy.toLowerCase(),
      expectedRosterVersion: params.expectedRosterVersion,
      expectedDrawSequence: params.expectedDrawSequence,
      fencingToken: params.fencingToken,
      drawMode,
      winnerCount,
      prizeId: prizeId || 'NONE',
      prizeName: params.prizeName,
      requestFingerprint,
      expectedLockAcquisitionId: activeLockAcquisitionId,
      nowMs,
    });

    return {
      statusCode: 200,
      body: committedBody,
    };
  }

  private async commitOfficialDrawTransaction(params: {
    ownerUid: string;
    raffleId: string;
    drawId: string;
    idempotencyKey: string;
    commitmentHash: string;
    drawNonce: string;
    clientEntropy: string;
    expectedRosterVersion: number;
    expectedDrawSequence: number;
    fencingToken: number;
    drawMode: DrawMode;
    winnerCount: number;
    prizeId: string;
    prizeName?: string;
    requestFingerprint: string;
    expectedLockAcquisitionId: string;
    nowMs: number;
  }): Promise<Record<string, unknown>> {
    const {
      ownerUid,
      raffleId,
      drawId,
      idempotencyKey,
      commitmentHash,
      drawNonce,
      clientEntropy,
      expectedRosterVersion,
      expectedDrawSequence,
      fencingToken,
      drawMode,
      winnerCount,
      prizeId,
      requestFingerprint,
      expectedLockAcquisitionId,
      nowMs,
    } = params;

    const nowIso = new Date(nowMs).toISOString();

    const idemDocPath = this.idempotencyPath(ownerUid, raffleId, idempotencyKey);
    const permanentDrawDocPath = this.permanentDrawPath(ownerUid, raffleId, drawId);
    const raffleDocPath = this.rafflePath(ownerUid, raffleId);
    const precommitDocPath = this.privatePrecommitPath(commitmentHash);
    const ledgerHeadDocPath = this.ledgerHeadPath(commitmentHash);
    const precommitEventDocPath = this.ledgerEventPath(commitmentHash, 'PRECOMMIT');
    const revealedEventDocPath = this.ledgerEventPath(commitmentHash, 'REVEALED');
    const expiredEventDocPath = this.ledgerEventPath(commitmentHash, 'EXPIRED');

    return this.store.runTransaction(async (tx) => {
      // ======================================================================
      // PHASE A: ALL READS FIRST (STRICT FIRESTORE TRANSACTION RULE)
      // ======================================================================
      const [
        idemSnap,
        permDrawSnap,
        raffleSnap,
        precommitSnap,
        ledgerHeadSnap,
        precommitEventSnap,
        revealedEventSnap,
        expiredEventSnap,
      ] = await Promise.all([
        tx.get<TraditionalDrawIdempotencyRecord>(idemDocPath),
        tx.get<TraditionalPermanentDrawRecord>(permanentDrawDocPath),
        tx.get<AuthoritativeTraditionalRaffleDocument>(raffleDocPath),
        tx.get<TraditionalDrawPrecommitRecord>(precommitDocPath),
        tx.get<TraditionalDrawLedgerHead>(ledgerHeadDocPath),
        tx.get<TraditionalDrawLedgerEvent>(precommitEventDocPath),
        tx.get<TraditionalDrawLedgerEvent>(revealedEventDocPath),
        tx.get<TraditionalDrawLedgerEvent>(expiredEventDocPath),
      ]);

      // 1. Validate Idempotency & Lock Ownership
      if (!idemSnap.exists) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_IDEMPOTENCY_LOCK_MISSING',
          'Registro de lock de idempotência não encontrado.'
        );
      }
      const idemData = idemSnap.data()!;
      if (idemData.requestFingerprint !== requestFingerprint) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_IDEMPOTENCY_PAYLOAD_MISMATCH',
          'Fingerprint divergente no momento da confirmação transacional.'
        );
      }
      if (idemData.status === 'COMPLETED' && idemData.responseBody) {
        return deepClone(idemData.responseBody);
      }
      if (idemData.lockAcquisitionId !== expectedLockAcquisitionId) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_LOCK_OWNERSHIP_LOST',
          'Este worker perdeu a propriedade do lock (lockAcquisitionId inválido ou recuperado por outro worker).'
        );
      }

      // 2. Validate Permanent Draw Record Uniqueness (`users/{ownerUid}/raffles/{raffleId}/draws/{drawId}`)
      if (permDrawSnap.exists) {
        const existingDraw = permDrawSnap.data()!;
        if (
          existingDraw.idempotencyKey === idempotencyKey &&
          existingDraw.requestFingerprint === requestFingerprint
        ) {
          const healed = this.buildDrawResponseBody(existingDraw, true);
          tx.set(idemDocPath, {
            ...idemData,
            status: 'COMPLETED',
            completedAtMs: nowMs,
            completedAtIso: nowIso,
            responseStatus: 200,
            responseBody: healed,
          } satisfies TraditionalDrawIdempotencyRecord);
          return healed;
        }
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_DRAW_ID_ALREADY_CONSUMED',
          `O drawId '${drawId}' já possui um sorteio permanente registrado.`
        );
      }

      // 3. Validate Raffle Ownership & Governance Versions
      if (!raffleSnap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_RAFFLE_NOT_FOUND');
      }
      const raffle = raffleSnap.data()!;
      if (raffle.userId !== ownerUid) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_CROSS_TENANT');
      }

      // S-02: Validate FREE/PRO participant and winner limit inside transaction before writes
      await validateOrganizerPlanEntitlement(
        ownerUid,
        raffle.participants.length,
        winnerCount,
        nowMs
      );

      if (raffle.operationalState !== 'COMMITTED' || raffle.commitmentHash !== commitmentHash) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_RAFFLE_NOT_IN_COMMITTED_STATE',
          `Estado operacional da rifa (${raffle.operationalState}) ou commitmentHash não corresponde ao sorteio em execução.`
        );
      }
      if (raffle.fencingToken !== fencingToken) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_FENCING_TOKEN_MISMATCH',
          `Fencing token inválido: esperado ${raffle.fencingToken}, recebido ${fencingToken}.`
        );
      }
      if (raffle.rosterVersion !== expectedRosterVersion) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_ROSTER_VERSION_MISMATCH',
          `O roster de participantes/configurações foi modificado durante o sorteio (esperado v${expectedRosterVersion}, atual v${raffle.rosterVersion}).`
        );
      }
      if (raffle.drawSequence !== expectedDrawSequence) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_DRAW_SEQUENCE_MISMATCH',
          `A sequência de sorteio mudou (esperada ${expectedDrawSequence}, atual ${raffle.drawSequence}).`
        );
      }

      // 4. Validate Private Precommit & Expiration
      if (!precommitSnap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_PRECOMMIT_NOT_FOUND');
      }
      const precommit = precommitSnap.data()!;
      if (precommit.ownerUid !== ownerUid || precommit.raffleId !== raffleId) {
        throw new TraditionalRaffleError(403, 'HTTP_403_FORBIDDEN_PRECOMMIT_OWNERSHIP');
      }
      if (precommit.status !== 'COMMITTED') {
        throw new TraditionalRaffleError(
          409,
          `HTTP_409_PRECOMMIT_ALREADY_${precommit.status}`,
          `O pré-compromisso não está mais ativo (status=${precommit.status}).`
        );
      }
      if (nowMs > precommit.expiresAtMs) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_PRECOMMIT_EXPIRED',
          'O pré-compromisso criptográfico expirou antes da confirmação do sorteio.'
        );
      }
      if (precommit.drawNonce !== drawNonce) {
        throw new TraditionalRaffleError(409, 'HTTP_409_INVALID_DRAW_NONCE');
      }
      if (precommit.fencingToken !== fencingToken) {
        throw new TraditionalRaffleError(409, 'HTTP_409_FENCING_TOKEN_MISMATCH');
      }

      // Verify C_server == SHA256(utf8(S_server || ":" || Salt))
      const verifiedCommitment = computeServerCommitment(precommit.serverSeed, precommit.salt);
      if (verifiedCommitment !== commitmentHash) {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_SERVER_COMMITMENT_INTEGRITY_FAILURE',
          'C_server recalculado não confere com commitmentHash.'
        );
      }

      // 5. Validate Public Ledger Chain Integrity (`PRECOMMIT` must be intact and terminal)
      const ledgerCheck = verifyLedgerChainIntegrity({
        precommitEvent: precommitEventSnap.data(),
        revealedEvent: revealedEventSnap.data(),
        expiredEvent: expiredEventSnap.data(),
        ledgerHead: ledgerHeadSnap.data(),
      });
      if (ledgerCheck.terminalType !== 'PRECOMMIT') {
        throw new TraditionalRaffleError(
          409,
          'HTTP_409_LEDGER_ALREADY_TERMINATED',
          `O ledger público já possui evento terminal ${ledgerCheck.terminalType}.`
        );
      }

      // 6. Compute Authoritative Roster & Normative Rejection Sampling Winner
      const rawEligibleTickets = this.computeAuthoritativeEligibleTickets(raffle);
      if (rawEligibleTickets.length === 0) {
        throw new TraditionalRaffleError(
          400,
          'HTTP_400_NO_ELIGIBLE_TICKETS',
          'Nenhum bilhete elegível disponível para o sorteio.'
        );
      }

      const { rosterSha256Hash, sortedTickets } = computeRosterSha256(rawEligibleTickets);
      const totalEligibleTickets = sortedTickets.length;

      const sampling = computeRejectionSamplingDraw({
        serverSeed: precommit.serverSeed,
        rosterSha256Hash,
        clientEntropy,
        drawNonce,
        drawId,
        fencingToken,
        rosterVersion: raffle.rosterVersion,
        drawSequence: raffle.drawSequence,
        totalTickets: totalEligibleTickets,
      });

      const winningTicket = sortedTickets[sampling.winningIndex];
      if (!winningTicket) {
        throw new TraditionalRaffleError(500, 'WINNING_TICKET_INDEX_OUT_OF_BOUNDS');
      }

      // Build REVEALED ledger event (sequenceNumber = 1, previousEventHash = H0)
      const precommitEvent = ledgerCheck.terminalEvent;
      const revealedSequenceNumber = precommitEvent.sequenceNumber + 1;
      const revealedEvent = buildLedgerEvent({
        commitmentHash,
        sequenceNumber: revealedSequenceNumber,
        previousEventHash: precommitEvent.eventHash,
        eventType: 'REVEALED',
        timestampIso: nowIso,
        payload: {
          blockIndex: sampling.blockIndex,
          clientEntropy,
          commitmentHash,
          drawId,
          drawNonce,
          drawSequence: raffle.drawSequence,
          fencingToken,
          limitN: sampling.limitN,
          ownerUid,
          protocolVersion: 'GIO_PF_V2',
          raffleId,
          rosterSha256Hash,
          rosterVersion: raffle.rosterVersion,
          salt: precommit.salt,
          serverSeed: precommit.serverSeed,
          totalEligibleTickets,
          uint32Value: sampling.uint32Value,
          winnerName: winningTicket.name,
          winnerParticipantId: winningTicket.participantId,
          winningIndex: sampling.winningIndex,
          winningNumber: winningTicket.number,
          wordOffset: sampling.wordOffset,
        },
      });

      const proof: TraditionalDrawProofV2 = {
        protocolVersion: 'GIO_PF_V2',
        commitmentHash,
        serverSeed: precommit.serverSeed,
        salt: precommit.salt,
        clientEntropy,
        drawNonce,
        drawId,
        fencingToken,
        rosterVersion: raffle.rosterVersion,
        drawSequence: raffle.drawSequence,
        rosterSha256Hash,
        winningIndex: sampling.winningIndex,
        winningNumber: winningTicket.number,
        winnerParticipantId: winningTicket.participantId,
        winnerName: winningTicket.name,
        blockIndex: sampling.blockIndex,
        wordOffset: sampling.wordOffset,
        uint32Value: sampling.uint32Value,
        limitN: sampling.limitN,
        totalEligibleTickets,
        eventHash: revealedEvent.eventHash,
        previousEventHash: precommitEvent.eventHash,
        sequenceNumber: revealedSequenceNumber,
        drawnAtIso: nowIso,
      };

      const resolvedPrizeName =
        params.prizeName ||
        raffle.settings.currentPrize ||
        raffle.settings.prizeName ||
        `${(raffle.winners?.length || 0) + 1}º Prêmio`;

      const winnerRecord: Winner = {
        id: `win_${drawId}`,
        drawId,
        participantId: winningTicket.participantId,
        name: winningTicket.name,
        number: winningTicket.number,
        prize: resolvedPrizeName,
        drawnAt: nowMs,
        proof,
      };

      const nextPrizes = (raffle.settings.prizes || []).map((tier) => {
        if (
          (prizeId !== 'NONE' && tier.id === prizeId) ||
          (prizeId === 'NONE' && tier.name === resolvedPrizeName && !tier.winnerId)
        ) {
          return {
            ...tier,
            winnerId: winningTicket.participantId,
            winnerName: winningTicket.name,
            ticketNumber: winningTicket.number,
          };
        }
        return tier;
      });

      const nextWinners = [winnerRecord, ...(raffle.winners || [])];
      const nextUnclaimedTier = [...nextPrizes]
        .sort((a, b) => a.rank - b.rank)
        .find((p) => !p.winnerId);

      const nextRosterVersion = raffle.settings.exclude
        ? raffle.rosterVersion + 1
        : raffle.rosterVersion;
      const nextDrawSequence = raffle.drawSequence + 1;

      const updatedRaffle: AuthoritativeTraditionalRaffleDocument = {
        ...raffle,
        settings: {
          ...raffle.settings,
          prizes: nextPrizes,
          currentPrize: nextUnclaimedTier
            ? nextUnclaimedTier.name
            : `${nextWinners.length + 1}º Prêmio`,
        },
        winners: nextWinners,
        rosterVersion: nextRosterVersion,
        drawSequence: nextDrawSequence,
        drawStateVersion: raffle.drawStateVersion + 1,
        operationalState: 'REVEALED',
        lastDrawId: drawId,
        updatedAt: nowIso,
      };

      const updatedPrecommit: TraditionalDrawPrecommitRecord = {
        ...precommit,
        status: 'REVEALED',
        revealedAtIso: nowIso,
        drawId,
        winningTicket,
        winningIndex: sampling.winningIndex,
        rosterSha256Hash,
        proof,
      };

      const updatedLedgerHead: TraditionalDrawLedgerHead = {
        commitmentHash,
        raffleId,
        ownerUid,
        lastSequenceNumber: revealedSequenceNumber,
        lastEventHash: revealedEvent.eventHash,
        lastEventType: 'REVEALED',
        updatedAtIso: nowIso,
      };

      const permanentDrawRecord: TraditionalPermanentDrawRecord = {
        drawId,
        ownerUid,
        raffleId,
        idempotencyKey,
        requestFingerprint,
        commitmentHash,
        drawNonce,
        clientEntropy,
        fencingToken,
        rosterVersion: raffle.rosterVersion,
        drawSequence: raffle.drawSequence,
        drawMode,
        winnerCount,
        prizeId,
        prizeName: resolvedPrizeName,
        winningIndex: sampling.winningIndex,
        winningTicket,
        rosterSha256Hash,
        totalEligibleTickets,
        winnerRecord,
        proof,
        drawnAtMs: nowMs,
        drawnAtIso: nowIso,
      };

      const responseBody = this.buildDrawResponseBody(
        permanentDrawRecord,
        false,
        nextRosterVersion,
        nextDrawSequence
      );

      const completedIdemRecord: TraditionalDrawIdempotencyRecord = {
        ...idemData,
        status: 'COMPLETED',
        completedAtMs: nowMs,
        completedAtIso: nowIso,
        responseStatus: 200,
        responseBody,
      };

      // ======================================================================
      // PHASE B: ALL WRITES ATOMICALLY
      // ======================================================================
      tx.set(permanentDrawDocPath, permanentDrawRecord);
      tx.set(revealedEventDocPath, revealedEvent);
      tx.set(ledgerHeadDocPath, updatedLedgerHead);
      tx.set(precommitDocPath, updatedPrecommit);
      tx.set(raffleDocPath, updatedRaffle);
      tx.set(idemDocPath, completedIdemRecord);

      return responseBody;
    });
  }

  private buildDrawResponseBody(
    permDraw: TraditionalPermanentDrawRecord,
    idempotentReplay: boolean,
    nextRosterVersion?: number,
    nextDrawSequence?: number
  ): Record<string, unknown> {
    return {
      ok: true,
      idempotentReplay,
      drawId: permDraw.drawId,
      raffleId: permDraw.raffleId,
      ownerUid: permDraw.ownerUid,
      winningIndex: permDraw.winningIndex,
      winningTicket: permDraw.winningTicket,
      winner: permDraw.winnerRecord,
      proof: permDraw.proof,
      governance: {
        rosterVersionUsed: permDraw.rosterVersion,
        drawSequenceUsed: permDraw.drawSequence,
        fencingTokenUsed: permDraw.fencingToken,
        nextRosterVersion: nextRosterVersion ?? permDraw.rosterVersion,
        nextDrawSequence: nextDrawSequence ?? permDraw.drawSequence + 1,
      },
    };
  }

  // ==========================================================================
  // R-07: SWEEPER & RECONCILIATION (`sweepExpiredPrecommit`) WITH OWNERSHIP
  // ==========================================================================

  /**
   * Normative Sweeper (Phase 1.6.6 / 1.6.7 / 1.6.8 / R-07):
   * - Enforces ownership (`precommit.ownerUid === authenticatedUid` and `raffle.userId === authenticatedUid`)
   *   unless invoked by an explicitly authorized internal server job (`isInternalAuthorizedJob: true`).
   * - Reads all 6 documents (`precommit`, `raffle`, `PRECOMMIT`, `REVEALED`, `EXPIRED`, `ledgerHead`).
   * - Validates full public ledger chain integrity FIRST (fail-closed if tampered/corrupted).
   * - Never creates `EXPIRED` if `REVEALED` exists.
   * - Reconciles private precommit and raffle operational state if out-of-sync with valid public ledger.
   * - Only updates `raffle` if `raffle.commitmentHash === commitmentHash` (never clobbers a newer commitment).
   */
  public async sweepExpiredPrecommit(params: {
    authenticatedUid?: string;
    isInternalAuthorizedJob?: boolean;
    commitmentHash: string;
    nowMs?: number;
  }): Promise<{
    action:
      | 'RECONCILED_TO_REVEALED'
      | 'RECONCILED_TO_EXPIRED'
      | 'MARKED_EXPIRED'
      | 'NO_OP_STILL_ACTIVE'
      | 'NO_OP_ALREADY_SYNCED';
    commitmentHash: string;
    terminalEventType: 'PRECOMMIT' | 'REVEALED' | 'EXPIRED';
  }> {
    const { commitmentHash, isInternalAuthorizedJob = false } = params;
    const callerUid = isInternalAuthorizedJob
      ? null
      : this.assertAuthenticatedOwner(params.authenticatedUid);

    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const precommitDocPath = this.privatePrecommitPath(commitmentHash);
    const ledgerHeadDocPath = this.ledgerHeadPath(commitmentHash);
    const precommitEventDocPath = this.ledgerEventPath(commitmentHash, 'PRECOMMIT');
    const revealedEventDocPath = this.ledgerEventPath(commitmentHash, 'REVEALED');
    const expiredEventDocPath = this.ledgerEventPath(commitmentHash, 'EXPIRED');

    return this.store.runTransaction(async (tx) => {
      const [
        precommitSnap,
        ledgerHeadSnap,
        precommitEventSnap,
        revealedEventSnap,
        expiredEventSnap,
      ] = await Promise.all([
        tx.get<TraditionalDrawPrecommitRecord>(precommitDocPath),
        tx.get<TraditionalDrawLedgerHead>(ledgerHeadDocPath),
        tx.get<TraditionalDrawLedgerEvent>(precommitEventDocPath),
        tx.get<TraditionalDrawLedgerEvent>(revealedEventDocPath),
        tx.get<TraditionalDrawLedgerEvent>(expiredEventDocPath),
      ]);

      if (!precommitSnap.exists) {
        throw new TraditionalRaffleError(404, 'HTTP_404_PRECOMMIT_NOT_FOUND');
      }
      const precommit = precommitSnap.data()!;

      // R-07: Enforce strict ownership of the precommit and raffle
      if (!isInternalAuthorizedJob && callerUid !== precommit.ownerUid) {
        throw new TraditionalRaffleError(
          403,
          'HTTP_403_FORBIDDEN_CROSS_TENANT',
          'Acesso negado: apenas o organizador proprietário da rifa pode reconciliar ou expirar este pré-compromisso.'
        );
      }

      const raffleDocPath = this.rafflePath(precommit.ownerUid, precommit.raffleId);
      const raffleSnap = await tx.get<AuthoritativeTraditionalRaffleDocument>(raffleDocPath);

      if (raffleSnap.exists && !isInternalAuthorizedJob && raffleSnap.data()!.userId !== callerUid) {
        throw new TraditionalRaffleError(
          403,
          'HTTP_403_FORBIDDEN_CROSS_TENANT',
          'Acesso negado: o documento da rifa pertence a outro proprietário.'
        );
      }

      // CRITICAL: Validate complete public ledger chain BEFORE any reconciliation or state mutation.
      const chainValidation = verifyLedgerChainIntegrity({
        precommitEvent: precommitEventSnap.data(),
        revealedEvent: revealedEventSnap.data(),
        expiredEvent: expiredEventSnap.data(),
        ledgerHead: ledgerHeadSnap.data(),
      });

      const raffle = raffleSnap.exists ? raffleSnap.data()! : undefined;
      const isCurrentRaffleCommitment = Boolean(
        raffle &&
          raffle.commitmentHash === commitmentHash &&
          raffle.fencingToken === precommit.fencingToken
      );

      // Case 1: Public ledger already has a valid REVEALED event -> Never expire! Reconcile if needed.
      if (chainValidation.terminalType === 'REVEALED') {
        let mutated = false;
        if (precommit.status !== 'REVEALED') {
          tx.set(precommitDocPath, {
            ...precommit,
            status: 'REVEALED',
            revealedAtIso: chainValidation.terminalEvent.timestampIso,
          } satisfies TraditionalDrawPrecommitRecord);
          mutated = true;
        }
        if (isCurrentRaffleCommitment && raffle && raffle.operationalState !== 'REVEALED') {
          tx.set(raffleDocPath, {
            ...raffle,
            operationalState: 'REVEALED',
            drawStateVersion: raffle.drawStateVersion + 1,
            updatedAt: nowIso,
          } satisfies AuthoritativeTraditionalRaffleDocument);
          mutated = true;
        }
        return {
          action: mutated ? 'RECONCILED_TO_REVEALED' : 'NO_OP_ALREADY_SYNCED',
          commitmentHash,
          terminalEventType: 'REVEALED',
        };
      }

      // Case 2: Public ledger already has a valid EXPIRED event -> Reconcile private/raffle if needed.
      if (chainValidation.terminalType === 'EXPIRED') {
        let mutated = false;
        if (precommit.status !== 'EXPIRED') {
          tx.set(precommitDocPath, {
            ...precommit,
            status: 'EXPIRED',
            expiredAtIso: chainValidation.terminalEvent.timestampIso,
          } satisfies TraditionalDrawPrecommitRecord);
          mutated = true;
        }
        if (isCurrentRaffleCommitment && raffle && raffle.operationalState !== 'EXPIRED') {
          tx.set(raffleDocPath, {
            ...raffle,
            operationalState: 'EXPIRED',
            drawStateVersion: raffle.drawStateVersion + 1,
            updatedAt: nowIso,
          } satisfies AuthoritativeTraditionalRaffleDocument);
          mutated = true;
        }
        return {
          action: mutated ? 'RECONCILED_TO_EXPIRED' : 'NO_OP_ALREADY_SYNCED',
          commitmentHash,
          terminalEventType: 'EXPIRED',
        };
      }

      // Case 3: Public ledger is at PRECOMMIT. Check if TTL has expired.
      if (nowMs <= precommit.expiresAtMs) {
        return {
          action: 'NO_OP_STILL_ACTIVE',
          commitmentHash,
          terminalEventType: 'PRECOMMIT',
        };
      }

      // TTL has expired and no REVEALED event exists -> Append EXPIRED event to ledger and mark expired
      const precommitEvent = chainValidation.terminalEvent;
      const expiredSequence = precommitEvent.sequenceNumber + 1;
      const expiredEvent = buildLedgerEvent({
        commitmentHash,
        sequenceNumber: expiredSequence,
        previousEventHash: precommitEvent.eventHash,
        eventType: 'EXPIRED',
        timestampIso: nowIso,
        payload: {
          commitmentHash,
          drawNonce: precommit.drawNonce,
          expiredAtIso: nowIso,
          expiresAtIso: precommit.expiresAtIso,
          fencingToken: precommit.fencingToken,
          ownerUid: precommit.ownerUid,
          protocolVersion: 'GIO_PF_V2',
          raffleId: precommit.raffleId,
          reason: 'PRECOMMIT_TTL_EXPIRED',
        },
      });

      const updatedLedgerHead: TraditionalDrawLedgerHead = {
        commitmentHash,
        raffleId: precommit.raffleId,
        ownerUid: precommit.ownerUid,
        lastSequenceNumber: expiredSequence,
        lastEventHash: expiredEvent.eventHash,
        lastEventType: 'EXPIRED',
        updatedAtIso: nowIso,
      };

      const updatedPrecommit: TraditionalDrawPrecommitRecord = {
        ...precommit,
        status: 'EXPIRED',
        expiredAtIso: nowIso,
      };

      tx.set(expiredEventDocPath, expiredEvent);
      tx.set(ledgerHeadDocPath, updatedLedgerHead);
      tx.set(precommitDocPath, updatedPrecommit);

      if (isCurrentRaffleCommitment && raffle) {
        tx.set(raffleDocPath, {
          ...raffle,
          operationalState: 'EXPIRED',
          drawStateVersion: raffle.drawStateVersion + 1,
          updatedAt: nowIso,
        } satisfies AuthoritativeTraditionalRaffleDocument);
      }

      return {
        action: 'MARKED_EXPIRED',
        commitmentHash,
        terminalEventType: 'EXPIRED',
      };
    });
  }

  /**
   * Public ledger inspection & cryptographic chain verification for any commitmentHash.
   */
  public async getVerifiedLedgerBundle(commitmentHash: string): Promise<{
    valid: boolean;
    terminalType: 'PRECOMMIT' | 'REVEALED' | 'EXPIRED';
    ledgerHead: TraditionalDrawLedgerHead;
    events: TraditionalDrawLedgerEvent[];
  }> {
    const [headSnap, preSnap, revSnap, expSnap] = await Promise.all([
      this.store.getDocDirect<TraditionalDrawLedgerHead>(this.ledgerHeadPath(commitmentHash)),
      this.store.getDocDirect<TraditionalDrawLedgerEvent>(
        this.ledgerEventPath(commitmentHash, 'PRECOMMIT')
      ),
      this.store.getDocDirect<TraditionalDrawLedgerEvent>(
        this.ledgerEventPath(commitmentHash, 'REVEALED')
      ),
      this.store.getDocDirect<TraditionalDrawLedgerEvent>(
        this.ledgerEventPath(commitmentHash, 'EXPIRED')
      ),
    ]);

    if (!headSnap.exists || !preSnap.exists) {
      throw new TraditionalRaffleError(404, 'HTTP_404_LEDGER_NOT_FOUND');
    }

    const check = verifyLedgerChainIntegrity({
      precommitEvent: preSnap.data(),
      revealedEvent: revSnap.data(),
      expiredEvent: expSnap.data(),
      ledgerHead: headSnap.data(),
    });

    const events: TraditionalDrawLedgerEvent[] = [preSnap.data()!];
    if (revSnap.exists) events.push(revSnap.data()!);
    if (expSnap.exists) events.push(expSnap.data()!);

    return {
      valid: true,
      terminalType: check.terminalType,
      ledgerHead: headSnap.data()!,
      events,
    };
  }
}

export const traditionalRaffleService = new TraditionalRaffleService();
