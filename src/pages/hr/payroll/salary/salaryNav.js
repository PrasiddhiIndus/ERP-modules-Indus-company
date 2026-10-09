export const HR_SALARY_BASE = "hr/payroll/salary";
export const HR_SALARY_APP_BASE = `/app/${HR_SALARY_BASE}`;
export const HR_SALARY_DASHBOARD = "dashboard";

/** Absolute /app/... path — use for Link/navigate from nested salary pages. */
export function salaryAppPath(...segments) {
  const tail = segments.filter((segment) => segment != null && segment !== "").join("/");
  return tail ? `${HR_SALARY_APP_BASE}/${tail}` : HR_SALARY_APP_BASE;
}

/** Alias for sidebar NavLink (absolute /app/... paths). */
export function salaryNavPath(...segments) {
  return salaryAppPath(...segments);
}

export function salaryNavHref(itemOrSegment) {
  if (typeof itemOrSegment === "string") return salaryAppPath(itemOrSegment);
  if (itemOrSegment?.to) return salaryAppPath(itemOrSegment.to);
  if (itemOrSegment?.path) {
    return itemOrSegment.path.startsWith("/") ? itemOrSegment.path : `/app/${itemOrSegment.path}`;
  }
  return HR_SALARY_APP_BASE;
}

/** Main header link — Salary Management opens dashboard. */
export const SALARY_NAV = [{ to: HR_SALARY_DASHBOARD, label: "Dashboard" }];

/** Sidebar dropdown under Salary Management. Flat list — no section labels. */
export const SALARY_SUB_NAV = [
  { to: "dashboard", label: "Dashboard" },
  { to: "components", label: "Salary Components" },
  { to: "sites", label: "Site Setup" },
  { to: "process", label: "Process & Disburse" },
  { to: "slips", label: "Salary Slip" },
  { to: "revisions", label: "Salary Revision" },
  { to: "reports", label: "Report" },
];

const DASHBOARD_HINTS = {
  dashboard: "Payroll overview for the selected month",
  components: "Names and formulas for earnings and deductions",
  sites: "Turn components on and rename them per site",
  process: "Disburse selected sites for the month",
  slips: "View and print slips after disbursement",
  revisions: "Basic-pay change history",
  reports: "Disbursed salary and overtime",
};

const DASHBOARD_GROUPS = [
  {
    title: "Salary",
    routes: ["dashboard", "components", "sites", "process", "slips", "revisions", "reports"],
  },
];

const navByRoute = new Map(SALARY_SUB_NAV.map((item) => [item.to, item]));

export const SALARY_DASHBOARD_MODULES = DASHBOARD_GROUPS.map((group) => ({
  title: group.title,
  items: group.routes
    .map((to) => {
      const nav = navByRoute.get(to);
      if (!nav) return null;
      return { id: to, to, label: nav.label, hint: DASHBOARD_HINTS[to] || nav.label };
    })
    .filter(Boolean),
}));

export function salaryNavIsActive(item, location) {
  const base = `/app/${HR_SALARY_BASE}`;
  const path = (location.pathname || location).replace(/\/$/, "");
  const prefixes = Array.isArray(item.matchPrefix) ? item.matchPrefix : [item.matchPrefix || item.to];
  if (prefixes.includes(HR_SALARY_DASHBOARD)) {
    return path === `${base}/${HR_SALARY_DASHBOARD}` || path === base;
  }
  return prefixes.some((prefix) => path === `${base}/${prefix}` || path.startsWith(`${base}/${prefix}/`));
}

export function isSalaryNavActive(item, pathname) {
  return salaryNavIsActive(item, { pathname });
}
