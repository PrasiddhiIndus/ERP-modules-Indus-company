import * as XLSX from 'xlsx';
import { applyEnquiryDefaults } from '../../../services/projectsApi';
import { normalizeToIsoDate } from '../../../utils/dateDisplay';

/** Extra header aliases beyond field definition labels (Excel export variants). */
const FIELD_HEADER_ALIASES = {
  serial_number: ['Serial Number', 'Serial No', 'S.No', 'Sr No', 'Sr. No', 'ID'],
  enquiry_receipt_date: [
    'Enquiry Receipt Date',
    'Enquiry Date',
    'Receipt Date',
    'Date of Enquiry',
    'Enquiry Received Date',
  ],
  enquiry_from: ['Enquiry From', 'Enquiry Source', 'Source', 'Lead Source'],
  client_name: ['Client Name', 'Client', 'Company', 'Company Name'],
  location: ['Location', 'Site Location', 'City', 'Place'],
  scope_of_work: ['Scope of Work', 'Project Description', 'Description', 'Work Description'],
  contact_person: ['Contact Person', 'Contact', 'Contact Name'],
  phone_number: ['Phone Number', 'Phone', 'Mobile', 'Contact Number', 'Mobile Number'],
  email_address: ['Email Address', 'Email', 'E-mail', 'Email ID'],
  target_date: ['Target Date', 'Due Date', 'Follow-up Date', 'Action Date', 'Follow up Date'],
  assigned_to_person: ['Assigned To Person', 'Assigned To', 'Assigned to Person', 'Handler'],
  assigned_on_date: ['Assigned on Date', 'Assigned On Date', 'Assigned Date', 'Date Assigned'],
  priority: ['Priority', 'Priority/Probability', 'Probability'],
  current_status: ['Current Status', 'Status', 'Task Status'],
  remarks: ['Remarks', 'Notes', 'Comments', 'Remark'],
};

export const EXCEL_IMPORT_NOTES = [
  'First row must be column headers. Data starts from row 2.',
  'Use the exact header labels from “Download template”, or the aliases listed in the import panel.',
  'Dates: DD-MM-YYYY (e.g. 20-05-2026), YYYY-MM-DD, or Excel date cells. US-style MM-DD-YYYY is auto-corrected on import.',
  'Serial Number is optional on import — new rows get the next auto number.',
  'Client Name is required. Rows without Client Name are skipped.',
  'Current Status values: Not Started, Work in Progress, Completed, Regret (must match Enquiry Dropdown).',
  'Dropdown fields (Enquiry From, Assigned To, Priority, Status) should use the same text as in Enquiry Dropdown.',
];

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildHeaderMap(fields) {
  const map = {};
  for (const field of fields) {
    if (field.field_key === 'serial_number') continue;
    const names = new Set([
      field.label,
      ...(FIELD_HEADER_ALIASES[field.field_key] || []),
    ]);
    for (const name of names) {
      map[normalizeHeader(name)] = field.field_key;
    }
  }
  return map;
}

export function parseExcelDateToIso(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = normalizeToIsoDate(raw);
  return iso || null;
}

function mapRowToData(row, headerMap, fields) {
  const data = {};
  const normalizedRow = {};
  for (const [key, val] of Object.entries(row)) {
    normalizedRow[normalizeHeader(key)] = val;
  }
  for (const [header, fieldKey] of Object.entries(headerMap)) {
    const raw = normalizedRow[header];
    if (raw == null || raw === '') continue;
    const field = fields.find((f) => f.field_key === fieldKey);
    if (field?.field_type === 'date') {
      data[fieldKey] = parseExcelDateToIso(raw);
    } else {
      const s = String(raw).trim();
      data[fieldKey] = s === '' ? null : s;
    }
  }
  return data;
}

function isEmptyDataRow(data) {
  const keys = Object.keys(data).filter((k) => k !== 'serial_number');
  return keys.every((k) => data[k] == null || data[k] === '');
}

export async function readEnquiryExcelRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets.');
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

export function parseEnquiryImportRows(excelRows, fields) {
  const headerMap = buildHeaderMap(fields);
  const payloads = [];
  const skipped = [];

  for (let i = 0; i < excelRows.length; i++) {
    const row = excelRows[i];
    const data = mapRowToData(row, headerMap, fields);
    if (isEmptyDataRow(data)) {
      skipped.push({ row: i + 2, reason: 'Empty row' });
      continue;
    }
    const clientName = data.client_name;
    if (!clientName || !String(clientName).trim()) {
      skipped.push({ row: i + 2, reason: 'Missing Client Name' });
      continue;
    }
    const finalData = applyEnquiryDefaults(data, fields);
    payloads.push({ data: finalData, excelRow: i + 2 });
  }

  return { payloads, skipped };
}

export function downloadEnquiryImportTemplate(databaseFields) {
  const cols = databaseFields.filter((f) => f.field_key !== 'serial_number');
  const headers = cols.map((f) => f.label);
  const sample = {};
  for (const f of cols) {
    if (f.field_type === 'date') sample[f.label] = '20-05-2026';
    else if (f.field_key === 'current_status') sample[f.label] = f.default_value || 'Not Started';
    else if (f.field_key === 'priority') sample[f.label] = 'Medium (>50%)';
    else if (f.field_key === 'client_name') sample[f.label] = 'Example Client Ltd';
    else sample[f.label] = '';
  }
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Enquiry Import');
  XLSX.writeFile(wb, 'projects-enquiry-import-template.xlsx');
}

export function getImportFormatColumns(databaseFields) {
  return databaseFields
    .filter((f) => f.field_key !== 'serial_number')
    .map((f) => ({
      label: f.label,
      fieldKey: f.field_key,
      type: f.field_type,
      required: f.required || f.field_key === 'client_name',
      aliases: FIELD_HEADER_ALIASES[f.field_key] || [],
    }));
}
