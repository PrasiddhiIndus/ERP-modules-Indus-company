/**
 * Marketing module reports — enquiries, quotations, clients, follow-ups, contracts.
 */

import { formatDateDdMmYyyy } from "../utils/dateDisplay";

export const ENQUIRY_CUSTOM_FIELDS = [
  { id: "enquiryNumber", label: "Enquiry number" },
  { id: "enquiryDate", label: "Enquiry date" },
  { id: "source", label: "Source" },
  { id: "clientName", label: "Client" },
  { id: "contactPerson", label: "Contact person" },
  { id: "contactNumber", label: "Contact number" },
  { id: "contactEmail", label: "Contact email" },
  { id: "siteLocation", label: "Site location" },
  { id: "assignedTo", label: "Assigned to" },
  { id: "estimatedValue", label: "Estimated value (₹)" },
  { id: "expectedClosingDate", label: "Expected closing date" },
  { id: "status", label: "Status" },
  { id: "convertedToQuotation", label: "Converted to quotation" },
  { id: "description", label: "Description" },
  { id: "createdAt", label: "Created at" },
];

export const QUOTATION_CUSTOM_FIELDS = [
  { id: "quotationNumber", label: "Quotation number" },
  { id: "quotationDate", label: "Quotation date" },
  { id: "clientName", label: "Client" },
  { id: "enquiryNumber", label: "Enquiry number" },
  { id: "totalAmount", label: "Total amount (₹)" },
  { id: "gstAmount", label: "GST amount (₹)" },
  { id: "finalAmount", label: "Final amount (₹)" },
  { id: "status", label: "Status" },
  { id: "createdAt", label: "Created at" },
];

export const CLIENT_CUSTOM_FIELDS = [
  { id: "clientName", label: "Client name" },
  { id: "industry", label: "Industry" },
  { id: "city", label: "City" },
  { id: "state", label: "State" },
  { id: "country", label: "Country" },
  { id: "primaryContact", label: "Primary contact" },
  { id: "contactNumber", label: "Contact number" },
  { id: "contactEmail", label: "Contact email" },
  { id: "createdAt", label: "Created at" },
];

export const FOLLOWUP_CUSTOM_FIELDS = [
  { id: "followUpDate", label: "Follow-up date" },
  { id: "dueDate", label: "Due date" },
  { id: "status", label: "Status" },
  { id: "enquiryNumber", label: "Enquiry number" },
  { id: "quotationNumber", label: "Quotation number" },
  { id: "clientName", label: "Client" },
  { id: "remarks", label: "Remarks" },
  { id: "createdAt", label: "Created at" },
];

export const SITE_VISIT_CUSTOM_FIELDS = [
  { id: "visitDate", label: "Visit date" },
  { id: "visitorName", label: "Visitor name" },
  { id: "companyName", label: "Company" },
  { id: "clientName", label: "Client name" },
  { id: "siteLocation", label: "Site location" },
  { id: "purpose", label: "Purpose" },
  { id: "totalExpense", label: "Total expense (₹)" },
  { id: "status", label: "Status" },
];

export const CONTRACT_CUSTOM_FIELDS = [
  { id: "poNumber", label: "PO number" },
  { id: "poDate", label: "PO date" },
  { id: "clientName", label: "Client" },
  { id: "quotationNumber", label: "Quotation number" },
  { id: "enquiryNumber", label: "Enquiry number" },
  { id: "poValue", label: "PO value (₹)" },
  { id: "status", label: "Status" },
  { id: "expectedDeliveryDate", label: "Expected delivery" },
  { id: "awardedDate", label: "Awarded date" },
];

const FIELD_MAP = {
  enquiry: ENQUIRY_CUSTOM_FIELDS,
  quotation: QUOTATION_CUSTOM_FIELDS,
  client: CLIENT_CUSTOM_FIELDS,
  followup: FOLLOWUP_CUSTOM_FIELDS,
  siteVisit: SITE_VISIT_CUSTOM_FIELDS,
  contract: CONTRACT_CUSTOM_FIELDS,
};

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatAssignee(row) {
  if (row?.assigned_to_name) return String(row.assigned_to_name).trim();
  const custom = parseJsonArray(row?.assigned_to_custom_names).filter(Boolean);
  return custom.join("; ");
}

function formatContactList(values) {
  const list = parseJsonArray(values).filter(Boolean);
  if (list.length) return list.join("; ");
  return "";
}

export function downloadCsv(content, filename) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function normalizeEnquiryRow(row) {
  return {
    id: row.id,
    enquiryNumber: row.enquiry_number || "",
    enquiryDate: row.enquiry_date || "",
    source: row.source || "",
    clientName: row.marketing_clients?.client_name || "",
    contactPerson: row.contact_person || "",
    contactNumber: row.contact_number || "",
    contactEmail: row.contact_email || "",
    siteLocation: row.site_location || "",
    assignedTo: formatAssignee(row),
    estimatedValue: row.estimated_value ?? "",
    expectedClosingDate: row.expected_closing_date || "",
    status: row.status || "",
    convertedToQuotation: row.is_converted_to_quotation ? "Yes" : "No",
    description: row.description || "",
    createdAt: row.created_at || "",
  };
}

export function normalizeQuotationRow(row) {
  return {
    id: row.id,
    quotationNumber: row.quotation_number || "",
    quotationDate: row.quotation_date || "",
    clientName: row.marketing_clients?.client_name || "",
    enquiryNumber: row.marketing_enquiries?.enquiry_number || "",
    totalAmount: row.total_amount ?? "",
    gstAmount: row.gst_amount ?? "",
    finalAmount: row.final_amount ?? "",
    status: row.status || "",
    createdAt: row.created_at || "",
  };
}

export function normalizeClientRow(row) {
  return {
    id: row.id,
    clientName: row.client_name || "",
    industry: row.industry || "",
    city: row.city || "",
    state: row.state || "",
    country: row.country || "",
    primaryContact: row.primary_contact_person || "",
    contactNumber: formatContactList(row.contact_numbers) || row.contact_number || "",
    contactEmail: formatContactList(row.contact_emails) || row.contact_email || "",
    createdAt: row.created_at || "",
  };
}

export function normalizeFollowUpRow(row) {
  const client =
    row.marketing_enquiries?.marketing_clients?.client_name ||
    row.marketing_quotations?.marketing_clients?.client_name ||
    "";
  return {
    id: row.id,
    followUpDate: row.follow_up_date || "",
    dueDate: row.due_date || "",
    status: row.status || "",
    enquiryNumber: row.marketing_enquiries?.enquiry_number || "",
    quotationNumber: row.marketing_quotations?.quotation_number || "",
    clientName: client,
    remarks: row.remarks || "",
    createdAt: row.created_at || "",
  };
}

export function normalizeSiteVisitRow(row) {
  return {
    id: row.id,
    visitDate: row.visit_date || "",
    visitorName: row.visitor_name || "",
    companyName: row.company_name || "",
    clientName: row.client_name || "",
    siteLocation: row.site_location || "",
    purpose: row.purpose_of_visit || "",
    totalExpense: row.total_expense ?? "",
    status: row.status || "",
  };
}

export function normalizeContractRow(row) {
  return {
    id: row.id,
    poNumber: row.po_number || "",
    poDate: row.po_date || "",
    clientName: row.marketing_clients?.client_name || "",
    quotationNumber: row.marketing_quotations?.quotation_number || "",
    enquiryNumber: row.marketing_enquiries?.enquiry_number || "",
    poValue: row.po_value ?? "",
    status: row.status || "",
    expectedDeliveryDate: row.expected_delivery_date || "",
    awardedDate: row.awarded_date || "",
  };
}

export async function fetchEnquiryReportRows(supabase, { fromDate, toDate } = {}) {
  let query = supabase
    .from("marketing_enquiries")
    .select(`*, marketing_clients:client_id (client_name)`)
    .order("enquiry_date", { ascending: false });
  if (fromDate) query = query.gte("enquiry_date", fromDate);
  if (toDate) query = query.lte("enquiry_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeEnquiryRow);
}

export async function fetchQuotationReportRows(supabase, { fromDate, toDate } = {}) {
  let query = supabase
    .from("marketing_quotations")
    .select(`
      *,
      marketing_enquiries:enquiry_id (enquiry_number),
      marketing_clients:client_id (client_name)
    `)
    .order("quotation_date", { ascending: false });
  if (fromDate) query = query.gte("quotation_date", fromDate);
  if (toDate) query = query.lte("quotation_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeQuotationRow);
}

export async function fetchClientReportRows(supabase) {
  const { data, error } = await supabase
    .from("marketing_clients")
    .select("*")
    .order("client_name", { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeClientRow);
}

export async function fetchFollowUpReportRows(supabase, { fromDate, toDate } = {}) {
  let query = supabase
    .from("marketing_follow_ups")
    .select(`
      *,
      marketing_enquiries:enquiry_id (enquiry_number, marketing_clients:client_id (client_name)),
      marketing_quotations:quotation_id (quotation_number, marketing_clients:client_id (client_name))
    `)
    .order("follow_up_date", { ascending: false });
  if (fromDate) query = query.gte("follow_up_date", fromDate);
  if (toDate) query = query.lte("follow_up_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeFollowUpRow);
}

export async function fetchSiteVisitReportRows(supabase, { fromDate, toDate } = {}) {
  let query = supabase
    .from("marketing_site_visits")
    .select("*")
    .order("visit_date", { ascending: false });
  if (fromDate) query = query.gte("visit_date", fromDate);
  if (toDate) query = query.lte("visit_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeSiteVisitRow);
}

export async function fetchContractReportRows(supabase, { fromDate, toDate } = {}) {
  let query = supabase
    .from("marketing_contracts")
    .select(`
      *,
      marketing_quotations:quotation_id (quotation_number),
      marketing_enquiries:enquiry_id (enquiry_number),
      marketing_clients:client_id (client_name)
    `)
    .order("po_date", { ascending: false });
  if (fromDate) query = query.gte("po_date", fromDate);
  if (toDate) query = query.lte("po_date", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeContractRow);
}

export function filterEnquiryPrebuilt(rows, reportType) {
  const today = isoToday();
  if (reportType === "open-pipeline") {
    return rows.filter(
      (r) =>
        r.convertedToQuotation !== "Yes" &&
        r.status !== "Closed" &&
        ["New", "In Progress", "Follow Up"].includes(r.status)
    );
  }
  if (reportType === "converted") {
    return rows.filter((r) => r.convertedToQuotation === "Yes");
  }
  if (reportType === "closing-overdue") {
    return rows.filter((r) => {
      if (r.convertedToQuotation === "Yes" || r.status === "Closed") return false;
      if (!r.expectedClosingDate) return false;
      return String(r.expectedClosingDate) < today;
    });
  }
  return rows;
}

export function filterQuotationPrebuilt(rows, reportType) {
  if (reportType === "sent") return rows.filter((r) => r.status === "Sent");
  if (reportType === "draft") return rows.filter((r) => r.status === "Draft");
  if (reportType === "accepted") return rows.filter((r) => r.status === "Accepted");
  if (reportType === "approved") return rows.filter((r) => r.status === "Approved");
  return rows;
}

export function filterFollowUpPrebuilt(rows, reportType) {
  const today = isoToday();
  if (reportType === "overdue") {
    return rows.filter((r) => r.followUpDate && String(r.followUpDate) < today && r.status !== "Completed");
  }
  if (reportType === "pending") {
    return rows.filter((r) => r.status === "Pending" || r.status === "Overdue");
  }
  return rows;
}

export function applyMarketingCustomFilters(rows, filters = {}) {
  let list = [...(rows || [])];
  const status = String(filters.status || "").trim();
  if (status && status !== "ALL") {
    list = list.filter((r) => String(r.status || "").toLowerCase() === status.toLowerCase());
  }
  const client = String(filters.clientSearch || "").trim().toLowerCase();
  if (client) {
    list = list.filter((r) => String(r.clientName || "").toLowerCase().includes(client));
  }
  const search = String(filters.search || "").trim().toLowerCase();
  if (search) {
    list = list.filter((r) =>
      Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(search))
    );
  }
  const source = String(filters.source || "").trim();
  if (source && source !== "ALL") {
    list = list.filter((r) => String(r.source || "") === source);
  }
  const assignee = String(filters.assigneeSearch || "").trim().toLowerCase();
  if (assignee) {
    list = list.filter((r) => String(r.assignedTo || "").toLowerCase().includes(assignee));
  }
  const minVal = Number(filters.minValue);
  if (Number.isFinite(minVal) && minVal > 0) {
    list = list.filter((r) => Number(r.estimatedValue || r.finalAmount || r.poValue || 0) >= minVal);
  }
  const maxVal = Number(filters.maxValue);
  if (Number.isFinite(maxVal) && maxVal > 0) {
    list = list.filter((r) => Number(r.estimatedValue || r.finalAmount || r.poValue || 0) <= maxVal);
  }
  return list;
}

export function getCustomFieldsForTab(tabId, reportType) {
  if (tabId === "followup" && reportType === "site-visits") return FIELD_MAP.siteVisit;
  if (tabId === "enquiry") return FIELD_MAP.enquiry;
  if (tabId === "quotation") return FIELD_MAP.quotation;
  if (tabId === "client") return FIELD_MAP.client;
  if (tabId === "followup") return FIELD_MAP.followup;
  if (tabId === "orders") return FIELD_MAP.contract;
  return [];
}

export function buildReportCsv(rows, columnIds, fieldDefs) {
  const cols = fieldDefs.filter((c) => columnIds.includes(c.id));
  const header = ["S.No", ...cols.map((c) => csvEscape(c.label))].join(",");
  const dateKeys = new Set([
    "enquiryDate",
    "expectedClosingDate",
    "quotationDate",
    "followUpDate",
    "dueDate",
    "visitDate",
    "poDate",
    "expectedDeliveryDate",
    "awardedDate",
    "createdAt",
  ]);
  const lines = (rows || []).map((row, rowIdx) =>
    [rowIdx + 1, ...cols.map((c) => {
      const raw = row[c.id];
      if (dateKeys.has(c.id)) return csvEscape(formatDateDdMmYyyy(raw) || raw);
      return csvEscape(raw);
    })].join(",")
  );
  return [header, ...lines].join("\r\n");
}

export function exportMarketingReportCsv(rows, columnIds, fieldDefs, filename) {
  downloadCsv(buildReportCsv(rows, columnIds, fieldDefs), filename);
}

export function formatMarketingReportError(err) {
  return err?.message || "Failed to load report data.";
}
