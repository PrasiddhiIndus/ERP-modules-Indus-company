import React, { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  Server,
  Wifi,
} from "lucide-react";
import { SortableHeader, useTableSort } from "../../../components/SortableTableHeader";
import { formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";
import { getApiById } from "../config/apiRegistry";
import ApiDetailPanel from "./ApiDetailPanel";
import {
  StatusBadge,
  UptimeProgressBar,
  LatencyBar,
  EmptyState,
  SkeletonTable,
  MonitoringDrawer,
  SectionCard,
} from "./ApiMonitoringUi";
import { formatMs } from "./apiMonitoringUtils";

const SORT_COLUMN_TYPES = {
  name: "string",
  type: "string",
  environment: "string",
  status: "string",
  latencyMs: "number",
  uptimePercent: "number",
  lastSuccessAt: "date",
};

const SORT_ACCESSORS = {
  name: (row) => row.name,
  type: (row) => row.type,
  environment: (row) => row.environment,
  status: (row) => row.status,
  latencyMs: (row) => row.latencyMs,
  uptimePercent: (row) => row.uptimePercent,
  lastSuccessAt: (row) => row.lastSuccessAt,
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function MobileApiCard({ row, t, onOpen, onRefreshOne, refreshing }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className={`w-full text-left rounded-xl border p-3 transition-colors ${t.card} ${t.cardHover} ${t.focusRing} ${t.focusRingDark}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-sm truncate ${t.text}`}>{row.name}</p>
          <p className={`text-[10px] truncate mt-0.5 ${t.muted}`}>{row._api.description}</p>
        </div>
        <StatusBadge status={row.status} t={t} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`text-xs tabular-nums font-medium ${t.textSecondary}`}>
          {row.latencyMs != null ? formatMs(row.latencyMs) : "—"}
        </span>
        <div className="flex-1 max-w-[120px]">
          {row.uptimePercent != null ? (
            <UptimeProgressBar percent={row.uptimePercent} t={t} showLabel={false} />
          ) : null}
        </div>
      </div>
      <div className={`mt-2 flex items-center justify-between text-[10px] ${t.muted}`}>
        <span>{row.type}</span>
        <span>{row.environment}</span>
      </div>
      <div
        role="presentation"
        className="mt-2 pt-2 border-t flex justify-end"
        style={{ borderColor: t.dark ? "#334155" : "#e5e7eb" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefreshOne(row.id);
          }}
          disabled={refreshing}
          className={`inline-flex items-center gap-1 text-[11px] font-medium ${t.accent} ${t.focusRing}`}
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
          Check
        </button>
      </div>
    </button>
  );
}

function DesktopTable({
  rows,
  t,
  expandedRowId,
  onToggleExpand,
  onRefreshOne,
  refreshing,
  reducedMotion,
}) {
  const { sortField, sortDirection, handleSort, sortedRows } = useTableSort(rows, {
    defaultField: "name",
    defaultDirection: "asc",
    columnTypes: SORT_COLUMN_TYPES,
    accessors: SORT_ACCESSORS,
  });

  const thClass = `text-left font-semibold px-3 py-2.5 whitespace-nowrap text-[11px] uppercase tracking-wide ${t.tableHead}`;

  const handleRowKeyDown = (e, rowId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggleExpand(rowId);
    }
  };

  return (
    <div className="overflow-x-auto -mx-3 sm:-mx-4">
      <table className="w-full min-w-[900px] text-xs border-collapse">
        <thead>
          <tr className={`border-b ${t.border}`}>
            <th scope="col" className={`${thClass} w-8 pl-4`} aria-label="Expand" />
            <SortableHeader field="name" label="API" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={thClass} />
            <SortableHeader field="type" label="Type" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={thClass} />
            <SortableHeader field="environment" label="Environment" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={thClass} />
            <SortableHeader field="status" label="Status" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={thClass} />
            <SortableHeader field="latencyMs" label="Response time" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={thClass} />
            <th scope="col" className={thClass}>HTTP</th>
            <SortableHeader field="uptimePercent" label="Uptime" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={thClass} />
            <SortableHeader field="lastSuccessAt" label="Last OK" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={`${thClass} hidden lg:table-cell`} />
            <th scope="col" className={`${thClass} w-12 pr-4`} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const expanded = expandedRowId === row.id;
            const apiDef = row._api;
            return (
              <React.Fragment key={row.id}>
                <tr
                  className={`border-b cursor-pointer transition-colors group ${t.border} ${
                    expanded ? t.tableRowExpanded : t.tableRow
                  }`}
                  onClick={() => onToggleExpand(row.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                  tabIndex={0}
                  aria-expanded={expanded}
                >
                  <td className="pl-4 py-2.5">
                    {expanded ? (
                      <ChevronDown className={`w-4 h-4 ${t.muted}`} />
                    ) : (
                      <ChevronRight className={`w-4 h-4 ${t.muted}`} />
                    )}
                  </td>
                  <td className="px-3 py-2.5 min-w-[160px]">
                    <p className={`font-medium ${t.text}`}>{row.name}</p>
                    <p className={`text-[10px] truncate max-w-[220px] ${t.muted}`}>
                      {apiDef.httpMethod} · {apiDef.module}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {apiDef.type === "internal" ? (
                        <Server className={`w-3 h-3 ${t.muted}`} />
                      ) : (
                        <Wifi className={`w-3 h-3 ${t.muted}`} />
                      )}
                      {row.type}
                    </span>
                  </td>
                  <td className={`px-3 py-2.5 whitespace-nowrap ${t.textSecondary}`}>{row.environment}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.status} t={t} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`tabular-nums font-medium ${
                        row.status === "degraded" ? (t.dark ? "text-amber-400" : "text-amber-700") : t.textSecondary
                      }`}
                    >
                      {row.latencyMs != null ? formatMs(row.latencyMs) : "—"}
                    </span>
                    <LatencyBar
                      latencyMs={row.latencyMs}
                      thresholdMs={apiDef.degradedThresholdMs}
                      status={row.status}
                      t={t}
                    />
                  </td>
                  <td className={`px-3 py-2.5 tabular-nums ${t.textSecondary}`}>{row.httpStatus || "—"}</td>
                  <td className="px-3 py-2.5 min-w-[100px]">
                    {row.uptimePercent != null ? (
                      <UptimeProgressBar percent={row.uptimePercent} t={t} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`px-3 py-2.5 whitespace-nowrap hidden lg:table-cell ${t.muted}`}>
                    {row.lastSuccessAt ? formatDateTimeDdMmYyyy(row.lastSuccessAt) : "—"}
                  </td>
                  <td className="pr-4 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRefreshOne(row.id);
                      }}
                      disabled={refreshing}
                      className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity ${t.accentSoft} ${t.focusRing}`}
                      title="Check now"
                      aria-label={`Check ${row.name} now`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""} ${t.accent}`} />
                    </button>
                  </td>
                </tr>
                {expanded ? (
                  <tr className={t.tableRowExpanded}>
                    <td colSpan={10} className="px-4 py-4 border-b" style={{ borderColor: t.dark ? "#334155" : "#e5e7eb" }}>
                      <div
                        className={`rounded-xl border p-4 ${t.border} ${t.dark ? "bg-slate-900/80" : "bg-slate-50/50"} ${
                          reducedMotion ? "" : "animate-fade-in"
                        }`}
                      >
                        <ApiDetailPanel
                          apiDef={apiDef}
                          snapshot={row._snap}
                          t={t}
                          reducedMotion={reducedMotion}
                          onRefreshOne={onRefreshOne}
                          compact
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiHealthTable({
  rows,
  loading,
  t,
  reducedMotion,
  onRefreshOne,
  refreshing,
  onClearFilters,
  mobileDrawerApiId,
  onMobileDrawerOpen,
  onMobileDrawerClose,
  snapshots,
}) {
  const isMobile = useIsMobile();
  const [expandedRowId, setExpandedRowId] = useState(null);

  const onToggleExpand = useCallback((rowId) => {
    setExpandedRowId((prev) => (prev === rowId ? null : rowId));
  }, []);

  const mobileApiDef = mobileDrawerApiId ? getApiById(mobileDrawerApiId) : null;
  const mobileSnapshot = mobileDrawerApiId ? snapshots[mobileDrawerApiId] : null;

  if (loading && !rows.some((r) => r._snap)) {
    return <SkeletonTable t={t} rows={5} />;
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No APIs match your filters"
        description="Try adjusting type, environment, status, or search terms."
        t={t}
        action={
          onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className={`mt-1 px-3 py-1.5 rounded-lg text-xs font-medium border ${t.accentSoft} ${t.focusRing}`}
            >
              Clear filters
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <>
      {isMobile ? (
        <div className="space-y-2 md:hidden">
          {rows.map((row) => (
            <MobileApiCard
              key={row.id}
              row={row}
              t={t}
              onOpen={onMobileDrawerOpen}
              onRefreshOne={onRefreshOne}
              refreshing={refreshing}
            />
          ))}
        </div>
      ) : (
        <div className="hidden md:block">
          <DesktopTable
            rows={rows}
            t={t}
            expandedRowId={expandedRowId}
            onToggleExpand={onToggleExpand}
            onRefreshOne={onRefreshOne}
            refreshing={refreshing}
            reducedMotion={reducedMotion}
          />
        </div>
      )}

      <MonitoringDrawer
        open={Boolean(isMobile && mobileDrawerApiId)}
        title={mobileApiDef?.name || "API details"}
        onClose={onMobileDrawerClose}
        t={t}
      >
        {mobileApiDef ? (
          <ApiDetailPanel
            apiDef={mobileApiDef}
            snapshot={mobileSnapshot}
            t={t}
            reducedMotion={reducedMotion}
            onRefreshOne={onRefreshOne}
            compact
          />
        ) : null}
      </MonitoringDrawer>
    </>
  );
}

export function ApiHealthTableSection({
  rows,
  loading,
  t,
  reducedMotion,
  onRefreshOne,
  refreshing,
  onClearFilters,
  mobileDrawerApiId,
  onMobileDrawerOpen,
  onMobileDrawerClose,
  snapshots,
}) {
  return (
    <SectionCard
      title="API status"
      t={t}
      right={
        <span className={`text-[11px] ${t.muted}`}>
          {loading ? "Running initial checks…" : `${rows.length} API${rows.length === 1 ? "" : "s"}`}
        </span>
      }
    >
      <ApiHealthTable
        rows={rows}
        loading={loading}
        t={t}
        reducedMotion={reducedMotion}
        onRefreshOne={onRefreshOne}
        refreshing={refreshing}
        onClearFilters={onClearFilters}
        mobileDrawerApiId={mobileDrawerApiId}
        onMobileDrawerOpen={onMobileDrawerOpen}
        onMobileDrawerClose={onMobileDrawerClose}
        snapshots={snapshots}
      />
    </SectionCard>
  );
}
