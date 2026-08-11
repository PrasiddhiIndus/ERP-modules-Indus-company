import React from "react";
import { formatPayslipMoney } from "../../../lib/salaryPayslips";

/**
 * Printable / PDF-ready payslip. Wrap in a ref for exportNodeToPdf.
 */
export default function PayslipTemplate({ payslip, companyName = "Indus Fire Safety Pvt. Ltd." }) {
  if (!payslip) return null;

  const earnRows = [
    { label: "Basic", full: payslip.basic_full, earned: payslip.basic_earned },
    { label: "HRA", full: payslip.hra_full, earned: payslip.hra_earned },
    { label: "Special Allowance", full: payslip.special_full, earned: payslip.special_allowance },
  ];
  const customEarn = (payslip.custom_components || []).filter((c) => c.kind === "earning" && Number(c.amount) > 0);
  const customDed = (payslip.custom_components || []).filter((c) => c.kind === "deduction" && Number(c.amount) > 0);

  const dedRows = [
    { label: "Employee PF", amount: payslip.emp_pf },
    { label: "Employee ESIC", amount: payslip.emp_esic },
    { label: "Professional Tax", amount: payslip.pt_amount },
    { label: "Loan", amount: payslip.loan },
    { label: "Salary Advance", amount: payslip.sal_adv },
    { label: "Unpaid / Paid", amount: payslip.unpaid_paid },
    { label: "TDS", amount: payslip.tds },
    ...customDed.map((c) => ({ label: c.name || c.code || "Deduction", amount: c.amount })),
  ].filter((r) => Number(r.amount) > 0 || ["Employee PF", "Employee ESIC", "Professional Tax"].includes(r.label));

  return (
    <div
      className="bg-white text-slate-900 mx-auto"
      style={{
        width: "210mm",
        maxWidth: "100%",
        padding: "18mm 16mm",
        fontFamily: "Segoe UI, system-ui, sans-serif",
        fontSize: "11px",
        lineHeight: 1.35,
        boxSizing: "border-box",
      }}
    >
      <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.02em" }}>{companyName}</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Salary Payslip</div>
        <div style={{ color: "#64748b", marginTop: 2 }}>
          {payslip.month_label}
          {payslip.revision_no > 1 ? ` · Revision ${payslip.revision_no}` : ""}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 24px",
          marginBottom: 16,
          padding: "10px 12px",
          background: "#f8fafc",
          borderRadius: 6,
        }}
      >
        <Info label="Employee" value={payslip.employee_name} />
        <Info label="Employee code" value={payslip.employee_code} />
        <Info label="Designation" value={payslip.designation || "—"} />
        <Info label="Department" value={payslip.department || "—"} />
        <Info label="Date of joining" value={payslip.date_of_joining || "—"} />
        <Info label="Paid days" value={`${payslip.present_days ?? "—"} / ${payslip.month_days ?? "—"}`} />
        <Info label="Account" value={payslip.account_no || "—"} />
        <Info label="IFSC" value={payslip.ifsc || "—"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0f172a", color: "#fff" }}>
              <th style={th}>Earnings</th>
              <th style={{ ...th, textAlign: "right" }}>Full</th>
              <th style={{ ...th, textAlign: "right" }}>Earned</th>
            </tr>
          </thead>
          <tbody>
            {earnRows.map((r) => (
              <tr key={r.label}>
                <td style={td}>{r.label}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatPayslipMoney(r.full)}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatPayslipMoney(r.earned)}</td>
              </tr>
            ))}
            {customEarn.map((c) => (
              <tr key={c.code || c.name}>
                <td style={td}>{c.name || c.code}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatPayslipMoney(c.amount)}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatPayslipMoney(c.amount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, background: "#f1f5f9" }}>
              <td style={td}>Gross wages</td>
              <td style={{ ...td, textAlign: "right" }} colSpan={2}>
                {formatPayslipMoney(payslip.gross_wages)}
              </td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0f172a", color: "#fff" }}>
              <th style={th}>Deductions</th>
              <th style={{ ...th, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {dedRows.map((r) => (
              <tr key={r.label}>
                <td style={td}>{r.label}</td>
                <td style={{ ...td, textAlign: "right" }}>{formatPayslipMoney(r.amount)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, background: "#f1f5f9" }}>
              <td style={td}>Total deductions</td>
              <td style={{ ...td, textAlign: "right" }}>{formatPayslipMoney(payslip.total_ded)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 14px",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#047857", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Net salary
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#065f46" }}>
            ₹ {formatPayslipMoney(payslip.net_salary)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#64748b" }}>Bank transfer</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>₹ {formatPayslipMoney(payslip.bank_amount)}</div>
        </div>
      </div>

      <div style={{ fontSize: 9, color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
        This is a system-generated payslip. Generated{" "}
        {payslip.generated_at ? new Date(payslip.generated_at).toLocaleString("en-IN") : "—"}.
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "6px 8px",
  fontWeight: 600,
  fontSize: 10,
};

const td = {
  padding: "5px 8px",
  borderBottom: "1px solid #e2e8f0",
};
