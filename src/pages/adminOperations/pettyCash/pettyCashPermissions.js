/**
 * Admin → Petty Cash permission rules (pure, no React). Mirrors the database helpers in
 * supabase/migrations/20261128120000_admin_petty_cash_masters.sql:
 *   current_user_can_view_petty_cash()            → canViewPettyCash
 *   current_user_can_manage_petty_cash_masters()  → canManagePettyCashMasters
 *
 * Explicit-only: the Admin module, Admin team and Admin role do NOT grant Petty Cash.
 * Super Admin / Super Admin Pro keep full access. Everyone else needs a User Management tick:
 *   "Petty Cash" (admin.petty-cash)                                       → open Petty Cash, enter expenses, read masters
 *   "Manage Overhead & Expense Masters" (admin.petty-cash.manage-masters) → also add / edit / delete overheads
 * Route access uses the same rule via isPathAllowed / getAccessibleSubModulePaths in config/roles.js.
 */
import {
  getEffectiveAllowedSubModules,
  isPettyCashKey,
  normalizeAppRole,
  PETTY_CASH_MANAGE_MASTERS_KEY,
  ROLES,
} from "../../../config/roles";

function isActive(profile) {
  return Boolean(profile) && profile.is_active !== false;
}

function isSuperAdmin(profile) {
  const role = normalizeAppRole(profile?.role);
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

function grantedKeys(profile) {
  return getEffectiveAllowedSubModules(profile).map((k) => String(k));
}

export function canManagePettyCashMasters(profile) {
  if (!isActive(profile)) return false;
  if (isSuperAdmin(profile)) return true;
  return grantedKeys(profile).includes(PETTY_CASH_MANAGE_MASTERS_KEY);
}

export function canViewPettyCash(profile, _accessibleModules = null, _userMetadata = null) {
  if (!isActive(profile)) return false;
  if (isSuperAdmin(profile)) return true;
  return grantedKeys(profile).some(isPettyCashKey);
}
