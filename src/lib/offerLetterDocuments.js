/**
 * IFSPL Offer of Employment letter — fills the Word template (letterhead + HR signature).
 */
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import { normalizeToIsoDate } from "../utils/dateDisplay";
import { amountInWords } from "./amountInWords";

export { amountInWords } from "./amountInWords";

export const OFFER_LETTER_TEMPLATE_PATH = "/templates/hr-calling/offer-of-employment.docx";

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

function escapeXmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pad2(n) {
  return String(n).padStart(2, "0");
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

function parseIsoParts(iso) {
  const normalized = normalizeToIsoDate(iso);
  if (!normalized) return null;
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

/** e.g. 21st January 2026 */
export function formatOfferDateLong(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  return `${p.day}${ordinalSuffix(p.day)} ${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** e.g. 21st Oct 2026 (double space after day, matching IFSPL sample) */
export function formatOfferDateShortMonth(iso, { doubleSpace = true } = {}) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  const gap = doubleSpace ? "  " : " ";
  return `${p.day}${ordinalSuffix(p.day)}${gap}${MONTH_NAMES_SHORT[p.month - 1]} ${p.year}`;
}

/** e.g. 21st Nov 2026 */
export function formatOfferDateAbbrev(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  return `${p.day}${ordinalSuffix(p.day)} ${MONTH_NAMES_SHORT[p.month - 1]} ${p.year}`;
}

/** e.g. 21-01-2026 */
export function formatOfferDateDdMmYyyy(iso) {
  const p = parseIsoParts(iso);
  if (!p) return "";
  return `${pad2(p.day)}-${pad2(p.month)}-${p.year}`;
}

/** Whole-rupee display without decimals when not needed (16000). */
export function formatSalaryNumber(amount) {
  const raw = Number(amount);
  if (!Number.isFinite(raw)) return "";
  if (Number.isInteger(raw)) return String(raw);
  return String(Math.round(raw * 100) / 100);
}

export function sanitizeOfferFileNamePart(value) {
  return String(value || "Candidate")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function deriveSiteCodeFromName(siteName) {
  const raw = String(siteName || "").trim();
  if (!raw) return "";
  const first = raw.split(/[\s,/(-]+/)[0] || "";
  const cleaned = first.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length >= 2 && cleaned.length <= 12) return cleaned;
  const initials = raw
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return (initials || cleaned).slice(0, 12);
}

/** Phrase after designation, without a leading space (space is kept on designation). */
function departmentClause(department) {
  const raw = String(department || "").trim();
  if (!raw) return "";
  if (/department$/i.test(raw)) return `in the ${raw}`;
  return `in the ${raw} Department`;
}

/**
 * Build placeholder map for the IFSPL offer letter template.
 * @param {object} offer
 */
export function buildOfferLetterPlaceholders(offer) {
  const offerDateIso = normalizeToIsoDate(offer?.offerDate) || normalizeToIsoDate(new Date());
  const joiningIso = normalizeToIsoDate(offer?.joiningDate) || "";
  const validIso = normalizeToIsoDate(offer?.validUntil) || offerDateIso;
  const designation = String(offer?.designation || "").trim();
  const deptClause = departmentClause(offer?.department || offer?.departmentName);

  return {
    "{{OFFER_DATE}}": formatOfferDateShortMonth(offerDateIso),
    "{{CANDIDATE_NAME}}": String(offer?.candidateName || "").trim(),
    // Trailing space kept via xml:space=preserve so Word shows "Executive in the …"
    "{{DESIGNATION}}": deptClause ? `${designation} ` : designation,
    "{{DEPARTMENT_CLAUSE}}": deptClause,
    "{{COMPANY_NAME}}": String(offer?.companyName || "INDUS FIRE SAFETY PVT LTD").trim(),
    "{{JOINING_DATE_LONG}}": formatOfferDateLong(joiningIso),
    "{{LOCATION}}": String(offer?.siteFullName || offer?.location || "").trim(),
    "{{VALID_UNTIL}}": formatOfferDateShortMonth(validIso, { doubleSpace: false }),
    "{{JOINING_DATE_SHORT}}": formatOfferDateAbbrev(joiningIso),
    "{{JOINING_DATE_DDMMYYYY}}": formatOfferDateDdMmYyyy(joiningIso),
  };
}

/** Word drops leading/trailing spaces in <w:t> unless xml:space="preserve". */
function applyPlaceholdersToXml(xml, placeholders) {
  let out = String(xml || "");
  for (const [token, value] of Object.entries(placeholders)) {
    const raw = String(value ?? "");
    if (/^\s|\s$/.test(raw)) {
      out = out.replace(/<w:t([^>]*)>((?:(?!<\/w:t>)[\s\S])*?)<\/w:t>/g, (match, attrs, text) => {
        if (!text.includes(token)) return match;
        const nextAttrs = /\bxml:space=/.test(attrs)
          ? attrs.replace(/\bxml:space="[^"]*"/, 'xml:space="preserve"')
          : `${attrs} xml:space="preserve"`;
        return `<w:t${nextAttrs}>${text}</w:t>`;
      });
    }
    out = out.split(token).join(escapeXmlText(raw));
  }
  return out;
}

async function fetchTemplateArrayBuffer(templatePath) {
  const res = await fetch(templatePath);
  if (!res.ok) {
    throw new Error(`Could not load offer letter template (${res.status}).`);
  }
  return res.arrayBuffer();
}

/**
 * Generate the offer letter DOCX blob (does not download).
 */
export async function buildOfferLetterBlob(offer) {
  const buffer = await fetchTemplateArrayBuffer(OFFER_LETTER_TEMPLATE_PATH);
  const zip = new PizZip(buffer);
  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml) {
    throw new Error("Invalid offer letter template.");
  }

  const placeholders = buildOfferLetterPlaceholders(offer);
  zip.file("word/document.xml", applyPlaceholdersToXml(documentXml, placeholders));

  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

export function offerLetterFileName(offer) {
  const name = sanitizeOfferFileNamePart(offer?.candidateName);
  const code = sanitizeOfferFileNamePart(offer?.employeeCode || "offer");
  return `${name} - Offer Letter (${code}).docx`;
}

/** Build and download the offer letter Word document. */
export async function downloadOfferLetter(offer) {
  const blob = await buildOfferLetterBlob(offer);
  const fileName = offerLetterFileName(offer);
  saveAs(blob, fileName);
  return fileName;
}

/** Open a print-friendly HTML preview of the offer letter content. */
export function openOfferLetterPrintPreview(offer) {
  const p = buildOfferLetterPlaceholders(offer);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Offer Letter — ${escapeXmlText(p["{{CANDIDATE_NAME}}"])}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; color: #111; max-width: 720px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 13pt; margin: 14px 0; }
    .meta { margin-bottom: 8px; }
    table { border-collapse: collapse; margin: 12px 0; width: 100%; max-width: 420px; }
    td { border: 1px solid #333; padding: 6px 10px; vertical-align: top; }
    td:first-child { font-weight: bold; width: 40%; }
    .accept { margin-top: 28px; }
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="meta"><strong>Date:</strong> ${escapeXmlText(p["{{OFFER_DATE}}"])}</div>
  <h1>Subject: Offer of Employment</h1>
  <p>Dear ${escapeXmlText(p["{{CANDIDATE_NAME}}"])},</p>
  <p>We are pleased to offer you the position of <strong>${escapeXmlText(p["{{DESIGNATION}}"])}</strong>${escapeXmlText(
    p["{{DEPARTMENT_CLAUSE}}"]
  )} at ${escapeXmlText(p["{{COMPANY_NAME}}"])}. Based on your interview and credentials, we believe you will be a valuable addition to our organization.</p>
  <table>
    <tr><td>Designation</td><td>${escapeXmlText(p["{{DESIGNATION}}"])}</td></tr>
    <tr><td>Date of Joining</td><td>${escapeXmlText(p["{{JOINING_DATE_LONG}}"])}</td></tr>
    <tr><td>Work Location</td><td>${escapeXmlText(p["{{LOCATION}}"])}</td></tr>
  </table>
  <p>This offer is subject to verification of your educational and employment documents, and satisfactory reference checks.</p>
  <p>Your detailed terms and conditions of employment will be shared in the Appointment Letter, which will be issued to you on the date of joining.</p>
  <p>You are requested to accept or decline within 24 hours from the date and time of issuance</p>
  <p>A detailed salary breakup is below as Annexure A.</p>
  <p>We look forward to having you with us.</p>
  <p>Yours sincerely,</p>
  <p><strong>Shilpa Thakur</strong><br/>Manager - Human Resources<br/>${escapeXmlText(p["{{COMPANY_NAME}}"])}</p>
  <div class="accept">
    <p><strong>I accept the offer and confirm that I will join on ${escapeXmlText(p["{{JOINING_DATE_DDMMYYYY}}"] || "[DD/MM/YYYY]")}</strong></p>
    <p>Name: ____________________</p>
    <p>Signature: ____________________</p>
    <p>Date: ____________</p>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to preview or print the offer letter.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
