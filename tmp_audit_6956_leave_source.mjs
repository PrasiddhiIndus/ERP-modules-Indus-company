/**
 * Read-only: approved leave + sandwich for emp 6956 Oct 2026 vs register marks.
 */
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
  fetchApprovedLeaveMarksForMonth,
  fetchRegisterMarkRowsInRange,
  monthDateRange,
  normalizeAttendanceEmpCode,
} = await import("./src/lib/attendanceDaily.js");
const { ensureAttendanceRulesLoaded } = await import("./src/lib/attendanceRules.js");

const MONTH = "2026-10";
const CODE = "6956";
const meta = monthDateRange(MONTH);
await ensureAttendanceRulesLoaded(supabase);

const punches = await fetchAttendancePunchesInRange(supabase, {
  fromDate: meta.fromDate,
  toDate: meta.toDate,
  empCode: CODE,
});
const registerRows = await fetchRegisterMarkRowsInRange(supabase, {
  fromDate: meta.fromDate,
  toDate: meta.toDate,
});
const leaveMarks = await fetchApprovedLeaveMarksForMonth(supabase, meta.fromDate, meta.toDate, {
  punches,
});

const codeMarks = leaveMarks[CODE] || leaveMarks[normalizeAttendanceEmpCode(CODE)] || {};
const dbRows = (registerRows || []).filter(
  (r) => normalizeAttendanceEmpCode(r.employee_code) === CODE
);

console.log(
  JSON.stringify(
    {
      approvedLeaveOverlayByDay: codeMarks,
      registerDbRows: dbRows
        .map((r) => ({
          date: r.register_date,
          mark: r.mark,
          source: r.mark_source,
          remark: r.mark_remark,
        }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date))),
      punches: punches.map((p) => ({ date: p.punchDate, time: p.punchTime })),
    },
    null,
    2
  )
);

// Also query leave requests tables directly if present
for (const table of ["admin_leave_requests", "leave_requests"]) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .or(`employee_code.eq.${CODE},emp_code.eq.${CODE}`)
    .limit(20);
  if (error) {
    console.error(table, error.message);
    continue;
  }
  const oct = (data || []).filter((r) => {
    const from = String(r.from_date || r.start_date || "");
    const to = String(r.to_date || r.end_date || "");
    return from.slice(0, 7) <= MONTH && to.slice(0, 7) >= MONTH;
  });
  console.log(table, "oct-ish count", oct.length);
  console.log(
    JSON.stringify(
      oct.map((r) => ({
        id: r.id,
        status: r.status,
        type: r.leave_type || r.type,
        from: r.from_date || r.start_date,
        to: r.to_date || r.end_date,
        days: r.days || r.total_days || r.leave_days,
        half: r.half_day || r.is_half_day,
      })),
      null,
      2
    )
  );
}
