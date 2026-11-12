import { describe, expect, it } from "vitest";
import { buildPulseDetail } from "../src/pages/dashboard/companyPulseDetailModel.js";

const modules = {
  people: 120,
  leavePending: 4,
  manpowerTotal: 8,
  manpowerPending: 2,
  manpowerDueSoon: 1,
  manpowerApproved: 5,
  commercialPending: 1,
  amcActive: 20,
  amcAtRisk: 1,
  amcComplaints: 2,
};

const pl = {
  revenue: 500000,
  expense: 300000,
  profit: 200000,
  margin: 40,
  sitesReporting: 2,
  lossSites: 1,
  thinSites: 1,
  warnMargin: 8,
  siteRows: [
    { id: "s1", name: "Alpha", revenue: 400000, expense: 100000, profit: 300000, margin: 75 },
    { id: "s2", name: "Beta", revenue: 100000, expense: 200000, profit: -100000, margin: -100 },
  ],
  trend: [{ key: "2026-11", name: "Nov 26", fullName: "November 2026", revenue: 100000, expense: 80000, profit: 20000 }],
};

const commercialStats = {
  contractBook: 1000000,
  billed: 400000,
  unbilled: 600000,
  collected: 200000,
  outstanding: 200000,
  invoiceCount: 4,
};

const attendance = {
  company: { on: 10, late: 2, leave: 1, absent: 1, present: 12, expected: 14, pct: 85.7 },
  departments: [{ name: "Ops", on: 4, late: 1, leave: 0, absent: 0, present: 5, expected: 5, pct: 100 }],
};

const paths = {
  people: "/app/hr",
  attendance: "/app/attendance",
  ledger: "/app/accounts-finance/reports/site-ledger",
  receivables: "/app/billing/reports",
};

describe("companyPulseDetail", () => {
  it("builds people detail with attendance pressure and actions", () => {
    const detail = buildPulseDetail("people", { modules, attendance, paths });
    expect(detail.title).toBe("People");
    expect(detail.headline.value).toContain("120");
    expect(detail.metrics.some((m) => m.label === "Leave queue")).toBe(true);
    expect(detail.attention.some((a) => a.label === "Leave waiting")).toBe(true);
    expect(detail.actions.some((a) => a.path === "/app/hr")).toBe(true);
  });

  it("builds module detail with links as breakout rows", () => {
    const detail = buildPulseDetail("module", {
      view: {
        id: "hr",
        name: "HR",
        short: "HR",
        canOpen: true,
        openPath: "/app/hr",
        attention: true,
        metrics: [
          { label: "People", value: "120" },
          { label: "Leave queue", value: "4" },
        ],
        links: [{ label: "Attendance", path: "/app/hr/attendance" }],
      },
    });
    expect(detail.title).toBe("HR");
    expect(detail.attention.length).toBeGreaterThan(0);
    expect(detail.rows[0].path).toBe("/app/hr/attendance");
  });

  it("builds site and month chart details", () => {
    const site = buildPulseDetail("site", { site: pl.siteRows[1], pl, paths });
    expect(site.title).toBe("Beta");
    expect(site.attention.some((a) => a.label === "Site in loss")).toBe(true);

    const month = buildPulseDetail("month", { month: pl.trend[0], paths });
    expect(month.title).toBe("November 2026");
    expect(month.actions[0].path).toContain("slMonth=2026-11");
  });

  it("builds commercial gauge details", () => {
    const billed = buildPulseDetail("billed", { commercialStats, billRate: 40, collectRate: 50, paths, rangeLabel: "FY" });
    expect(billed.headline.value).toMatch(/L|Cr|₹|400/);
    expect(billed.attention.length).toBeGreaterThan(0);

    const collect = buildPulseDetail("collectRate", { commercialStats, billRate: 40, collectRate: 50, paths });
    expect(collect.headline.value).toBe("50%");
  });
});
