import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  KpiTile,
  PageTaskHeader,
  SectionCard,
  TinyInput,
  TinySelect,
} from "../../../components/erpUi";
import FormDateInput from "../../../components/FormDateInput";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../lib/toast";
import {
  dayOfMonthFromIsoDate,
  fetchApprovedLeaveMarksForMonth,
  fetchRegisterMarksForMonth,
  formatAttendanceSupabaseError,
  normalizeAttendanceEmpCode,
  normalizeDbDate,
  timeToMinutes,
} from "../../../lib/attendanceDaily";
import {
  buildDailyAttendanceReportRows,
  filterLatePunchAfter9Rows,
  isLatePunchInRow,
} from "../../../lib/attendanceReports";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";

const PAGE_SIZE = 25;
/** Punch-in before this time can optionally be ignored (09:05). */
const IGNORE_LATE_BEFORE_MINUTES = 9 * 60 + 5;

const DATE_FIELD_CLASS =
  "!w-[10.5rem] h-9 shrink-0 overflow-hidden border border-slate-300 rounded-md bg-white shadow-sm " +
  "[&_.erp-date-input-text]:!text-slate-900 [&_.erp-date-input-text]:!text-[13px] " +
  "[&_.erp-date-input-text]:!font-semibold [&_.erp-date-input-text]:!px-2.5 " +
  "[&_.erp-date-input-text]:!tabular-nums [&_.erp-date-input-text]:!opacity-100";

export function isPunchInBefore905(punchIn) {
  const mins = timeToMinutes(punchIn);
  if (mins == null) return false;
  return mins < IGNORE_LATE_BEFORE_MINUTES;
}

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayShort(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

/**
 * Days with approved leave or register adjustments must not count as late.
 * Pure Present (P) or blank mark still counts when punch-in is Late.
 */
export function isLatePunchExcludedByAttendanceMark(mark) {
  const m = String(mark || "").trim();
  if (!m || m === "P") return false;
  return true;
}

function lookupDayMark(marksByEmp, empCode, punchDate) {
  const code = normalizeAttendanceEmpCode(empCode);
  const day = dayOfMonthFromIsoDate(punchDate);
  if (!code || !day) return "";
  return String(marksByEmp?.[code]?.[day] || "").trim();
}

/** Keep late punch rows that are not covered by leave / OD / half-day / other adjustments. */
export function filterCountableLatePunchRows(lateRows, registerMarks, approvedLeaveMarks) {
  return (lateRows || []).filter((row) => {
    if (!isLatePunchInRow(row)) return false;
    const leaveMark = lookupDayMark(approvedLeaveMarks, row.empCode, row.punchDate);
    if (isLatePunchExcludedByAttendanceMark(leaveMark)) return false;
    const registerMark = lookupDayMark(registerMarks, row.empCode, row.punchDate);
    if (isLatePunchExcludedByAttendanceMark(registerMark)) return false;
    return true;
  });
}

export function groupLatePunchesByEmployee(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const code = normalizeAttendanceEmpCode(row.empCode) || String(row.empCode || "");
    if (!code) continue;
    if (!map.has(code)) {
      map.set(code, {
        empCode: code,
        employeeName: row.employeeName || "",
        department: row.department || "",
        designation: row.designation || "",
        lateDays: [],
      });
    }
    const group = map.get(code);
    if (row.employeeName && !group.employeeName) group.employeeName = row.employeeName;
    if (row.department && !group.department) group.department = row.department;
    if (row.designation && !group.designation) group.designation = row.designation;
    group.lateDays.push({
      id: row.id || `${code}|${row.punchDate}`,
      punchDate: normalizeDbDate(row.punchDate) || row.punchDate,
      day: row.day || weekdayShort(row.punchDate),
      punchIn: row.punchIn || "",
      punchOut: row.punchOut || "",
      workedHours: row.workedHours || "",
    });
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.lateDays.sort((a, b) => String(a.punchDate).localeCompare(String(b.punchDate)));
    g.lateCount = g.lateDays.length;
  }
  groups.sort((a, b) => {
    const byCount = b.lateCount - a.lateCount;
    if (byCount !== 0) return byCount;
    return String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true });
  });
  return groups;
}

export function buildLatePunchKpis(employeeGroups, fromDate, toDate) {
  const employeesLate = employeeGroups.length;
  const totalLateDays = employeeGroups.reduce((sum, g) => sum + g.lateCount, 0);
  const avgPerEmployee = employeesLate ? Math.round((totalLateDays / employeesLate) * 10) / 10 : 0;
  const rangeLabel =
    fromDate && toDate
      ? fromDate === toDate
        ? formatDateDdMmYyyy(fromDate)
        : `${formatDateDdMmYyyy(fromDate)} – ${formatDateDdMmYyyy(toDate)}`
      : "—";
  return { employeesLate, totalLateDays, avgPerEmployee, rangeLabel };
}

function exportEmployeeWiseCsv(groups, fromDate, toDate) {
  const lines = ["S.No,Emp code,Employee,Department,Late days,Late dates,Punch-in times"];
  groups.forEach((g, idx) => {
    const dates = g.lateDays.map((d) => formatDateDdMmYyyy(d.punchDate) || d.punchDate).join("; ");
    const times = g.lateDays.map((d) => d.punchIn || "—").join("; ");
    const cells = [idx + 1, g.empCode, g.employeeName, g.department, g.lateCount, dates, times].map(
      (v) => {
        const s = String(v ?? "");
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }
    );
    lines.push(cells.join(","));
  });
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `late-punch-employee-wise-${fromDate}-to-${toDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LatePunchReport() {
  const today = isoDateToday();
  const [fromDate, setFromDate] = useState(today.slice(0, 8) + "01");
  const [toDate, setToDate] = useState(today);
  const [empCodeFilter, setEmpCodeFilter] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [baseLateRows, setBaseLateRows] = useState([]);
  const [leaveExcludedCount, setLeaveExcludedCount] = useState(0);
  const [ignoreBefore905, setIgnoreBefore905] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchActiveEmployees } = await import("../../../lib/attendanceDaily");
        const employees = await fetchActiveEmployees(supabase);
        if (cancelled) return;
        const depts = [
          ...new Set(employees.map((e) => String(e.department || "").trim()).filter(Boolean)),
        ].sort((a, b) => a.localeCompare(b));
        setDepartmentOptions(depts);
      } catch {
        if (!cancelled) setDepartmentOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runReport = useCallback(async () => {
    if (!fromDate || !toDate) {
      toast.warning("Choose valid from and to dates.");
      return;
    }
    if (fromDate > toDate) {
      toast.warning("From date must be on or before to date.");
      return;
    }
    setLoading(true);
    setPage(1);
    try {
      const code = empCodeFilter.trim() || "ALL";
      const [allRows, registerData, approvedLeaveMarks] = await Promise.all([
        buildDailyAttendanceReportRows(supabase, {
          fromDate,
          toDate,
          empCode: code,
        }),
        fetchRegisterMarksForMonth(supabase, { fromDate, toDate }),
        fetchApprovedLeaveMarksForMonth(supabase, fromDate, toDate),
      ]);
      const rawLate = filterLatePunchAfter9Rows(allRows);
      const countable = filterCountableLatePunchRows(
        rawLate,
        registerData?.marks || {},
        approvedLeaveMarks || {}
      );
      setLeaveExcludedCount(Math.max(0, rawLate.length - countable.length));
      setBaseLateRows(countable);
      setHasRun(true);
    } catch (err) {
      setBaseLateRows([]);
      setLeaveExcludedCount(0);
      toast.error(formatAttendanceSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [empCodeFilter, fromDate, toDate]);

  const reportLateRows = useMemo(() => {
    if (!ignoreBefore905) return baseLateRows;
    return baseLateRows.filter((row) => !isPunchInBefore905(row.punchIn));
  }, [baseLateRows, ignoreBefore905]);

  const ignoredBefore905Count = useMemo(() => {
    if (!ignoreBefore905) return 0;
    return baseLateRows.length - reportLateRows.length;
  }, [baseLateRows.length, ignoreBefore905, reportLateRows.length]);

  const employeeGroups = useMemo(
    () => groupLatePunchesByEmployee(reportLateRows),
    [reportLateRows]
  );

  const excludedCount = leaveExcludedCount + ignoredBefore905Count;

  const kpis = useMemo(
    () => buildLatePunchKpis(employeeGroups, fromDate, toDate),
    [employeeGroups, fromDate, toDate]
  );

  const filteredGroups = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    let list = employeeGroups;
    if (departmentFilter && departmentFilter !== "ALL") {
      list = list.filter((g) => String(g.department || "").trim() === departmentFilter);
    }
    if (q) {
      list = list.filter(
        (g) =>
          String(g.employeeName || "").toLowerCase().includes(q) ||
          String(g.empCode || "").toLowerCase().includes(q) ||
          String(g.department || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [departmentFilter, employeeGroups, nameSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedGroups = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredGroups.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredGroups]);

  useEffect(() => {
    setPage(1);
  }, [nameSearch, departmentFilter]);

  return (
    <div className="space-y-4">
      <PageTaskHeader
        title="Late punch report"
        subtitle="Late punch-ins by employee. Leave and attendance adjustments are excluded."
      >
        {hasRun && filteredGroups.length > 0 ? (
          <button
            type="button"
            onClick={() => exportEmployeeWiseCsv(filteredGroups, fromDate, toDate)}
            className="h-8 px-3 rounded-lg border border-border bg-surface text-xs font-semibold hover:bg-surface-sunken"
          >
            Export CSV
          </button>
        ) : null}
      </PageTaskHeader>

      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">From</span>
            <FormDateInput
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
              className={DATE_FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">To</span>
            <FormDateInput
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
              className={DATE_FIELD_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Emp code</span>
            <TinyInput
              value={empCodeFilter}
              onChange={(e) => setEmpCodeFilter(e.target.value)}
              placeholder="Optional"
              className="w-[10.5rem] !text-slate-900"
            />
          </div>
          <label className="inline-flex items-center gap-2 h-9 self-end px-1 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ignoreBefore905}
              onChange={(e) => setIgnoreBefore905(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-accent focus:ring-accent"
            />
            <span className="font-medium leading-snug">Ignore late punch before 9:05</span>
          </label>
          <button
            type="button"
            onClick={runReport}
            disabled={loading}
            className="h-9 px-4 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-60 self-end"
          >
            {loading ? "Loading…" : "Run report"}
          </button>
        </div>
      </div>

      {!hasRun && !loading ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-sunken/40 py-12 text-center text-xs text-ink-muted">
          Select dates and run the report.
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface py-12 text-center text-xs text-ink-muted">
          Loading…
        </div>
      ) : null}

      {hasRun && !loading ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Employees late" value={kpis.employeesLate} sub={kpis.rangeLabel} />
            <KpiTile
              label="Total late days"
              value={kpis.totalLateDays}
              sub={excludedCount > 0 ? `${excludedCount} excluded` : undefined}
            />
            <KpiTile label="Avg per employee" value={kpis.avgPerEmployee} />
          </div>

          <SectionCard
            title="Employees"
            right={
              <span className="text-[11px] text-ink-muted tabular-nums">
                {filteredGroups.length} employee{filteredGroups.length === 1 ? "" : "s"}
              </span>
            }
          >
            <div className="mb-3 flex flex-wrap gap-2">
              <TinyInput
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search name or code…"
                className="min-w-[200px]"
              />
              <TinySelect
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="min-w-[160px]"
              >
                <option value="ALL">All departments</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </TinySelect>
            </div>

            {filteredGroups.length === 0 ? (
              <div className="py-10 text-center text-xs text-ink-muted">No late punches for these filters.</div>
            ) : (
              <div className="space-y-3">
                {pagedGroups.map((g) => (
                  <div key={g.empCode} className="rounded-lg border border-border bg-surface px-3 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-strong">
                          {g.employeeName || "—"}{" "}
                          <span className="font-mono text-xs font-medium text-ink-muted">({g.empCode})</span>
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {[g.department, g.designation].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <p className="text-xs font-semibold tabular-nums text-rose-700">
                        {g.lateCount} late day{g.lateCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {g.lateDays.map((d) => (
                        <span
                          key={d.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px]"
                          title={d.punchOut ? `Out ${d.punchOut}` : undefined}
                        >
                          <span className="font-semibold tabular-nums text-ink-strong">
                            {formatDateDdMmYyyy(d.punchDate) || d.punchDate}
                          </span>
                          <span className="text-ink-muted">{d.day}</span>
                          <span className="tabular-nums font-medium text-rose-800">{d.punchIn || "—"}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredGroups.length > PAGE_SIZE ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                <span>
                  Page {currentPage} / {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2.5 rounded border border-border bg-surface disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 px-2.5 rounded border border-border bg-surface disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
