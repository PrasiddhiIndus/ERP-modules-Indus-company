/**
 * Admin Salary — Employee loans & salary advances (Supabase).
 * Tables: admin_salary_loans / loan_recoveries /
 *         admin_salary_salary_advances / salary_advance_recoveries
 */

import { supabase } from "../../../../lib/supabase";
import {
  addMonthsYm,
  currentYm,
  deductionAmountForMonth,
  getEmployeeDeductions,
  normalizeUnpaidKind,
  round2,
  unpaidSignedAmountForMonth,
} from "./deductionsStore";

export const LOANS_TABLE = "admin_salary_loans";
export const LOAN_RECOVERIES_TABLE = "admin_salary_loan_recoveries";
export const ADVANCES_TABLE = "admin_salary_salary_advances";
export const ADVANCE_RECOVERIES_TABLE = "admin_salary_salary_advance_recoveries";
export const UNPAID_PAID_TABLE = "admin_salary_unpaid_paid";
export const UNPAID_PAID_SETTLEMENTS_TABLE = "admin_salary_unpaid_paid_settlements";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function mapRecovery(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    amount: Number(row.amount) || 0,
    month: String(row.month_key || "").slice(0, 7),
    month_key: String(row.month_key || "").slice(0, 7),
    recovery_date: row.recovery_date || (row.created_at || "").slice(0, 10),
    source: row.source || "manual",
    remarks: row.remarks || "",
    at: row.created_at || null,
  };
}

export function mapLoanRow(row, recoveries = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    employee_master_id: row.employee_master_id,
    principal: Number(row.principal) || 0,
    balance_outstanding: Number(row.balance_outstanding) || 0,
    installment_amount: Number(row.installment_amount) || 0,
    months: Number(row.months) || 0,
    months_remaining: Number(row.months_remaining) || 0,
    start_month: String(row.start_month || "").slice(0, 7),
    end_month: row.end_month ? String(row.end_month).slice(0, 7) : "",
    entry_date: row.entry_date || (row.created_at || "").slice(0, 10),
    status: row.status || "active",
    remarks: row.remarks || "",
    held_at: row.held_at || null,
    closed_at: row.closed_at || null,
    last_salary_month: row.last_salary_month || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    recoveries: (recoveries || []).map(mapRecovery).filter(Boolean),
  };
}

export function mapAdvanceRow(row, recoveries = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    employee_master_id: row.employee_master_id,
    amount: Number(row.amount) || 0,
    principal: Number(row.amount) || 0,
    balance_outstanding: Number(row.balance_outstanding) || 0,
    recovery_amount: Number(row.recovery_amount) || 0,
    months: Number(row.months) || 0,
    months_remaining: Number(row.months_remaining) || 0,
    start_month: String(row.start_month || "").slice(0, 7),
    end_month: row.end_month ? String(row.end_month).slice(0, 7) : "",
    entry_date: row.entry_date || (row.created_at || "").slice(0, 10),
    status: row.status || "active",
    remarks: row.remarks || "",
    held_at: row.held_at || null,
    closed_at: row.closed_at || null,
    last_salary_month: row.last_salary_month || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    recoveries: (recoveries || []).map(mapRecovery).filter(Boolean),
  };
}

function userFriendlyDbError(err, fallback) {
  const msg = `${err?.message || ""} ${err?.details || ""}`;
  if (/relation .* does not exist|Could not find the table/i.test(msg)) {
    return "Salary deduction tables are not set up yet. Run the latest salary database migration.";
  }
  if (/row-level security|RLS|permission denied|42501/i.test(msg)) {
    return "You do not have access to save this salary deduction.";
  }
  return fallback || err?.message || "Could not save. Please try again.";
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

/** Load loans + nested recoveries for one employee. */
export async function fetchEmployeeLoans(employeeMasterId) {
  if (employeeMasterId == null) return [];
  const { data, error } = await supabase
    .from(LOANS_TABLE)
    .select("*")
    .eq("employee_master_id", employeeMasterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const loans = data || [];
  if (!loans.length) return [];

  const ids = loans.map((l) => l.id);
  const { data: recs, error: recErr } = await supabase
    .from(LOAN_RECOVERIES_TABLE)
    .select("*")
    .in("loan_id", ids)
    .order("recovery_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (recErr) throw recErr;

  const byLoan = new Map();
  for (const r of recs || []) {
    const key = String(r.loan_id);
    if (!byLoan.has(key)) byLoan.set(key, []);
    byLoan.get(key).push(r);
  }
  return loans.map((l) => mapLoanRow(l, byLoan.get(String(l.id)) || []));
}

/** Load salary advances + nested recoveries for one employee. */
export async function fetchEmployeeSalaryAdvances(employeeMasterId) {
  if (employeeMasterId == null) return [];
  const { data, error } = await supabase
    .from(ADVANCES_TABLE)
    .select("*")
    .eq("employee_master_id", employeeMasterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];

  const ids = rows.map((a) => a.id);
  const { data: recs, error: recErr } = await supabase
    .from(ADVANCE_RECOVERIES_TABLE)
    .select("*")
    .in("advance_id", ids)
    .order("recovery_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (recErr) throw recErr;

  const byAdv = new Map();
  for (const r of recs || []) {
    const key = String(r.advance_id);
    if (!byAdv.has(key)) byAdv.set(key, []);
    byAdv.get(key).push(r);
  }
  return rows.map((a) => mapAdvanceRow(a, byAdv.get(String(a.id)) || []));
}

/** Batch-load loans + advances + unpaid/paid for many employees (salary processing seed). */
export async function fetchLoansAndAdvancesForEmployees(employeeMasterIds = []) {
  const ids = [...new Set((employeeMasterIds || []).map((id) => Number(id) || id).filter((id) => id != null))];
  const empty = {
    loansByEmployee: new Map(),
    advancesByEmployee: new Map(),
    unpaidByEmployee: new Map(),
  };
  if (!ids.length) return empty;

  const [loanRes, advRes, upsRes] = await Promise.all([
    supabase.from(LOANS_TABLE).select("*").in("employee_master_id", ids),
    supabase.from(ADVANCES_TABLE).select("*").in("employee_master_id", ids),
    supabase.from(UNPAID_PAID_TABLE).select("*").in("employee_master_id", ids),
  ]);
  if (loanRes.error) throw loanRes.error;
  if (advRes.error) throw advRes.error;
  if (
    upsRes.error &&
    !/does not exist|Could not find the table/i.test(`${upsRes.error.message || ""}`)
  ) {
    throw upsRes.error;
  }

  const loansByEmployee = new Map();
  const advancesByEmployee = new Map();
  const unpaidByEmployee = new Map();
  for (const id of ids) {
    loansByEmployee.set(String(id), []);
    advancesByEmployee.set(String(id), []);
    unpaidByEmployee.set(String(id), []);
  }
  for (const row of loanRes.data || []) {
    const key = String(row.employee_master_id);
    const list = loansByEmployee.get(key) || [];
    list.push(mapLoanRow(row, []));
    loansByEmployee.set(key, list);
  }
  for (const row of advRes.data || []) {
    const key = String(row.employee_master_id);
    const list = advancesByEmployee.get(key) || [];
    list.push(mapAdvanceRow(row, []));
    advancesByEmployee.set(key, list);
  }
  for (const row of upsRes.data || []) {
    const key = String(row.employee_master_id);
    const list = unpaidByEmployee.get(key) || [];
    list.push(mapUnpaidPaidRow(row, []));
    unpaidByEmployee.set(key, list);
  }
  return { loansByEmployee, advancesByEmployee, unpaidByEmployee };
}

export function mapUnpaidPaidRow(row, settlements = []) {
  if (!row) return null;
  const kind = normalizeUnpaidKind(row.kind);
  return {
    id: String(row.id),
    employee_master_id: row.employee_master_id,
    kind,
    amount: Number(row.amount) || 0,
    balance_outstanding: Number(row.balance_outstanding) || 0,
    monthly_amount: Number(row.monthly_amount) || 0,
    months: Number(row.months) || 0,
    months_remaining: Number(row.months_remaining) || 0,
    start_month: String(row.start_month || "").slice(0, 7),
    end_month: row.end_month ? String(row.end_month).slice(0, 7) : "",
    month: String(row.start_month || "").slice(0, 7),
    entry_date: row.entry_date || (row.created_at || "").slice(0, 10),
    status: row.status === "active" ? "open" : row.status || "open",
    remarks: row.remarks || "",
    held_at: row.held_at || null,
    closed_at: row.closed_at || null,
    last_salary_month: row.last_salary_month || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    settlements: (settlements || []).map((s) => ({
      id: String(s.id),
      amount: Number(s.amount) || 0,
      month: String(s.month_key || "").slice(0, 7),
      settlement_date: s.settlement_date || (s.created_at || "").slice(0, 10),
      source: s.source || "manual",
      at: s.created_at || null,
    })),
  };
}

export async function fetchEmployeeUnpaidPaid(employeeMasterId) {
  if (employeeMasterId == null) return [];
  const { data, error } = await supabase
    .from(UNPAID_PAID_TABLE)
    .select("*")
    .eq("employee_master_id", employeeMasterId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: sets, error: setErr } = await supabase
    .from(UNPAID_PAID_SETTLEMENTS_TABLE)
    .select("*")
    .in("unpaid_paid_id", ids)
    .order("settlement_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (setErr) throw setErr;

  const byParent = new Map();
  for (const s of sets || []) {
    const key = String(s.unpaid_paid_id);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(s);
  }
  return rows.map((r) => mapUnpaidPaidRow(r, byParent.get(String(r.id)) || []));
}

export async function createUnpaidPaid(employeeMasterId, payload) {
  const uid = await currentUserId();
  const months = Math.max(0, Math.floor(Number(payload.months) || 0));
  const start = String(payload.start_month || payload.month || currentYm()).slice(0, 7);
  const end = months > 0 ? addMonthsYm(start, months - 1) : start;
  const amount = round2(payload.amount);
  const monthly =
    months > 0
      ? round2(
          payload.monthly_amount != null && payload.monthly_amount !== ""
            ? payload.monthly_amount
            : amount / months
        )
      : 0;
  const kind = normalizeUnpaidKind(payload.kind);

  const row = {
    employee_master_id: Number(employeeMasterId),
    kind,
    amount,
    balance_outstanding: amount,
    monthly_amount: monthly,
    months,
    months_remaining: months,
    start_month: start,
    end_month: end,
    // DB default CURRENT_DATE — not collected in UI
    status: "open",
    remarks: payload.remarks || null,
    created_by: uid,
  };

  const { data, error } = await supabase.from(UNPAID_PAID_TABLE).insert(row).select("*").single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not save unpaid / paid entry."));
  return mapUnpaidPaidRow(data, []);
}

export async function updateUnpaidPaid(id, payload) {
  const months = Math.max(0, Math.floor(Number(payload.months_remaining ?? payload.months) || 0));
  const start = String(payload.start_month || payload.month || currentYm()).slice(0, 7);
  const monthlyRaw =
    payload.monthly_amount != null && payload.monthly_amount !== ""
      ? round2(payload.monthly_amount)
      : 0;
  const clearHit = Boolean(payload.clear_salary_hit) || months <= 0 || monthlyRaw <= 0;
  const end = !clearHit && months > 0 ? addMonthsYm(start, months - 1) : start;

  const patch = {
    kind: normalizeUnpaidKind(payload.kind),
    months_remaining: clearHit ? 0 : months,
    monthly_amount: clearHit ? 0 : monthlyRaw,
    start_month: start,
    end_month: end,
    remarks: payload.remarks ?? null,
  };
  if (payload.amount != null) {
    const bal = round2(payload.amount);
    patch.balance_outstanding = bal;
    if (bal <= 0) {
      patch.months_remaining = 0;
      patch.monthly_amount = 0;
    }
  }
  if (payload.months != null) {
    patch.months = Math.max(0, Math.floor(Number(payload.months) || 0));
  }

  const { data, error } = await supabase
    .from(UNPAID_PAID_TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not update entry."));
  return mapUnpaidPaidRow(data, []);
}

export async function setUnpaidPaidStatus(id, status) {
  const s = status === "active" ? "open" : status;
  if (!["open", "hold", "closed"].includes(s)) throw new Error("Invalid status.");
  const now = new Date().toISOString();
  const patch = {
    status: s,
    held_at: s === "hold" ? now : null,
    closed_at: s === "closed" ? now : null,
  };
  if (s === "open") patch.held_at = null;

  const { data, error } = await supabase
    .from(UNPAID_PAID_TABLE)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not update status."));
  return mapUnpaidPaidRow(data, []);
}

export async function addUnpaidPaidSettlement(
  id,
  { amount, month_key, settlement_date, remarks } = {}
) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Enter a settlement amount greater than zero.");
  const mk = String(month_key || currentYm()).slice(0, 7);
  const day = settlement_date || todayIsoDate();
  const uid = await currentUserId();

  const { data: row, error: loadErr } = await supabase
    .from(UNPAID_PAID_TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (loadErr) throw new Error(userFriendlyDbError(loadErr, "Could not load entry."));
  if (row.status === "closed") throw new Error("This entry is already closed.");

  const nextBalance = Math.max(0, round2(Number(row.balance_outstanding) - amt));
  const emi = Math.max(Number(row.monthly_amount) || 1, 1);
  const monthsLeft = nextBalance <= 0 ? 0 : Math.ceil(nextBalance / emi);

  const { error: setErr } = await supabase.from(UNPAID_PAID_SETTLEMENTS_TABLE).insert({
    unpaid_paid_id: id,
    employee_master_id: row.employee_master_id,
    amount: amt,
    month_key: mk,
    settlement_date: day,
    source: "manual",
    remarks: remarks || null,
    created_by: uid,
  });
  if (setErr) throw new Error(userFriendlyDbError(setErr, "Could not save settlement."));

  const patch = {
    balance_outstanding: nextBalance,
    months_remaining: monthsLeft,
    last_salary_month: mk,
  };
  if (nextBalance <= 0) {
    patch.status = "closed";
    patch.closed_at = new Date().toISOString();
    patch.monthly_amount = 0;
  }

  const { error: updErr } = await supabase.from(UNPAID_PAID_TABLE).update(patch).eq("id", id);
  if (updErr) throw new Error(userFriendlyDbError(updErr, "Could not update balance."));
  return true;
}

export async function createLoan(employeeMasterId, payload) {
  const uid = await currentUserId();
  const months = Math.max(0, Math.floor(Number(payload.months) || 0));
  const start = String(payload.start_month || currentYm()).slice(0, 7);
  const end = months > 0 ? addMonthsYm(start, months - 1) : start;
  const principal = round2(payload.principal);
  const emi = months > 0 ? round2(payload.installment_amount) : 0;

  const row = {
    employee_master_id: Number(employeeMasterId),
    principal,
    balance_outstanding: principal,
    installment_amount: emi,
    months,
    months_remaining: months,
    start_month: start,
    end_month: end,
    entry_date: payload.entry_date || todayIsoDate(),
    status: "active",
    remarks: payload.remarks || null,
    created_by: uid,
  };

  const { data, error } = await supabase.from(LOANS_TABLE).insert(row).select("*").single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not save loan."));
  return mapLoanRow(data, []);
}

export async function updateLoan(loanId, payload) {
  const months = Math.max(0, Math.floor(Number(payload.months_remaining ?? payload.months) || 0));
  const start = String(payload.start_month || currentYm()).slice(0, 7);
  const end = months > 0 ? addMonthsYm(start, months - 1) : start;
  const patch = {
    months_remaining: months,
    installment_amount: months > 0 ? round2(payload.installment_amount) : 0,
    start_month: start,
    end_month: end,
    entry_date: payload.entry_date || todayIsoDate(),
    remarks: payload.remarks ?? null,
  };
  if (payload.months != null && Number(payload.months) > 0) {
    patch.months = Math.floor(Number(payload.months));
  }

  const { data, error } = await supabase
    .from(LOANS_TABLE)
    .update(patch)
    .eq("id", loanId)
    .select("*")
    .single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not update loan."));
  return mapLoanRow(data, []);
}

export async function setLoanStatus(loanId, status) {
  if (!["active", "hold", "closed"].includes(status)) {
    throw new Error("Invalid loan status.");
  }
  const now = new Date().toISOString();
  const patch = {
    status,
    held_at: status === "hold" ? now : null,
    closed_at: status === "closed" ? now : null,
  };
  if (status === "active") {
    patch.held_at = null;
  }

  const { data, error } = await supabase
    .from(LOANS_TABLE)
    .update(patch)
    .eq("id", loanId)
    .select("*")
    .single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not update loan status."));
  return mapLoanRow(data, []);
}

/**
 * Manual recovery against a loan. Updates balance, months left, history; closes when paid off.
 */
export async function addLoanRecovery(loanId, { amount, month_key, recovery_date, remarks } = {}) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Enter a recovery amount greater than zero.");
  const mk = String(month_key || currentYm()).slice(0, 7);
  const day = recovery_date || todayIsoDate();
  const uid = await currentUserId();

  const { data: loan, error: loadErr } = await supabase
    .from(LOANS_TABLE)
    .select("*")
    .eq("id", loanId)
    .single();
  if (loadErr) throw new Error(userFriendlyDbError(loadErr, "Could not load loan."));
  if (loan.status === "closed") throw new Error("This loan is already closed.");

  const nextBalance = Math.max(0, round2(Number(loan.balance_outstanding) - amt));
  const emi = Math.max(Number(loan.installment_amount) || 1, 1);
  const monthsLeft =
    nextBalance <= 0 ? 0 : Math.ceil(nextBalance / emi);

  const { data: rec, error: recErr } = await supabase
    .from(LOAN_RECOVERIES_TABLE)
    .insert({
      loan_id: loanId,
      employee_master_id: loan.employee_master_id,
      amount: amt,
      month_key: mk,
      recovery_date: day,
      source: "manual",
      remarks: remarks || null,
      created_by: uid,
    })
    .select("*")
    .single();
  if (recErr) throw new Error(userFriendlyDbError(recErr, "Could not save recovery."));

  const loanPatch = {
    balance_outstanding: nextBalance,
    months_remaining: monthsLeft,
    last_salary_month: mk,
  };
  if (nextBalance <= 0) {
    loanPatch.status = "closed";
    loanPatch.closed_at = new Date().toISOString();
    loanPatch.installment_amount = 0;
  }

  const { error: updErr } = await supabase.from(LOANS_TABLE).update(loanPatch).eq("id", loanId);
  if (updErr) throw new Error(userFriendlyDbError(updErr, "Could not update loan balance."));

  return mapRecovery(rec);
}

export async function createSalaryAdvance(employeeMasterId, payload) {
  const uid = await currentUserId();
  const months = Math.max(0, Math.floor(Number(payload.months) || 0));
  const start = String(payload.start_month || currentYm()).slice(0, 7);
  const end = months > 0 ? addMonthsYm(start, months - 1) : start;
  const amount = round2(payload.amount);
  const recovery = months > 0 ? round2(payload.recovery_amount) : 0;

  const row = {
    employee_master_id: Number(employeeMasterId),
    amount,
    balance_outstanding: amount,
    recovery_amount: recovery,
    months,
    months_remaining: months,
    start_month: start,
    end_month: end,
    entry_date: payload.entry_date || todayIsoDate(),
    status: "active",
    remarks: payload.remarks || null,
    created_by: uid,
  };

  const { data, error } = await supabase.from(ADVANCES_TABLE).insert(row).select("*").single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not save salary advance."));
  return mapAdvanceRow(data, []);
}

export async function updateSalaryAdvance(advanceId, payload) {
  const months = Math.max(0, Math.floor(Number(payload.months_remaining ?? payload.months) || 0));
  const start = String(payload.start_month || currentYm()).slice(0, 7);
  const end = months > 0 ? addMonthsYm(start, months - 1) : start;
  const patch = {
    months_remaining: months,
    recovery_amount: months > 0 ? round2(payload.recovery_amount) : 0,
    start_month: start,
    end_month: end,
    entry_date: payload.entry_date || todayIsoDate(),
    remarks: payload.remarks ?? null,
  };
  if (payload.months != null && Number(payload.months) > 0) {
    patch.months = Math.floor(Number(payload.months));
  }

  const { data, error } = await supabase
    .from(ADVANCES_TABLE)
    .update(patch)
    .eq("id", advanceId)
    .select("*")
    .single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not update salary advance."));
  return mapAdvanceRow(data, []);
}

export async function setSalaryAdvanceStatus(advanceId, status) {
  if (!["active", "hold", "closed"].includes(status)) {
    throw new Error("Invalid salary advance status.");
  }
  const now = new Date().toISOString();
  const patch = {
    status,
    held_at: status === "hold" ? now : null,
    closed_at: status === "closed" ? now : null,
  };
  if (status === "active") patch.held_at = null;

  const { data, error } = await supabase
    .from(ADVANCES_TABLE)
    .update(patch)
    .eq("id", advanceId)
    .select("*")
    .single();
  if (error) throw new Error(userFriendlyDbError(error, "Could not update salary advance status."));
  return mapAdvanceRow(data, []);
}

export async function addSalaryAdvanceRecovery(
  advanceId,
  { amount, month_key, recovery_date, remarks } = {}
) {
  const amt = round2(amount);
  if (amt <= 0) throw new Error("Enter a recovery amount greater than zero.");
  const mk = String(month_key || currentYm()).slice(0, 7);
  const day = recovery_date || todayIsoDate();
  const uid = await currentUserId();

  const { data: adv, error: loadErr } = await supabase
    .from(ADVANCES_TABLE)
    .select("*")
    .eq("id", advanceId)
    .single();
  if (loadErr) throw new Error(userFriendlyDbError(loadErr, "Could not load salary advance."));
  if (adv.status === "closed") throw new Error("This salary advance is already closed.");

  const nextBalance = Math.max(0, round2(Number(adv.balance_outstanding) - amt));
  const emi = Math.max(Number(adv.recovery_amount) || 1, 1);
  const monthsLeft = nextBalance <= 0 ? 0 : Math.ceil(nextBalance / emi);

  const { data: rec, error: recErr } = await supabase
    .from(ADVANCE_RECOVERIES_TABLE)
    .insert({
      advance_id: advanceId,
      employee_master_id: adv.employee_master_id,
      amount: amt,
      month_key: mk,
      recovery_date: day,
      source: "manual",
      remarks: remarks || null,
      created_by: uid,
    })
    .select("*")
    .single();
  if (recErr) throw new Error(userFriendlyDbError(recErr, "Could not save recovery."));

  const patch = {
    balance_outstanding: nextBalance,
    months_remaining: monthsLeft,
    last_salary_month: mk,
  };
  if (nextBalance <= 0) {
    patch.status = "closed";
    patch.closed_at = new Date().toISOString();
    patch.recovery_amount = 0;
  }

  const { error: updErr } = await supabase.from(ADVANCES_TABLE).update(patch).eq("id", advanceId);
  if (updErr) throw new Error(userFriendlyDbError(updErr, "Could not update advance balance."));

  return mapRecovery(rec);
}

/**
 * Apply one salary-sheet line recovery onto DB loan / advance (idempotent per month).
 */
export async function applySalarySheetLineToDb(employeeMasterId, line, monthKey = "") {
  if (employeeMasterId == null) return;
  const mk = monthKey ? String(monthKey).slice(0, 7) : currentYm();
  const loanAmt = round2(line?.loan);
  const salAdvAmt = round2(line?.sal_adv);
  const uid = await currentUserId();
  const day = todayIsoDate();

  if (loanAmt > 0) {
    const { data: loans, error } = await supabase
      .from(LOANS_TABLE)
      .select("*")
      .eq("employee_master_id", employeeMasterId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const loan = (loans || [])[0];
    if (loan) {
      const { data: existing } = await supabase
        .from(LOAN_RECOVERIES_TABLE)
        .select("*")
        .eq("loan_id", loan.id)
        .eq("source", "salary_sheet")
        .eq("month_key", mk)
        .maybeSingle();

      let balance = round2(loan.balance_outstanding);
      let monthsRem = Number(loan.months_remaining);
      if (existing) {
        const prev = round2(existing.amount);
        balance = Math.max(0, round2(balance - (loanAmt - prev)));
        await supabase
          .from(LOAN_RECOVERIES_TABLE)
          .update({ amount: loanAmt, recovery_date: day })
          .eq("id", existing.id);
      } else {
        balance = Math.max(0, round2(balance - loanAmt));
        if (Number.isFinite(monthsRem)) monthsRem = Math.max(0, monthsRem - 1);
        await supabase.from(LOAN_RECOVERIES_TABLE).insert({
          loan_id: loan.id,
          employee_master_id: employeeMasterId,
          amount: loanAmt,
          month_key: mk,
          recovery_date: day,
          source: "salary_sheet",
          created_by: uid,
        });
      }
      const patch = {
        balance_outstanding: balance,
        months_remaining: Number.isFinite(monthsRem) ? monthsRem : loan.months_remaining,
        last_salary_month: mk,
      };
      if (balance <= 0) {
        patch.status = "closed";
        patch.closed_at = new Date().toISOString();
        patch.installment_amount = 0;
        patch.months_remaining = 0;
      }
      await supabase.from(LOANS_TABLE).update(patch).eq("id", loan.id);
    }
  }

  if (salAdvAmt > 0) {
    const { data: rows, error } = await supabase
      .from(ADVANCES_TABLE)
      .select("*")
      .eq("employee_master_id", employeeMasterId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const adv = (rows || [])[0];
    if (adv) {
      const { data: existing } = await supabase
        .from(ADVANCE_RECOVERIES_TABLE)
        .select("*")
        .eq("advance_id", adv.id)
        .eq("source", "salary_sheet")
        .eq("month_key", mk)
        .maybeSingle();

      let balance = round2(adv.balance_outstanding);
      let monthsRem = Number(adv.months_remaining);
      if (existing) {
        const prev = round2(existing.amount);
        balance = Math.max(0, round2(balance - (salAdvAmt - prev)));
        await supabase
          .from(ADVANCE_RECOVERIES_TABLE)
          .update({ amount: salAdvAmt, recovery_date: day })
          .eq("id", existing.id);
      } else {
        balance = Math.max(0, round2(balance - salAdvAmt));
        if (Number.isFinite(monthsRem)) monthsRem = Math.max(0, monthsRem - 1);
        await supabase.from(ADVANCE_RECOVERIES_TABLE).insert({
          advance_id: adv.id,
          employee_master_id: employeeMasterId,
          amount: salAdvAmt,
          month_key: mk,
          recovery_date: day,
          source: "salary_sheet",
          created_by: uid,
        });
      }
      const patch = {
        balance_outstanding: balance,
        months_remaining: Number.isFinite(monthsRem) ? monthsRem : adv.months_remaining,
        last_salary_month: mk,
      };
      if (balance <= 0) {
        patch.status = "closed";
        patch.closed_at = new Date().toISOString();
        patch.recovery_amount = 0;
        patch.months_remaining = 0;
      }
      await supabase.from(ADVANCES_TABLE).update(patch).eq("id", adv.id);
    }
  }

  const unpaidSheet = round2(line?.unpaid_paid);
  if (unpaidSheet !== 0) {
    const absAmt = Math.abs(unpaidSheet);
    const wantKind = unpaidSheet < 0 ? "company_owes" : "employee_owes";
    const { data: upsRows, error: upsErr } = await supabase
      .from(UNPAID_PAID_TABLE)
      .select("*")
      .eq("employee_master_id", employeeMasterId)
      .in("status", ["open", "active"])
      .order("created_at", { ascending: true });
    if (!upsErr) {
      const match =
        (upsRows || []).find((r) => normalizeUnpaidKind(r.kind) === wantKind) ||
        (upsRows || [])[0];
      if (match) {
        const { data: existing } = await supabase
          .from(UNPAID_PAID_SETTLEMENTS_TABLE)
          .select("*")
          .eq("unpaid_paid_id", match.id)
          .eq("source", "salary_sheet")
          .eq("month_key", mk)
          .maybeSingle();

        let balance = round2(match.balance_outstanding);
        let monthsRem = Number(match.months_remaining);
        if (existing) {
          const prev = round2(existing.amount);
          balance = Math.max(0, round2(balance - (absAmt - prev)));
          await supabase
            .from(UNPAID_PAID_SETTLEMENTS_TABLE)
            .update({ amount: absAmt, settlement_date: day })
            .eq("id", existing.id);
        } else {
          balance = Math.max(0, round2(balance - absAmt));
          if (Number.isFinite(monthsRem)) monthsRem = Math.max(0, monthsRem - 1);
          await supabase.from(UNPAID_PAID_SETTLEMENTS_TABLE).insert({
            unpaid_paid_id: match.id,
            employee_master_id: employeeMasterId,
            amount: absAmt,
            month_key: mk,
            settlement_date: day,
            source: "salary_sheet",
            created_by: uid,
          });
        }
        const patch = {
          balance_outstanding: balance,
          months_remaining: Number.isFinite(monthsRem) ? monthsRem : match.months_remaining,
          last_salary_month: mk,
        };
        if (balance <= 0) {
          patch.status = "closed";
          patch.closed_at = new Date().toISOString();
          patch.monthly_amount = 0;
          patch.months_remaining = 0;
        }
        await supabase.from(UNPAID_PAID_TABLE).update(patch).eq("id", match.id);
      }
    }
  }
}

export async function applySalarySheetLinesToDb(lines, monthKey) {
  for (const line of lines || []) {
    const id = line?.employee_master_id;
    if (id == null) continue;
    try {
      await applySalarySheetLineToDb(id, line, monthKey);
    } catch (err) {
      console.warn("Salary → DB loan/advance sync failed", id, err);
    }
  }
}

/**
 * Seed Loan + Sal Adv + Unpaid/Paid for a pay month from DB (plus local TDS shell).
 */
export async function seedSalaryDeductionsForMonthFromDb(employeeMasterId, monthKey) {
  const mk = String(monthKey || currentYm()).slice(0, 7);
  let loans = [];
  let advances = [];
  let unpaidRows = [];
  try {
    const packed = await fetchLoansAndAdvancesForEmployees([employeeMasterId]);
    loans = packed.loansByEmployee.get(String(employeeMasterId)) || [];
    advances = packed.advancesByEmployee.get(String(employeeMasterId)) || [];
    unpaidRows = packed.unpaidByEmployee?.get(String(employeeMasterId)) || [];
  } catch (err) {
    console.warn("seedSalaryDeductionsForMonthFromDb: DB load failed, using local", err);
    const local = getEmployeeDeductions(employeeMasterId);
    loans = local.loans || [];
    advances = local.salaryAdvances || [];
    unpaidRows = local.unpaidPaid || [];
  }

  let loan = 0;
  for (const l of loans) {
    loan += deductionAmountForMonth(l, mk, { amountKey: "installment_amount" });
  }
  let salAdv = 0;
  for (const a of advances) {
    salAdv += deductionAmountForMonth(a, mk, { amountKey: "recovery_amount" });
  }
  let unpaidPaid = 0;
  for (const u of unpaidRows) {
    unpaidPaid += unpaidSignedAmountForMonth(u, mk);
  }

  const d = getEmployeeDeductions(employeeMasterId);
  let tds = 0;
  if (d.tds?.active && d.tds.mode === "manual") {
    const wef = String(d.tds.wef_month || "").slice(0, 7);
    if (!wef || wef <= mk) tds = round2(d.tds.monthly_amount);
  }

  return {
    loan: round2(loan),
    salAdv: round2(salAdv),
    unpaidPaid: round2(unpaidPaid),
    tds: round2(tds),
  };
}

/** Batch seed map: employeeId → { loan, salAdv, unpaidPaid, tds } */
export async function seedSalaryDeductionsMapFromDb(employeeMasterIds, monthKey) {
  const mk = String(monthKey || currentYm()).slice(0, 7);
  const ids = [...new Set((employeeMasterIds || []).filter((id) => id != null))];
  const map = new Map();
  if (!ids.length) return map;

  let loansByEmployee = new Map();
  let advancesByEmployee = new Map();
  let unpaidByEmployee = new Map();
  try {
    const packed = await fetchLoansAndAdvancesForEmployees(ids);
    loansByEmployee = packed.loansByEmployee;
    advancesByEmployee = packed.advancesByEmployee;
    unpaidByEmployee = packed.unpaidByEmployee || new Map();
  } catch (err) {
    console.warn("seedSalaryDeductionsMapFromDb: falling back to local", err);
  }

  for (const id of ids) {
    const key = String(id);
    const loans = loansByEmployee.get(key) || getEmployeeDeductions(id).loans || [];
    const advances = advancesByEmployee.get(key) || getEmployeeDeductions(id).salaryAdvances || [];
    const unpaidRows =
      unpaidByEmployee.get(key) || getEmployeeDeductions(id).unpaidPaid || [];
    let loan = 0;
    for (const l of loans) loan += deductionAmountForMonth(l, mk, { amountKey: "installment_amount" });
    let salAdv = 0;
    for (const a of advances) salAdv += deductionAmountForMonth(a, mk, { amountKey: "recovery_amount" });
    let unpaidPaid = 0;
    for (const u of unpaidRows) unpaidPaid += unpaidSignedAmountForMonth(u, mk);

    const d = getEmployeeDeductions(id);
    let tds = 0;
    if (d.tds?.active && d.tds.mode === "manual") {
      const wef = String(d.tds.wef_month || "").slice(0, 7);
      if (!wef || wef <= mk) tds = round2(d.tds.monthly_amount);
    }
    map.set(key, {
      loan: round2(loan),
      salAdv: round2(salAdv),
      unpaidPaid: round2(unpaidPaid),
      tds: round2(tds),
    });
  }
  return map;
}
