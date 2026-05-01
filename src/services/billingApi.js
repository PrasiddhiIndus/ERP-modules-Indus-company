/**
 * Billing module – Supabase connection to billing schema.
 * Tables: billing.po_wo, billing.po_rate_category, billing.po_contact_log,
 * billing.invoice, billing.invoice_line_item, billing.invoice_attachment,
 * billing.credit_debit_note, billing.payment_advice.
 * RLS ensures only admin/billing (or no profile) can access.
 * In Supabase Dashboard → Settings → API → Exposed schemas, add: billing
 */

import { supabase } from '../lib/supabase';
import {
  getCommercialModuleTypeFromUpdateHistory,
  getCommercialPoModuleType,
  withCommercialModuleMarker,
} from '../constants/commercialModuleType';
import { normalizeGstSupplyType } from '../utils/invoiceRound';

const BILLING_SCHEMA = 'billing';
const MODULE_CONTEXT = {
  MANPOWER_TRAINING: 'manpower_training',
  RM_MM_AMC_IEV: 'rm_mm_amc_iev',
};
const MANPOWER_PO_TYPES = new Set(['Per Day', 'Monthly', 'Lump Sum']);
const RM_PO_TYPES = new Set(['Supply', 'Service']);
/** Default OC vertical segment for Manpower/Training PO rows in billing.po_wo (replaces legacy BILL). */
const DEFAULT_PO_VERTICAL_DB = 'MANP';

/** Persist: never send legacy BILL; map Manpower label to MANP; empty → MANP. */
function normalizePoVerticalForPersist(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return DEFAULT_PO_VERTICAL_DB;
  const u = s.toUpperCase();
  if (u === 'BILL') return DEFAULT_PO_VERTICAL_DB;
  if (s.toLowerCase() === 'manpower') return DEFAULT_PO_VERTICAL_DB;
  return s;
}

/** Read: normalize legacy BILL and expose canonical MANP for OC segment / filters. */
function normalizePoVerticalFromDb(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return DEFAULT_PO_VERTICAL_DB;
  if (s.toUpperCase() === 'BILL') return DEFAULT_PO_VERTICAL_DB;
  return s;
}

function table(name) {
  return supabase.schema(BILLING_SCHEMA).from(name);
}

function toModuleContext(moduleType) {
  return moduleType === 'rm-mm-amc-iev'
    ? MODULE_CONTEXT.RM_MM_AMC_IEV
    : MODULE_CONTEXT.MANPOWER_TRAINING;
}

function normalizePoTypeForModule(rawPoType, moduleContext) {
  const value = String(rawPoType || '').trim();
  if (moduleContext === MODULE_CONTEXT.RM_MM_AMC_IEV) {
    if (RM_PO_TYPES.has(value)) return value;
    return 'Service';
  }
  if (MANPOWER_PO_TYPES.has(value)) return value;
  return 'Monthly';
}

/** Rebuild payment_terms-style label from structured RM columns when present (vertical-agnostic read path). */
function inferRmPaymentTermsLabelFromRow(raw) {
  if (!raw || (raw.payment_term_mode == null && raw.advance_percent == null && raw.payment_term_days == null)) {
    return null;
  }
  const mode = raw.payment_term_mode;
  const days = raw.payment_term_days;
  const adv = raw.advance_percent;
  if (mode === 'immediate') return 'Immediate';
  if (mode === 'days' && days != null) return `${days} Days`;
  if (mode === 'advance' && adv === 50) return 'Advance (50% with PO)';
  if (mode === 'advance' && adv === 100) return 'Advance (100% with PO)';
  if (mode === 'advance') return 'Advance (Custom % with PO)';
  return null;
}

/** Every camelCase key we expose to PO Entry / Billing so all verticals share one client shape; missing DB columns read as null. */
const UNIFIED_PO_CLIENT_DEFAULTS = {
  poReceivedDate: null,
  paymentTermMode: null,
  paymentTermDays: null,
  advancePercent: null,
  contactEmail: null,
  panNumber: null,
  monthlyDutyQtyMode: null,
  lumpSumBillingMode: null,
  customPaymentTermsPercent: null,
  poType: null,
};

function mapPoWoRowToClient(po, ratesByPo, contactsByPo) {
  const raw = po;
  const c = toCamelCase(po);
  const inferredTerms = inferRmPaymentTermsLabelFromRow(raw);
  return {
    ...UNIFIED_PO_CLIENT_DEFAULTS,
    ...c,
    remarks: raw.remarks ?? raw.payment_terms ?? null,
    paymentTerms: inferredTerms ?? raw.payment_terms ?? raw.remarks ?? null,
    customPaymentTermsPercent: raw.custom_advance_percent ?? null,
    poReceivedDate: raw.po_received_date ?? null,
    paymentTermMode: raw.payment_term_mode ?? null,
    paymentTermDays: raw.payment_term_days != null ? Number(raw.payment_term_days) : null,
    advancePercent: raw.advance_percent != null ? Number(raw.advance_percent) : null,
    monthlyDutyQtyMode: raw.monthly_duty_qty_mode ?? null,
    lumpSumBillingMode: raw.lump_sum_billing_mode ?? null,
    panNumber: raw.pan_number ?? null,
    contactEmail: raw.contact_email ?? null,
    poType: raw.po_type ?? raw.billing_type ?? null,
    ratePerCategory: ratesByPo[po.id] || [],
    contactHistoryLog: contactsByPo[po.id] || [],
    updateHistory: Array.isArray(raw.update_history) ? raw.update_history : [],
    isSupplementary: !!raw.is_supplementary,
    supplementaryParentPoId: raw.supplementary_parent_po_id,
    supplementaryRequestStatus: raw.supplementary_request_status,
    supplementaryReason: raw.supplementary_reason,
    supplementaryRequestedAt: raw.supplementary_requested_at,
    supplementaryApprovedAt: raw.supplementary_approved_at,
    renewedPoWoNumber: raw.renewed_po_wo_number,
    renewedTotalContractValue:
      raw.renewed_total_contract_value != null ? Number(raw.renewed_total_contract_value) : null,
    renewedStartDate: raw.renewed_start_date,
    renewedEndDate: raw.renewed_end_date,
    renewalCycles: Array.isArray(raw.renewal_cycles) ? raw.renewal_cycles : [],
    vertical: normalizePoVerticalFromDb(raw.vertical),
    id: raw.id,
    moduleType: getCommercialModuleTypeFromUpdateHistory(
      Array.isArray(raw.update_history) ? raw.update_history : []
    ),
  };
}

function deriveRmPaymentTermFields(po = {}) {
  const term = String(po.paymentTerms || '').trim();
  if (!term) {
    return { payment_term_mode: null, payment_term_days: null, advance_percent: null };
  }
  if (term === 'Immediate') {
    return { payment_term_mode: 'immediate', payment_term_days: null, advance_percent: null };
  }
  const daysMatch = term.match(/^(\d+)\s*Days$/i);
  if (daysMatch) {
    return {
      payment_term_mode: 'days',
      payment_term_days: Number(daysMatch[1]) || null,
      advance_percent: null,
    };
  }
  if (term === 'Advance (50% with PO)') {
    return { payment_term_mode: 'advance', payment_term_days: null, advance_percent: 50 };
  }
  if (term === 'Advance (100% with PO)') {
    return { payment_term_mode: 'advance', payment_term_days: null, advance_percent: 100 };
  }
  if (term === 'Advance (Custom % with PO)') {
    const parsed = Number(po.customPaymentTermsPercent);
    return {
      payment_term_mode: 'advance',
      payment_term_days: null,
      advance_percent: Number.isFinite(parsed) ? parsed : null,
    };
  }
  return { payment_term_mode: null, payment_term_days: null, advance_percent: null };
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

/** Lenient: Postgres/uuid types accept standard 8-4-4-4-12 hex (any version nibble). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidString(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim());
}

/** PO/invoice FK columns are uuid; local numeric ids must not be sent to PostgREST. */
function uuidOrNullForFk(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return isUuidString(s) ? s : null;
}

function normalizePgDateOnly(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function requireInvoiceDate(raw) {
  return normalizePgDateOnly(raw) || new Date().toISOString().slice(0, 10);
}

function normalizeTimestamptzOrNull(raw) {
  if (raw == null || raw === '') return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function normalizeInvoiceKindDb(raw) {
  const v = String(raw ?? 'tax').trim().toLowerCase();
  if (v === 'proforma' || v === 'draft' || v === 'tax') return v;
  return 'tax';
}

function normalizeCnDnStatusDb(raw) {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim().toLowerCase();
  if (v === 'pending' || v === 'approved' || v === 'rejected') return v;
  return null;
}

function normalizeCnDnNoteTypeDb(raw) {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim().toLowerCase();
  if (v === 'credit' || v === 'debit') return v;
  return null;
}

/** DB NOT NULL + unique index on tax_invoice_number — never omit or null. */
function taxInvoiceNumberForPayload(inv, resolvedInvoiceId) {
  const s = String(inv.taxInvoiceNumber ?? inv.tax_invoice_number ?? '').trim();
  if (s) return s;
  if (resolvedInvoiceId && isUuidString(String(resolvedInvoiceId))) {
    const compact = String(resolvedInvoiceId).replace(/-/g, '');
    return `TIN-${compact.slice(0, 12)}`;
  }
  return `TIN-PENDING-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function siteIdForPayload(v) {
  if (v == null || v === '') return null;
  return String(v);
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, val]) => val !== undefined));
}

/** billing.invoice buyer_* columns are text; numbers from UI must be coerced. */
function textColumnOrNull(v) {
  if (v == null || v === '') return null;
  return String(v);
}

/** Invoice rows may predate migration adding buyer_* — PostgREST returns schema-cache errors. */
const OPTIONAL_INVOICE_BUYER_KEYS = ['buyer_pin', 'buyer_pincode', 'buyer_state_code'];

function stripOptionalBuyerInvoiceColumns(payload) {
  const next = { ...payload };
  for (const k of OPTIONAL_INVOICE_BUYER_KEYS) delete next[k];
  return next;
}

function supabaseErrBlob(err) {
  if (!err) return '';
  return [err.message, err.details, err.hint, String(err.code ?? '')].filter(Boolean).join(' ');
}

function isBuyerInvoiceColumnsMissingError(err) {
  const s = supabaseErrBlob(err);
  if (!s) return false;
  if (!/buyer_pin|buyer_pincode|buyer_state_code/i.test(s)) return false;
  return /could not find|schema cache|column of 'invoice'|PGRST204|undefined column/i.test(s);
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

/**
 * Fetch POs with rate categories and contact log.
 * @param {{ moduleType?: string } | string} [options] - When set, same rows as DB but filtered (equivalent to GET ?module_type=).
 */
export async function fetchCommercialPOs(options) {
  const moduleType =
    typeof options === 'string'
      ? options
      : options && typeof options === 'object'
        ? options.moduleType
        : undefined;
  const moduleContext =
    options && typeof options === 'object'
      ? options.moduleContext
      : undefined;
  void moduleContext;

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
      email: c.contact_email,
      from: c.from_date,
      to: c.to_date,
    });
  });

  const mapped = (rows || []).map((po) => mapPoWoRowToClient(po, ratesByPo, contactsByPo));

  if (moduleType) {
    return mapped.filter((po) => getCommercialPoModuleType(po) === moduleType);
  }
  return mapped;
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

/**
 * Single billing.po_wo row shape for all verticals: columns not used by the active module are explicitly null.
 */
function buildPoWoSavePayload(po, poIdInput, moduleContext, updateHistoryStamped) {
  const poType = normalizePoTypeForModule(po.billingType ?? po.poType, moduleContext);
  const rmTerms = deriveRmPaymentTermFields(po);
  const isMp = moduleContext === MODULE_CONTEXT.MANPOWER_TRAINING;
  const isRm = moduleContext === MODULE_CONTEXT.RM_MM_AMC_IEV;

  const billingCycleVal = isMp ? Number(po.billingCycle) || 30 : null;
  const paymentTermsVal = isMp ? po.paymentTerms || null : null;
  const monthlyDutyVal =
    isMp && po.monthlyDutyQtyMode && String(po.monthlyDutyQtyMode).trim()
      ? String(po.monthlyDutyQtyMode).trim()
      : null;
  const lumpSumModeVal =
    isMp && po.lumpSumBillingMode && String(po.lumpSumBillingMode).trim()
      ? String(po.lumpSumBillingMode).trim()
      : null;

  const poReceivedVal =
    isRm && po.poReceivedDate && String(po.poReceivedDate).trim() ? po.poReceivedDate : null;
  const customAdvVal =
    isRm && po.customPaymentTermsPercent != null && String(po.customPaymentTermsPercent).trim()
      ? String(po.customPaymentTermsPercent).trim()
      : null;

  return stripUndefined({
    ...(poIdInput ? { id: poIdInput } : {}),
    site_id: po.siteId != null && String(po.siteId).trim() ? String(po.siteId).trim() : '',
    location_name: po.locationName || null,
    legal_name: po.legalName != null && String(po.legalName).trim() ? String(po.legalName).trim() : '',
    billing_address: po.billingAddress || null,
    gstin: po.gstin || null,
    pan_number: po.panNumber || null,
    current_coordinator: po.currentCoordinator || null,
    contact_number: po.contactNumber || null,
    contact_email: po.contactEmail || null,
    oc_number: po.ocNumber || null,
    oc_series: po.ocSeries || null,
    vertical: normalizePoVerticalForPersist(po.vertical),
    po_wo_number: po.poWoNumber || null,
    po_quantity: Number(po.poQuantity) || 0,
    total_contract_value: Number(po.totalContractValue) || 0,
    sac_code: po.sacCode || null,
    hsn_code: po.hsnCode || null,
    service_description: po.serviceDescription || null,
    start_date: po.startDate && String(po.startDate).trim() ? po.startDate : null,
    end_date: po.endDate && String(po.endDate).trim() ? po.endDate : null,
    po_type: poType,
    billing_type: poType,
    billing_cycle: billingCycleVal,
    payment_terms: paymentTermsVal,
    po_received_date: poReceivedVal,
    payment_term_mode: isRm ? rmTerms.payment_term_mode : null,
    payment_term_days: isRm ? rmTerms.payment_term_days : null,
    advance_percent: isRm ? rmTerms.advance_percent : null,
    custom_advance_percent: customAdvVal,
    remarks: po.remarks || null,
    revised_po: !!po.revisedPO,
    renewal_pending: !!po.renewalPending,
    status: po.status || 'active',
    approval_status: po.approvalStatus || 'draft',
    approval_sent_at: po.approvalSentAt || null,
    vendor_code: po.vendorCode || null,
    gst_supply_type: po.gstSupplyType || 'intra',
    update_history: updateHistoryStamped,
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
    renewed_total_contract_value:
      po.renewedTotalContractValue != null ? Number(po.renewedTotalContractValue) : null,
    renewed_start_date: po.renewedStartDate && String(po.renewedStartDate).trim() ? po.renewedStartDate : null,
    renewed_end_date: po.renewedEndDate && String(po.renewedEndDate).trim() ? po.renewedEndDate : null,
    renewal_cycles: Array.isArray(po.renewalCycles) ? po.renewalCycles : [],
    monthly_duty_qty_mode: monthlyDutyVal,
    lump_sum_billing_mode: lumpSumModeVal,
  });
}

/** Save full list of POs (upsert), rate categories and contact log. */
export async function saveCommercialPOs(list, options = {}) {
  if (!Array.isArray(list) || list.length === 0) return;
  const forcedModuleContext = options?.moduleContext;

  for (const po of list) {
    const moduleType = getCommercialPoModuleType(po);
    const moduleContext = forcedModuleContext || toModuleContext(moduleType);
    const updateHistoryStamped = withCommercialModuleMarker(po.updateHistory, moduleType);
    const poIdInput = isUuidString(po.id) ? String(po.id).trim() : undefined;
    const payload = buildPoWoSavePayload(po, poIdInput, moduleContext, updateHistoryStamped);

    const persistPoWo = (p) =>
      poIdInput
        ? table('po_wo').upsert(p, { onConflict: 'id' }).select('id').single()
        : table('po_wo').insert(p).select('id').single();

    let { data: saved, error: poError } = await persistPoWo(payload);
    // DB compatibility fallback for environments where some optional columns are absent.
    if (poError && /column .*po_type|po_type|payment_term_mode|payment_term_days|advance_percent/i.test(String(poError?.message || ''))) {
      const {
        po_type,
        payment_term_mode,
        payment_term_days,
        advance_percent,
        ...fallbackPayload
      } = payload;
      ({ data: saved, error: poError } = await persistPoWo(fallbackPayload));
    }
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
      contact_email: c.email || null,
      from_date: c.from,
      to_date: c.to,
    }));
    if (contactRows.length) {
      const { error: contactErr } = await table('po_contact_log').insert(contactRows);
      if (contactErr) throw new Error(billingErrorMsg(contactErr, 'Contact log save'));
    }
  }
}

/**
 * Delete one or more POs and their dependent billing rows.
 * Accepts a single PO id or an array of PO ids.
 */
export async function deleteCommercialPOs(ids) {
  const poIds = Array.isArray(ids) ? ids : [ids];
  const cleanPoIds = poIds
    .map((id) => (id == null ? '' : String(id).trim()))
    .filter(Boolean);
  if (cleanPoIds.length === 0) return;

  const { data: invoices, error: invoiceFetchErr } = await table('invoice')
    .select('id')
    .in('po_id', cleanPoIds);
  if (invoiceFetchErr) throw invoiceFetchErr;

  const invoiceIds = (invoices || []).map((row) => row.id).filter(Boolean);
  if (invoiceIds.length) {
    const { error: lineErr } = await table('invoice_line_item').delete().in('invoice_id', invoiceIds);
    if (lineErr) throw lineErr;

    const { error: attErr } = await table('invoice_attachment').delete().in('invoice_id', invoiceIds);
    if (attErr) throw attErr;

    const { error: paErr } = await table('payment_advice').delete().in('invoice_id', invoiceIds);
    if (paErr) throw paErr;

    const { error: addOnErr } = await table('add_on_invoice').delete().in('invoice_id', invoiceIds);
    if (addOnErr) throw addOnErr;

    const { error: invErr } = await table('invoice').delete().in('id', invoiceIds);
    if (invErr) throw invErr;
  }

  const { error: noteErr } = await table('credit_debit_note').delete().in('parent_invoice_id', invoiceIds);
  if (noteErr) throw noteErr;

  const { error: rateErr } = await table('po_rate_category').delete().in('po_id', cleanPoIds);
  if (rateErr) throw rateErr;

  const { error: contactErr } = await table('po_contact_log').delete().in('po_id', cleanPoIds);
  if (contactErr) throw contactErr;

  const { error: poErr } = await table('po_wo').delete().in('id', cleanPoIds);
  if (poErr) throw poErr;
}

/**
 * Delete invoice(s) from the billing schema (dependents first).
 * Skips the API call for non-UUID ids (legacy local-only rows that were never persisted).
 */
export async function deleteInvoicesById(ids) {
  const raw = Array.isArray(ids) ? ids : [ids];
  const invoiceIds = [...new Set(raw.map((id) => String(id ?? '').trim()).filter(isUuidString))];
  if (invoiceIds.length === 0) return;

  const { error: noteErr } = await table('credit_debit_note').delete().in('parent_invoice_id', invoiceIds);
  if (noteErr) throw noteErr;

  const { error: lineErr } = await table('invoice_line_item').delete().in('invoice_id', invoiceIds);
  if (lineErr) throw lineErr;

  const { error: attErr } = await table('invoice_attachment').delete().in('invoice_id', invoiceIds);
  if (attErr) throw attErr;

  const { error: paErr } = await table('payment_advice').delete().in('invoice_id', invoiceIds);
  if (paErr) throw paErr;

  const { error: addOnErr } = await table('add_on_invoice').delete().in('invoice_id', invoiceIds);
  if (addOnErr) throw addOnErr;

  const { error: invErr } = await table('invoice').delete().in('id', invoiceIds);
  if (invErr) throw invErr;
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
  let invId = isUuidString(inv.id) ? String(inv.id).trim() : undefined;
  const taxTrimmed = String(inv.taxInvoiceNumber ?? inv.tax_invoice_number ?? '').trim();

  /** Unique index on tax_invoice_number — resolve canonical row before upsert to avoid 409 duplicate key. */
  let existingIdForTax = null;
  if (taxTrimmed) {
    const { data: byTax, error: lookupTaxErr } = await table('invoice')
      .select('id')
      .eq('tax_invoice_number', taxTrimmed)
      .maybeSingle();
    if (lookupTaxErr) throw lookupTaxErr;
    if (byTax?.id) existingIdForTax = String(byTax.id);
  }

  if (existingIdForTax) {
    if (!invId) {
      invId = existingIdForTax;
    } else if (invId !== existingIdForTax) {
      const { data: rowForClientId, error: rowLookupErr } = await table('invoice')
        .select('id')
        .eq('id', invId)
        .maybeSingle();
      if (rowLookupErr) throw rowLookupErr;
      if (!rowForClientId) {
        invId = existingIdForTax;
      } else {
        const err = new Error(
          `Tax invoice number "${taxTrimmed}" is already used by another invoice. Change the number or edit that invoice.`
        );
        err.code = 'DUPLICATE_TAX_INVOICE_NUMBER';
        throw err;
      }
    }
  }

  let poIdFk = uuidOrNullForFk(inv.poId);
  // Backward-compat fallback: some legacy client rows may carry non-UUID poId.
  // Resolve FK by PO/WO number so invoices remain linked and survive refresh filters.
  if (!poIdFk) {
    const poWo = String(inv.poWoNumber ?? inv.po_wo_number ?? '').trim();
    if (poWo) {
      const { data: poRows, error: poLookupErr } = await table('po_wo')
        .select('id')
        .eq('po_wo_number', poWo)
        .order('created_at', { ascending: false })
        .limit(1);
      if (poLookupErr) throw poLookupErr;
      if (Array.isArray(poRows) && poRows[0]?.id) {
        poIdFk = String(poRows[0].id);
      }
    }
  }
  const taxInvoiceNumber = taxInvoiceNumberForPayload(inv, invId);
  const gstSupply = normalizeGstSupplyType(inv.gstSupplyType ?? inv.gst_supply_type);
  const payload = stripUndefined({
    ...(invId ? { id: invId } : {}),
    po_id: poIdFk,
    site_id: siteIdForPayload(inv.siteId),
    tax_invoice_number: taxInvoiceNumber,
    invoice_date: requireInvoiceDate(inv.invoiceDate ?? inv.invoice_date),
    client_legal_name: inv.clientLegalName ?? null,
    client_address: inv.clientAddress ?? null,
    gstin: inv.gstin ?? null,
    oc_number: inv.ocNumber ?? null,
    po_wo_number: inv.poWoNumber ?? null,
    billing_type: inv.billingType ?? null,
    hsn_sac: inv.hsnSac ?? null,
    taxable_value: inv.taxableValue ?? 0,
    cgst_rate: inv.cgstRate ?? 9,
    sgst_rate: inv.sgstRate ?? 9,
    cgst_amt: inv.cgstAmt ?? 0,
    sgst_amt: inv.sgstAmt ?? 0,
    calculated_invoice_amount: inv.calculatedInvoiceAmount ?? 0,
    total_amount: inv.totalAmount ?? 0,
    pa_status: inv.paStatus ?? 'Pending',
    payment_status: !!inv.paymentStatus,
    pending_amount: inv.pendingAmount != null ? Number(inv.pendingAmount) : null,
    payment_terms: inv.paymentTerms ?? null,
    e_invoice_irn: inv.e_invoice_irn ?? null,
    e_invoice_ack_no: inv.e_invoice_ack_no ?? null,
    e_invoice_ack_dt: inv.e_invoice_ack_dt ?? null,
    e_invoice_signed_qr: inv.e_invoice_signed_qr ?? null,
    less_more_billing: inv.lessMoreBilling != null ? Number(inv.lessMoreBilling) : null,
    bill_number: inv.billNumber || null,
    billing_month: inv.billingMonth || null,
    seller_cin: inv.sellerCin || null,
    seller_pan: inv.sellerPan || null,
    msme_registration_no: inv.msmeRegistrationNo || null,
    msme_clause: inv.msmeClause || null,
    billing_duration_from: normalizePgDateOnly(inv.billingDurationFrom ?? inv.billing_duration_from),
    billing_duration_to: normalizePgDateOnly(inv.billingDurationTo ?? inv.billing_duration_to),
    invoice_header_remarks: inv.invoiceHeaderRemarks || null,
    terms_template_key: inv.termsTemplateKey || null,
    terms_custom_text: inv.termsCustomText || inv.termsText || null,
    client_shipping_address: inv.clientShippingAddress || null,
    place_of_supply: inv.placeOfSupply || null,
    buyer_pin: textColumnOrNull(inv.buyerPin ?? inv.buyer_pin ?? inv.clientPincode ?? inv.client_pincode),
    buyer_pincode: textColumnOrNull(inv.buyerPincode ?? inv.buyer_pincode ?? inv.clientPincode ?? inv.client_pincode),
    buyer_state_code: textColumnOrNull(inv.buyerStateCode ?? inv.buyer_state_code),
    invoice_kind: normalizeInvoiceKindDb(inv.invoiceKind ?? inv.invoice_kind),
    is_add_on: !!inv.isAddOn,
    add_on_type: inv.addOnType || (inv.isAddOn ? 'Other' : null),
    is_post_contract_buffer: !!inv.isPostContractBuffer,
    cn_dn_request_status: normalizeCnDnStatusDb(inv.cnDnRequestStatus ?? inv.cn_dn_request_status),
    cn_dn_request_note_type: normalizeCnDnNoteTypeDb(inv.cnDnRequestNoteType ?? inv.cn_dn_request_note_type),
    cn_dn_request_reason: inv.cnDnRequestReason ?? inv.cn_dn_request_reason ?? null,
    cn_dn_requested_at: normalizeTimestamptzOrNull(inv.cnDnRequestedAt ?? inv.cn_dn_requested_at),
    cn_dn_approved_at: normalizeTimestamptzOrNull(inv.cnDnApprovedAt ?? inv.cn_dn_approved_at),
    gst_supply_type: gstSupply,
    igst_rate: Number(inv.igstRate) || 0,
    igst_amt: Number(inv.igstAmt) || 0,
    digital_signature_data_url: inv.digitalSignatureDataUrl || null,
  });

  /** New row: insert without id. Existing row: upsert with id in body (onConflict=id). Avoid PATCH/update — RLS/PostgREST often returns errors on PATCH for billing.invoice. */
  const persistInvoiceRow = async (p) => {
    if (!invId) {
      return table('invoice').insert(p).select('id').single();
    }
    if (!p.id || String(p.id) !== String(invId)) {
      return {
        data: null,
        error: Object.assign(new Error('Invoice save: id mismatch'), { code: 'INVOICE_ID_MISMATCH' }),
      };
    }
    return table('invoice').upsert(p, { onConflict: 'id' }).select('id').single();
  };

  let saved;
  let invError;
  ({ data: saved, error: invError } = await persistInvoiceRow(payload));
  if (invError && isBuyerInvoiceColumnsMissingError(invError)) {
    ({ data: saved, error: invError } = await persistInvoiceRow(stripOptionalBuyerInvoiceColumns(payload)));
  }
  if (invError) throw invError;
  const invoiceId = saved?.id ?? invId ?? inv.id;

  await table('invoice_line_item').delete().eq('invoice_id', invoiceId);
  const lineRows = (inv.items || []).map((it, i) => ({
    invoice_id: invoiceId,
    line_order: i,
    description: String(it.description ?? it.designation ?? '').trim() || '—',
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
      po_id: poIdFk,
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
    const idOk = isUuidString(n.id);
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
