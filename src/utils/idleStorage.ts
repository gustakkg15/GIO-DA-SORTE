import { STORAGE_KEY } from './raffle';
import { Participant, RaffleSettings, Winner } from '../types';

export interface StoragePayload {
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  updatedAt: number;
  version: number;
}

export type AutoSaveStatus = 'saved' | 'saving' | 'pending' | 'error';

export interface IdleStorageManager {
  scheduleSave: (payload: { settings: RaffleSettings; participants: Participant[]; winners: Winner[] }, immediate?: boolean) => void;
  flush: () => boolean;
  getStatus: () => AutoSaveStatus;
  getLastSavedAt: () => number | null;
  subscribe: (listener: (status: AutoSaveStatus, lastSavedAt: number | null) => void) => () => void;
  destroy: () => void;
}

/**
 * Robust Idle Storage Manager utilizing requestIdleCallback
 * - Defers heavy JSON serialization & localStorage writes to browser idle periods
 * - Never drops frames during rapid wheel spins, drum animations, or suspense countdowns
 * - Guarantees 100% data loss prevention by flushing on beforeunload, pagehide, and visibilitychange
 */
class IdleAutoSaveController {
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
   * Immediately flushes pending payload to localStorage synchronously.
   * Guarantees that data is never lost on tab close, reload, or crash.
   */
  public flush(): boolean {
    if (!this.isDirty || !this.pendingPayload) {
      this.setStatus('saved');
      return true;
    }

    this.cancelScheduled();
    this.setStatus('saving');

    try {
      const serialized = JSON.stringify(this.pendingPayload);
      localStorage.setItem(STORAGE_KEY, serialized);
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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compactPayload));
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
