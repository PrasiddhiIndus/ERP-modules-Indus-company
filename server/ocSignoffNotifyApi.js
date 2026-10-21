/**
 * IEV PO At Glance — email the four sign-off assignees when a PO slot is signed.
 * From address: a Verified mailbox from CRM Outreach → Sender Mailboxes.
 */
import { isMailDispatchConfigured, sendOutboundMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';
import { isValidEmployeeEmail, normalizeEmployeeEmail } from '../shared/crmInHouseMail.mjs';

const SLOT_LABELS = {
  SALES: 'Sales & Commercial Department',
  PLANNING: 'Planning Department',
  IEV_HEAD: 'Group Head or IEV Head',
  FINANCE: 'Finance Department',
};

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

function slotLabel(slot) {
  return SLOT_LABELS[String(slot || '').toUpperCase()] || String(slot || 'Department');
}

/** Prefer IEV/PO-related verified mailbox; otherwise first verified outreach sender. */
async function resolveOutreachSender(db, senderMailboxId) {
  if (senderMailboxId) {
    const { data, error } = await db
      .from('sender_mailboxes')
      .select('id, mail, display_name, used_for, status')
      .eq('id', senderMailboxId)
      .maybeSingle();
    if (error) throw httpError(500, 'Could not load the sender mailbox.');
    if (!data) throw httpError(400, 'Sender mailbox not found.');
    if (data.status !== 'Verified') {
      throw httpError(400, `Sender ${data.mail} is not verified. Mark it Verified in Outreach → Sender Mailboxes.`);
    }
    return data;
  }

  const { data, error } = await db
    .from('sender_mailboxes')
    .select('id, mail, display_name, used_for, status')
    .eq('status', 'Verified')
    .order('created_at', { ascending: true });
  if (error) throw httpError(500, 'Could not load sender mailboxes.');
  const rows = data || [];
  if (!rows.length) return null;

  const preferred = rows.find((r) => {
    const u = String(r.used_for || '').toLowerCase();
    return /iev|po\b|glance|tender|notification/.test(u);
  });
  return preferred || rows[0];
}

async function resolveAssigneeEmail(db, employeeCode) {
  const code = String(employeeCode || '').trim();
  if (!code) return '';

  const { data: empRows } = await db
    .from('admin_ifsp_employee_master')
    .select('id, employee_code, email_id, user_id')
    .ilike('employee_code', escapeLike(code))
    .limit(1);
  const emp = (empRows || [])[0] || null;

  const fromMaster = normalizeEmployeeEmail(emp?.email_id);
  if (isValidEmployeeEmail(fromMaster)) return fromMaster;

  const { data: profiles } = await db
    .from('profiles')
    .select('id, email, employee_code')
    .ilike('employee_code', escapeLike(code))
    .limit(5);
  for (const p of profiles || []) {
    const e = normalizeEmployeeEmail(p.email);
    if (isValidEmployeeEmail(e)) return e;
  }

  if (emp?.user_id) {
    const { data: byUser } = await db.from('profiles').select('email').eq('id', emp.user_id).maybeSingle();
    const e = normalizeEmployeeEmail(byUser?.email);
    if (isValidEmployeeEmail(e)) return e;
    try {
      const { data: auth } = await db.auth.admin.getUserById(emp.user_id);
      const authEmail = normalizeEmployeeEmail(auth?.user?.email);
      if (isValidEmployeeEmail(authEmail)) return authEmail;
    } catch {
      /* ignore */
    }
  }

  return '';
}

function buildEmail({ master, signatures, signerName }) {
  const ocNo = String(master?.oc_no || '').trim() || '—';
  const client = String(master?.client_name || '').trim() || '—';
  const poWo = String(master?.po_wo_no || '').trim() || '—';
  const signLines = (signatures || [])
    .map(
      (s) =>
        `<li><strong>${escapeHtml(slotLabel(s.slot))}</strong> — signed by ${escapeHtml(s.signed_by || signerName || '—')}</li>`
    )
    .join('');

  const subject = `PO At Glance signed — OC ${ocNo}${client !== '—' ? ` · ${client}` : ''}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
<p>A department sign-off was recorded on <strong>PO At Glance</strong>.</p>
<ul>
<li><strong>OC No.</strong> ${escapeHtml(ocNo)}</li>
<li><strong>Client</strong> ${escapeHtml(client)}</li>
<li><strong>PO / WO No.</strong> ${escapeHtml(poWo)}</li>
</ul>
<p><strong>Signature(s) just applied:</strong></p>
<ul>${signLines || '<li>—</li>'}</ul>
<p>Please review the entry in IEV → Costing Hub → PO At Glance.</p>
<p>Regards,<br/>Indus ERP</p>
</div>`;
  return { subject, html };
}

/**
 * Notify the four assigned sign-off users that one or more PO slots were signed.
 * @returns {{ ok: true, from: string|null, sent: string[], skipped: {name:string,code:string,reason:string}[], failed: {email:string,error:string}[] }}
 */
export async function notifyOcSignoffAssignees({
  db,
  ocId,
  signatures,
  senderMailboxId,
  signerName,
}) {
  const id = String(ocId || '').trim();
  if (!id) throw httpError(400, 'PO At Glance id is missing.');

  const signs = (Array.isArray(signatures) ? signatures : [])
    .map((s) => ({
      slot: String(s?.slot || '').trim().toUpperCase(),
      signed_by: String(s?.signed_by || '').trim(),
    }))
    .filter((s) => s.slot && s.signed_by);
  if (!signs.length) throw httpError(400, 'No new signatures to notify about.');

  const { data: master, error: masterErr } = await db
    .from('oc_master')
    .select('id, oc_no, client_name, po_wo_no')
    .eq('id', id)
    .maybeSingle();
  if (masterErr) throw httpError(500, 'Could not load the PO At Glance.');
  if (!master) throw httpError(404, 'PO At Glance not found.');

  const { data: assignees, error: aErr } = await db
    .from('oc_signoff_assignees')
    .select('slot, employee_code, employee_name');
  if (aErr) throw httpError(500, 'Could not load sign-off assignees.');
  const rows = assignees || [];
  if (!rows.length) {
    throw httpError(400, 'No sign-off users are assigned yet. Set them in IEV Configuration → PO At Glance Sign-off.');
  }

  const recipients = [];
  const skipped = [];
  for (const a of rows) {
    const email = await resolveAssigneeEmail(db, a.employee_code);
    if (!email) {
      skipped.push({
        name: a.employee_name || a.employee_code,
        code: a.employee_code,
        reason: 'No email linked',
      });
      continue;
    }
    recipients.push({
      email,
      name: a.employee_name || a.employee_code,
      code: a.employee_code,
      slot: a.slot,
    });
  }

  if (!recipients.length) {
    throw httpError(
      400,
      'None of the four assigned users have a login or employee email. Add emails in Employee Master / User Management.'
    );
  }

  if (!isMailDispatchConfigured()) {
    throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);
  }

  const sender = await resolveOutreachSender(db, senderMailboxId);
  const { subject, html } = buildEmail({ master, signatures: signs, signerName });

  const sent = [];
  const failed = [];
  const uniqueEmails = [...new Map(recipients.map((r) => [r.email, r])).values()];

  for (const r of uniqueEmails) {
    try {
      await sendOutboundMail({
        from: sender?.mail || undefined,
        fromName: sender?.display_name || undefined,
        to: r.email,
        subject,
        html,
      });
      sent.push(r.email);
    } catch (err) {
      failed.push({ email: r.email, error: err?.message || 'Send failed' });
      console.warn('[oc/signoff-notify] send failed', r.email, err?.message || err);
    }
  }

  if (!sent.length) {
    throw httpError(502, failed[0]?.error || 'Could not send the notification email.');
  }

  console.info('[oc/signoff-notify] sent', {
    ocId: master.id,
    ocNo: master.oc_no,
    from: sender?.mail || null,
    sent: sent.length,
    skipped: skipped.length,
    failed: failed.length,
  });

  return {
    ok: true,
    from: sender?.mail || null,
    fromName: sender?.display_name || null,
    sent,
    skipped,
    failed,
    recipients: uniqueEmails.map((r) => ({ email: r.email, name: r.name, code: r.code })),
  };
}
