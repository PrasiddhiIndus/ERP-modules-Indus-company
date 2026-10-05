/**
 * Site Attendance page-wise access.
 * Keys live in profiles.allowed_sub_modules (outside the hr.* family so they never
 * grant routes or get cleared when the full HR module is toggled). Route access is
 * still granted by HR / hr.site-attendance.
 *
 * - No page key → every page (unchanged behaviour)
 * - One or more keys → only those pages
 */
import { ROLES, normalizeAppRole, parseAllowedSubModules } from "../../config/roles";

export const SITE_ATTENDANCE_PAGES = [
  { tab: "dashboard", label: "Dashboard" },
  { tab: "sites", label: "Site Master" },
  { tab: "people", label: "People Master" },
  { tab: "attendance", label: "Attendance" },
  { tab: "admin-view", label: "Admin view" },
  { tab: "summary", label: "Summary" },
].map((page) => ({ ...page, value: `site-attendance-page.${page.tab}` }));

/** Tabs (route segments) the user may open in Site Attendance. */
export function getAllowedSiteAttendanceTabs(userProfile) {
  const all = SITE_ATTENDANCE_PAGES.map((page) => page.tab);
  const role = normalizeAppRole(userProfile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return all;
  const subs = parseAllowedSubModules(userProfile?.allowed_sub_modules);
  const picked = SITE_ATTENDANCE_PAGES.filter((page) => subs.includes(page.value)).map((page) => page.tab);
  return picked.length ? picked : all;
}
