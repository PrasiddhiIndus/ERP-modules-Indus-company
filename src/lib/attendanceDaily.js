/** Daily attendance register — pair raw punches into per-employee per-day rows. */

import { formatDateDdMmYyyy } from "../utils/dateDisplay";

import {
  filterPresentRegisterRowsRespectingMarks,
  isLeaveMarkSource,
  isManualMarkSource,
  isPunchMarkSource,
  marksByEmpDayFromRegisterDbRows,
  punchesToPresentRegisterRows,
  registerDateRangeFromRows,
} from "../../shared/attendanceRegisterSync.mjs";

export const REGISTER_MARK_SOURCE_AUTO_WO = "auto_wo";

export const ATTENDANCE_PUNCH_TABLE = "erp_attendance_punches";
export const ATTENDANCE_REGISTER_TABLE = "admin_attendance_register";
export const EMPLOYEE_MASTER_TABLE = "admin_ifsp_employee_master";
/** DB column: eTimeOffice punch / attendance join key (not employee_id). */
export const EMPLOYEE_MASTER_CODE_COL = "employee_code";
export const REGISTER_MARK_UPSERT_CHUNK = 200;
export const PUNCH_FETCH_CHUNK = 1000;
export const REGISTER_FETCH_CHUNK = 1000;
export const ABSENT_GRID_CAP = 5000;

export const STORAGE_KEYS = {
  expectedIn: "adminAttendance.expectedIn",
  expectedOut: "adminAttendance.expectedOut",
  registerMarks: "adminAttendance.registerMarks",
};

/** Stored mark code for national holiday / public holiday. */
export const REGISTER_MARK_NHPH = "NH/PH";

/** Daily register grid — dropdown options (clear + P, L, WO, NH/PH). */
export const REGISTER_STATUS_OPTIONS = [
  { value: "", label: "—" },
  { value: "P", label: "Present (P)" },
  { value: "P(OD)", label: "Present On Duty (P(OD))" },
  { value: "L", label: "Leave (L)" },
  { value: "WO", label: "Weekoff (WO)" },
  { value: REGISTER_MARK_NHPH, label: "NH/PH" },
];

/** Leave types under L in the register mark picker submenu. */
export const REGISTER_LEAVE_SUBMENU_OPTIONS = [
  { value: "PL", label: "PL — Paid Leave" },
  { value: "CL", label: "CL — Casual Leave" },
  { value: "SL", label: "SL — Sick Leave" },
  { value: "SPLA", label: "SPLA" },
  { value: "SPLB", label: "SPLB" },
  { value: "SBEL", label: "SBEL" },
  { value: "PTL", label: "PTL — Paternity Leave" },
  { value: "ML", label: "ML — Maternity Leave" },
];

/** Marks that use the red closed-cell box (L + leave submenu codes only). */
export const REGISTER_LEAVE_RED_CELL_MARKS = new Set([
  "L",
  "PL",
  "CL",
  "SL",
  "SPLA",
  "SPLB",
  "SPLM",
  "SBEL",
  "PTL",
  "ML",
]);

/** Primary register mark picker rows (Leave opens submenu). */
export const REGISTER_PRIMARY_MARK_OPTIONS = [
  { value: "", label: "—" },
  { value: "P", label: "P — Present" },
  { value: "P(OD)", label: "P(OD) — Present on Duty" },
  { value: "T", label: "T — Tour" },
  { value: "L", label: "L — Leave", hasSubmenu: true },
  { value: "WO", label: "WO — Weekly Off" },
  { value: REGISTER_MARK_NHPH, label: "NH/PH" },
  { value: "CO", label: "CO — Compensatory Off" },
  { value: "HD", label: "HD — Half Day" },
  { value: "WFH", label: "WFH — Work From Home" },
];

export function registerMarkOptionLabel(value) {
  if (!value) return "—";
  const primary = REGISTER_PRIMARY_MARK_OPTIONS.find((o) => o.value === value);
  if (primary) return primary.label;
  const leave = REGISTER_LEAVE_SUBMENU_OPTIONS.find((o) => o.value === value);
  if (leave) return leave.label;
  return String(value);
}

export function isRegisterNhphMark(mark) {
  return mark === REGISTER_MARK_NHPH || mark === "NHPH";
}

export function isRegisterPresentMark(mark) {
  return mark === "P" || mark === "P(OD)";
}

/** Marks that support an optional cell remark (P(OD), Tour). */
export function isRegisterCommentMark(mark) {
  return mark === "P(OD)" || mark === "T";
}

/** Marks that count toward monthly present-day totals (payroll / register summary). */
const REGISTER_PRESENT_CREDIT_MARKS = new Set(["P", "P(OD)", "T", "CO", "WFH"]);

/**
 * Present-day credit for one register cell (0, 0.5, or 1).
 * CO and WFH count as present; leave / WO / NH/PH do not.
 */
export function registerPresentDayCredit(mark) {
  const raw = String(mark ?? "").trim();
  if (!raw) return 0;
  if (raw === "P(OD)") return 1;
  if (REGISTER_PRESENT_CREDIT_MARKS.has(raw)) return 1;
  const canonical = normalizeRegisterMarkForDb(raw);
  if (canonical && REGISTER_PRESENT_CREDIT_MARKS.has(canonical)) return 1;
  return 0;
}

/** Present credit for a day cell; 3rd Saturday counts as present when blank or WO. */
export function registerPresentDayCreditForCell(mark, { year, month, day } = {}) {
  const credit = registerPresentDayCredit(mark);
  if (credit > 0) return credit;
  if (year && month && day && isThirdSaturdayOfMonth(year, month, day)) {
    const m = String(mark ?? "").trim();
    if (!m || m === "WO") return 1;
  }
  return 0;
}

/** Whether a mark counts as a present day (incl. CO, T). */
export function isRegisterEffectivePresentMark(mark) {
  return registerPresentDayCredit(mark) > 0;
}

/** Human-readable status for a single day cell (present / unmarked / leave / …). */
export function registerMarkStatusLabel(mark) {
  if (isRegisterPresentMark(mark)) return mark === "P(OD)" ? "Present (OD)" : "Present";
  if (!mark) return "Unmarked";
  const opt = REGISTER_STATUS_OPTIONS.find((o) => o.value === mark);
  return opt?.label || mark;
}

/**
 * Present vs marked-other vs unmarked for one calendar day across register rows.
 * Unmarked = no punch and no stored mark (blank cell), except 3rd Saturday counts as present.
 */
export function computeDayAttendanceBreakdown(rows, day, { year, month } = {}) {
  const presentEmployees = [];
  const markedOtherEmployees = [];
  const unmarkedEmployees = [];
  const allEmployees = [];
  for (const row of rows || []) {
    const dayMark = row.dayMarks?.[day] || "";
    const entry = { ...row, dayMark };
    allEmployees.push(entry);
    if (registerPresentDayCreditForCell(dayMark, { year, month, day }) > 0) {
      presentEmployees.push(entry);
    } else if (!dayMark) unmarkedEmployees.push(entry);
    else markedOtherEmployees.push(entry);
  }
  return {
    total: allEmployees.length,
    present: presentEmployees.length,
    absent: markedOtherEmployees.length,
    unmarked: unmarkedEmployees.length,
    presentEmployees,
    absentEmployees: markedOtherEmployees,
    unmarkedEmployees,
    allEmployees,
  };
}

/** Resolve inclusive day-of-month range inside a month from ISO dates. */
export function resolveBulkDayRange(monthKey, fromIso, toIso) {
  if (!monthKey || !fromIso?.startsWith(monthKey) || !toIso?.startsWith(monthKey)) return null;
  const dayFrom = dayOfMonthFromIsoDate(fromIso);
  const dayTo = dayOfMonthFromIsoDate(toIso);
  if (!dayFrom || !dayTo) return null;
  return { dayFrom: Math.min(dayFrom, dayTo), dayTo: Math.max(dayFrom, dayTo) };
}

/** Filter employees for bulk picker (any day in range matching the filter). */
export function employeeMatchesBulkMarkFilter(row, { dayFrom, dayTo, filter = "all" }) {
  if (!filter || filter === "all") return true;
  for (let day = dayFrom; day <= dayTo; day += 1) {
    const mark = row.dayMarks?.[day] || "";
    if (filter === "present" && isRegisterEffectivePresentMark(mark)) return true;
    if (filter === "unmarked" && !mark) return true;
    if (filter === "marked" && mark) return true;
  }
  return false;
}

/** Values allowed by admin_attendance_register_mark_check (Supabase). */
export const REGISTER_MARKS_DB_ALLOWED = new Set([
  "P",
  "P(OD)",
  "T",
  "L",
  "WO",
  REGISTER_MARK_NHPH,
  "HD",
  "WFH",
  "PL",
  "CL",
  "SL",
  "SPLA",
  "SPLB",
  "SPLM",
  "SBEL",
  "CO",
  "PTL",
  "ML",
]);

/**
 * Map UI / legacy marks to a value the DB check constraint accepts.
 * Preserves specific leave codes (PL, CL, SL, …) for register display and limits.
 * @returns {string|null} canonical mark, or null to delete the cell
 */
export function normalizeRegisterMarkForDb(mark) {
  const m = String(mark ?? "").trim();
  if (!m) return null;
  if (isRegisterNhphMark(m)) return REGISTER_MARK_NHPH;
  if (m === "P(OD)") return "P(OD)";
  if (REGISTER_MARKS_DB_ALLOWED.has(m)) return m;
  if (m === "A" || m === "LEAVE") return "L";
  return "L";
}

/** Summary table rows (order + labels for month totals). */
export const REGISTER_SUMMARY_ROWS = [
  { key: "P", label: "Present (P)", tone: "text-emerald-700" },
  { key: "L", label: "Leave (L)", tone: "text-red-700" },
  { key: "leave", label: "Leave (all codes)", tone: "text-red-700", computed: true },
  { key: "WO", label: "Weekoff (WO)", tone: "text-yellow-700" },
  { key: REGISTER_MARK_NHPH, label: "NH/PH", tone: "text-orange-700" },
  { key: "blank", label: "Unmarked", tone: "text-gray-600" },
];

/** L plus legacy leave codes still stored in older rows. */
export const REGISTER_LEAVE_MARKS = new Set(["L", "A", "PL", "SL", "CL", "HD"]);

/** Shared palette — closed cell box + bulk Mark P/L/WO/NH/PH buttons. */
export const REGISTER_MARK_PALETTE = {
  present: { bg: "#008D62", border: "#006b51", hover: "#006b51" },
  leave: { bg: "#D62828", border: "#b82222", hover: "#b82222" },
  weekoff: { bg: "#EAB308", border: "#CA8A04", hover: "#CA8A04" },
  nhph: { bg: "#F58220", border: "#d9741d", hover: "#d9741d" },
  empty: { bg: "#f3f4f6", border: "#d1d5db", text: "#4b5563" },
};

export const REGISTER_BULK_BUTTON_CLASS = {
  P: "bg-[#008D62] hover:bg-[#006b51] text-white",
  "P(OD)": "bg-[#0ea5a5] hover:bg-[#0f8f8f] text-white",
  L: "bg-[#D62828] hover:bg-[#b82222] text-white",
  WO: "bg-[#EAB308] hover:bg-[#CA8A04] text-gray-900",
  [REGISTER_MARK_NHPH]: "bg-[#F58220] hover:bg-[#d9741d] text-white",
};

const REGISTER_MARK_WRAPPER_BASE = "min-w-[58px] rounded-md border shadow-sm";

/** Per-mark colors for closed cells only (dropdown list stays neutral). */
export const REGISTER_MARK_CELL_COLORS = {
  P: { bg: "#008D62", border: "#006b51", text: "white" },
  "P(OD)": { bg: "#0d9488", border: "#0f766e", text: "white" },
  T: { bg: "#7c3aed", border: "#6d28d9", text: "white" },
  L: { bg: "#D62828", border: "#b82222", text: "white" },
  WO: { bg: "#EAB308", border: "#CA8A04", text: "dark" },
  [REGISTER_MARK_NHPH]: { bg: "#F58220", border: "#d9741d", text: "white" },
  NHPH: { bg: "#F58220", border: "#d9741d", text: "white" },
  CO: { bg: "#059669", border: "#047857", text: "white" },
  HD: { bg: "#d97706", border: "#b45309", text: "white" },
  WFH: { bg: "#2563eb", border: "#1d4ed8", text: "white" },
};

export function resolveRegisterMarkCellColors(mark) {
  const m = String(mark ?? "").trim();
  if (!m) return null;
  if (REGISTER_LEAVE_RED_CELL_MARKS.has(m)) return REGISTER_MARK_CELL_COLORS.L;
  if (isRegisterNhphMark(m)) return REGISTER_MARK_CELL_COLORS[REGISTER_MARK_NHPH];
  if (REGISTER_MARK_CELL_COLORS[m]) return REGISTER_MARK_CELL_COLORS[m];
  return null;
}

/** Inner select — transparent; color comes from wrapper only (open list stays neutral via CSS). */
export const REGISTER_MARK_SELECT_INNER =
  "register-mark-select w-full h-8 px-1 text-[11px] font-semibold text-center appearance-none cursor-pointer bg-transparent border-0 focus:outline-none focus:ring-0";

export function isRegisterLeaveMark(mark) {
  return REGISTER_LEAVE_MARKS.has(mark);
}

/** Colored box behind the closed cell only (pair with registerMarkCellInlineStyle). */
export function registerMarkCellWrapperClass(value) {
  if (!resolveRegisterMarkCellColors(value)) {
    return `${REGISTER_MARK_WRAPPER_BASE} border-gray-300 bg-gray-100`;
  }
  return REGISTER_MARK_WRAPPER_BASE;
}

export function registerMarkSelectTextClass(value) {
  if (!value) return "text-gray-600";
  const colors = resolveRegisterMarkCellColors(value);
  if (colors?.text === "dark") return "text-gray-900";
  if (colors) return "text-white";
  return "text-gray-600";
}

/** Inline styles for mark cells (Tailwind arbitrary hex is unreliable for all marks). */
export function registerMarkCellInlineStyle(value) {
  const colors = resolveRegisterMarkCellColors(value);
  if (!colors) return undefined;
  return { backgroundColor: colors.bg, borderColor: colors.border };
}

/** @deprecated Use registerMarkCellWrapperClass + REGISTER_MARK_SELECT_INNER */
export function registerMarkCellClass(value) {
  return `${registerMarkCellWrapperClass(value)} ${REGISTER_MARK_SELECT_INNER} ${registerMarkSelectTextClass(value)}`;
}

export function dayOfMonthFromIsoDate(isoDate) {
  const d = normalizeDbDate(isoDate);
  if (!d) return null;
  return Number(d.slice(8, 10));
}

export function defaultBulkDateForMonth(monthKey) {
  const today = isoDateToday();
  if (today.startsWith(monthKey)) return today;
  return `${monthKey}-01`;
}

export function isoMonthToday() {
  return isoDateToday().slice(0, 7);
}

export function daysInCalendarMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function monthKeyFromParts(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthValue(monthValue) {
  const raw = String(monthValue || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month, monthKey: monthKeyFromParts(year, month) };
}

export function monthDateRange(monthValue) {
  const parsed = parseMonthValue(monthValue);
  if (!parsed) return null;
  const { year, month, monthKey } = parsed;
  const daysInMonth = daysInCalendarMonth(year, month);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    year,
    month,
    monthKey,
    daysInMonth,
    fromDate: `${monthKey}-01`,
    toDate: `${monthKey}-${pad(daysInMonth)}`,
  };
}

/**
 * Canonical emp code for attendance (matches eTimeOffice / raw punches).
 * Numeric codes drop leading zeros (09750 → 9750).
 */
export function normalizeAttendanceEmpCode(code) {
  const s = String(code ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? String(n) : s;
  }
  return s;
}

/** DB filter variants so 9750 still matches legacy 09750 rows. */
export function attendanceEmpCodeLookupVariants(code) {
  const raw = String(code ?? "").trim();
  const n = normalizeAttendanceEmpCode(raw);
  if (!n) return [];
  const variants = new Set([n]);
  if (raw) variants.add(raw);
  if (/^\d+$/.test(n) && n.length < 5) variants.add(n.padStart(5, "0"));
  return [...variants];
}

/**
 * Canonical grid key for a register/punch employee code.
 * Aligns legacy padded numeric codes and master-map aliases to one row key.
 */
export function resolveRegisterGridEmpCode(code, masterCodeMap = null) {
  const raw = String(code ?? "").trim();
  const norm = normalizeAttendanceEmpCode(raw);
  if (!norm) return "";
  if (masterCodeMap?.size) {
    let mapped = masterCodeMap.get(norm) || masterCodeMap.get(raw);
    if (!mapped) {
      const lower = norm.toLowerCase();
      for (const [key, value] of masterCodeMap.entries()) {
        if (String(key).toLowerCase() === lower) {
          mapped = value;
          break;
        }
      }
    }
    if (mapped) return normalizeAttendanceEmpCode(mapped);
  }
  return norm;
}

/** Filter value for punch queries: ALL or canonical emp code. */
export function resolveAttendanceEmpCodeFilter(empCode) {
  const trimmed = String(empCode ?? "").trim();
  if (!trimmed || trimmed.toUpperCase() === "ALL") return "ALL";
  return normalizeAttendanceEmpCode(trimmed);
}

export function buildPresentKeysFromPunches(punches) {
  const keys = new Set();
  for (const punch of punches) {
    const empCode = normalizeAttendanceEmpCode(punch.empCode);
    const punchDate = normalizeDbDate(punch.punchDate);
    if (!empCode || !punchDate) continue;
    keys.add(`${empCode}|${punchDate}`);
  }
  return keys;
}

/**
 * One row per active employee; dayMarks[1..n] hold register codes (P, A, WO, …).
 * manualMarks[empCode][day] overrides auto Present from raw punches.
 */
export function buildMonthlyRegisterGrid(punches, activeEmployees, { year, month, manualMarks = {} }) {
  const daysInMonth = daysInCalendarMonth(year, month);
  const presentKeys = buildPresentKeysFromPunches(punches);
  const pad = (n) => String(n).padStart(2, "0");
  const monthPrefix = monthKeyFromParts(year, month);

  const employees = [...activeEmployees].sort((a, b) =>
    String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true })
  );

  const rows = employees.map((emp) => {
    const code = normalizeAttendanceEmpCode(emp.empCode);
    const overrides = manualMarks[code] || {};
    const dayMarks = {};

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${monthPrefix}-${pad(day)}`;
      const manual = overrides[day];
      if (manual != null && manual !== "") {
        dayMarks[day] = manual;
      } else if (isAutoWeekoffDate(iso)) {
        dayMarks[day] = "WO";
      } else if (presentKeys.has(`${code}|${iso}`)) {
        dayMarks[day] = "P";
      } else {
        dayMarks[day] = "";
      }
    }

    return {
      id: code || `id:${emp.employeeId}`,
      empCode: code,
      employeeId: emp.employeeId || "",
      employeeName: emp.employeeName,
      department: emp.department || "",
      dayMarks,
    };
  });

  return { rows, daysInMonth, year, month, monthKey: monthPrefix };
}

export function readStoredRegisterMarks(monthKey) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.registerMarks) || "{}");
    return all[monthKey] && typeof all[monthKey] === "object" ? all[monthKey] : {};
  } catch {
    return {};
  }
}

export function writeStoredRegisterMarks(monthKey, marksByEmp) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.registerMarks) || "{}");
    all[monthKey] = marksByEmp;
    localStorage.setItem(STORAGE_KEYS.registerMarks, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Merge DB marks with local pending marks (local fills gaps only). */
export function mergeRegisterMarksWithLocal(dbMarks, localMarks) {
  const merged = { ...(dbMarks || {}) };
  for (const [empCode, days] of Object.entries(localMarks || {})) {
    const code = normalizeAttendanceEmpCode(empCode);
    if (!code) continue;
    if (!merged[code]) merged[code] = {};
    for (const [dayKey, mark] of Object.entries(days || {})) {
      const day = Number(dayKey);
      if (!Number.isFinite(day)) continue;
      const canonical = normalizeRegisterMarkForDb(mark);
      if (!canonical) continue;
      if (merged[code][day] == null || merged[code][day] === "") {
        merged[code][day] = canonical;
      }
    }
  }
  return merged;
}

function registerMarkRowPriority(row) {
  if (isManualMarkSource(row?.mark_source)) return 3;
  if (isLeaveMarkSource(row?.mark_source, row?.leave_request_id)) return 2;
  if (isPunchMarkSource(row?.mark, row?.mark_source)) return 1;
  return 0;
}

export function registerDateFromDay(monthKey, day) {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

/** Column header in grid: calendar day/month (e.g. 01/05). */
export function registerDayTableLabel(monthKey, day) {
  return formatDateDdMmYyyy(registerDateFromDay(monthKey, day)) || String(day);
}

/** Export headers: dd-mm-yyyy per day. */
export function registerDayExportHeaders(monthKey, daysInMonth) {
  return Array.from({ length: daysInMonth }, (_, i) =>
    formatDateDdMmYyyy(registerDateFromDay(monthKey, i + 1))
  );
}

/** DB rows → manualMarks[empCode][dayNumber]. */
export function dbRowsToManualMarks(rows, masterCodeMap = null) {
  const marks = {};
  const priority = {};
  for (const row of rows || []) {
    const code = resolveRegisterGridEmpCode(row.employee_code, masterCodeMap);
    const day = dayOfMonthFromIsoDate(row.register_date);
    const mark = normalizeRegisterMarkForDb(row.mark);
    if (!code || !day || !mark) continue;
    const rowPri = registerMarkRowPriority(row);
    const prevPri = priority[code]?.[day] ?? -1;
    if (rowPri < prevPri) continue;
    if (!marks[code]) marks[code] = {};
    if (!priority[code]) priority[code] = {};
    marks[code][day] = mark;
    priority[code][day] = rowPri;
  }
  return marks;
}

/** DB rows -> manualRemarks[empCode][dayNumber] (P(OD) / T comments). */
export function dbRowsToManualRemarks(rows, masterCodeMap = null) {
  const remarks = {};
  for (const row of rows || []) {
    const code = resolveRegisterGridEmpCode(row.employee_code, masterCodeMap);
    const day = dayOfMonthFromIsoDate(row.register_date);
    const mark = normalizeRegisterMarkForDb(row.mark);
    const remark = String(row.mark_remark || "").trim();
    if (!code || !day || !isRegisterCommentMark(mark) || !remark) continue;
    if (!remarks[code]) remarks[code] = {};
    remarks[code][day] = remark;
  }
  return remarks;
}

export function manualMarksToDbRows(marksByEmp, monthKey) {
  const rows = [];
  for (const [empCode, days] of Object.entries(marksByEmp || {})) {
    const code = normalizeAttendanceEmpCode(empCode);
    if (!code) continue;
    for (const [dayKey, mark] of Object.entries(days || {})) {
      const m = normalizeRegisterMarkForDb(mark);
      if (!m) continue;
      const day = Number(dayKey);
      if (!Number.isFinite(day) || day < 1 || day > 31) continue;
      rows.push({
        employee_code: code,
        register_date: registerDateFromDay(monthKey, day),
        month_key: monthKey,
        mark: m,
        updated_at: new Date().toISOString(),
      });
    }
  }
  return rows;
}

/** Paginated read — PostgREST defaults to 1000 rows; a full month can exceed that. */
export async function fetchRegisterMarkRowsInRange(supabase, { fromDate, toDate }) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(ATTENDANCE_REGISTER_TABLE)
      .select("employee_code,register_date,mark,mark_remark,mark_source,leave_request_id")
      .gte("register_date", fromDate)
      .lte("register_date", toDate)
      .order("register_date", { ascending: true })
      .order("employee_code", { ascending: true })
      .range(offset, offset + REGISTER_FETCH_CHUNK - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < REGISTER_FETCH_CHUNK) break;
    offset += REGISTER_FETCH_CHUNK;
  }
  return all;
}

export async function fetchRegisterMarksForMonth(
  supabase,
  { fromDate, toDate },
  { masterCodeMap = null, rows: prefetchedRows = null } = {}
) {
  const rows = prefetchedRows ?? (await fetchRegisterMarkRowsInRange(supabase, { fromDate, toDate }));
  return {
    rows,
    marks: dbRowsToManualMarks(rows, masterCodeMap),
    remarks: dbRowsToManualRemarks(rows, masterCodeMap),
  };
}

/** All register mark rows for a calendar year (leave limits, CO validation, alerts). */
export async function fetchRegisterMarksForYear(supabase, year, masterCodeMap = null) {
  const y = Number(year) || new Date().getFullYear();
  const fromDate = `${y}-01-01`;
  const toDate = `${y}-12-31`;
  const rows = await fetchRegisterMarkRowsInRange(supabase, { fromDate, toDate });
  return rows.map((row) => ({
    employee_code: resolveRegisterGridEmpCode(row.employee_code, masterCodeMap),
    register_date: String(normalizeDbDate(row.register_date) || "").slice(0, 10),
    mark: row.mark,
    mark_remark: row.mark_remark ?? null,
  }));
}

/** True when `day` is the 3rd Saturday of `year`/`month` (1-based). */
export function isThirdSaturdayOfMonth(year, month, day) {
  if (new Date(year, month - 1, day).getDay() !== 6) return false;
  let saturdays = 0;
  for (let d = 1; d <= day; d += 1) {
    if (new Date(year, month - 1, d).getDay() === 6) saturdays += 1;
  }
  return saturdays === 3;
}

/** Sunday only — 3rd Saturday is a working day (counts as present in summaries). */
export function isAutoWeekoffDate(isoDate) {
  const d = normalizeDbDate(isoDate);
  if (!d) return false;
  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  return new Date(year, month - 1, day).getDay() === 0;
}

/** All auto-WO dates for the viewed month and the following month. */
export function listAutoWeekoffDatesForMonthAndNext(monthMeta) {
  if (!monthMeta?.year || !monthMeta?.month) return [];
  const { year, month } = monthMeta;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const dates = [];
  for (const { y, m } of [
    { y: year, m: month },
    { y: nextYear, m: nextMonth },
  ]) {
    const monthKey = monthKeyFromParts(y, m);
    const dim = daysInCalendarMonth(y, m);
    for (let day = 1; day <= dim; day += 1) {
      const iso = registerDateFromDay(monthKey, day);
      if (isAutoWeekoffDate(iso)) dates.push(iso);
    }
  }
  return dates;
}

/**
 * Whether auto WO may be written on a scheduled weekoff date.
 * Replaces punch-only Present; never overwrites leave or manual marks.
 */
export function canAutoWeekoffApplyToExisting(existing) {
  if (!existing?.mark) return true;
  if (String(existing.mark_remark ?? "").trim()) return false;
  if (isLeaveMarkSource(existing.mark_source, existing.leave_request_id)) return false;
  const src = String(existing.mark_source ?? "").trim().toLowerCase();
  if (isManualMarkSource(src)) return false;
  const mark = String(existing.mark ?? "").trim();
  if (mark === "WO" && (src === REGISTER_MARK_SOURCE_AUTO_WO || !src)) return true;
  if (isPunchMarkSource(mark, existing.mark_source)) return true;
  if (mark === "P" || mark === "P(OD)" || mark === "T") return false;
  return true;
}

/**
 * Apply WO on all Sundays for every register employee on `weekoffDates`.
 * Skips leave, manual marks, and present; punch sync may overwrite WO afterward.
 */
function indexRegisterRowByEmpDate(existingByKey, row) {
  const date = normalizeDbDate(row.register_date);
  if (!date) return;
  const raw = String(row.employee_code ?? "").trim();
  const norm = normalizeAttendanceEmpCode(raw);
  if (norm) existingByKey.set(`${norm}|${date}`, row);
  if (raw && raw !== norm) existingByKey.set(`${raw}|${date}`, row);
}

function lookupRegisterRow(existingByKey, normCode, dbCode, register_date) {
  return (
    existingByKey.get(`${normCode}|${register_date}`) ||
    (dbCode !== normCode ? existingByKey.get(`${dbCode}|${register_date}`) : undefined)
  );
}

export async function syncRegisterAutoWeekoffMarks(
  supabase,
  employeeCodes,
  weekoffDates,
  masterCodeMap = null
) {
  const codes = [...new Set((employeeCodes || []).map(normalizeAttendanceEmpCode).filter(Boolean))];
  const dates = [...new Set((weekoffDates || []).map(normalizeDbDate).filter(Boolean))].sort();
  if (!codes.length || !dates.length) return { upserted: 0, failed: 0 };

  const fromDate = dates[0];
  const toDate = dates[dates.length - 1];
  const { data, error } = await supabase
    .from(ATTENDANCE_REGISTER_TABLE)
    .select("employee_code,register_date,mark,mark_source,leave_request_id,mark_remark")
    .gte("register_date", fromDate)
    .lte("register_date", toDate);
  if (error) throw error;

  const existingByKey = new Map();
  for (const row of data || []) indexRegisterRowByEmpDate(existingByKey, row);

  const upserts = [];
  let failed = 0;
  for (const normCode of codes) {
    if (masterCodeMap?.size && !masterCodeMap.has(normCode)) {
      failed += dates.length;
      continue;
    }
    const dbCode = toRegisterDbEmployeeCode(normCode, masterCodeMap);
    if (!dbCode) continue;
    for (const register_date of dates) {
      const existing = lookupRegisterRow(existingByKey, normCode, dbCode, register_date);
      if (!canAutoWeekoffApplyToExisting(existing)) continue;
      upserts.push({
        employee_code: dbCode,
        register_date,
        month_key: register_date.slice(0, 7),
        mark: "WO",
        mark_source: REGISTER_MARK_SOURCE_AUTO_WO,
        leave_request_id: null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (!upserts.length) return { upserted: 0, failed };

  let upserted = 0;
  for (let i = 0; i < upserts.length; i += REGISTER_MARK_UPSERT_CHUNK) {
    const chunk = upserts.slice(i, i + REGISTER_MARK_UPSERT_CHUNK);
    try {
      await upsertRegisterMarksBatch(supabase, chunk, { masterCodeMap });
      upserted += chunk.length;
    } catch {
      for (const row of chunk) {
        try {
          await upsertRegisterMarksBatch(supabase, [row], { masterCodeMap });
          upserted += 1;
        } catch {
          failed += 1;
        }
      }
    }
  }
  return { upserted, failed };
}

/**
 * Upsert Present (P) from punches into the register.
 * With `respectManualMarks`, only overwrites blank, punch-sourced, and WO cells.
 */
export async function syncRegisterMarksFromPunches(supabase, punches, options = {}) {
  // Default true: punch sync must never overwrite manual/leave/non-punch entries.
  const { respectManualMarks = true, fromDate: fromOverride, toDate: toOverride } = options;
  const masterCodeMap = options.masterCodeMap ?? null;
  const candidateRows = punchesToPresentRegisterRows(punches).map((row) => ({
    ...row,
    employee_code: toRegisterDbEmployeeCode(row.employee_code, masterCodeMap),
  }));
  if (!candidateRows.length) {
    return { upserted: 0, skipped: 0, candidates: 0 };
  }

  let toUpsert = candidateRows;
  const range = registerDateRangeFromRows(candidateRows);
  const fromDate = fromOverride || range.fromDate;
  const toDate = toOverride || range.toDate;

  if (respectManualMarks && fromDate && toDate) {
    const { data, error } = await supabase
      .from(ATTENDANCE_REGISTER_TABLE)
      .select("employee_code,register_date,mark,mark_source,leave_request_id,mark_remark")
      .gte("register_date", fromDate)
      .lte("register_date", toDate);
    if (error) throw error;
    const marksByEmpDay = marksByEmpDayFromRegisterDbRows(data, normalizeRegisterMarkForDb);
    toUpsert = filterPresentRegisterRowsRespectingMarks(candidateRows, marksByEmpDay);
  }

  if (toUpsert.length) {
    await upsertRegisterMarksBatch(supabase, toUpsert, { masterCodeMap });
  }

  return {
    upserted: toUpsert.length,
    skipped: candidateRows.length - toUpsert.length,
    candidates: candidateRows.length,
  };
}

/** Include active master employees plus inactive (removed) master employees with month activity. */
export function buildRegisterEmployeeList(
  activeEmployees,
  inactiveEmployees,
  { punchCodes = [], registerCodes = [], masterCodeMap = null } = {}
) {
  const byCode = new Map();
  for (const e of activeEmployees || []) {
    const code = resolveRegisterGridEmpCode(e.empCode, masterCodeMap);
    if (code) byCode.set(code, { ...e, empCode: code, masterStatus: "Active" });
  }
  const activityCodes = new Set(
    [...(punchCodes || []), ...(registerCodes || [])]
      .map((c) => resolveRegisterGridEmpCode(c, masterCodeMap))
      .filter(Boolean)
  );
  for (const e of inactiveEmployees || []) {
    const code = resolveRegisterGridEmpCode(e.empCode, masterCodeMap);
    if (!code || byCode.has(code)) continue;
    if (activityCodes.size > 0 && !activityCodes.has(code)) continue;
    byCode.set(code, { ...e, empCode: code, masterStatus: "Inactive" });
  }
  for (const rawCode of registerCodes || []) {
    const code = resolveRegisterGridEmpCode(rawCode, masterCodeMap);
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      empCode: code,
      registerEmpCode: toRegisterDbEmployeeCode(code, masterCodeMap) || String(rawCode).trim(),
      employeeName: "",
      department: "",
      designation: "",
      employeeId: "",
      masterStatus: "Register only",
    });
  }
  return [...byCode.values()].sort((a, b) =>
    String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true })
  );
}

/** @deprecated Use buildRegisterEmployeeList — kept for callers that still merge punch orphans. */
export function mergeActiveEmployeesWithPunches(activeEmployees, punches) {
  const punchCodes = (punches || [])
    .map((p) => normalizeAttendanceEmpCode(p.empCode ?? p.employee_code))
    .filter(Boolean);
  return buildRegisterEmployeeList(activeEmployees, [], { punchCodes, registerCodes: punchCodes });
}

export async function upsertRegisterMarksBatch(supabase, rows, options = {}) {
  const { masterCodeMap = null } = options;
  const normalized = (rows || [])
    .map((row) => {
      const employee_code = toRegisterDbEmployeeCode(row.employee_code, masterCodeMap);
      const mark = normalizeRegisterMarkForDb(row.mark);
      if (!employee_code || !mark) return null;
      const payload = { ...row, employee_code, mark };
      if (isRegisterCommentMark(mark)) {
        payload.mark_remark = String(row.mark_remark ?? "").trim() || null;
      } else if (Object.prototype.hasOwnProperty.call(row, "mark_remark")) {
        payload.mark_remark = String(row.mark_remark ?? "").trim() || null;
      } else {
        delete payload.mark_remark;
      }
      return payload;
    })
    .filter(Boolean);
  if (!normalized.length) return;
  for (let i = 0; i < normalized.length; i += REGISTER_MARK_UPSERT_CHUNK) {
    const chunk = normalized.slice(i, i + REGISTER_MARK_UPSERT_CHUNK);
    const { error } = await supabase.from(ATTENDANCE_REGISTER_TABLE).upsert(chunk, {
      onConflict: "employee_code,register_date",
    });
    if (error) throw error;
  }
}

export async function deleteRegisterMarksBatch(supabase, deletes, masterCodeMap = null) {
  for (const { employee_code, register_date } of deletes) {
    const date = normalizeDbDate(register_date);
    if (!date) continue;
    const variants = new Set([
      ...attendanceEmpCodeLookupVariants(employee_code),
      toRegisterDbEmployeeCode(employee_code, masterCodeMap),
      normalizeAttendanceEmpCode(employee_code),
      String(employee_code ?? "").trim(),
    ].filter(Boolean));
    const { error } = await supabase
      .from(ATTENDANCE_REGISTER_TABLE)
      .delete()
      .in("employee_code", [...variants])
      .eq("register_date", date);
    if (error) throw error;
  }
}

export async function upsertRegisterMark(
  supabase,
  empCode,
  registerDate,
  mark,
  markRemark = "",
  masterCodeMap = null
) {
  const normCode = normalizeAttendanceEmpCode(empCode);
  const date = normalizeDbDate(registerDate);
  if (!normCode || !date) {
    throw new Error("Employee code and register date are required to save attendance.");
  }
  const canonical = normalizeRegisterMarkForDb(mark);
  if (!canonical) {
    await deleteRegisterMarksBatch(
      supabase,
      [{ employee_code: normCode, register_date: date }],
      masterCodeMap
    );
    return;
  }
  await upsertRegisterMarksBatch(
    supabase,
    [
      {
        employee_code: normCode,
        register_date: date,
        month_key: date.slice(0, 7),
        mark: canonical,
        mark_remark: isRegisterCommentMark(canonical) ? String(markRemark || "").trim() || null : null,
        mark_source: "manual",
        leave_request_id: null,
        updated_at: new Date().toISOString(),
      },
    ],
    { masterCodeMap }
  );
}

/** One-time: copy browser marks to Supabase when DB is empty for the month. */
export async function migrateLocalRegisterMarksToDb(supabase, monthKey, fromDate, toDate) {
  const local = readStoredRegisterMarks(monthKey);
  const rows = manualMarksToDbRows(local, monthKey);
  if (!rows.length) return false;
  await upsertRegisterMarksBatch(supabase, rows);
  return true;
}

export async function loadRegisterMarksForMonth(supabase, monthMeta, options = {}) {
  const { masterCodeMap = null } = options;
  const range = {
    fromDate: monthMeta.fromDate,
    toDate: monthMeta.toDate,
  };
  let data = await fetchRegisterMarksForMonth(supabase, range, { masterCodeMap });
  const hasDb = (data.rows || []).length > 0 || Object.keys(data.marks || {}).length > 0;
  const local = readStoredRegisterMarks(monthMeta.monthKey);
  const hasLocal = Object.keys(local).length > 0;
  if (!hasDb && hasLocal) {
    await migrateLocalRegisterMarksToDb(supabase, monthMeta.monthKey, monthMeta.fromDate, monthMeta.toDate);
    data = await fetchRegisterMarksForMonth(supabase, range, { masterCodeMap });
  } else if (hasLocal) {
    data = {
      ...data,
      marks: mergeRegisterMarksWithLocal(data.marks, local),
    };
  }
  return data;
}

/**
 * Monthly attendance totals per employee (for payroll).
 * Merges raw punches + stored register marks into final day codes, then summaries.
 */
export async function fetchMonthlyRegisterPayrollTotals(supabase, monthValue, { empCode = "ALL" } = {}) {
  const monthMeta = monthDateRange(monthValue);
  if (!monthMeta) return { monthMeta: null, rows: [] };

  const [punches, employees, manualMarks] = await Promise.all([
    fetchAttendancePunchesInRange(supabase, {
      fromDate: monthMeta.fromDate,
      toDate: monthMeta.toDate,
      empCode,
    }),
    fetchActiveEmployees(supabase),
    fetchRegisterMarksForMonth(supabase, {
      fromDate: monthMeta.fromDate,
      toDate: monthMeta.toDate,
    }),
  ]);

  let emps = employees;
  const codeFilter = normalizeAttendanceEmpCode(empCode);
  if (codeFilter && String(empCode || "").trim().toUpperCase() !== "ALL") {
    emps = emps.filter((e) => e.empCode === codeFilter);
  }

  const { rows, daysInMonth } = buildMonthlyRegisterGrid(punches, emps, {
    year: monthMeta.year,
    month: monthMeta.month,
    manualMarks: manualMarks.marks || {},
  });

  const withSummary = attachRegisterRowSummaries(rows, manualMarks.marks || {}, daysInMonth, {
    year: monthMeta.year,
    month: monthMeta.month,
  });

  return {
    monthMeta,
    daysInMonth,
    rows: withSummary.map((row) => ({
      empCode: row.empCode,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      summary: row.summary,
      dayMarks: row.dayMarks,
    })),
  };
}

export function computeEmployeeRegisterSummary(row, manualMarksForEmp = {}, daysInMonth, { year, month } = {}) {
  const summary = { leave: 0, weekoff: 0, appliedWo: 0, nhph: 0, ot: 0, totalPresent: 0 };
  for (let day = 1; day <= daysInMonth; day += 1) {
    const mark = row.dayMarks[day] || "";
    summary.totalPresent += registerPresentDayCreditForCell(mark, { year, month, day });
    if (isRegisterLeaveMark(mark)) summary.leave += 1;
    const isThirdSat = year && month && isThirdSaturdayOfMonth(year, month, day);
    if (mark === "WO" && !isThirdSat) {
      summary.weekoff += 1;
      if (manualMarksForEmp[day] === "WO") summary.appliedWo += 1;
    }
    if (isRegisterNhphMark(mark)) summary.nhph += 1;
  }
  return summary;
}

export function attachRegisterRowSummaries(rows, manualMarks, daysInMonth, { year, month } = {}) {
  return rows.map((row) => ({
    ...row,
    summary: computeEmployeeRegisterSummary(row, manualMarks[row.empCode] || {}, daysInMonth, { year, month }),
  }));
}

export function computeRegisterSummaryFooter(rows) {
  const footer = { leave: 0, weekoff: 0, appliedWo: 0, nhph: 0, ot: 0, totalPresent: 0 };
  for (const row of rows) {
    const s = row.summary;
    if (!s) continue;
    footer.leave += s.leave;
    footer.weekoff += s.weekoff;
    footer.appliedWo += s.appliedWo;
    footer.nhph += s.nhph;
    footer.ot += s.ot;
    footer.totalPresent += s.totalPresent;
  }
  return footer;
}

export function applyBulkRegisterMarks(manualMarks, gridRows, { empCodes, dayFrom, dayTo, mark, overwrite = false }) {
  const next = { ...manualMarks };
  const rowByCode = new Map(
    gridRows.map((r) => [normalizeAttendanceEmpCode(r.empCode), r])
  );
  const clearMark = mark == null || mark === "";

  for (const rawCode of empCodes) {
    const code = normalizeAttendanceEmpCode(rawCode);
    if (!code || !rowByCode.has(code)) continue;
    const empMarks = { ...(next[code] || {}) };

    for (let day = dayFrom; day <= dayTo; day += 1) {
      const manualCurrent = empMarks[day] || "";
      if (!overwrite && manualCurrent !== "") continue;
      if (clearMark) {
        delete empMarks[day];
      } else {
        empMarks[day] = mark;
      }
    }

    if (Object.keys(empMarks).length) next[code] = empMarks;
    else delete next[code];
  }

  return next;
}

export function computeMonthlyRegisterKpis(rows, daysInMonth) {
  const totals = { P: 0, L: 0, WO: 0, [REGISTER_MARK_NHPH]: 0, blank: 0 };
  for (const row of rows) {
    for (let day = 1; day <= daysInMonth; day += 1) {
      const mark = row.dayMarks[day] || "";
      if (mark === "P" || mark === "P(OD)") totals.P += 1;
      else if (mark === "WO") totals.WO += 1;
      else if (isRegisterNhphMark(mark)) totals[REGISTER_MARK_NHPH] += 1;
      else if (isRegisterLeaveMark(mark)) totals.L += 1;
      else if (!mark) totals.blank += 1;
      else totals.blank += 1;
    }
  }
  totals.leave = totals.L;
  return totals;
}

export function getRegisterSummaryCount(kpis, row) {
  if (row.key === "leave") return kpis.leave ?? 0;
  return kpis[row.key] ?? 0;
}

const REGISTER_SUMMARY_HEADERS = ["Leave", "Weekoff", "Applied WO", "NH/PH", "OT", "Total present"];

function summaryCellsForRow(row) {
  const s = row.summary || {};
  return [s.leave ?? 0, s.weekoff ?? 0, s.appliedWo ?? 0, s.nhph ?? 0, s.ot ?? 0, s.totalPresent ?? 0];
}

export const REGISTER_EMPLOYEE_SORT_KEYS = new Set([
  "employeeId",
  "empCode",
  "employeeName",
  "department",
]);

/** Sort register grid rows by fixed employee columns (Machine ID, code, name, dept). */
export function compareRegisterEmployeeSort(a, b, field, direction = "asc") {
  if (!REGISTER_EMPLOYEE_SORT_KEYS.has(field)) return 0;
  const asc = direction === "asc";
  const mul = asc ? 1 : -1;
  if (field === "empCode") {
    return (
      mul *
      String(a?.empCode ?? "").localeCompare(String(b?.empCode ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  }
  const as = String(a?.[field] ?? "").toLowerCase();
  const bs = String(b?.[field] ?? "").toLowerCase();
  if (as === bs) return 0;
  return as < bs ? -mul : mul;
}

export function sortRegisterEmployeeRows(rows, field, direction = "asc") {
  if (!field || !REGISTER_EMPLOYEE_SORT_KEYS.has(field)) return rows || [];
  return [...(rows || [])].sort((a, b) => compareRegisterEmployeeSort(a, b, field, direction));
}

export function buildMonthlyRegisterCsv(rows, daysInMonth, monthKey) {
  const dayHeaders = monthKey ? registerDayExportHeaders(monthKey, daysInMonth) : [];
  const header = [
    "S.No",
    "Machine ID",
    "Employee code",
    "Employee Name",
    "Department",
    ...(dayHeaders.length ? dayHeaders : Array.from({ length: daysInMonth }, (_, i) => `d${i + 1}`)),
    ...REGISTER_SUMMARY_HEADERS,
  ];
  const lines = rows.map((row, rowIdx) => {
    const days = Array.from({ length: daysInMonth }, (_, i) => row.dayMarks[i + 1] || "");
    return [rowIdx + 1, row.employeeId, row.empCode, row.employeeName, row.department || "", ...days, ...summaryCellsForRow(row)]
      .map(csvEscape)
      .join(",");
  });
  const footer = computeRegisterSummaryFooter(rows);
  const footerLine = [
    "Total",
    "",
    "",
    "",
    ...Array(daysInMonth).fill(""),
    footer.leave,
    footer.weekoff,
    footer.appliedWo,
    footer.nhph,
    footer.ot,
    footer.totalPresent,
  ]
    .map(csvEscape)
    .join(",");
  return [header.map(csvEscape).join(","), ...lines, footerLine].join("\r\n");
}

export async function downloadMonthlyRegisterExcel(rows, daysInMonth, monthKey) {
  const XLSX = await import("xlsx");
  const dayHeaders = registerDayExportHeaders(monthKey, daysInMonth);
  const header = [
    "S.No",
    "Machine ID",
    "Employee code",
    "Employee Name",
    "Department",
    ...dayHeaders,
    ...REGISTER_SUMMARY_HEADERS,
  ];
  const data = rows.map((row, rowIdx) => [
    rowIdx + 1,
    row.employeeId,
    row.empCode,
    row.employeeName,
    row.department || "",
    ...Array.from({ length: daysInMonth }, (_, i) => row.dayMarks[i + 1] || ""),
    ...summaryCellsForRow(row),
  ]);
  const footer = computeRegisterSummaryFooter(rows);
  data.push([
    "Total",
    "",
    "",
    "",
    ...Array(daysInMonth).fill(""),
    footer.leave,
    footer.weekoff,
    footer.appliedWo,
    footer.nhph,
    footer.ot,
    footer.totalPresent,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  rows.forEach((row, rowIdx) => {
    const dayRemarks = row.dayRemarks || {};
    for (let day = 1; day <= daysInMonth; day += 1) {
      const comment = String(dayRemarks[day] || "").trim();
      if (!comment) continue;
      const dayMark = row.dayMarks?.[day];
      if (!isRegisterCommentMark(dayMark)) continue;
      const excelRowIndex = rowIdx + 1;
      const excelColIndex = 4 + (day - 1);
      const cellAddress = XLSX.utils.encode_cell({ r: excelRowIndex, c: excelColIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: dayMark, t: "s" };
      if (!ws[cellAddress].c) ws[cellAddress].c = [];
      ws[cellAddress].c.hidden = true;
      ws[cellAddress].c.push({ a: "INDUS OS", t: comment });
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Register");
  XLSX.writeFile(wb, `daily-attendance-register-${monthKey}.xlsx`);
}

/** Full row including JSON payload (sync / export). */
const PUNCH_SELECT =
  "id,punch_key,employee_code,employee_name,punch_date,punch_time,device_name,direction,status,synced_at,source_payload";

/** Fast list query — no source_payload (large jsonb). */
export const PUNCH_LIST_SELECT =
  "id,punch_key,employee_code,employee_name,punch_date,punch_time,device_name,direction,status,synced_at";

export function normalizeDbDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return `${yyyy}-${mm}-${dd}`;
  }
  const dash = raw.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dash) {
    const [, dd, mm, yyyy] = dash;
    return `${yyyy}-${mm}-${dd}`;
  }
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;
  return null;
}

export function normalizeDbTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\b(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] || "00"}`;
}

export function mapDbPunchToViewRow(row) {
  const sourcePunchDate = row.source_payload?.PunchDate || row.source_payload?.PunchDateTime || "";
  const punchTime = row.punch_time || normalizeDbTime(sourcePunchDate) || normalizeDbTime(row.punch_date);
  return {
    id: row.id || row.punch_key,
    empCode: normalizeAttendanceEmpCode(row.employee_code),
    employeeName: row.employee_name || "",
    punchDate: row.punch_date || "",
    punchTime: punchTime ? String(punchTime).slice(0, 5) : "",
    deviceName: row.device_name || "",
    direction: row.direction || "",
    status: row.status || "",
    syncedAt: row.synced_at || "",
  };
}

export function isoDateToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readStoredShiftTimes() {
  try {
    return {
      expectedIn: localStorage.getItem(STORAGE_KEYS.expectedIn) || "09:00",
      expectedOut: localStorage.getItem(STORAGE_KEYS.expectedOut) || "18:00",
    };
  } catch {
    return { expectedIn: "09:00", expectedOut: "18:00" };
  }
}

export function writeStoredShiftTimes({ expectedIn, expectedOut }) {
  try {
    if (expectedIn) localStorage.setItem(STORAGE_KEYS.expectedIn, expectedIn);
    if (expectedOut) localStorage.setItem(STORAGE_KEYS.expectedOut, expectedOut);
  } catch {
    /* ignore */
  }
}

export function normalizeDirection(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (["in", "i", "1", "punch in", "punchin"].includes(v)) return "in";
  if (["out", "o", "0", "punch out", "punchout"].includes(v)) return "out";
  return "";
}

export function timeToMinutes(timeStr) {
  const m = String(timeStr || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatWorkedMinutes(minutes) {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Standard day: 8.5h minimum; above 9h flagged as long day (reports / analytics). */
export const WORKING_HOURS_SHORT_THRESHOLD_MIN = 8.5 * 60;
export const WORKING_HOURS_LONG_THRESHOLD_MIN = 9 * 60;

/** @returns {"short"|"long"|""} */
export function workingHoursHighlightTone(workedMinutes) {
  if (workedMinutes == null || !Number.isFinite(workedMinutes)) return "";
  if (workedMinutes < WORKING_HOURS_SHORT_THRESHOLD_MIN) return "short";
  if (workedMinutes > WORKING_HOURS_LONG_THRESHOLD_MIN) return "long";
  return "";
}

export function workingHoursRowClass(workedMinutes) {
  const tone = workingHoursHighlightTone(workedMinutes);
  if (tone === "short") return "bg-red-100 text-red-950";
  if (tone === "long") return "bg-amber-100 text-amber-950";
  return "";
}

export function weekdayShort(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

export function enumerateDates(fromDate, toDate) {
  const from = normalizeDbDate(fromDate);
  const to = normalizeDbDate(toDate);
  if (!from || !to || from > to) return [];
  const out = [];
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function comparePunchInStatus(punchIn, expectedIn) {
  const inMin = timeToMinutes(punchIn);
  const expMin = timeToMinutes(expectedIn);
  if (inMin == null || expMin == null) return "—";
  return inMin > expMin ? "Late" : "On time";
}

export function comparePunchOutStatus(punchOut, expectedOut) {
  const outMin = timeToMinutes(punchOut);
  const expMin = timeToMinutes(expectedOut);
  if (outMin == null || expMin == null) return "—";
  if (outMin < expMin) return "Early";
  if (outMin > expMin) return "Late";
  return "On time";
}

function sortPunchesByTime(punches) {
  return [...punches].sort((a, b) => {
    const ta = timeToMinutes(a.punchTime) ?? 0;
    const tb = timeToMinutes(b.punchTime) ?? 0;
    return ta - tb;
  });
}

function pickInOutTimes(sortedPunches) {
  let punchIn = "";
  let punchOut = "";
  let incomplete = false;
  const remarks = [];

  if (sortedPunches.length === 1) {
    punchIn = sortedPunches[0].punchTime;
    incomplete = true;
    remarks.push("No punch out");
  } else if (sortedPunches.length >= 2) {
    punchIn = sortedPunches[0].punchTime;
    punchOut = sortedPunches[sortedPunches.length - 1].punchTime;
    if (sortedPunches.length > 2) remarks.push(`Multiple punches (${sortedPunches.length})`);
  }

  if (punchIn && !punchOut) {
    incomplete = true;
    if (!remarks.some((r) => r.includes("No punch out"))) remarks.push("No punch out");
  }

  if (punchIn && punchOut) {
    const inM = timeToMinutes(punchIn);
    const outM = timeToMinutes(punchOut);
    if (inM != null && outM != null && outM < inM) {
      incomplete = true;
      remarks.push("Out before in (same day)");
    }
  }

  let workedMinutes = null;
  if (punchIn && punchOut && !incomplete) {
    const inM = timeToMinutes(punchIn);
    const outM = timeToMinutes(punchOut);
    if (inM != null && outM != null && outM >= inM) workedMinutes = outM - inM;
  } else if (punchIn && punchOut) {
    const inM = timeToMinutes(punchIn);
    const outM = timeToMinutes(punchOut);
    if (inM != null && outM != null && outM >= inM) workedMinutes = outM - inM;
  }

  if (incomplete && !remarks.length) remarks.push("Incomplete");

  return { punchIn, punchOut, workedMinutes, incomplete, remarks };
}

export function pairPunchesToDailyRows(punches, { expectedIn = "09:00", expectedOut = "18:00" } = {}) {
  const groups = new Map();

  for (const punch of punches) {
    const empCode = normalizeAttendanceEmpCode(punch.empCode);
    const punchDate = normalizeDbDate(punch.punchDate);
    if (!empCode || !punchDate) continue;
    const key = `${empCode}|${punchDate}`;
    if (!groups.has(key)) {
      groups.set(key, {
        empCode,
        employeeName: punch.employeeName || "",
        punchDate,
        punches: [],
      });
    }
    const g = groups.get(key);
    if (punch.employeeName && !g.employeeName) g.employeeName = punch.employeeName;
    g.punches.push(punch);
  }

  const rows = [];
  for (const g of groups.values()) {
    const sorted = sortPunchesByTime(g.punches);
    const { punchIn, punchOut, workedMinutes, incomplete, remarks } = pickInOutTimes(sorted);
    const punchCount = sorted.length;

    rows.push({
      id: `${g.empCode}|${g.punchDate}`,
      empCode: g.empCode,
      employeeName: g.employeeName,
      punchDate: g.punchDate,
      day: weekdayShort(g.punchDate),
      punchIn,
      punchOut,
      workedMinutes,
      workedHours: formatWorkedMinutes(workedMinutes),
      present: "Yes",
      punchInStatus: comparePunchInStatus(punchIn, expectedIn),
      punchOutStatus: comparePunchOutStatus(punchOut, expectedOut),
      punchCount,
      remarks: remarks.join("; ") || (incomplete ? "Incomplete" : ""),
      department: "",
      isAbsent: false,
    });
  }

  return rows;
}

export function masterMatchCode(employee) {
  return normalizeAttendanceEmpCode(employee?.[EMPLOYEE_MASTER_CODE_COL]);
}

export function mapMasterEmployee(row) {
  const rawCode = String(row[EMPLOYEE_MASTER_CODE_COL] ?? "").trim();
  const empCode = masterMatchCode(row);
  return {
    empCode,
    /** Exact master employee_code for register FK upserts (preserves leading zeros). */
    registerEmpCode: rawCode || empCode,
    employeeName: row.full_name || row.name || "",
    department: row.department || "",
    designation: row.designation || "",
    employeeId: row.employee_id || "",
  };
}

/** Register every lookup variant → exact master employee_code (FK-safe upserts). */
export function addMasterCodeToMap(map, rawCode) {
  const raw = String(rawCode ?? "").trim();
  if (!raw) return;
  for (const variant of attendanceEmpCodeLookupVariants(raw)) {
    map.set(variant, raw);
  }
  map.set(normalizeAttendanceEmpCode(raw), raw);
}

/** normalized emp code → exact employee_code on Employee Master (for register FK). */
export function buildMasterRegisterCodeMap(employees) {
  const map = new Map();
  for (const e of employees || []) {
    const raw = String(e.registerEmpCode ?? e.empCode ?? "").trim();
    if (raw) addMasterCodeToMap(map, raw);
  }
  return map;
}

/** Load active + inactive master codes (for register FK upserts). */
export async function fetchMasterRegisterCodeMap(supabase) {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("employee_code")
    .in("status", ["Active", "Inactive"]);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    addMasterCodeToMap(map, row.employee_code);
  }
  return map;
}

/** All normalized codes for register sync (master employees only). */
export function collectRegisterEmployeeCodes(employees) {
  const codes = new Set();
  for (const e of employees || []) {
    const n = normalizeAttendanceEmpCode(e.empCode);
    if (n) codes.add(n);
  }
  return [...codes];
}

export function toRegisterDbEmployeeCode(code, masterCodeMap) {
  const norm = normalizeAttendanceEmpCode(code);
  if (!norm) return "";
  return masterCodeMap?.get(norm) || norm;
}

export function mergeAbsentRows(dailyRows, activeEmployees, fromDate, toDate) {
  const dates = enumerateDates(fromDate, toDate);
  const presentKeys = new Set(dailyRows.map((r) => `${r.empCode}|${r.punchDate}`));
  const absentRows = [];

  for (const date of dates) {
    for (const emp of activeEmployees) {
      const code = emp.empCode;
      if (!code) continue;
      const key = `${code}|${date}`;
      if (presentKeys.has(key)) continue;
      absentRows.push({
        id: `absent|${code}|${date}`,
        empCode: code,
        employeeId: emp.employeeId || "",
        employeeName: emp.employeeName,
        punchDate: date,
        day: weekdayShort(date),
        punchIn: "",
        punchOut: "",
        workedMinutes: null,
        workedHours: "—",
        present: "No",
        punchInStatus: "—",
        punchOutStatus: "—",
        punchCount: 0,
        remarks: "Absent",
        department: emp.department || "",
        isAbsent: true,
      });
    }
  }

  return [...dailyRows, ...absentRows];
}

export function estimateAbsentGridSize(fromDate, toDate, employeeCount) {
  const days = enumerateDates(fromDate, toDate).length;
  return days * employeeCount;
}

export function computeDailyKpis(rows) {
  const present = rows.filter((r) => r.present === "Yes").length;
  const absent = rows.filter((r) => r.isAbsent || r.present === "No").length;
  const lateIn = rows.filter((r) => r.punchInStatus === "Late").length;
  const earlyOut = rows.filter((r) => r.punchOutStatus === "Early").length;
  const incomplete = rows.filter((r) => r.remarks && /incomplete|no punch out/i.test(r.remarks)).length;
  const withHours = rows.filter((r) => r.workedMinutes != null && r.workedMinutes > 0);
  const avgMinutes =
    withHours.length > 0
      ? Math.round(withHours.reduce((s, r) => s + r.workedMinutes, 0) / withHours.length)
      : null;

  return { present, absent, lateIn, earlyOut, incomplete, avgHours: formatWorkedMinutes(avgMinutes) };
}

export function getDailySortValue(row, sortKey) {
  switch (sortKey) {
    case "punchDate":
      return row.punchDate || "";
    case "empCode":
      return String(row.empCode || "").toLowerCase();
    case "employeeName":
      return String(row.employeeName || "").toLowerCase();
    case "punchIn":
      return row.punchIn || "";
    case "punchOut":
      return row.punchOut || "";
    case "workedHours":
      return row.workedMinutes ?? -1;
    case "present":
      return row.present || "";
    default:
      return String(row[sortKey] || "").toLowerCase();
  }
}

function applyPunchFilters(query, { fromDate, toDate, empCode, search }) {
  if (fromDate) query = query.gte("punch_date", fromDate);
  if (toDate) query = query.lte("punch_date", toDate);
  const rawCode = String(empCode || "").trim();
  if (rawCode && rawCode.toUpperCase() !== "ALL") {
    const variants = attendanceEmpCodeLookupVariants(rawCode);
    if (variants.length === 1) query = query.eq("employee_code", variants[0]);
    else if (variants.length) query = query.in("employee_code", variants);
  }
  const term = String(search || "").trim();
  if (term) {
    const q = `%${term.replace(/%/g, "")}%`;
    query = query.or(
      `employee_code.ilike.${q},employee_name.ilike.${q},device_name.ilike.${q},direction.ilike.${q},status.ilike.${q}`
    );
  }
  return query;
}

function applyPunchSort(query, sortKey, sortDir) {
  const asc = sortDir === "asc";
  switch (sortKey) {
    case "empCode":
      return query.order("employee_code", { ascending: asc, nullsFirst: false });
    case "employeeName":
      return query.order("employee_name", { ascending: asc, nullsFirst: false });
    case "deviceName":
      return query.order("device_name", { ascending: asc, nullsFirst: false });
    case "status":
      return query.order("status", { ascending: asc, nullsFirst: false });
    case "punchDateTime":
    default:
      return query
        .order("punch_date", { ascending: asc, nullsFirst: false })
        .order("punch_time", { ascending: asc, nullsFirst: false });
  }
}

/**
 * Paginated read from erp_attendance_punches (display path — no API call).
 */
export async function fetchAttendancePunchesPage(supabase, options = {}) {
  const {
    fromDate,
    toDate,
    empCode = "ALL",
    page = 1,
    pageSize = 50,
    search = "",
    sortKey = "punchDateTime",
    sortDir = "desc",
  } = options;

  const safePage = Math.max(1, page);
  const safeSize = Math.min(200, Math.max(1, pageSize));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  let query = supabase.from(ATTENDANCE_PUNCH_TABLE).select(PUNCH_LIST_SELECT, { count: "exact" });
  query = applyPunchFilters(query, { fromDate, toDate, empCode, search });
  query = applyPunchSort(query, sortKey, sortDir);
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data || []).map(mapDbPunchToViewRow),
    total: count ?? 0,
    page: safePage,
    pageSize: safeSize,
  };
}

export async function fetchAttendancePunchesInRange(supabase, { fromDate, toDate, empCode }) {
  const all = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from(ATTENDANCE_PUNCH_TABLE)
      .select(PUNCH_LIST_SELECT)
      .order("punch_date", { ascending: true })
      .order("punch_time", { ascending: true })
      .range(offset, offset + PUNCH_FETCH_CHUNK - 1);

    if (fromDate) query = query.gte("punch_date", fromDate);
    if (toDate) query = query.lte("punch_date", toDate);
    const rawCode = String(empCode || "").trim();
    if (rawCode && rawCode.toUpperCase() !== "ALL") {
      const variants = attendanceEmpCodeLookupVariants(rawCode);
      if (variants.length === 1) query = query.eq("employee_code", variants[0]);
      else if (variants.length) query = query.in("employee_code", variants);
    }

    const { data, error } = await query;
    if (error) throw error;
    const chunk = (data || []).map(mapDbPunchToViewRow);
    all.push(...chunk);
    if (chunk.length < PUNCH_FETCH_CHUNK) break;
    offset += PUNCH_FETCH_CHUNK;
  }

  return all;
}

export async function fetchActiveEmployees(supabase) {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("employee_code,employee_id,full_name,department,designation,status")
    .eq("status", "Active");
  if (error) throw error;
  return (data || []).map(mapMasterEmployee).filter((e) => e.employeeId || e.empCode);
}

/** Inactive (removed/deactivated) employees still on master — shown when they have month activity. */
export async function fetchInactiveEmployeesFromMaster(supabase) {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("employee_code,employee_id,full_name,department,designation,status")
    .eq("status", "Inactive");
  if (error) throw error;
  return (data || []).map(mapMasterEmployee).filter((e) => e.empCode);
}

/** Active employees with a non-empty employee_code (required for register saves + FK). */
export async function fetchActiveEmployeesForRegister(supabase) {
  const all = await fetchActiveEmployees(supabase);
  return all.filter((e) => e.empCode);
}

/**
 * Turn Supabase/PostgREST errors into actionable attendance messages.
 */
export function formatAttendanceSupabaseError(err) {
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  const details = String(err?.details || "");

  if (code === "PGRST205" || /schema cache|relation.*does not exist/i.test(msg)) {
    return `Attendance table is missing. Run Supabase migrations for ${ATTENDANCE_PUNCH_TABLE} and ${ATTENDANCE_REGISTER_TABLE}, then reload.`;
  }

  if (
    code === "23503" ||
    /foreign key constraint/i.test(msg) ||
    /violates foreign key/i.test(msg) ||
    /employee_code_fkey/i.test(msg)
  ) {
    return (
      "This employee code is not on Employee Master (or employee_code is empty there). " +
      "Open Employee Master, set employee_code to the same value as eTimeOffice / raw attendance (e.g. 9750), then save the mark again."
    );
  }

  if (code === "23514" || /admin_attendance_register_mark_check/i.test(msg)) {
    return "Invalid attendance mark. Allowed values: P, P(OD), L, WO, NH/PH.";
  }

  if (code === "409" && /employee_code_fkey/i.test(msg)) {
    return (
      "Employee code not found on Employee Master. Add or fix employee_code on the employee record, then retry."
    );
  }

  return msg || details || "Unable to complete attendance operation.";
}

export function attachDepartments(dailyRows, activeEmployees) {
  const deptByCode = new Map(activeEmployees.map((e) => [e.empCode, e.department || ""]));
  return dailyRows.map((r) => ({
    ...r,
    department: r.department || deptByCode.get(r.empCode) || "",
  }));
}

export function attachMasterFields(dailyRows, activeEmployees) {
  const byCode = new Map(activeEmployees.map((e) => [e.empCode, e]));
  return dailyRows.map((r) => {
    const master = byCode.get(r.empCode);
    return {
      ...r,
      employeeName: r.employeeName || master?.employeeName || "",
      department: r.department || master?.department || "",
      designation: master?.designation || "",
      employeeId: master?.employeeId || r.employeeId || "",
    };
  });
}

const CSV_COLUMNS = [
  { key: "empCode", label: "Emp code" },
  { key: "employeeName", label: "Employee" },
  { key: "department", label: "Department" },
  { key: "punchDate", label: "Date" },
  { key: "day", label: "Day" },
  { key: "punchIn", label: "Punch in" },
  { key: "punchOut", label: "Punch out" },
  { key: "workedHours", label: "Worked hours" },
  { key: "present", label: "Present" },
  { key: "punchInStatus", label: "Punch-in status" },
  { key: "punchOutStatus", label: "Punch-out status" },
  { key: "punchCount", label: "Punch count" },
  { key: "remarks", label: "Remarks" },
];

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildDailyAttendanceCsv(rows) {
  const header = CSV_COLUMNS.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => CSV_COLUMNS.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

export function downloadCsv(content, filename) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildDailyRegisterRows(punches, activeEmployees, options) {
  const {
    fromDate,
    toDate,
    expectedIn = "09:00",
    expectedOut = "18:00",
    showAbsent = false,
    empCodeFilter = "",
  } = options;

  let daily = pairPunchesToDailyRows(punches, { expectedIn, expectedOut });
  daily = attachDepartments(daily, activeEmployees);

  let employees = activeEmployees;
  const codeFilter = normalizeAttendanceEmpCode(empCodeFilter);
  if (codeFilter && String(empCodeFilter || "").trim().toUpperCase() !== "ALL") {
    employees = employees.filter((e) => e.empCode === codeFilter);
    daily = daily.filter((r) => r.empCode === codeFilter);
  }

  if (showAbsent) {
    const gridSize = estimateAbsentGridSize(fromDate, toDate, employees.length);
    if (gridSize > ABSENT_GRID_CAP) {
      return {
        rows: daily,
        gridTooLarge: true,
        gridSize,
        cap: ABSENT_GRID_CAP,
      };
    }
    daily = mergeAbsentRows(daily, employees, fromDate, toDate);
    daily = attachDepartments(daily, activeEmployees);
  }

  daily.sort((a, b) => {
    const d = (b.punchDate || "").localeCompare(a.punchDate || "");
    if (d !== 0) return d;
    return String(a.empCode).localeCompare(String(b.empCode));
  });

  return { rows: daily, gridTooLarge: false, gridSize: 0, cap: ABSENT_GRID_CAP };
}
