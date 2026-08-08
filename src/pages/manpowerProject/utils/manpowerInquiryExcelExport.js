import ExcelJS from "exceljs";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import {
  getExcelInquiryFields,
  getEnquiryResultFromRow,
  getResultRemarkFromRow,
  getTrackingStatusFromRow,
  INQUIRY_LIST_DISPLAY_COLUMNS,
  formatInquiryCellValue,
} from "./manpowerEnquiryExcelFields";

const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

function getListRowFields(row) {
  const excel = getExcelInquiryFields(row);
  return {
    ...excel,
    enquiryNumber: row?.enquiry_number || "",
    srNo: excel.srNo ?? row?.sr_no ?? "",
    trackingStatus: getTrackingStatusFromRow(row),
    enquiryResult: getEnquiryResultFromRow(row),
    resultRemark: getResultRemarkFromRow(row),
  };
}

function applyBorder(cell) {
  cell.border = THIN_BORDER;
}

function styleHeaderCell(cell) {
  cell.fill = HEADER_FILL;
  cell.font = { bold: true, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyBorder(cell);
}

function styleDataCell(cell, { horizontal = "left" } = {}) {
  cell.alignment = { vertical: "top", horizontal, wrapText: true };
  cell.font = { size: 10 };
  applyBorder(cell);
}

/**
 * Export enquiries using the same columns as Enquiry Master List (no extra sheets/columns).
 */
export async function exportManpowerInquiriesFormattedExcel(enquiries, formatDate) {
  const list = [...(enquiries || [])];
  const columns = INQUIRY_LIST_DISPLAY_COLUMNS;
  const wb = new ExcelJS.Workbook();
  wb.creator = "INDUS Enquiry Master";
  wb.created = new Date();

  const ws = wb.addWorksheet("Enquiry Master List", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  columns.forEach((col, index) => {
    ws.getColumn(index + 1).width = Math.max(12, Math.round((col.width || 100) / 8));
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.label;
    styleHeaderCell(cell);
  });

  list.forEach((row, index) => {
    const fields = getListRowFields(row);
    const excelRow = ws.getRow(index + 2);
    columns.forEach((col, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      let raw = fields[col.id];
      if (col.id === "resultRemark" && fields.enquiryResult !== "Awarded to Other Party" && fields.enquiryResult !== "Not Alloted") {
        raw = "";
      }
      const valueType =
        col.valueType === "chip" || col.valueType === "trackingStatus" ? "text" : col.valueType;
      const display = formatInquiryCellValue(raw, valueType, formatDate || formatDateDdMmYyyy);
      cell.value = display === "—" ? "" : display;
      const horizontal =
        col.align === "center" ? "center" : col.align === "right" ? "right" : "left";
      styleDataCell(cell, { horizontal });
    });
  });

  const stamp = formatDateDdMmYyyy(new Date()).replace(/\//g, "-");
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `enquiry-master-list-${stamp}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
