import React, { useEffect, useMemo, useRef, useState } from 'react';
import { managerOptionLabel } from '../../lib/employeeHierarchy';

/**
 * Searchable manager picker backed by active employees in admin_ifsp_employee_master.
 */
export function ManagerSearchSelect({
  label,
  hint,
  valueCode = '',
  valueName = '',
  onChange,
  candidates = [],
  disabled = false,
  placeholder = 'Search name or employee code…',
}) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const displayValue = useMemo(() => {
    if (!valueCode) return '';
    const match = candidates.find(
      (c) =>
        String(c.employee_code || '').trim() === String(valueCode).trim() ||
        String(c.employee_id || '').trim() === String(valueCode).trim()
    );
    if (match) return managerOptionLabel(match);
    if (valueName) return `${valueName} (${valueCode})`;
    return String(valueCode);
  }, [candidates, valueCode, valueName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 80);
    return candidates
      .filter((row) => {
        const hay = [
          row.full_name,
          row.employee_code,
          row.employee_id,
          row.department,
          row.designation,
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [candidates, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const pick = (row) => {
    const code = String(row.employee_code || row.employee_id || '').trim();
    const name = String(row.full_name || '').trim();
    onChange({ code, name });
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange({ code: '', name: '' });
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={open ? query : displayValue}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setOpen(true);
            if (!val.trim()) {
              clear();
              return;
            }
            // Resolve when the value exactly matches an option label (autofill/paste/native pick).
            const exact = candidates.find((row) => managerOptionLabel(row) === val);
            if (exact) pick(exact);
          }}
          onFocus={() => {
            setQuery(displayValue);
            setOpen(true);
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          autoComplete="off"
        />
        {valueCode ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="px-2 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 shrink-0"
          >
            Clear
          </button>
        ) : null}
      </div>
      {open && filtered.length > 0 ? (
        <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
          {filtered.map((row) => {
            const key = row.id ?? `${row.employee_code}-${row.employee_id}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-blue-50 text-gray-800"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                >
                  {managerOptionLabel(row)}
                  {row.department ? (
                    <span className="block text-[10px] text-gray-500">{row.department}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {valueCode && valueName ? (
        <p className="text-[11px] text-gray-500 mt-1">
          Stored: <span className="font-mono">{valueCode}</span> — {valueName}
        </p>
      ) : null}
      {hint ? <p className="text-[11px] text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
}
