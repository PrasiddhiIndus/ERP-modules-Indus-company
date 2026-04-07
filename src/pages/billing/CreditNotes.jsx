import React, { useState, useMemo } from 'react';
import { Receipt, Search, Plus, Download } from 'lucide-react';
import { downloadCreditDebitNotePdf } from '../../utils/taxInvoicePdf';
import { useBilling } from '../../contexts/BillingContext';
import { generateEInvoice } from '../../services/eInvoiceApi';

const CreditNotes = () => {
  const { invoices, creditDebitNotes, setCreditDebitNotes } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [parentInvoiceId, setParentInvoiceId] = useState('');
  const [noteType, setNoteType] = useState('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [generatingEInvoiceId, setGeneratingEInvoiceId] = useState(null);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const s = searchTerm.toLowerCase();
    return invoices.filter(
      (inv) =>
        (inv.taxInvoiceNumber || inv.bill_number)?.toLowerCase().includes(s) ||
        inv.ocNumber?.toLowerCase().includes(s) ||
        (inv.clientLegalName || inv.client_name)?.toLowerCase().includes(s)
    );
  }, [invoices, searchTerm]);

  const parentInv = parentInvoiceId ? invoices.find((i) => i.id === Number(parentInvoiceId)) : null;

  const handleAddNote = () => {
    const inv = invoices.find((i) => i.id === Number(parentInvoiceId));
    if (!inv) return;
    const nextId = Math.max(0, ...creditDebitNotes.map((n) => n.id), 0) + 1;
    const newNote = {
      id: nextId,
      parentTaxInvoiceNumber: inv.taxInvoiceNumber || inv.bill_number,
      parentInvoiceId: inv.id,
      type: noteType,
      amount: Number(amount) || 0,
      reason: reason.trim(),
      e_invoice_irn: null,
      created_at: new Date().toISOString().slice(0, 10),
    };
    setCreditDebitNotes((prev) => [...prev, newNote]);
    setModalOpen(false);
    setParentInvoiceId('');
    setAmount('');
    setReason('');
  };

  const handleGenerateEInvoiceForNote = async (note) => {
    setGeneratingEInvoiceId(note.id);
    try {
      const inv = invoices.find((i) => i.id === note.parentInvoiceId);
      const billShape = {
        id: note.id,
        bill_number: `CN-${note.parentTaxInvoiceNumber}`,
        client_name: inv?.clientLegalName || inv?.client_name,
        created_at: note.created_at,
        items: [{ description: note.reason || (note.type === 'credit' ? 'Credit Note' : 'Debit Note'), quantity: 1, rate: note.amount, amount: note.amount }],
      };
      const result = await generateEInvoice(billShape, null);
      if (result && result.irn) {
        setCreditDebitNotes((prev) =>
          prev.map((n) => (n.id === note.id ? { ...n, e_invoice_irn: result.irn } : n))
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-amber-100 p-3 rounded-lg shrink-0">
            <Receipt className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Credit / Debit Notes</h2>
            <p className="text-sm text-gray-600">Link to Parent Tax Invoice; E-Invoice option for the note</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
        >
          <Plus className="w-5 h-5" />
          Add Credit / Debit Note
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by invoice number, OC, client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50">
          <h3 className="font-semibold text-gray-900">Credit & Debit Notes</h3>
          <p className="text-sm text-gray-500">Each note links to a Parent Tax Invoice. Generate E-Invoice for the note if required.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent Tax Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-Invoice</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Download</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {creditDebitNotes.map((note) => (
                <tr key={note.id}>
                  <td className="px-4 py-3 text-sm font-medium capitalize">{note.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{note.parentTaxInvoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">₹{(note.amount || 0).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{note.reason || '–'}</td>
                  <td className="px-4 py-3 text-sm">{note.e_invoice_irn ? <span className="text-green-600">Yes</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        const parent = invoices.find((i) => String(i.id) === String(note.parentInvoiceId));
                        void downloadCreditDebitNotePdf(note, parent, {
                          digitalSignatureDataUrl: parent?.digitalSignatureDataUrl,
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
                        {generatingEInvoiceId === note.id ? 'Generating…' : 'Generate E-Invoice'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {creditDebitNotes.length === 0 && (
          <div className="p-8 text-center text-gray-500">No credit or debit notes. Add one linked to a parent invoice.</div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Credit / Debit Note</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Tax Invoice *</label>
                <select
                  value={parentInvoiceId}
                  onChange={(e) => setParentInvoiceId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Select invoice...</option>
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.taxInvoiceNumber || inv.bill_number} – {inv.clientLegalName || inv.client_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={noteType} onChange={(e) => setNoteType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="credit">Credit Note</option>
                  <option value="debit">Debit Note</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" rows={2} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleAddNote} disabled={!parentInvoiceId} className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditNotes;
