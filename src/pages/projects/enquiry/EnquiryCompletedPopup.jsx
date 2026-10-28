import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, X } from 'lucide-react';
import { projectsTable } from '../../../services/projectsApi';
import { formatDisplayDate } from './enquiryConstants';
import { startOfToday } from './enquiryDeadlines';

const DISMISS_KEY = 'projects-enquiry-completed-dismissed';
const ENQUIRY_DATABASE_PATH = '/app/projects/enquiry/enquiry-database';
const MAX_LISTED = 5;

function dismissStamp(ids) {
  return `${startOfToday().toDateString()}|${[...ids].sort().join(',')}`;
}

/**
 * Projects-module-only toast list of enquiries marked Completed today.
 * Mount only under /app/projects (see Layout).
 */
export default function EnquiryCompletedPopup() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dayStart = startOfToday().toISOString();
        const { data, error } = await projectsTable('enquiry_notifications')
          .select('id, enquiry_id, enquiry_serial, enquiry_client, created_at, created_by_name')
          .eq('kind', 'completed')
          .gte('created_at', dayStart)
          .order('created_at', { ascending: false })
          .limit(40);
        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (err) {
        console.warn('Enquiry completed notifications could not load', err);
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

  const openAll = () => {
    const enquiryIds = rows.map((r) => r.enquiry_id).filter(Boolean);
    navigate(ENQUIRY_DATABASE_PATH, {
      state: { dashboardView: { label: 'Completed today', ids: enquiryIds } },
    });
  };

  return (
    <div role="status" aria-live="polite" className="w-full rounded-xl border border-emerald-200 bg-white shadow-xl">
      <div className="flex items-start gap-2 rounded-t-xl border-b border-emerald-100 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">
            {ids.length} enquir{ids.length === 1 ? 'y' : 'ies'} completed today
          </p>
          <p className="text-xs text-emerald-800/80">Projects module notification</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-emerald-700 hover:bg-emerald-100"
          aria-label="Dismiss completed notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {rows.slice(0, MAX_LISTED).map((row) => (
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
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
              Completed
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">{ids.length > MAX_LISTED ? `+${ids.length - MAX_LISTED} more` : ''}</span>
        <button
          type="button"
          onClick={openAll}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          View in Enquiry Database
        </button>
      </div>
    </div>
  );
}
