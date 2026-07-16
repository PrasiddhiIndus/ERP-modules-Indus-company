/**
 * Punch → daily register (Present / Half Day) row mapping.
 * Shared by browser (attendanceDaily) and Node (attendanceEtime).
 */

import {
  normalizeAttendanceEmpCode,
  normalizeDbDate,
  normalizeDbTime,
  timeToMinutes,
} from './attendancePunchSync.mjs';

export const REGISTER_MARK_FROM_PUNCH = 'P';
export const HALF_DAY_CUTOFF = '13:00';

/** Marks written solely from biometric punch sync (may update P ↔ HD on re-sync). */
export const PUNCH_DERIVED_REGISTER_MARKS = new Set(['P', 'HD']);

/** Half-day leave composites — punch sync must never replace these. */
export const REGISTER_HALF_DAY_COMPOSITE_MARKS = new Set(['P/SL', 'P/CL', 'P/PL']);

function punchTimeHm(punch) {
  const raw = punch?.punchTime ?? punch?.punch_time ?? '';
  const normalized = normalizeDbTime(raw);
  return normalized ? String(normalized).slice(0, 5) : '';
}

function sortPunchesByTime(punches) {
  return [...punches].sort((a, b) => {
    const ta = timeToMinutes(punchTimeHm(a)) ?? 0;
    const tb = timeToMinutes(punchTimeHm(b)) ?? 0;
    return ta - tb;
  });
}

function derivePunchInOut(sortedPunches) {
  if (!sortedPunches?.length) return { punchIn: '', punchOut: '' };
  const punchIn = punchTimeHm(sortedPunches[0]);
  let punchOut = '';
  if (sortedPunches.length >= 2) {
    punchOut = punchTimeHm(sortedPunches[sortedPunches.length - 1]);
  }
  return { punchIn, punchOut };
}

/**
 * Register mark from first/last punch of the day.
 * Half Day when: (1) first punch at or after cutoff, or (2) last punch on/before cutoff.
 * Single punch before cutoff with no out yet stays Present.
 */
export function registerMarkFromPunchWindow({ punchIn, punchOut, cutoff = HALF_DAY_CUTOFF }) {
  if (!punchIn) return null;
  const cutoffMin = timeToMinutes(cutoff);
  const inMin = timeToMinutes(punchIn);
  if (inMin == null || cutoffMin == null) return null;

  if (inMin >= cutoffMin) return 'HD';

  if (punchOut) {
    const outMin = timeToMinutes(punchOut);
    if (outMin != null && outMin <= cutoffMin) return 'HD';
  }

  return 'P';
}

export function dayOfMonthFromIsoDate(isoDate) {
  const d = normalizeDbDate(isoDate);
  if (!d) return null;
  return Number(d.slice(8, 10));
}

/** One register row per employee per calendar day that has at least one punch. */
export function punchesToPresentRegisterRows(punches) {
  const groups = new Map();

  for (const punch of punches || []) {
    const employee_code = normalizeAttendanceEmpCode(punch.empCode ?? punch.employee_code);
    const register_date = normalizeDbDate(punch.punchDate ?? punch.punch_date);
    if (!employee_code || !register_date) continue;
    const key = `${employee_code}|${register_date}`;
    if (!groups.has(key)) {
      groups.set(key, { employee_code, register_date, punches: [] });
    }
    groups.get(key).punches.push(punch);
  }

  const rows = [];
  for (const g of groups.values()) {
    const sorted = sortPunchesByTime(g.punches);
    const { punchIn, punchOut } = derivePunchInOut(sorted);
    const mark = registerMarkFromPunchWindow({ punchIn, punchOut }) ?? 'P';
    rows.push({
      employee_code: g.employee_code,
      register_date: g.register_date,
      month_key: g.register_date.slice(0, 7),
      mark,
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
    return m === 'P' || m === 'P(OD)' || m === 'HD';
  }
  return false;
}

/**
 * Whether biometric punch sync may upsert Present/HD for this existing register row.
 * Punch data may update punch-derived P ↔ HD but not manual HR or composite leave marks.
 */
export function canPunchSyncOverwriteExisting(existing) {
  if (!existing) return true;
  const mark = existing.mark ?? '';
  const markNorm = String(mark ?? '').trim();
  const markUpper = markNorm.toUpperCase();
  const markSource = existing.mark_source ?? null;
  const leaveRequestId = existing.leave_request_id ?? null;
  const tourRequestId = existing.tour_request_id ?? null;
  if (isTourMarkSource(markSource, tourRequestId)) return true;
  if (markNorm === 'P(OD)' || markNorm === 'T') return false;
  if (String(existing.mark_remark ?? '').trim()) return false;
  if (!mark && !markSource) return true;
  if (isManualMarkSource(markSource)) return false;
  if (REGISTER_HALF_DAY_COMPOSITE_MARKS.has(markUpper)) return false;
  if (isLeaveMarkSource(markSource, leaveRequestId)) return false;
  if (isPunchMarkSource(mark, markSource)) return true;
  if (PUNCH_DERIVED_REGISTER_MARKS.has(markUpper)) return true;
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
 * Skip manual and composite marks; punch sync may overwrite punch-derived and other allowed marks.
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
