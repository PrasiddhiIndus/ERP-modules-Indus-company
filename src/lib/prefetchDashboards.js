/**
 * Warm every dashboard route chunk (+ shared chart kit) so module home
 * screens open from cache instead of waiting on a cold download.
 * Does not change APIs or auth — import() only.
 */

const DASHBOARD_LOADERS = [
  () => import("../pages/Dashboard"),
  () => import("../pages/dashboard/DashboardChartsIsland"),
  () => import("../components/charts/DashboardCharts"),
  () =>
    import("../services/financeApi").then((m) => m.fetchFinanceModuleData({ force: false })),
  () => import("../pages/projects/FireTenderDashboard"),
  () => import("../pages/hr/HrDashboard"),
  () => import("../pages/adminOperations/AdminOpsDashboard"),
  () => import("../pages/adminOperations/recruitment/RecruitmentDashboard"),
  () => import("../pages/hr/siteAttendance/DashboardPage"),
  () => import("../pages/adminOperations/salaryAdmin/SalaryDashboard"),
  () => import("../pages/hr/payroll/salary/module/screens"),
  () => import("../pages/compliance/payroll/ComplianceDashboard"),
  () => import("../pages/marketing/MarketingDashboard"),
  () => import("../pages/marketing/LeadDashboard"),
  () => import("../pages/maintenance/MaintenanceDashboard"),
  () => import("../pages/apiMonitoring/ApiHealthDashboard"),
  () => import("../pages/billing/Billing"),
  () => import("../pages/manpowerProject/ManpowerEnquiryDashboard"),
  () => import("../pages/operations/Operations"),
  () => import("../pages/finance/Finance"),
  () => import("../pages/amc/AMC"),
];

let started = false;

function runBatch(loaders, concurrency = 3) {
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < loaders.length) {
      const idx = i++;
      try {
        await loaders[idx]();
      } catch {
        /* ignore — offline / stale chunk */
      }
    }
  });
  return Promise.all(workers);
}

/** Kick off after auth shell is up. Priority loaders run immediately; rest on idle. */
export function prefetchAllDashboards() {
  if (started || typeof window === "undefined") return;
  started = true;

  const priority = DASHBOARD_LOADERS.slice(0, 4);
  const rest = DASHBOARD_LOADERS.slice(4);

  void runBatch(priority, 2);

  const kickRest = () => {
    void runBatch(rest, 2);
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(kickRest, { timeout: 3500 });
  } else {
    window.setTimeout(kickRest, 600);
  }
}

export function prefetchAllDashboardsNow() {
  if (typeof window === "undefined") return;
  started = true;
  void runBatch(DASHBOARD_LOADERS, 3);
}
