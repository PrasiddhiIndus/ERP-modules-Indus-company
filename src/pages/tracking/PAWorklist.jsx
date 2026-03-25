import React, { useState, useMemo } from 'react';
import { FileCheck, Search, AlertCircle, DollarSign } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import ManagePAModal from '../billing/ManagePAModal';

const PAWorklist = () => {
  const { invoices, setInvoices, paymentAdvice, setPaymentAdvice } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [managePAInvoiceId, setManagePAInvoiceId] = useState(null);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const s = searchTerm.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.taxInvoiceNumber?.toLowerCase().includes(s) ||
        inv.ocNumber?.toLowerCase().includes(s) ||
        (inv.clientLegalName || inv.client_name)?.toLowerCase().includes(s)
    );
  }, [invoices, searchTerm]);

  const rows = useMemo(() => {
    return filteredInvoices.map((inv) => {
      const paStatus = inv.paStatus || 'Pending';
      const paymentStatus = !!inv.paymentStatus;
      const followUpDocument = paymentStatus && paStatus !== 'Received';
      const followUpMoney = paStatus === 'Received' && !paymentStatus;
      return {
        ...inv,
        paStatus,
        paymentStatus,
        followUpDocument,
        followUpMoney,
      };
    });
  }, [filteredInvoices]);

  const togglePayment = (inv) => {
    setInvoices((prev) =>
      prev.map((i) => (i.id === inv.id ? { ...i, paymentStatus: !i.paymentStatus } : i))
    );
  };

  const selectedInv = managePAInvoiceId ? invoices.find((i) => i.id === managePAInvoiceId) : null;

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-indigo-100 p-3 rounded-lg shrink-0">
          <FileCheck className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">PA Tracking Worklist</h2>
          <p className="text-sm text-gray-600">PA Status: Pending | Received. Payment: Yes/No. Follow-up for Document / Follow-up for Money</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by invoice, OC, client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Site / OC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PA Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flag</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.taxInvoiceNumber || inv.bill_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.siteId} / {inv.ocNumber}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 text-xs rounded-full ${inv.paStatus === 'Received' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {inv.paStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      type="button"
                      onClick={() => togglePayment(inv)}
                      className={`px-2 py-1 text-xs font-medium rounded ${inv.paymentStatus ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {inv.paymentStatus ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {inv.followUpDocument && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-100 text-red-800">
                        <AlertCircle className="w-3 h-3" /> Follow-up for Document
                      </span>
                    )}
                    {inv.followUpMoney && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-amber-100 text-amber-800">
                        <DollarSign className="w-3 h-3" /> Follow-up for Money
                      </span>
                    )}
                    {!inv.followUpDocument && !inv.followUpMoney && <span className="text-gray-400">–</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setManagePAInvoiceId(inv.id)}
                      className="text-sm text-indigo-600 hover:underline font-medium"
                    >
                      Manage PA
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="p-8 text-center text-gray-500">No invoices. Generate invoices in Billing first.</div>
        )}
      </div>

      {managePAInvoiceId && (
        <ManagePAModal
          invoiceId={managePAInvoiceId}
          invoice={invoices.find((i) => i.id === managePAInvoiceId)}
          onClose={() => setManagePAInvoiceId(null)}
        />
      )}
    </div>
  );
};

export default PAWorklist;
