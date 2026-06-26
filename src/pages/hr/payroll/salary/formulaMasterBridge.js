import { loadFormulaGroups } from './formulaLibraryStorage';

/** Machine-readable default formulas keyed by payroll component_code. */
export const DEFAULT_MASTER_FORMULAS = {
  GROSS: 'Gross',
  BASIC: 'Gross * 40%',
  HRA: 'Basic * 50%',
  SPECIAL_ALLOWANCE: 'Gross - BASIC - HRA',
  PF_EMP: 'min(BASIC * 12%, 1800)',
  ESIC_EMP: 'Gross * 0.75%',
  PT: 'FixedAmount',
  TDS: '0',
  LOAN: '0',
  NET: 'GROSS - PF_EMP - ESIC_EMP - PT - TDS - LOAN',
};

/** Map formula-library item names → component_code (case-insensitive). */
const NAME_TO_COMPONENT = {
  'gross earning': 'GROSS',
  'gross wages': 'GROSS',
  'earned basic': 'BASIC',
  basic: 'BASIC',
  'earned house rent': 'HRA',
  hra: 'HRA',
  'other allowance': 'SPECIAL_ALLOWANCE',
  'special allowance': 'SPECIAL_ALLOWANCE',
  pf: 'PF_EMP',
  esic: 'ESIC_EMP',
  'professional tax': 'PT',
  tds: 'TDS',
  loan: 'LOAN',
  'salary advance': 'LOAN',
  'net earning': 'NET',
  'net pay': 'NET',
};

function normalizeFormulaText(text) {
  return String(text || '')
    .trim()
    .replace(/\s*×\s*/g, ' * ')
    .replace(/\s*÷\s*/g, ' / ')
    .replace(/\s*−\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

function isMachineFormula(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return /[+\-*/()]|round\(|prorate\(|min\(|max\(|if\(/i.test(t) || /^[A-Za-z_][A-Za-z0-9_]*$/.test(t);
}

/**
 * Build master component formulas from Formula Library groups + defaults.
 * Site setup uses this as the baseline; site overrides are stored separately.
 */
export function buildMasterComponentFormulas(formulaGroups, components = []) {
  const map = { ...DEFAULT_MASTER_FORMULAS };

  const compByName = new Map(
    components.map((c) => [String(c.component_name || '').trim().toLowerCase(), c.component_code])
  );

  for (const group of formulaGroups || []) {
    for (const item of group.items || []) {
      const code =
        item.componentCode ||
        NAME_TO_COMPONENT[String(item.name || '').trim().toLowerCase()] ||
        compByName.get(String(item.name || '').trim().toLowerCase());
      if (!code) continue;

      const candidate = item.formulaText || item.expression;
      if (isMachineFormula(candidate)) {
        map[code] = normalizeFormulaText(candidate);
      }
    }
  }

  return map;
}

export function loadMasterComponentFormulas(components = []) {
  return buildMasterComponentFormulas(loadFormulaGroups(), components);
}

/** Site-specific overrides win; master fills gaps. */
export function mergeMasterAndSiteFormulas(masterFormulas, siteOverrides = {}) {
  const merged = { ...masterFormulas };
  Object.entries(siteOverrides).forEach(([code, text]) => {
    const trimmed = String(text || '').trim();
    if (trimmed) merged[code] = trimmed;
  });
  return merged;
}

/** Only persist components that differ from master (keeps All Formulas list unchanged). */
export function extractSiteOverrides(masterFormulas, workingFormulas) {
  const overrides = {};
  Object.entries(workingFormulas).forEach(([code, text]) => {
    const working = String(text || '').trim();
    const master = String(masterFormulas[code] || '').trim();
    if (working && working !== master) {
      overrides[code] = working;
    }
  });
  return overrides;
}

export function parseSiteFormulaSet(set) {
  const overrides = {};
  (set?.components || []).forEach((row) => {
    const code = row.component_code?.trim();
    const text = row.formula_text?.trim();
    if (code && text) overrides[code] = text;
  });
  return overrides;
}

export function toSiteFormulaRows(overrides) {
  return Object.entries(overrides)
    .filter(([, text]) => text?.trim())
    .map(([component_code, formula_text]) => ({
      component_code,
      formula_text: formula_text.trim(),
      is_enabled: true,
    }));
}

export function toFormulaArray(mergedFormulas) {
  return Object.entries(mergedFormulas)
    .filter(([, text]) => text?.trim())
    .map(([component_code, formula_text]) => ({
      component_code,
      formula_text: formula_text.trim(),
      is_enabled: true,
    }));
}

export function isSiteOverride(masterFormulas, code, text) {
  const working = String(text || '').trim();
  const master = String(masterFormulas[code] || '').trim();
  return Boolean(working && working !== master);
}
