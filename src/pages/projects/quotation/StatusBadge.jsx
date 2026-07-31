import React from 'react';
import { getStatusStyle } from './quotationStatusStyles';

export default function StatusBadge({ status, extra }) {
  const s = getStatusStyle(status);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
    >
      {status || '—'}
      {extra}
    </span>
  );
}
