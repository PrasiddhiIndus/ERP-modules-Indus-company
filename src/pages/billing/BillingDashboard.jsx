import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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
  Filter,
  TrendingUp,
  Clock,
  Target,
  CircleDollarSign,
  Users,
  Percent,
  ChevronDown,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { rollupMainPoBilling, resolveContractForBillingParentPo } from '../../utils/billingInvoiceRollup';

const APPROVAL_SENT = 'sent_for_approval';
const APPROVAL_APPROVED = 'approved';

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

function getLastMonthDateRange() {
  const today = new Date();
  const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthEnd = new Date(firstThisMonth);
  lastMonthEnd.setDate(0);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
  return {
    from: formatDateInputValue(lastMonthStart),
    to: formatDateInputValue(lastMonthEnd),
  };
}

function getLast30DaysDateRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  return {
    from: formatDateInputValue(start),
    to: formatDateInputValue(today),
  };
}

/** India FY Apr–Mar, from April 1 of start year to today. */
function getThisFinancialYearDateRange() {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const fyStartYear = m >= 3 ? y : y - 1;
  const from = new Date(fyStartYear, 3, 1);
  return {
    from: formatDateInputValue(from),
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
  return `${from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${to.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function formatINR(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function getInvoiceKind(inv) {
  return String(inv.invoiceKind || inv.invoice_kind || 'tax').toLowerCase();
}

const DATE_PRESETS = [
  { id: 'all', label: 'All time', getRange: () => getAllDashboardDateRange() },
  { id: 'this_month', label: 'This month', getRange: getThisMonthDateRange },
  { id: 'last_month', label: 'Last month', getRange: getLastMonthDateRange },
  { id: 'last_30', label: 'Last 30 days', getRange: getLast30DaysDateRange },
  { id: 'this_fy', label: 'This financial year', getRange: getThisFinancialYearDateRange },
];

const BillingDashboard = ({ onNavigateTab }) => {
  const {
    commercialPOs,
    commercialPOsAllModules,
    invoices,
    invoicesAll,
    creditDebitNotes,
    paymentAdvice,
    billingError,
    clearBillingError,
    refreshBilling,
    billingVerticalFilter,
    billingPoBasisFilter,
    billingVerticalOptions,
  } = useBilling();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState(getAllDashboardDateRange);
  const [datePresetId, setDatePresetId] = useState('all');
  const [invoiceKindFilter, setInvoiceKindFilter] = useState('all');
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);
  const filterDropdownRef = useRef(null);

  const verticalNotSelected = !billingVerticalFilter;
  const billingPoBasisLabel =
    billingPoBasisFilter === 'with_po'
      ? 'With PO only'
      : billingPoBasisFilter === 'without_po'
        ? 'Without PO only'
        : 'All — With PO & Without PO';

  const verticalLabel = useMemo(() => {
    const o = (billingVerticalOptions || []).find((x) => x.id === billingVerticalFilter);
    return o?.label || billingVerticalFilter || '';
  }, [billingVerticalOptions, billingVerticalFilter]);

  const invoiceSource = invoicesAll?.length ? invoicesAll : invoices;
  const poSourceFull = commercialPOsAllModules?.length ? commercialPOsAllModules : commercialPOs;

  useEffect(() => {
    const onDocClick = (e) => {
      if (!filterDropdownRef.current || filterDropdownRef.current.contains(e.target)) return;
      setIsRangeOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const applyDatePreset = useCallback((presetId) => {
    const preset = DATE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDatePresetId(presetId);
    setDateRange(preset.getRange());
  }, []);

  const invoicesInRange = useMemo(
    () => (invoices || []).filter((inv) => isDateInRange(getInvoiceDate(inv), dateRange)),
    [invoices, dateRange]
  );

  const invoicesView = useMemo(() => {
    return invoicesInRange.filter((inv) => {
      const k = getInvoiceKind(inv);
      if (invoiceKindFilter === 'tax') return k !== 'proforma';
      if (invoiceKindFilter === 'proforma') return k === 'proforma';
      return true;
    });
  }, [invoicesInRange, invoiceKindFilter]);

  const creditDebitNotesInRange = useMemo(
    () => (creditDebitNotes || []).filter((note) => isDateInRange(getNoteDate(note), dateRange)),
    [creditDebitNotes, dateRange]
  );

  const commercialPOsInRange = useMemo(
    () => (commercialPOs || []).filter((po) => poOverlapsRange(po, dateRange)),
    [commercialPOs, dateRange]
  );

  const parentPOsInRange = useMemo(
    () => commercialPOsInRange.filter((p) => !p.isSupplementary),
    [commercialPOsInRange]
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

  const taxInvoices = useMemo(() => invoicesView.filter((inv) => !inv.isAddOn && getInvoiceKind(inv) !== 'proforma'), [invoicesView]);
  const addOnInvoicesList = useMemo(() => invoicesView.filter((inv) => !!inv.isAddOn), [invoicesView]);
  const proformaInView = useMemo(
    () => invoicesView.filter((inv) => getInvoiceKind(inv) === 'proforma'),
    [invoicesView]
  );

  const invoicingTaxStats = useMemo(() => {
    const total = taxInvoices.length;
    const totalValue = taxInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount ?? inv.calculatedInvoiceAmount) || 0), 0);
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
      (sum, inv) => sum + (Number(inv.totalAmount ?? inv.calculatedInvoiceAmount) || 0),
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

  const approvalFunnel = useMemo(() => {
    const buckets = { draft: 0, sent: 0, approved: 0, rejected: 0, other: 0 };
    parentPOsInRange.forEach((po) => {
      const st = String(po.approvalStatus || po.approval_status || 'draft').toLowerCase();
      if (st === APPROVAL_APPROVED) buckets.approved++;
      else if (st === APPROVAL_SENT) buckets.sent++;
      else if (st === 'rejected') buckets.rejected++;
      else if (st === 'draft') buckets.draft++;
      else buckets.other++;
    });
    const total = parentPOsInRange.length || 1;
    return { buckets, total };
  }, [parentPOsInRange]);

  const rollupSummary = useMemo(() => {
    let contractSum = 0;
    let invoicedSum = 0;
    let remainingSum = 0;
    let dueCycleCount = 0;
    let approvedNoTaxInvoice = 0;

    parentPOsInRange.forEach((po) => {
      const { contract, poQty } = resolveContractForBillingParentPo(po);
      const roll = rollupMainPoBilling(po, poSourceFull, invoiceSource, contract, poQty);
      contractSum += contract;
      invoicedSum += roll.invoicedAmount;
      remainingSum += roll.remainingContract;
      const st = String(po.approvalStatus || po.approval_status || '').toLowerCase();
      if (st === APPROVAL_APPROVED && roll.taxInvoiceCount === 0) approvedNoTaxInvoice++;

      if (roll.nextBillingDate) {
        const next = startOfDay(roll.nextBillingDate);
        if (next) {
          const daysUntil = Math.ceil((next - today) / (1000 * 60 * 60 * 24));
          if (daysUntil <= 14) dueCycleCount++;
        }
      }
    });

    return {
      contractSum,
      invoicedSum,
      remainingSum,
      dueCycleCount,
      approvedNoTaxInvoice,
      parentPoCount: parentPOsInRange.length,
    };
  }, [parentPOsInRange, poSourceFull, invoiceSource, today]);

  const billingTypeDistribution = useMemo(() => {
    const map = {};
    parentPOsInRange.forEach((po) => {
      const bt = String(po.billingType || '—').trim() || '—';
      map[bt] = (map[bt] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [parentPOsInRange]);

  const paymentSnapshot = useMemo(() => {
    const mains = invoicesView.filter((inv) => !inv.isAddOn);
    let paid = 0;
    let unpaid = 0;
    let pendingAmt = 0;
    mains.forEach((inv) => {
      if (inv.paymentStatus === true) paid++;
      else unpaid++;
      pendingAmt += Number(inv.pendingAmount ?? inv.pending_amount) || 0;
    });
    return { paid, unpaid, pendingAmt };
  }, [invoicesView]);

  const eInvoiceBreakdown = useMemo(() => {
    const rows = invoicesView.filter((inv) => !inv.isAddOn && getInvoiceKind(inv) !== 'proforma');
    let withRealIrn = 0;
    let mockOnly = 0;
    let noIrn = 0;
    rows.forEach((inv) => {
      const raw = inv.e_invoice_irn || inv.eInvoiceIrn;
      if (!raw) noIrn++;
      else if (String(raw).toUpperCase().startsWith('MOCK-IRN-')) mockOnly++;
      else withRealIrn++;
    });
    return { withRealIrn, mockOnly, noIrn, total: rows.length };
  }, [invoicesView]);

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
      title: 'Main tax bills',
      description: 'Main contract bills only (not extras)',
      icon: FileText,
      accent: 'red',
      stats: [
        { label: 'How many bills', value: invoicingTaxStats.total },
        { label: 'Money on those bills', value: formatINR(invoicingTaxStats.totalValue || 0) },
        { label: 'Different months touched', value: invoicingTaxStats.monthsWithActivity },
      ],
    },
    {
      id: 'add-on-invoices',
      title: 'Extra bills',
      description: 'Money outside the main contract',
      icon: FilePlus2,
      accent: 'violet',
      stats: [
        { label: 'How many', value: addOnStats.total },
        { label: 'Money total', value: formatINR(addOnStats.totalValue || 0) },
      ],
    },
    {
      id: 'credit-notes',
      title: 'Bill corrections',
      description: 'Fixes to wrong bills — issued or waiting',
      icon: Receipt,
      accent: 'amber',
      stats: [
        { label: 'Issued (lower bill / raise bill)', value: `${cnDnStats.credit} / ${cnDnStats.debit}` },
        { label: 'Waiting for OK', value: cnDnStats.pendingApproval },
        { label: 'OK’d — still need paper', value: cnDnStats.approvedToIssue },
      ],
    },
    {
      id: 'generated-e-invoice',
      title: 'GST filing',
      description: 'How many bills got a government IRN',
      icon: FileDigit,
      accent: 'emerald',
      stats: [
        { label: 'Has IRN number', value: complianceStats.eInvoicesGenerated },
        { label: 'No IRN yet', value: complianceStats.eInvoicesPending },
      ],
    },
    {
      id: 'create-invoice',
      title: 'Job cards',
      description: 'Jobs from Commercial in your date window',
      icon: FileCheck,
      accent: 'slate',
      stats: [
        { label: 'Jobs in this window', value: rollupSummary.parentPoCount },
        { label: 'Still running', value: poMonitorStats.activePOs },
        { label: 'Ends within 30 days', value: poMonitorStats.nearingExpiry },
        { label: 'Renewal needed flag', value: poMonitorStats.pendingRenewal },
        { label: 'Bill after contract end', value: poMonitorStats.postContractBillingOCs },
      ],
    },
    {
      id: 'reports',
      title: 'Cuts & fixes',
      description: 'Money cut by client & billing fixes',
      icon: Wallet,
      accent: 'rose',
      stats: [
        { label: 'Money cut as penalty', value: formatINR(leakageStats.totalPenalties || 0) },
        { label: 'Bills lower than expected', value: leakageStats.lessBilling },
        { label: 'Bills higher than expected', value: leakageStats.moreBilling },
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
    setDatePresetId('custom');
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const funnelTotal = approvalFunnel.total;
  const funnelBar = (n) => ({
    width: `${Math.min(100, Math.round((n / funnelTotal) * 100))}%`,
  });

  const heroMetrics = verticalNotSelected
    ? []
    : [
        {
          id: 'tax-value',
          label: 'Money on tax bills (this filter)',
          value: formatINR(invoicingTaxStats.totalValue),
          sub: `${invoicingTaxStats.total} bill(s) in ${formatRangeLabel(dateRange)}`,
          icon: CircleDollarSign,
          tone: 'red',
        },
        {
          id: 'contract-left',
          label: 'Money still to bill on contracts',
          value: formatINR(rollupSummary.remainingSum),
          sub: `Agreed ${formatINR(rollupSummary.contractSum)} · already billed ${formatINR(rollupSummary.invoicedSum)}`,
          icon: Target,
          tone: 'slate',
        },
        {
          id: 'pipeline',
          label: 'Jobs ready but no tax bill yet',
          value: rollupSummary.approvedNoTaxInvoice,
          sub: 'Approved in Commercial — you can make the bill',
          icon: TrendingUp,
          tone: 'amber',
        },
        {
          id: 'cycle-due',
          label: 'Time to send the next bill (14 days)',
          value: rollupSummary.dueCycleCount,
          sub: 'From last bill date + days on the job card',
          icon: Clock,
          tone: 'sky',
        },
        {
          id: 'collections',
          label: 'Bills waiting for payment',
          value: paymentSnapshot.unpaid,
          sub: `${formatINR(paymentSnapshot.pendingAmt)} still owed · ${paymentSnapshot.paid} paid`,
          icon: Wallet,
          tone: 'emerald',
        },
        {
          id: 'irn-gap',
          label: 'Tax bills missing GST number',
          value: eInvoiceBreakdown.noIrn,
          sub:
            eInvoiceBreakdown.total > 0
              ? `${eInvoiceBreakdown.withRealIrn} live IRN · ${eInvoiceBreakdown.mockOnly} mock`
              : 'No tax invoices in filter',
          icon: FileDigit,
          tone: 'violet',
        },
      ];

  const heroTone = {
    red: 'border-red-100 bg-gradient-to-br from-red-50/90 to-white ring-red-100/80',
    slate: 'border-slate-200 bg-gradient-to-br from-slate-50/90 to-white ring-slate-100',
    amber: 'border-amber-100 bg-gradient-to-br from-amber-50/90 to-white ring-amber-100/80',
    sky: 'border-sky-100 bg-gradient-to-br from-sky-50/90 to-white ring-sky-100/80',
    emerald: 'border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white ring-emerald-100/80',
    violet: 'border-violet-100 bg-gradient-to-br from-violet-50/90 to-white ring-violet-100/80',
  };

  return (
    <div className="w-full overflow-y-auto min-h-[80vh] px-4 sm:px-6 py-6 bg-gradient-to-b from-slate-50/70 to-white">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600 mb-6">
          <p className="text-lg font-semibold text-gray-900">Start by picking a team</p>
          <p className="text-sm mt-1 max-w-lg mx-auto">
            Use the first dropdown at the top. Jobs and bills show up only after the same team is chosen. New job? Create it in{' '}
            <strong>Commercial</strong> first, then come back here.
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
          <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-3">The usual order</p>
          <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                1
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Create the job</p>
                <p className="text-xs text-gray-600 mt-0.5">In Commercial — get it approved</p>
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
                <p className="font-semibold text-gray-900 text-sm">Match the team</p>
                <p className="text-xs text-gray-600 mt-0.5">Use the same line you picked in Commercial (dropdown at top).</p>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                3
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Make the bill</p>
                <p className="text-xs text-gray-600 mt-0.5">Real tax bill or draft — from an approved job.</p>
                <button
                  type="button"
                  onClick={() => onNavigateTab && onNavigateTab('create-invoice')}
                  className="mt-2 text-xs font-semibold text-red-700 hover:underline"
                >
                  Open Make bill →
                </button>
              </div>
            </li>
            <li className="flex gap-3 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-800">
                4
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm">Print &amp; file</p>
                <p className="text-xs text-gray-600 mt-0.5">PDF, payment proof, GST number, fix wrong bill.</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('manage-invoices')}
                    className="text-xs font-semibold text-red-700 hover:underline"
                  >
                    All bills →
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateTab && onNavigateTab('generated-e-invoice')}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    GST filed list →
                  </button>
                </div>
              </div>
            </li>
          </ol>
        </div>
      ) : null}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-red-50 ring-1 ring-red-100 border border-red-100/80 shadow-sm shrink-0">
              <LayoutDashboard className="w-6 h-6 text-red-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing home</h1>
              <p className="text-sm text-gray-600 mt-0.5 max-w-3xl">
                Everything about money for the team you picked: bills sent, money left on jobs, who paid, and what still needs
                a GST number — change the date and bill type below anytime.
              </p>
              {!verticalNotSelected ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-800">
                    <Users className="w-3.5 h-3.5" />
                    {verticalLabel}
                  </span>
                  <span>
                    Job type filter: <strong>{billingPoBasisLabel}</strong>
                  </span>
                  <span className="text-slate-400">|</span>
                  <span>
                    Dates: <strong>{formatRangeLabel(dateRange)}</strong>
                  </span>
                  <span className="text-slate-400">|</span>
                  <span>
                    Bill kind:{' '}
                    <strong>
                      {invoiceKindFilter === 'all'
                        ? 'All'
                        : invoiceKindFilter === 'tax'
                          ? 'Real tax bills only'
                          : 'Draft (proforma) only'}
                    </strong>
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFiltersPanel((o) => !o)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Filter className="w-4 h-4 text-red-600" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFiltersPanel ? 'rotate-180' : ''}`} />
            </button>

            <div className="relative" ref={filterDropdownRef}>
              <button
                type="button"
                onClick={() => setIsRangeOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                title="Custom date range"
              >
                <CalendarDays className="w-4 h-4 text-red-600" />
                <span className="hidden sm:inline max-w-[10rem] truncate">{formatRangeLabel(dateRange)}</span>
              </button>
              {isRangeOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {DATE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          applyDatePreset(p.id);
                          setIsRangeOpen(false);
                        }}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium border ${
                          datePresetId === p.id
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Custom range</p>
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
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        applyDatePreset('all');
                        setIsRangeOpen(false);
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      All dates
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRangeOpen(false)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Done
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
              title="Refresh billing data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {!verticalNotSelected && showFiltersPanel ? (
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Date presets</p>
              <div className="flex flex-wrap gap-2">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyDatePreset(p.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border ${
                      datePresetId === p.id
                        ? 'border-red-400 bg-red-50 text-red-900 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Jobs count if their dates touch this window. Bill numbers use the <strong>bill date</strong> inside the same
                window.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Which bills to count</p>
              <select
                value={invoiceKindFilter}
                onChange={(e) => setInvoiceKindFilter(e.target.value)}
                className="w-full max-w-xs border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="all">Everything — real and draft bills</option>
                <option value="tax">Only real tax bills</option>
                <option value="proforma">Only draft (proforma) bills</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-2">
                This changes money and payment tiles only. Job counts always come from Commercial.
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <p className="text-xs font-semibold text-slate-800 mb-1">Draft bills in period</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">{proformaInView.length}</p>
              <p className="text-[11px] text-slate-600 mt-1">Not final GST bills — for quotes or drafts only</p>
            </div>
          </div>
        ) : null}
      </div>

      {!verticalNotSelected && heroMetrics.length > 0 ? (
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-3">
          {heroMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                className={`rounded-xl border p-4 shadow-sm ring-1 ${heroTone[m.tone]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 leading-tight">{m.label}</p>
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
                <p className="mt-2 text-xl font-bold text-slate-900 tabular-nums leading-tight">{m.value}</p>
                <p className="mt-1.5 text-[11px] text-slate-600 leading-snug">{m.sub}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {!verticalNotSelected ? (
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-7xl mx-auto">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Percent className="w-5 h-5 text-red-600" />
              <div>
                <h2 className="text-sm font-bold text-gray-900">Where jobs sit in approval</h2>
                <p className="text-xs text-gray-500">Main jobs in your date window ({parentPOsInRange.length})</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { key: 'approved', label: 'Approved', color: 'bg-emerald-500', n: approvalFunnel.buckets.approved },
                { key: 'sent', label: 'Sent for approval', color: 'bg-amber-500', n: approvalFunnel.buckets.sent },
                { key: 'draft', label: 'Draft', color: 'bg-slate-400', n: approvalFunnel.buckets.draft },
                { key: 'rejected', label: 'Rejected', color: 'bg-rose-500', n: approvalFunnel.buckets.rejected },
              ].map((row) => (
                <div key={row.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-700 font-medium">{row.label}</span>
                    <span className="tabular-nums text-slate-900 font-semibold">{row.n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color} transition-all`} style={funnelBar(row.n)} />
                  </div>
                </div>
              ))}
              {approvalFunnel.buckets.other > 0 ? (
                <p className="text-xs text-amber-700">Other status: {approvalFunnel.buckets.other}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-violet-600" />
              <div>
                <h2 className="text-sm font-bold text-gray-900">How jobs are billed</h2>
                <p className="text-xs text-gray-500">Monthly, per day, lump sum, service…</p>
              </div>
            </div>
            {billingTypeDistribution.length === 0 ? (
              <p className="text-sm text-gray-500">No parent POs in this window.</p>
            ) : (
              <ul className="space-y-2">
                {billingTypeDistribution.map(([label, count]) => {
                  const pct = Math.round((count / parentPOsInRange.length) * 100);
                  return (
                    <li key={label}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-slate-700 truncate pr-2">{label}</span>
                        <span className="tabular-nums text-slate-900 shrink-0">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-violet-50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-6 max-w-7xl mx-auto">
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
                    <Icon className="w-[18px] h-[18px]" />
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

      {hasAlerts && !verticalNotSelected && (
        <div className="max-w-7xl mx-auto mt-6 mb-6 space-y-3">
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
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('notifications')}
              className="shrink-0 text-sm font-medium text-indigo-700 hover:underline"
            >
              Open alerts
            </button>
          </div>
        </div>
      )}

      {!verticalNotSelected ? (
        <p className="text-center text-xs text-slate-500 max-w-3xl mx-auto mt-4 mb-8 leading-relaxed">
          <strong>Reading this screen:</strong> The two dropdowns at the top pick your team and job type. Here, dates slice{' '}
          <em>bills</em> by bill date and <em>jobs</em> by contract dates. “Money left” uses the same math as Make bill.
          Day-by-day reminders live under <strong>Reminders</strong>.
        </p>
      ) : (
        <p className="text-center text-xs text-gray-400 mt-8 pb-4">
          PO / WO master data is maintained in Commercial → PO Entry. Supplementary / post-contract billing is approved there
          before billing runs here.
        </p>
      )}
    </div>
  );
};

export default BillingDashboard;
