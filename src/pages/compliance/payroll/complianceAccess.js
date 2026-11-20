/**
 * Compliance module (Payroll, IFSPL, General).
 * Open for allowlisted emails, Super Admins, or Compliance granted in User Management.
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

/** Compliance sections as listed in User Management. */
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

function toKeyList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,|\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeRole(role) {
  const r = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (r === "superadmin_pro" || r === "super_admin_pro") return "super_admin_pro";
  if (r === "superadmin" || r === "super_admin") return "super_admin";
  return r;
}

/** Map compliance.payroll.dashboard → compliance.payroll, etc. */
export function resolveComplianceSectionKey(subModuleKey) {
  const key = String(subModuleKey || "");
  if (!key) return null;
  const found = COMPLIANCE_SECTIONS.find((s) => key === s.key || key.startsWith(`${s.key}.`));
  return found?.key || null;
}

/**
 * True when profile has Compliance via role, team, allowed_modules, or allowed_sub_modules.
 * @param {string|null} sectionKey — when set, requires that section (or full module).
 */
function profileHasComplianceGrant(profile, sectionKey = null) {
  if (!profile) return false;
  const role = normalizeRole(profile.role);
  if (role === "super_admin" || role === "super_admin_pro") return true;

  const team = String(profile.team || "")
    .trim()
    .toLowerCase();
  if (team === "compliance") return true;

  const modules = toKeyList(profile.allowed_modules).map((m) => m.toLowerCase());
  if (modules.includes("compliance") || modules.includes("*")) return true;

  const subs = toKeyList(profile.allowed_sub_modules);
  if (!sectionKey) {
    return COMPLIANCE_SECTIONS.some(
      (s) => subs.includes(s.key) || subs.some((k) => String(k).startsWith(`${s.key}.`))
    );
  }
  return subs.includes(sectionKey) || subs.some((k) => String(k).startsWith(`${sectionKey}.`));
}

/** True when this signed-in person may open the named Compliance section. */
export function canAccessComplianceSection(profile, user = null, sectionKey) {
  const resolved = resolveComplianceSectionKey(sectionKey) || sectionKey;
  if (!COMPLIANCE_SECTIONS.some((section) => section.key === resolved)) return false;
  if (isComplianceAllowedEmail(resolveUserEmail(profile, user))) return true;
  return profileHasComplianceGrant(profile, resolved);
}

/** True when the user may open at least one Compliance section. */
export function canAccessCompliance(profile, user = null) {
  if (isComplianceAllowedEmail(resolveUserEmail(profile, user))) return true;
  return profileHasComplianceGrant(profile, null);
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
