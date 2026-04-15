import React, { useMemo, useState } from 'react';
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
  FilePlus2,
  AlertTriangle,
  RefreshCw,
  Route,
  Sparkles,
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
  const { commercialPOs, invoices, creditDebitNotes, paymentAdvice, billingError, clearBillingError, refreshBilling } =
    useBilling();
  const [isRefreshing, setIsRefreshing] = useState(false);

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
      accent: 'red',
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
    red: { cardBg: 'from-red-50/80 to-white', iconBg: 'bg-red-100', iconColor: 'text-red-700', keyColor: 'text-red-700' },
    amber: { cardBg: 'from-amber-50/80 to-white', iconBg: 'bg-amber-100', iconColor: 'text-amber-700', keyColor: 'text-amber-700' },
    violet: { cardBg: 'from-violet-50/80 to-white', iconBg: 'bg-violet-100', iconColor: 'text-violet-700', keyColor: 'text-violet-700' },
    emerald: { cardBg: 'from-emerald-50/80 to-white', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-700', keyColor: 'text-emerald-700' },
    rose: { cardBg: 'from-rose-50/80 to-white', iconBg: 'bg-rose-100', iconColor: 'text-rose-700', keyColor: 'text-rose-700' },
    slate: { cardBg: 'from-slate-100/80 to-white', iconBg: 'bg-slate-200', iconColor: 'text-slate-700', keyColor: 'text-slate-700' },
  };

  const quickActions = [
    { id: 'create-invoice', label: 'Create Invoice', icon: FileText, border: 'border-red-200', bg: 'bg-red-50/50 hover:bg-red-50', iconWrap: 'bg-red-100 text-red-600' },
    { id: 'add-on-invoices', label: 'Add-On Invoices', icon: FilePlus2, border: 'border-violet-200', bg: 'bg-violet-50/50 hover:bg-violet-50', iconWrap: 'bg-violet-100 text-violet-600' },
    { id: 'manage-invoices', label: 'Manage Invoices', icon: Send, border: 'border-slate-200', bg: 'bg-slate-50/50 hover:bg-slate-100', iconWrap: 'bg-slate-200 text-slate-600' },
    { id: 'credit-notes', label: 'Credit / Debit Notes', icon: Receipt, border: 'border-amber-200', bg: 'bg-amber-50/50 hover:bg-amber-50', iconWrap: 'bg-amber-100 text-amber-600' },
    { id: 'generated-e-invoice', label: 'Generated E-Invoice', icon: FileDigit, border: 'border-emerald-200', bg: 'bg-emerald-50/50 hover:bg-emerald-50', iconWrap: 'bg-emerald-100 text-emerald-600' },
    { id: 'reports', label: 'Reports', icon: BarChart3, border: 'border-indigo-200', bg: 'bg-indigo-50/50 hover:bg-indigo-50', iconWrap: 'bg-indigo-100 text-indigo-600' },
    { id: 'tracking', label: 'Tracking', icon: Route, border: 'border-cyan-200', bg: 'bg-cyan-50/50 hover:bg-cyan-50', iconWrap: 'bg-cyan-100 text-cyan-600' },
    { id: 'notifications', label: 'Notifications', icon: Bell, border: 'border-orange-200', bg: 'bg-orange-50/50 hover:bg-orange-50', iconWrap: 'bg-orange-100 text-orange-600', badge: notificationCount },
  ];

  const handleRefreshDashboard = async () => {
    if (isRefreshing) return;
    try {
      setIsRefreshing(true);
      await refreshBilling?.();
    } catch (error) {
      console.warn('Billing dashboard refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="w-full overflow-y-auto min-h-[80vh] px-4 sm:px-6 py-6 bg-gradient-to-b from-slate-50/70 to-white">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-50 ring-1 ring-red-100 border border-red-100/80 shadow-sm">
              <LayoutDashboard className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing Dashboard</h1>
              <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">
                Tax & add-on invoices, post-contract billing, credit/debit notes, e-invoice IRN, PA and reports
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefreshDashboard}
            disabled={isRefreshing}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            title="Refresh billing dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-6 max-w-6xl mx-auto">
        {cards.map((card) => {
          const Icon = card.icon;
          const style = accentStyles[card.accent];
          const primaryStat = card.stats[0];
          const secondaryStats = card.stats.slice(1);
          return (
            <div
              key={card.title}
              className={`h-full rounded-xl border border-slate-200 bg-gradient-to-br ${style.cardBg} shadow-sm p-4 text-left transition-all hover:shadow-md`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`p-2.5 rounded-lg ${style.iconBg} ${style.iconColor} ring-1 ring-black/5 shrink-0`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-[14px] leading-5 truncate">{card.title}</h3>
                    <p className="text-[11px] leading-4 text-gray-500 line-clamp-2">{card.description}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-white/80 text-slate-600 border border-slate-200 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  KPI
                </span>
              </div>

              <div className="rounded-lg border border-white/70 bg-white/85 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{primaryStat.label}</p>
                <p className={`mt-1 text-xl leading-6 font-bold tabular-nums ${style.keyColor}`}>{primaryStat.value}</p>
              </div>

              {secondaryStats.length > 0 && (
                <div className="mt-3 border-t border-slate-200/80 pt-2.5 space-y-1.5">
                  {secondaryStats.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-600 truncate">{s.label}</span>
                      <span className="text-[12px] font-semibold text-slate-800 tabular-nums shrink-0">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto rounded-2xl border border-slate-200 bg-white/90 shadow-sm p-4 sm:p-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Quick actions</h2>
        <p className="text-xs text-gray-500 mb-4">Click any action to open the relevant billing page.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.id}
                type="button"
                onClick={() => onNavigateTab && onNavigateTab(qa.id)}
                className={`relative h-full min-h-[68px] flex items-center gap-3 p-3.5 rounded-xl border ${qa.border} ${qa.bg} transition-colors text-left`}
              >
                <div className={`p-2 rounded-lg ${qa.iconWrap}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-semibold text-gray-900 text-sm leading-5 pr-6">{qa.label}</span>
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
        <div className="max-w-6xl mx-auto mt-6 mb-6 space-y-3">
          {(cnDnStats.pendingApproval > 0 || cnDnStats.approvedToIssue > 0) && (
            <div className="w-full flex items-center gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50/60 text-left shadow-sm">
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
            </div>
          )}

          {poMonitorStats.postContractBillingOCs > 0 && (
            <div className="w-full flex items-center gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 text-left shadow-sm">
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

          <div className="w-full flex items-center gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 text-left shadow-sm">
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
          </div>
        </div>
      )}


      <p className="text-center text-xs text-gray-400 mt-8 pb-4">
        PO / WO master data is maintained in Commercial → PO Entry. Supplementary / post-contract billing is approved there
        before billing runs here.
      </p>
    </div>
  );
};

export default BillingDashboard;
