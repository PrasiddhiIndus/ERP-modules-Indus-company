/**
 * Admin Salary payslips — generated from processed month lines.
 * Written to admin_salary_payslips (and month-line JSON). localStorage is a cache.
 */

import { supabase } from "./supabase";
import { salaryFiguresHidden } from "../pages/adminOperations/salaryAdmin/salaryPrivacy";

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

/** Employee-specific CTC components on a processed line → [{ label, amount }] for this month. */
function extraLines(line, key) {
  const list = Array.isArray(line?.computed_json?.[key]) ? line.computed_json[key] : [];
  return list
    .map((c) => ({ label: String(c?.label || "").trim(), amount: num(c?.earned) }))
    .filter((c) => c.label && c.amount > 0);
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
  const monthRemarksRaw = String(
    opts.monthRemarks ??
      line.computed_json?.month_remarks ??
      line.source_snapshot_json?.month_remarks ??
      ""
  ).trim();
  const showMonthRemarks =
    opts.showMonthRemarks != null
      ? Boolean(opts.showMonthRemarks)
      : line.computed_json?.show_month_remarks != null
        ? Boolean(line.computed_json.show_month_remarks)
        : false;
  const monthRemarks = showMonthRemarks ? monthRemarksRaw : "";

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
    confirmation_date: line.confirmation_date || null,
    present_days: num(line.present_days),
    salary_rate: num(line.salary_rate),
    basic_full: num(line.basic_full),
    basic_earned: num(line.basic_earned),
    hra_full: num(line.hra_full),
    hra_earned: num(line.hra_earned),
    special_full: num(line.special_full),
    special_allowance: num(line.special_allowance),
    conveyance_earned: num(line.conveyance_earned ?? line.computed_json?.conveyance_earned),
    stat_bonus_earned: num(line.stat_bonus_earned ?? line.computed_json?.stat_bonus_earned),
    medical_earned: num(line.medical_earned ?? line.computed_json?.medical_earned),
    perf_incentive_earned: num(line.perf_incentive_earned ?? line.computed_json?.perf_incentive_earned),
    extra_earnings: extraLines(line, "extra_earnings"),
    extra_deductions: extraLines(line, "extra_deductions"),
    annexure_structure: Boolean(line.computed_json?.annexure),
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
    /** Optional note for this pay month (from CTC Details). */
    month_remarks: monthRemarks || "",
    /** When false, PayslipTemplate hides the Remarks section entirely. */
    show_month_remarks: Boolean(showMonthRemarks && monthRemarks),
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
  const remarksByEmp =
    opts.remarksByEmp instanceof Map
      ? opts.remarksByEmp
      : opts.remarksByEmp && typeof opts.remarksByEmp === "object"
        ? new Map(Object.entries(opts.remarksByEmp))
        : null;
  for (const line of lines) {
    const monthKey = run.month_key || `${run.pay_year}-${String(run.pay_month).padStart(2, "0")}`;
    const existingId = payslipId(monthKey, line.employee_master_id);
    if (opts.skipExisting && byId.has(existingId)) continue;
    const monthRemarks =
      remarksByEmp?.get(String(line.employee_master_id)) ??
      line.computed_json?.month_remarks ??
      "";
    const slip = buildPayslipFromLine(run, line, { processedOn, generatedAt, monthRemarks });
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

/** Compact snapshot kept on each payslip revision for history. */
function revisionSnapshot(slip) {
  if (!slip) return null;
  return {
    present_days: num(slip.present_days),
    gross_wages: num(slip.gross_wages),
    emp_pf: num(slip.emp_pf),
    emp_esic: num(slip.emp_esic),
    pt_amount: num(slip.pt_amount),
    loan: num(slip.loan),
    sal_adv: num(slip.sal_adv),
    unpaid_paid: num(slip.unpaid_paid),
    tds: num(slip.tds),
    total_ded: num(slip.total_ded),
    net_salary: num(slip.net_salary),
    bank_amount: num(slip.bank_amount),
  };
}

/**
 * Attach revision history when regenerating / editing a payslip.
 * Previous current slip is pushed into revision_history; payslip_revision_no increments.
 */
export function withPayslipRevision(previousSlip, nextSlip, opts = {}) {
  if (!nextSlip) return null;
  const history = Array.isArray(previousSlip?.revision_history)
    ? [...previousSlip.revision_history]
    : [];
  if (previousSlip && (previousSlip.net_salary != null || previousSlip.gross_wages != null)) {
    history.push({
      revision_no: num(previousSlip.payslip_revision_no) || history.length + 1 || 1,
      generated_at: previousSlip.generated_at || previousSlip.processed_on || null,
      note: String(previousSlip.revision_note || "").trim(),
      revised_by: previousSlip.revised_by || "",
      ...revisionSnapshot(previousSlip),
    });
  }
  const prevNo = num(previousSlip?.payslip_revision_no) || history.length || 0;
  return {
    ...nextSlip,
    payslip_revision_no: prevNo + 1,
    revision_history: history,
    revision_note: String(opts.note || "").trim(),
    revised_by: opts.revisedBy || "",
    generated_at: opts.generatedAt || new Date().toISOString(),
  };
}

export function payslipRevisionList(slip) {
  const history = Array.isArray(slip?.revision_history) ? slip.revision_history : [];
  const current = slip
    ? {
        revision_no: num(slip.payslip_revision_no) || history.length + 1 || 1,
        generated_at: slip.generated_at || slip.processed_on || null,
        note: String(slip.revision_note || "").trim() || "Current",
        revised_by: slip.revised_by || "",
        current: true,
        ...revisionSnapshot(slip),
      }
    : null;
  const past = history
    .map((h, i) => ({
      ...h,
      revision_no: num(h.revision_no) || i + 1,
      current: false,
    }))
    .sort((a, b) => num(b.revision_no) - num(a.revision_no));
  return current ? [current, ...past] : past;
}

/**
 * Build + save payslips for selected lines, preserving revision history when regenerating.
 * @param {{ skipExisting?: boolean, forceRevision?: boolean, note?: string, revisedBy?: string }} opts
 */
export async function generatePayslipsPreservingHistory(run, lines, opts = {}) {
  if (!run || !Array.isArray(lines) || !lines.length) return [];
  const monthKeyValue =
    run.month_key || `${run.pay_year}-${String(run.pay_month).padStart(2, "0")}`;
  const existing = await fetchPayslipsForMonthFromDb(monthKeyValue);
  const byEmp = new Map(existing.map((s) => [String(s.employee_master_id), s]));
  const local = readAll().filter((s) => String(s.month_key).slice(0, 7) === String(monthKeyValue).slice(0, 7));
  for (const s of local) {
    const id = String(s.employee_master_id);
    if (!byEmp.has(id)) byEmp.set(id, s);
  }

  const processedOn = opts.processedOn || todayProcessDate();
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const created = [];
  const all = readAll();
  const byId = new Map(all.map((p) => [p.id, p]));

  for (const line of lines) {
    const empId = String(line.employee_master_id);
    const prev = byEmp.get(empId) || byId.get(payslipId(monthKeyValue, line.employee_master_id));
    if (opts.skipExisting && prev && !opts.forceRevision) continue;

    const base = buildPayslipFromLine(run, line, {
      processedOn: prev?.processed_on || processedOn,
      generatedAt,
      monthRemarks: opts.remarksByEmp?.get?.(empId) ?? line.computed_json?.month_remarks ?? "",
      showMonthRemarks: line.computed_json?.show_month_remarks,
    });
    if (!base) continue;

    const slip =
      prev || opts.forceRevision
        ? withPayslipRevision(prev, base, {
            note: opts.note || (prev ? "Regenerated" : "Generated"),
            revisedBy: opts.revisedBy || "",
            generatedAt,
          })
        : {
            ...base,
            payslip_revision_no: 1,
            revision_history: [],
            revision_note: opts.note || "Generated",
          };

    byId.set(slip.id, slip);
    byEmp.set(empId, slip);
    created.push(slip);
  }

  writeAll([...byId.values()].sort((a, b) => String(b.month_key).localeCompare(String(a.month_key))));
  if (created.length) await upsertPayslipsToDb(created);
  return created;
}

/** Full slips built from this employee's lines on processed salary months (the saved salary sheet). */
export async function fetchPayslipsFromMonthLines(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const { data: lines, error } = await supabase
    .from("admin_salary_month_lines")
    .select("*")
    .eq("employee_master_id", employeeMasterId);
  if (error) {
    console.warn("Salary slips: sheet load skipped", error);
    return [];
  }
  const runIds = [...new Set((lines || []).map((l) => l.run_id).filter(Boolean))];
  if (!runIds.length) return [];
  const { data: runs, error: runErr } = await supabase
    .from("admin_salary_month_runs")
    .select("*")
    .in("id", runIds);
  if (runErr) {
    console.warn("Salary slips: month load skipped", runErr);
    return [];
  }
  const runById = new Map((runs || []).map((r) => [String(r.id), r]));
  const out = [];
  for (const line of lines || []) {
    const run = runById.get(String(line.run_id));
    if (!run || run.status !== "processed") continue;
    const cj = line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
    const snap =
      line.source_snapshot_json && typeof line.source_snapshot_json === "object"
        ? line.source_snapshot_json
        : {};
    const slip = buildPayslipFromLine(run, line, {
      processedOn: String(
        cj.slip_generated_on || snap.slip_generated_on || run.summary_json?.processed_on || ""
      ).slice(0, 10) || undefined,
      generatedAt: run.summary_json?.processed_at || run.updated_at || line.updated_at || undefined,
    });
    if (slip) out.push(slip);
  }
  return out;
}

export async function listPayslipsForEmployeeAsync(employeeMasterId) {
  const [fromTable, fromLines, remarksRows] = await Promise.all([
    fetchPayslipsForEmployeeFromDb(employeeMasterId),
    fetchPayslipsFromMonthLines(employeeMasterId),
    import("../pages/adminOperations/salaryAdmin/salaryMonthRemarksDb")
      .then((m) => m.listMonthRemarksForEmployee(employeeMasterId))
      .catch(() => []),
  ]);
  const { resolveEffectiveMonthRemarks } = await import(
    "../pages/adminOperations/salaryAdmin/salaryMonthRemarksDb"
  ).catch(() => ({ resolveEffectiveMonthRemarks: null }));
  const merged = mergePayslips(fromTable, fromLines, listPayslipsForEmployee(employeeMasterId)).map(
    (slip) => {
      if (typeof resolveEffectiveMonthRemarks !== "function") return slip;
      const mk = String(slip?.month_key || "").slice(0, 7);
      const eff = resolveEffectiveMonthRemarks(remarksRows || [], mk);
      const show = Boolean(eff.showOnPayslip && eff.remarks);
      return {
        ...slip,
        month_remarks: show ? eff.remarks : "",
        show_month_remarks: show,
      };
    }
  );
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
      month_remarks: p.month_remarks || "",
      show_month_remarks: p.show_month_remarks === true && Boolean(p.month_remarks),
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
        month_remarks: String(line.computed_json?.month_remarks || "").trim(),
        show_month_remarks: line.computed_json?.show_month_remarks === true,
        payslip_id: null,
        status: run.status || "processed",
        updated_at: run.updated_at,
        line,
        run,
      });
    }
    try {
      const { listMonthRemarksForEmployee, resolveEffectiveMonthRemarks } = await import(
        "../pages/adminOperations/salaryAdmin/salaryMonthRemarksDb"
      );
      const remarksRows = await listMonthRemarksForEmployee(id);
      for (const row of rows) {
        const mk = String(row.month_key || "").slice(0, 7);
        const eff = resolveEffectiveMonthRemarks(remarksRows || [], mk);
        const show = Boolean(eff.showOnPayslip && eff.remarks);
        row.month_remarks = show ? eff.remarks : "";
        row.show_month_remarks = show;
      }
    } catch {
      /* remarks optional */
    }
    return rows.sort((a, b) => String(b.month_key).localeCompare(String(a.month_key)));
  } catch (err) {
    console.warn("Salary history load failed", err);
    return [];
  }
}

export function formatPayslipMoney(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  if (salaryFiguresHidden()) return "XXXXX";
  return round0(v).toLocaleString("en-IN");
}
