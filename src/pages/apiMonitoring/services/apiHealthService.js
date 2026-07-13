import { API_STATUS } from "../config/apiConstants";
import { MONITORED_APIS } from "../config/apiRegistry";

const HISTORY_STORAGE_KEY = "erp_api_health_history_v1";
const MAX_HISTORY_PER_API = 80;

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

/**
 * @typedef {Object} HistoryEntry
 * @property {string} id
 * @property {string} apiId
 * @property {string} status
 * @property {number} httpStatus
 * @property {number} latencyMs
 * @property {string|null} errorMessage
 * @property {string} checkedAt
 */

function loadHistoryStore() {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveHistoryStore(store) {
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
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
  const store = loadHistoryStore();
  const list = Array.isArray(store[apiId]) ? store[apiId] : [];
  const next = [...list, entry].slice(-MAX_HISTORY_PER_API);
  store[apiId] = next;
  saveHistoryStore(store);
  return next;
}

export function getHistoryForApi(apiId) {
  const store = loadHistoryStore();
  return Array.isArray(store[apiId]) ? store[apiId] : [];
}

export function getAllHistory() {
  return loadHistoryStore();
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

/** Run checks for all registered APIs (parallel). */
export async function runAllApiHealthChecks() {
  const results = await Promise.all(MONITORED_APIS.map((api) => runApiHealthCheck(api)));
  return Object.fromEntries(results.map((r) => [r.apiId, r]));
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
