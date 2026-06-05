import ExcelJS from "exceljs";
import { formatDateDdMmYyyy } from "../../utils/dateDisplay";
import {
  calculateCostingRowTotal,
  computeMetaconeQty,
  getCostingRowFillStatus,
  isMetaconeMounting,
  isStructureOrPanelling,
  isTankComponent,
} from "./fireTenderCostingConfig";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
const COMPLETE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } };
const INCOMPLETE_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF2F2" } };
const GREY_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };

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
  row.height = 22;
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
  wb.creator = "INDUS Fire Tender";
  wb.created = new Date();

  const allRows = [...fixedRows, ...extraRows];
  const ws = wb.addWorksheet("Costing Sheet", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  ws.mergeCells("A1:O1");
  ws.getCell("A1").value = `${template || "Fire Tender"} Costing — ${tenderNumber || "Tender"}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFB91C1C" } };

  ws.mergeCells("A2:O2");
  ws.getCell("A2").value = `Client: ${client || "—"} · Template: ${template || "Fire Tender"} · Exported: ${formatDateDdMmYyyy(new Date())}`;

  const headers = [
    "Sr. No.",
    "Main Cost Component",
    "Sub 1",
    "Sub 2",
    "Sub 3",
    "Sub 4",
    "Sub 5",
    "Manual Sub Category",
    "Weight",
    "Labour Cost",
    "Unit Cost",
    "Qty",
    "Total",
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
    { width: 28 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 20 },
    { width: 12 },
  ];

  allRows.forEach((row, index) => {
    const r = ws.getRow(5 + index);
    const isFixed = index < fixedRows.length;
    const status = getCostingRowFillStatus(row, allRows, componentTree, isFixed);
    const fill = status === "complete" ? COMPLETE_FILL : status === "incomplete" ? INCOMPLETE_FILL : GREY_FILL;
    const displayName = displayAliases[row.component] || row.component;

    r.getCell(1).value = index + 1;
    r.getCell(2).value = displayName;
    r.getCell(3).value = row.sub1 || "";
    r.getCell(4).value = row.sub2 || "";
    r.getCell(5).value = row.sub3 || "";
    r.getCell(6).value = row.sub4 || "";
    r.getCell(7).value = row.sub5 || "";
    r.getCell(8).value = row.manualSub || "";
    num(r.getCell(9), row.weight);
    num(r.getCell(10), row.labour);
    num(r.getCell(11), row.unitCost);

    const excelRow = 5 + index;
    if (isMetaconeMounting(row.component)) {
      r.getCell(12).value = { formula: `ROUNDUP((SUMIF($B$5:$B$${4 + allRows.length},"*Water*",$I$5:$I$${4 + allRows.length})+SUMIF($B$5:$B$${4 + allRows.length},"*Foam*",$I$5:$I$${4 + allRows.length}))/550,0)` };
    } else {
      num(r.getCell(12), row.qty);
    }

    if (isMetaconeMounting(row.component)) {
      r.getCell(13).value = { formula: `K${excelRow}*L${excelRow}+J${excelRow}` };
    } else if (isTankComponent(row.component)) {
      r.getCell(13).value = { formula: `I${excelRow}*(K${excelRow}+J${excelRow})*L${excelRow}` };
    } else if (isStructureOrPanelling(row.component)) {
      r.getCell(13).value = { formula: `I${excelRow}*K${excelRow}` };
    } else {
      r.getCell(13).value = { formula: `(J${excelRow}+K${excelRow})*L${excelRow}` };
    }
    r.getCell(13).numFmt = "#,##0.00";

    r.getCell(14).value = row.remark || "";
    r.getCell(15).value = status === "complete" ? "Complete" : status === "incomplete" ? "Incomplete" : "";

    for (let c = 1; c <= 15; c += 1) {
      styleDataCell(r.getCell(c), fill);
    }
  });

  const summaryStart = 5 + allRows.length + 2;
  ws.getCell(`A${summaryStart}`).value = "Total Fabrication (excl. chassis)";
  ws.getCell(`A${summaryStart}`).font = { bold: true };
  ws.getCell(`M${summaryStart}`).value = grandTotal;
  ws.getCell(`M${summaryStart}`).numFmt = "#,##0.00";
  styleDataCell(ws.getCell(`M${summaryStart}`), TOTAL_FILL);

  const netWs = wb.addWorksheet("NET TOTAL");
  netWs.getCell("A1").value = "NET TOTAL";
  netWs.getCell("A1").font = { bold: true, size: 13 };
  const netHeaders = ["#", "Component", "Value / %", "Total (₹)", "Remarks", "Formula"];
  const nhr = netWs.getRow(3);
  netHeaders.forEach((h, i) => {
    nhr.getCell(i + 1).value = h;
  });
  styleHeaderRow(nhr);
  netWs.columns = [{ width: 6 }, { width: 42 }, { width: 14 }, { width: 16 }, { width: 24 }, { width: 48 }];

  (netTotalRows || []).forEach((row, i) => {
    const r = netWs.getRow(4 + i);
    const letter = String.fromCharCode(65 + (i < 26 ? i : 25));
    r.getCell(1).value = i < 26 ? letter : `A${letter}`;
    r.getCell(2).value = row.component;
    num(r.getCell(3), row.unitCost);
    num(r.getCell(4), row.total);
    r.getCell(5).value = row.remark || "";
    r.getCell(6).value = row.formulaText || "";
    for (let c = 1; c <= 6; c += 1) styleDataCell(r.getCell(c), GREY_FILL);
  });

  const accWs = wb.addWorksheet("Accessories");
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
  accWs.getCell(`A${3 + (accessoriesRows?.length || 0) + 1}`).value = "Accessories total";
  accWs.getCell(`F${3 + (accessoriesRows?.length || 0) + 1}`).value = accessoriesTotal;
  accWs.getCell(`F${3 + (accessoriesRows?.length || 0) + 1}`).numFmt = "#,##0.00";

  const mocWs = wb.addWorksheet("MOC");
  const mhr = mocWs.getRow(2);
  ["S.No", "MOC", "Unit", "Price"].forEach((h, i) => {
    mhr.getCell(i + 1).value = h;
  });
  styleHeaderRow(mhr);
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
  a.download = `FireTender_Costing_${(tenderNumber || "export").replace(/[^\w.-]+/g, "_")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
