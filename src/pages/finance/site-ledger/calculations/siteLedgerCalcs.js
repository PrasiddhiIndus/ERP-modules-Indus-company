/**
 * Site Ledger calculation wrappers shared by SiteLedgerApp and the extracted pages.
 *
 * Thin adapters over ledgerMath + domain helpers — formulas are unchanged and
 * mirror the helpers that previously lived inside SiteLedgerApp.jsx.
 */
import {
  parseEntryAmount as parseEntryAmountMath,
  recognizedExpensesForPeriod,
  calcSitePeriod as calcSitePeriodMath,
  estimateTotals as estimateTotalsMath,
} from "./ledgerMath.js";
import { REVENUE_ITEMS, parentLabel, parentColor } from "../domain/constants.js";
import { displayStructure, siteChildKeys, childLabel } from "../domain/siteStructure.js";
import { estimateFor } from "../domain/siteLifecycle.js";
import { periodAbsoluteIndex as monthIdx, periodKeysBetween } from "../../lib/periods";
import {
  reimbursementTotal,
  reimbursementRowLabel,
  reimbursementDisplayLines,
} from "../../api/siteLedgerStore";

export function parseEntryAmount(v) {
  return parseEntryAmountMath(v);
}

export function recognizedExpenses(site, mk, records, directOverride) {
  const rec = directOverride || records[`${site.id}__${mk}`] || {};
  return recognizedExpensesForPeriod({
    periodKey: mk,
    childKeys: siteChildKeys(site),
    record: rec,
    spreads: site.spreads || [],
    monthIndex: monthIdx,
  });
}

export function calcSite(site, mk, records, directOverride) {
  return calcSitePeriodMath({
    site,
    periodKey: mk,
    records,
    revenueItems: REVENUE_ITEMS,
    monthIndex: monthIdx,
    siteChildKeys,
    reimbursementTotal,
    directOverride,
  });
}

export function parentTotalsSite(site, mk, records) {
  const ex = recognizedExpenses(site, mk, records);
  const t = {};
  displayStructure(site).forEach((g) => {
    t[g.parent] = g.children.reduce((a, ck) => a + (ex.total[ck] || 0), 0);
  });
  return t;
}

export function estTotals(est) {
  return estimateTotalsMath(est, REVENUE_ITEMS);
}

export function calcSiteOverPeriodKeys(site, periodKeys, records) {
  const agg = (periodKeys || []).reduce(
    (acc, mk) => {
      const c = calcSite(site, mk, records);
      return {
        revenue: acc.revenue + c.revenue,
        expense: acc.expense + c.expense,
        profit: acc.profit + c.profit,
      };
    },
    { revenue: 0, expense: 0, profit: 0 },
  );
  agg.margin = agg.revenue > 0 ? (agg.profit / agg.revenue) * 100 : 0;
  return agg;
}

export function estTotalsForPeriodKeys(site, periodKeys) {
  let revenue = 0;
  let expense = 0;
  let profit = 0;
  let any = false;
  (periodKeys || []).forEach((mk) => {
    const e = estTotals(estimateFor(site, mk));
    if (!e) return;
    any = true;
    revenue += e.revenue;
    expense += e.expense;
    profit += e.profit;
  });
  if (!any) return null;
  return { revenue, expense, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
}

export function resolveSitePeriodKeys(periodFrom, periodTo, month) {
  const from = periodFrom || month;
  const to = periodTo || month;
  if (!from || !to) return month ? [month] : [];
  if (from === to) return [to];
  return periodKeysBetween(from, to);
}

export function revBreakForPeriod(site, periodKeys, records) {
  const lastMk = periodKeys[periodKeys.length - 1];
  const lastRec = lastMk ? (records[`${site.id}__${lastMk}`] || {}) : {};
  return REVENUE_ITEMS.map((it) => {
    let raw = 0;
    let est = 0;
    periodKeys.forEach((mk) => {
      const rec = records[`${site.id}__${mk}`] || {};
      const estVer = estimateFor(site, mk);
      if (it.key === "esicBill") raw += reimbursementTotal(rec);
      else raw += parseEntryAmount(rec[it.key]);
      est += Number(estVer?.revenue?.[it.key]) || 0;
    });
    if (it.key === "esicBill") {
      const lines = reimbursementDisplayLines(lastRec);
      return {
        ...it,
        label: periodKeys.length === 1 && lines.length === 1
          ? `Reimbursement · ${lines[0].label}`
          : reimbursementRowLabel(lastRec),
        raw,
        est,
      };
    }
    return { ...it, label: it.label, raw, est };
  });
}

export function expenseTreeForPeriod(site, periodKeys, records) {
  const childAgg = new Map();
  displayStructure(site).forEach((g) => {
    g.children.forEach((ck) => {
      if (!childAgg.has(ck)) {
        childAgg.set(ck, { key: ck, label: childLabel(site, ck), actual: 0, amort: 0, est: 0 });
      }
    });
  });
  periodKeys.forEach((mk) => {
    const ex = recognizedExpenses(site, mk, records);
    const estByHead = estimateFor(site, mk)?.expenses || {};
    childAgg.forEach((ch, ck) => {
      ch.actual += ex.total[ck] || 0;
      ch.amort += ex.amort[ck] || 0;
      ch.est += Number(estByHead[ck]) || 0;
    });
  });
  return displayStructure(site).map((g) => {
    const children = g.children.map((ck) => childAgg.get(ck) || {
      key: ck,
      label: childLabel(site, ck),
      actual: 0,
      amort: 0,
      est: 0,
    });
    const actual = children.reduce((a, c) => a + c.actual, 0);
    const est = children.reduce((a, c) => a + c.est, 0);
    const amort = children.reduce((a, c) => a + c.amort, 0);
    return {
      parent: g.parent,
      label: parentLabel(g.parent),
      color: parentColor(g.parent),
      children,
      actual,
      est,
      amort,
    };
  });
}

// expandable tree for the statement: parents with child est/actual/var
export function expenseTree(site, mk, records, estVer) {
  const ex = recognizedExpenses(site, mk, records);
  const estByHead = estVer?.expenses || {};
  return displayStructure(site).map((g) => {
    const children = g.children.map((ck) => ({
      key: ck,
      label: childLabel(site, ck),
      actual: ex.total[ck] || 0,
      amort: ex.amort[ck] || 0,
      est: Number(estByHead[ck]) || 0,
    }));
    const actual = children.reduce((a, c) => a + c.actual, 0);
    const est = children.reduce((a, c) => a + c.est, 0);
    const amort = children.reduce((a, c) => a + c.amort, 0);
    return { parent: g.parent, label: parentLabel(g.parent), color: parentColor(g.parent), children, actual, est, amort };
  });
}
