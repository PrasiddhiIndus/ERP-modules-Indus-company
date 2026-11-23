import { afterEach, describe, expect, it } from "vitest";
import {
  attachRegisterRowSummaries,
  buildMonthlyRegisterGrid,
  isAutoWeekoffDate,
  isWeeklyOffDate,
  offDayWorkCountsTowardPresent,
  registerMarkDisplayValue,
  resolveRegisterCellDisplayMark,
} from "../src/lib/attendanceDaily.js";
import {
  isWeeklyOffDay,
  resetAttendanceRulesCache,
  setRulesSnapshot,
} from "../src/lib/attendanceRules.js";
import {
  canonicalDepartmentLabel,
  departmentInSelection,
  departmentMatches,
} from "../src/lib/employeeMasterDepartments.js";

const SUN = "2026-11-01"; // Sunday
const MON = "2026-11-02";
const companySun3rd = [
  {
    id: 1,
    rule_key: "wo.pattern",
    scope_type: "company",
    scope_id: null,
    value: "sun_3rd_sat",
    effective_from: "2000-01-01",
    status: "active",
  },
  {
    id: 2,
    rule_key: "wo.auto",
    scope_type: "company",
    scope_id: null,
    value: true,
    effective_from: "2000-01-01",
    status: "active",
  },
];

afterEach(() => resetAttendanceRulesCache());

describe("Dahej-HR weekly off / POD / CO eligibility (register mapping)", () => {
  it("inherits company Sunday + 3rd Saturday offs (not wo.pattern=none)", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    for (const dept of ["Dahej-HR", "Dahej HR", "Dahej - HR"]) {
      expect(isWeeklyOffDay(SUN, { department: dept })).toBe(true);
      expect(isWeeklyOffDate(SUN, dept)).toBe(true);
      expect(isAutoWeekoffDate(SUN, dept)).toBe(true);
      expect(isWeeklyOffDay(MON, { department: dept })).toBe(false);
    }
  });

  it("grid shows WO on Sunday and keeps P / P(OD) when marked on that WO day", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    const emp = {
      empCode: "8962",
      employeeName: "Dahej HR Staff",
      department: "Dahej-HR",
      employeeId: "8962",
    };

    const empty = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: {},
    });
    expect(empty.rows[0].dayMarks[1]).toBe("WO");

    const withPresent = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: { 8962: { 1: "P" } },
      markSources: { 8962: { 1: "manual" } },
    });
    expect(withPresent.rows[0].dayMarks[1]).toBe("P");

    const withPod = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: { 8962: { 1: "P(OD)" } },
      markSources: { 8962: { 1: "manual" } },
    });
    expect(withPod.rows[0].dayMarks[1]).toBe("P(OD)");
    expect(registerMarkDisplayValue("T")).toBe("P(OD)");
    expect(resolveRegisterCellDisplayMark("T", { punchIn: "14:00" })).toBe("P(OD)/P");
  });

  it("department filter aliases match Dahej HR spelling variants", () => {
    expect(canonicalDepartmentLabel("Dahej HR")).toBe("Dahej-HR");
    expect(departmentMatches("Dahej HR", "Dahej-HR")).toBe(true);
    expect(departmentInSelection("Dahej - HR", ["Dahej-HR"])).toBe(true);
  });

  it("Total present still counts P / P(OD) on weekly offs (31-day months)", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    expect(offDayWorkCountsTowardPresent("Dahej-HR")).toBe(true);
    expect(offDayWorkCountsTowardPresent("Dahej HR")).toBe(true);
    expect(offDayWorkCountsTowardPresent("HR")).toBe(false);

    // Oct 2026: 31 days; Sundays 4/11/18/25 + 3rd Sat 17 are weekly offs for sun_3rd_sat.
    const dayMarks = {};
    for (let d = 1; d <= 31; d += 1) dayMarks[d] = "P";
    dayMarks[11] = "P(OD)";

    const [dahej] = attachRegisterRowSummaries(
      [{ empCode: "8962", employeeName: "A", department: "Dahej-HR", dayMarks }],
      {},
      31,
      { year: 2026, month: 10 }
    );
    const [hr] = attachRegisterRowSummaries(
      [{ empCode: "1001", employeeName: "B", department: "HR", dayMarks: { ...dayMarks } }],
      {},
      31,
      { year: 2026, month: 10 }
    );

    expect(dahej.summary.totalPresent).toBe(31);
    // HR: 4 Sundays remapped off present; 3rd Sat P still credits like WO (1) → 27.
    expect(hr.summary.totalPresent).toBe(27);
  });
});
