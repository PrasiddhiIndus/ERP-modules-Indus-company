import { getInvoiceTotals } from './taxInvoicePdf';

/**
 * Build CN/DN document number: same base as parent tax invoice, prefixed CN- or DN-.
 */
export function cnDnDocumentNumber(noteType, parentTaxInvoiceNumber) {
  const base = String(parentTaxInvoiceNumber || '').trim() || 'INV';
  const u = base.toUpperCase();
  if (u.startsWith('CN-') || u.startsWith('DN-')) return base;
  return noteType === 'debit' ? `DN-${base}` : `CN-${base}`;
}

/** Net receivable for parent tax invoice after linked credit (reduces) and debit (increases) notes. */
export function netAfterCnDn(parentInvoiceId, creditDebitNotes, invoiceTotal) {
  const base = Number(invoiceTotal) || 0;
  let credits = 0;
  let debits = 0;
  for (const n of creditDebitNotes || []) {
    if (String(n.parentInvoiceId) !== String(parentInvoiceId)) continue;
    const amt = Number(n.amount) || 0;
    if (n.type === 'credit') credits += amt;
    else if (n.type === 'debit') debits += amt;
  }
  return Math.round((base - credits + debits) * 100) / 100;
}

/**
 * Build invoice-shaped object for PDF/HTML from parent + edited lines (same layout as tax invoice).
 */
export function buildCnDnInvoiceSnapshot({
  parent,
  noteType,
  noteTaxInvoiceNumber,
  noteDate,
  items,
  reason,
}) {
  const gstSupplyType = parent.gstSupplyType || parent.gst_supply_type || 'intra';
  const { id: _parentId, ...parentRest } = parent || {};
  void _parentId;
  const merged = {
    ...parentRest,
    taxInvoiceNumber: noteTaxInvoiceNumber,
    billNumber: noteTaxInvoiceNumber,
    bill_number: noteTaxInvoiceNumber,
    invoiceDate: noteDate,
    invoice_kind: noteType === 'debit' ? 'debit_note' : 'credit_note',
    invoiceKind: noteType === 'debit' ? 'debit_note' : 'credit_note',
    originalTaxInvoiceNumber: parent.taxInvoiceNumber || parent.bill_number || parent.billNumber,
    invoiceHeaderRemarks:
      reason ||
      parent.invoiceHeaderRemarks ||
      (noteType === 'debit' ? 'Debit note' : 'Credit note'),
    items: items.map((i) => ({
      description: i.description || '',
      hsnSac: i.hsnSac || i.hsn_sac || parent.hsnSac || '',
      quantity: Number(i.quantity) || 0,
      rate: Number(i.rate) || 0,
      amount: Math.round((Number(i.amount) || 0) * 100) / 100,
    })),
    gstSupplyType: gstSupplyType,
    gst_supply_type: gstSupplyType,
  };
  const t = getInvoiceTotals(merged);
  return {
    ...merged,
    taxableValue: t.taxableValue,
    cgstRate: t.cgstRate,
    sgstRate: t.sgstRate,
    cgstAmt: t.cgstAmt,
    sgstAmt: t.sgstAmt,
    igstRate: t.igstRate,
    igstAmt: t.igstAmt,
    calculatedInvoiceAmount: t.totalAmount,
    totalAmount: t.totalAmount,
  };
}
