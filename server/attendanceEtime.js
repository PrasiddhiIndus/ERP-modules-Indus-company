/**
 * eTimeOffice attendance fetch, normalization, overlap sync → erp_attendance_punches.
 */
import { createClient } from '@supabase/supabase-js';
import { syncRegisterMarksFromPunches } from './attendanceRegisterSync.js';
import {
  ATTENDANCE_PUNCH_TABLE,
  ATTENDANCE_UPSERT_CHUNK,
  computeSyncDateRange,
  dedupePunchDbRows,
  isoDateToEtimeDateTime,
  isoDateToEtimeSlash,
  mapApiPunchToDbRow,
  normalizeAttendanceEmpCode,
  normalizeDbDate,
  normalizeDbTime,
  splitIsoDateRange,
} from '../shared/attendancePunchSync.mjs';

export class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = Number(status) || 500;
    this.details = details;
  }
}

export function etimeCfg(getRequiredEnv) {
  const timeoutMs = Number(process.env.ETIME_TIMEOUT_MS || 60000);
  const punchEndpoint = String(process.env.ETIME_PUNCH_ENDPOINT || 'DownloadInOutPunchData')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const mergeEndpoints = String(process.env.ETIME_MERGE_PUNCH_ENDPOINTS || 'true').toLowerCase() !== 'false';
  return {
    baseUrl: (process.env.ETIME_BASE_URL || 'https://api.etimeoffice.com/api').trim(),
    authCredentials: getRequiredEnv('ETIME_AUTH_CREDENTIALS'),
    punchEndpoint: punchEndpoint || 'DownloadInOutPunchData',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
    mergeEndpoints,
    maxDaysPerRequest: Math.max(1, Number(process.env.ETIME_MAX_DAYS_PER_REQUEST || 7)),
    overlapHours: Math.max(0, Number(process.env.ETIME_SYNC_OVERLAP_HOURS || 24)),
    lookbackDays: Math.max(1, Number(process.env.ETIME_SYNC_LOOKBACK_DAYS || 14)),
    syncTimezone: String(process.env.ETIME_SYNC_TIMEZONE || 'Asia/Kolkata').trim() || 'Asia/Kolkata',
  };
}

/** eTimeOffice expects DD/MM/YYYY_HH:mm (e.g. 29/05/2026_00:00). */
export function normalizeEtimeDate(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) {
    throw new HttpError(400, endOfDay ? 'toDate is required.' : 'fromDate is required.');
  }

  const withTime = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ _](\d{2}):(\d{2})/);
  if (withTime) {
    const [, dd, mm, yyyy, hh, min] = withTime;
    return `${dd}/${mm}/${yyyy}_${hh}:${min}`;
  }

  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return `${dd}/${mm}/${yyyy}_${endOfDay ? '23:59' : '00:00'}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, yyyy, mm, dd, hh, min] = iso;
    if (hh != null && min != null) return `${dd}/${mm}/${yyyy}_${hh}:${min}`;
    return `${dd}/${mm}/${yyyy}_${endOfDay ? '23:59' : '00:00'}`;
  }

  throw new HttpError(400, `Invalid ${endOfDay ? 'toDate' : 'fromDate'} format. Use YYYY-MM-DD or DD/MM/YYYY.`);
}

export function formatEtimeNetworkError(err) {
  const code = err?.cause?.code || err?.code || '';
  if (err?.name === 'AbortError') {
    return 'eTimeOffice request timed out. Try a shorter date range or increase ETIME_TIMEOUT_MS.';
  }
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return [
      `Cannot reach eTimeOffice API (${code || 'network error'}).`,
      'Check internet access, firewall, and VPN.',
      'Confirm ETIME_BASE_URL in .env.server (default https://api.etimeoffice.com/api).',
      'If this works on another PC, this machine or network may be blocking outbound HTTPS to api.etimeoffice.com.',
    ].join(' ');
  }
  return `eTimeOffice network error: ${err?.message || String(err)}`;
}

function pickField(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const entry = Object.entries(row).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (entry && entry[1] != null && String(entry[1]).trim() !== '') return entry[1];
  }
  return '';
}

function splitPunchDateTime(value) {
  const text = String(value || '').trim().replace('T', ' ').replace('_', ' ');
  if (!text) return { date: '', time: '' };
  const [date = '', time = ''] = text.split(/\s+/);
  return { date, time: time ? time.slice(0, 8) : '' };
}

function isValidEtimePunchTime(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) return false;
  return true;
}

function normalizeEtimePunchDate(value) {
  const iso = normalizeDbDate(value);
  if (iso) {
    const [, yyyy, mm, dd] = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    if (yyyy) return `${dd}/${mm}/${yyyy}`;
  }
  const raw = String(value || '').trim();
  const slash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) return `${slash[1]}/${slash[2]}/${slash[3]}`;
  return raw.split(/\s+/)[0] || '';
}

function normalizeDirection(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['in', 'i', '1', 'punch in', 'punchin'].includes(v)) return 'IN';
  if (['out', 'o', '0', 'punch out', 'punchout'].includes(v)) return 'OUT';
  return String(value || '').trim().toUpperCase();
}

function buildPunchRecord({ empCode, employeeName, punchDate, punchTime, deviceName, direction, status, sourcePayload, index, suffix }) {
  const timeStr = String(punchTime || '').trim();
  const timeShort = timeStr.slice(0, 8);
  return {
    id: `${empCode}-${punchDate}-${timeShort}-${suffix}-${index}`,
    empCode,
    employeeName,
    punchDate,
    punchTime: timeShort,
    deviceName: deviceName || 'eTimeOffice',
    direction: direction || '',
    status: status || '',
    sourcePayload,
  };
}

export function extractEtimeRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  const nested = [];
  for (const key of ['PunchData', 'punchData', 'InOutPunchData', 'inOutPunchData', 'Data', 'data', 'Result', 'result']) {
    const val = data[key];
    if (Array.isArray(val)) return val;
    if (val && typeof val === 'object' && Array.isArray(val.Table)) nested.push(...val.Table);
    if (val && typeof val === 'object' && Array.isArray(val.table)) nested.push(...val.table);
  }
  if (nested.length) return nested;
  return [];
}

/**
 * Expand one API row into 0..n punch records (in/out pairs + granular punches).
 */
export function normalizeEtimePunchRows(data) {
  return extractEtimeRows(data).flatMap((row, index) => {
    const punchDateTime = pickField(row, ['PunchDateTime', 'LogDateTime', 'PunchDate', 'Date', 'AttendanceDate']);
    const split = splitPunchDateTime(punchDateTime);
    const empCode = normalizeAttendanceEmpCode(
      pickField(row, ['Empcode', 'EmpCode', 'EmployeeCode', 'EmployeeID', 'EmpId'])
    );
    const employeeName = String(pickField(row, ['Name', 'EmployeeName', 'EmpName']) || '').trim();
    const punchDate = normalizeEtimePunchDate(split.date || pickField(row, ['DateString', 'PunchDate', 'Date', 'AttendanceDate']));
    const inTime = pickField(row, ['INTime', 'InTime', 'InTimeOnly']);
    const outTime = pickField(row, ['OUTTime', 'OutTime', 'OutTimeOnly']);
    const sourceStatus = String(pickField(row, ['Status', 'AttendanceStatus', 'VerifyMode']) || '').trim();
    const deviceName = String(
      pickField(row, ['MachineNo', 'MachineName', 'DeviceName', 'Device', 'Location']) || 'eTimeOffice'
    ).trim();

    const punches = [];
    const seen = new Set();

    const pushUnique = (punch) => {
      if (!punch?.empCode || !punch?.punchDate || !punch?.punchTime) return;
      const key = `${punch.empCode}|${normalizeDbDate(punch.punchDate)}|${normalizeDbTime(punch.punchTime)}|${punch.direction}`;
      if (seen.has(key)) return;
      seen.add(key);
      punches.push(punch);
    };

    if (empCode && punchDate && isValidEtimePunchTime(inTime)) {
      pushUnique(
        buildPunchRecord({
          empCode,
          employeeName,
          punchDate,
          punchTime: inTime,
          deviceName,
          direction: 'IN',
          status: sourceStatus,
          sourcePayload: row,
          index,
          suffix: 'in',
        })
      );
    }
    if (empCode && punchDate && isValidEtimePunchTime(outTime)) {
      pushUnique(
        buildPunchRecord({
          empCode,
          employeeName,
          punchDate,
          punchTime: outTime,
          deviceName,
          direction: 'OUT',
          status: sourceStatus,
          sourcePayload: row,
          index,
          suffix: 'out',
        })
      );
    }

    const granularTime = String(
      pickField(row, ['PunchTimeOnly', 'Time', 'AttendanceTime', 'PunchTime']) || split.time
    ).trim();
    if (empCode && punchDate && isValidEtimePunchTime(granularTime)) {
      pushUnique(
        buildPunchRecord({
          empCode,
          employeeName,
          punchDate,
          punchTime: granularTime,
          deviceName,
          direction: normalizeDirection(pickField(row, ['InOut', 'Direction', 'PunchDirection', 'IOType'])),
          status: sourceStatus,
          sourcePayload: row,
          index,
          suffix: 'granular',
        })
      );
    }

    if (punches.length) return punches;

    if (!empCode || !punchDate || !granularTime) return [];
    return [
      buildPunchRecord({
        empCode,
        employeeName,
        punchDate,
        punchTime: granularTime,
        deviceName,
        direction: normalizeDirection(pickField(row, ['InOut', 'Direction', 'PunchDirection', 'IOType'])),
        status: sourceStatus,
        sourcePayload: row,
        index,
        suffix: 'fallback',
      }),
    ];
  });
}

export function uniqueEtimePunchEndpoints(primary) {
  const granularFirst = String(process.env.ETIME_PREFER_GRANULAR_PUNCHES || '').toLowerCase() === 'true';
  const list = [primary, 'DownloadPunchData', 'DownloadInOutPunchData'].filter(Boolean);
  const unique = Array.from(new Set(list));
  if (granularFirst) {
    unique.sort((a, b) => {
      const score = (e) => (e === 'DownloadPunchData' ? 0 : e === 'DownloadInOutPunchData' ? 1 : 2);
      return score(a) - score(b);
    });
  }
  return unique;
}

export function buildEtimePunchUrl(baseUrl, endpoint, empCode, fromDate, toDate) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${endpoint}`);
  url.searchParams.set('Empcode', empCode);
  url.searchParams.set('FromDate', fromDate);
  url.searchParams.set('ToDate', toDate);
  return url;
}

function parseEtimeProviderText(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export async function requestEtimePunchEndpoint(c, endpoint, empCode, fromDate, toDate) {
  const url = buildEtimePunchUrl(c.baseUrl, endpoint, empCode, fromDate, toDate);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), c.timeoutMs);
  try {
    const providerRes = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(c.authCredentials).toString('base64')}`,
        accept: 'application/json',
      },
    });
    const text = await providerRes.text();
    return {
      endpoint,
      providerRes,
      providerData: parseEtimeProviderText(text),
    };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, formatEtimeNetworkError(err), { endpoint, url: url.toString() });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchEtimePunchData(c, empCode, fromDate, toDate) {
  let lastNotFound = null;
  for (const endpoint of uniqueEtimePunchEndpoints(c.punchEndpoint)) {
    const result = await requestEtimePunchEndpoint(c, endpoint, empCode, fromDate, toDate);
    if (result.providerRes.ok || ![404, 405].includes(result.providerRes.status)) return result;
    lastNotFound = result;
  }
  return lastNotFound;
}

/** Merge punches from all successful endpoints (dedupe by normalized punch_key later). */
export async function fetchEtimePunchDataMerged(c, empCode, fromDateSlash, toDateSlash) {
  const endpoints = uniqueEtimePunchEndpoints(c.punchEndpoint);
  const records = [];
  const endpointsUsed = [];
  let lastError = null;

  for (const endpoint of endpoints) {
    const result = await requestEtimePunchEndpoint(c, endpoint, empCode, fromDateSlash, toDateSlash);
    if (!result.providerRes.ok) {
      if ([404, 405].includes(result.providerRes.status)) continue;
      lastError = result;
      if (!c.mergeEndpoints) return { ...result, records: normalizeEtimePunchRows(result.providerData) };
      continue;
    }
    endpointsUsed.push(endpoint);
    records.push(...normalizeEtimePunchRows(result.providerData));
    if (!c.mergeEndpoints) {
      return { ...result, records, endpointsUsed };
    }
  }

  if (!records.length && lastError) {
    return { ...lastError, records: [], endpointsUsed };
  }

  return {
    endpoint: endpointsUsed[0] || c.punchEndpoint,
    endpointsUsed,
    providerRes: { ok: true, status: 200 },
    records,
  };
}

export async function fetchEtimePunchesForIsoRange(c, empCode, fromIso, toIso) {
  const chunks = splitIsoDateRange(fromIso, toIso, c.maxDaysPerRequest);
  const allRecords = [];
  const endpointsUsed = new Set();

  for (const chunk of chunks) {
    const fromSlash = isoDateToEtimeDateTime(chunk.fromDate, false);
    const toSlash = isoDateToEtimeDateTime(chunk.toDate, true);
    const result = await fetchEtimePunchDataMerged(c, empCode, fromSlash, toSlash);
    if (!result.providerRes?.ok) {
      const msg =
        result.providerData?.Msg ||
        result.providerData?.Message ||
        result.providerData?.message ||
        result.providerData?.Error ||
        (typeof result.providerData?.raw === 'string' ? result.providerData.raw.slice(0, 200) : '') ||
        `eTimeOffice fetch failed (HTTP ${result.providerRes?.status}).`;
      throw new HttpError(result.providerRes?.status || 502, msg, {
        chunk,
        endpoint: result.endpoint,
      });
    }
    (result.endpointsUsed || [result.endpoint]).forEach((e) => endpointsUsed.add(e));
    allRecords.push(...(result.records || []));
  }

  return { records: allRecords, endpointsUsed: [...endpointsUsed], chunks: chunks.length };
}

export function getSupabaseServiceClient(getSupabaseUrl, getServiceKey) {
  const url = getSupabaseUrl();
  const key = getServiceKey();
  if (!url || !key) {
    throw new HttpError(
      500,
      'Supabase service role is required for attendance sync. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.server.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function upsertPunchRows(supabase, rows) {
  const { rows: unique, inputCount, uniqueCount, collisionCount } = dedupePunchDbRows(rows);
  let upserted = 0;
  const errors = [];

  for (let i = 0; i < unique.length; i += ATTENDANCE_UPSERT_CHUNK) {
    const chunk = unique.slice(i, i + ATTENDANCE_UPSERT_CHUNK);
    const { error, count } = await supabase.from(ATTENDANCE_PUNCH_TABLE).upsert(chunk, {
      onConflict: 'punch_key',
      count: 'exact',
    });
    if (error) {
      errors.push({ chunk: i / ATTENDANCE_UPSERT_CHUNK, message: error.message, code: error.code });
      throw Object.assign(error, { partialUpserted: upserted, errors });
    }
    upserted += count ?? chunk.length;
  }

  return { upserted, inputCount, uniqueCount, collisionCount, errors };
}

export async function readSyncState(supabase) {
  const { data, error } = await supabase.from('erp_attendance_sync_state').select('*').eq('id', 1).maybeSingle();
  if (error && error.code !== 'PGRST205') throw error;
  return data || null;
}

export async function writeSyncState(supabase, patch) {
  const row = { id: 1, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('erp_attendance_sync_state').upsert(row, { onConflict: 'id' });
  if (error && error.code !== 'PGRST205') throw error;
}

/**
 * Full overlap sync: fetch eTimeOffice → upsert erp_attendance_punches → update sync state.
 */
export async function runAttendanceOverlapSync({
  getRequiredEnv,
  getSupabaseUrl,
  getServiceKey,
  empCode = 'ALL',
  fromDate = null,
  toDate = null,
  log = console,
}) {
  const c = etimeCfg(getRequiredEnv);
  const supabase = getSupabaseServiceClient(getSupabaseUrl, getServiceKey);
  const startedAt = new Date().toISOString();

  await writeSyncState(supabase, { last_sync_started_at: startedAt, last_sync_error: null });

  try {
    const prior = await readSyncState(supabase);
    const range = computeSyncDateRange({
      lastSyncEndedAt: prior?.last_sync_ended_at || null,
      overlapHours: c.overlapHours,
      lookbackDays: c.lookbackDays,
      timeZone: c.syncTimezone,
      fromDate: fromDate || null,
      toDate: toDate || null,
    });

    const code = String(empCode || 'ALL').trim() || 'ALL';
    const fetchResult = await fetchEtimePunchesForIsoRange(c, code, range.fromDate, range.toDate);
    const apiRecords = fetchResult.records || [];

    const dbRows = apiRecords.map((r, i) => mapApiPunchToDbRow(r, i));
    const rowsWithDate = dbRows.filter((r) => r.punch_date && r.employee_code);
    const skippedNoDate = dbRows.length - rowsWithDate.length;

    const { upserted, inputCount, uniqueCount, collisionCount } = await upsertPunchRows(supabase, rowsWithDate);

    const punchViewRows = rowsWithDate.map((r) => ({
      empCode: r.employee_code,
      punchDate: r.punch_date,
      employeeName: r.employee_name,
    }));
    let registerSync = { upserted: 0, skipped: 0, candidates: 0 };
    try {
      registerSync = await syncRegisterMarksFromPunches(supabase, punchViewRows, {
        fromDate: range.fromDate,
        toDate: range.toDate,
      });
    } catch (regErr) {
      log.warn?.('[attendance-sync] register mirror failed:', regErr?.message || regErr);
    }

    const endedAt = new Date().toISOString();
    const summary = {
      ok: true,
      startedAt,
      endedAt,
      empCode: code,
      range,
      apiRecordCount: apiRecords.length,
      mappedCount: dbRows.length,
      skippedNoDateOrEmp: skippedNoDate,
      dedupeInputCount: inputCount,
      dedupeUniqueCount: uniqueCount,
      dedupeCollisions: collisionCount,
      upserted,
      registerUpserted: registerSync.upserted,
      registerSkipped: registerSync.skipped,
      endpointsUsed: fetchResult.endpointsUsed,
      dateChunks: fetchResult.chunks,
    };

    await writeSyncState(supabase, {
      last_sync_started_at: startedAt,
      last_sync_ended_at: endedAt,
      last_sync_from_date: range.fromDate,
      last_sync_to_date: range.toDate,
      last_sync_record_count: upserted,
      last_sync_api_count: apiRecords.length,
      last_sync_error: null,
    });

    log.info?.('[attendance-sync]', JSON.stringify(summary)) || log.log('[attendance-sync]', summary);
    return summary;
  } catch (err) {
    const message = err?.message || String(err);
    await writeSyncState(supabase, {
      last_sync_started_at: startedAt,
      last_sync_error: message,
    }).catch(() => {});
    log.error?.('[attendance-sync]', message, err) || log.error('[attendance-sync]', err);
    throw err;
  }
}

let syncTimer = null;

export function startAttendanceSyncCron({ getRequiredEnv, getSupabaseUrl, getServiceKey, log = console }) {
  if (String(process.env.ETIME_SYNC_CRON_ENABLED || '').toLowerCase() !== 'true') return null;
  const intervalMs = Math.max(60_000, Number(process.env.ETIME_SYNC_INTERVAL_MS || 900_000));
  if (syncTimer) clearInterval(syncTimer);

  const tick = async () => {
    try {
      await runAttendanceOverlapSync({ getRequiredEnv, getSupabaseUrl, getServiceKey, log });
    } catch (err) {
      log.error?.('[attendance-sync-cron]', err?.message || err);
    }
  };

  syncTimer = setInterval(tick, intervalMs);
  log.info?.(`[attendance-sync-cron] scheduled every ${intervalMs}ms`);
  return syncTimer;
}
