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
      mark_source: 'punch',
      leave_request_id: null,
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

const MANUAL_MARK_SOURCES = new Set(['manual', 'hr', 'admin', 'erp_manual', 'erp', 'm']);
const PUNCH_MARK_SOURCES = new Set(['punch', 'biometric', 'device', 'auto', 'machine']);

export function isManualMarkSource(markSource) {
  return MANUAL_MARK_SOURCES.has(String(markSource ?? '').trim().toLowerCase());
}

export function isLeaveMarkSource(markSource, leaveRequestId) {
  if (leaveRequestId) return true;
  return String(markSource ?? '').trim().toLowerCase() === 'leave';
}

export function isTourMarkSource(markSource, tourRequestId) {
  if (tourRequestId) return true;
  return String(markSource ?? '').trim().toLowerCase() === 'tour';
}

export function isPunchMarkSource(mark, markSource) {
  const src = String(markSource ?? '').trim().toLowerCase();
  if (PUNCH_MARK_SOURCES.has(src)) return true;
  if (!markSource) {
    const m = String(mark ?? '').trim().toUpperCase();
    return m === 'P' || m === 'P(OD)';
  }
  return false;
}

/**
 * Whether biometric punch sync may upsert Present for this existing register row.
 * Punch (machine) data has priority over leave marks (L, PL, CL, …) but not manual HR marks.
 */
export function canPunchSyncOverwriteExisting(existing) {
  if (!existing) return true;
  const mark = existing.mark ?? '';
  const markNorm = String(mark ?? '').trim();
  const markSource = existing.mark_source ?? null;
  const leaveRequestId = existing.leave_request_id ?? null;
  const tourRequestId = existing.tour_request_id ?? null;
  if (isTourMarkSource(markSource, tourRequestId)) return true;
  if (markNorm === 'P(OD)' || markNorm === 'T') return false;
  if (String(existing.mark_remark ?? '').trim()) return false;
  if (!mark && !markSource) return true;
  if (isManualMarkSource(markSource)) return false;
  if (isLeaveMarkSource(markSource, leaveRequestId)) return true;
  if (isPunchMarkSource(mark, markSource)) return true;
  if (mark === REGISTER_MARK_FROM_PUNCH) return true;
  if (mark === 'WO') {
    const src = String(markSource ?? '').trim().toLowerCase();
    if (isManualMarkSource(src)) return false;
    if (src === 'auto_wo') return false;
    return true;
  }
  return false;
}

/**
 * Skip only manual marks; punch sync may overwrite leave and other non-manual marks.
 * @param {Record<string, Record<number, { mark?: string, mark_source?: string, leave_request_id?: string }>>} marksByEmpDay
 */
export function filterPresentRegisterRowsRespectingMarks(candidateRows, marksByEmpDay) {
  return candidateRows.filter((row) => {
    const day = dayOfMonthFromIsoDate(row.register_date);
    if (!day) return false;
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const existing = marksByEmpDay[code]?.[day];
    return canPunchSyncOverwriteExisting(existing);
  });
}

export function marksByEmpDayFromRegisterDbRows(dbRows, normalizeMarkFn) {
  const marks = {};
  for (const row of dbRows || []) {
    const code = normalizeAttendanceEmpCode(row.employee_code);
    const day = dayOfMonthFromIsoDate(row.register_date);
    if (!code || !day) continue;
    const mark = normalizeMarkFn ? normalizeMarkFn(row.mark) : String(row.mark || '').trim();
    if (!marks[code]) marks[code] = {};
    marks[code][day] = {
      mark: mark || '',
      mark_source: row.mark_source ?? null,
      leave_request_id: row.leave_request_id ?? null,
      tour_request_id: row.tour_request_id ?? null,
      mark_remark: row.mark_remark ?? null,
    };
  }
  return marks;
}
