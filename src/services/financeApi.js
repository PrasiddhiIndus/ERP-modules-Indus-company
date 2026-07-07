/**
 * Finance module — Supabase `finance` schema.
 * Expose `finance` in Supabase Dashboard → Settings → API → Exposed schemas.
 */
import { supabase } from "../lib/supabase";
import { enrichFinanceDataset } from "../pages/finance/api/financeEnrichment";
import { safeDeleteChildHead, safeDeleteParentHead } from "../pages/finance/api/financeHeadSync";
import { slug } from "../pages/finance/lib/formatters";

const FINANCE_SCHEMA = "finance";
const CACHE_TTL_MS = 30_000;
let cache = null;
let cacheAt = 0;

export const FINANCE_SCHEMA_SETUP_HINT =
  'Finance schema not exposed. In Supabase Dashboard → Settings → API → Exposed schemas, add "finance". Then apply migrations 20260609120000_finance_schema.sql and 20260609130000_finance_siteledger_columns.sql.';

export function isFinanceSchemaError(error) {
  const msg = String(error?.message || error || "");
  const code = String(error?.code || "");
  return (
    code === "PGRST106" ||
    /schema must be one of/i.test(msg) ||
    /invalid schema/i.test(msg) ||
    /not exposed/i.test(msg) ||
    /406/i.test(msg)
  );
}

/** Clear message for finance DB failures (schema exposure, RLS, etc.). */
export function financeErrorMsg(error, context = "Finance request") {
  const msg = error?.message || String(error);
  const code = error?.code;
  if (isFinanceSchemaError(error)) {
    return `${context} failed: ${FINANCE_SCHEMA_SETUP_HINT}`;
  }
  if (/row-level security|RLS|policy/i.test(msg)) {
    return `${context} failed: Permission denied (RLS). Ensure your user has Finance access and finance migrations are applied.`;
  }
  if (code === "23503" || /foreign key|409|conflict/i.test(msg)) {
    return `${context} failed: This item is still linked to site data. Linked entries were cleared or the head was deactivated instead.`;
  }
  return msg || `${context} failed.`;
}

function table(name) {
  return supabase.schema(FINANCE_SCHEMA).from(name);
}

export function collectFinanceSchemaError(responses) {
  for (const res of responses) {
    if (res?.error && isFinanceSchemaError(res.error)) {
      return res.error;
    }
  }
  return null;
}

async function fetchRows(name, options = {}) {
  try {
    let q = table(name).select(options.select || "*");
    if (options.order) {
      const [col, opts] = options.order;
      q = q.order(col, opts);
    }
    if (options.eq) {
      Object.entries(options.eq).forEach(([k, v]) => {
        q = q.eq(k, v);
      });
    }
    return await q;
  } catch (e) {
    return { data: null, error: e };
  }
}

const financeRefreshListeners = new Set();

/** Subscribe to finance data changes (cache invalidation / saves). */
export function subscribeFinanceRefresh(listener) {
  financeRefreshListeners.add(listener);
  return () => financeRefreshListeners.delete(listener);
}

export function invalidateFinanceCache({ notify = true } = {}) {
  cache = null;
  cacheAt = 0;
  if (!notify) return;
  financeRefreshListeners.forEach((fn) => {
    try { fn(); } catch { /* ignore listener errors */ }
  });
}

const FETCH_PAGE_SIZE = 1000;

/** Paginate past PostgREST default row cap so period figures are not silently truncated. */
async function fetchAllRows(name, options = {}) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = table(name).select(options.select || "*");
    if (options.order) {
      const [col, opts] = options.order;
      q = q.order(col, opts);
    }
    if (options.eq) {
      Object.entries(options.eq).forEach(([k, v]) => {
        q = q.eq(k, v);
      });
    }
    const { data, error } = await q.range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return { data: rows, error: null };
}

export async function fetchFinanceModuleData({ force = false } = {}) {
  if (!force && cache && Date.now() - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  const [
    settingsRes,
    sitesRes,
    revenueHeadsRes,
    parentHeadsRes,
    childHeadsRes,
    structureRes,
    budgetsRes,
    budgetRevRes,
    budgetExpRes,
    periodEntriesRes,
    revLinesRes,
    expLinesRes,
    allocationsRes,
    siteAccessRes,
    importLogsRes,
  ] = await Promise.all([
    fetchRows("settings", { order: ["setting_key", { ascending: true }] }),
    fetchRows("sites", { order: ["sort_order", { ascending: true }] }),
    fetchRows("revenue_heads", { order: ["sort_order", { ascending: true }] }),
    fetchRows("expense_parent_heads", { order: ["sort_order", { ascending: true }] }),
    fetchRows("expense_child_heads", { order: ["sort_order", { ascending: true }] }),
    fetchRows("site_expense_structure", { order: ["sort_order", { ascending: true }] }),
    fetchRows("budget_versions", { order: ["effective_from", { ascending: true }] }),
    fetchRows("budget_revenue_lines"),
    fetchRows("budget_expense_lines"),
    fetchAllRows("period_entries", { order: ["period_key", { ascending: true }] }),
    fetchAllRows("revenue_entry_lines"),
    fetchAllRows("expense_entry_lines"),
    fetchRows("cost_allocations", { order: ["start_period", { ascending: true }] }),
    fetchRows("user_site_access"),
    fetchRows("import_export_logs", {
      order: ["created_at", { ascending: false }],
      select: "*",
    }),
  ]);

  const allResponses = [
    settingsRes, sitesRes, revenueHeadsRes, parentHeadsRes, childHeadsRes,
    structureRes, budgetsRes, budgetRevRes, budgetExpRes, periodEntriesRes,
    revLinesRes, expLinesRes, allocationsRes, siteAccessRes, importLogsRes,
  ];
  const schemaError = collectFinanceSchemaError(allResponses);
  if (schemaError) {
    throw new Error(financeErrorMsg(schemaError, "Load finance data"));
  }

  const errors = [
    settingsRes, sitesRes, revenueHeadsRes, parentHeadsRes, childHeadsRes,
    structureRes, budgetsRes, periodEntriesRes, allocationsRes,
  ].filter((r) => r.error);

  const raw = {
    settings: settingsRes.data || [],
    sites: sitesRes.data || [],
    revenueHeads: revenueHeadsRes.data || [],
    expenseParentHeads: parentHeadsRes.data || [],
    expenseChildHeads: childHeadsRes.data || [],
    siteStructure: structureRes.data || [],
    budgetVersions: budgetsRes.data || [],
    budgetRevenueLines: budgetRevRes.data || [],
    budgetExpenseLines: budgetExpRes.data || [],
    periodEntries: periodEntriesRes.data || [],
    revenueEntryLines: revLinesRes.data || [],
    expenseEntryLines: expLinesRes.data || [],
    costAllocations: allocationsRes.data || [],
    userSiteAccess: siteAccessRes.data || [],
    importExportLogs: (importLogsRes.data || []).slice(0, 50),
    loadErrors: errors.map((r) => r.error?.message).filter(Boolean),
  };

  const enriched = enrichFinanceDataset(raw);
  cache = enriched;
  cacheAt = Date.now();
  return enriched;
}

function periodFromDateValue(val) {
  if (!val) return null;
  const s = String(val);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

export async function upsertSite(payload) {
  const contractStart = payload.contract_start || payload.contractStart || null;
  const contractEnd = payload.contract_end || payload.contractEnd || null;
  const row = {
    name: payload.name?.trim(),
    service_type: payload.service_type || payload.serviceType || null,
    work_order_no: payload.work_order_no || payload.workOrderNo || null,
    contract_start: contractStart,
    contract_end: contractEnd,
    contract_start_period: payload.contract_start_period || periodFromDateValue(contractStart),
    contract_end_period: payload.contract_end_period || periodFromDateValue(contractEnd),
    status: payload.status || "active",
    manager_user_id: payload.manager_user_id || null,
    sort_order: payload.sort_order ?? 0,
    remarks: payload.remarks || null,
  };
  if (payload.code) row.code = payload.code;
  else if (!payload.id) row.code = slug(payload.name);
  if (payload.id) row.id = payload.id;
  const { data, error } = await table("sites").upsert(row).select().single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function deleteSite(id) {
  const { error } = await table("sites").delete().eq("id", id);
  if (error) throw error;
  invalidateFinanceCache();
}

export async function upsertRevenueHead(payload) {
  const row = {
    code: payload.code || slug(payload.label),
    label: payload.label?.trim(),
    sign: payload.sign ?? 1,
    sort_order: payload.sort_order ?? 0,
    is_active: payload.is_active !== false,
  };
  if (payload.id) row.id = payload.id;
  const { data, error } = await table("revenue_heads").upsert(row).select().single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function deleteRevenueHead(id) {
  const { error } = await table("revenue_heads").delete().eq("id", id);
  if (error) throw error;
  invalidateFinanceCache();
}

export async function upsertExpenseParentHead(payload) {
  const row = {
    code: payload.code || slug(payload.label),
    label: payload.label?.trim(),
    color: payload.color || "#1F6F4E",
    sort_order: payload.sort_order ?? 0,
    is_active: payload.is_active !== false,
  };
  if (payload.id) row.id = payload.id;
  const { data, error } = await table("expense_parent_heads").upsert(row).select().single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function deleteExpenseParentHead(id) {
  try {
    await safeDeleteParentHead(id);
  } catch (error) {
    throw new Error(financeErrorMsg(error, "Delete expense parent head"));
  }
  invalidateFinanceCache();
}

export async function upsertExpenseChildHead(payload) {
  const row = {
    code: payload.code || slug(payload.label),
    label: payload.label?.trim(),
    parent_head_id: payload.parent_head_id,
    sort_order: payload.sort_order ?? 0,
    is_active: payload.is_active !== false,
  };
  if (payload.id) row.id = payload.id;
  const { data, error } = await table("expense_child_heads").upsert(row).select().single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function deleteExpenseChildHead(id) {
  try {
    await safeDeleteChildHead(id);
  } catch (error) {
    throw new Error(financeErrorMsg(error, "Delete expense child head"));
  }
  invalidateFinanceCache();
}

export async function saveSiteStructure(siteId, structureRows) {
  await table("site_expense_structure").delete().eq("site_id", siteId);
  if (!structureRows?.length) {
    invalidateFinanceCache();
    return [];
  }
  const rows = structureRows.map((r, i) => ({
    site_id: siteId,
    parent_head_id: r.parent_head_id,
    child_head_id: r.child_head_id,
    sort_order: r.sort_order ?? i,
  }));
  const { data, error } = await table("site_expense_structure").insert(rows).select();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function upsertBudgetVersion(payload) {
  const row = {
    site_id: payload.site_id,
    effective_from: payload.effective_from,
    note: payload.note || null,
    status: payload.status || "active",
  };
  if (payload.id) row.id = payload.id;
  const { data, error } = await table("budget_versions").upsert(row).select().single();
  if (error) throw error;

  if (payload.revenueLines) {
    await table("budget_revenue_lines").delete().eq("budget_version_id", data.id);
    const revRows = Object.entries(payload.revenueLines)
      .filter(([, v]) => Number(v))
      .map(([revenueHeadId, amount]) => ({
        budget_version_id: data.id,
        revenue_head_id: revenueHeadId,
        amount: Number(amount),
      }));
    if (revRows.length) {
      const { error: revErr } = await table("budget_revenue_lines").insert(revRows);
      if (revErr) throw revErr;
    }
  }

  if (payload.expenseLines) {
    await table("budget_expense_lines").delete().eq("budget_version_id", data.id);
    const expRows = Object.entries(payload.expenseLines)
      .filter(([, v]) => Number(v))
      .map(([childHeadId, amount]) => ({
        budget_version_id: data.id,
        child_head_id: childHeadId,
        amount: Number(amount),
      }));
    if (expRows.length) {
      const { error: expErr } = await table("budget_expense_lines").insert(expRows);
      if (expErr) throw expErr;
    }
  }

  invalidateFinanceCache();
  return data;
}

export async function deleteBudgetVersion(id) {
  const { error } = await table("budget_versions").delete().eq("id", id);
  if (error) throw error;
  invalidateFinanceCache();
}

export async function savePeriodEntry(siteId, periodKey, { revenueLines = {}, expenseLines = {}, status = "submitted", notes = null } = {}) {
  const { data: existing } = await table("period_entries")
    .select("id")
    .eq("site_id", siteId)
    .eq("period_key", periodKey)
    .maybeSingle();

  let entryId = existing?.id;
  if (!entryId) {
    const { data: created, error } = await table("period_entries")
      .insert({ site_id: siteId, period_key: periodKey, status, notes })
      .select("id")
      .single();
    if (error) throw error;
    entryId = created.id;
  } else {
    const { error } = await table("period_entries")
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq("id", entryId);
    if (error) throw error;
  }

  await table("revenue_entry_lines").delete().eq("period_entry_id", entryId);
  await table("expense_entry_lines").delete().eq("period_entry_id", entryId);

  const revRows = Object.entries(revenueLines)
    .filter(([, v]) => Number(v))
    .map(([revenueHeadId, amount]) => ({
      period_entry_id: entryId,
      revenue_head_id: revenueHeadId,
      amount: Number(amount),
    }));
  if (revRows.length) {
    const { error } = await table("revenue_entry_lines").insert(revRows);
    if (error) throw error;
  }

  const expRows = Object.entries(expenseLines)
    .filter(([, v]) => Number(v))
    .map(([childHeadId, amount]) => ({
      period_entry_id: entryId,
      child_head_id: childHeadId,
      amount: Number(amount),
    }));
  if (expRows.length) {
    const { error } = await table("expense_entry_lines").insert(expRows);
    if (error) throw error;
  }

  invalidateFinanceCache();
  return entryId;
}

export async function upsertCostAllocation(payload) {
  const row = {
    site_id: payload.site_id,
    child_head_id: payload.child_head_id,
    total_amount: Number(payload.total_amount),
    start_period: payload.start_period,
    months: Number(payload.months),
    spread_mode: payload.spread_mode || "fixed",
    note: payload.note || null,
  };
  if (payload.id) row.id = payload.id;
  const { data, error } = await table("cost_allocations").upsert(row).select().single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function deleteCostAllocation(id) {
  const { error } = await table("cost_allocations").delete().eq("id", id);
  if (error) throw error;
  invalidateFinanceCache();
}

export async function updateSettings(key, value) {
  const { data, error } = await table("settings")
    .upsert({ setting_key: key, setting_value: value }, { onConflict: "setting_key" })
    .select()
    .single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function logImportExport(entry) {
  const { data, error } = await table("import_export_logs").insert({
    operation: entry.operation,
    file_name: entry.file_name || null,
    record_count: entry.record_count ?? 0,
    status: entry.status || "completed",
    error_message: entry.error_message || null,
    metadata: entry.metadata || {},
  }).select().single();
  if (error) throw error;
  invalidateFinanceCache();
  return data;
}

export async function exportFinanceBackup() {
  const data = await fetchFinanceModuleData({ force: true });
  return {
    exportedAt: new Date().toISOString(),
    sites: data.sites,
    revenueHeads: data.revenueHeads,
    expenseParentHeads: data.expenseParentHeads,
    expenseChildHeads: data.expenseChildHeads,
    siteStructure: data.siteStructure,
    budgetVersions: data.budgetVersions,
    budgetRevenueLines: data.budgetRevenueLines,
    budgetExpenseLines: data.budgetExpenseLines,
    periodEntries: data.periodEntries,
    revenueEntryLines: data.revenueEntryLines,
    expenseEntryLines: data.expenseEntryLines,
    costAllocations: data.costAllocations,
    settings: data.settings,
  };
}
