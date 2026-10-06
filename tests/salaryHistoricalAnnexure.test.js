import { describe, expect, it } from "vitest";
import {
  SEED_RULES_2026_27,
  STATUS_CONFIRMED,
  STATUS_PROBATION,
  calculateCtc,
} from "../src/pages/adminOperations/salaryAdmin/ctcEngine.js";
import {
  ANNEXURE_STRUCTURE_VERSION,
  annexureLineInputs,
  resultToStructurePayload,
} from "../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js";
import { buildSheetLineFromSources } from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";
import { resolveStructureForPayMonth } from "../src/pages/adminOperations/salaryAdmin/salaryData.js";

const rules = SEED_RULES_2026_27;
const employee = { id: "139", employee_code: "E139", full_name: "Fixture Employee", designation: "Operator" };
const noDeductions = { loan: 0, salAdv: 0, unpaidPaid: 0, tds: 0 };

function annexureRecord(status, gross, wefDate) {
  const result = calculateCtc(rules, { skill: "skilled", status, monthlyGross: gross });
  return {
    ...resultToStructurePayload(result, {
      rules,
      ruleVersionId: "v1",
      scheme: "old",
      category: "new_probation",
      revisionType: "initial",
      wefDate,
    }),
    id: "cur",
    employee_master_id: 139,
    wef_date: wefDate,
    declared: true,
  };
}

/** Shape of a stored revision row: legacy columns only, no structure version. */
const legacyRevision = {
  id: "r1",
  revision_no: 1,
  wef_date: "2026-01-01",
  declared: true,
  gross_monthly: 30000,
  basic_monthly: 15000,
  hra_monthly: 6000,
  special_allowance_monthly: 9000,
  emp_pf_monthly: 1800,
  emp_esic_monthly: 113,
  pt_monthly: 200,
};

const legacyCurrent = {
  id: "cur-legacy",
  employee_master_id: 139,
  wef_date: "2026-08-01",
  declared: true,
  gross_monthly: 40000,
  basic_monthly: 20000,
  hra_monthly: 8000,
  special_allowance_monthly: 12000,
  emp_pf_monthly: 1800,
  emp_esic_monthly: 0,
  pt_monthly: 200,
};

function lineFor(structure, year, month, presentDays = 26) {
  const resolved = resolveStructureForPayMonth(structure, year, month);
  if (!resolved) return null;
  return buildSheetLineFromSources({
    employee,
    structure: resolved,
    presentDays,
    monthDays: 26,
    deductions: noDeductions,
  });
}

describe("D-01: historical months use the revision's own structure", () => {
  it("a legacy revision does not inherit the current Annexure columns", () => {
    const current = annexureRecord(STATUS_PROBATION, 34000, "2026-10-01");
    const sept = resolveStructureForPayMonth({ ...current, revisions: [legacyRevision] }, 2026, 9);
    expect(sept.structure_version).toBeNull();
    expect(sept.conveyance_monthly).toBeUndefined();
    expect(sept.stat_bonus_monthly).toBeUndefined();
    expect(sept.medical_allowance_monthly).toBeUndefined();
    expect(sept.ex_gratia_monthly).toBeUndefined();
    expect(sept.pf_wage_monthly).toBeUndefined();
    expect(annexureLineInputs(sept)).toBeNull();
  });

  it("the historical month line is computed with the earlier structure only", () => {
    const current = annexureRecord(STATUS_PROBATION, 34000, "2026-10-01");
    const line = lineFor({ ...current, revisions: [legacyRevision] }, 2026, 9);
    expect(line.computed_json.annexure ?? null).toBeNull();
    expect(line.salary_rate).toBe(30000);
    expect(line.basic_full).toBe(15000);
    expect(line.hra_full).toBe(6000);
    expect(line.special_full).toBe(9000);
    expect(line.gross_wages).toBe(30000);
    expect(line.conveyance_earned).toBeUndefined();
  });

  it("an employee whose only record is legacy gets the same line through either path", () => {
    const viaRevision = lineFor(
      { ...annexureRecord(STATUS_PROBATION, 34000, "2026-10-01"), revisions: [legacyRevision] },
      2026,
      9
    );
    const viaLegacyCurrent = lineFor({ ...legacyCurrent, revisions: [legacyRevision] }, 2026, 7);
    expect(viaRevision.gross_wages).toBe(viaLegacyCurrent.gross_wages);
    expect(viaRevision.emp_pf).toBe(viaLegacyCurrent.emp_pf);
    expect(viaRevision.emp_esic).toBe(viaLegacyCurrent.emp_esic);
    expect(viaRevision.net_salary).toBe(viaLegacyCurrent.net_salary);
  });
});

describe("D-01 regression: unaffected months are unchanged", () => {
  const annexCurrent = annexureRecord(STATUS_PROBATION, 34000, "2026-10-01");
  const annexConfirmed = annexureRecord(STATUS_CONFIRMED, 70000, "2026-10-01");
  const annexureRevision = {
    ...annexureRecord(STATUS_PROBATION, 30000, "2026-07-01"),
    id: "r-annex",
    revision_no: 1,
  };

  const cases = {
    annexure_current_on_wef_full_month: lineFor({ ...annexCurrent, revisions: [legacyRevision] }, 2026, 10),
    annexure_current_after_wef_partial: lineFor({ ...annexCurrent, revisions: [legacyRevision] }, 2026, 11, 13),
    annexure_current_no_revisions: lineFor(annexCurrent, 2026, 12),
    annexure_current_before_wef_no_revisions: lineFor(annexCurrent, 2026, 9),
    annexure_band4_current: lineFor({ ...annexConfirmed, revisions: [legacyRevision] }, 2026, 10),
    annexure_revision_month: lineFor({ ...annexCurrent, revisions: [annexureRevision] }, 2026, 8),
    legacy_current_after_wef: lineFor({ ...legacyCurrent, revisions: [legacyRevision] }, 2026, 9),
    legacy_current_revision_month: lineFor({ ...legacyCurrent, revisions: [legacyRevision] }, 2026, 7),
    legacy_current_partial: lineFor({ ...legacyCurrent, revisions: [legacyRevision] }, 2026, 9, 20),
  };

  for (const [name, line] of Object.entries(cases)) {
    it(`${name} matches the pre-fix output`, () => {
      expect(line).toMatchSnapshot();
    });
  }

  it("annexure months still resolve to the Annexure structure", () => {
    const oct = resolveStructureForPayMonth({ ...annexCurrent, revisions: [legacyRevision] }, 2026, 10);
    expect(oct.structure_version).toBe(ANNEXURE_STRUCTURE_VERSION);
    const aug = resolveStructureForPayMonth({ ...annexCurrent, revisions: [annexureRevision] }, 2026, 8);
    expect(aug.structure_version).toBe(ANNEXURE_STRUCTURE_VERSION);
    expect(annexureLineInputs(aug)).not.toBeNull();
  });
});
