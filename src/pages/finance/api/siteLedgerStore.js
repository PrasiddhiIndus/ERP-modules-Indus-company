/**
 * Persists SiteLedger document model ↔ finance schema.
 * Document: { sites, records, library, parents } — same as pnl_dashboard.jsx
 */
import { supabase } from "../../../lib/supabase";
import { financeErrorMsg, invalidateFinanceCache, isFinanceSchemaError } from "../../../services/financeApi";
import { removeChildHeadRow, removeParentHeadRow } from "./financeHeadSync";

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
  };
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

/** Serialize writes so concurrent drag-and-drop saves cannot interleave delete/insert. */
let saveChain = Promise.resolve();
function enqueueSave(task) {
  const run = saveChain.then(task);
  saveChain = run.catch(() => {});
  return run;
}

async function fetchBundle() {
  const [
    sitesRes,
    parentsRes,
    childRes,
    revenueRes,
    structureRes,
    budgetsRes,
    budgetRevRes,
    budgetExpRes,
    periodsRes,
    revLinesRes,
    expLinesRes,
    spreadsRes,
  ] = await Promise.all([
    t("sites").select("*").order("sort_order"),
    t("expense_parent_heads").select("*").order("sort_order"),
    t("expense_child_heads").select("*").order("sort_order"),
    t("revenue_heads").select("*").order("sort_order"),
    t("site_expense_structure").select("*").order("sort_order"),
    t("budget_versions").select("*").order("effective_from"),
    t("budget_revenue_lines").select("*"),
    t("budget_expense_lines").select("*"),
    t("period_entries").select("*"),
    t("revenue_entry_lines").select("*"),
    t("expense_entry_lines").select("*"),
    t("cost_allocations").select("*").order("start_period"),
  ]);
  return {
    sites: sitesRes.data || [],
    parents: parentsRes.data || [],
    children: childRes.data || [],
    revenueHeads: revenueRes.data || [],
    structure: structureRes.data || [],
    budgets: budgetsRes.data || [],
    budgetRev: budgetRevRes.data || [],
    budgetExp: budgetExpRes.data || [],
    periods: periodsRes.data || [],
    revLines: revLinesRes.data || [],
    expLines: expLinesRes.data || [],
    spreads: spreadsRes.data || [],
    errors: [
      sitesRes, parentsRes, childRes, revenueRes, structureRes, budgetsRes,
      budgetRevRes, budgetExpRes, periodsRes, revLinesRes, expLinesRes, spreadsRes,
    ].filter((r) => r.error).map((r) => r.error?.message),
  };
}

function buildParents(rows, defaultParents) {
  const active = (rows || []).filter((p) => p.is_active !== false);
  if (!active.length) return defaultParents.map((p) => ({ ...p }));
  return active.map((p) => ({
    key: p.code,
    label: p.label,
    color: p.color || "#1F6F4E",
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
      effectiveFrom: bv.effective_from,
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
      contractStart: s.contract_start_period || periodFromDate(s.contract_start),
      contractEnd: s.contract_end_period || periodFromDate(s.contract_end),
      status: s.status || "active",
      siteGroup: meta.siteGroup || s.code,
      version: meta.version || 1,
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
    }
    const parentById = Object.fromEntries(raw.parents.map((p) => [p.id, p]));
    const childById = Object.fromEntries(raw.children.map((c) => [c.id, c]));
    const revById = Object.fromEntries(raw.revenueHeads.map((r) => [r.id, r.code]));

    const parents = buildParents(raw.parents, defaultParents);
    const library = buildLibrary(raw.children, parentById, defaultLibrary);
    const sites = buildSites(raw, parentById, childById);
    const records = buildRecords(raw, childById, revById);

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
          color: p.color || "#1F6F4E",
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

  const fallbackParentId = out.admin || Object.values(out)[0];
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

  for (let i = 0; i < library.length; i++) {
    const c = library[i];
    const parentId = parentIdByCode[c.parent];
    if (!parentId) continue;
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

  for (const row of existing) {
    if (!keep.has(row.code)) {
      await removeChildHeadRow(row);
    }
  }
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
  const { error: structDelErr } = await t("site_expense_structure").delete().eq("site_id", siteId);
  if (structDelErr) throw structDelErr;

  const deduped = dedupeSiteStructure(structure);
  const rows = [];
  let sort = 0;
  const insertedChildIds = new Set();
  for (const grp of deduped) {
    const parentId = parentIdByCode[grp.parent];
    if (!parentId) continue;
    for (const childKey of grp.children) {
      const childId = childIdByCode[childKey];
      if (!childId || insertedChildIds.has(childId)) continue;
      insertedChildIds.add(childId);
      rows.push({
        site_id: siteId,
        parent_head_id: parentId,
        child_head_id: childId,
        sort_order: sort++,
      });
    }
  }
  if (!rows.length) return;
  const { error: insErr } = await t("site_expense_structure").insert(rows);
  if (insErr) throw insErr;
}

async function getSiteUuidByCode(siteCode) {
  const { data, error } = await t("sites").select("id").eq("code", siteCode).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function syncSite(site, parentIdByCode, childIdByCode, revIdByCode, index) {
  const { data: siteRow, error } = await t("sites")
    .upsert(
      {
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
      },
      { onConflict: "code" },
    )
    .select("id")
    .single();
  if (error) throw error;
  const siteId = siteRow.id;

  await syncSiteStructureBatch(siteId, site.structure, parentIdByCode, childIdByCode);

  const existingSpreads = (await t("cost_allocations").select("id, external_id").eq("site_id", siteId)).data || [];
  const keepSpreads = new Set((site.spreads || []).map((s) => s.id));
  for (const sp of existingSpreads) {
    if (!keepSpreads.has(sp.external_id || sp.id)) {
      await t("cost_allocations").delete().eq("id", sp.id);
    }
  }
  for (const sp of site.spreads || []) {
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

  const existingBudgets = (await t("budget_versions").select("id, external_id").eq("site_id", siteId)).data || [];
  const keepEst = new Set((site.estimates || []).map((e) => e.id));
  for (const bv of existingBudgets) {
    if (!keepEst.has(bv.external_id || bv.id)) {
      await t("budget_versions").delete().eq("id", bv.id);
    }
  }
  for (const est of site.estimates || []) {
    if (!est.id) continue;
    const bvPayload = {
      site_id: siteId,
      effective_from: est.effectiveFrom,
      note: est.note || null,
      status: "active",
      external_id: est.id,
    };
    const { data: existingBv } = await t("budget_versions").select("id").eq("external_id", est.id).maybeSingle();
    let bvId = existingBv?.id;
    if (bvId) {
      const { error: updErr } = await t("budget_versions").update(bvPayload).eq("id", bvId);
      if (updErr) throw updErr;
    } else {
      const { data: inserted, error: insErr } = await t("budget_versions").insert(bvPayload).select("id").single();
      if (insErr) throw insErr;
      bvId = inserted.id;
    }
    const bv = { id: bvId };

    await t("budget_revenue_lines").delete().eq("budget_version_id", bv.id);
    await t("budget_expense_lines").delete().eq("budget_version_id", bv.id);

    for (const [code, amount] of Object.entries(est.revenue || {})) {
      const rhId = revIdByCode[code];
      if (!rhId || !Number(amount)) continue;
      await t("budget_revenue_lines").insert({
        budget_version_id: bv.id,
        revenue_head_id: rhId,
        amount: Number(amount),
      });
    }
    for (const [code, amount] of Object.entries(est.expenses || {})) {
      const chId = childIdByCode[code];
      if (!chId || !Number(amount)) continue;
      await t("budget_expense_lines").insert({
        budget_version_id: bv.id,
        child_head_id: chId,
        amount: Number(amount),
      });
    }
  }

  return siteId;
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
  return Object.keys(meta).length ? JSON.stringify(meta) : null;
}

async function syncOnePeriodRecord(siteUuid, periodKey, rec, childIdByCode, revIdByCode) {
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

  await t("revenue_entry_lines").delete().eq("period_entry_id", pe.id);
  await t("expense_entry_lines").delete().eq("period_entry_id", pe.id);

  for (const [code, amount] of Object.entries(rec || {})) {
    if (
      code === "reimbursementType" ||
      code === "reimbursements" ||
      code === "reimbursementOtherLabel" ||
      code === "creditNoteRemark" ||
      typeof amount !== "number"
    ) {
      continue;
    }
    if (!Number(amount)) continue;
    if (revIdByCode[code]) {
      await t("revenue_entry_lines").insert({
        period_entry_id: pe.id,
        revenue_head_id: revIdByCode[code],
        amount: Number(amount),
      });
    } else if (childIdByCode[code]) {
      await t("expense_entry_lines").insert({
        period_entry_id: pe.id,
        child_head_id: childIdByCode[code],
        amount: Number(amount),
      });
    }
  }
  return pe.id;
}

/** Latest pending payload per site/month — coalesces rapid autosaves into one DB write. */
const pendingPeriodRecords = new Map();

/** Fast path — persist one site/month entry (revenue, reimbursements, expenses) without full ledger sync. */
export async function savePeriodRecord(siteCode, periodKey, rec) {
  const compoundKey = `${siteCode}__${periodKey}`;
  pendingPeriodRecords.set(compoundKey, rec);

  return enqueueSave(async () => {
    const latest = pendingPeriodRecords.get(compoundKey);
    pendingPeriodRecords.delete(compoundKey);
    if (!latest) return true;

    const siteUuid = await getSiteUuidByCode(siteCode);
    if (!siteUuid) throw new Error(`Site "${siteCode}" not found`);
    const revIdByCode = await upsertRevenueHeads();
    const { childIdByCode } = await loadHeadIdMaps();
    await syncOnePeriodRecord(siteUuid, periodKey, latest, childIdByCode, revIdByCode);
    invalidateFinanceCache();
    return true;
  });
}

async function syncRecords(records, siteIdByCode, childIdByCode, revIdByCode) {
  const existing = await t("period_entries").select("id, site_id, period_key");
  const sites = (await t("sites").select("id, code")).data || [];
  const codeToId = Object.fromEntries(sites.map((s) => [s.code, s.id]));

  const wantKeys = new Set(Object.keys(records));
  for (const pe of existing.data || []) {
    const code = sites.find((s) => s.id === pe.site_id)?.code;
    if (!code) continue;
    const k = `${code}__${pe.period_key}`;
    if (!wantKeys.has(k)) {
      await t("period_entries").delete().eq("id", pe.id);
    }
  }

  for (const [compoundKey, rec] of Object.entries(records)) {
    const [siteCode, periodKey] = compoundKey.split("__");
    const siteId = codeToId[siteCode];
    if (!siteId) continue;
    await syncOnePeriodRecord(siteId, periodKey, rec, childIdByCode, revIdByCode);
  }
}

async function saveLedgerRecordsInner({ records }) {
  const revIdByCode = await upsertRevenueHeads();
  const { childIdByCode } = await loadHeadIdMaps();
  await syncRecords(records || {}, null, childIdByCode, revIdByCode);
  invalidateFinanceCache();
  return true;
}

async function saveLedgerStoreInner({ sites, records, library, parents, pruneSites = false, deletedSiteCodes = [] }) {
  const revIdByCode = await upsertRevenueHeads();
  const parentIdByCode = await syncParents(parents);
  const childIdByCode = await syncLibrary(library, parentIdByCode);

  if (pruneSites || deletedSiteCodes.length) {
    const existingSites = (await t("sites").select("id, code")).data || [];
    const keepSiteCodes = new Set(sites.map((s) => s.id));
    const explicitDeletes = new Set(deletedSiteCodes);
    for (const row of existingSites) {
      const shouldDelete = explicitDeletes.has(row.code)
        || (pruneSites && !keepSiteCodes.has(row.code));
      if (shouldDelete) {
        await t("sites").delete().eq("id", row.id);
      }
    }
  }

  const normalizedSites = sites.map((s) => ({
    ...s,
    structure: dedupeSiteStructure(s.structure),
  }));

  for (let i = 0; i < normalizedSites.length; i++) {
    await syncSite(normalizedSites[i], parentIdByCode, childIdByCode, revIdByCode, i);
  }

  await syncRecords(records, null, childIdByCode, revIdByCode);

  invalidateFinanceCache();
  return true;
}

function structureNeedsMasterSync(structure, parentIdByCode, childIdByCode) {
  for (const grp of dedupeSiteStructure(structure)) {
    if (!parentIdByCode[grp.parent]) return true;
    for (const ck of grp.children) {
      if (!childIdByCode[ck]) return true;
    }
  }
  return false;
}

/**
 * Fast path for Site Setup drag-and-drop — structure for one site only (~5 API calls).
 */
async function saveLedgerStructureInner({ siteCode, sites, library, parents, libraryChanged = false }) {
  const site = (sites || []).find((s) => s.id === siteCode);
  if (!site) throw new Error(`Site "${siteCode}" not found`);

  let parentIdByCode;
  let childIdByCode;
  if (libraryChanged) {
    parentIdByCode = await syncParents(parents);
    childIdByCode = await syncLibrary(library, parentIdByCode);
  } else {
    ({ parentIdByCode, childIdByCode } = await loadHeadIdMaps());
    if (structureNeedsMasterSync(site.structure, parentIdByCode, childIdByCode)) {
      parentIdByCode = await syncParents(parents);
      childIdByCode = await syncLibrary(library, parentIdByCode);
    }
  }

  let siteUuid = await getSiteUuidByCode(siteCode);
  if (!siteUuid) {
    const revIdByCode = await upsertRevenueHeads();
    siteUuid = await syncSite(site, parentIdByCode, childIdByCode, revIdByCode, 0);
  } else {
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
  const childIdByCode = await syncLibrary(library, parentIdByCode);
  const normalizedSites = (sites || []).map((s) => ({
    ...s,
    structure: dedupeSiteStructure(s.structure),
  }));

  for (const site of normalizedSites) {
    const siteUuid = await getSiteUuidByCode(site.id);
    if (siteUuid) {
      await syncSiteStructureBatch(siteUuid, site.structure, parentIdByCode, childIdByCode);
    }
  }

  invalidateFinanceCache();
  return true;
}

async function saveLedgerPartialInner(payload) {
  const { scope = "full" } = payload;
  if (scope === "structure") {
    return saveLedgerStructureInner(payload);
  }
  if (scope === "masters") {
    return saveLedgerMastersInner(payload);
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
