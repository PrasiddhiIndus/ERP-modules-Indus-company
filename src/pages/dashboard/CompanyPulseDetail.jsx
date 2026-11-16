import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Modal, StatusChip, TinyInput, TinySelect, PaginationBar } from "../../components/erpUi";
import { COLUMN_PRESETS, DETAIL_FETCH_CAP, loadPulseDetailRows } from "./pulseDetailData";

export const PULSE_POPUP_ROW_CAP = DETAIL_FETCH_CAP;
const DEFAULT_PAGE_SIZE = 10;

const SEVERITY = {
  risk: "critical",
  watch: "warning",
  info: "info",
  ok: "neutral",
  critical: "critical",
  warning: "warning",
};

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (/loss|absent|critical|reject|overdue|outstanding|unpaid|risk/.test(s)) return "critical";
  if (/pending|late|thin|watch|due|waiting/.test(s)) return "warning";
  if (/paid|ok|approved|active|steady/.test(s)) return "neutral";
  return "info";
}

/**
 * In-page detail with live data rows (not just redirect links).
 */
export default function CompanyPulseDetail({ detail, dataCtx, onClose, onOpen }) {
  const open = Boolean(detail);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [liveRows, setLiveRows] = useState([]);
  const [columnsKey, setColumnsKey] = useState("generic");
  const [emptyHint, setEmptyHint] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);
  const dataCtxRef = useRef(dataCtx);
  dataCtxRef.current = dataCtx;

  useEffect(() => {
    if (!open || !detail) return;
    setSearch("");
    setSortBy("default");
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
    setLiveRows(detail.rows || []);
    setColumnsKey("generic");
    setEmptyHint("");
    let cancelled = false;
    setLoadingRows(true);
    loadPulseDetailRows(detail, dataCtxRef.current || {})
      .then((result) => {
        if (cancelled) return;
        setLiveRows(result.rows || []);
        setColumnsKey(result.columns || "generic");
        setEmptyHint(result.emptyHint || "");
      })
      .catch((err) => {
        console.warn("[CompanyPulseDetail] load rows", err);
        if (!cancelled) {
          setLiveRows(detail.rows || []);
          setEmptyHint("Could not load records. Open the module for the full list.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, detail?.id, detail?.fetchKey]);

  const columns = COLUMN_PRESETS[columnsKey] || COLUMN_PRESETS.generic;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let rows = [...liveRows];
    if (needle) {
      rows = rows.filter((row) => {
        const hay = [row.label, row.value, row.meta, row.status, row.path].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      });
    }
    if (sortBy === "label") {
      rows.sort((a, b) => String(a.label || "").localeCompare(String(b.label || "")));
    } else if (sortBy === "value") {
      rows.sort((a, b) => {
        if (Number.isFinite(a.amount) && Number.isFinite(b.amount)) return (b.amount || 0) - (a.amount || 0);
        return String(b.value || "").localeCompare(String(a.value || ""), undefined, { numeric: true });
      });
    } else if (sortBy === "status") {
      rows.sort((a, b) => String(a.status || "").localeCompare(String(b.status || "")));
    } else if (sortBy === "date") {
      rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }
    return rows;
  }, [liveRows, search, sortBy]);

  const capped = filtered.slice(0, PULSE_POPUP_ROW_CAP);
  const truncated = filtered.length > PULSE_POPUP_ROW_CAP;
  const totalPages = Math.max(1, Math.ceil(capped.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = capped.slice((safePage - 1) * pageSize, safePage * pageSize);

  const primaryAction = detail?.actions?.[0] || null;
  const moreActions = (detail?.actions || []).slice(1);

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="type-meta text-ink-muted">
        {loadingRows
          ? "Loading records…"
          : liveRows.length
            ? truncated
              ? `Showing first ${PULSE_POPUP_ROW_CAP} of ${filtered.length}. Open the module for the rest.`
              : `${filtered.length} record${filtered.length === 1 ? "" : "s"}`
            : "No breakout rows"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="erp-btn-secondary h-9 px-3" onClick={onClose}>
          Close
        </button>
        {primaryAction?.path ? (
          <button
            type="button"
            className="erp-btn-primary h-9 px-3 inline-flex items-center gap-1.5"
            onClick={() => {
              onOpen?.(primaryAction.path);
              onClose?.();
            }}
          >
            {truncated ? "View rest in module" : primaryAction.label}
            <ArrowUpRight size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <Modal open={open} title={detail?.title || "Detail"} onClose={onClose} footer={footer} widthClass="max-w-4xl">
      {!detail ? null : (
        <div className="cp-detail space-y-4">
          {detail.subtitle ? <p className="type-meta text-ink-secondary -mt-1">{detail.subtitle}</p> : null}

          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-3">
            {detail.headline ? (
              <div className="rounded-xl border border-border bg-surface-sunken px-4 py-3">
                <p className="type-mono-caption text-ink-muted uppercase tracking-wide">{detail.headline.label}</p>
                <p className="type-figure text-ink-strong mt-1 tabular-nums">{detail.headline.value}</p>
              </div>
            ) : (
              <div />
            )}
            {detail.metrics?.length ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {detail.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-border bg-surface px-3 py-2.5">
                    <p className="type-mono-caption text-ink-muted">{metric.label}</p>
                    <p className="type-body-medium text-ink-strong mt-1 tabular-nums">{metric.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {detail.attention?.length ? (
            <div className="flex flex-wrap gap-2">
              {detail.attention.map((item) => (
                <StatusChip
                  key={`${item.label}:${item.value}`}
                  label={`${item.label}: ${item.value}`}
                  severity={SEVERITY[item.severity] || "warning"}
                />
              ))}
            </div>
          ) : null}

          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h5 className="type-mono-caption text-ink-muted uppercase tracking-wide">Records</h5>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-0.5 min-w-[160px]">
                  <label className="text-[10px] font-semibold text-ink-muted uppercase">Search</label>
                  <TinyInput
                    placeholder="Name, status, amount…"
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
                    className="min-w-[120px]"
                  >
                    <option value="default">Default</option>
                    <option value="label">Name</option>
                    <option value="value">Value</option>
                    <option value="status">Status</option>
                    <option value="date">Date</option>
                  </TinySelect>
                </div>
              </div>
            </div>

            {loadingRows ? (
              <div className="flex items-center justify-center gap-2 py-12 type-meta text-ink-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading live records…
              </div>
            ) : pageRows.length === 0 ? (
              <p className="py-8 text-center type-meta text-ink-muted">
                {emptyHint || (search ? "No rows match this search." : "No records for this view yet.")}
              </p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-[min(48vh,26rem)]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-raised border-b border-border">
                      <tr>
                        {columns.map((col) => (
                          <th
                            key={col.key}
                            className="text-left font-semibold text-ink-muted px-3 py-2 whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((row, idx) => (
                        <tr
                          key={row.id || `${row.label}-${idx}`}
                          className="border-b border-divider last:border-0 hover:bg-row-hover"
                        >
                          {columns.map((col) => (
                            <td key={col.key} className="px-3 py-2.5 align-top text-ink">
                              {col.key === "status" && row.status ? (
                                <StatusChip label={row.status} severity={statusTone(row.status)} />
                              ) : col.key === "label" ? (
                                <span className="font-medium text-ink-strong">{row.label}</span>
                              ) : col.key === "value" ? (
                                <span className="tabular-nums font-semibold">{row.value ?? "—"}</span>
                              ) : (
                                <span className="text-ink-secondary">{row[col.key] ?? "—"}</span>
                              )}
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
          </section>

          {moreActions.length ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {moreActions.map((action) =>
                action.path ? (
                  <button
                    key={`${action.label}:${action.path}`}
                    type="button"
                    className="erp-btn-secondary h-8 px-2.5 text-xs inline-flex items-center gap-1"
                    onClick={() => {
                      onOpen?.(action.path);
                      onClose?.();
                    }}
                  >
                    {action.label}
                    <ArrowUpRight size={12} />
                  </button>
                ) : null
              )}
            </div>
          ) : null}

          {detail.note ? <p className="type-meta text-ink-secondary">{detail.note}</p> : null}
        </div>
      )}
    </Modal>
  );
}
