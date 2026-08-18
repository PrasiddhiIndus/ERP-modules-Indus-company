import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { ROLES } from "../../../config/roles";
import { supabase } from "../../../lib/supabase";
import { listSites } from "../../../lib/peopleAttendanceApi";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  Badge,
  CollapsibleHelp,
  DenseTable,
  FilterBar,
  KpiTile,
  PageTaskHeader,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../components/AdminUi";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const IN_HOUSE_TAB = "inHouse";
const SITE_TAB = "site";
const ALL_SITES = "ALL";
const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

const IN_HOUSE_SELECT = [
  "id",
  "employee_id",
  "employee_code",
  "full_name",
  "department",
  "designation",
  "personal_no",
  "date_of_joining",
  "status",
  "employment_type",
].join(",");

const SITE_SELECT = [
  "id",
  "unique_code",
  "full_name",
  "designation",
  "phone_no",
  "category_name",
  "joining_date",
  "leaving_date",
  "is_active",
].join(",");

function tabClass(active) {
  return `inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border transition-colors ${
    active
      ? "bg-accent text-white border-accent"
      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
  }`;
}

function sourceTone(tab) {
  return tab === IN_HOUSE_TAB
    ? "border-indigo-200 bg-indigo-50/40"
    : "border-emerald-200 bg-emerald-50/40";
}

function inHouseStatusTone(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-800";
  if (value === "left") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function siteStatusTone(isActive) {
  return isActive === false ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800";
}

function buildSearchOr(columns, q) {
  return columns.map((column) => `${column}.ilike.%${q}%`).join(",");
}

async function fetchSummaryCounts() {
  const [{ count: inHouseCount, error: inHouseError }, { count: siteCount, error: siteError }] = await Promise.all([
    supabase.from("admin_ifsp_employee_master").select("id", { count: "exact", head: true }),
    supabase.from("people").select("id", { count: "exact", head: true }),
  ]);
  if (inHouseError) throw inHouseError;
  if (siteError) throw siteError;
  return {
    inHouseCount: inHouseCount ?? 0,
    siteCount: siteCount ?? 0,
  };
}

async function fetchCurrentSitePersonIds(siteId) {
  let query = supabase
    .from("site_assignments")
    .select("person_id")
    .or(`to_date.is.null,to_date.gte.${TODAY_ISO()}`);

  if (siteId && siteId !== ALL_SITES) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query.limit(10000);
  if (error) throw error;

  return [...new Set((data || []).map((row) => row.person_id).filter(Boolean))];
}

async function fetchCurrentSiteMap(personIds, siteId) {
  if (!Array.isArray(personIds) || personIds.length === 0) return new Map();

  let query = supabase
    .from("site_assignments")
    .select("person_id, from_date, to_date, sites:site_id ( site_name )")
    .in("person_id", personIds)
    .or(`to_date.is.null,to_date.gte.${TODAY_ISO()}`)
    .order("from_date", { ascending: false });

  if (siteId && siteId !== ALL_SITES) {
    query = query.eq("site_id", siteId);
  }

  const { data, error } = await query.limit(10000);
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    if (!row?.person_id || map.has(row.person_id)) continue;
    map.set(row.person_id, {
      site_name: row.sites?.site_name || "",
      from_date: row.from_date || "",
      to_date: row.to_date || "",
    });
  }
  return map;
}

export function AllEmployeesDirectoryPage() {
  const { userProfile } = useAuth();
  const canUseAllEmployees = userProfile?.role === ROLES.SUPER_ADMIN;
  const [activeTab, setActiveTab] = useState(IN_HOUSE_TAB);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState({ inHouseCount: 0, siteCount: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [inHouseStatus, setInHouseStatus] = useState("All");
  const [siteStatus, setSiteStatus] = useState("active");
  const [siteId, setSiteId] = useState(ALL_SITES);
  const [sites, setSites] = useState([]);

  const loadCounts = useCallback(async () => {
    if (!canUseAllEmployees) return;
    try {
      const next = await fetchSummaryCounts();
      setCounts(next);
    } catch (err) {
      console.error("Could not load employee source counts:", err);
    }
  }, [canUseAllEmployees]);

  useEffect(() => {
    if (!canUseAllEmployees) {
      setSites([]);
      setCounts({ inHouseCount: 0, siteCount: 0 });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [siteList, nextCounts] = await Promise.all([listSites(supabase), fetchSummaryCounts()]);
        if (cancelled) return;
        setSites(siteList);
        setCounts(nextCounts);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSites([]);
          setError(err?.message || "Could not load employee sources.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUseAllEmployees]);

  const loadRows = useCallback(
    async ({ silent = false } = {}) => {
      if (!canUseAllEmployees) {
        setRows([]);
        setTotalCount(0);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) {
        setLoading(true);
        setError("");
      } else {
        setRefreshing(true);
      }

      try {
        const safePage = Math.max(1, Number(page) || 1);
        const safeSize = Math.max(1, Math.min(1000, Number(pageSize) || 50));
        const from = (safePage - 1) * safeSize;
        const to = from + safeSize - 1;
        const q = searchApplied.trim();

        if (activeTab === IN_HOUSE_TAB) {
          let query = supabase
            .from("admin_ifsp_employee_master")
            .select(IN_HOUSE_SELECT, { count: "exact" });

          if (q) {
            query = query.or(
              buildSearchOr(
                ["full_name", "employee_code", "employee_id", "department", "designation", "personal_no"],
                q
              )
            );
          }
          if (inHouseStatus !== "All") {
            query = query.eq("status", inHouseStatus);
          }

          const { data, error: fetchError, count } = await query
            .order("full_name", { ascending: true })
            .range(from, to);

          if (fetchError) throw fetchError;
          setRows(data || []);
          setTotalCount(count ?? (data || []).length);
        } else {
          let personIds = null;
          if (siteId !== ALL_SITES) {
            personIds = await fetchCurrentSitePersonIds(siteId);
            if (personIds.length === 0) {
              setRows([]);
              setTotalCount(0);
              return;
            }
          }

          let query = supabase.from("people").select(SITE_SELECT, { count: "exact" });
          if (q) {
            query = query.or(buildSearchOr(["full_name", "unique_code", "designation", "phone_no"], q));
          }
          if (siteStatus === "active") query = query.eq("is_active", true);
          if (siteStatus === "inactive") query = query.eq("is_active", false);
          if (Array.isArray(personIds)) query = query.in("id", personIds);

          const { data, error: fetchError, count } = await query
            .order("full_name", { ascending: true })
            .range(from, to);

          if (fetchError) throw fetchError;

          const siteMap = await fetchCurrentSiteMap(
            (data || []).map((row) => row.id),
            siteId
          );

          setRows(
            (data || []).map((row) => ({
              ...row,
              current_site_name: siteMap.get(row.id)?.site_name || "",
              current_site_from: siteMap.get(row.id)?.from_date || "",
            }))
          );
          setTotalCount(count ?? (data || []).length);
        }
      } catch (err) {
        console.error(err);
        setRows([]);
        setTotalCount(0);
        setError(err?.message || "Could not load employees.");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [activeTab, canUseAllEmployees, inHouseStatus, page, pageSize, searchApplied, siteId, siteStatus]
  );

  useEffect(() => {
    if (!canUseAllEmployees) return;
    loadRows();
  }, [canUseAllEmployees, loadRows]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, inHouseStatus, pageSize, searchApplied, siteId, siteStatus]);

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (!canUseAllEmployees) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800">
          Only Super Admin can access All Employees.
        </div>
      </div>
    );
  }

  const columns = useMemo(() => {
    if (activeTab === IN_HOUSE_TAB) {
      return [
        {
          key: "employee_code",
          label: "Employee Code",
          render: (row) => <span className="font-mono text-[11px]">{row.employee_code || "—"}</span>,
          widthClassName: "min-w-[120px]",
        },
        {
          key: "employee_id",
          label: "Machine ID",
          render: (row) => <span className="font-mono text-[11px]">{row.employee_id || "—"}</span>,
          widthClassName: "min-w-[110px]",
        },
        {
          key: "full_name",
          label: "Employee Name",
          render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
          widthClassName: "min-w-[220px]",
        },
        { key: "department", label: "Department", render: (row) => row.department || "—", widthClassName: "min-w-[150px]" },
        { key: "designation", label: "Designation", render: (row) => row.designation || "—", widthClassName: "min-w-[180px]" },
        { key: "employment_type", label: "Employment Type", render: (row) => row.employment_type || "—", widthClassName: "min-w-[130px]" },
        { key: "personal_no", label: "Phone", render: (row) => row.personal_no || "—", widthClassName: "min-w-[130px]" },
        {
          key: "date_of_joining",
          label: "Date of Joining",
          render: (row) => formatDateDdMmYyyy(row.date_of_joining) || row.date_of_joining || "—",
          widthClassName: "min-w-[130px]",
        },
        {
          key: "status",
          label: "Status",
          render: (row) => <Badge tone={inHouseStatusTone(row.status)}>{row.status || "—"}</Badge>,
          widthClassName: "min-w-[110px]",
        },
      ];
    }

    return [
      {
        key: "unique_code",
        label: "Employee Code",
        render: (row) => <span className="font-mono text-[11px]">{row.unique_code || "—"}</span>,
        widthClassName: "min-w-[120px]",
      },
      {
        key: "full_name",
        label: "Employee Name",
        render: (row) => <span className="font-medium text-gray-900">{row.full_name || "—"}</span>,
        widthClassName: "min-w-[220px]",
      },
      { key: "designation", label: "Designation", render: (row) => row.designation || "—", widthClassName: "min-w-[180px]" },
      { key: "category_name", label: "Category", render: (row) => row.category_name || "—", widthClassName: "min-w-[150px]" },
      { key: "current_site_name", label: "Current Site", render: (row) => row.current_site_name || "—", widthClassName: "min-w-[190px]" },
      { key: "phone_no", label: "Phone", render: (row) => row.phone_no || "—", widthClassName: "min-w-[130px]" },
      {
        key: "joining_date",
        label: "Joining Date",
        render: (row) => formatDateDdMmYyyy(row.joining_date) || row.joining_date || "—",
        widthClassName: "min-w-[130px]",
      },
      {
        key: "leaving_date",
        label: "Leaving Date",
        render: (row) => formatDateDdMmYyyy(row.leaving_date) || row.leaving_date || "—",
        widthClassName: "min-w-[130px]",
      },
      {
        key: "is_active",
        label: "Status",
        render: (row) => <Badge tone={siteStatusTone(row.is_active)}>{row.is_active === false ? "Inactive" : "Active"}</Badge>,
        widthClassName: "min-w-[110px]",
      },
    ];
  }, [activeTab]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setSearchApplied("");
    setPage(1);
    if (activeTab === IN_HOUSE_TAB) {
      setInHouseStatus("All");
    } else {
      setSiteStatus("active");
      setSiteId(ALL_SITES);
    }
  }, [activeTab]);

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-[1800px] mx-auto w-full flex flex-col gap-4">
      <PageTaskHeader
        title="All Employees"
        subtitle="Separate views for in-house employees and site employees, so each screen only shows the people relevant to that task."
      >
        <button
          type="button"
          onClick={async () => {
            await Promise.all([loadRows({ silent: true }), loadCounts()]);
          }}
          disabled={loading || refreshing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </PageTaskHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile label="In-house employees" value={counts.inHouseCount.toLocaleString()} sub="From admin employee master" />
        <KpiTile label="Site employees" value={counts.siteCount.toLocaleString()} sub="From people master" />
        <KpiTile
          label={activeTab === IN_HOUSE_TAB ? "Matching in-house" : "Matching site employees"}
          value={(loading ? 0 : totalCount).toLocaleString()}
          sub="Current filters"
          tone={sourceTone(activeTab)}
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === IN_HOUSE_TAB}
          className={tabClass(activeTab === IN_HOUSE_TAB)}
          onClick={() => setActiveTab(IN_HOUSE_TAB)}
        >
          <Users className="h-4 w-4 shrink-0" />
          In-house employees
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === SITE_TAB}
          className={tabClass(activeTab === SITE_TAB)}
          onClick={() => setActiveTab(SITE_TAB)}
        >
          Site employees
        </button>
      </div>

      <SectionCard title="Filters">
        <FilterBar>
          <label className="flex flex-col gap-0.5 min-w-[240px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Search</span>
            <TinyInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === IN_HOUSE_TAB
                  ? "Name, code, machine ID, phone, department…"
                  : "Name, code, phone, designation…"
              }
            />
          </label>

          {activeTab === IN_HOUSE_TAB ? (
            <label className="flex flex-col gap-0.5 min-w-[150px]">
              <span className="text-[10px] font-medium text-gray-500 uppercase">Status</span>
              <TinySelect value={inHouseStatus} onChange={(e) => setInHouseStatus(e.target.value)}>
                <option value="All">All statuses</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Left">Left</option>
              </TinySelect>
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-0.5 min-w-[160px]">
                <span className="text-[10px] font-medium text-gray-500 uppercase">Site</span>
                <TinySelect value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                  <option value={ALL_SITES}>All current sites</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.site_name}
                    </option>
                  ))}
                </TinySelect>
              </label>
              <label className="flex flex-col gap-0.5 min-w-[140px]">
                <span className="text-[10px] font-medium text-gray-500 uppercase">Status</span>
                <TinySelect value={siteStatus} onChange={(e) => setSiteStatus(e.target.value)}>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                  <option value="all">All</option>
                </TinySelect>
              </label>
            </>
          )}

          <label className="flex flex-col gap-0.5 min-w-[120px]">
            <span className="text-[10px] font-medium text-gray-500 uppercase">Page size</span>
            <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 50)}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </TinySelect>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchApplied(search.trim());
                setPage(1);
              }}
              className="h-8 px-3 rounded border border-accent bg-accent text-white text-xs font-medium hover:opacity-95"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-8 px-3 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </FilterBar>

        <CollapsibleHelp label="about employee sources">
          <p>
            <strong>In-house employees</strong> show office and admin staff records.
            <br />
            <strong>Site employees</strong> show site workforce records, with the current posting shown where it is available.
          </p>
        </CollapsibleHelp>
      </SectionCard>

      <SectionCard
        title={activeTab === IN_HOUSE_TAB ? "In-house employee directory" : "Site employee directory"}
        right={
          <span className="text-xs text-gray-500">
            Showing {rows.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, totalCount)} of{" "}
            {totalCount}
          </span>
        }
      >
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <DenseTable
          columns={columns}
          rows={rows}
          rowKey="id"
          frozenColumnCount={3}
          frozenColumnWidths={[120, 110, 220]}
          stickyHeader
          density="comfortable"
          serialOffset={(page - 1) * pageSize}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {activeTab === IN_HOUSE_TAB
              ? "Admin employee screens should use the in-house master only."
              : "Site employees are kept separate from the admin in-house master."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              className="h-8 px-3 rounded border border-gray-300 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              className="h-8 px-3 rounded border border-gray-300 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export default AllEmployeesDirectoryPage;
