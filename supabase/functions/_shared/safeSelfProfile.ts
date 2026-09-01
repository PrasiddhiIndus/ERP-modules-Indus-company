/** Browser / Auth metadata must never grant role, modules, team, or employee_code. */

export const SAFE_SELF_SIGNUP_ROLE = 'executive'

export function displayNameFromAuthMeta(
  meta: Record<string, unknown> | null | undefined,
  email: string | null | undefined,
) {
  const m = meta || {}
  const fromMeta =
    (typeof m.full_name === 'string' && m.full_name.trim()) ||
    (typeof m.username === 'string' && m.username.trim()) ||
    ''
  return fromMeta || email?.split('@')[0] || 'user'
}

export function authMetadataHasPrivilegeKeys(meta: Record<string, unknown> | null | undefined) {
  const m = meta || {}
  return Boolean(
    m.role ||
      m.team ||
      m.employee_code ||
      m.emp_code ||
      m.module_access_pending ||
      (Array.isArray(m.allowed_modules) && m.allowed_modules.length) ||
      (Array.isArray(m.allowed_sub_modules) && m.allowed_sub_modules.length),
  )
}

export function nameOnlyUserMetadata(
  meta: Record<string, unknown> | null | undefined,
  email: string | null | undefined,
) {
  const username = displayNameFromAuthMeta(meta, email)
  return {
    full_name: username,
    username,
  }
}

export function safeSelfSignupProfile(
  userId: string,
  email: string | null | undefined,
  meta: Record<string, unknown> | null | undefined = {},
) {
  return {
    id: userId,
    email: email ?? null,
    username: displayNameFromAuthMeta(meta, email),
    team: null,
    role: SAFE_SELF_SIGNUP_ROLE,
    allowed_modules: [] as string[],
    allowed_sub_modules: [] as string[],
    module_access_pending: true,
    // employee_code is never taken from Auth metadata (payslip identity).
  }
}
