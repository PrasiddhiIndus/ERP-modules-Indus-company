import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  SectionCard,
  DenseTable,
  FilterBar,
  TinyInput,
  TinySelect,
  StatusChip,
  Drawer,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import {
  REGISTER_BULK_BUTTON_CLASS,
  REGISTER_MARK_NHPH,
  REGISTER_STATUS_OPTIONS,
  applyBulkRegisterMarks,
  attachRegisterRowSummaries,
  buildMonthlyRegisterGrid,
  computeRegisterSummaryFooter,
  ATTENDANCE_REGISTER_TABLE,
  dayOfMonthFromIsoDate,
  defaultBulkDateForMonth,
  deleteRegisterMarksBatch,
  downloadMonthlyRegisterExcel,
  formatAttendanceSupabaseError,
  fetchActiveEmployees,
  fetchAttendancePunchesInRange,
  isoMonthToday,
  loadRegisterMarksForMonth,
  monthDateRange,
  registerDateFromDay,
  registerDayTableLabel,
  REGISTER_MARK_SELECT_INNER,
  registerMarkCellWrapperClass,
  registerMarkSelectTextClass,
  upsertRegisterMark,
  upsertRegisterMarksBatch,
  normalizeAttendanceEmpCode,
  resolveAttendanceEmpCodeFilter,
} from "../../../lib/attendanceDaily";

const PAGE_SIZES = [25, 50, 100, 200];

const SUMMARY_COLUMNS = [
  { key: "leave", label: "Leave", field: "leave" },
  { key: "weekoff", label: "Weekoff", field: "weekoff" },
  { key: "appliedWo", label: "Applied WO", field: "appliedWo" },
  { key: "nhph", label: "NH/PH", field: "nhph", decimals: true },
  { key: "ot", label: "OT", field: "ot" },
  { key: "totalPresent", label: "Total present", field: "totalPresent" },
];

const BULK_MARKS = [
  { mark: "P", label: "Mark P" },
  { mark: "L", label: "Mark L" },
  { mark: "WO", label: "Mark WO" },
  { mark: REGISTER_MARK_NHPH, label: "Mark NH/PH" },
];

function formatSummaryValue(value, decimals) {
  if (decimals) return Number(value || 0).toFixed(2);
  return value ?? 0;
}

function SummaryFooterRow({ footer, colSpan = 2 }) {
  return (
    <tr className="bg-sky-50/90 border-t-2 border-sky-200 font-bold text-gray-900">
      <td colSpan={colSpan} className="px-2 py-2 text-xs">
        Total
      </td>
      {SUMMARY_COLUMNS.map((col) => (
        <td key={col.key} className="px-2 py-2 text-xs text-center tabular-nums">
          {formatSummaryValue(footer[col.field], col.decimals)}
        </td>
      ))}
    </tr>
  );
}

export function EmployeeAttendanceDailyPage() {
  const [monthValue, setMonthValue] = useState(isoMonthToday());
  const [empCode, setEmpCode] = useState("");
  const [search, setSearch] = useState("");
  const [punches, setPunches] = useState([]);
  const [manualMarks, setManualMarks] = useState({});
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [summaryOverlayOpen, setSummaryOverlayOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingMark, setSavingMark] = useState(false);
  const [registerCodeWarning, setRegisterCodeWarning] = useState("");

  const monthMeta = useMemo(() => monthDateRange(monthValue), [monthValue]);

  useEffect(() => {
    if (!monthMeta?.monthKey) return;
    setBulkDate(defaultBulkDateForMonth(monthMeta.monthKey));
  }, [monthMeta?.monthKey]);

  const loadData = useCallback(async () => {
    if (!monthMeta) {
      setError("Select a valid month.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [punchRows, employees, marks] = await Promise.all([
        fetchAttendancePunchesInRange(supabase, {
          fromDate: monthMeta.fromDate,
          toDate: monthMeta.toDate,
          empCode: resolveAttendanceEmpCodeFilter(empCode),
        }),
        fetchActiveEmployees(supabase),
        loadRegisterMarksForMonth(supabase, monthMeta),
      ]);
      const employeesWithCode = employees.filter((e) => e.empCode);
      setPunches(punchRows);
      setActiveEmployees(employeesWithCode);
      setManualMarks(marks);
      if (employees.length > employeesWithCode.length) {
        setRegisterCodeWarning(
          `${employees.length - employeesWithCode.length} active employee(s) hidden — add employee_code in Employee Master to include them in the register.`
        );
      } else {
        setRegisterCodeWarning("");
      }
    } catch (err) {
      setPunches([]);
      setManualMarks({});
      setRegisterCodeWarning("");
      setError(formatAttendanceSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [empCode, monthMeta]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { rows: gridRows, daysInMonth } = useMemo(() => {
    if (!monthMeta) return { rows: [], daysInMonth: 0 };
    return buildMonthlyRegisterGrid(punches, activeEmployees, {
      year: monthMeta.year,
      month: monthMeta.month,
      manualMarks,
    });
  }, [punches, activeEmployees, manualMarks, monthMeta]);

  const handleMarkChange = useCallback(
    async (empCodeKey, day, value) => {
      if (!monthMeta?.monthKey) return;
      const registerDate = registerDateFromDay(monthMeta.monthKey, day);
      const next = { ...manualMarks };
      const empMarks = { ...(next[empCodeKey] || {}) };
      if (!value) delete empMarks[day];
      else empMarks[day] = value;
      if (Object.keys(empMarks).length) next[empCodeKey] = empMarks;
      else delete next[empCodeKey];
      setManualMarks(next);

      setSavingMark(true);
      try {
        await upsertRegisterMark(supabase, empCodeKey, registerDate, value);
      } catch (err) {
        setError(formatAttendanceSupabaseError(err));
        try {
          const marks = await loadRegisterMarksForMonth(supabase, monthMeta);
          setManualMarks(marks);
        } catch {
          /* ignore reload failure */
        }
      } finally {
        setSavingMark(false);
      }
    },
    [manualMarks, monthMeta]
  );

  const filteredRows = useMemo(() => {
    const codeFilter = normalizeAttendanceEmpCode(empCode.trim());
    const needle = search.trim().toLowerCase();
    return gridRows.filter((row) => {
      if (codeFilter && row.empCode !== codeFilter) return false;
      if (!needle) return true;
      return [row.employeeId, row.empCode, row.employeeName].join(" ").toLowerCase().includes(needle);
    });
  }, [gridRows, search, empCode]);

  const rowsWithSummary = useMemo(
    () => attachRegisterRowSummaries(filteredRows, manualMarks, daysInMonth),
    [filteredRows, manualMarks, daysInMonth]
  );

  const summaryFooter = useMemo(() => computeRegisterSummaryFooter(rowsWithSummary), [rowsWithSummary]);

  const totalPages = Math.max(1, Math.ceil(rowsWithSummary.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = rowsWithSummary.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, rowsWithSummary.length);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rowsWithSummary.slice(start, start + pageSize);
  }, [currentPage, pageSize, rowsWithSummary]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, rowsWithSummary.length, search, monthValue, empCode]);

  const handleExportExcel = async () => {
    if (!monthMeta || !rowsWithSummary.length) return;
    setExporting(true);
    try {
      await downloadMonthlyRegisterExcel(rowsWithSummary, daysInMonth, monthMeta?.monthKey);
    } finally {
      setExporting(false);
    }
  };

  const handleBulkMark = useCallback(
    async (mark) => {
      if (!monthMeta?.monthKey) return;
      const day = dayOfMonthFromIsoDate(bulkDate);
      if (!day || !bulkDate.startsWith(monthMeta.monthKey)) return;
      const empCodes = filteredRows.map((r) => r.empCode);
      if (!empCodes.length) return;

      const next = applyBulkRegisterMarks(manualMarks, gridRows, {
        empCodes,
        dayFrom: day,
        dayTo: day,
        mark,
        overwrite: bulkOverwrite,
      });

      const upserts = [];
      const deletes = [];
      for (const code of empCodes) {
        const prev = manualMarks[code]?.[day];
        const updated = next[code]?.[day];
        if (prev === updated) continue;
        if (updated) {
          upserts.push({
            employee_code: code,
            register_date: bulkDate,
            month_key: monthMeta.monthKey,
            mark: updated,
            updated_at: new Date().toISOString(),
          });
        } else {
          deletes.push({ employee_code: code, register_date: bulkDate });
        }
      }

      setManualMarks(next);
      setSavingMark(true);
      try {
        if (upserts.length) await upsertRegisterMarksBatch(supabase, upserts);
        if (deletes.length) await deleteRegisterMarksBatch(supabase, deletes);
      } catch (err) {
        setError(formatAttendanceSupabaseError(err));
        try {
          const marks = await loadRegisterMarksForMonth(supabase, monthMeta);
          setManualMarks(marks);
        } catch {
          /* ignore */
        }
      } finally {
        setSavingMark(false);
      }
    },
    [bulkDate, bulkOverwrite, filteredRows, gridRows, manualMarks, monthMeta]
  );

  const summaryColumnDefs = useMemo(
    () =>
      SUMMARY_COLUMNS.map((col) => ({
        key: col.key,
        label: col.label,
        render: (row) => (
          <span className="tabular-nums font-medium text-gray-800">
            {formatSummaryValue(row.summary?.[col.field], col.decimals)}
          </span>
        ),
      })),
    []
  );

  const columns = useMemo(() => {
    const fixed = [
      { key: "employeeId", label: "Employee ID" },
      {
        key: "empCode",
        label: "Employee code",
        render: (row) => row.empCode || "—",
      },
      { key: "employeeName", label: "Employee Name" },
    ];
    const monthKey = monthMeta?.monthKey || "";
    const dayCols = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const isoDate = monthKey ? registerDateFromDay(monthKey, day) : "";
      return {
        key: `d${day}`,
        label: monthKey ? registerDayTableLabel(monthKey, day) : String(day),
        headerTitle: isoDate || undefined,
        render: (row) => {
          const value = row.dayMarks[day] || "";
          return (
            <div
              onClick={(e) => e.stopPropagation()}
              className={registerMarkCellWrapperClass(value)}
            >
              <select
                value={value}
                onChange={(e) => handleMarkChange(row.empCode, day, e.target.value)}
                className={`${REGISTER_MARK_SELECT_INNER} ${registerMarkSelectTextClass(value)}`}
                title={REGISTER_STATUS_OPTIONS.find((o) => o.value === value)?.label || "No mark"}
              >
                {REGISTER_STATUS_OPTIONS.map((o) => (
                  <option key={o.value || "blank"} value={o.value}>
                    {o.value || "—"}
                  </option>
                ))}
              </select>
            </div>
          );
        },
      };
    });
    return [...fixed, ...dayCols, ...summaryColumnDefs];
  }, [daysInMonth, handleMarkChange, monthMeta?.monthKey, summaryColumnDefs]);

  return (
    <div className="space-y-3">
      <SectionCard
        title="Daily Attendance Register"
        right={
          <StatusChip
            label={
              loading ? "Loading…" : savingMark ? "Saving…" : `${filteredRows.length} employee(s) · Supabase`
            }
            severity={loading || savingMark ? "warning" : "info"}
          />
        }
      >
        <FilterBar>
          <label className="text-[11px] text-gray-600">
            Month
            <TinyInput
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="w-[140px] ml-1"
            />
          </label>
          <TinyInput
            value={empCode}
            onChange={(e) => setEmpCode(e.target.value)}
            placeholder="Employee code (optional)"
            className="w-[140px]"
          />
          <TinyInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / code"
            className="min-w-[160px]"
          />
          <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[100px]">
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </TinySelect>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="h-8 px-3 rounded-lg border border-gray-300 text-xs disabled:opacity-60"
          >
            {loading ? "Loading…" : "Reload"}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!rowsWithSummary.length || exporting}
            className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
          <button
            type="button"
            onClick={() => setSummaryOverlayOpen(true)}
            disabled={!rowsWithSummary.length}
            className="h-8 px-3 rounded-lg border-2 border-[#1F3A8A] bg-[#1F3A8A]/5 text-[#1F3A8A] text-xs font-semibold disabled:opacity-60 hover:bg-[#1F3A8A]/10 inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V17a2 2 0 01-2 2z" />
            </svg>
            Register summary
          </button>
        </FilterBar>

        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
          <p className="text-[11px] font-semibold text-gray-700 mb-2">Bulk mark (filtered employees: {filteredRows.length})</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-gray-600">
              Date
              <TinyInput
                type="date"
                min={monthMeta?.fromDate}
                max={monthMeta?.toDate}
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                className="w-[140px] ml-1"
              />
            </label>
            <label className="text-[11px] text-gray-600 flex items-center gap-1.5 h-8">
              <input
                type="checkbox"
                checked={bulkOverwrite}
                onChange={(e) => setBulkOverwrite(e.target.checked)}
                className="rounded"
              />
              Overwrite existing marks
            </label>
            {BULK_MARKS.map((b) => (
              <button
                key={b.mark}
                type="button"
                onClick={() => handleBulkMark(b.mark)}
                disabled={!filteredRows.length}
                className={`h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 ${REGISTER_BULK_BUTTON_CLASS[b.mark] || ""}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {gridRows.length === 0 && !loading && !error && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No employees in master, or no data for this month. Sync punches from{" "}
            <Link to="/app/admin/employee/attendance-inputs" className="font-medium underline">
              Raw Attendance Data
            </Link>{" "}
            — Present (P) is filled automatically when a punch exists for that day.
          </div>
        )}

        {registerCodeWarning && !error && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {registerCodeWarning}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}

        <div className="mt-3">
          <DenseTable columns={columns} rows={pagedRows} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
            <span>
              Showing {pageStart}-{pageEnd} of {rowsWithSummary.length} · {activeEmployees.length} active in master
              {monthMeta ? ` · ${monthMeta.monthKey}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-7 px-2 rounded border border-gray-300 disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-7 px-2 rounded border border-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-gray-500">
          Marks are saved in <code className="text-[10px]">{ATTENDANCE_REGISTER_TABLE}</code> (Supabase). Present from
          punches uses <code className="text-[10px]">erp_attendance_punches</code>. Use{" "}
          <code className="text-[10px]">fetchMonthlyRegisterPayrollTotals</code> for salary month totals.
        </p>
      </SectionCard>

      <Drawer
        open={summaryOverlayOpen}
        title={`Register summary${monthMeta ? ` — ${monthMeta.monthKey}` : ""}`}
        onClose={() => setSummaryOverlayOpen(false)}
        widthClass="max-w-3xl"
      >
        <p className="text-[11px] text-gray-500 mb-3">
          Totals per employee for the filtered list. Applied WO = weekoffs marked manually in the grid.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Employee ID</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Employee code</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Employee Name</th>
                {SUMMARY_COLUMNS.map((col) => (
                  <th key={col.key} className="text-center font-semibold px-2 py-2 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rowsWithSummary.map((row) => (
                <tr key={row.id} className="hover:bg-sky-50/40">
                  <td className="px-2 py-1.5 font-medium text-gray-800">{row.employeeId || "—"}</td>
                  <td className="px-2 py-1.5 text-gray-700 tabular-nums">{row.empCode || "—"}</td>
                  <td className="px-2 py-1.5 text-gray-700">{row.employeeName}</td>
                  {SUMMARY_COLUMNS.map((col) => (
                    <td key={col.key} className="px-2 py-1.5 text-center tabular-nums text-gray-800">
                      {formatSummaryValue(row.summary?.[col.field], col.decimals)}
                    </td>
                  ))}
                </tr>
              ))}
              <SummaryFooterRow footer={summaryFooter} colSpan={3} />
            </tbody>
          </table>
        </div>
      </Drawer>
    </div>
  );
}
