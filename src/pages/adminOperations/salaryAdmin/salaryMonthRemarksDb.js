/**
 * Per-employee, per-month salary remarks (CTC Details).
 * Remarks carry forward to later months until edited or cleared.
 * Visibility flags control whether the Remarks section appears on payslip / annexure.
 */

import { supabase } from "../../../lib/supabase";
import { PAYSLIPS_TABLE, payslipId } from "../../../lib/salaryPayslips";

export const MONTH_REMARKS_TABLE = "admin_salary_employee_month_remarks";

function normalizeMonthKey(v) {
  const s = String(v || "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
}

function normalizeRemarks(v) {
  return String(v ?? "").trim();
}

function addMonths(monthKey, delta) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return "";
  const [y0, m0] = mk.split("-").map(Number);
  const d = new Date(y0, m0 - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Effective remarks for a pay month (carry-forward from the latest prior entry).
 * An empty remarks row stops carry-forward for later months.
 * Visibility is opt-in (must be explicitly true).
 */
export function resolveEffectiveMonthRemarks(rows, monthKey) {
  const mk = normalizeMonthKey(monthKey);
  const empty = {
    remarks: "",
    showOnPayslip: false,
    showOnAnnexure: false,
    sourceMonth: "",
    carried: false,
  };
  if (!mk) return empty;

  const ordered = [...(rows || [])]
    .map((r) => ({
      month_key: normalizeMonthKey(r.month_key),
      remarks: normalizeRemarks(r.remarks),
      show_on_payslip: r.show_on_payslip === true,
      show_on_annexure: r.show_on_annexure === true,
    }))
    .filter((r) => r.month_key && r.month_key <= mk)
    .sort((a, b) => a.month_key.localeCompare(b.month_key));

  if (!ordered.length) return empty;

  const last = ordered[ordered.length - 1];
  const text = last.remarks;
  if (!text) {
    return {
      remarks: "",
      showOnPayslip: false,
      showOnAnnexure: false,
      sourceMonth: last.month_key,
      carried: last.month_key !== mk,
    };
  }
  return {
    remarks: text,
    showOnPayslip: Boolean(last.show_on_payslip),
    showOnAnnexure: Boolean(last.show_on_annexure),
    sourceMonth: last.month_key,
    carried: last.month_key !== mk,
  };
}

/** All month remarks for one employee, newest month first. */
export async function listMonthRemarksForEmployee(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const { data, error } = await supabase
    .from(MONTH_REMARKS_TABLE)
    .select(
      "id, employee_master_id, month_key, remarks, show_on_payslip, show_on_annexure, updated_at"
    )
    .eq("employee_master_id", employeeMasterId)
    .order("month_key", { ascending: false });
  if (error) {
    console.warn("Month remarks: list skipped", error);
    return [];
  }
  return data || [];
}

/** Stored row for a month only (no carry-forward). */
export async function getStoredMonthRemarks(employeeMasterId, monthKey) {
  const mk = normalizeMonthKey(monthKey);
  if (employeeMasterId == null || employeeMasterId === "" || !mk) {
    return { remarks: "", showOnPayslip: false, showOnAnnexure: false, stored: false };
  }
  const { data, error } = await supabase
    .from(MONTH_REMARKS_TABLE)
    .select("remarks, show_on_payslip, show_on_annexure")
    .eq("employee_master_id", employeeMasterId)
    .eq("month_key", mk)
    .maybeSingle();
  if (error) {
    console.warn("Month remarks: get stored skipped", error);
    return { remarks: "", showOnPayslip: false, showOnAnnexure: false, stored: false };
  }
  if (!data) return { remarks: "", showOnPayslip: false, showOnAnnexure: false, stored: false };
  return {
    remarks: normalizeRemarks(data.remarks),
    showOnPayslip: data.show_on_payslip === true,
    showOnAnnexure: data.show_on_annexure === true,
    stored: true,
  };
}

/** Effective remarks text for payslip (empty when hidden or cleared). */
export async function getMonthRemarks(employeeMasterId, monthKey) {
  const rows = await listMonthRemarksForEmployee(employeeMasterId);
  const eff = resolveEffectiveMonthRemarks(rows, monthKey);
  if (!eff.showOnPayslip || !eff.remarks) return "";
  return eff.remarks;
}

/**
 * Map employee_master_id → payslip-visible remarks for one pay month (with carry-forward).
 * @returns {Map<string, string>}
 */
export async function fetchMonthRemarksMap(monthKey, employeeMasterIds = []) {
  const mk = normalizeMonthKey(monthKey);
  const ids = [...new Set((employeeMasterIds || []).filter((id) => id != null && id !== ""))];
  const map = new Map();
  if (!mk || !ids.length) return map;

  const { data, error } = await supabase
    .from(MONTH_REMARKS_TABLE)
    .select("employee_master_id, month_key, remarks, show_on_payslip, show_on_annexure")
    .in("employee_master_id", ids)
    .lte("month_key", mk)
    .order("month_key", { ascending: true });
  if (error) {
    console.warn("Month remarks: batch load skipped", error);
    return map;
  }

  const byEmp = new Map();
  for (const row of data || []) {
    const id = String(row.employee_master_id);
    if (!byEmp.has(id)) byEmp.set(id, []);
    byEmp.get(id).push(row);
  }
  for (const id of ids) {
    const eff = resolveEffectiveMonthRemarks(byEmp.get(String(id)) || [], mk);
    if (eff.showOnPayslip && eff.remarks) map.set(String(id), eff.remarks);
  }
  return map;
}

/** Effective annexure remarks for a month (carry-forward + annexure visibility). */
export async function getAnnexureMonthRemarks(employeeMasterId, monthKey) {
  const rows = await listMonthRemarksForEmployee(employeeMasterId);
  const eff = resolveEffectiveMonthRemarks(rows, monthKey);
  if (!eff.showOnAnnexure || !eff.remarks) {
    return { remarks: "", show: false, sourceMonth: eff.sourceMonth, carried: eff.carried };
  }
  return {
    remarks: eff.remarks,
    show: true,
    sourceMonth: eff.sourceMonth,
    carried: eff.carried,
  };
}

async function syncRemarksToPayslip(employeeMasterId, monthKey, remarks, showOnPayslip) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return;

  const text = showOnPayslip ? normalizeRemarks(remarks) : "";
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
  slip.show_month_remarks = Boolean(showOnPayslip && text);
  slip.id = existing.id || payslipId(mk, employeeMasterId);

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
          ? { ...p, month_remarks: text, show_month_remarks: Boolean(showOnPayslip && text) }
          : p
      );
      localStorage.setItem("admin_salary_payslips_v1", JSON.stringify(next));
    }
  } catch {
    /* ignore cache write */
  }
}

async function syncRemarksToMonthLine(employeeMasterId, monthKey, remarks, showOnPayslip) {
  const mk = normalizeMonthKey(monthKey);
  if (!mk) return;
  const text = showOnPayslip ? normalizeRemarks(remarks) : "";

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
    cj.show_month_remarks = Boolean(showOnPayslip && text);
    if (cj.payslip && typeof cj.payslip === "object") {
      cj.payslip = {
        ...cj.payslip,
        month_remarks: text,
        show_month_remarks: Boolean(showOnPayslip && text),
      };
    }
    const { error } = await supabase
      .from("admin_salary_month_lines")
      .update({ computed_json: cj, updated_at: now })
      .eq("id", line.id);
    if (error) console.warn("Month remarks: line update skipped", error);
  }
}

/** Refresh payslip/line remarks for this employee using carry-forward resolution. */
export async function resyncEmployeePayslipRemarks(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return;
  const rows = await listMonthRemarksForEmployee(employeeMasterId);
  const { data: slips, error } = await supabase
    .from(PAYSLIPS_TABLE)
    .select("month_key")
    .eq("employee_master_id", employeeMasterId);
  if (error) {
    console.warn("Month remarks: payslip list skipped", error);
    return;
  }
  const months = [...new Set((slips || []).map((s) => normalizeMonthKey(s.month_key)).filter(Boolean))];
  await Promise.all(
    months.map(async (mk) => {
      const eff = resolveEffectiveMonthRemarks(rows, mk);
      const show = Boolean(eff.showOnPayslip && eff.remarks);
      await Promise.all([
        syncRemarksToPayslip(employeeMasterId, mk, show ? eff.remarks : "", show),
        syncRemarksToMonthLine(employeeMasterId, mk, show ? eff.remarks : "", show),
      ]);
    })
  );
}

/**
 * Upsert remarks for one or more months and mirror onto payslips / lines.
 * Empty remarks clears the months and stops carry-forward from that point.
 *
 * Call styles:
 *   upsertEmployeeMonthRemarks(id, monthKey, remarks)
 *   upsertEmployeeMonthRemarks(id, monthKeys[], remarks, showOnDocuments)
 *   upsertEmployeeMonthRemarks({ employeeMasterId, monthKeys, remarks, showOnDocuments })
 */
export async function upsertEmployeeMonthRemarks(arg1, arg2, arg3, arg4) {
  let employeeMasterId;
  let monthKeysRaw;
  let remarksIn;
  let showOnDocuments = false;

  if (arg1 && typeof arg1 === "object" && !Array.isArray(arg1)) {
    employeeMasterId = arg1.employeeMasterId;
    monthKeysRaw = arg1.monthKeys || (arg1.monthKey ? [arg1.monthKey] : []);
    remarksIn = arg1.remarks ?? "";
    showOnDocuments = arg1.showOnDocuments === true;
  } else {
    employeeMasterId = arg1;
    monthKeysRaw = Array.isArray(arg2) ? arg2 : [arg2];
    remarksIn = arg3 ?? "";
    showOnDocuments = arg4 === true;
  }

  const monthKeys = [...new Set(monthKeysRaw.map(normalizeMonthKey).filter(Boolean))].sort();
  if (employeeMasterId == null || employeeMasterId === "" || !monthKeys.length) {
    throw new Error("Select at least one month.");
  }

  const text = normalizeRemarks(remarksIn);
  const now = new Date().toISOString();

  if (!text) {
    // Explicit clear: keep a row so carry-forward stops for later months.
    const { error } = await supabase.from(MONTH_REMARKS_TABLE).upsert(
      monthKeys.map((month_key) => ({
        employee_master_id: employeeMasterId,
        month_key,
        remarks: "",
        show_on_payslip: false,
        show_on_annexure: false,
        updated_at: now,
      })),
      { onConflict: "employee_master_id,month_key" }
    );
    if (error) throw error;
  } else {
    const { error } = await supabase.from(MONTH_REMARKS_TABLE).upsert(
      monthKeys.map((month_key) => ({
        employee_master_id: employeeMasterId,
        month_key,
        remarks: text,
        show_on_payslip: showOnDocuments,
        show_on_annexure: showOnDocuments,
        updated_at: now,
      })),
      { onConflict: "employee_master_id,month_key" }
    );
    if (error) throw error;
  }

  await resyncEmployeePayslipRemarks(employeeMasterId);

  return {
    month_keys: monthKeys,
    remarks: text,
    show_on_documents: Boolean(text && showOnDocuments),
  };
}

export { addMonths, normalizeMonthKey };
