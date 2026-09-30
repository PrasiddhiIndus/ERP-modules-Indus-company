/**
 * Per-profile CTC formulas.
 * The company standard stays the default. A saved override applies only to that
 * employee’s CTC sheet. Salary accounts and other profiles are left alone.
 */

import { evaluateFormula, validateFormula } from "../../../modules/payroll/formula/evaluator";

export const FORMULA_OVERRIDE_EVENT = "ctc-formula-overrides-changed";
const STORAGE_KEY = "admin_ctc_profile_formula_overrides_v1";

export const CTC_FORMULA_LINES = [
  {
    part: "A",
    code: "GROSS",
    name: "Gross salary",
    locked: true,
    note: "Entered amount. The other lines calculate from this.",
  },
  { part: "A", code: "BAS", name: "Basic" },
  { part: "A", code: "HRA", name: "HRA" },
  { part: "A", code: "SPA", name: "Special allowance" },
  { part: "A", code: "EPF", name: "Employee PF" },
  { part: "A", code: "PT", name: "Professional tax" },
  { part: "A", code: "EESI", name: "Employee ESIC" },
  { part: "A", code: "TH", name: "Take home" },
  { part: "B", code: "ERPF", name: "Employer PF" },
  { part: "B", code: "ERES", name: "Employer ESIC" },
  { part: "B", code: "GRA", name: "Gratuity" },
  { part: "B", code: "LEN", name: "Leave encashment" },
  { part: "B", code: "MED", name: "Mediclaim", manual: true },
  { part: "B", code: "LIC", name: "LIC", manual: true },
  { part: "B", code: "SPB", name: "Special performance bonus", manual: true },
  { part: "B", code: "BON", name: "Bonus", manual: true },
  { part: "B", code: "TOTAL_B", name: "Total employer cost" },
  { part: "B", code: "CTC", name: "CTC" },
];

export const FORMULA_CODES = CTC_FORMULA_LINES.map((line) => line.code);

const KNOWN_CODES = [...FORMULA_CODES, "Gross", "Basic", "CTC"];

function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

export function canonFormula(text) {
  return String(text || "").replace(/\s+/g, "").toUpperCase();
}

export function isManualFormula(text) {
  return /^(MANUAL|ENTEREDAMOUNT)$/.test(canonFormula(text));
}

export function normalizeFormulaMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const line of CTC_FORMULA_LINES) {
    if (line.locked) continue;
    const text = String(raw[line.code] ?? "").trim();
    if (!text || isManualFormula(text)) continue;
    out[line.code] = text;
  }
  return out;
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store || {}));
  window.dispatchEvent(new Event(FORMULA_OVERRIDE_EVENT));
}

export function loadLocalFormulaOverrides(employeeId) {
  const row = readStore()[String(employeeId)];
  return normalizeFormulaMap(row);
}

export function localOverrideIdSet() {
  const ids = new Set();
  for (const [id, row] of Object.entries(readStore())) {
    if (Object.keys(normalizeFormulaMap(row)).length) ids.add(String(id));
  }
  return ids;
}

export function saveLocalFormulaOverrides(employeeId, overrides) {
  const key = String(employeeId);
  const store = readStore();
  const next = normalizeFormulaMap(overrides);
  if (Object.keys(next).length) store[key] = next;
  else delete store[key];
  writeStore(store);
  return next;
}

/** Saved profile formulas win over this browser when the salary record has them. */
export function resolveProfileFormulaOverrides(employeeId, dbJson) {
  const fromDb = normalizeFormulaMap(dbJson);
  if (Object.keys(fromDb).length) {
    const local = loadLocalFormulaOverrides(employeeId);
    const same =
      canonFormula(JSON.stringify(fromDb)) === canonFormula(JSON.stringify(local));
    if (!same) saveLocalFormulaOverrides(employeeId, fromDb);
    return fromDb;
  }
  return loadLocalFormulaOverrides(employeeId);
}

export function standardFormulas({
  esicCeiling = 41999,
  esicEmpRatePct = 0.75,
  esicErRatePct = 3.25,
} = {}) {
  const ceiling = Number(esicCeiling) > 0 ? Number(esicCeiling) : 41999;
  const empPct = Number(esicEmpRatePct) > 0 ? Number(esicEmpRatePct) : 0.75;
  const erPct = Number(esicErRatePct) > 0 ? Number(esicErRatePct) : 3.25;
  return {
    GROSS: "Entered amount",
    BAS: "MAX(GROSS * 50%, 15000)",
    HRA: "BAS * 40%",
    SPA: "MAX(GROSS - BAS - HRA, 0)",
    EPF: "MIN(BAS * 12%, 1800)",
    PT: "IF(GROSS >= 12000, 200, 0)",
    EESI: `IF(GROSS <= ${ceiling}, BAS * ${empPct}%, 0)`,
    TH: "GROSS - EPF - PT - EESI",
    ERPF: "MIN(BAS * 13%, 1950)",
    ERES: `IF(GROSS <= ${ceiling}, BAS * ${erPct}%, 0)`,
    GRA: "BAS * 4.81%",
    LEN: "BAS * 7 / 312",
    MED: "Manual",
    LIC: "Manual",
    SPB: "Manual",
    BON: "Manual",
    TOTAL_B: "ERPF + ERES + GRA + LEN + MED + LIC + SPB + BON",
    CTC: "GROSS + TOTAL_B",
  };
}

export function diffFromStandard(overrides, settings) {
  const standard = standardFormulas(settings);
  const next = {};
  for (const [code, text] of Object.entries(normalizeFormulaMap(overrides))) {
    if (canonFormula(text) === canonFormula(standard[code])) continue;
    next[code] = text;
  }
  return next;
}

export function validateProfileFormula(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || isManualFormula(trimmed)) return { ok: true };
  return validateFormula(trimmed, KNOWN_CODES);
}

function valuesFromStructure(structure) {
  return {
    GROSS: roundMoney(structure?.gross_monthly),
    BAS: roundMoney(structure?.basic_monthly),
    HRA: roundMoney(structure?.hra_monthly),
    SPA: roundMoney(structure?.special_allowance_monthly),
    EPF: roundMoney(structure?.emp_pf_monthly),
    PT: roundMoney(structure?.pt_monthly),
    EESI: roundMoney(structure?.emp_esic_monthly),
    TH: roundMoney(structure?.take_home_monthly),
    ERPF: roundMoney(structure?.er_pf_monthly),
    ERES: roundMoney(structure?.er_esic_monthly),
    GRA: roundMoney(structure?.gratuity_monthly),
    LEN: roundMoney(structure?.leave_encash_monthly),
    MED: roundMoney(structure?.mediclaim_monthly),
    LIC: roundMoney(structure?.lic_monthly),
    SPB: roundMoney(structure?.special_perf_bonus_monthly),
    BON: roundMoney(structure?.bonus_monthly),
    TOTAL_B: roundMoney(structure?.total_b_monthly),
    CTC: roundMoney(structure?.ctc_monthly),
  };
}

function evalMoney(formula, values) {
  const n = evaluateFormula(
    formula,
    { gross: values.GROSS, ctc: values.CTC },
    { ...values, Basic: values.BAS, Gross: values.GROSS }
  );
  return roundMoney(n);
}

function tryEval(formula, values) {
  if (!formula || isManualFormula(formula)) return null;
  try {
    return evalMoney(formula, values);
  } catch {
    return null;
  }
}

const CALC_ORDER = [
  "BAS",
  "HRA",
  "SPA",
  "EPF",
  "PT",
  "EESI",
  "ERPF",
  "ERES",
  "GRA",
  "LEN",
  "MED",
  "LIC",
  "SPB",
  "BON",
];

/**
 * Recompute a CTC structure with this profile’s formula overrides.
 * Typed amounts stay unless that line has its own formula, or an Auto line
 * must follow a changed Basic / HRA.
 */
export function applyProfileFormulaOverrides(structure, overrides, modes = {}) {
  if (!structure?.declared) return structure;
  const settings = {
    esicCeiling: structure.esic_ceiling,
    esicEmpRatePct: structure.esic_emp_rate_pct,
    esicErRatePct: structure.esic_er_rate_pct,
  };
  const diff = diffFromStandard(overrides, settings);
  if (!Object.keys(diff).length) return structure;

  const standard = standardFormulas(settings);
  const values = valuesFromStructure(structure);
  const changed = new Set(Object.keys(diff));

  const shouldCascade = (code) => {
    if (code === "HRA") return !modes.hraCustom && changed.has("BAS");
    if (code === "SPA") return changed.has("BAS") || changed.has("HRA");
    if (code === "EESI") {
      return Boolean(modes.esicEnabled) && !modes.empEsicCustom && changed.has("BAS");
    }
    if (code === "ERES") {
      return Boolean(modes.esicEnabled) && !modes.erEsicCustom && changed.has("BAS");
    }
    if (code === "GRA") return !modes.gratuityCustom && changed.has("BAS");
    if (code === "LEN") return !modes.leaveCustom && changed.has("BAS");
    return false;
  };

  for (const code of CALC_ORDER) {
    if (diff[code]) {
      const next = tryEval(diff[code], values);
      if (next != null) {
        values[code] = next;
        changed.add(code);
      }
      continue;
    }
    if (shouldCascade(code)) {
      const next = tryEval(standard[code], values);
      if (next != null) {
        values[code] = next;
        changed.add(code);
      }
    }
  }

  if (diff.TH) {
    const next = tryEval(diff.TH, values);
    if (next != null) values.TH = next;
  } else {
    values.TH = roundMoney(values.GROSS - values.EPF - values.PT - values.EESI);
  }

  if (diff.TOTAL_B) {
    const next = tryEval(diff.TOTAL_B, values);
    if (next != null) values.TOTAL_B = next;
  } else {
    values.TOTAL_B = roundMoney(
      values.ERPF +
        values.ERES +
        values.GRA +
        values.LEN +
        values.MED +
        values.LIC +
        values.SPB +
        values.BON
    );
  }

  if (diff.CTC) {
    const next = tryEval(diff.CTC, values);
    if (next != null) values.CTC = next;
  } else {
    values.CTC = roundMoney(values.GROSS + values.TOTAL_B);
  }

  const rawSpecial = roundMoney(values.GROSS - values.BAS - values.HRA);
  const structureInvalid = rawSpecial < -0.001;
  const structureWarn = structureInvalid
    ? `Basic and HRA are higher than Gross. Special allowance is held at zero until Gross is raised or the formula is adjusted.`
    : null;

  return {
    ...structure,
    basic_monthly: values.BAS,
    hra_monthly: values.HRA,
    special_allowance_monthly: values.SPA,
    emp_pf_monthly: values.EPF,
    pt_monthly: values.PT,
    emp_esic_monthly: values.EESI,
    take_home_monthly: values.TH,
    er_pf_monthly: values.ERPF,
    er_esic_monthly: values.ERES,
    gratuity_monthly: values.GRA,
    leave_encash_monthly: values.LEN,
    mediclaim_monthly: values.MED,
    mediclaim_enabled: Boolean(structure.mediclaim_enabled) || values.MED > 0,
    lic_monthly: values.LIC,
    lic_enabled: Boolean(structure.lic_enabled) || values.LIC > 0,
    special_perf_bonus_monthly: values.SPB,
    special_perf_bonus_enabled:
      Boolean(structure.special_perf_bonus_enabled) || values.SPB > 0,
    bonus_monthly: values.BON,
    total_b_monthly: values.TOTAL_B,
    ctc_monthly: values.CTC,
    ctc_annual: roundMoney(values.CTC * 12),
    structure_invalid: structureInvalid,
    structure_warn: structureWarn,
  };
}

export function previewFormulaValues(structure, overrides, modes) {
  const applied = applyProfileFormulaOverrides(structure, overrides, modes);
  return valuesFromStructure(applied?.declared ? applied : structure);
}
