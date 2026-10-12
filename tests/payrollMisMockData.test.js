/**
 * Payroll MIS mock data — end-to-end check of scripts/mis-mock/*.sql in an in-memory Postgres (PGlite).
 * Seeds the mock data through the real lock flow + after-lock snapshot trigger, rebuilds all 7 reports from
 * the database exactly as the app reads them, and compares every sample figure. Prints a pass / fail table.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLEANUP_SQL, createMockDb, dumpTables, EXTRAS_SQL, loadRealData, readReportData, rowCounts, runScript, SEED_SQL,
  setSession, VERTICAL_HEAD,
} from '../scripts/mis-mock/harness.mjs';
import { buildMockModel } from '../scripts/mis-mock/model.mjs';
import {
  applyFilters, buildPfBreakup, buildR1, buildR2, buildR3, buildR4, buildR5, buildR6, buildR6Employees, buildR7,
  buildTrend, depositsByStatute, formatChangePct, formatInr, formatSharePct, periodMonths, registerTieOut,
  resolvePeriod, rowsForMonths, totals, UNASSIGNED,
} from '../src/pages/adminOperations/salaryAdmin/mis/misMetrics.js';
import { r1Spec, r2Spec, r3Spec, r4Spec, r5Spec, r6Spec, r7Spec } from '../src/pages/adminOperations/salaryAdmin/mis/misReportSpecs.js';
import { exportReportExcel, exportReportPdf, reportCsvText, reportHeaderLines } from '../src/pages/adminOperations/salaryAdmin/mis/misExport.js';

const TODAY = '2026-10-10';
const FY_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const model = buildMockModel();
const LWF_JUNE = model.lines['2026-06'].length * 12;
const PF_WAGE_SEP = model.lines['2026-09'].filter((l) => l.emp_pf > 0).reduce((s, l) => s + l.pf_wage, 0) / 100;

/** Figures the mock cannot reproduce exactly (explained in scripts/mis-mock/README.md). */
const BY_DESIGN = {
  'Report 3 Gross YTD': { value: 35820000 + 6200 - LWF_JUNE, why: `LWF YTD is ${LWF_JUNE} (12 × ${LWF_JUNE / 12} employees in June), not 6,200; the difference sits in gross so Total CTC YTD and every vertical YTD stay exact` },
  'Report 3 Employer LWF YTD': { value: LWF_JUNE, why: 'Gujarat LWF employer ₹12 × June headcount; 6,200 would need 517 employees' },
  'Report 6 PF wage base': { value: PF_WAGE_SEP, why: 'each PF wage is the smallest whole-rupee wage giving exactly 12 %, so PF contributions stay exact at 4,10,000' },
};

const results = [];
const record = (report, label, expected, actual) => {
  const key = `${report} ${label}`;
  const equal = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : a === b);
  let status = equal(actual, expected) ? 'PASS' : 'FAIL';
  let note = '';
  if (status === 'FAIL' && BY_DESIGN[key] && equal(actual, BY_DESIGN[key].value)) {
    status = 'DIFF (by design)';
    note = BY_DESIGN[key].why;
  }
  results.push({ report, figure: label, expected, actual, status, note });
  return status;
};

let db;
let data;
let budget;
let before;
let refusal;
let seedError;
const captured = [];

beforeAll(async () => {
  db = await createMockDb();
  await loadRealData(db);
  before = await dumpTables(db);
  await setSession(db, { full: false });
  refusal = await runScript(db, SEED_SQL);
  // SQL editor case: no signed-in Salary Admin, so locks go through the guarded update.
  await setSession(db, { full: false, confirm: 'not-production' });
  seedError = await runScript(db, SEED_SQL);
  await setSession(db, { full: true });
  data = await readReportData(db);
  budget = (await db.query('SELECT to_jsonb(b) AS j FROM public.admin_payroll_budget b')).rows.map((r) => r.j);

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
}, 120000);

afterAll(() => {
  for (const r of [...new Set(results.map((x) => x.report))]) {
    console.log(`\n${r}`);
    console.table(results.filter((x) => x.report === r).map(({ figure, expected, actual, status, note }) => ({ figure, expected, actual, status, note })));
  }
  const summary = results.reduce((acc, x) => ({ ...acc, [x.status]: (acc[x.status] || 0) + 1 }), {});
  console.log('\nMock data figure check:', JSON.stringify(summary));
});

describe('Payroll MIS mock data — seed safety', () => {
  it('refuses to run without the not-production confirmation and changes nothing', async () => {
    expect(refusal).toMatch(/Refusing to seed/);
    await setSession(db, { full: true });
  });

  it('seeds without errors through the lock flow', () => {
    expect(seedError).toBeNull();
    expect(data.rows.length).toBeGreaterThan(2800);
  });

  it('never fires the employee-code triggers (leave, hierarchy, login sync) for mock employees', async () => {
    const r = await db.query("SELECT count(*)::int AS n FROM public.mock_code_side_effects WHERE employee_code ILIKE 'MOCK%'");
    expect(r.rows[0].n).toBe(0);
  });

  it('marks every mock row (codes, names, fake UAN / ESIC, registry)', async () => {
    const emps = (await db.query("SELECT employee_id, full_name, uan_no, esic_no FROM public.admin_ifsp_employee_master WHERE employee_id ILIKE 'MOCK-%'")).rows;
    expect(emps.length).toBe(252);
    expect(emps.every((e) => /^MOCK-E\d{4}$/.test(e.employee_id) && /^Mock Employee \d{3}$/.test(e.full_name))).toBe(true);
    expect(emps.every((e) => (e.uan_no == null || /^9999\d{8}$/.test(e.uan_no)) && (e.esic_no == null || /^9999\d{6}$/.test(e.esic_no)))).toBe(true);
    for (const c of ['MOCK-E0731', 'MOCK-E0688', 'MOCK-E0912']) expect(emps.some((e) => e.employee_id === c)).toBe(true);
    const reg = (await db.query('SELECT table_name, count(*)::int AS n FROM public.mis_mock_registry GROUP BY 1 ORDER BY 1')).rows;
    const n = Object.fromEntries(reg.map((r) => [r.table_name, r.n]));
    expect(n.admin_ifsp_employee_master).toBe(252);
    expect(n.admin_salary_month_runs).toBe(13);
    const states = (await db.query("SELECT DISTINCT work_state FROM public.admin_payroll_employee_tags t JOIN public.admin_ifsp_employee_master m ON m.id = t.employee_master_id WHERE m.employee_id ILIKE 'MOCK-%'")).rows;
    expect(states).toEqual([{ work_state: 'Gujarat' }]);
  });
});

describe('Payroll MIS mock data — sample figures (Sep 2026 vs Aug 2026, YTD Apr–Sep 2026)', () => {
  const sep = () => rowsForMonths(data.rows, ['2026-09']);
  const aug = () => rowsForMonths(data.rows, ['2026-08']);
  const ytd = () => rowsForMonths(data.rows, FY_MONTHS);

  it('Report 1 — Monthly payroll summary', () => {
    const r1 = buildR1(sep(), aug());
    const m = (k) => r1.rows.find((r) => r.key === k);
    const exp = {
      headcount: [248, 240], gross: [6240000, 6010000], deductions: [871000, 845200], net: [5369000, 5164800],
      employerCost: [777000, 751000], totalCtc: [7017000, 6761000], ot: [210000, 165000],
    };
    for (const [k, [c, p]] of Object.entries(exp)) {
      record('Report 1', `${m(k).label} — Sep`, c, m(k).current);
      record('Report 1', `${m(k).label} — Aug`, p, m(k).previous);
    }
    record('Report 1', 'Average CTC — Sep', '28,294', formatInr(m('avgCtc').current));
    record('Report 1', 'Average CTC — Aug', '28,171', formatInr(m('avgCtc').previous));
    record('Report 1', 'Total CTC change %', '+3.8%', formatChangePct(m('totalCtc').changePct));
    record('Report 1', 'Overtime change %', '+27.3%', formatChangePct(m('ot').changePct));
    record('Report 1', 'Overtime colour', 'bad', m('ot').tone);
    const reg = registerTieOut(sep(), data.register.filter((x) => x.month_key === '2026-09'));
    record('Report 1', 'Salary register tie-out (Sep)', true, reg.ok && reg.warnings.length === 0);
    const trend = buildTrend(data.rows, data.months.map((x) => x.month_key), '2026-09');
    record('Report 1', '12-month trend months', 12, trend.length);
  });

  it('Report 2 — Month-on-month variance and drill-downs', () => {
    const r2 = buildR2(sep(), aug(), '2026-09', '2026-08');
    const d = Object.fromEntries(r2.drivers.map((x) => [x.key, x]));
    record('Report 2', 'Previous Total CTC', 6761000, r2.previousCtc);
    record('Report 2', 'Current Total CTC', 7017000, r2.currentCtc);
    const exp = { joiners: [196000, 12], exits: [-58000, 4], increments: [22000, 3], ot: [45000, 64], incentives: [18000, 9], lop: [-14000, 21], other: [21000, 30] };
    for (const [k, [amt, cnt]] of Object.entries(exp)) {
      record('Report 2', `${d[k].label} — amount`, amt, d[k].amount);
      record('Report 2', `${d[k].label} — employees`, cnt, d[k].count);
    }
    record('Report 2', 'Employer contributions', 26000, d.employer.amount);
    record('Report 2', 'Shares of change', '77% −23% 9% 18% 7% −5% 8% 10%', r2.drivers.map((x) => formatSharePct(x.share)).join(' '));
    record('Report 2', 'Drivers add up (difference)', 0, r2.check.diff);
    const ot = (c) => d.ot.employees.find((e) => e.employee_code === c);
    record('Report 2', 'OT drill-down MOCK-E0731', '4200 → 11800', `${ot('MOCK-E0731')?.previous} → ${ot('MOCK-E0731')?.current}`);
    record('Report 2', 'OT drill-down MOCK-E0688', '3900 → 9500', `${ot('MOCK-E0688')?.previous} → ${ot('MOCK-E0688')?.current}`);
    record('Report 2', 'OT drill-down MOCK-E0912', '0 → 4100 (B, Service)', `${ot('MOCK-E0912')?.previous} → ${ot('MOCK-E0912')?.current} (${ot('MOCK-E0912')?.vertical_code === 'amc' ? 'B' : ot('MOCK-E0912')?.vertical_code}, ${ot('MOCK-E0912')?.department})`);
    const joinerGross = d.joiners.employees.reduce((s, e) => s + e.current, 0);
    record('Report 2', 'Joiners — gross paid in Sep', 196000, joinerGross);
  });

  it('Report 3 — CTC cost summary', () => {
    const r3 = buildR3(sep(), aug(), ytd());
    const row = (k) => r3.rows.find((r) => r.key === k);
    const exp = {
      gross: [6240000, 6010000, 35820000, 88.9], er_pf: [410000, 396000, 2360000, 5.9], er_esi: [52000, 50500, 302000, 0.7],
      er_lwf: [0, 0, 6200, 0], gratuity_prov: [150000, 144500, 865000, 2.1], bonus_prov: [105000, 102000, 605000, 1.5],
      leave_encash_prov: [0, 0, 0, 0], insurance: [60000, 58000, 350000, 0.9], totalCtc: [7017000, 6761000, 40308200, 100],
    };
    const names = { gross: 'Gross', er_pf: 'Employer PF', er_esi: 'Employer ESI', er_lwf: 'Employer LWF', gratuity_prov: 'Gratuity', bonus_prov: 'Bonus / ex-gratia', leave_encash_prov: 'Leave encashment', insurance: 'Insurance', totalCtc: 'Total CTC' };
    for (const [k, [c, p, y, pct]] of Object.entries(exp)) {
      record('Report 3', `${names[k]} — Sep`, c, row(k).current);
      record('Report 3', `${names[k]} — Aug`, p, row(k).previous);
      record('Report 3', `${names[k]} YTD`, y, row(k).ytd);
      record('Report 3', `${names[k]} % of CTC`, pct, row(k).pctOfCtc);
    }
  });

  it('Report 4 — Vertical-wise payroll cost', () => {
    const r4 = buildR4(sep(), aug(), ytd(), data.allocations);
    const exp = {
      manpower: ['A', 96, 2340000, 295000, 2635000, 37.6, 2510000, 5.0, 14980000],
      amc: ['B', 72, 1830000, 225000, 2055000, 29.3, 2010000, 2.2, 11940000],
      projects: ['C', 58, 1450000, 178000, 1628000, 23.2, 1605000, 1.4, 9460000],
      corporate: ['Corporate', 22, 620000, 79000, 699000, 10.0, 636000, 9.9, 3928200],
    };
    const keys = ['headcount', 'gross', 'employerCost', 'totalCtc', 'pctOfTotal', 'previousCtc', 'changePct', 'ytdCtc'];
    for (const [v, [label, ...vals]] of Object.entries(exp)) {
      const row = r4.rows.find((r) => r.vertical === v);
      keys.forEach((k, i) => record('Report 4', `Vertical ${label} — ${k}`, vals[i], row?.[k]));
    }
    record('Report 4', 'Total — headcount', 248, r4.total.headcount);
    record('Report 4', 'Total — Total CTC', 7017000, r4.total.totalCtc);
    record('Report 4', 'Total — YTD', 40308200, r4.total.ytdCtc);
    record('Report 4', 'Unassigned row shown', false, r4.hasUnassigned);
    const split = buildR4(sep(), aug(), ytd(), data.allocations, { split: true });
    record('Report 4', 'Split view keeps the total (50/50 A/B employee)', 7017000, split.total.totalCtc);
    record('Report 4', 'Split view — Vertical A headcount', 95.5, split.rows.find((r) => r.vertical === 'manpower').headcount);
  });

  it('Report 5 — Department-wise payroll cost (Vertical A) and tie-outs', () => {
    const r5 = buildR5(sep(), aug(), { from: '2026-09', to: '2026-09' }, data.allocations);
    const r4 = buildR4(sep(), aug(), ytd(), data.allocations);
    const a = r5.groups.find((g) => g.vertical === 'manpower');
    const dep = (n) => a.departments.find((x) => x.department === n);
    const exp = {
      'Operations / Field': [58, 1420000, '24,483', 82000, 4, 1, 1335000, 6.4],
      'Sales & Business Dev.': [14, 510000, '36,429', 0, 1, 0, 475000, 7.4],
      'Service & Maintenance': [16, 425000, '26,563', 23000, 0, 0, 420000, 1.2],
      'Admin & Accounts': [8, 280000, '35,000', 0, 0, 0, 280000, 0],
    };
    const keys = ['headcount', 'totalCtc', 'avgCtc', 'ot', 'newHires', 'exits', 'previousCtc', 'changePct'];
    for (const [name, vals] of Object.entries(exp)) {
      const row = dep(name);
      keys.forEach((k, i) => record('Report 5', `${name} — ${k}`, vals[i], k === 'avgCtc' ? formatInr(row?.avgCtc) : row?.[k]));
    }
    record('Report 5', 'Vertical A subtotal — Total CTC', 2635000, a.subtotal.totalCtc);
    record('Report 5', 'Vertical A subtotal — OT', 105000, a.subtotal.ot);
    record('Report 5', 'Vertical A subtotal — hires / exits', '5 / 1', `${a.subtotal.newHires} / ${a.subtotal.exits}`);
    record('Report 5', 'Vertical A subtotal — average CTC', '27,448', formatInr(a.subtotal.avgCtc));
    record('Report 5', 'Grand total — hires / exits', '12 / 4', `${r5.total.newHires} / ${r5.total.exits}`);
    const tie = r5.groups.every((g) => {
      const row = r4.rows.find((r) => r.vertical === g.vertical);
      return row && g.subtotal.totalCtc === row.totalCtc && g.subtotal.headcount === row.headcount;
    });
    record('Report 5', 'Every vertical subtotal = Report 4 row', true, tie);
    const hires = sep().filter((r) => String(r.date_of_joining).startsWith('2026-09'));
    record('Report 5', 'New hires — new / replacement', '9 / 3', `${hires.filter((r) => r.position_type === 'new').length} / ${hires.filter((r) => r.position_type === 'replacement').length}`);
    const ctcAdded = hires.reduce((s, r) => s + Number(r.ctc_monthly), 0);
    record('Report 5', 'New hires — CTC added (monthly)', 342000, ctcAdded);
    record('Report 5', 'New hires — average CTC', 28500, ctcAdded / hires.length);
    record('Report 5', 'New hires — gross paid in Sep', 196000, totals(hires).gross);
    const over = budget.filter((b) => b.month_key === '2026-09' && Number(b.budget_headcount)
      < rowsForMonths(data.rows, ['2026-09']).filter((r) => r.vertical_code === b.vertical_code && Number(r.paid_days) > 0).length);
    record('Report 5', 'New hires without budget (Sep)', 0, over.length);
  });

  it('Report 6 — Statutory contribution summary', () => {
    const r6 = buildR6(sep(), aug());
    const r3 = buildR3(sep(), aug(), ytd());
    const s = (k) => r6.rows.find((r) => r.key === k);
    record('Report 6', 'PF covered', 236, s('PF').covered);
    record('Report 6', 'PF wage base', 3415000, s('PF').wageBase);
    record('Report 6', 'PF employee / employer', '410000 / 410000', `${s('PF').employeeShare} / ${s('PF').employerShare}`);
    record('Report 6', 'PF total deposit', 820000, s('PF').totalDeposit);
    record('Report 6', 'PF employer change %', '+3.5%', formatChangePct(s('PF').employerChangePct));
    record('Report 6', 'ESI covered', 98, s('ESI').covered);
    record('Report 6', 'ESI wage base', 1600000, s('ESI').wageBase);
    record('Report 6', 'ESI employee / employer', '12000 / 52000', `${s('ESI').employeeShare} / ${s('ESI').employerShare}`);
    record('Report 6', 'ESI employer change %', '+3.0%', formatChangePct(s('ESI').employerChangePct));
    record('Report 6', 'PT covered / amount', '220 / 44000', `${s('PT').covered} / ${s('PT').employeeShare}`);
    record('Report 6', 'LWF (Sep)', 0, s('LWF').totalDeposit);
    record('Report 6', 'TDS covered / amount', '64 / 320000', `${s('TDS').covered} / ${s('TDS').employeeShare}`);
    record('Report 6', 'Total deposit', 1248000, r6.total.totalDeposit);
    record('Report 6', 'Employer PF = Report 3', true, s('PF').employerShare === r3.rows.find((r) => r.key === 'er_pf').current);
    const pf = buildPfBreakup(sep(), data.rates, '2026-09');
    record('Report 6', 'PF breakup — EPS + EPF employer = 12 % of wages', true, Math.abs(pf.lines.find((l) => l.key === 'eps').amount + pf.lines.find((l) => l.key === 'epf_er').amount - Math.round(PF_WAGE_SEP * 12) / 100) < 1);
    results.push({ report: 'Report 6', figure: 'PF rounding gap (payroll employer PF − rate master incl. EDLI + admin)', expected: '(reported)', actual: pf.difference, status: 'INFO', note: 'EDLI 0.5 % and admin 0.5 % are not in payroll employer PF' });
    record('Report 6', 'Employee tab rows (Sep)', true, buildR6Employees(sep()).length >= 236);
  });

  it('Report 7 — Compliance due dates and payments (viewed on 10 Oct 2026)', () => {
    const r7 = buildR7(data.payments, TODAY);
    const st = (m, s) => r7.rows.find((r) => r.wage_month === m && r.statute === s);
    const dep = depositsByStatute(sep());
    record('Report 7', 'Sep TDS', 'paid_on_time 320000 MOCK-CIN-0510221', `${st('2026-09', 'TDS')?.status.key} ${Number(st('2026-09', 'TDS')?.amount)} ${st('2026-09', 'TDS')?.challan_ref}`);
    record('Report 7', 'Sep PF', 'pending 820000 due 2026-10-15', `${st('2026-09', 'PF')?.status.key} ${Number(st('2026-09', 'PF')?.amount)} due ${st('2026-09', 'PF')?.due_date}`);
    record('Report 7', 'Sep ESI', 'pending 64000 due 2026-10-15', `${st('2026-09', 'ESI')?.status.key} ${Number(st('2026-09', 'ESI')?.amount)} due ${st('2026-09', 'ESI')?.due_date}`);
    record('Report 7', 'Sep PT (Gujarat)', 'pending 44000 due 2026-10-15', `${st('2026-09', 'PT')?.status.key} ${Number(st('2026-09', 'PT')?.amount)} due ${st('2026-09', 'PT')?.due_date}`);
    record('Report 7', 'Aug PF', 'paid_late 3 days, 792000, 1850', `${st('2026-08', 'PF')?.status.key} ${st('2026-08', 'PF')?.status.daysLate} days, ${Number(st('2026-08', 'PF')?.amount)}, ${st('2026-08', 'PF')?.interestPenalty}`);
    record('Report 7', 'Jun LWF due date (Gujarat)', '2026-07-15', st('2026-06', 'LWF')?.due_date);
    record('Report 7', 'Sep deposits = Report 6', true, ['PF', 'ESI', 'PT', 'TDS'].every((k) => Number(st('2026-09', k)?.amount) === dep[k]));
    record('Report 7', 'Tile — Pending', 928000, r7.tiles.pendingAmount);
    record('Report 7', 'Tile — Overdue', 0, r7.tiles.overdueCount);
    record('Report 7', 'Tile — Paid late this FY', 1, r7.tiles.paidLateThisFy);
    record('Report 7', 'Tile — Interest & penalty', 1850, r7.tiles.interestPenaltyYtd);
    const dup = data.payments.length === new Set(data.payments.map((p) => `${p.wage_month}|${p.statute}|${p.state}`)).size;
    record('Report 7', 'One row per month / statute / state', true, dup);
  });

  it('prints the table and has no unexpected failures', () => {
    const failures = results.filter((x) => x.status === 'FAIL');
    expect(failures).toEqual([]);
  });
});

describe('Payroll MIS mock data — behaviour checks', () => {
  it('Draft Oct 2026 never appears; locked months are Oct 2025 – Sep 2026', () => {
    const months = data.months.map((m) => m.month_key);
    expect(months).not.toContain('2026-10');
    for (const mk of ['2025-10', '2026-03', '2026-09']) expect(months).toContain(mk);
    expect(data.rows.some((r) => r.month_key === '2026-10')).toBe(false);
  });

  it('re-locking Jul 2026 replaced the snapshot without duplicates', async () => {
    const jul = data.months.find((m) => m.month_key === '2026-07');
    expect(jul.snapshot_count).toBe(jul.line_count);
    const jobs = (await db.query("SELECT count(*)::int AS n FROM public.admin_payroll_mis_job_log WHERE month_key = '2026-07' AND ok")).rows[0].n;
    expect(jobs).toBe(2);
    const hist = (await db.query("SELECT summary_json -> 'lock_history' AS h FROM public.admin_salary_month_runs WHERE month_key = '2026-07'")).rows[0].h;
    expect(hist.map((x) => x.action)).toEqual(['lock', 'unlock', 'lock']);
    const pay = data.payments.filter((p) => p.wage_month === '2026-07');
    expect(pay.length).toBe(new Set(pay.map((p) => p.statute)).size);
  });

  it('a payment cannot be marked paid without a challan reference and paid-on date', async () => {
    const id = data.payments.find((p) => p.wage_month === '2026-09' && p.statute === 'PF').id;
    await expect(db.query("UPDATE public.admin_payroll_statutory_payments SET paid_on = '2026-10-09' WHERE id = $1", [id])).rejects.toThrow(/paid_needs_challan/);
    await expect(db.query("SELECT public.admin_payroll_mis_mark_paid($1, NULL, 'X-1')", [id])).rejects.toThrow(/paid-on date and the challan/);
    await expect(db.query("SELECT public.admin_payroll_mis_mark_paid($1, '2026-10-09', '  ')", [id])).rejects.toThrow(/paid-on date and the challan/);
  });

  it('filters and periods work on the mock data', () => {
    const paid = rowsForMonths(data.rows, ['2026-09']).filter((r) => Number(r.paid_days) > 0);
    expect(applyFilters(paid, { vertical: 'manpower' }).length).toBe(96);
    expect(applyFilters(paid, { department: 'Operations / Field' }).length).toBe(58);
    expect(applyFilters(paid, { costCentre: 'CC-B' }).length).toBe(72);
    for (const location of ['Vadodara', 'Ahmedabad', 'Surat', 'Rajkot']) expect(applyFilters(paid, { location }).length).toBeGreaterThan(0);
    for (const grade of ['G1', 'G2', 'G3', 'G4']) expect(applyFilters(paid, { grade }).length).toBeGreaterThan(0);
    for (const employmentType of ['permanent', 'probation', 'contract']) expect(applyFilters(paid, { employmentType }).length).toBeGreaterThan(0);
    const locked = data.months.map((m) => m.month_key);
    expect(periodMonths({ type: 'quarter', fy: 2026, quarter: 2 }, locked).current).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(periodMonths({ type: 'quarter', fy: 2026, quarter: 2 }, locked).previous).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(periodMonths({ type: 'ytd', month: '2026-09' }, locked).current).toEqual(FY_MONTHS);
    expect(periodMonths({ type: 'fy', fy: 2025 }, locked).current.filter((mk) => mk >= '2025-10'))
      .toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    expect(resolvePeriod({ type: 'range', from: '2026-05', to: '2026-07' })).toMatchObject({ from: '2026-05', to: '2026-07' });
  });

  it('downloads (Excel, PDF, CSV) carry the report header', async () => {
    const sep = rowsForMonths(data.rows, ['2026-09']);
    const aug = rowsForMonths(data.rows, ['2026-08']);
    const header = { company: 'Indus Fire Safety Pvt. Ltd.', report: 'Monthly Payroll Summary', period: 'Sep 2026', filters: 'None', generatedOn: '10 Oct 2026', generatedBy: 'mock tester' };
    const labels = { current: 'Sep 2026', previous: 'Aug 2026' };
    const csv = reportCsvText(r1Spec(buildR1(sep, aug), labels), header);
    for (const [k, v] of reportHeaderLines(header)) expect(csv).toContain(`${k},${v}`);
    expect(csv).toContain('7017000');
    const specs = [
      r1Spec(buildR1(sep, aug), labels),
      r2Spec(buildR2(sep, aug, '2026-09', '2026-08'), labels),
      r3Spec(buildR3(sep, aug, rowsForMonths(data.rows, FY_MONTHS)), { ...labels, ytd: 'YTD' }),
      r4Spec(buildR4(sep, aug, rowsForMonths(data.rows, FY_MONTHS), data.allocations), { ...labels, ytd: 'YTD' }),
      r5Spec(buildR5(sep, aug, { from: '2026-09', to: '2026-09' }, data.allocations), labels),
      r6Spec(buildR6(sep, aug), buildR6Employees(sep), buildPfBreakup(sep, data.rates, '2026-09')),
      r7Spec(buildR7(data.payments, TODAY)),
    ];
    captured.length = 0;
    for (const spec of specs) {
      expect(reportCsvText(spec, header).length).toBeGreaterThan(200);
      await exportReportExcel(spec, header);
      exportReportPdf(spec, header);
    }
    expect(captured.length).toBe(14);
    expect(captured.every((b) => b.size > 1000)).toBe(true);
  });

  it('report views and downloads are logged', async () => {
    await setSession(db, { full: true, uid: null, email: 'mock.tester@example.test' });
    await db.query("SELECT public.admin_payroll_mis_log('r1', 'download', 'xlsx', '{\"type\":\"month\",\"month\":\"2026-09\"}'::jsonb, '{}'::jsonb)");
    await db.query("SELECT public.admin_payroll_mis_log('r2', 'view', NULL, '{\"type\":\"month\",\"month\":\"2026-09\"}'::jsonb, NULL)");
    const n = (await db.query("SELECT count(*)::int AS n FROM public.admin_payroll_mis_audit_log WHERE user_email = 'mock.tester@example.test'")).rows[0].n;
    expect(n).toBe(2);
    await setSession(db, { full: true });
  });

  it('the placeholder vertical head sees only Vertical A rows', async () => {
    await setSession(db, { full: false, uid: VERTICAL_HEAD.id, email: VERTICAL_HEAD.email });
    const scoped = await readReportData(db, '2026-09', '2026-09');
    await setSession(db, { full: true });
    expect(scoped.rows.length).toBe(97);
    expect(scoped.rows.every((r) => r.vertical_code === 'manpower')).toBe(true);
    expect(scoped.register).toEqual([]);
    expect(totals(scoped.rows).totalCtc).toBe(2635000);
  });

  it('running the seed again changes nothing', async () => {
    const countsBefore = await rowCounts(db);
    await setSession(db, { full: true, confirm: 'not-production' });
    expect(await runScript(db, SEED_SQL)).toBeNull();
    await setSession(db, { full: true });
    expect(await rowCounts(db)).toEqual(countsBefore);
  });

  it('extras: Unassigned employee appears; due-soon and overdue rows get their status', async () => {
    await setSession(db, { full: true, confirm: 'not-production' });
    expect(await runScript(db, EXTRAS_SQL)).toBeNull();
    expect(await runScript(db, EXTRAS_SQL)).toBeNull();
    await setSession(db, { full: true });
    const d = await readReportData(db);
    const sep = rowsForMonths(d.rows, ['2026-09']);
    const r4 = buildR4(sep, rowsForMonths(d.rows, ['2026-08']), [], d.allocations);
    expect(r4.hasUnassigned).toBe(true);
    expect(r4.rows.find((r) => r.vertical === UNASSIGNED)).toMatchObject({ headcount: 1, totalCtc: 25000 + 1500 + 375 + 250 });
    const today = new Date().toISOString().slice(0, 10);
    const r7 = buildR7(d.payments, today);
    expect(r7.rows.find((r) => r.wage_month === '2026-10' && r.statute === 'TDS').status.key).toBe('due_soon');
    expect(r7.rows.find((r) => r.wage_month === '2026-10' && r.statute === 'PF').status.key).toBe('overdue');
    expect(r7.rows.find((r) => r.wage_month === '2026-09' && r.statute === 'TDS').status.key).toBe('paid_on_time');
    const sepRows = d.payments.filter((p) => p.wage_month === '2026-09');
    expect(sepRows.length).toBe(new Set(sepRows.map((p) => p.statute)).size);
  });

  it('cleanup restores every table exactly (twice is safe)', async () => {
    expect(await runScript(db, CLEANUP_SQL)).toBeNull();
    expect(await dumpTables(db)).toEqual(before);
    expect(await runScript(db, CLEANUP_SQL)).toBeNull();
    expect(await dumpTables(db)).toEqual(before);
    const reg = await db.query("SELECT to_regclass('public.mis_mock_registry') AS r");
    expect(reg.rows[0].r).toBeNull();
  });

  it('seeding with a signed-in Salary Admin (real lock function) gives the same figures, then cleans up', async () => {
    await setSession(db, { full: true, confirm: 'not-production' });
    expect(await runScript(db, SEED_SQL)).toBeNull();
    await setSession(db, { full: true });
    const d = await readReportData(db);
    const r1 = buildR1(rowsForMonths(d.rows, ['2026-09']), rowsForMonths(d.rows, ['2026-08']));
    expect(r1.current.totalCtc).toBe(7017000);
    expect(r1.previous.totalCtc).toBe(6761000);
    expect(buildR4(rowsForMonths(d.rows, ['2026-09']), [], rowsForMonths(d.rows, FY_MONTHS), d.allocations).total.ytdCtc).toBe(40308200);
    expect(await runScript(db, CLEANUP_SQL)).toBeNull();
    expect(await dumpTables(db)).toEqual(before);
  });
});
