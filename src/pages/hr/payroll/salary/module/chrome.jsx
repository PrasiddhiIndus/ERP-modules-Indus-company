import React from "react";
import { MONTHS, monthLabel } from "./model";
import { useSalaryModule } from "./SalaryModuleContext";

export const btnPrimary =
  "erp-btn-primary inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed";
export const btnGhost =
  "erp-btn-secondary inline-flex items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed";
export const btnSmall = "px-2.5 py-1.5 text-[11px]";
export const fieldClass = "erp-input h-9 w-full px-2.5 text-xs";
export const selectClass = "erp-input h-9 px-2.5 text-xs";

export function Tag({ children, tone = "muted" }) {
  const tones = {
    muted: "bg-surface-sunken text-ink-secondary",
    ok: "bg-success-soft text-success",
    warn: "bg-warning-soft text-warning",
    accent: "bg-accent-soft text-accent-deep",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone] || tones.muted}`}>
      {children}
    </span>
  );
}

export function PageHead({ title, subtitle, month = false, children }) {
  const { month: value, setMonth } = useSalaryModule();
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="type-page-title text-ink type-truncate">{title}</h1>
        {subtitle ? <p className="type-meta mt-1.5 max-w-3xl text-ink-secondary">{subtitle}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {month ? (
          <label className="inline-flex items-center gap-2 type-meta text-ink-secondary">
            Month
            <select className={selectClass} value={value} onChange={(event) => setMonth(event.target.value)}>
              {MONTHS.map((item) => (
                <option key={item} value={item}>
                  {monthLabel(item)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function Card({ title, action, children, className = "" }) {
  const framed = Boolean(title || action);
  return (
    <section className={`overflow-hidden rounded-card border border-border bg-surface shadow-card ${className}`}>
      {framed ? (
        <div className="erp-card-header flex min-h-[52px] items-center justify-between gap-3 border-b border-divider bg-surface-raised">
          {title ? <h2 className="type-card-title text-ink type-truncate">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className={framed ? "erp-card-body" : "px-4 py-3.5"}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3.5 text-left shadow-card">
      <p className="type-mono-caption">{label}</p>
      <p className="type-figure mt-1.5 text-ink">{value}</p>
    </div>
  );
}

export function DataTable({ children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, align = "left" }) {
  return (
    <th className={`border-b border-border px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function Td({ children, align = "left", className = "" }) {
  return (
    <td className={`border-b border-border px-2.5 py-2 align-middle text-ink ${align === "right" ? "text-right tabular-nums" : "text-left"} ${className}`}>
      {children}
    </td>
  );
}

export function AmountBars({ rows, tone = "accent" }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  const bar = tone === "warning" ? "bg-warning" : "bg-accent";
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-[11px] text-ink-secondary">{row.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-surface-sunken">
            <div
              className={`h-full min-w-[4px] rounded-full ${bar}`}
              style={{ width: `${Math.max((row.value / max) * 100, row.value ? 2 : 0)}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-[11px] text-ink-secondary">{row.display}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}
