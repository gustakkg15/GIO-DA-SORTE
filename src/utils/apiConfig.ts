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
    ...init,
    credentials: init?.credentials || 'include',
  };
  return fetch(fullUrl, options);
}

export interface SafeJsonResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isHtml?: boolean;
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

    console.log(
      `[GIO API Response] ${method} ${fullUrl} -> Status: ${res.status}, Content-Type: "${contentType}", IS_JSON: ${isJson}`
    );

    // Catch non-JSON (e.g. 404.html from GitHub Pages or 502/503 warmup.html from Nginx)
    if (!isJson) {
      const sampleText = await res.text().catch(() => '');
      const limitedSample = sampleText.slice(0, 200).replace(/\s+/g, ' ');
      console.warn(
        `[GIO API Response NON-JSON] ${method} ${fullUrl} retornou conteúdo não-JSON (${res.status} ${res.statusText}). Amostra: "${limitedSample}..."`
      );

      return {
        ok: false,
        status: res.status,
        isHtml: true,
        error: `Resposta não-JSON do servidor (${res.status} ${res.statusText || 'HTML'}). URL: ${fullUrl}`,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      console.warn(
        `[GIO API Response ERROR] ${method} ${fullUrl} -> HTTP ${res.status}:`,
        data?.error || data?.message
      );
      return {
        ok: false,
        status: res.status,
        data,
        error: data?.message || data?.error || `Erro HTTP ${res.status}`,
      };
    }

    console.log(`[GIO API Response SUCCESS] ${method} ${fullUrl} -> HTTP ${res.status}`);
    return {
      ok: true,
      status: res.status,
      data,
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

