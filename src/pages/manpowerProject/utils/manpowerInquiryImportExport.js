import * as XLSX from "xlsx";
import {
  INQUIRY_TABLE_COLUMNS,
  buildInquiryDbPayload,
  formatInquiryCellValue,
  getExcelInquiryFields,
  getNextEnquiryNumber,
  getNextSrNo,
} from "./manpowerEnquiryExcelFields";

const IMPORT_HEADER_MAP = INQUIRY_TABLE_COLUMNS.reduce((acc, col) => {
  acc[col.label.toLowerCase()] = col.id;
  acc[col.id.toLowerCase()] = col.id;
  return acc;
}, {});

IMPORT_HEADER_MAP["sr no"] = "srNo";
IMPORT_HEADER_MAP["sr. no"] = "srNo";
IMPORT_HEADER_MAP["approx value (wo taxes)"] = "approxValue";
IMPORT_HEADER_MAP["due date for submission (if any)"] = "dueDate";
IMPORT_HEADER_MAP["further action/follow up"] = "furtherAction";
IMPORT_HEADER_MAP["further action / follow up"] = "furtherAction";

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseImportDate(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }
  if (typeof value === "number" && XLSX.SSF?.parse_date_code) {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts?.y) {
      return `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
    }
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return "";
}

function mapImportRow(rawRow) {
  const mapped = {};
  Object.entries(rawRow || {}).forEach(([header, value]) => {
    const key = IMPORT_HEADER_MAP[normalizeHeader(header)];
    if (!key) return;
    if (["receivedDate", "dueDate", "offerSubmittedOn"].includes(key)) {
      mapped[key] = parseImportDate(value);
      return;
    }
    mapped[key] = value == null ? "" : String(value).trim();
  });
  return mapped;
}

function exportRowFromEnquiry(row, formatDate) {
  const fields = getExcelInquiryFields(row);
  const out = {};
  INQUIRY_TABLE_COLUMNS.forEach((col) => {
    out[col.label] = formatInquiryCellValue(fields[col.id], col.valueType, formatDate);
    if (out[col.label] === "—") out[col.label] = "";
  });
  return out;
}

export function exportManpowerInquiriesToExcel(enquiries, formatDate) {
  const rows = (enquiries || []).map((row) => exportRowFromEnquiry(row, formatDate));
  const headers = INQUIRY_TABLE_COLUMNS.map((col) => col.label);
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Manpower Inquiries");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `manpower-inquiries-${stamp}.xlsx`);
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

export async function importManpowerInquiriesFromFile(file, supabase, userId) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("No worksheet found in the file.");

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  if (!rawRows.length) throw new Error("The file has no data rows.");

  const parsedRows = rawRows.map(mapImportRow).filter((row) =>
    Object.values(row).some((v) => String(v || "").trim() !== "")
  );
  if (!parsedRows.length) throw new Error("No valid inquiry rows found.");

  const errors = [];
  const validRows = [];
  parsedRows.forEach((row, index) => {
    const rowNum = index + 2;
    if (!String(row.clientName || "").trim()) {
      errors.push(`Row ${rowNum}: Client Name is required.`);
      return;
    }
    if (!String(row.modeOfSubmission || "").trim()) {
      errors.push(`Row ${rowNum}: Mode of Submission is required.`);
      return;
    }
    validRows.push(row);
  });

  if (!validRows.length) {
    return { imported: 0, skipped: parsedRows.length, errors };
  }

  let nextSrNo = await getNextSrNo(supabase);
  const enquiryNumbers = await allocateEnquiryNumbers(supabase, validRows.length);

  const payloads = validRows.map((row, index) => {
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
      dueDate: row.dueDate || "",
      offerSubmittedOn: row.offerSubmittedOn || "",
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

  const { error } = await supabase.from("manpower_enquiries").insert(payloads);
  if (error) throw error;

  return {
    imported: payloads.length,
    skipped: parsedRows.length - validRows.length,
    errors,
  };
}
