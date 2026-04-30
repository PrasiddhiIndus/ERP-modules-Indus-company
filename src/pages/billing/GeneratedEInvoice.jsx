import React, { useEffect, useMemo, useState } from 'react';
import { FileDigit, Search, Eye, Download, Trash2 } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { downloadTaxInvoicePdf, getTaxInvoicePdfBlobUrl } from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount } from '../../utils/invoiceRound';

const PAGE_SIZE = 10;

function formatDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleString('en-IN');
  } catch {
    return d;
  }
}

function getRealIrn(inv) {
  const irn = inv?.e_invoice_irn || inv?.eInvoiceIrn || '';
  return String(irn).toUpperCase().startsWith('MOCK-IRN-') ? '' : irn;
}

const GeneratedEInvoice = () => {
  const { invoices, setInvoices, billingVerticalFilter } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const verticalNotSelected = !billingVerticalFilter;

  const eInvoices = useMemo(() => {
    const list = invoices.filter((inv) => getRealIrn(inv));
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
        (getRealIrn(inv) || '')
          .toLowerCase()
          .includes(s)
    );
  }, [invoices, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, eInvoices.length]);

  const totalPages = Math.max(1, Math.ceil(eInvoices.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedEInvoices = eInvoices.slice(start, start + PAGE_SIZE);
  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const [viewId, setViewId] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const selectedInv = viewId ? invoices.find((i) => i.id === viewId) : null;

  const handleDeleteGeneratedEInvoice = (inv) => {
    const ok = window.confirm(
      `Delete generated e-invoice details for ${inv.taxInvoiceNumber || inv.bill_number || 'this invoice'}?`
    );
    if (!ok) return;
    setInvoices((prev) =>
      prev.map((row) =>
        String(row.id) === String(inv.id)
          ? {
              ...row,
              e_invoice_irn: null,
              e_invoice_ack_no: null,
              e_invoice_ack_dt: null,
              e_invoice_signed_qr: null,
            }
          : row
      )
    );
    if (String(viewId || '') === String(inv.id)) setViewId(null);
  };

  useEffect(() => {
    let cancelled = false;
    let currentUrl = null;

    const buildPdfPreview = async () => {
      if (!selectedInv) {
        setPdfPreviewUrl(null);
        return;
      }
      setPdfLoading(true);
      try {
        const nextUrl = await getTaxInvoicePdfBlobUrl(selectedInv, { includeEinvoiceHeader: true });
        if (cancelled) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        currentUrl = nextUrl;
        setPdfPreviewUrl(nextUrl);
      } catch {
        if (!cancelled) setPdfPreviewUrl(null);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    };

    buildPdfPreview();

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [selectedInv]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Select a vertical to view generated e-invoices</p>
          <p className="text-sm mt-1">Pick a vertical above to load IRN generated invoices.</p>
        </div>
      ) : null}
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
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-red-500/35 focus:border-red-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-3 pb-3">
          <div className="rounded-xl border border-slate-200/90 overflow-hidden bg-gradient-to-br from-red-50/40 via-white to-amber-50/30 ring-1 ring-slate-900/5">
            <div className="p-2">
              <div className="bg-white rounded-lg overflow-hidden">
                <div className="w-full max-w-full min-w-0 overflow-x-auto">
                  <table className="w-full min-w-0 max-w-full table-fixed border-collapse">
                    <thead>
                      <tr>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[14%]">Tax Invoice #</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[16%]">OC / Site</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-red-100/60 w-[18%]">Client</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[10%]">Amount</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-red-100/60 w-[22%]">IRN</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[14%]">Ack No / Date</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[6%]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {paginatedEInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50 align-top">
                          <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono truncate" title={inv.taxInvoiceNumber || inv.bill_number || ''}>
                            {inv.taxInvoiceNumber || inv.bill_number}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={`${inv.ocNumber || ''} / ${inv.siteId || '–'}`}>
                            {inv.ocNumber} / {inv.siteId || '–'}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 truncate" title={inv.clientLegalName || inv.client_name || ''}>
                            {inv.clientLegalName || inv.client_name}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center tabular-nums">
                            ₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono text-green-700 truncate" title={getRealIrn(inv) || ''}>
                            {getRealIrn(inv)}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center">
                            <span className="font-mono">{inv.e_invoice_ack_no || '–'}</span>
                            <span className="text-gray-400"> / </span>
                            <span className="whitespace-nowrap">{formatDate(inv.e_invoice_ack_dt)}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
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
                                onClick={() => void downloadTaxInvoicePdf(inv, { includeEinvoiceHeader: true })}
                                title="Download Tax Invoice PDF"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteGeneratedEInvoice(inv)}
                                title="Delete generated e-invoice data"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {eInvoices.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No generated e-invoices yet. Create an invoice in Create Invoice or
            Manage Invoices, then use the Generate E-Invoice action to add it
            here.
          </div>
        )}

        {eInvoices.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{start + 1}</span>–
              <span className="font-medium">{Math.min(start + PAGE_SIZE, eInvoices.length)}</span> of{' '}
              <span className="font-medium">{eInvoices.length}</span> invoice{eInvoices.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-700">
                Page <span className="font-medium">{safePage}</span> of <span className="font-medium">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedInv && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              E-Invoice – {selectedInv.taxInvoiceNumber || selectedInv.bill_number}
            </h3>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm mb-3">
                <p><span className="text-gray-500">IRN:</span> <span className="font-mono text-green-700">{getRealIrn(selectedInv) || '–'}</span></p>
                <p><span className="text-gray-500">Ack No:</span> {selectedInv.e_invoice_ack_no || '–'}</p>
                <p><span className="text-gray-500">Ack Date:</span> {formatDate(selectedInv.e_invoice_ack_dt)}</p>
              </div>
              {pdfLoading ? (
                <div className="h-[70vh] rounded-lg border border-gray-200 bg-white grid place-items-center text-sm text-gray-500">
                  Preparing PDF preview...
                </div>
              ) : pdfPreviewUrl ? (
                <iframe
                  title={`E-Invoice PDF ${selectedInv.taxInvoiceNumber || selectedInv.bill_number || selectedInv.id}`}
                  src={pdfPreviewUrl}
                  className="w-full h-[70vh] rounded-lg border border-gray-200 bg-white"
                />
              ) : (
                <div className="h-[70vh] rounded-lg border border-gray-200 bg-white grid place-items-center text-sm text-gray-500">
                  PDF preview not available. Please use Download PDF.
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void downloadTaxInvoicePdf(selectedInv, { includeEinvoiceHeader: true })}
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
