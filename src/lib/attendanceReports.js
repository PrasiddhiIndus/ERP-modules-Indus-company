/**
 * Admin attendance reports from erp_attendance_punches (raw data).
 */

import {
  attachDepartments,
  attachMasterFields,
  downloadCsv,
  fetchActiveEmployees,
  fetchAttendancePunchesInRange,
  formatWorkedMinutes,
  pairPunchesToDailyRows,
  timeToMinutes,
  WORKING_HOURS_LONG_THRESHOLD_MIN,
} from "./attendanceDaily";

/** Flag punch-in after this time (09:00). */
export const LATE_PUNCH_IN_THRESHOLD = "09:00";
export const LATE_PUNCH_IN_THRESHOLD_MIN = 9 * 60;

export const CUSTOM_REPORT_FIELDS = [
  { id: "empCode", label: "Employee code" },
  { id: "employeeName", label: "Employee name" },
  { id: "department", label: "Department" },
  { id: "designation", label: "Designation" },
  { id: "punchDate", label: "Date" },
  { id: "day", label: "Day" },
  { id: "punchIn", label: "Punch in" },
  { id: "punchOut", label: "Punch out" },
  { id: "workedHours", label: "Worked hours" },
  { id: "punchCount", label: "Punch count" },
  { id: "lateInAfter9", label: "Late in (after 9:00)" },
  { id: "overtime", label: "Overtime (>9h)" },
  { id: "remarks", label: "Remarks" },
];

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function isPunchInAfter9(punchIn) {
  const inMin = timeToMinutes(punchIn);
  if (inMin == null) return false;
  return inMin > LATE_PUNCH_IN_THRESHOLD_MIN;
}

export function isOvertimeRow(row) {
  const m = row.workedMinutes;
  return m != null && m > WORKING_HOURS_LONG_THRESHOLD_MIN;
}

export async function buildDailyAttendanceReportRows(supabase, { fromDate, toDate, empCode = "ALL" }) {
  const [punches, employees] = await Promise.all([
    fetchAttendancePunchesInRange(supabase, { fromDate, toDate, empCode }),
    fetchActiveEmployees(supabase),
  ]);
  let rows = pairPunchesToDailyRows(punches);
  rows = attachMasterFields(rows, employees);
  rows = attachDepartments(rows, employees);
  return rows.map((r) => ({
    ...r,
    lateInAfter9: isPunchInAfter9(r.punchIn) ? "Yes" : "No",
    overtime: isOvertimeRow(r) ? "Yes" : "No",
  }));
}

export function filterLatePunchAfter9Rows(rows) {
  return (rows || []).filter((r) => isPunchInAfter9(r.punchIn));
}

export function filterOvertimeRows(rows) {
  return (rows || []).filter((r) => isOvertimeRow(r));
}

export function applyCustomReportFilters(rows, filters = {}) {
  let list = [...(rows || [])];
  const dept = String(filters.department || "").trim();
  if (dept && dept !== "ALL") {
    list = list.filter((r) => String(r.department || "").trim() === dept);
  }
  const code = String(filters.empCode || "").trim();
  if (code) {
    const c = code.toLowerCase();
    list = list.filter((r) => String(r.empCode || "").toLowerCase().includes(c));
  }
  const name = String(filters.nameSearch || "").trim().toLowerCase();
  if (name) {
    list = list.filter(
      (r) =>
        String(r.employeeName || "").toLowerCase().includes(name) ||
        String(r.empCode || "").toLowerCase().includes(name)
    );
  }
  if (filters.lateInOnly) list = filterLatePunchAfter9Rows(list);
  if (filters.overtimeOnly) list = filterOvertimeRows(list);
  const minH = Number(filters.minWorkedHours);
  if (Number.isFinite(minH) && minH > 0) {
    list = list.filter((r) => r.workedMinutes != null && r.workedMinutes >= minH * 60);
  }
  const maxH = Number(filters.maxWorkedHours);
  if (Number.isFinite(maxH) && maxH > 0) {
    list = list.filter((r) => r.workedMinutes != null && r.workedMinutes <= maxH * 60);
  }
  return list;
}

export function buildReportCsv(rows, columnIds) {
  const cols = CUSTOM_REPORT_FIELDS.filter((c) => columnIds.includes(c.id));
  const header = cols.map((c) => csvEscape(c.label)).join(",");
  const lines = (rows || []).map((row) =>
    cols.map((c) => csvEscape(row[c.id])).join(",")
  );
  return [header, ...lines].join("\r\n");
}

export function exportReportCsv(rows, columnIds, filename) {
  downloadCsv(buildReportCsv(rows, columnIds), filename);
}

/** Attach day-level punch in/out to each raw punch row for display. */
export function enrichRawPunchesWithDayInOut(punchRows, dailyRows = null) {
  const daily = dailyRows || pairPunchesToDailyRows(punchRows);
  const byKey = new Map(daily.map((d) => [`${d.empCode}|${d.punchDate}`, d]));
  return (punchRows || []).map((row) => {
    const key = `${row.empCode}|${row.punchDate}`;
    const day = byKey.get(key);
    return {
      ...row,
      dayPunchIn: day?.punchIn || "",
      dayPunchOut: day?.punchOut || "",
    };
  });
}

export async function fetchRawPunchesDailySummaryPage(
  supabase,
  { fromDate, toDate, empCode = "ALL", page = 1, pageSize = 50, search = "" }
) {
  const rows = await buildDailyAttendanceReportRows(supabase, { fromDate, toDate, empCode });
  const q = String(search || "").trim().toLowerCase();
  let filtered = rows;
  if (q) {
    filtered = rows.filter(
      (r) =>
        String(r.empCode || "").toLowerCase().includes(q) ||
        String(r.employeeName || "").toLowerCase().includes(q) ||
        String(r.department || "").toLowerCase().includes(q)
    );
  }
  filtered.sort((a, b) => {
    const d = String(b.punchDate).localeCompare(String(a.punchDate));
    if (d !== 0) return d;
    return String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true });
  });
  const total = filtered.length;
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safeSize;
  return {
    rows: filtered.slice(start, start + safeSize),
    total,
    page: safePage,
    pageSize: safeSize,
  };
}
