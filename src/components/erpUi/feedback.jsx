import React from "react";
import { Link } from "react-router-dom";

export function Skeleton({ className = "", style }) {
  return (
    <div
      className={`animate-shimmer rounded-control bg-surface-sunken ${className}`.trim()}
      style={style}
      aria-hidden
    />
  );
}

export function LoadingBlock({ rows = 4, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`.trim()} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function Breadcrumbs({ items = [], className = "" }) {
  if (!items?.length) return null;
  return (
    <nav className={`flex flex-wrap items-center gap-1 type-meta text-ink-muted ${className}`.trim()} aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${i}`}>
            {i > 0 ? <span className="text-ink-disabled px-0.5">/</span> : null}
            {item.path && !last ? (
              <Link to={item.path} className="hover:text-accent font-medium transition-colors duration-theme">
                {item.label}
              </Link>
            ) : (
              <span className={last ? "text-ink font-medium" : undefined}>{item.label}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = "",
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 10)));
  const current = Math.min(Math.max(1, page || 1), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 px-1 py-2 type-meta text-ink-muted ${className}`.trim()}
    >
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 border border-border rounded-control px-2 bg-surface text-ink text-xs"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          disabled={current <= 1}
          onClick={() => onPageChange?.(current - 1)}
          className="erp-btn-secondary h-8 px-2.5 text-xs rounded-control disabled:opacity-40"
        >
          Prev
        </button>
        <span className="tabular-nums text-ink">
          {current} / {totalPages}
        </span>
        <button
          type="button"
          disabled={current >= totalPages}
          onClick={() => onPageChange?.(current + 1)}
          className="erp-btn-secondary h-8 px-2.5 text-xs rounded-control disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
