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

function pickHsnSacFromRateRows(rows) {
  for (const r of Array.isArray(rows) ? rows : []) {
    const h = String(
      r?.hsnSac ?? r?.hsn_sac ?? r?.sacHsn ?? r?.sac_hsn ?? r?.hsnCode ?? r?.hsn_code ?? ''
    ).trim();
    if (h) return h;
  }
  return '';
}

/** HSN/SAC from PO header or rate categories (billing.po_rate_category.hsn_sac). */
export function resolvePoHsnSac(po) {
  if (!po) return '';
  const direct = String(
    po.hsnSac ??
      po.hsn_sac ??
      po.hsnCode ??
      po.hsn_code ??
      po.sacCode ??
      po.sac_code ??
      ''
  ).trim();
  if (direct) return direct;
  return pickHsnSacFromRateRows(po.ratePerCategory ?? po.rate_per_category);
}

/** Find linked PO for a saved invoice (by id or PO/WO number). */
export function findPoForInvoice(inv, pos = []) {
  if (!inv || !Array.isArray(pos) || !pos.length) return null;
  const poId = inv.poId ?? inv.po_id;
  if (poId) {
    const byId = pos.find((p) => p.id === poId);
    if (byId) return byId;
  }
  const wo = String(inv.poWoNumber ?? inv.po_wo_number ?? '').trim();
  if (!wo) return null;
  return (
    pos.find((p) => String(p.poWoNumber ?? p.po_wo_number ?? '').trim() === wo) ||
    pos.find((p) => String(p.ocNumber ?? p.oc_number ?? '').trim() === wo) ||
    null
  );
}

/**
 * Merge PO fields onto invoice for preview/PDF (HSN/SAC, material-code flag).
 * Invoice row values win when already set.
 */
export function enrichInvoiceWithPo(inv, po) {
  if (!inv) return inv;
  const linkedPo = po ?? inv._linkedPo ?? null;
  const poHsn = resolvePoHsnSac(linkedPo);
  const invHsn = String(inv.hsnSac ?? inv.hsn_sac ?? '').trim();
  const hsnSac = invHsn || poHsn || pickHsnSacFromRateRows(inv.items) || '';
  const materialCodeRequired =
    poRequiresMaterialCode(inv) || poRequiresMaterialCode(linkedPo);
  const items = (Array.isArray(inv.items) ? inv.items : []).map((line) => {
    const lineHsn = String(line?.hsnSac ?? line?.hsn_sac ?? '').trim();
    return {
      ...line,
      hsnSac: lineHsn || hsnSac,
    };
  });
  return {
    ...inv,
    hsnSac,
    hsn_sac: hsnSac,
    hsnCode: inv.hsnCode ?? inv.hsn_code ?? linkedPo?.hsnCode ?? linkedPo?.hsn_code ?? poHsn,
    sacCode: inv.sacCode ?? inv.sac_code ?? linkedPo?.sacCode ?? linkedPo?.sac_code ?? poHsn,
    materialCodeRequired,
    material_code_required: materialCodeRequired,
    items,
  };
}

/** Invoice-level HSN/SAC: invoice header → PO → line items. */
export function resolveInvoiceLevelHsnSac(inv, po = null) {
  const linkedPo = po ?? findPoForInvoice(inv, inv?._poList);
  const fromInv = String(inv?.hsnSac ?? inv?.hsn_sac ?? '').trim();
  if (fromInv) return fromInv;
  const fromPo = resolvePoHsnSac(linkedPo);
  if (fromPo) return fromPo;
  const fromHeader = String(inv?.hsnCode ?? inv?.hsn_code ?? inv?.sacCode ?? inv?.sac_code ?? '').trim();
  if (fromHeader) return fromHeader;
  const fromLines = pickHsnSacFromRateRows(inv?.items);
  if (fromLines) return fromLines;
  return '–';
}

/** When true, line items show Material code; HSN/SAC is shown above the line table (not in meta / not per line). */
export function shouldShowHsnSacAboveLineItems(inv, po = null) {
  return poRequiresMaterialCode(inv) || poRequiresMaterialCode(po);
}

/** @alias shouldShowHsnSacAboveLineItems */
export function shouldShowInvoiceLevelHsnSac(inv, po = null) {
  return shouldShowHsnSacAboveLineItems(inv, po);
}

/** HSN/SAC value for the band above the line-items table. */
export function resolveHsnSacAboveLineItems(inv, po = null) {
  const code = resolveInvoiceLevelHsnSac(inv, po);
  return code && code !== '–' && code !== '-' ? code : '–';
}

/** Meta block no longer includes HSN/SAC when material code is on lines (shown above table instead). */
export function appendHsnSacToMetaRows(rows) {
  return rows;
}

/** HSN/SAC on invoice line (when PO does not require material code on lines). */
export function resolveInvoiceLineHsnSac(line, inv, po = null) {
  const lineHsn = String(line?.hsnSac ?? line?.hsn_sac ?? '').trim();
  if (lineHsn) return lineHsn;
  const invHsn = resolveInvoiceLevelHsnSac(inv, po);
  return invHsn === '–' || invHsn === '-' ? '–' : invHsn;
}

/** Material code on invoice line (when PO requires material code on lines). */
export function resolveInvoiceLineMaterialCode(line) {
  const material = String(line?.materialCode ?? line?.material_code ?? '').trim();
  return material || '–';
}

/** @deprecated Use resolveInvoiceLineMaterialCode or resolveInvoiceLineHsnSac */
export function resolveInvoiceLineMaterialOrHsn(line, inv, po = null) {
  const linkedPo = po ?? findPoForInvoice(inv, inv?._poList);
  if (poRequiresMaterialCode(inv) || poRequiresMaterialCode(linkedPo)) {
    return resolveInvoiceLineMaterialCode(line);
  }
  return resolveInvoiceLineHsnSac(line, inv, linkedPo);
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
