import * as XLSX from 'xlsx';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import { normalizeQuotationPayload } from '../../../services/quotationApi';

/**
 * Import columns — same headers and order as the "Offer Database" sheet
 * (Sarath Business Analytics B9.xlsm). Quarter is calculated in the ERP and is ignored on import.
 */
export const IMPORT_COLUMNS = [
  { key: 'offer_no', label: 'Offer No', type: 'text', hint: 'e.g. IFSPL/P/SRE/ABC/11-322/26-27' },
  { key: 'offer_date', label: 'Date', type: 'date', hint: 'Excel date, DD-MM-YYYY or DD.MM.YYYY' },
  { key: 'client_name', label: 'Client Name', required: true, type: 'text', hint: 'Required' },
  { key: 'location', label: 'Location', type: 'text' },
  { key: 'contact_person', label: 'Contact Person', type: 'text' },
  { key: 'contact_no', label: 'Contact No', type: 'text' },
  { key: 'email_id', label: 'E-mail ID', type: 'text' },
  { key: 'quoted_rate', label: 'Quoted Rate', type: 'number', hint: 'Numbers only' },
  { key: 'offer_status', label: 'Offer Status', type: 'text', hint: 'See Notes sheet' },
  { key: 'offer_type', label: 'Offer Type', type: 'text', hint: 'FFTG | FDS | DBM | AUD' },
  { key: 'offer_link', label: 'Offer Link', type: 'link', hint: 'URL or a hyperlinked cell' },
  { key: 'scope', label: 'Scope', type: 'text' },
  { key: 'last_followup_date', label: 'Last Followup Date', type: 'date' },
  { key: 'enquiry_received_from', label: 'Enquiry Received From', type: 'text' },
  { key: 'remark', label: 'Remark', type: 'text' },
  { key: 'order_converted_date', label: 'Order Coverted Date', type: 'date' },
  { key: 'quarter', label: 'Quarter', type: 'computed', hint: 'Calculated in ERP — ignored on import' },
];

const SAMPLE_ROW = {
  'Offer No': 'IFSPL/P/SRE/ABC/11-322/26-27',
  Date: '13-11-2026',
  'Client Name': 'ABC Industries Ltd',
  Location: 'Dahej',
  'Contact Person': 'Mr. Ramesh Shah',
  'Contact No': '9876543210',
  'E-mail ID': 'ramesh@abcind.com',
  'Quoted Rate': 2091336,
  'Offer Status': "Awaiting for client's response",
  'Offer Type': 'FFTG',
  'Offer Link': 'https://example.com/offer.pdf',
  Scope: 'Supply, installation, testing and commissioning of fire fighting system',
  'Last Followup Date': '20-11-2026',
  'Enquiry Received From': 'Mr. Direct Client (Project Dept)',
  Remark: 'Initial enquiry received via phone',
  'Order Coverted Date': '',
  Quarter: '',
};

const IMPORT_NOTES = [
  ['Notes for import'],
  [''],
  ['1. You can import the Offer Database workbook as it is — the header row ("Offer No", "Client Name", …) is found automatically,'],
  ['   even when summary tables sit above it. Every sheet that has this header row is imported (e.g. "Offer Database" and "25-26").'],
  ['2. Client Name is required — rows without it are skipped.'],
  ['3. Dates: Excel dates, DD-MM-YYYY, DD/MM/YYYY or DD.MM.YYYY.'],
  ['4. Offer Status (either spelling works):'],
  ["   Order Converted  ·  Order lost  ·  Awaiting for client's response  ·  Client has hold inquiry  ·  Budgetary offer"],
  ['   Draft  ·  Revised Offer Sent  ·  Order Converted on Revised Value'],
  ['5. Offer Type: FFTG, FDS, DBM, AUD'],
  ['6. Offer Link: a URL, or a cell hyperlinked to the offer (e.g. "View Offer").'],
  ['7. Order Coverted Date is saved for converted offers only. Quarter is calculated by the ERP and ignored on import.'],
  ['8. Quoted Rate: numbers only (₹ and commas are removed).'],
  ['9. Max 500 rows per import file.'],
];

/** Sheet status wording → ERP offer status. */
const STATUS_MAP = {
  'order converted': 'Order Converted',
  'order coverted': 'Order Converted',
  'order converted on revised value': 'Order Converted on Revised Value',
  'order lost': 'Order Lost',
  'awaiting for client response': 'Awaiting Client Response',
  "awaiting for client's response": 'Awaiting Client Response',
  'awaiting client response': 'Awaiting Client Response',
  'client has hold inquiry': 'Client Has Hold Enquiry',
  'client has hold enquiry': 'Client Has Hold Enquiry',
  'budgetary offer': 'Budgetary Offer',
  'revised offer sent': 'Revised Offer Sent',
  draft: 'Draft',
};

export function normalizeOfferStatus(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ');
  if (!s) return '';
  return STATUS_MAP[s] || String(value).trim();
}

function parseDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(value).trim();
  // 24.08.2026 → 24-08-2026
  const dotted = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return normalizeToIsoDate(dotted ? `${dotted[1]}-${dotted[2]}-${dotted[3]}` : s) || null;
}

function normalizeHeaderKey(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const HEADER_MAP = (() => {
  const map = {
    date: 'offer_date',
    'offer date': 'offer_date',
    client: 'client_name',
    company: 'client_name',
    'company name': 'client_name',
    contact: 'contact_person',
    phone: 'contact_no',
    mobile: 'contact_no',
    'contact number': 'contact_no',
    email: 'email_id',
    'e-mail': 'email_id',
    'email id': 'email_id',
    'e-mail id': 'email_id',
    amount: 'quoted_rate',
    rate: 'quoted_rate',
    value: 'quoted_rate',
    status: 'offer_status',
    type: 'offer_type',
    link: 'offer_link',
    subject: 'subject',
    owner: 'owner_name',
    'owner name': 'owner_name',
    'branch code': 'branch_code',
    branch: 'branch_code',
    source: 'enquiry_received_from',
    'enquiry source': 'enquiry_received_from',
    'enquiry from': 'enquiry_received_from',
    'last followup': 'last_followup_date',
    'last follow up date': 'last_followup_date',
    'next followup date': 'next_followup_date',
    'next follow up date': 'next_followup_date',
    remarks: 'remark',
    notes: 'remark',
    'order converted date': 'order_converted_date',
    'order coverted date': 'order_converted_date',
    'ref no': 'offer_no',
    'quotation no': 'offer_no',
  };
  for (const col of IMPORT_COLUMNS) map[normalizeHeaderKey(col.label)] = col.key;
  return map;
})();

/** A header row has at least "Offer No" and "Client Name". */
function findHeaderRow(aoa) {
  const limit = Math.min(aoa.length, 60);
  for (let r = 0; r < limit; r++) {
    const keys = new Set((aoa[r] || []).map((c) => HEADER_MAP[normalizeHeaderKey(c)]).filter(Boolean));
    if (keys.has('client_name') && (keys.has('offer_no') || keys.has('offer_date'))) return r;
  }
  return -1;
}

/**
 * Reads every sheet that contains the offer table and returns one object per data row,
 * keyed by header text. Each row also carries `__sheet` and `__row` (Excel row number).
 * Hyperlinked cells (e.g. Offer Link = "View Offer") are returned as their URL.
 */
export async function readQuotationExcelRows(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!wb.SheetNames.length) throw new Error('Workbook has no sheets.');

  const out = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: true });
    const headerIdx = findHeaderRow(aoa);
    if (headerIdx < 0) continue;
    const headers = aoa[headerIdx].map((h) => String(h || '').trim());

    for (let r = headerIdx + 1; r < aoa.length; r++) {
      const cells = aoa[r] || [];
      if (cells.every((v) => v === '' || v == null)) continue;
      const row = { __sheet: sheetName, __row: range.s.r + r + 1 };
      headers.forEach((h, c) => {
        if (!h) return;
        let v = cells[c] ?? '';
        const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r + r, c: range.s.c + c })];
        if (cell?.l?.Target && HEADER_MAP[normalizeHeaderKey(h)] === 'offer_link') v = cell.l.Target;
        row[h] = v;
      });
      out.push(row);
    }
  }

  // Fallback: plain sheet with headers on row 1 (old template).
  if (!out.length) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils
      .sheet_to_json(sheet, { defval: '', raw: true })
      .map((row, i) => ({ __sheet: wb.SheetNames[0], __row: i + 2, ...row }));
  }
  return out;
}

export function parseQuotationImportRows(excelRows) {
  const payloads = [];
  const skipped = [];
  const today = new Date().toISOString().slice(0, 10);
  const seenOfferNos = new Set();

  for (let i = 0; i < excelRows.length; i++) {
    const row = excelRows[i] || {};
    const where = { row: row.__row ?? i + 2, sheet: row.__sheet || '' };

    const normalized = {};
    for (const [h, v] of Object.entries(row)) {
      if (h.startsWith('__')) continue;
      const fieldKey = HEADER_MAP[normalizeHeaderKey(h)];
      if (fieldKey && fieldKey !== 'quarter') normalized[fieldKey] = v;
    }
    if (Object.values(normalized).every((v) => v === '' || v == null)) {
      skipped.push({ ...where, reason: 'Empty row' });
      continue;
    }

    const clientName = String(normalized.client_name || '').trim();
    if (!clientName) {
      skipped.push({ ...where, reason: 'Missing Client Name' });
      continue;
    }

    for (const df of ['offer_date', 'last_followup_date', 'next_followup_date', 'order_converted_date']) {
      if (normalized[df] != null && normalized[df] !== '') normalized[df] = parseDate(normalized[df]);
    }

    if (normalized.quoted_rate !== undefined && normalized.quoted_rate !== '') {
      const n = Number(String(normalized.quoted_rate).replace(/[₹,\s]/g, ''));
      normalized.quoted_rate = Number.isFinite(n) ? n : null;
    }
    if (normalized.offer_status != null) normalized.offer_status = normalizeOfferStatus(normalized.offer_status);
    for (const k of ['offer_no', 'contact_no', 'offer_type', 'email_id']) {
      if (normalized[k] != null) normalized[k] = String(normalized[k]).trim();
    }

    const offerNo = String(normalized.offer_no || '').trim();
    if (offerNo) {
      const key = offerNo.toLowerCase();
      if (seenOfferNos.has(key)) {
        skipped.push({ ...where, reason: `Duplicate Offer No in file (${offerNo})` });
        continue;
      }
      seenOfferNos.add(key);
    }

    const payload = normalizeQuotationPayload({
      offer_date: today,
      ...normalized,
      offer_status: normalized.offer_status || 'Draft',
    });
    // Ensure blank offer numbers are null (unique constraint allows many nulls, not many '').
    payload.offer_no = offerNo || null;

    // Order Converted Date (projects.quotations.order_converted_date, migration 20261113180000).
    // The sheet repeats the offer date in this column for every status, so it is only kept for
    // converted offers. The key is left out when empty so imports still work before the migration.
    const convertedDate = /converted/i.test(payload.offer_status) ? normalized.order_converted_date : null;
    if (convertedDate) payload.order_converted_date = convertedDate;

    payloads.push({ payload, excelRow: where.row, sheet: where.sheet });
  }

  return { payloads, skipped };
}

export function downloadQuotationImportTemplate() {
  const headers = IMPORT_COLUMNS.map((c) => c.label);
  const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Offer Database');

  const wsNotes = XLSX.utils.aoa_to_sheet(IMPORT_NOTES);
  wsNotes['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes');

  XLSX.writeFile(wb, 'quotation-import-template.xlsx');
}
