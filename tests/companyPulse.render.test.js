import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CompanyPulse from "../src/pages/dashboard/CompanyPulse.jsx";

const modules = {
  people: 120,
  leavePending: 4,
  marketing: 10,
  maintenance: 0,
  projects: 0,
  manpowerTotal: 8,
  manpowerPending: 2,
  manpowerApproved: 5,
  manpowerDueSoon: 1,
  fireTenderTotal: 3,
  fireTenderPending: 1,
  amcActive: 20,
  amcAtRisk: 1,
  amcComplaints: 2,
  commercialPending: 1,
};

const pl = {
  revenue: 500000,
  expense: 300000,
  profit: 200000,
  margin: 40,
  sitesReporting: 1,
  lossSites: 0,
  thinSites: 0,
  warnMargin: 8,
  siteRows: [{ id: "s1", name: "Alpha Site", revenue: 500000, expense: 300000, profit: 200000, margin: 40 }],
  trend: [
    { key: "2026-04", name: "Apr 26", fullName: "April 2026", revenue: 100000, expense: 80000, profit: 20000 },
    { key: "2026-05", name: "May 26", fullName: "May 2026", revenue: 120000, expense: 70000, profit: 50000 },
  ],
};

function renderPulse({ role, allowPath }) {
  return renderToStaticMarkup(
    React.createElement(CompanyPulse, {
      loading: false,
      financeError: "",
      rangeLabel: "Apr-26 → Nov-26",
      fromKey: "2026-04",
      toKey: "2026-11",
      monthChoices: [
        { key: "2026-04", label: "Apr-26" },
        { key: "2026-11", label: "Nov-26" },
      ],
      presets: [
        { id: "month", label: "This month", from: "2026-11", to: "2026-11" },
        { id: "fy", label: "This year", from: "2026-04", to: "2026-11" },
      ],
      activePresetId: "fy",
      profile: { role },
      allowPath,
      modules,
      commercialStats: {
        contractBook: 1000000,
        billed: 400000,
        unbilled: 600000,
        collected: 200000,
        outstanding: 200000,
        invoiceCount: 4,
        poCount: 6,
      },
      pl,
      billRate: 40,
      collectRate: 50,
      billingTrend: [
        { key: "2026-04", value: 100000 },
        { key: "2026-05", value: 120000 },
      ],
    })
  );
}

describe("Company Pulse dashboard", () => {
  it("lists every module for management and opens only assigned paths", () => {
    const html = renderPulse({
      role: "admin",
      allowPath: (path) => String(path).startsWith("/app/hr"),
    });
    expect(html).toContain("Company Pulse");
    expect(html).toContain("This year");
    expect(html).toContain("Marketing");
    expect(html).toContain("Procurement");
    expect(html).toContain("is-locked");
    expect(html).toContain("Open HR");
    expect(html).not.toContain("Result trend");
    expect(html).not.toContain("Commercial book");
  });

  it("hides modules outside an executive assignment", () => {
    const html = renderPulse({
      role: "executive",
      allowPath: (path) => String(path).startsWith("/app/hr"),
    });
    expect(html).toContain("Open HR");
    expect(html).not.toContain("Marketing");
    expect(html).not.toContain(">AMC<");
  });

  it("adds one attendance block under the modules", () => {
    const html = renderToStaticMarkup(
      React.createElement(CompanyPulse, {
        loading: false,
        financeError: "",
        rangeLabel: "Apr-26 → Nov-26",
        fromKey: "2026-04",
        toKey: "2026-11",
        monthChoices: [{ key: "2026-04", label: "Apr-26" }],
        presets: [{ id: "fy", label: "This year", from: "2026-04", to: "2026-11" }],
        activePresetId: "fy",
        profile: { role: "admin" },
        allowPath: () => true,
        modules,
        commercialStats: {
          contractBook: 0,
          billed: 0,
          collected: 0,
          outstanding: 0,
          invoiceCount: 0,
          poCount: 0,
        },
        pl,
        billRate: 0,
        collectRate: 0,
        showAttendance: true,
        attendance: {
          target: 92,
          company: { on: 10, late: 2, leave: 1, absent: 1, present: 12, expected: 14, pct: 85.7 },
          departments: [{ name: "Operations", on: 4, late: 1, leave: 0, absent: 0, present: 5, expected: 5, pct: 100 }],
          trend: [
            { iso: "2026-11-03", weekday: "Tue", label: "3/11", full: "Tuesday, 3 Nov", pct: 90, present: 9, expected: 10 },
          ],
        },
      })
    );
    expect(html).toContain("Company attendance today");
    expect(html).toContain("Attendance by department");
    expect(html).toContain("Revenue · expense · profit");
    expect(html).toContain("Profit by site");
    expect(html).toContain("Operations");
    expect(html).not.toContain("Company attendance trend");
    expect(html).not.toContain("Result trend");
  });
});
