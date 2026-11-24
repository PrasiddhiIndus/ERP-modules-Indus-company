import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

const PAGE_SIZE = 100;

const inputCls =
  'h-8 border border-slate-200 rounded-md px-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-accent/30';

export function filterEmployees(employees, { search = '', department = 'all' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return employees.filter((e) => {
    if (department !== 'all' && (e.department || '') !== department) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.email.includes(q) ||
      (e.employeeCode || '').toLowerCase().includes(q) ||
      (e.department || '').toLowerCase().includes(q) ||
      (e.designation || '').toLowerCase().includes(q)
    );
  });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/**
 * Searchable, paged employee table for large lists.
 * Name, department, and designation come from Employee Master. `selectedIds` is a Set of profile ids.
 */
export default function EmployeePicker({
  employees,
  selectedIds,
  onChange,
  maxHeightClass = 'max-h-[calc(100dvh-24rem)]',
  emptyText = 'No employees match your search.',
}) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [onlySelected, setOnlySelected] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [employees]
  );

  const filtered = useMemo(() => {
    const rows = filterEmployees(employees, { search, department });
    return onlySelected ? rows.filter((e) => selectedIds.has(e.id)) : rows;
  }, [employees, search, department, onlySelected, selectedIds]);

  const shown = filtered.slice(0, visible);
  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const someFilteredSelected = !allFilteredSelected && filtered.some((e) => selectedIds.has(e.id));

  const toggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleAllFiltered = () => {
    const next = new Set(selectedIds);
    if (allFilteredSelected) filtered.forEach((e) => next.delete(e.id));
    else filtered.forEach((e) => next.add(e.id));
    onChange(next);
  };

  const resetPaging = () => setVisible(PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-1.5">
        <div className="relative min-w-0 flex-1 max-w-xs">
          <Search className="w-3 h-3 text-ink-muted absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className={`${inputCls} w-full pl-7`}
            placeholder="Search name, email, code…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPaging();
            }}
          />
        </div>
        <select
          className={`${inputCls} w-[7.5rem] shrink-0`}
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            resetPaging();
          }}
          aria-label="Filter by department"
        >
          <option value="all">All depts</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setOnlySelected((v) => !v);
            resetPaging();
          }}
          className={`h-8 shrink-0 px-2.5 rounded-md border text-xs font-medium whitespace-nowrap ${
            onlySelected ? 'bg-accent text-white border-accent' : 'bg-white text-ink-secondary border-slate-200 hover:bg-slate-50'
          }`}
        >
          Selected only
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
        <span>
          Showing {shown.length} of {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="rounded-full bg-accent-soft text-accent px-2.5 py-0.5 font-semibold">
            {selectedIds.size} selected
          </span>
          {selectedIds.size ? (
            <button type="button" className="text-accent hover:underline" onClick={() => onChange(new Set())}>
              Clear selection
            </button>
          ) : null}
        </span>
      </div>

      <div className={`rounded-lg border border-border overflow-auto ${maxHeightClass}`}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50 text-gray-600">
            <tr className="border-b border-border">
              <th className="w-10 px-3 py-2 text-left">
                <input
                  type="checkbox"
                  aria-label="Select all employees shown by the filter"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someFilteredSelected;
                  }}
                  disabled={filtered.length === 0}
                  onChange={toggleAllFiltered}
                />
              </th>
              <th className="px-3 py-2 text-left font-semibold">Employee</th>
              <th className="px-3 py-2 text-left font-semibold">Email</th>
              <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">Department</th>
              <th className="px-3 py-2 text-left font-semibold hidden md:table-cell">Designation</th>
              <th className="px-3 py-2 text-left font-semibold hidden lg:table-cell">Emp. code</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-ink-muted">{emptyText}</td>
              </tr>
            ) : (
              shown.map((e) => {
                const checked = selectedIds.has(e.id);
                return (
                  <tr
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    className={`cursor-pointer ${checked ? 'bg-accent-soft/50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${e.name}`}
                        checked={checked}
                        onChange={() => toggle(e.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-full bg-accent-soft text-accent text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {initials(e.name)}
                        </span>
                        <span className="font-medium text-ink truncate">{e.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary truncate max-w-[260px]">{e.email}</td>
                    <td className="px-3 py-2 text-ink-secondary hidden md:table-cell">{e.department || '—'}</td>
                    <td className="px-3 py-2 text-ink-secondary hidden md:table-cell">{e.designation || '—'}</td>
                    <td className="px-3 py-2 text-ink-secondary font-mono hidden lg:table-cell">{e.employeeCode || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {filtered.length > shown.length ? (
          <div className="px-3 py-2 border-t border-border bg-surface-sunken text-center">
            <button
              type="button"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              Show more ({filtered.length - shown.length} more)
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
