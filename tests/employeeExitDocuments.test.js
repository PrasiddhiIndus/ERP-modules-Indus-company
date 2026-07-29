import { describe, expect, it } from "vitest";
import {
  calculateExperienceParts,
  formatDayNumber,
  formatOrdinalDateLong,
  formatOrdinalSuffix,
  isInactiveEmployeeStatus,
  mapInactiveEmployeeRow,
  resolveResignationDate,
} from "../src/lib/employeeExitDocuments.js";

describe("employeeExitDocuments", () => {
  it("filters inactive and left statuses only", () => {
    expect(isInactiveEmployeeStatus("Inactive")).toBe(true);
    expect(isInactiveEmployeeStatus("Left")).toBe(true);
    expect(isInactiveEmployeeStatus("inactive")).toBe(true);
    expect(isInactiveEmployeeStatus("Active")).toBe(false);
  });

  it("calculates experience between DOJ and DOL", () => {
    const result = calculateExperienceParts("2025-07-01", "2026-07-28");
    expect(result.years).toBe(1);
    expect(result.months).toBe(0);
    expect(result.days).toBe(27);
    expect(result.label).toContain("1 Year");
  });

  it("formats ordinal dates for letter templates", () => {
    expect(formatDayNumber("2025-07-01")).toBe("01");
    expect(formatOrdinalSuffix("2025-07-01")).toBe("st");
    expect(formatOrdinalDateLong("2026-07-28")).toBe("28th July 2026");
  });

  it("maps inactive employee row with resignation fallback", () => {
    const row = mapInactiveEmployeeRow({
      full_name: "Jay Alpeshbhai Patel",
      date_of_joining: "2025-07-01",
      date_of_leaving: "2026-07-28",
      status_changed_at: "2026-06-18",
      address: "Test Address",
    });
    expect(row.experience_label).toMatch(/Year/);
    expect(resolveResignationDate(row)).toBe("2026-06-18");
  });
});
