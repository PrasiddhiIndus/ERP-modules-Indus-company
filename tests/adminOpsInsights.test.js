import { describe, expect, it } from "vitest";
import {
  buildAttendanceBehaviourInsights,
  buildModuleCoverage,
  linearSlope,
} from "../src/pages/adminOperations/adminOpsInsights.js";

describe("adminOpsInsights", () => {
  it("computes late/OT rates and notes from punch rows", () => {
    const rows = [
      { punchDate: "2026-11-10", empCode: "E1", employeeName: "Ada", department: "Ops", punchInStatus: "Late", workedMinutes: 600 },
      { punchDate: "2026-11-10", empCode: "E2", employeeName: "Bob", department: "Ops", punchInStatus: "On time", workedMinutes: 480 },
      { punchDate: "2026-11-11", empCode: "E1", employeeName: "Ada", department: "Ops", punchInStatus: "Late", workedMinutes: 620 },
      { punchDate: "2026-11-11", empCode: "E2", employeeName: "Bob", department: "Ops", punchInStatus: "Late", workedMinutes: 500 },
      { punchDate: "2026-11-12", empCode: "E1", employeeName: "Ada", department: "Ops", punchInStatus: "Late", workedMinutes: 610 },
      { punchDate: "2026-11-12", empCode: "E3", employeeName: "Cy", department: "HR", punchInStatus: "On time", workedMinutes: 540 },
    ];
    const insights = buildAttendanceBehaviourInsights(rows);
    expect(insights.totals.punchDays).toBe(6);
    expect(insights.totals.lateDays).toBe(4);
    expect(insights.totals.lateRate).toBeGreaterThan(50);
    expect(insights.trend.length).toBe(3);
    expect(insights.deptBars.some((d) => d.fullName === "Ops")).toBe(true);
    expect(insights.habitualLate.some((e) => e.empCode === "E1")).toBe(true);
    expect(insights.notes.length).toBeGreaterThan(0);
  });

  it("filters by department", () => {
    const rows = [
      { punchDate: "2026-11-10", empCode: "E1", department: "Ops", punchInStatus: "Late", workedMinutes: 500 },
      { punchDate: "2026-11-10", empCode: "E2", department: "HR", punchInStatus: "On time", workedMinutes: 480 },
    ];
    const insights = buildAttendanceBehaviourInsights(rows, { department: "HR" });
    expect(insights.totals.punchDays).toBe(1);
    expect(insights.totals.lateDays).toBe(0);
  });

  it("builds module coverage tiles", () => {
    const tiles = buildModuleCoverage({
      leavePending: 2,
      tourPending: 1,
      leaveAlerts: 3,
      activeEmployees: 100,
      lateRate: 18,
      recruitment: { pendingRequisitions: 1, offersPending: 2, documentsToReview: 0, interviewsToEvaluate: 1, openRequisitions: 4 },
    });
    expect(tiles.find((t) => t.id === "leave").value).toBe(2);
    expect(tiles.find((t) => t.id === "hiring").value).toBe(4);
    expect(tiles.find((t) => t.id === "attendance").tone).toBe("warning");
  });

  it("estimates linear slope", () => {
    expect(linearSlope([1, 2, 3, 4])).toBeCloseTo(1, 5);
    expect(linearSlope([4, 3, 2, 1])).toBeCloseTo(-1, 5);
  });
});
