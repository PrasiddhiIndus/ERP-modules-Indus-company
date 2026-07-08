import * as XLSX from "xlsx";
import { formatDateDdMmYyyy, normalizeToIsoDate } from "../utils/dateDisplay";
import { buildHolidayDbRow, normalizeHolidayType } from "./nationalPublicHolidays";

export const HOLIDAY_IMPORT_HEADERS = [
  "Sr. No.",
  "Date",
  "Year",
  "Holiday Type (NH/PH)",
  "Remarks",
];

const HEADER_ALIASES = {
  sr_no: ["sr. no.", "sr no", "sr. no", "s.no", "serial no"],
  holiday_date: ["date", "holiday date", "holiday_date"],
  calendar_year: ["year", "calendar year"],
  holiday_type: ["holiday type (nh/ph)", "holiday type", "type", "nh/ph"],
  remarks: ["remarks", "remark", "description"],
};

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildHeaderFieldMap() {
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const alias of aliases) {
      map[normalizeHeader(alias)] = field;
    }
  }
  return map;
}

const HEADER_FIELD_MAP = buildHeaderFieldMap();

function parseExcelDate(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  return normalizeToIsoDate(value);
}

function rowFromSheetObject(raw) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const field = HEADER_FIELD_MAP[normalizeHeader(key)];
    if (!field) continue;
    if (field === "sr_no") {
      const n = Number(String(value ?? "").replace(/,/g, "").trim());
      mapped.sr_no = Number.isFinite(n) ? Math.round(n) : null;
    } else if (field === "holiday_date") {
      mapped.holiday_date = parseExcelDate(value);
    } else if (field === "calendar_year") {
      const y = Number(String(value ?? "").trim());
      mapped.calendar_year = Number.isFinite(y) ? Math.round(y) : null;
    } else if (field === "holiday_type") {
      mapped.holiday_type = normalizeHolidayType(value);
    } else if (field === "remarks") {
      mapped.remarks = String(value ?? "").trim();
    }
  }
  if (!mapped.calendar_year && mapped.holiday_date) {
    mapped.calendar_year = Number(mapped.holiday_date.slice(0, 4));
  }
  return mapped;
}

export function downloadHolidaySampleSheet(year) {
  const y = Number(year) || new Date().getFullYear();
  const samples = [
    {
      "Sr. No.": 1,
      Date: `01/01/${y}`,
      Year: y,
      "Holiday Type (NH/PH)": "NH",
      Remarks: "New Year",
    },
    {
      "Sr. No.": 2,
      Date: `26/01/${y}`,
      Year: y,
      "Holiday Type (NH/PH)": "NH",
      Remarks: "Republic Day",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(samples, { header: HOLIDAY_IMPORT_HEADERS });
  ws["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 8 }, { wch: 22 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Holidays");
  XLSX.writeFile(wb, `national-public-holidays-sample-${y}.xlsx`);
}

export function exportHolidaysToExcel(rows, year) {
  const y = Number(year) || new Date().getFullYear();
  const data = (rows || []).map((r, i) => ({
    "Sr. No.": r.sr_no ?? i + 1,
    Date: formatDateDdMmYyyy(r.holiday_date),
    Year: r.calendar_year ?? y,
    "Holiday Type (NH/PH)": r.holiday_type || "",
    Remarks: r.remarks || "",
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: HOLIDAY_IMPORT_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Holidays");
  XLSX.writeFile(wb, `national-public-holidays-${y}.xlsx`);
}

/**
 * @returns {Promise<{ rows: object[], errors: string[], skipped: number }>}
 */
export async function parseHolidayImportFile(file) {
  const errors = [];
  if (!file) return { rows: [], errors: ["No file selected."], skipped: 0 };

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => normalizeHeader(n) === "holidays") || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { rows: [], errors: ["No worksheet found in file."], skipped: 0 };

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rawRows.length) return { rows: [], errors: ["Import sheet has no data rows."], skipped: 0 };

  const payloads = [];
  let skipped = 0;

  rawRows.forEach((raw, index) => {
    const rowNum = index + 2;
    const hasAny = Object.values(raw).some((v) => String(v ?? "").trim() !== "");
    if (!hasAny) return;

    const mapped = rowFromSheetObject(raw);
    const dbRow = buildHolidayDbRow(mapped);
    if (!dbRow) {
      errors.push(`Row ${rowNum}: valid Date and Holiday Type (NH/PH) required — skipped.`);
      skipped += 1;
      return;
    }
    payloads.push(dbRow);
  });

  if (!payloads.length && !errors.length) {
    errors.push("No valid holiday rows found.");
  }

  return { rows: payloads, errors, skipped };
}
