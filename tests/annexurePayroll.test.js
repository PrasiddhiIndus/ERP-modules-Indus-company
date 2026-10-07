import { describe, it, expect } from "vitest";
import {
  SEED_RULES_2026_27,
  STATUS_CONFIRMED,
  STATUS_PROBATION,
  annexureRowsFor,
  applyComponentOverrides,
  applyExtraComponents,
  calculateCtc,
} from "../src/pages/adminOperations/salaryAdmin/ctcEngine.js";

function partA(result) {
  const { basic, hra, conveyance, bonus, medical, special } = result;
  return { basic, hra, conveyance, bonus, medical, special };
}
import {
  ANNEXURE_STRUCTURE_VERSION,
  annexureLineInputs,
  buildCtcHistory,
  recordToComponents,
  resultToStructurePayload,
} from "../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js";
import { recomputeLineFromEdits } from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";
import { resolveStructureForPayMonth } from "../src/pages/adminOperations/salaryAdmin/salaryData.js";

const rules = SEED_RULES_2026_27;

function recordFor(status, gross) {
  const result = calculateCtc(rules, { skill: "skilled", status, monthlyGross: gross });
  return resultToStructurePayload(result, {
    rules,
    ruleVersionId: "v1",
    scheme: "old",
    category: "new_probation",
    revisionType: "initial",
    wefDate: "2026-04-01",
  });
}

function lineFor(record, presentDays, monthDays = 26) {
  return {
    salary_rate: record.gross_monthly,
    present_days: presentDays,
    pf_basic: record.pf_wage_monthly,
    basic_full: record.basic_monthly,
    hra_full: record.hra_monthly,
    special_full: record.special_allowance_monthly,
    loan: 0,
    sal_adv: 0,
    unpaid_paid: 0,
    tds: 0,
    computed_json: { annexure: annexureLineInputs(record) },
    total_days: monthDays,
  };
}

describe("Annexure-I record mapping", () => {
  it("stores every Annexure component and round-trips them", () => {
    const rec = recordFor(STATUS_PROBATION, 34000);
    expect(rec.structure_version).toBe(ANNEXURE_STRUCTURE_VERSION);
    const c = recordToComponents(rec);
    expect(c).toMatchObject({
      basic: 17000,
      hra: 6800,
      conveyance: 3784,
      bonus: 1416,
      medical: 5000,
      special: 0,
      gross: 34000,
      ee_pf: 2040,
      ee_esic: 128,
      take_home: 31632,
      ex_gratia: 1417,
      total_b: 5083,
      ctc: 39083,
    });
    expect(rec.lic_monthly).toBe(0);
    expect(rec.bonus_monthly).toBe(0);
    expect(rec.formula_overrides_json).toEqual({});
  });

  it("PF wage is Basic up to the threshold, else fixed PF ÷ rate", () => {
    expect(recordFor(STATUS_PROBATION, 34000).pf_wage_monthly).toBe(17000);
    expect(recordFor(STATUS_PROBATION, 70000).pf_wage_monthly).toBe(25000);
  });

  it("an earlier-structure month does not pick up the new structure from the current record", () => {
    const current = { ...recordFor(STATUS_PROBATION, 34000), id: "cur", wef_date: "2026-10-01", declared: true };
    const legacyRev = { id: "r1", revision_no: 1, wef_date: "2026-01-01", gross_monthly: 30000, basic_monthly: 15000 };
    const sept = resolveStructureForPayMonth({ ...current, revisions: [legacyRev] }, 2026, 9);
    expect(sept.structure_version).toBeNull();
    expect(annexureLineInputs(sept)).toBeNull();
    const oct = resolveStructureForPayMonth({ ...current, revisions: [legacyRev] }, 2026, 10);
    expect(oct.structure_version).toBe(ANNEXURE_STRUCTURE_VERSION);
  });

  it("history sets Effective To to the day before the next record", () => {
    const current = { ...recordFor(STATUS_CONFIRMED, 40000), id: "cur", wef_date: "2026-10-01" };
    const older = { ...recordFor(STATUS_PROBATION, 34000), id: "r1", revision_no: 1, wef_date: "2026-04-01" };
    const h = buildCtcHistory({ ...current, revisions: [older] });
    expect(h[0].effective_to).toBeNull();
    expect(h[1].effective_from).toBe("2026-04-01");
    expect(h[1].effective_to).toBe("2026-09-30");
  });
});

describe("Salary Processing with Annexure-I records", () => {
  it("full month pays the CTC record", () => {
    const rec = recordFor(STATUS_PROBATION, 34000);
    const out = recomputeLineFromEdits(lineFor(rec, 26), 26);
    expect(out.basic_earned).toBe(17000);
    expect(out.conveyance_earned).toBe(3784);
    expect(out.stat_bonus_earned).toBe(1416);
    expect(out.medical_earned).toBe(5000);
    expect(out.gross_wages).toBe(34000);
    expect(out.emp_pf).toBe(2040);
    expect(out.emp_esic).toBe(128);
    expect(out.pt_amount).toBe(200);
    expect(out.net_salary).toBe(31632);
  });

  it("prorates earnings, PF and ESIC by paid days with the existing rule", () => {
    const rec = recordFor(STATUS_PROBATION, 34000);
    const out = recomputeLineFromEdits(lineFor(rec, 13), 26);
    expect(out.basic_earned).toBe(8500);
    expect(out.emp_pf).toBe(1020);
    expect(out.emp_esic).toBe(64);
  });

  it("Band 4: fixed Employee PF, no ESIC", () => {
    const rec = recordFor(STATUS_PROBATION, 70000);
    const out = recomputeLineFromEdits(lineFor(rec, 26), 26);
    expect(out.gross_wages).toBeCloseTo(70000, 2);
    expect(out.emp_pf).toBeCloseTo(3000, 2);
    expect(out.emp_esic).toBe(0);
    expect(out.net_salary).toBeCloseTo(66800, 2);
  });

  it("Performance Incentive is paid only when it is part of the CTC", () => {
    const system = calculateCtc(rules, { skill: "skilled", status: STATUS_PROBATION, monthlyGross: 34000 });
    const withIncentive = applyComponentOverrides(rules, system, { ...partA(system), perf_incentive: 2600 });
    const rec = resultToStructurePayload(withIncentive, {
      rules,
      ruleVersionId: "v1",
      scheme: "old",
      category: "new_probation",
      revisionType: "initial",
      wefDate: "2026-04-01",
    });
    expect(rec.perf_incentive_enabled).toBe(true);
    expect(rec.perf_incentive_monthly).toBe(2600);
    expect(rec.gross_monthly).toBe(36600);
    expect(recordToComponents(rec).perf_incentive).toBe(2600);
    expect(rec.ctc_monthly).toBe(system.ctc + 2600);

    const full = recomputeLineFromEdits(lineFor(rec, 26), 26);
    expect(full.perf_incentive_earned).toBe(2600);
    expect(full.special_allowance).toBe(0);
    expect(full.gross_wages).toBe(36600);
    expect(recomputeLineFromEdits(lineFor(rec, 13), 26).perf_incentive_earned).toBe(1300);

    const without = recordFor(STATUS_PROBATION, 34000);
    expect(without.perf_incentive_enabled).toBe(false);
    expect(recordToComponents(without).perf_incentive).toBe(0);
    expect(recomputeLineFromEdits(lineFor(without, 26), 26).perf_incentive_earned).toBeUndefined();
    expect(annexureLineInputs(without).perf_incentive_full).toBeUndefined();
    expect(recordToComponents({ ...rec, perf_incentive_enabled: false }).perf_incentive).toBe(0);
  });

  it("additional components adjust totals, Annexure rows and the monthly line", () => {
    const system = calculateCtc(rules, { skill: "skilled", status: STATUS_PROBATION, monthlyGross: 34000 });
    const extras = [
      { id: "a1", part: "A", label: "Site allowance", monthly: 2000 },
      { id: "d1", part: "D", label: "Canteen", monthly: 520 },
      { id: "b1", part: "B", label: "Insurance", monthly: 300 },
      { id: "e1", part: "A", label: "", monthly: 999 },
    ];
    const withExtras = applyExtraComponents(system, extras);
    expect(withExtras.gross).toBe(system.gross + 2000);
    expect(withExtras.take_home).toBe(system.take_home + 2000 - 520);
    expect(withExtras.total_b).toBe(system.total_b + 300);
    expect(withExtras.ctc).toBe(system.ctc + 2300);
    expect(withExtras.basic).toBe(system.basic);
    expect(withExtras.ee_pf).toBe(system.ee_pf);
    expect(applyExtraComponents(system, [])).toBe(system);

    const rec = resultToStructurePayload(withExtras, {
      rules,
      ruleVersionId: "v1",
      scheme: "old",
      category: "new_probation",
      revisionType: "initial",
      wefDate: "2026-04-01",
    });
    expect(rec.extra_components_json).toHaveLength(3);
    expect(rec.gross_monthly).toBe(36000);
    const values = recordToComponents(rec);
    const keys = annexureRowsFor(values).map((r) => r.key);
    expect(keys.indexOf("x_a1")).toBe(keys.indexOf("gross") - 1);
    expect(keys.indexOf("x_d1")).toBe(keys.indexOf("take_home") - 1);
    expect(keys.indexOf("x_b1")).toBe(keys.indexOf("total_b") - 1);
    expect(annexureRowsFor(recordToComponents(recordFor(STATUS_PROBATION, 34000))).some((r) => r.extra)).toBe(false);

    const full = recomputeLineFromEdits(lineFor(rec, 26), 26);
    expect(full.gross_wages).toBe(36000);
    expect(full.conveyance_earned).toBe(3784);
    expect(full.computed_json.extra_earnings).toEqual([{ id: "a1", label: "Site allowance", full: 2000, earned: 2000 }]);
    expect(full.computed_json.extra_deductions[0].earned).toBe(520);
    expect(full.net_salary).toBe(31632 + 2000 - 520);

    const half = recomputeLineFromEdits(lineFor(rec, 13), 26);
    expect(half.computed_json.extra_earnings[0].earned).toBe(1000);
    expect(half.computed_json.extra_deductions[0].earned).toBe(260);

    const removed = recomputeLineFromEdits(
      { ...lineFor(recordFor(STATUS_PROBATION, 34000), 26), computed_json: { ...lineFor(recordFor(STATUS_PROBATION, 34000), 26).computed_json, extra_earnings: [{ earned: 5 }] } },
      26
    );
    expect(removed.computed_json.extra_earnings).toBeUndefined();
  });

  it("earlier-structure lines keep the existing formulas", () => {
    const out = recomputeLineFromEdits(
      {
        salary_rate: 20000,
        present_days: 26,
        pf_basic: 10000,
        basic_full: 10000,
        hra_full: 4000,
        special_full: 6000,
        computed_json: {},
      },
      26
    );
    expect(out.gross_wages).toBe(20000);
    expect(out.emp_pf).toBe(1200);
    expect(out.emp_esic).toBe(150);
    expect(out.conveyance_earned).toBeUndefined();
  });
});
