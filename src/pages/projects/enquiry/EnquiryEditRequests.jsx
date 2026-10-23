import React, { useState } from 'react';
import { Check, History, Loader2, X } from 'lucide-react';
import { Modal } from '../../adminOperations/components/AdminUi';
import { formatDateDdMmYyyy } from '../../../utils/dateDisplay';
import { decideEnquiryEdit, editErrorMessage } from './enquiryEditApi';

function ChangeList({ changes }) {
  const list = Array.isArray(changes) ? changes : [];
  if (!list.length) return <p className="text-xs text-gray-500">No field details.</p>;
  return (
    <ul className="mt-2 space-y-1.5">
      {list.map((c) => (
        <li key={c.field_key} className="rounded-md border border-amber-100 bg-white px-2 py-1.5 text-xs text-gray-700">
          <span className="font-semibold text-gray-900">{c.label || c.field_key}</span>
          <span className="mx-1 text-gray-400">:</span>
          <span className="text-rose-700 line-through">{c.old_value || '—'}</span>
          <span className="mx-1 text-gray-400">→</span>
          <span className="text-emerald-700">{c.new_value || '—'}</span>
        </li>
      ))}
    </ul>
  );
}

/** Manager (L1) view: pending enquiry edit requests. */
export default function EnquiryEditRequests({ requests, serialById, onDecided }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  if (!requests.length) return null;

  const decide = async (req, approve) => {
    const serial = serialById.get(req.enquiry_id) ?? req.enquiry_serial;
    const question = approve
      ? `Apply the requested changes to enquiry #${serial}?`
      : 'Reject this edit request? The enquiry stays as it is.';
    if (!window.confirm(question)) return;
    setBusyId(req.id);
    setError('');
    try {
      await decideEnquiryEdit(req.id, approve);
      await onDecided(approve ? 'Enquiry changes approved and applied.' : 'Edit request rejected.');
      if (requests.length === 1) setOpen(false);
    } catch (err) {
      setError(editErrorMessage(err, 'Could not save your decision. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" />
          {requests.length} enquiry edit request{requests.length === 1 ? '' : 's'} waiting for L1 approval
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Review
        </button>
      </div>

      <Modal open={open} title="Enquiry edit requests (L1)" onClose={() => setOpen(false)} widthClass="max-w-2xl">
        {error && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
        )}
        <ul className="divide-y divide-gray-100">
          {requests.map((req) => (
            <li key={req.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">
                    #{serialById.get(req.enquiry_id) ?? req.enquiry_serial} · {req.enquiry_client || 'No client name'}
                  </p>
                  <p className="text-xs text-gray-600">
                    Requested by {req.requested_by_name || 'a user'} on {formatDateDdMmYyyy(req.requested_at)}
                  </p>
                  {req.reason && <p className="mt-1 text-xs text-gray-700">Note: {req.reason}</p>}
                  <ChangeList changes={req.changes} />
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
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busyId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
