import React, { useEffect, useMemo, useState } from 'react';
import { FileDigit, Search, Eye, Download } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { downloadTaxInvoicePdf, getTaxInvoicePdfBlobUrl } from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount } from '../../utils/invoiceRound';
import { findPoForInvoice } from '../../utils/billingPoInvoiceFields';

const PAGE_SIZE = 10;

function formatDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleString('en-IN');
  } catch {
    return d;
  }
}

function formatShortDate(d) {
  if (!d) return '–';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getRealIrn(inv) {
  const irn = inv?.e_invoice_irn || inv?.eInvoiceIrn || '';
  return String(irn).toUpperCase().startsWith('MOCK-IRN-') ? '' : irn;
}

const GeneratedEInvoice = () => {
  const { invoices, commercialPOs, billingVerticalFilter, billingPoBasisFilter } = useBilling();

  const getPoByInvoice = React.useCallback(
    (inv) => findPoForInvoice(inv, commercialPOs),
    [commercialPOs]
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'invoiceDate', direction: 'desc' });

  const verticalNotSelected = !billingVerticalFilter;
  const billingPoBasisLabel =
    billingPoBasisFilter === 'with_po'
      ? 'With PO only'
      : billingPoBasisFilter === 'without_po'
        ? 'Without PO only'
        : 'All — With PO & Without PO';

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

  const sortedEInvoices = useMemo(() => {
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...eInvoices].sort((a, b) => {
      const valueFor = (inv) => {
        switch (sortConfig.key) {
          case 'modified': return new Date(inv.updated_at || inv.updatedAt || inv.invoiceDate || inv.invoice_date || inv.created_at || 0).getTime() || 0;
          case 'created': return new Date(inv.created_at || inv.createdAt || inv.invoiceDate || inv.invoice_date || inv.updated_at || 0).getTime() || 0;
          case 'taxInvoice': return String(inv.taxInvoiceNumber || inv.bill_number || '').toLowerCase();
          case 'ocNumber': return String(inv.ocNumber || '').toLowerCase();
          case 'client': return String(inv.clientLegalName || inv.client_name || '').toLowerCase();
          case 'amount': return Number(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0);
          case 'irn': return String(getRealIrn(inv) || '').toLowerCase();
          case 'ack': return String(inv.e_invoice_ack_no || '').toLowerCase();
          case 'invoiceDate':
          default: return new Date(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt || 0).getTime() || 0;
        }
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      let result = 0;
      if (typeof av === 'number' && typeof bv === 'number') result = av - bv;
      else result = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) result = String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
      return result * dir;
    });
  }, [eInvoices, sortConfig]);

  const renderSortIndicator = (key) => {
    const active = sortConfig.key === key;
    const ascActive = active && sortConfig.direction === 'asc';
    const descActive = active && sortConfig.direction === 'desc';
    return (
      <span className="inline-flex items-center gap-0.5 ml-1 text-[10px] align-middle">
        <span className={ascActive ? 'text-emerald-400' : 'text-slate-300'}>▲</span>
        <span className={descActive ? 'text-rose-400' : 'text-slate-300'}>▼</span>
      </span>
    );
  };

  const toggleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortedEInvoices.length, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedEInvoices.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedEInvoices = sortedEInvoices.slice(start, start + PAGE_SIZE);
  const goToPage = (p) => setPage(Math.min(Math.max(1, p), totalPages));

  const [viewId, setViewId] = useState(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const selectedInv = viewId ? invoices.find((i) => i.id === viewId) : null;

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
        const nextUrl = await getTaxInvoicePdfBlobUrl(selectedInv, {
          includeEinvoiceHeader: true,
          po: getPoByInvoice(selectedInv),
        });
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
  }, [selectedInv, getPoByInvoice]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Pick a team first</p>
          <p className="text-sm mt-1">Choose the billing team above — then you’ll see bills that already have a GST IRN.</p>
        </div>
      ) : null}
      <div className="flex items-center space-x-3">
        <div className="bg-green-100 p-3 rounded-lg shrink-0">
          <FileDigit className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Bills filed with GST</h2>
          <p className="text-sm text-gray-600">
            Only bills that already got an official <strong>IRN</strong> number from the government. Same rows as Make bill /
            All bills — just filtered to “already filed.”
          </p>
          {!verticalNotSelected ? (
            <p className="text-xs text-slate-600 mt-1">
              Job-type filter (top): <strong>{billingPoBasisLabel}</strong>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search bill number, job code, client, or IRN…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg shadow-sm focus:ring-2 focus:ring-red-500/35 focus:border-red-400"
          />
        </div>
        <select
          value={sortConfig.key}
          onChange={(e) => setSortConfig((prev) => ({ ...prev, key: e.target.value }))}
          className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
          aria-label="Sort generated e-invoices by"
        >
          <option value="modified">Last modified</option>
          <option value="created">Last created</option>
          <option value="invoiceDate">Invoice date</option>
          <option value="taxInvoice">Tax invoice</option>
          <option value="ocNumber">OC number</option>
          <option value="client">Client name</option>
          <option value="amount">Amount</option>
          <option value="irn">IRN</option>
          <option value="ack">Ack No</option>
        </select>
        <select
          value={sortConfig.direction}
          onChange={(e) => setSortConfig((prev) => ({ ...prev, direction: e.target.value }))}
          className="min-h-[42px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-red-300 focus:ring-2 focus:ring-red-100"
          aria-label="Sort generated e-invoices direction"
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
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
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[5%]">S.No</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[13%]"><button type="button" onClick={() => toggleSort('taxInvoice')} className="inline-flex items-center">Tax Invoice # {renderSortIndicator('taxInvoice')}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[10%]"><button type="button" onClick={() => toggleSort('invoiceDate')} className="inline-flex items-center">Invoice Date {renderSortIndicator('invoiceDate')}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[14%]"><button type="button" onClick={() => toggleSort('ocNumber')} className="inline-flex items-center">OC / Site {renderSortIndicator('ocNumber')}</button></th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-red-100/60 w-[16%]"><button type="button" onClick={() => toggleSort('client')} className="inline-flex items-center">Client Name {renderSortIndicator('client')}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[9%]"><button type="button" onClick={() => toggleSort('amount')} className="inline-flex items-center">Amount {renderSortIndicator('amount')}</button></th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-red-100/60 w-[19%]"><button type="button" onClick={() => toggleSort('irn')} className="inline-flex items-center">IRN {renderSortIndicator('irn')}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[14%]"><button type="button" onClick={() => toggleSort('ack')} className="inline-flex items-center">Ack No / Date {renderSortIndicator('ack')}</button></th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-red-100/60 w-[6%]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {paginatedEInvoices.map((inv, idx) => (
                        <tr key={inv.id} className="hover:bg-gray-50 align-top">
                          <td className="px-3 py-2 text-xs text-gray-700 text-center font-medium tabular-nums whitespace-nowrap">
                            {start + idx + 1}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono truncate" title={inv.taxInvoiceNumber || inv.bill_number || ''}>
                            {inv.taxInvoiceNumber || inv.bill_number}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap">
                            {formatShortDate(inv.invoiceDate || inv.invoice_date || inv.created_at || inv.createdAt)}
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
                                onClick={() => void downloadTaxInvoicePdf(inv, { includeEinvoiceHeader: true, po: getPoByInvoice(inv) })}
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
              <span className="font-medium">{Math.min(start + PAGE_SIZE, sortedEInvoices.length)}</span> of{' '}
              <span className="font-medium">{sortedEInvoices.length}</span> invoice{sortedEInvoices.length !== 1 ? 's' : ''}
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
                onClick={() => void downloadTaxInvoicePdf(selectedInv, { includeEinvoiceHeader: true, po: getPoByInvoice(selectedInv) })}
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
