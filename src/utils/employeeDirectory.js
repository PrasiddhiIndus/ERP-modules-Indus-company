import { supabase } from '../lib/supabase';
import { normalizeEmployeeCode, EMPLOYEE_MASTER_TABLE_NAME, EMPLOYEE_CODE_COL } from '../lib/employeeCode';

/**
 * Fetch active employees for dropdowns (Marketing/Operations).
 * Value key is employee_code — use it for all cross-table joins.
 */
export async function fetchActiveEmployeesForDropdown() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from(EMPLOYEE_MASTER_TABLE_NAME)
      .select(`id, employee_id, ${EMPLOYEE_CODE_COL}, full_name, status`)
      .eq('status', 'Active')
      .order('full_name', { ascending: true });

    if (error) {
      return [];
    }

    return (data || [])
      .filter((row) => normalizeEmployeeCode(row[EMPLOYEE_CODE_COL]))
      .map((row) => ({
        id: normalizeEmployeeCode(row[EMPLOYEE_CODE_COL]),
        employee_code: normalizeEmployeeCode(row[EMPLOYEE_CODE_COL]),
        employee_id: row.employee_id || null,
        name: row.full_name || row.employee_id || row[EMPLOYEE_CODE_COL] || 'Employee',
      }));
  } catch {
    return [];
  }
}

