import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  CalendarDays,
  FileDigit,
  LayoutDashboard,
  Wallet,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Target,
  CircleDollarSign,
  X,
  Ban,
  PencilLine,
  GitCompareArrows,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { rollupMainPoBilling, resolveContractForBillingParentPo } from '../../utils/billingInvoiceRollup';
import { formatDateDdMmYyyy } from '../../utils/dateDisplay';
import FormDateInput from "../../components/FormDateInput";
import BillingScopeFilters from './components/BillingScopeFilters';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import {
  ChartPanel,
  ComposedTrendChart,
  CHART_SERIES,
} from '../../components/charts/DashboardCharts';


const APPROVAL_APPROVED = 'approved';

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
  if (from && !to) return `From ${formatDateDdMmYyyy(from)}`;
  if (!from && to) return `Until ${formatDateDdMmYyyy(to)}`;
  return `${formatDateDdMmYyyy(from)} – ${formatDateDdMmYyyy(to)}`;
}

function formatINR(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function getInvoiceKind(inv) {
  return String(inv.invoiceKind || inv.invoice_kind || 'tax').toLowerCase();
}

function getInvoiceAmount(inv) {
  return Number(inv?.totalAmount ?? inv?.calculatedInvoiceAmount ?? inv?.calculated_invoice_amount) || 0;
}

function getInvoiceSiteLabel(inv) {
  const site = String(inv?.siteId || inv?.site_id || '').trim();
  const loc = String(inv?.locationName || inv?.location_name || '').trim();
  if (site && loc) return `${site} – ${loc}`;
  if (site || loc) return site || loc;
  return String(inv?.clientLegalName || inv?.client_legal_name || '—').trim() || '—';
}

/** Site display name for monthly comparison (legal/client name — not location or site code). */
function getComparisonSiteName(inv, po) {
  const name = String(
    inv?.clientLegalName ||
      inv?.client_legal_name ||
      po?.legalName ||
      po?.legal_name ||
      ''
  ).trim();
  if (name) return name;
  const site = String(inv?.siteId || inv?.site_id || po?.siteId || po?.site_id || '').trim();
  return site || '—';
}

function getInvoiceUpdatedAt(inv) {
  return inv?.updated_at || inv?.updatedAt || '';
}

function getInvoiceCreatedAt(inv) {
  return inv?.created_at || inv?.createdAt || '';
}

/** True when Manage Invoice (or any save) updated the row after create. */
function wasInvoiceUpdatedAfterCreate(inv) {
  const u = new Date(getInvoiceUpdatedAt(inv) || 0).getTime() || 0;
  const c = new Date(getInvoiceCreatedAt(inv) || getInvoiceDate(inv) || 0).getTime() || 0;
  if (!u || !c) return false;
  return u - c > 60 * 1000;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonthKey(ym, deltaMonths) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatSignedINR(n) {
  const v = Number(n);
  const amount = Number.isFinite(v) ? v : 0;
  const abs = formatINR(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return abs;
}

/** Difference = Current Month Billing − Previous Month Billing */
function billingAmountDifference(currentMonthBilling, previousMonthBilling) {
  return (Number(currentMonthBilling) || 0) - (Number(previousMonthBilling) || 0);
}

function formatPctChange(current, previous) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) {
    if (curr === 0) return '0%';
    return 'New';
  }
  const pct = ((curr - prev) / prev) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
}

function toggleTableSort(prev, key, defaultDirection = 'asc') {
  if (prev?.key === key) {
    return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: defaultDirection };
}

function compareSortValues(a, b, direction = 'asc') {
  const mul = direction === 'desc' ? -1 : 1;
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return 0;
    return a < b ? -1 * mul : 1 * mul;
  }
  const as = String(a).toLowerCase();
  const bs = String(b).toLowerCase();
  if (as === bs) return 0;
  return as < bs ? -1 * mul : 1 * mul;
}

function renderDashboardSortIndicator(active, direction) {
  const ascActive = active && direction === 'asc';
  const descActive = active && direction === 'desc';
  return (
    <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
      <span className={ascActive ? 'text-emerald-500' : 'text-slate-300'}>▲</span>
      <span className={descActive ? 'text-rose-400' : 'text-slate-300'}>▼</span>
    </span>
  );
}

function monthKeyFromDate(raw) {
  if (!raw) return '';
  if (typeof raw === 'string' && /^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthOptionLabel(ym) {
  if (!ym || ym === 'all') return 'All months';
  const [y, m] = String(ym).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function cancelledInvoiceMonthKey(inv) {
  return (
    monthKeyFromDate(inv?.cancelledAt || inv?.cancelled_at) ||
    monthKeyFromDate(getInvoiceDate(inv)) ||
    ''
  );
}

/** Display-only snapshot of last-seen amounts (not billing source of truth). */
const UPDATED_AMOUNT_SNAPSHOT_KEY = 'billing_dashboard_updated_invoice_amounts';

function readUpdatedAmountSnapshot() {
  try {
    const raw = window.localStorage.getItem(UPDATED_AMOUNT_SNAPSHOT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUpdatedAmountSnapshot(map) {
  try {
    window.localStorage.setItem(UPDATED_AMOUNT_SNAPSHOT_KEY, JSON.stringify(map || {}));
  } catch {
    /* ignore */
  }
}

/**
 * Previous amount from last dashboard snapshot when the current total differs.
 * Does not change invoice data or billing logic.
 * Snapshot shape: { [invoiceId]: { previous: number|null, current: number } }
 */
function getPreviousBillingAmount(inv, snapshot) {
  const id = String(inv?.id || '');
  if (!id) return null;
  const entry = snapshot?.[id];
  if (!entry || typeof entry !== 'object') return null;
  const live = getInvoiceAmount(inv);
  const storedCurrent = Number(entry.current);
  // Same refresh as an amount change: last-seen current is the previous amount.
  if (Number.isFinite(storedCurrent) && storedCurrent !== live) {
    return storedCurrent;
  }
  if (entry.previous == null) return null;
  const prev = Number(entry.previous);
  return Number.isFinite(prev) ? prev : null;
}

function bumpUpdatedAmountSnapshot(snapshot, invoiceId, newAmount) {
  const id = String(invoiceId || '');
  if (!id) return snapshot;
  const next = { ...(snapshot || {}) };
  const amount = Number(newAmount) || 0;
  const prevEntry = next[id];
  if (!prevEntry || typeof prevEntry !== 'object') {
    next[id] = { previous: null, current: amount };
    return next;
  }
  const prevCurrent = Number(prevEntry.current);
  if (Number.isFinite(prevCurrent) && prevCurrent !== amount) {
    next[id] = { previous: prevCurrent, current: amount };
  } else {
    next[id] = {
      previous: prevEntry.previous == null ? null : Number(prevEntry.previous),
      current: amount,
    };
  }
  return next;
}

/** Daily buckets for trend — uses filter end date, or anchors to latest bill date when "All dates". */
function buildInvoiceTrendData(rows, dateRange, days = 14) {
  const validRows = (rows || []).filter((r) => startOfDay(r.date));
  const empty = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return { name: formatDateDdMmYyyy(d).slice(0, 5), value: 0, count: 0 };
  });
  if (!validRows.length) return { data: empty, anchored: false };

  const today = startOfDay(new Date());
  let windowEnd = isDashboardRangeActive(dateRange) ? startOfDay(dateRange.to) || today : today;
  let windowStart = new Date(windowEnd);
  windowStart.setDate(windowStart.getDate() - (days - 1));

  const inWindow = (d) => d >= windowStart && d <= windowEnd;
  let anchored = false;
  if (!validRows.some((r) => inWindow(startOfDay(r.date)))) {
    const latest = validRows.reduce((max, r) => {
      const d = startOfDay(r.date);
      return d && d > max ? d : max;
    }, new Date(0));
    if (latest.getTime() > 0) {
      windowEnd = latest;
      windowStart = new Date(latest);
      windowStart.setDate(windowStart.getDate() - (days - 1));
      anchored = true;
    }
  }

  const buckets = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStart);
    d.setDate(windowStart.getDate() + i);
    buckets.push({
      key: formatDateInputValue(d),
      name: formatDateDdMmYyyy(d).slice(0, 5),
      value: 0,
      count: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const row of validRows) {
    const key = formatDateInputValue(startOfDay(row.date));
    const cell = byKey.get(key);
    if (!cell) continue;
    cell.value += Number(row.amount) || 0;
    cell.count += 1;
  }
  return { data: buckets.map(({ name, value, count }) => ({ name, value, count })), anchored };
}

const DATE_PRESETS = [
  { id: 'all', label: 'All time', getRange: () => getAllDashboardDateRange() },
  { id: 'this_month', label: 'This month', getRange: getThisMonthDateRange },
  { id: 'last_month', label: 'Last month', getRange: getLastMonthDateRange },
  { id: 'last_30', label: 'Last 30 days', getRange: getLast30DaysDateRange },
  { id: 'this_fy', label: 'This financial year', getRange: getThisFinancialYearDateRange },
];

const BillingDashboard = () => {
  const {
    commercialPOs,
    commercialPOsAllModules,
    invoices,
    invoicesAll,
    billingError,
    clearBillingError,
    refreshBilling,
    billingVerticalFilter,
    setBillingVerticalFilter,
    billingPoBasisFilter,
    setBillingPoBasisFilter,
    billingVerticalOptions,
    billingPoBasisOptions,
  } = useBilling();
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [dateRange, setDateRange] = useState(getAllDashboardDateRange);
  const [datePresetId, setDatePresetId] = useState('all');
  const [invoiceKindFilter, setInvoiceKindFilter] = useState('all');
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [cancelledMonthFilter, setCancelledMonthFilter] = useState(currentMonthKey);
  const [comparisonMonthA, setComparisonMonthA] = useState(currentMonthKey);
  const [comparisonMonthB, setComparisonMonthB] = useState(() => shiftMonthKey(currentMonthKey(), -1));
  const [cancelledSort, setCancelledSort] = useState({ key: 'amount', direction: 'desc' });
  const [updatedSort, setUpdatedSort] = useState({ key: 'updated', direction: 'desc' });
  const [comparisonSort, setComparisonSort] = useState({ key: 'currentAmount', direction: 'desc' });
  const filterDropdownRef = useRef(null);

  const lockedToSingleVertical = (billingVerticalOptions || []).length === 1;

  const invoiceSource = invoicesAll?.length ? invoicesAll : invoices;
  const poSourceFull = commercialPOsAllModules?.length ? commercialPOsAllModules : commercialPOs;

  useEffect(() => {
    void refreshBilling?.();
  }, [refreshBilling]);

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

  const commercialPOsInRange = useMemo(
    () => (commercialPOs || []).filter((po) => poOverlapsRange(po, dateRange)),
    [commercialPOs, dateRange]
  );

  const parentPOsInRange = useMemo(
    () => commercialPOsInRange.filter((p) => !p.isSupplementary),
    [commercialPOsInRange]
  );

  const taxInvoices = useMemo(() => invoicesView.filter((inv) => !inv.isAddOn && getInvoiceKind(inv) !== 'proforma'), [invoicesView]);
  const proformaInView = useMemo(
    () => invoicesView.filter((inv) => getInvoiceKind(inv) === 'proforma'),
    [invoicesView]
  );

  const invoicingTaxStats = useMemo(() => {
    const total = taxInvoices.length;
    const totalValue = taxInvoices.reduce((sum, inv) => sum + (Number(inv.totalAmount ?? inv.calculatedInvoiceAmount) || 0), 0);
    return { total, totalValue };
  }, [taxInvoices]);

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

  const handleDateRangeChange = (field, value) => {
    setDatePresetId('custom');
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const invoiceTrendRows = useMemo(
    () =>
      taxInvoices.map((inv) => ({
        date: getInvoiceDate(inv),
        amount: Number(inv.totalAmount ?? inv.calculatedInvoiceAmount) || 0,
      })),
    [taxInvoices]
  );

  const { data: invoiceTrendData, anchored: trendAnchored } = useMemo(
    () => buildInvoiceTrendData(invoiceTrendRows, dateRange, 14),
    [invoiceTrendRows, dateRange]
  );

  // Display-only lists (do not feed KPIs / rollups).
  const cancelledInvoicesAllInView = useMemo(() => {
    return (invoicesView || [])
      .filter((inv) => !!inv.isCancelled || !!inv.is_cancelled)
      .slice()
      .sort((a, b) => {
        const at = new Date(a.cancelledAt || a.cancelled_at || getInvoiceDate(a) || 0).getTime() || 0;
        const bt = new Date(b.cancelledAt || b.cancelled_at || getInvoiceDate(b) || 0).getTime() || 0;
        return bt - at;
      });
  }, [invoicesView]);

  const cancelledMonthOptions = useMemo(() => {
    const keys = new Set();
    cancelledInvoicesAllInView.forEach((inv) => {
      const mk = cancelledInvoiceMonthKey(inv);
      if (mk) keys.add(mk);
    });
    const cur = currentMonthKey();
    keys.add(cur);
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [cancelledInvoicesAllInView]);

  const cancelledInvoicesList = useMemo(() => {
    if (cancelledMonthFilter === 'all') return cancelledInvoicesAllInView;
    return cancelledInvoicesAllInView.filter(
      (inv) => cancelledInvoiceMonthKey(inv) === cancelledMonthFilter
    );
  }, [cancelledInvoicesAllInView, cancelledMonthFilter]);

  const cancelledInvoicesTotal = useMemo(
    () => cancelledInvoicesList.reduce((sum, inv) => sum + getInvoiceAmount(inv), 0),
    [cancelledInvoicesList]
  );

  const updatedAmountSnapshot = useMemo(() => readUpdatedAmountSnapshot(), [invoicesView]);

  const updatedInvoicesList = useMemo(() => {
    return (invoicesView || [])
      .filter((inv) => !inv.isCancelled && !inv.is_cancelled && wasInvoiceUpdatedAfterCreate(inv))
      .slice()
      .sort((a, b) => {
        const at = new Date(getInvoiceUpdatedAt(a) || 0).getTime() || 0;
        const bt = new Date(getInvoiceUpdatedAt(b) || 0).getTime() || 0;
        return bt - at;
      })
      .map((inv) => ({
        inv,
        previousAmount: getPreviousBillingAmount(inv, updatedAmountSnapshot),
        updatedAmount: getInvoiceAmount(inv),
      }));
  }, [invoicesView, updatedAmountSnapshot]);

  // Keep display-only previous-amount snapshots in sync after list is known.
  useEffect(() => {
    if (!updatedInvoicesList.length) return;
    let next = readUpdatedAmountSnapshot();
    let changed = false;
    updatedInvoicesList.forEach(({ inv, updatedAmount }) => {
      const id = String(inv.id || '');
      if (!id) return;
      const before = next[id];
      next = bumpUpdatedAmountSnapshot(next, id, updatedAmount);
      const after = next[id];
      if (
        !before ||
        before.current !== after.current ||
        before.previous !== after.previous
      ) {
        changed = true;
      }
    });
    if (changed) writeUpdatedAmountSnapshot(next);
  }, [updatedInvoicesList]);

  const updatedInvoicesTotal = useMemo(
    () => updatedInvoicesList.reduce((sum, row) => sum + (Number(row.updatedAmount) || 0), 0),
    [updatedInvoicesList]
  );

  const updatedInvoicesPreviousTotal = useMemo(
    () =>
      updatedInvoicesList.reduce((sum, row) => {
        if (row.previousAmount == null) return sum;
        return sum + (Number(row.previousAmount) || 0);
      }, 0),
    [updatedInvoicesList]
  );

  const getPoForInvoice = useCallback(
    (inv) => {
      if (!inv) return null;
      const pid = String(inv.poId || inv.po_id || '');
      if (!pid) return null;
      return (poSourceFull || []).find((p) => String(p.id) === pid) || null;
    },
    [poSourceFull]
  );

  const resolveInvoiceSiteLabel = useCallback(
    (inv) => {
      const fromInv = getInvoiceSiteLabel(inv);
      if (fromInv && fromInv !== '—') return fromInv;
      const po = getPoForInvoice(inv);
      if (!po) return '—';
      const site = String(po.siteId || po.site_id || '').trim();
      const loc = String(po.locationName || po.location_name || '').trim();
      if (site && loc) return `${site} – ${loc}`;
      return site || loc || po.legalName || po.legal_name || '—';
    },
    [getPoForInvoice]
  );

  /** Display-only: site totals for two selectable months (independent of date-range KPIs). */
  const comparisonMonthOptions = useMemo(() => {
    const keys = new Set();
    (invoices || []).forEach((inv) => {
      if (inv.isCancelled || inv.is_cancelled) return;
      if (inv.isAddOn || inv.is_add_on) return;
      if (getInvoiceKind(inv) === 'proforma') return;
      const ym = monthKeyFromDate(getInvoiceDate(inv));
      if (ym) keys.add(ym);
    });
    const cur = currentMonthKey();
    keys.add(cur);
    keys.add(shiftMonthKey(cur, -1));
    if (comparisonMonthA) keys.add(comparisonMonthA);
    if (comparisonMonthB) keys.add(comparisonMonthB);
    return Array.from(keys).sort((a, b) => b.localeCompare(a));
  }, [invoices, comparisonMonthA, comparisonMonthB]);

  const siteMonthlyComparison = useMemo(() => {
    const monthA = comparisonMonthA || currentMonthKey();
    const monthB = comparisonMonthB || shiftMonthKey(monthA, -1);
    const bySite = new Map();

    (invoices || []).forEach((inv) => {
      if (inv.isCancelled || inv.is_cancelled) return;
      if (inv.isAddOn || inv.is_add_on) return;
      if (getInvoiceKind(inv) === 'proforma') return;
      const ym = monthKeyFromDate(getInvoiceDate(inv));
      if (ym !== monthA && ym !== monthB) return;

      const po = getPoForInvoice(inv);
      const siteId = String(inv.siteId || inv.site_id || po?.siteId || po?.site_id || '').trim();
      const siteName = getComparisonSiteName(inv, po);
      const key = siteId || `name:${siteName}`;
      if (!bySite.has(key)) {
        bySite.set(key, {
          id: key,
          siteName,
          currentAmount: 0,
          previousAmount: 0,
        });
      }
      const row = bySite.get(key);
      if (siteName && siteName !== '—' && (row.siteName === '—' || !row.siteName)) {
        row.siteName = siteName;
      }
      const amount = getInvoiceAmount(inv);
      if (ym === monthA) row.currentAmount += amount;
      else row.previousAmount += amount;
    });

    return Array.from(bySite.values())
      .map((row) => {
        const currentMonthBilling = Number(row.currentAmount) || 0;
        const previousMonthBilling = Number(row.previousAmount) || 0;
        const delta = billingAmountDifference(currentMonthBilling, previousMonthBilling);
        return {
          ...row,
          currentAmount: currentMonthBilling,
          previousAmount: previousMonthBilling,
          currentMonth: monthA,
          previousMonth: monthB,
          delta,
          pctLabel: formatPctChange(currentMonthBilling, previousMonthBilling),
        };
      });
  }, [invoices, getPoForInvoice, comparisonMonthA, comparisonMonthB]);

  const cancelledInvoicesSorted = useMemo(() => {
    const list = cancelledInvoicesList.slice();
    const { key, direction } = cancelledSort || {};
    if (!key) return list;
    list.sort((a, b) => {
      const valueOf = (inv) => {
        switch (key) {
          case 'invoice':
            return String(inv.taxInvoiceNumber || inv.tax_invoice_number || '');
          case 'site':
            return resolveInvoiceSiteLabel(inv);
          case 'month':
            return cancelledInvoiceMonthKey(inv);
          case 'reason':
            return String(inv.cancelReason || inv.cancel_reason || '');
          case 'amount':
            return getInvoiceAmount(inv);
          default:
            return '';
        }
      };
      return compareSortValues(valueOf(a), valueOf(b), direction);
    });
    return list;
  }, [cancelledInvoicesList, cancelledSort, resolveInvoiceSiteLabel]);

  const updatedInvoicesSorted = useMemo(() => {
    const list = updatedInvoicesList.slice();
    const { key, direction } = updatedSort || {};
    if (!key) return list;
    list.sort((a, b) => {
      const valueOf = (row) => {
        switch (key) {
          case 'invoice':
            return String(row.inv.taxInvoiceNumber || row.inv.tax_invoice_number || '');
          case 'site':
            return resolveInvoiceSiteLabel(row.inv);
          case 'updated':
            return new Date(getInvoiceUpdatedAt(row.inv) || 0).getTime() || 0;
          case 'previousAmount':
            return row.previousAmount == null ? null : Number(row.previousAmount) || 0;
          case 'updatedAmount':
            return Number(row.updatedAmount) || 0;
          default:
            return '';
        }
      };
      return compareSortValues(valueOf(a), valueOf(b), direction);
    });
    return list;
  }, [updatedInvoicesList, updatedSort, resolveInvoiceSiteLabel]);

  const siteMonthlyComparisonSorted = useMemo(() => {
    const { key, direction } = comparisonSort || {};
    const list = siteMonthlyComparison.map((row) => row);
    if (!key) return list;
    list.sort((a, b) => {
      let left;
      let right;
      switch (key) {
        case 'siteName':
          left = String(a.siteName || '');
          right = String(b.siteName || '');
          break;
        case 'currentMonth':
          left = Number(a.currentAmount) || 0;
          right = Number(b.currentAmount) || 0;
          break;
        case 'previousMonth':
          left = Number(a.previousAmount) || 0;
          right = Number(b.previousAmount) || 0;
          break;
        case 'currentAmount':
          left = Number(a.currentAmount) || 0;
          right = Number(b.currentAmount) || 0;
          break;
        case 'previousAmount':
          left = Number(a.previousAmount) || 0;
          right = Number(b.previousAmount) || 0;
          break;
        case 'delta':
          left = Number(a.delta) || 0;
          right = Number(b.delta) || 0;
          break;
        default:
          left = '';
          right = '';
      }
      const primary = compareSortValues(left, right, direction);
      if (primary !== 0) return primary;
      return compareSortValues(String(a.id || a.siteName || ''), String(b.id || b.siteName || ''), 'asc');
    });
    return list;
  }, [siteMonthlyComparison, comparisonSort.key, comparisonSort.direction]);

  const heroMetrics = [
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
    <div className="w-full overflow-y-auto min-h-[80vh] px-4 sm:px-6 pt-2 pb-6 bg-gradient-to-b from-slate-50/70 to-white">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white/95 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-red-50 ring-1 ring-red-100 border border-red-100/80 shadow-sm shrink-0">
              <LayoutDashboard className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Billing</h1>
          </div>

          <div className="relative shrink-0" ref={filterDropdownRef}>
              <button
                type="button"
                onClick={() => setIsRangeOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                title="Custom date range"
              >
                <CalendarDays className="w-4 h-4 text-red-600" />
                <span className="max-w-[10rem] truncate">{formatRangeLabel(dateRange)}</span>
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
                      <FormDateInput value={dateRange.from} onChange={(e) => handleDateRangeChange('from', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-600">To</span>
                      <FormDateInput value={dateRange.to} onChange={(e) => handleDateRangeChange('to', e.target.value)}
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
        </div>

        <BillingScopeFilters
          className="mt-3 pt-3 border-t border-slate-100"
          billingVerticalFilter={billingVerticalFilter}
          setBillingVerticalFilter={setBillingVerticalFilter}
          billingVerticalOptions={billingVerticalOptions}
          billingPoBasisFilter={billingPoBasisFilter}
          setBillingPoBasisFilter={setBillingPoBasisFilter}
          billingPoBasisOptions={billingPoBasisOptions}
          lockedToSingleVertical={lockedToSingleVertical}
          invoiceKindFilter={invoiceKindFilter}
          onInvoiceKindChange={setInvoiceKindFilter}
          draftBillCount={proformaInView.length}
        />
      </div>

      {heroMetrics.length > 0 ? (
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

      <div className="mb-6 max-w-7xl mx-auto">
        <ChartPanel
          title="Invoice value trend"
          subtitle={
            trendAnchored
              ? `Daily tax bill totals · 14 days ending on latest bill · ${formatRangeLabel(dateRange)}`
              : `Daily tax bill totals · last 14 days · ${formatRangeLabel(dateRange)}`
          }
          height={240}
        >
          <ComposedTrendChart
            data={invoiceTrendData}
            xKey="name"
            areas={[{ key: 'value', name: 'Invoice value', color: CHART_SERIES[0] }]}
            lines={[{ key: 'count', name: 'Invoices raised', color: CHART_SERIES[1] }]}
            height={240}
            formatter={(val, name) => (name === 'Invoice value' ? formatINR(val) : val)}
          />
        </ChartPanel>
      </div>

      <div className="mb-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-rose-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-100 bg-rose-50/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Ban className="w-4 h-4 text-rose-700 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-rose-950">Cancelled invoices</h2>
                <p className="text-[11px] text-rose-800/80">Site and billing amount · click a row for details</p>
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-rose-900 shrink-0">
              <span className="font-medium whitespace-nowrap">Month</span>
              <select
                value={cancelledMonthFilter}
                onChange={(e) => setCancelledMonthFilter(e.target.value)}
                className="h-8 rounded-lg border border-rose-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                aria-label="Cancelled invoices month"
              >
                <option value="all">All months</option>
                {cancelledMonthOptions.map((ym) => (
                  <option key={ym} value={ym}>
                    {formatMonthOptionLabel(ym)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-x-auto max-h-[22rem]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setCancelledSort((p) => toggleTableSort(p, 'invoice'))}
                      className="inline-flex items-center font-semibold"
                    >
                      Invoice {renderDashboardSortIndicator(cancelledSort.key === 'invoice', cancelledSort.direction)}
                    </button>
                  </th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setCancelledSort((p) => toggleTableSort(p, 'site'))}
                      className="inline-flex items-center font-semibold"
                    >
                      Site {renderDashboardSortIndicator(cancelledSort.key === 'site', cancelledSort.direction)}
                    </button>
                  </th>
                  {cancelledMonthFilter === 'all' ? (
                    <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setCancelledSort((p) => toggleTableSort(p, 'month', 'desc'))}
                        className="inline-flex items-center font-semibold"
                      >
                        Month {renderDashboardSortIndicator(cancelledSort.key === 'month', cancelledSort.direction)}
                      </button>
                    </th>
                  ) : null}
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setCancelledSort((p) => toggleTableSort(p, 'reason'))}
                      className="inline-flex items-center font-semibold"
                    >
                      Reason {renderDashboardSortIndicator(cancelledSort.key === 'reason', cancelledSort.direction)}
                    </button>
                  </th>
                  <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setCancelledSort((p) => toggleTableSort(p, 'amount', 'desc'))}
                      className="inline-flex items-center justify-end w-full font-semibold"
                    >
                      Billing amount {renderDashboardSortIndicator(cancelledSort.key === 'amount', cancelledSort.direction)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cancelledInvoicesSorted.map((inv) => {
                  const cancelReason = String(inv.cancelReason || inv.cancel_reason || '').trim();
                  return (
                  <tr
                    key={inv.id}
                    onClick={() => setPreviewInvoice(inv)}
                    className="cursor-pointer hover:bg-rose-50/50"
                  >
                    <td className="px-3 py-2 font-mono text-slate-800 whitespace-nowrap">
                      {inv.taxInvoiceNumber || inv.tax_invoice_number || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[14rem] truncate" title={resolveInvoiceSiteLabel(inv)}>
                      {resolveInvoiceSiteLabel(inv)}
                    </td>
                    {cancelledMonthFilter === 'all' ? (
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {formatMonthOptionLabel(cancelledInvoiceMonthKey(inv)) || '—'}
                      </td>
                    ) : null}
                    <td
                      className="px-3 py-2 text-slate-700 max-w-[14rem] truncate"
                      title={cancelReason || '—'}
                    >
                      {cancelReason || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatINR(getInvoiceAmount(inv))}
                    </td>
                  </tr>
                  );
                })}
                {cancelledInvoicesSorted.length === 0 ? (
                  <tr>
                    <td
                      colSpan={cancelledMonthFilter === 'all' ? 5 : 4}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No cancelled invoices in this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {cancelledInvoicesSorted.length > 0 ? (
                <tfoot className="border-t border-rose-200 bg-rose-50/50">
                  <tr>
                    <td
                      className="px-3 py-2.5 font-semibold text-rose-950"
                      colSpan={cancelledMonthFilter === 'all' ? 4 : 3}
                    >
                      Total ({cancelledInvoicesSorted.length})
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-rose-950">
                      {formatINR(cancelledInvoicesTotal)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70 flex items-center gap-2">
            <PencilLine className="w-4 h-4 text-amber-700 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-amber-950">Updated in Manage Invoices</h2>
              <p className="text-[11px] text-amber-800/80">Edited after create · site and amount · click for details</p>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[22rem]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setUpdatedSort((p) => toggleTableSort(p, 'invoice'))}
                      className="inline-flex items-center font-semibold"
                    >
                      Invoice {renderDashboardSortIndicator(updatedSort.key === 'invoice', updatedSort.direction)}
                    </button>
                  </th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setUpdatedSort((p) => toggleTableSort(p, 'site'))}
                      className="inline-flex items-center font-semibold"
                    >
                      Site {renderDashboardSortIndicator(updatedSort.key === 'site', updatedSort.direction)}
                    </button>
                  </th>
                  <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setUpdatedSort((p) => toggleTableSort(p, 'updated', 'desc'))}
                      className="inline-flex items-center font-semibold"
                    >
                      Updated {renderDashboardSortIndicator(updatedSort.key === 'updated', updatedSort.direction)}
                    </button>
                  </th>
                  <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setUpdatedSort((p) => toggleTableSort(p, 'previousAmount', 'desc'))}
                      className="inline-flex items-center justify-end w-full font-semibold"
                    >
                      Previous billing amount {renderDashboardSortIndicator(updatedSort.key === 'previousAmount', updatedSort.direction)}
                    </button>
                  </th>
                  <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setUpdatedSort((p) => toggleTableSort(p, 'updatedAmount', 'desc'))}
                      className="inline-flex items-center justify-end w-full font-semibold"
                    >
                      Updated billing amount {renderDashboardSortIndicator(updatedSort.key === 'updatedAmount', updatedSort.direction)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {updatedInvoicesSorted.map(({ inv, previousAmount, updatedAmount }) => (
                  <tr
                    key={inv.id}
                    onClick={() => setPreviewInvoice(inv)}
                    className="cursor-pointer hover:bg-amber-50/50"
                  >
                    <td className="px-3 py-2 font-mono text-slate-800 whitespace-nowrap">
                      {inv.taxInvoiceNumber || inv.tax_invoice_number || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-[12rem] truncate" title={resolveInvoiceSiteLabel(inv)}>
                      {resolveInvoiceSiteLabel(inv)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {formatDateDdMmYyyy(getInvoiceUpdatedAt(inv)) || '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">
                      {previousAmount == null ? '—' : formatINR(previousAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatINR(updatedAmount)}
                    </td>
                  </tr>
                ))}
                {updatedInvoicesSorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No updated invoices in this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {updatedInvoicesSorted.length > 0 ? (
                <tfoot className="border-t border-amber-200 bg-amber-50/50">
                  <tr>
                    <td className="px-3 py-2.5 font-semibold text-amber-950" colSpan={3}>
                      Total ({updatedInvoicesSorted.length})
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-amber-950">
                      {updatedInvoicesSorted.some((r) => r.previousAmount != null)
                        ? formatINR(updatedInvoicesPreviousTotal)
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-amber-950">
                      {formatINR(updatedInvoicesTotal)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <GitCompareArrows className="w-4 h-4 text-slate-700 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">Site-wise Monthly Billing Comparison</h2>
              <p className="text-[11px] text-slate-600">
                Compare two months · tax bills only · updates with available billing data
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
              <span className="font-medium whitespace-nowrap">Month</span>
              <select
                value={comparisonMonthA}
                onChange={(e) => setComparisonMonthA(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                aria-label="Comparison primary month"
              >
                {comparisonMonthOptions.map((ym) => (
                  <option key={`a-${ym}`} value={ym}>
                    {formatMonthOptionLabel(ym)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-700">
              <span className="font-medium whitespace-nowrap">Compare with</span>
              <select
                value={comparisonMonthB}
                onChange={(e) => setComparisonMonthB(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                aria-label="Comparison secondary month"
              >
                {comparisonMonthOptions.map((ym) => (
                  <option key={`b-${ym}`} value={ym}>
                    {formatMonthOptionLabel(ym)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[28rem]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th
                  className="text-left font-semibold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-900"
                  onClick={() => setComparisonSort((p) => toggleTableSort(p, 'siteName'))}
                >
                  <span className="inline-flex items-center font-semibold">
                    Site Name {renderDashboardSortIndicator(comparisonSort.key === 'siteName', comparisonSort.direction)}
                  </span>
                </th>
                <th
                  className="text-left font-semibold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-900"
                  onClick={() => setComparisonSort((p) => toggleTableSort(p, 'currentMonth', 'desc'))}
                >
                  <span className="inline-flex items-center font-semibold">
                    {formatMonthOptionLabel(comparisonMonthA)}{' '}
                    {renderDashboardSortIndicator(comparisonSort.key === 'currentMonth', comparisonSort.direction)}
                  </span>
                </th>
                <th
                  className="text-left font-semibold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-900"
                  onClick={() => setComparisonSort((p) => toggleTableSort(p, 'previousMonth', 'desc'))}
                >
                  <span className="inline-flex items-center font-semibold">
                    {formatMonthOptionLabel(comparisonMonthB)}{' '}
                    {renderDashboardSortIndicator(comparisonSort.key === 'previousMonth', comparisonSort.direction)}
                  </span>
                </th>
                <th
                  className="text-right font-semibold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-900"
                  onClick={() => setComparisonSort((p) => toggleTableSort(p, 'currentAmount', 'desc'))}
                >
                  <span className="inline-flex items-center justify-end w-full font-semibold">
                    Billing ({formatMonthOptionLabel(comparisonMonthA)}){' '}
                    {renderDashboardSortIndicator(comparisonSort.key === 'currentAmount', comparisonSort.direction)}
                  </span>
                </th>
                <th
                  className="text-right font-semibold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-900"
                  onClick={() => setComparisonSort((p) => toggleTableSort(p, 'previousAmount', 'desc'))}
                >
                  <span className="inline-flex items-center justify-end w-full font-semibold">
                    Billing ({formatMonthOptionLabel(comparisonMonthB)}){' '}
                    {renderDashboardSortIndicator(comparisonSort.key === 'previousAmount', comparisonSort.direction)}
                  </span>
                </th>
                <th
                  className="text-right font-semibold px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-slate-900"
                  onClick={() => setComparisonSort((p) => toggleTableSort(p, 'delta', 'desc'))}
                >
                  <span className="inline-flex items-center justify-end w-full font-semibold">
                    Increase / Decrease {renderDashboardSortIndicator(comparisonSort.key === 'delta', comparisonSort.direction)}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {siteMonthlyComparisonSorted.map((row) => {
                // Increase/Decrease = Current Month Billing − Previous Month Billing (same values as the two amount columns).
                const amountDifference = billingAmountDifference(row.currentAmount, row.previousAmount);
                const up = amountDifference > 0;
                const down = amountDifference < 0;
                const tone = up
                  ? 'text-emerald-700'
                  : down
                    ? 'text-rose-700'
                    : 'text-slate-600';
                const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
                return (
                  <tr key={row.id || `${row.siteName}-${row.currentAmount}-${row.previousAmount}`} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2 text-slate-800 max-w-[16rem] truncate" title={row.siteName}>
                      {row.siteName}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {formatMonthOptionLabel(row.currentMonth)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {formatMonthOptionLabel(row.previousMonth)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {formatINR(row.currentAmount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">
                      {formatINR(row.previousAmount)}
                    </td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${tone}`}>
                      <span className="inline-flex items-center justify-end gap-1.5 tabular-nums font-medium">
                        <DeltaIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                        <span>
                          {formatSignedINR(amountDifference)}
                          <span className="text-[11px] opacity-80 ml-1">({row.pctLabel})</span>
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {siteMonthlyComparisonSorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No site billing in the selected months.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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

      {previewInvoice ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                Invoice details – {previewInvoice.taxInvoiceNumber || previewInvoice.tax_invoice_number || '—'}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewInvoice(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 bg-gray-100">
              <InvoiceHtmlPreview
                inv={previewInvoice}
                po={getPoForInvoice(previewInvoice)}
                showEInvoiceMeta={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BillingDashboard;
