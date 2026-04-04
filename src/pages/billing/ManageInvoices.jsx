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
import {
  downloadTaxInvoicePdf,
  SELLER,
  BANK,
  TERMS,
  JURISDICTION,
  FOOTER_ADDRESS,
  FOOTER_PHONE,
  FOOTER_EMAIL,
  FOOTER_WEB,
  formatPdfDate,
  amountInWords,
} from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount } from '../../utils/invoiceRound';
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

function formatDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleDateString('en-IN');
  } catch {
    return d;
  }
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
                        onClick={() => downloadTaxInvoicePdf(inv)}
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
        const items = Array.isArray(inv.items) ? inv.items : [];
        const cgstRate = Number(inv.cgstRate) || 9;
        const sgstRate = Number(inv.sgstRate) || 9;
        const taxableValue = inv.taxableValue ?? round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));
        const cgstAmt = inv.cgstAmt ?? round2((taxableValue * cgstRate) / 100);
        const sgstAmt = inv.sgstAmt ?? round2((taxableValue * sgstRate) / 100);
        const totalAmount = roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? round2(taxableValue + cgstAmt + sgstAmt));
        const po = commercialPOs.find((p) => p.id === inv.poId);
        const paymentTerms = inv.paymentTerms || (po ? (po.paymentTerms || `${po.billingCycle || 30} days`) : '30 Days');
        const atts = Array.isArray(inv.attachments) ? inv.attachments : [];
        const buyerName = inv.clientLegalName || '–';
        const buyerLine = buyerName.startsWith('M/s') ? buyerName : `M/s ${buyerName}`;
        const placeOfSupply = inv.placeOfSupply || inv.clientAddress?.split(',').pop()?.trim() || 'Gujarat';
        const invoiceNo = inv.taxInvoiceNumber || inv.bill_number || '–';
        const invoiceDateStr = formatPdfDate(inv.invoiceDate || inv.created_at);
        const buyerOrderDateStr = inv.poWoDate ? formatPdfDate(inv.poWoDate) : invoiceDateStr;
        const buyerOrderNo = inv.poWoNumber || inv.ocNumber || '–';
        const totalQty = items.length ? items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) : 0;
        const hsnForTax = (items[0] && (items[0].hsnSac || inv.hsnSac)) || inv.hsnSac || '9983';
        const taxTotal = round2(cgstAmt + sgstAmt);
        const irn = inv.e_invoice_irn || inv.eInvoiceIrn;
        const ackNo = inv.e_invoice_ack_no || inv.eInvoiceAckNo;
        const ackDt = inv.e_invoice_ack_dt || inv.eInvoiceAckDt;

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-start justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] flex flex-col my-4">
              <div className="shrink-0 border-b border-gray-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 rounded-t-xl bg-white z-10">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Tax Invoice preview — {invoiceNo}</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadTaxInvoicePdf(inv)}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewId(null)}
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-gray-100 p-4 sm:p-6">
                <div className="mx-auto w-full max-w-[210mm] bg-white border border-gray-400 shadow-md text-[11px] sm:text-xs text-gray-900 leading-snug">
                  {/* PDF-style header */}
                  <div className="bg-[rgb(20,60,120)] text-white px-5 py-3">
                    <p className="text-base sm:text-lg font-bold uppercase tracking-tight">{SELLER.name}</p>
                    <p className="text-[10px] sm:text-xs opacity-90 mt-0.5">An ISO 9001:2015 Certified Company</p>
                  </div>

                  {irn && (
                    <div className="px-4 py-2 border-b border-gray-300 bg-amber-50/80 text-[10px] sm:text-[11px] space-y-0.5">
                      <p className="font-semibold text-gray-800">E-Invoice (IRN generated)</p>
                      <p className="break-all"><span className="font-medium">IRN:</span> {irn}</p>
                      {ackNo && <p><span className="font-medium">Ack No.:</span> {ackNo}</p>}
                      {ackDt && <p><span className="font-medium">Ack Date:</span> {formatPdfDate(ackDt)}</p>}
                    </div>
                  )}

                  <div className="px-4 py-2 border-b border-gray-300 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm sm:text-base font-bold">Tax Invoice</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">(ORIGINAL FOR RECIPIENT)</p>
                    </div>
                  </div>

                  {/* Seller + invoice meta (matches PDF columns) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3 border-b border-gray-300">
                    <div>
                      <p className="font-bold text-gray-900">{SELLER.name}</p>
                      <p className="text-gray-800 mt-1">{SELLER.address}</p>
                      <p className="mt-1">GSTIN/UIN: <span className="font-mono">{SELLER.gstin}</span></p>
                      <p>State Name: {SELLER.state}, Code: {SELLER.stateCode}</p>
                    </div>
                    <div className="sm:text-right sm:pl-4 space-y-0.5">
                      <p><span className="font-semibold">Invoice No.:</span> {invoiceNo}</p>
                      <p><span className="font-semibold">Dated:</span> {invoiceDateStr}</p>
                      <p><span className="font-semibold">Mode/Terms of Payment:</span> {paymentTerms}</p>
                      <p><span className="font-semibold">Buyer&apos;s Order No.:</span> {buyerOrderNo}</p>
                      <p><span className="font-semibold">Dated:</span> {buyerOrderDateStr}</p>
                      <p className="text-gray-600">OC: {inv.ocNumber || '–'}</p>
                    </div>
                  </div>

                  {/* Consignee / Buyer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 py-3 border-b border-gray-300">
                    <div>
                      <p className="font-bold text-gray-900 mb-1">Consignee (Ship to):</p>
                      <p className="font-semibold">{buyerLine}</p>
                      <p className="text-gray-800 mt-1">{inv.clientAddress || '–'}</p>
                      <p className="mt-1">GSTIN/UIN: <span className="font-mono">{inv.gstin || '–'}</span></p>
                      <p>State Name: Gujarat, Code: 24</p>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 mb-1">Buyer (Bill to):</p>
                      <p className="font-semibold">{buyerLine}</p>
                      <p className="text-gray-800 mt-1">{inv.clientAddress || '–'}</p>
                      <p className="mt-1">GSTIN/UIN: <span className="font-mono">{inv.gstin || '–'}</span></p>
                      <p>State Name: Gujarat, Code: 24</p>
                      <p className="mt-1"><span className="font-semibold">Place of Supply:</span> {placeOfSupply}</p>
                    </div>
                  </div>

                  {/* Item table — same columns as PDF */}
                  <div className="px-2 sm:px-3 py-2 overflow-x-auto border-b border-gray-300">
                    <table className="w-full min-w-[640px] border-collapse border border-gray-800 text-[10px] sm:text-[11px]">
                      <thead>
                        <tr className="bg-gray-200">
                          <th className="border border-gray-800 px-1 py-1 text-left font-semibold w-8">SI No.</th>
                          <th className="border border-gray-800 px-1 py-1 text-left font-semibold">Description of Goods</th>
                          <th className="border border-gray-800 px-1 py-1 text-left font-semibold w-14">HSN/SAC</th>
                          <th className="border border-gray-800 px-1 py-1 text-left font-semibold w-16">Quantity</th>
                          <th className="border border-gray-800 px-1 py-1 text-right font-semibold w-14">Rate</th>
                          <th className="border border-gray-800 px-1 py-1 text-center font-semibold w-10">per</th>
                          <th className="border border-gray-800 px-1 py-1 text-center font-semibold w-10">Disc. %</th>
                          <th className="border border-gray-800 px-1 py-1 text-right font-semibold w-16">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length ? items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="border border-gray-800 px-1 py-1">{idx + 1}</td>
                            <td className="border border-gray-800 px-1 py-1">{(it.description || it.designation || '–').slice(0, 80)}</td>
                            <td className="border border-gray-800 px-1 py-1 font-mono">{it.hsnSac || inv.hsnSac || '–'}</td>
                            <td className="border border-gray-800 px-1 py-1">{Number(it.quantity) || 0} NO</td>
                            <td className="border border-gray-800 px-1 py-1 text-right">{round2(Number(it.rate) || 0).toFixed(2)}</td>
                            <td className="border border-gray-800 px-1 py-1 text-center">NO</td>
                            <td className="border border-gray-800 px-1 py-1 text-center">–</td>
                            <td className="border border-gray-800 px-1 py-1 text-right">{round2(Number(it.amount) || 0).toFixed(2)}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={8} className="border border-gray-800 px-2 py-3 text-center text-gray-500">No line items</td>
                          </tr>
                        )}
                        <tr>
                          <td className="border border-gray-800 px-1 py-1" colSpan={7}>CGST</td>
                          <td className="border border-gray-800 px-1 py-1 text-right">{cgstAmt.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-800 px-1 py-1" colSpan={7}>SGST</td>
                          <td className="border border-gray-800 px-1 py-1 text-right">{sgstAmt.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="flex flex-wrap justify-between gap-2 mt-2 text-[10px] sm:text-[11px] font-semibold px-1">
                      <span>Total Quantity: {totalQty || (items.length ? 0 : 1)} NO</span>
                      <span>
                        Total Amount: Rs.{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} E. &amp; O.E
                      </span>
                    </div>
                  </div>

                  <div className="px-4 py-2 border-b border-gray-300">
                    <p className="font-bold text-gray-900">Amount Chargeable (in words)</p>
                    <p className="text-gray-800 mt-1">{amountInWords(totalAmount)}</p>
                  </div>

                  {/* Tax summary table */}
                  <div className="px-2 sm:px-3 py-2 overflow-x-auto border-b border-gray-300">
                    <table className="w-full min-w-[560px] border-collapse border border-gray-800 text-[10px] sm:text-[11px]">
                      <thead>
                        <tr className="bg-gray-200">
                          <th className="border border-gray-800 px-1 py-1 font-semibold">HSN/SAC</th>
                          <th className="border border-gray-800 px-1 py-1 font-semibold">Taxable Value</th>
                          <th className="border border-gray-800 px-1 py-1 font-semibold">CGST Rate</th>
                          <th className="border border-gray-800 px-1 py-1 font-semibold">CGST Amount</th>
                          <th className="border border-gray-800 px-1 py-1 font-semibold">SGST/UTGST Rate</th>
                          <th className="border border-gray-800 px-1 py-1 font-semibold">SGST/UTGST Amount</th>
                          <th className="border border-gray-800 px-1 py-1 font-semibold">Total Tax Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-gray-800 px-1 py-1 font-mono">{hsnForTax}</td>
                          <td className="border border-gray-800 px-1 py-1 text-right">{taxableValue.toFixed(2)}</td>
                          <td className="border border-gray-800 px-1 py-1 text-center">{cgstRate}%</td>
                          <td className="border border-gray-800 px-1 py-1 text-right">{cgstAmt.toFixed(2)}</td>
                          <td className="border border-gray-800 px-1 py-1 text-center">{sgstRate}%</td>
                          <td className="border border-gray-800 px-1 py-1 text-right">{sgstAmt.toFixed(2)}</td>
                          <td className="border border-gray-800 px-1 py-1 text-right">{taxTotal.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="text-[10px] sm:text-[11px] mt-2 px-1">
                      <span className="font-semibold">Tax Amount (in words):</span> {amountInWords(taxTotal)}
                    </p>
                  </div>

                  {/* Terms + Bank */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 py-3 border-b border-gray-300">
                    <div>
                      <ol className="list-decimal list-inside space-y-1 text-gray-800">
                        {TERMS.map((t, i) => (
                          <li key={i} className="pl-0.5">{t}</li>
                        ))}
                      </ol>
                      <p className="mt-3 font-semibold text-gray-900">Customer&apos;s Seal and Signature</p>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 mb-1">Bank Details</p>
                      <p className="text-gray-800">A/c Holder&apos;s Name: {BANK.accountHolder}</p>
                      <p className="text-gray-800">Bank Name: {BANK.bankName}</p>
                      <p className="text-gray-800">A/c No.: {BANK.accountNo}</p>
                      <p className="text-gray-800">Branch &amp; IFS Code: {BANK.branchAndIfsc}</p>
                      <p className="mt-3 text-gray-800">for {SELLER.name}</p>
                      <p className="font-semibold mt-1">Authorised Signatory</p>
                    </div>
                  </div>

                  <p className="text-center font-bold text-sm py-2 border-b border-gray-300">{JURISDICTION}</p>

                  <div className="bg-[rgb(180,40,40)] text-white px-4 py-2 text-[10px] sm:text-[11px]">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <span>Phone: {FOOTER_PHONE}</span>
                      <span>Website: {FOOTER_WEB}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span>Email: {FOOTER_EMAIL}</span>
                      <span className="opacity-95">{FOOTER_ADDRESS}</span>
                    </div>
                  </div>
                </div>

                {/* App metadata + actions (not on printed PDF) */}
                <div className="mx-auto max-w-[210mm] mt-4 space-y-3">
                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600">
                    <p><span className="text-gray-500">PA Status:</span> <span className="font-medium text-gray-900">{inv.paStatus || '–'}</span></p>
                    <p><span className="text-gray-500">Payment received:</span> <span className="font-medium text-gray-900">{inv.paymentStatus ? 'Yes' : 'No'}</span></p>
                    <p><span className="text-gray-500">Invoice date (app):</span> {formatDate(inv.invoiceDate || inv.created_at)}</p>
                  </div>

                  {atts.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Attachments</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {atts.map((a, i) => (
                          <li key={i}>{a.name || a.type || 'File'}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => downloadTaxInvoicePdf(inv)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewId(null);
                        setInvoiceDraft({ mode: 'edit', invoiceId: inv.id, poId: inv.poId });
                        onNavigateTab && onNavigateTab('create-invoice');
                      }}
                      disabled={!!inv.e_invoice_irn}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit Invoice
                    </button>
                    <button type="button" onClick={() => setViewId(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                      Close
                    </button>
                  </div>
                </div>
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
