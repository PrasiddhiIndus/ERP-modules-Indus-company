import React, { useState } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { Modal } from '../../../../components/erpUi';
import { formatDateDdMmYyyy } from '../../../../utils/dateDisplay';
import { decideQuotationDeletion, deletionErrorMessage } from '../quotationDeletionApi';

/** L1 / admin view: pending quotation deletion requests. */
export default function QuotationDeletionRequests({ requests, onDecided }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  if (!requests.length) return null;

  const decide = async (req, approve) => {
    const label = req.offer_no || req.client_name || 'this quotation';
    const question = approve
      ? `Delete ${label} permanently? Related quotation details are removed too.`
      : 'Reject this request? The quotation will stay.';
    if (!window.confirm(question)) return;
    setBusyId(req.id);
    setError('');
    try {
      await decideQuotationDeletion(req.id, approve);
      await onDecided(approve ? 'Quotation deleted.' : 'Deletion request rejected.');
      if (requests.length === 1) setOpen(false);
    } catch (err) {
      setError(deletionErrorMessage(err, 'Could not save your decision. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-900">
        <span className="inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          {requests.length} quotation deletion request{requests.length === 1 ? '' : 's'} waiting for L1 approval
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          Review
        </button>
      </div>

      <Modal open={open} title="Quotation deletion requests (L1)" onClose={() => setOpen(false)} widthClass="max-w-2xl">
        {error ? (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
        ) : null}
        <ul className="divide-y divide-slate-100">
          {requests.map((req) => (
            <li key={req.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {req.offer_no || '—'} · {req.client_name || 'No client name'}
                </p>
                <p className="text-xs text-slate-600">
                  Requested by {req.requested_by_name || 'a user'} on {formatDateDdMmYyyy(req.requested_at)}
                </p>
                {req.reason ? <p className="mt-1 text-xs text-slate-700">Reason: {req.reason}</p> : null}
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
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Approve &amp; delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
