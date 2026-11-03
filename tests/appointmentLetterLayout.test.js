import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import PizZip from "pizzip";
import { afterEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildAppointmentLetterDocx,
  convertDocxBufferToPdf,
  finalizeAppointmentLetterDocx,
  prepareAppointmentDocxForLibreOffice,
} from "../server/adminRecruitmentLetterDocs.js";

const SAMPLE = {
  appt: {
    appointment_ref: "IFSPL/APT/2026/00009",
    joining_date: "2026-10-15",
    designation: "Fire Supervisor",
    department: "Operations",
    location: "the Head Office, Vadodara",
    reporting_to: "HR Manager",
    monthly_gross: 25000,
  },
  offer: {
    annual_ctc: 300000,
    monthly_gross: 25000,
    designation: "Fire Supervisor",
    department: "Operations",
  },
  candidate: {
    full_name: "Hetvi Sevak",
    current_location: "Vadodara",
    home_town: "Gujarat",
    expected_ctc: 25000,
    employee_code: "11143",
    date_of_birth: "2004-06-22",
  },
  company: "Indus Fire Safety Pvt Ltd.",
};

function documentXml(buf) {
  const zip = new PizZip(buf);
  return zip.file("word/document.xml")?.asText() || "";
}

function plainText(xml) {
  return String(xml || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyBodyParasBetweenNameAndAnnexure(xml) {
  const annexIdx = xml.indexOf("<w:t>Annexure - I</w:t>");
  expect(annexIdx).toBeGreaterThan(0);
  const before = xml.slice(0, annexIdx);
  const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  let nameEnd = -1;
  for (let i = paras.length - 1; i >= 0; i--) {
    const p = paras[i][0];
    const abs = paras[i].index;
    const lastTc = before.lastIndexOf("<w:tc", abs);
    const lastTcEnd = before.lastIndexOf("</w:tc>", abs);
    if (lastTc > lastTcEnd) continue;
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((m) => m[1])
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    nameEnd = abs + p.length;
    break;
  }
  expect(nameEnd).toBeGreaterThan(0);
  const annexParaStart = xml.lastIndexOf("<w:p ", annexIdx);
  const mid = xml.slice(nameEnd, annexParaStart);
  return [...mid.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].filter((m) => {
    const p = m[0];
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((t) => t[1])
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    return !text;
  }).length;
}

function countWordPages(docxPath) {
  if (process.platform !== "win32") return null;
  const script = `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('${String(docxPath).replace(/'/g, "''")}', $false, $true)
  Write-Output ($doc.ComputeStatistics(2))
  $doc.Close($false)
} finally {
  $word.Quit() | Out-Null
}
`;
  const ps1 = path.join(os.tmpdir(), `appt-pages-${Date.now()}.ps1`);
  fs.writeFileSync(ps1, script, "utf8");
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { encoding: "utf8", windowsHide: true, timeout: 120000 }
    );
    const n = Number(String(out).trim().split(/\r?\n/).filter(Boolean).pop());
    return Number.isFinite(n) ? n : null;
  } finally {
    try {
      fs.unlinkSync(ps1);
    } catch {
      /* ignore */
    }
  }
}

const prevForceZip = process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;

afterEach(() => {
  if (prevForceZip === undefined) delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
  else process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = prevForceZip;
});

function assertAppointmentFormat(xml) {
  const text = plainText(xml);
  expect(xml).not.toContain("{{EMPLOYEE_CODE}}");
  expect(xml).not.toContain("{{DOB}}");
  expect(text).toContain("11143");
  expect(text).toMatch(/22-Jun-04/);
  expect(text).toContain("Employee Code");
  expect(text).toContain("Annexure - I");
  expect(text).toContain("Annexure II");
  expect(text).toContain("Shilpa Thakur");
  expect(text).toContain("Manager-Human Resources");
  expect(text).toContain("Indus Fire Safety Private Limited");
  expect(text).toContain("I hereby acknowledge and accept");
  // Closing title is Manager-HR (attached format), not CEO.
  expect(text).not.toMatch(/\bCEO\b/);
  expect(xml).toMatch(/r:id="rId8"|appointment-signature/);
  expect(xml).toContain("<w:pict");
  expect(emptyBodyParasBetweenNameAndAnnexure(xml)).toBe(0);
  // Benefits (page 2) + Annexure - I
  expect((xml.match(/w:pageBreakBefore/g) || []).length).toBeGreaterThanOrEqual(2);
}

describe("appointment letter layout (local + production zip fill)", () => {
  it("fills Emp Code / DOB / signature format and strips blank page (zip fill = production)", async () => {
    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    const buf = await buildAppointmentLetterDocx(SAMPLE.appt, SAMPLE.offer, SAMPLE.candidate, SAMPLE.company);
    const xml = documentXml(buf);
    assertAppointmentFormat(xml);

    // Idempotent finalize (PDF convert path re-runs it on production).
    const again = finalizeAppointmentLetterDocx(buf);
    assertAppointmentFormat(documentXml(again));
  }, 120000);

  it("local Word-COM fill matches production zip fill on signature + key fields", async () => {
    if (process.platform !== "win32") return;

    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    const prodBuf = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      SAMPLE.candidate,
      SAMPLE.company
    );

    delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
    const localBuf = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      SAMPLE.candidate,
      SAMPLE.company
    );

    const prodXml = documentXml(prodBuf);
    const localXml = documentXml(localBuf);
    assertAppointmentFormat(prodXml);
    assertAppointmentFormat(localXml);

    const prodText = plainText(prodXml);
    const localText = plainText(localXml);
    for (const token of [
      "Shilpa Thakur",
      "Manager-Human Resources",
      "11143",
      "22-Jun-04",
      "Annexure - I",
      "Annexure II",
      "Indus Fire Safety Private Limited",
    ]) {
      expect(prodText).toContain(token);
      expect(localText).toContain(token);
    }
  }, 180000);

  it("LibreOffice prep keeps blank-page strip, signature format, Emp Code / DOB (production PDF fallback)", async () => {
    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    const stored = await buildAppointmentLetterDocx(SAMPLE.appt, SAMPLE.offer, SAMPLE.candidate, SAMPLE.company);
    const lo = prepareAppointmentDocxForLibreOffice(stored);
    const xml = documentXml(lo);
    const text = plainText(xml);
    expect(text).toContain("11143");
    expect(text).toMatch(/22-Jun-04/);
    expect(text).toContain("Shilpa Thakur");
    expect(text).toContain("Manager-Human Resources");
    expect(text).not.toMatch(/\bCEO\b/);
    expect(emptyBodyParasBetweenNameAndAnnexure(xml)).toBe(0);
    expect((xml.match(/w:pageBreakBefore/g) || []).length).toBeGreaterThanOrEqual(1);
  }, 120000);

  it("Word reports exactly 4 pages for production zip-filled letter (Benefits on page 2, no blank)", async () => {
    if (process.platform !== "win32") return;
    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    const buf = await buildAppointmentLetterDocx(SAMPLE.appt, SAMPLE.offer, SAMPLE.candidate, SAMPLE.company);
    const out = path.join(os.tmpdir(), `appt-zip-4p-${Date.now()}.docx`);
    fs.writeFileSync(out, buf);
    try {
      const pages = countWordPages(out);
      expect(pages).toBe(4);
    } finally {
      try {
        fs.unlinkSync(out);
      } catch {
        /* ignore */
      }
    }
  }, 180000);

  it("Word reports exactly 4 pages for local Word-COM-filled letter (Benefits on page 2, no blank)", async () => {
    if (process.platform !== "win32") return;
    delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
    const buf = await buildAppointmentLetterDocx(SAMPLE.appt, SAMPLE.offer, SAMPLE.candidate, SAMPLE.company);
    const out = path.join(os.tmpdir(), `appt-word-4p-${Date.now()}.docx`);
    fs.writeFileSync(out, buf);
    try {
      const pages = countWordPages(out);
      expect(pages).toBe(4);
    } finally {
      try {
        fs.unlinkSync(out);
      } catch {
        /* ignore */
      }
    }
  }, 180000);

  it("PDF from production zip DOCX is 4 pages (same convert path as email send)", async () => {
    if (process.platform !== "win32") return;
    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    delete process.env.FORCE_LIBREOFFICE_PDF;
    const docx = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      SAMPLE.candidate,
      SAMPLE.company
    );
    const pdf = await convertDocxBufferToPdf(docx, "appointment-letter");
    expect(pdf).toBeTruthy();
    expect(pdf.length).toBeGreaterThan(1000);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(4);
  }, 180000);

  it("PDF from local Word-COM DOCX matches production page count (no blank page)", async () => {
    if (process.platform !== "win32") return;
    delete process.env.FORCE_LIBREOFFICE_PDF;

    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    const prodDocx = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      SAMPLE.candidate,
      SAMPLE.company
    );
    const prodPdf = await convertDocxBufferToPdf(prodDocx, "appointment-letter");

    delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
    const localDocx = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      SAMPLE.candidate,
      SAMPLE.company
    );
    const localPdf = await convertDocxBufferToPdf(localDocx, "appointment-letter");

    expect(prodPdf).toBeTruthy();
    expect(localPdf).toBeTruthy();
    const prodPages = (await PDFDocument.load(prodPdf)).getPageCount();
    const localPages = (await PDFDocument.load(localPdf)).getPageCount();
    expect(prodPages).toBe(4);
    expect(localPages).toBe(4);
  }, 240000);
});
