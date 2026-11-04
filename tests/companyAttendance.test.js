import { describe, expect, it } from "vitest";
import { summarizeCompanyAttendance } from "../src/pages/dashboard/companyAttendance.js";

const TODAY = "2026-11-04";

describe("company attendance summary", () => {
  it("splits today into on time, late, leave, and absent from punches and leave marks", () => {
    const summary = summarizeCompanyAttendance({
      today: TODAY,
      days: 1,
      employees: [
        { empCode: "1", department: "HR" },
        { empCode: "2", department: "HR" },
        { empCode: "3", department: "Operations" },
        { empCode: "4", department: "Operations" },
      ],
      punches: [
        { employee_code: "1", punch_date: TODAY, punch_time: "08:50" },
        { employee_code: "2", punch_date: TODAY, punch_time: "10:15" },
      ],
      marks: [{ emp_code: "3", register_date: TODAY, mark: "PL" }],
    });

    expect(summary.company).toMatchObject({ on: 1, late: 1, leave: 1, absent: 1, present: 2, expected: 4 });
    expect(summary.company.pct).toBeCloseTo(50, 5);
    expect(summary.departments.map((row) => row.name)).toEqual(["HR", "Operations"]);
    expect(summary.departments[0].pct).toBeCloseTo(100, 5);
    expect(summary.trend).toHaveLength(1);
    expect(summary.trend[0].present).toBe(2);
  });

  it("counts site attendance when nobody is on the office roster", () => {
    const summary = summarizeCompanyAttendance({
      today: TODAY,
      days: 1,
      employees: [],
      punches: [],
      marks: [],
      siteRows: [
        { att_date: TODAY, att_code: "P", department: "Operations" },
        { att_date: TODAY, att_code: "A", department: "Operations" },
        { att_date: TODAY, att_code: "L", department: "HR" },
        { att_date: TODAY, att_code: "WO", department: "HR" },
      ],
    });
    expect(summary.company).toMatchObject({ on: 2, leave: 1, absent: 0, expected: 3 });
    expect(summary.departments.map((row) => row.name)).toEqual(["Operations", "HR"]);
  });

  it("keeps a clock-in that is not on the office roster", () => {
    const summary = summarizeCompanyAttendance({
      today: TODAY,
      days: 1,
      employees: [],
      punches: [{ employee_code: "88", punch_date: TODAY, punch_time: "09:05" }],
      marks: [],
    });
    expect(summary.company.present).toBe(1);
    expect(summary.company.expected).toBe(1);
    expect(summary.departments[0].name).toBe("Unassigned");
  });

  it("does not count the same person on the office roster and the site sheet", () => {
    const summary = summarizeCompanyAttendance({
      today: TODAY,
      days: 1,
      employees: [{ empCode: "1", department: "HR" }],
      punches: [{ employee_code: "1", punch_date: TODAY, punch_time: "08:50" }],
      marks: [],
      siteRows: [{ att_date: TODAY, att_code: "P", unique_code: "1", department: "HR" }],
    });
    expect(summary.company.expected).toBe(1);
    expect(summary.company.present).toBe(1);
  });

  it("keeps a weekly off out of the working-day count", () => {
    const summary = summarizeCompanyAttendance({
      today: "2026-11-01",
      days: 1,
      employees: [{ empCode: "9", department: "HR" }],
      punches: [],
      marks: [],
    });
    expect(summary.company.expected).toBe(0);
    expect(summary.company.absent).toBe(0);
  });
});
