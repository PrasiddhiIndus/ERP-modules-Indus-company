import React from 'react';
import { ExternalLink } from 'lucide-react';
import { formatDisplayDate, quarterOf } from '../quotationConstants';
import StatusBadge from '../StatusBadge';
import { QUOTATION_TYPES, formatMoneyIn, normalizeType } from './quotationMakerModel';

/** Quotation Master columns, in the agreed order (SR No is added in front). */
export const MASTER_COLUMNS = [
  { key: 'client_name', label: 'Client Name', width: 'min-w-[220px]', maxW: 'max-w-[280px]', clamp: true, strong: true },
  { key: 'location', label: 'Location', width: 'min-w-[140px]', maxW: 'max-w-[200px]', clamp: true },
  { key: 'contact_person', label: 'Contact Person', width: 'min-w-[150px]', maxW: 'max-w-[200px]', clamp: true },
  { key: 'contact_no', label: 'Contact No', nowrap: true },
  { key: 'email_id', label: 'E-mail ID', width: 'min-w-[180px]', maxW: 'max-w-[240px]', clamp: true },
  { key: 'quoted_rate', label: 'Quoted Rate', type: 'money' },
  { key: 'offer_status', label: 'Offer Status', type: 'status' },
  { key: 'offer_type', label: 'Offer Type', nowrap: true },
  { key: 'offer_link', label: 'Offer Link', type: 'link' },
  { key: 'scope', label: 'Scope', width: 'min-w-[260px]', maxW: 'max-w-[340px]', clamp: true },
  { key: 'last_followup_date', label: 'Last Followup Date', type: 'date' },
  { key: 'enquiry_received_from', label: 'Enquiry Received From', width: 'min-w-[160px]', maxW: 'max-w-[220px]', clamp: true },
  { key: 'remark', label: 'Remark', width: 'min-w-[200px]', maxW: 'max-w-[300px]', clamp: true },
  { key: 'order_converted_date', label: 'Order Converted Date', type: 'date' },
  { key: 'quarter', label: 'Quarter', type: 'computed', nowrap: true },
];

/** Fields editable from "Edit details" (sheet order; Quarter is derived). */
export const DETAIL_FIELDS = [
  { key: 'offer_no', label: 'Offer No' },
  { key: 'offer_date', label: 'Date', type: 'date' },
  ...MASTER_COLUMNS.filter((c) => c.type !== 'computed'),
];

export function cellValue(row, key) {
  switch (key) {
    case 'quoted_rate':
      return row.quoted_rate ?? row.grand_total;
    case 'offer_type': {
      if (row.offer_type) return row.offer_type;
      if (!row.quotation_type) return '';
      const t = normalizeType(row.quotation_type);
      return QUOTATION_TYPES[t]?.name || t;
    }
    case 'scope':
      return row.scope || row.subject;
    case 'quarter': {
      const q = quarterOf(row.order_converted_date || row.offer_date);
      return q ? `Q${q}` : '';
    }
    default:
      return row[key];
  }
}

export function Cell({ column, value }) {
  if (value == null || value === '') return <span className="text-slate-400">—</span>;
  switch (column.type) {
    case 'date':
      return formatDisplayDate(value);
    case 'money':
      return `₹ ${formatMoneyIn(value)}`;
    case 'status':
      return <StatusBadge status={value} />;
    case 'link':
      if (!/^https?:\/\//i.test(String(value))) {
        // Local/network file path — browsers can't open it from the web app; show it for copying.
        return (
          <span className="block truncate max-w-[180px] text-xs text-slate-600" title={String(value)}>
            File path
          </span>
        );
      }
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:underline whitespace-nowrap"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      );
    default:
      return column.clamp ? (
        <span className={`block truncate ${column.maxW || ''}`} title={String(value)}>
          {value}
        </span>
      ) : (
        String(value)
      );
  }
}
