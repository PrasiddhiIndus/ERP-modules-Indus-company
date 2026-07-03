import { readCachedAccessToken, isCachedAccessTokenExpired } from './authSessionUtils';

/**
 * Access token for User Management admin APIs.
 * Prefer cached JWT from direct REST login — avoids refreshSession() wiping the session.
 */
export async function getAdminApiAccessToken(supabase) {
  const cached = readCachedAccessToken();
  if (cached && !isCachedAccessTokenExpired()) {
    return cached;
  }

  try {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.access_token) {
      return sess.session.access_token;
    }
  } catch {
    /* fall through */
  }

  if (cached && !isCachedAccessTokenExpired()) {
    return cached;
  }

  return null;
}
