/**
 * Payroll MIS mock data — deterministic model.
 *
 * Builds every mock employee and every payroll line (Apr–Sep 2026) plus the salary-structure values
 * that the snapshot builder reads, so that the locked runs reproduce the sample figures in
 * docs/PROMPT_payroll_mis_7_reports.md. All money is held in paise (integers) to mirror numeric(14,2).
 *
 * Oct 2025 – Mar 2026 lines are copies of Apr 2026 (made in SQL), Oct 2026 is a Draft copy of Sep.
 */

export const LOCKED_MONTHS = [
  '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
  '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09',
];
export const EMBED_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
export const COPY_FROM_APRIL = LOCKED_MONTHS.slice(0, 6);
export const APR_JUL = ['2026-04', '2026-05', '2026-06', '2026-07'];
export const LWF_MONTHS = ['2025-12', '2026-06'];
export const DRAFT_MONTH = '2026-10';
export const RELOCK_MONTH = '2026-07';
export const STATE = 'Gujarat';

export const LWF_EE = 600;
export const LWF_ER = 1200;
export const PT_THRESHOLD = 1200000;
export const PT_AMOUNT = 20000;
export const SEP_PREMIUM_SHARE = 25000;

const rs = (rupees) => Math.round(rupees * 100);
export const daysIn = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** round(num/den) half away from zero; flags exact ties (Postgres numeric may break those differently). */
function rhalf(num, den) {
  const sign = (num < 0) !== (den < 0) ? -1 : 1;
  const a = Math.abs(num);
  const b = Math.abs(den);
  const q = Math.floor(a / b);
  const r = a - q * b;
  return { value: sign * (2 * r >= b ? q + 1 : q), tie: 2 * r === b };
}

/** round(present / total × v, 2) as the snapshot builder computes it (v in paise). */
export function prorate(vp, present, total) {
  const res = rhalf(vp * Math.round(present * 2), total * 2);
  if (res.tie) throw new Error(`Rounding tie for ${vp} × ${present}/${total}`);
  return res.value;
}

function spreadRupees(totalRupees, n) {
  if (n <= 0) return [];
  const base = Math.trunc(totalRupees / n);
  let rem = totalRupees - base * n;
  return Array.from({ length: n }, () => {
    const extra = rem === 0 ? 0 : Math.sign(rem);
    rem -= extra;
    return base + extra;
  });
}

/** Weighted integer split of totalUnits (rupees) with largest-remainder rounding. */
function splitWeighted(totalUnits, weights) {
  const wsum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (totalUnits * w) / wsum);
  const out = raw.map((x) => Math.floor(x));
  let rem = totalUnits - out.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem -= 1) out[order[k][1]] += 1;
  return out;
}

const BUCKETS = [
  { key: 'ops', v: 'manpower', depts: ['Operations / Field'], hc: 58, sepGross: 1261000, augCtc: 1335000, sepCtc: 1420000,
    ot: { aug: 62000, sep: 82000, n: 30, fixed: [[731, 4200, 11800], [688, 3900, 9500]] },
    joiners: [[16000, 21, 'new', true], [16000, 21, 'new', true], [26000, 24, 'new'], [26000, 24, 'new']],
    exits: 1, inc: 3, lop: { n: 7, present: 29 }, other: 10, incr: [], esi: { low: 2, hi: 2, hi18: 0 },
    designation: 'Field Technician', locations: ['Vadodara', 'Ahmedabad'] },
  { key: 'sales', v: 'manpower', depts: ['Sales & Business Dev.'], hc: 14, sepGross: 453000, augCtc: 475000, sepCtc: 510000,
    ot: { aug: 0, sep: 0, n: 0 }, joiners: [[25000, 24, 'new']], exits: 0, inc: 2, lop: null, other: 5, incr: [],
    esi: { low: 0, hi: 0, hi18: 0 }, nonPf: 3, uncovered: 2, designation: 'Sales Executive', locations: ['Ahmedabad', 'Vadodara'] },
  { key: 'svc', v: 'manpower', depts: ['Service & Maintenance'], hc: 16, sepGross: 377000, augCtc: 420000, sepCtc: 425000,
    ot: { aug: 18000, sep: 23000, n: 10 }, joiners: [], exits: 0, inc: 0, lop: null, other: 5, incr: [],
    esi: { low: 0, hi: 1, hi18: 0 }, designation: 'Service Technician', locations: ['Vadodara', 'Bharuch'] },
  { key: 'admin', v: 'manpower', depts: ['Admin & Accounts'], hc: 8, sepGross: 249000, augCtc: 280000, sepCtc: 280000,
    ot: { aug: 0, sep: 0, n: 0 }, joiners: [], exits: 0, inc: 0, lop: null, other: 0, incr: [],
    esi: { low: 0, hi: 0, hi18: 0 }, nonPf: 3, uncovered: 2, designation: 'Accounts Executive', locations: ['Vadodara'] },
  { key: 'amc', v: 'amc', depts: ['Service', 'AMC Coordination'], hc: 72, sepGross: 1830000, augCtc: 2010000, sepCtc: 2055000,
    ot: { aug: 56000, sep: 70000, n: 14, fixed: [[912, 0, 4100]] },
    joiners: [[16000, 21, 'replacement', true], [24000, 21, 'new'], [24000, 21, 'replacement'], [38000, 12, 'new']],
    exits: 2, inc: 2, lop: { n: 14, present: 29.5 }, other: 0, incr: [7000], esi: { low: 10, hi: 25, hi18: 2 },
    designation: 'AMC Technician', locations: ['Surat', 'Ahmedabad', 'Rajkot'] },
  { key: 'projects', v: 'projects', depts: ['Project Execution', 'Design & Estimation'], hc: 58, sepGross: 1450000, augCtc: 1605000, sepCtc: 1628000,
    ot: { aug: 22000, sep: 25000, n: 6 }, joiners: [[28000, 15, 'new'], [28000, 15, 'replacement']],
    exits: 1, inc: 1, lop: null, other: 5, incr: [5000], esi: { low: 10, hi: 31, hi18: 2 },
    designation: 'Project Engineer', locations: ['Ahmedabad', 'Gandhinagar', 'Vadodara'] },
  { key: 'corp', v: 'corporate', depts: ['Corporate Finance', 'HR & Admin'], hc: 22, sepGross: 620000, augCtc: 636000, sepCtc: 699000,
    ot: { aug: 7000, sep: 10000, n: 4 }, joiners: [[30000, 24, 'new']], exits: 0, inc: 1, arrears: true, lop: null, other: 5,
    incr: [10000], esi: { low: 3, hi: 7, hi18: 0 }, nonPf: 6, uncovered: 4, designation: 'Finance Executive', locations: ['Vadodara', 'Ahmedabad'] },
];

/** Apr–Jul 2026 totals (sum of the four months) per vertical: Total CTC YTD − Aug − Sep. */
const APR_JUL_CTC = { manpower: 9835000, amc: 7875000, projects: 6227000, corporate: 2593200 };
const APR_JUL_MONTHLY = { er_pf: 388500, er_esi: 49875, gratuity: 142625, bonus: 99500, insurance: 58000 };
const AUG_TOTALS = { er_pf: 396000, er_esi: 50500, gratuity: 144500, bonus: 102000, insurance: 58000, deductions: 845200 };
const SEP_TOTALS = { er_pf: 410000, er_esi: 52000, gratuity: 150000, bonus: 105000, loans: 85000, tds: 320000 };
const LOAN_COUNT = 34;
const TDS_COUNT = 64;

export const VERTICAL_LABELS = { manpower: 'A', amc: 'B', projects: 'C', corporate: 'Corporate' };
export const GUJARAT_CITIES = ['Vadodara', 'Ahmedabad', 'Surat', 'Rajkot', 'Bharuch', 'Gandhinagar'];

function splitRate(ratePaise) {
  const basic = Math.round(ratePaise / 2 / 100) * 100;
  const hra = Math.round((ratePaise * 0.2) / 100) * 100;
  return { basic, hra, special: ratePaise - basic - hra };
}

function gradeFor(ratePaise) {
  if (ratePaise < rs(15000)) return 'G1';
  if (ratePaise < rs(25000)) return 'G2';
  if (ratePaise < rs(40000)) return 'G3';
  return 'G4';
}

/** Smallest whole-rupee wage w with round(0.12 × w) = pf (keeps 12% exact on every line). */
function minimalPfWage(pfRupees) {
  return Math.ceil((100 * pfRupees - 50) / 12);
}

export function buildMockModel() {
  const reserved = new Set([688, 731, 912]);
  let nextN = 1;
  const nextCode = () => {
    while (reserved.has(nextN)) nextN += 1;
    return nextN++;
  };
  const employees = [];
  const byBucket = {};

  for (const b of BUCKETS) {
    const list = [];
    const add = (e) => {
      const n = e.n ?? nextCode();
      const idx = list.length;
      const dept = e.dept || (b.depts.length > 1 && idx % 5 === 4 ? b.depts[1] : b.depts[0]);
      const emp = {
        n, bucket: b.key, vertical: b.v, dept, kind: e.kind, rate: e.rate ?? null, incr: e.incr || 0,
        esi: !!e.esi, otAug: e.otAug || 0, otSep: e.otSep || 0, incSep: e.incSep || 0, arrSep: e.arrSep || 0,
        otherSep: e.otherSep || 0, presentSep: e.presentSep ?? null, joiner: e.joiner || null, exit: !!e.exit,
        fromMonth: null, pf: true, covered: !e.exit, tds: 0, loanSep: 0, loanAug: 0, grat: 0, bonus: 0, med: 0,
        location: b.locations[idx % b.locations.length], designation: b.designation,
      };
      list.push(emp);
      return emp;
    };

    const fixedOt = b.ot.fixed || [];
    const restN = b.ot.n - fixedOt.length;
    const augRest = spreadRupees(b.ot.aug - fixedOt.reduce((s, x) => s + x[1], 0), restN);
    const dRest = spreadRupees(b.ot.sep - b.ot.aug - fixedOt.reduce((s, x) => s + (x[2] - x[1]), 0), restN);
    for (const [n, a, s] of fixedOt) {
      add({ n, kind: 'ot', otAug: rs(a), otSep: rs(s), dept: b.depts[0] });
    }
    for (let i = 0; i < restN; i += 1) add({ kind: 'ot', otAug: rs(augRest[i]), otSep: rs(augRest[i] + dRest[i]) });
    for (let i = 0; i < b.inc; i += 1) {
      if (b.arrears && i === 0) add({ kind: 'arr', arrSep: rs(2000) });
      else add({ kind: 'inc', incSep: rs(2000) });
    }
    if (b.lop) for (let i = 0; i < b.lop.n; i += 1) add({ kind: 'lop', rate: rs(30000), presentSep: b.lop.present });
    for (let i = 0; i < b.other; i += 1) add({ kind: 'other', otherSep: rs(700) });
    for (const x of b.incr) add({ kind: 'incr', incr: rs(x) });
    for (let i = 0; i < b.esi.low; i += 1) add({ kind: 'stable', esi: true, rate: rs(11200) });
    for (let i = 0; i < b.esi.hi; i += 1) add({ kind: 'stable', esi: true, rate: rs(18400) });
    for (let i = 0; i < b.esi.hi18; i += 1) add({ kind: 'stable', esi: true, rate: rs(18000) });
    const continuing = b.hc - b.joiners.length;
    while (list.length < continuing) add({ kind: 'stable' });
    if (list.length !== continuing) throw new Error(`Bucket ${b.key}: ${list.length} continuing, expected ${continuing}`);
    for (const [rate, present, pos, esi] of b.joiners) {
      add({ kind: 'joiner', rate: rs(rate), esi: !!esi, presentSep: present,
        joiner: { present, doj: `2026-09-${String(30 - present + 1).padStart(2, '0')}`, pos } });
    }
    for (let i = 0; i < b.exits; i += 1) add({ kind: 'exit', rate: rs(14500), exit: true, esi: true });
    byBucket[b.key] = list;
    employees.push(...list);
  }

  const isContinuing = (e) => e.kind !== 'joiner' && e.kind !== 'exit';

  // Free monthly rates: everything not pinned by the sample is solved so each department hits its Sep gross.
  for (const b of BUCKETS) {
    const list = byBucket[b.key];
    let pinned = 0;
    const free = [];
    for (const e of list) {
      pinned += e.otSep + e.incSep + e.arrSep + e.otherSep + e.incr;
      if (e.kind === 'exit') continue;
      if (e.rate == null) {
        free.push(e);
        continue;
      }
      pinned += sepFixedEarned(e);
    }
    const target = rs(b.sepGross) - pinned;
    if (!free.length) throw new Error(`Bucket ${b.key} has no free employee`);
    const avg = target / free.length / 100;
    const pattern = [0.8, 1.15, 0.9, 1.05, 1.25, 0.85, 1.0, 1.1, 0.95, 0.75, 1.2];
    let used = 0;
    free.forEach((e, i) => {
      if (i === free.length - 1) return;
      e.rate = Math.round((avg * pattern[i % pattern.length]) / 100) * 100 * 100;
      used += e.rate;
    });
    const last = free[free.length - 1];
    last.rate = target - used;
    last.grossBalancer = true;
    if (last.rate < rs(13000) || last.rate % 100 !== 0) throw new Error(`Bucket ${b.key}: balancing rate ${last.rate / 100}`);
  }

  for (const e of employees) {
    e.rateSep = e.rate + e.incr;
    e.grade = gradeFor(e.rateSep);
  }

  // One Vertical C employee joins on 1 Jul 2026 so Apr–Jul gross stays under the vertical CTC target.
  const lateJoiner = byBucket.projects.find((e) => e.kind === 'other' && !e.grossBalancer);
  lateJoiner.fromMonth = '2026-07';

  // PF membership: 12 senior employees opted out (Sales 3, Admin 3, Corporate 6).
  for (const b of BUCKETS) {
    if (!b.nonPf) continue;
    const cands = byBucket[b.key].filter((e) => isContinuing(e) && !e.esi && !e.grossBalancer)
      .sort((x, y) => y.rateSep - x.rateSep);
    cands.slice(0, b.nonPf).forEach((e) => { e.pf = false; });
  }
  // Mediclaim: 8 employees without cover; exits never have it.
  for (const b of BUCKETS) {
    if (!b.uncovered) continue;
    const cands = byBucket[b.key].filter((e) => isContinuing(e) && !e.esi && e.covered);
    cands.slice(-b.uncovered).forEach((e) => { e.covered = false; });
  }

  // TDS: the 64 highest Sep earners, Sep total 3,20,000 (same amount in earlier months).
  const sepPaid = employees.filter((e) => e.kind !== 'exit');
  const byGross = [...sepPaid].filter((e) => e.kind !== 'joiner').sort((x, y) => sepGross(y) - sepGross(x) || x.n - y.n);
  const tdsEmps = byGross.slice(0, TDS_COUNT);
  splitWeighted(SEP_TOTALS.tds / 10, tdsEmps.map((e) => sepGross(e))).forEach((v, i) => { tdsEmps[i].tds = rs(v * 10); });

  // Loans: 34 employees (not ESI, not joiners); Sep 85,000; Aug balances the Aug deduction total.
  const loanEmps = byGross.filter((e) => !e.esi).slice(10, 10 + LOAN_COUNT);
  spreadRupees(SEP_TOTALS.loans, LOAN_COUNT).forEach((v, i) => { loanEmps[i].loanSep = rs(v); });

  // Employee PF (whole rupees).
  const pfSep = new Map();
  const pfFull = new Map();
  let esiContPf = 0;
  for (const e of employees) {
    if (!e.pf || e.kind === 'exit') continue;
    if (e.esi && e.kind !== 'joiner') {
      const v = Math.round((0.12 * splitRate(e.rate).basic) / 100);
      pfFull.set(e.n, v);
      pfSep.set(e.n, v);
      esiContPf += v;
    }
  }
  let joinerPf = 0;
  for (const e of employees.filter((x) => x.kind === 'joiner')) {
    const g = sepFixedEarned(e) / 100;
    const v = e.esi ? Math.round(0.12 * (g / 2)) : Math.round(0.12 * Math.round(0.9 * g));
    pfSep.set(e.n, v);
    joinerPf += v;
  }
  const others = employees.filter((e) => e.pf && isContinuing(e) && !e.esi);
  const othersTarget = SEP_TOTALS.er_pf - esiContPf - joinerPf;
  const full = splitWeighted(othersTarget, others.map((e) => e.rate));
  others.forEach((e, i) => pfFull.set(e.n, full[i]));
  const sepOf = (e) => (e.presentSep ? Math.round((pfFull.get(e.n) * e.presentSep) / 30) : pfFull.get(e.n));
  let othersSep = others.reduce((s, e) => s + sepOf(e), 0);
  const fixPf = others.filter((e) => !e.presentSep).sort((x, y) => y.rate - x.rate)[0];
  pfFull.set(fixPf.n, pfFull.get(fixPf.n) + (othersTarget - othersSep));
  othersSep = others.reduce((s, e) => s + sepOf(e), 0);
  others.forEach((e) => pfSep.set(e.n, sepOf(e)));
  const contFullSum = [...pfFull.values()].reduce((s, v) => s + v, 0);
  const exits = employees.filter((e) => e.kind === 'exit');
  const exitPf = spreadRupees(AUG_TOTALS.er_pf - contFullSum, exits.length);
  exits.forEach((e, i) => pfFull.set(e.n, exitPf[i]));
  if (exitPf.some((v) => v < 300 || v > 1800)) throw new Error(`Exit PF out of range: ${exitPf}`);

  // Structure values (rupees, whole): gratuity 1.5% / ex-gratia 1% of the monthly rate; mediclaim 250.
  for (const e of employees) {
    e.grat = Math.round((e.rateSep * 0.015) / 100) * 100;
    e.bonus = Math.round((e.rateSep * 0.01) / 100) * 100;
    e.med = e.covered ? rs(250) : 0;
  }

  // ------------------------------------------------------------------------------------------------
  // Month-by-month lines and structure state.
  // ------------------------------------------------------------------------------------------------
  const present = (e, mk) => {
    if (e.kind === 'joiner') return mk === '2026-09';
    if (e.kind === 'exit') return mk <= '2026-09';
    if (e.fromMonth && mk < e.fromMonth) return false;
    return true;
  };
  const balancerFor = {};
  for (const b of BUCKETS) {
    balancerFor[b.key] = byBucket[b.key].find((e) => isContinuing(e) && !e.presentSep && !e.fromMonth && e.kind !== 'incr'
      && e.covered && !e.grossBalancer && !reserved.has(e.n));
    balancerFor[b.key].employerBalancer = true;
  }
  const medBalancer = byBucket.amc.find((e) => e.kind === 'stable' && e.esi && e.covered);
  medBalancer.medBalancer = true;

  const struct = {};
  const setStruct = (mk, e, vals) => { (struct[mk] ||= new Map()).set(e.n, vals); };

  const lines = {};
  const linesForMonth = (mk) => {
    const total = daysIn(mk);
    const out = [];
    for (const e of employees) {
      if (!present(e, mk)) continue;
      const isSep = mk === '2026-09';
      const isAug = mk === '2026-08';
      const exitSep = e.kind === 'exit' && isSep;
      let presentDays = total;
      if (isSep && e.presentSep) presentDays = e.presentSep;
      if (exitSep) presentDays = 0;
      const rate = isSep ? e.rateSep : e.rate;
      const parts = splitRate(rate);
      const earned = {
        basic: prorate(parts.basic, presentDays, total),
        hra: prorate(parts.hra, presentDays, total),
        special: prorate(parts.special, presentDays, total),
      };
      const ot = isSep ? e.otSep : isAug ? e.otAug : 0;
      const incentive = isSep ? e.incSep : 0;
      const arrears = isSep ? e.arrSep : 0;
      const otherEarn = isSep ? e.otherSep : 0;
      out.push({
        e, n: e.n, month: mk, present: presentDays, total, rate, parts, earned, ot, incentive, arrears,
        other: otherEarn, emp_pf: 0, pf_wage: 0, emp_esic: 0, pt: 0, tds: 0, loan: 0, ee_lwf: 0, er_lwf: 0,
        er_pf_full: 0, er_esic_full: 0,
      });
    }
    return out;
  };
  for (const mk of EMBED_MONTHS) lines[mk] = linesForMonth(mk);

  const grossOf = (l) => l.earned.basic + l.earned.hra + l.earned.special + l.ot + l.incentive + l.arrears + l.other;

  // PF per month.
  for (const mk of EMBED_MONTHS) {
    const ls = lines[mk].filter((l) => l.e.pf && l.present > 0);
    if (mk === '2026-09') {
      for (const l of ls) l.emp_pf = rs(pfSep.get(l.n));
    } else if (mk === '2026-08') {
      for (const l of ls) l.emp_pf = rs(pfFull.get(l.n));
    } else {
      const natural = ls.reduce((s, l) => s + pfFull.get(l.n), 0);
      const k = APR_JUL_MONTHLY.er_pf / natural;
      const vals = ls.map((l) => Math.round(pfFull.get(l.n) * k));
      const diff = APR_JUL_MONTHLY.er_pf - vals.reduce((s, v) => s + v, 0);
      const big = vals.indexOf(Math.max(...vals));
      vals[big] += diff;
      ls.forEach((l, i) => { l.emp_pf = rs(vals[i]); });
    }
    for (const l of ls) {
      l.pf_wage = rs(minimalPfWage(l.emp_pf / 100));
      l.er_pf_full = erFullFor(l.emp_pf, l.present, l.total);
    }
  }

  // ESI per month (exact 0.75% / 3.25% in Sep; employer share scaled to the sample totals before Sep).
  for (const mk of EMBED_MONTHS) {
    const ls = lines[mk].filter((l) => l.e.esi && l.present > 0);
    for (const l of ls) l.emp_esic = rs(Math.ceil((grossOf(l) / 100) * 0.0075 - 1e-9));
    let er = ls.map((l) => Math.ceil((grossOf(l) / 100) * 0.0325 - 1e-9));
    const target = mk === '2026-09' ? SEP_TOTALS.er_esi : mk === '2026-08' ? AUG_TOTALS.er_esi : APR_JUL_MONTHLY.er_esi;
    if (mk !== '2026-09') {
      const natural = er.reduce((s, v) => s + v, 0);
      er = er.map((v) => Math.round((v * target) / natural));
      const diff = target - er.reduce((s, v) => s + v, 0);
      er[er.indexOf(Math.max(...er))] += diff;
    }
    ls.forEach((l, i) => { l.er_esic_full = erFullFor(rs(er[i]), l.present, l.total); });
  }

  // PT, TDS, loans, LWF.
  for (const mk of EMBED_MONTHS) {
    for (const l of lines[mk]) {
      if (l.present <= 0) continue;
      l.pt = grossOf(l) > PT_THRESHOLD ? PT_AMOUNT : 0;
      l.tds = l.e.tds;
      l.loan = mk === '2026-09' ? l.e.loanSep : 0;
      if (mk === '2026-06') { l.ee_lwf = LWF_EE; l.er_lwf = LWF_ER; }
    }
  }
  {
    const aug = lines['2026-08'];
    const fixedDed = aug.reduce((s, l) => s + l.emp_pf + l.emp_esic + l.pt + l.tds, 0);
    const loanTotal = rs(AUG_TOTALS.deductions) - fixedDed;
    if (loanTotal < 0) throw new Error('Aug loans negative');
    const loanLines = aug.filter((l) => loanEmps.includes(l.e));
    spreadRupees(loanTotal / 100, loanLines.length).forEach((v, i) => {
      loanLines[i].loan = rs(v);
      loanLines[i].e.loanAug = rs(v);
    });
    for (const mk of APR_JUL) for (const l of lines[mk]) if (l.e.loanAug) l.loan = l.e.loanAug;
  }

  // Structure state per month: non-balancers constant, balancers solve the employer totals.
  const empLine = (mk, e) => lines[mk].find((l) => l.e === e);
  const erParts = (l, st, mk) => {
    const p = { pf: prorate(l.er_pf_full, l.present, l.total), esi: prorate(l.er_esic_full, l.present, l.total) };
    p.grat = prorate(st.grat, l.present, l.total);
    p.bonus = prorate(st.bonus, l.present, l.total);
    if (mk === '2026-09') p.ins = st.med > 0 && l.present > 0 ? SEP_PREMIUM_SHARE : 0;
    else p.ins = prorate(st.med, l.present, l.total);
    p.lwf = l.er_lwf;
    return p;
  };

  for (const mk of EMBED_MONTHS) {
    const base = new Map(employees.map((e) => [e.n, { grat: e.grat, bonus: e.bonus, med: e.med }]));
    // Mediclaim balancer: fallback insurance 58,000 a month (Apr–Aug).
    if (mk !== '2026-09') {
      const others = lines[mk].filter((l) => l.e !== medBalancer).reduce((s, l) => s + prorate(base.get(l.n).med, l.present, l.total), 0);
      base.get(medBalancer.n).med = rs(APR_JUL_MONTHLY.insurance) - others;
    } else {
      base.get(medBalancer.n).med = struct['2026-08'].get(medBalancer.n).med;
    }
    const balancers = BUCKETS.map((b) => balancerFor[b.key]);
    const sumParts = (filter) => {
      const acc = { pf: 0, esi: 0, grat: 0, bonus: 0, ins: 0, lwf: 0 };
      for (const l of lines[mk]) {
        if (!filter(l)) continue;
        const p = erParts(l, base.get(l.n), mk);
        for (const k of Object.keys(acc)) acc[k] += p[k];
      }
      return acc;
    };
    const G = rs(mk === '2026-09' ? SEP_TOTALS.gratuity : mk === '2026-08' ? AUG_TOTALS.gratuity : APR_JUL_MONTHLY.gratuity);
    const B = rs(mk === '2026-09' ? SEP_TOTALS.bonus : mk === '2026-08' ? AUG_TOTALS.bonus : APR_JUL_MONTHLY.bonus);
    const nonBal = sumParts((l) => !balancers.includes(l.e));
    const gLeft = G - nonBal.grat;
    const bLeft = B - nonBal.bonus;
    let slack;
    if (mk === '2026-08' || mk === '2026-09') {
      slack = BUCKETS.map((b) => {
        const gross = lines[mk].filter((l) => l.e.bucket === b.key).reduce((s, l) => s + grossOf(l), 0);
        const target = rs(mk === '2026-09' ? b.sepCtc : b.augCtc) - gross;
        const p = sumParts((l) => l.e.bucket === b.key && !balancers.includes(l.e));
        const bal = erParts(empLine(mk, balancerFor[b.key]), { ...base.get(balancerFor[b.key].n), grat: 0, bonus: 0 }, mk);
        return target - (p.pf + p.esi + p.grat + p.bonus + p.ins + p.lwf) - (bal.pf + bal.esi + bal.ins + bal.lwf);
      });
      const tot = slack.reduce((s, x) => s + x, 0);
      if (tot !== gLeft + bLeft) throw new Error(`${mk}: employer slack ${tot} ≠ ${gLeft + bLeft}`);
    } else {
      const hc = BUCKETS.map((b) => lines[mk].filter((l) => l.e.bucket === b.key).length);
      const w = splitWeighted((gLeft + bLeft), hc);
      slack = w;
    }
    // Split each department's slack into gratuity and ex-gratia in the overall ratio.
    const gShares = splitWeighted(gLeft, slack.map((s) => Math.max(s, 0)));
    BUCKETS.forEach((b, i) => {
      const e = balancerFor[b.key];
      const g = gShares[i];
      const bonus = slack[i] - g;
      if (g < 0 || bonus < 0) throw new Error(`${mk} ${b.key}: balancer gratuity ${g / 100} / ex-gratia ${bonus / 100}`);
      base.get(e.n).grat = g;
      base.get(e.n).bonus = bonus;
    });
    struct[mk] = base;
  }

  // Apr–Jul gross: natural gross plus per-vertical "other earnings" so vertical CTC hits the YTD sample.
  const verticals = Object.keys(APR_JUL_CTC);
  const grossBalancers = {};
  for (const v of verticals) {
    const pool = employees.filter((e) => e.vertical === v && isContinuing(e) && !e.esi && !e.fromMonth && !e.presentSep && e.pf
      && !reserved.has(e.n));
    grossBalancers[v] = pool.slice(0, 6);
  }
  for (const v of verticals) {
    let employer = 0;
    let natural = 0;
    for (const mk of APR_JUL) {
      for (const l of lines[mk]) {
        if (l.e.vertical !== v) continue;
        const p = erParts(l, struct[mk].get(l.n), mk);
        employer += p.pf + p.esi + p.grat + p.bonus + p.ins + p.lwf;
        natural += grossOf(l);
      }
    }
    const residual = rs(APR_JUL_CTC[v]) - employer - natural;
    if (residual < 0) throw new Error(`Vertical ${v}: Apr–Jul gross already above target by ${-residual / 100}`);
    const perMonth = Array.from({ length: 4 }, (_, i) => Math.floor(residual / 4) + (i < residual % 4 ? 1 : 0));
    APR_JUL.forEach((mk, i) => {
      const bal = grossBalancers[v];
      const each = Array.from({ length: bal.length }, (_, k) => Math.floor(perMonth[i] / bal.length) + (k < perMonth[i] % bal.length ? 1 : 0));
      bal.forEach((e, k) => { empLine(mk, e).other = each[k]; });
    });
  }
  for (const mk of APR_JUL) for (const l of lines[mk]) l.pt = grossOf(l) > PT_THRESHOLD ? PT_AMOUNT : 0;

  // Finalise line amounts.
  for (const mk of EMBED_MONTHS) {
    for (const l of lines[mk]) {
      l.gross = grossOf(l);
      l.total_ded = l.emp_pf + l.emp_esic + l.pt + l.tds + l.loan + l.ee_lwf;
      l.net = l.gross - l.total_ded;
      if (l.net < 0) throw new Error(`${mk} ${l.n}: negative net`);
    }
  }

  // Structure changes month over month (Apr is the initial state).
  const structChanges = [];
  EMBED_MONTHS.forEach((mk, i) => {
    if (i === 0) return;
    const prev = struct[EMBED_MONTHS[i - 1]];
    for (const [n, v] of struct[mk]) {
      const p = prev.get(n);
      if (p.grat !== v.grat || p.bonus !== v.bonus || p.med !== v.med) structChanges.push({ month: mk, n, ...v });
    }
  });

  // Budget master: one row per vertical per month, budget = actual headcount + 2, CTC rounded up to a lakh.
  const budget = [];
  for (const mk of EMBED_MONTHS) {
    for (const v of verticals) {
      let hc = 0;
      let ctc = 0;
      for (const l of lines[mk]) {
        if (l.e.vertical !== v) continue;
        if (l.present > 0) hc += 1;
        const p = erParts(l, struct[mk].get(l.n), mk);
        ctc += l.gross + p.pf + p.esi + p.grat + p.bonus + p.ins + p.lwf;
      }
      budget.push({ month: mk, vertical: v, headcount: hc + 2, ctc: Math.ceil(ctc / 100 / 100000) * 100000 });
    }
  }

  return {
    employees, lines, struct, structChanges, budget, buckets: BUCKETS, balancerFor, medBalancer,
    lateJoiner, grossBalancers, loanEmps, tdsEmps, pfSep, pfFull,
  };
}

function sepFixedEarned(e) {
  const rate = e.rate + (e.incr || 0);
  const parts = splitRate(rate);
  const p = e.kind === 'exit' ? 0 : e.presentSep ?? 30;
  return prorate(parts.basic, p, 30) + prorate(parts.hra, p, 30) + prorate(parts.special, p, 30);
}

function sepGross(e) {
  return sepFixedEarned(e) + e.otSep + e.incSep + e.arrSep + e.otherSep;
}

/** Full-month employer amount whose proration gives exactly `target` paise. */
function erFullFor(target, present, total) {
  if (target === 0 || present === total) return target;
  if (present <= 0) return 0;
  const guess = Math.round((target * total) / present);
  for (let d = 0; d < 50; d += 1) {
    for (const c of [guess + d, guess - d]) {
      try {
        if (prorate(c, present, total) === target) return c;
      } catch {
        // tie — try the next candidate
      }
    }
  }
  throw new Error(`No full amount for ${target} at ${present}/${total}`);
}

export const paiseToSql = (p) => {
  const neg = p < 0;
  const a = Math.abs(p);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};
