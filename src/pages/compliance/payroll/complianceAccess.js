/**
 * Compliance module (Payroll PF/ESIC, IFSPL, General).
 * Open to the email allowlist below and Super Admin (every section), and to users given Compliance
 * in User Management: Compliance team / module → every section, or single sections
 * (compliance.payroll / compliance.ifspl / compliance.general).
 */
export const COMPLIANCE_ALLOWED_EMAILS = Object.freeze([
  "rahul.ifspl@gmail.com",
  "bency@indusfire.com",
  "latha@indusfire.com",
  "vivek@indusfire.com",
  "vaisakh_fire@yahoo.co.in",
  "amitp.ifspl@gmail.com",
]);

const COMPLIANCE_ALLOWED_LOCAL_PARTS = Object.freeze([
  "rahul",
  "rahul.ifspl",
  "bency",
  "latha",
  "vivek",
  "vaisakh",
  "amitp",
  "amitp.ifspl",
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

/** Compliance sections as listed in User Management. */
export const COMPLIANCE_SECTIONS = Object.freeze([
  { key: "compliance.payroll", prefix: COMPLIANCE_PATH_PREFIX },
  { key: "compliance.ifspl", prefix: "/app/ifsp-employee-compliance" },
  { key: "compliance.general", prefix: "/app/general-compliance" },
]);

function keyList(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map((k) => String(k).trim());
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map((k) => String(k).trim()) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const SUPER_ADMIN_ROLES = new Set(["super_admin", "superadmin", "super_admin_pro", "superadmin_pro"]);

/** Whole Compliance module: Super Admin, or User Management (team or Allowed modules). */
function hasFullComplianceGrant(profile) {
  if (profile?.is_active === false) return false;
  const role = String(profile?.role || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (SUPER_ADMIN_ROLES.has(role)) return true;
  if (String(profile?.team || "").trim().toLowerCase() === "compliance") return true;
  return keyList(profile?.allowed_modules).some((m) => m.toLowerCase() === "compliance");
}

/** True when the user may open this Compliance section ("compliance.payroll" etc.). */
export function canAccessComplianceSection(profile, user = null, sectionKey) {
  if (isComplianceAllowedEmail(resolveUserEmail(profile, user))) return true;
  if (hasFullComplianceGrant(profile)) return true;
  if (profile?.is_active === false) return false;
  return keyList(profile?.allowed_sub_modules).includes(sectionKey);
}

/** True when the user may open at least one Compliance section. */
export function canAccessCompliance(profile, user = null) {
  return COMPLIANCE_SECTIONS.some((s) => canAccessComplianceSection(profile, user, s.key));
}

export function complianceSectionForPath(pathname) {
  const p = String(pathname || "");
  return COMPLIANCE_SECTIONS.find((s) => p === s.prefix || p.startsWith(`${s.prefix}/`))?.key || null;
}

/** Route check for a Compliance path. */
export function canOpenCompliancePath(profile, user = null, pathname) {
  const key = complianceSectionForPath(pathname);
  return key ? canAccessComplianceSection(profile, user, key) : false;
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
