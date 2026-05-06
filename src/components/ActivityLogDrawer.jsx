import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, ChevronLeft, ChevronRight, X } from 'lucide-react';

const PAGE_SIZE = 25;

function isoSinceHours(hours) {
  const d = new Date(Date.now() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

function fmtTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function friendlyUserNameFromEmail(email) {
  const e = String(email || '').trim();
  if (!e.includes('@')) return 'Someone';
  const local = e.split('@')[0] || '';
  const raw = (local.split('.')[0] || local).trim();
  if (!raw) return 'Someone';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export default function ActivityLogDrawer({ open, onClose }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sinceIso = useMemo(() => isoSinceHours(1), []);

  const canPrev = page > 0;
  const canNext = rows.length === PAGE_SIZE;

  const fetchPage = async (p) => {
    try {
      setLoading(true);
      setError('');
      const from = p * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error: qErr } = await supabase
        .from('erp_activity_log')
        .select('*')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (qErr) throw qErr;
      setRows(data || []);
    } catch (e) {
      setRows([]);
      setError(e?.message || 'Could not load activity log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPage(0);
    void fetchPage(0);
    // Live updates (last hour only)
    const channel = supabase
      .channel('erp-activity-log')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'erp_activity_log' },
        (payload) => {
          const r = payload?.new;
          if (!r?.created_at) return;
          if (new Date(r.created_at).toISOString() < sinceIso) return;
          // Only push live rows on first page to avoid pagination jumps.
          setRows((prev) => (page === 0 ? [r, ...prev].slice(0, PAGE_SIZE) : prev));
        }
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-[360px] max-w-[92vw] bg-white border-l border-slate-200 shadow-2xl flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 text-slate-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">Activity log</p>
            <p className="text-[11px] text-slate-500 truncate">Showing last 1 hour · stored permanently in Supabase</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md hover:bg-slate-100 text-slate-600"
          aria-label="Close activity log"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? <div className="p-4 text-sm text-red-700">{error}</div> : null}
        {loading ? <div className="p-4 text-sm text-slate-600">Loading…</div> : null}
        {!loading && !rows.length && !error ? (
          <div className="p-4 text-sm text-slate-600">No activity in the last hour.</div>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">
                    {(r.user_email ? friendlyUserNameFromEmail(r.user_email) : 'Someone')}{' '}
                    {r.details?.summary ? r.details.summary : 'performed an action'}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {r.user_email ? r.user_email : r.user_id ? `User ${String(r.user_id).slice(0, 8)}…` : 'Unknown user'}
                    {r.route ? <span className="text-slate-400"> · {r.route}</span> : null}
                  </p>
                </div>
                <div className="text-[11px] text-slate-500 shrink-0">{fmtTime(r.created_at)}</div>
              </div>
              {r.success === false ? (
                <p className="mt-1 text-[11px] text-red-700">Failed (HTTP {r.status_code || '—'})</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={!canPrev || loading}
          className="inline-flex items-center gap-1.5 text-sm text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <span className="text-xs text-slate-500">Page {page + 1}</span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!canNext || loading}
          className="inline-flex items-center gap-1.5 text-sm text-slate-700 disabled:opacity-40"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

