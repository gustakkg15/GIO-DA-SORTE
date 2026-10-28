import { TikTokComment, TikTokFilterSettings, TikTokVideoInfo } from '../types';

/**
 * Validates and parses TikTok video URLs
 */
export function parseTikTokUrl(rawUrl: string): {
  isValid: boolean;
  cleanUrl: string;
  videoId?: string;
  username?: string;
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isValid: false, cleanUrl: '' };
  }

  // Prepend https:// if user pasted without protocol
  const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;

  // Common TikTok URL patterns:
  // - https://www.tiktok.com/@user/video/7200000000000000000
  // - https://www.tiktok.com/@user/photo/7200000000000000000
  // - https://vm.tiktok.com/ZMxxxxxx/
  // - https://vt.tiktok.com/ZSxxxxxx/
  // - https://m.tiktok.com/v/7200000000000000000.html
  const isTikTok = /tiktok\.com/i.test(normalized);
  if (!isTikTok) {
    return { isValid: false, cleanUrl: normalized };
  }

  let username: string | undefined;
  let videoId: string | undefined;

  // Extract username from @handle
  const userMatch = normalized.match(/@([a-zA-Z0-9_.-]+)/);
  if (userMatch) {
    username = userMatch[1];
  }

  // Extract video ID (numeric string)
  const idMatch = normalized.match(/\/(?:video|photo|v)\/(\d+)/i);
  if (idMatch) {
    videoId = idMatch[1];
  }

  return {
    isValid: true,
    cleanUrl: normalized.split('?')[0],
    videoId,
    username,
  };
}

/**
 * Extracts all @mentions from a comment text
 */
export function extractMentions(text: string): string[] {
  const matches = text.match(/@[a-zA-Z0-9_.-]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

/**
 * Cache entry structure with timestamp and time-to-live
 */
export interface TikTokCacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface ExponentialBackoffConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitterMs?: number;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

export interface FetchTikTokOptions {
  forceRefresh?: boolean;
  retries?: number;
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

export interface LoadTikTokCommentsOptions {
  maxPages?: number;
  forceRefresh?: boolean;
  onProgress?: (msg: string, currentCount: number) => void;
}

/**
 * In-memory temporary cache for TikTok requests (TTL: 5 minutes by default)
 */
const tikTokMemoryCache = new Map<string, TikTokCacheEntry<unknown>>();
export const DEFAULT_TIKTOK_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Retrieves a value from the temporary cache if not expired
 */
export function getCachedTikTokData<T>(key: string): T | null {
  const entry = tikTokMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tikTokMemoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Sets a value in the temporary cache with a time-to-live (TTL)
 */
export function setCachedTikTokData<T>(key: string, data: T, ttlMs: number = DEFAULT_TIKTOK_CACHE_TTL_MS): void {
  // Prune expired entries if the map gets large
  if (tikTokMemoryCache.size > 150) {
    const now = Date.now();
    for (const [k, v] of tikTokMemoryCache.entries()) {
      if (v.expiresAt <= now) {
        tikTokMemoryCache.delete(k);
      }
    }
  }
  tikTokMemoryCache.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Clears the TikTok in-memory cache
 */
export function clearTikTokCache(): void {
  tikTokMemoryCache.clear();
}

/**
 * Returns cache statistics (active entries count and keys)
 */
export function getTikTokCacheStats(): { size: number; keys: string[] } {
  const now = Date.now();
  for (const [k, v] of tikTokMemoryCache.entries()) {
    if (v.expiresAt <= now) {
      tikTokMemoryCache.delete(k);
    }
  }
  return {
    size: tikTokMemoryCache.size,
    keys: Array.from(tikTokMemoryCache.keys()),
  };
}

let lastTikWmRequestTime = 0;

/**
 * Rate limit guard: Ensures at least 1350ms between requests to tikwm to strictly adhere
 * to the "1 request/second" limit and avoid Free Api Limit errors.
 */
export async function waitForTikWmRateLimit(minIntervalMs: number = 1350): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastTikWmRequestTime;
  if (timeSinceLast < minIntervalMs) {
    await new Promise((resolve) => setTimeout(resolve, minIntervalMs - timeSinceLast));
  }
  lastTikWmRequestTime = Date.now();
}

/**
 * Identifies whether an error or API message represents a rate limit or 1 req/sec restriction
 */
export function isTikTokRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = typeof err === 'string'
    ? err
    : (err instanceof Error ? err.message : (typeof (err as any)?.msg === 'string' ? (err as any).msg : ''));
  const lower = msg.toLowerCase();
  return (
    lower.includes('free api limit') ||
    lower.includes('1 request/second') ||
    lower.includes('request/sec') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('quota')
  );
}

/**
 * Executes an operation with Exponential Backoff and jitter:
 * delay = min(maxDelayMs, baseDelayMs * (backoffFactor ^ attempt)) + jitter
 */
export async function executeWithExponentialBackoff<T>(
  action: (attempt: number) => Promise<T>,
  config: ExponentialBackoffConfig = {}
): Promise<T> {
  const {
    maxRetries = 4,
    baseDelayMs = 1500,
    maxDelayMs = 12000,
    backoffFactor = 2,
    jitterMs = 400,
    onRetry,
  } = config;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await waitForTikWmRateLimit();
      return await action(attempt);
    } catch (err: unknown) {
      lastError = err;
      const isThrottled = isTikTokRateLimitError(err);

      if (attempt < maxRetries && isThrottled) {
        // Exponential backoff: baseDelay * 2^attempt + random jitter
        const exponentialWait = baseDelayMs * Math.pow(backoffFactor, attempt);
        const jitter = Math.floor(Math.random() * jitterMs);
        const totalDelay = Math.min(maxDelayMs, exponentialWait) + jitter;

        const reason = err instanceof Error ? err.message : 'Free Api Limit: 1 request/second.';
        if (onRetry) {
          onRetry(attempt + 1, totalDelay, reason);
        } else {
          console.warn(`[TikTok Backoff] Limite de requisições detectado. Tentativa ${attempt + 1}/${maxRetries}. Aguardando ${totalDelay}ms...`);
        }

        await new Promise((resolve) => setTimeout(resolve, totalDelay));
        continue;
      }

      // If not a throttled error or we reached max retries, propagate error
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Limite de tentativas excedido na API do TikTok.');
}

/**
 * Fetches video metadata from public API or oEmbed fallback with caching and backoff
 */
export async function fetchTikTokVideoDetails(
  videoUrl: string,
  options?: FetchTikTokOptions
): Promise<TikTokVideoInfo | null> {
  const parsed = parseTikTokUrl(videoUrl);
  if (!parsed.isValid) return null;

  const cleanUrl = parsed.cleanUrl || videoUrl.trim();
  const cacheKey = `video:${cleanUrl}`;

  // Check temporary cache unless forceRefresh is specified
  if (!options?.forceRefresh) {
    const cached = getCachedTikTokData<TikTokVideoInfo>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // 1. Try Primary TikWM API with exponential backoff
  try {
    const details = await executeWithExponentialBackoff(
      async () => {
        const res = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ url: videoUrl }).toString(),
        });

        if (res.status === 429) {
          throw new Error('Free Api Limit: HTTP 429 (Too Many Requests)');
        }

        if (!res.ok) {
          throw new Error(`Falha HTTP ${res.status}`);
        }

        const json = await res.json();
        if (json.code !== 0 || !json.data) {
          const msg = json?.msg || '';
          if (isTikTokRateLimitError(msg)) {
            throw new Error(msg);
          }
          return null;
        }

        const d = json.data;
        const info: TikTokVideoInfo = {
          url: videoUrl,
          videoId: d.id || parsed.videoId,
          authorName: d.author?.unique_id ? `@${d.author.unique_id}` : (parsed.username ? `@${parsed.username}` : 'Criador TikTok'),
          authorUrl: d.author?.unique_id ? `https://www.tiktok.com/@${d.author.unique_id}` : undefined,
          authorAvatar: d.author?.avatar || undefined,
          title: d.title || 'Vídeo do TikTok',
          thumbnailUrl: d.cover || undefined,
          commentCount: typeof d.comment_count === 'number' ? d.comment_count : undefined,
        };

        return info;
      },
      {
        maxRetries: options?.retries ?? 3,
        baseDelayMs: 1500,
        onRetry: options?.onRetry,
      }
    );

    if (details) {
      setCachedTikTokData(cacheKey, details);
      return details;
    }
  } catch (err) {
    console.warn('TikWM details notice:', err);
  }

  // 2. Secondary fallback via TikTok official oEmbed
  try {
    const oembedEndpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
    const response = await fetch(oembedEndpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      const oembedInfo: TikTokVideoInfo = {
        url: videoUrl,
        videoId: parsed.videoId,
        authorName: data.author_name ? (data.author_name.startsWith('@') ? data.author_name : `@${data.author_name}`) : (parsed.username ? `@${parsed.username}` : 'Criador do TikTok'),
        authorUrl: data.author_url,
        title: data.title || 'Vídeo do TikTok',
        thumbnailUrl: data.thumbnail_url,
      };
      setCachedTikTokData(cacheKey, oembedInfo);
      return oembedInfo;
    }
  } catch (err) {
    console.warn('oEmbed notice:', err);
  }

  // 3. Fallback with URL metadata
  const fallbackInfo: TikTokVideoInfo = {
    url: videoUrl,
    videoId: parsed.videoId,
    authorName: parsed.username ? `@${parsed.username}` : 'Criador do TikTok',
    title: 'Sorteio no Vídeo do TikTok',
  };
  return fallbackInfo;
}

/**
 * Fetches a single batch/page of comments with exponential backoff and temporary caching
 */
export async function fetchTikTokCommentsBatch(
  videoUrl: string,
  cursor: number = 0,
  count: number = 50,
  optionsOrRetries?: number | FetchTikTokOptions
): Promise<{
  comments: TikTokComment[];
  hasMore: boolean;
  nextCursor?: number;
  total?: number;
  fromCache?: boolean;
}> {
  const options: FetchTikTokOptions = typeof optionsOrRetries === 'number'
    ? { retries: optionsOrRetries }
    : (optionsOrRetries || {});

  const parsed = parseTikTokUrl(videoUrl);
  const cleanUrl = parsed.cleanUrl || videoUrl.trim();
  const cacheKey = `batch:${cleanUrl}:${cursor}:${count}`;

  // Check temporary cache
  if (!options.forceRefresh) {
    const cached = getCachedTikTokData<{
      comments: TikTokComment[];
      hasMore: boolean;
      nextCursor?: number;
      total?: number;
    }>(cacheKey);

    if (cached) {
      return {
        ...cached,
        fromCache: true,
      };
    }
  }

  const endpoint = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(videoUrl)}&count=${count}&cursor=${cursor}`;

  const result = await executeWithExponentialBackoff(
    async () => {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 429) {
        throw new Error('Free Api Limit: HTTP 429 (Too Many Requests)');
      }

      if (!response.ok) {
        throw new Error(`Falha na resposta da API do TikTok (HTTP ${response.status})`);
      }

      const json = await response.json();

      // Check for rate limit or API failure
      if (json.code !== 0 || !json.data) {
        const errorMsg = json.msg || 'Não foi possível carregar os comentários deste vídeo.';
        if (isTikTokRateLimitError(errorMsg)) {
          throw new Error(errorMsg);
        }
        throw new Error(errorMsg);
      }

      const rawList = Array.isArray(json.data.comments) ? json.data.comments : [];
      const comments: TikTokComment[] = rawList.map((c: any, index: number) => {
        const rawUser = String(c.user?.unique_id || c.user?.nickname || `usuario_${cursor + index + 1}`);
        const username = rawUser.startsWith('@') ? rawUser : `@${rawUser}`;
        const commentText = String(c.text || '').trim();

        return {
          id: String(c.id || `cmt-${cursor + index + 1}-${Date.now()}`),
          username,
          nickname: c.user?.nickname ? String(c.user.nickname) : undefined,
          avatarUrl: c.user?.avatar ? String(c.user.avatar) : undefined,
          text: commentText,
          likes: typeof c.digg_count === 'number' ? c.digg_count : 0,
          timestamp: typeof c.create_time === 'number' ? c.create_time * 1000 : Date.now() - index * 60000,
          mentions: extractMentions(commentText),
        };
      });

      return {
        comments,
        hasMore: Boolean(json.data.hasMore && json.data.cursor),
        nextCursor: typeof json.data.cursor === 'number' ? json.data.cursor : undefined,
        total: typeof json.data.total === 'number' ? json.data.total : comments.length,
      };
    },
    {
      maxRetries: options.retries ?? 4,
      baseDelayMs: 1500,
      backoffFactor: 2,
      jitterMs: 400,
      onRetry: options.onRetry,
    }
  );

  // Store batch in cache
  setCachedTikTokData(cacheKey, result, DEFAULT_TIKTOK_CACHE_TTL_MS);

  return result;
}

/**
 * High-level function that fetches video details and loads multiple pages of comments
 * using exponential backoff retry on rate limits and temporary caching.
 */
export async function loadTikTokComments(
  videoUrl: string,
  options?: LoadTikTokCommentsOptions
): Promise<{
  videoInfo: TikTokVideoInfo;
  comments: TikTokComment[];
  hasMore: boolean;
  nextCursor?: number;
  totalCommentsInVideo?: number;
  fromCache?: boolean;
}> {
  const maxPages = options?.maxPages || 3;
  const parsed = parseTikTokUrl(videoUrl);
  const cleanUrl = parsed.cleanUrl || videoUrl.trim();
  const fullCacheKey = `full_run:${cleanUrl}:${maxPages}`;

  // Check if we already have the full run in cache
  if (!options?.forceRefresh) {
    const cachedRun = getCachedTikTokData<{
      videoInfo: TikTokVideoInfo;
      comments: TikTokComment[];
      hasMore: boolean;
      nextCursor?: number;
      totalCommentsInVideo?: number;
    }>(fullCacheKey);

    if (cachedRun && cachedRun.comments.length > 0) {
      options?.onProgress?.(`Comentários carregados do cache temporário (${cachedRun.comments.length} itens)`, cachedRun.comments.length);
      return {
        ...cachedRun,
        fromCache: true,
      };
    }
  }

  options?.onProgress?.('Buscando dados e miniatura do vídeo...', 0);

  // 1. Fetch Video Details with retry notice
  const videoInfo = await fetchTikTokVideoDetails(videoUrl, {
    forceRefresh: options?.forceRefresh,
    onRetry: (attempt, delayMs) => {
      options?.onProgress?.(
        `Limite da API do TikTok (1 req/seg). Aguardando ${Math.ceil(delayMs / 1000)}s antes de tentar novamente (tentativa ${attempt})...`,
        0
      );
    },
  });

  if (!videoInfo) {
    throw new Error('Link do TikTok inválido ou não acessível.');
  }

  // 2. Fetch comments page by page
  options?.onProgress?.('Carregando comentários reais do TikTok...', 0);
  const allComments: TikTokComment[] = [];
  const seenIds = new Set<string>();

  let currentCursor = 0;
  let hasMore = true;
  let nextCursor: number | undefined;
  let totalCommentsInVideo = videoInfo.commentCount;

  for (let page = 0; page < maxPages && hasMore; page++) {
    try {
      options?.onProgress?.(
        `Carregando comentários (página ${page + 1}${totalCommentsInVideo ? ` · total: ${totalCommentsInVideo}` : ''})...`,
        allComments.length
      );

      const batch = await fetchTikTokCommentsBatch(videoUrl, currentCursor, 50, {
        forceRefresh: options?.forceRefresh,
        onRetry: (attempt, delayMs) => {
          options?.onProgress?.(
            `Limite da API TikTok atingido (1 req/seg). Aplicando backoff de ${Math.ceil(delayMs / 1000)}s (tentativa ${attempt})...`,
            allComments.length
          );
        },
      });

      if (batch.total && !totalCommentsInVideo) {
        totalCommentsInVideo = batch.total;
      }

      for (const c of batch.comments) {
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          allComments.push(c);
        }
      }

      hasMore = batch.hasMore;
      nextCursor = batch.nextCursor;

      if (batch.hasMore && typeof batch.nextCursor === 'number') {
        currentCursor = batch.nextCursor;
      } else {
        hasMore = false;
        break;
      }

      // Safe pause between pages (1300ms) with user feedback if more pages remain
      if (hasMore && page < maxPages - 1) {
        options?.onProgress?.('Aguardando intervalo seguro do TikTok (1 req/seg)...', allComments.length);
        await new Promise((resolve) => setTimeout(resolve, 1300));
      }
    } catch (pageErr) {
      console.warn(`Aviso na página de comentários ${page + 1}:`, pageErr);
      // If we got at least some comments on previous pages, keep what we have and let user continue
      if (allComments.length > 0) {
        break;
      } else {
        throw pageErr;
      }
    }
  }

  const result = {
    videoInfo: {
      ...videoInfo,
      commentCount: totalCommentsInVideo || allComments.length,
      hasMoreComments: hasMore,
      nextCursor,
    },
    comments: allComments,
    hasMore,
    nextCursor,
    totalCommentsInVideo,
  };

  // Cache full run if comments were retrieved
  if (allComments.length > 0) {
    setCachedTikTokData(fullCacheKey, result, DEFAULT_TIKTOK_CACHE_TTL_MS);
  }

  return result;
}

/**
 * Filters a list of TikTok comments according to current filter rules
 */
export function filterComments(
  comments: TikTokComment[],
  filters: TikTokFilterSettings,
  authorName?: string
): { eligible: TikTokComment[]; totalEligibleUsers: number } {
  const cleanKeyword = filters.keyword.trim().toLowerCase();
  const cleanAuthor = authorName?.replace(/^@/, '').toLowerCase();

  // 1. Initial filter pass
  const matched = comments.filter((c) => {
    // Exclude author if checked
    if (filters.excludeAuthor && cleanAuthor) {
      const cleanUser = c.username.replace(/^@/, '').toLowerCase();
      if (cleanUser === cleanAuthor) return false;
    }

    // Min characters
    if (filters.minCharacters > 0 && c.text.trim().length < filters.minCharacters) {
      return false;
    }

    // Min mentions
    if (filters.minMentions > 0 && c.mentions.length < filters.minMentions) {
      return false;
    }

    // Keyword / hashtag check
    if (cleanKeyword && !c.text.toLowerCase().includes(cleanKeyword)) {
      return false;
    }

    return true;
  });

  // 2. Duplicate handling (1 chance per username)
  if (filters.filterDuplicates) {
    const seenUsers = new Set<string>();
    const deduplicated: TikTokComment[] = [];

    for (const comment of matched) {
      const normUser = comment.username.trim().toLowerCase();
      if (!seenUsers.has(normUser)) {
        seenUsers.add(normUser);
        deduplicated.push(comment);
      }
    }

    return {
      eligible: deduplicated,
      totalEligibleUsers: seenUsers.size,
    };
  }

  const uniqueUsers = new Set(matched.map((c) => c.username.trim().toLowerCase()));

  return {
    eligible: matched,
    totalEligibleUsers: uniqueUsers.size,
  };
}

/**
 * Parses user imported / pasted text into TikTokComment list.
 * Supports:
 * - Line format: @username: comment text
 * - Line format: username - comment text
 * - CSV format: username,text
 * - JSON format: [{ "username": "...", "text": "..." }]
 */
export function parseImportedComments(rawInput: string): TikTokComment[] {
  const text = rawInput.trim();
  if (!text) return [];

  // 1. Try parsing JSON
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const jsonComments: TikTokComment[] = [];
        parsed.forEach((item, idx) => {
          if (!item || typeof item !== 'object') return;
          const username = String(item.username || item.user || item.author || item.name || `usuario_${idx + 1}`);
          const commentText = String(item.text || item.comment || item.message || item.content || '');
          if (!commentText && !username) return;

          jsonComments.push({
            id: String(item.id || `cmt-import-${idx + 1}-${Date.now()}`),
            username: username.startsWith('@') ? username : `@${username}`,
            nickname: item.nickname ? String(item.nickname) : item.name ? String(item.name) : undefined,
            avatarUrl: item.avatar || item.avatarUrl || undefined,
            text: commentText,
            likes: Number(item.likes || item.digg_count || 0),
            mentions: extractMentions(commentText),
            timestamp: item.timestamp ? Number(item.timestamp) : Date.now() - idx * 1000 * 60,
          });
        });
        if (jsonComments.length > 0) {
          return jsonComments;
        }
      }
    } catch {
      // not JSON, fallback to line-based parsing
    }
  }

  // 2. Parse Line-by-line / CSV
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const result: TikTokComment[] = [];

  lines.forEach((line, index) => {
    let username = '';
    let commentText = '';

    // Match @user: comment
    const colonMatch = line.match(/^@?([a-zA-Z0-9_.-]+)\s*[:：\-]\s*(.*)$/);
    if (colonMatch) {
      username = colonMatch[1];
      commentText = colonMatch[2];
    } else if (line.includes(',')) {
      // CSV format
      const parts = line.split(',');
      username = parts[0].trim().replace(/^["']|["']$/g, '');
      commentText = parts.slice(1).join(',').trim().replace(/^["']|["']$/g, '');
    } else if (line.includes('\t')) {
      // Tab-separated
      const parts = line.split('\t');
      username = parts[0].trim();
      commentText = parts.slice(1).join(' ').trim();
    } else {
      // Bare text without delimiter, treat as username and placeholder or single word
      username = `participante_${index + 1}`;
      commentText = line.trim();
    }

    if (username || commentText) {
      const cleanUser = username.replace(/^@/, '');
      result.push({
        id: `imported-${index + 1}-${Date.now()}`,
        username: `@${cleanUser || `user_${index + 1}`}`,
        text: commentText || 'Quero participar do sorteio!',
        likes: Math.floor(Math.random() * 8),
        mentions: extractMentions(commentText),
        timestamp: Date.now() - index * 60000,
      });
    }
  });

  return result;
}

/**
 * 1-click JavaScript snippet users can run in TikTok's DevTools console to copy comments directly
 */
export const TIKTOK_BROWSER_CONSOLE_SNIPPET = `(function() {
  const items = [];
  document.querySelectorAll('[data-e2e="comment-item"], [class*="DivCommentItemContainer"], [class*="CommentItem"]').forEach((el) => {
    const userEl = el.querySelector('[data-e2e="comment-username"], a[href*="/@"], [class*="SpanUserNameText"]');
    const textEl = el.querySelector('[data-e2e="comment-level-1"], [class*="PCommentText"], [class*="SpanCommentText"]');
    if (userEl && textEl) {
      items.push({
        username: userEl.innerText.trim(),
        text: textEl.innerText.trim()
      });
    }
  });
  const json = JSON.stringify(items, null, 2);
  copy(json);
  alert("Pronto! " + items.length + " comentários copiados para sua área de transferência. Basta colar no GIO DA SORTE!");
})();`;

/**
 * Sample realistic Brazilian TikTok comments for testing and demonstration
 */
export const SAMPLE_TIKTOK_COMMENTS: TikTokComment[] = [
  {
    id: 'tk-1',
    username: '@gabriel.souza99',
    nickname: 'Gabriel Souza',
    text: 'Já tô participando demais! Esse prêmio vai ser meu @marcos_silva @lucas.dev #sorteio #giodasorte',
    likes: 42,
    mentions: ['@marcos_silva', '@lucas.dev'],
    timestamp: Date.now() - 3600000 * 2,
  },
  {
    id: 'tk-2',
    username: '@larissa_moraes',
    nickname: 'Lari Moraes 🌸',
    text: 'Que top! Torcendo muito pra ganhar @julia_alves @camilafreitas vem participar amigas #giodasorte',
    likes: 29,
    mentions: ['@julia_alves', '@camilafreitas'],
    timestamp: Date.now() - 3600000 * 3,
  },
  {
    id: 'tk-3',
    username: '@felipe_gamer_br',
    nickname: 'Felipe Gamer',
    text: 'Mano esse sorteio tá insano!! @rodrigo_costa você viu isso cara?? #sorteio',
    likes: 18,
    mentions: ['@rodrigo_costa'],
    timestamp: Date.now() - 3600000 * 4,
  },
  {
    id: 'tk-4',
    username: '@beatriz_lima_oficial',
    nickname: 'Bia Lima',
    text: 'Eu quero muitoooo! Nunca ganhei nada, quem sabe agora 🙏✨ @carol_santos @rafaela_m',
    likes: 67,
    mentions: ['@carol_santos', '@rafaela_m'],
    timestamp: Date.now() - 3600000 * 5,
  },
  {
    id: 'tk-5',
    username: '@tiago.oliveira22',
    nickname: 'Tiago Oliveira',
    text: 'Sempre acompanho seus vídeos, conteúdo top de linha! #sorteio #giodasorte',
    likes: 12,
    mentions: [],
    timestamp: Date.now() - 3600000 * 6,
  },
  {
    id: 'tk-6',
    username: '@amanda_castro_rj',
    nickname: 'Amanda Castro',
    text: 'Marcando os amigos pra não perder @bruninho_021 @leticia_rj @thiago_barros #sorteio',
    likes: 35,
    mentions: ['@bruninho_021', '@leticia_rj', '@thiago_barros'],
    timestamp: Date.now() - 3600000 * 7,
  },
  {
    id: 'tk-7',
    username: '@pedro_henrique_sp',
    nickname: 'Pedro Henrique',
    text: 'Vamo que vamo! Minha chance de levar esse presentão pra casa 🍀 @matheus_p @renan_silva',
    likes: 24,
    mentions: ['@matheus_p', '@renan_silva'],
    timestamp: Date.now() - 3600000 * 8,
  },
  {
    id: 'tk-8',
    username: '@juliana_costa_fit',
    nickname: 'Ju Costa',
    text: 'Já segui todas as regras! Bora ganhar esse prêmio lindo @patricia_fit @vanessa_rocha #giodasorte',
    likes: 53,
    mentions: ['@patricia_fit', '@vanessa_rocha'],
    timestamp: Date.now() - 3600000 * 9,
  },
  {
    id: 'tk-9',
    username: '@lucas_santana_dev',
    nickname: 'Lucas Santana',
    text: 'Quero esse prêmio demais, parabéns pela iniciativa do sorteio transparente! #sorteio',
    likes: 31,
    mentions: [],
    timestamp: Date.now() - 3600000 * 10,
  },
  {
    id: 'tk-10',
    username: '@mariana_ferreira_2',
    nickname: 'Mari Ferreira',
    text: 'Gente do céu, esse prêmio é perfeito! @aline_souza_ @fernanda_reis corre aqui amigas!!',
    likes: 47,
    mentions: ['@aline_souza_', '@fernanda_reis'],
    timestamp: Date.now() - 3600000 * 11,
  },
  {
    id: 'tk-11',
    username: '@rodrigo_moura_tech',
    nickname: 'Rodrigo Tech',
    text: 'Incrível! Sistema de sorteio top! @gustavo_lima @diego_almeida #giodasorte #sorteio',
    likes: 19,
    mentions: ['@gustavo_lima', '@diego_almeida'],
    timestamp: Date.now() - 3600000 * 12,
  },
  {
    id: 'tk-12',
    username: '@camila_barbosa_94',
    nickname: 'Camila Barbosa',
    text: 'Dedos cruzados 🤞✨ Já compartilhei com todo mundo @monica_b @priscila_m #sorteio',
    likes: 22,
    mentions: ['@monica_b', '@priscila_m'],
    timestamp: Date.now() - 3600000 * 13,
  },
  {
    id: 'tk-13',
    username: '@bruno_alves_88',
    nickname: 'Bruno Alves',
    text: 'Se eu ganhar eu faço uma live comemorando haha! @leandro_s @marcelo_p #giodasorte',
    likes: 15,
    mentions: ['@leandro_s', '@marcelo_p'],
    timestamp: Date.now() - 3600000 * 14,
  },
  {
    id: 'tk-14',
    username: '@vanessa_ribeiro_art',
    nickname: 'Vanessa Art',
    text: 'Que benção seria ganhar isso! Gratidão sempre @isabela_t @luana_cardoso #sorteio',
    likes: 38,
    mentions: ['@isabela_t', '@luana_cardoso'],
    timestamp: Date.now() - 3600000 * 15,
  },
  {
    id: 'tk-15',
    username: '@marcos_vinicius_g',
    nickname: 'Marcos V.',
    text: 'Top demais Gio! Confiante que a sorte tá do meu lado hoje 🎯🍀 @danilo_souza #sorteio',
    likes: 27,
    mentions: ['@danilo_souza'],
    timestamp: Date.now() - 3600000 * 16,
  },
  {
    id: 'tk-16',
    username: '@fernanda_alencar',
    nickname: 'Fernanda A.',
    text: 'Amei a transparência do sorteio! Boa sorte a todos @talita_s @carla_m #giodasorte',
    likes: 41,
    mentions: ['@talita_s', '@carla_m'],
    timestamp: Date.now() - 3600000 * 17,
  },
  {
    id: 'tk-17',
    username: '@diego_silveira_pro',
    nickname: 'Diego Silveira',
    text: 'Quero esse prêmio!! Marcando meu parceiro @joao_paulo_99 #sorteio #giodasorte',
    likes: 11,
    mentions: ['@joao_paulo_99'],
    timestamp: Date.now() - 3600000 * 18,
  },
  {
    id: 'tk-18',
    username: '@natalia_castro_design',
    nickname: 'Natália C.',
    text: 'Sensacional!! @renata_freitas @andreia_m já viram isso? #sorteio',
    likes: 33,
    mentions: ['@renata_freitas', '@andreia_m'],
    timestamp: Date.now() - 3600000 * 19,
  },
  {
    id: 'tk-19',
    username: '@andre_luis_bh',
    nickname: 'André Luís',
    text: 'Aqui de BH torcendo muito! Valeu pela oportunidade @vitor_hugo @caio_mg #giodasorte',
    likes: 21,
    mentions: ['@vitor_hugo', '@caio_mg'],
    timestamp: Date.now() - 3600000 * 20,
  },
  {
    id: 'tk-20',
    username: '@larissa_moraes',
    nickname: 'Lari Moraes 🌸',
    text: 'Comentando de novo pra garantir haha! @daniela_silva #sorteio',
    likes: 8,
    mentions: ['@daniela_silva'],
    timestamp: Date.now() - 3600000 * 21,
  },
];
