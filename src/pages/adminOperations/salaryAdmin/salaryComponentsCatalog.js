/**
 * Salary Components Master — catalog of CTC components (codes, parents, formulas).
 * Defaults match Admin CTC; custom children nest under parents and show on employee profile.
 * Persisted in localStorage until salary DB rewire.
 */

import { evaluateFormula, validateFormula } from "../../../modules/payroll/formula/evaluator";

const STORAGE_KEY = "admin_salary_components_master_v1";
const PERSON_KEY = "admin_salary_component_person_overrides_v1";
/** Person-only custom components: { [employeeMasterId]: Component[] } */
const PERSON_COMPONENTS_KEY = "admin_salary_person_components_v1";
/** Manual amounts for Manual-formula person components on CTC profile */
const CUSTOM_AMT_KEY = "admin_ctc_custom_component_amounts_v1";

/** @typedef {'earning'|'deduction'|'employer'|'total'|'group'|'custom'} ComponentKind */

/**
 * Default CTC catalog. Codes are short (BAS = Basic).
 * parent_code: null for roots; PART_A / PART_B groups; or another component code for nesting.
 */
export const DEFAULT_SALARY_COMPONENTS = [
  {
    id: "grp_part_a",
    code: "PART_A",
    name: "Part A — Gross & Take Home",
    parent_code: null,
    kind: "group",
    formula: "",
    formula_label: "",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 10,
  },
  {
    id: "cmp_gross",
    code: "GROSS",
    name: "Gross",
    parent_code: "PART_A",
    kind: "earning",
    formula: "Manual",
    formula_label: "Master input",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 20,
  },
  {
    id: "cmp_bas",
    code: "BAS",
    name: "Basic",
    parent_code: "PART_A",
    kind: "earning",
    formula: "MAX(GROSS * 50%, 15000)",
    formula_label: "Auto: MAX(50% of Gross, ₹15,000) · Custom: manual",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 30,
  },
  {
    id: "cmp_hra",
    code: "HRA",
    name: "HRA",
    parent_code: "PART_A",
    kind: "earning",
    formula: "BAS * 40%",
    formula_label: "Auto: 40% of Basic · Custom: manual",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 40,
  },
  {
    id: "cmp_spa",
    code: "SPA",
    name: "Special Allowance",
    parent_code: "PART_A",
    kind: "earning",
    formula: "GROSS - BAS - HRA",
    formula_label: "Balancing: Gross − Basic − HRA",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 50,
  },
  {
    id: "cmp_epf",
    code: "EPF",
    name: "Employee PF",
    parent_code: "PART_A",
    kind: "deduction",
    formula: "MIN(BAS * 12%, 1800)",
    formula_label: "12% of PF Basic (capped)",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 60,
  },
  {
    id: "cmp_pt",
    code: "PT",
    name: "P. Tax",
    parent_code: "PART_A",
    kind: "deduction",
    formula: "200",
    formula_label: "Fixed / editable",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 70,
  },
  {
    id: "cmp_eesi",
    code: "EESI",
    name: "Employee ESIC",
    parent_code: "PART_A",
    kind: "deduction",
    formula: "IF(GROSS <= 21000, BAS * 0.75%, 0)",
    formula_label: "0.75% of Basic when Gross ≤ ceiling",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 80,
  },
  {
    id: "cmp_th",
    code: "TH",
    name: "Take Home",
    parent_code: "PART_A",
    kind: "total",
    formula: "GROSS - EPF - PT - EESI",
    formula_label: "Gross − Emp PF − P.Tax − Emp ESIC",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 90,
  },
  {
    id: "grp_part_b",
    code: "PART_B",
    name: "Part B — Employer cost",
    parent_code: null,
    kind: "group",
    formula: "",
    formula_label: "",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 100,
  },
  {
    id: "cmp_erpf",
    code: "ERPF",
    name: "Employer PF",
    parent_code: "PART_B",
    kind: "employer",
    formula: "Manual",
    formula_label: "Manual placeholder",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 110,
  },
  {
    id: "cmp_eres",
    code: "ERES",
    name: "Employer ESIC",
    parent_code: "PART_B",
    kind: "employer",
    formula: "IF(GROSS <= 21000, BAS * 3.25%, 0)",
    formula_label: "3.25% of Basic when eligible",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 120,
  },
  {
    id: "cmp_gra",
    code: "GRA",
    name: "Gratuity",
    parent_code: "PART_B",
    kind: "employer",
    formula: "BAS * 4.81%",
    formula_label: "Auto: Basic × 4.81%",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 130,
  },
  {
    id: "cmp_len",
    code: "LEN",
    name: "Leave Encashment",
    parent_code: "PART_B",
    kind: "employer",
    formula: "Manual",
    formula_label: "Auto / Custom",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 140,
  },
  {
    id: "cmp_med",
    code: "MED",
    name: "Mediclaim",
    parent_code: "PART_B",
    kind: "employer",
    formula: "Manual",
    formula_label: "Optional",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 150,
  },
  {
    id: "cmp_lic",
    code: "LIC",
    name: "LIC",
    parent_code: "PART_B",
    kind: "employer",
    formula: "Manual",
    formula_label: "Optional",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 160,
  },
  {
    id: "cmp_spb",
    code: "SPB",
    name: "Special Performance Bonus",
    parent_code: "PART_B",
    kind: "employer",
    formula: "Manual",
    formula_label: "Optional variable",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 170,
  },
  {
    id: "cmp_bon",
    code: "BON",
    name: "Bonus",
    parent_code: "PART_B",
    kind: "employer",
    formula: "Manual",
    formula_label: "Placeholder",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 180,
  },
  {
    id: "cmp_totb",
    code: "TOTB",
    name: "Total (B)",
    parent_code: "PART_B",
    kind: "total",
    formula: "ERPF + ERES + GRA + LEN + MED + LIC + SPB + BON",
    formula_label: "Sum of Part B",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 190,
  },
  {
    id: "cmp_ctc",
    code: "CTC",
    name: "CTC (Monthly)",
    parent_code: null,
    kind: "total",
    formula: "GROSS + TOTB",
    formula_label: "Gross + Total B",
    is_system: true,
    active: true,
    show_on_profile: true,
    sort_order: 200,
  },
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Salary components master: persist failed", err);
  }
}

function cloneDefaults() {
  return DEFAULT_SALARY_COMPONENTS.map((c) => ({ ...c }));
}

/** Merge saved catalog with any new default codes (non-destructive). */
export function loadSalaryComponents() {
  const saved = readJson(STORAGE_KEY, null);
  if (!Array.isArray(saved) || !saved.length) {
    const defaults = cloneDefaults();
    writeJson(STORAGE_KEY, defaults);
    return defaults;
  }
  const byCode = new Map(saved.map((c) => [c.code, c]));
  for (const def of DEFAULT_SALARY_COMPONENTS) {
    if (!byCode.has(def.code)) {
      saved.push({ ...def });
      byCode.set(def.code, def);
    }
  }
  return saved.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

export function saveSalaryComponents(list) {
  const rows = Array.isArray(list) ? list : [];
  writeJson(STORAGE_KEY, rows);
  return rows;
}

export function resetSalaryComponentsToDefaults() {
  const defaults = cloneDefaults();
  writeJson(STORAGE_KEY, defaults);
  return defaults;
}

export function newComponentId() {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Suggest a short uppercase code from a name (e.g. Conveyance → CON). */
export function suggestComponentCode(name, existingCodes = []) {
  const words = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let base = "";
  if (words.length === 1) base = words[0].slice(0, 3);
  else base = words.map((w) => w[0]).join("").slice(0, 4);
  if (!base) base = "CMP";
  const set = new Set((existingCodes || []).map((c) => String(c).toUpperCase()));
  if (!set.has(base)) return base;
  for (let i = 2; i < 99; i += 1) {
    const cand = `${base}${i}`.slice(0, 6);
    if (!set.has(cand)) return cand;
  }
  return `${base}${Date.now().toString(36).slice(-2)}`.toUpperCase();
}

export function normalizeComponentCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 12);
}

/**
 * Person-specific formula overrides: { [employeeMasterId]: { [code]: formula } }
 */
export function loadPersonComponentOverrides() {
  const raw = readJson(PERSON_KEY, {});
  return raw && typeof raw === "object" ? raw : {};
}

export function savePersonComponentOverrides(map) {
  writeJson(PERSON_KEY, map || {});
  return map;
}

export function getPersonFormula(employeeMasterId, code, fallbackFormula = "") {
  if (employeeMasterId == null) return fallbackFormula;
  const all = loadPersonComponentOverrides();
  const person = all[String(employeeMasterId)];
  if (person && person[code] != null && String(person[code]).trim() !== "") {
    return String(person[code]);
  }
  return fallbackFormula;
}

export function setPersonFormula(employeeMasterId, code, formula) {
  if (employeeMasterId == null || !code) return;
  const all = loadPersonComponentOverrides();
  const key = String(employeeMasterId);
  const person = { ...(all[key] || {}) };
  if (formula == null || String(formula).trim() === "") delete person[code];
  else person[code] = String(formula).trim();
  if (!Object.keys(person).length) delete all[key];
  else all[key] = person;
  savePersonComponentOverrides(all);
}

export function listParentOptions(components) {
  return (components || []).filter((c) => c.active !== false);
}

/** Load custom components for one employee only. */
export function loadPersonComponents(employeeMasterId) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const all = readJson(PERSON_COMPONENTS_KEY, {});
  const rows = all[String(employeeMasterId)];
  return Array.isArray(rows) ? rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) : [];
}

/** Save custom components for one employee. */
export function savePersonComponents(employeeMasterId, list) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  const all = readJson(PERSON_COMPONENTS_KEY, {});
  const key = String(employeeMasterId);
  const rows = Array.isArray(list) ? list : [];
  if (!rows.length) delete all[key];
  else all[key] = rows;
  writeJson(PERSON_COMPONENTS_KEY, all);
  return rows;
}

/**
 * Components shown on an employee CTC profile = that person's custom lines only.
 * Company defaults stay on the CTC sheet; these are extras for this person.
 */
export function getProfileCustomComponents(employeeMasterId = null) {
  if (employeeMasterId == null || employeeMasterId === "") return [];
  return loadPersonComponents(employeeMasterId)
    .filter((c) => c.active !== false && c.show_on_profile !== false && c.kind !== "group")
    .map((c) => ({
      ...c,
      effective_formula: getPersonFormula(employeeMasterId, c.code, c.formula),
    }));
}

/** Default CTC catalog only (no person customs). */
export function getDefaultCtcComponents() {
  return cloneDefaults();
}

/** Manual CTC amounts for person components with formula = Manual. */
export function loadCustomComponentAmounts(employeeMasterId) {
  if (employeeMasterId == null) return {};
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_AMT_KEY) || "{}");
    const row = all[String(employeeMasterId)];
    return row && typeof row === "object" ? row : {};
  } catch {
    return {};
  }
}

export function saveCustomComponentAmounts(employeeMasterId, map) {
  if (employeeMasterId == null) return;
  try {
    const all = JSON.parse(localStorage.getItem(CUSTOM_AMT_KEY) || "{}");
    all[String(employeeMasterId)] = map || {};
    localStorage.setItem(CUSTOM_AMT_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn("CTC custom amounts persist failed", err);
  }
}

/**
 * Resolve person-specific components into monthly earn / deduction totals for CTC + payroll.
 * @param {string|number} employeeMasterId
 * @param {object} structureLike — CTC fields (gross_monthly, basic_monthly, …)
 */
export function resolvePersonComponentsForPayroll(employeeMasterId, structureLike = {}) {
  const comps = getProfileCustomComponents(employeeMasterId);
  const manualAmts = loadCustomComponentAmounts(employeeMasterId);
  const items = [];
  let customEarn = 0;
  let customDed = 0;
  let customEmployer = 0;

  for (const c of comps) {
    const formula = c.effective_formula || c.formula || "";
    const isManual = !formula || /^manual$/i.test(String(formula));
    let amount = 0;
    if (isManual) {
      const n = Number(manualAmts[c.code]);
      amount = Number.isFinite(n) ? Math.round(n) : 0;
    } else {
      const evaluated = evalComponentFormula(formula, structureLike, manualAmts);
      amount = evaluated == null ? 0 : evaluated;
    }

    const underB = c.parent_code === "PART_B" || c.kind === "employer";
    const isDed = c.kind === "deduction";
    let bucket = "earning";
    if (isDed) bucket = "deduction";
    else if (underB) bucket = "employer";

    items.push({
      code: c.code,
      name: c.name,
      kind: bucket,
      amount,
      formula,
      parent_code: c.parent_code || null,
    });

    if (bucket === "deduction") customDed += amount;
    else if (bucket === "employer") customEmployer += amount;
    else customEarn += amount;
  }

  return {
    items,
    custom_earn_full: Math.round(customEarn),
    custom_ded_full: Math.round(customDed),
    custom_employer_full: Math.round(customEmployer),
  };
}

/** Build variable map from a computed CTC structure for formula evaluation. */
export function buildCtcFormulaVars(parsed = {}) {
  const gross = Number(parsed.gross_monthly) || 0;
  const bas = Number(parsed.basic_monthly) || 0;
  const hra = Number(parsed.hra_monthly) || 0;
  const spa = Number(parsed.special_allowance_monthly) || 0;
  const epf = Number(parsed.emp_pf_monthly) || 0;
  const pt = Number(parsed.pt_monthly) || 0;
  const eesi = Number(parsed.emp_esic_monthly) || 0;
  const th = Number(parsed.take_home_monthly) || 0;
  const erpf = Number(parsed.er_pf_monthly) || 0;
  const eres = Number(parsed.er_esic_monthly) || 0;
  const gra = Number(parsed.gratuity_monthly) || 0;
  const len = Number(parsed.leave_encash_monthly) || 0;
  const med = Number(parsed.mediclaim_monthly) || 0;
  const lic = Number(parsed.lic_monthly) || 0;
  const spb = Number(parsed.special_perf_bonus_monthly) || 0;
  const bon = Number(parsed.bonus_monthly) || 0;
  const totb = Number(parsed.total_b_monthly) || 0;
  const ctc = Number(parsed.ctc_monthly) || 0;

  return {
    GROSS: gross,
    Gross: gross,
    BAS: bas,
    BASIC: bas,
    Basic: bas,
    HRA: hra,
    SPA: spa,
    SPECIAL_ALLOWANCE: spa,
    EPF: epf,
    PF_EMP: epf,
    PT: pt,
    EESI: eesi,
    ESIC_EMP: eesi,
    TH: th,
    ERPF: erpf,
    ERES: eres,
    GRA: gra,
    LEN: len,
    MED: med,
    LIC: lic,
    SPB: spb,
    BON: bon,
    TOTB: totb,
    CTC: ctc,
  };
}

/**
 * Evaluate a component formula against CTC vars (+ optional custom amounts already computed).
 * Returns rounded rupees; Manual / empty → null.
 */
export function evalComponentFormula(formulaText, parsed, extraVars = {}) {
  const text = String(formulaText || "").trim();
  if (!text || /^manual$/i.test(text)) return null;
  try {
    const vars = { ...buildCtcFormulaVars(parsed || {}), ...(extraVars || {}) };
    const ctx = {
      Gross: vars.GROSS,
      Basic: vars.BAS,
      PresentDays: 26,
      MonthDays: 26,
      PaidDays: 26,
      FixedAmount: 0,
      CTC: vars.CTC,
    };
    const value = evaluateFormula(text, ctx, vars);
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
  } catch (err) {
    console.warn("Component formula eval failed", formulaText, err);
    return null;
  }
}

export function validateComponentFormula(formulaText, knownCodes = []) {
  const text = String(formulaText || "").trim();
  if (!text || /^manual$/i.test(text)) return { ok: true, deps: [] };
  const aliases = [
    "GROSS",
    "BAS",
    "BASIC",
    "HRA",
    "SPA",
    "EPF",
    "PT",
    "EESI",
    "TH",
    "ERPF",
    "ERES",
    "GRA",
    "LEN",
    "MED",
    "LIC",
    "SPB",
    "BON",
    "TOTB",
    "CTC",
    "Gross",
    "Basic",
    ...knownCodes,
  ];
  return validateFormula(text, aliases);
}

/** Tree rows for UI (flat with depth). */
export function flattenComponentTree(components) {
  const list = [...(components || [])].filter(Boolean);
  list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const childrenOf = (code) => list.filter((c) => String(c.parent_code || "") === String(code || ""));
  const roots = list.filter((c) => !c.parent_code);
  const out = [];
  const placed = new Set();
  const walk = (nodes, depth) => {
    for (const c of nodes) {
      if (placed.has(c.code)) continue;
      placed.add(c.code);
      out.push({ ...c, depth });
      walk(childrenOf(c.code), depth + 1);
    }
  };
  walk(roots, 0);
  for (const c of list) {
    if (!placed.has(c.code)) {
      placed.add(c.code);
      out.push({ ...c, depth: 0 });
    }
  }
  return out;
}
