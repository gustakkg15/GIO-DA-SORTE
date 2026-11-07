import * as XLSX from 'xlsx';
import {
  Participant,
  RaffleSettings,
  ComputedRaffle,
  Winner,
  CanonicalTicketEntry,
  TraditionalDrawProofV2,
} from '../types';

export const STORAGE_KEY = 'sorteio-moedas-v2';

export const DEFAULT_SETTINGS: RaffleSettings = {
  rate: 100,
  total: 100,
  start: 1,
  order: 'asc',
  seed: 42,
  exclude: true,
  currentPrize: '1º Prêmio',
  spinDuration: 3000,
  countdownSeconds: 10,
  themeMode: 'default',
  drawMode: 'drum',
  raffleCode: 'GIO-7492',
  organizerName: 'Sorteador Oficial',
  raffleTitle: 'Sorteio Oficial GIO DA SORTE',
  prizeName: 'Prêmio Principal',
  prizeImage: '',
  prizes: [
    { id: 'pz1', name: '1º Lugar - Prêmio Principal', rank: 1 },
    { id: 'pz2', name: '2º Lugar - Prêmio Especial', rank: 2 },
    { id: 'pz3', name: '3º Lugar - Prêmio de Participação', rank: 3 },
  ],
};

export const INITIAL_SAMPLE_PARTICIPANTS: Participant[] = [
  { id: 'p1', name: 'Ana Beatriz', coins: 350, addedAt: Date.now() - 50000 },
  { id: 'p2', name: 'Carlos Eduardo', coins: 500, addedAt: Date.now() - 40000 },
  { id: 'p3', name: 'Mariana Silva', coins: 200, addedAt: Date.now() - 30000 },
  { id: 'p4', name: 'Lucas Gabriel', coins: 150, addedAt: Date.now() - 20000 },
  { id: 'p5', name: 'Juliana Costa', coins: 80, addedAt: Date.now() - 10000 },
];

/**
 * Deterministic PRNG for shuffling numbers if order === 'random'
 */
function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates the sequence of numbers available in the raffle pool
 */
export function generateSequence(settings: RaffleSettings): number[] {
  const { total, start, order, seed } = settings;
  const seq: number[] = [];
  for (let i = 0; i < total; i++) {
    seq.push(start + i);
  }

  if (order === 'desc') {
    seq.reverse();
  } else if (order === 'random') {
    const rnd = mulberry32(seed || 1);
    for (let i = seq.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const temp = seq[i];
      seq[i] = seq[j];
      seq[j] = temp;
    }
  }

  return seq;
}

/**
 * Computes all ticket allocations based on coins and rules
 */
export function computeRaffle(
  participants: Participant[],
  settings: RaffleSettings,
  winners: Winner[]
): ComputedRaffle {
  const seq = generateSequence(settings);
  let currentIndex = 0;
  const allTickets: { number: number; participantId: string; name: string }[] = [];

  // Excluded winners IDs map
  const wonIds = new Set(winners.map((w) => w.participantId));

  // First pass: calculate total wanted tickets to determine total distributed
  const preAllocations = participants.map((p) => {
    const wanted = Math.max(0, Math.floor(p.coins / settings.rate));
    const remainder = p.coins % settings.rate;
    const canReceive = Math.min(wanted, Math.max(0, seq.length - currentIndex));
    const assigned = seq.slice(currentIndex, currentIndex + canReceive);
    currentIndex += canReceive;

    assigned.forEach((num) => {
      allTickets.push({ number: num, participantId: p.id, name: p.name });
    });

    return {
      participant: p,
      wantedTickets: wanted,
      assignedTickets: canReceive,
      tickets: assigned.sort((a, b) => a - b),
      remainderCoins: remainder,
    };
  });

  const totalAssignedTickets = allTickets.length;

  // Filter eligible tickets for draw (taking exclude into account)
  const eligibleTickets = settings.exclude
    ? allTickets.filter((t) => !wonIds.has(t.participantId))
    : allTickets;

  const eligibleCount = eligibleTickets.length;

  // Second pass: compute probability
  const allocations = preAllocations.map((item) => {
    const isExcluded = settings.exclude && wonIds.has(item.participant.id);
    let winProbability = 0;
    if (!isExcluded && eligibleCount > 0) {
      winProbability = (item.assignedTickets / eligibleCount) * 100;
    }

    return {
      ...item,
      winProbability: Math.round(winProbability * 100) / 100,
    };
  });

  return {
    allocations,
    allTickets,
    usedCount: totalAssignedTickets,
    totalCapacity: settings.total,
    eligibleTickets,
  };
}

/**
 * Cryptographically secure integer selection in range [0, n - 1]
 */
export function secureRandomInt(n: number): number {
  if (n <= 1) return 0;
  const array = new Uint32Array(1);
  const limit = Math.floor(4294967296 / n) * n;
  let x: number;
  do {
    crypto.getRandomValues(array);
    x = array[0];
  } while (x >= limit);
  return x % n;
}

/**
 * Generates random unique ID
 */
export function generateUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Normalizes text for searching (lowercased, diacritics removed)
 */
export function normalizeSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Parses raw text or file content into names and coin counts
 * Supports formats: "Nome 200", "Nome, 200", "Nome;200", "Nome - 200", "Nome: 200", tabs,
 * JSON arrays, and plain list of names (assigning defaultCoins)
 */
export function parseRawTextList(text: string, defaultCoins: number = 100): { name: string; coins: number }[] {
  const results: { name: string; coins: number }[] = [];
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) return results;

  // 1. Check if input is valid JSON
  if ((clean.startsWith('[') && clean.endsWith(']')) || (clean.startsWith('{') && clean.endsWith('}'))) {
    try {
      const parsed = JSON.parse(clean);
      const arr = Array.isArray(parsed) ? parsed : parsed.participants || [];
      if (Array.isArray(arr) && arr.length > 0) {
        for (const item of arr) {
          if (typeof item === 'object' && item !== null) {
            const name = String(item.name || item.nome || item.user || item.player || '').trim();
            const coins = parseInt(String(item.coins ?? item.moedas ?? item.pontos ?? defaultCoins), 10);
            if (name && !isNaN(coins) && coins >= 0) {
              results.push({ name, coins });
            }
          } else if (typeof item === 'string' && item.trim()) {
            results.push({ name: item.trim(), coins: defaultCoins });
          }
        }
        if (results.length > 0) return results;
      }
    } catch {
      // Continue to line-by-line parsing if not JSON
    }
  }

  // 2. Line by line parsing
  const lines = clean.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    let rawLine = lines[i].replace(/^["']|["']$/g, '').trim();
    if (!rawLine) continue;

    // Remove leading numbering like "1. ", "1 - ", "#1 "
    rawLine = rawLine.replace(/^(?:#|\d+[\.\)\-\s])\s*/, '');

    // Pattern A: Name followed by separator and integer at the end (e.g. "Ana 200", "Carlos - 350 moedas")
    const matchWithCoins = rawLine.match(/^(.*?)[,\t;:|\-\s]+(\d+)(?:\s*(?:moedas?|coins?|pts?|pontos?))?\s*$/i);
    if (matchWithCoins && matchWithCoins[1].trim()) {
      const name = matchWithCoins[1].replace(/["']/g, '').trim();
      const coins = parseInt(matchWithCoins[2], 10);
      if (name && !isNaN(coins) && coins >= 0) {
        results.push({ name, coins });
        continue;
      }
    }

    // Pattern B: CSV / TSV with semicolon or comma
    const parts = rawLine.split(/[;\t|]/);
    if (parts.length >= 2) {
      const name = parts[0].replace(/["']/g, '').trim();
      const coins = parseInt(parts[1].replace(/["'\s]/g, ''), 10);
      if (name && !isNaN(coins) && coins >= 0) {
        results.push({ name, coins });
        continue;
      }
    }

    // Pattern Live Chat / Stream / WhatsApp (e.g. "[12:34] Usuario: !sorteio" or "10/10/2026, 14:00 - Usuario: mensagem")
    const chatMatch = rawLine.match(/^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?|\d{1,2}\/\d{1,2}\/\d{2,4}[^:]*?[-–])\s*([^:]+?):\s*(.*)$/);
    if (chatMatch) {
      let chatter = chatMatch[1].replace(/^@/, '').trim();
      const message = chatMatch[2].trim();
      const numInMsg = message.match(/(\d+)(?:\s*(?:moedas?|coins?|pts?|pontos?))?/i);
      const coins = numInMsg ? parseInt(numInMsg[1], 10) : defaultCoins;
      if (chatter && chatter.length >= 2) {
        results.push({ name: chatter, coins });
        continue;
      }
    }

    // Pattern C: Plain name line without coins (assigns defaultCoins)
    const plainName = rawLine.replace(/["']/g, '').trim();
    // Skip obvious table headers like "Nome" or "Participante"
    if (i === 0 && (plainName.toLowerCase() === 'nome' || plainName.toLowerCase() === 'name' || plainName.toLowerCase() === 'participante')) {
      continue;
    }
    if (plainName.length >= 2) {
      results.push({ name: plainName, coins: defaultCoins });
    }
  }

  return results;
}

/**
 * Generates sample JSON blob for download
 */
export function generateSampleJsonContent(): string {
  const sample = [
    { name: 'Ana Beatriz', coins: 350 },
    { name: 'Carlos Eduardo', coins: 500 },
    { name: 'Mariana Silva', coins: 200 },
    { name: 'Lucas Gabriel', coins: 150 },
    { name: 'Juliana Costa', coins: 400 },
  ];
  return JSON.stringify(sample, null, 2);
}

/**
 * Parses Excel file buffer (.xlsx, .xls) with smart column detection
 */
export function parseExcelBuffer(buffer: ArrayBuffer, defaultCoins: number = 100): { name: string; coins: number }[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = wb.Sheets[firstSheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!rows || rows.length === 0) return [];

  const results: { name: string; coins: number }[] = [];

  // Detect column indexes from header row
  let nameColIdx = 0;
  let coinsColIdx = 1;
  let hasHeader = false;

  const headerRow = rows[0];
  if (Array.isArray(headerRow)) {
    headerRow.forEach((cell, idx) => {
      const str = String(cell ?? '').toLowerCase().trim();
      if (['nome', 'name', 'participante', 'usuario', 'user', 'cliente', 'player', 'pessoa'].includes(str)) {
        nameColIdx = idx;
        hasHeader = true;
      }
      if (['moedas', 'moeda', 'coins', 'coin', 'pontos', 'saldo', 'valor', 'qtd', 'quantidade', 'tickets'].includes(str)) {
        coinsColIdx = idx;
        hasHeader = true;
      }
    });
  }

  const startRow = hasHeader ? 1 : 0;

  for (let idx = startRow; idx < rows.length; idx++) {
    const row = rows[idx];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rawName = row[nameColIdx];
    const nameVal = String(rawName ?? '').trim();
    if (!nameVal) continue;

    // Skip if header got repeated
    if (nameVal.toLowerCase() === 'nome' || nameVal.toLowerCase() === 'participante') continue;

    let coinsVal = defaultCoins;
    if (row.length > coinsColIdx && row[coinsColIdx] !== undefined && row[coinsColIdx] !== null && String(row[coinsColIdx]).trim() !== '') {
      const parsed = parseInt(String(row[coinsColIdx]).replace(/[^\d]/g, ''), 10);
      if (!isNaN(parsed) && parsed >= 0) {
        coinsVal = parsed;
      }
    }

    results.push({ name: nameVal, coins: coinsVal });
  }

  return results;
}

/**
 * Generates sample Excel template Blob for participants
 */
export function generateSampleExcelBlob(): Blob {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Nome', 'Moedas'],
    ['Ana Beatriz', 350],
    ['Carlos Eduardo', 500],
    ['Mariana Silva', 200],
    ['Lucas Gabriel', 150],
    ['Juliana Costa', 100],
    ['Pedro Henrique', 100],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Participantes');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Generates sample CSV template content
 */
export function generateSampleCsvContent(): string {
  return `Nome,Moedas\nAna Beatriz,350\nCarlos Eduardo,500\nMariana Silva,200\nLucas Gabriel,150\nJuliana Costa,100\nPedro Henrique,100\n`;
}

/**
 * Generates sample TXT template content
 */
export function generateSampleTxtContent(): string {
  return `# Modelo de Lista de Participantes - GIO DA SORTE\n# Você pode usar "Nome 100", "Nome, 100" ou apenas o nome de cada pessoa:\nAna Beatriz 350\nCarlos Eduardo 500\nMariana Silva 200\nLucas Gabriel 150\nJuliana Costa 100\nPedro Henrique 100\n`;
}

/**
 * Exports raffle data to CSV format
 */
export function exportToCsv(
  allocations: { participant: Participant; assignedTickets: number; tickets: number[]; winProbability: number }[],
  settings: RaffleSettings
): string {
  const header = ['ID', 'Nome', 'Moedas', 'Qtd_Bilhetes', 'Numeros_Bilhetes', 'Probabilidade_Vitoria_Pct'];
  const rows = allocations.map((a) => [
    `"${a.participant.id}"`,
    `"${a.participant.name.replace(/"/g, '""')}"`,
    a.participant.coins,
    a.assignedTickets,
    `"${a.tickets.join(', ')}"`,
    `${a.winProbability}%`,
  ]);

  const metaHeader = [
    `# GIO DA SORTE - Exportado em ${new Date().toLocaleString('pt-BR')}`,
    `# Taxa: ${settings.rate} moedas por bilhete | Total de bilhetes: ${settings.total}`,
    '',
  ];

  return metaHeader.join('\n') + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
}

/**
 * Formats date/time nicely
 */
export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

/**
 * Generates an easy-to-share 6-character raffle code, e.g. GIO-7492
 */
export function generateRaffleCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GIO-${rand}`;
}

/**
 * Byte-by-byte UTF-8 comparator (isomorphic across Node.js and browsers).
 */
export function compareUtf8Bytes(a: string, b: string): number {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  const minLen = Math.min(bufA.length, bufB.length);
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) {
      return bufA[i] - bufB[i];
    }
  }
  return bufA.length - bufB.length;
}

/**
 * Frozen Normative Specification (Phases 1.5.10 / 1.5.11 / 1.6.8):
 * Deterministically normalizes, validates, sorts, and serializes the eligible ticket roster.
 * Also returns the sorted array of canonical tickets so that `winningIndex` maps 1:1 to `sortedTickets[winningIndex]`.
 */
export function canonicalizeRosterStrictWithTickets(rawTickets: CanonicalTicketEntry[]): {
  canonicalString: string;
  sortedTickets: CanonicalTicketEntry[];
} {
  if (!Array.isArray(rawTickets) || rawTickets.length === 0) {
    throw new Error('EMPTY_ROSTER_NOT_ALLOWED');
  }

  const normalized: CanonicalTicketEntry[] = rawTickets.map((t, idx) => {
    if (!t || typeof t !== 'object') {
      throw new Error(`INVALID_TICKET_AT_INDEX_${idx}`);
    }
    if (typeof t.participantId !== 'string' || typeof t.name !== 'string') {
      throw new Error(`INVALID_TICKET_TYPES_AT_INDEX_${idx}`);
    }
    if (!Number.isSafeInteger(t.number) || t.number < 0) {
      throw new Error(`INVALID_TICKET_NUMBER_AT_INDEX_${idx}`);
    }

    const cleanId = t.participantId
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();
    const cleanName = t.name
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();

    if (!cleanId || !cleanName) {
      throw new Error(`EMPTY_TICKET_FIELD_AT_INDEX_${idx}`);
    }

    return {
      participantId: cleanId,
      number: t.number,
      name: cleanName,
    };
  });

  normalized.sort((a, b) => {
    if (a.number !== b.number) {
      return a.number - b.number;
    }
    return compareUtf8Bytes(a.participantId, b.participantId);
  });

  const canonicalString = normalized
    .map((t) => `${t.participantId}:${t.number}:${t.name}`)
    .join('\n');

  return {
    canonicalString,
    sortedTickets: normalized,
  };
}

/**
 * Frozen Normative Specification: returns the exact canonical roster string (`participantId:number:name` joined by `\n`).
 */
export function canonicalizeRosterStrict(rawTickets: CanonicalTicketEntry[]): string {
  return canonicalizeRosterStrictWithTickets(rawTickets).canonicalString;
}

/**
 * RFC 8785 (JCS) deterministic JSON canonicalization.
 */
export function canonicalizeJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalizeJSON(item === undefined ? null : item)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJSON(obj[k])}`);
  return '{' + entries.join(',') + '}';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('INVALID_HEX_STRING');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Isomorphic (WebCrypto / Node 22) client & third-party auditor verification of a `TraditionalDrawProofV2`.
 * Verifies:
 * 1. `C_server = SHA256(utf8(S_server || ":" || Salt))`
 * 2. Optional `H_roster = SHA256(utf8(canonicalizeRosterStrict(rawTickets)))`
 * 3. `M_base = "GIO_PF_V2:" || H_roster || ":" || E_client || ":" || drawNonce || ":" || drawId || ":" || fencingToken || ":" || rosterVersion || ":" || drawSequence`
 * 4. `HMAC-SHA256(Buffer.from(S_server, "hex"), utf8(M_base || ":" || i))` with 8 uint32BE words and Rejection Sampling (`Limit_N = floor(2^32 / N) * N`).
 */
export async function verifyTraditionalDrawProofWeb(
  proof: TraditionalDrawProofV2,
  rawTickets?: CanonicalTicketEntry[]
): Promise<{
  valid: boolean;
  reason?: string;
  computedCommitmentHash?: string;
  computedRosterHash?: string;
  computedWinningIndex?: number;
}> {
  try {
    const encoder = new TextEncoder();
    const commitmentInput = encoder.encode(`${proof.serverSeed}:${proof.salt}`);
    const commitmentDigest = await crypto.subtle.digest('SHA-256', commitmentInput);
    const computedCommitmentHash = bytesToHex(new Uint8Array(commitmentDigest));

    if (computedCommitmentHash !== proof.commitmentHash) {
      return {
        valid: false,
        reason: 'COMMITMENT_HASH_MISMATCH',
        computedCommitmentHash,
      };
    }

    let sortedTickets: CanonicalTicketEntry[] | undefined;
    if (rawTickets && rawTickets.length > 0) {
      const canonical = canonicalizeRosterStrictWithTickets(rawTickets);
      const rosterDigest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical.canonicalString));
      const computedRosterHash = bytesToHex(new Uint8Array(rosterDigest));
      if (computedRosterHash !== proof.rosterSha256Hash) {
        return {
          valid: false,
          reason: 'ROSTER_HASH_MISMATCH',
          computedCommitmentHash,
          computedRosterHash,
        };
      }
      sortedTickets = canonical.sortedTickets;
    }

    const totalTickets = proof.totalEligibleTickets;
    if (!Number.isSafeInteger(totalTickets) || totalTickets <= 0) {
      return { valid: false, reason: 'INVALID_TOTAL_ELIGIBLE_TICKETS' };
    }
    if (!Number.isSafeInteger(proof.fencingToken) || proof.fencingToken <= 0) {
      return { valid: false, reason: 'INVALID_FENCING_TOKEN' };
    }

    const mBase = [
      'GIO_PF_V2',
      proof.rosterSha256Hash,
      proof.clientEntropy,
      proof.drawNonce,
      proof.drawId,
      String(proof.fencingToken),
      String(proof.rosterVersion),
      String(proof.drawSequence),
    ].join(':');

    const keyBytes = hexToBytes(proof.serverSeed);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const TWO_POW_32 = 4294967296;
    const limitN = Math.floor(TWO_POW_32 / totalTickets) * totalTickets;

    for (let blockIdx = 0; blockIdx < 100; blockIdx++) {
      const blockMessage = encoder.encode(`${mBase}:${blockIdx}`);
      const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, blockMessage);
      const view = new DataView(sigBuffer);

      for (let wordOffset = 0; wordOffset < 32; wordOffset += 4) {
        const u = view.getUint32(wordOffset, false); // big-endian
        if (u < limitN) {
          const computedWinningIndex = u % totalTickets;
          if (computedWinningIndex !== proof.winningIndex) {
            return {
              valid: false,
              reason: 'WINNING_INDEX_MISMATCH',
              computedCommitmentHash,
              computedWinningIndex,
            };
          }
          if (sortedTickets) {
            const expectedTicket = sortedTickets[computedWinningIndex];
            if (
              !expectedTicket ||
              expectedTicket.number !== proof.winningNumber ||
              expectedTicket.participantId !== proof.winnerParticipantId
            ) {
              return {
                valid: false,
                reason: 'WINNING_TICKET_MISMATCH',
                computedCommitmentHash,
                computedWinningIndex,
              };
            }
          }
          return {
            valid: true,
            computedCommitmentHash,
            computedRosterHash: proof.rosterSha256Hash,
            computedWinningIndex,
          };
        }
      }
    }

    return { valid: false, reason: 'REJECTION_SAMPLING_EXHAUSTED' };
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }
}
