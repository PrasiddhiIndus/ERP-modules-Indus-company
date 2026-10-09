/**
 * LWP days shown on the salary slip: full LWP = 1 day, LWP/PL | LWP/SL | LWP/CL = 0.5 day.
 */
import {
  ATTENDANCE_REGISTER_TABLE,
  attendanceEmpCodeLookupVariants,
} from "./attendanceDaily";

export function lwpDaysFromMarks(marks) {
  let total = 0;
  for (const raw of marks || []) {
    const m = String(raw ?? "").trim().toUpperCase();
    if (m === "LWP") total += 1;
    else if (/^LWP\/(PL|SL|CL)$/.test(m)) total += 0.5;
  }
  return total;
}

/** LWP days for the slip's employee and pay month from the attendance register (0 when none / unavailable). */
export async function fetchLwpDaysForSlip(supabase, slip) {
  const monthKey = String(slip?.month_key || "").slice(0, 7);
  const codes = attendanceEmpCodeLookupVariants(slip?.employee_code);
  if (!/^\d{4}-\d{2}$/.test(monthKey) || !codes.length) return 0;
  const [y, m] = monthKey.split("-").map(Number);
  const to = `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from(ATTENDANCE_REGISTER_TABLE)
    .select("register_date,mark")
    .in("employee_code", codes)
    .gte("register_date", `${monthKey}-01`)
    .lte("register_date", to);
  if (error) {
    console.warn("Payslip: LWP days unavailable", error);
    return 0;
  }
  const byDate = new Map();
  for (const r of data || []) byDate.set(String(r.register_date).slice(0, 10), r.mark);
  return lwpDaysFromMarks([...byDate.values()]);
}
