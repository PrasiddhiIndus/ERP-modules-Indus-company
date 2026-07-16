import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import { COMMERCIAL_MODULE_MANPOWER_TRAINING } from '../../constants/commercialModuleType';
import CommercialMtDashboard from '../manpowerProject/CommercialMtDashboard';
import POEntry from './POEntry';
import ContactLog from './ContactLog';

const TAB_IDS = ['po-entry', 'contact-log'];

/** Commercial PO + Contact sub-routes for Manpower / Training commercial line. */
const COMMERCIAL_MT_BASE = '/app/commercial/manpower-training';

const CommercialInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { billingError, clearBillingError } = useBilling();
  const pathRest = location.pathname.startsWith(COMMERCIAL_MT_BASE)
    ? location.pathname.slice(COMMERCIAL_MT_BASE.length).replace(/^\//, '') || 'po-entry'
    : 'po-entry';
  const isDashboardRoute = pathRest === 'dashboard';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathRest) ? pathRest : 'po-entry');

  useEffect(() => {
    const rest = location.pathname.startsWith(COMMERCIAL_MT_BASE)
      ? location.pathname.slice(COMMERCIAL_MT_BASE.length).replace(/^\//, '') || 'po-entry'
      : 'po-entry';
    if (TAB_IDS.includes(rest)) setActiveTab(rest);
  }, [location.pathname]);

  const tabs = [
    { id: 'po-entry', label: 'PO Entry', component: POEntry },
    { id: 'contact-log', label: 'Contact Log', component: ContactLog },
  ];

  const ActiveComponent = isDashboardRoute
    ? CommercialMtDashboard
    : tabs.find((t) => t.id === activeTab)?.component || POEntry;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    navigate(`${COMMERCIAL_MT_BASE}/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {billingError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-sm text-amber-800">{billingError}</p>
          <button type="button" onClick={clearBillingError} className="text-amber-700 hover:text-amber-900 font-medium">Dismiss</button>
        </div>
      )}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Commercial — Manpower / Training</h1>
          <p className="text-gray-600 mt-1">
            {isDashboardRoute
              ? 'Overview of enquiries, PO/WO status, and commercial actions'
              : 'PO/WO Management – Contract details (master source for Billing)'}
          </p>
        </div>
        {!isDashboardRoute && (
          <div className="px-6 flex gap-2 border-t border-gray-100">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabChange(t.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.id
                    ? 'border-purple-600 text-purple-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1">
        <ActiveComponent onNavigateTab={handleTabChange} />
      </div>
    </div>
  );
};

const Commercial = () => (
  <BillingProvider commercialModuleScope={COMMERCIAL_MODULE_MANPOWER_TRAINING}>
    <CommercialInner />
  </BillingProvider>
);

export default Commercial;
