/**
 * PO At Glance department profile. The PO At Glance screens, API calls and sign-off flow are shared;
 * a profile supplies what differs per department: its tables and functions (own records and sign-off
 * assignment), sign-off boxes, header text, access rules and the document (Word) format.
 * IEV is the default everywhere, so screens that pass no profile behave exactly as before.
 */
import { ocCanDelete, ocCanEdit } from "./ocAccess";
import { OC_COMPANY_NAME, OC_DOC_REF, OC_FORM_TITLE, SIGNOFF_SLOTS } from "./ocModel";

export const IEV_OC_DEPARTMENT = {
  key: "iev",
  companyName: OC_COMPANY_NAME,
  docRef: OC_DOC_REF,
  formTitle: OC_FORM_TITLE,
  listSubtitle: "Order confirmation for IEV work orders and purchase orders.",
  slots: SIGNOFF_SLOTS,
  assigneeCount: "four",
  tables: {
    master: "oc_master",
    security: "oc_security_items",
    conditions: "oc_fixed_conditions",
    penalty: "oc_penalty",
    milestones: "oc_payment_milestones",
    contacts: "oc_contacts",
    signoff: "oc_signoff",
    assignees: "oc_signoff_assignees",
  },
  rpc: { save: "oc_save", employeeOptions: "oc_employee_options" },
  notifyPath: "/api/fire-tender/oc/signoff-notify",
  accessDeniedMessage: "You do not have access to IEV PO At Glance.",
  canEdit: ocCanEdit,
  canDelete: ocCanDelete,
  buildDocx: (form) => import("./ocWordExport").then((m) => m.buildOcDocx(form)),
};
