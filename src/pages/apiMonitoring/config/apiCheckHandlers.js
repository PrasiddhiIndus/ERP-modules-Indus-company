import { apiUrl, fetchApiHealth, fetchApiWithAuth, humanizeApiErrorMessage, isRawServerHtmlDump } from "../../../lib/apiBase";
import { checkSupabaseConnection, supabase } from "../../../lib/supabase";
import { getSupabaseUrl, getSupabaseAnonKey } from "../../../lib/supabaseConfig";
import { getAdminApiAccessToken } from "../../../lib/userManagementAuthToken";
import { API_STATUS } from "./apiConstants";

const DEFAULT_TIMEOUT_MS = 6000;

let cachedHealthToken = null;
let cachedHealthTokenAt = 0;
const HEALTH_TOKEN_TTL_MS = 45_000;

export function resetHealthCheckTokenCache() {
  cachedHealthToken = null;
  cachedHealthTokenAt = 0;
}

async function getHealthCheckAccessToken() {
  if (cachedHealthToken && Date.now() - cachedHealthTokenAt < HEALTH_TOKEN_TTL_MS) {
    return cachedHealthToken;
  }
  cachedHealthToken = await getAdminApiAccessToken(supabase);
  cachedHealthTokenAt = Date.now();
  return cachedHealthToken;
}

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

function latencyDegradedMessage(latencyMs, thresholdMs) {
  return `Slow response: ${latencyMs} ms (threshold ${thresholdMs} ms)`;
}

function resolveStatus(ok, latencyMs, degradedThresholdMs) {
  if (!ok) return API_STATUS.offline;
  if (latencyMs > degradedThresholdMs) return API_STATUS.degraded;
  return API_STATUS.online;
}

/** Normalize handler output and attach a clear issue message when degraded/offline. */
function finalizeCheckResult(result, entry) {
  const thresholdMs = entry?.degradedThresholdMs ?? 5000;
  const latencyMs = Number(result.latencyMs) || 0;
  let status = result.status;
  let errorMessage = result.errorMessage ?? null;

  if (status === API_STATUS.online && latencyMs > thresholdMs) {
    status = API_STATUS.degraded;
    errorMessage = errorMessage || latencyDegradedMessage(latencyMs, thresholdMs);
  }

  if (status === API_STATUS.degraded && !errorMessage) {
    errorMessage =
      latencyMs > thresholdMs
        ? latencyDegradedMessage(latencyMs, thresholdMs)
        : "Service responded but health is below expected level.";
  }

  if (status === API_STATUS.offline && !errorMessage) {
    errorMessage = "Service unreachable or returned a server error.";
  }

  return {
    status,
    httpStatus: result.httpStatus ?? 0,
    latencyMs,
    errorMessage: errorMessage
      ? humanizeApiErrorMessage(errorMessage, "Service check failed.")
      : null,
  };
}

function offlineResult(err, message) {
  return finalizeCheckResult(
    {
      status: API_STATUS.offline,
      httpStatus: 0,
      latencyMs: err?.latencyMs ?? 0,
      errorMessage: humanizeApiErrorMessage(
        message || (err?.aborted ? "Request timed out" : err?.message || "Unreachable"),
        "Service unreachable."
      ),
    },
    { degradedThresholdMs: 5000 }
  );
}

/** Route exists and responded — auth may be required (not a configuration fault). */
function routeReachableOnline(status, latencyMs, entry) {
  return finalizeCheckResult(
    {
      status: resolveStatus(true, latencyMs, entry.degradedThresholdMs),
      httpStatus: status,
      latencyMs,
      errorMessage: null,
    },
    entry
  );
}

/**
 * Health probes use GET on many POST-only Express routes to avoid noisy console 400s.
 * Express then answers 404 (no GET handler) or 405 — that still means the Node API is up.
 * True outages are status 0 / 5xx.
 */
function isExpectedWriteProbeMismatch(status) {
  return status === 404 || status === 405;
}

/** Authenticated write-route probe: any non-5xx answer means the route/gateway responded. */
function authSuccessFromStatus(status) {
  if (!status || status === 0) return false;
  if (status >= 500) return false;
  if (isExpectedWriteProbeMismatch(status)) return true;
  // 401/403 = auth gate hit (route exists). Other 2xx–4xx = handler ran.
  return status >= 200 && status < 500;
}

/** Route exists but authenticated check failed with a session problem. */
function routeReachableUnverified(status, latencyMs, entry, detail) {
  return finalizeCheckResult(
    {
      status: API_STATUS.degraded,
      httpStatus: status,
      latencyMs,
      errorMessage: detail || `Route responded HTTP ${status} — sign in as admin to fully verify.`,
    },
    entry
  );
}

function serverErrorResult(status, latencyMs, entry, detail) {
  return finalizeCheckResult(
    {
      status: API_STATUS.offline,
      httpStatus: status,
      latencyMs,
      errorMessage: humanizeApiErrorMessage(detail || `Server error HTTP ${status}`, `Server error HTTP ${status}`),
    },
    entry
  );
}

/** Edge function gateway responded — deployed and reachable (401/403 = expected auth gate). */
function edgeFunctionDeployed(status) {
  if (!status || status === 404) return false;
  return status >= 200 && status < 500;
}

async function probeEdgeFunction(fnName, entry) {
  const base = String(getSupabaseUrl()).replace(/\/+$/, "");
  const anon = getSupabaseAnonKey();
  if (!base || !anon) {
    return finalizeCheckResult(
      {
        status: API_STATUS.offline,
        httpStatus: 0,
        latencyMs: 0,
        errorMessage: "Supabase URL or anon key not configured.",
      },
      entry
    );
  }

  const url = `${base}/functions/v1/${fnName}`;
  const token = await getHealthCheckAccessToken();

  // Prefer GET without a JSON body so probes do not spam console 400s from POST {}.
  // Any non-404 <500 response means the function gateway answered (deployed / reachable).
  const probeEdge = (headers) =>
    timedFetch(url, {
      method: "GET",
      headers: { apikey: anon, ...headers },
    });

  if (token) {
    try {
      const { res, latencyMs } = await probeEdge({ Authorization: `Bearer ${token}` });

      if (res.status === 404) {
        return finalizeCheckResult(
          {
            status: API_STATUS.offline,
            httpStatus: 404,
            latencyMs,
            errorMessage: `Edge function "${fnName}" is not deployed (HTTP 404).`,
          },
          entry
        );
      }

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => "");
        return finalizeCheckResult(
          {
            status: API_STATUS.degraded,
            httpStatus: res.status,
            latencyMs,
            errorMessage:
              text.slice(0, 200) ||
              `Signed-in session was rejected by "${fnName}" (HTTP ${res.status}). Sign out and sign in again, or check your role.`,
          },
          entry
        );
      }

      if (res.status >= 500) {
        return serverErrorResult(
          res.status,
          latencyMs,
          entry,
          `Edge function "${fnName}" returned server error HTTP ${res.status}.`
        );
      }

      // 200 / 400 / 405 / 422 — gateway reached the function (wrong method / validation is OK)
      return finalizeCheckResult(
        {
          status: resolveStatus(true, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage: null,
        },
        entry
      );
    } catch (err) {
      // Browser CORS failures often mean the function is missing or OPTIONS failed.
      return offlineResult(
        err,
        `Edge function "${fnName}" is unreachable from the browser (often not deployed, or CORS blocked).`
      );
    }
  }

  // No signed-in session — 401/403 proves the function is deployed and auth-gated (healthy).
  try {
    const { res, latencyMs } = await probeEdge({});

    if (res.status === 404) {
      return finalizeCheckResult(
        {
          status: API_STATUS.offline,
          httpStatus: 404,
          latencyMs,
          errorMessage: `Edge function "${fnName}" is not deployed (HTTP 404).`,
        },
        entry
      );
    }

    if (res.status >= 500) {
      return serverErrorResult(
        res.status,
        latencyMs,
        entry,
        `Edge function "${fnName}" gateway error HTTP ${res.status}.`
      );
    }

    if (edgeFunctionDeployed(res.status)) {
      return finalizeCheckResult(
        {
          status: resolveStatus(true, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage: null,
        },
        entry
      );
    }

    return finalizeCheckResult(
      {
        status: API_STATUS.offline,
        httpStatus: res.status,
        latencyMs,
        errorMessage: `Edge function "${fnName}" returned unexpected HTTP ${res.status}.`,
      },
      entry
    );
  } catch (err) {
    return offlineResult(
      err,
      `Edge function "${fnName}" is unreachable from the browser (often not deployed, or CORS blocked).`
    );
  }
}

async function probeNodeRoute(path, entry, { method = "GET" } = {}) {
  const normalizedPath = String(path || "").split(",")[0].trim().split("?")[0];
  const start = performance.now();

  const authResult = await fetchApiWithAuth(normalizedPath, {
    method,
    timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, entry.degradedThresholdMs + 2000),
    ...(method !== "GET"
      ? { headers: { "Content-Type": "application/json" }, body: "{}" }
      : {}),
  });

  const latencyMs = Math.round(performance.now() - start);
  const status = authResult.status || 0;

  if (status === 0) {
    return offlineResult({ latencyMs }, authResult.error || "Unable to reach API server.");
  }

  // GET probe of a POST-only route → Express 404/405. That is healthy, not Down.
  if (isExpectedWriteProbeMismatch(status)) {
    return routeReachableOnline(status, latencyMs, entry);
  }

  if (status === 401) {
    if (/not signed in/i.test(String(authResult.error || ""))) {
      try {
        const { res, latencyMs: probeMs } = await timedFetch(apiUrl(normalizedPath), { method });
        if (res.status === 401 || res.status === 403 || isExpectedWriteProbeMismatch(res.status)) {
          return routeReachableOnline(res.status, probeMs, entry);
        }
        if (res.status >= 500) {
          return serverErrorResult(res.status, probeMs, entry);
        }
        // Any other response from Node still proves the API process answered.
        if (res.status > 0 && res.status < 500) {
          return routeReachableOnline(res.status, probeMs, entry);
        }
        return finalizeCheckResult(
          {
            status: resolveStatus(res.ok, probeMs, entry.degradedThresholdMs),
            httpStatus: res.status,
            latencyMs: probeMs,
            errorMessage: res.ok ? null : `HTTP ${res.status}`,
          },
          entry
        );
      } catch (err) {
        return offlineResult(err);
      }
    }
    return routeReachableUnverified(
      status,
      latencyMs,
      entry,
      authResult.error || "Session rejected (HTTP 401). Sign out and sign in again, then recheck."
    );
  }

  if (status === 403) {
    // Forbidden still means the route exists and the API is up (role may lack access).
    return routeReachableOnline(status, latencyMs, entry);
  }

  if (status >= 500) {
    return serverErrorResult(status, latencyMs, entry, authResult.error || `Server error HTTP ${status}`);
  }

  const ok = authSuccessFromStatus(status);
  return finalizeCheckResult(
    {
      status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
      httpStatus: status,
      latencyMs,
      errorMessage: ok ? null : authResult.error || `Unexpected HTTP ${status}`,
    },
    entry
  );
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
    const t = setTimeout(() => finish({ ok: false, error: "WebSocket timeout (3s)" }), 3000);
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
    const data = result.data || {};
    const warning = String(data.warning || "").trim();
    const serviceRoleBad = data.service_role_key === "missing_or_invalid";

    if (!result.ok) {
      return finalizeCheckResult(
        {
          status: API_STATUS.offline,
          httpStatus: result.status || 0,
          latencyMs,
          errorMessage: result.error || "Health check failed",
        },
        entry
      );
    }

    if (warning || serviceRoleBad) {
      return finalizeCheckResult(
        {
          status: API_STATUS.degraded,
          httpStatus: result.status || 200,
          latencyMs,
          errorMessage:
            warning ||
            "API server is missing a valid Supabase service role key — authenticated routes may fail.",
        },
        entry
      );
    }

    return finalizeCheckResult(
      {
        status: resolveStatus(true, latencyMs, entry.degradedThresholdMs),
        httpStatus: result.status || 200,
        latencyMs,
        errorMessage: null,
      },
      entry
    );
  },

  node_attendance_status: async (entry) => {
    try {
      const { res, latencyMs } = await timedFetch(apiUrl("/api/admin/attendance/status"));
      const data = await res.json().catch(() => ({}));
      const configured = Boolean(data?.etimeConfigured ?? data?.ok);
      const ok = res.ok && configured;
      return finalizeCheckResult(
        {
          status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage: ok ? null : data?.message || "eTimeOffice is not configured on the server.",
        },
        entry
      );
    } catch (err) {
      return offlineResult(err);
    }
  },

  node_get: async (entry) => {
    const path = entry.endpoint.split(",")[0].trim();
    try {
      const { res, latencyMs } = await timedFetch(apiUrl(path));
      const ok = res.ok;
      let errorMessage = null;
      if (!ok) {
        const text = await res.text().catch(() => "");
        if (isRawServerHtmlDump(text) || /Internal Server Error/i.test(text)) {
          errorMessage = humanizeApiErrorMessage(text, `Server error HTTP ${res.status}`);
        } else {
          errorMessage = humanizeApiErrorMessage(
            text.slice(0, 200) || `HTTP ${res.status}`,
            `HTTP ${res.status}`
          );
        }
      }
      return finalizeCheckResult(
        {
          status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage,
        },
        entry
      );
    } catch (err) {
      return offlineResult(err);
    }
  },

  node_auth_probe_get: async (entry) => {
    const path = entry.endpoint.split(",")[0].trim();
    try {
      return await probeNodeRoute(path, entry, { method: "GET" });
    } catch (err) {
      return offlineResult(err);
    }
  },

  // Write routes: probe with GET so the browser does not log noisy 400s from POST {}.
  // Express returns 404/405 for the wrong method — that still proves the API is up.
  node_auth_probe_post: async (entry) => {
    const path = entry.endpoint.split(",")[0].trim();
    try {
      return await probeNodeRoute(path, entry, { method: "GET" });
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
    return finalizeCheckResult(
      {
        status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
        httpStatus: ok ? 200 : 0,
        latencyMs,
        errorMessage: ok ? null : result.message || "Supabase REST connection failed",
      },
      entry
    );
  },

  supabase_auth_health: async (entry) => {
    const base = String(getSupabaseUrl()).replace(/\/+$/, "");
    const anon = getSupabaseAnonKey();
    if (!base || !anon) {
      return finalizeCheckResult(
        {
          status: API_STATUS.offline,
          httpStatus: 0,
          latencyMs: 0,
          errorMessage: "Supabase URL or anon key not configured in the frontend environment.",
        },
        entry
      );
    }
    try {
      const { res, latencyMs } = await timedFetch(`${base}/auth/v1/health`, {
        headers: { apikey: anon },
      });
      const ok = res.ok;
      return finalizeCheckResult(
        {
          status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage: ok ? null : `Auth health HTTP ${res.status}`,
        },
        entry
      );
    } catch (err) {
      return offlineResult(err);
    }
  },

  supabase_realtime_ws: async (entry) => {
    try {
      const result = await checkRealtimeWebSocket();
      const ok = Boolean(result.ok);
      return finalizeCheckResult(
        {
          status: resolveStatus(ok, result.latencyMs, entry.degradedThresholdMs),
          httpStatus: ok ? 101 : 0,
          latencyMs: result.latencyMs,
          errorMessage: ok ? null : result.error || "Realtime WebSocket failed",
        },
        entry
      );
    } catch (err) {
      return offlineResult(err);
    }
  },

  supabase_edge_function: async (entry) =>
    probeEdgeFunction("login-check", entry),

  supabase_edge_function_named: async (entry) => {
    const fnName = entry.endpoint.replace(/^\/functions\/v1\//, "").trim();
    return probeEdgeFunction(fnName, entry);
  },

  external_get: async (entry) => {
    const url = entry.endpoint.startsWith("http") ? entry.endpoint : entry.endpoint;
    try {
      const { res, latencyMs } = await timedFetch(url, { timeoutMs: 10000 });
      const ok = res.ok;
      return finalizeCheckResult(
        {
          status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage: ok ? null : `External API HTTP ${res.status}`,
        },
        entry
      );
    } catch (err) {
      return offlineResult(err);
    }
  },

  indirect_etime_status: async (entry) => {
    try {
      const { res, latencyMs } = await timedFetch(apiUrl("/api/admin/attendance/status"));
      const data = await res.json().catch(() => ({}));
      const configured = Boolean(data?.etimeConfigured);
      const ok = res.ok && configured;
      return finalizeCheckResult(
        {
          status: resolveStatus(ok, latencyMs, entry.degradedThresholdMs),
          httpStatus: res.status,
          latencyMs,
          errorMessage: ok
            ? null
            : data?.message || "eTimeOffice credentials are missing or invalid on the API server.",
        },
        entry
      );
    } catch (err) {
      return offlineResult(err);
    }
  },

  indirect_whitebooks: async (entry) => {
    try {
      return await probeNodeRoute("/api/billing/e-invoice/generate", entry, { method: "GET" });
    } catch (err) {
      return offlineResult(err);
    }
  },
};

export function buildCheckForEntry(entry) {
  const handler = API_CHECK_HANDLERS[entry.checkKey];
  if (!handler) {
    return async () =>
      finalizeCheckResult(
        {
          status: API_STATUS.offline,
          httpStatus: 0,
          latencyMs: 0,
          errorMessage: `No health check handler registered for "${entry.checkKey}".`,
        },
        entry
      );
  }
  return () => handler(entry);
}
