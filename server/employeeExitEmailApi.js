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

import { randomUUID } from 'crypto';

const PDF_CONTENT_TYPE = 'application/pdf';
const MAX_ATTACHMENTS = 3;
/** Per-PDF cap (binary). Buffer above typical exit letter PDFs. */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
/** All attachments combined (binary), with headroom for 3 docs. */
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
/** Staged uploads expire so abandoned drafts do not hold memory. */
const STAGED_ATTACHMENT_TTL_MS = 15 * 60 * 1000;
const INACTIVE_STATUSES = new Set(['inactive', 'left']);

/** @type {Map<string, { ownerKey: string, filename: string, contentType: string, content: Buffer, label: string, expiresAt: number }>} */
const stagedAttachments = new Map();

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function purgeExpiredStagedAttachments() {
  const now = Date.now();
  for (const [id, row] of stagedAttachments) {
    if (row.expiresAt <= now) stagedAttachments.delete(id);
  }
}

function ownerKeyFromEmails(userEmails) {
  return (Array.isArray(userEmails) ? userEmails : [])
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

function decodeOnePdfAttachment(item, index) {
  const content = Buffer.from(String(item?.base64 || ''), 'base64');
  if (content.length < 5 || content.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw httpError(400, 'One of the documents could not be prepared. Please try again.');
  }
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw httpError(413, 'A document is too large to email. Try regenerating or send fewer documents.');
  }
  return {
    filename: sanitizePdfName(item?.fileName, `Exit-document-${index + 1}`),
    contentType: PDF_CONTENT_TYPE,
    content,
    label: String(item?.label || '').slice(0, 120),
  };
}

/** Stage one PDF (small request) so the final send can attach all files in a single email. */
export function stageExitEmailAttachment({ base64, fileName, label, userEmails }) {
  purgeExpiredStagedAttachments();
  const ownerKey = ownerKeyFromEmails(userEmails);
  if (!ownerKey) throw httpError(401, 'Not signed in.');
  const file = decodeOnePdfAttachment({ base64, fileName, label }, stagedAttachments.size);
  const id = randomUUID();
  stagedAttachments.set(id, {
    ownerKey,
    filename: file.filename,
    contentType: file.contentType,
    content: file.content,
    label: file.label,
    expiresAt: Date.now() + STAGED_ATTACHMENT_TTL_MS,
  });
  return { id, filename: file.filename, bytes: file.content.length };
}

function takeStagedAttachments(attachmentIds, userEmails) {
  purgeExpiredStagedAttachments();
  const ownerKey = ownerKeyFromEmails(userEmails);
  const ids = Array.isArray(attachmentIds) ? attachmentIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  if (!ids.length) throw httpError(400, 'Select at least one document to send.');
  if (ids.length > MAX_ATTACHMENTS) throw httpError(400, 'Too many documents selected.');

  const files = [];
  let totalBytes = 0;
  for (const id of ids) {
    const row = stagedAttachments.get(id);
    if (!row || row.ownerKey !== ownerKey) {
      throw httpError(400, 'A document upload expired. Please send again.');
    }
    totalBytes += row.content.length;
    files.push({
      filename: row.filename,
      contentType: row.contentType,
      content: row.content,
      label: row.label,
    });
    stagedAttachments.delete(id);
  }
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw httpError(413, 'The selected documents together are too large to email. Send fewer at a time.');
  }
  return files;
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
  let totalBytes = 0;
  const files = items.map((item, i) => {
    const file = decodeOnePdfAttachment(item, i);
    totalBytes += file.content.length;
    return file;
  });
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw httpError(413, 'The selected documents together are too large to email. Send fewer at a time.');
  }
  return files;
}

export async function sendExitDocumentsEmail({
  db,
  employeeMasterId,
  to,
  attachments,
  attachmentIds,
  senderMail,
  userEmails,
  senderEmail,
}) {
  const employee = await loadInactiveEmployee(db, employeeMasterId);
  const email = normalizeEmployeeEmail(to);
  if (!isValidEmployeeEmail(email)) throw httpError(400, 'Enter a valid email address.');
  const files =
    Array.isArray(attachmentIds) && attachmentIds.length
      ? takeStagedAttachments(attachmentIds, userEmails)
      : decodeAttachments(attachments);
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

  const mailBase = {
    to: email,
    bcc,
    subject,
    html,
    attachments: mailAttachments,
  };

  try {
    await sendOutboundMail({
      ...mailBase,
      from: sender.mail,
      fromName: sender.name,
    });
  } catch (err) {
    // Personal mailbox often lacks Graph app access; fall back to the company mailbox
    // with Reply-To + BCC so the chosen sender still gets the same mail.
    if (err?.code === 'MAIL_MESSAGE_TOO_LARGE') {
      throw httpError(
        413,
        'The documents are too large to send in one email. Try fewer documents, or ask IT to review mail size limits.'
      );
    }
    if (err?.code !== 'MAILBOX_SEND_DENIED' || !isPersonalSenderMailbox(sender.mail)) throw err;

    const config = getMicrosoftGraphMailConfig();
    if (!config?.notificationEmail) throw err;

    await sendOutboundMail({
      ...mailBase,
      from: config.notificationEmail,
      fromName: sender.name || config.notificationName,
      replyTo: sender.mail,
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
    messages: 1,
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
    messages: 1,
  };
}
