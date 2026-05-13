import React, { useState, useMemo } from 'react';
import { Receipt, Search, Plus, Download, CheckCircle, XCircle, Eye, X } from 'lucide-react';
import { downloadCreditDebitNotePdf, getInvoiceTotals } from '../../utils/taxInvoicePdf';
import { useBilling } from '../../contexts/BillingContext';
import { useAuth } from '../../contexts/AuthContext';
import { userCanApproveInModules } from '../../config/roles';
import { generateEInvoice } from '../../services/eInvoiceApi';
import { cnDnDocumentNumber, buildCnDnInvoiceSnapshot } from '../../utils/cnDn';
import { roundInvoiceAmount, normalizeGstSupplyType } from '../../utils/invoiceRound';
import InvoiceHtmlPreview from './components/InvoiceHtmlPreview';

const REQ_PENDING = 'pending';
const REQ_APPROVED = 'approved';
const REQ_REJECTED = 'rejected';

function newNoteId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cdn-${Date.now()}`;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function IssueCnDnModal({ parent, noteType, requestReason, onClose, onIssue, defaultDate }) {
  const [items, setItems] = useState(() =>
    (parent.items || []).map((i) => ({
      description: i.description || '',
      hsnSac: i.hsnSac || parent.hsnSac || '',
      quantity: Number(i.quantity) || 0,
      rate: Number(i.rate) || 0,
      amount: round2(Number(i.amount) || 0),
    }))
  );
  const [noteDate, setNoteDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [extraRemark, setExtraRemark] = useState('');
  const [preview, setPreview] = useState(false);

  const gstSupplyType = normalizeGstSupplyType(parent.gstSupplyType || parent.gst_supply_type);
  const noteTaxNo = useMemo(
    () => cnDnDocumentNumber(noteType, parent.taxInvoiceNumber || parent.bill_number),
    [noteType, parent.taxInvoiceNumber, parent.bill_number]
  );

  const updateItem = (idx, patch) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        const q = Number(next.quantity) || 0;
        const r = Number(next.rate) || 0;
        next.amount = round2(q * r);
        return next;
      })
    );
  };

  const snapshot = useMemo(() => {
    const reason = [requestReason, extraRemark].filter(Boolean).join(' — ') || null;
    return buildCnDnInvoiceSnapshot({
      parent,
      noteType,
      noteTaxInvoiceNumber: noteTaxNo,
      noteDate,
      items,
      reason,
    });
  }, [parent, noteType, noteTaxNo, noteDate, items, requestReason, extraRemark]);

  const totals = useMemo(() => getInvoiceTotals(snapshot), [snapshot]);

  const handleIssue = () => {
    const reason = [requestReason, extraRemark].filter(Boolean).join(' — ') || null;
    const snap = buildCnDnInvoiceSnapshot({
      parent,
      noteType,
      noteTaxInvoiceNumber: noteTaxNo,
      noteDate,
      items,
      reason,
    });
    onIssue({
      snap,
      totalAmount: snap.totalAmount,
      reason,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Issue {noteType === 'debit' ? 'Debit' : 'Credit'} note
            </h3>
            <p className="text-sm text-gray-500">
              Document no. <span className="font-mono font-medium text-gray-800">{noteTaxNo}</span> · Parent{' '}
              <span className="font-mono">{parent.taxInvoiceNumber || parent.bill_number}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Note date</label>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="text-sm text-gray-600 flex items-end">
              GST mode: <span className="ml-1 font-medium text-gray-800">{gstSupplyType}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">Adjust line quantities/rates as needed. Totals follow the same rules as tax invoices.</p>
          <div className="rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left">HSN/SAC</th>
                  <th className="px-2 py-2 text-center">Qty</th>
                  <th className="px-2 py-2 text-center">Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        value={it.hsnSac}
                        onChange={(e) => updateItem(idx, { hsnSac: e.target.value })}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="number"
                        min={0}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-center"
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="number"
                        min={0}
                        value={it.rate}
                        onChange={(e) => updateItem(idx, { rate: e.target.value })}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-center"
                      />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">₹{it.amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Additional remark (optional)</label>
            <input
              value={extraRemark}
              onChange={(e) => setExtraRemark(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Printed on note / PDF"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <div className="text-sm space-y-0.5">
              <p>
                Taxable: <span className="font-medium">₹{totals.taxableValue.toLocaleString('en-IN')}</span>
              </p>
              <p className="font-semibold">
                Total: ₹{roundInvoiceAmount(totals.totalAmount).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreview(true)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
              >
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button type="button" onClick={handleIssue} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700">
                Issue & save note
              </button>
            </div>
          </div>
        </div>
      </div>
      {preview ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b flex justify-between items-center">
              <span className="font-semibold">Note preview (tax invoice layout)</span>
              <button type="button" onClick={() => setPreview(false)} className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-100">
              <InvoiceHtmlPreview inv={snapshot} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const CREDIT_NOTE_APPROVER_MODULES = ['billing'];

const CreditNotes = () => {
  const { userProfile, accessibleModules } = useAuth();
  const { invoices, setInvoices, creditDebitNotes, setCreditDebitNotes, billingVerticalFilter, billingPoBasisFilter } =
    useBilling();
  const canApproveCnDn = userCanApproveInModules(userProfile, accessibleModules, CREDIT_NOTE_APPROVER_MODULES);
  const [searchTerm, setSearchTerm] = useState('');
  const [generatingEInvoiceId, setGeneratingEInvoiceId] = useState(null);
  const [issueContext, setIssueContext] = useState(null);

  const verticalNotSelected = !billingVerticalFilter;
  const billingPoBasisLabel =
    billingPoBasisFilter === 'with_po'
      ? 'With PO only'
      : billingPoBasisFilter === 'without_po'
        ? 'Without PO only'
        : 'All — With PO & Without PO';

  const pendingRequests = useMemo(
    () =>
      invoices.filter((inv) => (inv.cnDnRequestStatus || inv.cn_dn_request_status) === REQ_PENDING),
    [invoices]
  );

  const approvedReady = useMemo(
    () =>
      invoices.filter((inv) => (inv.cnDnRequestStatus || inv.cn_dn_request_status) === REQ_APPROVED),
    [invoices]
  );

  const filteredNotes = useMemo(() => {
    if (!searchTerm.trim()) return creditDebitNotes;
    const s = searchTerm.toLowerCase();
    return (creditDebitNotes || []).filter(
      (n) =>
        String(n.noteTaxInvoiceNumber || '').toLowerCase().includes(s) ||
        String(n.parentTaxInvoiceNumber || '').toLowerCase().includes(s) ||
        String(n.reason || '').toLowerCase().includes(s)
    );
  }, [creditDebitNotes, searchTerm]);

  const approveRequest = (inv) => {
    if (!canApproveCnDn) return;
    const nowIso = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((i) =>
        String(i.id) === String(inv.id) ? { ...i, cnDnRequestStatus: REQ_APPROVED, cnDnApprovedAt: nowIso } : i
      )
    );
  };

  const rejectRequest = (inv) => {
    if (!canApproveCnDn) return;
    setInvoices((prev) =>
      prev.map((i) =>
        String(i.id) === String(inv.id)
          ? {
              ...i,
              cnDnRequestStatus: REQ_REJECTED,
              cnDnApprovedAt: null,
            }
          : i
      )
    );
  };

  const clearRequestFields = (invId) => ({
    cnDnRequestStatus: null,
    cnDnRequestNoteType: null,
    cnDnRequestReason: null,
    cnDnRequestedAt: null,
    cnDnApprovedAt: null,
  });

  const handleIssueComplete = (parent, noteType, { snap, totalAmount, reason }) => {
    const note = {
      id: newNoteId(),
      parentInvoiceId: parent.id,
      parentTaxInvoiceNumber: parent.taxInvoiceNumber || parent.bill_number,
      type: noteType,
      amount: Number(totalAmount) || 0,
      reason: reason || parent.cnDnRequestReason || '',
      noteTaxInvoiceNumber: snap.taxInvoiceNumber,
      invoiceSnapshot: snap,
      e_invoice_irn: null,
      created_at: snap.invoiceDate || new Date().toISOString().slice(0, 10),
    };
    setCreditDebitNotes((prev) => [...prev, note]);
    setInvoices((prev) =>
      prev.map((i) => (String(i.id) === String(parent.id) ? { ...i, ...clearRequestFields() } : i))
    );
    setIssueContext(null);
  };

  const handleGenerateEInvoiceForNote = async (note) => {
    setGeneratingEInvoiceId(note.id);
    try {
      const inv = invoices.find((i) => String(i.id) === String(note.parentInvoiceId));
      const billShape = {
        id: note.id,
        bill_number: note.noteTaxInvoiceNumber || `CN-${note.parentTaxInvoiceNumber}`,
        taxInvoiceNumber: note.noteTaxInvoiceNumber,
        client_name: inv?.clientLegalName || inv?.client_name,
        created_at: note.created_at,
        items: (note.invoiceSnapshot?.items || [{ description: note.reason, quantity: 1, rate: note.amount, amount: note.amount }]).map(
          (i) => ({
            description: i.description,
            quantity: i.quantity,
            rate: i.rate,
            amount: i.amount,
          })
        ),
      };
      const result = await generateEInvoice(billShape, null);
      if (result && result.irn) {
        setCreditDebitNotes((prev) =>
          prev.map((n) => (String(n.id) === String(note.id) ? { ...n, e_invoice_irn: result.irn } : n))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingEInvoiceId(null);
    }
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      {verticalNotSelected ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-600">
          <p className="text-lg font-semibold text-gray-900">Pick a team first</p>
          <p className="text-sm mt-1">Use the dropdown at the top to choose who you bill — then you can fix wrong bills.</p>
        </div>
      ) : null}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-amber-100 p-3 rounded-lg shrink-0">
            <Receipt className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Fix a wrong bill</h2>
            {!verticalNotSelected ? (
              <p className="text-xs text-slate-600 mt-1">
                Job-type filter (top): <strong>{billingPoBasisLabel}</strong>
              </p>
            ) : null}
            <p className="text-sm text-gray-600">
              <strong>Credit</strong> lowers what the client owes. <strong>Debit</strong> adds more. Someone asks here → you
              approve → then print the fix paper like a normal bill.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50">
          <h3 className="font-semibold text-amber-900">Pending approval</h3>
          <p className="text-sm text-amber-800/90">Requested from Create Invoice or Add-On Invoices (bottom of those pages).</p>
        </div>
        {!canApproveCnDn && pendingRequests.length > 0 ? (
          <div className="px-4 py-4 text-sm text-amber-900 bg-amber-50 border-b border-amber-100">
            Pending requests below need approval from Admin or a manager with Billing access.
          </div>
        ) : null}
        {pendingRequests.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-600 space-y-2">
            <p>No pending CN/DN requests in the system right now.</p>
            <p className="text-xs text-gray-500">
              If you just submitted a request but it vanished after refresh, apply the Supabase migration{' '}
              <code className="bg-gray-100 px-1 rounded">20260413120000_invoice_cn_dn_request_note_snapshot.sql</code> so
              invoice rows can store request status, and avoid reloading the page until save completes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tax invoice</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingRequests.map((inv) => (
                  <tr key={String(inv.id)}>
                    <td className="px-4 py-2 capitalize font-medium">
                      {(inv.cnDnRequestNoteType || inv.cn_dn_request_note_type) === 'debit' ? 'Debit' : 'Credit'}
                    </td>
                    <td className="px-4 py-2 font-mono">{inv.taxInvoiceNumber || inv.bill_number}</td>
                    <td className="px-4 py-2">{inv.clientLegalName || inv.client_name}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={inv.cnDnRequestReason}>
                      {inv.cnDnRequestReason || '–'}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {canApproveCnDn ? (
                        <>
                          <button
                            type="button"
                            onClick={() => approveRequest(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg mr-1 hover:bg-emerald-100"
                          >
                            <CheckCircle className="w-4 h-4" /> Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectRequest(inv)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">Awaiting Billing approval</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50/80">
          <h3 className="font-semibold text-emerald-900">Approved — issue note</h3>
          <p className="text-sm text-emerald-800/90">Document number will be CN-… or DN-… with the same base as the tax invoice.</p>
        </div>
        {approvedReady.length === 0 ? (
          <div className="px-4 py-5 text-sm text-gray-600">Nothing approved yet. Approve a row above, then issue the note here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tax invoice</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {approvedReady.map((inv) => (
                  <tr key={`appr-${inv.id}`}>
                    <td className="px-4 py-2 capitalize font-medium">
                      {(inv.cnDnRequestNoteType || inv.cn_dn_request_note_type) === 'debit' ? 'Debit' : 'Credit'}
                    </td>
                    <td className="px-4 py-2 font-mono">{inv.taxInvoiceNumber || inv.bill_number}</td>
                    <td className="px-4 py-2">{inv.clientLegalName || inv.client_name}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setIssueContext({
                            parent: inv,
                            noteType: (inv.cnDnRequestNoteType || inv.cn_dn_request_note_type || 'credit').toLowerCase(),
                            requestReason: inv.cnDnRequestReason || '',
                          })
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
                      >
                        <Plus className="w-4 h-4" /> Issue note
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search invoices (for manual reference)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50">
          <h3 className="font-semibold text-gray-900">Issued credit & debit notes</h3>
          <p className="text-sm text-gray-500">PDF uses the same format as tax invoices. Listed in Manage Invoices as well.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-Inv</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PDF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredNotes.map((note) => (
                <tr key={String(note.id)}>
                  <td className="px-4 py-3 text-sm font-medium capitalize">{note.type}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-800">{note.noteTaxInvoiceNumber || '–'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">{note.parentTaxInvoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">₹{(note.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{note.created_at || '–'}</td>
                  <td className="px-4 py-3 text-sm">
                    {note.e_invoice_irn ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        const parent = invoices.find((i) => String(i.id) === String(note.parentInvoiceId));
                        void downloadCreditDebitNotePdf(note, parent, {
                          digitalSignatureDataUrl: parent?.digitalSignatureDataUrl || parent?.digital_signature_data_url,
                        });
                      }}
                      className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-amber-700"
                    >
                      <Download className="w-4 h-4" /> PDF
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {!note.e_invoice_irn && (
                      <button
                        type="button"
                        onClick={() => handleGenerateEInvoiceForNote(note)}
                        disabled={generatingEInvoiceId === note.id}
                        className="text-sm text-amber-600 hover:underline disabled:opacity-50"
                      >
                        {generatingEInvoiceId === note.id ? 'Generating…' : 'Generate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredNotes.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {creditDebitNotes.length === 0
              ? 'No notes issued yet. Approve a request above, then issue.'
              : 'No notes match your search.'}
          </div>
        )}
      </div>

      {issueContext ? (
        <IssueCnDnModal
          parent={issueContext.parent}
          noteType={issueContext.noteType}
          requestReason={issueContext.requestReason}
          onClose={() => setIssueContext(null)}
          onIssue={(payload) => handleIssueComplete(issueContext.parent, issueContext.noteType, payload)}
        />
      ) : null}
    </div>
  );
};

export default CreditNotes;
