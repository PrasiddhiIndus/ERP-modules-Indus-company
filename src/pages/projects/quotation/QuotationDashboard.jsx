import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Clock3, FileText, Loader2, RefreshCw, Target } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isSupabaseRealtimeEnabled } from '../../../lib/supabaseConfig';
import { PROJECTS_SCHEMA } from '../../../services/projectsApi';
import { fetchQuotations, fiscalYearFromDate, isFollowupOverdue } from '../../../services/quotationApi';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import {
  OFFER_BUCKETS,
  formatDisplayDate,
  offerBucketOf,
  quarterOf,
  todayIsoDate,
} from './quotationConstants';
import StatusBadge from './StatusBadge';
import QuotationDetailDrawer from './QuotationDetailDrawer';
import { UI_TOKENS } from '../../../theme/tokens';

/** ₹ 1,32,21,47,106.17 style (two decimals, Indian grouping). */
function inr(value) {
  const n = Number(value) || 0;
  return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ₹ 132.21 Cr / ₹ 25.85 L — compact Indian units for tiles and axes. */
function inrCompact(value, withSymbol = true) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sym = withSymbol ? '₹ ' : '';
  if (abs >= 1e7) return `${sym}${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${sym}${(n / 1e5).toFixed(2)} L`;
  return `${sym}${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function rowFiscalYear(r) {
  if (r.fiscal_year) return String(r.fiscal_year);
  const iso = normalizeToIsoDate(r.offer_date) || normalizeToIsoDate(r.created_at);
  return iso ? fiscalYearFromDate(iso) : null;
}

/** Rows shown in the conversion table / pie (Budgetary is listed only in the summary). */
const RATIO_BUCKETS = OFFER_BUCKETS.filter((b) => b.id !== 'budgetary');
const BUCKET_COLOR = Object.fromEntries(OFFER_BUCKETS.map((b) => [b.id, b.color]));
const FY_QUARTER_MONTHS = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'];

export default function QuotationDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const mountedRef = useRef(true);
  const refreshTimerRef = useRef(null);
  const loadSeqRef = useRef(0);

  const fetchRows = useCallback(async ({ showLoading = true } = {}) => {
    const seq = ++loadSeqRef.current;
    if (showLoading) {
      setLoading(true);
      setError('');
    } else {
      setRefreshing(true);
    }
    try {
      const data = await fetchQuotations();
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setRows((data || []).filter((r) => !r.superseded));
      setError('');
    } catch (err) {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setError(err?.message || 'Failed to load dashboard.');
    } finally {
      if (!mountedRef.current || seq !== loadSeqRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchRows({ showLoading: true });

    const schedule = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        fetchRows({ showLoading: false });
      }, 400);
    };

    let channel = null;
    if (isSupabaseRealtimeEnabled()) {
      channel = supabase
        .channel('projects-quotation-dashboard-live')
        .on(
          'postgres_changes',
          { event: '*', schema: PROJECTS_SCHEMA, table: 'quotations' },
          schedule
        )
        .on(
          'postgres_changes',
          { event: '*', schema: PROJECTS_SCHEMA, table: 'quotation_followups' },
          schedule
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setRealtimeLive(true);
        });
    }

    const interval = window.setInterval(() => fetchRows({ showLoading: false }), 45000);
    const onFocus = () => schedule();
    const onVis = () => {
      if (document.visibilityState === 'visible') schedule();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      if (channel) {
        channel.unsubscribe();
      }
      setRealtimeLive(false);
    };
  }, [fetchRows]);

  const today = todayIsoDate();
  const [fy, setFy] = useState('');

  const fyOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      const y = rowFiscalYear(r);
      if (y) set.add(y);
    }
    return [...set].sort().reverse();
  }, [rows]);

  const scoped = useMemo(() => (fy ? rows.filter((r) => rowFiscalYear(r) === fy) : rows), [rows, fy]);

  const summary = useMemo(() => {
    const buckets = Object.fromEntries(OFFER_BUCKETS.map((b) => [b.id, { count: 0, value: 0 }]));
    for (const r of scoped) {
      const id = offerBucketOf(r.offer_status);
      if (!id) continue;
      buckets[id].count += 1;
      buckets[id].value += Number(r.quoted_rate ?? r.grand_total) || 0;
    }
    const totalCount = OFFER_BUCKETS.reduce((s, b) => s + buckets[b.id].count, 0);
    const totalValue = OFFER_BUCKETS.reduce((s, b) => s + buckets[b.id].value, 0);
    // Same as the Excel sheet: Converted ÷ (Total − Hold − Budgetary)
    const ratioBase = totalCount - buckets.hold.count - buckets.budgetary.count;
    return {
      buckets,
      totalCount,
      totalValue,
      ratioBase,
      conversionRatio: pct(buckets.converted.count, ratioBase),
    };
  }, [scoped]);

  const pieData = useMemo(
    () =>
      RATIO_BUCKETS.map((b) => ({
        name: b.label,
        value: summary.buckets[b.id].count,
        color: b.color,
        pct: pct(summary.buckets[b.id].count, summary.totalCount),
      })).filter((d) => d.value > 0),
    [summary]
  );

  const quarterly = useMemo(() => {
    const qs = [1, 2, 3, 4].map((q) => ({
      name: `Order Converted - Q${q}`,
      short: `Q${q} · ${FY_QUARTER_MONTHS[q - 1]}`,
      orders: 0,
      value: 0,
    }));
    for (const r of scoped) {
      if (offerBucketOf(r.offer_status) !== 'converted') continue;
      const q = quarterOf(r.order_converted_date || r.offer_date);
      if (!q) continue;
      qs[q - 1].orders += 1;
      qs[q - 1].value += Number(r.quoted_rate ?? r.grand_total) || 0;
    }
    return qs;
  }, [scoped]);

  const overdue = useMemo(() => scoped.filter((r) => isFollowupOverdue(r, today)), [scoped, today]);

  const maxQuarter = useMemo(() => quarterly.reduce((m, q) => (q.value > m.value ? q : m), quarterly[0]), [quarterly]);
  const convertedTotal = summary.buckets.converted.value;

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className={`p-3 sm:p-4 space-y-4 transition-opacity ${refreshing ? 'opacity-70' : ''}`}>
      {/* Title + the one filter row that scopes everything below */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 m-0">Quotation Dashboard</h2>
          <p className="text-sm text-slate-500 m-0 mt-0.5">
            Offer database summary{fy ? ` · FY ${fy}` : ' · all years'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {realtimeLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          ) : null}
          <select
            className="h-9 px-2.5 border border-slate-200 rounded-md text-sm bg-white text-slate-800"
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            aria-label="Financial year"
          >
            <option value="">All years</option>
            {fyOptions.map((y) => (
              <option key={y} value={y}>
                FY {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fetchRows({ showLoading: false })}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      )}

      {/* Headline tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatTile
          icon={FileText}
          label="Total offers"
          value={String(summary.totalCount)}
          sub={`${inrCompact(summary.totalValue)} quoted`}
        />
        <StatTile
          icon={Target}
          label="Conversion ratio"
          value={`${summary.conversionRatio.toFixed(2)}%`}
          sub={`${summary.buckets.converted.count} converted of ${summary.ratioBase} (excl. on hold & budgetary)`}
          accent
        >
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(summary.conversionRatio, 100)}%`, background: UI_TOKENS.accent }}
            />
          </div>
        </StatTile>
        <StatTile
          icon={CheckCircle2}
          iconColor={BUCKET_COLOR.converted}
          label="Order converted"
          value={inrCompact(convertedTotal)}
          sub={`${summary.buckets.converted.count} orders`}
        />
        <StatTile
          icon={Clock3}
          iconColor={BUCKET_COLOR.awaiting}
          label="Awaiting client response"
          value={inrCompact(summary.buckets.awaiting.value)}
          sub={`${summary.buckets.awaiting.count} offers in pipeline`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Offer summary */}
        <Card title="Offer Summary" className="xl:col-span-7">
          <div className="overflow-x-auto -mx-4">
            <table className="qd-table min-w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Status</th>
                  <th className="text-right">Total No. of Offer</th>
                  <th className="text-left">Share of value</th>
                  <th className="text-right">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {OFFER_BUCKETS.map((b) => {
                  const v = summary.buckets[b.id];
                  const share = pct(v.value, summary.totalValue);
                  return (
                    <tr key={b.id}>
                      <td>
                        <span className="inline-flex items-center gap-2 font-medium text-slate-800 whitespace-nowrap">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                          {b.label}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{v.count}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-[48px]">
                            <div className="h-full rounded-full" style={{ width: `${share}%`, background: b.color }} />
                          </div>
                          <span className="w-11 text-right text-xs text-slate-500 tabular-nums">{share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">{inr(v.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="text-right tabular-nums">{summary.totalCount}</td>
                  <td />
                  <td className="text-right tabular-nums whitespace-nowrap">{inr(summary.totalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 qd-subtotal">
            <span className="text-sm font-semibold text-slate-700">Sub Total</span>
            <span className="text-xl font-bold text-slate-900">{inr(summary.totalValue)}</span>
          </div>
        </Card>

        {/* Status share (conversion breakdown) */}
        <Card title="Offer Status Share" subtitle="Share of total offers" className="xl:col-span-5">
          {pieData.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4">
              <div className="relative w-[220px] h-[220px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={68}
                      outerRadius={100}
                      paddingAngle={2}
                      cornerRadius={4}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ShareTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-slate-900">{summary.totalCount}</span>
                  <span className="text-xs text-slate-500">offers</span>
                </div>
              </div>
              <ul className="w-full space-y-2.5">
                {RATIO_BUCKETS.map((b) => {
                  const c = summary.buckets[b.id].count;
                  const p = pct(c, summary.totalCount);
                  return (
                    <li key={b.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 text-slate-700 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                          <span className="truncate">{b.label}</span>
                        </span>
                        <span className="shrink-0 text-slate-900">
                          <span className="font-semibold">{p.toFixed(2)}%</span>
                          <span className="text-xs text-slate-500 ml-1.5">({c})</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Order value by quarter */}
        <Card
          title="Order Value"
          subtitle="Converted order value by financial-year quarter"
          className="xl:col-span-7"
          right={
            maxQuarter?.value > 0 ? (
              <span className="text-xs text-slate-500">
                Best: <span className="font-semibold text-slate-800">Q{quarterly.indexOf(maxQuarter) + 1}</span>
              </span>
            ) : null
          }
        >
          <div className="h-[280px] qd-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={quarterly} margin={{ top: 28, right: 24, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="qdOrderFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={UI_TOKENS.accent} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={UI_TOKENS.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={UI_TOKENS.chartGrid} />
                <XAxis
                  dataKey="short"
                  tickLine={false}
                  axisLine={{ stroke: UI_TOKENS.chartGrid }}
                  tick={{ fontSize: 11, fill: UI_TOKENS.chartAxis }}
                  interval={0}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: UI_TOKENS.chartAxis }}
                  tickFormatter={(v) => inrCompact(v, false)}
                  width={64}
                />
                <Tooltip content={<QuarterTooltip />} cursor={{ stroke: UI_TOKENS.chartAxis, strokeWidth: 1 }} />
                <Area
                  type="linear"
                  dataKey="value"
                  name="Order Value"
                  stroke={UI_TOKENS.accent}
                  strokeWidth={2}
                  fill="url(#qdOrderFill)"
                  dot={{ r: 4.5, fill: UI_TOKENS.accent, strokeWidth: 2, style: { stroke: 'var(--surface)' } }}
                  activeDot={{ r: 6, fill: UI_TOKENS.accent, strokeWidth: 2, style: { stroke: 'var(--surface)' } }}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    offset={12}
                    formatter={(v) => (v > 0 ? inrCompact(v) : '')}
                    style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-secondary)' }}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {quarterly.map((q, i) => (
              <div key={q.name} className="rounded-md qd-subtle px-2.5 py-2 text-center">
                <div className="text-[11px] font-semibold text-slate-500">Q{i + 1}</div>
                <div className="text-sm font-semibold text-slate-900 truncate" title={inr(q.value)}>
                  {inrCompact(q.value)}
                </div>
                <div className="text-[11px] text-slate-500">{q.orders} orders</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Overdue follow-ups */}
        <Card
          title="Overdue Follow-ups"
          className="xl:col-span-5"
          right={
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                overdue.length ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> {overdue.length}
            </span>
          }
          flush
        >
          {overdue.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No overdue follow-ups.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
              {overdue.slice(0, 15).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{r.client_name || r.offer_no}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {r.offer_no} · due {formatDisplayDate(r.next_followup_date)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-medium text-slate-900">{inrCompact(r.quoted_rate)}</span>
                      <StatusBadge status={r.offer_status} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {detailId && (
        <QuotationDetailDrawer
          quotationId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => fetchRows({ showLoading: false })}
        />
      )}

      <style>{`
        .qd-table.qd-table th {
          padding: 8px 12px !important; min-width: 0 !important; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .03em; color: var(--text-secondary); white-space: normal; line-height: 1.3; vertical-align: bottom;
          border-bottom: 1px solid var(--border);
        }
        .qd-table.qd-table td { padding: 9px 12px !important; min-width: 0 !important; border-bottom: 1px solid var(--divider); }
        .qd-table.qd-table tfoot td {
          font-weight: 700; color: var(--text-strong); border-bottom: 0; border-top: 1px solid var(--border-strong);
        }
        .qd-subtotal { background: var(--accent-soft, #E9ECFF); }
        .qd-subtle { background: var(--surface-sunken); }
        .qd-chart .recharts-cartesian-grid line,
        .qd-chart .recharts-cartesian-axis-line { stroke: var(--divider); }
        .qd-chart .recharts-cartesian-axis-tick-value tspan { fill: var(--text-muted); }
      `}</style>
    </div>
  );
}

function Card({ title, subtitle, right, className = '', flush = false, children }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 m-0">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500 m-0 mt-0.5">{subtitle}</p> : null}
        </div>
        {right}
      </header>
      <div className={flush ? '' : 'px-4 pb-4'}>{children}</div>
    </section>
  );
}

function StatTile({ icon: Icon, iconColor, label, value, sub, accent = false, children }) {
  return (
    <div
      className={`rounded-xl border bg-white shadow-sm p-4 ${accent ? 'border-blue-200' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-2 text-slate-500">
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg qd-subtle"
          style={iconColor ? { color: iconColor } : accent ? { color: UI_TOKENS.accent } : undefined}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 leading-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
      {children}
    </div>
  );
}

function TooltipBox({ children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">{children}</div>
  );
}

function ShareTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipBox>
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
        {d.name}
      </div>
      <div className="mt-1 text-slate-600">
        {d.value} offers · {d.pct.toFixed(2)}%
      </div>
    </TooltipBox>
  );
}

function QuarterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipBox>
      <div className="font-semibold text-slate-900">{d.name}</div>
      <div className="mt-1 text-slate-600">{inr(d.value)}</div>
      <div className="text-slate-500">{d.orders} orders</div>
    </TooltipBox>
  );
}

function EmptyChart() {
  return <div className="h-[220px] flex items-center justify-center text-sm text-slate-500">No offers yet.</div>;
}
