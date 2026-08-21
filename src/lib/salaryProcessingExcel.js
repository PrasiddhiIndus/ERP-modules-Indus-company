/**
 * Salary Processing / Processed / Reports Excel downloads.
 * Frozen numbers (as saved), not live formulas.
 */

import ExcelJS from "exceljs";

function monthLabel(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(v) {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function fmtDay(ymd) {
  const raw = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "";
  return new Date(`${raw}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function lineCtcLabel(line) {
  return line?.hasCtc || line?.declared ? "Saved" : "Missing";
}

function lineStatusLabel(line) {
  if (line?.onHold || String(line?.processStatus || "").toLowerCase() === "held") return "Held";
  if (line?.salaryLocked || String(line?.processStatus || "").toLowerCase() === "locked") {
    const day = fmtDay(line.lockedOn);
    return day ? `Locked · ${day}` : "Locked";
  }
  if (line?.alreadyProcessed || String(line?.processStatus || "").toLowerCase() === "processed") {
    return "Processed";
  }
  if (line?.hasCtc === false || String(line?.processStatus || "").toLowerCase() === "ctc_required") {
    return "CTC required";
  }
  if (line?.hasCtc || line?.declared) return "Pending processing";
  return "CTC required";
}

const TAB_FILE = {
  all: "All-Employees",
  processed: "Processed",
  held: "Held",
};

const SHEET_HEADERS = [
  "Sr. No.",
  "Emp. Code",
  "Name",
  "Account Number",
  "IFSC",
  "Designation",
  "Department",
  "DOJ",
  "Confirmation",
  "Salary rate (Gross)",
  "P. Days",
  "PF Basic",
  "PF earned basic",
  "Basic",
  "Basic Earned",
  "HRA",
  "Special allowance",
  "Gross Wages",
  "PF 12%",
  "ESIC",
  "P Tax",
  "Loan",
  "Sal Adv",
  "Unpaid/Paid",
  "TDS",
  "Total Ded.",
  "Net salary",
  "Bank",
  "CTC",
  "Status",
  "Locked on",
];

function triggerXlsxDownload(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return filename;
}

function styleHeaderRow(ws, rowNumber, colCount) {
  const row = ws.getRow(rowNumber);
  row.height = 28;
  for (let i = 1; i <= colCount; i += 1) {
    const cell = row.getCell(i);
    cell.font = { bold: true, size: 9 };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2F6" },
    };
  }
}

function moneyCols(ws, row, cols) {
  for (const col of cols) {
    ws.getCell(row, col).numFmt = "#,##0";
  }
}

/**
 * @param {{ run: object, lines: object[] }} params
 * @param {{ companyTitle?: string, tabLabel?: string, tabId?: string }} [opts]
 */
export async function exportSalaryProcessingWorkbook({ run, lines }, opts = {}) {
  if (!run) throw new Error("No salary month to export.");
  const companyTitle = opts.companyTitle || "Indus Fire Safety Pvt. Ltd.";
  const year = run.pay_year;
  const month = run.pay_month;
  const monthDays = num(run.month_days) || 26;
  const revision = num(run.revision_no) || 1;
  const label = monthLabel(year, month);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP";
  const ws = wb.addWorksheet("Salary", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 3 }],
  });

  ws.mergeCells("A1", "AE1");
  ws.getCell("A1").value = companyTitle;
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.mergeCells("A2", "P2");
  const tabNote = opts.tabLabel ? ` — ${opts.tabLabel}` : "";
  ws.getCell("A2").value = `Salary for the month of ${label}${tabNote}`;
  ws.getCell("A2").font = { bold: true, size: 12 };

  ws.getCell("P3").value = "Days";
  ws.getCell("P3").font = { bold: true };
  ws.getCell("Q3").value = monthDays;
  ws.getCell("Q3").font = { bold: true };
  ws.getCell("Q3").numFmt = "0";

  SHEET_HEADERS.forEach((h, i) => {
    ws.getCell(4, i + 1).value = h;
  });
  styleHeaderRow(ws, 4, SHEET_HEADERS.length);

  const sorted = [...(lines || [])].sort((a, b) =>
    String(a.employee_code || "").localeCompare(String(b.employee_code || ""), undefined, {
      numeric: true,
    })
  );

  sorted.forEach((line, idx) => {
    const r = 5 + idx;
    const values = [
      idx + 1,
      line.employee_code || "",
      line.employee_name || "",
      line.account_no || "",
      line.ifsc || "",
      line.designation || "",
      line.department || "",
      fmtDate(line.date_of_joining),
      fmtDate(line.confirmation_date),
      num(line.salary_rate),
      num(line.present_days),
      num(line.pf_basic),
      num(line.pf_earned_basic),
      num(line.basic_full),
      num(line.basic_earned),
      num(line.hra_earned),
      num(line.special_allowance),
      num(line.gross_wages),
      num(line.emp_pf),
      num(line.emp_esic),
      num(line.pt_amount),
      num(line.loan),
      num(line.sal_adv),
      num(line.unpaid_paid),
      num(line.tds),
      num(line.total_ded),
      num(line.net_salary),
      num(line.bank_amount),
      lineCtcLabel(line),
      lineStatusLabel(line),
      fmtDay(line.lockedOn),
    ];
    values.forEach((v, i) => {
      ws.getCell(r, i + 1).value = v;
    });
    moneyCols(ws, r, [10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28]);
    if (line.salaryLocked || line.processStatus === "locked") {
      ws.getRow(r).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFECFDF5" },
      };
    }
  });

  if (sorted.length) {
    const t = 5 + sorted.length;
    ws.getCell(t, 3).value = "Total";
    ws.getCell(t, 3).font = { bold: true };
    const sumCols = [18, 19, 20, 21, 22, 23, 25, 26, 27, 28];
    for (const col of sumCols) {
      ws.getCell(t, col).value = { formula: `SUM(${ws.getCell(5, col).address}:${ws.getCell(t - 1, col).address})` };
      ws.getCell(t, col).font = { bold: true };
      ws.getCell(t, col).numFmt = "#,##0";
    }
  }

  const widths = [8, 12, 24, 16, 12, 16, 16, 11, 12, 12, 8, 10, 12, 10, 11, 10, 12, 12, 9, 9, 8, 8, 8, 10, 8, 10, 11, 10, 10, 18, 12];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const monNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monNames[Number(month) - 1] || String(month);
  const yy = String(year).slice(-2);
  const tabSlug = TAB_FILE[opts.tabId] || (opts.tabId ? String(opts.tabId) : "");
  const filename = tabSlug
    ? `Salary-${mon}-${yy}-${tabSlug}.xlsx`
    : `Salary-${mon}-${yy}-rev${revision}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  return triggerXlsxDownload(buffer, filename);
}

const REPORT_HEADERS = [
  "Processed on",
  "Sr. No.",
  "Emp. Code",
  "Name",
  "Designation",
  "Department",
  "P. Days",
  "Gross Wages",
  "Deductions",
  "Net salary",
  "Bank",
  "Account Number",
  "IFSC",
];

/**
 * Process report workbook — locked employees, grouped by process day.
 */
export async function exportSalaryReportWorkbook(report, opts = {}) {
  const groups = opts.groups || report?.groups || [];
  const year = report?.run?.pay_year || Number(String(report?.month_key || "").slice(0, 4));
  const month = report?.run?.pay_month || Number(String(report?.month_key || "").slice(5, 7));
  const label = report?.month_label || monthLabel(year, month);
  const companyTitle = opts.companyTitle || "Indus Fire Safety Pvt. Ltd.";

  const rows = [];
  for (const g of groups) {
    (g.employees || []).forEach((emp, idx) => {
      rows.push({
        process_day: g.process_day,
        process_day_label: g.process_day_label || fmtDay(g.process_day),
        sr: idx + 1,
        ...emp,
      });
    });
  }
  if (!rows.length) throw new Error("No processed employees to download.");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP";
  const ws = wb.addWorksheet("Process report", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 3 }],
  });

  ws.mergeCells("A1", "M1");
  ws.getCell("A1").value = companyTitle;
  ws.getCell("A1").font = { bold: true, size: 14 };

  ws.mergeCells("A2", "M2");
  ws.getCell("A2").value = `Salary process report — ${label}`;
  ws.getCell("A2").font = { bold: true, size: 12 };

  ws.getCell("A3").value = `${report?.total_employees || rows.length} locked · Gross ${num(
    report?.total_gross
  ).toLocaleString("en-IN")} · Net ${num(report?.total_net).toLocaleString("en-IN")}`;

  REPORT_HEADERS.forEach((h, i) => {
    ws.getCell(4, i + 1).value = h;
  });
  styleHeaderRow(ws, 4, REPORT_HEADERS.length);

  rows.forEach((emp, idx) => {
    const r = 5 + idx;
    const line = emp.line || emp;
    const values = [
      emp.process_day_label || fmtDay(emp.process_day),
      emp.sr || idx + 1,
      emp.employee_code || line.employee_code || "",
      emp.employee_name || line.employee_name || "",
      emp.designation || line.designation || "",
      emp.department || line.department || "",
      num(emp.present_days ?? line.present_days),
      num(emp.gross_wages ?? line.gross_wages),
      num(emp.total_ded ?? line.total_ded),
      num(emp.net_salary ?? line.net_salary),
      num(emp.bank_amount ?? line.bank_amount),
      line.account_no || "",
      line.ifsc || "",
    ];
    values.forEach((v, i) => {
      ws.getCell(r, i + 1).value = v;
    });
    moneyCols(ws, r, [8, 9, 10, 11]);
  });

  const t = 5 + rows.length;
  ws.getCell(t, 4).value = "Total";
  ws.getCell(t, 4).font = { bold: true };
  for (const col of [8, 9, 10, 11]) {
    ws.getCell(t, col).value = { formula: `SUM(${ws.getCell(5, col).address}:${ws.getCell(t - 1, col).address})` };
    ws.getCell(t, col).font = { bold: true };
    ws.getCell(t, col).numFmt = "#,##0";
  }

  [14, 8, 12, 24, 16, 16, 8, 12, 12, 12, 12, 16, 12].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const monNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = monNames[Number(month) - 1] || String(month);
  const yy = String(year).slice(-2);
  const filename = `Salary-Report-${mon}-${yy}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  return triggerXlsxDownload(buffer, filename);
}
