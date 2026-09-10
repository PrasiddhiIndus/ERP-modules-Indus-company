import { getDutyContribution } from "./attendanceRules";

export const CROSS_DESIG_MESSAGE =
  "Entry not permitted since same day entry for two designations not possible.";
export const PRESENT_OT_ONLY_MESSAGE =
  "Employee is already marked present in another designation. Only OT can be marked here.";
export const OT_ONE_OTHER_DESIG_MESSAGE =
  "OT can be marked in only one other designation for this day.";

export function isMultiDesignationEnabled(site) {
  return site && site.one_person_multiple_designations === true;
}

export function normalizeGridDesignation(name) {
  const n = String(name || "").trim();
  return n || "No Designation";
}

export function multiDesigHasDutyCode(code) {
  const c = (code || "").trim().toUpperCase();
  return c === "P" || c === "A" || c === "B" || c === "C" || c === "G" || c === "HD";
}

export function multiDesigHasOtHours(hours) {
  return (parseInt(hours, 10) || 0) > 0;
}

export function getAttendanceStoreKey(personId, dateString, gridDesignation, multiEnabled) {
  if (multiEnabled && gridDesignation) {
    return `${personId}_${dateString}_${normalizeGridDesignation(gridDesignation)}`;
  }
  return `${personId}_${dateString}`;
}

export function buildAttendanceDataMap(records, multiEnabled) {
  const map = {};
  (records || []).forEach((record) => {
    if (multiEnabled) {
      const desig = record.designation ? normalizeGridDesignation(record.designation) : "";
      if (desig) {
        map[`${record.person_id}_${record.att_date}_${desig}`] = record;
      } else {
        map[`${record.person_id}_${record.att_date}`] = record;
      }
    } else {
      map[`${record.person_id}_${record.att_date}`] = record;
    }
  });
  return map;
}

export function getPersonDayAttendanceRecords(personId, dateString, attendanceData) {
  const legacyKey = `${personId}_${dateString}`;
  const prefix = `${personId}_${dateString}_`;
  const byId = new Map();
  if (attendanceData[legacyKey]) {
    byId.set(attendanceData[legacyKey].id || legacyKey, attendanceData[legacyKey]);
  }
  Object.keys(attendanceData || {}).forEach((key) => {
    if (key.startsWith(prefix)) {
      const rec = attendanceData[key];
      byId.set(rec.id || key, rec);
    }
  });
  return Array.from(byId.values());
}

export function buildDefaultPlacementsFromEmployees(employees) {
  return (employees || []).map((emp) => ({
    person_id: emp.id,
    grid_designation: normalizeGridDesignation(emp.designation),
    is_primary: true,
  }));
}

export function mergePlacementsWithRoster(employees, dbPlacements) {
  const byPerson = new Map();
  (dbPlacements || []).forEach((p) => {
    if (!byPerson.has(p.person_id)) byPerson.set(p.person_id, []);
    byPerson.get(p.person_id).push(p);
  });

  const result = [];
  (employees || []).forEach((emp) => {
    const existing = byPerson.get(emp.id);
    if (existing && existing.length > 0) {
      existing.forEach((p) => {
        result.push({
          person_id: emp.id,
          grid_designation: normalizeGridDesignation(p.grid_designation),
          is_primary: p.is_primary === true,
        });
      });
    } else {
      result.push({
        person_id: emp.id,
        grid_designation: normalizeGridDesignation(emp.designation),
        is_primary: true,
      });
    }
  });
  return result;
}

function countPlacementsPerPerson(placements) {
  const counts = {};
  (placements || []).forEach((p) => {
    counts[p.person_id] = (counts[p.person_id] || 0) + 1;
  });
  return counts;
}

export function buildGridRowEntries(employees, placements) {
  const placementCounts = countPlacementsPerPerson(placements);
  const empMap = new Map((employees || []).map((e) => [e.id, e]));
  const rows = [];

  (placements || []).forEach((p) => {
    const emp = empMap.get(p.person_id);
    if (!emp) return;
    const gridDesignation = normalizeGridDesignation(p.grid_designation);
    const defaultDesignation = normalizeGridDesignation(emp.designation);
    rows.push({
      ...emp,
      id: emp.id,
      person_id: emp.id,
      designation: gridDesignation,
      grid_designation: gridDesignation,
      people_designation: defaultDesignation,
      isDuplicate: (placementCounts[p.person_id] || 0) > 1,
      isDefaultDesignationRow: gridDesignation === defaultDesignation,
    });
  });
  return rows;
}

export function groupGridRowsByDesignation(gridRows) {
  const groups = {};
  (gridRows || []).forEach((row) => {
    const designation = row.grid_designation || row.designation || "No Designation";
    if (!groups[designation]) groups[designation] = [];
    groups[designation].push(row);
  });
  return groups;
}

export function getGridRowsInOrder(employees, placements) {
  const rows = buildGridRowEntries(employees, placements);
  const groups = groupGridRowsByDesignation(rows);
  const ordered = [];
  Object.keys(groups)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .forEach((desig) => {
      const group = [...groups[desig]].sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
      );
      group.forEach((r) => ordered.push(r));
    });
  return ordered;
}

export function filterGridRowsBySearch(gridRows, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return gridRows || [];
  return (gridRows || []).filter((row) => {
    const code = (row.unique_code || "").toLowerCase();
    const name = (row.full_name || "").toLowerCase();
    const designation = (row.grid_designation || row.designation || "").toLowerCase();
    return code.includes(q) || name.includes(q) || designation.includes(q);
  });
}

export function getEmployeesInGridOrder(employees) {
  if (!employees || employees.length === 0) return [];
  const byDesig = {};
  employees.forEach((employee) => {
    const designation = employee.designation || "No Designation";
    if (!byDesig[designation]) byDesig[designation] = [];
    byDesig[designation].push(employee);
  });
  const ordered = [];
  Object.keys(byDesig)
    .sort()
    .forEach((designation) => {
      const group = [...byDesig[designation]].sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || "", undefined, { sensitivity: "base" })
      );
      group.forEach((e) => ordered.push(e));
    });
  return ordered;
}

export function filterEmployeesBySearch(employees, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q || !employees?.length) return employees || [];
  return employees.filter((emp) => {
    const code = (emp.unique_code || "").toLowerCase();
    const name = (emp.full_name || "").toLowerCase();
    const designation = (emp.designation || "").toLowerCase();
    return code.includes(q) || name.includes(q) || designation.includes(q);
  });
}

export function getPersonPrimaryGridDesignation(personId, placements, employees) {
  const personPlacements = (placements || []).filter((p) => p.person_id === personId);
  const primary = personPlacements.find((p) => p.is_primary);
  if (primary) return primary.grid_designation;
  if (personPlacements.length > 0) return personPlacements[0].grid_designation;
  const emp = (employees || []).find((e) => e.id === personId);
  return normalizeGridDesignation(emp?.designation);
}

export function getAttendanceRecordDesignation(record, personId, placements, employees) {
  if (!record) return null;
  if (record.designation) return normalizeGridDesignation(record.designation);
  return getPersonPrimaryGridDesignation(personId, placements, employees);
}

function recordHasAttendanceCode(record) {
  return String(record?.att_code || "").trim() !== "";
}

export function getMultiDesigCrossState(personId, dateString, gridDesignation, attendanceData, placements, employees) {
  const currentDesig = normalizeGridDesignation(gridDesignation);
  const dayRecords = getPersonDayAttendanceRecords(personId, dateString, attendanceData);
  const otherRecords = dayRecords.filter((record) => {
    const recDesig = getAttendanceRecordDesignation(record, personId, placements, employees);
    return recDesig !== currentDesig;
  });

  let otherHasPresent = false;
  let otherHasAttendanceCode = false;
  let otherHasOtOnly = false;

  otherRecords.forEach((other) => {
    const code = (other.att_code || "").trim().toUpperCase();
    const hasOt = multiDesigHasOtHours(other.ot_hours);
    if (code) otherHasAttendanceCode = true;
    if (multiDesigHasDutyCode(code)) otherHasPresent = true;
    else if (hasOt) otherHasOtOnly = true;
  });

  return { otherHasPresent, otherHasAttendanceCode, otherHasOtOnly, otherRecords, dayRecords };
}

export function getAttendanceForGridRow(personId, dateString, gridDesignation, attendanceData, placements, employees) {
  const rowDesig = normalizeGridDesignation(gridDesignation);
  const storeKey = getAttendanceStoreKey(personId, dateString, rowDesig, true);
  const cross = getMultiDesigCrossState(personId, dateString, rowDesig, attendanceData, placements, employees);

  const applyCrossFlags = (record) => {
    const ownCode = recordHasAttendanceCode(record);
    const ownOt = multiDesigHasOtHours(record?.ot_hours);
    return {
      record: record || null,
      conflict: !ownCode && cross.otherHasAttendanceCode,
      otOnly: cross.otherHasPresent && !ownCode,
      otBlocked: cross.otherHasOtOnly && !ownOt,
      conflictRecord: cross.otherRecords[0] || null,
    };
  };

  const direct = attendanceData[storeKey];
  if (direct) return applyCrossFlags(direct);

  const legacy = attendanceData[`${personId}_${dateString}`];
  if (legacy) {
    const ownerDesig = getAttendanceRecordDesignation(legacy, personId, placements, employees);
    if (ownerDesig === rowDesig) return applyCrossFlags(legacy);
  }

  return applyCrossFlags(null);
}

export function validateMultiDesignationEntry(
  personId,
  dateString,
  gridDesignation,
  type,
  newValue,
  attendanceData,
  placements,
  employees
) {
  const cross = getMultiDesigCrossState(
    personId,
    dateString,
    gridDesignation,
    attendanceData,
    placements,
    employees
  );

  if (type === "attendance") {
    const newCode = String(newValue || "").trim().toUpperCase();
    if (!newCode) return { ok: true };
    if (cross.otherHasPresent) return { ok: false, message: PRESENT_OT_ONLY_MESSAGE };
    if (cross.otherHasAttendanceCode) return { ok: false, message: CROSS_DESIG_MESSAGE };
  }

  if (type === "ot") {
    const ot = parseInt(newValue, 10) || 0;
    if (ot <= 0) return { ok: true };
    if (cross.otherHasOtOnly) return { ok: false, message: OT_ONE_OTHER_DESIG_MESSAGE };
    if (cross.otherHasAttendanceCode && !cross.otherHasPresent) {
      return { ok: false, message: CROSS_DESIG_MESSAGE };
    }
  }

  return { ok: true };
}

export function shouldSkipImportOverwrite(existing, gridDesignation, placements, employees) {
  if (!existing) return false;
  const ownerDesig = getAttendanceRecordDesignation(existing, existing.person_id, placements, employees);
  const targetDesig = normalizeGridDesignation(gridDesignation);
  if (ownerDesig === targetDesig) return false;
  const hasData =
    (existing.att_code && String(existing.att_code).trim()) || multiDesigHasOtHours(existing.ot_hours);
  return Boolean(hasData);
}

export function getOrderedGridRowsForSite(employees, placements, site, searchQuery) {
  if (!isMultiDesignationEnabled(site)) {
    return filterEmployeesBySearch(getEmployeesInGridOrder(employees), searchQuery);
  }
  const rows = getGridRowsInOrder(employees, placements);
  return filterGridRowsBySearch(rows, searchQuery);
}

export function computeDayDutyTotalForGridRows(dayInfo, gridRows, attendanceData, placements, employees, isInactiveFn) {
  const dayDate = new Date(dayInfo.date);
  dayDate.setHours(0, 0, 0, 0);
  let dayTotal = 0;
  (gridRows || []).forEach((row) => {
    if (isInactiveFn && isInactiveFn(row, dayDate)) return;
    const { record } = getAttendanceForGridRow(
      row.person_id || row.id,
      dayInfo.dateString,
      row.grid_designation || row.designation,
      attendanceData,
      placements,
      employees
    );
    if (record && record.att_code) dayTotal += getDutyContribution(record.att_code);
  });
  return dayTotal;
}
