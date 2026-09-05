import React, { Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PageLoader from "../../../components/PageLoader";
import { PageTaskHeader } from "../../adminOperations/components/AdminUi";
import { PAYROLL_OPS_TITLES, HR_PAYROLL_OPS_DASHBOARD } from "./payrollOpsNav";
import { PayrollOpsProvider, usePayrollOps } from "./payrollOpsScope";
import { CycleSelector, NotificationBell } from "./PayrollOpsUi";

function PayrollOpsLayoutInner() {
  const { pathname } = useLocation();
  const { attendanceSyncedAt } = usePayrollOps();
  const segment = pathname.replace(/\/$/, "").split("/").pop() || HR_PAYROLL_OPS_DASHBOARD;
  const [title, subtitle] = PAYROLL_OPS_TITLES[segment] || PAYROLL_OPS_TITLES.dashboard;
  const showCycle = segment === "dashboard";

  return (
    <div className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <PageTaskHeader title={title} subtitle={subtitle}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-ink-muted">Attendance synced {attendanceSyncedAt}</p>
          {showCycle ? <CycleSelector /> : null}
          <NotificationBell />
        </div>
      </PageTaskHeader>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

export default function PayrollOpsLayout() {
  return (
    <PayrollOpsProvider>
      <PayrollOpsLayoutInner />
    </PayrollOpsProvider>
  );
}
