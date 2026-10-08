/**
 * Email an employee their CTC details (Annexure-I PDFs built in the browser).
 * The recipient is always resolved on the server from the employee's login
 * (profile linked by employee code / user id, then the auth account) — never taken from the client.
 */
import { isMailDispatchConfigured, sendOutboundMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';
import { isValidEmployeeEmail, normalizeEmployeeEmail } from '../shared/crmInHouseMail.mjs';
import {
  isSalaryAdminAllowedEmail,
  isSalaryFiguresHidden,
} from '../src/pages/adminOperations/salaryAdmin/salaryAccess.js';

const MAX_ATTACHMENTS = 12;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5.5 * 1024 * 1024;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeLike(v) {
  return String(v || '').replace(/[\\%_]/g, (c) => `\\${c}`);
}

function sanitizePdfName(name, fallback) {
  const base = String(name || '')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
  return `${base || fallback}.pdf`;
}

/** Same allowlist as the Salary Admin screens; the masked login cannot send figures. */
export function canEmailCtcDetails(ctx) {
  const profile = ctx?.profile || null;
  const user = ctx?.user || null;
  return isSalaryAdminAllowedEmail(profile?.email || user?.email) && !isSalaryFiguresHidden(profile, user);
}

async function loadEmployee(db, employeeMasterId) {
  const id = String(employeeMasterId ?? '').trim();
  if (!id) throw httpError(400, 'Employee is missing.');
  const { data, error } = await db
    .from('admin_ifsp_employee_master')
    .select('id, employee_code, full_name, user_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw httpError(500, 'Could not load the employee.');
  if (!data) throw httpError(404, 'Employee not found.');
  return data;
}

async function authEmail(db, userId) {
  if (!userId) return '';
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return normalizeEmployeeEmail(data?.user?.email);
  } catch {
    return '';
  }
}

/** Employee login email: profile by employee code, then by linked user id, then the auth account. */
export async function resolveCtcEmailRecipient(db, employeeMasterId) {
  const employee = await loadEmployee(db, employeeMasterId);
  const code = String(employee.employee_code || '').trim();

  const profiles = [];
  if (code) {
    const { data } = await db.from('profiles').select('id, email').ilike('employee_code', escapeLike(code)).limit(5);
    profiles.push(...(data || []));
  }
  if (employee.user_id && !profiles.some((p) => p.id === employee.user_id)) {
    const { data } = await db.from('profiles').select('id, email').eq('id', employee.user_id).maybeSingle();
    if (data) profiles.push(data);
  }

  let email = '';
  for (const p of profiles) {
    const e = normalizeEmployeeEmail(p.email);
    if (isValidEmployeeEmail(e)) {
      email = e;
      break;
    }
  }
  if (!email) {
    for (const userId of [...profiles.map((p) => p.id), employee.user_id].filter(Boolean)) {
      const e = await authEmail(db, userId);
      if (isValidEmployeeEmail(e)) {
        email = e;
        break;
      }
    }
  }

  return { employee, email };
}

function decodeAttachments(list, employeeCode) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) throw httpError(400, 'Select at least one CTC record to send.');
  if (items.length > MAX_ATTACHMENTS) throw httpError(400, `Select at most ${MAX_ATTACHMENTS} CTC records at a time.`);
  let total = 0;
  return items.map((item, i) => {
    const b64 = String(item?.pdfBase64 || '').replace(/^data:application\/pdf;base64,/i, '');
    const content = Buffer.from(b64, 'base64');
    if (!content.length || content.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw httpError(400, 'One of the CTC documents could not be prepared. Please try again.');
    }
    if (content.length > MAX_ATTACHMENT_BYTES) throw httpError(413, 'A CTC document is too large to email.');
    total += content.length;
    if (total > MAX_TOTAL_BYTES) throw httpError(413, 'Too many CTC records selected for one email. Send fewer at a time.');
    return {
      filename: sanitizePdfName(item?.fileName, `Annexure-I_${employeeCode || 'employee'}_${i + 1}`),
      contentType: 'application/pdf',
      content,
      label: String(item?.label || '').slice(0, 120),
    };
  });
}

export async function sendCtcDetailsEmail({ db, employeeMasterId, attachments, senderEmail }) {
  const { employee, email } = await resolveCtcEmailRecipient(db, employeeMasterId);
  if (!email) {
    throw httpError(400, 'No email is linked to this employee’s login. Add it in User Management first.');
  }
  const files = decodeAttachments(attachments, String(employee.employee_code || '').trim());
  if (!isMailDispatchConfigured()) throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);

  const name = String(employee.full_name || '').trim() || 'Employee';
  const list = files
    .map((f) => `<li>${escapeHtml(f.label || f.filename)}</li>`)
    .join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
<p>Dear ${escapeHtml(name)},</p>
<p>Please find attached your CTC details (Annexure-I):</p>
<ul>${list}</ul>
<p>This document is confidential. Please contact HR for any clarification.</p>
<p>Regards,<br/>HR Department<br/>Indus Fire Safety Private Limited</p>
</div>`;

  await sendOutboundMail({
    to: email,
    subject: `CTC details (Annexure-I) – ${name}${employee.employee_code ? ` (${employee.employee_code})` : ''}`,
    html,
    attachments: files.map(({ label: _label, ...f }) => f),
  });

  console.info('[salary/ctc-email] sent', {
    employeeMasterId: employee.id,
    employeeCode: employee.employee_code,
    files: files.length,
    by: senderEmail || null,
  });
  return { ok: true, email, sent: files.length };
}
