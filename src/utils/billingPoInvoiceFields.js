/** Shared PO → invoice field helpers (Billing + Commercial Manpower). */

export function resolvePoPaymentTerms(po) {
  if (!po) return '30 Days';
  const explicit = String(po.paymentTerms ?? po.payment_terms ?? '').trim();
  if (explicit) return explicit;
  const cycle = Number(po.billingCycle ?? po.billing_cycle);
  if (Number.isFinite(cycle) && cycle > 0) return `${cycle} Days`;
  return '30 Days';
}

/** Service description from PO — printed on tax invoice (not internal remarks). */
export function resolveInvoiceDescriptionFromPo(po) {
  const text = String(po?.serviceDescription ?? po?.service_description ?? '').trim();
  return text || null;
}

export function poRequiresMaterialCode(po) {
  return !!(po?.materialCodeRequired ?? po?.material_code_required);
}

export function resolvePoDateRaw(po) {
  return po?.poDate ?? po?.po_date ?? null;
}

export function formatBillingDisplayDate(value) {
  if (!value) return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function applyPreGstAdjustments(lineTotal, deduction = 0, addition = 0) {
  const base = Number(lineTotal) || 0;
  const ded = Number(deduction) || 0;
  const add = Number(addition) || 0;
  return Math.round((base - ded + add) * 100) / 100;
}
