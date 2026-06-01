import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard, FilterBar, TinySelect, TinyInput, Badge } from "./components/AdminUi";
import { supabase } from "../../lib/supabase";
import {
  attachMasterFields,
  fetchActiveEmployees,
  fetchAttendancePunchesInRange,
  formatAttendanceSupabaseError,
  formatWorkedMinutes,
  pairPunchesToDailyRows,
  workingHoursHighlightTone,
  workingHoursRowClass,
  WORKING_HOURS_LONG_THRESHOLD_MIN,
  WORKING_HOURS_SHORT_THRESHOLD_MIN,
} from "../../lib/attendanceDaily";

const REPORT_TABS = [
  { id: "employee", label: "Employee reports" },
  { id: "store", label: "Store reports" },
  { id: "misc", label: "Misc reports" },
  { id: "gate", label: "Gate reports" },
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

function formatInOut(row) {
  const inn = row.punchIn || "—";
  const out = row.punchOut || "—";
  if (inn === "—" && out === "—") return "—";
  return `${inn} – ${out}`;
}

export default function AdminOpsReports() {
  const today = isoDateToday();
  const [activeTab, setActiveTab] = useState("employee");
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

  const catalogItems = CATALOG_BY_TAB[activeTab] || [];

  useEffect(() => {
    if (activeTab !== "employee") return;
    let cancelled = false;
    (async () => {
      try {
        const employees = await fetchActiveEmployees(supabase);
        if (cancelled) return;
        const depts = [
          ...new Set(
            employees
              .map((e) => String(e.department || "").trim())
              .filter(Boolean)
          ),
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

  const filteredEmployeeRows = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    let rows = employeeRows;
    if (q) {
      rows = rows.filter((r) => {
        const name = String(r.employeeName || "").toLowerCase();
        const code = String(r.empCode || "").toLowerCase();
        return name.includes(q) || code.includes(q);
      });
    }
    if (departmentFilter && departmentFilter !== "ALL") {
      rows = rows.filter((r) => String(r.department || "").trim() === departmentFilter);
    }
    return rows;
  }, [employeeRows, nameSearch, departmentFilter]);

  const runEmployeeReport = useCallback(async () => {
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
  }, [nameSearch, departmentFilter, pageSize]);

  const handleRunReport = () => {
    if (activeTab === "employee") {
      runEmployeeReport();
      return;
    }
    setHasRun(true);
    setEmployeeRows([]);
    setError("");
  };

  const shortCount = useMemo(
    () => filteredEmployeeRows.filter((r) => workingHoursHighlightTone(r.workedMinutes) === "short").length,
    [filteredEmployeeRows]
  );
  const longCount = useMemo(
    () => filteredEmployeeRows.filter((r) => workingHoursHighlightTone(r.workedMinutes) === "long").length,
    [filteredEmployeeRows]
  );

  return (
    <div className="space-y-4">
      <SectionCard title="Reports & analytics — unified catalog" right={<Badge tone="bg-blue-50 text-blue-800">Export CSV / XLSX</Badge>}>
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

        <FilterBar>
          <TinySelect className="min-w-[120px]">
            <option>IFSPL</option>
            <option>IEVPL</option>
            <option>All</option>
          </TinySelect>
          <TinySelect className="min-w-[120px]">
            <option>All sites</option>
          </TinySelect>
          {activeTab === "employee" ? (
            <TinyInput
              type="date"
              className="w-[130px]"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
          ) : (
            <>
              <TinyInput type="date" className="w-[130px]" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <TinyInput type="date" className="w-[130px]" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </>
          )}
          {activeTab === "employee" && (
            <TinyInput
              value={empCodeFilter}
              onChange={(e) => setEmpCodeFilter(e.target.value)}
              placeholder="Employee code (optional)"
              className="w-[150px]"
            />
          )}
          <TinyInput
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder={activeTab === "employee" ? "Search name / code" : "Search report name"}
            className="min-w-[160px]"
          />
          {activeTab === "employee" && (
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
          )}
          {activeTab === "employee" && (
            <TinySelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-[100px]">
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </TinySelect>
          )}
          <button
            type="button"
            onClick={handleRunReport}
            disabled={loading}
            className="h-8 px-3 rounded-lg bg-[#1F3A8A] text-white text-xs disabled:opacity-60"
          >
            {loading ? "Loading…" : "Run report"}
          </button>
        </FilterBar>

        {activeTab === "employee" && (
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />
              Under {WORKING_HOURS_SHORT_THRESHOLD_MIN / 60}h
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" />
              Over {WORKING_HOURS_LONG_THRESHOLD_MIN / 60}h
            </span>
            {hasRun && !loading && (
              <span>
                {reportDate && (
                  <>
                    Attendance for <strong className="text-gray-800">{reportDate}</strong>
                    {" · "}
                  </>
                )}
                {filteredEmployeeRows.length}
                {filteredEmployeeRows.length !== employeeRows.length
                  ? ` of ${employeeRows.length}`
                  : ""}{" "}
                employee(s)
                {shortCount > 0 ? ` · ${shortCount} short` : ""}
                {longCount > 0 ? ` · ${longCount} long` : ""}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
        )}

        {activeTab === "employee" ? (
          <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {!hasRun && !loading ? (
              <div className="h-40 flex flex-col items-center justify-center gap-1 text-xs text-gray-500 bg-gray-50/80">
                <span>Select a date and click Run report to load employee attendance.</span>
              </div>
            ) : loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500 bg-gray-50/80">
                Loading attendance…
              </div>
            ) : employeeRows.length === 0 && !loading ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500 bg-gray-50/80">
                No punch data for {reportDate}.
              </div>
            ) : filteredEmployeeRows.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs text-gray-500 bg-gray-50/80">
                No rows match the name or department filters.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-[#1F3A8A]/5 text-gray-700 border-b border-gray-200">
                      <tr>
                        <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          Emp code
                        </th>
                        <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          Employee name
                        </th>
                        <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          Department
                        </th>
                        <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          Designation
                        </th>
                        <th className="text-left font-semibold px-3 py-2.5 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          In / Out
                        </th>
                        <th className="text-right font-semibold px-3 py-2.5 whitespace-nowrap uppercase tracking-wide text-[10px]">
                          Hours
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pagedEmployeeRows.map((row, idx) => {
                        const highlight = workingHoursRowClass(row.workedMinutes);
                        return (
                          <tr
                            key={row.id}
                            className={`${highlight || (idx % 2 === 0 ? "bg-white" : "bg-gray-50/50")} hover:bg-blue-50/40 transition-colors`}
                          >
                            <td className="px-3 py-2.5 font-semibold tabular-nums text-[#1F3A8A]">{row.empCode || "—"}</td>
                            <td className="px-3 py-2.5 text-gray-900 font-medium">{row.employeeName || "—"}</td>
                            <td className="px-3 py-2.5 text-gray-700">{row.department || "—"}</td>
                            <td className="px-3 py-2.5 text-gray-700">{row.designation || "—"}</td>
                            <td className="px-3 py-2.5 text-gray-800 tabular-nums">{formatInOut(row)}</td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                              {formatWorkedMinutes(row.workedMinutes)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5 text-[11px] text-gray-600">
                  <span>
                    Showing {pageStart}–{pageEnd} of {filteredEmployeeRows.length} employee(s)
                    {filteredEmployeeRows.length !== employeeRows.length ? ` (filtered from ${employeeRows.length})` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="h-7 px-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="min-w-[88px] text-center font-medium">
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="h-7 px-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <span className="flex gap-1 shrink-0">
                      <button type="button" className="h-7 px-2 rounded border border-gray-300 text-[11px]">
                        Preview
                      </button>
                      <button type="button" className="h-7 px-2 rounded bg-gray-900 text-white text-[11px]">
                        Export
                      </button>
                    </span>
                  </li>
                ))
              )}
            </ul>
            <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 h-28 flex items-center justify-center text-xs text-gray-500">
              {hasRun ? "Report catalog — use Export on a line item when wired." : "Click Run report to confirm filters for this tab."}
            </div>
          </>
        )}

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { k: "Open requests", v: "38" },
            { k: "Avg. approval time", v: "6.4h" },
            { k: "Stock accuracy (30d)", v: "99.1%" },
            { k: "Gate exceptions", v: "12" },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase">{s.k}</p>
              <p className="text-lg font-bold text-gray-900">{s.v}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
