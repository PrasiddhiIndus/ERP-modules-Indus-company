import { apiUrl, fetchApiHealth } from "../../../lib/apiBase";
import { checkSupabaseConnection } from "../../../lib/supabase";
import { getSupabaseUrl, getSupabaseAnonKey } from "../../../lib/supabaseConfig";
import { API_STATUS } from "./apiConstants";

const DEFAULT_TIMEOUT_MS = 8000;

async function timedFetch(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      signal: controller.signal,
      headers: options.headers,
      body: options.body,
      mode: options.mode,
    });
    return { res, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    throw Object.assign(err || new Error("Request failed"), {
      latencyMs: Math.round(performance.now() - start),
      aborted: err?.name === "AbortError",
    });
  } finally {
    clearTimeout(timer);
  }
}

function resolveStatus(ok, latencyMs, degradedThresholdMs) {
  if (!ok) return API_STATUS.offline;
  if (latencyMs > degradedThresholdMs) return API_STATUS.degraded;
  return API_STATUS.online;
}

function offlineResult(err) {
  return {
    status: API_STATUS.offline,
    httpStatus: 0,
    latencyMs: err?.latencyMs ?? 0,
    errorMessage: err?.aborted ? "Request timed out" : err?.message || "Unreachable",
  };
}

function reachableFromStatus(status) {
  return status === 200 || status === 400 || status === 401 || status === 403 || status === 405 || status === 422;
}

async function checkRealtimeWebSocket() {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: "Supabase not configured" };
  }
  const wsUrl = `${String(supabaseUrl)
    .replace(/^https:/i, "wss:")
    .replace(/^http:/i, "ws:")
    .replace(/\/+$/, "")}/realtime/v1/websocket?apikey=${encodeURIComponent(supabaseAnonKey)}&vsn=1.0.0`;

  const start = performance.now();
  return new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(wsUrl);
    const finish = (result) => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ ...result, latencyMs: Math.round(performance.now() - start) });
    };
    const t = setTimeout(() => finish({ ok: false, error: "WebSocket timeout" }), 5000);
    ws.onopen = () => {
      clearTimeout(t);
      finish({ ok: true });
    };
    ws.onerror = () => {
      clearTimeout(t);
      finish({ ok: false, error: "WebSocket connection failed" });
    };
    ws.onclose = () => {
      clearTimeout(t);
      if (!done) finish({ ok: false, error: "WebSocket closed before open" });
    };
  });
}

/** @type {Record<string, (entry: object) => Promise<object>>} */
export const API_CHECK_HANDLERS = {
  node_health: async (entry) => {
    const start = performance.now();
    const result = await fetchApiHealth({ timeoutMs: DEFAULT_TIMEOUT_MS });
    const latencyMs = Math.round(performance.now() - start);
    const ok = Boolean(result.ok);
    return {
      status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
      httpStatus: result.status || (ok ? 200 : 0),
      latencyMs,
      errorMessage: ok ? null : result.error || "Health check failed",
    };
  },

  node_get: async (entry) => {
    const path = entry.endpoint.split(",")[0].trim();
    try {
      const { res, latencyMs } = await timedFetch(apiUrl(path));
      const ok = res.ok;
      let errorMessage = null;
      if (!ok) {
        const text = await res.text().catch(() => "");
        errorMessage = text.slice(0, 200) || `HTTP ${res.status}`;
      }
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  node_auth_probe_get: async (entry) => {
    const path = entry.endpoint.split(",")[0].trim().split("?")[0];
    try {
      const { res, latencyMs } = await timedFetch(apiUrl(path));
      const ok = reachableFromStatus(res.status);
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok ? null : `HTTP ${res.status}`,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  node_auth_probe_post: async (entry) => {
    const path = entry.endpoint.split(",")[0].trim();
    try {
      const { res, latencyMs } = await timedFetch(apiUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const ok = reachableFromStatus(res.status);
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok ? null : `HTTP ${res.status}`,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  node_auth_probe_post_bulk: async (entry) =>
    API_CHECK_HANDLERS.node_auth_probe_post({ ...entry, endpoint: "/api/admin/bulk-create-users" }),

  node_auth_probe_post_einvoice: async (entry) =>
    API_CHECK_HANDLERS.node_auth_probe_post({ ...entry, endpoint: "/api/billing/e-invoice/generate" }),

  node_auth_probe_post_r2_presign: async (entry) =>
    API_CHECK_HANDLERS.node_auth_probe_post({ ...entry, endpoint: "/api/software-subscriptions/r2/presign-get" }),

  node_auth_probe_post_fleet_presign: async (entry) =>
    API_CHECK_HANDLERS.node_auth_probe_post({ ...entry, endpoint: "/api/fleet/r2/presign-get" }),

  supabase_rest: async (entry) => {
    const start = performance.now();
    const result = await checkSupabaseConnection();
    const latencyMs = Math.round(performance.now() - start);
    const ok = Boolean(result.ok);
    return {
      status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
      httpStatus: ok ? 200 : 0,
      latencyMs,
      errorMessage: ok ? null : result.message || "Connection failed",
    };
  },

  supabase_auth_health: async (entry) => {
    const base = String(getSupabaseUrl()).replace(/\/+$/, "");
    const anon = getSupabaseAnonKey();
    if (!base || !anon) {
      return {
        status: API_STATUS.offline,
        httpStatus: 0,
        latencyMs: 0,
        errorMessage: "Supabase URL or anon key not configured",
      };
    }
    try {
      const { res, latencyMs } = await timedFetch(`${base}/auth/v1/health`, {
        headers: { apikey: anon },
      });
      const ok = res.ok;
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok ? null : `Auth health HTTP ${res.status}`,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  supabase_realtime_ws: async (entry) => {
    try {
      const result = await checkRealtimeWebSocket();
      const ok = Boolean(result.ok);
      return {
        status: resolveStatus(ok, result.latencyMs, entry.degradedThresholdMs),
        httpStatus: ok ? 101 : 0,
        latencyMs: result.latencyMs,
        errorMessage: ok ? null : result.error || "Realtime WebSocket failed",
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  supabase_edge_function: async (entry) =>
    API_CHECK_HANDLERS.supabase_edge_function_named({ ...entry, endpoint: "/functions/v1/login-check" }),

  supabase_edge_function_named: async (entry) => {
    const base = String(getSupabaseUrl()).replace(/\/+$/, "");
    const anon = getSupabaseAnonKey();
    const fnName = entry.endpoint.replace(/^\/functions\/v1\//, "").trim();
    if (!base || !anon) {
      return {
        status: API_STATUS.offline,
        httpStatus: 0,
        latencyMs: 0,
        errorMessage: "Supabase not configured",
      };
    }
    try {
      const { res, latencyMs } = await timedFetch(`${base}/functions/v1/${fnName}`, {
        method: "POST",
        headers: { apikey: anon, "Content-Type": "application/json" },
        body: "{}",
      });
      const ok = reachableFromStatus(res.status);
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok ? null : `Edge function HTTP ${res.status}`,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  external_get: async (entry) => {
    const url = entry.endpoint.startsWith("http") ? entry.endpoint : entry.endpoint;
    try {
      const { res, latencyMs } = await timedFetch(url, { timeoutMs: 10000 });
      const ok = res.ok;
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok ? null : `HTTP ${res.status}`,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  indirect_etime_status: async (entry) => {
    try {
      const { res, latencyMs } = await timedFetch(apiUrl("/api/admin/attendance/status"));
      const data = await res.json().catch(() => ({}));
      const configured = Boolean(data?.etimeConfigured ?? data?.ok);
      const ok = res.ok && configured;
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok ? null : data?.message || "eTimeOffice not configured on server",
      };
    } catch (err) {
      return offlineResult(err);
    }
  },

  indirect_whitebooks: async (entry) => {
    try {
      const { res, latencyMs } = await timedFetch(apiUrl("/api/billing/e-invoice/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const ok = reachableFromStatus(res.status);
      return {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: res.status,
        latencyMs,
        errorMessage: ok
          ? "Node e-invoice proxy reachable (Whitebooks is server-side only)"
          : `Proxy HTTP ${res.status}`,
      };
    } catch (err) {
      return offlineResult(err);
    }
  },
};

export function buildCheckForEntry(entry) {
  const handler = API_CHECK_HANDLERS[entry.checkKey];
  if (!handler) {
    return async () => ({
      status: API_STATUS.offline,
      httpStatus: 0,
      latencyMs: 0,
      errorMessage: `No check handler for key: ${entry.checkKey}`,
    });
  }
  return () => handler(entry);
}
