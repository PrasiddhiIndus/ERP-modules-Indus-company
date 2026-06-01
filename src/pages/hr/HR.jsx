import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Users, Wallet } from "lucide-react";

const HR_TABS = [
  { to: "employee-master", label: "Employee Master", icon: Users },
  { to: "salary-inputs", label: "Salary Inputs", icon: Wallet },
];

const tabClass = ({ isActive }) =>
  `inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

export default function HRManagement() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full min-h-0">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">HR Management</h1>
        <p className="text-xs text-gray-600 mt-0.5">
          Maintain employee master data and enter monthly salary inputs for payroll.
        </p>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-slate-200 overflow-hidden shrink-0">
        <nav className="px-4 py-3 flex flex-wrap gap-2" aria-label="HR management tabs">
          {HR_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink key={tab.to} to={tab.to} className={tabClass}>
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 min-h-0 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
