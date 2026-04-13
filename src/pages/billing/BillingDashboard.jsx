import React, { useMemo } from 'react';
import {
  FileText,
  FileCheck,
  Receipt,
  FileDigit,
  BarChart3,
  Bell,
  LayoutDashboard,
  Wallet,
  Send,
  ChevronRight,
  FilePlus2,
  AlertTriangle,
  RefreshCw,
  Route,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

function isAfterContractEnd(endDate) {
  if (!endDate) return false;
  const end = new Date(String(endDate));
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return todayDay.getTime() > endDay.getTime();
}

function cnDnStatus(inv) {
  return inv.cnDnRequestStatus || inv.cn_dn_request_status || null;
}

const BillingDashboard = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, creditDebitNotes, paymentAdvice, billingError, clearBillingError, useBillingDb } =
    useBilling();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const taxInvoices = useMemo(() => (invoices || []).filter((inv) => !inv.isAddOn), [invoices]);
  const addOnInvoicesList = useMemo(() => (invoices || []).filter((inv) => !!inv.isAddOn), [invoices]);

  const invoicingTaxStats = useMemo(() => {
    const total = taxInvoices.length;
    const totalValue = taxInvoices.reduce((sum, inv) => sum + (inv.calculatedInvoiceAmount || inv.totalAmount || 0), 0);
    const byMonth = {};
    taxInvoices.forEach((inv) => {
      const date = inv.created_at || inv.createdAt || inv.invoiceDate;
      if (date && String(date).length >= 7) {
        byMonth[String(date).slice(0, 7)] = (byMonth[String(date).slice(0, 7)] || 0) + 1;
      }
    });
    return { total, totalValue, monthsWithActivity: Object.keys(byMonth).length };
  }, [taxInvoices]);

  const addOnStats = useMemo(() => {
    const total = addOnInvoicesList.length;
    const totalValue = addOnInvoicesList.reduce(
      (sum, inv) => sum + (inv.calculatedInvoiceAmount || inv.totalAmount || 0),
      0
    );
    return { total, totalValue };
  }, [addOnInvoicesList]);

  const poMonitorStats = useMemo(() => {
    const active = commercialPOs.filter((p) => p.status === 'active' && p.endDate && new Date(p.endDate) >= today);
    const nearingExpiry = active.filter((p) => {
      const end = new Date(p.endDate);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      return daysLeft <= 30 && daysLeft >= 0;
    });
    const pendingRenewal = commercialPOs.filter((p) => p.renewalPending);
    const postContractWindow = commercialPOs.filter(
      (p) =>
        !p.isSupplementary &&
        (p.supplementaryRequestStatus || p.supplementary_request_status) === 'approved' &&
        isAfterContractEnd(p.endDate || p.end_date)
    );
    return {
      activePOs: active.length,
      nearingExpiry: nearingExpiry.length,
      pendingRenewal: pendingRenewal.length,
      postContractBillingOCs: postContractWindow.length,
    };
  }, [commercialPOs, today]);

  const cnDnStats = useMemo(() => {
    const credit = (creditDebitNotes || []).filter((n) => n.type === 'credit').length;
    const debit = (creditDebitNotes || []).filter((n) => n.type === 'debit').length;
    const pendingApproval = (invoices || []).filter((inv) => cnDnStatus(inv) === 'pending').length;
    const approvedToIssue = (invoices || []).filter((inv) => cnDnStatus(inv) === 'approved').length;
    return { credit, debit, pendingApproval, approvedToIssue };
  }, [creditDebitNotes, invoices]);

  const complianceStats = useMemo(() => {
    const generated = (invoices || []).filter((inv) => inv.e_invoice_irn || inv.eInvoiceIrn).length;
    const pending = (invoices || []).length - generated;
    return { eInvoicesGenerated: generated, eInvoicesPending: Math.max(0, pending) };
  }, [invoices]);

  const leakageStats = useMemo(() => {
    const totalPenalties = Object.values(paymentAdvice || {}).reduce(
      (s, pa) => s + (Number(pa.penaltyDeductionAmount) || 0),
      0
    );
    const lessBilling = (invoices || []).filter((inv) => (inv.lessMoreBilling || 0) < 0).length;
    const moreBilling = (invoices || []).filter((inv) => (inv.lessMoreBilling || 0) > 0).length;
    return { totalPenalties, lessBilling, moreBilling };
  }, [invoices, paymentAdvice]);

  const notificationCount = useMemo(() => {
    return poMonitorStats.nearingExpiry + complianceStats.eInvoicesPending;
  }, [poMonitorStats.nearingExpiry, complianceStats.eInvoicesPending]);

  const hasAlerts =
    notificationCount > 0 ||
    poMonitorStats.pendingRenewal > 0 ||
    cnDnStats.pendingApproval > 0 ||
    cnDnStats.approvedToIssue > 0 ||
    poMonitorStats.postContractBillingOCs > 0;

  const cards = [
    {
      id: 'manage-invoices',
      title: 'Tax invoices',
      description: 'OC-linked bills (excl. add-ons)',
      icon: FileText,
      accent: 'blue',
      stats: [
        { label: 'Count', value: invoicingTaxStats.total },
        { label: 'Total value', value: `₹${(invoicingTaxStats.totalValue || 0).toLocaleString('en-IN')}` },
        { label: 'Months with activity', value: invoicingTaxStats.monthsWithActivity },
      ],
    },
    {
      id: 'add-on-invoices',
      title: 'Add-on invoices',
      description: 'Appraisal, gratuity, reimbursement…',
      icon: FilePlus2,
      accent: 'violet',
      stats: [
        { label: 'Count', value: addOnStats.total },
        { label: 'Total value', value: `₹${(addOnStats.totalValue || 0).toLocaleString('en-IN')}` },
      ],
    },
    {
      id: 'credit-notes',
      title: 'Credit / debit notes',
      description: 'Requests, approvals & issued notes',
      icon: Receipt,
      accent: 'amber',
      stats: [
        { label: 'Issued (CN / DN)', value: `${cnDnStats.credit} / ${cnDnStats.debit}` },
        { label: 'Pending approval', value: cnDnStats.pendingApproval },
        { label: 'Approved — to issue', value: cnDnStats.approvedToIssue },
      ],
    },
    {
      id: 'generated-e-invoice',
      title: 'E-Invoice (IRN)',
      description: 'GST e-invoice coverage',
      icon: FileDigit,
      accent: 'emerald',
      stats: [
        { label: 'With IRN', value: complianceStats.eInvoicesGenerated },
        { label: 'Without IRN', value: complianceStats.eInvoicesPending },
      ],
    },
    {
      id: 'create-invoice',
      title: 'PO billing health',
      description: 'From Commercial PO / WO data',
      icon: FileCheck,
      accent: 'slate',
      stats: [
        { label: 'Active POs', value: poMonitorStats.activePOs },
        { label: 'Expiring ≤30 days', value: poMonitorStats.nearingExpiry },
        { label: 'Renewal flagged', value: poMonitorStats.pendingRenewal },
        { label: 'Post-contract billing OC', value: poMonitorStats.postContractBillingOCs },
      ],
    },
    {
      id: 'reports',
      title: 'Variance & PA',
      description: 'Penalties & billing deltas',
      icon: Wallet,
      accent: 'rose',
      stats: [
        { label: 'PA penalties (₹)', value: `₹${(leakageStats.totalPenalties || 0).toLocaleString('en-IN')}` },
        { label: 'Less billing rows', value: leakageStats.lessBilling },
        { label: 'More billing rows', value: leakageStats.moreBilling },
      ],
    },
  ];

  const accentStyles = {
    blue: { border: 'border-l-4 border-l-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', hover: 'hover:border-blue-200 hover:bg-blue-50/30' },
    amber: { border: 'border-l-4 border-l-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', hover: 'hover:border-amber-200 hover:bg-amber-50/30' },
    violet: { border: 'border-l-4 border-l-violet-500', iconBg: 'bg-violet-50', iconColor: 'text-violet-600', hover: 'hover:border-violet-200 hover:bg-violet-50/30' },
    emerald: { border: 'border-l-4 border-l-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', hover: 'hover:border-emerald-200 hover:bg-emerald-50/30' },
    rose: { border: 'border-l-4 border-l-rose-500', iconBg: 'bg-rose-50', iconColor: 'text-rose-600', hover: 'hover:border-rose-200 hover:bg-rose-50/30' },
    slate: { border: 'border-l-4 border-l-slate-500', iconBg: 'bg-slate-50', iconColor: 'text-slate-600', hover: 'hover:border-slate-200 hover:bg-slate-50/30' },
  };

  const quickActions = [
    { id: 'create-invoice', label: 'Create Invoice', icon: FileText, border: 'border-blue-200', bg: 'bg-blue-50/50 hover:bg-blue-50', iconWrap: 'bg-blue-100 text-blue-600' },
    { id: 'add-on-invoices', label: 'Add-On Invoices', icon: FilePlus2, border: 'border-violet-200', bg: 'bg-violet-50/50 hover:bg-violet-50', iconWrap: 'bg-violet-100 text-violet-600' },
    { id: 'manage-invoices', label: 'Manage Invoices', icon: Send, border: 'border-slate-200', bg: 'bg-slate-50/50 hover:bg-slate-100', iconWrap: 'bg-slate-200 text-slate-600' },
    { id: 'credit-notes', label: 'Credit / Debit Notes', icon: Receipt, border: 'border-amber-200', bg: 'bg-amber-50/50 hover:bg-amber-50', iconWrap: 'bg-amber-100 text-amber-600' },
    { id: 'generated-e-invoice', label: 'Generated E-Invoice', icon: FileDigit, border: 'border-emerald-200', bg: 'bg-emerald-50/50 hover:bg-emerald-50', iconWrap: 'bg-emerald-100 text-emerald-600' },
    { id: 'reports', label: 'Reports', icon: BarChart3, border: 'border-indigo-200', bg: 'bg-indigo-50/50 hover:bg-indigo-50', iconWrap: 'bg-indigo-100 text-indigo-600' },
    { id: 'tracking', label: 'Tracking', icon: Route, border: 'border-cyan-200', bg: 'bg-cyan-50/50 hover:bg-cyan-50', iconWrap: 'bg-cyan-100 text-cyan-600' },
    { id: 'notifications', label: 'Notifications', icon: Bell, border: 'border-orange-200', bg: 'bg-orange-50/50 hover:bg-orange-50', iconWrap: 'bg-orange-100 text-orange-600', badge: notificationCount },
  ];

  return (
    <div className="w-full overflow-y-auto min-h-[80vh] px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
            <LayoutDashboard className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Tax & add-on invoices, post-contract billing, credit/debit notes, e-invoice IRN, PA and reports
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <p className="text-xs text-gray-400">
            Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-[11px] text-gray-400">
            Data: {useBillingDb ? 'database' : 'browser storage'}
          </p>
        </div>
      </div>

      {billingError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <span className="min-w-0 break-words">{billingError}</span>
          </div>
          <button
            type="button"
            onClick={() => clearBillingError?.()}
            className="shrink-0 text-xs font-medium text-red-800 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {hasAlerts && (
        <div className="mb-6 space-y-3">
          {(cnDnStats.pendingApproval > 0 || cnDnStats.approvedToIssue > 0) && (
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('credit-notes')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 transition-colors text-left"
            >
              <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700 shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">Credit / debit note workflow</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  {[
                    cnDnStats.pendingApproval > 0 && `${cnDnStats.pendingApproval} request(s) awaiting approval`,
                    cnDnStats.approvedToIssue > 0 && `${cnDnStats.approvedToIssue} approved — issue note`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-600 shrink-0" />
            </button>
          )}

          {poMonitorStats.postContractBillingOCs > 0 && (
            <div className="w-full flex items-center gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 text-left">
              <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-600 shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">Post-contract billing</h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  {poMonitorStats.postContractBillingOCs} OC(s) have approved post-contract billing (buffer period). Bill from{' '}
                  <strong>Create Invoice</strong>; renewals roll buffer invoices to the new PO in Commercial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab('create-invoice')}
                className="shrink-0 text-sm font-medium text-indigo-700 hover:underline"
              >
                Open Create Invoice
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('notifications')}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 transition-colors text-left"
          >
            <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-600 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                PO &amp; e-invoice alerts
                {notificationCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium bg-indigo-600 text-white">
                    {notificationCount}
                  </span>
                )}
              </h3>
              <p className="text-sm text-gray-600 mt-0.5">
                {[
                  poMonitorStats.nearingExpiry > 0 && `${poMonitorStats.nearingExpiry} PO(s) nearing expiry`,
                  complianceStats.eInvoicesPending > 0 && `${complianceStats.eInvoicesPending} invoice(s) without IRN`,
                  poMonitorStats.pendingRenewal > 0 && `${poMonitorStats.pendingRenewal} renewal(s) flagged`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Open notifications for details'}
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-indigo-500 shrink-0" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => {
          const Icon = card.icon;
          const style = accentStyles[card.accent];
          return (
            <button
              key={card.title}
              type="button"
              onClick={() => onNavigateTab && onNavigateTab(card.id)}
              className={`group bg-white rounded-xl border border-gray-200 ${style.border} ${style.hover} hover:shadow-md transition-all duration-200 p-5 text-left`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className={`p-2.5 rounded-lg ${style.iconBg} ${style.iconColor}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{card.title}</h3>
              <p className="text-xs text-gray-500 mb-3">{card.description}</p>
              <ul className="space-y-2.5">
                {card.stats.map((s, i) => (
                  <li key={i} className="flex justify-between items-baseline text-sm gap-2">
                    <span className="text-gray-500 truncate">{s.label}</span>
                    <span className="font-semibold text-gray-900 shrink-0 tabular-nums text-right">{s.value}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick actions</h2>
        <p className="text-xs text-gray-500 mb-3">
          Matches the Billing sidebar: create and manage invoices, add-ons, CN/DN, e-invoice queue, reports, tracking, alerts.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.id}
                type="button"
                onClick={() => onNavigateTab && onNavigateTab(qa.id)}
                className={`relative flex items-center gap-3 p-4 rounded-xl border ${qa.border} ${qa.bg} transition-colors text-left`}
              >
                <div className={`p-2 rounded-lg ${qa.iconWrap}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-gray-900 text-sm pr-6">{qa.label}</span>
                {qa.badge > 0 ? (
                  <span className="absolute top-3 right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium bg-orange-600 text-white">
                    {qa.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-8 pb-4">
        PO / WO master data is maintained in Commercial → PO Entry. Supplementary / post-contract billing is approved there
        before billing runs here.
      </p>
    </div>
  );
};

export default BillingDashboard;
