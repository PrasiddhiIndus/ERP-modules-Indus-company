/**
 * Server-side: mirror erp_attendance_punches → admin_attendance_register (Present).
 */

import {
  filterPresentRegisterRowsRespectingMarks,
  marksByEmpDayFromRegisterDbRows,
  punchesToPresentRegisterRows,
  registerDateRangeFromRows,
} from '../shared/attendanceRegisterSync.mjs';

function pickRegisterUpsertFields(row) {
  const employee_code = String(row.employee_code || '').trim();
  const mark = row.mark;
  if (!employee_code || !mark) return null;
  return {
    employee_code,
    register_date: row.register_date,
    month_key: row.month_key || String(row.register_date || '').slice(0, 7),
    mark,
    mark_source: row.mark_source ?? 'punch',
    leave_request_id: row.leave_request_id ?? null,
    mark_remark: row.mark_remark ?? null,
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

const REGISTER_TABLE = 'admin_attendance_register';
const UPSERT_CHUNK = 200;

const REGISTER_MARKS_DB_ALLOWED = new Set([
  'P',
  'P(OD)',
  'T',
  'L',
  'WO',
  'NH/PH',
  'HD',
  'WFH',
  'PL',
  'CL',
  'SL',
  'SPLA',
  'SPLB',
  'SPLM',
  'SBEL',
  'CO',
  'PTL',
  'ML',
]);

function normalizeRegisterMarkForDb(mark) {
  const m = String(mark ?? '').trim();
  if (!m) return null;
  if (m === 'NHPH' || m === 'NH/PH') return 'NH/PH';
  if (m === 'P(OD)') return 'P(OD)';
  if (m === 'A') return 'L';
  if (REGISTER_MARKS_DB_ALLOWED.has(m)) return m;
  return 'L';
}

async function upsertRegisterBatch(supabase, rows) {
  const normalized = (rows || [])
    .map((row) => {
      const employee_code = String(row.employee_code || '').trim();
      const mark = normalizeRegisterMarkForDb(row.mark);
      if (!employee_code || !mark) return null;
      return pickRegisterUpsertFields({
        ...row,
        employee_code,
        mark,
        mark_remark: row.mark_remark ?? null,
        updated_at: new Date().toISOString(),
      });
    })
    .filter(Boolean);
  if (!normalized.length) return 0;
  for (let i = 0; i < normalized.length; i += UPSERT_CHUNK) {
    const chunk = normalized.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from(REGISTER_TABLE).upsert(chunk, {
      onConflict: 'employee_code,register_date',
    });
    if (error) throw error;
  }
  return normalized.length;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ empCode?: string, employee_code?: string, punchDate?: string, punch_date?: string }>} punches
 */
export async function syncRegisterMarksFromPunches(supabase, punches, options = {}) {
  const { respectManualMarks = true, fromDate: fromOverride, toDate: toOverride } = options;
  const candidateRows = punchesToPresentRegisterRows(punches);
  if (!candidateRows.length) {
    return { upserted: 0, skipped: 0, candidates: 0 };
  }

  const range = registerDateRangeFromRows(candidateRows);
  const fromDate = fromOverride || range.fromDate;
  const toDate = toOverride || range.toDate;

  let toUpsert = candidateRows;
  if (respectManualMarks && fromDate && toDate) {
    const { data, error } = await supabase
      .from(REGISTER_TABLE)
      .select('employee_code,register_date,mark,mark_source,leave_request_id')
      .gte('register_date', fromDate)
      .lte('register_date', toDate);
    if (error) throw error;
    const marksByEmpDay = marksByEmpDayFromRegisterDbRows(data, normalizeRegisterMarkForDb);
    toUpsert = filterPresentRegisterRowsRespectingMarks(candidateRows, marksByEmpDay);
  }

  const upserted = toUpsert.length ? await upsertRegisterBatch(supabase, toUpsert) : 0;
  return {
    upserted,
    skipped: candidateRows.length - toUpsert.length,
    candidates: candidateRows.length,
  };
}
