import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCircle2, X, XCircle } from 'lucide-react';
import { projectsTable } from '../../../services/projectsApi';
import { formatDisplayDate } from './enquiryConstants';
import { startOfToday } from './enquiryDeadlines';

const DISMISS_KEY = 'projects-enquiry-edit-decision-dismissed';
const ENQUIRY_DATABASE_PATH = '/app/projects/enquiry/enquiry-database';
const MAX_LISTED = 5;

function dismissStamp(ids) {
  return `${startOfToday().toDateString()}|${[...ids].sort().join(',')}`;
}

/**
 * Notifies the requester when L1 approves or rejects their enquiry edit
 * (including Target Date / Completed Date). Visible only under /app/projects.
 */
export default function EnquiryEditDecisionPopup() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dayStart = startOfToday().toISOString();
        const { data, error } = await projectsTable('enquiry_notifications')
          .select('id, enquiry_id, enquiry_serial, enquiry_client, kind, created_at, created_by_name')
          .in('kind', ['edit_rejected', 'edit_approved'])
          .gte('created_at', dayStart)
          .order('created_at', { ascending: false })
          .limit(40);
        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (err) {
        console.warn('Enquiry edit decision notifications could not load', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ids = useMemo(() => rows.map((r) => String(r.id)), [rows]);

  useEffect(() => {
    if (!ids.length) return;
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === dismissStamp(ids));
    } catch {
      setDismissed(false);
    }
  }, [ids]);

  if (!ids.length || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, dismissStamp(ids));
    } catch {
      /* storage unavailable */
    }
    setDismissed(true);
  };

  const rejectedCount = rows.filter((r) => r.kind === 'edit_rejected').length;
  const approvedCount = rows.length - rejectedCount;
  const headline =
    rejectedCount && approvedCount
      ? `${rows.length} enquiry edit decisions today`
      : rejectedCount
        ? `${rejectedCount} enquiry edit request${rejectedCount === 1 ? '' : 's'} rejected`
        : `${approvedCount} enquiry edit request${approvedCount === 1 ? '' : 's'} approved`;

  return (
    <div role="status" aria-live="polite" className="w-full rounded-xl border border-amber-200 bg-white shadow-xl">
      <div className="flex items-start gap-2 rounded-t-xl border-b border-amber-100 bg-amber-50 px-4 py-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">{headline}</p>
          <p className="text-xs text-amber-900/80">
            {rejectedCount
              ? 'Rejected Target Date / Completed Date were not written to the Enquiry Database.'
              : 'Approved Target Date / Completed Date are now on the Enquiry Database.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-amber-800 hover:bg-amber-100"
          aria-label="Dismiss edit decision notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {rows.slice(0, MAX_LISTED).map((row) => {
          const rejected = row.kind === 'edit_rejected';
          return (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className="w-10 shrink-0 font-semibold tabular-nums text-slate-700">
                #{row.enquiry_serial ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{row.enquiry_client || '—'}</span>
                <span className="block truncate text-slate-500">
                  {formatDisplayDate(row.created_at) || 'Today'}
                  {row.created_by_name ? ` · ${row.created_by_name}` : ''}
                </span>
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
                  rejected ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {rejected ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {rejected ? 'Rejected' : 'Approved'}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">{ids.length > MAX_LISTED ? `+${ids.length - MAX_LISTED} more` : ''}</span>
        <button
          type="button"
          onClick={() => navigate(ENQUIRY_DATABASE_PATH)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Open Enquiry Database
        </button>
      </div>
    </div>
  );
}
