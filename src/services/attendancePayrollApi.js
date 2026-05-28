import { fetchMonthlyRegisterPayrollTotals } from '../lib/attendanceDaily';
import { EMPLOYEE_MASTER_TABLE } from '../modules/payroll/integrations';

/**
 * Present Days only — from attendance register summary.totalPresent.
 */
export async function fetchPresentDaysByEmployeeCode(supabase, monthValue) {
  const result = await fetchMonthlyRegisterPayrollTotals(supabase, monthValue, { empCode: 'ALL' });
  const daysInMonth = result.daysInMonth || 30;
  const map = new Map();
  (result.rows || []).forEach((row) => {
    const code = String(row.empCode || '').trim();
    if (!code) return;
    const present = Number(row.summary?.totalPresent ?? 0);
    map.set(code, {
      presentDays: present,
      monthDays: daysInMonth,
      paidDays: present,
      employeeName: row.employeeName,
      employeeId: row.employeeId,
    });
  });
  return { monthMeta: result.monthMeta, daysInMonth, byEmpCode: map };
}

export async function fetchActiveEmployeesForPayroll(supabase) {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select('id, employee_id, employee_code, full_name, department, designation, status, date_of_joining, location, pan_card_no, uan_no, esic_no')
    .eq('status', 'Active')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data || [];
}
