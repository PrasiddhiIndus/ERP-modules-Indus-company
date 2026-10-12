/**
 * Payroll MIS — common rules, filters, colours, statuses, drill-downs, access, exports, alerts and
 * the lock / unlock / re-lock behaviour, on in-memory Gujarat mock data. No network, no database.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EXTRA_STATUS_PAYMENTS, MOCK, MOCK_USERS, TODAY, VERTICAL_MAP, buildMock } from './fixtures/payrollMisMock.js';
import { OUT_DIR, assembleReports, createMemoryDb, createMockSupabase, createRecorder, installNetworkGuard } from './helpers/payrollMisKit.js';

const kit = vi.hoisted(() => ({ client: null, mail: [] }));
vi.mock('../src/lib/supabase.js', () => ({ supabase: new Proxy({}, { get: (_, k) => kit.client?.[k] }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => { throw new Error('Real Supabase client blocked in tests'); } }));
vi.mock('../server/mail/index.js', () => ({
  isMailDispatchConfigured: () => true,
  sendOutboundMail: async (msg) => { kit.mail.push(msg); return { ok: true, mocked: true }; },
}));

const misDb = await import('../src/pages/adminOperations/salaryAdmin/mis/misDb.js');
const M = await import('../src/pages/adminOperations/salaryAdmin/mis/misMetrics.js');
const S = await import('../src/pages/adminOperations/salaryAdmin/mis/misReportSpecs.js');
const X = await import('../src/pages/adminOperations/salaryAdmin/mis/misExport.js');
const { runPayrollMisAlerts } = await import('../server/payrollMisAlerts.js');

const { A: VA, B: VB, C: VC, Corporate: CORP } = VERTICAL_MAP;
const rec = createRecorder('ops');
const attempts = installNetworkGuard();
const captured = [];
const SEP = { type: 'month', month: '2026-09' };

/** Records a named check (expected vs actual) and asserts it. */
function check(section, label, expected, actual) {
  rec.check(section, label, expected, actual);
  expect(actual).toEqual(expected);
}

async function loadAs(db, user, from = '2025-10', to = '2026-09') {
  kit.client = createMockSupabase(db, { user });
  const months = await misDb.fetchLockedMonths();
  const lockedKeys = months.map((m) => m.month_key).sort();
  const rows = await misDb.fetchSnapshotRows(from, to);
  return { months, lockedKeys, rows };
}

let db;
let base;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T11:00:00+05:30`));
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: () => ({ style: {}, click() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  URL.createObjectURL = (blob) => {
    captured.push(blob);
    return 'blob:mock';
  };
  URL.revokeObjectURL = () => {};
  db = createMemoryDb(MOCK);
  base = await loadAs(db, MOCK_USERS.salaryAdmin);
});

afterAll(() => {
  rec.write();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
describe('Common rules', () => {
  const sec = 'Common rules';
  it('Change % rounds to 1 decimal; previous = 0 shows "New"', () => {
    check(sec, 'Change % 70,17,000 vs 67,61,000', 3.8, M.changePct(7017000, 6761000));
    check(sec, 'Change % with previous 0 shows New', 'New', M.formatChangePct(M.changePct(5, 0)));
    check(sec, 'Change % 27.27 → +27.3%', '+27.3%', M.formatChangePct(M.changePct(210000, 165000)));
    check(sec, 'Change % fall shows minus sign', '−5.0%', M.formatChangePct(M.changePct(95, 100)));
  });
  it('2-decimal storage, whole-rupee Indian grouping on display', () => {
    check(sec, 'Indian grouping 12,34,567', '12,34,567', M.formatInr(1234567));
    check(sec, 'Indian grouping 4,03,08,200', '4,03,08,200', M.formatInr(40308200));
    check(sec, 'Display rounds 123.52 → 124', '124', M.formatInr(123.52));
    const lop = base.rows.find((r) => r.month_key === '2026-09' && r.lop_days > 0);
    check(sec, 'Stored LOP earned keeps 2 decimals', true, Number.isFinite(lop.fixed_earned) && lop.fixed_earned === M.round2(lop.fixed_earned));
    check(sec, 'Paise-exact sum of 0.1 + 0.2', 0.3, M.totals([{ month_key: 'x', gross: 0.1 }, { month_key: 'x', gross: 0.2 }]).gross);
  });
  it('"Previous" is the immediately previous locked month for the same filters', () => {
    const p = M.periodMonths(SEP, base.lockedKeys);
    check(sec, 'Previous of Sep 2026', ['2026-08'], p.previous);
    const gap = M.periodMonths(SEP, base.lockedKeys.filter((k) => k !== '2026-08'));
    check(sec, 'Previous skips an unlocked Aug → Jul', ['2026-07'], gap.previous);
    const rep = assembleReports(base.rows, base.lockedKeys, SEP, { filters: { vertical: VB } });
    check(sec, 'Vertical B previous CTC (same filter)', 2010000, rep.r1.rows.find((r) => r.key === 'totalCtc').previous);
  });
  it('The Draft October run never appears', async () => {
    check(sec, 'Locked months exclude Oct 2026', false, base.lockedKeys.includes('2026-10'));
    check(sec, 'Draft run has payroll lines', true, db.lines['mock-run-2026-10'].length > 0);
    check(sec, 'Rows for Oct 2026', 0, (await misDb.fetchSnapshotRows('2026-10', '2026-10')).length);
    check(sec, 'Payment rows for Oct 2026', 0, db.tables.admin_payroll_statutory_payments.filter((p) => p.wage_month === '2026-10').length);
  });
});

// ---------------------------------------------------------------------------
describe('Lock / unlock / re-lock (simulated after-lock trigger)', () => {
  const sec = 'Lock / unlock / re-lock';
  it('locking creates the snapshot and payment rows; the in-memory build equals the fixture', () => {
    check(sec, 'Snapshot rows after locking all months', MOCK.snapshot.length, db.tables.admin_payroll_mis_snapshot.length);
    check(sec, 'Payment rows after locking all months', MOCK.payments.length, db.tables.admin_payroll_statutory_payments.length);
    const sumBy = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
    check(sec, 'Snapshot Sep gross = fixture', sumBy(MOCK.rowsByMonth['2026-09'], 'gross'), sumBy(db.tables.admin_payroll_mis_snapshot.filter((r) => r.month_key === '2026-09'), 'gross'));
    check(sec, 'Every snapshot row carries state GJ', true, db.tables.admin_payroll_mis_snapshot.every((r) => r.work_state === 'GJ'));
  });
  it('re-lock replaces the month snapshot and never duplicates tracker rows', () => {
    const local = createMemoryDb(MOCK);
    const run = 'mock-run-2026-07';
    const before = local.tables.admin_payroll_mis_snapshot.filter((r) => r.month_key === '2026-07');
    const paysBefore = local.tables.admin_payroll_statutory_payments.filter((p) => p.wage_month === '2026-07');
    local.setLocked(run, false);
    const line = local.lines[run][0];
    line.gross += 1000;
    line.tds += 100;
    local.setLocked(run, true);
    const after = local.tables.admin_payroll_mis_snapshot.filter((r) => r.month_key === '2026-07');
    const paysAfter = local.tables.admin_payroll_statutory_payments.filter((p) => p.wage_month === '2026-07');
    check(sec, 'Jul snapshot row count unchanged after re-lock', before.length, after.length);
    check(sec, 'Jul snapshot gross reflects the re-processed line', before.reduce((s, r) => s + r.gross, 0) + 1000, after.reduce((s, r) => s + r.gross, 0));
    check(sec, 'Jul tracker rows not duplicated', paysBefore.length, paysAfter.length);
    check(sec, 'One tracker row per statute', paysAfter.length, new Set(paysAfter.map((p) => p.statute)).size);
    const tds = paysAfter.find((p) => p.statute === 'TDS');
    check(sec, 'Paid TDS row flagged "amount changed after payment"', true, tds.amount_changed_after_payment);
    local.setLocked('mock-run-2026-09', false);
    local.setLocked('mock-run-2026-09', true);
    check(sec, 'Sep tracker rows after unlock + re-lock', 4, local.tables.admin_payroll_statutory_payments.filter((p) => p.wage_month === '2026-09').length);
  });
  it('the lock always succeeds even when the snapshot build fails', () => {
    const local = createMemoryDb(MOCK);
    local.setLocked('mock-run-2026-09', false);
    local.failNextBuild = true;
    const run = local.setLocked('mock-run-2026-09', true);
    check(sec, 'Run locked despite snapshot failure', true, run.is_locked);
    check(sec, 'Failure written to the job log', false, local.tables.admin_payroll_mis_job_log.at(-1).ok);
  });
  it('the snapshot keeps last month\'s vertical after a transfer', () => {
    const local = createMemoryDb(MOCK, { lockAll: false });
    const order = local.tables.admin_salary_month_runs.filter((r) => r.status === 'processed').map((r) => r.id).sort();
    for (const id of order.filter((x) => x < 'mock-run-2026-09')) local.setLocked(id, true);
    const emp = MOCK.rowsByMonth['2026-08'].find((r) => r.vertical_code === VA && r.paid_days > 0);
    local.tables.admin_payroll_employee_tags.find((t) => t.employee_master_id === emp.employee_master_id).vertical_code = VB;
    local.setLocked('mock-run-2026-09', true);
    const snap = (m) => local.tables.admin_payroll_mis_snapshot.find((r) => r.month_key === m && r.employee_master_id === emp.employee_master_id);
    check(sec, 'Aug row keeps vertical A after transfer', VA, snap('2026-08').vertical_code);
    check(sec, 'Sep row shows the new vertical B', VB, snap('2026-09').vertical_code);
  });
});

// ---------------------------------------------------------------------------
describe('Filters', () => {
  const sec = 'Filters';
  const total = (rep) => rep.r1.rows.find((r) => r.key === 'totalCtc').current;
  const monthCtc = (m) => M.totals(MOCK.rowsByMonth[m]).totalCtc;
  it('period: month, range, quarter, FY Apr–Mar, YTD', () => {
    check(sec, 'Month Sep 2026', 7017000, total(assembleReports(base.rows, base.lockedKeys, SEP)));
    check(sec, 'Range Aug–Sep 2026', 7017000 + 6761000, total(assembleReports(base.rows, base.lockedKeys, { type: 'range', from: '2026-08', to: '2026-09' })));
    check(sec, 'Quarter Q2 FY 2026-27 (Jul–Sep)', monthCtc('2026-07') + 6761000 + 7017000, total(assembleReports(base.rows, base.lockedKeys, { type: 'quarter', fy: 2026, quarter: 2 })));
    check(sec, 'FY 2026-27 (locked Apr–Sep)', 40308200, total(assembleReports(base.rows, base.lockedKeys, { type: 'fy', fy: 2026 })));
    check(sec, 'YTD to Sep 2026', 40308200, total(assembleReports(base.rows, base.lockedKeys, { type: 'ytd', month: '2026-09' })));
    check(sec, 'FY 2025-26 (locked Oct–Mar)', PRIOR_TOTAL(), total(assembleReports(base.rows, base.lockedKeys, { type: 'fy', fy: 2025 })));
  });
  it('vertical and department filters', () => {
    check(sec, 'Vertical A total CTC', 2635000, total(assembleReports(base.rows, base.lockedKeys, SEP, { filters: { vertical: VA } })));
    check(sec, 'Department Operations / Field total CTC', 1420000, total(assembleReports(base.rows, base.lockedKeys, SEP, { filters: { department: 'Operations / Field' } })));
  });
  it('location, cost centre, grade and employment type partition the total', () => {
    const sep = M.rowsForMonths(base.rows, ['2026-09']);
    const opts = M.filterOptions(sep);
    for (const [key, field] of [['location', 'locations'], ['costCentre', 'costCentres'], ['grade', 'grades'], ['employmentType', 'employmentTypes']]) {
      const parts = opts[field].reduce((s, v) => s + total(assembleReports(base.rows, base.lockedKeys, SEP, { filters: { [key]: v } })), 0);
      check(sec, `${key} values sum to Sep total`, 7017000, parts);
    }
    check(sec, 'Locations are Gujarat cities', ['Ahmedabad', 'Rajkot', 'Surat', 'Vadodara'], opts.locations);
  });
});
function PRIOR_TOTAL() {
  return ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'].reduce((s, m) => s + M.totals(MOCK.rowsByMonth[m]).totalCtc, 0);
}

// ---------------------------------------------------------------------------
describe('Colours, Unassigned and shared-staff allocation', () => {
  const sec = 'Colours / Unassigned / allocation';
  it('Report 1: red above +5% on money rows, green on a fall, none on headcount', () => {
    const rep = assembleReports(base.rows, base.lockedKeys, SEP);
    const tone = (k) => rep.r1.rows.find((r) => r.key === k).tone;
    check(sec, 'Overtime +27.3% is red', 'bad', tone('ot'));
    check(sec, 'Total CTC +3.8% has no colour', 'neutral', tone('totalCtc'));
    check(sec, 'Headcount never coloured', 'neutral', tone('headcount'));
    const fall = M.buildR1(rep.prev, rep.cur);
    check(sec, 'A fall is green', 'good', fall.rows.find((r) => r.key === 'totalCtc').tone);
    check(sec, 'Headcount fall not coloured', 'neutral', fall.rows.find((r) => r.key === 'headcount').tone);
  });
  it('Report 4: an untagged employee shows a red "Unassigned" row', async () => {
    const withU = buildMock({ includeUnassigned: true });
    const local = createMemoryDb(withU);
    const { lockedKeys, rows } = await loadAs(local, MOCK_USERS.salaryAdmin);
    const rep = assembleReports(rows, lockedKeys, SEP);
    const u = rep.r4.rows.find((r) => r.unassigned);
    check(sec, 'Unassigned row present', 'Unassigned', u?.label);
    check(sec, 'Unassigned headcount', 1, u?.headcount);
    const spec = S.r4Spec(rep.r4, rep.labels);
    check(sec, 'Unassigned row is red in the download', true, spec.sheets[0].rows.find((r) => r.cells[0] === 'Unassigned').tones.every((t) => t === 'bad'));
    kit.client = createMockSupabase(db, { user: MOCK_USERS.salaryAdmin });
  });
  it('a 50 / 50 allocation gives 0.5 headcount and keeps totals (off by default)', () => {
    check(sec, 'Allocation switched off by default', false, MOCK.allocationEnabledByDefault);
    const off = assembleReports(base.rows, base.lockedKeys, SEP, { allocations: MOCK.allocations, split: false });
    const on = assembleReports(base.rows, base.lockedKeys, SEP, { allocations: MOCK.allocations, split: true });
    const v = (rep, code) => rep.r4.rows.find((r) => r.vertical === code);
    check(sec, 'Split off: Corporate headcount stays 22', 22, v(off, CORP).headcount);
    check(sec, 'Split on: Corporate headcount 21', 21, v(on, CORP).headcount);
    check(sec, 'Split on: Vertical A headcount 96.5', 96.5, v(on, VA).headcount);
    check(sec, 'Split on: Vertical B headcount 72.5', 72.5, v(on, VB).headcount);
    check(sec, 'Split on: total CTC unchanged', 7017000, on.r4.total.totalCtc);
    check(sec, 'Split on: Report 5 Vertical A headcount 96.5', 96.5, on.r5.groups.find((g) => g.vertical === VA).subtotal.headcount);
  });
});

// ---------------------------------------------------------------------------
describe('Report 7 statuses, mark paid, challan upload and alerts', () => {
  const sec = 'Report 7 statuses / alerts';
  it('Due soon (amber) and Overdue (red) rows', () => {
    const r7 = M.buildR7([...MOCK.payments, ...EXTRA_STATUS_PAYMENTS], TODAY);
    const st = (id) => r7.rows.find((r) => r.id === id).status;
    check(sec, 'Synthetic row due 12 Oct → Due soon', 'due_soon', st('mock-pay-extra-due-soon').key);
    check(sec, 'Due soon tone is amber', 'warn', st('mock-pay-extra-due-soon').tone);
    check(sec, 'Synthetic row due 5 Oct → Overdue', 'overdue', st('mock-pay-extra-overdue').key);
    check(sec, 'Overdue tone is red', 'bad', st('mock-pay-extra-overdue').tone);
    check(sec, 'Overdue days late', 5, st('mock-pay-extra-overdue').daysLate);
    check(sec, 'Sep PF viewed on 13 Oct → Due soon', 'due_soon', M.buildR7(MOCK.payments, '2026-10-13').rows.find((r) => r.id === 'mock-pay-2026-09-PF').status.key);
    check(sec, 'Sep PF viewed on 16 Oct → Overdue 1 day', { key: 'overdue', daysLate: 1 }, (({ key, daysLate }) => ({ key, daysLate }))(M.buildR7(MOCK.payments, '2026-10-16').rows.find((r) => r.id === 'mock-pay-2026-09-PF').status));
  });
  it('cannot mark paid without a challan reference and a paid-on date', async () => {
    const local = createMemoryDb(MOCK);
    kit.client = createMockSupabase(local, { user: MOCK_USERS.salaryAdmin });
    const id = 'mock-pay-2026-09-PF';
    await expect(misDb.markPaymentPaid(id, { paidOn: '2026-10-10', challanRef: '  ' })).rejects.toThrow(/challan reference/);
    await expect(misDb.markPaymentPaid(id, { paidOn: null, challanRef: 'MOCK-TRRN-1' })).rejects.toThrow(/paid-on date/);
    check(sec, 'Row still unpaid after both rejections', null, local.tables.admin_payroll_statutory_payments.find((p) => p.id === id).paid_on);
    await misDb.markPaymentPaid(id, { paidOn: '2026-10-10', challanRef: 'MOCK-TRRN-200001' });
    const row = local.tables.admin_payroll_statutory_payments.find((p) => p.id === id);
    check(sec, 'Marked paid with challan + date', 'paid_on_time', M.paymentStatus(row, TODAY).key);
    rec.check(sec, 'Mark paid rejected without challan_ref', true, true);
    rec.check(sec, 'Mark paid rejected without paid_on', true, true);
  });
  it('challan PDF upload goes to the mocked storage only', async () => {
    const local = createMemoryDb(MOCK);
    kit.client = createMockSupabase(local, { user: MOCK_USERS.salaryAdmin });
    const payment = local.tables.admin_payroll_statutory_payments.find((p) => p.id === 'mock-pay-2026-09-TDS');
    const file = { name: 'MOCK challan Sep TDS.pdf', type: 'application/pdf', size: 1234 };
    const stored = await misDb.uploadChallan(payment, file);
    check(sec, 'Upload recorded in memory', 1, local.storage.length);
    check(sec, 'Upload bucket', misDb.CHALLAN_BUCKET, local.storage[0].bucket);
    check(sec, 'Challan path saved on the payment row', stored, local.tables.admin_payroll_statutory_payments.find((p) => p.id === payment.id).challan_path);
    check(sec, 'Signed link is a mock URL', true, (await misDb.challanUrl(stored)).startsWith('mock://'));
  });
  it('alert email is sent (mocked) only for Due soon and Overdue, once a day', async () => {
    const local = createMemoryDb(MOCK);
    const svc = createMockSupabase(local, { user: { id: 'service', full: true } });
    kit.mail.length = 0;
    const quiet = await runPayrollMisAlerts(svc, { now: new Date(`${TODAY}T11:00:00+05:30`) });
    check(sec, 'No alert when nothing is due soon / overdue', 0, quiet.sent);
    local.tables.admin_payroll_statutory_payments.push(...EXTRA_STATUS_PAYMENTS.map((p) => ({ ...p })));
    const out = await runPayrollMisAlerts(svc, { now: new Date(`${TODAY}T11:00:00+05:30`) });
    check(sec, 'Alert sent to both mock recipients', 2, out.sent);
    check(sec, 'Alert covers 2 payments (1 due soon, 1 overdue)', 2, out.items);
    check(sec, 'Recipients are placeholder addresses', ['cfo@example.test', 'compliance@example.test'], kit.mail.map((m) => m.to).sort());
    check(sec, 'Subject names overdue and due soon', true, /1 overdue, 1 due soon/.test(kit.mail[0].subject));
    check(sec, 'Pending (not due soon) payments not in the email', false, kit.mail[0].html.includes('8,20,000'));
    const again = await runPayrollMisAlerts(svc, { now: new Date(`${TODAY}T15:00:00+05:30`) });
    check(sec, 'Second run the same day sends nothing', 0, again.sent);
  });
});

// ---------------------------------------------------------------------------
describe('Drill-downs', () => {
  const sec = 'Drill-downs';
  it('drill-down rows sum to each total', () => {
    const rep = assembleReports(base.rows, base.lockedKeys, SEP);
    for (const d of rep.r2.drivers.filter((x) => x.key !== 'employer')) {
      check(sec, `R2 ${d.label}: employees sum to the driver`, d.amount, M.round2(d.employees.reduce((s, e) => s + e.amount, 0)));
    }
    for (const r of rep.r4.rows) {
      const rows = rep.cur.filter((x) => M.vertKey(x) === r.vertical);
      check(sec, `R4 ${r.label}: employee CTC sums to the row`, r.totalCtc, rows.reduce((s, x) => s + M.totalCtc(x), 0));
    }
    for (const d of rep.r5.groups.find((g) => g.vertical === VA).departments) {
      const rows = rep.cur.filter((x) => x.vertical_code === VA && x.department === d.department);
      check(sec, `R5 ${d.department}: employee CTC sums to the row`, d.totalCtc, rows.reduce((s, x) => s + M.totalCtc(x), 0));
    }
    check(sec, 'R6 employee-wise: employee share sums to total', rep.r6.total.employeeShare, rep.r6Employees.reduce((s, e) => s + e.employeeShare, 0));
    check(sec, 'R6 employee-wise: employer share sums to total', rep.r6.total.employerShare, rep.r6Employees.reduce((s, e) => s + e.employerShare, 0));
  });
});

// ---------------------------------------------------------------------------
describe('Access and logging', () => {
  const sec = 'Access / logging';
  it('Salary Admin sees every vertical; the vertical head sees only Manpower', async () => {
    kit.client = createMockSupabase(db, { user: MOCK_USERS.salaryAdmin });
    const admin = await misDb.fetchMyMisAccess();
    check(sec, 'Salary Admin has full access', true, admin.full);
    const adminRep = assembleReports(base.rows, base.lockedKeys, SEP);
    check(sec, 'Salary Admin sees 4 verticals', [CORP, VA, VB, VC].sort(), adminRep.r4.rows.map((r) => r.vertical).sort());

    const vh = await loadAs(db, MOCK_USERS.verticalHead);
    const access = await misDb.fetchMyMisAccess();
    check(sec, 'Vertical head scopes', [{ vertical: VA, department: null }], access.scopes);
    check(sec, 'Vertical head is not full access', false, access.full);
    const vhRep = assembleReports(vh.rows, vh.lockedKeys, SEP);
    check(sec, 'Vertical head rows only Manpower', [VA], [...new Set(vh.rows.map((r) => r.vertical_code))]);
    check(sec, 'Vertical head Total CTC = Report 4 Manpower row', 2635000, vhRep.r1.rows.find((r) => r.key === 'totalCtc').current);
    check(sec, 'Vertical head sees Reports 1–6 only', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], S.REPORTS.filter((r) => access.full || r.id !== 'r7').map((r) => r.id));
  });
  it('a user without access gets a friendly error', async () => {
    kit.client = createMockSupabase(db, { user: { id: 'mock-no-access', email: 'nobody@example.test', full: false } });
    await expect(misDb.fetchSnapshotRows('2026-09', '2026-09')).rejects.toThrow('You do not have access to this.');
    rec.check(sec, 'No-access user blocked with a friendly message', true, true);
  });
  it('every view and download writes a (mocked) log entry', async () => {
    for (const user of [MOCK_USERS.salaryAdmin, MOCK_USERS.verticalHead]) {
      kit.client = createMockSupabase(db, { user });
      const start = db.tables.admin_payroll_mis_audit_log.length;
      const reports = user.full ? S.REPORTS : S.REPORTS.filter((r) => r.id !== 'r7');
      for (const r of reports) {
        await misDb.logMisAction(r.title, 'view', null, { from: '2026-09', to: '2026-09' }, {});
        for (const f of ['xlsx', 'pdf', 'csv']) await misDb.logMisAction(r.title, 'download', f, { from: '2026-09', to: '2026-09' }, {});
      }
      const added = db.tables.admin_payroll_mis_audit_log.slice(start);
      check(sec, `${user.email}: one log entry per view / download`, reports.length * 4, added.length);
      check(sec, `${user.email}: entries carry the user`, true, added.every((e) => e.user_email === user.email));
    }
  });
});

// ---------------------------------------------------------------------------
describe('Exports', () => {
  const sec = 'Exports';
  const header = {
    company: MOCK.company, report: '', period: 'Sep 2026', filters: 'None',
    generatedOn: '10 Oct 2026, 11:00', generatedBy: MOCK_USERS.salaryAdmin.email,
  };
  const specs = () => {
    const rep = assembleReports(base.rows, base.lockedKeys, SEP, { rates: MOCK.rates });
    return {
      r1: S.r1Spec(rep.r1, rep.labels), r2: S.r2Spec(rep.r2, rep.r2Labels), r3: S.r3Spec(rep.r3, rep.labels),
      r4: S.r4Spec(rep.r4, rep.labels), r5: S.r5Spec(rep.r5, rep.labels), r6: S.r6Spec(rep.r6, rep.r6Employees, rep.pf),
      r7: S.r7Spec(M.buildR7(MOCK.payments, TODAY)),
    };
  };
  const dir = path.join(OUT_DIR, 'exports');

  it('Excel holds values (no formulas) and the report header; CSV and PDF build', async () => {
    fs.mkdirSync(dir, { recursive: true });
    const all = specs();
    for (const meta of S.REPORTS) {
      const spec = all[meta.id];
      const h = { ...header, report: meta.title, period: meta.id === 'r7' ? `As on ${TODAY}` : header.period };
      captured.length = 0;
      await X.exportReportExcel(spec, h);
      const buf = Buffer.from(await captured[0].arrayBuffer());
      fs.writeFileSync(path.join(dir, `${meta.id}.xlsx`), buf);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      let formulas = 0;
      let numbers = 0;
      wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => {
        if (cell.formula || cell.type === ExcelJS.ValueType.Formula) formulas += 1;
        if (typeof cell.value === 'number') numbers += 1;
      })));
      const ws = wb.worksheets[0];
      const headerLabels = [1, 2, 3, 4, 5, 6].map((i) => ws.getRow(i).getCell(1).value);
      check(sec, `${meta.title}: Excel has no formulas`, 0, formulas);
      check(sec, `${meta.title}: Excel money cells are numbers`, true, numbers > 0);
      check(sec, `${meta.title}: Excel header rows`, ['Company', 'Report', 'Period', 'Filters', 'Generated on', 'Generated by'], headerLabels);
      check(sec, `${meta.title}: Excel header values`, [h.company, h.report, h.period], [1, 2, 3].map((i) => ws.getRow(i).getCell(2).value));

      const csv = X.reportCsvText(spec, h);
      fs.writeFileSync(path.join(dir, `${meta.id}.csv`), csv);
      check(sec, `${meta.title}: CSV starts with the report header`, true, csv.includes(`Company,${h.company}`) && csv.includes(`Report,${h.report}`) && csv.includes('Generated by,'));

      captured.length = 0;
      X.exportReportPdf(spec, h);
      const pdf = Buffer.from(await captured[0].arrayBuffer());
      fs.writeFileSync(path.join(dir, `${meta.id}.pdf`), pdf);
      check(sec, `${meta.title}: PDF builds`, true, pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 1000);
    }
  });
});

// ---------------------------------------------------------------------------
describe('No side effects', () => {
  const sec = 'No side effects';
  it('made no network call', () => {
    check(sec, 'Network calls attempted (fetch / XHR / WebSocket)', 0, attempts.length);
  });
  it('git shows no change to application code, database files or server code', () => {
    let out = '';
    try {
      out = execSync('git status --porcelain', { encoding: 'utf8' });
    } catch {
      rec.check(sec, 'git status available', true, false, 'git not available');
      return;
    }
    const touched = out.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3).replace(/\\/g, '/'))
      .filter((p) => /^(src|server|supabase)\//.test(p));
    check(sec, 'Changed files under src/, server/, supabase/', [], touched);
  });
});
