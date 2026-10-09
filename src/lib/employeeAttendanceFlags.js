/**
 * Employee Master "Has weekly off" / "Earns C/O" / "C/O expires" / "Has NH/PH".
 * Stored as employee-level Rules Console values (wo.pattern, co.earn, co.expiry_mode, wo.auto_holiday),
 * so the attendance register and the C/O engine read them with the department / company rules.
 */
import { ensureAttendanceRulesLoaded } from "./attendanceRules";

export const DEFAULT_ATTENDANCE_FLAGS = Object.freeze({
  has_weekly_off: true,
  earns_co: true,
  co_expires: true,
  has_holidays: true,
});

export const ATTENDANCE_FLAG_KEYS = Object.freeze(["has_weekly_off", "earns_co", "co_expires", "has_holidays"]);

function normalizeFlags(raw) {
  const out = { ...DEFAULT_ATTENDANCE_FLAGS };
  for (const key of ATTENDANCE_FLAG_KEYS) {
    if (typeof raw?.[key] === "boolean") out[key] = raw[key];
  }
  return out;
}

function friendlyError(error) {
  const msg = String(error?.message || "");
  if (error?.code === "PGRST202" || /could not find the function/i.test(msg)) {
    return "Attendance settings are not set up on this server yet. Ask IT to apply the latest database update.";
  }
  if (error?.code === "42501") return "Your account cannot change attendance settings for employees.";
  if (error?.code === "22023" && msg) return msg;
  return "Could not save attendance settings. Please try again.";
}

/** Flags in force today, or null when the server does not support them yet. */
export async function fetchEmployeeAttendanceFlags(supabase, employeeCode) {
  const code = String(employeeCode || "").trim();
  if (!code) return { ...DEFAULT_ATTENDANCE_FLAGS };
  const { data, error } = await supabase.rpc("admin_employee_attendance_flags", { p_employee_code: code });
  if (error) {
    console.warn("[attendance-flags] load failed:", error.message || error);
    return null;
  }
  return normalizeFlags(data);
}

export function attendanceFlagsChanged(before, after) {
  return ATTENDANCE_FLAG_KEYS.some((key) => Boolean(before?.[key]) !== Boolean(after?.[key]));
}

/** Saves only the flags that differ from `before`. Throws a user-friendly Error. */
export async function saveEmployeeAttendanceFlags(supabase, employeeCode, before, after) {
  const changed = (key) => (Boolean(before?.[key]) !== Boolean(after?.[key]) ? Boolean(after[key]) : null);
  const params = {
    p_employee_code: String(employeeCode || "").trim(),
    p_has_weekly_off: changed("has_weekly_off"),
    p_earns_co: changed("earns_co"),
    p_has_holidays: changed("has_holidays"),
  };
  // Sent only when changed so servers without the C/O expiry update still save the other three.
  if (changed("co_expires") !== null) params.p_co_expires = changed("co_expires");
  const { data, error } = await supabase.rpc("admin_employee_attendance_flags_save", params);
  if (error) {
    console.error("[attendance-flags] save failed:", error);
    throw new Error(friendlyError(error));
  }
  await ensureAttendanceRulesLoaded(supabase, { force: true });
  return normalizeFlags(data);
}
