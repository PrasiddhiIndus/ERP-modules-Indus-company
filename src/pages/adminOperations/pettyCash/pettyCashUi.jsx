/**
 * Small presentational pieces shared by the Petty Cash pages so the Dashboard,
 * Overhead & Expense Master and Daily Expense Entry read as one module.
 * Built on the ERP theme tokens (bg-surface, border-border, text-ink-*, accent).
 */
import React from "react";
import { Search } from "lucide-react";

/** Standard input / select sizing for Petty Cash forms and filters. */
export const PC_INPUT = "erp-input h-10 w-full px-3 text-[13px]";
export const PC_INPUT_ERROR = "erp-input-error";
/** Larger, easier-to-read button sizing applied on top of PrimaryButton / SecondaryButton. */
export const PC_BTN = "!h-9 !px-4 !py-0 !text-[13px] whitespace-nowrap";

export function Panel({ title, subtitle, right, children, className = "", bodyClassName = "", headerClassName = "" }) {
  return (
    <section
      className={`flex min-w-0 flex-col rounded-card border border-border/80 bg-surface shadow-card ${className}`.trim()}
    >
      {title || right ? (
        <header
          className={`flex flex-wrap items-start justify-between gap-3 border-b border-divider px-4 py-3.5 sm:px-5 ${headerClassName}`.trim()}
        >
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold leading-snug text-ink-strong">{title}</h2> : null}
            {subtitle ? <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">{subtitle}</p> : null}
          </div>
          {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
        </header>
      ) : null}
      <div className={`min-w-0 flex-1 p-4 sm:p-5 ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}

export function SearchInput({ value, onChange, placeholder, className = "", label }) {
  return (
    <label className={`relative block ${className}`.trim()}>
      <span className="sr-only">{label || placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="erp-input h-10 w-full pl-9 pr-3 text-[13px]"
      />
    </label>
  );
}

export function IconButton({ title, onClick, tone = "default", children }) {
  const toneClass =
    tone === "danger"
      ? "text-ink-muted hover:text-critical hover:bg-critical-soft"
      : "text-ink-muted hover:text-accent hover:bg-accent-soft";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-control transition-colors focus-visible:shadow-focus focus-visible:outline-none ${toneClass}`}
    >
      {children}
    </button>
  );
}

/** Two-or-more option toggle (e.g. "This overhead | All mappings"). */
export function SegmentedToggle({ value, onChange, options, ariaLabel }) {
  return (
    <div className="inline-flex rounded-control border border-border bg-surface-sunken p-0.5" role="tablist" aria-label={ariaLabel}>
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`rounded-[calc(var(--radius-control)-2px)] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors ${
            value === key ? "bg-surface text-accent shadow-sm" : "text-ink-secondary hover:text-ink"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Stat tile used on the master page (counts, not money). */
export function StatTile({ icon: Icon, label, value, hint, tone = "default" }) {
  const iconTone =
    tone === "warning" ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent";
  return (
    <div
      className={`flex items-center gap-3.5 rounded-card border bg-surface px-4 py-3.5 shadow-card ${
        tone === "warning" ? "border-warning-border" : "border-border/80"
      }`}
    >
      {Icon ? (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconTone}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink-muted">{label}</p>
        <p className="mt-0.5 text-[22px] font-semibold leading-tight tabular-nums text-ink-strong">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-[12px] text-ink-secondary">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Scroll wrapper for data tables so wide tables never push the page sideways. */
export function TableWrap({ children, minWidth = 560 }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="overflow-hidden rounded-card border border-border" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}
