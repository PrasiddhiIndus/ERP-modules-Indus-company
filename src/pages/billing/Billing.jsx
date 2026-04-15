import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider } from '../../contexts/BillingContext';
import BillingDashboard from './BillingDashboard';
import CreateInvoice from './CreateInvoice';
import AddOnInvoices from './AddOnInvoices';
import ManageInvoices from './ManageInvoices';
import GeneratedEInvoice from './GeneratedEInvoice';
import CreditNotes from './CreditNotes';
import BillingReports from './BillingReports';
import BillingTracking from './BillingTracking';
import BillingNotifications from './BillingNotifications';

// Order matches left sidebar: Generated E-Invoice last (after Manage Invoices workflow)
const TAB_IDS = ['dashboard', 'create-invoice', 'add-on-invoices', 'manage-invoices', 'credit-notes', 'reports', 'tracking', 'notifications', 'generated-e-invoice'];

const getBillingPathTab = (pathname) => {
  const suffix = pathname.replace(/^\/app\/billing\/?/, '') || 'dashboard';
  const firstSegment = suffix.split('/')[0] || 'dashboard';
  return TAB_IDS.includes(firstSegment) ? firstSegment : 'dashboard';
};

const Billing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getBillingPathTab(location.pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const appShell = document.querySelector('main.erp-app-shell');
    if (appShell) {
      appShell.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [location.pathname]);

  const tabs = [
    { id: 'dashboard', component: BillingDashboard },
    { id: 'create-invoice', component: CreateInvoice },
    { id: 'add-on-invoices', component: AddOnInvoices },
    { id: 'manage-invoices', component: ManageInvoices },
    { id: 'credit-notes', component: CreditNotes },
    { id: 'reports', component: BillingReports },
    { id: 'tracking', component: BillingTracking },
    { id: 'notifications', component: BillingNotifications },
    { id: 'generated-e-invoice', component: GeneratedEInvoice },
  ];

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || BillingDashboard;

  const handleTabChange = (tabId) => {
    if (tabId === 'dashboard') navigate('/app/billing');
    else if (tabId === 'tracking') navigate('/app/billing/tracking');
    else navigate(`/app/billing/${tabId}`);
  };

  return (
    <BillingProvider>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto w-full max-w-[1920px] flex-1">
          <ActiveComponent onNavigateTab={handleTabChange} />
        </div>
      </div>
    </BillingProvider>
  );
};

export default Billing;
