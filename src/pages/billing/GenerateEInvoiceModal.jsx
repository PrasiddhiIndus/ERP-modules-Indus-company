import React, { useState } from 'react';
import { FileDigit, X } from 'lucide-react';

function getRealIrn(invoice) {
  const irn = invoice?.e_invoice_irn || invoice?.eInvoiceIrn || '';
  return String(irn).toUpperCase().startsWith('MOCK-IRN-') ? '' : irn;
}

/**
 * Modal opened from Manage Invoices when user clicks the Generate E-Invoice icon.
 * Placeholder for form structure (you can replace the form section later).
 * On Submit, calls onGenerate(invoice) then onClose – invoice will then appear in Generated E-Invoice tab.
 */
const GenerateEInvoiceModal = ({ invoice, onClose, onGenerate }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!invoice) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentIrn) {
      setError('E-Invoice is already generated for this invoice.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onGenerate(invoice);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to generate e-invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const invNum = invoice.taxInvoiceNumber || invoice.bill_number;
  const amount = invoice.calculatedInvoiceAmount ?? invoice.totalAmount ?? 0;
  const currentIrn = getRealIrn(invoice);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileDigit className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Generate E-Invoice</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
            <p className="font-medium text-gray-900">Invoice summary</p>
            <p><span className="text-gray-500">Invoice #:</span> {invNum}</p>
            <p><span className="text-gray-500">Client:</span> {invoice.clientLegalName || invoice.client_name}</p>
            <p><span className="text-gray-500">OC / Site:</span> {invoice.ocNumber} / {invoice.siteId || '–'}</p>
            <p><span className="text-gray-500">Amount:</span> ₹{amount.toLocaleString('en-IN')}</p>
            {currentIrn ? (
              <>
                <p><span className="text-gray-500">Current IRN:</span> <span className="font-mono text-green-700 break-all">{currentIrn}</span></p>
                <p><span className="text-gray-500">Ack No:</span> {invoice.e_invoice_ack_no || '–'}</p>
                <p><span className="text-gray-500">Ack Date:</span> {invoice.e_invoice_ack_dt || '–'}</p>
              </>
            ) : null}
          </div>

          {/* Placeholder: replace this block with your form structure when ready */}
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-4 text-sm text-gray-500">
            <p className="font-medium text-gray-700 mb-1">E-Invoice form</p>
            <p>Form fields (structure to be provided) can go here. Submit will generate IRN and add this invoice to Generated E-Invoice list.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-4 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !!currentIrn}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Generating…' : currentIrn ? 'Already Generated' : 'Generate E-Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GenerateEInvoiceModal;
