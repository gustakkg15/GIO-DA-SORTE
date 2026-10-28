import * as XLSX from 'xlsx';
import { Participant, RaffleSettings, ComputedRaffle, Winner } from '../types';

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

