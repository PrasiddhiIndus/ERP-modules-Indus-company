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
    const state = { filters: [], op: 'select', payload: null, order: null, limit: null, returning: false };
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
        const existing = rows().find((r) => r.oc_id === state.payload.oc_id);
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
      upsert(p) { state.op = 'upsert'; state.payload = p; return q; },
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
    oc_master: [{ id: OC, oc_no: 'OC-1', client_name: 'Client', po_wo_no: 'PO-1' }],
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

const caller = (userId, profile = PROJECT_USER, emails = [`${userId}@co.example`]) => ({ userId, profile, emails });

let db;
beforeEach(() => {
  db = createFakeDb(seed());
  mail.sendOutboundMail.mockClear();
  mail.sendOutboundMail.mockImplementation(async () => ({ ok: true }));
  mail.sendThreadedMail.mockClear();
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
    expect(mail.sendOutboundMail).toHaveBeenCalledTimes(2);
    const html = mail.sendOutboundMail.mock.calls.map((c) => c[0].html).join('\n');
    expect(html).toContain('Real Signer');
    expect(html).not.toContain('The CEO');
  });

  it('ignores slots in the request that the caller did not sign', async () => {
    db.tables.oc_signoff.push({ oc_id: OC, slot: 'FINANCE', signed_by: 'Finance Person', signed_user_id: OTHER, signed_at: '2026-11-17T10:05:00Z' });
    await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }, { slot: 'FINANCE' }], caller: caller(SIGNER) });
    const html = mail.sendOutboundMail.mock.calls[0][0].html;
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
    expect(mail.sendOutboundMail).toHaveBeenCalledTimes(2); // two recipients, first request only
    expect(second.duplicate).toBe(true);
    expect(second.sent).toEqual(first.sent);
    expect(db.tables.oc_signoff_notify_log).toHaveLength(1);
    expect(db.tables.oc_signoff_notify_log[0].status).toBe('sent');
  });

  it('a failed send can be retried and then goes out', async () => {
    mail.sendOutboundMail.mockImplementation(async () => { throw new Error('Graph down'); });
    await expect(
      notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) })
    ).rejects.toMatchObject({ status: 502 });
    expect(db.tables.oc_signoff_notify_log[0]).toMatchObject({ status: 'failed', attempts: 1 });

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
    expect(mail.sendOutboundMail).not.toHaveBeenCalled();
  });

  it('a new signature (re-signed after revision) is a new event and is emailed', async () => {
    await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    db.tables.oc_signoff[0].signed_at = '2026-11-18T08:00:00Z';
    const res = await notifyOcSignoffAssignees({ db, ocId: OC, signatures: [{ slot: 'SALES' }], caller: caller(SIGNER) });
    expect(res.duplicate).toBeUndefined();
    expect(mail.sendOutboundMail).toHaveBeenCalledTimes(4);
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
