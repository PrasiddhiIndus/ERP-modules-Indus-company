import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { AlertTriangle, Download, RefreshCw, Search, UserCheck } from "lucide-react";
import {
  Badge,
  DenseTable,
  FilterBar,
  KpiTile,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../adminOperations/components/AdminUi";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { employeeCodeForUserId } from "../../lib/employeeCode";
import {
  LEAD_FILTERS,
  fetchPeopleDirectoryAll,
  fetchPeopleDirectoryPage,
  fetchPeopleDirectoryStats,
  fetchPeopleFilterOptions,
  formatPeopleDirectoryError,
} from "../../lib/peopleDirectoryApi";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import { toast } from "../../lib/toast";
import HrLeadsAssignModal from "./HrLeadsAssignModal";
import { useHrTeamLeads } from "./useHrTeamLeads";

const PAGE_SIZES = [25, 50, 100, 200];
const FILTER_STORAGE_KEY = "hr_people_master_filters";

const DEFAULT_FILTERS = {
  status: "active",
  siteId: "ALL",
  designation: "ALL",
  category: "ALL",
  lead: LEAD_FILTERS.ALL,
};

const EXPORT_COLUMNS = [
  ["unique_code", "Employee code"],
  ["full_name", "Name"],
  ["father_name", "Father name"],
  ["designation", "Designation"],
  ["category_name", "Category"],
  ["current_site_name", "Current site"],
  ["l1_employee_name", "L1 lead"],
  ["l1_employee_code", "L1 lead code"],
  ["l2_employee_name", "L2 lead"],
  ["l2_employee_code", "L2 lead code"],
  ["phone_no", "Phone"],
  ["pf_no", "PF no"],
  ["esic_no", "ESIC no"],
  ["joining_date", "Joining date"],
  ["leaving_date", "Leaving date"],
  ["is_active", "Status"],
];

function loadStoredFilters() {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
  } catch {
    return DEFAULT_FILTERS;
  }
}

function LeadCell({ name, code, isActiveLead }) {
  if (!code) return <span className="text-amber-700">Not assigned</span>;
  const inactive = !isActiveLead(code);
  return (
    <span className="inline-flex items-center gap-1" title={inactive ? "No longer in the active HR team" : code}>
      {inactive ? <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden /> : null}
      <span className={inactive ? "text-amber-800" : ""}>{name || code}</span>
    </span>
  );
}

export default function PeopleMasterList({ sites = [] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hrTeam, isActiveLead } = useHrTeamLeads();

  const [filters, setFilters] = useState(loadStoredFilters);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [sort, setSort] = useState({ by: "full_name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showAllColumns, setShowAllColumns] = useState(false);

  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [options, setOptions] = useState({ designations: [], categories: [] });
  const [myCode, setMyCode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const [selected, setSelected] = useState(() => new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    fetchPeopleFilterOptions(supabase)
      .then((opts) => !cancelled && setOptions(opts))
      .catch((err) => console.error("People filter options failed", err));
    if (user?.id) {
      employeeCodeForUserId(user.id)
        .then((code) => !cancelled && setMyCode(code))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const queryFilters = useMemo(() => {
    const isHrLeadCode = ![LEAD_FILTERS.ALL, LEAD_FILTERS.MINE, LEAD_FILTERS.NO_L1, LEAD_FILTERS.NO_L2].includes(
      filters.lead
    );
    return {
      search: searchApplied,
      isActive: filters.status === "active" ? true : filters.status === "inactive" ? false : null,
      siteId: filters.siteId,
      designation: filters.designation,
      category: filters.category,
      leadFilter: isHrLeadCode ? "LEAD" : filters.lead,
      leadCode: isHrLeadCode ? filters.lead : null,
      myCode,
    };
  }, [filters, searchApplied, myCode]);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      const [pageResult, summary] = await Promise.all([
        fetchPeopleDirectoryPage(supabase, {
          ...queryFilters,
          sortBy: sort.by,
          sortDir: sort.dir,
          page,
          pageSize,
        }),
        fetchPeopleDirectoryStats(supabase).catch((err) => {
          console.warn("People stats failed", err);
          return null;
        }),
      ]);
      if (seq !== loadSeq.current) return;
      setRows(pageResult.rows);
      setTotalCount(pageResult.count);
      setStats(summary);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error("People directory load failed", err);
      setRows([]);
      setTotalCount(0);
      setError(formatPeopleDirectoryError(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [queryFilters, sort, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [queryFilters, pageSize]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const applySearch = () => {
    setSearchApplied(search.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearch("");
    setSearchApplied("");
    setSort({ by: "full_name", dir: "asc" });
    setSelected(new Set());
  };

  const toggleSort = useCallback((key) => {
    setSort((prev) =>
      prev.by === key ? { by: key, dir: prev.dir === "asc" ? "desc" : "asc" } : { by: key, dir: key.endsWith("_date") ? "desc" : "asc" }
    );
  }, []);

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleRow = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allOnPageSelected, pageIds]);

  const columns = useMemo(() => {
    const sortHeader = (key, label) => () => {
      const active = sort.by === key;
      return (
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-0.5 font-semibold hover:text-accent ${active ? "text-accent" : ""}`}
        >
          {label}
          <span className="text-[10px] opacity-70">{active ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</span>
        </button>
      );
    };
    const col = (key, label, render, extra = {}) => ({ key, label, headerRender: sortHeader(key, label), render, ...extra });

    const summary = [
      {
        key: "__select",
        label: "",
        headerRender: () => (
          <input type="checkbox" aria-label="Select page" checked={allOnPageSelected} onChange={togglePage} />
        ),
        render: (row) => (
          <label className="flex items-center justify-center -m-1.5 p-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Select ${row.full_name || row.unique_code}`}
              checked={selected.has(row.id)}
              onChange={() => toggleRow(row.id)}
            />
          </label>
        ),
      },
      {
        key: "__sr",
        label: "Sr No",
        render: (row) => (page - 1) * pageSize + rows.indexOf(row) + 1,
        cellClassName: "text-center tabular-nums text-gray-500",
      },
      col("unique_code", "Employee code", (r) => <span className="font-mono text-[11px]">{r.unique_code || "—"}</span>),
      col("full_name", "Name", (r) => <span className="font-medium text-gray-900">{r.full_name || "—"}</span>),
      col("designation", "Designation", (r) => r.designation || "—"),
      col("current_site_name", "Current site", (r) => r.current_site_name || <span className="text-gray-400">No active site</span>),
      col("l1_employee_name", "L1 lead", (r) => (
        <LeadCell name={r.l1_employee_name} code={r.l1_employee_code} isActiveLead={isActiveLead} />
      )),
      col("l2_employee_name", "L2 lead", (r) => (
        <LeadCell name={r.l2_employee_name} code={r.l2_employee_code} isActiveLead={isActiveLead} />
      )),
      col("joining_date", "Joining", (r) => formatDateDdMmYyyy(r.joining_date) || "—"),
    ];

    const extra = showAllColumns
      ? [
          col("father_name", "Father name", (r) => r.father_name || "—"),
          col("category_name", "Category", (r) => r.category_name || "—"),
          col("phone_no", "Phone", (r) => r.phone_no || "—"),
          { key: "pf_no", label: "PF no", render: (r) => r.pf_no || "—" },
          { key: "esic_no", label: "ESIC no", render: (r) => r.esic_no || "—" },
          col("leaving_date", "Leaving", (r) => formatDateDdMmYyyy(r.leaving_date) || "—"),
        ]
      : [];

    return [
      ...summary,
      ...extra,
      col("is_active", "Status", (r) =>
        r.is_active !== false ? (
          <Badge tone="bg-emerald-50 text-emerald-800">Active</Badge>
        ) : (
          <Badge tone="bg-amber-50 text-amber-800">Inactive</Badge>
        )
      ),
    ];
  }, [sort, toggleSort, allOnPageSelected, togglePage, selected, toggleRow, page, pageSize, rows, isActiveLead, showAllColumns]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await fetchPeopleDirectoryAll(supabase, { ...queryFilters, sortBy: sort.by, sortDir: sort.dir });
      if (!all.length) {
        toast.warning("Nothing to export", "No people match the current filters.");
        return;
      }
      const sheet = all.map((row) => {
        const out = {};
        for (const [key, label] of EXPORT_COLUMNS) {
          if (key === "is_active") out[label] = row.is_active !== false ? "Active" : "Inactive";
          else if (key.endsWith("_date")) out[label] = formatDateDdMmYyyy(row[key]) || "";
          else out[label] = row[key] ?? "";
        }
        return out;
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "People");
      XLSX.writeFile(wb, `people-master-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error("People export failed", err);
      toast.error("Export failed", formatPeopleDirectoryError(err));
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize));
  const startIndex = totalCount ? (page - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile
          label="Active employees"
          value={stats ? stats.active.toLocaleString() : "…"}
          sub="Site workforce"
          onClick={() => setFilters({ ...DEFAULT_FILTERS })}
        />
        <KpiTile
          label="Without L1 lead"
          value={stats ? stats.missingL1.toLocaleString() : "…"}
          sub="Click to review"
          tone={stats?.missingL1 ? "border-amber-300" : "border-border"}
          onClick={() => setFilters({ ...DEFAULT_FILTERS, lead: LEAD_FILTERS.NO_L1 })}
        />
        <KpiTile
          label="Without L2 lead"
          value={stats ? stats.missingL2.toLocaleString() : "…"}
          sub="Click to review"
          tone={stats?.missingL2 ? "border-amber-300" : "border-border"}
          onClick={() => setFilters({ ...DEFAULT_FILTERS, lead: LEAD_FILTERS.NO_L2 })}
        />
      </div>

      <SectionCard title="Filters">
        <FilterBar>
          <label className="flex flex-col gap-0.5 min-w-[220px] flex-1">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Search</span>
            <div className="flex gap-1">
              <TinyInput
                type="search"
                value={search}
                placeholder="Name, code, phone, site or lead"
                className="flex-1 min-w-0"
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
              />
              <button
                type="button"
                onClick={applySearch}
                className="h-8 px-3 rounded text-xs font-medium bg-accent text-white hover:bg-accent-deep inline-flex items-center gap-1"
              >
                <Search className="h-3.5 w-3.5" />
                Search
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Status</span>
            <TinySelect value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 min-w-[160px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Current site</span>
            <TinySelect value={filters.siteId} onChange={(e) => setFilter("siteId", e.target.value)}>
              <option value="ALL">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.site_name || `Site ${s.id}`}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 min-w-[150px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Designation</span>
            <TinySelect value={filters.designation} onChange={(e) => setFilter("designation", e.target.value)}>
              <option value="ALL">All designations</option>
              {options.designations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 min-w-[140px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Category</span>
            <TinySelect value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
              <option value="ALL">All categories</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </TinySelect>
          </label>
          <label className="flex flex-col gap-0.5 min-w-[180px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">HR lead</span>
            <TinySelect value={filters.lead} onChange={(e) => setFilter("lead", e.target.value)}>
              <option value={LEAD_FILTERS.ALL}>Any lead</option>
              <option value={LEAD_FILTERS.MINE} disabled={!myCode}>
                My team (I am L1 or L2)
              </option>
              <option value={LEAD_FILTERS.NO_L1}>No L1 lead</option>
              <option value={LEAD_FILTERS.NO_L2}>No L2 lead</option>
              {hrTeam.length ? <option disabled>──────────</option> : null}
              {hrTeam.map((m) => {
                const code = m.employee_code || m.employee_id;
                return (
                  <option key={m.id} value={code}>
                    {m.full_name} ({code})
                  </option>
                );
              })}
            </TinySelect>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </FilterBar>
      </SectionCard>

      <SectionCard
        title={`People (${totalCount.toLocaleString()})`}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAllColumns((v) => !v)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {showAllColumns ? "Show summary columns" : "Show all columns"}
            </button>
            <button
              type="button"
              onClick={() => setAssignOpen(true)}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-deep disabled:opacity-40"
              title={selected.size ? "" : "Select people in the table first"}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Assign HR leads{selected.size ? ` (${selected.size})` : ""}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || totalCount === 0}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
          </div>
        }
      >
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}
        {selected.size ? (
          <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-600">
            <span>{selected.size} selected</span>
            <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        ) : null}

        <DenseTable
          columns={columns}
          rows={rows}
          rowKey="id"
          stickyHeader
          showSerialNumber={false}
          onRowClick={(row) => navigate(`/app/people-management/${row.id}`)}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[11px] text-gray-600">
            Rows per page
            <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </TinySelect>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 tabular-nums">
              {loading ? "Loading…" : `Showing ${startIndex}–${endIndex} of ${totalCount.toLocaleString()}`}
            </span>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2 rounded border border-gray-300 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-[11px] text-gray-600 tabular-nums">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 px-2 rounded border border-gray-300 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>

      <HrLeadsAssignModal
        open={assignOpen}
        personIds={[...selected]}
        hrTeam={hrTeam}
        onClose={() => setAssignOpen(false)}
        onSaved={() => {
          setAssignOpen(false);
          setSelected(new Set());
          load();
        }}
      />
    </div>
  );
}
