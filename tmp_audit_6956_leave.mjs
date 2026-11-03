/**
 * Read-only: emp 6956 Ankur Oct 2026 leave vs Total P, then scan similar leave undercounts.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] == null) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnvFile(resolve(process.cwd(), ".env.server"));
loadEnvFile(resolve(process.cwd(), ".env"));

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const {
  fetchAttendancePunchesInRange,
  fetchActiveEmployees,
  fetchRegisterMarksForMonth,
  buildMonthlyRegisterGrid,
  attachRegisterRowSummaries,
  monthDateRange,
  normalizeAttendanceEmpCode,
  registerSummaryLeaveCreditForCell,
  registerPresentDaySummaryCreditForCell,
  isPlClSlOnWeekoffDate,
  isRegisterSummaryLeaveMark,
  isRegisterCompositeHalfDayMark,
  isRegisterNhphMark,
  isWeeklyOffDate,
} = await import("./src/lib/attendanceDaily.js");
const { fetchNationalPublicHolidayDatesInRange } = await import("./src/lib/nationalPublicHolidays.js");
const { ensureAttendanceRulesLoaded } = await import("./src/lib/attendanceRules.js");

const MONTH = "2026-10";
const TARGET = "6956";
const meta = monthDateRange(MONTH);

console.error("Loading rules…");
await ensureAttendanceRulesLoaded(supabase);

console.error("Fetching data…");
const [punches, employees, manualPack, holidays] = await Promise.all([
  fetchAttendancePunchesInRange(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchActiveEmployees(supabase),
  fetchRegisterMarksForMonth(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchNationalPublicHolidayDatesInRange(supabase, meta.fromDate, meta.toDate),
]);

const holidaySet = new Set(holidays || []);
const { rows, daysInMonth } = buildMonthlyRegisterGrid(punches, employees, {
  year: meta.year,
  month: meta.month,
  manualMarks: manualPack.marks || {},
  markSources: manualPack.markSources || null,
});
const withSummary = attachRegisterRowSummaries(rows, manualPack.marks || {}, daysInMonth, {
  year: meta.year,
  month: meta.month,
  holidayDates: holidaySet,
});

function analyzeRow(row) {
  const days = [];
  let leaveCells = 0;
  let leaveCredit = 0;
  let leaveZeroedOnWo = 0;
  let halfLeave = 0;
  let fullLeave = 0;
  const leaveMarks = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const mark = row.dayMarks[day] || "";
    if (!mark) continue;
    const ctx = {
      year: meta.year,
      month: meta.month,
      day,
      department: row.department,
      employeeCode: row.empCode,
    };
    const lc = registerSummaryLeaveCreditForCell(mark, ctx);
    const pc = registerPresentDaySummaryCreditForCell(mark, ctx);
    const onWo = isPlClSlOnWeekoffDate(mark, ctx);
    const iso = `${MONTH}-${String(day).padStart(2, "0")}`;
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(meta.year, meta.month - 1, day).getDay()];
    const looksLeave =
      isRegisterSummaryLeaveMark(mark) ||
      isRegisterCompositeHalfDayMark(mark) ||
      mark === "HD" ||
      mark === "LWP" ||
      /^P\//i.test(mark) ||
      /^LWP\//i.test(mark) ||
      /^(PL|CL|SL|SPLA|SPLB|SBEL|SPLM|PTL|ML)$/i.test(mark);

    days.push({
      day,
      iso,
      dow,
      mark,
      leaveCredit: lc,
      presentCredit: pc,
      plClSlOnWoZeroed: onWo,
      isWeeklyOff: isWeeklyOffDate(iso, row.department, row.empCode),
      isNhph: isRegisterNhphMark(mark),
    });

    if (looksLeave || lc > 0) {
      leaveCells += 1;
      leaveMarks.push({ day, dow, mark, leaveCredit: lc, presentCredit: pc, zeroedOnWo: onWo });
    }
    leaveCredit += lc;
    if (onWo) leaveZeroedOnWo += 1;
    if (lc === 0.5) halfLeave += 1;
    if (lc === 1) fullLeave += 1;
  }

  // Naive "days that look like leave" weight: HD/P/* = 0.5, full leave = 1, ignore WO-zeroed
  let naiveLeaveIfCountAllCells = 0;
  for (const m of leaveMarks) {
    if (m.mark === "HD" || isRegisterCompositeHalfDayMark(m.mark) || /^P\//i.test(m.mark)) naiveLeaveIfCountAllCells += 0.5;
    else if (m.mark === "LWP" || /^(PL|CL|SL|SPLA|SPLB|SBEL|SPLM|PTL|ML)$/i.test(m.mark)) naiveLeaveIfCountAllCells += 1;
    else if (/^LWP\//i.test(m.mark)) naiveLeaveIfCountAllCells += 0.5;
  }

  return {
    empCode: row.empCode,
    name: row.employeeName,
    department: row.department,
    summary: row.summary,
    leaveCredit: Math.round(leaveCredit * 10) / 10,
    leaveCells,
    leaveZeroedOnWo,
    halfLeave,
    fullLeave,
    naiveLeaveIfCountAllCells: Math.round(naiveLeaveIfCountAllCells * 10) / 10,
    leaveUnderBy: Math.round((naiveLeaveIfCountAllCells - leaveCredit) * 10) / 10,
    leaveMarks,
    days,
  };
}

const target =
  withSummary.find((r) => normalizeAttendanceEmpCode(r.empCode) === TARGET) ||
  withSummary.find((r) => String(r.employeeName || "").toLowerCase().includes("ankur"));

if (!target) {
  console.error(
    "Target not found. Sample names:",
    withSummary
      .filter((r) => /ankur|6956/i.test(`${r.empCode} ${r.employeeName}`))
      .map((r) => `${r.empCode} ${r.employeeName}`)
  );
  process.exit(1);
}

const targetAnalysis = analyzeRow(target);
console.log("=== TARGET ===");
console.log(JSON.stringify(targetAnalysis, null, 2));

// Scan all: leave undercount when WO-zeroing or similar makes displayed leave < naive leave weight
const all = withSummary.map(analyzeRow);
const undercounted = all
  .filter((a) => a.leaveUnderBy >= 0.5 || a.leaveZeroedOnWo > 0)
  .sort((a, b) => b.leaveUnderBy - a.leaveUnderBy);

const report = {
  month: MONTH,
  target: targetAnalysis,
  undercountedLeave: undercounted.map((a) => ({
    empCode: a.empCode,
    name: a.name,
    department: a.department,
    summaryLeave: a.summary?.leave,
    naiveLeave: a.naiveLeaveIfCountAllCells,
    creditedLeave: a.leaveCredit,
    underBy: a.leaveUnderBy,
    zeroedOnWoDays: a.leaveZeroedOnWo,
    totalPresent: a.summary?.totalPresent,
    leaveMarks: a.leaveMarks,
  })),
};

writeFileSync(resolve(process.cwd(), "tmp_audit_6956_leave_report.json"), JSON.stringify(report, null, 2));
console.log("\n=== UNDERCOUNTED LEAVE (≥0.5 or WO-zeroed) ===");
console.log(
  JSON.stringify(
    {
      count: undercounted.length,
      top: report.undercountedLeave.slice(0, 40),
    },
    null,
    2
  )
);
