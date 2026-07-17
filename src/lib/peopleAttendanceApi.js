/**
 * Data access for public.people + public.attendance (+ optional sites).
 * Used by the HR Attendance screen. Stick to the documented schema only.
 */

/** Default PostgREST page size when walking large ranges. */
export const ATTENDANCE_FETCH_PAGE_SIZE = 1000;

/**
 * @typedef {Object} Person
 * @property {number} id
 * @property {string} unique_code
 * @property {string|null} full_name
 * @property {string|null} designation
 * @property {string|null} pf_no
 * @property {string|null} esic_no
 * @property {number|null} salary_basic
 * @property {number|null} salary_allowance
 * @property {string|null} date_of_birth
 * @property {string|null} father_name
 * @property {string|null} phone_no
 * @property {string|null} category_name
 * @property {string} joining_date
 * @property {string|null} leaving_date
 * @property {boolean|null} is_active
 * @property {string|null} created_at
 */

/**
 * @typedef {Object} SiteSummary
 * @property {number} id
 * @property {string|null} site_name
 * @property {string|null} site_type
 * @property {string|null} location
 * @property {number|null} duty_hours
 * @property {number|null} salary_cycle_start_day
 * @property {number|null} salary_cycle_end_day
 * @property {string|null} shift_type
 */

/**
 * @typedef {Object} AttendanceRecord
 * @property {number} id
 * @property {number} person_id
 * @property {number|null} site_id
 * @property {string} att_date
 * @property {string|null} att_code
 * @property {string|null} designation
 * @property {number|null} ot_hours
 * @property {number|null} month
 * @property {number|null} year
 * @property {boolean|null} is_locked
 * @property {string|null} created_at
 * @property {Person|null} [people]
 * @property {SiteSummary|null} [sites]
 */

const PERSON_SELECT =
  "id, unique_code, full_name, designation, pf_no, esic_no, salary_basic, salary_allowance, date_of_birth, father_name, phone_no, category_name, joining_date, leaving_date, is_active, created_at";

const ATTENDANCE_SELECT = `
  id, person_id, site_id, att_date, att_code, designation, ot_hours, month, year, is_locked, created_at,
  people:person_id ( id, unique_code, full_name, designation, category_name, is_active, joining_date, leaving_date ),
  sites:site_id ( id, site_name, site_type, location, duty_hours, salary_cycle_start_day, salary_cycle_end_day, shift_type )
`.replace(/\s+/g, " ").trim();

const SITE_SELECT =
  "id, site_name, site_type, location, duty_hours, salary_cycle_start_day, salary_cycle_end_day, shift_type";

/** Trim + uppercase attendance code (case-insensitive matching). */
export function normalizeAttCode(code) {
  return String(code ?? "").trim().toUpperCase();
}

export function formatPeopleAttendanceError(err) {
  if (!err) return "Something went wrong while loading attendance.";
  const msg = String(err.message || err.error_description || err.details || "").trim();
  if (/permission|rls|policy|jwt/i.test(msg)) {
    return "You do not have permission to view attendance records.";
  }
  if (/relation|does not exist|schema cache|Could not find/i.test(msg)) {
    return "Attendance data is not available yet. Please contact your administrator.";
  }
  if (msg) return msg;
  return "Something went wrong while loading attendance.";
}

/**
 * List employees from public.people.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ isActive?: boolean|null, search?: string, limit?: number }} [opts]
 * @returns {Promise<Person[]>}
 */
export async function listPeople(supabase, { isActive = true, search = "", limit = 5000 } = {}) {
  let query = supabase.from("people").select(PERSON_SELECT).order("full_name", { ascending: true });

  if (isActive === true) query = query.eq("is_active", true);
  else if (isActive === false) query = query.eq("is_active", false);

  const q = String(search || "").trim();
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,unique_code.ilike.%${q}%`);
  }

  if (limit != null) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number|string} id
 * @returns {Promise<Person|null>}
 */
export async function getPersonById(supabase, id) {
  const { data, error } = await supabase
    .from("people")
    .select(PERSON_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} uniqueCode
 * @returns {Promise<Person|null>}
 */
export async function getPersonByUniqueCode(supabase, uniqueCode) {
  const code = String(uniqueCode ?? "").trim();
  if (!code) return null;
  const { data, error } = await supabase
    .from("people")
    .select(PERSON_SELECT)
    .eq("unique_code", code)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<SiteSummary[]>}
 */
export async function listSites(supabase) {
  const { data, error } = await supabase
    .from("sites")
    .select(SITE_SELECT)
    .order("site_name", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return data || [];
}

/** Distinct department labels from people.category_name (server-side). */
export async function listPeopleDepartments(supabase) {
  const { data, error } = await supabase
    .from("people")
    .select("category_name")
    .not("category_name", "is", null)
    .limit(5000);
  if (error) throw error;
  const seen = new Set();
  const out = [];
  for (const row of data || []) {
    const label = String(row.category_name || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} categoryName
 * @returns {Promise<number[]|null>}
 */
export async function resolvePersonIdsForDepartment(supabase, categoryName) {
  const label = String(categoryName || "").trim();
  if (!label || label === "ALL") return null;
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .eq("category_name", label)
    .limit(5000);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

/** Merge multiple person-id filter lists (intersection). */
export function intersectPersonIdFilters(...lists) {
  const active = lists.filter((l) => Array.isArray(l));
  if (active.length === 0) return null;
  if (active.some((l) => l.length === 0)) return [];
  if (active.length === 1) return active[0];
  const [first, ...rest] = active;
  const set = new Set(first);
  for (const list of rest) {
    const keep = new Set(list);
    for (const id of set) {
      if (!keep.has(id)) set.delete(id);
    }
  }
  return [...set];
}

/** @type {Record<string, { column: string, foreignTable?: string }>} */
export const ATTENDANCE_SORT_FIELDS = {
  employee_name: { column: "full_name", foreignTable: "people" },
  employee_code: { column: "unique_code", foreignTable: "people" },
  site: { column: "site_name", foreignTable: "sites" },
  designation: { column: "designation" },
  date: { column: "att_date" },
  month: { column: "month" },
  year: { column: "year" },
  shift: { column: "shift_type", foreignTable: "sites" },
  mark: { column: "att_code" },
};

function applyAttendanceOrdering(query, { sortBy = "date", sortDir = "desc", groupBy = "none" } = {}) {
  const asc = sortDir === "asc";
  let primary = sortBy;
  if (!primary || primary === "default") {
    if (groupBy === "employee") primary = "employee_name";
    else if (groupBy === "site") primary = "site";
    else if (groupBy === "date") primary = "date";
    else primary = "date";
  }

  const spec = ATTENDANCE_SORT_FIELDS[primary] || ATTENDANCE_SORT_FIELDS.date;
  if (spec.foreignTable) {
    query = query.order(spec.column, { ascending: asc, foreignTable: spec.foreignTable });
  } else {
    query = query.order(spec.column, { ascending: asc });
  }

  if (groupBy === "employee" && primary !== "employee_name") {
    query = query.order("full_name", { ascending: true, foreignTable: "people" });
    query = query.order("unique_code", { ascending: true, foreignTable: "people" });
  } else if (groupBy === "site" && primary !== "site") {
    query = query.order("site_name", { ascending: true, foreignTable: "sites" });
  } else if (groupBy === "date" && primary !== "date") {
    query = query.order("att_date", { ascending: false });
  }

  if (primary !== "date") {
    query = query.order("att_date", { ascending: false });
  }
  query = query.order("person_id", { ascending: true });
  return query;
}

/**
 * Build a filtered attendance query (no range applied yet).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   siteId?: number|string|null,
 *   personId?: number|string|null,
 *   personIds?: Array<number|string>|null,
 *   startDate?: string|null,
 *   endDate?: string|null,
 *   month?: number|string|null,
 *   year?: number|string|null,
 *   attCode?: string|null,
 *   withCount?: boolean,
 * }} filters
 */
function buildAttendanceQuery(supabase, filters = {}) {
  const {
    siteId,
    personId,
    personIds,
    startDate,
    endDate,
    month,
    year,
    attCode,
    sortBy,
    sortDir,
    groupBy,
    withCount = false,
  } = filters;

  let query = supabase
    .from("attendance")
    .select(ATTENDANCE_SELECT, withCount ? { count: "exact" } : undefined);

  if (siteId != null && siteId !== "" && siteId !== "ALL") {
    query = query.eq("site_id", siteId);
  }
  if (personId != null && personId !== "") {
    query = query.eq("person_id", personId);
  }
  if (Array.isArray(personIds) && personIds.length > 0) {
    query = query.in("person_id", personIds);
  }
  if (startDate) query = query.gte("att_date", startDate);
  if (endDate) query = query.lte("att_date", endDate);
  if (month != null && month !== "" && month !== "ALL") {
    query = query.eq("month", Number(month));
  }
  if (year != null && year !== "" && year !== "ALL") {
    query = query.eq("year", Number(year));
  }
  const code = normalizeAttCode(attCode);
  if (code && code !== "ALL") {
    query = query.ilike("att_code", code);
  }

  return applyAttendanceOrdering(query, { sortBy, sortDir, groupBy });
}

/**
 * Paginated attendance fetch with people + sites joined.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} opts
 * @returns {Promise<{ rows: AttendanceRecord[], count: number|null }>}
 */
export async function fetchAttendancePage(
  supabase,
  {
    siteId,
    personId,
    personIds,
    startDate,
    endDate,
    month,
    year,
    attCode,
    sortBy,
    sortDir,
    groupBy,
    page = 1,
    pageSize = 50,
  } = {}
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Math.min(1000, Number(pageSize) || 50));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const query = buildAttendanceQuery(supabase, {
    siteId,
    personId,
    personIds,
    startDate,
    endDate,
    month,
    year,
    attCode,
    sortBy,
    sortDir,
    groupBy,
    withCount: true,
  }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count ?? null };
}

/** Normalize API filters used by list + stats. */
export function normalizeAttendanceFilters({
  siteId,
  personIds,
  startDate,
  endDate,
  month,
  year,
  attCode,
} = {}) {
  return {
    siteId: siteId != null && siteId !== "" && siteId !== "ALL" ? siteId : null,
    personIds: Array.isArray(personIds) && personIds.length > 0 ? personIds : null,
    startDate: startDate || null,
    endDate: endDate || null,
    month: month != null && month !== "" && month !== "ALL" ? month : null,
    year: year != null && year !== "" && year !== "ALL" ? year : null,
    attCode: attCode && attCode !== "ALL" ? attCode : null,
  };
}

/**
 * Fetch all matching attendance rows (walks PostgREST 1000-row pages).
 * Prefer fetchAttendancePage for UI grids.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} filters
 * @returns {Promise<AttendanceRecord[]>}
 */
export async function fetchAllAttendance(supabase, filters = {}) {
  const pageSize = ATTENDANCE_FETCH_PAGE_SIZE;
  const all = [];
  let from = 0;

  while (true) {
    const query = buildAttendanceQuery(supabase, { ...filters, withCount: false }).range(
      from,
      from + pageSize - 1
    );
    const { data, error } = await query;
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * Resolve employee search to person ids (for attendance filtering).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} search
 * @returns {Promise<number[]|null>} null = no search; [] = no matches
 */
export async function resolvePersonIdsForSearch(supabase, search) {
  const q = String(search || "").trim();
  if (!q) return null;

  const { data, error } = await supabase
    .from("people")
    .select("id")
    .or(`full_name.ilike.%${q}%,unique_code.ilike.%${q}%`)
    .limit(2000);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

/**
 * Present-day weight for common attendance codes (case-insensitive).
 * @param {string|null|undefined} attCode
 * @returns {number}
 */
export function presentDayWeight(attCode) {
  const code = normalizeAttCode(attCode);
  if (["P", "A", "B", "C", "G"].includes(code)) return 1;
  if (code === "HD") return 0.5;
  return 0;
}

/** Human-readable label for an attendance mark. */
export function attCodeLabel(attCode) {
  const code = normalizeAttCode(attCode);
  const map = {
    P: "Present",
    HD: "Half day",
    WO: "Week off",
    L: "Leave",
    A: "Shift A",
    B: "Shift B",
    C: "Shift C",
    G: "Shift G",
  };
  return map[code] || (code ? code : "Unknown");
}

/**
 * Head-count helpers for attendance dashboard (no row payload).
 * Uses the same filters as the register (server-side).
 */
export async function fetchAttendanceDashboardStats(supabase, filters = {}) {
  const normalized = normalizeAttendanceFilters(filters);
  const { siteId, personIds, startDate, endDate, month, year, attCode } = normalized;

  const applyBase = (q) => {
    let query = q;
    if (siteId != null) query = query.eq("site_id", siteId);
    if (Array.isArray(personIds) && personIds.length > 0) query = query.in("person_id", personIds);
    if (startDate) query = query.gte("att_date", startDate);
    if (endDate) query = query.lte("att_date", endDate);
    if (month != null) query = query.eq("month", Number(month));
    if (year != null) query = query.eq("year", Number(year));
    const code = normalizeAttCode(attCode);
    if (code) query = query.ilike("att_code", code);
    return query;
  };

  const countOnly = async (extra) => {
    let query = applyBase(supabase.from("attendance").select("id", { count: "exact", head: true }));
    if (extra) query = extra(query);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };

  const markCodes = ["P", "HD", "WO", "L", "A", "B", "C", "G"];
  const [total, locked, otHours, ...markCounts] = await Promise.all([
    countOnly(null),
    countOnly((q) => q.eq("is_locked", true)),
    sumFilteredOtHours(supabase, normalized),
    ...markCodes.map((code) => countOnly((q) => q.ilike("att_code", code))),
  ]);

  /** @type {Record<string, number>} */
  const byMark = {};
  markCodes.forEach((code, i) => {
    byMark[code] = markCounts[i] || 0;
  });

  const presentMarks = (byMark.P || 0) + (byMark.A || 0) + (byMark.B || 0) + (byMark.C || 0) + (byMark.G || 0);
  const presentDays = presentMarks + (byMark.HD || 0) * 0.5;

  return {
    total,
    locked,
    open: Math.max(0, total - locked),
    byMark,
    presentMarks,
    presentDays,
    halfDays: byMark.HD || 0,
    leave: byMark.L || 0,
    weekOff: byMark.WO || 0,
    otHours,
  };
}

async function sumFilteredOtHours(supabase, filters) {
  const pageSize = ATTENDANCE_FETCH_PAGE_SIZE;
  let total = 0;
  let from = 0;

  while (true) {
    const query = buildAttendanceQuery(supabase, { ...filters, withCount: false })
      .select("ot_hours")
      .range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    const chunk = data || [];
    for (const row of chunk) total += Number(row.ot_hours) || 0;
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return total;
}

/** Department label from people.category_name (shown as Department in UI). */
export function resolveDepartmentLabel(row) {
  return row?.people?.category_name || "—";
}

/** Shift from site type or ABCG attendance mark. */
export function resolveShiftLabel(row) {
  const code = normalizeAttCode(row?.att_code);
  if (["A", "B", "C", "G"].includes(code)) return `Shift ${code}`;
  const siteShift = row?.sites?.shift_type;
  return siteShift ? String(siteShift) : "—";
}
