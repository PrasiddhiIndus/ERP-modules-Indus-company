/**
 * Salary Admin — month processing (sample sheet workflow).
 * Tables: admin_salary_month_runs / lines / revisions / employee variances.
 */

import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import {
  ATTENDANCE_REGISTER_TABLE,
  normalizeAttendanceEmpCode,
  registerPresentDayCredit,
} from "../../../lib/attendanceDaily";
import { getEmployeeDeductions, applySalarySheetToEmployeeMasters } from "../../admin/employeeMaster/deductions/deductionsStore";
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
  fetchSalaryStructureMap,
  formatINRPlain,
  resolveHraMonthly,
} from "./salaryData";

export { getRunSheetNo, formatRunSheetNo } from "./salarySheetNumbers";

export const MONTH_RUNS_TABLE = "admin_salary_month_runs";
export const MONTH_LINES_TABLE = "admin_salary_month_lines";
export const RUN_REVISIONS_TABLE = "admin_salary_run_revisions";
export const VARIANCE_TABLE = "admin_employee_salary_variances";

const MASTER_COMPARE_FIELDS = [
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
 * Present-day credits by employee_code for a month (attendance register).
 */
export async function fetchPresentDaysByEmployeeCode(year, month) {
  const { from, to } = monthDateRange(year, month);
  const map = {};
  try {
    const { data, error } = await supabase
      .from(ATTENDANCE_REGISTER_TABLE)
      .select("employee_code, register_date, mark")
      .gte("register_date", from)
      .lte("register_date", to);
    if (error) throw error;
    for (const row of data || []) {
      const code = normalizeAttendanceEmpCode(row.employee_code);
      if (!code) continue;
      const credit = registerPresentDayCredit(row.mark);
      if (!credit) continue;
      map[code] = round0((map[code] || 0) + credit * 10) / 10;
    }
  } catch (err) {
    console.warn("Salary processing: present days from register unavailable", err);
  }
  return map;
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
  const cj = {
    ...(line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {}),
    custom_earn_full: line.custom_earn_full,
    custom_ded_full: line.custom_ded_full,
    custom_earn: line.custom_earn,
    custom_ded: line.custom_ded,
  };
  const out = {};
  for (const key of LINE_DB_COLUMNS) {
    if (key === "run_id" && !includeRunId) continue;
    if (line[key] !== undefined) out[key] = line[key];
  }
  out.computed_json = cj;
  return out;
}

function seedDeductionsFromProfile(employeeMasterId) {
  const d = getEmployeeDeductions(employeeMasterId);
  let loan = 0;
  for (const l of d.loans || []) {
    if (l.status === "active") loan += num(l.installment_amount);
  }
  let salAdv = 0;
  for (const a of d.salaryAdvances || []) {
    if (a.status === "active") salAdv += num(a.recovery_amount);
  }
  let unpaidPaid = 0;
  for (const u of d.unpaidPaid || []) {
    if (u.status === "open") {
      const bal = num(u.balance_outstanding);
      unpaidPaid += u.kind === "paid" ? bal : -bal;
    }
  }
  let tds = 0;
  if (d.tds?.active && d.tds.mode === "manual") tds = num(d.tds.monthly_amount);
  return { loan, salAdv, unpaidPaid, tds };
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
  const ded = deductions || seedDeductionsFromProfile(employee.id);
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
    date_of_joining: employee.date_of_joining || null,
    account_no: employee.bank_account_no || "",
    ifsc: employee.ifsc_code || "",
    confirmation_date: employee.confirmation_date || null,
    salary_rate: computed.salary_rate,
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
    confirmation_date: snapshot.confirmation_date,
    declared: Boolean(computed.declared),
    salary_rate: computed.salary_rate,
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
export function recomputeLineFromEdits(line, monthDays) {
  const td = num(monthDays, DEFAULT_MONTH_DAYS) || DEFAULT_MONTH_DAYS;
  const K = num(line.present_days, td);
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
    line.pt_amount != null && line.pt_amount !== ""
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
    present_days: K,
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
  const [runRes, linesRes] = await Promise.all([
    supabase.from(MONTH_RUNS_TABLE).select("*").eq("id", runId).maybeSingle(),
    supabase
      .from(MONTH_LINES_TABLE)
      .select("*")
      .eq("run_id", runId)
      .order("employee_code", { ascending: true }),
  ]);
  if (runRes.error) throw runRes.error;
  if (linesRes.error) throw linesRes.error;
  const lines = (linesRes.data || []).map((line) => {
    const cj = line.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
    return {
      ...line,
      custom_earn_full: cj.custom_earn_full ?? 0,
      custom_ded_full: cj.custom_ded_full ?? 0,
      custom_earn: cj.custom_earn,
      custom_ded: cj.custom_ded,
    };
  });
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
    if (draft[key] !== undefined) merged[key] = draft[key];
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

function normalizeDeptName(v) {
  return v == null ? "" : String(v).trim();
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
  if (processedIndex.ids.has(String(emp.id))) return true;
  const code = str(emp.employee_code || emp.employee_id).toUpperCase();
  return Boolean(code && processedIndex.codes.has(code));
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
    const deptSet = new Set((departments || []).map(normalizeDeptName).filter(Boolean));
    return (employees || []).filter((emp) => deptSet.has(normalizeDeptName(emp.department)));
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

function buildLinesForEmployees(employees, { salaryMap, presentMap, monthDays }) {
  const days = Number(monthDays) > 0 ? Number(monthDays) : DEFAULT_MONTH_DAYS;
  const lines = [];
  for (const emp of employees || []) {
    const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
    const code = normalizeAttendanceEmpCode(emp.employee_code || emp.employee_id);
    const present =
      code && presentMap[code] != null && presentMap[code] > 0 ? presentMap[code] : days;
    lines.push(
      buildSheetLineFromSources({
        employee: emp,
        structure,
        presentDays: present,
        monthDays: days,
        deductions: seedDeductionsFromProfile(emp.id),
      })
    );
  }
  return lines;
}

/** Active employees eligible for processing, with duplicate flags for the month. */
export async function fetchSalaryProcessCandidates({
  year,
  month,
  includeWithoutCtc = false,
} = {}) {
  const key = monthKey(year, month);
  const existing = await getMonthRunByKey(key);
  let processedIndex = { ids: new Set(), codes: new Set() };
  if (existing?.id) {
    const { lines } = await getMonthRunWithLines(existing.id);
    processedIndex = buildProcessedEmployeeIndex(lines);
  }

  const [{ data: employees, error: empErr }, salaryMap] = await Promise.all([
    supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select(
        "id, employee_id, employee_code, full_name, designation, department, date_of_joining, confirmation_date, bank_account_no, ifsc_code, status"
      )
      .eq("status", "Active")
      .order("employee_code", { ascending: true }),
    fetchSalaryStructureMap(),
  ]);
  if (empErr) throw empErr;

  const holdIdSet = new Set(getMonthHoldIds(key));
  const deptSet = new Set();
  const rows = (employees || []).map((emp) => {
    const structure = salaryMap.get(String(emp.id)) || salaryMap.get(emp.id) || null;
    const hasCtc = Boolean(structure?.declared);
    // Default: only declared CTC. Toggle: only employees still without CTC.
    const eligible = includeWithoutCtc ? !hasCtc : hasCtc;
    const dept = normalizeDeptName(emp.department);
    if (dept) deptSet.add(dept);
    return {
      id: emp.id,
      employee_code: emp.employee_code || emp.employee_id || "",
      full_name: emp.full_name || "",
      designation: emp.designation || "",
      department: dept || "—",
      date_of_joining: emp.date_of_joining || null,
      confirmation_date: emp.confirmation_date || null,
      bank_account_no: emp.bank_account_no || "",
      ifsc_code: emp.ifsc_code || "",
      employee_id: emp.employee_id || "",
      hasCtc,
      eligible,
      alreadyProcessed: employeeAlreadyProcessed(emp, processedIndex),
      onHold: holdIdSet.has(String(emp.id)),
      _structure: structure,
    };
  });

  const departmentStats = departmentStatsForEmployees(rows);

  return {
    monthKey: key,
    existingRun: existing,
    departments: [...deptSet].sort((a, b) => a.localeCompare(b)),
    departmentStats,
    employees: rows,
    holdIds: [...holdIdSet],
    salaryMap,
  };
}

/**
 * Build editable salary-sheet preview lines for employees in the process scope.
 * Uses CTC + attendance present days + same formulas as Process / editor.
 */
export async function buildSalaryScopePreviewLines({
  employees = [],
  year,
  month,
  monthDays = DEFAULT_MONTH_DAYS,
  salaryMap = null,
} = {}) {
  const days = Number(monthDays) > 0 ? Number(monthDays) : DEFAULT_MONTH_DAYS;
  // Always refresh CTC map so Employee Master "Save CTC" is visible here.
  // Do not trust an empty Map from a prior candidates load.
  let map = salaryMap instanceof Map && salaryMap.size > 0 ? salaryMap : null;
  if (!map) {
    map = await fetchSalaryStructureMap();
  }
  const presentMap = await fetchPresentDaysByEmployeeCode(year, month);
  const key = monthKey(year, month);
  const lines = [];
  for (const emp of employees || []) {
    const structure =
      map.get(String(emp.id)) ||
      map.get(emp.id) ||
      emp._structure ||
      null;
    const code = normalizeAttendanceEmpCode(emp.employee_code || emp.employee_id);
    const present =
      code && presentMap[code] != null && presentMap[code] > 0 ? presentMap[code] : days;
    let line = buildSheetLineFromSources({
      employee: {
        id: emp.id,
        employee_id: emp.employee_id || emp.employee_code,
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        designation: emp.designation,
        date_of_joining: emp.date_of_joining,
        confirmation_date: emp.confirmation_date,
        bank_account_no: emp.bank_account_no,
        ifsc_code: emp.ifsc_code,
      },
      structure,
      presentDays: present,
      monthDays: days,
      deductions: seedDeductionsFromProfile(emp.id),
    });
    const draft = getScopeLineDraft(key, emp.id);
    if (draft) {
      line = applyScopeLineDraft(line, draft, days);
    }
    lines.push({
      ...line,
      id: `preview_${emp.id}`,
      employee_master_id: emp.id,
      department: emp.department || "—",
      alreadyProcessed: Boolean(emp.alreadyProcessed),
    });
  }
  return lines;
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
  const days = Number(monthDays) > 0 ? Number(monthDays) : DEFAULT_MONTH_DAYS;
  const user = await currentUserMeta();
  const holdIds = getMonthHoldIds(key);

  const [{ data: employees, error: empErr }, salaryMap, presentMap, existing] = await Promise.all([
    supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select(
        "id, employee_id, employee_code, full_name, designation, department, date_of_joining, confirmation_date, bank_account_no, ifsc_code, status"
      )
      .eq("status", "Active")
      .order("employee_code", { ascending: true }),
    fetchSalaryStructureMap(),
    fetchPresentDaysByEmployeeCode(y, m),
    getMonthRunByKey(key),
  ]);
  if (empErr) throw empErr;

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
            ? "No active employees without CTC (or all are on hold)."
            : "No active employees with declared CTC (or all are on hold).";
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

  let newLines = buildLinesForEmployees(toProcess, {
    salaryMap,
    presentMap,
    monthDays: days,
  });
  newLines = newLines.map((line) => {
    const draft = getScopeLineDraft(key, line.employee_master_id);
    return draft ? applyScopeLineDraft(line, draft, days) : line;
  });

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
          last_partial_process_at: new Date().toISOString(),
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
          reprocessed_at: new Date().toISOString(),
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
      },
    });
    if (revErr) throw revErr;
  }

  try {
    applySalarySheetToEmployeeMasters(newLines, key);
  } catch (syncErr) {
    console.warn("Salary process: master deduction sync skipped", syncErr);
  }

  const bundle = await getMonthRunWithLines(runId);
  try {
    const { generatePayslipsForRun } = await import("../../../lib/salaryPayslips");
    generatePayslipsForRun(bundle.run, newLines);
  } catch (psErr) {
    console.warn("Salary process: payslip generation skipped", psErr);
  }

  return {
    ...bundle,
    processMeta: {
      processMode: mode,
      processedCount: newLines.length,
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
    const masterVal = str(masterRow[f.master]);
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
      .select("id, bank_account_no, ifsc_code, confirmation_date, designation")
      .in("id", masterIds);
    masters = data || [];
  }
  const masterById = Object.fromEntries(masters.map((m) => [m.id, m]));

  const recomputed = editedLines.map((raw) => {
    const prev = byId[raw.id] || raw;
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
    const { id } = line;
    const rest = toDbLinePayload(line, { includeRunId: false });
    const { error } = await supabase.from(MONTH_LINES_TABLE).update(rest).eq("id", id);
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

  // Sheet → Employee Master monthly components
  try {
    applySalarySheetToEmployeeMasters(
      recomputed.map((r) => r.line),
      run.month_key
    );
  } catch (syncErr) {
    console.warn("Salary save: master deduction sync skipped", syncErr);
  }

  const bundle = await getMonthRunWithLines(runId);
  try {
    const { generatePayslipsForRun } = await import("../../../lib/salaryPayslips");
    generatePayslipsForRun(bundle.run, bundle.lines || []);
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
