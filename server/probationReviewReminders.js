/**
 * Probation review reminder — emails an employee's L1 manager once the employee has
 * completed 6 months on probation, asking them to hold the review meeting.
 *
 * Who qualifies: Employee Master status is not Inactive/Left, employment type is probation,
 * and date of joining + 6 months is today or earlier. Each employee is claimed in
 * admin_probation_review_reminders before sending, so the L1 gets one reminder per employee.
 * Employees without an L1 or without an L1 email are retried on later checks.
 *
 * PROBATION_REVIEW_REMINDERS=off disables the job.
 */
import { createClient } from '@supabase/supabase-js';
import { isMailDispatchConfigured, sendOutboundMail } from './mail/index.js';
import { isValidEmployeeEmail, normalizeEmployeeEmail } from '../shared/crmInHouseMail.mjs';
import { resolveCtcEmailRecipient } from './salaryCtcEmailApi.js';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const SEND_AFTER_IST_HOUR = 10;
const PROBATION_MONTHS = 6;
const LOG_TABLE = 'admin_probation_review_reminders';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INACTIVE_STATUSES = new Set(['inactive', 'left']);
const PROBATION_TYPES = new Set(['probation', 'probahtion']);

function istNow(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000);
}

function istTodayIso(now = new Date()) {
  return istNow(now).toISOString().slice(0, 10);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** ISO date + n months, clamped to the month's last day (31 Aug + 6 → 28/29 Feb). */
export function addMonthsIso(iso, months) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y && m && d ? `${d} ${MONTHS[Number(m) - 1]} ${y}` : '—';
}

function isPossiblyDelivered(err) {
  return Number(err?.status) === 504 || err?.name === 'AbortError' || /timed out/i.test(String(err?.message || ''));
}

function isOnProbation(row) {
  return (
    !INACTIVE_STATUSES.has(String(row.status || '').trim().toLowerCase()) &&
    PROBATION_TYPES.has(String(row.employment_type || '').trim().toLowerCase())
  );
}

export function buildReminderEmail({ employee, manager, sixMonthDate }) {
  const name = employee.full_name || employee.employee_code || 'The employee';
  const subject = `Probation review due: ${name}${employee.employee_code ? ` (${employee.employee_code})` : ''} has completed 6 months`;
  const row = (label, value) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#4a5260">${label}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(value || '—')}</td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#12151a">
<p>Dear ${escapeHtml(manager.name || 'Manager')},</p>
<p>This is a gentle reminder that <strong>${escapeHtml(name)}</strong>, who reports to you, has completed
6 months on probation. Please schedule the probation review meeting and share your feedback with HR.</p>
<table style="border-collapse:collapse;font-size:13px;margin:8px 0 12px">
${row('Employee', name)}
${row('Employee code', employee.employee_code)}
${row('Designation', employee.designation)}
${row('Department', employee.department)}
${row('Date of joining', fmtDate(employee.date_of_joining))}
${row('6 months completed on', fmtDate(sixMonthDate))}
</table>
<p>Regards,<br/>HR Department<br/>Indus Fire Safety Private Limited</p>
<p style="color:#8a93a0;font-size:12px">This is an automated reminder from the ERP.</p>
</div>`;
  return { subject, html };
}

async function loadManagers(svc, codes) {
  const byCode = new Map();
  if (!codes.length) return byCode;
  const { data, error } = await svc
    .from('admin_ifsp_employee_master')
    .select('id, employee_code, full_name, email_id')
    .in('employee_code', codes);
  if (error) throw error;
  for (const m of data || []) byCode.set(String(m.employee_code || '').trim().toLowerCase(), m);
  return byCode;
}

/** L1's login email (profile / sign-in account), else the email on their Employee Master record. */
async function managerEmail(svc, manager) {
  try {
    const { email } = await resolveCtcEmailRecipient(svc, manager.id);
    if (isValidEmployeeEmail(email)) return email;
  } catch (err) {
    console.warn('[probation-review] L1 login email lookup failed:', err?.message || err);
  }
  const fallback = normalizeEmployeeEmail(manager.email_id);
  return isValidEmployeeEmail(fallback) ? fallback : '';
}

export async function runProbationReviewReminders(svc, { now = new Date() } = {}) {
  const today = istTodayIso(now);
  const { data: employees, error: eErr } = await svc
    .from('admin_ifsp_employee_master')
    .select('id, employee_code, full_name, designation, department, date_of_joining, employment_type, status, l1_manager_code, l1_manager_name')
    .not('date_of_joining', 'is', null)
    .or('employment_type.ilike.probation,employment_type.ilike.probahtion');
  if (eErr) throw eErr;

  const candidates = (employees || [])
    .filter(isOnProbation)
    .map((e) => ({ employee: e, sixMonthDate: addMonthsIso(e.date_of_joining, PROBATION_MONTHS) }))
    .filter((d) => d.sixMonthDate && d.sixMonthDate <= today);
  if (!candidates.length) return { sent: 0 };

  // Already reminded: matched by record id, and by employee code in case the record was re-created.
  const candidateCodes = [...new Set(candidates.map((d) => String(d.employee.employee_code || '').trim()).filter(Boolean))];
  const [byId, byCode] = await Promise.all([
    svc.from(LOG_TABLE).select('employee_master_id').in('employee_master_id', candidates.map((d) => d.employee.id)),
    candidateCodes.length
      ? svc.from(LOG_TABLE).select('employee_code').in('employee_code', candidateCodes)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byId.error) throw byId.error;
  if (byCode.error) throw byCode.error;
  const sentIds = new Set((byId.data || []).map((r) => String(r.employee_master_id)));
  const sentCodes = new Set((byCode.data || []).map((r) => String(r.employee_code || '').trim().toLowerCase()));
  const due = candidates.filter(
    (d) =>
      !sentIds.has(String(d.employee.id)) &&
      !sentCodes.has(String(d.employee.employee_code || '').trim().toLowerCase())
  );
  if (!due.length) return { sent: 0 };

  const codes = [...new Set(due.map((d) => String(d.employee.l1_manager_code || '').trim()).filter(Boolean))];
  const managers = await loadManagers(svc, codes);

  let sent = 0;
  let failed = 0;
  const skipped = [];
  for (const { employee, sixMonthDate } of due) {
    const code = String(employee.l1_manager_code || '').trim();
    const managerRow = code ? managers.get(code.toLowerCase()) : null;
    if (!managerRow) {
      skipped.push({ employee: employee.employee_code, reason: code ? 'L1 not found in Employee Master' : 'No L1 set' });
      continue;
    }
    const to = await managerEmail(svc, managerRow);
    if (!to) {
      skipped.push({ employee: employee.employee_code, reason: 'L1 has no email' });
      continue;
    }

    const { error: claimErr } = await svc.from(LOG_TABLE).insert({
      employee_master_id: employee.id,
      employee_code: employee.employee_code,
      date_of_joining: employee.date_of_joining,
      six_month_date: sixMonthDate,
      l1_manager_code: code,
      sent_to: to,
    });
    if (claimErr) continue;

    const manager = { name: managerRow.full_name || employee.l1_manager_name };
    const { subject, html } = buildReminderEmail({ employee, manager, sixMonthDate });
    try {
      await sendOutboundMail({ to, subject, html });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.warn('[probation-review] reminder failed for', employee.employee_code, err?.message || err);
      // A timeout may still have been delivered; keep the claim so the L1 is never emailed twice.
      if (!isPossiblyDelivered(err)) {
        await svc.from(LOG_TABLE).delete().eq('employee_master_id', employee.id);
      }
    }
  }
  return { sent, failed, skipped };
}

export function startProbationReviewReminders({ getSupabaseUrl, getServiceKey }) {
  if (String(process.env.PROBATION_REVIEW_REMINDERS || '').toLowerCase() === 'off') {
    console.log('[probation-review] reminders disabled (PROBATION_REVIEW_REMINDERS=off)');
    return null;
  }
  if (!getSupabaseUrl() || !getServiceKey()) {
    console.warn('[probation-review] reminders not started — Supabase service settings missing');
    return null;
  }
  let lastSkippedReport = '';
  const tick = async () => {
    if (istNow().getUTCHours() < SEND_AFTER_IST_HOUR) return;
    if (!isMailDispatchConfigured()) return;
    try {
      const svc = createClient(getSupabaseUrl(), getServiceKey(), { auth: { persistSession: false } });
      const out = await runProbationReviewReminders(svc);
      if (out.sent || out.failed) {
        console.log('[probation-review] reminders:', JSON.stringify({ sent: out.sent, failed: out.failed }));
      }
      const skippedReport = JSON.stringify(out.skipped || []);
      if (out.skipped?.length && skippedReport !== lastSkippedReport) {
        console.warn('[probation-review] waiting on L1 details:', skippedReport);
      }
      lastSkippedReport = skippedReport;
    } catch (err) {
      console.warn('[probation-review] reminder run failed:', err?.message || err);
    }
  };
  const first = setTimeout(tick, 120_000);
  const timer = setInterval(tick, CHECK_EVERY_MS);
  first.unref?.();
  timer.unref?.();
  return timer;
}
