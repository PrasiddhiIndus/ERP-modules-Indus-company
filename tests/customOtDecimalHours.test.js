import { describe, expect, it } from "vitest";
import {
  CUSTOM_OT_EQUIVALENT_HOURS,
  computeEmployeeTotals,
  customOtHoursToDays,
  getOtDutyContribution,
  getRecordDutyContribution,
  MAX_OT_HOURS,
  parseOtHours,
  siteAllowsDecimalOt,
} from "../src/lib/siteAttendance/attendanceRules.js";
import { mapOtValue } from "../src/lib/siteAttendance/import/markDictionary.js";
import { multiDesigHasOtHours } from "../src/lib/siteAttendance/multiDesignation.js";

describe("Custom OT decimal hours", () => {
  const customSite = { custom_ot: true, duty_hours: 8, regular_ot: false };
  const customSite12 = { custom_ot: true, duty_hours: 12, regular_ot: false };
  const hoursSite = { custom_ot: false, ot_in_hours: true, duty_hours: 8, regular_ot: false };
  const regularSite = { custom_ot: false, regular_ot: true, duty_hours: 8 };

  it("only Custom OT sites allow decimal OT", () => {
    expect(siteAllowsDecimalOt(customSite)).toBe(true);
    expect(siteAllowsDecimalOt(hoursSite)).toBe(false);
    expect(siteAllowsDecimalOt(regularSite)).toBe(false);
  });

  it("keeps 3.78 for Custom OT and truncates for other modes", () => {
    expect(parseOtHours("3.78", customSite)).toBe(3.78);
    expect(parseOtHours(3.78, customSite)).toBe(3.78);
    expect(parseOtHours("3.78", hoursSite)).toBe(3);
    expect(parseOtHours("3.78", regularSite)).toBe(3);
    expect(parseOtHours("16.5", customSite)).toBe(MAX_OT_HOURS);
    expect(parseOtHours("0", customSite)).toBe(0);
    expect(parseOtHours("", customSite)).toBe(0);
  });

  it("separates OT Hours (sum) from Total OT (hours ÷ 8) for Custom OT", () => {
    const employee = { id: 1, joining_date: "2026-01-01", designation: "FIREMAN" };
    const days = [
      { dateString: "2026-11-01", date: new Date(2026, 10, 1) },
      { dateString: "2026-11-02", date: new Date(2026, 10, 2) },
    ];
    const map = {
      "1_2026-11-01": { att_code: "P", ot_hours: 3.78 },
      "1_2026-11-02": { att_code: "P", ot_hours: 1.22 },
    };
    const totals = computeEmployeeTotals(
      employee,
      days,
      (id, date) => map[`${id}_${date}`],
      customSite
    );
    expect(totals.totalOtHours).toBe(5);
    expect(totals.totalOT).toBe(customOtHoursToDays(5));
    expect(totals.totalOT).toBe(0.63);
    expect(CUSTOM_OT_EQUIVALENT_HOURS).toBe(8);
    expect(getOtDutyContribution(3.78, customSite)).toBe(3.78 / 8);
    // Custom OT always uses ÷ 8 even when site duty_hours is 12
    expect(getOtDutyContribution(8, customSite12)).toBe(1);
    expect(getRecordDutyContribution({ att_code: "P", ot_hours: 3.78 }, customSite)).toBe(1 + 3.78 / 8);
  });

  it("keeps OT in hours sites summing hours into totalOT (no ÷ 8)", () => {
    const employee = { id: 1, joining_date: "2026-01-01", designation: "FIREMAN" };
    const days = [{ dateString: "2026-11-01", date: new Date(2026, 10, 1) }];
    const map = { "1_2026-11-01": { att_code: "P", ot_hours: 4 } };
    const totals = computeEmployeeTotals(employee, days, (id, date) => map[`${id}_${date}`], hoursSite);
    expect(totals.totalOtHours).toBe(4);
    expect(totals.totalOT).toBe(4);
  });

  it("import mapOtValue keeps decimals only when Custom OT is enabled", () => {
    expect(mapOtValue("3.78", 8, { allowDecimalOt: true })).toEqual(
      expect.objectContaining({ kind: "hours", hours: 3.78 })
    );
    expect(mapOtValue("3.78", 8)).toEqual(
      expect.objectContaining({ kind: "hours", hours: 4, note: "OT 3.78 rounded to 4 h" })
    );
    expect(mapOtValue("20", 8, { allowDecimalOt: true }).kind).toBe("unknown");
  });

  it("treats fractional OT as present for multi-designation checks", () => {
    expect(multiDesigHasOtHours(3.78)).toBe(true);
    expect(multiDesigHasOtHours(0.5)).toBe(true);
    expect(multiDesigHasOtHours(0)).toBe(false);
  });
});
