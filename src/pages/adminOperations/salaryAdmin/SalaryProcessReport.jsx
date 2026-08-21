import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Eye, RefreshCw, Search } from "lucide-react";
import { KpiTile, PageTaskHeader, SectionCard } from "../components/AdminUi";
import { formatINRPlain } from "./salaryData";
import {
  buildSalaryProcessReport,
  monthLabel,
} from "./salaryMonthProcessing";
import {
  buildPayslipFromLine,
  getPayslipById,
  payslipId,
} from "../../../lib/salaryPayslips";
import { exportSalaryReportWorkbook } from "../../../lib/salaryProcessingExcel";
import PayslipPreviewModal from "../../admin/employeeMaster/PayslipPreviewModal";

const selectIn =
  "h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const textIn =
  "h-7 px-1.5 text-[11px] border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent";
const btnGhost =
  "h-7 px-2.5 text-[11px] font-medium rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1";

const MONTH_OPTIONS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

function previousPayYearMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function Money({ value, strong = false }) {
  if (value == null || value === "") {
    return <span className="text-slate-300">—</span>;
  }
  return (
    <span className={`tabular-nums ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      {formatINRPlain(value)}
    </span>
  );
}

function rupees(value) {
  if (value == null || value === "") return "—";
  return `₹${formatINRPlain(value)}`;
}

/**
 * Salary process report — who was processed for a month, grouped by process day.
 * Top-level Salary Admin module (separate from Process month).
 */
export default function SalaryProcessReport() {
  const fallback = useMemo(() => previousPayYearMonth(), []);
  const [searchParams] = useSearchParams();
  const [year, setYear] = useState(() => {
    const y = Number(searchParams.get("year"));
    return Number.isFinite(y) && y > 2000 ? y : fallback.year;
  });
  const [month, setMonth] = useState(() => {
    const m = Number(searchParams.get("month"));
    return m >= 1 && m <= 12 ? m : fallback.month;
  });
  const [search, setSearch] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [exporting, setExporting] = useState(false);

  const years = useMemo(() => {
    const y = fallback.year;
    return [y + 1, y, y - 1, y - 2, y - 3];
  }, [fallback.year]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await buildSalaryProcessReport({ year, month });
      setReport(data);
    } catch (err) {
      console.warn("Salary process report failed", err);
      setReport(null);
      setError(err?.message || "Could not load process report.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const reportRows = useMemo(() => {
    const groups = report?.groups || [];
    const needle = search.trim().toLowerCase();
    const out = [];
    for (const g of groups) {
      const employees = (g.employees || []).filter((e) => {
        if (!needle) return true;
        const hay = [e.employee_code, e.employee_name, e.designation, e.department]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
      if (!employees.length) continue;
      const total_gross = employees.reduce((s, e) => s + (Number(e.gross_wages) || 0), 0);
      const total_net = employees.reduce((s, e) => s + (Number(e.net_salary) || 0), 0);
      out.push({
        ...g,
        employees,
        employee_count: employees.length,
        total_gross,
        total_net,
      });
    }
    return out;
  }, [report, search]);

  const openSlip = useCallback(
    (emp) => {
      if (!emp) return;
      const key = report?.month_key;
      const slip =
        (emp.line?.computed_json && emp.line.computed_json.payslip) ||
        (emp.payslip_id && getPayslipById(emp.payslip_id)) ||
        (key ? getPayslipById(payslipId(key, emp.employee_master_id)) : null) ||
        (report?.run && emp.line ? buildPayslipFromLine(report.run, emp.line) : null);
      if (!slip) {
        setError("Salary slip is not ready for this employee yet.");
        return;
      }
      setError("");
      setPreview(slip);
    },
    [report]
  );

  const handleExport = useCallback(async () => {
    if (!reportRows.length) {
      setError("No processed employees to download.");
      return;
    }
    setExporting(true);
    setError("");
    try {
      await exportSalaryReportWorkbook(report, { groups: reportRows });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Excel download failed.");
    } finally {
      setExporting(false);
    }
  }, [report, reportRows]);

  const processDayText = (report?.process_days || [])
    .map((d) =>
      /^\d{4}-\d{2}-\d{2}$/.test(d)
        ? new Date(`${d}T12:00:00`).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : d
    )
    .join(" · ");

  return (
    <div className="space-y-3 max-w-[1600px] w-full mx-auto">
      <PageTaskHeader
        className="mb-0"
        title="Salary Reports"
        subtitle="Processed salary by month — who was passed, on which day, and total Gross to credit."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/admin/salary-admin/salary-processing"
              className="text-[11px] text-accent hover:underline"
            >
              Open Salary Processing
            </Link>
            <button
              type="button"
              className={btnGhost}
              onClick={handleExport}
              disabled={loading || exporting || !reportRows.length}
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Downloading…" : "Download Excel"}
            </button>
            <button type="button" className={btnGhost} onClick={loadReport} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      <SectionCard
        title="Process report"
        className="[&_.erp-card-header]:min-h-0 [&_.erp-card-header]:py-2 [&_.erp-card-body]:p-3 space-y-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
            <span className="block">Month</span>
            <select
              className={selectIn}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value) || fallback.month)}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-slate-500 space-y-0.5">
            <span className="block">Year</span>
            <select
              className={selectIn}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || fallback.year)}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${textIn} pl-6 w-56`}
              placeholder="Search processed employees…"
              aria-label="Search processed employees"
            />
          </div>
          <span className="text-[11px] text-slate-500 pb-1">
            {loading
              ? "Loading…"
              : `${report?.total_employees || 0} processed · ${reportRows.length} day group(s)`}
          </span>
        </div>

        {error ? (
          <p className="text-xs text-red-600 rounded border border-red-100 bg-red-50 px-2.5 py-1.5">
            {error}
          </p>
        ) : null}

        {report?.has_sheet && report?.total_employees ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KpiTile
              label="Processed"
              value={String(report.total_employees)}
              sub={report.month_label || monthLabel(year, month)}
            />
            <KpiTile
              label="Total Gross"
              value={rupees(report.total_gross)}
              sub="Earned wages this month"
            />
            <KpiTile
              label="To credit"
              value={rupees(report.total_net)}
              sub="Net salary to employees"
            />
            <KpiTile
              label="Processed on"
              value={processDayText || "—"}
              sub={
                (report.process_days || []).length > 1
                  ? `${report.process_days.length} process days`
                  : "Day Process salary was clicked"
              }
            />
          </div>
        ) : null}

        <p className="text-[11px] text-slate-600">
          Employees processed for{" "}
          <span className="font-semibold text-slate-800">
            {report?.month_label || monthLabel(year, month)}
          </span>
          , grouped by the day Process salary was clicked. Open a row to view that day’s salary slip.
        </p>

        {loading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Loading process report…</p>
        ) : !report?.has_sheet || !report?.total_employees ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">No salary processed yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Process salary from All Employees, then on the Processed tab click Processed to create
              salary slips and this report.
            </p>
            <Link
              to="/app/admin/salary-admin/salary-processing"
              className="inline-block mt-3 text-[11px] font-medium text-accent hover:underline"
            >
              Go to Salary Processing
            </Link>
          </div>
        ) : !reportRows.length ? (
          <p className="text-xs text-slate-500 py-6 text-center">No employees match this search.</p>
        ) : (
          <div className="space-y-3">
            {reportRows.map((group) => (
              <div
                key={group.process_day}
                className="rounded border border-slate-200 overflow-hidden bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-800">
                      Processed on {group.process_day_label}
                    </p>
                    <p className="text-[10px] text-slate-500">{group.process_day}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums text-slate-600">
                    <span>
                      {group.employee_count} employee
                      {group.employee_count === 1 ? "" : "s"}
                    </span>
                    <span>
                      Gross{" "}
                      <span className="font-semibold text-slate-800">
                        {rupees(group.total_gross)}
                      </span>
                    </span>
                    <span>
                      Net{" "}
                      <span className="font-semibold text-slate-800">{rupees(group.total_net)}</span>
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-[11px]">
                    <thead className="bg-white text-slate-500">
                      <tr className="border-b border-slate-100">
                        <th className="px-2 py-1.5 text-left font-semibold">Sr</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Code</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Name</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Designation</th>
                        <th className="px-2 py-1.5 text-right font-semibold">P.Days</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Gross</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Ded</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Net</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Slip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.employees.map((emp, idx) => (
                        <tr
                          key={`${group.process_day}_${emp.employee_master_id}`}
                          className="border-b border-slate-50 hover:bg-slate-50/80"
                        >
                          <td className="px-2 py-1.5 tabular-nums text-slate-500">{idx + 1}</td>
                          <td className="px-2 py-1.5 font-medium text-slate-800">
                            {emp.employee_code || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-slate-800">{emp.employee_name || "—"}</td>
                          <td
                            className="px-2 py-1.5 text-slate-600 truncate max-w-[10rem]"
                            title={emp.designation || ""}
                          >
                            {emp.designation || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {emp.present_days ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            <Money value={emp.gross_wages} />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            <Money value={emp.total_ded} />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            <Money value={emp.net_salary} strong />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-800 hover:text-accent"
                                onClick={() => openSlip(emp)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                              {emp.employee_master_id ? (
                                <Link
                                  to={`/app/admin/employee/master/${emp.employee_master_id}?tab=payslips&month=${report?.month_key || ""}`}
                                  className="text-[11px] text-accent hover:underline"
                                >
                                  Profile
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {preview ? <PayslipPreviewModal payslip={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
