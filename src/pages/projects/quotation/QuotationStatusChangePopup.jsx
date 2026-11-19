import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { formatDisplayDate, QUOTATION_BASE } from './quotationConstants';
import { canReceiveQuotationStatusNotifications } from './quotationNotificationRoles';
import { listQuotationStatusNotifications } from './quotationStatusNotificationsApi';

const DISMISS_KEY = 'projects-quotation-status-dismissed';
const QUOTATION_LIST_PATH = `${QUOTATION_BASE}/quotation-list`;
const MAX_LISTED = 5;

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dismissStamp(ids) {
  return `${new Date().toDateString()}|${[...ids].sort().join(',')}`;
}

/**
 * Projects quotation status-change feed (Manager / Executive only).
 * Separate from Enquiry Completed — own table, dismiss key, and deep-link.
 * Mount only under /app/projects for eligible recipients (see Layout).
 */
export default function QuotationStatusChangePopup() {
  const navigate = useNavigate();
  const { user, userProfile, accessibleModules } = useAuth();
  const eligible = canReceiveQuotationStatusNotifications(userProfile, accessibleModules);
  const [rows, setRows] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!eligible) {
      setRows([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await listQuotationStatusNotifications({ sinceIso: startOfTodayIso(), limit: 40 });
        if (!cancelled) setRows(data || []);
      } catch (err) {
        console.warn('Quotation status notifications could not load', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  const ids = useMemo(() => rows.map((r) => String(r.id)), [rows]);

  useEffect(() => {
    if (!ids.length) return;
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === dismissStamp(ids));
    } catch {
      setDismissed(false);
    }
  }, [ids]);

  if (!eligible || !ids.length || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, dismissStamp(ids));
    } catch {
      /* storage unavailable */
    }
    setDismissed(true);
  };

  const openQuotation = (row) => {
    if (!row?.quotation_id) {
      navigate(QUOTATION_LIST_PATH);
      return;
    }
    navigate(QUOTATION_LIST_PATH, {
      state: { openQuotationId: row.quotation_id, openOfferNo: row.offer_no || null },
    });
  };

  return (
    <div role="status" aria-live="polite" className="w-full rounded-xl border border-sky-200 bg-white shadow-xl">
      <div className="flex items-start gap-2 rounded-t-xl border-b border-sky-100 bg-sky-50 px-4 py-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sky-900">
            {ids.length} quotation status change{ids.length === 1 ? '' : 's'} today
          </p>
          <p className="text-xs text-sky-800/80">Projects Quotation notification</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 text-sky-700 hover:bg-sky-100"
          aria-label="Dismiss quotation status notifications"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
        {rows.slice(0, MAX_LISTED).map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => openQuotation(row)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-xs hover:bg-sky-50/80"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-slate-900">
                  {row.offer_no || '—'} · {row.client_name || 'No client name'}
                </span>
                <span className="mt-0.5 block text-slate-700">
                  <span className="text-slate-500">{row.previous_status || '—'}</span>
                  {' → '}
                  <span className="font-semibold text-sky-900">{row.new_status || '—'}</span>
                </span>
                <span className="mt-0.5 block truncate text-slate-500">
                  {formatDisplayDate(row.created_at) || 'Today'}
                  {row.created_by_name ? ` · ${row.created_by_name}` : ''}
                  {row.created_by && user?.id && row.created_by === user.id ? ' (you)' : ''}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
                Open
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">
          {ids.length > MAX_LISTED ? `+${ids.length - MAX_LISTED} more` : ''}
        </span>
        <button
          type="button"
          onClick={() => navigate(QUOTATION_LIST_PATH)}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
        >
          Quotation Master
        </button>
      </div>
    </div>
  );
}
