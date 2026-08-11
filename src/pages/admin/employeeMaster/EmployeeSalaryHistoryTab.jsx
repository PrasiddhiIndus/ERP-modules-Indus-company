import React, { useEffect, useState } from "react";
import { DenseTable, FilterBar, StatusChip } from "../../adminOperations/components/AdminUi";
import {
  fetchSalaryHistoryForEmployee,
  formatPayslipMoney,
  getPayslipById,
  buildPayslipFromLine,
} from "../../../lib/salaryPayslips";
import PayslipPreviewModal from "./PayslipPreviewModal";

/** Display-only samples when this employee has no processed months yet. */
const SHOW_HISTORY_PREVIEW_MOCK = true;

function buildMockHistory(employee) {
  const id = employee?.id ?? "preview";
  const code = employee?.employee_code || employee?.employee_id || "EMP001";
  const name = employee?.full_name || "Sample Employee";

  const make = (month, label, days, gross, ded, net, rev = 1) => {
    const run = {
      id: `mock_run_${id}_${month}`,
      pay_year: Number(month.slice(0, 4)),
      pay_month: Number(month.slice(5, 7)),
      month_key: month,
      month_days: 26,
      revision_no: rev,
      status: "processed",
    };
    const line = {
      employee_master_id: id,
      employee_code: code,
      employee_name: name,
      designation: employee?.designation || "Executive",
      department: employee?.department || "Operations",
      present_days: days,
      month_days: 26,
      basic_full: 18000,
      basic_earned: Math.round((18000 * days) / 26),
      hra_full: 7200,
      hra_earned: Math.round((7200 * days) / 26),
      special_full: 9800,
      special_allowance: Math.round((9800 * days) / 26),
      gross_wages: gross,
      emp_pf: 1800,
      emp_esic: 0,
      pt_amount: 200,
      loan: 2500,
      sal_adv: 0,
      unpaid_paid: 0,
      tds: 1200,
      total_ded: ded,
      net_salary: net,
      bank_amount: net,
      account_no: employee?.bank_account_no || "50100234567890",
      ifsc: employee?.ifsc_code || "HDFC0001234",
      date_of_joining: employee?.date_of_joining || null,
      custom_components: [],
    };
    return {
      id: `mock_hist_${id}_${month}`,
      month_key: month,
      month_label: label,
      pay_year: run.pay_year,
      pay_month: run.pay_month,
      revision_no: rev,
      present_days: days,
      gross_wages: gross,
      total_ded: ded,
      net_salary: net,
      bank_amount: net,
      payslip_id: null,
      status: "processed",
      updated_at: `${month}-28T10:00:00.000Z`,
      line,
      run,
      _preview_mock: true,
    };
  };

  return [
    make("2026-07", "July 2026", 26, 35000, 5700, 29300),
    make("2026-06", "June 2026", 24, 32307, 5062, 27245),
    make("2026-05", "May 2026", 26, 35000, 6700, 28300, 2),
  ];
}

/**
 * Employee Master → Salary history (processed months).
 */
export default function EmployeeSalaryHistoryTab({ employee }) {
  const [rows, setRows] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchSalaryHistoryForEmployee(employee?.id);
        if (cancelled) return;
        if (list.length) {
          setRows(list);
          setUsingMock(false);
        } else if (SHOW_HISTORY_PREVIEW_MOCK) {
          setRows(buildMockHistory(employee));
          setUsingMock(true);
        } else {
          setRows([]);
          setUsingMock(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [employee?.id]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return String(r.month_label || "").toLowerCase().includes(s) || String(r.month_key || "").includes(s);
  });

  return (
    <div className="space-y-3">
      {usingMock ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing sample salary history for layout preview. Real months replace these after salary processing.
        </p>
      ) : null}
      <FilterBar>
        <input
          className="h-8 rounded-md border border-slate-200 px-2.5 text-xs w-48"
          placeholder="Search month…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} month(s)</span>
      </FilterBar>

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading salary history…</p>
      ) : !filtered.length ? (
        <p className="text-sm text-slate-500 py-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
          No processed salary months yet. Run Salary Processing for a month to populate history and payslips.
        </p>
      ) : (
        <DenseTable
          columns={[
            { key: "month", label: "Month", render: (r) => <span className="font-medium text-slate-800">{r.month_label}</span> },
            { key: "rev", label: "Rev", render: (r) => (r.revision_no > 1 ? `R${r.revision_no}` : "—") },
            { key: "days", label: "Days", render: (r) => r.present_days ?? "—" },
            {
              key: "gross",
              label: "Gross",
              cellClassName: "text-right",
              headerClassName: "text-right",
              render: (r) => formatPayslipMoney(r.gross_wages),
            },
            {
              key: "ded",
              label: "Deductions",
              cellClassName: "text-right",
              headerClassName: "text-right",
              render: (r) => formatPayslipMoney(r.total_ded),
            },
            {
              key: "net",
              label: "Net",
              cellClassName: "text-right",
              headerClassName: "text-right",
              render: (r) => <span className="font-semibold text-emerald-800">₹ {formatPayslipMoney(r.net_salary)}</span>,
            },
            {
              key: "status",
              label: "Status",
              render: (r) => (
                <StatusChip
                  label={r.status === "confirmed" ? "Confirmed" : "Processed"}
                  severity="info"
                />
              ),
            },
            {
              key: "act",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-indigo-700 hover:underline disabled:opacity-40"
                  disabled={!r.payslip_id && !(r.line && r.run)}
                  onClick={() => {
                    if (r.payslip_id) {
                      setPreview(getPayslipById(r.payslip_id));
                    } else if (r.line && r.run) {
                      setPreview(buildPayslipFromLine(r.run, r.line));
                    }
                  }}
                >
                  Payslip
                </button>
              ),
            },
          ]}
          rows={filtered}
          rowKey="id"
        />
      )}

      {preview ? <PayslipPreviewModal payslip={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
