import {
  FIRE_TENDER_APPROVER_MODULE_KEYS, ROLES, normalizeAppRole, parseAllowedSubModules, userCanApproveInModules,
  userCanEditInModules,
} from "../../../config/roles";

/** IEV sub-items (User Management) that include PO At Glance without the whole IEV module. */
const OC_SUB_MODULE_KEYS = ["fireTender.costing", "fireTender.dashboard"];

export function hasOcSubModuleAccess(userProfile) {
  return parseAllowedSubModules(userProfile?.allowed_sub_modules).some((k) => OC_SUB_MODULE_KEYS.includes(k));
}

/** Create / edit / sign PO At Glance entries: IEV module editors, or IEV Costing / Dashboard sub-item holders. */
export function ocCanEdit(userProfile, accessibleModules) {
  if (userCanEditInModules(userProfile, accessibleModules, FIRE_TENDER_APPROVER_MODULE_KEYS)) return true;
  const role = userProfile?.role ? normalizeAppRole(userProfile.role) : null;
  return hasOcSubModuleAccess(userProfile) && (!role || [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE].includes(role));
}

/** Delete PO At Glance entries: IEV approvers, or managers / admins with the IEV Costing / Dashboard sub-item. */
export function ocCanDelete(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, FIRE_TENDER_APPROVER_MODULE_KEYS)) return true;
  const role = userProfile?.role ? normalizeAppRole(userProfile.role) : null;
  return hasOcSubModuleAccess(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(role);
}
