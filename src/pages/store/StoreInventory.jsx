import React, { useState } from "react";
import { STORE_NAV_ITEMS } from "./constants";
import { useStoreModuleData } from "./hooks/useStoreModuleData";
import { Badge, SectionCard } from "./components/StoreUi";
import DashboardPage from "./pages/DashboardPage";
import ItemMasterPage from "./pages/ItemMasterPage";
import StoreMasterPage from "./pages/StoreMasterPage";
import SiteStockPage from "./pages/SiteStockPage";
import { InwardPage, OutwardPage, ReturnPage, TransferPage } from "./pages/TransactionPages";
import PlannerPage from "./pages/PlannerPage";
import ReconciliationPage from "./pages/ReconciliationPage";
import AlertsPage from "./pages/AlertsPage";
import ReportsPage from "./pages/ReportsPage";

function PlaceholderPage({ title }) {
  return (
    <SectionCard title={title}>
      <p className="text-sm text-gray-600">
        This screen is intentionally minimal for now. Core operational pages are fully implemented.
      </p>
    </SectionCard>
  );
}

const StoreInventory = () => {
  const [activePage, setActivePage] = useState("Dashboard");
  const data = useStoreModuleData();

  const renderPage = () => {
    if (activePage === "Dashboard") return <DashboardPage data={data} />;
    if (activePage === "Item Master") return <ItemMasterPage data={data} />;
    if (activePage === "Store Master") return <StoreMasterPage data={data} />;
    if (activePage === "Site Stock") return <SiteStockPage data={data} />;
    if (activePage === "Inward Entry") return <InwardPage data={data} />;
    if (activePage === "Outward / Issue Entry") return <OutwardPage data={data} />;
    if (activePage === "Return Entry") return <ReturnPage data={data} />;
    if (activePage === "Transfer Entry") return <TransferPage data={data} />;
    if (activePage === "Site Requirement Planner") return <PlannerPage data={data} />;
    if (activePage === "Reconciliation") return <ReconciliationPage data={data} />;
    if (activePage === "Alerts") return <AlertsPage data={data} />;
    if (activePage === "Reports") return <ReportsPage data={data} />;
    return <PlaceholderPage title={activePage} />;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr_300px] gap-6 min-h-[calc(100vh-210px)]">
      <aside className="bg-white rounded-xl shadow-sm border border-gray-100 p-2 h-fit">
        <p className="px-2 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Inventory Module</p>
        <div className="space-y-1">
          {STORE_NAV_ITEMS.map((item) => (
            <button
              key={item}
              onClick={() => setActivePage(item)}
              className={`w-full text-left px-3 py-2 rounded text-xs border ${
                activePage === item
                  ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
                  : "bg-white text-gray-700 border-transparent hover:bg-gray-100"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-[#111827]">Inventory Intelligence Module</h2>
              <p className="text-sm text-gray-600 mt-1">
                SAP Fiori + Palantir + AI ERP style operations for multi-store, lifecycle and predictive control.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              {["Global Search", "Store Selector", "Alerts", "Profile", "System Status", "Scan Mode"].map((f) => (
                <button key={f} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50">
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {renderPage()}
      </div>

      <aside className="space-y-4">
        <SectionCard title="AI Intelligence Panel">
          <div className="space-y-2 text-xs">
            <div className="p-2 rounded border bg-purple-50 border-purple-200 text-purple-700">
              Reorder prediction: {data.lowStockItems.length} items currently below threshold.
            </div>
            <div className="p-2 rounded border bg-teal-50 border-teal-200 text-teal-700">
              Site-linked stock intelligence active across {data.sites.length} sites.
            </div>
            <div className="p-2 rounded border bg-amber-50 border-amber-200 text-amber-700">
              Pending returns: {data.returnsPending}. Transit entries: {data.inTransit}.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Inventory State Model">
          <div className="flex flex-wrap gap-1">
            {["Available", "Reserved", "Issued", "In Transit", "Under Repair", "Scrapped", "QC Hold", "Blocked"].map((s) => (
              <Badge key={s} tone="bg-gray-100 text-gray-700">{s}</Badge>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Future-ready Hooks">
          <ul className="text-xs text-gray-700 space-y-1 list-disc pl-4">
            <li>RFID scan overlay support</li>
            <li>Barcode scan mode integration</li>
            <li>IoT sensor telemetry placeholders</li>
            <li>AI assistant anchor</li>
            <li>Multi-country localization readiness</li>
          </ul>
        </SectionCard>
      </aside>
      </div>
    </div>
  );
};

export default StoreInventory;
