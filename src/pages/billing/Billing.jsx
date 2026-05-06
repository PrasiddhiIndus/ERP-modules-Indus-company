import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import BillingDashboard from './BillingDashboard';
import CreateInvoice from './CreateInvoice';
import AddOnInvoices from './AddOnInvoices';
import ManageInvoices from './ManageInvoices';
import GeneratedEInvoice from './GeneratedEInvoice';
import CreditNotes from './CreditNotes';
import BillingReports from './BillingReports';
import BillingTracking from './BillingTracking';
import BillingNotifications from './BillingNotifications';
import BillingFlowNav from './components/BillingFlowNav';

// Order matches left sidebar: Generated E-Invoice last (after Manage Invoices workflow)
const TAB_IDS = ['dashboard', 'create-invoice', 'add-on-invoices', 'manage-invoices', 'credit-notes', 'reports', 'tracking', 'notifications', 'generated-e-invoice'];

const getBillingPathTab = (pathname) => {
  const suffix = pathname.replace(/^\/app\/billing\/?/, '') || 'dashboard';
  const firstSegment = suffix.split('/')[0] || 'dashboard';
  return TAB_IDS.includes(firstSegment) ? firstSegment : 'dashboard';
};

/** Presentational only — `useBilling()` runs in BillingInner (inside BillingProvider) to avoid context edge cases. */
const BillingVerticalSelector = ({ billingVerticalFilter, setBillingVerticalFilter, billingVerticalOptions }) => (
  <div className="px-4 sm:px-6 pt-5">
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">Team-wise billing</p>
        <p className="text-xs text-gray-500">
          Select a vertical to load POs, invoices, reports and notifications. After selecting, use Create Invoice or Add-On Invoices to raise a{' '}
          <span className="font-medium text-gray-700">tax</span> or <span className="font-medium text-gray-700">proforma</span> document (Manpower, Training, R&amp;M, M&amp;M, AMC, IEV, projects/lump-sum/trucks, etc.).
        </p>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <select
          value={billingVerticalFilter || ''}
          onChange={(e) => setBillingVerticalFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-[220px]"
        >
          <option value="">Select vertical…</option>
          {(billingVerticalOptions || []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {billingVerticalFilter ? (
          <button
            type="button"
            onClick={() => setBillingVerticalFilter('')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            title="Clear vertical selection"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  </div>
);

class BillingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Keep it minimal; UI will show the error message.
    // eslint-disable-next-line no-console
    console.error('Billing tab crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 sm:p-6">
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6">
            <p className="text-sm font-semibold text-red-700">Billing screen crashed</p>
            <p className="text-xs text-gray-600 mt-1">Open browser console for full stack trace.</p>
            <pre className="mt-3 text-xs bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto whitespace-pre-wrap">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const BillingInner = () => {
  const { billingVerticalFilter, setBillingVerticalFilter, billingVerticalOptions } = useBilling();
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
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1920px] flex-1">
        <BillingVerticalSelector
          billingVerticalFilter={billingVerticalFilter}
          setBillingVerticalFilter={setBillingVerticalFilter}
          billingVerticalOptions={billingVerticalOptions}
        />
        <BillingFlowNav />
        <BillingErrorBoundary>
          <ActiveComponent onNavigateTab={handleTabChange} />
        </BillingErrorBoundary>
      </div>
    </div>
  );
};

const Billing = () => {
  return (
    <BillingProvider enableVerticalFilter>
      <BillingInner />
    </BillingProvider>
  );
};

export default Billing;
