import React, { useState } from 'react';
import { Check, Loader2, ThumbsDown, X } from 'lucide-react';
import { Modal } from '../../../../components/erpUi';
import { formatDateDdMmYyyy } from '../../../../utils/dateDisplay';
import { decideOrderLost, orderLostErrorMessage } from '../quotationOrderLostApi';

/** L1 / admin view: pending "Order Lost" requests. Approve applies the status; reject keeps the previous one. */
export default function QuotationOrderLostRequests({ requests, onDecided }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState({});

  if (!requests.length) return null;

  const decide = async (req, approve) => {
    const label = req.offer_no || req.client_name || 'quotation';
    setBusyId(req.id);
    setError('');
    try {
      const result = await decideOrderLost(req.id, approve, notes[req.id]);
      const message =
        result === 'approved'
          ? `${label} marked Order Lost.`
          : result === 'failed'
            ? `${label} could not be marked Order Lost (it was converted, superseded or deleted). The request is closed.`
            : `Order Lost request for ${label} rejected. The status stays ${req.previous_status || 'unchanged'}.`;
      await onDecided(message);
      if (requests.length === 1) setOpen(false);
    } catch (err) {
      setError(orderLostErrorMessage(err, 'Could not save your decision. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
        <span className="inline-flex items-center gap-2">
          <ThumbsDown className="h-4 w-4" />
          {requests.length} Order Lost request{requests.length === 1 ? '' : 's'} waiting for L1 approval
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Review
        </button>
      </div>

      <Modal open={open} title="Order Lost requests (L1)" onClose={() => setOpen(false)} widthClass="max-w-2xl">
        {error ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
        ) : null}
        <ul className="divide-y divide-slate-100">
          {requests.map((req) => (
            <li key={req.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {req.offer_no || '—'} · {req.client_name || 'No client name'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {req.previous_status || '—'} → <b>Order Lost</b> · requested by {req.requested_by_name || 'a user'} on{' '}
                    {formatDateDdMmYyyy(req.requested_at)}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    <span className="font-semibold">Reason:</span> {req.reason}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busyId != null}
                    onClick={() => void decide(req, false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                  <button
                    type="button"
                    disabled={busyId != null}
                    onClick={() => void decide(req, true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve Order Lost
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={notes[req.id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                placeholder="Note for the requester (optional)"
                disabled={busyId != null}
                className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
