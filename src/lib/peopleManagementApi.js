/**
 * Data access for People Management — public.people + public.site_assignments.
 */

const PEOPLE_SELECT =
  "id, unique_code, full_name, designation, pf_no, esic_no, phone_no, category_name, joining_date, leaving_date, is_active, created_at";

const ASSIGNMENT_SELECT = `
  person_id, site_id, from_date, to_date,
  people:person_id ( id, unique_code, full_name, designation, is_active, joining_date, leaving_date, phone_no ),
  sites:site_id ( id, site_name, location )
`.replace(/\s+/g, " ").trim();

export function formatPeopleManagementError(err) {
  if (!err) return "Something went wrong while loading people data.";
  const msg = String(
    err.message || err.details || err.hint || err.code || ""
  ).trim();
  if (/permission|rls|policy|jwt/i.test(msg)) {
    return "You do not have permission to view people records.";
  }
  if (/relation|does not exist|schema cache|Could not find/i.test(msg)) {
    return "People data is not available yet. Please contact your administrator.";
  }
  if (/Bad Request|400/i.test(msg)) {
    return "Could not load site assignments with the current filters.";
  }
  return msg || "Something went wrong while loading people data.";
}

export function assignmentRowKey(row) {
  return `${row.person_id}-${row.site_id}-${row.from_date || "na"}-${row.to_date || "open"}`;
}

export function isActiveAssignment(row, todayIso = new Date().toISOString().slice(0, 10)) {
  if (row.to_date == null || row.to_date === "") return true;
  return String(row.to_date) >= todayIso;
}

/** @type {Record<string, { column: string, foreignTable?: string }>} */
export const PEOPLE_SORT_FIELDS = {
  unique_code: { column: "unique_code" },
  full_name: { column: "full_name" },
  designation: { column: "designation" },
  phone_no: { column: "phone_no" },
  joining_date: { column: "joining_date" },
  leaving_date: { column: "leaving_date" },
  is_active: { column: "is_active" },
};

/** @type {Record<string, { column: string, foreignTable?: string }>} */
export const ASSIGNMENT_SORT_FIELDS = {
  employee_name: { column: "full_name", foreignTable: "people" },
  employee_code: { column: "unique_code", foreignTable: "people" },
  designation: { column: "designation", foreignTable: "people" },
  site: { column: "site_name", foreignTable: "sites" },
  from_date: { column: "from_date" },
  to_date: { column: "to_date" },
};

function applyPeopleOrdering(query, { sortBy = "full_name", sortDir = "asc" } = {}) {
  const asc = sortDir === "asc";
  const spec = PEOPLE_SORT_FIELDS[sortBy] || PEOPLE_SORT_FIELDS.full_name;
  query = query.order(spec.column, { ascending: asc, nullsFirst: !asc });
  if (sortBy !== "full_name") {
    query = query.order("full_name", { ascending: true });
  }
  return query.order("id", { ascending: true });
}

function applyAssignmentOrdering(query, { sortBy = "from_date", sortDir = "desc" } = {}) {
  const asc = sortDir === "asc";
  const spec = ASSIGNMENT_SORT_FIELDS[sortBy] || ASSIGNMENT_SORT_FIELDS.from_date;
  if (spec.foreignTable) {
    query = query.order(spec.column, { ascending: asc, foreignTable: spec.foreignTable });
  } else {
    query = query.order(spec.column, { ascending: asc, nullsFirst: !asc });
  }
  if (sortBy !== "from_date") {
    query = query.order("from_date", { ascending: false });
  }
  query = query.order("person_id", { ascending: true }).order("site_id", { ascending: true });
  return query;
}

function applyAssignmentFilters(
  query,
  {
    siteId,
    personIds,
    assignmentStatus = "ALL",
    startDate = null,
    endDate = null,
  } = {}
) {
  let q = query;
  if (siteId != null && siteId !== "" && siteId !== "ALL") q = q.eq("site_id", siteId);
  if (Array.isArray(personIds) && personIds.length > 0) q = q.in("person_id", personIds);
  if (startDate) q = q.gte("from_date", startDate);
  if (endDate) q = q.lte("from_date", endDate);

  const today = new Date().toISOString().slice(0, 10);
  if (assignmentStatus === "ACTIVE") {
    q = q.or(`to_date.is.null,to_date.gte.${today}`);
  } else if (assignmentStatus === "ENDED") {
    q = q.not("to_date", "is", null).lt("to_date", today);
  }

  return q;
}

/**
 * Restrict assignments to active employees by resolving people ids first.
 * Avoids PostgREST errors when counting without an embedded people join.
 */
export async function resolveAssignmentPersonIds(
  supabase,
  { personIds = null, employeeActiveOnly = false } = {}
) {
  if (!employeeActiveOnly) {
    return personIds ?? null;
  }

  let query = supabase.from("people").select("id").eq("is_active", true);
  if (Array.isArray(personIds) && personIds.length > 0) {
    query = query.in("id", personIds);
  }

  const { data, error } = await query.limit(5000);
  if (error) throw error;
  return (data || []).map((r) => r.id);
}

function buildAssignmentsQuery(
  supabase,
  {
    siteId,
    personIds,
    assignmentStatus,
    startDate,
    endDate,
    sortBy,
    sortDir,
    withCount = false,
  } = {}
) {
  let query = supabase
    .from("site_assignments")
    .select(ASSIGNMENT_SELECT, withCount ? { count: "exact" } : undefined);

  query = applyAssignmentFilters(query, {
    siteId,
    personIds,
    assignmentStatus,
    startDate,
    endDate,
  });

  return applyAssignmentOrdering(query, { sortBy, sortDir });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ search?: string, isActive?: boolean|null, limit?: number }} [opts]
 */
export async function listPeople(supabase, { search = "", isActive = null, limit = 5000 } = {}) {
  const { rows } = await fetchPeoplePage(supabase, {
    search,
    isActive,
    sortBy: "full_name",
    sortDir: "asc",
    page: 1,
    pageSize: limit ?? 5000,
  });
  return rows;
}

/**
 * Paginated people master with server-side sort.
 */
export async function fetchPeoplePage(
  supabase,
  {
    search = "",
    isActive = null,
    sortBy = "full_name",
    sortDir = "asc",
    page = 1,
    pageSize = 50,
  } = {}
) {
  let query = supabase.from("people").select(PEOPLE_SELECT, { count: "exact" });

  if (isActive === true) query = query.eq("is_active", true);
  else if (isActive === false) query = query.eq("is_active", false);

  const q = String(search || "").trim();
  if (q) query = query.or(`full_name.ilike.%${q}%,unique_code.ilike.%${q}%`);

  query = applyPeopleOrdering(query, { sortBy, sortDir });

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Math.min(1000, Number(pageSize) || 50));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: data || [], count: count ?? null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} search
 * @returns {Promise<number[]|null>}
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
 * Paginated site assignments with people (+ sites) joined.
 */
export async function fetchSiteAssignmentsPage(
  supabase,
  {
    siteId,
    personIds,
    activeOnly = false,
    assignmentStatus,
    employeeActiveOnly = false,
    startDate = null,
    endDate = null,
    sortBy = "from_date",
    sortDir = "desc",
    page = 1,
    pageSize = 50,
  } = {}
) {
  const status = assignmentStatus || (activeOnly ? "ACTIVE" : "ALL");
  const resolvedPersonIds = await resolveAssignmentPersonIds(supabase, {
    personIds,
    employeeActiveOnly,
  });

  if (Array.isArray(resolvedPersonIds) && resolvedPersonIds.length === 0) {
    return { rows: [], count: 0 };
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Math.min(1000, Number(pageSize) || 50));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const query = buildAssignmentsQuery(supabase, {
    siteId,
    personIds: resolvedPersonIds,
    assignmentStatus: status,
    startDate,
    endDate,
    sortBy,
    sortDir,
    withCount: true,
  }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count ?? null };
}

/**
 * Summary counts for People Management dashboard cards.
 */
export async function fetchPeopleManagementStats(
  supabase,
  {
    siteId,
    personIds,
    activeOnly = false,
    assignmentStatus,
    employeeActiveOnly = false,
    startDate = null,
    endDate = null,
  } = {}
) {
  const status = assignmentStatus || (activeOnly ? "ACTIVE" : "ALL");
  const resolvedPersonIds = await resolveAssignmentPersonIds(supabase, {
    personIds,
    employeeActiveOnly,
  });

  if (Array.isArray(resolvedPersonIds) && resolvedPersonIds.length === 0) {
    return {
      activeEmployees: 0,
      totalAssignments: 0,
      activeAssignments: 0,
      filteredAssignments: 0,
    };
  }

  const filterOpts = {
    siteId,
    personIds: resolvedPersonIds,
    startDate,
    endDate,
  };

  let peopleQuery = supabase.from("people").select("id", { count: "exact", head: true }).eq("is_active", true);
  if (Array.isArray(resolvedPersonIds) && resolvedPersonIds.length > 0) {
    peopleQuery = peopleQuery.in("id", resolvedPersonIds);
  } else if (Array.isArray(personIds) && personIds.length > 0) {
    peopleQuery = peopleQuery.in("id", personIds);
  }

  const totalAssignQuery = applyAssignmentFilters(
    supabase.from("site_assignments").select("person_id", { count: "exact", head: true }),
    { ...filterOpts, assignmentStatus: "ALL" }
  );

  const activeAssignQuery = applyAssignmentFilters(
    supabase.from("site_assignments").select("person_id", { count: "exact", head: true }),
    { ...filterOpts, assignmentStatus: "ACTIVE" }
  );

  const filteredAssignQuery = applyAssignmentFilters(
    supabase.from("site_assignments").select("person_id", { count: "exact", head: true }),
    { ...filterOpts, assignmentStatus: status }
  );

  const [peopleResult, assignResult, activeAssignResult, filteredResult] = await Promise.all([
    peopleQuery,
    totalAssignQuery,
    activeAssignQuery,
    filteredAssignQuery,
  ]);

  if (peopleResult.error) throw peopleResult.error;
  if (assignResult.error) throw assignResult.error;
  if (activeAssignResult.error) throw activeAssignResult.error;
  if (filteredResult.error) throw filteredResult.error;

  return {
    activeEmployees: peopleResult.count ?? 0,
    totalAssignments: assignResult.count ?? 0,
    activeAssignments: activeAssignResult.count ?? 0,
    filteredAssignments: filteredResult.count ?? 0,
  };
}
