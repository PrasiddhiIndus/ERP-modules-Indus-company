import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, X } from 'lucide-react';
import { getEnquiryFieldValue, projectsTable } from '../../../services/projectsApi';
import { formatDisplayDate } from './enquiryConstants';
import { DUE_SOON_DAYS, getDaysLeft, isDueSoon, startOfToday } from './enquiryDeadlines';

const DISMISS_KEY = 'projects-enquiry-due-soon-dismissed';
const ENQUIRY_DATABASE_PATH = '/app/projects/enquiry/enquiry-database';
const MAX_LISTED = 5;

function dismissStamp(ids) {
  return `${startOfToday().toDateString()}|${[...ids].sort().join(',')}`;
}

function dueLabel(days) {
  if (days === 0) return 'Due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/** Bottom-right reminder of open enquiries due within DUE_SOON_DAYS days. */
export default function EnquiryDueSoonPopup() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await projectsTable('enquiries').select('id, serial_number, data');
        if (error) throw error;
        if (!cancelled) setRows(data || []);
      } catch (err) {
        console.warn('Enquiry due-soon reminder could not load enquiries', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dueRows = useMemo(() => {
    const today = startOfToday();
    return rows
      .filter((row) => isDueSoon(row, today))
      .map((row) => ({ row, days: getDaysLeft(row, today) }))
      .sort((a, b) => a.days - b.days || (a.row.serial_number ?? 0) - (b.row.serial_number ?? 0));
  }, [rows]);

  const ids = useMemo(() => dueRows.map(({ row }) => row.id), [dueRows]);

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
      /* storage unavailable — hide for this view only */
    }
    setDismissed(true);
  };

  const openAll = () => {
    navigate(ENQUIRY_DATABASE_PATH, {
      state: { dashboardView: { label: `Due in ${DUE_SOON_DAYS} days`, ids } },
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full rounded-xl border border-amber-200 bg-white shadow-xl"
    >
      <div className="flex items-start gap-2 rounded-t-xl border-b border-amber-100 bg-amber-50 px-4 py-3">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">
            {ids.length} enquir{ids.length === 1 ? 'y' : 'ies'} due in {DUE_SOON_DAYS} days
          </p>
          <p className="text-xs text-amber-800/80">Open enquiries close to their target date</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-amber-700 hover:bg-amber-100"
          aria-label="Dismiss reminder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {dueRows.slice(0, MAX_LISTED).map(({ row, days }) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2 text-xs">
            <span className="w-10 shrink-0 font-semibold tabular-nums text-slate-700">#{row.serial_number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">
                {getEnquiryFieldValue(row, 'client_name') || '—'}
              </span>
              <span className="block truncate text-slate-500">
                Target {formatDisplayDate(getEnquiryFieldValue(row, 'target_date'))}
                {getEnquiryFieldValue(row, 'assigned_to_person')
                  ? ` · ${getEnquiryFieldValue(row, 'assigned_to_person')}`
                  : ''}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${
                days === 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {dueLabel(days)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">
          {ids.length > MAX_LISTED ? `+${ids.length - MAX_LISTED} more` : ''}
        </span>
        <button
          type="button"
          onClick={openAll}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          View in Enquiry Database
        </button>
      </div>
    </div>
  );
}
