/**
 * Who may read/write a department's data — one definition shared by the API server,
 * the RLS permission-comparison script and the unit tests.
 *
 * MUST stay in step with SQL `public.erp_current_user_has_data_scope(...)` and its wrappers
 * (supabase/migrations/20261117120000_secure_projects_quotations_rm_enquiries_rls.sql).
 *
 * A profile is "in scope" when any of these is true:
 *   - role is Super Admin / Super Admin Pro / Admin (HOD is an Admin alias) — Admin keeps its existing
 *     all-module data access (same as SQL `current_user_can_access_module`);
 *   - profile `team` (Employee Master department label or module key) is one of `teams`;
 *   - `allowed_modules` contains one of `modules`;
 *   - any `allowed_sub_modules` entry starts with one of `modules` (e.g. "projects.quotation-master").
 * Inactive profiles (`is_active = false`) are never in scope.
 *
 * `modules` / `teams` are lower-case. They mirror src/config/roles.js:
 *   MODULE_PATH_PREFIXES, TEAM_VALUE_ALIASES and DEPARTMENT_TO_MODULE_KEY. The legacy `sales` module owns
 *   every /app/commercial route in the UI, so it is kept in both Commercial scopes.
 */

export const ERP_DATA_SCOPES = Object.freeze({
  projects: Object.freeze({
    modules: ['projects'],
    teams: ['projects'],
  }),
  commercialRm: Object.freeze({
    modules: ['commercialrm', 'sales'],
    teams: ['r&m', 'commercialrm', 'sales'],
  }),
  commercialMt: Object.freeze({
    modules: ['commercialmt', 'commercial', 'sales'],
    teams: ['commercial', 'commercialmt', 'sales'],
  }),
  maintenance: Object.freeze({
    modules: ['maintenance'],
    teams: ['maintenance', 'maintenance-ftc'],
  }),
  fireTender: Object.freeze({
    modules: ['firetender', 'production'],
    teams: [
      'firetender',
      'production',
      'fire tender',
      'administration-ftc',
      'projects-ftc',
      'production-ftc',
      'emergency response team-ftc',
    ],
  }),
  finance: Object.freeze({
    modules: ['finance'],
    teams: ['finance', 'finance/accounts'],
  }),
});

/** PO At Glance department (ocSignoffNotifyApi profile key) → data scope. */
export const OC_DEPARTMENT_SCOPE = Object.freeze({
  iev: 'fireTender',
  maintenance: 'maintenance',
  projects: 'projects',
  rm: 'commercialRm',
  commercial: 'commercialMt',
});

const FULL_ACCESS_ROLES = new Set(['super_admin', 'super_admin_pro', 'admin']);

/** Same as SQL public.normalize_erp_role. */
export function normalizeScopeRole(raw) {
  const r = String(raw ?? '').trim().toLowerCase().replace(/ /g, '_');
  if (r === 'hod' || r === 'admin') return 'admin';
  if (r === 'superadmin' || r === 'super_admin') return 'super_admin';
  if (r === 'superadmin_pro' || r === 'super_admin_pro') return 'super_admin_pro';
  return r;
}

/** Same as SQL: lower, trim, collapse whitespace. */
export function normalizeScopeTeam(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** jsonb array only (SQL ignores anything that is not a JSON array). */
function jsonArrayValues(raw) {
  return Array.isArray(raw) ? raw.map((v) => String(v ?? '')) : [];
}

export function isFullDataAccessRole(role) {
  return FULL_ACCESS_ROLES.has(normalizeScopeRole(role));
}

/**
 * @param {object|null} profile public.profiles row
 * @param {keyof typeof ERP_DATA_SCOPES} scopeKey
 */
export function profileHasDataScope(profile, scopeKey) {
  const scope = ERP_DATA_SCOPES[scopeKey];
  if (!scope || !profile || typeof profile !== 'object') return false;
  if (profile.is_active === false) return false;
  if (isFullDataAccessRole(profile.role)) return true;
  if (scope.teams.includes(normalizeScopeTeam(profile.team))) return true;
  if (jsonArrayValues(profile.allowed_modules).some((m) => scope.modules.includes(m.trim().toLowerCase()))) {
    return true;
  }
  return jsonArrayValues(profile.allowed_sub_modules).some((s) =>
    scope.modules.includes(s.split('.')[0].trim().toLowerCase())
  );
}
