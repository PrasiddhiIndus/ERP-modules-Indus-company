import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ATTENDANCE_TIMES,
  attendanceTimesFor,
  resetAttendanceRulesCache,
  setEmployeeDepartments,
  setRulesSnapshot,
} from "../src/lib/attendanceRules.js";
import {
  isPurplePresentPunch,
  mergeApprovedLeaveMarksIntoManualMarks,
  pairPunchesToDailyRows,
} from "../src/lib/attendanceDaily.js";
import { punchesToPresentRegisterRows } from "../shared/attendanceRegisterSync.mjs";

const DAY = "2026-10-12";
let nextId = 1;
const row = (rule_key, scope_type, scope_id, value, extra = {}) => ({
  id: nextId++,
  rule_key,
  scope_type,
  scope_id,
  value,
  effective_from: "2026-10-01",
  status: "active",
  ...extra,
});
const setupRows = Object.entries({
  "att.half_day_cutoff": "13:00",
  "att.purple_first_from": "12:00",
  "att.purple_first_to": "15:00",
  "att.purple_last_before": "12:00",
  "att.shift_start": "09:00",
  "att.shift_end": "18:00",
  "att.grace_minutes": 0,
  "att.punch_overrides_leave": true,
}).map(([key, value]) => row(key, "company", null, value, { effective_from: "2000-01-01", reason: "Existing rule at setup" }));

const punches = (code, ...times) => times.map((t) => ({ empCode: code, punchDate: DAY, punchTime: t }));

afterEach(() => resetAttendanceRulesCache());

describe("attendance timings from the Rules Console", () => {
  it("defaults equal the times used before (no rules loaded, or only the setup rows)", () => {
    expect(attendanceTimesFor({ employeeCode: "101", onDate: DAY })).toEqual(DEFAULT_ATTENDANCE_TIMES);
    setRulesSnapshot({ values: setupRows });
    expect(attendanceTimesFor({ employeeCode: "101", onDate: DAY })).toEqual(DEFAULT_ATTENDANCE_TIMES);
  });

  it("employee > department > company, with the department looked up from Employee Master", () => {
    setEmployeeDepartments([
      { employee_code: "101", department: "Production" },
      { employee_code: "102", department: "HR" },
    ]);
    setRulesSnapshot({
      values: [
        ...setupRows,
        row("att.shift_start", "department", "production", "08:00"),
        row("att.shift_start", "employee", "102", "10:00"),
        row("att.grace_minutes", "company", null, 10),
      ],
    });
    expect(attendanceTimesFor({ employeeCode: "101", onDate: DAY }).shiftStart).toBe("08:00");
    expect(attendanceTimesFor({ employeeCode: "102", onDate: DAY }).shiftStart).toBe("10:00");
    expect(attendanceTimesFor({ employeeCode: "103", onDate: DAY }).shiftStart).toBe("09:00");
    expect(attendanceTimesFor({ employeeCode: "103", onDate: DAY }).graceMinutes).toBe(10);
  });

  it("invalid values fall back to the built-in time", () => {
    setRulesSnapshot({ values: [...setupRows, row("att.half_day_cutoff", "company", null, "25:99")] });
    expect(attendanceTimesFor({ employeeCode: "101", onDate: DAY }).halfDayCutoff).toBe("13:00");
  });

  it("half-day cut-off and early-leaving time drive marks from punches", () => {
    const before = punchesToPresentRegisterRows(punches("101", "09:00", "13:30"), {
      timesFor: (code, d) => attendanceTimesFor({ employeeCode: code, onDate: d }),
    });
    expect(before[0].mark).toBe("P");
    setRulesSnapshot({ values: [...setupRows, row("att.half_day_cutoff", "employee", "101", "14:00")] });
    const after = punchesToPresentRegisterRows([...punches("101", "09:00", "13:30"), ...punches("102", "09:00", "13:30")], {
      timesFor: (code, d) => attendanceTimesFor({ employeeCode: code, onDate: d }),
    });
    expect(Object.fromEntries(after.map((r) => [r.employee_code, r.mark]))).toEqual({ 101: "HD", 102: "P" });
  });

  it("purple P window per employee", () => {
    const punch = { punchIn: "11:30", punchOut: "18:00" };
    expect(isPurplePresentPunch(punch, { employeeCode: "101", onDate: DAY })).toBe(false);
    setRulesSnapshot({ values: [...setupRows, row("att.purple_first_from", "employee", "101", "11:00")] });
    expect(isPurplePresentPunch(punch, { employeeCode: "101", onDate: DAY })).toBe(true);
    expect(isPurplePresentPunch(punch, { employeeCode: "102", onDate: DAY })).toBe(false);
    expect(isPurplePresentPunch(punch)).toBe(false);
  });

  it("shift start + grace decide Late; shift end decides Early", () => {
    const status = () =>
      Object.fromEntries(
        pairPunchesToDailyRows([...punches("101", "09:05", "17:30"), ...punches("102", "09:05", "17:30")]).map((r) => [
          r.empCode,
          [r.punchInStatus, r.punchOutStatus],
        ])
      );
    expect(status()).toEqual({ 101: ["Late", "Early"], 102: ["Late", "Early"] });
    setRulesSnapshot({
      values: [
        ...setupRows,
        row("att.grace_minutes", "employee", "101", 10),
        row("att.shift_end", "employee", "101", "17:30"),
      ],
    });
    expect(status()).toEqual({ 101: ["On time", "On time"], 102: ["Late", "Early"] });
    expect(pairPunchesToDailyRows(punches("101", "09:05"), { expectedIn: "09:00", expectedOut: "18:00", graceMinutes: 0 })[0].punchInStatus).toBe("Late");
  });

  it("punch overrides leave can be switched off per employee", () => {
    const merge = () =>
      mergeApprovedLeaveMarksIntoManualMarks(
        { 101: { 12: "P" }, 102: { 12: "P" } },
        { 101: { 12: "PL" }, 102: { 12: "PL" } },
        { punches: [...punches("101", "09:00", "18:00"), ...punches("102", "09:00", "18:00")], monthKey: "2026-10" }
      );
    expect(merge()).toEqual({ 101: { 12: "P" }, 102: { 12: "P" } });
    setRulesSnapshot({ values: [...setupRows, row("att.punch_overrides_leave", "employee", "101", false)] });
    expect(merge()).toEqual({ 101: { 12: "PL" }, 102: { 12: "P" } });
  });
});
