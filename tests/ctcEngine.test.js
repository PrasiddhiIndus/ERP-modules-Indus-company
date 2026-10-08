import { describe, it, expect } from "vitest";
import {
  SEED_RULES_2026_27,
  SCHEME_NEW,
  SCHEME_OLD,
  STATUS_CONFIRMED,
  STATUS_PROBATION,
  CATEGORY_NEW_JOINER_NEW_SCHEME,
  CATEGORY_EXISTING_CONFIRMED,
  CATEGORY_PROBATION_TO_CONFIRMED,
  OVERRIDE_KEYS,
  PART_A_KEYS,
  PART_B_KEYS,
  RETAIN_CTC,
  RETAIN_GROSS,
  VALIDATION_CHECK_CTC_MISMATCH,
  VALIDATION_ERROR_GROSS_BELOW_MIN,
  VALIDATION_OK,
  VALIDATION_OK_MEDICAL_RESTRICTED,
  applyComponentOverrides,
  benchmarkLimit,
  calculateConfirmation,
  calculateCtc,
  findOverlappingRecord,
  minimumValidGross,
  resolveCategory,
  roundRupee,
  validateCustomOverride,
} from "../src/pages/adminOperations/salaryAdmin/ctcEngine.js";

const TOL = 0.0001;
const rulesByScheme = { [SCHEME_OLD]: { ...SEED_RULES_2026_27 }, [SCHEME_NEW]: { ...SEED_RULES_2026_27 } };
const skill = "skilled";

function expectClose(actual, expected, tol = TOL) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

function expectBreakup(result, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === "number") {
      try {
        expectClose(result[key], value);
      } catch {
        throw new Error(`${key}: expected ${value}, got ${result[key]}`);
      }
    } else {
      expect(result[key]).toBe(value);
    }
  }
}

const MONEY_KEYS = [...PART_A_KEYS, "gross", "ee_pf", "pt", "ee_esic", "take_home", ...PART_B_KEYS, "total_b", "ctc"];

function expectWholeRupees(result) {
  for (const key of MONEY_KEYS) {
    if (!Number.isInteger(result[key])) throw new Error(`${key} is not a whole rupee: ${result[key]}`);
  }
}

function expectSums(r) {
  expect(r.gross).toBe(PART_A_KEYS.reduce((s, k) => s + r[k], 0));
  expect(r.take_home).toBe(r.gross - r.ee_pf - r.pt - r.ee_esic);
  expect(r.total_b).toBe(PART_B_KEYS.reduce((s, k) => s + r[k], 0));
  expect(r.ctc).toBe(r.gross + r.total_b);
}

const CASE1 = {
  band: 3,
  basic: 17000,
  hra: 6800,
  conveyance: 3784,
  bonus: 1416,
  medical: 5000,
  special: 0,
  gross: 34000,
  ee_pf: 2040,
  pt: 200,
  ee_esic: 128,
  take_home: 31632,
  er_pf: 2210,
  er_esic: 638,
  mediclaim: 0,
  leave_encashment: 0,
  gratuity: 818,
  ex_gratia: 1417,
  total_b: 5083,
  ctc: 39083,
};

describe("whole-rupee rounding", () => {
  it("rounds half up to the rupee", () => {
    expect(roundRupee(127.5)).toBe(128);
    expect(roundRupee(1416.67)).toBe(1417);
    expect(roundRupee(381.41)).toBe(381);
    expect(roundRupee(0)).toBe(0);
  });
});

describe.each([SCHEME_OLD, SCHEME_NEW])("Compensation Scheme 2026-27 (%s scheme)", (scheme) => {
  const rules = rulesByScheme[scheme];

  it("derived values: benchmark limits and minimum Gross", () => {
    expectClose(benchmarkLimit(rules, "skilled"), 27170);
    expectClose(benchmarkLimit(rules, "semi_skilled"), 26650);
    expectClose(minimumValidGross(rules, "skilled"), 20151);
  });

  it("#1 Gross 34,000 Probation", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 34000 });
    expectBreakup(r, CASE1);
    expectWholeRupees(r);
    expectSums(r);
    expect(r.validation.code).toBe(VALIDATION_OK);
  });

  it("#2 CTC 39,083 Probation reverses to Gross 34,000", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyCtc: 39083 });
    expectBreakup(r, CASE1);
    expect(r.input_basis).toBe("ctc");
    expect(r.validation.code).toBe(VALIDATION_OK);
  });

  it("a CTC between rupee steps lands within ₹1 and still reconciles", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyCtc: 39081.87 });
    expectWholeRupees(r);
    expectSums(r);
    expectClose(r.ctc, 39081.87, 1);
    expect(r.validation.code).not.toBe(VALIDATION_CHECK_CTC_MISMATCH);
  });

  it("#3 Gross 34,000 Confirmed", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_CONFIRMED, monthlyGross: 34000 });
    expectBreakup(r, {
      ...CASE1,
      mediclaim: 0,
      leave_encashment: 381,
      total_b: 5464,
      ctc: 39464,
    });
    expectSums(r);
  });

  it("ESIC up to Basic 21,000; Mediclaim (Confirmed) only above it — Gross unchanged", () => {
    const atLimit = calculateCtc(rules, { skill, status: STATUS_CONFIRMED, monthlyGross: 42000 });
    expectBreakup(atLimit, { basic: 21000, gross: 42000, ee_esic: 158, er_esic: 788, mediclaim: 0 });
    const above = calculateCtc(rules, { skill, status: STATUS_CONFIRMED, monthlyGross: 42002 });
    expectBreakup(above, { basic: 21001, gross: 42002, ee_esic: 0, er_esic: 0, mediclaim: 417 });
    const probation = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 42002 });
    expectBreakup(probation, { ee_esic: 0, er_esic: 0, mediclaim: 0 });
  });

  it("#4 Probation → Confirmed, Retain Gross", () => {
    const { before, after, change } = calculateConfirmation({
      rulesBefore: rules,
      rulesAfter: rules,
      skill,
      monthlyGross: 34000,
      retain: RETAIN_GROSS,
    });
    expectBreakup(before, CASE1);
    expectBreakup(after, { ...CASE1, mediclaim: 0, leave_encashment: 381, total_b: 5464, ctc: 39464 });
    expectClose(change.ctc, 381);
    expectClose(change.take_home, 0);
  });

  it("#5 Probation → Confirmed, Retain CTC", () => {
    const { after } = calculateConfirmation({
      rulesBefore: rules,
      rulesAfter: rules,
      skill,
      monthlyGross: 34000,
      retain: RETAIN_CTC,
    });
    expectClose(after.ctc, 39083, 1);
    expectClose(after.gross, 33672, 1);
    expectWholeRupees(after);
    expectSums(after);
  });

  it("#6 CTC 26,173 Probation — Medical restricted", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyCtc: 26173 });
    expectBreakup(r, {
      band: 2,
      gross: 22113,
      basic: 13585,
      hra: 5434,
      bonus: 1132,
      medical: 1962,
      conveyance: 0,
      take_home: 20181,
      total_b: 4060,
      ctc: 26173,
    });
    expect(r.validation.code).toBe(VALIDATION_OK_MEDICAL_RESTRICTED);
    expect(r.validation.label).toBe("OK – Medical restricted");
  });

  it("#7 CTC 26,173 Confirmed", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_CONFIRMED, monthlyCtc: 26173 });
    expectBreakup(r, {
      gross: 21808,
      medical: 1657,
      mediclaim: 0,
      leave_encashment: 305,
      total_b: 4365,
      ctc: 26173,
    });
    expect(r.validation.code).toBe(VALIDATION_OK_MEDICAL_RESTRICTED);
  });

  it("#8 Gross 70,000 Probation — Band 4", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 70000 });
    expectBreakup(r, {
      band: 4,
      basic: 35000,
      hra: 14000,
      special: 21000,
      conveyance: 0,
      bonus: 0,
      medical: 0,
      ee_pf: 3000,
      ee_esic: 0,
      take_home: 66800,
      er_pf: 3250,
      er_esic: 0,
      gratuity: 1684,
      ex_gratia: 1667,
      total_b: 6601,
      ctc: 76601,
    });
  });

  it("#9 CTC 70,000 Probation", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyCtc: 70000 });
    expectBreakup(r, {
      gross: 63555,
      basic: 31778,
      hra: 12711,
      special: 19066,
      total_b: 6446,
    });
    expect(r.validation.code).not.toBe(VALIDATION_CHECK_CTC_MISMATCH);
  });

  it("#10 benchmark limit: Gross 27,170 vs 27,171", () => {
    const a = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 27170 });
    const b = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 27171 });
    expectClose(a.basic, 13585);
    expectClose(b.basic, 13586);
  });

  it.each([STATUS_PROBATION, STATUS_CONFIRMED])("#11 Gross 19,500 (%s) — below minimum, Save blocked", (status) => {
    const r = calculateCtc(rules, { skill, status, monthlyGross: 19500 });
    expect(r.validation.code).toBe(VALIDATION_ERROR_GROSS_BELOW_MIN);
    expect(r.validation.blocksSave).toBe(true);
    expectClose(r.validation.minimum_gross, 20151);
  });

  it("minimum Gross itself is valid", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 20151 });
    expect(r.validation.blocksSave).toBe(false);
  });

  it("any Gross ≤ Band 1 limit is below minimum", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 18136 });
    expect(r.validation.blocksSave).toBe(true);
  });
});

describe("minimum wage revision from 1 Oct 2026 (Skilled 13,897 / Semi-skilled 13,637)", () => {
  const rules = { ...SEED_RULES_2026_27, BENCH_SKILLED: 13897, BENCH_SEMI: 13637 };

  it("derived values move with the benchmark; bands unchanged", () => {
    expectClose(benchmarkLimit(rules, "skilled"), 27794);
    expectClose(benchmarkLimit(rules, "semi_skilled"), 27274);
    expectClose(minimumValidGross(rules, "skilled"), 20614);
    expectClose(minimumValidGross(rules, "semi_skilled"), 20228);
  });

  it("same Gross: Basic/HRA/Bonus rise to the new benchmark, Conveyance absorbs it", () => {
    const before = calculateCtc(SEED_RULES_2026_27, { skill, status: STATUS_PROBATION, monthlyGross: 27000 });
    const after = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 27000 });
    expectBreakup(before, { basic: 13585, hra: 5434, bonus: 1132, medical: 2500, conveyance: 4349 });
    expectBreakup(after, { band: 2, basic: 13897, hra: 5559, bonus: 1158, medical: 2500, conveyance: 3886, gross: 27000 });
    expectSums(after);
  });

  it("semi-skilled at the same Gross", () => {
    const r = calculateCtc(rules, { skill: "semi_skilled", status: STATUS_PROBATION, monthlyGross: 27000 });
    expectBreakup(r, { basic: 13637, hra: 5455, bonus: 1136, medical: 2500, conveyance: 4272, gross: 27000 });
  });

  it("lower Gross: Medical is restricted once Conveyance is used up", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 22000 });
    expectBreakup(r, { basic: 13897, medical: 1386, conveyance: 0, gross: 22000 });
    expect(r.validation.code).toBe(VALIDATION_OK_MEDICAL_RESTRICTED);
  });

  it("Gross that was valid before can fall below the new minimum", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 20500 });
    expect(r.validation.code).toBe(VALIDATION_ERROR_GROSS_BELOW_MIN);
    expectClose(r.validation.minimum_gross, 20614);
  });

  it("Gross above the benchmark limit is unchanged", () => {
    const r = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 34000 });
    expectBreakup(r, CASE1);
  });
});

describe("lifecycle categories", () => {
  it("#12 New Joiner / New Scheme forces New Scheme", () => {
    const r = resolveCategory(CATEGORY_NEW_JOINER_NEW_SCHEME, SCHEME_OLD);
    expect(r.scheme).toBe(SCHEME_NEW);
    expect(r.schemeLocked).toBe(true);
    expect(r.status).toBe(STATUS_PROBATION);
  });

  it("Existing / Confirmed keeps the selected scheme with benefits ON", () => {
    const r = resolveCategory(CATEGORY_EXISTING_CONFIRMED, SCHEME_OLD);
    expect(r).toMatchObject({ status: STATUS_CONFIRMED, scheme: SCHEME_OLD, benefits: "ON" });
  });

  it("Probation → Confirmed can switch scheme after confirmation", () => {
    const r = resolveCategory(CATEGORY_PROBATION_TO_CONFIRMED, SCHEME_OLD, SCHEME_NEW);
    expect(r).toMatchObject({ scheme: SCHEME_OLD, schemeAfter: SCHEME_NEW, benefits: "OFF → ON" });
  });
});

describe("CTC record dates", () => {
  const existing = [
    { id: "a", effective_from: "2026-04-01", effective_to: "2026-06-30" },
    { id: "b", effective_from: "2026-07-01", effective_to: null },
  ];

  it("#13 overlapping dates are blocked", () => {
    expect(findOverlappingRecord(existing, { effective_from: "2026-05-15" })).not.toBeNull();
    expect(findOverlappingRecord(existing, { effective_from: "2026-07-01" })).not.toBeNull();
    expect(findOverlappingRecord(existing, { effective_from: "2026-03-01", effective_to: "2026-04-10" })).not.toBeNull();
  });

  it("a record starting after the open record is allowed (previous one closes)", () => {
    expect(findOverlappingRecord(existing, { effective_from: "2026-10-01" })).toBeNull();
  });
});

describe("custom override", () => {
  const rules = SEED_RULES_2026_27;
  const system = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: 34000 });

  it("every component except the totals accepts a custom value", () => {
    expect(OVERRIDE_KEYS).toEqual([
      "basic", "hra", "conveyance", "bonus", "medical", "special", "perf_incentive",
      "ee_pf", "pt", "ee_esic",
      "er_pf", "er_esic", "mediclaim", "leave_encashment", "gratuity", "ex_gratia",
    ]);
    for (const total of ["gross", "take_home", "total_b", "ctc"]) expect(OVERRIDE_KEYS).not.toContain(total);
  });

  it("no entered values leaves the system breakup unchanged", () => {
    const r = applyComponentOverrides(rules, system, {});
    expect(r.is_custom).toBe(false);
    expectBreakup(r, CASE1);
  });

  it("entering the system value is not a custom change", () => {
    const r = applyComponentOverrides(rules, system, { ee_pf: 2040, conveyance: "3784" });
    expect(r.is_custom).toBe(false);
  });

  it("#14 override of Conveyance without reason blocks Save", () => {
    expect(validateCustomOverride({ overrides: { conveyance: 4000 }, reason: "" }).ok).toBe(false);
    expect(validateCustomOverride({ overrides: { gratuity: 900 }, reason: " " }).ok).toBe(false);
  });

  it("#14 with reason: saved and marked Custom, Gross = sum of components", () => {
    expect(validateCustomOverride({ overrides: { conveyance: 4000 }, reason: "Negotiated" }).ok).toBe(true);
    const r = applyComponentOverrides(rules, system, { conveyance: 4000 });
    expect(r.is_custom).toBe(true);
    expectClose(r.gross, 34000 - 3784 + 4000);
    expectClose(r.system_values.conveyance, 3784);
    expectSums(r);
  });

  it("custom values are rounded to the rupee", () => {
    const r = applyComponentOverrides(rules, system, { conveyance: 4000.6 });
    expect(r.conveyance).toBe(4001);
    expectWholeRupees(r);
  });

  it("overriding Basic recalculates deductions and Part B from the new Basic", () => {
    const r = applyComponentOverrides(rules, system, { basic: 26000 });
    expectClose(r.ee_pf, 3000);
    expectClose(r.er_pf, 3250);
    expect(r.ee_esic).toBe(0);
    expectClose(r.ex_gratia, 1667);
    expectSums(r);
  });

  it("a custom deduction changes only that deduction and Take Home", () => {
    const r = applyComponentOverrides(rules, system, { ee_pf: 1800 });
    expect(r.is_custom).toBe(true);
    expect(r.ee_pf).toBe(1800);
    expect(r.system_values).toEqual({ ee_pf: 2040 });
    expectBreakup(r, { ...CASE1, ee_pf: 1800, take_home: 34000 - 1800 - 200 - 128 });
    expectSums(r);
  });

  it("a custom Part B value changes only that line, Total B and CTC", () => {
    const r = applyComponentOverrides(rules, system, { gratuity: 1000, mediclaim: 300 });
    expectBreakup(r, {
      ...CASE1,
      gratuity: 1000,
      mediclaim: 300,
      total_b: 5083 - 818 + 1000 + 300,
      ctc: 34000 + 5083 - 818 + 1000 + 300,
    });
    expect(r.system_values).toEqual({ gratuity: 818, mediclaim: 0 });
    expectSums(r);
  });

  it("system value of a deduction follows an overridden Basic", () => {
    const r = applyComponentOverrides(rules, system, { basic: 26000, ee_pf: 2500 });
    expect(r.ee_pf).toBe(2500);
    expect(r.system_values.ee_pf).toBe(3000);
    expect(r.er_pf).toBe(3250);
    expectSums(r);
  });

  it("entering every Part A component directly: Gross is their sum, blanks below follow Basic", () => {
    const entered = { basic: 20000, hra: 8000, conveyance: 2500, bonus: 1666, medical: 3000, special: 0 };
    const gross = 35166;
    const base = calculateCtc(rules, { skill, status: STATUS_PROBATION, monthlyGross: gross });
    const r = applyComponentOverrides(rules, base, entered);
    expect(r.is_custom).toBe(true);
    expect(r.gross).toBe(gross);
    expect(r.ee_pf).toBe(2400);
    expect(r.er_pf).toBe(2600);
    expect(r.ee_esic).toBe(150);
    expectWholeRupees(r);
    expectSums(r);
  });

  it("P.Tax and ESIC can be set to zero", () => {
    const r = applyComponentOverrides(rules, system, { pt: 0, ee_esic: 0, er_esic: 0 });
    expectBreakup(r, {
      pt: 0,
      ee_esic: 0,
      er_esic: 0,
      take_home: 34000 - 2040,
      total_b: 5083 - 638,
    });
    expectSums(r);
  });
});
