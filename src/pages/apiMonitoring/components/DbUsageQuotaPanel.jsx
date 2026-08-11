import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  Database,
  Minus,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";
import { SectionCard } from "./ApiMonitoringUi";
import {
  REALTIME_INCLUDED_MONTHLY,
  analyzeDbUsageTrend,
  fetchDbUsageHistory,
  formatCompactNumber,
  loadInvoiceChecklist,
  runDbUsageSnapshot,
  saveInvoiceChecklist,
} from "../services/dbUsageTrackerService";

function TrendBadge({ direction, changePct, t }) {
  if (direction === "unknown") {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${t.muted}`}>
        <Minus className="w-3.5 h-3.5" />
        Need 2+ days of snapshots
      </span>
    );
  }
  if (direction === "flat") {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${t.muted}`}>
        <Minus className="w-3.5 h-3.5" />
        Flat vs yesterday
      </span>
    );
  }
  const up = direction === "up";
  const pct =
    changePct == null || !Number.isFinite(changePct)
      ? ""
      : ` ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        up
          ? t.dark
            ? "text-red-400"
            : "text-red-600"
          : t.dark
            ? "text-emerald-400"
            : "text-emerald-600"
      }`}
    >
      {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {up ? "Increasing" : "Decreasing"}
      {pct}
    </span>
  );
}

function UsageTooltip({ active, payload, t }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div
      className="rounded-lg border px-2.5 py-2 text-[11px] shadow-lg"
      style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder }}
    >
      <p className="font-medium" style={{ color: t.text }}>
        {row?.date ? formatDateDdMmYyyy(row.date) : "—"}
      </p>
      {payload.map((p) => (
        <p key={p.dataKey} className={t.muted}>
          {p.name}:{" "}
          <span className="font-semibold" style={{ color: t.text }}>
            {formatCompactNumber(p.value)}
          </span>
        </p>
      ))}
      {row?.alert ? <p className="mt-1 text-red-500 font-medium">Alert day</p> : null}
    </div>
  );
}

/**
 * Supabase usage early-warning panel for API Health (proxy from DB writes → estimated Realtime pressure).
 */
export default function DbUsageQuotaPanel({ t, reducedMotion }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snapshotting, setSnapshotting] = useState(false);
  const [error, setError] = useState(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [checklist, setChecklist] = useState(() => loadInvoiceChecklist());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbUsageHistory(30);
      setRows(data);
      setTableMissing(false);
    } catch (err) {
      const msg = err?.message || "Failed to load usage history";
      if (/permission|RLS|not authorized|42501/i.test(msg)) {
        setError("You do not have access to DB usage tracking (IT/IS or Admin required).");
      } else if (/does not exist|schema cache/i.test(msg)) {
        setTableMissing(true);
        setRows([]);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const analysis = useMemo(() => analyzeDbUsageTrend(rows), [rows]);

  const onSnapshot = useCallback(async () => {
    setSnapshotting(true);
    setError(null);
    try {
      await runDbUsageSnapshot();
      setTableMissing(false);
      await load();
    } catch (err) {
      const msg = err?.message || "Snapshot failed";
      if (/does not exist|schema cache|function .*snapshot_db_usage/i.test(msg)) {
        setTableMissing(true);
        setError("Migration not applied yet — run supabase migration for db_usage_tracker.");
      } else if (/Not authorized|42501|permission/i.test(msg)) {
        setError("Not authorized to record a snapshot.");
      } else {
        setError(msg);
      }
    } finally {
      setSnapshotting(false);
    }
  }, [load]);

  const markInvoiceChecked = useCallback(() => {
    const next = saveInvoiceChecklist({
      ...checklist,
      lastCheckedOn: new Date().toISOString().slice(0, 10),
    });
    setChecklist(next);
  }, [checklist]);

  const anim = reducedMotion ? 0 : 400;

  return (
    <div className="space-y-3">
      {analysis.latestAlert || analysis.anyAlert ? (
        <div
          className={`rounded-xl border px-4 py-3 flex gap-3 items-start ${
            analysis.latestAlert
              ? t.dark
                ? "border-red-800 bg-red-950/40 text-red-100"
                : "border-red-300 bg-red-50 text-red-900"
              : t.dark
                ? "border-amber-800 bg-amber-950/30 text-amber-100"
                : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">
              {analysis.latestAlert
                ? "Daily DB write threshold exceeded — Realtime quota risk"
                : "Recent alert day in the last 30 days"}
            </p>
            <p className="text-xs opacity-90">
              Yesterday/today proxy:{" "}
              <strong>{formatCompactNumber(analysis.latestWrites)}</strong> DB writes → ~{" "}
              <strong>{formatCompactNumber(analysis.latestEst)}</strong> estimated Realtime messages
              (writes × subscriber multiplier). Threshold:{" "}
              {formatCompactNumber(analysis.threshold)} writes/day. Open Supabase → Organization → Usage
              to confirm Actual Realtime Messages and Upcoming Invoice.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className={`rounded-lg border px-3 py-2 text-xs ${t.border} ${t.dark ? "text-red-400" : "text-red-600"}`}>
          {error}
        </div>
      ) : null}

      {tableMissing ? (
        <div className={`rounded-lg border px-3 py-2 text-xs ${t.border} ${t.muted}`}>
          Usage tracker table is not on this database yet. Apply migration{" "}
          <code className={t.text}>20260810140000_db_usage_tracker.sql</code>, then click{" "}
          <strong className={t.text}>Record today&apos;s snapshot</strong>.
        </div>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-3">
        <SectionCard
          title="Supabase quota early warning"
          t={t}
          right={
            <button
              type="button"
              onClick={onSnapshot}
              disabled={snapshotting || loading}
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border ${t.border} ${t.card} ${t.focusRing} disabled:opacity-50`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${snapshotting ? "animate-spin" : ""}`} />
              {snapshotting ? "Recording…" : "Record today's snapshot"}
            </button>
          }
        >
          <p className={`text-xs mb-3 ${t.muted}`}>
            Proxy from Postgres write counters (insert/update/delete). Not the Supabase bill itself —
            use it to see if pressure is rising day over day before Realtime Messages hit the Pro
            cap ({formatCompactNumber(REALTIME_INCLUDED_MONTHLY)}/month).
          </p>

          {loading && !rows.length ? (
            <p className={`text-xs ${t.muted}`}>Loading usage history…</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className={`rounded-lg border px-3 py-2.5 ${t.border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${t.muted}`}>
                  Today / latest daily writes
                </p>
                <p className={`text-xl font-bold tabular-nums mt-1 ${t.text}`}>
                  {formatCompactNumber(analysis.latestWrites)}
                </p>
                <div className="mt-1.5">
                  <TrendBadge
                    direction={analysis.direction}
                    changePct={analysis.writeChangePct}
                    t={t}
                  />
                </div>
              </div>
              <div className={`rounded-lg border px-3 py-2.5 ${t.border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${t.muted}`}>
                  Est. Realtime messages (day)
                </p>
                <p className={`text-xl font-bold tabular-nums mt-1 ${t.text}`}>
                  {formatCompactNumber(analysis.latestEst)}
                </p>
                <p className={`text-[11px] mt-1.5 ${t.muted}`}>
                  vs prior day:{" "}
                  {analysis.estDelta == null
                    ? "—"
                    : `${analysis.estDelta > 0 ? "+" : ""}${formatCompactNumber(analysis.estDelta)}`}
                  {analysis.estChangePct != null
                    ? ` (${analysis.estChangePct > 0 ? "+" : ""}${analysis.estChangePct.toFixed(1)}%)`
                    : ""}
                </p>
              </div>
              <div className={`rounded-lg border px-3 py-2.5 ${t.border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${t.muted}`}>
                  7-day avg → 30-day projection
                </p>
                <p className={`text-xl font-bold tabular-nums mt-1 ${t.text}`}>
                  {formatCompactNumber(analysis.projectedMonthlyEstRt)}
                </p>
                <p className={`text-[11px] mt-1.5 ${t.muted}`}>
                  ~{analysis.quotaPct.toFixed(0)}% of included Realtime quota (
                  {formatCompactNumber(REALTIME_INCLUDED_MONTHLY)})
                </p>
              </div>
              <div className={`rounded-lg border px-3 py-2.5 ${t.border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${t.muted}`}>
                  Last snapshot
                </p>
                <p className={`text-sm font-semibold mt-1 ${t.text}`}>
                  {analysis.latest?.logged_at
                    ? formatDateTimeDdMmYyyy(analysis.latest.logged_at)
                    : "None yet"}
                </p>
                <p className={`text-[11px] mt-1.5 ${t.muted}`}>
                  {analysis.latest?.notes || "Nightly cron at 23:00 UTC when pg_cron is enabled."}
                </p>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Daily trend"
          t={t}
          className="lg:col-span-2"
          right={
            <span className={`inline-flex items-center gap-1 text-[11px] ${t.muted}`}>
              <TrendingUp className="w-3.5 h-3.5" />
              Last {Math.min(30, rows.length)} days
            </span>
          }
        >
          {!analysis.chartOldestFirst.length ? (
            <div className={`flex flex-col items-center justify-center py-12 gap-2 ${t.muted}`}>
              <Database className="w-8 h-8 opacity-40" strokeWidth={1.25} />
              <p className="text-xs text-center max-w-sm">
                No snapshots yet. Click <strong className={t.text}>Record today&apos;s snapshot</strong>{" "}
                to create the baseline, then again tomorrow to see day-over-day change.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={analysis.chartOldestFirst} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: t.chartTick }}
                  tickFormatter={(v) => String(v || "").slice(5)}
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 10, fill: t.chartTick }} width={44} tickFormatter={formatCompactNumber} />
                <Tooltip content={<UsageTooltip t={t} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="writes"
                  name="DB writes"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={anim > 0}
                  animationDuration={anim}
                />
                <Area
                  type="monotone"
                  dataKey="estimatedRt"
                  name="Est. Realtime msgs"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  isAnimationActive={anim > 0}
                  animationDuration={anim}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {rows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className={`border-b ${t.border} ${t.muted}`}>
                    <th className="text-left font-semibold py-1.5 pr-2">Date</th>
                    <th className="text-right font-semibold py-1.5 px-2">Writes</th>
                    <th className="text-right font-semibold py-1.5 px-2">Est. RT msgs</th>
                    <th className="text-right font-semibold py-1.5 pl-2">vs prior</th>
                    <th className="text-center font-semibold py-1.5 pl-2">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 14).map((r, idx) => {
                    const prev = rows[idx + 1];
                    const delta =
                      prev != null
                        ? (Number(r.total_daily_writes) || 0) - (Number(prev.total_daily_writes) || 0)
                        : null;
                    return (
                      <tr key={r.id || r.usage_date} className={`border-b border-dashed ${t.border}`}>
                        <td className={`py-1.5 pr-2 ${t.text}`}>
                          {formatDateDdMmYyyy(r.usage_date)}
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${t.text}`}>
                          {formatCompactNumber(r.total_daily_writes)}
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums ${t.text}`}>
                          {formatCompactNumber(r.estimated_realtime_messages)}
                        </td>
                        <td
                          className={`py-1.5 pl-2 text-right tabular-nums ${
                            delta == null
                              ? t.muted
                              : delta > 0
                                ? t.dark
                                  ? "text-red-400"
                                  : "text-red-600"
                                : delta < 0
                                  ? t.dark
                                    ? "text-emerald-400"
                                    : "text-emerald-600"
                                  : t.muted
                          }`}
                        >
                          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${formatCompactNumber(delta)}`}
                        </td>
                        <td className="py-1.5 pl-2 text-center">
                          {r.alert_triggered ? (
                            <span className={`font-semibold ${t.dark ? "text-red-400" : "text-red-600"}`}>Yes</span>
                          ) : (
                            <span className={t.muted}>No</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="Weekly bill check (Upcoming Invoice)"
        t={t}
        right={
          <span className={`inline-flex items-center gap-1 text-[11px] ${t.muted}`}>
            <CalendarCheck className="w-3.5 h-3.5" />
            Manual · 2 min
          </span>
        }
      >
        <p className={`text-xs mb-3 ${t.muted}`}>
          Supabase does not expose Upcoming Invoice via API reliably. Assign one owner (e.g. Rahul /
          Amit) to open Organization → Usage every Monday and note Realtime Messages + invoice
          estimate.
        </p>
        <ol className={`list-decimal pl-4 space-y-1.5 text-xs ${t.textSecondary}`}>
          <li>Open Supabase Dashboard → your org → Usage.</li>
          <li>Check Realtime Messages vs 5M included and Upcoming Invoice.</li>
          <li>If spend cap is disabled, confirm overage $ matches expected message growth.</li>
          <li>Mark checked below so the team has a local audit trail on this browser.</li>
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={markInvoiceChecked}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border ${t.border} ${t.card}`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Mark invoice checked today
          </button>
          <span className={`text-[11px] ${t.muted}`}>
            Last marked:{" "}
            {checklist.lastCheckedOn ? formatDateDdMmYyyy(checklist.lastCheckedOn) : "Never on this browser"}
          </span>
        </div>
      </SectionCard>
    </div>
  );
}
