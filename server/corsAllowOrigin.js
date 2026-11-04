/**
 * CORS origin checks for the Express API.
 * Production often lists only the apex host (https://indus-erp.in) while nginx
 * also serves www — browser POSTs from www send Origin: https://www.… and must
 * still be allowed (or same-origin uploads are aborted before the route runs).
 */

function hostnameKey(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
}

/** True when `origin` is listed, or is the www ↔ apex sibling of a listed origin. */
export function isAllowedCorsOrigin(origin, allowedOrigins = []) {
  const raw = String(origin || '').trim();
  if (!raw) return true;
  const list = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  if (!list.length) return true;
  if (list.includes(raw)) return true;

  let originUrl;
  try {
    originUrl = new URL(raw);
  } catch {
    return false;
  }

  const originHost = hostnameKey(originUrl.hostname);
  if (!originHost) return false;

  for (const allowed of list) {
    try {
      const allowedUrl = new URL(String(allowed).trim());
      if (allowedUrl.protocol !== originUrl.protocol) continue;
      if (hostnameKey(allowedUrl.hostname) === originHost) return true;
    } catch {
      /* skip invalid allowed entry */
    }
  }
  return false;
}

export function isLocalDevOrigin(origin) {
  if (!origin) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(origin).trim());
}
