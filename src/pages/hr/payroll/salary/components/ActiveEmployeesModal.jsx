import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { fetchActiveEmployeesForPayroll } from '../../../../../services/attendancePayrollApi';
import { supabase } from '../../../../../lib/supabase';

function employeeDisplayId(emp) {
  const id = emp.employee_id ?? emp.employee_code;
  return id != null && String(id).trim() !== '' ? String(id).trim() : '—';
}

export default function ActiveEmployeesModal({ open, onClose, totalCount }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const list = await fetchActiveEmployeesForPayroll(supabase);
        if (!cancelled) setEmployees(list);
      } catch (e) {
        if (!cancelled) {
          setEmployees([]);
          setError(e.message || 'Failed to load employees');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  const count = totalCount ?? employees.length;
  const title = `Active Employees - Total ${count}`;

  const sorted = useMemo(
    () => [...employees].sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''))),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((emp) => {
      const id = employeeDisplayId(emp).toLowerCase();
      const name = String(emp.full_name || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    });
  }, [sorted, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="active-employees-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gradient-to-r from-[#1F3A8A] to-[#2c4084] px-5 py-3.5 text-white">
          <div>
            <h4 id="active-employees-modal-title" className="text-sm font-semibold">
              {title}
            </h4>
            <p className="mt-0.5 text-[11px] text-blue-100">People Master · Active status</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-blue-100 transition hover:bg-white/10 hover:text-white"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-gray-100 bg-gray-50/80 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by employee ID or name…"
              className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none ring-0 focus:border-[#1F3A8A]/40"
            />
          </div>
          {!loading && !error ? (
            <p className="mt-2 text-[11px] text-gray-500">
              Showing {filtered.length} of {sorted.length} employees
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading employees…</p>
          ) : null}
          {error ? (
            <p className="py-8 text-center text-sm text-red-600">{error}</p>
          ) : null}
          {!loading && !error && sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No active employees found in People Master.</p>
          ) : null}
          {!loading && !error && sorted.length > 0 && filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No employees match your search.</p>
          ) : null}
          {!loading && !error && filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map((emp) => (
                <div
                  key={emp.id}
                  className="flex min-h-[76px] flex-col items-center justify-center rounded-sm bg-[#2c4084] px-3 py-3 text-center text-white shadow-sm transition hover:bg-[#243670]"
                  title={emp.full_name || ''}
                >
                  <span className="text-sm font-semibold tabular-nums leading-tight">
                    {employeeDisplayId(emp)}
                  </span>
                  <span className="mt-1 text-[11px] font-medium leading-snug line-clamp-2">
                    {emp.full_name || '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
