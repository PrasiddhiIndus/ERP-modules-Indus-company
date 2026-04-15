import React, { useState, useMemo } from 'react';
import { BarChart3, Filter, Users, AlertCircle, FileText, TrendingDown } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const BillingReports = () => {
  const { commercialPOs, invoices, paymentAdvice } = useBilling();
  const [filterClient, setFilterClient] = useState('');
  const [filterOC, setFilterOC] = useState('');

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
    return list;
  }, [invoices, filterClient, filterOC]);

  const gapReport = useMemo(() => {
    return invoices.filter((inv) => inv.paymentStatus === true && (inv.paStatus || 'Pending') !== 'Received');
  }, [invoices]);

  const deductionAnalysis = useMemo(() => {
    const list = [];
    Object.entries(paymentAdvice || {}).forEach(([invoiceId, pa]) => {
      const inv = invoices.find((i) => String(i.id) === String(invoiceId));
      if (!pa.deductionRemarks) return;
      list.push({
        invoiceNumber: inv?.taxInvoiceNumber || inv?.bill_number,
        siteId: inv?.siteId,
        client: inv?.clientLegalName || inv?.client_name,
        remarks: pa.deductionRemarks,
        amount: pa.penaltyDeductionAmount ?? 0,
      });
    });
    return list;
  }, [invoices, paymentAdvice]);

  const lessBilledSites = useMemo(() => {
    const bySite = {};
    invoices.forEach((inv) => {
      const key = inv.siteId || inv.ocNumber;
      if (!key) return;
      if (!bySite[key]) bySite[key] = { siteId: inv.siteId, ocNumber: inv.ocNumber, client: inv.clientLegalName || inv.client_name, totalExpected: 0, totalBilled: 0, lessBilled: 0 };
      bySite[key].totalExpected += inv.expectedPOAmount ?? 0;
      bySite[key].totalBilled += inv.calculatedInvoiceAmount ?? 0;
    });
    return Object.values(bySite)
      .map((s) => ({ ...s, lessBilled: s.totalExpected - s.totalBilled }))
      .filter((s) => s.lessBilled > 0)
      .sort((a, b) => b.lessBilled - a.lessBilled);
  }, [invoices]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-purple-100 p-3 rounded-lg shrink-0">
          <BarChart3 className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Report Center</h2>
          <p className="text-sm text-gray-600">Outstanding Debtors, Gap Report, Deduction Analysis, Less Billed sites</p>
        </div>
      </div>

      {/* Outstanding Debtors */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-3">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Outstanding Debtors</h3>
          <div className="flex flex-wrap gap-2 ml-auto">
            <select
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filterOC}
              onChange={(e) => setFilterOC(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All OC numbers</option>
              {ocNumbers.map((oc) => (
                <option key={oc} value={oc}>{oc}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client / OC</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pending Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {outstandingDebtors.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.taxInvoiceNumber || inv.bill_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.clientLegalName || inv.client_name} · {inv.ocNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">₹{(inv.pendingAmount ?? 0).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {outstandingDebtors.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">No outstanding debtors (filterable by Client or OC).</div>}
      </div>

      {/* Gap Report */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-red-50 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <h3 className="font-semibold text-gray-900">Gap Report</h3>
        </div>
        <p className="px-4 py-2 text-sm text-gray-600">Invoices where Payment = Yes but PA = Pending</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {gapReport.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.taxInvoiceNumber || inv.bill_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.siteId}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.clientLegalName || inv.client_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {gapReport.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">No gap: no invoices with payment received but PA missing.</div>}
      </div>

      {/* Deduction Analysis */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50 flex items-center gap-2">
          <FileText className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Deduction Analysis</h3>
        </div>
        <p className="px-4 py-2 text-sm text-gray-600">Remarks from PA pop-up – spot recurring site issues</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site / Client</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Deduction (₹)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deductionAnalysis.map((d, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.siteId} – {d.client}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">₹{(d.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{d.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deductionAnalysis.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">No deduction remarks yet. Use Manage PA to add.</div>}
      </div>

      {/* Less Billed sites */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-red-100/70 bg-gradient-to-r from-red-50/90 to-amber-50/40 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-red-600" />
          <h3 className="font-semibold text-gray-900">Less Billed Sites</h3>
        </div>
        <p className="px-4 py-2 text-sm text-gray-600">Sites where total billed &lt; expected (Less Billing)</p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Site / OC</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expected (₹)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Billed (₹)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Less Billed (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {lessBilledSites.map((s, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{s.siteId} · {s.ocNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.client}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">₹{(s.totalExpected || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">₹{(s.totalBilled || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm font-medium text-amber-700">₹{(s.lessBilled || 0).toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lessBilledSites.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">No less billed sites.</div>}
      </div>
    </div>
  );
};

export default BillingReports;
