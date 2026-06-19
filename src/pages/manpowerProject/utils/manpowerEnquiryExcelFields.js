export const META_PREFIX = "__META__:";

export const VERTICAL_OPTIONS = ["Fire Tender", "Manpower", "Training"];
export const MODE_OF_SUBMISSION_OPTIONS = [
  "Email",
  "Online Portal",
  "Verbal",
  "Reference",
  "Phone",
  "Other",
];

/** Inquiry fields previously stored inside authorization_to JSON — now use DB columns. */
const INQUIRY_META_KEYS = [
  "srNo",
  "receivedDate",
  "enquiryDate",
  "vertical",
  "modeOfSubmission",
  "totalManpower",
  "location",
  "siteName",
  "descriptionOfWork",
  "approxValue",
  "estimatedValueClient",
  "enquiryAssignedTo",
  "dueDate",
  "offerSubmittedOn",
  "remarks",
  "furtherAction",
];

export function parseAuthorizationMeta(value) {
  if (!value || typeof value !== "string" || !value.startsWith(META_PREFIX)) {
    return { meta: {}, rawText: value || "" };
  }
  try {
    return { meta: JSON.parse(value.slice(META_PREFIX.length)) || {}, rawText: "" };
  } catch {
    return { meta: {}, rawText: value };
  }
}

export function buildAuthorizationValue(meta, rawText) {
  const nextMeta = { ...(meta || {}) };
  if (rawText && String(rawText).trim() && !nextMeta.authorizationTo) {
    nextMeta.authorizationTo = String(rawText).trim();
  }
  return `${META_PREFIX}${JSON.stringify(nextMeta)}`;
}

export function extractWorkflowMeta(meta = {}) {
  const workflow = { ...(meta || {}) };
  INQUIRY_META_KEYS.forEach((key) => {
    delete workflow[key];
  });
  return workflow;
}

function toInputDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function normalizeSrNo(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeTotalManpower(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/** Map a DB row to the 14 Excel inquiry columns (DB columns first, meta/legacy fallback). */
export function getExcelInquiryFields(row) {
  const { meta } = parseAuthorizationMeta(row?.authorization_to);
  const location =
    row?.location ||
    meta.location ||
    [meta.siteCity || row?.city, meta.siteState || row?.state].filter(Boolean).join(", ") ||
    meta.siteName ||
    "";

  return {
    srNo: row?.sr_no ?? meta.srNo ?? null,
    receivedDate: row?.received_date || meta.receivedDate || meta.enquiryDate || row?.created_at || null,
    vertical: row?.vertical || meta.vertical || "",
    modeOfSubmission: row?.mode_of_submission || meta.modeOfSubmission || row?.source || "",
    totalManpower: row?.total_manpower ?? meta.totalManpower ?? "",
    clientName: row?.client || "",
    location,
    descriptionOfWork: row?.manpower_required || meta.descriptionOfWork || "",
    approxValue: row?.project_estimation ?? meta.approxValue ?? meta.estimatedValueClient ?? "",
    enquiryAssignedTo: row?.handled_by || meta.enquiryAssignedTo || "",
    dueDate: row?.due_date || meta.dueDate || null,
    offerSubmittedOn: row?.offer_submitted_on || meta.offerSubmittedOn || null,
    remarks: row?.remarks || meta.remarks || "",
    furtherAction: row?.further_action || meta.furtherAction || "",
  };
}

export function excelFieldsToForm(row) {
  const fields = getExcelInquiryFields(row);
  return {
    srNo: fields.srNo ?? "",
    receivedDate: toInputDate(fields.receivedDate),
    vertical: fields.vertical,
    modeOfSubmission: fields.modeOfSubmission,
    totalManpower: fields.totalManpower === "" || fields.totalManpower == null ? "" : String(fields.totalManpower),
    clientName: fields.clientName,
    location: fields.location,
    descriptionOfWork: fields.descriptionOfWork,
    approxValue: fields.approxValue === "" || fields.approxValue == null ? "" : String(fields.approxValue),
    enquiryAssignedTo: fields.enquiryAssignedTo,
    dueDate: toInputDate(fields.dueDate),
    offerSubmittedOn: toInputDate(fields.offerSubmittedOn),
    remarks: fields.remarks,
    furtherAction: fields.furtherAction,
  };
}

/** Build Supabase row payload for insert/update from inquiry form. */
export function buildInquiryDbPayload(form, existingMeta = {}) {
  const srNo = normalizeSrNo(
    form.srNo === "" || form.srNo == null ? existingMeta.srNo : form.srNo
  );
  const workflowMeta = extractWorkflowMeta(existingMeta);
  if (form.location) {
    workflowMeta.siteName = form.location;
  }

  return {
    client: String(form.clientName || "").trim(),
    sr_no: srNo,
    received_date: form.receivedDate || null,
    vertical: form.vertical || null,
    source: form.modeOfSubmission || null,
    mode_of_submission: form.modeOfSubmission || null,
    total_manpower: normalizeTotalManpower(form.totalManpower),
    location: form.location || null,
    manpower_required: form.descriptionOfWork || null,
    project_estimation: form.approxValue === "" || form.approxValue == null ? null : String(form.approxValue),
    handled_by: form.enquiryAssignedTo || null,
    due_date: form.dueDate || null,
    offer_submitted_on: form.offerSubmittedOn || null,
    remarks: form.remarks || null,
    further_action: form.furtherAction || null,
    authorization_to: buildAuthorizationValue(workflowMeta, ""),
  };
}

/** @deprecated Use buildInquiryDbPayload — kept for any legacy callers in this module. */
export function buildExcelMetaFromForm(form, existingMeta = {}) {
  const payload = buildInquiryDbPayload(form, existingMeta);
  const { meta } = parseAuthorizationMeta(payload.authorization_to);
  return {
    ...meta,
    srNo: payload.sr_no,
    receivedDate: payload.received_date,
    vertical: payload.vertical,
    modeOfSubmission: payload.mode_of_submission,
    totalManpower: payload.total_manpower,
    location: payload.location,
    descriptionOfWork: payload.manpower_required,
    approxValue: payload.project_estimation,
    enquiryAssignedTo: payload.handled_by,
    dueDate: payload.due_date,
    offerSubmittedOn: payload.offer_submitted_on,
    remarks: payload.remarks,
    furtherAction: payload.further_action,
  };
}

export async function getNextSrNo(supabase) {
  const { data, error } = await supabase.from("manpower_enquiries").select("sr_no, authorization_to");
  if (error) throw error;
  let max = 0;
  (data || []).forEach((row) => {
    const fromColumn = Number(row.sr_no);
    if (Number.isFinite(fromColumn) && fromColumn > max) max = fromColumn;
    const { meta } = parseAuthorizationMeta(row.authorization_to);
    const fromMeta = Number(meta.srNo);
    if (Number.isFinite(fromMeta) && fromMeta > max) max = fromMeta;
  });
  return max + 1;
}

export async function getNextEnquiryNumber(supabase) {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.from("manpower_enquiries").select("enquiry_number").not("enquiry_number", "is", null);
  if (error) throw error;
  let maxSequence = 0;
  (data || []).forEach((row) => {
    const val = String(row.enquiry_number || "");
    const dashMatch = val.match(/^ENQ-(\d{4})-(\d{4})$/);
    if (dashMatch && Number(dashMatch[1]) === year) {
      maxSequence = Math.max(maxSequence, Number(dashMatch[2]));
      return;
    }
    const slashMatch = val.match(/^ENQ\/(\d{4})\/(\d{4})$/);
    if (slashMatch && Number(slashMatch[1]) === year) {
      maxSequence = Math.max(maxSequence, Number(slashMatch[2]));
    }
  });
  return `ENQ-${year}-${String(maxSequence + 1).padStart(4, "0")}`;
}

/** Table layout: column widths and value types aligned to inquiry field data. */
export const INQUIRY_TABLE_COLUMNS = [
  { id: "srNo", label: "Sr. No", width: 56, align: "center", valueType: "number", dbColumn: "sr_no" },
  { id: "receivedDate", label: "Received Date", width: 108, valueType: "date", dbColumn: "received_date" },
  { id: "vertical", label: "Vertical", width: 92, valueType: "text", dbColumn: "vertical" },
  { id: "modeOfSubmission", label: "Mode of Submission", width: 132, valueType: "text", dbColumn: "mode_of_submission" },
  { id: "totalManpower", label: "Total No. of Manpower", width: 92, align: "center", valueType: "number", dbColumn: "total_manpower" },
  { id: "clientName", label: "Client Name", width: 152, valueType: "text", dbColumn: "client" },
  { id: "location", label: "Location", width: 124, valueType: "text", dbColumn: "location" },
  { id: "descriptionOfWork", label: "Description of Work", width: 208, valueType: "text", dbColumn: "manpower_required" },
  { id: "approxValue", label: "Approx Value (WO Taxes)", width: 116, align: "right", valueType: "currency", dbColumn: "project_estimation" },
  { id: "enquiryAssignedTo", label: "Enquiry Assigned to", width: 168, valueType: "text", dbColumn: "handled_by" },
  { id: "dueDate", label: "Due Date for Submission (if any)", width: 124, valueType: "date", dbColumn: "due_date" },
  { id: "offerSubmittedOn", label: "Offer Submitted On", width: 116, valueType: "date", dbColumn: "offer_submitted_on" },
  { id: "remarks", label: "Remarks", width: 144, valueType: "text", dbColumn: "remarks" },
  { id: "furtherAction", label: "Further action/Follow up", width: 168, valueType: "text", dbColumn: "further_action" },
];

export function formatInquiryCellValue(value, valueType, formatDate) {
  if (value === null || value === undefined || value === "") return "—";
  if (valueType === "date") return formatDate(value) || "—";
  if (valueType === "number") return String(value);
  if (valueType === "currency") {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-IN") : String(value);
  }
  return String(value);
}

export const INQUIRY_DB_COLUMNS = [
  "id",
  "sr_no",
  "received_date",
  "vertical",
  "mode_of_submission",
  "total_manpower",
  "client",
  "location",
  "manpower_required",
  "project_estimation",
  "handled_by",
  "due_date",
  "offer_submitted_on",
  "remarks",
  "further_action",
  "enquiry_number",
  "status",
  "authorization_to",
  "created_at",
  "updated_at",
];
