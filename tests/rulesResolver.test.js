import { afterEach, describe, expect, it } from "vitest";
import {
  compareGroupPriority,
  employeeGroups,
  isAutoHolidayFor,
  isAutoWeeklyOffDay,
  isThirdSaturdayWorkingDepartment,
  isWeeklyOffCandidateDate,
  isWeeklyOffDay,
  weeklyOffPattern,
  getRuleForEmployee,
  normalizeRuleValueRow,
  resetAttendanceRulesCache,
  resolveRuleDetail,
  ruleEmployeeKey,
  setRulesSnapshot,
} from "../src/lib/attendanceRules.js";
import { isRuleVisible, normalizeRule } from "../src/pages/adminOperations/rulesConsole/rulesApi.js";
import {
  formatRuleValue,
  parseFormValue,
  toFormValue,
  validateRuleEdit,
} from "../src/pages/adminOperations/rulesConsole/rulesModel.js";

const MANAGERS = "g-managers";
const NIGHT = "g-night";
const DAHEJ = "g-dahej";

let nextId = 1;
const row = (scope_type, scope_id, value, effective_from, extra = {}) => ({
  id: nextId++,
  rule_key: "co.earn",
  scope_type,
  scope_id,
  scope_label: extra.label ?? scope_id,
  value,
  effective_from,
  status: "active",
  ...extra,
});

const snapshot = {
  groups: [
    { id: MANAGERS, name: "Managers", priority: 100, created_at: "2026-01-01T10:00:00+00:00", match_departments: [], is_active: true },
    { id: NIGHT, name: "Night shift", priority: 50, created_at: "2026-03-01T10:00:00+00:00", match_departments: [], is_active: true },
    { id: DAHEJ, name: "Dahej site", priority: 60, created_at: "2026-02-01T10:00:00+00:00", match_departments: ["Dahej - HR"], is_active: true },
    { id: "g-old", name: "Old", priority: 70, created_at: "2026-04-01T10:00:00+00:00", match_departments: ["Finance"], is_active: false },
  ],
  members: [
    { group_id: MANAGERS, employee_code: "101" },
    { group_id: MANAGERS, employee_code: "102" },
    { group_id: NIGHT, employee_code: "101" },
  ],
  values: [
    row("company", null, true, "2000-01-01"),
    row("company", null, false, "2027-01-01"),
    row("group", MANAGERS, false, "2026-01-01", { label: "Managers" }),
    row("group", NIGHT, true, "2026-06-01", { label: "Night shift" }),
    row("group", DAHEJ, false, "2026-01-01", { label: "Dahej site" }),
    row("group", "g-old", false, "2026-01-01"),
    row("department", "hr", false, "2026-01-01", { label: "HR" }),
    row("employee", "102", true, "2026-01-01"),
    row("employee", "103", false, "2026-01-01"),
    row("employee", "103", null, "2026-09-01"),
    row("employee", "109", false, "2026-01-01", { status: "pending" }),
  ],
};

const resolve = (employeeCode, department, onDate) => {
  const r = resolveRuleDetail(snapshot, "co.earn", { employeeCode, department, onDate, fallback: true });
  return [r.value, r.sourceScope, r.sourceLabel];
};

afterEach(() => resetAttendanceRulesCache());

describe("rule resolver: Employee > Group > Department > Company", () => {
  it("employee override beats group and department", () => {
    expect(resolve("102", "HR", "2026-10-01")).toEqual([true, "employee", "102"]);
  });

  it("group beats department and company", () => {
    expect(resolve("0101", "HR", "2026-05-01")).toEqual([false, "group", "Managers"]);
  });

  it("department beats company when no group applies", () => {
    expect(resolve("150", "HR", "2026-10-01")).toEqual([false, "department", "HR"]);
  });

  it("two groups: the higher priority wins, even over a newer group", () => {
    expect(resolve("101", null, "2026-05-31")).toEqual([false, "group", "Managers"]);
    expect(resolve("101", null, "2026-06-01")).toEqual([false, "group", "Managers"]);
  });

  it("two groups: raising a priority changes the winner", () => {
    const bumped = { ...snapshot, groups: snapshot.groups.map((g) => (g.id === NIGHT ? { ...g, priority: 150 } : g)) };
    const r = resolveRuleDetail(bumped, "co.earn", { employeeCode: "101", onDate: "2026-06-01", fallback: true });
    expect([r.value, r.sourceScope, r.sourceLabel, r.sourceId]).toEqual([true, "group", "Night shift", NIGHT]);
  });

  it("two groups: only groups with a value on that date compete", () => {
    const noManagers = { ...snapshot, values: snapshot.values.filter((v) => v.scope_id !== MANAGERS) };
    const r = resolveRuleDetail(noManagers, "co.earn", { employeeCode: "101", onDate: "2026-06-01", fallback: true });
    expect([r.value, r.sourceLabel]).toEqual([true, "Night shift"]);
  });

  it("group ordering: priority first, then newest (older data without priority)", () => {
    const sorted = (list) => [...list].sort(compareGroupPriority).map((g) => g.id);
    expect(sorted([{ id: "a", priority: 10 }, { id: "b", priority: 30 }, { id: "c", priority: 20 }])).toEqual(["b", "c", "a"]);
    expect(sorted([
      { id: "old", created_at: "2026-01-01" },
      { id: "new", created_at: "2026-02-01" },
      { id: "ranked", priority: 1, created_at: "2025-01-01" },
    ])).toEqual(["ranked", "new", "old"]);
  });

  it("groups can match whole departments", () => {
    expect(resolve("160", "Dahej-HR", "2026-10-01")).toEqual([false, "group", "Dahej site"]);
    expect(employeeGroups(snapshot, { employeeCode: "160", department: "dahej-hr" }).map((g) => g.name)).toEqual(["Dahej site"]);
  });

  it("employee in no group falls back to company", () => {
    expect(resolve("170", "Finance", "2026-10-01")).toEqual([true, "company", null]);
  });

  it("archived groups and pending changes are ignored", () => {
    expect(resolve("109", "Finance", "2026-10-01")).toEqual([true, "company", null]);
  });

  it("a future-dated change leaves earlier days unchanged", () => {
    expect(resolve("170", "Finance", "2026-12-31")).toEqual([true, "company", null]);
    expect(resolve("170", "Finance", "2027-01-01")).toEqual([false, "company", null]);
    expect(resolve("102", "HR", "2027-01-01")).toEqual([true, "employee", "102"]);
  });

  it("a null row means the override was removed (inherit)", () => {
    expect(resolve("103", null, "2026-08-31")).toEqual([false, "employee", "103"]);
    expect(resolve("103", null, "2026-09-01")).toEqual([true, "company", null]);
  });

  it("no rows at all → built-in default", () => {
    const r = resolveRuleDetail({ values: [], groups: [], members: [] }, "co.earn", { employeeCode: "1", fallback: true });
    expect(r).toMatchObject({ value: true, sourceScope: "default" });
  });

  it("uses the cached snapshot", () => {
    setRulesSnapshot(snapshot);
    expect(getRuleForEmployee("co.earn", { employeeCode: "101", onDate: "2026-07-01" })).toBe(false);
    expect(getRuleForEmployee("co.earn", { employeeCode: "102", onDate: "2026-07-01" })).toBe(true);
  });
});

describe("weekly off (Phase 2A)", () => {
  const SUN = "2026-10-04";
  const MON = "2026-10-05";
  const SAT_2ND = "2026-10-10";
  const SAT_3RD = "2026-10-17";
  const rule = (rule_key, scope_type, scope_id, value, effective_from = "2026-01-01") =>
    row(scope_type, scope_id, value, effective_from, { rule_key });
  const load = (values, groups = [], members = []) => setRulesSnapshot({ values, groups, members });

  it("before the new rule exists, the old 3rd-Saturday rule decides", () => {
    load([
      rule("wo.third_saturday_off", "company", null, true),
      rule("wo.third_saturday_off", "department", "production", false),
      { ...rule("wo.pattern", "company", null, "sun_3rd_sat", "2000-01-01"), reason: "Existing rule at setup" },
    ]);
    expect(weeklyOffPattern({ department: "Production", onDate: SAT_3RD })).toBe("sun_only");
    expect(weeklyOffPattern({ department: "HR", onDate: SAT_3RD })).toBe("sun_3rd_sat");
    expect(isWeeklyOffDay(SAT_3RD, { department: "Production" })).toBe(false);
    expect(isWeeklyOffDay(SAT_3RD, { department: "HR" })).toBe(true);
    expect(isThirdSaturdayWorkingDepartment("Production", SAT_3RD)).toBe(true);
  });

  it("each pattern gives the right days", () => {
    load([
      rule("wo.pattern", "company", null, "sun_3rd_sat"),
      rule("wo.pattern", "department", "production", "sun_only"),
      rule("wo.pattern", "department", "dahej-hr", "none"),
      rule("wo.pattern", "employee", "501", "custom"),
      rule("wo.custom_days", "employee", "501", [1, 6]),
    ]);
    const days = (ctx) => [SUN, MON, SAT_2ND, SAT_3RD].filter((d) => isWeeklyOffDay(d, ctx));
    expect(days({ department: "HR" })).toEqual([SUN, SAT_3RD]);
    expect(days({ department: "Production" })).toEqual([SUN]);
    expect(days({ department: "Dahej - HR" })).toEqual([]);
    expect(days({ employeeCode: "0501", department: "HR" })).toEqual([MON, SAT_2ND, SAT_3RD]);
  });

  it("an unknown pattern value falls back to Sunday + 3rd Saturday", () => {
    load([rule("wo.pattern", "company", null, "weird")]);
    expect(weeklyOffPattern({ onDate: SUN })).toBe("sun_3rd_sat");
  });

  it("automatic WO and holidays can be switched off per scope", () => {
    load([
      rule("wo.pattern", "company", null, "sun_3rd_sat"),
      rule("wo.auto", "department", "stores", false),
      rule("wo.auto_holiday", "employee", "777", false),
    ]);
    expect(isAutoWeeklyOffDay(SUN, { department: "Stores" })).toBe(false);
    expect(isWeeklyOffDay(SUN, { department: "Stores" })).toBe(true);
    expect(isAutoWeeklyOffDay(SUN, { department: "HR" })).toBe(true);
    expect(isAutoWeeklyOffDay(MON, { department: "HR" })).toBe(false);
    expect(isAutoHolidayFor(MON, { employeeCode: "777" })).toBe(false);
    expect(isAutoHolidayFor(MON, { employeeCode: "778" })).toBe(true);
  });

  it("candidate days include custom weekdays only when a custom pattern exists", () => {
    load([rule("wo.pattern", "company", null, "sun_3rd_sat"), rule("wo.custom_days", "company", null, [1])]);
    expect([SUN, MON, SAT_2ND, SAT_3RD].filter(isWeeklyOffCandidateDate)).toEqual([SUN, SAT_3RD]);
    load([rule("wo.pattern", "employee", "501", "custom"), rule("wo.custom_days", "employee", "501", [1])]);
    expect([SUN, MON, SAT_2ND, SAT_3RD].filter(isWeeklyOffCandidateDate)).toEqual([SUN, MON, SAT_3RD]);
  });
});

describe("normalisation", () => {
  it("employee codes match the database (bigint, leading zeros dropped)", () => {
    expect(ruleEmployeeKey(" 00123 ")).toBe("123");
    expect(ruleEmployeeKey("000")).toBe("0");
    expect(ruleEmployeeKey("9007199254740993")).toBe("9007199254740993");
    expect(ruleEmployeeKey("EMP-01")).toBe("EMP-01");
    expect(ruleEmployeeKey("  ")).toBeNull();
  });

  it("reads rows from the previous schema", () => {
    expect(normalizeRuleValueRow({ id: 1, rule_key: "x", department: "R & M", value: true, previous_value: false, effective_from: "2026-10-01" }))
      .toMatchObject({ scope_type: "department", scope_id: "r & m", scope_label: "R & M", old_value: false, status: "active" });
  });
});

describe("console catalogue", () => {
  it("maps either schema version to one shape", () => {
    expect(normalizeRule({ rule_key: "a", editable: true, allows_department: true })).toMatchObject({
      is_wired: true, editable: true, allowed_scopes: ["company", "department"],
    });
    expect(normalizeRule({ rule_key: "b", is_wired: false, allowed_scopes: ["company", "employee"] })).toMatchObject({
      editable: false, allows_department: false,
    });
  });

  it("hides retired rules and replacements that are not wired yet", () => {
    expect(isRuleVisible(normalizeRule({ hidden_until_wired: true, is_wired: false }))).toBe(false);
    expect(isRuleVisible(normalizeRule({ hidden_until_wired: true, is_wired: true }))).toBe(true);
    expect(isRuleVisible(normalizeRule({ retired: true, is_wired: true }))).toBe(false);
    expect(isRuleVisible(normalizeRule({ is_wired: false }))).toBe(true);
  });

  it("formats the new value types", () => {
    const pattern = { value_type: "select", options: [{ value: "none", label: "No weekly off" }] };
    expect(formatRuleValue(pattern, "none")).toBe("No weekly off");
    const days = { value_type: "multi_number", options: [{ value: 0, label: "Sun" }, { value: 6, label: "Sat" }] };
    expect(formatRuleValue(days, [0, 6])).toBe("Sun, Sat");
    expect(formatRuleValue(days, [])).toBe("None");
    expect(formatRuleValue({ value_type: "time" }, "13:00")).toBe("13:00");
  });

  it("edits weekly-off values in the side panel", () => {
    const pattern = { value_type: "select", options: [{ value: "sun_only" }, { value: "none" }] };
    const days = { value_type: "multi_number", options: [0, 1, 2, 3, 4, 5, 6].map((value) => ({ value })) };
    const ok = { effectiveFrom: "2026-10-08", reason: "policy" };
    expect(parseFormValue(pattern, toFormValue(pattern, "none"))).toBe("none");
    expect(toFormValue(days, [6, 0])).toBe("0,6");
    expect(parseFormValue(days, "0,6")).toEqual([0, 6]);
    expect(parseFormValue(days, "")).toEqual([]);
    expect(validateRuleEdit(pattern, { value: "weekends", ...ok }, "2026-10-08")).toHaveProperty("value");
    expect(validateRuleEdit(pattern, { value: "none", ...ok }, "2026-10-08")).toEqual({});
    expect(validateRuleEdit(days, { value: [0, 7], ...ok }, "2026-10-08")).toHaveProperty("value");
    expect(validateRuleEdit(days, { value: [5], ...ok }, "2026-10-08")).toEqual({});
  });
});
