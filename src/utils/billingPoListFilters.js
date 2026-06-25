import {
  COMMERCIAL_MODULE_MANPOWER_TRAINING,
  getCommercialPoModuleType,
} from '../constants/commercialModuleType';

/** Align with Billing toolbar vertical keys (Manpower, Training, R&M, …). */
export function normalizeBillingVerticalKey(v) {
  const raw = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  const aliases = {
    bill: 'manpower',
    manp: 'manpower',
    manpower: 'manpower',
    mp: 'manpower',
    train: 'training',
    trng: 'training',
    training: 'training',
    rm: 'rm',
    mm: 'mm',
    amc: 'amc',
    iev: 'iev',
    projects: 'projects',
    project: 'projects',
  };
  return aliases[raw] || raw;
}

/**
 * Resolve PO vertical for Billing filters — mirrors Commercial PO Entry department labels
 * (MANP/BILL/Manpower, OC segment, module fallback) so every saved PO is visible.
 */
export function resolveBillingVerticalKey(po) {
  const vRaw = String(po?.vertical || po?.poVertical || '').trim();
  if (vRaw === 'MANP' || vRaw === 'BILL' || vRaw === 'Manpower') return 'manpower';
  if (vRaw === 'Training' || vRaw === 'TRAIN') return 'training';
  if (vRaw) {
    const dk = normalizeBillingVerticalKey(vRaw);
    if (dk) return dk;
  }

  const oc = String(po?.ocNumber || po?.oc_number || '').trim();
  if (oc.startsWith('IFSPL-') && oc.includes('-')) {
    const seg = oc.split('-')[1];
    if (seg) {
      if (seg === 'MANP' || seg === 'BILL' || seg === 'Manpower') return 'manpower';
      if (seg === 'Training' || seg === 'TRAIN') return 'training';
      const dk = normalizeBillingVerticalKey(seg);
      if (dk) return dk;
    }
  }

  if (getCommercialPoModuleType(po) === COMMERCIAL_MODULE_MANPOWER_TRAINING) {
    return 'manpower';
  }
  return '';
}

/** Canonical billing tab id for Create Invoice (matches Commercial PO Entry + legacy DB values). */
export function resolvePoBillingTabType(po) {
  const raw = String(
    po?.billingType ?? po?.billing_type ?? po?.poType ?? po?.po_type ?? ''
  ).trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'daily' || lower === 'per day' || lower === 'day' || lower === 'day rate') {
    return 'Per Day';
  }
  if (lower === 'monthly') return 'Monthly';
  if (lower === 'lump sum' || lower === 'lumpsum') return 'Lump Sum';
  if (lower === 'custom calculator') return 'Custom Calculator';
  if (lower === 'custom') return 'Custom';
  if (lower === 'service') return 'Service';
  if (lower === 'supply') return 'Supply';
  return raw;
}

/** Whether a PO belongs on the active Create Invoice billing-type tab. */
export function poMatchesBillingTab(po, tabId) {
  const tab = String(tabId || '').trim();
  const bt = resolvePoBillingTabType(po);
  if (!bt) return true;
  return bt === tab;
}
