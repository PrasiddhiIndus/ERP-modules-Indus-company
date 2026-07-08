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

  try {
    const cached = readCachedAccessToken();
    if (cached) {
      await hydrateSupabaseAuthFromCache(supabase);
    }
    const { data: refreshedSess, error: refreshErr } = await supabase.auth.refreshSession();
    if (!refreshErr && refreshedSess?.session?.access_token) {
      return refreshedSess.session.access_token;
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
