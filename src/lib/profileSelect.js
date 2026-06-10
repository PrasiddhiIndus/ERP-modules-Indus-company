/** Shared profile column lists — supports DB before/after employee_code on profiles. */

const EMPLOYEE_CODE_CACHE_KEY = "profiles_employee_code_supported";

export const PROFILE_LIST_SELECT =
  "id, email, username, team, role, allowed_modules, created_at";

export const PROFILE_LIST_SELECT_WITH_EMPLOYEE_CODE =
  "id, email, username, employee_code, team, role, allowed_modules, created_at";

/** @deprecated use PROFILE_LIST_SELECT_WITH_EMPLOYEE_CODE */
export const PROFILE_LIST_SELECT_WITH_EMP = PROFILE_LIST_SELECT_WITH_EMPLOYEE_CODE;

export const PROFILE_AUTH_SELECT =
  "id, email, username, team, role, allowed_modules";

export const PROFILE_AUTH_SELECT_WITH_EMPLOYEE_CODE =
  "id, email, username, employee_code, team, role, allowed_modules";

/** @deprecated use PROFILE_AUTH_SELECT_WITH_EMPLOYEE_CODE */
export const PROFILE_AUTH_SELECT_WITH_EMP = PROFILE_AUTH_SELECT_WITH_EMPLOYEE_CODE;

export function getEmployeeCodeColumnSupported() {
  try {
    const v = sessionStorage.getItem(EMPLOYEE_CODE_CACHE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* ignore */
  }
  return null;
}

/** @deprecated use getEmployeeCodeColumnSupported */
export const getEmpCodeColumnSupported = getEmployeeCodeColumnSupported;

export function setEmployeeCodeColumnSupported(supported) {
  try {
    sessionStorage.setItem(EMPLOYEE_CODE_CACHE_KEY, supported ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** @deprecated use setEmployeeCodeColumnSupported */
export const setEmpCodeColumnSupported = setEmployeeCodeColumnSupported;

export function isMissingProfileEmployeeCodeError(error) {
  if (!error) return false;
  const msg = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    typeof error === "string" ? error : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    (msg.includes("employee_code") || msg.includes("emp_code")) &&
    (msg.includes("does not exist") || msg.includes("42703"))
  );
}

/** @deprecated use isMissingProfileEmployeeCodeError */
export const isMissingProfileEmpCodeError = isMissingProfileEmployeeCodeError;

export const EMPLOYEE_CODE_MIGRATION_HINT =
  "Run supabase/migrations/20260609140000_profiles_emp_code.sql (or 20260609150000_standardize_employee_code_columns.sql) in Supabase SQL Editor to add profiles.employee_code.";

/** @deprecated use EMPLOYEE_CODE_MIGRATION_HINT */
export const EMP_CODE_MIGRATION_HINT = EMPLOYEE_CODE_MIGRATION_HINT;
