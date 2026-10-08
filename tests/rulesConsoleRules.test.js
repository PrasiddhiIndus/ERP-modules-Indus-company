import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RULE_VALUE_ROWS,
  RULE_KEYS,
  getCompOffStartDate,
  isThirdSaturdayWorkingDepartment,
  resetAttendanceRulesCache,
  resolveRuleValueFromRows,
  ruleDepartmentKey,
  setCachedRuleRows,
} from "../src/lib/attendanceRules.js";
import { isAutoWeekoffDate, isPaidThirdSaturdayWeekoffCell } from "../src/lib/attendanceDaily.js";
import { compOffCutoffMonthKey } from "../src/lib/compOffBalance.js";
import {
  departmentHasOwnValue,
  formatRuleValue,
  parseFormValue,
  ruleHistory,
  summarizeRule,
  validateRuleEdit,
} from "../src/pages/adminOperations/rulesConsole/rulesModel.js";

const THIRD_SAT = "2026-10-17";
const SUNDAY = "2026-10-18";

const thirdSatRule = {
  rule_key: RULE_KEYS.thirdSaturdayOff,
  value_type: "boolean",
  default_value: true,
  allows_department: true,
};
const expiryRule = {
  rule_key: RULE_KEYS.coExpiryMonths,
  value_type: "number",
  default_value: 2,
  unit: "months",
  min_value: 1,
  max_value: 24,
};

function row(id, department, value, effective_from, extra = {}) {
  return { id, rule_key: RULE_KEYS.thirdSaturdayOff, department, value, effective_from, ...extra };
}

afterEach(() => resetAttendanceRulesCache());

describe("defaults match the behaviour before the Rules Console", () => {
  it("3rd Saturday is worked by the six plant / maintenance departments only", () => {
    for (const dept of ["Production", "Production-FTC", "Production - Neotech", "Production-Neotech", "R&M", "M&M", "Maintenance-FTC"]) {
      expect(isThirdSaturdayWorkingDepartment(dept), dept).toBe(true);
      expect(isAutoWeekoffDate(THIRD_SAT, dept), dept).toBe(false);
    }
    for (const dept of ["HR", "Finance", "Dahej-HR", "Maintenance"]) {
      expect(isThirdSaturdayWorkingDepartment(dept), dept).toBe(false);
      expect(isAutoWeekoffDate(THIRD_SAT, dept), dept).toBe(true);
    }
  });

  it("Sunday stays a weekly off for everyone", () => {
    expect(isAutoWeekoffDate(SUNDAY, "Production")).toBe(true);
  });

  it("C/O starts in Sep 2026", () => {
    expect(getCompOffStartDate()).toBe("2026-09-01");
    expect(compOffCutoffMonthKey()).toBe("2026-09");
  });

  it("default rows normalise department names", () => {
    expect(ruleDepartmentKey("Production - Neotech")).toBe("production-neotech");
    expect(DEFAULT_RULE_VALUE_ROWS.length).toBeGreaterThan(0);
  });
});

describe("resolver honours dates and department overrides", () => {
  const rows = [
    row(1, null, true, "2000-01-01"),
    row(2, "Production", false, "2000-01-01"),
    row(3, "HR", false, "2026-11-01"),
    row(4, "Production", null, "2026-12-01"),
  ];

  it("department value applies from its start date", () => {
    expect(resolveRuleValueFromRows(rows, RULE_KEYS.thirdSaturdayOff, { department: "HR", onDate: "2026-10-31" })).toBe(true);
    expect(resolveRuleValueFromRows(rows, RULE_KEYS.thirdSaturdayOff, { department: "HR", onDate: "2026-11-01" })).toBe(false);
  });

  it("a null department value returns to the company default", () => {
    expect(resolveRuleValueFromRows(rows, RULE_KEYS.thirdSaturdayOff, { department: "production", onDate: "2026-11-30" })).toBe(false);
    expect(resolveRuleValueFromRows(rows, RULE_KEYS.thirdSaturdayOff, { department: "production", onDate: "2026-12-01" })).toBe(true);
  });

  it("register helpers use the rule in force on the cell date", () => {
    setCachedRuleRows(rows);
    expect(isAutoWeekoffDate("2026-11-21", "HR")).toBe(false);
    expect(isAutoWeekoffDate(THIRD_SAT, "HR")).toBe(true);
    expect(isPaidThirdSaturdayWeekoffCell("WO", { year: 2026, month: 10, day: 17, department: "HR" })).toBe(true);
    expect(isPaidThirdSaturdayWeekoffCell("WO", { year: 2026, month: 11, day: 21, department: "HR" })).toBe(false);
  });

  it("C/O start date follows the saved value", () => {
    setCachedRuleRows([{ id: 9, rule_key: RULE_KEYS.coStartDate, department: null, value: "2026-10-01", effective_from: "2000-01-01" }]);
    expect(compOffCutoffMonthKey()).toBe("2026-10");
  });
});

describe("Rules Console model", () => {
  const values = [
    row(1, null, true, "2000-01-01"),
    row(2, "Production", false, "2000-01-01"),
    row(3, "R&M", false, "2000-01-01"),
    row(4, "HR", false, "2026-11-01"),
  ];

  it("summarises company value, departments that differ and scheduled changes", () => {
    const s = summarizeRule(thirdSatRule, values, "2026-10-08");
    expect(s.companyValue).toBe(true);
    expect(s.differences.map((d) => d.department)).toEqual(["Production", "R&M"]);
    expect(s.scheduled.map((r) => r.department)).toEqual(["HR"]);
  });

  it("knows which departments have their own value", () => {
    expect(departmentHasOwnValue(values, RULE_KEYS.thirdSaturdayOff, "production", "2026-10-08")).toBe(true);
    expect(departmentHasOwnValue(values, RULE_KEYS.thirdSaturdayOff, "HR", "2026-10-08")).toBe(false);
  });

  it("formats values in plain language", () => {
    expect(formatRuleValue(thirdSatRule, false)).toBe("No");
    expect(formatRuleValue(expiryRule, 2)).toBe("2 months");
    expect(formatRuleValue({ value_type: "date" }, "2026-09-01")).toBe("01/09/2026");
    expect(formatRuleValue(thirdSatRule, null)).toBe("Company default");
  });

  it("validates edits", () => {
    const today = "2026-10-08";
    const ok = { department: null, value: 3, effectiveFrom: today, reason: "Policy update" };
    expect(validateRuleEdit(expiryRule, ok, today)).toEqual({});
    expect(validateRuleEdit(expiryRule, { ...ok, value: 30 }, today).value).toMatch(/between/);
    expect(validateRuleEdit(expiryRule, { ...ok, value: 1.5 }, today).value).toMatch(/whole/);
    expect(validateRuleEdit(expiryRule, { ...ok, effectiveFrom: "2026-10-01" }, today).effectiveFrom).toMatch(/today or later/);
    expect(validateRuleEdit(expiryRule, { ...ok, reason: "" }, today).reason).toBeTruthy();
    expect(validateRuleEdit(thirdSatRule, { ...ok, value: null }, today).value).toMatch(/needs a value/);
    expect(validateRuleEdit(thirdSatRule, { ...ok, department: "HR", value: null }, today)).toEqual({});
  });

  it("history leaves out the original setup rows", () => {
    const withChange = [...values, row(5, "HR", false, "2026-10-09", { created_at: "2026-10-08T10:00:00Z" })];
    expect(ruleHistory(thirdSatRule, withChange).map((h) => h.id)).toEqual([5, 4]);
  });

  it("parses form values", () => {
    expect(parseFormValue(thirdSatRule, "false")).toBe(false);
    expect(parseFormValue(thirdSatRule, "__inherit")).toBe(null);
    expect(parseFormValue(expiryRule, "4")).toBe(4);
  });
});
