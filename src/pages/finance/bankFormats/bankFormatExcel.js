/**
 * Download bank payment format as Excel — matches Axis upload sheet layout.
 * Yellow columns: Payment Amount, Beneficiary Name, Account No, Receiver IFSC.
 */

import ExcelJS from "exceljs";
import {
  BANK_FORMAT_HEADERS,
  DEFAULT_DEBIT_ACCOUNT_NO,
  DEFAULT_RECEIVER_ACCOUNT_TYPE,
} from "./bankFormatModel";

/** 1-based columns highlighted yellow in the bank template (B, D, E, J). */
const YELLOW_COLS = new Set([2, 4, 5, 10]);

const thinBorder = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const yellowFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFF00" },
};

const headerPlainFill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFFFF" },
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

function asText(v) {
  if (v == null || v === "") return "";
  return String(v);
}

function asAmount(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build one data row in template column order (A–K).
 * Account / IFSC / debit kept as text so Excel does not drop digits.
 */
function rowValues(row) {
  const amount = asAmount(row.paymentAmount);
  return [
    asText(row.paymentMethod || "N"),
    amount,
    asText(row.activationDate || ""),
    asText(row.beneficiaryName || ""),
    asText(row.beneficiaryAccountNo || ""),
    asText(row.blank || ""),
    asText(row.emailBody || ""),
    asText(row.debitAccountNo || DEFAULT_DEBIT_ACCOUNT_NO),
    asText(row.crnNo || ""),
    asText(row.receiverIfsc || ""),
    asText(row.receiverAccountType || DEFAULT_RECEIVER_ACCOUNT_TYPE),
  ];
}

function styleCell(cell, colNumber, { header = false } = {}) {
  cell.border = thinBorder;
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: header,
  };
  if (header) {
    cell.font = { bold: true, size: 10, name: "Calibri" };
  } else {
    cell.font = { size: 10, name: "Calibri" };
  }
  if (YELLOW_COLS.has(colNumber)) {
    cell.fill = yellowFill;
  } else if (header) {
    cell.fill = headerPlainFill;
  }
}

/**
 * @param {Array<object>} rows bank format rows (real processed salary data)
 * @param {{ filename?: string, monthLabel?: string }} opts
 */
export async function downloadBankFormatWorkbook(rows = [], opts = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Indus ERP Finance";
  wb.created = new Date();
  const ws = wb.addWorksheet("Bank Format", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerRow = ws.addRow(BANK_FORMAT_HEADERS);
  headerRow.height = 32;
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    styleCell(cell, colNumber, { header: true });
  });
  // Ensure all 11 header cells exist even if empty trailing
  for (let c = 1; c <= BANK_FORMAT_HEADERS.length; c++) {
    const cell = headerRow.getCell(c);
    if (!cell.value) cell.value = BANK_FORMAT_HEADERS[c - 1];
    styleCell(cell, c, { header: true });
  }

  for (const row of rows) {
    const values = rowValues(row);
    const excelRow = ws.addRow(values);
    excelRow.height = 18;
    for (let c = 1; c <= values.length; c++) {
      const cell = excelRow.getCell(c);
      const val = values[c - 1];

      // Force text columns so long account numbers stay intact
      if (c === 5 || c === 8 || c === 10 || c === 1 || c === 11) {
        cell.value = val == null || val === "" ? "" : String(val);
        cell.numFmt = "@";
      } else if (c === 2) {
        if (val == null || val === "") {
          cell.value = "";
        } else {
          cell.value = Number(val);
          cell.numFmt = "#,##0";
        }
      } else {
        cell.value = val == null ? "" : val;
      }

      styleCell(cell, c, { header: false });
    }
  }

  ws.columns = [
    { width: 18 }, // A Payment Method
    { width: 22 }, // B Amount (yellow)
    { width: 14 }, // C Activation Date
    { width: 24 }, // D Name (yellow)
    { width: 20 }, // E Account (yellow)
    { width: 10 }, // F blank
    { width: 12 }, // G Email body
    { width: 18 }, // H Debit Account
    { width: 12 }, // I CRN
    { width: 16 }, // J IFSC (yellow)
    { width: 18 }, // K Account Type
  ];

  const label = opts.monthLabel ? `_${String(opts.monthLabel).replace(/\s+/g, "_")}` : "";
  const filename = opts.filename || `Bank_Payment_Format${label}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(buffer, filename);
}
