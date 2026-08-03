import { formatDateDdMmYyyy } from '../../../utils/dateDisplay';

export const qInput =
  'w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white shadow-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all';
export const qLabel = 'block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5';
export const qSelect =
  'w-full min-h-[42px] py-2.5 px-3 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white shadow-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400';

export const QUOTATION_BASE = '/app/projects/quotation';

export const TAB_IDS = [
  'quotation-dashboard',
  'quotation-entry',
  'quotation-summary',
  'quotation-list',
  'quotation-board',
  'quotation-dropdown',
  'quotation-templates',
];

export const LIST_COLUMNS = [
  { key: 'offer_no', label: 'Offer No' },
  { key: 'offer_date', label: 'Date', type: 'date' },
  { key: 'client_name', label: 'Client' },
  { key: 'location', label: 'Location' },
  { key: 'subject', label: 'Subject' },
  { key: 'systems_covered', label: 'Systems Covered', type: 'systems' },
  { key: 'offer_type', label: 'Offer Type' },
  { key: 'quoted_rate', label: 'Quoted Rate', type: 'currency' },
  { key: 'offer_status', label: 'Status', type: 'status' },
  { key: 'owner_name', label: 'Owner' },
  { key: 'enquiry_received_from', label: 'Enquiry From' },
  { key: 'last_followup_date', label: 'Last Followup', type: 'date' },
  { key: 'next_followup_date', label: 'Next Followup', type: 'date' },
  { key: 'days_since_followup', label: 'Days Since Followup', type: 'computed' },
];

export const REQUIRED_ENTRY_FIELDS = [
  { key: 'client_name', label: 'Client Name' },
  { key: 'location', label: 'Location' },
  { key: 'contact_person', label: 'Contact Person' },
  { key: 'offer_type', label: 'Offer Type' },
  { key: 'subject', label: 'Subject' },
];

export function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

export function formatDisplayDate(value) {
  if (!value) return '—';
  return formatDateDdMmYyyy(value) || '—';
}

export function formatCurrency(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

export function slugifyKindKey(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Kanban columns (grouped statuses for board view). */
export const BOARD_COLUMNS = [
  { id: 'Draft', label: 'Draft', statuses: ['Draft'] },
  {
    id: 'Awaiting',
    label: 'Awaiting Response',
    statuses: ['Awaiting Client Response'],
  },
  {
    id: 'Revised',
    label: 'Revised Sent',
    statuses: ['Revised Offer Sent'],
  },
  {
    id: 'Hold',
    label: 'On Hold',
    statuses: ['Client Has Hold Enquiry'],
  },
  {
    id: 'Converted',
    label: 'Order Converted',
    statuses: ['Order Converted', 'Order Converted on Revised Value'],
  },
  {
    id: 'Lost',
    label: 'Order Lost',
    statuses: ['Order Lost'],
  },
];
