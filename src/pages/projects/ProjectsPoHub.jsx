import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import { COMMERCIAL_MODULE_PROJECTS } from '../../constants/commercialModuleType';
import { PROJECTS_PO_APPROVER_MODULE_KEYS } from '../../config/roles';
import POEntry from '../commercial-rm-mm-amc-iev/POEntry';
import ContactLog from '../commercial-rm-mm-amc-iev/ContactLog';

const TAB_IDS = ['po-entry', 'contact-log'];
const PROJECTS_BASE = '/app/projects/po';

const ProjectsPoInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { billingError, clearBillingError, commercialPOs, setCommercialPOs, setInvoices } = useBilling();
  const pathRest = location.pathname.startsWith(PROJECTS_BASE)
    ? location.pathname.slice(PROJECTS_BASE.length).replace(/^\//, '') || 'po-entry'
    : 'po-entry';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : 'po-entry');

  useEffect(() => {
    const rest = location.pathname.startsWith(PROJECTS_BASE)
      ? location.pathname.slice(PROJECTS_BASE.length).replace(/^\//, '') || 'po-entry'
      : 'po-entry';
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname]);

  const tabs = [
    { id: 'po-entry', label: 'PO Entry', component: POEntry },
    { id: 'contact-log', label: 'Contact Log', component: ContactLog },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || POEntry;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${PROJECTS_BASE}/${tabId}`);
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Projects — PO / WO</h1>
          <p className="text-gray-600 mt-1">
            Contract master is the same database table as Commercial PO Entry (billing.po_wo). Vertical is always Projects.
          </p>
        </div>
        <div className="px-6 flex gap-2 border-t border-gray-100">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <ActiveComponent
          onNavigateTab={handleTabChange}
          commercialPOs={commercialPOs}
          setCommercialPOs={setCommercialPOs}
          setInvoices={setInvoices}
          fixedVertical="Projects"
          moduleType={COMMERCIAL_MODULE_PROJECTS}
          approverModuleKeys={PROJECTS_PO_APPROVER_MODULE_KEYS}
        />
      </div>
    </div>
  );
};

const ProjectsPoHub = () => (
  <BillingProvider commercialModuleScope={COMMERCIAL_MODULE_PROJECTS}>
    <ProjectsPoInner />
  </BillingProvider>
);

export default ProjectsPoHub;
