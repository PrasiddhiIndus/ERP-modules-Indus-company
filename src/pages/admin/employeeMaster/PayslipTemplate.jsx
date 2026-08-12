import React from "react";
import { INDUS_LOGO_SRC } from "../../../constants/branding";
import { formatPayslipMoney } from "../../../lib/salaryPayslips";

const COMPANY_NAME = "INDUS FIRE SAFETY PVT LTD";
const COMPANY_ADDRESS =
  "Block No 501, Indus House, Opposite GSFC Main Gate, Dashrath, Vadodara, Gujarat. Pin 391740.";

const INK = "#0c1222";
const MUTED = "#64748b";
const LINE = "#cbd5e1";
const LINE_SOFT = "#e2e8f0";
const WASH = "#f8fafc";

/**
 * Printable / PDF-ready salary slip — corporate document layout.
 */
export default function PayslipTemplate({
  payslip,
  companyName = COMPANY_NAME,
  companyAddress = COMPANY_ADDRESS,
}) {
  if (!payslip) return null;

  const earnRows = [
    { label: "Earned Basic", amount: payslip.basic_earned },
    { label: "HRA", amount: payslip.hra_earned },
    { label: "Other Allowances", amount: payslip.special_allowance },
    ...(payslip.custom_components || [])
      .filter((c) => c.kind === "earning" && Number(c.amount) > 0)
      .map((c) => ({ label: c.name || c.code || "Earning", amount: c.amount })),
  ];

  const dedRows = [
    { label: "EPF", amount: payslip.emp_pf },
    { label: "ESIC", amount: payslip.emp_esic },
    { label: "Professional Tax", amount: payslip.pt_amount },
    { label: "Loan", amount: payslip.loan },
    { label: "Salary Advance", amount: payslip.sal_adv },
    { label: "Unpaid / Paid", amount: payslip.unpaid_paid },
    { label: "TDS", amount: payslip.tds },
    ...(payslip.custom_components || [])
      .filter((c) => c.kind === "deduction" && Number(c.amount) > 0)
      .map((c) => ({ label: c.name || c.code || "Deduction", amount: c.amount })),
  ].filter((r) => Number(r.amount) > 0 || ["EPF", "Professional Tax"].includes(r.label));

  const monthDays = Number(payslip.month_days) || 0;
  const presentDays = Number(payslip.present_days) || 0;
  const weeklyOff =
    payslip.weekly_off != null
      ? Number(payslip.weekly_off)
      : monthDays > presentDays
        ? Math.max(
            0,
            monthDays - presentDays - Number(payslip.leave_days || 0) - Number(payslip.lop_days || 0)
          )
        : 0;

  const workLocation = payslip.work_location || "Head Office";
  const uan = payslip.uan_number || payslip.uan || "—";
  const esicNo = payslip.esic_number || (Number(payslip.emp_esic) > 0 ? "—" : "Not Applicable");
  const pan = payslip.pan_card || payslip.pan || "—";
  const grossMonthly = payslip.salary_rate || payslip.gross_wages;
  const tableRows = Math.max(earnRows.length, dedRows.length, 4);

  return (
    <div
      style={{
        width: "210mm",
        maxWidth: "100%",
        margin: "0 auto",
        padding: "12mm 11mm 10mm",
        boxSizing: "border-box",
        background: "#fff",
        color: INK,
        fontFamily: '"Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif',
        fontSize: 11,
        lineHeight: 1.45,
      }}
    >
      {/* Brand header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img
          src={INDUS_LOGO_SRC}
          alt=""
          style={{ width: 58, height: 58, objectFit: "contain", flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: INK,
            }}
          >
            {companyName}
          </div>
          <div style={{ marginTop: 4, fontSize: 10, color: MUTED }}>{companyAddress}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, borderTop: `2px solid ${INK}`, borderBottom: `1px solid ${LINE}`, padding: "8px 0" }}>
        <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: INK }}>
          Salary Slip for the month of {payslip.month_label || "—"}
        </div>
      </div>

      {/* Identity grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 0.85fr",
          marginTop: 12,
          border: `1px solid ${LINE}`,
        }}
      >
        <Section title="Employee information" borderRight>
          <Field label="Employee Code" value={payslip.employee_code} />
          <Field label="Employee Name" value={payslip.employee_name} />
          <Field label="Designation" value={payslip.designation || "—"} />
          <Field label="Department" value={payslip.department || "—"} />
          <Field label="Work Location" value={workLocation} />
          <Field label="Date of Joining" value={formatDate(payslip.date_of_joining)} />
        </Section>
        <Section title="Other details" borderRight>
          <Field label="UAN Number" value={uan} />
          <Field label="ESIC Number" value={esicNo} />
          <Field label="Bank A/c Number" value={payslip.account_no || "—"} />
          <Field label="IFSC Code" value={payslip.ifsc || "—"} />
          <Field label="PAN Card" value={pan} />
          <Field label="Gross Salary (monthly)" value={`${formatPayslipMoney(grossMonthly)} /-`} />
        </Section>
        <Section title="Days summary">
          <Field label="Working Days" value={monthDays || "—"} />
          <Field label="Present Days" value={presentDays || "—"} />
          <Field label="Weekly Off" value={weeklyOff} />
          <Field label="Leave Days" value={Number(payslip.leave_days || 0)} />
          <Field label="LOP Days" value={Number(payslip.lop_days || 0)} />
        </Section>
      </div>

      {/* Earnings / Deductions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          marginTop: 12,
          border: `1px solid ${LINE}`,
        }}
      >
        <MoneyColumn
          title="Earnings"
          rows={padRows(earnRows, tableRows)}
          footerLabel="Total Gross Earnings"
          footerValue={payslip.gross_wages}
          borderRight
        />
        <MoneyColumn
          title="Deductions"
          rows={padRows(dedRows, tableRows)}
          footerLabel="Total Deduction"
          footerValue={payslip.total_ded}
        />
      </div>

      {/* Net */}
      <div
        style={{
          marginTop: 0,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
          padding: "12px 14px",
          border: `1px solid ${LINE}`,
          borderTop: `2px solid ${INK}`,
          background: WASH,
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED }}>
            Net Payment
          </div>
          <div style={{ marginTop: 3, fontSize: 10, color: MUTED }}>
            Amount credited to employee bank account
            {payslip.account_no ? ` (${maskAccount(payslip.account_no)})` : ""}
          </div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
          ₹ {formatPayslipMoney(payslip.net_salary)}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 9,
          color: "#94a3b8",
        }}
      >
        <span>System-generated salary slip · No signature required</span>
        <span>
          Generated{" "}
          {payslip.generated_at
            ? new Date(payslip.generated_at).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—"}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children, borderRight = false }) {
  return (
    <div style={{ borderRight: borderRight ? `1px solid ${LINE}` : "none", minWidth: 0 }}>
      <div
        style={{
          padding: "7px 11px",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: MUTED,
          background: WASH,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        {title}
      </div>
      <div style={{ padding: "9px 11px", display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "42% 1fr", gap: 8, alignItems: "start" }}>
      <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: INK,
          textAlign: "right",
          wordBreak: "break-word",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value == null || value === "" ? "—" : value}
      </span>
    </div>
  );
}

function MoneyColumn({ title, rows, footerLabel, footerValue, borderRight = false }) {
  return (
    <div style={{ borderRight: borderRight ? `1px solid ${LINE}` : "none", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 88px",
          padding: "7px 11px",
          background: WASH,
          borderBottom: `1px solid ${LINE}`,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        <span>{title}</span>
        <span style={{ textAlign: "right" }}>Amount (₹)</span>
      </div>
      <div style={{ flex: 1 }}>
        {rows.map((r, i) => (
          <div
            key={`${r.label || "blank"}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 88px",
              padding: "7px 11px",
              borderBottom: `1px solid ${LINE_SOFT}`,
              minHeight: 30,
              alignItems: "center",
            }}
          >
            <span style={{ color: r.label ? "#1e293b" : "transparent" }}>{r.label || "—"}</span>
            <span
              style={{
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: r.label ? INK : "transparent",
                fontWeight: 500,
              }}
            >
              {r.label ? formatPayslipMoney(r.amount) : "0"}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 88px",
          padding: "8px 11px",
          background: WASH,
          borderTop: `1px solid ${LINE}`,
          fontWeight: 700,
          alignItems: "center",
        }}
      >
        <span>{footerLabel}</span>
        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {formatPayslipMoney(footerValue)}
        </span>
      </div>
    </div>
  );
}

function padRows(rows, minLen) {
  const out = [...rows];
  while (out.length < minLen) out.push({ label: "", amount: null });
  return out;
}

function maskAccount(account) {
  const s = String(account).replace(/\s/g, "");
  if (s.length <= 4) return s;
  return `XXXX${s.slice(-4)}`;
}

function formatDate(isoOrDate) {
  if (!isoOrDate) return "—";
  const s = String(isoOrDate).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN");
}
