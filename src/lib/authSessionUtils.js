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
    const session = readCachedAuthSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Full cached session object from localStorage (no network). */
export function readCachedAuthSession() {
  try {
    const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed?.session ?? null;
    if (session?.access_token) return session;
    if (parsed?.access_token) return parsed;
    return null;
  } catch {
    return null;
  }
}

const HYDRATE_SESSION_TIMEOUT_MS = 8000;

/**
 * Restore Supabase client JWT from localStorage (optional — REST uses applyCachedUserAuthHeader).
 * Never call this before signInWithPassword; it can block login via the auth lock.
 */
export async function hydrateSupabaseAuthFromCache(supabaseClient) {
  if (typeof window === 'undefined') return false;
  if (clearSessionIfSupabaseProjectMismatch()) return false;
  if (isCachedAccessTokenExpired()) return false;
  const session = readCachedAuthSession();
  if (!session?.access_token) return false;
  try {
    const setSessionPromise = supabaseClient.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token ?? '',
    });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Session hydrate timed out')), HYDRATE_SESSION_TIMEOUT_MS);
    });
    const { data, error } = await Promise.race([setSessionPromise, timeoutPromise]);
    if (error) {
      if (isInvalidRefreshTokenError(error.message)) {
        clearSupabaseAuthStorage();
      }
      return false;
    }
    return Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
}

let sessionHydratePromise = null;

/** Clear after sign-out so the next login re-hydrates. */
export function resetSupabaseSessionHydration() {
  sessionHydratePromise = null;
}

/** Call after signInWithPassword/setSession so data fetches skip re-hydrate wait. */
export function markSupabaseSessionHydrated() {
  sessionHydratePromise = Promise.resolve(true);
}

/**
 * Background session sync — do NOT use in customFetch (blocks login).
 * Prefer readCachedAccessToken + Authorization header on REST calls.
 */
export function ensureSupabaseSessionHydrated(supabaseClient) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (!readCachedAccessToken() || isCachedAccessTokenExpired()) {
    return Promise.resolve(false);
  }
  if (!sessionHydratePromise) {
    sessionHydratePromise = hydrateSupabaseAuthFromCache(supabaseClient)
      .catch(() => false)
      .finally(() => {
        sessionHydratePromise = null;
      });
  }
  return sessionHydratePromise;
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
    const session = readCachedAuthSession();
    return session?.user ?? null;
  } catch {
    return null;
  }
}

/** True when cached access JWT is missing or past expiry (skip network refresh on boot). */
export function isCachedAccessTokenExpired(skewSeconds = 60) {
  const token = readCachedAccessToken();
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const payload = JSON.parse(atob(b64));
    const exp = payload?.exp;
    if (!exp) return false;
    return Date.now() / 1000 >= exp - skewSeconds;
  } catch {
    return true;
  }
}

export function clearSupabaseAuthStorage() {
  try {
    resetSupabaseSessionHydration();
    clearCachedProfileRow();
    Object.keys(localStorage).forEach((key) => {
      if (key.includes('supabase') || key.includes('sb-')) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    /* ignore */
  }
}

const PROFILE_CACHE_KEY = 'erp.auth.profile';

/** Last known profiles row — instant correct sidebar on page refresh. */
export function readCachedProfileRow(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.id !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedProfileRow(profile) {
  if (!profile?.id) return;
  try {
    sessionStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({
        id: profile.id,
        email: profile.email ?? null,
        username: profile.username ?? null,
        team: profile.team ?? null,
        role: profile.role ?? null,
        allowed_modules: Array.isArray(profile.allowed_modules) ? profile.allowed_modules : [],
        employee_code: profile.employee_code ?? null,
      })
    );
  } catch {
    /* ignore */
  }
}

export function clearCachedProfileRow() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
