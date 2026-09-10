import { supabase } from "../supabase";
import { canonicalDepartmentLabel, departmentMatches } from "../employeeMasterDepartments";
import { employeeCodeForUserId, normalizeEmployeeCode } from "../employeeCode";
import { isActiveEmployeeRow, normalizeManagerCode } from "../employeeHierarchy";
import { EMPLOYEE_MASTER_TABLE } from "../userManagementHierarchy";
import { ROLES } from "../../config/roles";
import { listHrManagers } from "./siteAttendanceApi";

const HR_TEAM_SELECT =
  "id, employee_code, full_name, department, designation, email_id, status, l1_manager_code, l2_manager_code";

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function assignmentIsActive(row, onDate = todayIso()) {
  if (row.from_date && String(row.from_date).slice(0, 10) > onDate) return false;
  if (row.to_date && String(row.to_date).slice(0, 10) < onDate) return false;
  return true;
}

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

function isPrivilegedRole(role) {
  const r = String(role || "").toLowerCase();
  return r === ROLES.SUPER_ADMIN || r === ROLES.SUPER_ADMIN_PRO || r === ROLES.ADMIN;
}

async function isHrTeamL1OrL2(employeeCode, hrTeam) {
  const mine = normalizeManagerCode(employeeCode);
  if (!mine) return false;
  return hrTeam.some((row) => {
    const l1 = normalizeManagerCode(row.l1_manager_code);
    const l2 = normalizeManagerCode(row.l2_manager_code);
    return l1 === mine || l2 === mine;
  });
}

async function listAssignedSiteIds({ employeeCode, email }) {
  const code = normalizeEmployeeCode(employeeCode);
  const emailNorm = String(email || "").trim().toLowerCase();
  const { data, error } = await supabase.from("site_hr_managers").select("site_id, from_date, to_date, employee_code, hr_manager_id");
  if (error) return [];
  const rows = (data || []).filter((row) => assignmentIsActive(row));
  const ids = new Set();

  if (code) {
    for (const row of rows) {
      if (normalizeEmployeeCode(row.employee_code) === code && row.site_id != null) ids.add(Number(row.site_id));
    }
  }

  if (emailNorm) {
    const managers = await listHrManagers().catch(() => []);
    const mine = managers.filter((m) => String(m.email_id || "").trim().toLowerCase() === emailNorm);
    const managerIds = new Set(mine.map((m) => Number(m.id)));
    for (const row of rows) {
      if (managerIds.has(Number(row.hr_manager_id)) && row.site_id != null) ids.add(Number(row.site_id));
    }
  }

  return [...ids];
}

/**
 * Site Attendance visibility:
 * - Super admin / admin, or L1/L2 of HR-team staff: all sites, can assign HR people.
 * - Everyone else: only sites they are currently assigned to.
 */
export async function resolveSiteAttendanceAccess({ userId, email, role } = {}) {
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
  const canAssignHr = isPrivilegedRole(role) || (await isHrTeamL1OrL2(employeeCode, hrTeam));
  if (canAssignHr) {
    return {
      employeeCode,
      hrTeam,
      canAssignHr: true,
      seesAllSites: true,
      allowedSiteIds: null,
    };
  }
  const allowedSiteIds = await listAssignedSiteIds({ employeeCode, email });
  return {
    employeeCode,
    hrTeam,
    canAssignHr: false,
    seesAllSites: false,
    allowedSiteIds,
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
