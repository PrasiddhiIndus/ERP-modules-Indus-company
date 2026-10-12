/**
 * IEV Configuration page-wise access.
 * Keys live in profiles.allowed_sub_modules (outside the fireTender.* family so they never
 * grant routes and are not cleared when the IEV module is toggled). Route access to IEV is
 * still granted by the IEV module.
 *
 * - No "iev-config.selected" key → every configuration page (unchanged behaviour)
 * - "iev-config.selected" present → only the ticked pages (none ticked = no configuration pages)
 */
import { ROLES, normalizeAppRole, parseAllowedSubModules } from "../config/roles";

export const IEV_CONFIG_SELECTED_KEY = "iev-config.selected";

export const IEV_CONFIG_PAGES = [
  { slug: "main-component", label: "Main Component" },
  { slug: "manual-sub-category", label: "Manual Sub Category" },
  { slug: "fire-tender-mail-template", label: "IEV Mail Template" },
  { slug: "price-master", label: "Price Master" },
  { slug: "accessories", label: "Accessories" },
  { slug: "final-components", label: "Final Components" },
  { slug: "vehicle-type", label: "Vehicle Type" },
  { slug: "oc-sign-off", label: "PO At Glance Sign-off Assignment" },
].map((page) => ({ ...page, value: `iev-config.${page.slug}` }));

const IEV_CONFIG_KEYS = new Set([IEV_CONFIG_SELECTED_KEY, ...IEV_CONFIG_PAGES.map((p) => p.value)]);

/** Configuration page slugs the user may open. */
export function getAllowedIevConfigSlugs(userProfile) {
  const all = IEV_CONFIG_PAGES.map((page) => page.slug);
  const role = normalizeAppRole(userProfile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return all;
  const subs = parseAllowedSubModules(userProfile?.allowed_sub_modules);
  if (!subs.includes(IEV_CONFIG_SELECTED_KEY)) return all;
  return IEV_CONFIG_PAGES.filter((page) => subs.includes(page.value)).map((page) => page.slug);
}

export function canOpenIevConfigPage(userProfile, slug) {
  return getAllowedIevConfigSlugs(userProfile).includes(slug);
}

/** "all" or "selected" for the User Management editor. */
export function ievConfigMode(allowedSubModules = []) {
  return allowedSubModules.includes(IEV_CONFIG_SELECTED_KEY) ? "selected" : "all";
}

/** Switches between all pages (drops every IEV configuration key) and selected pages. */
export function setIevConfigMode(allowedSubModules = [], mode) {
  const rest = allowedSubModules.filter((k) => !IEV_CONFIG_KEYS.has(k));
  return mode === "selected" ? [...rest, IEV_CONFIG_SELECTED_KEY] : rest;
}

export function toggleIevConfigPage(allowedSubModules = [], key) {
  return allowedSubModules.includes(key)
    ? allowedSubModules.filter((k) => k !== key)
    : [...allowedSubModules, key];
}
