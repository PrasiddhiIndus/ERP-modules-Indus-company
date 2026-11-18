/**
 * Sample Excel for HT Site Attendance Import.
 * Layout matches the ERP export / excel-layout provider (Code, Name, Designation, day cols).
 */
import * as XLSX from "xlsx";
import { isCalendarMonth } from "../salaryCycle";

/**
 * @param {{
 *   site?: { site_name?: string, shift_type?: string },
 *   days?: Array<{ dateString: string, day: number, monthShort?: string, date: Date }>,
 *   range?: { startDay?: number, endDay?: number } | null,
 *   employees?: Array<{ unique_code?: string, full_name?: string, designation?: string }>,
 *   month?: number,
 *   year?: number,
 * }} opts
 */
export function downloadSampleAttendanceImportSheet(opts = {}) {
  const site = opts.site || {};
  const days = Array.isArray(opts.days) ? opts.days : [];
  const employees = Array.isArray(opts.employees) ? opts.employees : [];
  const range = opts.range || null;
  const showMonth = range && !isCalendarMonth(range.startDay, range.endDay);
  const presentHint = site.shift_type === "ABCG" ? "A" : "P";

  const dayHeaders = days.length
    ? days.map((d) => {
        const wd = d.date?.toLocaleDateString?.("en-GB", { weekday: "short" }) || "";
        return `${d.day}${showMonth && d.monthShort ? ` ${d.monthShort}` : ""} (${wd})`;
      })
    : Array.from({ length: 7 }, (_, i) => `${i + 1} (Mon)`);

  const header = ["Code", "Name", "Designation", ...dayHeaders, "Present", "Leave", "WO", "OT"];

  const samplePeople =
    employees.length > 0
      ? employees.slice(0, 3).map((e) => ({
          code: String(e.unique_code || "").trim() || "E001",
          name: String(e.full_name || "").trim() || "Sample Employee",
          desig: String(e.designation || "").trim() || "Worker",
        }))
      : [
          { code: "E001", name: "Sample Employee One", desig: "Supervisor" },
          { code: "E002", name: "Sample Employee Two", desig: "Worker" },
          { code: "E003", name: "Sample Employee Three", desig: "Helper" },
        ];

  const colCount = dayHeaders.length;
  const rows = samplePeople.map((person, idx) => {
    const dayVals = Array.from({ length: colCount }, (_, di) => {
      if (di % 7 === 6) return "WO";
      if (idx === 1 && di === 2) return "L";
      if (idx === 2 && di === 4) return "HD";
      return presentHint;
    });
    const present = dayVals.filter((c) => c === presentHint || ["A", "B", "C", "G", "P"].includes(c)).length;
    const leave = dayVals.filter((c) => c === "L").length;
    const wo = dayVals.filter((c) => c === "WO").length;
    return [person.code, person.name, person.desig, ...dayVals, present, leave, wo, ""];
  });

  const guide = [
    [],
    ["Import guide"],
    ["1. Keep header row 1. Day columns must be consecutive dates or day numbers for this site's cycle."],
    ["2. Code must match the employee's unique code on the site roster."],
    [`3. Marks: ${presentHint}=Present${site.shift_type === "ABCG" ? " (or A/B/C/G shift)" : ""}, L=Leave/Absent, WO=Week-off, HD=Half day.`],
    ["4. Leave blank cells empty — blank is not treated as absent."],
    ["5. Upload this file (or your site sheet) in Import Excel, review the preview, then Save."],
  ];

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows, ...guide]);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 24 },
    { wch: 14 },
    ...dayHeaders.map(() => ({ wch: 8 })),
    { wch: 8 },
    { wch: 8 },
    { wch: 6 },
    { wch: 6 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  const sitePart = String(site.site_name || "Site").replace(/[^\w\-]+/g, "_").slice(0, 40);
  const month = opts.month || "";
  const year = opts.year || "";
  XLSX.writeFile(wb, `Sample_Attendance_Import_${sitePart}_${month}_${year}.xlsx`);
}
