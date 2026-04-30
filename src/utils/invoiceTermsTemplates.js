/**
 * Optional T&C templates by vertical (Commercial PO vertical / invoice context).
 * User can leave empty and use custom remarks only.
 */
export const TERMS_BY_VERTICAL = {
  Manpower: [
    'Manpower services billed as per attendance / duty norms agreed in the PO.',
    'Payment within agreed credit days from invoice date unless otherwise stated in PO.',
    'GST as applicable; place of supply as per law.',
  ],
  Projects: [
    'Project billing as per milestones / BOQ in the contract.',
    'Retention / deductions if any as per agreed terms in PO.',
    'GST as applicable.',
  ],
  AMC: [
    'AMC coverage and exclusions as per the annual maintenance contract.',
    'Payment within agreed terms from invoice date.',
  ],
  'R&M': [
    'R&M services on actuals / quote as per PO.',
    'Spares and consumables billed separately unless included in scope.',
  ],
  'M&M': [
    'M&M billing as per agreed schedule and rates in PO.',
    'GST as applicable.',
  ],
  /** Legacy key — prefer MANP / Manpower in UI; kept for old rows. */
  BILL: [
    'Goods once sold will not be taken back.',
    'We cannot accept any responsibility for breakage, damage or loss in transit when the goods are dispatched.',
    'Full payment must be made by A/c Payee cheque, NEFT / RTGS.',
    'Interest at 24% per annum will be charged on bills not paid within the due date.',
  ],
  MANP: [
    'Goods once sold will not be taken back.',
    'We cannot accept any responsibility for breakage, damage or loss in transit when the goods are dispatched.',
    'Full payment must be made by A/c Payee cheque, NEFT / RTGS.',
    'Interest at 24% per annum will be charged on bills not paid within the due date.',
  ],
};

export const DEFAULT_TERMS_VERTICAL_KEY = 'MANP';

export function getTermsForVertical(vertical) {
  let key = vertical && typeof vertical === 'string' ? vertical.trim() : '';
  if (key.toUpperCase() === 'BILL') key = 'MANP';
  const v = key && TERMS_BY_VERTICAL[key] ? key : DEFAULT_TERMS_VERTICAL_KEY;
  return TERMS_BY_VERTICAL[v] || TERMS_BY_VERTICAL[DEFAULT_TERMS_VERTICAL_KEY];
}
