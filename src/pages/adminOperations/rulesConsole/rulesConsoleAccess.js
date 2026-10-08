import { getEffectiveAllowedSubModules, normalizeAppRole, ROLES, RULES_CONSOLE_SUBMODULE_KEY } from "../../../config/roles";

const ADMIN_ROLES = new Set([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO]);

/**
 * Rules Console: Admin / Super Admin roles that also have the Admin module, or anyone given the
 * Rules Console page in User Management.
 */
export function canAccessRulesConsole(profile, accessibleModules) {
  if (getEffectiveAllowedSubModules(profile).includes(RULES_CONSOLE_SUBMODULE_KEY)) return true;
  const role = normalizeAppRole(profile?.role);
  return ADMIN_ROLES.has(role) && Boolean(accessibleModules?.has("admin"));
}
