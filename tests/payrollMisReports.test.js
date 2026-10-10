import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  buildPfBreakup,
  buildR1,
  buildR2,
  buildR3,
  buildR4,
  buildR5,
  buildR6,
  buildR7,
  buildTrend,
  changePct,
  depositsByStatute,
  formatChangePct,
  formatInr,
  formatSharePct,
  paymentStatus,
  periodMonths,
  registerTieOut,
  resolvePeriod,
  round2,
  rowsForMonths,
  splitByAllocation,
  totals,
  waterfallData,
} from '../src/pages/adminOperations/salaryAdmin/mis/misMetrics.js';

// ---------------------------------------------------------------------------
// Sample fixture: employee-level Sep 2026 / Aug 2026 rows (plus one Apr–Jul block for YTD)
// built so every report reproduces the figures in docs/PROMPT_payroll_mis_7_reports.md.
// ---------------------------------------------------------------------------
function spread(total, n) {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => {
    const extra = rem === 0 ? 0 : Math.sign(rem);
    rem -= extra;
    return base + extra;
  });
}

const EXIT_PREV_GROSS = 14500;
const f8 = (v) => Math.round(v * 1e8) / 1e8;

const BUCKETS = [
  { v: 'va', d: 'Operations / Field', hc: 58, gross: 1261000,
    er: [84000, 11000, 31000, 21000, 12000], erD: [5000, 500, 2000, 1000, 1000],
    otSep: 82000, otD: 20000, otN: 30, joiners: [16000, 16000, 16000, 16000], exits: 1, incN: 3,
    lopN: 7, lopDays: 2, otherN: 10, incr: [] },
  { v: 'va', d: 'Sales & Business Dev.', hc: 14, gross: 453000,
    er: [30000, 4000, 11000, 8000, 4000], erD: [4000, 500, 1500, 1000, 500],
    otSep: 0, otD: 0, otN: 0, joiners: [20000], exits: 0, incN: 2, lopN: 0, lopDays: 0, otherN: 5, incr: [] },
  { v: 'va', d: 'Service & Maintenance', hc: 16, gross: 377000,
    er: [25000, 3000, 9000, 7000, 4000], erD: [-2000, 0, -1000, -500, 0],
    otSep: 23000, otD: 5000, otN: 10, joiners: [], exits: 0, incN: 0, lopN: 0, lopDays: 0, otherN: 5, incr: [] },
  { v: 'va', d: 'Admin & Accounts', hc: 8, gross: 249000,
    er: [16000, 2000, 6000, 4000, 3000], erD: [0, 0, 0, 0, 0],
    otSep: 0, otD: 0, otN: 0, joiners: [], exits: 0, incN: 0, lopN: 0, lopDays: 0, otherN: 0, incr: [] },
  { v: 'vb', d: 'Service', hc: 72, gross: 1830000,
    er: [118000, 15000, 43000, 30000, 19000], erD: [-2000, 0, -1000, -500, -500],
    otSep: 70000, otD: 14000, otN: 14, joiners: [15000, 15000, 15000, 15000], exits: 2, incN: 2,
    lopN: 14, lopDays: 1, otherN: 0, incr: [7000] },
  { v: 'vc', d: 'Projects', hc: 58, gross: 1450000,
    er: [95000, 12000, 35000, 24000, 12000], erD: [-2000, 0, -1000, -1000, 0],
    otSep: 25000, otD: 3000, otN: 6, joiners: [14000, 14000], exits: 1, incN: 1, lopN: 0, lopDays: 0, otherN: 5, incr: [5000] },
  { v: 'corporate', d: 'Finance', hc: 22, gross: 620000,
    er: [42000, 5000, 15000, 11000, 6000], erD: [11000, 500, 5000, 3000, 1000],
    otSep: 10000, otD: 3000, otN: 4, joiners: [24000], exits: 0, incN: 1, lopN: 0, lopDays: 0, otherN: 5, incr: [10000] },
];
const ER_KEYS = ['er_pf', 'er_esi', 'gratuity_prov', 'bonus_prov', 'insurance'];
const LOP_FULL = 15000;

function blankRow(month, id, b) {
  return {
    month_key: month, employee_master_id: id, employee_code: `E${String(id).padStart(4, '0')}`,
    employee_name: `Emp ${id}`, vertical_code: b.v, department: b.d, location: 'Vadodara',
    grade: id % 2 ? 'G1' : 'G2', employment_type: 'permanent', cost_centre: null,
    date_of_joining: '2020-01-01', date_of_exit: null,
    paid_days: month === '2026-09' ? 30 : 31, total_days: month === '2026-09' ? 30 : 31, proration_factor: 1,
    gross: 0, fixed_full: 10000, fixed_earned: 10000, incentive: 0, ot_amount: 0, arrears: 0,
    total_deductions: 0, net_pay: 0, emp_pf: 0, emp_esic: 0, pt: 0, ee_lwf: 0, tds: 0,
    pf_wage: 0, esi_wage: 0,
    er_pf: 0, er_esi: 0, er_lwf: 0, gratuity_prov: 0, bonus_prov: 0, leave_encash_prov: 0, insurance: 0,
    ctc_revised_in_month: false,
  };
}

function buildSample() {
  const sep = [];
  const aug = [];
  let id = 1;
  for (const b of BUCKETS) {
    const lopEach = (LOP_FULL * b.lopDays) / 30;
    const grossDelta = b.joiners.reduce((s, x) => s + x, 0) - b.exits * EXIT_PREV_GROSS + b.otD
      + b.incN * 2000 - b.lopN * lopEach + b.otherN * 700 + b.incr.reduce((s, x) => s + x, 0);
    const grossAug = b.gross - grossDelta;
    const continuing = b.hc - b.joiners.length;
    const augBase = spread(grossAug - b.exits * EXIT_PREV_GROSS, continuing);
    const otAug = spread(b.otSep - b.otD, b.otN);
    const otDelta = spread(b.otD, b.otN);
    const sepRowsBucket = [];
    const augRowsBucket = [];

    for (let i = 0; i < continuing; i += 1) {
      const a = blankRow('2026-08', id, b);
      const s = blankRow('2026-09', id, b);
      a.gross = augBase[i];
      let delta = 0;
      let k = i;
      if (k < b.otN) {
        a.ot_amount = otAug[k];
        s.ot_amount = otAug[k] + otDelta[k];
        delta = otDelta[k];
      } else if ((k -= b.otN) < b.incN) {
        s.incentive = 2000;
        delta = 2000;
      } else if ((k -= b.incN) < b.lopN) {
        a.fixed_full = LOP_FULL;
        a.fixed_earned = LOP_FULL;
        s.fixed_full = LOP_FULL;
        s.paid_days = 30 - b.lopDays;
        s.proration_factor = f8(s.paid_days / 30);
        s.fixed_earned = round2(LOP_FULL * s.proration_factor);
        delta = -lopEach;
      } else if ((k -= b.lopN) < b.otherN) {
        delta = 700;
      } else if ((k -= b.otherN) < b.incr.length) {
        s.fixed_full = 10000 + b.incr[k];
        s.fixed_earned = 10000 + b.incr[k];
        s.ctc_revised_in_month = true;
        delta = b.incr[k];
      }
      s.gross = a.gross + delta;
      augRowsBucket.push(a);
      sepRowsBucket.push(s);
      id += 1;
    }
    for (const g of b.joiners) {
      const s = blankRow('2026-09', id, b);
      s.date_of_joining = '2026-09-10';
      s.paid_days = 21;
      s.proration_factor = f8(21 / 30);
      s.gross = g;
      sepRowsBucket.push(s);
      id += 1;
    }
    const exitRows = [];
    for (let i = 0; i < b.exits; i += 1) {
      const a = blankRow('2026-08', id, b);
      a.gross = EXIT_PREV_GROSS;
      const s = blankRow('2026-09', id, b);
      s.paid_days = 0;
      s.proration_factor = 0;
      s.gross = 0;
      s.fixed_earned = 0;
      s.date_of_exit = '2026-09-01';
      augRowsBucket.push(a);
      exitRows.push(s);
      id += 1;
    }
    ER_KEYS.forEach((key, j) => {
      spread(b.er[j], sepRowsBucket.length).forEach((v, i) => { sepRowsBucket[i][key] = v; });
      spread(b.er[j] - b.erD[j], augRowsBucket.length).forEach((v, i) => { augRowsBucket[i][key] = v; });
    });
    sep.push(...sepRowsBucket, ...exitRows);
    aug.push(...augRowsBucket);
  }

  const applyDeductions = (rows, spec) => {
    const paid = rows.filter((r) => r.paid_days > 0);
    spread(spec.pf, spec.pfN).forEach((v, i) => { paid[i].emp_pf = v; });
    spread(spec.pfWage, spec.pfN).forEach((v, i) => { paid[i].pf_wage = v; });
    spread(spec.esi, spec.esiN).forEach((v, i) => { paid[i].emp_esic = v; });
    spread(spec.esiWage, spec.esiN).forEach((v, i) => { paid[i].esi_wage = v; });
    for (let i = 0; i < spec.ptN; i += 1) paid[i].pt = 200;
    spread(spec.tds, spec.tdsN).forEach((v, i) => { paid[i].tds = v; });
    const loans = spread(spec.loan, paid.length);
    paid.forEach((r, i) => {
      r.total_deductions = r.emp_pf + r.emp_esic + r.pt + r.tds + loans[i];
    });
    for (const r of rows) r.net_pay = r.gross - r.total_deductions;
  };
  applyDeductions(sep, { pf: 410000, pfWage: 3415000, pfN: 236, esi: 12000, esiWage: 1600000, esiN: 98, ptN: 220, tds: 320000, tdsN: 64, loan: 85000 });
  applyDeductions(aug, { pf: 396000, pfWage: 3300000, pfN: 230, esi: 11800, esiWage: 1570000, esiN: 96, ptN: 218, tds: 310000, tdsN: 62, loan: 83800 });

  const julBlock = [
    { v: 'va', gross: 8717000, er: [590000, 75000, 0, 215000, 150000, 88000] },
    { v: 'vb', gross: 7020000, er: [450000, 58000, 0, 165000, 115000, 67000] },
    { v: 'vc', gross: 5539000, er: [360000, 46000, 0, 135000, 93000, 54000] },
    { v: 'corporate', gross: 2294000, er: [154000, 20500, 6200, 55500, 40000, 23000] },
  ].map((x, i) => ({
    ...blankRow('2026-07', 9000 + i, { v: x.v, d: 'Apr–Jul block' }),
    gross: x.gross, er_pf: x.er[0], er_esi: x.er[1], er_lwf: x.er[2], gratuity_prov: x.er[3], bonus_prov: x.er[4], insurance: x.er[5],
  }));
  return { sep, aug, jul: julBlock, all: [...julBlock, ...aug, ...sep] };
}

const S = buildSample();
const lockedMonths = ['2026-07', '2026-08', '2026-09'];
const ytdRows = rowsForMonths(S.all, ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);

describe('Payroll MIS — common rules', () => {
  it('change % rounds to 1 decimal and shows New when previous is 0', () => {
    expect(changePct(70_17_000, 67_61_000)).toBe(3.8);
    expect(changePct(5, 0)).toBeNull();
    expect(formatChangePct(null)).toBe('New');
    expect(formatChangePct(changePct(165000 + 45000, 165000))).toBe('+27.3%');
    expect(formatChangePct(changePct(95, 100))).toBe('−5.0%');
    expect(formatChangePct(0)).toBe('0.0%');
  });

  it('displays whole rupees with Indian grouping and stores 2 decimals', () => {
    expect(formatInr(1234567)).toBe('12,34,567');
    expect(formatInr(70_17_000)).toBe('70,17,000');
    expect(formatInr(4_03_08_200)).toBe('4,03,08,200');
    expect(formatInr(256000, { sign: true })).toBe('+2,56,000');
    expect(formatInr(-58000)).toBe('−58,000');
    expect(formatInr(999)).toBe('999');
    expect(formatInr(123.52)).toBe('124');
    expect(round2(1000.005)).toBe(1000.01);
    expect(formatSharePct(-22.66)).toBe('−23%');
  });

  it('resolves periods (month, range, quarter, FY Apr–Mar, YTD) and previous locked months', () => {
    expect(resolvePeriod({ type: 'month', month: '2026-09' })).toMatchObject({ from: '2026-09', to: '2026-09' });
    expect(resolvePeriod({ type: 'quarter', fy: 2026, quarter: 2 })).toMatchObject({ from: '2026-07', to: '2026-09' });
    expect(resolvePeriod({ type: 'fy', fy: 2026 })).toMatchObject({ from: '2026-04', to: '2027-03' });
    expect(resolvePeriod({ type: 'ytd', month: '2027-02' })).toMatchObject({ from: '2026-04', to: '2027-02' });
    const p = periodMonths({ type: 'month', month: '2026-09' }, ['2026-06', '2026-08', '2026-09']);
    expect(p.current).toEqual(['2026-09']);
    expect(p.previous).toEqual(['2026-08']);
    const gap = periodMonths({ type: 'month', month: '2026-09' }, ['2026-06', '2026-09']);
    expect(gap.previous).toEqual(['2026-06']);
  });

  it('applies the standard filters', () => {
    expect(applyFilters(S.sep, { vertical: 'va' }).every((r) => r.vertical_code === 'va')).toBe(true);
    expect(applyFilters(S.sep, { department: 'finance' }).length).toBe(22);
    expect(applyFilters(S.sep, { grade: 'G1' }).length).toBeGreaterThan(0);
  });
});

describe('Payroll MIS — sample tie-out (Sep 2026 vs Aug 2026)', () => {
  const r1 = buildR1(S.sep, S.aug);
  const r3 = buildR3(S.sep, S.aug, ytdRows);
  const r4 = buildR4(S.sep, S.aug, ytdRows);
  const r5 = buildR5(S.sep, S.aug, { from: '2026-09', to: '2026-09' });
  const r2 = buildR2(S.sep, S.aug, '2026-09', '2026-08');
  const r6 = buildR6(S.sep, S.aug);
  const metric = (k) => r1.rows.find((r) => r.key === k);

  it('Report 1 matches the sample table', () => {
    expect(metric('headcount')).toMatchObject({ current: 248, previous: 240, change: 8, changePct: 3.3 });
    expect(metric('gross')).toMatchObject({ current: 6240000, previous: 6010000, change: 230000, changePct: 3.8 });
    expect(metric('deductions')).toMatchObject({ current: 871000, previous: 845200, change: 25800, changePct: 3.1 });
    expect(metric('net')).toMatchObject({ current: 5369000, previous: 5164800, change: 204200, changePct: 4.0 });
    expect(metric('employerCost')).toMatchObject({ current: 777000, previous: 751000, change: 26000, changePct: 3.5 });
    expect(metric('totalCtc')).toMatchObject({ current: 7017000, previous: 6761000, change: 256000, changePct: 3.8 });
    expect(formatInr(metric('avgCtc').current)).toBe('28,294');
    expect(formatInr(metric('avgCtc').previous)).toBe('28,171');
    // Computed from the stored averages (28,294.35 − 28,170.83), as approved.
    expect(formatInr(metric('avgCtc').change, { sign: true })).toBe('+124');
    expect(metric('avgCtc').changePct).toBe(0.4);
    expect(metric('ot')).toMatchObject({ current: 210000, previous: 165000, change: 45000, changePct: 27.3 });
  });

  it('Report 1 colours money rows only: red above +5%, green on a fall', () => {
    expect(metric('ot').tone).toBe('bad');
    expect(metric('gross').tone).toBe('neutral');
    expect(metric('headcount').tone).toBe('neutral');
    const fall = buildR1(S.aug, S.sep);
    expect(fall.rows.find((r) => r.key === 'totalCtc').tone).toBe('good');
    expect(fall.rows.find((r) => r.key === 'headcount').tone).toBe('neutral');
  });

  it('R1 Total CTC = R3 Total = R4 grand total = R5 grand total', () => {
    const r3Total = r3.rows.find((r) => r.key === 'totalCtc');
    for (const v of [r3Total.current, r4.total.totalCtc, r5.total.totalCtc]) expect(v).toBe(7017000);
    for (const v of [r3Total.previous, r4.total.previousCtc, r5.total.previousCtc]) expect(v).toBe(6761000);
    expect(r1.current.employerCost).toBe(r4.total.employerCost);
  });

  it('Report 2 drivers match the sample and add up exactly', () => {
    const d = Object.fromEntries(r2.drivers.map((x) => [x.key, x]));
    expect(r2.previousCtc).toBe(6761000);
    expect(r2.currentCtc).toBe(7017000);
    expect(d.joiners).toMatchObject({ amount: 196000, count: 12 });
    expect(d.exits).toMatchObject({ amount: -58000, count: 4 });
    expect(d.increments).toMatchObject({ amount: 22000, count: 3 });
    expect(d.ot).toMatchObject({ amount: 45000, count: 64 });
    expect(d.incentives).toMatchObject({ amount: 18000, count: 9 });
    expect(d.lop).toMatchObject({ amount: -14000, count: 21 });
    expect(d.other).toMatchObject({ amount: 21000, count: 30 });
    expect(d.employer).toMatchObject({ amount: 26000, count: null });
    expect(r2.drivers.map((x) => formatSharePct(x.share))).toEqual(['77%', '−23%', '9%', '18%', '7%', '−5%', '8%', '10%']);
    expect(r2.check).toEqual({ ok: true, diff: 0 });
    expect(r2.drivers.reduce((s, x) => s + x.amount, r2.previousCtc)).toBe(r2.currentCtc);
    expect(formatChangePct(r2.changePct)).toBe('+3.8%');
  });

  it('Report 2 waterfall ends at the current CTC', () => {
    const bars = waterfallData(r2);
    expect(bars[0].value).toBe(6761000);
    expect(bars[bars.length - 1].value).toBe(7017000);
  });

  it('Report 3 matches the sample and YTD ties to Report 4', () => {
    const row = (k) => r3.rows.find((r) => r.key === k);
    expect(row('gross')).toMatchObject({ current: 6240000, previous: 6010000, ytd: 35820000, pctOfCtc: 88.9 });
    // The source document prints 5.8%; 23,60,000 ÷ 4,03,08,200 = 5.855% → 5.9% (the column then sums to 100%).
    expect(row('er_pf')).toMatchObject({ current: 410000, previous: 396000, ytd: 2360000, pctOfCtc: 5.9 });
    expect(row('er_esi')).toMatchObject({ current: 52000, previous: 50500, ytd: 302000, pctOfCtc: 0.7 });
    expect(row('er_lwf')).toMatchObject({ current: 0, previous: 0, ytd: 6200, pctOfCtc: 0 });
    expect(row('gratuity_prov')).toMatchObject({ current: 150000, previous: 144500, ytd: 865000, pctOfCtc: 2.1 });
    expect(row('bonus_prov')).toMatchObject({ current: 105000, previous: 102000, ytd: 605000, pctOfCtc: 1.5 });
    expect(row('leave_encash_prov')).toMatchObject({ current: 0, previous: 0, ytd: 0 });
    expect(row('insurance')).toMatchObject({ current: 60000, previous: 58000, ytd: 350000, pctOfCtc: 0.9 });
    expect(row('totalCtc')).toMatchObject({ current: 7017000, previous: 6761000, ytd: 40308200, pctOfCtc: 100 });
    expect(r4.total.ytdCtc).toBe(40308200);
  });

  it('Report 4 matches the sample rows', () => {
    const v = (code) => r4.rows.find((r) => r.vertical === code);
    expect(v('va')).toMatchObject({ headcount: 96, gross: 2340000, employerCost: 295000, totalCtc: 2635000, pctOfTotal: 37.6, previousCtc: 2510000, changePct: 5.0, ytdCtc: 14980000 });
    expect(v('vb')).toMatchObject({ headcount: 72, gross: 1830000, employerCost: 225000, totalCtc: 2055000, pctOfTotal: 29.3, previousCtc: 2010000, changePct: 2.2, ytdCtc: 11940000 });
    expect(v('vc')).toMatchObject({ headcount: 58, gross: 1450000, employerCost: 178000, totalCtc: 1628000, pctOfTotal: 23.2, previousCtc: 1605000, changePct: 1.4, ytdCtc: 9460000 });
    expect(v('corporate')).toMatchObject({ headcount: 22, gross: 620000, employerCost: 79000, totalCtc: 699000, pctOfTotal: 10.0, previousCtc: 636000, changePct: 9.9, ytdCtc: 3928200 });
    expect(r4.total).toMatchObject({ headcount: 248, gross: 6240000, employerCost: 777000, totalCtc: 7017000, previousCtc: 6761000, changePct: 3.8 });
    expect(r4.hasUnassigned).toBe(false);
  });

  it('Report 5 matches the Vertical A sample, subtotals equal Report 4 rows', () => {
    const a = r5.groups.find((g) => g.vertical === 'va');
    const dep = (name) => a.departments.find((x) => x.department === name);
    expect(dep('Operations / Field')).toMatchObject({ headcount: 58, totalCtc: 1420000, ot: 82000, newHires: 4, exits: 1, previousCtc: 1335000, changePct: 6.4 });
    expect(formatInr(dep('Operations / Field').avgCtc)).toBe('24,483');
    expect(dep('Sales & Business Dev.')).toMatchObject({ headcount: 14, totalCtc: 510000, ot: 0, newHires: 1, exits: 0, previousCtc: 475000, changePct: 7.4 });
    expect(formatInr(dep('Sales & Business Dev.').avgCtc)).toBe('36,429');
    expect(dep('Service & Maintenance')).toMatchObject({ headcount: 16, totalCtc: 425000, ot: 23000, previousCtc: 420000, changePct: 1.2 });
    expect(formatInr(dep('Service & Maintenance').avgCtc)).toBe('26,563');
    expect(dep('Admin & Accounts')).toMatchObject({ headcount: 8, totalCtc: 280000, avgCtc: 35000, previousCtc: 280000, changePct: 0 });
    expect(a.subtotal).toMatchObject({ headcount: 96, totalCtc: 2635000, ot: 105000, newHires: 5, exits: 1, previousCtc: 2510000, changePct: 5.0 });
    expect(formatInr(a.subtotal.avgCtc)).toBe('27,448');
    for (const g of r5.groups) {
      const row = r4.rows.find((r) => r.vertical === g.vertical);
      expect(g.subtotal.totalCtc).toBe(row.totalCtc);
      expect(g.subtotal.headcount).toBe(row.headcount);
    }
    expect(r5.total).toMatchObject({ headcount: 248, totalCtc: 7017000, ot: 210000, newHires: 12, exits: 4, previousCtc: 6761000, changePct: 3.8 });
    expect(formatInr(r5.total.avgCtc)).toBe('28,294');
    // R5 OT = R1 overtime; R5 hires / exits = R2 counts.
    expect(r5.total.ot).toBe(metric('ot').current);
    expect(r5.total.newHires).toBe(r2.drivers.find((x) => x.key === 'joiners').count);
    expect(r5.total.exits).toBe(r2.drivers.find((x) => x.key === 'exits').count);
  });

  it('Report 6 matches the sample and ties to Reports 3 and 7', () => {
    const s = (k) => r6.rows.find((r) => r.key === k);
    expect(s('PF')).toMatchObject({ covered: 236, wageBase: 3415000, employeeShare: 410000, employerShare: 410000, totalDeposit: 820000, employerChangePct: 3.5 });
    expect(s('ESI')).toMatchObject({ covered: 98, wageBase: 1600000, employeeShare: 12000, employerShare: 52000, totalDeposit: 64000, employerChangePct: 3.0 });
    expect(s('PT')).toMatchObject({ covered: 220, wageBase: null, employeeShare: 44000, employerShare: 0, totalDeposit: 44000, employerChangePct: undefined });
    expect(s('LWF')).toMatchObject({ covered: 0, employeeShare: 0, employerShare: 0, totalDeposit: 0, employerChangePct: undefined });
    expect(s('TDS')).toMatchObject({ covered: 64, employeeShare: 320000, employerShare: 0, totalDeposit: 320000 });
    expect(r6.total).toEqual({ employeeShare: 786000, employerShare: 462000, totalDeposit: 1248000 });
    const r3row = (k) => r3.rows.find((r) => r.key === k).current;
    expect(s('PF').employerShare).toBe(r3row('er_pf'));
    expect(s('ESI').employerShare).toBe(r3row('er_esi'));
    expect(depositsByStatute(S.sep)).toMatchObject({ PF: 820000, ESI: 64000, PT: 44000, TDS: 320000 });
  });

  it('Report 7 statuses and tiles match the sample viewed on 10 Oct 2026', () => {
    const payments = [
      { wage_month: '2026-09', statute: 'TDS', due_date: '2026-10-07', amount: 320000, paid_on: '2026-10-06', challan_ref: 'CIN 0510221', interest: 0, penalty: 0 },
      { wage_month: '2026-09', statute: 'PF', due_date: '2026-10-15', amount: 820000, paid_on: null, interest: 0, penalty: 0 },
      { wage_month: '2026-09', statute: 'ESI', due_date: '2026-10-15', amount: 64000, paid_on: null, interest: 0, penalty: 0 },
      { wage_month: '2026-09', statute: 'PT', due_date: null, amount: 44000, paid_on: null, interest: 0, penalty: 0 },
      { wage_month: '2026-08', statute: 'PF', due_date: '2026-09-15', amount: 792000, paid_on: '2026-09-18', challan_ref: 'TRRN 102388', interest: 1500, penalty: 350 },
    ];
    const deposits = depositsByStatute(S.sep);
    for (const p of payments.filter((x) => x.wage_month === '2026-09')) expect(p.amount).toBe(deposits[p.statute]);
    const r7 = buildR7(payments, '2026-10-10');
    const st = (m, s) => r7.rows.find((r) => r.wage_month === m && r.statute === s).status;
    expect(st('2026-09', 'TDS')).toMatchObject({ key: 'paid_on_time', daysLate: 0 });
    expect(st('2026-09', 'PF').key).toBe('pending');
    expect(st('2026-09', 'ESI').key).toBe('pending');
    expect(st('2026-09', 'PT').key).toBe('pending');
    expect(st('2026-08', 'PF')).toMatchObject({ key: 'paid_late', daysLate: 3 });
    expect(r7.rows.find((r) => r.wage_month === '2026-08').interestPenalty).toBe(1850);
    expect(r7.tiles).toMatchObject({ pendingAmount: 928000, overdueCount: 0, paidLateThisFy: 1, interestPenaltyYtd: 1850 });
  });
});

describe('Payroll MIS — rules', () => {
  it('payment status: due soon within 3 days, overdue after the due date', () => {
    expect(paymentStatus({ due_date: '2026-10-15' }, '2026-10-11').key).toBe('pending');
    expect(paymentStatus({ due_date: '2026-10-15' }, '2026-10-12').key).toBe('due_soon');
    expect(paymentStatus({ due_date: '2026-10-15' }, '2026-10-15').key).toBe('due_soon');
    expect(paymentStatus({ due_date: '2026-10-15' }, '2026-10-16')).toMatchObject({ key: 'overdue', daysLate: 1 });
  });

  it('allocation % split gives decimal headcount and keeps totals', () => {
    const rows = [
      { month_key: '2026-09', employee_master_id: 1, vertical_code: 'corporate', paid_days: 30, gross: 40000, er_pf: 1800 },
      { month_key: '2026-09', employee_master_id: 2, vertical_code: 'vb', paid_days: 30, gross: 20000 },
    ];
    const alloc = [
      { employee_master_id: 1, vertical_code: 'va', pct: 50 },
      { employee_master_id: 1, vertical_code: 'vb', pct: 50 },
    ];
    expect(splitByAllocation(rows, alloc)).toHaveLength(3);
    const r4 = buildR4(rows, [], rows, alloc, { split: true });
    const v = (c) => r4.rows.find((r) => r.vertical === c);
    expect(v('va')).toMatchObject({ headcount: 0.5, totalCtc: 20900 });
    expect(v('vb')).toMatchObject({ headcount: 1.5, totalCtc: 40900 });
    expect(r4.total.totalCtc).toBe(61800);
    const r5 = buildR5(rows, [], { from: '2026-09', to: '2026-09' }, alloc, { split: true });
    expect(r5.groups.find((g) => g.vertical === 'va').subtotal.headcount).toBe(0.5);
  });

  it('untagged employees fall into Unassigned', () => {
    const r4 = buildR4([{ month_key: '2026-09', employee_master_id: 1, vertical_code: null, paid_days: 30, gross: 100 }], [], []);
    expect(r4.rows[0]).toMatchObject({ label: 'Unassigned', unassigned: true });
    expect(r4.hasUnassigned).toBe(true);
  });

  it('register tie-out blocks on a mismatch with the sum of lines and only warns on the run header', () => {
    const ok = registerTieOut(S.sep, [{ month_key: '2026-09', line_count: S.sep.length, gross: 6240000, total_deductions: 871000, net_pay: 5369000, header_gross: 6239000, header_deductions: 871000, header_net: 5369000 }]);
    expect(ok.ok).toBe(true);
    expect(ok.warnings).toHaveLength(1);
    const bad = registerTieOut(S.sep, [{ month_key: '2026-09', line_count: S.sep.length, gross: 6241000, total_deductions: 871000, net_pay: 5369000 }]);
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]).toMatchObject({ label: 'Gross earnings', diff: -1000 });
  });

  it('12-month trend lists locked months up to the period', () => {
    const t = buildTrend(S.all, lockedMonths, '2026-09');
    expect(t.map((x) => x.month)).toEqual(lockedMonths);
    expect(t[2]).toMatchObject({ totalCtc: 7017000, headcount: 248 });
  });

  it('PF breakup follows the rate master (EPS capped at the ceiling, EPF employer = EPF − EPS)', () => {
    const rates = [
      { statute: 'PF', component: 'eps', state: 'ALL', rate_pct: 8.33, wage_ceiling: 15000, effective_from: '2014-09-01' },
      { statute: 'PF', component: 'epf_total', state: 'ALL', rate_pct: 12, wage_ceiling: null, effective_from: '2014-09-01' },
      { statute: 'PF', component: 'edli', state: 'ALL', rate_pct: 0.5, wage_ceiling: 15000, effective_from: '2014-09-01' },
      { statute: 'PF', component: 'admin', state: 'ALL', rate_pct: 0.5, wage_ceiling: null, effective_from: '2018-06-01' },
    ];
    const rows = [{ emp_pf: 2400, pf_wage: 20000, er_pf: 2600 }];
    const b = buildPfBreakup(rows, rates, '2026-09');
    const line = (k) => b.lines.find((l) => l.key === k).amount;
    expect(line('eps')).toBe(1249.5);
    expect(line('epf_er')).toBe(1150.5);
    expect(line('edli')).toBe(75);
    expect(line('admin')).toBe(100);
    expect(b.employerPayroll).toBe(2600);
    expect(b.difference).toBe(2600 - (2400 + 75 + 100));
  });

  it('multi-month totals sum amounts and keep the last month headcount', () => {
    const t = totals(rowsForMonths(S.all, ['2026-08', '2026-09']));
    expect(t.totalCtc).toBe(7017000 + 6761000);
    expect(t.headcount).toBe(248);
  });
});
