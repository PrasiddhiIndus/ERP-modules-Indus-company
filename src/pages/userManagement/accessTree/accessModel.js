/**
 * User Management — Module → Page → Tab access model.
 *
 * Storage is unchanged: every grant still lives in `profiles.allowed_modules` (full modules)
 * and `profiles.allowed_sub_modules` (pages, tabs, scopes, access levels). The route guards,
 * sidebar and RLS helpers keep reading those same keys, so an existing user opens with
 * exactly the access they have today and a save without edits writes the same arrays back.
 *
 * This file only:
 *   1. builds one display tree from the existing navigation definitions
 *      (NAV_MODULE_TREE + Site Attendance, IEV Configuration, Payroll and HR scope lists), and
 *   2. exposes the toggle rules the old picker used (unchanged), plus bulk Select all / Clear
 *      helpers composed from those same rules.
 */
import {
  NAV_MODULE_TREE,
  MODULES,
  resolveTeamModuleKey,
  hasHrSectionScope,
  toggleRecruitmentAccessKey,
  toggleProjectsEnquiryAccessLevel,
  PROJECTS_ENQUIRY_ACCESS_LEVELS,
  HR_RECRUITMENT_FAMILY,
  ADMIN_RECRUITMENT_FAMILY,
  ALL_RECRUITMENT_TAB_KEYS,
  ALL_ADMIN_RECRUITMENT_TAB_KEYS,
  IEV_COSTING_NET_TOTAL_KEY,
  IEV_COSTING_SHEET_KEY,
  IEV_COSTING_PAGES,
} from "../../../config/roles";
import { EMPLOYEE_MASTER_SUBMODULE_KEY } from "../../adminOperations/salaryAdmin/salaryAccess";
import { CALLING_SITE_TYPE_KEYS } from "../../hr/callingMaster/callingSiteTypeAccess";
import { SITE_ATTENDANCE_PAGES } from "../../../lib/siteAttendance/siteAttendancePageAccess";
import {
  IEV_CONFIG_PAGES,
  IEV_CONFIG_SELECTED_KEY,
  ievConfigMode,
  setIevConfigMode,
  toggleIevConfigPage,
} from "../../../lib/ievConfigAccess";
import { SALARY_SUB_NAV } from "../../hr/payroll/salary/salaryNav";

export { PROJECTS_ENQUIRY_ACCESS_LEVELS, CALLING_SITE_TYPE_KEYS, SITE_ATTENDANCE_PAGES, IEV_CONFIG_PAGES };
export { ievConfigMode, setIevConfigMode, toggleIevConfigPage };

const SITE_ATTENDANCE_PAGE_KEYS = SITE_ATTENDANCE_PAGES.map((p) => p.value);
const CALLING_SCOPE_KEYS = CALLING_SITE_TYPE_KEYS.map((k) => k.value);
const IEV_CONFIG_KEYS = [IEV_CONFIG_SELECTED_KEY, ...IEV_CONFIG_PAGES.map((p) => p.value)];
const ENQUIRY_LEVEL_KEYS = PROJECTS_ENQUIRY_ACCESS_LEVELS.map((l) => l.value);

/** Sub-modules a full module never implies; they stay grantable and are kept when the module is ticked. */
export const OPT_IN_SUB_MODULE_KEYS = new Set([
  ...NAV_MODULE_TREE.flatMap((m) => (m.subModules || []).filter((s) => s.optIn).map((s) => s.value)),
  // Enquiry Master access level (View / Edit) is not a page; keep it when Projects is ticked.
  ...ENQUIRY_LEVEL_KEYS,
  // Net Total Access is independent of full IEV — keep when full IEV is (re)ticked so a prior
  // revoke is not wiped unless we explicitly default it back on for a fresh IEV grant.
  IEV_COSTING_NET_TOTAL_KEY,
]);

/** Keys outside the "<module>." family that still belong to a module in the editor. */
const MODULE_EXTRA_KEYS = {
  hr: [...SITE_ATTENDANCE_PAGE_KEYS, ...CALLING_SCOPE_KEYS],
  fireTender: IEV_CONFIG_KEYS,
};

const RECRUITMENT_FAMILIES = {
  [HR_RECRUITMENT_FAMILY.parentKey]: HR_RECRUITMENT_FAMILY,
  [ADMIN_RECRUITMENT_FAMILY.parentKey]: ADMIN_RECRUITMENT_FAMILY,
};

const list = (v) => (Array.isArray(v) ? v : []);
const uniq = (arr) => [...new Set(arr)];

// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

/**
 * Display tree for the access editor. Module order and labels come from NAV_MODULE_TREE.
 * Each page may carry:
 *   tabs           — level-3 keys (recruitment tabs, Enquiry / Contract / IEV Costing pages, P&L scope)
 *   recruitment    — true when the tabs follow the recruitment parent/child rules
 *   accessLevels   — View / Edit keys (Enquiry Master)
 *   fixedLevels    — informational permission chips (the page has no separate toggles)
 *   pageGroup      — extra keys stored outside the module family (Site Attendance pages, IEV Configuration)
 *   infoTabs       — sub-pages shown for reference only (no per-page key exists)
 */
export function buildAccessTree(team) {
  const teamKey = resolveTeamModuleKey(team);
  return NAV_MODULE_TREE.filter((m) => m.value !== "userManagement").map((mod) => {
    const pages = (mod.subModules || []).map((sub) => {
      const page = {
        key: sub.value,
        label: sub.label,
        optIn: Boolean(sub.optIn),
        tabs: (sub.tabModules || []).map((t) => ({
          key: t.value,
          label: t.label,
          optIn: Boolean(t.optIn),
          badge: t.badge || null,
          extras: Array.isArray(t.extras)
            ? t.extras.map((e) => ({ key: e.value || e.key, label: e.label, hint: e.hint || "" }))
            : [],
        })),
        recruitment: Boolean(RECRUITMENT_FAMILIES[sub.value]),
      };
      if (sub.value === "projects.enquiry") page.accessLevels = PROJECTS_ENQUIRY_ACCESS_LEVELS;
      if (sub.value === "itIs.subscriptions") {
        page.label = "Software Subscriptions";
        page.fixedLevels = ["View", "Update", "Delete"];
      }
      if (sub.value === "itIs.hardware-support") {
        page.label = "Hardware Support";
        page.infoNote =
          "Tick Hardware Support for all pages, or choose individual pages (Raise, Dashboard, Queue, Ticket Details, Masters, Reports). Independent of Software Support.";
      }
      if (sub.value === "hr.salary-management") {
        page.label = "Payroll";
        page.infoTabs = SALARY_SUB_NAV.map((n) => n.label);
        page.infoNote = "Payroll pages open together with Payroll — there is no per-page key yet.";
      }
      if (sub.value === "hr.site-attendance") {
        page.pageGroup = {
          id: "site-attendance-pages",
          kind: "default-all",
          items: SITE_ATTENDANCE_PAGES.map((p) => ({ key: p.value, label: p.label })),
          hint: "None ticked = every Site Attendance page.",
        };
      }
      return page;
    });

    if (mod.value === "fireTender") {
      pages.push({
        key: "iev-config",
        label: "Configuration",
        virtual: true,
        tabs: [],
        pageGroup: {
          id: "iev-config",
          kind: "mode",
          items: IEV_CONFIG_PAGES.map((p) => ({ key: p.value, label: p.label })),
          hint: "All items = every Configuration page. Selected items = only the ticked pages.",
        },
      });
    }

    const node = {
      key: mod.value,
      label: mod.label,
      pages,
      implicitViaTeam: Boolean(teamKey && teamKey === mod.value),
    };
    if (mod.value === "hr") {
      node.scope = {
        id: "calling-scope",
        label: "Fire / Safety scope",
        items: CALLING_SITE_TYPE_KEYS.map((k) => ({ key: k.value, label: k.label })),
        hint: "Limits Recruitment candidates and Site Attendance sites. None ticked = both.",
      };
    }
    return node;
  });
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/** Every stored key that belongs to a module in the editor (excluding allowed_modules). */
export function moduleOwnsKey(moduleKey, key) {
  const k = String(key || "");
  if (k.startsWith(`${moduleKey}.`)) return true;
  return (MODULE_EXTRA_KEYS[moduleKey] || []).includes(k);
}

export function hasFullHrAccess(form) {
  return (
    list(form?.allowed_modules).includes("hr") ||
    (resolveTeamModuleKey(form?.team) === "hr" && !hasHrSectionScope(form))
  );
}

export function hasCallingDatabaseAccess(form) {
  const subs = list(form?.allowed_sub_modules);
  return (
    hasFullHrAccess(form) ||
    subs.some(
      (key) =>
        key === "hr.calling-master" || key === "hr.site-attendance" || String(key).startsWith("hr.recruitment.")
    )
  );
}

export function hasSiteAttendanceAccess(form) {
  return hasFullHrAccess(form) || list(form?.allowed_sub_modules).includes("hr.site-attendance");
}

export function hasIevAccess(form) {
  return (
    list(form?.allowed_modules).includes("fireTender") ||
    resolveTeamModuleKey(form?.team) === "fireTender" ||
    list(form?.allowed_sub_modules).some((key) => String(key).startsWith("fireTender."))
  );
}

/** True when the page's own key or any of its tab keys is stored. */
export function pageHasAnyGrant(page, subs) {
  if (subs.includes(page.key)) return true;
  if (page.tabs?.some((t) => subs.includes(t.key))) return true;
  if (page.recruitment) {
    const fam = RECRUITMENT_FAMILIES[page.key];
    if (fam.allTabKeys.some((k) => subs.includes(k))) return true;
  }
  return false;
}

/**
 * Summary state for a module row.
 *   full    — module in allowed_modules
 *   team    — primary team module (implicit access)
 *   partial — some pages / tabs ticked
 *   none
 */
export function moduleState(mod, form) {
  const mods = list(form?.allowed_modules);
  const subs = list(form?.allowed_sub_modules);
  const grantedPages = mod.pages.filter((p) => !p.virtual && pageHasAnyGrant(p, subs)).length;
  const ownedKeys = subs.filter((k) => moduleOwnsKey(mod.key, k)).length;
  if (mod.implicitViaTeam) return { status: "team", grantedPages, ownedKeys };
  if (mods.includes(mod.key)) return { status: "full", grantedPages, ownedKeys };
  if (ownedKeys > 0) return { status: "partial", grantedPages, ownedKeys };
  return { status: "none", grantedPages, ownedKeys };
}

// ---------------------------------------------------------------------------
// Toggle rules (unchanged from the previous picker)
// ---------------------------------------------------------------------------

/**
 * Grant / revoke a full module. Granting clears that module's page and tab keys but keeps
 * opt-in grants (Admin Recruitment, Rules Console, Master PO At Glance, Enquiry View / Edit).
 * @returns {{ allowed_modules: string[], allowed_sub_modules: string[] }}
 */
export function applyModuleToggle(form, moduleKey) {
  const mods = list(form?.allowed_modules);
  const subs = list(form?.allowed_sub_modules);
  const willAdd = !mods.includes(moduleKey);
  let nextSubs = willAdd
    ? subs.filter(
        (s) =>
          OPT_IN_SUB_MODULE_KEYS.has(s) ||
          ALL_ADMIN_RECRUITMENT_TAB_KEYS.includes(s) ||
          (!s.startsWith(`${moduleKey}.`) && !ALL_RECRUITMENT_TAB_KEYS.includes(s))
      )
    : subs;
  // Fresh full IEV grant defaults Net Total Access on (matches previous "included" behaviour).
  // Existing revoke (key absent while IEV stays granted) is preserved via OPT_IN keep above.
  if (willAdd && moduleKey === "fireTender" && !nextSubs.includes(IEV_COSTING_NET_TOTAL_KEY)) {
    nextSubs = [...nextSubs, IEV_COSTING_NET_TOTAL_KEY];
  }
  return {
    allowed_modules: willAdd ? [...mods, moduleKey] : mods.filter((m) => m !== moduleKey),
    allowed_sub_modules: nextSubs,
  };
}

/**
 * Toggle a page or tab key. Recruitment parents / tabs follow toggleRecruitmentAccessKey;
 * ticking Employee Master on a full-Admin user switches them to Employee Master only.
 */
export function applySubToggle(form, subValue) {
  const mods = list(form?.allowed_modules);
  const subs = list(form?.allowed_sub_modules);
  const switchingToEmployeeMasterOnly = subValue === EMPLOYEE_MASTER_SUBMODULE_KEY && mods.includes("admin");
  const willAdd = switchingToEmployeeMasterOnly || !subs.includes(subValue);

  const recruitmentNext = toggleRecruitmentAccessKey(subs, subValue);
  let nextSubs = recruitmentNext
    ? recruitmentNext
    : willAdd
      ? [...subs.filter((s) => s !== subValue), subValue]
      : subs.filter((s) => {
          if (s === subValue) return false;
          // Drop Net Total Access when Costing Sheet itself is revoked.
          if (subValue === IEV_COSTING_SHEET_KEY && s === IEV_COSTING_NET_TOTAL_KEY) return false;
          // Drop Net Total when the whole IEV Costing section is revoked.
          if (subValue === "fireTender.costing" && s === IEV_COSTING_NET_TOTAL_KEY) return false;
          return true;
        });

  // Ticking IEV Costing (all pages) defaults Net Total Access on.
  if (willAdd && subValue === "fireTender.costing" && !nextSubs.includes(IEV_COSTING_NET_TOTAL_KEY)) {
    nextSubs = [...nextSubs, IEV_COSTING_NET_TOTAL_KEY];
  }

  return {
    allowed_modules: switchingToEmployeeMasterOnly ? mods.filter((m) => m !== "admin") : mods,
    allowed_sub_modules: nextSubs,
    added: willAdd,
  };
}

/** Toggle Costing Sheet → Net Total Access; granting it also grants Costing Sheet. */
export function applyIevCostingNetTotalToggle(form) {
  const mods = list(form?.allowed_modules);
  const subs = list(form?.allowed_sub_modules);
  if (subs.includes(IEV_COSTING_NET_TOTAL_KEY)) {
    return {
      allowed_modules: mods,
      allowed_sub_modules: subs.filter((s) => s !== IEV_COSTING_NET_TOTAL_KEY),
    };
  }
  const next = new Set(subs);
  next.add(IEV_COSTING_SHEET_KEY);
  next.add(IEV_COSTING_NET_TOTAL_KEY);
  return { allowed_modules: mods, allowed_sub_modules: [...next] };
}

export function applyEnquiryLevelToggle(form, key) {
  return {
    allowed_modules: list(form?.allowed_modules),
    allowed_sub_modules: toggleProjectsEnquiryAccessLevel(list(form?.allowed_sub_modules), key),
  };
}

/** Plain on/off key (Site Attendance pages, Fire / Safety scope). */
export function applyPlainKeyToggle(form, key) {
  const subs = list(form?.allowed_sub_modules);
  return {
    allowed_modules: list(form?.allowed_modules),
    allowed_sub_modules: subs.includes(key) ? subs.filter((s) => s !== key) : [...subs, key],
  };
}

// ---------------------------------------------------------------------------
// Bulk helpers (Select all / Clear) — composed from the rules above
// ---------------------------------------------------------------------------

const withSubs = (form, subs) => ({ allowed_modules: list(form?.allowed_modules), allowed_sub_modules: uniq(subs) });

/**
 * Tick every standard page of a module one by one (opt-in pages are left as they are).
 * Recruitment pages are granted through their parent key, exactly as ticking the parent does.
 */
export function selectAllPagesInModule(form, mod) {
  let next = { allowed_modules: list(form?.allowed_modules), allowed_sub_modules: list(form?.allowed_sub_modules) };
  for (const page of mod.pages) {
    if (page.virtual || page.optIn) continue;
    if (next.allowed_sub_modules.includes(page.key)) continue;
    next = { ...next, ...applySubToggle(next, page.key) };
    delete next.added;
  }
  return next;
}

/** Remove every grant this module holds: the full-module key and all of its page / tab / scope keys. */
export function clearModule(form, mod) {
  return {
    allowed_modules: list(form?.allowed_modules).filter((m) => m !== mod.key),
    allowed_sub_modules: list(form?.allowed_sub_modules).filter((k) => !moduleOwnsKey(mod.key, k)),
  };
}

/** Grant all standard tabs of a page (through its parent key — "all pages of this section"). */
export function selectAllTabs(form, page) {
  const subs = list(form?.allowed_sub_modules);
  if (subs.includes(page.key)) return withSubs(form, subs);
  const r = applySubToggle(form, page.key);
  return { allowed_modules: r.allowed_modules, allowed_sub_modules: r.allowed_sub_modules };
}

/** Remove the page key and all of its tab keys (Enquiry View / Edit are access levels, kept). */
export function clearTabs(form, page) {
  const subs = list(form?.allowed_sub_modules);
  const drop = new Set([page.key, ...(page.tabs || []).map((t) => t.key)]);
  for (const tab of page.tabs || []) {
    for (const extra of tab.extras || []) drop.add(extra.key);
  }
  if (page.recruitment) RECRUITMENT_FAMILIES[page.key].allTabKeys.forEach((k) => drop.add(k));
  return withSubs(form, subs.filter((k) => !drop.has(k)));
}

/** Set every key of a group on (Site Attendance pages). */
export function selectGroupKeys(form, keys) {
  return withSubs(form, [...list(form?.allowed_sub_modules), ...keys]);
}

export function clearGroupKeys(form, keys) {
  const drop = new Set(keys);
  return withSubs(form, list(form?.allowed_sub_modules).filter((k) => !drop.has(k)));
}

// ---------------------------------------------------------------------------
// Change summary
// ---------------------------------------------------------------------------

const LABELS = (() => {
  const map = new Map();
  MODULES.forEach((m) => map.set(m.value, m.label));
  for (const mod of NAV_MODULE_TREE) {
    for (const sub of mod.subModules || []) {
      map.set(sub.value, `${mod.label} → ${sub.label}`);
      for (const t of sub.tabModules || []) map.set(t.value, `${mod.label} → ${sub.label} → ${t.label}`);
    }
  }
  for (const fam of [HR_RECRUITMENT_FAMILY, ADMIN_RECRUITMENT_FAMILY]) {
    const modLabel = NAV_MODULE_TREE.find((m) => m.value === fam.moduleKey)?.label;
    for (const t of fam.tabs) {
      if (!map.has(t.value)) map.set(t.value, `${modLabel} → Recruitment → ${t.label}`);
      for (const legacy of t.legacyKeys || []) map.set(legacy, `${modLabel} → Recruitment → ${t.label} (legacy key)`);
    }
  }
  PROJECTS_ENQUIRY_ACCESS_LEVELS.forEach((l) => map.set(l.value, `Projects → Enquiry Master → ${l.label}`));
  SITE_ATTENDANCE_PAGES.forEach((p) => map.set(p.value, `HR Site → Site Attendance → ${p.label}`));
  CALLING_SITE_TYPE_KEYS.forEach((k) => map.set(k.value, `HR Site → Scope → ${k.label}`));
  map.set(IEV_CONFIG_SELECTED_KEY, "IEV → Configuration → Selected items only");
  IEV_CONFIG_PAGES.forEach((p) => map.set(p.value, `IEV → Configuration → ${p.label}`));
  IEV_COSTING_PAGES.forEach((p) => {
    for (const extra of p.extras || []) {
      map.set(extra.value, `IEV → IEV Costing → ${p.label} → ${extra.label}`);
    }
  });
  map.set(EMPLOYEE_MASTER_SUBMODULE_KEY, "IN-House HR/Admin → Employee Master");
  return map;
})();

export function accessKeyLabel(key) {
  return LABELS.get(key) || key;
}

/**
 * Differences between the access a user was loaded with and the current form.
 * Order-only changes are not differences.
 */
export function diffAccess(original, current) {
  const diff = (a, b) => list(b).filter((k) => !list(a).includes(k));
  return {
    modulesAdded: diff(original?.allowed_modules, current?.allowed_modules),
    modulesRemoved: diff(current?.allowed_modules, original?.allowed_modules),
    subsAdded: diff(original?.allowed_sub_modules, current?.allowed_sub_modules),
    subsRemoved: diff(current?.allowed_sub_modules, original?.allowed_sub_modules),
  };
}
