/**
 * IEV PO At Glance — form model shared by the screen and the Word export:
 * labels, empty form, record ↔ form mapping, validation, amount in words, export file name.
 */
import { amountInWords } from "../../../lib/amountInWords";

export const OC_COMPANY_NAME = "INDUS FIRE SAFETY PVT. LTD.";
export const OC_DOC_REF = "IFSPL/IEV-OC/F&A/003 R-0, Eff. Dt.: 01/05/2025";
export const OC_FEATURE_NAME = "PO At Glance";
export const OC_FORM_TITLE = "PO AT GLANCE";
export const OC_SECURITY_HEADING = "Security items: choose from dropdown (SD Applicability / ABG / PBG)";
export const OC_CONTACTS_HEADING = "Customer's contact details";
export const OC_SIGNOFF_HEADING = "WO/PO disseminated to concerned departments";

export const SECURITY_TYPES = [
  { value: "SD", label: "SD Applicability" },
  { value: "ABG", label: "ABG" },
  { value: "PBG", label: "PBG" },
];
export const securityTypeLabel = (v) => SECURITY_TYPES.find((t) => t.value === v)?.label || "";

export const PERIOD_UNITS = [
  { value: "DAY", label: "day" },
  { value: "WEEK", label: "week" },
  { value: "MONTH", label: "month" },
];

export const SIGNOFF_SLOTS = [
  { slot: "SALES", label: "Sales & Commercial Department" },
  { slot: "PLANNING", label: "Planning Department" },
  { slot: "IEV_HEAD", label: "Group Head or IEV Head" },
  { slot: "FINANCE", label: "Finance Department" },
];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"];

let rowKey = 0;
const nextKey = () => `r${Date.now().toString(36)}${(rowKey += 1)}`;

export const blankSecurityRow = () => ({ key: nextKey(), type: "", applicable: null, pct: "", due_days: "", validity_text: "" });
export const blankMilestone = () => ({ key: nextKey(), percent: "", trigger: "", due_days: "", notes: "" });
export const blankContact = () => ({ key: nextKey(), department: "", names: "", mobiles: "", emails: "" });

/** `slots`: the department's sign-off boxes (IEV by default). */
export function emptyOcForm(slots = SIGNOFF_SLOTS) {
  return {
    id: null,
    oc_no: "",
    oc_date: "",
    cost_center_tally: "",
    client_name: "",
    client_address: "",
    is_sez: null,
    po_wo_no: "",
    po_date: "",
    project_description: "",
    duration_of_job: "",
    delivery_date: "",
    contract_value: "",
    currency: "INR",
    gst_pct: "",
    payment_terms: "",
    payment_milestones: [],
    penalty: { enabled: null, rate: "", period_unit: "WEEK", cap_percent: "", applicable_from_text: "" },
    security_items: [blankSecurityRow(), blankSecurityRow()],
    emd: { enabled: null, release_or_adjust: "", release_date: "" },
    dlp: { enabled: null, detail_text: "" },
    warranty: { enabled: null, detail_text: "" },
    rto_insurance: "",
    other_information: "",
    contacts: [blankContact(), blankContact()],
    remarks: "",
    remarks_date: "",
    signoff: Object.fromEntries(slots.map(({ slot }) => [slot, { signed_by: "", saved_by: "", signed_at: "" }])),
  };
}

const str = (v) => (v === null || v === undefined ? "" : String(v));
const num = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

/** Builds form state from the saved rows (see ocApi.loadOc). */
export function formFromRecord({ master, security = [], conditions = [], penalty, milestones = [], contacts = [], signoff = [] }, slots = SIGNOFF_SLOTS) {
  const form = emptyOcForm(slots);
  const cond = (key) => conditions.find((c) => c.key === key) || {};
  Object.assign(form, {
    id: master.id,
    oc_no: str(master.oc_no),
    oc_date: str(master.oc_date),
    cost_center_tally: str(master.cost_center_tally),
    client_name: str(master.client_name),
    client_address: str(master.client_address),
    is_sez: master.is_sez ?? null,
    po_wo_no: str(master.po_wo_no),
    po_date: str(master.po_date),
    project_description: str(master.project_description),
    duration_of_job: str(master.duration_of_job),
    delivery_date: str(master.delivery_date),
    contract_value: num(master.contract_value),
    currency: master.currency || "INR",
    gst_pct: num(master.gst_pct),
    payment_terms: str(master.payment_terms),
    rto_insurance: str(master.rto_insurance),
    other_information: str(master.other_information),
    remarks: str(master.remarks),
    remarks_date: str(master.remarks_date),
  });
  form.payment_milestones = [...milestones].sort((a, b) => a.seq - b.seq).map((m) => ({
    key: nextKey(), percent: num(m.percent), trigger: str(m.trigger), due_days: num(m.due_days), notes: str(m.notes),
  }));
  form.penalty = {
    enabled: penalty?.enabled ?? null,
    rate: num(penalty?.rate),
    period_unit: penalty?.period_unit || "WEEK",
    cap_percent: num(penalty?.cap_percent),
    applicable_from_text: str(penalty?.applicable_from_text),
  };
  form.security_items = [...security].sort((a, b) => a.seq - b.seq).map((s) => ({
    key: nextKey(), type: s.type, applicable: s.applicable ?? null, pct: num(s.pct), due_days: num(s.due_days), validity_text: str(s.validity_text),
  }));
  const emd = cond("EMD");
  form.emd = { enabled: emd.enabled ?? null, release_or_adjust: str(emd.release_or_adjust), release_date: str(emd.release_date) };
  form.dlp = { enabled: cond("DLP").enabled ?? null, detail_text: str(cond("DLP").detail_text) };
  form.warranty = { enabled: cond("WARRANTY").enabled ?? null, detail_text: str(cond("WARRANTY").detail_text) };
  form.contacts = [...contacts].sort((a, b) => a.seq - b.seq).map((c) => ({
    key: nextKey(), department: str(c.department), names: str(c.names),
    mobiles: (c.mobiles || []).join(", "), emails: (c.emails || []).join(", "),
  }));
  for (const s of signoff) {
    if (form.signoff[s.slot]) {
      form.signoff[s.slot] = { signed_by: str(s.signed_by), saved_by: str(s.signed_by), signed_at: str(s.signed_at) };
    }
  }
  return form;
}

/** Splits "a, b\nc" into ["a","b","c"]. */
export function splitList(text) {
  return String(text || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";
const securityRowBlank = (r) => !r.type && isBlank(r.pct) && isBlank(r.due_days) && isBlank(r.validity_text);
const milestoneBlank = (m) => isBlank(m.percent) && isBlank(m.trigger) && isBlank(m.due_days) && isBlank(m.notes);
const contactBlank = (c) => isBlank(c.department) && isBlank(c.names) && isBlank(c.mobiles) && isBlank(c.emails);
const numOrNull = (v) => (isBlank(v) ? null : Number(v));
const textOrNull = (v) => (isBlank(v) ? null : String(v).trim());

/** Payload for public.oc_save(p jsonb). Fully blank repeatable rows are dropped. */
export function toSavePayload(form, slots = SIGNOFF_SLOTS) {
  const emd = form.emd.enabled === true ? form.emd : { ...form.emd, release_or_adjust: "", release_date: "" };
  return {
    id: form.id || null,
    oc_no: textOrNull(form.oc_no),
    oc_date: textOrNull(form.oc_date),
    cost_center_tally: textOrNull(form.cost_center_tally),
    client_name: textOrNull(form.client_name),
    client_address: textOrNull(form.client_address),
    is_sez: form.is_sez,
    po_wo_no: textOrNull(form.po_wo_no),
    po_date: textOrNull(form.po_date),
    project_description: textOrNull(form.project_description),
    duration_of_job: textOrNull(form.duration_of_job),
    delivery_date: textOrNull(form.delivery_date),
    contract_value: numOrNull(form.contract_value),
    currency: form.currency || "INR",
    gst_pct: numOrNull(form.gst_pct),
    payment_terms: textOrNull(form.payment_terms),
    rto_insurance: textOrNull(form.rto_insurance),
    other_information: textOrNull(form.other_information),
    remarks: textOrNull(form.remarks),
    remarks_date: textOrNull(form.remarks_date),
    penalty: form.penalty.enabled === true
      ? {
        enabled: true,
        rate: numOrNull(form.penalty.rate),
        period_unit: form.penalty.period_unit || null,
        cap_percent: numOrNull(form.penalty.cap_percent),
        applicable_from_text: textOrNull(form.penalty.applicable_from_text),
      }
      : { enabled: form.penalty.enabled, rate: null, period_unit: null, cap_percent: null, applicable_from_text: null },
    security_items: form.security_items.filter((r) => !securityRowBlank(r)).map((r) => ({
      type: r.type,
      applicable: r.type === "SD" ? r.applicable : null,
      pct: numOrNull(r.pct),
      due_days: numOrNull(r.due_days),
      validity_text: textOrNull(r.validity_text),
    })),
    fixed_conditions: [
      {
        key: "EMD",
        enabled: emd.enabled,
        release_or_adjust: textOrNull(emd.release_or_adjust),
        release_date: emd.release_or_adjust === "RELEASE" ? textOrNull(emd.release_date) : null,
      },
      { key: "DLP", enabled: form.dlp.enabled, detail_text: form.dlp.enabled === true ? textOrNull(form.dlp.detail_text) : null },
      { key: "WARRANTY", enabled: form.warranty.enabled, detail_text: form.warranty.enabled === true ? textOrNull(form.warranty.detail_text) : null },
    ],
    payment_milestones: form.payment_milestones.filter((m) => !milestoneBlank(m)).map((m) => ({
      percent: numOrNull(m.percent), trigger: textOrNull(m.trigger), due_days: numOrNull(m.due_days), notes: textOrNull(m.notes),
    })),
    contacts: form.contacts.filter((c) => !contactBlank(c)).map((c) => ({
      department: textOrNull(c.department), names: textOrNull(c.names), mobiles: splitList(c.mobiles), emails: splitList(c.emails),
    })),
    signoff: slots.map(({ slot }) => ({ slot, ...form.signoff[slot] }))
      .filter((s) => !isBlank(s.signed_by))
      .map((s) => ({ slot: s.slot, signed_by: textOrNull(s.signed_by) })),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[\d\s-]{7,16}$/;
const pctOk = (v) => isBlank(v) || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
const intOk = (v) => isBlank(v) || (Number.isInteger(Number(v)) && Number(v) >= 0);

/** Returns { field-path: message }; empty object when the form can be saved. */
export function validateOcForm(form) {
  const e = {};
  if (!isBlank(form.oc_no) && String(form.oc_no).trim().length > 80) e.oc_no = "OC No. must be 80 characters or fewer.";
  if (isBlank(form.po_wo_no)) e.po_wo_no = "PO/WO No. is required.";
  if (isBlank(form.po_date)) e.po_date = "PO/WO date is required.";
  if (isBlank(form.client_name)) e.client_name = "Client name is required.";
  if (isBlank(form.project_description)) e.project_description = "Project description is required.";
  if (isBlank(form.contract_value)) e.contract_value = "Contract value is required.";
  else if (!Number.isFinite(Number(form.contract_value)) || Number(form.contract_value) < 0) e.contract_value = "Enter a valid amount.";
  if (isBlank(form.delivery_date)) e.delivery_date = "Delivery date is required.";
  else if (!isBlank(form.po_date) && form.delivery_date <= form.po_date) e.delivery_date = "Delivery date must be after the PO/WO date.";
  if (!pctOk(form.gst_pct)) e.gst_pct = "GST must be between 0 and 100.";

  if (form.penalty.enabled === true) {
    if (isBlank(form.penalty.rate)) e["penalty.rate"] = "Rate is required.";
    else if (!pctOk(form.penalty.rate)) e["penalty.rate"] = "Rate must be between 0 and 100.";
    if (isBlank(form.penalty.period_unit)) e["penalty.period_unit"] = "Choose a period.";
    if (!pctOk(form.penalty.cap_percent)) e["penalty.cap_percent"] = "Max % must be between 0 and 100.";
  }

  form.security_items.forEach((r, i) => {
    if (securityRowBlank(r)) return;
    if (!r.type) e[`security_items.${i}.type`] = "Choose a security type.";
    if (!pctOk(r.pct)) e[`security_items.${i}.pct`] = "Must be between 0 and 100.";
    if (!intOk(r.due_days)) e[`security_items.${i}.due_days`] = "Whole days only.";
  });

  if (form.emd.enabled === true) {
    if (!form.emd.release_or_adjust) e["emd.release_or_adjust"] = "Choose a release date or adjust against SD.";
    else if (form.emd.release_or_adjust === "RELEASE" && isBlank(form.emd.release_date)) e["emd.release_date"] = "Release date is required.";
  }
  if (form.dlp.enabled === true && isBlank(form.dlp.detail_text)) e["dlp.detail_text"] = "Details are required when Yes.";
  if (form.warranty.enabled === true && isBlank(form.warranty.detail_text)) e["warranty.detail_text"] = "Details are required when Yes.";

  const milestones = form.payment_milestones.filter((m) => !milestoneBlank(m));
  milestones.forEach((m) => {
    const i = form.payment_milestones.indexOf(m);
    if (isBlank(m.percent) || !(Number(m.percent) > 0 && Number(m.percent) <= 100)) e[`payment_milestones.${i}.percent`] = "Enter a % above 0.";
    if (!intOk(m.due_days)) e[`payment_milestones.${i}.due_days`] = "Whole days only.";
  });
  if (milestones.length) {
    const total = milestoneTotal(form.payment_milestones);
    if (Math.abs(total - 100) > 0.001) e.payment_milestones = `Milestones must total 100% (currently ${total}%).`;
  }

  form.contacts.forEach((c, i) => {
    if (splitList(c.mobiles).some((m) => !MOBILE_RE.test(m))) e[`contacts.${i}.mobiles`] = "Check the mobile numbers.";
    if (splitList(c.emails).some((m) => !EMAIL_RE.test(m))) e[`contacts.${i}.emails`] = "Check the e-mail addresses.";
  });
  return e;
}

export function milestoneTotal(milestones) {
  return Math.round(milestones.reduce((s, m) => s + (Number(m.percent) || 0), 0) * 100) / 100;
}

function wholeWords(n) {
  if (n >= 10000000) {
    const rest = n % 10000000;
    return `${wholeWords(Math.floor(n / 10000000))} Crore${rest ? ` ${amountInWords(rest)}` : ""}`;
  }
  return amountInWords(n);
}

/** Indian-format words, e.g. 12345678.5 → "Rupees One Crore Twenty Three Lakh … and Fifty Paise Only". */
export function contractValueInWords(value, currency = "INR") {
  if (isBlank(value)) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "";
  const whole = Math.floor(n);
  const fraction = Math.round((n - whole) * 100);
  const words = wholeWords(whole);
  if (currency === "INR") return `Rupees ${words}${fraction ? ` and ${amountInWords(fraction)} Paise` : ""} Only`;
  return `${currency} ${words}${fraction ? ` and ${fraction}/100` : ""} Only`;
}

/** Indian digit grouping with 2 decimals when needed: 12345678.5 → 1,23,45,678.50 */
export function formatIndianAmount(value) {
  if (isBlank(value) || !Number.isFinite(Number(value))) return "";
  const n = Number(value);
  return n.toLocaleString("en-IN", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** yyyy-mm-dd → dd/mm/yyyy */
export function formatOcDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Sign-off date and time in India time, e.g. "12/10/2026, 11:58 AM". */
export function formatSignedAt(ts) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`;
}

/** True when the name in a sign-off box will be (re)signed on the next save. */
export function signoffPending(s) {
  return !isBlank(s?.signed_by) && String(s.signed_by).trim() !== String(s.saved_by || "").trim();
}

/** PO_At_Glance_<OC no>_<client short>_<yyyymmdd> (OC date, else today). */
export function ocExportFileName(form, today = new Date()) {
  const oc = String(form.oc_no || "draft").replace(/[^A-Za-z0-9-]+/g, "-");
  const client = String(form.client_name || "client")
    .split(/\s+/).filter(Boolean).slice(0, 3).join("_")
    .replace(/[^A-Za-z0-9_]+/g, "").slice(0, 24) || "client";
  const iso = form.oc_date || today.toISOString().slice(0, 10);
  return `PO_At_Glance_${oc}_${client}_${iso.replace(/-/g, "")}`;
}

export function penaltySummary(p) {
  if (p.enabled !== true) return "";
  const unit = PERIOD_UNITS.find((u) => u.value === p.period_unit)?.label || "";
  return [
    !isBlank(p.rate) ? `${p.rate}% per ${unit}` : "",
    !isBlank(p.cap_percent) ? `max ${p.cap_percent}% of contract value` : "",
    !isBlank(p.applicable_from_text) ? `applicable from ${p.applicable_from_text}` : "",
  ].filter(Boolean).join(", ");
}

export function emdSummary(emd) {
  if (emd.enabled !== true) return "";
  if (emd.release_or_adjust === "ADJUST_SD") return "Adjust against SD";
  if (emd.release_or_adjust === "RELEASE") return `Release on ${formatOcDate(emd.release_date)}`;
  return "";
}

export function milestoneLines(milestones) {
  return milestones.filter((m) => !milestoneBlank(m)).map((m) => [
    `${m.percent}%`,
    m.trigger,
    !isBlank(m.due_days) ? `within ${m.due_days} days` : "",
    m.notes,
  ].filter((x) => !isBlank(x)).join(" — "));
}

export { isBlank, securityRowBlank, contactBlank };
