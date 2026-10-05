import { describe, it, expect } from "vitest";
import {
  capPresentDaysToWorkingDays,
  resolveSalaryMonthWorkingDays,
  salaryPresentDaysFromDayMarks,
  workingDaysMonToSat,
} from "../src/pages/adminOperations/salaryAdmin/salaryMonthProcessing.js";
import {
  attachRegisterRowSummaries,
  buildMonthlyRegisterGrid,
  mergeApprovedLeaveMarksIntoManualMarks,
  normalizeRegisterMarkForDb,
} from "../src/lib/attendanceDaily.js";

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

  it("counts 3rd-Saturday WO as paid except for WO-excluded departments", () => {
    // Sep 2026: Sundays 6/13/20/27, 3rd Saturday 19.
    const sep = {};
    for (let d = 1; d <= 30; d += 1) sep[d] = [6, 13, 19, 20, 27].includes(d) ? "WO" : "P";
    expect(salaryPresentDaysFromDayMarks(sep, 2026, 9, "HR")).toBe(26);
    expect(salaryPresentDaysFromDayMarks(sep, 2026, 9, "Production")).toBe(25);
    expect(salaryPresentDaysFromDayMarks(sep, 2026, 9, "Maintenance-FTC")).toBe(25);
  });
});

describe("register Total present", () => {
  it("adds 3rd-Saturday WO for non-excluded departments only", () => {
    const emps = [
      { empCode: "1001", employeeName: "A", department: "HR" },
      { empCode: "1002", employeeName: "B", department: "R&M" },
    ];
    const { rows, daysInMonth } = buildMonthlyRegisterGrid([], emps, { year: 2026, month: 9 });
    const [hr, rm] = attachRegisterRowSummaries(rows, {}, daysInMonth, { year: 2026, month: 9 });
    expect(hr.dayMarks[19]).toBe("WO");
    expect(hr.summary.totalPresent).toBe(1);
    expect(rm.dayMarks[19]).toBe("");
    expect(rm.summary.totalPresent).toBe(0);
  });
});

describe("worked WO / NH/PH does not add P days (from Oct 2026)", () => {
  // Oct 2026: Sundays 4/11/18/25, 3rd Saturday 17 (paid WO for HR).
  const octMarks = () => {
    const dayMarks = {};
    for (let d = 1; d <= 31; d += 1) dayMarks[d] = [4, 11, 17, 18, 25].includes(d) ? "WO" : "P";
    dayMarks[4] = "P";
    dayMarks[11] = "P(OD)";
    return dayMarks;
  };

  it("worked Sundays add nothing to Total present", () => {
    const rows = [{ empCode: "1001", employeeName: "A", department: "HR", dayMarks: octMarks() }];
    const [row] = attachRegisterRowSummaries(rows, {}, 31, { year: 2026, month: 10 });
    // 26 Mon–Sat worked + paid 3rd-Saturday WO = 27; worked Sundays 4/11 add nothing.
    expect(row.summary.totalPresent).toBe(27);
  });

  it("worked paid 3rd Saturday still counts like the WO (1), excluded dept counts as work day", () => {
    const [a, b] = attachRegisterRowSummaries(
      [
        { empCode: "1", employeeName: "A", department: "HR", dayMarks: { 17: "P" } },
        { empCode: "2", employeeName: "B", department: "Production", dayMarks: { 17: "P" } },
      ],
      {},
      31,
      { year: 2026, month: 10 }
    );
    expect(a.summary.totalPresent).toBe(1);
    expect(b.summary.totalPresent).toBe(1);
  });

  it("worked NH/PH counts like the holiday, not as an extra present day", () => {
    const [row] = attachRegisterRowSummaries(
      [{ empCode: "1", employeeName: "A", department: "HR", dayMarks: { 2: "P", 5: "HD" } }],
      {},
      31,
      { year: 2026, month: 10, holidayDates: new Set(["2026-10-02"]) }
    );
    expect(row.summary.totalPresent).toBe(1.5);
  });

  it("does not change months before Oct 2026", () => {
    const dayMarks = {};
    for (let d = 1; d <= 30; d += 1) dayMarks[d] = [6, 13, 19, 20, 27].includes(d) ? "WO" : "P";
    dayMarks[6] = "P";
    dayMarks[13] = "P(OD)";
    const rows = [{ empCode: "1001", employeeName: "A", department: "HR", dayMarks }];
    const [row] = attachRegisterRowSummaries(rows, {}, 30, { year: 2026, month: 9 });
    expect(row.summary.totalPresent).toBe(28);
  });
});

describe("approved comp-off (C/O) leave", () => {
  it("normalizes Indus One C/O aliases to CO instead of L", () => {
    expect(normalizeRegisterMarkForDb("C/O")).toBe("CO");
    expect(normalizeRegisterMarkForDb("comp off")).toBe("CO");
    expect(normalizeRegisterMarkForDb("Compensatory Off")).toBe("CO");
    expect(normalizeRegisterMarkForDb("CO")).toBe("CO");
  });

  it("shows approved C/O as CO over a saved manual CO and counts it present", () => {
    const merged = mergeApprovedLeaveMarksIntoManualMarks(
      { 7838: { 7: "CO", 8: "CO" } },
      { 7838: { 7: "C/O", 8: "C/O" } },
      { monthKey: "2026-09" }
    );
    expect(merged["7838"][7]).toBe("CO");
    expect(merged["7838"][8]).toBe("CO");

    const { rows, daysInMonth } = buildMonthlyRegisterGrid(
      [],
      [{ empCode: "7838", employeeName: "X", department: "NFPA" }],
      { year: 2026, month: 9, manualMarks: merged }
    );
    const [row] = attachRegisterRowSummaries(rows, merged, daysInMonth, { year: 2026, month: 9 });
    expect(row.dayMarks[7]).toBe("CO");
    expect(row.summary.leave).toBe(0);
  });
});
