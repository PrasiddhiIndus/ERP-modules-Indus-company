import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Search,
  CheckCircle,
  XCircle,
  Pencil,
} from 'lucide-react';
import { useBilling } from '../../contexts/BillingContext';

const CreditNotes = () => {
  const { bills, setBills } = useBilling();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCreditNoteId, setEditingCreditNoteId] = useState(null);

  const approvedBills = useMemo(
    () => bills.filter((b) => b.status === 'approved'),
    [bills]
  );

  const filteredBills = useMemo(() => {
    if (!searchTerm.trim()) return approvedBills;
    const s = searchTerm.toLowerCase();
    return approvedBills.filter(
      (b) =>
        b.bill_number?.toLowerCase().includes(s) ||
        b.oc_number?.toLowerCase().includes(s) ||
        b.client_name?.toLowerCase().includes(s)
    );
  }, [approvedBills, searchTerm]);

  const requestCreditNote = (billId) => {
    setBills((prev) =>
      prev.map((b) =>
        b.id === billId ? { ...b, credit_note_status: 'pending_approval' } : b
      )
    );
  };

  const setCreditNoteStatus = (billId, status) => {
    setBills((prev) =>
      prev.map((b) =>
        b.id === billId ? { ...b, credit_note_status: status } : b
      )
    );
    if (status === 'approved') setEditingCreditNoteId(billId);
  };

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="bg-amber-100 p-3 rounded-lg shrink-0">
            <Receipt className="w-6 h-6 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900">Credit Notes</h2>
            <p className="text-sm text-gray-600">
              Create Credit Note is <strong>disabled by default</strong>. It unlocks only after a manager approves the request (to prevent excessive generation). Then you can edit the credit note.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search by bill number, OC number, client..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
      </div>

      {/* Bills from Create Invoice – only "Credit Note" is active until approved */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-amber-50">
          <h3 className="font-semibold text-gray-900">Bills (from Create Invoice)</h3>
          <p className="text-sm text-gray-500">
            Only the &quot;Credit Note&quot; button is clickable. Rest of the row is inactive until the manager approves the credit note request.
          </p>
        </div>
        <div className="overflow-x-auto">
          {filteredBills.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">No approved bills yet</p>
              <p className="text-sm mt-1">Create and approve bills in Create Invoice to see them here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredBills.map((b) => {
                const isCreditNoteRequested = b.credit_note_status != null;
                const isPending = b.credit_note_status === 'pending_approval';
                const isCreditNoteApproved = b.credit_note_status === 'approved';
                const isDisabled = !isCreditNoteApproved && !isPending;

                return (
                  <li
                    key={b.id}
                    className={`px-4 py-4 ${isDisabled ? 'opacity-75' : ''}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className={`flex-1 min-w-0 ${isDisabled ? 'pointer-events-none select-none' : ''}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{b.bill_number}</span>
                          <span className="text-gray-500">·</span>
                          <span className="text-sm text-gray-600">{b.oc_number}</span>
                          <span className="text-gray-500">·</span>
                          <span className="text-sm text-gray-600">{b.client_name}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {b.billing_template}
                          {isCreditNoteRequested && (
                            <span
                              className={`ml-2 px-1.5 py-0.5 rounded ${
                                isCreditNoteApproved
                                  ? 'bg-green-100 text-green-800'
                                  : isPending
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              Credit note: {isCreditNoteApproved ? 'Approved' : isPending ? 'Pending approval' : '–'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {!isCreditNoteRequested && (
                          <button
                            type="button"
                            onClick={() => requestCreditNote(b.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700"
                          >
                            <Receipt className="w-4 h-4" />
                            Credit Note
                          </button>
                        )}

                        {isPending && (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCreditNoteStatus(b.id, 'approved')}
                              className="p-2 rounded-lg text-green-600 hover:bg-green-50"
                              title="Approve credit note"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setCreditNoteStatus(b.id, null)}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                              title="Reject credit note"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </span>
                        )}

                        {isCreditNoteApproved && (
                          <button
                            type="button"
                            onClick={() => setEditingCreditNoteId(editingCreditNoteId === b.id ? null : b.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-100 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-200"
                          >
                            <Pencil className="w-4 h-4" />
                            {editingCreditNoteId === b.id ? 'Close edit' : 'Edit credit note'}
                          </button>
                        )}
                      </div>
                    </div>

                    {isCreditNoteApproved && editingCreditNoteId === b.id && (
                      <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-sm font-medium text-gray-700 mb-2">Credit note open for edit</p>
                        <p className="text-sm text-gray-600">
                          Credit note for bill <strong>{b.bill_number}</strong> is approved. You can edit details, amounts, and save. (Form/fields can be extended here.)
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreditNotes;
