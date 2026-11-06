/**
 * IEV PO At Glance — email the four sign-off assignees when a PO slot is signed.
 * From address: a Verified mailbox from CRM Outreach → Sender Mailboxes.
 */
import { isMailDispatchConfigured, sendOutboundMail, sendThreadedMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';
import { isValidEmployeeEmail, normalizeEmployeeEmail } from '../shared/crmInHouseMail.mjs';

/** Per-department tables, box labels and wording. IEV is the default; Maintenance has its own records. */
export const OC_NOTIFY_PROFILES = {
  iev: {
    masterTable: 'oc_master',
    assigneesTable: 'oc_signoff_assignees',
    signoffTable: 'oc_signoff',
    slotLabels: {
      SALES: 'Sales & Commercial Department',
      PLANNING: 'Planning Department',
      IEV_HEAD: 'Group Head or IEV Head',
      FINANCE: 'Finance Department',
    },
    reviewPath: 'IEV → Costing Hub → PO At Glance',
    configPath: 'IEV Configuration → PO At Glance Sign-off',
    assigneeCount: 'four',
  },
  maintenance: {
    masterTable: 'mm_oc_master',
    assigneesTable: 'mm_oc_signoff_assignees',
    signoffTable: 'mm_oc_signoff',
    slotLabels: {
      MM_USER: 'User (M&M Dept.)',
      VERTICAL_HEAD: 'Vertical Head',
      FINANCE: 'Finance Department',
    },
    reviewPath: 'Maintenance → PO At Glance',
    configPath: 'Maintenance → PO At Glance Sign-off Assignment',
    assigneeCount: 'three',
  },
  projects: {
    masterTable: 'pj_oc_master',
    assigneesTable: 'pj_oc_signoff_assignees',
    signoffTable: 'pj_oc_signoff',
    slotLabels: {
      PROJECT_USER: 'OC Creation',
      PLANNING: 'Execution Department',
      VERTICAL_HEAD: 'Department Head',
      FINANCE: 'Finance Department',
    },
    reviewPath: 'Projects → PO At Glance',
    configPath: 'Projects → PO At Glance Sign-off Assignment',
    assigneeCount: 'four',
  },
  rm: {
    masterTable: 'rm_oc_master',
    assigneesTable: 'rm_oc_signoff_assignees',
    signoffTable: 'rm_oc_signoff',
    slotLabels: {
      RM_USER: 'User (R&M Dept.)',
      VERTICAL_HEAD: 'Vertical Head',
      FINANCE: 'Finance Department',
    },
    reviewPath: 'R&M → PO At Glance',
    configPath: 'R&M → PO At Glance Sign-off Assignment',
    assigneeCount: 'three',
  },
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

function slotLabel(profile, slot) {
  return profile.slotLabels[String(slot || '').toUpperCase()] || String(slot || 'Department');
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

const EMPLOYEE_MAIL_COLUMNS = 'id, employee_code, full_name, department, designation, email_id, location, status, user_id';

function preferCurrentEmployee(rows) {
  const list = rows || [];
  const active = list.filter((row) => String(row.status || '').trim().toLowerCase() === 'active');
  const pool = active.length ? active : list;
  return pool.slice().sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

/** The person who signed, from Employee Master. Their login wins over an old assignment. */
async function loadEmployeeForSigner(db, { userId, employeeCode }) {
  if (userId) {
    const byUser = await loadCurrentEmployee(db, { userId });
    if (byUser) return byUser;
    const { data: profile } = await db.from('profiles').select('employee_code').eq('id', userId).maybeSingle();
    const byProfile = await loadCurrentEmployee(db, { employeeCode: profile?.employee_code });
    if (byProfile) return byProfile;
    return null;
  }
  return loadCurrentEmployee(db, { employeeCode });
}

/** Latest Employee Master row. Department and designation are read here, not from an old assignment. */
async function loadCurrentEmployee(db, { employeeCode, userId }) {
  const code = String(employeeCode || '').trim();
  if (code) {
    const { data } = await db
      .from('admin_ifsp_employee_master')
      .select(EMPLOYEE_MAIL_COLUMNS)
      .ilike('employee_code', escapeLike(code))
      .limit(8);
    const match = preferCurrentEmployee(data);
    if (match) return match;
  }
  if (userId) {
    const { data } = await db
      .from('admin_ifsp_employee_master')
      .select(EMPLOYEE_MAIL_COLUMNS)
      .eq('user_id', userId)
      .limit(8);
    return preferCurrentEmployee(data);
  }
  return null;
}

function signerDetailsHtml(profile, sign) {
  const employee = sign.employee || null;
  const name = String(employee?.full_name || sign.signed_by || sign.signerName || '').trim() || '—';
  const department = String(employee?.department || '').trim();
  const designation = String(employee?.designation || '').trim();
  const location = String(employee?.location || '').trim();
  const facts = [
    department ? `<br/>Department: ${escapeHtml(department)}` : '',
    designation ? `<br/>Designation: ${escapeHtml(designation)}` : '',
    location ? `<br/>Location: ${escapeHtml(location)}` : '',
  ].join('');
  return `<li><strong>${escapeHtml(slotLabel(profile, sign.slot))}</strong> — signed by ${escapeHtml(name)}${facts}</li>`;
}

function projectsThreadSubject(master) {
  const client = String(master?.client_name || '').trim() || 'PO At Glance';
  const poWo = String(master?.po_wo_no || '').trim();
  return poWo ? `PO At Glance — ${client} · ${poWo}` : `PO At Glance — ${client}`;
}

function projectsThreadHtml({ profile, master, event, signatures, signerName, ocNo, ocDate, remarks, actorName }) {
  const client = String(master?.client_name || '').trim() || '—';
  const poWo = String(master?.po_wo_no || '').trim() || '—';
  const facts = `<ul>
<li><strong>Client</strong> ${escapeHtml(client)}</li>
<li><strong>PO / WO No.</strong> ${escapeHtml(poWo)}</li>
</ul>`;
  let update = '';
  if (event === 'created') {
    update = `<p>A PO At Glance record was created and is ready for approval.</p>${facts}<p>Later signatures, the OC Number, and any revision will continue in this email.</p>`;
  } else if (event === 'oc_number') {
    const number = String(ocNo || master?.oc_no || '').trim() || '—';
    const when = String(ocDate || '').trim();
    update = `<p><strong>OC Number update:</strong> ${escapeHtml(number)}${when ? ` (date ${escapeHtml(when)})` : ''}.</p>${facts}`;
  } else if (event === 'revision') {
    const who = String(actorName || '').trim() || '—';
    const note = String(remarks || '').trim() || '—';
    update = `<p><strong>Sent for revision</strong> by ${escapeHtml(who)}.</p><p>Remarks: ${escapeHtml(note)}</p><p>Approval starts again from the first stage.</p>${facts}`;
  } else {
    const lines = (signatures || []).map((s) => signerDetailsHtml(profile, { ...s, signerName })).join('');
    update = `<p><strong>Stage update</strong> on this PO.</p><ul>${lines || '<li>—</li>'}</ul>`;
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
${update}
<p>Please review the entry in ${escapeHtml(profile.reviewPath)}.</p>
<p>Regards,<br/>Indus ERP</p>
</div>`;
}

function buildEmail({ profile, master, signatures, signerName }) {
  const ocNo = String(master?.oc_no || '').trim() || '—';
  const client = String(master?.client_name || '').trim() || '—';
  const poWo = String(master?.po_wo_no || '').trim() || '—';
  const signLines = (signatures || [])
    .map((s) => signerDetailsHtml(profile, { ...s, signerName }))
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
<p>Please review the entry in ${escapeHtml(profile.reviewPath)}.</p>
<p>Regards,<br/>Indus ERP</p>
</div>`;
  return { subject, html };
}

/**
 * Notify the assigned sign-off users that one or more PO slots were signed.
 * `department` picks the records and assignees ('iev' by default, 'maintenance', 'projects' or 'rm').
 * @returns {{ ok: true, from: string|null, sent: string[], skipped: {name:string,code:string,reason:string}[], failed: {email:string,error:string}[] }}
 */
const PROJECT_MAIL_EVENTS = new Set(['created', 'stage', 'oc_number', 'revision']);

async function loadProjectsMailThread(db, ocId) {
  const { data, error } = await db.from('pj_oc_mail_thread').select('*').eq('oc_id', ocId).maybeSingle();
  if (error) throw httpError(500, 'Could not load the email thread.');
  return data || null;
}

async function saveProjectsMailThread(db, row) {
  const { error } = await db.from('pj_oc_mail_thread').upsert(
    { ...row, updated_at: new Date().toISOString() },
    { onConflict: 'oc_id' }
  );
  if (error) throw httpError(500, 'Could not save the email thread.');
}

export async function notifyOcSignoffAssignees({
  db,
  ocId,
  signatures,
  senderMailboxId,
  signerName,
  department = 'iev',
  event = 'stage',
  ocNo,
  ocDate,
  remarks,
  actorName,
}) {
  const profile = OC_NOTIFY_PROFILES[department];
  if (!profile) throw httpError(400, 'Unknown PO At Glance department.');
  const id = String(ocId || '').trim();
  if (!id) throw httpError(400, 'PO At Glance id is missing.');
  const mailEvent = department === 'projects' && PROJECT_MAIL_EVENTS.has(event) ? event : 'stage';

  const signs = (Array.isArray(signatures) ? signatures : [])
    .map((s) => ({
      slot: String(s?.slot || '').trim().toUpperCase(),
      signed_by: String(s?.signed_by || '').trim(),
    }))
    .filter((s) => s.slot && s.signed_by);
  if (mailEvent === 'stage' && !signs.length) throw httpError(400, 'No new signatures to notify about.');

  const { data: master, error: masterErr } = await db
    .from(profile.masterTable)
    .select('id, oc_no, client_name, po_wo_no')
    .eq('id', id)
    .maybeSingle();
  if (masterErr) throw httpError(500, 'Could not load the PO At Glance.');
  if (!master) throw httpError(404, 'PO At Glance not found.');

  const { data: assignees, error: aErr } = await db
    .from(profile.assigneesTable)
    .select('slot, employee_code, employee_name');
  if (aErr) throw httpError(500, 'Could not load sign-off assignees.');
  const rows = assignees || [];

  let signoffRows = [];
  if (profile.signoffTable) {
    const { data: signedRows, error: sErr } = await db
      .from(profile.signoffTable)
      .select('slot, signed_by, signed_user_id')
      .eq('oc_id', id);
    if (sErr) throw httpError(500, 'Could not load the sign-off.');
    signoffRows = signedRows || [];
  }
  const signoffBySlot = new Map(signoffRows.map((row) => [String(row.slot || '').toUpperCase(), row]));
  const assigneeBySlot = new Map(rows.map((row) => [String(row.slot || '').toUpperCase(), row]));
  if (!rows.length) {
    throw httpError(400, `No sign-off users are assigned yet. Set them in ${profile.configPath}.`);
  }

  const recipients = [];
  const skipped = [];
  for (const a of rows) {
    const employee = await loadCurrentEmployee(db, { employeeCode: a.employee_code });
    const email = await resolveAssigneeEmail(db, a.employee_code);
    const name = employee?.full_name || a.employee_name || a.employee_code;
    if (!email) {
      skipped.push({
        name,
        code: a.employee_code,
        reason: 'No email linked',
      });
      continue;
    }
    recipients.push({
      email,
      name,
      code: employee?.employee_code || a.employee_code,
      slot: a.slot,
    });
  }

  if (!recipients.length) {
    throw httpError(
      400,
      `None of the ${profile.assigneeCount} assigned users have a login or employee email. Add emails in Employee Master / User Management.`
    );
  }

  if (!isMailDispatchConfigured()) {
    throw httpError(503, MAIL_NOT_CONFIGURED_MESSAGE);
  }

  const sender = await resolveOutreachSender(db, senderMailboxId);
  const signsWithEmployee = [];
  for (const sign of signs) {
    const recorded = signoffBySlot.get(sign.slot);
    const assignee = assigneeBySlot.get(sign.slot);
    const employee = await loadEmployeeForSigner(db, {
      userId: recorded?.signed_user_id,
      employeeCode: assignee?.employee_code,
    });
    signsWithEmployee.push({
      ...sign,
      signed_by: employee?.full_name || recorded?.signed_by || sign.signed_by,
      employee,
    });
  }
  const uniqueEmails = [...new Map(recipients.map((r) => [r.email, r])).values()];
  const sent = [];
  const failed = [];

  if (department === 'projects') {
    const thread = await loadProjectsMailThread(db, master.id);
    const subject = thread?.subject || projectsThreadSubject(master);
    const threadRecipients = Array.isArray(thread?.recipients) && thread.recipients.length
      ? thread.recipients
      : uniqueEmails.map((r) => ({ email: r.email, name: r.name }));
    const html = projectsThreadHtml({
      profile,
      master,
      event: mailEvent,
      signatures: signsWithEmployee,
      signerName,
      ocNo,
      ocDate,
      remarks,
      actorName,
    });
    try {
      const posted = await sendThreadedMail({
        from: sender?.mail || undefined,
        fromName: sender?.display_name || undefined,
        toList: threadRecipients,
        subject,
        html,
        replyToMessageId: thread?.latest_message_id || null,
      });
      await saveProjectsMailThread(db, {
        oc_id: master.id,
        mailbox: posted.mailbox,
        latest_message_id: posted.messageId,
        conversation_id: posted.conversationId || thread?.conversation_id || null,
        subject,
        recipients: threadRecipients,
      });
      for (const row of threadRecipients) sent.push(row.email);
    } catch (err) {
      failed.push({ email: threadRecipients.map((r) => r.email).join(', '), error: err?.message || 'Send failed' });
      console.warn('[oc/signoff-notify] thread send failed', err?.message || err);
    }
  } else {
    const { subject, html } = buildEmail({ profile, master, signatures: signsWithEmployee, signerName });
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
