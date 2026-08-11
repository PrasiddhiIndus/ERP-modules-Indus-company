import React, { useEffect, useState } from "react";
import { DenseTable, FilterBar, StatusChip } from "../../adminOperations/components/AdminUi";
import { listPayslipsForEmployee, formatPayslipMoney, getPayslipById } from "../../../lib/salaryPayslips";
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
    account_no: employee?.bank_account_no || "50100234567890",
    ifsc: employee?.ifsc_code || "HDFC0001234",
    date_of_joining: employee?.date_of_joining || "2022-04-15",
    month_days: 26,
    present_days: 26,
    salary_rate: 45000,
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
export default function EmployeePayslipsTab({ employee }) {
  const [rows, setRows] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);

  function reload() {
    const real = listPayslipsForEmployee(employee?.id);
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

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return String(r.month_label || "").toLowerCase().includes(s) || String(r.employee_code || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-3">
      {usingMock ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Showing sample payslips for layout preview. Real payslips replace these after salary processing.
        </p>
      ) : null}
      <FilterBar>
        <input
          className="h-8 rounded-md border border-slate-200 px-2.5 text-xs w-48"
          placeholder="Search month…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="h-8 px-2.5 rounded-md border border-slate-200 text-[11px] font-medium" onClick={reload}>
          Refresh
        </button>
        <span className="text-[11px] text-slate-500 ml-auto">{filtered.length} payslip(s)</span>
      </FilterBar>

      {!filtered.length ? (
        <p className="text-sm text-slate-500 py-8 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80">
          No payslips yet. They are created automatically when a salary month is processed successfully.
        </p>
      ) : (
        <DenseTable
          columns={[
            { key: "month", label: "Month", render: (r) => <span className="font-medium">{r.month_label}</span> },
            {
              key: "net",
              label: "Net pay",
              cellClassName: "text-right",
              headerClassName: "text-right",
              render: (r) => <span className="font-semibold text-emerald-800">₹ {formatPayslipMoney(r.net_salary)}</span>,
            },
            {
              key: "gross",
              label: "Gross",
              cellClassName: "text-right",
              headerClassName: "text-right",
              render: (r) => formatPayslipMoney(r.gross_wages),
            },
            {
              key: "gen",
              label: "Generated",
              render: (r) => (r.generated_at ? new Date(r.generated_at).toLocaleDateString("en-IN") : "—"),
            },
            {
              key: "st",
              label: "Status",
              render: () => <StatusChip label="Ready" severity="info" />,
            },
            {
              key: "act",
              label: "",
              render: (r) => (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-indigo-700 hover:underline"
                  onClick={() => setPreview(getPayslipById(r.id) || r)}
                >
                  Preview / Download
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
