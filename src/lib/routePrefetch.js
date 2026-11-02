/**
 * Map app path prefixes → dynamic import warmers.
 * Used for hover/focus prefetch on navigation without changing route logic.
 */
const WARMERS = [
  { test: (p) => p === '/app/dashboard' || p.endsWith('/app/dashboard'), load: () => import('../pages/Dashboard') },
  { test: (p) => p.includes('/app/fire-tender'), load: () => import('../pages/projects/FireTenderDashboard') },
  { test: (p) => p.includes('/app/hr/dashboard') || p.includes('/app/hr/payroll/salary/dashboard'), load: () => import('../pages/hr/HrDashboard') },
  { test: (p) => p.includes('/app/hr/site-attendance'), load: () => import('../pages/hr/siteAttendance/DashboardPage') },
  { test: (p) => p.includes('/app/admin/dashboard'), load: () => import('../pages/adminOperations/AdminOpsDashboard') },
  { test: (p) => p.includes('/app/admin/recruitment'), load: () => import('../pages/adminOperations/recruitment/RecruitmentDashboard') },
  { test: (p) => p.includes('/app/admin/salary-admin'), load: () => import('../pages/adminOperations/salaryAdmin/SalaryDashboard') },
  { test: (p) => p.includes('/app/compliance'), load: () => import('../pages/compliance/payroll/ComplianceDashboard') },
  { test: (p) => p.includes('/app/marketing/lead'), load: () => import('../pages/marketing/LeadDashboard') },
  { test: (p) => p.includes('/app/marketing'), load: () => import('../pages/marketing/MarketingDashboard') },
  { test: (p) => p.includes('/app/maintenance'), load: () => import('../pages/maintenance/MaintenanceDashboard') },
  { test: (p) => p.includes('/app/api-health'), load: () => import('../pages/apiMonitoring/ApiHealthDashboard') },
  { test: (p) => p.includes('/app/billing'), load: () => import('../pages/billing/Billing') },
  { test: (p) => p.includes('/app/operations'), load: () => import('../pages/operations/Operations') },
  { test: (p) => p.includes('/app/finance') || p.includes('/app/accounts'), load: () => import('../pages/finance/Finance') },
  { test: (p) => p.includes('/app/amc'), load: () => import('../pages/amc/AMC') },
  { test: (p) => p.includes('/app/hr'), load: () => import('../pages/hr/HrDashboard') },
  { test: (p) => p.includes('/app/admin'), load: () => import('../pages/adminOperations/AdminOpsDashboard') },
  { test: (p) => p.includes('/app/settings'), load: () => import('../pages/Settings') },
  { test: (p) => p.includes('/app/user-management'), load: () => import('../pages/userAccess/UserManagementHub') },
];

const warmed = new Set();

export function prefetchRouteModule(pathOrHref) {
  if (!pathOrHref || typeof pathOrHref !== 'string') return;
  let path = pathOrHref;
  try {
    if (pathOrHref.startsWith('http')) path = new URL(pathOrHref).pathname;
  } catch {
    /* keep raw */
  }
  for (const entry of WARMERS) {
    if (!entry.test(path)) continue;
    const key = entry.test.toString();
    if (warmed.has(key)) return;
    warmed.add(key);
    void entry.load().catch(() => {});
    return;
  }
}
