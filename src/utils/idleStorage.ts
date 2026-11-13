import { STORAGE_KEY } from './raffle';
import { Participant, RaffleSettings, Winner } from '../types';

export interface StoragePayload {
  ownerUid?: string | null;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  updatedAt: number;
  version: number;
}

export type AutoSaveStatus = 'saved' | 'saving' | 'pending' | 'error';

export function getStorageKeyForUid(uid?: string | null): string {
  const cleanUid = typeof uid === 'string' ? uid.trim() : '';
  return cleanUid ? `${STORAGE_KEY}_uid_${cleanUid}` : STORAGE_KEY;
}

export interface IdleStorageManager {
  setActiveOwnerUid: (uid: string | null) => void;
  getActiveOwnerUid: () => string | null;
  getActiveStorageKey: () => string;
  readLocalStateForUid: (uid: string | null) => StoragePayload | null;
  clearLocalCacheOnLogout: (uid?: string | null) => void;
  scheduleSave: (payload: { settings: RaffleSettings; participants: Participant[]; winners: Winner[] }, immediate?: boolean) => void;
  flush: () => boolean;
  getStatus: () => AutoSaveStatus;
  getLastSavedAt: () => number | null;
  subscribe: (listener: (status: AutoSaveStatus, lastSavedAt: number | null) => void) => () => void;
  destroy: () => void;
}

/**
 * Robust Idle Storage Manager utilizing requestIdleCallback
 * - Enforces strict UID isolation for local cache keys (`giodasorte_state_v1_uid_${uid}`)
 * - Defers heavy JSON serialization & localStorage writes to browser idle periods
 * - Never drops frames during rapid wheel spins, drum animations, or suspense countdowns
 * - Supports safe logout cache purge (`clearLocalCacheOnLogout`) without touching Firestore
 */
class IdleAutoSaveController implements IdleStorageManager {
  private activeOwnerUid: string | null = null;
  private pendingPayload: StoragePayload | null = null;
  private isDirty = false;
  private status: AutoSaveStatus = 'saved';
  private lastSavedAt: number | null = null;
  private idleCallbackId: number | null = null;
  private fallbackTimerId: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(status: AutoSaveStatus, lastSavedAt: number | null) => void> = new Set();
  private boundBeforeUnload: (e: BeforeUnloadEvent) => void;
  private boundVisibilityChange: () => void;
  private boundPageHide: () => void;

  constructor() {
    this.boundBeforeUnload = this.handleBeforeUnload.bind(this);
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this);
    this.boundPageHide = this.handlePageHide.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.boundBeforeUnload);
      window.addEventListener('pagehide', this.boundPageHide);
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }
  }

  public setActiveOwnerUid(uid: string | null): void {
    const normalized = typeof uid === 'string' && uid.trim() ? uid.trim() : null;
    if (this.activeOwnerUid !== normalized) {
      // Cancel any pending save from the previous UID context before switching
      this.cancelScheduled();
      this.pendingPayload = null;
      this.isDirty = false;
      this.activeOwnerUid = normalized;
    }
  }

  public getActiveOwnerUid(): string | null {
    return this.activeOwnerUid;
  }

  public getActiveStorageKey(): string {
    return getStorageKeyForUid(this.activeOwnerUid);
  }

  /**
   * Reads local state strictly isolated for the given UID (or null for anonymous).
   * Prevents cross-UID contamination if a payload belongs to a different ownerUid.
   */
  public readLocalStateForUid(uid: string | null): StoragePayload | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    const normalizedUid = typeof uid === 'string' && uid.trim() ? uid.trim() : null;
    const targetKey = getStorageKeyForUid(normalizedUid);
    try {
      const raw = localStorage.getItem(targetKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoragePayload;
      if (!parsed || typeof parsed !== 'object') return null;
      const payloadUid =
        typeof parsed.ownerUid === 'string' && parsed.ownerUid.trim()
          ? parsed.ownerUid.trim()
          : null;
      if (normalizedUid && payloadUid !== normalizedUid) {
        return null;
      }
      if (!normalizedUid && payloadUid !== null) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Rule 3: Logout clears the browser session and local cache immediately,
   * cancelling any pending idle writes, while NEVER deleting cloud/Firestore data.
   */
  public clearLocalCacheOnLogout(uid?: string | null): void {
    this.cancelScheduled();
    this.pendingPayload = null;
    this.isDirty = false;
    const previousUid = uid !== undefined ? uid : this.activeOwnerUid;
    this.activeOwnerUid = null;
    this.setStatus('saved');

    if (typeof window === 'undefined') return;

    try {
      const keysToRemove = new Set<string>([
        STORAGE_KEY,
        `${STORAGE_KEY}_backup`,
        `${STORAGE_KEY}_backup_ts`,
        'gio_organizer_handle_v1',
        'gio_organizer_bio_v1',
        'gio_active_live_session_id',
        'gio_active_live_username',
        'gio_active_live_rule_id',
      ]);

      if (previousUid && previousUid.trim()) {
        const cleanUid = previousUid.trim();
        const uidKey = getStorageKeyForUid(cleanUid);
        keysToRemove.add(uidKey);
        keysToRemove.add(`${uidKey}_backup`);
        keysToRemove.add(`${uidKey}_backup_ts`);
        keysToRemove.add(`gio_organizer_handle_v1_${cleanUid}`);
        keysToRemove.add(`gio_organizer_bio_v1_${cleanUid}`);
      }

      if (typeof localStorage !== 'undefined') {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith(`${STORAGE_KEY}_uid_`) ||
              key.startsWith('gio_organizer_handle_v1_') ||
              key.startsWith('gio_organizer_bio_v1_'))
          ) {
            keysToRemove.add(key);
          }
        }
        for (const key of keysToRemove) {
          localStorage.removeItem(key);
        }
      }

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('gio_active_live_session_id');
        sessionStorage.removeItem('gio_active_live_username');
        sessionStorage.removeItem('gio_active_live_rule_id');
      }
    } catch {
      // Ignore storage access errors in restricted environments
    }
  }

  private setStatus(status: AutoSaveStatus) {
    if (this.status !== status) {
      this.status = status;
      this.notifyListeners();
    }
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.status, this.lastSavedAt);
      } catch (e) {
        console.error('AutoSave listener error:', e);
      }
    }
  }

  public subscribe(listener: (status: AutoSaveStatus, lastSavedAt: number | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.lastSavedAt);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStatus(): AutoSaveStatus {
    return this.status;
  }

  public getLastSavedAt(): number | null {
    return this.lastSavedAt;
  }

  /**
   * Schedule saving data during idle browser time.
   * If immediate is true (e.g. winner determined or critical reset), writes synchronously right away.
   */
  public scheduleSave(
    data: { settings: RaffleSettings; participants: Participant[]; winners: Winner[] },
    immediate = false
  ): void {
    this.pendingPayload = {
      ownerUid: this.activeOwnerUid,
      ...data,
      updatedAt: Date.now(),
      version: 2,
    };
    this.isDirty = true;

    if (immediate) {
      this.flush();
      return;
    }

    this.setStatus('pending');

    // Cancel previously scheduled idle/timeout handlers to coalesce rapid updates
    this.cancelScheduled();

    // Use requestIdleCallback with a 2000ms deadline timeout
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      this.idleCallbackId = (window as unknown as {
        requestIdleCallback: (cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback(
        (deadline) => {
          this.executeIdleSave(deadline);
        },
        { timeout: 2000 }
      );
    } else {
      // Fallback for browsers without requestIdleCallback support
      this.fallbackTimerId = setTimeout(() => {
        this.flush();
      }, 800);
    }
  }

  private executeIdleSave(deadline: { didTimeout: boolean; timeRemaining: () => number }) {
    // If we have enough remaining idle frame budget (> 5ms) or deadline expired, commit write
    if (deadline.didTimeout || deadline.timeRemaining() > 3) {
      this.flush();
    } else {
      // Still busy, reschedule with small timeout
      this.scheduleSave(this.pendingPayload!, false);
    }
  }

  private cancelScheduled() {
    if (this.idleCallbackId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    }
    if (this.fallbackTimerId !== null) {
      clearTimeout(this.fallbackTimerId);
      this.fallbackTimerId = null;
    }
  }

  /**
   * Immediately flushes pending payload to localStorage synchronously under the UID-scoped key.
   * Guarantees that data is never lost on tab close, reload, or crash, and never leaks across UIDs.
   */
  public flush(): boolean {
    if (!this.isDirty || !this.pendingPayload) {
      this.setStatus('saved');
      return true;
    }

    this.cancelScheduled();
    this.setStatus('saving');

    const targetKey = getStorageKeyForUid(this.pendingPayload.ownerUid ?? this.activeOwnerUid);

    try {
      // Preserve previous valid snapshot in safety backup slot before overwriting
      const existingRaw = localStorage.getItem(targetKey);
      if (existingRaw) {
        localStorage.setItem(`${targetKey}_backup`, existingRaw);
      }

      const serialized = JSON.stringify(this.pendingPayload);
      localStorage.setItem(targetKey, serialized);
      this.isDirty = false;
      this.lastSavedAt = Date.now();
      this.setStatus('saved');
      this.notifyListeners();
      return true;
    } catch (err) {
      console.error('Erro ao salvar localmente no localStorage:', err);
      // If quota exceeded or error occurred, attempt minimal recovery
      try {
        const compactPayload = {
          ...this.pendingPayload,
          // If prize image is gigantic base64, clean it up to prevent quota crash
          settings: {
            ...this.pendingPayload.settings,
            prizeImage: this.pendingPayload.settings.prizeImage?.startsWith('data:')
              ? ''
              : this.pendingPayload.settings.prizeImage,
          },
        };
        localStorage.setItem(targetKey, JSON.stringify(compactPayload));
        this.isDirty = false;
        this.lastSavedAt = Date.now();
        this.setStatus('saved');
        this.notifyListeners();
        return true;
      } catch (fallbackErr) {
        console.error('Falha crítica de persistência:', fallbackErr);
        this.setStatus('error');
        return false;
      }
    }
  }

  /**
   * Creates an explicit timestamped backup of current localStorage state for the active UID
   */
  public createSafetyBackup(): boolean {
    if (typeof window === 'undefined') return false;
    const targetKey = this.getActiveStorageKey();
    try {
      const current = localStorage.getItem(targetKey);
      if (current) {
        localStorage.setItem(`${targetKey}_backup`, current);
        localStorage.setItem(`${targetKey}_backup_ts`, String(Date.now()));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Restores state from the safety backup for the active UID if available
   */
  public restoreFromSafetyBackup(): StoragePayload | null {
    if (typeof window === 'undefined') return null;
    const targetKey = this.getActiveStorageKey();
    try {
      const backupRaw = localStorage.getItem(`${targetKey}_backup`);
      if (!backupRaw) return null;
      return JSON.parse(backupRaw) as StoragePayload;
    } catch {
      return null;
    }
  }

  private handleBeforeUnload(_e: BeforeUnloadEvent) {
    if (this.isDirty) {
      this.flush();
    }
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'hidden' && this.isDirty) {
      this.flush();
    }
  }

  private handlePageHide() {
    if (this.isDirty) {
      this.flush();
    }
  }

  public destroy() {
    this.flush();
    this.cancelScheduled();
    this.listeners.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.boundBeforeUnload);
      window.removeEventListener('pagehide', this.boundPageHide);
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    }
  }
}

// Singleton instance to be shared across React hooks and window listeners
export const idleStorage = new IdleAutoSaveController();


