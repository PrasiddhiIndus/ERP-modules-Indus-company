import React, { useState } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { Modal } from '../../adminOperations/components/AdminUi';
import { formatDateDdMmYyyy } from '../../../utils/dateDisplay';
import { decideEnquiryDeletion, deletionErrorMessage } from './enquiryDeletionApi';

/** Manager view: pending enquiry deletion requests with Approve / Reject. */
export default function EnquiryDeletionRequests({ requests, serialById, onDecided }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  if (!requests.length) return null;

  const decide = async (req, approve) => {
    const question = approve
      ? `Delete enquiry #${serialById.get(req.enquiry_id) ?? req.enquiry_serial} permanently?`
      : 'Reject this request? The enquiry will stay.';
    if (!window.confirm(question)) return;
    setBusyId(req.id);
    setError('');
    try {
      await decideEnquiryDeletion(req.id, approve);
      await onDecided(approve ? 'Enquiry deleted.' : 'Deletion request rejected.');
      if (requests.length === 1) setOpen(false);
    } catch (err) {
      setError(deletionErrorMessage(err, 'Could not save your decision. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-900">
        <span className="inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          {requests.length} enquiry deletion request{requests.length === 1 ? '' : 's'} waiting for your approval
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          Review
        </button>
      </div>

      <Modal open={open} title="Enquiry deletion requests" onClose={() => setOpen(false)} widthClass="max-w-2xl">
        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
        )}
        <ul className="divide-y divide-gray-100">
          {requests.map((req) => (
            <li key={req.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">
                  #{serialById.get(req.enquiry_id) ?? req.enquiry_serial} · {req.enquiry_client || 'No client name'}
                </p>
                <p className="text-xs text-gray-600">
                  Requested by {req.requested_by_name || 'a user'} on {formatDateDdMmYyyy(req.requested_at)}
                </p>
                {req.reason && <p className="mt-1 text-xs text-gray-700">Reason: {req.reason}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId != null}
                  onClick={() => decide(req, false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
                <button
                  type="button"
                  disabled={busyId != null}
                  onClick={() => decide(req, true)}
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
