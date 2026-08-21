import React, { useEffect, useState } from "react";
import { Eye, FileText, Search } from "lucide-react";
import { listPayslipsForEmployeeAsync, formatPayslipMoney, getPayslipById } from "../../../lib/salaryPayslips";
import PayslipPreviewModal from "./PayslipPreviewModal";

/** Display-only samples when this employee has no generated payslips yet. */
const SHOW_PAYSLIP_PREVIEW_MOCK = true;

function buildMockPayslips(employee) {
  const id = employee?.id ?? "preview";
  const code = employee?.employee_code || employee?.employee_id || "EMP001";
  const name = employee?.full_name || "Sample Employee";
  const designation = employee?.designation || "Executive";
  const department = employee?.department || "Operations";
  const base = {
    employee_master_id: id,
    employee_code: code,
    employee_name: name,
    designation,
    department,
    work_location: "Head Office",
    account_no: employee?.bank_account_no || "50100234567890",
    ifsc: employee?.ifsc_code || "HDFC0001234",
    date_of_joining: employee?.date_of_joining || "2022-04-15",
    uan_number: "101294097533",
    esic_number: "Not Applicable",
    pan_card: "NA",
    month_days: 26,
    present_days: 26,
    weekly_off: 4,
    leave_days: 0,
    lop_days: 0,
    salary_rate: 35000,
    basic_full: 18000,
    basic_earned: 18000,
    hra_full: 7200,
    hra_earned: 7200,
    special_full: 9800,
    special_allowance: 9800,
    custom_earn: 0,
    custom_ded: 0,
    custom_components: [],
    pf_basic: 15000,
    pf_earned_basic: 15000,
    emp_pf: 1800,
    emp_esic: 0,
    pt_amount: 200,
    loan: 2500,
    sal_adv: 0,
    unpaid_paid: 0,
    tds: 1200,
    status: "generated",
    _preview_mock: true,
  };

  return [
    {
      ...base,
      id: `mock_ps_${id}_2026-07`,
      pay_year: 2026,
      pay_month: 7,
      month_key: "2026-07",
      month_label: "July 2026",
      revision_no: 1,
      present_days: 26,
      weekly_off: 5,
      gross_wages: 35000,
      total_ded: 5700,
      net_salary: 29300,
      bank_amount: 29300,
      generated_at: "2026-08-01T10:00:00.000Z",
    },
    {
      ...base,
      id: `mock_ps_${id}_2026-06`,
      pay_year: 2026,
      pay_month: 6,
      month_key: "2026-06",
      month_label: "June 2026",
      revision_no: 1,
      present_days: 24,
      weekly_off: 4,
      leave_days: 0,
      lop_days: 2,
      basic_earned: 16615,
      hra_earned: 6646,
      special_allowance: 9046,
      gross_wages: 32307,
      emp_pf: 1662,
      total_ded: 5062,
      net_salary: 27245,
      bank_amount: 27245,
      generated_at: "2026-07-01T10:00:00.000Z",
    },
    {
      ...base,
      id: `mock_ps_${id}_2026-05`,
      pay_year: 2026,
      pay_month: 5,
      month_key: "2026-05",
      month_label: "May 2026",
      revision_no: 2,
      present_days: 26,
      weekly_off: 5,
      gross_wages: 35000,
      loan: 2500,
      sal_adv: 1000,
      total_ded: 6700,
      net_salary: 28300,
      bank_amount: 28300,
      generated_at: "2026-06-02T09:30:00.000Z",
    },
  ];
}

/**
 * Employee Master → Payslips (preview + download).
 */
export default function EmployeePayslipsTab({ employee, openSlipId, openMonth }) {
  const [rows, setRows] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);

  async function reload() {
    const real = await listPayslipsForEmployeeAsync(employee?.id);
    if (real.length) {
      setRows(real);
      setUsingMock(false);
      return;
    }
    if (SHOW_PAYSLIP_PREVIEW_MOCK) {
      setRows(buildMockPayslips(employee));
      setUsingMock(true);
      return;
    }
    setRows([]);
    setUsingMock(false);
  }

  useEffect(() => {
    reload();
  }, [employee?.id]);

  useEffect(() => {
    if (!rows.length) return;
    if (openSlipId) {
      const found = rows.find((r) => r.id === openSlipId) || getPayslipById(openSlipId);
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
      {usingMock ? (
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
          Sample payslips for preview. Real slips replace these after salary processing.
        </p>
      ) : null}

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
          className="h-8 px-2.5 rounded-md border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          onClick={reload}
        >
          Refresh
        </button>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} slip(s)</span>
      </div>

      {!filtered.length ? (
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
                  onClick={() => setPreview(getPayslipById(r.id) || r)}
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
