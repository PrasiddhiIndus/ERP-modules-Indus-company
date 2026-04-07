import React, { useState, useMemo } from 'react';
import {
  FileText,
  Eye,
  Pencil,
  Download,
  FileDigit,
  FileCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { generateEInvoice } from '../../services/eInvoiceApi';
import { downloadTaxInvoicePdf } from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount } from '../../utils/invoiceRound';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import ManagePAModal from './ManagePAModal';
import GenerateEInvoiceModal from './GenerateEInvoiceModal';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function daysInMonth(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return new Date(y, m + 1, 0).getDate();
}

function sumRatePerCategory(po) {
  const rows = Array.isArray(po?.ratePerCategory) ? po.ratePerCategory : [];
  return round2(rows.reduce((s, r) => s + (Number(r?.rate) || 0), 0));
}

function formatINRWithSign(n) {
  const v = round2(n);
  const abs = Math.abs(v).toLocaleString('en-IN');
  return v < 0 ? `-₹${abs}` : `₹${abs}`;
}

const BILLING_TYPE_TABS = [
  { id: 'All', label: 'All' },
  { id: 'Monthly', label: 'Monthly' },
  { id: 'Per Day', label: 'Per Day' },
  { id: 'Lump Sum', label: 'Lump Sum' },
];

const ManageInvoices = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, setInvoices, setInvoiceDraft } = useBilling();
  const [billingTypeFilter, setBillingTypeFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewId, setViewId] = useState(null);
  const [managePAInvoiceId, setManagePAInvoiceId] = useState(null);
  const [generatingEInvoiceId, setGeneratingEInvoiceId] = useState(null);
  const [generateEInvoiceModalId, setGenerateEInvoiceModalId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const getInvoiceBillingType = (inv) => {
    if (inv.billingType) return inv.billingType;
    const po = commercialPOs.find((p) => p.id === inv.poId);
    return po?.billingType || 'Monthly';
  };

  const filteredInvoices = useMemo(() => {
    let list = billingTypeFilter === 'All'
      ? [...invoices]
      : invoices.filter((inv) => getInvoiceBillingType(inv) === billingTypeFilter);
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      list = list.filter(
        (inv) =>
          inv.taxInvoiceNumber?.toLowerCase().includes(s) ||
          inv.ocNumber?.toLowerCase().includes(s) ||
          inv.clientLegalName?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, commercialPOs, billingTypeFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const paginatedInvoices = useMemo(
    () => filteredInvoices.slice(start, start + PAGE_SIZE),
    [filteredInvoices, start]
  );

  const goToPage = (p) => setPage((prev) => Math.min(totalPages, Math.max(1, p)));

  const handleDeleteInvoice = (id) => {
    if (window.confirm('Delete this invoice?')) {
      setInvoices((prev) => prev.filter((i) => String(i.id) !== String(id)));
      if (viewId && String(viewId) === String(id)) setViewId(null);
      if (managePAInvoiceId && String(managePAInvoiceId) === String(id)) setManagePAInvoiceId(null);
      if (generateEInvoiceModalId && String(generateEInvoiceModalId) === String(id)) setGenerateEInvoiceModalId(null);
    }
  };

  const handleGenerateEInvoice = async (inv) => {
    setGeneratingEInvoiceId(inv.id);
    try {
      const po = commercialPOs.find((p) => p.id === inv.poId);
      const billShape = {
        id: inv.id,
        bill_number: inv.taxInvoiceNumber,
        taxInvoiceNumber: inv.taxInvoiceNumber,
        client_name: inv.clientLegalName,
        client_address: inv.clientAddress,
        clientAddress: inv.clientAddress,
        gstin: inv.gstin,
        invoice_date: inv.invoiceDate || inv.created_at,
        created_at: inv.invoiceDate || inv.created_at,
        cgstRate: inv.cgstRate,
        sgstRate: inv.sgstRate,
        taxableValue: inv.taxableValue,
        calculatedInvoiceAmount: inv.calculatedInvoiceAmount ?? inv.totalAmount,
        totalAmount: inv.totalAmount,
        oc_number: inv.ocNumber,
        items: (inv.items || []).map((i) => ({
          description: i.description || i.designation,
          quantity: i.quantity,
          rate: i.rate,
          amount: i.amount,
        })),
      };
      const wopoShape = po ? { id: po.id, oc_number: po.ocNumber, hsn_sac: po.sacCode || po.hsnCode, sacCode: po.sacCode, hsnCode: po.hsnCode } : null;
      const result = await generateEInvoice(billShape, wopoShape);
      if (result && result.irn) {
        setInvoices((prev) =>
          prev.map((i) =>
            i.id === inv.id
              ? {
                  ...i,
                  e_invoice_irn: result.irn,
                  e_invoice_ack_no: result.ackNo,
                  e_invoice_ack_dt: result.ackDt,
                  e_invoice_signed_qr: result.signedQR,
                }
              : i
          )
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingEInvoiceId(null);
    }
  };

  const selectedInv = viewId ? invoices.find((i) => i.id === viewId) : null;

  // Reset to page 1 when filter or search changes
  React.useEffect(() => {
    setPage(1);
  }, [billingTypeFilter, searchTerm]);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-blue-100 p-3 rounded-lg shrink-0">
          <FileText className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Manage Invoices</h2>
          <p className="text-sm text-gray-600">View | Edit | Download | Generate E-Invoice | Manage PA</p>
        </div>
      </div>

      {/* Billing type: same tab navigation UI as main Billing tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 sm:px-6 py-2 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">Billing type</p>
          <span className="text-sm text-gray-500">
            {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-1 px-4 sm:px-6 border-t border-gray-100 overflow-x-auto">
          {BILLING_TYPE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBillingTypeFilter(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                billingTypeFilter === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by invoice number, OC, client..."
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Billing type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OC / Site</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remaining (₹)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-Inv</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  {(() => {
                    const po = commercialPOs.find((p) => String(p.id) === String(inv.poId));
                    const contract = Number(po?.totalContractValue) || 0;
                    const rateSum = sumRatePerCategory(po);
                    const dCount = daysInMonth(inv.invoiceDate || inv.created_at);
                    const expected = round2(rateSum * dCount);
                    const remaining = round2(contract - expected);
                    return (
                      <>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.taxInvoiceNumber || inv.bill_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getInvoiceBillingType(inv)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.ocNumber} / {inv.siteId}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{inv.clientLegalName || inv.client_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm">
                    {contract > 0 ? (
                      <span
                        className={`font-medium ${remaining < 0 ? 'text-red-700' : 'text-gray-700'}`}
                        title={`Contract ₹${contract.toLocaleString('en-IN')} − (Rate sum ₹${rateSum.toLocaleString('en-IN')} × ${dCount} days = ₹${expected.toLocaleString('en-IN')})`}
                      >
                        {formatINRWithSign(remaining)}
                      </span>
                    ) : (
                      <span className="text-gray-400">–</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {inv.e_invoice_irn ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewId(inv.id)}
                        title="View invoice"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (inv.e_invoice_irn) return;
                          setInvoiceDraft({ mode: 'edit', invoiceId: inv.id, poId: inv.poId });
                          onNavigateTab && onNavigateTab('create-invoice');
                        }}
                        title={inv.e_invoice_irn ? 'Cannot edit after e-invoice (IRN) generated' : 'Edit invoice'}
                        disabled={!!inv.e_invoice_irn}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadTaxInvoicePdf(inv)}
                        title="Download Tax Invoice PDF"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => (inv.e_invoice_irn ? null : setGenerateEInvoiceModalId(inv.id))}
                        disabled={!!inv.e_invoice_irn || generatingEInvoiceId === inv.id}
                        title={inv.e_invoice_irn ? 'E-Invoice generated' : 'Generate E-Invoice'}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileDigit className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteInvoice(inv.id)}
                        title="Delete invoice"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setManagePAInvoiceId(inv.id)}
                        title="Manage PA"
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      >
                        <FileCheck className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {billingTypeFilter === 'All'
              ? 'No invoices yet. Create one from Create Invoice.'
              : `No invoices for ${billingTypeFilter}. Create one from Create Invoice or switch to All.`}
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              Showing <span className="font-medium">{start + 1}</span>–
              <span className="font-medium">{Math.min(start + PAGE_SIZE, filteredInvoices.length)}</span> of{' '}
              <span className="font-medium">{filteredInvoices.length}</span> invoice{filteredInvoices.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-700">
                Page <span className="font-medium">{page}</span> of <span className="font-medium">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedInv && (() => {
        const inv = selectedInv;
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
                <h3 className="text-lg font-semibold text-gray-900">Tax Invoice Preview – {inv.taxInvoiceNumber || '–'}</h3>
                <button type="button" onClick={() => setViewId(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 bg-gray-100">
                <InvoiceHtmlPreview inv={inv} />
              </div>
            </div>
          </div>
        );
      })()}

      {managePAInvoiceId && (
        <ManagePAModal
          invoiceId={managePAInvoiceId}
          invoice={invoices.find((i) => i.id === managePAInvoiceId)}
          onClose={() => setManagePAInvoiceId(null)}
        />
      )}

      {generateEInvoiceModalId && (
        <GenerateEInvoiceModal
          invoice={invoices.find((i) => i.id === generateEInvoiceModalId)}
          onClose={() => setGenerateEInvoiceModalId(null)}
          onGenerate={async (inv) => {
            await handleGenerateEInvoice(inv);
            onNavigateTab && onNavigateTab('generated-e-invoice');
          }}
        />
      )}
    </div>
  );
};

export default ManageInvoices;
