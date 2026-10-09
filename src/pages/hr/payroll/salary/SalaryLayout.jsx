import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import PageLoader from "../../../../components/PageLoader";
import { SalaryModuleProvider } from "./module/SalaryModuleContext";

export default function SalaryLayout() {
  return (
    <SalaryModuleProvider>
      <div className="flex min-h-[60vh] max-w-[1600px] flex-col gap-4">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </SalaryModuleProvider>
  );
}
