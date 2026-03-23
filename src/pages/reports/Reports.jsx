import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BillingProvider, useBilling } from '../../contexts/BillingContext';
import { BarChart3, Users, FileText } from 'lucide-react';

const TAB_IDS = ['outstanding', 'deduction-analysis'];

const OutstandingReport = () => {
  const { invoices } = useBilling();
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-3">
        <Users className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-900">Outstanding Debtors</h3>
        <div className="flex flex-wrap gap-2 ml-auto">
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
            <option value="">All clients</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterOC} onChange={(e) => setFilterOC(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm">
            <option value="">All OC numbers</option>
            {ocNumbers.map((oc) => <option key={oc} value={oc}>{oc}</option>)}
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
      {outstandingDebtors.length === 0 && <div className="p-6 text-center text-gray-500 text-sm">No outstanding debtors. Filter by Client or OC.</div>}
    </div>
  );
};

const DeductionAnalysisReport = () => {
  const { invoices, paymentAdvice } = useBilling();
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

  return (
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
  );
};

const ReportsInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = location.pathname.replace(/^\/app\/reports\/?/, '') || 'outstanding';
  const [activeTab, setActiveTab] = useState(TAB_IDS.includes(pathTab) ? pathTab : 'outstanding');

  useEffect(() => {
    const pathTab = location.pathname.replace(/^\/app\/reports\/?/, '') || 'outstanding';
    if (TAB_IDS.includes(pathTab)) setActiveTab(pathTab);
  }, [location.pathname]);

  const tabs = [
    { id: 'outstanding', label: 'Outstanding' },
    { id: 'deduction-analysis', label: 'Deduction Analysis' },
  ];

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'outstanding') navigate('/app/reports');
    else navigate(`/app/reports/${tabId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">Outstanding Debtors & Deduction Analysis</p>
        </div>
        <div className="px-6 flex gap-2 border-t border-gray-100">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6">
        {activeTab === 'outstanding' && <OutstandingReport />}
        {activeTab === 'deduction-analysis' && <DeductionAnalysisReport />}
      </div>
    </div>
  );
};

const Reports = () => (
  <BillingProvider>
    <ReportsInner />
  </BillingProvider>
);

export default Reports;
