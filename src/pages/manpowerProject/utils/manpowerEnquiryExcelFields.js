export const META_PREFIX = "__META__:";

export const VERTICAL_OPTIONS = ["Manpower", "Fire Tender", "Training"];
export const MODE_OF_SUBMISSION_OPTIONS = [
  "Email",
  "Online Portal",
  "Verbal",
  "Reference",
  "Phone",
  "Other",
];
export const SOURCE_TYPE_OPTIONS = ["Direct Mail", "Online Tender", "Verbal"];
export const INDUSTRY_OPTIONS = ["Oil & Gas", "Refinery", "Chemical", "Power", "Construction", "Port", "Other"];
export const WORKING_HOURS_OPTIONS = ["8 hrs", "12 hrs", "As per client"];
export const ENQUIRY_SUBTYPE_OPTIONS = ["Regular", "Shutdown"];
export const SERVICE_CATEGORY_OPTIONS = [
  "Firefighting Manpower Only",
  "Safety Manpower Only",
  "Manpower + Fire Tender",
  "Firefighting Manpower + Safety Manpower",
  "Fire Tender (without Crew)",
];
export const CONTRACT_DURATION_UNITS = ["Days", "Months", "Years"];
export const TENDER_PORTAL_OPTIONS = ["Ariba", "GeM", "eProcurement", "Custom"];
export const EMD_FEE_STATUS_OPTIONS = ["Not Applicable", "Applicable - Pay", "Exempted"];
export const PAYMENT_MODE_OPTIONS = ["Demand Draft", "NEFT", "Online"];
export const PAYMENT_STATUS_OPTIONS = ["Pending", "Paid", "Refunded"];
export const INDIA_STATES_UT = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

/** Inquiry fields previously stored inside authorization_to JSON — now use DB columns. */
const INQUIRY_META_KEYS = [
  "srNo",
  "receivedDate",
  "enquiryDate",
  "vertical",
  "modeOfSubmission",
  "sourceType",
  "totalManpower",
  "location",
  "siteName",
  "siteState",
  "siteCity",
  "descriptionOfWork",
  "approxValue",
  "estimatedValueClient",
  "enquiryAssignedTo",
  "receivedBy",
  "assignedToList",
  "dueDate",
  "offerSubmittedOn",
  "remarks",
  "furtherAction",
  "contactPersonName",
  "contactPersonDesignation",
  "contactPersonPhone",
  "contactPersonEmail",
  "submissionRemark",
  "scopeAttachmentPaths",
  "industrySector",
  "serviceCategory",
  "serviceCategoryCustom",
  "enquirySubType",
  "scopeInputType",
  "contractDurationValue",
  "contractDurationUnit",
  "contractTimelineStart",
  "contractTimelineEnd",
  "workingHoursShift",
  "customWorkingHours",
  "applicableStateMw",
  "minWageEffectiveDate",
  "submissionBidDeadline",
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

export function toIsoDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

export function toIsoFromDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function composeLocation(meta = {}, row = {}) {
  return (
    row?.location ||
    meta.location ||
    [meta.siteCity || row?.city, meta.siteState || row?.state, meta.siteName]
      .filter(Boolean)
      .join(", ") ||
    meta.siteName ||
    ""
  );
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

export function emptyContactRow() {
  return { name: "", email: "", phone: "" };
}

export function parseAssignedToList(value, meta = {}) {
  if (Array.isArray(meta?.assignedToList)) {
    return meta.assignedToList.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const raw = value || meta?.receivedBy || meta?.enquiryAssignedTo || "";
  if (!raw) return [];
  return String(raw)
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatAssignedToList(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeContactsFromRow(row, meta = {}) {
  const fromColumn = Array.isArray(row?.contacts) ? row.contacts : [];
  const cleaned = fromColumn
    .map((c) => ({
      name: String(c?.name || "").trim(),
      email: String(c?.email || "").trim(),
      phone: String(c?.phone || "").trim(),
    }))
    .filter((c) => c.name || c.email || c.phone);

  if (cleaned.length) return cleaned;

  const legacyName = String(meta.contactPersonName || "").trim();
  const legacyEmail = String(meta.contactPersonEmail || row?.email || "").trim();
  const legacyPhone = String(meta.contactPersonPhone || row?.phone || "").trim();
  if (legacyName || legacyEmail || legacyPhone) {
    return [{ name: legacyName, email: legacyEmail, phone: legacyPhone }];
  }

  return [emptyContactRow()];
}

function normalizeScopeAttachmentPaths(row, meta = {}) {
  if (Array.isArray(meta.scopeAttachmentPaths) && meta.scopeAttachmentPaths.length) {
    return meta.scopeAttachmentPaths.filter(Boolean);
  }
  if (row?.documents) return [row.documents];
  return [];
}

/** Map a DB row to the 14 Excel inquiry columns (DB columns first, meta/legacy fallback). */
export function getExcelInquiryFields(row) {
  const { meta } = parseAuthorizationMeta(row?.authorization_to);
  const location = composeLocation(meta, row);

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
    enquiryAssignedTo: (() => {
      const list = parseAssignedToList(row?.handled_by, meta);
      return list.length ? formatAssignedToList(list) : row?.handled_by || meta.enquiryAssignedTo || meta.receivedBy || "";
    })(),
    dueDate: row?.due_date || meta.dueDate || null,
    offerSubmittedOn: row?.offer_submitted_on || meta.offerSubmittedOn || null,
    remarks: row?.remarks || meta.remarks || "",
    furtherAction: row?.further_action || meta.furtherAction || "",
  };
}

/** Map a DB row to common header + Excel tracker form fields. */
export function inquiryRowToForm(row) {
  const { meta } = parseAuthorizationMeta(row?.authorization_to);
  const excel = getExcelInquiryFields(row);
  const enquirySubType = meta.enquirySubType;
  const normalizedSubType = Array.isArray(enquirySubType)
    ? enquirySubType[0] || "Regular"
    : enquirySubType || "Regular";

  return {
    ...excel,
    srNo: excel.srNo ?? "",
    receivedDate: toInputDate(excel.receivedDate),
    totalManpower: excel.totalManpower === "" || excel.totalManpower == null ? "" : String(excel.totalManpower),
    approxValue: excel.approxValue === "" || excel.approxValue == null ? "" : String(excel.approxValue),
    dueDate: toInputDate(excel.dueDate),
    offerSubmittedOn: toInputDate(excel.offerSubmittedOn),
    enquiryDate: toInputDate(meta.enquiryDate || excel.receivedDate),
    receivedBy: formatAssignedToList(parseAssignedToList(meta.receivedBy || row?.handled_by, meta)),
    enquiryAssignedTo: formatAssignedToList(
      parseAssignedToList(meta.enquiryAssignedTo || meta.receivedBy || row?.handled_by, meta)
    ),
    assignedToList: parseAssignedToList(row?.handled_by || meta.receivedBy, meta),
    sourceType: meta.sourceType || row?.source || excel.modeOfSubmission || "Direct Mail",
    contacts: normalizeContactsFromRow(row, meta),
    contactPersonName: meta.contactPersonName || "",
    contactPersonDesignation: meta.contactPersonDesignation || meta.clientDesignation || "",
    contactPersonPhone: meta.contactPersonPhone || row?.phone || "",
    contactPersonEmail: meta.contactPersonEmail || row?.email || "",
    submissionRemark: meta.submissionRemark || "",
    siteName: meta.siteName || "",
    siteState: meta.siteState || row?.state || "",
    siteCity: meta.siteCity || row?.city || "",
    industrySector: meta.industrySector || "",
    serviceCategory: (() => {
      const stored = meta.serviceCategory || "";
      if (meta.serviceCategoryCustom) return "Other (manual entry)";
      if (stored && !SERVICE_CATEGORY_OPTIONS.includes(stored)) return "Other (manual entry)";
      return stored;
    })(),
    serviceCategoryCustom:
      meta.serviceCategoryCustom ||
      (meta.serviceCategory && !SERVICE_CATEGORY_OPTIONS.includes(meta.serviceCategory) ? meta.serviceCategory : ""),
    enquirySubType: normalizedSubType,
    scopeInputType: meta.scopeInputType || "Text",
    scopeOfWork: row?.manpower_required || meta.descriptionOfWork || "",
    scopeAttachmentPaths: normalizeScopeAttachmentPaths(row, meta),
    scopeAttachments: [],
    contractDurationValue: meta.contractDurationValue ?? "",
    contractDurationUnit: meta.contractDurationUnit || "Months",
    contractTimelineStart: toInputDate(meta.contractTimelineStart),
    contractTimelineEnd: toInputDate(meta.contractTimelineEnd),
    workingHoursShift: meta.workingHoursShift || "",
    customWorkingHours: meta.customWorkingHours || "",
    applicableStateMw: meta.applicableStateMw || "",
    minWageEffectiveDate: toInputDate(meta.minWageEffectiveDate),
    submissionBidDeadline: toIsoDateTimeLocal(meta.submissionBidDeadline || excel.dueDate),
    enquiryNumber: row?.enquiry_number || "",
    portalNameOption: meta.portalNameOption || "",
    portalNameCustom: meta.portalNameCustom || "",
    tenderNumber: meta.tenderNumber || "",
    estimatedValueClient:
      meta.estimatedValueClient === "" || meta.estimatedValueClient == null
        ? excel.approxValue === "" || excel.approxValue == null
          ? ""
          : String(excel.approxValue)
        : String(meta.estimatedValueClient),
    ourQuotedRate: meta.ourQuotedRate ?? "",
    portalSubmissionDate: toIsoDateTimeLocal(meta.portalSubmissionDate),
    portalProofAttachment: null,
    tenderFeeApplicable: meta.tenderFeeApplicable || "Not Applicable",
    tenderFeeAmount: meta.tenderFeeAmount ?? "",
    emdFeeStatus: meta.emdFeeStatus || "Not Applicable",
    emdFeeAmount: meta.emdFeeAmount ?? "",
    paymentMode: meta.paymentMode || "",
    paymentReferenceNo: meta.paymentReferenceNo || "",
    paymentStatus: meta.paymentStatus || "",
    paymentDate: toInputDate(meta.paymentDate),
    portalProofPath: meta.portalProofPath || "",
  };
}

export function excelFieldsToForm(row) {
  return inquiryRowToForm(row);
}

/** Build Supabase row payload for insert/update from inquiry form. */
export function buildInquiryDbPayload(form, existingMeta = {}) {
  const srNo = normalizeSrNo(
    form.srNo === "" || form.srNo == null ? existingMeta.srNo : form.srNo
  );
  const workflowMeta = extractWorkflowMeta(existingMeta);
  const location =
    form.location ||
    [form.siteCity, form.siteState, form.siteName].filter((v) => String(v || "").trim()).join(", ") ||
    null;
  const scopeText = form.scopeOfWork || form.descriptionOfWork || null;
  const submissionDeadlineIso = form.submissionBidDeadline
    ? toIsoFromDateTimeLocal(form.submissionBidDeadline)
    : null;
  const dueDate =
    (submissionDeadlineIso ? submissionDeadlineIso.split("T")[0] : null) ||
    form.dueDate ||
    null;

  const contacts = (Array.isArray(form.contacts) ? form.contacts : [])
    .map((c) => ({
      name: String(c?.name || "").trim(),
      email: String(c?.email || "").trim(),
      phone: String(c?.phone || "").trim(),
    }))
    .filter((c) => c.name || c.email || c.phone);
  const primaryContact = contacts[0] || {
    name: form.contactPersonName || "",
    email: form.contactPersonEmail || "",
    phone: form.contactPersonPhone || "",
  };

  const existingScopePaths = Array.isArray(form.scopeAttachmentPaths)
    ? form.scopeAttachmentPaths.filter(Boolean)
    : Array.isArray(existingMeta.scopeAttachmentPaths)
      ? existingMeta.scopeAttachmentPaths.filter(Boolean)
      : existingMeta.documents || existingMeta.scopeAttachmentPath
        ? [existingMeta.documents || existingMeta.scopeAttachmentPath].filter(Boolean)
        : [];

  const assignedToList = (Array.isArray(form.assignedToList) ? form.assignedToList : parseAssignedToList(
    form.receivedBy || form.enquiryAssignedTo,
    { receivedBy: form.receivedBy, enquiryAssignedTo: form.enquiryAssignedTo, assignedToList: form.assignedToList }
  ))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const assignedToText = formatAssignedToList(assignedToList);

  const headerMeta = {
    enquiryDate: form.enquiryDate || form.receivedDate || null,
    sourceType: form.sourceType || null,
    receivedBy: assignedToText || null,
    enquiryAssignedTo: assignedToText || null,
    assignedToList,
    submissionRemark: form.submissionRemark || "",
    contactPersonName: primaryContact.name || "",
    contactPersonDesignation: form.contactPersonDesignation || "",
    contactPersonPhone: primaryContact.phone || "",
    contactPersonEmail: primaryContact.email || "",
    siteName: form.siteName || "",
    siteState: form.siteState || "",
    siteCity: form.siteCity || "",
    industrySector: form.industrySector || "",
    serviceCategory:
      form.serviceCategory === "Other (manual entry)"
        ? String(form.serviceCategoryCustom || "").trim()
        : form.serviceCategory || "",
    serviceCategoryCustom:
      form.serviceCategory === "Other (manual entry)" ? String(form.serviceCategoryCustom || "").trim() : "",
    enquirySubType: form.enquirySubType || "Regular",
    scopeInputType: form.scopeInputType || "Text",
    scopeAttachmentPaths: existingScopePaths,
    contractDurationValue: form.contractDurationValue ?? "",
    contractDurationUnit: form.contractDurationUnit || "Months",
    contractTimelineStart: form.contractTimelineStart || null,
    contractTimelineEnd: form.contractTimelineEnd || null,
    workingHoursShift: form.workingHoursShift || "",
    customWorkingHours: form.customWorkingHours || "",
    applicableStateMw: form.applicableStateMw || "",
    minWageEffectiveDate: form.minWageEffectiveDate || null,
    submissionBidDeadline: submissionDeadlineIso,
    location,
    descriptionOfWork: scopeText,
  };

  if (location) {
    workflowMeta.siteName = form.siteName || location;
  }

  const isOnlineTender = form.sourceType === "Online Tender";
  const onlineTenderMeta = isOnlineTender
    ? {
        portalNameOption: form.portalNameOption || "",
        portalNameCustom: form.portalNameCustom || "",
        tenderNumber: form.tenderNumber || "",
        estimatedValueClient: form.estimatedValueClient ?? "",
        ourQuotedRate: form.ourQuotedRate ?? "",
        portalSubmissionDate: form.portalSubmissionDate
          ? toIsoFromDateTimeLocal(form.portalSubmissionDate)
          : null,
        portalProofPath: form.portalProofPath || workflowMeta.portalProofPath || null,
        tenderFeeApplicable: form.tenderFeeApplicable || "Not Applicable",
        tenderFeeAmount: form.tenderFeeAmount ?? "",
        emdFeeStatus: form.emdFeeStatus || "Not Applicable",
        emdFeeAmount: form.emdFeeAmount ?? "",
        paymentMode: form.paymentMode || "",
        paymentReferenceNo: form.paymentReferenceNo || "",
        paymentStatus: form.paymentStatus || "",
        paymentDate: form.paymentDate || null,
      }
    : {};

  const projectEstimation =
    form.approxValue === "" || form.approxValue == null
      ? form.estimatedValueClient === "" || form.estimatedValueClient == null
        ? null
        : String(form.estimatedValueClient)
      : String(form.approxValue);

  return {
    client: String(form.clientName || "").trim(),
    phone: primaryContact.phone || null,
    email: primaryContact.email || null,
    contacts,
    sr_no: srNo,
    received_date: form.enquiryDate || form.receivedDate || null,
    vertical: form.vertical || null,
    source: form.sourceType || form.modeOfSubmission || null,
    mode_of_submission: form.modeOfSubmission || form.sourceType || null,
    total_manpower: normalizeTotalManpower(form.totalManpower),
    location,
    manpower_required: scopeText,
    project_estimation: projectEstimation,
    handled_by: assignedToText || null,
    due_date: dueDate,
    offer_submitted_on: form.offerSubmittedOn || null,
    remarks: form.remarks || null,
    further_action: form.furtherAction || null,
    rfq_available: isOnlineTender,
    authorization_to: buildAuthorizationValue(
      { ...workflowMeta, ...headerMeta, ...onlineTenderMeta },
      ""
    ),
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
  { id: "enquiryAssignedTo", label: "Assigned To", width: 168, valueType: "text", dbColumn: "handled_by" },
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
