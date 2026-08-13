/**
 * Offer of Employment Engagement letter — fills dynamic placeholders in the
 * Word template while keeping fixed clauses (3–14) identical to the sample.
 */
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import { normalizeToIsoDate } from "../utils/dateDisplay";
import { amountInWords } from "./amountInWords";

export { amountInWords } from "./amountInWords";

export const OFFER_LETTER_TEMPLATE_PATH = "/templates/hr-calling/offer-of-employment.docx";

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
  // Prefer leading acronym-like token (letters/digits before space or punctuation).
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

/**
 * Build placeholder map for the offer letter template.
 * @param {object} offer
 */
export function buildOfferLetterPlaceholders(offer) {
  const offerDateIso = normalizeToIsoDate(offer?.offerDate) || normalizeToIsoDate(new Date());
  const joiningIso = normalizeToIsoDate(offer?.joiningDate) || "";
  const dutyDays = String(offer?.dutyPattern || "").trim() === "27" ? "27" : "26";
  const salutation = String(offer?.salutation || "Mr.").trim() || "Mr.";
  const salaryNum = formatSalaryNumber(offer?.salaryGross);
  const salaryWords = amountInWords(offer?.salaryGross);

  return {
    "{{REF_NO}}": String(offer?.referenceNo || "").trim(),
    "{{OFFER_DATE}}": formatOfferDateLong(offerDateIso),
    "{{SALUTATION}}": salutation,
    "{{CANDIDATE_NAME}}": String(offer?.candidateName || "").trim(),
    "{{FATHER_NAME}}": String(offer?.fatherName || "").trim(),
    "{{EMP_CODE}}": String(offer?.employeeCode || "").trim(),
    "{{ADDRESS_LINE}}": String(offer?.addressLine || "").trim(),
    "{{DISTRICT}}": String(offer?.addressDistrict || "").trim(),
    "{{STATE}}": String(offer?.addressState || "").trim(),
    "{{PINCODE}}": String(offer?.addressPincode || "").trim(),
    "{{DESIGNATION}}": String(offer?.designation || "").trim(),
    "{{JOINING_DATE}}": formatOfferDateDdMmYyyy(joiningIso),
    "{{SITE_FULL}}": String(offer?.siteFullName || "").trim(),
    "{{SALARY_NUM}}": salaryNum,
    "{{SALARY_WORDS}}": salaryWords,
    "{{DUTY_DAYS}}": dutyDays,
  };
}

function applyPlaceholdersToXml(xml, placeholders) {
  let out = String(xml || "");
  for (const [token, value] of Object.entries(placeholders)) {
    const escaped = escapeXmlText(value);
    // Placeholders may appear multiple times (name, salutation).
    out = out.split(token).join(escaped);
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
  const updatedXml = applyPlaceholdersToXml(documentXml, placeholders);
  zip.file("word/document.xml", updatedXml);

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
    h1 { font-size: 14pt; text-align: center; margin: 18px 0; }
    .meta { margin-bottom: 12px; }
    .clause { margin: 10px 0; }
    .muted { color: #444; }
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="meta"><strong>Ref No:</strong> ${escapeXmlText(p["{{REF_NO}}"])}</div>
  <div class="meta"><strong>Date:</strong> ${escapeXmlText(p["{{OFFER_DATE}}"])}</div>
  <p>To,<br/>
  ${escapeXmlText(p["{{SALUTATION}}"])} ${escapeXmlText(p["{{CANDIDATE_NAME}}"])}<br/>
  S/O. ${escapeXmlText(p["{{FATHER_NAME}}"])}<br/>
  Emp Code: ${escapeXmlText(p["{{EMP_CODE}}"])}<br/>
  Address: ${escapeXmlText(p["{{ADDRESS_LINE}}"])}<br/>
  Dist: ${escapeXmlText(p["{{DISTRICT}}"])}, ${escapeXmlText(p["{{STATE}}"])}-${escapeXmlText(p["{{PINCODE}}"])}
  </p>
  <h1>Sub: Appointment Letter</h1>
  <p>Dear ${escapeXmlText(p["{{SALUTATION}}"])} ${escapeXmlText(p["{{CANDIDATE_NAME}}"])},</p>
  <p>With reference to your application and subsequent interview with us, we are pleased to appoint you as
  <strong>${escapeXmlText(p["{{DESIGNATION}}"])}</strong> on a purely contractual basis under IFSPL for specified period.
  You will not have any right or lien on the job held by you.</p>
  <p class="clause"><strong>1. Nature of Appointment</strong><br/>
  Date of Joining: ${escapeXmlText(p["{{JOINING_DATE}}"])}<br/>
  Site Name and Location: ${escapeXmlText(p["{{SITE_FULL}}"])}<br/>
  Your employment with IFSPL shall commence from the date you report for duty at the site.</p>
  <p class="clause"><strong>2. Salary and Benefits:</strong> Gross salary: Rs. ${escapeXmlText(p["{{SALARY_NUM}}"])}/-
  (Rs. ${escapeXmlText(p["{{SALARY_WORDS}}"])} Only) per month.
  (Basic salary, HRA, Leave wages, Fire Risk Allowance and Other allowances)<br/>
  Statutory Deduction: Provident Fund (12% of Basic and DA – employee share) and other applicable deduction will be made as per law.<br/>
  Duty Pattern: 8-hour shift for ${escapeXmlText(p["{{DUTY_DAYS}}"])} days a month.</p>
  <p class="muted">Clauses 3–14 match the standard Offer of Employment Engagement letter (duties, discipline, benefits, leave, separation, etc.). Download the Word document for the full formatted letter.</p>
  <p>We welcome you to our organization and look forward to your valuable contribution to the company’s success.</p>
  <p><br/>Authorized Signature:</p>
  <p>Please sign and return a copy of this letter as a token of your acceptance of the terms and conditions stated herein.</p>
  <p>Signature: __________________________<br/>
  Name: ${escapeXmlText(p["{{SALUTATION}}"])} ${escapeXmlText(p["{{CANDIDATE_NAME}}"])}<br/>
  Date: ______________________________</p>
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
