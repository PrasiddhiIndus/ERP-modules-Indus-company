/**
 * Compliance Excel downloads — EPF challan format + ESIC return format.
 */

import ExcelJS from "exceljs";
import { applyEpfDerived } from "./complianceEpf";
import { sanitizeIpName } from "./complianceEsic";

function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * EPF challan workbook with live Excel formulas for derived columns.
 * Columns A–K match the challan format sheet.
 */
export async function downloadEpfChallanWorkbook(rows = [], { year, month, monthLabel } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP Compliance";
  const ws = wb.addWorksheet("challan format");

  ws.mergeCells("A1:K1");
  ws.getCell("A1").value = `EPF Challan Format — ${monthLabel || `${month}/${year}`}`;
  ws.getCell("A1").font = { bold: true, size: 12 };

  const headers = [
    "UAN",
    "NAME OF WORKMAN",
    "GROSS WAGES",
    "EPF WAGES",
    "EPS WAGES",
    "EDLI WAGES",
    "EPF CONT'N",
    "EPS CONT'N",
    "EPF CONT'N (Balance)",
    "NCP DAYS",
    "REFUND OF ADVANCE",
  ];
  const sub = [
    "",
    "",
    "",
    "",
    "",
    "",
    "12% of D",
    "8.33% of E",
    "(G - H)",
    "",
    "",
  ];

  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF2CC" },
    };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  ws.addRow(sub);

  const startExcelRow = 4; // data starts at row 4 (after title + header + sub)
  rows.forEach((raw, i) => {
    const row = applyEpfDerived(raw);
    const excelRow = startExcelRow + i;
    const r = ws.addRow([
      row.uan || "",
      row.name || "",
      Number(row.grossWages) || 0,
      Number(row.epfWages) || 0,
      Number(row.epsWages) || 0, // age 58+ kept as value; others get formula below
      null,
      null,
      null,
      null,
      Number(row.ncpDays) || 0,
      Number(row.refundOfAdvance) || 0,
    ]);

    // E EPS wages: formula unless age 58+ (manual 0)
    if (row.age58Plus || row.epsWagesManual) {
      r.getCell(5).value = Number(row.epsWages) || 0;
    } else {
      r.getCell(5).value = {
        formula: `IF(D${excelRow}>15000,15000,D${excelRow})`,
      };
    }
    // F EDLI
    r.getCell(6).value = {
      formula: `IF(E${excelRow}<>0,E${excelRow},IF(D${excelRow}>15000,15000,D${excelRow}))`,
    };
    // G EPF 12%
    r.getCell(7).value = { formula: `ROUND(D${excelRow}*12/100,0)` };
    // H EPS 8.33%
    r.getCell(8).value = { formula: `ROUND(E${excelRow}*8.33/100,0)` };
    // I balance
    r.getCell(9).value = { formula: `G${excelRow}-H${excelRow}` };

    r.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Notes
  const noteStart = startExcelRow + rows.length + 2;
  ws.getCell(`A${noteStart}`).value =
    "EPS WAGES: capped at 15,000. If workman has completed age of 58, EPS wages = 0 (not eligible for pension).";
  ws.getCell(`A${noteStart + 1}`).value =
    "EDLI WAGES: if EPS wages <> 0 then EPS wages else min(EPF wages, 15000). All workmen eligible.";
  ws.getCell(`A${noteStart + 2}`).value =
    "EPF CONT'N = ROUND(EPF wages × 12%, 0). EPS CONT'N = ROUND(EPS wages × 8.33%, 0). Balance = G − H.";

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 28;
  for (let c = 3; c <= 11; c += 1) ws.getColumn(c).width = 14;

  const buf = await wb.xlsx.writeBuffer();
  const file = `EPF_Challan_${year}_${String(month).padStart(2, "0")}.xlsx`;
  downloadBlob(buf, file);
}

/**
 * ESIC contribution return format (portal-style columns).
 */
export async function downloadEsicReturnWorkbook(rows = [], { year, month, monthLabel } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP Compliance";
  const ws = wb.addWorksheet("ESIC");

  const headers = [
    "IP Number (10 Digits)",
    "IP Name ( Only alphabets and space )",
    "No of Days for which wages paid/payable during the month",
    "Total Monthly Wages",
    "Reason Code for Zero workings days (numeric only; provide 0 for all other reasons)",
    "Last Working Day ( Format DD/MM/YYYY or DD-MM-YYYY)",
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 36;
  headerRow.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: col <= 2 || col >= 5 ? "FFC00000" : "FF000000" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDDEBF7" },
    };
    cell.alignment = { wrapText: true, vertical: "middle" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  rows.forEach((row) => {
    const r = ws.addRow([
      String(row.ipNumber || "").replace(/\D/g, ""),
      sanitizeIpName(row.ipName) || row.ipName || "",
      Number(row.daysPaid) || 0,
      Number(row.monthlyWages) || 0,
      row.reasonCode === "" || row.reasonCode == null ? "" : String(row.reasonCode),
      row.lastWorkingDay || "",
    ]);
    r.eachCell((cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 28;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 36;
  ws.getColumn(6).width = 28;

  const buf = await wb.xlsx.writeBuffer();
  const file = `ESIC_Return_${year}_${String(month).padStart(2, "0")}.xlsx`;
  downloadBlob(buf, file);
}
