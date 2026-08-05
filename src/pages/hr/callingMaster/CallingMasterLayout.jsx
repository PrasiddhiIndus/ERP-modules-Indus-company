import React, { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, ListChecks, PhoneCall } from "lucide-react";
import PageLoader from "../../../components/PageLoader";

const TABS = [
  { to: ".", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "candidates", label: "Candidates", icon: PhoneCall },
  { to: "dropdown-master", label: "Dropdown Master", icon: ListChecks },
];

const tabClass = ({ isActive }) =>
  `inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

export default function CallingMasterLayout() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full min-h-0">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Calling Database</h1>
        <p className="text-xs text-gray-600 mt-0.5">
          Maintain candidate calling records, manage dropdown masters, and review calling metrics.
        </p>
      </div>

      <div className="bg-white shadow-sm rounded-lg border border-slate-200 overflow-hidden shrink-0">
        <nav className="px-4 py-3 flex flex-wrap gap-2" aria-label="Calling database tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
                <Icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 min-h-0 min-w-0">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
