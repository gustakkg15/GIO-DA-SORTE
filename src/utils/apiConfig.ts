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
  const envBase = import.meta.env.VITE_API_BASE_URL;
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
