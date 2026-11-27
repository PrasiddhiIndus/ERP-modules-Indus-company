/**
 * Calculation reconciliation — golden values for the Site Ledger calc layer, and proof that the
 * report engine (ReportsPage: buildReport / buildPortfolioPnlMatrix) reconciles to calcSite.
 *
 * Fixture (hand-computed, all amounts INR):
 *
 *   Site A (a1) — structure: salaries, bonus | indirect; spread on `indirect`: 3,000 over 3 months from 2026-04
 *     2026-04: sale 100,000 + reimbursement 5,000 − credit note 2,000  = revenue 103,000
 *              direct 50,000 + "1,000" + spread 1,000                   = expense 52,000   → profit 51,000
 *     2026-05: sale 80,000                                              = revenue 80,000
 *              direct 60,000 + 500 + spread 1,000                       = expense 61,500   → profit 18,500
 *     estimate (fixed for the contract): revenue 200,000 + 10,000 − 5,000 = 205,000; expense 105,000
 *
 *   Site B (b1) — 2026-04: sale 10,000 − credit note 15,000 = revenue −5,000; expense 2,000
 *   Site C (c1) — 2026-04: no revenue, expense 500 (revenue = 0 → margin 0)
 */
import { describe, expect, it } from "vitest";
import {
  calcSite,
  calcSiteOverPeriodKeys,
  estTotals,
  estTotalsForPeriodKeys,
  recognizedExpenses,
} from "../src/pages/finance/site-ledger/calculations/siteLedgerCalcs.js";
import {
  computeSignedRevenue,
  portfolioTotalsForPeriod,
  profitAndMargin,
} from "../src/pages/finance/site-ledger/calculations/ledgerMath.js";
import { REVENUE_ITEMS } from "../src/pages/finance/site-ledger/domain/constants.js";
import { siteChildKeys } from "../src/pages/finance/site-ledger/domain/siteStructure.js";
import { periodAbsoluteIndex } from "../src/pages/finance/lib/periods";
import { reimbursementTotal } from "../src/pages/finance/api/siteLedgerStore";
import {
  buildReport,
  buildPortfolioPnlMatrix,
  portfolioPnlExportGrid,
  aggPairs,
} from "../src/pages/finance/site-ledger/pages/ReportsPage.jsx";

const APR = "2026-04";
const MAY = "2026-05";

const siteA = {
  id: "a1",
  name: "Site A",
  siteType: "fire",
  status: "active",
  contractStart: "2026-04",
  contractEnd: "2027-03",
  structure: [
    { parent: "salaryCost", children: ["salaries", "bonus"] },
    { parent: "adminMisc", children: ["indirect"] },
  ],
  spreads: [{ head: "indirect", start: APR, months: 3, total: 3000 }],
  estimates: [
    {
      effectiveFrom: "2026-04",
      revenue: { saleRevenue: 200000, esicBill: 10000, creditNote: 5000 },
      expenses: { salaries: 100000, indirect: 5000 },
    },
  ],
};
const siteB = {
  id: "b1",
  name: "Site B",
  siteType: "safety",
  status: "active",
  contractStart: "2026-04",
  structure: [{ parent: "salaryCost", children: ["salaries"] }],
  spreads: [],
  estimates: [],
};
const siteC = {
  id: "c1",
  name: "Site C",
  siteType: "shutdown",
  status: "active",
  contractStart: "2026-04",
  structure: [{ parent: "salaryCost", children: ["salaries"] }],
  spreads: [],
  estimates: [],
};
const sites = [siteA, siteB, siteC];

const records = {
  [`a1__${APR}`]: {
    saleRevenue: "100000",
    creditNote: 2000,
    reimbursements: [{ id: "r1", type: "esic", amount: 5000 }],
    salaries: "50,000",
    bonus: "1,000",
  },
  [`a1__${MAY}`]: { saleRevenue: 80000, salaries: 60000, indirect: 500 },
  [`b1__${APR}`]: { saleRevenue: 10000, creditNote: 15000, salaries: 2000 },
  [`c1__${APR}`]: { salaries: 500 },
};

// Golden values (hand-computed above).
const GOLD = {
  aApr: { revenue: 103000, expense: 52000, profit: 51000, margin: (51000 / 103000) * 100 },
  aMay: { revenue: 80000, expense: 61500, profit: 18500, margin: (18500 / 80000) * 100 },
  bApr: { revenue: -5000, expense: 2000, profit: -7000, margin: 0 },
  cApr: { revenue: 0, expense: 500, profit: -500, margin: 0 },
  aEst: { revenue: 205000, expense: 105000, profit: 100000, margin: (100000 / 205000) * 100 },
};
const GOLD_TOTAL_BOTH_MONTHS = { revenue: 178000, expense: 116000, profit: 62000 };

function expectPnl(actual, gold) {
  expect(actual.revenue).toBeCloseTo(gold.revenue, 6);
  expect(actual.expense).toBeCloseTo(gold.expense, 6);
  expect(actual.profit).toBeCloseTo(gold.profit, 6);
  expect(actual.margin).toBeCloseTo(gold.margin, 6);
}

/** Independent re-computation: sum of calcSite over every (site, month) that has an entry. */
function sumCalcSite(siteList, months) {
  let revenue = 0;
  let expense = 0;
  let profit = 0;
  siteList.forEach((s) => months.forEach((mk) => {
    if (!records[`${s.id}__${mk}`]) return;
    const c = calcSite(s, mk, records);
    revenue += c.revenue;
    expense += c.expense;
    profit += c.profit;
  }));
  return { revenue, expense, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
}

describe("signed revenue (sale + reimbursement − credit note)", () => {
  it("applies the revenue sign map: credit note subtracts, reimbursement adds", () => {
    expect(REVENUE_ITEMS.find((i) => i.key === "saleRevenue").sign).toBe(1);
    expect(REVENUE_ITEMS.find((i) => i.key === "esicBill").sign).toBe(1);
    expect(REVENUE_ITEMS.find((i) => i.key === "creditNote").sign).toBe(-1);
  });

  it("calcSite revenue = 100,000 + 5,000 − 2,000", () => {
    expect(calcSite(siteA, APR, records).revenue).toBe(103000);
  });

  it("matches computeSignedRevenue fed by the same reimbursement total", () => {
    const rec = records[`a1__${APR}`];
    expect(reimbursementTotal(rec)).toBe(5000);
    expect(computeSignedRevenue({ revenueItems: REVENUE_ITEMS, record: rec, reimbursementTotal })).toBe(103000);
  });

  it("goes negative when credit notes exceed sales (no clamping)", () => {
    expect(calcSite(siteB, APR, records).revenue).toBe(-5000);
  });
});

describe("expenses = direct + amortized spreads", () => {
  it("recognizedExpenses splits direct and amortized per head", () => {
    const ex = recognizedExpenses(siteA, APR, records);
    expect(ex.direct.salaries).toBe(50000);
    expect(ex.direct.bonus).toBe(1000);
    expect(ex.amort.indirect).toBeCloseTo(1000, 9);
    expect(ex.total.indirect).toBeCloseTo(1000, 9);
  });

  it("adds the spread on top of the direct amount in the same head", () => {
    const ex = recognizedExpenses(siteA, MAY, records);
    expect(ex.direct.indirect).toBe(500);
    expect(ex.amort.indirect).toBeCloseTo(1000, 9);
    expect(ex.total.indirect).toBeCloseTo(1500, 9);
  });

  it("stops amortizing after the spread window (3 months from 2026-04)", () => {
    const ex = recognizedExpenses(siteA, "2026-07", records);
    expect(ex.amort.indirect).toBe(0);
    const before = recognizedExpenses(siteA, "2026-03", records);
    expect(before.amort.indirect).toBe(0);
  });

  it("amortizes into months that have no saved record (calcSite on an empty month)", () => {
    const c = calcSite(siteA, "2026-06", records);
    expect(c.revenue).toBe(0);
    expect(c.expense).toBeCloseTo(1000, 9);
    expect(c.profit).toBeCloseTo(-1000, 9);
    expect(c.margin).toBe(0);
  });
});

describe("profit and margin", () => {
  it("calcSite golden values per site / month", () => {
    expectPnl(calcSite(siteA, APR, records), GOLD.aApr);
    expectPnl(calcSite(siteA, MAY, records), GOLD.aMay);
    expectPnl(calcSite(siteB, APR, records), GOLD.bApr);
    expectPnl(calcSite(siteC, APR, records), GOLD.cApr);
  });

  it("profit = revenue − expense for every fixture cell", () => {
    sites.forEach((s) => [APR, MAY].forEach((mk) => {
      const c = calcSite(s, mk, records);
      expect(c.profit).toBeCloseTo(c.revenue - c.expense, 9);
    }));
  });

  it("margin = profit / revenue × 100 when revenue > 0", () => {
    expect(calcSite(siteA, APR, records).margin).toBeCloseTo(49.514563106796, 9);
  });

  it("revenue = 0 → margin 0 (not NaN / Infinity)", () => {
    const c = calcSite(siteC, APR, records);
    expect(c.revenue).toBe(0);
    expect(c.profit).toBe(-500);
    expect(c.margin).toBe(0);
    expect(profitAndMargin(0, 0)).toEqual({ profit: 0, margin: 0 });
    expect(profitAndMargin(0, 100)).toEqual({ profit: -100, margin: 0 });
  });

  it("negative revenue → margin 0", () => {
    expect(calcSite(siteB, APR, records).margin).toBe(0);
  });
});

describe("estimate totals", () => {
  it("estTotals uses the same revenue signs as actuals", () => {
    expectPnl(estTotals(siteA.estimates[0]), GOLD.aEst);
  });

  it("estTotals returns null when no estimate exists", () => {
    expect(estTotals(null)).toBeNull();
    expect(estTotalsForPeriodKeys(siteB, [APR, MAY])).toBeNull();
  });

  it("estTotalsForPeriodKeys counts the fixed contract budget once per period", () => {
    const e = estTotalsForPeriodKeys(siteA, [APR, MAY]);
    expect(e.revenue).toBe(410000);
    expect(e.expense).toBe(210000);
    expect(e.profit).toBe(200000);
    expect(e.margin).toBeCloseTo((200000 / 410000) * 100, 9);
  });
});

describe("period and portfolio rollups", () => {
  it("calcSiteOverPeriodKeys sums months; margin from the aggregate", () => {
    const agg = calcSiteOverPeriodKeys(siteA, [APR, MAY], records);
    expect(agg.revenue).toBe(183000);
    expect(agg.expense).toBe(113500);
    expect(agg.profit).toBe(69500);
    expect(agg.margin).toBeCloseTo((69500 / 183000) * 100, 9);
  });

  it("portfolioTotalsForPeriod (April) equals golden sum of A + B + C", () => {
    const t = portfolioTotalsForPeriod({
      sites,
      periodKey: APR,
      records,
      revenueItems: REVENUE_ITEMS,
      monthIndex: periodAbsoluteIndex,
      siteChildKeys,
      reimbursementTotal,
    });
    expect(t.revenue).toBe(98000);
    expect(t.expense).toBe(54500);
    expect(t.profit).toBe(43500);
    expect(t.margin).toBeCloseTo((43500 / 98000) * 100, 9);
    expect(t.siteCount).toBe(3);
  });

  it("portfolio rollup equals the sum of calcSite across sites", () => {
    const s = sumCalcSite(sites, [APR]);
    expect(s).toMatchObject({ revenue: 98000, expense: 54500, profit: 43500 });
  });

  it("portfolio margin is 0 when portfolio revenue is 0", () => {
    const t = portfolioTotalsForPeriod({
      sites: [siteC],
      periodKey: APR,
      records,
      revenueItems: REVENUE_ITEMS,
      monthIndex: periodAbsoluteIndex,
      siteChildKeys,
      reimbursementTotal,
    });
    expect(t.revenue).toBe(0);
    expect(t.margin).toBe(0);
  });
});

describe("report engine reconciles to calcSite", () => {
  const baseCfg = {
    sites,
    records,
    dim: "site",
    measures: ["revenue", "expense", "profit", "margin", "estRevenue", "estExpense", "estProfit", "profitVar"],
    scope: "all",
    periodMode: "multi",
    selMonths: [MAY, APR, APR], // unsorted + duplicate → each month counted exactly once
    filter: "none",
    month: APR,
    from: APR,
    to: MAY,
  };

  it("buildReport (by site) totals = sum of calcSite over reported site-months", () => {
    const report = buildReport(baseCfg);
    const expected = sumCalcSite(sites, [APR, MAY]);
    expect(expected).toMatchObject(GOLD_TOTAL_BOTH_MONTHS);
    expect(report.totals.a.rev).toBeCloseTo(expected.revenue, 6);
    expect(report.totals.a.exp).toBeCloseTo(expected.expense, 6);
    expect(report.totals.a.profit).toBeCloseTo(expected.profit, 6);
    expect(report.totals.a.margin).toBeCloseTo(expected.margin, 6);
  });

  it("buildReport row for each site equals calcSite over that site's reported months", () => {
    const report = buildReport(baseCfg);
    const byId = Object.fromEntries(report.rows.map((r) => [r.id, r]));
    expect(byId.a1.a.rev).toBe(183000);
    expect(byId.a1.a.exp).toBe(113500);
    expect(byId.a1.a.profit).toBe(69500);
    expect(byId.b1.a.rev).toBe(-5000);
    expect(byId.b1.a.margin).toBe(0);
    expect(byId.c1.a.rev).toBe(0);
    expect(byId.c1.a.margin).toBe(0);
    const rowSum = report.rows.reduce((acc, r) => ({
      rev: acc.rev + r.a.rev,
      exp: acc.exp + r.a.exp,
      profit: acc.profit + r.a.profit,
    }), { rev: 0, exp: 0, profit: 0 });
    expect(rowSum.rev).toBeCloseTo(report.totals.a.rev, 6);
    expect(rowSum.exp).toBeCloseTo(report.totals.a.exp, 6);
    expect(rowSum.profit).toBeCloseTo(report.totals.a.profit, 6);
  });

  it("estimates count only months that have actual entries; variance = actual − estimate", () => {
    const { totals } = buildReport(baseCfg);
    expect(totals.a.he).toBe(true);
    expect(totals.a.estRev).toBe(410000);
    expect(totals.a.estExp).toBe(210000);
    expect(totals.a.estProfit).toBe(200000);
    expect(totals.a.profitVar).toBeCloseTo(GOLD_TOTAL_BOTH_MONTHS.profit - 200000, 6);
  });

  it("single-month report (April) equals golden portfolio April", () => {
    const { totals } = buildReport({ ...baseCfg, periodMode: "single" });
    expect(totals.a.rev).toBe(98000);
    expect(totals.a.exp).toBe(54500);
    expect(totals.a.profit).toBe(43500);
  });

  it("by-month report: month rows sum to the same grand total", () => {
    const report = buildReport({ ...baseCfg, dim: "month" });
    expect(report.rows.map((r) => r.id)).toEqual([APR, MAY]);
    expect(report.rows[0].a).toMatchObject({ rev: 98000, exp: 54500, profit: 43500 });
    expect(report.rows[1].a).toMatchObject({ rev: 80000, exp: 61500, profit: 18500 });
    expect(report.totals.a).toMatchObject({ rev: 178000, exp: 116000, profit: 62000 });
  });

  it("scope subset (A only) reconciles to calcSite for A", () => {
    const { totals } = buildReport({ ...baseCfg, scope: ["a1"] });
    const expected = sumCalcSite([siteA], [APR, MAY]);
    expect(totals.a.rev).toBeCloseTo(expected.revenue, 6);
    expect(totals.a.exp).toBeCloseTo(expected.expense, 6);
  });

  it("expense-by-head report total equals recognised expense (direct + spread)", () => {
    const report = buildReport({ ...baseCfg, dim: "parent" });
    expect(report.kind).toBe("head");
    expect(report.totals.cells[0].raw).toBe(GOLD_TOTAL_BOTH_MONTHS.expense);
  });

  it("spread schedule report lists the spread with monthly recognition", () => {
    const report = buildReport({ ...baseCfg, dim: "spread", periodMode: "single", month: MAY });
    expect(report.kind).toBe("spread");
    expect(report.rows).toHaveLength(1);
    const row = report.rows[0];
    expect(row[0]).toBe("Site A");
    expect(row[4]).toBe(3000);
    expect(row[6]).toBe(3);
    expect(row[7]).toBe(1000);
    expect(row[8]).toBe("active");
  });
});

describe("portfolio P&L matrix reconciles to calcSite", () => {
  const matrix = buildPortfolioPnlMatrix({ sites, records, scope: "all", mks: [MAY, APR] });

  it("grand total = sum of calcSite over reported site-months", () => {
    const expected = sumCalcSite(sites, [APR, MAY]);
    expect(matrix.grand.rev).toBeCloseTo(expected.revenue, 6);
    expect(matrix.grand.exp).toBeCloseTo(expected.expense, 6);
    expect(matrix.grand.profit).toBeCloseTo(expected.profit, 6);
    expect(matrix.grand.margin).toBeCloseTo(expected.margin, 6);
  });

  it("orders months ascending and totals each month independently", () => {
    expect(matrix.months.map((m) => m.mk)).toEqual([APR, MAY]);
    expect(matrix.monthTotals[0].a).toMatchObject({ rev: 98000, exp: 54500, profit: 43500 });
    expect(matrix.monthTotals[1].a).toMatchObject({ rev: 80000, exp: 61500, profit: 18500 });
  });

  it("row totals and month totals both foot to the grand total", () => {
    const rowRev = matrix.rows.reduce((a, r) => a + r.total.rev, 0);
    const monthRev = matrix.monthTotals.reduce((a, m) => a + m.a.rev, 0);
    expect(rowRev).toBeCloseTo(matrix.grand.rev, 6);
    expect(monthRev).toBeCloseTo(matrix.grand.rev, 6);
    const rowProfit = matrix.rows.reduce((a, r) => a + r.total.profit, 0);
    expect(rowProfit).toBeCloseTo(matrix.grand.profit, 6);
  });

  it("each cell equals calcSite for that site and month; unreported months are blank", () => {
    const a = matrix.rows.find((r) => r.id === "a1");
    expect(a.byMonth[0].a.rev).toBe(calcSite(siteA, APR, records).revenue);
    expect(a.byMonth[1].a.profit).toBe(calcSite(siteA, MAY, records).profit);
    const b = matrix.rows.find((r) => r.id === "b1");
    expect(b.byMonth[1].has).toBe(false);
    expect(b.byMonth[1].a).toBeNull();
  });

  it("matches buildReport grand totals for the same inputs", () => {
    const report = buildReport({
      sites,
      records,
      dim: "site",
      measures: ["revenue"],
      scope: "all",
      periodMode: "multi",
      selMonths: [APR, MAY],
      filter: "none",
    });
    expect(matrix.grand.rev).toBeCloseTo(report.totals.a.rev, 9);
    expect(matrix.grand.exp).toBeCloseTo(report.totals.a.exp, 9);
    expect(matrix.grand.profit).toBeCloseTo(report.totals.a.profit, 9);
    expect(matrix.grand.margin).toBeCloseTo(report.totals.a.margin, 9);
  });

  it("export grid portfolio row carries the grand totals (rounded to 0.1)", () => {
    const grid = portfolioPnlExportGrid(matrix);
    const total = grid[grid.length - 1];
    expect(total[0]).toBe("Portfolio total");
    expect(total.slice(-4)).toEqual([
      178000,
      116000,
      62000,
      Math.round(((62000 / 178000) * 100) * 10) / 10,
    ]);
  });

  it("aggPairs on zero revenue returns margin 0", () => {
    expect(aggPairs([[siteC, APR]], records).margin).toBe(0);
  });
});
