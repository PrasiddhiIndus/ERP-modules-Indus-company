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
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const BillingDashboard = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, creditDebitNotes, paymentAdvice } = useBilling();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const invoicingStats = useMemo(() => {
    const total = invoices.length;
    const totalValue = invoices.reduce((sum, inv) => sum + (inv.calculatedInvoiceAmount || inv.totalAmount || 0), 0);
    const byMonth = {};
    const byYear = {};
    invoices.forEach((inv) => {
      const date = inv.created_at || inv.createdAt;
      if (date) {
        const [y] = date.slice(0, 4).split('-');
        byMonth[date.slice(0, 7)] = (byMonth[date.slice(0, 7)] || 0) + 1;
        byYear[y] = (byYear[y] || 0) + 1;
      }
    });
    return { total, totalValue, monthWiseCount: Object.keys(byMonth).length, monthCounts: byMonth, yearCounts: byYear };
  }, [invoices]);

  const poMonitorStats = useMemo(() => {
    const active = commercialPOs.filter((p) => p.status === 'active' && p.endDate && new Date(p.endDate) >= today);
    const nearingExpiry = active.filter((p) => {
      const end = new Date(p.endDate);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      return daysLeft <= 30 && daysLeft >= 0;
    });
    const pendingRenewal = commercialPOs.filter((p) => p.renewalPending);
    return { activePOs: active.length, nearingExpiry: nearingExpiry.length, pendingRenewal: pendingRenewal.length };
  }, [commercialPOs, today]);

  const adjustmentsStats = useMemo(() => {
    const credit = creditDebitNotes.filter((n) => n.type === 'credit').length;
    const debit = creditDebitNotes.filter((n) => n.type === 'debit').length;
    return { totalCreditNotes: credit, totalDebitNotes: debit };
  }, [creditDebitNotes]);

  const complianceStats = useMemo(() => {
    const generated = invoices.filter((inv) => inv.e_invoice_irn || inv.eInvoiceIrn).length;
    const pending = invoices.length - generated;
    return { eInvoicesGenerated: generated, eInvoicesPending: pending };
  }, [invoices]);

  const leakageStats = useMemo(() => {
    const totalPenalties = Object.values(paymentAdvice).reduce((s, pa) => s + (Number(pa.penaltyDeductionAmount) || 0), 0);
    const lessBilling = invoices.filter((inv) => (inv.lessMoreBilling || 0) < 0).length;
    const moreBilling = invoices.filter((inv) => (inv.lessMoreBilling || 0) > 0).length;
    return { totalPenalties, lessBilling, moreBilling };
  }, [invoices, paymentAdvice]);

  const notificationCount = useMemo(() => {
    return poMonitorStats.nearingExpiry + complianceStats.eInvoicesPending;
  }, [poMonitorStats.nearingExpiry, complianceStats.eInvoicesPending]);

  const hasAlerts = notificationCount > 0 || poMonitorStats.pendingRenewal > 0;

  const cards = [
    {
      id: 'create-invoice',
      title: 'Invoicing',
      description: 'Invoices generated & value',
      icon: FileText,
      accent: 'blue',
      stats: [
        { label: 'Total Invoices', value: invoicingStats.total },
        { label: 'Total Value', value: `₹${(invoicingStats.totalValue || 0).toLocaleString('en-IN')}` },
        { label: 'Months with invoices', value: Object.keys(invoicingStats.monthCounts || {}).length },
      ],
    },
    {
      id: 'create-invoice',
      title: 'PO Monitor',
      description: 'Active POs & expiry',
      icon: FileCheck,
      accent: 'amber',
      stats: [
        { label: 'Active POs', value: poMonitorStats.activePOs },
        { label: 'Nearing expiry (30 days)', value: poMonitorStats.nearingExpiry },
        { label: 'Pending renewal', value: poMonitorStats.pendingRenewal },
      ],
    },
    {
      id: 'credit-notes',
      title: 'Adjustments',
      description: 'Credit & debit notes',
      icon: Receipt,
      accent: 'violet',
      stats: [
        { label: 'Credit Notes', value: adjustmentsStats.totalCreditNotes },
        { label: 'Debit Notes', value: adjustmentsStats.totalDebitNotes },
      ],
    },
    {
      id: 'manage-invoices',
      title: 'Compliance',
      description: 'E-Invoice status',
      icon: FileDigit,
      accent: 'emerald',
      stats: [
        { label: 'E-Invoices generated', value: complianceStats.eInvoicesGenerated },
        { label: 'E-Invoices pending', value: complianceStats.eInvoicesPending },
      ],
    },
    {
      id: 'reports',
      title: 'Financial Leakage',
      description: 'Penalties & billing variance',
      icon: Wallet,
      accent: 'rose',
      stats: [
        { label: 'Total penalties', value: `₹${(leakageStats.totalPenalties || 0).toLocaleString('en-IN')}` },
        { label: 'Less billing', value: leakageStats.lessBilling },
        { label: 'More billing', value: leakageStats.moreBilling },
      ],
    },
  ];

  const accentStyles = {
    blue: { border: 'border-l-4 border-l-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', hover: 'hover:border-blue-200 hover:bg-blue-50/30' },
    amber: { border: 'border-l-4 border-l-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', hover: 'hover:border-amber-200 hover:bg-amber-50/30' },
    violet: { border: 'border-l-4 border-l-violet-500', iconBg: 'bg-violet-50', iconColor: 'text-violet-600', hover: 'hover:border-violet-200 hover:bg-violet-50/30' },
    emerald: { border: 'border-l-4 border-l-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', hover: 'hover:border-emerald-200 hover:bg-emerald-50/30' },
    rose: { border: 'border-l-4 border-l-rose-500', iconBg: 'bg-rose-50', iconColor: 'text-rose-600', hover: 'hover:border-rose-200 hover:bg-rose-50/30' },
  };

  return (
    <div className="w-full overflow-y-auto min-h-[80vh] px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
            <LayoutDashboard className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">Overview of invoicing, POs, compliance and leakage</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Last updated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

      {/* Notifications strip */}
      {hasAlerts && (
        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab('notifications')}
          className="w-full mb-6 flex items-center gap-4 p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 transition-colors text-left"
        >
          <div className="p-2.5 rounded-lg bg-indigo-100 text-indigo-600 shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              Notifications & Alerts
              {notificationCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium bg-indigo-600 text-white">
                  {notificationCount}
                </span>
              )}
            </h3>
            <p className="text-sm text-gray-600 mt-0.5">
              {[
                poMonitorStats.nearingExpiry > 0 && `${poMonitorStats.nearingExpiry} PO(s) nearing expiry`,
                complianceStats.eInvoicesPending > 0 && `${complianceStats.eInvoicesPending} E-Invoice(s) pending`,
                poMonitorStats.pendingRenewal > 0 && `${poMonitorStats.pendingRenewal} renewal(s) pending`,
              ].filter(Boolean).join(' · ') || 'View all notifications'}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-indigo-500 shrink-0" />
        </button>
      )}

      {/* Stat cards with accent colors */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
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
                    <span className="font-semibold text-gray-900 shrink-0 tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Quick actions with soft colors */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('create-invoice')}
            className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <span className="font-semibold text-gray-900">Create Invoice</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('manage-invoices')}
            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-slate-200 text-slate-600">
              <Send className="w-5 h-5" />
            </div>
            <span className="font-semibold text-gray-900">Manage Invoices</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('reports')}
            className="flex items-center gap-3 p-4 rounded-xl border border-violet-200 bg-violet-50/50 hover:bg-violet-50 transition-colors text-left"
          >
            <div className="p-2 rounded-lg bg-violet-100 text-violet-600">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="font-semibold text-gray-900">Reports</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('notifications')}
            className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors text-left relative"
          >
            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
              <Bell className="w-5 h-5" />
            </div>
            <span className="font-semibold text-gray-900">Notifications</span>
            {notificationCount > 0 && (
              <span className="absolute top-3 right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium bg-amber-600 text-white">
                {notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-8 pb-4">
        Click any card or quick action to go to that section.
      </p>
    </div>
  );
};

export default BillingDashboard;
