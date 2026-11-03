process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { PDFDocument } from "pdf-lib";
import {
  buildAppointmentLetterDocx,
  convertDocxBufferToPdf,
  finalizeAppointmentLetterDocx,
} from "../server/adminRecruitmentLetterDocs.js";

const BASE = {
  appt: {
    appointment_ref: "IFSPL/APT/2026/00010",
    joining_date: "2026-11-02",
    designation: "Billing Executive",
    department: "Executive",
    location: "Vadodara",
    reporting_to: "HR Manager",
  },
  offer: {
    annual_ctc: 343020,
    monthly_gross: 28585,
    designation: "Billing Executive",
    department: "Executive",
  },
  company: "Indus Fire Safety Pvt Ltd.",
};

const prevForceZip = process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
afterEach(() => {
  if (prevForceZip === undefined) delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
  else process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = prevForceZip;
});

function documentXml(buf) {
  return new PizZip(buf).file("word/document.xml")?.asText() || "";
}

function benefitsHasPageBreak(xml) {
  const idx = xml.indexOf("<w:t>Benefits</w:t>");
  if (idx < 0) return false;
  const pStart = xml.lastIndexOf("<w:p ", idx);
  const pEnd = xml.indexOf("</w:p>", idx);
  return /w:pageBreakBefore/.test(xml.slice(pStart, pEnd));
}

function wordBenefitsPage(docxPath) {
  const ps1 = path.join(os.tmpdir(), `appt-benefits-page-${Date.now()}.ps1`);
  fs.writeFileSync(
    ps1,
    `
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open('${docxPath.replace(/'/g, "''")}', $false, $true)
  $find = $doc.Content.Find
  $find.ClearFormatting() | Out-Null
  $ok = $find.Execute('Benefits')
  if (-not $ok) { throw 'Benefits not found' }
  $page = $find.Parent.Information(3) # wdActiveEndPageNumber
  Write-Output ('BENEFITS_PAGE|' + $page)
  Write-Output ('TOTAL_PAGES|' + $doc.ComputeStatistics(2))
  $doc.Close($false)
} finally {
  $word.Quit() | Out-Null
}
`,
    "utf8"
  );
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { encoding: "utf8", windowsHide: true, timeout: 120000 }
    );
    const page = Number((out.match(/BENEFITS_PAGE\|(\d+)/) || [])[1]);
    const total = Number((out.match(/TOTAL_PAGES\|(\d+)/) || [])[1]);
    return { page, total };
  } finally {
    try {
      fs.unlinkSync(ps1);
    } catch {
      /* ignore */
    }
  }
}

async function buildFor(candidateExtra, forceZip) {
  if (forceZip) process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
  else delete process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL;
  return buildAppointmentLetterDocx(
    BASE.appt,
    BASE.offer,
    {
      full_name: "Panchal Vijendra Pappubhai",
      employee_code: "11144",
      date_of_birth: "2001-12-01",
      expected_ctc: 28585,
      ...candidateExtra,
    },
    BASE.company
  );
}

describe("appointment letter Benefits always starts on page 2", () => {
  function emptyParasBeforeBenefits(xml) {
    const idx = xml.indexOf("<w:t>Benefits</w:t>");
    const paraStart = xml.lastIndexOf("<w:p ", idx);
    const before = xml.slice(0, paraStart);
    const paras = [...before.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
    let n = 0;
    for (let i = paras.length - 1; i >= 0; i--) {
      const p = paras[i][0];
      const t = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (t || /w:pict|w:drawing|w:pageBreakBefore/.test(p)) break;
      n++;
    }
    return n;
  }

  it("adds pageBreakBefore on Benefits and strips spacer blanks (no blank page)", async () => {
    process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";
    for (const extra of [
      { current_address: "" },
      {
        current_address:
          "33.Navdurga Society Near ICD Warehouse road\nDashrath Vadodara-391740\nGujarat, India",
      },
    ]) {
      const buf = await buildFor(extra, true);
      const xml = documentXml(buf);
      expect(benefitsHasPageBreak(xml)).toBe(true);
      expect(emptyParasBeforeBenefits(xml)).toBe(0);
      // Idempotent finalize (PDF convert re-runs it in production).
      const again = documentXml(finalizeAppointmentLetterDocx(buf));
      expect(benefitsHasPageBreak(again)).toBe(true);
      expect(emptyParasBeforeBenefits(again)).toBe(0);
    }
  }, 180000);

  it("Word: Benefits is on page 2 for zip fill and Word COM fill; PDF page count matches DOCX", async () => {
    if (process.platform !== "win32") return;
    delete process.env.FORCE_LIBREOFFICE_PDF;

    const cases = [
      { label: "zip-no-addr", forceZip: true, extra: { current_address: "" } },
      {
        label: "zip-addr",
        forceZip: true,
        extra: { current_address: "33.Navdurga Society, Dashrath Vadodara-391740" },
      },
      {
        label: "word-addr",
        forceZip: false,
        extra: { current_address: "33.Navdurga Society, Dashrath Vadodara-391740" },
      },
    ];

    for (const c of cases) {
      const docx = await buildFor(c.extra, c.forceZip);
      const out = path.join(os.tmpdir(), `appt-benefits-${c.label}-${Date.now()}.docx`);
      fs.writeFileSync(out, docx);
      try {
        const { page, total } = wordBenefitsPage(out);
        expect(page, `${c.label} Benefits page`).toBe(2);
        // No blank page: Benefits on page 2. Full CTC Calculator annexure rows use 5 pages.
        expect(total, `${c.label} total pages`).toBe(5);

        const pdf = await convertDocxBufferToPdf(docx, "appointment-letter");
        expect(pdf).toBeTruthy();
        const pdfPages = (await PDFDocument.load(pdf)).getPageCount();
        expect(pdfPages, `${c.label} PDF pages`).toBe(total);
      } finally {
        try {
          fs.unlinkSync(out);
        } catch {
          /* ignore */
        }
      }
    }
  }, 300000);
});
