import React from "react";
import { Outlet } from "react-router-dom";

/**
 * Shell for Compliance dashboard + payroll filing pages.
 * Module switch lives in the sidebar (Dashboard / Payroll Compliance).
 */
export default function CompliancePayrollLayout() {
  return (
    <div className="space-y-3 max-w-[1600px] w-full mx-auto">
      <Outlet />
    </div>
  );
}
