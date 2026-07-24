import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { EMPLOYEE_MASTER_TABLE } from "../../../modules/payroll/integrations";
import { employmentTypeLabel } from "../../../utils/employeeMasterReminders";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const thBase =
  "px-3 py-2.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap border-b border-gray-200 align-middle bg-gray-50";
const th = `${thBase} text-left`;
const thCenter = `${thBase} text-center`;
const tdBase = "px-3 py-2.5 text-xs text-gray-900 align-middle bg-white";
const td = `${tdBase} whitespace-nowrap max-w-[220px] truncate`;
const tdCenter = `${tdBase} text-center tabular-nums whitespace-nowrap`;

/**
 * Salary Master — employee list from Employee Master (read-only table for now).
 * Layout mirrors Employee Master: sticky opaque header, scroll body, pagination.
 * Admin module only (`admin` access).
 */
export default function SalaryMaster() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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
        .select("id, employee_id, employment_type, employee_code, full_name, designation")
        .order("employee_id", { ascending: true });

      if (fetchError) throw fetchError;
      setEmployees(data || []);
    } catch (err) {
      console.error("Salary Master: failed to load employees", err);
      setError("Could not load employee list. Please try again.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

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
        {/* Header — same pattern as Employee Master */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-4 items-start shrink-0 min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Salary Master</h1>
            <p className="text-sm text-gray-600 mt-1">
              Find employees from Employee Master for salary setup.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap xl:justify-end items-stretch sm:items-center gap-2 w-full xl:w-auto">
            <div className="relative flex-1 sm:flex-none sm:w-[280px] xl:w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, machine ID, code…"
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

        {/* Table card */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden w-full min-w-0 flex flex-col flex-1 min-h-0">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <h3 className="text-lg font-semibold text-gray-900">
              Employees ({filteredEmployees.length}
              {searchTerm.trim() ? ` of ${employees.length}` : ""})
            </h3>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-sm text-gray-500 whitespace-nowrap">
                Showing {pageStart}–{pageEnd} of {filteredEmployees.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className="h-8 px-3 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-2 text-sm text-gray-600 whitespace-nowrap">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className="h-8 px-3 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-red-600 p-4">{error}</p>
          ) : employees.length === 0 ? (
            <p className="text-sm text-gray-500 py-12 text-center">No employees found in Employee Master.</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="text-sm text-gray-500 py-12 text-center">No employees match your search.</p>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="w-max min-w-full">
                <table className="min-w-full divide-y divide-gray-200 border-b border-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-20 shadow-[0_1px_0_0_#e5e7eb]">
                    <tr>
                      <th className={thCenter}>Sr No</th>
                      <th className={thCenter}>Machine ID</th>
                      <th className={th}>Employee type</th>
                      <th className={thCenter}>Employee code</th>
                      <th className={th}>Full name</th>
                      <th className={th}>Designation</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pageRows.map((row, idx) => {
                      const rowNo = startIndex + idx + 1;
                      const typeLabel = employmentTypeLabel(row.employment_type || row.employee_id);
                      return (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className={tdCenter}>{rowNo}</td>
                          <td className={tdCenter} title={row.employee_id || ""}>
                            {row.employee_id || "–"}
                          </td>
                          <td className={td} title={typeLabel}>
                            {typeLabel || "–"}
                          </td>
                          <td className={tdCenter} title={row.employee_code || ""}>
                            {row.employee_code || "–"}
                          </td>
                          <td className={td} title={row.full_name || ""}>
                            {row.full_name || "–"}
                          </td>
                          <td className={td} title={row.designation || ""}>
                            {row.designation || "–"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
