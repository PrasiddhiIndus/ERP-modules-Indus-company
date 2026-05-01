import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import POEntry from '../sales/POEntry';
import ContactLog from './ContactLog';

const TAB_IDS = ['po-entry', 'contact-log'];

const CommercialInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { billingError, clearBillingError } = useBilling();
  const pathTab = location.pathname.replace(/^\/app\/commercial\/?/, '') || 'po-entry';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathTab) ? pathTab : 'po-entry');

  useEffect(() => {
    const pathTab = location.pathname.replace(/^\/app\/commercial\/?/, '') || 'po-entry';
    if (TAB_IDS.includes(pathTab)) setActiveTab(pathTab);
  }, [location.pathname]);

  const tabs = [
    { id: 'po-entry', label: 'PO Entry', component: POEntry },
    { id: 'contact-log', label: 'Contact Log', component: ContactLog },
  ];

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || POEntry;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'po-entry') navigate('/app/commercial');
    else navigate(`/app/commercial/${tabId}`);
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
          <h1 className="text-2xl font-bold text-gray-900">Commercial</h1>
          <p className="text-gray-600 mt-1">PO/WO Management – Contract details (master source for Billing)</p>
        </div>
        <div className="px-6 flex gap-2 border-t border-gray-100">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <ActiveComponent onNavigateTab={handleTabChange} />
      </div>
    </div>
  );
};

const Commercial = () => (
  <BillingProvider>
    <CommercialInner />
  </BillingProvider>
);

export default Commercial;
