import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DAHEJ_EXPENSE_COLUMNS } from "../constants/columns";
import { rowTotalExpense } from "../data/dahejExpenseStorage";

const HEADER_MAP = Object.fromEntries(
  DAHEJ_EXPENSE_COLUMNS.map((c) => [
    c.label.toLowerCase().replace(/\s+/g, " ").trim(),
    c.key,
  ])
);

HEADER_MAP["sr.\r\nno."] = "sr_no";
HEADER_MAP["sr. no."] = "sr_no";
HEADER_MAP["expense bill serials"] = "expense_bill_serial_no";
HEADER_MAP["fuel - fire tender"] = "fuel_fire_tender";

function normalizeHeader(h) {
  return String(h || "")
    .replace(/\r\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function excelDateToIso(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text;
}

function parseNum(v) {
  if (v == null || v === "" || v === "-") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export function rowsToSheetAoA(rows, monthLabel = "") {
  const headerRow1 = [
    monthLabel ? `Expense Details Dahej Sites — ${monthLabel}` : "Dahej Expenses Register",
    ...Array(DAHEJ_EXPENSE_COLUMNS.length - 1).fill(""),
  ];
  const headerRow2 = ["Advance Payment Details", "", "", "Expense Details", "", "", "", "", "Expense Observation", "", "", "", "", "", "", "", "", "Remarks"];
  const headers = DAHEJ_EXPENSE_COLUMNS.map((c) => c.label);
  const dataRows = rows.map((r) =>
    DAHEJ_EXPENSE_COLUMNS.map((c) => {
      if (c.type === "currency" || c.type === "number") return r[c.key] ?? "";
      if (c.key === "date") return r.date || "";
      return r[c.key] ?? "";
    })
  );
  const totals = DAHEJ_EXPENSE_COLUMNS.map((c) => {
    if (c.key === "sr_no") return "TOTAL";
    if (c.type === "currency") return rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    if (c.key === "remarks") return "";
    return "";
  });
  return [headerRow1, headerRow2, headers, ...dataRows, totals];
}

export function exportDahejExcel(rows, filename = "dahej-expenses.xlsx", monthLabel = "") {
  const aoa = rowsToSheetAoA(rows, monthLabel);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, monthLabel || "Register");
  XLSX.writeFile(wb, filename);
}

export function downloadDahejTemplate() {
  const headers = DAHEJ_EXPENSE_COLUMNS.map((c) => c.label);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "dahej-expenses-template.xlsx");
}

export async function importDahejExcel(file, monthKey) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!aoa.length) throw new Error("Empty file");

  let headerIdx = aoa.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes("sr") && normalizeHeader(cell).includes("no"))
  );
  if (headerIdx < 0) headerIdx = 0;
  const headerRow = aoa[headerIdx].map((h) => normalizeHeader(h));

  const colMap = {};
  headerRow.forEach((h, i) => {
    const key = HEADER_MAP[h] || HEADER_MAP[h.replace(/\./g, "")];
    if (key) colMap[i] = key;
  });

  const rows = [];
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = aoa[r];
    if (!line || line.every((c) => c === "" || c === "-")) continue;
    const firstCell = String(line[0] || "").toUpperCase();
    if (firstCell === "TOTAL") break;

    const entry = {
      id: `de-import-${Date.now()}-${r}`,
      month_key: monthKey,
      status: "draft",
    };
    let hasData = false;
    Object.entries(colMap).forEach(([i, key]) => {
      const val = line[Number(i)];
      if (val === "" || val === "-") return;
      hasData = true;
      if (key === "date") entry.date = excelDateToIso(val);
      else if (key === "sr_no") entry.sr_no = parseNum(val) || "";
      else if (DAHEJ_EXPENSE_COLUMNS.find((c) => c.key === key)?.type === "currency") entry[key] = parseNum(val);
      else entry[key] = String(val).trim();
    });
    if (hasData) rows.push(entry);
  }

  if (!rows.length) throw new Error("No data rows found. Ensure column headers match the Dahej expense template.");
  return rows;
}

export function exportDahejPdf(rows, title = "Dahej Expenses Report") {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(12);
  doc.text(title, 14, 14);
  autoTable(doc, {
    startY: 20,
    head: [DAHEJ_EXPENSE_COLUMNS.map((c) => c.label)],
    body: rows.map((r) =>
      DAHEJ_EXPENSE_COLUMNS.map((c) => {
        const v = r[c.key];
        if (c.type === "currency") return v ? Number(v).toFixed(2) : "";
        return v ?? "";
      })
    ),
    styles: { fontSize: 6, cellPadding: 1 },
    headStyles: { fillColor: [31, 77, 122] },
  });
  doc.save(`${title.replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

export function aggregateByField(rows, field) {
  const map = {};
  rows.forEach((r) => {
    const k = r[field] || "—";
    if (!map[k]) map[k] = { label: k, total: 0, count: 0, fuel: 0, maintenance: 0, inventory: 0, other: 0 };
    const t = rowTotalExpense(r);
    map[k].total += t;
    map[k].count += 1;
    map[k].fuel += (Number(r.fuel_camper) || 0) + (Number(r.fuel_maruti_eco) || 0) + (Number(r.fuel_bike) || 0) + (Number(r.fuel_fire_tender) || 0);
    map[k].maintenance += (Number(r.service_camper) || 0) + (Number(r.service_maruti_eco) || 0) + (Number(r.service_bike) || 0) + (Number(r.service_fire_tender) || 0);
    map[k].inventory += Number(r.inventory_item) || 0;
    map[k].other += Number(r.other_service_supplies) || 0;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}
