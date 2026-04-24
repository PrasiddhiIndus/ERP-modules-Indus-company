/**
 * Billing module – Supabase connection to billing schema.
 * Tables: billing.po_wo, billing.po_rate_category, billing.po_contact_log,
 * billing.invoice, billing.invoice_line_item, billing.invoice_attachment,
 * billing.credit_debit_note, billing.payment_advice.
 * RLS ensures only admin/billing (or no profile) can access.
 * In Supabase Dashboard → Settings → API → Exposed schemas, add: billing
 */

import { supabase } from '../lib/supabase';

const BILLING_SCHEMA = 'billing';

function table(name) {
  return supabase.schema(BILLING_SCHEMA).from(name);
}

function toCamelCase(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = toCamelCase(v);
  }
  return out;
}

/** Check if billing DB is available (billing schema + RLS). */
export async function isBillingDbAvailable() {
  try {
    const { error } = await table('po_wo').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// PO/WO + rate category + contact log
// -----------------------------------------------------------------------------

/** Fetch all POs with rate categories and contact log. */
export async function fetchCommercialPOs() {
  const { data: rows, error } = await table('po_wo')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const poIds = (rows || []).map((r) => r.id);
  if (poIds.length === 0) return [];

  const [ratesRes, contactsRes] = await Promise.all([
    table('po_rate_category').select('*').in('po_id', poIds),
    table('po_contact_log').select('*').in('po_id', poIds),
  ]);

  const ratesByPo = {};
  const sortedRates = [...(ratesRes.data || [])].sort((a, b) => {
    const ao = Number(a.sort_order) || 0;
    const bo = Number(b.sort_order) || 0;
    return ao - bo;
  });
  const seenRateKeys = new Set();
  sortedRates.forEach((r) => {
    const dedupeKey = `${r.po_id}::${(r.description || '').trim().toLowerCase()}::${Number(r.qty) || 0}::${Number(r.rate) || 0}::${Number(r.category_penalty) || 0}::${Number(r.sort_order) || 0}`;
    if (seenRateKeys.has(dedupeKey)) return;
    seenRateKeys.add(dedupeKey);
    if (!ratesByPo[r.po_id]) ratesByPo[r.po_id] = [];
    ratesByPo[r.po_id].push({
      description: r.description,
      qty: Number(r.qty) || 0,
      rate: Number(r.rate),
      penalty: r.category_penalty != null ? Number(r.category_penalty) : 0,
    });
  });
  const contactsByPo = {};
  (contactsRes.data || []).forEach((c) => {
    if (!contactsByPo[c.po_id]) contactsByPo[c.po_id] = [];
    contactsByPo[c.po_id].push({
      name: c.contact_name,
      number: c.contact_number,
      from: c.from_date,
      to: c.to_date,
    });
  });

  return (rows || []).map((po) => {
    const c = toCamelCase(po);
    c.remarks = po.remarks ?? po.payment_terms ?? null;
    c.paymentTerms = po.payment_terms ?? po.remarks ?? null;
    c.ratePerCategory = ratesByPo[po.id] || [];
    c.contactHistoryLog = contactsByPo[po.id] || [];
    if (!c.updateHistory && Array.isArray(po.update_history)) c.updateHistory = po.update_history;
    c.isSupplementary = !!po.is_supplementary;
    c.supplementaryParentPoId = po.supplementary_parent_po_id;
    c.supplementaryRequestStatus = po.supplementary_request_status;
    c.supplementaryReason = po.supplementary_reason;
    c.supplementaryRequestedAt = po.supplementary_requested_at;
    c.supplementaryApprovedAt = po.supplementary_approved_at;
    c.renewedPoWoNumber = po.renewed_po_wo_number;
    c.renewedTotalContractValue = po.renewed_total_contract_value != null ? Number(po.renewed_total_contract_value) : null;
    c.renewedStartDate = po.renewed_start_date;
    c.renewedEndDate = po.renewed_end_date;
    c.renewalCycles = Array.isArray(po.renewal_cycles) ? po.renewal_cycles : [];
    c.monthlyDutyQtyMode = po.monthly_duty_qty_mode || null;
    c.lumpSumBillingMode = po.lump_sum_billing_mode || null;
    c.id = po.id;
    return c;
  });
}

/** Build a clear error message for billing DB failures (schema, RLS, etc.). */
function billingErrorMsg(error, context = 'Save') {
  const msg = error?.message || String(error);
  const code = error?.code;
  if (code === 'PGRST301' || /schema|relation.*does not exist|exposed/i.test(msg)) {
    return `${context} failed: Billing schema not exposed. In Supabase Dashboard → Settings → API → Exposed schemas, add "billing".`;
  }
  if (/row-level security|RLS|policy/i.test(msg)) {
    return `${context} failed: Permission denied (RLS). Ensure you are logged in and your profile has role 'admin' or 'billing', or expose schema "billing".`;
  }
  return msg || `${context} failed.`;
}

/** Save full list of POs (upsert), rate categories and contact log. */
export async function saveCommercialPOs(list) {
  if (!Array.isArray(list) || list.length === 0) return;

  for (const po of list) {
    const poIdInput = typeof po.id === 'string' && po.id.length === 36 ? po.id : undefined;
    const payload = {
      ...(poIdInput ? { id: poIdInput } : {}),
      site_id: (po.siteId != null && String(po.siteId).trim()) ? String(po.siteId).trim() : '',
      location_name: po.locationName || null,
      legal_name: (po.legalName != null && String(po.legalName).trim()) ? String(po.legalName).trim() : '',
      billing_address: po.billingAddress || null,
      gstin: po.gstin || null,
      current_coordinator: po.currentCoordinator || null,
      contact_number: po.contactNumber || null,
      oc_number: po.ocNumber || null,
      oc_series: po.ocSeries || null,
      vertical: po.vertical || 'BILL',
      po_wo_number: po.poWoNumber || null,
      po_quantity: Number(po.poQuantity) || 0,
      total_contract_value: Number(po.totalContractValue) || 0,
      sac_code: po.sacCode || null,
      hsn_code: po.hsnCode || null,
      service_description: po.serviceDescription || null,
      start_date: po.startDate && String(po.startDate).trim() ? po.startDate : null,
      end_date: po.endDate && String(po.endDate).trim() ? po.endDate : null,
      billing_type: po.billingType || 'Monthly',
      billing_cycle: Number(po.billingCycle) || 30,
      remarks: po.remarks || po.paymentTerms || null,
      payment_terms: po.paymentTerms || po.remarks || null,
      revised_po: !!po.revisedPO,
      renewal_pending: !!po.renewalPending,
      status: po.status || 'active',
      approval_status: po.approvalStatus || 'draft',
      approval_sent_at: po.approvalSentAt || null,
      vendor_code: po.vendorCode || null,
      gst_supply_type: po.gstSupplyType || 'intra',
      update_history: Array.isArray(po.updateHistory) ? po.updateHistory : [],
      shipping_address: po.shippingAddress || null,
      invoice_terms_text: po.invoiceTermsText || null,
      seller_cin: po.sellerCin || null,
      seller_pan: po.sellerPan || null,
      msme_registration_no: po.msmeRegistrationNo || null,
      msme_clause: po.msmeClause || null,
      place_of_supply: po.placeOfSupply || null,
      is_supplementary: !!po.isSupplementary,
      supplementary_parent_po_id: po.supplementaryParentPoId || null,
      supplementary_request_status: po.supplementaryRequestStatus || null,
      supplementary_reason: po.supplementaryReason || null,
      supplementary_requested_at: po.supplementaryRequestedAt || null,
      supplementary_approved_at: po.supplementaryApprovedAt || null,
      renewed_po_wo_number: po.renewedPoWoNumber || null,
      renewed_total_contract_value: po.renewedTotalContractValue != null ? Number(po.renewedTotalContractValue) : null,
      renewed_start_date: po.renewedStartDate && String(po.renewedStartDate).trim() ? po.renewedStartDate : null,
      renewed_end_date: po.renewedEndDate && String(po.renewedEndDate).trim() ? po.renewedEndDate : null,
      renewal_cycles: Array.isArray(po.renewalCycles) ? po.renewalCycles : [],
      monthly_duty_qty_mode: po.monthlyDutyQtyMode && String(po.monthlyDutyQtyMode).trim() ? String(po.monthlyDutyQtyMode).trim() : null,
      lump_sum_billing_mode: po.lumpSumBillingMode && String(po.lumpSumBillingMode).trim() ? String(po.lumpSumBillingMode).trim() : null,
    };

    const { data: saved, error: poError } = await table('po_wo').upsert(payload, { onConflict: 'id' }).select('id').single();
    if (poError) throw new Error(billingErrorMsg(poError, 'PO/WO save'));
    const savedPoId = saved?.id ?? po.id;

    await table('po_rate_category').delete().eq('po_id', savedPoId);
    const rateRows = (po.ratePerCategory || []).map((r, i) => ({
      po_id: savedPoId,
      description: r.description ?? r.designation ?? '',
      qty: Number(r.qty) || 0,
      rate: Number(r.rate) || 0,
      category_penalty: r.penalty != null ? Number(r.penalty) : 0,
      sort_order: i,
    }));
    if (rateRows.length) {
      const { error: rateErr } = await table('po_rate_category').upsert(rateRows, { onConflict: 'po_id,sort_order' });
      if (rateErr) throw new Error(billingErrorMsg(rateErr, 'Rate category save'));
    }

    await table('po_contact_log').delete().eq('po_id', savedPoId);
    const contactRows = (po.contactHistoryLog || []).map((c) => ({
      po_id: savedPoId,
      contact_name: c.name,
      contact_number: c.number,
      from_date: c.from,
      to_date: c.to,
    }));
    if (contactRows.length) {
      const { error: contactErr } = await table('po_contact_log').insert(contactRows);
      if (contactErr) throw new Error(billingErrorMsg(contactErr, 'Contact log save'));
    }
  }
}

// -----------------------------------------------------------------------------
// Invoices + line items + attachments
// -----------------------------------------------------------------------------

/** Fetch all invoices with line items and attachments. */
export async function fetchInvoices() {
  const { data: rows, error } = await table('invoice')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const ids = (rows || []).map((r) => r.id);
  if (ids.length === 0) return [];

  const [linesRes, attsRes] = await Promise.all([
    table('invoice_line_item').select('*').in('invoice_id', ids).order('line_order'),
    table('invoice_attachment').select('*').in('invoice_id', ids),
  ]);

  const linesByInv = {};
  (linesRes.data || []).forEach((l) => {
    if (!linesByInv[l.invoice_id]) linesByInv[l.invoice_id] = [];
    linesByInv[l.invoice_id].push({
      description: l.description,
      hsnSac: l.hsn_sac,
      quantity: Number(l.quantity),
      rate: Number(l.rate),
      amount: Number(l.amount),
      poQty: l.po_qty != null ? Number(l.po_qty) : undefined,
      actualDuty: l.actual_duty != null ? Number(l.actual_duty) : undefined,
      authorizedDuty: l.authorized_duty != null ? Number(l.authorized_duty) : undefined,
      penalty: l.line_penalty != null ? Number(l.line_penalty) : 0,
      poReferenceRate: l.po_reference_rate != null ? Number(l.po_reference_rate) : undefined,
      isTruckLine: !!l.is_truck_line,
    });
  });
  const attsByInv = {};
  (attsRes.data || []).forEach((a) => {
    if (!attsByInv[a.invoice_id]) attsByInv[a.invoice_id] = [];
    attsByInv[a.invoice_id].push({ name: a.name, type: a.attachment_type, url: a.url });
  });

  return (rows || []).map((inv) => {
    const c = toCamelCase(inv);
    c.poId = inv.po_id;
    c.siteId = inv.site_id;
    c.taxInvoiceNumber = inv.tax_invoice_number;
    c.invoiceDate = inv.invoice_date;
    c.clientLegalName = inv.client_legal_name;
    c.clientAddress = inv.client_address;
    c.ocNumber = inv.oc_number;
    c.poWoNumber = inv.po_wo_number;
    c.billingType = inv.billing_type;
    c.hsnSac = inv.hsn_sac;
    c.taxableValue = inv.taxable_value;
    c.cgstRate = inv.cgst_rate;
    c.sgstRate = inv.sgst_rate;
    c.cgstAmt = inv.cgst_amt;
    c.sgstAmt = inv.sgst_amt;
    c.calculatedInvoiceAmount = inv.calculated_invoice_amount;
    c.totalAmount = inv.total_amount;
    c.paStatus = inv.pa_status;
    c.paymentStatus = inv.payment_status;
    c.pendingAmount = inv.pending_amount;
    c.paymentTerms = inv.payment_terms;
    c.e_invoice_irn = inv.e_invoice_irn;
    c.e_invoice_ack_no = inv.e_invoice_ack_no;
    c.e_invoice_ack_dt = inv.e_invoice_ack_dt;
    c.e_invoice_signed_qr = inv.e_invoice_signed_qr;
    c.lessMoreBilling = inv.less_more_billing;
    c.billNumber = inv.bill_number;
    c.billingMonth = inv.billing_month;
    c.sellerCin = inv.seller_cin;
    c.sellerPan = inv.seller_pan;
    c.msmeRegistrationNo = inv.msme_registration_no;
    c.msmeClause = inv.msme_clause;
    c.billingDurationFrom = inv.billing_duration_from;
    c.billingDurationTo = inv.billing_duration_to;
    c.invoiceHeaderRemarks = inv.invoice_header_remarks;
    c.termsTemplateKey = inv.terms_template_key;
    c.termsCustomText = inv.terms_custom_text;
    c.clientShippingAddress = inv.client_shipping_address;
    c.placeOfSupply = inv.place_of_supply;
    c.buyerPin = inv.buyer_pin ?? null;
    c.buyerPincode = inv.buyer_pincode ?? null;
    c.buyerStateCode = inv.buyer_state_code ?? null;
    c.invoiceKind = inv.invoice_kind || 'tax';
    c.isAddOn = !!inv.is_add_on;
    c.addOnType = inv.add_on_type || null;
    c.isPostContractBuffer = !!inv.is_post_contract_buffer;
    c.cnDnRequestStatus = inv.cn_dn_request_status || null;
    c.cnDnRequestNoteType = inv.cn_dn_request_note_type || null;
    c.cnDnRequestReason = inv.cn_dn_request_reason || null;
    c.cnDnRequestedAt = inv.cn_dn_requested_at || null;
    c.cnDnApprovedAt = inv.cn_dn_approved_at || null;
    c.gstSupplyType = inv.gst_supply_type || 'intra';
    c.igstRate = inv.igst_rate != null ? Number(inv.igst_rate) : 0;
    c.igstAmt = inv.igst_amt != null ? Number(inv.igst_amt) : 0;
    c.digitalSignatureDataUrl = inv.digital_signature_data_url;
    c.created_at = inv.created_at;
    c.updated_at = inv.updated_at;
    c.items = linesByInv[inv.id] || [];
    c.attachments = attsByInv[inv.id] || [];
    c.id = inv.id;
    return c;
  });
}

/** Save a single invoice (upsert) with line items and attachments. */
export async function saveInvoice(inv) {
  const invId = typeof inv.id === 'string' && inv.id.length === 36 ? inv.id : undefined;
  const payload = {
    ...(invId ? { id: invId } : {}),
    po_id: inv.poId,
    site_id: inv.siteId,
    tax_invoice_number: inv.taxInvoiceNumber,
    invoice_date: inv.invoiceDate,
    client_legal_name: inv.clientLegalName,
    client_address: inv.clientAddress,
    gstin: inv.gstin,
    oc_number: inv.ocNumber,
    po_wo_number: inv.poWoNumber,
    billing_type: inv.billingType,
    hsn_sac: inv.hsnSac,
    taxable_value: inv.taxableValue ?? 0,
    cgst_rate: inv.cgstRate ?? 9,
    sgst_rate: inv.sgstRate ?? 9,
    cgst_amt: inv.cgstAmt ?? 0,
    sgst_amt: inv.sgstAmt ?? 0,
    calculated_invoice_amount: inv.calculatedInvoiceAmount ?? 0,
    total_amount: inv.totalAmount ?? 0,
    pa_status: inv.paStatus,
    payment_status: !!inv.paymentStatus,
    pending_amount: inv.pendingAmount,
    payment_terms: inv.paymentTerms,
    e_invoice_irn: inv.e_invoice_irn,
    e_invoice_ack_no: inv.e_invoice_ack_no,
    e_invoice_ack_dt: inv.e_invoice_ack_dt,
    e_invoice_signed_qr: inv.e_invoice_signed_qr,
    less_more_billing: inv.lessMoreBilling,
    bill_number: inv.billNumber || null,
    billing_month: inv.billingMonth || null,
    seller_cin: inv.sellerCin || null,
    seller_pan: inv.sellerPan || null,
    msme_registration_no: inv.msmeRegistrationNo || null,
    msme_clause: inv.msmeClause || null,
    billing_duration_from: inv.billingDurationFrom || null,
    billing_duration_to: inv.billingDurationTo || null,
    invoice_header_remarks: inv.invoiceHeaderRemarks || null,
    terms_template_key: inv.termsTemplateKey || null,
    terms_custom_text: inv.termsCustomText || inv.termsText || null,
    client_shipping_address: inv.clientShippingAddress || null,
    place_of_supply: inv.placeOfSupply || null,
    buyer_pin: inv.buyerPin ?? inv.buyer_pin ?? inv.clientPincode ?? inv.client_pincode ?? null,
    buyer_pincode: inv.buyerPincode ?? inv.buyer_pincode ?? inv.clientPincode ?? inv.client_pincode ?? null,
    buyer_state_code: inv.buyerStateCode ?? inv.buyer_state_code ?? null,
    invoice_kind: inv.invoiceKind || 'tax',
    is_add_on: !!inv.isAddOn,
    add_on_type: inv.addOnType || null,
    is_post_contract_buffer: !!inv.isPostContractBuffer,
    cn_dn_request_status: inv.cnDnRequestStatus || null,
    cn_dn_request_note_type: inv.cnDnRequestNoteType || null,
    cn_dn_request_reason: inv.cnDnRequestReason || null,
    cn_dn_requested_at: inv.cnDnRequestedAt || null,
    cn_dn_approved_at: inv.cnDnApprovedAt || null,
    gst_supply_type: inv.gstSupplyType || 'intra',
    igst_rate: Number(inv.igstRate) || 0,
    igst_amt: Number(inv.igstAmt) || 0,
    digital_signature_data_url: inv.digitalSignatureDataUrl || null,
  };

  let saved;
  let invError;
  ({ data: saved, error: invError } = await table('invoice').upsert(payload, { onConflict: 'id' }).select('id').single());
  if (invError && /buyer_pin|buyer_pincode|buyer_state_code|column/i.test(String(invError?.message || ''))) {
    const { buyer_pin, buyer_pincode, buyer_state_code, ...fallbackPayload } = payload;
    ({ data: saved, error: invError } = await table('invoice')
      .upsert(fallbackPayload, { onConflict: 'id' })
      .select('id')
      .single());
  }
  if (invError) throw invError;
  const invoiceId = saved?.id ?? inv.id;

  await table('invoice_line_item').delete().eq('invoice_id', invoiceId);
  const lineRows = (inv.items || []).map((it, i) => ({
    invoice_id: invoiceId,
    line_order: i,
    description: it.description,
    hsn_sac: it.hsnSac,
    quantity: Number(it.quantity) || 0,
    rate: Number(it.rate) || 0,
    amount: Number(it.amount) || 0,
    po_qty: it.poQty != null ? Number(it.poQty) : null,
    actual_duty: it.actualDuty != null ? Number(it.actualDuty) : null,
    authorized_duty: it.authorizedDuty != null ? Number(it.authorizedDuty) : null,
    line_penalty: it.penalty != null ? Number(it.penalty) : 0,
    po_reference_rate: it.poReferenceRate != null ? Number(it.poReferenceRate) : null,
    is_truck_line: !!it.isTruckLine,
  }));
  if (lineRows.length) {
    const { error: lineErr } = await table('invoice_line_item').insert(lineRows);
    if (lineErr) throw lineErr;
  }

  await table('invoice_attachment').delete().eq('invoice_id', invoiceId);
  const attRows = (inv.attachments || []).map((a) => ({
    invoice_id: invoiceId,
    attachment_type: a.type || 'attendance',
    name: a.name,
    url: a.url,
  }));
  if (attRows.length) {
    const { error: attErr } = await table('invoice_attachment').insert(attRows);
    if (attErr) throw attErr;
  }

  // Keep add-on metadata in a dedicated table as well.
  if (inv.isAddOn) {
    const addOnPayload = {
      invoice_id: invoiceId,
      po_id: inv.poId || null,
      oc_number: inv.ocNumber || null,
      client_name: inv.clientLegalName || null,
      location_name: inv.locationName || null,
      add_on_type: inv.addOnType || 'Other',
      remarks: inv.invoiceHeaderRemarks || null,
      updated_at: new Date().toISOString(),
    };
    const { error: addOnErr } = await table('add_on_invoice').upsert(addOnPayload, { onConflict: 'invoice_id' });
    if (addOnErr) throw addOnErr;
  } else {
    await table('add_on_invoice').delete().eq('invoice_id', invoiceId);
  }

  return invoiceId;
}

/** Save full invoice list (replace all in DB from list). */
export async function saveInvoices(list) {
  if (!Array.isArray(list)) return;
  for (const inv of list) {
    await saveInvoice(inv);
  }
}

// -----------------------------------------------------------------------------
// Credit / Debit notes
// -----------------------------------------------------------------------------

export async function fetchCreditDebitNotes() {
  const { data: rows, error } = await table('credit_debit_note').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (rows || []).map((r) => ({
    id: r.id,
    parentInvoiceId: r.parent_invoice_id,
    parentTaxInvoiceNumber: r.parent_tax_invoice_number,
    type: r.note_type,
    amount: Number(r.amount),
    reason: r.reason,
    e_invoice_irn: r.e_invoice_irn,
    created_at: r.created_at,
    noteTaxInvoiceNumber: r.note_tax_invoice_number || null,
    invoiceSnapshot: r.invoice_snapshot || null,
  }));
}

export async function saveCreditDebitNotes(list) {
  if (!Array.isArray(list)) return;
  const { data: existing } = await table('credit_debit_note').select('id');
  if (existing?.length) {
    const { error: delErr } = await table('credit_debit_note').delete().in('id', existing.map((r) => r.id));
    if (delErr) throw delErr;
  }
  if (list.length === 0) return;
  const rows = list.map((n) => {
    const idOk = typeof n.id === 'string' && n.id.length === 36;
    return {
      ...(idOk ? { id: n.id } : {}),
      parent_invoice_id: n.parentInvoiceId,
      parent_tax_invoice_number: n.parentTaxInvoiceNumber,
      note_type: n.type,
      amount: Number(n.amount) || 0,
      reason: n.reason,
      e_invoice_irn: n.e_invoice_irn || null,
      note_tax_invoice_number: n.noteTaxInvoiceNumber || null,
      invoice_snapshot: n.invoiceSnapshot || null,
    };
  });
  const { error } = await table('credit_debit_note').insert(rows);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Payment advice (keyed by invoice_id)
// -----------------------------------------------------------------------------

export async function fetchPaymentAdvice() {
  const { data: rows, error } = await table('payment_advice').select('*');
  if (error) throw error;
  const byInvoiceId = {};
  (rows || []).forEach((r) => {
    byInvoiceId[r.invoice_id] = {
      paReceivedDate: r.pa_received_date,
      paFileUrl: r.pa_file_url,
      penaltyDeductionAmount: Number(r.penalty_deduction_amount) || 0,
      deductionRemarks: r.deduction_remarks,
    };
  });
  return byInvoiceId;
}

export async function savePaymentAdvice(byInvoiceId) {
  if (!byInvoiceId || typeof byInvoiceId !== 'object') return;
  const entries = Object.entries(byInvoiceId);
  for (const [invoiceId, pa] of entries) {
    const payload = {
      invoice_id: invoiceId,
      pa_received_date: pa.paReceivedDate,
      pa_file_url: pa.paFileUrl,
      penalty_deduction_amount: Number(pa.penaltyDeductionAmount) || 0,
      deduction_remarks: pa.deductionRemarks,
    };
    await table('payment_advice').upsert(payload, { onConflict: 'invoice_id' });
  }
}
