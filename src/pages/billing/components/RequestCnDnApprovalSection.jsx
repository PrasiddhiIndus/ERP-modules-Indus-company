import React, { useMemo, useState } from 'react';
import { FileWarning, ArrowRight } from 'lucide-react';

const STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

function requestStatus(inv) {
  return inv.cnDnRequestStatus || inv.cn_dn_request_status || null;
}

/**
 * Request Commercial approval to raise a credit/debit note against a saved tax invoice.
 * Used on Create Invoice and Add-On Invoices tabs (same billing context).
 */
export default function RequestCnDnApprovalSection({ invoices, setInvoices, onNavigateTab }) {
  const [invoiceId, setInvoiceId] = useState('');
  const [noteType, setNoteType] = useState('credit');
  const [reason, setReason] = useState('');

  const eligible = useMemo(
    () =>
      (invoices || []).filter((inv) => {
        const k = String(inv.invoiceKind || inv.invoice_kind || 'tax').toLowerCase();
        return k !== 'proforma' && k !== 'draft';
      }),
    [invoices]
  );

  const pendingList = useMemo(
    () => (invoices || []).filter((inv) => requestStatus(inv) === STATUS.PENDING),
    [invoices]
  );

  const approvedList = useMemo(
    () => (invoices || []).filter((inv) => requestStatus(inv) === STATUS.APPROVED),
    [invoices]
  );

  const selected = eligible.find((i) => String(i.id) === String(invoiceId));

  const submitRequest = () => {
    if (!selected) return;
    const st = requestStatus(selected);
    if (st === STATUS.PENDING || st === STATUS.APPROVED) {
      window.alert('This invoice already has a pending or approved CN/DN request. Open Credit / Debit Notes from the sidebar to approve or issue.');
      return;
    }
    const r = reason.trim();
    if (!r) {
      window.alert('Please enter a reason for the request.');
      return;
    }
    const nowIso = new Date().toISOString();
    setInvoices((prev) =>
      prev.map((i) =>
        String(i.id) === String(selected.id)
          ? {
              ...i,
              cnDnRequestStatus: STATUS.PENDING,
              cnDnRequestNoteType: noteType,
              cnDnRequestReason: r,
              cnDnRequestedAt: nowIso,
              cnDnApprovedAt: null,
            }
          : i
      )
    );
    setReason('');
    window.alert(
      'Request saved. Open Billing → Credit / Debit Notes in the left menu (or use the button below) to approve it.'
    );
  };

  return (
    <div className="space-y-4">
      {(pendingList.length > 0 || approvedList.length > 0) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-blue-950">
              {pendingList.length > 0 && (
                <span className="font-semibold">{pendingList.length} pending CN/DN request(s)</span>
              )}
              {pendingList.length > 0 && approvedList.length > 0 && ' · '}
              {approvedList.length > 0 && (
                <span className="font-semibold text-emerald-900">{approvedList.length} approved — issue note in Credit / Debit Notes</span>
              )}
            </p>
            {onNavigateTab ? (
              <button
                type="button"
                onClick={() => onNavigateTab('credit-notes')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
              >
                Open Credit / Debit Notes <ArrowRight className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          {pendingList.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-blue-900/90">
              {pendingList.map((inv) => (
                <li key={String(inv.id)}>
                  <span className="font-mono">{inv.taxInvoiceNumber || inv.bill_number}</span>
                  {' · '}
                  {(inv.cnDnRequestNoteType || inv.cn_dn_request_note_type) === 'debit' ? 'Debit' : 'Credit'}
                  {' · '}
                  {inv.clientLegalName || inv.client_name || '—'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/80 flex items-center gap-2">
          <FileWarning className="w-5 h-5 text-amber-700 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Credit / Debit note — request approval</h3>
            <p className="text-xs text-amber-800/90">
              After a tax invoice is saved, request approval here. Review and approve under{' '}
              <strong className="font-semibold">Billing → Credit / Debit Notes</strong> in the sidebar.
            </p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tax invoice</label>
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select invoice…</option>
                {eligible.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.taxInvoiceNumber || inv.bill_number || inv.id} — {inv.clientLegalName || inv.client_name || '—'}
                    {requestStatus(inv) === STATUS.PENDING
                      ? ' (pending)'
                      : requestStatus(inv) === STATUS.APPROVED
                        ? ' (approved — issue in C/D Notes)'
                        : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Note type</label>
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="credit">Credit note</option>
                <option value="debit">Debit note</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason for request</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Brief reason for Commercial approval"
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onNavigateTab ? (
              <button
                type="button"
                onClick={() => onNavigateTab('credit-notes')}
                className="px-3 py-2 text-sm font-medium border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-50"
              >
                Go to Credit / Debit Notes
              </button>
            ) : null}
            <button
              type="button"
              onClick={submitRequest}
              disabled={!invoiceId}
              className="px-4 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              Submit request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
