/**
 * Commercial (Manpower / Training) PO At Glance profile.
 * Own records and sign-off assignment (cm_oc_* tables, migration 20261116120000), Commercial access,
 * the Commercial OC format's sign-off boxes (IFSPL/C&B/06) and its Word layout.
 * Fully independent of IEV, Maintenance, Projects and R&M PO At Glance.
 */
import {
  ROLES, normalizeAppRole, parseAllowedSubModules, userCanApproveInModules, userCanEditInModules,
} from "../../../config/roles";

const MODULE_KEYS = ["commercialMt", "sales"];
export const CM_PO_AT_GLANCE_SUBMODULE_KEY = "commercialMt.po-at-glance";
const SUB_MODULE_KEYS = [CM_PO_AT_GLANCE_SUBMODULE_KEY];

export const CM_OC_COMPANY_NAME = "INDUS FIRE SAFETY PVT. LTD.";
export const CM_OC_DOC_REF = "IFSPL/C&B/06, R-0, Eff. Dt.:01.06.2022";
export const CM_OC_FORM_TITLE = "ORDER CONFIRMATION";
export const CM_OC_SIGNOFF_HEADING = "WO/PO disseminated to concerned departments";
export const CM_OC_APPROVAL_HEADING = "Approval workflow";

/** PO categories; each one picks its approval workflow (cm_oc_category_stages). */
export const CM_PO_CATEGORIES = [
  { value: "FIRE", label: "Fire" },
  { value: "SAFETY", label: "Safety" },
  { value: "FT_RENTAL", label: "FT on Rental" },
  { value: "FT_CREW_RENTAL", label: "FT with Crew on Rental" },
  { value: "TRAINING", label: "Training" },
];
export const cmCategoryLabel = (v) => CM_PO_CATEGORIES.find((c) => c.value === v)?.label || "";

/** Every approval stage. CREATOR is signed by the person who created the OC; the rest by their assignee. */
export const CM_OC_STAGES = [
  { slot: "CREATOR", label: "OC Creator" },
  { slot: "COMMERCIAL_MANAGER", label: "Commercial Manager" },
  { slot: "FINANCE", label: "Finance / Accounts" },
  { slot: "BILLING_IR_SALARY", label: "Billing / IR / Salary" },
  { slot: "HR_OPERATIONS", label: "HR / Operations" },
  { slot: "SAFETY_HEAD", label: "Safety Head" },
  { slot: "TRAINING_MANAGER", label: "Manager – Training" },
];
const STAGE = Object.fromEntries(CM_OC_STAGES.map((s) => [s.slot, s]));
const BASE_STAGES = ["CREATOR", "COMMERCIAL_MANAGER", "FINANCE", "BILLING_IR_SALARY"];
const CATEGORY_STAGES = {
  FIRE: [...BASE_STAGES, "HR_OPERATIONS"],
  SAFETY: [...BASE_STAGES, "SAFETY_HEAD"],
  FT_RENTAL: BASE_STAGES,
  FT_CREW_RENTAL: [...BASE_STAGES, "HR_OPERATIONS"],
  TRAINING: [...BASE_STAGES, "TRAINING_MANAGER"],
};

/** Ordered stages for a PO category (mirrors cm_oc_category_stages); [] when no category is chosen. */
export function cmCategoryStages(category) {
  return (CATEGORY_STAGES[category] || []).map((slot) => STAGE[slot]);
}

/** Boxes of the earlier Commercial format, shown read-only on records signed before categories existed. */
export const CM_OC_APPROVER_SLOT = { slot: "VP_COMMERCIAL", label: "VP – Commercial Operations" };
export const CM_OC_DISSEMINATION_SLOTS = [
  { slot: "BILLING", label: "Billing Department" },
  { slot: "IR", label: "IR Department" },
  { slot: "SALARY", label: "Salary Department" },
  { slot: "OPERATIONS", label: "Operations Department" },
  { slot: "ADMIN", label: "Admin Department" },
  { slot: "PNC", label: "P & C Department" },
  { slot: "ACCOUNTS", label: "Account Department" },
  { slot: "ARUN", label: "Arun Sir" },
  { slot: "ATIN", label: "Atin Sir" },
];

export const CM_OC_LEGACY_SLOTS = [CM_OC_APPROVER_SLOT, ...CM_OC_DISSEMINATION_SLOTS];

/** All boxes a record can carry: the approval stages, then the legacy boxes. */
export const CM_OC_SIGNOFF_SLOTS = [...CM_OC_STAGES, ...CM_OC_LEGACY_SLOTS];

const roleOf = (userProfile) => (userProfile?.role ? normalizeAppRole(userProfile.role) : null);
const hasSubModule = (userProfile) =>
  parseAllowedSubModules(userProfile?.allowed_sub_modules).some((k) => SUB_MODULE_KEYS.includes(k));

/** Create / edit / sign: Commercial editors, or PO At Glance sub-item holders (same rule as IEV). */
export function cmOcCanEdit(userProfile, accessibleModules) {
  if (userCanEditInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  const role = roleOf(userProfile);
  return hasSubModule(userProfile) && (!role || [ROLES.ADMIN, ROLES.MANAGER, ROLES.EXECUTIVE].includes(role));
}

/** Delete: Commercial approvers, or managers / admins with the sub-item. */
export function cmOcCanDelete(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

/** Change the sign-off assignment: Super Admins and Commercial managers / admins (mirrors cm_oc_current_user_can_configure). */
export function cmOcCanConfigure(userProfile, accessibleModules) {
  if (userCanApproveInModules(userProfile, accessibleModules, MODULE_KEYS)) return true;
  return hasSubModule(userProfile) && [ROLES.ADMIN, ROLES.MANAGER].includes(roleOf(userProfile));
}

/**
 * Profile object in the shape the generic PO At Glance helpers accept (ocApi: friendlyOcError,
 * loadSignoffAssignees, saveSignoffAssignee, listEmployeeOptions, deleteOc, notifyOcSignoff and
 * OcSignoffAssignmentPanel). Those helpers only read this object; they are not changed.
 */
export const COMMERCIAL_OC_DEPARTMENT = {
  key: "commercial",
  companyName: CM_OC_COMPANY_NAME,
  docRef: CM_OC_DOC_REF,
  formTitle: CM_OC_FORM_TITLE,
  listSubtitle: "Order confirmation for Commercial (Manpower / Training) work orders and purchase orders.",
  /** Stages shown on Sign-off Assignment; CREATOR is the OC creator's own signature and is not assigned. */
  slots: CM_OC_STAGES,
  autoCreatorSlot: "CREATOR",
  assigneeCount: "assigned",
  tables: {
    master: "cm_oc_master",
    contacts: "cm_oc_contacts",
    signoff: "cm_oc_signoff",
    assignees: "cm_oc_signoff_assignees",
  },
  rpc: { save: "cm_oc_save", employeeOptions: "cm_oc_employee_options" },
  notifyPath: "/api/commercial/oc/signoff-notify",
  /** Events emailed in the PO's own email thread (server/ocSignoffNotifyApi.js OC_NOTIFY_PROFILES). */
  /** Revision = an amended customer PO (cm_oc_po_history). */
  mailEvents: ["created", "stage", "oc_number", "revision"],
  accessDeniedMessage: "You do not have access to Commercial PO At Glance.",
  canEdit: cmOcCanEdit,
  canDelete: cmOcCanDelete,
  /** Word export with every signed stage's own signature image, name, and signing date and time. */
  buildDocx: async (form) => {
    const [{ buildCmOcDocx }, { loadCmSignatureImages }] = await Promise.all([
      import("./cmWordExport"),
      import("./cmSignatureImages"),
    ]);
    return buildCmOcDocx(form, { signatures: await loadCmSignatureImages(form) });
  },
};
