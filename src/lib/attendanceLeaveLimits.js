/**
 * Annual leave limits and day fractions for the daily attendance register.
 */

import {
  isRegisterNhphMark,
  normalizeAttendanceEmpCode,
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

/** Marks that consume fractional day against leave balance / annual limits. */
export const REGISTER_MARK_DAY_FRACTION = {
  HD: 0.5,
  SPLA: 0.5,
  SPLB: 0.5,
  "P/SL": 0.5,
  "P/CL": 0.5,
  "P/PL": 0.5,
  "LWP/PL": 0.5,
  "LWP/SL": 0.5,
  "LWP/CL": 0.5,
};

export const LEAVE_LIMIT_ALERTS_STORAGE_KEY = "adminAttendance.leaveLimitSeen";

/** Leave units for balance checks and annual limits (0 if mark has no annual limit). */
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
  if (m === "P/SL" || m === "LWP/SL") return "SL";
  if (m === "P/CL" || m === "LWP/CL") return "CL";
  if (m === "P/PL" || m === "LWP/PL") return "PL";
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
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const mark = row.mark;
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
  const code = normalizeAttendanceEmpCode(empCode);
  const date = String(registerDate || "").slice(0, 10);
  const filtered = (yearRows || []).filter(
    (r) =>
      normalizeAttendanceEmpCode(r.employee_code) !== code ||
      String(r.register_date || "").slice(0, 10) !== date
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

const PL_CL_SL_CONSECUTIVE_MAX_BRIDGE_DAYS = 14;

function addCalendarDays(isoDate, delta) {
  const d = new Date(`${String(isoDate || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** PL / CL / SL family for consecutive-leave rule (includes P/ and LWP/ composites). */
export function registerMarkPlClSlType(mark) {
  const m = normalizeRegisterMarkForDb(mark);
  if (!m) return null;
  if (m === "PL" || m === "P/PL" || m === "LWP/PL") return "PL";
  if (m === "CL" || m === "P/CL" || m === "LWP/CL") return "CL";
  if (m === "SL" || m === "P/SL" || m === "LWP/SL") return "SL";
  return null;
}

/** WO and NH/PH marks bridge PL/CL/SL sequences without breaking them. */
export function registerMarkIsLeaveBridge(mark) {
  const m = normalizeRegisterMarkForDb(mark);
  if (!m) return false;
  return m === "WO" || isRegisterNhphMark(m);
}

function buildRegisterMarksByDateForEmployee(registerRows, employeeCode, excludeDate = null) {
  const code = normalizeAttendanceEmpCode(employeeCode);
  const byDate = new Map();
  for (const row of registerRows || []) {
    if (normalizeAttendanceEmpCode(row.employee_code) !== code) continue;
    const date = String(row.register_date || "").slice(0, 10);
    if (!date || date === excludeDate) continue;
    const mk = normalizeRegisterMarkForDb(row.mark);
    if (mk) byDate.set(date, mk);
  }
  return byDate;
}

function neighborPlClSlType(marksByDate, fromDate, direction) {
  const step = direction < 0 ? -1 : 1;
  let cursor = addCalendarDays(fromDate, step);
  for (let guard = 0; guard < PL_CL_SL_CONSECUTIVE_MAX_BRIDGE_DAYS; guard += 1) {
    const mark = marksByDate.get(cursor);
    if (!mark) return null;
    const type = registerMarkPlClSlType(mark);
    if (type) return type;
    if (registerMarkIsLeaveBridge(mark)) {
      cursor = addCalendarDays(cursor, step);
      continue;
    }
    return null;
  }
  return null;
}

function validatePlClSlOnMarksByDate(marksByDate, registerDate, mark) {
  const date = String(registerDate || "").slice(0, 10);
  const newType = registerMarkPlClSlType(mark);
  if (!newType || !date) return { ok: true };

  const prevType = neighborPlClSlType(marksByDate, date, -1);
  if (prevType && prevType !== newType) {
    return {
      ok: false,
      message:
        `Cannot combine different leave types on consecutive days: ${newType} next to existing ${prevType}. ` +
        "Use the same leave type or leave a gap.",
    };
  }

  const nextType = neighborPlClSlType(marksByDate, date, 1);
  if (nextType && nextType !== newType) {
    return {
      ok: false,
      message:
        `Cannot combine different leave types on consecutive days: ${newType} next to existing ${nextType}. ` +
        "Use the same leave type or leave a gap.",
    };
  }

  return { ok: true };
}

/**
 * Block mixing PL / CL / SL across calendar-adjacent days (WO / NH/PH bridge only).
 * Mirrors public.admin_attendance_neighbor_pl_cl_sl_type on the server.
 */
export function validatePlClSlConsecutiveMark(
  yearRowsForEmp,
  registerDate,
  mark,
  { employeeCode = "" } = {}
) {
  const date = String(registerDate || "").slice(0, 10);
  const marksByDate = buildRegisterMarksByDateForEmployee(yearRowsForEmp, employeeCode, date);
  return validatePlClSlOnMarksByDate(marksByDate, date, mark);
}

/** Validate a batch of register upserts (bulk mark) in date order per employee. */
export function validatePlClSlMarksForUpserts(registerRows, upserts) {
  const pending = [...(upserts || [])].sort((a, b) => {
    const codeCmp = String(a.employee_code || "").localeCompare(String(b.employee_code || ""));
    if (codeCmp !== 0) return codeCmp;
    return String(a.register_date || "").localeCompare(String(b.register_date || ""));
  });

  const failures = [];
  const stagedByEmp = new Map();

  for (const row of pending) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const date = String(row.register_date || "").slice(0, 10);
    const mark = row.mark;
    if (!code || !date) continue;

    if (!stagedByEmp.has(code)) {
      stagedByEmp.set(code, buildRegisterMarksByDateForEmployee(registerRows, code));
    }
    const marksByDate = stagedByEmp.get(code);
    marksByDate.delete(date);

    const check = validatePlClSlOnMarksByDate(marksByDate, date, mark);
    if (!check.ok) {
      failures.push({ employeeCode: code, registerDate: date, message: check.message });
      continue;
    }

    const normalized = normalizeRegisterMarkForDb(mark);
    if (normalized) marksByDate.set(date, normalized);
  }

  return failures;
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

/** Unused balance columns for register leave types. */
export const LEAVE_BALANCE_UNUSED_FIELDS = {
  PL: "unused_pl",
  CL: "unused_cl",
  SL: "unused_sl",
  SBEL: "unused_sbel",
  SPLA: "unused_spla",
  SPLB: "unused_splb",
  SPLM: "unused_splm",
};

const LEAVE_BALANCE_SUGGEST_ORDER = ["PL", "CL", "SL", "SPLA", "SPLB", "SBEL", "SPLM"];

function unusedLeaveBalance(balanceRow, leaveType) {
  const field = LEAVE_BALANCE_UNUSED_FIELDS[leaveType];
  if (!field) return null;
  if (!balanceRow) return 0;
  const n = Number(balanceRow[field]);
  return Number.isFinite(n) ? n : 0;
}

function formatBalanceDays(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Warn when marking a leave type the employee cannot cover from yearly unused balance.
 * Suggests other available leave types, or LWP when none remain.
 * @returns {string|null} user-facing message, or null when balance is sufficient / not applicable
 */
export function buildInsufficientLeaveBalanceMessage({
  employeeName,
  empCode,
  mark,
  balanceRow,
} = {}) {
  const leaveType = leaveLimitTypeForMark(mark);
  if (!leaveType || !LEAVE_BALANCE_UNUSED_FIELDS[leaveType]) return null;

  const needed = leaveDayFraction(mark);
  if (needed <= 0) return null;

  const availableForType = unusedLeaveBalance(balanceRow, leaveType);
  if (availableForType >= needed) return null;

  const who = employeeName
    ? `${employeeName}${empCode ? ` (${empCode})` : ""}`
    : empCode || "This employee";

  const alternatives = [];
  for (const type of LEAVE_BALANCE_SUGGEST_ORDER) {
    if (type === leaveType) continue;
    const bal = unusedLeaveBalance(balanceRow, type);
    if (bal > 0) alternatives.push(`${type} (${formatBalanceDays(bal)})`);
  }

  if (alternatives.length) {
    return `${who} is not having ${leaveType} leave balance. Kindly use ${alternatives.join(", ")}.`;
  }
  return `${who} is not having ${leaveType} leave balance (or any other leave balance). Kindly use LWP.`;
}

export function indexLeaveBalancesByEmployeeCode(rows) {
  const byCode = {};
  for (const row of rows || []) {
    const code = String(row.employee_code || "").trim();
    if (!code) continue;
    byCode[code] = row;
    const upper = code.toUpperCase();
    if (!byCode[upper]) byCode[upper] = row;
  }
  return byCode;
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
