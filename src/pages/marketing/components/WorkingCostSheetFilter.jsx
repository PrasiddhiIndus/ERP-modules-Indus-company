import React from 'react';
import { WORKING_COST_SHEET_OPTIONS } from '../utils/workingCostSheets';

const OPTIONS = [
  { id: '', label: 'All' },
  ...WORKING_COST_SHEET_OPTIONS,
];

function tone(id, selected) {
  if (!selected) return 'text-slate-600 hover:bg-slate-50';
  if (id === 'domestic') return 'bg-sky-600 text-white shadow-sm';
  if (id === 'international') return 'bg-amber-500 text-white shadow-sm';
  return 'bg-slate-900 text-white shadow-sm';
}

export default function WorkingCostSheetFilter({ value, onChange, domesticCount = 0, internationalCount = 0 }) {
  const counts = { domestic: domesticCount, international: internationalCount };
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Working cost sheet</p>
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Working cost sheet">
        {OPTIONS.map((option) => {
          const selected = (value || '') === option.id;
          const count = counts[option.id];
          return (
            <button
              key={option.id || 'all'}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(selected && option.id ? '' : option.id)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${tone(option.id, selected)}`}
            >
              {option.label}
              {count != null && (
                <span className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] tabular-nums ${selected ? 'bg-white/25' : 'bg-slate-100 text-slate-700'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
