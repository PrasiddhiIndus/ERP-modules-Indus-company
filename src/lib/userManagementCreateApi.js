import { invokeAuthenticatedFunction, parseEdgeFunctionError } from "./supabase";

async function getAccessToken(supabase) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (!userErr && userData?.user) {
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.access_token) return sess.session.access_token;
  }
  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
  if (!refreshErr && refreshed?.session?.access_token) {
    return refreshed.session.access_token;
  }
  const { data: sess } = await supabase.auth.getSession();
  return sess?.session?.access_token ?? null;
}

function isNetworkUnreachable(error, status) {
  if (status === 404 || status === 0) return true;
  const msg = String(error?.message || "");
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("ECONNRESET") ||
    msg.includes("NetworkError") ||
    msg.includes("Load failed")
  );
}

function authUserAlreadyCreated(data, error) {
  const text = String(data?.error || error?.message || "").toLowerCase();
  return text.includes("auth user created but profile failed");
}

function formatApiError(data, error) {
  const base =
    (typeof data?.error === "string" && data.error) ||
    (typeof error?.message === "string" && error.message) ||
    "Could not create user.";
  const hint =
    typeof data?.hint === "string" && data.hint.trim() ? data.hint.trim() : "";
  return hint ? `${base} (${hint})` : base;
}

/**
 * Create ERP user (auth + profiles).
 * Production: Supabase edge function first (has service_role in Supabase secrets).
 * Local dev: Node /api first (Vite proxy → port 8787), edge as fallback.
 */
export async function createUserAccount(supabase, payload) {
  const body = {
    email: payload.email,
    password: payload.password,
    username: payload.username || undefined,
    team: payload.team ?? null,
    role: payload.role,
    allowed_modules: payload.allowed_modules ?? [],
    ...(payload.employee_code ? { employee_code: payload.employee_code } : {}),
  };

  const token = await getAccessToken(supabase);
  if (!token) {
    return { ok: false, message: "Not signed in. Sign in again and retry." };
  }

  async function callLocalCreateUser() {
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { data, error: null, status: res.status };
      return {
        data,
        status: res.status,
        error: {
          message: data?.error || `Request failed (${res.status})`,
          status: res.status,
        },
      };
    } catch (err) {
      return {
        data: null,
        status: 0,
        error: { message: err?.message || String(err), status: 0 },
      };
    }
  }

  async function callEdgeCreateUser() {
    const edge = await invokeAuthenticatedFunction("admin-create-user", { body }, token);
    const status = edge.error?.context?.status ?? (edge.data?.ok === false ? 500 : 0);
    return { ...edge, status };
  }

  async function finishFromEdge(edge) {
    if (!edge.error && edge.data?.ok === true) {
      return { ok: true, data: edge.data };
    }
    const message = await parseEdgeFunctionError(edge.error, edge.data);
    return { ok: false, message };
  }

  async function finishFromLocal(local) {
    const { data, error, status } = local;
    if (!error) {
      if (data?.error) return { ok: false, message: String(data.error) };
      if (data?.ok === true) return { ok: true, data };
      return { ok: false, message: data?.error || "Could not create user." };
    }
    return { ok: false, message: formatApiError(data, error) };
  }

  const preferEdge = import.meta.env.PROD;

  if (preferEdge) {
    const edge = await callEdgeCreateUser();
    const edgeStatus = edge.status || edge.error?.context?.status || 0;
    if (!edge.error && edge.data?.ok === true) {
      return finishFromEdge(edge);
    }
    if (!isNetworkUnreachable(edge.error, edgeStatus)) {
      return finishFromEdge(edge);
    }
    const local = await callLocalCreateUser();
    return finishFromLocal(local);
  }

  let local = await callLocalCreateUser();
  if (!local.error) {
    return finishFromLocal(local);
  }

  const localStatus = local.status ?? local.error?.status ?? 0;
  const tryEdge =
    !authUserAlreadyCreated(local.data, local.error) &&
    (isNetworkUnreachable(local.error, localStatus) || localStatus >= 500);

  if (tryEdge) {
    const edge = await callEdgeCreateUser();
    if (!edge.error && edge.data?.ok === true) {
      return finishFromEdge(edge);
    }
    const edgeStatus = edge.status || edge.error?.context?.status || 0;
    if (!isNetworkUnreachable(edge.error, edgeStatus)) {
      return finishFromEdge(edge);
    }
  }

  return finishFromLocal(local);
}
