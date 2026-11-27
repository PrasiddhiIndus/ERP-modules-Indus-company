/**
 * Site employee logins — ERP logins linked to site people by employee code.
 * Access (login on/off + screens) is managed from HR People Management;
 * User Management shows the same list read-only under "Site Employees".
 */
import { NAV_MODULE_TREE } from "../config/roles";
import { invokeAuthenticatedFunction, parseEdgeFunctionError } from "./supabase";
import { getAdminApiAccessToken } from "./userManagementAuthToken";

const BLOCKED_MODULES = new Set(["admin", "itIs", "finance"]);
const BLOCKED_SCREENS = new Set(["hr.salary-management", "hr.people-management"]);

/** Screens HR may grant to a site employee, grouped by module (mirrors the database rule). */
export const SITE_LOGIN_SCREEN_GROUPS = NAV_MODULE_TREE.filter((m) => !BLOCKED_MODULES.has(m.value))
  .map((m) => ({
    value: m.value,
    label: m.label,
    screens: (m.subModules || [])
      .filter((s) => !BLOCKED_SCREENS.has(s.value))
      .map((s) => ({ value: s.value, label: s.label })),
  }))
  .filter((m) => m.screens.length > 0);

const SCREEN_LABELS = new Map(
  NAV_MODULE_TREE.flatMap((m) => [
    [m.value, m.label],
    ...(m.subModules || []).flatMap((s) => [
      [s.value, `${m.label} · ${s.label}`],
      ...(s.tabModules || []).map((t) => [t.value, `${m.label} · ${s.label} · ${t.label}`]),
    ]),
  ])
);

export function screenLabel(key) {
  return SCREEN_LABELS.get(key) || key;
}

export function isGrantableSiteScreen(key) {
  const k = String(key || "").trim();
  if (!k.includes(".")) return false;
  const mod = k.split(".")[0];
  if (BLOCKED_MODULES.has(mod)) return false;
  return ![...BLOCKED_SCREENS].some((b) => k === b || k.startsWith(`${b}.`));
}

/**
 * PostgREST could not find the function / table in its schema cache (PGRST202 /
 * PGRST205). This also happens when the database HAS the migration but the API
 * was not told to reload its schema afterwards, so it must not be reported as
 * "not applied".
 */
export function isApiSchemaCacheMiss(error) {
  const code = String(error?.code || "");
  if (code === "PGRST202" || code === "PGRST205") return true;
  return /in the schema cache/i.test(String(error?.message || ""));
}

export const API_SCHEMA_RELOAD_MESSAGE =
  "The Supabase API has not loaded the latest database update yet. Ask your administrator to reload the API schema " +
  "(SQL editor: NOTIFY pgrst, 'reload schema';) and try again.";

export function formatSiteLoginError(err) {
  const msg = String(err?.message || err || "");
  if (isApiSchemaCacheMiss(err)) return API_SCHEMA_RELOAD_MESSAGE;
  if (/list_site_employee_logins|set_site_employee_login_access|schema cache|does not exist/i.test(msg)) {
    return "Site employee logins are not set up in the database yet. Ask your administrator to apply the latest update.";
  }
  if (
    /cannot be granted|no login linked|only hr|not allowed|your own login|not currently assigned|not a site supervisor|inactive|no employee code|already|not found|valid email|create the login first/i.test(
      msg
    )
  ) {
    return msg;
  }
  return "Something went wrong. Please try again.";
}

export async function fetchCanManageSiteLogins(supabase) {
  const { data, error } = await supabase.rpc("current_user_can_manage_site_logins");
  if (error) throw error;
  return data === true;
}

export async function listSiteEmployeeLogins(supabase, { personId = null } = {}) {
  const { data, error } = await supabase.rpc("list_site_employee_logins", {
    p_person_id: personId == null ? null : Number(personId),
  });
  if (error) throw error;
  return data || [];
}

/** Login ids that belong to site employees (kept out of the IFSPL Employees list). */
export async function fetchSiteEmployeeLoginProfileIds(supabase) {
  const rows = await listSiteEmployeeLogins(supabase);
  return [...new Set(rows.map((r) => r.profile_id).filter(Boolean))];
}

export async function fetchSiteLoginForPerson(supabase, personId) {
  const rows = await listSiteEmployeeLogins(supabase, { personId });
  return rows[0] || null;
}

export async function setSiteEmployeeLoginAccess(supabase, { personId, isActive, subModules }) {
  const { data, error } = await supabase.rpc("set_site_employee_login_access", {
    p_person_id: Number(personId),
    p_is_active: isActive,
    p_sub_modules: subModules,
  });
  if (error) throw error;
  return data;
}

/**
 * Site employees matching an employee code / name search (create-login picker).
 * Exact code matches come first. Returns [] for an empty term.
 */
export async function searchSitePeopleForLogin(supabase, term, { limit = 50 } = {}) {
  const t = String(term || "").trim().replace(/[%,()*\\]/g, " ").trim();
  if (!t) return { rows: [], hasMore: false };
  const run = (columns) =>
    supabase
      .from("hr_people_directory")
      .select(columns)
      .or(`unique_code.ilike.%${t}%,full_name.ilike.%${t}%`)
      .order("unique_code", { ascending: true })
      .limit(limit + 1);
  const base = "id, unique_code, full_name, designation, current_site_name, is_active";
  let { data, error } = await run(`${base}, email`);
  // Before the employee-email update is applied the view has no email column.
  if (error && /email/i.test(error.message || "")) ({ data, error } = await run(base));
  if (error) throw error;
  const needle = t.toLowerCase();
  const rank = (p) => {
    const code = String(p.unique_code || "").toLowerCase();
    if (code === needle) return 0;
    if (code.startsWith(needle)) return 1;
    if (code.includes(needle)) return 2;
    return 3;
  };
  const rows = (data || []).slice(0, limit).sort((a, b) => rank(a) - rank(b));
  return { rows, hasMore: (data || []).length > limit };
}

function isUnreachable(status, message) {
  return status === 0 || status === 404 || /failed to fetch|networkerror|load failed|econnreset/i.test(message || "");
}

/**
 * Call the site-login service (create a login / change a sign-in email). Same
 * transport order as User Management: edge function first in production, local
 * API server first in development.
 */
async function callSiteLoginService(supabase, body) {
  const token = await getAdminApiAccessToken(supabase);
  if (!token) return { ok: false, message: "Not signed in. Sign in again and retry." };

  const callLocal = async () => {
    try {
      const res = await fetch("/api/hr/create-site-login", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    } catch (err) {
      return { status: 0, data: { error: err?.message || String(err) } };
    }
  };

  const callEdge = async () => {
    const edge = await invokeAuthenticatedFunction("hr-create-site-login", { body }, token);
    const status = edge.error?.context?.status ?? (edge.data?.ok === true ? 200 : 0);
    if (!edge.error && edge.data?.ok === true) return { status: 200, data: edge.data };
    return { status, data: { error: await parseEdgeFunctionError(edge.error, edge.data) } };
  };

  const [first, second] = import.meta.env.PROD ? [callEdge, callLocal] : [callLocal, callEdge];
  let result = await first();
  if (result.data?.ok !== true && isUnreachable(result.status, result.data?.error)) {
    result = await second();
  }
  if (result.data?.ok === true) return { ok: true, data: result.data };
  if (isUnreachable(result.status, result.data?.error)) {
    return {
      ok: false,
      message: "The login service is not reachable. Ask your administrator to deploy the site login service.",
    };
  }
  if (!result.data?.error && result.status >= 500) {
    return {
      ok: false,
      message: "The server did not respond (it may have been restarting). Please try again — retrying with the same email is safe.",
    };
  }
  return { ok: false, message: result.data?.error || "Could not complete the request." };
}

/** Create an ERP / Indus One login for a site employee. */
export async function createSiteEmployeeLogin(supabase, { personId, email, password, subModules }) {
  return callSiteLoginService(supabase, {
    person_id: Number(personId),
    email: String(email || "").trim(),
    password,
    allowed_sub_modules: subModules || [],
  });
}

/**
 * Create a site employee's login as Site Supervisor of one site
 * (HR · Site Attendance · Attendance, that site only). The password is sent as typed.
 */
export async function createSiteSupervisorLogin(supabase, { personId, email, password, siteId }) {
  return callSiteLoginService(supabase, {
    person_id: Number(personId),
    email: String(email || "").trim(),
    password,
    supervisor_site_id: Number(siteId),
  });
}

/** Exactly the screens a Site Supervisor gets (set by assign_site_supervisor in the database). */
export const SUPERVISOR_SCREENS = ["hr.site-attendance", "site-attendance-page.attendance"];

/** Client-side mirror of the server password rule (the server re-checks). */
export function supervisorPasswordProblem(password, confirm) {
  const p = String(password || "");
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p.length > 72) return "Password must be at most 72 characters.";
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "Password must contain at least one letter and one number.";
  if (confirm !== undefined && p !== confirm) return "Passwords do not match.";
  return null;
}

export function normalizeEmployeeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Empty is valid (the email is optional). */
export function isValidEmployeeEmail(email) {
  const e = normalizeEmployeeEmail(email);
  return !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

/**
 * Save a site employee's (optional) email. When the employee already has a login,
 * the change goes through the site-login service so Supabase Auth, the login
 * profile and the employee record keep the same email.
 * Returns { ok, message?, loginUpdated? }.
 */
export async function saveSitePersonEmail(supabase, personId, email) {
  const next = normalizeEmployeeEmail(email);
  if (!isValidEmployeeEmail(next)) return { ok: false, message: "Enter a valid email address." };
  const { error } = await supabase.rpc("set_person_login_email", {
    p_person_id: Number(personId),
    p_email: next || null,
  });
  if (!error) return { ok: true, loginUpdated: false };
  if (/LOGIN_EMAIL_SYNC_REQUIRED/.test(error.message || "")) {
    const result = await callSiteLoginService(supabase, {
      action: "update_email",
      person_id: Number(personId),
      email: next,
    });
    return result.ok ? { ok: true, loginUpdated: true } : { ok: false, message: result.message };
  }
  if (isApiSchemaCacheMiss(error)) return { ok: false, message: API_SCHEMA_RELOAD_MESSAGE };
  console.error("Save employee email failed", error);
  return { ok: false, message: error.message || "Could not save the email." };
}

/** Emails keyed by person id. Returns {} if the table is not deployed yet. */
export async function fetchSitePeopleEmails(supabase, personIds) {
  const ids = [...new Set((personIds || []).map(Number).filter(Boolean))];
  const out = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("people_login_emails")
      .select("person_id, email")
      .in("person_id", ids.slice(i, i + 200));
    if (error) return out;
    for (const row of data || []) out[row.person_id] = row.email;
  }
  return out;
}

/** Edit Site picker: employees currently assigned to the site, with email and login state. */
export async function listSiteSupervisorCandidates(supabase, siteId) {
  const { data, error } = await supabase.rpc("list_site_supervisor_candidates", { p_site_id: Number(siteId) });
  if (error) throw error;
  return (data || []).sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
}

export async function listSiteSupervisors(supabase, siteId) {
  const { data, error } = await supabase.rpc("list_site_supervisors", { p_site_id: Number(siteId) });
  if (error) throw error;
  return data || [];
}

/** Make an existing site-employee login the supervisor of a site, or move it to another site. */
export async function assignSiteSupervisor(supabase, { personId, siteId }) {
  const { data, error } = await supabase.rpc("assign_site_supervisor", {
    p_person_id: Number(personId),
    p_site_id: Number(siteId),
  });
  if (error) throw error;
  return data;
}

/** Remove the supervisor role (the login itself stays). */
export async function removeSiteSupervisor(supabase, personId) {
  const { data, error } = await supabase.rpc("remove_site_supervisor", { p_person_id: Number(personId) });
  if (error) throw error;
  return data;
}

/** Sites the signed-in user supervises; null when the user is not a site supervisor. */
export async function fetchMySupervisedSiteIds(supabase) {
  const { data, error } = await supabase.rpc("current_user_supervised_site_ids");
  if (error) {
    if (isApiSchemaCacheMiss(error)) {
      return null;
    }
    throw error;
  }
  return Array.isArray(data) && data.length ? data.map(Number) : null;
}

export async function fetchSiteLoginHistory(supabase, personId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("site_login_access_history")
    .select("id, old_is_active, new_is_active, old_allowed_sub_modules, new_allowed_sub_modules, changed_at")
    .eq("person_id", Number(personId))
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
