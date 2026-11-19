/**
 * Renders the real sidebar (Layout) for sample permission sets and checks that only granted
 * modules and pages appear. The collapsed rail is forced on so every module flyout renders.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  ROLES,
  getAccessibleModules,
  getAccessibleSubModulePaths,
  getNavVisibleModuleKeys,
} from "../src/config/roles.js";

let authValue = null;
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authValue }));
vi.mock("../src/contexts/AuditConsoleContext", () => ({ useAuditConsole: () => ({ isConsoleVisible: false }) }));
vi.mock("../src/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: () => {} }) }));
vi.mock("../src/pages/adminOperations/probationReviews/probationAccess", () => ({
  useProbationReviewsAccess: () => ({ canAccess: false }),
}));
vi.mock("../src/components/PoApprovalBell", () => ({ default: () => null }));
vi.mock("../src/components/ActivityLogDrawer", () => ({ default: () => null }));
vi.mock("../src/components/CommandPalette", () => ({ default: () => null }));

let Layout;
beforeAll(async () => {
  globalThis.localStorage = { getItem: () => "1", setItem: () => {}, removeItem: () => {} };
  Layout = (await import("../src/contexts/Layout.jsx")).default;
});

function renderSidebar(profile, path = "/app/settings") {
  const accessibleModules = getAccessibleModules(profile);
  const subModulePaths = getAccessibleSubModulePaths(profile);
  authValue = {
    user: { id: "u1", email: profile.email, user_metadata: {} },
    userProfile: profile,
    accessibleModules,
    subModulePaths,
    navVisibleModules: getNavVisibleModuleKeys(profile, accessibleModules),
    signOut: () => {},
  };
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app" element={<Layout />}>
          <Route path="*" element={null} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const titles = [...nav.matchAll(/data-title="([^"]+)"/g)].map((m) => m[1]);
  return { hrefs, titles, nav };
}

const exec = (subs, extra = {}) => ({
  id: "u1",
  role: ROLES.EXECUTIVE,
  team: "",
  email: "someone@indusfire.com",
  allowed_modules: [],
  allowed_sub_modules: subs,
  ...extra,
});

describe("sidebar shows only granted modules and pages", () => {
  it("AMC: one page granted → AMC with that page only", () => {
    const { hrefs, titles } = renderSidebar(exec(["amc.customers"]));
    expect(titles).toContain("AMC Management");
    expect(hrefs).toContain("/app/amc/customers");
    expect(hrefs.filter((h) => h.startsWith("/app/amc"))).toEqual(["/app/amc/customers"]);
  });

  it("Site Operations: Fleet only → no Manpower Operations", () => {
    const { hrefs, titles } = renderSidebar(exec(["operations.fleet"]));
    expect(hrefs).toContain("/app/fire-tender-vehicle-management");
    expect(titles).not.toContain("Site Operations");
    expect(hrefs.some((h) => h.startsWith("/app/operations"))).toBe(false);
  });

  it("IT/IS: API Health only → no Software Subscriptions", () => {
    const { hrefs } = renderSidebar(exec(["itIs.api-health"]));
    expect(hrefs).toContain("/app/api-health");
    expect(hrefs).not.toContain("/app/software-subscriptions-reminders");
  });

  it("HR: a single Recruitment tab → HR shows Recruitment, nothing else", () => {
    const { hrefs, titles } = renderSidebar(exec(["hr.recruitment.candidates"]));
    expect(titles).toContain("HR Site");
    expect(hrefs).toContain("/app/hr/calling-master/candidates");
    expect(hrefs.some((h) => h === "/app/attendance" || h.startsWith("/app/hr/dashboard"))).toBe(false);
  });

  it("Finance: P&L site scope only → Finance with P&L, no other finance pages", () => {
    const { hrefs, titles } = renderSidebar(exec(["finance.pl.fire"]));
    expect(titles).toContain("Finance");
    expect(hrefs).not.toContain("/app/accounts-finance/bank-formats");
  });

  it("a module with no granted page is hidden entirely", () => {
    // Admin "store" pages are switched off in the sidebar, so this grant has nothing to show.
    const { titles } = renderSidebar(exec(["admin.store"]));
    expect(titles).not.toContain("IN-House HR/Admin");
  });

  it("full module access keeps every page (unchanged)", () => {
    const { hrefs } = renderSidebar(exec([], { allowed_modules: ["amc", "billing"] }));
    expect(hrefs.filter((h) => h.startsWith("/app/amc")).length).toBe(13);
    expect(hrefs.filter((h) => h.startsWith("/app/billing")).length).toBe(10);
  });

  it("Super Admin still sees every module", () => {
    const { titles, hrefs } = renderSidebar(exec([], { role: ROLES.SUPER_ADMIN }));
    for (const t of ["HR Site", "Projects", "AMC Management", "Billing", "Marketing", "Maintenance (M&amp;M)", "Finance"]) {
      expect(titles).toContain(t);
    }
    expect(hrefs).toContain("/app/software-subscriptions-reminders");
    expect(hrefs).toContain("/app/api-health");
  });
});
