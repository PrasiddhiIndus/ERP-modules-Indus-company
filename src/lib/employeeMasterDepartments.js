import { EMPLOYEE_MASTER_TABLE } from './userManagementHierarchy';

/** Curated defaults — same list as Employee Master form (IfspEmployeeMaster). */
export const EMPLOYEE_MASTER_BASE_DEPARTMENTS = [
  'Administration',
  'Commercial',
  'Finance',
  'HR',
  'Compliance',
  'Dahej-HR',
  'Operations',
  'Information System',
  'Management',
  'Marketing',
  'NFPA',
  'Procurement',
  'Production',
  'Design',
  'Projects',
  'R&M',
  'Technical',
  'Projects-FTC',
  'Production-FTC',
  'Administration-FTC',
  'Emergency Response Team-FTC',
  'Maintenance-FTC',
  'Other',
];

function normalizeDeptKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Merge DB departments with curated defaults (case-insensitive dedupe). */
export function mergeEmployeeMasterDepartments(dbDepartments = []) {
  const seen = new Map();
  for (const value of [...(dbDepartments || []), ...EMPLOYEE_MASTER_BASE_DEPARTMENTS]) {
    const trimmed = String(value || '').trim();
    if (!trimmed) continue;
    const key = normalizeDeptKey(trimmed);
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

export async function fetchEmployeeMasterDepartments(supabase) {
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select('department');

  if (error) throw error;

  const fromDb = [];
  const seen = new Map();
  for (const row of data || []) {
    const value = String(row?.department || '').trim();
    if (!value) continue;
    const key = normalizeDeptKey(value);
    if (!seen.has(key)) {
      seen.set(key, value);
      fromDb.push(value);
    }
  }

  return mergeEmployeeMasterDepartments(fromDb);
}

/** Resolve import/UI input to canonical department label from the allowed list. */
export function resolveDepartmentLabel(raw, departments) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const key = normalizeDeptKey(trimmed);
  const match = (departments || []).find((d) => normalizeDeptKey(d) === key);
  return match || trimmed;
}

export function isKnownDepartment(raw, departments) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  const key = normalizeDeptKey(trimmed);
  return (departments || []).some((d) => normalizeDeptKey(d) === key);
}
