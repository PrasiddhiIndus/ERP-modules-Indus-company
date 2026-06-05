import React, { useEffect, useMemo, useRef, useState } from "react";

function ChevronIcon({ open }) {
  return (
    <svg
      className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function RegisterDepartmentFilter({
  options = [],
  selected = [],
  onChange,
  listSort = "asc",
  onListSortChange,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((dept) => dept.toLowerCase().includes(needle));
  }, [options, search]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (dept) => {
    if (selectedSet.has(dept)) {
      onChange(selected.filter((d) => d !== dept));
    } else {
      onChange([...selected, dept]);
    }
  };

  const selectAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange([...options]);
  };
  const clearAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange([]);
  };

  const triggerLabel =
    selected.length === 0
      ? "All departments"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} departments`;

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`h-8 min-w-[200px] max-w-[240px] inline-flex items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition shadow-sm ${
          open
            ? "border-[#1F3A8A] bg-white ring-2 ring-[#1F3A8A]/15"
            : selected.length
              ? "border-[#1F3A8A]/40 bg-[#1F3A8A]/5 text-[#1F3A8A] hover:border-[#1F3A8A]/60"
              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <span className="truncate flex-1 text-left">{triggerLabel}</span>
        {selected.length > 0 && (
          <span className="shrink-0 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#1F3A8A] px-1.5 text-[10px] font-bold text-white tabular-nums">
            {selected.length}
          </span>
        )}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[min(100vw-2rem,280px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          role="listbox"
          aria-multiselectable="true"
        >
          <div className="border-b border-gray-100 bg-gradient-to-r from-[#1F3A8A]/8 to-sky-50/80 px-3 py-2">
            <p className="text-[11px] font-semibold text-gray-800">Filter by department</p>
            <p className="text-[10px] text-gray-500 mt-0.5">None selected shows all · export uses this filter</p>
          </div>

          {options.length > 4 && (
            <div className="px-2 pt-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments…"
                className="w-full h-7 rounded-md border border-gray-200 px-2 text-[11px] placeholder:text-gray-400 focus:border-[#1F3A8A] focus:outline-none focus:ring-1 focus:ring-[#1F3A8A]/30"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 px-2 py-2 border-b border-gray-100">
            <button
              type="button"
              onClick={selectAll}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!options.length || selected.length === options.length}
              className="h-6 px-2 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!selected.length}
              className="h-6 px-2 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Clear selection
            </button>
            {onListSortChange ? (
              <select
                value={listSort}
                onChange={(e) => onListSortChange(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                className="h-6 ml-auto rounded-md border border-gray-200 bg-white px-1.5 text-[10px] font-semibold text-gray-700"
                title="Sort department list"
              >
                <option value="asc">Dept A–Z</option>
                <option value="desc">Dept Z–A</option>
              </select>
            ) : null}
          </div>

          <ul className="max-h-44 overflow-y-auto py-1">
            {filteredOptions.length ? (
              filteredOptions.map((dept) => {
                const checked = selectedSet.has(dept);
                return (
                  <li key={dept}>
                    <label
                      className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[11px] transition ${
                        checked ? "bg-[#1F3A8A]/8 text-[#1F3A8A]" : "text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(dept)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-[#1F3A8A] focus:ring-[#1F3A8A]/40"
                      />
                      <span className="flex-1 font-medium leading-tight">{dept}</span>
                    </label>
                  </li>
                );
              })
            ) : (
              <li className="px-3 py-4 text-center text-[11px] text-gray-500">No departments match</li>
            )}
          </ul>

          {selected.length > 0 && (
            <div className="border-t border-gray-100 bg-gray-50/90 px-2 py-2">
              <p className="text-[10px] font-medium text-gray-500 mb-1.5">Selected</p>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {selected.map((dept) => (
                  <button
                    key={dept}
                    type="button"
                    onClick={() => toggle(dept)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#1F3A8A]/25 bg-white px-2 py-0.5 text-[10px] font-medium text-[#1F3A8A] hover:bg-[#1F3A8A]/10"
                    title={`Remove ${dept}`}
                  >
                    <span className="max-w-[120px] truncate">{dept}</span>
                    <span className="text-[#1F3A8A]/60" aria-hidden>
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
