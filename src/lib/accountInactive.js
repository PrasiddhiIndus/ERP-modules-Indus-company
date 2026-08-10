/** Shared inactive-account messaging — keep generic (not a wrong-password lookalike). */

export const ACCOUNT_INACTIVE_MESSAGE =
  'Your account is inactive. Contact your administrator.';

export const ACCOUNT_INACTIVE_CODE = 'account_inactive';

export function isAccountInactiveCode(code) {
  return String(code || '').trim().toLowerCase() === ACCOUNT_INACTIVE_CODE;
}

/** GoTrue / ban responses after profiles.is_active sync sets auth.users.banned_until. */
export function isAuthBannedError(error) {
  const msg = String(error?.message || error?.error_description || error || '')
    .trim()
    .toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('banned') ||
    msg.includes('user is banned') ||
    msg.includes('account is inactive') ||
    // GoTrue often surfaces banned users as this opaque schema error instead of "banned".
    msg.includes('database error querying schema') ||
    isAccountInactiveCode(error?.code)
  );
}

export function accountInactiveError(extra = {}) {
  return {
    message: ACCOUNT_INACTIVE_MESSAGE,
    code: ACCOUNT_INACTIVE_CODE,
    ...extra,
  };
}
