import React, { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[%_,()]/g, ' ')
    .trim();
}

function dashPart(value) {
  const text = String(value || '').trim();
  return text || '';
}

export default function LeadCompanyAutocomplete({
  value,
  onChange,
  onSelectLead,
  placeholder = 'Type a company from Lead Master…',
  inputClassName = '',
  disabled = false,
  id = 'client-lead-company',
}) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const blurTimerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const onDoc = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (disabled || !open) return undefined;
    const q = sanitizeSearch(value);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('marketing_leads')
          .select(
            'id, company, project, industry, location, district, project_state, address_state, telephone, email, contact_person, contact_person_2'
          )
          .order('company', { ascending: true })
          .limit(20);

        if (q) {
          query = query.or(
            [
              `company.ilike.%${q}%`,
              `project.ilike.%${q}%`,
              `district.ilike.%${q}%`,
              `project_state.ilike.%${q}%`,
            ].join(',')
          );
        }

        const { data, error } = await query;
        if (error) throw error;
        if (requestIdRef.current !== requestId) return;
        setMatches(data || []);
      } catch (error) {
        console.error('Error searching lead companies:', error);
        if (requestIdRef.current === requestId) setMatches([]);
      } finally {
        if (requestIdRef.current === requestId) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [value, open, disabled]);

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
          className="absolute left-0 right-0 z-[60] mt-1 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-gray-500">Looking up companies…</li>
          ) : matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">
              {sanitizeSearch(value)
                ? 'No matching lead. You can still save this as a new client.'
                : 'Type a company name to see leads.'}
            </li>
          ) : (
            matches.map((lead) => {
              const meta = [
                dashPart(lead.project),
                dashPart(lead.district),
                dashPart(lead.project_state),
              ].filter(Boolean).join(' · ');
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
                    <span className="font-medium text-gray-900">{lead.company || 'Untitled company'}</span>
                    {meta ? <span className="text-xs text-gray-500">{meta}</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
