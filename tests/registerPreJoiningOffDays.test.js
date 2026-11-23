import { describe, expect, it, afterEach } from "vitest";
import {
  attachRegisterRowSummaries,
  buildMonthlyRegisterGrid,
  isRegisterDayBeforeJoining,
  isRegisterPreJoiningExcludedMark,
  resolveEmployeeDateOfJoining,
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
    expect(resolveEmployeeDateOfJoining({ date_of_joining: "20/11/2026" })).toBe("2026-11-20");
    expect(resolveEmployeeDateOfJoining({ dateOfJoining: "2026-11-20" })).toBe("2026-11-20");
  });

  it("ignores stored pre-DOJ WO even when present in manualMarks (11200-style)", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    // DOJ 23 Nov 2026: 3rd Sat 21 + Sunday 22 must blank; Sunday 29 remains.
    const emp = {
      empCode: "11200",
      employeeName: "Makwana Keyurkumar Harishbhai",
      department: "Human Resource",
      employeeId: "11200",
      date_of_joining: "2026-11-23",
    };
    const { rows, daysInMonth } = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: {
        11200: { 1: "WO", 8: "WO", 15: "WO", 21: "WO", 22: "WO", 29: "WO" },
      },
      markSources: {
        11200: {
          1: "auto_wo",
          8: "auto_wo",
          15: "auto_wo",
          21: "auto_wo",
          22: "auto_wo",
          29: "auto_wo",
        },
      },
    });
    expect(rows[0].dayMarks[1]).toBe("");
    expect(rows[0].dayMarks[8]).toBe("");
    expect(rows[0].dayMarks[15]).toBe("");
    expect(rows[0].dayMarks[21]).toBe(""); // 3rd Sat before DOJ
    expect(rows[0].dayMarks[22]).toBe(""); // Sunday before DOJ
    expect(rows[0].dayMarks[29]).toBe("WO");
    const [summaryRow] = attachRegisterRowSummaries(
      rows,
      { 11200: { 29: "WO" } },
      daysInMonth,
      { year: 2026, month: 11 }
    );
    expect(summaryRow.summary.weekoff).toBe(1);
    expect(summaryRow.summary.totalPresent).toBe(0);
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

  it("excludes 3rd Saturday before DOJ from weekoff and Total present", () => {
    setRulesSnapshot({ values: companySun3rd, groups: [], members: [] });
    // Nov 2026: 3rd Saturday = 21. Join on 25th → 21 and Sunday 22 must not count.
    const emp = {
      empCode: "9003",
      employeeName: "After 3rd Sat",
      department: "HR",
      employeeId: "9003",
      dateOfJoining: "2026-11-25",
    };
    const { rows, daysInMonth } = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: {
        9003: { 21: "WO", 22: "WO", 29: "WO" },
      },
      markSources: {
        9003: { 21: "auto_wo", 22: "auto_wo", 29: "auto_wo" },
      },
    });
    expect(rows[0].dayMarks[21]).toBe("");
    expect(rows[0].dayMarks[22]).toBe("");
    expect(rows[0].dayMarks[29]).toBe("WO");

    const [summaryRow] = attachRegisterRowSummaries(
      rows,
      { 9003: { 29: "WO" } },
      daysInMonth,
      { year: 2026, month: 11 }
    );
    // Only post-DOJ Sunday WO (29). 3rd-Sat WO must not inflate Total present.
    expect(summaryRow.summary.weekoff).toBe(1);
    expect(summaryRow.summary.totalPresent).toBe(0);
  });

  it("does not credit blank Production 3rd Saturday before DOJ", () => {
    setRulesSnapshot({
      values: [
        {
          id: 1,
          rule_key: "wo.pattern",
          scope_type: "department",
          scope_id: "production",
          value: "sun_only",
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
      ],
      groups: [],
      members: [],
    });
    const emp = {
      empCode: "9004",
      employeeName: "Prod mid-month",
      department: "Production",
      employeeId: "9004",
      dateOfJoining: "2026-11-25",
    };
    const { rows, daysInMonth } = buildMonthlyRegisterGrid([], [emp], {
      year: 2026,
      month: 11,
      manualMarks: {},
    });
    // 21 Nov is blank (works 3rd Sat) and before DOJ — must not get paid-blank credit.
    expect(rows[0].dayMarks[21]).toBe("");
    const [summaryRow] = attachRegisterRowSummaries(rows, {}, daysInMonth, {
      year: 2026,
      month: 11,
    });
    expect(summaryRow.summary.totalPresent).toBe(0);
  });
});
