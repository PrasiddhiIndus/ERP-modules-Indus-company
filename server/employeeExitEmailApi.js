/**
 * Email exit documents (PDF copies built in the browser on the company letterhead)
 * to an Inactive / Left employee from the configured company mailbox.
 */
import {
  isMailDispatchConfigured,
  sendOutboundMail,
  MAIL_NOT_CONFIGURED_MESSAGE,
  getMicrosoftGraphMailConfig,
} from './mail/index.js';
import { isValidEmployeeEmail, normalizeEmployeeEmail } from '../shared/crmInHouseMail.mjs';
import { resolveCtcEmailRecipient } from './salaryCtcEmailApi.js';
import { listInHouseSenders } from './crmInHouseMailApi.js';
import { isPersonalSenderMailbox, senderNotAllowedMessage } from './mail/senderAccess.js';

const PDF_CONTENT_TYPE = 'application/pdf';
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const INACTIVE_STATUSES = new Set(['inactive', 'left']);

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

function sanitizePdfName(name, fallback) {
  const base = String(name || '')
    .trim()
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/[^a-zA-Z0-9 ._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
  return `${base || fallback}.pdf`;
}

/** Login email on file for the employee (profile, then auth account). */
export async function resolveExitEmailRecipient(db, employeeMasterId) {
  const { email } = await resolveCtcEmailRecipient(db, employeeMasterId);
  return email || '';
}

/** "From" mailboxes this user may send as: company mailbox first, then their own. */
export function listExitEmailSenders(db, userEmails) {
  return listInHouseSenders({ supabaseAdmin: db, userEmails });
}

async function resolveSender(db, userEmails, senderMail) {
  const senders = await listExitEmailSenders(db, userEmails);
  const requested = String(senderMail || '').trim().toLowerCase();
  const sender = requested ? senders.find((s) => s.mail === requested) : senders[0];
  if (sender) return sender;
  throw httpError(
    403,
    isPersonalSenderMailbox(requested)
      ? senderNotAllowedMessage(requested)
      : 'This sender mailbox is not allowed. Choose another "From" address.'
  );
}

async function loadInactiveEmployee(db, employeeMasterId) {
  const id = String(employeeMasterId ?? '').trim();
  if (!id) throw httpError(400, 'Employee is missing.');
  const { data, error } = await db
    .from('admin_ifsp_employee_master')
    .select('id, employee_code, full_name, status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw httpError(500, 'Could not load the employee.');
  if (!data) throw httpError(404, 'Employee not found.');
  if (!INACTIVE_STATUSES.has(String(data.status || '').trim().toLowerCase())) {
    throw httpError(400, 'Exit documents can only be emailed for Inactive or Left employees.');
  }
  return data;
}

function decodeAttachments(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) throw httpError(400, 'Select at least one document to send.');
  if (items.length > MAX_ATTACHMENTS) throw httpError(400, 'Too many documents selected.');
  return items.map((item, i) => {
    const content = Buffer.from(String(item?.base64 || ''), 'base64');
    if (content.length < 5 || content.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw httpError(400, 'One of the documents could not be prepared. Please try again.');
    }
    if (content.length > MAX_ATTACHMENT_BYTES) throw httpError(413, 'A document is too large to email.');
    return {
      filename: sanitizePdfName(item?.fileName, `Exit-document-${i + 1}`),
      contentType: PDF_CONTENT_TYPE,
      content,
      label: String(item?.label || '').slice(0, 120),
    };
  });
}

export async function sendExitDocumentsEmail({
  db,
  employeeMasterId,
  to,
  attachments,
  senderMail,
  userEmails,
  senderEmail,
}) {
  const employee = await loadInactiveEmployee(db, employeeMasterId);
  const email = normalizeEmployeeEmail(to);
  if (!isValidEmployeeEmail(email)) throw httpError(400, 'Enter a valid email address.');
  const files = decodeAttachments(attachments);
  if (!isMailDispatchConfigured()) throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);
  const sender = await resolveSender(db, userEmails, senderMail);

  const name = String(employee.full_name || '').trim() || 'Employee';
  const list = files.map((f) => `<li>${escapeHtml(f.label || f.filename)}</li>`).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
<p>Dear ${escapeHtml(name)},</p>
<p>Please find attached your exit documents:</p>
<ul>${list}</ul>
<p>Please contact HR for any clarification.</p>
<p>Regards,<br/>HR Department<br/>Indus Fire Safety Private Limited</p>
</div>`;

  const subject = `Exit documents – ${name}${employee.employee_code ? ` (${employee.employee_code})` : ''}`;
  const mailAttachments = files.map(({ label: _label, ...f }) => f);
  // Same message to the From mailbox (Inbox), unless it is already the employee address.
  const senderCopy = sender.mail && sender.mail !== email ? sender.mail : null;
  const bcc = senderCopy ? [senderCopy] : undefined;

  let deliveredFrom = sender.mail;
  let deliveredVia = sender.mail;
  let usedFallback = false;

  try {
    await sendOutboundMail({
      from: sender.mail,
      fromName: sender.name,
      to: email,
      bcc,
      subject,
      html,
      attachments: mailAttachments,
    });
  } catch (err) {
    // Personal mailbox often lacks Graph app access; fall back to the company mailbox
    // with Reply-To + BCC so the chosen sender still gets the same mail.
    const canFallback =
      err?.code === 'MAILBOX_SEND_DENIED' &&
      isPersonalSenderMailbox(sender.mail);
    if (!canFallback) throw err;

    const config = getMicrosoftGraphMailConfig();
    if (!config?.notificationEmail) throw err;

    await sendOutboundMail({
      from: config.notificationEmail,
      fromName: sender.name || config.notificationName,
      to: email,
      bcc,
      replyTo: sender.mail,
      subject,
      html,
      attachments: mailAttachments,
    });
    deliveredFrom = sender.mail;
    deliveredVia = config.notificationEmail;
    usedFallback = true;
    console.warn('[employee-exit/email] send-as denied; sent via company mailbox', {
      requested: sender.mail,
      via: deliveredVia,
    });
  }

  console.info('[employee-exit/email] sent', {
    employeeMasterId: employee.id,
    employeeCode: employee.employee_code,
    files: files.length,
    from: deliveredFrom,
    via: deliveredVia,
    senderCopy,
    fallback: usedFallback,
    by: senderEmail || null,
  });
  return {
    ok: true,
    email,
    from: deliveredFrom,
    via: usedFallback ? deliveredVia : undefined,
    senderCopy: senderCopy || undefined,
    sent: files.length,
  };
}
