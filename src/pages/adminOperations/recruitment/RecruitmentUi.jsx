import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown, FileText, Inbox, Loader2, RefreshCw, Search, X } from "lucide-react";
import { Modal } from "../components/AdminUi";
import { toast } from "../../../lib/toast";
import { TONE_CLASSES, TONE_DOT } from "./recruitmentConfig";
import { RECRUITMENT_DATA_EVENT, getCapabilities, getFileUrl } from "./recruitmentService";

/** Load async data, re-run when the recruitment store changes. */
export function useRecruitmentData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      setData(await loaderRef.current());
    } catch (err) {
      console.error(err);
      setError(err?.message || "Something went wrong while loading this page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => reload({ silent: true });
    window.addEventListener(RECRUITMENT_DATA_EVENT, onChange);
    return () => window.removeEventListener(RECRUITMENT_DATA_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload };
}

export function StatusPill({ meta, size = "sm" }) {
  if (!meta) return <span className="text-ink-muted">—</span>;
  const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral;
  const pad = size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium ${pad} ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[meta.tone] || TONE_DOT.neutral}`} aria-hidden />
      {meta.label}
    </span>
  );
}

const AVATAR_TONES = ["bg-info-soft text-info", "bg-accent-soft text-accent-deep", "bg-success-soft text-success", "bg-warning-soft text-warning"];

export function Avatar({ name, size = "md" }) {
  const initials = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  const tone = AVATAR_TONES[(String(name || "").length || 0) % AVATAR_TONES.length];
  const dims = size === "lg" ? "h-14 w-14 text-lg" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dims} ${tone}`} aria-hidden>
      {initials}
    </span>
  );
}

export function LoadingState({ label = "Loading…", rows = 5 }) {
  return (
    <div role="status" aria-live="polite" className="space-y-2 py-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-md bg-surface-sunken" />
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", message, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <Icon className="h-8 w-8 text-ink-muted" aria-hidden />
      <p className="text-sm font-medium text-ink">{title}</p>
      {message ? <p className="max-w-sm text-xs text-ink-secondary">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 rounded-lg border border-critical-border bg-critical-soft px-6 py-8 text-center">
      <AlertTriangle className="h-7 w-7 text-critical" aria-hidden />
      <p className="text-sm font-medium text-critical">Could not load this view</p>
      <p className="max-w-md text-xs text-ink-secondary">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={`${btn.secondary} mt-1`}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
      ) : null}
    </div>
  );
}

/** Wraps a page body with consistent loading / error handling. */
export function AsyncBoundary({ loading, error, onRetry, children, rows }) {
  if (loading) return <LoadingState rows={rows} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return children;
}

export const btn = {
  primary:
    "inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-white hover:bg-accent-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:opacity-50",
  secondary:
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:opacity-50",
  ghost:
    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:opacity-50",
  danger:
    "inline-flex h-8 items-center gap-1.5 rounded-md bg-critical px-3 text-xs font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-critical-border disabled:opacity-50",
};

export function IconButton({ icon: Icon, label, onClick, tone = "default", disabled }) {
  const toneClass = tone === "danger" ? "text-critical hover:bg-critical-soft" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border disabled:opacity-40 ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…", className = "" }) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-7 text-xs text-ink placeholder:text-ink-muted focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent-soft"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

export function Field({ label, children, className = "" }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-8 w-full rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent-soft";

export function SelectField({ label, value, onChange, options, allLabel = "All", className = "" }) {
  return (
    <Field label={label} className={className}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {allLabel != null ? <option value="">{allLabel}</option> : null}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

/** Accessible tab list (arrow keys move focus/selection). */
export function Tabs({ tabs, value, onChange, ariaLabel }) {
  const refs = useRef([]);
  const onKeyDown = (e, idx) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-divider">
      {tabs.map((t, idx) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => (refs.current[idx] = el)}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border ${
              active ? "border-accent text-accent-deep" : "border-transparent text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
            {t.count != null ? (
              <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-accent-soft text-accent-deep" : "bg-surface-sunken text-ink-muted"}`}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedToggle({ options, value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-md border border-border bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border ${
              active ? "bg-accent text-white" : "text-ink-secondary hover:text-ink"
            }`}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, total, tone = "accent", showLabel = true }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", critical: "bg-critical" }[tone] || "bg-accent";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? <span className="shrink-0 text-[11px] tabular-nums text-ink-secondary">{value}/{total}</span> : null}
    </div>
  );
}

export function ReadinessIndicator({ readiness, compact = false }) {
  if (!readiness) return null;
  const tone = readiness.ready ? "success" : readiness.done >= readiness.total - 1 ? "warning" : "critical";
  const label = readiness.ready ? "Ready to join" : `${readiness.total - readiness.done} item${readiness.total - readiness.done === 1 ? "" : "s"} pending`;
  if (compact) {
    return (
      <span title={readiness.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}`).join("\n")}>
        <StatusPill meta={{ label, tone }} />
      </span>
    );
  }
  return (
    <div className="space-y-1.5">
      <StatusPill meta={{ label, tone }} />
      <ul className="space-y-0.5">
        {readiness.checks.map((c) => (
          <li key={c.key} className={`text-[11px] ${c.ok ? "text-success" : "text-ink-muted"}`}>
            {c.ok ? "✓" : "○"} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", tone = "primary", busy, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={tone === "danger" ? btn.danger : btn.primary} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-ink-secondary">{message}</p>
    </Modal>
  );
}

/**
 * Sortable, paginated table. Columns: { key, label, render?, sortValue?, className?, align? }.
 * Rows are keyboard-activatable when onRowClick is set.
 */
export function DataTable({ columns, rows, rowKey = "id", onRowClick, pageSize = 10, initialSort, emptyTitle, emptyMessage }) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [rows.length]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => r[col.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null || av === "") return 1;
      if (bv == null || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  if (!rows.length) return <EmptyState title={emptyTitle || "No records found"} message={emptyMessage || "Try changing the search or filters."} />;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="erp-table-exempt w-full min-w-max border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false && c.key !== "actions";
                const active = sort?.key === c.key;
                const Icon = active ? (sort.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`sticky top-0 z-10 border-b border-divider bg-surface-raised px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-secondary ${c.headerClassName || ""} ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {sortable ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink focus:outline-none focus-visible:underline">
                        {c.label}
                        <Icon className={`h-3 w-3 ${active ? "text-accent" : "text-ink-muted"}`} aria-hidden />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row[rowKey]}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={`${onRowClick ? "cursor-pointer focus:outline-none focus-visible:bg-accent-soft" : ""} hover:bg-row-hover`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`border-b border-divider px-3 py-2.5 align-middle text-ink ${c.className || ""} ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                  >
                    {c.render ? c.render(row) : row[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-secondary">
        <span>
          Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <button type="button" className={btn.ghost} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>
              Previous
            </button>
            <span className="px-1 tabular-nums">
              {safePage} / {pageCount}
            </span>
            <button type="button" className={btn.ghost} disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, tone = "neutral", onClick, icon: Icon }) {
  const accent = { neutral: "text-ink", info: "text-info", success: "text-success", warning: "text-warning", critical: "text-critical", accent: "text-accent" }[tone];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex w-full flex-col rounded-card border border-border bg-surface px-4 py-3 text-left shadow-card ${onClick ? "hover:border-accent-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border" : ""}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="type-mono-caption">{label}</span>
        {Icon ? <Icon className={`h-4 w-4 ${accent}`} aria-hidden /> : null}
      </span>
      <span className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</span>
      {sub ? <span className="mt-0.5 text-[11px] text-ink-muted">{sub}</span> : null}
    </Comp>
  );
}

export function Card({ title, right, children, className = "", bodyClassName = "p-4" }) {
  return (
    <section className={`rounded-card border border-border bg-surface shadow-card ${className}`}>
      {title ? (
        <header className="flex min-h-[44px] items-center justify-between gap-3 border-b border-divider px-4 py-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {right}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function DetailGrid({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] text-ink-muted">{label}</dt>
          <dd className="mt-0.5 break-words text-xs font-medium text-ink">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

export function fmtRelative(value) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(value);
}

export function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

export const textareaClass =
  "min-h-[72px] w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent-soft";

/** Current user's recruitment permissions (server-enforced; used only to hide unavailable actions). */
export function useCapabilities() {
  const [caps, setCaps] = useState({});
  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then((c) => !cancelled && setCaps(c || {}))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return caps;
}

/** Opens a stored candidate file through a short-lived secure link. */
export function FileButton({ candidateId, category, file, label, download = false, className }) {
  const [busy, setBusy] = useState(false);
  if (!file?.objectKey) return <span className="text-ink-muted">—</span>;
  const open = async (e) => {
    e.stopPropagation();
    const win = window.open("", "_blank");
    setBusy(true);
    try {
      const url = await getFileUrl(candidateId, category, file, { download });
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      win?.close();
      toast.error("Could not open file", err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={open} disabled={busy} className={className || btn.ghost} title={file.fileName}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      <span className="max-w-[180px] truncate">{label || file.fileName || "Open"}</span>
    </button>
  );
}

/**
 * Modal form for a single workflow action. `onSubmit` may throw; the message is shown inline and the
 * modal stays open so the user can correct and retry.
 */
export function ActionModal({ open, title, onClose, onSubmit, submitLabel = "Save", tone = "primary", children, widthClass, canSubmit = true, description }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = `recruitment-form-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    if (open) {
      setError("");
      setBusy(false);
    }
  }, [open]);
  const submit = async (e) => {
    e?.preventDefault();
    if (busy || !canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit();
    } catch (err) {
      setError(err?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => {} : onClose}
      widthClass={widthClass}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className={tone === "danger" ? btn.danger : btn.primary} disabled={busy || !canSubmit}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3">
        {description ? <p className="text-xs text-ink-secondary">{description}</p> : null}
        {children}
        {error ? (
          <p role="alert" className="rounded-md border border-critical-border bg-critical-soft px-2 py-1.5 text-[11px] text-critical">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/** Single required-reason action (reject, close, cancel, withdraw…). */
export function ReasonModal({ open, title, label = "Reason", description, submitLabel = "Confirm", tone = "danger", required = true, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <ActionModal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      submitLabel={submitLabel}
      tone={tone}
      canSubmit={!required || reason.trim().length > 0}
      onSubmit={() => onSubmit(reason.trim())}
    >
      <Field label={required ? `${label} *` : label}>
        <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </ActionModal>
  );
}

/** File picker limited to the formats the server accepts. */
export function FilePicker({ label = "File", onChange, required = true }) {
  return (
    <Field label={required ? `${label} *` : label}>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="block w-full text-xs text-ink file:mr-2 file:rounded-md file:border file:border-border file:bg-surface file:px-2 file:py-1 file:text-xs"
      />
      <span className="text-[10px] text-ink-muted">PDF, image or Word file, up to 25 MB.</span>
    </Field>
  );
}

/** Runs a quick action with toast feedback. */
export async function runAction(fn, successTitle, successMessage) {
  try {
    const out = await fn();
    if (successTitle) toast.success(successTitle, successMessage);
    return out;
  } catch (err) {
    toast.error("Action failed", err?.message || "Please try again.");
    return undefined;
  }
}
