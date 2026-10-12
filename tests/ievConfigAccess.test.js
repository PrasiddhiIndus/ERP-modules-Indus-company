import { describe, expect, it } from "vitest";
import {
  IEV_CONFIG_PAGES, IEV_CONFIG_SELECTED_KEY, canOpenIevConfigPage, getAllowedIevConfigSlugs, ievConfigMode,
  setIevConfigMode, toggleIevConfigPage,
} from "../src/lib/ievConfigAccess.js";

const ALL = IEV_CONFIG_PAGES.map((p) => p.slug);
const user = (subs, role = "executive") => ({ role, team: "fireTender", allowed_modules: [], allowed_sub_modules: subs });

describe("IEV Configuration page access", () => {
  it("existing users with nothing set keep every configuration page", () => {
    expect(getAllowedIevConfigSlugs(user([]))).toEqual(ALL);
    expect(getAllowedIevConfigSlugs(user(["fireTender.costing", "iev-config.price-master"]))).toEqual(ALL);
  });

  it("selected mode allows only the ticked pages", () => {
    const u = user([IEV_CONFIG_SELECTED_KEY, "iev-config.price-master", "iev-config.oc-sign-off"]);
    expect(getAllowedIevConfigSlugs(u)).toEqual(["price-master", "oc-sign-off"]);
    expect(canOpenIevConfigPage(u, "vehicle-type")).toBe(false);
    expect(canOpenIevConfigPage(u, "oc-sign-off")).toBe(true);
  });

  it("selected mode with nothing ticked allows no configuration page", () => {
    expect(getAllowedIevConfigSlugs(user([IEV_CONFIG_SELECTED_KEY]))).toEqual([]);
  });

  it("super admins always see every page", () => {
    expect(getAllowedIevConfigSlugs(user([IEV_CONFIG_SELECTED_KEY], "super_admin"))).toEqual(ALL);
  });

  it("editor helpers switch mode and toggle pages without touching other access keys", () => {
    const start = ["fireTender.costing", "hr.site-attendance"];
    const selected = setIevConfigMode(start, "selected");
    expect(ievConfigMode(selected)).toBe("selected");
    const ticked = toggleIevConfigPage(selected, "iev-config.accessories");
    expect(ticked).toContain("iev-config.accessories");
    expect(toggleIevConfigPage(ticked, "iev-config.accessories")).not.toContain("iev-config.accessories");
    expect(setIevConfigMode(ticked, "all")).toEqual(start);
  });
});
