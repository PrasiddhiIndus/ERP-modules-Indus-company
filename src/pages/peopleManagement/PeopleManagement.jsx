import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, Users } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  FilterBar,
  TinyInput,
  TinySelect,
  DenseTable,
  Badge,
  KpiTile,
} from "../adminOperations/components/AdminUi";
import { supabase } from "../../lib/supabase";
import { listSites } from "../../lib/peopleAttendanceApi";
import {
  assignmentRowKey,
  fetchPeopleManagementStats,
  fetchPeoplePage,
  fetchSiteAssignmentsPage,
  formatPeopleManagementError,
  resolvePersonIdsForSearch,
} from "../../lib/peopleManagementApi";
import SiteAssignmentsFilters from "./SiteAssignmentsFilters";
import { buildAssignmentColumns, isoDateToday, monthStartIso } from "./siteAssignmentsTableHelpers.jsx";
import { buildPeopleColumns } from "./peopleMasterTableHelpers.jsx";

const PAGE_SIZES = [25, 50, 100, 200];

const ASSIGNMENT_TEXT_SORT_KEYS = new Set(["employee_name", "employee_code", "site", "designation"]);
const PEOPLE_TEXT_SORT_KEYS = new Set(["unique_code", "full_name", "designation", "phone_no"]);
const DATE_SORT_KEYS = new Set(["from_date", "to_date", "joining_date", "leaving_date"]);

function tabClass(active) {
  return `inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border transition-colors ${
    active
      ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
  }`;
}

export default function PeopleManagement() {
  const [activeTab, setActiveTab] = useState("assignments");

  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("ALL");
  const [assignmentStatus, setAssignmentStatus] = useState("ACTIVE");
  const [employeeActiveOnly, setEmployeeActiveOnly] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [assignmentSort, setAssignmentSort] = useState({ by: "from_date", dir: "desc" });
  const [peopleSort, setPeopleSort] = useState({ by: "full_name", dir: "asc" });

  const [activeOnly, setActiveOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const [assignmentRows, setAssignmentRows] = useState([]);
  const [peopleRows, setPeopleRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const siteList = await listSites(supabase);
        if (!cancelled) setSites(siteList);
      } catch (err) {
        console.error(err);
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const assignmentFilters = useMemo(
    () => ({
      siteId: siteId === "ALL" ? null : siteId,
      assignmentStatus,
      employeeActiveOnly,
      startDate: startDate || null,
      endDate: endDate || null,
    }),
    [siteId, assignmentStatus, employeeActiveOnly, startDate, endDate]
  );

  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      let personIds = null;
      if (searchApplied.trim()) {
        personIds = await resolvePersonIdsForSearch(supabase, searchApplied);
        if (seq !== loadSeq.current) return;
        if (personIds.length === 0) {
          setAssignmentRows([]);
          setPeopleRows([]);
          setStats({ activeEmployees: 0, totalAssignments: 0, activeAssignments: 0, filteredAssignments: 0 });
          setTotalCount(0);
          return;
        }
      }

      const filters = { ...assignmentFilters, personIds };

      if (activeTab === "assignments") {
        const [pageResult, summary] = await Promise.all([
          fetchSiteAssignmentsPage(supabase, {
            ...filters,
            sortBy: assignmentSort.by,
            sortDir: assignmentSort.dir,
            page,
            pageSize,
          }),
          fetchPeopleManagementStats(supabase, filters),
        ]);
        if (seq !== loadSeq.current) return;
        setAssignmentRows(pageResult.rows);
        setTotalCount(pageResult.count ?? pageResult.rows.length);
        setStats(summary);
      } else {
        const [pageResult, summary] = await Promise.all([
          fetchPeoplePage(supabase, {
            search: searchApplied,
            isActive: activeOnly ? true : null,
            sortBy: peopleSort.by,
            sortDir: peopleSort.dir,
            page,
            pageSize,
          }),
          fetchPeopleManagementStats(supabase, filters),
        ]);
        if (seq !== loadSeq.current) return;
        setPeopleRows(pageResult.rows);
        setTotalCount(pageResult.count ?? pageResult.rows.length);
        setStats(summary);
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      console.error(err);
      setAssignmentRows([]);
      setPeopleRows([]);
      setStats(null);
      setTotalCount(0);
      setError(formatPeopleManagementError(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [
    activeTab,
    assignmentFilters,
    searchApplied,
    assignmentSort,
    peopleSort,
    page,
    pageSize,
    activeOnly,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    siteId,
    assignmentStatus,
    employeeActiveOnly,
    startDate,
    endDate,
    searchApplied,
    pageSize,
    activeOnly,
  ]);

  const defaultSortDir = useCallback((key, tab) => {
    if (DATE_SORT_KEYS.has(key)) return "desc";
    if (tab === "assignments" && ASSIGNMENT_TEXT_SORT_KEYS.has(key)) return "asc";
    if (tab === "people" && PEOPLE_TEXT_SORT_KEYS.has(key)) return "asc";
    return "asc";
  }, []);

  const handleAssignmentSort = useCallback(
    (key) => {
      setPage(1);
      setAssignmentSort((prev) => {
        if (prev.by === key) {
          return { by: key, dir: prev.dir === "asc" ? "desc" : "asc" };
        }
        return { by: key, dir: defaultSortDir(key, "assignments") };
      });
    },
    [defaultSortDir]
  );

  const handlePeopleSort = useCallback(
    (key) => {
      setPage(1);
      setPeopleSort((prev) => {
        if (prev.by === key) {
          return { by: key, dir: prev.dir === "asc" ? "desc" : "asc" };
        }
        return { by: key, dir: defaultSortDir(key, "people") };
      });
    },
    [defaultSortDir]
  );

  const applyDatePreset = useCallback((presetId) => {
    const today = isoDateToday();
    if (presetId === "all") {
      setStartDate("");
      setEndDate("");
    } else if (presetId === "month") {
      setStartDate(monthStartIso(today));
      setEndDate(today);
    } else if (presetId === "year") {
      setStartDate(`${today.slice(0, 4)}-01-01`);
      setEndDate(today);
    }
  }, []);

  const resetAssignmentFilters = useCallback(() => {
    setSiteId("ALL");
    setAssignmentStatus("ACTIVE");
    setEmployeeActiveOnly(true);
    setStartDate("");
    setEndDate("");
    setSearch("");
    setSearchApplied("");
    setAssignmentSort({ by: "from_date", dir: "desc" });
    setPage(1);
    setPageSize(50);
  }, []);

  const assignmentColumns = useMemo(
    () =>
      buildAssignmentColumns({
        onSort: handleAssignmentSort,
        sortBy: assignmentSort.by,
        sortDir: assignmentSort.dir,
        Badge,
      }),
    [handleAssignmentSort, assignmentSort]
  );

  const peopleColumns = useMemo(
    () =>
      buildPeopleColumns({
        onSort: handlePeopleSort,
        sortBy: peopleSort.by,
        sortDir: peopleSort.dir,
        Badge,
      }),
    [handlePeopleSort, peopleSort]
  );

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);
  const tableRows = useMemo(() => {
    if (activeTab === "assignments") {
      return assignmentRows.map((row) => ({
        ...row,
        __rowKey: assignmentRowKey(row),
      }));
    }
    return peopleRows;
  }, [activeTab, assignmentRows, peopleRows]);

  const tableRowKey = activeTab === "assignments" ? "__rowKey" : "id";
  const tableColumns = activeTab === "assignments" ? assignmentColumns : peopleColumns;

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-[1800px] mx-auto w-full flex flex-col gap-4">
      <PageTaskHeader
        title="People Management"
        subtitle="Employee master from people, and site assignments showing who works where and when."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <KpiTile
          label="Active employees"
          value={loading ? "…" : (stats?.activeEmployees ?? 0).toLocaleString()}
          sub="From people master"
        />
        <KpiTile
          label="Matching assignments"
          value={loading ? "…" : (stats?.filteredAssignments ?? totalCount ?? 0).toLocaleString()}
          sub="Current filters"
        />
        <KpiTile
          label="Active assignments"
          value={loading ? "…" : (stats?.activeAssignments ?? 0).toLocaleString()}
          sub="Open or not ended"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "assignments"}
          className={tabClass(activeTab === "assignments")}
          onClick={() => setActiveTab("assignments")}
        >
          Site assignments
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "people"}
          className={tabClass(activeTab === "people")}
          onClick={() => setActiveTab("people")}
        >
          <Users className="h-4 w-4 shrink-0" />
          People master
        </button>
      </div>

      <SectionCard title="Filters">
        {activeTab === "assignments" ? (
          <SiteAssignmentsFilters
            siteId={siteId}
            sites={sites}
            assignmentStatus={assignmentStatus}
            employeeActiveOnly={employeeActiveOnly}
            startDate={startDate}
            endDate={endDate}
            search={search}
            onSiteChange={setSiteId}
            onAssignmentStatusChange={setAssignmentStatus}
            onEmployeeActiveOnlyChange={setEmployeeActiveOnly}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onDatePreset={applyDatePreset}
            onSearchChange={setSearch}
            onApplySearch={() => {
              setSearchApplied(search.trim());
              setPage(1);
            }}
            onReset={resetAssignmentFilters}
            onRefresh={load}
            loading={loading}
          />
        ) : (
          <>
            <FilterBar>
              <label className="flex flex-col gap-0.5 min-w-[140px]">
                <span className="text-[10px] font-medium text-gray-500 uppercase">Show</span>
                <TinySelect
                  value={activeOnly ? "active" : "all"}
                  onChange={(e) => setActiveOnly(e.target.value === "active")}
                >
                  <option value="active">Active only</option>
                  <option value="all">All records</option>
                </TinySelect>
              </label>
              <label className="flex flex-col gap-0.5 min-w-[220px] flex-1">
                <span className="text-[10px] font-medium text-gray-500 uppercase">Search</span>
                <div className="flex gap-1">
                  <TinyInput
                    type="search"
                    value={search}
                    placeholder="Name or employee code"
                    className="flex-1 min-w-0"
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearchApplied(search.trim());
                        setPage(1);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchApplied(search.trim());
                      setPage(1);
                    }}
                    className="h-8 px-3 rounded text-xs font-medium bg-[#1F3A8A] text-white hover:bg-[#1a3275] inline-flex items-center gap-1"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Search
                  </button>
                </div>
              </label>
            </FilterBar>
            <div className="mt-2 flex justify-end">
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
          </>
        )}
      </SectionCard>

      <SectionCard
        title={activeTab === "assignments" ? "Site assignments" : "People master"}
        right={
          <span className="text-[11px] text-gray-500 tabular-nums">
            {loading ? "Loading…" : `${totalCount.toLocaleString()} record${totalCount === 1 ? "" : "s"}`}
          </span>
        }
      >
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}

        <DenseTable columns={tableColumns} rows={tableRows} rowKey={tableRowKey} stickyHeader />

        {activeTab === "assignments" || activeTab === "people" ? (
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
        ) : null}
      </SectionCard>
    </div>
  );
}
