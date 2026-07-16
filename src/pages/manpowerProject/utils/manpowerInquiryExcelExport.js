import ExcelJS from "exceljs";
import { formatDateDdMmYyyy } from "../../../utils/dateDisplay";
import { getExcelInquiryFields, parseAuthorizationMeta } from "./manpowerEnquiryExcelFields";

const COL_COUNT = 14;

/** Legacy enquiry tracker column headers (matches historical Excel workbook). */
const LEGACY_HEADERS = [
  "Sr. No.",
  "Received Date",
  "Verticle",
  "Mode of Submission",
  "Total No. of",
  "Client Name",
  "Location",
  "Description of Work",
  "Approx Value (W/O Taxes)",
  "Enquiry Assigned to",
  "Due Date for Submission(If any)",
  "Offer Submitted",
  "Remarks",
  "Further action/Follow up",
];

const CATEGORY = {
  AWARDED_IFSPL: "awarded_ifspl",
  AWARDED_OTHER: "awarded_other",
  REGRET: "regret",
  BUDGETARY: "budgetary",
  IN_PROCESS: "in_process",
};

const ROW_FILLS = {
  [CATEGORY.AWARDED_IFSPL]: { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } },
  [CATEGORY.AWARDED_OTHER]: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8CBAD" } },
  [CATEGORY.REGRET]: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4DFEC" } },
  [CATEGORY.BUDGETARY]: { type: "pattern", pattern: "solid", fgColor: { argb: "FFDAEEF3" } },
  [CATEGORY.IN_PROCESS]: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } },
};

const LEGEND_ITEMS = [
  { label: "Contract awarded to IFSPL", category: CATEGORY.AWARDED_IFSPL, fill: ROW_FILLS[CATEGORY.AWARDED_IFSPL] },
  { label: "Contract awarded to Other Party", category: CATEGORY.AWARDED_OTHER, fill: ROW_FILLS[CATEGORY.AWARDED_OTHER] },
  { label: "Regret", category: CATEGORY.REGRET, fill: ROW_FILLS[CATEGORY.REGRET] },
  { label: "Budgetary Offers", category: CATEGORY.BUDGETARY, fill: ROW_FILLS[CATEGORY.BUDGETARY] },
];

const SUMMARY_ROWS = [
  { label: "Awarded to IFSPL", category: CATEGORY.AWARDED_IFSPL },
  { label: "Awarded to Other Party", category: CATEGORY.AWARDED_OTHER },
  { label: "Budgetary Offer", category: CATEGORY.BUDGETARY },
  { label: "Regret", category: CATEGORY.REGRET },
  { label: "In process", category: CATEGORY.IN_PROCESS },
];

const THIN_BORDER = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
const SUMMARY_HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };

const COLUMN_WIDTHS = [6, 14, 12, 16, 10, 22, 18, 36, 16, 16, 18, 14, 18, 22];

function colLetter(index) {
  return String.fromCharCode(64 + index);
}

function formatTitleDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return formatDateDdMmYyyy(new Date()).replace(/\//g, ".");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function parseApproxValue(value) {
  if (value === "" || value == null) return 0;
  const cleaned = String(value).replace(/[,₹\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Classify enquiry row for legend colour and summary (remarks-first, status fallback). */
export function classifyInquiryRemarkCategory(row) {
  const fields = getExcelInquiryFields(row);
  const { meta } = parseAuthorizationMeta(row?.authorization_to);
  const rejectionRemark = String(meta.rejectionRemark || "").trim();
  const remarks = String(fields.remarks || rejectionRemark || "").trim();
  const text = remarks.toLowerCase();
  const status = String(row?.status || "").toLowerCase();

  if (text.includes("regret") || status === "rejected") return CATEGORY.REGRET;
  if (text.includes("budgetary")) return CATEGORY.BUDGETARY;
  if (
    /awarded\s*(to\s*)?ifspl|ifspl.*awarded|contract\s*awarded\s*to\s*ifspl|awarded\s*to\s*us/.test(text)
  ) {
    return CATEGORY.AWARDED_IFSPL;
  }
  if (/awarded\s*(to\s*)?other|other\s*party|awarded\s*to\s*competitor|lost\s*to/.test(text)) {
    return CATEGORY.AWARDED_OTHER;
  }
  return CATEGORY.IN_PROCESS;
}

function formatExportDate(value, formatDate) {
  if (!value) return "";
  const formatted = formatDate(value);
  return formatted && formatted !== "—" ? formatted.replace(/\//g, "-") : "";
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

function styleDataCell(cell, { horizontal = "left", wrap = true, fill = null } = {}) {
  if (fill) cell.fill = fill;
  cell.alignment = { vertical: "top", horizontal, wrapText: wrap };
  cell.font = { size: 10 };
  applyBorder(cell);
}

function buildSummaryStats(enquiries) {
  const stats = {
    [CATEGORY.AWARDED_IFSPL]: { count: 0, value: 0 },
    [CATEGORY.AWARDED_OTHER]: { count: 0, value: 0 },
    [CATEGORY.BUDGETARY]: { count: 0, value: 0 },
    [CATEGORY.REGRET]: { count: 0, value: 0 },
    [CATEGORY.IN_PROCESS]: { count: 0, value: 0 },
  };

  (enquiries || []).forEach((row) => {
    const category = classifyInquiryRemarkCategory(row);
    const fields = getExcelInquiryFields(row);
    stats[category].count += 1;
    stats[category].value += parseApproxValue(fields.approxValue);
  });

  const totalCount = enquiries?.length || 0;
  const totalValue = Object.values(stats).reduce((sum, item) => sum + item.value, 0);
  const strikeRate = totalCount ? (stats[CATEGORY.AWARDED_IFSPL].count / totalCount) * 100 : 0;

  return { stats, totalCount, totalValue, strikeRate };
}

function triggerDownload(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Export enquiries in the legacy "Details of Enquiries/Tender in Hand" workbook layout.
 */
export async function exportManpowerInquiriesFormattedExcel(enquiries, formatDate, { updatedBy } = {}) {
  const list = [...(enquiries || [])];
  const wb = new ExcelJS.Workbook();
  wb.creator = "INDUS Enquiry Master";
  wb.created = new Date();

  const ws = wb.addWorksheet("Enquiries", {
    views: [{ state: "frozen", ySplit: 6, activeCell: "A7" }],
  });

  COLUMN_WIDTHS.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });

  const lastCol = colLetter(COL_COUNT);
  const exporterName = String(updatedBy || "User").trim() || "User";
  const titleDate = formatTitleDate(new Date());

  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = `Details of Enquiries/ Tender in Hand- Updated by ${exporterName} on ${titleDate}`;
  titleCell.font = { bold: true, size: 12, underline: true };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 24;

  const legendRow = ws.getRow(3);
  legendRow.height = 20;
  const span = Math.floor(COL_COUNT / LEGEND_ITEMS.length);
  LEGEND_ITEMS.forEach((item, index) => {
    const startCol = index * span + 1;
    const endCol = index === LEGEND_ITEMS.length - 1 ? COL_COUNT : (index + 1) * span;
    const startLetter = colLetter(startCol);
    const endLetter = colLetter(endCol);
    if (startLetter !== endLetter) {
      ws.mergeCells(`${startLetter}3:${endLetter}3`);
    }
    const cell = ws.getCell(`${startLetter}3`);
    cell.value = item.label;
    cell.fill = item.fill;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    applyBorder(cell);
  });

  const headerRowIndex = 6;
  const headerRow = ws.getRow(headerRowIndex);
  headerRow.height = 28;
  LEGACY_HEADERS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    styleHeaderCell(cell);
  });

  const dataStartRow = headerRowIndex + 1;
  list.forEach((row, index) => {
    const fields = getExcelInquiryFields(row);
    const category = classifyInquiryRemarkCategory(row);
    const fill = ROW_FILLS[category];
    const excelRow = ws.getRow(dataStartRow + index);
    const srNo = fields.srNo != null && fields.srNo !== "" ? fields.srNo : index + 1;

    const values = [
      srNo,
      formatExportDate(fields.receivedDate, formatDate),
      fields.vertical || "",
      fields.modeOfSubmission || "",
      fields.totalManpower === "" || fields.totalManpower == null ? "" : Number(fields.totalManpower),
      fields.clientName || "",
      fields.location || "",
      fields.descriptionOfWork || "",
      parseApproxValue(fields.approxValue) || "",
      fields.enquiryAssignedTo || "",
      formatExportDate(fields.dueDate, formatDate),
      formatExportDate(fields.offerSubmittedOn, formatDate),
      fields.remarks || "",
      fields.furtherAction || "",
    ];

    const alignments = ["center", "center", "left", "left", "center", "left", "left", "left", "right", "left", "center", "center", "left", "left"];

    values.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      cell.value = value;
      if (colIndex === 8 && value !== "") {
        cell.numFmt = "#,##,##0.00";
      }
      styleDataCell(cell, { horizontal: alignments[colIndex], fill });
    });
  });

  const summaryStartRow = dataStartRow + list.length + 2;
  const { stats, totalCount, totalValue, strikeRate } = buildSummaryStats(list);

  ["Particulars", "Nos", "₹"].forEach((label, index) => {
    const cell = ws.getRow(summaryStartRow).getCell(index + 1);
    cell.value = label;
    cell.fill = SUMMARY_HEADER_FILL;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    applyBorder(cell);
  });

  let summaryRowIndex = summaryStartRow + 1;
  SUMMARY_ROWS.forEach((item) => {
    const row = ws.getRow(summaryRowIndex);
    row.getCell(1).value = item.label;
    row.getCell(2).value = stats[item.category].count;
    row.getCell(2).alignment = { horizontal: "center" };
    const valueCell = row.getCell(3);
    valueCell.value = stats[item.category].value;
    valueCell.numFmt = "#,##,##0.00";
    valueCell.alignment = { horizontal: "right" };
    for (let c = 1; c <= 3; c += 1) {
      const cell = row.getCell(c);
      cell.font = { size: 10 };
      applyBorder(cell);
    }
    summaryRowIndex += 1;
  });

  const totalRow = ws.getRow(summaryRowIndex);
  totalRow.getCell(1).value = "Total Enquiries received";
  totalRow.getCell(1).font = { bold: true, size: 10 };
  totalRow.getCell(2).value = totalCount;
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(2).alignment = { horizontal: "center" };
  totalRow.getCell(3).value = totalValue;
  totalRow.getCell(3).numFmt = "#,##,##0.00";
  totalRow.getCell(3).font = { bold: true };
  totalRow.getCell(3).alignment = { horizontal: "right" };
  for (let c = 1; c <= 3; c += 1) applyBorder(totalRow.getCell(c));

  summaryRowIndex += 1;
  const strikeRow = ws.getRow(summaryRowIndex);
  strikeRow.getCell(1).value = "Strike Rate";
  strikeRow.getCell(1).font = { bold: true, size: 10 };
  ws.mergeCells(`B${summaryRowIndex}:C${summaryRowIndex}`);
  strikeRow.getCell(2).value = `= No. of Enquiries awarded to us / Total no. of enquiries received (${(strikeRate).toFixed(2)}%)`;
  for (let c = 1; c <= 3; c += 1) applyBorder(strikeRow.getCell(c));

  const stamp = formatDateDdMmYyyy(new Date()).replace(/\//g, "-");
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, `enquiry-master-list-${stamp}.xlsx`);
}
