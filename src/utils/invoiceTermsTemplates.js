/**
 * Standard T&C printed when an invoice has no custom terms text.
 * (Custom text still wins via resolveTermsLines → termsCustomLines / termsText.)
 */
export const STANDARD_INVOICE_TERMS = [
  'Any dispute or discrepancy in the invoice must be raised in writing within 7 days from the invoice date, failing which the invoice shall be deemed accepted.',
];

/**
 * Legacy map — all verticals use the same standard clause so behaviour is fixed across PO types.
 */
export const TERMS_BY_VERTICAL = {
  Manpower: STANDARD_INVOICE_TERMS,
  Projects: STANDARD_INVOICE_TERMS,
  AMC: STANDARD_INVOICE_TERMS,
  'R&M': STANDARD_INVOICE_TERMS,
  'M&M': STANDARD_INVOICE_TERMS,
  BILL: STANDARD_INVOICE_TERMS,
  MANP: STANDARD_INVOICE_TERMS,
};

export const DEFAULT_TERMS_VERTICAL_KEY = 'MANP';

export function getTermsForVertical(_vertical) {
  return STANDARD_INVOICE_TERMS;
}
