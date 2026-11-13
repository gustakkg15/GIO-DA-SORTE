/**
 * Centralized API Base URL and fetch configuration for GIO DA SORTE PRO.
 * Automatically resolves to the authoritative Cloud Run backend when running on GitHub Pages,
 * while preserving relative paths for local development and same-origin Cloud Run hosting.
 */

export const CLOUD_RUN_BACKEND_URL =
  'https://gio-da-sorte-1042651147403.europe-west2.run.app';

/**
 * Returns the resolved API base URL according to the current hosting environment.
 */
export function getApiBaseUrl(): string {
  // 1. Explicit environment variable takes precedence if provided during build
  const envBase = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_BASE_URL : undefined;
  if (typeof envBase === 'string' && envBase.trim() !== '') {
    return envBase.trim().replace(/\/+$/, '');
  }

  // 2. When hosted on GitHub Pages (static host), route API calls to live Cloud Run backend
  if (
    typeof window !== 'undefined' &&
    typeof window.location?.hostname === 'string' &&
    window.location.hostname.endsWith('github.io')
  ) {
    return CLOUD_RUN_BACKEND_URL;
  }

  // 3. Same-origin environments (local dev server or monolith Cloud Run) use relative paths
  return '';
}

/**
 * Resolves a full endpoint URL for any API path.
 * Example: getApiUrl('/api/tiktok/auth/login/start')
 */
export function getApiUrl(endpointPath: string): string {
  const base = getApiBaseUrl();
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return `${base}${normalizedPath}`;
}

/**
 * Wrapper for standard fetch that applies the resolved API base URL and includes credentials.
 */
export async function apiFetch(
  endpointPath: string,
  init?: RequestInit
): Promise<Response> {
  const fullUrl = getApiUrl(endpointPath);
  const options: RequestInit = {
    cache: init?.cache || 'no-store',
    ...init,
    credentials: init?.credentials || 'include',
  };
  return fetch(fullUrl, options);
}

export type NonJsonHtmlReason =
  | 'COOKIE_CHECK_REDIRECT'
  | 'SPA_FALLBACK_HTML'
  | 'NOT_FOUND_HTML'
  | 'GATEWAY_OR_PROXY_HTML'
  | 'UNKNOWN_NON_JSON';

export interface SafeJsonResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isHtml?: boolean;
  redirected?: boolean;
  finalUrl?: string;
  htmlReason?: NonJsonHtmlReason;
}

function sanitizeDiagnosticUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(
      rawUrl,
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost'
    );
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return rawUrl.split('?')[0] || '';
  }
}

function classifyNonJsonResponse(params: {
  status: number;
  statusText: string;
  fullUrl: string;
  finalUrl: string;
  redirected: boolean;
  bodyText: string;
}): { htmlReason: NonJsonHtmlReason; message: string } {
  const { status, statusText, fullUrl, finalUrl, redirected, bodyText } = params;
  const sample = bodyText.slice(0, 4096);

  if (
    (redirected && finalUrl.includes('__cookie_check')) ||
    finalUrl.includes('__cookie_check.html') ||
    /<title>\s*Cookie check\s*<\/title>/i.test(sample) ||
    sample.includes('authFlowTestCookieIsSet')
  ) {
    return {
      htmlReason: 'COOKIE_CHECK_REDIRECT',
      message:
        'A sessão de cookies do Preview expirou ou foi bloqueada pelo navegador (/__cookie_check.html). Recarregue a página ou abra em uma nova aba para autenticar antes de sortear.',
    };
  }

  if (
    sample.includes('id="root"') ||
    sample.includes("id='root'") ||
    /<title>[^<]*GIO DA SORTE/i.test(sample)
  ) {
    return {
      htmlReason: 'SPA_FALLBACK_HTML',
      message: `Resposta não-JSON do servidor (${status} SPA HTML Fallback). URL: ${fullUrl}`,
    };
  }

  if (status === 404) {
    return {
      htmlReason: 'NOT_FOUND_HTML',
      message: `Resposta não-JSON do servidor (${status} ${statusText || 'HTML'}). URL: ${fullUrl}`,
    };
  }

  if (status === 502 || status === 503 || status === 504) {
    return {
      htmlReason: 'GATEWAY_OR_PROXY_HTML',
      message: `Resposta não-JSON do servidor (${status} ${statusText || 'HTML'}). URL: ${fullUrl}`,
    };
  }

  return {
    htmlReason: 'UNKNOWN_NON_JSON',
    message: `Resposta não-JSON do servidor (${status} ${statusText || 'HTML'}). URL: ${fullUrl}`,
  };
}

/**
 * Safely executes an API request, ensuring the URL is properly resolved to the backend
 * and parsing the JSON response safely without throwing "Unexpected token '<'".
 */
export async function safeApiJson<T = any>(
  endpointPath: string,
  init?: RequestInit
): Promise<SafeJsonResponse<T>> {
  const fullUrl = getApiUrl(endpointPath);
  const method = init?.method || 'GET';

  console.log(`[GIO API Request] Executando ${method} ${fullUrl}`);

  try {
    const res = await apiFetch(endpointPath, init);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const isJson = contentType.includes('application/json');
    const redirected = Boolean((res as any).redirected);
    const finalUrl = sanitizeDiagnosticUrl((res as any).url);

    console.log(
      `[GIO API Response] ${method} ${fullUrl} -> Status: ${res.status}, Redirected: ${redirected}, FinalURL: "${finalUrl || fullUrl}", Content-Type: "${contentType}", IS_JSON: ${isJson}`
    );

    // Catch non-JSON (e.g. Preview /__cookie_check.html 302->200, SPA index.html fallback, 404.html, 502/503 warmup)
    if (!isJson) {
      const rawText = await res.text().catch(() => '');
      const limitedSample = rawText.slice(0, 200).replace(/\s+/g, ' ');
      const classified = classifyNonJsonResponse({
        status: res.status,
        statusText: res.statusText,
        fullUrl,
        finalUrl,
        redirected,
        bodyText: rawText,
      });

      console.warn(
        `[GIO API Response NON-JSON] ${method} ${fullUrl} (${classified.htmlReason}) status=${res.status} redirected=${redirected} finalUrl="${finalUrl}". Amostra: "${limitedSample}..."`
      );

      return {
        ok: false,
        status: res.status,
        isHtml: true,
        redirected,
        finalUrl: finalUrl || undefined,
        htmlReason: classified.htmlReason,
        error: classified.message,
      };
    }

    const rawJsonText = await res.text().catch(() => '');
    let data: any;
    try {
      data = rawJsonText ? JSON.parse(rawJsonText) : null;
    } catch {
      const limitedSample = rawJsonText.slice(0, 200).replace(/\s+/g, ' ');
      console.warn(
        `[GIO API Invalid JSON] ${method} ${fullUrl} -> HTTP ${res.status} com JSON malformado. Amostra: "${limitedSample}..."`
      );
      return {
        ok: false,
        status: res.status,
        redirected,
        finalUrl: finalUrl || undefined,
        error: `Resposta JSON inválida ou incompleta do servidor (${res.status}). URL: ${fullUrl}`,
      };
    }

    if (!res.ok) {
      console.warn(
        `[GIO API Response ERROR] ${method} ${fullUrl} -> HTTP ${res.status}:`,
        data?.error || data?.message
      );
      return {
        ok: false,
        status: res.status,
        data,
        redirected,
        finalUrl: finalUrl || undefined,
        error: data?.message || data?.error || `Erro HTTP ${res.status}`,
      };
    }

    console.log(`[GIO API Response SUCCESS] ${method} ${fullUrl} -> HTTP ${res.status}`);
    return {
      ok: true,
      status: res.status,
      data,
      redirected,
      finalUrl: finalUrl || undefined,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Falha na conexão de rede com o servidor.';
    console.error(`[GIO API Network Error] ${method} ${fullUrl}:`, errMsg);
    return {
      ok: false,
      status: 0,
      error: errMsg,
    };
  }
}

