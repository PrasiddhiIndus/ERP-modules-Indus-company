import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { PayrollScopeProvider } from "./payrollScope";

const tabClass = ({ isActive }) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
    isActive ? "bg-[#1F3A8A] text-white border-[#1F3A8A]" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
  }`;

function PayrollLayoutInner() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Payroll & attendance sheets</h1>
          <p className="text-xs text-gray-600 mt-0.5 max-w-2xl">
            Pull attendance days into a prefilled payroll entry sheet, keep selected inputs editable, and export live Excel formulas
            for Accounts and Compliance.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Payroll views">
          <NavLink to="dashboard" className={tabClass} end>
            Payroll dashboard
          </NavLink>
          <NavLink to="entry" className={tabClass}>
            Entry sheet (Excel)
          </NavLink>
          <NavLink to="year" className={tabClass}>
            Year view
          </NavLink>
          <NavLink to="formula" className={tabClass}>
            Formula reference
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}

/** Admin Operations payroll shell. */
export default function PayrollLayout() {
  return (
    <PayrollScopeProvider scopeKey="admin">
      <PayrollLayoutInner />
    </PayrollScopeProvider>
  );
}
