import { ROLES, normalizeAppRole } from "../../../config/roles";
import { normalizeAccessEmail, resolveUserEmail } from "../salaryAdmin/salaryAccess";

/** Only this email (plus super admins) may manually edit leave balance ledger rows. */
export const LEAVE_BALANCE_EDITOR_EMAIL = "bency@indusfire.com";

export function canEditLeaveBalances(profile, user = null) {
  const role = normalizeAppRole(profile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return true;
  return normalizeAccessEmail(resolveUserEmail(profile, user)) === LEAVE_BALANCE_EDITOR_EMAIL;
}
