/**
 * Parse a compliance workbook. Every worksheet is read (PF + ESIC in one file),
 * then UAN and ESIC IP are merged by employee code (name as fallback).
 */

import * as XLSX from "xlsx";
import { applyEpfDerived } from "./complianceEpf";
import { sanitizeIpName } from "./complianceEsic";

export function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

export function normalizeEmpCode(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^0+(?=\d)/, "")
    .toUpperCase();
}

function normalizeName(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(v) {
  return normalizeName(v)
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Real employee codes contain a digit and are not site/category labels or UAN/IP. */
export function looksLikeEmployeeCode(v) {
  const s = String(v ?? "").trim();
  if (!s || s.length > 16 || /\s/.test(s)) return false;
  if (!/\d/.test(s)) return false;
  const d = digitsOnly(s);
  if (d.length === 10 || d.length === 12) return false;
  return /^\d{1,8}$/.test(s) || /^[A-Za-z]{1,8}[-_.]?\d+$/.test(s) || /^[A-Za-z0-9]+[-_][A-Za-z0-9]+$/.test(s);
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 4;
  if (na.replace(/\s/g, "") === nb.replace(/\s/g, "")) return 3;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length < 2 || tb.length < 2) return 0;
  const sa = [...ta].sort().join(" ");
  const sb = [...tb].sort().join(" ");
  if (sa === sb) return 3;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.every((t) => long.includes(t))) return 2;
  return 0;
}

function normalizeHeader(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellToString(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const d = String(value.getDate()).padStart(2, "0");
      const m = String(value.getMonth() + 1).padStart(2, "0");
      return `${d}/${m}/${value.getFullYear()}`;
    }
    if (value.v != null) return cellToString(value.v);
    if (value.result != null) return cellToString(value.result);
    if (value.w != null && String(value.w).trim()) return String(value.w).trim();
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text || "").join("");
    if (value.text != null) return String(value.text).trim();
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value));
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim();
}

/**
 * @returns {"employeeCode"|"uan"|"ipNumber"|"name"|"daysPaid"|"wages"|"reasonCode"|"lastWorkingDay"|null}
 */
function classifyHeader(raw) {
  const n = normalizeHeader(raw);
  if (!n) return null;
  if (n.includes("reason")) return "reasonCode";
  if (n.includes("last working")) return "lastWorkingDay";
  if (n.includes("pf number") || n === "pf no" || n === "pf") return null;
  if (
    n.includes("employee code") ||
    n.includes("emp code") ||
    n.includes("empcode") ||
    n === "code" ||
    n === "emp id" ||
    n.includes("employee id")
  ) {
    return "employeeCode";
  }
  if (
    n === "uan" ||
    n.startsWith("uan ") ||
    n.includes("uan no") ||
    n.includes("uan number") ||
    n === "uan details"
  ) {
    return "uan";
  }
  if (
    n.includes("ip number") ||
    n.includes("ip no") ||
    n.includes("esic id") ||
    n.includes("esic no") ||
    n.includes("esic number") ||
    n.includes("insured person") ||
    n === "esic" ||
    n === "ip"
  ) {
    return "ipNumber";
  }
  if (
    n.includes("name of workman") ||
    n.includes("ip name") ||
    n.includes("name of employee") ||
    n.includes("name of workman") ||
    n === "name" ||
    n === "employee" ||
    n === "workman"
  ) {
    return "name";
  }
  if (n.includes("no of days") || n.includes("days paid") || n.includes("days for which") || n === "days") {
    return "daysPaid";
  }
  if (n.includes("total monthly wages") || n.includes("monthly wages") || n.includes("gross wages")) {
    return "wages";
  }
  return null;
}

function scoreHeaderRow(cells = []) {
  const kinds = new Set();
  for (const cell of cells) {
    const kind = classifyHeader(cell);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

function findHeaderRow(matrix = []) {
  let best = { index: -1, kinds: new Set() };
  const limit = Math.min(matrix.length, 30);
  for (let i = 0; i < limit; i += 1) {
    const kinds = scoreHeaderRow(matrix[i] || []);
    if (kinds.size > best.kinds.size) best = { index: i, kinds };
  }
  const hasId = best.kinds.has("uan") || best.kinds.has("ipNumber");
  const hasKey = best.kinds.has("employeeCode") || best.kinds.has("name");
  if (best.index < 0 || !hasId || !hasKey) return best.index >= 0 ? best : null;
  return best;
}

function pickInferredCol(counts, usedCols, pred) {
  let best = -1;
  let bestScore = 0;
  for (let c = 0; c < counts.length; c += 1) {
    if (usedCols.has(c) || counts[c].n < 3) continue;
    const score = pred(counts[c]);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.55 ? best : -1;
}

/** Fill missing UAN / IP / employee-code columns from cell shapes when headers are weak. */
function inferMissingColumns(matrix, headerIndex, colMap) {
  const start = Math.max(0, headerIndex + 1);
  const sample = matrix.slice(start, start + 40);
  const colCount = Math.max(
    (matrix[headerIndex] || []).length,
    ...sample.map((row) => (row || []).length),
    0
  );
  const counts = Array.from({ length: colCount }, () => ({
    uan: 0,
    ip: 0,
    code: 0,
    name: 0,
    days: 0,
    n: 0,
  }));

  for (const line of sample) {
    for (let c = 0; c < colCount; c += 1) {
      const raw = cellToString(line?.[c]);
      if (!raw) continue;
      const bucket = counts[c];
      bucket.n += 1;
      const d = digitsOnly(raw);
      if (d.length === 12) bucket.uan += 1;
      else if (d.length === 10) bucket.ip += 1;
      else if (/^[A-Za-z][A-Za-z\s.']+$/.test(raw) && raw.replace(/\s/g, "").length >= 3) {
        bucket.name += 1;
      } else if (d && Number(d) >= 0 && Number(d) <= 31 && d.length <= 2) {
        bucket.days += 1;
      } else if (/^[A-Za-z0-9][A-Za-z0-9\-_\/]*$/.test(raw) && d.length < 10 && raw.length <= 16) {
        bucket.code += 1;
      }
    }
  }

  const usedCols = new Set(colMap.values());
  const assign = (kind, pred) => {
    if (colMap.has(kind)) return;
    const col = pickInferredCol(counts, usedCols, pred);
    if (col < 0) return;
    colMap.set(kind, col);
    usedCols.add(col);
  };

  assign("uan", (x) => x.uan / x.n);
  assign("ipNumber", (x) => x.ip / x.n);
  assign("employeeCode", (x) => (x.days / x.n > 0.5 ? 0 : x.code / x.n));
  assign("name", (x) => x.name / x.n);
  return colMap;
}

function betterDigits(current, incoming, exactLen) {
  const a = digitsOnly(current);
  const b = digitsOnly(incoming);
  if (b.length === exactLen) return b;
  if (a.length === exactLen) return a;
  return b || a;
}

function mergeEntry(target, incoming) {
  const out = { ...target };
  if (incoming.employeeCode && !out.employeeCode) out.employeeCode = incoming.employeeCode;
  if (incoming.name && (!out.name || incoming.name.length > out.name.length)) out.name = incoming.name;
  if (incoming.uan) out.uan = betterDigits(out.uan, incoming.uan, 12);
  if (incoming.ipNumber) out.ipNumber = betterDigits(out.ipNumber, incoming.ipNumber, 10);
  if (incoming.daysPaid != null && incoming.daysPaid !== "") out.daysPaid = incoming.daysPaid;
  if (incoming.wages != null && incoming.wages !== "") out.wages = incoming.wages;
  if (incoming.reasonCode != null && incoming.reasonCode !== "") out.reasonCode = incoming.reasonCode;
  if (incoming.lastWorkingDay) out.lastWorkingDay = incoming.lastWorkingDay;
  if (incoming.sheetName) {
    const prev = out.sheetNames || (out.sheetName ? [out.sheetName] : []);
    if (!prev.includes(incoming.sheetName)) out.sheetNames = [...prev, incoming.sheetName];
  }
  return out;
}

function parseSheetMatrix(matrix, sheetName) {
  if (!matrix?.length) {
    return { rows: [], headerIndex: -1, kinds: [], skipped: "empty" };
  }
  const header = findHeaderRow(matrix);
  const headerIndex = header?.index ?? 0;
  const colMap = inferMissingColumns(matrix, headerIndex, (() => {
    const map = new Map();
    (matrix[headerIndex] || []).forEach((cell, col) => {
      const kind = classifyHeader(cell);
      if (kind && !map.has(kind)) map.set(kind, col);
    });
    return map;
  })());

  const hasId = colMap.has("uan") || colMap.has("ipNumber");
  const hasKey = colMap.has("employeeCode") || colMap.has("name");
  if (!hasId || !hasKey) {
    return {
      rows: [],
      headerIndex,
      kinds: [...colMap.keys()],
      skipped: "no UAN/IP + employee code/name columns",
    };
  }

  const rows = [];
  for (let r = headerIndex + 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    if (!line.some((c) => cellToString(c))) continue;
    if (scoreHeaderRow(line).size >= 3) continue;

    const get = (kind) => {
      const col = colMap.get(kind);
      if (col == null) return "";
      return cellToString(line[col]);
    };

    const codeRaw = get("employeeCode");
    const name = get("name");
    let uan = digitsOnly(get("uan")).slice(0, 12);
    let ipNumber = digitsOnly(get("ipNumber")).slice(0, 10);
    let code = looksLikeEmployeeCode(codeRaw) ? String(codeRaw).trim() : "";

    const mappedCols = new Set([...colMap.values()]);
    for (let c = 0; c < line.length; c += 1) {
      if (mappedCols.has(c)) continue;
      const raw = cellToString(line[c]);
      if (!raw) continue;
      const d = digitsOnly(raw);
      if (!uan && d.length === 12) uan = d;
      else if (!ipNumber && d.length === 10) ipNumber = d;
      else if (!code && looksLikeEmployeeCode(raw)) code = String(raw).trim();
    }

    const daysRaw = get("daysPaid");
    const wagesRaw = get("wages");
    if (!code && !name && !uan && !ipNumber) continue;
    if (!uan && !ipNumber) continue;

    const daysNum = daysRaw === "" ? null : Number(daysRaw);
    const wagesNum = wagesRaw === "" ? null : Number(String(wagesRaw).replace(/,/g, ""));

    rows.push({
      sheetName,
      employeeCode: code,
      name,
      uan,
      ipNumber,
      daysPaid: Number.isFinite(daysNum) ? daysNum : null,
      wages: Number.isFinite(wagesNum) ? wagesNum : null,
      reasonCode: get("reasonCode"),
      lastWorkingDay: get("lastWorkingDay"),
    });
  }

  return {
    rows,
    headerIndex,
    kinds: [...colMap.keys()],
    skipped: rows.length ? "" : "no data rows",
  };
}

function sheetToMatrix(sheet) {
  if (!sheet) return [];
  if (!sheet["!ref"]) {
    const addrs = Object.keys(sheet).filter((k) => k && !k.startsWith("!"));
    if (!addrs.length) return [];
    let minR = Infinity;
    let minC = Infinity;
    let maxR = 0;
    let maxC = 0;
    for (const addr of addrs) {
      const pos = XLSX.utils.decode_cell(addr);
      if (pos.r < minR) minR = pos.r;
      if (pos.c < minC) minC = pos.c;
      if (pos.r > maxR) maxR = pos.r;
      if (pos.c > maxC) maxC = pos.c;
    }
    if (!Number.isFinite(minR)) return [];
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: minR, c: minC }, e: { r: maxR, c: maxC } });
  }
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  });
}

function putMerged(map, key, row) {
  if (!key) return;
  map.set(key, mergeEntry(map.get(key) || {}, row));
}

/**
 * After all sheets are read, join PF UAN + ESIC IP onto the same employee.
 * Employee code is primary; same name links a sheet that omitted the code.
 */
function buildMergedMaps(entries) {
  const byCode = new Map();
  const byName = new Map();

  for (const row of entries) {
    if (looksLikeEmployeeCode(row.employeeCode)) {
      putMerged(byCode, normalizeEmpCode(row.employeeCode), row);
    }
    const nk = normalizeName(row.name);
    if (nk) putMerged(byName, nk, row);
  }

  for (const named of byName.values()) {
    if (looksLikeEmployeeCode(named.employeeCode)) {
      putMerged(byCode, normalizeEmpCode(named.employeeCode), named);
    }
  }

  for (const [codeKey, coded] of byCode) {
    const nk = normalizeName(coded.name);
    if (!nk || !byName.has(nk)) continue;
    const merged = mergeEntry(coded, byName.get(nk));
    byCode.set(codeKey, merged);
    byName.set(nk, mergeEntry(byName.get(nk), merged));
  }

  return { byCode, byName };
}

/**
 * @returns {{
 *   fileName: string,
 *   sheetCount: number,
 *   sheetNames: string[],
 *   sheetReports: object[],
 *   entries: object[],
 *   byCode: Map<string, object>,
 *   byName: Map<string, object>,
 * }}
 */
export function mergeParsedWorkbooks(list = []) {
  const parts = (list || []).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const entries = parts.flatMap((p) => p.entries || []);
  const sheetReports = parts.flatMap((p) =>
    (p.sheetReports || []).map((s) => ({
      ...s,
      name: p.fileName && s.name && !String(s.name).includes(p.fileName) ? `${s.name}` : s.name,
      fileName: p.fileName,
    }))
  );
  const { byCode, byName } = buildMergedMaps(entries);
  const fileNames = [...new Set(parts.map((p) => p.fileName).filter(Boolean))];
  const sheetNames = parts.flatMap((p) => p.sheetNames || []);
  return {
    fileName: fileNames.join(" + "),
    sheetCount: sheetReports.length || parts.reduce((n, p) => n + (p.sheetCount || 0), 0),
    sheetNames,
    sheetReports,
    entries,
    byCode,
    byName,
  };
}

export async function parseComplianceWorkbooks(files = []) {
  const list = [];
  for (const file of files) {
    if (!file) continue;
    list.push(await parseComplianceWorkbook(file));
  }
  return mergeParsedWorkbooks(list);
}

export async function parseComplianceWorkbook(file) {
  if (!file) throw new Error("Choose an Excel file to upload.");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const entries = [];
  const sheetReports = [];
  const sheetNames = [];

  for (const sheetName of wb.SheetNames || []) {
    const sheet = wb.Sheets[sheetName];
    const matrix = sheetToMatrix(sheet);
    if (!matrix.length) {
      sheetReports.push({
        name: sheetName,
        rows: 0,
        uan: 0,
        ip: 0,
        skipped: "empty or chart sheet",
      });
      continue;
    }
    sheetNames.push(sheetName);
    const parsed = parseSheetMatrix(matrix, sheetName);
    entries.push(...parsed.rows);
    sheetReports.push({
      name: sheetName,
      rows: parsed.rows.length,
      uan: parsed.rows.filter((r) => digitsOnly(r.uan).length === 12).length,
      ip: parsed.rows.filter((r) => digitsOnly(r.ipNumber).length === 10).length,
      kinds: parsed.kinds,
      skipped: parsed.skipped,
    });
  }

  const { byCode, byName } = buildMergedMaps(entries);

  return {
    fileName: file.name || "workbook.xlsx",
    sheetCount: (wb.SheetNames || []).length,
    sheetNames,
    sheetReports,
    entries,
    byCode,
    byName,
  };
}

function lookupParsed(row, parsed) {
  const parts = [];
  const codeKey = normalizeEmpCode(row.employeeCode);
  if (codeKey && parsed.byCode?.has(codeKey)) parts.push(parsed.byCode.get(codeKey));
  const idKey = normalizeEmpCode(row.employeeId);
  if (idKey && idKey !== codeKey && parsed.byCode?.has(idKey)) parts.push(parsed.byCode.get(idKey));

  const targetName = row.name || row.ipName || "";
  const nameKey = normalizeName(targetName);
  if (nameKey && parsed.byName?.has(nameKey)) parts.push(parsed.byName.get(nameKey));

  let best = null;
  let bestScore = 0;
  for (const entry of parsed.entries || []) {
    const score = namesMatch(targetName, entry.name);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (best) parts.push(best);

  if (!parts.length) return null;
  return parts.reduce((acc, part) => mergeEntry(acc, part), {});
}

function uanFromHit(hit) {
  const uan = digitsOnly(hit?.uan);
  return uan.length === 12 ? uan : uan || "";
}

function ipFromHit(hit) {
  const ip = digitsOnly(hit?.ipNumber);
  return ip.length === 10 ? ip : ip || "";
}

/**
 * Fill UAN / ESIC IP on processed employees from the uploaded workbook.
 * Excel IDs win when present; blank Excel cells do not clear existing IDs.
 */
export function applyComplianceWorkbookToRows({ epfRows = [], esicRows = [], parsed } = {}) {
  if (!parsed) {
    return {
      epfRows,
      esicRows,
      summary: emptySummary(),
    };
  }

  let matched = 0;
  let uanFilled = 0;
  let esicFilled = 0;
  const matchedCodes = new Set();

  const nextEpf = (epfRows || []).map((row) => {
    const hit = lookupParsed(row, parsed);
    if (!hit) return row;
    matched += 1;
    matchedCodes.add(normalizeEmpCode(row.employeeCode));
    matchedCodes.add(normalizeEmpCode(row.employeeId));
    matchedCodes.add(normalizeEmpCode(hit.employeeCode));
    const nk = normalizeName(row.name);
    if (nk) matchedCodes.add(`n:${nk}`);
    const uan = uanFromHit(hit);
    let next = row;
    if (uan && uan !== digitsOnly(row.uan)) {
      next = { ...row, uan };
      uanFilled += 1;
    }
    return applyEpfDerived(next);
  });

  const esicByMaster = new Map((esicRows || []).map((r) => [String(r.employeeMasterId), r]));

  const nextEsic = (esicRows || []).map((row) => {
    const hit = lookupParsed(row, parsed);
    if (!hit) return row;
    matchedCodes.add(normalizeEmpCode(row.employeeCode));
    matchedCodes.add(normalizeEmpCode(row.employeeId));
    matchedCodes.add(normalizeEmpCode(hit.employeeCode));
    const nk = normalizeName(row.ipName || row.name);
    if (nk) matchedCodes.add(`n:${nk}`);
    const ip = ipFromHit(hit);
    const patch = {};
    if (ip && ip !== digitsOnly(row.ipNumber)) {
      patch.ipNumber = ip;
      esicFilled += 1;
    }
    if (hit.daysPaid != null) patch.daysPaid = hit.daysPaid;
    if (hit.wages != null) patch.monthlyWages = hit.wages;
    if (hit.reasonCode != null && hit.reasonCode !== "") patch.reasonCode = hit.reasonCode;
    if (hit.lastWorkingDay) patch.lastWorkingDay = hit.lastWorkingDay;
    if (!Object.keys(patch).length) return row;
    return { ...row, ...patch };
  });

  for (const epf of nextEpf) {
    const hit = lookupParsed(epf, parsed);
    const ip = ipFromHit(hit);
    if (!ip || epf.employeeMasterId == null) continue;
    const key = String(epf.employeeMasterId);
    if (esicByMaster.has(key)) continue;
    const added = {
      id: `esic_${epf.employeeMasterId}`,
      employeeMasterId: epf.employeeMasterId,
      lineId: epf.lineId || null,
      employeeCode: epf.employeeCode,
      employeeId: epf.employeeId || "",
      ipNumber: ip,
      ipName: sanitizeIpName(epf.name) || epf.name,
      daysPaid: hit.daysPaid != null ? hit.daysPaid : Number(epf.presentDays) || 0,
      monthlyWages: hit.wages != null ? hit.wages : Number(epf.grossWages) || 0,
      reasonCode: hit.reasonCode || "",
      lastWorkingDay: hit.lastWorkingDay || "",
      reasonNote: "",
    };
    nextEsic.push(added);
    esicByMaster.set(key, added);
    esicFilled += 1;
  }

  nextEsic.sort((a, b) =>
    String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { numeric: true })
  );

  const unusedPeople = (parsed.entries || []).filter((entry) => {
    const code = looksLikeEmployeeCode(entry.employeeCode) ? normalizeEmpCode(entry.employeeCode) : "";
    const name = normalizeName(entry.name);
    if (code && matchedCodes.has(code)) return false;
    if (name && matchedCodes.has(`n:${name}`)) return false;
    return true;
  }).length;

  return {
    epfRows: nextEpf,
    esicRows: nextEsic,
    summary: {
      sheetRows: parsed.entries.length,
      sheetCount: parsed.sheetCount || parsed.sheetReports?.length || 0,
      sheetNames: parsed.sheetNames || [],
      sheetReports: parsed.sheetReports || [],
      mappedCodes: parsed.byCode.size,
      matched,
      uanFilled,
      esicFilled,
      unusedSheetCodes: [],
      unusedSheetCount: unusedPeople,
      fileName: parsed.fileName,
    },
  };
}

function emptySummary() {
  return {
    sheetRows: 0,
    sheetCount: 0,
    sheetNames: [],
    sheetReports: [],
    mappedCodes: 0,
    matched: 0,
    uanFilled: 0,
    esicFilled: 0,
    unusedSheetCodes: [],
    unusedSheetCount: 0,
    fileName: "",
  };
}

export function formatImportSummary(summary, { epfCount = 0, esicCount = 0 } = {}) {
  if (!summary) return "";
  const reports = summary.sheetReports || [];
  const readSheets = reports.filter((s) => s.rows > 0);
  const sheetBit =
    summary.sheetCount > 1
      ? `Read ${summary.sheetCount} sheets` +
        (readSheets.length
          ? ` (${readSheets
              .map((s) => {
                const bits = [];
                if (s.uan) bits.push(`${s.uan} UAN`);
                if (s.ip) bits.push(`${s.ip} IP`);
                return `${s.name}${bits.length ? `: ${bits.join(", ")}` : ""}`;
              })
              .join(" · ")})`
          : "") +
        "."
      : `Read ${summary.fileName || "the workbook"}.`;

  const parts = [
    sheetBit,
    `Matched ${summary.matched} processed employee${summary.matched === 1 ? "" : "s"}.`,
  ];
  if (summary.uanFilled) {
    parts.push(
      `Filled ${summary.uanFilled} UAN number${summary.uanFilled === 1 ? "" : "s"} on PF / EPF (${epfCount} listed).`
    );
  }
  if (summary.esicFilled) {
    parts.push(
      `Filled ${summary.esicFilled} ESIC IP number${summary.esicFilled === 1 ? "" : "s"} (${esicCount} listed).`
    );
  }
  const uanRows = reports.reduce((n, s) => n + (Number(s.uan) || 0), 0);
  const ipRows = reports.reduce((n, s) => n + (Number(s.ip) || 0), 0);
  if (ipRows && !uanRows) {
    parts.push("This upload had ESIC IP only. Also select the PF challan file (sheets with UAN and employee code) to fill UAN.");
  } else if (uanRows && !ipRows) {
    parts.push("This upload had UAN only. Also select the ESIC return file to fill IP numbers.");
  }
  if (summary.unusedSheetCount) {
    parts.push(
      `${summary.unusedSheetCount} extra people in the Excel are not on this month’s processed list — their IDs are still saved on the employee record when the code matches.`
    );
  }
  return parts.join(" ");
}
