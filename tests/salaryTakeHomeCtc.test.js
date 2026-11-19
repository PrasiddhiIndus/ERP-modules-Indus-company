import { describe, it, expect } from "vitest";
import {
  CATEGORY_APPRENTICE,
  CATEGORY_CONSULTANT,
  CATEGORY_VOUCHER_EMPLOYEE,
  INPUT_TAKE_HOME,
} from "../src/pages/adminOperations/salaryAdmin/ctcEngine.js";
import {
  TAKE_HOME_STRUCTURE_VERSION,
  isTakeHomeCategory,
  isTakeHomeStructure,
  takeHomeToStructurePayload,
} from "../src/pages/adminOperations/salaryAdmin/annexureCtcRecord.js";
import { computeProcessingRow } from "../src/pages/adminOperations/salaryAdmin/salaryData.js";
import { recomputeLineFromEdits } from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";

describe("Take Home Create CTC categories", () => {
  it("recognises voucher, consultant and apprentice", () => {
    expect(isTakeHomeCategory(CATEGORY_VOUCHER_EMPLOYEE)).toBe(true);
    expect(isTakeHomeCategory(CATEGORY_CONSULTANT)).toBe(true);
    expect(isTakeHomeCategory(CATEGORY_APPRENTICE)).toBe(true);
    expect(isTakeHomeCategory("new_probation")).toBe(false);
  });

  it("saves Net Salary as take_home with no statutory amounts", () => {
    const payload = takeHomeToStructurePayload(18500, {
      category: CATEGORY_CONSULTANT,
      wefDate: "2026-11-01",
      revisionType: "initial",
    });
    expect(payload.structure_version).toBe(TAKE_HOME_STRUCTURE_VERSION);
    expect(payload.input_basis).toBe(INPUT_TAKE_HOME);
    expect(payload.take_home_monthly).toBe(18500);
    expect(payload.gross_monthly).toBe(18500);
    expect(payload.declared).toBe(true);
    expect(payload.emp_pf_monthly).toBe(0);
    expect(payload.pt_monthly).toBe(0);
    expect(payload.emp_esic_monthly).toBe(0);
    expect(isTakeHomeStructure(payload)).toBe(true);
  });

  it("pays saved Net Salary with present days and no deductions", () => {
    const structure = takeHomeToStructurePayload(20000, {
      category: CATEGORY_VOUCHER_EMPLOYEE,
      wefDate: "2026-10-01",
    });
    const row = computeProcessingRow({
      structure,
      presentDays: 27,
      totalDays: 27,
      loan: 500,
      salAdv: 100,
    });
    expect(row.take_home_only).toBe(true);
    expect(row.present_days).toBe(27);
    expect(row.net_salary).toBe(20000);
    expect(row.gross_wages).toBe(20000);
    expect(row.emp_pf).toBe(0);
    expect(row.pt).toBe(0);
    expect(row.total_ded).toBe(0);
    expect(row.loan).toBe(0);
  });

  it("keeps Net Salary on sheet recompute", () => {
    const line = recomputeLineFromEdits(
      {
        salary_rate: 15000,
        present_days: 22,
        take_home_only: true,
        computed_json: { take_home_only: true },
        source_snapshot_json: { take_home_only: true },
      },
      27
    );
    expect(line.net_salary).toBe(15000);
    expect(line.present_days).toBe(22);
    expect(line.total_ded).toBe(0);
    expect(line.pt_amount).toBe(0);
  });
});
