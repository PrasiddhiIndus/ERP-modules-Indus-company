/**
 * Employee exit document generation — preserves original Word template formatting
 * by replacing only indexed w:t text runs with employee-specific values.
 */
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import { normalizeToIsoDate } from "../utils/dateDisplay";

const WT_RE = /<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t>/g;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const EXIT_DOCUMENT_TEMPLATES = {
  noDueCertificate: {
    path: "/templates/employee-exit/no-due-certificate.docx",
    label: "No Due Certificate",
    fileSuffix: "No Due Certificate",
  },
  experienceLetter: {
    path: "/templates/employee-exit/experience-letter.docx",
    label: "Experience Letter",
    fileSuffix: "Experience Letter",
  },
  relievingLetter: {
    path: "/templates/employee-exit/relieving-letter.docx",
    label: "Relieving Letter",
    fileSuffix: "Relieving Letter",
  },
};

const INACTIVE_STATUSES = new Set(["inactive", "left"]);

export function isInactiveEmployeeStatus(status) {
  return INACTIVE_STATUSES.has(String(status || "").trim().toLowerCase());
}

function parseIsoParts(iso) {
  const normalized = normalizeToIsoDate(iso);
  if (!normalized) return null;
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

function ordinalSuffix(day) {
  const n = Number(day);
  if (n >= 11 && n <= 13) return "th";
  const mod = n % 10;
  if (mod === 1) return "st";
  if (mod === 2) return "nd";
  if (mod === 3) return "rd";
  return "th";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** e.g. 01, 28 */
export function formatDayNumber(iso) {
  const p = parseIsoParts(iso);
  return p ? pad2(p.day) : "";
}

/** e.g. st, nd, th */
export function formatOrdinalSuffix(iso) {
  const p = parseIsoParts(iso);
  return p ? ordinalSuffix(p.day) : "";
}

/** e.g. " July 2025" (leading space preserved for templates) */
export function formatMonthYearSpaced(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  return ` ${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** e.g. "July" */
export function formatMonthName(iso) {
  const p = parseIsoParts(iso);
  return p ? MONTH_NAMES[p.month - 1] : "";
}

/** e.g. " 2026" (leading space) */
export function formatYearSpaced(iso) {
  const p = parseIsoParts(iso);
  return p ? ` ${p.year}` : "";
}

/** e.g. year only: "2026" */
export function formatYear(iso) {
  const p = parseIsoParts(iso);
  return p ? String(p.year) : "";
}

/** Dot-separated date parts for experience letter: 28, .07, .2026 */
export function formatDotDateParts(iso) {
  const p = parseIsoParts(iso);
  if (!p) return { day: "", month: "", year: "" };
  return {
    day: pad2(p.day),
    month: `.${pad2(p.month)}`,
    year: `.${p.year}`,
  };
}

/** Full ordinal date e.g. "28th July 2026" */
export function formatOrdinalDateLong(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  return `${pad2(p.day)}${ordinalSuffix(p.day)} ${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

function titlePrefix(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (g === "female") return { letter1: "M", letter2: "s", letter3: ". " };
  return { letter1: "M", letter2: "r", letter3: ". " };
}

function salutationPrefix(gender) {
  const g = String(gender || "").trim().toLowerCase();
  return g === "female" ? "s. " : "r. ";
}

function pronounSets(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (g === "female") {
    return {
      possessive: ["h", "er"],
      object: "er",
      subject: ["S", "he"],
      tenureHe: "she",
    };
  }
  return {
    possessive: ["h", "is"],
    object: "im",
    subject: ["H", "e"],
    tenureHe: "he",
  };
}

export function resolveEmployeeAddress(employee) {
  const full = String(employee?.full_address || "").trim();
  if (full) return full;
  return String(employee?.address || "").trim();
}

export function resolveResignationDate(employee) {
  return (
    normalizeToIsoDate(employee?.date_of_resignation) ||
    normalizeToIsoDate(employee?.status_changed_at) ||
    normalizeToIsoDate(employee?.date_of_leaving) ||
    ""
  );
}

export function resolveDocumentDate(employee) {
  return normalizeToIsoDate(new Date()) || normalizeToIsoDate(employee?.date_of_leaving) || "";
}

const DEFAULT_PLACE = "Vadodara";

/** Years, months, days between DOJ and DOL. */
export function calculateExperienceParts(dojIso, dolIso) {
  const start = parseIsoParts(dojIso);
  const end = parseIsoParts(dolIso);
  if (!start || !end) return { years: 0, months: 0, days: 0, label: "—" };

  const startDate = new Date(start.year, start.month - 1, start.day);
  const endDate = new Date(end.year, end.month - 1, end.day);
  if (endDate < startDate) {
    return { years: 0, months: 0, days: 0, label: "—" };
  }

  let years = endDate.getFullYear() - startDate.getFullYear();
  let months = endDate.getMonth() - startDate.getMonth();
  let days = endDate.getDate() - startDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];
  if (years > 0) parts.push(`${years} Year${years === 1 ? "" : "s"}`);
  if (months > 0) parts.push(`${months} Month${months === 1 ? "" : "s"}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} Day${days === 1 ? "" : "s"}`);

  return { years, months, days, label: parts.join(", ") };
}

function replaceWtNodeTexts(xml, replacementsByIndex) {
  let nodeIndex = 0;
  return xml.replace(WT_RE, (match, text) => {
    const current = nodeIndex;
    nodeIndex += 1;
    if (!Object.prototype.hasOwnProperty.call(replacementsByIndex, current)) {
      return match;
    }
    const newText = replacementsByIndex[current];
    const preserveSpace = /xml:space="preserve"/.test(match);
    const escaped = String(newText)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (preserveSpace) {
      return `<w:t xml:space="preserve">${escaped}</w:t>`;
    }
    return `<w:t>${escaped}</w:t>`;
  });
}

function buildCommonContext(employee, options = {}) {
  const doj = normalizeToIsoDate(employee?.date_of_joining);
  const dol = normalizeToIsoDate(employee?.date_of_leaving);
  const resignation = resolveResignationDate(employee);
  const documentDate = options.documentDate || resolveDocumentDate(employee);
  const place = String(employee?.location || options.place || DEFAULT_PLACE).trim() || DEFAULT_PLACE;
  const name = String(employee?.full_name || "").trim();
  const designation = String(employee?.designation || "").trim();
  const department = String(employee?.department || "").trim();
  const title = titlePrefix(employee?.gender);
  const pronouns = pronounSets(employee?.gender);
  const dotDol = formatDotDateParts(dol);

  return {
    doj,
    dol,
    resignation,
    documentDate,
    place,
    name,
    designation,
    department,
    title,
    pronouns,
    dotDol,
    address: resolveEmployeeAddress(employee),
  };
}

function buildNoDueReplacements(employee, options) {
  const ctx = buildCommonContext(employee, options);
  const title = ctx.title;

  return {
    2: title.letter1,
    3: title.letter2,
    4: title.letter3,
    5: ctx.name,
    7: ctx.address,
    9: ctx.designation,
    11: formatDayNumber(ctx.doj),
    12: formatOrdinalSuffix(ctx.doj),
    13: formatMonthYearSpaced(ctx.doj),
    15: formatDayNumber(ctx.resignation),
    16: formatOrdinalSuffix(ctx.resignation),
    18: formatMonthName(ctx.resignation),
    19: formatYearSpaced(ctx.resignation),
    21: formatDayNumber(ctx.dol),
    22: formatOrdinalSuffix(ctx.dol),
    24: formatMonthName(ctx.dol),
    25: formatYearSpaced(ctx.dol),
    27: ctx.name,
    39: ctx.name,
    41: `: ${ctx.place}`,
    43: `: ${formatOrdinalDateLong(ctx.documentDate)}`,
  };
}

function buildExperienceReplacements(employee, options) {
  const ctx = buildCommonContext(employee, options);
  const title = ctx.title;
  const p = ctx.pronouns;

  return {
    2: title.letter1,
    3: title.letter2,
    4: title.letter3,
    5: ctx.name,
    10: formatDayNumber(ctx.doj),
    11: formatOrdinalSuffix(ctx.doj),
    12: `${formatMonthYearSpaced(ctx.doj)} `,
    15: formatDayNumber(ctx.dol),
    16: formatOrdinalSuffix(ctx.dol),
    17: ` ${formatMonthName(ctx.dol)}`,
    19: formatYear(ctx.dol),
    22: p.possessive[0],
    23: p.possessive[1],
    24: ` tenure with us, ${p.tenureHe} was designated as`,
    26: ctx.designation,
    28: ctx.department,
    31: p.possessive[0],
    32: p.possessive[1],
    33: ` employment, we found h`,
    34: p.object,
    37: p.subject[0],
    38: p.subject[1],
    39: p.subject[0],
    40: `${p.subject[1]} has been relieved from the `,
    42: ctx.dotDol.day,
    43: ctx.dotDol.month,
    44: ctx.dotDol.year,
    47: p.possessive[0],
    48: p.object,
    56: ctx.place,
    57: `Date: ${formatOrdinalDateLong(ctx.documentDate)}`,
  };
}

function buildRelievingReplacements(employee, options) {
  const ctx = buildCommonContext(employee, options);

  return {
    2: salutationPrefix(employee?.gender),
    3: ctx.name,
    6: formatDayNumber(ctx.resignation),
    7: formatOrdinalSuffix(ctx.resignation),
    8: ` ${formatMonthName(ctx.resignation)}`,
    10: formatYear(ctx.resignation),
    17: formatDayNumber(ctx.dol),
    18: formatOrdinalSuffix(ctx.dol),
    19: formatMonthYearSpaced(ctx.dol),
    32: `Place: ${ctx.place}`,
    33: `Date: ${formatOrdinalDateLong(ctx.documentDate)}`,
  };
}

const REPLACEMENT_BUILDERS = {
  noDueCertificate: buildNoDueReplacements,
  experienceLetter: buildExperienceReplacements,
  relievingLetter: buildRelievingReplacements,
};

async function fetchTemplateArrayBuffer(templatePath) {
  const res = await fetch(templatePath);
  if (!res.ok) {
    throw new Error(`Could not load document template (${res.status}).`);
  }
  return res.arrayBuffer();
}

export function sanitizeFileNamePart(value) {
  return String(value || "Employee")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export async function generateExitDocument(documentKey, employee, options = {}) {
  const template = EXIT_DOCUMENT_TEMPLATES[documentKey];
  const buildReplacements = REPLACEMENT_BUILDERS[documentKey];
  if (!template || !buildReplacements) {
    throw new Error("Unknown document type.");
  }

  const buffer = await fetchTemplateArrayBuffer(template.path);
  const zip = new PizZip(buffer);
  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml) {
    throw new Error("Invalid Word template.");
  }

  const replacements = buildReplacements(employee, options);
  const updatedXml = replaceWtNodeTexts(documentXml, replacements);
  zip.file("word/document.xml", updatedXml);

  const blob = zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });

  const employeeName = sanitizeFileNamePart(employee?.full_name);
  const fileName = `${employeeName} - ${template.fileSuffix}.docx`;
  saveAs(blob, fileName);

  return fileName;
}

export async function generateAllExitDocuments(employee, options = {}) {
  const keys = Object.keys(EXIT_DOCUMENT_TEMPLATES);
  const generated = [];
  for (const key of keys) {
    const fileName = await generateExitDocument(key, employee, options);
    generated.push(fileName);
  }
  return generated;
}

export function mapInactiveEmployeeRow(row) {
  const doj = normalizeToIsoDate(row?.date_of_joining);
  const dol = normalizeToIsoDate(row?.date_of_leaving);
  const experience = calculateExperienceParts(doj, dol);

  return {
    ...row,
    date_of_joining: doj,
    date_of_leaving: dol,
    date_of_resignation: resolveResignationDate(row),
    experience_label: experience.label,
    experience_years: experience.years,
    experience_months: experience.months,
    experience_days: experience.days,
    display_address: resolveEmployeeAddress(row),
  };
}
