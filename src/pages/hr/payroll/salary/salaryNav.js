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

<<<<<<< Updated upstream
/** Main header link — Salary Management opens dashboard. */
export const SALARY_NAV = [{ to: HR_SALARY_DASHBOARD, label: 'Dashboard' }];

/** Sidebar dropdown under Salary Management (no Component Master). */
=======
export function salaryNavHref(itemOrSegment) {
  if (typeof itemOrSegment === 'string') return salaryAppPath(itemOrSegment);
  if (itemOrSegment?.to) return salaryAppPath(itemOrSegment.to);
  if (itemOrSegment?.path) {
    return itemOrSegment.path.startsWith('/') ? itemOrSegment.path : `/app/${itemOrSegment.path}`;
  }
  return HR_SALARY_APP_BASE;
}

/** Main header link — Salary Management opens dashboard. */
export const SALARY_NAV = [{ to: HR_SALARY_DASHBOARD, label: 'Dashboard' }];

/** Sidebar dropdown under Salary Management — single source of truth for module list. */
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
export function salaryNavIsActive(item, location) {
  const base = `/app/${HR_SALARY_BASE}`;
  const path = location.pathname.replace(/\/$/, '');
  const prefixes = Array.isArray(item.matchPrefix)
    ? item.matchPrefix
    : [item.matchPrefix || item.to];
=======
const DASHBOARD_HINTS = {
  'site-master': 'Payroll sites & locations',
  'formula-library': 'Components & formula packages',
  'payroll-package-builder': 'Site-wise salary formulas',
  settings: 'Module preferences',
  'people-master': 'Employee payroll profiles',
  'attendance-integration': 'Present days & manual inputs',
  'compliance-management': 'PF, ESIC, PT, TDS & loans',
  'payroll-processing': 'Run monthly payroll',
  'payroll-approval': 'Review & approve register',
  payslips: 'Generate employee payslips',
  'reports-exports': 'Payroll register & exports',
  'full-final-settlement': 'Loans & recoveries',
  'employee-exit': 'Exit & clearance workflow',
};

const DASHBOARD_GROUPS = [
  {
    title: 'Setup & configuration',
    routes: ['site-master', 'formula-library', 'payroll-package-builder', 'settings'],
  },
  {
    title: 'People & attendance',
    routes: ['people-master', 'attendance-integration'],
  },
  {
    title: 'Compliance & statutory',
    routes: ['compliance-management'],
  },
  {
    title: 'Processing & outputs',
    routes: [
      'payroll-processing',
      'payroll-approval',
      'payslips',
      'reports-exports',
      'full-final-settlement',
      'employee-exit',
    ],
  },
];

const navByRoute = new Map(SALARY_SUB_NAV.map((item) => [item.to, item]));

/** Dashboard shortcuts — derived from SALARY_SUB_NAV (no duplicate labels/routes). */
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
  const path = (location.pathname || location).replace(/\/$/, '');
  const prefixes = Array.isArray(item.matchPrefix) ? item.matchPrefix : [item.matchPrefix || item.to];
>>>>>>> Stashed changes
  if (prefixes.includes(HR_SALARY_DASHBOARD)) {
    return path === `${base}/${HR_SALARY_DASHBOARD}` || path === base;
  }
  return prefixes.some((p) => path.startsWith(`${base}/${p}`));
}
<<<<<<< Updated upstream
=======

export function isSalaryNavActive(item, pathname) {
  return salaryNavIsActive(item, { pathname });
}
>>>>>>> Stashed changes
