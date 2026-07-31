export const STATUS_COLORS = {
  Draft: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  'Awaiting Client Response': { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  'Revised Offer Sent': { bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  'Client Has Hold Enquiry': { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' },
  'Order Lost': { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  'Order Converted on Revised Value': { bg: '#d1fae5', text: '#047857', border: '#6ee7b7' },
  'Order Converted': { bg: '#d1fae5', text: '#065f46', border: '#34d399' },
  Superseded: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' },
};

export function getStatusStyle(status) {
  return STATUS_COLORS[status] || { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
}
