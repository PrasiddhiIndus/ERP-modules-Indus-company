import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PageLoader from '../../../../components/PageLoader';

export default function SalaryLayout() {
  const { pathname } = useLocation();
  const hideHeader =
    pathname.includes('/people-master') ||
    pathname.includes('/dashboard') ||
    /\/salary\/?$/.test(pathname.replace(/\/$/, ''));

  return (
    <div className="min-h-[60vh] max-w-[1600px] space-y-4">
      {!hideHeader ? (
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Salary Management</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-gray-600">
            Site-driven formulas, payroll runs, statutory outputs, and payslips — present days from attendance only.
          </p>
        </div>
      ) : null}
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
