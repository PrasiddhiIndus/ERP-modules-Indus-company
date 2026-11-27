/**
 * Sites management — one task: find a site and open it, or maintain the site list.
 *
 * Extracted from SiteLedgerApp.jsx (SitesTable). Same callbacks (openSite, goEntry/onEdit,
 * activate / deactivate / delete …); summary columns by default with secondary actions in a
 * dialog so the grid stays readable. Client-side pagination (25 rows by default).
 */
import React, { useState, useMemo, useEffect } from "react";
import {
  Building2, CheckCircle, XCircle, FileCheck, Clock, AlertTriangle, Plus, Eye, Pencil,
  Sliders, MoreVertical, History, Copy, Trash2, Power,
} from "lucide-react";
import {
  KpiTile,
  FilterBar,
  DenseTable,
  EmptyState,
  Modal,
  PaginationBar,
  PrimaryButton,
  CollapsibleHelp,
  StatusChip,
} from "../../../../components/erpUi";
import { SiteClientAutocomplete } from "../../components/SiteClientAutocomplete";
import { toast } from "../../../../lib/toast";
import { confirmDialog } from "../../../../lib/dialog";
import { comparePeriodKeys } from "../../lib/periods";
import { isSiteActive, versionLabel, pendingMonths } from "../domain/siteLifecycle.js";
import { inr, pct } from "../domain/formatMoney.js";
import {
  usePlMargins,
  StatusPill,
  PendingMonthsCell,
  SiteLedgerPageStyles,
  monthLabelOf,
} from "../components/SiteLedgerShared.jsx";

export const SITES_FILTERS_INIT = { status: "all", financial: "all", siteType: "all" };
export const SITES_PAGE_SIZE = 25;

export function siteTypeText(site) {
  if (site.siteType === "shutdown") return "Shutdown";
  if (site.siteType === "safety") return "Safety";
  if (site.siteType === "fire") return "Fire";
  return "Regular";
}

/** Latest period key with figures entered, per site id (single pass over records). */
function latestPeriodBySite(records) {
  const latest = new Map();
  Object.keys(records || {}).forEach((key) => {
    const i = key.lastIndexOf("__");
    if (i < 0) return;
    const id = key.slice(0, i);
    const mk = key.slice(i + 2);
    const cur = latest.get(id);
    if (!cur || comparePeriodKeys(mk, cur) > 0) latest.set(id, mk);
  });
  return latest;
}

export default function SitesManagement({
  rows, records, month, sitesAll, activeSiteCount, query, setQuery,
  showHistorical, setShowHistorical, inactiveCount,
  openSite, onEdit, onEditSite, onConfig, onDelete, onDeactivate, onActivate, onViewHistory, onAdd, mLabel,
}) {
  const { warnMargin } = usePlMargins();
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [filters, setFilters] = useState(SITES_FILTERS_INIT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SITES_PAGE_SIZE);
  const [moreSite, setMoreSite] = useState(null);

  /* Completeness is read many times (KPIs, filter, sort) — compute once per row. */
  const enriched = useMemo(() => {
    const latest = latestPeriodBySite(records);
    return rows.map((r) => ({
      ...r,
      pendingN: pendingMonths(r, records, month).length,
      lastPeriod: latest.get(r.id) || null,
    }));
  }, [rows, records, month]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    let list = enriched.filter(
      (r) =>
        !q
        || r.name.toLowerCase().includes(q)
        || (r.ocNumber || "").toLowerCase().includes(q)
        || (r.wo || "").toLowerCase().includes(q)
        || (r.client || "").toLowerCase().includes(q),
    );
    if (filters.status === "active") list = list.filter((r) => isSiteActive(r));
    if (filters.status === "inactive") list = list.filter((r) => !isSiteActive(r));
    if (filters.siteType === "regular") list = list.filter((r) => r.siteType !== "shutdown");
    if (filters.siteType === "shutdown") list = list.filter((r) => r.siteType === "shutdown");
    if (filters.financial === "completed") list = list.filter((r) => r.pendingN === 0);
    if (filters.financial === "pending") list = list.filter((r) => r.pendingN > 0);
    if (filters.financial === "loss") list = list.filter((r) => r.hasData && r.profit < 0);
    if (filters.financial === "thin") list = list.filter((r) => r.hasData && r.profit >= 0 && r.margin < warnMargin);
    return list;
  }, [enriched, query, filters, warnMargin]);

  const totalSites = sitesAll.length;
  const inactiveSites = inactiveCount ?? (totalSites - activeSiteCount);
  const dataCompleted = enriched.filter((r) => r.pendingN === 0).length;
  const dataPending = enriched.filter((r) => r.pendingN > 0).length;
  const overdueLoss = enriched.filter((r) => r.hasData && r.profit < 0).length;
  const completedPct = enriched.length ? Math.round((dataCompleted / enriched.length) * 100) : 0;
  const pendingPct = enriched.length ? Math.round((dataPending / enriched.length) * 100) : 0;

  const sorted = useMemo(() => {
    const m = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return m * a.name.localeCompare(b.name);
      if (sort.key === "pendingCount") return m * (a.pendingN - b.pendingN);
      return m * ((a[sort.key] || 0) - (b[sort.key] || 0));
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [query]);

  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const setS = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const hasActiveFilters = filters.status !== "all" || filters.financial !== "all" || filters.siteType !== "all" || !!query;

  const copySiteSummary = (r) => {
    const pend = pendingMonths(r, records, month).map(monthLabelOf).join(", ");
    const line = [
      r.name,
      r.service || "",
      r.contractStart ? `${monthLabelOf(r.contractStart)} - ${monthLabelOf(r.contractEnd)}` : "",
      inr(r.revenue),
      inr(r.profit),
      pend ? `Pending: ${pend}` : "Complete",
    ].join("\t");
    void navigator.clipboard?.writeText(line);
    toast.success("Summary copied", r.name);
  };

  const confirmDelete = async (r) => {
    if (!(await confirmDialog({ title: "Delete site", message: `Delete "${r.name}" (${versionLabel(r)}) and all its data?`, confirmLabel: "Delete", tone: "danger" }))) return;
    setMoreSite(null);
    await onDelete(r.id);
  };

  const sortHeader = (key, label, align) => () => (
    <button type="button" className="slp-sort-btn" style={align === "r" ? { width: "100%", textAlign: "right" } : undefined} onClick={() => setS(key)}>
      {label}{sort.key === key ? (sort.dir === "desc" ? " ▾" : " ▴") : ""}
    </button>
  );

  const columns = [
    {
      key: "code",
      label: "Code",
      headerTitle: "Order / client code",
      cellClassName: "mono text-ink-secondary",
      render: (r) => r.ocNumber || r.wo || "—",
    },
    {
      key: "name",
      label: "Site",
      headerRender: sortHeader("name", "Site"),
      render: (r) => (
        <button type="button" className="slp-site-link" onClick={() => openSite(r.id)}>{r.name}</button>
      ),
    },
    {
      key: "contract",
      label: "Contract",
      cellClassName: "mono text-ink-secondary",
      render: (r) => (r.contractStart ? `${monthLabelOf(r.contractStart)} – ${monthLabelOf(r.contractEnd)}` : "—"),
    },
    { key: "type", label: "Type", cellClassName: "text-ink-secondary", render: (r) => siteTypeText(r) },
    {
      key: "version",
      label: "Version",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="sm-ver">{versionLabel(r)}</span>
          {!isSiteActive(r) && <StatusChip label="Inactive" severity="neutral" />}
        </span>
      ),
    },
    {
      key: "revenue",
      label: "Revenue",
      headerRender: sortHeader("revenue", "Revenue (₹)", "r"),
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => inr(r.revenue),
    },
    {
      key: "expense",
      label: "Expenses",
      headerRender: sortHeader("expense", "Expenses (₹)", "r"),
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => inr(r.expense),
    },
    {
      key: "profit",
      label: "Profit",
      headerRender: sortHeader("profit", "Profit (₹)", "r"),
      headerClassName: "text-right",
      cellClassName: "text-right mono",
      render: (r) => <span style={{ color: r.profit < 0 ? "var(--loss)" : "var(--ink)" }}>{inr(r.profit)}</span>,
    },
    {
      key: "margin",
      label: "Margin",
      headerRender: sortHeader("margin", "Margin (%)", "r"),
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="mono" style={{ color: r.margin < 0 ? "var(--loss)" : r.margin < warnMargin ? "var(--warn)" : "var(--ink)" }}>{pct(r.margin)}</span>
          {r.hasData ? <StatusPill margin={r.margin} profit={r.profit} /> : null}
        </span>
      ),
    },
    {
      key: "completeness",
      label: "Last update / completeness",
      headerRender: sortHeader("pendingCount", "Last update / completeness"),
      cellClassName: "max-w-[280px]",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="type-meta text-ink-muted">{r.lastPeriod ? `Figures to ${monthLabelOf(r.lastPeriod)}` : "No figures yet"}</span>
          <PendingMonthsCell site={r} records={records} uptoMk={month} />
        </div>
      ),
    },
    {
      key: "draft",
      label: "Draft / conflict",
      headerTitle: "Unsaved drafts and save conflicts will show here",
      cellClassName: "text-ink-muted text-center",
      render: () => "—",
    },
    {
      key: "actions",
      label: "Actions",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (r) => (
        <span className="slp-row-actions sm-actions">
          <button type="button" className="sm-act" title="View" onClick={() => openSite(r.id)}><Eye size={15} /></button>
          {isSiteActive(r) && (
            <button type="button" className="sm-act" title="Enter figures" onClick={() => onEdit(r.id)}><Pencil size={15} /></button>
          )}
          <button type="button" className="sm-act" title="Edit site details" onClick={() => onEditSite(r.id)}><Sliders size={15} /></button>
          <button type="button" className="sm-act" title="More actions" onClick={() => setMoreSite(r)}><MoreVertical size={15} /></button>
        </span>
      ),
    },
  ];

  const moreActive = moreSite ? isSiteActive(moreSite) : false;

  return (
    <div className="slp-stack">
      <SiteLedgerPageStyles />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-meta text-ink-secondary">Find a site, open its workspace, or keep the list up to date.</p>
        <PrimaryButton icon={Plus} onClick={onAdd}>Add site</PrimaryButton>
      </div>

      <div className="slp-kpis">
        <KpiTile label="Total sites" value={<span className="inline-flex items-center gap-2"><Building2 size={16} />{totalSites}</span>} sub="All locations" onClick={() => setF({ status: "all", financial: "all" })} />
        <KpiTile label="Active sites" value={<span className="inline-flex items-center gap-2 slp-tone-profit"><CheckCircle size={16} />{activeSiteCount}</span>} sub="Active locations" onClick={() => setF({ status: "active" })} />
        <KpiTile label="Inactive sites" value={<span className="inline-flex items-center gap-2"><XCircle size={16} />{inactiveSites}</span>} sub="Inactive locations" onClick={() => { setShowHistorical(true); setF({ status: "inactive" }); }} />
        <KpiTile label="Data complete" value={<span className="inline-flex items-center gap-2 slp-tone-profit"><FileCheck size={16} />{dataCompleted}</span>} sub={`${completedPct}% of listed`} onClick={() => setF({ financial: "completed" })} />
        <KpiTile label="Data pending" value={<span className="inline-flex items-center gap-2 slp-tone-warn"><Clock size={16} />{dataPending}</span>} sub={`${pendingPct}% of listed`} onClick={() => setF({ financial: "pending" })} />
        <KpiTile label="Loss-making" value={<span className="inline-flex items-center gap-2 slp-tone-loss"><AlertTriangle size={16} />{overdueLoss}</span>} sub="Need attention" onClick={() => setF({ financial: "loss" })} />
      </div>

      <FilterBar>
        <div className="slp-filters">
          <div className="ov-filter ov-filter-ac slp-span-2">
            <SiteClientAutocomplete
              sites={rows}
              value=""
              filterQuery={query}
              onChange={(id) => {
                const site = rows.find((s) => s.id === id);
                if (site) setQuery(site.name);
              }}
              onSearchChange={(q) => setQuery(q)}
              label="Search site / client"
              id="sites-master-search"
              placeholder="Type site, client or code…"
            />
          </div>
          <label className="ov-filter">
            <span>Status</span>
            <select value={filters.status} onChange={(e) => setF({ status: e.target.value })}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="ov-filter">
            <span>Site type</span>
            <select value={filters.siteType} onChange={(e) => setF({ siteType: e.target.value })}>
              <option value="all">All</option>
              <option value="regular">Regular</option>
              <option value="shutdown">Shutdown</option>
            </select>
          </label>
          <label className="ov-filter">
            <span>Financial status</span>
            <select value={filters.financial} onChange={(e) => setF({ financial: e.target.value })}>
              <option value="all">All</option>
              <option value="completed">Data completed</option>
              <option value="pending">Data pending</option>
              <option value="loss">Loss-making</option>
              <option value="thin">Thin margin</option>
            </select>
          </label>
          <div className="slp-filters-foot">
            <button
              type="button"
              className={"hist-scope-btn" + (showHistorical ? " on" : "")}
              onClick={() => setShowHistorical((v) => !v)}
            >
              <History size={13} />
              {showHistorical ? "Hide inactive" : `Show inactive${inactiveCount ? ` (${inactiveCount})` : ""}`}
            </button>
            {hasActiveFilters && (
              <button type="button" className="ghost-d" onClick={() => { setFilters(SITES_FILTERS_INIT); setQuery(""); setPage(1); }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      </FilterBar>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No sites match your filters"
          message="Try a different search or clear the filters."
          action={hasActiveFilters ? (
            <button type="button" className="ghost-d" onClick={() => { setFilters(SITES_FILTERS_INIT); setQuery(""); setPage(1); }}>Clear filters</button>
          ) : null}
        />
      ) : (
        <div>
          <DenseTable
            columns={columns}
            rows={pageRows}
            rowKey="id"
            showSerialNumber
            serialLabel="#"
            serialOffset={(safePage - 1) * pageSize}
            density="comfortable"
          />
          <PaginationBar
            page={safePage}
            pageSize={pageSize}
            total={sorted.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            pageSizeOptions={[10, 25, 50]}
          />
        </div>
      )}

      <CollapsibleHelp label="pending-months guide">
        <ul className="space-y-1">
          <li><span className="sm-pend sm-pend-ok">0</span> All data completed</li>
          <li><span className="sm-pend sm-pend-low">1–3</span> Low pending</li>
          <li><span className="sm-pend sm-pend-med">4–6</span> Medium pending</li>
          <li><span className="sm-pend sm-pend-high">7+</span> High pending</li>
        </ul>
        <p className="mt-2">
          Pending months are counted from <b>Apr-26</b> onward, up to the selected period (<b>{mLabel}</b>). Earlier months are not counted.
        </p>
      </CollapsibleHelp>

      <Modal
        open={!!moreSite}
        title={moreSite ? `${moreSite.name} · ${versionLabel(moreSite)}` : ""}
        onClose={() => setMoreSite(null)}
        widthClass="max-w-sm"
      >
        {moreSite && (
          <div className="slp-more-list">
            <button type="button" onClick={() => { onViewHistory(moreSite.siteGroup); setMoreSite(null); }}><History size={14} /> Version history</button>
            {moreActive && (
              <button type="button" onClick={() => { onConfig(moreSite.id); setMoreSite(null); }}><Sliders size={14} /> Site setup</button>
            )}
            <button type="button" onClick={() => { copySiteSummary(moreSite); setMoreSite(null); }}><Copy size={14} /> Copy summary</button>
            {moreActive ? (
              <button type="button" onClick={() => { onDeactivate(moreSite.id); setMoreSite(null); }}><Power size={14} /> Make inactive</button>
            ) : (
              <button type="button" onClick={() => { onActivate(moreSite.id); setMoreSite(null); }}><CheckCircle size={14} /> Make active</button>
            )}
            <button type="button" className="danger" onClick={() => confirmDelete(moreSite)}><Trash2 size={14} /> Delete site</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
