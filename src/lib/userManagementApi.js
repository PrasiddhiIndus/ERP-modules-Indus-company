import {

  getEmployeeCodeColumnSupported,

  isMissingProfileEmployeeCodeError,

  PROFILE_LIST_SELECT,

  PROFILE_LIST_SELECT_WITH_EMPLOYEE_CODE,

} from "./profileSelect";

import { invokeAuthenticatedFunction, parseEdgeFunctionError } from "./supabase";



function normalizeCode(value) {

  const s = String(value ?? "").trim();

  return s || null;

}



async function readSavedProfile(supabase, id, preferEmployeeCode = true) {

  const selectCols = preferEmployeeCode

    ? PROFILE_LIST_SELECT_WITH_EMPLOYEE_CODE

    : PROFILE_LIST_SELECT;

  let result = await supabase.from("profiles").select(selectCols).eq("id", id).maybeSingle();

  if (

    result.error &&

    preferEmployeeCode &&

    isMissingProfileEmployeeCodeError(result.error)

  ) {

    result = await supabase

      .from("profiles")

      .select(PROFILE_LIST_SELECT)

      .eq("id", id)

      .maybeSingle();

  }

  return result;

}



function profileMatchesPayload(profile, payload) {

  if (!profile?.id) return false;

  if (payload.team !== undefined && (profile.team ?? null) !== (payload.team || null)) {

    return false;

  }

  if (payload.role !== undefined && profile.role !== payload.role) {

    return false;

  }

  if (payload.includeEmployeeCode) {

    const expected = normalizeCode(payload.employee_code);

    const actual = normalizeCode(profile.employee_code ?? profile.emp_code);

    if (expected !== actual) return false;

  }

  if (payload.username !== undefined) {
    const expected = normalizeCode(payload.username);
    const actual = normalizeCode(profile.username);
    if (expected !== actual) return false;
  }

  const savedMods = JSON.stringify([...(profile.allowed_modules || [])].sort());
  const expectedMods = JSON.stringify([...(payload.allowed_modules || [])].sort());
  if (savedMods !== expectedMods) return false;

  return true;

}



/**

 * Persist profile via admin-update-profile (service role — avoids profiles RLS recursion).

 */

export async function persistUserProfile(

  supabase,

  { id, team, role, allowed_modules, employee_code, username, includeEmployeeCode = true }

) {

  if (!id) return { ok: false, message: "User id is required." };



  const payload = {

    id,

    team: team || null,

    role,

    allowed_modules: Array.isArray(allowed_modules) ? allowed_modules : [],

    username: username !== undefined ? normalizeCode(username) : undefined,

    employee_code:

      includeEmployeeCode && employee_code !== undefined && employee_code !== null

        ? normalizeCode(employee_code)

        : includeEmployeeCode

          ? null

          : undefined,

    includeEmployeeCode,

  };



  const body = {

    id: payload.id,

    team: payload.team,

    role: payload.role,

    allowed_modules: payload.allowed_modules,

  };

  if (includeEmployeeCode) {

    body.employee_code = payload.employee_code;

  }

  if (payload.username !== undefined) {

    body.username = payload.username;

  }



  async function getAccessToken() {
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

  async function callLocalAdminUpdateProfile(token) {
    try {
      const res = await fetch("/api/admin/update-profile", {
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

  async function callEdgeAdminUpdateProfile(token) {
    return invokeAuthenticatedFunction("admin-update-profile", { body }, token);
  }

  let token = await getAccessToken();
  if (!token) {
    return { ok: false, message: "Not signed in. Sign in again and retry." };
  }

  // Local Node API first (npm run dev) — works without deploying the edge function.
  let { data, error } = await callLocalAdminUpdateProfile(token);

  const localStatus = error?.status;
  const tryEdge =
    error &&
    (!localStatus ||
      localStatus === 401 ||
      localStatus === 404 ||
      localStatus >= 500 ||
      String(error.message || "").includes("Failed to fetch"));

  if (tryEdge) {
    const edge = await callEdgeAdminUpdateProfile(token);
    if (!edge.error) {
      data = edge.data;
      error = null;
    } else if (localStatus !== 403 && localStatus !== 409) {
      data = edge.data ?? data;
      error = edge.error;
    }
  }

  if (error) {
    const msg =
      (typeof data?.error === "string" && data.error) ||
      (await parseEdgeFunctionError(error, data));
    if (msg === "Invalid token" || msg.includes("Invalid or expired session")) {
      return {
        ok: false,
        message:
          "Session expired or invalid. Sign out, sign in again, then retry. (If it persists, restart npm run dev and redeploy admin-update-profile.)",
      };
    }
    if (msg.includes("Only Super Admin")) {
      return { ok: false, message: msg };
    }
    return { ok: false, message: msg };
  }

  if (data?.error) {

    return { ok: false, message: String(data.error) };

  }

  if (data?.ok !== true) {

    return {

      ok: false,

      message:

        "Profile save did not complete. Redeploy admin-update-profile: supabase functions deploy admin-update-profile",

    };

  }



  let profile = data?.profile ?? null;



  if (!profile?.id) {

    const preferEmployeeCode = getEmployeeCodeColumnSupported() !== false;

    const { data: readBack, error: readErr } = await readSavedProfile(

      supabase,

      id,

      preferEmployeeCode

    );

    if (readErr) {

      return {

        ok: false,

        message:

          readErr.message ||

          "Save could not be verified. Deploy admin-update-profile and ensure profiles row exists.",

      };

    }

    profile = readBack;

  }



  if (!profileMatchesPayload(profile, payload)) {

    return {

      ok: false,

      message:

        "Save did not persist to profiles. Redeploy admin-update-profile edge function, then try again.",

    };

  }



  return { ok: true, profile };

}


