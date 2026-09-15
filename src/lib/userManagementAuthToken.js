import {
  hydrateSupabaseAuthFromCache,
  isCachedAccessTokenExpired,
  readCachedAccessToken,
  refreshCachedAccessToken,
} from './authSessionUtils';

/**
 * Access token for Node API routes (e-invoice, admin APIs).
 * Refreshes via GoTrue when the cached JWT is expired or stale.
 */
export async function getAdminApiAccessToken(supabase, options = {}) {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const cached = readCachedAccessToken();
    if (cached && !isCachedAccessTokenExpired()) {
      return cached;
    }
  }

  const refreshed = await refreshCachedAccessToken();
  if (refreshed?.access_token && !isCachedAccessTokenExpired()) {
    return refreshed.access_token;
  }

  // Keep a still-valid JWT. supabase.auth.refreshSession() can revoke the live
  // session when its in-memory refresh token is stale (403 session_id → logout).
  const stillValid = readCachedAccessToken();
  if (stillValid && !isCachedAccessTokenExpired(0)) {
    return stillValid;
  }

  try {
    const cached = readCachedAccessToken();
    if (cached) {
      await hydrateSupabaseAuthFromCache(supabase);
    }
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.access_token) {
      return sess.session.access_token;
    }
  } catch {
    /* fall through */
  }

  const cached = readCachedAccessToken();
  if (cached && !isCachedAccessTokenExpired()) {
    return cached;
  }

  return null;
}
