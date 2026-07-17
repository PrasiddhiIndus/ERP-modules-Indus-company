import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, LayoutDashboard, List } from "lucide-react";
import {
  PageTaskHeader,
  SectionCard,
  TinySelect,
  DenseTable,
  StatusChip,
  Badge,
} from "../adminOperations/components/AdminUi";
import { supabase } from "../../lib/supabase";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  fetchAttendanceDashboardStats,
  fetchAttendancePage,
  formatPeopleAttendanceError,
  listSites,
  normalizeAttCode,
  resolvePersonIdsForSearch,
  resolveShiftLabel,
} from "../../lib/peopleAttendanceApi";
import AttendanceFilters from "./AttendanceFilters";
import AttendanceRegisterTable from "./AttendanceRegisterTable";
import {
  applyPeriodPreset as resolvePeriodPreset,
  attCodeSeverity,
  buildAttendanceColumns,
  isoDateToday,
  monthStartIso,
} from "./attendanceTableHelpers.jsx";

const PAGE_SIZES = [25, 50, 100, 200];

const MARK_LEGEND = [
  { code: "P", label: "Present", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { code: "HD", label: "Half day", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  { code: "WO", label: "Week off", tone: "bg-sky-50 text-sky-800 border-sky-200" },
  { code: "L", label: "Leave", tone: "bg-orange-50 text-orange-900 border-orange-200" },
  { code: "A/B/C/G", label: "Shift present", tone: "bg-indigo-50 text-indigo-800 border-indigo-200" },
];

function tabClass(active) {
  return `inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border transition-colors ${
    active
      ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
  }`;
}

function StatBlock({ label, value, sub, accent = "border-l-[#1F3A8A]", loading }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm border-l-4 ${accent}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl sm:text-2xl font-bold tabular-nums text-gray-900">
        {loading ? "…" : value ?? "—"}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p> : null}
    </div>
  );
}

function MarkBar({ label, count, total, tone }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-500">
          {count.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SummaryCards({ stats, loading, totalCount }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
      <StatBlock
        label="Total records"
        value={(stats?.total ?? totalCount ?? 0).toLocaleString()}
        sub="Matching filters"
        accent="border-l-[#1F3A8A]"
        loading={loading}
      />
      <StatBlock
        label="Present days"
        value={Number(stats?.presentDays ?? 0).toLocaleString()}
        sub="P / A–G + half days"
        accent="border-l-emerald-500"
        loading={loading}
      />
      <StatBlock
        label="Half days"
        value={(stats?.halfDays ?? 0).toLocaleString()}
        sub="HD marks"
        accent="border-l-amber-500"
        loading={loading}
      />
      <StatBlock
        label="Leave"
        value={(stats?.leave ?? 0).toLocaleString()}
        sub={`${(stats?.weekOff ?? 0).toLocaleString()} week off`}
        accent="border-l-orange-500"
        loading={loading}
      />
      <StatBlock
        label="OT hours"
        value={(stats?.otHours ?? 0).toLocaleString()}
        sub="Filtered total"
        accent="border-l-slate-500"
        loading={loading}
      />
      <StatBlock
        label="Locked"
        value={(stats?.locked ?? 0).toLocaleString()}
        sub={`${(stats?.open ?? 0).toLocaleString()} open`}
        accent="border-l-violet-500"
        loading={loading}
      />
    </div>
  );
}

function useAttendanceFilters() {
  const today = isoDateToday();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("ALL");
  const [startDate, setStartDate] = useState(monthStartIso(today));
  const [endDate, setEndDate] = useState(today);
  const [month, setMonth] = useState("ALL");
  const [year, setYear] = useState("ALL");
  const [attCode, setAttCode] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [sitesError, setSitesError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const siteList = await listSites(supabase);
        if (!cancelled) {
          setSites(siteList);
          setSitesError("");
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setSites([]);
          setSitesError(formatPeopleAttendanceError(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetFilters = useCallback(() => {
    setSiteId("ALL");
    setStartDate(monthStartIso(today));
    setEndDate(today);
    setMonth("ALL");
    setYear("ALL");
    setAttCode("ALL");
    setSearch("");
    setSearchApplied("");
    setGroupBy("none");
    setSortBy("date");
    setSortDir("desc");
  }, [today]);

  const handlePeriodPreset = useCallback((presetId) => {
    const { startDate: s, endDate: e } = resolvePeriodPreset(presetId, today);
    setStartDate(s);
    setEndDate(e);
  }, [today]);

  const applySearch = useCallback(() => {
    setSearchApplied(search.trim());
  }, [search]);

  const handleSort = useCallback((key) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "employee_name" || key === "employee_code" || key === "site" ? "asc" : "desc");
      return key;
    });
  }, []);

  const apiFilters = useMemo(
    () => ({
      siteId: siteId === "ALL" ? null : siteId,
      startDate: startDate || null,
      endDate: endDate || null,
      month: month === "ALL" ? null : month,
      year: year === "ALL" ? null : year,
      attCode: attCode === "ALL" ? null : attCode,
    }),
    [siteId, startDate, endDate, month, year, attCode]
  );

  const resolvePersonIds = useCallback(async () => {
    if (!searchApplied.trim()) return null;
    return resolvePersonIdsForSearch(supabase, searchApplied);
  }, [searchApplied]);

  return useMemo(
    () => ({
      sites,
      siteId,
      setSiteId,
      startDate,
      setStartDate,
      endDate,
      setEndDate,
      month,
      setMonth,
      year,
      setYear,
      attCode,
      setAttCode,
      search,
      setSearch,
      searchApplied,
      groupBy,
      setGroupBy,
      sortBy,
      sortDir,
      sitesError,
      resetFilters,
      handlePeriodPreset,
      applySearch,
      handleSort,
      apiFilters,
      resolvePersonIds,
    }),
    [
      sites,
      siteId,
      startDate,
      endDate,
      month,
      year,
      attCode,
      search,
      searchApplied,
      groupBy,
      sortBy,
      sortDir,
      sitesError,
      resetFilters,
      handlePeriodPreset,
      applySearch,
      handleSort,
      apiFilters,
      resolvePersonIds,
    ]
  );
}

function AttendanceDashboardTab({ filters, onOpenRegister }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const personIds = await filters.resolvePersonIds();
      if (Array.isArray(personIds) && personIds.length === 0) {
        setStats({
          total: 0,
          locked: 0,
          open: 0,
          byMark: {},
          presentMarks: 0,
          presentDays: 0,
          halfDays: 0,
          leave: 0,
          weekOff: 0,
          otHours: 0,
        });
        setRecent([]);
        return;
      }

      const queryFilters = { ...filters.apiFilters, personIds };
      const [summary, page] = await Promise.all([
        fetchAttendanceDashboardStats(supabase, queryFilters),
        fetchAttendancePage(supabase, {
          ...queryFilters,
          personIds,
          sortBy: "date",
          sortDir: "desc",
          page: 1,
          pageSize: 8,
        }),
      ]);
      setStats(summary);
      setRecent(page.rows || []);
    } catch (err) {
      console.error(err);
      setStats(null);
      setRecent([]);
      setError(formatPeopleAttendanceError(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const markTotal = stats?.total || 0;

  const filterProps = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    siteId: filters.siteId,
    sites: filters.sites,
    month: filters.month,
    year: filters.year,
    attCode: filters.attCode,
    search: filters.search,
    groupBy: filters.groupBy,
    onStartDateChange: (v) => {
      filters.setStartDate(v);
    },
    onEndDateChange: (v) => {
      filters.setEndDate(v);
    },
    onSiteChange: filters.setSiteId,
    onMonthChange: filters.setMonth,
    onYearChange: filters.setYear,
    onAttCodeChange: filters.setAttCode,
    onSearchChange: filters.setSearch,
    onGroupByChange: filters.setGroupBy,
    onPeriodPreset: filters.handlePeriodPreset,
    onApplySearch: filters.applySearch,
    onReset: filters.resetFilters,
    onRefresh: load,
    loading,
    sitesError: filters.sitesError,
    showGrouping: false,
    compact: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Filters">
        <AttendanceFilters {...filterProps} />
        <p className="mt-2 text-[11px] text-gray-500">
          Period: {formatDateDdMmYyyy(filters.startDate)} → {formatDateDdMmYyyy(filters.endDate)}
        </p>
      </SectionCard>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      ) : null}

      <SummaryCards stats={stats} loading={loading} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard title="Mark breakdown">
          {loading && !stats ? (
            <p className="text-xs text-gray-500 py-6 text-center">Loading summary…</p>
          ) : (
            <div className="space-y-3">
              <MarkBar label="Present (P)" count={stats?.byMark?.P || 0} total={markTotal} tone="bg-emerald-500" />
              <MarkBar label="Half day (HD)" count={stats?.byMark?.HD || 0} total={markTotal} tone="bg-amber-500" />
              <MarkBar label="Week off (WO)" count={stats?.byMark?.WO || 0} total={markTotal} tone="bg-sky-500" />
              <MarkBar label="Leave (L)" count={stats?.byMark?.L || 0} total={markTotal} tone="bg-orange-500" />
              <MarkBar
                label="Shift A / B / C / G"
                count={
                  (stats?.byMark?.A || 0) +
                  (stats?.byMark?.B || 0) +
                  (stats?.byMark?.C || 0) +
                  (stats?.byMark?.G || 0)
                }
                total={markTotal}
                tone="bg-indigo-500"
              />
            </div>
          )}
          <button
            type="button"
            onClick={onOpenRegister}
            className="mt-4 w-full h-9 rounded-md text-xs font-medium bg-[#1F3A8A] text-white hover:bg-[#1a3275]"
          >
            Open attendance register
          </button>
        </SectionCard>

        <SectionCard title="Mark guide">
          <ul className="space-y-2">
            {MARK_LEGEND.map((m) => (
              <li key={m.code} className="flex items-start gap-2 text-xs text-gray-700">
                <span className={`mt-0.5 inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${m.tone}`}>
                  {m.code}
                </span>
                <span className="font-medium text-gray-900">{m.label}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title="Latest records"
        right={
          <button type="button" onClick={onOpenRegister} className="text-[11px] font-medium text-[#1F3A8A] hover:underline">
            View register
          </button>
        }
      >
        {recent.length === 0 && !loading ? (
          <p className="text-xs text-gray-500 py-8 text-center">No attendance for the current filters.</p>
        ) : (
          <DenseTable
            columns={[
              {
                key: "full_name",
                label: "Employee name",
                render: (row) => row.people?.full_name || "—",
              },
              {
                key: "unique_code",
                label: "Code",
                render: (row) => row.people?.unique_code || "—",
              },
              {
                key: "site",
                label: "Site",
                render: (row) => row.sites?.site_name || "—",
              },
              {
                key: "att_date",
                label: "Date",
                render: (row) => formatDateDdMmYyyy(row.att_date) || "—",
              },
              {
                key: "shift",
                label: "Shift",
                render: (row) => resolveShiftLabel(row),
              },
              {
                key: "att_code",
                label: "Mark",
                render: (row) => (
                  <StatusChip label={normalizeAttCode(row.att_code) || "—"} severity={attCodeSeverity(row.att_code)} />
                ),
              },
            ]}
            rows={recent}
            rowKey="id"
            showSerialNumber={false}
          />
        )}
      </SectionCard>
    </div>
  );
}

function AttendanceRegisterTab({ filters }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const personIds = await filters.resolvePersonIds();
      if (Array.isArray(personIds) && personIds.length === 0) {
        setRows([]);
        setStats({
          total: 0,
          locked: 0,
          open: 0,
          byMark: {},
          presentMarks: 0,
          presentDays: 0,
          halfDays: 0,
          leave: 0,
          weekOff: 0,
          otHours: 0,
        });
        setTotalCount(0);
        return;
      }

      const queryFilters = { ...filters.apiFilters, personIds };
      const [pageResult, summary] = await Promise.all([
        fetchAttendancePage(supabase, {
          ...queryFilters,
          personIds,
          sortBy: filters.sortBy,
          sortDir: filters.sortDir,
          groupBy: filters.groupBy,
          page,
          pageSize,
        }),
        fetchAttendanceDashboardStats(supabase, queryFilters),
      ]);

      setRows(pageResult.rows);
      setTotalCount(pageResult.count ?? pageResult.rows.length);
      setStats(summary);
    } catch (err) {
      console.error(err);
      setRows([]);
      setTotalCount(0);
      setStats(null);
      setError(formatPeopleAttendanceError(err));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [
    filters.siteId,
    filters.startDate,
    filters.endDate,
    filters.month,
    filters.year,
    filters.attCode,
    filters.searchApplied,
    filters.groupBy,
    filters.sortBy,
    filters.sortDir,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);

  const columns = useMemo(
    () =>
      buildAttendanceColumns({
        onSort: filters.handleSort,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        StatusChip,
        Badge,
      }),
    [filters.handleSort, filters.sortBy, filters.sortDir]
  );

  const filterProps = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    siteId: filters.siteId,
    sites: filters.sites,
    month: filters.month,
    year: filters.year,
    attCode: filters.attCode,
    search: filters.search,
    groupBy: filters.groupBy,
    onStartDateChange: filters.setStartDate,
    onEndDateChange: filters.setEndDate,
    onSiteChange: filters.setSiteId,
    onMonthChange: filters.setMonth,
    onYearChange: filters.setYear,
    onAttCodeChange: filters.setAttCode,
    onSearchChange: filters.setSearch,
    onGroupByChange: filters.setGroupBy,
    onPeriodPreset: filters.handlePeriodPreset,
    onApplySearch: () => {
      filters.applySearch();
      setPage(1);
    },
    onReset: () => {
      filters.resetFilters();
      setPage(1);
      setPageSize(50);
    },
    onRefresh: load,
    loading,
    sitesError: filters.sitesError,
    showGrouping: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {MARK_LEGEND.map((m) => (
          <span
            key={m.code}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${m.tone}`}
          >
            <span className="font-semibold">{m.code}</span>
            <span className="opacity-80 hidden sm:inline">{m.label}</span>
          </span>
        ))}
      </div>

      <SummaryCards stats={stats} loading={loading} totalCount={totalCount} />

      <SectionCard title="Filters & search">
        <AttendanceFilters {...filterProps} />
      </SectionCard>

      <SectionCard
        title="Attendance register"
        right={
          <span className="text-[11px] text-gray-500 tabular-nums">
            {loading ? "Loading…" : `${totalCount.toLocaleString()} record${totalCount === 1 ? "" : "s"}`}
          </span>
        }
      >
        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}

        {!loading && rows.length === 0 && !error ? (
          <div className="py-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-sm font-medium text-gray-800">No records for these filters</p>
            <p className="mt-1 text-xs text-gray-500">Try widening the date range or clearing search.</p>
          </div>
        ) : (
          <AttendanceRegisterTable
            columns={columns}
            rows={rows}
            groupBy={filters.groupBy}
            serialOffset={(page - 1) * pageSize}
            loading={loading}
          />
        )}

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
      </SectionCard>
    </div>
  );
}

export default function Attendance() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const filters = useAttendanceFilters();

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-[1800px] mx-auto w-full flex flex-col gap-4">
      <PageTaskHeader
        title="Attendance"
        subtitle="Review period summaries on the dashboard, then browse the register with sortable columns and server-side filters."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Attendance views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "dashboard"}
          className={tabClass(activeTab === "dashboard")}
          onClick={() => setActiveTab("dashboard")}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "register"}
          className={tabClass(activeTab === "register")}
          onClick={() => setActiveTab("register")}
        >
          <List className="h-4 w-4 shrink-0" />
          Register
        </button>
      </div>

      {activeTab === "dashboard" ? (
        <AttendanceDashboardTab filters={filters} onOpenRegister={() => setActiveTab("register")} />
      ) : (
        <AttendanceRegisterTab filters={filters} />
      )}
    </div>
  );
}
