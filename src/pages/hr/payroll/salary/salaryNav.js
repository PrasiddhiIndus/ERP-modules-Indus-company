export const HR_SALARY_BASE = 'hr/payroll/salary';
export const HR_SALARY_DASHBOARD = 'dashboard';

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
