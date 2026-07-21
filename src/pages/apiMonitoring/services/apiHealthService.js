import { API_STATUS } from "../config/apiConstants";
import { MONITORED_APIS } from "../config/apiRegistry";
import { resetHealthCheckTokenCache } from "../config/apiCheckHandlers";

const HISTORY_STORAGE_KEY = "erp_api_health_history_v1";
const SNAPSHOT_CACHE_KEY = "erp_api_health_snapshots_v1";
const MAX_HISTORY_PER_API = 40;
const DEFAULT_BATCH_SIZE = 4;
const BATCH_DELAY_MS = 60;
const SNAPSHOT_CACHE_TTL_MS = 45_000;

/** Fast checks first so the table fills in quickly; slow probes last. */
const CHECK_PRIORITY = {
  node_health: 1,
  supabase_rest: 1,
  supabase_auth_health: 1,
  node_attendance_status: 1,
  node_get: 2,
  indirect_etime_status: 2,
  node_auth_probe_get: 3,
  node_auth_probe_post: 3,
  node_auth_probe_post_bulk: 3,
  node_auth_probe_post_einvoice: 3,
  node_auth_probe_post_r2_presign: 3,
  node_auth_probe_post_fleet_presign: 3,
  indirect_whitebooks: 3,
  supabase_edge_function: 4,
  supabase_edge_function_named: 4,
  external_get: 4,
  supabase_realtime_ws: 5,
};

function apiCheckPriority(apiDef) {
  const key = apiDef.checkKey || apiDef.id;
  return CHECK_PRIORITY[key] ?? 3;
}

function sortedApisForRun(apis = MONITORED_APIS) {
  return [...apis].sort((a, b) => {
    const pa = apiCheckPriority(a);
    const pb = apiCheckPriority(b);
    if (pa !== pb) return pa - pb;
    return String(a.name).localeCompare(String(b.name));
  });
}

/**
 * @typedef {Object} CheckResult
 * @property {string} status
 * @property {number} httpStatus
 * @property {number} latencyMs
 * @property {string|null} errorMessage
 */

/**
 * @typedef {Object} MonitoredApiDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'internal'|'external'} type
 * @property {string} environment
 * @property {string} [group]
 * @property {number} degradedThresholdMs
 * @property {() => Promise<CheckResult>} check
 */

/**
 * @typedef {Object} ApiHealthSnapshot
 * @property {string} apiId
 * @property {string} status
 * @property {number} httpStatus
 * @property {number} latencyMs
 * @property {string|null} errorMessage
 * @property {string} checkedAt
 * @property {string|null} lastSuccessAt
 * @property {string|null} lastFailureAt
 * @property {number} uptimePercent
 */

/** In-memory history — one sessionStorage write per batch instead of per API. */
let historyStoreCache = null;
let historyDirty = false;

function loadHistoryStoreFromDisk() {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getHistoryStore() {
  if (!historyStoreCache) historyStoreCache = loadHistoryStoreFromDisk();
  return historyStoreCache;
}

function saveHistoryStoreToDisk(store) {
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

function flushHistoryStoreIfDirty() {
  if (historyDirty && historyStoreCache) {
    saveHistoryStoreToDisk(historyStoreCache);
    historyDirty = false;
  }
}

function computeUptimePercent(entries) {
  if (!entries?.length) return 100;
  const healthy = entries.filter((e) => e.status === API_STATUS.online).length;
  const degraded = entries.filter((e) => e.status === API_STATUS.degraded).length;
  const score = healthy + degraded * 0.5;
  return Math.round((score / entries.length) * 1000) / 10;
}

function deriveTimestamps(entries) {
  let lastSuccessAt = null;
  let lastFailureAt = null;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (!lastSuccessAt && e.status !== API_STATUS.offline) lastSuccessAt = e.checkedAt;
    if (!lastFailureAt && e.status === API_STATUS.offline) lastFailureAt = e.checkedAt;
    if (lastSuccessAt && lastFailureAt) break;
  }
  for (const e of entries) {
    if (e.status !== API_STATUS.offline && !lastSuccessAt) lastSuccessAt = e.checkedAt;
    if (e.status === API_STATUS.offline && !lastFailureAt) lastFailureAt = e.checkedAt;
  }
  return { lastSuccessAt, lastFailureAt };
}

function appendHistory(apiId, entry) {
  const store = getHistoryStore();
  const list = Array.isArray(store[apiId]) ? store[apiId] : [];
  const last = list[list.length - 1];
  const unchanged =
    last &&
    last.status === entry.status &&
    last.httpStatus === entry.httpStatus &&
    last.errorMessage === entry.errorMessage &&
    Math.abs((last.latencyMs || 0) - (entry.latencyMs || 0)) < 50;
  const next = unchanged ? list : [...list, entry].slice(-MAX_HISTORY_PER_API);
  if (!unchanged) {
    store[apiId] = next;
    historyDirty = true;
  }
  return next;
}

export function getHistoryForApi(apiId) {
  const store = getHistoryStore();
  return Array.isArray(store[apiId]) ? store[apiId] : [];
}

export function getAllHistory() {
  return getHistoryStore();
}

/** Last cached snapshots for instant paint while a refresh runs. */
export function loadCachedSnapshots() {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.snapshots || typeof parsed.snapshots !== "object") return null;
    return {
      snapshots: parsed.snapshots,
      cachedAt: parsed.cachedAt || null,
    };
  } catch {
    return null;
  }
}

function saveCachedSnapshots(snapshots) {
  try {
    sessionStorage.setItem(
      SNAPSHOT_CACHE_KEY,
      JSON.stringify({ cachedAt: new Date().toISOString(), snapshots })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Run health check for one API and persist snapshot + history.
 * @param {MonitoredApiDefinition} apiDef
 * @returns {Promise<ApiHealthSnapshot>}
 */
export async function runApiHealthCheck(apiDef) {
  const checkedAt = new Date().toISOString();
  let result;
  try {
    result = await apiDef.check();
  } catch (err) {
    result = {
      status: API_STATUS.offline,
      httpStatus: 0,
      latencyMs: 0,
      errorMessage: err?.message || "Check failed unexpectedly",
    };
  }

  const historyEntry = {
    id: `${apiDef.id}-${Date.now()}`,
    apiId: apiDef.id,
    status: result.status,
    httpStatus: result.httpStatus,
    latencyMs: result.latencyMs,
    errorMessage: result.errorMessage,
    checkedAt,
  };

  const history = appendHistory(apiDef.id, historyEntry);
  const { lastSuccessAt, lastFailureAt } = deriveTimestamps(history);

  return {
    apiId: apiDef.id,
    status: result.status,
    httpStatus: result.httpStatus,
    latencyMs: result.latencyMs,
    errorMessage: result.errorMessage,
    checkedAt,
    lastSuccessAt,
    lastFailureAt,
    uptimePercent: computeUptimePercent(history),
  };
}

/**
 * Run checks in small batches — fast APIs first, minimal UI/storage churn.
 * @param {(batchResults: Record<string, ApiHealthSnapshot>, meta: object) => void} [onBatchComplete]
 */
export async function runAllApiHealthChecksBatched(onBatchComplete, options = {}) {
  const batchSize = Number(options.batchSize) > 0 ? Number(options.batchSize) : DEFAULT_BATCH_SIZE;
  const delayMs = Number(options.delayMs) >= 0 ? Number(options.delayMs) : BATCH_DELAY_MS;
  const apis = sortedApisForRun(options.apis || MONITORED_APIS);
  const allResults = {};
  resetHealthCheckTokenCache();

  for (let i = 0; i < apis.length; i += batchSize) {
    const batch = apis.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((api) => runApiHealthCheck(api)));
    const batchMap = {};
    for (const result of batchResults) {
      allResults[result.apiId] = result;
      batchMap[result.apiId] = result;
    }
    flushHistoryStoreIfDirty();
    if (onBatchComplete) {
      onBatchComplete(batchMap, {
        batchIndex: Math.floor(i / batchSize),
        isFirstBatch: i === 0,
        isLastBatch: i + batchSize >= apis.length,
        total: apis.length,
        completed: Math.min(i + batchSize, apis.length),
      });
    }
    if (i + batchSize < apis.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  flushHistoryStoreIfDirty();
  saveCachedSnapshots(allResults);
  return allResults;
}

/** Run checks for all registered APIs (batched). */
export async function runAllApiHealthChecks() {
  return runAllApiHealthChecksBatched();
}

export function buildSummary(snapshots, apiDefs = MONITORED_APIS) {
  const list = apiDefs.map((def) => snapshots[def.id]).filter(Boolean);
  const total = apiDefs.length;
  const healthy = list.filter((s) => s.status === API_STATUS.online).length;
  const unhealthy = list.filter(
    (s) => s.status === API_STATUS.offline || s.status === API_STATUS.degraded
  ).length;
  const avgLatency =
    list.length > 0
      ? Math.round(list.reduce((sum, s) => sum + (s.latencyMs || 0), 0) / list.length)
      : 0;
  const avgUptime =
    list.length > 0
      ? Math.round((list.reduce((sum, s) => sum + (s.uptimePercent || 0), 0) / list.length) * 10) / 10
      : 100;

  return { total, healthy, unhealthy, avgLatency, avgUptime };
}

export function chartDataFromHistory(history, limit = 24) {
  const slice = history.slice(-limit);
  return slice.map((entry, index) => ({
    index: index + 1,
    time: entry.checkedAt,
    latencyMs: entry.latencyMs,
    availability:
      entry.status === API_STATUS.online ? 100 : entry.status === API_STATUS.degraded ? 50 : 0,
    status: entry.status,
    httpStatus: entry.httpStatus,
  }));
}

export { SNAPSHOT_CACHE_TTL_MS };
