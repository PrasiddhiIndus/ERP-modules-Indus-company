import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

export default function SalaryLayout() {
  const { pathname } = useLocation();
  const hideHeader = pathname.includes('/employee-master');

  return (
    <div className="space-y-4 min-h-[60vh]">
      {!hideHeader ? (
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Salary Management</h1>
          <p className="text-xs text-gray-600 mt-0.5 max-w-2xl">
            Site-driven formulas, payroll runs, statutory outputs, and payslips — present days from attendance only.
          </p>
        </div>
      ) : null}
      <Outlet />
    </div>
  );
}
