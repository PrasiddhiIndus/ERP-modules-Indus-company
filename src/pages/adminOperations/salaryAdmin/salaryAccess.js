/**
 * Salary Admin — hard allowlist.
 * Only these signed-in emails may see or use /app/admin/salary-admin
 * (even when the user has full Admin module access).
 */
export const SALARY_ADMIN_ALLOWED_EMAILS = Object.freeze([
  "rahul.ifspl@gmail.com",
  "bency@indusfire.com",
  "latha@indusfire.com",
  "vaisakh_fire@yahoo.co.in",
]);

/** Employee Master sections visible to non–Salary Admin users (Admin module). */
export const EMPLOYEE_MASTER_BASIC_TAB_IDS = Object.freeze([
  "personal",
  "leaves",
  "tours",
]);

export const SALARY_ADMIN_PATH_PREFIX = "/app/admin/salary-admin";
export const SALARY_ADMIN_SUBMODULE_KEY = "admin.salary-admin";

export function normalizeAccessEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isSalaryAdminAllowedEmail(email) {
  const norm = normalizeAccessEmail(email);
  if (!norm) return false;
  return SALARY_ADMIN_ALLOWED_EMAILS.includes(norm);
}

/** Resolve email from profile and/or auth user. */
export function resolveUserEmail(profile, user = null) {
  return normalizeAccessEmail(profile?.email || user?.email || "");
}

export function canAccessSalaryAdmin(profile, user = null) {
  return isSalaryAdminAllowedEmail(resolveUserEmail(profile, user));
}

export function isSalaryAdminPath(pathname) {
  return String(pathname || "").startsWith(SALARY_ADMIN_PATH_PREFIX);
}
