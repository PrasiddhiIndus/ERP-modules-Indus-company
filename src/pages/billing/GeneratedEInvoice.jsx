import React, { useMemo, useState } from 'react';
import { FileDigit, Search, Eye, Download } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { downloadTaxInvoicePdf } from '../../utils/taxInvoicePdf';

function formatDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleString('en-IN');
  } catch {
    return d;
  }
}

const GeneratedEInvoice = () => {
  const { invoices } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');

  const eInvoices = useMemo(() => {
    const list = invoices.filter(
      (inv) => inv.e_invoice_irn || inv.eInvoiceIrn
    );
    if (!searchTerm.trim()) return list;
    const s = searchTerm.toLowerCase();
    return list.filter(
      (inv) =>
        (inv.taxInvoiceNumber || inv.bill_number || '')
          .toLowerCase()
          .includes(s) ||
        (inv.ocNumber || '').toLowerCase().includes(s) ||
        (inv.clientLegalName || inv.client_name || '')
          .toLowerCase()
          .includes(s) ||
        (inv.e_invoice_irn || inv.eInvoiceIrn || '')
          .toLowerCase()
          .includes(s)
    );
  }, [invoices, searchTerm]);

  const [viewId, setViewId] = useState(null);
  const selectedInv = viewId ? invoices.find((i) => i.id === viewId) : null;

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-green-100 p-3 rounded-lg shrink-0">
          <FileDigit className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Generated E-Invoice</h2>
          <p className="text-sm text-gray-600">
            List of all invoices for which e-invoice (IRN) has been generated. Data from Create Invoice / Manage Invoices.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by invoice #, OC, client, IRN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tax Invoice #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  OC / Site
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  IRN
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Ack No / Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {eInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {inv.taxInvoiceNumber || inv.bill_number}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {inv.ocNumber} / {inv.siteId || '–'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {inv.clientLegalName || inv.client_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    ₹
                    {(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString(
                      'en-IN'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-green-700">
                    {inv.e_invoice_irn || inv.eInvoiceIrn}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {inv.e_invoice_ack_no || '–'} / {formatDate(inv.e_invoice_ack_dt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewId(inv.id)}
                        title="View"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTaxInvoicePdf(inv, { includeEinvoiceHeader: true })}
                        title="Download Tax Invoice PDF"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eInvoices.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No generated e-invoices yet. Create an invoice in Create Invoice or
            Manage Invoices, then use the Generate E-Invoice action to add it
            here.
          </div>
        )}
      </div>

      {selectedInv && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              E-Invoice – {selectedInv.taxInvoiceNumber || selectedInv.bill_number}
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p><span className="text-gray-500">Client:</span> {selectedInv.clientLegalName || selectedInv.client_name}</p>
                <p><span className="text-gray-500">OC / Site:</span> {selectedInv.ocNumber} / {selectedInv.siteId || '–'}</p>
                <p><span className="text-gray-500">Invoice Date:</span> {formatDate(selectedInv.invoiceDate || selectedInv.created_at)}</p>
                <p><span className="text-gray-500">Amount:</span> ₹{(selectedInv.calculatedInvoiceAmount ?? selectedInv.totalAmount ?? 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="space-y-2">
                <p><span className="text-gray-500">IRN:</span> <span className="font-mono text-green-700">{selectedInv.e_invoice_irn || selectedInv.eInvoiceIrn}</span></p>
                <p><span className="text-gray-500">Ack No:</span> {selectedInv.e_invoice_ack_no || '–'}</p>
                <p><span className="text-gray-500">Ack Date:</span> {formatDate(selectedInv.e_invoice_ack_dt)}</p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600">#</th>
                    <th className="px-3 py-2 text-left text-gray-600">Description</th>
                    <th className="px-3 py-2 text-left text-gray-600">HSN/SAC</th>
                    <th className="px-3 py-2 text-left text-gray-600">Qty</th>
                    <th className="px-3 py-2 text-left text-gray-600">Rate</th>
                    <th className="px-3 py-2 text-right text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(selectedInv.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{it.description || it.designation}</td>
                      <td className="px-3 py-2 text-gray-700">{it.hsnSac || selectedInv.hsnSac || '–'}</td>
                      <td className="px-3 py-2 text-gray-700">{it.quantity ?? 0}</td>
                      <td className="px-3 py-2 text-gray-700">₹{Number(it.rate || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-right font-medium">₹{Number(it.amount || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => downloadTaxInvoicePdf(selectedInv, { includeEinvoiceHeader: true })}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setViewId(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratedEInvoice;
