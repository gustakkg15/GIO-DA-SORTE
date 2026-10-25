import { doc, getDoc, setDoc, collection, query, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PublicRaffle, RaffleSettings, Participant, Winner } from '../types';

const HISTORY_STORAGE_KEY = 'giodasorte_raffle_history_v1';
const MY_NAME_STORAGE_KEY = 'giodasorte_my_name_v1';

/**
 * Gets the saved participant name from local storage
 */
export function getSavedParticipantName(): string {
  try {
    return localStorage.getItem(MY_NAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Saves participant name to local storage
 */
export function saveParticipantName(name: string): void {
  try {
    localStorage.setItem(MY_NAME_STORAGE_KEY, name.trim());
  } catch {
    // Ignore storage errors
  }
}

/**
 * Gets list of previously consulted raffles from local storage
 */
export function getSavedRafflesHistory(): PublicRaffle[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Adds or updates a raffle in the local history
 */
export function saveRaffleToHistory(raffle: PublicRaffle): void {
  try {
    const history = getSavedRafflesHistory().filter((r) => r.code !== raffle.code);
    history.unshift(raffle);
    // Keep max 15 recent raffles
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 15)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Removes a raffle from local history
 */
export function removeRaffleFromHistory(code: string): void {
  try {
    const history = getSavedRafflesHistory().filter((r) => r.code !== code);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Publishes or updates a public raffle to Firestore
 */
export async function publishPublicRaffle(
  code: string,
  organizerName: string,
  title: string,
  settings: RaffleSettings,
  participants: Participant[],
  winners: Winner[],
  userId: string = 'organizer'
): Promise<{ success: boolean; code: string; error?: string }> {
  const cleanCode = code.toUpperCase().trim();
  try {
    const docRef = doc(db, 'public_raffles', cleanCode);
    const payload: PublicRaffle = {
      code: cleanCode,
      userId,
      title: title || 'Sorteio GIO DA SORTE',
      organizerName: organizerName || 'Sorteador Oficial',
      settings: { ...settings, raffleCode: cleanCode, organizerName, raffleTitle: title },
      participants,
      winners,
      updatedAt: new Date().toISOString(),
      isLive: true,
    };
    await setDoc(docRef, payload);
    saveRaffleToHistory(payload);
    return { success: true, code: cleanCode };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Failed to publish public raffle:', msg);
    return { success: false, code: cleanCode, error: msg };
  }
}

/**
 * Fetches a public raffle by its code from Firestore
 */
export async function fetchPublicRaffle(code: string): Promise<PublicRaffle | null> {
  const cleanCode = code.toUpperCase().trim();
  if (!cleanCode) return null;

  try {
    const docRef = doc(db, 'public_raffles', cleanCode);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as PublicRaffle;
      saveRaffleToHistory(data);
      return data;
    }
  } catch (error) {
    console.warn('Could not fetch from Firestore, checking local history:', error);
  }

  // Fallback: check local history if offline
  const history = getSavedRafflesHistory();
  const match = history.find((r) => r.code.toUpperCase() === cleanCode);
  return match || null;
}

/**
 * Searches public raffles by organizer name or title
 */
export async function searchPublicRaffles(term: string): Promise<PublicRaffle[]> {
  const normalized = term.toLowerCase().trim();
  const historyMatches = getSavedRafflesHistory().filter(
    (r) =>
      r.organizerName.toLowerCase().includes(normalized) ||
      r.title.toLowerCase().includes(normalized) ||
      r.code.toLowerCase().includes(normalized)
  );

  try {
    const colRef = collection(db, 'public_raffles');
    const q = query(colRef, limit(20));
    const snap = await getDocs(q);
    const firestoreResults: PublicRaffle[] = [];

    snap.forEach((d) => {
      const data = d.data() as PublicRaffle;
      if (
        !normalized ||
        data.organizerName?.toLowerCase().includes(normalized) ||
        data.title?.toLowerCase().includes(normalized) ||
        data.code?.toLowerCase().includes(normalized)
      ) {
        firestoreResults.push(data);
      }
    });

    // Merge and deduplicate by code
    const map = new Map<string, PublicRaffle>();
    for (const r of [...historyMatches, ...firestoreResults]) {
      map.set(r.code, r);
    }
    return Array.from(map.values());
  } catch (error) {
    console.warn('Firestore search error:', error);
    return historyMatches;
  }
}
