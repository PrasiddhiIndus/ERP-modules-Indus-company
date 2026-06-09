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

/**
 * Create ERP user (auth + profiles) via local Node API, then edge function fallback.
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
      if (res.ok) return { data, error: null };
      return {
        data,
        error: {
          message: data?.error || `Request failed (${res.status})`,
          status: res.status,
        },
      };
    } catch (err) {
      return { data: null, error: { message: err?.message || String(err) } };
    }
  }

  async function callEdgeCreateUser() {
    return invokeAuthenticatedFunction("admin-create-user", { body }, token);
  }

  let { data, error } = await callLocalCreateUser();

  const localStatus = error?.status;
  const localHasMessage =
    typeof data?.error === "string" && data.error.trim().length > 0;
  const localUnreachable =
    !localStatus ||
    localStatus === 404 ||
    String(error?.message || "").includes("Failed to fetch") ||
    String(error?.message || "").includes("ECONNRESET");

  // Only fall back to edge when local API is unreachable — not when it returned a real error
  // (e.g. profile save failed after auth user was created → edge would misleadingly return 400).
  const tryEdge = error && localUnreachable && !localHasMessage;

  if (tryEdge) {
    const edge = await callEdgeCreateUser();
    if (!edge.error) {
      data = edge.data;
      error = null;
    } else {
      data = edge.data ?? data;
      error = edge.error;
    }
  }

  if (error) {
    const base =
      (typeof data?.error === "string" && data.error) ||
      (await parseEdgeFunctionError(error, data));
    const hint =
      typeof data?.hint === "string" && data.hint.trim() ? data.hint.trim() : "";
    const msg = hint ? `${base} (${hint})` : base;
    return { ok: false, message: msg };
  }

  if (data?.error) {
    return { ok: false, message: String(data.error) };
  }

  if (data?.ok !== true) {
    return { ok: false, message: data?.error || "Could not create user." };
  }

  return { ok: true, data };
}
