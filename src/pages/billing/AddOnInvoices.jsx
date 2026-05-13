import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, Eye, X } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';
import { roundInvoiceAmount, normalizeGstSupplyType } from '../../utils/invoiceRound';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';
import RequestCnDnApprovalSection from './components/RequestCnDnApprovalSection';

const APPROVAL_STATUS_APPROVED = 'approved';

const ADD_ON_TYPES = [
  'Appraisal',
  'Gratuity',
  'Reimbursement',
  'Bonus',
  'Arrears',
  'Incentive',
  'Manpower Adjustment',
  'Miscellaneous',
  'Other',
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Tax add-ons use AON-*; proforma add-ons use PAO-* so numbering stays unique vs tax series. */
function makeAddOnInvoiceNumber(invoices, documentKind) {
  const y = new Date().getFullYear();
  const wantProforma = documentKind === 'proforma';
  const seq =
    (Array.isArray(invoices) ? invoices : []).filter((i) => {
      if (!i.isAddOn) return false;
      const k = String(i.invoiceKind || i.invoice_kind || 'tax').toLowerCase();
      return wantProforma ? k === 'proforma' : k !== 'proforma';
    }).length + 1;
  if (wantProforma) return `PAO-${y}-${String(seq).padStart(4, '0')}`;
  return `AON-${y}-${String(seq).padStart(4, '0')}`;
}

const AddOnInvoices = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, setInvoices, billingVerticalFilter, billingPoBasisFilter } = useBilling();
  const [addOnType, setAddOnType] = useState('');
  const [addOnDocumentKind, setAddOnDocumentKind] = useState('tax');
  const [selectedPoId, setSelectedPoId] = useState('');
  const [invoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([{ description: '', hsnSac: '', quantity: 1, rate: 0, amount: 0 }]);
  const [previewDraft, setPreviewDraft] = useState(null);

  const verticalNotSelected = !billingVerticalFilter;
  const billingPoBasisLabel =
    billingPoBasisFilter === 'with_po'
      ? 'With PO only'
      : billingPoBasisFilter === 'without_po'
        ? 'Without PO only'
        : 'All — With PO & Without PO';

  const approvedPOs = useMemo(
    () => commercialPOs.filter((p) => (p.approvalStatus || '').toLowerCase() === APPROVAL_STATUS_APPROVED),
    [commercialPOs]
  );

  const selectedPO = useMemo(
    () => approvedPOs.find((p) => String(p.id) === String(selectedPoId)) || null,
    [approvedPOs, selectedPoId]
  );

  const canOpen = !!addOnType && !!selectedPO;
  const gstSupplyType = normalizeGstSupplyType(selectedPO?.gstSupplyType || selectedPO?.gst_supply_type);
  const taxableValue = useMemo(() => round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0)), [items]);
  const cgstRate = 9;
  const sgstRate = 9;
  const igstRate = 18;
  const cgstAmt = gstSupplyType === 'intra' ? round2((taxableValue * cgstRate) / 100) : 0;
  const sgstAmt = gstSupplyType === 'intra' ? round2((taxableValue * sgstRate) / 100) : 0;
  const igstAmt = gstSupplyType === 'inter' ? round2((taxableValue * igstRate) / 100) : 0;
  const totalValueRaw = gstSupplyType === 'sez_zero' ? taxableValue : round2(taxableValue + cgstAmt + sgstAmt + igstAmt);
  const totalValue = roundInvoiceAmount(totalValueRaw);

  const updateItem = (idx, patch) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const qty = Number(next.quantity) || 0;
        const rate = Number(next.rate) || 0;
        next.amount = round2(qty * rate);
        return next;
      })
    );
  };

  const addRow = () => setItems((prev) => [...prev, { description: '', hsnSac: '', quantity: 1, rate: 0, amount: 0 }]);
  const removeRow = (idx) => setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const handleSave = () => {
    if (!canOpen) return;
    const no = makeAddOnInvoiceNumber(invoices, addOnDocumentKind);
    const resolvedKind = addOnDocumentKind === 'proforma' ? 'proforma' : 'tax';
    const newId = Math.max(0, ...invoices.map((i) => Number(i.id) || 0), 0) + 1;
    const inv = {
      id: newId,
      isAddOn: true,
      addOnType,
      poId: selectedPO.id,
      siteId: selectedPO.siteId,
      locationName: selectedPO.locationName || '',
      billingType: 'Add-On',
      taxInvoiceNumber: no,
      invoiceDate,
      billNumber: no,
      billingMonth: null,
      billingDurationFrom: null,
      billingDurationTo: null,
      invoiceHeaderRemarks: null,
      clientLegalName: selectedPO.legalName,
      clientAddress: selectedPO.billingAddress,
      clientShippingAddress: selectedPO.shippingAddress || null,
      placeOfSupply: selectedPO.placeOfSupply || null,
      gstin: selectedPO.gstin,
      ocNumber: selectedPO.ocNumber,
      poWoNumber: selectedPO.poWoNumber,
      hsnSac: selectedPO.hsnCode || selectedPO.sacCode || '',
      items: items.map((i) => ({
        description: i.description || '',
        hsnSac: i.hsnSac || selectedPO.hsnCode || selectedPO.sacCode || '',
        quantity: Number(i.quantity) || 0,
        rate: Number(i.rate) || 0,
        amount: round2(i.amount),
      })),
      paymentTerms: selectedPO.remarks || `${selectedPO.billingCycle || 30} days`,
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      gstSupplyType,
      igstRate: gstSupplyType === 'inter' ? igstRate : 0,
      igstAmt: gstSupplyType === 'inter' ? igstAmt : 0,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: 'Pending',
      paymentStatus: false,
      pendingAmount: totalValue,
      created_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString().slice(0, 10),
      invoiceKind: resolvedKind,
      invoice_kind: resolvedKind,
    };
    setInvoices((prev) => [...prev, inv]);
    onNavigateTab && onNavigateTab('manage-invoices');
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Pick a team first</p>
          <p className="text-sm mt-1 max-w-lg mx-auto">
            Use the top dropdown. Extra bills need a job that Commercial already approved.
          </p>
        </div>
      ) : null}
      <div className="flex items-center space-x-3">
        <div className="bg-violet-100 p-3 rounded-lg shrink-0">
          <FilePlus2 className="w-6 h-6 text-violet-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Extra bills</h2>
          <p className="text-sm text-gray-600">
            Money <strong>not</strong> in the main contract — bonus, travel pay back, etc. Pick real tax bill or draft below.
          </p>
          {!verticalNotSelected ? (
            <p className="text-xs text-slate-600 mt-1">
              Job-type filter (top): <strong>{billingPoBasisLabel}</strong>
            </p>
          ) : null}
        </div>
      </div>

      {!verticalNotSelected ? (
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="min-w-0">
            Needs an <strong>approved job</strong> from Commercial. After you save, we open <strong>All bills</strong> for print and GST.
          </p>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link to="/app/commercial/manpower-training/po-entry" className="text-sm font-semibold text-violet-800 hover:underline">
              Commercial PO (M&amp;T) →
            </Link>
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('manage-invoices')}
              className="text-sm font-semibold text-red-700 hover:underline"
            >
              Manage Invoices →
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Add-on bill type</label>
            <select
              value={addOnType}
              onChange={(e) => setAddOnType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select add-on type…</option>
              {ADD_ON_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Document type</label>
            <select
              value={addOnDocumentKind}
              onChange={(e) => setAddOnDocumentKind(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              title="Tax add-ons use AON-… numbers; proforma add-ons use PAO-… numbers"
            >
              <option value="tax">Tax invoice</option>
              <option value="proforma">Proforma invoice</option>
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Approved OC / Client / Location</label>
            <select
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Select approved OC…</option>
              {approvedPOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {`${po.ocNumber || '—'} | ${po.legalName || '—'} | ${po.locationName || po.siteId || '—'}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {canOpen ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              OC: <span className="font-medium text-gray-800">{selectedPO.ocNumber}</span> · Add-on type:{' '}
              <span className="font-medium text-gray-800">{addOnType}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                const draft = {
                  isAddOn: true,
                  addOnType,
                  invoiceKind: addOnDocumentKind === 'proforma' ? 'proforma' : 'tax',
                  invoice_kind: addOnDocumentKind === 'proforma' ? 'proforma' : 'tax',
                  taxInvoiceNumber: 'Preview',
                  clientLegalName: selectedPO.legalName,
                  clientAddress: selectedPO.billingAddress,
                  clientShippingAddress: selectedPO.shippingAddress || null,
                  placeOfSupply: selectedPO.placeOfSupply || null,
                  gstin: selectedPO.gstin,
                  ocNumber: selectedPO.ocNumber,
                  poWoNumber: selectedPO.poWoNumber,
                  hsnSac: selectedPO.hsnCode || selectedPO.sacCode || '',
                  invoiceDate,
                  paymentTerms: selectedPO.remarks || `${selectedPO.billingCycle || 30} days`,
                  items,
                  taxableValue,
                  cgstRate,
                  sgstRate,
                  cgstAmt,
                  sgstAmt,
                  gstSupplyType,
                  igstRate: gstSupplyType === 'inter' ? igstRate : 0,
                  igstAmt: gstSupplyType === 'inter' ? igstAmt : 0,
                  calculatedInvoiceAmount: totalValue,
                  totalAmount: totalValue,
                };
                setPreviewDraft(draft);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 border-b text-left">Description</th>
                  <th className="px-3 py-2 border-b text-left">HSN/SAC</th>
                  <th className="px-3 py-2 border-b text-center">Qty</th>
                  <th className="px-3 py-2 border-b text-center">Rate</th>
                  <th className="px-3 py-2 border-b text-right">Amount</th>
                  <th className="px-3 py-2 border-b text-center w-12"> </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 border-b">
                      <input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                    </td>
                    <td className="px-3 py-2 border-b">
                      <input value={it.hsnSac} onChange={(e) => updateItem(idx, { hsnSac: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1" />
                    </td>
                    <td className="px-3 py-2 border-b text-center">
                      <input type="number" min={0} value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} className="w-24 border border-gray-300 rounded px-2 py-1 text-center" />
                    </td>
                    <td className="px-3 py-2 border-b text-center">
                      <input type="number" min={0} value={it.rate} onChange={(e) => updateItem(idx, { rate: e.target.value })} className="w-28 border border-gray-300 rounded px-2 py-1 text-center" />
                    </td>
                    <td className="px-3 py-2 border-b text-right">₹{round2(it.amount).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 border-b text-center">
                      <button type="button" onClick={() => removeRow(idx)} className="text-red-600 hover:bg-red-50 rounded px-2 py-1">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={addRow} className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline">+ Add row</button>
            <div className="text-sm space-y-0.5">
              <p className="text-right">Taxable: <span className="font-medium">₹{taxableValue.toLocaleString('en-IN')}</span></p>
              {gstSupplyType === 'intra' ? <p className="text-right">CGST+SGST: <span className="font-medium">₹{(cgstAmt + sgstAmt).toLocaleString('en-IN')}</span></p> : null}
              {gstSupplyType === 'inter' ? <p className="text-right">IGST: <span className="font-medium">₹{igstAmt.toLocaleString('en-IN')}</span></p> : null}
              {gstSupplyType === 'sez_zero' ? <p className="text-right">GST: <span className="font-medium">₹0</span></p> : null}
              <p className="text-right text-base font-semibold">Total: ₹{totalValue.toLocaleString('en-IN')}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save Add-On Invoice</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Select add-on type and approved OC first to open the invoice form.</p>
      )}

      {previewDraft && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-lg font-semibold text-gray-900">Add-On Invoice Preview</h3>
              <button type="button" onClick={() => setPreviewDraft(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-gray-100">
              <InvoiceHtmlPreview inv={previewDraft} />
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <RequestCnDnApprovalSection invoices={invoices} setInvoices={setInvoices} onNavigateTab={onNavigateTab} />
      </div>
    </div>
  );
};

export default AddOnInvoices;
