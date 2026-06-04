/** Daily attendance register — pair raw punches into per-employee per-day rows. */

import {
  filterPresentRegisterRowsRespectingMarks,
  marksByEmpDayFromRegisterDbRows,
  punchesToPresentRegisterRows,
  registerDateRangeFromRows,
} from "../../shared/attendanceRegisterSync.mjs";

export const ATTENDANCE_PUNCH_TABLE = "erp_attendance_punches";
export const ATTENDANCE_REGISTER_TABLE = "admin_attendance_register";
export const EMPLOYEE_MASTER_TABLE = "admin_ifsp_employee_master";
/** DB column: eTimeOffice punch / attendance join key (not employee_id). */
export const EMPLOYEE_MASTER_CODE_COL = "employee_code";
export const REGISTER_MARK_UPSERT_CHUNK = 200;
export const PUNCH_FETCH_CHUNK = 1000;
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

/** Marks that count toward monthly present-day totals (payroll / register summary). */
const REGISTER_PRESENT_CREDIT_MARKS = new Set(["P", "P(OD)", "T", "CO"]);

/**
 * Present-day credit for one register cell (0, 0.5, or 1).
 * CO counts as present; leave / WO / NH/PH do not.
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
 * Unmarked = no punch and no stored mark (blank cell).
 */
export function computeDayAttendanceBreakdown(rows, day) {
  const presentEmployees = [];
  const markedOtherEmployees = [];
  const unmarkedEmployees = [];
  const allEmployees = [];
  for (const row of rows || []) {
    const dayMark = row.dayMarks?.[day] || "";
    const entry = { ...row, dayMark };
    allEmployees.push(entry);
    if (isRegisterEffectivePresentMark(dayMark)) presentEmployees.push(entry);
    else if (!dayMark) unmarkedEmployees.push(entry);
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

/** Inner select — transparent; color comes from wrapper only (open list stays neutral via CSS). */
export const REGISTER_MARK_SELECT_INNER =
  "register-mark-select w-full h-8 px-1 text-[11px] font-semibold text-center appearance-none cursor-pointer bg-transparent border-0 focus:outline-none focus:ring-0";

export function isRegisterLeaveMark(mark) {
  return REGISTER_LEAVE_MARKS.has(mark);
}

/** Colored box behind the closed cell only (not the open dropdown list). */
export function registerMarkCellWrapperClass(value) {
  if (value === "P" || value === "P(OD)") {
    return `${REGISTER_MARK_WRAPPER_BASE} border-[#006b51] bg-[#008D62]`;
  }
  if (value === "L" || REGISTER_LEAVE_RED_CELL_MARKS.has(value)) {
    return `${REGISTER_MARK_WRAPPER_BASE} border-[#b82222] bg-[#D62828]`;
  }
  if (value === "WO") {
    return `${REGISTER_MARK_WRAPPER_BASE} border-[#CA8A04] bg-[#EAB308]`;
  }
  if (isRegisterNhphMark(value)) {
    return `${REGISTER_MARK_WRAPPER_BASE} border-[#d9741d] bg-[#F58220]`;
  }
  return `${REGISTER_MARK_WRAPPER_BASE} border-gray-300 bg-gray-100`;
}

export function registerMarkSelectTextClass(value) {
  if (!value) return "text-gray-600";
  if (value === "WO") return "text-gray-900";
  return "text-white";
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

export function registerDateFromDay(monthKey, day) {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

/** Column header in grid: calendar day/month (e.g. 01/05). */
export function registerDayTableLabel(monthKey, day) {
  const parts = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  const mm = parts ? parts[2] : "";
  const dd = String(day).padStart(2, "0");
  return mm ? `${dd}/${mm}` : dd;
}

/** Export headers: full ISO date per day. */
export function registerDayExportHeaders(monthKey, daysInMonth) {
  return Array.from({ length: daysInMonth }, (_, i) => registerDateFromDay(monthKey, i + 1));
}

/** DB rows → manualMarks[empCode][dayNumber]. */
export function dbRowsToManualMarks(rows) {
  const marks = {};
  for (const row of rows || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const day = dayOfMonthFromIsoDate(row.register_date);
    const mark = normalizeRegisterMarkForDb(row.mark);
    if (!code || !day || !mark) continue;
    if (!marks[code]) marks[code] = {};
    marks[code][day] = mark;
  }
  return marks;
}

/** DB rows -> manualRemarks[empCode][dayNumber] (for P(OD) comments). */
export function dbRowsToManualRemarks(rows) {
  const remarks = {};
  for (const row of rows || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const day = dayOfMonthFromIsoDate(row.register_date);
    const mark = normalizeRegisterMarkForDb(row.mark);
    const remark = String(row.mark_remark || "").trim();
    if (!code || !day || mark !== "P(OD)" || !remark) continue;
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

export async function fetchRegisterMarksForMonth(supabase, { fromDate, toDate }) {
  const { data, error } = await supabase
    .from(ATTENDANCE_REGISTER_TABLE)
    .select("employee_code,register_date,mark,mark_remark")
    .gte("register_date", fromDate)
    .lte("register_date", toDate);
  if (error) throw error;
  return {
    marks: dbRowsToManualMarks(data),
    remarks: dbRowsToManualRemarks(data),
  };
}

/** All register mark rows for a calendar year (leave limits, CO validation, alerts). */
export async function fetchRegisterMarksForYear(supabase, year) {
  const y = Number(year) || new Date().getFullYear();
  const fromDate = `${y}-01-01`;
  const toDate = `${y}-12-31`;
  const { data, error } = await supabase
    .from(ATTENDANCE_REGISTER_TABLE)
    .select("employee_code,register_date,mark,mark_remark")
    .gte("register_date", fromDate)
    .lte("register_date", toDate);
  if (error) throw error;
  return (data || []).map((row) => ({
    employee_code: normalizeAttendanceEmpCode(row.employee_code),
    register_date: String(row.register_date || "").slice(0, 10),
    mark: row.mark,
    mark_remark: row.mark_remark ?? null,
  }));
}

/**
 * Upsert Present (P) from punches into the register.
 * When raw punch data exists for a day, it overwrites any existing mark (leave, manual, etc.).
 */
export async function syncRegisterMarksFromPunches(supabase, punches, options = {}) {
  const { respectManualMarks = false, fromDate: fromOverride, toDate: toOverride } = options;
  const candidateRows = punchesToPresentRegisterRows(punches);
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
      .select("employee_code,register_date,mark,mark_source,leave_request_id")
      .gte("register_date", fromDate)
      .lte("register_date", toDate);
    if (error) throw error;
    const marksByEmpDay = marksByEmpDayFromRegisterDbRows(data, normalizeRegisterMarkForDb);
    toUpsert = filterPresentRegisterRowsRespectingMarks(candidateRows, marksByEmpDay);
  }

  if (toUpsert.length) {
    await upsertRegisterMarksBatch(supabase, toUpsert);
  }

  return {
    upserted: toUpsert.length,
    skipped: candidateRows.length - toUpsert.length,
    candidates: candidateRows.length,
  };
}

/** Include employees who punched but are missing from the active master list. */
export function mergeActiveEmployeesWithPunches(activeEmployees, punches) {
  const byCode = new Map();
  for (const e of activeEmployees || []) {
    const code = normalizeAttendanceEmpCode(e.empCode);
    if (code) byCode.set(code, e);
  }
  for (const punch of punches || []) {
    const code = normalizeAttendanceEmpCode(punch.empCode ?? punch.employee_code);
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      empCode: code,
      employeeName: punch.employeeName || punch.employee_name || code,
      employeeId: "",
      department: "",
      designation: "",
    });
  }
  return [...byCode.values()].sort((a, b) =>
    String(a.employeeName || a.empCode).localeCompare(String(b.employeeName || b.empCode), undefined, {
      sensitivity: "base",
    })
  );
}

export async function upsertRegisterMarksBatch(supabase, rows) {
  const normalized = (rows || [])
    .map((row) => {
      const employee_code = normalizeAttendanceEmpCode(row.employee_code);
      const mark = normalizeRegisterMarkForDb(row.mark);
      if (!employee_code || !mark) return null;
      const mark_remark = mark === "P(OD)" ? String(row.mark_remark || "").trim() || null : null;
      return { ...row, employee_code, mark, mark_remark };
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

export async function deleteRegisterMarksBatch(supabase, deletes) {
  for (const { employee_code, register_date } of deletes) {
    const code = normalizeAttendanceEmpCode(employee_code);
    const { error } = await supabase
      .from(ATTENDANCE_REGISTER_TABLE)
      .delete()
      .eq("employee_code", code)
      .eq("register_date", register_date);
    if (error) throw error;
  }
}

export async function upsertRegisterMark(supabase, empCode, registerDate, mark, markRemark = "") {
  const code = normalizeAttendanceEmpCode(empCode);
  const date = normalizeDbDate(registerDate);
  if (!code || !date) return;
  const canonical = normalizeRegisterMarkForDb(mark);
  if (!canonical) {
    await deleteRegisterMarksBatch(supabase, [{ employee_code: code, register_date: date }]);
    return;
  }
  await upsertRegisterMarksBatch(supabase, [
    {
      employee_code: code,
      register_date: date,
      month_key: date.slice(0, 7),
      mark: canonical,
      mark_remark: canonical === "P(OD)" ? String(markRemark || "").trim() || null : null,
      mark_source: "manual",
      leave_request_id: null,
      updated_at: new Date().toISOString(),
    },
  ]);
}

/** One-time: copy browser marks to Supabase when DB is empty for the month. */
export async function migrateLocalRegisterMarksToDb(supabase, monthKey, fromDate, toDate) {
  const local = readStoredRegisterMarks(monthKey);
  const rows = manualMarksToDbRows(local, monthKey);
  if (!rows.length) return false;
  await upsertRegisterMarksBatch(supabase, rows);
  return true;
}

export async function loadRegisterMarksForMonth(supabase, monthMeta) {
  let data = await fetchRegisterMarksForMonth(supabase, {
    fromDate: monthMeta.fromDate,
    toDate: monthMeta.toDate,
  });
  const hasDb = Object.keys(data.marks || {}).length > 0;
  const local = readStoredRegisterMarks(monthMeta.monthKey);
  const hasLocal = Object.keys(local).length > 0;
  if (!hasDb && hasLocal) {
    await migrateLocalRegisterMarksToDb(supabase, monthMeta.monthKey, monthMeta.fromDate, monthMeta.toDate);
    data = await fetchRegisterMarksForMonth(supabase, {
      fromDate: monthMeta.fromDate,
      toDate: monthMeta.toDate,
    });
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

  const withSummary = attachRegisterRowSummaries(rows, manualMarks.marks || {}, daysInMonth);

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

export function computeEmployeeRegisterSummary(row, manualMarksForEmp = {}, daysInMonth) {
  const summary = { leave: 0, weekoff: 0, appliedWo: 0, nhph: 0, ot: 0, totalPresent: 0 };
  for (let day = 1; day <= daysInMonth; day += 1) {
    const mark = row.dayMarks[day] || "";
    summary.totalPresent += registerPresentDayCredit(mark);
    if (isRegisterLeaveMark(mark)) summary.leave += 1;
    if (mark === "WO") {
      summary.weekoff += 1;
      if (manualMarksForEmp[day] === "WO") summary.appliedWo += 1;
    }
    if (isRegisterNhphMark(mark)) summary.nhph += 1;
  }
  return summary;
}

export function attachRegisterRowSummaries(rows, manualMarks, daysInMonth) {
  return rows.map((row) => ({
    ...row,
    summary: computeEmployeeRegisterSummary(row, manualMarks[row.empCode] || {}, daysInMonth),
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
  const rowByCode = new Map(gridRows.map((r) => [r.empCode, r]));
  const clearMark = mark == null || mark === "";

  for (const code of empCodes) {
    const row = rowByCode.get(code);
    if (!row) continue;
    const empMarks = { ...(next[code] || {}) };

    for (let day = dayFrom; day <= dayTo; day += 1) {
      const current = row.dayMarks[day] || "";
      if (!overwrite && current !== "") continue;
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

export function buildMonthlyRegisterCsv(rows, daysInMonth, monthKey) {
  const dayHeaders = monthKey ? registerDayExportHeaders(monthKey, daysInMonth) : [];
  const header = [
    "Employee ID",
    "Employee code",
    "Employee Name",
    ...(dayHeaders.length ? dayHeaders : Array.from({ length: daysInMonth }, (_, i) => `d${i + 1}`)),
    ...REGISTER_SUMMARY_HEADERS,
  ];
  const lines = rows.map((row) => {
    const days = Array.from({ length: daysInMonth }, (_, i) => row.dayMarks[i + 1] || "");
    return [row.employeeId, row.empCode, row.employeeName, ...days, ...summaryCellsForRow(row)].map(csvEscape).join(",");
  });
  const footer = computeRegisterSummaryFooter(rows);
  const footerLine = [
    "Total",
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
  const header = ["Employee ID", "Employee code", "Employee Name", ...dayHeaders, ...REGISTER_SUMMARY_HEADERS];
  const data = rows.map((row) => [
    row.employeeId,
    row.empCode,
    row.employeeName,
    ...Array.from({ length: daysInMonth }, (_, i) => row.dayMarks[i + 1] || ""),
    ...summaryCellsForRow(row),
  ]);
  const footer = computeRegisterSummaryFooter(rows);
  data.push([
    "Total",
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
      if (row.dayMarks?.[day] !== "P(OD)") continue;
      const excelRowIndex = rowIdx + 1;
      const excelColIndex = 3 + (day - 1);
      const cellAddress = XLSX.utils.encode_cell({ r: excelRowIndex, c: excelColIndex });
      if (!ws[cellAddress]) ws[cellAddress] = { v: "P(OD)", t: "s" };
      ws[cellAddress].c = [{ a: "INDUS OS", t: comment }];
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Register");
  const podComments = [
    ["Employee ID", "Employee code", "Employee Name", "Date", "Mark", "Comment"],
    ...rows.flatMap((row) =>
      Array.from({ length: daysInMonth }, (_, i) => i + 1)
        .filter((day) => row.dayMarks[day] === "P(OD)" && row.dayRemarks?.[day])
        .map((day) => [
          row.employeeId || "",
          row.empCode || "",
          row.employeeName || "",
          registerDateFromDay(monthKey, day),
          "P(OD)",
          row.dayRemarks[day],
        ])
    ),
  ];
  const commentsSheet = XLSX.utils.aoa_to_sheet(podComments);
  XLSX.utils.book_append_sheet(wb, commentsSheet, "POD Comments");
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
  return {
    empCode: masterMatchCode(row),
    employeeName: row.full_name || row.name || "",
    department: row.department || "",
    designation: row.designation || "",
    employeeId: row.employee_id || "",
  };
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
