/**
 * Deterministic layout parser for attendance spreadsheets (.xlsx / .csv).
 *
 * Handles the layouts seen at sites so far:
 *  - ERP export: "dd-mm-yyyy (Ddd)" day headers, "OT Hours" row, subtotal rows
 *  - Client sheets: title rows, weekday row + day-number row (either order),
 *    salary-cycle day wrap (21…31, 1…20), "OT" row, repeated header blocks
 * Sheets without a name column and a run of day columns (Totals, Summary,
 * P&L) are ignored.
 */
import { readUploadedFile } from "../fileReaders";

export const EXCEL_PROVIDER_ID = "excel-layout";
export const EXCEL_PROVIDER_VERSION = "1";

const MIN_DAY_RUN = 7;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const isCodeHeader = (t) => /^(emp(loyee)?\.?\s*)?(code|no\.?|id)$|^e\.?\s*code$/.test(t);
const isNameHeader = (t) => /^(emp(loyee)?\.?\s*)?name$/.test(t);
const isDesigHeader = (t) => /^desig/.test(t);
const isOtLabel = (t) => /^o\.?t\.?(\s*hours?|\s*hrs?)?$/.test(t);
const isTotalLabel = (t) => /total|cumulative|grand|^sum$|^shift\s*[abcg]$/.test(t);

const TOTAL_HEADERS = [
  ["present", (t) => /^(present|duty|duty done|duty performed|p|days present|total present days)$/.test(t)],
  ["ot", (t) => /^o\.?t\.?( ?\((days|hours|hrs)\)| hours| days)?$/.test(t)],
  ["leave", (t) => /^(leave|l|leaves)$/.test(t)],
  ["weekoff", (t) => /^(wo|w\/o|w\.o\.?|weekoff|week off)$/.test(t)],
  ["nhph", (t) => /^(ph|nh|nh\/ph|nh-ph)$/.test(t)],
  ["total", (t) => /^total( duty| present)?$/.test(t)],
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Header cell → { iso } for a full date, { day } for a day number, else null. */
function parseDayHeader(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}` };
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (m) return { iso: `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` };
  m = s.match(/^(\d{1,2})(st|nd|rd|th)?$/i);
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) return { day };
  }
  return null;
}

function nextIso(iso) {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Longest run of consecutive day columns in a row. */
function findDayRun(row) {
  let best = null;
  let cur = null;
  const close = () => {
    if (cur && (!best || cur.cols.length > best.cols.length)) best = cur;
    cur = null;
  };
  row.forEach((cell, col) => {
    const h = parseDayHeader(cell);
    if (!h) {
      close();
      return;
    }
    if (cur) {
      const prev = cur.headers[cur.headers.length - 1];
      const follows =
        (h.iso && prev.iso && nextIso(prev.iso) === h.iso) ||
        (h.day && prev.day && (h.day === prev.day + 1 || (prev.day >= 28 && h.day === 1)));
      if (follows && cur.cols[cur.cols.length - 1] === col - 1) {
        cur.cols.push(col);
        cur.headers.push(h);
        return;
      }
      close();
    }
    cur = { cols: [col], headers: [h] };
  });
  close();
  return best && best.cols.length >= MIN_DAY_RUN ? best : null;
}

function findColumn(rows, from, to, test) {
  for (const row of rows) {
    for (let c = from; c < Math.min(to, row.length); c += 1) {
      if (test(norm(row[c]))) return c;
    }
  }
  return -1;
}

/** Map day-number headers onto the site's cycle days; null when they don't line up. */
function alignDayNumbers(headers, cycleDays) {
  for (let start = 0; start + headers.length <= cycleDays.length; start += 1) {
    if (headers.every((h, k) => cycleDays[start + k].day === h.day)) {
      return headers.map((_, k) => cycleDays[start + k].dateString);
    }
  }
  return null;
}

function weekdayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function parseNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Detect a header block starting at row r; returns its layout or null. */
function detectHeader(grid, r, cycleDays) {
  const headerRow = grid[r] || [];
  const nameCol = headerRow.findIndex((c) => isNameHeader(norm(c)));
  if (nameCol < 0) return null;

  let dayRow = -1;
  let run = null;
  for (let k = r; k <= Math.min(r + 2, grid.length - 1); k += 1) {
    const found = findDayRun(grid[k] || []);
    if (found && (!run || found.cols.length > run.cols.length)) {
      run = found;
      dayRow = k;
    }
  }
  if (!run || run.cols[0] <= nameCol) return null;

  const firstDayCol = run.cols[0];
  const lastDayCol = run.cols[run.cols.length - 1];
  const headerRows = [grid[r], grid[r + 1] || [], grid[r - 1] || []];
  const codeCol = findColumn([headerRow], 0, firstDayCol, isCodeHeader);
  const desigCol = findColumn([headerRow], 0, firstDayCol, isDesigHeader);

  const warnings = [];
  let dates;
  let error = null;
  if (run.headers[0].iso) {
    dates = run.headers.map((h) => h.iso);
  } else {
    dates = alignDayNumbers(run.headers, cycleDays);
    if (!dates) {
      const fileDays = `${run.headers[0].day}…${run.headers[run.headers.length - 1].day}`;
      const cycle = cycleDays.length ? `${cycleDays[0].day}…${cycleDays[cycleDays.length - 1].day}` : "—";
      error = `Day columns ${fileDays} do not match this site's salary cycle (${cycle}). Check the month or the site's cycle.`;
    }
  }

  // Weekday sanity check against any weekday row near the header.
  if (dates) {
    for (let k = r; k <= Math.min(dayRow + 1, grid.length - 1); k += 1) {
      const row = grid[k] || [];
      const tokens = run.cols.map((c) => String(row[c] || "").trim().slice(0, 3).toUpperCase());
      if (tokens.filter((t) => WEEKDAYS.includes(t)).length < MIN_DAY_RUN) continue;
      const mismatches = tokens.filter((t, i) => WEEKDAYS.includes(t) && t !== weekdayOf(dates[i])).length;
      if (mismatches) {
        warnings.push(`Weekday headers do not match the dates in ${mismatches} column(s) — the sheet may be for a different month.`);
      }
    }
  }

  const totalCols = {};
  for (let c = lastDayCol + 1; c < Math.max(...headerRows.map((row) => row.length)); c += 1) {
    let label = headerRows.map((row) => norm(row[c])).find(Boolean) || "";
    if (/applied/.test(label)) continue;
    // "Total Leave" / "Total OT (Days)" → "leave" / "ot (days)"; "Total present" stays a total.
    label = label.replace(/^total (?=(leave|weekoff|week off|w\/o|nh\/ph|nh-ph|ph|ot)\b)/, "");
    const match = TOTAL_HEADERS.find(([key, test]) => totalCols[key] == null && test(label));
    if (match) totalCols[match[0]] = c;
  }

  // Data starts after the header/day/weekday rows.
  let dataStart = Math.max(r, dayRow) + 1;
  while (dataStart < grid.length) {
    const row = grid[dataStart] || [];
    const weekdayCells = run.cols.filter((c) => WEEKDAYS.includes(String(row[c] || "").trim().slice(0, 3).toUpperCase()));
    const dayCells = findDayRun(row);
    if (weekdayCells.length >= MIN_DAY_RUN || (dayCells && dayCells.cols[0] === firstDayCol)) dataStart += 1;
    else break;
  }

  // A stray day header right after the run (e.g. a second "31") is not read.
  const extraDayCol = [r, dayRow].some((k) => parseDayHeader((grid[k] || [])[lastDayCol + 1])) ? lastDayCol + 1 : -1;

  return { headerRow: r, dataStart, nameCol, codeCol, desigCol, dayCols: run.cols, dates, totalCols, extraDayCol, warnings, error };
}

function detectPhNotes(grid) {
  const notes = [];
  grid.slice(0, 6).forEach((row) => {
    row.forEach((cell) => {
      const m = String(cell || "").match(/\b(?:N\.?H\.?|P\.?H\.?)\s*[-:]\s*([\d.\-/ ,&]+)/i);
      if (m) notes.push(String(cell).trim());
    });
  });
  return notes;
}

/**
 * Parse string grids into the normalized import structure.
 * @param {{name:string, grid:string[][]}[]} sheets
 * @param {{ cycleDays: {day:number, dateString:string}[] }} context
 */
export function parseAttendanceGrids(sheets, { cycleDays = [] } = {}) {
  const rows = [];
  const warnings = [];
  const errors = [];
  const sheetsUsed = [];

  sheets.forEach(({ name: sheetName, grid }) => {
    let layout = null;
    let lastEmployee = null;
    let used = false;
    detectPhNotes(grid).forEach((note) => warnings.push(`${sheetName}: sheet note "${note}" — check NH/PH dates in Site Master.`));

    for (let r = 0; r < grid.length; r += 1) {
      const header = detectHeader(grid, r, cycleDays);
      if (header) {
        layout = header;
        lastEmployee = null;
        header.warnings.forEach((w) => warnings.push(`${sheetName} row ${r + 1}: ${w}`));
        if (header.error) errors.push(`${sheetName} row ${r + 1}: ${header.error}`);
        r = header.dataStart - 1;
        continue;
      }
      if (!layout || !layout.dates) continue;

      const row = grid[r] || [];
      const firstDayCol = layout.dayCols[0];
      const leading = row.slice(0, firstDayCol).map(norm);
      const hasDayData = layout.dayCols.some((c) => String(row[c] || "").trim());

      // An OT row is labelled "OT" / "OT Hours" — or, when code/name cells are
      // merged down from the employee row, repeats that employee and holds
      // only OT values in the day columns.
      const repeatsLast =
        lastEmployee &&
        lastEmployee.sourceRow === r &&
        (layout.codeCol < 0 || String(row[layout.codeCol] || "").trim() === lastEmployee.rawCode) &&
        String(row[layout.nameCol] || "").trim() === lastEmployee.rawName;
      const onlyOtValues =
        hasDayData &&
        layout.dayCols.every((c) => {
          const v = norm(row[c]);
          return !v || /^\d+(\.\d+)?$/.test(v) || isOtLabel(v);
        });
      if (leading.some(isOtLabel) || (repeatsLast && onlyOtValues)) {
        if (!hasDayData) continue;
        const code = layout.codeCol >= 0 ? String(row[layout.codeCol] || "").trim() : "";
        const owner = code && lastEmployee && lastEmployee.rawCode !== code
          ? [...rows].reverse().find((x) => x.sheet === sheetName && x.rawCode === code)
          : lastEmployee;
        if (!owner) {
          warnings.push(`${sheetName} row ${r + 1}: OT row has no employee above it — ignored.`);
          continue;
        }
        if (owner.otRow) {
          warnings.push(`${sheetName} row ${r + 1}: second OT row for ${owner.rawName || owner.rawCode} — ignored.`);
          continue;
        }
        owner.otRow = r + 1;
        layout.dayCols.forEach((c, i) => {
          const raw = String(row[c] || "").trim();
          if (raw) owner.cellsByDate[layout.dates[i]].rawOt = raw;
        });
        continue;
      }

      if (leading.some((t) => t && isTotalLabel(t))) continue;

      const rawCode = layout.codeCol >= 0 ? String(row[layout.codeCol] || "").trim() : "";
      const rawName = String(row[layout.nameCol] || "").trim();
      if (!rawName && !rawCode) continue;
      // Merged label rows repeat the first cell's text across Sr/Code/Name.
      const firstCell = String(row[0] || "").trim();
      if (!rawCode && firstCell && !/^\d+$/.test(firstCell) && firstCell === rawName && layout.nameCol > 0) continue;

      if (layout.extraDayCol >= 0 && String(row[layout.extraDayCol] || "").trim()) {
        warnings.push(`${sheetName}: an extra day column after the last date (column ${layout.extraDayCol + 1}) has marks — they were not imported.`);
      }
      if (!hasDayData && !Object.values(layout.totalCols).some((c) => String(row[c] || "").trim())) continue;

      const cellsByDate = {};
      layout.dayCols.forEach((c, i) => {
        cellsByDate[layout.dates[i]] = { date: layout.dates[i], rawMark: String(row[c] || "").trim(), rawOt: "", col: c + 1 };
      });
      const sheetTotals = {};
      Object.entries(layout.totalCols).forEach(([key, c]) => {
        const n = parseNumber(row[c]);
        if (n != null) sheetTotals[key] = n;
      });

      const entry = {
        rowKey: `${sheetName}!${r + 1}`,
        sheet: sheetName,
        sourceRow: r + 1,
        otRow: null,
        rawCode,
        rawName,
        rawDesig: layout.desigCol >= 0 ? String(row[layout.desigCol] || "").trim() : "",
        cellsByDate,
        sheetTotals,
      };
      rows.push(entry);
      lastEmployee = entry;
      used = true;
    }
    if (used) sheetsUsed.push(sheetName);
  });

  if (!rows.length && !errors.length) {
    errors.push("No attendance table found. The sheet needs a Name column and day columns (dates or 1…31).");
  }

  return {
    providerId: EXCEL_PROVIDER_ID,
    providerVersion: EXCEL_PROVIDER_VERSION,
    sheetsUsed,
    rows: rows.map(({ cellsByDate, ...rest }) => ({
      ...rest,
      cells: Object.values(cellsByDate).map((cell) => ({ ...cell, confidence: 1 })),
    })),
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

/** ExtractionProvider: Excel / CSV, fully local and deterministic. */
export const excelLayoutProvider = {
  id: EXCEL_PROVIDER_ID,
  version: EXCEL_PROVIDER_VERSION,
  label: "Excel / CSV",
  accepts: (fileName) => /\.(xlsx|xlsm|csv)$/i.test(String(fileName || "")),
  async extract(file, context) {
    const read = await readUploadedFile(file);
    const result = parseAttendanceGrids(read.sheets, context);
    return { ...result, file: { name: file.name, size: read.size, sha256: read.sha256, kind: read.kind } };
  },
};
