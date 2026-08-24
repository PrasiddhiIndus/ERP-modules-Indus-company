/**
 * Compliance module (Payroll PF/ESIC, IFSPL, General) — hard email allowlist.
 * Only these signed-in people may see or open Compliance, even with full module access.
 */
export const COMPLIANCE_ALLOWED_EMAILS = Object.freeze([
  "rahul.ifspl@gmail.com",
  "bency@indusfire.com",
  "latha@indusfire.com",
  "vivek@indusfire.com",
  "vaisakh@indusfire.com",
]);

const COMPLIANCE_ALLOWED_LOCAL_PARTS = Object.freeze([
  "rahul",
  "rahul.ifspl",
  "bency",
  "latha",
  "vivek",
  "vaisakh",
]);

export const COMPLIANCE_PATH_PREFIX = "/app/compliance";
export const COMPLIANCE_SUBMODULE_KEY = "compliance.payroll";

export function normalizeAccessEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function resolveUserEmail(profile, user = null) {
  return normalizeAccessEmail(profile?.email || user?.email || "");
}

export function isComplianceAllowedEmail(email) {
  const norm = normalizeAccessEmail(email);
  if (!norm) return false;
  if (COMPLIANCE_ALLOWED_EMAILS.includes(norm)) return true;
  const at = norm.indexOf("@");
  if (at < 1) return false;
  const local = norm.slice(0, at);
  const domain = norm.slice(at + 1);
  if (!COMPLIANCE_ALLOWED_LOCAL_PARTS.includes(local)) return false;
  return domain === "indusfire.com" || domain === "gmail.com";
}

export function canAccessCompliance(profile, user = null) {
  return isComplianceAllowedEmail(resolveUserEmail(profile, user));
}

export function isCompliancePath(pathname) {
  const p = String(pathname || "");
  return (
    p === COMPLIANCE_PATH_PREFIX ||
    p.startsWith(`${COMPLIANCE_PATH_PREFIX}/`) ||
    p.startsWith("/app/ifsp-employee-compliance") ||
    p.startsWith("/app/general-compliance")
  );
}
