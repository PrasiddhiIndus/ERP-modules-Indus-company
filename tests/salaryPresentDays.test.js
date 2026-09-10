import { describe, it, expect } from "vitest";
import {
  capPresentDaysToWorkingDays,
  resolveSalaryMonthWorkingDays,
  salaryPresentDaysFromDayMarks,
  workingDaysMonToSat,
} from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";

describe("salary working-day slab", () => {
  it("counts Monday–Saturday only (Sundays excluded)", () => {
    expect(workingDaysMonToSat(2026, 1)).toBe(27);
    expect(workingDaysMonToSat(2026, 2)).toBe(24);
    expect(workingDaysMonToSat(2026, 8)).toBe(26);
    expect(workingDaysMonToSat(2024, 2)).toBe(25);
  });

  it("never lets requested days exceed the calendar slab", () => {
    expect(resolveSalaryMonthWorkingDays(2026, 2, 31)).toBe(24);
    expect(resolveSalaryMonthWorkingDays(2026, 8, 30)).toBe(26);
    expect(resolveSalaryMonthWorkingDays(2026, 1, 26)).toBe(26);
  });

  it("caps P.Days at the month slab", () => {
    expect(capPresentDaysToWorkingDays(31, 27)).toBe(27);
    expect(capPresentDaysToWorkingDays(28, 24)).toBe(24);
    expect(capPresentDaysToWorkingDays(26.5, 27)).toBe(26.5);
    expect(capPresentDaysToWorkingDays(null, 27)).toBe(null);
  });

  it("counts present and paid leave on working days and ignores Sundays", () => {
    const marks = {};
    for (let d = 1; d <= 31; d += 1) marks[d] = "P";
    expect(salaryPresentDaysFromDayMarks(marks, 2026, 1)).toBe(27);
    expect(salaryPresentDaysFromDayMarks(marks, 2026, 8)).toBe(26);

    const feb = {};
    for (let d = 1; d <= 28; d += 1) feb[d] = d % 7 === 1 ? "WO" : "P";
    expect(salaryPresentDaysFromDayMarks(feb, 2026, 2)).toBe(24);

    const withLeave = { ...feb, 3: "PL", 4: "CL" };
    expect(salaryPresentDaysFromDayMarks(withLeave, 2026, 2)).toBe(24);
  });
});
