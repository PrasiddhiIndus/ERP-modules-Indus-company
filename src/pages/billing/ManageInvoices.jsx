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
import { downloadTaxInvoicePdf, downloadCreditDebitNotePdf } from '../../utils/taxInvoicePdf';
import { roundInvoiceAmount } from '../../utils/invoiceRound';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import ManagePAModal from './ManagePAModal';
import GenerateEInvoiceModal from './GenerateEInvoiceModal';
import { netAfterCnDn } from '../../utils/cnDn';

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
const MANAGE_INVOICE_TABS = [
  { id: 'billing-types', label: 'Billing types' },
  { id: 'add-on-invoices', label: 'Add-On Invoices' },
  { id: 'issued-cndn', label: 'Issued credit & debit notes' },
];

const ManageInvoices = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, setInvoices, setInvoiceDraft, creditDebitNotes } = useBilling();
  const [billingTypeFilter, setBillingTypeFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewId, setViewId] = useState(null);
  const [managePAInvoiceId, setManagePAInvoiceId] = useState(null);
  const [generatingEInvoiceId, setGeneratingEInvoiceId] = useState(null);
  const [generateEInvoiceModalId, setGenerateEInvoiceModalId] = useState(null);
  const [page, setPage] = useState(1);
  const [manageTab, setManageTab] = useState('billing-types');
  const PAGE_SIZE = 10;

  const getInvoiceBillingType = (inv) => {
    if (inv.isAddOn) return 'Add-On';
    if (inv.billingType) return inv.billingType;
    const po = commercialPOs.find((p) => p.id === inv.poId);
    return po?.billingType || 'Monthly';
  };

  const filteredInvoices = useMemo(() => {
    let list =
      billingTypeFilter === 'All'
        ? invoices.filter((inv) => !inv.isAddOn)
        : invoices.filter((inv) => !inv.isAddOn && getInvoiceBillingType(inv) === billingTypeFilter);
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

  const addOnInvoices = useMemo(() => {
    let list = invoices.filter((inv) => !!inv.isAddOn);
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      list = list.filter(
        (inv) =>
          inv.taxInvoiceNumber?.toLowerCase().includes(s) ||
          inv.ocNumber?.toLowerCase().includes(s) ||
          inv.clientLegalName?.toLowerCase().includes(s) ||
          inv.addOnType?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [invoices, searchTerm]);

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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex gap-1 px-4 sm:px-6 border-b border-gray-100 overflow-x-auto">
          {MANAGE_INVOICE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setManageTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                manageTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {manageTab !== 'issued-cndn' ? (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={
              manageTab === 'add-on-invoices'
                ? 'Search add-on invoice number, OC, client, type...'
                : 'Search by invoice number, OC, client...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ) : null}

      {manageTab === 'add-on-invoices' ? (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-violet-50/60">
          <h3 className="text-sm font-semibold text-violet-800">Add-On Invoices</h3>
          <p className="text-xs text-violet-700 mt-0.5">Appraisal / gratuity / reimbursement and other add-on bills</p>
        </div>
        <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[1160px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[14%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[6%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">Tax Invoice</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">Billing type</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">OC Number</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">Client</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">Net after CN/DN</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">E-Inv</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {addOnInvoices.map((inv) => (
                        <tr key={`addon-${inv.id}`} className="hover:bg-gray-50 align-top">
                          <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono overflow-hidden min-w-0" title={inv.taxInvoiceNumber || inv.bill_number || '–'}>
                            <div className="flex flex-col items-center gap-0.5 min-w-0">
                              <span className="truncate max-w-full">{inv.taxInvoiceNumber || inv.bill_number}</span>
                              {(inv.cnDnRequestStatus || inv.cn_dn_request_status) === 'pending' ? (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 whitespace-nowrap">CN/DN pending</span>
                              ) : null}
                              {(inv.cnDnRequestStatus || inv.cn_dn_request_status) === 'approved' ? (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 whitespace-nowrap">CN/DN approved</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={inv.addOnType || 'Add-On'}>{inv.addOnType || 'Add-On'}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap overflow-hidden min-w-0" title={inv.ocNumber || '–'}>
                            <span className="block max-w-full truncate whitespace-nowrap">{inv.ocNumber || '–'}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 overflow-hidden min-w-0" title={inv.clientLegalName || inv.client_name || '–'}>
                            <span className="block max-w-full truncate">{inv.clientLegalName || inv.client_name || '–'}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center tabular-nums whitespace-nowrap">
                            ₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td
                            className="px-3 py-2 text-xs text-center tabular-nums font-medium text-gray-800 whitespace-nowrap"
                            title="Invoice total − credit notes + debit notes linked to this tax invoice"
                          >
                            ₹
                            {netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                          </td>
                          <td className="px-3 py-2 text-xs text-center">
                            {inv.e_invoice_irn ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-nowrap items-center justify-center gap-1.5">
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
                                onClick={() => (inv.e_invoice_irn ? null : setGenerateEInvoiceModalId(inv.id))}
                                disabled={!!inv.e_invoice_irn || generatingEInvoiceId === inv.id}
                                title={inv.e_invoice_irn ? 'E-Invoice generated' : 'Generate E-Invoice'}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <FileDigit className="w-4 h-4" />
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
                                onClick={() => setManagePAInvoiceId(inv.id)}
                                title="Manage PA"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              >
                                <FileCheck className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteInvoice(inv.id)}
                                title="Delete invoice"
                                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {addOnInvoices.length === 0 ? (
                        <tr>
                          <td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={8}>
                            No add-on invoices found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
        </div>
      </div>
      ) : null}

      {manageTab === 'billing-types' ? (
      <>
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[1160px] table-fixed border-collapse">
                    <colgroup>
                      <col className="w-[14%]" />
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[20%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                      <col className="w-[6%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">Tax Invoice</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">Billing type</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">OC Number</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff]">Client</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">Net after CN/DN</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">PO rem. (₹)</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">E-Inv</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-black border-b border-gray-200 bg-[#f2f6ff] whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {paginatedInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50 align-top">
                          {(() => {
                            const po = commercialPOs.find((p) => String(p.id) === String(inv.poId));
                            const contract = Number(po?.totalContractValue) || 0;
                            const rateSum = sumRatePerCategory(po);
                            const dCount = daysInMonth(inv.invoiceDate || inv.created_at);
                            const expected = round2(rateSum * dCount);
                            const remaining = round2(contract - expected);
                            const cnSt = inv.cnDnRequestStatus || inv.cn_dn_request_status;
                            return (
                              <>
                                <td className="px-3 py-2 text-xs text-gray-900 text-center font-semibold font-mono" title={inv.taxInvoiceNumber || inv.bill_number || ''}>
                                  <div className="flex flex-col items-center gap-0.5 min-w-0">
                                    <span className="truncate max-w-full">{inv.taxInvoiceNumber || inv.bill_number}</span>
                                    {cnSt === 'pending' ? (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 whitespace-nowrap">CN/DN pending</span>
                                    ) : null}
                                    {cnSt === 'approved' ? (
                                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 whitespace-nowrap">CN/DN approved</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 text-center truncate" title={getInvoiceBillingType(inv) || ''}>
                                  {getInvoiceBillingType(inv)}
                                </td>
                                <td
                                  className="px-3 py-2 text-xs text-gray-700 text-center whitespace-nowrap overflow-hidden min-w-0"
                                  title={inv.ocNumber || '–'}
                                >
                                  <span className="block max-w-full truncate whitespace-nowrap">{inv.ocNumber || '–'}</span>
                                </td>
                                <td
                                  className="px-3 py-2 text-xs text-gray-700 overflow-hidden min-w-0"
                                  title={inv.clientLegalName || inv.client_name || '–'}
                                >
                                  <span className="block max-w-full truncate">{inv.clientLegalName || inv.client_name || '–'}</span>
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-700 text-center tabular-nums whitespace-nowrap">
                                  ₹{roundInvoiceAmount(inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                                </td>
                                <td
                                  className="px-3 py-2 text-xs text-center tabular-nums font-medium text-gray-800 whitespace-nowrap"
                                  title="Tax invoice total − credits + debits linked to this invoice"
                                >
                                  ₹
                                  {netAfterCnDn(inv.id, creditDebitNotes, inv.calculatedInvoiceAmount ?? inv.totalAmount ?? 0).toLocaleString('en-IN')}
                                </td>
                                <td className="px-3 py-2 text-xs text-center whitespace-nowrap">
                                  {contract > 0 ? (
                                    <span
                                      className={`font-medium ${remaining < 0 ? 'text-red-700' : 'text-gray-700'}`}
                                      title={`PO contract remaining: Contract ₹${contract.toLocaleString('en-IN')} − (Rate sum ₹${rateSum.toLocaleString('en-IN')} × ${dCount} days = ₹${expected.toLocaleString('en-IN')})`}
                                    >
                                      {formatINRWithSign(remaining)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">–</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-center">
                                  {inv.e_invoice_irn ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex flex-nowrap items-center justify-center gap-1.5">
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
      </>
      ) : null}

      {manageTab === 'issued-cndn' ? (
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/90">
          <h3 className="text-sm font-semibold text-amber-950">Issued credit & debit notes</h3>
          <p className="text-xs text-amber-900/85 mt-0.5">
            Same document layout as tax invoices; numbers are CN-… or DN-… with the parent tax invoice number as the base.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Note #</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Parent tax invoice</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(creditDebitNotes || []).map((note) => (
                <tr key={String(note.id)} className="hover:bg-gray-50">
                  <td className="px-3 py-2 capitalize font-medium">{note.type}</td>
                  <td className="px-3 py-2 font-mono text-gray-800">{note.noteTaxInvoiceNumber || '–'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{note.parentTaxInvoiceNumber}</td>
                  <td className="px-3 py-2 text-right tabular-nums">₹{(note.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-gray-600">{note.created_at || '–'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        const parent = invoices.find((i) => String(i.id) === String(note.parentInvoiceId));
                        void downloadCreditDebitNotePdf(note, parent, {
                          digitalSignatureDataUrl: parent?.digitalSignatureDataUrl || parent?.digital_signature_data_url,
                        });
                      }}
                      className="text-amber-700 hover:underline text-xs font-medium"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!creditDebitNotes || creditDebitNotes.length === 0) && (
          <p className="px-4 py-6 text-center text-sm text-gray-500">No credit or debit notes issued yet.</p>
        )}
      </div>
      ) : null}

      {selectedInv &&
        (() => {
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
