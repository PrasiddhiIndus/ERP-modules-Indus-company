/**
 * Persists SiteLedger document model ↔ finance schema.
 * Document: { sites, records, library, parents } — same as pnl_dashboard.jsx
 */
import { supabase } from "../../../lib/supabase";
import { isSupabaseEnvConfigured } from "../../../lib/supabaseConfig";
import { financeErrorMsg, invalidateFinanceCache, isFinanceSchemaError } from "../../../services/financeApi";
import { diffSiteSetup, stableStringify } from "./siteSetupDiff";
import { TOKENS } from "../../../theme/tokens";
import { isAtomicConcurrencyEnabled } from "../site-ledger/featureFlags.js";
import {
  FINANCE_ERROR_CODES,
  newFinanceRequestId,
  parseFinanceSaveResult,
} from "../site-ledger/persistence/financeConcurrency.js";

const SCHEMA = "finance";
export const SITE_META_PREFIX = "@@siteMeta::";

/** Thrown when server OCC rejects a stale period/setup write. Working copy must be kept. */
export class FinanceConflictError extends Error {
  constructor(parsed) {
    super(parsed?.message || "Revision conflict");
    this.name = "FinanceConflictError";
    this.code = parsed?.code || FINANCE_ERROR_CODES.REVISION_CONFLICT;
    this.expectedRevision = parsed?.expectedRevision ?? null;
    this.currentRevision = parsed?.currentRevision ?? null;
    this.server = parsed?.server || null;
    this.financeResult = parsed?.raw || parsed || null;
  }
}

export function parseSiteMeta(remarks) {
  if (!remarks || typeof remarks !== "string") return {};
  const i = remarks.indexOf(SITE_META_PREFIX);
  if (i === -1) return {};
  try {
    return JSON.parse(remarks.slice(i + SITE_META_PREFIX.length));
  } catch {
    return {};
  }
}

export function serializeSiteMeta(site) {
  const meta = {
    siteGroup: site.siteGroup || site.id,
    version: site.version || 1,
    ocNumber: site.ocNumber ? String(site.ocNumber).trim() : "",
    ocDate: site.ocDate ? String(site.ocDate).trim() : "",
    estContractStart: site.estContractStart ? String(site.estContractStart).trim() : "",
    estContractEnd: site.estContractEnd ? String(site.estContractEnd).trim() : "",
    siteType: site.siteType === "shutdown" || site.siteType === "safety" || site.siteType === "fire"
      ? site.siteType
      : site.siteType === "regular"
        ? "regular"
        : "fire",
  };
  if (Array.isArray(site.customHeads) && site.customHeads.length) {
    meta.customHeads = site.customHeads;
  }
  if (site.structureEmpty === true) {
    meta.structureEmpty = true;
  }
  if (Array.isArray(site.excludedHeadKeys) && site.excludedHeadKeys.length) {
    meta.excludedHeadKeys = site.excludedHeadKeys;
  }
  return `${SITE_META_PREFIX}${JSON.stringify(meta)}`;
}

export const REVENUE_ITEMS = [
  { key: "saleRevenue", label: "Sale Revenue", sign: 1 },
  { key: "esicBill", label: "Reimbursement", sign: 1 },
  { key: "creditNote", label: "less: Credit Note / deductions", sign: -1 },
];

export const REIMBURSEMENT_OTHER_KEY = "other";

export const REIMBURSEMENT_TYPES = [
  { key: "pf", label: "PF" },
  { key: "esic", label: "ESIC" },
  { key: "mwHike", label: "Impact of M.W Hike on salary" },
  { key: "nhPh", label: "NH/PH" },
  { key: "gratuity", label: "Gratuity" },
  { key: "bonus", label: "Bonus" },
  { key: "arrears", label: "Arrears" },
  { key: REIMBURSEMENT_OTHER_KEY, label: "Other" },
];

export function reimbursementLabel(typeKey) {
  return REIMBURSEMENT_TYPES.find((t) => t.key === typeKey)?.label || "";
}

export function newReimbursementId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Normalize legacy single-type + amount into multi-item array. */
export function normalizeReimbursementsFromRecord(rec) {
  if (Array.isArray(rec?.reimbursements) && rec.reimbursements.length) {
    return rec.reimbursements.map((it) => ({
      id: it.id || newReimbursementId(),
      type: it.type || "",
      amount: Number(it.amount) || 0,
      ...(it.type === REIMBURSEMENT_OTHER_KEY ? { label: String(it.label ?? "").trim() } : {}),
    }));
  }
  if (rec?.reimbursementType && Number(rec.esicBill)) {
    const item = {
      id: newReimbursementId(),
      type: rec.reimbursementType,
      amount: Number(rec.esicBill),
    };
    if (rec.reimbursementType === REIMBURSEMENT_OTHER_KEY && rec.reimbursementOtherLabel) {
      item.label = String(rec.reimbursementOtherLabel);
    }
    return [item];
  }
  return [];
}

export function reimbursementTotal(rec) {
  return normalizeReimbursementsFromRecord(rec).reduce((s, it) => s + (Number(it.amount) || 0), 0);
}

export function reimbursementDisplayLines(rec) {
  return normalizeReimbursementsFromRecord(rec).map((it) => ({
    label:
      it.type === REIMBURSEMENT_OTHER_KEY
        ? (it.label || "Other").trim() || "Other"
        : reimbursementLabel(it.type) || it.type,
    amount: Number(it.amount) || 0,
  }));
}

export function reimbursementRowLabel(rec) {
  const lines = reimbursementDisplayLines(rec);
  if (!lines.length) return "Reimbursement";
  if (lines.length === 1) return `Reimbursement · ${lines[0].label}`;
  return `Reimbursement · ${lines.length} items`;
}

function parsePeriodMeta(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Audit context of the save task now running (see runSerialized). Sent to the activity-log
 * interceptor in lib/supabase.js as a local-only header (stripped before the network) so each
 * logged write says whether a person clicked Save or the app flushed something on its own.
 */
let activeAudit = null;
const AUDIT_HEADER = "x-erp-activity";

function withAuditHeader(builder) {
  if (!activeAudit || !builder) return builder;
  const value = JSON.stringify(activeAudit);
  if (builder.headers && typeof builder.headers.set === "function") builder.headers.set(AUDIT_HEADER, value);
  else if (typeof builder.setHeader === "function") builder.setHeader(AUDIT_HEADER, value);
  return builder;
}

function t(name) {
  return withAuditHeader(supabase.schema(SCHEMA).from(name));
}

function financeRpc(fn, args) {
  return withAuditHeader(supabase.schema(SCHEMA).rpc(fn, args));
}

function newAuditBatchId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* ignore */ }
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalise an audit context: trigger is "user" (clicked/typed) or "automatic" (app on its own). */
function auditContext(audit, fallbackAction) {
  const trigger = audit?.trigger === "automatic" ? "automatic" : "user";
  return {
    trigger,
    action: String(audit?.action || fallbackAction || "site_ledger_save"),
    batch: audit?.batch || newAuditBatchId(),
  };
}

/** Legacy parent codes from older Site Ledger versions. */
const PARENT_KEY_MIGRATE = {
  vehicle: "fireTenderVehicle",
  maintenance: "fireTenderVehicle",
  admin: "adminMisc",
};

function migrateParentKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return raw;
  return PARENT_KEY_MIGRATE[raw] || raw;
}

/**
 * Resolve a parent head UUID by code.
 * Never guesses an unrelated parent (that mislabels cost lines).
 * adminMisc/admin fallback applies only to the admin-family keys after migration.
 */
function resolveParentId(parentKey, parentIdByCode) {
  const key = migrateParentKey(parentKey);
  if (!key) return null;
  if (parentIdByCode?.[key]) return parentIdByCode[key];
  if (key === "adminMisc" || key === "admin") {
    return parentIdByCode?.adminMisc || parentIdByCode?.admin || null;
  }
  return null;
}

function missingIdMapKeys({ parentKeys = [], childKeys = [], revKeys = [] }, parentIdByCode, childIdByCode, revIdByCode) {
  const missing = [];
  for (const raw of parentKeys) {
    const key = migrateParentKey(raw);
    if (!resolveParentId(raw, parentIdByCode)) {
      missing.push(`parent:${key || raw}`);
    }
  }
  for (const key of childKeys) {
    if (key && !childIdByCode?.[key]) missing.push(key);
  }
  for (const key of revKeys) {
    if (key && !revIdByCode?.[key]) missing.push(`revenue:${key}`);
  }
  return missing;
}

/**
 * Revalidate module-level head-id caches for the keys this save needs.
 * Reloads / re-syncs when any required key is missing — never substitutes silently.
 */
async function ensureIdMapsForWrite({
  parentKeys = [],
  childKeys = [],
  revKeys = [],
  parents = null,
  library = null,
  sites = null,
} = {}) {
  let parentIdByCode = cachedHeadMaps?.parentIdByCode || null;
  let childIdByCode = cachedHeadMaps?.childIdByCode || null;
  let revIdByCode = revKeys.length ? cachedRevIdByCode : (cachedRevIdByCode || {});

  let missing = missingIdMapKeys(
    { parentKeys, childKeys, revKeys },
    parentIdByCode,
    childIdByCode,
    revIdByCode,
  );

  if (missing.length || !parentIdByCode || !childIdByCode || (revKeys.length && !cachedRevIdByCode)) {
    const loaded = await loadHeadIdMaps();
    parentIdByCode = loaded.parentIdByCode;
    childIdByCode = loaded.childIdByCode;
    cachedHeadMaps = loaded;

    if (revKeys.length) {
      const haveAllRev = revKeys.every((k) => cachedRevIdByCode?.[k]);
      if (!haveAllRev) {
        cachedRevIdByCode = null;
        revIdByCode = await upsertRevenueHeads();
        cachedRevIdByCode = revIdByCode;
      } else {
        revIdByCode = cachedRevIdByCode;
      }
    } else if (!revIdByCode || !Object.keys(revIdByCode).length) {
      revIdByCode = await getRevIdByCode();
    }

    missing = missingIdMapKeys(
      { parentKeys, childKeys, revKeys },
      parentIdByCode,
      childIdByCode,
      revIdByCode,
    );
  }

  if (missing.length && Array.isArray(parents) && parents.length && library) {
    // Create ONLY the heads that are missing in the database. Re-upserting every head from
    // this tab's copy used to revert other users' renames and flooded the activity log with
    // "updated expense child head" rows the user never made.
    const fullLibrary = libraryForSitesPersist(library, sites || []);
    const missingChildKeys = new Set(childKeys.filter((k) => k && !childIdByCode?.[k]));
    const childrenToCreate = fullLibrary.filter((h) => missingChildKeys.has(h.key));
    const neededParentKeys = new Set([
      ...parentKeys.filter((k) => !resolveParentId(k, parentIdByCode)).map((k) => migrateParentKey(k)),
      ...childrenToCreate
        .map((h) => migrateParentKey(h.parent))
        .filter((k) => k && !resolveParentId(k, parentIdByCode)),
    ]);
    const parentsToCreate = parents.filter((p) => neededParentKeys.has(p.key));
    if (parentsToCreate.length) {
      const sortIndexByKey = Object.fromEntries(parents.map((p, i) => [p.key, i]));
      parentIdByCode = await syncParents(parentsToCreate, { sortIndexByKey });
    }
    if (childrenToCreate.length) {
      const sortIndexByKey = Object.fromEntries(fullLibrary.map((h, i) => [h.key, i]));
      childIdByCode = await syncLibrary(childrenToCreate, parentIdByCode, { sortIndexByKey });
    }
    cachedHeadMaps = { parentIdByCode, childIdByCode };
    if (revKeys.length) {
      cachedRevIdByCode = null;
      revIdByCode = await upsertRevenueHeads();
      cachedRevIdByCode = revIdByCode;
    }
    missing = missingIdMapKeys(
      { parentKeys, childKeys, revKeys },
      parentIdByCode,
      childIdByCode,
      revIdByCode,
    );
  }

  if (missing.length) {
    throw new Error(`Cost lines not synced to database: ${missing.join(", ")}`);
  }

  return {
    parentIdByCode,
    childIdByCode,
    revIdByCode: revIdByCode || cachedRevIdByCode || {},
  };
}

function collectStructureMapKeys(structure) {
  const parentKeys = [];
  const childKeys = [];
  for (const grp of dedupeSiteStructure(structure || [])) {
    if (grp.parent) parentKeys.push(grp.parent);
    for (const ck of grp.children || []) {
      if (ck) childKeys.push(ck);
    }
  }
  return { parentKeys, childKeys };
}

/** Parse amounts entered with commas / currency noise (matches Site Ledger entry parsing). */
export function parseBudgetAmount(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function periodFromDate(val) {
  if (!val) return null;
  const s = String(val);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

/** Each child head may appear only once per site (DB unique on site_id + child_head_id). */
function dedupeSiteStructure(structure) {
  const seen = new Set();
  return (structure || [])
    .map((g) => {
      const children = (g.children || []).filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { parent: g.parent, children };
    })
    .filter((g) => g.children.length > 0);
}

/**
 * One queue for every Site Ledger write (Site Setup and figures). Running one task at a time
 * means writes cannot interleave AND the audit context above always belongs to the task that
 * issued the request.
 */
let saveChain = Promise.resolve();
function runSerialized(task, audit) {
  const run = saveChain.then(async () => {
    activeAudit = audit || null;
    try {
      return await task();
    } finally {
      activeAudit = null;
    }
  });
  saveChain = run.catch(() => {});
  return run;
}
function enqueueSave(task, audit) {
  return runSerialized(task, auditContext(audit, "site_setup_save"));
}
function enqueuePeriodSave(task, audit) {
  return runSerialized(task, auditContext(audit, "figure_save"));
}

/** Coalesce rapid keystrokes; longer than paint cycles to cut duplicate RPCs. */
const PERIOD_FLUSH_MS = 450;
const periodFlushBuckets = new Map();

let cachedRevIdByCode = null;
let cachedHeadMaps = null;
const siteUuidByCode = new Map();
/** Skip identical replace_period_entry_lines payloads after a successful sync. */
const lastSyncedPeriodFingerprint = new Map();

function invalidatePersistCaches() {
  cachedRevIdByCode = null;
  cachedHeadMaps = null;
}

function periodLinesFingerprint(revRows, expRows, notes) {
  const rev = (revRows || [])
    .map((r) => `${r.revenue_head_id}:${Number(r.amount) || 0}`)
    .sort()
    .join("|");
  const exp = (expRows || [])
    .map((r) => `${r.child_head_id}:${Number(r.amount) || 0}`)
    .sort()
    .join("|");
  return `${notes || ""}\n${rev}\n${exp}`;
}

function periodLinesOnlyFingerprint(revRows, expRows) {
  const rev = (revRows || [])
    .map((r) => `${r.revenue_head_id}:${Number(r.amount) || 0}`)
    .sort()
    .join("|");
  const exp = (expRows || [])
    .map((r) => `${r.child_head_id}:${Number(r.amount) || 0}`)
    .sort()
    .join("|");
  return `${rev}\n${exp}`;
}

function invalidateSiteUuidCache(siteCode) {
  if (siteCode) siteUuidByCode.delete(siteCode);
  else siteUuidByCode.clear();
}

async function getRevIdByCode() {
  if (cachedRevIdByCode) return cachedRevIdByCode;
  cachedRevIdByCode = await upsertRevenueHeads();
  return cachedRevIdByCode;
}

async function getHeadMaps() {
  if (cachedHeadMaps) return cachedHeadMaps;
  cachedHeadMaps = await loadHeadIdMaps();
  return cachedHeadMaps;
}

const FETCH_PAGE_SIZE = 1000;

const FETCH_PARALLEL_PAGES = 6;

/**
 * Fetch every row of a table. First page returns the exact row count; remaining pages
 * are then fetched in parallel. Paging is always ordered with an `id` tie-breaker
 * (primary-key index) so rows are never skipped or duplicated between pages.
 */
async function fetchAll(tableName, order) {
  const page = (from, withCount = false) => {
    let q = t(tableName).select("*", withCount ? { count: "exact" } : undefined);
    if (order) q = q.order(order[0], order[1]);
    if (!order || order[0] !== "id") q = q.order("id", { ascending: true });
    return q.range(from, from + FETCH_PAGE_SIZE - 1);
  };

  const first = await page(0, true);
  if (first.error) throw first.error;
  const rows = [...(first.data || [])];
  const total = Number.isFinite(first.count) ? first.count : null;
  if (rows.length < FETCH_PAGE_SIZE) return rows;

  if (total == null) {
    // Count unavailable — fall back to sequential paging.
    let from = FETCH_PAGE_SIZE;
    while (true) {
      const { data, error } = await page(from);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < FETCH_PAGE_SIZE) break;
      from += FETCH_PAGE_SIZE;
    }
    return rows;
  }

  const offsets = [];
  for (let from = FETCH_PAGE_SIZE; from < total; from += FETCH_PAGE_SIZE) offsets.push(from);
  for (let i = 0; i < offsets.length; i += FETCH_PARALLEL_PAGES) {
    const batch = await Promise.all(offsets.slice(i, i + FETCH_PARALLEL_PAGES).map((from) => page(from)));
    batch.forEach(({ data, error }) => {
      if (error) throw error;
      rows.push(...(data || []));
    });
  }
  return rows;
}

/** Group rows by a key column in one pass (replaces per-parent `.filter()` scans). */
function groupBy(rows, key) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = r[key];
    let arr = map.get(k);
    if (!arr) {
      arr = [];
      map.set(k, arr);
    }
    arr.push(r);
  });
  return map;
}
const EMPTY_ROWS = [];

async function fetchBundle() {
  try {
    const [
      sites,
      parents,
      children,
      revenueHeads,
      structure,
      budgets,
      budgetRev,
      budgetExp,
      periods,
      revLines,
      expLines,
      spreads,
    ] = await Promise.all([
      fetchAll("sites", ["sort_order", { ascending: true }]),
      fetchAll("expense_parent_heads", ["sort_order", { ascending: true }]),
      fetchAll("expense_child_heads", ["sort_order", { ascending: true }]),
      fetchAll("revenue_heads", ["sort_order", { ascending: true }]),
      fetchAll("site_expense_structure", ["sort_order", { ascending: true }]),
      fetchAll("budget_versions", ["effective_from", { ascending: true }]),
      fetchAll("budget_revenue_lines"),
      fetchAll("budget_expense_lines"),
      fetchAll("period_entries", ["period_key", { ascending: true }]),
      fetchAll("revenue_entry_lines"),
      fetchAll("expense_entry_lines"),
      fetchAll("cost_allocations", ["start_period", { ascending: true }]),
    ]);
    return {
      sites,
      parents,
      children,
      revenueHeads,
      structure,
      budgets,
      budgetRev,
      budgetExp,
      periods,
      revLines,
      expLines,
      spreads,
      errors: [],
    };
  } catch (e) {
    const msg = e?.message || String(e);
    return {
      sites: [],
      parents: [],
      children: [],
      revenueHeads: [],
      structure: [],
      budgets: [],
      budgetRev: [],
      budgetExp: [],
      periods: [],
      revLines: [],
      expLines: [],
      spreads: [],
      errors: [msg],
    };
  }
}

/**
 * Active heads, plus inactive ones a site still uses — otherwise those components vanish from
 * the screen and the next save of that site would remove them.
 */
function buildParents(rows, defaultParents, referencedIds = new Set()) {
  const active = (rows || []).filter((p) => p.is_active !== false || referencedIds.has(p.id));
  if (!active.length) return defaultParents.map((p) => ({ ...p }));
  return active.map((p) => ({
    key: p.code,
    label: p.label,
    color: p.color || TOKENS.accent,
    custom: !!p.is_custom,
  }));
}

function buildLibrary(rows, parentById, defaultLibrary, referencedIds = new Set()) {
  const active = (rows || []).filter((c) => c.is_active !== false || referencedIds.has(c.id));
  if (!active.length) return defaultLibrary.map((c) => ({ ...c }));
  return active.map((c) => ({
    key: c.code,
    label: c.label,
    parent: parentById[c.parent_head_id]?.code || "admin",
    custom: !!c.is_custom,
  }));
}

function buildSites(raw, parentById, childById) {
  const siteIdToCode = Object.fromEntries(raw.sites.map((s) => [s.id, s.code]));
  const structureBySiteId = {};
  raw.structure.forEach((row) => {
    if (!structureBySiteId[row.site_id]) structureBySiteId[row.site_id] = {};
    const pk = parentById[row.parent_head_id]?.code;
    const ck = childById[row.child_head_id]?.code;
    if (!pk || !ck) return;
    if (!structureBySiteId[row.site_id][pk]) structureBySiteId[row.site_id][pk] = [];
    structureBySiteId[row.site_id][pk].push(ck);
  });

  const revById = Object.fromEntries(raw.revenueHeads.map((r) => [r.id, r.code]));
  const budgetsBySite = {};
  const budgetRevByVersion = groupBy(raw.budgetRev, "budget_version_id");
  const budgetExpByVersion = groupBy(raw.budgetExp, "budget_version_id");
  raw.budgets.forEach((bv) => {
    if (!budgetsBySite[bv.site_id]) budgetsBySite[bv.site_id] = [];
    const revenue = {};
    (budgetRevByVersion.get(bv.id) || EMPTY_ROWS)
      .forEach((l) => {
        const code = revById[l.revenue_head_id];
        if (code) revenue[code] = Number(l.amount);
      });
    const expenses = {};
    (budgetExpByVersion.get(bv.id) || EMPTY_ROWS)
      .forEach((l) => {
        const code = childById[l.child_head_id]?.code;
        if (code) expenses[code] = Number(l.amount);
      });
    budgetsBySite[bv.site_id].push({
      id: bv.external_id || bv.id,
      effectiveFrom: periodFromDate(bv.effective_from) || bv.effective_from,
      note: bv.note || "",
      revenue,
      expenses,
    });
  });

  const spreadsBySite = {};
  raw.spreads.forEach((sp) => {
    if (!spreadsBySite[sp.site_id]) spreadsBySite[sp.site_id] = [];
    spreadsBySite[sp.site_id].push({
      id: sp.external_id || sp.id,
      head: childById[sp.child_head_id]?.code || "",
      total: Number(sp.total_amount),
      start: sp.start_period,
      months: Number(sp.months),
      mode: sp.spread_mode || "fixed",
      note: sp.note || "",
    });
  });

  return raw.sites.map((s) => {
    const structMap = structureBySiteId[s.id] || {};
    const structure = Object.entries(structMap).map(([parent, children]) => ({
      parent,
      children,
    }));
    const meta = parseSiteMeta(s.remarks);
    return {
      id: s.code,
      name: s.name,
      service: s.service_type || "",
      wo: s.work_order_no || "",
      ocNumber: meta.ocNumber || "",
      ocDate: meta.ocDate || "",
      estContractStart: meta.estContractStart || "",
      estContractEnd: meta.estContractEnd || "",
      siteType: meta.siteType === "shutdown" || meta.siteType === "safety" || meta.siteType === "fire"
        ? meta.siteType
        : meta.siteType === "regular"
          ? "regular"
          : "fire",
      contractStart: s.contract_start_period || periodFromDate(s.contract_start),
      contractEnd: s.contract_end_period || periodFromDate(s.contract_end),
      status: s.status || "active",
      siteGroup: meta.siteGroup || s.code,
      version: meta.version || 1,
      customHeads: Array.isArray(meta.customHeads) ? meta.customHeads : [],
      structureEmpty: meta.structureEmpty === true,
      excludedHeadKeys: Array.isArray(meta.excludedHeadKeys) ? meta.excludedHeadKeys : [],
      structure,
      spreads: spreadsBySite[s.id] || [],
      estimates: budgetsBySite[s.id] || [],
      setupRevision: s.setup_revision != null ? Number(s.setup_revision) || 1 : 1,
    };
  });
}

function buildRecords(raw, childById, revById) {
  const records = {};
  const siteIdToCode = Object.fromEntries(raw.sites.map((s) => [s.id, s.code]));
  const revLinesByEntry = groupBy(raw.revLines, "period_entry_id");
  const expLinesByEntry = groupBy(raw.expLines, "period_entry_id");
  raw.periods.forEach((pe) => {
    const siteCode = siteIdToCode[pe.site_id];
    if (!siteCode) return;
    const key = `${siteCode}__${pe.period_key}`;
    records[key] = {};
    (revLinesByEntry.get(pe.id) || EMPTY_ROWS)
      .forEach((l) => {
        const code = revById[l.revenue_head_id];
        if (code) records[key][code] = Number(l.amount);
      });
    (expLinesByEntry.get(pe.id) || EMPTY_ROWS)
      .forEach((l) => {
        const code = childById[l.child_head_id]?.code;
        if (code) records[key][code] = Number(l.amount);
      });
    const meta = parsePeriodMeta(pe.notes);
    if (meta.audit?.updatedAt) {
      records[key]._audit = meta.audit;
    }
    if (Array.isArray(meta.reimbursements) && meta.reimbursements.length) {
      records[key].reimbursements = meta.reimbursements;
    } else if (meta.reimbursementType) {
      records[key].reimbursementType = meta.reimbursementType;
    }
    if (meta.creditNoteRemark) {
      records[key].creditNoteRemark = String(meta.creditNoteRemark);
    }
    // Phase 3 OCC — additive; older DBs without the column yield undefined → treat as 0/1 on save.
    if (pe.revision != null) {
      records[key]._revision = Number(pe.revision) || 1;
    }
  });
  return records;
}

export async function loadLedgerStore(defaultParents, defaultLibrary) {
  try {
    if (!isSupabaseEnvConfigured()) {
      return {
        data: null,
        ok: false,
        error:
          "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then restart the dev server.",
      };
    }
    const raw = await fetchBundle();
    if (raw.errors?.length) {
      const schemaErr = raw.errors.find((msg) => isFinanceSchemaError({ message: msg }));
      if (schemaErr) {
        return { data: null, ok: false, error: financeErrorMsg({ message: schemaErr }, "Load Site Ledger") };
      }
      return {
        data: null,
        ok: false,
        error: financeErrorMsg({ message: raw.errors[0] }, "Load Site Ledger"),
      };
    }
    const parentById = Object.fromEntries(raw.parents.map((p) => [p.id, p]));
    const childById = Object.fromEntries(raw.children.map((c) => [c.id, c]));
    const revById = Object.fromEntries(raw.revenueHeads.map((r) => [r.id, r.code]));

    const usedParentIds = new Set((raw.structure || []).map((r) => r.parent_head_id));
    const usedChildIds = new Set([
      ...(raw.structure || []).map((r) => r.child_head_id),
      ...(raw.spreads || []).map((r) => r.child_head_id),
    ]);
    const parents = buildParents(raw.parents, defaultParents, usedParentIds);
    const library = buildLibrary(raw.children, parentById, defaultLibrary, usedChildIds);
    const sites = buildSites(raw, parentById, childById);
    const records = buildRecords(raw, childById, revById);

    cachedRevIdByCode = Object.fromEntries((raw.revenueHeads || []).map((r) => [r.code, r.id]));
    cachedHeadMaps = {
      parentIdByCode: Object.fromEntries((raw.parents || []).map((p) => [p.code, p.id])),
      childIdByCode: Object.fromEntries((raw.children || []).map((c) => [c.code, c.id])),
    };
    siteUuidByCode.clear();
    (raw.sites || []).forEach((s) => siteUuidByCode.set(s.code, s.id));
    lastSyncedPeriodFingerprint.clear();

    return {
      data: { sites, records, library, parents },
      ok: true,
      errors: raw.errors,
    };
  } catch (e) {
    return { data: null, ok: false, error: e?.message || "Load failed" };
  }
}

async function upsertRevenueHeads() {
  for (const item of REVENUE_ITEMS) {
    await t("revenue_heads").upsert(
      { code: item.key, label: item.label, sign: item.sign, sort_order: 0, is_active: true },
      { onConflict: "code" },
    );
  }
  const { data } = await t("revenue_heads").select("id, code");
  return Object.fromEntries((data || []).map((r) => [r.code, r.id]));
}

/**
 * Upsert the given parent heads (create / update only — never deletes).
 * Returns code → id for every parent in the database, including ones this tab never loaded.
 */
async function syncParents(parents, { sortIndexByKey = null } = {}) {
  invalidatePersistCaches();
  const existing = (await t("expense_parent_heads").select("id, code")).data || [];
  const out = Object.fromEntries(existing.map((row) => [row.code, row.id]));

  for (let i = 0; i < parents.length; i++) {
    const p = parents[i];
    const { data, error } = await t("expense_parent_heads")
      .upsert(
        {
          code: p.key,
          label: p.label,
          color: p.color || TOKENS.accent,
          sort_order: sortIndexByKey?.[p.key] ?? i,
          is_custom: !!p.custom,
          is_active: true,
        },
        { onConflict: "code" },
      )
      .select("id, code")
      .single();
    if (error) throw error;
    out[p.key] = data.id;
  }
  return out;
}

/**
 * Upsert the given child heads (create / update only — never deletes).
 * Returns code → id for every child head in the database.
 */
async function syncLibrary(library, parentIdByCode, { sortIndexByKey = null } = {}) {
  const existing = (await t("expense_child_heads").select("id, code")).data || [];
  const out = Object.fromEntries(existing.map((row) => [row.code, row.id]));
  const missingParents = [];

  for (let i = 0; i < library.length; i++) {
    const c = library[i];
    const parentId = resolveParentId(c.parent, parentIdByCode);
    if (!parentId) {
      missingParents.push(`${c.key} (parent: ${migrateParentKey(c.parent) || c.parent || "?"})`);
      continue;
    }
    const { data, error } = await t("expense_child_heads")
      .upsert(
        {
          code: c.key,
          label: c.label,
          parent_head_id: parentId,
          sort_order: sortIndexByKey?.[c.key] ?? i,
          is_custom: !!c.custom,
          is_active: true,
        },
        { onConflict: "code" },
      )
      .select("id, code")
      .single();
    if (error) throw error;
    out[c.key] = data.id;
  }

  if (missingParents.length) {
    throw new Error(`Cost lines not synced to database: ${missingParents.join(", ")}`);
  }
  cachedHeadMaps = { parentIdByCode, childIdByCode: out };
  return out;
}

async function loadHeadIdMaps() {
  const [parentsRes, childRes] = await Promise.all([
    t("expense_parent_heads").select("id, code"),
    t("expense_child_heads").select("id, code"),
  ]);
  if (parentsRes.error) throw parentsRes.error;
  if (childRes.error) throw childRes.error;
  return {
    parentIdByCode: Object.fromEntries((parentsRes.data || []).map((r) => [r.code, r.id])),
    childIdByCode: Object.fromEntries((childRes.data || []).map((r) => [r.code, r.id])),
  };
}

async function syncSiteStructureBatch(siteId, structure, parentIdByCode, childIdByCode) {
  const deduped = dedupeSiteStructure(structure).map((g) => ({
    ...g,
    parent: migrateParentKey(g.parent),
  }));
  const rows = [];
  const missingKeys = [];
  let sort = 0;
  const insertedChildIds = new Set();
  for (const grp of deduped) {
    const parentId = resolveParentId(grp.parent, parentIdByCode);
    if (!parentId) {
      missingKeys.push(...grp.children.map((k) => `parent:${grp.parent}/${k}`));
      continue;
    }
    for (const childKey of grp.children) {
      const childId = childIdByCode[childKey];
      if (!childId) {
        missingKeys.push(childKey);
        continue;
      }
      if (insertedChildIds.has(childId)) continue;
      insertedChildIds.add(childId);
      rows.push({
        parent_head_id: parentId,
        child_head_id: childId,
        sort_order: sort++,
      });
    }
  }
  const assignedCount = deduped.reduce((n, g) => n + g.children.length, 0);
  if (missingKeys.length) {
    throw new Error(`Cost lines not synced to database: ${missingKeys.join(", ")}`);
  }
  if (assignedCount > 0 && rows.length === 0) {
    throw new Error("Structure save failed: assigned cost lines could not be written.");
  }

  const { data: replacedCount, error: rpcErr } = await financeRpc("replace_site_structure", {
    p_site_id: siteId,
    p_rows: rows,
  });
  if (rpcErr) throw rpcErr;
  if (Number(replacedCount) !== rows.length) {
    throw new Error(
      `Structure save failed: expected ${rows.length} rows after replace, got ${replacedCount}.`,
    );
  }
}

async function getSiteUuidByCode(siteCode) {
  const { data, error } = await t("sites").select("id").eq("code", siteCode).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

function siteRowColumns(site, index) {
  return {
    code: site.id,
    name: site.name,
    service_type: site.service || null,
    work_order_no: site.wo || null,
    contract_start_period: site.contractStart || null,
    contract_end_period: site.contractEnd || null,
    contract_start: site.contractStart ? `${site.contractStart}-01` : null,
    contract_end: site.contractEnd ? `${site.contractEnd}-01` : null,
    status: site.status || "active",
    remarks: serializeSiteMeta(site),
    sort_order: index,
  };
}

async function upsertSiteRow(site, index) {
  const payload = siteRowColumns(site, index);
  const existingId = await getSiteUuidByCode(site.id);
  if (existingId) {
    const { error } = await t("sites").update(payload).eq("id", existingId);
    if (error) throw error;
    siteUuidByCode.set(site.id, existingId);
    return existingId;
  }
  const { data: siteRow, error } = await t("sites")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  siteUuidByCode.set(site.id, siteRow.id);
  return siteRow.id;
}

async function syncSiteSpreads(siteId, spreads, childIdByCode) {
  const existingSpreads = (await t("cost_allocations").select("id, external_id").eq("site_id", siteId)).data || [];
  const keepSpreads = new Set((spreads || []).map((s) => s.id));
  for (const sp of existingSpreads) {
    if (!keepSpreads.has(sp.external_id || sp.id)) {
      await t("cost_allocations").delete().eq("id", sp.id);
    }
  }
  for (const sp of spreads || []) {
    if (!sp?.id || !childIdByCode[sp.head]) continue;
    await upsertOneSpread(siteId, sp, childIdByCode);
  }
}

/** Create / update one cost spread (matched by its external id). */
async function upsertOneSpread(siteId, sp, childIdByCode) {
  const childId = childIdByCode[sp.head];
  if (!sp?.id) return;
  if (!childId) throw new Error(`Cost spread "${sp.head}" has no saved cost line — check Site Setup.`);
  const payload = {
    site_id: siteId,
    child_head_id: childId,
    total_amount: Number(sp.total),
    start_period: sp.start,
    months: Number(sp.months),
    spread_mode: sp.mode || "fixed",
    note: sp.note || null,
    external_id: sp.id,
  };
  let { data: existing } = await t("cost_allocations").select("id").eq("site_id", siteId).eq("external_id", sp.id).maybeSingle();
  if (!existing?.id && /^[0-9a-f-]{36}$/i.test(String(sp.id))) {
    // Legacy rows without external_id are keyed by their own id in the browser.
    ({ data: existing } = await t("cost_allocations").select("id").eq("site_id", siteId).eq("id", sp.id).maybeSingle());
  }
  if (existing?.id) {
    const { error } = await t("cost_allocations").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await t("cost_allocations").insert(payload);
    if (error) throw error;
  }
}

/** Create / update ONE budget version and replace its lines. Returns the version id (or null). */
async function syncOneBudgetVersion(siteId, site, est, childIdByCode, revIdByCode) {
  if (!est.id) return null;
  const effectiveFrom = est.effectiveFrom || site.contractStart || null;
  if (!effectiveFrom) return null;

  const bvPayload = {
    site_id: siteId,
    effective_from: effectiveFrom,
    note: est.note || null,
    status: "active",
    external_id: est.id,
  };

  let existingBv = null;
  const { data: byExternal } = await t("budget_versions").select("id").eq("external_id", est.id).maybeSingle();
  if (byExternal?.id) existingBv = byExternal;
  if (!existingBv?.id && /^[0-9a-f-]{36}$/i.test(String(est.id))) {
    const { data: byUuid } = await t("budget_versions").select("id").eq("id", est.id).maybeSingle();
    if (byUuid?.id) existingBv = byUuid;
  }
  if (!existingBv?.id) {
    const { data: byEffective } = await t("budget_versions")
      .select("id")
      .eq("site_id", siteId)
      .eq("effective_from", effectiveFrom)
      .maybeSingle();
    if (byEffective?.id) existingBv = byEffective;
  }

  const revenueRows = [];
  const expenseRows = [];
  const skippedRevenue = [];
  const skippedExpense = [];

  for (const [code, rawAmount] of Object.entries(est.revenue || {})) {
    const amount = parseBudgetAmount(rawAmount);
    if (amount == null || amount === 0) continue;
    const rhId = revIdByCode[code];
    if (!rhId) {
      skippedRevenue.push(code);
      continue;
    }
    revenueRows.push({
      revenue_head_id: rhId,
      amount,
    });
  }
  for (const [code, rawAmount] of Object.entries(est.expenses || {})) {
    const amount = parseBudgetAmount(rawAmount);
    if (amount == null || amount === 0) continue;
    const chId = childIdByCode[code];
    if (!chId) {
      skippedExpense.push(code);
      continue;
    }
    expenseRows.push({
      child_head_id: chId,
      amount,
    });
  }

  if (skippedRevenue.length || skippedExpense.length) {
    const parts = [];
    if (skippedRevenue.length) parts.push(`revenue: ${skippedRevenue.join(", ")}`);
    if (skippedExpense.length) parts.push(`expenses: ${skippedExpense.join(", ")}`);
    throw new Error(
      `Some contract budget amounts could not be saved (${parts.join("; ")}). Check cost-line setup for this site, then try again.`,
    );
  }

  let bvId = existingBv?.id;
  if (bvId) {
    const { error: updErr } = await t("budget_versions").update(bvPayload).eq("id", bvId);
    if (updErr) throw updErr;
  } else {
    const { data: inserted, error: insErr } = await t("budget_versions").insert(bvPayload).select("id").single();
    if (insErr) throw insErr;
    bvId = inserted.id;
  }

  const expectedBudgetLines = revenueRows.length + expenseRows.length;
  const { data: replacedCount, error: rpcErr } = await financeRpc("replace_budget_lines", {
    p_budget_version_id: bvId,
    p_revenue_rows: revenueRows,
    p_expense_rows: expenseRows,
  });
  if (rpcErr) throw rpcErr;
  if (Number(replacedCount) !== expectedBudgetLines) {
    throw new Error(
      `Budget save failed: expected ${expectedBudgetLines} lines after replace, got ${replacedCount}.`,
    );
  }
  return bvId;
}

async function syncSiteBudgets(siteId, site, childIdByCode, revIdByCode) {
  const existingBudgets = (await t("budget_versions").select("id, external_id, effective_from").eq("site_id", siteId)).data || [];
  const keptBudgetVersionIds = new Set();

  for (const est of site.estimates || []) {
    const bvId = await syncOneBudgetVersion(siteId, site, est, childIdByCode, revIdByCode);
    if (bvId) keptBudgetVersionIds.add(bvId);
  }

  for (const bv of existingBudgets) {
    if (!keptBudgetVersionIds.has(bv.id)) {
      await t("budget_versions").delete().eq("id", bv.id);
    }
  }
}

async function syncSite(site, parentIdByCode, childIdByCode, revIdByCode, index) {
  const siteId = await upsertSiteRow(site, index);
  const { parentKeys, childKeys } = collectStructureMapKeys(site.structure);
  const spreadHeads = (site.spreads || []).map((s) => s.head).filter(Boolean);
  const budgetChildKeys = [];
  const budgetRevKeys = [];
  for (const est of site.estimates || []) {
    for (const [code, rawAmount] of Object.entries(est.expenses || {})) {
      const amount = parseBudgetAmount(rawAmount);
      if (amount != null && amount !== 0) budgetChildKeys.push(code);
    }
    for (const [code, rawAmount] of Object.entries(est.revenue || {})) {
      const amount = parseBudgetAmount(rawAmount);
      if (amount != null && amount !== 0) budgetRevKeys.push(code);
    }
  }
  const missing = missingIdMapKeys(
    {
      parentKeys,
      childKeys: [...childKeys, ...spreadHeads, ...budgetChildKeys],
      revKeys: budgetRevKeys,
    },
    parentIdByCode,
    childIdByCode,
    revIdByCode,
  );
  if (missing.length) {
    throw new Error(`Cost lines not synced to database: ${missing.join(", ")}`);
  }
  await syncSiteStructureBatch(siteId, site.structure, parentIdByCode, childIdByCode);
  await syncSiteSpreads(siteId, site.spreads, childIdByCode);
  await syncSiteBudgets(siteId, site, childIdByCode, revIdByCode);
  return siteId;
}

/** Child head codes assigned to a site structure (Site Setup → Enter Figures expenses). */
export function assignedExpenseHeadKeys(site) {
  const seen = new Set();
  const keys = [];
  for (const grp of dedupeSiteStructure(site?.structure || [])) {
    for (const ck of grp.children || []) {
      if (!seen.has(ck)) {
        seen.add(ck);
        keys.push(ck);
      }
    }
  }
  return keys;
}

const PERIOD_META_KEYS = new Set([
  "reimbursements",
  "reimbursementType",
  "reimbursementOtherLabel",
  "creditNoteRemark",
  "_audit",
  "_revision",
  "_requestId",
]);

/** Coerce entered amounts (number or numeric string) without wiping valid values to 0. */
export function coercePeriodAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseBudgetAmount(value);
}

/** Ensure every assigned expense head is present on the record (empty → 0). */
export function preparePeriodRecordForSave(rec, assignedExpenseKeys = []) {
  const out = { ...(rec || {}) };
  const assigned = new Set(assignedExpenseKeys || []);

  for (const key of assigned) {
    const n = coercePeriodAmount(out[key]);
    out[key] = n == null ? 0 : n;
  }

  // Coerce any leftover string amounts (revenue / legacy) so sync never skips them as non-numbers.
  for (const [k, v] of Object.entries(out)) {
    if (PERIOD_META_KEYS.has(k) || assigned.has(k)) continue;
    if (typeof v === "number") continue;
    const n = coercePeriodAmount(v);
    if (n != null) out[k] = n;
  }
  return out;
}

/** Merge a partial period patch into a full record (coalesces rapid saves). */
export function mergePeriodEntry(base, patch, expenseHeadKeys = null) {
  const merged = { ...(base || {}) };
  if (!patch || typeof patch !== "object") return merged;
  const expenseSet = expenseHeadKeys?.length ? new Set(expenseHeadKeys) : null;

  for (const [k, v] of Object.entries(patch)) {
    if (k === "reimbursements") {
      if (Array.isArray(v) && v.length) {
        merged.reimbursements = v;
      } else {
        delete merged.reimbursements;
        delete merged.reimbursementType;
        delete merged.reimbursementOtherLabel;
        delete merged.esicBill;
      }
      continue;
    }
    if (k === "reimbursementType" || k === "reimbursementOtherLabel") continue;
    if (k === "creditNoteRemark") {
      const remark = v != null ? String(v).trim() : "";
      if (remark) merged.creditNoteRemark = remark;
      else delete merged.creditNoteRemark;
      continue;
    }
    if (k === "esicBill") {
      const n = coercePeriodAmount(v);
      if (n) merged.esicBill = n;
      else delete merged.esicBill;
      continue;
    }
    if (k === "_audit") {
      if (v && typeof v === "object" && v.updatedAt) merged._audit = v;
      continue;
    }
    if (k === "_revision") {
      if (v != null && v !== "") merged._revision = Number(v) || 0;
      continue;
    }
    if (k === "_requestId") {
      if (v) merged._requestId = String(v);
      continue;
    }

    const asNumber = typeof v === "number" || typeof v === "string" ? coercePeriodAmount(v) : null;
    if (asNumber != null) {
      if (expenseSet?.has(k)) merged[k] = asNumber || 0;
      else if (asNumber) merged[k] = asNumber;
      else delete merged[k];
      continue;
    }
    if (expenseSet?.has(k) && (v == null || v === "")) {
      merged[k] = 0;
      continue;
    }
    if (v != null && v !== "") merged[k] = v;
    else delete merged[k];
  }
  return merged;
}

/** User-facing message for Enter / Edit Figures save failures (not schema-setup by default). */
export function formatPeriodFigureSaveError(error, context = "Figure save") {
  const raw = error?.message || String(error || "");
  const code = error?.code;

  // Avoid double-wrapping when callers rethrow an already-formatted Error.
  if (/^(Figure save|Reimbursement save) failed:/i.test(raw)) {
    return raw;
  }

  if (error instanceof FinanceConflictError || code === FINANCE_ERROR_CODES.REVISION_CONFLICT) {
    return `${context} failed: this period was updated elsewhere (revision conflict). Your draft is kept — review and save again.`;
  }
  if (code === FINANCE_ERROR_CODES.PERMISSION_DENIED) {
    return `${context} failed: you do not have permission to edit this site's figures. Ask a Finance admin to grant access.`;
  }
  if (code === FINANCE_ERROR_CODES.DEPENDENCY_VIOLATION) {
    return `${context} failed: ${raw || "a dependency check blocked this change."}`;
  }

  if (isFinanceSchemaError(error) || isFinanceSchemaError({ message: raw })) {
    return financeErrorMsg(error || { message: raw }, context);
  }
  if (/row-level security|RLS|policy|42501|permission denied/i.test(raw)) {
    return `${context} failed: you do not have permission to edit this site's figures. Ask a Finance admin to grant access.`;
  }
  if (/save_period_entry_atomic|apply_site_structure_diff|PGRST202/i.test(raw)) {
    return `${context} failed: concurrency RPC is missing. Apply migration 20261127140000_finance_period_concurrency_atomic.sql (or disable atomic concurrency flag).`;
  }
  if (/Expense cost lines not (in database|saved)/i.test(raw) || /sync Site Setup first/i.test(raw)) {
    return `${context} failed: expense cost lines are missing in the database. Open Site Setup, save the structure, then retry.`;
  }
  if (/is not saved yet|retry in a moment|Site ".*" not found/i.test(raw)) {
    return `${context} failed: this site is not saved yet. Save Site Setup first, then enter figures again.`;
  }
  if (/replace_period_entry_lines|could not find the function|PGRST202|404/i.test(raw)) {
    return `${context} failed: figure-save RPC is missing or outdated. Apply migration 20260807140000_finance_atomic_replace_lines.sql.`;
  }
  if (/Failed to fetch|NetworkError|network|timeout|ECONN|offline/i.test(raw)) {
    return `${context} failed: network interrupted. Check your connection and click Save to retry.`;
  }
  if (/Figure save failed: expected .* lines/i.test(raw)) {
    return `${context} failed: the database rejected the line write. Retry once; if it continues, save Site Setup and try again.`;
  }
  if (code === "23503" || /foreign key/i.test(raw)) {
    return `${context} failed: a revenue or expense head is missing. Save Site Setup, then retry.`;
  }
  return raw || `${context} failed — values were not written to the database.`;
}

function periodEntryNotesFromRecord(rec) {
  const meta = {};
  if (Array.isArray(rec?.reimbursements) && rec.reimbursements.length) {
    meta.reimbursements = rec.reimbursements;
  } else if (rec?.reimbursementType) {
    meta.reimbursementType = rec.reimbursementType;
  }
  const remark = rec?.creditNoteRemark != null ? String(rec.creditNoteRemark).trim() : "";
  if (remark) meta.creditNoteRemark = remark;
  if (rec?._audit?.updatedAt) meta.audit = rec._audit;
  return Object.keys(meta).length ? JSON.stringify(meta) : null;
}

async function syncOnePeriodRecord(
  siteUuid,
  periodKey,
  rec,
  childIdByCode,
  revIdByCode,
  assignedExpenseKeys = [],
  syncOpts = {},
) {
  const notes = periodEntryNotesFromRecord(rec);
  const revRows = [];
  const missingRevenue = [];
  const revenueCodes = new Set(REVENUE_ITEMS.map((r) => r.key));
  for (const [code, amount] of Object.entries(rec || {})) {
    if (
      code === "reimbursementType" ||
      code === "reimbursements" ||
      code === "reimbursementOtherLabel" ||
      code === "creditNoteRemark" ||
      code === "_audit" ||
      code === "_revision" ||
      code === "_requestId"
    ) {
      continue;
    }
    const n = coercePeriodAmount(amount);
    if (n == null || !n) continue;
    if (!revenueCodes.has(code)) continue;
    const revId = revIdByCode[code];
    if (revId) {
      revRows.push({
        revenue_head_id: revId,
        amount: n,
      });
    } else {
      missingRevenue.push(code);
    }
  }
  if (missingRevenue.length) {
    throw new Error(
      `Revenue lines not saved — unknown heads: ${missingRevenue.join(", ")}`,
    );
  }

  const expenseSet = new Set(assignedExpenseKeys);
  const missingHeads = [];
  const expRows = [];
  for (const code of assignedExpenseKeys) {
    const childId = childIdByCode[code];
    if (!childId) {
      missingHeads.push(code);
      continue;
    }
    const amount = coercePeriodAmount(rec?.[code]) ?? 0;
    expRows.push({
      child_head_id: childId,
      amount,
    });
  }

  if (missingHeads.length) {
    throw new Error(
      `Expense cost lines not saved — sync Site Setup first: ${missingHeads.join(", ")}`,
    );
  }

  // Legacy: expense amounts on heads not in current site structure (non-zero only)
  const missingLegacy = [];
  for (const [code, amount] of Object.entries(rec || {})) {
    if (
      expenseSet.has(code) ||
      revenueCodes.has(code) ||
      code === "reimbursementType" ||
      code === "reimbursements" ||
      code === "reimbursementOtherLabel" ||
      code === "creditNoteRemark" ||
      code === "_audit" ||
      code === "_revision" ||
      code === "_requestId"
    ) {
      continue;
    }
    const n = coercePeriodAmount(amount);
    if (n == null || !n) continue;
    const childId = childIdByCode[code];
    if (!childId) {
      missingLegacy.push(code);
      continue;
    }
    expRows.push({
      child_head_id: childId,
      amount: n,
    });
  }
  if (missingLegacy.length) {
    throw new Error(
      `Expense cost lines not saved — sync Site Setup first: ${missingLegacy.join(", ")}`,
    );
  }

  const fpKey = `${siteUuid}__${periodKey}`;
  const fullFp = periodLinesFingerprint(revRows, expRows, notes);
  const linesFp = periodLinesOnlyFingerprint(revRows, expRows);
  const prevSync = lastSyncedPeriodFingerprint.get(fpKey);
  if (prevSync && prevSync.fullFp === fullFp && prevSync.peId) {
    return {
      peId: prevSync.peId,
      revision: prevSync.revision != null ? Number(prevSync.revision) : (rec?._revision != null ? Number(rec._revision) : null),
      skippedIdentical: true,
    };
  }

  const useAtomic = syncOpts.useAtomic != null
    ? !!syncOpts.useAtomic
    : isAtomicConcurrencyEnabled();

  if (useAtomic) {
    const expectedRevision = syncOpts.expectedRevision != null
      ? Number(syncOpts.expectedRevision)
      : (rec?._revision != null ? Number(rec._revision) : 0);
    const requestId = syncOpts.requestId || newFinanceRequestId();
    const { data, error } = await financeRpc("save_period_entry_atomic", {
      p_site_id: siteUuid,
      p_period_key: periodKey,
      p_notes: notes,
      p_status: "submitted",
      p_expected_revision: Number.isFinite(expectedRevision) ? expectedRevision : 0,
      p_request_id: requestId,
      p_revenue_rows: revRows,
      p_expense_rows: expRows,
    });
    if (error) {
      throw Object.assign(new Error(formatPeriodFigureSaveError(error, "Figure save")), {
        code: error.code,
        cause: error,
      });
    }
    const parsed = parseFinanceSaveResult(data);
    if (!parsed.ok) {
      if (parsed.code === FINANCE_ERROR_CODES.REVISION_CONFLICT) {
        throw new FinanceConflictError(parsed);
      }
      throw Object.assign(new Error(formatPeriodFigureSaveError({
        message: parsed.message,
        code: parsed.code,
      }, "Figure save")), {
        code: parsed.code,
        financeResult: parsed.raw,
      });
    }
    const peId = parsed.raw?.period_entry_id;
    const revision = parsed.currentRevision != null
      ? Number(parsed.currentRevision)
      : null;
    lastSyncedPeriodFingerprint.set(fpKey, { peId, fullFp, linesFp, revision });
    return { peId, revision, idempotentReplay: !!parsed.raw?.idempotent_replay };
  }

  // Legacy path (feature flag OFF): upsert then replace_period_entry_lines (two round-trips).
  const { data: pe, error } = await t("period_entries")
    .upsert(
      {
        site_id: siteUuid,
        period_key: periodKey,
        status: "submitted",
        notes,
      },
      { onConflict: "site_id,period_key" },
    )
    .select("id")
    .single();
  if (error) {
    throw Object.assign(new Error(formatPeriodFigureSaveError(error, "Figure save")), {
      code: error.code,
      cause: error,
    });
  }

  // Notes-only change: period_entries upsert already applied; skip identical line replace.
  if (prevSync && prevSync.linesFp === linesFp && prevSync.peId === pe.id) {
    lastSyncedPeriodFingerprint.set(fpKey, { peId: pe.id, fullFp, linesFp });
    return {
      peId: pe.id,
      revision: rec?._revision != null ? Number(rec._revision) : null,
    };
  }

  const expectedLines = revRows.length + expRows.length;
  const { data: replacedCount, error: rpcErr } = await financeRpc("replace_period_entry_lines", {
    p_period_entry_id: pe.id,
    p_revenue_rows: revRows,
    p_expense_rows: expRows,
  });
  if (rpcErr) {
    throw Object.assign(new Error(formatPeriodFigureSaveError(rpcErr, "Figure save")), {
      code: rpcErr.code,
      cause: rpcErr,
    });
  }
  if (Number(replacedCount) !== expectedLines) {
    throw new Error(
      `Figure save failed: expected ${expectedLines} lines after replace, got ${replacedCount}.`,
    );
  }

  lastSyncedPeriodFingerprint.set(fpKey, { peId: pe.id, fullFp, linesFp });
  return {
    peId: pe.id,
    revision: rec?._revision != null ? Number(rec._revision) : null,
  };
}

/** Latest pending payload per site/month — coalesces rapid autosaves into one DB write. */
const pendingPeriodRecords = new Map();
const pendingPeriodContexts = new Map();

/** Ensure expense child heads exist before writing expense_entry_lines. */
async function ensureHeadMapsForPeriodSave(siteCode, rec, context = {}) {
  const sites = context.sites || [];
  const library = context.library || [];
  const parents = context.parents || [];
  const site = sites.find((s) => s.id === siteCode);
  const assignedExpenseKeys = site ? assignedExpenseHeadKeys(site) : [];
  const { parentKeys, childKeys: structureChildKeys } = collectStructureMapKeys(site?.structure);

  const revKeys = [];
  const amountChildKeys = new Set(assignedExpenseKeys);
  for (const [code, amount] of Object.entries(rec || {})) {
    if (
      code === "reimbursementType" ||
      code === "reimbursements" ||
      code === "reimbursementOtherLabel" ||
      code === "creditNoteRemark" ||
      code === "_audit"
    ) {
      continue;
    }
    const n = coercePeriodAmount(amount);
    if (n == null || !n) continue;
    // Candidate revenue codes — ensureRev map covers REVENUE_ITEMS after upsert.
    if (REVENUE_ITEMS.some((r) => r.key === code)) revKeys.push(code);
    else amountChildKeys.add(code);
  }

  const { childIdByCode, revIdByCode } = await ensureIdMapsForWrite({
    parentKeys,
    childKeys: [...new Set([...structureChildKeys, ...amountChildKeys])],
    revKeys: revKeys.length ? REVENUE_ITEMS.map((r) => r.key) : ["saleRevenue", "esicBill", "creditNote"],
    parents: parents.length ? parents : null,
    library: library.length ? library : null,
    sites,
  });

  const stillMissing = assignedExpenseKeys.filter((k) => !childIdByCode[k]);
  if (stillMissing.length) {
    throw new Error(
      `Expense cost lines not in database — save Site Setup first: ${stillMissing.join(", ")}`,
    );
  }

  return { revIdByCode, childIdByCode, assignedExpenseKeys };
}

/** Ensure site row exists in DB before writing period figures (new sites). */
async function ensureSiteUuid(siteCode) {
  const cached = siteUuidByCode.get(siteCode);
  if (cached) return cached;

  const existing = await getSiteUuidByCode(siteCode);
  if (existing) {
    siteUuidByCode.set(siteCode, existing);
    return existing;
  }

  // A figure save must never create or rewrite a site (structure, spreads, budgets) from this
  // tab's copy — that is a Site Setup action with its own explicit Save.
  throw new Error(
    `Site "${siteCode}" is not saved yet — save Site Setup first, then enter figures again`,
  );
}

/** Fast path — persist one site/month entry (revenue, reimbursements, expenses) without full ledger sync. */
async function executePeriodFlush(compoundKey) {
  const latest = pendingPeriodRecords.get(compoundKey);
  const ctx = pendingPeriodContexts.get(compoundKey) || {};
  pendingPeriodRecords.delete(compoundKey);
  pendingPeriodContexts.delete(compoundKey);
  if (!latest) return true;

  const sep = compoundKey.indexOf("__");
  const siteCode = sep >= 0 ? compoundKey.slice(0, sep) : compoundKey;
  const periodKey = sep >= 0 ? compoundKey.slice(sep + 2) : "";
  try {
    const siteUuid = await ensureSiteUuid(siteCode);
    const ctxSite = ctx.sites?.find((s) => s.id === siteCode);
    const assignedExpenseKeys = ctxSite ? assignedExpenseHeadKeys(ctxSite) : [];
    const prepared = preparePeriodRecordForSave(latest, assignedExpenseKeys);
    const { childIdByCode, revIdByCode } = await ensureHeadMapsForPeriodSave(siteCode, prepared, ctx);
    const syncResult = await syncOnePeriodRecord(
      siteUuid,
      periodKey,
      prepared,
      childIdByCode,
      revIdByCode,
      assignedExpenseKeys,
      {
        expectedRevision: prepared._revision ?? ctx.expectedRevision ?? 0,
        requestId: prepared._requestId || ctx.requestId || null,
        useAtomic: ctx.useAtomic,
      },
    );
    invalidateFinanceCache({ notify: false });
    return syncResult && typeof syncResult === "object"
      ? syncResult
      : { peId: syncResult || null, revision: null };
  } catch (err) {
    // Re-queue so retry / Save figures can flush again. Prefer any newer pending patch.
    const keys = assignedExpenseKeysFromContext(ctx, siteCode);
    const newer = pendingPeriodRecords.get(compoundKey);
    pendingPeriodRecords.set(
      compoundKey,
      newer ? mergePeriodEntry(latest, newer, keys.length ? keys : null) : latest,
    );
    if (!pendingPeriodContexts.has(compoundKey)
      && (ctx.sites?.length || ctx.library?.length || ctx.parents?.length)) {
      pendingPeriodContexts.set(compoundKey, ctx);
    }
    if (err instanceof FinanceConflictError) throw err;
    throw Object.assign(new Error(formatPeriodFigureSaveError(err, "Figure save")), {
      code: err?.code,
      cause: err,
      financeResult: err?.financeResult,
    });
  }
}

function assignedExpenseKeysFromContext(ctx, siteCode) {
  const site = ctx?.sites?.find((s) => s.id === siteCode);
  return site ? assignedExpenseHeadKeys(site) : [];
}

/** Who asked for each pending figure save (typed by the user vs flushed by the app). */
const pendingPeriodAudit = new Map();

function takePeriodAudit(compoundKey, fallback) {
  const audit = pendingPeriodAudit.get(compoundKey) || fallback;
  pendingPeriodAudit.delete(compoundKey);
  return audit;
}

function runPeriodFlush(compoundKey, audit, bucket = null) {
  const run = enqueuePeriodSave(() => executePeriodFlush(compoundKey), audit);
  // Settle the debounced promise too, so callers awaiting it never hang.
  if (bucket) run.then(bucket.resolve, bucket.reject);
  return run;
}

function schedulePeriodFlush(compoundKey) {
  let bucket = periodFlushBuckets.get(compoundKey);
  if (!bucket) {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    bucket = { timer: null, resolve, reject, promise };
    periodFlushBuckets.set(compoundKey, bucket);
  }

  if (bucket.timer) clearTimeout(bucket.timer);
  bucket.timer = setTimeout(() => {
    periodFlushBuckets.delete(compoundKey);
    runPeriodFlush(
      compoundKey,
      takePeriodAudit(compoundKey, { trigger: "user", action: "figure_autosave" }),
      bucket,
    ).catch(() => {});
  }, PERIOD_FLUSH_MS);

  return bucket.promise;
}

/**
 * Flush a pending figure save now (site switch, tab hidden / closed).
 * Default audit is "automatic": the app sends it, not a click on Save.
 */
export function flushPeriodRecordNow(siteCode, periodKey, audit = { trigger: "automatic", action: "figure_flush" }) {
  const compoundKey = `${siteCode}__${periodKey}`;
  const bucket = periodFlushBuckets.get(compoundKey);
  if (bucket?.timer) {
    clearTimeout(bucket.timer);
    periodFlushBuckets.delete(compoundKey);
    pendingPeriodAudit.delete(compoundKey);
    return runPeriodFlush(compoundKey, audit, bucket);
  }
  if (!pendingPeriodRecords.has(compoundKey)) return Promise.resolve(true);
  pendingPeriodAudit.delete(compoundKey);
  return runPeriodFlush(compoundKey, audit);
}

/** Flush only in-flight / pending period saves (never rewrite all records). */
export function flushAllPendingPeriodRecords(audit = { trigger: "automatic", action: "figure_flush_on_leave" }) {
  const keys = new Set([
    ...pendingPeriodRecords.keys(),
    ...periodFlushBuckets.keys(),
  ]);
  if (!keys.size) return Promise.resolve([]);
  return Promise.all(
    [...keys].map((compoundKey) => {
      const sep = compoundKey.indexOf("__");
      const siteCode = compoundKey.slice(0, sep);
      const periodKey = compoundKey.slice(sep + 2);
      return flushPeriodRecordNow(siteCode, periodKey, audit).catch(() => false);
    }),
  );
}

/**
 * Queue a figure save for one site/month.
 * opts.immediate — write now (Save button); otherwise debounced autosave while typing.
 * opts.audit — { trigger: "user" | "automatic", action } for the activity log.
 */
export async function savePeriodRecord(siteCode, periodKey, rec, context = {}, opts = {}) {
  const compoundKey = `${siteCode}__${periodKey}`;
  const site = context.sites?.find((s) => s.id === siteCode);
  const expenseHeadKeys = site ? assignedExpenseHeadKeys(site) : [];
  const prev = pendingPeriodRecords.get(compoundKey);
  pendingPeriodRecords.set(
    compoundKey,
    mergePeriodEntry(prev || {}, rec, expenseHeadKeys.length ? expenseHeadKeys : null),
  );
  if (context.sites?.length || context.library?.length || context.parents?.length
      || opts.expectedRevision != null || opts.requestId || opts.useAtomic != null) {
    pendingPeriodContexts.set(compoundKey, {
      ...context,
      expectedRevision: opts.expectedRevision,
      requestId: opts.requestId,
      useAtomic: opts.useAtomic,
    });
  }
  const audit = opts.audit || {
    trigger: "user",
    action: opts.immediate ? "figure_save" : "figure_autosave",
  };

  if (opts.immediate) {
    const bucket = periodFlushBuckets.get(compoundKey);
    const waiting = bucket?.timer ? bucket : null;
    if (waiting) {
      clearTimeout(waiting.timer);
      periodFlushBuckets.delete(compoundKey);
    }
    pendingPeriodAudit.delete(compoundKey);
    return runPeriodFlush(compoundKey, audit, waiting);
  }

  pendingPeriodAudit.set(compoundKey, audit);
  return schedulePeriodFlush(compoundKey);
}

/** Include every site's custom heads so structure saves never drop or delete them. */
function libraryWithAllSiteCustoms(library, sites) {
  const merged = [...(library || [])];
  const keys = new Set(merged.map((h) => h.key));
  for (const site of sites || []) {
    for (const h of site?.customHeads || []) {
      if (!keys.has(h.key)) {
        merged.push({ ...h, custom: true, siteScoped: true });
        keys.add(h.key);
      }
    }
  }
  return merged;
}

/** Keep every assigned structure child + site customs in library before sync (prevents DB deletes). */
function libraryForSitesPersist(library, sites) {
  const merged = libraryWithAllSiteCustoms(library, sites).map((h) => ({
    ...h,
    parent: migrateParentKey(h.parent),
  }));
  const byKey = new Map(merged.map((h) => [h.key, h]));

  // Prefer the site structure parent when a head is assigned (fixes stale library.parent after renames).
  const parentByChild = {};
  for (const site of sites || []) {
    for (const grp of dedupeSiteStructure(site?.structure)) {
      const parent = migrateParentKey(grp.parent);
      for (const ck of grp.children || []) {
        parentByChild[ck] = parent;
      }
    }
    // Include estimate expense keys so budget sync never loses lines for unlisted heads.
    for (const est of site?.estimates || []) {
      for (const code of Object.keys(est?.expenses || {})) {
        if (!parentByChild[code]) parentByChild[code] = "adminMisc";
      }
    }
  }

  for (const [ck, parent] of Object.entries(parentByChild)) {
    const existing = byKey.get(ck);
    if (existing) {
      byKey.set(ck, { ...existing, parent });
    } else {
      const fromCustom = (sites || [])
        .flatMap((s) => s.customHeads || [])
        .find((h) => h.key === ck);
      byKey.set(
        ck,
        fromCustom
          ? { ...fromCustom, parent: migrateParentKey(fromCustom.parent) || parent, custom: true }
          : { key: ck, label: ck, parent, custom: true },
      );
    }
  }

  return [...byKey.values()];
}

/* ───────────────────────── Site Setup: explicit, diff-based save ───────────────────────── */

/** Site row columns that decide whether the site row needs an update (sort_order excluded). */
function siteMetaSignature(site) {
  const { sort_order: _sortOrder, ...cols } = siteRowColumns(site, 0);
  return stableStringify(cols);
}

function normalizeSetupState(state) {
  const sites = (state?.sites || []).map((s) => ({ ...s, structure: dedupeSiteStructure(s.structure) }));
  return {
    sites,
    parents: [...(state?.parents || [])],
    library: libraryForSitesPersist(state?.library || [], sites),
  };
}

/**
 * What a Site Setup save would change, relative to the copy loaded from the database.
 * Used by the Save confirmation and by saveSiteSetupChanges itself.
 */
export function computeSiteSetupDiff(baseline, current) {
  return diffSiteSetup(normalizeSetupState(baseline), normalizeSetupState(current), {
    normalizeParent: migrateParentKey,
    metaSignature: siteMetaSignature,
  });
}

function nonZeroKeys(obj) {
  return Object.entries(obj || {})
    .filter(([, raw]) => {
      const n = parseBudgetAmount(raw);
      return n != null && n !== 0;
    })
    .map(([k]) => k);
}

async function readRevIdByCode(requiredCodes = []) {
  const { data, error } = await t("revenue_heads").select("id, code");
  if (error) throw error;
  let map = Object.fromEntries((data || []).map((r) => [r.code, r.id]));
  if (requiredCodes.some((c) => !map[c])) {
    map = await upsertRevenueHeads();
  }
  cachedRevIdByCode = map;
  return map;
}

/** Is a child head still used anywhere (any site, any figure, budget or spread)? */
async function childHeadInUse(childId) {
  const checks = await Promise.all([
    t("site_expense_structure").select("id", { count: "exact", head: true }).eq("child_head_id", childId),
    t("expense_entry_lines").select("id", { count: "exact", head: true }).eq("child_head_id", childId),
    t("budget_expense_lines").select("id", { count: "exact", head: true }).eq("child_head_id", childId),
    t("cost_allocations").select("id", { count: "exact", head: true }).eq("child_head_id", childId),
  ]);
  for (const r of checks) {
    if (r.error) throw r.error;
    if ((r.count || 0) > 0) return true;
  }
  return false;
}

async function parentHeadInUse(parentId) {
  const checks = await Promise.all([
    t("expense_child_heads").select("id", { count: "exact", head: true }).eq("parent_head_id", parentId),
    t("site_expense_structure").select("id", { count: "exact", head: true }).eq("parent_head_id", parentId),
  ]);
  for (const r of checks) {
    if (r.error) throw r.error;
    if ((r.count || 0) > 0) return true;
  }
  return false;
}

async function deleteOrDeactivate(table, id) {
  const { error } = await t(table).delete().eq("id", id);
  if (!error) return "deleted";
  const code = String(error?.code || "");
  if (code === "23503" || /foreign key/i.test(String(error?.message || ""))) {
    const { error: updErr } = await t(table).update({ is_active: false }).eq("id", id);
    if (updErr) throw updErr;
    return "deactivated";
  }
  throw error;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Delete rows of a site-scoped table by browser id (external_id, or own id for legacy rows). */
async function deleteBySiteAndBrowserIds(table, siteUuid, ids) {
  if (!ids.length) return;
  const { error } = await t(table).delete().eq("site_id", siteUuid).in("external_id", ids);
  if (error) throw error;
  const uuidIds = ids.filter((id) => UUID_RE.test(String(id)));
  if (uuidIds.length) {
    const { error: e2 } = await t(table).delete().eq("site_id", siteUuid).in("id", uuidIds);
    if (e2) throw e2;
  }
}

async function saveSiteSetupChangesInner({ baseline, sites, library, parents }) {
  const current = { sites: sites || [], library: library || [], parents: parents || [] };
  const diff = computeSiteSetupDiff(baseline, current);
  const report = { diff, sitesSaved: [], headsKept: [], parentsKept: [], headsRemoved: [], parentsRemoved: [] };
  if (!diff.hasChanges) return report;

  const norm = normalizeSetupState(current);
  const curSites = norm.sites;
  const curLibByKey = new Map(norm.library.map((h) => [h.key, h]));
  const curParentByKey = new Map(norm.parents.map((p) => [p.key, p]));
  const parentSort = Object.fromEntries(norm.parents.map((p, i) => [p.key, i]));
  const libSort = Object.fromEntries(norm.library.map((h, i) => [h.key, i]));

  // ── 1. Validate and work out exactly which heads must exist — before any write ──
  invalidatePersistCaches();
  let { parentIdByCode, childIdByCode } = await loadHeadIdMaps();

  const plans = [];
  const neededChildKeys = new Set(diff.heads.upserts.map((h) => h.key));
  const neededParentKeys = new Set(diff.parents.upserts.map((p) => p.key));
  const neededRevCodes = new Set();
  for (const d of diff.sites) {
    const index = curSites.findIndex((s) => s.id === d.siteCode);
    const site = curSites[index];
    if (!site) continue;
    const structRows = [...d.structure.added, ...d.structure.moved, ...d.structure.reordered];
    for (const row of structRows) {
      if (!childIdByCode[row.child]) neededChildKeys.add(row.child);
      if (!resolveParentId(row.parent, parentIdByCode)) neededParentKeys.add(migrateParentKey(row.parent));
    }
    for (const sp of d.spreads.upserts) {
      if (sp.head && !childIdByCode[sp.head]) neededChildKeys.add(sp.head);
    }
    for (const est of d.budgets.upserts) {
      for (const k of nonZeroKeys(est.expenses)) if (!childIdByCode[k]) neededChildKeys.add(k);
      for (const k of nonZeroKeys(est.revenue)) neededRevCodes.add(k);
    }
    plans.push({ d, site, index: index >= 0 ? index : 0, structRows });
  }

  const unknownHeads = [...neededChildKeys].filter((k) => !curLibByKey.has(k));
  if (unknownHeads.length) {
    throw new Error(`Cost lines missing from the library: ${unknownHeads.join(", ")}. Reload Site Ledger and try again.`);
  }
  const childrenToWrite = [...neededChildKeys].map((k) => curLibByKey.get(k));
  for (const h of childrenToWrite) {
    const pk = migrateParentKey(h.parent);
    if (!resolveParentId(pk, parentIdByCode)) neededParentKeys.add(pk);
  }
  const unknownParents = [...neededParentKeys].filter((k) => !curParentByKey.has(k) && !resolveParentId(k, parentIdByCode));
  if (unknownParents.length) {
    throw new Error(`Parent heads missing: ${unknownParents.join(", ")}. Reload Site Ledger and try again.`);
  }
  const parentsToWrite = [...neededParentKeys].map((k) => curParentByKey.get(k)).filter(Boolean);

  // ── 2. Heads: create new ones / write real edits only ──
  if (parentsToWrite.length) {
    parentIdByCode = await syncParents(parentsToWrite, { sortIndexByKey: parentSort });
  }
  if (childrenToWrite.length) {
    childIdByCode = await syncLibrary(childrenToWrite, parentIdByCode, { sortIndexByKey: libSort });
  }
  cachedHeadMaps = { parentIdByCode, childIdByCode };
  const anyNewSite = plans.some((p) => p.d.isNew);
  const revIdByCode = await readRevIdByCode(
    anyNewSite ? REVENUE_ITEMS.map((r) => r.key) : [...neededRevCodes],
  );

  // ── 3. Sites: apply only this user's changes ──
  for (const { d, site, index, structRows } of plans) {
    let siteUuid = await getSiteUuidByCode(site.id);
    if (!siteUuid) {
      siteUuid = await syncSite(site, parentIdByCode, childIdByCode, revIdByCode, index);
      siteUuidByCode.set(site.id, siteUuid);
      report.sitesSaved.push(site.id);
      continue;
    }
    siteUuidByCode.set(site.id, siteUuid);

    if (d.metaChanged) {
      const { sort_order: _sortOrder, ...cols } = siteRowColumns(site, index);
      const { error } = await t("sites").update(cols).eq("id", siteUuid);
      if (error) throw error;
    }

    const removeIds = d.structure.removed.map((k) => childIdByCode[k]).filter(Boolean);
    const toStructRow = (row) => ({
      site_id: siteUuid,
      parent_head_id: resolveParentId(row.parent, parentIdByCode),
      child_head_id: childIdByCode[row.child],
      sort_order: row.sort,
    });
    const hasStructureMutation = removeIds.length > 0 || structRows.length > 0;

    if (hasStructureMutation && isAtomicConcurrencyEnabled()) {
      const expectedSetupRevision = Number(
        site.setupRevision ?? baseline?.sites?.find((s) => s.id === site.id)?.setupRevision ?? 1,
      );
      const upsertPayload = structRows.map((row) => {
        const r = toStructRow(row);
        return {
          parent_head_id: r.parent_head_id,
          child_head_id: r.child_head_id,
          sort_order: r.sort_order,
        };
      });
      if (upsertPayload.some((r) => !r.parent_head_id || !r.child_head_id)) {
        throw new Error("Structure save failed: some cost lines could not be matched in the database.");
      }
      const { data: structResult, error: structErr } = await financeRpc("apply_site_structure_diff", {
        p_site_id: siteUuid,
        p_expected_setup_revision: Number.isFinite(expectedSetupRevision) ? expectedSetupRevision : 1,
        p_remove_child_ids: removeIds,
        p_upsert_rows: upsertPayload,
        p_block_remove_with_history: true,
      });
      if (structErr) throw structErr;
      const parsed = parseFinanceSaveResult(structResult);
      if (!parsed.ok) {
        if (parsed.code === FINANCE_ERROR_CODES.REVISION_CONFLICT
            || parsed.code === FINANCE_ERROR_CODES.DEPENDENCY_VIOLATION) {
          throw new FinanceConflictError(parsed);
        }
        throw new Error(parsed.message || "Structure save failed");
      }
      site.setupRevision = parsed.raw?.setup_revision ?? (expectedSetupRevision + 1);
    } else {
      if (removeIds.length) {
        const { error } = await t("site_expense_structure").delete().eq("site_id", siteUuid).in("child_head_id", removeIds);
        if (error) throw error;
      }
      if (structRows.length) {
        const rows = structRows.map(toStructRow);
        if (rows.some((r) => !r.parent_head_id || !r.child_head_id)) {
          throw new Error("Structure save failed: some cost lines could not be matched in the database.");
        }
        // New components: insert (or adopt the row if someone added the same line meanwhile).
        const addedRows = d.structure.added.map(toStructRow);
        if (addedRows.length) {
          const { error } = await t("site_expense_structure").upsert(addedRows, { onConflict: "site_id,child_head_id" });
          if (error) throw error;
        }
        // Moved / reordered components: UPDATE only — a row another user removed meanwhile
        // stays removed instead of being re-created from this tab's copy.
        for (const row of [...d.structure.moved, ...d.structure.reordered].map(toStructRow)) {
          const { error } = await t("site_expense_structure")
            .update({ parent_head_id: row.parent_head_id, sort_order: row.sort_order })
            .eq("site_id", siteUuid)
            .eq("child_head_id", row.child_head_id);
          if (error) throw error;
        }
      }
    }

    await deleteBySiteAndBrowserIds("cost_allocations", siteUuid, d.spreads.removed);
    for (const sp of d.spreads.upserts) {
      await upsertOneSpread(siteUuid, sp, childIdByCode);
    }

    await deleteBySiteAndBrowserIds("budget_versions", siteUuid, d.budgets.removed);
    for (const est of d.budgets.upserts) {
      await syncOneBudgetVersion(siteUuid, site, est, childIdByCode, revIdByCode);
    }
    report.sitesSaved.push(site.id);
  }

  // ── 4. Library / parent removals: only when nothing anywhere still uses them ──
  for (const key of diff.heads.removed) {
    const id = childIdByCode[key];
    if (!id) continue;
    if (await childHeadInUse(id)) {
      report.headsKept.push(key);
      continue;
    }
    await deleteOrDeactivate("expense_child_heads", id);
    report.headsRemoved.push(key);
  }
  for (const key of diff.parents.removed) {
    const id = parentIdByCode[key];
    if (!id) continue;
    if (await parentHeadInUse(id)) {
      report.parentsKept.push(key);
      continue;
    }
    await deleteOrDeactivate("expense_parent_heads", id);
    report.parentsRemoved.push(key);
  }

  invalidatePersistCaches();
  invalidateFinanceCache({ notify: false });
  return report;
}

/**
 * Explicit Site Setup save (the user clicked Save / confirmed a dialog).
 * Writes only the difference between `baseline` (what this tab loaded from the database)
 * and the current state — never a full replace — so edits made by other users since this
 * tab loaded are left untouched.
 */
export async function saveSiteSetupChanges({ baseline, sites, library, parents, audit } = {}) {
  if (!baseline) {
    throw new Error("Site Setup has no loaded copy to compare against — reload Site Ledger, then save again.");
  }
  return enqueueSave(async () => {
    try {
      return await saveSiteSetupChangesInner({ baseline, sites, library, parents });
    } catch (e) {
      throw new Error(financeErrorMsg(e, "Save Site Setup"));
    }
  }, { trigger: "user", action: "site_setup_save", ...(audit || {}) });
}

/** Delete whole sites (explicit, confirmed action). Never touches any other site. */
export async function deleteLedgerSites(siteCodes, audit) {
  const codes = [...new Set((siteCodes || []).filter(Boolean))];
  if (!codes.length) throw new Error("No site selected to delete");
  return enqueueSave(async () => {
    try {
      for (const code of codes) {
        const existingId = await getSiteUuidByCode(code);
        if (!existingId) continue;
        invalidateSiteUuidCache(code);
        const { error } = await t("sites").delete().eq("id", existingId);
        if (error) throw error;
      }
      invalidateFinanceCache();
      return true;
    } catch (e) {
      throw new Error(financeErrorMsg(e, "Delete site"));
    }
  }, { trigger: "user", action: "site_delete", ...(audit || {}) });
}
