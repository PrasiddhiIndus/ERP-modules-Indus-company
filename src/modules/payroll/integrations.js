/**
 * Payroll integration contracts — single source for table/field names.
 * People Master: admin_ifsp_employee_master (no duplicate employee table).
 * Attendance: fetchMonthlyRegisterPayrollTotals → summary.totalPresent as Present Days.
 */
export const PAYROLL_TABLES = {
  sites: 'hr_payroll_sites',
  employeeProfile: 'hr_employee_payroll_profile',
  componentsMaster: 'hr_payroll_components_master',
  formulaSets: 'hr_site_payroll_formula_sets',
  formulaComponents: 'hr_site_payroll_formula_components',
  runs: 'hr_payroll_runs',
  runEmployees: 'hr_payroll_run_employees',
  monthlySummary: 'hr_payroll_employee_monthly_summary',
  componentValues: 'hr_payroll_employee_component_values',
  manualInputs: 'hr_payroll_manual_inputs',
  pfDetails: 'hr_payroll_pf_details',
  esicDetails: 'hr_payroll_esic_details',
  ptDetails: 'hr_payroll_pt_details',
  tdsDetails: 'hr_payroll_tds_details',
  ptStateRules: 'hr_payroll_pt_state_rules',
  tdsRules: 'hr_payroll_tds_rules',
  loans: 'hr_payroll_loans',
  loanRecoveries: 'hr_payroll_loan_recoveries',
  payslips: 'hr_payroll_payslips',
  auditLogs: 'hr_payroll_audit_logs',
};

export const EMPLOYEE_MASTER_TABLE = 'admin_ifsp_employee_master';

export const EMPLOYEE_PAYROLL_FIELDS = {
  id: 'id',
  employeeId: 'employee_id',
  employeeCode: 'employee_code',
  fullName: 'full_name',
  department: 'department',
  designation: 'designation',
  status: 'status',
  dateOfJoining: 'date_of_joining',
  location: 'location',
  pan: 'pan_card_no',
  uan: 'uan_no',
  esicNo: 'esic_no',
  bankAccount: 'bank_account_no',
  ifsc: 'ifsc_code',
};

/** Attendance join key for payroll rows */
export const ATTENDANCE_EMP_KEY = 'employee_code';
