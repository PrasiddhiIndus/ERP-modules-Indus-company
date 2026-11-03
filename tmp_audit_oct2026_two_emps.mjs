/** Detail day marks for the two register-vs-salary formula diffs. Read-only. */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
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
  monthDateRange,
  registerPresentDaySummaryCreditForCell,
  isWeeklyOffDate,
} = await import("./src/lib/attendanceDaily.js");
const { fetchNationalPublicHolidayDatesInRange } = await import("./src/lib/nationalPublicHolidays.js");
const { ensureAttendanceRulesLoaded, isAutoHolidayFor } = await import("./src/lib/attendanceRules.js");
const { salaryPresentDaysFromDayMarks } = await import(
  "./src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js"
);

const MONTH = "2026-10";
const CODES = new Set(["A-00004", "N-00010"]);
const meta = monthDateRange(MONTH);
await ensureAttendanceRulesLoaded(supabase);
const [punches, employees, manualPack, holidays] = await Promise.all([
  fetchAttendancePunchesInRange(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchActiveEmployees(supabase),
  fetchRegisterMarksForMonth(supabase, { fromDate: meta.fromDate, toDate: meta.toDate }),
  fetchNationalPublicHolidayDatesInRange(supabase, meta.fromDate, meta.toDate),
]);
const holidaySet = new Set(holidays || []);
const emps = employees.filter((e) => CODES.has(String(e.empCode)));
const { rows, daysInMonth } = buildMonthlyRegisterGrid(punches, emps, {
  year: meta.year,
  month: meta.month,
  manualMarks: manualPack.marks || {},
  markSources: manualPack.markSources || null,
});

for (const row of rows) {
  const days = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const mark = row.dayMarks[day] || "";
    const iso = `${MONTH}-${String(day).padStart(2, "0")}`;
    const dow = new Date(meta.year, meta.month - 1, day).getDay();
    const isSun = dow === 0;
    const isSat = dow === 6;
    const wo = isWeeklyOffDate(iso, row.department, row.empCode);
    const hol = holidaySet.has(iso) && isAutoHolidayFor(iso, { employeeCode: row.empCode, department: row.department });
    let presentMark = mark;
    if (["P", "P(OD)", "T", "HD"].includes(mark)) {
      if (hol) presentMark = "NH/PH";
      else if (wo) presentMark = "WO";
    }
    const ctx = { year: meta.year, month: meta.month, day, department: row.department, employeeCode: row.empCode };
    const regCredit = registerPresentDaySummaryCreditForCell(presentMark, ctx);
    const salaryCtx = { year: meta.year, month: meta.month, day, department: row.department };
    const salaryCredit = isSun ? 0 : registerPresentDaySummaryCreditForCell(mark, salaryCtx);
    days.push({
      day,
      iso,
      dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow],
      mark: mark || "(blank)",
      presentMark,
      regCredit,
      salaryCredit,
      isWeeklyOff: wo,
      isHoliday: hol,
    });
  }
  const sumReg = days.reduce((s, d) => s + d.regCredit, 0);
  const sumSalDays = days.reduce((s, d) => s + d.salaryCredit, 0);
  const salaryPDays = salaryPresentDaysFromDayMarks(row.dayMarks, meta.year, meta.month, row.department);
  console.log(
    JSON.stringify(
      {
        empCode: row.empCode,
        name: row.employeeName,
        department: row.department,
        sumReg,
        sumSalDays,
        salaryPDays,
        sundayCreditsInRegister: days.filter((d) => d.dow === "Sun" && d.regCredit > 0),
        whereCreditsDiffer: days.filter((d) => d.regCredit !== d.salaryCredit),
        allDays: days.map((d) => ({
          day: d.day,
          dow: d.dow,
          mark: d.mark,
          presentMark: d.presentMark,
          reg: d.regCredit,
          sal: d.salaryCredit,
        })),
      },
      null,
      2
    )
  );
}
