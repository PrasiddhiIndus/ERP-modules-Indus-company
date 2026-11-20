/**
 * Security fix C3 — PO At Glance sign-off emails (/api/<dept>/oc/signoff-notify).
 * Runs notifyOcSignoffAssignees against an in-memory fake Supabase client; mail sending is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mail = vi.hoisted(() => ({
  sendOutboundMail: vi.fn(async () => ({ ok: true })),
  sendThreadedMail: vi.fn(async () => ({ messageId: 'm-1', conversationId: 'c-1', mailbox: 'erp@co.example' })),
}));

vi.mock('../server/mail/index.js', () => ({
  isMailDispatchConfigured: () => true,
  sendOutboundMail: mail.sendOutboundMail,
  sendThreadedMail: mail.sendThreadedMail,
  MAIL_NOT_CONFIGURED_MESSAGE: 'Mail not configured',
}));

vi.mock('../server/mail/mailConfig.js', () => ({
  getMicrosoftGraphMailConfig: () => ({
    notificationEmail: 'erp@co.example',
    salaryOutboundEmail: '',
    // boss@co.example is a personal mailbox: only its owner may send as it.
    allowedSenders: ['erp@co.example', 'boss@co.example'],
  }),
}));

const { notifyOcSignoffAssignees } = await import('../server/ocSignoffNotifyApi.js');

// ---------------------------------------------------------------------------
// Minimal in-memory Supabase query builder
// ---------------------------------------------------------------------------
function createFakeDb(seed) {
  const tables = structuredClone(seed);
  let nextId = 1000;
  const unique = { oc_signoff_notify_log: 'idempotency_key' };

  function query(table) {
    const state = { filters: [], op: 'select', payload: null, order: null, limit: null, returning: false, onConflict: null };
    const rows = () => (tables[table] ||= []);
    const match = (r) => state.filters.every((f) => f(r));
    const run = () => {
      if (state.op === 'insert') {
        const list = Array.isArray(state.payload) ? state.payload : [state.payload];
        const key = unique[table];
        for (const item of list) {
          if (key && rows().some((r) => r[key] === item[key])) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
        }
        const inserted = list.map((item) => ({ id: nextId++, ...item }));
        rows().push(...inserted);
        return { data: inserted, error: null };
      }
      if (state.op === 'update') {
        const hit = rows().filter(match);
        hit.forEach((r) => Object.assign(r, state.payload));
        return { data: state.returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      if (state.op === 'upsert') {
        const keys = String(state.onConflict || 'oc_id').split(',');
        const existing = rows().find((r) => keys.every((k) => r[k] === state.payload[k]));
        if (existing) Object.assign(existing, state.payload);
        else rows().push({ ...state.payload });
        return { data: null, error: null };
      }
      let out = rows().filter(match).map((r) => ({ ...r }));
      if (state.order) {
        const { col, asc } = state.order;
        out.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (state.limit != null) out = out.slice(0, state.limit);
      return { data: out, error: null };
    };
    const q = {
      select() { if (state.op !== 'select') state.returning = true; return q; },
      insert(p) { state.op = 'insert'; state.payload = p; return q; },
      update(p) { state.op = 'update'; state.payload = p; return q; },
      upsert(p, opts = {}) { state.op = 'upsert'; state.payload = p; state.onConflict = opts.onConflict || null; return q; },
      eq(c, v) { state.filters.push((r) => r[c] === v); return q; },
      neq(c, v) { state.filters.push((r) => r[c] !== v); return q; },
      ilike(c, v) {
        const want = String(v).replace(/\\(.)/g, '$1').toLowerCase();
        state.filters.push((r) => String(r[c] ?? '').toLowerCase() === want);
        return q;
      },
      in(c, vs) { state.filters.push((r) => vs.includes(r[c])); return q; },
      order(col, opts = {}) { state.order = { col, asc: opts.ascending !== false }; return q; },
      limit(n) { state.limit = n; return q; },
      async maybeSingle() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      async single() { const r = run(); return { data: r.data?.[0] ?? null, error: r.error }; },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return q;
  }
  return { from: query, tables };
}

const OC = 'aaaaaaaa-0000-4000-8000-000000000001';
const SIGNER = 'user-signer';
const OTHER = 'user-other';
const PROJECT_USER = { role: 'executive', team: 'Projects', allowed_modules: [], allowed_sub_modules: [] };
const OUTSIDER = { role: 'executive', team: 'HR', allowed_modules: [], allowed_sub_modules: [] };

function seed() {
  return {
    oc_master: [{ id: OC, oc_no: 'OC-1', oc_date: '2026-11-01', client_name: 'Client', po_wo_no: 'PO-1', created_by: SIGNER }],
    oc_signoff_assignees: [
      { slot: 'SALES', employee_code: 'E1', employee_name: 'Sales Person' },
      { slot: 'FINANCE', employee_code: 'E2', employee_name: 'Finance Person' },
    ],
    oc_signoff: [
      { oc_id: OC, slot: 'SALES', signed_by: 'Real Signer', signed_user_id: SIGNER, signed_at: '2026-11-17T10:00:00Z' },
    ],
    pj_oc_master: [{ id: OC, oc_no: 'PJ-OC-9', oc_date: '2026-11-10', client_name: 'Client', po_wo_no: 'PO-9' }],
    pj_oc_signoff_assignees: [{ slot: 'VERTICAL_HEAD', employee_code: 'E1', employee_name: 'Head' }],
    pj_oc_signoff: [],
    pj_oc_approval_log: [
      { id: 1, oc_id: OC, action: 'CREATED', actor_user_id: SIGNER, created_at: '2026-11-17T09:00:00Z' },
      { id: 2, oc_id: OC, action: 'MODIFICATION_REQUESTED', actor_user_id: SIGNER, actor_name: 'Head From Log', remarks: 'Fix rates', created_at: '2026-11-17T11:00:00Z' },
    ],
    pj_oc_mail_thread: [],
    oc_mail_thread: [],
    finance_oc_no_audit: [
      { id: 7, department: 'projects', po_id: OC, changed_by: SIGNER, new_oc_no: 'PJ-OC-9', new_oc_date: '2026-11-10', changed_at: '2026-11-17T12:00:00Z' },
    ],
    admin_ifsp_employee_master: [
      { id: 1, employee_code: 'E1', email_id: 'e1@co.example', user_id: null },
      { id: 2, employee_code: 'E2', email_id: 'e2@co.example', user_id: null },
    ],
    profiles: [],
    sender_mailboxes: [
      { id: 'mb-boss', mail: 'boss@co.example', display_name: 'Boss', used_for: 'PO At Glance', status: 'Verified', created_at: '2026-01-01' },
      { id: 'mb-erp', mail: 'erp@co.example', display_name: 'ERP', used_for: 'notifications', status: 'Verified', created_at: '2026-01-02' },
    ],
    oc_signoff_notify_log: [],
  };
}

let messageSeq = 0;
const THREADED_OK = async () => {
  messageSeq += 1;
  return { messageId: `m-${messageSeq}`, conversationId: 'c-1', mailbox: 'erp@co.example', threaded: true };
};

const caller = (userId, profile = PROJECT_USER, emails = [`${userId}@co.example`]) => ({ userId, profile, emails });

let db;
beforeEach(() => {
  db = createFakeDb(seed());
  mail.sendOutboundMail.mockClear();
  mail.sendOutboundMail.mockImplementation(async () => ({ ok: true }));
  mail.sendThreadedMail.mockClear();
  mail.sendThreadedMail.mockImplementation(THREADED_OK);
});

describe('stage notifications — verified signatures only', () => {
  it('rejects a caller who did not sign the slot (403) and sends nothing', async () => {
    await expect(
      notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES', signed_by: 'Anyone' }], caller: caller(OTHER) })
    ).rejects.toMatchObject({ status: 403 });
    expect(mail.sendOutboundMail).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated call (401)', async () => {
    await expect(
      notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: null })
    ).rejects.toMatchObject({ status: 401 });
  });

  it('uses the signer name from the database, never the request body', async () => {
    const res = await notifyOcSignoffAssignees({
      db, ocId: OC, signatures: [{ slot: 'SALES', signed_by: 'The CEO' }], caller: caller(SIGNER),
    });
    expect(res.ok).toBe(true);
    expect(mail.sendThreadedMail).toHaveBeenCalledTimes(1);
    expect(mail.sendThreadedMail.mock.calls[0][0].toList.map((r) => r.email)).toEqual(['e1@co.example', 'e2@co.example']);
    const html = mail.sendThreadedMail.mock.calls[0][0].html;
    expect(html).toContain('Real Signer');
    expect(html).not.toContain('The CEO');
  });

  it('ignores slots in the request that the caller did not sign', async () => {
    db.tables.oc_signoff.push({ oc_id: OC, slot: 'FINANCE', signed_by: 'Finance Person', signed_user_id: OTHER, signed_at: '2026-11-17T10:05:00Z' });
    await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }, { slot: 'FINANCE' }], caller: caller(SIGNER) });
    const html = mail.sendThreadedMail.mock.calls[0][0].html;
    expect(html).toContain('Real Signer');
    expect(html).not.toContain('Finance Department');
  });

  it('hides whether an OC id exists from people outside the department (403, not 404)', async () => {
    const missing = 'aaaaaaaa-0000-4000-8000-00000000dead';
    await expect(
      notifyOcSignoffAssignees({ db, ocId: missing, signatures: [{ slot: 'SALES' }], caller: caller(OTHER, OUTSIDER) })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      notifyOcSignoffAssignees({ db, ocId: missing, signatures: [{ slot: 'SALES' }], caller: caller(OTHER, { role: 'executive', team: 'fireTender' }) })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('sender mailbox access', () => {
  it('refuses a personal mailbox that is not the caller’s', async () => {
    await expect(
      notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], senderMailboxId: 'mb-boss', caller: caller(SIGNER) })
    ).rejects.toMatchObject({ status: 403 });
    expect(mail.sendThreadedMail).not.toHaveBeenCalled();
    expect(mail.sendOutboundMail).not.toHaveBeenCalled();
  });

  it('lets the owner use their personal mailbox', async () => {
    const res = await notifyOcSignoffAssignees({
      db, ocId: OC, signatures: [{ slot: 'SALES' }], senderMailboxId: 'mb-boss', caller: caller(SIGNER, PROJECT_USER, ['boss@co.example']),
    });
    expect(res.from).toBe('boss@co.example');
  });

  it('default sender skips personal mailboxes the caller does not own', async () => {
    const res = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(res.from).toBe('erp@co.example');
  });
});

describe('idempotency — safe retries', () => {
  it('a repeated request returns the stored result and sends nothing again', async () => {
    const first = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    const second = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(mail.sendThreadedMail).toHaveBeenCalledTimes(1); // one thread message, first request only
    expect(second.duplicate).toBe(true);
    expect(second.sent).toEqual(first.sent);
    expect(db.tables.oc_signoff_notify_log).toHaveLength(1);
    expect(db.tables.oc_signoff_notify_log[0].status).toBe('sent');
  });

  it('a failed send can be retried and then goes out', async () => {
    mail.sendThreadedMail.mockImplementation(async () => { throw new Error('Graph down'); });
    mail.sendOutboundMail.mockImplementation(async () => { throw new Error('Graph down'); });
    await expect(
      notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) })
    ).rejects.toMatchObject({ status: 502 });
    expect(db.tables.oc_signoff_notify_log[0]).toMatchObject({ status: 'failed', attempts: 1 });

    mail.sendThreadedMail.mockImplementation(THREADED_OK);
    mail.sendOutboundMail.mockImplementation(async () => ({ ok: true }));
    const retry = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(retry.ok).toBe(true);
    expect(retry.duplicate).toBeUndefined();
    expect(db.tables.oc_signoff_notify_log[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('a request while another is sending gets 409', async () => {
    db.tables.oc_signoff_notify_log.push({
      id: 1, idempotency_key: `iev:${OC}:stage:SALES@2026-11-17T10:00:00Z`, status: 'sending', attempts: 1,
      updated_at: new Date().toISOString(),
    });
    await expect(
      notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) })
    ).rejects.toMatchObject({ status: 409 });
    expect(mail.sendThreadedMail).not.toHaveBeenCalled();
  });

  it('a new signature (re-signed after revision) is a new event and is emailed', async () => {
    await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    db.tables.oc_signoff[0].signed_at = '2026-11-18T08:00:00Z';
    const res = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(res.duplicate).toBeUndefined();
    expect(mail.sendThreadedMail).toHaveBeenCalledTimes(2);
  });

  it('still sends (without idempotency) if the log table is not deployed yet', async () => {
    const orig = db.from;
    db.from = (t) => {
      if (t !== 'oc_signoff_notify_log') return orig(t);
      return { insert: async () => ({ error: { code: 'PGRST205', message: 'Could not find the table public.oc_signoff_notify_log in the schema cache' } }) };
    };
    const res = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(res.ok).toBe(true);
  });
});

describe('Projects created / OC Number / revision events', () => {
  const projects = (event, who, profile = PROJECT_USER, body = {}) =>
    notifyOcSignoffAssignees({ db, department: 'projects', ocId: OC, event, caller: caller(who, profile), ...body });

  it('created: the creator (from the approval log) may send it once', async () => {
    await projects('created', SIGNER, OUTSIDER);
    const again = await projects('created', SIGNER, OUTSIDER);
    expect(mail.sendThreadedMail).toHaveBeenCalledTimes(1);
    expect(again.duplicate).toBe(true);
  });

  it('created: outsiders who are not the creator get 403', async () => {
    await expect(projects('created', OTHER, OUTSIDER)).rejects.toMatchObject({ status: 403 });
  });

  it('revision: remarks and "sent by" come from the approval log, not the body', async () => {
    await projects('revision', SIGNER, PROJECT_USER, { remarks: 'Fake remark', actorName: 'Fake Person' });
    const html = mail.sendThreadedMail.mock.calls[0][0].html;
    expect(html).toContain('Fix rates');
    expect(html).toContain('Head From Log');
    expect(html).not.toContain('Fake');
  });

  it('revision: only the person who requested the revision may send it', async () => {
    await expect(projects('revision', OTHER)).rejects.toMatchObject({ status: 403 });
  });

  it('oc_number: OC Number and date come from the database audit', async () => {
    await projects('oc_number', SIGNER, OUTSIDER, { ocNo: 'FAKE-1', ocDate: '1999-01-01' });
    const html = mail.sendThreadedMail.mock.calls[0][0].html;
    expect(html).toContain('PJ-OC-9');
    expect(html).not.toContain('FAKE-1');
  });

  it('oc_number: someone else needs Projects or Finance access', async () => {
    await expect(projects('oc_number', OTHER, OUTSIDER)).rejects.toMatchObject({ status: 403 });
    const res = await projects('oc_number', OTHER, { role: 'executive', team: 'Finance' });
    expect(res.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// One email thread per PO for every department (same flow as Projects)
// ---------------------------------------------------------------------------
const MM_USER = { role: 'executive', team: 'HR', allowed_modules: [], allowed_sub_modules: [] };

function seedDepartments() {
  db.tables.mm_oc_master = [{ id: OC, oc_no: '', oc_date: null, client_name: 'Client', po_wo_no: 'PO-1', created_by: SIGNER }];
  db.tables.mm_oc_signoff_assignees = [{ slot: 'VERTICAL_HEAD', employee_code: 'E2', employee_name: 'Head' }];
  db.tables.mm_oc_signoff = [];
  db.tables.cm_oc_master = [{ id: OC, oc_no: 'CM-1', oc_date: '2026-11-02', client_name: 'Client', po_wo_no: 'PO-1', created_by: SIGNER }];
  db.tables.cm_oc_signoff_assignees = [
    { slot: 'FINANCE', employee_code: 'E2', employee_name: 'Finance Person' },
    { slot: 'CREATOR', employee_code: 'E1', employee_name: 'Old box, not emailed' },
  ];
  db.tables.cm_oc_signoff = [];
  db.tables.cm_oc_po_history = [
    { id: 'h1', oc_id: OC, revision_no: 1, event_kind: 'entered', customer_po_no: 'CPO-1', recorded_by: SIGNER },
    { id: 'h2', oc_id: OC, revision_no: 2, event_kind: 'amended', customer_po_no: 'CPO-2', customer_po_date: '2026-11-15', customer_po_notes: 'Rate change', recorded_by: SIGNER },
  ];
}

const send = (department, event, who = SIGNER, extra = {}) =>
  notifyOcSignoffAssignees({ db, department, ocId: OC, event, caller: caller(who, extra.profile || OUTSIDER), ...extra });
const threadCall = (n) => mail.sendThreadedMail.mock.calls[n][0];

describe('department email threads (IEV, Maintenance, R&M, Commercial)', () => {
  beforeEach(seedDepartments);

  it('IEV: creation, stage sign-off and OC Number stay in one thread', async () => {
    db.tables.finance_oc_no_audit.push({ id: 8, department: 'iev', po_id: OC, changed_by: SIGNER, new_oc_no: 'OC-1', new_oc_date: '2026-11-01', changed_at: '2026-11-17T12:00:00Z' });
    await send('iev', 'created');
    const afterCreate = db.tables.oc_mail_thread[0].latest_message_id;
    await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    const afterStage = db.tables.oc_mail_thread[0].latest_message_id;
    await send('iev', 'oc_number');

    expect(mail.sendThreadedMail).toHaveBeenCalledTimes(3);
    const [first, second, third] = [0, 1, 2].map(threadCall);
    expect(first.subject).toBe('IEV PO At Glance — Client · PO-1');
    expect(second.subject).toBe(first.subject);
    expect(third.subject).toBe(first.subject);
    expect(first.replyToMessageId).toBeNull();
    expect(second.replyToMessageId).toBe(afterCreate);
    expect(third.replyToMessageId).toBe(afterStage);
    expect(second.conversationId).toBe('c-1');
    expect(second.mailboxHint).toBe('erp@co.example');
    expect(first.html).toContain('Later signatures and the OC Number will continue in this email.');
    // Stage email keeps the existing IEV content.
    expect(second.html).toContain('A department sign-off was recorded');
    expect(second.html).toContain('OC-1');
    expect(third.html).toContain('OC Number update');

    expect(db.tables.oc_mail_thread).toHaveLength(1);
    expect(db.tables.oc_mail_thread[0]).toMatchObject({ department: 'iev', oc_id: OC });
    expect(db.tables.pj_oc_mail_thread).toHaveLength(0);
  });

  it('keeps departments apart: the same PO id in IEV and Maintenance gets two threads', async () => {
    await send('iev', 'created');
    await send('maintenance', 'created', SIGNER, { profile: MM_USER });
    expect(threadCall(1).replyToMessageId).toBeNull();
    expect(threadCall(1).subject).toBe('Maintenance PO At Glance — Client · PO-1');
    expect(threadCall(1).toList.map((r) => r.email)).toEqual(['e2@co.example']);
    expect(db.tables.oc_mail_thread.map((r) => r.department).sort()).toEqual(['iev', 'maintenance']);
    // Idempotency keys are per department too.
    expect(db.tables.oc_signoff_notify_log.map((r) => r.idempotency_key).sort()).toEqual([
      `iev:${OC}:created`, `maintenance:${OC}:created`,
    ]);
  });

  it('created: the record creator or department users only, and only once', async () => {
    await expect(send('iev', 'created', OTHER)).rejects.toMatchObject({ status: 403 });
    const res = await send('iev', 'created', OTHER, { profile: { role: 'executive', team: 'fireTender' } });
    expect(res.ok).toBe(true);
    const again = await send('iev', 'created');
    expect(again.duplicate).toBe(true);
    expect(mail.sendThreadedMail).toHaveBeenCalledTimes(1);
  });

  it('OC Number: refused while the PO has no OC Number', async () => {
    await expect(send('maintenance', 'oc_number', OTHER, { profile: { role: 'executive', team: 'Finance' } }))
      .rejects.toMatchObject({ status: 400 });
    expect(mail.sendThreadedMail).not.toHaveBeenCalled();
  });

  it('IEV has no revision step: a "revision" request is treated as a stage email and needs a signed slot', async () => {
    await expect(send('iev', 'revision')).rejects.toMatchObject({ status: 400 });
    expect(mail.sendThreadedMail).not.toHaveBeenCalled();
  });

  it('Commercial: an amended customer PO is a revision in the same thread, details from the database', async () => {
    await send('commercial', 'created');
    await send('commercial', 'revision', SIGNER, { remarks: 'Fake' });
    expect(threadCall(0).subject).toBe('Commercial PO At Glance — Client · PO-1');
    expect(threadCall(1).subject).toBe(threadCall(0).subject);
    expect(threadCall(0).html).toContain('any revision will continue');
    expect(threadCall(1).html).toContain('Customer PO amended');
    expect(threadCall(1).html).toContain('CPO-2');
    expect(threadCall(1).html).toContain('Rate change');
    expect(threadCall(1).html).not.toContain('Fake');
    // Only active Commercial boxes are emailed.
    expect(threadCall(0).toList.map((r) => r.email)).toEqual(['e2@co.example']);
  });

  it('Commercial revision: only the person who amended the PO, and only for an amendment', async () => {
    await expect(send('commercial', 'revision', OTHER, { profile: { role: 'executive', team: 'commercialMt' } }))
      .rejects.toMatchObject({ status: 403 });
    db.tables.cm_oc_po_history.pop();
    await expect(send('commercial', 'revision')).rejects.toMatchObject({ status: 400 });
  });

  it('still sends (as a new message) if the thread table is not deployed yet', async () => {
    const orig = db.from;
    db.from = (t) => {
      if (t !== 'oc_mail_thread') return orig(t);
      const missing = { data: null, error: { code: 'PGRST205', message: 'Could not find the table public.oc_mail_thread in the schema cache' } };
      const q = { select: () => q, eq: () => q, upsert: async () => missing, maybeSingle: async () => missing };
      return q;
    };
    const res = await send('iev', 'created');
    expect(res.ok).toBe(true);
    expect(threadCall(0).replyToMessageId).toBeNull();
  });

  it('falls back to direct sends when the thread message fails, and reports per-recipient failures', async () => {
    mail.sendThreadedMail.mockImplementation(async () => { throw new Error('Graph down'); });
    mail.sendOutboundMail.mockImplementationOnce(async () => { throw new Error('Mailbox full'); });
    const res = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(res.sent).toEqual(['e2@co.example']);
    expect(res.failed).toEqual([{ email: 'e1@co.example', error: 'Mailbox full' }]);
    expect(mail.sendOutboundMail.mock.calls[0][0].subject).toBe('IEV PO At Glance — Client · PO-1');
  });
});

describe('Projects threading is unchanged', () => {
  it('uses pj_oc_mail_thread and the original subject and wording', async () => {
    await notifyOcSignoffAssignees({ db, department: 'projects', ocId: OC, event: 'created', caller: caller(SIGNER, OUTSIDER) });
    expect(threadCall(0).subject).toBe('PO At Glance — Client · PO-9');
    expect(threadCall(0).html).toContain('Later signatures, the OC Number, and any revision will continue in this email.');
    expect(db.tables.pj_oc_mail_thread).toHaveLength(1);
    expect(db.tables.oc_mail_thread).toHaveLength(0);
  });
});
