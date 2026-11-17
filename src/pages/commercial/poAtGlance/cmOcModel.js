/**
 * Commercial PO At Glance — form model shared by the screen and the Word export, laid out to the
 * Commercial OC format (IFSPL/C&B/06): empty form, record ↔ form mapping, validation, export file name.
 * Independent of the IEV model (src/pages/projects/oc/ocModel.js); only pure display helpers are shared.
 */
import { CM_OC_SIGNOFF_SLOTS } from "./cmOcDepartment";

export { formatIndianAmount, formatOcDate, formatSignedAt, contractValueInWords } from "../../projects/oc/ocModel";

export const CM_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

/** Manpower / vehicle deployment grid, in the format's column order. */
export const CM_MANPOWER_FIELDS = [
  { key: "fs_count", label: "FS" },
  { key: "dcpo_count", label: "DCPO" },
  { key: "fcro_count", label: "FCRO" },
  { key: "fireman_count", label: "Fireman" },
  { key: "safety_supervisor_count", label: "Safety Supervisor" },
  { key: "safety_steward_count", label: "Safety Stewards" },
  { key: "vehicle_count", label: "Vehicle" },
];

/** Default contact rows printed on the format. */
export const CM_DEFAULT_CONTACT_DEPARTMENTS = ["User", "CEO", "HR", "Procurement"];

let rowKey = 0;
const nextKey = () => `c${Date.now().toString(36)}${(rowKey += 1)}`;

export const blankCmContact = (department = "") => ({ key: nextKey(), department, names: "", mobiles: "", emails: "" });

/** Extra deployment line beyond the fixed FS / DCPO / … / Vehicle columns. */
export const blankCmDeploymentItem = (label = "") => ({ key: nextKey(), label, count: "" });

export function normalizeCmExtraDeployment(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => ({
    key: nextKey(),
    label: item?.label == null ? "" : String(item.label),
    count: item?.count === null || item?.count === undefined || item?.count === "" ? "" : String(item.count),
  }));
}

const blankSign = () => ({ signed_by: "", saved_by: "", signed_at: "", signed_user_id: "" });

export function emptyCmForm(slots = CM_OC_SIGNOFF_SLOTS) {
  return {
    id: null,
    cost_center_tally: "",
    oc_no: "",
    oc_date: "",
    client_name: "",
    client_address: "",
    is_sez: null,
    po_wo_no: "",
    po_date: "",
    po_category: "",
    customer_po_no: "",
    customer_po_date: "",
    customer_po_notes: "",
    wo_documents: [],
    project_description: "",
    duration_text: "",
    duration_from: "",
    duration_to: "",
    mobilization_date: "",
    payment_terms: "",
    gst_pct: "",
    gst_applicable: null,
    contract_value: "",
    currency: "INR",
    ...Object.fromEntries(CM_MANPOWER_FIELDS.map(({ key }) => [key, ""])),
    extra_deployment: [],
    insurance: "",
    minimum_wage_rate: "",
    relievers_scope: "",
    duty_pattern: "",
    accommodation_transport: "",
    sd_ra_applicable: null,
    sd_ra_pct: "",
    sd_release_period: "",
    sd_pbg: "",
    emd_details: "",
    contacts: CM_DEFAULT_CONTACT_DEPARTMENTS.map((d) => blankCmContact(d)),
    remarks: "",
    created_by: null,
    updated_at: null,
    signoff: Object.fromEntries(slots.map(({ slot }) => [slot, blankSign()])),
  };
}

const str = (v) => (v === null || v === undefined ? "" : String(v));
const num = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

const TEXT_FIELDS = [
  "cost_center_tally", "oc_no", "oc_date", "client_name", "client_address", "po_wo_no", "po_date", "po_category",
  "customer_po_no", "customer_po_date", "customer_po_notes", "project_description",
  "duration_text", "duration_from", "duration_to", "mobilization_date", "payment_terms", "insurance", "minimum_wage_rate",
  "relievers_scope", "duty_pattern", "accommodation_transport", "sd_release_period", "sd_pbg", "emd_details", "remarks",
];
const NUMBER_FIELDS = ["gst_pct", "contract_value", "sd_ra_pct", ...CM_MANPOWER_FIELDS.map((f) => f.key)];
const BOOL_FIELDS = ["is_sez", "gst_applicable", "sd_ra_applicable"];

/** Work order attachments from the master row: [{ name, path, uploaded_at }]. */
export function normalizeWoDocuments(masterOrDocs) {
  const raw = Array.isArray(masterOrDocs)
    ? masterOrDocs
    : Array.isArray(masterOrDocs?.wo_documents)
      ? masterOrDocs.wo_documents
      : [];
  return raw
    .filter((d) => d && String(d.path || "").trim())
    .map((d) => ({
      name: String(d.name || "Work order").trim() || "Work order",
      path: String(d.path).trim(),
      uploaded_at: d.uploaded_at || null,
    }));
}

/** Builds form state from the saved rows (see cmOcApi.loadCmOc). */
export function cmFormFromRecord({ master, contacts = [], signoff = [] }, slots = CM_OC_SIGNOFF_SLOTS) {
  const form = emptyCmForm(slots);
  form.id = master.id;
  for (const k of TEXT_FIELDS) form[k] = str(master[k]);
  for (const k of NUMBER_FIELDS) form[k] = num(master[k]);
  for (const k of BOOL_FIELDS) form[k] = master[k] ?? null;
  form.currency = master.currency || "INR";
  form.created_by = master.created_by || null;
  form.updated_at = master.updated_at || null;
  form.wo_documents = normalizeWoDocuments(master);
  form.extra_deployment = normalizeCmExtraDeployment(master.extra_deployment);
  form.contacts = [...contacts].sort((a, b) => a.seq - b.seq).map((c) => ({
    key: nextKey(), department: str(c.department), names: str(c.names),
    mobiles: (c.mobiles || []).join(", "), emails: (c.emails || []).join(", "),
  }));
  for (const s of signoff) {
    if (form.signoff[s.slot]) {
      form.signoff[s.slot] = {
        signed_by: str(s.signed_by),
        saved_by: str(s.signed_by),
        signed_at: str(s.signed_at),
        signed_user_id: str(s.signed_user_id),
      };
    }
  }
  return form;
}

/** Splits "a, b\nc" into ["a","b","c"]. */
export function splitList(text) {
  return String(text || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

export const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
export const cmContactBlank = (c) => isBlank(c.names) && isBlank(c.mobiles) && isBlank(c.emails);
const numOrNull = (v) => (isBlank(v) ? null : Number(v));
const textOrNull = (v) => (isBlank(v) ? null : String(v).trim());

/**
 * Payload for public.cm_oc_save(p jsonb). Contact rows with only a department label are dropped.
 * Sign-offs are not part of it: each approval stage is signed with cm_oc_sign_stage.
 */
export function toCmSavePayload(form) {
  const sdOn = form.sd_ra_applicable === true;
  return {
    id: form.id || null,
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, textOrNull(form[k])])),
    ...Object.fromEntries(NUMBER_FIELDS.map((k) => [k, numOrNull(form[k])])),
    ...Object.fromEntries(BOOL_FIELDS.map((k) => [k, form[k]])),
    sd_ra_pct: sdOn ? numOrNull(form.sd_ra_pct) : null,
    sd_release_period: sdOn ? textOrNull(form.sd_release_period) : null,
    currency: form.currency || "INR",
    extra_deployment: (form.extra_deployment || [])
      .filter((r) => !isBlank(r.label) || !isBlank(r.count))
      .map((r) => ({ label: textOrNull(r.label), count: numOrNull(r.count) })),
    contacts: form.contacts.filter((c) => !cmContactBlank(c)).map((c) => ({
      department: textOrNull(c.department), names: textOrNull(c.names), mobiles: splitList(c.mobiles), emails: splitList(c.emails),
    })),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[\d\s-]{7,16}$/;
const pctOk = (v) => isBlank(v) || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
const intOk = (v) => isBlank(v) || (Number.isInteger(Number(v)) && Number(v) >= 0);

/** Returns { field-path: message }; empty object when the form can be saved. */
export function validateCmForm(form) {
  const e = {};
  if (!isBlank(form.oc_no) && String(form.oc_no).trim().length > 80) e.oc_no = "OC No. must be 80 characters or fewer.";
  if (isBlank(form.po_category)) e.po_category = "Choose the PO category.";
  if (isBlank(form.client_name)) e.client_name = "Customer is required.";
  if (isBlank(form.po_wo_no)) e.po_wo_no = "WO No. is required.";
  if (isBlank(form.po_date)) e.po_date = "WO date is required.";
  if (isBlank(form.project_description)) e.project_description = "Description of work is required.";
  if (!isBlank(form.duration_from) && !isBlank(form.duration_to) && form.duration_to < form.duration_from) {
    e.duration_to = "\"To\" must be on or after \"From\".";
  }
  if (!pctOk(form.gst_pct)) e.gst_pct = "GST must be between 0 and 100.";
  if (!isBlank(form.contract_value) && (!Number.isFinite(Number(form.contract_value)) || Number(form.contract_value) < 0)) {
    e.contract_value = "Enter a valid amount.";
  }
  if (form.sd_ra_applicable === true && !pctOk(form.sd_ra_pct)) e.sd_ra_pct = "Must be between 0 and 100.";
  for (const { key } of CM_MANPOWER_FIELDS) {
    if (!intOk(form[key])) e[key] = "Whole numbers only.";
  }
  (form.extra_deployment || []).forEach((r, i) => {
    if (!isBlank(r.count) && !intOk(r.count)) e[`extra_deployment.${i}.count`] = "Whole numbers only.";
    if (!isBlank(r.count) && isBlank(r.label)) e[`extra_deployment.${i}.label`] = "Enter a role or vehicle name.";
  });
  form.contacts.forEach((c, i) => {
    if (splitList(c.mobiles).some((m) => !MOBILE_RE.test(m))) e[`contacts.${i}.mobiles`] = "Check the mobile numbers.";
    if (splitList(c.emails).some((m) => !EMAIL_RE.test(m))) e[`contacts.${i}.emails`] = "Check the e-mail addresses.";
  });
  return e;
}

/** OC_Commercial_<OC no>_<client short>_<yyyymmdd> (OC date, else today). */
export function cmExportFileName(form, today = new Date()) {
  const oc = String(form.oc_no || "draft").replace(/[^A-Za-z0-9-]+/g, "-");
  const client = String(form.client_name || "client")
    .split(/\s+/).filter(Boolean).slice(0, 3).join("_")
    .replace(/[^A-Za-z0-9_]+/g, "").slice(0, 24) || "client";
  const iso = form.oc_date || today.toISOString().slice(0, 10);
  return `OC_Commercial_${oc}_${client}_${iso.replace(/-/g, "")}`;
}

/** yyyy-mm-dd → dd.mm.yyyy, as the Commercial format prints dates. */
export function formatCmDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Days between From and To, inclusive (e.g. 13.09 → 14.09 = 2), or "" when either is missing. */
export function durationDays(from, to) {
  if (isBlank(from) || isBlank(to)) return "";
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "";
  const n = Math.round((b - a) / 86400000) + 1;
  return `${n} Day${n === 1 ? "" : "s"}`;
}

/**
 * Approval progress for a PO: { stages, signedCount, next, complete }.
 * `next` is the first unsigned stage — the only one that can be signed now.
 */
export function cmApprovalProgress(stages, signoff) {
  const signed = (slot) => !isBlank(signoff?.[slot]?.saved_by);
  const next = stages.find((s) => !signed(s.slot)) || null;
  return { stages, signedCount: stages.filter((s) => signed(s.slot)).length, next, complete: stages.length > 0 && !next };
}
