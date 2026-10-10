/**
 * Payroll MIS — shared figures for Reports 1–7.
 * Pure functions over snapshot rows (one row per employee per locked month, as returned by
 * admin_payroll_mis_rows). Every report uses the same cost definitions so totals tie across reports.
 */

/** Same codes as the billing verticals, plus an MIS-only shared bucket. */
export const MIS_VERTICALS = [
  { code: 'manpower', label: 'Manpower' },
  { code: 'training', label: 'Training' },
  { code: 'rm', label: 'R&M' },
  { code: 'mm', label: 'M&M' },
  { code: 'amc', label: 'AMC' },
  { code: 'iev', label: 'IEV' },
  { code: 'projects', label: 'Projects' },
  { code: 'corporate', label: 'Corporate (shared)' },
];
export const UNASSIGNED = '__unassigned';

export function verticalLabel(code) {
  if (!code || code === UNASSIGNED) return 'Unassigned';
  const hit = MIS_VERTICALS.find((v) => v.code === String(code).toLowerCase());
  return hit ? hit.label : String(code);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------
export function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Integer paise, so sums of 2-decimal amounts stay exact. */
const paise = (v) => Math.round(toNum(v) * 100);
const fromPaise = (p) => p / 100;

/** Round half away from zero. */
export function roundTo(value, decimals = 0) {
  const f = 10 ** decimals;
  const n = toNum(value) * f;
  return (Math.sign(n) * Math.round(Math.abs(n) + 1e-9)) / f;
}

export const round2 = (v) => roundTo(v, 2);

/** Common rule 5: (current − previous) ÷ previous × 100, 1 decimal; null means "New". */
export function changePct(current, previous) {
  const prev = toNum(previous);
  if (prev === 0) return null;
  return roundTo(((toNum(current) - prev) / prev) * 100, 1);
}

/** Whole rupees with Indian grouping (12,34,567). */
export function formatInr(value, { sign = false } = {}) {
  const n = roundTo(value, 0);
  const abs = Math.abs(n);
  const s = String(abs);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  if (n < 0) return `−${grouped}`;
  return sign && n > 0 ? `+${grouped}` : grouped;
}

export function formatCount(value, { sign = false } = {}) {
  const n = roundTo(value, 2);
  const text = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(2).replace(/0$/, '');
  if (n < 0) return `−${text}`;
  return sign && n > 0 ? `+${text}` : text;
}

export function formatChangePct(pct) {
  if (pct === null || pct === undefined) return 'New';
  const fixed = Math.abs(pct).toFixed(1);
  if (pct > 0) return `+${fixed}%`;
  if (pct < 0) return `−${fixed}%`;
  return '0.0%';
}

export function formatSharePct(pct) {
  if (pct === null || pct === undefined) return '—';
  const n = roundTo(pct, 0);
  return n < 0 ? `−${Math.abs(n)}%` : `${n}%`;
}

// ---------------------------------------------------------------------------
// Months and periods
// ---------------------------------------------------------------------------
export function monthLabel(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number);
  if (!y || !m) return String(monthKey || '');
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = String(monthKey).split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Indian financial year start (April) for a month key, e.g. 2026-09 → 2026-04, 2027-02 → 2026-04. */
export function fyStartMonth(monthKey) {
  const [y, m] = String(monthKey).split('-').map(Number);
  return `${m >= 4 ? y : y - 1}-04`;
}

export function fyLabel(fyStartYear) {
  return `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Period → { from, to, label }.
 *   { type: 'month', month }            single month
 *   { type: 'range', from, to }         month range
 *   { type: 'quarter', fy, quarter }    fy = start year (2026 → Apr 2026–Mar 2027), quarter 1–4
 *   { type: 'fy', fy }                  April–March
 *   { type: 'ytd', month }              April of that FY to the month
 */
export function resolvePeriod(period) {
  const p = period || {};
  if (p.type === 'range') {
    const [from, to] = [p.from, p.to].sort();
    return { from, to, label: from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}` };
  }
  if (p.type === 'quarter') {
    const fy = Number(p.fy);
    const q = Math.min(4, Math.max(1, Number(p.quarter) || 1));
    const from = shiftMonth(`${fy}-04`, (q - 1) * 3);
    return { from, to: shiftMonth(from, 2), label: `Q${q} ${fyLabel(fy)}` };
  }
  if (p.type === 'fy') {
    const fy = Number(p.fy);
    return { from: `${fy}-04`, to: `${fy + 1}-03`, label: fyLabel(fy) };
  }
  if (p.type === 'ytd') {
    const from = fyStartMonth(p.month);
    return { from, to: p.month, label: `YTD ${monthLabel(from)} – ${monthLabel(p.month)}` };
  }
  return { from: p.month, to: p.month, label: monthLabel(p.month) };
}

/**
 * Locked months in the period, and the same number of locked months immediately before it
 * ("Previous" = the immediately previous locked month for a single month).
 */
export function periodMonths(period, lockedMonthKeys) {
  const { from, to, label } = resolvePeriod(period);
  const sorted = [...new Set(lockedMonthKeys || [])].sort();
  const current = sorted.filter((m) => m >= from && m <= to);
  const earlier = sorted.filter((m) => m < from);
  const previous = current.length ? earlier.slice(-current.length) : [];
  return { from, to, label, current, previous, last: current[current.length - 1] || null };
}

// ---------------------------------------------------------------------------
// Row helpers and standard cost definitions
// ---------------------------------------------------------------------------
export const EMPLOYER_PARTS = ['er_pf', 'er_esi', 'er_lwf', 'gratuity_prov', 'bonus_prov', 'leave_encash_prov', 'insurance'];

export const isPaid = (r) => toNum(r.paid_days) > 0;
export const employerStatutory = (r) => fromPaise(paise(r.er_pf) + paise(r.er_esi) + paise(r.er_lwf));
export const employerCost = (r) => fromPaise(EMPLOYER_PARTS.reduce((s, k) => s + paise(r[k]), 0));
export const totalCtc = (r) => fromPaise(paise(r.gross) + paise(employerCost(r)));
export const vertKey = (r) => (r.vertical_code ? String(r.vertical_code).toLowerCase() : UNASSIGNED);
export const deptKey = (r) => (r.department ? String(r.department) : 'Unassigned');

const inMonth = (date, monthKey) => !!date && String(date).slice(0, 7) === monthKey;
const inRange = (date, from, to) => {
  const m = date ? String(date).slice(0, 7) : '';
  return !!m && m >= from && m <= to;
};

/** Standard filters. Empty value = all. Vertical '__unassigned' selects untagged staff. */
export function applyFilters(rows, filters = {}) {
  const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (filters.vertical && vertKey(r) !== filters.vertical) return false;
    if (filters.department && !eq(r.department, filters.department)) return false;
    if (filters.location && !eq(r.location, filters.location)) return false;
    if (filters.costCentre && !eq(r.cost_centre, filters.costCentre)) return false;
    if (filters.grade && !eq(r.grade, filters.grade)) return false;
    if (filters.employmentType && !eq(r.employment_type, filters.employmentType)) return false;
    return true;
  });
}

export function filterOptions(rows) {
  const uniq = (key) => [...new Set((rows || []).map((r) => r[key]).filter((v) => v && String(v).trim()))]
    .sort((a, b) => String(a).localeCompare(String(b)));
  return {
    verticals: [...new Set((rows || []).map(vertKey))],
    departments: uniq('department'),
    locations: uniq('location'),
    costCentres: uniq('cost_centre'),
    grades: uniq('grade'),
    employmentTypes: uniq('employment_type'),
  };
}

export function rowsForMonths(rows, months) {
  const set = new Set(months || []);
  return (rows || []).filter((r) => set.has(r.month_key));
}

/**
 * Totals for a set of rows (one or more months). Amounts are summed; headcount is that of the
 * last month; average CTC = total CTC ÷ employee-months paid (equals Total ÷ Headcount for one month).
 */
export function totals(rows, { weight = () => 1 } = {}) {
  const sum = {
    gross: 0, deductions: 0, net: 0, ot: 0, incentive: 0, arrears: 0,
    er_pf: 0, er_esi: 0, er_lwf: 0, gratuity_prov: 0, bonus_prov: 0, leave_encash_prov: 0, insurance: 0,
  };
  let lastMonth = '';
  for (const r of rows || []) if (r.month_key > lastMonth) lastMonth = r.month_key;
  let headcount = 0;
  let employeeMonths = 0;
  for (const r of rows || []) {
    const w = weight(r);
    sum.gross += paise(r.gross) * w;
    sum.deductions += paise(r.total_deductions) * w;
    sum.net += paise(r.net_pay) * w;
    sum.ot += paise(r.ot_amount) * w;
    sum.incentive += paise(r.incentive) * w;
    sum.arrears += paise(r.arrears) * w;
    for (const k of EMPLOYER_PARTS) sum[k] += paise(r[k]) * w;
    if (isPaid(r)) {
      employeeMonths += w;
      if (r.month_key === lastMonth) headcount += w;
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(sum)) out[k] = fromPaise(Math.round(v));
  out.employerStatutory = fromPaise(paise(out.er_pf) + paise(out.er_esi) + paise(out.er_lwf));
  out.employerCost = fromPaise(EMPLOYER_PARTS.reduce((s, k) => s + paise(out[k]), 0));
  out.totalCtc = fromPaise(paise(out.gross) + paise(out.employerCost));
  out.headcount = roundTo(headcount, 2);
  out.employeeMonths = roundTo(employeeMonths, 2);
  out.avgCtc = employeeMonths > 0 ? round2(out.totalCtc / employeeMonths) : 0;
  return out;
}

// ---------------------------------------------------------------------------
// Shared-staff allocation (R4 / R5)
// ---------------------------------------------------------------------------
/**
 * Splits rows by allocation %. Each output row carries `_weight` (0–1) and the allocated vertical.
 * Shares below 100% leave the remainder on the snapshot vertical; above 100% they are scaled down.
 */
export function splitByAllocation(rows, allocations = []) {
  const byEmp = new Map();
  for (const a of allocations || []) {
    const id = String(a.employee_master_id);
    if (!byEmp.has(id)) byEmp.set(id, []);
    byEmp.get(id).push({ vertical: String(a.vertical_code).toLowerCase(), pct: toNum(a.pct) });
  }
  const out = [];
  for (const r of rows || []) {
    const parts = byEmp.get(String(r.employee_master_id));
    if (!parts || !parts.length) {
      out.push({ ...r, _weight: 1 });
      continue;
    }
    const total = parts.reduce((s, p) => s + p.pct, 0);
    const scale = total > 100 ? 100 / total : 1;
    let used = 0;
    for (const p of parts) {
      const w = (p.pct * scale) / 100;
      used += w;
      out.push({ ...r, vertical_code: p.vertical, _weight: w });
    }
    if (used < 0.999999) out.push({ ...r, _weight: 1 - used });
  }
  return out;
}

const byWeight = (r) => (r._weight === undefined ? 1 : r._weight);

// ---------------------------------------------------------------------------
// Report 1 — Monthly payroll summary
// ---------------------------------------------------------------------------
export const R1_METRICS = [
  { key: 'headcount', label: 'Headcount paid', money: false },
  { key: 'gross', label: 'Gross earnings', money: true },
  { key: 'deductions', label: 'Total deductions', money: true },
  { key: 'net', label: 'Net salary paid', money: true },
  { key: 'employerCost', label: 'Employer statutory and provisions', money: true },
  { key: 'totalCtc', label: 'Total CTC cost', money: true },
  { key: 'avgCtc', label: 'Average CTC per employee', money: true },
  { key: 'ot', label: 'Overtime paid', money: true },
];

/** Colour rule (money rows only): red when cost rises more than 5%, green when it falls. */
export function costTone(change, pct) {
  if (pct !== null && pct !== undefined && pct > 5) return 'bad';
  if (change < 0) return 'good';
  return 'neutral';
}

export function buildR1(currentRows, previousRows) {
  const cur = totals(currentRows);
  const prev = totals(previousRows);
  const rows = R1_METRICS.map((m) => {
    const c = cur[m.key];
    const p = prev[m.key];
    const change = m.key === 'avgCtc' ? round2(c - p) : fromPaise(paise(c) - paise(p));
    const pct = changePct(c, p);
    return { ...m, current: c, previous: p, change, changePct: pct, tone: m.money ? costTone(change, pct) : 'neutral' };
  });
  return { rows, current: cur, previous: prev };
}

/** 12 locked months ending at `lastMonth`: Total CTC and headcount for the trend chart. */
export function buildTrend(rows, lockedMonthKeys, lastMonth, count = 12) {
  const months = [...new Set(lockedMonthKeys || [])].sort().filter((m) => !lastMonth || m <= lastMonth).slice(-count);
  return months.map((m) => {
    const t = totals(rowsForMonths(rows, [m]));
    return { month: m, label: monthLabel(m), totalCtc: t.totalCtc, headcount: t.headcount };
  });
}

/**
 * Salary register tie-out: snapshot totals vs the sum of the run's lines.
 * Returns { ok, issues[], warnings[] } — issues block publishing, warnings only inform.
 */
export function registerTieOut(rows, registerTotals) {
  const issues = [];
  const warnings = [];
  for (const reg of registerTotals || []) {
    const t = totals(rowsForMonths(rows, [reg.month_key]));
    const lineCount = (rows || []).filter((r) => r.month_key === reg.month_key).length;
    const pairs = [
      ['Gross earnings', t.gross, reg.gross],
      ['Total deductions', t.deductions, reg.total_deductions],
      ['Net salary paid', t.net, reg.net_pay],
    ];
    for (const [label, mine, theirs] of pairs) {
      const diff = round2(toNum(mine) - toNum(theirs));
      if (Math.abs(diff) >= 0.01) issues.push({ month: reg.month_key, label, report: mine, register: toNum(theirs), diff });
    }
    if (toNum(reg.line_count) !== lineCount) {
      issues.push({ month: reg.month_key, label: 'Employees', report: lineCount, register: toNum(reg.line_count), diff: lineCount - toNum(reg.line_count) });
    }
    const headerPairs = [
      ['Gross earnings', reg.gross, reg.header_gross],
      ['Total deductions', reg.total_deductions, reg.header_deductions],
      ['Net salary paid', reg.net_pay, reg.header_net],
    ];
    for (const [label, lines, header] of headerPairs) {
      if (header === null || header === undefined) continue;
      const diff = round2(toNum(lines) - toNum(header));
      if (Math.abs(diff) >= 1) warnings.push({ month: reg.month_key, label, lines: toNum(lines), header: toNum(header), diff });
    }
  }
  return { ok: issues.length === 0, issues, warnings };
}

// ---------------------------------------------------------------------------
// Report 2 — Month-on-month variance
// ---------------------------------------------------------------------------
export const R2_DRIVERS = [
  { key: 'joiners', label: 'New joiners' },
  { key: 'exits', label: 'Exits' },
  { key: 'increments', label: 'Increments / promotions' },
  { key: 'ot', label: 'Overtime' },
  { key: 'incentives', label: 'Incentives and arrears' },
  { key: 'lop', label: 'Loss of pay / attendance' },
  { key: 'other', label: 'Other' },
  { key: 'employer', label: 'Employer statutory and provisions' },
];

/**
 * Employee-by-employee variance between two locked months. Gross drivers in order (first match wins
 * for joiners / exits); employer cost is one line. "Other" takes whatever gross change is left, so the
 * drivers always add up to the CTC change; `check.diff` must be 0 before publishing.
 */
export function buildR2(currentRows, previousRows, currentMonth, previousMonth) {
  const key = (r) => String(r.employee_master_id);
  const prevBy = new Map((previousRows || []).map((r) => [key(r), r]));
  const curBy = new Map((currentRows || []).map((r) => [key(r), r]));
  const ids = [...new Set([...curBy.keys(), ...prevBy.keys()])];
  const acc = Object.fromEntries(R2_DRIVERS.map((d) => [d.key, { amount: 0, employees: [] }]));
  const push = (driver, c, p, amountP, extra = {}) => {
    acc[driver].amount += amountP;
    if (driver === 'joiners' || driver === 'exits' || driver === 'increments' || amountP !== 0) {
      const base = c || p;
      acc[driver].employees.push({
        employee_master_id: base.employee_master_id,
        employee_code: base.employee_code,
        employee_name: base.employee_name,
        vertical_code: base.vertical_code,
        department: base.department,
        amount: fromPaise(amountP),
        ...extra,
      });
    }
  };

  for (const id of ids) {
    const c = curBy.get(id);
    const p = prevBy.get(id);
    const g = (r) => (r ? paise(r.gross) : 0);
    const dGross = g(c) - g(p);
    const joined = c && inMonth(c.date_of_joining, currentMonth);
    const exitDate = (c && c.date_of_exit) || (p && p.date_of_exit);
    const exited = !joined && (inMonth(exitDate, currentMonth) || inMonth(exitDate, previousMonth));
    if (joined) {
      push('joiners', c, p, dGross, { previous: fromPaise(g(p)), current: fromPaise(g(c)) });
      continue;
    }
    if (exited) {
      push('exits', c, p, dGross, { previous: fromPaise(g(p)), current: fromPaise(g(c)) });
      continue;
    }
    if (!c || !p) {
      push('other', c, p, dGross, { previous: fromPaise(g(p)), current: fromPaise(g(c)) });
      continue;
    }
    const revised = !!c.ctc_revised_in_month;
    const inc = revised ? paise(c.fixed_earned) - paise(p.fixed_earned) : 0;
    const ot = paise(c.ot_amount) - paise(p.ot_amount);
    const incent = paise(c.incentive) + paise(c.arrears) - paise(p.incentive) - paise(p.arrears);
    const lop = revised ? 0 : Math.round(paise(c.fixed_full) * (toNum(c.proration_factor) - toNum(p.proration_factor)));
    const other = dGross - inc - ot - incent - lop;
    if (revised) push('increments', c, p, inc, { previous: toNum(p.fixed_earned), current: toNum(c.fixed_earned) });
    if (ot) push('ot', c, p, ot, { previous: toNum(p.ot_amount), current: toNum(c.ot_amount) });
    if (incent) push('incentives', c, p, incent, {
      previous: toNum(p.incentive) + toNum(p.arrears), current: toNum(c.incentive) + toNum(c.arrears),
    });
    if (lop) push('lop', c, p, lop, { previous: toNum(p.paid_days), current: toNum(c.paid_days) });
    if (other) push('other', c, p, other, { previous: fromPaise(g(p)), current: fromPaise(g(c)) });
  }

  const cur = totals(currentRows);
  const prev = totals(previousRows);
  acc.employer.amount = paise(cur.employerCost) - paise(prev.employerCost);
  const changeP = paise(cur.totalCtc) - paise(prev.totalCtc);
  const sumDrivers = R2_DRIVERS.reduce((s, d) => s + Math.round(acc[d.key].amount), 0);
  const diff = fromPaise(paise(prev.totalCtc) + sumDrivers - paise(cur.totalCtc));

  const drivers = R2_DRIVERS.map((d) => {
    const amount = fromPaise(Math.round(acc[d.key].amount));
    return {
      ...d,
      amount,
      share: changeP !== 0 ? (paise(amount) / changeP) * 100 : null,
      count: d.key === 'employer' ? null : acc[d.key].employees.length,
      employees: acc[d.key].employees.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    };
  });
  return {
    previousCtc: prev.totalCtc,
    currentCtc: cur.totalCtc,
    change: fromPaise(changeP),
    changePct: changePct(cur.totalCtc, prev.totalCtc),
    drivers,
    check: { ok: Math.abs(diff) < 0.005, diff },
  };
}

/** Waterfall bars: start, each driver floating from the running total, end. */
export function waterfallData(r2) {
  let running = r2.previousCtc;
  const bars = [{ label: 'Previous', base: 0, value: r2.previousCtc, kind: 'total' }];
  for (const d of r2.drivers) {
    const start = running;
    running = round2(running + d.amount);
    bars.push({ label: d.label, base: Math.min(start, running), value: Math.abs(d.amount), kind: d.amount < 0 ? 'down' : 'up', amount: d.amount });
  }
  bars.push({ label: 'Current', base: 0, value: r2.currentCtc, kind: 'total' });
  return bars;
}

// ---------------------------------------------------------------------------
// Report 3 — CTC cost summary
// ---------------------------------------------------------------------------
export const R3_ELEMENTS = [
  { key: 'gross', label: 'Gross earnings' },
  { key: 'er_pf', label: 'Employer PF (incl. EPS, EDLI, admin charges)' },
  { key: 'er_esi', label: 'Employer ESI' },
  { key: 'er_lwf', label: 'Employer LWF' },
  { key: 'gratuity_prov', label: 'Gratuity provision' },
  { key: 'bonus_prov', label: 'Bonus provision' },
  { key: 'leave_encash_prov', label: 'Leave encashment provision' },
  { key: 'insurance', label: 'Group medical and accident insurance' },
];

export function buildR3(currentRows, previousRows, ytdRows) {
  const cur = totals(currentRows);
  const prev = totals(previousRows);
  const ytd = totals(ytdRows);
  const rows = R3_ELEMENTS.map((e) => ({
    ...e,
    current: cur[e.key],
    previous: prev[e.key],
    ytd: ytd[e.key],
    pctOfCtc: ytd.totalCtc ? roundTo((ytd[e.key] / ytd.totalCtc) * 100, 1) : null,
  }));
  rows.push({
    key: 'totalCtc', label: 'Total CTC', total: true,
    current: cur.totalCtc, previous: prev.totalCtc, ytd: ytd.totalCtc, pctOfCtc: ytd.totalCtc ? 100 : null,
  });
  return { rows };
}

// ---------------------------------------------------------------------------
// Report 4 — Vertical-wise payroll cost
// ---------------------------------------------------------------------------
function groupTotals(rows, keyFn) {
  const groups = new Map();
  for (const r of rows || []) {
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = new Map();
  for (const [k, list] of groups) out.set(k, totals(list, { weight: byWeight }));
  return out;
}

function verticalOrder(a, b) {
  if (a === UNASSIGNED) return 1;
  if (b === UNASSIGNED) return -1;
  const ia = MIS_VERTICALS.findIndex((v) => v.code === a);
  const ib = MIS_VERTICALS.findIndex((v) => v.code === b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || String(a).localeCompare(String(b));
}

export function buildR4(currentRows, previousRows, ytdRows, allocations = [], { split = false } = {}) {
  const prep = (rows) => (split ? splitByAllocation(rows, allocations) : (rows || []).map((r) => ({ ...r, _weight: 1 })));
  const cur = groupTotals(prep(currentRows), vertKey);
  const prev = groupTotals(prep(previousRows), vertKey);
  const ytd = groupTotals(prep(ytdRows), vertKey);
  const grand = totals(currentRows);
  const keys = [...new Set([...cur.keys(), ...prev.keys()])].sort(verticalOrder);
  const rows = keys.map((k) => {
    const c = cur.get(k) || totals([]);
    const p = prev.get(k) || totals([]);
    const y = ytd.get(k) || totals([]);
    return {
      vertical: k,
      label: verticalLabel(k),
      unassigned: k === UNASSIGNED,
      headcount: c.headcount,
      gross: c.gross,
      employerCost: c.employerCost,
      totalCtc: c.totalCtc,
      pctOfTotal: grand.totalCtc ? roundTo((c.totalCtc / grand.totalCtc) * 100, 1) : null,
      previousCtc: p.totalCtc,
      changePct: changePct(c.totalCtc, p.totalCtc),
      ytdCtc: y.totalCtc,
    };
  });
  const prevGrand = totals(previousRows);
  const ytdGrand = totals(ytdRows);
  return {
    rows,
    total: {
      headcount: grand.headcount, gross: grand.gross, employerCost: grand.employerCost, totalCtc: grand.totalCtc,
      pctOfTotal: grand.totalCtc ? 100 : null, previousCtc: prevGrand.totalCtc,
      changePct: changePct(grand.totalCtc, prevGrand.totalCtc), ytdCtc: ytdGrand.totalCtc,
    },
    hasUnassigned: rows.some((r) => r.unassigned && (r.totalCtc !== 0 || r.headcount !== 0)),
  };
}

// ---------------------------------------------------------------------------
// Report 5 — Department-wise payroll cost
// ---------------------------------------------------------------------------
function r5Line(rows, prevRows, from, to) {
  const c = totals(rows, { weight: byWeight });
  const p = totals(prevRows, { weight: byWeight });
  const hires = rows.reduce((s, r) => s + (inRange(r.date_of_joining, from, to) ? byWeight(r) : 0), 0);
  const exits = rows.reduce((s, r) => s + (inRange(r.date_of_exit, from, to) ? byWeight(r) : 0), 0);
  return {
    headcount: c.headcount,
    totalCtc: c.totalCtc,
    avgCtc: c.avgCtc,
    ot: c.ot,
    newHires: roundTo(hires, 2),
    exits: roundTo(exits, 2),
    previousCtc: p.totalCtc,
    changePct: changePct(c.totalCtc, p.totalCtc),
  };
}

export function buildR5(currentRows, previousRows, period, allocations = [], { split = false } = {}) {
  const { from, to } = period;
  const prep = (rows) => (split ? splitByAllocation(rows, allocations) : (rows || []).map((r) => ({ ...r, _weight: 1 })));
  const cur = prep(currentRows);
  const prev = prep(previousRows);
  const verticals = [...new Set([...cur.map(vertKey), ...prev.map(vertKey)])].sort(verticalOrder);
  const groups = verticals.map((v) => {
    const vc = cur.filter((r) => vertKey(r) === v);
    const vp = prev.filter((r) => vertKey(r) === v);
    const depts = [...new Set([...vc.map(deptKey), ...vp.map(deptKey)])].sort((a, b) => a.localeCompare(b));
    return {
      vertical: v,
      label: verticalLabel(v),
      unassigned: v === UNASSIGNED,
      departments: depts.map((d) => ({
        department: d,
        ...r5Line(vc.filter((r) => deptKey(r) === d), vp.filter((r) => deptKey(r) === d), from, to),
      })),
      subtotal: r5Line(vc, vp, from, to),
    };
  });
  return { groups, total: r5Line(cur, prev, from, to) };
}

// ---------------------------------------------------------------------------
// Report 6 — Statutory contribution summary
// ---------------------------------------------------------------------------
export const R6_STATUTES = [
  { key: 'PF', label: 'Provident Fund', ee: 'emp_pf', er: 'er_pf', wage: 'pf_wage' },
  { key: 'ESI', label: 'ESI', ee: 'emp_esic', er: 'er_esi', wage: 'esi_wage' },
  { key: 'PT', label: 'Professional Tax', ee: 'pt', er: null, wage: null },
  { key: 'LWF', label: 'Labour Welfare Fund', ee: 'ee_lwf', er: 'er_lwf', wage: null },
  { key: 'TDS', label: 'TDS on salary', ee: 'tds', er: null, wage: null },
];

const sumP = (rows, key) => (rows || []).reduce((s, r) => s + paise(r[key]), 0);

export function buildR6(currentRows, previousRows) {
  const rows = R6_STATUTES.map((s) => {
    const covered = (currentRows || []).filter((r) => toNum(r[s.ee]) !== 0 || (s.key === 'LWF' && toNum(r.er_lwf) !== 0)).length;
    const ee = sumP(currentRows, s.ee);
    const er = s.er ? sumP(currentRows, s.er) : 0;
    const erPrev = s.er ? sumP(previousRows, s.er) : 0;
    return {
      ...s,
      covered,
      wageBase: s.wage ? fromPaise(sumP(currentRows, s.wage)) : null,
      employeeShare: fromPaise(ee),
      employerShare: fromPaise(er),
      totalDeposit: fromPaise(ee + er),
      employerChangePct: s.er && (s.key !== 'LWF' || er || erPrev) ? changePct(fromPaise(er), fromPaise(erPrev)) : undefined,
    };
  });
  const sum = (k) => fromPaise(rows.reduce((s, r) => s + paise(r[k]), 0));
  return { rows, total: { employeeShare: sum('employeeShare'), employerShare: sum('employerShare'), totalDeposit: sum('totalDeposit') } };
}

/** Latest rate row for statute/component/state effective on or before the month's first day. */
export function pickRate(rates, statute, component, state, monthKey) {
  const day = `${monthKey}-01`;
  const candidates = (rates || []).filter((r) => r.statute === statute && r.component === component
    && String(r.effective_from).slice(0, 10) <= day && (r.state === state || r.state === 'ALL'));
  candidates.sort((a, b) => (a.state === 'ALL') - (b.state === 'ALL') || String(b.effective_from).localeCompare(String(a.effective_from)));
  return candidates[0] || null;
}

/** PF breakup as in the ECR file: EPS on wages up to the ceiling, EPF employer = EPF total − EPS. */
export function buildPfBreakup(rows, rates, monthKey) {
  const eps = pickRate(rates, 'PF', 'eps', 'ALL', monthKey);
  const epf = pickRate(rates, 'PF', 'epf_total', 'ALL', monthKey);
  const edli = pickRate(rates, 'PF', 'edli', 'ALL', monthKey);
  const admin = pickRate(rates, 'PF', 'admin', 'ALL', monthKey);
  const capped = (wage, rate) => {
    const ceiling = rate && rate.wage_ceiling ? toNum(rate.wage_ceiling) : Infinity;
    return Math.min(toNum(wage), ceiling);
  };
  let epsP = 0;
  let epfTotalP = 0;
  let edliP = 0;
  let adminP = 0;
  for (const r of (rows || []).filter((x) => toNum(x.emp_pf) > 0)) {
    const w = toNum(r.pf_wage);
    const e = eps ? Math.round(capped(w, eps) * toNum(eps.rate_pct)) : 0;
    const t = epf ? Math.round(capped(w, epf) * toNum(epf.rate_pct)) : 0;
    epsP += e;
    epfTotalP += t;
    edliP += edli ? Math.round(capped(w, edli) * toNum(edli.rate_pct)) : 0;
    adminP += admin ? Math.round(capped(w, admin) * toNum(admin.rate_pct)) : 0;
  }
  const erPayrollP = sumP((rows || []).filter((x) => toNum(x.emp_pf) > 0), 'er_pf');
  const lines = [
    { key: 'epf_ee', label: 'EPF (employee)', amount: fromPaise(sumP(rows, 'emp_pf')) },
    { key: 'epf_er', label: 'EPF (employer)', amount: fromPaise(epfTotalP - epsP) },
    { key: 'eps', label: 'EPS', amount: fromPaise(epsP) },
    { key: 'edli', label: 'EDLI', amount: fromPaise(edliP) },
    { key: 'admin', label: 'Admin charges', amount: fromPaise(adminP) },
  ];
  const statutoryEr = epfTotalP + edliP + adminP;
  return {
    lines,
    employerPayroll: fromPaise(erPayrollP),
    employerPerRates: fromPaise(statutoryEr),
    difference: fromPaise(erPayrollP - statutoryEr),
    ratesMissing: !eps || !epf,
  };
}

export function buildR6Employees(rows) {
  return (rows || [])
    .filter((r) => [r.emp_pf, r.er_pf, r.emp_esic, r.er_esi, r.pt, r.ee_lwf, r.er_lwf, r.tds].some((v) => toNum(v) !== 0))
    .map((r) => ({
      employee_master_id: r.employee_master_id,
      employee_code: r.employee_code,
      employee_name: r.employee_name,
      uan_no: r.uan_no,
      esic_no: r.esic_no,
      pf_wage: toNum(r.pf_wage),
      esi_wage: toNum(r.esi_wage),
      employeeShare: fromPaise(paise(r.emp_pf) + paise(r.emp_esic) + paise(r.pt) + paise(r.ee_lwf) + paise(r.tds)),
      employerShare: fromPaise(paise(r.er_pf) + paise(r.er_esi) + paise(r.er_lwf)),
      emp_pf: toNum(r.emp_pf), er_pf: toNum(r.er_pf), emp_esic: toNum(r.emp_esic), er_esi: toNum(r.er_esi),
      pt: toNum(r.pt), tds: toNum(r.tds),
    }))
    .sort((a, b) => String(a.employee_code || '').localeCompare(String(b.employee_code || ''), undefined, { numeric: true }));
}

// ---------------------------------------------------------------------------
// Report 7 — Compliance due-date and payment tracker
// ---------------------------------------------------------------------------
const dayIndex = (d) => {
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, dd) / 86400000;
};

export function todayIso(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60000);
  return ist.toISOString().slice(0, 10);
}

/** Status per the spec. today: YYYY-MM-DD. */
export function paymentStatus(row, today) {
  const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
  if (row.paid_on) {
    const late = due ? dayIndex(row.paid_on) - dayIndex(due) : 0;
    if (late > 0) return { key: 'paid_late', label: 'Paid late', tone: 'late', daysLate: late };
    return { key: 'paid_on_time', label: 'Paid on time', tone: 'good', daysLate: 0 };
  }
  if (!due) return { key: 'pending', label: 'Pending', tone: 'neutral', daysLate: null };
  const t = dayIndex(today);
  const d = dayIndex(due);
  if (t > d) return { key: 'overdue', label: 'Overdue', tone: 'bad', daysLate: t - d };
  if (d - t <= 3) return { key: 'due_soon', label: 'Due soon', tone: 'warn', daysLate: null };
  return { key: 'pending', label: 'Pending', tone: 'neutral', daysLate: null };
}

export function buildR7(payments, today) {
  const fyStart = `${fyStartMonth(String(today).slice(0, 7))}-01`;
  const rows = (payments || []).map((p) => {
    const status = paymentStatus(p, today);
    return { ...p, status, interestPenalty: fromPaise(paise(p.interest) + paise(p.penalty)) };
  });
  rows.sort((a, b) => String(b.wage_month).localeCompare(String(a.wage_month))
    || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))
    || String(a.statute).localeCompare(String(b.statute)));
  const paidThisFy = rows.filter((r) => r.paid_on && String(r.paid_on).slice(0, 10) >= fyStart);
  return {
    rows,
    tiles: {
      pendingAmount: fromPaise(rows.filter((r) => !r.paid_on).reduce((s, r) => s + paise(r.amount), 0)),
      overdueCount: rows.filter((r) => r.status.key === 'overdue').length,
      dueSoonCount: rows.filter((r) => r.status.key === 'due_soon').length,
      paidLateThisFy: paidThisFy.filter((r) => r.status.key === 'paid_late').length,
      interestPenaltyYtd: fromPaise(paidThisFy.reduce((s, r) => s + paise(r.interest) + paise(r.penalty), 0)),
    },
  };
}

/** R6 "Total to deposit" per statute — what the lock writes into the payment tracker (state 'ALL' merged). */
export function depositsByStatute(rows) {
  const r6 = buildR6(rows, []);
  return Object.fromEntries(r6.rows.map((r) => [r.key, r.totalDeposit]));
}

export const STATUTE_LABELS = Object.fromEntries(R6_STATUTES.map((s) => [s.key, s.label]));
