import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const PenaltyLogs = () => {
  const { invoices, paymentAdvice } = useBilling();

  const logs = useMemo(() => {
    const list = [];
    Object.entries(paymentAdvice || {}).forEach(([invoiceId, pa]) => {
      const inv = invoices.find((i) => String(i.id) === String(invoiceId));
      if (!pa.penaltyDeductionAmount && !pa.deductionRemarks) return;
      list.push({
        invoiceId,
        taxInvoiceNumber: inv?.taxInvoiceNumber || inv?.bill_number,
        ocNumber: inv?.ocNumber,
        client: inv?.clientLegalName || inv?.client_name,
        paReceivedDate: pa.paReceivedDate,
        penaltyDeductionAmount: pa.penaltyDeductionAmount ?? 0,
        deductionRemarks: pa.deductionRemarks || '–',
      });
    });
    return list.sort((a, b) => (b.paReceivedDate || '').localeCompare(a.paReceivedDate || ''));
  }, [invoices, paymentAdvice]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-amber-100 p-3 rounded-lg shrink-0">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Penalty Logs</h2>
          <p className="text-sm text-gray-600">Deductions and remarks from Manage PA – spot recurring site issues</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OC / Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PA Received Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Penalty / Deduction (₹)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deduction Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((log, idx) => (
                <tr key={`${log.invoiceId}-${idx}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{log.taxInvoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.ocNumber} – {log.client}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.paReceivedDate || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">₹{(log.penaltyDeductionAmount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{log.deductionRemarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length === 0 && (
          <div className="p-8 text-center text-gray-500">No penalty/deduction entries yet. Use Manage PA on an invoice to record deductions.</div>
        )}
      </div>
    </div>
  );
};

export default PenaltyLogs;
