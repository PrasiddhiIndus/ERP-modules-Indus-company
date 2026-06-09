import {
  isMissingProfileEmpCodeError,
  PROFILE_LIST_SELECT,
  PROFILE_LIST_SELECT_WITH_EMP,
} from "./profileSelect";

export const USER_MGMT_PAGE_SIZES = [10, 25, 50];

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

function applyFilters(query, filters, includeEmpCode) {
  let q = query;
  const term = String(filters.search ?? "").trim();
  if (term) {
    const pattern = escapeIlikePattern(term);
    const parts = [`email.ilike.%${pattern}%`, `username.ilike.%${pattern}%`];
    if (includeEmpCode) {
      parts.push(`employee_code.ilike.%${pattern}%`);
    }
    q = q.or(parts.join(","));
  }

  if (filters.role) {
    q = q.eq("role", filters.role);
  }
  if (filters.team) {
    q = q.eq("team", filters.team);
  }

  if (includeEmpCode && filters.linkStatus === "linked") {
    q = q.not("employee_code", "is", null).neq("employee_code", "");
  } else if (includeEmpCode && filters.linkStatus === "unlinked") {
    q = q.or("employee_code.is.null,employee_code.eq.");
  }

  return applySort(q, filters.sort || "created_desc", includeEmpCode);
}

/**
 * Paginated, filtered profiles list for User Management (server-side count + range).
 */
export async function fetchUserManagementProfiles(
  supabase,
  { page = 1, pageSize = 10, filters = DEFAULT_USER_MGMT_FILTERS, preferEmpCode = true } = {}
) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.max(1, Number(pageSize) || 10);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const buildQuery = (selectCols, includeEmpCode) => {
    let query = supabase.from("profiles").select(selectCols, { count: "exact" });
    query = applyFilters(query, filters, includeEmpCode);
    return query.range(from, to);
  };

  if (preferEmpCode) {
    let result = await buildQuery(PROFILE_LIST_SELECT_WITH_EMP, true);
    if (result.error && isMissingProfileEmpCodeError(result.error)) {
      result = await buildQuery(PROFILE_LIST_SELECT, false);
      return { ...result, empCodeSupported: false };
    }
    return { ...result, empCodeSupported: !result.error };
  }

  const result = await buildQuery(PROFILE_LIST_SELECT, false);
  return { ...result, empCodeSupported: false };
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
