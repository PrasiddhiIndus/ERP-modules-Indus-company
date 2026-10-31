/**
 * Maintenance (M&M) PO At Glance profile for the shared PO At Glance screens (src/pages/projects/oc).
 * Own records and sign-off assignment (mm_oc_* tables, migration 20261031120000), Maintenance access,
 * the M&M format's three sign-off boxes and its Word layout (IFSPL/M&M-OC/F&A/004).
 */
import {
  ROLES, normalizeAppRole, parseAllowedSubModules, userCanApproveInModules, userCanEditInModules,
} from "../../../config/roles";
import { OC_COMPANY_NAME, OC_FORM_TITLE } from "../../projects/oc/ocModel";

const MODULE_KEYS = ["maintenance"];
const SUB_MODULE_KEYS = ["maintenance.po-at-glance", "maintenance.dashboard"];

export const MM_OC_SIGNOFF_SLOTS = [
  { slot: "MM_USER", label: "User (M&M Dept.)" },
  { slot: "VERTICAL_HEAD", label: "Vertical Head" },
  { slot: "FINANCE", label: "Finance Department" },
];

export const MM_OC_DOC_REF = "IFSPL/M&M-OC/F&A/004, R-0, Eff. Dt.:01/05/2025";

const roleOf = (userProfile) => (userProfile?.role ? normalizeAppRole(userProfile.role) : null);
const hasSubModule = (userProfile) =>
  parseAllowedSubModules(userProfile?.allowed_sub_modules).some((k) => SUB_MODULE_KEYS.includes(k));

/** Create / edit / sign: Maintenance editors, or PO At Glance / Dashboard sub-item holders (same rule as IEV). */
export function mmOcCanEdit(userProfile, accessibleModules) {
  if (userCanEditInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  const role = roleOf(userProfile);
  return hasSubModule(userProfile) && (!role || [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE].includes(role));
}

/** Delete: Maintenance approvers, or managers / admins with the sub-item. */
export function mmOcCanDelete(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

/** Change the sign-off assignment: Super Admins and Maintenance managers / admins (mirrors mm_oc_current_user_can_configure). */
export function mmOcCanConfigure(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

export const MAINTENANCE_OC_DEPARTMENT = {
  key: "maintenance",
  companyName: OC_COMPANY_NAME,
  docRef: MM_OC_DOC_REF,
  formTitle: OC_FORM_TITLE,
  listSubtitle: "Order confirmation for Maintenance (M&M) work orders and purchase orders.",
  slots: MM_OC_SIGNOFF_SLOTS,
  assigneeCount: "three",
  tables: {
    master: "mm_oc_master",
    security: "mm_oc_security_items",
    conditions: "mm_oc_fixed_conditions",
    penalty: "mm_oc_penalty",
    milestones: "mm_oc_payment_milestones",
    contacts: "mm_oc_contacts",
    signoff: "mm_oc_signoff",
    assignees: "mm_oc_signoff_assignees",
  },
  rpc: { save: "mm_oc_save", employeeOptions: "mm_oc_employee_options" },
  notifyPath: "/api/maintenance/oc/signoff-notify",
  accessDeniedMessage: "You do not have access to Maintenance PO At Glance.",
  canEdit: mmOcCanEdit,
  canDelete: mmOcCanDelete,
  buildDocx: (form) => import("./mmWordExport").then((m) => m.buildMmOcDocx(form)),
};
