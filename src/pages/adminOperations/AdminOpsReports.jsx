import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard, FilterBar, TinySelect, TinyInput, Badge, DenseTable } from "./components/AdminUi";
import { supabase } from "../../lib/supabase";
import {
  attachMasterFields,
  fetchActiveEmployees,
  fetchAttendancePunchesInRange,
  formatAttendanceSupabaseError,
  formatWorkedMinutes,
  pairPunchesToDailyRows,
  workingHoursRowClass,
  WORKING_HOURS_LONG_THRESHOLD_MIN,
} from "../../lib/attendanceDaily";
import {
  applyCustomReportFilters,
  buildDailyAttendanceReportRows,
  CUSTOM_REPORT_FIELDS,
  exportReportCsv,
  filterLatePunchAfter9Rows,
  filterOvertimeRows,
  LATE_PUNCH_IN_THRESHOLD,
} from "../../lib/attendanceReports";

const REPORT_TABS = [
  { id: "employee", label: "Employee reports" },
  { id: "store", label: "Store reports" },
  { id: "misc", label: "Misc reports" },
  { id: "gate", label: "Gate reports" },
];

const ATTENDANCE_REPORT_TYPES = [
  { id: "daily", label: "Daily attendance summary" },
  { id: "late-9", label: "Late punch in (after 9:00)" },
  { id: "overtime", label: "Overtime (>9h worked)" },
  { id: "custom", label: "Custom report builder" },
];

const PAGE_SIZES = [25, 50, 100, 200];

const CATALOG_BY_TAB = {
  employee: [
    "Employee master export",
    "Leave report",
    "Permission report",
    "Attendance correction report",
    "Compliance gaps",
    "Exit / F&F report",
  ],
  store: [
    "Item-wise stock",
    "Site-wise stock",
    "Issue register",
    "Return register",
    "Transfer / transit report",
    "Planner shortage / excess",
    "Reconciliation variance",
  ],
  misc: ["Travel report", "Events report", "Admin request tracker"],
  gate: [
    "Employee movement report",
    "Guest report",
    "Vehicle report",
    "Goods in/out report",
    "Delivery / courier log",
  ],
};

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function defaultCustomColumns() {
  return ["empCode", "employeeName", "department", "punchDate", "punchIn", "punchOut", "workedHours"];
}

export default function AdminOpsReports() {
  const today = isoDateToday();
  const [activeTab, setActiveTab] = useState("employee");
  const [attendanceReportType, setAttendanceReportType] = useState("daily");
  const [fromDate, setFromDate] = useState(today.slice(0, 8) + "01");
  const [toDate, setToDate] = useState(today);
  const [reportDate, setReportDate] = useState(today);
  const [empCodeFilter, setEmpCodeFilter] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasRun, setHasRun] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [customColumns, setCustomColumns] = useState(defaultCustomColumns);
  const [customLateOnly, setCustomLateOnly] = useState(false);
  const [customOvertimeOnly, setCustomOvertimeOnly] = useState(false);
  const [customMinHours, setCustomMinHours] = useState("");
  const [customMaxHours, setCustomMaxHours] = useState("");

  const catalogItems = CATALOG_BY_TAB[activeTab] || [];

  useEffect(() => {
    if (activeTab !== "employee") return;
    let cancelled = false;
    (async () => {
      try {
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
  }, [activeTab]);

  const filteredCatalogItems = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    if (!q) return catalogItems;
    return catalogItems.filter((it) => String(it).toLowerCase().includes(q));
  }, [catalogItems, nameSearch]);

  const runAttendanceReport = useCallback(async () => {
    const from = attendanceReportType === "daily" ? reportDate : fromDate;
    const to = attendanceReportType === "daily" ? reportDate : toDate;
    if (!from || !to) {
      setError("Choose valid from and to dates.");
      return;
    }
    setLoading(true);
    setError("");
    setPage(1);
    try {
      const code = empCodeFilter.trim() || "ALL";
      let rows = await buildDailyAttendanceReportRows(supabase, {
        fromDate: from,
        toDate: to,
        empCode: code,
      });
      if (attendanceReportType === "late-9") {
        rows = filterLatePunchAfter9Rows(rows);
      } else if (attendanceReportType === "overtime") {
        rows = filterOvertimeRows(rows);
      } else if (attendanceReportType === "custom") {
        rows = applyCustomReportFilters(rows, {
          department: departmentFilter,
          empCode: empCodeFilter,
          nameSearch,
          lateInOnly: customLateOnly,
          overtimeOnly: customOvertimeOnly,
          minWorkedHours: customMinHours,
          maxWorkedHours: customMaxHours,
        });
      }
      const q = nameSearch.trim().toLowerCase();
      if (q && attendanceReportType !== "custom") {
        rows = rows.filter(
          (r) =>
            String(r.employeeName || "").toLowerCase().includes(q) ||
            String(r.empCode || "").toLowerCase().includes(q)
        );
      }
      if (departmentFilter && departmentFilter !== "ALL" && attendanceReportType !== "custom") {
        rows = rows.filter((r) => String(r.department || "").trim() === departmentFilter);
      }
      rows.sort((a, b) => {
        const d = String(b.punchDate).localeCompare(String(a.punchDate));
        if (d !== 0) return d;
        return String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true });
      });
      setEmployeeRows(rows);
      setHasRun(true);
    } catch (err) {
      setEmployeeRows([]);
      setError(formatAttendanceSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [
    attendanceReportType,
    customLateOnly,
    customMaxHours,
    customMinHours,
    customOvertimeOnly,
    departmentFilter,
    empCodeFilter,
    fromDate,
    nameSearch,
    reportDate,
    toDate,
  ]);

  const runLegacySingleDay = useCallback(async () => {
    if (!reportDate) {
      setError("Choose a valid date.");
      return;
    }
    setLoading(true);
    setError("");
    setPage(1);
    try {
      const code = empCodeFilter.trim();
      const [punches, employees] = await Promise.all([
        fetchAttendancePunchesInRange(supabase, {
          fromDate: reportDate,
          toDate: reportDate,
          empCode: code || "ALL",
        }),
        fetchActiveEmployees(supabase),
      ]);
      const paired = pairPunchesToDailyRows(punches);
      const enriched = attachMasterFields(paired, employees);
      const sorted = enriched.sort((a, b) =>
        String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true })
      );
      setEmployeeRows(sorted);
      setHasRun(true);
    } catch (err) {
      setEmployeeRows([]);
      setError(formatAttendanceSupabaseError(err));
    } finally {
      setLoading(false);
    }
  }, [empCodeFilter, reportDate]);

  const filteredEmployeeRows = useMemo(() => employeeRows, [employeeRows]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployeeRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = filteredEmployeeRows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(currentPage * pageSize, filteredEmployeeRows.length);
  const pagedEmployeeRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmployeeRows.slice(start, start + pageSize);
  }, [currentPage, filteredEmployeeRows, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [nameSearch, departmentFilter, pageSize, attendanceReportType]);

  const handleRunReport = () => {
    if (activeTab === "employee") {
      runAttendanceReport();
      return;
    }
    setHasRun(true);
    setEmployeeRows([]);
    setError("");
  };

  const handleExport = () => {
    if (!filteredEmployeeRows.length) return;
    const cols =
      attendanceReportType === "custom"
        ? customColumns
        : [
            "empCode",
            "employeeName",
            "department",
            "punchDate",
            "punchIn",
            "punchOut",
            "workedHours",
            "punchCount",
            ...(attendanceReportType === "late-9" ? ["lateInAfter9"] : []),
            ...(attendanceReportType === "overtime" ? ["overtime"] : []),
          ];
    const slug = attendanceReportType;
    const rangeFrom = attendanceReportType === "daily" ? reportDate : fromDate;
    const rangeTo = attendanceReportType === "daily" ? reportDate : toDate;
    exportReportCsv(filteredEmployeeRows, cols, `attendance-${slug}-${rangeFrom}-to-${rangeTo}.csv`);
  };

  const toggleCustomColumn = (id) => {
    setCustomColumns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const tableColumns = useMemo(() => {
    if (attendanceReportType === "custom") {
      return CUSTOM_REPORT_FIELDS.filter((f) => customColumns.includes(f.id)).map((f) => ({
        key: f.id,
        label: f.label,
        render:
          f.id === "workedHours"
            ? (r) => r.workedHours || formatWorkedMinutes(r.workedMinutes)
            : undefined,
      }));
    }
    const base = [
      { key: "empCode", label: "Emp code" },
      { key: "employeeName", label: "Employee" },
      { key: "department", label: "Department" },
      { key: "punchDate", label: "Date" },
      { key: "punchIn", label: "Punch in" },
      { key: "punchOut", label: "Punch out" },
      {
        key: "workedHours",
        label: "Hours",
        render: (r) => r.workedHours || formatWorkedMinutes(r.workedMinutes),
      },
    ];
    if (attendanceReportType === "late-9") {
      return [...base, { key: "lateInAfter9", label: "Late (after 9:00)" }];
    }
    if (attendanceReportType === "overtime") {
      return [...base, { key: "overtime", label: "Overtime" }];
    }
    return [...base, { key: "punchCount", label: "Punches" }];
  }, [attendanceReportType, customColumns]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Reports & analytics"
        right={<Badge tone="bg-blue-50 text-blue-800">Export CSV</Badge>}
      >
        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
          {REPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setHasRun(false);
                setError("");
                setNameSearch("");
                setDepartmentFilter("ALL");
                setPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[#1F3A8A] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "employee" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {ATTENDANCE_REPORT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setAttendanceReportType(t.id);
                  setHasRun(false);
                  setPage(1);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${
                  attendanceReportType === t.id
                    ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        <FilterBar>
          {activeTab === "employee" && attendanceReportType === "daily" ? (
            <TinyInput
              type="date"
              className="w-[130px]"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          ) : activeTab === "employee" ? (
            <>
              <TinyInput type="date" className="w-[130px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <TinyInput type="date" className="w-[130px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </>
          ) : (
            <>
              <TinyInput type="date" className="w-[130px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <TinyInput type="date" className="w-[130px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </>
          )}
          {activeTab === "employee" && (
            <>
              <TinyInput
                value={empCodeFilter}
                onChange={(e) => setEmpCodeFilter(e.target.value)}
                placeholder="Employee code (optional)"
                className="w-[150px]"
              />
              <TinyInput
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search name / code"
                className="min-w-[160px]"
              />
              <TinySelect
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="min-w-[150px]"
              >
                <option value="ALL">All departments</option>
                {departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </TinySelect>
              <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[100px]">
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </TinySelect>
            </>
          )}
          {activeTab !== "employee" && (
            <TinyInput
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder="Search report name"
              className="min-w-[160px]"
            />
          )}
          <button
            type="button"
            onClick={handleRunReport}
            disabled={loading}
            className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs disabled:opacity-60"
          >
            {loading ? "Loading…" : "Run report"}
          </button>
          {activeTab === "employee" && hasRun && filteredEmployeeRows.length > 0 ? (
            <button
              type="button"
              onClick={handleExport}
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold hover:bg-gray-50"
            >
              Export CSV
            </button>
          ) : null}
        </FilterBar>

        {activeTab === "employee" && attendanceReportType === "custom" ? (
          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-900">Custom report builder (raw punch data)</p>
            <div className="flex flex-wrap gap-3 text-[11px]">
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={customLateOnly} onChange={(e) => setCustomLateOnly(e.target.checked)} />
                Late in only (after {LATE_PUNCH_IN_THRESHOLD})
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={customOvertimeOnly}
                  onChange={(e) => setCustomOvertimeOnly(e.target.checked)}
                />
                Overtime only (&gt;{WORKING_HOURS_LONG_THRESHOLD_MIN / 60}h)
              </label>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-[11px] text-gray-600">
                Min hours
                <TinyInput
                  type="number"
                  min="0"
                  step="0.5"
                  value={customMinHours}
                  onChange={(e) => setCustomMinHours(e.target.value)}
                  className="w-[80px] ml-1"
                />
              </label>
              <label className="text-[11px] text-gray-600">
                Max hours
                <TinyInput
                  type="number"
                  min="0"
                  step="0.5"
                  value={customMaxHours}
                  onChange={(e) => setCustomMaxHours(e.target.value)}
                  className="w-[80px] ml-1"
                />
              </label>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">Columns to include</p>
              <div className="flex flex-wrap gap-2">
                {CUSTOM_REPORT_FIELDS.map((f) => (
                  <label
                    key={f.id}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] cursor-pointer ${
                      customColumns.includes(f.id)
                        ? "bg-[#1F3A8A] text-white border-[#1F3A8A]"
                        : "bg-white border-gray-300 text-gray-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={customColumns.includes(f.id)}
                      onChange={() => toggleCustomColumn(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "employee" && attendanceReportType === "late-9" ? (
          <p className="mt-2 text-[11px] text-gray-600">
            Flags employees whose <strong>first punch (Punch in)</strong> is after {LATE_PUNCH_IN_THRESHOLD} on that day.
            Data from <code className="text-[10px]">erp_attendance_punches</code>.
          </p>
        ) : null}
        {activeTab === "employee" && attendanceReportType === "overtime" ? (
          <p className="mt-2 text-[11px] text-gray-600">
            Flags days with worked time over <strong>{WORKING_HOURS_LONG_THRESHOLD_MIN / 60} hours</strong> (first punch in,
            last punch out).
          </p>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        ) : null}

        {activeTab === "employee" ? (
          <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {!hasRun && !loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500 bg-gray-50/80">
                Select dates and click Run report.
              </div>
            ) : loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500">Loading…</div>
            ) : filteredEmployeeRows.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500">No rows for this report.</div>
            ) : (
              <>
                <DenseTable
                  rows={pagedEmployeeRows.map((r) => ({
                    ...r,
                    id: r.id,
                    highlight: workingHoursRowClass(r.workedMinutes),
                  }))}
                  rowKey="id"
                  columns={tableColumns.map((col) => ({
                    ...col,
                    render: col.render
                      ? (row) => (
                          <span className={row.highlight || ""}>{col.render(row)}</span>
                        )
                      : (row) => <span className={row.highlight || ""}>{row[col.key] ?? "—"}</span>,
                  }))}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5 text-[11px] text-gray-600">
                  <span>
                    Showing {pageStart}–{pageEnd} of {filteredEmployeeRows.length} row(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-7 px-3 rounded-md border border-gray-300 bg-white disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span>
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-7 px-3 rounded-md border border-gray-300 bg-white disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <ul className="mt-4 space-y-1 text-xs">
              {filteredCatalogItems.length === 0 ? (
                <li className="rounded-md border border-gray-100 bg-gray-50 px-2 py-3 text-center text-gray-500">
                  No reports match your search.
                </li>
              ) : (
                filteredCatalogItems.map((it) => (
                  <li
                    key={it}
                    className="flex items-center justify-between gap-2 rounded-md border border-gray-100 hover:bg-gray-50 px-2 py-1.5"
                  >
                    <span className="text-gray-700">{it}</span>
                    <span className="text-[10px] text-gray-400">Coming soon</span>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </SectionCard>
    </div>
  );
}
