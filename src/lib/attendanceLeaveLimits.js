/**
 * Annual leave limits and day fractions for the daily attendance register.
 */

import {
  isRegisterNhphMark,
  normalizeRegisterMarkForDb,
  registerPresentDayCredit,
} from "./attendanceDaily";

export { registerPresentDayCredit, isRegisterEffectivePresentMark } from "./attendanceDaily";

/** Annual entitlement (calendar year). ML and CO have no fixed cap here. */
export const REGISTER_LEAVE_ANNUAL_LIMITS = {
  PL: 18,
  CL: 8,
  SL: 8,
  SBEL: 2,
  SPLA: 5,
  SPLB: 5,
  SPLM: 3,
};

/** Marks that consume 0.5 day against their leave type quota. */
export const REGISTER_MARK_DAY_FRACTION = {
  HD: 0.5,
  SPLA: 0.5,
  SPLB: 0.5,
  "P/SL": 0.5,
  "P/CL": 0.5,
  "P/PL": 0.5,
};

export const LEAVE_LIMIT_ALERTS_STORAGE_KEY = "adminAttendance.leaveLimitSeen";

/** Leave units for limit checks (0 if mark has no annual limit). */
export function leaveDayFraction(mark) {
  const m = normalizeRegisterMarkForDb(mark);
  if (!m) return 0;
  if (m === "PTL") return -3;
  if (REGISTER_MARK_DAY_FRACTION[m] != null) return REGISTER_MARK_DAY_FRACTION[m];
  if (REGISTER_LEAVE_ANNUAL_LIMITS[m] != null) return 1;
  return 0;
}

export function leaveLimitTypeForMark(mark) {
  const m = normalizeRegisterMarkForDb(mark);
  // PTL is a credit applied against PL usage (prompt: PTL = -3).
  if (m === "PTL") return "PL";
  if (m === "P/SL") return "SL";
  if (m === "P/CL") return "CL";
  if (m === "P/PL") return "PL";
  if (m && REGISTER_LEAVE_ANNUAL_LIMITS[m] != null) return m;
  return null;
}

export function hasLeaveAnnualLimit(mark) {
  return leaveLimitTypeForMark(mark) != null;
}

/**
 * Sum leave usage per limit type from register DB rows for one employee or all.
 * @param {Array<{ employee_code?: string, register_date?: string, mark?: string }>} rows
 * @returns {Record<string, Record<string, number>>} empCode -> { PL: n, … }
 */
export function aggregateLeaveUsageByEmployee(rows) {
  const byEmp = {};
  for (const row of rows || []) {
    const code = String(row.employee_code || "").trim();
    const mark = normalizeRegisterMarkForDb(row.mark);
    const limitType = leaveLimitTypeForMark(mark);
    if (!code || !limitType) continue;
    const frac = leaveDayFraction(mark);
    if (frac === 0) continue;
    if (!byEmp[code]) byEmp[code] = {};
    byEmp[code][limitType] = (byEmp[code][limitType] || 0) + frac;
  }
  return byEmp;
}

/** Per-type usage for one employee's dayMarks across months (values are mark codes). */
export function aggregateLeaveUsageFromDayMarks(dayMarksByDay) {
  const usage = {};
  for (const mark of Object.values(dayMarksByDay || {})) {
    const limitType = leaveLimitTypeForMark(mark);
    if (!limitType) continue;
    const frac = leaveDayFraction(mark);
    if (frac === 0) continue;
    usage[limitType] = (usage[limitType] || 0) + frac;
  }
  return usage;
}

export function getLeaveLimitExceeded(usage, leaveType) {
  const limit = REGISTER_LEAVE_ANNUAL_LIMITS[leaveType];
  if (limit == null) return null;
  const used = Number(usage[leaveType] || 0);
  if (used <= limit) return null;
  return { leaveType, used, limit, overBy: used - limit };
}

export function findAllLeaveLimitExceeded(usage) {
  const out = [];
  for (const leaveType of Object.keys(REGISTER_LEAVE_ANNUAL_LIMITS)) {
    const hit = getLeaveLimitExceeded(usage, leaveType);
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * Usage for one employee after applying/replacing a mark on one day.
 */
export function projectLeaveUsageAfterMark(yearRows, empCode, registerDate, newMark, oldMark = null) {
  const code = String(empCode || "").trim();
  const date = String(registerDate || "").slice(0, 10);
  const filtered = (yearRows || []).filter(
    (r) => String(r.employee_code || "").trim() !== code || String(r.register_date || "").slice(0, 10) !== date
  );
  if (newMark) {
    filtered.push({ employee_code: code, register_date: date, mark: newMark });
  }
  return aggregateLeaveUsageByEmployee(filtered)[code] || {};
}

/**
 * CO: compensatory off on a working day — counts as present.
 * Requires prior holiday work in the same year (P/P(OD) on an NH/PH-marked day, or P from punch on a holiday).
 */
/** Calendar dates marked NH/PH anywhere in the register (shared holiday set). */
export function collectRegisterHolidayDates(registerRows, year) {
  const dates = new Set();
  for (const row of registerRows || []) {
    const d = String(row.register_date || "").slice(0, 10);
    if (!d.startsWith(String(year))) continue;
    if (isRegisterNhphMark(normalizeRegisterMarkForDb(row.mark))) dates.add(d);
  }
  return dates;
}

/**
 * CO: compensatory off on a working day — counts as present.
 * Expects holiday dates derived from register NH/PH marks (see collectRegisterHolidayDates).
 */
export function validateCoMark(
  yearRowsForEmp,
  registerDate,
  mark,
  { dayMarkOnDate = "", holidayDates = null } = {}
) {
  const m = normalizeRegisterMarkForDb(mark);
  if (m !== "CO") return { ok: true };
  const date = String(registerDate || "").slice(0, 10);
  const year = date.slice(0, 4);
  const onDay = normalizeRegisterMarkForDb(dayMarkOnDate);

  if (isRegisterNhphMark(onDay) || onDay === "WO") {
    return {
      ok: false,
      message: "CO applies on working days only (not NH/PH or weekoff).",
    };
  }

  const holidays = holidayDates || collectRegisterHolidayDates(yearRowsForEmp, year);
  const hasHolidayWork = (yearRowsForEmp || []).some((row) => {
    const d = String(row.register_date || "").slice(0, 10);
    if (!d.startsWith(year) || d === date) return false;
    const mk = normalizeRegisterMarkForDb(row.mark);
    return (mk === "P" || mk === "P(OD)") && holidays.has(d);
  });

  if (!hasHolidayWork) {
    return {
      ok: false,
      warnOnly: true,
      message:
        "CO is usually granted after working on an NH/PH. No P/P(OD) on a register holiday date found this year — verify before saving.",
    };
  }

  return { ok: true };
}

export function buildLeaveLimitNotifications({
  registerRows,
  employeeNameByCode = {},
  year = new Date().getFullYear(),
}) {
  const usageByEmp = aggregateLeaveUsageByEmployee(registerRows);
  const notifications = [];

  for (const [empCode, usage] of Object.entries(usageByEmp)) {
    const exceeded = findAllLeaveLimitExceeded(usage);
    const name = employeeNameByCode[empCode] || empCode;
    for (const { leaveType, used, limit, overBy } of exceeded) {
      notifications.push({
        key: `leave-limit:${year}:${empCode}:${leaveType}`,
        at: new Date().toISOString(),
        severity: "high",
        title: `${leaveType} limit exceeded`,
        message: `${name} (${empCode}): ${formatLeaveUsage(used, limit)} used in ${year} (${overBy.toFixed(1)} over)`,
        route: "/app/admin/employee/attendance-daily",
        empCode,
        leaveType,
        used,
        limit,
      });
    }
  }

  return notifications.sort((a, b) => a.empCode.localeCompare(b.empCode));
}

export function formatLeaveUsage(used, limit) {
  const u = Number(used);
  const l = limit == null ? "—" : Number(limit);
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `${fmt(u)} / ${l == null ? "—" : fmt(l)}`;
}

export function leaveFractionLabel(mark) {
  const f = leaveDayFraction(mark);
  if (f === 0.5) return "0.5 day";
  if (f === 1) return "1 day";
  return null;
}

export function dispatchLeaveLimitAlertsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("attendance-leave-limit-changed"));
  }
}

export function readLeaveLimitSeen(userId) {
  try {
    const raw = localStorage.getItem(`${LEAVE_LIMIT_ALERTS_STORAGE_KEY}:${userId || "anon"}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function writeLeaveLimitSeen(userId, keys) {
  try {
    localStorage.setItem(
      `${LEAVE_LIMIT_ALERTS_STORAGE_KEY}:${userId || "anon"}`,
      JSON.stringify([...keys])
    );
  } catch {
    /* ignore */
  }
}
