import { normalizeAppRole, ROLES } from "../../../config/roles";

const ADMIN_ROLES = new Set([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO]);

/** Rules Console: Admin / Super Admin roles that also have the Admin module. */
export function canAccessRulesConsole(profile, accessibleModules) {
  const role = normalizeAppRole(profile?.role);
  return ADMIN_ROLES.has(role) && Boolean(accessibleModules?.has("admin"));
}
