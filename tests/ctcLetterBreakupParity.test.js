import { describe, expect, it } from "vitest";
import {
  calculateCtc,
  SEED_RULES_2026_27,
  SKILL_SEMI,
  STATUS_CONFIRMED,
} from "../src/pages/adminOperations/salaryAdmin/ctcEngine.js";
import { buildAppointmentLetterDocx, buildOfferLetterDocx } from "../server/adminRecruitmentLetterDocs.js";
import PizZip from "pizzip";

process.env.ADMIN_RECRUITMENT_FORCE_ZIP_FILL = "1";

function docText(buf) {
  const xml = new PizZip(buf).file("word/document.xml").asText();
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
}

describe("offer/appointment annexure uses saved CTC calculator breakup", () => {
  it("uses exact saved semi-skilled confirmed components (not skilled probation recalc)", async () => {
    const saved = calculateCtc(SEED_RULES_2026_27, {
      skill: SKILL_SEMI,
      status: STATUS_CONFIRMED,
      monthlyCtc: 28000,
    });
    // Sanity: recalc with letter defaults would differ for at least one row.
    const letterDefault = calculateCtc(SEED_RULES_2026_27, {
      skill: "skilled",
      status: "probation",
      monthlyCtc: 28000,
    });
    expect(saved.basic).not.toBe(letterDefault.basic);

    const candidate = {
      full_name: "Test Candidate",
      expected_ctc: saved.ctc,
      expected_ctc_breakup: saved,
      current_location: "Vadodara",
    };
    const offer = {
      offer_ref: "IFSPL/OFF/2026/00001",
      joining_date: "2026-11-02",
      designation: "Executive",
      department: "Commercial",
      location: "HO",
      annual_ctc: saved.ctc * 12,
      monthly_gross: saved.gross,
      valid_until: "2026-11-15",
    };

    const offerBuf = await buildOfferLetterDocx(offer, candidate, "Indus Fire Safety Pvt Ltd.");
    const offerText = docText(offerBuf);
    expect(offerText).toContain(String(saved.basic));
    expect(offerText).toContain(String(saved.ctc));
    expect(offerText).not.toContain(String(letterDefault.basic));

    const appt = {
      appointment_ref: "IFSPL/APT/2026/00001",
      joining_date: "2026-11-02",
      designation: "Executive",
      department: "Commercial",
      location: "Indus HO",
      reporting_to: "HR Manager",
    };
    const apptBuf = await buildAppointmentLetterDocx(
      appt,
      offer,
      { ...candidate, employee_code: "11111", date_of_birth: "2000-01-15" },
      "Indus Fire Safety Pvt Ltd."
    );
    const apptText = docText(apptBuf);
    expect(apptText).toContain(String(saved.basic));
    expect(apptText).toContain(String(saved.hra));
    expect(apptText).toContain(String(saved.take_home));
    expect(apptText).toContain(String(saved.ctc));
    expect(apptText).not.toContain(String(letterDefault.basic));
  }, 120000);
});
