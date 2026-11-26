import { describe, expect, it } from "vitest";
import {
  attendanceCodesForSite,
  categorizeAttendanceRecord,
  computeEmployeeTotals,
  formatCustomDutyValue,
  getDutyContribution,
  getRecordDutyContribution,
  parseCustomDutyValue,
  siteAllowsCustomizedDutyHours,
} from "../src/lib/siteAttendance/attendanceRules.js";
import { mapAttendanceMark } from "../src/lib/siteAttendance/import/markDictionary.js";
import { multiDesigHasDutyCode } from "../src/lib/siteAttendance/multiDesignation.js";

describe("customized duty hours", () => {
  const siteOff = { customized_duty_hours: false, duty_hours: 8, shift_type: "GENERAL" };
  const siteOn = { customized_duty_hours: true, duty_hours: 8, shift_type: "GENERAL", nh_ph_present: 1 };

  it("parses and formats custom duty values", () => {
    expect(parseCustomDutyValue("0.5")).toBe(0.5);
    expect(parseCustomDutyValue("0.75")).toBe(0.75);
    expect(parseCustomDutyValue("4")).toBe(4);
    expect(parseCustomDutyValue("8")).toBe(8);
    expect(parseCustomDutyValue("P")).toBeNull();
    expect(parseCustomDutyValue("25")).toBeNull();
    expect(formatCustomDutyValue(0.75)).toBe("0.75");
    expect(formatCustomDutyValue(8)).toBe("8");
  });

  it("only counts numeric duty when the site flag is on", () => {
    expect(siteAllowsCustomizedDutyHours(siteOn)).toBe(true);
    expect(getDutyContribution("0.75", siteOff)).toBe(0);
    expect(getDutyContribution("0.75", siteOn)).toBe(0.75);
    expect(getDutyContribution("P", siteOn)).toBe(1);
    expect(getDutyContribution("HD", siteOn)).toBe(0.5);
    expect(getRecordDutyContribution({ att_code: "4", ot_hours: 0 }, siteOn)).toBe(4);
  });

  it("keeps letter codes only in the dropdown list (Custom duty is a separate option)", () => {
    expect(attendanceCodesForSite(siteOff)).toEqual(attendanceCodesForSite(siteOn));
    expect(attendanceCodesForSite(siteOn)).toEqual(
      expect.arrayContaining(["", "P", "HD", "WO", "L"])
    );
    expect(attendanceCodesForSite(siteOn)).not.toContain("0.75");
    expect(attendanceCodesForSite(siteOn)).not.toContain("4");
  });

  it("rolls custom values into employee present totals", () => {
    const employee = { id: 1, joining_date: "2026-01-01", designation: "FIREMAN" };
    const days = [
      { dateString: "2026-11-01", date: new Date(2026, 10, 1) },
      { dateString: "2026-11-02", date: new Date(2026, 10, 2) },
      { dateString: "2026-11-03", date: new Date(2026, 10, 3) },
    ];
    const map = {
      "1_2026-11-01": { att_code: "0.5", ot_hours: 0 },
      "1_2026-11-02": { att_code: "0.75", ot_hours: 0 },
      "1_2026-11-03": { att_code: "8", ot_hours: 0 },
    };
    const totals = computeEmployeeTotals(
      employee,
      days,
      (id, date) => map[`${id}_${date}`],
      siteOn
    );
    expect(totals.totalPresent).toBe(9.25);
  });

  it("categorizes custom duty and treats it as a multi-desig duty mark", () => {
    expect(categorizeAttendanceRecord({ att_code: "0.5" }, siteOn)).toBe("half");
    expect(categorizeAttendanceRecord({ att_code: "8" }, siteOn)).toBe("present");
    expect(multiDesigHasDutyCode("0.75")).toBe(true);
  });

  it("maps numeric import marks only when customized duty is enabled", () => {
    expect(mapAttendanceMark("0.75", "GENERAL").kind).toBe("unknown");
    expect(mapAttendanceMark("0.75", "GENERAL", { customizedDutyHours: true })).toEqual(
      expect.objectContaining({ kind: "mapped", code: "0.75" })
    );
    expect(mapAttendanceMark("4", "GENERAL", { customizedDutyHours: true }).code).toBe("4");
  });
});
