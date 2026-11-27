/**
 * Centralized Site Ledger / P&L math used by the UI working-copy path.
 *
 * Preserves existing formulas:
 *   Revenue = signed revenue heads (reimbursements via caller-provided total)
 *   Expenses = direct monthly amounts + applicable amortized spreads
 *   Profit = revenue - expenses
 *   Margin = profit / revenue (0 when revenue ≤ 0)
 *
 * Does not change rounding or special cases — callers supply the same inputs
 * the legacy SiteLedgerApp helpers used.
 */

/** Parse a typed financial amount (commas allowed). */
export function parseEntryAmount(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {number} revenue
 * @param {number} expense
 * @returns {{ profit: number, margin: number }}
 */
export function profitAndMargin(revenue, expense) {
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { profit, margin };
}

/**
 * Direct + amortized expense recognition for one site/period.
 *
 * @param {{
 *   periodKey: string,
 *   childKeys: Iterable<string>,
 *   record?: Record<string, unknown>,
 *   spreads?: Array<{ head: string, start: string, months: number|string, total: number|string }>,
 *   monthIndex: (periodKey: string) => number,
 * }} input
 */
export function recognizedExpensesForPeriod({
  periodKey,
  childKeys,
  record = {},
  spreads = [],
  monthIndex,
}) {
  const keys = new Set(childKeys || []);
  (spreads || []).forEach((s) => {
    if (s?.head) keys.add(s.head);
  });

  const direct = {};
  const amort = {};
  const total = {};
  keys.forEach((k) => {
    direct[k] = parseEntryAmount(record[k]);
    amort[k] = 0;
  });

  (spreads || []).forEach((sp) => {
    const si = monthIndex(sp.start);
    const ci = monthIndex(periodKey);
    const m = Number(sp.months) || 0;
    if (si >= 0 && m > 0 && ci >= si && ci < si + m) {
      amort[sp.head] = (amort[sp.head] || 0) + Number(sp.total) / m;
    }
  });

  keys.forEach((k) => {
    total[k] = (direct[k] || 0) + (amort[k] || 0);
  });

  return { direct, amort, total, keys: [...keys] };
}

/**
 * Signed revenue for one period record.
 *
 * @param {{
 *   revenueItems: Array<{ key: string, sign: number }>,
 *   record?: Record<string, unknown>,
 *   reimbursementTotal?: (record: object) => number,
 *   reimbursementKey?: string,
 * }} input
 */
export function computeSignedRevenue({
  revenueItems,
  record = {},
  reimbursementTotal = () => 0,
  reimbursementKey = "esicBill",
}) {
  return (revenueItems || []).reduce((sum, it) => {
    if (it.key === reimbursementKey) {
      return sum + it.sign * reimbursementTotal(record);
    }
    return sum + it.sign * parseEntryAmount(record[it.key]);
  }, 0);
}

/**
 * Full site/period P&L from browser-shaped site + records.
 *
 * @param {{
 *   site: { id: string, spreads?: object[], structure?: object[] },
 *   periodKey: string,
 *   records: Record<string, object>,
 *   revenueItems: Array<{ key: string, sign: number }>,
 *   monthIndex: (k: string) => number,
 *   siteChildKeys: (site: object) => string[],
 *   reimbursementTotal: (record: object) => number,
 *   directOverride?: object|null,
 * }} input
 */
export function calcSitePeriod(input) {
  const {
    site,
    periodKey,
    records,
    revenueItems,
    monthIndex,
    siteChildKeys,
    reimbursementTotal,
    directOverride = null,
  } = input;

  const rec = directOverride || records[`${site.id}__${periodKey}`] || {};
  const revenue = computeSignedRevenue({
    revenueItems,
    record: rec,
    reimbursementTotal,
  });
  const ex = recognizedExpensesForPeriod({
    periodKey,
    childKeys: siteChildKeys(site),
    record: rec,
    spreads: site.spreads || [],
    monthIndex,
  });
  const expense = Object.values(ex.total).reduce((a, b) => a + b, 0);
  const { profit, margin } = profitAndMargin(revenue, expense);
  return { revenue, expense, profit, margin, ex };
}

/**
 * Aggregate P&L across multiple period keys for one site.
 */
export function calcSiteOverPeriods(input) {
  const { periodKeys, ...rest } = input;
  const agg = (periodKeys || []).reduce(
    (acc, periodKey) => {
      const c = calcSitePeriod({ ...rest, periodKey });
      return {
        revenue: acc.revenue + c.revenue,
        expense: acc.expense + c.expense,
        profit: acc.profit + c.profit,
      };
    },
    { revenue: 0, expense: 0, profit: 0 },
  );
  const { margin } = profitAndMargin(agg.revenue, agg.expense);
  return { ...agg, margin };
}

/**
 * Estimate / budget totals (signed revenue + expense map).
 */
export function estimateTotals(est, revenueItems) {
  if (!est) return null;
  const revenue = (revenueItems || []).reduce(
    (s, it) => s + it.sign * (Number(est.revenue?.[it.key]) || 0),
    0,
  );
  const byHead = est.expenses || {};
  const expense = Object.values(byHead).reduce((a, b) => a + (Number(b) || 0), 0);
  const { profit, margin } = profitAndMargin(revenue, expense);
  return { revenue, expense, profit, margin, byHead };
}

/**
 * Portfolio rollup across sites for one period.
 */
export function portfolioTotalsForPeriod({
  sites,
  periodKey,
  records,
  revenueItems,
  monthIndex,
  siteChildKeys,
  reimbursementTotal,
}) {
  const rows = (sites || []).map((site) => calcSitePeriod({
    site,
    periodKey,
    records,
    revenueItems,
    monthIndex,
    siteChildKeys,
    reimbursementTotal,
  }));
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  const expense = rows.reduce((a, r) => a + r.expense, 0);
  const { profit, margin } = profitAndMargin(revenue, expense);
  return { revenue, expense, profit, margin, siteCount: rows.length };
}
