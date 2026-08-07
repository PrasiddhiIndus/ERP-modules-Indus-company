/**
 * Persists SiteLedger document model ↔ finance schema.
 * Document: { sites, records, library, parents } — same as pnl_dashboard.jsx
 */
import { supabase } from "../../../lib/supabase";
import { financeErrorMsg, invalidateFinanceCache, isFinanceSchemaError } from "../../../services/financeApi";
import { removeChildHeadRow, removeParentHeadRow } from "./financeHeadSync";
import { TOKENS } from "../../../theme/tokens";

const SCHEMA = "finance";
export const SITE_META_PREFIX = "@@siteMeta::";

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

function t(name) {
  return supabase.schema(SCHEMA).from(name);
}

function financeRpc(fn, args) {
  return supabase.schema(SCHEMA).rpc(fn, args);
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
    parentIdByCode = await syncParents(parents);
    childIdByCode = await syncLibrary(libraryForSitesPersist(library, sites || []), parentIdByCode);
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

/** Serialize master/structure writes so drag-and-drop saves cannot interleave. */
let saveChain = Promise.resolve();
function enqueueSave(task) {
  const run = saveChain.then(task);
  saveChain = run.catch(() => {});
  return run;
}

/** Figure saves use a separate queue so they are not blocked by site setup writes. */
let periodSaveChain = Promise.resolve();
function enqueuePeriodSave(task) {
  const run = periodSaveChain.then(task);
  periodSaveChain = run.catch(() => {});
  return run;
}

const PERIOD_FLUSH_MS = 60;
const periodFlushBuckets = new Map();

let cachedRevIdByCode = null;
let cachedHeadMaps = null;
const siteUuidByCode = new Map();

function invalidatePersistCaches() {
  cachedRevIdByCode = null;
  cachedHeadMaps = null;
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

async function fetchAll(tableName, order) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = t(tableName).select("*");
    if (order) {
      q = q.order(order[0], order[1]);
    }
    const { data, error } = await q.range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return rows;
}

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

function buildParents(rows, defaultParents) {
  const active = (rows || []).filter((p) => p.is_active !== false);
  if (!active.length) return defaultParents.map((p) => ({ ...p }));
  return active.map((p) => ({
    key: p.code,
    label: p.label,
    color: p.color || TOKENS.accent,
    custom: !!p.is_custom,
  }));
}

function buildLibrary(rows, parentById, defaultLibrary) {
  const active = (rows || []).filter((c) => c.is_active !== false);
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
  raw.budgets.forEach((bv) => {
    if (!budgetsBySite[bv.site_id]) budgetsBySite[bv.site_id] = [];
    const revenue = {};
    raw.budgetRev
      .filter((l) => l.budget_version_id === bv.id)
      .forEach((l) => {
        const code = revById[l.revenue_head_id];
        if (code) revenue[code] = Number(l.amount);
      });
    const expenses = {};
    raw.budgetExp
      .filter((l) => l.budget_version_id === bv.id)
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
    };
  });
}

function buildRecords(raw, childById, revById) {
  const records = {};
  const siteIdToCode = Object.fromEntries(raw.sites.map((s) => [s.id, s.code]));
  raw.periods.forEach((pe) => {
    const siteCode = siteIdToCode[pe.site_id];
    if (!siteCode) return;
    const key = `${siteCode}__${pe.period_key}`;
    records[key] = {};
    raw.revLines
      .filter((l) => l.period_entry_id === pe.id)
      .forEach((l) => {
        const code = revById[l.revenue_head_id];
        if (code) records[key][code] = Number(l.amount);
      });
    raw.expLines
      .filter((l) => l.period_entry_id === pe.id)
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
  });
  return records;
}

export async function loadLedgerStore(defaultParents, defaultLibrary) {
  try {
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

    const parents = buildParents(raw.parents, defaultParents);
    const library = buildLibrary(raw.children, parentById, defaultLibrary);
    const sites = buildSites(raw, parentById, childById);
    const records = buildRecords(raw, childById, revById);

    cachedRevIdByCode = Object.fromEntries((raw.revenueHeads || []).map((r) => [r.code, r.id]));
    cachedHeadMaps = {
      parentIdByCode: Object.fromEntries((raw.parents || []).map((p) => [p.code, p.id])),
      childIdByCode: Object.fromEntries((raw.children || []).map((c) => [c.code, c.id])),
    };
    siteUuidByCode.clear();
    (raw.sites || []).forEach((s) => siteUuidByCode.set(s.code, s.id));

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

async function syncParents(parents) {
  invalidatePersistCaches();
  const existing = (await t("expense_parent_heads").select("id, code")).data || [];
  const keep = new Set(parents.map((p) => p.key));
  const out = {};

  for (let i = 0; i < parents.length; i++) {
    const p = parents[i];
    const { data, error } = await t("expense_parent_heads")
      .upsert(
        {
          code: p.key,
          label: p.label,
          color: p.color || TOKENS.accent,
          sort_order: i,
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

  const fallbackParentId = out.adminMisc || out.admin || Object.values(out)[0];
  for (const row of existing) {
    if (!keep.has(row.code)) {
      await removeParentHeadRow(row, fallbackParentId);
    }
  }
  return out;
}

async function syncLibrary(library, parentIdByCode) {
  const existing = (await t("expense_child_heads").select("id, code")).data || [];
  const keep = new Set(library.map((c) => c.key));
  const out = {};
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
          sort_order: i,
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

  for (const row of existing) {
    if (!keep.has(row.code)) {
      await removeChildHeadRow(row);
    }
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
    const childId = childIdByCode[sp.head];
    if (!childId || !sp.id) continue;
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
    const { data: existing } = await t("cost_allocations").select("id").eq("external_id", sp.id).maybeSingle();
    if (existing?.id) {
      await t("cost_allocations").update(payload).eq("id", existing.id);
    } else {
      await t("cost_allocations").insert(payload);
    }
  }
}

async function syncSiteBudgets(siteId, site, childIdByCode, revIdByCode) {
  const existingBudgets = (await t("budget_versions").select("id, external_id, effective_from").eq("site_id", siteId)).data || [];
  const keptBudgetVersionIds = new Set();

  for (const est of site.estimates || []) {
    if (!est.id) continue;
    const effectiveFrom = est.effectiveFrom || site.contractStart || null;
    if (!effectiveFrom) continue;

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
    keptBudgetVersionIds.add(bvId);

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

function resolveOneSiteInclude(include) {
  if (!include) {
    return { meta: true, structure: true, spreads: true, budgets: true };
  }
  return {
    meta: !!include.meta,
    structure: !!include.structure,
    spreads: !!include.spreads,
    budgets: !!include.budgets,
  };
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

/** Ensure every assigned expense head is present on the record (empty → 0). */
export function preparePeriodRecordForSave(rec, assignedExpenseKeys = []) {
  const out = { ...(rec || {}) };
  for (const key of assignedExpenseKeys) {
    out[key] = typeof out[key] === "number" ? Number(out[key]) || 0 : 0;
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
      if (Number(v)) merged.esicBill = Number(v);
      else delete merged.esicBill;
      continue;
    }
    if (k === "_audit") {
      if (v && typeof v === "object" && v.updatedAt) merged._audit = v;
      continue;
    }
    if (typeof v === "number") {
      if (expenseSet?.has(k)) merged[k] = Number(v) || 0;
      else if (Number(v)) merged[k] = Number(v);
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
) {
  const { data: pe, error } = await t("period_entries")
    .upsert(
      {
        site_id: siteUuid,
        period_key: periodKey,
        status: "submitted",
        notes: periodEntryNotesFromRecord(rec),
      },
      { onConflict: "site_id,period_key" },
    )
    .select("id")
    .single();
  if (error) throw error;

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
      typeof amount !== "number"
    ) {
      continue;
    }
    if (!Number(amount)) continue;
    if (!revenueCodes.has(code)) continue;
    const revId = revIdByCode[code];
    if (revId) {
      revRows.push({
        revenue_head_id: revId,
        amount: Number(amount),
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
    const amount = typeof rec?.[code] === "number" ? Number(rec[code]) || 0 : 0;
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
      typeof amount !== "number" ||
      !Number(amount)
    ) {
      continue;
    }
    const childId = childIdByCode[code];
    if (!childId) {
      missingLegacy.push(code);
      continue;
    }
    expRows.push({
      child_head_id: childId,
      amount: Number(amount),
    });
  }
  if (missingLegacy.length) {
    throw new Error(
      `Expense cost lines not saved — sync Site Setup first: ${missingLegacy.join(", ")}`,
    );
  }

  const expectedLines = revRows.length + expRows.length;
  const { data: replacedCount, error: rpcErr } = await financeRpc("replace_period_entry_lines", {
    p_period_entry_id: pe.id,
    p_revenue_rows: revRows,
    p_expense_rows: expRows,
  });
  if (rpcErr) throw rpcErr;
  if (Number(replacedCount) !== expectedLines) {
    throw new Error(
      `Figure save failed: expected ${expectedLines} lines after replace, got ${replacedCount}.`,
    );
  }

  return pe.id;
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
      code === "_audit" ||
      typeof amount !== "number" ||
      !Number(amount)
    ) {
      continue;
    }
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
async function ensureSiteUuid(siteCode, context = {}) {
  const cached = siteUuidByCode.get(siteCode);
  if (cached) return cached;

  const existing = await getSiteUuidByCode(siteCode);
  if (existing) {
    siteUuidByCode.set(siteCode, existing);
    return existing;
  }

  const site = context.sites?.find((s) => s.id === siteCode);
  if (!site) throw new Error(`Site "${siteCode}" not found`);

  const parents = context.parents || [];
  const library = context.library || [];
  const allSites = context.sites || [];
  if (!parents.length || !library.length) {
    throw new Error(`Site "${siteCode}" is not saved yet — retry in a moment`);
  }

  const { parentKeys, childKeys } = collectStructureMapKeys(site.structure);
  const { parentIdByCode, childIdByCode, revIdByCode } = await ensureIdMapsForWrite({
    parentKeys,
    childKeys: [
      ...childKeys,
      ...(site.spreads || []).map((s) => s.head).filter(Boolean),
    ],
    revKeys: REVENUE_ITEMS.map((r) => r.key),
    parents,
    library,
    sites: allSites,
  });
  const index = allSites.findIndex((s) => s.id === siteCode);
  const uuid = await syncSite(site, parentIdByCode, childIdByCode, revIdByCode, index >= 0 ? index : 0);
  siteUuidByCode.set(siteCode, uuid);
  return uuid;
}

/** Persist site master rows (budgets, spreads, contract) without touching period figures. */
export async function persistSitesNow({ sites, library, parents }) {
  return enqueueSave(async () => {
    const revIdByCode = await upsertRevenueHeads();
    const parentIdByCode = await syncParents(parents || []);
    const normalizedSites = (sites || []).map((s) => ({
      ...s,
      structure: dedupeSiteStructure(s.structure),
    }));
    const childIdByCode = await syncLibrary(
      libraryForSitesPersist(library || [], normalizedSites),
      parentIdByCode,
    );
    for (let i = 0; i < normalizedSites.length; i++) {
      await syncSite(normalizedSites[i], parentIdByCode, childIdByCode, revIdByCode, i);
    }
    invalidateFinanceCache({ notify: false });
    return true;
  });
}

/** Fast path — persist one site/month entry (revenue, reimbursements, expenses) without full ledger sync. */
async function executePeriodFlush(compoundKey) {
  const latest = pendingPeriodRecords.get(compoundKey);
  const ctx = pendingPeriodContexts.get(compoundKey) || {};
  pendingPeriodRecords.delete(compoundKey);
  pendingPeriodContexts.delete(compoundKey);
  if (!latest) return true;

  const [siteCode, periodKey] = compoundKey.split("__");
  const siteUuid = await ensureSiteUuid(siteCode, ctx);
  const ctxSite = ctx.sites?.find((s) => s.id === siteCode);
  const assignedExpenseKeys = ctxSite ? assignedExpenseHeadKeys(ctxSite) : [];
  const prepared = preparePeriodRecordForSave(latest, assignedExpenseKeys);
  const { childIdByCode, revIdByCode } = await ensureHeadMapsForPeriodSave(siteCode, prepared, ctx);
  await syncOnePeriodRecord(
    siteUuid,
    periodKey,
    prepared,
    childIdByCode,
    revIdByCode,
    assignedExpenseKeys,
  );
  invalidateFinanceCache({ notify: false });
  return true;
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
    enqueuePeriodSave(() => executePeriodFlush(compoundKey))
      .then(bucket.resolve)
      .catch(bucket.reject);
  }, PERIOD_FLUSH_MS);

  return bucket.promise;
}

/** Flush pending figure save immediately (tab close / site switch). */
export function flushPeriodRecordNow(siteCode, periodKey) {
  const compoundKey = `${siteCode}__${periodKey}`;
  const bucket = periodFlushBuckets.get(compoundKey);
  if (bucket?.timer) {
    clearTimeout(bucket.timer);
    periodFlushBuckets.delete(compoundKey);
    return enqueuePeriodSave(() => executePeriodFlush(compoundKey));
  }
  if (!pendingPeriodRecords.has(compoundKey)) return Promise.resolve(true);
  return enqueuePeriodSave(() => executePeriodFlush(compoundKey));
}

export async function savePeriodRecord(siteCode, periodKey, rec, context = {}, opts = {}) {
  const compoundKey = `${siteCode}__${periodKey}`;
  const site = context.sites?.find((s) => s.id === siteCode);
  const expenseHeadKeys = site ? assignedExpenseHeadKeys(site) : [];
  const prev = pendingPeriodRecords.get(compoundKey);
  pendingPeriodRecords.set(
    compoundKey,
    mergePeriodEntry(prev || {}, rec, expenseHeadKeys.length ? expenseHeadKeys : null),
  );
  if (context.sites?.length || context.library?.length || context.parents?.length) {
    pendingPeriodContexts.set(compoundKey, context);
  }

  if (opts.immediate) {
    const bucket = periodFlushBuckets.get(compoundKey);
    if (bucket?.timer) {
      clearTimeout(bucket.timer);
      periodFlushBuckets.delete(compoundKey);
    }
    return enqueuePeriodSave(() => executePeriodFlush(compoundKey));
  }

  return schedulePeriodFlush(compoundKey);
}

async function syncRecords(records, childIdByCode, revIdByCode, { pruneMissing = false, sites = [] } = {}) {
  const siteRows = (await t("sites").select("id, code")).data || [];
  const codeToId = Object.fromEntries(siteRows.map((s) => [s.code, s.id]));
  const sitesByCode = Object.fromEntries((sites || []).map((s) => [s.id, s]));

  if (pruneMissing) {
    const existing = await t("period_entries").select("id, site_id, period_key");
    const wantKeys = new Set(Object.keys(records || {}));
    for (const pe of existing.data || []) {
      const code = siteRows.find((s) => s.id === pe.site_id)?.code;
      if (!code) continue;
      const k = `${code}__${pe.period_key}`;
      if (!wantKeys.has(k)) {
        await t("period_entries").delete().eq("id", pe.id);
      }
    }
  }

  for (const [compoundKey, rec] of Object.entries(records || {})) {
    const [siteCode, periodKey] = compoundKey.split("__");
    const siteId = codeToId[siteCode];
    if (!siteId) continue;
    const site = sitesByCode[siteCode];
    const assignedExpenseKeys = site ? assignedExpenseHeadKeys(site) : [];
    const prepared = preparePeriodRecordForSave(rec, assignedExpenseKeys);
    await syncOnePeriodRecord(
      siteId,
      periodKey,
      prepared,
      childIdByCode,
      revIdByCode,
      assignedExpenseKeys,
    );
  }
}

async function ensureHeadMapsForRecordsSave(records, sites, library, parents) {
  const parentKeys = [];
  const childKeys = [];
  for (const site of sites || []) {
    const keys = collectStructureMapKeys(site.structure);
    parentKeys.push(...keys.parentKeys);
    childKeys.push(...keys.childKeys, ...assignedExpenseHeadKeys(site));
  }
  for (const rec of Object.values(records || {})) {
    for (const [code, amount] of Object.entries(rec || {})) {
      if (typeof amount === "number" && Number(amount) && !REVENUE_ITEMS.some((r) => r.key === code)) {
        childKeys.push(code);
      }
    }
  }

  const { revIdByCode, childIdByCode } = await ensureIdMapsForWrite({
    parentKeys: [...new Set(parentKeys)],
    childKeys: [...new Set(childKeys)],
    revKeys: REVENUE_ITEMS.map((r) => r.key),
    parents: parents?.length ? parents : null,
    library: library?.length ? library : null,
    sites,
  });

  const missingAssigned = [];
  for (const site of sites || []) {
    for (const k of assignedExpenseHeadKeys(site)) {
      if (!childIdByCode[k]) missingAssigned.push(k);
    }
  }
  if (missingAssigned.length) {
    throw new Error(
      `Expense cost lines not in database — save Site Setup first: ${[...new Set(missingAssigned)].join(", ")}`,
    );
  }

  return { revIdByCode, childIdByCode };
}

async function saveLedgerRecordsInner({ records, sites = [], library = [], parents = [] }) {
  const { revIdByCode, childIdByCode } = await ensureHeadMapsForRecordsSave(
    records,
    sites,
    library,
    parents,
  );
  await syncRecords(records || {}, childIdByCode, revIdByCode, { pruneMissing: false, sites });
  invalidateFinanceCache({ notify: false });
  return true;
}

async function saveLedgerStoreInner({ sites, records, library, parents, pruneSites = false, deletedSiteCodes = [] }) {
  const revIdByCode = await upsertRevenueHeads();
  const parentIdByCode = await syncParents(parents);
  const normalizedSites = sites.map((s) => ({
    ...s,
    structure: dedupeSiteStructure(s.structure),
  }));
  const childIdByCode = await syncLibrary(libraryForSitesPersist(library, normalizedSites), parentIdByCode);

  if (pruneSites || deletedSiteCodes.length) {
    const existingSites = (await t("sites").select("id, code")).data || [];
    const keepSiteCodes = new Set(sites.map((s) => s.id));
    const explicitDeletes = new Set(deletedSiteCodes);
    for (const row of existingSites) {
      const shouldDelete = explicitDeletes.has(row.code)
        || (pruneSites && !keepSiteCodes.has(row.code));
      if (shouldDelete) {
        invalidateSiteUuidCache(row.code);
        await t("sites").delete().eq("id", row.id);
      }
    }
  }

  for (let i = 0; i < normalizedSites.length; i++) {
    await syncSite(normalizedSites[i], parentIdByCode, childIdByCode, revIdByCode, i);
  }

  await syncRecords(records, childIdByCode, revIdByCode, {
    pruneMissing: !!(pruneSites || deletedSiteCodes.length),
    sites: normalizedSites,
  });

  invalidateFinanceCache();
  return true;
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

/**
 * Fast path for Site Setup field edits (contract dates, spreads, budgets, status) — one site only.
 * Prefer this over scope "sites" / full syncSite loop whenever a single site changed.
 * Structure drag-and-drop should keep using scope "structure" (~5 API calls).
 * Use full scope "sites" only for bulk/migration saves that must touch every site.
 */
async function saveLedgerOneSiteInner({
  siteCode,
  sites,
  library,
  parents,
  libraryChanged = false,
  include,
}) {
  const site = (sites || []).find((s) => s.id === siteCode);
  if (!site) throw new Error(`Site "${siteCode}" not found`);

  const flags = resolveOneSiteInclude(include);
  const allSites = sites || [];
  const index = allSites.findIndex((s) => s.id === siteCode);
  const libraryForSync = libraryForSitesPersist(library, allSites);

  const needsHeads = flags.structure || flags.spreads || flags.budgets;
  let parentIdByCode = {};
  let childIdByCode = {};
  let revIdByCode = {};

  if (needsHeads) {
    const { parentKeys, childKeys } = collectStructureMapKeys(site.structure);
    const spreadHeads = (site.spreads || []).map((s) => s.head).filter(Boolean);
    const budgetChildKeys = [];
    const budgetRevKeys = [];
    if (flags.budgets) {
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
    }

    if (libraryChanged) {
      parentIdByCode = await syncParents(parents || []);
      childIdByCode = await syncLibrary(libraryForSync, parentIdByCode);
      cachedHeadMaps = { parentIdByCode, childIdByCode };
      if (flags.budgets || budgetRevKeys.length) {
        cachedRevIdByCode = null;
        revIdByCode = await getRevIdByCode();
      }
    }

    const ensured = await ensureIdMapsForWrite({
      parentKeys: flags.structure ? parentKeys : [],
      childKeys: [
        ...(flags.structure ? childKeys : []),
        ...(flags.spreads ? spreadHeads : []),
        ...budgetChildKeys,
      ],
      revKeys: flags.budgets
        ? (budgetRevKeys.length ? REVENUE_ITEMS.map((r) => r.key) : budgetRevKeys)
        : [],
      parents: parents || null,
      library: libraryForSync,
      sites: allSites,
    });
    parentIdByCode = ensured.parentIdByCode;
    childIdByCode = ensured.childIdByCode;
    if (flags.budgets) revIdByCode = ensured.revIdByCode;
  }

  let siteUuid = siteUuidByCode.get(siteCode) || (await getSiteUuidByCode(siteCode));
  if (!siteUuid) {
    // New site — full syncSite writes meta + structure + spreads + budgets.
    if (!flags.budgets) revIdByCode = await getRevIdByCode();
    if (!needsHeads) {
      const ensured = await ensureIdMapsForWrite({
        ...collectStructureMapKeys(site.structure),
        childKeys: [
          ...collectStructureMapKeys(site.structure).childKeys,
          ...(site.spreads || []).map((s) => s.head).filter(Boolean),
        ],
        revKeys: REVENUE_ITEMS.map((r) => r.key),
        parents: parents || null,
        library: libraryForSync,
        sites: allSites,
      });
      parentIdByCode = ensured.parentIdByCode;
      childIdByCode = ensured.childIdByCode;
      revIdByCode = ensured.revIdByCode;
    }
    siteUuid = await syncSite(
      site,
      parentIdByCode,
      childIdByCode,
      revIdByCode,
      index >= 0 ? index : 0,
    );
  } else {
    if (flags.meta) {
      siteUuid = await upsertSiteRow(site, index >= 0 ? index : 0);
    }
    if (flags.structure) {
      await syncSiteStructureBatch(siteUuid, site.structure, parentIdByCode, childIdByCode);
    }
    if (flags.spreads) {
      await syncSiteSpreads(siteUuid, site.spreads, childIdByCode);
    }
    if (flags.budgets) {
      await syncSiteBudgets(siteUuid, site, childIdByCode, revIdByCode);
    }
  }

  siteUuidByCode.set(siteCode, siteUuid);
  invalidateFinanceCache({ notify: false });
  return true;
}

/** Persist one site now (Site Setup). Same queue as saveLedgerPartial — does not loop all sites. */
export async function persistOneSiteNow(payload) {
  return enqueueSave(async () => {
    try {
      const codes = payload.siteCodes?.length
        ? [...new Set(payload.siteCodes.filter(Boolean))]
        : payload.siteCode
          ? [payload.siteCode]
          : [];
      if (!codes.length) throw new Error("No site selected to save");
      for (const siteCode of codes) {
        await saveLedgerOneSiteInner({ ...payload, siteCode });
      }
      return true;
    } catch (e) {
      throw new Error(financeErrorMsg(e, "Save Site Ledger"));
    }
  });
}

/**
 * Fast path for Site Setup drag-and-drop — structure for one site only (~5 API calls).
 */
async function saveLedgerStructureInner({ siteCode, sites, library, parents, libraryChanged = false }) {
  const site = (sites || []).find((s) => s.id === siteCode);
  if (!site) throw new Error(`Site "${siteCode}" not found`);
  const libraryForSync = libraryForSitesPersist(library, sites);
  const { parentKeys, childKeys } = collectStructureMapKeys(site.structure);

  if (libraryChanged) {
    const parentIdByCode = await syncParents(parents);
    await syncLibrary(libraryForSync, parentIdByCode);
  }

  const { parentIdByCode, childIdByCode, revIdByCode } = await ensureIdMapsForWrite({
    parentKeys,
    childKeys,
    revKeys: [],
    parents: parents || null,
    library: libraryForSync,
    sites: sites || [],
  });

  let siteUuid = await getSiteUuidByCode(siteCode);
  if (!siteUuid) {
    const revMap = Object.keys(revIdByCode || {}).length
      ? revIdByCode
      : await upsertRevenueHeads();
    siteUuid = await syncSite(site, parentIdByCode, childIdByCode, revMap, 0);
  } else {
    siteUuid = await upsertSiteRow(site, 0);
    await syncSiteStructureBatch(siteUuid, site.structure, parentIdByCode, childIdByCode);
  }

  invalidateFinanceCache();
  return true;
}

/**
 * Masters-only save — parent heads, library, and structure rows (no period entries / budgets / spreads).
 */
async function saveLedgerMastersInner({ sites, library, parents }) {
  const parentIdByCode = await syncParents(parents);
  const normalizedSites = (sites || []).map((s) => ({
    ...s,
    structure: dedupeSiteStructure(s.structure),
  }));
  const childIdByCode = await syncLibrary(libraryForSitesPersist(library, normalizedSites), parentIdByCode);

  for (let i = 0; i < normalizedSites.length; i++) {
    const site = normalizedSites[i];
    const siteUuid = await getSiteUuidByCode(site.id);
    if (siteUuid) {
      await upsertSiteRow(site, i);
      await syncSiteStructureBatch(siteUuid, site.structure, parentIdByCode, childIdByCode);
    }
  }

  invalidateFinanceCache();
  return true;
}

async function saveLedgerSitesInner({ sites, library, parents }) {
  const revIdByCode = await upsertRevenueHeads();
  const parentIdByCode = await syncParents(parents || []);
  const normalizedSites = (sites || []).map((s) => ({
    ...s,
    structure: dedupeSiteStructure(s.structure),
  }));
  const childIdByCode = await syncLibrary(
    libraryForSitesPersist(library || [], normalizedSites),
    parentIdByCode,
  );
  for (let i = 0; i < normalizedSites.length; i++) {
    await syncSite(normalizedSites[i], parentIdByCode, childIdByCode, revIdByCode, i);
  }
  invalidateFinanceCache();
  return true;
}

async function saveLedgerPartialInner(payload) {
  const { scope = "full" } = payload;
  if (scope === "structure") {
    return saveLedgerStructureInner(payload);
  }
  if (scope === "site") {
    const codes = payload.siteCodes?.length
      ? [...new Set(payload.siteCodes.filter(Boolean))]
      : payload.siteCode
        ? [payload.siteCode]
        : [];
    if (!codes.length) throw new Error("No site selected to save");
    for (const siteCode of codes) {
      await saveLedgerOneSiteInner({ ...payload, siteCode });
    }
    return true;
  }
  if (scope === "masters") {
    return saveLedgerMastersInner(payload);
  }
  if (scope === "sites") {
    return saveLedgerSitesInner(payload);
  }
  if (scope === "records") {
    return saveLedgerRecordsInner(payload);
  }
  return saveLedgerStoreInner(payload);
}

export async function saveLedgerPartial(payload) {
  return enqueueSave(async () => {
    try {
      return await saveLedgerPartialInner(payload);
    } catch (e) {
      throw new Error(financeErrorMsg(e, "Save Site Ledger"));
    }
  });
}

export async function saveLedgerStore(payload) {
  return saveLedgerPartial({ ...payload, scope: "full" });
}


export async function importLedgerStore(payload) {
  await saveLedgerStore(payload);
  return loadLedgerStore(
    payload.parents || [],
    payload.library || [],
  );
}
