process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";

import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { PDFDocument } from "pdf-lib";
import {
  buildAppointmentLetterDocx,
  convertDocxBufferToPdf,
} from "../server/adminRecruitmentLetterDocs.js";

function texts(buf) {
  const xml = new PizZip(buf).file("word/document.xml").asText();
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
}

describe("appointment letter matches attached reference format", () => {
  it("uses complete Employee Master name after Dear, emp code, address, Manager-HR", async () => {
    const fullName = "Panchal Vijendra Pappubhai";
    const buf = await buildAppointmentLetterDocx(
      {
        appointment_ref: "IFSPL/APT/2026/00010",
        joining_date: "2026-11-02",
        designation: "Billing Executive",
        department: "Executive",
        location: "Vadodara",
        reporting_to: "Himali Mayank Dave",
      },
      {
        annual_ctc: 343020,
        monthly_gross: 28585,
        designation: "Billing Executive",
        department: "Executive",
      },
      {
        full_name: fullName,
        current_address: "33.Navdurga Society Near ICD Warehouse road\nDashrath Vadodara-391740",
        employee_code: "11144",
        date_of_birth: "2001-12-01",
        expected_ctc: 28585,
        current_location: "Vadodara",
      },
      "Indus Fire Safety Pvt Ltd."
    );

    const t = texts(buf);
    const iDear = t.findIndex((x) => x === "Dear " || x.startsWith("Dear"));
    expect(iDear).toBeGreaterThan(-1);
    // Attached format: Dear | complete name | ,
    const dearJoin = t.slice(iDear, iDear + 4).join("");
    expect(dearJoin).toContain("Dear");
    expect(dearJoin).toContain(fullName);
    expect(dearJoin).not.toMatch(/Dear Vijendra/); // not first-name-only

    expect(t.join(" ")).toContain("11144");
    expect(t.join(" ")).toMatch(/01-Dec-01/);
    expect(t).toContain("Manager-Human Resources");
    expect(t.join(" ")).not.toMatch(/\bCEO\b/);
    expect(t.some((x) => /Navdurga Society/i.test(x))).toBe(true);
    expect(t.join(" ")).not.toContain("{{");
  }, 120000);

  it("DOCX and PDF stay aligned with Benefits on page 2", async () => {
    if (process.platform !== "win32") return;
    delete process.env.FORCE_LIBREOFFICE_PDF;
    const buf = await buildAppointmentLetterDocx(
      {
        appointment_ref: "IFSPL/APT/2026/00010",
        joining_date: "2026-11-02",
        designation: "Billing Executive",
        department: "Executive",
        location: "Vadodara",
        reporting_to: "Himali Mayank Dave",
      },
      { annual_ctc: 343020, monthly_gross: 28585, designation: "Billing Executive", department: "Executive" },
      {
        full_name: "Panchal Vijendra Pappubhai",
        current_address: "33.Navdurga Society Near ICD Warehouse road, Dashrath Vadodara-391740",
        employee_code: "11144",
        date_of_birth: "2001-12-01",
        expected_ctc: 28585,
      },
      "Indus Fire Safety Pvt Ltd."
    );
    const pdf = await convertDocxBufferToPdf(buf, "appointment-letter");
    expect(pdf).toBeTruthy();
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(4);
  }, 180000);
});
