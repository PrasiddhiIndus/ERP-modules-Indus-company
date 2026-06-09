import { monthIdx, dateToPeriodKey, expectedPeriods } from "./periods";

/** Build site structure groups from flat structure rows. */
export function displayStructure(site, parentHeads) {
  const parents = [...(parentHeads || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const structure = site.structure || [];
  return parents.map((p) => {
    const rows = structure
      .filter((s) => s.parent_head_id === p.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    return {
      parent: p.code,
      parentId: p.id,
      label: p.label,
      color: p.color,
      children: rows.map((r) => r.child_head_id),
      childCodes: rows.map((r) => r.childCode || r.child_head_id),
    };
  });
}

export function siteChildIds(site) {
  return (site.structure || []).map((s) => s.child_head_id);
}

export function recognizedExpenses(site, periodKey, records, spreads, months, directOverride) {
  const recKey = `${site.id}__${periodKey}`;
  const rec = directOverride || records[recKey] || {};
  const keys = new Set(siteChildIds(site));
  (spreads || []).forEach((s) => {
    if (s.site_id === site.id) keys.add(s.child_head_id);
  });

  const direct = {};
  const amort = {};
  const total = {};
  keys.forEach((k) => {
    direct[k] = Number(rec[k]) || 0;
    amort[k] = 0;
  });

  (spreads || [])
    .filter((s) => s.site_id === site.id)
    .forEach((sp) => {
      const si = monthIdx(sp.start_period, months);
      const ci = monthIdx(periodKey, months);
      const m = Number(sp.months) || 0;
      if (si >= 0 && m > 0 && ci >= si && ci < si + m) {
        amort[sp.child_head_id] = (amort[sp.child_head_id] || 0) + Number(sp.total_amount) / m;
      }
    });

  keys.forEach((k) => {
    total[k] = (direct[k] || 0) + (amort[k] || 0);
  });

  return { direct, amort, total, keys: [...keys] };
}

export function calcSite(site, periodKey, records, revenueHeads, spreads, months, directOverride) {
  const recKey = `${site.id}__${periodKey}`;
  const rec = directOverride || records[recKey] || {};
  const revenue = (revenueHeads || []).reduce(
    (s, it) => s + (it.sign || 1) * (Number(rec[it.id]) || 0),
    0,
  );
  const ex = recognizedExpenses(site, periodKey, records, spreads, months, directOverride);
  const expense = Object.values(ex.total).reduce((a, b) => a + b, 0);
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, expense, profit, margin, ex };
}

export function parentTotalsSite(site, periodKey, records, parentHeads, spreads, months) {
  const ex = recognizedExpenses(site, periodKey, records, spreads, months);
  const t = {};
  displayStructure(site, parentHeads).forEach((g) => {
    t[g.parentId] = g.children.reduce((a, ck) => a + (ex.total[ck] || 0), 0);
  });
  return t;
}

export function estimateFor(site, periodKey, months) {
  const versions = (site.budgets || [])
    .slice()
    .sort((a, b) => monthIdx(a.effective_from, months) - monthIdx(b.effective_from, months));
  let chosen = null;
  versions.forEach((v) => {
    if (monthIdx(v.effective_from, months) <= monthIdx(periodKey, months)) chosen = v;
  });
  return chosen || versions[0] || null;
}

export function estTotals(est, revenueHeads) {
  if (!est) return null;
  const revenue = (revenueHeads || []).reduce(
    (s, it) => s + (it.sign || 1) * (Number(est.revenue?.[it.id]) || 0),
    0,
  );
  const byHead = est.expenses || {};
  const expense = Object.values(byHead).reduce((a, b) => a + (Number(b) || 0), 0);
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, expense, profit, margin, byHead };
}

export function pendingPeriods(site, records, uptoKey, months) {
  return expectedPeriods(site, uptoKey, months).filter(
    (pk) => !records[`${site.id}__${pk}`],
  );
}

export function isPending(site, records, periodKey, months) {
  const start = site.contractStart ? dateToPeriodKey(site.contractStart) : null;
  const end = site.contractEnd ? dateToPeriodKey(site.contractEnd) : null;
  if (start || end) {
    const i = monthIdx(periodKey, months);
    const si = start ? monthIdx(start, months) : 0;
    const ei = end ? monthIdx(end, months) : months.length - 1;
    if (i < si || i > ei) return false;
  }
  return !records[`${site.id}__${periodKey}`];
}

export function expenseTree(
  site,
  periodKey,
  records,
  estVer,
  parentHeads,
  childHeads,
  spreads,
  months,
) {
  const ex = recognizedExpenses(site, periodKey, records, spreads, months);
  const childMap = Object.fromEntries((childHeads || []).map((c) => [c.id, c]));
  const estByHead = estVer?.expenses || {};
  return displayStructure(site, parentHeads).map((g) => {
    const children = g.children.map((ck) => ({
      key: ck,
      label: childMap[ck]?.label || ck,
      actual: ex.total[ck] || 0,
      amort: ex.amort[ck] || 0,
      est: Number(estByHead[ck]) || 0,
    }));
    const actual = children.reduce((a, c) => a + c.actual, 0);
    const est = children.reduce((a, c) => a + c.est, 0);
    const amort = children.reduce((a, c) => a + c.amort, 0);
    return {
      parent: g.parent,
      parentId: g.parentId,
      label: g.label,
      color: g.color,
      children,
      actual,
      est,
      amort,
    };
  });
}

export function aggregatePeriodRange(siteIds, periodKeys, sites, records, revenueHeads, spreads, months) {
  return periodKeys.reduce(
    (acc, pk) => {
      const arr = sites
        .filter((s) => !siteIds?.length || siteIds.includes(s.id))
        .map((s) => calcSite(s, pk, records, revenueHeads, spreads, months))
        .filter((c) => c.revenue || c.expense);
      const t = arr.reduce(
        (a, c) => ({
          revenue: a.revenue + c.revenue,
          expense: a.expense + c.expense,
          profit: a.profit + c.profit,
        }),
        { revenue: 0, expense: 0, profit: 0 },
      );
      t.margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
      acc[pk] = t;
      return acc;
    },
    {},
  );
}
