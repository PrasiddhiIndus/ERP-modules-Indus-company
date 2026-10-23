import React, { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Modal } from '../../adminOperations/components/AdminUi';
import { formatDateDdMmYyyy } from '../../../utils/dateDisplay';
import { listEnquiryChangeHistory } from './enquiryEditApi';

function displayValue(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

/** History icon + modal of applied field changes (and optional pending diffs). */
export default function EnquiryChangeHistory({
  enquiryId,
  serialNumber,
  pendingChanges,
  hasHistoryHint = false,
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!open || !enquiryId) return;
    let cancelled = false;
    setLoading(true);
    listEnquiryChangeHistory(enquiryId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, enquiryId]);

  const pending = Array.isArray(pendingChanges) ? pendingChanges : [];
  const showDot = hasHistoryHint || pending.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-1 rounded text-slate-600 hover:bg-slate-100"
        title="Change history"
        aria-label="Change history"
      >
        <History className="h-3.5 w-3.5" />
        {showDot && (
          <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
        )}
      </button>

      <Modal
        open={open}
        title={`Change history · #${serialNumber ?? ''}`}
        onClose={() => setOpen(false)}
        widthClass="max-w-lg"
      >
        {pending.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-semibold text-amber-900">Waiting for L1 approval</p>
            <ul className="mt-2 space-y-1.5">
              {pending.map((c) => (
                <li key={`p-${c.field_key}`} className="text-xs text-gray-700">
                  <span className="font-medium">{c.label || c.field_key}</span>
                  <span className="mx-1 text-gray-400">:</span>
                  <span className="text-rose-700 line-through">{displayValue(c.old_value)}</span>
                  <span className="mx-1 text-gray-400">→</span>
                  <span className="text-emerald-700">{displayValue(c.new_value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : rows.length === 0 && pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No changes recorded yet.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-gray-900">{r.field_label || r.field_key}</span>
                  <span className="text-[10px] text-gray-500">
                    {formatDateDdMmYyyy(r.changed_at)}
                    {r.changed_by_name ? ` · ${r.changed_by_name}` : ''}
                    {r.source === 'approved_request' ? ' · via approval' : ''}
                  </span>
                </div>
                <p className="mt-1 text-gray-700">
                  <span className="text-rose-700 line-through">{displayValue(r.old_value)}</span>
                  <span className="mx-1 text-gray-400">→</span>
                  <span className="text-emerald-700">{displayValue(r.new_value)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
