/**
 * Inter-Office Memo (new joiner) — fills placeholders in the Word template.
 */
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import { normalizeToIsoDate } from "../utils/dateDisplay";
import {
  formatOfferDateDdMmYyyy,
  formatOfferDateLong,
  sanitizeOfferFileNamePart,
} from "./offerLetterDocuments";

export const IOM_LETTER_TEMPLATE_PATH = "/templates/hr-calling/iom-new-joiner.docx";

export const DEFAULT_IOM_DEPARTMENTS = ["IT", "Admin", "Payroll", "Site", "Accounts"];

function escapeXmlText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeDepartments(value) {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = String(list)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(list) || !list.length) return [...DEFAULT_IOM_DEPARTMENTS];
  const cleaned = list.map((d) => String(d || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : [...DEFAULT_IOM_DEPARTMENTS];
}

export function buildIomLetterPlaceholders(iom) {
  const iomDateIso = normalizeToIsoDate(iom?.iomDate) || normalizeToIsoDate(new Date());
  const joiningIso =
    normalizeToIsoDate(iom?.actualJoiningDate) || normalizeToIsoDate(iom?.joiningDate) || "";
  const departments = normalizeDepartments(iom?.departments);

  return {
    "{{IOM_REF_NO}}": String(iom?.iomReferenceNo || "").trim(),
    "{{IOM_DATE}}": formatOfferDateLong(iomDateIso),
    "{{DEPARTMENTS}}": departments.join(", "),
    "{{SALUTATION}}": String(iom?.salutation || "Mr.").trim() || "Mr.",
    "{{CANDIDATE_NAME}}": String(iom?.candidateName || "").trim(),
    "{{FATHER_NAME}}": String(iom?.fatherName || "").trim(),
    "{{EMP_CODE}}": String(iom?.employeeCode || "").trim(),
    "{{DESIGNATION}}": String(iom?.designation || "").trim(),
    "{{JOINING_DATE}}": formatOfferDateDdMmYyyy(joiningIso),
    "{{SITE_FULL}}": String(iom?.siteFullName || "").trim(),
    "{{OFFER_REF_NO}}": String(iom?.offerReferenceNo || "").trim(),
  };
}

function applyPlaceholdersToXml(xml, placeholders) {
  let out = String(xml || "");
  for (const [token, value] of Object.entries(placeholders)) {
    out = out.split(token).join(escapeXmlText(value));
  }
  return out;
}

async function fetchTemplateArrayBuffer(templatePath) {
  const res = await fetch(templatePath);
  if (!res.ok) {
    throw new Error(`Could not load IOM template (${res.status}).`);
  }
  return res.arrayBuffer();
}

export async function buildIomLetterBlob(iom) {
  const buffer = await fetchTemplateArrayBuffer(IOM_LETTER_TEMPLATE_PATH);
  const zip = new PizZip(buffer);
  const documentXml = zip.file("word/document.xml")?.asText();
  if (!documentXml) {
    throw new Error("Invalid IOM template.");
  }

  const placeholders = buildIomLetterPlaceholders(iom);
  zip.file("word/document.xml", applyPlaceholdersToXml(documentXml, placeholders));

  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

export function iomLetterFileName(iom) {
  const name = sanitizeOfferFileNamePart(iom?.candidateName);
  const code = sanitizeOfferFileNamePart(iom?.employeeCode || "iom");
  return `${name} - IOM (${code}).docx`;
}

export async function downloadIomLetter(iom) {
  const blob = await buildIomLetterBlob(iom);
  const fileName = iomLetterFileName(iom);
  saveAs(blob, fileName);
  return fileName;
}

export function openIomLetterPrintPreview(iom) {
  const p = buildIomLetterPlaceholders(iom);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>IOM — ${escapeXmlText(p["{{CANDIDATE_NAME}}"])}</title>
  <style>
    body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.45; color: #111; max-width: 720px; margin: 24px auto; padding: 0 16px; }
    h1 { font-size: 14pt; text-align: center; margin: 18px 0; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { margin-bottom: 8px; }
    .row { margin: 6px 0; }
    @media print { body { margin: 0; max-width: none; } }
  </style>
</head>
<body>
  <div class="meta"><strong>Ref No:</strong> ${escapeXmlText(p["{{IOM_REF_NO}}"])}</div>
  <div class="meta"><strong>Date:</strong> ${escapeXmlText(p["{{IOM_DATE}}"])}</div>
  <div class="meta"><strong>To:</strong> ${escapeXmlText(p["{{DEPARTMENTS}}"])}</div>
  <h1>Inter-Office Memo</h1>
  <p><strong>Subject:</strong> New Employee Joining — ${escapeXmlText(p["{{CANDIDATE_NAME}}"])}</p>
  <p>This is to inform all concerned departments that the following candidate has joined IFSPL:</p>
  <div class="row"><strong>Employee Name:</strong> ${escapeXmlText(p["{{SALUTATION}}"])} ${escapeXmlText(p["{{CANDIDATE_NAME}}"])}</div>
  <div class="row"><strong>Father Name:</strong> ${escapeXmlText(p["{{FATHER_NAME}}"])}</div>
  <div class="row"><strong>Employee Code:</strong> ${escapeXmlText(p["{{EMP_CODE}}"])}</div>
  <div class="row"><strong>Designation:</strong> ${escapeXmlText(p["{{DESIGNATION}}"])}</div>
  <div class="row"><strong>Date of Joining:</strong> ${escapeXmlText(p["{{JOINING_DATE}}"])}</div>
  <div class="row"><strong>Site / Location:</strong> ${escapeXmlText(p["{{SITE_FULL}}"])}</div>
  <div class="row"><strong>Offer Reference:</strong> ${escapeXmlText(p["{{OFFER_REF_NO}}"])}</div>
  <p>Departments notified: ${escapeXmlText(p["{{DEPARTMENTS}}"])}</p>
  <p>Please take necessary action for onboarding arrangements as applicable to your department.</p>
  <p><br/>Authorized Signature (HR)</p>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to preview or print the IOM.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
