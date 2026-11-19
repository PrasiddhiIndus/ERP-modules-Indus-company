import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Loader2, ThumbsDown, XCircle } from 'lucide-react';
import { Modal } from '../../../../components/erpUi';
import { formatDateDdMmYyyy } from '../../../../utils/dateDisplay';

function statusMeta(status) {
  switch (String(status || '').toLowerCase()) {
    case 'pending':
      return {
        label: 'Pending L1 approval',
        Icon: Clock,
        chip: 'border-amber-200 bg-amber-50 text-amber-900',
        banner: 'border-amber-200 bg-amber-50 text-amber-900',
      };
    case 'approved':
      return {
        label: 'Approved',
        Icon: CheckCircle2,
        chip: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        banner: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        Icon: XCircle,
        chip: 'border-rose-200 bg-rose-50 text-rose-900',
        banner: 'border-rose-200 bg-rose-50 text-rose-900',
      };
    case 'failed':
      return {
        label: 'Could not apply',
        Icon: XCircle,
        chip: 'border-slate-200 bg-slate-50 text-slate-800',
        banner: 'border-slate-200 bg-slate-50 text-slate-800',
      };
    default:
      return {
        label: status || '—',
        Icon: ThumbsDown,
        chip: 'border-slate-200 bg-slate-50 text-slate-800',
        banner: 'border-slate-200 bg-slate-50 text-slate-800',
      };
  }
}

/** Reportee box: own Order Lost requests with pending / approved / rejected + L1 remarks. */
export default function QuotationOrderLostMyStatus({ requests }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => (Array.isArray(requests) ? requests : []), [requests]);
  if (!items.length) return null;

  const pendingCount = items.filter((r) => r.status === 'pending').length;
  const rejectedCount = items.filter((r) => r.status === 'rejected').length;
  const summary =
    pendingCount > 0
      ? `${pendingCount} Order Lost request${pendingCount === 1 ? '' : 's'} waiting for L1`
      : rejectedCount > 0
        ? `${rejectedCount} Order Lost request${rejectedCount === 1 ? '' : 's'} rejected — see remarks`
        : `${items.length} recent Order Lost request${items.length === 1 ? '' : 's'}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-800">
        <span className="inline-flex items-center gap-2 min-w-0">
          <ThumbsDown className="h-4 w-4 shrink-0 text-slate-600" />
          <span className="truncate">{summary}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          View status
        </button>
      </div>

      <Modal open={open} title="My Order Lost requests" onClose={() => setOpen(false)} widthClass="max-w-2xl">
        <ul className="divide-y divide-slate-100">
          {items.map((req) => {
            const meta = statusMeta(req.status);
            const Icon = meta.Icon;
            return (
              <li key={req.id} className={`py-3 space-y-1.5 rounded-lg px-2 -mx-1 ${meta.banner}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 m-0">
                      {req.offer_no || '—'} · {req.client_name || 'No client name'}
                    </p>
                    <p className="text-xs text-slate-700 m-0 mt-0.5">
                      {req.previous_status || '—'} → <b>Order Lost</b> · requested{' '}
                      {formatDateDdMmYyyy(req.requested_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                </div>
                {req.reason ? (
                  <p className="text-xs text-slate-800 m-0">
                    <span className="font-semibold">Your reason:</span> {req.reason}
                  </p>
                ) : null}
                {req.status === 'rejected' ? (
                  <p className="text-xs text-rose-900 m-0 rounded-md border border-rose-200 bg-white/70 px-2 py-1.5">
                    <span className="font-semibold">Rejection remarks:</span>{' '}
                    {req.decision_note?.trim()
                      ? req.decision_note
                      : 'No remarks were provided by L1.'}
                    {req.decided_by_name ? (
                      <span className="block mt-0.5 text-[11px] text-rose-800/80">
                        By {req.decided_by_name}
                        {req.decided_at ? ` · ${formatDateDdMmYyyy(req.decided_at)}` : ''}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {req.status === 'approved' && req.decision_note?.trim() ? (
                  <p className="text-xs text-emerald-900 m-0">
                    <span className="font-semibold">L1 note:</span> {req.decision_note}
                  </p>
                ) : null}
                {req.status === 'failed' && req.decision_note?.trim() ? (
                  <p className="text-xs text-slate-800 m-0">
                    <span className="font-semibold">Details:</span> {req.decision_note}
                  </p>
                ) : null}
                {req.status === 'pending' ? (
                  <p className="text-[11px] text-amber-900/90 m-0 inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Waiting for your L1 manager to approve or reject.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
