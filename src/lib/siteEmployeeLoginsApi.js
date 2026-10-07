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

export function formatSiteLoginError(err) {
  const msg = String(err?.message || err || "");
  if (/list_site_employee_logins|set_site_employee_login_access|schema cache|does not exist/i.test(msg)) {
    return "Site employee logins are not set up in the database yet. Ask your administrator to apply the latest update.";
  }
  if (/cannot be granted|no login linked|only hr|not allowed|your own login/i.test(msg)) {
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
  const { data, error } = await supabase
    .from("hr_people_directory")
    .select("id, unique_code, full_name, designation, current_site_name, is_active")
    .or(`unique_code.ilike.%${t}%,full_name.ilike.%${t}%`)
    .order("unique_code", { ascending: true })
    .limit(limit + 1);
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
 * Create an ERP login for a site employee. Same transport order as User Management:
 * edge function first in production, local API server first in development.
 */
export async function createSiteEmployeeLogin(supabase, { personId, email, password, subModules }) {
  const token = await getAdminApiAccessToken(supabase);
  if (!token) return { ok: false, message: "Not signed in. Sign in again and retry." };

  const body = {
    person_id: Number(personId),
    email: String(email || "").trim(),
    password,
    allowed_sub_modules: subModules || [],
  };

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
  return { ok: false, message: result.data?.error || "Could not create the login." };
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
