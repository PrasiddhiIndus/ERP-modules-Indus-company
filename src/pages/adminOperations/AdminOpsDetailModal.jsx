import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Modal, StatusChip, TinyInput, TinySelect, PaginationBar } from "../../components/erpUi";

export const POPUP_ROW_CAP = 50;
const DEFAULT_PAGE_SIZE = 10;

function statusLabel(severity) {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Needs attention";
  return "Info";
}

/**
 * In-page detail for admin dashboard tiles.
 * Caps rows at POPUP_ROW_CAP; offers full-page link when more exist.
 */
export default function AdminOpsDetailModal({ open, spec, onClose, onOpenPage, canOpenPage }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(spec?.defaultSort || "priority");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSortBy(spec?.defaultSort || "priority");
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
  }, [open, spec?.id, spec?.defaultSort]);

  const columns = spec?.columns || [];
  const sortOptions = spec?.sortOptions || [
    { value: "priority", label: "Priority" },
    { value: "name", label: "Name" },
  ];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = [...(spec?.rows || [])];
    if (needle) {
      rows = rows.filter((row) => {
        const hay = [
          row.person,
          row.employeeName,
          row.name,
          row.empCode,
          row.department,
          row.detail,
          row.title,
          row.type,
          row.fullName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }

    const sorter = spec?.sortFn;
    if (typeof sorter === "function") {
      rows.sort((a, b) => sorter(a, b, sortBy));
    } else {
      rows.sort((a, b) => {
        if (sortBy === "name") {
          return String(a.person || a.employeeName || a.name || "").localeCompare(
            String(b.person || b.employeeName || b.name || "")
          );
        }
        if (sortBy === "department") {
          return String(a.department || "").localeCompare(String(b.department || ""));
        }
        if (sortBy === "due") return String(a.due || "").localeCompare(String(b.due || ""));
        if (sortBy === "late") return (b.lateRate || 0) - (a.lateRate || 0);
        if (sortBy === "ot") return (b.otRate || 0) - (a.otRate || 0);
        if (sortBy === "value") return (b.value || b.late || b.ot || 0) - (a.value || a.late || a.ot || 0);
        const rank = (s) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
        return rank(a.severity) - rank(b.severity);
      });
    }
    return rows;
  }, [search, sortBy, spec]);

  const capped = filtered.slice(0, POPUP_ROW_CAP);
  const truncated = filtered.length > POPUP_ROW_CAP;
  const totalPages = Math.max(1, Math.ceil(capped.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = capped.slice((safePage - 1) * pageSize, safePage * pageSize);

  if (!open || !spec) return null;

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="type-meta text-ink-muted">
        {truncated
          ? `Showing first ${POPUP_ROW_CAP} of ${filtered.length}. Open the full page for the rest.`
          : `${filtered.length} record${filtered.length === 1 ? "" : "s"}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="erp-btn-secondary h-9 px-3" onClick={onClose}>
          Close
        </button>
        {/* Offer the page only when the user may open it. */}
        {spec.pagePath && (!canOpenPage || canOpenPage(spec.pagePath)) ? (
          <button
            type="button"
            className="erp-btn-primary h-9 px-3 inline-flex items-center gap-1.5"
            onClick={() => {
              onOpenPage?.(spec.pagePath);
              onClose?.();
            }}
          >
            {truncated ? "View all on page" : spec.pageLabel || "Open full page"}
            <ArrowUpRight size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Modal open={open} title={spec.title} onClose={onClose} footer={footer} widthClass="max-w-3xl">
      <div className="space-y-4">
        {spec.subtitle ? <p className="type-meta text-ink-secondary -mt-1">{spec.subtitle}</p> : null}

        {spec.summary?.length ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {spec.summary.map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
                <p className="type-mono-caption text-ink-muted">{item.label}</p>
                <p className="type-body-medium text-ink-strong mt-1 tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {spec.attention?.length ? (
          <div className="flex flex-wrap gap-2">
            {spec.attention.map((item) => (
              <StatusChip
                key={`${item.label}:${item.value}`}
                label={`${item.label}: ${item.value}`}
                severity={item.severity === "critical" ? "critical" : item.severity === "warning" ? "warning" : "info"}
              />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5 min-w-[180px] flex-1">
            <label className="text-[10px] font-semibold text-ink-muted uppercase">Search</label>
            <TinyInput
              placeholder="Name, code, department…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-ink-muted uppercase">Sort</label>
            <TinySelect
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
              className="min-w-[140px]"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </TinySelect>
          </div>
        </div>

        {pageRows.length === 0 ? (
          <p className="py-8 text-center type-meta text-ink-muted">No rows match this search.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto max-h-[min(50vh,28rem)]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-raised border-b border-border">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} className="text-left font-semibold text-ink-muted px-3 py-2 whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => (
                    <tr key={row.id || row.empCode || `${safePage}-${idx}`} className="border-b border-divider last:border-0">
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2 align-top text-ink">
                          {col.render
                            ? col.render(row)
                            : col.key === "severity"
                              ? statusLabel(row.severity)
                              : row[col.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              pageSize={pageSize}
              total={capped.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              pageSizeOptions={[10, 25, 50]}
              className="border-t border-border px-3"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
