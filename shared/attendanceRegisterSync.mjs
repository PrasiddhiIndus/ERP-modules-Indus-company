/**
 * Punch → daily register (Present) row mapping.
 * Shared by browser (attendanceDaily) and Node (attendanceEtime).
 */

import { normalizeAttendanceEmpCode, normalizeDbDate } from './attendancePunchSync.mjs';

export const REGISTER_MARK_FROM_PUNCH = 'P';

export function dayOfMonthFromIsoDate(isoDate) {
  const d = normalizeDbDate(isoDate);
  if (!d) return null;
  return Number(d.slice(8, 10));
}

/** One register row per employee per calendar day that has at least one punch. */
export function punchesToPresentRegisterRows(punches) {
  const seen = new Set();
  const rows = [];
  for (const punch of punches || []) {
    const employee_code = normalizeAttendanceEmpCode(punch.empCode ?? punch.employee_code);
    const register_date = normalizeDbDate(punch.punchDate ?? punch.punch_date);
    if (!employee_code || !register_date) continue;
    const key = `${employee_code}|${register_date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      employee_code,
      register_date,
      month_key: register_date.slice(0, 7),
      mark: REGISTER_MARK_FROM_PUNCH,
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

export function registerDateRangeFromRows(rows) {
  if (!rows?.length) return { fromDate: null, toDate: null };
  let fromDate = rows[0].register_date;
  let toDate = rows[0].register_date;
  for (const row of rows) {
    if (row.register_date < fromDate) fromDate = row.register_date;
    if (row.register_date > toDate) toDate = row.register_date;
  }
  return { fromDate, toDate };
}

/**
 * Do not overwrite explicit non-P marks (L, WO, P(OD), NH/PH).
 * @param {Record<string, Record<number, string>>} marksByEmpDay
 */
export function filterPresentRegisterRowsRespectingMarks(candidateRows, marksByEmpDay) {
  return candidateRows.filter((row) => {
    const day = dayOfMonthFromIsoDate(row.register_date);
    if (!day) return false;
    const existing = marksByEmpDay[row.employee_code]?.[day];
    if (existing == null || existing === '') return true;
    if (existing === REGISTER_MARK_FROM_PUNCH) return true;
    return false;
  });
}

export function marksByEmpDayFromRegisterDbRows(dbRows, normalizeMarkFn) {
  const marks = {};
  for (const row of dbRows || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const day = dayOfMonthFromIsoDate(row.register_date);
    const mark = normalizeMarkFn ? normalizeMarkFn(row.mark) : String(row.mark || '').trim();
    if (!code || !day || !mark) continue;
    if (!marks[code]) marks[code] = {};
    marks[code][day] = mark;
  }
  return marks;
}
