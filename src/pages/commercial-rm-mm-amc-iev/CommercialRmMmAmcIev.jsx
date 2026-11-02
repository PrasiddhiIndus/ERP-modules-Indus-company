import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BillingProvider, useBilling } from "../../contexts/BillingContext";
import { COMMERCIAL_MODULE_RM } from "../../constants/commercialModuleType";
import POEntry from "./POEntry";
import ContactLog from "./ContactLog";
import CommercialDashboardRmMmAmcIev from "./dashboard/CommercialDashboardRmMmAmcIev";

const TAB_IDS = ["po-entry", "contact-log"];
const RM_BASE = "/app/commercial/rm-mm-amc-iev";

/** Commercial R&M module shows only R&M vertical (AMC / IEV / M&M stay in their own modules). */
function isRmCommercialPo(p) {
  const oc = String(p?.ocNumber || "").trim();
  if (oc.startsWith("IFSPL-")) {
    const seg = oc.split("-")[1];
    if (seg) return seg === "R&M";
  }
  return String(p?.vertical || "").trim() === "R&M";
}

const CommercialInnerRm = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    billingError,
    clearBillingError,
    commercialPOs,
    setCommercialPOs,
    setInvoices,
  } = useBilling();
  const pathRest = location.pathname.startsWith(RM_BASE)
    ? location.pathname.slice(RM_BASE.length).replace(/^\//, "") || "po-entry"
    : "po-entry";
  const isDashboardRoute = pathRest === "dashboard";
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : "po-entry");

  useEffect(() => {
    const rest = location.pathname.startsWith(RM_BASE)
      ? location.pathname.slice(RM_BASE.length).replace(/^\//, "") || "po-entry"
      : "po-entry";
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname]);

  // Dashboard / Contact Log: R&M rows only.
  // PO Entry still receives the full module slice so save/approve merges stay correct; vertical is locked to R&M.
  const commercialPOsRmOnly = useMemo(
    () => commercialPOs.filter((p) => isRmCommercialPo(p)),
    [commercialPOs]
  );

  const tabs = [
    { id: "po-entry", label: "PO Entry", component: POEntry },
    { id: "contact-log", label: "Contact Log", component: ContactLog },
  ];

  const ActiveComponent = isDashboardRoute
    ? CommercialDashboardRmMmAmcIev
    : tabs.find((t) => t.id === activeTab)?.component || POEntry;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${RM_BASE}/${tabId}`);
  };

  const isPoEntry = ActiveComponent === POEntry;
  const posForUi = isPoEntry ? commercialPOs : commercialPOsRmOnly;

  return (
    <div className="min-h-screen bg-gray-50">
      {billingError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-sm text-amber-800">{billingError}</p>
          <button type="button" onClick={clearBillingError} className="text-amber-700 hover:text-amber-900 font-medium">
            Dismiss
          </button>
        </div>
      )}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">R&amp;M</h1>
          <p className="text-gray-600 mt-1">PO/WO management for R&amp;M contracts</p>
        </div>
        {!isDashboardRoute && (
          <div className="px-6 flex gap-2 border-t border-gray-100">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabChange(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1">
        <ActiveComponent
          onNavigateTab={handleTabChange}
          commercialPOs={posForUi}
          setCommercialPOs={setCommercialPOs}
          setInvoices={setInvoices}
          {...(isPoEntry ? { fixedVertical: "R&M" } : {})}
        />
      </div>
    </div>
  );
};

const CommercialRmMmAmcIev = () => (
  <BillingProvider commercialModuleScope={COMMERCIAL_MODULE_RM}>
    <CommercialInnerRm />
  </BillingProvider>
);

export default CommercialRmMmAmcIev;
