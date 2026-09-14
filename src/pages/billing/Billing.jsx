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
import BillingTracker from './BillingTracker';
import BillingPoNotificationBar from './components/BillingPoNotificationBar';
import BillingKeepAlivePanels from './components/BillingKeepAlivePanels';
import BillingScopeFilters from './components/BillingScopeFilters';

// Order matches left sidebar: Generated E-Invoice last (after Manage Invoices workflow)
const TAB_IDS = [
  'dashboard',
  'create-invoice',
  'add-on-invoices',
  'manage-invoices',
  'credit-notes',
  'reports',
  'tracking',
  'notifications',
  'generated-e-invoice',
  'tracker',
];

const getBillingPathTab = (pathname) => {
  const suffix = pathname.replace(/^\/app\/billing\/?/, '') || 'dashboard';
  const firstSegment = suffix.split('/')[0] || 'dashboard';
  return TAB_IDS.includes(firstSegment) ? firstSegment : 'dashboard';
};

/** Access gate only — scope filters live on Billing dashboard (and other tabs via BillingInner). */
const BillingVerticalSelector = ({ billingVerticalAccessBlocked }) => (
  billingVerticalAccessBlocked ? (
    <div className="px-4 sm:px-6 pt-4 pb-3">
      <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
        <p className="text-sm font-semibold text-amber-900">No billing business lines assigned</p>
        <p className="text-xs text-amber-800 mt-1">
          You have Billing access, but no business lines (Manpower, M&amp;M, R&amp;M, …) are assigned to your
          account. Ask an administrator to grant the right lines in User Management.
        </p>
      </div>
    </div>
  ) : null
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
            <p className="text-sm font-semibold text-red-700">Billing hit an error</p>
            <p className="text-xs text-gray-600 mt-1">Reload the page. If it keeps happening, tell IT and mention this message.</p>
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
  const {
    billingVerticalFilter,
    setBillingVerticalFilter,
    billingVerticalOptions,
    billingPoBasisFilter,
    setBillingPoBasisFilter,
    billingPoBasisOptions,
    billingVerticalAccessBlocked,
    refreshBilling,
  } = useBilling();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getBillingPathTab(location.pathname);
  const lockedToSingleVertical = (billingVerticalOptions || []).length === 1;

  useEffect(() => {
    if (activeTab === 'create-invoice' || activeTab === 'add-on-invoices') {
      void refreshBilling?.();
    }
  }, [activeTab, refreshBilling]);

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
    { id: 'tracker', component: BillingTracker },
  ];

  const handleTabChange = (tabId) => {
    if (tabId === 'dashboard') navigate('/app/billing');
    else if (tabId === 'tracking') navigate('/app/billing/tracking');
    else navigate(`/app/billing/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1920px] flex-1">
        <BillingVerticalSelector billingVerticalAccessBlocked={billingVerticalAccessBlocked} />
        {!billingVerticalAccessBlocked ? (
          <>
            {activeTab !== 'dashboard' && activeTab !== 'tracker' ? (
              <div className="px-4 sm:px-6 pt-4 pb-2">
                <BillingScopeFilters
                  billingVerticalFilter={billingVerticalFilter}
                  setBillingVerticalFilter={setBillingVerticalFilter}
                  billingVerticalOptions={billingVerticalOptions}
                  billingPoBasisFilter={billingPoBasisFilter}
                  setBillingPoBasisFilter={setBillingPoBasisFilter}
                  billingPoBasisOptions={billingPoBasisOptions}
                  lockedToSingleVertical={lockedToSingleVertical}
                />
              </div>
            ) : null}
            <BillingPoNotificationBar />
            <BillingErrorBoundary>
              <BillingKeepAlivePanels
                tabs={tabs}
                activeId={activeTab}
                panelProps={{ onNavigateTab: handleTabChange }}
                wrapPanel={(panel) => <BillingErrorBoundary>{panel}</BillingErrorBoundary>}
              />
            </BillingErrorBoundary>
          </>
        ) : null}
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
