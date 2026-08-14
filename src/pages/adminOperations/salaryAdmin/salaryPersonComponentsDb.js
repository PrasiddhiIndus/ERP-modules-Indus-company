/**
 * Admin Salary — person-specific CTC components (Supabase).
 * Tables: admin_salary_person_components, admin_salary_person_component_history
 */

import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";

export const PERSON_COMPONENTS_TABLE = "admin_salary_person_components";
export const PERSON_COMPONENT_HISTORY_TABLE = "admin_salary_person_component_history";

function toMasterId(employeeMasterId) {
  const n = Number(employeeMasterId);
  return Number.isFinite(n) ? n : null;
}

function isDbUnavailable(err) {
  const msg = String(err?.message || err?.details || err?.hint || "");
  const code = String(err?.code || "");
  return /PGRST205|PGRST204|42P01|does not exist|Could not find the table|relation .* does not exist|schema cache/i.test(
    `${code} ${msg}`
  );
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

function normalizeParent(parent) {
  if (parent === "PART_B") return "PART_B";
  if (parent === "BOTH") return "BOTH";
  return "PART_A";
}

function snapshotOf(ui) {
  return {
    code: ui.code,
    name: ui.name,
    parent_code: ui.parent_code,
    kind: ui.kind,
    formula: ui.formula,
    formula_label: ui.formula_label,
    is_optional_preset: Boolean(ui.is_optional_preset),
    active: ui.active !== false,
    show_on_profile: ui.show_on_profile !== false,
    sort_order: Number(ui.sort_order) || 0,
    amount_monthly: ui.amount_monthly ?? null,
    amount_pa: ui.amount_pa ?? null,
  };
}

/** Map DB row → UI component shape (localStorage-compatible). */
export function mapPersonComponentRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    code: String(row.code || "").toUpperCase(),
    name: row.name || "",
    parent_code: normalizeParent(row.parent_code),
    kind: row.kind || "custom",
    formula: row.formula || "Manual",
    formula_label: row.formula_label || "",
    is_system: Boolean(row.is_system),
    is_optional_preset: Boolean(row.is_optional_preset),
    active: row.active !== false,
    show_on_profile: row.show_on_profile !== false,
    sort_order: Number(row.sort_order) || 0,
    amount_monthly:
      row.amount_monthly == null || row.amount_monthly === ""
        ? null
        : Number(row.amount_monthly),
    amount_pa:
      row.amount_pa == null || row.amount_pa === "" ? null : Number(row.amount_pa),
    employee_master_id: row.employee_master_id,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function uiToDbColumns(ui, employeeMasterId, userId, { forInsert = false } = {}) {
  const code = String(ui.code || "").trim().toUpperCase();
  const cols = {
    employee_master_id: employeeMasterId,
    code,
    name: String(ui.name || "").trim() || code,
    parent_code: normalizeParent(ui.parent_code),
    kind: ui.kind || "custom",
    formula: ui.formula || "Manual",
    formula_label: ui.formula_label || null,
    is_optional_preset: Boolean(ui.is_optional_preset),
    is_system: Boolean(ui.is_system),
    active: ui.active !== false,
    show_on_profile: ui.show_on_profile !== false,
    sort_order: Number(ui.sort_order) || 0,
    amount_monthly:
      ui.amount_monthly == null || ui.amount_monthly === ""
        ? null
        : Number(ui.amount_monthly),
    amount_pa:
      ui.amount_pa == null || ui.amount_pa === "" ? null : Number(ui.amount_pa),
    updated_by: userId,
  };
  if (forInsert) cols.created_by = userId;
  return cols;
}

async function insertHistory({
  employeeMasterId,
  componentId,
  code,
  name,
  parentCode,
  action,
  snapshot,
  remarks,
  userId,
}) {
  const { error } = await supabase.from(PERSON_COMPONENT_HISTORY_TABLE).insert({
    employee_master_id: employeeMasterId,
    component_id: componentId || null,
    code: String(code || "").toUpperCase(),
    name: name || null,
    parent_code: parentCode || null,
    action,
    snapshot_json: snapshot || {},
    remarks: remarks || null,
    created_by: userId,
  });
  if (error) console.warn("Person component history insert failed", error);
}

/** Load components for one employee from DB. */
export async function dbFetchPersonComponents(employeeMasterId) {
  const id = toMasterId(employeeMasterId);
  if (id == null) return [];
  const { data, error } = await supabase
    .from(PERSON_COMPONENTS_TABLE)
    .select("*")
    .eq("employee_master_id", id)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) {
    if (isDbUnavailable(error)) return null; // signal missing table
    throw error;
  }
  return (data || []).map(mapPersonComponentRow).filter(Boolean);
}

/**
 * Replace person components for one employee (upsert + delete removed).
 * Writes history for created / updated / deleted.
 * @returns {Promise<object[]|null>} saved UI rows, or null if DB unavailable
 */
export async function dbReplacePersonComponents(employeeMasterId, list, { amounts = null } = {}) {
  const id = toMasterId(employeeMasterId);
  if (id == null) return [];

  let existing;
  try {
    existing = await dbFetchPersonComponents(id);
  } catch (err) {
    throw err;
  }
  if (existing === null) return null;

  const userId = await currentUserId();
  const nextList = Array.isArray(list) ? list : [];
  const amtMap = amounts && typeof amounts === "object" ? amounts : null;

  const byCode = new Map(existing.map((r) => [String(r.code).toUpperCase(), r]));
  const nextCodes = new Set();
  const saved = [];

  for (const raw of nextList) {
    const code = String(raw.code || "").trim().toUpperCase();
    if (!code) continue;
    nextCodes.add(code);
    const ui = {
      ...raw,
      code,
      amount_monthly:
        amtMap && amtMap[code] != null && amtMap[code] !== ""
          ? Number(amtMap[code])
          : raw.amount_monthly ?? null,
    };
    const prev = byCode.get(code);
    if (prev?.id && /^[0-9a-f-]{36}$/i.test(String(prev.id))) {
      const cols = uiToDbColumns(ui, id, userId);
      const { data, error } = await supabase
        .from(PERSON_COMPONENTS_TABLE)
        .update(cols)
        .eq("id", prev.id)
        .select("*")
        .single();
      if (error) throw error;
      const mapped = mapPersonComponentRow(data);
      saved.push(mapped);
      const changed =
        prev.name !== mapped.name ||
        prev.parent_code !== mapped.parent_code ||
        prev.formula !== mapped.formula ||
        prev.sort_order !== mapped.sort_order ||
        Boolean(prev.active) !== Boolean(mapped.active);
      if (changed) {
        await insertHistory({
          employeeMasterId: id,
          componentId: mapped.id,
          code: mapped.code,
          name: mapped.name,
          parentCode: mapped.parent_code,
          action: "updated",
          snapshot: snapshotOf(mapped),
          userId,
        });
      }
    } else {
      const cols = uiToDbColumns(ui, id, userId, { forInsert: true });
      const { data, error } = await supabase
        .from(PERSON_COMPONENTS_TABLE)
        .insert(cols)
        .select("*")
        .single();
      if (error) throw error;
      const mapped = mapPersonComponentRow(data);
      saved.push(mapped);
      await insertHistory({
        employeeMasterId: id,
        componentId: mapped.id,
        code: mapped.code,
        name: mapped.name,
        parentCode: mapped.parent_code,
        action: "created",
        snapshot: snapshotOf(mapped),
        userId,
      });
    }
  }

  for (const prev of existing) {
    const code = String(prev.code).toUpperCase();
    if (nextCodes.has(code)) continue;
    if (!prev.id) continue;
    const { error } = await supabase.from(PERSON_COMPONENTS_TABLE).delete().eq("id", prev.id);
    if (error) throw error;
    await insertHistory({
      employeeMasterId: id,
      componentId: null,
      code,
      name: prev.name,
      parentCode: prev.parent_code,
      action: "deleted",
      snapshot: snapshotOf(prev),
      userId,
    });
  }

  return saved.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/** Update monthly amounts on person component rows + history. */
export async function dbSyncPersonComponentAmounts(employeeMasterId, amountsMap) {
  const id = toMasterId(employeeMasterId);
  if (id == null) return;
  const existing = await dbFetchPersonComponents(id);
  if (existing === null) return null;
  const userId = await currentUserId();
  const map = amountsMap && typeof amountsMap === "object" ? amountsMap : {};

  for (const row of existing) {
    const raw = map[row.code];
    const nextAmt =
      raw == null || raw === "" ? null : Number(String(raw).replace(/,/g, ""));
    const prevAmt = row.amount_monthly == null ? null : Number(row.amount_monthly);
    const changed =
      (prevAmt == null && nextAmt != null && Number.isFinite(nextAmt)) ||
      (nextAmt == null && prevAmt != null) ||
      (nextAmt != null && prevAmt != null && Math.abs(nextAmt - prevAmt) > 0.001);
    if (!changed) continue;
    const { data, error } = await supabase
      .from(PERSON_COMPONENTS_TABLE)
      .update({
        amount_monthly: Number.isFinite(nextAmt) ? nextAmt : null,
        updated_by: userId,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) throw error;
    const mapped = mapPersonComponentRow(data);
    await insertHistory({
      employeeMasterId: id,
      componentId: mapped.id,
      code: mapped.code,
      name: mapped.name,
      parentCode: mapped.parent_code,
      action: "amount_changed",
      snapshot: snapshotOf(mapped),
      userId,
    });
  }
}

/** All person components across employees (for Salary Components page). */
export async function dbListAllPersonComponents({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from(PERSON_COMPONENTS_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isDbUnavailable(error)) return null;
    throw error;
  }
  const rows = (data || []).map(mapPersonComponentRow).filter(Boolean);
  const empIds = [...new Set(rows.map((r) => r.employee_master_id).filter(Boolean))];
  let empMap = {};
  if (empIds.length) {
    const { data: emps, error: empErr } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("id, full_name, employee_code, department, designation")
      .in("id", empIds);
    if (!empErr) {
      empMap = Object.fromEntries((emps || []).map((e) => [String(e.id), e]));
    }
  }
  return rows.map((r) => {
    const emp = empMap[String(r.employee_master_id)] || {};
    return {
      ...r,
      employee_code: emp.employee_code || "",
      employee_name: emp.full_name || "",
      department: emp.department || "",
      designation: emp.designation || "",
    };
  });
}

/** History for one employee (or recent global if no id). */
export async function dbFetchPersonComponentHistory(employeeMasterId = null, { limit = 100 } = {}) {
  let q = supabase
    .from(PERSON_COMPONENT_HISTORY_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (employeeMasterId != null && employeeMasterId !== "") {
    q = q.eq("employee_master_id", toMasterId(employeeMasterId));
  }
  const { data, error } = await q;
  if (error) {
    if (isDbUnavailable(error)) return null;
    throw error;
  }
  return data || [];
}

export { isDbUnavailable as isPersonComponentsDbUnavailable };
