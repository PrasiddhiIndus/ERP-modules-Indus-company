/**
 * Download bank payment format as Excel (headers match Axis upload sheet).
 */

import ExcelJS from "exceljs";
import {
  BANK_FORMAT_HEADERS,
  bankRowToExportArray,
} from "./bankFormatModel";

const thinBorder = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

const headerFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
};

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
 * @param {Array<object>} rows bank format rows
 * @param {{ filename?: string, monthLabel?: string }} opts
 */
export async function downloadBankFormatWorkbook(rows = [], opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP Finance";
  const ws = wb.addWorksheet("Bank Format");

  const headerRow = ws.addRow(BANK_FORMAT_HEADERS);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thinBorder;
    cell.fill = headerFill;
  });

  for (const row of rows) {
    const values = bankRowToExportArray(row);
    const excelRow = ws.addRow(values);
    excelRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (colNumber === 2) {
        cell.numFmt = "#,##0";
      }
    });
  }

  ws.columns = [
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 24 },
    { width: 22 },
    { width: 10 },
    { width: 14 },
    { width: 20 },
    { width: 12 },
    { width: 18 },
    { width: 18 },
  ];

  const label = opts.monthLabel ? `_${opts.monthLabel.replace(/\s+/g, "_")}` : "";
  const filename = opts.filename || `Bank_Payment_Format${label}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(buffer, filename);
}
