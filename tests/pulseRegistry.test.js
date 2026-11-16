import { describe, expect, it } from "vitest";
import { NAV_MODULE_TREE } from "../src/config/roles.js";
import {
  discoverPulseCatalog,
  emptyPulseFootprint,
  getPulseProviderMap,
  pulseDiscoverySummary,
} from "../src/pages/dashboard/pulseRegistry.js";
import { buildPulseModules } from "../src/pages/dashboard/companyPulseModel.js";

describe("pulse auto-discovery", () => {
  it("surfaces every NAV_MODULE_TREE module without hand-editing CompanyPulse", () => {
    const catalog = discoverPulseCatalog();
    const ids = new Set(catalog.map((m) => m.id));
    for (const mod of NAV_MODULE_TREE) {
      expect(ids.has(mod.value)).toBe(true);
    }
    expect(catalog.length).toBe(NAV_MODULE_TREE.length);
  });

  it("keeps built-in providers for known commercial modules", () => {
    const map = getPulseProviderMap();
    expect(map.get("hr")?.signals).toBeTypeOf("function");
    expect(map.get("billing")?.signals).toBeTypeOf("function");
    expect(map.get("amc")?.load).toBeTypeOf("function");
  });

  it("builds management views for the full discovered catalog", () => {
    const pulse = buildPulseModules({
      profile: { role: "admin" },
      allowPath: () => true,
      modules: emptyPulseFootprint(),
      commercialStats: { billed: 0, collected: 0, outstanding: 0, contractBook: 0, invoiceCount: 0, poCount: 0 },
      pl: { revenue: 0, expense: 0, profit: 0, margin: 0, lossSites: 0 },
      billRate: 0,
      collectRate: 0,
    });
    expect(pulse.views.length).toBe(NAV_MODULE_TREE.length);
    expect(pulse.views.every((v) => v.visible)).toBe(true);
    const summary = pulseDiscoverySummary();
    expect(summary.modules).toBe(NAV_MODULE_TREE.length);
    expect(summary.withProvider).toBeGreaterThan(0);
  });
});
