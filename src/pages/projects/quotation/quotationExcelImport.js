import * as XLSX from 'xlsx';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';
import { normalizeQuotationPayload } from '../../../services/quotationApi';

/**
 * Fixed columns for the quotation import template.
 * These are the exact header strings used in the generated Excel sheet.
 */
export const IMPORT_COLUMNS = [
  { key: 'offer_no',              label: 'Offer No',               required: false, type: 'text',     hint: 'e.g. IFSPL/P/SRE/ABC/07-1/SITC/26-27/REV00 — if blank, must be generated after import' },
  { key: 'offer_date',            label: 'Date',                   required: false, type: 'date',     hint: 'DD-MM-YYYY or YYYY-MM-DD' },
  { key: 'client_name',           label: 'Client Name',            required: true,  type: 'text',     hint: 'Required' },
  { key: 'location',              label: 'Location',               required: false, type: 'text',     hint: 'Site location' },
  { key: 'contact_person',        label: 'Contact Person',         required: false, type: 'text',     hint: '' },
  { key: 'contact_no',            label: 'Contact No',             required: false, type: 'text',     hint: '' },
  { key: 'email_id',              label: 'Email ID',               required: false, type: 'text',     hint: '' },
  { key: 'quoted_rate',           label: 'Quoted Rate',            required: false, type: 'number',   hint: 'Grand total (numbers only)' },
  { key: 'offer_status',          label: 'Offer Status',           required: false, type: 'text',     hint: 'Draft | Awaiting Client Response | Revised Offer Sent | Client Has Hold Enquiry | Order Lost | Order Converted | Order Converted on Revised Value' },
  { key: 'offer_type',            label: 'Offer Type',             required: false, type: 'text',     hint: 'FFTG | FDS | DBM | AUD' },
  { key: 'subject',               label: 'Subject',                required: false, type: 'text',     hint: 'Scope one-liner' },
  { key: 'scope',                 label: 'Scope',                  required: false, type: 'text',     hint: 'Full scope description' },
  { key: 'enquiry_received_from', label: 'Enquiry Received From',  required: false, type: 'text',     hint: 'Mr. Shahid | Mr. Chirag | Solanki | Tender | Direct Client | Marketing | Others' },
  { key: 'owner_name',            label: 'Owner',                  required: false, type: 'text',     hint: 'Sales/estimation person' },
  { key: 'branch_code',           label: 'Branch Code',            required: false, type: 'text',     hint: 'SRE | AHM | MUM | DEL | BLR' },
  { key: 'last_followup_date',    label: 'Last Followup Date',     required: false, type: 'date',     hint: 'DD-MM-YYYY' },
  { key: 'next_followup_date',    label: 'Next Followup Date',     required: false, type: 'date',     hint: 'DD-MM-YYYY' },
  { key: 'remark',                label: 'Remark',                 required: false, type: 'text',     hint: 'Free-form notes' },
];

/** Sample row for the template. */
const SAMPLE_ROW = {
  'Offer No':               'IFSPL/P/SRE/ABC/07-1/SITC/26-27/REV00',
  'Date':                   '29-07-2026',
  'Client Name':            'ABC Industries Ltd',
  'Location':               'Surat, Gujarat',
  'Contact Person':         'Mr. Ramesh Shah',
  'Contact No':             '9876543210',
  'Email ID':               'ramesh@abcind.com',
  'Quoted Rate':            '250000',
  'Offer Status':           'Draft',
  'Offer Type':             'FFTG',
  'Subject':                'Supply & Installation of Fire Fighting System',
  'Scope':                  'Supply, installation, testing and commissioning of fire fighting system',
  'Enquiry Received From':  'Direct Client',
  'Owner':                  'Mr. Shahid',
  'Branch Code':            'SRE',
  'Last Followup Date':     '29-07-2026',
  'Next Followup Date':     '05-08-2026',
  'Remark':                 'Initial enquiry received via phone',
};

/** Notes tab content. */
const IMPORT_NOTES = [
  ['Notes for import'],
  [''],
  ['1. First row must be column headers exactly as in the "Quotation Import" sheet.'],
  ['2. Data starts from row 2. Row 1 in the sample sheet is an example — clear it before importing your own data.'],
  ['3. Dates: use DD-MM-YYYY format (e.g. 29-07-2026). YYYY-MM-DD also accepted.'],
  ['4. Client Name is required — rows without it are skipped.'],
  ['5. Offer No is optional on import. If left blank, manually set it after import.'],
  ['6. Offer Status values (case-sensitive):'],
  ['   Draft'],
  ['   Awaiting Client Response'],
  ['   Revised Offer Sent'],
  ['   Client Has Hold Enquiry'],
  ['   Order Lost'],
  ['   Order Converted'],
  ['   Order Converted on Revised Value'],
  ['7. Offer Type values: FFTG, FDS, DBM, AUD'],
  ['8. Branch Code values: SRE, AHM, MUM, DEL, BLR'],
  ['9. Quoted Rate: numbers only, no ₹ symbol or commas.'],
  ['10. Max 500 rows per import file.'],
];

function parseDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  return normalizeToIsoDate(String(value).trim()) || null;
}

function normalizeHeaderKey(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build header→field-key map, tolerating minor case/spacing differences.
 */
function buildHeaderMap(headerRow) {
  const map = {};
  for (const col of IMPORT_COLUMNS) {
    map[normalizeHeaderKey(col.label)] = col.key;
  }
  // aliases
  const ALIASES = {
    'date': 'offer_date',
    'offer date': 'offer_date',
    'client': 'client_name',
    'company': 'client_name',
    'company name': 'client_name',
    'contact': 'contact_person',
    'phone': 'contact_no',
    'mobile': 'contact_no',
    'email': 'email_id',
    'e-mail': 'email_id',
    'amount': 'quoted_rate',
    'rate': 'quoted_rate',
    'value': 'quoted_rate',
    'status': 'offer_status',
    'type': 'offer_type',
    'owner name': 'owner_name',
    'salesperson': 'owner_name',
    'branch': 'branch_code',
    'source': 'enquiry_received_from',
    'enquiry source': 'enquiry_received_from',
    'enquiry from': 'enquiry_received_from',
    'last followup': 'last_followup_date',
    'last follow up date': 'last_followup_date',
    'next followup': 'next_followup_date',
    'next follow up date': 'next_followup_date',
    'remarks': 'remark',
    'notes': 'remark',
    'comments': 'remark',
    'offer no': 'offer_no',
    'ref no': 'offer_no',
    'ref': 'offer_no',
    'quotation no': 'offer_no',
  };
  return { ...ALIASES, ...map };
}

export async function readQuotationExcelRows(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets.');
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export function parseQuotationImportRows(excelRows) {
  const payloads = [];
  const skipped = [];
  const today = new Date().toISOString().slice(0, 10);
  const headerMap = buildHeaderMap();

  for (let i = 0; i < excelRows.length; i++) {
    const row = excelRows[i];
    if (!row || Object.values(row).every((v) => v === '' || v == null)) {
      skipped.push({ row: i + 2, reason: 'Empty row' });
      continue;
    }

    const normalized = {};
    for (const [h, v] of Object.entries(row)) {
      const nk = normalizeHeaderKey(h);
      const fieldKey = headerMap[nk];
      if (fieldKey) normalized[fieldKey] = v;
    }

    const clientName = String(normalized.client_name || '').trim();
    if (!clientName) {
      skipped.push({ row: i + 2, reason: 'Missing Client Name' });
      continue;
    }

    const dateFields = ['offer_date', 'last_followup_date', 'next_followup_date'];
    for (const df of dateFields) {
      if (normalized[df] != null && normalized[df] !== '') {
        normalized[df] = parseDate(normalized[df]);
      }
    }

    if (normalized.quoted_rate !== undefined && normalized.quoted_rate !== '') {
      const n = Number(String(normalized.quoted_rate).replace(/[₹,\s]/g, ''));
      normalized.quoted_rate = Number.isFinite(n) ? n : null;
    }

    const payload = normalizeQuotationPayload({
      offer_date: today,
      offer_status: 'Draft',
      ...normalized,
    });

    payloads.push({ payload, excelRow: i + 2 });
  }

  return { payloads, skipped };
}

export function downloadQuotationImportTemplate() {
  const headers = IMPORT_COLUMNS.map((c) => c.label);

  // Sheet 1: Data template with sample row
  const ws = XLSX.utils.json_to_sheet([SAMPLE_ROW], { header: headers });

  // Column widths
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

  // Style header row bold (xlsx lite — just set a comment for guidance)
  // Add column hints as row 3
  const hintRow = {};
  for (const col of IMPORT_COLUMNS) {
    if (col.hint) hintRow[col.label] = col.hint;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quotation Import');

  // Notes sheet
  const wsNotes = XLSX.utils.aoa_to_sheet(IMPORT_NOTES);
  wsNotes['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsNotes, 'Notes');

  XLSX.writeFile(wb, 'quotation-import-template.xlsx');
}
