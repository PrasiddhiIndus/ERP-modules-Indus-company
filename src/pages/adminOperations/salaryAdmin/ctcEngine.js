/**
 * Compensation Scheme (Annexure-I) calculation engine.
 *
 * Single shared service for CTC preview, save, payslip and reports. Pure functions only:
 * every rate comes from the rule version passed in (Payroll Rule Master), keyed by scheme
 * and effective date. Every component is rounded to the whole rupee where it is calculated;
 * totals (Gross, Take Home, Total B, CTC) are sums of the rounded components.
 *
 * Rule shape: { BENCH_SKILLED, BENCH_SEMI, BASIC_PCT, HRA_PCT, BONUS_PCT, MED_B2, MED_B3,
 *   BAND1_MAX, BAND2_MAX, BAND3_MAX, PF_THRESHOLD, EE_PF_PCT, EE_PF_FIXED, ER_PF_PCT,
 *   ER_PF_FIXED, ESIC_THRESHOLD, EE_ESIC_PCT, ER_ESIC_PCT, PT_MONTHLY, GRATUITY_PCT,
 *   EXGRATIA_CAP, MEDICLAIM_YEAR, LE_DAYS, LE_DIVISOR }
 * *_PCT values are percentages (50 = 50%).
 */

export const SKILL_SKILLED = "skilled";
export const SKILL_SEMI = "semi_skilled";

export const SCHEME_OLD = "old";
export const SCHEME_NEW = "new";

export const STATUS_PROBATION = "probation";
export const STATUS_CONFIRMED = "confirmed";

export const CATEGORY_EXISTING_CONFIRMED = "existing_confirmed";
export const CATEGORY_NEW_PROBATION = "new_probation";
export const CATEGORY_NEW_JOINER_NEW_SCHEME = "new_joiner_new_scheme";
export const CATEGORY_PROBATION_TO_CONFIRMED = "probation_to_confirmed";

export const RETAIN_GROSS = "retain_gross";
export const RETAIN_CTC = "retain_ctc";

export const INPUT_GROSS = "gross";
export const INPUT_CTC = "ctc";

export const VALIDATION_ERROR_GROSS_BELOW_MIN = "error_gross_below_min";
export const VALIDATION_CHECK_CTC_MISMATCH = "check_ctc_mismatch";
export const VALIDATION_OK_MEDICAL_RESTRICTED = "ok_medical_restricted";
export const VALIDATION_OK = "ok";

/** Components are whole rupees, so an entered CTC can only be matched to the nearest rupee step. */
export const CTC_TOLERANCE = 1;
const SUM_EPSILON = 0.005;

export const RULE_CODES = Object.freeze([
  "BENCH_SKILLED",
  "BENCH_SEMI",
  "BASIC_PCT",
  "HRA_PCT",
  "BONUS_PCT",
  "MED_B2",
  "MED_B3",
  "BAND1_MAX",
  "BAND2_MAX",
  "BAND3_MAX",
  "PF_THRESHOLD",
  "EE_PF_PCT",
  "EE_PF_FIXED",
  "ER_PF_PCT",
  "ER_PF_FIXED",
  "ESIC_THRESHOLD",
  "EE_ESIC_PCT",
  "ER_ESIC_PCT",
  "PT_MONTHLY",
  "GRATUITY_PCT",
  "EXGRATIA_CAP",
  "MEDICLAIM_YEAR",
  "LE_DAYS",
  "LE_DIVISOR",
]);

/** Seed values for the 2026-27 Compensation Scheme. Used to seed the Rule Master only. */
export const SEED_RULES_2026_27 = Object.freeze({
  BENCH_SKILLED: 13585,
  BENCH_SEMI: 13325,
  BASIC_PCT: 50,
  HRA_PCT: 40,
  BONUS_PCT: 8.33,
  MED_B2: 2500,
  MED_B3: 5000,
  BAND1_MAX: 18136,
  BAND2_MAX: 30000,
  BAND3_MAX: 49999,
  PF_THRESHOLD: 25000,
  EE_PF_PCT: 12,
  EE_PF_FIXED: 3000,
  ER_PF_PCT: 13,
  ER_PF_FIXED: 3250,
  ESIC_THRESHOLD: 21000,
  EE_ESIC_PCT: 0.75,
  ER_ESIC_PCT: 3.75,
  PT_MONTHLY: 200,
  GRATUITY_PCT: 4.81,
  EXGRATIA_CAP: 20000,
  MEDICLAIM_YEAR: 5000,
  LE_DAYS: 7,
  LE_DIVISOR: 26,
});

export const PART_A_KEYS = Object.freeze([
  "basic",
  "hra",
  "conveyance",
  "bonus",
  "medical",
  "special",
]);

export const PART_B_KEYS = Object.freeze([
  "er_pf",
  "er_esic",
  "mediclaim",
  "leave_encashment",
  "gratuity",
  "ex_gratia",
]);

export const DEDUCTION_KEYS = Object.freeze(["ee_pf", "pt", "ee_esic"]);

/** Components that accept a custom value. Totals are never entered; they stay sums. */
export const OVERRIDE_KEYS = Object.freeze([...PART_A_KEYS, ...DEDUCTION_KEYS, ...PART_B_KEYS]);

/** Annexure-I row order (monthly values; P.A. = monthly × 12). */
export const ANNEXURE_ROWS = Object.freeze([
  { key: "basic", label: "Basic" },
  { key: "hra", label: "HRA" },
  { key: "conveyance", label: "Conveyance Allowance" },
  { key: "bonus", label: "Advance Against Statutory Bonus" },
  { key: "medical", label: "Medical Allowance" },
  { key: "special", label: "Special Allowance" },
  { key: "gross", label: "GROSS (PART A)", total: true },
  { key: "ee_pf", label: "Less: Employee PF" },
  { key: "pt", label: "Less: P.Tax" },
  { key: "ee_esic", label: "Less: Employee ESIC" },
  { key: "take_home", label: "TAKE HOME", total: true },
  { key: null, label: "PART-B", heading: true },
  { key: "er_pf", label: "ADD: Employer PF" },
  { key: "er_esic", label: "ADD: Employer ESIC" },
  { key: "mediclaim", label: "ADD: Mediclaim" },
  { key: "leave_encashment", label: "ADD: Leave Encashment" },
  { key: "gratuity", label: "ADD: Gratuity (As per Govt. Rules)" },
  { key: "ex_gratia", label: "ADD: Ex Gratia" },
  { key: "total_b", label: "Total (B)", total: true },
  { key: "ctc", label: "CTC (PART A + B)", total: true },
]);

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pct(rules, code) {
  return Number(rules[code]) / 100;
}

export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Whole rupee, half rounds up. */
export function roundRupee(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const r = Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
  return r === 0 ? 0 : r;
}

/** Throws when the rule version is missing a value, so a screen never computes on partial rules. */
export function assertRules(rules) {
  if (!rules || typeof rules !== "object") {
    throw new Error("Payroll rules are not loaded for this date.");
  }
  const missing = RULE_CODES.filter((code) => num(rules[code]) == null);
  if (missing.length) {
    throw new Error(`Payroll rules are incomplete (${missing.join(", ")}).`);
  }
  if (Number(rules.BASIC_PCT) <= 0 || Number(rules.LE_DIVISOR) <= 0) {
    throw new Error("Payroll rules have an invalid Basic % or Leave Encashment divisor.");
  }
}

export function normalizeSkill(skill) {
  const s = String(skill || "").toLowerCase().replace(/[\s-]+/g, "_");
  return s === SKILL_SEMI || s === "semi" || s === "semiskilled" ? SKILL_SEMI : SKILL_SKILLED;
}

export function normalizeStatus(status) {
  return String(status || "").toLowerCase() === STATUS_CONFIRMED
    ? STATUS_CONFIRMED
    : STATUS_PROBATION;
}

export function normalizeScheme(scheme) {
  return String(scheme || "").toLowerCase().startsWith("new") ? SCHEME_NEW : SCHEME_OLD;
}

export function schemeLabel(scheme) {
  return normalizeScheme(scheme) === SCHEME_NEW ? "New Scheme" : "Old Scheme";
}

export function benchmarkFor(rules, skill) {
  return normalizeSkill(skill) === SKILL_SEMI
    ? Number(rules.BENCH_SEMI)
    : Number(rules.BENCH_SKILLED);
}

/** Gross at or below which Basic stays at the benchmark. */
export function benchmarkLimit(rules, skill) {
  return benchmarkFor(rules, skill) / pct(rules, "BASIC_PCT");
}

/** Lowest Gross that can fund Basic + HRA + Bonus at the benchmark (Bands 2/3). */
export function minimumValidGross(rules, skill) {
  const bench = roundRupee(benchmarkFor(rules, skill));
  return bench + roundRupee(bench * pct(rules, "HRA_PCT")) + roundRupee(bench * pct(rules, "BONUS_PCT"));
}

export function salaryBand(rules, gross) {
  const g = Number(gross);
  if (g <= Number(rules.BAND1_MAX)) return 1;
  if (g <= Number(rules.BAND2_MAX)) return 2;
  if (g <= Number(rules.BAND3_MAX)) return 3;
  return 4;
}

export function basicFromGross(rules, skill, gross) {
  const bench = benchmarkFor(rules, skill);
  const g = Number(gross);
  return g <= benchmarkLimit(rules, skill) ? bench : g * pct(rules, "BASIC_PCT");
}

/** Deductions and Part B depend only on Basic and confirmation status. */
export function statutoryFromBasic(rules, basic, status) {
  const b = Number(basic) || 0;
  const conf = normalizeStatus(status) === STATUS_CONFIRMED ? 1 : 0;
  const overPf = b > Number(rules.PF_THRESHOLD);
  const noEsic = b > Number(rules.ESIC_THRESHOLD);

  const R = roundRupee;
  const ee_pf = R(overPf ? Number(rules.EE_PF_FIXED) : b * pct(rules, "EE_PF_PCT"));
  const pf_wage = R(
    overPf && pct(rules, "EE_PF_PCT") > 0 ? Number(rules.EE_PF_FIXED) / pct(rules, "EE_PF_PCT") : b
  );
  const pt = R(Number(rules.PT_MONTHLY));
  const ee_esic = R(noEsic ? 0 : b * pct(rules, "EE_ESIC_PCT"));

  const er_pf = R(overPf ? Number(rules.ER_PF_FIXED) : b * pct(rules, "ER_PF_PCT"));
  const er_esic = R(noEsic ? 0 : b * pct(rules, "ER_ESIC_PCT"));
  const mediclaim = R((conf * Number(rules.MEDICLAIM_YEAR)) / 12);
  const leave_encashment = R(
    (((conf * b) / Number(rules.LE_DIVISOR)) * Number(rules.LE_DAYS)) / 12
  );
  const gratuity = R(b * pct(rules, "GRATUITY_PCT"));
  const ex_gratia = R(Math.min(b, Number(rules.EXGRATIA_CAP)) / 12);
  const total_b = er_pf + er_esic + mediclaim + leave_encashment + gratuity + ex_gratia;

  return { ee_pf, pf_wage, pt, ee_esic, er_pf, er_esic, mediclaim, leave_encashment, gratuity, ex_gratia, total_b };
}

/** Section 3.2 — full breakup from Monthly Gross. */
export function componentsFromGross(rules, { skill, status, gross }) {
  assertRules(rules);
  const g = roundRupee(Number(gross) || 0);
  const band = salaryBand(rules, g);
  const midBand = band === 2 || band === 3;

  const basic = roundRupee(basicFromGross(rules, skill, g));
  const hra = roundRupee(basic * pct(rules, "HRA_PCT"));
  const bonus = midBand ? roundRupee(basic * pct(rules, "BONUS_PCT")) : 0;
  const bandMedical = roundRupee(
    band === 2 ? Number(rules.MED_B2) : band === 3 ? Number(rules.MED_B3) : 0
  );
  const medical = midBand
    ? Math.min(bandMedical, roundRupee(Number(rules.MED_B3)), Math.max(0, g - basic - hra - bonus))
    : 0;
  const special = band === 4 ? g - basic - hra : 0;
  const conveyance = midBand ? Math.max(0, g - basic - hra - bonus - medical) : 0;

  return assembleBreakup(rules, {
    skill,
    status,
    band,
    gross_input: g,
    band_medical: bandMedical,
    parts: { basic, hra, conveyance, bonus, medical, special },
  });
}

function assembleBreakup(
  rules,
  { skill, status, band, gross_input, band_medical, parts, statOverrides = null }
) {
  const sumPartA = PART_A_KEYS.reduce((s, k) => s + (Number(parts[k]) || 0), 0);
  const stat = { ...statutoryFromBasic(rules, parts.basic, status), ...(statOverrides || {}) };
  stat.total_b = PART_B_KEYS.reduce((s, k) => s + (Number(stat[k]) || 0), 0);
  const take_home = sumPartA - stat.ee_pf - stat.pt - stat.ee_esic;
  const ctc = sumPartA + stat.total_b;
  return {
    skill: normalizeSkill(skill),
    status: normalizeStatus(status),
    band,
    band_medical,
    gross_input,
    ...parts,
    gross: sumPartA,
    sum_part_a: sumPartA,
    ...stat,
    take_home,
    ctc,
  };
}

/** Section 3.3 — exact piecewise-linear solve of Gross from Monthly CTC. */
export function grossFromCtc(rules, { skill, status, ctc }) {
  assertRules(rules);
  const target = Number(ctc) || 0;
  const bench = benchmarkFor(rules, skill);
  const basicPct = pct(rules, "BASIC_PCT");
  const conf = normalizeStatus(status) === STATUS_CONFIRMED ? 1 : 0;

  const gf = target - statutoryFromBasic(rules, bench, status).total_b;
  const gfValid = gf <= benchmarkLimit(rules, skill);

  const candidates = [];
  for (const pf of [0, 1]) {
    for (const es of [0, 1]) {
      for (const cap of [0, 1]) {
        const constant =
          pf * Number(rules.ER_PF_FIXED) +
          (cap * Number(rules.EXGRATIA_CAP)) / 12 +
          (conf * Number(rules.MEDICLAIM_YEAR)) / 12;
        const slope =
          (1 - pf) * pct(rules, "ER_PF_PCT") +
          (1 - es) * pct(rules, "ER_ESIC_PCT") +
          pct(rules, "GRATUITY_PCT") +
          (1 - cap) / 12 +
          (conf * Number(rules.LE_DAYS)) / (Number(rules.LE_DIVISOR) * 12);
        const g = (target - constant) / (1 + basicPct * slope);
        const basic = g * basicPct;
        const valid =
          g > Number(rules.BAND1_MAX) &&
          basic >= bench &&
          (basic > Number(rules.PF_THRESHOLD)) === Boolean(pf) &&
          (basic > Number(rules.ESIC_THRESHOLD)) === Boolean(es) &&
          (basic > Number(rules.EXGRATIA_CAP)) === Boolean(cap);
        if (valid) candidates.push(g);
      }
    }
  }

  if (candidates.length) {
    return { gross: Math.max(...candidates), segment: "percentage" };
  }
  return { gross: gf, segment: "benchmark", benchmark_valid: gfValid };
}

/** Section 3.4 — first applicable validation status. */
export function validateBreakup(rules, breakup, { inputBasis, inputAmount } = {}) {
  const minGross = minimumValidGross(rules, breakup.skill);
  if (Math.abs(breakup.sum_part_a - breakup.gross_input) > SUM_EPSILON) {
    return {
      code: VALIDATION_ERROR_GROSS_BELOW_MIN,
      level: "error",
      blocksSave: true,
      label: "ERROR – Gross below minimum",
      message: `Gross is too low to cover Basic, HRA and Bonus. Minimum Gross is ₹${formatMoney(minGross)}.`,
      minimum_gross: minGross,
    };
  }
  if (inputBasis === INPUT_CTC) {
    const diff = breakup.ctc - Number(inputAmount);
    if (Math.abs(diff) > CTC_TOLERANCE) {
      return {
        code: VALIDATION_CHECK_CTC_MISMATCH,
        level: "warning",
        blocksSave: false,
        label: "CHECK – CTC does not reconcile",
        message: `Calculated CTC differs from the entered CTC by ₹${formatMoney(diff)}.`,
        ctc_difference: diff,
      };
    }
  }
  if ((breakup.band === 2 || breakup.band === 3) && breakup.medical < breakup.band_medical - SUM_EPSILON) {
    return {
      code: VALIDATION_OK_MEDICAL_RESTRICTED,
      level: "ok",
      blocksSave: false,
      label: "OK – Medical restricted",
      message: `Medical Allowance restricted to ₹${formatMoney(breakup.medical)} (band amount ₹${formatMoney(breakup.band_medical)}).`,
    };
  }
  return {
    code: VALIDATION_OK,
    level: "ok",
    blocksSave: false,
    label: "OK",
    message: "Breakup matches Gross and the CTC reconciles.",
  };
}

/**
 * Whole-rupee Gross near the exact solve whose rounded breakup lands closest to the entered CTC
 * (a valid breakup first, then the smallest CTC gap, then the Gross nearest the exact solve).
 */
function nearestRupeeBreakup(rules, { skill, status, exactGross, ctc }) {
  let best = null;
  for (let g = Math.floor(exactGross) - 3; g <= Math.ceil(exactGross) + 3; g += 1) {
    if (g <= 0) continue;
    const b = componentsFromGross(rules, { skill, status, gross: g });
    const rank = [
      Math.abs(b.sum_part_a - b.gross_input) > SUM_EPSILON ? 1 : 0,
      Math.abs(b.ctc - ctc),
      Math.abs(g - exactGross),
    ];
    const better =
      !best ||
      rank[0] < best.rank[0] ||
      (rank[0] === best.rank[0] &&
        (rank[1] < best.rank[1] - SUM_EPSILON ||
          (Math.abs(rank[1] - best.rank[1]) <= SUM_EPSILON && rank[2] < best.rank[2])));
    if (better) best = { b, rank };
  }
  return best ? best.b : componentsFromGross(rules, { skill, status, gross: exactGross });
}

/**
 * Main entry point. Either monthlyGross or monthlyCtc; Gross wins when both are given.
 * Returns the breakup plus the calculation check and validation status.
 */
export function calculateCtc(rules, { skill, status, monthlyGross, monthlyCtc } = {}) {
  assertRules(rules);
  const g = num(monthlyGross);
  const c = num(monthlyCtc);
  const useGross = g != null && g > 0;
  if (!useGross && !(c != null && c > 0)) {
    throw new Error("Enter a Monthly CTC or Monthly Gross.");
  }

  let breakup;
  let segment = null;
  if (useGross) {
    breakup = componentsFromGross(rules, { skill, status, gross: g });
  } else {
    const solved = grossFromCtc(rules, { skill, status, ctc: c });
    segment = solved.segment;
    breakup = nearestRupeeBreakup(rules, { skill, status, exactGross: solved.gross, ctc: c });
  }

  const inputBasis = useGross ? INPUT_GROSS : INPUT_CTC;
  const inputAmount = useGross ? g : c;
  const validation = validateBreakup(rules, breakup, { inputBasis, inputAmount });

  return {
    ...breakup,
    input_basis: inputBasis,
    input_amount: inputAmount,
    segment,
    check: {
      input_basis: inputBasis,
      input_amount: inputAmount,
      sum_part_a: breakup.sum_part_a,
      gross_used: breakup.gross_input,
      calculated_ctc: breakup.ctc,
      ctc_difference: inputBasis === INPUT_CTC ? breakup.ctc - c : 0,
    },
    validation,
  };
}

/**
 * Section 6.1 — custom component values. Any Part A, deduction or Part B component may be
 * entered; components left blank keep their normal calculation (deductions and Part B from the
 * possibly overridden Basic). Totals stay sums: Gross = Part A, Take Home = Gross − deductions,
 * Total B = Part B, CTC = Gross + Total B. System values are kept for display.
 */
export function applyComponentOverrides(rules, systemResult, overrides = {}) {
  assertRules(rules);
  const entered = (key) => {
    const v = num(overrides?.[key]);
    return v == null ? null : roundRupee(v);
  };

  const applied = {};
  const systemValues = {};
  const parts = {};
  for (const key of PART_A_KEYS) {
    const v = entered(key);
    if (v != null && Math.abs(v - systemResult[key]) > SUM_EPSILON) {
      applied[key] = v;
      systemValues[key] = systemResult[key];
    }
    parts[key] = applied[key] ?? systemResult[key];
  }

  const statSystem = statutoryFromBasic(rules, parts.basic, systemResult.status);
  const statOverrides = {};
  for (const key of [...DEDUCTION_KEYS, ...PART_B_KEYS]) {
    const v = entered(key);
    if (v != null && Math.abs(v - statSystem[key]) > SUM_EPSILON) {
      applied[key] = v;
      statOverrides[key] = v;
      systemValues[key] = statSystem[key];
    }
  }

  const systemReference = {};
  for (const key of PART_A_KEYS) systemReference[key] = systemResult[key];
  for (const key of [...DEDUCTION_KEYS, ...PART_B_KEYS]) systemReference[key] = statSystem[key];

  if (!Object.keys(applied).length) {
    return {
      ...systemResult,
      is_custom: false,
      overrides: {},
      system_values: null,
      system_reference: systemReference,
    };
  }
  const gross = PART_A_KEYS.reduce((s, k) => s + parts[k], 0);
  const breakup = assembleBreakup(rules, {
    skill: systemResult.skill,
    status: systemResult.status,
    band: salaryBand(rules, gross),
    gross_input: gross,
    band_medical: systemResult.band_medical,
    parts,
    statOverrides,
  });
  return {
    ...systemResult,
    ...breakup,
    input_basis: INPUT_GROSS,
    input_amount: gross,
    check: {
      input_basis: INPUT_GROSS,
      input_amount: gross,
      sum_part_a: gross,
      gross_used: gross,
      calculated_ctc: breakup.ctc,
      ctc_difference: 0,
    },
    validation: {
      code: VALIDATION_OK,
      level: "ok",
      blocksSave: false,
      label: "OK – Custom",
      message: "Components were entered manually.",
    },
    is_custom: true,
    overrides: applied,
    system_values: systemValues,
    system_reference: systemReference,
  };
}

/** Save is blocked when an override has no reason. */
export function validateCustomOverride({ overrides, reason }) {
  const any = Object.values(overrides || {}).some((v) => num(v) != null);
  if (any && !String(reason || "").trim()) {
    return { ok: false, message: "Enter a reason for the manual component values." };
  }
  return { ok: true };
}

/** Section 1 lifecycle categories → status, scheme and whether Mediclaim + Leave Encashment apply. */
export function resolveCategory(category, selectedScheme, schemeAfterConfirmation) {
  const scheme = normalizeScheme(selectedScheme);
  switch (category) {
    case CATEGORY_EXISTING_CONFIRMED:
      return { status: STATUS_CONFIRMED, scheme, schemeLocked: false, benefits: "ON" };
    case CATEGORY_NEW_JOINER_NEW_SCHEME:
      return { status: STATUS_PROBATION, scheme: SCHEME_NEW, schemeLocked: true, benefits: "OFF" };
    case CATEGORY_PROBATION_TO_CONFIRMED: {
      const after =
        !schemeAfterConfirmation || schemeAfterConfirmation === "same"
          ? scheme
          : normalizeScheme(schemeAfterConfirmation);
      return {
        status: STATUS_PROBATION,
        statusAfter: STATUS_CONFIRMED,
        scheme,
        schemeAfter: after,
        schemeLocked: false,
        benefits: "OFF → ON",
      };
    }
    case CATEGORY_NEW_PROBATION:
    default:
      return { status: STATUS_PROBATION, scheme, schemeLocked: false, benefits: "OFF" };
  }
}

/**
 * Section 4.4 — Probation → Confirmed. rulesBefore / rulesAfter are the rule versions for the
 * scheme before and after confirmation (identical today, but keyed separately).
 */
export function calculateConfirmation({
  rulesBefore,
  rulesAfter,
  skill,
  monthlyGross,
  monthlyCtc,
  retain = RETAIN_GROSS,
}) {
  const before = calculateCtc(rulesBefore, {
    skill,
    status: STATUS_PROBATION,
    monthlyGross,
    monthlyCtc,
  });
  const after =
    retain === RETAIN_CTC
      ? calculateCtc(rulesAfter, { skill, status: STATUS_CONFIRMED, monthlyCtc: before.ctc })
      : calculateCtc(rulesAfter, { skill, status: STATUS_CONFIRMED, monthlyGross: before.gross });
  const change = {};
  for (const row of ANNEXURE_ROWS) {
    if (row.key) change[row.key] = (after[row.key] || 0) - (before[row.key] || 0);
  }
  return { before, after, change };
}

/** Monthly → P.A. for every Annexure row. */
export function annualize(result) {
  const out = {};
  for (const row of ANNEXURE_ROWS) {
    if (row.key) out[row.key] = (Number(result?.[row.key]) || 0) * 12;
  }
  return out;
}

function toDay(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Only one CTC record may be active on any date. Existing records close automatically when the
 * next one starts, so a new record must start after every existing record's start and must not
 * fall inside an explicitly closed period. Rejected records are ignored.
 */
export function findOverlappingRecord(existing, candidate) {
  const from = toDay(candidate?.effective_from);
  if (!from) return { id: null, message: "Effective From date is required." };
  const to = toDay(candidate?.effective_to);
  for (const rec of existing || []) {
    if (!rec || rec.id === candidate.id || rec.approval_status === "rejected") continue;
    const rFrom = toDay(rec.effective_from);
    const rTo = toDay(rec.effective_to);
    if (!rFrom) continue;
    const startsInside = from >= rFrom && (!rTo || from <= rTo) && !(rTo == null && from > rFrom);
    const coversExisting = from <= rFrom && (!to || to >= rFrom);
    if (startsInside || coversExisting) {
      return {
        id: rec.id,
        message: `Dates overlap an existing CTC record effective from ${rFrom}${rTo ? ` to ${rTo}` : ""}.`,
      };
    }
  }
  return null;
}

function formatMoney(n) {
  return roundRupee(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
