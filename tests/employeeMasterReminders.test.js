import { describe, it, expect } from "vitest";
import {
  employeesWithBirthdayInRange,
  employeesWithAnniversaryInRange,
  employeesWithWorkAnniversaryInRange,
  employeesWithBirthdayToday,
  celebrationOccurrenceIsoInRange,
  summarizeReminderCoverage,
  computeWorkAnniversaryYears,
} from "../src/utils/employeeMasterReminders.js";

const employees = [
  { id: 1, full_name: "ISO mid-month", status: "Active", date_of_birth: "1990-08-11", date_of_anniversary: "2015-08-20", date_of_joining: "2019-08-05" },
  { id: 2, full_name: "First of month", status: "Active", date_of_birth: "1988-08-01", date_of_joining: "2020-08-01" },
  { id: 3, full_name: "Last of month", status: "Active", date_of_birth: "1988-08-31", date_of_joining: "2020-08-31" },
  { id: 4, full_name: "dd-mm-yyyy", status: "Active", date_of_birth: "15-08-1991" },
  { id: 5, full_name: "dd/mm/yyyy", status: "Active", date_of_birth: "22/08/1992" },
  { id: 6, full_name: "timestamp", status: "Active", date_of_birth: "1993-08-09T00:00:00.000Z" },
  { id: 7, full_name: "Leap day", status: "Active", date_of_birth: "1992-02-29" },
  { id: 8, full_name: "Muted", status: "Active", date_of_birth: "1990-08-14", birthday_reminder: false },
  { id: 9, full_name: "No status", date_of_birth: "1990-08-18" },
  { id: 10, full_name: "Inactive", status: "Inactive", date_of_birth: "1990-08-19" },
  { id: 11, full_name: "Blank dob", status: "Active", date_of_birth: "" },
  { id: 12, full_name: "Null dob", status: "Active", date_of_birth: null },
  { id: 13, full_name: "Other month", status: "Active", date_of_birth: "1990-09-11" },
];

const names = (rows) => rows.map((r) => r.full_name);

describe("reminder capture audit", () => {
  it("captures every stored date format in an August range", () => {
    const got = names(employeesWithBirthdayInRange(employees, "2026-08-01", "2026-08-31"));
    expect(got).toEqual([
      "ISO mid-month",
      "First of month",
      "Last of month",
      "dd-mm-yyyy",
      "dd/mm/yyyy",
      "timestamp",
      "No status",
    ]);
  });

  it("captures wedding and work anniversaries in range", () => {
    expect(names(employeesWithAnniversaryInRange(employees, "2026-08-01", "2026-08-31"))).toEqual([
      "ISO mid-month",
    ]);
    expect(names(employeesWithWorkAnniversaryInRange(employees, "2026-08-01", "2026-08-31"))).toEqual([
      "ISO mid-month",
      "First of month",
      "Last of month",
    ]);
  });

  it("shows a 29 Feb birthday inside February of a non-leap year", () => {
    expect(names(employeesWithBirthdayInRange(employees, "2026-02-01", "2026-02-28"))).toEqual([
      "Leap day",
    ]);
    expect(celebrationOccurrenceIsoInRange("1992-02-29", "2026-02-01", "2026-02-28")).toBe("2026-02-28");
    expect(celebrationOccurrenceIsoInRange("1992-02-29", "2028-02-01", "2028-02-29")).toBe("2028-02-29");
  });

  it("handles ranges that cross a year boundary", () => {
    expect(celebrationOccurrenceIsoInRange("1990-01-05", "2026-12-15", "2027-01-15")).toBe("2027-01-05");
    expect(celebrationOccurrenceIsoInRange("1990-12-20", "2026-12-15", "2027-01-15")).toBe("2026-12-20");
    expect(celebrationOccurrenceIsoInRange("1990-06-10", "2026-12-15", "2027-01-15")).toBe("");
  });

  it("includes both boundary days of the range", () => {
    expect(celebrationOccurrenceIsoInRange("1990-08-01", "2026-08-01", "2026-08-31")).toBe("2026-08-01");
    expect(celebrationOccurrenceIsoInRange("1990-08-31", "2026-08-01", "2026-08-31")).toBe("2026-08-31");
    expect(celebrationOccurrenceIsoInRange("1990-08-11", "2026-08-11", "2026-08-11")).toBe("2026-08-11");
    expect(celebrationOccurrenceIsoInRange("1990-08-11", "2026-08-10", "2026-08-10")).toBe("");
  });

  it("matches today's celebrations", () => {
    expect(names(employeesWithBirthdayToday(employees, new Date(2026, 7, 11)))).toEqual(["ISO mid-month"]);
    expect(names(employeesWithBirthdayToday(employees, new Date(2026, 1, 28)))).toEqual(["Leap day"]);
  });

  it("reports why employees are missing from reminder lists", () => {
    expect(summarizeReminderCoverage(employees)).toEqual({
      activeEmployees: 12,
      missingBirthday: 2,
      missingAnniversary: 11,
      missingJoiningDate: 9,
      mutedBirthday: 1,
      mutedAnniversary: 0,
    });
  });

  it("computes tenure years for work anniversaries", () => {
    expect(computeWorkAnniversaryYears("2019-08-05", "2026-08-11")).toBe(7);
    expect(computeWorkAnniversaryYears("2020-08-31", "2026-08-31")).toBe(6);
    expect(computeWorkAnniversaryYears("2020-09-01", "2026-08-31")).toBe(5);
  });
});
