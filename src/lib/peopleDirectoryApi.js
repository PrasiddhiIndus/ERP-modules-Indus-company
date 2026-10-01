/**
 * HR People Management — site employee directory (public.people) with L1/L2 HR leads.
 * Leads live in people_hr_leads (writes only through set_people_hr_leads).
 */

const DIRECTORY_VIEW = "hr_people_directory";

const PERSON_PROFILE_SELECT = "*";

const ASSIGNMENT_HISTORY_SELECT =
  "person_id, site_id, from_date, to_date, sites:site_id ( id, site_name, location, site_type )";

const SENSITIVE_SELECT = "date_of_birth, aadhaar_no, pan_no, uan_no, bank_account_no, ifsc_code, bank_name";

/** Editable people fields on the profile (code and dates owned by Site Attendance stay read-only). */
export const PERSON_EDITABLE_FIELDS = ["full_name", "father_name", "phone_no", "category_name"];

export const DIRECTORY_SORT_FIELDS = new Set([
  "unique_code",
  "full_name",
  "designation",
  "category_name",
  "phone_no",
  "joining_date",
  "leaving_date",
  "is_active",
  "current_site_name",
  "l1_employee_name",
  "l2_employee_name",
]);

export const LEAD_FILTERS = {
  ALL: "ALL",
  MINE: "MINE",
  NO_L1: "NO_L1",
  NO_L2: "NO_L2",
};

export function formatPeopleDirectoryError(err) {
  if (!err) return "Something went wrong while loading people.";
  const msg = String(err.message || err.details || err.hint || err.code || "").trim();
  if (/not an active HR team member|must be different people/i.test(msg)) return msg;
  if (/Not allowed/i.test(msg) || /permission|rls|policy|jwt|42501/i.test(msg)) {
    return "You do not have permission for this action.";
  }
  if (/relation|does not exist|schema cache|Could not find|function .* does not exist/i.test(msg)) {
    return "HR leads are not set up yet. Please contact your administrator.";
  }
  return "Something went wrong. Please try again.";
}

function escapeLike(term) {
  return String(term || "").replace(/[%,()]/g, " ").trim();
}

/**
 * Paginated directory with server-side filter/sort.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchPeopleDirectoryPage(
  supabase,
  {
    search = "",
    isActive = true,
    siteId = null,
    designation = null,
    category = null,
    leadFilter = LEAD_FILTERS.ALL,
    leadCode = null,
    myCode = null,
    sortBy = "full_name",
    sortDir = "asc",
    page = 1,
    pageSize = 50,
  } = {}
) {
  let query = supabase.from(DIRECTORY_VIEW).select("*", { count: "exact" });
  query = applyDirectoryFilters(query, {
    search,
    isActive,
    siteId,
    designation,
    category,
    leadFilter,
    leadCode,
    myCode,
  });

  const by = DIRECTORY_SORT_FIELDS.has(sortBy) ? sortBy : "full_name";
  const asc = sortDir === "asc";
  query = query.order(by, { ascending: asc, nullsFirst: false });
  if (by !== "full_name") query = query.order("full_name", { ascending: true });
  query = query.order("id", { ascending: true });

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Math.min(1000, Number(pageSize) || 50));
  const from = (safePage - 1) * safeSize;

  const { data, error, count } = await query.range(from, from + safeSize - 1);
  if (error) throw error;
  return { rows: data || [], count: count ?? 0 };
}

/** All rows for the current filters (export). Walks pages of 1000. */
export async function fetchPeopleDirectoryAll(supabase, filters = {}) {
  const all = [];
  for (let page = 1; page < 100; page += 1) {
    const { rows } = await fetchPeopleDirectoryPage(supabase, { ...filters, page, pageSize: 1000 });
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

function applyDirectoryFilters(
  query,
  { search, isActive, siteId, designation, category, leadFilter, leadCode, myCode }
) {
  let q = query;
  if (isActive === true) q = q.eq("is_active", true);
  else if (isActive === false) q = q.eq("is_active", false);

  if (siteId != null && siteId !== "" && siteId !== "ALL") q = q.eq("current_site_id", siteId);
  if (designation && designation !== "ALL") q = q.eq("designation", designation);
  if (category && category !== "ALL") q = q.eq("category_name", category);

  const term = escapeLike(search);
  if (term) {
    q = q.or(
      ["full_name", "unique_code", "designation", "phone_no", "current_site_name", "l1_employee_name", "l2_employee_name"]
        .map((col) => `${col}.ilike.%${term}%`)
        .join(",")
    );
  }

  if (leadFilter === LEAD_FILTERS.NO_L1) q = q.is("l1_employee_code", null);
  else if (leadFilter === LEAD_FILTERS.NO_L2) q = q.is("l2_employee_code", null);
  else if (leadFilter === LEAD_FILTERS.MINE) {
    const code = escapeLike(myCode);
    if (!code) return q.eq("id", -1);
    q = q.or(`l1_employee_code.ilike.${code},l2_employee_code.ilike.${code}`);
  } else if (leadFilter && leadFilter !== LEAD_FILTERS.ALL && leadCode) {
    const code = escapeLike(leadCode);
    q = q.or(`l1_employee_code.ilike.${code},l2_employee_code.ilike.${code}`);
  }
  return q;
}

/** KPI counts: active people, missing L1, missing L2 (active only). */
export async function fetchPeopleDirectoryStats(supabase) {
  const base = () =>
    supabase.from(DIRECTORY_VIEW).select("id", { count: "exact", head: true }).eq("is_active", true);
  const [active, noL1, noL2] = await Promise.all([
    base(),
    base().is("l1_employee_code", null),
    base().is("l2_employee_code", null),
  ]);
  for (const r of [active, noL1, noL2]) if (r.error) throw r.error;
  return {
    active: active.count ?? 0,
    missingL1: noL1.count ?? 0,
    missingL2: noL2.count ?? 0,
  };
}

/** Distinct designation + category labels for filter dropdowns. */
export async function fetchPeopleFilterOptions(supabase) {
  const { data, error } = await supabase.from("people").select("designation, category_name").limit(10000);
  if (error) throw error;
  const designations = new Set();
  const categories = new Set();
  for (const row of data || []) {
    const d = String(row.designation || "").trim();
    const c = String(row.category_name || "").trim();
    if (d) designations.add(d);
    if (c) categories.add(c);
  }
  const sort = (s) => [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return { designations: sort(designations), categories: sort(categories) };
}

/** Active HR team from Employee Master (L1/L2 candidates). */
export async function listHrTeamLeads(supabase) {
  const { data, error } = await supabase.rpc("list_hr_team_leads");
  if (error) throw error;
  return data || [];
}

/**
 * Assign or clear leads for one or many people.
 * @param {{ personIds: (number|string)[], setL1: boolean, l1Code?: string, setL2: boolean, l2Code?: string }} input
 */
export async function setPeopleHrLeads(supabase, { personIds, setL1, l1Code = "", setL2, l2Code = "" }) {
  const ids = (personIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc("set_people_hr_leads", {
    p_person_ids: ids,
    p_set_l1: Boolean(setL1),
    p_l1_code: l1Code || null,
    p_set_l2: Boolean(setL2),
    p_l2_code: l2Code || null,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function fetchPersonProfile(supabase, personId) {
  const [personRes, directoryRes] = await Promise.all([
    supabase.from("people").select(PERSON_PROFILE_SELECT).eq("id", personId).maybeSingle(),
    supabase
      .from(DIRECTORY_VIEW)
      .select(
        "l1_employee_code, l1_employee_name, l2_employee_code, l2_employee_name, leads_updated_at, current_site_id, current_site_name, current_site_location"
      )
      .eq("id", personId)
      .maybeSingle(),
  ]);
  if (personRes.error) throw personRes.error;
  if (!personRes.data) return null;
  if (directoryRes.error) console.warn("People profile: leads/site lookup failed", directoryRes.error);
  return { ...personRes.data, ...(directoryRes.data || {}) };
}

export async function fetchPersonAssignments(supabase, personId) {
  const { data, error } = await supabase
    .from("site_assignments")
    .select(ASSIGNMENT_HISTORY_SELECT)
    .eq("person_id", personId)
    .order("from_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function fetchPersonLeadHistory(supabase, personId) {
  const { data, error } = await supabase
    .from("people_hr_leads_history")
    .select("*")
    .eq("person_id", personId)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function fetchPersonSensitiveDetails(supabase, personId) {
  const { data, error } = await supabase
    .from("people_sensitive_details")
    .select(SENSITIVE_SELECT)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Attendance code counts per month + site for the last `months` months. */
export async function fetchPersonAttendanceSummary(supabase, personId, { months = 3 } = {}) {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - (months - 1));
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  const { data, error } = await supabase
    .from("attendance")
    .select("att_date, att_code, ot_hours, site_id, sites:site_id ( site_name )")
    .eq("person_id", personId)
    .gte("att_date", startIso)
    .order("att_date", { ascending: false })
    .limit(2000);
  if (error) throw error;

  const groups = new Map();
  for (const row of data || []) {
    const month = String(row.att_date || "").slice(0, 7);
    const site = row.sites?.site_name || "—";
    const key = `${month}|${site}`;
    if (!groups.has(key)) groups.set(key, { key, month, site, codes: {}, otHours: 0, days: 0 });
    const g = groups.get(key);
    const code = String(row.att_code || "").trim().toUpperCase() || "—";
    g.codes[code] = (g.codes[code] || 0) + 1;
    g.otHours += Number(row.ot_hours) || 0;
    g.days += 1;
  }
  return [...groups.values()].sort((a, b) => (a.month === b.month ? a.site.localeCompare(b.site) : b.month.localeCompare(a.month)));
}

/** Update only the changed editable fields; never touches other people columns. */
export async function updatePersonBasics(supabase, personId, original, draft) {
  const patch = {};
  for (const field of PERSON_EDITABLE_FIELDS) {
    const next = String(draft[field] ?? "").trim();
    const prev = String(original[field] ?? "").trim();
    if (next !== prev) patch[field] = next || null;
  }
  if (!Object.keys(patch).length) return original;
  if ("full_name" in patch && !patch.full_name) throw new Error("Name is required.");
  const { data, error } = await supabase.from("people").update(patch).eq("id", personId).select("*").maybeSingle();
  if (error) throw error;
  return data || { ...original, ...patch };
}
