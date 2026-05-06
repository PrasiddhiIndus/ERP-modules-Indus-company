import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserSearch } from 'lucide-react';

/**
 * Type-ahead for legal client name: suggests saved clients from `profiles`; choosing one applies `snapshot`.
 */
export default function ClientLegalNameAutocomplete({
  value,
  onChange,
  profiles = [],
  onApplySnapshot,
  placeholder = 'Start typing legal name…',
  inputClassName = '',
  disabled = false,
  id = 'client-legal-name-autocomplete',
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const blurTimerRef = useRef(null);

  const query = String(value || '').trim();

  const filtered = useMemo(() => {
    const base = profiles || [];
    const q = query.toLowerCase().trim();
    if (!q) return base.slice(0, 10);
    return base
      .filter((p) => {
        const name = String(p.displayName || '').toLowerCase();
        const gst = String(p.snapshot?.gstin || '').toLowerCase();
        return name.includes(q) || gst.includes(q.replace(/\s/g, ''));
      })
      .slice(0, 12);
  }, [profiles, query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleSelect = (profile) => {
    if (!profile?.snapshot) return;
    onApplySnapshot(profile.snapshot);
    onChange(profile.displayName || '');
    setOpen(false);
  };

  const scheduleClose = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setOpen(false), 180);
  };

  const cancelClose = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <UserSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          id={id}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            cancelClose();
            setOpen(true);
          }}
          onBlur={scheduleClose}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 ${inputClassName}`}
          aria-autocomplete="list"
          aria-expanded={open && filtered.length > 0}
          aria-controls={`${id}-listbox`}
        />
      </div>
      {open && filtered.length > 0 && !disabled ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 z-[60] mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((p) => (
            <li key={p.key} role="option">
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-red-50"
                onMouseDown={(e) => {
                  e.preventDefault();
                  cancelClose();
                  handleSelect(p);
                }}
              >
                <span className="font-medium text-gray-900">{p.displayName}</span>
                <span className="text-xs text-gray-500">
                  {p.snapshot?.gstin ? `${p.snapshot.gstin} · ` : ''}
                  {p.subtitle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
