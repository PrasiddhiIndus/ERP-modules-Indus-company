import { describe, expect, it } from "vitest";
import { ANNEXURE_STRUCTURE_VERSION } from "../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js";
import {
  applyCurrentCtcToSavedLine,
  buildSheetLineFromSources,
  recomputeLineFromEdits,
} from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";

const annexure = {
  declared: true,
  structure_version: ANNEXURE_STRUCTURE_VERSION,
  gross_monthly: 30000,
  basic_monthly: 15000,
  hra_monthly: 6000,
  conveyance_monthly: 4000,
  stat_bonus_monthly: 1250,
  medical_allowance_monthly: 2500,
  special_allowance_monthly: 1250,
  emp_pf_monthly: 1800,
  pf_wage_monthly: 15000,
  emp_esic_monthly: 113,
  pt_monthly: 200,
  ctc_monthly: 36000,
};

const employee = {
  id: "11",
  employee_code: "E11",
  full_name: "Asha Rao",
  designation: "Operator",
};

describe("salary processing from current CTC", () => {
  it("hits CTC gross and each component on a full month", () => {
    const line = buildSheetLineFromSources({
      employee,
      structure: annexure,
      presentDays: 26,
      monthDays: 26,
      deductions: { loan: 0, salAdv: 0, unpaidPaid: 0, tds: 0 },
    });
    expect(line.salary_rate).toBe(30000);
    expect(line.basic_full).toBe(15000);
    expect(line.basic_earned).toBe(15000);
    expect(line.hra_earned).toBe(6000);
    expect(line.conveyance_earned).toBe(4000);
    expect(line.stat_bonus_earned).toBe(1250);
    expect(line.medical_earned).toBe(2500);
    expect(line.special_allowance).toBe(1250);
    expect(line.gross_wages).toBe(30000);
    expect(line.emp_pf).toBe(1800);
    expect(line.emp_esic).toBe(113);
    expect(line.pt_amount).toBe(200);
    expect(line.computed_json.annexure.conveyance_full).toBe(4000);
    expect(line.computed_json.conveyance_earned).toBe(4000);
  });

  it("prorates gross to the CTC gross for partial attendance", () => {
    const line = buildSheetLineFromSources({
      employee,
      structure: annexure,
      presentDays: 13,
      monthDays: 26,
      deductions: { loan: 500, salAdv: 0, unpaidPaid: 0, tds: 0 },
    });
    expect(line.gross_wages).toBe(15000);
    expect(line.basic_earned + line.hra_earned + line.conveyance_earned + line.stat_bonus_earned + line.medical_earned + line.special_allowance).toBe(15000);
    expect(line.emp_pf).toBe(900);
    expect(line.loan).toBe(500);
    expect(line.pt_amount).toBe(200);
    expect(line.net_salary).toBe(line.gross_wages - line.total_ded);
  });

  it("replaces an older sheet row with the current CTC and keeps paid days", () => {
    const saved = {
      id: "line-1",
      employee_master_id: "11",
      employee_name: "Asha Rao",
      salary_rate: 18000,
      basic_full: 9000,
      present_days: 20,
      loan: 250,
      sal_adv: 100,
      unpaid_paid: 0,
      tds: 0,
      gross_wages: 18000,
    };
    const line = applyCurrentCtcToSavedLine(saved, annexure, 26, employee);
    expect(line.id).toBe("line-1");
    expect(line.salary_rate).toBe(30000);
    expect(line.present_days).toBe(20);
    expect(line.loan).toBe(250);
    expect(line.sal_adv).toBe(100);
    expect(line.gross_wages).toBe(Math.round((30000 * 20) / 26));
    const again = recomputeLineFromEdits(line, 26);
    expect(again.gross_wages).toBe(line.gross_wages);
  });
});
