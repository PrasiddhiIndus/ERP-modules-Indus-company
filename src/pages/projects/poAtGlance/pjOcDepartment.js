/**
 * Projects PO At Glance profile for the shared PO At Glance screens (src/pages/projects/oc).
 * Own records and sign-off assignment (pj_oc_* tables, migration 20261102150000), Projects access,
 * the Projects format's four sign-off boxes and its Word layout.
 */
import {
  ROLES, normalizeAppRole, parseAllowedSubModules, userCanApproveInModules, userCanEditInModules,
} from "../../../config/roles";
import { OC_COMPANY_NAME, OC_FORM_TITLE } from "../oc/ocModel";

const MODULE_KEYS = ["projects"];
const SUB_MODULE_KEYS = ["projects.po-at-glance"];

export const PJ_OC_SIGNOFF_SLOTS = [
  { slot: "PROJECT_USER", label: "User (Project Dept.)" },
  { slot: "PLANNING", label: "Planning Department" },
  { slot: "VERTICAL_HEAD", label: "Vertical Head" },
  { slot: "FINANCE", label: "Finance Department" },
];

export const PJ_OC_DOC_REF = "IFSPL/PJT-OC/F&A/002, R-0, Eff. Dt.:01/05/2025";

const roleOf = (userProfile) => (userProfile?.role ? normalizeAppRole(userProfile.role) : null);
const hasSubModule = (userProfile) =>
  parseAllowedSubModules(userProfile?.allowed_sub_modules).some((k) => SUB_MODULE_KEYS.includes(k));

/** Create / edit / sign: Projects editors, or PO At Glance sub-item holders (same rule as IEV). */
export function pjOcCanEdit(userProfile, accessibleModules) {
  if (userCanEditInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  const role = roleOf(userProfile);
  return hasSubModule(userProfile) && (!role || [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE].includes(role));
}

/** Delete: Projects approvers, or managers / admins with the sub-item. */
export function pjOcCanDelete(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

/** Change the sign-off assignment: Super Admins and Projects managers / admins (mirrors pj_oc_current_user_can_configure). */
export function pjOcCanConfigure(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

export const PROJECTS_OC_DEPARTMENT = {
  key: "projects",
  companyName: OC_COMPANY_NAME,
  docRef: PJ_OC_DOC_REF,
  formTitle: OC_FORM_TITLE,
  listSubtitle: "Order confirmation for Projects work orders and purchase orders.",
  slots: PJ_OC_SIGNOFF_SLOTS,
  assigneeCount: "four",
  tables: {
    master: "pj_oc_master",
    security: "pj_oc_security_items",
    conditions: "pj_oc_fixed_conditions",
    penalty: "pj_oc_penalty",
    milestones: "pj_oc_payment_milestones",
    contacts: "pj_oc_contacts",
    signoff: "pj_oc_signoff",
    assignees: "pj_oc_signoff_assignees",
  },
  rpc: { save: "pj_oc_save", employeeOptions: "pj_oc_employee_options" },
  notifyPath: "/api/projects/oc/signoff-notify",
  accessDeniedMessage: "You do not have access to Projects PO At Glance.",
  canEdit: pjOcCanEdit,
  canDelete: pjOcCanDelete,
  buildDocx: (form) => import("./pjWordExport").then((m) => m.buildPjOcDocx(form)),
};
