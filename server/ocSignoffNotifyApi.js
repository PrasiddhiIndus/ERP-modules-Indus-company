/**
 * PO At Glance (IEV, Maintenance, Projects, R&M, Commercial) — email the department's sign-off
 * assignees about a PO. Each PO has one email thread per department: creation, stage sign-offs,
 * OC Number updates and revisions are replies in it (pj_oc_mail_thread for Projects,
 * oc_mail_thread for the others).
 * From address: a Verified mailbox from CRM Outreach → Sender Mailboxes that the caller may use.
 *
 * Security (fix C3): nothing that ends up in the email is trusted from the request body.
 *   - Stage emails: only slots the caller actually signed (signed_user_id in the sign-off table).
 *   - Projects created / OC Number / revision emails: verified against the approval log / OC Number
 *     audit written by the database, or (fallback) the caller must have the department's module access.
 *   - Other departments: created → the record's created_by or department access; OC Number → the
 *     Finance OC Number audit, else department / Finance access and a saved OC Number; Commercial
 *     revision → the latest amended customer PO in cm_oc_po_history, recorded by the caller.
 *   - Signer name, OC Number, date, remarks and "sent by" come from the database.
 *   - Sender mailbox: personal mailboxes only for their owner (same rule as CRM Outreach).
 *   - Each event is emailed once (public.oc_signoff_notify_log); a failed send can be retried.
 */
import { isMailDispatchConfigured, sendOutboundMail, sendThreadedMail, MAIL_NOT_CONFIGURED_MESSAGE } from './mail/index.js';
import { canUseSenderMailbox, senderNotAllowedMessage } from './mail/senderAccess.js';
import { isValidEmployeeEmail, normalizeEmployeeEmail } from '../shared/crmInHouseMail.mjs';
import { OC_DEPARTMENT_SCOPE, profileHasDataScope } from '../shared/erpDataScopes.mjs';
import { claimOcNotify, completeOcNotify, failOcNotify } from './ocNotifyIdempotency.js';

/**
 * Per-department tables, box labels and wording. IEV is the default; Maintenance has its own records.
 * mailEvents: the events emailed for that department, all in one thread per PO (anything else is a stage email).
 * threadLabel: department name at the start of the thread subject (Projects keeps its original subject).
 */
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
    mailEvents: ['created', 'stage', 'oc_number'],
    threadLabel: 'IEV',
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
    mailEvents: ['created', 'stage', 'oc_number'],
    threadLabel: 'Maintenance',
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
    mailEvents: ['created', 'stage', 'oc_number', 'revision'],
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
    mailEvents: ['created', 'stage', 'oc_number'],
    threadLabel: 'R&M',
  },
  commercial: {
    masterTable: 'cm_oc_master',
    assigneesTable: 'cm_oc_signoff_assignees',
    signoffTable: 'cm_oc_signoff',
    slotLabels: {
      CREATOR: 'OC Creator',
      COMMERCIAL_MANAGER: 'Commercial Manager',
      FINANCE: 'Finance / Accounts',
      BILLING_IR_SALARY: 'Billing / IR / Salary',
      HR_OPERATIONS: 'HR / Operations',
      SAFETY_HEAD: 'Safety Head',
    },
    /** Only these assignment rows are emailed (older Commercial boxes stay in the table but are no longer used). */
    activeSlots: ['COMMERCIAL_MANAGER', 'FINANCE', 'BILLING_IR_SALARY', 'HR_OPERATIONS', 'SAFETY_HEAD'],
    reviewPath: 'Commercial → PO At Glance',
    configPath: 'Commercial → PO At Glance Sign-off Assignment',
    assigneeCount: 'Commercial approval',
    /** Revision = an amended customer PO (cm_oc_po_history); Commercial has no send-back step. */
    mailEvents: ['created', 'stage', 'oc_number', 'revision'],
    threadLabel: 'Commercial',
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

/**
 * Prefer IEV/PO-related verified mailbox; otherwise first verified outreach sender.
 * Personal mailboxes are only used for their owner (callerEmails), same rule as CRM Outreach.
 */
export async function resolveOutreachSender(db, senderMailboxId, callerEmails = []) {
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
    if (!canUseSenderMailbox(data.mail, callerEmails)) {
      throw httpError(403, senderNotAllowedMessage(data.mail));
    }
    return data;
  }

  const { data, error } = await db
    .from('sender_mailboxes')
    .select('id, mail, display_name, used_for, status')
    .eq('status', 'Verified')
    .order('created_at', { ascending: true });
  if (error) throw httpError(500, 'Could not load sender mailboxes.');
  const rows = (data || []).filter((r) => canUseSenderMailbox(r.mail, callerEmails));
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

/**
 * Subject of a PO's email thread (stored with the first message and reused).
 * Projects keeps its original subject; other departments start with their name, so two POs
 * with the same client and PO number in different departments never look like one conversation.
 */
function threadSubject(profile, master) {
  const client = String(master?.client_name || '').trim() || 'PO At Glance';
  const poWo = String(master?.po_wo_no || '').trim();
  const prefix = profile?.threadLabel ? `${profile.threadLabel} PO At Glance` : 'PO At Glance';
  return poWo ? `${prefix} — ${client} · ${poWo}` : `${prefix} — ${client}`;
}

/** Body of one message in a PO's thread. Projects wording is unchanged. */
function threadHtml({ profile, master, event, signatures, signerName, ocNo, ocDate, remarks, actorName, poRevision }) {
  // Other departments keep their existing stage email content (OC No., client, PO/WO, signatures).
  if (event === 'stage' && profile.threadLabel) {
    return buildEmail({ profile, master, signatures, signerName }).html;
  }
  const client = String(master?.client_name || '').trim() || '—';
  const poWo = String(master?.po_wo_no || '').trim() || '—';
  const facts = `<ul>
<li><strong>Client</strong> ${escapeHtml(client)}</li>
<li><strong>PO / WO No.</strong> ${escapeHtml(poWo)}</li>
</ul>`;
  let update = '';
  if (event === 'created') {
    const later = profile.mailEvents?.includes('revision')
      ? 'Later signatures, the OC Number, and any revision will continue in this email.'
      : 'Later signatures and the OC Number will continue in this email.';
    update = `<p>A PO At Glance record was created and is ready for approval.</p>${facts}<p>${later}</p>`;
  } else if (event === 'revision' && poRevision) {
    const poNo = String(poRevision.customer_po_no || '').trim() || '—';
    const poDate = String(poRevision.customer_po_date || '').trim();
    const notes = String(poRevision.customer_po_notes || '').trim();
    const who = String(actorName || '').trim();
    update = `<p><strong>Customer PO amended</strong> (revision ${escapeHtml(poRevision.revision_no)})${who ? ` by ${escapeHtml(who)}` : ''}.</p>
<ul>
<li><strong>Customer PO No.</strong> ${escapeHtml(poNo)}${poDate ? ` (date ${escapeHtml(poDate)})` : ''}</li>
${notes ? `<li><strong>Notes</strong> ${escapeHtml(notes)}</li>` : ''}
</ul>${facts}`;
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

/** Which event this request is. Anything a department does not email is treated as a stage email (as before). */
export function resolveOcMailEvent(department, event) {
  const events = OC_NOTIFY_PROFILES[department]?.mailEvents || [];
  return events.includes(event) ? event : 'stage';
}

/** Projects: pj_oc_mail_thread (one row per PO). Other departments: oc_mail_thread keyed by (department, PO). */
export const DEPT_MAIL_THREAD_TABLE = 'oc_mail_thread';

function isMissingTable(error, table) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  if (code === '42P01' || code === 'PGRST205') return true;
  return msg.includes(table) && /does not exist|schema cache/i.test(msg);
}

async function loadMailThread(db, department, ocId) {
  if (department === 'projects') {
    const { data, error } = await db.from('pj_oc_mail_thread').select('*').eq('oc_id', ocId).maybeSingle();
    if (error) throw httpError(500, 'Could not load the email thread.');
    return data || null;
  }
  const { data, error } = await db
    .from(DEPT_MAIL_THREAD_TABLE)
    .select('*')
    .eq('department', department)
    .eq('oc_id', ocId)
    .maybeSingle();
  if (error) {
    // Migration 20261119160000 not applied yet: send as a new message instead of failing.
    if (isMissingTable(error, DEPT_MAIL_THREAD_TABLE)) {
      console.warn('[oc/signoff-notify] oc_mail_thread missing — sending without a thread');
      return null;
    }
    throw httpError(500, 'Could not load the email thread.');
  }
  return data || null;
}

async function saveMailThread(db, department, row) {
  const updatedAt = new Date().toISOString();
  if (department === 'projects') {
    const { error } = await db.from('pj_oc_mail_thread').upsert(
      { ...row, updated_at: updatedAt },
      { onConflict: 'oc_id' }
    );
    if (error) throw httpError(500, 'Could not save the email thread.');
    return;
  }
  const { error } = await db.from(DEPT_MAIL_THREAD_TABLE).upsert(
    { ...row, department, updated_at: updatedAt },
    { onConflict: 'department,oc_id' }
  );
  // The email has already gone out, so never fail (or re-send) because the thread was not stored.
  if (error) console.warn('[oc/signoff-notify] could not save the email thread', department, row.oc_id, error.message);
}

const NOT_ALLOWED_MESSAGE = 'You are not allowed to send notifications for this PO At Glance.';

/**
 * Decide whether the caller may send this notification, using only database records.
 * Returns the verified email content and the idempotency key for the event.
 */
export async function verifyOcNotifyEvent({ db, department, mailEvent, master, signoffRows, requestedSlots, caller }) {
  const userId = caller.userId;
  const hasScope = profileHasDataScope(caller.profile, OC_DEPARTMENT_SCOPE[department]);
  const base = `${department}:${master.id}:${mailEvent}`;

  if (mailEvent === 'stage') {
    // Only slots the caller signed themself (signed_user_id is stamped by the database trigger / RPC).
    const signs = signoffRows
      .filter((row) => requestedSlots.includes(String(row.slot || '').toUpperCase()))
      .filter((row) => row.signed_user_id && row.signed_user_id === userId && String(row.signed_by || '').trim())
      .map((row) => ({
        slot: String(row.slot).toUpperCase(),
        signed_by: String(row.signed_by).trim(),
        signed_at: row.signed_at || '',
      }))
      // Keep the order the app sent (first signature names the signer in the email, as before).
      .sort((a, b) => requestedSlots.indexOf(a.slot) - requestedSlots.indexOf(b.slot));
    if (!signs.length) {
      throw httpError(403, 'You can only send the notification for a stage you signed yourself.');
    }
    const keyParts = signs.map((s) => `${s.slot}@${s.signed_at}`).sort();
    return {
      signs,
      signerName: signs[0].signed_by,
      idempotencyKey: `${base}:${keyParts.join(',')}`,
    };
  }

  if (mailEvent === 'created' && department !== 'projects') {
    // No approval log in these departments: created_by is stamped by the master table's trigger.
    const actorOk = (master.created_by && master.created_by === userId) || hasScope;
    if (!actorOk) throw httpError(403, NOT_ALLOWED_MESSAGE);
    return { signs: [], idempotencyKey: base };
  }

  if (mailEvent === 'revision' && department === 'commercial') {
    // Latest amended customer PO version (append-only cm_oc_po_history, written by cm_oc_save).
    const { data: rev, error } = await db
      .from('cm_oc_po_history')
      .select('id, revision_no, event_kind, customer_po_no, customer_po_date, customer_po_notes, recorded_by')
      .eq('oc_id', master.id)
      .order('revision_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw httpError(500, 'Could not load the customer PO history.');
    if (!rev || rev.event_kind !== 'amended') throw httpError(400, 'There is no customer PO amendment to notify about.');
    if (rev.recorded_by !== userId) {
      throw httpError(403, 'Only the person who amended the customer PO can send the revision email.');
    }
    const who = await loadEmployeeForSigner(db, { userId });
    return {
      signs: [],
      poRevision: rev,
      actorName: who?.full_name || '',
      idempotencyKey: `${base}:${rev.id}`,
    };
  }

  if (mailEvent === 'created') {
    const { data: log, error } = await db
      .from('pj_oc_approval_log')
      .select('id, actor_user_id')
      .eq('oc_id', master.id)
      .eq('action', 'CREATED')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw httpError(500, 'Could not load the approval log.');
    const actorOk =
      (log?.actor_user_id && log.actor_user_id === userId) ||
      (!log?.actor_user_id && master.created_by && master.created_by === userId) ||
      hasScope;
    if (!actorOk) throw httpError(403, NOT_ALLOWED_MESSAGE);
    return { signs: [], idempotencyKey: base };
  }

  if (mailEvent === 'revision') {
    const { data: log, error } = await db
      .from('pj_oc_approval_log')
      .select('id, actor_user_id, actor_name, remarks')
      .eq('oc_id', master.id)
      .eq('action', 'MODIFICATION_REQUESTED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw httpError(500, 'Could not load the approval log.');
    if (!log || log.actor_user_id !== userId) {
      throw httpError(403, 'Only the person who sent this PO for revision can send the revision email.');
    }
    return {
      signs: [],
      remarks: log.remarks || '',
      actorName: log.actor_name || '',
      idempotencyKey: `${base}:${log.id}`,
    };
  }

  if (mailEvent === 'oc_number') {
    const { data: audit, error } = await db
      .from('finance_oc_no_audit')
      .select('id, changed_by, new_oc_no, new_oc_date')
      .eq('department', department)
      .eq('po_id', master.id)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw httpError(500, 'Could not load the OC Number history.');
    if (audit && audit.changed_by === userId) {
      return {
        signs: [],
        ocNo: audit.new_oc_no || master.oc_no || '',
        ocDate: audit.new_oc_date || master.oc_date || '',
        idempotencyKey: `${base}:${audit.id}`,
      };
    }
    if (!hasScope && !profileHasDataScope(caller.profile, 'finance')) throw httpError(403, NOT_ALLOWED_MESSAGE);
    if (department !== 'projects' && !String(master.oc_no || '').trim()) {
      throw httpError(400, 'This PO At Glance has no OC Number yet.');
    }
    return {
      signs: [],
      ocNo: master.oc_no || '',
      ocDate: master.oc_date || '',
      idempotencyKey: `${base}:${master.oc_no || ''}|${master.oc_date || ''}`,
    };
  }

  throw httpError(400, 'Unknown notification type.');
}

/**
 * Email the department's assigned sign-off users about a PO event (creation, stage sign-off,
 * OC Number, revision), in that PO's own email thread.
 * `department` picks the records and assignees ('iev' by default, 'maintenance', 'projects', 'rm' or 'commercial').
 * @returns {{ ok: true, from: string|null, sent: string[], skipped: {name:string,code:string,reason:string}[], failed: {email:string,error:string}[] }}
 * @param {object} p
 * @param {{ userId: string, profile: object, emails: string[] }} p.caller  authenticated user (from requireAuth)
 * @param {Array<{slot: string}>} [p.signatures]  slots to notify about; names in the body are ignored
 */
export async function notifyOcSignoffAssignees({
  db,
  ocId,
  signatures,
  senderMailboxId,
  department = 'iev',
  event = 'stage',
  caller,
}) {
  const profile = OC_NOTIFY_PROFILES[department];
  if (!profile) throw httpError(400, 'Unknown PO At Glance department.');
  if (!caller?.userId) throw httpError(401, 'Sign in again to send the notification.');
  const id = String(ocId || '').trim();
  if (!id) throw httpError(400, 'PO At Glance id is missing.');
  const mailEvent = resolveOcMailEvent(department, event);

  const requestedSlots = [...new Set(
    (Array.isArray(signatures) ? signatures : [])
      .map((s) => String(s?.slot || '').trim().toUpperCase())
      .filter(Boolean)
  )];
  if (mailEvent === 'stage' && !requestedSlots.length) throw httpError(400, 'No new signatures to notify about.');

  const { data: master, error: masterErr } = await db
    .from(profile.masterTable)
    .select('id, oc_no, oc_date, client_name, po_wo_no, created_by')
    .eq('id', id)
    .maybeSingle();
  if (masterErr) throw httpError(500, 'Could not load the PO At Glance.');
  if (!master) {
    // Do not reveal whether an id exists to people outside the department.
    const hasScope = profileHasDataScope(caller.profile, OC_DEPARTMENT_SCOPE[department]);
    throw hasScope ? httpError(404, 'PO At Glance not found.') : httpError(403, NOT_ALLOWED_MESSAGE);
  }

  let signoffRows = [];
  if (profile.signoffTable) {
    const { data: signedRows, error: sErr } = await db
      .from(profile.signoffTable)
      .select('slot, signed_by, signed_user_id, signed_at')
      .eq('oc_id', id);
    if (sErr) throw httpError(500, 'Could not load the sign-off.');
    signoffRows = signedRows || [];
  }

  const verified = await verifyOcNotifyEvent({
    db, department, mailEvent, master, signoffRows, requestedSlots, caller,
  });
  const signs = verified.signs;
  const signerName = verified.signerName || '';

  const { data: assignees, error: aErr } = await db
    .from(profile.assigneesTable)
    .select('slot, employee_code, employee_name');
  if (aErr) throw httpError(500, 'Could not load sign-off assignees.');
  const rows = (assignees || []).filter(
    (r) => !profile.activeSlots || profile.activeSlots.includes(String(r.slot || '').toUpperCase())
  );

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

  const sender = await resolveOutreachSender(db, senderMailboxId, caller.emails || []);

  const claim = await claimOcNotify(db, {
    key: verified.idempotencyKey,
    department,
    ocId: master.id,
    event: mailEvent,
    userId: caller.userId,
  });
  if (claim.state === 'duplicate') {
    console.info('[oc/signoff-notify] already sent', { key: verified.idempotencyKey });
    return { ...(claim.result || { ok: true, sent: [], skipped: [], failed: [] }), duplicate: true };
  }
  if (claim.state === 'in_progress') {
    throw httpError(409, 'This notification is already being sent. Try again in a minute if it does not arrive.');
  }
  if (claim.state === 'unavailable') {
    console.warn('[oc/signoff-notify] oc_signoff_notify_log missing — sending without idempotency');
  }
  const idempotent = claim.state === 'claimed';

  try {
    const result = await sendOcNotification({
      db, department, profile, master, mailEvent, signs, signerName, verified, sender,
      recipients, skipped, signoffBySlot, assigneeBySlot,
    });
    if (idempotent) await completeOcNotify(db, verified.idempotencyKey, result);
    return result;
  } catch (err) {
    if (idempotent) await failOcNotify(db, verified.idempotencyKey, err?.message);
    throw err;
  }
}

async function sendOcNotification({
  db, department, profile, master, mailEvent, signs, signerName, verified, sender,
  recipients, skipped, signoffBySlot, assigneeBySlot,
}) {
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

  // Every department: one email conversation per PO (creation, stage sign-offs, OC Number, revisions).
  const thread = await loadMailThread(db, department, master.id);
  const subject = thread?.subject || threadSubject(profile, master);
  const threadRecipients = Array.isArray(thread?.recipients) && thread.recipients.length
    ? thread.recipients
    : uniqueEmails.map((r) => ({ email: r.email, name: r.name }));
  const html = threadHtml({
    profile,
    master,
    event: mailEvent,
    signatures: signsWithEmployee,
    signerName,
    ocNo: verified.ocNo,
    ocDate: verified.ocDate,
    remarks: verified.remarks,
    actorName: verified.actorName,
    poRevision: verified.poRevision,
  });
  try {
    const posted = await sendThreadedMail({
      from: sender?.mail || undefined,
      fromName: sender?.display_name || undefined,
      toList: threadRecipients,
      subject,
      html,
      replyToMessageId: thread?.latest_message_id || null,
      conversationId: thread?.conversation_id || null,
      mailboxHint: thread?.mailbox || null,
    });
    // Threaded Graph draft may be denied; sendMail fallback still delivers (no conversation id).
    if (posted?.messageId) {
      await saveMailThread(db, department, {
        oc_id: master.id,
        mailbox: posted.mailbox || thread?.mailbox || sender?.mail || 'unknown',
        latest_message_id: posted.messageId,
        conversation_id: posted.conversationId || thread?.conversation_id || null,
        subject,
        recipients: threadRecipients,
      });
    } else if (!posted?.fallback) {
      throw httpError(502, 'Mail was accepted but the conversation id was not returned.');
    }
    for (const row of threadRecipients) sent.push(row.email);
    console.info('[oc/signoff-notify] thread', {
      department,
      ocId: master.id,
      event: mailEvent,
      threaded: Boolean(posted.threaded),
      fallback: posted.fallback || null,
      conversationId: posted.conversationId || null,
    });
  } catch (err) {
    const detail = String(err?.message || err || 'Send failed').trim() || 'Send failed';
    console.warn('[oc/signoff-notify] thread send failed — trying direct send', detail);
    // Last resort: same content via sendMail so the concerned departments still get notified.
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
      } catch (sendErr) {
        failed.push({ email: r.email, error: sendErr?.message || detail });
        console.warn('[oc/signoff-notify] fallback send failed', department, r.email, sendErr?.message || sendErr);
      }
    }
    if (!sent.length) failed.push({ email: threadRecipients.map((r) => r.email).join(', '), error: detail });
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
