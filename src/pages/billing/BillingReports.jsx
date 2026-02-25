import React, { useState, useMemo } from 'react';
import { BarChart3, Filter, History, AlertTriangle } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const BillingReports = () => {
  const { wopoList, bills, billingHistory } = useBilling();
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterSite, setFilterSite] = useState('');

  const sites = useMemo(() => {
    const s = new Set(wopoList.map((w) => w.client_name).filter(Boolean));
    return Array.from(s).sort();
  }, [wopoList]);

  const approvedBills = useMemo(() => bills.filter((b) => b.status === 'approved'), [bills]);

  const filteredBills = useMemo(() => {
    let list = approvedBills;
    if (filterYear) {
      list = list.filter((b) => b.created_at && b.created_at.startsWith(filterYear));
    }
    if (filterMonth) {
      const m = filterMonth.padStart(2, '0');
      list = list.filter((b) => b.created_at && b.created_at.slice(0, 7) === `${filterYear}-${m}`);
    }
    if (filterSite) {
      list = list.filter((b) => (b.client_name || b.site) === filterSite);
    }
    return list;
  }, [approvedBills, filterYear, filterMonth, filterSite]);

  const estimatedRevenue = useMemo(() => {
    let total = 0;
    wopoList.forEach((w) => {
      if (w.approval_status !== 'approved') return;
      if (filterSite && w.client_name !== filterSite) return;
      if (w.rates && typeof w.rates === 'string' && w.rates.match(/[\d,]+/)) {
        const n = parseFloat(w.rates.replace(/[^0-9.]/g, '')) || 0;
        total += n;
      }
    });
    return total;
  }, [wopoList, filterSite]);

  const actualBilled = useMemo(() => {
    let total = 0;
    filteredBills.forEach((b) => {
      (b.items || []).forEach((i) => {
        if (i.amount && typeof i.amount === 'string' && i.amount.match(/[\d,]+/)) {
          total += parseFloat(i.amount.replace(/[^0-9.]/g, '')) || 0;
        }
      });
    });
    return total;
  }, [filteredBills]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-purple-100 p-3 rounded-lg shrink-0">
            <BarChart3 className="w-6 h-6 text-purple-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">Billing Reports</h2>
            <p className="text-sm text-gray-600">Estimated vs Actual Billed, filters by Month, Year, Site. Billing History for cancelled bills.</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              {[2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All months</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={String(m)}>{new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site / Client</label>
            <select
              value={filterSite}
              onChange={(e) => setFilterSite(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Estimated vs Actual Billed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm font-medium text-gray-600">Estimated Revenue</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₹{estimatedRevenue.toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-500 mt-1">From approved WO/POs (filtered by site)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-sm font-medium text-gray-600">Actual Billed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₹{actualBilled.toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-500 mt-1">From approved bills (filtered by month/year/site)</p>
        </div>
      </div>

      {/* Billing History – cancelled bills (audit trail) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <History className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Billing History (cancelled/rejected bills)</h3>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-2">Cancelled bills are moved here for audit; they are not deleted.</p>
          {billingHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No cancelled bills in history.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {billingHistory.map((b) => (
                <li key={b.id} className="py-2 flex justify-between items-center text-sm">
                  <span className="text-gray-900">{b.bill_number} · {b.oc_number} · {b.client_name}</span>
                  <span className="text-gray-500">Cancelled {b.cancelled_at || b.created_at}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingReports;
