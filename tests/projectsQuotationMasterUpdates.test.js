/**
 * Projects module (2026-11-18, second set):
 *   1. Financial quarter + FY for Order Converted offers (April–March).
 *   2. Order Lost on Quotation Dashboard (enquiry keeps closed handling; no Enquiry KPI).
 *   3. Quotation Master grid columns.
 *   4. Order Status Date stamped on every status change (app + DB trigger 20261118190000).
 *   5. Editing an existing quotation only changes Offer Status / Last Follow-up Date.
 *   6. Overdue follow-up (> 7 days since Last Follow-up Date).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }));
vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    throw new Error('Real Supabase client blocked in tests');
  },
}));

const calls = [];
vi.mock('../src/services/projectsApi', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    projectsTable: (name) => ({
      update(payload) {
        calls.push({ name, payload });
        const chain = {
          eq: () => chain,
          select: () => chain,
          single: async () => ({ data: { id: 'q1', ...payload }, error: null }),
        };
        return chain;
      },
    }),
  };
});

import { readMigration, readRollback } from '../scripts/security/rlsHarness.mjs';
import {
  financialQuarterOf,
  offerBucketOf,
  OFFER_BUCKETS,
  orderQuarterLabel,
} from '../src/pages/projects/quotation/quotationConstants.js';
import {
  lastFollowupOverdueDays,
  LAST_FOLLOWUP_OVERDUE_DAYS,
  updateQuotationMasterDetails,
} from '../src/services/quotationApi.js';
import {
  EDITABLE_DETAIL_KEYS,
  GRID_COLUMNS,
  MASTER_COLUMNS,
  cellValue,
} from '../src/pages/projects/quotation/maker/quotationMasterColumns.jsx';
import {
  dashboardBucket,
  isClosedRow,
  isClosedStatus,
  isWorkCompleted,
} from '../src/pages/projects/enquiry/enquiryDeadlines.js';
import { getStatusRank, STATUS_LEGEND } from '../src/pages/projects/enquiry/enquiryStatusStyles.js';

const enquiry = (data) => ({ id: 'e1', data, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' });

describe('1. Financial quarter (April–March)', () => {
  it.each([
    ['2026-04-01', 'Q1 FY 2026–27'],
    ['2026-06-30', 'Q1 FY 2026–27'],
    ['2026-07-01', 'Q2 FY 2026–27'],
    ['2026-09-30', 'Q2 FY 2026–27'],
    ['2026-10-01', 'Q3 FY 2026–27'],
    ['2026-12-31', 'Q3 FY 2026–27'],
    ['2027-01-01', 'Q4 FY 2026–27'],
    ['2027-03-31', 'Q4 FY 2026–27'],
    ['31/03/2026', 'Q4 FY 2025–26'],
  ])('%s → %s', (date, label) => {
    expect(financialQuarterOf(date)?.label).toBe(label);
  });

  it('only Order Converted offers get a quarter, from the Order Status Date', () => {
    const base = { offer_date: '2026-05-10', order_converted_date: '2026-11-18' };
    expect(orderQuarterLabel({ ...base, offer_status: 'Order Converted' })).toBe('Q3 FY 2026–27');
    expect(orderQuarterLabel({ ...base, offer_status: 'Order Converted on Revised Value' })).toBe('Q3 FY 2026–27');
    expect(orderQuarterLabel({ ...base, offer_status: 'Awaiting Client Response' })).toBe('');
    expect(orderQuarterLabel({ ...base, offer_status: 'Order Lost' })).toBe('');
    // Recalculated when the date changes
    expect(orderQuarterLabel({ ...base, offer_status: 'Order Converted', order_converted_date: '2027-02-01' })).toBe('Q4 FY 2026–27');
    expect(cellValue({ ...base, offer_status: 'Order Converted' }, 'quarter')).toBe('Q3 FY 2026–27');
  });
});

describe('2. Order Lost (Quotation Dashboard)', () => {
  it('quotations with Order Lost map to the lost offer bucket', () => {
    expect(offerBucketOf('Order Lost')).toBe('lost');
    expect(OFFER_BUCKETS.some((b) => b.id === 'lost' && b.label === 'Order Lost')).toBe(true);
  });

  it('enquiry Order Lost stays closed (not a completed/overdue KPI) without being an Enquiry dashboard category', () => {
    const row = enquiry({ current_status: 'Order Lost', target_date: '2026-10-01', completed_on: '2026-10-20' });
    expect(isClosedStatus('Order Lost')).toBe(true);
    expect(isClosedRow(row)).toBe(true);
    expect(isWorkCompleted(row)).toBe(false);
    // Isolated so it does not inflate overdue / WIP boxes; Enquiry Dashboard does not show this KPI.
    expect(dashboardBucket(row, new Date('2026-11-18T00:00:00'))).toBe('orderLost');
    expect(STATUS_LEGEND.map((s) => s.status)).toContain('Order Lost');
    expect(getStatusRank('Order Lost')).toBe(getStatusRank('Regret'));
  });

  it('other enquiry statuses keep their boxes', () => {
    const today = new Date('2026-11-18T00:00:00');
    expect(dashboardBucket(enquiry({ current_status: 'Regret', target_date: '2026-10-01' }), today)).toBe('regret');
    expect(dashboardBucket(enquiry({ current_status: 'Work in Progress', target_date: '2026-10-01', assigned_to_person: 'A' }), today)).toBe('overdue');
  });
});

describe('3 & 4. Master grid columns and Order Status Date label', () => {
  it('grid shows exactly Client Name, Offer Status, Order Value, Last Follow-up Date (after SR No.)', () => {
    expect(GRID_COLUMNS.map((c) => c.label)).toEqual(['Client Name', 'Offer Status', 'Order Value', 'Last Follow-up Date']);
    expect(cellValue({ quoted_rate: null, grand_total: 1500 }, 'quoted_rate')).toBe(1500);
  });

  it('Order Converted Date is renamed Order Status Date', () => {
    const col = MASTER_COLUMNS.find((c) => c.key === 'order_converted_date');
    expect(col.label).toBe('Order Status Date');
    expect(MASTER_COLUMNS.some((c) => /Order Converted Date/.test(c.label))).toBe(false);
  });
});

describe('5. Editing an existing quotation', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('only Offer Status and Last Follow-up Date are editable', () => {
    expect(EDITABLE_DETAIL_KEYS).toEqual(['offer_status', 'last_followup_date']);
  });

  it('sends only the editable fields, even if the form carries others', async () => {
    await updateQuotationMasterDetails(
      'q1',
      { offer_status: 'Draft', last_followup_date: '2026-11-10', client_name: 'Hacked', quoted_rate: 1, remark: 'r' },
      { previousStatus: 'Draft' }
    );
    expect(Object.keys(calls[0].payload).sort()).toEqual(['last_followup_date', 'offer_status', 'updated_at']);
  });

  it('a status change stamps the Order Status Date (today) and status_changed_at', async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await updateQuotationMasterDetails(
      'q1',
      { offer_status: 'Order Converted', last_followup_date: '' },
      { previousStatus: 'Awaiting Client Response' }
    );
    expect(calls[0].payload).toMatchObject({ offer_status: 'Order Converted', order_converted_date: today });
    expect(calls[0].payload.status_changed_at).toBeTruthy();
  });

  it('Hold needs a reason, which is appended to the existing remark', async () => {
    await expect(
      updateQuotationMasterDetails('q1', { offer_status: 'Client Has Hold Enquiry' }, { previousStatus: 'Awaiting Client Response' })
    ).rejects.toThrow(/reason is required/);
    await updateQuotationMasterDetails(
      'q1',
      { offer_status: 'Client Has Hold Enquiry', remark: 'Old note' },
      { previousStatus: 'Awaiting Client Response', statusRemark: 'Budget freeze' }
    );
    expect(calls.at(-1).payload.remark).toBe('Old note\n[Status → Client Has Hold Enquiry] Budget freeze');
  });

  it('workflow rules still apply', async () => {
    await expect(
      updateQuotationMasterDetails('q1', { offer_status: 'Draft' }, { previousStatus: 'Order Converted' })
    ).rejects.toThrow(/Cannot move/);
  });
});

describe('6. Overdue follow-up', () => {
  const today = '2026-11-18';
  it(`counts open offers more than ${LAST_FOLLOWUP_OVERDUE_DAYS} days after the Last Follow-up Date`, () => {
    expect(lastFollowupOverdueDays({ offer_status: 'Awaiting Client Response', last_followup_date: '2026-11-11' }, today)).toBe(0); // 7 days
    expect(lastFollowupOverdueDays({ offer_status: 'Awaiting Client Response', last_followup_date: '2026-11-10' }, today)).toBe(8);
    expect(lastFollowupOverdueDays({ offer_status: 'Client Has Hold Enquiry', last_followup_date: '01/10/2026' }, today)).toBe(48);
  });

  it('ignores closed offers and rows without a follow-up date', () => {
    for (const offer_status of ['Order Converted', 'Order Converted on Revised Value', 'Order Lost', 'Superseded']) {
      expect(lastFollowupOverdueDays({ offer_status, last_followup_date: '2026-01-01' }, today)).toBe(0);
    }
    expect(lastFollowupOverdueDays({ offer_status: 'Draft', last_followup_date: null }, today)).toBe(0);
    expect(lastFollowupOverdueDays({ offer_status: 'Draft', last_followup_date: '2026-01-01', superseded: true }, today)).toBe(0);
  });

  it('updates when the follow-up date moves', () => {
    const row = { offer_status: 'Draft', last_followup_date: '2026-11-01' };
    expect(lastFollowupOverdueDays(row, today)).toBeGreaterThan(0);
    expect(lastFollowupOverdueDays({ ...row, last_followup_date: '2026-11-17' }, today)).toBe(0);
  });
});

describe('database (PGlite)', () => {
  it('trigger stamps Order Status Date on every status change, keeps an explicit date, and rolls back', async () => {
    const db = new PGlite();
    await db.exec(`
      create schema projects;
      create table projects.quotations (id int primary key, offer_status text, order_converted_date date, client_name text);
      insert into projects.quotations values (1, 'Draft', null, 'A'), (2, 'Draft', null, 'B');
    `);
    await db.exec(readMigration('20261118190000_projects_quotation_order_status_date.sql').replace(/notify pgrst.*$/m, ''));
    const today = (await db.query(`select (now() at time zone 'Asia/Kolkata')::date::text as d`)).rows[0].d;
    await db.exec(`update projects.quotations set offer_status = 'Order Converted' where id = 1`);
    await db.exec(`update projects.quotations set offer_status = 'Order Lost', order_converted_date = '2026-04-02' where id = 2`);
    await db.exec(`update projects.quotations set client_name = 'A2' where id = 1`);
    const rows = (await db.query(`select id, order_converted_date::text as d from projects.quotations order by id`)).rows;
    expect(rows).toEqual([{ id: 1, d: today }, { id: 2, d: '2026-04-02' }]);
    await db.exec(readRollback('20261118190000_projects_quotation_order_status_date_down.sql').replace(/notify pgrst.*$/m, ''));
    await db.exec(`update projects.quotations set offer_status = 'Draft', order_converted_date = null where id = 1`);
    await db.exec(`update projects.quotations set offer_status = 'Awaiting Client Response' where id = 1`);
    expect((await db.query(`select order_converted_date from projects.quotations where id = 1`)).rows[0].order_converted_date).toBeNull();
  }, 60000);

  it('seeds the enquiry "Order Lost" status once (idempotent) and rolls back', async () => {
    const db = new PGlite();
    await db.exec(`
      create schema projects;
      create table projects.enquiry_dropdown_kinds (id uuid primary key default gen_random_uuid(), kind_key text unique);
      create table projects.enquiry_dropdown_options (id uuid primary key default gen_random_uuid(),
        kind_id uuid not null references projects.enquiry_dropdown_kinds (id), value text not null, sort_order int default 0,
        constraint enquiry_dropdown_options_kind_value_unique unique (kind_id, value));
      insert into projects.enquiry_dropdown_kinds (kind_key) values ('current_status'), ('priority');
    `);
    const sql = readMigration('20261118191000_projects_enquiry_order_lost_status.sql').replace(/notify pgrst.*$/m, '');
    await db.exec(sql);
    await db.exec(sql);
    const n = async () =>
      (await db.query(`select count(*)::int as n from projects.enquiry_dropdown_options where value = 'Order Lost'`)).rows[0].n;
    expect(await n()).toBe(1);
    await db.exec(readRollback('20261118191000_projects_enquiry_order_lost_status_down.sql').replace(/notify pgrst.*$/m, ''));
    expect(await n()).toBe(0);
  }, 60000);
});
