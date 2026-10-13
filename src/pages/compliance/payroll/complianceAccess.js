/**
 * Compliance module (Payroll, IFSPL, General).
 * Only Vivek, Vaisakh / Vaishak, and Rahul may open any Compliance section.
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

/** Compliance sections as listed in User Management. Access is still the email allowlist only. */
export const COMPLIANCE_SECTIONS = Object.freeze([
  { key: "compliance.payroll", prefix: COMPLIANCE_PATH_PREFIX },
  { key: "compliance.ifspl", prefix: "/app/ifsp-employee-compliance" },
  { key: "compliance.general", prefix: "/app/general-compliance" },
]);

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

/** True when this signed-in person may open the named Compliance section. */
export function canAccessComplianceSection(profile, user = null, sectionKey) {
  if (!COMPLIANCE_SECTIONS.some((section) => section.key === sectionKey)) return false;
  return isComplianceAllowedEmail(resolveUserEmail(profile, user));
}

/** True when the user may open at least one Compliance section. */
export function canAccessCompliance(profile, user = null) {
  return isComplianceAllowedEmail(resolveUserEmail(profile, user));
}

export function complianceSectionForPath(pathname) {
  const p = String(pathname || "");
  return COMPLIANCE_SECTIONS.find((section) => p === section.prefix || p.startsWith(`${section.prefix}/`))?.key || null;
}

/** Route check for a Compliance path. */
export function canOpenCompliancePath(profile, user = null, pathname) {
  const key = complianceSectionForPath(pathname);
  return key ? canAccessComplianceSection(profile, user, key) : false;
}

export function isCompliancePath(pathname) {
  return complianceSectionForPath(pathname) != null;
}
