import React, { useState } from 'react';
import { FileDigit, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { generateEInvoice } from '../../services/eInvoiceApi';

const EInvoice = () => {
  const { bills, wopoList, setBills } = useBilling();
  const [generatingId, setGeneratingId] = useState(null);
  const [error, setError] = useState(null);

  const approvedBills = bills.filter((b) => b.status === 'approved');

  const handleGenerate = async (bill) => {
    setError(null);
    setGeneratingId(bill.id);
    try {
      const wopo = wopoList.find((w) => w.id === bill.oc_id);
      const result = await generateEInvoice(bill, wopo);
      if (result && result.irn) {
        setBills((prev) =>
          prev.map((b) =>
            b.id === bill.id
              ? {
                  ...b,
                  e_invoice_irn: result.irn,
                  e_invoice_ack_dt: result.ackDt,
                  e_invoice_ack_no: result.ackNo,
                  e_invoice_signed_qr: result.signedQR,
                }
              : b
          )
        );
      }
    } catch (e) {
      setError(e.message || 'Failed to generate e-invoice');
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-green-100 p-3 rounded-lg shrink-0">
            <FileDigit className="w-6 h-6 text-green-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">E-Invoice</h2>
            <p className="text-sm text-gray-600">Generate and manage e-invoices via Government portal API</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-sm text-gray-600 mb-4">
          Invoices, E-Invoices, and Credit Notes use the <strong>exact same layout</strong>. E-invoice is created by calling the <strong>IRP API</strong> (Generate IRN). Configure your backend and <code className="text-xs bg-gray-100 px-1 rounded">VITE_EINVOICE_API_URL</code> for live integration; see <code className="text-xs bg-gray-100 px-1 rounded">docs/EINVOICE_API_INTEGRATION.md</code>.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Approved bills – Generate E-Invoice</h3>
          <p className="text-sm text-gray-500">Select a bill to generate IRN via API (same layout as invoice).</p>
        </div>
        <div className="overflow-x-auto">
          {approvedBills.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileDigit className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">No approved bills</p>
              <p className="text-sm mt-1">Approve bills in Create Invoice first.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {approvedBills.map((bill) => (
                <li key={bill.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-gray-900">{bill.bill_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{bill.oc_number}</span>
                    <span className="text-gray-500 mx-2">·</span>
                    <span className="text-sm text-gray-600">{bill.client_name}</span>
                    {bill.e_invoice_irn && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                        <CheckCircle className="w-3.5 h-3.5" />
                        IRN: {bill.e_invoice_irn}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {bill.e_invoice_irn ? (
                      <span className="text-sm text-gray-500">
                        Ack: {bill.e_invoice_ack_dt || '–'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={generatingId === bill.id}
                        onClick={() => handleGenerate(bill)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {generatingId === bill.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileDigit className="w-4 h-4" />
                        )}
                        {generatingId === bill.id ? 'Generating…' : 'Generate E-Invoice'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <h4 className="font-medium text-gray-900 mb-2">How E-Invoice API integration works</h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>Frontend calls your backend (e.g. <code>POST /api/billing/e-invoice/generate</code> with bill id).</li>
          <li>Backend maps bill to e-invoice JSON (same layout), authenticates with IRP, calls Generate IRN API.</li>
          <li>Backend stores IRN/QR and returns to frontend; we save IRN on the bill.</li>
          <li>For production: set <code>VITE_EINVOICE_API_URL</code> to your backend base URL and implement the generate/cancel endpoints.</li>
        </ol>
      </div>
    </div>
  );
};

export default EInvoice;
