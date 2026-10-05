/**
 * HR Fire / Safety scope (Calling Database + Site Attendance).
 * Keys live in profiles.allowed_sub_modules (outside the hr.* family so they never
 * grant routes or get cleared when the full HR module is toggled).
 *
 * - No key → Fire and Safety (unchanged behaviour)
 * - One or both keys → only records / sites of those types
 * Calling Database mirrors public.current_user_calling_site_types() in the database.
 */
import { ROLES, normalizeAppRole, parseAllowedSubModules } from "../../../config/roles";

export const CALLING_SITE_TYPES = ["Fire", "Safety"];

export const CALLING_FIRE_KEY = "calling-scope.fire";
export const CALLING_SAFETY_KEY = "calling-scope.safety";

export const CALLING_SITE_TYPE_KEYS = [
  { value: CALLING_FIRE_KEY, label: "Fire", siteType: "Fire" },
  { value: CALLING_SAFETY_KEY, label: "Safety", siteType: "Safety" },
];

export function normalizeCallingSiteType(value) {
  const t = String(value || "").trim().toLowerCase();
  if (t === "fire") return "Fire";
  if (t === "safety") return "Safety";
  return "";
}

/** Site types the user may see in Calling Database (always at least one). */
export function getAllowedCallingSiteTypes(userProfile) {
  const role = normalizeAppRole(userProfile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return [...CALLING_SITE_TYPES];
  const subs = parseAllowedSubModules(userProfile?.allowed_sub_modules);
  const allowed = CALLING_SITE_TYPE_KEYS.filter((k) => subs.includes(k.value)).map((k) => k.siteType);
  return allowed.length ? allowed : [...CALLING_SITE_TYPES];
}

export const getAllowedHrSiteTypes = getAllowedCallingSiteTypes;
