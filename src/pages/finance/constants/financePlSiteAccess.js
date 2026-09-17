/**
 * User Management → Finance → P&L site-type scope.
 * Keys live in profiles.allowed_sub_modules (opt-in under finance.pl).
 *
 * - No finance.pl.fire / finance.pl.safety → all P&L sites (unchanged behaviour)
 * - One or both keys → only sites of those types appear in P&L / Site Ledger
 */
import { ROLES, parseAllowedSubModules } from "../../../config/roles";

export const FINANCE_PL_FIRE_KEY = "finance.pl.fire";
export const FINANCE_PL_SAFETY_KEY = "finance.pl.safety";

export const FINANCE_PL_SITE_TYPE_TABS = [
  { value: FINANCE_PL_FIRE_KEY, label: "Fire", optIn: true },
  { value: FINANCE_PL_SAFETY_KEY, label: "Safety", optIn: true },
];

const TYPE_BY_KEY = {
  [FINANCE_PL_FIRE_KEY]: "fire",
  [FINANCE_PL_SAFETY_KEY]: "safety",
};

const SITE_META_PREFIX = "@@siteMeta::";

function siteTypeFromRemarks(remarks) {
  if (!remarks || typeof remarks !== "string") return "";
  const i = remarks.indexOf(SITE_META_PREFIX);
  if (i === -1) return "";
  try {
    const meta = JSON.parse(remarks.slice(i + SITE_META_PREFIX.length));
    return meta?.siteType ? String(meta.siteType) : "";
  } catch {
    return "";
  }
}

/** Normalize a site's type to fire | safety | shutdown | regular | "". */
export function normalizeFinanceSiteType(siteOrType) {
  if (siteOrType && typeof siteOrType === "object") {
    const direct = siteOrType.siteType;
    if (direct) return normalizeFinanceSiteType(direct);
    const fromRemarks = siteTypeFromRemarks(siteOrType.remarks);
    if (fromRemarks) return normalizeFinanceSiteType(fromRemarks);
    return "";
  }
  const t = String(siteOrType || "").trim().toLowerCase();
  if (t === "fire" || t === "safety" || t === "shutdown" || t === "regular") return t;
  return "";
}

/**
 * @returns {Set<string>|null} Allowed site types, or null = no type restriction.
 */
export function getFinancePlSiteTypeFilter(userProfile) {
  if (!userProfile) return null;
  const role = userProfile.role;
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return null;

  const subs = parseAllowedSubModules(userProfile.allowed_sub_modules);
  const allowed = new Set();
  for (const key of Object.keys(TYPE_BY_KEY)) {
    if (subs.includes(key)) allowed.add(TYPE_BY_KEY[key]);
  }
  if (!allowed.size) return null;
  return allowed;
}

export function siteAllowedByFinancePlFilter(site, typeFilter) {
  if (!typeFilter) return true;
  const t = normalizeFinanceSiteType(site);
  return typeFilter.has(t);
}

export function filterSitesByFinancePlAccess(sites, userProfile) {
  const typeFilter = getFinancePlSiteTypeFilter(userProfile);
  if (!typeFilter) return sites || [];
  return (sites || []).filter((s) => siteAllowedByFinancePlFilter(s, typeFilter));
}
