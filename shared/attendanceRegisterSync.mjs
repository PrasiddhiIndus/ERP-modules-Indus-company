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

/** Purple Present: first punch in this window (inclusive), or last punch before noon. */
export const PURPLE_PRESENT_FIRST_PUNCH_START = '12:00';
export const PURPLE_PRESENT_FIRST_PUNCH_END = '15:00';
export const PURPLE_PRESENT_LAST_PUNCH_BEFORE = '12:00';

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
 * - Last punch before 12:00 → Present (purple P in register + admin alert)
 * - Last punch on/before 13:00 → Half Day
 * - Otherwise → Present
 * Single punch with no out yet stays Present.
 */
export function registerMarkFromPunchWindow({ punchIn, punchOut, cutoff = HALF_DAY_CUTOFF }) {
  if (!punchIn) return null;
  const cutoffMin = timeToMinutes(cutoff);
  const inMin = timeToMinutes(punchIn);
  if (inMin == null || cutoffMin == null) return null;

  if (punchOut) {
    const outMin = timeToMinutes(punchOut);
    const earlyOutBefore = timeToMinutes(PURPLE_PRESENT_LAST_PUNCH_BEFORE);
    if (outMin != null && earlyOutBefore != null && outMin < earlyOutBefore) {
      return 'P';
    }
    if (outMin != null && outMin <= cutoffMin) return 'HD';
  }

  return 'P';
}

/**
 * True when Present (P) should render purple:
 * - first punch between 12:00 and 15:00 (inclusive), or
 * - last punch before 12:00.
 * Does not change the stored mark — display/notification only.
 */
export function isPurplePresentPunch({ punchIn, punchOut } = {}) {
  const inMin = timeToMinutes(punchIn);
  const outMin = timeToMinutes(punchOut);
  const firstStart = timeToMinutes(PURPLE_PRESENT_FIRST_PUNCH_START);
  const firstEnd = timeToMinutes(PURPLE_PRESENT_FIRST_PUNCH_END);
  const lastBefore = timeToMinutes(PURPLE_PRESENT_LAST_PUNCH_BEFORE);

  if (
    inMin != null &&
    firstStart != null &&
    firstEnd != null &&
    inMin >= firstStart &&
    inMin <= firstEnd
  ) {
    return true;
  }
  if (outMin != null && lastBefore != null && outMin < lastBefore) {
    return true;
  }
  return false;
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
  if (mark === 'WO' || markUpper === 'NH/PH' || markUpper === 'NHPH') {
    const src = String(markSource ?? '').trim().toLowerCase();
    if (isManualMarkSource(src)) return false;
    return src === 'auto_wo' || src === 'auto_holiday' || !src;
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

/** Null / blank string treated as equal for register upsert comparisons. */
export function normalizeRegisterComparableValue(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Emp+date lookup keys for matching upsert payloads to existing register rows
 * (covers leading-zero / raw code variants).
 */
export function registerUpsertLookupKeys(row) {
  const date = normalizeDbDate(row?.register_date);
  if (!date) return [];
  const raw = String(row?.employee_code ?? '').trim();
  const norm = normalizeAttendanceEmpCode(raw);
  const keys = [];
  if (norm) keys.push(`${norm}|${date}`);
  if (raw && raw !== norm) keys.push(`${raw}|${date}`);
  return keys;
}

/**
 * True when an upsert would not change any meaningful register columns.
 * Compares mark, mark_source, mark_remark, leave_request_id, tour_request_id.
 * updated_at (and any other fields) are ignored. Fields omitted on `incoming`
 * are not compared (partial payloads must not force a write).
 */
export function isRegisterUpsertNoop(incoming, existing) {
  if (!existing) return false;
  const fields = ['mark', 'mark_source', 'mark_remark', 'leave_request_id', 'tour_request_id'];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;
    const next = normalizeRegisterComparableValue(incoming[field]);
    const prev = normalizeRegisterComparableValue(existing[field]);
    if (next !== prev) return false;
  }
  return Object.prototype.hasOwnProperty.call(incoming, 'mark');
}

/** Index existing register rows by emp|date for noop filtering. */
export function indexRegisterRowsForUpsertDiff(existingRows) {
  const byKey = new Map();
  for (const row of existingRows || []) {
    for (const key of registerUpsertLookupKeys(row)) {
      byKey.set(key, row);
    }
  }
  return byKey;
}

/**
 * Drop upsert rows that already match the DB on meaningful columns.
 * Prevents redundant WAL / Realtime messages from identical re-writes.
 */
export function filterChangedRegisterUpserts(incomingRows, existingRows) {
  const byKey = indexRegisterRowsForUpsertDiff(existingRows);
  return (incomingRows || []).filter((row) => {
    const keys = registerUpsertLookupKeys(row);
    let existing;
    for (const key of keys) {
      existing = byKey.get(key);
      if (existing) break;
    }
    return !isRegisterUpsertNoop(row, existing);
  });
}

/**
 * Manual HR edits (mark_source = manual) are priority 1.
 * Punch / leave / tour / auto WO / holiday upserts must not replace them.
 */
export function filterUpsertsRespectingManualPriority(incomingRows, existingRows) {
  const byKey = indexRegisterRowsForUpsertDiff(existingRows);
  return (incomingRows || []).filter((row) => {
    const keys = registerUpsertLookupKeys(row);
    let existing;
    for (const key of keys) {
      existing = byKey.get(key);
      if (existing) break;
    }
    if (!existing) return true;
    if (!isManualMarkSource(existing.mark_source)) return true;
    return isManualMarkSource(row?.mark_source);
  });
}
