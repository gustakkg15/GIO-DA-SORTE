export interface Participant {
  id: string;
  name: string;
  coins: number;
  addedAt: number;
}

export type TicketOrder = 'asc' | 'desc' | 'random';
export type DrawMode = 'drum' | 'wheel' | 'battleroyale';

export interface PrizeTier {
  id: string;
  name: string;
  rank: number; // 1 = 1º Lugar, 2 = 2º Lugar, etc.
  winnerId?: string;
  winnerName?: string;
  ticketNumber?: number;
}

export interface RaffleSettings {
  rate: number;         // Moedas por número (default: 100)
  total: number;        // Total de números disponíveis (default: 100)
  start: number;        // Primeiro número (default: 1)
  order: TicketOrder;   // Ordem dos números
  seed: number;         // Seed para ordem aleatória determinística
  exclude: boolean;     // Excluir quem já ganhou de sorteios subsequentes
  currentPrize: string; // Nome do prêmio atual
  spinDuration: number; // Duração da rotação em ms (1500, 3000, 5000)
  countdownSeconds?: number; // Contagem regressiva antes do sorteio em segundos (ex: 10, 5, 3, 0 = desativado)
  prizes: PrizeTier[];  // Lista de prêmios escalonados
  drawMode: DrawMode;   // 'drum' (bilhete) | 'wheel' (roleta) | 'battleroyale'
  supportPixKey?: string; // Chave Pix para colaboração espontânea
  supportPaypalEmail?: string; // E-mail ou link PayPal para colaboração internacional/cartão
  raffleCode?: string; // Código de consulta amigável para participantes (ex: GIO-7492)
  organizerName?: string; // Nome do sorteador ou canal (ex: Gusta Games)
  raffleTitle?: string; // Título do sorteio atual
  prizeName?: string; // Nome do prêmio principal do sorteio
  prizeImage?: string; // Imagem/foto do prêmio (URL ou base64 data)
}

export interface PublicRaffle {
  code: string;
  userId?: string;
  title: string;
  organizerName: string;
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  updatedAt: string;
  isLive?: boolean;
}

export interface Winner {
  id: string;
  participantId: string;
  name: string;
  number: number;
  prize: string;
  drawnAt: number;
}

export interface TicketAllocation {
  participant: Participant;
  wantedTickets: number;
  assignedTickets: number;
  tickets: number[];
  remainderCoins: number;
  winProbability: number; // 0 to 100 %
}

export interface ComputedRaffle {
  allocations: TicketAllocation[];
  allTickets: { number: number; participantId: string; name: string }[];
  usedCount: number;
  totalCapacity: number;
  eligibleTickets: { number: number; participantId: string; name: string }[];
}

export interface MonteCarloResult {
  participantId: string;
  name: string;
  coins: number;
  tickets: number;
  simulatedWins: number;
  simulatedPct: number;
  theoreticalPct: number;
  difference: number;
}

// TikTok Giveaway Types
export interface TikTokVideoInfo {
  url: string;
  videoId?: string;
  authorName?: string;
  authorUrl?: string;
  authorAvatar?: string;
  title?: string;
  thumbnailUrl?: string;
  commentCount?: number;
  hasMoreComments?: boolean;
  nextCursor?: number | string;
}

export interface TikTokComment {
  id: string;
  username: string;
  nickname?: string;
  avatarUrl?: string;
  text: string;
  timestamp?: number;
  likes?: number;
  mentions: string[];
}

export interface TikTokFilterSettings {
  filterDuplicates: boolean; // 1 chance por @usuário
  keyword: string;           // Palavra-chave ou hashtag obrigatória
  minMentions: number;       // Mínimo de @amigos marcados
  excludeAuthor: boolean;    // Excluir comentários do autor do vídeo
  minCharacters: number;     // Mínimo de caracteres
}

export interface TikTokWinner {
  id: string;
  rank: number;
  comment: TikTokComment;
  prize: string;
  drawnAt: number;
}
