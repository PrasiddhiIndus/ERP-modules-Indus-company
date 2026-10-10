/**
 * Payroll MIS — daily statutory due-date alert.
 * Emails active recipients (MIS Setup → Alert emails) a digest of payments that are Due soon
 * (within 3 days) or Overdue. Each payment is claimed in admin_payroll_mis_alert_log once per day
 * before sending, so restarts or several server instances do not send it twice.
 *
 * PAYROLL_MIS_ALERTS=off disables the job.
 */
import { createClient } from '@supabase/supabase-js';
import { isMailDispatchConfigured, sendOutboundMail } from './mail/index.js';
import {
  STATUTE_LABELS,
  formatInr,
  monthLabel,
  paymentStatus,
  todayIso,
} from '../src/pages/adminOperations/salaryAdmin/mis/misMetrics.js';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const SEND_AFTER_IST_HOUR = 9;

function istHour(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).getUTCHours();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
  if (!d) return 'Per state calendar';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day} ${monthLabel(`${y}-${m}`).slice(0, 3)} ${y}`;
}

export function buildAlertEmail(items, today, company) {
  const overdue = items.filter((i) => i.status.key === 'overdue');
  const dueSoon = items.filter((i) => i.status.key === 'due_soon');
  const subject = `Statutory payments: ${overdue.length ? `${overdue.length} overdue` : ''}${overdue.length && dueSoon.length ? ', ' : ''}${dueSoon.length ? `${dueSoon.length} due soon` : ''} — ${fmtDate(today)}`;
  const row = (i) => `<tr>
    <td style="padding:6px 10px;border:1px solid #dde3eb">${escapeHtml(monthLabel(i.wage_month))}</td>
    <td style="padding:6px 10px;border:1px solid #dde3eb">${escapeHtml(STATUTE_LABELS[i.statute] || i.statute)}${i.state && i.state !== 'ALL' ? ` (${escapeHtml(i.state)})` : ''}</td>
    <td style="padding:6px 10px;border:1px solid #dde3eb">${escapeHtml(fmtDate(i.due_date))}</td>
    <td style="padding:6px 10px;border:1px solid #dde3eb;text-align:right">₹${escapeHtml(formatInr(i.amount))}</td>
    <td style="padding:6px 10px;border:1px solid #dde3eb;color:${i.status.key === 'overdue' ? '#b91c1c' : '#b45309'};font-weight:600">${escapeHtml(i.status.label)}${i.status.key === 'overdue' ? ` · ${i.status.daysLate} day${i.status.daysLate === 1 ? '' : 's'}` : ''}</td>
  </tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#12151a">
    <p>${escapeHtml(company)} — statutory payments that need attention today.</p>
    <table style="border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#eef2f6">
        <th style="padding:6px 10px;border:1px solid #dde3eb;text-align:left">Wage month</th>
        <th style="padding:6px 10px;border:1px solid #dde3eb;text-align:left">Statute</th>
        <th style="padding:6px 10px;border:1px solid #dde3eb;text-align:left">Due date</th>
        <th style="padding:6px 10px;border:1px solid #dde3eb;text-align:right">Amount</th>
        <th style="padding:6px 10px;border:1px solid #dde3eb;text-align:left">Status</th>
      </tr></thead>
      <tbody>${[...overdue, ...dueSoon].map(row).join('')}</tbody>
    </table>
    <p style="color:#4a5260">Mark a payment as paid (with the challan reference) in Salary Admin → MIS Reports → Due dates.</p>
  </div>`;
  return { subject, html };
}

export async function runPayrollMisAlerts(svc, { now = new Date() } = {}) {
  const today = todayIso(now);
  const [{ data: payments, error: pErr }, { data: recipients, error: rErr }, { data: settings }] = await Promise.all([
    svc.from('admin_payroll_statutory_payments').select('*').is('paid_on', null).gt('amount', 0),
    svc.from('admin_payroll_mis_alert_recipients').select('email').eq('active', true),
    svc.from('admin_payroll_mis_settings').select('value').eq('key', 'company_name').maybeSingle(),
  ]);
  if (pErr) throw pErr;
  if (rErr) throw rErr;
  const to = (recipients || []).map((r) => String(r.email || '').trim()).filter(Boolean);
  if (!to.length) return { sent: 0, reason: 'no recipients' };

  const flagged = (payments || [])
    .map((p) => ({ ...p, status: paymentStatus(p, today) }))
    .filter((p) => p.status.key === 'due_soon' || p.status.key === 'overdue');
  if (!flagged.length) return { sent: 0 };

  const claimed = [];
  for (const p of flagged) {
    const { error } = await svc.from('admin_payroll_mis_alert_log')
      .insert({ alert_date: today, payment_id: p.id, status: p.status.key, sent_to: to.join(', ').slice(0, 500) });
    if (!error) claimed.push(p);
  }
  if (!claimed.length) return { sent: 0, reason: 'already sent today' };

  const company = typeof settings?.value === 'string' ? settings.value : 'Indus Fire Safety Pvt. Ltd.';
  const { subject, html } = buildAlertEmail(claimed, today, company);
  let sent = 0;
  const failed = [];
  for (const email of to) {
    try {
      await sendOutboundMail({ to: email, subject, html });
      sent += 1;
    } catch (err) {
      failed.push(email);
      console.warn('[payroll-mis] alert email failed for', email, err?.message || err);
    }
  }
  if (!sent) {
    // Nobody received it: release today's claim so the next check retries.
    await svc.from('admin_payroll_mis_alert_log').delete().eq('alert_date', today).in('payment_id', claimed.map((p) => p.id));
  }
  return { sent, failed: failed.length, items: claimed.length };
}

export function startPayrollMisAlerts({ getSupabaseUrl, getServiceKey }) {
  if (String(process.env.PAYROLL_MIS_ALERTS || '').toLowerCase() === 'off') {
    console.log('[payroll-mis] due-date alerts disabled (PAYROLL_MIS_ALERTS=off)');
    return null;
  }
  if (!getSupabaseUrl() || !getServiceKey()) {
    console.warn('[payroll-mis] due-date alerts not started — Supabase service settings missing');
    return null;
  }
  const tick = async () => {
    if (istHour() < SEND_AFTER_IST_HOUR) return;
    if (!isMailDispatchConfigured()) return;
    try {
      const svc = createClient(getSupabaseUrl(), getServiceKey(), { auth: { persistSession: false } });
      const out = await runPayrollMisAlerts(svc);
      if (out.sent || out.failed) {
        console.log('[payroll-mis] due-date alerts:', JSON.stringify(out));
      }
    } catch (err) {
      console.warn('[payroll-mis] due-date alert run failed:', err?.message || err);
    }
  };
  const first = setTimeout(tick, 90_000);
  const timer = setInterval(tick, CHECK_EVERY_MS);
  first.unref?.();
  timer.unref?.();
  return timer;
}
