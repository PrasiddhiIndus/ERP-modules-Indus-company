import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, History, Loader2, RefreshCw } from 'lucide-react';
import { Modal } from '../../../components/erpUi';
import {
  ACTIVITY_ENTITY,
  activityLogErrorMessage,
  listActivity,
  listQuotationRequestEvents,
} from './projectActivityLogApi';

const ACTION_META = {
  create: { label: 'Created', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  update: { label: 'Updated', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  status_change: { label: 'Status change', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  delete: { label: 'Deleted', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  request: { label: 'Request', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  failed: { label: 'Failed', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const prettify = (key) =>
  String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Value({ children }) {
  const text = children == null || children === '' ? '—' : String(children);
  return (
    <span className="inline-block max-w-full whitespace-pre-wrap break-words rounded bg-slate-50 px-1.5 py-0.5 text-[12px] text-slate-800" title={text}>
      {text.length > 400 ? `${text.slice(0, 400)}…` : text}
    </span>
  );
}

/**
 * History / Activity Log for one Projects record.
 * @param {{ open: boolean, onClose: () => void, entityType: 'quotation'|'po_at_glance', entityId: string,
 *           title?: string, fieldLabels?: Record<string,string> }} props
 */
export default function ProjectActivityLog({ open, onClose, entityType, entityId, title, fieldLabels = {} }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !entityId) return undefined;
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [log, requests] = await Promise.all([
          listActivity(entityType, entityId),
          entityType === ACTIVITY_ENTITY.QUOTATION ? listQuotationRequestEvents(entityId) : Promise.resolve([]),
        ]);
        if (!alive) return;
        const events = [
          ...log.map((r) => ({
            id: `log-${r.id}`,
            kind: r.action,
            changed_at: r.changed_at,
            actor: r.changed_by_name || (r.source === 'system' ? 'System' : ''),
            code: r.changed_by_employee_code,
            field: r.field_name,
            oldValue: r.old_value,
            newValue: r.new_value,
            seq: r.id,
          })),
          ...requests,
        ];
        events.sort((a, b) => {
          const t = new Date(b.changed_at) - new Date(a.changed_at);
          return t || (b.seq || 0) - (a.seq || 0);
        });
        setRows(events);
      } catch (err) {
        if (alive) setError(activityLogErrorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, entityType, entityId, reloadKey]);

  const labelOf = useMemo(() => (key) => fieldLabels[key] || prettify(key), [fieldLabels]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClass="max-w-3xl"
      title={
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" /> {title || 'Activity log'}
        </span>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="m-0 text-xs text-slate-500">
          Every change to this record, newest first. Recorded automatically by the database and cannot be edited.
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>
      ) : loading && rows.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          No recorded changes yet. Changes made from now on appear here.
        </p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {rows.map((e) => {
            const meta = ACTION_META[e.kind] || ACTION_META.update;
            return (
              <li key={e.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>
                  <span className="font-medium text-slate-900">
                    {e.title || (e.field ? labelOf(e.field) : e.kind === 'create' ? 'Record created' : e.kind === 'delete' ? 'Record deleted' : '')}
                  </span>
                  <span className="ml-auto whitespace-nowrap tabular-nums">{formatWhen(e.changed_at)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  by <span className="font-medium text-slate-800">{e.actor || 'Unknown user'}</span>
                  {e.code ? <span className="text-slate-500"> ({e.code})</span> : null}
                </div>
                {e.field ? (
                  <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
                    <Value>{e.oldValue}</Value>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <Value>{e.newValue}</Value>
                  </div>
                ) : e.detail || e.newValue || e.oldValue ? (
                  <p className="mt-1 text-xs text-slate-700 break-words">{e.detail || e.newValue || e.oldValue}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
