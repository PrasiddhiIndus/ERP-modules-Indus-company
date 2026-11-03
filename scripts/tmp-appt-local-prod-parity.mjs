/**
 * Parity check: local Word-COM fill vs production zip fill, then Word PDF for both.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import PizZip from "pizzip";
import { PDFDocument } from "pdf-lib";

const SAMPLE = {
  appt: {
    appointment_ref: "IFSPL/APT/2026/00009",
    joining_date: "2026-11-02",
    designation: "Executive",
    department: "Commercial",
    location: "Indus HO",
    reporting_to: "Prerna N Shah",
    monthly_gross: 34558,
  },
  offer: {
    annual_ctc: 414696,
    monthly_gross: 34558,
    designation: "Executive",
    department: "Commercial",
  },
  candidate: {
    full_name: "Hetvi Sevak",
    current_location: "Dashrath",
    home_town: "",
    expected_ctc: 34558,
    employee_code: "11143",
    date_of_birth: "2004-06-22",
  },
  company: "Indus Fire Safety Pvt Ltd.",
};

function texts(xml) {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
}

function plain(xml) {
  return texts(xml)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function signatureSnapshot(xml) {
  const t = texts(xml);
  const i = t.findIndex((x) => x.includes("Shilpa"));
  return {
    hasShilpa: t.some((x) => x.includes("Shilpa")),
    hasManager: t.includes("Manager-Human Resources"),
    hasCeo: t.includes("CEO") || t.some((x) => x === "CEO"),
    hasPrivateLimited: t.some((x) => /Private Limited/i.test(x)),
    hasPict: xml.includes("<w:pict"),
    hasRid8: xml.includes('r:id="rId8"') || xml.includes("rId8"),
    empCode: t.includes("11143"),
    dob: t.some((x) => /22-Jun-04/.test(x)),
    aroundSig: i >= 0 ? t.slice(Math.max(0, i - 3), i + 8) : [],
    pageBreaks: (xml.match(/w:pageBreakBefore/g) || []).length,
  };
}

function countWordPages(docxPath) {
  const ps1 = path.join(os.tmpdir(), `parity-pages-${Date.now()}.ps1`);
  fs.writeFileSync(
    ps1,
    [
      "$ErrorActionPreference = 'Stop'",
      "$w = New-Object -ComObject Word.Application",
      "$w.Visible = $false",
      "$w.DisplayAlerts = 0",
      "try {",
      `  $d = $w.Documents.Open('${docxPath.replace(/'/g, "''")}', $false, $true)`,
      "  Write-Host ('PAGES|' + $d.ComputeStatistics(2))",
      "  $d.Close($false)",
      "} finally { $w.Quit() | Out-Null }",
      "",
    ].join("\n")
  );
  const out = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { encoding: "utf8" }
  );
  const m = out.match(/PAGES\|(\d+)/);
  return m ? Number(m[1]) : null;
}

async function buildDocx(forceZip) {
  // Fresh import each time so env is read correctly inside module... actually env is read at call time in fillDocxTemplate.
  if (forceZip) process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
  else delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
  const { buildAppointmentLetterDocx } = await import(
    `../server/adminRecruitmentLetterDocs.js?t=${Date.now()}-${forceZip}`
  );
  return buildAppointmentLetterDocx(
    SAMPLE.appt,
    SAMPLE.offer,
    SAMPLE.candidate,
    SAMPLE.company
  );
}

async function buildPdfFromDocx(docxBuf, label) {
  // Use convertDocxBufferToPdf — same as API send path. On Windows this is Word COM.
  delete process.env.FORCE_LIBREOFFICE_PDF;
  const { convertDocxBufferToPdf } = await import(
    `../server/adminRecruitmentLetterDocs.js?t=pdf-${Date.now()}-${label}`
  );
  return convertDocxBufferToPdf(docxBuf, "appointment-letter");
}

console.log("=== Building DOCX: production zip fill ===");
const prodDocx = await buildDocx(true);
console.log("=== Building DOCX: local Word COM ===");
const localDocx = await buildDocx(false);

const prodXml = new PizZip(prodDocx).file("word/document.xml").asText();
const localXml = new PizZip(localDocx).file("word/document.xml").asText();

const prodSig = signatureSnapshot(prodXml);
const localSig = signatureSnapshot(localXml);
console.log("\nproduction signature", JSON.stringify(prodSig, null, 2));
console.log("\nlocal signature", JSON.stringify(localSig, null, 2));

const prodDir = path.join(os.tmpdir(), "appt-parity");
fs.mkdirSync(prodDir, { recursive: true });
const prodPath = path.join(prodDir, "prod.docx");
const localPath = path.join(prodDir, "local.docx");
fs.writeFileSync(prodPath, prodDocx);
fs.writeFileSync(localPath, localDocx);

const prodPages = countWordPages(prodPath);
const localPages = countWordPages(localPath);
console.log("\nDOCX pages prod", prodPages, "local", localPages);

// Normalize plain text for content parity (ignore XML noise from Word COM)
const prodPlain = plain(prodXml);
const localPlain = plain(localXml);
const mustHave = [
  "Manager-Human Resources",
  "Shilpa Thakur",
  "Indus Fire Safety Private Limited",
  "11143",
  "22-Jun-04",
  "I hereby acknowledge and accept",
  "Annexure - I",
  "Annexure II",
  "Hetvi Sevak",
];
const missingProd = mustHave.filter((s) => !prodPlain.includes(s));
const missingLocal = mustHave.filter((s) => !localPlain.includes(s));
console.log("missing in prod plain", missingProd);
console.log("missing in local plain", missingLocal);

// Key token presence parity
const keys = [
  "Manager-Human Resources",
  "Shilpa Thakur",
  "appointment-signature",
  "rId8",
  ">CEO<",
];
for (const k of keys) {
  console.log(
    `key ${k}: prod=${prodXml.includes(k)} local=${localXml.includes(k)}`
  );
}

console.log("\n=== PDF via Word COM from production DOCX ===");
const prodPdf = await buildPdfFromDocx(prodDocx, "prod");
console.log("\n=== PDF via Word COM from local DOCX ===");
const localPdf = await buildPdfFromDocx(localDocx, "local");

async function pdfInfo(buf, label) {
  if (!buf || buf.length < 100) {
    console.log(label, "PDF MISSING", buf?.length);
    return null;
  }
  const pdfPath = path.join(prodDir, `${label}.pdf`);
  fs.writeFileSync(pdfPath, buf);
  const doc = await PDFDocument.load(buf);
  console.log(label, {
    bytes: buf.length,
    pages: doc.getPageCount(),
    path: pdfPath,
  });
  return { pages: doc.getPageCount(), path: pdfPath };
}

const prodPdfInfo = await pdfInfo(prodPdf, "prod");
const localPdfInfo = await pdfInfo(localPdf, "local");

const report = {
  docxPagesMatch: prodPages === localPages && prodPages === 4,
  pdfPagesMatch:
    prodPdfInfo?.pages === localPdfInfo?.pages && prodPdfInfo?.pages === 4,
  signatureMatch:
    prodSig.hasManager &&
    localSig.hasManager &&
    prodSig.hasShilpa &&
    localSig.hasShilpa &&
    !prodSig.hasCeo &&
    !localSig.hasCeo,
  contentOk: missingProd.length === 0 && missingLocal.length === 0,
  prodPages,
  localPages,
  prodPdfPages: prodPdfInfo?.pages,
  localPdfPages: localPdfInfo?.pages,
  prodPdfPath: prodPdfInfo?.path,
  localPdfPath: localPdfInfo?.path,
};
console.log("\n=== PARITY REPORT ===");
console.log(JSON.stringify(report, null, 2));
if (
  !report.docxPagesMatch ||
  !report.pdfPagesMatch ||
  !report.signatureMatch ||
  !report.contentOk
) {
  process.exitCode = 1;
}
