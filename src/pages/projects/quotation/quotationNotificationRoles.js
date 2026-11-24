import { supabase } from '../../../lib/supabase';
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

/** Mirrors projects.is_projects_department (no hardcoded people). */
export function isProjectsDepartment(department) {
  const key = String(department || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return key === 'projects' || key === 'project';
}

/**
 * Mirrors projects.is_projects_l1_authority_designation —
 * Manager / Senior Manager family; not Assistant / Asst.
 */
export function isProjectsL1AuthorityDesignation(designation) {
  const v = String(designation || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!v) return false;
  if (/(^|[^a-z])(assistant|asst\.?)([^a-z]|$)/.test(v)) return false;
  if (v === 'manager' || v === 'senior manager') return true;
  return /^(senior\s+)?manager(\s|$|-|\/)/.test(v);
}

/**
 * Sync gate: Projects access + Manager/Executive.
 * Admin / Super Admin are excluded here; Projects Department L1 is confirmed via RPC.
 */
export function canReceiveQuotationStatusNotifications(profile, accessibleModules) {
  const role = normalizeAppRole(profile?.role);
  if (!RECIPIENT_ROLES.has(role)) return false;
  return hasProjectsAccess(profile, accessibleModules);
}

/**
 * Full eligibility including Projects Department L1 (Employee Master mapping on the server).
 * Use this before mounting / fetching the quotation notification popup.
 */
export async function resolveCanReceiveQuotationStatusNotifications(profile, accessibleModules) {
  if (canReceiveQuotationStatusNotifications(profile, accessibleModules)) return true;
  if (!hasProjectsAccess(profile, accessibleModules)) return false;
  try {
    const { data, error } = await supabase.rpc('current_user_can_receive_quotation_status_notifications');
    if (error) {
      console.warn('Quotation notification eligibility check failed', error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.warn('Quotation notification eligibility check failed', err);
    return false;
  }
}
