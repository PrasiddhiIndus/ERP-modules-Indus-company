/**
 * Explicit, reviewable mapping from marks found in uploaded sheets to site
 * attendance codes. Anything not listed here is "unknown" and must be fixed
 * in the preview — nothing is guessed, and blank never means absent.
 *
 * Absent marks map to L (no separate A code); the raw mark is kept on the
 * import cell for audit. On ABCG sites "A" is shift A, not absent.
 */
import { codesForShiftType } from "../attendanceRules";

export const MARK_DICTIONARY_VERSION = "v1";

const BLANK_MARKS = new Set(["", "-", "–", "—", "_", "NIL"]);

const COMMON_MARKS = {
  WO: "WO", "W/O": "WO", "W.O": "WO", "W.O.": "WO", "W-O": "WO", WOFF: "WO", OFF: "WO", "WEEK OFF": "WO", WEEKOFF: "WO",
  L: "L", LV: "L", LEAVE: "L", AB: "L", ABS: "L", ABSENT: "L",
  HD: "HD", "H/D": "HD", "H.D": "HD", "H.D.": "HD", HALF: "HD", "HALF DAY": "HD", "½": "HD", "1/2": "HD",
  CO: "CO", "C/O": "CO", "C/OFF": "CO", COFF: "CO", "C.OFF": "CO", "C-OFF": "CO", "COMP OFF": "CO",
};

const GENERAL_ONLY = {
  P: "P", PR: "P", PRESENT: "P", "✓": "P", "✔": "P", "√": "P",
  A: "L",
  PH: "NH-PH", NH: "NH-PH", "NH-PH": "NH-PH", "NH/PH": "NH-PH", NHPH: "NH-PH", HOL: "NH-PH", HOLIDAY: "NH-PH",
};

// On ABCG sites a P (general-shift day) is recorded as G; the site's codes are unchanged.
const ABCG_ONLY = { A: "A", B: "B", C: "C", G: "G", P: "G", PR: "G", PRESENT: "G" };

/** Marks meaning the person has left — recorded as blank, flagged for review. */
const LEFT_MARKS = new Set(["LEFT", "LFT", "RESIGNED", "RESIGN", "ABSCOND", "ABSCONDED"]);

/** Marks in a separate OT row that mean "worked OT this day" without a number.
 *  Shift letters (A/B/C/G) say which shift the OT was worked in. */
const OT_DAY_MARKS = new Set(["OT", "P", "Y", "YES", "✓", "✔", "√", "*", "A", "B", "C", "G"]);

export function normalizeMarkToken(raw) {
  return String(raw ?? "")
    .replace(/ /g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/**
 * @returns {{ kind: "blank"|"mapped"|"unknown", code: string, raw: string, note?: string }}
 */
export function mapAttendanceMark(raw, shiftType) {
  const token = normalizeMarkToken(raw);
  if (BLANK_MARKS.has(token)) return { kind: "blank", code: "", raw: String(raw ?? "") };
  if (LEFT_MARKS.has(token)) {
    return { kind: "blank", code: "", raw: String(raw), left: true, note: `Marked ${String(raw).trim()} — check the leaving date in People Master` };
  }
  const table = shiftType === "ABCG" ? { ...COMMON_MARKS, ...ABCG_ONLY } : { ...COMMON_MARKS, ...GENERAL_ONLY };
  const code = table[token];
  const allowed = codesForShiftType(shiftType);
  if (code && allowed.includes(code)) {
    let note;
    if (code === "L" && token !== "L" && !["LV", "LEAVE"].includes(token)) note = "Absent mapped to L";
    if (code === "G" && token !== "G") note = "P (general shift) recorded as G";
    return { kind: "mapped", code, raw: String(raw), note };
  }
  return { kind: "unknown", code: "", raw: String(raw), note: `Unrecognised mark "${String(raw).trim()}"` };
}

/**
 * OT row cell → hours. Numbers are hours; a day mark (OT / P / ✓) means one
 * OT duty and is recorded as the site's duty hours.
 * @returns {{ kind: "blank"|"hours"|"unknown", hours: number, raw: string, note?: string }}
 */
export function mapOtValue(raw, dutyHours = 8) {
  const token = normalizeMarkToken(raw);
  if (BLANK_MARKS.has(token) || token === "0") return { kind: "blank", hours: 0, raw: String(raw ?? "") };
  const num = Number(token.replace(/\s*(H|HR|HRS|HOURS)$/, ""));
  if (Number.isFinite(num) && num > 0) {
    if (num > 16) return { kind: "unknown", hours: 0, raw: String(raw), note: "OT above 16 hours" };
    if (!Number.isInteger(num)) {
      return { kind: "hours", hours: Math.round(num), raw: String(raw), note: `OT ${num} rounded to ${Math.round(num)} h` };
    }
    return { kind: "hours", hours: num, raw: String(raw) };
  }
  if (OT_DAY_MARKS.has(token)) {
    const hours = Number(dutyHours) === 12 ? 12 : 8;
    const shift = ["A", "B", "C", "G"].includes(token) ? ` (shift ${token})` : "";
    return { kind: "hours", hours, raw: String(raw), note: `OT mark${shift} = ${hours} h duty` };
  }
  return { kind: "unknown", hours: 0, raw: String(raw), note: `Unrecognised OT value "${String(raw).trim()}"` };
}

/** Human-readable table for the preview's "Mark dictionary" panel. */
export function describeMarkDictionary(shiftType) {
  const table = shiftType === "ABCG" ? { ...COMMON_MARKS, ...ABCG_ONLY } : { ...COMMON_MARKS, ...GENERAL_ONLY };
  const byCode = {};
  Object.entries(table).forEach(([mark, code]) => {
    (byCode[code] ||= []).push(mark);
  });
  return Object.entries(byCode).map(([code, marks]) => ({ code, marks }));
}
