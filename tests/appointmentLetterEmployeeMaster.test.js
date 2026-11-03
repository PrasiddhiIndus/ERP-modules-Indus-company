process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";

import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { PDFDocument } from "pdf-lib";
import {
  buildAppointmentLetterDocx,
  convertDocxBufferToPdf,
  finalizeAppointmentLetterDocx,
} from "../server/adminRecruitmentLetterDocs.js";

const SAMPLE = {
  appt: {
    appointment_ref: "IFSPL/APT/2026/00009",
    joining_date: "2026-11-02",
    designation: "Executive",
    department: "Commercial",
    location: "Indus HO",
    reporting_to: "HR Manager",
  },
  offer: {
    annual_ctc: 300000,
    monthly_gross: 25000,
    designation: "Executive",
    department: "Commercial",
  },
  company: "Indus Fire Safety Pvt Ltd.",
};

function texts(buf) {
  const xml = new PizZip(buf).file("word/document.xml").asText();
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
}

function addressBlock(buf) {
  const t = texts(buf);
  const iTo = t.findIndex((x) => x === "To,");
  const iTitle = t.findIndex((x) => x === "Appointment Letter");
  return t.slice(iTo, iTitle + 1);
}

describe("appointment letter Employee Master fields + formatting", () => {
  it("maps current address, employee code, and DOB into letter header and Annexure II", async () => {
    const candidate = {
      full_name: "Hetvi Sevak",
      // Recruitment location must NOT win over Employee Master current address.
      current_location: "Recruitment Town",
      home_town: "ShouldNotAppear",
      current_address:
        "Flat 12, Green Residency\nNear Bus Stand, Dashrath\nVadodara - 391740",
      employee_code: "11143",
      date_of_birth: "2004-06-22",
      expected_ctc: 25000,
    };

    const buf = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      candidate,
      SAMPLE.company
    );
    const finalized = finalizeAppointmentLetterDocx(buf);
    const t = texts(finalized).join(" | ");
    const addr = addressBlock(finalized);

    expect(addr).toContain("To,");
    expect(addr.some((x) => /Flat 12/.test(x))).toBe(true);
    expect(addr.some((x) => /Dashrath/.test(x))).toBe(true);
    expect(addr.some((x) => /Vadodara/.test(x))).toBe(true);
    expect(addr).not.toContain("Recruitment Town");
    expect(addr).not.toContain("ShouldNotAppear");
    // Empty address placeholder lines are stripped for alignment.
    expect(addr.filter((x) => x === "").length).toBe(0);

    expect(t).toContain("11143");
    expect(t).toMatch(/22-Jun-04/);
    expect(t).toContain("Employee Code");
    expect(t).toContain("DOB");
    expect(t).not.toContain("{{ADDRESS_LINE");
    expect(t).not.toContain("{{EMPLOYEE_CODE}}");
    expect(t).not.toContain("{{DOB}}");
  }, 120000);

  it("keeps DOCX/PDF aligned with multi-line Employee Master address (Benefits on page 2)", async () => {
    if (process.platform !== "win32") return;
    delete process.env.FORCE_LIBREOFFICE_PDF;

    const candidate = {
      full_name: "Hetvi Sevak",
      current_address: "Line One Address, Area Two, City Three - 390001",
      employee_code: "11143",
      date_of_birth: "2004-06-22",
      expected_ctc: 25000,
      employee_code_check: true,
    };

    const docx = await buildAppointmentLetterDocx(
      SAMPLE.appt,
      SAMPLE.offer,
      candidate,
      SAMPLE.company
    );
    const pdf = await convertDocxBufferToPdf(docx, "appointment-letter");
    expect(pdf).toBeTruthy();
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(5);

    // Word page count via convert path already validates layout; also ensure
    // finalize did not leave address blank lines before the title.
    const addr = addressBlock(docx);
    expect(addr[0]).toBe("To,");
    expect(addr[addr.length - 1]).toBe("Appointment Letter");
    expect(addr.join(" ")).toMatch(/Line One Address/);
  }, 180000);
});
