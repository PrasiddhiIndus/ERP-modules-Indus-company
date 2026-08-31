/**
 * Leave workflow — reads `indus_one.leave_requests` + `indus_one.admin_leave_requests`
 * (merged for the ERP leave inbox). Approve/reject still updates admin_leave_requests
 * (DB triggers apply attendance + balance), then syncs `leave_requests` for Indus One LMS.
 */

import { supabase } from "./supabase";
import { formatDateDdMmYyyy } from "../utils/dateDisplay";
import { isSupabaseRealtimeEnabled } from "./supabaseConfig";
import { fetchApiWithAuth } from "./apiBase";
import {
  EMPLOYEE_MASTER_TABLE,
  normalizeAttendanceEmpCode,
  REGISTER_MARKS_DB_ALLOWED,
} from "./attendanceDaily";
import { normalizeManagerCode } from "./employeeHierarchy";
import { employeeCodeForUserId } from "./employeeCode";
import {
  reconcileLeaveBalanceForRequest,
  validateLeaveRequestMonthlyBalance,
} from "./leaveManagement";

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
  { value: "withdrawn", label: "Withdrawn" },
];

/** LMS leave_requests statuses treated as awaiting a decision. */
const PENDING_LMS_STATUSES = ["pending", "draft", "submitted", "pending_approval"];

const TERMINAL_STATUSES = ["approved", "rejected", "cancelled", "withdrawn"];

function lmsLeaveRequestsTable() {
  return supabase.schema(INDUS_ONE).from(LMS_LEAVE_TABLE);
}

function adminLeaveRequestsTable() {
  return supabase.schema(INDUS_ONE).from(ADMIN_LEAVE_TABLE);
}

function decisionPayload({ approverUserId, approverName, remarks, approverEmployeeCode, approvedByTier }) {
  return {
    remarks: remarks?.trim() ? remarks.trim() : null,
    approver_user_id: approverUserId || null,
    approver_name: approverName || null,
    approver_employee_code: approverEmployeeCode || null,
    approved_by_tier: approvedByTier || null,
    decided_at: new Date().toISOString(),
  };
}

/** L1, L2, or ERP admin may approve; records which tier approved. */
async function resolveLeaveApprover(applicantMasterId, approverUserId, { isErpAdmin = false } = {}) {
  const approverEmployeeCode = await employeeCodeForUserId(approverUserId);
  if (isErpAdmin) {
    return { approverEmployeeCode, approvedByTier: "admin" };
  }

  if (!applicantMasterId) {
    throw new Error("Leave applicant is not linked to Employee Master.");
  }

  const { data: applicant, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("employee_code, l1_manager_code, l2_manager_code")
    .eq("id", applicantMasterId)
    .maybeSingle();
  if (error) throw error;

  const approverNorm = normalizeManagerCode(approverEmployeeCode);
  const l1Norm = normalizeManagerCode(applicant?.l1_manager_code);
  const l2Norm = normalizeManagerCode(applicant?.l2_manager_code);

  if (l1Norm && approverNorm && approverNorm === l1Norm) {
    return { approverEmployeeCode, approvedByTier: "l1" };
  }
  if (l2Norm && approverNorm && approverNorm === l2Norm) {
    return { approverEmployeeCode, approvedByTier: "l2" };
  }

  throw new Error(
    "Only the employee's L1 manager, L2 manager, or an ERP admin can approve this leave. " +
      "Set L1/L2 on Employee Master or use an admin account."
  );
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
  if (s === "canceled") return "cancelled";
  if (s === "withdraw" || s === "withdrawn") return "withdrawn";
  return s;
}

/**
 * Effective rollup: a decided overall_status wins, but leftover "pending"
 * must not hide status = approved / rejected / cancelled / withdrawn.
 */
export function effectiveLeaveWorkflowStatus(row) {
  const overall = adminStatusFromLms(row?.overall_status);
  const status = adminStatusFromLms(row?.status);
  if (TERMINAL_STATUSES.includes(overall)) return overall;
  if (TERMINAL_STATUSES.includes(status)) return status;
  return overall || status;
}

export function isLeaveFullyApproved(row) {
  return effectiveLeaveWorkflowStatus(row) === "approved";
}

function inboxStatusBucket(status) {
  const s = adminStatusFromLms(status);
  if (TERMINAL_STATUSES.includes(s)) return s;
  return "pending";
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

/** Status fields Indus One may set; L1 approval often lands here before overall_status. */
function leaveRowStatusCandidates(row) {
  if (!row) return [];
  return [row.status, row.overall_status, row.l1_status, row.l2_status];
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

async function fetchEmployeesByCodes(codes) {
  const unique = [
    ...new Set(
      (codes || [])
        .map((c) => String(c || "").trim())
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
    const key = normalizeAttendanceEmpCode(row.employee_code);
    if (key && !byCode[key]) byCode[key] = row;
  }
  return byCode;
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

function normalizeLmsLeaveRows(rows, employeeByUserId) {
  return (rows || []).map((row) => {
    const employee = employeeByUserId[row.user_id];
    const empCode = normalizeAttendanceEmpCode(employee?.employee_code) || null;
    return {
      ...row,
      leave_type_code: leaveTypeCodeFromRow(row),
      employee_code: empCode,
      employee_master_id: employee?.id ?? null,
      employee: employeeSnapshot(employee),
    };
  });
}

function normalizeAdminLeaveRows(rows, employeeByMasterId) {
  return (rows || []).map((row) => {
    const employee = employeeByMasterId[row.employee_master_id];
    const empCode =
      normalizeAttendanceEmpCode(row.employee_code || employee?.employee_code) || null;
    return {
      ...row,
      leave_type_code: leaveTypeCodeFromRow(row),
      employee_code: empCode,
      employee: employeeSnapshot(employee),
    };
  });
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
      overall_status: effectiveLeaveWorkflowStatus(lmsRow) || adminStatusFromLms(lmsRow.status),
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
async function applyLeaveDecision(id, { lmsExpectedStatuses, adminExpectedStatus, newStatus, decision, skipApproverCheck = false }) {
  const lmsRow = await fetchLmsLeaveRequestById(id);
  const lmsOpenStatuses = lmsExpectedStatuses.map(normalizeWorkflowStatus);
  const targetStatus = normalizeWorkflowStatus(newStatus);

  let approverMeta = {};
  if (targetStatus === "approved" && !skipApproverCheck) {
    const employee = await resolveEmployeeByUserId(lmsRow.user_id);
    approverMeta = await resolveLeaveApprover(employee?.id, decision.approverUserId, {
      isErpAdmin: !!decision.isErpAdmin,
    });
  }

  const patch = {
    status: targetStatus,
    overall_status: targetStatus,
    ...decisionPayload({ ...decision, ...approverMeta }),
  };

  await ensureAdminLeaveRequestMirror(lmsRow);

  const adminRow = await fetchAdminLeaveRow(id);
  const adminStatus = normalizeWorkflowStatus(adminRow?.status);
  const expectedAdmin = normalizeWorkflowStatus(adminExpectedStatus);

  if (targetStatus === "approved" && lmsRow.status !== targetStatus) {
    await validateLeaveRequestMonthlyBalance(supabase, adminRow || lmsRow);
  }

  if (lmsRow.status === targetStatus) {
    await reconcileLeaveBalanceForRequest(supabase, adminRow || lmsRow);
    return finishDecisionRow(lmsRow);
  }

  if (!lmsOpenStatuses.includes(lmsRow.status)) {
    throw noRowsUpdatedError(
      `Request status is "${lmsRow.status}" and cannot be changed to ${targetStatus}. Refresh the list.`
    );
  }

  if (adminStatus === targetStatus) {
    const lmsSynced = await syncLmsLeaveStatus(id, lmsOpenStatuses, patch);
    if (!lmsSynced) {
      throw noRowsUpdatedError(
        "Attendance was already updated but LMS status is out of sync. Refresh, or contact support."
      );
    }
    await reconcileLeaveBalanceForRequest(supabase, adminRow || lmsSynced);
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

  await reconcileLeaveBalanceForRequest(supabase, adminUpdated);
  return finishDecisionRow(lmsSynced);
}

function rowMatchesLeaveType(row, leaveType) {
  if (!leaveType) return true;
  const code = leaveTypeCodeFromRow(row);
  return String(code).toLowerCase() === String(leaveType).trim().toLowerCase();
}

function rowMatchesDateRange(row, fromDate, toDate) {
  if (fromDate && row.to_date && String(row.to_date) < fromDate) return false;
  if (toDate && row.from_date && String(row.from_date) > toDate) return false;
  return true;
}

/**
 * Merge LMS leave_requests + admin_leave_requests by id (read-only inbox).
 * Indus One often marks leave_requests.status / l1_status approved while the
 * admin row still has status/overall_status pending (waiting on L2). Show the
 * decided status from either table so the list matches what managers already approved.
 */
function resolveInboxDisplayStatus(...statuses) {
  const mapped = statuses.map((s) => adminStatusFromLms(s)).filter(Boolean);
  if (mapped.some((s) => s === "approved")) return "approved";
  if (mapped.some((s) => s === "rejected")) return "rejected";
  if (mapped.some((s) => s === "cancelled")) return "cancelled";
  if (mapped.some((s) => s === "withdrawn")) return "withdrawn";
  return "pending";
}

function mergeLmsAndAdminLeaveRows(lmsRows, adminRows) {
  const byId = new Map();

  for (const row of adminRows || []) {
    if (!row?.id) continue;
    byId.set(row.id, {
      ...row,
      status: resolveInboxDisplayStatus(...leaveRowStatusCandidates(row)),
      overall_status: normalizeWorkflowStatus(row.overall_status) || null,
      leave_type_code: leaveTypeCodeFromRow(row),
      approver_name: firstNonEmpty(row.approver_name, row.l2_action_by_name, row.l1_action_by_name),
      decided_at: row.decided_at || row.l2_action_at || row.l1_action_at || null,
      _admin_status: row.status,
      _admin_overall: row.overall_status,
      _from_admin: true,
    });
  }

  for (const row of lmsRows || []) {
    if (!row?.id) continue;
    const existing = byId.get(row.id);
    if (!existing) {
      byId.set(row.id, {
        ...row,
        status: resolveInboxDisplayStatus(...leaveRowStatusCandidates(row)),
        overall_status:
          normalizeWorkflowStatus(row.overall_status) || adminStatusFromLms(row.status),
        leave_type_code: leaveTypeCodeFromRow(row),
        _from_lms: true,
      });
      continue;
    }

    byId.set(row.id, {
      ...row,
      ...existing,
      leave_type_code: leaveTypeCodeFromRow(existing) || leaveTypeCodeFromRow(row),
      reason: existing.reason || row.reason || "",
      from_date: existing.from_date || row.from_date,
      to_date: existing.to_date || row.to_date,
      days: existing.days ?? row.days,
      submitted_at: existing.submitted_at || row.submitted_at,
      user_id: existing.user_id || row.user_id,
      status: resolveInboxDisplayStatus(
        ...leaveRowStatusCandidates(existing),
        existing._admin_status,
        existing._admin_overall,
        ...leaveRowStatusCandidates(row)
      ),
      overall_status:
        normalizeWorkflowStatus(existing.overall_status) ||
        normalizeWorkflowStatus(row.overall_status) ||
        adminStatusFromLms(row.status),
      approver_name: firstNonEmpty(
        existing.approver_name,
        row.approver_name,
        existing.l2_action_by_name,
        existing.l1_action_by_name,
        row.l2_action_by_name,
        row.l1_action_by_name
      ),
      approver_user_id: existing.approver_user_id || row.approver_user_id || null,
      approver_employee_code: firstNonEmpty(
        existing.approver_employee_code,
        row.approver_employee_code,
        existing.l2_action_by,
        existing.l1_action_by
      ),
      approved_by_tier: existing.approved_by_tier || row.approved_by_tier || null,
      remarks: existing.remarks || row.remarks || null,
      decided_at:
        existing.decided_at ||
        row.decided_at ||
        existing.l2_action_at ||
        existing.l1_action_at ||
        null,
      employee_master_id: existing.employee_master_id || row.employee_master_id || null,
      employee_code: existing.employee_code || row.employee_code || null,
      _from_lms: true,
      _from_admin: true,
    });
  }

  return [...byId.values()];
}

function normalizeMergedLeaveRows(rows, employeeByMasterId, employeeByUserId, employeeByCode) {
  return (rows || []).map((row) => {
    const byMaster = row.employee_master_id != null ? employeeByMasterId[row.employee_master_id] : null;
    const byUser = row.user_id ? employeeByUserId[row.user_id] : null;
    const codeKey = normalizeAttendanceEmpCode(row.employee_code);
    const byCode = codeKey && employeeByCode ? employeeByCode[codeKey] : null;
    const employee = byMaster || byUser || byCode || null;
    const empCode =
      normalizeAttendanceEmpCode(row.employee_code || employee?.employee_code) || null;
    return {
      ...row,
      leave_type_code: leaveTypeCodeFromRow(row),
      employee_code: empCode,
      employee_master_id: row.employee_master_id ?? employee?.id ?? null,
      employee: employeeSnapshot(employee),
    };
  });
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

/** Inbox / approvals: request tables only. Balance upserts must not reload this page. */
export function subscribeLeaveInboxRealtime(onChange) {
  if (!isSupabaseRealtimeEnabled() || typeof onChange !== "function") {
    return () => {};
  }

  const channel = supabase
    .channel("erp-indus-one-leave-inbox")
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
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

const LEAVE_FETCH_CAP = 2000;
const LEAVE_PAGE_SIZE = 1000;

async function fetchAllPagedRows(tableFn) {
  const all = [];
  let from = 0;
  while (from < LEAVE_FETCH_CAP) {
    const to = Math.min(from + LEAVE_PAGE_SIZE - 1, LEAVE_FETCH_CAP - 1);
    const { data, error } = await tableFn()
      .select("*")
      .order("submitted_at", { ascending: false })
      .range(from, to);
    if (error) return { data: all, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < LEAVE_PAGE_SIZE) return { data: all, error: null };
    from += LEAVE_PAGE_SIZE;
  }
  return { data: all, error: null };
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

/**
 * Prefer service-role API so ERP admins see ALL employees' leave (RLS otherwise
 * often returns only the signed-in user's rows). Falls back to direct Supabase.
 * Coalesce overlapping calls (inbox list + KPI counts + React Strict Mode).
 */
let leaveInboxInflight = null;
let leaveInboxCache = { at: 0, payload: null };
const LEAVE_INBOX_CACHE_MS = 30_000;

function countInboxStatuses(merged) {
  const counts = { pending: 0, approved: 0, rejected: 0, cancelled: 0, withdrawn: 0, all: merged.length };
  for (const row of merged) {
    counts[inboxStatusBucket(row.status)] += 1;
  }
  return counts;
}

async function loadLeaveInboxFromSupabase() {
  const [lmsRes, adminRes] = await Promise.all([
    fetchAllPagedRows(lmsLeaveRequestsTable),
    fetchAllPagedRows(adminLeaveRequestsTable),
  ]);

  if (lmsRes.error && adminRes.error) {
    throw lmsRes.error || adminRes.error;
  }
  if (lmsRes.error && !adminRes.error) {
    console.warn("leave_requests fetch failed; using admin_leave_requests only:", lmsRes.error.message);
  }
  if (adminRes.error && !lmsRes.error) {
    console.warn("admin_leave_requests fetch failed; using leave_requests only:", adminRes.error.message);
  }

  return {
    lmsRows: lmsRes.error ? [] : lmsRes.data || [],
    adminRows: adminRes.error ? [] : adminRes.data || [],
    source: "supabase",
  };
}

async function loadLeaveInboxSourceRows({ force = false } = {}) {
  const now = Date.now();
  if (!force && leaveInboxCache.payload && now - leaveInboxCache.at < LEAVE_INBOX_CACHE_MS) {
    return leaveInboxCache.payload;
  }
  if (leaveInboxInflight) return leaveInboxInflight;

  leaveInboxInflight = (async () => {
    try {
      let result = await fetchApiWithAuth("/api/admin/leave-requests");
      if (result.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = await fetchApiWithAuth("/api/admin/leave-requests");
      }
      if (result.ok && (Array.isArray(result.data?.lmsRows) || Array.isArray(result.data?.adminRows))) {
        const payload = {
          lmsRows: result.data.lmsRows || [],
          adminRows: result.data.adminRows || [],
          source: "api",
        };
        leaveInboxCache = { at: Date.now(), payload };
        return payload;
      }
      if (result.status === 429 && leaveInboxCache.payload) {
        return leaveInboxCache.payload;
      }
      if (result.error) {
        console.warn("Leave inbox API unavailable; falling back to direct Supabase:", result.error);
      }
    } catch (err) {
      console.warn("Leave inbox API failed; falling back to direct Supabase:", err?.message || err);
    }

    const payload = await loadLeaveInboxFromSupabase();
    leaveInboxCache = { at: Date.now(), payload };
    return payload;
  })().finally(() => {
    leaveInboxInflight = null;
  });

  return leaveInboxInflight;
}

export async function countPendingLeaveRequests() {
  const counts = await fetchLeaveStatusCounts();
  return counts.pending ?? 0;
}

/** Lightweight counts for inbox KPI row — unique ids across LMS + admin. */
export async function fetchLeaveStatusCounts() {
  const { lmsRows, adminRows } = await loadLeaveInboxSourceRows();
  const merged = mergeLmsAndAdminLeaveRows(lmsRows, adminRows);
  return countInboxStatuses(merged);
}

/**
 * Read-only inbox list from both `indus_one.leave_requests` and `indus_one.admin_leave_requests`.
 * Uses admin API (service role) so all users' requests are visible, not only the logged-in user.
 */
export async function fetchLeaveRequests(opts = {}) {
  const {
    status,
    empSearch = "",
    leaveType = "",
    fromDate = "",
    toDate = "",
    page = 1,
    pageSize = PAGE_SIZE_DEFAULT,
    forceRefresh = false,
  } = opts;

  const { lmsRows, adminRows } = await loadLeaveInboxSourceRows({ force: forceRefresh });
  let merged = mergeLmsAndAdminLeaveRows(lmsRows, adminRows);
  const statusCounts = countInboxStatuses(merged);

  const needle = empSearch.trim();
  if (needle) {
    const [masterIds, userIds] = await Promise.all([
      fetchEmployeeMasterIdsForSearch(needle),
      fetchUserIdsForEmployeeSearch(needle),
    ]);
    if (!masterIds.length && !userIds.length) {
      return { rows: [], total: 0, page, pageSize };
    }
    const masterSet = new Set(masterIds);
    const userSet = new Set(userIds);
    merged = merged.filter(
      (row) =>
        (row.employee_master_id != null && masterSet.has(row.employee_master_id)) ||
        (row.user_id && userSet.has(row.user_id))
    );
  }

  const tab = normalizeWorkflowStatus(status);
  if (tab && tab !== "all") {
    merged = merged.filter((row) => inboxStatusBucket(row.status) === tab);
  }

  if (leaveType) {
    merged = merged.filter((row) => rowMatchesLeaveType(row, leaveType));
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

  const rows = normalizeMergedLeaveRows(
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
    statusCounts,
  };
}

export async function approveLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: PENDING_LMS_STATUSES,
    adminExpectedStatus: "pending",
    newStatus: "approved",
    decision,
    skipApproverCheck: !!decision?.skipApproverCheck,
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

export async function withdrawLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: PENDING_LMS_STATUSES,
    adminExpectedStatus: "pending",
    newStatus: "withdrawn",
    decision,
  });
}

export async function withdrawApprovedLeaveRequest(id, decision) {
  return applyLeaveDecision(id, {
    lmsExpectedStatuses: ["approved"],
    adminExpectedStatus: "approved",
    newStatus: "withdrawn",
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
    case "withdrawn":
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
