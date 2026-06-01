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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** UI / draft row for amounts adjusted before GST. */
export function createPreGstSupplementaryRow(overrides = {}) {
  return {
    id:
      overrides.id ||
      `pgs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    description: overrides.description ?? '',
    amount: overrides.amount ?? '',
    type: overrides.type === 'deduct' ? 'deduct' : 'add',
  };
}

/** Load supplementary rows from invoice JSON or legacy deduction/addition columns. */
export function parsePreGstSupplementaryRows(inv) {
  const raw = inv?.preGstSupplementaryRows ?? inv?.pre_gst_supplementary_rows;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((r, i) =>
      createPreGstSupplementaryRow({
        id: r.id || `pgs-${i}`,
        description: r.description ?? r.label ?? '',
        amount: r.amount ?? '',
        type: r.type === 'deduct' || r.direction === 'deduct' ? 'deduct' : 'add',
      })
    );
  }
  const ded = Number(inv?.preGstDeduction ?? inv?.pre_gst_deduction) || 0;
  const add = Number(inv?.preGstAddition ?? inv?.pre_gst_addition) || 0;
  const rows = [];
  if (ded > 0) {
    rows.push(
      createPreGstSupplementaryRow({
        description: 'Supplementary deduction',
        amount: ded,
        type: 'deduct',
      })
    );
  }
  if (add > 0) {
    rows.push(
      createPreGstSupplementaryRow({
        description: 'Supplementary addition',
        amount: add,
        type: 'add',
      })
    );
  }
  return rows;
}

/** Persisted shape (no client id). */
export function serializePreGstSupplementaryRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    description: String(r.description ?? '').trim(),
    amount: round2(Math.abs(Number(r.amount) || 0)),
    type: r.type === 'deduct' ? 'deduct' : 'add',
  }));
}

/** Legacy totals for DB columns and older consumers. */
export function summarizePreGstLegacyTotals(rows) {
  let deduction = 0;
  let addition = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const amt = Math.abs(Number(r.amount) || 0);
    if (amt <= 0) continue;
    if (r.type === 'deduct') deduction += amt;
    else addition += amt;
  }
  return { deduction: round2(deduction), addition: round2(addition) };
}

export function applyPreGstSupplementaryRows(lineTotal, rows) {
  const base = Number(lineTotal) || 0;
  let total = base;
  for (const r of Array.isArray(rows) ? rows : []) {
    const amt = Math.abs(Number(r.amount) || 0);
    if (amt <= 0) continue;
    total += r.type === 'deduct' ? -amt : amt;
  }
  return round2(total);
}

/** Rows with a positive amount (for preview/PDF). */
export function activePreGstSupplementaryRows(inv) {
  return parsePreGstSupplementaryRows(inv).filter((r) => Math.abs(Number(r.amount) || 0) > 0);
}

/** Label for the pre-GST supplementary addition row on invoice print. */
export function resolvePreGstAdditionLabel(inv) {
  const text = String(inv?.preGstAdditionDescription ?? inv?.pre_gst_addition_description ?? '').trim();
  return text || 'Supplementary amount (before GST)';
}
