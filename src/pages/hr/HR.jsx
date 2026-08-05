import React, { Suspense } from "react";
import { Outlet } from "react-router-dom";
import PageLoader from "../../components/PageLoader";

export default function HRManagement() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full min-h-0">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">HR Management</h1>
        <p className="text-xs text-gray-600 mt-0.5">
          Maintain employee master data for HR operations.
        </p>
      </div>

      <div className="flex-1 min-h-0 min-w-0">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
