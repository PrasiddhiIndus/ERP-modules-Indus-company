/**
 * Departments shown on Finance → Master PO At Glance. Each key matches the `department` value returned
 * by finance_po_glance_list (migration 20261102140000). A new department = one entry here plus a branch
 * in the three finance_po_* functions.
 */
import { SIGNOFF_SLOTS } from "../../projects/oc/ocModel";
import { MM_OC_SIGNOFF_SLOTS } from "../../maintenance/poAtGlance/mmOcDepartment";
import { PJ_OC_SIGNOFF_SLOTS } from "../../projects/poAtGlance/pjOcDepartment";
import { RM_OC_SIGNOFF_SLOTS } from "../../commercial-rm-mm-amc-iev/poAtGlance/rmOcDepartment";

export const FINANCE_PO_DEPARTMENTS = [
  { key: "iev", label: "IEV", slots: SIGNOFF_SLOTS, badge: "bg-sky-50 text-sky-700 ring-sky-200" },
  { key: "maintenance", label: "Maintenance", slots: MM_OC_SIGNOFF_SLOTS, badge: "bg-violet-50 text-violet-700 ring-violet-200" },
  { key: "projects", label: "Projects", slots: PJ_OC_SIGNOFF_SLOTS, badge: "bg-teal-50 text-teal-700 ring-teal-200" },
  { key: "rm", label: "R&M", slots: RM_OC_SIGNOFF_SLOTS, badge: "bg-amber-50 text-amber-700 ring-amber-200" },
];

const BY_KEY = Object.fromEntries(FINANCE_PO_DEPARTMENTS.map((d) => [d.key, d]));

export function financePoDepartment(key) {
  return BY_KEY[key] || { key, label: key, slots: [], badge: "bg-slate-50 text-slate-700 ring-slate-200" };
}
