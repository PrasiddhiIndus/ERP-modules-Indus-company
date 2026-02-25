import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider } from '../../contexts/BillingContext';
import BillingDashboard from './BillingDashboard';
import WOPOManagement from './WOPOManagement';
import CreateInvoice from './CreateInvoice';
import CreditNotes from './CreditNotes';
import EInvoice from './EInvoice';
import BillingReports from './BillingReports';
import BillingNotifications from './BillingNotifications';

const TAB_IDS = ['dashboard', 'wopo', 'create-invoice', 'credit-notes', 'e-invoice', 'reports', 'notifications'];

const Billing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = location.pathname.replace(/^\/app\/billing\/?/, '') || 'dashboard';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathTab) ? pathTab : 'dashboard');

  useEffect(() => {
    const pathTab = location.pathname.replace(/^\/app\/billing\/?/, '') || 'dashboard';
    if (TAB_IDS.includes(pathTab)) setActiveTab(pathTab);
  }, [location.pathname]);

  const tabs = [
    { id: 'dashboard', component: BillingDashboard },
    { id: 'wopo', component: WOPOManagement },
    { id: 'create-invoice', component: CreateInvoice },
    { id: 'credit-notes', component: CreditNotes },
    { id: 'e-invoice', component: EInvoice },
    { id: 'reports', component: BillingReports },
    { id: 'notifications', component: BillingNotifications },
  ];

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || BillingDashboard;

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'dashboard') navigate('/app/billing');
    else navigate(`/app/billing/${tabId}`);
  };

  return (
    <BillingProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
                <p className="text-gray-600 mt-1">Invoices, WO/PO, credit notes & e-invoicing</p>
              </div>
              <div className="text-sm text-gray-500">
                Last updated: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <ActiveComponent onNavigateTab={handleTabChange} />
        </div>
      </div>
    </BillingProvider>
  );
};

export default Billing;
