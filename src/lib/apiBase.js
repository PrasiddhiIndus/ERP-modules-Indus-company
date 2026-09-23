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

/** True when a response body looks like an Express/proxy HTML error page (never show that in the ERP UI). */
export function isRawServerHtmlDump(text) {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  return (
    /^\s*</.test(raw) ||
    /<!DOCTYPE/i.test(raw) ||
    /<html[\s>]/i.test(raw) ||
    /<pre>\s*Internal Server Error/i.test(raw)
  );
}

/**
 * Turn proxy/Express HTML dumps (and other raw failures) into a short business message.
 * Use for any banner that might receive `err.message` from fetch/API code.
 */
export function humanizeApiErrorMessage(errOrText, fallback = 'Something went wrong. Please try again.') {
  const raw = String(errOrText?.message || errOrText || '').trim();
  if (!raw) return fallback;
  if (isRawServerHtmlDump(raw) || /Internal Server Error/i.test(raw)) {
    return 'The company API server had a temporary problem. Please try again in a moment.';
  }
  if (/Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ECONNRESET|socket hang up/i.test(raw)) {
    return 'Could not reach the company API server. Check your connection and try again.';
  }
  // Strip accidental HTML tags if a partial dump slipped through.
  if (/<[^>]+>/.test(raw)) {
    const stripped = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!stripped || /Internal Server Error/i.test(stripped)) {
      return 'The company API server had a temporary problem. Please try again in a moment.';
    }
    return stripped.slice(0, 220);
  }
  return raw.length > 280 ? `${raw.slice(0, 277)}…` : raw;
}

/** Quick check that the Node API (eTimeOffice proxy, e-invoice, R2) is reachable. */
function formatApiHealthFailure(status, errMessage) {
  const detail = humanizeApiErrorMessage(errMessage, '');
  if (status === 0) {
    return [
      'Cannot reach the Node API server.',
      'Run `npm install` then `npm run dev` (starts Vite + API on port 8787) or `npm run server` in a second terminal.',
      import.meta.env.DEV
        ? 'In dev, /api is proxied to http://127.0.0.1:8787 — if the server process crashed, check the terminal for errors (e.g. missing npm packages).'
        : 'Set VITE_API_BASE_URL to your deployed API URL and ensure that service is running.',
      detail ? `Detail: ${detail}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (status >= 500) {
    return [
      `API health check failed (${status}).`,
      'The frontend is up but the Node API is not responding correctly.',
      import.meta.env.DEV
        ? 'Run `npm install` then `npm run dev` or `npm run server` and check the server terminal for startup errors.'
        : 'Ask IT to confirm the API process is running on the server.',
    ].join(' ');
  }
  return detail || `API health check failed (${status}).`;
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
        (/ECONNREFUSED|proxy error|socket hang up/i.test(text) ||
          !String(text || '').trim() ||
          isRawServerHtmlDump(text));
      const rawDetail = data?.message || data?.error || (isRawServerHtmlDump(text) ? '' : text.slice(0, 120));
      return {
        ok: false,
        status: res.status,
        data,
        error: proxyDown
          ? formatApiHealthFailure(
              0,
              'Node API on port 8787 is not running. Stop any stale process, then run `npm run dev` (or `npm run dev:staging`) from the project root — not `vite` alone.'
            )
          : formatApiHealthFailure(res.status, rawDetail),
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
  const { timeoutMs: _ignoredTimeout, forceRefresh: _ignoredRefresh, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...(fetchOptions.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await res.text().catch(() => '');
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = isRawServerHtmlDump(text) ? {} : { message: text.slice(0, 180) };
      }
    }
    const errText = String(data?.error || data?.message || '').trim();
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok
        ? undefined
        : humanizeApiErrorMessage(
            errText || (res.status >= 500 ? 'Internal Server Error' : ''),
            `Request failed (${res.status})`
          ),
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: {},
      error: aborted
        ? 'API request timed out.'
        : humanizeApiErrorMessage(err, 'Unable to reach API server.'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Authenticated fetch to the Node API (Bearer JWT from current session). */
export async function fetchApiWithAuth(path, options = {}) {
  const { forceRefresh = false, ...fetchOptions } = options;
  let token = await getAdminApiAccessToken(supabase, { forceRefresh: Boolean(forceRefresh) });
  if (!token) {
    // Last chance: use any non-expired cached JWT before giving up.
    token = await getAdminApiAccessToken(supabase, { forceRefresh: false });
  }
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: {},
      error: 'Not signed in. Sign in again to use the API.',
    };
  }

  let result = await fetchApiWithBearer(path, token, fetchOptions);

  // Stale cached JWT can look valid client-side but fail server getUser (same as e-invoice).
  if (result.status === 401) {
    const refreshed = await getAdminApiAccessToken(supabase, { forceRefresh: true });
    if (refreshed && refreshed !== token) {
      result = await fetchApiWithBearer(path, refreshed, fetchOptions);
    } else if (!forceRefresh) {
      // Token may have been near expiry; one more refresh attempt then retry same path.
      const again = await getAdminApiAccessToken(supabase, { forceRefresh: true });
      if (again) {
        result = await fetchApiWithBearer(path, again, fetchOptions);
      }
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
