/**
 * Fire / Safety site-type scope for Finance P&L (constants/financePlSiteAccess.js).
 *
 * - No finance.pl.fire / finance.pl.safety keys → all sites (unchanged behaviour)
 * - One or both keys → only those site types
 * - Super Admin / Super Admin Pro → never restricted
 */
import { describe, expect, it } from "vitest";
import {
  FINANCE_PL_FIRE_KEY,
  FINANCE_PL_SAFETY_KEY,
  FINANCE_PL_SITE_TYPE_TABS,
  filterSitesByFinancePlAccess,
  getFinancePlSiteTypeFilter,
  normalizeFinanceSiteType,
  siteAllowedByFinancePlFilter,
} from "../src/pages/finance/constants/financePlSiteAccess.js";
import { ROLES } from "../src/config/roles.js";

const fire = { id: "f1", name: "Fire Site", siteType: "fire" };
const safety = { id: "s1", name: "Safety Site", siteType: "safety" };
const shutdown = { id: "sd1", name: "Shutdown Site", siteType: "shutdown" };
const regular = { id: "r1", name: "Regular Site", siteType: "regular" };
const untyped = { id: "u1", name: "Untyped Site" };
const all = [fire, safety, shutdown, regular, untyped];
const ids = (list) => list.map((s) => s.id);

const profile = (subs, role = ROLES.MANAGER) => ({ role, allowed_sub_modules: subs });

describe("keys", () => {
  it("exposes stable permission keys and opt-in tabs", () => {
    expect(FINANCE_PL_FIRE_KEY).toBe("finance.pl.fire");
    expect(FINANCE_PL_SAFETY_KEY).toBe("finance.pl.safety");
    expect(FINANCE_PL_SITE_TYPE_TABS.map((t) => t.value)).toEqual([FINANCE_PL_FIRE_KEY, FINANCE_PL_SAFETY_KEY]);
    expect(FINANCE_PL_SITE_TYPE_TABS.every((t) => t.optIn)).toBe(true);
  });
});

describe("no fire / safety keys → all sites", () => {
  it("empty allowed_sub_modules", () => {
    expect(ids(filterSitesByFinancePlAccess(all, profile([])))).toEqual(ids(all));
  });

  it("missing allowed_sub_modules", () => {
    expect(ids(filterSitesByFinancePlAccess(all, { role: ROLES.EXECUTIVE }))).toEqual(ids(all));
  });

  it("other sub-module keys do not restrict P&L", () => {
    expect(ids(filterSitesByFinancePlAccess(all, profile(["finance.pl", "hr.payroll"])))).toEqual(ids(all));
  });

  it("no profile at all (not loaded yet) → unrestricted", () => {
    expect(getFinancePlSiteTypeFilter(null)).toBeNull();
    expect(getFinancePlSiteTypeFilter(undefined)).toBeNull();
    expect(ids(filterSitesByFinancePlAccess(all, null))).toEqual(ids(all));
  });

  it("returns the input list as-is when unrestricted", () => {
    expect(filterSitesByFinancePlAccess(all, profile([]))).toBe(all);
  });
});

describe("fire only", () => {
  it("shows only fire sites", () => {
    const f = filterSitesByFinancePlAccess(all, profile([FINANCE_PL_FIRE_KEY]));
    expect(ids(f)).toEqual(["f1"]);
  });

  it("type filter is {fire}", () => {
    expect([...getFinancePlSiteTypeFilter(profile([FINANCE_PL_FIRE_KEY]))]).toEqual(["fire"]);
  });
});

describe("safety only", () => {
  it("shows only safety sites", () => {
    const f = filterSitesByFinancePlAccess(all, profile([FINANCE_PL_SAFETY_KEY]));
    expect(ids(f)).toEqual(["s1"]);
  });

  it("type filter is {safety}", () => {
    expect([...getFinancePlSiteTypeFilter(profile([FINANCE_PL_SAFETY_KEY]))]).toEqual(["safety"]);
  });
});

describe("fire + safety", () => {
  it("shows both fire and safety, hides shutdown / regular / untyped", () => {
    const f = filterSitesByFinancePlAccess(all, profile([FINANCE_PL_FIRE_KEY, FINANCE_PL_SAFETY_KEY]));
    expect(ids(f)).toEqual(["f1", "s1"]);
  });

  it("accepts allowed_sub_modules as a JSON string", () => {
    const f = filterSitesByFinancePlAccess(all, profile(JSON.stringify([FINANCE_PL_FIRE_KEY, FINANCE_PL_SAFETY_KEY])));
    expect(ids(f)).toEqual(["f1", "s1"]);
  });
});

describe("super admin / all-access", () => {
  it.each([ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN_PRO])("%s is never restricted, even with fire/safety keys", (role) => {
    const p = profile([FINANCE_PL_FIRE_KEY], role);
    expect(getFinancePlSiteTypeFilter(p)).toBeNull();
    expect(ids(filterSitesByFinancePlAccess(all, p))).toEqual(ids(all));
  });

  it("non-super-admin roles (admin) with a key are restricted", () => {
    expect(ids(filterSitesByFinancePlAccess(all, profile([FINANCE_PL_SAFETY_KEY], ROLES.ADMIN)))).toEqual(["s1"]);
  });
});

describe("site type resolution", () => {
  it("normalizes strings case-insensitively; unknown → empty", () => {
    expect(normalizeFinanceSiteType(" FIRE ")).toBe("fire");
    expect(normalizeFinanceSiteType("Safety")).toBe("safety");
    expect(normalizeFinanceSiteType("other")).toBe("");
    expect(normalizeFinanceSiteType(null)).toBe("");
  });

  it("reads siteType from the legacy remarks meta block when the field is missing", () => {
    const legacy = { id: "l1", remarks: `note @@siteMeta::${JSON.stringify({ siteType: "fire" })}` };
    expect(normalizeFinanceSiteType(legacy)).toBe("fire");
    expect(ids(filterSitesByFinancePlAccess([legacy, safety], profile([FINANCE_PL_FIRE_KEY])))).toEqual(["l1"]);
  });

  it("ignores malformed remarks meta", () => {
    expect(normalizeFinanceSiteType({ id: "x", remarks: "@@siteMeta::{not json" })).toBe("");
  });

  it("an explicit siteType wins over remarks meta", () => {
    const s = { siteType: "safety", remarks: `@@siteMeta::${JSON.stringify({ siteType: "fire" })}` };
    expect(normalizeFinanceSiteType(s)).toBe("safety");
  });

  it("siteAllowedByFinancePlFilter: no filter allows everything", () => {
    expect(siteAllowedByFinancePlFilter(untyped, null)).toBe(true);
    expect(siteAllowedByFinancePlFilter(untyped, new Set(["fire"]))).toBe(false);
  });

  it("handles null / undefined site lists", () => {
    expect(filterSitesByFinancePlAccess(null, profile([FINANCE_PL_FIRE_KEY]))).toEqual([]);
    expect(filterSitesByFinancePlAccess(undefined, profile([]))).toEqual([]);
  });
});
