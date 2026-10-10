import { describe, it, expect } from "vitest";
import {
  SEED_RULES_2026_27,
  STATUS_PROBATION,
  annexureMonthlyValue,
  annexurePaValue,
  applyExtraComponents,
  calculateCtc,
  normalizeExtraComponents,
} from "../src/pages/adminOperations/salaryAdmin/ctcEngine.js";
import {
  annexureLineInputs,
  recordToComponents,
  resultToStructurePayload,
} from "../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js";
import { recomputeLineFromEdits } from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";

const rules = SEED_RULES_2026_27;
const meta = {
  rules,
  ruleVersionId: "v1",
  scheme: "old",
  category: "new_probation",
  revisionType: "initial",
  wefDate: "2026-04-01",
};

function lineFor(record) {
  return {
    salary_rate: record.gross_monthly,
    present_days: 26,
    pf_basic: record.pf_wage_monthly,
    basic_full: record.basic_monthly,
    hra_full: record.hra_monthly,
    special_full: record.special_allowance_monthly,
    loan: 0,
    sal_adv: 0,
    unpaid_paid: 0,
    tds: 0,
    computed_json: { annexure: annexureLineInputs(record) },
    total_days: 26,
  };
}

describe("Part B additional components — monthly and yearly", () => {
  const system = calculateCtc(rules, { skill: "skilled", status: STATUS_PROBATION, monthlyGross: 34000 });

  it("yearly follows monthly × 12 when no yearly amount is entered", () => {
    const out = applyExtraComponents(system, [{ id: "b1", part: "B", label: "Insurance", monthly: 300 }]);
    expect(annexurePaValue(out, "x_b1")).toBe(3600);
    expect(annexurePaValue(out, "total_b")).toBe(out.total_b * 12);
    expect(annexurePaValue(out, "ctc")).toBe(out.ctc * 12);
  });

  it("an entered yearly amount is kept and does not change monthly", () => {
    const out = applyExtraComponents(system, [
      { id: "b1", part: "B", label: "Insurance", monthly: 300, annual: 5000 },
    ]);
    expect(out.x_b1).toBe(300);
    expect(out.total_b).toBe(system.total_b + 300);
    expect(out.ctc).toBe(system.ctc + 300);
    expect(annexurePaValue(out, "x_b1")).toBe(5000);
    expect(annexurePaValue(out, "total_b")).toBe(system.total_b * 12 + 5000);
    expect(annexurePaValue(out, "ctc")).toBe(system.ctc * 12 + 5000);
  });

  it("yearly-only Part B line counts in P.A. totals but not in monthly", () => {
    const out = applyExtraComponents(system, [{ id: "b2", part: "B", label: "Annual bonus", monthly: "", annual: 12000 }]);
    expect(out.x_b2).toBe(0);
    expect(out.total_b).toBe(system.total_b);
    expect(out.ctc).toBe(system.ctc);
    expect(annexurePaValue(out, "ctc")).toBe(system.ctc * 12 + 12000);
  });

  it("an empty yearly amount shows empty and adds nothing to P.A. totals", () => {
    const out = applyExtraComponents(system, [
      { id: "b3", part: "B", label: "Insurance", monthly: 300, annual: "" },
    ]);
    expect(out.total_b).toBe(system.total_b + 300);
    expect(annexureMonthlyValue(out, "x_b3")).toBe(300);
    expect(annexurePaValue(out, "x_b3")).toBeNull();
    expect(annexurePaValue(out, "total_b")).toBe(system.total_b * 12);
    expect(annexurePaValue(out, "ctc")).toBe(system.ctc * 12);
    const rec = resultToStructurePayload(out, meta);
    expect(rec.extra_components_json[0].annual).toBeNull();
    expect(annexurePaValue(recordToComponents(rec), "x_b3")).toBeNull();
  });

  it("an empty monthly amount shows empty", () => {
    const out = applyExtraComponents(system, [{ id: "b4", part: "B", label: "Bonus", monthly: "", annual: 6000 }]);
    expect(annexureMonthlyValue(out, "x_b4")).toBeNull();
    expect(annexureMonthlyValue(out, "total_b")).toBe(system.total_b);
  });

  it("yearly amount is ignored outside Part B", () => {
    const [a] = normalizeExtraComponents([{ id: "a1", part: "A", label: "Site", monthly: 1000, annual: 99 }]);
    expect(a.annual).toBeUndefined();
  });

  it("saved record keeps the yearly amount, annual CTC and leaves monthly pay unchanged", () => {
    const out = applyExtraComponents(system, [
      { id: "b1", part: "B", label: "Insurance", monthly: 300, annual: 5000 },
    ]);
    const rec = resultToStructurePayload(out, meta);
    expect(rec.extra_components_json[0].annual).toBe(5000);
    expect(rec.ctc_annual).toBe(system.ctc * 12 + 5000);
    expect(rec.ctc_monthly).toBe(system.ctc + 300);
    expect(annexurePaValue(recordToComponents(rec), "x_b1")).toBe(5000);

    const plain = resultToStructurePayload(system, meta);
    expect(recomputeLineFromEdits(lineFor(rec), 26).net_salary).toBe(
      recomputeLineFromEdits(lineFor(plain), 26).net_salary
    );
  });
});
