import * as XLSX from "xlsx";
import {
  INQUIRY_TABLE_COLUMNS,
  buildInquiryDbPayload,
  getNextEnquiryNumber,
  getNextSrNo,
} from "./manpowerEnquiryExcelFields";
import { exportManpowerInquiriesFormattedExcel } from "./manpowerInquiryExcelExport";

const INQUIRY_HEADER_ALIASES = {
  srNo: ["Sr. No", "Sr No", "S.No", "S No", "Serial No", "Serial Number"],
  receivedDate: ["Received Date", "Date Received", "Enquiry Date", "Enquiry Received Date"],
  vertical: ["Vertical"],
  modeOfSubmission: [
    "Mode of Submission",
    "Mode Of Submission",
    "Submission Mode",
    "Source",
    "Enquiry Source",
    "Enquiry From",
  ],
  totalManpower: [
    "Total No. of Manpower",
    "Total Manpower",
    "Manpower Count",
    "No of Manpower",
    "No. of Manpower",
  ],
  clientName: ["Client Name", "Client", "Company", "Company Name"],
  location: ["Location", "Site Location", "Site", "City"],
  descriptionOfWork: [
    "Description of Work",
    "Scope of Work",
    "Description",
    "Work Description",
    "Manpower Required",
  ],
  approxValue: [
    "Approx Value (WO Taxes)",
    "Approx Value",
    "Estimated Value",
    "Project Value",
    "Project Estimation",
  ],
  enquiryAssignedTo: [
    "Enquiry Assigned to",
    "Enquiry Assigned To",
    "Assigned To",
    "Assigned to",
    "Handled By",
    "Handler",
  ],
  dueDate: ["Due Date for Submission (if any)", "Due Date", "Due date", "Target Date"],
  offerSubmittedOn: ["Offer Submitted On", "Offer Date", "Offer Submitted Date"],
  remarks: ["Remarks", "Remark", "Notes"],
  furtherAction: [
    "Further action/Follow up",
    "Further Action",
    "Follow up",
    "Follow Up",
    "Further Action / Follow up",
  ],
};

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\u00a0]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeHeaderCompact(value) {
  return normalizeHeader(value)
    .replace(/[./()[\]:;,/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function registerImportHeader(map, alias, fieldId) {
  if (!alias) return;
  map[normalizeHeader(alias)] = fieldId;
  map[normalizeHeaderCompact(alias)] = fieldId;
}

const IMPORT_HEADER_MAP = INQUIRY_TABLE_COLUMNS.reduce((acc, col) => {
  registerImportHeader(acc, col.label, col.id);
  registerImportHeader(acc, col.id, col.id);
  if (col.dbColumn) {
    registerImportHeader(acc, col.dbColumn, col.id);
    registerImportHeader(acc, col.dbColumn.replace(/_/g, " "), col.id);
  }
  return acc;
}, {});

Object.entries(INQUIRY_HEADER_ALIASES).forEach(([fieldId, aliases]) => {
  aliases.forEach((alias) => registerImportHeader(IMPORT_HEADER_MAP, alias, fieldId));
});

function resolveImportFieldKey(header) {
  const normalized = normalizeHeader(header);
  if (IMPORT_HEADER_MAP[normalized]) return IMPORT_HEADER_MAP[normalized];
  const compact = normalizeHeaderCompact(header);
  return IMPORT_HEADER_MAP[compact] || null;
}

function scoreHeaderRow(row) {
  return (row || []).reduce((acc, cell) => acc + (resolveImportFieldKey(cell) ? 1 : 0), 0);
}

function buildRowsFromMatrix(matrix, headerRowIndex) {
  const headers = (matrix[headerRowIndex] || []).map((cell, idx) => {
    const text = String(cell || "").replace(/^\uFEFF/, "").trim();
    return text || `__col${idx}`;
  });

  const rows = matrix.slice(headerRowIndex + 1).map((row) => {
    const obj = {};
    headers.forEach((header, idx) => {
      if (header.startsWith("__col")) return;
      const value = row?.[idx];
      obj[header] = value !== undefined && value !== null ? value : "";
    });
    return obj;
  });

  return { rows, headerRowIndex };
}

function readInquirySheetRows(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  if (!matrix.length) return { rows: [], headerRowIndex: 0 };

  let headerRowIndex = 0;
  let bestScore = 0;
  const scanLimit = Math.min(matrix.length, 12);

  for (let i = 0; i < scanLimit; i += 1) {
    const score = scoreHeaderRow(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }

  // Default: row 1 is the header; data always starts on the next row.
  if (bestScore < 2) {
    return buildRowsFromMatrix(matrix, 0);
  }

  return buildRowsFromMatrix(matrix, headerRowIndex);
}

function isValidIsoDate(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return false;
  if (!Number.isFinite(month) || month < 1 || month > 12) return false;
  if (!Number.isFinite(day) || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function formatIsoDate(y, m, d) {
  const year = String(y);
  const month = String(m).padStart(2, "0");
  const day = String(d).padStart(2, "0");
  return isValidIsoDate(year, month, day) ? `${year}-${month}-${day}` : "";
}

function parseDayMonthYear(a, b, yearPart) {
  let day = Number(a);
  let month = Number(b);
  let year = String(yearPart);
  if (year.length === 2) year = `20${year}`;

  if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  } else if (day > 12 && month <= 12) {
    // DD-MM-YYYY
  } else if (day > 12 && month > 12) {
    return "";
  }

  return formatIsoDate(year, month, day);
}

function parseImportDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatIsoDate(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }
  if (typeof value === "number" && XLSX.SSF?.parse_date_code) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts?.y) {
      return formatIsoDate(parts.y, parts.m, parts.d);
    }
  }

  const text = String(value).trim();
  if (!text || text === "-" || /^n\/a$/i.test(text)) return "";

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return formatIsoDate(iso[1], iso[2], iso[3]);
  }

  const dmy = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (dmy) {
    return parseDayMonthYear(dmy[1], dmy[2], dmy[3]);
  }

  const dMonY = text.match(/^(\d{1,2})[\s.\/-]([A-Za-z]{3,9})[\s.\/-](\d{2,4})$/);
  if (dMonY) {
    const monMap = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = monMap[String(dMonY[2]).slice(0, 3).toLowerCase()];
    if (month) {
      let year = String(dMonY[3]);
      if (year.length === 2) year = `20${year}`;
      return formatIsoDate(year, month, dMonY[1]);
    }
  }

  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return "";
}

const IMPORT_DATE_FIELD_IDS = ["receivedDate", "dueDate", "offerSubmittedOn"];

function validateImportDates(rawRow) {
  const issues = [];
  Object.entries(rawRow || {}).forEach(([header, value]) => {
    const key = resolveImportFieldKey(header);
    if (!IMPORT_DATE_FIELD_IDS.includes(key)) return;
    const text = String(value ?? "").trim();
    if (!text || text === "-" || /^n\/a$/i.test(text)) return;
    if (!parseImportDate(value)) {
      const label = INQUIRY_TABLE_COLUMNS.find((col) => col.id === key)?.label || key;
      issues.push(`Invalid ${label}: "${text}" (use DD-MM-YYYY, e.g. 15-05-2026).`);
    }
  });
  return issues;
}

function mapImportRow(rawRow) {
  const mapped = {};
  Object.entries(rawRow || {}).forEach(([header, value]) => {
    const key = resolveImportFieldKey(header);
    if (!key) return;
    if (["receivedDate", "dueDate", "offerSubmittedOn"].includes(key)) {
      mapped[key] = parseImportDate(value);
      return;
    }
    mapped[key] = value == null ? "" : String(value).trim();
  });
  return mapped;
}

export async function exportManpowerInquiriesToExcel(enquiries, formatDate, options = {}) {
  await exportManpowerInquiriesFormattedExcel(enquiries, formatDate, options);
}

export function downloadManpowerInquiryImportTemplate() {
  const sample = {};
  INQUIRY_TABLE_COLUMNS.forEach((col) => {
    sample[col.label] = "";
  });
  sample["Sr. No"] = "(auto on import)";
  sample["Client Name"] = "Example Client Pvt Ltd";
  sample["Mode of Submission"] = "Email";
  const ws = XLSX.utils.json_to_sheet([sample], { header: INQUIRY_TABLE_COLUMNS.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Import Template");
  XLSX.writeFile(wb, "manpower-inquiry-import-template.xlsx");
}

async function allocateEnquiryNumbers(supabase, count) {
  const first = await getNextEnquiryNumber(supabase);
  const match = first.match(/^ENQ-(\d{4})-(\d{4})$/);
  if (!match || count <= 1) return [first];
  const year = Number(match[1]);
  let seq = Number(match[2]);
  const numbers = [];
  for (let i = 0; i < count; i += 1) {
    numbers.push(`ENQ-${year}-${String(seq).padStart(4, "0")}`);
    seq += 1;
  }
  return numbers;
}

function isNonEmptyImportRow(row) {
  return Object.values(row || {}).some((v) => String(v || "").trim() !== "");
}

const KNOWN_HEADER_LABELS = new Set(
  [
    ...Object.keys(IMPORT_HEADER_MAP),
    ...INQUIRY_TABLE_COLUMNS.map((col) => normalizeHeader(col.label)),
    ...INQUIRY_TABLE_COLUMNS.map((col) => normalizeHeaderCompact(col.label)),
    ...Object.values(INQUIRY_HEADER_ALIASES).flat().map((label) => normalizeHeader(label)),
  ].filter(Boolean)
);

/** Detect a duplicate header row that was read as data (e.g. values are column titles). */
function isHeaderLikeImportRow(mapped) {
  const nonEmptyValues = Object.values(mapped || {})
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (!nonEmptyValues.length) return false;

  const client = normalizeHeader(mapped.clientName);
  const mode = normalizeHeader(mapped.modeOfSubmission);
  if (client === normalizeHeader("Client Name") || client === normalizeHeader("Client")) return true;
  if (mode === normalizeHeader("Mode of Submission")) return true;

  let labelMatches = 0;
  nonEmptyValues.forEach((value) => {
    const normalized = normalizeHeader(value);
    const compact = normalizeHeaderCompact(value);
    if (KNOWN_HEADER_LABELS.has(normalized) || KNOWN_HEADER_LABELS.has(compact) || resolveImportFieldKey(value)) {
      labelMatches += 1;
    }
  });

  return labelMatches >= 3 || (labelMatches >= 2 && nonEmptyValues.length <= 4);
}

function validateImportRow(row) {
  const issues = [];
  if (!String(row.clientName || "").trim()) {
    issues.push("Client Name is required.");
  }
  if (!String(row.modeOfSubmission || "").trim()) {
    issues.push("Mode of Submission is required.");
  }
  return issues;
}

function readWorkbookFromFile(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error("No worksheet found in the file.");
    return { workbook, sheetName };
  });
}

/** Parse file for preview — does not write to the database. */
export async function previewManpowerInquiryImport(file) {
  const { workbook, sheetName } = await readWorkbookFromFile(file);
  const { rows: rawRows, headerRowIndex } = readInquirySheetRows(workbook.Sheets[sheetName]);
  const detectedHeaders = [
    ...new Set(rawRows.flatMap((row) => Object.keys(row || {})).filter((h) => h && !h.startsWith("__col"))),
  ];

  if (!rawRows.length) {
    return {
      fileName: file.name,
      sheetName,
      headerRowNumber: headerRowIndex + 1,
      detectedHeaders,
      totalDataRows: 0,
      items: [],
      readyCount: 0,
      skipCount: 0,
      emptyCount: 0,
      fileError:
        'The file has no data rows below the header. Add at least one row with "Client Name" and "Mode of Submission".',
    };
  }

  const items = [];
  let readyCount = 0;
  let skipCount = 0;
  let emptyCount = 0;

  rawRows.forEach((rawRow, index) => {
    const rowNumber = headerRowIndex + index + 2;
    const row = mapImportRow(rawRow);

    if (!isNonEmptyImportRow(row)) {
      emptyCount += 1;
      items.push({ rowNumber, row, status: "empty", issues: ["Empty row — skipped."] });
      return;
    }

    if (isHeaderLikeImportRow(row)) {
      emptyCount += 1;
      items.push({
        rowNumber,
        row,
        status: "empty",
        issues: ["Header row — skipped (not imported)."],
      });
      return;
    }

    const issues = [...validateImportDates(rawRow), ...validateImportRow(row)];
    if (issues.length) {
      skipCount += 1;
      items.push({ rowNumber, row, status: "invalid", issues });
      return;
    }

    readyCount += 1;
    items.push({ rowNumber, row, status: "ready", issues: [] });
  });

  const mappedRowCount = items.filter((item) => item.status !== "empty").length;
  let fileError = null;
  if (mappedRowCount === 0) {
    const preview = detectedHeaders.slice(0, 10).join(", ") || "(none)";
    fileError = `No recognizable inquiry columns found. Header row is Excel row ${headerRowIndex + 1}. Expected columns such as "Client Name" and "Mode of Submission". Headers detected: ${preview}.`;
  }

  return {
    fileName: file.name,
    sheetName,
    headerRowNumber: headerRowIndex + 1,
    detectedHeaders,
    totalDataRows: rawRows.length,
    items,
    readyCount,
    skipCount,
    emptyCount,
    fileError,
  };
}

function buildImportPayloads(validRows, enquiryNumbers, startSrNo, userId) {
  let nextSrNo = startSrNo;
  return validRows.map((row, index) => {
    // Always assign fresh Sr. No. from DB sequence — never use Excel Sr. No. column.
    const srNo = nextSrNo++;
    const form = {
      srNo,
      receivedDate: row.receivedDate || new Date().toISOString().split("T")[0],
      vertical: row.vertical || "",
      modeOfSubmission: row.modeOfSubmission,
      totalManpower: row.totalManpower || "",
      clientName: row.clientName,
      location: row.location || "",
      descriptionOfWork: row.descriptionOfWork || "",
      approxValue: row.approxValue || "",
      enquiryAssignedTo: row.enquiryAssignedTo || "",
      dueDate: row.dueDate || null,
      offerSubmittedOn: row.offerSubmittedOn || null,
      remarks: row.remarks || "",
      furtherAction: row.furtherAction || "",
    };

    const payload = {
      ...buildInquiryDbPayload(form, { srNo }),
      enquiry_number: enquiryNumbers[index],
      status: "Pending",
    };
    if (userId) payload.user_id = userId;
    return payload;
  });
}

/** Insert rows confirmed from previewManpowerInquiryImport. */
export async function commitManpowerInquiryImport(preview, supabase, userId) {
  const readyItems = (preview?.items || []).filter((item) => item.status === "ready");
  if (!readyItems.length) {
    const rowErrors = (preview?.items || [])
      .filter((item) => item.status === "invalid")
      .flatMap((item) => item.issues.map((issue) => ({ rowNumber: item.rowNumber, message: issue })));
    return {
      imported: 0,
      skipped: preview?.skipCount || 0,
      errors: rowErrors,
      stage: "validation",
      message: preview?.fileError || "No valid rows to import.",
    };
  }

  const validRows = readyItems.map((item) => item.row);
  let nextSrNo;
  let enquiryNumbers;

  try {
    nextSrNo = await getNextSrNo(supabase);
    enquiryNumbers = await allocateEnquiryNumbers(supabase, validRows.length);
  } catch (error) {
    return {
      imported: 0,
      skipped: preview.skipCount || 0,
      errors: [{ rowNumber: null, message: error?.message || "Failed to prepare enquiry numbers." }],
      stage: "prepare",
      message: error?.message || "Failed to prepare enquiry numbers.",
    };
  }

  const payloads = buildImportPayloads(validRows, enquiryNumbers, nextSrNo, userId);
  const { error } = await supabase.from("manpower_enquiries").insert(payloads);

  if (error) {
    return {
      imported: 0,
      skipped: preview.skipCount || 0,
      errors: [
        {
          rowNumber: null,
          message: error.message || String(error),
          detail: "Database insert failed for all ready rows.",
        },
      ],
      stage: "insert",
      message: error.message || "Database insert failed.",
    };
  }

  const validationErrors = (preview.items || [])
    .filter((item) => item.status === "invalid")
    .flatMap((item) => item.issues.map((issue) => ({ rowNumber: item.rowNumber, message: issue })));

  return {
    imported: payloads.length,
    skipped: preview.skipCount || 0,
    errors: validationErrors,
    stage: "done",
    message: null,
  };
}

export async function importManpowerInquiriesFromFile(file, supabase, userId) {
  const preview = await previewManpowerInquiryImport(file);
  if (preview.fileError && preview.readyCount === 0) {
    throw new Error(preview.fileError);
  }
  const result = await commitManpowerInquiryImport(preview, supabase, userId);
  if (result.stage === "insert" || result.stage === "prepare") {
    const where = result.stage === "insert" ? "while saving to database" : "while preparing enquiry numbers";
    throw new Error(`${result.message} (failed ${where}).`);
  }
  return {
    imported: result.imported,
    skipped: result.skipped,
    errors: result.errors.map((e) =>
      e.rowNumber ? `Row ${e.rowNumber}: ${e.message}` : e.message
    ),
  };
}
