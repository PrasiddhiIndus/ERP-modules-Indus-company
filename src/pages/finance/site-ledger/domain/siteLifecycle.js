/**
 * Site versioning / contract window / pending-month helpers. Extracted from SiteLedgerApp.jsx.
 */
import { periodAbsoluteIndex as monthIdx, periodKeysBetween } from "../../lib/periods";
import { MONTHS, PERIOD_END_YEAR, PENDING_HISTORY_CUTOFF_KEY } from "./constants.js";
import { slug } from "./formatMoney.js";

export function pendingMonthsAll(site, records, uptoMk) {
  return expectedMonths(site, uptoMk).filter((mk) => !records[`${site.id}__${mk}`]);
}

/** Pending months from Apr-26 onward by default; pass expandHistory to include earlier periods. */
export function pendingMonthsFiltered(site, records, uptoMk, { expandHistory = false } = {}) {
  const all = pendingMonthsAll(site, records, uptoMk);
  if (expandHistory) return all;
  const cutoff = monthIdx(PENDING_HISTORY_CUTOFF_KEY);
  return all.filter((mk) => monthIdx(mk) >= cutoff);
}

export function isSiteActive(site) {
  return (site?.status || "active") === "active";
}
export function versionLabel(site) {
  return `v${site.version || 1}`;
}
export function sitesInGroup(sites, siteGroup) {
  return sites
    .filter((s) => (s.siteGroup || s.id) === siteGroup)
    .sort((a, b) => (b.version || 1) - (a.version || 1) || monthIdx(b.contractStart || "0000-00") - monthIdx(a.contractStart || "0000-00"));
}
/**
 * Attach siteGroup / version metadata only.
 * Active vs inactive is stored status — never inferred from contract dates.
 * New sites stay Active until explicitly made inactive (or superseded by a renewal version).
 */
export function enrichSitesWithVersions(sites) {
  if (!sites.length) return sites;
  const byName = {};
  sites.forEach((s) => {
    const nk = (s.name || "").trim().toLowerCase();
    if (!byName[nk]) byName[nk] = [];
    byName[nk].push(s);
  });
  const withMeta = sites.map((s) => {
    const nk = (s.name || "").trim().toLowerCase();
    const sameName = byName[nk] || [s];
    const siteGroup = s.siteGroup || (sameName.length > 1 ? slug(s.name) : s.id);
    return {
      ...s,
      siteGroup,
      version: s.version || 1,
      status: s.status || "active",
    };
  });
  const groups = {};
  withMeta.forEach((s) => {
    if (!groups[s.siteGroup]) groups[s.siteGroup] = [];
    groups[s.siteGroup].push(s);
  });
  return withMeta.map((s) => {
    const g = groups[s.siteGroup] || [s];
    if (g.length <= 1) return s;
    const sorted = [...g].sort((a, b) => monthIdx(a.contractStart || "0000-00") - monthIdx(b.contractStart || "0000-00"));
    const ver = sorted.findIndex((x) => x.id === s.id) + 1;
    return { ...s, version: s.version > 1 ? s.version : ver };
  });
}
export function prepareNewSiteVersion(existingSites, newSite) {
  const group = newSite.siteGroup || slug(newSite.name);
  const siblings = existingSites.filter((s) => (s.siteGroup || s.id) === group || s.name.trim().toLowerCase() === newSite.name.trim().toLowerCase());
  const resolvedGroup = siblings[0]?.siteGroup || group;
  const maxVer = siblings.reduce((m, s) => Math.max(m, s.version || 1), 0);
  let id = `${resolvedGroup}-v${maxVer + 1}`;
  let n = maxVer + 1;
  while (existingSites.some((s) => s.id === id)) id = `${resolvedGroup}-v${++n}`;
  const deactivated = existingSites.map((s) => {
    const inGroup = (s.siteGroup || s.id) === resolvedGroup
      || s.name.trim().toLowerCase() === newSite.name.trim().toLowerCase();
    return inGroup ? { ...s, siteGroup: resolvedGroup, status: "inactive" } : s;
  });
  return [
    ...deactivated,
    {
      ...newSite,
      id,
      siteGroup: resolvedGroup,
      version: maxVer + 1,
      status: "active",
    },
  ];
}
export function activeSitesOnly(sites) {
  return sites.filter(isSiteActive);
}

/** Fixed estimated budget for a contract (one per site/contract version). */
export function contractBudgetFor(site) {
  const versions = (site.estimates || []).slice().sort((a, b) => monthIdx(a.effectiveFrom) - monthIdx(b.effectiveFrom));
  if (!versions.length) return null;
  const cs = site.contractStart;
  if (cs) {
    const atStart = versions.find((v) => v.effectiveFrom === cs);
    if (atStart) return atStart;
  }
  return versions[0];
}

// Estimate (budget) in force for a month — fixed for the contract's full duration
export function estimateFor(site, _mk) {
  return contractBudgetFor(site);
}

// contract window
export const contractEndIdx = (site) =>
  site.contractEnd ? monthIdx(site.contractEnd) : monthIdx(`${PERIOD_END_YEAR}-12`);
export const remainingMonths = (site, startMk) => Math.max(1, contractEndIdx(site) - monthIdx(startMk) + 1);
export const inContract = (site, mk) => {
  const i = monthIdx(mk);
  const s = site.contractStart ? monthIdx(site.contractStart) : monthIdx(MONTHS[0]?.key);
  return i >= s && i <= contractEndIdx(site);
};
export function expectedMonths(site, uptoMk) {
  const start = site.contractStart || MONTHS[0]?.key;
  const end = site.contractEnd || uptoMk;
  const endCapped = monthIdx(end) > monthIdx(uptoMk) ? uptoMk : end;
  return periodKeysBetween(start, endCapped);
}
export const pendingMonths = (site, records, uptoMk) => pendingMonthsFiltered(site, records, uptoMk);
export const isPending = (site, records, mk) => inContract(site, mk) && !records[`${site.id}__${mk}`];
