import { supabase } from './supabase';
import { normalizeBillingVerticalKey } from '../utils/billingPoListFilters';
import { ROLES } from '../config/roles';

/** Canonical billing verticals — codes match billing.vertical.code and Billing toolbar keys. */
export const BILLING_VERTICAL_CATALOG = [
  { code: 'manpower', label: 'Manpower' },
  { code: 'training', label: 'Training' },
  { code: 'rm', label: 'R&M' },
  { code: 'mm', label: 'M&M' },
  { code: 'amc', label: 'AMC' },
  { code: 'iev', label: 'IEV' },
  { code: 'projects', label: 'Projects' },
];

const ALL_CODES = BILLING_VERTICAL_CATALOG.map((v) => v.code);

function normalizeTeamKey(team) {
  return String(team || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Default vertical codes when Billing is enabled with no custom grants.
 * Mirrors billing.default_vertical_codes_for_team().
 */
export function defaultBillingVerticalCodesForTeam(team) {
  const t = normalizeTeamKey(team);
  if (['billing', 'finance', 'finance/accounts', 'management'].includes(t)) {
    return [...ALL_CODES];
  }
  if (['commercial', 'commercialmt', 'commercial mt'].includes(t)) {
    return ['manpower', 'training'];
  }
  if (['r&m', 'r & m', 'commercialrm', 'commercial rm'].includes(t)) {
    return ['rm'];
  }
  if (['maintenance', 'maintenance-ftc', 'maintenance ftc'].includes(t)) {
    return ['mm'];
  }
  if (['projects', 'projects-ftc', 'projects ftc'].includes(t)) {
    return ['projects'];
  }
  if (t === 'training') return ['training'];
  if (t === 'amc') return ['amc'];
  return [];
}

export function profileHasBillingModuleAccess(profile) {
  if (!profile) return false;
  const team = normalizeTeamKey(profile.team);
  if (team === 'billing' || team === 'tracking') return true;
  const modules = Array.isArray(profile.allowed_modules) ? profile.allowed_modules : [];
  if (modules.some((m) => String(m).toLowerCase() === 'billing' || String(m).toLowerCase() === 'tracking')) {
    return true;
  }
  const subs = Array.isArray(profile.allowed_sub_modules) ? profile.allowed_sub_modules : [];
  return subs.some((s) => {
    const v = String(s).toLowerCase();
    return v === 'billing' || v.startsWith('billing.') || v === 'tracking' || v.startsWith('tracking.');
  });
}

export function isBillingVerticalSuperRole(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

function billingRpc(fn, args = {}) {
  return supabase.schema('billing').rpc(fn, args);
}

export async function listBillingVerticals() {
  const { data, error } = await billingRpc('list_verticals');
  if (error) {
    console.warn('list_verticals RPC failed, using catalog', error);
    return BILLING_VERTICAL_CATALOG.map((v, i) => ({
      id: v.code,
      code: v.code,
      label: v.label,
      sort_order: (i + 1) * 10,
    }));
  }
  return (data || []).map((row) => ({
    id: row.id,
    code: normalizeBillingVerticalKey(row.code),
    label: row.label,
    sort_order: row.sort_order,
  }));
}

export async function listMyBillingVerticalGrants() {
  const { data, error } = await billingRpc('list_my_vertical_grants');
  if (error) {
    // Pre-migration / schema not deployed yet — treat as no grants rather than crashing Billing.
    console.warn('list_my_vertical_grants failed', error);
    return [];
  }
  return (data || []).map((row) => ({
    grantId: row.grant_id,
    verticalId: row.vertical_id,
    code: normalizeBillingVerticalKey(row.code),
    label: row.label,
    source: row.source,
    createdAt: row.created_at,
  }));
}

export async function adminListUserBillingVerticalGrants(userId) {
  const { data, error } = await billingRpc('admin_list_user_vertical_grants', {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    grantId: row.grant_id,
    verticalId: row.vertical_id,
    code: normalizeBillingVerticalKey(row.code),
    label: row.label,
    source: row.source,
    createdAt: row.created_at,
  }));
}

/** Incremental grant — does not replace other verticals. */
export async function adminGrantUserBillingVertical(userId, verticalCode, source = 'manual') {
  const code = normalizeBillingVerticalKey(verticalCode);
  const { data, error } = await billingRpc('admin_grant_user_vertical', {
    p_user_id: userId,
    p_vertical_code: code,
    p_source: source === 'default' ? 'default' : 'manual',
  });
  if (error) throw error;
  return data;
}

/** Incremental revoke — does not touch other verticals. */
export async function adminRevokeUserBillingVertical(userId, verticalCode) {
  const code = normalizeBillingVerticalKey(verticalCode);
  const { data, error } = await billingRpc('admin_revoke_user_vertical', {
    p_user_id: userId,
    p_vertical_code: code,
  });
  if (error) throw error;
  return data;
}

/**
 * Seed team defaults only when the user has zero grants.
 * Safe to call whenever Billing is enabled without customizing.
 */
export async function adminSeedDefaultBillingVerticalGrants(userId, team = null) {
  const { data, error } = await billingRpc('admin_seed_default_vertical_grants', {
    p_user_id: userId,
    p_team: team || null,
  });
  if (error) throw error;
  return data;
}

/**
 * Apply pending add/remove ops (and optional first-time seed) after profile save.
 * Ops are incremental — never a full replace of the grant set.
 */
export async function applyBillingVerticalGrantChanges({
  userId,
  team,
  hadBillingAccessBefore,
  hasBillingAccessAfter,
  grantCodesBefore = [],
  pendingAddCodes = [],
  pendingRemoveCodes = [],
  seedIfEmpty = false,
}) {
  if (!userId) return { ok: false, message: 'User id required' };
  if (!hasBillingAccessAfter) return { ok: true, skipped: true };

  const beforeSet = new Set(
    (grantCodesBefore || []).map((c) => normalizeBillingVerticalKey(c)).filter(Boolean)
  );
  const adds = [
    ...new Set(
      (pendingAddCodes || []).map((c) => normalizeBillingVerticalKey(c)).filter(Boolean)
    ),
  ];
  const removes = [
    ...new Set(
      (pendingRemoveCodes || []).map((c) => normalizeBillingVerticalKey(c)).filter(Boolean)
    ),
  ];

  try {
    const enablingBilling = Boolean(hasBillingAccessAfter && !hadBillingAccessBefore);
    const noCustomOps = adds.length === 0 && removes.length === 0;

    // Explicit seed only (e.g. enable Billing leaving team-default preview untouched).
    if (seedIfEmpty && enablingBilling && beforeSet.size === 0 && noCustomOps) {
      await adminSeedDefaultBillingVerticalGrants(userId, team);
      return { ok: true, seeded: true };
    }

    const defaults = new Set(defaultBillingVerticalCodesForTeam(team));
    for (const code of adds) {
      if (beforeSet.has(code)) continue;
      await adminGrantUserBillingVertical(
        userId,
        code,
        enablingBilling && beforeSet.size === 0 && defaults.has(code) ? 'default' : 'manual'
      );
    }
    for (const code of removes) {
      await adminRevokeUserBillingVertical(userId, code);
    }

    return { ok: true };
  } catch (err) {
    console.error('Billing vertical grant update failed', err);
    return {
      ok: false,
      message: err?.message || 'Could not update billing business-line access.',
    };
  }
}

/** Effective codes for Billing UI picker (grants only; super sees all). */
export function resolveBillingVerticalOptionsForUser({
  role,
  grantCodes = [],
  grantsReady = false,
}) {
  if (isBillingVerticalSuperRole(role)) {
    return BILLING_VERTICAL_CATALOG.map((v) => ({ id: v.code, label: v.label }));
  }
  if (!grantsReady) {
    return [];
  }
  const allowed = new Set((grantCodes || []).map((c) => normalizeBillingVerticalKey(c)).filter(Boolean));
  return BILLING_VERTICAL_CATALOG.filter((v) => allowed.has(v.code)).map((v) => ({
    id: v.code,
    label: v.label,
  }));
}
