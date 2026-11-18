import React from 'react';

/**
 * Shows Excel rows that were skipped / not imported, with sheet + reason.
 * Display-only — does not affect import behaviour.
 */
export default function QuotationImportSkippedList({
  rows = [],
  title = 'Skipped / not imported',
  maxHeightClass = 'max-h-40',
}) {
  if (!rows?.length) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-amber-200/80">
        <p className="text-xs font-semibold text-amber-900 m-0">{title}</p>
        <span className="text-[11px] font-semibold text-amber-800 tabular-nums">{rows.length}</span>
      </div>
      <div className={`${maxHeightClass} overflow-y-auto`}>
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0 bg-amber-100/95 text-amber-900">
            <tr>
              <th className="text-left font-semibold px-3 py-1.5 w-[72px]">Excel row</th>
              <th className="text-left font-semibold px-2 py-1.5 w-[28%]">Sheet</th>
              <th className="text-left font-semibold px-3 py-1.5">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, idx) => {
              const rowLabel =
                item.row != null && item.row !== ''
                  ? String(item.row)
                  : item.excelRow != null && item.excelRow !== ''
                    ? String(item.excelRow)
                    : '—';
              const sheet = String(item.sheet || '').trim() || '—';
              const reason = String(item.reason || '').trim() || 'Not processed';
              return (
                <tr key={`${rowLabel}-${sheet}-${idx}`} className="border-t border-amber-100 bg-white/70">
                  <td className="px-3 py-1.5 font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    {rowLabel}
                  </td>
                  <td className="px-2 py-1.5 text-slate-600 truncate max-w-[140px]" title={sheet}>
                    {sheet}
                  </td>
                  <td className="px-3 py-1.5 text-amber-950">{reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-amber-800/90 px-3 py-1.5 m-0 border-t border-amber-200/70">
        Fix these Excel rows and re-import. Ready rows are not affected.
      </p>
    </div>
  );
}
