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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: formatApiHealthFailure(res.status),
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

/** eTimeOffice proxy config on the server (no secrets). */
export async function fetchAttendanceApiStatus(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl('/api/admin/attendance/status'), { signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      error: aborted ? 'Attendance API check timed out.' : err?.message || 'Unable to reach API server.',
    };
  } finally {
    clearTimeout(timer);
  }
}
