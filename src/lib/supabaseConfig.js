/**
 * Supabase browser client configuration.
 *
 * The anon (public) key is intended for browser use; real protection is Postgres RLS.
 * Never put the service_role key or other secrets in VITE_* vars — they bundle into the client.
 */

/** @returns {Record<string, unknown> | null} */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getSupabaseUrl() {
  return String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
}

export function getSupabaseAnonKey() {
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
}

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-key';

export function isSupabaseEnvConfigured() {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return !!(url && key && url !== PLACEHOLDER_URL && key !== PLACEHOLDER_KEY);
}

/**
 * Blocks accidental use of the service_role JWT in the frontend (fatal error).
 * Safe to call at app bootstrap.
 */
export function assertBrowserSafeSupabaseKey() {
  const key = getSupabaseAnonKey();
  if (!key || key === PLACEHOLDER_KEY) return;
  const payload = decodeJwtPayload(key);
  if (payload?.role === 'service_role') {
    throw new Error(
      'Security: SUPABASE_SERVICE_ROLE key must not be used in the browser. Use the anon key in VITE_SUPABASE_ANON_KEY only.'
    );
  }
}

export function supabaseUrlLooksValid(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && Boolean(u.hostname);
  } catch {
    return false;
  }
}
