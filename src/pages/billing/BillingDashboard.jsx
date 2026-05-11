import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  FileText,
  FileCheck,
  Receipt,
  FileDigit,
  Bell,
  LayoutDashboard,
  Wallet,
  FilePlus2,
  AlertTriangle,
  RefreshCw,
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

function formatDateInputValue(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getAllDashboardDateRange() {
  return { from: '', to: '' };
}

function getThisMonthDateRange() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    from: formatDateInputValue(monthStart),
    to: formatDateInputValue(today),
  };
}

function isDashboardRangeActive(range) {
  return !!(range?.from || range?.to);
}

function startOfDay(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function getInvoiceDate(inv) {
  return inv?.invoiceDate || inv?.invoice_date || inv?.created_at || inv?.createdAt || '';
}

function getNoteDate(note) {
  return note?.created_at || note?.createdAt || note?.noteDate || '';
}

function isDateInRange(rawDate, range) {
  if (!isDashboardRangeActive(range)) return true;
  const d = startOfDay(rawDate);
  const from = startOfDay(range?.from);
  const to = startOfDay(range?.to);
  if (!d) return false;
  if (from && !to) return d >= from;
  if (!from && to) return d <= to;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  return d >= start && d <= end;
}

function poOverlapsRange(po, range) {
  if (!isDashboardRangeActive(range)) return true;
  const rangeFrom = startOfDay(range?.from);
  const rangeTo = startOfDay(range?.to);
  const poStart = startOfDay(po.startDate || po.start_date || po.created_at || po.createdAt);
  const poEnd = startOfDay(po.endDate || po.end_date || poStart);
  if (!poStart && !poEnd) return false;
  const start = poStart || poEnd;
  const end = poEnd || poStart;
  if (rangeFrom && !rangeTo) return end >= rangeFrom;
  if (!rangeFrom && rangeTo) return start <= rangeTo;
  const rangeStart = rangeFrom <= rangeTo ? rangeFrom : rangeTo;
  const rangeEnd = rangeFrom <= rangeTo ? rangeTo : rangeFrom;
  return start <= rangeEnd && end >= rangeStart;
}

function formatRangeLabel(range) {
  const from = startOfDay(range?.from);
  const to = startOfDay(range?.to);
  if (!from && !to) return 'All dates';
  if (from && !to) return `From ${from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  if (!from && to) return `Until ${to.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  return `${from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} - ${to.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

const BillingDashboard = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, creditDebitNotes, paymentAdvice, billingError, clearBillingError, refreshBilling, billingVerticalFilter } =
    useBilling();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState(getAllDashboardDateRange);

  const verticalNotSelected = !billingVerticalFilter;

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const invoicesInRange = useMemo(
    () => (invoices || []).filter((inv) => isDateInRange(getInvoiceDate(inv), dateRange)),
    [invoices, dateRange]
  );

  const creditDebitNotesInRange = useMemo(
    () => (creditDebitNotes || []).filter((note) => isDateInRange(getNoteDate(note), dateRange)),
    [creditDebitNotes, dateRange]
  );

  const commercialPOsInRange = useMemo(
    () => (commercialPOs || []).filter((po) => poOverlapsRange(po, dateRange)),
    [commercialPOs, dateRange]
  );

  const paymentAdviceInRange = useMemo(() => {
    const invoiceById = new Map((invoices || []).map((inv) => [String(inv.id), inv]));
    return Object.fromEntries(
      Object.entries(paymentAdvice || {}).filter(([invoiceId, pa]) => {
        const inv = invoiceById.get(String(invoiceId));
        return isDateInRange(pa?.paReceivedDate, dateRange) || isDateInRange(getInvoiceDate(inv), dateRange);
      })
    );
  }, [invoices, paymentAdvice, dateRange]);

  const taxInvoices = useMemo(() => invoicesInRange.filter((inv) => !inv.isAddOn), [invoicesInRange]);
  const addOnInvoicesList = useMemo(() => invoicesInRange.filter((inv) => !!inv.isAddOn), [invoicesInRange]);

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
    const active = commercialPOsInRange.filter((p) => p.status === 'active' && p.endDate && new Date(p.endDate) >= today);
    const nearingExpiry = active.filter((p) => {
      const end = new Date(p.endDate);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
      return daysLeft <= 30 && daysLeft >= 0;
    });
    const pendingRenewal = commercialPOsInRange.filter((p) => p.renewalPending);
    const postContractWindow = commercialPOsInRange.filter(
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
  }, [commercialPOsInRange, today]);

  const cnDnStats = useMemo(() => {
    const credit = creditDebitNotesInRange.filter((n) => n.type === 'credit').length;
    const debit = creditDebitNotesInRange.filter((n) => n.type === 'debit').length;
    const pendingApproval = invoicesInRange.filter((inv) => cnDnStatus(inv) === 'pending').length;
    const approvedToIssue = invoicesInRange.filter((inv) => cnDnStatus(inv) === 'approved').length;
    return { credit, debit, pendingApproval, approvedToIssue };
  }, [creditDebitNotesInRange, invoicesInRange]);

  const complianceStats = useMemo(() => {
    const generated = invoicesInRange.filter((inv) => inv.e_invoice_irn || inv.eInvoiceIrn).length;
    const pending = invoicesInRange.length - generated;
    return { eInvoicesGenerated: generated, eInvoicesPending: Math.max(0, pending) };
  }, [invoicesInRange]);

  const leakageStats = useMemo(() => {
    const totalPenalties = Object.values(paymentAdviceInRange || {}).reduce(
      (s, pa) => s + (Number(pa.penaltyDeductionAmount) || 0),
      0
    );
    const lessBilling = invoicesInRange.filter((inv) => (inv.lessMoreBilling || 0) < 0).length;
    const moreBilling = invoicesInRange.filter((inv) => (inv.lessMoreBilling || 0) > 0).length;
    return { totalPenalties, lessBilling, moreBilling };
  }, [invoicesInRange, paymentAdviceInRange]);

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

  const handleDateRangeChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="w-full overflow-y-auto min-h-[80vh] px-4 sm:px-6 py-6 bg-gradient-to-b from-slate-50/70 to-white">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600 mb-6">
          <p className="text-lg font-semibold text-gray-900">Select a vertical to open Billing</p>
          <p className="text-sm mt-1 max-w-lg mx-auto">
            Choose a vertical above to load POs and invoices. Flow:{' '}
            <strong>Commercial → PO Entry</strong> → select the same vertical here →{' '}
            <strong>Create Invoice</strong> → <strong>Manage Invoices</strong> (PDF / IRN).
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
            <Link
              to="/app/commercial/manpower-training/po-entry"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-red-700 hover:bg-slate-50"
            >
              Manpower / Training PO Entry
            </Link>
            <Link
              to="/app/commercial/rm-mm-amc-iev/po-entry"
              className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-red-700 hover:bg-slate-50"
            >
              R&amp;M · M&amp;M · AMC · IEV PO Entry
            </Link>
          </div>
        </div>
      ) : null}

      {!verticalNotSelected ? (
        <div className="mb-6 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50/90 to-white shadow-sm p-4 sm:p-5">
          <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-3">Billing workflow</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                1
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Commercial PO / WO</p>
                <p className="text-xs text-gray-600 mt-0.5">Send for approval → approved</p>
                <div className="mt-2 flex flex-col gap-1">
                  <Link to="/app/commercial/manpower-training/po-entry" className="text-xs font-medium text-red-700 hover:underline truncate">
                    PO Entry (Manpower / Training) →
                  </Link>
                  <Link to="/app/commercial/rm-mm-amc-iev/po-entry" className="text-xs font-medium text-red-700 hover:underline truncate">
                    PO Entry (R&amp;M · M&amp;M · AMC · IEV) →
                  </Link>
                </div>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                2
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Same vertical</p>
                <p className="text-xs text-gray-600 mt-0.5">Use the team-wise dropdown above so POs match this OC line.</p>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                3
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Create invoice</p>
                <p className="text-xs text-gray-600 mt-0.5">Tax or proforma from approved PO rows.</p>
                <button
                  type="button"
                  onClick={() => onNavigateTab && onNavigateTab('create-invoice')}
                  className="mt-2 text-xs font-semibold text-red-700 hover:underline"
                >
                  Open Create Invoice →
                </button>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                4
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Manage &amp; comply</p>
                <p className="text-xs text-gray-600 mt-0.5">PDF, PA, e-invoice IRN, CN/DN.</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('manage-invoices')}
                    className="text-xs font-semibold text-red-700 hover:underline"
                  >
                    Manage Invoices →
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('generated-e-invoice')}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    E-Invoice list →
                  </button>
                </div>
              </div>
            </li>
          </ol>
        </div>
      ) : null}

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

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsRangeOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                title="Select dashboard date range"
              >
                <CalendarDays className="w-4 h-4 text-red-600" />
                <span className="hidden sm:inline">{formatRangeLabel(dateRange)}</span>
              </button>
              {isRangeOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-semibold text-gray-900">Dashboard Date Range</p>
                  </div>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-600">From</span>
                      <input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => handleDateRangeChange('from', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-600">To</span>
                      <input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => handleDateRangeChange('to', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDateRange(getAllDashboardDateRange())}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      All dates
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateRange(getThisMonthDateRange())}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      This month
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRangeOpen(false)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleRefreshDashboard}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              title="Refresh billing dashboard"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
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
