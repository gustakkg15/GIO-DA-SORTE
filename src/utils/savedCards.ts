import { VictoryCardCustomization } from './cardGenerator';

export interface SavedVictoryCard {
  id: string;
  savedAt: number;
  winnerName: string;
  ticketNumber: number | string;
  prize: string;
  drawnAt?: number | string;
  theme: 'sapphire' | 'gold' | 'emerald' | 'midnight';
  imageDataUrl: string; // Persistent Base64 image
  customization: VictoryCardCustomization;
  rosterHash?: string;
  organizerSignature?: string;
}

const STORAGE_KEY = 'gio_saved_victory_cards_v1';
const MAX_SAVED_CARDS = 35; // Prevents localStorage quota overflow while storing rich history

/**
 * Loads all saved victory card records from localStorage
 */
export function loadSavedVictoryCards(): SavedVictoryCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn('Erro ao carregar histórico de cards de vitória:', err);
    return [];
  }
}

/**
 * Persists a new victory card or updates an existing one
 */
export function saveVictoryCardRecord(card: SavedVictoryCard): boolean {
  try {
    const current = loadSavedVictoryCards();
    // Remove if already exists with same ID to avoid duplicates
    const filtered = current.filter((c) => c.id !== card.id);
    // Add to the beginning (most recent first)
    const updated = [card, ...filtered].slice(0, MAX_SAVED_CARDS);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return true;
    } catch (quotaError) {
      // If quota exceeded, trim older cards and retry
      console.warn('LocalStorage quota warning, trimming oldest cards...', quotaError);
      const reduced = [card, ...filtered.slice(0, 15)];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reduced));
      return true;
    }
  } catch (err) {
    console.error('Falha ao salvar card no histórico persistente:', err);
    return false;
  }
}

/**
 * Deletes a single card by its ID
 */
export function deleteSavedVictoryCard(id: string): SavedVictoryCard[] {
  try {
    const current = loadSavedVictoryCards();
    const updated = current.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Erro ao deletar card do histórico:', err);
    return loadSavedVictoryCards();
  }
}

/**
 * Deletes all saved victory cards
 */
export function clearAllSavedVictoryCards(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Erro ao limpar histórico de cards:', err);
  }
}

/**
 * Downloads a stored card's image directly as PNG
 */
export function downloadSavedCardImage(card: SavedVictoryCard): void {
  const a = document.createElement('a');
  a.href = card.imageDataUrl;
  const safeName = card.winnerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  a.download = `gio-da-sorte-card-${safeName}-bilhete-${card.ticketNumber}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Copies a stored card's image to clipboard
 */
export async function copySavedCardImageToClipboard(card: SavedVictoryCard): Promise<boolean> {
  try {
    const res = await fetch(card.imageDataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn('Falha ao copiar imagem persistida para clipboard:', err);
    return false;
  }
}
