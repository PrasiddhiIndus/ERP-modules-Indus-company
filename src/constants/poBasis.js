/** Commercial PO basis — persisted as billing.po_wo.billing_without_po */

export const PO_BASIS_WITH_PO = 'with_po';
export const PO_BASIS_WITHOUT_PO = 'without_po';

/** Billing toolbar: '' = show both kinds for the selected vertical */
export const PO_BASIS_FILTER_ALL = '';

/** Dummy WO numbers generated for without-PO contracts (see buildWithoutPoDummyIds). */
export function isGeneratedWithoutPoWoNumber(wo) {
  return /^WOPO-/i.test(String(wo ?? '').trim());
}

/** True when this contract is billed without a customer PO (DB flag and/or WOPO- identifier). */
export function isPoWithoutPoBilling(po) {
  if (po?.billingWithoutPo === true) return true;
  const wo = po?.poWoNumber ?? po?.po_wo_number;
  return isGeneratedWithoutPoWoNumber(wo);
}

export function resolveBillingPoBasis(po) {
  return isPoWithoutPoBilling(po) ? PO_BASIS_WITHOUT_PO : PO_BASIS_WITH_PO;
}

export function getFinancialYearSlug() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  return m >= 3 ? `${y.toString().slice(2)}/${(y + 1).toString().slice(2)}` : `${(y - 1).toString().slice(2)}/${y.toString().slice(2)}`;
}

/**
 * Standard OC line (same shape as Commercial PO Entry); uniqueness from sequence.
 * Dummy WO identifier prefix identifies non-PO billing contracts.
 */
export function buildWithoutPoDummyIds({ verticalLabel, ocSeries }) {
  const fy = getFinancialYearSlug();
  const seq = String(ocSeries || '1').padStart(5, '0');
  const ocNumber = `IFSPL-${verticalLabel}-OC-${fy}-${seq}`;
  const fySlug = fy.replace(/\//g, '-');
  const poWoNumber = `WOPO-${fySlug}-${seq}`;
  return { ocNumber, poWoNumber };
}
