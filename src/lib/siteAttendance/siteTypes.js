/** Site type master — same values as INDUS Att.Mod. No DB lookup. */
export const SITE_TYPES = ["Safety", "Fire"];
const STORAGE_KEY = "hr_selected_site_type";

export function getSelectedSiteType() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    return val && SITE_TYPES.includes(val) ? val : "";
  } catch {
    return "";
  }
}

export function setSelectedSiteType(value) {
  const next = value && SITE_TYPES.includes(value) ? value : "";
  try {
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return next;
}

export function isValidSiteType(value) {
  return Boolean(value && SITE_TYPES.includes(value));
}

export function filterSitesByType(sites, siteType) {
  if (!siteType) return sites || [];
  return (sites || []).filter((site) => site && site.site_type === siteType);
}
