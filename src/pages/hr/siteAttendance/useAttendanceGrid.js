import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "../../../lib/toast";
import { generateDays } from "../../../lib/siteAttendance/salaryCycle";
import {
  applySandwichOnMap,
  buildSiteRosterFromAssignments,
  canMarkAttendance,
  codesForShiftType,
  computeEmployeeTotals,
  getDateVisibility,
  getDutyContribution,
  isInactiveCellClosed,
  isNhPhDay,
  isRowEditingRestricted,
  normalizeNhPhDateList,
  personIsVisibleInAttendanceMonth,
} from "../../../lib/siteAttendance/attendanceRules";
import {
  CROSS_DESIG_MESSAGE,
  buildAttendanceDataMap,
  getAttendanceForGridRow,
  getAttendanceStoreKey,
  getOrderedGridRowsForSite,
  isMultiDesignationEnabled,
  shouldSkipImportOverwrite,
  validateMultiDesignationEntry,
} from "../../../lib/siteAttendance/multiDesignation";
import {
  addGridPlacement,
  createAttendance,
  deleteAttendance,
  ensureGridPlacements,
  getSite,
  listAllSites,
  listAssignments,
  listAttendance,
  listPeopleByIds,
  lockAttendanceMonth,
  updateAttendance,
  updateSite,
  userFriendlyError,
} from "../../../lib/siteAttendance/siteAttendanceApi";
import { parseDateOnlyLocal } from "../../../lib/siteAttendance/dateFormat";

function storeAttendance(map, record, multi) {
  const next = { ...map };
  const key = getAttendanceStoreKey(record.person_id, record.att_date, record.designation, multi);
  next[key] = record;
  return next;
}

export function useAttendanceGrid({ readOnly = false, siteIds } = {}) {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [site, setSite] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [placements, setPlacements] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [days, setDays] = useState([]);
  const [range, setRange] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [savingCell, setSavingCell] = useState("");
  const attendanceMapRef = useRef({});
  attendanceMapRef.current = attendanceMap;

  const loadSites = useCallback(async () => {
    setSites(await listAllSites({ siteIds }));
  }, [siteIds]);

  const loadGrid = useCallback(async () => {
    if (!siteId || !month || !year) {
      toast.error("Select site, month, and year.");
      return;
    }
    setLoading(true);
    try {
      const siteRow = await getSite(Number(siteId));
      const nh = normalizeNhPhDateList(siteRow.nh_ph_dates);
      const regularOT = siteRow.regular_ot === true;
      const customOT = siteRow.custom_ot === true;
      const current = {
        ...siteRow,
        nh_ph_dates: nh,
        sandwich_rule: siteRow.sandwich_rule !== false,
        ot_in_hours: !regularOT && !customOT,
        duty_hours: siteRow.duty_hours === 12 ? 12 : 8,
        one_person_multiple_designations: siteRow.one_person_multiple_designations === true,
      };
      setSite(current);
      const startDay = current.salary_cycle_start_day || 1;
      const endDay = current.salary_cycle_end_day || 31;
      const generated = generateDays(Number(year), Number(month), startDay, endDay);
      setRange(generated.range);
      setDays(generated.days);

      const assigns = await listAssignments({ siteId: Number(siteId) });
      const roster = buildSiteRosterFromAssignments(assigns, Number(year), Number(month), startDay, endDay);
      const people = await listPeopleByIds(roster.map((r) => r.personId));
      const peopleMap = Object.fromEntries(people.map((p) => [p.id, p]));
      const emps = [];
      const assignMap = {};
      roster.forEach(({ personId, assignment, hasOpenAssignment }) => {
        const person = peopleMap[personId];
        if (!person || person.is_active === false) return;
        if (!personIsVisibleInAttendanceMonth(person, Number(year), Number(month), hasOpenAssignment, startDay, endDay)) {
          return;
        }
        emps.push(person);
        assignMap[person.id] = assignment;
      });
      emps.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
      setEmployees(emps);
      setAssignments(assignMap);

      let nextPlacements = [];
      if (isMultiDesignationEnabled(current)) {
        nextPlacements = await ensureGridPlacements(Number(siteId), emps, Number(month), Number(year));
      }
      setPlacements(nextPlacements);

      const records = await listAttendance({
        siteId: Number(siteId),
        month: Number(month),
        year: Number(year),
        from: generated.range.startDateString,
        to: generated.range.endDateString,
      });
      const multi = isMultiDesignationEnabled(current);
      const nextMap = buildAttendanceDataMap(records, multi);
      attendanceMapRef.current = nextMap;
      setAttendanceMap(nextMap);
      setLocked(records.some((r) => r.is_locked));
    } catch (err) {
      toast.error(userFriendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [siteId, month, year]);

  const multi = isMultiDesignationEnabled(site);
  const visibleDays = useMemo(
    () => days.filter((d) => getDateVisibility(d.date, Number(year)).visible),
    [days, year]
  );
  const codes = codesForShiftType(site?.shift_type);
  const gridRows = useMemo(
    () => getOrderedGridRowsForSite(employees, placements, site, search),
    [employees, placements, site, search]
  );

  const getRecord = useCallback(
    (personId, dateString, gridDesignation) => {
      const map = attendanceMapRef.current;
      if (multi) {
        return getAttendanceForGridRow(personId, dateString, gridDesignation, map, placements, employees)
          .record;
      }
      return map[`${personId}_${dateString}`] || null;
    },
    [multi, placements, employees]
  );

  const persistCell = useCallback(
    async ({ personId, dateString, gridDesignation, attCode, otHours, clear, silent }) => {
      if (readOnly || locked) return false;
      const map = attendanceMapRef.current;
      const employee = employees.find((e) => e.id === personId);
      const assignment = assignments[personId];
      const dayDate = parseDateOnlyLocal(dateString);
      const vis = getDateVisibility(dayDate, Number(year));
      const cellKey = `${personId}_${dateString}_${gridDesignation || ""}`;
      if (!vis.editable || isRowEditingRestricted(employee)) {
        if (!silent) toast.error("Editing is restricted for this employee or date.");
        return false;
      }
      if (isInactiveCellClosed(employee, dayDate) || !canMarkAttendance(employee, assignment, dayDate)) {
        if (!silent) toast.error("Cannot mark attendance: employee not assigned or date outside valid range.");
        return false;
      }
      if (multi && gridDesignation && attCode != null) {
        const check = validateMultiDesignationEntry(
          personId,
          dateString,
          gridDesignation,
          "attendance",
          attCode,
          map,
          placements,
          employees
        );
        if (!check.ok) {
          if (!silent) toast.error(check.message);
          return false;
        }
      }
      const storeKey = getAttendanceStoreKey(personId, dateString, gridDesignation, multi);
      let existing = map[storeKey];
      if (!existing && multi) {
        existing = getAttendanceForGridRow(personId, dateString, gridDesignation, map, placements, employees).record;
      }
      if (!existing && !multi) existing = map[`${personId}_${dateString}`];

      if (
        multi &&
        existing &&
        shouldSkipImportOverwrite(existing, gridDesignation, placements, employees) &&
        attCode &&
        ["P", "A", "B", "C", "G", "HD"].includes(String(attCode).toUpperCase())
      ) {
        if (!silent) toast.error(CROSS_DESIG_MESSAGE);
        return false;
      }

      setSavingCell(cellKey);
      try {
        if (clear || (attCode === "" && !(existing?.ot_hours > 0) && !(otHours > 0))) {
          if (existing) {
            await deleteAttendance(existing.id);
            const next = { ...map };
            delete next[storeKey];
            if (next[`${personId}_${dateString}`]?.id === existing.id) delete next[`${personId}_${dateString}`];
            const sandwiched = applySandwichOnMap(next, personId, dateString, days, site?.sandwich_rule);
            for (const u of sandwiched.updates) {
              await updateAttendance(u.record.id, { ...u.record, att_code: "L" });
            }
            attendanceMapRef.current = sandwiched.map;
            setAttendanceMap(sandwiched.map);
          }
          return true;
        }

        const data = {
          person_id: personId,
          site_id: Number(siteId),
          att_date: dateString,
          att_code: attCode != null ? attCode : existing?.att_code || "",
          month: Number(month),
          year: Number(year),
          ot_hours: otHours != null ? otHours : existing?.ot_hours || 0,
        };
        if (multi && gridDesignation) data.designation = gridDesignation;
        else if (existing?.designation) data.designation = existing.designation;

        let saved;
        if (existing) saved = await updateAttendance(existing.id, { ...existing, ...data });
        else if (data.att_code || data.ot_hours > 0) saved = await createAttendance(data);
        else return false;
        const next = storeAttendance(map, { ...existing, ...data, ...saved, id: saved?.id || existing?.id }, multi);
        const sandwiched = applySandwichOnMap(next, personId, dateString, days, site?.sandwich_rule);
        for (const u of sandwiched.updates) {
          await updateAttendance(u.record.id, { ...u.record, att_code: "L" });
        }
        attendanceMapRef.current = sandwiched.map;
        setAttendanceMap(sandwiched.map);
        return true;
      } catch (err) {
        if (!silent) toast.error(userFriendlyError(err));
        return false;
      } finally {
        setSavingCell("");
      }
    },
    [readOnly, locked, employees, assignments, multi, placements, days, site, siteId, month, year]
  );

  const persistOt = useCallback(
    async ({ personId, dateString, gridDesignation, otHours }) => {
      let hours = parseInt(otHours, 10) || 0;
      if (hours > 16) {
        toast.error("OT hours cannot exceed 16.");
        hours = 16;
      }
      const map = attendanceMapRef.current;
      const existing = getRecord(personId, dateString, gridDesignation);
      const code = String(existing?.att_code || "").trim().toUpperCase();
      if (existing && (code === "L" || code === "CO" || (!code && hours > 0))) {
        if (hours > 0 && !(multi && getAttendanceForGridRow(personId, dateString, gridDesignation, map, placements, employees).otOnly)) {
          toast.error("OT cannot be marked on leave or absent days.");
          return;
        }
      }
      if (multi && gridDesignation) {
        const check = validateMultiDesignationEntry(
          personId,
          dateString,
          gridDesignation,
          "ot",
          hours,
          map,
          placements,
          employees
        );
        if (!check.ok) {
          toast.error(check.message);
          return;
        }
      }
      await persistCell({
        personId,
        dateString,
        gridDesignation,
        attCode: existing?.att_code || "",
        otHours: hours,
      });
    },
    [getRecord, multi, placements, employees, persistCell]
  );

  const isCellDisabled = useCallback(
    (row, dateString) => {
      if (readOnly || locked) return true;
      const dayDate = parseDateOnlyLocal(dateString);
      if (isRowEditingRestricted(row) || isInactiveCellClosed(row, dayDate)) return true;
      return !getDateVisibility(dayDate, Number(year)).editable;
    },
    [readOnly, locked, year]
  );

  const bulkMark = useCallback(
    async (attCode, targetDates, { personIds, blankOnly = false, markedOnly = false } = {}) => {
      const idSet = personIds ? new Set(personIds) : null;
      let updated = 0;
      for (const dateString of targetDates) {
        const dayDate = parseDateOnlyLocal(dateString);
        if (!getDateVisibility(dayDate, Number(year)).editable) continue;
        for (const row of gridRows) {
          const personId = row.person_id || row.id;
          if (idSet && !idSet.has(personId)) continue;
          if (isInactiveCellClosed(row, dayDate) || isRowEditingRestricted(row)) continue;
          const rec = getRecord(personId, dateString, row.grid_designation || row.designation);
          const cellHasCode = Boolean(String(rec?.att_code || "").trim());
          if (blankOnly && cellHasCode) continue;
          if (markedOnly && !cellHasCode) continue;
          const ok = await persistCell({
            personId,
            dateString,
            gridDesignation: row.grid_designation || row.designation,
            attCode,
            clear: markedOnly || attCode === "",
            silent: true,
          });
          if (ok) updated += 1;
        }
      }
      toast.success(updated ? `Updated ${updated} cells.` : "No eligible cells to update.");
      return updated;
    },
    [gridRows, persistCell, year, getRecord]
  );

  const lockMonth = useCallback(async () => {
    if (!window.confirm("Lock this month? Further edits will be blocked.")) return;
    try {
      await lockAttendanceMonth(Number(siteId), Number(month), Number(year));
      toast.success("Month locked.");
      setLocked(true);
      await loadGrid();
    } catch (err) {
      toast.error(userFriendlyError(err));
    }
  }, [siteId, month, year, loadGrid]);

  const persistCoff = useCallback(
    async (checked) => {
      if (!site) return;
      try {
        await updateSite(site.id, { coff_worked_weekoff_eligible: checked });
        setSite((s) => ({ ...s, coff_worked_weekoff_eligible: checked }));
      } catch (err) {
        toast.error(userFriendlyError(err));
      }
    },
    [site]
  );

  const copyToDesignation = useCallback(
    async (personId, targetDesignation) => {
      const added = await addGridPlacement(Number(siteId), personId, targetDesignation, Number(month), Number(year));
      if (!added) {
        toast.info("Employee is already listed under this designation.");
        return;
      }
      toast.success("Employee copied to designation set for this month.");
      await loadGrid();
    },
    [siteId, month, year, loadGrid]
  );

  const totals = useMemo(() => {
    return gridRows.map((row) =>
      computeEmployeeTotals(row, visibleDays, (id, date, desig) => getRecord(id, date, desig), site)
    );
  }, [gridRows, visibleDays, getRecord, site, attendanceMap]);

  const dayDuty = useMemo(
    () =>
      visibleDays.map((day) => {
        let sum = 0;
        gridRows.forEach((row) => {
          if (isInactiveCellClosed(row, day.date)) return;
          const rec = getRecord(row.person_id || row.id, day.dateString, row.grid_designation || row.designation);
          if (rec?.att_code) sum += getDutyContribution(rec.att_code);
        });
        return sum;
      }),
    [visibleDays, gridRows, getRecord, attendanceMap]
  );

  return {
    sites,
    siteId,
    setSiteId,
    month,
    setMonth,
    year,
    setYear,
    site,
    employees,
    assignments,
    placements,
    attendanceMap,
    days: visibleDays,
    range,
    search,
    setSearch,
    loading,
    locked,
    savingCell,
    loadSites,
    loadGrid,
    multi,
    codes,
    gridRows,
    getRecord,
    persistCell,
    persistOt,
    bulkMark,
    isCellDisabled,
    lockMonth,
    persistCoff,
    copyToDesignation,
    totals,
    dayDuty,
    isNhPh: (date) => isNhPhDay(site, date),
  };
}
