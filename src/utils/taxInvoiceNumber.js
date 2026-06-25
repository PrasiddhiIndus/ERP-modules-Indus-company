export const TAX_INVOICE_PREFIX = 'IFSPL';

/** New format: IFSPL/26-27/0001 */
export const TAX_INVOICE_NUMBER_RE = /^IFSPL\/(\d{2}-\d{2})\/(\d{4,})$/i;

/** Legacy format: IFSPL-2026-0001 (still counted for FY sequence continuity). */
const LEGACY_TAX_INVOICE_NUMBER_RE = /^(?:IFSPL|INV)-(\d{4})-(\d{4,})$/i;

/**
 * Indian financial year slug from invoice date — e.g. 26-27 for Apr 2026–Mar 2027.
 * @param {string|Date|undefined} invoiceDate ISO date or Date; defaults to today.
 */
export function getInvoiceFinancialYearSlug(invoiceDate) {
  const d = invoiceDate ? new Date(invoiceDate) : new Date();
  if (Number.isNaN(d.getTime())) {
    return getInvoiceFinancialYearSlug();
  }
  const y = d.getFullYear();
  const m = d.getMonth();
  const startYear = m >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  return `${String(startYear % 100).padStart(2, '0')}-${String(endYear % 100).padStart(2, '0')}`;
}

/** Prefix shown in invoice form: IFSPL/26-27/ */
export function formatTaxInvoiceNumberPrefix(invoiceDate) {
  return `${TAX_INVOICE_PREFIX}/${getInvoiceFinancialYearSlug(invoiceDate)}/`;
}

export function legacyYearToFySlug(yearStr) {
  const y = parseInt(String(yearStr), 10);
  if (!Number.isFinite(y)) return null;
  const start = y % 100;
  const end = (y + 1) % 100;
  return `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}`;
}

/**
 * Parse tax invoice number (new or legacy) for FY + sequence.
 * @returns {{ fySlug: string, sequence: number, format: 'new'|'legacy' } | null}
 */
export function parseTaxInvoiceNumberParts(raw) {
  const s = String(raw || '').trim();
  let m = s.match(TAX_INVOICE_NUMBER_RE);
  if (m) {
    const seq = parseInt(m[2], 10);
    if (!Number.isFinite(seq) || seq < 1) return null;
    return { fySlug: m[1], sequence: seq, format: 'new' };
  }
  m = s.match(LEGACY_TAX_INVOICE_NUMBER_RE);
  if (m) {
    const fySlug = legacyYearToFySlug(m[1]);
    const seq = parseInt(m[2], 10);
    if (!fySlug || !Number.isFinite(seq) || seq < 1) return null;
    return { fySlug, sequence: seq, format: 'legacy' };
  }
  return null;
}

export function generateTaxInvoiceNumber(sequence, invoiceDate) {
  const fySlug = getInvoiceFinancialYearSlug(invoiceDate);
  const seq = String(sequence).padStart(4, '0');
  return `${TAX_INVOICE_PREFIX}/${fySlug}/${seq}`;
}

export function getNextTaxInvoiceSequence(invoices, invoiceDate) {
  const fySlug = getInvoiceFinancialYearSlug(invoiceDate);
  let maxSeq = 0;
  (Array.isArray(invoices) ? invoices : []).forEach((inv) => {
    const raw = String(inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '').trim();
    const parts = parseTaxInvoiceNumberParts(raw);
    if (!parts || parts.fySlug !== fySlug) return;
    if (parts.sequence > maxSeq) maxSeq = parts.sequence;
  });
  return maxSeq + 1;
}

export function getLastTaxInvoiceNumberInFy(invoices, invoiceDate) {
  const fySlug = getInvoiceFinancialYearSlug(invoiceDate);
  let maxSeq = 0;
  (Array.isArray(invoices) ? invoices : []).forEach((inv) => {
    const raw = String(inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '').trim();
    const parts = parseTaxInvoiceNumberParts(raw);
    if (!parts || parts.fySlug !== fySlug) return;
    if (parts.sequence > maxSeq) maxSeq = parts.sequence;
  });
  return maxSeq > 0 ? generateTaxInvoiceNumber(maxSeq, invoiceDate) : null;
}

/** Build full IFSPL/YY-YY/##### from digits-only serial (preserves width when typing leading zeros). */
export function buildFullTaxInvoiceNumberFromSerial(serialDigits, invoiceDate) {
  const fySlug = getInvoiceFinancialYearSlug(invoiceDate);
  const raw = String(serialDigits || '').replace(/\D/g, '').slice(0, 10);
  if (!raw) return '';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return '';
  const width = Math.max(4, raw.length);
  const padded = String(n).padStart(width, '0');
  return `${TAX_INVOICE_PREFIX}/${fySlug}/${padded}`;
}

/**
 * Validate new tax invoice number: format/FY and duplicate protection only.
 * Users may enter any serial number; it does not need to be the next sequence.
 */
export function classifyNewTaxInvoice(trimmed, invoices, invoiceDate) {
  const fySlug = getInvoiceFinancialYearSlug(invoiceDate);
  const parts = parseTaxInvoiceNumberParts(trimmed);
  if (!parts) {
    return {
      kind: 'hard',
      message: `Enter a valid tax invoice number (e.g. ${generateTaxInvoiceNumber(1, invoiceDate)}).`,
    };
  }
  if (parts.fySlug !== fySlug) {
    return { kind: 'hard', message: 'Tax invoice number must use the financial year for the invoice date.' };
  }

  const lower = String(trimmed).trim().toLowerCase();
  const dup = (Array.isArray(invoices) ? invoices : []).some((inv) => {
    const n = String(inv?.taxInvoiceNumber || inv?.billNumber || inv?.bill_number || '').trim().toLowerCase();
    return n === lower;
  });
  if (dup) {
    return {
      kind: 'hard',
      message: 'That invoice number is already used.',
    };
  }
  return { kind: 'ok' };
}
