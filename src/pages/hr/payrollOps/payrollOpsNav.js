export const HR_PAYROLL_OPS_BASE = "hr/payroll-ops";
export const HR_PAYROLL_OPS_APP_BASE = `/app/${HR_PAYROLL_OPS_BASE}`;
export const HR_PAYROLL_OPS_DASHBOARD = "dashboard";

export function payrollOpsAppPath(...segments) {
  const tail = segments.filter((s) => s != null && s !== "").join("/");
  return tail ? `${HR_PAYROLL_OPS_APP_BASE}/${tail}` : HR_PAYROLL_OPS_APP_BASE;
}

export function payrollOpsNavPath(...segments) {
  return payrollOpsAppPath(...segments);
}

export const PAYROLL_OPS_SUB_NAV = [
  { to: "dashboard", label: "Dashboard" },
  { to: "sites", label: "Sites" },
  { to: "process-salary", label: "Process Salary", matchPrefix: "process-salary" },
  { to: "salary-history", label: "Salary History" },
  { to: "reports", label: "Reports" },
  { to: "compliance", label: "Compliance" },
  { to: "site-setup", label: "Site Setup" },
];

export const PAYROLL_OPS_TITLES = {
  dashboard: ["Dashboard", "Payroll snapshot across deployed sites"],
  sites: ["Sites", "Review sites and queue a salary run"],
  "process-salary": ["Process Salary", "Edit the cycle sheet and disburse a site"],
  "salary-history": ["Salary History", "Processed and held cycles"],
  reports: ["Reports", "Spend patterns and cost-reduction flags"],
  compliance: ["Compliance", "Statutory filings and employee flags"],
  "site-setup": ["Site Setup", "Onboard a site and set salary components"],
};

export function payrollOpsNavIsActive(item, location) {
  const base = HR_PAYROLL_OPS_APP_BASE;
  const path = (location.pathname || location).replace(/\/$/, "");
  const prefixes = Array.isArray(item.matchPrefix) ? item.matchPrefix : [item.matchPrefix || item.to];
  if (prefixes.includes(HR_PAYROLL_OPS_DASHBOARD)) {
    return path === `${base}/${HR_PAYROLL_OPS_DASHBOARD}` || path === base;
  }
  return prefixes.some((p) => path.startsWith(`${base}/${p}`));
}
