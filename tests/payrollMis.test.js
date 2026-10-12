/**
 * Payroll MIS — every sample figure of Reports 1–7 and the new-hire summary, plus the cross-report
 * tie-outs, on in-memory Gujarat mock data (tests/fixtures/payrollMisMock.js).
 * Data is loaded through the real misDb.js functions over a mocked Supabase client; no network.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MOCK, MOCK_USERS, TODAY, VERTICAL_MAP, deviations } from './fixtures/payrollMisMock.js';
import { assembleReports, createMemoryDb, createMockSupabase, createRecorder, installNetworkGuard } from './helpers/payrollMisKit.js';

const kit = vi.hoisted(() => ({ client: null }));
vi.mock('../src/lib/supabase.js', () => ({ supabase: new Proxy({}, { get: (_, k) => kit.client?.[k] }) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => { throw new Error('Real Supabase client blocked in tests'); } }));

const misDb = await import('../src/pages/adminOperations/salaryAdmin/mis/misDb.js');
const { buildR7, depositsByStatute, formatInr } = await import('../src/pages/adminOperations/salaryAdmin/mis/misMetrics.js');

const { A: VA, B: VB, C: VC, Corporate: CORP } = VERTICAL_MAP;
const DEV = deviations(MOCK);
const rec = createRecorder('reports');
const attempts = installNetworkGuard();
const ctx = {};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T11:00:00+05:30`));
  const db = createMemoryDb(MOCK);
  kit.client = createMockSupabase(db, { user: MOCK_USERS.salaryAdmin });
  const months = await misDb.fetchLockedMonths();
  const lockedKeys = months.map((m) => m.month_key).sort();
  const rows = await misDb.fetchSnapshotRows('2025-10', '2026-09');
  const register = await misDb.fetchRegisterTotals('2025-10', '2026-09');
  const rates = await misDb.fetchRates();
  const payments = await misDb.fetchPayments();
  Object.assign(ctx, {
    db, lockedKeys, rows, rates, payments,
    rep: assembleReports(rows, lockedKeys, { type: 'month', month: '2026-09' }, { rates, register }),
    r7: buildR7(payments, TODAY),
  });
});

afterAll(() => {
  rec.write();
  vi.useRealTimers();
});

/** One test per figure: records expected vs actual and asserts. */
function figures(section, list) {
  describe(section, () => {
    it.each(list.map((f) => [f.label, f]))('%s', (_label, f) => {
      const actual = f.get(ctx);
      const dev = f.dev ? DEV[f.dev] : null;
      const target = dev ? dev.used : f.expected;
      rec.check(section, f.label, f.expected, actual, dev ? `Adjusted expected ${typeof dev.used === 'number' ? formatInr(dev.used) : dev.used}: ${dev.why}` : '');
      if (dev) rec.records[rec.records.length - 1].pass = Math.abs(actual - target) < 0.005;
      expect(actual).toEqual(target);
    });
  });
}

const r1 = (k, side) => (c) => c.rep.r1.rows.find((r) => r.key === k)[side];
const drv = (k, f) => (c) => c.rep.r2.drivers.find((d) => d.key === k)[f];
const r3 = (k, side) => (c) => c.rep.r3.rows.find((r) => r.key === k)[side];
const r4 = (v, f) => (c) => c.rep.r4.rows.find((r) => r.vertical === v)[f];
const r5 = (dept, f) => (c) => c.rep.r5.groups.find((g) => g.vertical === VA).departments.find((d) => d.department === dept)[f];
const r6 = (k, f) => (c) => c.rep.r6.rows.find((r) => r.key === k)[f];
const pay = (m, s) => (c) => c.r7.rows.find((r) => r.wage_month === m && r.statute === s);
const otEmp = (code) => (c) => c.rep.r2.drivers.find((d) => d.key === 'ot').employees.find((e) => e.employee_code === code);

figures('Report 1 — Monthly payroll summary (Sep 2026 vs Aug 2026)', [
  ['Headcount', 'headcount', 248, 240], ['Gross earnings', 'gross', 6240000, 6010000],
  ['Total deductions', 'deductions', 871000, 845200], ['Net salary', 'net', 5369000, 5164800],
  ['Employer statutory & provisions', 'employerCost', 777000, 751000], ['Total CTC', 'totalCtc', 7017000, 6761000],
  ['Overtime', 'ot', 210000, 165000],
].flatMap(([label, key, cur, prev]) => [
  { label: `${label} — Sep`, expected: cur, get: r1(key, 'current') },
  { label: `${label} — Aug`, expected: prev, get: r1(key, 'previous') },
]));

figures('Report 2 — Month-on-month variance (Aug → Sep)', [
  ...[['New joiners', 'joiners', 196000, 12], ['Exits', 'exits', -58000, 4], ['Increments', 'increments', 22000, 3],
    ['Overtime', 'ot', 45000, 64], ['Incentives & arrears', 'incentives', 18000, 9], ['Loss of pay', 'lop', -14000, 21],
    ['Other', 'other', 21000, 30]].flatMap(([label, key, amount, count]) => [
    { label: `${label} — amount`, expected: amount, get: drv(key, 'amount') },
    { label: `${label} — employees`, expected: count, get: drv(key, 'count') },
  ]),
  { label: 'Employer cost — amount', expected: 26000, get: drv('employer', 'amount') },
  { label: 'Overtime drill-down MOCK-E0731 Aug', expected: 4200, get: (c) => otEmp('MOCK-E0731')(c)?.previous },
  { label: 'Overtime drill-down MOCK-E0731 Sep', expected: 11800, get: (c) => otEmp('MOCK-E0731')(c)?.current },
  { label: 'Overtime drill-down MOCK-E0688 Aug', expected: 3900, get: (c) => otEmp('MOCK-E0688')(c)?.previous },
  { label: 'Overtime drill-down MOCK-E0688 Sep', expected: 9500, get: (c) => otEmp('MOCK-E0688')(c)?.current },
  { label: 'Overtime drill-down MOCK-E0912 Aug', expected: 0, get: (c) => otEmp('MOCK-E0912')(c)?.previous },
  { label: 'Overtime drill-down MOCK-E0912 Sep', expected: 4100, get: (c) => otEmp('MOCK-E0912')(c)?.current },
  { label: 'Overtime drill-down MOCK-E0912 vertical / dept', expected: `${VB} / Service`, get: (c) => `${otEmp('MOCK-E0912')(c)?.vertical_code} / ${otEmp('MOCK-E0912')(c)?.department}` },
]);

figures('Report 3 — CTC cost summary (Sep / Aug / YTD Apr–Sep)', [
  ['Gross', 'gross', [6240000, 6010000, 35820000], 'R3 Gross YTD'],
  ['Employer PF', 'er_pf', [410000, 396000, 2360000]],
  ['Employer ESI', 'er_esi', [52000, 50500, 302000]],
  ['Employer LWF', 'er_lwf', [0, 0, 6200], 'R3 Employer LWF YTD'],
  ['Gratuity provision', 'gratuity_prov', [150000, 144500, 865000]],
  ['Bonus provision', 'bonus_prov', [105000, 102000, 605000]],
  ['Leave encashment provision (set to 0)', 'leave_encash_prov', [0, 0, 0]],
  ['Insurance', 'insurance', [60000, 58000, 350000]],
  ['Total CTC', 'totalCtc', [7017000, 6761000, 40308200]],
].flatMap(([label, key, [cur, prev, ytd], ytdDev]) => [
  { label: `${label} — Sep`, expected: cur, get: r3(key, 'current') },
  { label: `${label} — Aug`, expected: prev, get: r3(key, 'previous') },
  { label: `${label} — YTD`, expected: ytd, get: r3(key, 'ytd'), dev: ytdDev },
]));

figures('Report 4 — Vertical-wise payroll cost (Sep 2026)', [
  ['A (Manpower)', VA, [96, 2340000, 295000, 2635000, 2510000, 14980000]],
  ['B (AMC)', VB, [72, 1830000, 225000, 2055000, 2010000, 11940000]],
  ['C (Projects)', VC, [58, 1450000, 178000, 1628000, 1605000, 9460000]],
  ['Corporate', CORP, [22, 620000, 79000, 699000, 636000, 3928200]],
].flatMap(([label, v, vals]) => ['headcount', 'gross', 'employerCost', 'totalCtc', 'previousCtc', 'ytdCtc'].map((f, i) => ({
  label: `${label} — ${{ headcount: 'Headcount', gross: 'Gross', employerCost: 'Employer cost', totalCtc: 'Total CTC', previousCtc: 'Aug CTC', ytdCtc: 'YTD CTC' }[f]}`,
  expected: vals[i],
  get: r4(v, f),
}))));

figures('Report 5 — Department-wise (Vertical A, Sep 2026)', [
  ...[['Operations / Field', [58, 1420000, 82000, 4, 1, 1335000]],
    ['Sales & Business Dev.', [14, 510000, 0, 1, 0, 475000]],
    ['Service & Maintenance', [16, 425000, 23000, 0, 0, 420000]],
    ['Admin & Accounts', [8, 280000, 0, 0, 0, 280000]]].flatMap(([dept, vals]) => ['headcount', 'totalCtc', 'ot', 'newHires', 'exits', 'previousCtc'].map((f, i) => ({
    label: `${dept} — ${{ headcount: 'Headcount', totalCtc: 'Total CTC', ot: 'OT', newHires: 'Hires', exits: 'Exits', previousCtc: 'Aug CTC' }[f]}`,
    expected: vals[i],
    get: r5(dept, f),
  }))),
  { label: 'Grand total — Headcount', expected: 248, get: (c) => c.rep.r5.total.headcount },
  { label: 'Grand total — OT', expected: 210000, get: (c) => c.rep.r5.total.ot },
  { label: 'Grand total — Hires', expected: 12, get: (c) => c.rep.r5.total.newHires },
  { label: 'Grand total — Exits', expected: 4, get: (c) => c.rep.r5.total.exits },
]);

figures('Report 6 — Statutory contribution summary (Sep 2026)', [
  { label: 'PF — employees covered', expected: 236, get: r6('PF', 'covered') },
  { label: 'PF — wage base', expected: 3415000, get: r6('PF', 'wageBase'), dev: 'R6 PF wage base' },
  { label: 'PF — employee share', expected: 410000, get: r6('PF', 'employeeShare') },
  { label: 'PF — employer share', expected: 410000, get: r6('PF', 'employerShare') },
  { label: 'PF — total to deposit', expected: 820000, get: r6('PF', 'totalDeposit') },
  { label: 'ESI — employees covered', expected: 98, get: r6('ESI', 'covered') },
  { label: 'ESI — wage base', expected: 1600000, get: r6('ESI', 'wageBase') },
  { label: 'ESI — employee share', expected: 12000, get: r6('ESI', 'employeeShare') },
  { label: 'ESI — employer share', expected: 52000, get: r6('ESI', 'employerShare') },
  { label: 'ESI — total to deposit', expected: 64000, get: r6('ESI', 'totalDeposit') },
  { label: 'PT (Gujarat) — employees covered', expected: 220, get: r6('PT', 'covered') },
  { label: 'PT (Gujarat) — total', expected: 44000, get: r6('PT', 'totalDeposit') },
  { label: 'LWF (Gujarat) — total', expected: 0, get: r6('LWF', 'totalDeposit') },
  { label: 'TDS — employees', expected: 64, get: r6('TDS', 'covered') },
  { label: 'TDS — total', expected: 320000, get: r6('TDS', 'totalDeposit') },
  { label: 'Total — employee share', expected: 786000, get: (c) => c.rep.r6.total.employeeShare },
  { label: 'Total — employer share', expected: 462000, get: (c) => c.rep.r6.total.employerShare },
  { label: 'Total — to deposit', expected: 1248000, get: (c) => c.rep.r6.total.totalDeposit },
  { label: 'Employee-wise tab lists fake UAN numbers', expected: true, get: (c) => c.rep.r6Employees.length > 0 && c.rep.r6Employees.every((e) => /^9999\d{8}$/.test(e.uan_no)) },
  { label: 'Employee-wise tab lists fake ESIC numbers', expected: true, get: (c) => c.rep.r6Employees.every((e) => /^9999\d{6}$/.test(e.esic_no)) },
]);

figures('Report 7 — Compliance tracker (viewed 10 Oct 2026)', [
  { label: 'Sep TDS — due date', expected: '2026-10-07', get: (c) => pay('2026-09', 'TDS')(c).due_date },
  { label: 'Sep TDS — amount', expected: 320000, get: (c) => pay('2026-09', 'TDS')(c).amount },
  { label: 'Sep TDS — paid on', expected: '2026-10-06', get: (c) => pay('2026-09', 'TDS')(c).paid_on },
  { label: 'Sep TDS — challan', expected: 'MOCK-CIN-0510221', get: (c) => pay('2026-09', 'TDS')(c).challan_ref },
  { label: 'Sep TDS — status', expected: 'Paid on time', get: (c) => pay('2026-09', 'TDS')(c).status.label },
  { label: 'Sep PF — due date', expected: '2026-10-15', get: (c) => pay('2026-09', 'PF')(c).due_date },
  { label: 'Sep PF — amount', expected: 820000, get: (c) => pay('2026-09', 'PF')(c).amount },
  { label: 'Sep PF — status', expected: 'Pending', get: (c) => pay('2026-09', 'PF')(c).status.label },
  { label: 'Sep ESI — due date', expected: '2026-10-15', get: (c) => pay('2026-09', 'ESI')(c).due_date },
  { label: 'Sep ESI — amount', expected: 64000, get: (c) => pay('2026-09', 'ESI')(c).amount },
  { label: 'Sep ESI — status', expected: 'Pending', get: (c) => pay('2026-09', 'ESI')(c).status.label },
  { label: 'Sep PT (Gujarat) — due date', expected: '2026-10-15', get: (c) => pay('2026-09', 'PT')(c).due_date },
  { label: 'Sep PT (Gujarat) — amount', expected: 44000, get: (c) => pay('2026-09', 'PT')(c).amount },
  { label: 'Sep PT (Gujarat) — status', expected: 'Pending', get: (c) => pay('2026-09', 'PT')(c).status.label },
  { label: 'Aug PF — due date', expected: '2026-09-15', get: (c) => pay('2026-08', 'PF')(c).due_date },
  { label: 'Aug PF — amount', expected: 792000, get: (c) => pay('2026-08', 'PF')(c).amount },
  { label: 'Aug PF — paid on', expected: '2026-09-18', get: (c) => pay('2026-08', 'PF')(c).paid_on },
  { label: 'Aug PF — challan', expected: 'MOCK-TRRN-102388', get: (c) => pay('2026-08', 'PF')(c).challan_ref },
  { label: 'Aug PF — status', expected: 'Paid late', get: (c) => pay('2026-08', 'PF')(c).status.label },
  { label: 'Aug PF — days late', expected: 3, get: (c) => pay('2026-08', 'PF')(c).status.daysLate },
  { label: 'Aug PF — interest + penalty', expected: 1850, get: (c) => pay('2026-08', 'PF')(c).interestPenalty },
  { label: 'Earlier months — all paid on time', expected: true, get: (c) => c.r7.rows.filter((r) => r.wage_month < '2026-09' && !(r.wage_month === '2026-08' && r.statute === 'PF')).every((r) => r.status.key === 'paid_on_time') },
  { label: 'Tile — Pending', expected: 928000, get: (c) => c.r7.tiles.pendingAmount },
  { label: 'Tile — Overdue', expected: 0, get: (c) => c.r7.tiles.overdueCount },
  { label: 'Tile — Paid late this FY', expected: 1, get: (c) => c.r7.tiles.paidLateThisFy },
  { label: 'Tile — Interest & penalty YTD', expected: 1850, get: (c) => c.r7.tiles.interestPenaltyYtd },
]);

const hires = (c) => c.rep.cur.filter((r) => String(r.date_of_joining).slice(0, 7) === '2026-09');
figures('New-hire summary fixture (for later Report 8)', [
  { label: 'Hires', expected: 12, get: (c) => hires(c).length },
  { label: 'New positions', expected: 9, get: (c) => hires(c).filter((r) => r.position_type === 'new').length },
  { label: 'Replacements', expected: 3, get: (c) => hires(c).filter((r) => r.position_type === 'replacement').length },
  { label: 'Monthly CTC added', expected: 342000, get: (c) => hires(c).reduce((s, r) => s + r.ctc_monthly, 0) },
  { label: 'Paid in Sep', expected: 196000, get: (c) => hires(c).reduce((s, r) => s + r.gross, 0) },
  { label: 'Average new-hire CTC', expected: 28500, get: (c) => hires(c).reduce((s, r) => s + r.ctc_monthly, 0) / hires(c).length },
  {
    label: 'Hires without budget',
    expected: 0,
    get: (c) => {
      const budget = c.db.tables.admin_payroll_budget.filter((b) => b.month_key === '2026-09');
      return budget.reduce((n, b) => {
        const hc = c.rep.r4.rows.find((r) => r.vertical === b.vertical_code)?.headcount || 0;
        const vHires = hires(c).filter((r) => r.vertical_code === b.vertical_code).length;
        return n + Math.min(vHires, Math.max(0, hc - b.budget_headcount));
      }, 0);
    },
  },
]);

describe('Cross-report tie-outs', () => {
  const tie = (label, a, b) => {
    rec.check('Cross-report tie-outs', label, a, b);
    expect(b).toEqual(a);
  };
  it('R1 = R3 = R4 = R5 Total CTC (Sep and Aug)', () => {
    const { r1: s1, r3: s3, r4: s4, r5: s5 } = ctx.rep;
    const cur = s1.rows.find((r) => r.key === 'totalCtc').current;
    tie('R1 = R3 Total CTC (Sep)', cur, s3.rows.find((r) => r.key === 'totalCtc').current);
    tie('R1 = R4 Total CTC (Sep)', cur, s4.total.totalCtc);
    tie('R1 = R5 Total CTC (Sep)', cur, s5.total.totalCtc);
    tie('R1 = R4 Total CTC (Aug)', s1.rows.find((r) => r.key === 'totalCtc').previous, s4.total.previousCtc);
  });
  it('R4 rows = R5 vertical subtotals', () => {
    for (const g of ctx.rep.r5.groups) {
      const row = ctx.rep.r4.rows.find((r) => r.vertical === g.vertical);
      tie(`R4 = R5 ${g.label} CTC`, row.totalCtc, g.subtotal.totalCtc);
      tie(`R4 = R5 ${g.label} headcount`, row.headcount, g.subtotal.headcount);
    }
  });
  it('R2 previous + drivers = current, and the publish check passes', () => {
    const { r2 } = ctx.rep;
    tie('R2 Aug CTC + drivers = Sep CTC', r2.currentCtc, r2.drivers.reduce((s, d) => s + d.amount, r2.previousCtc));
    tie('R2 publish check difference', 0, r2.check.diff);
  });
  it('R2 new joiners = new-hire "paid in Sep"', () => {
    tie('R2 joiners = new-hire paid in Sep', ctx.rep.r2.drivers.find((d) => d.key === 'joiners').amount, hires(ctx).reduce((s, r) => s + r.gross, 0));
  });
  it('R3 YTD = R4 YTD', () => {
    tie('R3 YTD = R4 YTD', ctx.rep.r3.rows.find((r) => r.key === 'totalCtc').ytd, ctx.rep.r4.total.ytdCtc);
  });
  it('R6 per statute = R7 Sep amounts', () => {
    const dep = depositsByStatute(ctx.rep.cur);
    for (const s of ['PF', 'ESI', 'PT', 'TDS']) tie(`R6 ${s} = R7 Sep ${s}`, dep[s], pay('2026-09', s)(ctx).amount);
  });
  it('R6 employer PF / ESI = R3', () => {
    tie('R6 employer PF = R3 employer PF', ctx.rep.r3.rows.find((r) => r.key === 'er_pf').current, r6('PF', 'employerShare')(ctx));
    tie('R6 employer ESI = R3 employer ESI', ctx.rep.r3.rows.find((r) => r.key === 'er_esi').current, r6('ESI', 'employerShare')(ctx));
  });
  it('R7 tiles = sum of the rows', () => {
    const unpaid = ctx.r7.rows.filter((r) => !r.paid_on).reduce((s, r) => s + r.amount, 0);
    tie('R7 Pending tile = unpaid rows', unpaid, ctx.r7.tiles.pendingAmount);
  });
  it('R1 totals tie to the salary register (downloads allowed)', () => {
    tie('Register tie-out OK', true, ctx.rep.tieOut.ok);
  });
});

describe('No side effects', () => {
  it('made no network call (fetch / XHR / WebSocket / real Supabase client)', () => {
    rec.check('No side effects', 'Network calls attempted', 0, attempts.length);
    expect(attempts).toEqual([]);
  });
  it('every Supabase call was answered by the in-memory stand-in', () => {
    const calls = kit.client.calls;
    rec.check('No side effects', 'Mocked Supabase calls recorded (all in memory)', true, calls.length > 0);
    expect(calls.length).toBeGreaterThan(0);
  });
});
