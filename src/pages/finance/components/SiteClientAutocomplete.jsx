import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search } from "lucide-react";

/**
 * Autocomplete for site / client search with typeahead suggestions.
 */
export function SiteClientAutocomplete({
  sites,
  value,
  onChange,
  onSearchChange,
  filterQuery,
  label = "Site / Client",
  id = "site-client-search",
  placeholder = "Type site or client name…",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selected = sites.find((s) => s.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites.slice(0, 12);
    return sites.filter((s) => {
      const hay = [s.name, s.client, s.service, s.wo, s.ocNumber, s.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sites, query]);

  useEffect(() => {
    if (!open) setQuery(selected?.name || filterQuery || "");
  }, [open, selected?.name, selected?.id, filterQuery]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (siteId) => {
    onChange(siteId);
    setOpen(false);
    const site = sites.find((s) => s.id === siteId);
    setQuery(site?.name || "");
  };

  const displayValue = open ? query : (selected?.name || filterQuery || "");

  return (
    <div className={`entry-sel site-search site-client-ac ${className}`} ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className="site-search-box">
        <Search className="site-search-ico" size={14} />
        <input
          id={id}
          type="search"
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.name || "");
          }}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            onSearchChange?.(next);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(selected?.name || "");
            }
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              pick(filtered[0].id);
            }
            if (e.key === "ArrowDown" && filtered[0] && !open) {
              setOpen(true);
            }
          }}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
        />
        {open && (
          <div className="site-search-menu" id={`${id}-listbox`} role="listbox">
            {filtered.length === 0 ? (
              <div className="site-search-empty">No matching sites or clients</div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === value}
                  className={"site-search-opt" + (s.id === value ? " on" : "")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s.id)}
                >
                  <span className="site-search-opt-name">{s.name}</span>
                  {(s.ocNumber || s.wo || s.client) && (
                    <span className="site-search-opt-meta">
                      {[s.client, s.ocNumber, s.wo].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
