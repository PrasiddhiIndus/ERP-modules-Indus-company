import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DenseTable, FilterBar, SectionCard, TinyInput, TinySelect } from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../lib/toast";
import {
  allCalendarMonthKeysForYear,
  buildCompOffEmployeeRows,
  compOffMonthLabel,
  compOffCutoffMonthKey,
  isCompOffMonthBeforeCutoff,
  fetchCompOffMonthlySummary,
  formatCompOffError,
  saveCompOffAvailableBalance,
  sortCompOffEmployeeRows,
  subscribeCompOffRealtime,
} from "../../../lib/compOffBalance";
import { isSupabaseRealtimeEnabled } from "../../../lib/supabaseConfig";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function fmtCell(v) {
  if (v == null) return "—";
  const n = Number(v || 0);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
}

export default function EmployeeCoBalanceTab({
  employees,
  year,
  onYearChange,
  loadingEmployees,
  canEditBalances = false,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summaryRows, setSummaryRows] = useState([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState({ field: "empCode", direction: "asc" });
  const [editingCode, setEditingCode] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const editDraftRef = useRef("");
  const [editSaving, setEditSaving] = useState(false);

  const monthKeys = useMemo(() => allCalendarMonthKeysForYear(year), [year]);
  const cutoffLabel = compOffCutoffMonthKey();
  const currentMonthKey = cutoffLabel;
  const canEditCurrentYear = canEditBalances && year === Number(currentMonthKey.slice(0, 4));

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchCompOffMonthlySummary(supabase, year);
      setSummaryRows(rows);
    } catch (err) {
      setError(formatCompOffError(err));
      setSummaryRows([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!isSupabaseRealtimeEnabled()) return undefined;
    const debounceRef = { t: null };
    const unsub = subscribeCompOffRealtime(supabase, () => {
      clearTimeout(debounceRef.t);
      debounceRef.t = setTimeout(() => loadSummary(), 800);
    });
    return () => {
      clearTimeout(debounceRef.t);
      unsub();
    };
  }, [loadSummary]);

  const gridRows = useMemo(
    () => buildCompOffEmployeeRows(employees, summaryRows, year),
    [employees, summaryRows, year]
  );

  const departmentOptions = useMemo(() => {
    const set = new Set(gridRows.map((r) => r.department).filter((d) => d && d !== "—"));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [gridRows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gridRows.filter((row) => {
      if (departmentFilter && row.department !== departmentFilter) return false;
      if (!q) return true;
      return (
        String(row.empCode || "").toLowerCase().includes(q) ||
        String(row.employeeName || "").toLowerCase().includes(q) ||
        String(row.department || "").toLowerCase().includes(q)
      );
    });
  }, [gridRows, search, departmentFilter]);

  const sortedRows = useMemo(
    () => sortCompOffEmployeeRows(filteredRows, sort.field, sort.direction),
    [filteredRows, sort.field, sort.direction]
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, departmentFilter, year, pageSize, sort.field, sort.direction]);

  const renderSortIndicator = useCallback(
    (key) => {
      const active = sort.field === key;
      const ascActive = active && sort.direction === "asc";
      const descActive = active && sort.direction === "desc";
      return (
        <span className="inline-flex items-center gap-0.5 ml-0.5 text-[9px] align-middle leading-none">
          <span className={ascActive ? "text-accent" : "text-gray-300"}>▲</span>
          <span className={descActive ? "text-accent" : "text-gray-300"}>▼</span>
        </span>
      );
    },
    [sort.direction, sort.field]
  );

  const toggleSort = useCallback((key) => {
    setSort((prev) =>
      prev.field === key
        ? { field: key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field: key, direction: "asc" }
    );
  }, []);

  const sortableHeader = useCallback(
    (key, label, align = "left") => (
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center font-semibold hover:text-accent w-full ${
          align === "center" ? "justify-center text-center" : "text-left"
        }`}
      >
        {label}
        {renderSortIndicator(key)}
      </button>
    ),
    [renderSortIndicator, toggleSort]
  );

  const cancelEdit = useCallback(() => {
    setEditingCode(null);
    setEditDraft("");
    editDraftRef.current = "";
  }, []);

  const startEdit = useCallback((row) => {
    // Edit adjusts usable available balance (2-month validity), not month earned count.
    const draft = String(Number(row.availableNow || 0));
    editDraftRef.current = draft;
    setEditDraft(draft);
    setEditingCode(row.empCode);
  }, []);

  const saveEdit = useCallback(
    async (row) => {
      setEditSaving(true);
      setError("");
      try {
        await saveCompOffAvailableBalance(supabase, row.empCode, editDraftRef.current);
        cancelEdit();
        await loadSummary();
        toast.success("C/O balance saved.");
      } catch (err) {
        const msg = formatCompOffError(err);
        toast.error(msg);
        setError(msg);
      } finally {
        setEditSaving(false);
      }
    },
    [cancelEdit, loadSummary]
  );

  const tableLoading = loading || loadingEmployees;

  const renderMonthCell = useCallback(
    (row, mk) => {
      const isCurrentMonth = mk === currentMonthKey;
      const isEditing = editingCode === row.empCode;
      if (isEditing && isCurrentMonth && canEditCurrentYear) {
        return (
          <input
            type="number"
            min="0"
            step="0.5"
            value={editDraft}
            onChange={(e) => {
              editDraftRef.current = e.target.value;
              setEditDraft(e.target.value);
            }}
            disabled={editSaving}
            className="h-6 w-12 max-w-[52px] rounded border border-gray-300 px-1 text-[11px] leading-tight text-center tabular-nums"
          />
        );
      }
      return fmtCell(row.monthBalances?.[mk]);
    },
    [canEditCurrentYear, currentMonthKey, editDraft, editSaving, editingCode]
  );

  const columns = useMemo(() => {
    const base = [
      {
        key: "empCode",
        label: "Code",
        className: "whitespace-nowrap font-mono text-[11px]",
        headerRender: () => sortableHeader("empCode", "Code"),
      },
      {
        key: "employeeName",
        label: "Employee",
        className: "min-w-[140px]",
        headerRender: () => sortableHeader("employeeName", "Employee"),
      },
      {
        key: "department",
        label: "Department",
        className: "whitespace-nowrap",
        headerRender: () => sortableHeader("department", "Department"),
      },
    ];

    for (const mk of monthKeys) {
      const beforeCutoff = isCompOffMonthBeforeCutoff(mk);
      const colKey = `m_${mk}`;
      const isCurrentMonth = mk === currentMonthKey;
      base.push({
        key: colKey,
        label: compOffMonthLabel(mk),
        className: `text-center tabular-nums min-w-[2.5rem] ${
          beforeCutoff ? "text-gray-300" : isCurrentMonth ? "text-gray-900 font-medium" : "text-gray-900"
        }`,
        headerRender: () => sortableHeader(colKey, compOffMonthLabel(mk), "center"),
        render: (r) => renderMonthCell(r, mk),
      });
    }

    if (canEditCurrentYear) {
      base.push({
        key: "actions",
        label: "Actions",
        className: "whitespace-nowrap min-w-[100px]",
        render: (r) => {
          if (editingCode === r.empCode) {
            return (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => saveEdit(r)}
                  disabled={!r.empCode || editSaving}
                  className="text-[11px] font-semibold text-emerald-700 hover:underline disabled:opacity-50"
                >
                  {editSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={editSaving}
                  className="text-[11px] font-semibold text-gray-600 hover:underline disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            );
          }
          return (
            <button
              type="button"
              onClick={() => startEdit(r)}
              disabled={!r.empCode || tableLoading || !!editingCode}
              className="text-[11px] font-semibold text-accent hover:underline disabled:opacity-50"
            >
              Edit
            </button>
          );
        },
      });
    } else if (canEditBalances) {
      base.push({
        key: "actions",
        label: "Actions",
        className: "whitespace-nowrap",
        render: () => <span className="text-[11px] text-gray-400">View only</span>,
      });
    }

    return base;
  }, [
    canEditBalances,
    canEditCurrentYear,
    cancelEdit,
    currentMonthKey,
    editSaving,
    editingCode,
    monthKeys,
    renderMonthCell,
    saveEdit,
    sortableHeader,
    startEdit,
    tableLoading,
  ]);

  return (
    <SectionCard title={`C/O Balances (${year})`} className="mt-4">
      <p className="text-xs text-gray-600 mb-3">
        Each month shows remaining C/O <strong>earned in that month</strong> (by work date on WO/NH/PH). Marking CO
        reduces that month&apos;s remaining value; credits are not copied into later months. Unused amounts expire 2
        months after the earning date. Data from <strong>{compOffMonthLabel(cutoffLabel)}</strong> onward — earlier
        months are blank.
        {canEditCurrentYear ? (
          <>
            {" "}
            <strong>Edit</strong> adjusts the currently available (usable) balance; month columns stay remaining of
            that month&apos;s earnings.
          </>
        ) : null}
      </p>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <FilterBar>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Search</label>
          <TinyInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code, name, department…"
            className="min-w-[240px]"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Department</label>
          <TinySelect
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="min-w-[160px]"
          >
            <option value="">All</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </TinySelect>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-semibold text-gray-500 uppercase">Year</label>
          <TinyInput
            type="number"
            value={year}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="w-[100px]"
          />
        </div>
        <button
          type="button"
          onClick={loadSummary}
          disabled={tableLoading}
          className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold disabled:opacity-60 self-end"
        >
          Refresh
        </button>
      </FilterBar>

      <div className="mt-3 overflow-x-auto">
        {tableLoading ? (
          <div className="py-10 text-center text-xs text-gray-500">Loading C/O balances…</div>
        ) : pagedRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-gray-500">No employees match the current filters.</div>
        ) : (
          <DenseTable columns={columns} rows={pagedRows} rowKey="empCode" scrollMaxHeight="calc(100dvh - 20rem)" />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
        <span>
          {sortedRows.length} employee(s) · C/O data from {compOffMonthLabel(cutoffLabel)} onward
        </span>
        <div className="flex items-center gap-2">
          <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[100px]">
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </TinySelect>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-7 px-2 rounded border border-gray-300 bg-white disabled:opacity-50"
          >
            Prev
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-7 px-2 rounded border border-gray-300 bg-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
