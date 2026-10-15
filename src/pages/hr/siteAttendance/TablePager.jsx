import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TinySelect } from "../../adminOperations/components/AdminUi";

const PAGE_SIZES = [25, 50, 100];

function pageWindow(page, pages) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  const list = [];
  for (let n = start; n <= end; n += 1) list.push(n);
  return list;
}

export default function TablePager({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(total, page * pageSize);
  const btn =
    "h-8 min-w-8 px-2 rounded-control border text-xs inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-divider">
      <div className="flex items-center gap-2 text-xs text-ink-secondary">
        <span>
          Showing <span className="font-medium text-ink">{first}–{last}</span> of{" "}
          <span className="font-medium text-ink">{total}</span>
        </span>
        <span className="text-ink-muted">·</span>
        <span>Rows</span>
        <TinySelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </TinySelect>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${btn} border-border bg-surface`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pageWindow(page, pages).map((n) => (
          <button
            key={n}
            type="button"
            className={`${btn} ${n === page ? "border-accent-border bg-accent-soft text-ink font-semibold" : "border-border bg-surface text-ink-secondary"}`}
            onClick={() => onPage(n)}
            aria-current={n === page ? "page" : undefined}
          >
            {n}
          </button>
        ))}
        <button type="button" className={`${btn} border-border bg-surface`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
