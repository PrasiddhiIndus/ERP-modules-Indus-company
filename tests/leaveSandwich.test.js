import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => ({ supabase: {} }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    throw new Error("Real Supabase client blocked in tests");
  },
}));

const {
  enumerateLeaveDatesWithSandwich,
  isHalfDayLeaveRequest,
  registerMarkBlocksWoSandwich,
} = await import("../src/lib/attendanceDaily.js");

describe("enumerateLeaveDatesWithSandwich", () => {
  it("includes Sunday between Friday and Monday for full-day leave", () => {
    // Fri 2026-10-02 … Mon 2026-10-05 (Sun 4th is weekoff)
    expect(enumerateLeaveDatesWithSandwich("2026-10-02", "2026-10-05")).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
  });

  it("does not sandwich Sunday when the leave request is half-day", () => {
    // Sat 2026-10-03 … Mon 2026-10-05 — Sunday must stay out for half-day
    expect(
      enumerateLeaveDatesWithSandwich("2026-10-03", "2026-10-05", { halfDay: true })
    ).toEqual(["2026-10-03", "2026-10-05"]);
    expect(
      enumerateLeaveDatesWithSandwich("2026-10-03", "2026-10-05", { days: 0.5 })
    ).toEqual(["2026-10-03", "2026-10-05"]);
  });

  it("half-day single day is unchanged", () => {
    expect(enumerateLeaveDatesWithSandwich("2026-10-05", "2026-10-05", { halfDay: true })).toEqual([
      "2026-10-05",
    ]);
  });
});

describe("isHalfDayLeaveRequest", () => {
  it("detects days = 0.5", () => {
    expect(isHalfDayLeaveRequest({ days: 0.5 })).toBe(true);
    expect(isHalfDayLeaveRequest({ days: "0.5" })).toBe(true);
    expect(isHalfDayLeaveRequest({ days: 1 })).toBe(false);
    expect(isHalfDayLeaveRequest({})).toBe(false);
  });
});

describe("registerMarkBlocksWoSandwich", () => {
  it("blocks half-day composites, P(OD), and punch-sourced Present", () => {
    expect(registerMarkBlocksWoSandwich("P/PL")).toBe(true);
    expect(registerMarkBlocksWoSandwich("P/SL")).toBe(true);
    expect(registerMarkBlocksWoSandwich("P/CL")).toBe(true);
    expect(registerMarkBlocksWoSandwich("HD")).toBe(true);
    expect(registerMarkBlocksWoSandwich("P(OD)")).toBe(true);
    expect(registerMarkBlocksWoSandwich("P", "punch")).toBe(true);
  });

  it("does not block manual Present, tour, or full-day leave", () => {
    // Bare P with no source is treated as punch by isPunchMarkSource (DB-aligned).
    expect(registerMarkBlocksWoSandwich("P", "manual")).toBe(false);
    expect(registerMarkBlocksWoSandwich("PL")).toBe(false);
    expect(registerMarkBlocksWoSandwich("WO")).toBe(false);
    expect(registerMarkBlocksWoSandwich("T")).toBe(false);
  });

  it("skips WO between anchors when a flank blocks", () => {
    // Fri 2026-10-09 … Mon 2026-10-12 (Sun 11th weekoff) — Fri is P/PL
    expect(
      enumerateLeaveDatesWithSandwich("2026-10-09", "2026-10-12", {
        blocksWoSandwichAnchor: (iso) => iso === "2026-10-09",
      })
    ).toEqual(["2026-10-09", "2026-10-10", "2026-10-12"]);
  });
});
