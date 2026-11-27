import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PortfolioOverview, {
  applyPortfolioFilters,
  portfolioDelta,
} from "../src/pages/finance/site-ledger/pages/PortfolioOverview.jsx";
import SitesManagement from "../src/pages/finance/site-ledger/pages/SitesManagement.jsx";
import SiteWorkspace from "../src/pages/finance/site-ledger/pages/SiteWorkspace.jsx";
import {
  calcSite,
  calcSiteOverPeriodKeys,
  estTotals,
  parentTotalsSite,
} from "../src/pages/finance/site-ledger/calculations/siteLedgerCalcs.js";
import { PlMarginContext } from "../src/pages/finance/site-ledger/components/SiteLedgerShared.jsx";

const MK = "2026-05";

const site = {
  id: "s1",
  name: "Alpha Site",
  siteGroup: "alpha",
  version: 1,
  status: "active",
  siteType: "fire",
  ocNumber: "OC-1",
  wo: "WO-1",
  contractStart: "2026-04",
  contractEnd: "2027-03",
  structure: [],
  spreads: [],
  estimates: [],
};

const records = { [`s1__${MK}`]: { sales: 1000 } };

const row = {
  ...site,
  hasData: true,
  revenue: 1000,
  expense: 400,
  profit: 600,
  margin: 60,
  est: null,
  pending: false,
  pendingCount: 0,
};
const lossRow = { ...row, id: "s2", name: "Beta Site", revenue: 100, profit: -50, margin: -5 };

const noop = () => {};

function withMargins(node) {
  return React.createElement(PlMarginContext.Provider, { value: { targetMargin: 15, warnMargin: 8 } }, node);
}

describe("siteLedgerCalcs", () => {
  it("mirrors thin wrapper behaviour (profit = revenue - expense)", () => {
    const c = calcSite(site, MK, records);
    expect(c.profit).toBeCloseTo(c.revenue - c.expense);
    const agg = calcSiteOverPeriodKeys(site, [MK], records);
    expect(agg.revenue).toBeCloseTo(c.revenue);
    expect(estTotals(undefined)).toBeNull();
    expect(parentTotalsSite(site, MK, records)).toBeTypeOf("object");
  });
});

describe("PortfolioOverview helpers", () => {
  it("applies search / status / revenue filters unchanged", () => {
    const rows = [row, lossRow];
    const base = { search: "", status: "all", contract: "all", revMin: "", revMax: "" };
    expect(applyPortfolioFilters(rows, base, MK)).toHaveLength(2);
    expect(applyPortfolioFilters(rows, { ...base, status: "loss" }, MK).map((r) => r.id)).toEqual(["s2"]);
    expect(applyPortfolioFilters(rows, { ...base, search: "alpha" }, MK).map((r) => r.id)).toEqual(["s1"]);
    expect(applyPortfolioFilters(rows, { ...base, revMin: "500" }, MK).map((r) => r.id)).toEqual(["s1"]);
  });

  it("portfolioDelta handles missing / zero previous values", () => {
    expect(portfolioDelta(10, 0)).toBeNull();
    expect(portfolioDelta(120, 100)).toEqual({ val: 20, dir: "up" });
  });
});

describe("Site Ledger pages render", () => {
  it("PortfolioOverview renders KPI tiles and filters", () => {
    const html = renderToStaticMarkup(withMargins(
      React.createElement(PortfolioOverview, {
        rows: [row, lossRow],
        sitesL: [site],
        sitesAll: [site],
        records,
        month: MK,
        periodFrom: MK,
        periodTo: MK,
        setPeriodFrom: noop,
        setPeriodTo: noop,
        mLabel: "May 2026",
        chartMonths: [],
        periodKeys: [MK],
        activeMonths: [],
        siteCount: 2,
        totalSiteCount: 2,
        showHistorical: false,
        setShowHistorical: noop,
        openSite: noop,
        goEntry: noop,
        onViewHistory: noop,
      }),
    ));
    expect(html).toContain("Total revenue");
    expect(html).toContain("Negative-margin sites");
    expect(html).toContain("Pending periods");
    expect(html).toContain("Average margin");
  });

  it("SitesManagement renders searchable table with placeholders", () => {
    const html = renderToStaticMarkup(withMargins(
      React.createElement(SitesManagement, {
        rows: [row, lossRow],
        records,
        month: MK,
        sitesAll: [site],
        activeSiteCount: 2,
        query: "",
        setQuery: noop,
        showHistorical: false,
        setShowHistorical: noop,
        inactiveCount: 0,
        openSite: noop,
        onEdit: noop,
        onEditSite: noop,
        onConfig: noop,
        onDelete: noop,
        onDeactivate: noop,
        onActivate: noop,
        onViewHistory: noop,
        onAdd: noop,
        mLabel: "May 2026",
      }),
    ));
    expect(html).toContain("Alpha Site");
    expect(html).toContain("Draft / conflict");
    expect(html).toContain("Add site");
  });

  it("SiteWorkspace renders tabs for a site", () => {
    const html = renderToStaticMarkup(withMargins(
      React.createElement(SiteWorkspace, {
        site,
        sitesAll: [site],
        records,
        periodKeys: [MK],
        periodFrom: MK,
        periodTo: MK,
        setPeriodFrom: noop,
        setPeriodTo: noop,
        mLabel: "May 2026",
        back: noop,
        onEdit: noop,
        onConfig: noop,
        onViewHistory: noop,
        onViewBudget: noop,
        onDeactivate: noop,
        onActivate: noop,
        onDelete: noop,
      }),
    ));
    for (const label of ["Dashboard", "Setup", "Figures", "Budget", "History"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Alpha Site");
  });
});
