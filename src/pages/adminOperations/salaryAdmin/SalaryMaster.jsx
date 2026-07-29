import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { History, RefreshCw, Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";
import { Drawer } from "../components/AdminUi";
import { fetchSalaryStructureMap, formatINR } from "./salaryData";
import SalaryRevisionHistory from "./SalaryRevisionHistory";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const thBase =
  "px-3.5 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-[0.08em] whitespace-nowrap border-b border-gray-200 align-middle bg-gray-50";
const thLeft = `${thBase} text-left`;
const thCenter = `${thBase} text-center`;
const thRight = `${thBase} text-right`;

const tdBase = "px-3.5 py-3 text-sm text-gray-900 align-middle";
const tdCenter = `${tdBase} text-center tabular-nums whitespace-nowrap`;
const tdRight = `${tdBase} text-right tabular-nums whitespace-nowrap`;
const tdName = `${tdBase} text-left font-medium whitespace-nowrap max-w-[220px] truncate`;
const tdText = `${tdBase} text-left whitespace-nowrap max-w-[180px] truncate`;

/**
 * Salary Master — employees from Employee Master (admin).
 * Click a row to open compensation profile. CTC drafts are UI-only (local device).
 * Actions: Revise (when CTC exists) · History (revision timeline).
 */
export default function SalaryMaster() {
  const navigate = useNavigate();
  const location = useLocation();
  const [employees, setEmployees] = useState([]);
  const [salaryByEmployee, setSalaryByEmployee] = useState(() => fetchSalaryStructureMap());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [historyEmployee, setHistoryEmployee] = useState(null);

  const refreshSalaryMap = useCallback(() => {
    setSalaryByEmployee(fetchSalaryStructureMap());
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEmployees([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from(EMPLOYEE_MASTER_TABLE)
        .select(
          "id, employee_id, employment_type, employee_code, full_name, designation, department"
        )
        .order("employee_id", { ascending: true });

      if (fetchError) throw fetchError;
      setEmployees(data || []);
      refreshSalaryMap();
    } catch (err) {
      console.error("Salary Master: failed to load employees", err);
      setError("Could not load employee list. Please try again.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, [refreshSalaryMap]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    refreshSalaryMap();
  }, [location.pathname, refreshSalaryMap]);

  useEffect(() => {
    const onFocus = () => refreshSalaryMap();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshSalaryMap]);

  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((row) => {
      const typeLabel = String(
        employmentTypeLabel(row.employment_type || row.employee_id) || ""
      ).toLowerCase();
      return (
        String(row.full_name || "").toLowerCase().includes(q) ||
        String(row.employee_id || "").toLowerCase().includes(q) ||
        String(row.employee_code || "").toLowerCase().includes(q) ||
        String(row.designation || "").toLowerCase().includes(q) ||
        String(row.department || "").toLowerCase().includes(q) ||
        typeLabel.includes(q)
      );
    });
  }, [employees, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = filteredEmployees.slice(startIndex, endIndex);
  const pageStart = filteredEmployees.length ? startIndex + 1 : 0;
  const pageEnd = Math.min(endIndex, filteredEmployees.length);

  const historySalary = historyEmployee
    ? salaryByEmployee.get(String(historyEmployee.id))
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)] w-full overflow-hidden overflow-x-hidden bg-gray-50">
      <div className="p-4 md:p-6 h-full w-full flex flex-col gap-4 max-w-[1600px] mx-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start shrink-0 min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Salary Master</h1>
            <p className="text-sm text-gray-600 mt-1">
              Set CTC once per employee. Later changes use Revise; History shows past versions.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap xl:justify-end items-stretch sm:items-center gap-2 w-full xl:w-auto">
            <div className="relative flex-1 sm:flex-none sm:w-[280px] xl:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name, machine ID, code…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-10 pl-9 pr-3 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                aria-label="Search employees"
              />
            </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden w-full min-w-0 flex flex-col flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white">
            <h3 className="text-sm font-semibold text-gray-900">
              Employees
              <span className="ml-2 text-gray-500 font-medium tabular-nums">
                ({filteredEmployees.length}
                {searchTerm.trim() ? ` of ${employees.length}` : ""})
              </span>
            </h3>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
                Showing {pageStart}–{pageEnd} of {filteredEmployees.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className="h-8 px-3 text-xs font-medium border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-1 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className="h-8 px-3 text-xs font-medium border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-600 p-4">{error}</p>
          ) : employees.length === 0 ? (
            <p className="text-sm text-gray-500 py-16 text-center">No employees found in Employee Master.</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="text-sm text-gray-500 py-16 text-center">No employees match your search.</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full min-w-[1060px] border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr>
                    <th className={`${thCenter} w-14`}>Sr No.</th>
                    <th className={`${thCenter} w-[7.5rem]`}>Machine ID</th>
                    <th className={`${thCenter} w-[8.5rem]`}>Employee Code</th>
                    <th className={thLeft}>Full Name</th>
                    <th className={thLeft}>Designation</th>
                    <th className={thLeft}>Department</th>
                    <th className={`${thCenter} w-[8.5rem]`}>Employee Type</th>
                    <th className={`${thRight} w-[9rem]`}>Salary (Monthly)</th>
                    <th className={`${thRight} w-[9rem]`}>CTC (Annual)</th>
                    <th className={`${thCenter} w-[7.5rem]`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => {
                    const rowNo = startIndex + idx + 1;
                    const typeLabel = employmentTypeLabel(row.employment_type || row.employee_id);
                    const salary = salaryByEmployee.get(String(row.id));
                    const hasCtc = Boolean(salary?.declared);
                    const revCount = Number(salary?.revision_count) || 0;
                    const histCount = Array.isArray(salary?.revisions) ? salary.revisions.length : 0;
                    const monthly =
                      hasCtc &&
                      (salary.gross_monthly != null || salary.basic_monthly != null)
                        ? salary.gross_monthly ?? salary.basic_monthly
                        : null;
                    const ctcAnnual = hasCtc ? salary.ctc_annual : null;
                    const zebra = idx % 2 === 1 ? "bg-slate-50/60" : "bg-white";

                    return (
                      <tr
                        key={row.id}
                        onClick={() => navigate(`/app/admin/salary-admin/salary-master/${row.id}`)}
                        className={`${zebra} border-b border-gray-100 hover:bg-blue-50/70 cursor-pointer transition-colors`}
                      >
                        <td className={`${tdCenter} text-gray-500`}>{rowNo}</td>
                        <td className={`${tdCenter} font-mono text-xs text-gray-700`} title={row.employee_id || ""}>
                          {row.employee_id || "–"}
                        </td>
                        <td className={`${tdCenter} font-mono text-xs text-gray-700`} title={row.employee_code || ""}>
                          {row.employee_code || "–"}
                        </td>
                        <td className={tdName} title={row.full_name || ""}>
                          {row.full_name || "–"}
                        </td>
                        <td className={tdText} title={row.designation || ""}>
                          {row.designation || "–"}
                        </td>
                        <td className={tdText} title={row.department || ""}>
                          {row.department || "–"}
                        </td>
                        <td className={tdCenter}>
                          {typeLabel ? (
                            <span className="inline-flex items-center justify-center min-w-[4.5rem] px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-700">
                              {typeLabel}
                            </span>
                          ) : (
                            "–"
                          )}
                        </td>
                        <td className={tdRight}>
                          {monthly != null ? (
                            <span className="font-medium text-gray-900">{formatINR(monthly)}</span>
                          ) : (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-[11px] font-medium text-amber-800">
                              Not set
                            </span>
                          )}
                        </td>
                        <td className={tdRight}>
                          {ctcAnnual != null ? (
                            <span className="font-medium text-gray-900">{formatINR(ctcAnnual)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td
                          className={`${tdCenter}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={!hasCtc}
                              title={
                                hasCtc
                                  ? "Revise CTC"
                                  : "Set CTC first, then revise"
                              }
                              aria-label="Revise CTC"
                              onClick={() =>
                                navigate(
                                  `/app/admin/salary-admin/salary-master/${row.id}?mode=revise`
                                )
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-[#1F3A8A] hover:bg-blue-50 hover:border-blue-200 disabled:opacity-35 disabled:pointer-events-none disabled:text-gray-400"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title={
                                hasCtc
                                  ? histCount
                                    ? `Revision history (${histCount})`
                                    : "Revision history"
                                  : "No CTC / history yet"
                              }
                              aria-label="Revision history"
                              onClick={() => {
                                setHistoryEmployee(row);
                                refreshSalaryMap();
                              }}
                              className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                            >
                              <History className="h-3.5 w-3.5" />
                              {revCount > 0 ? (
                                <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 rounded-full bg-[#1F3A8A] text-[9px] font-bold text-white leading-4">
                                  {revCount > 9 ? "9+" : revCount}
                                </span>
                              ) : null}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={Boolean(historyEmployee)}
        title="CTC revision history"
        onClose={() => setHistoryEmployee(null)}
        widthClass="max-w-md"
      >
        <SalaryRevisionHistory employee={historyEmployee} salary={historySalary} />
      </Drawer>
    </div>
  );
}
