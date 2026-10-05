import { supabase } from "../supabase";
import { canonicalDepartmentLabel, departmentMatches } from "../employeeMasterDepartments";
import { employeeCodeForUserId, normalizeEmployeeCode } from "../employeeCode";
import { isActiveEmployeeRow } from "../employeeHierarchy";
import { EMPLOYEE_MASTER_TABLE } from "../userManagementHierarchy";

const HR_TEAM_SELECT =
  "id, employee_code, full_name, department, designation, email_id, status, l1_manager_code, l2_manager_code";

export function isHrDepartment(department) {
  const label = canonicalDepartmentLabel(department);
  return departmentMatches(label, "HR") || departmentMatches(label, "Dahej-HR");
}

export async function listHrTeamEmployees() {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(HR_TEAM_SELECT)
    .order("full_name", { ascending: true })
    .limit(4000);
  if (error) throw error;
  return (data || []).filter((row) => isActiveEmployeeRow(row) && isHrDepartment(row.department));
}

/**
 * Site Attendance visibility: anyone with Site Attendance page access sees every site
 * and has full CRUD (incl. HR assignment). Data is narrowed only by the Fire / Safety
 * scope from User Management (applied by the layout's site-type filter).
 */
export async function resolveSiteAttendanceAccess({ userId, email } = {}) {
  const hrTeam = await listHrTeamEmployees().catch(() => []);
  let employeeCode = userId ? await employeeCodeForUserId(userId) : null;
  if (!employeeCode && email) {
    const { data } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select("employee_code")
      .ilike("email_id", String(email).trim())
      .limit(1);
    employeeCode = normalizeEmployeeCode(data?.[0]?.employee_code);
  }
  return {
    employeeCode,
    hrTeam,
    canAssignHr: true,
    seesAllSites: true,
    allowedSiteIds: null,
  };
}

export function scopeSites(sites, access) {
  if (!access || access.seesAllSites || !access.allowedSiteIds) return sites || [];
  const allowed = new Set((access.allowedSiteIds || []).map((id) => Number(id)));
  return (sites || []).filter((s) => allowed.has(Number(s.id)));
}

export function siteIdsForQuery(access) {
  if (!access || access.seesAllSites) return undefined;
  return Array.isArray(access.allowedSiteIds) ? access.allowedSiteIds : [];
}

export function hrPersonLabel(person) {
  if (!person) return "—";
  const code = person.employee_code ? ` · ${person.employee_code}` : "";
  return `${person.full_name || "HR"}${code}`;
}
