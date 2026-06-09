/** Client-side joins for finance bundle — sites, entries, budgets, records map. */

function settingsMap(rows) {
  const out = {};
  (rows || []).forEach((r) => {
    out[r.setting_key] = r.setting_value || {};
  });
  return out;
}

export function enrichFinanceDataset(raw) {
  const childById = Object.fromEntries((raw.expenseChildHeads || []).map((c) => [c.id, c]));
  const parentById = Object.fromEntries((raw.expenseParentHeads || []).map((p) => [p.id, p]));
  const revenueById = Object.fromEntries((raw.revenueHeads || []).map((r) => [r.id, r]));

  const structureBySite = {};
  (raw.siteStructure || []).forEach((row) => {
    if (!structureBySite[row.site_id]) structureBySite[row.site_id] = [];
    const child = childById[row.child_head_id];
    structureBySite[row.site_id].push({
      ...row,
      childCode: child?.code,
      childLabel: child?.label,
      parentCode: parentById[row.parent_head_id]?.code,
    });
  });

  const budgetsBySite = {};
  (raw.budgetVersions || []).forEach((bv) => {
    if (!budgetsBySite[bv.site_id]) budgetsBySite[bv.site_id] = [];
    const revenue = {};
    (raw.budgetRevenueLines || [])
      .filter((l) => l.budget_version_id === bv.id)
      .forEach((l) => {
        revenue[l.revenue_head_id] = Number(l.amount);
      });
    const expenses = {};
    (raw.budgetExpenseLines || [])
      .filter((l) => l.budget_version_id === bv.id)
      .forEach((l) => {
        expenses[l.child_head_id] = Number(l.amount);
      });
    budgetsBySite[bv.site_id].push({ ...bv, revenue, expenses });
  });

  const periodEntryByKey = {};
  (raw.periodEntries || []).forEach((pe) => {
    periodEntryByKey[`${pe.site_id}__${pe.period_key}`] = pe;
  });

  const records = {};
  (raw.periodEntries || []).forEach((pe) => {
    const key = `${pe.site_id}__${pe.period_key}`;
    records[key] = {};
    (raw.revenueEntryLines || [])
      .filter((l) => l.period_entry_id === pe.id)
      .forEach((l) => {
        records[key][l.revenue_head_id] = Number(l.amount);
      });
    (raw.expenseEntryLines || [])
      .filter((l) => l.period_entry_id === pe.id)
      .forEach((l) => {
        records[key][l.child_head_id] = Number(l.amount);
      });
  });

  const sites = (raw.sites || []).map((s) => ({
    ...s,
    contractStart: s.contract_start,
    contractEnd: s.contract_end,
    service: s.service_type,
    wo: s.work_order_no,
    structure: structureBySite[s.id] || [],
    budgets: budgetsBySite[s.id] || [],
  }));

  const marginSettings = settingsMap(raw.settings).margin_targets || {};
  const targetMargin = Number(marginSettings.target_margin) || 12;
  const warnMargin = Number(marginSettings.warn_margin) || 8;

  return {
    ...raw,
    sites,
    records,
    periodEntryByKey,
    settingsMap: settingsMap(raw.settings),
    targetMargin,
    warnMargin,
    childById,
    parentById,
    revenueById,
    spreads: raw.costAllocations || [],
  };
}
