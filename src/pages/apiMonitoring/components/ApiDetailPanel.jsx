import React, { useMemo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";
import { API_TYPES } from "../config/apiRegistry";
import { getHistoryForApi, chartDataFromHistory } from "../services/apiHealthService";
import {
  StatusBadge,
  UptimeProgressBar,
  SectionCard,
  MetaBadges,
} from "./ApiMonitoringUi";
import { formatMs } from "./apiMonitoringUtils";
import { LatencyTrendChart, AvailabilityTrendChart } from "./ApiHealthCharts";

function MetricTile({ label, children, t }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${t.border} ${t.dark ? "bg-slate-800/50" : "bg-gray-50/80"}`}>
      <p className={`text-[10px] uppercase font-medium tracking-wide ${t.muted}`}>{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function HistoryTable({ history, t }) {
  const rows = [...history].reverse();
  if (!rows.length) {
    return <p className={`text-xs text-center py-4 ${t.muted}`}>No history entries yet.</p>;
  }
  return (
    <div className={`overflow-x-auto max-h-64 overflow-y-auto rounded-lg border ${t.border}`}>
      <table className={`w-full text-xs ${t.text}`}>
        <thead className={`sticky top-0 ${t.tableHead}`}>
          <tr>
            <th scope="col" className="text-left font-semibold px-2 py-2 whitespace-nowrap">Time</th>
            <th scope="col" className="text-left font-semibold px-2 py-2 whitespace-nowrap">Status</th>
            <th scope="col" className="text-left font-semibold px-2 py-2 whitespace-nowrap">Latency</th>
            <th scope="col" className="text-left font-semibold px-2 py-2 whitespace-nowrap">HTTP</th>
            <th scope="col" className="text-left font-semibold px-2 py-2 max-w-[160px]">Error</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${t.border}`}>
          {rows.map((row) => (
            <tr key={row.id} className={t.tableRow}>
              <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTimeDdMmYyyy(row.checkedAt)}</td>
              <td className="px-2 py-1.5">
                <StatusBadge status={row.status} t={t} />
              </td>
              <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">{formatMs(row.latencyMs)}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.httpStatus || "—"}</td>
              <td className={`px-2 py-1.5 truncate max-w-[160px] ${row.errorMessage ? "text-red-500" : t.muted}`} title={row.errorMessage || ""}>
                {row.errorMessage || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiDetailPanel({
  apiDef,
  snapshot,
  t,
  reducedMotion,
  onRefreshOne,
  compact = false,
}) {
  const history = useMemo(
    () => (apiDef?.id ? getHistoryForApi(apiDef.id) : []),
    [apiDef?.id, snapshot?.checkedAt]
  );
  const chartData = useMemo(() => chartDataFromHistory(history, 30), [history]);

  if (!apiDef) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className={`text-xs ${t.muted}`}>{apiDef.description}</p>
          <MetaBadges apiDef={apiDef} t={t} API_TYPES={API_TYPES} />
        </div>
        {onRefreshOne ? (
          <button
            type="button"
            onClick={() => onRefreshOne(apiDef.id)}
            className={`inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors shrink-0 ${t.border} ${t.card} ${t.textSecondary} ${t.focusRing}`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check now
          </button>
        ) : null}
      </div>

      <div className={`rounded-lg border p-3 text-[11px] space-y-2 ${t.border} ${t.dark ? "bg-slate-800/30" : "bg-white/60"}`}>
        <div className="grid sm:grid-cols-2 gap-2">
          <p className={t.muted}>
            <span className={`font-medium ${t.textSecondary}`}>Endpoint:</span>{" "}
            <code className={`text-[10px] break-all ${t.text}`}>{apiDef.endpoint}</code>
          </p>
          <p className={t.muted}>
            <span className={`font-medium ${t.textSecondary}`}>Method:</span> {apiDef.httpMethod}
          </p>
          <p className={t.muted}>
            <span className={`font-medium ${t.textSecondary}`}>Module:</span> {apiDef.module}
          </p>
          <p className={t.muted}>
            <span className={`font-medium ${t.textSecondary}`}>Auth:</span> {apiDef.authType}
          </p>
          {apiDef.serviceOwner ? (
            <p className={t.muted}>
              <span className={`font-medium ${t.textSecondary}`}>Owner:</span> {apiDef.serviceOwner}
            </p>
          ) : null}
        </div>
        {apiDef.sourceFiles?.length ? (
          <div>
            <p className={`font-medium mb-1 ${t.textSecondary}`}>Source files</p>
            <ul className={`list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto ${t.muted}`}>
              {apiDef.sourceFiles.map((f) => (
                <li key={f} className="font-mono text-[10px]">{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {apiDef.callLocations?.length ? (
          <div>
            <p className={`font-medium mb-1 ${t.textSecondary}`}>Call locations</p>
            <ul className={`list-disc pl-4 space-y-0.5 max-h-24 overflow-y-auto ${t.muted}`}>
              {apiDef.callLocations.map((loc, i) => (
                <li key={i} className="text-[10px]">{loc}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {snapshot ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricTile label="Status" t={t}>
            <StatusBadge status={snapshot.status} t={t} />
          </MetricTile>
          <MetricTile label="Response time" t={t}>
            <p className={`text-sm font-bold tabular-nums ${t.text}`}>{formatMs(snapshot.latencyMs)}</p>
          </MetricTile>
          <MetricTile label="HTTP code" t={t}>
            <p className={`text-sm font-bold tabular-nums ${t.text}`}>{snapshot.httpStatus || "—"}</p>
          </MetricTile>
          <MetricTile label="Uptime" t={t}>
            <UptimeProgressBar percent={snapshot.uptimePercent} t={t} />
          </MetricTile>
        </div>
      ) : null}

      {snapshot?.errorMessage ? (
        <div className={`rounded-lg border px-3 py-2.5 text-xs flex gap-2 ${t.errorBanner}`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{snapshot.errorMessage}</span>
        </div>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-3">
        <SectionCard title="Response time trend" t={t} className="!shadow-none">
          <LatencyTrendChart data={chartData} t={t} reducedMotion={reducedMotion} compact={compact} />
        </SectionCard>
        <SectionCard title="Availability trend" t={t} className="!shadow-none">
          <AvailabilityTrendChart data={chartData} t={t} reducedMotion={reducedMotion} compact={compact} />
        </SectionCard>
      </div>

      <SectionCard
        title="Check history"
        t={t}
        right={<span className={`text-[11px] ${t.muted}`}>{history.length} entries (session)</span>}
        className="!shadow-none"
      >
        <HistoryTable history={history} t={t} />
      </SectionCard>

      <div className={`text-[11px] space-y-1 border-t pt-3 ${t.border} ${t.muted}`}>
        <p>
          <span className={`font-medium ${t.textSecondary}`}>Last successful check:</span>{" "}
          {snapshot?.lastSuccessAt ? formatDateTimeDdMmYyyy(snapshot.lastSuccessAt) : "—"}
        </p>
        <p>
          <span className={`font-medium ${t.textSecondary}`}>Last failure:</span>{" "}
          {snapshot?.lastFailureAt ? formatDateTimeDdMmYyyy(snapshot.lastFailureAt) : "—"}
        </p>
        <p>
          <span className={`font-medium ${t.textSecondary}`}>Last checked:</span>{" "}
          {snapshot?.checkedAt ? formatDateTimeDdMmYyyy(snapshot.checkedAt) : "—"}
        </p>
      </div>
    </div>
  );
}
