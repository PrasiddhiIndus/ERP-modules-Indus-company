import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ERP_TIMEZONE } from '../utils/dateDisplay';
import { supabase } from '../lib/supabase';
import { Clock, ChevronLeft, ChevronRight, X } from 'lucide-react';

const PAGE_SIZE = 25;

function isoSinceHoursAgo(hours) {
  const d = new Date(Date.now() - hours * 60 * 60 * 1000);
  return d.toISOString();
}

/** Audit timestamps always in IST (dd/mm/yyyy HH:mm:ss), independent of the viewer's device zone. */
const IST_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ERP_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function fmtTime(ts) {
  if (!ts) return '';
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return String(ts);
  const p = Object.fromEntries(IST_PARTS.formatToParts(dt).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second} IST`;
}

function outcomeOf(r) {
  const o = String(r?.details?.outcome || '').toLowerCase();
  if (o) return o;
  if (r?.success === false) return r?.status_code === 401 || r?.status_code === 403 ? 'denied' : 'failed';
  return 'success';
}

/** Resolve user_id → profile (email, employee code) → employee master (full name). */
async function fetchActors(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const out = {};
  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, username, employee_code')
      .in('id', ids);
    const codes = [...new Set((profiles || []).map((p) => String(p.employee_code || '').trim()).filter(Boolean))];
    let names = {};
    if (codes.length) {
      const { data: emps } = await supabase
        .from('admin_ifsp_employee_master')
        .select('employee_code, full_name')
        .in('employee_code', codes);
      names = Object.fromEntries((emps || []).map((e) => [String(e.employee_code).trim(), e.full_name]));
    }
    for (const p of profiles || []) {
      const code = String(p.employee_code || '').trim() || null;
      out[p.id] = {
        name: (code && names[code]) || p.username || null,
        code,
        email: p.email || null,
      };
    }
  } catch {
    /* identity enrichment is optional — raw user_email still shown */
  }
  return out;
}

function friendlyUserNameFromEmail(email) {
  const e = String(email || '').trim();
  if (!e.includes('@')) return 'Someone';
  const local = e.split('@')[0] || '';
  const raw = (local.split('.')[0] || local).trim();
  if (!raw) return 'Someone';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function badgeFromRow(r) {
  const b = String(r.details?.badge || '').trim().toUpperCase();
  if (b) return b;
  const a = String(r.action || '').toUpperCase();
  if (a === 'INSERT') return 'CREATED';
  if (a === 'UPDATE') return 'UPDATED';
  if (a === 'DELETE') return 'DELETED';
  return a || 'ACTIVITY';
}

function badgeToneClass(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'CREATED' || c === 'DRAFT') return 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/70';
  if (c === 'UPDATED' || c === 'CHANGED') return 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/70';
  if (c === 'DELETED') return 'bg-rose-100 text-rose-900 ring-1 ring-rose-200/70';
  if (c === 'APPROVED') return 'bg-green-100 text-green-900 ring-1 ring-green-200/70';
  if (c === 'REJECTED') return 'bg-red-100 text-red-900 ring-1 ring-red-200/70';
  if (c === 'SUBMITTED') return 'bg-indigo-100 text-indigo-900 ring-1 ring-indigo-200/70';
  if (c === 'RPC' || c === 'CALL') return 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/70';
  return 'bg-slate-100 text-slate-800 ring-1 ring-slate-200/70';
}

function moduleOf(r) {
  return String(r?.module || r?.details?.module || r?.details?.screen || '').trim() || null;
}

function recordRefOf(r) {
  return String(r?.record_ref || r?.details?.record_ref || '').trim() || null;
}

export default function ActivityLogDrawer({ open, onClose }) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [moduleOptions, setModuleOptions] = useState([]);
  const [actors, setActors] = useState({});
  /** Rolling window: “last 1 hour” is recomputed whenever we load while the drawer is open. */
  const sinceHourAgoRef = useRef(isoSinceHoursAgo(1));
  const pageRef = useRef(0);
  const moduleFilterRef = useRef('');
  pageRef.current = page;
  moduleFilterRef.current = moduleFilter;

  const canPrev = page > 0;
  const canNext = rows.length === PAGE_SIZE;

  const fetchModuleOptions = async (since) => {
    try {
      const { data, error: qErr } = await supabase
        .from('erp_activity_log')
        .select('module, details')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (qErr) return;
      const set = new Set();
      for (const r of data || []) {
        const m = moduleOf(r);
        if (m) set.add(m);
      }
      setModuleOptions([...set].sort((a, b) => a.localeCompare(b)));
    } catch {
      /* optional */
    }
  };

  const fetchPage = async (p, filter) => {
    try {
      setLoading(true);
      setError('');
      const since = isoSinceHoursAgo(1);
      sinceHourAgoRef.current = since;
      const from = p * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (filter) {
        // Wider fetch then client-filter so older rows (module only in details) still match.
        const { data, error: qErr } = await supabase
          .from('erp_activity_log')
          .select('*')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(200);
        if (qErr) throw qErr;
        const filtered = (data || []).filter((r) => moduleOf(r) === filter);
        setRows(filtered.slice(from, to + 1));
      } else {
        const { data, error: qErr } = await supabase
          .from('erp_activity_log')
          .select('*')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (qErr) throw qErr;
        setRows(data || []);
      }
      void fetchModuleOptions(since);
    } catch (e) {
      setRows([]);
      const raw = e?.message || String(e || '');
      const hint =
        /relation|does not exist|permission denied|PGRST|schema/i.test(raw)
          ? ' Run `supabase/erp_activity_log_schema.sql` on your project and confirm RLS allows authenticated insert/select.'
          : '';
      setError(`${raw}${hint}`);
    } finally {
      setLoading(false);
    }
  };

  useLayoutEffect(() => {
    if (open) {
      setPage(0);
      setModuleFilter('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void fetchPage(page, moduleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page, moduleFilter]);

  useEffect(() => {
    if (!open) return undefined;

    let channel = null;
    try {
      channel = supabase
        .channel('erp-activity-log')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'erp_activity_log' },
          (payload) => {
            const r = payload?.new;
            if (!r?.created_at) return;
            if (new Date(r.created_at) < new Date(sinceHourAgoRef.current)) return;
            const m = moduleOf(r);
            if (m) {
              setModuleOptions((prev) => (prev.includes(m) ? prev : [...prev, m].sort((a, b) => a.localeCompare(b))));
            }
            const filter = moduleFilterRef.current;
            if (filter && moduleOf(r) !== filter) return;
            setRows((prev) =>
              pageRef.current === 0 ? [r, ...prev.filter((x) => x?.id !== r?.id)].slice(0, PAGE_SIZE) : prev
            );
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' && import.meta.env.DEV) {
            console.warn(
              '[Activity log] Realtime unavailable (enable `erp_activity_log` in Publication `supabase_realtime` if you want live rows).'
            );
          }
        });
    } catch {
      /* Realtime optional */
    }
    return () => {
      if (channel)
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const missing = [...new Set(rows.map((r) => r?.user_id).filter((id) => id && !(id in actors)))];
    if (!missing.length) return undefined;
    let cancelled = false;
    void fetchActors(missing).then((found) => {
      if (cancelled) return;
      setActors((prev) => {
        const next = { ...prev };
        for (const id of missing) next[id] = found[id] || null;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, rows, actors]);

  const filterChips = useMemo(() => moduleOptions, [moduleOptions]);

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

      {filterChips.length > 0 ? (
        <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          <button
            type="button"
            onClick={() => {
              setModuleFilter('');
              setPage(0);
            }}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 transition-colors ${
              !moduleFilter
                ? 'bg-slate-900 text-white ring-slate-900'
                : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            All
          </button>
          {filterChips.map((m) => (
            <button
              key={m}
              type="button"
              title={m}
              onClick={() => {
                setModuleFilter(m);
                setPage(0);
              }}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 max-w-[9.5rem] truncate transition-colors ${
                moduleFilter === m
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {error ? <div className="p-4 text-sm text-red-700">{error}</div> : null}
        {loading ? <div className="p-4 text-sm text-slate-600">Loading…</div> : null}
        {!loading && !rows.length && !error ? (
          <div className="p-4 text-sm text-slate-600">No activity in the last hour.</div>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const badge = badgeFromRow(r);
            const actor = r.user_id ? actors[r.user_id] : null;
            const email = actor?.email || r.user_email || '';
            const whoLabel =
              actor?.name ||
              (email
                ? friendlyUserNameFromEmail(email)
                : r.user_id
                  ? `User ${String(r.user_id).slice(0, 8)}…`
                  : 'Unknown user');
            const summary =
              r.details?.summary ||
              `${String(r.details?.verb || '').trim() || badge.toLowerCase()} · ${String(r.entity || 'record')}`.trim();
            const ref = recordRefOf(r);
            const mod = moduleOf(r);
            const outcome = outcomeOf(r);
            const changes = Array.isArray(r.details?.changes) ? r.details.changes : null;
            const isAuto = r.details?.trigger === 'automatic';
            const moduleFromPage = r.details?.module_source === 'page';
            return (
              <li
                key={r.id}
                className={`px-4 py-3 ${outcome !== 'success' ? 'bg-red-50/60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <span
                      className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${badgeToneClass(badge)}`}
                      title={`Action: ${badge}`}
                    >
                      {badge.replace(/_/g, ' ')}
                    </span>
                    {outcome !== 'success' ? (
                      <span
                        className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-red-600 text-white"
                        title={`HTTP ${r.status_code || '—'} — the database did not apply this change`}
                      >
                        {outcome === 'denied' ? 'Denied' : 'Failed'}
                      </span>
                    ) : null}
                    {isAuto ? (
                      <span
                        className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-900 ring-1 ring-amber-200/70"
                        title="No click or key press preceded this request — likely an automatic refresh, sync or timer"
                      >
                        Automatic
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">{fmtTime(r.created_at)}</span>
                </div>
                <p className="text-xs text-slate-900 mt-1.5 leading-snug">
                  <span className="font-semibold text-slate-950" title={email || undefined}>
                    {whoLabel}
                  </span>
                  {actor?.code ? <span className="text-slate-500"> ({actor.code})</span> : null}{' '}
                  <span className="text-slate-800">{summary}</span>
                  {ref ? (
                    <span className="ml-1.5 inline-flex align-middle px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
                      {ref}
                    </span>
                  ) : null}
                </p>
                {email ? <p className="text-[10px] text-slate-500 mt-0.5 truncate">{email}</p> : null}
                {changes?.length ? (
                  <details className="mt-1.5 group">
                    <summary className="text-[11px] text-slate-600 cursor-pointer list-none inline-flex items-center gap-1 hover:text-slate-800">
                      <span className="font-medium text-slate-700">Changes ({changes.length})</span>
                      <span className="text-slate-400 group-open:hidden">show</span>
                      <span className="text-slate-400 hidden group-open:inline">hide</span>
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {changes.map((c, i) => (
                        <li key={`${c.field}-${i}`} className="text-[11px] text-slate-600 break-words">
                          <span className="font-mono text-slate-700">{c.field}</span>:{' '}
                          {c.old !== undefined ? (
                            <>
                              <span className="line-through text-slate-400">{String(c.old)}</span> →{' '}
                            </>
                          ) : null}
                          <span className="text-slate-800">{String(c.new)}</span>
                        </li>
                      ))}
                    </ul>
                    {r.details?.old_values_captured === false ? (
                      <p className="text-[10px] text-slate-400 mt-0.5">Previous values were not recorded for this entry.</p>
                    ) : null}
                  </details>
                ) : r.details?.detail ? (
                  <details className="mt-1.5 group">
                    <summary className="text-[11px] text-slate-600 cursor-pointer list-none inline-flex items-center gap-1 hover:text-slate-800">
                      <span className="font-medium text-slate-700">Changes</span>
                      <span className="text-slate-400 group-open:hidden">show</span>
                      <span className="text-slate-400 hidden group-open:inline">hide</span>
                    </summary>
                    <p className="text-[11px] text-slate-600 mt-1 leading-snug break-words" title={r.details.detail}>
                      {r.details.detail}
                    </p>
                  </details>
                ) : null}
                <div className="text-[10px] text-slate-500 mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  {r.details?.entity_label ? <span>Type: {r.details.entity_label}</span> : null}
                  {mod ? (
                    <span
                      className="text-slate-500"
                      title={
                        moduleFromPage
                          ? 'Taken from the page the request was sent from — not proof of module access'
                          : undefined
                      }
                    >
                      {moduleFromPage ? 'Sent from page' : 'Module'}: <span className="text-slate-600">{mod}</span>
                    </span>
                  ) : null}
                  {r.entity ? (
                    <span>
                      Record: <span className="font-mono text-slate-600">{r.entity}</span>
                      {r.details?.record_id ? (
                        <span className="font-mono text-slate-400" title={r.details.record_id}>
                          {' '}
                          #{String(r.details.record_id).slice(0, 8)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {r.route ? (
                  <p className="text-[10px] text-slate-500 mt-1 truncate" title={r.route}>
                    Page path: <span className="font-mono text-slate-600">{r.route}</span>
                  </p>
                ) : null}
                {import.meta.env.DEV ? (
                  <p className="text-[9px] text-slate-400 mt-0.5 truncate font-mono" title={r.details?.path}>
                    REST: {r.details?.path || '—'}
                  </p>
                ) : null}
                {outcome !== 'success' ? (
                  <p className="mt-1 text-[11px] text-red-700">
                    {outcome === 'denied' ? 'Permission denied' : 'Failed'} (HTTP {r.status_code || '—'}) — not applied
                  </p>
                ) : null}
              </li>
            );
          })}
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
