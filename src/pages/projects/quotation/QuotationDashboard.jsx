import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Percent,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  fetchQuotations,
  isFollowupOverdue,
  isOpenStatus,
  TERMINAL_CONVERTED,
  TERMINAL_LOST,
} from '../../../services/quotationApi';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import { formatCurrency, formatDisplayDate, todayIsoDate } from './quotationConstants';
import StatusBadge from './StatusBadge';
import QuotationDetailDrawer from './QuotationDetailDrawer';
import { CHART_SERIES, TOKENS } from '../../../theme/tokens';

function sumRate(list) {
  return list.reduce((s, r) => s + (Number(r.quoted_rate) || 0), 0);
}

function monthKey(dateStr) {
  const iso = normalizeToIsoDate(dateStr);
  return iso ? iso.slice(0, 7) : null;
}

export default function QuotationDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchQuotations();
      setRows((data || []).filter((r) => !r.superseded));
    } catch (err) {
      setError(err?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const today = todayIsoDate();

  const kpis = useMemo(() => {
    const active = rows;
    const converted = active.filter((r) => TERMINAL_CONVERTED.has(r.offer_status));
    const lost = active.filter((r) => TERMINAL_LOST.has(r.offer_status));
    const awaiting = active.filter((r) => r.offer_status === 'Awaiting Client Response');
    const hold = active.filter((r) => r.offer_status === 'Client Has Hold Enquiry');
    const decided = converted.length + lost.length;
    const conversionRate = decided > 0 ? (converted.length / decided) * 100 : 0;
    const overdue = active.filter((r) => isFollowupOverdue(r, today));
    return {
      total: active.length,
      totalValue: sumRate(active),
      convertedCount: converted.length,
      convertedValue: sumRate(converted),
      lostCount: lost.length,
      lostValue: sumRate(lost),
      awaitingCount: awaiting.length,
      awaitingValue: sumRate(awaiting),
      holdCount: hold.length,
      holdValue: sumRate(hold),
      conversionRate,
      overdue,
      openCount: active.filter((r) => isOpenStatus(r.offer_status)).length,
    };
  }, [rows, today]);

  const byType = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const t = r.offer_type || 'Unknown';
      if (!map.has(t)) map.set(t, { name: t, count: 0, value: 0 });
      const e = map.get(t);
      e.count += 1;
      e.value += Number(r.quoted_rate) || 0;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const byOwner = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const t = r.enquiry_received_from || r.owner_name || 'Unassigned';
      if (!map.has(t)) map.set(t, { name: t, count: 0, value: 0 });
      const e = map.get(t);
      e.count += 1;
      e.value += Number(r.quoted_rate) || 0;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [rows]);

  const monthly = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const m = monthKey(r.offer_date) || monthKey(r.created_at);
      if (!m) continue;
      if (!map.has(m)) map.set(m, { month: m, raised: 0, converted: 0, lost: 0 });
      const e = map.get(m);
      e.raised += 1;
      if (TERMINAL_CONVERTED.has(r.offer_status)) e.converted += 1;
      if (TERMINAL_LOST.has(r.offer_status)) e.lost += 1;
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => v);
  }, [rows]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Quotation Dashboard</h2>
          <p className="text-sm text-slate-500">Pivot-style summary of the offer database.</p>
        </div>
        <button
          type="button"
          onClick={fetchRows}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={Wallet} label="Total Offers" value={String(kpis.total)} sub={formatCurrency(kpis.totalValue)} />
        <Kpi
          icon={CheckCircle2}
          label="Order Converted"
          value={`${kpis.convertedCount}`}
          sub={formatCurrency(kpis.convertedValue)}
          tone="emerald"
        />
        <Kpi
          icon={TrendingDown}
          label="Order Lost"
          value={`${kpis.lostCount}`}
          sub={formatCurrency(kpis.lostValue)}
          tone="rose"
        />
        <Kpi
          icon={TrendingUp}
          label="Awaiting Response"
          value={`${kpis.awaitingCount}`}
          sub={formatCurrency(kpis.awaitingValue)}
          tone="blue"
        />
        <Kpi
          icon={AlertTriangle}
          label="On Hold"
          value={`${kpis.holdCount}`}
          sub={formatCurrency(kpis.holdValue)}
          tone="amber"
        />
        <Kpi
          icon={Percent}
          label="Conversion Rate"
          value={`${kpis.conversionRate.toFixed(1)}%`}
          sub="Converted / (Converted + Lost)"
          tone="violet"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Offers by Type">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byType}>
              <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: TOKENS.chartAxis }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TOKENS.chartAxis }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" name="Count" fill={CHART_SERIES[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Offers by Owner / Enquiry Source">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byOwner}>
              <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: TOKENS.chartAxis }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TOKENS.chartAxis }} />
              <Tooltip />
              <Bar dataKey="count" name="Count" fill={CHART_SERIES[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Monthly trend — raised vs converted vs lost">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke={TOKENS.chartGrid} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: TOKENS.chartAxis }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TOKENS.chartAxis }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="raised" name="Raised" fill={TOKENS.textDisabled} radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="converted" name="Converted" stroke={TOKENS.success} strokeWidth={2} />
            <Line type="monotone" dataKey="lost" name="Lost" stroke={TOKENS.critical} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            Overdue Follow-ups ({kpis.overdue.length})
          </h3>
        </div>
        {kpis.overdue.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500 text-center">No overdue follow-ups.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {kpis.overdue.slice(0, 15).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(r.id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{r.offer_no}</div>
                    <div className="text-xs text-slate-500">
                      {r.client_name} · Next was {formatDisplayDate(r.next_followup_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatCurrency(r.quoted_rate)}</span>
                    <StatusBadge status={r.offer_status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailId && (
        <QuotationDetailDrawer quotationId={detailId} onClose={() => setDetailId(null)} onChanged={fetchRows} />
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'from-slate-50 to-white border-slate-200',
    emerald: 'from-emerald-50 to-white border-emerald-200',
    rose: 'from-rose-50 to-white border-rose-200',
    blue: 'from-blue-50 to-white border-blue-200',
    amber: 'from-amber-50 to-white border-amber-200',
    violet: 'from-violet-50 to-white border-violet-200',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 text-slate-500 mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1 truncate">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}
