/**
 * Live breakout rows for Company Pulse popups.
 * Caps at DETAIL_FETCH_CAP; UI may show fewer with pagination.
 */

import { supabase } from "../../lib/supabase";
import { fetchLeaveRequests } from "../../lib/adminLeaveRequests";
import { inrShort } from "../finance/lib/formatters";

export const DETAIL_FETCH_CAP = 50;

function invNo(inv) {
  return String(inv?.taxInvoiceNumber || inv?.tax_invoice_number || inv?.invoiceNumber || inv?.id || "Invoice").trim();
}

function invAmt(inv) {
  return Number(inv?.totalAmount ?? inv?.total_amount ?? inv?.calculatedInvoiceAmount ?? 0) || 0;
}

function invPending(inv) {
  return Number(inv?.pendingAmount ?? inv?.pending_amount) || invAmt(inv);
}

function invDate(inv) {
  return String(inv?.invoiceDate || inv?.invoice_date || inv?.created_at || inv?.createdAt || "").slice(0, 10);
}

function invClient(inv) {
  return (
    inv?.clientName ||
    inv?.client_name ||
    inv?.customerName ||
    inv?.customer_name ||
    inv?.siteName ||
    inv?.site_name ||
    inv?.billingParty ||
    "—"
  );
}

function isPaid(inv) {
  return inv?.paymentStatus === true || inv?.payment_status === true;
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Map invoices already on the dashboard into breakout rows. */
export function rowsFromInvoices(invoices = [], { outstandingOnly = false } = {}) {
  let list = [...(invoices || [])];
  if (outstandingOnly) list = list.filter((inv) => !isPaid(inv));
  list.sort((a, b) => invDate(b).localeCompare(invDate(a)));
  return list.slice(0, DETAIL_FETCH_CAP).map((inv) => {
    const amount = outstandingOnly ? invPending(inv) : invAmt(inv);
    const paid = isPaid(inv);
    return {
      id: String(inv.id || invNo(inv)),
      label: invNo(inv),
      value: inrShort(amount),
      meta: `${invClient(inv)} · ${formatDisplayDate(invDate(inv))}`,
      status: paid ? "Paid" : "Outstanding",
      amount,
      date: invDate(inv),
    };
  });
}

export function rowsFromSites(siteRows = [], { mode = "profit" } = {}) {
  const rows = [...(siteRows || [])];
  if (mode === "weakest") rows.sort((a, b) => (a.profit || 0) - (b.profit || 0));
  else if (mode === "revenue") rows.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
  else rows.sort((a, b) => (b.profit || 0) - (a.profit || 0));
  return rows.slice(0, DETAIL_FETCH_CAP).map((row) => ({
    id: String(row.id || row.name),
    label: row.name,
    value: mode === "revenue" ? inrShort(row.revenue) : inrShort(row.profit),
    meta: `Rev ${inrShort(row.revenue)} · Margin ${(Number(row.margin) || 0).toFixed(1)}%`,
    status: row.profit < 0 ? "Loss" : (Number(row.margin) || 0) < 8 ? "Thin" : "OK",
    amount: mode === "revenue" ? row.revenue : row.profit,
  }));
}

export function rowsFromDepartments(departments = []) {
  return [...(departments || [])]
    .slice()
    .sort((a, b) => (a.pct || 0) - (b.pct || 0))
    .slice(0, DETAIL_FETCH_CAP)
    .map((row) => ({
      id: row.name,
      label: row.name,
      value: row.expected ? `${(row.pct || 0).toFixed(0)}%` : "—",
      meta: `Present ${row.present || 0}/${row.expected || 0} · Late ${row.late || 0} · Absent ${row.absent || 0}`,
      status: (row.absent || 0) > 0 ? "Absent" : (row.late || 0) > 0 ? "Late" : "OK",
      amount: row.pct || 0,
    }));
}

async function fetchPendingLeaveRows() {
  try {
    const { rows } = await fetchLeaveRequests({ status: "pending", page: 1, pageSize: DETAIL_FETCH_CAP });
    return (rows || []).map((row) => {
      const person = row?.employee?.full_name || row?.employee_code || "Employee";
      const from = String(row.from_date || "").slice(0, 10);
      const to = String(row.to_date || "").slice(0, 10);
      return {
        id: `leave-${row.id}`,
        label: person,
        value: `${row.days ?? "—"} day(s)`,
        meta: `${row.leave_type_code || "Leave"} · ${formatDisplayDate(from)}${to && to !== from ? ` → ${formatDisplayDate(to)}` : ""}`,
        status: String(row.status || "pending"),
        date: from,
      };
    });
  } catch (err) {
    console.warn("[pulseDetailData] leave", err);
    return [];
  }
}

async function fetchManpowerRows() {
  try {
    const { data, error } = await supabase
      .from("manpower_enquiries")
      .select("id, enquiry_number, client, status, due_date, location, project_estimation, vertical")
      .order("created_at", { ascending: false })
      .limit(DETAIL_FETCH_CAP);
    if (error) throw error;
    return (data || []).map((row) => ({
      id: String(row.id),
      label: row.enquiry_number || row.client || `Enquiry ${row.id}`,
      value: row.status || "—",
      meta: [row.client, row.location, row.due_date ? `Due ${formatDisplayDate(row.due_date)}` : null]
        .filter(Boolean)
        .join(" · "),
      status: row.status || "—",
      amount: Number(row.project_estimation) || 0,
      date: String(row.due_date || "").slice(0, 10),
    }));
  } catch (err) {
    console.warn("[pulseDetailData] manpower", err);
    return [];
  }
}

async function fetchMarketingRows() {
  try {
    const { data, error } = await supabase
      .from("marketing_enquiries")
      .select("*")
      .order("id", { ascending: false })
      .limit(DETAIL_FETCH_CAP);
    if (error) throw error;
    return (data || []).map((row) => {
      const label =
        row.enquiry_number ||
        row.enquiry_no ||
        row.client_name ||
        row.client ||
        row.company ||
        row.customer_name ||
        `Enquiry ${row.id}`;
      const when = row.updated_at || row.created_at || row.enquiry_date || "";
      return {
        id: String(row.id),
        label,
        value: row.status || row.stage || row.project_stage || "—",
        meta: [row.company || row.client_name || row.client, row.project_name || row.project, formatDisplayDate(when)]
          .filter(Boolean)
          .join(" · "),
        status: row.status || row.stage || "—",
        date: String(when).slice(0, 10),
      };
    });
  } catch (err) {
    console.warn("[pulseDetailData] marketing", err);
    return [];
  }
}

async function fetchAmcRows() {
  try {
    const { data, error } = await supabase
      .from("amc_contracts")
      .select("id, contract_no, customer_name, status, end_date, start_date")
      .order("end_date", { ascending: true })
      .limit(DETAIL_FETCH_CAP);
    if (error) throw error;
    return (data || []).map((row) => ({
      id: String(row.id),
      label: row.contract_no || row.customer_name || `Contract ${row.id}`,
      value: row.status || "—",
      meta: [row.customer_name, row.end_date ? `Ends ${formatDisplayDate(row.end_date)}` : null].filter(Boolean).join(" · "),
      status: row.status || "—",
      date: String(row.end_date || "").slice(0, 10),
    }));
  } catch (err) {
    console.warn("[pulseDetailData] amc", err);
    return [];
  }
}

async function fetchTenderRows() {
  try {
    const { data, error } = await supabase
      .from("tenders")
      .select("id, client, enquiry_number, tender_number, due_date, status, estimation, created_at")
      .order("created_at", { ascending: false })
      .limit(DETAIL_FETCH_CAP);
    if (error) throw error;
    return (data || []).map((row) => ({
      id: String(row.id),
      label: row.tender_number || row.enquiry_number || row.client || `Tender ${row.id}`,
      value: row.status || "—",
      meta: [row.client, row.due_date ? `Due ${formatDisplayDate(row.due_date)}` : null, row.estimation ? inrShort(row.estimation) : null]
        .filter(Boolean)
        .join(" · "),
      status: row.status || "—",
      amount: Number(row.estimation) || 0,
      date: String(row.due_date || row.created_at || "").slice(0, 10),
    }));
  } catch (err) {
    console.warn("[pulseDetailData] tenders", err);
    return [];
  }
}

async function fetchPeopleSample() {
  try {
    const { data, error } = await supabase
      .from("admin_ifsp_employee_master")
      .select("id, full_name, employee_code, department, designation, status")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .limit(DETAIL_FETCH_CAP);
    if (error) throw error;
    return (data || []).map((row) => ({
      id: String(row.id),
      label: row.full_name || row.employee_code || `Employee ${row.id}`,
      value: row.department || "—",
      meta: [row.employee_code, row.designation].filter(Boolean).join(" · "),
      status: row.status || "Active",
    }));
  } catch (err) {
    console.warn("[pulseDetailData] people", err);
    return [];
  }
}

/**
 * Resolve live rows for a detail card.
 * @param {object} detail - from buildPulseDetail (may include fetchKey)
 * @param {object} ctx - invoices, pl, attendance, etc.
 */
export async function loadPulseDetailRows(detail, ctx = {}) {
  const key = detail?.fetchKey || detail?.id || "";
  const invoices = ctx.invoices || [];
  const pl = ctx.pl || {};
  const attendance = ctx.attendance || {};

  switch (key) {
    case "people":
    case "module:hr":
    case "module:admin": {
      const [leave, people] = await Promise.all([fetchPendingLeaveRows(), fetchPeopleSample()]);
      if (leave.length) {
        return { rows: leave, columns: "leave", emptyHint: null };
      }
      const depts = rowsFromDepartments(attendance.departments || []);
      if (depts.length) return { rows: depts, columns: "department", emptyHint: null };
      return { rows: people, columns: "people", emptyHint: people.length ? null : "No people records available." };
    }
    case "attendance": {
      const depts = rowsFromDepartments(attendance.departments || []);
      if (depts.length) return { rows: depts, columns: "department", emptyHint: null };
      return { rows: await fetchPendingLeaveRows(), columns: "leave", emptyHint: "No department attendance yet." };
    }
    case "revenue":
    case "profit":
    case "sites":
    case "books":
    case "module:finance":
      return {
        rows: rowsFromSites(pl.siteRows || [], { mode: key === "revenue" ? "revenue" : "weakest" }),
        columns: "site",
        emptyHint: "No site ledger figures in this range.",
      };
    case "billed":
    case "billRate":
      return {
        rows: rowsFromInvoices(invoices, { outstandingOnly: false }),
        columns: "invoice",
        emptyHint: "No invoices in this range.",
      };
    case "outstanding":
    case "collectRate":
      return {
        rows: rowsFromInvoices(invoices, { outstandingOnly: true }),
        columns: "invoice",
        emptyHint: "No outstanding invoices in this range.",
      };
    case "module:commercialMt":
      return { rows: await fetchManpowerRows(), columns: "enquiry", emptyHint: "No manpower enquiries found." };
    case "module:marketing":
      return { rows: await fetchMarketingRows(), columns: "enquiry", emptyHint: "No marketing enquiries found." };
    case "module:amc":
      return { rows: await fetchAmcRows(), columns: "contract", emptyHint: "No AMC contracts found." };
    case "module:fireTender":
      return { rows: await fetchTenderRows(), columns: "tender", emptyHint: "No tender records found." };
    case "module:billing":
      return {
        rows: rowsFromInvoices(invoices, { outstandingOnly: false }),
        columns: "invoice",
        emptyHint: "No invoices loaded.",
      };
    case "health":
      return { rows: detail.rows || [], columns: "generic", emptyHint: null };
    default:
      if (detail?.rows?.length) return { rows: detail.rows, columns: "generic", emptyHint: null };
      return { rows: [], columns: "generic", emptyHint: "Open the module for the full register." };
  }
}

export const COLUMN_PRESETS = {
  leave: [
    { key: "label", label: "Person" },
    { key: "value", label: "Days" },
    { key: "status", label: "Status" },
    { key: "meta", label: "Details" },
  ],
  people: [
    { key: "label", label: "Name" },
    { key: "value", label: "Department" },
    { key: "meta", label: "Code / role" },
    { key: "status", label: "Status" },
  ],
  department: [
    { key: "label", label: "Department" },
    { key: "value", label: "Present %" },
    { key: "meta", label: "Cut" },
    { key: "status", label: "Flag" },
  ],
  site: [
    { key: "label", label: "Site" },
    { key: "value", label: "Amount" },
    { key: "meta", label: "Books" },
    { key: "status", label: "Flag" },
  ],
  invoice: [
    { key: "label", label: "Invoice" },
    { key: "value", label: "Amount" },
    { key: "meta", label: "Client / date" },
    { key: "status", label: "Payment" },
  ],
  enquiry: [
    { key: "label", label: "Enquiry" },
    { key: "value", label: "Status" },
    { key: "meta", label: "Details" },
  ],
  contract: [
    { key: "label", label: "Contract" },
    { key: "value", label: "Status" },
    { key: "meta", label: "Customer / end" },
  ],
  tender: [
    { key: "label", label: "Tender" },
    { key: "value", label: "Status" },
    { key: "meta", label: "Client / due" },
  ],
  generic: [
    { key: "label", label: "Item" },
    { key: "value", label: "Value" },
    { key: "meta", label: "Notes" },
  ],
};
