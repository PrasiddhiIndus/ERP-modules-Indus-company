/** Supabase auth storage key — must match `storageKey` in supabase.js */
export const SUPABASE_AUTH_STORAGE_KEY = 'supabase.auth.token';

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
