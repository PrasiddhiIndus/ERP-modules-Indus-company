import { supabase } from './supabase';
import { getAdminApiAccessToken } from './userManagementAuthToken';

export function getApiBaseUrl() {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  // Same-origin /api (Vite dev proxy → Node on 8787, or your production reverse proxy).
  return '';
}

export function apiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
}

/** Quick check that the Node API (eTimeOffice proxy, e-invoice, R2) is reachable. */
function formatApiHealthFailure(status, errMessage) {
  if (status === 0) {
    return [
      'Cannot reach the Node API server.',
      'Run `npm install` then `npm run dev` (starts Vite + API on port 8787) or `npm run server` in a second terminal.',
      import.meta.env.DEV
        ? 'In dev, /api is proxied to http://127.0.0.1:8787 — if the server process crashed, check the terminal for errors (e.g. missing npm packages).'
        : 'Set VITE_API_BASE_URL to your deployed API URL and ensure that service is running.',
      errMessage ? `Detail: ${errMessage}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (status >= 500) {
    return [
      `API health check failed (${status}).`,
      'The frontend is up but the Node server on port 8787 is not responding.',
      'Run `npm install` then `npm run dev` or `npm run server` and check the server terminal for startup errors.',
    ].join(' ');
  }
  return `API health check failed (${status}).`;
}

export async function fetchApiHealth(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl('/api/health'), { signal: controller.signal });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      const proxyDown =
        import.meta.env.DEV &&
        res.status === 500 &&
        (/ECONNREFUSED|proxy error|socket hang up/i.test(text) || !String(text || '').trim());
      return {
        ok: false,
        status: res.status,
        data,
        error: proxyDown
          ? formatApiHealthFailure(
              0,
              'Node API on port 8787 is not running. Stop any stale process, then run `npm run dev` (or `npm run dev:staging`) from the project root — not `vite` alone.'
            )
          : formatApiHealthFailure(res.status, data?.message || text.slice(0, 120)),
      };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    const errMessage = aborted ? 'API health check timed out.' : err?.message || 'Unable to reach API server.';
    return {
      ok: false,
      status: 0,
      error: formatApiHealthFailure(0, errMessage),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchApiWithBearer(path, token, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    const errText = String(data?.error || data?.message || '').trim();
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : errText || `Request failed (${res.status})`,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: {},
      error: aborted ? 'API request timed out.' : err?.message || 'Unable to reach API server.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Authenticated fetch to the Node API (Bearer JWT from current session). */
export async function fetchApiWithAuth(path, options = {}) {
  const token = await getAdminApiAccessToken(supabase);
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: {},
      error: 'Not signed in. Sign in again to use the API.',
    };
  }

  let result = await fetchApiWithBearer(path, token, options);

  // Stale cached JWT can look valid client-side but fail server getUser (same as e-invoice).
  if (result.status === 401) {
    const refreshed = await getAdminApiAccessToken(supabase, { forceRefresh: true });
    if (refreshed && refreshed !== token) {
      result = await fetchApiWithBearer(path, refreshed, options);
    }
  }

  return result;
}

/** eTimeOffice proxy config on the server (no secrets). */
export async function fetchAttendanceApiStatus(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl('/api/admin/attendance/status'), { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    const errText = String(data?.error || data?.message || '').trim();
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : errText || `Attendance API status failed (${res.status})`,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: {},
      error: aborted ? 'Attendance API check timed out.' : err?.message || 'Unable to reach API server.',
    };
  } finally {
    clearTimeout(timer);
  }
}
