import { describe, expect, it } from "vitest";
import {
  amountInWords,
  deriveSiteCodeFromName,
  formatOfferDateDdMmYyyy,
  formatOfferDateLong,
  formatSalaryNumber,
} from "../src/lib/offerLetterDocuments.js";

describe("offerLetterDocuments", () => {
  it("converts salary to words", () => {
    expect(amountInWords(16000)).toBe("Sixteen Thousand");
    expect(amountInWords(125000)).toBe("One Lakh Twenty Five Thousand");
    expect(amountInWords(0)).toBe("Zero");
  });

  it("formats dates for the letter", () => {
    expect(formatOfferDateLong("2026-01-21")).toBe("21st January 2026");
    expect(formatOfferDateDdMmYyyy("2026-01-21")).toBe("21-01-2026");
  });

  it("formats salary numbers and site codes", () => {
    expect(formatSalaryNumber(16000)).toBe("16000");
    expect(deriveSiteCodeFromName("NMDC Iron & Steel Ltd")).toBe("NMDC");
  });
});
