/**
 * Builds the read-only import preview: matches rows to people, maps marks,
 * validates every cell with the same rules as the attendance grid, compares
 * against existing attendance and decides what Save would do.
 *
 * Nothing here writes to the database.
 */
import { parseDateOnlyLocal } from "../dateFormat";
import {
  applySandwichOnMap,
  canMarkAttendance,
  codesForShiftType,
  computeEmployeeTotals,
  getDateVisibility,
  isInactiveCellClosed,
  isRowEditingRestricted,
} from "../attendanceRules";
import {
  buildAttendanceDataMap,
  getAttendanceForGridRow,
  normalizeGridDesignation,
  validateMultiDesignationEntry,
} from "../multiDesignation";
import { mapAttendanceMark, mapOtValue } from "./markDictionary";
import { matchPerson } from "./matchPeople";

export const CELL_STATUS = {
  EMPTY: "empty", // nothing in the file for this day
  NEW: "new", // will be written (insert, or fill an empty cell)
  SAME: "same", // already recorded with the same value
  CONFLICT: "conflict", // existing value differs — skipped (never overwritten)
  INVALID: "invalid", // breaks an attendance rule — must be fixed
  UNKNOWN: "unknown", // mark / OT value not in the dictionary — must be fixed
};

const DUTY = new Set(["P", "A", "B", "C", "G"]);

export function cellEditKey(rowKey, date) {
  return `${rowKey}|${date}`;
}

const desigKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function resolveDesignation(row, person, placements, multi) {
  if (!multi) return { designation: "", note: undefined };
  const own = placements.filter((p) => Number(p.person_id) === Number(person.id));
  const wanted = desigKey(row.rawDesig);
  const hit = wanted && own.find((p) => desigKey(p.grid_designation) === wanted);
  if (hit) return { designation: hit.grid_designation };
  const primary = own.find((p) => p.is_primary) || own[0];
  const fallback = primary?.grid_designation || normalizeGridDesignation(person.designation);
  return {
    designation: fallback,
    note: row.rawDesig ? `Designation "${row.rawDesig}" not set up for this person this month — using ${fallback}` : undefined,
  };
}

/** Totals of the marks as written in the file (before any sandwich conversion). */
function fileTotalsFor(cells) {
  const t = { present: 0, leave: 0, weekoff: 0, otDays: 0, otHours: 0 };
  cells.forEach((c) => {
    const code = c.mappedCode ?? c.proposedCode;
    if (DUTY.has(code) || code === "CO") t.present += 1;
    if (code === "HD") {
      t.present += 0.5;
      t.leave += 0.5;
    }
    if (code === "L") t.leave += 1;
    if (code === "WO") t.weekoff += 1;
    if (c.proposedOt > 0) {
      t.otDays += 1;
      t.otHours += c.proposedOt;
    }
  });
  return t;
}

function reconcileTotals(sheetTotals, fileTotals) {
  const issues = [];
  const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
  if (sheetTotals.present != null && !near(sheetTotals.present, fileTotals.present)) {
    issues.push(`Sheet says present ${sheetTotals.present}, marks add up to ${fileTotals.present}`);
  }
  if (sheetTotals.leave != null && !near(sheetTotals.leave, fileTotals.leave)) {
    issues.push(`Sheet says leave ${sheetTotals.leave}, marks add up to ${fileTotals.leave}`);
  }
  if (sheetTotals.weekoff != null && !near(sheetTotals.weekoff, fileTotals.weekoff)) {
    issues.push(`Sheet says week-off ${sheetTotals.weekoff}, marks add up to ${fileTotals.weekoff}`);
  }
  if (sheetTotals.ot != null && !near(sheetTotals.ot, fileTotals.otDays) && !near(sheetTotals.ot, fileTotals.otHours)) {
    issues.push(`Sheet says OT ${sheetTotals.ot}, OT row has ${fileTotals.otDays} day(s) / ${fileTotals.otHours} h`);
  }
  return issues;
}

/**
 * @param {object} extracted  provider output (rows / warnings / errors)
 * @param {object} ctx        { site, days, employees, assignments, placements, records, multi, locked, year }
 * @param {object} overrides  { mappings: {rowKey: personId|"ignore"}, edits: {cellKey: {code?, ot?}}, applySandwich }
 */
export function buildImportPreview(extracted, ctx, overrides = {}) {
  const { site, days, employees, assignments = {}, placements = [], records = [], multi = false, locked = false, year } = ctx;
  const mappings = overrides.mappings || {};
  const edits = overrides.edits || {};
  const applySandwich = overrides.applySandwich !== false;
  const shiftType = site?.shift_type;
  const allowed = codesForShiftType(shiftType);
  const dayIndex = new Map(days.map((d) => [d.dateString, d]));
  const peopleById = new Map(employees.map((p) => [Number(p.id), p]));
  const existingMap = buildAttendanceDataMap(records, multi);

  const lookupExisting = (personId, date, designation) => {
    if (multi) return getAttendanceForGridRow(personId, date, designation, existingMap, placements, employees);
    return { record: existingMap[`${personId}_${date}`] || null, otOnly: false };
  };

  const seen = new Map();
  const rows = (extracted?.rows || []).map((raw) => {
    const mapped = mappings[raw.rowKey];
    const ignored = mapped === "ignore";
    const auto = matchPerson(raw, employees);
    const personId = ignored ? null : mapped != null && mapped !== "" ? Number(mapped) : auto.personId;
    const person = personId != null ? peopleById.get(Number(personId)) : null;
    const notes = [];
    if (!ignored && mapped == null && auto.note) notes.push(auto.note);

    const { cells: sourceCells, ...rawRest } = raw;
    const row = {
      ...rawRest,
      sourceCells: sourceCells || [],
      hasData: (sourceCells || []).some((c) => c.rawMark || c.rawOt),
      match: auto,
      manual: mapped != null && mapped !== "" && !ignored,
      ignored,
      personId: person ? person.id : null,
      person,
      designation: "",
      status: ignored ? "ignored" : person ? "ok" : "unmatched",
      notes,
      cells: [],
    };
    if (!person) return row;

    const { designation, note } = resolveDesignation(raw, person, placements, multi);
    row.designation = designation;
    if (note) notes.push(note);
    const dupKey = `${person.id}|${designation}`;
    const first = seen.get(dupKey);
    if (!first) {
      seen.set(dupKey, row);
      return row;
    }
    const where = `${first.sheet} row ${first.sourceRow}`;
    const firstByDate = new Map(first.sourceCells.map((c) => [c.date, c]));
    const overlap = row.sourceCells.filter((c) => {
      const f = firstByDate.get(c.date);
      return f && ((c.rawMark && f.rawMark) || (c.rawOt && f.rawOt));
    });
    if (multi || overlap.length) {
      row.status = "duplicate";
      notes.push(
        overlap.length
          ? `Same person as ${where}, and both rows fill ${overlap.map((c) => c.date.slice(8)).join(", ")} — ignore one row or clear those days`
          : `Same person as ${where} — ignore one of the rows`
      );
      return row;
    }
    // Single-designation site: one person split over two rows (e.g. listed under
    // two designation blocks) is combined, since no day is filled twice.
    first.sourceCells = first.sourceCells.map((c) => {
      const extra = row.sourceCells.find((x) => x.date === c.date);
      if (!extra) return c;
      return {
        ...c,
        rawMark: c.rawMark || extra.rawMark,
        rawOt: c.rawOt || extra.rawOt,
        col: c.rawMark ? c.col : extra.col,
        fromRow: extra.rawMark || extra.rawOt ? row.sourceRow : c.fromRow,
      };
    });
    first.hasData = first.hasData || row.hasData;
    const totals = { ...(first.sheetTotals || {}) };
    Object.entries(row.sheetTotals || {}).forEach(([k, v]) => {
      totals[k] = (totals[k] || 0) + v;
    });
    first.sheetTotals = totals;
    first.notes.push(`Includes marks from ${row.sheet} row ${row.sourceRow} (same person)`);
    row.status = "merged";
    row.notes = [`Combined into ${where}`];
    return row;
  });

  // Pass 1: cell-level mapping, validation and diff.
  rows.forEach((row) => {
    if (!row.person || row.ignored || row.status === "merged") return;
    const person = row.person;
    const assignment = assignments[person.id] || null;
    row.cells = row.sourceCells.map((src) => {
      const key = cellEditKey(row.rowKey, src.date);
      const edit = edits[key];
      const messages = [];
      const markMap = edit && edit.code != null
        ? { kind: edit.code ? "mapped" : "blank", code: String(edit.code).toUpperCase(), raw: src.rawMark }
        : mapAttendanceMark(src.rawMark, shiftType);
      const otMap = edit && edit.ot != null
        ? { kind: Number(edit.ot) > 0 ? "hours" : "blank", hours: Math.max(0, Math.round(Number(edit.ot) || 0)) }
        : mapOtValue(src.rawOt, site?.duty_hours);
      if (markMap.note) messages.push(markMap.note);
      if (markMap.left && !row.notes.some((n) => n.startsWith("Marked \""))) row.notes.push(`Marked "${src.rawMark}" on ${src.date} — no attendance imported for it; check the leaving date in People Master`);
      if (otMap.note) messages.push(otMap.note);

      const cell = {
        key,
        date: src.date,
        col: src.col,
        fromRow: src.fromRow,
        rawMark: src.rawMark,
        rawOt: src.rawOt,
        confidence: src.confidence ?? 1,
        edited: Boolean(edit),
        proposedCode: markMap.code || "",
        proposedOt: otMap.hours || 0,
        existing: null,
        action: null,
        status: CELL_STATUS.EMPTY,
        messages,
      };

      if (markMap.kind === "unknown" || otMap.kind === "unknown") {
        cell.status = CELL_STATUS.UNKNOWN;
        return cell;
      }
      if (!cell.proposedCode && !cell.proposedOt) return cell;

      if (cell.proposedCode && !allowed.includes(cell.proposedCode)) {
        cell.status = CELL_STATUS.INVALID;
        messages.push(`${cell.proposedCode} is not a valid code for this site's shift type`);
        return cell;
      }
      if (cell.proposedOt > 16) {
        cell.status = CELL_STATUS.INVALID;
        messages.push("OT cannot exceed 16 hours");
        return cell;
      }
      const day = dayIndex.get(src.date);
      if (!day) {
        cell.status = CELL_STATUS.INVALID;
        messages.push("Date is outside this salary cycle");
        return cell;
      }
      const dayDate = parseDateOnlyLocal(src.date);
      if (!getDateVisibility(dayDate, Number(year)).editable || isRowEditingRestricted(person)) {
        cell.status = CELL_STATUS.INVALID;
        messages.push("Editing is restricted for this employee or date");
        return cell;
      }
      if (
        isInactiveCellClosed(person, dayDate) ||
        !canMarkAttendance(person, assignment, dayDate) ||
        (assignment?.from_date && String(assignment.from_date).split("T")[0] > src.date)
      ) {
        cell.status = CELL_STATUS.INVALID;
        messages.push("Outside joining / leaving dates or site assignment");
        return cell;
      }

      const found = lookupExisting(person.id, src.date, row.designation);
      const ex = found.record;
      const exCode = String(ex?.att_code || "").trim().toUpperCase();
      const exOt = Number(ex?.ot_hours) || 0;
      cell.existing = ex ? { id: ex.id, code: exCode, ot: exOt, designation: ex.designation || "" } : null;

      const finalCode = cell.proposedCode || exCode;
      if (cell.proposedOt > 0 && (finalCode === "L" || finalCode === "CO" || (!finalCode && !found.otOnly))) {
        cell.status = CELL_STATUS.INVALID;
        messages.push(finalCode ? "OT cannot be marked on leave / C-off days" : "OT without an attendance mark");
        return cell;
      }
      if (multi) {
        const checks = [
          cell.proposedCode && !exCode
            ? validateMultiDesignationEntry(person.id, src.date, row.designation, "attendance", cell.proposedCode, existingMap, placements, employees)
            : { ok: true },
          cell.proposedOt > 0 && !exOt
            ? validateMultiDesignationEntry(person.id, src.date, row.designation, "ot", cell.proposedOt, existingMap, placements, employees)
            : { ok: true },
        ];
        const bad = checks.find((c) => !c.ok);
        if (bad) {
          cell.status = CELL_STATUS.INVALID;
          messages.push(bad.message);
          return cell;
        }
      }

      const codeState = !cell.proposedCode ? "none" : !exCode ? "fill" : exCode === cell.proposedCode ? "same" : "conflict";
      const otState = !cell.proposedOt ? "none" : !exOt ? "fill" : exOt === cell.proposedOt ? "same" : "conflict";
      if (codeState === "conflict" || otState === "conflict") {
        cell.status = CELL_STATUS.CONFLICT;
        messages.push(
          `Existing ${exCode || "—"}${exOt ? ` / OT ${exOt}` : ""} differs from file ${cell.proposedCode || "—"}${cell.proposedOt ? ` / OT ${cell.proposedOt}` : ""} — kept existing`
        );
      } else if (codeState === "fill" || otState === "fill") {
        cell.status = CELL_STATUS.NEW;
        cell.action = ex ? "fill" : "insert";
      } else {
        cell.status = CELL_STATUS.SAME;
      }
      return cell;
    });
  });

  // Pass 2: sandwich rule on the combined (existing + imported) picture,
  // exactly as the grid applies it after each change. The grid's sandwich
  // lookup is keyed person+date, so (like the grid) it only acts on
  // single-designation sites.
  const sandwich = [];
  if (site?.sandwich_rule && applySandwich && !multi) {
    let merged = { ...existingMap };
    const pending = [];
    rows.forEach((row) => {
      row.cells.forEach((cell) => {
        if (cell.status !== CELL_STATUS.NEW) return;
        const k = `${row.personId}_${cell.date}`;
        const base = merged[k] || {};
        merged[k] = {
          ...base,
          person_id: row.personId,
          att_date: cell.date,
          att_code: cell.proposedCode || base.att_code || "",
          ot_hours: cell.proposedOt || base.ot_hours || 0,
          __import: { row, cell },
        };
        pending.push({ row, cell });
      });
    });
    pending.forEach(({ row, cell }) => {
      const result = applySandwichOnMap(merged, row.personId, cell.date, days, true);
      result.updates.forEach(({ record }) => {
        if (record.__import) {
          const target = record.__import.cell;
          if (target.proposedCode !== "L") {
            target.mappedCode = target.proposedCode;
            target.proposedCode = "L";
            target.messages.push("Sandwich rule: converted to L");
          }
        } else if (record.id && ["WO", "NH-PH"].includes(String(record.att_code).toUpperCase())) {
          if (!sandwich.some((s) => s.attendanceId === record.id)) {
            sandwich.push({
              attendanceId: record.id,
              personId: record.person_id,
              person: peopleById.get(Number(record.person_id)),
              date: record.att_date,
              designation: multi ? record.designation || "" : "",
              fromCode: String(record.att_code).toUpperCase(),
              ot: Number(record.ot_hours) || 0,
            });
          }
        }
      });
      merged = result.map;
    });
  }

  // Totals: from the file's own marks, and after-import grid totals.
  const afterMap = { ...existingMap };
  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      if (cell.status !== CELL_STATUS.NEW) return;
      const k = multi ? `${row.personId}_${cell.date}_${normalizeGridDesignation(row.designation)}` : `${row.personId}_${cell.date}`;
      const base = afterMap[k] || {};
      afterMap[k] = {
        ...base,
        person_id: row.personId,
        att_date: cell.date,
        designation: row.designation || base.designation,
        att_code: base.att_code && String(base.att_code).trim() ? base.att_code : cell.proposedCode,
        ot_hours: Number(base.ot_hours) > 0 ? base.ot_hours : cell.proposedOt,
      };
    });
  });
  if (applySandwich) {
    sandwich.forEach((s) => {
      const k = multi ? `${s.personId}_${s.date}_${normalizeGridDesignation(s.designation)}` : `${s.personId}_${s.date}`;
      if (afterMap[k]) afterMap[k] = { ...afterMap[k], att_code: "L" };
    });
  }
  const getAfter = (personId, date, desig) =>
    multi
      ? getAttendanceForGridRow(personId, date, desig, afterMap, placements, employees).record
      : afterMap[`${personId}_${date}`] || null;

  rows.forEach((row) => {
    row.fileTotals = fileTotalsFor(row.cells);
    row.totalIssues = row.person && row.status !== "merged" ? reconcileTotals(row.sheetTotals || {}, row.fileTotals) : [];
    row.afterTotals = row.person
      ? computeEmployeeTotals({ ...row.person, grid_designation: row.designation || undefined }, days, getAfter, site)
      : null;
  });

  // Summary + what Save would send.
  const summary = { rows: rows.length, matched: 0, unmatched: 0, ignored: 0, duplicate: 0, merged: 0, new: 0, same: 0, conflict: 0, invalid: 0, unknown: 0, sandwich: sandwich.length, totalsMismatch: 0 };
  const blocking = [];
  const cellsToSave = [];
  rows.forEach((row) => {
    if (row.status === "ignored") summary.ignored += 1;
    else if (row.status === "unmatched") summary.unmatched += 1;
    else if (row.status === "duplicate") summary.duplicate += 1;
    else if (row.status === "merged") summary.merged += 1;
    else summary.matched += 1;
    if (row.totalIssues?.length) summary.totalsMismatch += 1;

    if (row.status === "unmatched" && row.hasData) blocking.push(`${row.sheet} row ${row.sourceRow}: map "${row.rawName || row.rawCode}" to a person or ignore the row`);
    if (row.status === "duplicate") blocking.push(`${row.sheet} row ${row.sourceRow}: duplicate person — ignore one of the rows`);
    if (row.status !== "ok") return;

    row.cells.forEach((cell) => {
      if (cell.status in summary) summary[cell.status] += 1;
      if (cell.status === CELL_STATUS.INVALID || cell.status === CELL_STATUS.UNKNOWN) {
        blocking.push(`${row.person.full_name} ${cell.date}: ${cell.messages[cell.messages.length - 1] || "fix this cell"}`);
      }
      if (cell.status !== CELL_STATUS.NEW) return;
      cellsToSave.push({
        person_id: row.personId,
        att_date: cell.date,
        designation: row.designation || "",
        raw_mark: cell.rawMark || null,
        raw_ot: cell.rawOt || null,
        source_ref: { sheet: row.sheet, row: cell.fromRow || row.sourceRow, otRow: row.otRow, col: cell.col, edited: cell.edited },
        confidence: cell.confidence,
        proposed_code: cell.proposedCode,
        proposed_ot: cell.proposedOt,
        action: cell.action,
        approved: false,
        expected_attendance_id: cell.existing?.id ?? null,
        expected_code: cell.existing ? cell.existing.code : null,
        expected_ot: cell.existing ? cell.existing.ot : null,
      });
    });
  });
  if (applySandwich) {
    sandwich.forEach((s) => {
      if (cellsToSave.some((c) => c.person_id === s.personId && c.att_date === s.date && c.designation === (s.designation || ""))) return;
      cellsToSave.push({
        person_id: s.personId,
        att_date: s.date,
        designation: s.designation || "",
        raw_mark: null,
        raw_ot: null,
        source_ref: { derived: "sandwich_rule", from: s.fromCode },
        confidence: 1,
        proposed_code: "L",
        proposed_ot: s.ot,
        action: "sandwich",
        approved: true,
        expected_attendance_id: s.attendanceId,
        expected_code: s.fromCode,
        expected_ot: s.ot,
      });
    });
  }
  (extracted?.errors || []).forEach((e) => blocking.push(e));
  if (locked) blocking.unshift("This month is locked — import is not allowed.");

  return {
    rows,
    sandwich,
    summary,
    blocking,
    cellsToSave,
    canSave: !blocking.length && cellsToSave.length > 0,
  };
}
