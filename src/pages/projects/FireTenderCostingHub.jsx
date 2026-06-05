import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import FireTender from "./FireTender";
import CostingList from "./CostingList";
import QuotationList from "./QuotationList";
import FireTenderNavbar from "./FireTenderNavbar";
import { FIRE_TENDER_COSTING_HUB_BASE } from "./fireTenderRoutes";

const TAB_IDS = ["tender", "costing", "quotation"];

function resolveHubTab(pathname) {
  if (!pathname.startsWith(FIRE_TENDER_COSTING_HUB_BASE)) return "tender";
  const rest = pathname.slice(FIRE_TENDER_COSTING_HUB_BASE.length).replace(/^\//, "");
  return TAB_IDS.includes(rest) ? rest : "tender";
}

export default function FireTenderCostingHub() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => resolveHubTab(location.pathname));

  useEffect(() => {
    setActiveTab(resolveHubTab(location.pathname));
  }, [location.pathname]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${FIRE_TENDER_COSTING_HUB_BASE}/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
        <FireTenderNavbar activeWorkflowTab={activeTab} onWorkflowTabChange={handleTabChange} />

        <div className="erp-hub-tab-panel">
          {activeTab === "tender" && <FireTender embeddedInHub />}
          {activeTab === "costing" && <CostingList embeddedInHub />}
          {activeTab === "quotation" && <QuotationList embeddedInHub />}
        </div>
      </div>
    </div>
  );
}
