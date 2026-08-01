import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLeaveRequests,
  fetchLeaveStatusCounts,
  fetchLeaveTypes,
  formatLeaveDateRange,
  LEAVE_STATUS_FILTER_OPTIONS,
  leaveTypeLabel,
  subscribeLeaveWorkflowRealtime,
} from "../../../lib/adminLeaveRequests";
import { isSupabaseRealtimeEnabled } from "../../../lib/supabaseConfig";
import { formatDateTimeDdMmYyyy } from "../../../utils/dateDisplay";

import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  KpiTile,
  PageTaskHeader,
  CollapsibleHelp,
} from "../components/AdminUi";

const PAGE_SIZES = [25, 50, 100];
const SEARCH_DEBOUNCE_MS = 400;
const REALTIME_DEBOUNCE_MS = 450;

const STATUS_KPI = [
  { id: "pending", label: "Pending", tone: "border-amber-200 bg-amber-50/40" },
  { id: "approved", label: "Approved", tone: "border-sky-200 bg-sky-50/40" },
  { id: "rejected", label: "Rejected", tone: "border-red-200 bg-red-50/40" },
  { id: "cancelled", label: "Cancelled", tone: "border-gray-200" },
  { id: "all", label: "All requests", tone: "border-accent/20 bg-indigo-50/30" },
];

function statusFilterLabel(value) {
  return LEAVE_STATUS_FILTER_OPTIONS.find((o) => o.value === value)?.label || value;
}

function formatTs(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return formatDateTimeDdMmYyyy(d);
}

/** Display status: Approved / Rejected / Pending only. */
function statusDisplayLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return "Pending";
}

function statusChipSeverity(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "info";
  if (s === "rejected") return "critical";
  return "warning";
}

/** Who approved or rejected; blank while pending. */
function decisionByLabel(row) {
  const status = String(row?.status || "").toLowerCase();
  const name = String(row?.approver_name || "").trim();
  const code = String(row?.approver_employee_code || "").trim();
  const who = name || code;
  if (!who) return "—";
  if (status === "approved") return `Approved by ${who}`;
  if (status === "rejected") return `Rejected by ${who}`;
  return "—";
}

export function EmployeeLeavesPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [realtimeLive, setRealtimeLive] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState(null);
  const [leaveTypes, setLeaveTypes] = useState({ rows: [], byCode: {} });
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [empSearch, setEmpSearch] = useState("");
  const [empSearchDebounced, setEmpSearchDebounced] = useState("");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const loadSeqRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setEmpSearchDebounced(empSearch.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [empSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const types = await fetchLeaveTypes();
        if (!cancelled) setLeaveTypes(types);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCounts = useCallback(async () => {
    try {
      const counts = await fetchLeaveStatusCounts();
      setStatusCounts(counts);
    } catch {
      /* keep previous counts */
    }
  }, []);

  const loadRequests = useCallback(
    async ({ silent = false } = {}) => {
      const seq = ++loadSeqRef.current;
      if (!silent) {
        setInitialLoading(true);
        setError("");
      } else {
        setRefreshing(true);
      }

      try {
        const result = await fetchLeaveRequests({
          status: statusFilter,
          empSearch: empSearchDebounced,
          leaveType: leaveTypeFilter,
          fromDate,
          toDate,
          page,
          pageSize,
        });
        if (seq !== loadSeqRef.current) return;
        setRows(result.rows);
        setTotal(result.total);
      } catch (e) {
        if (seq !== loadSeqRef.current) return;
        if (!silent) {
          setRows([]);
          setTotal(0);
        }
        setError(e?.message || "Failed to load leave requests.");
      } finally {
        if (seq === loadSeqRef.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [statusFilter, empSearchDebounced, leaveTypeFilter, fromDate, toDate, page, pageSize]
  );

  useEffect(() => {
    loadRequests({ silent: false });
    refreshCounts();
  }, [loadRequests, refreshCounts]);

  useEffect(() => {
    let debounce = null;
    const scheduleReload = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        loadRequests({ silent: true });
        refreshCounts();
      }, REALTIME_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeLeaveWorkflowRealtime(scheduleReload);
    setRealtimeLive(isSupabaseRealtimeEnabled());

    return () => {
      if (debounce) window.clearTimeout(debounce);
      unsubscribe();
    };
  }, [loadRequests, refreshCounts]);

  const resetFilters = () => {
    setEmpSearch("");
    setEmpSearchDebounced("");
    setLeaveTypeFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const changeStatusFilter = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const tableRows = useMemo(
    () =>
      rows.map((r) => {
        const emp = r.employee || {};
        const status = String(r.status || "").toLowerCase();
        return {
          id: r.id,
          empDisplay: emp.full_name || r.employee_code || "—",
          empCode: r.employee_code || emp.employee_code || "—",
          department: emp.department || "—",
          leaveLabel: leaveTypeLabel(leaveTypes.byCode, r.leave_type_code),
          dateRange: formatLeaveDateRange(r.from_date, r.to_date),
          days: r.days,
          reason: r.reason,
          status,
          submitted_at: r.submitted_at,
          decided_at: r.decided_at,
          decisionBy: decisionByLabel(r),
          approver_name: r.approver_name,
          approver_employee_code: r.approver_employee_code,
        };
      }),
    [rows, leaveTypes.byCode]
  );

  const showTable = !initialLoading || rows.length > 0;
  const isEmpty = !initialLoading && rows.length === 0;

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Leave request approval"
        subtitle="View leave requests from Indus One. Status shows Pending, Approved, or Rejected, including who approved or rejected each request."
      >
        {realtimeLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live updates
          </span>
        ) : null}
        {refreshing ? (
          <span className="text-[11px] text-gray-500 tabular-nums">Updating…</span>
        ) : null}
      </PageTaskHeader>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STATUS_KPI.map((kpi) => (
          <KpiTile
            key={kpi.id}
            label={kpi.label}
            value={statusCounts ? statusCounts[kpi.id] ?? "—" : "…"}
            tone={`${kpi.tone} ${statusFilter === kpi.id ? "ring-2 ring-accent/40" : ""}`}
            onClick={() => changeStatusFilter(kpi.id)}
            sub={statusFilter === kpi.id ? "Filtered" : "Click to filter"}
          />
        ))}
      </div>

      <SectionCard
        title={`Requests · ${statusFilterLabel(statusFilter)}`}
        right={
          <StatusChip
            label={`${total} shown`}
            severity={statusFilter === "pending" ? "warning" : "info"}
          />
        }
      >
        <FilterBar>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Status</label>
            <TinySelect
              value={statusFilter}
              onChange={(e) => changeStatusFilter(e.target.value)}
              className="min-w-[150px]"
            >
              {LEAVE_STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {statusCounts && o.value !== "all" ? ` (${statusCounts[o.value] ?? 0})` : ""}
                  {statusCounts && o.value === "all" ? ` (${statusCounts.all ?? 0})` : ""}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Employee</label>
            <TinyInput
              value={empSearch}
              onChange={(e) => {
                setEmpSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Name or code…"
              className="min-w-[200px]"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">Leave type</label>
            <TinySelect
              value={leaveTypeFilter}
              onChange={(e) => {
                setLeaveTypeFilter(e.target.value);
                setPage(1);
              }}
              className="min-w-[140px]"
            >
              <option value="">All types</option>
              {leaveTypes.rows.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label || t.code}
                </option>
              ))}
            </TinySelect>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">From</label>
            <TinyInput
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-500 uppercase">To</label>
            <TinyInput
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              loadRequests({ silent: true });
              refreshCounts();
            }}
            disabled={initialLoading && !rows.length}
            className="h-8 px-3 rounded-lg border border-accent/30 bg-accent/5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-60"
          >
            Refresh
          </button>
        </FilterBar>

        <CollapsibleHelp label="about this list">
          This screen lists leave requests for all employees (not only your own). Approvals and
          rejections are recorded in Indus One; Pending, Approved, and Rejected statuses are shown
          here with the person who took the decision when available.
        </CollapsibleHelp>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
          <span>
            Page {currentPage} / {totalPages} · {total} request(s)
          </span>
          <TinySelect
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="w-[110px]"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </TinySelect>
        </div>

        <div
          className={`mt-2 relative rounded-lg transition-opacity duration-200 ${
            refreshing ? "opacity-90" : "opacity-100"
          }`}
        >
          {initialLoading && !rows.length ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-12 text-center text-sm text-gray-500">
              Loading leave requests…
            </div>
          ) : null}

          {isEmpty ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-800">No requests in this view</p>
              <p className="text-xs text-gray-500 mt-1">
                Try another status filter or clear search dates.
              </p>
            </div>
          ) : null}

          {showTable && !isEmpty ? (
            <DenseTable
              rows={tableRows}
              rowKey="id"
              onRowClick={undefined}
              columns={[
                {
                  key: "emp",
                  label: "Employee",
                  render: (r) => (
                    <div>
                      <div className="font-medium text-gray-900">{r.empDisplay}</div>
                      <div className="text-[10px] text-gray-500">
                        {r.empCode}
                        {r.department !== "—" ? ` · ${r.department}` : ""}
                      </div>
                    </div>
                  ),
                },
                { key: "leaveLabel", label: "Type" },
                { key: "dateRange", label: "Dates" },
                {
                  key: "days",
                  label: "Days",
                  cellClassName: "text-right tabular-nums",
                  render: (r) => Number(r.days ?? 0),
                },
                {
                  key: "reason",
                  label: "Reason",
                  render: (r) => (
                    <span className="line-clamp-2 max-w-[220px]" title={r.reason || ""}>
                      {r.reason || "—"}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (r) => (
                    <StatusChip
                      label={statusDisplayLabel(r.status)}
                      severity={statusChipSeverity(r.status)}
                    />
                  ),
                },
                {
                  key: "decisionBy",
                  label: "Approved / Rejected by",
                  render: (r) => (
                    <div className="text-[11px] text-gray-800 max-w-[180px]">
                      <div className="font-medium">{r.decisionBy}</div>
                      {r.approver_name && r.approver_employee_code ? (
                        <div className="text-[10px] text-gray-500">{r.approver_employee_code}</div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: "submitted_at",
                  label: "Submitted",
                  render: (r) => formatTs(r.submitted_at),
                },
                {
                  key: "decided_at",
                  label: "Decided",
                  render: (r) => formatTs(r.decided_at),
                },
              ]}
            />
          ) : null}
        </div>

        {!isEmpty ? (
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || initialLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages || initialLoading}
              onClick={() => setPage((p) => p + 1)}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
