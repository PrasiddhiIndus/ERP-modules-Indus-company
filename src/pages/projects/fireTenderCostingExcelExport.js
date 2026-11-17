import ExcelJS from "exceljs";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  calculateCostingRowTotal,
  getCostingRowFillStatus,
} from "./fireTenderCostingConfig";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
const COMPLETE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
const INCOMPLETE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
const GREY_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
const SUB_DETAIL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, size: 10, color: { argb: "FF374151" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFFECACA" } },
      left: { style: "thin", color: { argb: "FFE5E7EB" } },
      bottom: { style: "thin", color: { argb: "FFFECACA" } },
      right: { style: "thin", color: { argb: "FFE5E7EB" } },
    };
  });
  row.height = 28;
}

function styleDataCell(cell, fill) {
  cell.fill = fill;
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFE5E7EB" } },
    left: { style: "thin", color: { argb: "FFE5E7EB" } },
    bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
    right: { style: "thin", color: { argb: "FFE5E7EB" } },
  };
}

function num(cell, value) {
  cell.value = value === "" || value == null ? null : Number(value);
  if (cell.value != null) cell.numFmt = "#,##0.00";
}

function subCategoryPath(row) {
  return [row.sub1, row.sub2, row.sub3, row.sub4, row.sub5]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" › ");
}

function indexToLetters(i) {
  let n = i + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Export IEV costing workbook.
 * Costing Sheet includes main rows + expandable subcategory detail lines.
 * NET TOTAL sheet only receives already-filtered (checked) cost components.
 */
export async function exportFireTenderCostingWorkbook({
  tenderNumber,
  client,
  template,
  fixedRows,
  extraRows,
  componentTree,
  displayAliases,
  grandTotal,
  chassisTotal,
  accessoriesTotal,
  netTotalRows,
  accessoriesRows,
  mocRows,
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "INDUS IEV";
  wb.created = new Date();

  const allRows = [...fixedRows, ...extraRows];
  const COL_COUNT = 11;

  const ws = wb.addWorksheet("Costing Sheet", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  ws.mergeCells(1, 1, 1, COL_COUNT);
  ws.getCell("A1").value = `${template || "Fire Tender"} Costing — ${tenderNumber || "Tender"}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFB91C1C" } };

  ws.mergeCells(2, 1, 2, COL_COUNT);
  ws.getCell("A2").value = `Client: ${client || "—"} · Template: ${template || "Fire Tender"} · Exported: ${formatDateDdMmYyyy(new Date())}`;

  ws.mergeCells(3, 1, 3, COL_COUNT);
  ws.getCell("A3").value =
    "Sub Category column shows the selected path. Detail lines under each component are the expandable subcategory levels (1–5).";
  ws.getCell("A3").font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  const headers = [
    "Sr. No.",
    "Main Cost Component",
    "Sub Category",
    "Manual Sub / Make / Brand",
    "Weight (KG)",
    "Labour Cost",
    "Unit Cost / Price of Metal",
    "Quantity",
    "Total Price",
    "Remark",
    "Status",
  ];
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    headerRow.getCell(i + 1).value = h;
  });
  styleHeaderRow(headerRow);

  ws.columns = [
    { width: 8 },
    { width: 30 },
    { width: 36 },
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 10 },
    { width: 14 },
    { width: 22 },
    { width: 12 },
  ];

  let excelRowNum = 5;

  allRows.forEach((row, index) => {
    const isFixed = index < fixedRows.length;
    const status = getCostingRowFillStatus(row, allRows, componentTree, isFixed);
    const fill =
      status === "complete" ? COMPLETE_FILL : status === "incomplete" ? INCOMPLETE_FILL : GREY_FILL;
    const displayName = displayAliases[row.component] || row.component;
    const path = subCategoryPath(row);
    const total = calculateCostingRowTotal(row, allRows);

    const r = ws.getRow(excelRowNum);
    r.getCell(1).value = index + 1;
    r.getCell(2).value = displayName;
    r.getCell(3).value = path || "";
    r.getCell(4).value = row.manualSub || "";
    num(r.getCell(5), row.weight);
    num(r.getCell(6), row.labour);
    num(r.getCell(7), row.unitCost);
    num(r.getCell(8), row.qty);
    num(r.getCell(9), total);
    r.getCell(10).value = row.remark || "";
    r.getCell(11).value =
      status === "complete" ? "Complete" : status === "incomplete" ? "Incomplete" : "";

    for (let c = 1; c <= COL_COUNT; c += 1) {
      styleDataCell(r.getCell(c), fill);
    }
    r.font = { bold: true, size: 10 };
    excelRowNum += 1;

    // Expandable subcategory detail rows (levels 1–5)
    const subLevels = [
      { label: "Sub Category 1", value: row.sub1 },
      { label: "Sub Category 2", value: row.sub2 },
      { label: "Sub Category 3", value: row.sub3 },
      { label: "Sub Category 4", value: row.sub4 },
      { label: "Sub Category 5", value: row.sub5 },
    ].filter((s) => String(s.value || "").trim());

    if (subLevels.length > 0 || String(row.manualSub || "").trim()) {
      subLevels.forEach((s) => {
        const dr = ws.getRow(excelRowNum);
        dr.getCell(2).value = `    ↳ ${s.label}`;
        dr.getCell(3).value = s.value;
        for (let c = 1; c <= COL_COUNT; c += 1) {
          styleDataCell(dr.getCell(c), SUB_DETAIL_FILL);
        }
        dr.getCell(2).font = { size: 9, color: { argb: "FF64748B" } };
        dr.getCell(3).font = { size: 9 };
        excelRowNum += 1;
      });
      if (String(row.manualSub || "").trim()) {
        const dr = ws.getRow(excelRowNum);
        dr.getCell(2).value = "    ↳ Manual Sub / Make / Brand";
        dr.getCell(3).value = row.manualSub;
        for (let c = 1; c <= COL_COUNT; c += 1) {
          styleDataCell(dr.getCell(c), SUB_DETAIL_FILL);
        }
        dr.getCell(2).font = { size: 9, color: { argb: "FF64748B" } };
        excelRowNum += 1;
      }
    }
  });

  const summaryStart = excelRowNum + 1;
  ws.getCell(`A${summaryStart}`).value = "Total Fabrication (excl. chassis)";
  ws.getCell(`A${summaryStart}`).font = { bold: true };
  ws.getCell(`I${summaryStart}`).value = grandTotal;
  ws.getCell(`I${summaryStart}`).numFmt = "#,##0.00";
  styleDataCell(ws.getCell(`I${summaryStart}`), TOTAL_FILL);

  ws.getCell(`A${summaryStart + 1}`).value = "Chassis total";
  ws.getCell(`A${summaryStart + 1}`).font = { bold: true };
  ws.getCell(`I${summaryStart + 1}`).value = chassisTotal;
  ws.getCell(`I${summaryStart + 1}`).numFmt = "#,##0.00";
  styleDataCell(ws.getCell(`I${summaryStart + 1}`), TOTAL_FILL);

  // NET TOTAL — only checked cost components (caller passes filtered list)
  const netWs = wb.addWorksheet("NET TOTAL");
  netWs.getCell("A1").value = "NET TOTAL (checked Cost Components only)";
  netWs.getCell("A1").font = { bold: true, size: 13 };
  netWs.mergeCells("A2:F2");
  netWs.getCell("A2").value = `Exported: ${formatDateDdMmYyyy(new Date())} · Unchecked components are omitted.`;
  netWs.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  const netHeaders = ["#", "Component", "Value / %", "Total (₹)", "Remarks", "Formula"];
  const nhr = netWs.getRow(3);
  netHeaders.forEach((h, i) => {
    nhr.getCell(i + 1).value = h;
  });
  styleHeaderRow(nhr);
  netWs.columns = [{ width: 6 }, { width: 48 }, { width: 14 }, { width: 16 }, { width: 24 }, { width: 52 }];

  (netTotalRows || []).forEach((row, i) => {
    const r = netWs.getRow(4 + i);
    r.getCell(1).value = indexToLetters(i);
    r.getCell(2).value = row.component;
    num(r.getCell(3), row.unitCost);
    num(r.getCell(4), row.total);
    r.getCell(5).value = row.remark || "";
    r.getCell(6).value = row.formulaText || "";
    for (let c = 1; c <= 6; c += 1) styleDataCell(r.getCell(c), GREY_FILL);
  });

  if (!(netTotalRows || []).length) {
    netWs.getCell("A4").value = "No cost components selected for export.";
  }

  const accWs = wb.addWorksheet("Accessories");
  accWs.getCell("A1").value = "Accessories Costing";
  accWs.getCell("A1").font = { bold: true, size: 13 };
  const ahr = accWs.getRow(2);
  ["S.No", "Title", "Description", "Qty", "Price", "Line Total"].forEach((h, i) => {
    ahr.getCell(i + 1).value = h;
  });
  styleHeaderRow(ahr);
  accWs.columns = [{ width: 8 }, { width: 28 }, { width: 40 }, { width: 10 }, { width: 12 }, { width: 14 }];
  (accessoriesRows || []).forEach((row, i) => {
    const r = accWs.getRow(3 + i);
    const excelRow = 3 + i;
    r.getCell(1).value = i + 1;
    r.getCell(2).value = row.title || "";
    r.getCell(3).value = row.description || "";
    num(r.getCell(4), row.qty);
    num(r.getCell(5), row.price);
    r.getCell(6).value = { formula: `D${excelRow}*E${excelRow}` };
    r.getCell(6).numFmt = "#,##0.00";
    for (let c = 1; c <= 6; c += 1) styleDataCell(r.getCell(c), GREY_FILL);
  });
  const accTotalRow = 3 + (accessoriesRows?.length || 0) + 1;
  accWs.getCell(`A${accTotalRow}`).value = "Final Accessories cost";
  accWs.getCell(`A${accTotalRow}`).font = { bold: true };
  accWs.getCell(`F${accTotalRow}`).value = accessoriesTotal;
  accWs.getCell(`F${accTotalRow}`).numFmt = "#,##0.00";
  styleDataCell(accWs.getCell(`F${accTotalRow}`), TOTAL_FILL);

  const mocWs = wb.addWorksheet("MOC");
  mocWs.getCell("A1").value = "MOC Prices";
  mocWs.getCell("A1").font = { bold: true, size: 13 };
  const mhr = mocWs.getRow(2);
  ["S.No", "MOC", "Unit", "Price"].forEach((h, i) => {
    mhr.getCell(i + 1).value = h;
  });
  styleHeaderRow(mhr);
  mocWs.columns = [{ width: 8 }, { width: 28 }, { width: 12 }, { width: 14 }];
  (mocRows || []).forEach((row, i) => {
    const r = mocWs.getRow(3 + i);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = row.moc;
    r.getCell(3).value = row.unit;
    num(r.getCell(4), row.price);
    for (let c = 1; c <= 4; c += 1) styleDataCell(r.getCell(c), GREY_FILL);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `IEV_Costing_${(tenderNumber || "export").replace(/[^\w.-]+/g, "_")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
