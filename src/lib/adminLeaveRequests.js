/**
 * Leave workflow — reads Indus One `indus_one.leave_requests` (LMS apply).
 * Approve/reject mirrors to `indus_one.admin_leave_requests` then updates status so
 * DB triggers apply attendance + balance; LMS row is updated in parallel.
 */

import { supabase } from "./supabase";
import { formatDateDdMmYyyy } from "../utils/dateDisplay";
import { isSupabaseRealtimeEnabled } from "./supabaseConfig";
import {
  EMPLOYEE_MASTER_TABLE,
  normalizeAttendanceEmpCode,
  REGISTER_MARKS_DB_ALLOWED,
} from "./attendanceDaily";

export const INDUS_ONE_SCHEMA = "indus_one";

/** Indus One tables used by ERP leave screens (LMS may add more over time). */
export const INDUS_ONE_LEAVE_TABLES = {
  lmsRequests: "leave_requests",
  adminRequests: "admin_leave_requests",
  balanceLedger: "admin_leave_balance_ledger",
  attendanceMarks: "admin_leave_attendance_marks",
  balancesYearly: "employee_leave_balances_yearly",
  carryForwardRules: "leave_carry_forward_rules",
  plEncashPref: "employee_pl_encash_pref",
};

const INDUS_ONE = INDUS_ONE_SCHEMA;
const LMS_LEAVE_TABLE = INDUS_ONE_LEAVE_TABLES.lmsRequests;
const ADMIN_LEAVE_TABLE = INDUS_ONE_LEAVE_TABLES.adminRequests;
const PAGE_SIZE_DEFAULT = 50;

/** Status filter dropdown (Leave Approvals). */
export const LEAVE_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

/** LMS leave_requests statuses treated as awaiting a decision. */
const PENDING_LMS_STATUSES = ["pending", "draft", "submitted", "pending_approval"];

const TERMINAL_STATUSES = ["approved", "rejected", "cancelled"];

function lmsLeaveRequestsTable() {
  return supabase.schema(INDUS_ONE).from(LMS_LEAVE_TABLE);
}

function adminLeaveRequestsTable() {
  return supabase.schema(INDUS_ONE).from(ADMIN_LEAVE_TABLE);
}

function decisionPayload({ approverUserId, approverName, remarks }) {
  return {
    remarks: remarks?.trim() ? remarks.trim() : null,
    approver_user_id: approverUserId || null,
    approver_name: approverName || null,
    decided_at: new Date().toISOString(),
  };
}

function noRowsUpdatedError(detail) {
  const err = new Error(
    detail ||
      "Request was already decided or could not be updated. Refresh the list and try again."
  );
  err.code = "LEAVE_REQUEST_NOT_UPDATED";
  return err;
}

function normalizeWorkflowStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

/** LMS draft / submitted → admin pending (admin table has no draft status). */
function adminStatusFromLms(status) {
  const s = normalizeWorkflowStatus(status);
  if (s === "draft" || s === "submitted" || s === "pending_approval") return "pending";
  return s;
}

function isOpenLmsStatus(status) {
  return PENDING_LMS_STATUSES.includes(normalizeWorkflowStatus(status));
}

async function fetchAdminLeaveRow(id) {
  const { data, error } = await adminLeaveRequestsTable().select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

function leaveTypeCodeFromRow(row) {
  return String(row?.leave_type_code ?? row?.leave_type ?? "").trim();
}

/** Map LMS leave_type (code or label) to hr_leave_types.code for triggers / balances. */
export function resolveLeaveTypeCode(raw, byCode = {}) {
  const c = String(raw ?? "").trim();
  if (!c) return c;
  if (byCode[c]) return byCode[c].code;
  const upper = c.toUpperCase();
  for (const row of Object.values(byCode)) {
    if (String(row?.code ?? "").trim().toUpperCase() === upper) return row.code;
    if (String(row?.label ?? "").trim().toUpperCase() === upper) return row.code;
  }
  return c;
}

/** Register mark written on approve (matches DB trigger: prefer PL/CL/SL code over generic L). */
export function registerMarkForLeaveType(raw, byCode = {}) {
  const code = resolveLeaveTypeCode(raw, byCode);
  const upper = String(code || "").trim().toUpperCase();
  if (REGISTER_MARKS_DB_ALLOWED.has(upper)) return upper;
  const row = byCode[code] || byCode[upper];
  const mark = String(row?.attendance_marks?.[0] ?? "").trim().toUpperCase();
  if (mark && !["L", "LEAVE", "A"].includes(mark) && REGISTER_MARKS_DB_ALLOWED.has(mark)) return mark;
  return upper || "L";
}

let leaveTypesByCodeCache = null;

async function getLeaveTypesByCode() {
  if (leaveTypesByCodeCache) return leaveTypesByCodeCache;
  const { byCode } = await fetchLeaveTypes();
  leaveTypesByCodeCache = byCode;
  return byCode;
}

/** Batch-load employee master by auth user_id (LMS leave_requests.user_id). */
async function fetchEmployeesByUserIds(userIds) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) return {};

  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, user_id, full_name, employee_id, employee_code, department, designation")
    .in("user_id", unique);

  if (error) throw error;

  const byUserId = {};
  for (const row of data || []) {
    if (!row.user_id) continue;
    if (!byUserId[row.user_id]) byUserId[row.user_id] = row;
  }
  return byUserId;
}

function normalizeLmsLeaveRows(rows, employeeByUserId) {
  return (rows || []).map((row) => {
    const employee = employeeByUserId[row.user_id];
    const empCode = normalizeAttendanceEmpCode(employee?.employee_code) || null;
    return {
      ...row,
      leave_type_code: leaveTypeCodeFromRow(row),
      employee_code: empCode,
      employee_master_id: employee?.id ?? null,
      employee: employee
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
          },
    };
  });
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

async function fetchLmsLeaveRequestById(id) {
  const { data, error } = await lmsLeaveRequestsTable().select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Leave request not found.");
  return { ...data, status: normalizeWorkflowStatus(data.status) };
}

async function resolveEmployeeByUserId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("id, user_id, full_name, employee_id, employee_code, department, designation")
    .eq("user_id", userId)
    .eq("status", "Active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

/**
 * Insert mirror row for attendance triggers (same id as LMS). Skip if already exists.
 */
async function ensureAdminLeaveRequestMirror(lmsRow) {
  const employee = await resolveEmployeeByUserId(lmsRow.user_id);
  const empCode = normalizeAttendanceEmpCode(employee?.employee_code);
  if (!employee?.id || !empCode) {
    throw new Error(
      "This applicant is not linked to Employee Master (missing user_id → employee_code). " +
        "Link the Indus One user to an active employee in IFSPL Employee Master before approving."
    );
  }

  const { data: existing, error: existErr } = await adminLeaveRequestsTable()
    .select("id, status")
    .eq("id", lmsRow.id)
    .maybeSingle();
  if (existErr) throw existErr;

  const byCode = await getLeaveTypesByCode();
  const leaveTypeCode = resolveLeaveTypeCode(leaveTypeCodeFromRow(lmsRow), byCode);

  if (!existing) {
    const { error: insertErr } = await adminLeaveRequestsTable().insert({
      id: lmsRow.id,
      employee_master_id: employee.id,
      employee_code: empCode,
      user_id: lmsRow.user_id,
      leave_type_code: leaveTypeCode,
      from_date: lmsRow.from_date,
      to_date: lmsRow.to_date,
      days: lmsRow.days,
      reason: lmsRow.reason ?? "",
      status: adminStatusFromLms(lmsRow.status),
      approver_user_id: lmsRow.approver_user_id,
      approver_name: lmsRow.approver_name,
      remarks: lmsRow.remarks,
      submitted_at: lmsRow.submitted_at,
      decided_at: lmsRow.decided_at,
      created_at: lmsRow.created_at,
      updated_at: lmsRow.updated_at,
    });
    if (insertErr) throw insertErr;
  } else {
    const { error: syncErr } = await adminLeaveRequestsTable()
      .update({
        leave_type_code: leaveTypeCode,
        employee_code: empCode,
        employee_master_id: employee.id,
      })
      .eq("id", lmsRow.id);
    if (syncErr) throw syncErr;
  }

  return { employee, empCode };
}

async function syncLmsLeaveStatus(id, lmsOpenStatuses, patch) {
  const normalizedOpen = lmsOpenStatuses.map(normalizeWorkflowStatus);
  const { data, error } = await lmsLeaveRequestsTable()
    .update(patch)
    .eq("id", id)
    .in("status", normalizedOpen)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, status: normalizeWorkflowStatus(data.status) };
}

async function finishDecisionRow(lmsRow) {
  const employee = await resolveEmployeeByUserId(lmsRow.user_id);
  const byUser = employee ? { [lmsRow.user_id]: employee } : {};
  return normalizeLmsLeaveRows([lmsRow], byUser)[0];
}

/**
 * Mirror → update admin_leave_requests (triggers) → update leave_requests (LMS UI).
 * Recovers when admin was updated but LMS row was left open after a failed partial save.
 */
async function applyLeaveDecision(id, { lmsExpectedStatuses, adminExpectedStatus, newStatus, decision }) {
  const lmsRow = await fetchLmsLeaveRequestById(id);
  const lmsOpenStatuses = lmsExpectedStatuses.map(normalizeWorkflowStatus);
  const targetStatus = normalizeWorkflowStatus(newStatus);

  const patch = {
    status: targetStatus,
    ...decisionPayload(decision),
  };

  if (lmsRow.status === targetStatus) {
    return finishDecisionRow(lmsRow);
  }

  if (!lmsOpenStatuses.includes(lmsRow.status)) {
    throw noRowsUpdatedError(
      `Request status is "${lmsRow.status}" and cannot be changed to ${targetStatus}. Refresh the list.`
    );
  }

  await ensureAdminLeaveRequestMirror(lmsRow);

  const adminRow = await fetchAdminLeaveRow(id);
  const adminStatus = normalizeWorkflowStatus(adminRow?.status);
  const expectedAdmin = normalizeWorkflowStatus(adminExpectedStatus);

  if (adminStatus === targetStatus) {
    const lmsSynced = await syncLmsLeaveStatus(id, lmsOpenStatuses, patch);
    if (!lmsSynced) {
      throw noRowsUpdatedError(
        "Attendance was already updated but LMS status is out of sync. Refresh, or contact support."
      );
    }
    return finishDecisionRow(lmsSynced);
  }

  const adminFromStatuses = new Set([expectedAdmin, adminStatusFromLms(lmsRow.status)]);
  if (adminStatus) adminFromStatuses.add(adminStatus);

  const { data: adminUpdated, error: adminErr } = await adminLeaveRequestsTable()
    .update(patch)
    .eq("id", id)
    .in("status", [...adminFromStatuses].filter(Boolean))
    .select("*")
    .maybeSingle();

  if (adminErr) throw adminErr;

  if (!adminUpdated) {
    if (adminStatus && TERMINAL_STATUSES.includes(adminStatus) && adminStatus !== targetStatus) {
      throw noRowsUpdatedError(
        `Request is already ${adminStatus} in the workflow. Refresh the list or use the ${adminStatus} tab.`
      );
    }
    throw noRowsUpdatedError();
  }

  const lmsSynced = await syncLmsLeaveStatus(id, lmsOpenStatuses, patch);
  if (!lmsSynced) {
    throw noRowsUpdatedError(
      "Decision saved for attendance but LMS row did not update. Refresh — if it still shows pending, retry once."
    );
  }

  return finishDecisionRow(lmsSynced);
}

function statusFilterForTab(tabStatus) {
  const s = normalizeWorkflowStatus(tabStatus);
  if (!s || s === "all") return null;
  if (s === "pending") {
    return { column: "status", values: PENDING_LMS_STATUSES.map(normalizeWorkflowStatus) };
  }
  return { column: "status", values: [s] };
}

/**
 * Subscribe to leave workflow changes (LMS + admin mirror + balances).
 * Requires tables in publication `supabase_realtime` (see migration 20260606150000).
 */
export function subscribeLeaveWorkflowRealtime(onChange) {
  if (!isSupabaseRealtimeEnabled() || typeof onChange !== "function") {
    return () => {};
  }

  const channel = supabase
    .channel("erp-indus-one-leave-workflow")
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE, table: INDUS_ONE_LEAVE_TABLES.lmsRequests },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE, table: INDUS_ONE_LEAVE_TABLES.adminRequests },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE, table: INDUS_ONE_LEAVE_TABLES.balancesYearly },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "*", schema: INDUS_ONE, table: INDUS_ONE_LEAVE_TABLES.balanceLedger },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** Merge admin_leave_requests decision fields when LMS row lags behind. */
async function enrichRowsWithAdminWorkflow(rows) {
  const ids = (rows || []).map((r) => r.id).filter(Boolean);
  if (!ids.length) return rows || [];

  const { data, error } = await adminLeaveRequestsTable()
    .select("id, status, approver_name, approver_user_id, remarks, decided_at, updated_at")
    .in("id", ids);
  if (error) return rows || [];

  const byId = Object.fromEntries((data || []).map((r) => [r.id, r]));
  return (rows || []).map((row) => {
    const admin = byId[row.id];
    if (!admin) return row;

    const lmsStatus = normalizeWorkflowStatus(row.status);
    const adminStatus = normalizeWorkflowStatus(admin.status);
    const terminal = TERMINAL_STATUSES.includes(adminStatus);

    if (terminal && isOpenLmsStatus(lmsStatus)) {
      return {
        ...row,
        status: adminStatus,
        approver_name: admin.approver_name ?? row.approver_name,
        approver_user_id: admin.approver_user_id ?? row.approver_user_id,
        remarks: admin.remarks ?? row.remarks,
        decided_at: admin.decided_at ?? row.decided_at,
        _synced_from_admin: true,
      };
    }
    return {
      ...row,
      approver_name: row.approver_name ?? admin.approver_name,
      decided_at: row.decided_at ?? admin.decided_at,
      remarks: row.remarks ?? admin.remarks,
    };
  });
}

export async function fetchLeaveTypes() {
  const { data, error } = await supabase
    .from("hr_leave_types")
    .select("code, label, attendance_marks")
    .order("label");
  if (error) throw error;
  const byCode = {};
  for (const row of data || []) {
    byCode[row.code] = row;
  }
  return { rows: data || [], byCode };
}

export async function countPendingLeaveRequests() {
  const { count, error } = await lmsLeaveRequestsTable()
    .select("id", { count: "exact", head: true })
    .in("status", PENDING_LMS_STATUSES.map(normalizeWorkflowStatus));
  if (error) throw error;
  return count ?? 0;
}

/** Lightweight counts for inbox KPI row (parallel head requests). */
export async function fetchLeaveStatusCounts() {
  const pendingStatuses = PENDING_LMS_STATUSES.map(normalizeWorkflowStatus);
  const [pendingRes, approvedRes, rejectedRes, cancelledRes, allRes] = await Promise.all([
    lmsLeaveRequestsTable()
      .select("id", { count: "exact", head: true })
      .in("status", pendingStatuses),
    lmsLeaveRequestsTable()
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    lmsLeaveRequestsTable()
      .select("id", { count: "exact", head: true })
      .eq("status", "rejected"),
    lmsLeaveRequestsTable()
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelled"),
    lmsLeaveRequestsTable().select("id", { count: "exact", head: true }),
  ]);

  const firstErr =
    pendingRes.error || approvedRes.error || rejectedRes.error || cancelledRes.error || allRes.error;
  if (firstErr) throw firstErr;

  return {
    pending: pendingRes.count ?? 0,
    approved: approvedRes.count ?? 0,
    rejected: rejectedRes.count ?? 0,
    cancelled: cancelledRes.count ?? 0,
    all: allRes.count ?? 0,
  };
}

export async function fetchLeaveRequests(opts = {}) {
  const {
    status,
    empSearch = "",
    leaveType = "",
    fromDate = "",
    toDate = "",
    page = 1,
    pageSize = PAGE_SIZE_DEFAULT,
  } = opts;

  let query = lmsLeaveRequestsTable()
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false });

  const tabFilter = statusFilterForTab(status);
  if (tabFilter) {
    query = query.in(tabFilter.column, tabFilter.values);
  }
  if (leaveType) query = query.eq("leave_type", leaveType);
  if (fromDate) query = query.gte("to_date", fromDate);
  if (toDate) query = query.lte("from_date", toDate);

  const needle = empSearch.trim();
  if (needle) {
    const userIds = await fetchUserIdsForEmployeeSearch(needle);
    if (userIds.length) {
      query = query.in("user_id", userIds);
    } else {
      return { rows: [], total: 0, page, pageSize };
    }
  }

  const from = (Math.max(1, page) - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const normalized = (data || []).map((row) => ({
    ...row,
    status: normalizeWorkflowStatus(row.status),
  }));
  const employeeByUserId = await fetchEmployeesByUserIds(normalized.map((r) => r.user_id));
  let rows = normalizeLmsLeaveRows(normalized, employeeByUserId);
  rows = await enrichRowsWithAdminWorkflow(rows);

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
  };
}

export async function approveLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: PENDING_LMS_STATUSES,
    adminExpectedStatus: "pending",
    newStatus: "approved",
    decision,
  });
}

export async function rejectLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: PENDING_LMS_STATUSES,
    adminExpectedStatus: "pending",
    newStatus: "rejected",
    decision,
  });
}

export async function cancelPendingLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: PENDING_LMS_STATUSES,
    adminExpectedStatus: "pending",
    newStatus: "cancelled",
    decision,
  });
}

export async function cancelApprovedLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: ["approved"],
    adminExpectedStatus: "approved",
    newStatus: "cancelled",
    decision,
  });
}

export async function rejectApprovedLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: ["approved"],
    adminExpectedStatus: "approved",
    newStatus: "rejected",
    decision,
  });
}

export function leaveTypeLabel(byCode, code) {
  const c = String(code || "").trim();
  return byCode[c]?.label || c || "—";
}

export function statusSeverity(status) {
  switch (status) {
    case "pending":
    case "draft":
      return "warning";
    case "approved":
      return "info";
    case "rejected":
      return "critical";
    case "cancelled":
      return "high";
    default:
      return "info";
  }
}

export function formatLeaveDateRange(fromDate, toDate) {
  const f = formatDateDdMmYyyy(fromDate);
  const t = formatDateDdMmYyyy(toDate);
  if (!f && !t) return "—";
  if (f === t) return f;
  return `${f} → ${t}`;
}
