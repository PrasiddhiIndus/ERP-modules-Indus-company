/**
 * Quotation Maker — persist / load / duplicate against projects schema.
 */

import {
  buildOfferNo,
  deriveClientCode,
  fiscalYearFromDate,
  nextJobNumber,
  projectsTable,
} from '../../../../services/quotationApi';
import { normalizeToIsoDate } from '../../../../utils/dateDisplay';
import {
  computeTotals,
  emptyMakerForm,
  makerStatusToOfferStatus,
  normalizeType,
  rewriteSortOrders,
  STANDARD_TERMS,
} from './quotationMakerModel';

function mapRowFromDb(r) {
  return {
    id: r.id,
    parent_row_id: r.parent_row_id || null,
    row_type: r.row_type,
    sort_order: r.sort_order ?? 0,
    description: r.description || '',
    unit: r.unit || '',
    qty: Number(r.qty) || 0,
    rate: Number(r.rate) || 0,
    supply_rate: Number(r.supply_rate) || 0,
    install_rate: Number(r.install_rate) || 0,
    make: r.make || '',
    remarks: r.remarks || '',
  };
}

function parseMakerOptions(raw) {
  let opts = raw;
  if (typeof opts === 'string') {
    try {
      opts = JSON.parse(opts);
    } catch {
      opts = {};
    }
  }
  if (!opts || typeof opts !== 'object') opts = {};
  return {
    show_make: Boolean(opts.show_make),
    show_remarks: Boolean(opts.show_remarks),
    make_column_before: opts.make_column_before || 'unit',
  };
}

export function formFromDb(row) {
  if (!row) return emptyMakerForm();
  const type = normalizeType(row.quotation_type || 'normal');
  let terms = row.terms;
  if (typeof terms === 'string') {
    try {
      terms = JSON.parse(terms);
    } catch {
      terms = null;
    }
  }
  if (!Array.isArray(terms) || !terms.length) {
    terms = row.terms_text
      ? String(row.terms_text)
          .split(/\n+/)
          .map((s) => s.replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean)
      : [...STANDARD_TERMS[type]];
  }
  return {
    id: row.id,
    quotation_no: row.offer_no || row.quotation_no || '',
    quotation_type: type,
    client_id: row.client_id || null,
    client_contact: row.contact_person || row.client_contact || '',
    client_company: row.client_name || row.client_company || '',
    client_address: row.client_address || row.location || '',
    subject: row.subject || '',
    quote_date: normalizeToIsoDate(row.offer_date || row.quote_date) || new Date().toISOString().slice(0, 10),
    signatory_name: row.signatory_name || row.prepared_by_name || '',
    signatory_designation: row.signatory_designation || row.prepared_by_designation || 'Asst. Manager - Projects',
    terms,
    maker_status: row.maker_status || 'draft',
    version: Number(row.version) || 1,
    branch_code: row.branch_code || 'SRE',
    created_by: row.created_by || null,
    ...parseMakerOptions(row.maker_options),
  };
}

export async function reserveQuotationNo({ branchCode = 'SRE', clientCompany, offerDateIso } = {}) {
  const clientCode = deriveClientCode(clientCompany || 'CLT');
  const seq = await nextJobNumber(branchCode, offerDateIso);
  const offerNo = buildOfferNo({
    branchCode,
    clientCode,
    monthTag: seq.monthTag,
    jobNo: seq.jobNo,
    sequenceTag: seq.sequenceTag,
    typeCode: 'SITC',
    fiscalYear: seq.fiscalYear || fiscalYearFromDate(offerDateIso),
    revisionNo: 0,
  });
  return { offerNo, jobNo: seq.jobNo, clientCode, fiscalYear: seq.fiscalYear, sequenceTag: seq.sequenceTag };
}

function headerPayload(form, totals, { userId } = {}) {
  const type = normalizeType(form.quotation_type);
  const status = form.maker_status || 'draft';
  return {
    offer_no: String(form.quotation_no || '').trim() || null,
    offer_date: normalizeToIsoDate(form.quote_date) || null,
    client_name: String(form.client_company || '').trim() || null,
    contact_person: String(form.client_contact || '').trim() || null,
    location: String(form.client_address || '').trim() || null,
    client_address: String(form.client_address || '').trim() || null,
    subject: String(form.subject || '').trim() || null,
    scope: String(form.subject || '').trim() || null,
    quotation_type: type,
    client_id: form.client_id || null,
    signatory_name: String(form.signatory_name || '').trim() || null,
    signatory_designation: String(form.signatory_designation || '').trim() || null,
    prepared_by_name: String(form.signatory_name || '').trim() || null,
    prepared_by_designation: String(form.signatory_designation || '').trim() || null,
    terms: Array.isArray(form.terms)
      ? form.terms.map((t) => String(t || '').trim()).filter(Boolean)
      : [],
    terms_text: Array.isArray(form.terms)
      ? form.terms
          .map((t) => String(t || '').trim())
          .filter(Boolean)
          .map((t, i) => `${i + 1}. ${t}`)
          .join('\n')
      : null,
    maker_status: status,
    offer_status: makerStatusToOfferStatus(status),
    grand_total: totals.grand_total,
    supply_total: totals.supply_total,
    install_total: totals.install_total,
    quoted_rate: totals.grand_total,
    version: Number(form.version) || 1,
    branch_code: form.branch_code || 'SRE',
    maker_options: {
      show_make: Boolean(form.show_make),
      show_remarks: Boolean(form.show_remarks),
      make_column_before: form.make_column_before || 'unit',
    },
    updated_at: new Date().toISOString(),
    ...(userId && !form.id ? { created_by: userId } : {}),
  };
}

export async function fetchMakerQuotation(id) {
  const { data, error } = await projectsTable('quotations').select('*').eq('id', id).single();
  if (error) throw error;
  const { data: rowData, error: rErr } = await projectsTable('quotation_rows')
    .select('*')
    .eq('quotation_id', id)
    .order('sort_order', { ascending: true });
  if (rErr) throw rErr;
  return { form: formFromDb(data), rows: (rowData || []).map(mapRowFromDb) };
}

export async function fetchMakerList() {
  const { data, error } = await projectsTable('quotations')
    .select(
      'id, offer_no, offer_date, client_name, client_address, quotation_type, maker_status, offer_status, grand_total, quoted_rate, created_by, created_at, updated_at, version'
    )
    .not('quotation_type', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) {
    // Fallback if quotation_type column missing / filter unsupported
    const { data: all, error: e2 } = await projectsTable('quotations')
      .select('*')
      .order('offer_date', { ascending: false });
    if (e2) throw e2;
    return (all || []).filter((r) => r.quotation_type);
  }
  return data || [];
}

async function replaceRows(quotationId, rows) {
  const { error: delErr } = await projectsTable('quotation_rows').delete().eq('quotation_id', quotationId);
  if (delErr) throw delErr;
  const ordered = rewriteSortOrders(rows);
  if (!ordered.length) return [];
  // Map temp ids → real uuids so parent_row_id stays valid
  const mintId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
          const n = (Math.random() * 16) | 0;
          return (c === 'x' ? n : (n & 0x3) | 0x8).toString(16);
        });
  const idMap = new Map();
  const payload = ordered.map((r) => {
    const isTemp = String(r.id).startsWith('tmp-');
    const newId = isTemp ? mintId() : r.id;
    idMap.set(r.id, newId);
    return { ...r, _newId: newId };
  });
  const inserts = payload.map((r) => ({
    id: r._newId,
    quotation_id: quotationId,
    parent_row_id: r.parent_row_id ? idMap.get(r.parent_row_id) || r.parent_row_id : null,
    row_type: r.row_type,
    sort_order: r.sort_order,
    description: r.description || null,
    unit: r.unit || null,
    qty: Number(r.qty) || 0,
    rate: Number(r.rate) || 0,
    supply_rate: Number(r.supply_rate) || 0,
    install_rate: Number(r.install_rate) || 0,
    make: r.make || null,
    remarks: r.remarks || null,
  }));
  const { data, error } = await projectsTable('quotation_rows').insert(inserts).select('*');
  if (error) throw error;
  return (data || []).map(mapRowFromDb);
}

export async function logMakerAudit({ quotationId, action, detail, actorId, actorName }) {
  try {
    await projectsTable('quotation_maker_audit').insert({
      quotation_id: quotationId || null,
      action,
      detail: detail || null,
      actor_id: actorId || null,
      actor_name: actorName || null,
    });
  } catch {
    /* audit must never block save */
  }
}

export async function saveMakerQuotation(form, rows, { userId, actorName, action = 'edit' } = {}) {
  const type = normalizeType(form.quotation_type);
  let working = { ...form, quotation_type: type };
  if (!working.quotation_no?.trim()) {
    const reserved = await reserveQuotationNo({
      branchCode: working.branch_code,
      clientCompany: working.client_company,
      offerDateIso: working.quote_date,
    });
    working.quotation_no = reserved.offerNo;
  }

  const totals = computeTotals(rows, type);
  const payload = headerPayload(working, totals, { userId });

  let saved;
  if (working.id) {
    payload.version = (Number(working.version) || 1) + 1;
    const { data, error } = await projectsTable('quotations')
      .update(payload)
      .eq('id', working.id)
      .select('*')
      .single();
    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await projectsTable('quotations').insert(payload).select('*').single();
    if (error) throw error;
    saved = data;
  }

  const savedRows = await replaceRows(saved.id, rows);
  await logMakerAudit({
    quotationId: saved.id,
    action,
    detail: { quotation_no: saved.offer_no, maker_status: saved.maker_status, totals },
    actorId: userId,
    actorName,
  });

  return { form: formFromDb(saved), rows: savedRows };
}

export async function duplicateMakerQuotation(sourceId, { userId, actorName } = {}) {
  const { form, rows } = await fetchMakerQuotation(sourceId);
  const reserved = await reserveQuotationNo({
    branchCode: form.branch_code,
    clientCompany: form.client_company,
    offerDateIso: form.quote_date,
  });
  const copyForm = {
    ...form,
    id: null,
    quotation_no: reserved.offerNo,
    maker_status: 'draft',
    version: 1,
  };
  // Remint all ids so parent links stay consistent and we never collide with source rows
  const idMap = new Map();
  for (const r of rows) {
    idMap.set(
      r.id,
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `tmp-${crypto.randomUUID()}`
        : `tmp-${Math.random().toString(36).slice(2)}`
    );
  }
  const copyRows = rows.map((r) => ({
    ...r,
    id: idMap.get(r.id),
    parent_row_id: r.parent_row_id ? idMap.get(r.parent_row_id) || null : null,
  }));
  return saveMakerQuotation(copyForm, copyRows, { userId, actorName, action: 'duplicate' });
}

export async function updateMakerStatus(id, makerStatus, { userId, actorName } = {}) {
  const { data, error } = await projectsTable('quotations')
    .update({
      maker_status: makerStatus,
      offer_status: makerStatusToOfferStatus(makerStatus),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  await logMakerAudit({
    quotationId: id,
    action: 'status_change',
    detail: { maker_status: makerStatus },
    actorId: userId,
    actorName,
  });
  return formFromDb(data);
}
