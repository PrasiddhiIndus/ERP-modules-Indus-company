import { describe, it, expect } from "vitest";
import {
  ROLES,
  IEV_COSTING_NET_TOTAL_KEY,
  IEV_COSTING_SHEET_KEY,
  canViewIevCostingNetTotal,
  getAccessibleModules,
} from "../src/config/roles.js";
import {
  applyIevCostingNetTotalToggle,
  applyModuleToggle,
  applySubToggle,
  buildAccessTree,
  accessKeyLabel,
} from "../src/pages/userManagement/accessTree/accessModel.js";

describe("canViewIevCostingNetTotal", () => {
  it("allows Super Admin without the Net Total key", () => {
    const profile = { role: ROLES.SUPER_ADMIN, allowed_modules: [], allowed_sub_modules: [] };
    expect(canViewIevCostingNetTotal(profile, getAccessibleModules(profile))).toBe(true);
  });

  it("does not allow full IEV module without the Net Total key", () => {
    const profile = { role: ROLES.EXECUTIVE, allowed_modules: ["fireTender"], allowed_sub_modules: [] };
    expect(canViewIevCostingNetTotal(profile, getAccessibleModules(profile))).toBe(false);
  });

  it("does not allow IEV Costing section without the Net Total key", () => {
    const profile = {
      role: ROLES.EXECUTIVE,
      allowed_modules: [],
      allowed_sub_modules: ["fireTender.costing"],
    };
    expect(canViewIevCostingNetTotal(profile, new Set(["fireTender"]))).toBe(false);
  });

  it("denies Costing Sheet-only users without Net Total Access", () => {
    const profile = {
      role: ROLES.EXECUTIVE,
      allowed_modules: [],
      allowed_sub_modules: [IEV_COSTING_SHEET_KEY],
    };
    expect(canViewIevCostingNetTotal(profile, new Set())).toBe(false);
  });

  it("allows access only when Net Total Access is ticked", () => {
    const profile = {
      role: ROLES.EXECUTIVE,
      allowed_modules: ["fireTender"],
      allowed_sub_modules: [IEV_COSTING_NET_TOTAL_KEY],
    };
    expect(canViewIevCostingNetTotal(profile, getAccessibleModules(profile))).toBe(true);
  });

  it("stops access immediately when Net Total Access is revoked", () => {
    const withKey = {
      role: ROLES.EXECUTIVE,
      allowed_modules: ["fireTender"],
      allowed_sub_modules: [IEV_COSTING_SHEET_KEY, IEV_COSTING_NET_TOTAL_KEY],
    };
    const revoked = applyIevCostingNetTotalToggle(withKey);
    expect(revoked.allowed_sub_modules).not.toContain(IEV_COSTING_NET_TOTAL_KEY);
    expect(canViewIevCostingNetTotal(revoked, getAccessibleModules(revoked))).toBe(false);
  });
});

describe("User Management Net Total Access toggle", () => {
  it("shows Net Total Access beside Costing Sheet", () => {
    const iev = buildAccessTree("").find((n) => n.key === "fireTender");
    const costing = iev.pages.find((p) => p.key === "fireTender.costing");
    const sheet = costing.tabs.find((t) => t.key === IEV_COSTING_SHEET_KEY);
    expect(sheet.extras.map((e) => e.key)).toEqual([IEV_COSTING_NET_TOTAL_KEY]);
    expect(accessKeyLabel(IEV_COSTING_NET_TOTAL_KEY)).toMatch(/Net Total Access/);
  });

  it("grants Costing Sheet when Net Total Access is ticked", () => {
    const next = applyIevCostingNetTotalToggle({
      allowed_modules: [],
      allowed_sub_modules: [],
    });
    expect(next.allowed_sub_modules).toEqual(
      expect.arrayContaining([IEV_COSTING_SHEET_KEY, IEV_COSTING_NET_TOTAL_KEY])
    );
  });

  it("defaults Net Total Access on when full IEV is granted", () => {
    const next = applyModuleToggle({ allowed_modules: [], allowed_sub_modules: [] }, "fireTender");
    expect(next.allowed_modules).toContain("fireTender");
    expect(next.allowed_sub_modules).toContain(IEV_COSTING_NET_TOTAL_KEY);
  });

  it("defaults Net Total Access on when IEV Costing section is granted", () => {
    const next = applySubToggle({ allowed_modules: [], allowed_sub_modules: [] }, "fireTender.costing");
    expect(next.allowed_sub_modules).toEqual(
      expect.arrayContaining(["fireTender.costing", IEV_COSTING_NET_TOTAL_KEY])
    );
  });

  it("clears Net Total Access when Costing Sheet is revoked", () => {
    const start = {
      allowed_modules: [],
      allowed_sub_modules: [IEV_COSTING_SHEET_KEY, IEV_COSTING_NET_TOTAL_KEY],
    };
    const next = applySubToggle(start, IEV_COSTING_SHEET_KEY);
    expect(next.allowed_sub_modules).not.toContain(IEV_COSTING_SHEET_KEY);
    expect(next.allowed_sub_modules).not.toContain(IEV_COSTING_NET_TOTAL_KEY);
  });

  it("keeps a Net Total revoke while full IEV stays granted", () => {
    const start = {
      allowed_modules: ["fireTender"],
      allowed_sub_modules: [IEV_COSTING_NET_TOTAL_KEY],
    };
    const revoked = applyIevCostingNetTotalToggle(start);
    expect(revoked.allowed_modules).toContain("fireTender");
    expect(revoked.allowed_sub_modules).not.toContain(IEV_COSTING_NET_TOTAL_KEY);
    // Re-ticking full IEV is a no-op while already granted; revoke stays.
    const still = applyModuleToggle(revoked, "fireTender"); // removes module
    const again = applyModuleToggle(still, "fireTender"); // grants again → defaults Net Total on
    expect(again.allowed_sub_modules).toContain(IEV_COSTING_NET_TOTAL_KEY);
  });
});
