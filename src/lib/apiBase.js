export function getApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return 'http://127.0.0.1:8787';
  return '';
}

export function apiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}
