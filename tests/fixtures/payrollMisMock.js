/**
 * Payroll MIS — in-memory mock data for the 7 reports (state: Gujarat). Test-only.
 * Nothing here reads from or writes to any database; every row is built in memory.
 *
 * Shapes follow what the reports read:
 *   snapshot rows  → admin_payroll_mis_rows (one row per employee per locked month)
 *   run headers    → admin_salary_month_runs
 *   masters        → admin_payroll_mis_settings, _employee_tags, _departments, _cost_allocations,
 *                    _insurance_premiums, _statutory_rates, _compliance_calendar, _budget,
 *                    _mis_access, _mis_alert_recipients, _statutory_payments
 *
 * The figures reproduce the samples in docs/PROMPT_payroll_mis_7_reports.md
 * (Sep 2026 vs Aug 2026, YTD Apr–Sep 2026). Where a real Gujarat rule cannot produce a sample
 * figure exactly, the gap is listed in DEVIATIONS.
 */

export const TODAY = '2026-10-10';
export const STATE = 'GJ';
export const STATE_NAME = 'Gujarat';
export const COMPANY = 'Indus Fire Safety Pvt. Ltd.';

/** Spec sample verticals → billing verticals (+ Corporate shared bucket). */
export const VERTICAL_MAP = Object.freeze({ A: 'manpower', B: 'amc', C: 'projects', Corporate: 'corporate' });
const VA = VERTICAL_MAP.A;
const VB = VERTICAL_MAP.B;
const VC = VERTICAL_MAP.C;
const CORP = VERTICAL_MAP.Corporate;

export const PRIOR_MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
export const FY_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
export const LOCKED_MONTHS = [...PRIOR_MONTHS, ...FY_MONTHS];
export const DRAFT_MONTH = '2026-10';
export const RELOCK_MONTH = '2026-07';
export const DRILL_CODES = Object.freeze({ OT_1: 'MOCK-E0731', OT_2: 'MOCK-E0688', OT_B: 'MOCK-E0912' });

export const MOCK_USERS = Object.freeze({
  salaryAdmin: { id: '00000000-0000-4000-8000-00000000b001', email: 'salary.admin@example.test', full: true },
  verticalHead: { id: '00000000-0000-4000-8000-00000000a001', email: 'vertical.head@example.test', full: false },
});

// ---------------------------------------------------------------------------
// Statutory masters (Gujarat)
// ---------------------------------------------------------------------------
export const STATUTORY_RATES = Object.freeze([
  { statute: 'PF', component: 'employee', state: 'ALL', rate_pct: 12, wage_ceiling: 15000, effective_from: '2014-09-01', note: 'Employee EPF 12% of PF wages (ceiling ₹15,000 where applicable)' },
  { statute: 'PF', component: 'epf_total', state: 'ALL', rate_pct: 12, wage_ceiling: null, effective_from: '2014-09-01', note: 'Employer EPF + EPS 12% of PF wages' },
  { statute: 'PF', component: 'eps', state: 'ALL', rate_pct: 8.33, wage_ceiling: 15000, effective_from: '2014-09-01', note: 'Pension (EPS) 8.33% up to ₹15,000' },
  { statute: 'PF', component: 'edli', state: 'ALL', rate_pct: 0.5, wage_ceiling: 15000, effective_from: '2014-09-01', note: 'EDLI 0.5% up to ₹15,000' },
  { statute: 'PF', component: 'admin', state: 'ALL', rate_pct: 0.5, wage_ceiling: null, effective_from: '2018-06-01', note: 'PF admin charges 0.5%' },
  { statute: 'ESI', component: 'employee', state: 'ALL', rate_pct: 0.75, wage_ceiling: 21000, effective_from: '2019-07-01', note: 'ESI employee 0.75% (gross ≤ ₹21,000)' },
  { statute: 'ESI', component: 'employer', state: 'ALL', rate_pct: 3.25, wage_ceiling: 21000, effective_from: '2019-07-01', note: 'ESI employer 3.25% (gross ≤ ₹21,000)' },
  { statute: 'PT', component: 'employee', state: STATE, rate_pct: null, fixed_amount: 200, slabs_json: [{ upto: 12000, amount: 0 }, { above: 12000, amount: 200 }], effective_from: '2022-04-01', note: 'Gujarat PT: nil up to ₹12,000; ₹200 a month above' },
  { statute: 'LWF', component: 'employee', state: STATE, fixed_amount: 6, effective_from: '2020-01-01', note: 'Gujarat LWF employee ₹6 per half-year (June, December)' },
  { statute: 'LWF', component: 'employer', state: STATE, fixed_amount: 12, effective_from: '2020-01-01', note: 'Gujarat LWF employer ₹12 per half-year (June, December)' },
  { statute: 'TDS', component: 'salary', state: 'ALL', rate_pct: null, effective_from: '2026-04-01', note: 'TDS on salary per employee tax computation (sec. 192)' },
]);

export const COMPLIANCE_CALENDAR = Object.freeze([
  { statute: 'TDS', state: 'ALL', day_of_month: 7, month_offset: 1, months_applicable: null, note: 'TDS on salary — 7th of the next month (March: 30 April)' },
  { statute: 'PF', state: 'ALL', day_of_month: 15, month_offset: 1, months_applicable: null, note: 'PF — 15th of the next month' },
  { statute: 'ESI', state: 'ALL', day_of_month: 15, month_offset: 1, months_applicable: null, note: 'ESI — 15th of the next month' },
  { statute: 'PT', state: STATE, day_of_month: 15, month_offset: 1, months_applicable: null, note: 'Gujarat PT — 15th of the next month' },
  { statute: 'LWF', state: STATE, day_of_month: 15, month_offset: 1, months_applicable: [6, 12], note: 'Gujarat LWF — June → 15 July, December → 15 January' },
]);

/** Each Gujarat / central value used, with how far it could be confirmed. */
export const RATE_SOURCES = Object.freeze([
  { item: 'PF employee / employer', value: '12% / 12% of PF wages; EPS 8.33% up to ₹15,000; EDLI 0.5%; admin 0.5%', status: 'Verified', source: 'EPF Scheme 1952 / EPFO notifications (admin 0.5% from 1 Jun 2018)' },
  { item: 'ESI employee / employer', value: '0.75% / 3.25%; wage ceiling ₹21,000', status: 'Verified', source: 'ESIC notification, rates effective 1 Jul 2019' },
  { item: 'Gujarat Professional Tax', value: 'Nil up to ₹12,000; ₹200 a month above', status: 'Partly verified', source: 'Gujarat PT Act 1976, slab revised 1 Apr 2022 — published summaries differ on whether exactly ₹12,000 is taxable' },
  { item: 'Gujarat PT due date', value: '15th of the next month', status: 'Unconfirmed', source: 'Sources differ: monthly by the 15th vs quarterly (15 days after quarter end) for employers with 20+ employees. Monthly is used so the spec sample (only Sep pending) ties' },
  { item: 'Gujarat LWF', value: 'Employee ₹6 / employer ₹12 per half-year; June and December; pay by 15 July / 15 January', status: 'Partly verified', source: 'Gujarat Labour Welfare Fund Act 1953 s.6B(3) for dates; the ₹6/₹12 amounts are widely published but the gazette notification could not be traced (the Act text still says ₹3/₹6)' },
  { item: 'TDS on salary due date', value: '7th of the next month (March: 30 April)', status: 'Verified', source: 'Income-tax Rules, rule 30' },
  { item: 'PF / ESI due dates', value: '15th of the next month', status: 'Verified', source: 'EPF Scheme para 38; ESI (Central) Regulations reg. 31' },
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function spread(total, n) {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  let rem = total - base * n;
  return Array.from({ length: n }, () => {
    const extra = rem === 0 ? 0 : Math.sign(rem);
    rem -= extra;
    return base + extra;
  });
}

const f8 = (v) => Math.round(v * 1e8) / 1e8;
const pad = (n, w) => String(n).padStart(w, '0');
const daysIn = (m) => {
  const [y, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mm, 0)).getUTCDate();
};
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

/** Smallest whole-rupee wage whose 12% rounds to the contribution. */
const pfWageFor = (pf) => Math.ceil((pf - 0.5) / 0.12 - 1e-9);

/** Due date from the compliance calendar (state row wins over ALL); null when not applicable. */
export function calendarDueDate(statute, state, wageMonth, calendar = COMPLIANCE_CALENDAR) {
  const rows = calendar.filter((c) => c.statute === statute && (c.state === state || c.state === 'ALL'));
  rows.sort((a, b) => (a.state === 'ALL') - (b.state === 'ALL'));
  const c = rows[0];
  if (!c) return null;
  const [y, m] = wageMonth.split('-').map(Number);
  if (c.months_applicable && !c.months_applicable.includes(m)) return null;
  const idx = y * 12 + (m - 1) + c.month_offset;
  const dy = Math.floor(idx / 12);
  const dm = (idx % 12) + 1;
  const last = new Date(Date.UTC(dy, dm, 0)).getUTCDate();
  return `${dy}-${pad(dm, 2)}-${pad(Math.min(c.day_of_month, last), 2)}`;
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Sep / Aug structure (spec samples)
// ---------------------------------------------------------------------------
const EXIT_PREV_GROSS = 14500;
const LOP_FULL = 15000;
const LOW_GROSS = 11500;
const NEW_HIRE_CTC = 28500;

/**
 * er = [er_pf, er_esi, gratuity_prov, bonus_prov, insurance] in Sep; erD = Sep − Aug.
 * esiN / esiNAug = ESI-covered staff in Sep / Aug; low = PT-exempt staff (gross below ₹12,000).
 */
const BUCKETS = [
  { v: VA, d: 'Operations / Field', hc: 58, gross: 1261000,
    er: [84000, 11000, 31000, 21000, 12000], erD: [5000, 500, 2000, 1000, 1000],
    otSep: 82000, otD: 20000, otN: 30, joiners: [16000, 16000, 16000, 16000], exits: 1, incN: 3,
    lopN: 7, lopDays: 2, otherN: 10, incr: [], esiN: 21, esiNAug: 21, low: 0,
    otFixed: [{ code: DRILL_CODES.OT_1, aug: 4200, sep: 11800 }, { code: DRILL_CODES.OT_2, aug: 3900, sep: 9500 }] },
  { v: VA, d: 'Sales & Business Dev.', hc: 14, gross: 453000,
    er: [30000, 4000, 11000, 8000, 4000], erD: [4000, 500, 1500, 1000, 500],
    otSep: 0, otD: 0, otN: 0, joiners: [20000], exits: 0, incN: 2, lopN: 0, lopDays: 0, otherN: 5, incr: [],
    esiN: 8, esiNAug: 7, low: 0 },
  { v: VA, d: 'Service & Maintenance', hc: 16, gross: 377000,
    er: [25000, 3000, 9000, 7000, 4000], erD: [-2000, 0, -1000, -500, 0],
    otSep: 23000, otD: 5000, otN: 10, joiners: [], exits: 0, incN: 0, lopN: 0, lopDays: 0, otherN: 5, incr: [],
    esiN: 6, esiNAug: 6, low: 0 },
  { v: VA, d: 'Admin & Accounts', hc: 8, gross: 249000,
    er: [16000, 2000, 6000, 4000, 3000], erD: [0, 0, 0, 0, 0],
    otSep: 0, otD: 0, otN: 0, joiners: [], exits: 0, incN: 0, lopN: 0, lopDays: 0, otherN: 0, incr: [],
    esiN: 4, esiNAug: 4, low: 0 },
  { v: VB, d: 'Service', hc: 72, gross: 1830000,
    er: [118000, 15000, 43000, 30000, 19000], erD: [-2000, 0, -1000, -500, -500],
    otSep: 70000, otD: 14000, otN: 14, joiners: [15000, 15000, 15000, 15000], exits: 2, incN: 2,
    lopN: 14, lopDays: 1, otherN: 0, incr: [7000], esiN: 28, esiNAug: 28, low: 14,
    otFixed: [{ code: DRILL_CODES.OT_B, aug: 0, sep: 4100 }] },
  { v: VC, d: 'Projects', hc: 58, gross: 1450000,
    er: [95000, 12000, 35000, 24000, 12000], erD: [-2000, 0, -1000, -1000, 0],
    otSep: 25000, otD: 3000, otN: 6, joiners: [14000, 14000], exits: 1, incN: 1, lopN: 0, lopDays: 0, otherN: 5, incr: [5000],
    esiN: 22, esiNAug: 22, low: 14 },
  { v: CORP, d: 'Finance', hc: 22, gross: 620000,
    er: [42000, 5000, 15000, 11000, 6000], erD: [11000, 500, 5000, 3000, 1000],
    otSep: 10000, otD: 3000, otN: 4, joiners: [24000], exits: 0, incN: 1, lopN: 0, lopDays: 0, otherN: 5, incr: [10000],
    esiN: 9, esiNAug: 8, low: 0 },
];
const ER_KEYS = ['er_pf', 'er_esi', 'gratuity_prov', 'bonus_prov', 'insurance'];

/** Apr–Jul totals per vertical: gross and [er_pf, er_esi, er_lwf, gratuity, bonus, insurance]. */
const APR_JUL = [
  { v: VA, gross: 8717000, er: [590000, 75000, 0, 215000, 150000, 88000] },
  { v: VB, gross: 7020000, er: [450000, 58000, 0, 165000, 115000, 67000] },
  { v: VC, gross: 5539000, er: [360000, 46000, 0, 135000, 93000, 54000] },
  { v: CORP, gross: 2294000, er: [154000, 20500, 6200, 55500, 40000, 23000] },
];

const LOCATIONS = ['Ahmedabad', 'Vadodara', 'Surat', 'Rajkot'];
const GRADES = ['G1', 'G2', 'G3', 'G4'];
const EXIT_REASONS = ['Resigned — better offer', 'Resigned — relocation', 'Absconded', 'Retired'];

function makeEmployee(id, b, extra = {}) {
  const code = extra.code || `MOCK-E${pad(id, 4)}`;
  const num = Number(code.replace(/\D/g, ''));
  return {
    id,
    employee_id: code,
    full_name: `Mock Employee ${pad(num, 3)}`,
    department: b.d,
    location: LOCATIONS[id % LOCATIONS.length],
    state: STATE_NAME,
    status: extra.date_of_exit ? 'Inactive' : 'Active',
    employment_type: id % 7 === 0 ? 'contract' : 'permanent',
    designation: 'Mock Designation',
    uan_no: `9999${pad(id, 8)}`,
    esic_no: `9999${pad(id, 6)}`,
    date_of_joining: extra.date_of_joining || '2020-01-01',
    date_of_exit: extra.date_of_exit || null,
    _vertical: b.v,
    _grade: GRADES[id % GRADES.length],
    _cost_centre: b.v ? `CC-${b.v.toUpperCase()}-${(id % 3) + 1}` : null,
    _position_type: extra.position_type || null,
    _exit_reason: extra.exit_reason || null,
  };
}

function snapRow(month, emp, runId, f = {}) {
  const td = daysIn(month);
  return {
    run_id: runId,
    month_key: month,
    employee_master_id: emp.id,
    employee_code: emp.employee_id,
    employee_name: emp.full_name,
    designation: emp.designation,
    uan_no: emp.uan_no,
    esic_no: emp.esic_no,
    vertical_code: emp._vertical,
    department: emp.department,
    grade: emp._grade,
    location: emp.location,
    cost_centre: emp._cost_centre,
    employment_type: emp.employment_type,
    position_type: emp._position_type,
    work_state: STATE,
    date_of_joining: emp.date_of_joining,
    date_of_exit: emp.date_of_exit,
    exit_reason: emp._exit_reason,
    paid_days: td,
    total_days: td,
    lop_days: 0,
    proration_factor: 1,
    gross: 0,
    fixed_full: 10000,
    fixed_earned: 10000,
    incentive: 0,
    ot_amount: 0,
    arrears: 0,
    total_deductions: 0,
    net_pay: 0,
    emp_pf: 0,
    emp_esic: 0,
    pt: 0,
    ee_lwf: 0,
    tds: 0,
    loan: 0,
    salary_advance: 0,
    unpaid_paid: 0,
    pf_wage: 0,
    esi_wage: 0,
    er_pf: 0,
    er_esi: 0,
    er_lwf: 0,
    gratuity_prov: 0,
    bonus_prov: 0,
    leave_encash_prov: 0,
    insurance: 0,
    insurance_source: 'ctc',
    ctc_mediclaim_monthly: 0,
    ctc_monthly: null,
    ctc_revised_in_month: false,
    ctc_revision_type: null,
    ctc_wef_date: null,
    ...f,
  };
}

const runIdFor = (m) => `mock-run-${m}`;

/** ESI / PF / PT / TDS / loans for one month so totals hit the targets. */
function applyStatutory(rows, spec, bucketOf) {
  const paid = rows.filter((r) => r.paid_days > 0);
  const byGrossDesc = [...paid].sort((a, b) => b.gross - a.gross || a.employee_master_id - b.employee_master_id);
  const pfExcluded = new Set(byGrossDesc.slice(0, paid.length - spec.pfN).map((r) => r.employee_master_id));

  for (const b of BUCKETS) {
    const inB = paid.filter((r) => bucketOf.get(r.employee_master_id) === b);
    const pfRows = inB.filter((r) => !pfExcluded.has(r.employee_master_id));
    const erPf = spec.month === '2026-09' ? b.er[0] : b.er[0] - b.erD[0];
    for (const r of inB) r.er_pf = 0;
    spread(erPf, pfRows.length).forEach((v, i) => {
      pfRows[i].er_pf = v;
      pfRows[i].emp_pf = v;
      pfRows[i].pf_wage = pfWageFor(v);
    });

    const esiTarget = spec.month === '2026-09' ? b.er[1] : b.er[1] - b.erD[1];
    const esiN = spec.month === '2026-09' ? b.esiN : b.esiNAug;
    const esiRows = [...inB].sort((x, y) => x.gross - y.gross || x.employee_master_id - y.employee_master_id).slice(0, esiN);
    for (const r of inB) r.er_esi = 0;
    spread(esiTarget, esiRows.length).forEach((v, i) => { esiRows[i].er_esi = v; });
  }

  const esiRows = paid.filter((r) => r.er_esi > 0);
  const wages = esiRows.map((r) => Math.round(r.er_esi / 0.0325));
  wages[wages.length - 1] += spec.esiWage - wages.reduce((s, x) => s + x, 0);
  const ee = wages.map((w) => Math.round(w * 0.0075));
  ee[ee.length - 1] += spec.esiEe - ee.reduce((s, x) => s + x, 0);
  esiRows.forEach((r, i) => { r.esi_wage = wages[i]; r.emp_esic = ee[i]; });

  for (const r of paid) r.pt = r.gross > 12000 ? 200 : 0;
  byGrossDesc.slice(0, spec.tdsN).forEach((r, i) => { r.tds = spread(spec.tds, spec.tdsN)[i]; });

  const fixed = sum(paid, 'emp_pf') + sum(paid, 'emp_esic') + sum(paid, 'pt') + sum(paid, 'tds') + sum(paid, 'ee_lwf');
  spread(spec.deductions - fixed, paid.length).forEach((v, i) => { paid[i].loan = v; });
  for (const r of rows) {
    r.total_deductions = r.emp_pf + r.emp_esic + r.pt + r.ee_lwf + r.tds + r.loan;
    r.net_pay = r.gross - r.total_deductions;
  }
}

/** Plain deductions for months without a spec target (prior months, Apr–Jul). */
function applyPlainStatutory(rows) {
  const paid = rows.filter((r) => r.paid_days > 0);
  const byGrossDesc = [...paid].sort((a, b) => b.gross - a.gross || a.employee_master_id - b.employee_master_id);
  for (const r of paid) {
    r.emp_pf = r.er_pf;
    r.pf_wage = r.er_pf > 0 ? pfWageFor(r.er_pf) : 0;
    r.esi_wage = r.er_esi > 0 ? Math.round(r.er_esi / 0.0325) : 0;
    r.emp_esic = Math.round(r.esi_wage * 0.0075);
    r.pt = r.gross > 12000 ? 200 : 0;
  }
  byGrossDesc.slice(0, 60).forEach((r) => { r.tds = 5000; });
  for (const r of rows) {
    r.total_deductions = r.emp_pf + r.emp_esic + r.pt + r.ee_lwf + r.tds + r.loan;
    r.net_pay = r.gross - r.total_deductions;
  }
}

function buildCore() {
  const employees = [];
  const bucketOf = new Map();
  const sep = [];
  const aug = [];
  const lowIds = new Set();
  const increments = [];
  let id = 1;
  let joinerNo = 0;
  let exitNo = 0;

  for (const b of BUCKETS) {
    const lopEach = (LOP_FULL * b.lopDays) / 30;
    const grossDelta = b.joiners.reduce((s, x) => s + x, 0) - b.exits * EXIT_PREV_GROSS + b.otD
      + b.incN * 2000 - b.lopN * lopEach + b.otherN * 700 + b.incr.reduce((s, x) => s + x, 0);
    const grossAug = b.gross - grossDelta;
    const continuing = b.hc - b.joiners.length;
    const augBase = spread(grossAug - b.exits * EXIT_PREV_GROSS, continuing);
    const fixedOt = b.otFixed || [];
    const otAugRest = spread(b.otSep - b.otD - fixedOt.reduce((s, x) => s + x.aug, 0), b.otN - fixedOt.length);
    const otDeltaRest = spread(b.otD - fixedOt.reduce((s, x) => s + (x.sep - x.aug), 0), b.otN - fixedOt.length);
    const sepB = [];
    const augB = [];
    const plain = [];

    for (let i = 0; i < continuing; i += 1) {
      const fx = i < fixedOt.length ? fixedOt[i] : null;
      const emp = makeEmployee(id, b, fx ? { code: fx.code } : {});
      employees.push(emp);
      bucketOf.set(id, b);
      const a = snapRow('2026-08', emp, runIdFor('2026-08'));
      const s = snapRow('2026-09', emp, runIdFor('2026-09'));
      a.gross = augBase[i];
      let delta = 0;
      let k = i;
      if (k < b.otN) {
        const augOt = fx ? fx.aug : otAugRest[k - fixedOt.length];
        const d = fx ? fx.sep - fx.aug : otDeltaRest[k - fixedOt.length];
        a.ot_amount = augOt;
        s.ot_amount = augOt + d;
        delta = d;
      } else if ((k -= b.otN) < b.incN) {
        s.incentive = 2000;
        delta = 2000;
      } else if ((k -= b.incN) < b.lopN) {
        a.fixed_full = LOP_FULL;
        a.fixed_earned = LOP_FULL;
        s.fixed_full = LOP_FULL;
        s.paid_days = 30 - b.lopDays;
        s.lop_days = b.lopDays;
        s.proration_factor = f8(s.paid_days / 30);
        s.fixed_earned = Math.round(LOP_FULL * s.proration_factor * 100) / 100;
        delta = -lopEach;
      } else if ((k -= b.lopN) < b.otherN) {
        delta = 700;
      } else if ((k -= b.otherN) < b.incr.length) {
        s.fixed_full = 10000 + b.incr[k];
        s.fixed_earned = 10000 + b.incr[k];
        s.ctc_revised_in_month = true;
        s.ctc_revision_type = 'increment';
        s.ctc_wef_date = '2026-09-01';
        increments.push({
          employee_master_id: emp.id, employee_code: emp.employee_id, vertical_code: b.v, revision_type: 'increment',
          wef_date: '2026-09-01', previous_fixed_monthly: 10000, new_fixed_monthly: 10000 + b.incr[k], increase: b.incr[k],
        });
        delta = b.incr[k];
      } else {
        plain.push(i);
      }
      s.gross = a.gross + delta;
      augB.push(a);
      sepB.push(s);
      id += 1;
    }

    // PT-exempt staff: gross held below ₹12,000 in both months, the difference spread over the
    // rest of the bucket's continuing staff so every month-on-month change stays the same.
    const lowIdx = plain.slice(0, b.low);
    if (lowIdx.length) {
      const others = augB.map((_, i) => i).filter((i) => !lowIdx.includes(i));
      const moved = lowIdx.reduce((s, i) => s + augB[i].gross - LOW_GROSS, 0);
      const add = spread(moved, others.length);
      lowIdx.forEach((i) => {
        augB[i].gross = LOW_GROSS;
        sepB[i].gross = LOW_GROSS;
        lowIds.add(augB[i].employee_master_id);
      });
      others.forEach((i, j) => {
        augB[i].gross += add[j];
        sepB[i].gross += add[j];
      });
    }

    for (const g of b.joiners) {
      joinerNo += 1;
      const emp = makeEmployee(id, b, { date_of_joining: '2026-09-10', position_type: joinerNo <= 9 ? 'new' : 'replacement' });
      employees.push(emp);
      bucketOf.set(id, b);
      const s = snapRow('2026-09', emp, runIdFor('2026-09'), {
        paid_days: 21, proration_factor: f8(21 / 30), gross: g, ctc_monthly: NEW_HIRE_CTC,
      });
      sepB.push(s);
      id += 1;
    }
    const exitRows = [];
    for (let i = 0; i < b.exits; i += 1) {
      exitNo += 1;
      const emp = makeEmployee(id, b, { date_of_exit: '2026-09-01', exit_reason: EXIT_REASONS[(exitNo - 1) % EXIT_REASONS.length] });
      employees.push(emp);
      bucketOf.set(id, b);
      const a = snapRow('2026-08', emp, runIdFor('2026-08'), { gross: EXIT_PREV_GROSS });
      a.date_of_exit = '2026-09-01';
      const s = snapRow('2026-09', emp, runIdFor('2026-09'), { paid_days: 0, proration_factor: 0, gross: 0, fixed_earned: 0 });
      augB.push(a);
      exitRows.push(s);
      id += 1;
    }
    ER_KEYS.forEach((key, j) => {
      if (key === 'er_pf' || key === 'er_esi') return;
      spread(b.er[j], sepB.length).forEach((v, i) => { sepB[i][key] = v; });
      spread(b.er[j] - b.erD[j], augB.length).forEach((v, i) => { augB[i][key] = v; });
    });
    sep.push(...sepB, ...exitRows);
    aug.push(...augB);
  }

  for (const r of sep) {
    if (r.paid_days > 0) {
      r.insurance_source = 'premium';
      r.ctc_mediclaim_monthly = 0;
    }
  }
  for (const r of aug) r.ctc_mediclaim_monthly = r.insurance;

  applyStatutory(sep, { month: '2026-09', pfN: 236, esiWage: 1600000, esiEe: 12000, tds: 320000, tdsN: 64, deductions: 871000 }, bucketOf);
  applyStatutory(aug, { month: '2026-08', pfN: 230, esiWage: 1553846, esiEe: 11654, tds: 310000, tdsN: 62, deductions: 845200 }, bucketOf);

  return { employees, bucketOf, sep, aug, lowIds, increments };
}

/** Apr–Jul from the Aug roster, hitting the per-vertical totals; Gujarat LWF in June. */
function buildAprJul(core) {
  const roster = core.aug;
  const months = ['2026-04', '2026-05', '2026-06', '2026-07'];
  const out = Object.fromEntries(months.map((m) => [m, []]));
  const empById = new Map(core.employees.map((e) => [e.id, e]));
  const lwf = {};

  for (const blk of APR_JUL) {
    const vRoster = roster.filter((r) => r.vertical_code === blk.v);
    const n = vRoster.length;
    lwf[blk.v] = n * 12;
    const lowRows = vRoster.filter((r) => core.lowIds.has(r.employee_master_id));
    const lowSet = new Set(lowRows.map((r) => r.employee_master_id));
    const grossByMonth = spread(blk.gross, 4);
    grossByMonth[2] += blk.er[2] - lwf[blk.v];
    const keys = ['er_pf', 'er_esi', null, 'gratuity_prov', 'bonus_prov', 'insurance'];

    months.forEach((m, mi) => {
      const rows = vRoster.map((src) => {
        const emp = empById.get(src.employee_master_id);
        return snapRow(m, { ...emp, date_of_exit: null, status: 'Active' }, runIdFor(m), {
          date_of_exit: null, exit_reason: null,
        });
      });
      const normal = rows.filter((r) => !lowSet.has(r.employee_master_id));
      rows.filter((r) => lowSet.has(r.employee_master_id)).forEach((r) => { r.gross = LOW_GROSS; });
      spread(grossByMonth[mi] - LOW_GROSS * lowSet.size, normal.length).forEach((v, i) => { normal[i].gross = v; });
      keys.forEach((k, j) => {
        if (!k) return;
        spread(spread(blk.er[j], 4)[mi], rows.length).forEach((v, i) => { rows[i][k] = v; });
      });
      for (const r of rows) r.ctc_mediclaim_monthly = r.insurance;
      if (m === '2026-06') {
        for (const r of rows) {
          r.ee_lwf = 6;
          r.er_lwf = 12;
        }
      }
      out[m].push(...rows);
    });
  }
  for (const m of months) applyPlainStatutory(out[m]);
  return { months: out, lwf };
}

/** Oct 2025 – Mar 2026 (previous FY) for the 12-month trend; Gujarat LWF in December. */
function buildPrior(core) {
  const out = {};
  const empById = new Map(core.employees.map((e) => [e.id, e]));
  PRIOR_MONTHS.forEach((m, mi) => {
    const factor = 0.93 + mi * 0.01;
    out[m] = core.aug.map((src) => {
      const emp = empById.get(src.employee_master_id);
      const r = snapRow(m, { ...emp, date_of_exit: null, status: 'Active' }, runIdFor(m), {
        date_of_exit: null, exit_reason: null,
      });
      r.gross = core.lowIds.has(src.employee_master_id) ? LOW_GROSS : Math.round(src.gross * factor);
      r.ot_amount = Math.round(src.ot_amount * factor);
      for (const k of ['er_pf', 'er_esi', 'gratuity_prov', 'bonus_prov', 'insurance']) r[k] = Math.round(src[k] * factor);
      r.ctc_mediclaim_monthly = r.insurance;
      if (m === '2025-12') {
        r.ee_lwf = 6;
        r.er_lwf = 12;
      }
      return r;
    });
    applyPlainStatutory(out[m]);
  });
  return out;
}

function registerTotalsFor(month, rows) {
  const g = sum(rows, 'gross');
  const d = sum(rows, 'total_deductions');
  const n = sum(rows, 'net_pay');
  return {
    month_key: month, run_id: runIdFor(month), line_count: rows.length,
    gross: g, total_deductions: d, net_pay: n, header_gross: g, header_deductions: d, header_net: n,
  };
}

function statuteTotals(rows) {
  return {
    PF: sum(rows, 'emp_pf') + sum(rows, 'er_pf'),
    ESI: sum(rows, 'emp_esic') + sum(rows, 'er_esi'),
    PT: sum(rows, 'pt'),
    LWF: sum(rows, 'ee_lwf') + sum(rows, 'er_lwf'),
    TDS: sum(rows, 'tds'),
  };
}

/** Payment tracker rows as the lock writes them, plus the paid details entered later. */
function buildPayments(rowsByMonth) {
  const out = [];
  for (const m of LOCKED_MONTHS) {
    const t = statuteTotals(rowsByMonth[m]);
    for (const statute of ['PF', 'ESI', 'PT', 'LWF', 'TDS']) {
      if (!(t[statute] > 0)) continue;
      const due = calendarDueDate(statute, STATE, m);
      out.push({
        id: `mock-pay-${m}-${statute}`, wage_month: m, statute, state: STATE, run_id: runIdFor(m),
        amount: t[statute], due_date: due, paid_on: due ? addDays(due, -2) : null,
        challan_ref: `MOCK-CH-${m.replace('-', '')}-${statute}`, interest: 0, penalty: 0,
        challan_path: null, amount_changed_after_payment: false, note: null,
      });
    }
  }
  const set = (m, s, patch) => Object.assign(out.find((p) => p.wage_month === m && p.statute === s), patch);
  set('2026-09', 'TDS', { paid_on: '2026-10-06', challan_ref: 'MOCK-CIN-0510221' });
  set('2026-09', 'PF', { paid_on: null, challan_ref: null });
  set('2026-09', 'ESI', { paid_on: null, challan_ref: null });
  set('2026-09', 'PT', { paid_on: null, challan_ref: null });
  set('2026-08', 'PF', { paid_on: '2026-09-18', challan_ref: 'MOCK-TRRN-102388', interest: 1500, penalty: 350 });
  return out;
}

/** Synthetic rows (off by default) that exercise the Due soon / Overdue statuses on 10 Oct 2026. */
export const EXTRA_STATUS_PAYMENTS = Object.freeze([
  { id: 'mock-pay-extra-due-soon', wage_month: '2026-09', statute: 'LWF', state: 'GJ-TEST', run_id: null, amount: 1800,
    due_date: '2026-10-12', paid_on: null, challan_ref: null, interest: 0, penalty: 0, challan_path: null, note: 'Synthetic status test row' },
  { id: 'mock-pay-extra-overdue', wage_month: '2026-08', statute: 'LWF', state: 'GJ-TEST', run_id: null, amount: 900,
    due_date: '2026-10-05', paid_on: null, challan_ref: null, interest: 0, penalty: 0, challan_path: null, note: 'Synthetic status test row' },
]);

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------
/**
 * @param {{ includeUnassigned?: boolean }} options
 *   includeUnassigned adds one untagged employee to Sep 2026 (red "Unassigned" row test);
 *   off by default so the sample totals tie.
 */
export function buildMock({ includeUnassigned = false } = {}) {
  const core = buildCore();
  const aprJul = buildAprJul(core);
  const prior = buildPrior(core);
  const rowsByMonth = { ...prior, ...aprJul.months, '2026-08': core.aug, '2026-09': core.sep };

  if (includeUnassigned) {
    const emp = makeEmployee(9001, { v: null, d: 'Other' });
    emp._vertical = null;
    core.employees.push(emp);
    rowsByMonth['2026-09'] = [...rowsByMonth['2026-09'], snapRow('2026-09', emp, runIdFor('2026-09'), { gross: 18000, er_pf: 1800, emp_pf: 1800, pf_wage: 15000, total_deductions: 2000, net_pay: 16000 })];
  }

  const snapshot = LOCKED_MONTHS.flatMap((m) => rowsByMonth[m]);
  const draftLines = core.sep.filter((r) => r.paid_days > 0).map((r) => ({
    ...r, run_id: runIdFor(DRAFT_MONTH), month_key: DRAFT_MONTH, paid_days: 31, total_days: 31, proration_factor: 1,
  }));

  const runs = [
    ...LOCKED_MONTHS.map((m) => ({
      id: runIdFor(m), month_key: m, status: 'processed', is_locked: true,
      locked_at: `${addDays(`${m}-01`, daysIn(m) + 2)}T10:00:00+05:30`, line_count: rowsByMonth[m].length,
    })),
    { id: runIdFor(DRAFT_MONTH), month_key: DRAFT_MONTH, status: 'draft', is_locked: false, locked_at: null, line_count: draftLines.length },
  ];

  const tags = core.employees.map((e) => ({
    employee_master_id: e.id, vertical_code: e._vertical, grade: e._grade, cost_centre: e._cost_centre,
    position_type: e._position_type, exit_reason: e._exit_reason, work_state: STATE,
  }));

  const departments = [
    { department: 'Operations / Field', vertical_code: VA },
    { department: 'Sales & Business Dev.', vertical_code: VA },
    { department: 'Service & Maintenance', vertical_code: VA },
    { department: 'Admin & Accounts', vertical_code: VA },
    { department: 'Service', vertical_code: VB },
    { department: 'AMC Contracts', vertical_code: VB },
    { department: 'Projects', vertical_code: VC },
    { department: 'Projects Design', vertical_code: VC },
    { department: 'Finance', vertical_code: CORP },
    { department: 'HR', vertical_code: CORP },
    { department: 'Training Delivery', vertical_code: 'training' },
    { department: 'R&M Field', vertical_code: 'rm' },
    { department: 'MM Stores', vertical_code: 'mm' },
    { department: 'IEV Operations', vertical_code: 'iev' },
  ];

  const sharedEmp = core.employees.find((e) => e._vertical === CORP && !e.date_of_exit && !e._position_type);
  const allocations = [
    { id: 'mock-alloc-1', employee_master_id: sharedEmp.id, vertical_code: VA, pct: 50 },
    { id: 'mock-alloc-2', employee_master_id: sharedEmp.id, vertical_code: VB, pct: 50 },
  ];

  const ctcByVM = {};
  const hcByVM = {};
  for (const m of FY_MONTHS) {
    for (const r of rowsByMonth[m]) {
      const k = `${r.vertical_code}|${m}`;
      const ctc = r.gross + r.er_pf + r.er_esi + r.er_lwf + r.gratuity_prov + r.bonus_prov + r.leave_encash_prov + r.insurance;
      ctcByVM[k] = (ctcByVM[k] || 0) + ctc;
      if (r.paid_days > 0) hcByVM[k] = (hcByVM[k] || 0) + 1;
    }
  }
  const budget = [];
  for (const m of FY_MONTHS) {
    for (const v of [VA, VB, VC, CORP]) {
      const k = `${v}|${m}`;
      budget.push({
        id: `mock-budget-${v}-${m}`, vertical_code: v, month_key: m,
        budget_headcount: hcByVM[k] || 0, budget_ctc: Math.ceil((ctcByVM[k] || 0) / 10000) * 10000,
      });
    }
  }

  return {
    today: TODAY,
    state: STATE,
    company: COMPANY,
    verticalMap: VERTICAL_MAP,
    employees: core.employees,
    tags,
    departments,
    allocations,
    allocationEnabledByDefault: false,
    settings: [
      { key: 'company_name', value: COMPANY },
      { key: 'default_state', value: STATE },
      { key: 'gratuity_provision_pct', value: 4.81 },
      { key: 'bonus_provision_pct', value: 8.33 },
      { key: 'leave_encashment_provision_pct', value: 0 },
    ],
    rates: STATUTORY_RATES,
    calendar: COMPLIANCE_CALENDAR,
    premiums: [
      { id: 'mock-premium-2026', policy_name: 'Mock Group Mediclaim 2026-27', policy_start: '2026-09-01', policy_end: '2027-08-31',
        annual_premium: 720000, spread: 'twelve', first_charge_month: '2026-09-01', note: 'Apr–Aug 2026 have no premium (CTC mediclaim fallback)' },
    ],
    budget,
    increments: core.increments,
    access: [
      { id: 'mock-access-1', user_id: MOCK_USERS.verticalHead.id, vertical_code: VA, department: null, note: 'Mock vertical head (test only)' },
    ],
    recipients: [
      { id: 'mock-rcpt-1', email: 'cfo@example.test', label: 'CFO (mock)', active: true },
      { id: 'mock-rcpt-2', email: 'compliance@example.test', label: 'Compliance (mock)', active: true },
    ],
    runs,
    rowsByMonth,
    snapshot,
    draftLines,
    registerTotals: LOCKED_MONTHS.map((m) => registerTotalsFor(m, rowsByMonth[m])),
    payments: buildPayments(rowsByMonth),
    lwfJune: aprJul.lwf,
    newHires: core.sep.filter((r) => r.date_of_joining === '2026-09-10'),
    lowGrossIds: core.lowIds,
  };
}

/** Expected-figure gaps the Gujarat rules make unavoidable (asserted against the adjusted value). */
export function deviations(mock) {
  const lwf = Object.values(mock.lwfJune).reduce((s, x) => s + x, 0);
  const pfWage = sum(mock.rowsByMonth['2026-09'].filter((r) => r.emp_pf > 0), 'pf_wage');
  return {
    'R3 Employer LWF YTD': {
      spec: 6200, used: lwf,
      why: `Gujarat LWF employer ₹12 × ${lwf / 12} employees on the June register = ${lwf.toLocaleString('en-IN')}. 6,200 is not a multiple of 12 (nearest: 517 employees → 6,204), and the mock company has ~240 staff. The difference is held in June gross of the same vertical so every Total CTC (month, YTD, vertical) stays exact.`,
    },
    'R3 Gross YTD': {
      spec: 35820000, used: 35820000 + 6200 - lwf,
      why: 'Carries the LWF difference above, so Total CTC YTD stays 4,03,08,200.',
    },
    'R6 PF wage base': {
      spec: 3415000, used: pfWage,
      why: `12% of 34,15,000 is 4,09,800, so 4,10,000 cannot come from that wage base. Each PF wage is the smallest whole-rupee wage giving the employee's 12% exactly; the 236 wages total ${pfWage.toLocaleString('en-IN')} (${(pfWage - 3415000).toLocaleString('en-IN')} above the spec).`,
    },
  };
}

export const MOCK = buildMock();
