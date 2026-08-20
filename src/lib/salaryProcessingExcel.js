/**
 * Export salary processing sheet matching Indus sample workbook formulas.
 * Columns A–AB; Days in Q3; formulas for M, O–T, Z, AA, AB.
 */

import ExcelJS from "exceljs";

function monthLabel(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString("en-IN", { month: "short", year: "2-digit" });
}

const HEADERS = [
  "Sr. No.",
  "Emp. Code",
  "Name",
  "",
  "Account Number",
  "IFSC",
  "Designation",
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
  "ESIC 0.75%",
  "P Tax",
  "Loan",
  "Sal Adv",
  "Unpaid/Paid",
  "TDS",
  "Total Ded.",
  "Net salary",
  "bank",
  "CTC",
  "Status",
];

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

function esicEligible(salaryRate) {
  const r = num(salaryRate);
  return r > 0 && r <= 21000;
}

function lineCtcLabel(line) {
  return line?.hasCtc || line?.declared ? "Saved" : "Missing";
}

function lineStatusLabel(line) {
  if (line?.onHold || String(line?.processStatus || "").toLowerCase() === "held") return "Held";
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

/**
 * @param {{ run: object, lines: object[] }} params
 * @param {{ companyTitle?: string, tabLabel?: string, tabId?: string }} [opts]
 */
export async function exportSalaryProcessingWorkbook({ run, lines }, opts = {}) {
  if (!run) throw new Error("No salary run to export.");
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

  // Row 1 — company
  ws.mergeCells("A1", "AD1");
  ws.getCell("A1").value = companyTitle;
  ws.getCell("A1").font = { bold: true, size: 14 };

  // Row 2 — month label
  ws.mergeCells("A2", "P2");
  const tabNote = opts.tabLabel ? ` — ${opts.tabLabel}` : "";
  ws.getCell("A2").value = `Salary for the month of ${label}${tabNote}`;
  ws.getCell("A2").font = { bold: true, size: 12 };

  // Row 3 — Days (Q3 in sample)
  ws.getCell("P3").value = "Days";
  ws.getCell("P3").font = { bold: true };
  ws.getCell("Q3").value = monthDays;
  ws.getCell("Q3").font = { bold: true };
  ws.getCell("Q3").numFmt = "0";

  // Row 4 — headers
  HEADERS.forEach((h, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  ws.getRow(4).height = 32;

  const sorted = [...(lines || [])].sort((a, b) =>
    String(a.employee_code || "").localeCompare(String(b.employee_code || ""), undefined, {
      numeric: true,
    })
  );

  sorted.forEach((line, idx) => {
    const r = 5 + idx; // data starts row 5
    const eligible = esicEligible(line.salary_rate);

    ws.getCell(r, 1).value = idx + 1;
    ws.getCell(r, 2).value = line.employee_code || "";
    ws.getCell(r, 3).value = line.employee_name || "";
    // D blank (sample)
    ws.getCell(r, 5).value = line.account_no || "";
    ws.getCell(r, 6).value = line.ifsc || "";
    ws.getCell(r, 7).value = line.designation || "";
    ws.getCell(r, 8).value = fmtDate(line.date_of_joining);
    ws.getCell(r, 9).value = fmtDate(line.confirmation_date);
    ws.getCell(r, 10).value = num(line.salary_rate);
    ws.getCell(r, 11).value = num(line.present_days); // K
    ws.getCell(r, 12).value = num(line.pf_basic); // L
    // M = L/$Q$3*K
    ws.getCell(r, 13).value = { formula: `L${r}/$Q$3*K${r}` };
    ws.getCell(r, 14).value = num(line.basic_full); // N
    // O = N/$Q$3*K
    ws.getCell(r, 15).value = { formula: `N${r}/$Q$3*K${r}` };
    // P = hra_full/$Q$3*K — store full HRA in helper? Sample shows earned in P.
    // Use value for full rate stored off-grid, or embed: we put full HRA as const in formula via cell.
    // Put full HRA/Special as values then formula — sample P/Q are earned.
    // We'll write full amounts into hidden columns? Simpler: formula from stored full via values
    // written as O uses N (full basic). For HRA/Special sample uses full rates similarly.
    // Store full HRA in a note... Actually sample has only earned in P/Q columns.
    // Write intermediate: use formula with absolute full amounts:
    const hraFull = num(line.hra_full);
    const specialFull = num(line.special_full);
    ws.getCell(r, 16).value = { formula: `${hraFull}/$Q$3*K${r}` }; // P
    ws.getCell(r, 17).value = { formula: `${specialFull}/$Q$3*K${r}` }; // Q
    ws.getCell(r, 18).value = { formula: `SUM(O${r}:Q${r})` }; // R
    ws.getCell(r, 19).value = { formula: `M${r}*0.12` }; // S
    ws.getCell(r, 20).value = eligible
      ? { formula: `R${r}*0.75/100` }
      : 0; // T
    ws.getCell(r, 21).value = num(line.pt_amount); // U
    ws.getCell(r, 22).value = num(line.loan); // V
    ws.getCell(r, 23).value = num(line.sal_adv); // W
    ws.getCell(r, 24).value = num(line.unpaid_paid); // X
    ws.getCell(r, 25).value = num(line.tds); // Y
    ws.getCell(r, 26).value = { formula: `SUM(S${r}:Y${r})` }; // Z
    ws.getCell(r, 27).value = { formula: `R${r}-Z${r}` }; // AA
    ws.getCell(r, 28).value = { formula: `ROUND(AA${r},0)` }; // AB
    ws.getCell(r, 29).value = lineCtcLabel(line); // AC CTC
    ws.getCell(r, 30).value = lineStatusLabel(line); // AD Status

    for (const col of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]) {
      ws.getCell(r, col).numFmt = "#,##0";
    }
  });

  const widths = [6, 12, 22, 3, 16, 12, 14, 11, 12, 12, 8, 10, 12, 10, 11, 10, 12, 11, 9, 10, 8, 8, 8, 10, 8, 10, 11, 10, 10, 18];
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
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
