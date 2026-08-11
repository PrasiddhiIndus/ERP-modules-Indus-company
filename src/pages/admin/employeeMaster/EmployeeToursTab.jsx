import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { normalizeAttendanceEmpCode } from "../../../lib/attendanceDaily";
import {
  fetchToursForEmployee,
  formatTourDateRange,
  tourDaysCount,
  tourLocationLabel,
  tourReasonLabel,
} from "../../../lib/adminTourRequests";
import { SectionCard, StatusChip } from "../../adminOperations/components/AdminUi";
import { inputClass, PrimaryButton, ShellBanner } from "./deductions/deductionsUi";

const YEAR_DEFAULT = new Date().getFullYear();

function statusSeverity(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "info";
  if (s === "rejected" || s === "cancelled" || s === "withdrawn") return "critical";
  return "warning";
}

/**
 * Employee Master — Tours tab.
 * Loads this employee's tours from Indus One / admin tour request tables.
 */
export default function EmployeeToursTab({ employee }) {
  const empCode = normalizeAttendanceEmpCode(employee?.employee_code || employee?.employee_id || "");
  const [year, setYear] = useState(YEAR_DEFAULT);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({
    all: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    cancelled: 0,
    allDays: 0,
    approvedDays: 0,
    pendingDays: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const result = await fetchToursForEmployee({
        employeeMasterId: employee?.id ?? null,
        userId: employee?.user_id ?? null,
        employeeCode: empCode || null,
        year,
      });
      setRows(result.rows || []);
      setTotals(result.totals || totals);
    } catch (e) {
      console.error("Employee Tours tab: load failed", e);
      setError(e?.message || "Could not load tours for this employee.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, employee?.user_id, empCode, year]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <ShellBanner>
        Tours are loaded from Indus One / Admin tour requests (same source as Tour Approvals). Day
        count uses the request&apos;s days field, or the inclusive from–to date span. Approvals stay
        on the Tour Approvals screen.
      </ShellBanner>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-xs font-medium text-gray-600">
          Year
          <input
            type="number"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || YEAR_DEFAULT)}
            className={`${inputClass} mt-1 w-28`}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={load} disabled={loading}>
            Refresh
          </PrimaryButton>
          <Link
            to="/app/admin/employee/tour-approvals"
            className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 inline-flex items-center"
          >
            Open Tour Approvals
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Days on tour (approved)
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
            {totals.approvedDays}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">{totals.approved} approved request(s)</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Pending days
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{totals.pendingDays}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{totals.pending} pending</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            All tour days ({year})
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{totals.allDays}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{totals.all} request(s)</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Other</p>
          <p className="mt-1 text-sm text-gray-800">
            Rejected {totals.rejected} · Cancelled/withdrawn {totals.cancelled}
          </p>
        </div>
      </div>

      <SectionCard title={`Tour requests · ${year}`}>
        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Dates</th>
                  <th className="px-2 py-2 text-right">Days</th>
                  <th className="px-2 py-2 text-left">Location</th>
                  <th className="px-2 py-2 text-left">Purpose</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-left">Approver</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100 align-top">
                    <td className="px-2 py-2 whitespace-nowrap text-gray-800">
                      {formatTourDateRange(row.from_date, row.to_date)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium text-gray-900">
                      {tourDaysCount(row)}
                    </td>
                    <td className="px-2 py-2 text-gray-800 max-w-[10rem]">
                      {tourLocationLabel(row) || "—"}
                    </td>
                    <td className="px-2 py-2 text-gray-600 max-w-[14rem]" title={tourReasonLabel(row)}>
                      <span className="line-clamp-2">{tourReasonLabel(row) || "—"}</span>
                    </td>
                    <td className="px-2 py-2">
                      <StatusChip
                        label={String(row.status || "pending")}
                        severity={statusSeverity(row.status)}
                      />
                    </td>
                    <td className="px-2 py-2 text-gray-600">{row.approver_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4">
            No tour requests found for this employee in {year}.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
