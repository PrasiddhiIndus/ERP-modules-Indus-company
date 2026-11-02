/**
 * R&M PO At Glance profile for the shared PO At Glance screens (src/pages/projects/oc).
 * Own records and sign-off assignment (rm_oc_* tables, migration 20261102190000), R&M access,
 * the R&M format's three sign-off boxes and its Word layout (IFSPL/R&M-OC/F&A/005).
 */
import {
  ROLES, normalizeAppRole, parseAllowedSubModules, userCanApproveInModules, userCanEditInModules,
} from "../../../config/roles";
import { OC_COMPANY_NAME, OC_FORM_TITLE } from "../../projects/oc/ocModel";

const MODULE_KEYS = ["commercialRm"];
const SUB_MODULE_KEYS = ["commercialRm.po-at-glance"];

export const RM_OC_SIGNOFF_SLOTS = [
  { slot: "RM_USER", label: "User (R&M Dept.)" },
  { slot: "VERTICAL_HEAD", label: "Vertical Head" },
  { slot: "FINANCE", label: "Finance Department" },
];

export const RM_OC_DOC_REF = "IFSPL/R&M-OC/F&A/005, R-0, Eff. Dt.:01/05/2025";

const roleOf = (userProfile) => (userProfile?.role ? normalizeAppRole(userProfile.role) : null);
const hasSubModule = (userProfile) =>
  parseAllowedSubModules(userProfile?.allowed_sub_modules).some((k) => SUB_MODULE_KEYS.includes(k));

/** Create / edit / sign: R&M editors, or PO At Glance sub-item holders (same rule as IEV). */
export function rmOcCanEdit(userProfile, accessibleModules) {
  if (userCanEditInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  const role = roleOf(userProfile);
  return hasSubModule(userProfile) && (!role || [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE].includes(role));
}

/** Delete: R&M approvers, or managers / admins with the sub-item. */
export function rmOcCanDelete(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

/** Change the sign-off assignment: Super Admins and R&M managers / admins (mirrors rm_oc_current_user_can_configure). */
export function rmOcCanConfigure(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

export const RM_OC_DEPARTMENT = {
  key: "rm",
  companyName: OC_COMPANY_NAME,
  docRef: RM_OC_DOC_REF,
  formTitle: OC_FORM_TITLE,
  listSubtitle: "Order confirmation for R&M work orders and purchase orders.",
  slots: RM_OC_SIGNOFF_SLOTS,
  assigneeCount: "three",
  tables: {
    master: "rm_oc_master",
    security: "rm_oc_security_items",
    conditions: "rm_oc_fixed_conditions",
    penalty: "rm_oc_penalty",
    milestones: "rm_oc_payment_milestones",
    contacts: "rm_oc_contacts",
    signoff: "rm_oc_signoff",
    assignees: "rm_oc_signoff_assignees",
  },
  rpc: { save: "rm_oc_save", employeeOptions: "rm_oc_employee_options" },
  notifyPath: "/api/rm/oc/signoff-notify",
  accessDeniedMessage: "You do not have access to R&M PO At Glance.",
  canEdit: rmOcCanEdit,
  canDelete: rmOcCanDelete,
  buildDocx: (form) => import("./rmWordExport").then((m) => m.buildRmOcDocx(form)),
};
