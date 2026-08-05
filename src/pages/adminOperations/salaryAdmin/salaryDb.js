/**
 * Admin Salary — Supabase data layer.
 * Tables live in public schema (always exposed to the API):
 *   admin_salary_structures, admin_salary_structure_revisions,
 *   admin_salary_processing_runs, admin_salary_processing_lines
 */

import { supabase } from "../../../lib/supabase";

/** @deprecated Prefer public table names; kept for docs/compat. */
export const ADMIN_SALARY_SCHEMA = "public";

const SALARY_TABLES = Object.freeze({
  structures: "admin_salary_structures",
  structure_revisions: "admin_salary_structure_revisions",
  processing_runs: "admin_salary_processing_runs",
  processing_lines: "admin_salary_processing_lines",
});

const STRUCTURE_COLUMNS = [
  "id",
  "employee_master_id",
  "employee_level",
  "basic_mode",
  "hra_mode",
  "emp_esic_mode",
  "er_esic_mode",
  "leave_encash_mode",
  "gross_monthly",
  "basic_monthly",
  "hra_monthly",
  "special_allowance_monthly",
  "emp_pf_monthly",
  "pt_monthly",
  "emp_esic_monthly",
  "emp_esic_applicable",
  "take_home_monthly",
  "esic_enabled",
  "esic_ceiling",
  "esic_emp_rate_pct",
  "esic_er_rate_pct",
  "esic_eligible",
  "er_pf_monthly",
  "er_esic_monthly",
  "er_esic_applicable",
  "gratuity_mode",
  "gratuity_monthly",
  "leave_encash_monthly",
  "mediclaim_enabled",
  "mediclaim_monthly",
  "lic_enabled",
  "lic_monthly",
  "special_perf_bonus_enabled",
  "special_perf_bonus_monthly",
  "bonus_monthly",
  "total_b_monthly",
  "ctc_monthly",
  "ctc_annual",
  "declared",
  "wef_date",
  "revision_reason",
  "revision_count",
  "date_of_birth",
  "date_of_joining",
  "created_at",
  "updated_at",
].join(", ");

function salaryTable(name) {
  const table = SALARY_TABLES[name] || name;
  return supabase.from(table);
}

function toMasterId(employeeMasterId) {
  const n = Number(employeeMasterId);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function currentAuthUserId() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    /* fall through */
  }
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOr(v, fallback = false) {
  if (v == null) return fallback;
  return Boolean(v);
}

/** Map DB structure row → UI CTC shape (localStorage-compatible). */
export function structureRowToUi(row, revisions = []) {
  if (!row) return null;
  return {
    ...row,
    employee_master_id: String(row.employee_master_id),
    declared: Boolean(row.declared),
    revisions: Array.isArray(revisions) ? revisions : [],
    revision_count: Number(row.revision_count) || 0,
  };
}

/** Map UI / compute payload → DB upsert columns. */
export function uiPayloadToStructureColumns(payload, employeeMasterId) {
  const id = toMasterId(employeeMasterId);
  return {
    employee_master_id: id,
    employee_level: payload.employee_level === "helper" ? "helper" : "office",
    basic_mode: payload.basic_mode === "custom" ? "custom" : "auto",
    hra_mode:
      payload.hra_mode === "custom"
        ? "custom"
        : payload.hra_mode === "auto"
          ? "percent_40"
          : payload.hra_mode || "percent_40",
    emp_esic_mode: payload.emp_esic_mode === "custom" ? "custom" : "auto",
    er_esic_mode: payload.er_esic_mode === "custom" ? "custom" : "auto",
    leave_encash_mode: payload.leave_encash_mode === "custom" ? "custom" : "auto",
    gratuity_mode: payload.gratuity_mode === "custom" ? "custom" : "auto",
    gross_monthly: numOrNull(payload.gross_monthly),
    basic_monthly: numOrNull(payload.basic_monthly),
    hra_monthly: numOrNull(payload.hra_monthly),
    special_allowance_monthly: numOrNull(payload.special_allowance_monthly),
    emp_pf_monthly: numOrNull(payload.emp_pf_monthly),
    pt_monthly: numOrNull(payload.pt_monthly),
    emp_esic_monthly: numOrNull(payload.emp_esic_monthly),
    emp_esic_applicable: boolOr(payload.emp_esic_applicable),
    take_home_monthly: numOrNull(payload.take_home_monthly),
    esic_enabled: payload.esic_enabled !== false,
    esic_ceiling: numOrNull(payload.esic_ceiling) ?? 41999,
    esic_emp_rate_pct: numOrNull(payload.esic_emp_rate_pct) ?? 0.75,
    esic_er_rate_pct: numOrNull(payload.esic_er_rate_pct) ?? 3.25,
    esic_eligible: boolOr(payload.esic_eligible),
    er_pf_monthly: numOrNull(payload.er_pf_monthly),
    er_esic_monthly: numOrNull(payload.er_esic_monthly),
    er_esic_applicable: boolOr(payload.er_esic_applicable),
    gratuity_monthly: numOrNull(payload.gratuity_monthly),
    leave_encash_monthly: numOrNull(payload.leave_encash_monthly),
    mediclaim_enabled: boolOr(payload.mediclaim_enabled),
    mediclaim_monthly: numOrNull(payload.mediclaim_monthly),
    lic_enabled: boolOr(payload.lic_enabled),
    lic_monthly: numOrNull(payload.lic_monthly),
    special_perf_bonus_enabled: boolOr(payload.special_perf_bonus_enabled),
    special_perf_bonus_monthly: numOrNull(payload.special_perf_bonus_monthly),
    bonus_monthly: numOrNull(payload.bonus_monthly),
    total_b_monthly: numOrNull(payload.total_b_monthly),
    ctc_monthly: numOrNull(payload.ctc_monthly),
    ctc_annual: numOrNull(payload.ctc_annual),
    declared: payload.declared !== false,
    wef_date: payload.wef_date || null,
    revision_reason: payload.revision_reason?.trim?.() || payload.revision_reason || null,
    date_of_birth: payload.date_of_birth || null,
    date_of_joining: payload.date_of_joining || null,
  };
}

function revisionRowToUi(row) {
  if (!row) return null;
  const snap =
    row.snapshot_json && typeof row.snapshot_json === "object" ? row.snapshot_json : {};
  return {
    ...snap,
    ...row,
    employee_master_id: String(row.employee_master_id),
    revision_no: Number(row.revision_no) || 0,
    revised_at: row.revised_at,
    wef_date: row.wef_date || snap.wef_date || null,
    revision_reason: row.revision_reason || snap.revision_reason || null,
    superseded_wef: row.superseded_wef || row.wef_date || null,
  };
}

function structureSnapshotForRevision(row) {
  if (!row) return {};
  const {
    id: _id,
    employee_master_id: _eid,
    created_at: _c,
    updated_at: _u,
    created_by: _cb,
    updated_by: _ub,
    revision_count: _rc,
    ...rest
  } = row;
  return rest;
}

export async function dbFetchSalaryStructureMap() {
  const { data, error } = await salaryTable("structures")
    .select(STRUCTURE_COLUMNS)
    .eq("declared", true);
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    map.set(String(row.employee_master_id), structureRowToUi(row, []));
  }
  return map;
}

export async function dbGetSalaryStructure(employeeMasterId, { withRevisions = true } = {}) {
  const id = toMasterId(employeeMasterId);
  if (id == null) return null;

  const { data, error } = await salaryTable("structures")
    .select(STRUCTURE_COLUMNS)
    .eq("employee_master_id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  let revisions = [];
  if (withRevisions) {
    revisions = await dbGetSalaryRevisions(id);
  }
  return structureRowToUi(data, revisions);
}

export async function dbGetSalaryRevisions(employeeMasterId) {
  const id = toMasterId(employeeMasterId);
  if (id == null) return [];

  const { data, error } = await salaryTable("structure_revisions")
    .select("*")
    .eq("employee_master_id", id)
    .order("revision_no", { ascending: false });
  if (error) throw error;
  return (data || []).map(revisionRowToUi);
}

export async function dbGetRevisionCount(employeeMasterId) {
  const row = await dbGetSalaryStructure(employeeMasterId, { withRevisions: false });
  if (!row) return 0;
  return Number(row.revision_count) || 0;
}

/**
 * First-time CTC save / upsert current without creating a revision.
 */
export async function dbSaveSalaryStructure(employeeMasterId, payload) {
  const id = toMasterId(employeeMasterId);
  if (id == null) throw new Error("Invalid employee.");

  const userId = await currentAuthUserId();

  const cols = uiPayloadToStructureColumns(payload, id);
  cols.updated_by = userId;

  const existing = await dbGetSalaryStructure(id, { withRevisions: false });

  if (existing?.id) {
    const { data, error } = await salaryTable("structures")
      .update({
        ...cols,
        revision_count: Number(existing.revision_count) || 0,
      })
      .eq("id", existing.id)
      .select(STRUCTURE_COLUMNS)
      .single();
    if (error) throw error;
    const revisions = await dbGetSalaryRevisions(id);
    return structureRowToUi(data, revisions);
  }

  const { data, error } = await salaryTable("structures")
    .insert({
      ...cols,
      revision_count: 0,
      created_by: userId,
    })
    .select(STRUCTURE_COLUMNS)
    .single();
  if (error) throw error;
  return structureRowToUi(data, []);
}

/**
 * Revise CTC: archive current row, then update with new payload.
 */
export async function dbReviseSalaryStructure(employeeMasterId, payload, meta = {}) {
  const id = toMasterId(employeeMasterId);
  if (id == null) throw new Error("Invalid employee.");

  const prev = await dbGetSalaryStructure(id, { withRevisions: false });
  if (!prev?.declared) {
    return dbSaveSalaryStructure(id, {
      ...payload,
      wef_date: meta.wef_date ?? payload.wef_date ?? null,
      revision_reason: meta.reason?.trim() || payload.revision_reason || null,
    });
  }

  const userId = await currentAuthUserId();

  const nextCount = (Number(prev.revision_count) || 0) + 1;
  const archivedWef = prev.wef_date || null;
  const archivedReason = prev.revision_reason || null;
  const snapshot = structureSnapshotForRevision(prev);

  const { error: revError } = await salaryTable("structure_revisions").insert({
    structure_id: prev.id,
    employee_master_id: id,
    revision_no: nextCount,
    revised_at: new Date().toISOString(),
    wef_date: archivedWef,
    revision_reason: archivedReason,
    superseded_wef: archivedWef,
    employee_level: prev.employee_level,
    basic_mode: prev.basic_mode,
    hra_mode: prev.hra_mode,
    emp_esic_mode: prev.emp_esic_mode,
    er_esic_mode: prev.er_esic_mode,
    gross_monthly: prev.gross_monthly,
    basic_monthly: prev.basic_monthly,
    hra_monthly: prev.hra_monthly,
    special_allowance_monthly: prev.special_allowance_monthly,
    emp_pf_monthly: prev.emp_pf_monthly,
    pt_monthly: prev.pt_monthly,
    emp_esic_monthly: prev.emp_esic_monthly,
    emp_esic_applicable: prev.emp_esic_applicable,
    take_home_monthly: prev.take_home_monthly,
    esic_enabled: prev.esic_enabled,
    esic_ceiling: prev.esic_ceiling,
    esic_emp_rate_pct: prev.esic_emp_rate_pct,
    esic_er_rate_pct: prev.esic_er_rate_pct,
    esic_eligible: prev.esic_eligible,
    er_pf_monthly: prev.er_pf_monthly,
    er_esic_monthly: prev.er_esic_monthly,
    er_esic_applicable: prev.er_esic_applicable,
    gratuity_mode: prev.gratuity_mode,
    gratuity_monthly: prev.gratuity_monthly,
    leave_encash_mode: prev.leave_encash_mode,
    leave_encash_monthly: prev.leave_encash_monthly,
    mediclaim_enabled: prev.mediclaim_enabled,
    mediclaim_monthly: prev.mediclaim_monthly,
    lic_enabled: prev.lic_enabled,
    lic_monthly: prev.lic_monthly,
    special_perf_bonus_enabled: prev.special_perf_bonus_enabled,
    special_perf_bonus_monthly: prev.special_perf_bonus_monthly,
    bonus_monthly: prev.bonus_monthly,
    total_b_monthly: prev.total_b_monthly,
    ctc_monthly: prev.ctc_monthly,
    ctc_annual: prev.ctc_annual,
    declared: prev.declared,
    date_of_birth: prev.date_of_birth,
    date_of_joining: prev.date_of_joining,
    snapshot_json: snapshot,
  });
  if (revError) throw revError;

  const cols = uiPayloadToStructureColumns(
    {
      ...payload,
      wef_date: meta.wef_date ?? payload.wef_date ?? null,
      revision_reason: meta.reason?.trim() || null,
    },
    id
  );

  const { data, error } = await salaryTable("structures")
    .update({
      ...cols,
      revision_count: nextCount,
      updated_by: userId,
    })
    .eq("id", prev.id)
    .select(STRUCTURE_COLUMNS)
    .single();
  if (error) throw error;

  const revisions = await dbGetSalaryRevisions(id);
  return structureRowToUi(data, revisions);
}

// ─── Processing runs / lines ─────────────────────────────────────────────────

function monthKeyToPayMonth(monthKey) {
  const m = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  return `${m}-01`;
}

export async function dbGetProcessingRun(monthKey, { preferFinalized = false } = {}) {
  const key = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return null;

  let q = salaryTable("processing_runs")
    .select("*")
    .eq("month_key", key)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(5);

  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  if (preferFinalized) {
    return rows.find((r) => r.status === "finalized") || rows.find((r) => r.status === "draft") || null;
  }
  return rows.find((r) => r.status === "draft") || rows.find((r) => r.status === "finalized") || null;
}

export async function dbGetOrCreateDraftRun(monthKey, { totalDays = 26 } = {}) {
  const key = String(monthKey || "").trim();
  const payMonth = monthKeyToPayMonth(key);
  if (!payMonth) throw new Error("Invalid pay month.");

  const existing = await dbGetProcessingRun(key);
  if (existing?.status === "draft") return existing;
  if (existing?.status === "finalized") {
    throw new Error("This month is already finalized. Open a new revision only via a new draft if allowed.");
  }

  const userId = await currentAuthUserId();

  const { data, error } = await salaryTable("processing_runs")
    .insert({
      pay_month: payMonth,
      month_key: key,
      status: "draft",
      total_days: totalDays,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function dbListProcessingLines(runId) {
  if (!runId) return [];
  const { data, error } = await salaryTable("processing_lines")
    .select("*")
    .eq("run_id", runId)
    .order("employee_code", { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Upsert many processing lines for a run (from sheet compute). */
export async function dbUpsertProcessingLines(runId, lines) {
  if (!runId) throw new Error("Missing run.");
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const rows = lines.map((line) => ({
    run_id: runId,
    employee_master_id: toMasterId(line.employee_master_id),
    employee_code: line.employee_code || null,
    employee_name: line.employee_name || null,
    designation: line.designation || null,
    account_no: line.account_no || null,
    ifsc: line.ifsc || null,
    confirmation_date: line.confirmation_date || null,
    structure_id: line.structure_id || null,
    declared: Boolean(line.declared),
    salary_rate: numOrNull(line.salary_rate),
    basic_full: numOrNull(line.basic_full ?? line.basic),
    hra_full: numOrNull(line.hra_full),
    special_full: numOrNull(line.special_full),
    present_days: numOrNull(line.present_days) ?? 26,
    total_days: Number(line.total_days) || 26,
    pf_basic: numOrNull(line.pf_basic),
    pt_amount: numOrNull(line.pt_amount ?? line.pt),
    loan: numOrNull(line.loan) ?? 0,
    sal_adv: numOrNull(line.sal_adv) ?? 0,
    unpaid_paid: numOrNull(line.unpaid_paid) ?? 0,
    tds: numOrNull(line.tds) ?? 0,
    pf_earned_basic: numOrNull(line.pf_earned_basic),
    basic_earned: numOrNull(line.basic_earned),
    hra_earned: numOrNull(line.hra_earned ?? line.hra),
    special_allowance: numOrNull(line.special_allowance),
    gross_wages: numOrNull(line.gross_wages),
    emp_pf: numOrNull(line.emp_pf),
    emp_esic: numOrNull(line.emp_esic),
    total_ded: numOrNull(line.total_ded),
    net_salary: numOrNull(line.net_salary),
    bank_amount: numOrNull(line.bank_amount ?? line.bank),
    line_status: line.line_status || "open",
    overrides_json: line.overrides_json || {},
    computed_json: line.computed_json || {},
  }));

  const { data, error } = await salaryTable("processing_lines")
    .upsert(rows, { onConflict: "run_id,employee_master_id" })
    .select("*");
  if (error) throw error;
  return data || [];
}

export async function dbUpdateProcessingRunTotals(runId, totals = {}) {
  if (!runId) return null;
  const userId = await currentAuthUserId();

  const { data, error } = await salaryTable("processing_runs")
    .update({
      employee_count: Number(totals.employee_count) || 0,
      declared_count: Number(totals.declared_count) || 0,
      total_gross_wages: numOrNull(totals.total_gross_wages) ?? 0,
      total_deductions: numOrNull(totals.total_deductions) ?? 0,
      total_net: numOrNull(totals.total_net) ?? 0,
      summary_json: totals.summary_json || {},
      updated_by: userId,
    })
    .eq("id", runId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function dbFinalizeProcessingRun(runId) {
  if (!runId) throw new Error("Missing run.");
  const userId = await currentAuthUserId();

  const { data, error } = await salaryTable("processing_runs")
    .update({
      status: "finalized",
      finalized_by: userId,
      finalized_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", runId)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
