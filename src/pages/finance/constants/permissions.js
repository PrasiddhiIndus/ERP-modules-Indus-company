import {
  FINANCE_ADMIN_MODULE_KEYS,
  ROLES,
  userCanApproveInModules,
  userCanEditInModules,
} from "../../../config/roles";

/** Finance Admin — full masters, budget approval, import/export. */
export function isFinanceAdmin(userProfile, accessibleModules) {
  const role = userProfile?.role;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return true;
  if (role === ROLES.ADMIN && accessibleModules?.has("finance")) return true;
  return userCanApproveInModules(userProfile, accessibleModules, FINANCE_ADMIN_MODULE_KEYS);
}

/** Management — view portfolio, approve budgets; no master deletes unless admin. */
export function isFinanceManagement(userProfile, accessibleModules) {
  if (isFinanceAdmin(userProfile, accessibleModules)) return true;
  return userCanEditInModules(userProfile, accessibleModules, FINANCE_ADMIN_MODULE_KEYS);
}

/** Site manager — edit entries for assigned sites only. */
export function canEditSite(userProfile, accessibleModules, siteId, userSiteAccess = []) {
  if (isFinanceAdmin(userProfile, accessibleModules)) return true;
  return userSiteAccess.some(
    (a) => a.site_id === siteId && ["edit", "view"].includes(a.access_level),
  );
}

export function canEditMasters(userProfile, accessibleModules) {
  return isFinanceAdmin(userProfile, accessibleModules);
}

export function canApproveBudget(userProfile, accessibleModules) {
  return isFinanceAdmin(userProfile, accessibleModules);
}

export function canImportExport(userProfile, accessibleModules) {
  return isFinanceAdmin(userProfile, accessibleModules);
}
