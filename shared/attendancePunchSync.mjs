/**
 * Shared eTimeOffice punch → Supabase row mapping and deduplication.
 * Used by the Node server (cron / POST sync) and the admin attendance UI.
 */

export const ATTENDANCE_PUNCH_TABLE = 'erp_attendance_punches';
export const ATTENDANCE_UPSERT_CHUNK = 500;
export const DEFAULT_SYNC_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_SYNC_OVERLAP_HOURS = 24;
export const DEFAULT_SYNC_LOOKBACK_DAYS = 14;

/** Canonical emp code: trim; numeric codes drop leading zeros (09750 → 9750). */
export function normalizeAttendanceEmpCode(code) {
  const s = String(code ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? String(n) : s;
  }
  return s;
}

export function normalizeDbDate(value) {
  const raw = String(value ?? '').trim();
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
  const raw = String(value ?? '').trim().replace('T', ' ');
  const match = raw.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hh = String(match[1]).padStart(2, '0');
  const mm = match[2];
  const ss = match[3] != null ? String(match[3]).padStart(2, '0') : '00';
  return `${hh}:${mm}:${ss}`;
}

/** HH:MM or HH:MM:SS → minutes since midnight (shared by register sync and daily grid). */
export function timeToMinutes(timeStr) {
  const m = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function pickField(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const entry = Object.entries(row).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (entry && entry[1] != null && String(entry[1]).trim() !== '') return entry[1];
  }
  return '';
}

export function extractProviderPunchId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const keys = [
    'PunchId',
    'LogId',
    'SerialNumber',
    'SerialNo',
    'AutoId',
    'RowId',
    'UID',
    'Id',
    'ID',
    'TxnId',
    'TransactionId',
  ];
  for (const key of keys) {
    const val = pickField(payload, [key]);
    if (val) return String(val).trim();
  }
  return '';
}

/**
 * Stable dedupe key for erp_attendance_punches.punch_key.
 * Prefer provider punch id when present; otherwise emp + date + time (with seconds) + device + direction.
 */
export function makePunchKey(record, index = 0) {
  const payload = record.sourcePayload || record.source_payload || record;
  const providerId = extractProviderPunchId(payload);
  const emp = normalizeAttendanceEmpCode(record.empCode ?? record.employee_code) || 'no-emp';
  const date =
    normalizeDbDate(record.punchDate) ||
    normalizeDbDate(pickField(payload, ['DateString', 'PunchDate', 'Date', 'AttendanceDate'])) ||
    'no-date';
  const time =
    normalizeDbTime(record.punchTime) ||
    normalizeDbTime(record.punchDate) ||
    normalizeDbTime(pickField(payload, ['PunchTimeOnly', 'Time', 'AttendanceTime', 'PunchTime'])) ||
    'no-time';

  if (providerId) {
    return `${emp}|pid:${providerId}`.toLowerCase();
  }

  const parts = [
    emp,
    date,
    time,
    String(record.deviceName || record.device_name || 'no-device').trim().toLowerCase() || 'no-device',
    String(record.direction || '').trim().toLowerCase() || 'no-direction',
    String(record.status || '').trim().toLowerCase() || 'no-status',
  ];
  if (date === 'no-date' || time === 'no-time') parts.push(String(index));
  return parts.join('|').toLowerCase();
}

export function mapApiPunchToDbRow(record, index = 0) {
  const now = new Date().toISOString();
  const punchDate =
    normalizeDbDate(record.punchDate) ||
    normalizeDbDate(pickField(record.sourcePayload || {}, ['DateString', 'PunchDate', 'Date']));
  const punchTime =
    normalizeDbTime(record.punchTime) ||
    normalizeDbTime(record.punchDate) ||
    normalizeDbTime(pickField(record.sourcePayload || {}, ['PunchTimeOnly', 'Time', 'AttendanceTime']));

  return {
    punch_key: makePunchKey(record, index),
    employee_code: normalizeAttendanceEmpCode(record.empCode ?? record.employee_code),
    employee_name: String(record.employeeName || record.employee_name || '').trim() || null,
    punch_date: punchDate,
    punch_time: punchTime,
    device_name: String(record.deviceName || record.device_name || '').trim() || null,
    direction: String(record.direction || '').trim() || null,
    status: String(record.status || '').trim() || null,
    source: 'eTimeOffice',
    source_payload: record.sourcePayload || record.source_payload || record,
    synced_at: now,
    updated_at: now,
  };
}

/** Deduplicate by punch_key; later rows win. Returns stats for logging. */
export function dedupePunchDbRows(rows) {
  const map = new Map();
  let collisionCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.punch_key) continue;
    if (map.has(row.punch_key)) collisionCount += 1;
    map.set(row.punch_key, row);
  }
  const unique = [...map.values()];
  return {
    rows: unique,
    inputCount: rows.length,
    uniqueCount: unique.length,
    collisionCount,
    skippedInvalid: rows.length - unique.length - collisionCount,
  };
}

export function isoDateTodayInTz(timeZone = DEFAULT_SYNC_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function addDaysToIsoDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Overlap window for incremental sync: [fromDate, toDate] inclusive (ISO yyyy-mm-dd).
 * @param {object} opts
 * @param {string|null} opts.lastSyncEndedAt ISO timestamp from erp_attendance_sync_state
 * @param {number} opts.overlapHours
 * @param {number} opts.lookbackDays max history when no prior sync
 * @param {string} opts.timeZone
 * @param {string} [opts.toDate] override end date (ISO)
 * @param {string} [opts.fromDate] override start date (ISO) — skips overlap math
 */
export function computeSyncDateRange({
  lastSyncEndedAt = null,
  overlapHours = DEFAULT_SYNC_OVERLAP_HOURS,
  lookbackDays = DEFAULT_SYNC_LOOKBACK_DAYS,
  timeZone = DEFAULT_SYNC_TIMEZONE,
  toDate = null,
  fromDate = null,
} = {}) {
  const to = toDate || isoDateTodayInTz(timeZone);
  if (fromDate) {
    return { fromDate, toDate: to, reason: 'explicit' };
  }

  if (lastSyncEndedAt) {
    const last = new Date(lastSyncEndedAt);
    if (!Number.isNaN(last.getTime())) {
      const overlapMs = Math.max(0, overlapHours) * 60 * 60 * 1000;
      const fromMs = last.getTime() - overlapMs;
      const fromOverlap = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(fromMs));
      const cappedFrom =
        fromOverlap < addDaysToIsoDate(to, -lookbackDays) ? addDaysToIsoDate(to, -lookbackDays) : fromOverlap;
      return { fromDate: cappedFrom, toDate: to, reason: 'overlap' };
    }
  }

  return {
    fromDate: addDaysToIsoDate(to, -Math.max(1, lookbackDays)),
    toDate: to,
    reason: 'lookback',
  };
}

/** Split inclusive ISO range into chunks (max days per API call). */
export function splitIsoDateRange(fromDate, toDate, maxDaysPerChunk = 7) {
  const chunks = [];
  let cursor = fromDate;
  const end = toDate;
  while (cursor <= end) {
    let chunkEnd = cursor;
    const cursorDate = new Date(`${cursor}T12:00:00`);
    const limit = new Date(cursorDate);
    limit.setDate(limit.getDate() + maxDaysPerChunk - 1);
    const limitIso = limit.toISOString().slice(0, 10);
    chunkEnd = limitIso < end ? limitIso : end;
    chunks.push({ fromDate: cursor, toDate: chunkEnd });
    cursor = addDaysToIsoDate(chunkEnd, 1);
  }
  return chunks;
}

/** ISO yyyy-mm-dd → eTimeOffice dd/mm/yyyy */
export function isoDateToEtimeSlash(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** ISO date → eTimeOffice API datetime (DD/MM/YYYY_HH:mm). */
export function isoDateToEtimeDateTime(isoDate, endOfDay = false) {
  const slash = isoDateToEtimeSlash(isoDate);
  if (!slash || !/^\d{2}\/\d{2}\/\d{4}$/.test(slash)) return slash;
  return `${slash}_${endOfDay ? '23:59' : '00:00'}`;
}
