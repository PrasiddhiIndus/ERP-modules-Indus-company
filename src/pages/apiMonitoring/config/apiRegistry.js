import { DISCOVERED_APIS, DISCOVERY_SCAN_META } from "./discoveredApiManifest";
import { buildCheckForEntry } from "./apiCheckHandlers";
import { API_TYPES, API_ENVIRONMENTS, API_STATUS, API_STATUS_LABELS } from "./apiConstants";

export { API_TYPES, API_ENVIRONMENTS, API_STATUS, API_STATUS_LABELS };

/**
 * Monitored APIs — auto-built from codebase discovery manifest.
 * To add a new API after scan: update discoveredApiManifest.js and apiCheckHandlers.js.
 */

/** @type {import('../services/apiHealthService').MonitoredApiDefinition[]} */
export const MONITORED_APIS = DISCOVERED_APIS.map((entry) => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  type: entry.type,
  environment: entry.environment,
  group: entry.category,
  module: entry.module,
  serviceOwner: entry.serviceOwner,
  endpoint: entry.endpoint,
  httpMethod: entry.httpMethod,
  authType: entry.authType,
  sourceFiles: entry.sourceFiles,
  callLocations: entry.callLocations,
  degradedThresholdMs: entry.degradedThresholdMs,
  check: buildCheckForEntry(entry),
}));

export function getApiById(id) {
  return MONITORED_APIS.find((api) => api.id === id) ?? null;
}

export function getDiscoveryMeta() {
  return {
    ...DISCOVERY_SCAN_META,
    monitorableCount: MONITORED_APIS.length,
    internalCount: MONITORED_APIS.filter((a) => a.type === "internal").length,
    externalCount: MONITORED_APIS.filter((a) => a.type === "external").length,
  };
}
