/** Browser / Auth metadata must never grant role, modules, team, or employee_code. */

export const SAFE_SELF_SIGNUP_ROLE = "executive";

export function displayNameFromAuthMeta(meta, email) {
  const m = meta || {};
  const fromMeta = String(m.username || m.full_name || "").trim();
  return fromMeta || String(email || "").split("@")[0] || "User";
}

/** Fields written when a profiles row is missing. User Management is the only grant path. */
export function safeSelfSignupProfileFields({ id, email, username } = {}) {
  const row = {
    email: email ?? null,
    username: String(username || displayNameFromAuthMeta({}, email)).trim() || "user",
    team: null,
    role: SAFE_SELF_SIGNUP_ROLE,
    allowed_modules: [],
    allowed_sub_modules: [],
    module_access_pending: true,
  };
  if (id) row.id = id;
  return row;
}
