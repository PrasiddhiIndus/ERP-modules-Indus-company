import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings, ChevronDown, LayoutDashboard } from "lucide-react";
import {
  FIRE_TENDER_DASHBOARD_PATH,
  FIRE_TENDER_HUB_COSTING,
  FIRE_TENDER_HUB_QUOTATION,
  FIRE_TENDER_HUB_TENDER,
  isFireTenderDashboardNavActive,
  resolveFireTenderWorkflowTab,
} from "./fireTenderRoutes";

const WORKFLOW_TABS = [
  { id: "tender", label: "New Tender", to: FIRE_TENDER_HUB_TENDER },
  { id: "costing", label: "Costing Sheet", to: FIRE_TENDER_HUB_COSTING },
  { id: "quotation", label: "Quotation", to: FIRE_TENDER_HUB_QUOTATION },
];

const tabActiveClass = "bg-red-100 text-red-800 ring-1 ring-red-200";
const tabIdleClass = "text-gray-600 hover:bg-gray-100";

const FireTenderNavbar = ({ activeWorkflowTab, onWorkflowTabChange, showWorkflowTabs = true }) => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  const workflowTab = activeWorkflowTab ?? resolveFireTenderWorkflowTab(pathname);
  const showTabs = showWorkflowTabs && workflowTab != null;
  const onDashboard = isFireTenderDashboardNavActive(pathname);
  const inConfiguration = pathname.includes("/fire-tender/configuration");

  const dashboardClass = onDashboard
    ? "bg-red-100 text-red-800 ring-1 ring-red-200 border-red-200"
    : "text-gray-700 border-gray-200 hover:bg-gray-50";

  return (
    <nav
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
      aria-label="Fire Tender"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 sm:text-xl">Fire Tender Costing</h2>
          <p className="text-xs text-gray-500 sm:text-sm">Tender entry, costing workbook, and quotation</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showTabs &&
            WORKFLOW_TABS.map((tab) =>
              onWorkflowTabChange ? (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onWorkflowTabChange(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                    workflowTab === tab.id ? tabActiveClass : tabIdleClass
                  }`}
                >
                  {tab.label}
                </button>
              ) : (
                <Link
                  key={tab.id}
                  to={tab.to}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                    workflowTab === tab.id ? tabActiveClass : tabIdleClass
                  }`}
                >
                  {tab.label}
                </Link>
              )
            )}

          <Link
            to={FIRE_TENDER_DASHBOARD_PATH}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${dashboardClass}`}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboard
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsConfigOpen((o) => !o)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                inConfiguration ? "bg-red-700 text-white" : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              <Settings className="h-4 w-4" />
              Configuration
              <ChevronDown className={`h-4 w-4 transition-transform ${isConfigOpen ? "rotate-180" : ""}`} />
            </button>

            {isConfigOpen && (
              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                <div className="py-1">
                  {[
                    ["main-component", "Main Component"],
                    ["manual-sub-category", "Manual Sub Category"],
                    ["fire-tender-mail-template", "Fire Tender Mail Template"],
                    ["price-master", "Price Master"],
                    ["accessories", "Accessories"],
                    ["final-components", "Final Components"],
                    ["vehicle-type", "Vehicle Type"],
                  ].map(([slug, label]) => (
                    <Link
                      key={slug}
                      to={`/app/fire-tender/configuration/${slug}`}
                      onClick={() => setIsConfigOpen(false)}
                      className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default FireTenderNavbar;
