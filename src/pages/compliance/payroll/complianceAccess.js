/**
 * Compliance payroll module (dashboard + PF/ESIC filings) — same allowlist as Salary Admin.
 */
import {
  canAccessSalaryAdmin,
  isSalaryAdminAllowedEmail,
  resolveUserEmail,
} from "../../adminOperations/salaryAdmin/salaryAccess";

export const COMPLIANCE_PATH_PREFIX = "/app/compliance";
export const COMPLIANCE_SUBMODULE_KEY = "compliance.payroll";

export function canAccessCompliance(profile, user = null) {
  return canAccessSalaryAdmin(profile, user);
}

export function isCompliancePath(pathname) {
  const p = String(pathname || "");
  return p === COMPLIANCE_PATH_PREFIX || p.startsWith(`${COMPLIANCE_PATH_PREFIX}/`);
}

export { isSalaryAdminAllowedEmail, resolveUserEmail };