import { ROLES } from "../../config/roles";
import { ACCESS_KEYS } from "./itSupportConstants";

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === "") return [];
  return [String(value)];
}

function isSuperAdmin(userProfile) {
  const role = userProfile?.role;
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

function hasFullItIs(userProfile) {
  const modules = asList(userProfile?.allowed_modules);
  return modules.includes("itIs");
}

function hasSub(userProfile, key) {
  const subs = asList(userProfile?.allowed_sub_modules);
  return subs.includes(key);
}

/** Employees who can raise tickets and view their own — all active users. */
export function canRaise(userProfile) {
  if (!userProfile) return false;
  if (userProfile.is_active === false) return false;
  return true;
}

/** IT agents — queue, assign, priority, internal notes. */
export function canAgent(userProfile) {
  if (!userProfile) return false;
  if (isSuperAdmin(userProfile) || hasFullItIs(userProfile)) return true;
  return hasSub(userProfile, ACCESS_KEYS.agent) || hasSub(userProfile, ACCESS_KEYS.admin);
}

/** Admins — masters + reports. */
export function canAdmin(userProfile) {
  if (!userProfile) return false;
  if (isSuperAdmin(userProfile) || hasFullItIs(userProfile)) return true;
  return hasSub(userProfile, ACCESS_KEYS.admin);
}

export function resolveItSupportAccess(userProfile) {
  const raise = canRaise(userProfile);
  const agent = canAgent(userProfile);
  const admin = canAdmin(userProfile);
  return {
    canRaise: raise,
    canAgent: agent,
    canAdmin: admin,
    hasAny: raise || agent || admin,
  };
}

/** Default landing path for a user entering IT Support. */
export function itSupportLandingPath(userProfile) {
  const access = resolveItSupportAccess(userProfile);
  if (access.canAgent || access.canAdmin) return "/app/it-support";
  if (access.canRaise) return "/app/it-support/raise";
  return "/app/dashboard";
}

export function roleLabel(userProfile) {
  if (canAdmin(userProfile)) return "IT Admin";
  if (canAgent(userProfile)) return "IT Agent";
  if (canRaise(userProfile)) return "Requester";
  return "Viewer";
}
