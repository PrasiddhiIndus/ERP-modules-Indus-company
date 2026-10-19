/**
 * Per-employee, per-month salary remarks (CTC Details).
 * Mirrored onto payslip slip_json and processed month-line computed_json when present.
 */

import { supabase } from "../../../lib/supabase";
import {
  PAYSLIPS_TABLE,
  payslipId,
} from "../../../lib/salaryPayslips";

export const MONTH_REMARKS_TABLE = "admin_salary_employee_month_remarks";

function normalizeMonthKey(v) {
  const s = String(v || "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
}

function normalizeRemarks(v) {
  return String(v ?? "").trim();
}

/** All month remarks for one employee, newest month first. */
export async function listMonthRemarksForEmployee(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const { data, error } = await supabase
    .from(MONTH_REMARKS_TABLE)
    .select("id, employee_master_id, month_key, remarks, updated_at")
    .eq("employee_master_id", employeeMasterId)
    .order("month_key", { ascending: false });
  if (error) {
    console.warn("Month remarks: list skipped", error);
    return [];
  }
  return data || [];
}

/** Single remark text for employee + month (empty string if none). */
export async function getMonthRemarks(employeeMasterId, monthKey) {
  const mk = normalizeMonthKey(monthKey);
  if (employeeMasterId == null || employeeMasterId === "" || !mk) return "";
  const { data, error } = await supabase
    .from(MONTH_REMARKS_TABLE)
    .select("remarks")
    .eq("employee_master_id", employeeMasterId)
    .eq("month_key", mk)
    .maybeSingle();
  if (error) {
    console.warn("Month remarks: get skipped", error);
    return "";
  }
  return normalizeRemarks(data?.remarks);
}

/**
 * Map employee_master_id → remarks for one pay month.
 * @returns {Map<string, string>}
 */
export async function fetchMonthRemarksMap(monthKey, employeeMasterIds = []) {
  const mk = normalizeMonthKey(monthKey);
  const ids = [...new Set((employeeMasterIds || []).filter((id) => id != null && id !== ""))];
  const map = new Map();
  if (!mk || !ids.length) return map;

  const { data, error } = await supabase
    .from(MONTH_REMARKS_TABLE)
    .select("employee_master_id, remarks")
    .eq("month_key", mk)
    .in("employee_master_id", ids);
  if (error) {
    console.warn("Month remarks: batch load skipped", error);
    return map;
  }
  for (const row of data || []) {
    const text = normalizeRemarks(row.remarks);
    if (text) map.set(String(row.employee_master_id), text);
  }
  return map;
}

async function syncRemarksToPayslip(employeeMasterId, monthKey, remarks) {
  const mk = normalizeMonthKey(monthKey);
  const text = normalizeRemarks(remarks);
  if (!mk) return;

  const id = payslipId(mk, employeeMasterId);
  const { data: existing, error: readErr } = await supabase
    .from(PAYSLIPS_TABLE)
    .select("id, slip_json")
    .eq("month_key", mk)
    .eq("employee_master_id", employeeMasterId)
    .maybeSingle();
  if (readErr) {
    console.warn("Month remarks: payslip read skipped", readErr);
    return;
  }
  if (!existing?.id) return;

  const slip =
    existing.slip_json && typeof existing.slip_json === "object" ? { ...existing.slip_json } : {};
  slip.month_remarks = text;
  slip.id = existing.id || id;

  const { error } = await supabase
    .from(PAYSLIPS_TABLE)
    .update({ slip_json: slip, updated_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) console.warn("Month remarks: payslip update skipped", error);

  try {
    const raw = localStorage.getItem("admin_salary_payslips_v1");
    const all = raw ? JSON.parse(raw) : [];
    if (Array.isArray(all)) {
      const next = all.map((p) =>
        String(p?.id) === String(existing.id) ||
        (String(p?.month_key) === mk && String(p?.employee_master_id) === String(employeeMasterId))
          ? { ...p, month_remarks: text }
          : p
      );
      localStorage.setItem("admin_salary_payslips_v1", JSON.stringify(next));
    }
  } catch {
    /* ignore cache write */
  }
}

async function syncRemarksToMonthLine(employeeMasterId, monthKey, remarks) {
  const mk = normalizeMonthKey(monthKey);
  const text = normalizeRemarks(remarks);
  if (!mk) return;

  const { data: runs, error: runErr } = await supabase
    .from("admin_salary_month_runs")
    .select("id")
    .eq("month_key", mk);
  if (runErr || !runs?.length) return;

  const runIds = runs.map((r) => r.id);
  const { data: lines, error: lineErr } = await supabase
    .from("admin_salary_month_lines")
    .select("id, computed_json")
    .eq("employee_master_id", employeeMasterId)
    .in("run_id", runIds);
  if (lineErr || !lines?.length) return;

  const now = new Date().toISOString();
  for (const line of lines) {
    const cj =
      line.computed_json && typeof line.computed_json === "object" ? { ...line.computed_json } : {};
    cj.month_remarks = text;
    if (cj.payslip && typeof cj.payslip === "object") {
      cj.payslip = { ...cj.payslip, month_remarks: text };
    }
    const { error } = await supabase
      .from("admin_salary_month_lines")
      .update({ computed_json: cj, updated_at: now })
      .eq("id", line.id);
    if (error) console.warn("Month remarks: line update skipped", error);
  }
}

/**
 * Upsert remarks and mirror onto existing payslip / processed lines for that month.
 * Empty remarks deletes the row (and clears mirrored fields).
 */
export async function upsertEmployeeMonthRemarks(employeeMasterId, monthKey, remarks) {
  const mk = normalizeMonthKey(monthKey);
  if (employeeMasterId == null || employeeMasterId === "" || !mk) {
    throw new Error("Select a valid month.");
  }
  const text = normalizeRemarks(remarks);

  if (!text) {
    const { error } = await supabase
      .from(MONTH_REMARKS_TABLE)
      .delete()
      .eq("employee_master_id", employeeMasterId)
      .eq("month_key", mk);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(MONTH_REMARKS_TABLE).upsert(
      {
        employee_master_id: employeeMasterId,
        month_key: mk,
        remarks: text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_master_id,month_key" }
    );
    if (error) throw error;
  }

  await Promise.all([
    syncRemarksToPayslip(employeeMasterId, mk, text),
    syncRemarksToMonthLine(employeeMasterId, mk, text),
  ]);

  return { month_key: mk, remarks: text };
}
