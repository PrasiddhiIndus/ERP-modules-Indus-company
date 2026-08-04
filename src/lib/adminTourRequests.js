/**
 * Tour workflow — read-only inbox for ERP Tour Approvals (mirrors leave inbox).
 * Approve/reject workflow is unchanged and not handled here.
 */

import { supabase } from "./supabase";
import { formatDateDdMmYyyy } from "../utils/dateDisplay";
import { isSupabaseRealtimeEnabled } from "./supabaseConfig";
import { fetchApiWithAuth } from "./apiBase";
import {
  EMPLOYEE_MASTER_TABLE,
  INDUS_ONE_TOUR_TABLES,
  normalizeAttendanceEmpCode,
} from "./attendanceDaily";

export const INDUS_ONE_SCHEMA = "indus_one";

const INDUS_ONE = INDUS_ONE_SCHEMA;
const LMS_TOUR_TABLE = INDUS_ONE_TOUR_TABLES.lmsRequests;
const ADMIN_TOUR_TABLE = INDUS_ONE_TOUR_TABLES.adminRequests;
const PAGE_SIZE_DEFAULT = 50;
const TOUR_FETCH_CAP = 2000;

/** Status filter dropdown (Tour Approvals) — same options as Leave Approvals. */
export const TOUR_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "withdrawn", label: "Withdrawn" },
];

function normalizeWorkflowStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function adminStatusFromLms(status) {
  const s = normalizeWorkflowStatus(status);
  if (s === "draft" || s === "submitted" || s === "pending_approval") return "pending";
  if (s === "withdraw" || s === "withdrawn") return "withdrawn";
  return s;
}

function effectiveTourWorkflowStatus(row) {
  const overall = normalizeWorkflowStatus(row?.overall_status);
  const status = normalizeWorkflowStatus(row?.status);
  return overall || status;
}

function resolveInboxDisplayStatus(adminEffective, lmsStatus) {
  const a = normalizeWorkflowStatus(adminEffective);
  const l = adminStatusFromLms(lmsStatus);
  if (a === "approved" || l === "approved") return "approved";
  if (a === "rejected" || l === "rejected") return "rejected";
  return "pending";
}

function lmsTourRequestsTable() {
  return supabase.schema(INDUS_ONE).from(LMS_TOUR_TABLE);
}

function adminTourRequestsTable() {
  return supabase.schema(INDUS_ONE).from(ADMIN_TOUR_TABLE);
}

function employeeSnapshot(employee) {
  return employee
    ? {
        full_name: employee.full_name,
        employee_id: employee.employee_id,
        employee_code: employee.employee_code,
        department: employee.department,
        designation: employee.designation,
      }
    : {
        full_name: null,
        employee_id: null,
        employee_code: null,
        department: null,
        designation: null,
      };
}

async function fetchEmployeesByUserIds(userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) return {};

  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, user_id, full_name, employee_id, employee_code, department, designation")
    .in("user_id", unique)
    .eq("status", "Active");

  if (error) throw error;

  const byUserId = {};
  for (const row of data || []) {
    if (!row.user_id) continue;
    if (!byUserId[row.user_id]) byUserId[row.user_id] = row;
  }
  return byUserId;
}

async function fetchEmployeesByMasterIds(masterIds) {
  const unique = [...new Set((masterIds || []).filter(Boolean))];
  if (!unique.length) return {};

  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, user_id, full_name, employee_id, employee_code, department, designation")
    .in("id", unique);

  if (error) throw error;

  const byMasterId = {};
  for (const row of data || []) {
    if (row.id == null) continue;
    byMasterId[row.id] = row;
  }
  return byMasterId;
}

async function fetchEmployeesByCodes(codes) {
  const unique = [
    ...new Set(
      (codes || [])
        .map((c) => normalizeAttendanceEmpCode(c))
        .filter(Boolean)
    ),
  ];
  if (!unique.length) return {};

  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, user_id, full_name, employee_id, employee_code, department, designation")
    .in("employee_code", unique);

  if (error) throw error;

  const byCode = {};
  for (const row of data || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    if (!code) continue;
    if (!byCode[code]) byCode[code] = row;
  }
  return byCode;
}

async function fetchEmployeeMasterIdsForSearch(needle) {
  const n = String(needle || "").trim();
  if (!n) return [];

  const pattern = `%${n.replace(/%/g, "\\%")}%`;
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id")
    .or(`full_name.ilike.${pattern},employee_code.ilike.${pattern},employee_id.ilike.${pattern}`);

  if (error) throw error;
  return [...new Set((data || []).map((r) => r.id).filter((id) => id != null))];
}

async function fetchUserIdsForEmployeeSearch(needle) {
  const n = String(needle || "").trim();
  if (!n) return [];

  const pattern = `%${n.replace(/%/g, "\\%")}%`;
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("user_id")
    .or(`full_name.ilike.${pattern},employee_code.ilike.${pattern},employee_id.ilike.${pattern}`)
    .not("user_id", "is", null);

  if (error) throw error;
  return [...new Set((data || []).map((r) => r.user_id).filter(Boolean))];
}

async function fetchEmployeeCodesForSearch(needle) {
  const n = String(needle || "").trim();
  if (!n) return [];

  const pattern = `%${n.replace(/%/g, "\\%")}%`;
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("employee_code")
    .or(`full_name.ilike.${pattern},employee_code.ilike.${pattern},employee_id.ilike.${pattern}`);

  if (error) throw error;
  return [
    ...new Set(
      (data || [])
        .map((r) => normalizeAttendanceEmpCode(r.employee_code))
        .filter(Boolean)
    ),
  ];
}

export function tourLocationLabel(row) {
  return (
    String(row?.location || "").trim() ||
    String(row?.destination || "").trim() ||
    String(row?.place || "").trim() ||
    String(row?.tour_location || "").trim() ||
    "—"
  );
}

export function tourReasonLabel(row) {
  return (
    String(row?.reason || "").trim() ||
    String(row?.purpose || "").trim() ||
    String(row?.remarks || "").trim() ||
    ""
  );
}

export function tourDaysCount(row) {
  if (row?.days != null && row.days !== "") {
    const n = Number(row.days);
    if (Number.isFinite(n)) return n;
  }
  const from = row?.from_date;
  const to = row?.to_date;
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

export function formatTourDateRange(fromDate, toDate) {
  if (!fromDate && !toDate) return "—";
  if (fromDate && toDate && fromDate === toDate) return formatDateDdMmYyyy(fromDate) || fromDate;
  const a = fromDate ? formatDateDdMmYyyy(fromDate) || fromDate : "—";
  const b = toDate ? formatDateDdMmYyyy(toDate) || toDate : "—";
  return `${a} – ${b}`;
}

function mergeLmsAndAdminTourRows(lmsRows, adminRows) {
  const byId = new Map();

  for (const row of adminRows || []) {
    if (!row?.id) continue;
    const effective = effectiveTourWorkflowStatus(row) || normalizeWorkflowStatus(row.status);
    byId.set(row.id, {
      ...row,
      status: resolveInboxDisplayStatus(effective, effective),
      overall_status: normalizeWorkflowStatus(row.overall_status) || null,
      _from_admin: true,
    });
  }

  for (const row of lmsRows || []) {
    if (!row?.id) continue;
    const lmsStatus = normalizeWorkflowStatus(row.status);
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, {
        ...row,
        status: resolveInboxDisplayStatus(null, lmsStatus),
        overall_status:
          normalizeWorkflowStatus(row.overall_status) || adminStatusFromLms(lmsStatus),
        _from_lms: true,
      });
      continue;
    }

    const adminEffective = effectiveTourWorkflowStatus(existing);
    byId.set(row.id, {
      ...row,
      ...existing,
      reason: existing.reason || row.reason || row.purpose || "",
      purpose: existing.purpose || row.purpose || "",
      location: existing.location || row.location || row.destination || "",
      destination: existing.destination || row.destination || "",
      from_date: existing.from_date || row.from_date,
      to_date: existing.to_date || row.to_date,
      days: existing.days ?? row.days,
      submitted_at: existing.submitted_at || row.submitted_at,
      user_id: existing.user_id || row.user_id,
      status: resolveInboxDisplayStatus(adminEffective, lmsStatus),
      overall_status:
        existing.overall_status ||
        normalizeWorkflowStatus(row.overall_status) ||
        adminStatusFromLms(lmsStatus),
      approver_name: existing.approver_name ?? row.approver_name ?? null,
      approver_user_id: existing.approver_user_id ?? row.approver_user_id ?? null,
      approver_employee_code: existing.approver_employee_code ?? row.approver_employee_code ?? null,
      remarks: existing.remarks ?? row.remarks ?? null,
      decided_at: existing.decided_at ?? row.decided_at ?? null,
      employee_master_id: existing.employee_master_id ?? null,
      employee_code: existing.employee_code ?? row.employee_code ?? null,
      _from_lms: true,
      _from_admin: true,
    });
  }

  return [...byId.values()];
}

function normalizeMergedTourRows(rows, employeeByMasterId, employeeByUserId, employeeByCode) {
  return (rows || []).map((row) => {
    const byMaster = row.employee_master_id != null ? employeeByMasterId[row.employee_master_id] : null;
    const byUser = row.user_id ? employeeByUserId[row.user_id] : null;
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const byCode = code ? employeeByCode[code] : null;
    const employee = byMaster || byUser || byCode || null;
    const empCode =
      normalizeAttendanceEmpCode(row.employee_code || employee?.employee_code) || null;
    return {
      ...row,
      employee_code: empCode,
      employee_master_id: row.employee_master_id ?? employee?.id ?? null,
      employee: employeeSnapshot(employee),
      location_label: tourLocationLabel(row),
      reason_label: tourReasonLabel(row),
      days: tourDaysCount(row),
    };
  });
}

function rowMatchesDateRange(row, fromDate, toDate) {
  const from = row?.from_date || "";
  const to = row?.to_date || "";
  if (fromDate && to && to < fromDate) return false;
  if (toDate && from && from > toDate) return false;
  return true;
}

/**
 * Prefer service-role API so ERP admins see ALL employees' tours (RLS otherwise
 * often returns only the signed-in user's rows). Falls back to direct Supabase.
 */
async function loadTourInboxSourceRows() {
  try {
    const result = await fetchApiWithAuth("/api/admin/tour-requests");
    if (result.ok && (Array.isArray(result.data?.lmsRows) || Array.isArray(result.data?.adminRows))) {
      return {
        lmsRows: result.data.lmsRows || [],
        adminRows: result.data.adminRows || [],
        source: "api",
      };
    }
    if (result.error) {
      console.warn("Tour inbox API unavailable; falling back to direct Supabase:", result.error);
    }
  } catch (err) {
    console.warn("Tour inbox API failed; falling back to direct Supabase:", err?.message || err);
  }

  const [lmsRes, adminRes] = await Promise.all([
    lmsTourRequestsTable()
      .select("*")
      .order("submitted_at", { ascending: false })
      .range(0, TOUR_FETCH_CAP - 1),
    adminTourRequestsTable()
      .select("*")
      .order("submitted_at", { ascending: false })
      .range(0, TOUR_FETCH_CAP - 1),
  ]);

  if (lmsRes.error && adminRes.error) {
    throw lmsRes.error || adminRes.error;
  }
  if (lmsRes.error && !adminRes.error) {
    console.warn("tour_requests fetch failed; using admin_tour_requests only:", lmsRes.error.message);
  }
  if (adminRes.error && !lmsRes.error) {
    console.warn("admin_tour_requests fetch failed; using tour_requests only:", adminRes.error.message);
  }

  return {
    lmsRows: lmsRes.error ? [] : lmsRes.data || [],
    adminRows: adminRes.error ? [] : adminRes.data || [],
    source: "supabase",
  };
}

export async function fetchTourStatusCounts() {
  const { lmsRows, adminRows } = await loadTourInboxSourceRows();
  const merged = mergeLmsAndAdminTourRows(lmsRows, adminRows);
  const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0, withdrawn: 0, all: merged.length };
  for (const row of merged) {
    const s = String(row.status || "").toLowerCase();
    if (s === "approved") counts.approved += 1;
    else if (s === "rejected") counts.rejected += 1;
    else counts.pending += 1;
  }
  return counts;
}

/**
 * Read-only inbox list from both `indus_one.tour_requests` and `indus_one.admin_tour_requests`.
 */
export async function fetchTourRequests(opts = {}) {
  const {
    status,
    empSearch = "",
    fromDate = "",
    toDate = "",
    page = 1,
    pageSize = PAGE_SIZE_DEFAULT,
  } = opts;

  const { lmsRows, adminRows } = await loadTourInboxSourceRows();
  let merged = mergeLmsAndAdminTourRows(lmsRows, adminRows);

  const needle = empSearch.trim();
  if (needle) {
    const [masterIds, userIds, empCodes] = await Promise.all([
      fetchEmployeeMasterIdsForSearch(needle),
      fetchUserIdsForEmployeeSearch(needle),
      fetchEmployeeCodesForSearch(needle),
    ]);
    if (!masterIds.length && !userIds.length && !empCodes.length) {
      return { rows: [], total: 0, page, pageSize };
    }
    const masterSet = new Set(masterIds);
    const userSet = new Set(userIds);
    const codeSet = new Set(empCodes);
    merged = merged.filter(
      (row) =>
        (row.employee_master_id != null && masterSet.has(row.employee_master_id)) ||
        (row.user_id && userSet.has(row.user_id)) ||
        (normalizeAttendanceEmpCode(row.employee_code) &&
          codeSet.has(normalizeAttendanceEmpCode(row.employee_code)))
    );
  }

  const tab = normalizeWorkflowStatus(status);
  if (tab && tab !== "all") {
    merged = merged.filter((row) => {
      const s = String(row.status || "").toLowerCase();
      if (tab === "pending") return s === "pending";
      return s === tab;
    });
  }

  if (fromDate || toDate) {
    merged = merged.filter((row) => rowMatchesDateRange(row, fromDate, toDate));
  }

  merged.sort((a, b) => {
    const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return tb - ta;
  });

  const total = merged.length;
  const safePage = Math.max(1, page);
  const from = (safePage - 1) * pageSize;
  const pageRows = merged.slice(from, from + pageSize);

  const [employeeByMasterId, employeeByUserId, employeeByCode] = await Promise.all([
    fetchEmployeesByMasterIds(pageRows.map((r) => r.employee_master_id)),
    fetchEmployeesByUserIds(pageRows.map((r) => r.user_id)),
    fetchEmployeesByCodes(pageRows.map((r) => r.employee_code)),
  ]);

  const rows = normalizeMergedTourRows(
    pageRows,
    employeeByMasterId,
    employeeByUserId,
    employeeByCode
  );

  return {
    rows,
    total,
    page: safePage,
    pageSize,
  };
}

/**
 * Subscribe to tour workflow + register rows (approved tours → T on daily register).
 * Requires tables in publication `supabase_realtime` (see migration 20260624150000).
 */
export function subscribeTourWorkflowRealtime(onChange) {
  if (!isSupabaseRealtimeEnabled() || typeof onChange !== "function") {
    return () => {};
  }

  const channel = supabase
    .channel("erp-indus-one-tour-workflow")
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE_SCHEMA, table: INDUS_ONE_TOUR_TABLES.lmsRequests },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE_SCHEMA, table: INDUS_ONE_TOUR_TABLES.adminRequests },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE_SCHEMA, table: INDUS_ONE_TOUR_TABLES.attendanceMarks },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "admin_attendance_register" },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
