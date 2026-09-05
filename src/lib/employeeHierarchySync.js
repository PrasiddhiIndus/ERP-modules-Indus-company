/**
 * Sync Employee Master L1/L2 onto Indus One profiles + open leave/tour requests.
 * Primary path is the DB trigger on admin_ifsp_employee_master; this RPC is a backup.
 */

import { normalizeAttendanceEmpCode } from "./attendanceDaily";

export async function syncEmployeeHierarchyToIndusOne(
  supabase,
  { employeeCode, l1ManagerCode, l2ManagerCode } = {}
) {
  const code = normalizeAttendanceEmpCode(employeeCode);
  if (!code || !supabase) return null;

  const { data, error } = await supabase.rpc("sync_employee_hierarchy_to_indus_one", {
    p_employee_code: code,
    p_l1_manager_code: l1ManagerCode == null || l1ManagerCode === "" ? null : String(l1ManagerCode).trim(),
    p_l2_manager_code: l2ManagerCode == null || l2ManagerCode === "" ? null : String(l2ManagerCode).trim(),
  });

  if (error) throw error;
  return data;
}
