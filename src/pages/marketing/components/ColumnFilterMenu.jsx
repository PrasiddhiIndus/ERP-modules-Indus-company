import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const BLANK_FILTER_VALUE = '__blank__';
export const BLANK_FILTER_LABEL = '(Blanks)';

/**
 * Excel-style header filter: small caret on the column, tick list of every value
 * present in the data. `value === null` means everything is included.
 */
export default function ColumnFilterMenu({
  label,
  options = [],
  value = null,
  onApply,
  includeBlank = true,
  searchPlaceholder = 'Search',
}) {
  const allValues = includeBlank ? [...options, BLANK_FILTER_VALUE] : [...options];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Set(allValues));
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const active = Array.isArray(value) && value.length > 0 && value.length < allValues.length;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const width = 248;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    setPos({ top: rect.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openMenu = () => {
    setQuery('');
    setDraft(new Set(Array.isArray(value) && value.length ? value : allValues));
    setOpen(true);
  };

  const visible = allValues.filter((v) => {
    const text = v === BLANK_FILTER_VALUE ? BLANK_FILTER_LABEL : v;
    return text.toLowerCase().includes(query.trim().toLowerCase());
  });

  const allVisibleChecked = visible.length > 0 && visible.every((v) => draft.has(v));

  const toggle = (v) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visible.forEach((v) => next.delete(v));
      else visible.forEach((v) => next.add(v));
      return next;
    });
  };

  const apply = () => {
    const picked = allValues.filter((v) => draft.has(v));
    onApply?.(picked.length === allValues.length ? null : picked);
    setOpen(false);
  };

  const clear = () => {
    onApply?.(null);
    setOpen(false);
  };

  return (
    <span className="inline-flex items-center gap-1 w-full">
      <span className="truncate">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        title={active ? `${label} filter is on` : `Filter ${label}`}
        aria-label={`Filter ${label}`}
        aria-expanded={open}
        className={`shrink-0 inline-flex items-center justify-center h-5 w-5 rounded border text-[10px] ${
          active
            ? 'border-purple-300 bg-purple-100 text-purple-700'
            : 'border-gray-300 bg-white text-gray-500 hover:text-gray-800'
        }`}
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {open ? (
        <div
          ref={panelRef}
          style={{ top: pos.top, left: pos.left, width: 248 }}
          className="fixed z-[120] rounded-lg border border-gray-200 bg-white shadow-xl text-xs text-gray-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-gray-500">No matches</p>
            ) : (
              <>
                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={toggleAllVisible}
                    className="accent-purple-600"
                  />
                  <span>(Select All)</span>
                </label>
                {visible.map((v) => (
                  <label
                    key={v}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={draft.has(v)}
                      onChange={() => toggle(v)}
                      className="accent-purple-600"
                    />
                    <span className="truncate">
                      {v === BLANK_FILTER_VALUE ? BLANK_FILTER_LABEL : v}
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-2 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <button
              type="button"
              onClick={clear}
              className="px-2 py-1 text-[11px] text-gray-600 hover:text-gray-900"
            >
              Show all
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2.5 py-1 rounded border border-gray-300 bg-white text-[11px] hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={draft.size === 0}
                className="px-3 py-1 rounded bg-purple-600 text-white text-[11px] hover:bg-purple-700 disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}
