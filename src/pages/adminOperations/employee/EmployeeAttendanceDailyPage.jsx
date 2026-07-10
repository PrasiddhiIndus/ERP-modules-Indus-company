import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  CollapsibleHelp,
} from "../components/AdminUi";
import { supabase } from "../../../lib/supabase";
import {
  REGISTER_BULK_BUTTON_CLASS,
  REGISTER_MARK_NHPH,
  applyBulkRegisterMarks,
  attachRegisterRowSummaries,
  buildPresentKeysFromPunches,
  buildMonthlyRegisterGrid,
  buildRegisterEmployeeList,
  fetchMasterRegisterCodeMap,
  fetchRegisterMarkRowsInRange,
  collectRegisterEmployeeCodes,
  syncRegisterMarksFromPunches,
  syncRegisterAutoWeekoffMarks,
  syncRegisterAutoHolidayMarks,
  listAutoWeekoffDatesForMonthAndNext,
  computeRegisterSummaryFooter,
  ATTENDANCE_REGISTER_TABLE,
  dayOfMonthFromIsoDate,
  defaultBulkDateForMonth,
  employeeMatchesBulkMarkFilter,
  deleteRegisterMarksBatch,
  resolveBulkDayRange,
  downloadMonthlyRegisterExcel,
  buildPunchLookupByEmpDate,
  sortRegisterEmployeeRows,
  formatAttendanceSupabaseError,
  fetchActiveEmployees,
  fetchInactiveEmployeesWithDateOfLeaving,
  fetchAttendancePunchesInRange,
  isInactiveEmployeeRelevantForRegisterMonth,
  isoMonthToday,
  loadRegisterMarksForMonth,
  buildRegisterMonthViewFromPrefetched,
  migrateLocalRegisterMarksIfEmptyMonth,
  fetchRegisterMarksForYear,
  fetchApprovedLeaveMarksForMonth,
  mergeApprovedLeaveMarksIntoManualMarks,
  fetchApprovedTourMarksForMonth,
  finalizeRegisterMarksAndRemarks,
  refreshApprovedToursOnRegister,
  syncApprovedToursToRegister,
  monthDateRange,
  registerDateFromDay,
  registerDayTableLabel,
  registerMarkCellWrapperClass,
  registerMarkCellInlineStyle,
  registerMarkDisplayValue,
  isRegisterCommentMark,
  isRegisterDayAfterLeaving,
  upsertRegisterMark,
  upsertRegisterMarksBatch,
  writeStoredRegisterMarks,
  patchRegisterRowInCache,
  toRegisterDbEmployeeCode,
  normalizeAttendanceEmpCode,
  computeDayAttendanceBreakdown,
  registerMarkStatusLabel,
} from "../../../lib/attendanceDaily";
import { RegisterMarkPicker } from "./RegisterMarkPicker";
import { BulkMarkEmployeePicker } from "./BulkMarkEmployeePicker";
import { RegisterDepartmentFilter } from "./RegisterDepartmentFilter";
import {
  REGISTER_LEAVE_ANNUAL_LIMITS,
  aggregateLeaveUsageByEmployee,
  collectRegisterHolidayDates,
  dispatchLeaveLimitAlertsChanged,
  findAllLeaveLimitExceeded,
  formatLeaveUsage,
  hasLeaveAnnualLimit,
  projectLeaveUsageAfterMark,
  validateCoMark,
} from "../../../lib/attendanceLeaveLimits";
import { subscribeLeaveWorkflowRealtime } from "../../../lib/adminLeaveRequests";
import { subscribeTourWorkflowRealtime } from "../../../lib/adminTourRequests";
import { isSupabaseRealtimeEnabled } from "../../../lib/supabaseConfig";
import {
  collectConfiguredHolidayDates,
  fetchNationalPublicHolidayDatesInRange,
  fetchNationalPublicHolidays,
} from "../../../lib/nationalPublicHolidays";

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
  { mark: "L", label: "Mark L" },
  { mark: "WO", label: "Mark WO" },
  { mark: REGISTER_MARK_NHPH, label: "Mark NH/PH" },
];

/** Opens bulk employee picker for clear-range (not a register mark). */
const BULK_CLEAR_MARK = "__CLEAR__";

function formatSummaryValue(value, decimals) {
  const n = Number(value || 0);
  if (decimals) return n.toFixed(2);
  if (Number.isInteger(n)) return n;
  return n.toFixed(1);
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

function RegisterKpiSkeleton() {
  return <div className="h-14 rounded-lg bg-gray-200/80 animate-pulse" />;
}

/** Skeleton grid while monthly register data is loading. */
function RegisterAttendanceTableSkeleton({ rowCount = 10, daysInMonth = 31 }) {
  const dayCols = Math.min(daysInMonth, 31);
  return (
    <div className="mt-3 min-w-0 max-w-full rounded-lg border border-gray-200 overflow-hidden" aria-busy="true" aria-label="Loading attendance register">
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border-b border-gray-200">
        <div className="h-3 w-3 rounded-full border-2 border-sky-600 border-t-transparent animate-spin shrink-0" />
        <span className="text-xs font-medium text-sky-900">Loading attendance register…</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[960px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 w-10"><div className="h-3 bg-gray-200 rounded animate-pulse" /></th>
              <th className="px-2 py-2 w-24"><div className="h-3 bg-gray-200 rounded animate-pulse" /></th>
              <th className="px-2 py-2 w-28"><div className="h-3 bg-gray-200 rounded animate-pulse" /></th>
              <th className="px-2 py-2 w-36"><div className="h-3 bg-gray-200 rounded animate-pulse" /></th>
              <th className="px-2 py-2 w-28"><div className="h-3 bg-gray-200 rounded animate-pulse" /></th>
              {Array.from({ length: dayCols }, (_, i) => (
                <th key={i} className="px-1 py-2 w-12">
                  <div className="h-3 bg-gray-100 rounded animate-pulse mx-auto w-8" />
                </th>
              ))}
              {SUMMARY_COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-2 w-16">
                  <div className="h-3 bg-gray-100 rounded animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIdx) => (
              <tr key={rowIdx} className="border-b border-gray-100">
                <td className="px-2 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-6" /></td>
                <td className="px-2 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-16" /></td>
                <td className="px-2 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                <td className="px-2 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-32" /></td>
                <td className="px-2 py-2"><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></td>
                {Array.from({ length: dayCols }, (_, dayIdx) => (
                  <td key={dayIdx} className="px-1 py-1">
                    <div className="h-7 bg-gray-50 rounded animate-pulse" />
                  </td>
                ))}
                {SUMMARY_COLUMNS.map((col) => (
                  <td key={col.key} className="px-2 py-2">
                    <div className="h-4 bg-gray-50 rounded animate-pulse w-8 mx-auto" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmployeeAttendanceDailyPage() {
  const [monthValue, setMonthValue] = useState(isoMonthToday());
  const [empCode, setEmpCode] = useState("");
  const [search, setSearch] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [punches, setPunches] = useState([]);
  const [manualMarks, setManualMarks] = useState({});
  const [manualRemarks, setManualRemarks] = useState({});
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [masterRegisterCodeMap, setMasterRegisterCodeMap] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [yearLoading, setYearLoading] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [registerSort, setRegisterSort] = useState({ field: "empCode", direction: "asc" });
  const [summaryOverlayOpen, setSummaryOverlayOpen] = useState(false);
  const [dayAttendanceDrawer, setDayAttendanceDrawer] = useState({ open: false, mode: "total" });
  const [tableDayAttendanceFilter, setTableDayAttendanceFilter] = useState(null);
  const [bulkDateFrom, setBulkDateFrom] = useState("");
  const [bulkDateTo, setBulkDateTo] = useState("");
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [bulkToolsOpen, setBulkToolsOpen] = useState(false);
  const [bulkPickerMark, setBulkPickerMark] = useState(null);
  const [bulkSelectedCodes, setBulkSelectedCodes] = useState([]);
  const [bulkEmployeeSearch, setBulkEmployeeSearch] = useState("");
  const [bulkEmployeeMarkFilter, setBulkEmployeeMarkFilter] = useState("all");
  const [exporting, setExporting] = useState(false);
  const [exportingPunches, setExportingPunches] = useState(false);
  const [savingMark, setSavingMark] = useState(false);
  const [registerCodeWarning, setRegisterCodeWarning] = useState("");
  const [yearRegisterRows, setYearRegisterRows] = useState([]);
  const [configuredHolidays, setConfiguredHolidays] = useState([]);
  const [leaveLimitWarning, setLeaveLimitWarning] = useState("");
  const [commentEditor, setCommentEditor] = useState({
    open: false,
    empCode: "",
    day: null,
    value: "",
    mark: "",
  });

  const masterRegisterCodeMapRef = useRef(null);
  const activeEmployeesCacheRef = useRef(null);
  const inactiveLeavingCacheRef = useRef(null);
  const loadGenerationRef = useRef(0);
  const punchesRef = useRef([]);
  const approvedLeaveMarksRef = useRef({});
  const monthRegisterRowsRef = useRef([]);
  const [tourRealtimeLive, setTourRealtimeLive] = useState(false);

  const monthMeta = useMemo(() => monthDateRange(monthValue), [monthValue]);

  useEffect(() => {
    if (!monthMeta?.monthKey) return;
    const d = defaultBulkDateForMonth(monthMeta.monthKey);
    setBulkDateFrom(d);
    setBulkDateTo(d);
  }, [monthMeta?.monthKey]);

  const bulkDayRange = useMemo(() => {
    if (!monthMeta?.monthKey) return null;
    return resolveBulkDayRange(monthMeta.monthKey, bulkDateFrom, bulkDateTo);
  }, [bulkDateFrom, bulkDateTo, monthMeta?.monthKey]);

  const loadData = useCallback(async () => {
    if (!monthMeta) {
      setError("Select a valid month.");
      return;
    }
    const loadGeneration = loadGenerationRef.current + 1;
    loadGenerationRef.current = loadGeneration;
    setLoading(true);
    setSyncing(false);
    setYearLoading(true);
    setError("");
    setYearRegisterRows([]);
    setConfiguredHolidays([]);
    try {
      const codeMapPromise = masterRegisterCodeMapRef.current
        ? Promise.resolve(masterRegisterCodeMapRef.current)
        : fetchMasterRegisterCodeMap(supabase);
      const employeesPromise = activeEmployeesCacheRef.current
        ? Promise.resolve(activeEmployeesCacheRef.current)
        : fetchActiveEmployees(supabase).then((rows) => {
            activeEmployeesCacheRef.current = rows;
            return rows;
          });
      const inactivePromise = inactiveLeavingCacheRef.current
        ? Promise.resolve(inactiveLeavingCacheRef.current)
        : fetchInactiveEmployeesWithDateOfLeaving(supabase).then((rows) => {
            inactiveLeavingCacheRef.current = rows;
            return rows;
          });

      const [
        punchRows,
        employees,
        inactiveWithLeaving,
        masterCodeMap,
        monthRegisterRows,
        approvedLeaveMarks,
        approvedTourData,
      ] = await Promise.all([
        fetchAttendancePunchesInRange(supabase, {
          fromDate: monthMeta.fromDate,
          toDate: monthMeta.toDate,
        }),
        employeesPromise,
        inactivePromise,
        codeMapPromise,
        fetchRegisterMarkRowsInRange(supabase, {
          fromDate: monthMeta.fromDate,
          toDate: monthMeta.toDate,
        }),
        fetchApprovedLeaveMarksForMonth(supabase, monthMeta.fromDate, monthMeta.toDate),
        fetchApprovedTourMarksForMonth(supabase, monthMeta.fromDate, monthMeta.toDate),
      ]);

      if (loadGeneration !== loadGenerationRef.current) return;

      if (!masterRegisterCodeMapRef.current) {
        masterRegisterCodeMapRef.current = masterCodeMap;
        setMasterRegisterCodeMap(masterCodeMap);
      }

      const registerData = buildRegisterMonthViewFromPrefetched(
        monthMeta,
        monthRegisterRows,
        masterCodeMap
      );

      if (loadGeneration !== loadGenerationRef.current) return;

      punchesRef.current = punchRows;
      approvedLeaveMarksRef.current = approvedLeaveMarks;
      monthRegisterRowsRef.current = monthRegisterRows;

      const employeesWithCode = employees.filter((e) => e.empCode);
      const inactiveForMonth = (inactiveWithLeaving || []).filter((e) =>
        isInactiveEmployeeRelevantForRegisterMonth(e.dateOfLeaving, monthMeta.fromDate, monthMeta.toDate)
      );
      const afterLeaveMarks = mergeApprovedLeaveMarksIntoManualMarks(
        registerData?.marks || {},
        approvedLeaveMarks,
        { punches: punchRows, monthKey: monthMeta.monthKey }
      );
      const mergedRegister = finalizeRegisterMarksAndRemarks({
        marks: afterLeaveMarks,
        remarks: registerData?.remarks || {},
        tourData: approvedTourData,
        registerRows: monthRegisterRows,
        masterCodeMap,
        punches: punchRows,
        monthKey: monthMeta.monthKey,
      });
      const punchCodes = (punchRows || []).map((p) => p.empCode || p.employee_code).filter(Boolean);
      const leaveCodes = Object.keys(approvedLeaveMarks || {});
      const registerEmployees = buildRegisterEmployeeList(employeesWithCode, inactiveForMonth, {
        masterCodeMap,
        punchCodes,
        registerCodes: [...collectRegisterEmployeeCodes(employeesWithCode), ...leaveCodes, ...collectRegisterEmployeeCodes(inactiveForMonth)],
      });
      const registerEmpCodes = collectRegisterEmployeeCodes(registerEmployees);
      const weekoffDates = listAutoWeekoffDatesForMonthAndNext(monthMeta);

      setPunches(punchRows);
      setActiveEmployees(registerEmployees);
      setManualMarks(mergedRegister.marks);
      setManualRemarks(mergedRegister.remarks);
      setLeaveLimitWarning("");

      const warnings = [];
      if (employees.length > employeesWithCode.length) {
        warnings.push(
          `${employees.length - employeesWithCode.length} active employee(s) hidden — add employee_code in Employee Master to include them in the register.`
        );
      }
      setRegisterCodeWarning(warnings.join(" "));

      // Show the grid immediately; sync punch/WO marks in the background.
      setLoading(false);

      void (async () => {
        if (loadGeneration !== loadGenerationRef.current) return;
        setSyncing(true);
        try {
          const migrated = await migrateLocalRegisterMarksIfEmptyMonth(
            supabase,
            monthMeta,
            monthRegisterRows
          );
          if (migrated && loadGeneration === loadGenerationRef.current) {
            const refreshedRows = await fetchRegisterMarkRowsInRange(supabase, {
              fromDate: monthMeta.fromDate,
              toDate: monthMeta.toDate,
            });
            const refreshed = buildRegisterMonthViewFromPrefetched(
              monthMeta,
              refreshedRows,
              masterCodeMap
            );
            const afterLeave = mergeApprovedLeaveMarksIntoManualMarks(refreshed.marks, approvedLeaveMarks, {
              punches: punchRows,
              monthKey: monthMeta.monthKey,
            });
            const merged = finalizeRegisterMarksAndRemarks({
              marks: afterLeave,
              remarks: refreshed.remarks || {},
              tourData: approvedTourData,
              registerRows: refreshedRows,
              masterCodeMap,
              punches: punchRows,
              monthKey: monthMeta.monthKey,
            });
            setManualMarks(merged.marks);
            setManualRemarks(merged.remarks);
          }

          const punchSync = await syncRegisterMarksFromPunches(supabase, punchRows, {
            fromDate: monthMeta.fromDate,
            toDate: monthMeta.toDate,
            respectManualMarks: true,
            masterCodeMap,
            existingRegisterRows: monthRegisterRows,
          });
          const tourSync = await syncApprovedToursToRegister(supabase, monthMeta.fromDate, monthMeta.toDate, {
            masterCodeMap,
            existingRegisterRows: monthRegisterRows,
          });
          const woResult = await syncRegisterAutoWeekoffMarks(
            supabase,
            registerEmpCodes,
            weekoffDates,
            masterCodeMap,
            { existingRegisterRows: monthRegisterRows }
          );

          const holidayRangeTo =
            weekoffDates.length > 0 ? weekoffDates[weekoffDates.length - 1] : monthMeta.toDate;
          const holidayDates = await fetchNationalPublicHolidayDatesInRange(
            supabase,
            monthMeta.fromDate,
            holidayRangeTo
          );
          const holidayResult = await syncRegisterAutoHolidayMarks(
            supabase,
            registerEmpCodes,
            holidayDates,
            masterCodeMap,
            { existingRegisterRows: monthRegisterRows }
          );

          if (loadGeneration !== loadGenerationRef.current) return;

          if (woResult.failed > 0) {
            setRegisterCodeWarning((prev) => {
              const woMsg = `${woResult.failed} auto weekoff cell(s) could not be saved — set employee_code on Employee Master (must match eTimeOffice / raw attendance).`;
              return prev ? `${prev} ${woMsg}` : woMsg;
            });
          }

          if (holidayResult.failed > 0) {
            setRegisterCodeWarning((prev) => {
              const nhMsg = `${holidayResult.failed} auto NH/PH cell(s) could not be saved — set employee_code on Employee Master.`;
              return prev ? `${prev} ${nhMsg}` : nhMsg;
            });
          }

          const freshTourData = await fetchApprovedTourMarksForMonth(
            supabase,
            monthMeta.fromDate,
            monthMeta.toDate
          );
          const refreshedRows = await fetchRegisterMarkRowsInRange(supabase, {
            fromDate: monthMeta.fromDate,
            toDate: monthMeta.toDate,
            monthKey: monthMeta.monthKey,
          });
          if (loadGeneration !== loadGenerationRef.current) return;
          monthRegisterRowsRef.current = refreshedRows;
          const registerView = buildRegisterMonthViewFromPrefetched(
            monthMeta,
            refreshedRows,
            masterCodeMap
          );
          const afterLeave = mergeApprovedLeaveMarksIntoManualMarks(
            registerView.marks,
            approvedLeaveMarks,
            { punches: punchRows, monthKey: monthMeta.monthKey }
          );
          const finalized = finalizeRegisterMarksAndRemarks({
            marks: afterLeave,
            remarks: registerView.remarks || {},
            tourData: freshTourData,
            registerRows: refreshedRows,
            masterCodeMap,
            punches: punchRows,
            monthKey: monthMeta.monthKey,
          });
          setManualMarks(finalized.marks);
          setManualRemarks(finalized.remarks);
        } catch (syncErr) {
          if (loadGeneration !== loadGenerationRef.current) return;
          console.warn("Register background sync failed:", syncErr);
          setRegisterCodeWarning((prev) => {
            const msg = formatAttendanceSupabaseError(syncErr);
            return prev ? `${prev} Background sync: ${msg}` : `Background sync: ${msg}`;
          });
        } finally {
          if (loadGeneration === loadGenerationRef.current) setSyncing(false);
        }
      })();

      void (async () => {
        try {
          const [yearRows, holidayRows] = await Promise.all([
            fetchRegisterMarksForYear(supabase, monthMeta.year, masterCodeMap),
            fetchNationalPublicHolidays(supabase, { year: monthMeta.year }),
          ]);
          if (loadGeneration !== loadGenerationRef.current) return;
          setYearRegisterRows(yearRows);
          setConfiguredHolidays(holidayRows || []);
        } catch (yearErr) {
          console.warn("Year register load failed:", yearErr);
        } finally {
          if (loadGeneration === loadGenerationRef.current) setYearLoading(false);
        }
      })();
    } catch (err) {
      if (loadGeneration !== loadGenerationRef.current) return;
      setPunches([]);
      setManualMarks({});
      setManualRemarks({});
      setYearRegisterRows([]);
      setConfiguredHolidays([]);
      setRegisterCodeWarning("");
      setError(formatAttendanceSupabaseError(err));
      setLoading(false);
      setSyncing(false);
      setYearLoading(false);
    }
  }, [monthMeta]);

  useEffect(() => {
    setPage(1);
    setLoading(true);
  }, [monthValue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!monthMeta?.fromDate || !monthMeta?.toDate) return undefined;

    let debounce = null;
    let cancelled = false;

    const refreshLeaves = async () => {
      if (cancelled) return;
      try {
        const approvedLeaveMarks = await fetchApprovedLeaveMarksForMonth(
          supabase,
          monthMeta.fromDate,
          monthMeta.toDate
        );
        approvedLeaveMarksRef.current = approvedLeaveMarks;

        const monthRegisterRows = monthRegisterRowsRef.current || [];
        const masterCodeMap = masterRegisterCodeMapRef.current;
        const punchRows = punchesRef.current || [];

        const registerView = buildRegisterMonthViewFromPrefetched(
          monthMeta,
          monthRegisterRows,
          masterCodeMap
        );
        const afterLeave = mergeApprovedLeaveMarksIntoManualMarks(registerView.marks, approvedLeaveMarks, {
          punches: punchRows,
          monthKey: monthMeta.monthKey,
        });

        const tourData = await fetchApprovedTourMarksForMonth(
          supabase,
          monthMeta.fromDate,
          monthMeta.toDate
        );

        const finalized = finalizeRegisterMarksAndRemarks({
          marks: afterLeave,
          remarks: registerView.remarks || {},
          tourData,
          registerRows: monthRegisterRows,
          masterCodeMap,
          punches: punchRows,
          monthKey: monthMeta.monthKey,
        });

        // Ensure register shows any employee codes that appear due to leave overlay.
        const employeesWithCode = (activeEmployeesCacheRef.current || []).filter((e) => e.empCode);
        const inactiveWithLeaving = inactiveLeavingCacheRef.current || [];
        const inactiveForMonth = (inactiveWithLeaving || []).filter((e) =>
          isInactiveEmployeeRelevantForRegisterMonth(e.dateOfLeaving, monthMeta.fromDate, monthMeta.toDate)
        );
        const punchCodes = (punchRows || []).map((p) => p.empCode || p.employee_code).filter(Boolean);
        const leaveCodes = Object.keys(approvedLeaveMarks || {});
        const registerEmployees = buildRegisterEmployeeList(employeesWithCode, inactiveForMonth, {
          masterCodeMap,
          punchCodes,
          registerCodes: [...leaveCodes],
        });

        if (cancelled) return;
        setActiveEmployees(registerEmployees);
        setManualMarks(finalized.marks);
        setManualRemarks(finalized.remarks);
      } catch (err) {
        console.warn("Leave realtime refresh failed:", err);
      }
    };

    const refreshTours = async () => {
      if (cancelled) return;
      try {
        const merged = await refreshApprovedToursOnRegister(supabase, monthMeta, {
          punches: punchesRef.current,
          approvedLeaveMarks: approvedLeaveMarksRef.current,
          masterCodeMap: masterRegisterCodeMapRef.current,
          existingRegisterRows: monthRegisterRowsRef.current,
        });
        if (cancelled) return;
        if (merged.registerRows) {
          monthRegisterRowsRef.current = merged.registerRows;
        }
        setManualMarks(merged.marks);
        setManualRemarks(merged.remarks);
      } catch (err) {
        console.warn("Tour realtime refresh failed:", err);
      }
    };

    const schedule = () => {
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refreshLeaves();
        void refreshTours();
      }, 400);
    };

    const unsubscribe = subscribeTourWorkflowRealtime(schedule);
    const unsubscribeLeaves = subscribeLeaveWorkflowRealtime(schedule);
    setTourRealtimeLive(isSupabaseRealtimeEnabled());

    return () => {
      cancelled = true;
      if (debounce) window.clearTimeout(debounce);
      unsubscribe();
      unsubscribeLeaves();
    };
  }, [monthMeta?.fromDate, monthMeta?.toDate, monthMeta?.monthKey]);

  const { rows: gridRows, daysInMonth } = useMemo(() => {
    if (!monthMeta) return { rows: [], daysInMonth: 0 };
    return buildMonthlyRegisterGrid(punches, activeEmployees, {
      year: monthMeta.year,
      month: monthMeta.month,
      manualMarks,
      applyLeavingDisplay: true,
    });
  }, [punches, activeEmployees, manualMarks, monthMeta]);

  const dateOfLeavingByEmp = useMemo(() => {
    const map = new Map();
    for (const emp of activeEmployees) {
      const code = normalizeAttendanceEmpCode(emp.empCode);
      if (code && emp.dateOfLeaving) map.set(code, emp.dateOfLeaving);
    }
    return map;
  }, [activeEmployees]);

  const calendarYear = monthMeta?.year ?? new Date().getFullYear();

  const yearLeaveUsageByEmp = useMemo(
    () => aggregateLeaveUsageByEmployee(yearRegisterRows),
    [yearRegisterRows]
  );

  const holidayDatesInYear = useMemo(() => {
    const fromRegister = collectRegisterHolidayDates(yearRegisterRows, calendarYear);
    const fromConfig = collectConfiguredHolidayDates(configuredHolidays, calendarYear);
    return new Set([...fromRegister, ...fromConfig]);
  }, [yearRegisterRows, calendarYear, configuredHolidays]);

  const handleMarkChange = useCallback(
    async (empCodeKey, day, value) => {
      if (!monthMeta?.monthKey) return;
      const registerDate = registerDateFromDay(monthMeta.monthKey, day);
      const dateOfLeaving = dateOfLeavingByEmp.get(normalizeAttendanceEmpCode(empCodeKey));
      if (isRegisterDayAfterLeaving(registerDate, dateOfLeaving)) return;
      const oldMark = manualMarks[empCodeKey]?.[day] || "";
      const empYearRows = yearRegisterRows.filter(
        (r) => normalizeAttendanceEmpCode(r.employee_code) === normalizeAttendanceEmpCode(empCodeKey)
      );
      const warnings = [];

      if (value) {
        const coCheck = validateCoMark(empYearRows, registerDate, value, {
          dayMarkOnDate: oldMark,
          holidayDates: holidayDatesInYear,
        });
        if (!coCheck.ok) warnings.push(coCheck.message);

        if (hasLeaveAnnualLimit(value)) {
          const projected = projectLeaveUsageAfterMark(
            yearRegisterRows,
            empCodeKey,
            registerDate,
            value,
            oldMark
          );
          const exceeded = findAllLeaveLimitExceeded(projected);
          for (const hit of exceeded) {
            warnings.push(
              `${hit.leaveType} annual limit exceeded (${formatLeaveUsage(hit.used, hit.limit)} in ${calendarYear}).`
            );
          }
        }
      }

      if (warnings.length) {
        setLeaveLimitWarning(warnings.join(" "));
        dispatchLeaveLimitAlertsChanged();
      } else {
        setLeaveLimitWarning("");
      }

      const next = { ...manualMarks };
      const empMarks = { ...(next[empCodeKey] || {}) };
      const nextRemarks = { ...manualRemarks };
      const empRemarks = { ...(nextRemarks[empCodeKey] || {}) };
      if (!value) delete empMarks[day];
      else empMarks[day] = value;
      const isCommentMark = isRegisterCommentMark(value);
      if (!isCommentMark) delete empRemarks[day];
      if (Object.keys(empMarks).length) next[empCodeKey] = empMarks;
      else delete next[empCodeKey];
      if (Object.keys(empRemarks).length) nextRemarks[empCodeKey] = empRemarks;
      else delete nextRemarks[empCodeKey];
      setManualMarks(next);
      setManualRemarks(nextRemarks);
      if (monthMeta?.monthKey) writeStoredRegisterMarks(monthMeta.monthKey, next);
      if (isCommentMark) {
        setCommentEditor({
          open: true,
          empCode: empCodeKey,
          day,
          mark: value,
          value: empRemarks[day] || "",
        });
      }

      setSavingMark(true);
      try {
        await upsertRegisterMark(
          supabase,
          empCodeKey,
          registerDate,
          value,
          isCommentMark ? empRemarks[day] || "" : "",
          masterRegisterCodeMap
        );
        monthRegisterRowsRef.current = patchRegisterRowInCache(monthRegisterRowsRef.current, {
          employee_code: toRegisterDbEmployeeCode(empCodeKey, masterRegisterCodeMap) || empCodeKey,
          register_date: registerDate,
          mark: value,
          mark_remark: isCommentMark ? String(empRemarks[day] || "").trim() || null : null,
          mark_source: "manual",
        });
        if (monthMeta?.monthKey) writeStoredRegisterMarks(monthMeta.monthKey, next);
        setYearRegisterRows((prev) => {
          const code = normalizeAttendanceEmpCode(empCodeKey);
          const filtered = prev.filter(
            (r) =>
              normalizeAttendanceEmpCode(r.employee_code) !== code ||
              String(r.register_date || "").slice(0, 10) !== registerDate
          );
          if (value) filtered.push({ employee_code: code, register_date: registerDate, mark: value });
          return filtered;
        });
        dispatchLeaveLimitAlertsChanged();
      } catch (err) {
        setError(formatAttendanceSupabaseError(err));
        try {
          const registerData = await loadRegisterMarksForMonth(supabase, monthMeta, {
            masterCodeMap: masterRegisterCodeMap,
          });
          setManualMarks(registerData?.marks || {});
          setManualRemarks(registerData?.remarks || {});
        } catch {
          /* ignore reload failure */
        }
      } finally {
        setSavingMark(false);
      }
    },
    [
      calendarYear,
      dateOfLeavingByEmp,
      holidayDatesInYear,
      manualMarks,
      manualRemarks,
      masterRegisterCodeMap,
      monthMeta,
      yearRegisterRows,
    ]
  );

  const openPodCommentEditor = useCallback(
    (empCodeKey, day, mark = "P(OD)") => {
      if (manualMarks[empCodeKey]?.[day] !== mark) return;
      setCommentEditor({
        open: true,
        empCode: empCodeKey,
        day,
        mark,
        value: manualRemarks[empCodeKey]?.[day] || "",
      });
    },
    [manualMarks, manualRemarks]
  );

  const closePodCommentEditor = useCallback(() => {
    setCommentEditor({ open: false, empCode: "", day: null, value: "", mark: "" });
  }, []);

  const savePodCommentEditor = useCallback(async () => {
    if (!monthMeta?.monthKey || !commentEditor.empCode || !commentEditor.day) return;
    const { empCode: empCodeKey, day, value, mark } = commentEditor;
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
        mark || "P(OD)",
        trimmed,
        masterRegisterCodeMap
      );
      monthRegisterRowsRef.current = patchRegisterRowInCache(monthRegisterRowsRef.current, {
        employee_code: toRegisterDbEmployeeCode(empCodeKey, masterRegisterCodeMap) || empCodeKey,
        register_date: registerDateFromDay(monthMeta.monthKey, day),
        mark: mark || "P(OD)",
        mark_remark: trimmed || null,
        mark_source: "manual",
      });
      closePodCommentEditor();
    } catch (err) {
      setError(formatAttendanceSupabaseError(err));
    } finally {
      setSavingMark(false);
    }
  }, [commentEditor, closePodCommentEditor, manualRemarks, masterRegisterCodeMap, monthMeta]);

  const filteredRows = useMemo(() => {
    const codeFilter = normalizeAttendanceEmpCode(empCode.trim());
    const needle = search.trim().toLowerCase();
    return gridRows.filter((row) => {
      if (codeFilter && row.empCode !== codeFilter) return false;
      if (
        selectedDepartments.length > 0 &&
        !selectedDepartments.includes(row.department || "")
      ) {
        return false;
      }
      if (!needle) return true;
      return [row.employeeId, row.empCode, row.employeeName, row.department].join(" ").toLowerCase().includes(needle);
    });
  }, [gridRows, search, empCode, selectedDepartments]);

  const bulkDayNumber = useMemo(() => {
    if (!monthMeta?.monthKey || !bulkDateFrom?.startsWith(monthMeta.monthKey)) return null;
    return dayOfMonthFromIsoDate(bulkDateFrom);
  }, [bulkDateFrom, monthMeta?.monthKey]);

  const dayAttendanceStats = useMemo(() => {
    if (!bulkDayNumber) {
      return {
        total: 0,
        present: 0,
        absent: 0,
        unmarked: 0,
        presentEmployees: [],
        absentEmployees: [],
        unmarkedEmployees: [],
        allEmployees: [],
      };
    }
    return computeDayAttendanceBreakdown(filteredRows, bulkDayNumber, {
      year: monthMeta?.year,
      month: monthMeta?.month,
    });
  }, [bulkDayNumber, filteredRows, monthMeta?.year, monthMeta?.month]);

  const dayFilteredRowsBase = useMemo(() => {
    if (!tableDayAttendanceFilter || !bulkDayNumber) return filteredRows;
    if (tableDayAttendanceFilter === "present") return dayAttendanceStats.presentEmployees;
    if (tableDayAttendanceFilter === "absent") return dayAttendanceStats.absentEmployees;
    if (tableDayAttendanceFilter === "unmarked") return dayAttendanceStats.unmarkedEmployees;
    return filteredRows;
  }, [bulkDayNumber, dayAttendanceStats, filteredRows, tableDayAttendanceFilter]);

  const dayFilteredRows = useMemo(
    () => sortRegisterEmployeeRows(dayFilteredRowsBase, registerSort.field, registerSort.direction),
    [dayFilteredRowsBase, registerSort.field, registerSort.direction]
  );

  const openDayAttendanceDrawer = useCallback((mode) => {
    setDayAttendanceDrawer({ open: true, mode });
    if (mode === "total") setTableDayAttendanceFilter(null);
    else setTableDayAttendanceFilter(mode);
  }, []);

  const rowsWithSummary = useMemo(
    () =>
      attachRegisterRowSummaries(dayFilteredRows, manualMarks, daysInMonth, {
        year: monthMeta?.year,
        month: monthMeta?.month,
      }),
    [dayFilteredRows, manualMarks, daysInMonth, monthMeta?.year, monthMeta?.month]
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
  }, [
    pageSize,
    rowsWithSummary.length,
    search,
    monthValue,
    empCode,
    selectedDepartments,
    tableDayAttendanceFilter,
    bulkDateFrom,
    registerSort.field,
    registerSort.direction,
  ]);

  const renderRegisterSortIndicator = useCallback(
    (key) => {
      const active = registerSort.field === key;
      const ascActive = active && registerSort.direction === "asc";
      const descActive = active && registerSort.direction === "desc";
      return (
        <span className="inline-flex items-center gap-0.5 ml-0.5 text-[9px] align-middle leading-none">
          <span className={ascActive ? "text-[#1F3A8A]" : "text-gray-300"}>▲</span>
          <span className={descActive ? "text-[#1F3A8A]" : "text-gray-300"}>▼</span>
        </span>
      );
    },
    [registerSort.direction, registerSort.field]
  );

  const toggleRegisterSort = useCallback((key) => {
    setRegisterSort((prev) =>
      prev.field === key
        ? { field: key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field: key, direction: "asc" }
    );
  }, []);

  const registerSortableHeader = useCallback(
    (key, label) => (
      <button
        type="button"
        onClick={() => toggleRegisterSort(key)}
        className="inline-flex items-center font-semibold text-left hover:text-[#1F3A8A] w-full"
      >
        {label}
        {renderRegisterSortIndicator(key)}
      </button>
    ),
    [renderRegisterSortIndicator, toggleRegisterSort]
  );

  useEffect(() => {
    setTableDayAttendanceFilter(null);
  }, [bulkDateFrom, bulkDateTo, monthValue, empCode, selectedDepartments, search]);

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

  const handleExportPunchInOutExcel = async () => {
    if (!monthMeta || !rowsWithSummary.length) return;
    setExportingPunches(true);
    try {
      const rowsWithRemarks = rowsWithSummary.map((row) => ({
        ...row,
        dayRemarks: manualRemarks[row.empCode] || {},
      }));
      const punchByEmpDate = buildPunchLookupByEmpDate(punches);
      await downloadMonthlyRegisterExcel(rowsWithRemarks, daysInMonth, monthMeta.monthKey, {
        punchByEmpDate,
      });
    } finally {
      setExportingPunches(false);
    }
  };

  const bulkPickerEmployees = useMemo(() => {
    if (!bulkDayRange) return [];
    return filteredRows.filter((row) =>
      employeeMatchesBulkMarkFilter(row, {
        dayFrom: bulkDayRange.dayFrom,
        dayTo: bulkDayRange.dayTo,
        filter: bulkEmployeeMarkFilter,
      })
    );
  }, [bulkDayRange, bulkEmployeeMarkFilter, filteredRows]);

  const bulkDayMarkByCode = useMemo(() => {
    if (!bulkDayRange) return {};
    const out = {};
    for (const row of gridRows) {
      if (!row.empCode) continue;
      const marks = [];
      for (let d = bulkDayRange.dayFrom; d <= bulkDayRange.dayTo; d += 1) {
        const m = row.dayMarks?.[d] || "";
        if (m) marks.push(m);
      }
      const unique = [...new Set(marks)];
      if (unique.length === 1) out[row.empCode] = unique[0];
      else if (unique.length > 1) out[row.empCode] = `${unique.length} marks`;
    }
    return out;
  }, [bulkDayRange, gridRows]);

  const toggleBulkEmployeeSelect = useCallback((empCodeKey, add) => {
    setBulkSelectedCodes((prev) => {
      if (add) {
        if (prev.includes(empCodeKey)) return prev;
        return [...prev, empCodeKey];
      }
      return prev.filter((c) => c !== empCodeKey);
    });
  }, []);

  const clearBulkSelected = useCallback(() => {
    setBulkSelectedCodes([]);
  }, []);

  const openBulkPicker = useCallback(
    (mark) => {
      setBulkPickerMark(mark);
      setBulkEmployeeSearch("");
      setBulkEmployeeMarkFilter(mark === "P" ? "present" : "all");
      if (!bulkDayRange) {
        setBulkSelectedCodes([]);
        return;
      }
      const { dayFrom, dayTo } = bulkDayRange;
      const preSelected = [];
      for (const row of filteredRows) {
        if (!row.empCode) continue;
        for (let day = dayFrom; day <= dayTo; day += 1) {
          if ((row.dayMarks?.[day] || "") === mark) {
            preSelected.push(row.empCode);
            break;
          }
        }
      }
      setBulkSelectedCodes(preSelected);
    },
    [bulkDayRange, filteredRows]
  );

  const openBulkPickerForClear = useCallback(() => {
    setBulkPickerMark(BULK_CLEAR_MARK);
    setBulkEmployeeSearch("");
    setBulkEmployeeMarkFilter("marked");
    if (!bulkDayRange) {
      setBulkSelectedCodes([]);
      return;
    }
    const { dayFrom, dayTo } = bulkDayRange;
    const preSelected = [];
    for (const row of filteredRows) {
      if (!row.empCode) continue;
      for (let day = dayFrom; day <= dayTo; day += 1) {
        if (row.dayMarks?.[day]) {
          preSelected.push(row.empCode);
          break;
        }
      }
    }
    setBulkSelectedCodes(preSelected);
  }, [bulkDayRange, filteredRows]);

  const selectAllBulkPickerEmployees = useCallback(() => {
    const codes = filteredRows.map((row) => row.empCode).filter(Boolean);
    setBulkSelectedCodes([...new Set(codes)]);
  }, [filteredRows]);

  const closeBulkPicker = useCallback(() => {
    setBulkPickerMark(null);
    setBulkSelectedCodes([]);
    setBulkEmployeeSearch("");
  }, []);

  const handleBulkMark = useCallback(
    async (mark, empCodesOverride) => {
      if (!monthMeta?.monthKey || !bulkDayRange) return;
      const empCodes = [
        ...new Set((empCodesOverride || []).map(normalizeAttendanceEmpCode).filter(Boolean)),
      ];
      if (!empCodes.length) return;

      const { dayFrom, dayTo } = bulkDayRange;
      const next = applyBulkRegisterMarks(manualMarks, gridRows, {
        empCodes,
        dayFrom,
        dayTo,
        mark,
        overwrite: bulkOverwrite,
      });

      const upserts = [];
      const deletes = [];
      const nextRemarks = { ...manualRemarks };
      for (const code of empCodes) {
        const dateOfLeaving = dateOfLeavingByEmp.get(code);
        for (let day = dayFrom; day <= dayTo; day += 1) {
          const register_date = registerDateFromDay(monthMeta.monthKey, day);
          if (isRegisterDayAfterLeaving(register_date, dateOfLeaving)) continue;
          const prev = manualMarks[code]?.[day];
          const updated = next[code]?.[day];
          const unchanged = prev === updated;
          if (unchanged && !updated) continue;
          if (unchanged && updated && !mark) continue;
          const existingRemark = nextRemarks[code]?.[day] || "";
          if (!isRegisterCommentMark(updated) && nextRemarks[code]?.[day]) {
            const empRemarks = { ...(nextRemarks[code] || {}) };
            delete empRemarks[day];
            if (Object.keys(empRemarks).length) nextRemarks[code] = empRemarks;
            else delete nextRemarks[code];
          }
          if (updated) {
            upserts.push({
              employee_code: code,
              register_date,
              month_key: monthMeta.monthKey,
              mark: updated,
              mark_remark: isRegisterCommentMark(updated) ? existingRemark : null,
              mark_source: "manual",
              updated_at: new Date().toISOString(),
            });
          } else {
            deletes.push({ employee_code: code, register_date });
          }
        }
      }

      setManualMarks(next);
      setManualRemarks(nextRemarks);
      if (monthMeta?.monthKey) writeStoredRegisterMarks(monthMeta.monthKey, next);
      setSavingMark(true);
      try {
        if (upserts.length) await upsertRegisterMarksBatch(supabase, upserts, { masterCodeMap: masterRegisterCodeMap });
        if (deletes.length) {
          await deleteRegisterMarksBatch(supabase, deletes, masterRegisterCodeMap);
        }
        if (monthMeta?.monthKey) writeStoredRegisterMarks(monthMeta.monthKey, next);
      } catch (err) {
        setError(formatAttendanceSupabaseError(err));
        try {
          const registerData = await loadRegisterMarksForMonth(supabase, monthMeta, {
            masterCodeMap: masterRegisterCodeMap,
          });
          setManualMarks(registerData?.marks || {});
          setManualRemarks(registerData?.remarks || {});
        } catch {
          /* ignore */
        }
      } finally {
        setSavingMark(false);
      }
    },
    [bulkDayRange, bulkOverwrite, dateOfLeavingByEmp, gridRows, manualMarks, manualRemarks, masterRegisterCodeMap, monthMeta]
  );

  const handleClearSelectedRange = useCallback(async () => {
    if (!monthMeta?.monthKey || !bulkDayRange || !bulkSelectedCodes.length) return;

    const { dayFrom, dayTo } = bulkDayRange;
    const presentKeys = buildPresentKeysFromPunches(punches);
    const next = { ...manualMarks };
    const nextRemarks = { ...manualRemarks };
    const upserts = [];
    const deletes = [];

    for (const code of bulkSelectedCodes) {
      const empCodeKey = normalizeAttendanceEmpCode(code);
      const dateOfLeaving = dateOfLeavingByEmp.get(empCodeKey);
      const empMarks = { ...(next[empCodeKey] || {}) };
      const empRemarks = { ...(nextRemarks[empCodeKey] || {}) };

      for (let day = dayFrom; day <= dayTo; day += 1) {
        const register_date = registerDateFromDay(monthMeta.monthKey, day);
        if (isRegisterDayAfterLeaving(register_date, dateOfLeaving)) continue;
        const punchKey = `${empCodeKey}|${register_date}`;
        const hasPunch = presentKeys.has(punchKey);

        if (hasPunch) {
          empMarks[day] = "P";
          delete empRemarks[day];
          upserts.push({
            employee_code: empCodeKey,
            register_date,
            month_key: monthMeta.monthKey,
            mark: "P",
            mark_remark: null,
            mark_source: "punch",
            updated_at: new Date().toISOString(),
          });
        } else {
          delete empMarks[day];
          delete empRemarks[day];
          deletes.push({ employee_code: empCodeKey, register_date });
        }
      }

      if (Object.keys(empMarks).length) next[empCodeKey] = empMarks;
      else delete next[empCodeKey];
      if (Object.keys(empRemarks).length) nextRemarks[empCodeKey] = empRemarks;
      else delete nextRemarks[empCodeKey];
    }

    setManualMarks(next);
    setManualRemarks(nextRemarks);
    setSavingMark(true);
    try {
      if (upserts.length) {
        await upsertRegisterMarksBatch(supabase, upserts, { masterCodeMap: masterRegisterCodeMap });
      }
      if (deletes.length) {
        await deleteRegisterMarksBatch(supabase, deletes, masterRegisterCodeMap);
      }
      if (monthMeta?.monthKey) writeStoredRegisterMarks(monthMeta.monthKey, next);
    } catch (err) {
      setError(formatAttendanceSupabaseError(err));
      try {
        const registerData = await loadRegisterMarksForMonth(supabase, monthMeta, {
          masterCodeMap: masterRegisterCodeMap,
        });
        setManualMarks(registerData?.marks || {});
        setManualRemarks(registerData?.remarks || {});
      } catch {
        /* ignore */
      }
    } finally {
      setSavingMark(false);
    }
  }, [bulkDayRange, bulkSelectedCodes, dateOfLeavingByEmp, manualMarks, manualRemarks, masterRegisterCodeMap, monthMeta, punches]);

  const applyBulkPickerMark = useCallback(async () => {
    if (!bulkPickerMark || !bulkSelectedCodes.length) return;
    if (bulkPickerMark === BULK_CLEAR_MARK) {
      await handleClearSelectedRange();
    } else {
      await handleBulkMark(bulkPickerMark, bulkSelectedCodes);
    }
    closeBulkPicker();
  }, [bulkPickerMark, bulkSelectedCodes, closeBulkPicker, handleBulkMark, handleClearSelectedRange]);

  const departmentOptions = useMemo(() => {
    const values = new Set();
    for (const row of gridRows) {
      if (row.department) values.add(row.department);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
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
      {
        key: "employeeId",
        label: "Machine ID",
        headerRender: () => registerSortableHeader("employeeId", "Machine ID"),
        render: (row) => row.employeeId || "?",
      },
      {
        key: "empCode",
        label: "Employee code",
        headerRender: () => registerSortableHeader("empCode", "Employee code"),
        render: (row) => row.empCode || "?",
      },
      {
        key: "employeeName",
        label: "Employee Name",
        headerRender: () => registerSortableHeader("employeeName", "Employee Name"),
      },
      {
        key: "department",
        label: "Department",
        headerRender: () => registerSortableHeader("department", "Department"),
        render: (row) => row.department || "?",
      },
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
          const cellDate = monthKey ? registerDateFromDay(monthKey, day) : "";
          const leavingLocked =
            !!row.dateOfLeaving && isRegisterDayAfterLeaving(cellDate, row.dateOfLeaving);
          const comment = String(manualRemarks[row.empCode]?.[day] || "").trim();
          const isCommentMark = isRegisterCommentMark(value);
          const commentMark = isCommentMark ? value : "";
          const hasComment = isCommentMark && !!comment;
          return (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!isCommentMark) return;
                if (e.target.closest("[data-register-mark-picker]")) return;
                openPodCommentEditor(row.empCode, day, commentMark);
              }}
            >
              <div
                style={registerMarkCellInlineStyle(value)}
                className={`${registerMarkCellWrapperClass(value)} relative group/comment ${isCommentMark ? "cursor-pointer" : ""}`}
              >
                <RegisterMarkPicker
                  value={value}
                  readOnly={leavingLocked}
                  onChange={(next) => handleMarkChange(row.empCode, day, next)}
                />
                {hasComment && (
                  <>
                    <span
                      className="absolute top-0 right-0 w-0 h-0 border-l-[8px] border-l-transparent border-t-[8px] border-t-red-500 pointer-events-none"
                      aria-hidden
                    />
                    <div className="pointer-events-none absolute z-30 right-0 top-full mt-1 hidden max-w-[260px] rounded-md bg-gray-900 px-2 py-1.5 text-[10px] leading-snug text-white shadow-lg group-hover/comment:block">
                      <div className="font-semibold text-[9px] text-gray-200">
                        {registerMarkDisplayValue(commentMark)} comment
                      </div>
                      <div>{comment}</div>
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
  }, [
    daysInMonth,
    handleMarkChange,
    manualRemarks,
    monthMeta?.monthKey,
    openPodCommentEditor,
    registerSortableHeader,
    summaryColumnDefs,
    yearLeaveUsageByEmp,
  ]);

  const dayDrawerRows = useMemo(() => {
    if (dayAttendanceDrawer.mode === "present") return dayAttendanceStats.presentEmployees;
    if (dayAttendanceDrawer.mode === "absent") return dayAttendanceStats.absentEmployees;
    if (dayAttendanceDrawer.mode === "unmarked") return dayAttendanceStats.unmarkedEmployees;
    return dayAttendanceStats.allEmployees;
  }, [dayAttendanceDrawer.mode, dayAttendanceStats]);

  const dayDrawerTitle =
    dayAttendanceDrawer.mode === "present"
      ? "Present employees"
      : dayAttendanceDrawer.mode === "absent"
        ? "Marked (not present)"
        : dayAttendanceDrawer.mode === "unmarked"
          ? "Not marked"
          : "All employees";

  return (
    <div className="space-y-3 min-w-0 max-w-full">
      <SectionCard
        className="min-w-0"
        title="Daily Attendance Register"
        right={
          <StatusChip
            label={
              loading
                ? "Loading…"
                : syncing
                  ? "Syncing marks…"
                  : savingMark
                    ? "Saving…"
                    : yearLoading
                      ? `${dayFilteredRows.length} employee(s) · checking leave limits`
                      : `${dayFilteredRows.length} employee(s)${tourRealtimeLive ? " · tours updated live" : ""}`
            }
            severity={loading || syncing || savingMark ? "warning" : "info"}
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
          <label className="text-[11px] text-gray-600 inline-flex items-center">
            Department
            <RegisterDepartmentFilter
              options={departmentOptions}
              selected={selectedDepartments}
              onChange={setSelectedDepartments}
            />
          </label>
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
            disabled={loading || syncing}
            className="h-8 px-3 rounded-lg border border-gray-300 text-xs disabled:opacity-60"
          >
            {loading || syncing ? "Loading…" : "Reload"}
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
            onClick={handleExportPunchInOutExcel}
            disabled={!rowsWithSummary.length || exportingPunches}
            className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-medium disabled:opacity-60 hover:bg-emerald-700 inline-flex items-center gap-1.5"
          >
            {exportingPunches ? "Exporting…" : "Export punch in/out"}
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

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {loading ? (
            <>
              <RegisterKpiSkeleton />
              <RegisterKpiSkeleton />
              <RegisterKpiSkeleton />
              <RegisterKpiSkeleton />
            </>
          ) : (
            <>
          <KpiTile
            label="Total employees"
            value={bulkDayNumber ? dayAttendanceStats.total : "—"}
            sub={
              bulkDateFrom
                ? `All employees for ${bulkDateFrom}${tableDayAttendanceFilter ? " · click to show all" : ""}`
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
            sub={bulkDateFrom ? `P / P(OD) on ${bulkDateFrom}` : "Select a date below"}
            onClick={() => openDayAttendanceDrawer("present")}
            tone={
              tableDayAttendanceFilter === "present"
                ? "border-emerald-400 ring-2 ring-emerald-100"
                : "border-emerald-100"
            }
          />
          <KpiTile
            label="Marked (not present)"
            value={bulkDayNumber ? dayAttendanceStats.absent : "—"}
            sub={bulkDateFrom ? `Leave / WO / NH·PH on ${bulkDateFrom}` : "Select a date below"}
            onClick={() => openDayAttendanceDrawer("absent")}
            tone={
              tableDayAttendanceFilter === "absent"
                ? "border-red-300 ring-2 ring-red-100"
                : "border-red-100"
            }
          />
          <KpiTile
            label="Not marked"
            value={bulkDayNumber ? dayAttendanceStats.unmarked : "—"}
            sub={bulkDateFrom ? `No mark on ${bulkDateFrom}` : "Select a date below"}
            onClick={() => openDayAttendanceDrawer("unmarked")}
            tone={
              tableDayAttendanceFilter === "unmarked"
                ? "border-gray-400 ring-2 ring-gray-200"
                : "border-gray-200"
            }
          />
            </>
          )}
        </div>

        {tableDayAttendanceFilter && bulkDateFrom && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span>
              Grid filtered to{" "}
              <strong>
                {tableDayAttendanceFilter === "present"
                  ? "present"
                  : tableDayAttendanceFilter === "unmarked"
                    ? "not marked"
                    : "marked (not present)"}
              </strong>{" "}
              employees on{" "}
              {bulkDateFrom}.
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
          <button
            type="button"
            onClick={() => setBulkToolsOpen((v) => !v)}
            className="text-[11px] font-semibold text-gray-800 hover:text-[#1F3A8A]"
            aria-expanded={bulkToolsOpen}
          >
            {bulkToolsOpen ? "Hide bulk mark tools" : "Bulk mark tools (advanced)"}
          </button>
          {bulkToolsOpen ? (
          <>
          <p className="text-[10px] text-gray-500 mt-2 mb-2">
            Select employees, then apply a mark across a date range. Days with no punch and no approved leave stay{" "}
            <strong>blank</strong>. Bulk actions apply only to employees you select.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-gray-600">
              From
              <TinyInput
                type="date"
                min={monthMeta?.fromDate}
                max={monthMeta?.toDate}
                value={bulkDateFrom}
                onChange={(e) => {
                  setBulkDateFrom(e.target.value);
                  if (!bulkDateTo || e.target.value > bulkDateTo) setBulkDateTo(e.target.value);
                }}
                className="w-[140px] ml-1"
              />
            </label>
            <label className="text-[11px] text-gray-600">
              To
              <TinyInput
                type="date"
                min={monthMeta?.fromDate}
                max={monthMeta?.toDate}
                value={bulkDateTo}
                onChange={(e) => setBulkDateTo(e.target.value)}
                className="w-[140px] ml-1"
              />
            </label>
            <label
              className="text-[11px] text-gray-600 flex items-center gap-1.5 h-8"
              title="When enabled, replaces existing marks in the range. When off, only blank cells are updated."
            >
              <input
                type="checkbox"
                checked={bulkOverwrite}
                onChange={(e) => setBulkOverwrite(e.target.checked)}
                className="rounded"
              />
              Override
            </label>
            {BULK_MARKS.map((b) => {
              const pickerActive = bulkPickerMark === b.mark;
              return (
                <button
                  key={b.mark}
                  type="button"
                  onClick={() => {
                    if (pickerActive) closeBulkPicker();
                    else openBulkPicker(b.mark);
                  }}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold ${
                    pickerActive ? "ring-2 ring-offset-1 ring-gray-900 " : ""
                  }${REGISTER_BULK_BUTTON_CLASS[b.mark] || ""}`}
                >
                  {b.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                if (bulkPickerMark === BULK_CLEAR_MARK) closeBulkPicker();
                else openBulkPickerForClear();
              }}
              disabled={savingMark || !bulkDayRange}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 ${
                bulkPickerMark === BULK_CLEAR_MARK ? "ring-2 ring-offset-1 ring-gray-900" : ""
              }`}
            >
              Clear range (selected)
            </button>
          </div>

          {bulkPickerMark ? (
            <div className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
              <BulkMarkEmployeePicker
                employees={bulkPickerEmployees}
                selectedCodes={bulkSelectedCodes}
                onToggleSelect={toggleBulkEmployeeSelect}
                onClearSelected={clearBulkSelected}
                onSelectAll={selectAllBulkPickerEmployees}
                search={bulkEmployeeSearch}
                onSearchChange={setBulkEmployeeSearch}
                markLabel={
                  bulkPickerMark === BULK_CLEAR_MARK
                    ? "Clear range"
                    : BULK_MARKS.find((b) => b.mark === bulkPickerMark)?.label || bulkPickerMark
                }
                bulkDateFrom={bulkDateFrom}
                bulkDateTo={bulkDateTo}
                dayMarkByCode={bulkDayMarkByCode}
                markFilter={bulkEmployeeMarkFilter}
                onMarkFilterChange={setBulkEmployeeMarkFilter}
              />
              <p className="mt-2 text-[10px] text-gray-500">
                {bulkPickerMark === BULK_CLEAR_MARK
                  ? "Clears marks in the date range for selected employees. If raw punch data exists for a day, that cell becomes Present (P); otherwise it is blank."
                  : bulkOverwrite
                    ? "Override is on — existing marks in the date range will be replaced for selected employees."
                    : "Override is off — only blank cells in the range will be updated for selected employees."}
                {bulkDayRange && bulkDayRange.dayFrom !== bulkDayRange.dayTo
                  ? ` Spanning ${bulkDayRange.dayTo - bulkDayRange.dayFrom + 1} day(s).`
                  : null}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyBulkPickerMark}
                  disabled={!bulkSelectedCodes.length || savingMark || !bulkDayRange}
                  className={`h-8 px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-50 ${
                    bulkPickerMark === BULK_CLEAR_MARK
                      ? "bg-gray-700 hover:bg-gray-800"
                      : REGISTER_BULK_BUTTON_CLASS[bulkPickerMark] || "bg-gray-900"
                  }`}
                >
                  {bulkPickerMark === BULK_CLEAR_MARK
                    ? `Clear range for ${bulkSelectedCodes.length} selected`
                    : `Apply ${bulkPickerMark} to ${bulkSelectedCodes.length} selected`}
                </button>
                <button
                  type="button"
                  onClick={closeBulkPicker}
                  className="h-8 px-3 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          </>
          ) : null}
        </div>

        {gridRows.length === 0 && !loading && !error && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No employees in master, or no data for this month. Import punches from{" "}
            <Link to="/app/admin/employee/attendance-inputs" className="font-medium underline">
              Raw Attendance Data
            </Link>{" "}
            — Present (P) appears here when punch data exists for that day.
          </div>
        )}

        {leaveLimitWarning && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            <strong>Leave alert:</strong> {leaveLimitWarning} Check the bell icon in the header for all exceeded limits.
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

        {loading ? (
          <RegisterAttendanceTableSkeleton
            rowCount={Math.min(pageSize, 12)}
            daysInMonth={monthMeta?.daysInMonth ?? 31}
          />
        ) : (
        <div className="mt-3 min-w-0 max-w-full relative">
          {syncing && (
            <div className="absolute top-0 left-0 right-0 z-10 h-0.5 overflow-hidden rounded-t-lg bg-sky-100">
              <div className="h-full w-full bg-sky-500 animate-pulse opacity-80" />
            </div>
          )}
          <DenseTable
            columns={columns}
            rows={pagedRows}
            frozenColumnCount={4}
            frozenColumnWidths={[96, 116, 220, 140]}
            serialOffset={(currentPage - 1) * pageSize}
            stickyHeader
            scrollMaxHeight="calc(100dvh - 22rem)"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600">
            <span>
              Showing {pageStart}-{pageEnd} of {rowsWithSummary.length} · {activeEmployees.length} active in master
              {monthMeta ? ` · ${monthMeta.monthKey}` : ""}
              {syncing ? " · syncing marks…" : ""}
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
        )}

        <CollapsibleHelp label="how marks are saved">
          Attendance marks you enter here are saved to the company register. Present (P) from machine
          punches takes priority over approved leave on the same day. Blank cells mean no punch and no
          approved leave for that date. Payroll reports use this register for the selected month.
        </CollapsibleHelp>
      </SectionCard>

      {commentEditor.open && (
        <div className="fixed inset-0 z-50 bg-black/25 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-300 bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-800">
              {registerMarkDisplayValue(commentEditor.mark)} Comment
            </h3>
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
                <th className="text-left font-semibold px-2 py-2 whitespace-nowrap">Machine ID</th>
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
        title={`${dayDrawerTitle}${bulkDateFrom ? ` · ${bulkDateFrom}` : ""}`}
        onClose={() => setDayAttendanceDrawer({ open: false, mode: "total" })}
        widthClass="max-w-2xl"
      >
        <p className="text-[11px] text-gray-500 mb-3">
          {dayAttendanceDrawer.mode === "present"
            ? "Employees marked Present (P) / P(OD), including tours and auto-present from punches."
            : dayAttendanceDrawer.mode === "absent"
              ? "Employees with a mark other than present (leave, weekoff, NH/PH, etc.)."
              : dayAttendanceDrawer.mode === "unmarked"
                ? "Employees with no mark and no present credit for the selected date (blank cell)."
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
                        severity={row.dayMark === "P" || row.dayMark === "P(OD)" || row.dayMark === "T" ? "info" : "warning"}
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
