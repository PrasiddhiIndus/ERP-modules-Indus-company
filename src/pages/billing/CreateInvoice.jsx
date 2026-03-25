import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Upload, PlusCircle, X, Eye } from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const getFinancialYear = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y}` : `${y - 1}`;
};

const generateTaxInvoiceNumber = (sequence) => {
  const y = getFinancialYear();
  const seq = String(sequence).padStart(4, '0');
  return `INV-${y}-${seq}`;
};

const APPROVAL_STATUS_SENT = 'sent_for_approval';

const SELLER = {
  name: 'Ms Indus Fire Safety Private Limited',
  address: 'Block No 501, Old NH-8, Opposite GSFC Main Gate, Vadodara, Dashrath, Vadodara',
  state: 'Gujarat',
  stateCode: '24',
  gstin: '24AADCJ2182H1ZS',
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function formatDate(d) {
  if (!d) return '–';
  try {
    return new Date(d).toLocaleDateString('en-IN');
  } catch {
    return d;
  }
}

const CreateInvoice = ({ onNavigateTab }) => {
  const { commercialPOs, invoices, setInvoices, invoiceDraft, setInvoiceDraft } = useBilling();
  const [selectedPoId, setSelectedPoId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState([]); // { description, hsnSac, quantity, rate, amount }
  const [attendanceFiles, setAttendanceFiles] = useState([]); // [{ name, url }]
  const [document2Files, setDocument2Files] = useState([]); // [{ name, url }]
  const [viewInvoiceId, setViewInvoiceId] = useState(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const billablePOs = useMemo(() => {
    return commercialPOs
      .filter((p) => p.status === 'active' && p.endDate && p.endDate >= today)
      .filter((p) => (p.approvalStatus || 'draft') === APPROVAL_STATUS_SENT);
  }, [commercialPOs, today]);

  const poTableRows = useMemo(() => {
    return billablePOs.map((po) => {
      const existingInvoice = invoices.find((i) => String(i.poId) === String(po.id));
      const hasInvoice = !!existingInvoice;
      return {
        ...po,
        statusLabel: hasInvoice ? 'Created Tax Invoice' : 'Sent to approval',
        hasInvoice,
        existingInvoiceId: existingInvoice?.id || null,
      };
    });
  }, [billablePOs, invoices]);

  const selectedPO = useMemo(
    () => billablePOs.find((p) => String(p.id) === String(selectedPoId) || p.siteId === selectedPoId),
    [billablePOs, selectedPoId]
  );

  const editingInvoice = useMemo(() => {
    if (!invoiceDraft?.invoiceId) return null;
    return invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) || null;
  }, [invoiceDraft, invoices]);

  const displayPO = useMemo(() => {
    if (selectedPO) return selectedPO;
    if (invoiceDraft?.mode === 'edit' && editingInvoice) {
      return {
        id: editingInvoice.poId,
        siteId: editingInvoice.siteId,
        locationName: editingInvoice.clientLegalName || '',
        ocNumber: editingInvoice.ocNumber,
        poWoNumber: editingInvoice.poWoNumber,
        legalName: editingInvoice.clientLegalName,
        billingAddress: editingInvoice.clientAddress,
        gstin: editingInvoice.gstin,
        hsnCode: editingInvoice.hsnSac,
        sacCode: editingInvoice.hsnSac,
        billingType: editingInvoice.billingType || 'Monthly',
        paymentTerms: editingInvoice.paymentTerms,
        billingCycle: 30,
      };
    }
    return null;
  }, [selectedPO, invoiceDraft, editingInvoice]);

  useEffect(() => {
    if (!invoiceDraft) return;
    if (invoiceDraft.mode === 'edit' && editingInvoice) {
      setSelectedPoId(String(editingInvoice.poId || ''));
      setInvoiceDate(editingInvoice.invoiceDate || editingInvoice.created_at || today);
      const atts = Array.isArray(editingInvoice.attachments) ? editingInvoice.attachments : [];
      setAttendanceFiles(atts.filter((a) => a.type === 'attendance').map((a) => ({ name: a.name, url: a.url })));
      setDocument2Files(atts.filter((a) => a.type === 'document_2').map((a) => ({ name: a.name, url: a.url })));
      setItems(
        (editingInvoice.items || []).map((i) => ({
          description: i.description || i.designation || '',
          hsnSac: i.hsnSac || editingInvoice.hsnSac || '',
          quantity: Number(i.quantity) || 0,
          rate: Number(i.rate) || 0,
          amount: round2((Number(i.quantity) || 0) * (Number(i.rate) || 0)),
        }))
      );
      return;
    }
    if (invoiceDraft.mode === 'create' && invoiceDraft.poId) {
      setSelectedPoId(String(invoiceDraft.poId));
    }
  }, [invoiceDraft, editingInvoice, today]);

  useEffect(() => {
    if (!selectedPO) return;
    // Only seed items when creating (not when editing with existing items)
    if (invoiceDraft?.mode === 'edit') return;
    const hsnSac = selectedPO.hsnCode || selectedPO.sacCode || '';
    setItems(
      (selectedPO.ratePerCategory || []).map((r) => ({
        description: r.description || r.designation || '',
        hsnSac,
        quantity: 0,
        rate: Number(r.rate) || 0,
        amount: 0,
      }))
    );
  }, [selectedPO, invoiceDraft]);

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

  const taxableValue = useMemo(() => round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0)), [items]);
  const cgstRate = 9;
  const sgstRate = 9;
  const cgstAmt = useMemo(() => round2((taxableValue * cgstRate) / 100), [taxableValue]);
  const sgstAmt = useMemo(() => round2((taxableValue * sgstRate) / 100), [taxableValue]);
  const totalValue = useMemo(() => round2(taxableValue + cgstAmt + sgstAmt), [taxableValue, cgstAmt, sgstAmt]);

  const canSave = !!displayPO && items.length > 0;
  const selectedViewInvoice = useMemo(
    () => invoices.find((i) => String(i.id) === String(viewInvoiceId)) || null,
    [invoices, viewInvoiceId]
  );

  const handleSaveInvoice = () => {
    if (!displayPO || !canSave) return;
    const isEdit = invoiceDraft?.mode === 'edit' && invoiceDraft?.invoiceId;
    const existing = isEdit ? invoices.find((i) => String(i.id) === String(invoiceDraft.invoiceId)) : null;
    const nextNumericId = Math.max(0, ...invoices.map((i) => Number(i.id) || 0), 0) + 1;
    const id = existing?.id ?? nextNumericId;
    const taxInvoiceNumber = existing?.taxInvoiceNumber || generateTaxInvoiceNumber(invoices.length + 1);

    const inv = {
      ...(existing || {}),
      id,
      poId: displayPO.id,
      siteId: displayPO.siteId,
      billingType: displayPO.billingType || 'Monthly',
      taxInvoiceNumber,
      invoiceDate,
      clientLegalName: displayPO.legalName,
      clientAddress: displayPO.billingAddress,
      gstin: displayPO.gstin,
      ocNumber: displayPO.ocNumber,
      poWoNumber: displayPO.poWoNumber,
      hsnSac: displayPO.hsnCode || displayPO.sacCode || '',
      items: items.map((i) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        quantity: Number(i.quantity) || 0,
        rate: Number(i.rate) || 0,
        amount: round2(i.amount),
      })),
      attachments: [
        ...attendanceFiles.map((f) => ({ name: f.name || 'attendance', type: 'attendance', url: f.url || '#' })),
        ...document2Files.map((f) => ({ name: f.name || 'document_2', type: 'document_2', url: f.url || '#' })),
      ],
      taxableValue,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      calculatedInvoiceAmount: totalValue,
      totalAmount: totalValue,
      paStatus: existing?.paStatus || 'Pending',
      paymentStatus: existing?.paymentStatus || false,
      pendingAmount: existing?.pendingAmount ?? totalValue,
      created_at: existing?.created_at || today,
      createdAt: existing?.createdAt || today,
      updated_at: today,
    };

    setInvoices((prev) => {
      if (existing) return prev.map((p) => (String(p.id) === String(existing.id) ? inv : p));
      return [...prev, inv];
    });
    setInvoiceDraft(null);
    onNavigateTab && onNavigateTab('manage-invoices');
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="bg-emerald-100 p-3 rounded-lg shrink-0">
          <FileText className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Create Invoice</h2>
          <p className="text-sm text-gray-600">Select PO sent for approval; invoice format as per template; edit only quantity/rate; save → Manage Invoices</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <h3 className="font-semibold text-gray-900 p-4 pb-2">1. Select PO/WO (only “Sent to approval”)</h3>
        {billablePOs.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 pb-4">
            No PO found for billing. In Commercial → PO Entry, click <span className="font-medium">Send to approval</span> for a PO.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OC Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Site / Location</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO/WO</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {poTableRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{row.ocNumber || '–'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.siteId && row.locationName ? `${row.siteId} – ${row.locationName}` : row.siteId || row.locationName || '–'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.poWoNumber || '–'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${row.hasInvoice ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'}`}>
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {row.hasInvoice && row.existingInvoiceId && (
                          <button
                            type="button"
                            onClick={() => setViewInvoiceId(row.existingInvoiceId)}
                            title="View Tax Invoice"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPoId(String(row.id))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Create Invoice
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500 px-4 pt-2 pb-4">Click <strong>Create Invoice</strong> to open the form for the selected PO.</p>
      </div>

      {displayPO && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-lg font-semibold text-gray-900">
                {invoiceDraft?.mode === 'edit' ? 'Edit' : 'Create'} Invoice – {displayPO.siteId || '–'} – {displayPO.locationName || displayPO.legalName || '–'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedPoId('');
                  setItems([]);
                  setAttendanceFiles([]);
                  setDocument2Files([]);
                  setInvoiceDraft(null);
                }}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-gray-500">
              OC: <span className="font-medium text-gray-700">{displayPO.ocNumber}</span> · PO/WO: <span className="font-medium text-gray-700">{displayPO.poWoNumber}</span>
            </p>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Seller</p>
              <p className="font-semibold text-gray-900">{SELLER.name}</p>
              <p className="text-gray-700">{SELLER.address}</p>
              <p className="text-gray-700">GSTIN: <span className="font-mono">{SELLER.gstin}</span></p>
              <p className="text-gray-700">State: {SELLER.state} (Code: {SELLER.stateCode})</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Buyer</p>
              <p className="font-semibold text-gray-900">{displayPO.legalName}</p>
              <p className="text-gray-700">{displayPO.billingAddress}</p>
              <p className="text-gray-700">GSTIN: <span className="font-mono">{displayPO.gstin}</span></p>
              <p className="text-gray-700">Place of Supply: {displayPO.billingAddress?.split(',').pop()?.trim() || '–'}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-gray-600">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{it.description}</td>
                    <td className="px-3 py-2 text-gray-700">{it.hsnSac || '–'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        className="w-24 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={it.rate}
                        onChange={(e) => updateItem(idx, { rate: e.target.value })}
                        className="w-28 px-2 py-1 border border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">₹{round2(it.amount).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="text-gray-500">Payment terms:</span> {displayPO.paymentTerms || `${displayPO.billingCycle || 30} days`}</p>
              <p><span className="text-gray-500">Invoice date:</span> {formatDate(invoiceDate)}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Taxable Value</span><span className="font-medium">₹{taxableValue.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">CGST ({cgstRate}%)</span><span className="font-medium">₹{cgstAmt.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">SGST ({sgstRate}%)</span><span className="font-medium">₹{sgstAmt.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-2"><span className="text-gray-900 font-semibold">Total</span><span className="text-gray-900 font-semibold">₹{totalValue.toLocaleString('en-IN')}</span></div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Attachments (optional)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attendance Sheet (Word / Doc) – optional</label>
                <div className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg bg-white">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <input
                    type="file"
                    accept=".doc,.docx,.pdf,.xlsx,.xls"
                    multiple
                    onChange={(e) =>
                      setAttendanceFiles(
                        Array.from(e.target.files || []).map((f) => ({
                          name: f.name,
                          url: URL.createObjectURL(f),
                        }))
                      )
                    }
                    className="text-sm"
                  />
                </div>
                {attendanceFiles.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{attendanceFiles.length} file(s) selected</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Document 2 (Doc) – optional</label>
                <div className="flex items-center gap-2 p-3 border border-dashed border-gray-300 rounded-lg bg-white">
                  <Upload className="w-5 h-5 text-gray-400" />
                  <input
                    type="file"
                    accept=".doc,.docx,.pdf"
                    multiple
                    onChange={(e) =>
                      setDocument2Files(
                        Array.from(e.target.files || []).map((f) => ({
                          name: f.name,
                          url: URL.createObjectURL(f),
                        }))
                      )
                    }
                    className="text-sm"
                  />
                </div>
                {document2Files.length > 0 && (
                  <p className="text-xs text-green-600 mt-1">{document2Files.length} file(s) selected</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedPoId('');
                setItems([]);
                setAttendanceFiles([]);
                setDocument2Files([]);
                setInvoiceDraft(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSaveInvoice}
              disabled={!canSave}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {invoiceDraft?.mode === 'edit' ? 'Update Invoice' : 'Save Invoice'}
            </button>
          </div>
            </div>
          </div>
        </div>
      )}
      {selectedViewInvoice && (() => {
        const inv = selectedViewInvoice;
        const previewItems = Array.isArray(inv.items) ? inv.items : [];
        const previewTaxable = inv.taxableValue ?? round2(previewItems.reduce((s, i) => s + (Number(i.amount) || 0), 0));
        const previewCgstRate = Number(inv.cgstRate) || 9;
        const previewSgstRate = Number(inv.sgstRate) || 9;
        const previewCgst = inv.cgstAmt ?? round2((previewTaxable * previewCgstRate) / 100);
        const previewSgst = inv.sgstAmt ?? round2((previewTaxable * previewSgstRate) / 100);
        const previewTotal = inv.calculatedInvoiceAmount ?? inv.totalAmount ?? round2(previewTaxable + previewCgst + previewSgst);
        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
                <h3 className="text-lg font-semibold text-gray-900">Tax Invoice Preview – {inv.taxInvoiceNumber || '–'}</h3>
                <button type="button" onClick={() => setViewInvoiceId(null)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 bg-gray-100">
                <div className="mx-auto w-full max-w-[840px] bg-white border border-gray-300 shadow-sm">
                  <div className="bg-blue-900 text-white px-6 py-4">
                    <h4 className="text-xl font-bold">{SELLER.name}</h4>
                    <p className="text-xs opacity-90 mt-1">An ISO 9001:2015 Certified Company</p>
                  </div>

                  <div className="px-6 py-4 border-b border-gray-300">
                    <h5 className="text-center text-xl font-bold text-gray-900">Tax Invoice</h5>
                    <p className="text-right text-xs text-gray-500 mt-1">(ORIGINAL FOR RECIPIENT)</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm border-b border-gray-300">
                    <div>
                      <p className="font-semibold text-gray-900 mb-1">{SELLER.name}</p>
                      <p className="text-gray-700">{SELLER.address}</p>
                      <p className="text-gray-700 mt-1">GSTIN/UIN: {SELLER.gstin}</p>
                      <p className="text-gray-700">State Name: {SELLER.state}, Code: {SELLER.stateCode}</p>
                    </div>
                    <div className="space-y-1 text-gray-700">
                      <p><span className="font-medium">Invoice No.:</span> {inv.taxInvoiceNumber || '–'}</p>
                      <p><span className="font-medium">Dated:</span> {formatDate(inv.invoiceDate || inv.created_at)}</p>
                      <p><span className="font-medium">Buyer Order No.:</span> {inv.poWoNumber || inv.ocNumber || '–'}</p>
                      <p><span className="font-medium">OC Number:</span> {inv.ocNumber || '–'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm border-b border-gray-300">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase">Consignee / Ship To</p>
                      <p className="font-semibold text-gray-900 mt-1">{inv.clientLegalName || '–'}</p>
                      <p className="text-gray-700">{inv.clientAddress || '–'}</p>
                      <p className="text-gray-700 mt-1">GSTIN/UIN: {inv.gstin || '–'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase">Buyer / Bill To</p>
                      <p className="font-semibold text-gray-900 mt-1">{inv.clientLegalName || '–'}</p>
                      <p className="text-gray-700">{inv.clientAddress || '–'}</p>
                      <p className="text-gray-700 mt-1">GSTIN/UIN: {inv.gstin || '–'}</p>
                    </div>
                  </div>

                  <div className="px-6 py-4 border-b border-gray-300">
                    <table className="w-full text-sm border border-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 border border-gray-300 text-left">SI No.</th>
                          <th className="px-2 py-2 border border-gray-300 text-left">Description of Goods</th>
                          <th className="px-2 py-2 border border-gray-300 text-left">HSN/SAC</th>
                          <th className="px-2 py-2 border border-gray-300 text-left">Qty</th>
                          <th className="px-2 py-2 border border-gray-300 text-left">Rate</th>
                          <th className="px-2 py-2 border border-gray-300 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.length ? previewItems.map((it, idx) => (
                          <tr key={idx}>
                            <td className="px-2 py-2 border border-gray-300">{idx + 1}</td>
                            <td className="px-2 py-2 border border-gray-300">{it.description || it.designation || '–'}</td>
                            <td className="px-2 py-2 border border-gray-300">{it.hsnSac || inv.hsnSac || '–'}</td>
                            <td className="px-2 py-2 border border-gray-300">{Number(it.quantity) || 0}</td>
                            <td className="px-2 py-2 border border-gray-300">₹{round2(Number(it.rate) || 0).toLocaleString('en-IN')}</td>
                            <td className="px-2 py-2 border border-gray-300 text-right">₹{round2(Number(it.amount) || 0).toLocaleString('en-IN')}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td className="px-2 py-3 border border-gray-300 text-center text-gray-500" colSpan={6}>No line items</td>
                          </tr>
                        )}
                        <tr>
                          <td className="px-2 py-2 border border-gray-300" colSpan={5}>CGST ({previewCgstRate}%)</td>
                          <td className="px-2 py-2 border border-gray-300 text-right">₹{round2(previewCgst).toLocaleString('en-IN')}</td>
                        </tr>
                        <tr>
                          <td className="px-2 py-2 border border-gray-300" colSpan={5}>SGST ({previewSgstRate}%)</td>
                          <td className="px-2 py-2 border border-gray-300 text-right">₹{round2(previewSgst).toLocaleString('en-IN')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-2 gap-4 px-6 py-4 text-sm border-b border-gray-300">
                    <div className="space-y-1 text-gray-700">
                      <p><span className="font-medium">Payment Terms:</span> {inv.paymentTerms || '30 Days'}</p>
                      <p><span className="font-medium">Invoice Date:</span> {formatDate(inv.invoiceDate || inv.created_at)}</p>
                    </div>
                    <div className="border border-gray-300 rounded p-3">
                      <div className="flex justify-between"><span>Taxable Value</span><span className="font-medium">₹{round2(previewTaxable).toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span>CGST</span><span className="font-medium">₹{round2(previewCgst).toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span>SGST</span><span className="font-medium">₹{round2(previewSgst).toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between border-t border-gray-300 mt-2 pt-2 font-semibold"><span>Total</span><span>₹{round2(previewTotal).toLocaleString('en-IN')}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default CreateInvoice;
