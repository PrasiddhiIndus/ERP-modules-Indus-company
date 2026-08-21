/**
 * Admin Salary payslips — generated from processed month lines.
 * Written to admin_salary_payslips (and month-line JSON). localStorage is a cache.
 */

import { supabase } from "./supabase";

const PAYSLIP_KEY = "admin_salary_payslips_v1";
export const PAYSLIPS_TABLE = "admin_salary_payslips";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthLabel(year, month) {
  return `${MONTH_NAMES[Number(month)] || month} ${year}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(PAYSLIP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    localStorage.setItem(PAYSLIP_KEY, JSON.stringify(rows));
  } catch (err) {
    console.warn("Payslips: could not persist", err);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round0(v) {
  return Math.round(num(v));
}

export function payslipId(monthKey, employeeMasterId) {
  return `ps_${monthKey}_${employeeMasterId}`;
}

/** Calendar day (YYYY-MM-DD) in local time — the day Process salary was clicked. */
export function todayProcessDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build a payslip record from a processed salary line + run meta.
 * @param {{ processedOn?: string }} [opts] — calendar day Process salary was clicked
 */
export function buildPayslipFromLine(run, line, opts = {}) {
  if (!run || !line?.employee_master_id) return null;
  const monthKey = run.month_key || `${run.pay_year}-${String(run.pay_month).padStart(2, "0")}`;
  const customs = Array.isArray(line.computed_json?.custom_components)
    ? line.computed_json.custom_components
    : Array.isArray(line.source_snapshot_json?.custom_components)
      ? line.source_snapshot_json.custom_components
      : [];

  const processedOn =
    opts.processedOn ||
    run.processed_on ||
    run.summary_json?.processed_on ||
    todayProcessDate();
  const generatedAt = opts.generatedAt || new Date().toISOString();

  return {
    id: payslipId(monthKey, line.employee_master_id),
    employee_master_id: line.employee_master_id,
    employee_code: line.employee_code || "",
    employee_name: line.employee_name || "",
    designation: line.designation || "",
    department: line.department || "",
    pay_year: run.pay_year,
    pay_month: run.pay_month,
    month_key: monthKey,
    month_label: monthLabel(run.pay_year, run.pay_month),
    month_days: num(run.month_days) || 26,
    revision_no: num(run.revision_no) || 1,
    run_id: run.id,
    account_no: line.account_no || "",
    ifsc: line.ifsc || "",
    uan_no: line.uan_no || "",
    esic_no: line.esic_no || "",
    date_of_joining: line.date_of_joining || null,
    present_days: num(line.present_days),
    salary_rate: num(line.salary_rate),
    basic_full: num(line.basic_full),
    basic_earned: num(line.basic_earned),
    hra_full: num(line.hra_full),
    hra_earned: num(line.hra_earned),
    special_full: num(line.special_full),
    special_allowance: num(line.special_allowance),
    custom_earn: num(line.custom_earn ?? line.computed_json?.custom_earn),
    custom_ded: num(line.custom_ded ?? line.computed_json?.custom_ded),
    custom_components: customs,
    pf_basic: num(line.pf_basic),
    pf_earned_basic: num(line.pf_earned_basic),
    gross_wages: num(line.gross_wages),
    emp_pf: num(line.emp_pf),
    emp_esic: num(line.emp_esic),
    pt_amount: num(line.pt_amount),
    loan: num(line.loan),
    sal_adv: num(line.sal_adv),
    unpaid_paid: num(line.unpaid_paid),
    tds: num(line.tds),
    total_ded: num(line.total_ded),
    net_salary: num(line.net_salary),
    bank_amount: num(line.bank_amount),
    status: "generated",
    /** Calendar day the Process salary button was clicked */
    processed_on: processedOn,
    generated_at: generatedAt,
  };
}

/** Upsert payslips for processed employees (one slip per employee for the pay month). */
export function generatePayslipsForRun(run, lines, opts = {}) {
  if (!run || !Array.isArray(lines) || !lines.length) return [];
  const processedOn = opts.processedOn || todayProcessDate();
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const all = readAll();
  const byId = new Map(all.map((p) => [p.id, p]));
  const created = [];
  for (const line of lines) {
    const monthKey = run.month_key || `${run.pay_year}-${String(run.pay_month).padStart(2, "0")}`;
    const existingId = payslipId(monthKey, line.employee_master_id);
    if (opts.skipExisting && byId.has(existingId)) continue;
    const slip = buildPayslipFromLine(run, line, { processedOn, generatedAt });
    if (!slip) continue;
    byId.set(slip.id, slip);
    created.push(slip);
  }
  writeAll([...byId.values()].sort((a, b) => String(b.month_key).localeCompare(String(a.month_key))));
  return created;
}

function slipToDbRow(slip) {
  return {
    id: slip.id,
    run_id: slip.run_id || null,
    employee_master_id: slip.employee_master_id,
    month_key: String(slip.month_key || "").slice(0, 7),
    pay_year: Number(slip.pay_year) || Number(String(slip.month_key || "").slice(0, 4)) || null,
    pay_month: Number(slip.pay_month) || Number(String(slip.month_key || "").slice(5, 7)) || null,
    processed_on: slip.processed_on ? String(slip.processed_on).slice(0, 10) : null,
    slip_json: slip,
  };
}

function slipFromDbRow(row) {
  if (!row) return null;
  const json = row.slip_json && typeof row.slip_json === "object" ? row.slip_json : {};
  return {
    ...json,
    id: row.id || json.id,
    employee_master_id: row.employee_master_id ?? json.employee_master_id,
    month_key: row.month_key || json.month_key,
    pay_year: row.pay_year ?? json.pay_year,
    pay_month: row.pay_month ?? json.pay_month,
    processed_on: row.processed_on || json.processed_on,
    run_id: row.run_id || json.run_id,
    generated_at: json.generated_at || row.updated_at || row.created_at,
  };
}

function mergePayslips(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const slip of list || []) {
      if (!slip) continue;
      const id = slip.id || payslipId(slip.month_key, slip.employee_master_id);
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, { ...slip, id });
        continue;
      }
      const newer =
        String(slip.generated_at || slip.processed_on || "") >=
        String(prev.generated_at || prev.processed_on || "");
      byId.set(id, newer ? { ...prev, ...slip, id } : { ...slip, ...prev, id });
    }
  }
  return [...byId.values()].sort((a, b) =>
    String(b.month_key || "").localeCompare(String(a.month_key || ""))
  );
}

/** Save slips to the salary payslip table. Returns saved count; does not throw on missing table. */
export async function upsertPayslipsToDb(slips = []) {
  const rows = (slips || []).filter((s) => s?.employee_master_id && s?.month_key).map(slipToDbRow);
  if (!rows.length) return 0;
  let saved = 0;
  const chunk = 80;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase
      .from(PAYSLIPS_TABLE)
      .upsert(rows.slice(i, i + chunk), { onConflict: "month_key,employee_master_id" });
    if (error) {
      console.warn("Salary slips: database save skipped", error);
      return saved;
    }
    saved += rows.slice(i, i + chunk).length;
  }
  return saved;
}

export async function fetchPayslipsForEmployeeFromDb(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const { data, error } = await supabase
    .from(PAYSLIPS_TABLE)
    .select("*")
    .eq("employee_master_id", employeeMasterId)
    .order("month_key", { ascending: false });
  if (error) {
    console.warn("Salary slips: employee load skipped", error);
    return [];
  }
  return (data || []).map(slipFromDbRow).filter(Boolean);
}

export async function fetchPayslipsForMonthFromDb(monthKeyValue) {
  const mk = String(monthKeyValue || "").slice(0, 7);
  if (!mk) return [];
  const { data, error } = await supabase
    .from(PAYSLIPS_TABLE)
    .select("*")
    .eq("month_key", mk)
    .order("processed_on", { ascending: false });
  if (error) {
    console.warn("Salary slips: month load skipped", error);
    return [];
  }
  return (data || []).map(slipFromDbRow).filter(Boolean);
}

export async function generateAndSavePayslipsForRun(run, lines, opts = {}) {
  const created = generatePayslipsForRun(run, lines, opts);
  if (created.length) {
    await upsertPayslipsToDb(created);
  }
  return created;
}

export async function fetchPayslipsFromMonthLines(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const { data, error } = await supabase
    .from("admin_salary_month_lines")
    .select(
      "employee_master_id, employee_code, employee_name, designation, computed_json, source_snapshot_json, present_days, gross_wages, total_ded, net_salary, bank_amount, run_id"
    )
    .eq("employee_master_id", employeeMasterId);
  if (error) {
    console.warn("Salary slips: sheet load skipped", error);
    return [];
  }
  const out = [];
  for (const line of data || []) {
    const cj = line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
    const snap =
      line.source_snapshot_json && typeof line.source_snapshot_json === "object"
        ? line.source_snapshot_json
        : {};
    if (!cj.slip_generated_on && !snap.slip_generated_on && !cj.payslip) continue;
    if (cj.payslip && typeof cj.payslip === "object") {
      out.push(cj.payslip);
      continue;
    }
    const monthKey = cj.pay_month_key || snap.pay_month_key || "";
    if (!monthKey) continue;
    out.push({
      id: payslipId(monthKey, line.employee_master_id),
      employee_master_id: line.employee_master_id,
      employee_code: line.employee_code || "",
      employee_name: line.employee_name || "",
      designation: line.designation || "",
      month_key: monthKey,
      processed_on: String(cj.slip_generated_on || snap.slip_generated_on || "").slice(0, 10),
      present_days: line.present_days,
      gross_wages: line.gross_wages,
      total_ded: line.total_ded,
      net_salary: line.net_salary,
      bank_amount: line.bank_amount,
      run_id: line.run_id,
      status: "generated",
    });
  }
  return out;
}

export async function listPayslipsForEmployeeAsync(employeeMasterId) {
  const [fromTable, fromLines] = await Promise.all([
    fetchPayslipsForEmployeeFromDb(employeeMasterId),
    fetchPayslipsFromMonthLines(employeeMasterId),
  ]);
  const merged = mergePayslips(fromTable, fromLines, listPayslipsForEmployee(employeeMasterId));
  if (merged.length) {
    const all = readAll();
    const byId = new Map(all.map((p) => [p.id, p]));
    for (const slip of merged) {
      if (slip?.id) byId.set(slip.id, slip);
    }
    writeAll([...byId.values()]);
  }
  return merged;
}

export async function listPayslipsForMonthAsync(monthKeyValue) {
  const mk = String(monthKeyValue || "").slice(0, 7);
  const fromTable = await fetchPayslipsForMonthFromDb(mk);
  return mergePayslips(fromTable, listPayslipsForMonth(mk));
}

export function listPayslipsForEmployee(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  return readAll()
    .filter((p) => String(p.employee_master_id) === String(employeeMasterId))
    .sort((a, b) => String(b.month_key).localeCompare(String(a.month_key)));
}

/** Payslips for one pay month (YYYY-MM), newest process day first. */
export function listPayslipsForMonth(monthKeyValue) {
  const mk = String(monthKeyValue || "").slice(0, 7);
  if (!mk) return [];
  return readAll()
    .filter((p) => String(p.month_key || "").slice(0, 7) === mk)
    .sort((a, b) => {
      const da = String(b.processed_on || b.generated_at || "");
      const db = String(a.processed_on || a.generated_at || "");
      return da.localeCompare(db);
    });
}

export function getPayslipById(id) {
  return readAll().find((p) => p.id === id) || null;
}

/**
 * Salary history rows for an employee (from payslips + processed runs).
 */
export async function fetchSalaryHistoryForEmployee(employeeMasterId) {
  const id = employeeMasterId;
  if (id == null || id === "") return [];

  const slips = await listPayslipsForEmployeeAsync(id);
  if (slips.length) {
    return slips.map((p) => ({
      id: p.id,
      month_key: p.month_key,
      month_label: p.month_label,
      pay_year: p.pay_year,
      pay_month: p.pay_month,
      revision_no: p.revision_no,
      present_days: p.present_days,
      gross_wages: p.gross_wages,
      total_ded: p.total_ded,
      net_salary: p.net_salary,
      bank_amount: p.bank_amount,
      payslip_id: p.id,
      status: p.status || "processed",
      updated_at: p.generated_at,
    }));
  }

  try {
    const mockMod = await import("../pages/adminOperations/salaryAdmin/salaryProcessingMock");
    let bundles;
    if (mockMod.USE_MOCK_SALARY_PROCESSING) {
      bundles = mockMod.mockListRunsWithLines();
    } else {
      const { listMonthRunsWithLines } = await import(
        "../pages/adminOperations/salaryAdmin/salaryMonthProcessing"
      );
      bundles = await listMonthRunsWithLines();
    }
    const rows = [];
    for (const { run, lines } of bundles || []) {
      const line = (lines || []).find((l) => String(l.employee_master_id) === String(id));
      if (!line) continue;
      rows.push({
        id: `${run.month_key}_${id}`,
        month_key: run.month_key,
        month_label: monthLabel(run.pay_year, run.pay_month),
        pay_year: run.pay_year,
        pay_month: run.pay_month,
        revision_no: run.revision_no,
        present_days: line.present_days,
        gross_wages: line.gross_wages,
        total_ded: line.total_ded,
        net_salary: line.net_salary,
        bank_amount: line.bank_amount,
        payslip_id: null,
        status: run.status || "processed",
        updated_at: run.updated_at,
        line,
        run,
      });
    }
    return rows.sort((a, b) => String(b.month_key).localeCompare(String(a.month_key)));
  } catch (err) {
    console.warn("Salary history load failed", err);
    return [];
  }
}

export function formatPayslipMoney(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return round0(v).toLocaleString("en-IN");
}
