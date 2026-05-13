import {
  COMMERCIAL_MODULE_MANPOWER_TRAINING,
  COMMERCIAL_MODULE_PROJECTS,
  COMMERCIAL_MODULE_RM_MM_AMC_IEV,
  getCommercialPoModuleType,
} from '../constants/commercialModuleType';

const RM_VERTICAL_LABELS = new Set(['R&M', 'M&M', 'AMC', 'IEV']);

/** Align with Commercial PO Entry department filters (vertical / OC segment). */
function isRmFamilyPo(po) {
  const v = String(po.vertical || po.poVertical || '').trim();
  if (RM_VERTICAL_LABELS.has(v)) return true;
  const oc = String(po.ocNumber || po.oc_number || '');
  if (oc.startsWith('IFSPL-')) {
    const seg = oc.split('-')[1];
    if (RM_VERTICAL_LABELS.has(seg)) return true;
  }
  return getCommercialPoModuleType(po) === COMMERCIAL_MODULE_RM_MM_AMC_IEV;
}

function isManpowerTrainingFamilyPo(po) {
  if (isRmFamilyPo(po)) return false;
  return getCommercialPoModuleType(po) === COMMERCIAL_MODULE_MANPOWER_TRAINING;
}

/** PO rows visible on this Commercial PO Entry screen (Manpower/Training vs R&M family). */
function filterPOsByCommercialModule(commercialPOs, moduleType) {
  return (commercialPOs || []).filter((po) => {
    if (moduleType === COMMERCIAL_MODULE_RM_MM_AMC_IEV) return isRmFamilyPo(po);
    if (moduleType === COMMERCIAL_MODULE_MANPOWER_TRAINING) return isManpowerTrainingFamilyPo(po);
    if (moduleType === COMMERCIAL_MODULE_PROJECTS) return getCommercialPoModuleType(po) === COMMERCIAL_MODULE_PROJECTS;
    return getCommercialPoModuleType(po) === moduleType;
  });
}

function poTimestamp(po) {
  return new Date(po.updated_at || po.updatedAt || po.created_at || po.createdAt || po.startDate || 0).getTime() || 0;
}

/**
 * Snapshot of client / identity fields from a saved PO for autofill (new PO or edit).
 * @param {'manpower'|'rm'} variant — RM adds contactEmail & payment term fields.
 */
export function extractClientSnapshotFromPo(po, variant = 'manpower') {
  const contactDigits = String(po.contactNumber || po.contact_number || '')
    .replace(/\D/g, '')
    .slice(0, 10);

  const base = {
    legalName: String(po.legalName || '').trim(),
    billingAddress: String(po.billingAddress || po.billing_address || '').trim(),
    shippingAddress: String(po.shippingAddress || po.shipping_address || '').trim(),
    placeOfSupply: String(po.placeOfSupply || po.place_of_supply || '').trim(),
    gstin: String(po.gstin || '')
      .trim()
      .toUpperCase(),
    panNumber: String(po.panNumber || po.pan_number || '')
      .trim()
      .toUpperCase(),
    gstSupplyType: po.gstSupplyType || po.gst_supply_type || 'intra',
    vendorCode: String(po.vendorCode || po.vendor_code || '').trim(),
    invoiceTermsText: String(po.invoiceTermsText || po.invoice_terms_text || '').trim(),
    sellerCin: String(po.sellerCin || po.seller_cin || '').trim(),
    sellerPan: String(po.sellerPan || po.seller_pan || '').trim(),
    msmeRegistrationNo: String(po.msmeRegistrationNo || po.msme_registration_no || '').trim(),
    msmeClause: String(po.msmeClause || po.msme_clause || '').trim(),
    currentCoordinator: String(po.currentCoordinator || po.current_coordinator || '').trim(),
    contactNumber: contactDigits,
    locationName: String(po.locationName || po.location_name || '').trim(),
    siteId: String(po.siteId || po.site_id || '').trim(),
  };

  if (variant === 'rm') {
    return {
      ...base,
      contactEmail: String(po.contactEmail || po.contact_email || '').trim(),
      paymentTerms: po.paymentTerms || po.payment_terms || 'Immediate',
      customPaymentTermsPercent:
        po.customPaymentTermsPercent != null && po.customPaymentTermsPercent !== ''
          ? String(po.customPaymentTermsPercent)
          : po.custom_payment_terms_percent != null && po.custom_payment_terms_percent !== ''
            ? String(po.custom_payment_terms_percent)
            : '',
    };
  }

  return base;
}

/**
 * One profile per distinct (legal name + GSTIN) from existing POs in this commercial module,
 * keeping the most recently updated PO as the template.
 */
export function buildCommercialClientProfiles(commercialPOs, moduleType, variant = 'manpower', options = {}) {
  const { excludePoId } = options;
  const list = filterPOsByCommercialModule(commercialPOs, moduleType);
  const sorted = [...list].sort((a, b) => poTimestamp(b) - poTimestamp(a));
  const map = new Map();

  for (const po of sorted) {
    if (excludePoId != null && String(po.id) === String(excludePoId)) continue;
    const name = String(po.legalName || '').trim();
    if (!name) continue;
    const gst = String(po.gstin || '')
      .trim()
      .toUpperCase();
    const key = `${name.toLowerCase()}__${gst}`;
    if (!map.has(key)) map.set(key, po);
  }

  const v = variant === 'rm' ? 'rm' : 'manpower';

  return Array.from(map.values()).map((po) => {
    const snapshot = extractClientSnapshotFromPo(po, v);
    const oc = po.ocNumber || po.oc_number || '';
    const pw = po.poWoNumber || po.po_wo_number || '';
    return {
      key: `${snapshot.legalName.toLowerCase()}__${snapshot.gstin}`,
      displayName: snapshot.legalName,
      subtitle: [oc, pw].filter(Boolean).join(' · ') || 'Earlier PO',
      snapshot,
      sourcePoId: po.id,
    };
  });
}
