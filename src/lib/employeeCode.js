/**
 * Canonical ERP person key: employee_code (eTime / attendance / master).
 * Join cross-module data on employee_code — not auth user id or employee_master bigint id.
 *
 * Source of truth: public.admin_ifsp_employee_master.employee_code
 * Auth mirror: public.profiles.employee_code
 */
import { supabase } from "./supabase";
import { normalizeAttendanceEmpCode, EMPLOYEE_MASTER_TABLE, EMPLOYEE_MASTER_CODE_COL } from "./attendanceDaily";

export const EMPLOYEE_CODE_COL = EMPLOYEE_MASTER_CODE_COL;
export const EMPLOYEE_MASTER_TABLE_NAME = EMPLOYEE_MASTER_TABLE;

/** Normalize for comparisons and storage (trim; attendance rules). */
export function normalizeEmployeeCode(code) {
  return normalizeAttendanceEmpCode(code);
}

/** @deprecated use normalizeEmployeeCode */
export const normalizeEmpCode = normalizeEmployeeCode;

/**
 * Current signed-in user's employee_code from profile (if set).
 */
export async function getCurrentUserEmployeeCode() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;
  const { data } = await supabase
    .from("profiles")
    .select("employee_code")
    .eq("id", user.id)
    .maybeSingle();
  return normalizeEmployeeCode(data?.employee_code) || null;
}

/**
 * Resolve employee_code from auth user id (profiles → employee master).
 */
export async function employeeCodeForUserId(userId) {
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("employee_code")
    .eq("id", userId)
    .maybeSingle();
  const fromProfile = normalizeEmployeeCode(profile?.employee_code);
  if (fromProfile) return fromProfile;

  const { data: master } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(EMPLOYEE_CODE_COL)
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeEmployeeCode(master?.[EMPLOYEE_CODE_COL]) || null;
}

/**
 * Load employee master row by employee_code (primary lookup).
 */
export async function fetchEmployeeByCode(employeeCode, select = "id, employee_id, employee_code, full_name, status, department, designation, user_id") {
  const code = normalizeEmployeeCode(employeeCode);
  if (!code) return null;
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(select)
    .ilike(EMPLOYEE_CODE_COL, code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Batch index employees by employee_code.
 */
export async function fetchEmployeesByCodes(codes, select = "id, employee_id, employee_code, full_name, status, department, designation, user_id") {
  const normalized = [...new Set((codes || []).map(normalizeEmployeeCode).filter(Boolean))];
  if (!normalized.length) return {};
  const { data, error } = await supabase
    .from(EMPLOYEE_MASTER_TABLE)
    .select(select)
    .in(EMPLOYEE_CODE_COL, normalized);
  if (error) throw error;
  const map = {};
  (data || []).forEach((row) => {
    const k = normalizeEmployeeCode(row[EMPLOYEE_CODE_COL]);
    if (k) map[k] = row;
  });
  return map;
}

/**
 * Attach employee_code fields when writing rows that still store user_id / created_by uuid.
 * Example: { created_by: user.id, ... } → also sets created_by_employee_code.
 */
export async function enrichActorFields(row, mappings = [{ uuidKey: "created_by", codeKey: "created_by_employee_code" }]) {
  const out = { ...row };
  await Promise.all(
    mappings.map(async ({ uuidKey, codeKey }) => {
      if (out[uuidKey] && !out[codeKey]) {
        out[codeKey] = await employeeCodeForUserId(out[uuidKey]);
      }
    }),
  );
  return out;
}

/**
 * Attach subject employee_code when writing rows with employee_master_id.
 */
export async function enrichSubjectEmployeeCode(row, {
  masterIdKey = "employee_master_id",
  codeKey = "employee_code",
} = {}) {
  const out = { ...row };
  if (out[masterIdKey] && !out[codeKey]) {
    const { data } = await supabase
      .from(EMPLOYEE_MASTER_TABLE)
      .select(EMPLOYEE_CODE_COL)
      .eq("id", out[masterIdKey])
      .maybeSingle();
    out[codeKey] = normalizeEmployeeCode(data?.[EMPLOYEE_CODE_COL]) || null;
  }
  return out;
}

/**
 * Join helper: merge master fields onto rows that only have employee_code.
 */
export function joinRowsByEmployeeCode(rows, masterByCode, {
  codeKey = "employee_code",
  prefix = "employee_",
} = {}) {
  return (rows || []).map((row) => {
    const code = normalizeEmployeeCode(row[codeKey]);
    const master = code ? masterByCode[code] : null;
    if (!master) return row;
    return {
      ...row,
      [`${prefix}name`]: master.full_name ?? null,
      [`${prefix}department`]: master.department ?? null,
      [`${prefix}designation`]: master.designation ?? null,
      [`${prefix}status`]: master.status ?? null,
    };
  });
}
