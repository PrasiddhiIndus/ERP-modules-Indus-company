import { describe, expect, it, afterEach } from "vitest";
import {
  attachRegisterRowSummaries,
  buildMonthlyRegisterGrid,
  isRegisterDayBeforeJoining,
  isRegisterPreJoiningExcludedMark,
} from "../src/lib/attendanceDaily.js";
import { resetAttendanceRulesCache, setRulesSnapshot } from "../src/lib/attendanceRules.js";

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

describe("pre-DOJ WO / NH/PH exclusion", () => {
  it("detects days strictly before joining", () => {
    expect(isRegisterDayBeforeJoining("2026-11-10", "2026-11-15")).toBe(true);
    expect(isRegisterDayBeforeJoining("2026-11-15", "2026-11-15")).toBe(false);
    expect(isRegisterDayBeforeJoining("2026-11-16", "2026-11-15")).toBe(false);
    expect(isRegisterDayBeforeJoining("2026-11-10", "")).toBe(false);
    expect(isRegisterPreJoiningExcludedMark("WO")).toBe(true);
    expect(isRegisterPreJoiningExcludedMark("NH/PH")).toBe(true);
    expect(isRegisterPreJoiningExcludedMark("P")).toBe(false);
  });

  it("blanks WO before DOJ and does not count them in summaries", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    // Nov 2026: Sundays 1, 8, 15, 22, 29. Join on 15th → 1 and 8 must not count.
    const emp = {
      empCode: "9001",
      employeeName: "Mid-month Joiner",
      department: "HR",
      employeeId: "9001",
      dateOfJoining: "2026-11-15",
    };

    const { rows, daysInMonth } = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: {
        9001: {
          1: "WO",
          8: "NH/PH",
          15: "WO",
          22: "WO",
        },
      },
      markSources: {
        9001: {
          1: "auto_wo",
          8: "auto_holiday",
          15: "auto_wo",
          22: "auto_wo",
        },
      },
    });

    expect(rows[0].dayMarks[1]).toBe("");
    expect(rows[0].dayMarks[8]).toBe("");
    expect(rows[0].dayMarks[15]).toBe("WO");
    expect(rows[0].dayMarks[22]).toBe("WO");

    const [summaryRow] = attachRegisterRowSummaries(rows, { 9001: { 15: "WO", 22: "WO" } }, daysInMonth, {
      year: 2026,
      month: 11,
      holidayDates: new Set(["2026-11-08"]),
    });
    // Pre-DOJ WO/NH·PH (1, 8) excluded; post-DOJ offs still count (15, 21 3rd-Sat, 22, 29).
    expect(summaryRow.summary.weekoff).toBe(4);
    expect(summaryRow.summary.nhph).toBe(0);
    expect(summaryRow.dayMarks[1]).toBe("");
    expect(summaryRow.dayMarks[8]).toBe("");
  });

  it("keeps on/after DOJ calculations unchanged when DOJ is missing", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    const emp = {
      empCode: "9002",
      employeeName: "Full month",
      department: "HR",
      employeeId: "9002",
    };
    const { rows } = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: {},
    });
    // Sunday 1 Nov still auto WO when no DOJ.
    expect(rows[0].dayMarks[1]).toBe("WO");
  });
});
