/**
 * Projects Quotation Master — helpers for `projects` schema tables.
 */

import { projectsTable } from './projectsApi';
import { normalizeToIsoDate } from '../utils/dateDisplay';

export { projectsTable };

/** India FY label from a date (Apr–Mar), e.g. 2026-07-29 → "26-27". */
export function fiscalYearFromDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return fiscalYearFromDate(new Date());
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  const a = String(start).slice(-2);
  const b = String(start + 1).slice(-2);
  return `${a}-${b}`;
}

export function deriveClientCode(clientName, fallback = 'CLT') {
  const raw = String(clientName || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!raw.length) return fallback;
  if (raw.length === 1) return raw[0].slice(0, 4) || fallback;
  return raw
    .map((w) => w[0])
    .join('')
    .slice(0, 4);
}

export function revisionLabel(revisionNo = 0) {
  const n = Math.max(0, Number(revisionNo) || 0);
  return `REV${String(n).padStart(2, '0')}`;
}

/**
 * Next Job/File No per branch + FY (Offer Format). Uses month_num = 0 as FY key.
 */
export async function nextJobNumber(branchCode, offerDateIso) {
  const iso = normalizeToIsoDate(offerDateIso) || new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  const fy = fiscalYearFromDate(d);
  const monthNum = d.getMonth() + 1;
  const branch = String(branchCode || 'SRE').trim().toUpperCase();

  const { data: existing, error: readErr } = await projectsTable('quotation_sequences')
    .select('id, last_seq')
    .eq('branch_code', branch)
    .eq('fiscal_year', fy)
    .eq('month_num', 0)
    .maybeSingle();
  if (readErr) throw readErr;

  let nextSeq;
  if (existing?.id) {
    nextSeq = (existing.last_seq || 0) + 1;
    const { error: upErr } = await projectsTable('quotation_sequences')
      .update({ last_seq: nextSeq })
      .eq('id', existing.id);
    if (upErr) throw upErr;
  } else {
    nextSeq = 1;
    const { error: insErr } = await projectsTable('quotation_sequences').insert({
      branch_code: branch,
      fiscal_year: fy,
      month_num: 0,
      last_seq: nextSeq,
    });
    if (insErr) throw insErr;
  }

  return {
    jobNo: nextSeq,
    fiscalYear: fy,
    monthNum,
    monthTag: String(monthNum).padStart(2, '0'),
    sequenceTag: `${String(monthNum).padStart(2, '0')}-${nextSeq}`,
  };
}

/** @deprecated alias — prefer nextJobNumber */
export async function nextOfferSequence(branchCode, offerDateIso) {
  return nextJobNumber(branchCode, offerDateIso);
}

/**
 * Offer No: IFSPL/P/{Branch}/{Client}/{MM}-{JobNo}[/{TypeCode}]/{FY}/{REVnn}
 * Type code optional (dropped in some legacy records).
 */
export function buildOfferNo({
  branchCode,
  clientCode,
  monthTag,
  jobNo,
  sequenceTag,
  typeCode,
  fiscalYear,
  revisionNo = 0,
}) {
  const mmJob =
    sequenceTag ||
    `${String(monthTag || '').padStart(2, '0') || '01'}-${jobNo || 1}`;
  const parts = [
    'IFSPL/P',
    String(branchCode || 'SRE').toUpperCase(),
    String(clientCode || 'CLT').toUpperCase(),
    mmJob,
  ];
  const tc = String(typeCode || '').trim().toUpperCase();
  if (tc) parts.push(tc);
  parts.push(fiscalYear || fiscalYearFromDate());
  parts.push(revisionLabel(revisionNo));
  return parts.join('/');
}

/** Internal filename: O_P_{JobNo}_{ClientCode}_{TypeCode}_{FY}_{REVnn} */
export function buildFilename({ jobNo, clientCode, typeCode, fiscalYear, revisionNo = 0 }) {
  const bits = ['O_P', jobNo || 1, String(clientCode || 'CLT').toUpperCase()];
  const tc = String(typeCode || '').trim().toUpperCase();
  if (tc) bits.push(tc);
  bits.push(fiscalYear || fiscalYearFromDate());
  bits.push(revisionLabel(revisionNo));
  return bits.join('_');
}

export function addDaysIso(isoDate, days) {
  const iso = normalizeToIsoDate(isoDate) || new Date().toISOString().slice(0, 10);
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso = new Date().toISOString().slice(0, 10)) {
  const a = normalizeToIsoDate(fromIso);
  const b = normalizeToIsoDate(toIso);
  if (!a || !b) return null;
  const ms = new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00');
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function isFollowupOverdue(row, todayIso = new Date().toISOString().slice(0, 10)) {
  if (!row?.next_followup_date) return false;
  if (isTerminalConvertedOrLost(row.offer_status) || row.superseded) return false;
  if (!isOpenStatus(row.offer_status)) return false;
  const next = normalizeToIsoDate(row.next_followup_date);
  return next && next < todayIso;
}

export const TERMINAL_CONVERTED = new Set([
  'Order Converted',
  'Order Converted on Revised Value',
]);

export const TERMINAL_LOST = new Set(['Order Lost']);

export const OPEN_STATUSES = new Set([
  'Draft',
  'Awaiting Client Response',
  'Revised Offer Sent',
  'Client Has Hold Enquiry',
]);

export function isTerminalConvertedOrLost(status) {
  return TERMINAL_CONVERTED.has(status) || TERMINAL_LOST.has(status);
}

export function isOpenStatus(status) {
  return OPEN_STATUSES.has(status);
}

export const STATUS_TRANSITIONS = {
  Draft: ['Awaiting Client Response', 'Order Lost'],
  'Awaiting Client Response': [
    'Revised Offer Sent',
    'Client Has Hold Enquiry',
    'Order Lost',
    'Order Converted',
    'Order Converted on Revised Value',
  ],
  'Revised Offer Sent': [
    'Awaiting Client Response',
    'Client Has Hold Enquiry',
    'Order Lost',
    'Order Converted',
    'Order Converted on Revised Value',
  ],
  'Client Has Hold Enquiry': [
    'Awaiting Client Response',
    'Revised Offer Sent',
    'Order Lost',
    'Order Converted',
    'Order Converted on Revised Value',
  ],
  'Order Lost': [],
  'Order Converted': [],
  'Order Converted on Revised Value': [],
  Superseded: [],
};

export function canTransitionStatus(from, to) {
  if (from === to) return true;
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function emptyQuotationForm(defaults = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    offer_no: '',
    offer_date: today,
    client_name: '',
    location: '',
    contact_person: '',
    contact_no: '',
    email_id: '',
    quoted_rate: '',
    offer_status: 'Draft',
    offer_type: defaults.offer_type || 'FFTG',
    offer_link: '',
    scope: '',
    subject: '',
    type_code: defaults.type_code || 'SITC',
    job_no: null,
    filename: '',
    revision_label: revisionLabel(0),
    validity_days: 10,
    delivery_period: 'as mutually agreed',
    terms_text: '',
    cover_letter_text: '',
    prepared_by_name: defaults.prepared_by_name || defaults.owner_name || '',
    prepared_by_designation: defaults.prepared_by_designation || '',
    last_followup_date: '',
    enquiry_received_from: '',
    remark: '',
    revision_no: 0,
    parent_offer_id: null,
    linked_project_id: null,
    linked_project_name: '',
    owner_name: defaults.owner_name || '',
    next_followup_date: addDaysIso(today, 7),
    branch_code: defaults.branch_code || 'SRE',
    client_code: '',
    sequence_tag: '',
    fiscal_year: fiscalYearFromDate(today),
    superseded: false,
    basic_total: 0,
    accessories_total: 0,
    transport_total: 0,
    inflation_total: 0,
    margin_total: 0,
  };
}

export function normalizeQuotationPayload(form) {
  const num = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    offer_no: String(form.offer_no || '').trim(),
    offer_date: normalizeToIsoDate(form.offer_date) || null,
    client_name: String(form.client_name || '').trim() || null,
    location: String(form.location || '').trim() || null,
    contact_person: String(form.contact_person || '').trim() || null,
    contact_no: String(form.contact_no || '').trim() || null,
    email_id: String(form.email_id || '').trim() || null,
    quoted_rate: num(form.quoted_rate),
    offer_status: form.offer_status || 'Draft',
    offer_type: String(form.offer_type || '').trim() || null,
    offer_link: String(form.offer_link || '').trim() || null,
    scope: String(form.scope || form.subject || '').trim() || null,
    subject: String(form.subject || form.scope || '').trim() || null,
    type_code: String(form.type_code || '').trim().toUpperCase() || null,
    job_no: num(form.job_no),
    filename: String(form.filename || '').trim() || null,
    revision_label: String(form.revision_label || revisionLabel(form.revision_no)).trim() || null,
    validity_days: num(form.validity_days) ?? 10,
    delivery_period: String(form.delivery_period || '').trim() || null,
    terms_text: String(form.terms_text || '').trim() || null,
    cover_letter_text: String(form.cover_letter_text || '').trim() || null,
    prepared_by_name: String(form.prepared_by_name || '').trim() || null,
    prepared_by_designation: String(form.prepared_by_designation || '').trim() || null,
    last_followup_date: normalizeToIsoDate(form.last_followup_date) || null,
    enquiry_received_from: String(form.enquiry_received_from || '').trim() || null,
    remark: String(form.remark || '').trim() || null,
    revision_no: Number(form.revision_no) || 0,
    parent_offer_id: form.parent_offer_id || null,
    linked_project_id: form.linked_project_id || null,
    linked_project_name: String(form.linked_project_name || '').trim() || null,
    owner_name: String(form.owner_name || '').trim() || null,
    next_followup_date: normalizeToIsoDate(form.next_followup_date) || null,
    branch_code: String(form.branch_code || '').trim().toUpperCase() || null,
    client_code: String(form.client_code || '').trim().toUpperCase() || null,
    sequence_tag: String(form.sequence_tag || '').trim() || null,
    fiscal_year: String(form.fiscal_year || '').trim() || null,
    superseded: Boolean(form.superseded),
    basic_total: num(form.basic_total),
    accessories_total: num(form.accessories_total),
    transport_total: num(form.transport_total),
    inflation_total: num(form.inflation_total),
    margin_total: num(form.margin_total),
  };
}

export async function fetchQuotations(select = '*') {
  const { data, error } = await projectsTable('quotations')
    .select(select)
    .order('next_followup_date', { ascending: true, nullsFirst: false })
    .order('offer_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchQuotationById(id) {
  const { data, error } = await projectsTable('quotations').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchLineItems(quotationId) {
  const { data, error } = await projectsTable('quotation_line_items')
    .select('*')
    .eq('quotation_id', quotationId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function replaceLineItems(quotationId, lines) {
  const { error: delErr } = await projectsTable('quotation_line_items').delete().eq('quotation_id', quotationId);
  if (delErr) throw delErr;
  if (!lines?.length) return [];
  const rows = lines.map((l, i) => ({
    quotation_id: quotationId,
    sort_order: i,
    row_type: l.row_type || 'line',
    section_no: l.section_no ?? null,
    sub_letter: l.row_type === 'section' ? null : l.sub_letter || null,
    section_label: l.section_label || null,
    description: l.description || null,
    hsn_sac: l.hsn_sac || null,
    qty: Number(l.qty) || 0,
    unit: l.unit || null,
    basic_unit_rate: Number(l.basic_unit_rate) || 0,
    accessories_pct: Number(l.accessories_pct) || 0,
    transport_pct: Number(l.transport_pct) || 0,
    inflation_pct: Number(l.inflation_pct) || 0,
    margin_pct: Number(l.margin_pct) || 0,
    unit_rate: Number(l.unit_rate) || 0,
    line_amount: Number(l.line_amount) || 0,
    accessories_amount: Number(l.accessories_amount) || 0,
    transport_amount: Number(l.transport_amount) || 0,
    inflation_amount: Number(l.inflation_amount) || 0,
    margin_amount: Number(l.margin_amount) || 0,
    basic_total: Number(l.basic_total) || 0,
    remarks: l.remarks || null,
    make: l.make || null,
  }));
  const { data, error } = await projectsTable('quotation_line_items').insert(rows).select('*');
  if (error) throw error;
  return data || [];
}

export async function fetchRevisionChain(quotation) {
  if (!quotation) return [];
  const rootId = quotation.parent_offer_id || quotation.id;
  const { data, error } = await projectsTable('quotations')
    .select('*')
    .or(`id.eq.${rootId},parent_offer_id.eq.${rootId}`)
    .order('revision_no', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchFollowups(quotationId) {
  const { data, error } = await projectsTable('quotation_followups')
    .select('*')
    .eq('quotation_id', quotationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAttachments(quotationId) {
  const { data, error } = await projectsTable('quotation_attachments')
    .select('*')
    .eq('quotation_id', quotationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Clone quotation + line items as next REV (REV00 → REV01…). Supersedes the source row.
 */
export async function createQuotationRevision(source, { userId } = {}) {
  const newRev = (source.revision_no || 0) + 1;
  const rootId = source.parent_offer_id || source.id;
  const revTag = revisionLabel(newRev);
  const baseNo = String(source.offer_no || '')
    .replace(/\/REV\d+$/i, '')
    .replace(/\/REV-\d+$/i, '');
  const newOfferNo = `${baseNo}/${revTag}`;
  const filename = buildFilename({
    jobNo: source.job_no,
    clientCode: source.client_code,
    typeCode: source.type_code,
    fiscalYear: source.fiscal_year,
    revisionNo: newRev,
  });

  const { data: inserted, error: insErr } = await projectsTable('quotations')
    .insert({
      ...normalizeQuotationPayload({
        ...source,
        offer_no: newOfferNo,
        filename,
        revision_label: revTag,
        offer_status: 'Revised Offer Sent',
        revision_no: newRev,
        parent_offer_id: rootId,
        superseded: false,
        linked_project_id: null,
        linked_project_name: null,
        last_followup_date: new Date().toISOString().slice(0, 10),
        next_followup_date: addDaysIso(new Date().toISOString().slice(0, 10), 7),
        offer_date: new Date().toISOString().slice(0, 10),
      }),
      created_by: userId || null,
      status_changed_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (insErr) throw insErr;

  const lines = await fetchLineItems(source.id);
  if (lines.length) {
    await replaceLineItems(
      inserted.id,
      lines.map((l) => ({ ...l, id: undefined }))
    );
  }

  const { error: upErr } = await projectsTable('quotations')
    .update({
      offer_status: 'Superseded',
      superseded: true,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', source.id);
  if (upErr) throw upErr;

  return inserted;
}

export async function fetchQuotationSettings() {
  const { data, error } = await projectsTable('quotation_settings').select('*');
  if (error) throw error;
  const map = {};
  for (const row of data || []) map[row.setting_key] = row.setting_value;
  return {
    advancedPricing: Boolean(map.advanced_pricing?.enabled),
    raw: map,
  };
}

export async function setAdvancedPricingEnabled(enabled) {
  const { error } = await projectsTable('quotation_settings').upsert(
    { setting_key: 'advanced_pricing', setting_value: { enabled: Boolean(enabled) }, updated_at: new Date().toISOString() },
    { onConflict: 'setting_key' }
  );
  if (error) throw error;
}

export async function fetchQuotationTemplates() {
  const { data, error } = await projectsTable('quotation_templates')
    .select('*')
    .order('offer_type', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchTemplateForOfferType(offerType) {
  if (!offerType) return null;
  const { data, error } = await projectsTable('quotation_templates')
    .select('*')
    .eq('offer_type', offerType)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function applyTermsPlaceholders(termsText, { validityDays, deliveryPeriod }) {
  return String(termsText || '')
    .replace(/\{\{validityDays\}\}/g, String(validityDays ?? 10))
    .replace(/\{\{deliveryPeriod\}\}/g, String(deliveryPeriod || 'as mutually agreed'));
}
