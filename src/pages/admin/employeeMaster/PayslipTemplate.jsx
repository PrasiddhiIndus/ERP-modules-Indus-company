import React from "react";
import { INDUS_LOGO_SRC } from "../../../constants/branding";
import { rupeesInWords } from "../../../lib/amountInWords";

const COMPANY_NAME = "Indus Fire Safety Pvt Ltd";
const COMPANY_ADDRESS =
  "Block No 501, Indus House, Opposite GSFC Main Gate, Dashrath, Vadodara, Gujarat. Pin 391740.";
const HR_EMAIL = "hr@indusfiresafety.com";

/** Same palette as tax invoice / billing receipts */
const BLUE = "#1a3a6c";
const BLUE_DEEP = "#123d7c";
const BLUE_SOFT = "#f0f4fa";
const BLUE_ROW = "#f8f9fc";
const BLUE_FOOT = "#d9e4f5";
const INK = "#1f2937";
const MUTED = "#4b5563";
const LINE = "#bbbbbb";
const RULE = "#1a3a6c";

/**
 * Printable / PDF-ready salary slip — billing-invoice design language (navy tables, bordered panels).
 */
export default function PayslipTemplate({
  payslip,
  companyName = COMPANY_NAME,
  companyAddress = COMPANY_ADDRESS,
}) {
  if (!payslip) return null;

  const earnRows = [
    { label: "Earned basic", amount: payslip.basic_earned },
    { label: "HRA", amount: payslip.hra_earned },
    { label: "Other allowances", amount: payslip.special_allowance },
    ...(payslip.custom_components || [])
      .filter((c) => c.kind === "earning" && Number(c.amount) > 0)
      .map((c) => ({ label: c.name || c.code || "Earning", amount: c.amount })),
  ];

  const dedRows = [
    { label: "Employee PF", amount: payslip.emp_pf },
    { label: "ESIC", amount: payslip.emp_esic },
    { label: "Professional tax", amount: payslip.pt_amount },
    { label: "Loan", amount: payslip.loan },
    { label: "Salary advance", amount: payslip.sal_adv },
    { label: "Unpaid / Paid", amount: payslip.unpaid_paid },
    { label: "TDS", amount: payslip.tds },
    ...(payslip.custom_components || [])
      .filter((c) => c.kind === "deduction" && Number(c.amount) > 0)
      .map((c) => ({ label: c.name || c.code || "Deduction", amount: c.amount })),
  ].filter((r) => Number(r.amount) > 0 || ["Employee PF", "Professional tax"].includes(r.label));

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
  const leaveDays = Number(payslip.leave_days || 0);
  const lopDays = Number(payslip.lop_days || 0);

  const workLocation = payslip.work_location || "Head Office";
  const uan = displayOrFallback(payslip.uan_number || payslip.uan, "Not linked");
  const esicNo = displayOrFallback(
    payslip.esic_number,
    Number(payslip.emp_esic) > 0 ? "Not linked" : "Not applicable"
  );
  const pan = displayOrFallback(payslip.pan_card || payslip.pan, "Not linked");
  const bankAc = displayOrFallback(payslip.account_no, "Not linked");

  const net = Number(payslip.net_salary) || 0;
  const words = rupeesInWords(net);

  const metaLine = [
    payslip.employee_code ? `Employee code ${payslip.employee_code}` : null,
    payslip.designation || null,
    workLocation,
  ]
    .filter(Boolean)
    .join(" · ");

  const tableRows = Math.max(earnRows.length, dedRows.length, 3);
  const whiteHeader = {
    color: "#ffffff",
    WebkitTextFillColor: "#ffffff",
    opacity: 1,
  };

  return (
    <div
      style={{
        width: "210mm",
        maxWidth: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        background: "#fff",
        color: INK,
        fontFamily: '"Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif',
        fontSize: 11,
        lineHeight: 1.4,
        border: `1px solid ${LINE}`,
      }}
    >
      {/* Letterhead */}
      <div style={{ padding: "16px 22px 12px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <img
          src={INDUS_LOGO_SRC}
          alt=""
          style={{ width: 56, height: 56, objectFit: "contain", flexShrink: 0 }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: BLUE,
              letterSpacing: "0.3px",
              textTransform: "uppercase",
            }}
          >
            {companyName}
          </div>
          <div style={{ marginTop: 3, fontSize: 9.5, color: MUTED, maxWidth: 420, lineHeight: 1.45 }}>
            {companyAddress}
          </div>
          <div style={{ marginTop: 3, fontSize: 9, color: BLUE }}>
            For queries — {HR_EMAIL}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, paddingTop: 2 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: BLUE,
            }}
          >
            Salary Slip
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 16,
              fontWeight: 600,
              color: INK,
              letterSpacing: "-0.01em",
            }}
          >
            {payslip.month_label || "—"}
          </div>
        </div>
      </div>

      {/* Title band — invoice style */}
      <div style={{ padding: "0 22px" }}>
        <div
          style={{
            borderTop: `2px solid ${RULE}`,
            borderBottom: `2px solid ${RULE}`,
            padding: "7px 0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
              color: BLUE,
            }}
          >
            Salary Slip · {payslip.month_label || "—"}
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.35px",
              textTransform: "uppercase",
              color: BLUE,
            }}
          >
            Original for employee
          </div>
        </div>
      </div>

      {/* Employee identity strip */}
      <div
        style={{
          margin: "10px 22px 0",
          background: BLUE_SOFT,
          border: `1px solid ${LINE}`,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{payslip.employee_name || "—"}</div>
          <div style={{ marginTop: 2, fontSize: 10, color: MUTED }}>{metaLine || "—"}</div>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#fff",
            background: BLUE,
            borderRadius: 3,
            padding: "4px 10px",
          }}
        >
          Processed
        </span>
      </div>

      {/* Meta panels — 3 columns like invoice buyer blocks */}
      <div style={{ padding: "10px 22px 0" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            border: `1px solid ${LINE}`,
          }}
        >
          <MetaPanel title="Employee details" borderRight>
            <MetaRow label="Department" value={payslip.department || "—"} />
            <MetaRow label="Date of joining" value={formatLongDate(payslip.date_of_joining)} />
            <MetaRow label="Work location" value={workLocation} />
          </MetaPanel>
          <MetaPanel title="Statutory & bank" borderRight>
            <MetaRow label="UAN number" value={uan} mutedFallback />
            <MetaRow label="ESIC number" value={esicNo} mutedFallback />
            <MetaRow label="Bank account" value={bankAc} mutedFallback />
            <MetaRow label="PAN" value={pan} mutedFallback />
          </MetaPanel>
          <MetaPanel title="Days summary">
            <MetaRow label="Working days" value={monthDays || "—"} />
            <MetaRow label="Present days" value={presentDays || "—"} />
            <MetaRow label="Weekly off" value={weeklyOff} />
            <MetaRow label="Leave / LOP" value={`${leaveDays} / ${lopDays}`} />
          </MetaPanel>
        </div>
      </div>

      {/* Earnings / Deductions tables */}
      <div
        style={{
          padding: "12px 22px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <MoneyTable
          title="Earnings"
          rows={padRows(earnRows, tableRows)}
          footerLabel="Total gross earnings"
          footerValue={payslip.gross_wages}
          whiteHeader={whiteHeader}
        />
        <MoneyTable
          title="Deductions"
          rows={padRows(dedRows, tableRows)}
          footerLabel="Total deductions"
          footerValue={payslip.total_ded}
          whiteHeader={whiteHeader}
        />
      </div>

      {/* Amount in words + Net pay — invoice total style */}
      <div style={{ padding: "12px 22px 0" }}>
        <div
          style={{
            border: `1px solid ${LINE}`,
            background: BLUE_SOFT,
            padding: "8px 12px",
          }}
        >
          <div
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: BLUE,
            }}
          >
            Amount payable (in words)
          </div>
          <div style={{ marginTop: 3, fontSize: 11, color: INK, fontWeight: 500 }}>{words}</div>
        </div>
      </div>

      <div style={{ padding: "0 22px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            border: `1px solid ${LINE}`,
            borderTop: "none",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              flex: 1,
              padding: "12px 14px",
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: BLUE,
              }}
            >
              Net Pay
            </div>
            <div style={{ marginTop: 3, fontSize: 10, color: MUTED }}>
              Credit to salary account after deductions
            </div>
          </div>
          <div
            style={{
              minWidth: 168,
              padding: "12px 16px",
              background: BLUE_DEEP,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              fontSize: 22,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
            }}
          >
            ₹ {money2(payslip.net_salary)}
          </div>
        </div>
      </div>

      {/* Footer bar — invoice footer */}
      <div
        style={{
          marginTop: 14,
          background: BLUE,
          color: BLUE_FOOT,
          padding: "8px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 9,
          borderTop: `1px solid #16335d`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
              lineHeight: 1,
            }}
            aria-hidden
          >
            ✓
          </span>
          <span>
            System-generated slip · No signature required · Verified by Indus ERP
          </span>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {payslip.processed_on || payslip.generated_at ? (
            <>
              Processed on{" "}
              {payslip.processed_on
                ? new Date(`${payslip.processed_on}T12:00:00`).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : new Date(payslip.generated_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
            </>
          ) : (
            "—"
          )}
        </div>
      </div>
    </div>
  );
}

function MetaPanel({ title, children, borderRight = false }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRight: borderRight ? `1px solid ${LINE}` : "none",
        minWidth: 0,
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: BLUE,
          borderBottom: `1px solid ${LINE}`,
          paddingBottom: 6,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function MetaRow({ label, value, mutedFallback = false }) {
  const isFallback =
    mutedFallback &&
    (value === "Not linked" ||
      value === "Not applicable" ||
      value === "—" ||
      value == null ||
      value === "");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "42% 1fr",
        gap: 8,
        alignItems: "baseline",
      }}
    >
      <span style={{ fontSize: 9.5, color: MUTED, fontWeight: 500 }}>{label}</span>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 400,
          color: isFallback ? "#9ca3af" : INK,
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

function MoneyTable({ title, rows, footerLabel, footerValue, whiteHeader }) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        border: `1px solid ${LINE}`,
        fontSize: 10.5,
      }}
    >
      <thead>
        <tr style={{ background: BLUE, ...whiteHeader }}>
          <th
            style={{
              ...whiteHeader,
              textAlign: "left",
              padding: "7px 10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: 9,
              border: `1px solid ${LINE}`,
            }}
          >
            {title}
          </th>
          <th
            style={{
              ...whiteHeader,
              textAlign: "right",
              padding: "7px 10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: 9,
              border: `1px solid ${LINE}`,
              width: "34%",
            }}
          >
            Amount (₹)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.label || "blank"}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : BLUE_ROW }}>
            <td
              style={{
                border: `1px solid ${LINE}`,
                padding: "7px 10px",
                color: r.label ? MUTED : "transparent",
                fontWeight: 400,
              }}
            >
              {r.label || "—"}
            </td>
            <td
              style={{
                border: `1px solid ${LINE}`,
                padding: "7px 10px",
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                color: r.label ? INK : "transparent",
                fontWeight: 400,
              }}
            >
              {r.label ? money2(r.amount) : "0.00"}
            </td>
          </tr>
        ))}
        <tr style={{ background: BLUE_SOFT }}>
          <td
            style={{
              border: `1px solid ${LINE}`,
              padding: "8px 10px",
              fontWeight: 600,
              color: BLUE,
              fontSize: 10.5,
            }}
          >
            {footerLabel}
          </td>
          <td
            style={{
              border: `1px solid ${LINE}`,
              padding: "8px 10px",
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 600,
              color: INK,
              fontSize: 10.5,
            }}
          >
            {money2(footerValue)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function padRows(rows, minLen) {
  const out = [...rows];
  while (out.length < minLen) out.push({ label: "", amount: null });
  return out;
}

function money2(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayOrFallback(value, fallback) {
  if (value == null || String(value).trim() === "" || String(value).trim() === "—") return fallback;
  return String(value).trim();
}

function formatLongDate(isoOrDate) {
  if (!isoOrDate) return "—";
  const s = String(isoOrDate).trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  let d;
  if (ymd) d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  else d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
