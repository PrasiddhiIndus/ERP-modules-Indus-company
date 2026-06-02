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
  KpiTile,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import {
  REGISTER_BULK_BUTTON_CLASS,
  REGISTER_MARK_NHPH,
  REGISTER_STATUS_OPTIONS,
  applyBulkRegisterMarks,
  attachRegisterRowSummaries,
  buildMonthlyRegisterGrid,
  mergeActiveEmployeesWithPunches,
  syncRegisterMarksFromPunches,
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
  computeDayAttendanceBreakdown,
  registerMarkStatusLabel,
} from "../../../lib/attendanceDaily";

const PAGE_SIZES = [25, 50, 100, 200];

const SCROLL_DAY_COL_CLASS = "min-w-[4.75rem] w-[4.75rem]";
const SCROLL_SUMMARY_COL_CLASS = "min-w-[5.5rem] w-[5.5rem] text-center";

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
  { mark: "P(OD)", label: "Mark P(OD)" },
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
  const [department, setDepartment] = useState("ALL");
  const [punches, setPunches] = useState([]);
  const [manualMarks, setManualMarks] = useState({});
  const [manualRemarks, setManualRemarks] = useState({});
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [summaryOverlayOpen, setSummaryOverlayOpen] = useState(false);
  const [dayAttendanceDrawer, setDayAttendanceDrawer] = useState({ open: false, mode: "total" });
  const [tableDayAttendanceFilter, setTableDayAttendanceFilter] = useState(null);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [bulkPodComment, setBulkPodComment] = useState("");
  const [bulkPodCommentOpen, setBulkPodCommentOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingMark, setSavingMark] = useState(false);
  const [registerCodeWarning, setRegisterCodeWarning] = useState("");
  const [commentEditor, setCommentEditor] = useState({
    open: false,
    empCode: "",
    day: null,
    value: "",
  });

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
      const [punchRows, employees] = await Promise.all([
        fetchAttendancePunchesInRange(supabase, {
          fromDate: monthMeta.fromDate,
          toDate: monthMeta.toDate,
          empCode: resolveAttendanceEmpCodeFilter(empCode),
        }),
        fetchActiveEmployees(supabase),
      ]);
      await syncRegisterMarksFromPunches(supabase, punchRows, {
        fromDate: monthMeta.fromDate,
        toDate: monthMeta.toDate,
      });
      const registerData = await loadRegisterMarksForMonth(supabase, monthMeta);
      const employeesWithCode = employees.filter((e) => e.empCode);
      setPunches(punchRows);
      setActiveEmployees(employeesWithCode);
      setManualMarks(registerData?.marks || {});
      setManualRemarks(registerData?.remarks || {});
      if (employees.length > employeesWithCode.length) {
        setRegisterCodeWarning(
          `${employees.length - employeesWithCode.length} active employee(s) hidden ? add employee_code in Employee Master to include them in the register.`
        );
      } else {
        setRegisterCodeWarning("");
      }
    } catch (err) {
      setPunches([]);
      setManualMarks({});
      setManualRemarks({});
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
    const employeesForGrid = mergeActiveEmployeesWithPunches(activeEmployees, punches);
    return buildMonthlyRegisterGrid(punches, employeesForGrid, {
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
      const nextRemarks = { ...manualRemarks };
      const empRemarks = { ...(nextRemarks[empCodeKey] || {}) };
      if (!value) delete empMarks[day];
      else empMarks[day] = value;
      if (value !== "P(OD)") delete empRemarks[day];
      if (Object.keys(empMarks).length) next[empCodeKey] = empMarks;
      else delete next[empCodeKey];
      if (Object.keys(empRemarks).length) nextRemarks[empCodeKey] = empRemarks;
      else delete nextRemarks[empCodeKey];
      setManualMarks(next);
      setManualRemarks(nextRemarks);
      if (value === "P(OD)") {
        setCommentEditor({
          open: true,
          empCode: empCodeKey,
          day,
          value: empRemarks[day] || "",
        });
      }

      setSavingMark(true);
      try {
        await upsertRegisterMark(supabase, empCodeKey, registerDate, value, value === "P(OD)" ? empRemarks[day] || "" : "");
      } catch (err) {
        setError(formatAttendanceSupabaseError(err));
        try {
          const registerData = await loadRegisterMarksForMonth(supabase, monthMeta);
          setManualMarks(registerData?.marks || {});
          setManualRemarks(registerData?.remarks || {});
        } catch {
          /* ignore reload failure */
        }
      } finally {
        setSavingMark(false);
      }
    },
    [manualMarks, manualRemarks, monthMeta]
  );

  const openPodCommentEditor = useCallback(
    (empCodeKey, day) => {
      if (manualMarks[empCodeKey]?.[day] !== "P(OD)") return;
      setCommentEditor({
        open: true,
        empCode: empCodeKey,
        day,
        value: manualRemarks[empCodeKey]?.[day] || "",
      });
    },
    [manualMarks, manualRemarks]
  );

  const closePodCommentEditor = useCallback(() => {
    setCommentEditor({ open: false, empCode: "", day: null, value: "" });
  }, []);

  const savePodCommentEditor = useCallback(async () => {
    if (!monthMeta?.monthKey || !commentEditor.empCode || !commentEditor.day) return;
    const { empCode: empCodeKey, day, value } = commentEditor;
    const trimmed = value.trim();
    const next = { ...manualRemarks };
    const empRemarks = { ...(next[empCodeKey] || {}) };
    if (!trimmed) delete empRemarks[day];
    else empRemarks[day] = trimmed;
    if (Object.keys(empRemarks).length) next[empCodeKey] = empRemarks;
    else delete next[empCodeKey];
    setManualRemarks(next);

    setSavingMark(true);
    try {
      await upsertRegisterMark(
        supabase,
        empCodeKey,
        registerDateFromDay(monthMeta.monthKey, day),
        "P(OD)",
        trimmed
      );
      closePodCommentEditor();
    } catch (err) {
      setError(formatAttendanceSupabaseError(err));
    } finally {
      setSavingMark(false);
    }
  }, [commentEditor, closePodCommentEditor, manualRemarks, monthMeta]);

  const filteredRows = useMemo(() => {
    const codeFilter = normalizeAttendanceEmpCode(empCode.trim());
    const needle = search.trim().toLowerCase();
    return gridRows.filter((row) => {
      if (codeFilter && row.empCode !== codeFilter) return false;
      if (department !== "ALL" && (row.department || "") !== department) return false;
      if (!needle) return true;
      return [row.employeeId, row.empCode, row.employeeName, row.department].join(" ").toLowerCase().includes(needle);
    });
  }, [gridRows, search, empCode, department]);

  const bulkDayNumber = useMemo(() => {
    if (!monthMeta?.monthKey || !bulkDate?.startsWith(monthMeta.monthKey)) return null;
    return dayOfMonthFromIsoDate(bulkDate);
  }, [bulkDate, monthMeta?.monthKey]);

  const dayAttendanceStats = useMemo(() => {
    if (!bulkDayNumber) {
      return {
        total: 0,
        present: 0,
        absent: 0,
        presentEmployees: [],
        absentEmployees: [],
        allEmployees: [],
      };
    }
    return computeDayAttendanceBreakdown(filteredRows, bulkDayNumber);
  }, [bulkDayNumber, filteredRows]);

  const dayFilteredRows = useMemo(() => {
    if (!tableDayAttendanceFilter || !bulkDayNumber) return filteredRows;
    if (tableDayAttendanceFilter === "present") return dayAttendanceStats.presentEmployees;
    if (tableDayAttendanceFilter === "absent") return dayAttendanceStats.absentEmployees;
    return filteredRows;
  }, [bulkDayNumber, dayAttendanceStats, filteredRows, tableDayAttendanceFilter]);

  const openDayAttendanceDrawer = useCallback((mode) => {
    setDayAttendanceDrawer({ open: true, mode });
    if (mode === "total") setTableDayAttendanceFilter(null);
    else setTableDayAttendanceFilter(mode);
  }, []);

  const rowsWithSummary = useMemo(
    () => attachRegisterRowSummaries(dayFilteredRows, manualMarks, daysInMonth),
    [dayFilteredRows, manualMarks, daysInMonth]
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
  }, [pageSize, rowsWithSummary.length, search, monthValue, empCode, department, tableDayAttendanceFilter, bulkDate]);

  useEffect(() => {
    setTableDayAttendanceFilter(null);
  }, [bulkDate, monthValue, empCode, department, search]);

  const handleExportExcel = async () => {
    if (!monthMeta || !rowsWithSummary.length) return;
    setExporting(true);
    try {
      const rowsWithRemarks = rowsWithSummary.map((row) => ({
        ...row,
        dayRemarks: manualRemarks[row.empCode] || {},
      }));
      await downloadMonthlyRegisterExcel(rowsWithRemarks, daysInMonth, monthMeta?.monthKey);
    } finally {
      setExporting(false);
    }
  };

  const handleBulkMark = useCallback(
    async (mark) => {
      if (!monthMeta?.monthKey) return;
      const day = dayOfMonthFromIsoDate(bulkDate);
      if (!day || !bulkDate.startsWith(monthMeta.monthKey)) return;
      const empCodes = dayFilteredRows.map((r) => r.empCode);
      if (!empCodes.length) return;

      if (mark === "P(OD)") {
        setBulkPodCommentOpen(true);
        return;
      }

      const next = applyBulkRegisterMarks(manualMarks, gridRows, {
        empCodes,
        dayFrom: day,
        dayTo: day,
        mark,
        overwrite: bulkOverwrite,
      });

      const upserts = [];
      const deletes = [];
      const nextRemarks = { ...manualRemarks };
      for (const code of empCodes) {
        const prev = manualMarks[code]?.[day];
        const updated = next[code]?.[day];
        if (prev === updated) continue;
        const existingRemark = nextRemarks[code]?.[day] || "";
        if (updated !== "P(OD)" && nextRemarks[code]?.[day]) {
          const empRemarks = { ...(nextRemarks[code] || {}) };
          delete empRemarks[day];
          if (Object.keys(empRemarks).length) nextRemarks[code] = empRemarks;
          else delete nextRemarks[code];
        }
        if (updated) {
          upserts.push({
            employee_code: code,
            register_date: bulkDate,
            month_key: monthMeta.monthKey,
            mark: updated,
            mark_remark: updated === "P(OD)" ? existingRemark : null,
            updated_at: new Date().toISOString(),
          });
        } else {
          deletes.push({ employee_code: code, register_date: bulkDate });
        }
      }

      setManualMarks(next);
      setManualRemarks(nextRemarks);
      setSavingMark(true);
      try {
        if (upserts.length) await upsertRegisterMarksBatch(supabase, upserts);
        if (deletes.length) await deleteRegisterMarksBatch(supabase, deletes);
      } catch (err) {
        setError(formatAttendanceSupabaseError(err));
        try {
          const registerData = await loadRegisterMarksForMonth(supabase, monthMeta);
          setManualMarks(registerData?.marks || {});
          setManualRemarks(registerData?.remarks || {});
        } catch {
          /* ignore */
        }
      } finally {
        setSavingMark(false);
      }
    },
    [bulkDate, bulkOverwrite, dayFilteredRows, gridRows, manualMarks, manualRemarks, monthMeta]
  );

  const handleBulkPodCommentApply = useCallback(async () => {
    if (!monthMeta?.monthKey) return;
    const day = dayOfMonthFromIsoDate(bulkDate);
    if (!day || !bulkDate.startsWith(monthMeta.monthKey)) return;
    const empCodes = dayFilteredRows.map((r) => r.empCode);
    if (!empCodes.length) return;
    const trimmed = bulkPodComment.trim();

    const next = applyBulkRegisterMarks(manualMarks, gridRows, {
      empCodes,
      dayFrom: day,
      dayTo: day,
      mark: "P(OD)",
      overwrite: bulkOverwrite,
    });

    const nextRemarks = { ...manualRemarks };
    const upserts = [];
    const deletes = [];
    for (const code of empCodes) {
      const prev = manualMarks[code]?.[day];
      const updated = next[code]?.[day];
      if (prev === updated && (updated !== "P(OD)" || (nextRemarks[code]?.[day] || "") === trimmed)) continue;
      if (updated === "P(OD)") {
        const empRemarks = { ...(nextRemarks[code] || {}) };
        if (!trimmed) delete empRemarks[day];
        else empRemarks[day] = trimmed;
        if (Object.keys(empRemarks).length) nextRemarks[code] = empRemarks;
        else delete nextRemarks[code];
        upserts.push({
          employee_code: code,
          register_date: bulkDate,
          month_key: monthMeta.monthKey,
          mark: "P(OD)",
          mark_remark: trimmed || null,
          updated_at: new Date().toISOString(),
        });
      } else if (!updated && prev) {
        deletes.push({ employee_code: code, register_date: bulkDate });
      }
    }

    setManualMarks(next);
    setManualRemarks(nextRemarks);
    setSavingMark(true);
    try {
      if (upserts.length) await upsertRegisterMarksBatch(supabase, upserts);
      if (deletes.length) await deleteRegisterMarksBatch(supabase, deletes);
      setBulkPodCommentOpen(false);
      setBulkPodComment("");
    } catch (err) {
      setError(formatAttendanceSupabaseError(err));
    } finally {
      setSavingMark(false);
    }
  }, [bulkDate, bulkOverwrite, bulkPodComment, dayFilteredRows, gridRows, manualMarks, manualRemarks, monthMeta]);

  const handleClearSelectedDate = useCallback(async () => {
    if (!monthMeta?.monthKey) return;
    const day = dayOfMonthFromIsoDate(bulkDate);
    if (!day || !bulkDate.startsWith(monthMeta.monthKey)) return;
    const empCodes = dayFilteredRows.map((r) => r.empCode);
    if (!empCodes.length) return;

    const nextMarks = { ...manualMarks };
    const nextRemarks = { ...manualRemarks };
    const deletes = [];
    for (const code of empCodes) {
      if (nextMarks[code]?.[day] != null) {
        const empMarks = { ...(nextMarks[code] || {}) };
        delete empMarks[day];
        if (Object.keys(empMarks).length) nextMarks[code] = empMarks;
        else delete nextMarks[code];
      }
      if (nextRemarks[code]?.[day] != null) {
        const empRemarks = { ...(nextRemarks[code] || {}) };
        delete empRemarks[day];
        if (Object.keys(empRemarks).length) nextRemarks[code] = empRemarks;
        else delete nextRemarks[code];
      }
      deletes.push({ employee_code: code, register_date: bulkDate });
    }

    setManualMarks(nextMarks);
    setManualRemarks(nextRemarks);
    setSavingMark(true);
    try {
      if (deletes.length) await deleteRegisterMarksBatch(supabase, deletes);
    } catch (err) {
      setError(formatAttendanceSupabaseError(err));
      try {
        const registerData = await loadRegisterMarksForMonth(supabase, monthMeta);
        setManualMarks(registerData?.marks || {});
        setManualRemarks(registerData?.remarks || {});
      } catch {
        /* ignore */
      }
    } finally {
      setSavingMark(false);
    }
  }, [bulkDate, dayFilteredRows, manualMarks, manualRemarks, monthMeta]);

  const departmentOptions = useMemo(() => {
    const values = new Set();
    for (const row of gridRows) {
      if (row.department) values.add(row.department);
    }
    return ["ALL", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [gridRows]);

  const summaryColumnDefs = useMemo(
    () =>
      SUMMARY_COLUMNS.map((col) => ({
        key: col.key,
        label: col.label,
        headerClassName: SCROLL_SUMMARY_COL_CLASS,
        cellClassName: SCROLL_SUMMARY_COL_CLASS,
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
      { key: "employeeId", label: "Employee ID", render: (row) => row.employeeId || "?" },
      {
        key: "empCode",
        label: "Employee code",
        render: (row) => row.empCode || "?",
      },
      { key: "employeeName", label: "Employee Name" },
      { key: "department", label: "Department", render: (row) => row.department || "?" },
    ];
    const monthKey = monthMeta?.monthKey || "";
    const dayCols = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const isoDate = monthKey ? registerDateFromDay(monthKey, day) : "";
      return {
        key: `d${day}`,
        label: monthKey ? registerDayTableLabel(monthKey, day) : String(day),
        headerTitle: isoDate || undefined,
        headerClassName: SCROLL_DAY_COL_CLASS,
        cellClassName: SCROLL_DAY_COL_CLASS,
        render: (row) => {
          const value = row.dayMarks[day] || "";
          const comment = manualRemarks[row.empCode]?.[day] || "";
          const isPod = value === "P(OD)";
          return (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isPod) return;
                if (e.target.closest("select")) return;
                openPodCommentEditor(row.empCode, day);
              }}
              title={
                isPod
                  ? comment
                    ? `P(OD) ? ${comment} (click cell to edit comment)`
                    : "P(OD) ? click cell to add comment"
                  : undefined
              }
            >
              <div
                className={`${registerMarkCellWrapperClass(value)} relative group ${isPod ? "cursor-pointer" : ""}`}
              >
                <select
                  value={value}
                  onChange={(e) => handleMarkChange(row.empCode, day, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`${REGISTER_MARK_SELECT_INNER} ${registerMarkSelectTextClass(value)}`}
                  title={REGISTER_STATUS_OPTIONS.find((o) => o.value === value)?.label || "No mark"}
                >
                  {REGISTER_STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "blank"} value={o.value}>
                      {o.value || o.label}
                    </option>
                  ))}
                </select>
                {isPod && !!comment && (
                  <>
                    <span
                      className="absolute top-0 right-0 w-0 h-0 border-l-[8px] border-l-transparent border-t-[8px] border-t-red-500 pointer-events-none"
                      aria-hidden
                    />
                    <div className="pointer-events-none absolute z-20 right-0 top-full mt-1 hidden min-w-[180px] max-w-[260px] rounded border border-gray-300 bg-white p-2 text-[10px] text-gray-700 shadow-lg group-hover:block">
                      {comment}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        },
      };
    });
    return [...fixed, ...dayCols, ...summaryColumnDefs];
  }, [daysInMonth, handleMarkChange, manualRemarks, monthMeta?.monthKey, openPodCommentEditor, summaryColumnDefs]);

  const dayDrawerRows = useMemo(() => {
    if (dayAttendanceDrawer.mode === "present") return dayAttendanceStats.presentEmployees;
    if (dayAttendanceDrawer.mode === "absent") return dayAttendanceStats.absentEmployees;
    return dayAttendanceStats.allEmployees;
  }, [dayAttendanceDrawer.mode, dayAttendanceStats]);

  const dayDrawerTitle =
    dayAttendanceDrawer.mode === "present"
      ? "Present employees"
      : dayAttendanceDrawer.mode === "absent"
        ? "Absent employees"
        : "All employees";

  return (
    <div className="space-y-3 min-w-0 max-w-full">
      <SectionCard
        className="min-w-0"
        title="Daily Attendance Register"
        right={
          <StatusChip
            label={
              loading ? "Loading?" : savingMark ? "Saving?" : `${dayFilteredRows.length} employee(s) · Supabase`
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
          <TinySelect value={department} onChange={(e) => setDepartment(e.target.value)} className="w-[170px]">
            {departmentOptions.map((dept) => (
              <option key={dept} value={dept}>
                {dept === "ALL" ? "All departments" : dept}
              </option>
            ))}
          </TinySelect>
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
            {loading ? "Loading?" : "Reload"}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!rowsWithSummary.length || exporting}
            className="h-8 px-3 rounded-lg bg-gray-900 text-white text-xs font-medium disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {exporting ? "Exporting?" : "Export to Excel"}
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

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <KpiTile
            label="Total employees"
            value={bulkDayNumber ? dayAttendanceStats.total : "—"}
            sub={
              bulkDate
                ? `All employees for ${bulkDate}${tableDayAttendanceFilter ? " · click to show all" : ""}`
                : "Select a date below"
            }
            onClick={() => openDayAttendanceDrawer("total")}
            tone={
              tableDayAttendanceFilter === null && dayAttendanceDrawer.open && dayAttendanceDrawer.mode === "total"
                ? "border-[#1F3A8A] ring-2 ring-[#1F3A8A]/20"
                : "border-gray-200"
            }
          />
          <KpiTile
            label="Present employees"
            value={bulkDayNumber ? dayAttendanceStats.present : "—"}
            sub={bulkDate ? `P / P(OD) on ${bulkDate}` : "Select a date below"}
            onClick={() => openDayAttendanceDrawer("present")}
            tone={
              tableDayAttendanceFilter === "present"
                ? "border-emerald-400 ring-2 ring-emerald-100"
                : "border-emerald-100"
            }
          />
          <KpiTile
            label="Absent employees"
            value={bulkDayNumber ? dayAttendanceStats.absent : "—"}
            sub={bulkDate ? `Not present on ${bulkDate}` : "Select a date below"}
            onClick={() => openDayAttendanceDrawer("absent")}
            tone={
              tableDayAttendanceFilter === "absent"
                ? "border-red-300 ring-2 ring-red-100"
                : "border-red-100"
            }
          />
        </div>

        {tableDayAttendanceFilter && bulkDate && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span>
              Grid filtered to{" "}
              <strong>{tableDayAttendanceFilter === "present" ? "present" : "absent"}</strong> employees on {bulkDate}.
            </span>
            <button
              type="button"
              onClick={() => {
                setTableDayAttendanceFilter(null);
                setDayAttendanceDrawer((prev) => ({ ...prev, mode: "total" }));
              }}
              className="h-7 px-2 rounded border border-gray-300 bg-white hover:bg-gray-50"
            >
              Clear filter
            </button>
          </div>
        )}

        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
          <p className="text-[11px] font-semibold text-gray-700 mb-2">Bulk mark (filtered employees: {dayFilteredRows.length})</p>
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
                disabled={!dayFilteredRows.length}
                className={`h-8 px-3 rounded-lg text-xs font-semibold disabled:opacity-50 ${REGISTER_BULK_BUTTON_CLASS[b.mark] || ""}`}
              >
                {b.label}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClearSelectedDate}
              disabled={!dayFilteredRows.length}
              className="h-8 px-3 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Clear date marks
            </button>
          </div>
        </div>

        {gridRows.length === 0 && !loading && !error && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No employees in master, or no data for this month. Sync punches from{" "}
            <Link to="/app/admin/employee/attendance-inputs" className="font-medium underline">
              Raw Attendance Data
            </Link>{" "}
            — Present (P) is written to the register table and shown here when punches exist for that day.
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

        <div className="mt-3 min-w-0 max-w-full">
          <DenseTable
            columns={columns}
            rows={pagedRows}
            frozenColumnCount={4}
            frozenColumnWidths={[96, 116, 220, 140]}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
            <span>
              Showing {pageStart}-{pageEnd} of {rowsWithSummary.length} ? {activeEmployees.length} active in master
              {monthMeta ? ` ? ${monthMeta.monthKey}` : ""}
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

      {commentEditor.open && (
        <div className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-300 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-800">P(OD) Comment</h3>
            <p className="mt-1 text-xs text-gray-600">Comment for selected employee/date (Excel-style cell note).</p>
            <textarea
              value={commentEditor.value}
              onChange={(e) => setCommentEditor((prev) => ({ ...prev, value: e.target.value }))}
              rows={4}
              className="mt-3 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="Enter comment"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={closePodCommentEditor}
                className="h-8 px-3 rounded border border-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePodCommentEditor}
                className="h-8 px-3 rounded bg-gray-900 text-white text-xs"
              >
                Save comment
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkPodCommentOpen && (
        <div className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-300 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-800">Bulk P(OD) Comment</h3>
            <p className="mt-1 text-xs text-gray-600">This comment will be applied to all filtered employees for selected date.</p>
            <textarea
              value={bulkPodComment}
              onChange={(e) => setBulkPodComment(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
              placeholder="Enter bulk P(OD) comment (optional)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkPodCommentOpen(false)}
                className="h-8 px-3 rounded border border-gray-300 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkPodCommentApply}
                className="h-8 px-3 rounded bg-gray-900 text-white text-xs"
              >
                Apply P(OD)
              </button>
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={summaryOverlayOpen}
        title={`Register summary${monthMeta ? ` ? ${monthMeta.monthKey}` : ""}`}
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
                  <td className="px-2 py-1.5 font-medium text-gray-800">{row.employeeId || "?"}</td>
                  <td className="px-2 py-1.5 text-gray-700 tabular-nums">{row.empCode || "?"}</td>
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

      <Drawer
        open={dayAttendanceDrawer.open}
        title={`${dayDrawerTitle}${bulkDate ? ` · ${bulkDate}` : ""}`}
        onClose={() => setDayAttendanceDrawer({ open: false, mode: "total" })}
        widthClass="max-w-2xl"
      >
        <p className="text-[11px] text-gray-500 mb-3">
          {dayAttendanceDrawer.mode === "present"
            ? "Employees marked Present (P) or Present on Duty P(OD), including auto-present from punches."
            : dayAttendanceDrawer.mode === "absent"
              ? "Employees not marked present — unmarked, leave, weekoff, or NH/PH."
              : "Full employee list for the selected date with attendance status."}
          {tableDayAttendanceFilter
            ? " The register grid is filtered to match this list."
            : " Click Present or Absent to filter the grid."}
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <tr>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Employee code</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Employee name</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Department</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Status</th>
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Mark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {dayDrawerRows.length ? (
                dayDrawerRows.map((row) => (
                  <tr key={row.id || row.empCode} className="hover:bg-sky-50/40">
                    <td className="px-2 py-1.5 tabular-nums text-gray-800">{row.empCode || "—"}</td>
                    <td className="px-2 py-1.5 text-gray-800">{row.employeeName || "—"}</td>
                    <td className="px-2 py-1.5 text-gray-600">{row.department || "—"}</td>
                    <td className="px-2 py-1.5">
                      <StatusChip
                        label={registerMarkStatusLabel(row.dayMark)}
                        severity={row.dayMark === "P" || row.dayMark === "P(OD)" ? "info" : "warning"}
                      />
                    </td>
                    <td className="px-2 py-1.5 tabular-nums text-gray-700">{row.dayMark || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-gray-500">
                    No employees in this list for the selected date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Drawer>
    </div>
  );
}
