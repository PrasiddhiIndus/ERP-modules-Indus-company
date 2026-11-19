import { normalizeAppRole, ROLES } from '../../../config/roles';

/** Roles that may see quotation status-change notifications (Manager level or below). */
const RECIPIENT_ROLES = new Set([ROLES.EXECUTIVE, ROLES.MANAGER]);

function hasProjectsAccess(profile, accessibleModules) {
  if (accessibleModules instanceof Set && accessibleModules.has('projects')) return true;
  if (Array.isArray(accessibleModules) && accessibleModules.includes('projects')) return true;
  if (Array.isArray(profile?.allowed_modules)) {
    if (profile.allowed_modules.some((m) => String(m).toLowerCase() === 'projects')) return true;
  }
  // Sub-module-only Projects grants still count as Projects access in the UI.
  const subs = profile?.allowed_sub_modules;
  if (Array.isArray(subs) && subs.some((s) => String(s).toLowerCase().startsWith('projects'))) {
    return true;
  }
  return false;
}

/**
 * Projects access + Manager/Executive only.
 * Admin / Super Admin / Super Admin Pro never receive these notifications.
 */
export function canReceiveQuotationStatusNotifications(profile, accessibleModules) {
  const role = normalizeAppRole(profile?.role);
  if (!RECIPIENT_ROLES.has(role)) return false;
  return hasProjectsAccess(profile, accessibleModules);
}
