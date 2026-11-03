/**
 * Read-only audit: Oct 2026 Daily Register totals vs rules + Salary Admin P.Days.
 * Does not write or change any attendance/salary logic or data.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] == null) process.env[m[1]] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvFile(resolve(process.cwd(), ".env.server"));
loadEnvFile(resolve(process.cwd(), ".env"));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing Supabase URL/key");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const {
  fetchAttendancePunchesInRange,
  fetchActiveEmployees,
  fetchRegisterMarksForMonth,
  buildMonthlyRegisterGrid,
  attachRegisterRowSummaries,
  monthDateRange,
  normalizeAttendanceEmpCode,
  registerPresentDaySummaryCreditForCell,
  registerSummaryLeaveCreditForCell,
  isRegisterNhphMark,
  isWeeklyOffDate,
} = await import("./src/lib/attendanceDaily.js");
const { fetchNationalPublicHolidayDatesInRange } = await import("./src/lib/nationalPublicHolidays.js");
const { ensureAttendanceRulesLoaded, isAutoHolidayFor } = await import("./src/lib/attendanceRules.js");
const { salaryPresentDaysFromDayMarks, workingDaysMonToSat } = await import(
  "./src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js"
);

const MONTH = "2026-10";
const OFF_DAY_WORK = new Set(["P", "P(OD)", "T", "HD"]);
const meta = monthDateRange(MONTH);
const year = meta.year;
const month = meta.month;
const monthCap = workingDaysMonToSat(year, month);

console.error("Loading rules…");
await ensureAttendanceRulesLoaded(supabase);

console.error("Fetching punches, employees, register marks, holidays…");
const [punches, employees, manualPack, holidayDates] = await Promise.all([
  fetchAttendancePunchesInRange(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchActiveEmployees(supabase),
  fetchRegisterMarksForMonth(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchNationalPublicHolidayDatesInRange(supabase, meta.fromDate, meta.toDate),
]);

const holidaySet = new Set(holidayDates || []);
const { rows, daysInMonth } = buildMonthlyRegisterGrid(punches, employees, {
  year,
  month,
  manualMarks: manualPack.marks || {},
  markSources: manualPack.markSources || null,
});

const withSummary = attachRegisterRowSummaries(rows, manualPack.marks || {}, daysInMonth, {
  year,
  month,
  holidayDates: holidaySet,
});

function presentMarkForCredit(mark, day, empCode, department) {
  if (!OFF_DAY_WORK.has(String(mark || "").trim())) return mark;
  const iso = `${MONTH}-${String(day).padStart(2, "0")}`;
  if (holidaySet.has(iso) && isAutoHolidayFor(iso, { employeeCode: empCode, department })) return "NH/PH";
  if (isWeeklyOffDate(iso, department, empCode)) return "WO";
  return mark;
}

function markBucket(mark, credit) {
  const m = String(mark || "").trim();
  if (!m) return "blank";
  if (m === "WO") return credit > 0 ? "woPaidCredit" : "wo";
  if (isRegisterNhphMark(m)) return "nhph";
  if (m === "HD" || /^P\//i.test(m) || /^LWP\//i.test(m)) return "half";
  if (["P", "P(OD)", "T", "CO", "WFH"].includes(m)) return "present";
  if (m === "LWP") return "lwp";
  if (["PL", "CL", "SL", "SPLA", "SPLB", "SBEL", "SPLM", "PTL", "ML"].includes(m)) return "paidLeave";
  if (m === "Left") return "left";
  return "other";
}

const employeeRows = [];

for (const row of withSummary) {
  const summary = row.summary || {};
  let recomputedPresent = 0;
  let recomputedLeave = 0;
  let wo = 0;
  let nhph = 0;
  let offDayWorkZeroed = 0;
  const buckets = {};

  for (let day = 1; day <= daysInMonth; day += 1) {
    const mark = row.dayMarks[day] || "";
    const ctx = { year, month, day, department: row.department, employeeCode: row.empCode };
    const presentMark = presentMarkForCredit(mark, day, row.empCode, row.department);
    if (presentMark !== mark && OFF_DAY_WORK.has(String(mark).trim())) offDayWorkZeroed += 1;
    const credit = registerPresentDaySummaryCreditForCell(presentMark, ctx);
    const leaveCredit = registerSummaryLeaveCreditForCell(mark, ctx);
    recomputedPresent += credit;
    recomputedLeave += leaveCredit;
    if (mark === "WO") wo += 1;
    if (isRegisterNhphMark(mark)) nhph += 1;
    const b = markBucket(mark, credit);
    buckets[b] = (buckets[b] || 0) + 1;
  }

  const salaryP = salaryPresentDaysFromDayMarks(row.dayMarks, year, month, row.department);
  const registerP = Number(summary.totalPresent) || 0;

  employeeRows.push({
    empCode: row.empCode,
    name: row.employeeName,
    department: row.department || "",
    registerTotalPresent: registerP,
    recomputedTotalPresent: Math.round(recomputedPresent * 10) / 10,
    registerLeave: Number(summary.leave) || 0,
    recomputedLeave: Math.round(recomputedLeave * 10) / 10,
    registerWeekoff: Number(summary.weekoff) || 0,
    recomputedWeekoff: wo,
    registerNhph: Number(summary.nhph) || 0,
    recomputedNhph: nhph,
    salaryPDays: salaryP,
    salaryCap: monthCap,
    registerVsSalaryDiff: Math.round((registerP - salaryP) * 10) / 10,
    internalOk: Math.abs(recomputedPresent - registerP) < 0.05,
    leaveOk: Math.abs(recomputedLeave - (Number(summary.leave) || 0)) < 0.05,
    woOk: wo === (Number(summary.weekoff) || 0),
    nhphOk: nhph === (Number(summary.nhph) || 0),
    offDayWorkZeroed,
    buckets,
  });
}

console.error("Fetching salary processing lines…");
const { data: runs, error: runsErr } = await supabase
  .from("admin_salary_processing_runs")
  .select("id, month_key, status, pay_year, pay_month, month_days, updated_at")
  .eq("month_key", MONTH)
  .order("updated_at", { ascending: false });
if (runsErr) console.warn("Salary runs:", runsErr.message);

let salaryLines = [];
if (runs?.length) {
  const { data: lines, error: linesErr } = await supabase
    .from("admin_salary_processing_lines")
    .select("run_id, employee_code, employee_name, present_days, total_days")
    .in(
      "run_id",
      runs.map((r) => r.id)
    );
  if (linesErr) console.warn("Salary lines:", linesErr.message);
  else salaryLines = lines || [];
}

const byCodeSalary = new Map();
for (const line of salaryLines) {
  const code = normalizeAttendanceEmpCode(line.employee_code);
  if (!code || byCodeSalary.has(code)) continue;
  byCodeSalary.set(code, {
    present_days: Number(line.present_days),
    total_days: Number(line.total_days),
    run_id: line.run_id,
  });
}

const salaryCompare = employeeRows.map((row) => {
  const stored = byCodeSalary.get(row.empCode);
  if (!stored) {
    return {
      empCode: row.empCode,
      name: row.name,
      department: row.department,
      expectedSalaryP: row.salaryPDays,
      storedSalaryP: null,
      status: "no_salary_line",
      diff: null,
    };
  }
  const diff = Math.round((Number(stored.present_days) - row.salaryPDays) * 10) / 10;
  return {
    empCode: row.empCode,
    name: row.name,
    department: row.department,
    expectedSalaryP: row.salaryPDays,
    storedSalaryP: Number(stored.present_days),
    status: Math.abs(diff) < 0.05 ? "match" : "mismatch",
    diff,
  };
});

const internalFail = employeeRows.filter((r) => !r.internalOk || !r.leaveOk || !r.woOk || !r.nhphOk);
const salaryMismatch = salaryCompare.filter((r) => r.status === "mismatch");
const salaryMissing = salaryCompare.filter((r) => r.status === "no_salary_line");
const bigRegisterVsSalary = employeeRows
  .filter((r) => Math.abs(r.registerVsSalaryDiff) >= 0.5)
  .sort((a, b) => Math.abs(b.registerVsSalaryDiff) - Math.abs(a.registerVsSalaryDiff));

const deptRollup = {};
for (const r of employeeRows) {
  const d = r.department || "(blank)";
  if (!deptRollup[d]) deptRollup[d] = { employees: 0, registerP: 0, salaryP: 0, leave: 0, wo: 0, nhph: 0 };
  deptRollup[d].employees += 1;
  deptRollup[d].registerP += r.registerTotalPresent;
  deptRollup[d].salaryP += r.salaryPDays;
  deptRollup[d].leave += r.recomputedLeave;
  deptRollup[d].wo += r.recomputedWeekoff;
  deptRollup[d].nhph += r.recomputedNhph;
}

const report = {
  month: MONTH,
  daysInMonth,
  monthWorkingDaysCap: monthCap,
  holidayDates: [...holidaySet].sort(),
  employeeCount: employeeRows.length,
  punchesLoaded: punches.length,
  registerMarkEmployees: Object.keys(manualPack.marks || {}).length,
  salaryRuns: (runs || []).map((r) => ({
    id: r.id,
    status: r.status,
    month_days: r.month_days,
    updated_at: r.updated_at,
  })),
  summary: {
    registerInternalMismatches: internalFail.length,
    salaryLineMismatches: salaryMismatch.length,
    salaryLinesMissing: salaryMissing.length,
    salaryLinesPresent: salaryCompare.length - salaryMissing.length,
    employeesWhereRegisterTotalDiffersFromSalaryFormula: bigRegisterVsSalary.length,
    note:
      "Register Total present includes Sunday WO paid credits / NH-PH / Oct-2026 off-day-work rules. Salary P.Days = Mon–Sat only, capped at working days (26 for Oct).",
  },
  departmentRollup: Object.entries(deptRollup)
    .map(([department, v]) => ({
      department,
      ...v,
      registerP: Math.round(v.registerP * 10) / 10,
      salaryP: Math.round(v.salaryP * 10) / 10,
      leave: Math.round(v.leave * 10) / 10,
    }))
    .sort((a, b) => a.department.localeCompare(b.department)),
  topRegisterVsSalaryDiffs: bigRegisterVsSalary.slice(0, 50).map((r) => ({
    empCode: r.empCode,
    name: r.name,
    department: r.department,
    registerTotalPresent: r.registerTotalPresent,
    salaryPDays: r.salaryPDays,
    diff: r.registerVsSalaryDiff,
    weekoff: r.recomputedWeekoff,
    nhph: r.recomputedNhph,
    leave: r.recomputedLeave,
    offDayWorkZeroed: r.offDayWorkZeroed,
  })),
  internalFailures: internalFail.slice(0, 40).map((r) => ({
    empCode: r.empCode,
    name: r.name,
    registerTotalPresent: r.registerTotalPresent,
    recomputedTotalPresent: r.recomputedTotalPresent,
    leave: [r.registerLeave, r.recomputedLeave],
    wo: [r.registerWeekoff, r.recomputedWeekoff],
    nhph: [r.registerNhph, r.recomputedNhph],
  })),
  salaryMismatches: salaryMismatch.slice(0, 80),
  sampleEmployees: employeeRows.slice(0, 20).map((r) => ({
    empCode: r.empCode,
    name: r.name,
    department: r.department,
    registerTotalPresent: r.registerTotalPresent,
    salaryPDays: r.salaryPDays,
    leave: r.recomputedLeave,
    weekoff: r.recomputedWeekoff,
    nhph: r.recomputedNhph,
    buckets: r.buckets,
  })),
  allEmployees: employeeRows.map((r) => ({
    empCode: r.empCode,
    name: r.name,
    department: r.department,
    registerTotalPresent: r.registerTotalPresent,
    salaryPDays: r.salaryPDays,
    leave: r.recomputedLeave,
    weekoff: r.recomputedWeekoff,
    nhph: r.recomputedNhph,
    registerVsSalaryDiff: r.registerVsSalaryDiff,
    internalOk: r.internalOk,
  })),
};

const outPath = resolve(process.cwd(), "tmp_audit_oct2026_present_report.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.error(`Wrote ${outPath}`);
console.log(
  JSON.stringify(
    {
      summary: report.summary,
      monthWorkingDaysCap: report.monthWorkingDaysCap,
      holidayDates: report.holidayDates,
      employeeCount: report.employeeCount,
      salaryRuns: report.salaryRuns,
      departmentRollup: report.departmentRollup,
      topRegisterVsSalaryDiffs: report.topRegisterVsSalaryDiffs.slice(0, 25),
      salaryMismatches: report.salaryMismatches.slice(0, 25),
      internalFailures: report.internalFailures.slice(0, 15),
    },
    null,
    2
  )
);
