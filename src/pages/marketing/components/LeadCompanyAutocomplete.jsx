import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { fetchAllLeadCompanies, rankLeadCompanies } from '../lib/clientContacts';

function dashPart(value) {
  return String(value || '').trim();
}

export default function LeadCompanyAutocomplete({
  value,
  onChange,
  onSelectLead,
  placeholder = 'Type or pick a company from Lead Master…',
  inputClassName = '',
  disabled = false,
  id = 'client-lead-company',
}) {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const containerRef = useRef(null);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (disabled) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    fetchAllLeadCompanies(supabase)
      .then((rows) => {
        if (!cancelled) setLeads(rows);
      })
      .catch((error) => {
        console.error('Error loading lead companies:', error);
        if (!cancelled) {
          setLeads([]);
          setLoadError('Could not load companies from Lead Master.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [disabled]);

  const matches = useMemo(() => rankLeadCompanies(leads, value), [leads, value]);

  const scheduleClose = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => setOpen(false), 180);
  };

  const cancelClose = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  };

  const handleSelect = (lead) => {
    cancelClose();
    onSelectLead?.(lead);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Building2
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
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
          className={`w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent ${inputClassName}`}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          required
        />
      </div>
      {open && !disabled ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 z-[60] mt-1 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-500">Loading all companies from Lead Master…</li>
          ) : loadError ? (
            <li className="px-3 py-2 text-sm text-red-600">{loadError}</li>
          ) : leads.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No companies in Lead Master yet.</li>
          ) : matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              No matching company. You can still save this as a new client.
            </li>
          ) : (
            <>
              <li className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400">
                {matches.length === leads.length
                  ? `${leads.length} compan${leads.length === 1 ? 'y' : 'ies'} from Lead Master`
                  : `${matches.length} of ${leads.length} companies`}
              </li>
              {matches.map((lead) => {
                const meta = [
                  dashPart(lead.project),
                  dashPart(lead.district),
                  dashPart(lead.project_state),
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={lead.id} role="option">
                    <button
                      type="button"
                      className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-purple-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(lead);
                      }}
                    >
                      <span className="whitespace-normal break-words font-medium text-gray-900">
                        {lead.company}
                      </span>
                      {meta ? (
                        <span className="whitespace-normal break-words text-xs text-gray-500">{meta}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </>
          )}
        </ul>
      ) : null}
    </div>
  );
}
