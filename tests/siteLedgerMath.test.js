import { describe, expect, it } from 'vitest';
import {
  parseEntryAmount,
  profitAndMargin,
  recognizedExpensesForPeriod,
  computeSignedRevenue,
  calcSitePeriod,
  calcSiteOverPeriods,
  estimateTotals,
  portfolioTotalsForPeriod,
} from '../src/pages/finance/site-ledger/calculations/ledgerMath.js';
import { describeSetupChanges, describeRemovals, diffSiteSetup } from '../src/pages/finance/api/siteSetupDiff.js';

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04'];
const monthIndex = (k) => MONTHS.indexOf(k);

describe('ledgerMath', () => {
  it('parses amounts with commas', () => {
    expect(parseEntryAmount('1,250.50')).toBe(1250.5);
    expect(parseEntryAmount('')).toBe(0);
    expect(parseEntryAmount('x')).toBe(0);
  });

  it('computes profit and margin with zero-revenue guard', () => {
    expect(profitAndMargin(100, 40)).toEqual({ profit: 60, margin: 60 });
    expect(profitAndMargin(0, 10)).toEqual({ profit: -10, margin: 0 });
  });

  it('amortizes spreads across months', () => {
    const ex = recognizedExpensesForPeriod({
      periodKey: '2026-02',
      childKeys: ['wages'],
      record: { wages: 100 },
      spreads: [{ head: 'wages', start: '2026-01', months: 4, total: 400 }],
      monthIndex,
    });
    expect(ex.direct.wages).toBe(100);
    expect(ex.amort.wages).toBe(100);
    expect(ex.total.wages).toBe(200);
  });

  it('applies signed revenue and reimbursements', () => {
    const revenue = computeSignedRevenue({
      revenueItems: [
        { key: 'saleRevenue', sign: 1 },
        { key: 'creditNote', sign: -1 },
        { key: 'esicBill', sign: 1 },
      ],
      record: { saleRevenue: 1000, creditNote: 50, esicBill: 0 },
      reimbursementTotal: () => 200,
    });
    expect(revenue).toBe(1000 - 50 + 200);
  });

  it('calcSitePeriod matches revenue − expense formula', () => {
    const site = {
      id: 'S1',
      structure: [{ parent: 'labour', children: ['wages'] }],
      spreads: [{ head: 'wages', start: '2026-01', months: 2, total: 200 }],
    };
    const result = calcSitePeriod({
      site,
      periodKey: '2026-01',
      records: { 'S1__2026-01': { saleRevenue: 500, wages: 50 } },
      revenueItems: [{ key: 'saleRevenue', sign: 1 }],
      monthIndex,
      siteChildKeys: (s) => (s.structure || []).flatMap((g) => g.children),
      reimbursementTotal: () => 0,
    });
    expect(result.revenue).toBe(500);
    expect(result.expense).toBe(150); // 50 direct + 100 amort
    expect(result.profit).toBe(350);
  });

  it('aggregates multiple periods and portfolio', () => {
    const site = {
      id: 'S1',
      structure: [{ parent: 'labour', children: ['wages'] }],
      spreads: [],
    };
    const records = {
      'S1__2026-01': { saleRevenue: 100, wages: 40 },
      'S1__2026-02': { saleRevenue: 200, wages: 50 },
    };
    const over = calcSiteOverPeriods({
      site,
      periodKeys: ['2026-01', '2026-02'],
      records,
      revenueItems: [{ key: 'saleRevenue', sign: 1 }],
      monthIndex,
      siteChildKeys: (s) => (s.structure || []).flatMap((g) => g.children),
      reimbursementTotal: () => 0,
    });
    expect(over.revenue).toBe(300);
    expect(over.expense).toBe(90);
    expect(over.profit).toBe(210);

    const portfolio = portfolioTotalsForPeriod({
      sites: [site],
      periodKey: '2026-01',
      records,
      revenueItems: [{ key: 'saleRevenue', sign: 1 }],
      monthIndex,
      siteChildKeys: (s) => (s.structure || []).flatMap((g) => g.children),
      reimbursementTotal: () => 0,
    });
    expect(portfolio.revenue).toBe(100);
    expect(portfolio.siteCount).toBe(1);
  });

  it('estimateTotals preserves signed revenue', () => {
    const t = estimateTotals(
      { revenue: { saleRevenue: 1000, creditNote: 100 }, expenses: { wages: 400 } },
      [
        { key: 'saleRevenue', sign: 1 },
        { key: 'creditNote', sign: -1 },
      ],
    );
    expect(t.revenue).toBe(900);
    expect(t.expense).toBe(400);
    expect(t.profit).toBe(500);
  });
});

describe('describeSetupChanges', () => {
  it('summarizes adds, moves and removals', () => {
    const baseline = {
      parents: [{ key: 'labour', label: 'Labour', color: '#111' }],
      library: [
        { key: 'wages', label: 'Wages', parent: 'labour' },
        { key: 'pf', label: 'PF', parent: 'labour' },
      ],
      sites: [{
        id: 'S1',
        name: 'Site One',
        structure: [{ parent: 'labour', children: ['wages', 'pf'] }],
        spreads: [],
        estimates: [],
      }],
    };
    const current = {
      parents: baseline.parents,
      library: baseline.library,
      sites: [{
        id: 'S1',
        name: 'Site One',
        structure: [{ parent: 'labour', children: ['wages'] }],
        spreads: [],
        estimates: [],
      }],
    };
    const diff = diffSiteSetup(baseline, current);
    const lines = describeSetupChanges(diff, {
      siteName: () => 'Site One',
      headLabel: (k) => k,
      parentLabel: (k) => k,
    });
    expect(lines.some((l) => /remove.*pf/i.test(l))).toBe(true);
    expect(describeRemovals(diff).length).toBeGreaterThan(0);
  });
});
