import React, { useState } from 'react';
import { useBilling } from '../../contexts/BillingContext';

const ManagePAModal = ({ invoiceId, invoice, onClose }) => {
  const { paymentAdvice, setPaymentAdvice, setInvoices } = useBilling();
  const pa = paymentAdvice[invoiceId] || {};
  const [paReceivedDate, setPaReceivedDate] = useState(pa.paReceivedDate || '');
  const [paFile, setPaFile] = useState(pa.paFileUrl ? [pa.paFileUrl] : []);
  const [penaltyDeductionAmount, setPenaltyDeductionAmount] = useState(pa.penaltyDeductionAmount ?? '');
  const [deductionRemarks, setDeductionRemarks] = useState(pa.deductionRemarks || '');

  const handleSave = () => {
    const fileUrl = paFile[0] || (pa.paFileUrl || '');
    setPaymentAdvice((prev) => ({
      ...prev,
      [invoiceId]: {
        paReceivedDate,
        paFileUrl: fileUrl,
        penaltyDeductionAmount: Number(penaltyDeductionAmount) || 0,
        deductionRemarks,
      },
    }));
    const deduction = Number(penaltyDeductionAmount) || 0;
    const currentPending = invoice?.pendingAmount ?? invoice?.calculatedInvoiceAmount ?? 0;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              paStatus: 'Received',
              pendingAmount: Math.max(0, currentPending - deduction),
            }
          : inv
      )
    );
    onClose();
  };

  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage PA – Deductions</h3>
        <p className="text-sm text-gray-500 mb-4">Invoice: <strong>{invoice.taxInvoiceNumber || invoice.bill_number}</strong>. Enter PA details and any penalty/deduction. Pending amount will be reduced by the deduction.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PA Received Date</label>
            <input
              type="date"
              value={paReceivedDate}
              onChange={(e) => setPaReceivedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PA File Upload (PDF)</label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPaFile(e.target.files?.length ? [URL.createObjectURL(e.target.files[0])] : [])}
              className="w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Penalty / Deduction Amount (₹)</label>
            <input
              type="number"
              min={0}
              value={penaltyDeductionAmount}
              onChange={(e) => setPenaltyDeductionAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deduction Remarks</label>
            <textarea
              value={deductionRemarks}
              onChange={(e) => setDeductionRemarks(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              rows={3}
              placeholder="e.g. Short duty, Fine for no uniform"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-sm">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagePAModal;
