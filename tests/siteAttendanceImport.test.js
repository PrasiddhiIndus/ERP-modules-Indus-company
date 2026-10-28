import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase.js", () => ({ supabase: {} }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    throw new Error("Real Supabase client blocked in tests");
  },
}));

const { generateDays } = await import("../src/lib/siteAttendance/salaryCycle.js");
const { parseAttendanceGrids } = await import("../src/lib/siteAttendance/import/providers/excelLayoutProvider.js");
const { mapAttendanceMark, mapOtValue } = await import("../src/lib/siteAttendance/import/markDictionary.js");
const { matchPerson, normalizeCode } = await import("../src/lib/siteAttendance/import/matchPeople.js");
const { buildImportPreview, CELL_STATUS, cellEditKey } = await import("../src/lib/siteAttendance/import/buildImportPreview.js");
const { detectFileKind } = await import("../src/lib/siteAttendance/import/fileReaders.js");

const julyDays = generateDays(2026, 7, 1, 31).days;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n) => String(n).padStart(2, "0");

/** 31 marks: P except listed overrides { day: mark }. */
function marks(len, overrides = {}) {
  return Array.from({ length: len }, (_, i) => overrides[i + 1] ?? "P");
}
function blanks(len, overrides = {}) {
  return Array.from({ length: len }, (_, i) => overrides[i + 1] ?? "");
}

// Layout A — ERP export: full dates, "OT Hours" row, designation subtotal row.
function layoutA() {
  const header = ["S.No", "Employee Code", "Name", "Designation",
    ...julyDays.map((d) => `${pad(d.day)}-07-2026 (${WD[d.date.getDay()]})`),
    "Present", "Total Leave", "Total Weekoff", "Applied Weekoff", "Total NH/PH", "Total OT (Days)", "Total present"];
  const a = marks(31, { 2: "WO", 9: "WO", 6: "L" });
  return [{
    name: "Attendance",
    grid: [
      header,
      ["1", "1001", "Test Person One", "FIREMAN", ...a, "28", "1", "2", "2", "0.00", "2", "30"],
      ["", "", "OT Hours", "", ...blanks(31, { 3: "8", 10: "8" })],
      ["2", "1002", "Test Person Two", "FIREMAN", ...marks(31), "31", "0", "0", "0", "0.00", "0", "31"],
      ["", "", "OT Hours", ""],
      ["", "", "", "FIREMAN Total:", ...Array(31).fill("2")],
    ],
  }];
}

// Layout B — client sheet: title, weekday row then day-number row, "OT" text marks,
// second block whose OT row repeats the employee (vertically merged code/name).
function layoutB() {
  const sept = generateDays(2026, 9, 1, 31).days;
  const weekdays = sept.map((d) => WD[d.date.getDay()]);
  const head = ["Sr. No.", "Emp Code", "Emp Name", "Desig", ...weekdays, "Duty", "OT", "PH", "WO", "Leave", "TOTAL DUTY"];
  const nums = ["", "", "", "", ...sept.map((d) => String(d.day))];
  return [{
    name: "Attendance",
    grid: [
      ["INDUS FIRE SAFETY PVT. LTD."],
      ["Attendance of Test site for the month of September - 2026", ...Array(35).fill(""), "PH - 25.09.2026"],
      head,
      nums,
      ["1", "2001", "Alpha Worker", "FM", ...marks(30, { 1: "WO", 8: "WO" }), "28", "1", "0", "2", "0", "29"],
      ["", "", "", "OT", ...blanks(30, { 5: "OT" })],
      ["Total ", "", "", "", ...Array(30).fill("1")],
      [],
      head,
      nums,
      ["1", "2002", "Beta Supervisor", "Saf. Sup", ...marks(30, { 2: "L" }), "29", "1", "0", "0", "1", "30"],
      ["1", "2002", "Beta Supervisor", "Saf. Sup", ...blanks(30, { 12: "OT" })],
      ["GRAND TOTAL", "", "", ""],
    ],
  }];
}

// Layout C — salary cycle 21 Jun → 20 Jul with day numbers wrapping, "w/o", OT row with "P".
function layoutC() {
  const cycle = generateDays(2026, 7, 21, 20).days;
  return [{
    name: "Sheet1",
    grid: [
      ["TEST CLIENT - SITE"],
      ["Manpower Attendance Sheet From 21st June 2026 to 20th July 2026"],
      ["Sr. No", "Emp. Code", "Emp.Name", "Designation", ...cycle.map((d) => String(d.day)), "Duty Done", "OT", "TOTAL DUTY", "W/O", "LEAVE"],
      ["", "", "", "", ...cycle.map((d) => WD[d.date.getDay()].toUpperCase())],
      ["1", "3001", "Gamma Guard ", "DCPO ", ...marks(30, { 4: "w/o", 11: "w/o" }), "28", "1", "29", "2", "0"],
      ["", "", "", "OT", ...blanks(30, { 9: "P" })],
      ["Total Duties = ", "", "", "", ...Array(30).fill("1")],
    ],
  }];
}

// Layout D — ABCG site sheet: shift letters, OT row with shift letters, merged
// "SHIFT A" summary rows, a stray second "31" column, one person in two blocks.
function layoutD() {
  const oct = generateDays(2026, 10, 1, 31).days;
  const days = oct.map((d) => String(d.day));
  const wds = oct.map((d) => WD[d.date.getDay()].toUpperCase());
  const row = (sr, code, name, desig, m) => [sr, code, name, desig, ...m, ""];
  return [{
    name: " 01.10.2026 to 31.10.2026",
    grid: [
      ["Indus Fire & Safety Pvt. Ltd. Fire Manpower Attendance Sheet From 01-10-2026 to 31-10-2026"],
      ["Sr. No", "Emp. Code", "Emp.Name", "Designation", ...days, "31", "Duty Done", "OT", "W/O", "LEAVE", "TOTAL DUTY", "SIGN"],
      ["", "", "", "", ...wds, "THU"],
      [...row("1", "5487", "Shift Person One", "F.Sup", blanks(31, { 1: "W/O", 2: "C", 3: "B", 4: "P", 5: "A" })), "4", "2", "1", "0", "6"],
      ["1", "5487", "Shift Person One", "OT", ...blanks(31, { 3: "C", 5: "B" })],
      [...row("2", "6543", "Split Person", "F.Sup( DCPO)", blanks(31, { 10: "A", 11: "A" })), "2", "0", "0", "0", "2"],
      ["2", "6543", "Split Person", "OT"],
      [...row("3", "10181", "Leaver Person", "F.Sup", blanks(31, { 1: "B", 2: "B", 3: "LEFT" })), "2", "0", "0", "0", "2"],
      ["3", "10181", "Leaver Person", "OT"],
      ["FIRE SUPERVISOR TOTAL DUTIES", "FIRE SUPERVISOR TOTAL DUTIES", "FIRE SUPERVISOR TOTAL DUTIES", "", ...Array(31).fill("3")],
      [...row("", "6543", "Split Person", "F.Sup( DCPO)", blanks(31, { 16: "C" })), "1", "1", "0", "0", "2"],
      ["", "6543", "Split Person", "OT", ...blanks(31, { 16: "A" })],
      ["SHIFT A", "SHIFT A", "SHIFT A", "", ...Array(31).fill("6"), "", "96"],
      ["SHIFT G", "SHIFT G", "SHIFT G", "", ...Array(31).fill("0")],
      ["TOTAL", "TOTAL", "TOTAL", "", ...Array(31).fill("18")],
    ],
  }];
}

describe("mark dictionary", () => {
  it("maps known marks and keeps blank as blank", () => {
    expect(mapAttendanceMark("P", "GENERAL").code).toBe("P");
    expect(mapAttendanceMark("w/o", "GENERAL").code).toBe("WO");
    expect(mapAttendanceMark("", "GENERAL").kind).toBe("blank");
    expect(mapAttendanceMark("XYZ", "GENERAL").kind).toBe("unknown");
  });

  it("maps absent to L on general sites but treats A as shift A on ABCG sites", () => {
    expect(mapAttendanceMark("A", "GENERAL")).toMatchObject({ code: "L", note: "Absent mapped to L" });
    expect(mapAttendanceMark("ABSENT", "GENERAL").code).toBe("L");
    expect(mapAttendanceMark("A", "ABCG").code).toBe("A");
  });

  it("records P as G on ABCG sites without changing the site's codes", () => {
    expect(mapAttendanceMark("P", "ABCG")).toMatchObject({ code: "G", note: "P (general shift) recorded as G" });
    expect(mapAttendanceMark("G", "GENERAL").kind).toBe("unknown");
  });

  it("reads LEFT as blank with a review note", () => {
    expect(mapAttendanceMark("LEFT", "ABCG")).toMatchObject({ kind: "blank", code: "", left: true });
  });

  it("reads shift letters in the OT row as one OT duty", () => {
    expect(mapOtValue("C", 12)).toMatchObject({ kind: "hours", hours: 12, note: "OT mark (shift C) = 12 h duty" });
    expect(mapOtValue("B", 8).hours).toBe(8);
  });

  it("reads OT numbers as hours and OT marks as one duty", () => {
    expect(mapOtValue("8", 8).hours).toBe(8);
    expect(mapOtValue("OT", 12).hours).toBe(12);
    expect(mapOtValue("P", 8).hours).toBe(8);
    expect(mapOtValue("20", 8).kind).toBe("unknown");
    expect(mapOtValue("", 8).kind).toBe("blank");
  });
});

describe("layout parser", () => {
  it("parses the ERP export layout with OT hours and totals", () => {
    const out = parseAttendanceGrids(layoutA(), { cycleDays: julyDays });
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(2);
    const [one, two] = out.rows;
    expect(one).toMatchObject({ rawCode: "1001", rawName: "Test Person One", otRow: 3 });
    expect(one.cells).toHaveLength(31);
    expect(one.cells.find((c) => c.date === "2026-07-02").rawMark).toBe("WO");
    expect(one.cells.find((c) => c.date === "2026-07-03").rawOt).toBe("8");
    expect(one.sheetTotals).toMatchObject({ present: 28, leave: 1, weekoff: 2, ot: 2, total: 30 });
    expect(two.otRow).toBeNull(); // empty OT row carries nothing
    expect(two.cells.every((c) => !c.rawOt)).toBe(true);
  });

  it("parses client layout with weekday row, OT marks and repeated blocks", () => {
    const sept = generateDays(2026, 9, 1, 31).days;
    const out = parseAttendanceGrids(layoutB(), { cycleDays: sept });
    expect(out.errors).toEqual([]);
    expect(out.rows.map((r) => r.rawCode)).toEqual(["2001", "2002"]);
    expect(out.rows[0].cells.find((c) => c.date === "2026-09-05").rawOt).toBe("OT");
    // Merged-down OT row is attached to the supervisor, not read as a second person.
    expect(out.rows[1].otRow).toBe(12);
    expect(out.rows[1].cells.find((c) => c.date === "2026-09-12").rawOt).toBe("OT");
    expect(out.warnings.some((w) => w.includes("PH - 25.09.2026"))).toBe(true);
  });

  it("aligns wrapped day numbers to the salary cycle", () => {
    const cycle = generateDays(2026, 7, 21, 20).days;
    const out = parseAttendanceGrids(layoutC(), { cycleDays: cycle });
    expect(out.errors).toEqual([]);
    const row = out.rows[0];
    expect(row.cells[0].date).toBe("2026-06-21");
    expect(row.cells[row.cells.length - 1].date).toBe("2026-07-20");
    expect(row.cells.find((c) => c.date === "2026-06-24").rawMark).toBe("w/o");
    expect(row.cells.find((c) => c.date === "2026-06-29").rawOt).toBe("P");
    expect(row.sheetTotals).toMatchObject({ present: 28, ot: 1, weekoff: 2, leave: 0 });
  });

  it("refuses day numbers that do not match the site's cycle", () => {
    const out = parseAttendanceGrids(layoutC(), { cycleDays: julyDays });
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0]).toMatch(/do not match this site's salary cycle/);
  });

  it("parses an ABCG sheet and skips SHIFT A/G and total label rows", () => {
    const oct = generateDays(2026, 10, 1, 31).days;
    const out = parseAttendanceGrids(layoutD(), { cycleDays: oct });
    expect(out.errors).toEqual([]);
    expect(out.rows.map((r) => r.rawCode)).toEqual(["5487", "6543", "10181", "6543"]);
    const one = out.rows[0];
    expect(one.cells).toHaveLength(31); // the stray second "31" column is not read
    expect(one.cells.find((c) => c.date === "2026-10-03")).toMatchObject({ rawMark: "B", rawOt: "C" });
    expect(one.sheetTotals).toMatchObject({ present: 4, ot: 2, weekoff: 1, leave: 0, total: 6 });
    expect(out.rows[3].cells.find((c) => c.date === "2026-10-16").rawOt).toBe("A");
    expect(out.warnings).toEqual([]);
  });

  it("warns when the stray extra day column holds marks", () => {
    const oct = generateDays(2026, 10, 1, 31).days;
    const sheets = layoutD();
    sheets[0].grid[3][4 + 31] = "A";
    const out = parseAttendanceGrids(sheets, { cycleDays: oct });
    expect(out.warnings.some((w) => w.includes("extra day column"))).toBe(true);
  });

  it("reports sheets without an attendance table", () => {
    const out = parseAttendanceGrids([{ name: "Summary", grid: [["Sr No", "Desig", "Auth Duty"], ["1", "FM", "180"]] }], { cycleDays: julyDays });
    expect(out.rows).toHaveLength(0);
    expect(out.errors[0]).toMatch(/No attendance table found/);
  });
});

describe("file type checks", () => {
  it("rejects legacy and not-yet-supported formats with a clear message", () => {
    expect(() => detectFileKind("a.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/\.xls files are not supported/);
    expect(() => detectFileKind("scan.pdf", new Uint8Array(8))).toThrow(/later phase/);
    expect(() => detectFileKind("fake.xlsx", new Uint8Array(8))).toThrow(/not a valid .xlsx/);
    expect(detectFileKind("ok.csv", new Uint8Array(8))).toBe("csv");
  });
});

describe("people matching", () => {
  const roster = [
    { id: 1, unique_code: "9162", full_name: "Dharmendra Bariya" },
    { id: 2, unique_code: "9228", full_name: "Parmar Vipul Jagdishbhai" },
    { id: 3, unique_code: "10244", full_name: "Solanki Vijaybhai" },
  ];

  it("matches by code first, ignoring leading zeros", () => {
    expect(normalizeCode("009162")).toBe("9162");
    expect(matchPerson({ rawCode: "009162", rawName: "D Bariya" }, roster)).toMatchObject({ personId: 1, method: "code" });
  });

  it("matches swapped name order exactly and leaves a lone first name unmatched", () => {
    expect(matchPerson({ rawCode: "", rawName: "Vijaybhai Solanki" }, roster)).toMatchObject({ personId: 3, method: "name" });
    expect(matchPerson({ rawCode: "", rawName: "Vipul" }, roster).personId).toBeNull();
  });
});

describe("import preview", () => {
  const site = { id: 9, shift_type: "GENERAL", duty_hours: 8, sandwich_rule: true, nh_ph_dates: [] };
  const people = [
    { id: 1, unique_code: "1001", full_name: "Test Person One", joining_date: "2025-01-01", is_active: true, designation: "FIREMAN" },
    { id: 2, unique_code: "1002", full_name: "Test Person Two", joining_date: "2026-07-10", is_active: true, designation: "FIREMAN" },
  ];
  const assignments = { 1: { from_date: "2025-01-01", to_date: null }, 2: { from_date: "2026-07-10", to_date: null } };
  const base = { site, days: julyDays, employees: people, assignments, placements: [], multi: false, locked: false, year: 2026 };

  function extracted(rows) {
    return {
      providerId: "test",
      warnings: [],
      errors: [],
      rows: rows.map((r, i) => ({
        rowKey: `S!${i + 2}`, sheet: "S", sourceRow: i + 2, otRow: null, rawDesig: "", sheetTotals: {},
        ...r,
        cells: r.cells.map(([date, rawMark, rawOt = ""]) => ({ date, rawMark, rawOt, confidence: 1 })),
      })),
    };
  }

  it("fills empty cells, keeps conflicts and same values untouched", () => {
    const records = [
      { id: 50, person_id: 1, att_date: "2026-07-02", att_code: "L", ot_hours: 0 },
      { id: 51, person_id: 1, att_date: "2026-07-03", att_code: "P", ot_hours: 0 },
    ];
    const p = buildImportPreview(
      extracted([{ rawCode: "1001", rawName: "Test Person One", cells: [["2026-07-01", "P"], ["2026-07-02", "P"], ["2026-07-03", "P", "8"], ["2026-07-04", ""]] }]),
      { ...base, records }
    );
    const byDate = Object.fromEntries(p.rows[0].cells.map((c) => [c.date, c]));
    expect(byDate["2026-07-01"]).toMatchObject({ status: CELL_STATUS.NEW, action: "insert" });
    expect(byDate["2026-07-02"].status).toBe(CELL_STATUS.CONFLICT);
    expect(byDate["2026-07-03"]).toMatchObject({ status: CELL_STATUS.NEW, action: "fill" }); // adds OT only
    expect(byDate["2026-07-04"].status).toBe(CELL_STATUS.EMPTY);
    expect(p.cellsToSave.map((c) => c.att_date)).toEqual(["2026-07-01", "2026-07-03"]);
    expect(p.cellsToSave[1]).toMatchObject({ expected_attendance_id: 51, expected_code: "P", expected_ot: 0, proposed_ot: 8 });
    expect(p.canSave).toBe(true);
  });

  it("blocks on dates before joining, OT on leave and unknown marks", () => {
    const p = buildImportPreview(
      extracted([
        { rawCode: "1002", rawName: "Test Person Two", cells: [["2026-07-05", "P"], ["2026-07-12", "L", "8"], ["2026-07-13", "Q"]] },
      ]),
      { ...base, records: [] }
    );
    const st = p.rows[0].cells.map((c) => c.status);
    expect(st).toEqual([CELL_STATUS.INVALID, CELL_STATUS.INVALID, CELL_STATUS.UNKNOWN]);
    expect(p.canSave).toBe(false);
  });

  it("lets the user fix a cell in the preview", () => {
    const ex = extracted([{ rawCode: "1002", rawName: "Test Person Two", cells: [["2026-07-13", "Q"]] }]);
    const key = cellEditKey("S!2", "2026-07-13");
    const p = buildImportPreview(ex, { ...base, records: [] }, { edits: { [key]: { code: "WO" } } });
    expect(p.rows[0].cells[0]).toMatchObject({ status: CELL_STATUS.NEW, proposedCode: "WO", edited: true });
    expect(p.canSave).toBe(true);
  });

  it("requires unmatched rows to be mapped or ignored", () => {
    const ex = extracted([{ rawCode: "7777", rawName: "Nobody Here", cells: [["2026-07-01", "P"]] }]);
    expect(buildImportPreview(ex, { ...base, records: [] }).canSave).toBe(false);
    expect(buildImportPreview(ex, { ...base, records: [] }, { mappings: { "S!2": "ignore" } }).blocking).toEqual([]);
    const mapped = buildImportPreview(ex, { ...base, records: [] }, { mappings: { "S!2": "1" } });
    expect(mapped.cellsToSave[0]).toMatchObject({ person_id: 1, att_date: "2026-07-01", proposed_code: "P" });
  });

  it("applies the sandwich rule to an existing week-off between imported leaves", () => {
    const records = [{ id: 70, person_id: 1, att_date: "2026-07-06", att_code: "WO", ot_hours: 0 }];
    const ex = extracted([{ rawCode: "1001", rawName: "Test Person One", cells: [["2026-07-05", "L"], ["2026-07-07", "L"]] }]);
    const p = buildImportPreview(ex, { ...base, records });
    expect(p.sandwich).toHaveLength(1);
    expect(p.cellsToSave.find((c) => c.action === "sandwich")).toMatchObject({ expected_attendance_id: 70, expected_code: "WO", proposed_code: "L" });
    const off = buildImportPreview(ex, { ...base, records }, { applySandwich: false });
    expect(off.cellsToSave.some((c) => c.action === "sandwich")).toBe(false);
  });

  it("refuses everything when the month is locked", () => {
    const ex = extracted([{ rawCode: "1001", rawName: "Test Person One", cells: [["2026-07-01", "P"]] }]);
    const p = buildImportPreview(ex, { ...base, records: [], locked: true });
    expect(p.canSave).toBe(false);
    expect(p.blocking[0]).toMatch(/locked/);
  });

  describe("ABCG sheet end to end", () => {
    const oct = generateDays(2026, 10, 1, 31).days;
    const abcgSite = { id: 10, shift_type: "ABCG", duty_hours: 12, sandwich_rule: true, nh_ph_dates: [] };
    const roster = [
      { id: 11, unique_code: "5487", full_name: "Shift Person One", joining_date: "2024-01-01", is_active: true, designation: "F.Sup" },
      { id: 12, unique_code: "6543", full_name: "Split Person", joining_date: "2024-01-01", is_active: true, designation: "DCPO" },
      { id: 13, unique_code: "10181", full_name: "Leaver Person", joining_date: "2024-01-01", is_active: true, designation: "F.Sup" },
    ];
    const assign = Object.fromEntries(roster.map((p) => [p.id, { from_date: "2024-01-01", to_date: null }]));
    const ctx = { site: abcgSite, days: oct, employees: roster, assignments: assign, placements: [], multi: false, locked: false, year: 2026, records: [] };
    const parsed = parseAttendanceGrids(layoutD(), { cycleDays: oct });

    it("saves shift codes, P as G, and OT from shift letters", () => {
      const p = buildImportPreview(parsed, ctx);
      expect(p.blocking).toEqual([]);
      const one = p.rows[0].cells;
      expect(one.find((c) => c.date === "2026-10-04")).toMatchObject({ proposedCode: "G", status: CELL_STATUS.NEW });
      expect(one.find((c) => c.date === "2026-10-03")).toMatchObject({ proposedCode: "B", proposedOt: 12 });
      expect(p.rows[0].totalIssues).toEqual([]);
    });

    it("combines one person split across two blocks on a single-designation site", () => {
      const p = buildImportPreview(parsed, ctx);
      expect(p.rows[3].status).toBe("merged");
      const split = p.cellsToSave.filter((c) => c.person_id === 12).map((c) => [c.att_date, c.proposed_code, c.proposed_ot]);
      expect(split).toEqual([["2026-10-10", "A", 0], ["2026-10-11", "A", 0], ["2026-10-16", "C", 12]]);
      expect(p.rows[1].notes.some((n) => n.includes("Includes marks from"))).toBe(true);
    });

    it("keeps two rows as duplicates when both fill the same day", () => {
      const sheets = layoutD();
      sheets[0].grid[10][4 + 9] = "B"; // second block also fills 10 Oct
      const p = buildImportPreview(parseAttendanceGrids(sheets, { cycleDays: oct }), ctx);
      expect(p.rows[3].status).toBe("duplicate");
      expect(p.canSave).toBe(false);
    });

    it("treats LEFT as no attendance and asks to check the leaving date", () => {
      const p = buildImportPreview(parsed, ctx);
      const leaver = p.rows[2];
      expect(leaver.cells.find((c) => c.date === "2026-10-03").status).toBe(CELL_STATUS.EMPTY);
      expect(leaver.notes.some((n) => n.includes("leaving date"))).toBe(true);
    });
  });

  it("flags rows whose sheet totals disagree with the marks", () => {
    const ex = extracted([{ rawCode: "1001", rawName: "Test Person One", sheetTotals: { present: 5 }, cells: [["2026-07-01", "P"]] }]);
    const p = buildImportPreview(ex, { ...base, records: [] });
    expect(p.rows[0].totalIssues[0]).toMatch(/present 5/);
    expect(p.canSave).toBe(true); // a warning, not a blocker
  });
});
