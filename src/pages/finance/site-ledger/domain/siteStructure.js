/**
 * Site structure helpers (parents → child cost lines). Extracted from SiteLedgerApp.jsx.
 * Depend on the live PARENTS registry / CHILD_HEADS from ./constants.js (see syncParents).
 */
import { formatFinanceLabel } from "../../lib/formatters";
import { PARENTS, CHILD_HEADS, PARENT_KEY_MIGRATE, DEFAULT_SITE_CHILD_TEMPLATE } from "./constants.js";
import { slug } from "./formatMoney.js";

export function migrateStructureParents(structure) {
  return (structure || []).map((g) => ({
    parent: PARENT_KEY_MIGRATE[g.parent] || g.parent,
    children: [...(g.children || [])],
  }));
}

export function mergeSiteLibrary(site, globalLibrary) {
  const excluded = new Set(site?.excludedHeadKeys || []);
  const custom = (site?.customHeads || []).filter((h) => !excluded.has(h.key));
  const merged = globalLibrary.filter((h) => !excluded.has(h.key));
  custom.forEach((h) => {
    if (!merged.some((x) => x.key === h.key)) {
      merged.push({ ...h, custom: true, siteScoped: true });
    }
  });
  return merged;
}

/* ───────────────────────── STRUCTURE HELPERS ───────────────────────── */
// Full structure incl. empty parents, in PARENTS order
export function displayStructure(site) {
  const known = PARENTS.map((p) => {
    const g = (site.structure || []).find((x) => x.parent === p.key);
    return { parent: p.key, children: g ? [...g.children] : [] };
  });
  // Groups under a parent head this tab does not list (added by another user, deactivated,
  // legacy key) used to be dropped here — and every edit of the site then deleted them.
  const knownKeys = new Set(PARENTS.map((p) => p.key));
  const extra = (site.structure || [])
    .filter((g) => !knownKeys.has(g.parent) && (g.children || []).length)
    .map((g) => ({ parent: g.parent, children: [...g.children] }));
  return [...known, ...extra];
}
/** Persist only parent groups that have assigned cost lines (matches DB shape). */
export function compactStructure(structure) {
  const seen = new Set();
  return (structure || [])
    .map((g) => {
      const children = (g.children || []).filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { parent: g.parent, children };
    })
    .filter((g) => g.children.length > 0);
}
export const siteChildKeys = (site) => (site.structure || []).flatMap((g) => g.children);

export function childLabel(site, key) {
  const lib = mergeSiteLibrary(site, site._lib || CHILD_HEADS);
  const hit = lib.find((c) => c.key === key);
  const raw = hit?.label || CHILD_HEADS.find((c) => c.key === key)?.label || key;
  return formatFinanceLabel(raw);
}

export function grp(parent, children) { return { parent, children }; }
export function structureFromKeys(keys) {
  return PARENTS.map((p) => grp(p.key, keys.filter((k) => {
    const def = CHILD_HEADS.find((c) => c.key === k);
    const parent = def?.parent || PARENT_KEY_MIGRATE[def?.parent] || "adminMisc";
    return parent === p.key;
  }))).filter((g) => g.children.length);
}

/** Build the default structure for a brand-new site from DEFAULT_SITE_CHILD_TEMPLATE.
 *  Reuses existing global library heads (matched by label); creates missing ones. */
export function defaultSiteSetup(library) {
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const lib = [...library];
  let libraryChanged = false;
  const structure = DEFAULT_SITE_CHILD_TEMPLATE.map(({ parent, labels }) => ({
    parent,
    children: labels.map((label) => {
      const hit = lib.find((h) => !h.siteScoped && norm(h.label) === norm(label));
      if (hit) return hit.key;
      let key = slug(label), n = 1;
      while (lib.some((h) => h.key === key)) key = `${slug(label)}-${++n}`;
      lib.push({ key, label, parent });
      libraryChanged = true;
      return key;
    }),
  }));
  return { structure, library: lib, libraryChanged };
}
