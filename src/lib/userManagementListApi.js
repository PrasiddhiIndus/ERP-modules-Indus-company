import {
  isMissingProfileEmpCodeError,
  isMissingProfileAllowedSubModulesError,
  isMissingProfileModuleAccessPendingError,
  isMissingProfileIsActiveError,
  PROFILE_LIST_SELECT,
  PROFILE_LIST_SELECT_WITH_EMP,
} from "./profileSelect";
import { EMPLOYEE_MASTER_TABLE } from "./userManagementHierarchy";

/** Cap name→code lookup so PostgREST OR filters stay within URL limits. */
const NAME_MATCH_CODE_LIMIT = 400;

const PROFILE_LIST_SELECT_NO_ACTIVE =
  "id, email, username, team, role, allowed_modules, allowed_sub_modules, module_access_pending, created_at";

const PROFILE_LIST_SELECT_WITH_EMP_NO_ACTIVE =
  "id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules, module_access_pending, created_at";

const PROFILE_LIST_SELECT_NO_PENDING =
  "id, email, username, team, role, allowed_modules, allowed_sub_modules, created_at";

const PROFILE_LIST_SELECT_WITH_EMP_NO_PENDING =
  "id, email, username, employee_code, team, role, allowed_modules, allowed_sub_modules, created_at";

const PROFILE_LIST_SELECT_NO_SUB =
  "id, email, username, team, role, allowed_modules, created_at";

const PROFILE_LIST_SELECT_WITH_EMP_NO_SUB =
  "id, email, username, employee_code, team, role, allowed_modules, created_at";

function normalizeModulesList(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeProfileListRows(rows) {
  return (rows ?? []).map((row) => ({
    ...row,
    allowed_modules: normalizeModulesList(row?.allowed_modules),
    allowed_sub_modules: normalizeModulesList(row?.allowed_sub_modules),
    module_access_pending: row?.module_access_pending === true,
    is_active: row?.is_active !== false,
  }));
}

export const USER_MGMT_PAGE_SIZES = [10, 25, 50];

export const USER_MGMT_EXPORT_BATCH_SIZE = 1000;

export const USER_MGMT_SORT_OPTIONS = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "username_asc", label: "Username A–Z" },
  { value: "email_asc", label: "Email A–Z" },
  { value: "employee_code_asc", label: "Emp code A–Z" },
];

export const USER_MGMT_LINK_FILTER_OPTIONS = [
  { value: "all", label: "All emp codes" },
  { value: "linked", label: "Has emp code" },
  { value: "unlinked", label: "Missing emp code" },
];

export const DEFAULT_USER_MGMT_FILTERS = {
  search: "",
  role: "",
  team: "",
  linkStatus: "all",
  sort: "created_desc",
};

/** Escape user input for PostgREST ilike patterns. */
export function escapeIlikePattern(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function applySort(query, sort, includeEmpCode) {
  let q = query;
  switch (sort) {
    case "created_asc":
      q = q.order("created_at", { ascending: true });
      break;
    case "username_asc":
      q = q.order("username", { ascending: true, nullsFirst: false });
      break;
    case "email_asc":
      q = q.order("email", { ascending: true, nullsFirst: false });
      break;
    case "employee_code_asc":
      if (includeEmpCode) {
        q = q.order("employee_code", { ascending: true, nullsFirst: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }
      break;
    default:
      q = q.order("created_at", { ascending: false });
  }
  return q.order("email", { ascending: true, nullsFirst: false });
}

/**
 * Resolve Employee Master codes whose full_name matches the search term.
 * Display names in User Management come from Employee Master, not always profiles.username.
 */
export async function fetchEmployeeCodesMatchingName(supabase, searchTerm) {
  const term = String(searchTerm ?? "").trim();
  if (!term || !supabase) return [];

  const pattern = escapeIlikePattern(term);
  // Match display name or emp identifiers on Employee Master (User Management shows master names).
  let result = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select("employee_code")
    .or(`full_name.ilike.%${pattern}%,employee_code.ilike.%${pattern}%,employee_id.ilike.%${pattern}%`)
    .not("employee_code", "is", null)
    .neq("employee_code", "")
    .limit(NAME_MATCH_CODE_LIMIT);

  if (result.error) {
    // Older schemas may lack employee_id — fall back to name-only.
    result = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("employee_code")
      .ilike("full_name", `%${pattern}%`)
      .not("employee_code", "is", null)
      .neq("employee_code", "")
      .limit(NAME_MATCH_CODE_LIMIT);
  }

  if (result.error) {
    console.warn("[user-mgmt] name search via Employee Master failed:", result.error.message || result.error);
    return [];
  }

  const codes = [];
  const seen = new Set();
  for (const row of result.data || []) {
    const code = String(row?.employee_code ?? "").trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    codes.push(code);
  }
  return codes;
}

function quotePostgrestValue(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Null or blank emp code (PostgREST). */
const UNLINKED_EMP_CODE_OR = 'employee_code.is.null,employee_code.eq.""';

/**
 * Build search OR clauses for profiles (email / username / emp code / name-matched codes).
 * Exported for unit tests.
 */
export function buildUserMgmtSearchOrParts(term, includeEmpCode, nameMatchCodes = []) {
  const needle = String(term ?? "").trim();
  if (!needle) return [];
  const pattern = escapeIlikePattern(needle);
  const parts = [`email.ilike.%${pattern}%`, `username.ilike.%${pattern}%`];
  if (includeEmpCode) {
    parts.push(`employee_code.ilike.%${pattern}%`);
    const codes = (nameMatchCodes || [])
      .map((c) => String(c ?? "").trim())
      .filter(Boolean);
    if (codes.length) {
      parts.push(`employee_code.in.(${codes.map(quotePostgrestValue).join(",")})`);
    }
  }
  return parts;
}

/**
 * Apply list filters. Search + "missing emp code" are combined into a single `.or()`
 * because PostgREST only keeps one top-level `or` query param (chained `.or()` overwrites).
 */
function applyFilters(query, filters, includeEmpCode, excludeProfileIds = [], nameMatchCodes = []) {
  let q = query;
  const excludeIds = (excludeProfileIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  if (excludeIds.length) {
    q = q.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const term = String(filters.search ?? "").trim();
  const searchParts = buildUserMgmtSearchOrParts(term, includeEmpCode, nameMatchCodes);
  const wantUnlinked = includeEmpCode && filters.linkStatus === "unlinked";
  const wantLinked = includeEmpCode && filters.linkStatus === "linked";

  if (searchParts.length && wantUnlinked) {
    // (match email|username|code) AND (code is null|blank) — expand to one OR of ANDs.
    const expanded = searchParts
      .map((part) => `and(${part},or(${UNLINKED_EMP_CODE_OR}))`)
      .join(",");
    q = q.or(expanded);
  } else if (searchParts.length) {
    q = q.or(searchParts.join(","));
  } else if (wantUnlinked) {
    q = q.or(UNLINKED_EMP_CODE_OR);
  }

  if (wantLinked) {
    q = q.not("employee_code", "is", null).neq("employee_code", "");
  }

  const role = String(filters.role ?? "").trim();
  if (role) {
    // Case-insensitive exact match (legacy rows may differ in casing).
    q = q.ilike("role", escapeIlikePattern(role));
  }

  const team = String(filters.team ?? "").trim();
  if (team) {
    // Case-insensitive exact match on the selected department label.
    q = q.ilike("team", escapeIlikePattern(team));
  }

  return applySort(q, filters.sort || "created_desc", includeEmpCode);
}

/**
 * Paginated, filtered profiles list for User Management (server-side count + range).
 */
export async function fetchUserManagementProfiles(
  supabase,
  // A cached "unsupported" verdict must not stick: always probe, and only a genuine
  // missing-column error downgrades to the no-employee-code select.
  {
    page = 1,
    pageSize = 10,
    filters = DEFAULT_USER_MGMT_FILTERS,
    preferEmpCode = true,
    excludeProfileIds = [],
  } = {}
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Number(pageSize) || 10);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const searchTerm = String(filters.search ?? "").trim();
  const nameMatchCodes = searchTerm
    ? await fetchEmployeeCodesMatchingName(supabase, searchTerm)
    : [];

  const buildQuery = (selectCols, includeEmpCode) => {
    let query = supabase.from("profiles").select(selectCols, { count: "exact" });
    query = applyFilters(query, filters, includeEmpCode, excludeProfileIds, includeEmpCode ? nameMatchCodes : []);
    return query.range(from, to);
  };

  {
    let result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP, true);
    if (result.error && isMissingProfileIsActiveError(result.error)) {
      result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP_NO_ACTIVE, true);
    }
    if (result.error && isMissingProfileModuleAccessPendingError(result.error)) {
      result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP_NO_PENDING, true);
    }
    if (result.error && isMissingProfileAllowedSubModulesError(result.error)) {
      result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP_NO_SUB, true);
      if (result.data) result.data = normalizeProfileListRows(result.data);
    } else if (result.data) {
      result.data = normalizeProfileListRows(result.data);
    }
    if (result.error && isMissingProfileEmpCodeError(result.error)) {
      result = await buildQuery(PROFILE_LIST_SELECT, false);
      if (result.error && isMissingProfileModuleAccessPendingError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_NO_PENDING, false);
      }
      if (result.data) result.data = normalizeProfileListRows(result.data);
      return { ...result, empCodeSupported: false };
    }
    return { ...result, empCodeSupported: result.error ? undefined : true };
  }
}

/**
 * All profiles matching filters (for Excel export). Fetches in batches to avoid row limits.
 */
export async function fetchAllUserManagementProfiles(
  supabase,
  { filters = DEFAULT_USER_MGMT_FILTERS, preferEmpCode = true, excludeProfileIds = [] } = {}
) {
  const batchSize = USER_MGMT_EXPORT_BATCH_SIZE;
  const allRows = [];
  let from = 0;
  let empCodeSupported = preferEmpCode;

  const searchTerm = String(filters.search ?? "").trim();
  const nameMatchCodes = searchTerm
    ? await fetchEmployeeCodesMatchingName(supabase, searchTerm)
    : [];

  while (true) {
    const buildQuery = (selectCols, includeEmpCode) => {
      let query = supabase.from("profiles").select(selectCols);
      query = applyFilters(
        query,
        filters,
        includeEmpCode,
        excludeProfileIds,
        includeEmpCode ? nameMatchCodes : []
      );
      return query.range(from, from + batchSize - 1);
    };

    let result;
    if (preferEmpCode && empCodeSupported !== false) {
      result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP, true);
      if (result.error && isMissingProfileIsActiveError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP_NO_ACTIVE, true);
      }
      if (result.error && isMissingProfileModuleAccessPendingError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP_NO_PENDING, true);
      }
      if (result.error && isMissingProfileAllowedSubModulesError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP_NO_SUB, true);
      }
      if (result.error && isMissingProfileEmpCodeError(result.error)) {
        empCodeSupported = false;
        result = await buildQuery(PROFILE_LIST_SELECT, false);
        if (result.error && isMissingProfileModuleAccessPendingError(result.error)) {
          result = await buildQuery(PROFILE_LIST_SELECT_NO_PENDING, false);
        }
        if (result.error && isMissingProfileAllowedSubModulesError(result.error)) {
          result = await buildQuery(PROFILE_LIST_SELECT_NO_SUB, false);
        }
      }
    } else {
      empCodeSupported = false;
      result = await buildQuery(PROFILE_LIST_SELECT, false);
      if (result.error && isMissingProfileIsActiveError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_NO_ACTIVE, false);
      }
      if (result.error && isMissingProfileModuleAccessPendingError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_NO_PENDING, false);
      }
      if (result.error && isMissingProfileAllowedSubModulesError(result.error)) {
        result = await buildQuery(PROFILE_LIST_SELECT_NO_SUB, false);
      }
    }

    if (result.error) {
      return { data: null, error: result.error, empCodeSupported: undefined };
    }

    const chunk = normalizeProfileListRows(result.data ?? []);
    allRows.push(...chunk);
    if (chunk.length < batchSize) break;
    from += batchSize;
  }

  return {
    data: allRows,
    error: null,
    empCodeSupported: preferEmpCode && empCodeSupported !== false,
  };
}

export function hasActiveUserMgmtFilters(filters) {
  const f = filters || DEFAULT_USER_MGMT_FILTERS;
  return Boolean(
    String(f.search ?? "").trim() ||
      f.role ||
      f.team ||
      (f.linkStatus && f.linkStatus !== "all") ||
      (f.sort && f.sort !== DEFAULT_USER_MGMT_FILTERS.sort)
  );
}

export function userMgmtTotalPages(total, pageSize) {
  return Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, Number(pageSize) || 10)));
}

export function userMgmtPageAfterDelete(currentPage, totalAfterDelete, pageSize) {
  const totalPages = userMgmtTotalPages(totalAfterDelete, pageSize);
  return Math.min(Math.max(1, currentPage), totalPages);
}
