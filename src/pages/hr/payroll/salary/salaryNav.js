export const HR_SALARY_BASE = 'hr/payroll/salary';
export const HR_SALARY_APP_BASE = `/app/${HR_SALARY_BASE}`;
export const HR_SALARY_DASHBOARD = 'dashboard';

/** Absolute /app/... path — use for Link/navigate from nested salary pages. */
export function salaryAppPath(...segments) {
  const tail = segments.filter((s) => s != null && s !== '').join('/');
  return tail ? `${HR_SALARY_APP_BASE}/${tail}` : HR_SALARY_APP_BASE;
}

/** Alias for sidebar NavLink (absolute /app/... paths). */
export function salaryNavPath(...segments) {
  return salaryAppPath(...segments);
}

/** Main header link — Salary Management opens dashboard. */
export const SALARY_NAV = [{ to: HR_SALARY_DASHBOARD, label: 'Dashboard' }];

/** Sidebar dropdown under Salary Management (no Component Master). */
export const SALARY_SUB_NAV = [
  { to: 'site-master', label: 'Site Master' },
  { to: 'formula-library', label: 'Formula Library' },
  { to: 'payroll-package-builder', label: 'Payroll Package Builder' },
  { to: 'people-master', label: 'People Master', matchPrefix: 'people-master' },
  { to: 'attendance-integration', label: 'Attendance Integration' },
  { to: 'compliance-management', label: 'Compliance Management', matchPrefix: ['compliance-management', 'compliance'] },
  { to: 'payroll-processing', label: 'Payroll Processing' },
  { to: 'payroll-approval', label: 'Payroll Approval' },
  { to: 'payslips', label: 'Payslips' },
  { to: 'reports-exports', label: 'Reports & Exports' },
  { to: 'employee-exit', label: 'Employee exit' },
  { to: 'full-final-settlement', label: 'Full & Final Settlement' },
  { to: 'settings', label: 'Settings' },
];

export function salaryNavIsActive(item, location) {
  const base = `/app/${HR_SALARY_BASE}`;
  const path = location.pathname.replace(/\/$/, '');
  const prefixes = Array.isArray(item.matchPrefix)
    ? item.matchPrefix
    : [item.matchPrefix || item.to];
  if (prefixes.includes(HR_SALARY_DASHBOARD)) {
    return path === `${base}/${HR_SALARY_DASHBOARD}` || path === base;
  }
  return prefixes.some((p) => path.startsWith(`${base}/${p}`));
}
