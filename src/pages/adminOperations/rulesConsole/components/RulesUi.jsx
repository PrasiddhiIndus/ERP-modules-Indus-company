import React, { useEffect, useId, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { InlineAlert } from "../../components/AdminUi";

/**
 * Same look as AdminUi `Drawer`, plus dialog semantics: role, Escape to close, labelled close
 * button, initial focus and focus return.
 */
export function RulesDrawer({ open, title, subtitle, onClose, children, footer, widthClass = "max-w-xl" }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (panel && !panel.contains(document.activeElement)) panel.focus();
    }, 0);
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative ml-auto h-full w-full ${widthClass} bg-surface shadow-modal border-l border-border flex flex-col outline-none`}
      >
        <div className="erp-card-header border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="type-card-title text-ink">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-xs text-ink-secondary">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded p-1 text-ink-secondary hover:bg-surface-sunken hover:text-ink ${focusRing}`}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto erp-card-body text-sm">{children}</div>
        {footer ? <div className="erp-card-header border-t border-border bg-surface-raised">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Loading / error / empty wrapper for every list in the console. */
export function ListState({ status, error, onRetry, isEmpty, emptyText = "Nothing to show.", emptyAction, children }) {
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-xs text-ink-secondary" role="status">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Loading…
      </div>
    );
  }
  if (status === "error") {
    return (
      <InlineAlert tone="error">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{error || "Something went wrong while loading."}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className={btnSecondary}>
              Try again
            </button>
          ) : null}
        </div>
      </InlineAlert>
    );
  }
  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-xs text-ink-secondary">
        <p>{emptyText}</p>
        {emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
      </div>
    );
  }
  return children;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1";

export const btnPrimary = `inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-control bg-accent text-white text-xs font-semibold hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;
export const btnSecondary = `inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-control border border-border-strong bg-surface text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;
export const btnGhost = `inline-flex items-center justify-center gap-1 h-8 px-2 rounded-control text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-50 ${focusRing}`;
export const btnDanger = `inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-control border border-critical-border text-xs font-medium text-critical hover:bg-critical-soft disabled:opacity-50 ${focusRing}`;
export const inputClass = `h-9 w-full rounded-control border border-border-strong bg-surface px-2.5 text-xs text-ink placeholder:text-ink-muted disabled:bg-surface-sunken disabled:text-ink-secondary ${focusRing}`;
export const focusRingClass = focusRing;

/** Labelled form field with error text wired to aria-describedby. */
export function Field({ id, label, hint, error, required, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[11px] font-semibold text-ink-secondary">
        {label}
        {required ? <span className="text-critical"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-[11px] text-ink-secondary">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-[11px] text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id, error, hint) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}