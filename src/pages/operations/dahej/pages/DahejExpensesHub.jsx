import React from "react";
import { Link, useLocation } from "react-router-dom";
import { DahejExpensesProvider } from "../contexts/DahejExpensesContext";
import { DAHEJ_HUB_TABS } from "../constants/columns";
import { OPERATIONS_BASE } from "../../navConfig";
import { getBreadcrumbs } from "../../navConfig";
import { Breadcrumbs, useThemeClasses } from "../../components/OperationsUi";
import { useOperations } from "../../contexts/OperationsContext";

import DahejExpenseRegister from "./DahejExpenseRegister";
import DahejDashboard from "./DahejDashboard";
import DahejMonthlyRegister from "./DahejMonthlyRegister";
import DahejVehicleMaster from "./DahejVehicleMaster";
import DahejBookingLocationMaster from "./DahejBookingLocationMaster";
import DahejReports from "./DahejReports";

const TAB_PAGES = {
  register: DahejExpenseRegister,
  dashboard: DahejDashboard,
  "monthly-register": DahejMonthlyRegister,
  "vehicle-master": DahejVehicleMaster,
  "booking-locations": DahejBookingLocationMaster,
  reports: DahejReports,
};

function DahejHubShell() {
  const location = useLocation();
  const { theme } = useOperations();
  const t = useThemeClasses(theme);

  const subPath = location.pathname.replace(/^\/app\/operations\/dahej-expenses\/?/, "") || "register";
  const activeTab = DAHEJ_HUB_TABS.find((tab) => tab.path === subPath)?.id || "register";
  const ActivePage = TAB_PAGES[activeTab] || DahejExpenseRegister;

  const crumbs = [
    ...getBreadcrumbs("dahej-expenses"),
    { label: DAHEJ_HUB_TABS.find((x) => x.id === activeTab)?.label || "Register" },
  ];

  return (
    <div className="space-y-3">
      <Breadcrumbs items={crumbs} theme={theme} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className={`text-lg font-bold ${t.dark ? "text-slate-100" : "text-gray-900"}`}>Dahej Expenses</h2>
          <p className={`text-xs ${t.muted}`}>
            Advance payments, operational expenses, fuel, vehicle maintenance & site expenses — Dahej operations
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border-b border-gray-200">
        <nav className="flex gap-1 min-w-max">
          {DAHEJ_HUB_TABS.map((tab) => {
            const href = `${OPERATIONS_BASE}/dahej-expenses/${tab.path}`;
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                to={href}
                className={`px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? "border-[#1F3A8A] text-[#1F3A8A] bg-blue-50/40"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <ActivePage />
    </div>
  );
}

export default function DahejExpensesHub() {
  return (
    <DahejExpensesProvider>
      <DahejHubShell />
    </DahejExpensesProvider>
  );
}
