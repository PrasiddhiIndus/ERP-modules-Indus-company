import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AmcProvider } from "./contexts/AmcContext";
import { AMC_NAV, getAmcTabFromPath, amcPath } from "./navConfig";
import Dashboard from "./Dashboard";
import Customers from "./Customers";
import Contracts from "./Contracts";
import Sites from "./Sites";
import Assets from "./Assets";
import PMSchedule from "./PMSchedule";
import Complaints from "./Complaints";
import Visits from "./Visits";
import TechnicianAllocation from "./TechnicianAllocation";
import ServiceReports from "./ServiceReports";
import Alerts from "./Alerts";
import Reports from "./Reports";
import Settings from "./Settings";

const PAGE_MAP = {
  dashboard: Dashboard,
  customers: Customers,
  contracts: Contracts,
  sites: Sites,
  assets: Assets,
  "pm-schedule": PMSchedule,
  complaints: Complaints,
  visits: Visits,
  technicians: TechnicianAllocation,
  "service-reports": ServiceReports,
  alerts: Alerts,
  reports: Reports,
  settings: Settings,
};

function AmcShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = getAmcTabFromPath(location.pathname);
  const ActivePage = PAGE_MAP[activeId] || Dashboard;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-3">
          <h1 className="text-xl font-bold text-gray-900">AMC Management</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Annual Maintenance Contract operations command center
          </p>
        </div>
        <div className="px-4 sm:px-6 overflow-x-auto">
          <nav className="flex gap-1 min-w-max pb-0 border-b border-transparent">
            {AMC_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(amcPath(item.id))}
                  className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? "border-[#1F3A8A] text-[#1F3A8A] bg-blue-50/40"
                      : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4 max-w-[1600px] mx-auto">
        <ActivePage />
      </div>
    </div>
  );
}

export default function AMC() {
  return (
    <AmcProvider>
      <AmcShell />
    </AmcProvider>
  );
}
