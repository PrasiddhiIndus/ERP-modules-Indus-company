import React, { useEffect, useState } from "react";
import { Eye, FileText, Search } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { listPayslipsForEmployeeAsync, formatPayslipMoney } from "../../../lib/salaryPayslips";
import PayslipPreviewModal from "./PayslipPreviewModal";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function text(v) {
  const s = v == null ? "" : String(v).trim();
  return s && s !== "—" ? s : "";
}

function sundaysInMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || m < 1 || m > 12) return null;
  const last = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= last; d += 1) if (new Date(y, m - 1, d).getDay() === 0) count += 1;
  return count;
}

/**
 * Fill slip fields the salary sheet does not carry (statutory IDs, PAN, location, days split)
 * from the employee record. Values already on the slip win.
 */
function withEmployeeDetails(slip, emp) {
  const year = Number(slip.pay_year) || Number(String(slip.month_key || "").slice(0, 4));
  const month = Number(slip.pay_month) || Number(String(slip.month_key || "").slice(5, 7));
  const monthDays = Number(slip.month_days) || 0;
  const presentDays = Number(slip.present_days);
  return {
    ...slip,
    pay_year: slip.pay_year ?? (year || undefined),
    pay_month: slip.pay_month ?? (month || undefined),
    month_label: slip.month_label || (year && month ? `${MONTH_NAMES[month]} ${year}` : ""),
    employee_code: text(slip.employee_code) || text(emp?.employee_code) || text(emp?.employee_id),
    employee_name: text(slip.employee_name) || text(emp?.full_name),
    designation: text(slip.designation) || text(emp?.designation),
    department: text(slip.department) || text(emp?.department),
    date_of_joining: slip.date_of_joining || emp?.date_of_joining || null,
    confirmation_date: slip.confirmation_date || emp?.confirmation_date || null,
    work_location: text(slip.work_location) || text(emp?.location) || undefined,
    uan_number: text(slip.uan_number) || text(slip.uan_no) || text(emp?.uan_no),
    esic_number: text(slip.esic_number) || text(slip.esic_no) || text(emp?.esic_no),
    pan_card: text(slip.pan_card) || text(emp?.pan_card_no) || text(emp?.pan_no),
    account_no: text(slip.account_no) || text(emp?.bank_account_no),
    ifsc: text(slip.ifsc) || text(emp?.ifsc_code),
    // Salary P.Days already include paid leave (Mon–Sat); the rest of the working days are unpaid.
    weekly_off: slip.weekly_off ?? sundaysInMonth(year, month),
    lop_days:
      slip.lop_days ??
      (monthDays > 0 && Number.isFinite(presentDays)
        ? Math.max(0, Math.round((monthDays - presentDays) * 10) / 10)
        : 0),
  };
}

async function fetchEmployeeRecord(employee) {
  if (!employee?.id) return employee || null;
  const { data, error } = await supabase
    .from("admin_ifsp_employee_master")
    .select("*")
    .eq("id", employee.id)
    .maybeSingle();
  if (error) {
    console.warn("Payslips: employee details load skipped", error);
    return employee;
  }
  return { ...employee, ...(data || {}) };
}

/**
 * Employee Master → Payslips (preview + download).
 */
export default function EmployeePayslipsTab({ employee, openSlipId, openMonth }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      const [slips, emp] = await Promise.all([
        listPayslipsForEmployeeAsync(employee?.id),
        fetchEmployeeRecord(employee),
      ]);
      setRows(slips.map((s) => withEmployeeDetails(s, emp)));
    } catch (err) {
      console.error("Payslips: load failed", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [employee?.id]);

  useEffect(() => {
    if (!rows.length) return;
    if (openSlipId) {
      const found = rows.find((r) => r.id === openSlipId);
      if (found) setPreview(found);
      return;
    }
    if (openMonth) {
      const found = rows.find((r) => String(r.month_key) === String(openMonth));
      if (found) setPreview(found);
    }
  }, [rows, openSlipId, openMonth]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return (
      String(r.month_label || "").toLowerCase().includes(s) ||
      String(r.employee_code || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            className="h-8 rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs w-52 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400"
            placeholder="Search month…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search payslips"
          />
        </div>
        <button
          type="button"
          className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={reload}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} slip(s)</span>
      </div>

      {loading && !rows.length ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center text-xs text-slate-500">
          Loading payslips…
        </div>
      ) : !filtered.length ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <FileText className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-700 font-medium">No payslips yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            They appear here when a salary month is processed successfully.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_6.5rem_6.5rem_4.5rem] gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            <span>Month</span>
            <span className="text-right">Gross</span>
            <span className="text-right">Net pay</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setPreview(r)}
                  className="w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors grid grid-cols-1 sm:grid-cols-[1fr_6.5rem_6.5rem_4.5rem] gap-2 sm:gap-3 sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{r.month_label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {r.present_days ?? "—"} paid days
                      {r.processed_on || r.generated_at
                        ? ` · processed ${new Date(
                            r.processed_on
                              ? `${r.processed_on}T12:00:00`
                              : r.generated_at
                          ).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}`
                        : ""}
                    </p>
                  </div>
                  <div className="sm:text-right flex sm:block items-center justify-between gap-2">
                    <span className="sm:hidden text-[10px] uppercase tracking-wide text-slate-400">Gross</span>
                    <span className="text-[13px] tabular-nums text-slate-700">
                      ₹ {formatPayslipMoney(r.gross_wages)}
                    </span>
                  </div>
                  <div className="sm:text-right flex sm:block items-center justify-between gap-2">
                    <span className="sm:hidden text-[10px] uppercase tracking-wide text-slate-400">Net pay</span>
                    <span className="text-[13px] font-semibold tabular-nums text-slate-900">
                      ₹ {formatPayslipMoney(r.net_salary)}
                    </span>
                  </div>
                  <div className="sm:justify-self-end">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 border border-slate-200 rounded px-2.5 py-1 bg-white">
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview ? <PayslipPreviewModal payslip={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
