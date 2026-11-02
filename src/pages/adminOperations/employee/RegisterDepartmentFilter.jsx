import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

function computePanelStyle(triggerEl) {
  if (!triggerEl) return null;
  const r = triggerEl.getBoundingClientRect();
  const width = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
  const pad = 8;
  let left = r.left;
  if (left + width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - width - pad);
  }
  const spaceBelow = window.innerHeight - r.bottom - pad;
  const spaceAbove = r.top - pad;
  const preferBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(320, Math.max(160, preferBelow ? spaceBelow : spaceAbove));

  if (preferBelow) {
    return { left, top: r.bottom + 4, width, maxHeight };
  }
  return { left, bottom: window.innerHeight - r.top + 4, width, maxHeight };
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
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filteredOptions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((dept) => dept.toLowerCase().includes(needle));
  }, [options, search]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }
    const update = () => setPanelStyle(computePanelStyle(triggerRef.current));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
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

  const panel =
    open && panelStyle
      ? createPortal(
          <div
            ref={panelRef}
            className="erp-menu-panel fixed z-[10050] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            role="listbox"
            aria-multiselectable="true"
            style={{
              left: panelStyle.left,
              top: panelStyle.top,
              bottom: panelStyle.bottom,
              width: panelStyle.width,
              maxHeight: panelStyle.maxHeight,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-accent/8 to-sky-50/80 px-3 py-2">
              <p className="text-[11px] font-semibold text-gray-800">Filter by department</p>
              <p className="text-[10px] text-gray-500 mt-0.5">None selected shows all · export uses this filter</p>
            </div>

            {options.length > 4 && (
              <div className="shrink-0 px-2 pt-2">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search departments…"
                  className="w-full h-7 rounded-md border border-gray-200 px-2 text-[11px] placeholder:text-gray-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
            )}

            <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-2 border-b border-gray-100">
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

            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {filteredOptions.length ? (
                filteredOptions.map((dept) => {
                  const checked = selectedSet.has(dept);
                  return (
                    <li key={dept}>
                      <label
                        className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[11px] transition ${
                          checked ? "bg-accent/8 text-accent" : "text-gray-800 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(dept)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-accent focus:ring-accent/40"
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
              <div className="shrink-0 border-t border-gray-100 bg-gray-50/90 px-2 py-2">
                <p className="text-[10px] font-medium text-gray-500 mb-1.5">Selected</p>
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  {selected.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => toggle(dept)}
                      className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-white px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/10"
                      title={`Remove ${dept}`}
                    >
                      <span className="max-w-[120px] truncate">{dept}</span>
                      <span className="text-accent/60" aria-hidden>
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`h-8 min-w-[200px] max-w-[240px] inline-flex items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition shadow-sm ${
          open
            ? "border-accent bg-white ring-2 ring-accent/15"
            : selected.length
              ? "border-accent/40 bg-accent/5 text-accent hover:border-accent/60"
              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <span className="truncate flex-1 text-left">{triggerLabel}</span>
        {selected.length > 0 && (
          <span className="shrink-0 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white tabular-nums">
            {selected.length}
          </span>
        )}
        <ChevronIcon open={open} />
      </button>
      {panel}
    </div>
  );
}
