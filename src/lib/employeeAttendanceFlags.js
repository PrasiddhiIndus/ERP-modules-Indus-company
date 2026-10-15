/**
 * Employee Master "Sunday off" / "3rd Saturday off" / "Earns C/O" / "C/O expires" / "Has NH/PH".
 * Stored as employee-level Rules Console values (wo.pattern, co.earn, co.expiry_mode, wo.auto_holiday),
 * so the attendance register and the C/O engine read them with the department / company rules.
 */
import { ensureAttendanceRulesLoaded } from "./attendanceRules";

export const DEFAULT_ATTENDANCE_FLAGS = Object.freeze({
  sunday_off: true,
  third_saturday_off: true,
  earns_co: true,
  co_expires: true,
  has_holidays: true,
});

export const ATTENDANCE_FLAG_KEYS = Object.freeze([
  "sunday_off",
  "third_saturday_off",
  "earns_co",
  "co_expires",
  "has_holidays",
]);

const WEEKLY_OFF_KEYS = ["sunday_off", "third_saturday_off"];

function normalizeFlags(raw) {
  const out = { ...DEFAULT_ATTENDANCE_FLAGS };
  // Servers without the Sunday / 3rd Saturday split only report has_weekly_off.
  if (typeof raw?.has_weekly_off === "boolean") {
    out.sunday_off = raw.has_weekly_off;
    out.third_saturday_off = raw.has_weekly_off;
  }
  for (const key of ATTENDANCE_FLAG_KEYS) {
    if (typeof raw?.[key] === "boolean") out[key] = raw[key];
  }
  return out;
}

/** wo.pattern value for the two weekly-off checkboxes. */
export function weeklyOffPatternFor(flags) {
  const sunday = Boolean(flags?.sunday_off);
  const thirdSaturday = Boolean(flags?.third_saturday_off);
  if (sunday && thirdSaturday) return "sun_3rd_sat";
  if (sunday) return "sun_only";
  if (thirdSaturday) return "third_sat_only";
  return "none";
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

/** Saves only the settings that differ from `before`. Throws a user-friendly Error. */
export async function saveEmployeeAttendanceFlags(supabase, employeeCode, before, after) {
  const changed = (key) => (Boolean(before?.[key]) !== Boolean(after?.[key]) ? Boolean(after[key]) : null);
  const params = {
    p_employee_code: String(employeeCode || "").trim(),
    p_earns_co: changed("earns_co"),
    p_has_holidays: changed("has_holidays"),
  };
  if (WEEKLY_OFF_KEYS.some((key) => changed(key) !== null)) {
    params.p_weekly_off_pattern = weeklyOffPatternFor(after);
  }
  // Sent only when changed so servers without the C/O expiry update still save the others.
  if (changed("co_expires") !== null) params.p_co_expires = changed("co_expires");
  const { data, error } = await supabase.rpc("admin_employee_attendance_flags_save", params);
  if (error) {
    console.error("[attendance-flags] save failed:", error);
    throw new Error(friendlyError(error));
  }
  await ensureAttendanceRulesLoaded(supabase, { force: true });
  return normalizeFlags(data);
}
