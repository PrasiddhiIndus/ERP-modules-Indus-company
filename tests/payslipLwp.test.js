import { describe, expect, it } from "vitest";
import { lwpDaysFromMarks } from "../src/lib/payslipLwp.js";

describe("lwpDaysFromMarks", () => {
  it("returns 0 when there are no LWP marks", () => {
    expect(lwpDaysFromMarks(["P", "WO", "PL", "", null])).toBe(0);
  });

  it("counts full LWP as 1 and LWP halves as 0.5", () => {
    expect(lwpDaysFromMarks(["LWP", "lwp", "LWP/PL", "LWP/SL", "LWP/CL", "P"])).toBe(3.5);
  });
});
