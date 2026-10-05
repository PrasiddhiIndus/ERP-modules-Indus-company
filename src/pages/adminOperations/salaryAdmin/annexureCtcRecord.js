/**
 * Annexure-I CTC records on top of admin_salary_structures (current) and
 * admin_salary_structure_revisions (history). Pure helpers: engine result ↔ record,
 * history with Effective To, and the payroll-line inputs used by Salary Processing.
 */

import {
  CATEGORY_EXISTING_CONFIRMED,
  CATEGORY_NEW_JOINER_NEW_SCHEME,
  CATEGORY_NEW_PROBATION,
  CATEGORY_PROBATION_TO_CONFIRMED,
  STATUS_CONFIRMED,
  normalizeScheme,
  normalizeSkill,
  normalizeStatus,
  round2,
  schemeLabel,
} from "./ctcEngine";

export const ANNEXURE_STRUCTURE_VERSION = "annexure_2026";

export const CATEGORY_OPTIONS = Object.freeze([
  { value: CATEGORY_EXISTING_CONFIRMED, label: "Existing / Confirmed" },
  { value: CATEGORY_NEW_PROBATION, label: "New Employee / Probation" },
  { value: CATEGORY_NEW_JOINER_NEW_SCHEME, label: "New Joiner / New Scheme" },
  { value: CATEGORY_PROBATION_TO_CONFIRMED, label: "Probation → Confirmed" },
]);

export const REVISION_TYPE_OPTIONS = Object.freeze([
  { value: "initial", label: "Initial" },
  { value: "increment", label: "Increment" },
  { value: "confirmation", label: "Confirmation" },
  { value: "scheme_change", label: "Scheme Change" },
  { value: "correction", label: "Correction" },
  { value: "custom", label: "Custom" },
]);

export function categoryLabel(value) {
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label || "—";
}

export function revisionTypeLabel(value) {
  return REVISION_TYPE_OPTIONS.find((o) => o.value === value)?.label || "—";
}

export function statusLabel(status) {
  return normalizeStatus(status) === STATUS_CONFIRMED ? "Confirmed" : "Probation";
}

export function skillLabel(skill) {
  return normalizeSkill(skill) === "semi_skilled" ? "Semi-skilled" : "Skilled";
}

export function isAnnexureRecord(row) {
  return row?.structure_version === ANNEXURE_STRUCTURE_VERSION;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** CTC record (current row or archived snapshot) → Annexure row values (monthly). */
export function recordToComponents(row) {
  if (!row) return null;
  return {
    basic: n(row.basic_monthly),
    hra: n(row.hra_monthly),
    conveyance: n(row.conveyance_monthly),
    bonus: n(row.stat_bonus_monthly),
    medical: n(row.medical_allowance_monthly),
    special: n(row.special_allowance_monthly),
    gross: n(row.gross_monthly),
    ee_pf: n(row.emp_pf_monthly),
    pt: n(row.pt_monthly),
    ee_esic: n(row.emp_esic_monthly),
    take_home: n(row.take_home_monthly),
    er_pf: n(row.er_pf_monthly),
    er_esic: n(row.er_esic_monthly),
    mediclaim: n(row.mediclaim_monthly),
    leave_encashment: n(row.leave_encash_monthly),
    gratuity: n(row.gratuity_monthly),
    ex_gratia: n(row.ex_gratia_monthly),
    total_b: n(row.total_b_monthly),
    ctc: n(row.ctc_monthly),
    band: row.salary_band ?? null,
  };
}

/**
 * Engine result → CTC record payload. Earlier-structure lines (LIC, Special Performance Bonus,
 * Part B bonus, per-employee formulas) are cleared on new records.
 */
export function resultToStructurePayload(result, meta) {
  const r = (v) => round2(v);
  const conf = result.status === STATUS_CONFIRMED;
  const rules = meta.rules || {};
  return {
    structure_version: ANNEXURE_STRUCTURE_VERSION,
    employee_level: "office",
    basic_mode: result.overrides?.basic != null ? "custom" : "auto",
    hra_mode: result.overrides?.hra != null ? "custom" : "percent_40",
    emp_esic_mode: "auto",
    er_esic_mode: "auto",
    leave_encash_mode: "auto",
    gratuity_mode: "auto",
    gross_monthly: r(result.gross),
    basic_monthly: r(result.basic),
    hra_monthly: r(result.hra),
    special_allowance_monthly: r(result.special),
    conveyance_monthly: r(result.conveyance),
    stat_bonus_monthly: r(result.bonus),
    medical_allowance_monthly: r(result.medical),
    emp_pf_monthly: r(result.ee_pf),
    pf_wage_monthly: r(result.pf_wage),
    pt_monthly: r(result.pt),
    emp_esic_monthly: r(result.ee_esic),
    emp_esic_applicable: result.ee_esic > 0,
    take_home_monthly: r(result.take_home),
    esic_enabled: true,
    esic_ceiling: n(rules.ESIC_THRESHOLD),
    esic_emp_rate_pct: n(rules.EE_ESIC_PCT),
    esic_er_rate_pct: n(rules.ER_ESIC_PCT),
    esic_eligible: result.ee_esic > 0,
    er_pf_monthly: r(result.er_pf),
    er_esic_monthly: r(result.er_esic),
    er_esic_applicable: result.er_esic > 0,
    gratuity_monthly: r(result.gratuity),
    leave_encash_monthly: r(result.leave_encashment),
    mediclaim_enabled: conf,
    mediclaim_monthly: r(result.mediclaim),
    ex_gratia_monthly: r(result.ex_gratia),
    lic_enabled: false,
    lic_monthly: 0,
    special_perf_bonus_enabled: false,
    special_perf_bonus_monthly: 0,
    bonus_monthly: 0,
    total_b_monthly: r(result.total_b),
    ctc_monthly: r(result.ctc),
    ctc_annual: r(result.ctc * 12),
    pa_overrides_json: {},
    formula_overrides_json: {},
    declared: true,
    wef_date: meta.wefDate,
    revision_reason: meta.reason || null,
    revision_type: meta.revisionType || null,
    skill_category: normalizeSkill(result.skill),
    salary_scheme: normalizeScheme(meta.scheme),
    employee_status: result.status,
    employee_category: meta.category || null,
    salary_band: result.band,
    input_basis: result.input_basis,
    input_amount: r(result.input_amount),
    rule_version_id: meta.ruleVersionId || null,
    validation_status: result.validation?.code || null,
    is_custom: Boolean(result.is_custom),
    custom_overrides_json: result.is_custom ? roundMap(result.overrides) : {},
    system_values_json: result.is_custom ? roundMap(result.system_values) : {},
    date_of_birth: meta.employee?.date_of_birth || null,
    date_of_joining: meta.employee?.date_of_joining || null,
  };
}

function roundMap(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = round2(v);
  return out;
}

function toDay(d) {
  const s = String(d || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function dayBefore(iso) {
  const s = toDay(iso);
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * All CTC records for an employee, newest first, with Effective From / To.
 * `structure` is the current row with `revisions` (archived versions) attached.
 */
export function buildCtcHistory(structure) {
  if (!structure?.declared) return [];
  const { revisions, ...current } = structure;
  const rows = [
    { ...current, __key: `cur_${current.id || "local"}`, __current: true },
    ...(Array.isArray(revisions) ? revisions : []).map((rev, i) => ({
      ...rev,
      __key: `rev_${rev.id || i}`,
      __current: false,
    })),
  ];
  const sorted = rows
    .map((row) => ({ ...row, effective_from: toDay(row.wef_date) }))
    .sort((a, b) => {
      if (a.__current !== b.__current) return a.__current ? -1 : 1;
      const af = a.effective_from || "";
      const bf = b.effective_from || "";
      if (af !== bf) return af < bf ? 1 : -1;
      return (Number(b.revision_no) || 0) - (Number(a.revision_no) || 0);
    });
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    if (row.__current) {
      row.effective_to = null;
      continue;
    }
    const newer = sorted[i - 1];
    const computed = newer ? dayBefore(newer.effective_from) : null;
    const replaced = Boolean(computed && row.effective_from && computed < row.effective_from);
    row.effective_to = toDay(row.effective_to) || (replaced ? null : computed);
    row.replaced = replaced && !toDay(row.effective_to);
  }
  return sorted;
}

export function historyRowSummary(row) {
  const annex = isAnnexureRecord(row);
  return {
    key: row.__key,
    current: Boolean(row.__current),
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    revision_type: annex ? revisionTypeLabel(row.revision_type) : "Earlier structure",
    gross: n(row.gross_monthly),
    ctc: n(row.ctc_monthly),
    take_home: n(row.take_home_monthly),
    status: annex ? statusLabel(row.employee_status) : "—",
    scheme: annex ? schemeLabel(row.salary_scheme) : "—",
    band: annex ? row.salary_band : null,
    is_custom: annex && Boolean(row.is_custom),
    annexure: annex,
    reason: row.revision_reason || "",
    row,
  };
}

// ─── Salary Processing ──────────────────────────────────────────────────────

/** Full-month values Salary Processing needs from an Annexure-I record (null for older records). */
export function annexureLineInputs(structure) {
  if (!isAnnexureRecord(structure)) return null;
  return {
    structure_version: ANNEXURE_STRUCTURE_VERSION,
    conveyance_full: n(structure.conveyance_monthly),
    stat_bonus_full: n(structure.stat_bonus_monthly),
    medical_full: n(structure.medical_allowance_monthly),
    ee_pf_full: n(structure.emp_pf_monthly),
    pf_wage_full: n(structure.pf_wage_monthly) || n(structure.basic_monthly),
    ee_esic_full: n(structure.emp_esic_monthly),
    pt_full: n(structure.pt_monthly),
    er_pf_full: n(structure.er_pf_monthly),
    er_esic_full: n(structure.er_esic_monthly),
    scheme: structure.salary_scheme || null,
    status: structure.employee_status || null,
    band: structure.salary_band ?? null,
    is_custom: Boolean(structure.is_custom),
    wef_date: structure.wef_date || null,
  };
}

export function annexureFromLine(line) {
  const cj = line?.computed_json && typeof line.computed_json === "object" ? line.computed_json : {};
  const snap =
    line?.source_snapshot_json && typeof line.source_snapshot_json === "object"
      ? line.source_snapshot_json
      : {};
  const ax = cj.annexure || snap.annexure;
  return ax && ax.structure_version === ANNEXURE_STRUCTURE_VERSION ? ax : null;
}
