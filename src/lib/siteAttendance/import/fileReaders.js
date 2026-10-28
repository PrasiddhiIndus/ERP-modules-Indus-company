/**
 * Turns an uploaded file into plain string grids (one per sheet) that the
 * layout parser can read. Parsing is local (browser); nothing is uploaded.
 *
 * .xlsx is read with exceljs (the npm `xlsx` 0.18 build is not used for
 * untrusted uploads). Legacy .xls is not supported in this phase.
 */

export const IMPORT_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const IMPORT_MAX_CELLS = 200000;

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // zip container
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]; // legacy .xls / .doc

function startsWith(bytes, magic) {
  return magic.every((b, i) => bytes[i] === b);
}

export function detectFileKind(fileName, bytes) {
  const ext = String(fileName || "").toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "xlsx" || ext === "xlsm") {
    if (!startsWith(bytes, XLSX_MAGIC)) throw new Error("This file is not a valid .xlsx workbook.");
    return "xlsx";
  }
  if (ext === "xls" || startsWith(bytes, OLE_MAGIC)) {
    throw new Error("Old .xls files are not supported yet. Open it in Excel and save as .xlsx.");
  }
  if (["pdf", "jpg", "jpeg", "png", "doc", "docx"].includes(ext)) {
    throw new Error("PDF, image and Word imports arrive in a later phase. Use .xlsx or .csv for now.");
  }
  throw new Error("Unsupported file type. Upload an .xlsx or .csv file.");
}

export async function sha256Hex(buffer) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** exceljs cell value → display string. Dates become YYYY-MM-DD. */
export function cellValueToString(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text || "").join("");
    if ("result" in value) return cellValueToString(value.result);
    if ("text" in value) return String(value.text ?? "");
    if ("error" in value) return "";
    return "";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return String(value);
}

async function readXlsxGrids(buffer) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets = [];
  let cellCount = 0;
  wb.worksheets.forEach((ws) => {
    if (ws.state && ws.state !== "visible") return;
    const rowCount = ws.actualRowCount ? ws.rowCount : 0;
    const colCount = ws.columnCount || 0;
    cellCount += rowCount * colCount;
    if (cellCount > IMPORT_MAX_CELLS) {
      throw new Error("The workbook is too large to import (cell limit exceeded).");
    }
    const grid = [];
    for (let r = 1; r <= rowCount; r += 1) {
      const row = ws.getRow(r);
      const out = [];
      for (let c = 1; c <= colCount; c += 1) {
        const cell = row.getCell(c);
        let value = cell.value;
        // Merged cells: copy the master value down vertical merges only
        // (header cells spanning two rows, code/name spanning the OT row).
        // Horizontal merges (titles, "LEFT" across days) stay in their first cell.
        if (cell.isMerged && cell.master && cell.master !== cell) {
          value = cell.col === cell.master.col ? cell.master.value : null;
        }
        out.push(cellValueToString(value).replace(/ /g, " ").trim());
      }
      grid.push(out);
    }
    sheets.push({ name: ws.name, grid });
  });
  return sheets;
}

async function readCsvGrids(buffer) {
  const Papa = (await import("papaparse")).default;
  const text = new TextDecoder("utf-8").decode(buffer);
  const parsed = Papa.parse(text, { skipEmptyLines: false });
  const grid = (parsed.data || []).map((row) => row.map((v) => String(v ?? "").trim()));
  if (grid.length * (grid[0]?.length || 0) > IMPORT_MAX_CELLS) {
    throw new Error("The CSV is too large to import (cell limit exceeded).");
  }
  return [{ name: "CSV", grid }];
}

/**
 * @returns {Promise<{ kind: string, sha256: string, size: number, sheets: {name:string, grid:string[][]}[] }>}
 */
export async function readUploadedFile(file) {
  if (!file) throw new Error("Choose a file to import.");
  if (file.size > IMPORT_MAX_FILE_BYTES) throw new Error("File is larger than 15 MB.");
  if (!file.size) throw new Error("The file is empty.");
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const kind = detectFileKind(file.name, bytes);
  const sha256 = await sha256Hex(buffer);
  const sheets = kind === "csv" ? await readCsvGrids(buffer) : await readXlsxGrids(buffer);
  return { kind, sha256, size: file.size, sheets };
}
