import {
  attendanceEmpCodeLookupVariants,
  normalizeAttendanceEmpCode,
} from "./attendanceDaily";
import { isActiveEmployeeRow, validateEmployeeHierarchy } from "./employeeHierarchy";
export const EMPLOYEE_MASTER_TABLE = "admin_ifsp_employee_master";

export const MANAGER_CANDIDATE_SELECT =
  "id, employee_code, employee_id, full_name, department, designation, status, l1_manager_code, email_id";

export const HIERARCHY_SELECT =
  "id, employee_code, employee_id, full_name, email_id, l1_manager_code, l1_manager_name, l2_manager_code, l2_manager_name, hierarchy_sort_order";

const EMPTY_LOOKUPS = () => ({ byCode: new Map() });

export function managerDisplayLabel(code, name) {
  const c = String(code ?? "").trim();
  const n = String(name ?? "").trim();
  if (!c && !n) return "—";
  if (n && c) return `${n} (${c})`;
  return n || c;
}

export function empCodeLookupKey(code) {
  const normalized = normalizeAttendanceEmpCode(code);
  return normalized ? normalized.toLowerCase() : String(code ?? "").trim().toLowerCase();
}

function registerEmployeeMasterInLookups(lookups, row) {
  if (!row) return;
  for (const variant of attendanceEmpCodeLookupVariants(row.employee_code)) {
    const key = empCodeLookupKey(variant);
    if (key) lookups.byCode.set(key, row);
  }
  const sysId = String(row.employee_id ?? "").trim().toLowerCase();
  if (sysId) lookups.byCode.set(sysId, row);
}

export function employeeCodeSearchVariants(code) {
  const raw = String(code ?? "").trim();
  if (!raw) return [];
  return [...new Set(attendanceEmpCodeLookupVariants(raw).map((v) => String(v).trim()).filter(Boolean))];
}

export function resolveEmployeeMasterForProfile(profile, lookups) {
  const { byCode } = lookups || EMPTY_LOOKUPS();
  const codeKey = empCodeLookupKey(profile?.employee_code ?? profile?.emp_code);
  if (codeKey && byCode.has(codeKey)) return byCode.get(codeKey);
  return null;
}

export function buildEmployeeHierarchyLookups(rows) {
  const lookups = { byCode: new Map() };
  for (const row of rows || []) {
    registerEmployeeMasterInLookups(lookups, row);
  }
  return lookups;
}

export function enrichProfileWithHierarchy(profile, lookups) {
  const emp = resolveEmployeeMasterForProfile(profile, lookups);
  const linkedCode = emp?.employee_code ?? null;
  return {
    ...profile,
    linked_employee_code: linkedCode,
    employee_master_id: emp?.id ?? null,
    employee_master_employee_id: emp?.employee_id ?? null,
    hierarchy_sort_order: emp?.hierarchy_sort_order ?? null,
    l1_manager_code: emp?.l1_manager_code ?? null,
    l1_manager_name: emp?.l1_manager_name ?? null,
    l2_manager_code: emp?.l2_manager_code ?? null,
    l2_manager_name: emp?.l2_manager_name ?? null,
  };
}

function dedupeRowsById(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (row?.id != null) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/**
 * Load Employee Master hierarchy rows — match profiles.employee_code to employee_master.employee_code.
 */
async function fetchEmployeeMasterRowsByCodeVariants(supabase, codeInput) {
  const variants = employeeCodeSearchVariants(codeInput);
  if (!variants.length) return [];

  const { data: exactRows, error: exactErr } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(HIERARCHY_SELECT)
    .in("employee_code", variants);
  if (exactErr) throw exactErr;

  const collected = [...(exactRows || [])];
  if (collected.length) return collected;

  const ilikeRows = await Promise.all(
    variants.map(async (variant) => {
      const { data, error } = await supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select(HIERARCHY_SELECT)
        .ilike("employee_code", variant)
        .limit(1);
      if (error) throw error;
      return (data || [])[0] ?? null;
    })
  );
  collected.push(...ilikeRows.filter(Boolean));

  if (collected.length) return collected;

  const norm = empCodeLookupKey(codeInput);
  if (norm) {
    const { data, error } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select(HIERARCHY_SELECT)
      .or(`employee_code.ilike.${norm},employee_id.ilike.${norm}`)
      .limit(5);
    if (error) throw error;
    const matched = (data || []).filter((row) => {
      const rowKeys = [
        empCodeLookupKey(row.employee_code),
        String(row.employee_id ?? "").trim().toLowerCase(),
      ].filter(Boolean);
      return rowKeys.some((k) => employeeCodeSearchVariants(codeInput).some((v) => empCodeLookupKey(v) === k));
    });
    collected.push(...matched);
  }

  return collected;
}

export async function fetchEmployeeHierarchyForProfiles(supabase, profiles) {
  const codeInputs = [
    ...new Set(
      (profiles || [])
        .map((p) => String(p?.employee_code ?? p?.emp_code ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (!codeInputs.length) return EMPTY_LOOKUPS();

  const collected = [];

  for (const code of codeInputs) {
    const rows = await fetchEmployeeMasterRowsByCodeVariants(supabase, code);
    collected.push(...rows);
  }

  return buildEmployeeHierarchyLookups(dedupeRowsById(collected));
}

/** Fetch L1/L2 from Employee Master for a single employee code. */
export async function fetchEmployeeHierarchyByEmpCode(supabase, employeeCode) {
  const code = String(employeeCode ?? "").trim();
  if (!code) return null;
  const rows = await fetchEmployeeMasterRowsByCodeVariants(supabase, code);
  return dedupeRowsById(rows)[0] ?? null;
}

/** Apply Employee Master hierarchy fields onto an edit form-shaped object. */
export function employeeMasterToEditHierarchyFields(masterRow) {
  if (!masterRow) {
    return {
      employee_master_id: null,
      employee_master_employee_id: null,
      linked_employee_code: null,
      hierarchy_sort_order: null,
      l1_manager_code: "",
      l1_manager_name: "",
      l2_manager_code: "",
      l2_manager_name: "",
    };
  }
  return {
    employee_master_id: masterRow.id ?? null,
    employee_master_employee_id: masterRow.employee_id ?? null,
    linked_employee_code: masterRow.employee_code ?? null,
    hierarchy_sort_order: masterRow.hierarchy_sort_order ?? null,
    l1_manager_code: masterRow.l1_manager_code ?? "",
    l1_manager_name: masterRow.l1_manager_name ?? "",
    l2_manager_code: masterRow.l2_manager_code ?? "",
    l2_manager_name: masterRow.l2_manager_name ?? "",
  };
}

/** Resolve a profile to its Employee Master hierarchy row (by employee_code only). */
export async function fetchEmployeeHierarchyForProfile(supabase, profile) {
  return fetchEmployeeHierarchyByEmpCode(
    supabase,
    profile?.employee_code ?? profile?.emp_code
  );
}

export async function fetchManagerCandidates(supabase) {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(MANAGER_CANDIDATE_SELECT)
    .order("full_name");

  if (error) throw error;
  return (data || []).filter(isActiveEmployeeRow);
}

/**
 * Update L1/L2 on admin_ifsp_employee_master (same source as Employee Master / leave routing).
 */
export async function saveEmployeeHierarchyManagers(
  supabase,
  { employeeMasterId, empCode, employeeId, l1Code, l2Code, hierarchySortOrder, employees }
) {
  if (!employeeMasterId) {
    return {
      ok: false,
      message:
        "No Employee Master row for this employee code. Add or update the employee on Admin → Employee Master first.",
    };
  }

  const sortRaw =
    hierarchySortOrder == null || hierarchySortOrder === ""
      ? ""
      : String(hierarchySortOrder);

  const hierarchyCheck = validateEmployeeHierarchy(employees, {
    employee_code: empCode,
    employee_id: employeeId,
    l1_manager_code: l1Code,
    l2_manager_code: l2Code,
    hierarchy_sort_order: sortRaw,
  });

  if (!hierarchyCheck.ok) {
    return { ok: false, message: hierarchyCheck.message || "Invalid manager hierarchy." };
  }

  const { error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .update({
      l1_manager_code: hierarchyCheck.fields.l1_manager_code,
      l1_manager_name: hierarchyCheck.fields.l1_manager_name,
      l2_manager_code: hierarchyCheck.fields.l2_manager_code,
      l2_manager_name: hierarchyCheck.fields.l2_manager_name,
    })
    .eq("id", employeeMasterId);

  if (error) {
    return { ok: false, message: error.message || "Unable to save manager hierarchy." };
  }

  return {
    ok: true,
    fields: {
      l1_manager_code: hierarchyCheck.fields.l1_manager_code,
      l1_manager_name: hierarchyCheck.fields.l1_manager_name,
      l2_manager_code: hierarchyCheck.fields.l2_manager_code,
      l2_manager_name: hierarchyCheck.fields.l2_manager_name,
    },
  };
}
