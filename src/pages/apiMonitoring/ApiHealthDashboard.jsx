import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_STATUS } from "./config/apiConstants";
import {
  MONITORED_APIS,
  API_TYPES,
  API_ENVIRONMENTS,
  API_STATUS_LABELS,
  getApiById,
  getDiscoveryMeta,
} from "./config/apiRegistry";
import { UNMONITORABLE_APIS } from "./config/unmonitorableApisReport";
import {
  runAllApiHealthChecksBatched,
  runApiHealthCheck,
  loadCachedSnapshots,
  SNAPSHOT_CACHE_TTL_MS,
} from "./services/apiHealthService";
import { humanizeApiErrorMessage } from "../../lib/apiBase";
import { useMonitoringTheme } from "./components/useMonitoringTheme";
import {
  MonitoringShell,
  MonitoringHeader,
  MonitoringHelp,
  ErrorBanner,
  PlatformStatusOverview,
  FilterPanel,
  SectionCard,
} from "./components/ApiMonitoringUi";
import { ApiHealthTableSection } from "./components/ApiHealthTable";
import DbUsageQuotaPanel from "./components/DbUsageQuotaPanel";

const REFRESH_OPTIONS = [
  { value: "0", label: "Off" },
  { value: "15000", label: "15 sec" },
  { value: "30000", label: "30 sec" },
  { value: "60000", label: "60 sec" },
];

function mergeSnapshots(prev, batch) {
  if (!batch || !Object.keys(batch).length) return prev;
  let changed = false;
  const next = { ...prev };
  for (const [id, snap] of Object.entries(batch)) {
    const existing = prev[id];
    if (
      !existing ||
      existing.status !== snap.status ||
      existing.checkedAt !== snap.checkedAt ||
      existing.latencyMs !== snap.latencyMs
    ) {
      next[id] = snap;
      changed = true;
    }
  }
  return changed ? next : prev;
}

export default function ApiHealthDashboard() {
  const { theme, toggleTheme, t, reducedMotion } = useMonitoringTheme();

  const cached = useMemo(() => loadCachedSnapshots(), []);
  const [snapshots, setSnapshots] = useState(() => cached?.snapshots || {});
  const [loading, setLoading] = useState(() => !cached?.snapshots || Object.keys(cached.snapshots).length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(cached?.cachedAt || null);
  const [error, setError] = useState(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [envFilter, setEnvFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [autoRefreshMs, setAutoRefreshMs] = useState("60000");
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const [mobileDrawerApiId, setMobileDrawerApiId] = useState(null);

  const runInFlightRef = useRef(false);
  const pendingBatchRef = useRef(null);
  const rafRef = useRef(null);
  const lastRefreshAtRef = useRef(cached?.cachedAt || null);

  const flushPendingBatches = useCallback(() => {
    rafRef.current = null;
    const batch = pendingBatchRef.current;
    if (!batch) return;
    pendingBatchRef.current = null;
    setSnapshots((prev) => mergeSnapshots(prev, batch));
  }, []);

  const queueBatchUpdate = useCallback(
    (batch) => {
      pendingBatchRef.current = { ...(pendingBatchRef.current || {}), ...batch };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(flushPendingBatches);
      }
    },
    [flushPendingBatches]
  );

  const runChecks = useCallback(async ({ silent = false, force = false } = {}) => {
    if (runInFlightRef.current) return;
    if (!force && silent && lastRefreshAtRef.current) {
      const age = Date.now() - new Date(lastRefreshAtRef.current).getTime();
      if (age >= 0 && age < SNAPSHOT_CACHE_TTL_MS) return;
    }

    runInFlightRef.current = true;
    if (!silent) setRefreshing(true);
    setError(null);

    try {
      await runAllApiHealthChecksBatched((batch, meta) => {
        queueBatchUpdate(batch);
        if (meta?.isFirstBatch) setLoading(false);
      });
      flushPendingBatches();
      lastRefreshAtRef.current = new Date().toISOString();
      setLastRefreshAt(lastRefreshAtRef.current);
    } catch (err) {
      setError(humanizeApiErrorMessage(err, "Failed to run health checks"));
    } finally {
      setLoading(false);
      setRefreshing(false);
      runInFlightRef.current = false;
    }
  }, [flushPendingBatches, queueBatchUpdate]);

  const runSingleCheck = useCallback(async (apiId) => {
    const def = getApiById(apiId);
    if (!def || runInFlightRef.current) return;
    runInFlightRef.current = true;
    setRefreshing(true);
    try {
      const result = await runApiHealthCheck(def);
      setSnapshots((prev) => mergeSnapshots(prev, { [apiId]: result }));
      lastRefreshAtRef.current = new Date().toISOString();
      setLastRefreshAt(lastRefreshAtRef.current);
    } catch (err) {
      setError(humanizeApiErrorMessage(err, `Failed to check ${def.name}`));
    } finally {
      setRefreshing(false);
      runInFlightRef.current = false;
    }
  }, []);

  const runChecksForIds = useCallback(async (apiIds) => {
    if (!apiIds?.length || runInFlightRef.current) return;
    runInFlightRef.current = true;
    setRefreshing(true);
    setError(null);
    try {
      const defs = apiIds.map(getApiById).filter(Boolean);
      const BATCH_SIZE = 5;
      for (let i = 0; i < defs.length; i += BATCH_SIZE) {
        const batch = defs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map((def) => runApiHealthCheck(def)));
        const batchMap = Object.fromEntries(results.map((r, idx) => [batch[idx].id, r]));
        queueBatchUpdate(batchMap);
      }
      flushPendingBatches();
      lastRefreshAtRef.current = new Date().toISOString();
      setLastRefreshAt(lastRefreshAtRef.current);
    } catch (err) {
      setError(humanizeApiErrorMessage(err, "Failed to run checks"));
    } finally {
      setRefreshing(false);
      runInFlightRef.current = false;
    }
  }, [flushPendingBatches, queueBatchUpdate]);

  useEffect(() => {
    runChecks({ silent: Boolean(cached?.snapshots && Object.keys(cached.snapshots).length) });
  }, [runChecks]); // eslint-disable-line react-hooks/exhaustive-deps -- mount refresh only

  useEffect(() => {
    const ms = Number(autoRefreshMs);
    if (!ms || autoRefreshPaused) return undefined;

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      runChecks({ silent: true });
    };

    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [autoRefreshMs, autoRefreshPaused, runChecks]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && autoRefreshMs !== "0" && !autoRefreshPaused) {
        runChecks({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [autoRefreshMs, autoRefreshPaused, runChecks]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const filteredApis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MONITORED_APIS.filter((api) => {
      if (typeFilter !== "all" && api.type !== typeFilter) return false;
      if (envFilter !== "all" && api.environment !== envFilter) return false;
      const snap = snapshots[api.id];
      if (statusFilter !== "all" && snap?.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        api.name,
        api.description,
        api.group,
        api.module,
        api.endpoint,
        api.httpMethod,
        api.authType,
        api.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [typeFilter, envFilter, statusFilter, search, snapshots]);

  const tableRows = useMemo(
    () =>
      filteredApis.map((api) => {
        const snap = snapshots[api.id];
        return {
          id: api.id,
          name: api.name,
          type: API_TYPES[api.type],
          environment: api.environment,
          module: api.module,
          httpMethod: api.httpMethod,
          endpoint: api.endpoint,
          status: snap?.status || API_STATUS.offline,
          latencyMs: snap?.latencyMs ?? null,
          httpStatus: snap?.httpStatus ?? null,
          uptimePercent: snap?.uptimePercent ?? null,
          lastSuccessAt: snap?.lastSuccessAt,
          lastFailureAt: snap?.lastFailureAt,
          errorMessage: snap?.errorMessage,
          checkedAt: snap?.checkedAt,
          _api: api,
          _snap: snap,
        };
      }),
    [filteredApis, snapshots]
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (typeFilter !== "all") n += 1;
    if (envFilter !== "all") n += 1;
    if (statusFilter !== "all") n += 1;
    if (search.trim()) n += 1;
    return n;
  }, [typeFilter, envFilter, statusFilter, search]);

  const clearFilters = useCallback(() => {
    setTypeFilter("all");
    setEnvFilter("all");
    setStatusFilter("all");
    setSearch("");
  }, []);

  const discoveryMeta = useMemo(() => getDiscoveryMeta(), []);

  const initialLoading = loading && !tableRows.some((r) => r._snap);

  return (
    <MonitoringShell t={t}>
      <MonitoringHeader
        t={t}
        theme={theme}
        onToggleTheme={toggleTheme}
        loading={loading}
        refreshing={refreshing}
        autoRefreshMs={autoRefreshMs}
        autoRefreshPaused={autoRefreshPaused}
        onAutoRefreshChange={(e) => setAutoRefreshMs(e.target.value)}
        onTogglePause={() => setAutoRefreshPaused((v) => !v)}
        onRefreshAll={() => runChecks({ force: true })}
        refreshOptions={REFRESH_OPTIONS}
        lastRefreshAt={lastRefreshAt}
      />

      <MonitoringHelp t={t} />

      <ErrorBanner message={error} t={t} />

      <PlatformStatusOverview
        apis={MONITORED_APIS}
        snapshots={snapshots}
        loading={initialLoading || refreshing}
        lastRefreshAt={lastRefreshAt}
        t={t}
      />

      <DbUsageQuotaPanel t={t} reducedMotion={reducedMotion} />

      <FilterPanel
        t={t}
        typeFilter={typeFilter}
        envFilter={envFilter}
        statusFilter={statusFilter}
        search={search}
        onTypeChange={(e) => setTypeFilter(e.target.value)}
        onEnvChange={(e) => setEnvFilter(e.target.value)}
        onStatusChange={(e) => setStatusFilter(e.target.value)}
        onSearchChange={(e) => setSearch(e.target.value)}
        onClearSearch={() => setSearch("")}
        environments={API_ENVIRONMENTS}
        statusLabels={API_STATUS_LABELS}
        activeFilterCount={activeFilterCount}
      />

      <ApiHealthTableSection
        rows={tableRows}
        loading={loading}
        t={t}
        reducedMotion={reducedMotion}
        onRefreshOne={runSingleCheck}
        onCheckAll={() => runChecksForIds(filteredApis.map((a) => a.id))}
        refreshing={refreshing}
        onClearFilters={clearFilters}
        mobileDrawerApiId={mobileDrawerApiId}
        onMobileDrawerOpen={setMobileDrawerApiId}
        onMobileDrawerClose={() => setMobileDrawerApiId(null)}
        snapshots={snapshots}
      />

      <SectionCard
        title="What we cannot check automatically"
        t={t}
        right={
          <span className={`text-[11px] ${t.muted}`}>
            {discoveryMeta.monitorableCount} services monitored
          </span>
        }
      >
        <p className={`text-xs mb-3 ${t.muted}`}>
          These need a person or another system to verify — the app cannot probe them from the browser.
        </p>
        <div
          className={`rounded-lg border px-3 py-2.5 text-[11px] space-y-2 ${t.border} ${
            t.dark ? "bg-slate-800/50" : "bg-gray-50"
          }`}
        >
          <ul className={`space-y-2 max-h-48 overflow-y-auto ${t.muted}`}>
            {UNMONITORABLE_APIS.map((item) => (
              <li
                key={item.id}
                className="border-b border-dashed pb-2 last:border-0 last:pb-0"
                style={{ borderColor: t.dark ? "var(--text-strong)" : "var(--border)" }}
              >
                <p className={`font-medium ${t.text}`}>{item.name}</p>
                <p className="text-[10px] mt-1">{item.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </MonitoringShell>
  );
}
