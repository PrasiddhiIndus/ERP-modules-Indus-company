/**
 * Compliance module — Vivek, Vaisakh / Vaishak, and Rahul only.
 * These signed-in people may see Compliance Forms and Payroll Compliance.
 */
export const COMPLIANCE_ALLOWED_EMAILS = Object.freeze([
  "rahul.ifspl@gmail.com",
  "vivek@indusfire.com",
  "sharmavivekz683@gmail.com",
  "vaisakh@indusfire.com",
  "vaishak@indusfire.com",
  "vaisakh_fire@yahoo.co.in",
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
  return COMPLIANCE_ALLOWED_EMAILS.includes(norm);
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
