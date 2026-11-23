import { describe, expect, it } from "vitest";
import {
  isInactiveCellClosed,
  personIsVisibleInAttendanceMonth,
  personInactiveDate,
} from "../src/lib/siteAttendance/attendanceRules.js";
import { personVisibleInRange, getRange } from "../src/lib/siteAttendance/salaryCycle.js";
import { parseDateOnlyLocal } from "../src/lib/siteAttendance/dateFormat.js";

const prakash = {
  id: 284,
  unique_code: "5904",
  full_name: "Prakash Bera",
  joining_date: "2022-09-09",
  leaving_date: "2026-08-05",
  is_active: false,
};

describe("inactive / leaving date visibility", () => {
  it("reads leaving_date as the inactive date", () => {
    expect(personInactiveDate(prakash)?.toISOString().slice(0, 10)).toBe(
      parseDateOnlyLocal("2026-08-05").toISOString().slice(0, 10)
    );
    expect(personInactiveDate({ ...prakash, leaving_date: null })).toBeNull();
  });

  it("shows the person in the leaving month and hides later months", () => {
    expect(personIsVisibleInAttendanceMonth(prakash, 2026, 8, true, 1, 31)).toBe(true);
    expect(personIsVisibleInAttendanceMonth(prakash, 2026, 9, true, 1, 30)).toBe(false);
    expect(personIsVisibleInAttendanceMonth(prakash, 2026, 10, true, 1, 31)).toBe(false);

    const aug = getRange(2026, 8, 1, 31);
    const sep = getRange(2026, 9, 1, 30);
    expect(personVisibleInRange(prakash, aug)).toBe(true);
    expect(personVisibleInRange(prakash, sep)).toBe(false);
  });

  it("closes cells after the inactive date and keeps the inactive day open", () => {
    expect(isInactiveCellClosed(prakash, parseDateOnlyLocal("2026-08-05"))).toBe(false);
    expect(isInactiveCellClosed(prakash, parseDateOnlyLocal("2026-08-06"))).toBe(true);
    expect(isInactiveCellClosed(prakash, parseDateOnlyLocal("2026-08-31"))).toBe(true);
    expect(isInactiveCellClosed(prakash, parseDateOnlyLocal("2026-08-01"))).toBe(false);
  });

  it("hides inactive people with no leaving date from every month", () => {
    const noDate = { ...prakash, leaving_date: null, is_active: false };
    expect(personIsVisibleInAttendanceMonth(noDate, 2026, 8, true, 1, 31)).toBe(false);
    expect(personIsVisibleInAttendanceMonth(noDate, 2026, 7, true, 1, 31)).toBe(false);
  });

  it("keeps active employees without a leaving date visible", () => {
    const active = { ...prakash, is_active: true, leaving_date: null };
    expect(personIsVisibleInAttendanceMonth(active, 2026, 8, true, 1, 31)).toBe(true);
    expect(personIsVisibleInAttendanceMonth(active, 2026, 9, true, 1, 30)).toBe(true);
    expect(isInactiveCellClosed(active, parseDateOnlyLocal("2026-08-06"))).toBe(false);
  });
});
