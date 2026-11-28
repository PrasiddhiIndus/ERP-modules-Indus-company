/**
 * First-level Indus One sidebar pages — shared by Layout and IT Support Raise Ticket.
 *
 * NAV_MODULE_TREE is the User Management / permission catalog (logical categories).
 * The sidebar often flattens, renames, or hides those categories. This module is the
 * final list of labels users see under each module expander (not nested tabs/content).
 */
import { MARKETING_NAV_ITEMS } from "../pages/marketing/marketingNav";
import { canAccessRulesConsole } from "../pages/adminOperations/rulesConsole/rulesConsoleAccess";
import { canViewPettyCash } from "../pages/adminOperations/pettyCash/pettyCashPermissions";
import { EMPLOYEE_MASTER_SUBMODULE_KEY } from "../pages/adminOperations/salaryAdmin/salaryAccess";
import { resolveItSupportAccess } from "../pages/itSupport/itSupportAccess";
import {
  NAV_MODULE_TREE,
  ROLES,
  ADMIN_RECRUITMENT_SUBMODULE_KEY,
  FINANCE_MASTER_PO_AT_GLANCE_SUBMODULE_KEY,
  HR_RECRUITMENT_FAMILY,
  PROBATION_REVIEWS_APP_PATH,
  RULES_CONSOLE_SUBMODULE_KEY,
  PETTY_CASH_SUBMODULE_KEY,
  canSeeNavPath,
  canSeeSubModule,
  getNavVisibleModuleKeys,
  getOpenableIevCostingTabs,
  getOpenableProjectsContractTabs,
  getOpenableProjectsEnquiryTabs,
  getRecruitmentLandingPath,
  hasAnyRecruitmentTabAccess,
  isPathAllowed,
  normalizeAppRole,
} from "./roles";

/** UM categories present in NAV_MODULE_TREE but wrapped in `{false && …}` in Layout (NAV_HIDDEN). */
const NAV_HIDDEN_SUBMODULE_KEYS = new Set([
  "admin.store",
  "admin.gate",
  "admin.misc",
  "admin.settings",
]);

/** Sidebar label when it differs from the UM / NAV_MODULE_TREE category label. */
const SIDEBAR_LABEL_OVERRIDES = {
  [ADMIN_RECRUITMENT_SUBMODULE_KEY]: "Recruitment",
  "hr.salary-management": "Payroll",
  "itIs.subscriptions": "Software Subscriptions",
  "itIs.helpdesk": "IT Support",
};

/**
 * Admin → Employee Administration is one UM category; Layout renders these as
 * first-level sidebar links (all gated by `admin.employee`).
 */
export const ADMIN_EMPLOYEE_SIDEBAR_PAGES = [
  { value: "admin.employee.onboarding", label: "Onboarding", path: "/app/admin/employee/onboarding" },
  { value: "admin.employee.policies", label: "Policies & Terms", path: "/app/admin/employee/policies" },
  {
    value: "admin.employee.official-letters",
    label: "Official Letters",
    path: "/app/admin/employee/official-letters",
  },
  { value: "admin.employee.surveys", label: "Surveys", path: "/app/admin/employee/surveys" },
  {
    value: "admin.employee.attendance-inputs",
    label: "Raw Attendance Data",
    path: "/app/admin/employee/attendance-inputs",
  },
  {
    value: "admin.employee.attendance-daily",
    label: "Daily Attendance Register",
    path: "/app/admin/employee/attendance-daily",
  },
  {
    value: "admin.employee.national-holidays",
    label: "National / Public Holidays",
    path: "/app/admin/employee/national-holidays",
  },
  {
    value: "admin.employee.leaves-permissions",
    label: "Leave Approvals",
    path: "/app/admin/employee/leaves-permissions",
  },
  {
    value: "admin.employee.tour-approvals",
    label: "Tour Approvals",
    path: "/app/admin/employee/tour-approvals",
  },
  {
    value: "admin.employee.leave-management",
    label: "Leave Management",
    path: "/app/admin/employee/leave-management",
  },
  { value: "admin.employee.inactive", label: "Inactive Employees", path: "/app/admin/employee/inactive" },
  { value: "admin.employee.exit-ff", label: "F & F", path: "/app/admin/employee/exit-ff" },
];

/**
 * Compliance → Payroll Compliance category; Layout shows three first-level links.
 */
export const COMPLIANCE_PAYROLL_SIDEBAR_PAGES = [
  { value: "compliance.payroll.dashboard", label: "Dashboard", path: "/app/compliance/dashboard" },
  { value: "compliance.payroll.forms", label: "Compliance Forms", path: "/app/compliance/forms" },
  {
    value: "compliance.payroll.process",
    label: "Payroll Compliance",
    path: "/app/compliance/payroll-process",
  },
];

function page(def) {
  return {
    value: String(def.value),
    label: String(def.label),
    path: def.path || null,
    /** Existing permission key checked with canSeeSubModule (may differ from value for flattened leaves). */
    gateKey: def.gateKey || def.value,
    /** Special Layout gate — see canSeeSidebarPage. */
    gate: def.gate || null,
  };
}

function expandTreeSubmodule(modValue, sub) {
  if (!sub?.value || !sub?.label) return [];
  if (NAV_HIDDEN_SUBMODULE_KEYS.has(sub.value)) return [];

  // IT/IS helpdesk / hardware role buckets → single sidebar "IT Support" link.
  if (sub.value === "itIs.helpdesk-agent" || sub.value === "itIs.helpdesk-admin") return [];
  if (String(sub.value).startsWith("itIs.hardware-support")) return [];
  if (sub.value === "itIs.helpdesk") {
    return [page({ value: "itIs.helpdesk", label: "IT Support", path: "/app/it-support", gate: "helpdesk" })];
  }

  if (sub.value === "admin.employee") {
    return ADMIN_EMPLOYEE_SIDEBAR_PAGES.map((p) =>
      page({ ...p, gateKey: "admin.employee", gate: "sub" })
    );
  }

  if (sub.value === "compliance.payroll") {
    return COMPLIANCE_PAYROLL_SIDEBAR_PAGES.map((p) =>
      page({ ...p, gateKey: "compliance.payroll", gate: "sub" })
    );
  }

  if (modValue === "marketing") {
    const item = MARKETING_NAV_ITEMS.find((m) => m.subModule === sub.value);
    if (item) {
      return [
        page({
          value: item.subModule,
          label: item.label,
          path: item.path,
          gateKey: item.subModule,
          gate: "sub",
        }),
      ];
    }
  }

  let gate = "sub";
  if (sub.value === "projects.enquiry") gate = "enquiry";
  else if (sub.value === "projects.po") gate = "contract";
  else if (sub.value === "fireTender.costing") gate = "ievCosting";
  else if (sub.value === "finance.pl") gate = "financePl";
  else if (sub.value === HR_RECRUITMENT_FAMILY.parentKey) gate = "hrRecruitment";
  else if (sub.value === ADMIN_RECRUITMENT_SUBMODULE_KEY) gate = "adminRecruitment";
  else if (sub.value === RULES_CONSOLE_SUBMODULE_KEY) gate = "rulesConsole";
  else if (sub.value === PETTY_CASH_SUBMODULE_KEY) gate = "pettyCash";
  else if (sub.value === "fireTender.dashboard") gate = "path";
  else if (sub.value === "fireTender.manufacturing") gate = "path";
  else if (modValue === "amc") gate = "path";

  return [
    page({
      value: sub.value,
      label: SIDEBAR_LABEL_OVERRIDES[sub.value] || sub.label,
      path: sub.pathPrefix || null,
      gateKey: sub.value,
      gate,
    }),
  ];
}

/**
 * Full first-level sidebar catalog for a module (unfiltered).
 * Order matches Layout under that module’s expander / utility group.
 */
export function listSidebarNavPagesForModule(moduleKey) {
  const mod = (NAV_MODULE_TREE || []).find((m) => m.value === moduleKey);
  if (!mod) return [];

  if (!(mod.subModules || []).length) return [];

  const pages = [];
  for (const sub of mod.subModules || []) {
    pages.push(...expandTreeSubmodule(mod.value, sub));
    // Probation Reviews is Layout-only (not a NAV_MODULE_TREE page); sits after Employee Admin leaves.
    if (sub.value === "admin.employee") {
      pages.push(
        page({
          value: "admin.probation-reviews",
          label: "Probation Reviews",
          path: PROBATION_REVIEWS_APP_PATH,
          gate: "probation",
          gateKey: "admin.probation-reviews",
        })
      );
    }
  }
  return pages;
}

/** All modules → first-level sidebar pages (unfiltered). */
export function listAllSidebarNavPagesByModule() {
  return (NAV_MODULE_TREE || [])
    .filter((m) => m?.value && m?.label)
    .map((m) => ({
      value: String(m.value),
      label: String(m.label),
      // Sidebar module title for Finance is "Finance" (Layout), not "Finance/Accounts".
      sidebarLabel: m.value === "finance" ? "Finance" : String(m.label),
      pages: listSidebarNavPagesForModule(m.value),
    }));
}

/**
 * Same visibility rules Layout uses for each first-level link.
 * `ctx.flags.probationReviews` should mirror useProbationReviewsAccess().canAccess when known.
 */
export function canSeeSidebarPage(page, ctx) {
  if (!page?.value) return false;
  const meta = ctx.userMetadata;
  const gate = page.gate || "sub";

  switch (gate) {
    case "helpdesk":
      // Super Admin / full itIs / explicit Software or Hardware Support grants only.
      return resolveItSupportAccess(ctx.profile).hasAny;
    case "enquiry":
      return getOpenableProjectsEnquiryTabs(ctx.profile, ctx.accessibleModules, ctx.subModulePaths).length > 0;
    case "contract":
      return getOpenableProjectsContractTabs(ctx.profile, ctx.accessibleModules, ctx.subModulePaths).length > 0;
    case "ievCosting":
      return getOpenableIevCostingTabs(ctx.profile, ctx.accessibleModules, ctx.subModulePaths).length > 0;
    case "financePl": {
      const hasPl = canSeeSubModule(ctx.profile, ctx.accessibleModules, "finance.pl", meta);
      const hasScope =
        canSeeSubModule(ctx.profile, ctx.accessibleModules, "finance.pl.fire", meta) ||
        canSeeSubModule(ctx.profile, ctx.accessibleModules, "finance.pl.safety", meta);
      return (
        hasPl ||
        (hasScope && isPathAllowed("/app/accounts-finance", ctx.accessibleModules, ctx.subModulePaths))
      );
    }
    case "hrRecruitment": {
      const landing = getRecruitmentLandingPath(ctx.profile, ctx.accessibleModules, meta, "hr");
      return (
        canSeeSubModule(ctx.profile, ctx.accessibleModules, HR_RECRUITMENT_FAMILY.parentKey, meta) ||
        (hasAnyRecruitmentTabAccess(ctx.profile, ctx.accessibleModules, meta, "hr") &&
          isPathAllowed(landing, ctx.accessibleModules, ctx.subModulePaths))
      );
    }
    case "adminRecruitment": {
      const landing = getRecruitmentLandingPath(ctx.profile, ctx.accessibleModules, meta, "admin");
      return (
        canSeeSubModule(ctx.profile, ctx.accessibleModules, ADMIN_RECRUITMENT_SUBMODULE_KEY, meta) ||
        (hasAnyRecruitmentTabAccess(ctx.profile, ctx.accessibleModules, meta, "admin") &&
          isPathAllowed(landing, ctx.accessibleModules, ctx.subModulePaths))
      );
    }
    case "rulesConsole":
      return canAccessRulesConsole(ctx.profile, ctx.accessibleModules);
    case "pettyCash":
      return canViewPettyCash(ctx.profile, ctx.accessibleModules, meta);
    case "probation":
      return Boolean(ctx.flags?.probationReviews);
    case "path": {
      const path = page.path;
      if (!path) return false;
      // AMC / IEV dashboard-style: Layout uses canSubPath / canOpenPath.
      if (path.startsWith("/app/amc")) {
        const key = page.gateKey;
        if (key && canSeeSubModule(ctx.profile, ctx.accessibleModules, key, meta)) return true;
      }
      return isPathAllowed(path, ctx.accessibleModules, ctx.subModulePaths);
    }
    case "sub":
    default: {
      const key = page.gateKey || page.value;
      if (page.path && canSeeNavPath(String(page.path), ctx)) return true;
      if (key === EMPLOYEE_MASTER_SUBMODULE_KEY || key === FINANCE_MASTER_PO_AT_GLANCE_SUBMODULE_KEY) {
        return canSeeSubModule(ctx.profile, ctx.accessibleModules, key, meta);
      }
      return canSeeSubModule(ctx.profile, ctx.accessibleModules, key, meta);
    }
  }
}

/** Authorised first-level sidebar pages under one module (exact sidebar labels). */
export function getAuthorisedSidebarNavPagesForModule(moduleKey, ctx) {
  return listSidebarNavPagesForModule(moduleKey).filter((p) => canSeeSidebarPage(p, ctx));
}

/**
 * Modules the user can see in nav, each with authorised first-level sidebar pages.
 * Super Admin / Super Admin Pro get the full unfiltered sidebar catalog.
 */
export function getAuthorisedSidebarNavByModule(
  userProfile,
  accessibleModules,
  userMetadata = null,
  subModulePaths = null,
  flags = null
) {
  if (!userProfile) return [];

  const mods = accessibleModules instanceof Set ? accessibleModules : new Set(accessibleModules || []);
  const paths = subModulePaths instanceof Set ? subModulePaths : new Set(subModulePaths || []);
  const email = userMetadata?.email || userProfile?.email || "";
  const meta = { ...(userMetadata || {}), email };
  const ctx = {
    profile: userProfile,
    accessibleModules: mods,
    subModulePaths: paths,
    userMetadata: meta,
    flags: flags || {},
  };

  const role = normalizeAppRole(userProfile?.role);
  const isSuper = role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
  const visibleModuleKeys = isSuper
    ? new Set((NAV_MODULE_TREE || []).map((m) => m.value))
    : getNavVisibleModuleKeys(userProfile, mods, meta);

  const out = [];
  for (const raw of NAV_MODULE_TREE || []) {
    if (!raw?.value || !raw?.label) continue;
    if (!visibleModuleKeys.has(raw.value) && !mods.has(raw.value)) continue;

    // Always apply Layout visibility gates (incl. Probation Reviews flag).
    const pages = getAuthorisedSidebarNavPagesForModule(raw.value, ctx);

    if ((raw.subModules || []).length === 0) {
      if (mods.has(raw.value) || visibleModuleKeys.has(raw.value)) {
        out.push({
          value: String(raw.value),
          label: raw.value === "finance" ? "Finance" : String(raw.label),
          pages: [],
        });
      }
      continue;
    }

    if (pages.length > 0) {
      out.push({
        value: String(raw.value),
        label: raw.value === "finance" ? "Finance" : String(raw.label),
        pages: pages.map((p) => ({ value: p.value, label: p.label })),
      });
    }
  }
  return out;
}
