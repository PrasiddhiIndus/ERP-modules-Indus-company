/**
 * Admin Salary payslips — generated from processed month lines.
 * Stored locally until salary payslip tables are wired.
 */

const PAYSLIP_KEY = "admin_salary_payslips_v1";

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
    const slip = buildPayslipFromLine(run, line, { processedOn, generatedAt });
    if (!slip) continue;
    byId.set(slip.id, slip);
    created.push(slip);
  }
  writeAll([...byId.values()].sort((a, b) => String(b.month_key).localeCompare(String(a.month_key))));
  return created;
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

  const slips = listPayslipsForEmployee(id);
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
