/**
 * Projects module enhancements (2026-11-18):
 *   20261118180000 Order Lost L1 approval, 20261118181000 delete only via L1,
 *   20261118182000 Enquiry Master View-only access, 20261118183000 Activity Log.
 * Runs the real migration / rollback SQL in an in-memory Postgres (PGlite) on top of the
 * historical quotation migrations, with small stubs for the shared helper functions.
 * Also covers the pure client helpers (roles.js, ocApi status, Order Lost gate).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }));
vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    throw new Error('Real Supabase client blocked in tests');
  },
}));

import { buildDb, readMigration, readRollback, SEED } from '../scripts/security/rlsHarness.mjs';
import {
  isProjectsEnquiryViewOnly,
  PROJECTS_ENQUIRY_EDIT_KEY,
  PROJECTS_ENQUIRY_VIEW_KEY,
  toggleProjectsEnquiryAccessLevel,
} from '../src/config/roles.js';
import { ocApprovalStatus } from '../src/pages/projects/oc/ocApi.js';
import { PROJECTS_OC_DEPARTMENT } from '../src/pages/projects/poAtGlance/pjOcDepartment.js';
import { needsOrderLostApproval } from '../src/pages/projects/quotation/quotationOrderLostApi.js';

const U = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USERS = {
  requester: U(1), // Projects executive, L1 = E-L1
  l1: U(2), // Projects manager with employee code E-L1
  other: U(3), // Projects executive, not anyone's L1
  superAdmin: U(4),
  viewOnly: U(5), // Projects executive with View only
  viewOnlyL1: U(6), // manager with View only, employee code E-VL1
  outsider: U(7), // no Projects access
};
const ENQ = '66666666-6666-4666-8666-666666666666';
const OC = '77777777-7777-4777-8777-777777777777';

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

/** Shared helpers that the new migrations rely on (real ones live in older migrations). */
const STUBS = `
  alter table public.profiles add column if not exists employee_code text;
  alter table projects.quotations add column if not exists remark text;
  alter table projects.quotations add column if not exists status_changed_at timestamptz;

  create or replace function public.normalize_erp_role(r text) returns text language sql immutable
    as $$ select replace(lower(btrim(coalesce(r, ''))), ' ', '_') $$;
  create or replace function public.current_user_can_access_module(m text) returns boolean language sql stable
    security definer set search_path = public
    as $$ select exists (select 1 from public.profiles p where p.id = auth.uid()
           and (p.role in ('super_admin','admin') or p.team = 'projects')) $$;
  create or replace function public.current_user_employee_code() returns text language sql stable
    security definer set search_path = public
    as $$ select employee_code from public.profiles where id = auth.uid() $$;
  create or replace function projects.current_user_display_name() returns text language sql stable
    security definer set search_path = public
    as $$ select coalesce(username, email) from public.profiles where id = auth.uid() $$;

  create table public.admin_ifsp_employee_master (
    id bigint generated always as identity primary key, employee_code text, full_name text,
    l1_manager_code text, l2_manager_code text, status text, updated_at timestamptz default now());
  create or replace function projects.enquiry_employee_manager_codes(p_user_id uuid)
    returns table (l1_manager_code text, l2_manager_code text) language sql stable security definer
    set search_path = public
    as $$ select m.l1_manager_code, m.l2_manager_code from public.profiles p
          join public.admin_ifsp_employee_master m on m.employee_code = p.employee_code
          where p.id = p_user_id limit 1 $$;
  create or replace function projects.current_user_is_enquiry_edit_decider(p_requested_by uuid, p_l1 text default null)
    returns boolean language sql stable security definer set search_path = public
    as $$ select exists (select 1 from public.profiles p where p.id = auth.uid()
           and (p.role in ('admin','super_admin','super_admin_pro') or (p_l1 is not null and p.employee_code = p_l1))) $$;
  grant execute on all functions in schema projects to authenticated;
  grant execute on all functions in schema public to authenticated;

  -- Enquiry tables (shape of the real ones, only the columns the guards use)
  drop table if exists projects.enquiries cascade;
  create table projects.enquiries (id uuid primary key default gen_random_uuid(), serial_number bigint, data jsonb default '{}'::jsonb);
  create table projects.enquiry_edit_requests (id bigint generated always as identity primary key, enquiry_id uuid,
    proposed_data jsonb, status text not null default 'pending', requested_by uuid, decided_by uuid, decided_at timestamptz);
  create table projects.enquiry_deletion_requests (id bigint generated always as identity primary key, enquiry_id uuid,
    status text not null default 'pending', requested_by uuid, decided_by uuid, decided_at timestamptz);
  create table projects.enquiry_dropdown_options (id bigint generated always as identity primary key, kind_key text, value text);
  alter table projects.enquiries enable row level security;
  create policy e_all on projects.enquiries for all to authenticated using (true) with check (true);
  alter table projects.enquiry_dropdown_options enable row level security;
  create policy d_all on projects.enquiry_dropdown_options for all to authenticated using (true) with check (true);
  grant select, insert, update, delete on projects.enquiries, projects.enquiry_dropdown_options to authenticated;
  grant select, insert, update on projects.enquiry_edit_requests, projects.enquiry_deletion_requests to authenticated;
  grant usage on schema projects to authenticated;

  -- Projects PO At Glance master (columns used by the activity log)
  create table public.pj_oc_master (id uuid primary key default gen_random_uuid(), oc_no text, client_name text,
    contract_value numeric, created_by uuid, updated_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
  create or replace function public.pj_oc_current_user_has_access() returns boolean language sql stable
    as $$ select public.current_user_can_access_module('projects') $$;
  grant select, insert, update, delete on public.pj_oc_master to authenticated;
`;

async function setup() {
  const db = await buildDb();
  await db.exec(STUBS);
  await db.exec(readMigration('20261117120000_secure_projects_quotations_rm_enquiries_rls.sql'));
  for (const name of [
    '20261118180000_projects_quotation_order_lost_approval.sql',
    '20261118181000_projects_quotation_delete_requires_l1.sql',
    '20261118182000_projects_enquiry_view_only_access.sql',
    '20261118183000_projects_activity_log.sql',
  ]) {
    await db.exec(readMigration(name));
  }
  const profile = (id, role, extra = {}) =>
    `insert into public.profiles (id, role, team, allowed_sub_modules, username, employee_code)
     values (${lit(id)}, ${lit(role)}, ${lit(extra.team ?? 'projects')}, ${lit(JSON.stringify(extra.subs || []))}::jsonb,
             ${lit(extra.name || role)}, ${lit(extra.code)});`;
  await db.exec(`
    ${profile(USERS.requester, 'executive', { name: 'Requester', code: 'E-REQ' })}
    ${profile(USERS.l1, 'manager', { name: 'L1 Manager', code: 'E-L1' })}
    ${profile(USERS.other, 'executive', { name: 'Other', code: 'E-OTH' })}
    ${profile(USERS.superAdmin, 'super_admin', { name: 'Super', team: null })}
    ${profile(USERS.viewOnly, 'executive', { name: 'Viewer', code: 'E-VIEW', subs: [PROJECTS_ENQUIRY_VIEW_KEY] })}
    ${profile(USERS.viewOnlyL1, 'manager', { name: 'Viewer L1', code: 'E-VL1', subs: [PROJECTS_ENQUIRY_VIEW_KEY] })}
    ${profile(USERS.outsider, 'executive', { name: 'Outsider', team: 'hr' })}
    insert into public.admin_ifsp_employee_master (employee_code, l1_manager_code) values
      ('E-REQ', 'E-L1'), ('E-OTH', 'E-L1'), ('E-VIEW', 'E-VL1');
    update projects.quotations set offer_status = 'Awaiting Client Response', client_name = 'Seed Client'
      where id = '${SEED.quotation}';
    insert into projects.enquiries (id, serial_number, data) values ('${ENQ}', 1, '{"client_name":"Acme"}');
    insert into projects.enquiries (serial_number, data) values (2, '{"client_name":"Beta"}');
  `);
  return db;
}

/** Run statements as a user in one transaction. commit=false rolls back. */
async function as(db, uid, sql, { commit = false, multi = false } = {}) {
  await db.exec(`BEGIN; SELECT set_config('test.uid', ${lit(uid)}, true); SET LOCAL ROLE authenticated;`);
  try {
    const res = multi ? (await db.exec(sql)).at(-1) : await db.query(sql);
    await db.exec(commit ? 'COMMIT;' : 'ROLLBACK;');
    return { ok: true, rows: res.rows, affected: res.affectedRows };
  } catch (err) {
    await db.exec('ROLLBACK;');
    return { ok: false, error: err.message };
  }
}
const one = async (db, sql) => (await db.query(sql)).rows[0];

describe('client helpers', () => {
  it('View-only only when View is ticked without Edit; Super Admins never', () => {
    expect(isProjectsEnquiryViewOnly({ role: 'executive', allowed_sub_modules: [] })).toBe(false);
    expect(isProjectsEnquiryViewOnly({ role: 'executive', allowed_sub_modules: [PROJECTS_ENQUIRY_VIEW_KEY] })).toBe(true);
    expect(
      isProjectsEnquiryViewOnly({ role: 'manager', allowed_sub_modules: [PROJECTS_ENQUIRY_VIEW_KEY, PROJECTS_ENQUIRY_EDIT_KEY] })
    ).toBe(false);
    expect(isProjectsEnquiryViewOnly({ role: 'super_admin', allowed_sub_modules: [PROJECTS_ENQUIRY_VIEW_KEY] })).toBe(false);
    expect(isProjectsEnquiryViewOnly({ role: 'executive', allowed_sub_modules: JSON.stringify([PROJECTS_ENQUIRY_VIEW_KEY]) })).toBe(true);
  });

  it('Edit implies View; removing View removes Edit; other keys untouched', () => {
    const base = ['projects.enquiry.database'];
    const withEdit = toggleProjectsEnquiryAccessLevel(base, PROJECTS_ENQUIRY_EDIT_KEY);
    expect(withEdit).toEqual(expect.arrayContaining([...base, PROJECTS_ENQUIRY_VIEW_KEY, PROJECTS_ENQUIRY_EDIT_KEY]));
    expect(toggleProjectsEnquiryAccessLevel(withEdit, PROJECTS_ENQUIRY_EDIT_KEY)).toEqual(
      expect.arrayContaining([...base, PROJECTS_ENQUIRY_VIEW_KEY])
    );
    expect(toggleProjectsEnquiryAccessLevel(withEdit, PROJECTS_ENQUIRY_VIEW_KEY)).toEqual(base);
  });

  it('PO At Glance list status follows the sign-off order and ends in OC Generated', () => {
    const st = (slots, returned = false) => ocApprovalStatus({ signedSlots: new Set(slots), returned }, PROJECTS_OC_DEPARTMENT);
    expect(st([]).label).toBe('Pending (OC Creation)');
    expect(st(['PROJECT_USER']).label).toBe('Pending (Execution Department)');
    expect(st(['PROJECT_USER', 'PLANNING']).label).toBe('Pending (Department Head)');
    expect(st(['PROJECT_USER', 'PLANNING', 'VERTICAL_HEAD']).label).toBe('Pending (Finance Department)');
    expect(st(['PROJECT_USER', 'PLANNING', 'VERTICAL_HEAD', 'FINANCE'])).toMatchObject({ kind: 'generated', label: 'OC Generated' });
    expect(st([], true).kind).toBe('returned');
    expect(ocApprovalStatus(undefined, PROJECTS_OC_DEPARTMENT)).toBeNull();
    expect(ocApprovalStatus({ signedSlots: new Set(), returned: false }, { sequentialSignoff: false })).toBeNull();
  });

  it('Order Lost needs approval except for Super Admins or when already lost', () => {
    expect(needsOrderLostApproval('Awaiting Client Response', 'Order Lost', { role: 'manager' })).toBe(true);
    expect(needsOrderLostApproval('Awaiting Client Response', 'Order Lost', { role: 'super_admin' })).toBe(false);
    expect(needsOrderLostApproval('Order Lost', 'Order Lost', { role: 'executive' })).toBe(false);
    expect(needsOrderLostApproval('Draft', 'Revised Offer Sent', { role: 'executive' })).toBe(false);
  });
});

describe('database (PGlite)', () => {
  let db;
  beforeAll(async () => {
    db = await setup();
  }, 120000);

  const Q = SEED.quotation;
  const status = async () => (await one(db, `select offer_status, remark from projects.quotations where id = '${Q}'`));

  describe('Order Lost approval', () => {
    it('blocks setting Order Lost directly (API bypass)', async () => {
      const r = await as(db, USERS.requester, `update projects.quotations set offer_status = 'Order Lost' where id = '${Q}'`);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/needs L1 approval/);
      expect((await status()).offer_status).toBe('Awaiting Client Response');
    });

    it('requires a reason, then one pending request; status unchanged until approval', async () => {
      const noReason = await as(db, USERS.requester, `select projects.request_quotation_order_lost('${Q}', '  ')`);
      expect(noReason.ok).toBe(false);
      expect(noReason.error).toMatch(/reason/i);

      const ok = await as(db, USERS.requester, `select projects.request_quotation_order_lost('${Q}', 'Price gap') as id`, { commit: true });
      expect(ok.ok).toBe(true);
      const dup = await as(db, USERS.requester, `select projects.request_quotation_order_lost('${Q}', 'Again')`);
      expect(dup.ok).toBe(false);
      expect(dup.error).toMatch(/already waiting/);
      expect((await status()).offer_status).toBe('Awaiting Client Response');
      const req = await one(db, `select status, previous_status, l1_manager_code from projects.quotation_status_change_requests where quotation_id = '${Q}'`);
      expect(req).toMatchObject({ status: 'pending', previous_status: 'Awaiting Client Response', l1_manager_code: 'E-L1' });
    });

    it('only the L1 (or admin) can decide; requester cannot write the request table', async () => {
      const id = (await one(db, `select id from projects.quotation_status_change_requests where status = 'pending'`)).id;
      const notL1 = await as(db, USERS.other, `select projects.decide_quotation_order_lost(${id}, true)`);
      expect(notL1.ok).toBe(false);
      expect(notL1.error).toMatch(/L1 manager/);
      const tamper = await as(db, USERS.requester, `update projects.quotation_status_change_requests set status = 'approved' where id = ${id}`);
      expect(tamper.ok).toBe(false);
    });

    it('reject keeps the previous status and records the rejection', async () => {
      const id = (await one(db, `select id from projects.quotation_status_change_requests where status = 'pending'`)).id;
      const r = await as(db, USERS.l1, `select projects.decide_quotation_order_lost(${id}, false, 'Still negotiating') as res`, { commit: true });
      expect(r.rows[0].res).toBe('rejected');
      expect((await status()).offer_status).toBe('Awaiting Client Response');
      expect(await one(db, `select status, decided_by_name, decision_note from projects.quotation_status_change_requests where id = ${id}`)).toMatchObject({
        status: 'rejected',
        decided_by_name: 'L1 Manager',
        decision_note: 'Still negotiating',
      });
    });

    it('approve applies Order Lost and appends the reason to the remark', async () => {
      await as(db, USERS.requester, `select projects.request_quotation_order_lost('${Q}', 'Competitor selected')`, { commit: true });
      const id = (await one(db, `select id from projects.quotation_status_change_requests where status = 'pending'`)).id;
      const r = await as(db, USERS.l1, `select projects.decide_quotation_order_lost(${id}, true) as res`, { commit: true });
      expect(r.rows[0].res).toBe('approved');
      const q = await status();
      expect(q.offer_status).toBe('Order Lost');
      expect(q.remark).toMatch(/\[Status → Order Lost\] Competitor selected/);
      const again = await as(db, USERS.l1, `select projects.decide_quotation_order_lost(${id}, true)`);
      expect(again.ok).toBe(false);
      expect(again.error).toMatch(/already approved/);
    });

    it('approval fails (no change) when the quotation was converted meanwhile', async () => {
      await db.exec(`update projects.quotations set offer_status = 'Draft' where id = '${Q}'`); // as superuser
      await as(db, USERS.requester, `select projects.request_quotation_order_lost('${Q}', 'Lost')`, { commit: true });
      await db.exec(`update projects.quotations set offer_status = 'Order Converted' where id = '${Q}'`);
      // A direct conversion settles the pending request as failed.
      expect((await one(db, `select status from projects.quotation_status_change_requests order by id desc limit 1`)).status).toBe('failed');
      expect((await status()).offer_status).toBe('Order Converted');
    });

    it('Super Admin may set Order Lost directly; imports (INSERT) are not blocked', async () => {
      await db.exec(`update projects.quotations set offer_status = 'Draft' where id = '${Q}'`);
      const r = await as(db, USERS.superAdmin, `update projects.quotations set offer_status = 'Order Lost' where id = '${Q}'`);
      expect(r.ok).toBe(true);
      const ins = await as(db, USERS.requester, `insert into projects.quotations (offer_no, offer_status) values ('IMP-1', 'Order Lost')`);
      expect(ins.ok).toBe(true);
    });
  });

  describe('Quotation deletion only through L1', () => {
    it('a Projects user cannot DELETE directly; a Super Admin can', async () => {
      const user = await as(db, USERS.requester, `with x as (delete from projects.quotations where id = '${Q}' returning 1) select count(*)::int as n from x`);
      expect(user.ok).toBe(true);
      expect(user.rows[0].n).toBe(0);
      const sa = await as(db, USERS.superAdmin, `with x as (delete from projects.quotations where id = '${Q}' returning 1) select count(*)::int as n from x`);
      expect(sa.rows[0].n).toBe(1);
    });
  });

  describe('Enquiry Master View-only', () => {
    it('View-only user can read but not insert / update / delete / change dropdowns', async () => {
      const read = await as(db, USERS.viewOnly, `select count(*)::int as n from projects.enquiries`);
      expect(read.rows[0].n).toBe(2);
      for (const sql of [
        `insert into projects.enquiries (serial_number, data) values (9, '{}')`,
        `update projects.enquiries set data = '{"client_name":"X"}' where id = '${ENQ}'`,
        `delete from projects.enquiries where id = '${ENQ}'`,
        `insert into projects.enquiry_dropdown_options (kind_key, value) values ('k', 'v')`,
        `insert into projects.enquiry_edit_requests (enquiry_id, requested_by) values ('${ENQ}', '${USERS.viewOnly}')`,
        `insert into projects.enquiry_deletion_requests (enquiry_id, requested_by) values ('${ENQ}', '${USERS.viewOnly}')`,
      ]) {
        const r = await as(db, USERS.viewOnly, sql);
        expect(r.ok, sql).toBe(false);
        expect(r.error).toMatch(/view-only access to Enquiry Master/);
      }
    });

    it('Edit / unticked users are unaffected', async () => {
      const r = await as(db, USERS.requester, `update projects.enquiries set data = '{"client_name":"Y"}' where id = '${ENQ}'`);
      expect(r.ok).toBe(true);
    });

    it('View-only L1 can still apply an approved edit and an approved deletion', async () => {
      const edit = await as(
        db,
        USERS.viewOnlyL1,
        `select set_config('projects.enquiry_edit_source', 'approved_request', true);
         update projects.enquiry_edit_requests set status = 'approved' where false;
         update projects.enquiries set data = '{"client_name":"Approved"}' where id = '${ENQ}';`,
        { multi: true }
      );
      expect(edit.ok).toBe(true);
      await db.exec(`insert into projects.enquiry_deletion_requests (enquiry_id, requested_by) values ('${ENQ}', '${USERS.viewOnly}')`);
      const del = await as(
        db,
        USERS.viewOnlyL1,
        `update projects.enquiry_deletion_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where enquiry_id = '${ENQ}';
         delete from projects.enquiries where id = '${ENQ}';`,
        { multi: true }
      );
      expect(del.ok).toBe(true);
      // Without an approved request the same delete is refused.
      const plain = await as(db, USERS.viewOnlyL1, `delete from projects.enquiries where id = '${ENQ}'`);
      expect(plain.ok).toBe(false);
    });
  });

  describe('Activity Log', () => {
    it('records create / field update / status change / delete with user and values', async () => {
      const ins = await as(db, USERS.requester, `insert into projects.quotations (offer_no, client_name, offer_status) values ('AL-1', 'Log Co', 'Draft') returning id`, { commit: true });
      const id = ins.rows[0].id;
      await as(db, USERS.requester, `update projects.quotations set client_name = 'Log Co Ltd', offer_status = 'Awaiting Client Response', updated_at = now() where id = '${id}'`, { commit: true });
      await as(db, USERS.superAdmin, `delete from projects.quotations where id = '${id}'`, { commit: true });
      const rows = (await db.query(`select action, field_name, old_value, new_value, changed_by_name, changed_by_employee_code, entity_ref
        from projects.activity_log where entity_id = '${id}' order by id`)).rows;
      expect(rows.map((r) => r.action)).toEqual(['create', 'update', 'status_change', 'delete']);
      expect(rows[1]).toMatchObject({ field_name: 'client_name', old_value: 'Log Co', new_value: 'Log Co Ltd', changed_by_name: 'Requester', changed_by_employee_code: 'E-REQ' });
      expect(rows[2]).toMatchObject({ field_name: 'offer_status', old_value: 'Draft', new_value: 'Awaiting Client Response' });
      expect(rows.some((r) => r.field_name === 'updated_at')).toBe(false);
      expect(rows[3]).toMatchObject({ changed_by_name: 'Super', entity_ref: 'AL-1' });
    });

    it('logs PO At Glance changes and is read-only for every app user', async () => {
      await as(db, USERS.requester, `insert into public.pj_oc_master (id, client_name, contract_value) values ('${OC}', 'PO Co', 100)`, { commit: true });
      await as(db, USERS.requester, `update public.pj_oc_master set contract_value = 250 where id = '${OC}'`, { commit: true });
      const read = await as(db, USERS.requester, `select field_name, old_value, new_value from projects.activity_log where entity_type = 'po_at_glance' and action = 'update'`);
      expect(read.rows).toEqual([{ field_name: 'contract_value', old_value: '100', new_value: '250' }]);

      const outsider = await as(db, USERS.outsider, `select count(*)::int as n from projects.activity_log`);
      expect(outsider.rows[0].n).toBe(0);
      for (const sql of [
        `insert into projects.activity_log (entity_type, entity_id, action) values ('quotation', '${OC}', 'update')`,
        `update projects.activity_log set new_value = 'x'`,
        `delete from projects.activity_log`,
      ]) {
        expect((await as(db, USERS.superAdmin, sql)).ok, sql).toBe(false);
      }
      await expect(db.exec(`delete from projects.activity_log`)).rejects.toThrow(/cannot be changed or deleted/);
    });
  });

  it('rollbacks apply cleanly in reverse order', async () => {
    for (const name of [
      '20261118183000_projects_activity_log_down.sql',
      '20261118182000_projects_enquiry_view_only_access_down.sql',
      '20261118181000_projects_quotation_delete_requires_l1_down.sql',
      '20261118180000_projects_quotation_order_lost_approval_down.sql',
    ]) {
      await db.exec(readRollback(name));
    }
    const left = await one(db, `select to_regclass('projects.activity_log') as a, to_regclass('projects.quotation_status_change_requests') as b`);
    expect(left).toEqual({ a: null, b: null });
  });
});
