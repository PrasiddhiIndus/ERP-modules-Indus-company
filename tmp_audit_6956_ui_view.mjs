/**
 * Read-only: rebuild Oct 2026 register the way Daily Register UI does (leave overlay + summaries)
 * for 6956 and anyone else where sandwich leave on WO is under-counted in Leave column.
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
  fetchRegisterMarkRowsInRange,
  fetchApprovedLeaveMarksForMonth,
  fetchApprovedTourMarksForMonth,
  buildRegisterMonthViewFromPrefetched,
  mergeApprovedLeaveMarksIntoManualMarks,
  finalizeRegisterMarksAndRemarks,
  buildMonthlyRegisterGrid,
  attachRegisterRowSummaries,
  monthDateRange,
  normalizeAttendanceEmpCode,
  registerSummaryLeaveCreditForCell,
  registerPresentDaySummaryCreditForCell,
  isWeeklyOffDate,
  isRegisterNhphMark,
  fetchMasterRegisterCodeMap,
} = await import("./src/lib/attendanceDaily.js");
const { fetchNationalPublicHolidayDatesInRange } = await import("./src/lib/nationalPublicHolidays.js");
const { ensureAttendanceRulesLoaded } = await import("./src/lib/attendanceRules.js");

const MONTH = "2026-10";
const meta = monthDateRange(MONTH);
await ensureAttendanceRulesLoaded(supabase);

const [punches, employees, monthRegisterRows, masterCodeMap, holidays] = await Promise.all([
  fetchAttendancePunchesInRange(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchActiveEmployees(supabase),
  fetchRegisterMarkRowsInRange(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchMasterRegisterCodeMap(supabase),
  fetchNationalPublicHolidayDatesInRange(supabase, meta.fromDate, meta.toDate),
]);
const holidaySet = new Set(holidays || []);

const [approvedLeaveMarks, approvedTourData] = await Promise.all([
  fetchApprovedLeaveMarksForMonth(supabase, meta.fromDate, meta.toDate, { punches }),
  fetchApprovedTourMarksForMonth(supabase, meta.fromDate, meta.toDate),
]);

const registerData = buildRegisterMonthViewFromPrefetched(meta, monthRegisterRows, masterCodeMap);
const afterLeave = mergeApprovedLeaveMarksIntoManualMarks(registerData?.marks || {}, approvedLeaveMarks, {
  punches,
  monthKey: meta.monthKey,
  registerRows: monthRegisterRows,
  masterCodeMap,
});
const merged = finalizeRegisterMarksAndRemarks({
  marks: afterLeave,
  remarks: registerData?.remarks || {},
  tourData: approvedTourData,
  registerRows: monthRegisterRows,
  masterCodeMap,
  punches,
  monthKey: meta.monthKey,
});

const { rows, daysInMonth } = buildMonthlyRegisterGrid(punches, employees, {
  year: meta.year,
  month: meta.month,
  manualMarks: merged.marks || {},
});
const withSummary = attachRegisterRowSummaries(rows, merged.marks || {}, daysInMonth, {
  year: meta.year,
  month: meta.month,
  holidayDates: holidaySet,
});

function leaveWeightIfAllCounted(mark) {
  const m = String(mark || "").trim();
  if (!m) return 0;
  if (m === "HD" || /^P\//i.test(m) || /^LWP\//i.test(m)) return 0.5;
  if (/^(PL|CL|SL|LWP|SPLA|SPLB|SBEL|SPLM|PTL|ML)$/i.test(m)) return 1;
  return 0;
}

const cases = [];
for (const row of withSummary) {
  let naive = 0;
  let credited = 0;
  let sandwichOnOff = [];
  const leaveDays = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const mark = row.dayMarks[day] || "";
    const ctx = { year: meta.year, month: meta.month, day, department: row.department, employeeCode: row.empCode };
    const w = leaveWeightIfAllCounted(mark);
    const c = registerSummaryLeaveCreditForCell(mark, ctx);
    const iso = `${MONTH}-${String(day).padStart(2, "0")}`;
    const off = isWeeklyOffDate(iso, row.department, row.empCode) || isRegisterNhphMark(mark);
    if (w > 0) {
      naive += w;
      leaveDays.push({
        day,
        mark,
        weight: w,
        credited: c,
        present: registerPresentDaySummaryCreditForCell(mark, ctx),
        offDay: off,
      });
      if (w > 0 && c === 0 && off) sandwichOnOff.push({ day, mark, weight: w });
    }
    credited += c;
  }
  const underBy = Math.round((naive - credited) * 10) / 10;
  if (underBy >= 0.5 || normalizeAttendanceEmpCode(row.empCode) === "6956") {
    cases.push({
      empCode: row.empCode,
      name: row.employeeName,
      department: row.department,
      summaryLeave: row.summary?.leave,
      summaryPresent: row.summary?.totalPresent,
      naiveLeaveWeight: Math.round(naive * 10) / 10,
      creditedLeave: Math.round(credited * 10) / 10,
      underBy,
      sandwichOnOff,
      leaveDays,
    });
  }
}

cases.sort((a, b) => b.underBy - a.underBy);
const target = cases.find((c) => c.empCode === "6956");
const report = {
  month: MONTH,
  target,
  undercountCount: cases.filter((c) => c.underBy >= 0.5).length,
  undercounted: cases.filter((c) => c.underBy >= 0.5),
};
writeFileSync(resolve(process.cwd(), "tmp_audit_6956_ui_view_report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ target, undercountCount: report.undercountCount, top: report.undercounted.slice(0, 30) }, null, 2));
