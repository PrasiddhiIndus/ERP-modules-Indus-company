import { supabase } from '../lib/supabase';

/**
 * Fetch active employees for dropdowns (Marketing/Operations).
 *
 * Some deployments previously queried a non-existent table `ifsp_employees`,
 * which causes noisy 404s from Supabase REST. The canonical source in this repo
 * is `admin_ifsp_employee_master` (per-tenant via user_id).
 */
export async function fetchActiveEmployeesForDropdown() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('admin_ifsp_employee_master')
      .select('id, employee_id, full_name, status')
      .eq('user_id', user.id)
      .eq('status', 'Active')
      .order('full_name', { ascending: true });

    if (error) {
      // If the table/view isn't present in a given environment, return empty list (avoid breaking pages).
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      employee_id: row.employee_id || null,
      name: row.full_name || row.employee_id || 'Employee',
    }));
  } catch {
    return [];
  }
}

