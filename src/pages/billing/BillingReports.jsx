import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, BarChart3, Clock, FileText, MessageSquare, Search, TrendingDown, Users, X } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const BASE_REPORT_PATH = '/app/billing/reports';
const DAY_MS = 1000 * 60 * 60 * 24;
const BILLING_DELAY_REMARKS_KEY = 'erp_billing_delay_remarks';

const REPORT_TABS = [
  {
    id: 'outstanding-debtors',
    label: 'Outstanding Debtors',
    shortLabel: 'Outstanding',
    icon: Users,
  },
  {
    id: 'gap-report',
    label: 'Gap Report',
    shortLabel: 'Gap',
    icon: AlertCircle,
  },
  {
    id: 'deduction-analysis',
    label: 'Deduction Analysis',
    shortLabel: 'Deductions',
    icon: FileText,
  },
  {
    id: 'less-billed-sites',
    label: 'Less Billed Sites',
    shortLabel: 'Less Billed',
    icon: TrendingDown,
  },
  {
    id: 'billing-delay',
    label: 'Billing Delay',
    shortLabel: 'Delay',
    icon: Clock,
  },
];

const REPORT_TAB_IDS = REPORT_TABS.map((tab) => tab.id);

function money(value) {
  return `₹${(Number(value) || 0).toLocaleString('en-IN')}`;
}

function getInvoiceNumber(inv) {
  return inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '–';
}

function getClientName(row) {
  return row?.clientLegalName || row?.client_name || row?.legalName || row?.legal_name || '–';
}

function getInvoiceDate(inv) {
  return inv?.invoiceDate || inv?.invoice_date || inv?.created_at || inv?.createdAt || '';
}

function getInvoiceAmount(inv) {
  return Number(inv?.calculatedInvoiceAmount ?? inv?.totalAmount ?? inv?.taxableValue ?? 0) || 0;
}

function getServicePeriodFrom(inv) {
  return inv?.billingDurationFrom || inv?.billing_duration_from || '';
}

function getServicePeriodTo(inv) {
  return inv?.billingDurationTo || inv?.billing_duration_to || '';
}

function formatDate(value) {
  if (!value) return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN');
}

function formatServicePeriod(inv) {
  const from = getServicePeriodFrom(inv);
  const to = getServicePeriodTo(inv);
  if (!from && !to) return '–';
  if (from && to) return `${formatDate(from)} - ${formatDate(to)}`;
  return formatDate(from || to);
}

function startOfDay(value) {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(later, earlier) {
  const a = startOfDay(later);
  const b = startOfDay(earlier);
  if (!a || !b) return 0;
  return Math.ceil((a - b) / DAY_MS);
}

function addCalendarMonths(value, months) {
  const d = startOfDay(value);
  if (!d) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

function formatDelayDuration(from, to, totalDays) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (!start || !end) return `${totalDays || 0} days`;
  const earlier = start <= end ? start : end;
  const later = start <= end ? end : start;
  let totalMonths = (later.getFullYear() - earlier.getFullYear()) * 12 + later.getMonth() - earlier.getMonth();
  let anchor = addCalendarMonths(earlier, totalMonths);
  if (anchor && anchor > later) {
    totalMonths -= 1;
    anchor = addCalendarMonths(earlier, totalMonths);
  }
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = anchor ? Math.max(0, Math.floor((later - anchor) / DAY_MS)) : 0;
  if (years <= 0 && months <= 0) return `${totalDays} days`;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (months > 0) parts.push(`${months}m`);
  if (years > 0) parts.push(`${years}y`);
  return `${parts.join(' ')} = ${totalDays} days`;
}

function loadDelayRemarks() {
  try {
    const raw = window.localStorage.getItem(BILLING_DELAY_REMARKS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function previewRemark(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(' ') || '–';
  return `${words.slice(0, 2).join(' ')}...`;
}

const ReportShell = ({ icon: Icon, title, description, rows, stats, actions, emptyMessage, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    <div className="px-4 py-4 border-b border-gray-200 bg-slate-50/80 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <div className="rounded-lg bg-white border border-slate-200 p-2 shadow-sm shrink-0">
          <Icon className="w-5 h-5 text-red-600" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>

    {stats?.length ? (
      <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-gray-100 bg-white">
        {stats.map((stat) => (
          <div key={stat.label} className="px-4 py-3 border-b sm:border-b-0 sm:border-r last:border-r-0 border-gray-100">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>
    ) : null}

    <div className="overflow-x-auto">{children}</div>
    {rows.length === 0 ? <div className="p-8 text-center text-sm text-gray-500">{emptyMessage}</div> : null}
  </div>
);

const SearchBox = ({ value, onChange, placeholder = 'Search report...' }) => (
  <label className="relative block w-full sm:w-72">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
    />
  </label>
);

const BillingReports = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { invoices, paymentAdvice, billingVerticalFilter } = useBilling();
  const pathSuffix = location.pathname.replace(/^\/app\/billing\/reports\/?/, '') || REPORT_TABS[0].id;
  const pathTab = pathSuffix.split('/')[0] || REPORT_TABS[0].id;
  const [activeReport, setActiveReport] = useState(REPORT_TAB_IDS.includes(pathTab) ? pathTab : REPORT_TABS[0].id);
  const [filterClient, setFilterClient] = useState('');
  const [filterOC, setFilterOC] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [delayRemarks, setDelayRemarks] = useState(loadDelayRemarks);
  const [delayRemarkDrafts, setDelayRemarkDrafts] = useState(loadDelayRemarks);
  const [selectedDelayRow, setSelectedDelayRow] = useState(null);

  const verticalNotSelected = !billingVerticalFilter;

  useEffect(() => {
    const suffix = location.pathname.replace(/^\/app\/billing\/reports\/?/, '') || REPORT_TABS[0].id;
    const nextTab = suffix.split('/')[0] || REPORT_TABS[0].id;
    if (REPORT_TAB_IDS.includes(nextTab)) setActiveReport(nextTab);
  }, [location.pathname]);

  const clients = useMemo(() => {
    const s = new Set(invoices.map((i) => i.clientLegalName || i.client_name).filter(Boolean));
    return Array.from(s).sort();
  }, [invoices]);

  const ocNumbers = useMemo(() => {
    const s = new Set(invoices.map((i) => i.ocNumber).filter(Boolean));
    return Array.from(s).sort();
  }, [invoices]);

  const outstandingDebtors = useMemo(() => {
    let list = invoices.filter((inv) => (inv.pendingAmount ?? 0) > 0);
    if (filterClient) list = list.filter((i) => (i.clientLegalName || i.client_name) === filterClient);
    if (filterOC) list = list.filter((i) => i.ocNumber === filterOC);
    return list.sort((a, b) => (Number(b.pendingAmount) || 0) - (Number(a.pendingAmount) || 0));
  }, [invoices, filterClient, filterOC]);

  const gapReport = useMemo(() => {
    return invoices
      .filter((inv) => inv.paymentStatus === true && (inv.paStatus || 'Pending') !== 'Received')
      .sort((a, b) => String(getInvoiceDate(b)).localeCompare(String(getInvoiceDate(a))));
  }, [invoices]);

  const deductionAnalysis = useMemo(() => {
    const list = [];
    Object.entries(paymentAdvice || {}).forEach(([invoiceId, pa]) => {
      const inv = invoices.find((i) => String(i.id) === String(invoiceId));
      if (!pa.deductionRemarks && !pa.penaltyDeductionAmount) return;
      list.push({
        invoiceId,
        invoiceNumber: inv?.taxInvoiceNumber || inv?.bill_number,
        siteId: inv?.siteId,
        ocNumber: inv?.ocNumber,
        client: inv?.clientLegalName || inv?.client_name,
        paReceivedDate: pa.paReceivedDate,
        remarks: pa.deductionRemarks || '–',
        amount: pa.penaltyDeductionAmount ?? 0,
      });
    });
    return list.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  }, [invoices, paymentAdvice]);

  const lessBilledSites = useMemo(() => {
    const bySite = {};
    invoices.forEach((inv) => {
      const key = inv.siteId || inv.ocNumber;
      if (!key) return;
      if (!bySite[key]) {
        bySite[key] = {
          siteId: inv.siteId,
          ocNumber: inv.ocNumber,
          client: inv.clientLegalName || inv.client_name,
          totalExpected: 0,
          totalBilled: 0,
          lessBilled: 0,
          invoiceCount: 0,
        };
      }
      bySite[key].totalExpected += Number(inv.expectedPOAmount ?? 0) || 0;
      bySite[key].totalBilled += getInvoiceAmount(inv);
      bySite[key].invoiceCount += 1;
    });
    return Object.values(bySite)
      .map((s) => ({ ...s, lessBilled: s.totalExpected - s.totalBilled }))
      .filter((s) => s.lessBilled > 0)
      .sort((a, b) => b.lessBilled - a.lessBilled);
  }, [invoices]);

  const billingDelay = useMemo(() => {
    return invoices
      .map((inv) => {
        const invoiceDate = getInvoiceDate(inv);
        const servicePeriodFrom = getServicePeriodFrom(inv);
        const invoiceDay = startOfDay(invoiceDate);
        const serviceFromDay = startOfDay(servicePeriodFrom);
        const rawDifference = invoiceDay && serviceFromDay ? Math.abs(daysBetween(serviceFromDay, invoiceDay)) : 0;
        return {
          id: inv.id || getInvoiceNumber(inv),
          ocNumber: inv.ocNumber,
          invoiceNumber: getInvoiceNumber(inv),
          client: getClientName(inv),
          invoiceDate,
          servicePeriod: formatServicePeriod(inv),
          servicePeriodFrom,
          daysDelayed: rawDifference,
          remark: delayRemarks[String(inv.id || getInvoiceNumber(inv))] || '',
        };
      })
      .filter((row) => row.invoiceDate && row.servicePeriodFrom && row.daysDelayed > 0)
      .sort((a, b) => b.daysDelayed - a.daysDelayed);
  }, [invoices, delayRemarks]);

  const searchMatches = useCallback((values) => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return true;
    return values.some((value) => String(value ?? '').toLowerCase().includes(q));
  }, [reportSearch]);

  const filteredOutstandingDebtors = useMemo(
    () =>
      outstandingDebtors.filter((inv) =>
        searchMatches([getInvoiceNumber(inv), inv.siteId, inv.ocNumber, getClientName(inv), inv.poWoNumber])
      ),
    [outstandingDebtors, searchMatches]
  );

  const filteredGapReport = useMemo(
    () => gapReport.filter((inv) => searchMatches([getInvoiceNumber(inv), inv.siteId, inv.ocNumber, getClientName(inv)])),
    [gapReport, searchMatches]
  );

  const filteredDeductionAnalysis = useMemo(
    () => deductionAnalysis.filter((row) => searchMatches([row.invoiceNumber, row.siteId, row.ocNumber, row.client, row.remarks])),
    [deductionAnalysis, searchMatches]
  );

  const filteredLessBilledSites = useMemo(
    () => lessBilledSites.filter((row) => searchMatches([row.siteId, row.ocNumber, row.client])),
    [lessBilledSites, searchMatches]
  );

  const filteredBillingDelay = useMemo(
    () => billingDelay.filter((row) => searchMatches([row.ocNumber, row.invoiceNumber, row.client, row.servicePeriod, row.remark])),
    [billingDelay, searchMatches]
  );

  const activeTabMeta = REPORT_TABS.find((tab) => tab.id === activeReport) || REPORT_TABS[0];

  const handleReportChange = (tabId) => {
    setActiveReport(tabId);
    setReportSearch('');
    if (tabId === REPORT_TABS[0].id) navigate(BASE_REPORT_PATH);
    else navigate(`${BASE_REPORT_PATH}/${tabId}`);
  };

  const debtorStats = [
    { label: 'Invoices', value: filteredOutstandingDebtors.length },
    { label: 'Pending Amount', value: money(filteredOutstandingDebtors.reduce((sum, inv) => sum + (Number(inv.pendingAmount) || 0), 0)) },
    { label: 'Clients', value: new Set(filteredOutstandingDebtors.map(getClientName)).size },
  ];

  const gapStats = [
    { label: 'Gap Rows', value: filteredGapReport.length },
    { label: 'Invoice Value', value: money(filteredGapReport.reduce((sum, inv) => sum + getInvoiceAmount(inv), 0)) },
    { label: 'Clients', value: new Set(filteredGapReport.map(getClientName)).size },
  ];

  const deductionStats = [
    { label: 'Deduction Rows', value: filteredDeductionAnalysis.length },
    { label: 'Total Deduction', value: money(filteredDeductionAnalysis.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)) },
    { label: 'Sites', value: new Set(filteredDeductionAnalysis.map((row) => row.siteId).filter(Boolean)).size },
  ];

  const lessBilledStats = [
    { label: 'Sites', value: filteredLessBilledSites.length },
    { label: 'Less Billed Value', value: money(filteredLessBilledSites.reduce((sum, row) => sum + (Number(row.lessBilled) || 0), 0)) },
    { label: 'Invoices', value: filteredLessBilledSites.reduce((sum, row) => sum + (Number(row.invoiceCount) || 0), 0) },
  ];

  const delayStats = [
    { label: 'Delayed Invoices', value: filteredBillingDelay.length },
    { label: 'Max Delay', value: `${Math.max(0, ...filteredBillingDelay.map((row) => row.daysDelayed || 0))} days` },
    { label: 'With Remark', value: filteredBillingDelay.filter((row) => row.remark).length },
  ];

  const handleDelayRemarkDraft = (rowId, value) => {
    setDelayRemarkDrafts((prev) => ({ ...prev, [rowId]: value }));
  };

  const handleOpenDelayRemark = (row) => {
    setDelayRemarkDrafts((prev) => ({ ...prev, [row.id]: prev[row.id] ?? row.remark ?? '' }));
    setSelectedDelayRow(row);
  };

  const handleSaveDelayRemark = (rowId) => {
    const next = { ...delayRemarks, [rowId]: (delayRemarkDrafts[rowId] || '').trim() };
    if (!next[rowId]) delete next[rowId];
    setDelayRemarks(next);
    setDelayRemarkDrafts((prev) => ({ ...prev, [rowId]: next[rowId] || '' }));
    setSelectedDelayRow(null);
    try {
      window.localStorage.setItem(BILLING_DELAY_REMARKS_KEY, JSON.stringify(next));
    } catch {
      /* ignore localStorage write failure */
    }
  };

  const commonActions = (
    <SearchBox
      value={reportSearch}
      onChange={setReportSearch}
      placeholder={`Search ${activeTabMeta.shortLabel.toLowerCase()}...`}
    />
  );

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-5">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Select a vertical to view reports</p>
          <p className="text-sm mt-1">Pick a vertical above to load debtor, PA and variance reports.</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-4 rounded-2xl border border-red-100 bg-gradient-to-r from-red-50/80 via-white to-slate-50 p-4 shadow-sm sm:p-5">
        <div className="flex items-center space-x-3">
        <div className="bg-purple-100 p-3 rounded-lg shrink-0">
          <BarChart3 className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Report Center</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeReport === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleReportChange(tab.id)}
                className={[
                  'flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition-all',
                  active
                    ? 'border-red-200 bg-white text-red-700 shadow-sm ring-2 ring-red-100'
                    : 'border-slate-200 bg-white/70 text-slate-700 hover:border-red-100 hover:bg-white',
                ].join(' ')}
              >
                <Icon className={active ? 'h-5 w-5 text-red-600' : 'h-5 w-5 text-slate-500'} />
                <span className="text-sm font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeReport === 'outstanding-debtors' ? (
        <ReportShell
          icon={Users}
          title="Outstanding Debtors"
          description="Pending receivable invoice list with client and OC filters."
          rows={filteredOutstandingDebtors}
          stats={debtorStats}
          actions={
            <div className="flex flex-wrap gap-2">
              <SearchBox value={reportSearch} onChange={setReportSearch} placeholder="Search debtor list..." />
              <select
                value={filterClient}
                onChange={(e) => setFilterClient(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={filterOC}
                onChange={(e) => setFilterOC(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">All OC numbers</option>
                {ocNumbers.map((oc) => (
                  <option key={oc} value={oc}>{oc}</option>
                ))}
              </select>
            </div>
          }
          emptyMessage="No outstanding debtors found for the selected filters."
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site / OC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoice Value</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pending Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PA / Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredOutstandingDebtors.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{getInvoiceNumber(inv)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(getInvoiceDate(inv))}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.siteId || '–'} · {inv.ocNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getClientName(inv)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">{money(getInvoiceAmount(inv))}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-700 tabular-nums">{money(inv.pendingAmount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.paStatus || 'Pending'} / {inv.paymentStatus ? 'Paid' : 'Unpaid'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportShell>
      ) : null}

      {activeReport === 'gap-report' ? (
        <ReportShell
          icon={AlertCircle}
          title="Gap Report"
          description="Invoices where Payment is Yes, but Payment Advice is still not received."
          rows={filteredGapReport}
          stats={gapStats}
          actions={commonActions}
          emptyMessage="No gap rows found. All paid invoices have PA or are not marked paid."
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site / OC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoice Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PA Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredGapReport.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{getInvoiceNumber(inv)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(getInvoiceDate(inv))}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.siteId || '–'} · {inv.ocNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getClientName(inv)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700 tabular-nums">{money(getInvoiceAmount(inv))}</td>
                  <td className="px-4 py-3 text-sm font-medium text-amber-700">{inv.paStatus || 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportShell>
      ) : null}

      {activeReport === 'deduction-analysis' ? (
        <ReportShell
          icon={FileText}
          title="Deduction Analysis"
          description="Penalty and deduction remarks captured from Manage PA."
          rows={filteredDeductionAnalysis}
          stats={deductionStats}
          actions={commonActions}
          emptyMessage="No deduction entries yet. Use Manage PA to add penalty or deduction remarks."
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PA Received</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site / OC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deduction</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDeductionAnalysis.map((d, idx) => (
                <tr key={`${d.invoiceId}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.invoiceNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(d.paReceivedDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.siteId || '–'} · {d.ocNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.client || '–'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-amber-700 tabular-nums">{money(d.amount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 min-w-[240px]">{d.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportShell>
      ) : null}

      {activeReport === 'less-billed-sites' ? (
        <ReportShell
          icon={TrendingDown}
          title="Less Billed Sites"
          description="Grouped site and OC view where billed amount is lower than expected amount."
          rows={filteredLessBilledSites}
          stats={lessBilledStats}
          actions={commonActions}
          emptyMessage="No less billed sites found for the selected vertical."
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site / OC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expected</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Billed</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Less Billed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLessBilledSites.map((s, idx) => (
                <tr key={`${s.siteId || s.ocNumber}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.siteId || '–'} · {s.ocNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.client || '–'}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">{s.invoiceCount}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">{money(s.totalExpected)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">{money(s.totalBilled)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-700 tabular-nums">{money(s.lessBilled)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportShell>
      ) : null}

      {activeReport === 'billing-delay' ? (
        <ReportShell
          icon={Clock}
          title="Billing Delay"
          description="Invoice-level delay based on the difference between Invoice Date and Service Period From."
          rows={filteredBillingDelay}
          stats={delayStats}
          actions={commonActions}
          emptyMessage="No billing delay rows found. Invoice Date and Service Period From are matching for this vertical."
        >
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OC Number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice No</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service Period</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Delay</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remark</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredBillingDelay.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.ocNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{row.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{row.client}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(row.invoiceDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{row.servicePeriod}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-700 tabular-nums">
                    {formatDelayDuration(row.invoiceDate, row.servicePeriodFrom, row.daysDelayed)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px]" title={row.remark || ''}>
                    {previewRemark(row.remark)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <button
                      type="button"
                      onClick={() => handleOpenDelayRemark(row)}
                      className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100"
                      title={row.remark ? 'Edit delay remark' : 'Add delay remark'}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportShell>
      ) : null}

      {selectedDelayRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Billing Delay Remark</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedDelayRow.invoiceNumber} · {selectedDelayRow.ocNumber || 'No OC'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDelayRow(null)}
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close remark popup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">Reason for delay</label>
              <textarea
                value={delayRemarkDrafts[selectedDelayRow.id] ?? selectedDelayRow.remark ?? ''}
                onChange={(e) => handleDelayRemarkDraft(selectedDelayRow.id, e.target.value)}
                rows={4}
                placeholder="Enter delay reason..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setSelectedDelayRow(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveDelayRemark(selectedDelayRow.id)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Save Remark
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BillingReports;
