import { getEnquiryFieldValue } from '../../../services/projectsApi';
import { formatDateDdMmYyyy } from '../../../utils/dateDisplay';
import { formatDisplayDate } from './enquiryConstants';

/** Sensible default columns for register export (not every configured field). */
export const DEFAULT_EXPORT_COLUMN_KEYS = [
  'serial_number',
  'enquiry_receipt_date',
  'enquiry_from',
  'client_name',
  'location',
  'scope_of_work',
  'contact_person',
  'phone_number',
  'email_address',
  'assigned_to_person',
  'target_date',
  'current_status',
  'priority',
];

const COMPACT_COLUMN_WIDTHS = {
  serial_number: 62,
  enquiry_receipt_date: 86,
};

/** Shows full cell value with word-wrap (not truncated). */
const WRAP_CONTENT_COLUMN_WIDTHS = {
  email_address: 172,
};

const TABLE_COLUMN_MIN_WIDTHS = {
  assigned_on_date: 118,
  target_date: 118,
  enquiry_from: 132,
  client_name: 148,
  location: 112,
  contact_person: 120,
  phone_number: 112,
  assigned_to_person: 132,
  current_status: 112,
  priority: 112,
  scope_of_work: 200,
  remarks: 160,
};

function columnWidth(field) {
  const key = field?.field_key;
  if (COMPACT_COLUMN_WIDTHS[key] != null) return COMPACT_COLUMN_WIDTHS[key];
  if (WRAP_CONTENT_COLUMN_WIDTHS[key] != null) return WRAP_CONTENT_COLUMN_WIDTHS[key];
  if (TABLE_COLUMN_MIN_WIDTHS[key] != null) return TABLE_COLUMN_MIN_WIDTHS[key];
  if (field?.field_type === 'date') return 118;
  if (field?.field_type === 'textarea') return 180;
  if (field?.field_type === 'dropdown') return 120;
  return 104;
}

export function isCompactTableColumn(field) {
  return COMPACT_COLUMN_WIDTHS[field?.field_key] != null;
}

export function isWrapContentTableColumn(field) {
  return WRAP_CONTENT_COLUMN_WIDTHS[field?.field_key] != null;
}

/** Fixed px layout for table columns — compact cols use exact width so headers wrap. */
export function getTableColumnLayout(field) {
  const px = columnWidth(field);
  const compact = isCompactTableColumn(field);
  const wrapContent = isWrapContentTableColumn(field);

  if (wrapContent) {
    return {
      px,
      compact: false,
      wrapContent: true,
      style: { minWidth: px, width: px },
      headerClass: 'whitespace-normal leading-[1.15] break-words text-center px-2 py-2 align-middle',
      cellClass: 'px-2 break-all whitespace-normal text-left align-top',
    };
  }

  if (compact) {
    return {
      px,
      compact: true,
      wrapContent: false,
      style: { width: px, maxWidth: px, minWidth: px },
      headerClass: 'whitespace-normal leading-[1.15] break-words text-center px-1 py-2 align-middle',
      cellClass: 'overflow-hidden px-1',
    };
  }
  return {
    px,
    compact: false,
    wrapContent: false,
    style: { minWidth: px, width: px },
    headerClass: 'whitespace-nowrap px-2 py-2.5',
    cellClass: 'px-2',
  };
}

export function getEnquiryTableWidth(databaseFields) {
  const dataWidth = (databaseFields || []).reduce((sum, f) => sum + getTableColumnLayout(f).px, 0);
  return 44 + dataWidth + 68; // S.No + fields + Actions
}

/** @deprecated use getTableColumnLayout */
export function getTableColumnStyle(field) {
  const { style } = getTableColumnLayout(field);
  return style;
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cellExportValue(row, field) {
  const raw = getEnquiryFieldValue(row, field.field_key);
  if (raw == null || raw === '') return '';
  if (field.field_type === 'date') return formatDateDdMmYyyy(raw) || String(raw);
  return String(raw).replace(/\r?\n/g, ' ').trim();
}

export function isTableColumnLeftAligned(field) {
  return field?.field_type === 'text' || field?.field_type === 'textarea';
}

export function resolveExportFields(databaseFields, selectedKeys) {
  const keys = selectedKeys?.length ? selectedKeys : DEFAULT_EXPORT_COLUMN_KEYS;
  const byKey = new Map(databaseFields.map((f) => [f.field_key, f]));
  return keys.map((key) => byKey.get(key)).filter(Boolean);
}

export function buildEnquiryDatabaseCsv(rows, exportFields) {
  const header = ['S.No', ...exportFields.map((f) => csvEscape(f.label))].join(',');
  const lines = (rows || []).map((row, idx) =>
    [
      idx + 1,
      ...exportFields.map((f) => csvEscape(cellExportValue(row, f))),
    ].join(',')
  );
  return [header, ...lines].join('\r\n');
}

export function downloadEnquiryDatabaseCsv(content, filename) {
  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportEnquiryDatabaseCsv(rows, databaseFields, selectedKeys, filename) {
  const exportFields = resolveExportFields(databaseFields, selectedKeys);
  if (!exportFields.length) return false;
  downloadEnquiryDatabaseCsv(buildEnquiryDatabaseCsv(rows, exportFields), filename);
  return true;
}

export function defaultExportSelection(databaseFields) {
  const available = new Set(databaseFields.map((f) => f.field_key));
  return DEFAULT_EXPORT_COLUMN_KEYS.filter((key) => available.has(key));
}

/** Display helper — keeps em dash in UI, not in CSV. */
export function displayTableCellValue(field, row) {
  const v = getEnquiryFieldValue(row, field.field_key);
  if (field.field_type === 'date') return formatDisplayDate(v);
  return v == null || v === '' ? '—' : v;
}
