/**
 * Salary Admin — month processing (sample sheet workflow).
 * Tables: admin_salary_month_runs / lines / revisions / employee variances.
 */

import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import {
  attendanceEmpCodeLookupVariants,
  fetchMonthlyRegisterPayrollTotals,
} from "../../../lib/attendanceDaily";
import {
  canonicalDepartmentLabel,
  departmentInSelection,
} from "../../../lib/employeeMasterDepartments";
import {
  applySalarySheetToEmployeeMasters,
} from "../../admin/employeeMaster/deductions/deductionsStore";
import {
  applySalarySheetLinesToDb,
  seedSalaryDeductionsMapFromDb,
} from "../../admin/employeeMaster/deductions/deductionsDb";
import { resolvePersonComponentsForPayroll } from "./salaryComponentsCatalog";
import {
  appendProcessBatch,
  applyRevisionToRunSheet,
  flattenProcessedSheetRows,
  getRunSheetNo,
  nextSheetSequenceForRun,
} from "./salarySheetNumbers";
import {
  DEFAULT_MONTH_DAYS,
  computeProcessingRow,
  defaultPtForGross,
  fetchSalaryStructureMapForMonth,
  formatINRPlain,
  resolveHraMonthly,
} from "./salaryData";

export { getRunSheetNo, formatRunSheetNo } from "./salarySheetNumbers";

export const MONTH_RUNS_TABLE = "admin_salary_month_runs";
export const MONTH_LINES_TABLE = "admin_salary_month_lines";
export const RUN_REVISIONS_TABLE = "admin_salary_run_revisions";
export const VARIANCE_TABLE = "admin_employee_salary_variances";
export const PAYSLIPS_TABLE = "admin_salary_payslips";

const MASTER_COMPARE_FIELDS = [
  { key: "employee_code", master: "employee_code", label: "Employee ID" },
  { key: "account_no", master: "bank_account_no", label: "Account Number" },
  { key: "ifsc", master: "ifsc_code", label: "IFSC" },
  { key: "confirmation_date", master: "confirmation_date", label: "Confirmation date" },
  { key: "designation", master: "designation", label: "Designation" },
];

export function monthKey(year, month) {
  const y = Number(year);
  const m = Number(month);
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function monthLabel(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

async function currentUserMeta() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { id: user?.id || null, email: user?.email || "" };
  } catch {
    return { id: null, email: "" };
  }
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round0(v) {
  return Math.round(num(v));
}

function str(v) {
  return v == null ? "" : String(v).trim();
}

/** YYYY-MM from a date-like value (joining / W.E.F.). */
export function yearMonthFromDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** On roll for this pay month: joined in this month or earlier. Missing date stays listed (with a warning). */
export function isEmployeeOnRollForPayMonth(dateOfJoining, year, month) {
  const doj = yearMonthFromDate(dateOfJoining);
  if (!doj) return true;
  return doj <= monthKey(year, month);
}

function digitsOnly(v) {
  return str(v).replace(/\s+/g, "");
}

export function collectRosterIdentityStats(employees) {
  const codeCounts = new Map();
  const acctCounts = new Map();
  for (const emp of employees || []) {
    const code = str(emp.employee_code || emp.employee_id).toUpperCase();
    const acct = digitsOnly(emp.bank_account_no);
    if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
    if (acct) acctCounts.set(acct, (acctCounts.get(acct) || 0) + 1);
  }
  return { codeCounts, acctCounts };
}

export function payrollIdentityErrors(emp, stats = {}) {
  const errors = [];
  const code = str(emp?.employee_code || emp?.employee_id);
  const acct = digitsOnly(emp?.bank_account_no);
  const ifsc = str(emp?.ifsc_code);
  if (!code) errors.push("Employee ID is missing.");
  if (!acct) errors.push("Bank account is missing.");
  if (acct && !ifsc) errors.push("IFSC is missing for this bank account.");
  if (!yearMonthFromDate(emp?.date_of_joining)) errors.push("Date of joining is missing.");
  if (code && stats.codeCounts?.get(code.toUpperCase()) > 1) {
    errors.push("This employee ID is on more than one record.");
  }
  if (acct && stats.acctCounts?.get(acct) > 1) {
    errors.push("This bank account is on more than one employee.");
  }
  return errors;
}

export function lineIdentityErrors(line, employee, stats) {
  const errors = payrollIdentityErrors(employee || {}, stats);
  if (!employee) {
    errors.push("Employee record was not found for this salary row.");
    return [...new Set(errors)];
  }
  if (
    line?.employee_master_id != null &&
    employee.id != null &&
    String(line.employee_master_id) !== String(employee.id)
  ) {
    errors.push("Salary row is linked to a different employee.");
  }
  const masterCode = str(employee.employee_code || employee.employee_id).toUpperCase();
  const lineCode = str(line?.employee_code).toUpperCase();
  if (masterCode && lineCode && masterCode !== lineCode) {
    errors.push("Employee ID on this row does not match the employee record.");
  }
  if (!line?.alreadyProcessed) {
    const masterAcct = digitsOnly(employee.bank_account_no);
    const lineAcct = digitsOnly(line?.account_no);
    if (masterAcct && lineAcct && masterAcct !== lineAcct) {
      errors.push("Bank account does not match this employee.");
    }
    const masterIfsc = str(employee.ifsc_code).toUpperCase();
    const lineIfsc = str(line?.ifsc).toUpperCase();
    if (masterIfsc && lineIfsc && masterIfsc !== lineIfsc) {
      errors.push("IFSC does not match this employee.");
    }
  }
  return [...new Set(errors)];
}

function withIdentityOnLine(line, employee, stats) {
  const identityErrors = lineIdentityErrors(line, employee, stats);
  return {
    ...line,
    identityErrors,
    has_identity_error: identityErrors.length > 0,
  };
}

/** Inclusive YYYY-MM-DD range for a calendar month. */
export function monthDateRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/**
 * Payable working days in a calendar month: Monday–Saturday only (Sundays excluded).
 */
export function workingDaysMonToSat(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || m < 1 || m > 12) return DEFAULT_MONTH_DAYS;
  const last = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= last; d += 1) {
    if (new Date(y, m - 1, d).getDay() !== 0) count += 1;
  }
  return count;
}

/**
 * P.Days by employee_code for the selected pay month.
 * Same Total Present as Attendance → Daily Register (punches + marks +
 * auto weekoff / 3rd-Saturday rules). Use the month being paid
 * (e.g. process July salary → July register totals).
 */
export async function fetchPresentDaysByEmployeeCode(year, month) {
  const y = Number(year);
  const m = Number(month);
  const map = {};
  if (!Number.isFinite(y) || m < 1 || m > 12) return map;
  try {
    const monthValue = `${y}-${String(m).padStart(2, "0")}`;
    const result = await fetchMonthlyRegisterPayrollTotals(supabase, monthValue);
    for (const row of result.rows || []) {
      const total = Number(row.summary?.totalPresent);
      const value = Number.isFinite(total) ? Math.round(total * 10) / 10 : 0;
      const variants = attendanceEmpCodeLookupVariants(row.empCode);
      if (!variants.length) continue;
      for (const variant of variants) {
        map[variant] = value;
      }
    }
  } catch (err) {
    console.warn("Salary processing: present days from register unavailable", err);
    return null;
  }
  return map;
}

/** Resolve P.Days from register map. Missing register row is 0, not full month days. */
export function presentDaysFromRegisterMap(presentMap, empCode, fallbackDays = 0) {
  const fallback = Number(fallbackDays);
  const fallbackVal = Number.isFinite(fallback) ? fallback : 0;
  if (!presentMap || typeof presentMap !== "object") return fallbackVal;
  const codes = Array.isArray(empCode) ? empCode : [empCode];
  for (const raw of codes) {
    for (const variant of attendanceEmpCodeLookupVariants(raw)) {
      if (Object.prototype.hasOwnProperty.call(presentMap, variant)) {
        const v = Number(presentMap[variant]);
        return Number.isFinite(v) ? v : fallbackVal;
      }
    }
  }
  return fallbackVal;
}

function lookupPresentDays(presentMap, emp) {
  if (!presentMap || typeof presentMap !== "object") return null;
  return presentDaysFromRegisterMap(
    presentMap,
    [emp?.employee_code, emp?.employee_id],
    0
  );
}

const LINE_DB_COLUMNS = [
  "run_id",
  "employee_master_id",
  "employee_code",
  "employee_name",
  "designation",
  "date_of_joining",
  "account_no",
  "ifsc",
  "confirmation_date",
  "declared",
  "salary_rate",
  "present_days",
  "total_days",
  "pf_basic",
  "pf_earned_basic",
  "basic_full",
  "basic_earned",
  "hra_full",
  "hra_earned",
  "special_full",
  "special_allowance",
  "gross_wages",
  "emp_pf",
  "emp_esic",
  "pt_amount",
  "loan",
  "sal_adv",
  "unpaid_paid",
  "tds",
  "total_ded",
  "net_salary",
  "bank_amount",
  "source_snapshot_json",
  "overrides_json",
  "computed_json",
  "line_revision_no",
  "has_master_variance",
  "updated_at",
];

function toDbLinePayload(line, { includeRunId = false } = {}) {
  const prevCj =
    line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
  const prevSnap =
    line.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  const cj = {
    ...prevCj,
    custom_earn_full: line.custom_earn_full,
    custom_ded_full: line.custom_ded_full,
    custom_earn: line.custom_earn,
    custom_ded: line.custom_ded,
    department: line.department || prevCj.department || prevSnap.department || "",
    employee_id: line.employee_id || prevCj.employee_id || prevSnap.employee_id || "",
    uan_no: line.uan_no || prevCj.uan_no || prevSnap.uan_no || "",
    esic_no: line.esic_no || prevCj.esic_no || prevSnap.esic_no || "",
    ctc_monthly: line.ctc_monthly ?? prevCj.ctc_monthly ?? prevSnap.ctc_monthly ?? null,
    pay_month_key: line.pay_month_key || prevCj.pay_month_key || "",
  };
  const snap = {
    ...prevSnap,
    department: cj.department,
    employee_id: cj.employee_id,
    uan_no: cj.uan_no,
    esic_no: cj.esic_no,
    ctc_monthly: cj.ctc_monthly,
  };
  const out = {};
  for (const key of LINE_DB_COLUMNS) {
    if (key === "run_id" && !includeRunId) continue;
    if (line[key] !== undefined) out[key] = line[key];
  }
  out.computed_json = cj;
  out.source_snapshot_json = snap;
  return out;
}

function hydrateMonthLine(line) {
  if (!line) return line;
  const cj = line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
  const snap =
    line.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  const lockedOn = salaryLockedOn(line);
  const salaryLocked = salaryLineLocked(line);
  return {
    ...line,
    custom_earn_full: cj.custom_earn_full ?? 0,
    custom_ded_full: cj.custom_ded_full ?? 0,
    custom_earn: cj.custom_earn,
    custom_ded: cj.custom_ded,
    department: line.department || cj.department || snap.department || "",
    employee_id: line.employee_id || cj.employee_id || snap.employee_id || "",
    uan_no: line.uan_no || cj.uan_no || snap.uan_no || "",
    esic_no: line.esic_no || cj.esic_no || snap.esic_no || "",
    ctc_monthly: line.ctc_monthly ?? cj.ctc_monthly ?? snap.ctc_monthly ?? null,
    pay_month_key: line.pay_month_key || cj.pay_month_key || "",
    salaryLocked,
    lockedOn,
    alreadyProcessed: true,
    hasCtc: line.declared || Number(line.salary_rate) > 0,
    declared: Boolean(line.declared || Number(line.salary_rate) > 0),
    processStatus: salaryLocked ? "locked" : "processed",
  };
}

function emptyDedSeed() {
  return { loan: 0, salAdv: 0, unpaidPaid: 0, tds: 0 };
}

/**
 * Build one sheet line from master + CTC + attendance + deduction shells.
 */
export function buildSheetLineFromSources({
  employee,
  structure,
  presentDays,
  monthDays = DEFAULT_MONTH_DAYS,
  deductions,
}) {
  const ded = deductions || emptyDedSeed();
  const computed = computeProcessingRow({
    structure,
    presentDays,
    totalDays: monthDays,
    loan: ded.loan,
    salAdv: ded.salAdv,
    unpaidPaid: ded.unpaidPaid,
    tds: ded.tds,
  });

  const basicFull = computed.basic;
  const hraFull = computed.declared
    ? round0(
        structure?.hra_monthly ??
          resolveHraMonthly({
            hraMode: structure?.hra_mode,
            basicMonthly: basicFull,
            hraMonthly: structure?.hra_monthly,
          })
      )
    : null;
  const specialFull = computed.declared
    ? round0(structure?.special_allowance_monthly ?? 0)
    : null;

  const structureLike = {
    gross_monthly: computed.salary_rate,
    basic_monthly: basicFull,
    hra_monthly: hraFull,
    special_allowance_monthly: specialFull,
    emp_pf_monthly: computed.emp_pf,
    pt_monthly: computed.pt,
    emp_esic_monthly: computed.emp_esic,
    take_home_monthly: computed.net_salary,
    er_pf_monthly: structure?.er_pf_monthly,
    er_esic_monthly: structure?.er_esic_monthly,
    gratuity_monthly: structure?.gratuity_monthly,
    leave_encash_monthly: structure?.leave_encash_monthly,
    mediclaim_monthly: structure?.mediclaim_monthly,
    lic_monthly: structure?.lic_monthly,
    special_perf_bonus_monthly: structure?.special_perf_bonus_monthly,
    bonus_monthly: structure?.bonus_monthly,
    total_b_monthly: structure?.total_b_monthly,
    ctc_monthly: structure?.ctc_monthly,
  };

  const personComps = resolvePersonComponentsForPayroll(employee.id, structureLike);

  const snapshot = {
    employee_code: employee.employee_code || employee.employee_id || "",
    employee_name: employee.full_name || "",
    designation: employee.designation || "",
    department: normalizeDeptName(employee.department) || employee.department || "",
    date_of_joining: employee.date_of_joining || null,
    account_no: employee.bank_account_no || "",
    ifsc: employee.ifsc_code || "",
    uan_no: employee.uan_no || "",
    esic_no: employee.esic_no || "",
    employee_id: employee.employee_id || "",
    confirmation_date: employee.confirmation_date || null,
    salary_rate: computed.salary_rate,
    ctc_monthly: structure?.ctc_monthly ?? null,
    wef_date: structure?.wef_date || null,
    basic_full: basicFull,
    hra_full: hraFull,
    special_full: specialFull,
    pf_basic: computed.pf_basic,
    present_days: presentDays,
    loan: computed.loan,
    sal_adv: computed.sal_adv,
    unpaid_paid: computed.unpaid_paid,
    tds: computed.tds,
    pt_amount: computed.pt,
    custom_earn_full: personComps.custom_earn_full,
    custom_ded_full: personComps.custom_ded_full,
    custom_components: personComps.items,
  };

  const draft = {
    employee_master_id: employee.id,
    employee_code: snapshot.employee_code,
    employee_name: snapshot.employee_name,
    designation: snapshot.designation,
    date_of_joining: snapshot.date_of_joining,
    account_no: snapshot.account_no,
    ifsc: snapshot.ifsc,
    uan_no: snapshot.uan_no || "",
    esic_no: snapshot.esic_no || "",
    confirmation_date: snapshot.confirmation_date,
    employee_id: employee.employee_id || "",
    department: snapshot.department || "",
    declared: Boolean(computed.declared),
    salary_rate: computed.salary_rate,
    ctc_monthly: structure?.ctc_monthly ?? null,
    present_days: presentDays,
    total_days: monthDays,
    pf_basic: computed.pf_basic,
    pf_earned_basic: computed.pf_earned_basic,
    basic_full: basicFull,
    basic_earned: computed.basic_earned,
    hra_full: hraFull,
    hra_earned: computed.hra,
    special_full: specialFull,
    special_allowance: computed.special_allowance,
    gross_wages: computed.gross_wages,
    emp_pf: computed.emp_pf,
    emp_esic: computed.emp_esic,
    pt_amount: computed.pt,
    loan: computed.loan,
    sal_adv: computed.sal_adv,
    unpaid_paid: computed.unpaid_paid,
    tds: computed.tds,
    total_ded: computed.total_ded,
    net_salary: computed.net_salary,
    bank_amount: computed.bank,
    source_snapshot_json: snapshot,
    overrides_json: {},
    computed_json: {
      ...computed,
      custom_earn_full: personComps.custom_earn_full,
      custom_ded_full: personComps.custom_ded_full,
      custom_employer_full: personComps.custom_employer_full,
      custom_components: personComps.items,
    },
    line_revision_no: 1,
    has_master_variance: false,
  };
  // Align earned/deduction columns with sample-sheet formulas (M,O–T,Z,AA,AB)
  // including person-specific component earn/ded.
  return {
    ...recomputeLineFromEdits(draft, monthDays),
    source_snapshot_json: snapshot,
    overrides_json: {},
    computed_json: draft.computed_json,
  };
}

/** Recompute earned / deduction totals from editable inputs (sample sheet formulas). */
export function recomputeLineFromEdits(line, monthDays, opts) {
  const options = opts || {};
  const td = num(monthDays, DEFAULT_MONTH_DAYS) || DEFAULT_MONTH_DAYS;
  const rawPresent = line.present_days;
  const presentUnknown = rawPresent === "" || rawPresent == null;
  const K = presentUnknown ? 0 : num(rawPresent, 0);
  const pfBasic = num(line.pf_basic);
  const basicFull = num(line.basic_full);
  const hraFull = num(line.hra_full);
  const specialFull = num(line.special_full);
  const cj = line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
  const snap = line.source_snapshot_json && typeof line.source_snapshot_json === "object" ? line.source_snapshot_json : {};
  const customEarnFull = num(
    line.custom_earn_full != null ? line.custom_earn_full : cj.custom_earn_full ?? snap.custom_earn_full
  );
  const customDedFull = num(
    line.custom_ded_full != null ? line.custom_ded_full : cj.custom_ded_full ?? snap.custom_ded_full
  );
  const pfEarned = round0((pfBasic / td) * K);
  const basicEarned = round0((basicFull / td) * K);
  const hraEarned = round0((hraFull / td) * K);
  const specialEarned = round0((specialFull / td) * K);
  const customEarn = round0((customEarnFull / td) * K);
  const customDed = round0((customDedFull / td) * K);
  const gross = basicEarned + hraEarned + specialEarned + customEarn;
  const empPf = round0(pfEarned * 0.12);
  const salaryRate = num(line.salary_rate);
  const esicEligible = salaryRate > 0 && salaryRate <= 21000;
  const empEsic = esicEligible ? round0((gross * 0.75) / 100) : 0;
  const pt =
    options.keepPt && line.pt_amount != null && line.pt_amount !== ""
      ? round0(line.pt_amount)
      : defaultPtForGross(gross);
  const loan = round0(line.loan);
  const salAdv = round0(line.sal_adv);
  const unpaid = round0(line.unpaid_paid);
  const tds = round0(line.tds);
  const totalDed = empPf + empEsic + pt + loan + salAdv + unpaid + tds + customDed;
  const net = gross - totalDed;
  const bank = round0(net);
  return {
    ...line,
    present_days: presentUnknown ? rawPresent : K,
    total_days: td,
    pf_earned_basic: pfEarned,
    basic_earned: basicEarned,
    hra_earned: hraEarned,
    special_allowance: specialEarned,
    custom_earn_full: customEarnFull,
    custom_ded_full: customDedFull,
    custom_earn: customEarn,
    custom_ded: customDed,
    gross_wages: gross,
    emp_pf: empPf,
    emp_esic: empEsic,
    pt_amount: pt,
    loan,
    sal_adv: salAdv,
    unpaid_paid: unpaid,
    tds,
    total_ded: totalDed,
    net_salary: net,
    bank_amount: bank,
    computed_json: {
      ...cj,
      custom_earn_full: customEarnFull,
      custom_ded_full: customDedFull,
      custom_earn: customEarn,
      custom_ded: customDed,
      custom_components: cj.custom_components || snap.custom_components || [],
    },
  };
}

export async function listMonthRuns() {
  const { data, error } = await supabase
    .from(MONTH_RUNS_TABLE)
    .select("*")
    .order("pay_year", { ascending: false })
    .order("pay_month", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Flat list of processed salary sheets (bulk / dept / select batches) for the grid. */
export async function listProcessedSalarySheets() {
  const runs = await listMonthRuns();
  return flattenProcessedSheetRows(runs);
}

export async function getMonthRunByKey(monthKeyStr) {
  const { data, error } = await supabase
    .from(MONTH_RUNS_TABLE)
    .select("*")
    .eq("month_key", monthKeyStr)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getMonthRunWithLines(runId) {
  const runRes = await supabase.from(MONTH_RUNS_TABLE).select("*").eq("id", runId).maybeSingle();
  if (runRes.error) throw runRes.error;
  const raw = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from(MONTH_LINES_TABLE)
      .select("*")
      .eq("run_id", runId)
      .order("employee_code", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    raw.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  const lines = raw.map((line) => hydrateMonthLine(line));
  return { run: runRes.data || null, lines };
}

function sumLines(lines) {
  let gross = 0;
  let ded = 0;
  let net = 0;
  for (const l of lines) {
    gross += num(l.gross_wages);
    ded += num(l.total_ded);
    net += num(l.net_salary);
  }
  return {
    employee_count: lines.length,
    total_gross: round0(gross),
    total_deductions: round0(ded),
    total_net: round0(net),
  };
}

export const PROCESS_MODES = {
  /** All eligible employees (UI label: All). */
  BULK: "bulk",
  /** @deprecated Removed from UI — kept for older calls. */
  SELECT: "select",
  DEPT: "dept",
  /** Salary hold management (not a process scope). */
  HOLD: "hold",
  /** Processed salary report by month / process day. */
  REPORT: "report",
};

const HOLD_STORAGE_KEY = "admin_salary_month_holds_v1";

function readHoldStore() {
  try {
    const raw = localStorage.getItem(HOLD_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeHoldStore(store) {
  localStorage.setItem(HOLD_STORAGE_KEY, JSON.stringify(store || {}));
}

/** Employee master ids on salary hold for a month key (`YYYY-MM`). */
export function getMonthHoldIds(monthKeyValue) {
  const key = String(monthKeyValue || "").trim();
  if (!key) return [];
  const raw = readHoldStore()[key];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((id) => String(id)).filter(Boolean))];
}

export function setMonthHoldIds(monthKeyValue, ids) {
  const key = String(monthKeyValue || "").trim();
  if (!key) return [];
  const next = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  const store = readHoldStore();
  if (!next.length) delete store[key];
  else store[key] = next;
  writeHoldStore(store);
  return next;
}

export function toggleMonthHoldId(monthKeyValue, employeeId) {
  const id = String(employeeId ?? "");
  if (!id) return getMonthHoldIds(monthKeyValue);
  const cur = new Set(getMonthHoldIds(monthKeyValue));
  if (cur.has(id)) cur.delete(id);
  else cur.add(id);
  return setMonthHoldIds(monthKeyValue, [...cur]);
}

/** Editable fields persisted from employee salary detail page. */
const SCOPE_DRAFT_STORAGE_KEY = "admin_salary_scope_line_drafts_v1";
const SCOPE_DRAFT_FIELDS = [
  "account_no",
  "ifsc",
  "confirmation_date",
  "present_days",
  "pf_basic",
  "custom_earn_full",
  "pt_amount",
  "loan",
  "sal_adv",
  "unpaid_paid",
  "tds",
  "custom_ded_full",
];

function readScopeDraftStore() {
  try {
    const raw = localStorage.getItem(SCOPE_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeScopeDraftStore(store) {
  localStorage.setItem(SCOPE_DRAFT_STORAGE_KEY, JSON.stringify(store || {}));
}

export function getScopeLineDraft(monthKeyValue, employeeMasterId) {
  const mk = String(monthKeyValue || "").trim();
  const eid = String(employeeMasterId ?? "");
  if (!mk || !eid) return null;
  const row = readScopeDraftStore()?.[mk]?.[eid];
  return row && typeof row === "object" ? row : null;
}

/** Persist detail-page edits for a month + employee (used by preview + process). */
export function saveScopeLineDraft(monthKeyValue, employeeMasterId, line) {
  const mk = String(monthKeyValue || "").trim();
  const eid = String(employeeMasterId ?? "");
  if (!mk || !eid || !line) return null;
  const patch = {};
  for (const key of SCOPE_DRAFT_FIELDS) {
    if (line[key] !== undefined) patch[key] = line[key];
  }
  if (line.computed_json?.custom_earn_full != null && patch.custom_earn_full == null) {
    patch.custom_earn_full = line.computed_json.custom_earn_full;
  }
  if (line.computed_json?.custom_ded_full != null && patch.custom_ded_full == null) {
    patch.custom_ded_full = line.computed_json.custom_ded_full;
  }
  patch.saved_at = new Date().toISOString();
  const store = readScopeDraftStore();
  if (!store[mk] || typeof store[mk] !== "object") store[mk] = {};
  store[mk][eid] = patch;
  writeScopeDraftStore(store);
  return patch;
}

export function applyScopeLineDraft(line, draft, monthDays) {
  if (!line || !draft || typeof draft !== "object") return line;
  const merged = { ...line };
  for (const key of SCOPE_DRAFT_FIELDS) {
    if (draft[key] === undefined) continue;
    // Do not wipe Employee Master bank details with an empty draft value
    if (
      (key === "account_no" || key === "ifsc") &&
      !String(draft[key] ?? "").trim() &&
      String(line[key] ?? "").trim()
    ) {
      continue;
    }
    merged[key] = draft[key];
  }
  if (draft.custom_earn_full != null || draft.custom_ded_full != null) {
    merged.computed_json = {
      ...(merged.computed_json || {}),
      custom_earn_full:
        draft.custom_earn_full != null
          ? draft.custom_earn_full
          : merged.computed_json?.custom_earn_full,
      custom_ded_full:
        draft.custom_ded_full != null
          ? draft.custom_ded_full
          : merged.computed_json?.custom_ded_full,
    };
  }
  return recomputeLineFromEdits(merged, monthDays);
}

/**
 * After Employee Master salary-account import: push A/c + IFSC into any month drafts
 * so Salary Processing preview updates immediately.
 */
export function syncScopeDraftBankFromMaster(employeeMasterId, { account_no, ifsc } = {}) {
  const eid = String(employeeMasterId ?? "");
  if (!eid) return;
  const acct = account_no != null ? String(account_no).trim() : "";
  const ifscCode = ifsc != null ? String(ifsc).trim().toUpperCase() : "";
  if (!acct && !ifscCode) return;
  const store = readScopeDraftStore();
  let changed = false;
  for (const mk of Object.keys(store || {})) {
    const row = store[mk]?.[eid];
    if (!row || typeof row !== "object") continue;
    if (acct) {
      row.account_no = acct;
      changed = true;
    }
    if (ifscCode) {
      row.ifsc = ifscCode;
      changed = true;
    }
  }
  if (changed) writeScopeDraftStore(store);
}

/** Prefer live Employee Master bank fields on a process/preview line. Never copy another employee's account. */
export function overlayMasterBankOnLine(line, employee) {
  if (!line) return line;
  if (!employee) return line;
  if (line.alreadyProcessed) return line;
  if (
    line.employee_master_id != null &&
    employee.id != null &&
    String(line.employee_master_id) !== String(employee.id)
  ) {
    return withIdentityOnLine(line, employee);
  }
  const code = str(employee.employee_code) || str(employee.employee_id);
  return {
    ...line,
    employee_code: code || line.employee_code || "",
    employee_id: str(employee.employee_id) || line.employee_id || "",
    employee_name: str(employee.full_name) || line.employee_name || "",
    date_of_joining: employee.date_of_joining || line.date_of_joining || null,
    account_no: str(employee.bank_account_no),
    ifsc: str(employee.ifsc_code),
    uan_no: str(employee.uan_no),
    esic_no: str(employee.esic_no),
  };
}

/** Fresh Account / IFSC / UAN / ESIC from Employee Master (chunked). */
async function fetchMasterPayrollFieldsByIds(ids = []) {
  const unique = [...new Set((ids || []).map(String).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("id, employee_id, employee_code, full_name, date_of_joining, bank_account_no, ifsc_code, uan_no, esic_no")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      map.set(String(row.id), row);
    }
  }
  return map;
}

function normalizeDeptName(v) {
  return canonicalDepartmentLabel(v);
}

/** Load every active employee (Supabase pages at 1000). */
async function fetchAllActiveEmployeesForSalary() {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select(
        "id, employee_id, employee_code, full_name, designation, department, location, date_of_joining, confirmation_date, bank_account_no, ifsc_code, uan_no, esic_no, status"
      )
      .eq("status", "Active")
      .order("employee_code", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function buildProcessedEmployeeIndex(lines) {
  const ids = new Set();
  const codes = new Set();
  for (const line of lines || []) {
    if (line?.employee_master_id != null && line.employee_master_id !== "") {
      ids.add(String(line.employee_master_id));
    }
    const code = str(line?.employee_code).toUpperCase();
    if (code) codes.add(code);
  }
  return { ids, codes };
}

export function employeeAlreadyProcessed(emp, processedIndex) {
  if (!processedIndex?.ids) return false;
  return processedIndex.ids.has(String(emp.id));
}

export function findSavedMonthLine(savedLines, emp) {
  const id = emp?.id != null ? String(emp.id) : "";
  if (!id) return null;
  return (savedLines || []).find((l) => String(l.employee_master_id) === id) || null;
}

export function salaryLineLocked(line) {
  const cj = line?.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
  const snap =
    line?.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  return Boolean(cj.slip_generated_on || snap.slip_generated_on || line?.salaryLocked);
}

export function salaryLockedOn(line) {
  const cj = line?.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
  const snap =
    line?.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  const raw = cj.slip_generated_on || snap.slip_generated_on || line?.lockedOn || "";
  return String(raw).slice(0, 10);
}

export function lockedEmployeeIndex(lines) {
  const byId = new Map();
  for (const line of lines || []) {
    if (!salaryLineLocked(line)) continue;
    const id = line.employee_master_id != null ? String(line.employee_master_id) : "";
    if (id) byId.set(id, salaryLockedOn(line));
  }
  return byId;
}

function processStatusFromFlags({ onHold, salaryLocked, alreadyProcessed, hasCtc }) {
  if (onHold) return "held";
  if (salaryLocked) return "locked";
  if (alreadyProcessed) return "processed";
  if (hasCtc) return "pending";
  return "ctc_required";
}

/** Instant roster row — name / bank / CTC status without waiting on formula preview. */
export function emptyPreviewLineFromEmployee(emp, monthDays = DEFAULT_MONTH_DAYS) {
  const hasCtc = Boolean(emp?.hasCtc ?? emp?.declared);
  const onHold = Boolean(emp?.onHold);
  const alreadyProcessed = Boolean(emp?.alreadyProcessed);
  const salaryLocked = Boolean(emp?.salaryLocked);
  const lockedOn = emp?.lockedOn || "";
  const processStatus =
    emp?.processStatus ||
    processStatusFromFlags({ onHold, salaryLocked, alreadyProcessed, hasCtc });
  return {
    id: `preview_${emp.id}`,
    employee_master_id: emp.id,
    employee_code: emp.employee_code || emp.employee_id || "",
    employee_id: emp.employee_id || "",
    employee_name: emp.full_name || emp.employee_name || "",
    account_no: emp.bank_account_no || "",
    ifsc: emp.ifsc_code || emp.ifsc || "",
    designation: emp.designation || "",
    department: emp.department || "—",
    date_of_joining: emp.date_of_joining || null,
    present_days: null,
    total_days: monthDays,
    salary_rate: 0,
    pf_basic: 0,
    basic_full: 0,
    hra_full: 0,
    special_full: 0,
    gross_wages: 0,
    emp_pf: 0,
    emp_esic: 0,
    pt_amount: 0,
    loan: 0,
    sal_adv: 0,
    unpaid_paid: 0,
    tds: 0,
    total_ded: 0,
    net_salary: 0,
    bank_amount: 0,
    hasCtc,
    declared: hasCtc,
    alreadyProcessed,
    salaryLocked,
    lockedOn,
    onHold,
    processStatus,
  };
}

export function decorateScopeLine(line, emp, extras = {}) {
  const hasCtc = extras.hasCtc != null ? extras.hasCtc : Boolean(emp.hasCtc ?? emp.declared);
  const onHold = Boolean(emp.onHold);
  const alreadyProcessed =
    extras.alreadyProcessed != null ? extras.alreadyProcessed : Boolean(emp.alreadyProcessed);
  const salaryLocked =
    extras.salaryLocked != null
      ? Boolean(extras.salaryLocked)
      : Boolean(emp.salaryLocked) || salaryLineLocked(line);
  const lockedOn = extras.lockedOn || emp.lockedOn || salaryLockedOn(line) || "";
  const snap =
    line?.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  const decorated = {
    ...line,
    employee_master_id: emp.id,
    employee_code: emp.employee_code || emp.employee_id || line.employee_code || "",
    employee_id: emp.employee_id || line.employee_id || "",
    department: emp.department || line.department || "—",
    date_of_joining: emp.date_of_joining || line.date_of_joining || null,
    alreadyProcessed,
    salaryLocked,
    lockedOn,
    hasCtc,
    onHold,
    processStatus: processStatusFromFlags({
      onHold,
      salaryLocked,
      alreadyProcessed,
      hasCtc,
    }),
    declared: hasCtc,
    ctc_monthly:
      extras.ctc_monthly ??
      line.ctc_monthly ??
      snap.ctc_monthly ??
      emp.ctc_monthly ??
      null,
    pay_month_key: extras.pay_month_key || line.pay_month_key || "",
  };
  return withIdentityOnLine(decorated, emp, extras.identityStats);
}

export function departmentStatsForEmployees(employees) {
  const stats = {};
  for (const emp of employees || []) {
    const dept = normalizeDeptName(emp.department) || "—";
    if (!stats[dept]) {
      stats[dept] = { department: dept, total: 0, eligible: 0, pending: 0, processed: 0 };
    }
    stats[dept].total += 1;
    if (emp.eligible) stats[dept].eligible += 1;
    if (emp.alreadyProcessed) stats[dept].processed += 1;
    if (emp.eligible && !emp.alreadyProcessed) stats[dept].pending += 1;
  }
  return stats;
}

export function filterEmployeesByMode(employees, { processMode, employeeIds, departments, holdIds }) {
  const mode = processMode || PROCESS_MODES.BULK;
  if (mode === PROCESS_MODES.BULK) return employees || [];

  if (mode === PROCESS_MODES.SELECT) {
    const idSet = new Set((employeeIds || []).map(String));
    return (employees || []).filter((emp) => idSet.has(String(emp.id)));
  }

  if (mode === PROCESS_MODES.DEPT) {
    return (employees || []).filter((emp) =>
      departmentInSelection(emp.department, departments)
    );
  }

  if (mode === PROCESS_MODES.HOLD) {
    const holdSet = new Set((holdIds || []).map(String));
    return (employees || []).filter((emp) => holdSet.has(String(emp.id)));
  }

  return employees || [];
}

/** Drop employees marked on salary hold (All / department processing). */
export function excludeHeldEmployees(employees, holdIds) {
  const holdSet = new Set((holdIds || []).map(String));
  if (!holdSet.size) return employees || [];
  return (employees || []).filter((emp) => !holdSet.has(String(emp.id)));
}

async function buildLinesForEmployees(employees, { salaryMap, presentMap, monthDays, monthKey: payMonthKey = "" }) {
  const days = Number(monthDays) > 0 ? Number(monthDays) : DEFAULT_MONTH_DAYS;
  const ids = (employees || []).map((e) => e.id);
  const dedMap = await seedSalaryDeductionsMapFromDb(ids, payMonthKey);
  const lines = [];
  for (const emp of employees || []) {
    const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
    const present = lookupPresentDays(presentMap, emp) ?? 0;
    lines.push(
      buildSheetLineFromSources({
        employee: emp,
        structure,
        presentDays: present,
        monthDays: days,
        deductions: dedMap.get(String(emp.id)) || emptyDedSeed(),
      })
    );
  }
  return lines;
}

/** Active employees on roll for this pay month, with duplicate flags for the month. */
export async function fetchSalaryProcessCandidates({
  year,
  month,
} = {}) {
  const key = monthKey(year, month);
  const existing = await getMonthRunByKey(key);
  let processedIndex = { ids: new Set(), codes: new Set() };
  let lockedById = new Map();
  if (existing?.id) {
    const { lines } = await getMonthRunWithLines(existing.id);
    processedIndex = buildProcessedEmployeeIndex(lines);
    lockedById = lockedEmployeeIndex(lines);
  }

  const [salaryMap, allEmployees] = await Promise.all([
    fetchSalaryStructureMapForMonth(year, month),
    fetchAllActiveEmployeesForSalary(),
  ]);

  const employees = (allEmployees || []).filter((emp) =>
    isEmployeeOnRollForPayMonth(emp.date_of_joining, year, month)
  );
  const identityStats = collectRosterIdentityStats(employees);

  const holdIdSet = new Set(getMonthHoldIds(key));
  const deptSet = new Set();
  const siteSet = new Set();
  const rows = employees.map((emp) => {
    const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
    const hasCtc = Boolean(structure?.declared);
    const eligible = hasCtc;
    const dept = normalizeDeptName(emp.department);
    if (dept) deptSet.add(dept);
    const site = String(emp.location || "").trim();
    if (site) siteSet.add(site);
    const alreadyProcessed = employeeAlreadyProcessed(emp, processedIndex);
    const salaryLocked = lockedById.has(String(emp.id));
    const lockedOn = lockedById.get(String(emp.id)) || "";
    const onHold = holdIdSet.has(String(emp.id));
    const identityErrors = payrollIdentityErrors(emp, identityStats);
    return {
      id: emp.id,
      employee_code: emp.employee_code || emp.employee_id || "",
      full_name: emp.full_name || "",
      designation: emp.designation || "",
      department: dept || "—",
      location: site || "—",
      date_of_joining: emp.date_of_joining || null,
      confirmation_date: emp.confirmation_date || null,
      bank_account_no: emp.bank_account_no || "",
      ifsc_code: emp.ifsc_code || "",
      uan_no: emp.uan_no || "",
      esic_no: emp.esic_no || "",
      employee_id: emp.employee_id || "",
      hasCtc,
      eligible,
      alreadyProcessed,
      salaryLocked,
      lockedOn,
      onHold,
      identityErrors,
      has_identity_error: identityErrors.length > 0,
      ctc_monthly: hasCtc ? Number(structure?.ctc_monthly) || 0 : null,
      take_home_monthly: hasCtc ? Number(structure?.take_home_monthly) || 0 : null,
      gross_monthly: hasCtc ? Number(structure?.gross_monthly) || 0 : null,
      processStatus: processStatusFromFlags({
        onHold,
        salaryLocked,
        alreadyProcessed,
        hasCtc,
      }),
      _structure: structure,
    };
  });

  const departmentStats = departmentStatsForEmployees(rows);

  return {
    monthKey: key,
    existingRun: existing,
    departments: [...deptSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    sites: [...siteSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    departmentStats,
    employees: rows,
    holdIds: [...holdIdSet],
    salaryMap,
  };
}

/**
 * Build editable salary-sheet preview lines for employees in the process scope.
 * Uses saved month-run rows when already processed; otherwise CTC + attendance.
 * Employees without CTC get a name/bank placeholder so All Employees lists everyone.
 */
export async function buildSalaryScopePreviewLines({
  employees = [],
  year,
  month,
  monthDays = DEFAULT_MONTH_DAYS,
  salaryMap = null,
  savedLines = [],
} = {}) {
  const days = Number(monthDays) > 0 ? Number(monthDays) : DEFAULT_MONTH_DAYS;
  const key = monthKey(year, month);
  const identityStats = collectRosterIdentityStats(employees);
  const monthSaved = (savedLines || []).filter((l) => {
    const lineKey = l.pay_month_key;
    return !lineKey || lineKey === key;
  });

  const toCompute = [];
  const planned = (employees || []).map((emp) => {
    const saved = findSavedMonthLine(monthSaved, emp);
    if (saved) {
      return {
        kind: "saved",
        emp,
        line: decorateScopeLine(
          {
            ...saved,
            id: saved.id || `preview_${emp.id}`,
            pay_month_key: key,
          },
          emp,
          {
            alreadyProcessed: true,
            hasCtc: Boolean(emp.hasCtc) || Number(saved.salary_rate) > 0,
            pay_month_key: key,
            identityStats,
          }
        ),
      };
    }
    const hasCtc = Boolean(emp.hasCtc ?? emp._structure?.declared);
    if (!hasCtc) {
      return {
        kind: "empty",
        emp,
        line: decorateScopeLine(
          { ...emptyPreviewLineFromEmployee(emp, days), pay_month_key: key },
          emp,
          { pay_month_key: key, identityStats }
        ),
      };
    }
    toCompute.push(emp);
    return { kind: "compute", emp, line: null };
  });

  const needPresent = planned.some((item) => item.kind === "empty" || item.kind === "compute");
  const presentMap = needPresent ? await fetchPresentDaysByEmployeeCode(year, month) : {};
  const computedById = new Map();

  if (toCompute.length) {
    let map = salaryMap instanceof Map && salaryMap.size > 0 ? salaryMap : null;
    if (!map) {
      map = await fetchSalaryStructureMapForMonth(year, month);
    }
    const bankMap = await fetchMasterPayrollFieldsByIds(toCompute.map((e) => e.id));
    const dedMap = await seedSalaryDeductionsMapFromDb(
      toCompute.map((e) => e.id),
      key
    );
    for (const emp of toCompute) {
      const structure =
        map.get(String(emp.id)) ||
        map.get(emp.id) ||
        emp._structure ||
        null;
      const fresh = bankMap.get(String(emp.id)) || {};
      const bankEmp = {
        ...emp,
        id: emp.id,
        employee_id: fresh.employee_id ?? emp.employee_id,
        employee_code: fresh.employee_code ?? emp.employee_code,
        full_name: fresh.full_name ?? emp.full_name,
        date_of_joining: fresh.date_of_joining ?? emp.date_of_joining,
        bank_account_no: fresh.bank_account_no ?? emp.bank_account_no,
        ifsc_code: fresh.ifsc_code ?? emp.ifsc_code,
        uan_no: fresh.uan_no ?? emp.uan_no,
        esic_no: fresh.esic_no ?? emp.esic_no,
      };
      const present = lookupPresentDays(presentMap, emp) ?? 0;
      let line = buildSheetLineFromSources({
        employee: {
          id: emp.id,
          employee_id: bankEmp.employee_id,
          employee_code: bankEmp.employee_code,
          full_name: bankEmp.full_name,
          designation: emp.designation,
          date_of_joining: bankEmp.date_of_joining,
          confirmation_date: emp.confirmation_date,
          bank_account_no: bankEmp.bank_account_no,
          ifsc_code: bankEmp.ifsc_code,
          uan_no: bankEmp.uan_no,
          esic_no: bankEmp.esic_no,
        },
        structure,
        presentDays: present,
        monthDays: days,
        deductions: dedMap.get(String(emp.id)) || emptyDedSeed(),
      });
      const draft = getScopeLineDraft(key, emp.id);
      if (draft) {
        line = applyScopeLineDraft(line, draft, days);
      }
      line = overlayMasterBankOnLine(line, bankEmp);
      computedById.set(
        String(emp.id),
        decorateScopeLine(
          { ...line, id: `preview_${emp.id}`, pay_month_key: key },
          emp,
          { hasCtc: Boolean(structure?.declared || emp.hasCtc), pay_month_key: key, identityStats }
        )
      );
    }
  }

  planned.forEach((item) => {
    if (item.kind === "compute") {
      item.line =
        computedById.get(String(item.emp.id)) ||
        decorateScopeLine(
          {
            ...emptyPreviewLineFromEmployee(item.emp, days),
            present_days: lookupPresentDays(presentMap, item.emp) ?? item.line?.present_days ?? null,
            pay_month_key: key,
          },
          item.emp,
          { pay_month_key: key, identityStats }
        );
    } else if (item.kind === "empty") {
      item.line = {
        ...item.line,
        present_days: lookupPresentDays(presentMap, item.emp) ?? item.line.present_days,
        pay_month_key: key,
      };
    }
  });

  return planned.map((item) => {
    if (item.kind !== "saved") return item.line;
    const draft = getScopeLineDraft(key, item.emp.id);
    if (!draft) return item.line;
    return decorateScopeLine(applyScopeLineDraft(item.line, draft, days), item.emp, {
      alreadyProcessed: true,
      hasCtc: item.line.hasCtc,
      pay_month_key: key,
      identityStats,
    });
  });
}

/**
 * Process a month from Employee Master + CTC + attendance.
 * Modes: all/bulk, dept. Hold is management-only (not processed here).
 * Skips employees already on the month sheet unless forceFullReprocess (all only).
 * Employees on salary hold are excluded from all / department runs.
 */
export async function processSalaryMonth({
  year,
  month,
  monthDays = DEFAULT_MONTH_DAYS,
  includeWithoutCtc = false,
  processMode = PROCESS_MODES.BULK,
  employeeIds = [],
  departments = [],
  forceFullReprocess = false,
  /** Calendar day (YYYY-MM-DD) Process salary was clicked — stamps payslips */
  processedOn = "",
} = {}) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || m < 1 || m > 12) {
    throw new Error("Select a valid month and year.");
  }
  const mode = processMode || PROCESS_MODES.BULK;
  if (mode === PROCESS_MODES.HOLD) {
    throw new Error("Hold is for marking salary holds only. Use All or By department to process.");
  }
  if (mode === PROCESS_MODES.SELECT && !(employeeIds || []).length) {
    throw new Error("Select at least one employee to process.");
  }
  if (mode === PROCESS_MODES.DEPT && !(departments || []).filter(Boolean).length) {
    throw new Error("Select at least one department to process.");
  }

  const key = monthKey(y, m);
  const days = Number(monthDays) > 0 ? Number(monthDays) : workingDaysMonToSat(y, m);
  const user = await currentUserMeta();
  const holdIds = getMonthHoldIds(key);
  const processDay =
    processedOn && /^\d{4}-\d{2}-\d{2}$/.test(String(processedOn))
      ? String(processedOn).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const processAt = new Date().toISOString();

  const [salaryMap, presentMap, existing, allEmployees] = await Promise.all([
    fetchSalaryStructureMapForMonth(y, m),
    fetchPresentDaysByEmployeeCode(y, m).then((map) => map || {}),
    getMonthRunByKey(key),
    fetchAllActiveEmployeesForSalary(),
  ]);
  const employees = (allEmployees || []).filter((emp) =>
    isEmployeeOnRollForPayMonth(emp.date_of_joining, y, m)
  );

  let existingLines = [];
  const processedIndex = { ids: new Set(), codes: new Set() };
  if (existing?.id) {
    const bundle = await getMonthRunWithLines(existing.id);
    existingLines = bundle.lines || [];
    const built = buildProcessedEmployeeIndex(existingLines);
    built.ids.forEach((v) => processedIndex.ids.add(v));
    built.codes.forEach((v) => processedIndex.codes.add(v));
  }

  let scoped = filterEmployeesByMode(employees, { processMode: mode, employeeIds, departments, holdIds });
  if (mode === PROCESS_MODES.BULK || mode === PROCESS_MODES.DEPT || mode === PROCESS_MODES.SELECT) {
    scoped = excludeHeldEmployees(scoped, holdIds);
  }
  const eligible = scoped.filter((emp) => {
    const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
    const declared = Boolean(structure?.declared);
    return includeWithoutCtc ? !declared : declared;
  });

  if (!eligible.length) {
    const hint =
      mode === PROCESS_MODES.SELECT
        ? includeWithoutCtc
          ? "Selected employees already have CTC (or none match Without CTC only)."
          : "Selected employees have no declared CTC."
        : mode === PROCESS_MODES.DEPT
          ? includeWithoutCtc
            ? "No employees without CTC in the selected department(s)."
            : "No eligible employees in the selected department(s)."
          : includeWithoutCtc
            ? "No employees without CTC for this month (or all are on hold)."
            : "No employees on roll for this month with saved CTC (or all are on hold).";
    throw new Error(hint);
  }

  const fullReprocess = mode === PROCESS_MODES.BULK && forceFullReprocess && Boolean(existing?.id);
  let toProcess = eligible;
  let skippedDuplicates = [];

  if (fullReprocess) {
    toProcess = eligible;
  } else {
    skippedDuplicates = eligible.filter((emp) => employeeAlreadyProcessed(emp, processedIndex));
    toProcess = eligible.filter((emp) => !employeeAlreadyProcessed(emp, processedIndex));
  }

  if (!toProcess.length) {
    const dupCount = skippedDuplicates.length;
    throw new Error(
      dupCount
        ? `All ${dupCount} selected employee${dupCount === 1 ? "" : "s"} already processed for ${monthLabel(y, m)}. Open the existing sheet or use full reprocess (All).`
        : "No employees to process."
    );
  }

  let newLines = await buildLinesForEmployees(toProcess, {
    salaryMap,
    presentMap,
    monthDays: days,
    monthKey: key,
  });
  const bankMap = await fetchMasterPayrollFieldsByIds(toProcess.map((e) => e.id));
  newLines = newLines.map((line) => {
    const draft = getScopeLineDraft(key, line.employee_master_id);
    let next = draft ? applyScopeLineDraft(line, draft, days) : line;
    const emp = toProcess.find((e) => String(e.id) === String(line.employee_master_id));
    const fresh = bankMap.get(String(line.employee_master_id)) || {};
    return overlayMasterBankOnLine(next, {
      ...(emp || {}),
      id: emp?.id ?? line.employee_master_id,
      employee_id: fresh.employee_id ?? emp?.employee_id,
      employee_code: fresh.employee_code ?? emp?.employee_code,
      full_name: fresh.full_name ?? emp?.full_name,
      date_of_joining: fresh.date_of_joining ?? emp?.date_of_joining,
      bank_account_no: fresh.bank_account_no ?? emp?.bank_account_no,
      ifsc_code: fresh.ifsc_code ?? emp?.ifsc_code,
      uan_no: fresh.uan_no ?? emp?.uan_no,
      esic_no: fresh.esic_no ?? emp?.esic_no,
    });
  }).map((line) => ({
    ...line,
    pay_month_key: key,
    computed_json: {
      ...(line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {}),
      pay_month_key: key,
      processed_on: processDay,
      processed_at: processAt,
    },
    source_snapshot_json: {
      ...(line.source_snapshot_json && typeof line.source_snapshot_json === "object"
        ? line.source_snapshot_json
        : {}),
      pay_month_key: key,
      processed_on: processDay,
    },
  }));

  let runId;
  let revisionNo = 1;
  let allLines = newLines;

  const buildSummaryForProcess = (prevSummary, rev) => {
    if (fullReprocess) {
      const base = appendProcessBatch({}, {
        year: y,
        month: m,
        processMode: mode,
        revisionNo: rev,
        employeeCount: newLines.length,
        departments: mode === PROCESS_MODES.DEPT ? departments : undefined,
        sequence: 1,
        processedOn: processDay,
        employeeIds: toProcess.map((e) => e.id),
      });
      return applyRevisionToRunSheet(base, { year: y, month: m, revisionNo: rev });
    }
    const sequence = prevSummary ? nextSheetSequenceForRun({ summary_json: prevSummary }) : 1;
    return appendProcessBatch(prevSummary || {}, {
      year: y,
      month: m,
      processMode: mode,
      revisionNo: rev,
      employeeCount: newLines.length,
      departments: mode === PROCESS_MODES.DEPT ? departments : undefined,
      sequence,
      processedOn: processDay,
      employeeIds: toProcess.map((e) => e.id),
    });
  };

  if (existing?.id && !fullReprocess) {
    runId = existing.id;
    revisionNo = num(existing.revision_no, 1);
    allLines = [...existingLines, ...newLines];
    const totals = sumLines(allLines);
    const summary_json = buildSummaryForProcess(existing.summary_json, revisionNo);
    const { error: updErr } = await supabase
      .from(MONTH_RUNS_TABLE)
      .update({
        month_days: days,
        status: "processed",
        include_without_ctc: includeWithoutCtc,
        ...totals,
        updated_by: user.id,
        summary_json: {
          ...summary_json,
          last_partial_process_at: processAt,
          processed_on: processDay,
          processed_at: processAt,
          added_count: newLines.length,
          skipped_duplicate_count: skippedDuplicates.length,
        },
      })
      .eq("id", runId);
    if (updErr) throw updErr;
  } else if (existing?.id && fullReprocess) {
    revisionNo = num(existing.revision_no, 1) + 1;
    allLines = newLines;
    const totals = sumLines(allLines);
    const summary_json = buildSummaryForProcess(null, revisionNo);
    const { data: run, error: updErr } = await supabase
      .from(MONTH_RUNS_TABLE)
      .update({
        month_days: days,
        status: "processed",
        revision_no: revisionNo,
        include_without_ctc: includeWithoutCtc,
        ...totals,
        updated_by: user.id,
        summary_json: {
          ...summary_json,
          reprocessed_at: processAt,
          processed_on: processDay,
          processed_at: processAt,
        },
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updErr) throw updErr;
    runId = run.id;

    const { error: delErr } = await supabase.from(MONTH_LINES_TABLE).delete().eq("run_id", runId);
    if (delErr) throw delErr;
  } else {
    revisionNo = 1;
    allLines = newLines;
    const totals = sumLines(allLines);
    const summary_json = buildSummaryForProcess(null, revisionNo);
    const { data: run, error: insErr } = await supabase
      .from(MONTH_RUNS_TABLE)
      .insert({
        pay_year: y,
        pay_month: m,
        month_key: key,
        month_days: days,
        status: "processed",
        revision_no: 1,
        include_without_ctc: includeWithoutCtc,
        ...totals,
        created_by: user.id,
        updated_by: user.id,
        summary_json: {
          ...summary_json,
          added_count: newLines.length,
          processed_on: processDay,
          processed_at: processAt,
        },
      })
      .select("*")
      .single();
    if (insErr) throw insErr;
    runId = run.id;
  }

  const payload = newLines.map((l) => ({
    ...toDbLinePayload(l, { includeRunId: true }),
    run_id: runId,
    line_revision_no: revisionNo,
  }));

  const chunk = 100;
  for (let i = 0; i < payload.length; i += chunk) {
    const { error } = await supabase.from(MONTH_LINES_TABLE).insert(payload.slice(i, i + chunk));
    if (error) {
      if (error.code === "23505") {
        throw new Error("Duplicate employee detected on this month sheet. Refresh and try again.");
      }
      throw error;
    }
  }

  const shouldLogRevision = !existing?.id || fullReprocess;
  if (shouldLogRevision) {
    const { error: revErr } = await supabase.from(RUN_REVISIONS_TABLE).insert({
      run_id: runId,
      revision_no: revisionNo,
      changed_by: user.id,
      change_summary_json: {
        action: fullReprocess
          ? "reprocess_from_master"
          : "process_from_master",
        process_mode: mode,
        employee_count: newLines.length,
        skipped_duplicate_count: skippedDuplicates.length,
        skipped_duplicate_ids: skippedDuplicates.map((e) => e.id),
        departments: mode === PROCESS_MODES.DEPT ? departments : undefined,
        processed_on: processDay,
        processed_at: processAt,
      },
    });
    if (revErr) throw revErr;
  }

  try {
    applySalarySheetToEmployeeMasters(newLines, key);
    await applySalarySheetLinesToDb(newLines, key);
  } catch (syncErr) {
    console.warn("Salary process: master deduction sync skipped", syncErr);
  }

  const bundle = await getMonthRunWithLines(runId);

  return {
    ...bundle,
    processMeta: {
      processMode: mode,
      processedCount: newLines.length,
      payslipCount: 0,
      processedOn: processDay,
      processedAt: processAt,
      skippedDuplicateCount: skippedDuplicates.length,
      skippedDuplicates: skippedDuplicates.map((e) => ({
        id: e.id,
        employee_code: e.employee_code || e.employee_id,
        full_name: e.full_name,
      })),
      fullReprocess,
    },
  };
}

/**
 * Processed tab action: write salary slips onto employee profiles and publish this month’s report.
 * Does not open slips on the processing screen.
 */
export async function publishSalarySlipsForMonth({ year, month, employeeIds = [] } = {}) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || m < 1 || m > 12) {
    throw new Error("Select a valid month and year.");
  }
  const key = monthKey(y, m);
  const existing = await getMonthRunByKey(key);
  if (!existing?.id) {
    throw new Error("Process salary from All Employees first, then lock from Processed.");
  }
  const bundle = await getMonthRunWithLines(existing.id);
  const allLines = bundle.lines || [];
  const idSet = new Set((employeeIds || []).map(String).filter(Boolean));
  const selected = idSet.size
    ? allLines.filter((l) => idSet.has(String(l.employee_master_id)))
    : allLines;
  if (!selected.length) {
    throw new Error("Select processed employees, then click Processed.");
  }
  const skippedLocked = selected.filter((l) => salaryLineLocked(l));
  const target = selected.filter((l) => !salaryLineLocked(l));
  if (!target.length) {
    throw new Error(
      "These employees are already processed and locked for this month. Their salary will not be updated."
    );
  }

  const user = await currentUserMeta();
  const processDay = new Date();
  const processedOn = `${processDay.getFullYear()}-${String(processDay.getMonth() + 1).padStart(2, "0")}-${String(processDay.getDate()).padStart(2, "0")}`;
  const processAt = new Date().toISOString();
  const runMeta = {
    ...bundle.run,
    processed_on: processedOn,
    summary_json: {
      ...(bundle.run?.summary_json || {}),
      processed_on: processedOn,
      processed_at: processAt,
    },
  };

  const { buildPayslipFromLine, generatePayslipsForRun, upsertPayslipsToDb } = await import(
    "../../../lib/salaryPayslips"
  );

  const stamped = target.map((line) => {
    const cj =
      line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
    const snap =
      line.source_snapshot_json && typeof line.source_snapshot_json === "object"
        ? line.source_snapshot_json
        : {};
    const slip = buildPayslipFromLine(runMeta, line, { processedOn, generatedAt: processAt });
    return {
      ...line,
      computed_json: {
        ...cj,
        pay_month_key: key,
        processed_on: cj.processed_on || processedOn,
        slip_generated_on: processedOn,
        slip_generated_at: processAt,
        payslip: slip,
      },
      source_snapshot_json: {
        ...snap,
        pay_month_key: key,
        processed_on: snap.processed_on || processedOn,
        slip_generated_on: processedOn,
      },
    };
  });

  for (const line of stamped) {
    if (!line.id) continue;
    const { error } = await supabase
      .from(MONTH_LINES_TABLE)
      .update({
        computed_json: line.computed_json,
        source_snapshot_json: line.source_snapshot_json,
        updated_at: processAt,
      })
      .eq("id", line.id);
    if (error) throw error;
  }

  let slipCount = 0;
  try {
    const slips = stamped.map((l) => l.computed_json?.payslip).filter(Boolean);
    if (slips.length) {
      generatePayslipsForRun(runMeta, stamped, {
        processedOn,
        generatedAt: processAt,
        skipExisting: true,
      });
      await upsertPayslipsToDb(slips);
    }
    slipCount = slips.length || stamped.length;
  } catch (psErr) {
    console.warn("Salary slips: generation skipped", psErr);
    throw new Error("Could not save salary slips.");
  }

  const prevSummary =
    bundle.run?.summary_json && typeof bundle.run.summary_json === "object"
      ? bundle.run.summary_json
      : {};
  const reportBatches = Array.isArray(prevSummary.report_batches)
    ? [...prevSummary.report_batches]
    : [];
  reportBatches.push({
    processed_on: processedOn,
    processed_at: processAt,
    employee_count: stamped.length,
    employee_ids: stamped.map((l) => String(l.employee_master_id)),
  });

  const { error: runErr } = await supabase
    .from(MONTH_RUNS_TABLE)
    .update({
      updated_by: user.id,
      summary_json: {
        ...prevSummary,
        report_published: true,
        slips_generated_on: processedOn,
        slips_generated_at: processAt,
        last_slip_count: slipCount,
        report_batches: reportBatches,
      },
    })
    .eq("id", existing.id);
  if (runErr) throw runErr;

  return {
    run: bundle.run,
    slipCount,
    processedOn,
    processedCount: stamped.length,
    skippedLocked: skippedLocked.length,
  };
}

function collectOverrides(line, original) {
  const keys = [
    "account_no",
    "ifsc",
    "confirmation_date",
    "present_days",
    "pf_basic",
    "pt_amount",
    "loan",
    "sal_adv",
    "unpaid_paid",
    "tds",
    "salary_rate",
    "basic_full",
    "hra_full",
    "special_full",
  ];
  const overrides = {};
  for (const k of keys) {
    const a = line[k] == null ? "" : String(line[k]);
    const b = original?.[k] == null ? "" : String(original[k]);
    if (a !== b) overrides[k] = line[k];
  }
  return overrides;
}

function detectMasterVariances(line, masterRow, revisionNo, monthKeyStr, runId) {
  const flags = [];
  if (!masterRow) return flags;
  for (const f of MASTER_COMPARE_FIELDS) {
    const sheetVal = str(line[f.key]);
    const masterVal =
      f.master === "employee_code"
        ? str(masterRow.employee_code || masterRow.employee_id)
        : str(masterRow[f.master]);
    if (sheetVal !== masterVal) {
      flags.push({
        employee_master_id: line.employee_master_id,
        run_id: runId,
        month_key: monthKeyStr,
        field_key: f.key,
        master_value: masterVal,
        sheet_value: sheetVal,
        revision_no: revisionNo,
        status: "open",
      });
    }
  }
  return flags;
}

/**
 * Save edited lines: bump run revision, store overrides, write variance flags.
 */
export async function saveMonthRunEdits(runId, editedLines) {
  const { run, lines: existing } = await getMonthRunWithLines(runId);
  if (!run) throw new Error("Salary sheet not found.");
  const user = await currentUserMeta();
  const revisionNo = num(run.revision_no, 1) + 1;
  const byId = Object.fromEntries((existing || []).map((l) => [l.id, l]));

  const masterIds = [...new Set(editedLines.map((l) => l.employee_master_id).filter(Boolean))];
  let masters = [];
  if (masterIds.length) {
    const { data } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("id, employee_id, employee_code, designation, bank_account_no, ifsc_code, confirmation_date")
      .in("id", masterIds);
    masters = data || [];
  }
  const masterById = Object.fromEntries(masters.map((m) => [m.id, m]));

  const recomputed = editedLines.map((raw) => {
    const prev = byId[raw.id] || raw;
    if (salaryLineLocked(prev) || salaryLineLocked(raw)) {
      return { line: prev, variances: [] };
    }
    const next = recomputeLineFromEdits(
      {
        ...prev,
        ...raw,
      },
      run.month_days
    );
    const overrides = {
      ...(prev.overrides_json || {}),
      ...collectOverrides(next, prev.source_snapshot_json || prev),
    };
    const variances = detectMasterVariances(
      next,
      masterById[next.employee_master_id],
      revisionNo,
      run.month_key,
      runId
    );
    return {
      line: {
        ...next,
        overrides_json: overrides,
        line_revision_no: revisionNo,
        has_master_variance: variances.length > 0,
        updated_at: new Date().toISOString(),
      },
      variances,
    };
  });

  const totals = sumLines(recomputed.map((r) => r.line));

  const summary_json = applyRevisionToRunSheet(run.summary_json || {}, {
    year: run.pay_year,
    month: run.pay_month,
    revisionNo,
  });

  const { error: runErr } = await supabase
    .from(MONTH_RUNS_TABLE)
    .update({
      revision_no: revisionNo,
      ...totals,
      updated_by: user.id,
      status: "processed",
      summary_json: {
        ...summary_json,
        last_saved_at: new Date().toISOString(),
      },
    })
    .eq("id", runId);
  if (runErr) throw runErr;

  for (const { line } of recomputed) {
    if (!line?.id || salaryLineLocked(line)) continue;
    const rest = toDbLinePayload(line, { includeRunId: false });
    const { error } = await supabase.from(MONTH_LINES_TABLE).update(rest).eq("id", line.id);
    if (error) throw error;
  }

  const allFlags = recomputed.flatMap((r) => r.variances);
  // Clear prior open flags for this run, then insert new
  await supabase
    .from(VARIANCE_TABLE)
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("run_id", runId)
    .eq("status", "open");

  if (allFlags.length) {
    const { error: vErr } = await supabase.from(VARIANCE_TABLE).insert(allFlags);
    if (vErr) throw vErr;
  }

  const changedEmployees = recomputed
    .filter((r) => r.line.has_master_variance || Object.keys(r.line.overrides_json || {}).length)
    .map((r) => r.line.employee_code);

  await supabase.from(RUN_REVISIONS_TABLE).insert({
    run_id: runId,
    revision_no: revisionNo,
    changed_by: user.id,
    change_summary_json: {
      action: "manual_edit",
      changed_employees: changedEmployees,
      variance_count: allFlags.length,
    },
  });

  // Sheet → Employee Master monthly components (+ DB loan / advance recoveries)
  try {
    const syncLines = recomputed.map((r) => r.line);
    applySalarySheetToEmployeeMasters(syncLines, run.month_key);
    await applySalarySheetLinesToDb(syncLines, run.month_key);
  } catch (syncErr) {
    console.warn("Salary save: master deduction sync skipped", syncErr);
  }

  const bundle = await getMonthRunWithLines(runId);
  try {
    const published = (bundle.lines || []).filter((l) => {
      const cj = l.computed_json && typeof l.computed_json === "object" ? l.computed_json : {};
      return Boolean(cj.slip_generated_on);
    });
    if (published.length) {
      const { generateAndSavePayslipsForRun } = await import("../../../lib/salaryPayslips");
      await generateAndSavePayslipsForRun(bundle.run, published, {
        processedOn: published[0].computed_json?.slip_generated_on,
        skipExisting: true,
      });
    }
  } catch (psErr) {
    console.warn("Salary save: payslip generation skipped", psErr);
  }
  return bundle;
}

export async function fetchOpenVariancesForEmployee(employeeMasterId) {
  const id = Number(employeeMasterId);
  if (!Number.isFinite(id)) return [];
  const { data, error } = await supabase
    .from(VARIANCE_TABLE)
    .select("*")
    .eq("employee_master_id", id)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Salary variances load failed", error);
    return [];
  }
  return data || [];
}

export { formatINRPlain, DEFAULT_MONTH_DAYS };

/** Load runs + lines for dashboard analytics (live). */
export async function listMonthRunsWithLines() {
  const runs = await listMonthRuns();
  const out = [];
  for (const run of runs) {
    const { lines } = await getMonthRunWithLines(run.id);
    out.push({ run, lines: lines || [] });
  }
  return out;
}

function formatProcessDayLabel(ymd) {
  const raw = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "—";
  return new Date(`${raw}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Salary process report for a pay month: who was processed, grouped by the day
 * Process salary was clicked.
 */
export async function buildSalaryProcessReport({ year, month } = {}) {
  const y = Number(year);
  const m = Number(month);
  const key = monthKey(y, m);
  const label = monthLabel(y, m);

  const existing = await getMonthRunByKey(key);
  let lines = [];
  let run = null;
  if (existing?.id) {
    const bundle = await getMonthRunWithLines(existing.id);
    run = bundle.run;
    lines = bundle.lines || [];
  }

  let slipsByEmp = new Map();
  try {
    const { listPayslipsForMonthAsync } = await import("../../../lib/salaryPayslips");
    for (const slip of (await listPayslipsForMonthAsync(key)) || []) {
      slipsByEmp.set(String(slip.employee_master_id), slip);
    }
  } catch {
    slipsByEmp = new Map();
  }

  const runDay =
    run?.summary_json?.processed_on ||
    (run?.updated_at ? String(run.updated_at).slice(0, 10) : "") ||
    (run?.created_at ? String(run.created_at).slice(0, 10) : "") ||
    "";

  const batchDayByEmp = new Map();
  const batches = [
    ...(Array.isArray(run?.summary_json?.report_batches) ? run.summary_json.report_batches : []),
    ...(Array.isArray(run?.summary_json?.batches) ? run.summary_json.batches : []),
  ];
  for (const batch of batches) {
    const day = String(batch.processed_on || batch.processed_at || "").slice(0, 10);
    for (const id of batch.employee_ids || []) {
      if (day) batchDayByEmp.set(String(id), day);
    }
  }

  const byDay = new Map();
  let totalGross = 0;
  let totalDed = 0;
  let totalNet = 0;
  let publishedCount = 0;
  for (const line of lines) {
    const empId = line.employee_master_id;
    const cj = line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
    const snap =
      line.source_snapshot_json && typeof line.source_snapshot_json === "object"
        ? line.source_snapshot_json
        : {};
    const slip = cj.payslip || slipsByEmp.get(String(empId));
    if (!cj.slip_generated_on && !snap.slip_generated_on && !cj.payslip) continue;
    publishedCount += 1;

    const processDay =
      (cj.slip_generated_on && String(cj.slip_generated_on).slice(0, 10)) ||
      (snap.slip_generated_on && String(snap.slip_generated_on).slice(0, 10)) ||
      (slip?.processed_on && String(slip.processed_on).slice(0, 10)) ||
      batchDayByEmp.get(String(empId)) ||
      runDay ||
      "—";

    const gross = num(line.gross_wages);
    const ded = num(line.total_ded);
    const net = num(line.net_salary);
    totalGross += gross;
    totalDed += ded;
    totalNet += net;

    if (!byDay.has(processDay)) byDay.set(processDay, []);
    byDay.get(processDay).push({
      employee_master_id: empId,
      employee_code: line.employee_code || "",
      employee_name: line.employee_name || "",
      designation: line.designation || "",
      department: line.department || "",
      present_days: line.present_days,
      gross_wages: line.gross_wages,
      total_ded: line.total_ded,
      net_salary: line.net_salary,
      bank_amount: line.bank_amount,
      process_day: processDay,
      payslip_id: slip?.id || null,
      line,
    });
  }

  const dayKeys = [...byDay.keys()].sort((a, b) => String(b).localeCompare(String(a)));
  const groups = dayKeys.map((day) => {
    const employees = (byDay.get(day) || []).sort((a, b) =>
      String(a.employee_code).localeCompare(String(b.employee_code), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
    const groupGross = employees.reduce((s, e) => s + num(e.gross_wages), 0);
    const groupNet = employees.reduce((s, e) => s + num(e.net_salary), 0);
    return {
      process_day: day,
      process_day_label: formatProcessDayLabel(day),
      employee_count: employees.length,
      total_gross: round0(groupGross),
      total_net: round0(groupNet),
      employees,
    };
  });

  return {
    month_key: key,
    month_label: label,
    run,
    has_sheet: Boolean(run?.id),
    total_employees: publishedCount,
    total_gross: round0(totalGross),
    total_ded: round0(totalDed),
    total_net: round0(totalNet),
    process_days: dayKeys.filter((d) => d && d !== "—"),
    groups,
  };
}
