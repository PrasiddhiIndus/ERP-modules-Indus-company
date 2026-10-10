/**
 * Payroll MIS — reads and master-data writes. Reports never write payroll data.
 */
import { supabase } from '../../../../lib/supabase';

const PAGE = 1000;
export const CHALLAN_BUCKET = 'payroll-statutory-challans';

function friendly(error, fallback) {
  if (!error) return null;
  console.error('[payroll-mis]', error);
  const msg = String(error.message || '');
  if (/permission|not allowed|access|42501/i.test(msg)) return 'You do not have access to this.';
  if (/challan/i.test(msg) || /paid-on/i.test(msg)) return msg;
  if (/duplicate key|unique/i.test(msg)) return 'This entry already exists.';
  return fallback;
}

function check({ data, error }, fallback) {
  if (error) throw new Error(friendly(error, fallback));
  return data;
}

export async function fetchMyMisAccess() {
  const { data, error } = await supabase.rpc('admin_payroll_mis_my_access');
  if (error) {
    console.error('[payroll-mis] access', error);
    return { full: false, scopes: [] };
  }
  return { full: !!data?.full, scopes: Array.isArray(data?.scopes) ? data.scopes : [] };
}

export async function fetchLockedMonths() {
  return check(await supabase.rpc('admin_payroll_mis_months'), 'Could not load locked salary months.') || [];
}

export async function fetchSnapshotRows(from, to) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await supabase.rpc('admin_payroll_mis_rows', { p_from: from, p_to: to }).range(offset, offset + PAGE - 1);
    const rows = check(res, 'Could not load report figures.') || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchRegisterTotals(from, to) {
  return check(await supabase.rpc('admin_payroll_mis_register_totals', { p_from: from, p_to: to }),
    'Could not load salary register totals.') || [];
}

export async function rebuildSnapshot(runId) {
  return check(await supabase.rpc('admin_payroll_mis_rebuild_snapshot', { p_run_id: runId }),
    'Could not rebuild the report figures for this month.');
}

/** View / download log. Never blocks the report. */
export async function logMisAction(report, action, format = null, period = null, filters = null) {
  const { error } = await supabase.rpc('admin_payroll_mis_log', {
    p_report: report, p_action: action, p_format: format, p_period: period, p_filters: filters,
  });
  if (error) console.warn('[payroll-mis] log', error);
}

async function selectAll(table, orderBy) {
  let q = supabase.from(table).select('*');
  for (const [col, asc] of orderBy || []) q = q.order(col, { ascending: asc });
  return check(await q, 'Could not load settings.') || [];
}

export const fetchSettings = async () => {
  const rows = await selectAll('admin_payroll_mis_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};
export const fetchAllocations = () => selectAll('admin_payroll_cost_allocations', [['employee_master_id', true]]);
export const fetchRates = () => selectAll('admin_payroll_statutory_rates', [['statute', true], ['component', true], ['effective_from', false]]);
export const fetchCalendar = () => selectAll('admin_payroll_compliance_calendar', [['statute', true], ['state', true]]);
export const fetchDepartments = () => selectAll('admin_payroll_departments', [['department', true]]);
export const fetchPremiums = () => selectAll('admin_payroll_insurance_premiums', [['policy_start', false]]);
export const fetchBudget = () => selectAll('admin_payroll_budget', [['month_key', false], ['vertical_code', true]]);
export const fetchRecipients = () => selectAll('admin_payroll_mis_alert_recipients', [['email', true]]);
export const fetchAccessList = () => selectAll('admin_payroll_mis_access', [['vertical_code', true]]);
export const fetchTags = () => selectAll('admin_payroll_employee_tags');
export const fetchPayments = () => selectAll('admin_payroll_statutory_payments', [['wage_month', false], ['statute', true]]);
export const fetchJobLog = async () => check(
  await supabase.from('admin_payroll_mis_job_log').select('*').order('created_at', { ascending: false }).limit(50),
  'Could not load the snapshot log.',
) || [];

export async function saveSetting(key, value) {
  check(await supabase.from('admin_payroll_mis_settings').upsert({ key, value, updated_at: new Date().toISOString() }),
    'Could not save the setting.');
}

const TABLES_WITH_UPDATED_AT = new Set([
  'admin_payroll_mis_settings', 'admin_payroll_employee_tags', 'admin_payroll_departments',
  'admin_payroll_cost_allocations', 'admin_payroll_insurance_premiums', 'admin_payroll_statutory_rates',
  'admin_payroll_compliance_calendar', 'admin_payroll_budget',
]);

/** Insert or update rows of an MIS master table. */
export async function upsertRows(table, rows, onConflict) {
  const stamp = TABLES_WITH_UPDATED_AT.has(table) ? { updated_at: new Date().toISOString() } : {};
  const payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r, ...stamp }));
  return check(await supabase.from(table).upsert(payload, onConflict ? { onConflict } : undefined).select(),
    'Could not save.');
}

export async function deleteRow(table, column, value) {
  check(await supabase.from(table).delete().eq(column, value), 'Could not delete.');
}

export async function saveEmployeeTags(employeeMasterId, tags) {
  const clean = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
  const row = {
    employee_master_id: employeeMasterId,
    vertical_code: clean(tags.vertical_code)?.toLowerCase() ?? null,
    grade: clean(tags.grade),
    cost_centre: clean(tags.cost_centre),
    position_type: clean(tags.position_type),
    exit_reason: clean(tags.exit_reason),
    work_state: clean(tags.work_state)?.toUpperCase() ?? null,
    updated_at: new Date().toISOString(),
  };
  check(await supabase.from('admin_payroll_employee_tags').upsert(row, { onConflict: 'employee_master_id' }),
    'Could not save the payroll tags.');
  return row;
}

/** Salary Admin users and Employee Master editors may set payroll tags. */
export async function canEditPayrollTags() {
  const [full, flags] = await Promise.all([
    supabase.rpc('admin_payroll_mis_full_access'),
    supabase.rpc('admin_employee_flags_can_edit'),
  ]);
  if (full.error && flags.error) throw new Error('unavailable');
  return !!full.data || !!flags.data;
}

export async function fetchEmployeeTags(employeeMasterId) {
  const { data, error } = await supabase.from('admin_payroll_employee_tags').select('*')
    .eq('employee_master_id', employeeMasterId).maybeSingle();
  if (error) {
    console.error('[payroll-mis] tags', error);
    throw new Error('unavailable');
  }
  return data;
}

export async function fetchEmployeesForTags() {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const rows = check(await supabase.from('admin_ifsp_employee_master')
      .select('id, employee_id, full_name, department, location, status, employment_type')
      .order('employee_id', { ascending: true })
      .range(offset, offset + PAGE - 1), 'Could not load employees.') || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchLoginUsers() {
  return check(await supabase.from('profiles').select('id, email, username').order('email', { ascending: true }),
    'Could not load users.') || [];
}

export async function markPaymentPaid(id, { paidOn, challanRef, interest, penalty, note }) {
  return check(await supabase.rpc('admin_payroll_mis_mark_paid', {
    p_id: id, p_paid_on: paidOn, p_challan_ref: challanRef,
    p_interest: Number(interest) || 0, p_penalty: Number(penalty) || 0, p_note: note || null,
  }), 'Could not mark this payment as paid.');
}

export async function uploadChallan(payment, file) {
  const safe = String(file.name || 'challan.pdf').replace(/[^\w.-]+/g, '_');
  const path = `${payment.wage_month}/${payment.statute}-${payment.state}-${payment.id}-${Date.now()}-${safe}`;
  const up = await supabase.storage.from(CHALLAN_BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
  if (up.error) throw new Error(friendly(up.error, 'Could not upload the challan.'));
  check(await supabase.from('admin_payroll_statutory_payments')
    .update({ challan_path: path, updated_at: new Date().toISOString() }).eq('id', payment.id),
  'Could not attach the challan.');
  return path;
}

export async function challanUrl(path) {
  const { data, error } = await supabase.storage.from(CHALLAN_BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(friendly(error, 'Could not open the challan.'));
  return data.signedUrl;
}
