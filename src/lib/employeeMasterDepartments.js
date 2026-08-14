import { EMPLOYEE_MASTER_TABLE } from './userManagementHierarchy';

/** Curated defaults — same list as Employee Master form (IfspEmployeeMaster). */
export const EMPLOYEE_MASTER_BASE_DEPARTMENTS = [
  'Administration',
  'Apprentice',
  'Commercial',
  'Finance',
  'HR',
  'Compliance',
  'Dahej-HR',
  'Operations',
  'Information System',
  'Management',
  'Marketing',
  'Maintenance',
  'NFPA',
  'Procurement',
  'Production',
  'Production - Neotech',
  'Design',
  'Projects',
  'R&M',
  'Technical',
  'Training',
  'Projects-FTC',
  'Production-FTC',
  'Administration-FTC',
  'Emergency Response Team-FTC',
  'Maintenance-FTC',
  'Other',
];

/**
 * Common master-data variants → one display / filter label.
 * Keeps location- or site-specific names (e.g. Dahej-HR, Human Resource-Safety) distinct.
 */
const DEPARTMENT_ALIASES = {
  'human resource': 'HR',
  'human resources': 'HR',
  'hr dept': 'HR',
  'hr department': 'HR',
  operation: 'Operations',
  operations: 'Operations',
  project: 'Projects',
  projects: 'Projects',
  'information systems': 'Information System',
  'info system': 'Information System',
  'info systems': 'Information System',
  'it': 'Information System',
  admin: 'Administration',
  administration: 'Administration',
  'billing-commercial': 'Commercial',
  'billing commercial': 'Commercial',
  'training-ifsac': 'Training',
  'training ifsac': 'Training',
};

export function normalizeDeptKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Canonical department label for lists + salary filters.
 * Prefer Employee Master base casing, then aliases, else trimmed original.
 */
export function canonicalDepartmentLabel(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const key = normalizeDeptKey(trimmed);
  if (DEPARTMENT_ALIASES[key]) return DEPARTMENT_ALIASES[key];
  const base = EMPLOYEE_MASTER_BASE_DEPARTMENTS.find((d) => normalizeDeptKey(d) === key);
  if (base) return base;
  return trimmed;
}

/** Merge DB departments with curated defaults (case-insensitive + alias-aware). */
export function mergeEmployeeMasterDepartments(dbDepartments = []) {
  const seen = new Map();
  for (const value of [...(dbDepartments || []), ...EMPLOYEE_MASTER_BASE_DEPARTMENTS]) {
    const label = canonicalDepartmentLabel(value);
    if (!label) continue;
    const key = normalizeDeptKey(label);
    if (!seen.has(key)) seen.set(key, label);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

export async function fetchEmployeeMasterDepartments(supabase) {
  const { data, error } = await supabase.from(EMPLOYEE_MASTER_TABLE).select('department');

  if (error) throw error;

  const fromDb = [];
  const seen = new Map();
  for (const row of data || []) {
    const label = canonicalDepartmentLabel(row?.department);
    if (!label) continue;
    const key = normalizeDeptKey(label);
    if (!seen.has(key)) {
      seen.set(key, label);
      fromDb.push(label);
    }
  }

  return mergeEmployeeMasterDepartments(fromDb);
}

/** Resolve import/UI input to canonical department label from the allowed list. */
export function resolveDepartmentLabel(raw, departments) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const canonical = canonicalDepartmentLabel(trimmed);
  const key = normalizeDeptKey(canonical);
  const match = (departments || []).find((d) => normalizeDeptKey(d) === key);
  return match || canonical;
}

export function isKnownDepartment(raw, departments) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  const key = normalizeDeptKey(canonicalDepartmentLabel(trimmed));
  return (departments || []).some((d) => normalizeDeptKey(d) === key);
}

/** True when employee department matches a selected department chip (alias-safe). */
export function departmentMatches(employeeDepartment, selectedDepartment) {
  const a = normalizeDeptKey(canonicalDepartmentLabel(employeeDepartment));
  const b = normalizeDeptKey(canonicalDepartmentLabel(selectedDepartment));
  if (!a || !b) return false;
  return a === b;
}

export function departmentInSelection(employeeDepartment, selectedDepartments = []) {
  if (!selectedDepartments?.length) return false;
  return selectedDepartments.some((d) => departmentMatches(employeeDepartment, d));
}
