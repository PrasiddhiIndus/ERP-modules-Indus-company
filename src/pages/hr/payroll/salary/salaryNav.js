export const HR_SALARY_BASE = 'hr/payroll/salary';
export const HR_SALARY_APP_BASE = `/app/${HR_SALARY_BASE}`;
export const HR_SALARY_DASHBOARD = 'dashboard';

/** Absolute /app/... path — use for Link/navigate from nested salary pages (avoids dashboard/run → login). */
export function salaryAppPath(...segments) {
  const tail = segments.filter((s) => s != null && s !== '').join('/');
  return tail ? `${HR_SALARY_APP_BASE}/${tail}` : HR_SALARY_APP_BASE;
}

export const SALARY_NAV = [
  { to: HR_SALARY_DASHBOARD, label: 'Dashboard' },
  { to: 'employees', label: 'Employee payroll list' },
  { to: 'run', label: 'Payroll run' },
  { to: 'site-formulas', label: 'Site formulas' },
  { to: 'manual-inputs', label: 'Manual inputs' },
  { to: 'pf', label: 'PF' },
  { to: 'esic', label: 'ESIC' },
  { to: 'pt', label: 'State tax (PT)' },
  { to: 'tds', label: 'Income tax (TDS)' },
  { to: 'loans', label: 'Loans & recoveries' },
  { to: 'register', label: 'Payroll register' },
  { to: 'outputs', label: 'Payslips / outputs' },
  { to: 'settings', label: 'Settings' },
];

/** Sidebar submenu — dashboard opens from the Salary Management header link. */
export const SALARY_SUB_NAV = SALARY_NAV.filter((item) => item.to !== HR_SALARY_DASHBOARD);
