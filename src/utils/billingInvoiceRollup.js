/** Shared helpers: aggregate tax invoices per parent PO (incl. supplementary child PO id). */

export function latestRenewalCycle(po) {
  const cycles = Array.isArray(po?.renewalCycles)
    ? po.renewalCycles
    : Array.isArray(po?.renewal_cycles)
      ? po.renewal_cycles
      : [];
  if (!cycles.length) return null;
  return cycles[cycles.length - 1] || null;
}

/** Contract / PO qty for a non-supplementary PO row (matches renewal cycle overlay used in Create Invoice). */
export function resolveContractForBillingParentPo(po) {
  const latestSelf = latestRenewalCycle(po);
  let contract = Number(po.totalContractValue ?? po.total_contract_value) || 0;
  if (!po?.isSupplementary && latestSelf?.po_wo_number != null && latestSelf.total_contract_value != null) {
    contract = Number(latestSelf.total_contract_value) || contract;
  }
  const poQty = Number(po.poQuantity ?? po.po_quantity) || 0;
  return { contract, poQty };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/** YYYY-MM-DD + days in local calendar. */
export function addDaysToYmd(ymd, days) {
  const d = Number(days);
  if (!ymd || !Number.isFinite(d)) return null;
  const base = new Date(String(ymd).slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + Math.trunc(d));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isCountableTaxInvoice(inv) {
  if (!inv || inv.isCancelled) return false;
  const k = String(inv.invoiceKind || inv.invoice_kind || 'tax').toLowerCase();
  if (k === 'proforma') return false;
  return true;
}

/** Main PO billing — exclude add-ons from contract / qty remaining against the PO. */
export function isCountableMainPoInvoice(inv) {
  if (!isCountableTaxInvoice(inv)) return false;
  if (inv.isAddOn) return false;
  return true;
}

function invoiceMoney(inv) {
  const n = Number(inv.totalAmount ?? inv.total_amount ?? inv.calculatedInvoiceAmount ?? inv.calculated_invoice_amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sumLineQtyForRollup(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  return items.reduce((s, it) => {
    if (it?.isTruckLine) return s;
    return s + round3(Number(it.quantity) || 0);
  }, 0);
}

export function supplementaryChildForParent(parentId, commercialPOs) {
  const pid = String(parentId || '');
  if (!pid) return null;
  const child = (commercialPOs || []).find(
    (p) =>
      p?.isSupplementary &&
      String(p?.supplementaryParentPoId || p?.supplementary_parent_po_id || '') === pid
  );
  return child || null;
}

/** All invoices whose po_id is this parent or its supplementary child (first match wins per business rule). */
export function invoicesLinkedToParentPo(parentPo, commercialPOs, allInvoices) {
  const ids = new Set([String(parentPo?.id || '')]);
  const child = supplementaryChildForParent(parentPo?.id, commercialPOs);
  if (child?.id) ids.add(String(child.id));
  return (allInvoices || []).filter((inv) => ids.has(String(inv.poId || inv.po_id || '')));
}

export function rollupMainPoBilling(parentPo, commercialPOs, allInvoices, contractTotal, poQtyTotal) {
  const related = invoicesLinkedToParentPo(parentPo, commercialPOs, allInvoices).filter(isCountableMainPoInvoice);
  let invoicedAmount = 0;
  let invoicedQty = 0;
  let lastInvoiceDate = null;
  for (const inv of related) {
    invoicedAmount += invoiceMoney(inv);
    invoicedQty += sumLineQtyForRollup(inv);
    const d = inv.invoiceDate || inv.invoice_date;
    if (d && (!lastInvoiceDate || String(d).localeCompare(String(lastInvoiceDate)) > 0)) {
      lastInvoiceDate = d;
    }
  }
  const contract = round2(Number(contractTotal) || 0);
  const poQty = round3(Number(poQtyTotal) || 0);
  const cycleRaw = Number(parentPo?.billingCycle ?? parentPo?.billing_cycle);
  const billingCycleDays = Number.isFinite(cycleRaw) && cycleRaw > 0 ? Math.trunc(cycleRaw) : 30;

  let nextBillingDate = null;
  if (lastInvoiceDate) {
    nextBillingDate = addDaysToYmd(lastInvoiceDate, billingCycleDays);
  }

  const remainingContract = round2(contract - invoicedAmount);
  const remainingQty =
    poQty > 0 ? round3(Math.max(0, poQty - invoicedQty)) : null;

  const sortedByDate = [...related].sort((a, b) =>
    String(b.invoiceDate || b.invoice_date || '').localeCompare(String(a.invoiceDate || a.invoice_date || ''))
  );
  const latestInvoice = sortedByDate[0] || null;

  return {
    taxInvoiceCount: related.length,
    invoicedAmount: round2(invoicedAmount),
    invoicedQty: round3(invoicedQty),
    remainingContract,
    remainingQty,
    poQtyTotal: poQty,
    contractTotal: contract,
    lastInvoiceDate,
    nextBillingDate,
    billingCycleDays,
    latestInvoice,
    relatedInvoices: related,
  };
}

/** Prefer most recent invoice that is not IRN-locked; otherwise null (all locked). */
export function pickInvoiceForEdit(relatedInvoices) {
  const sorted = [...(relatedInvoices || [])].sort((a, b) =>
    String(b.invoiceDate || b.invoice_date || '').localeCompare(String(a.invoiceDate || a.invoice_date || ''))
  );
  for (const inv of sorted) {
    const raw = inv.e_invoice_irn || inv.eInvoiceIrn;
    const locked = !!raw && !String(raw).toUpperCase().startsWith('MOCK-IRN-');
    if (!locked) return inv;
  }
  return null;
}
