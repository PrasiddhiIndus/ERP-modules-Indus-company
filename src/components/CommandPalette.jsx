import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { COMMAND_DESTINATIONS } from "../lib/commandDestinations";

/**
 * Global jump-to navigation. Caller must pass only RBAC-allowed destinations
 * (or a canOpenPath filter). Never opens routes the user cannot access.
 */
export default function CommandPalette({ open, onClose, destinations, onNavigate }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const list = destinations?.length ? destinations : COMMAND_DESTINATIONS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 40);
    return list
      .filter((d) => {
        const hay = `${d.label} ${d.path} ${d.group || ""} ${d.keywords || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [list, query]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (item) => {
    if (!item) return;
    onNavigate?.(item.path);
    onClose?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(filtered[active]);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4 erp-overlay-enter">
      <button type="button" className="absolute inset-0 bg-scrim" aria-label="Close command palette" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to page"
        className="relative w-full max-w-xl rounded-card border border-border bg-surface shadow-modal overflow-hidden erp-modal-enter"
      >
        <div className="flex items-center gap-2 px-3 border-b border-divider bg-gradient-to-b from-accent-soft/40 to-transparent">
          <Search className="w-4 h-4 text-accent shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page…"
            className="flex-1 h-12 bg-transparent outline-none type-body text-ink placeholder:text-ink-muted"
            autoComplete="off"
          />
          <kbd className="hidden sm:inline type-mono-micro text-ink-muted border border-border rounded px-1.5 py-0.5">
            esc
          </kbd>
        </div>
        <ul className="max-h-[min(50vh,22rem)] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center type-meta text-ink-muted">No matching pages you can open.</li>
          ) : (
            filtered.map((item, i) => (
              <li key={`${item.path}-${item.label}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => go(item)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-theme ${
                    i === active ? "bg-accent-soft text-ink-strong" : "text-ink hover:bg-row-hover"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block type-body-medium type-truncate">{item.label}</span>
                    <span className="block type-meta text-ink-muted type-truncate">
                      {item.group ? `${item.group} · ` : ""}
                      {item.path}
                    </span>
                  </span>
                  {i === active ? <CornerDownLeft className="w-3.5 h-3.5 text-ink-muted shrink-0" /> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 py-2 border-t border-divider type-mono-micro text-ink-muted">
          Navigate with ↑ ↓ · Enter to open · Esc to close
        </div>
      </div>
    </div>
  );
}
