import {
  getSupabaseProjectRefFromUrl,
  getSupabaseProjectRefFromJwt,
  sessionMatchesConfiguredProject,
} from './supabaseConfig';

/** Supabase auth storage key — must match `storageKey` in supabase.js */
export const SUPABASE_AUTH_STORAGE_KEY = 'supabase.auth.token';

/** Read cached access token without a network round-trip. */
export function readCachedAccessToken() {
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Drop cached auth when switching staging ↔ production locally (prevents REST 401).
 * @returns {boolean} true if storage was cleared
 */
export function clearSessionIfSupabaseProjectMismatch() {
  const token = readCachedAccessToken();
  if (!token || sessionMatchesConfiguredProject(token)) return false;
  const configuredRef = getSupabaseProjectRefFromUrl();
  const sessionRef = getSupabaseProjectRefFromJwt(token);
  console.warn(
    `Clearing cached Supabase session: project "${sessionRef}" does not match configured "${configuredRef}".`
  );
  clearSupabaseAuthStorage();
  return true;
}

/**
 * True only for errors that mean the stored refresh token is gone or unusable.
 * Avoid broad matches like plain "JWT" or "refresh_token" in unrelated messages.
 */
export function isInvalidRefreshTokenError(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('token_not_found') ||
    (msg.includes('refresh') &&
      msg.includes('token') &&
      (msg.includes('invalid') || msg.includes('not found') || msg.includes('revoked')))
  );
}

/** Network / timeout failures — session may still be valid locally. */
export function isTransientAuthError(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('cannot reach supabase') ||
    msg.includes('aborterror') ||
    msg.includes('aborted')
  );
}

/** Profile/login-check failures that mean credentials are invalid, not a transient outage. */
export function isAuthCredentialError(message) {
  const msg = String(message || '').toLowerCase();
  return (
    isInvalidRefreshTokenError(message) ||
    msg === 'invalid token' ||
    msg.includes('invalid or expired session') ||
    msg.includes('missing authorization') ||
    msg === 'not signed in'
  );
}

/** Read cached session user from localStorage without a network round-trip. */
export function readCachedSessionUser() {
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? parsed;
    return session?.user ?? null;
  } catch {
    return null;
  }
}

export function clearSupabaseAuthStorage() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.includes('supabase') || key.includes('sb-')) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    /* ignore */
  }
}
