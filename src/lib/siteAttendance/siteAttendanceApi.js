import { supabase } from "../supabase";
import { hashPassword } from "./password";
import {
  buildDefaultPlacementsFromEmployees,
  mergePlacementsWithRoster,
  normalizeGridDesignation,
} from "./multiDesignation";

/**
 * Same public tables as INDUS Att.Mod (`attendance.js` / `site.js` / `people.js`).
 * Browser talks to Supabase REST through the ERP client (user JWT), not Express.
 *
 *   sites, people, site_assignments, attendance,
 *   designation_master, site_designations,
 *   site_supervisors, hr_managers, site_hr_managers,
 *   summary_remarks, site_grid_placements
 */

export const SITE_ATTENDANCE_TABLES = [
  "sites",
  "people",
  "site_assignments",
  "attendance",
  "designation_master",
  "site_designations",
  "site_supervisors",
  "hr_managers",
  "site_hr_managers",
  "summary_remarks",
  "site_grid_placements",
];

const SITE_COLUMNS = [
  "site_name",
  "site_type",
  "location",
  "contract_details",
  "contract_start",
  "contract_end",
  "max_workers",
  "duty_hours",
  "salary_cycle_start_day",
  "salary_cycle_end_day",
  "shift_type",
  "nh_ph_present",
  "nh_ph_leave",
  "nh_ph_weekoff",
  "weekoff_counts_as_present",
  "coff_worked_weekoff_eligible",
  "sandwich_rule",
  "one_person_multiple_designations",
  "nh_ph_dates",
  "regular_ot",
  "ot_in_hours",
  "custom_ot",
  "site_designations",
  "required_duty_per_day",
];

function pickSitePayload(payload) {
  const out = {};
  for (const key of SITE_COLUMNS) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      out[key] = payload[key];
    }
  }
  return out;
}

function throwIf(error, fallback = "Request failed") {
  if (!error) return;
  throw new Error(error.message || error.details || error.hint || fallback);
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

const DEFAULT_SITE_DESIGNATIONS = [
  "FIREMAN",
  "BMS Oper",
  "DCPO",
  "FIRE SUP",
  "Service Engineer",
  "D.E.O",
  "EHS",
  "Safety Officer",
  "EHS Officer",
  "Sr.EHS Officer",
  "Safety Marshal",
];

export { DEFAULT_SITE_DESIGNATIONS };

export async function listSites({ search = "", from = 0, to = 99, siteIds } = {}) {
  if (Array.isArray(siteIds) && siteIds.length === 0) return { rows: [], count: 0 };
  let query = supabase.from("sites").select("*", { count: "exact" }).order("id", { ascending: false });
  const term = String(search || "").trim();
  if (term) query = query.ilike("site_name", `%${term}%`);
  if (Array.isArray(siteIds) && siteIds.length) query = query.in("id", siteIds);
  const { data, error, count } = await query.range(from, to);
  throwIf(error, "Unable to load sites.");
  return { rows: data || [], count: count ?? (data || []).length };
}

export async function listAllSites({ siteIds } = {}) {
  if (Array.isArray(siteIds) && siteIds.length === 0) return [];
  let query = supabase.from("sites").select("*").order("site_name", { ascending: true }).limit(5000);
  if (Array.isArray(siteIds) && siteIds.length) query = query.in("id", siteIds);
  const { data, error } = await query;
  throwIf(error, "Unable to load sites.");
  return data || [];
}

export async function getSite(id) {
  const { data, error } = await supabase.from("sites").select("*").eq("id", id).maybeSingle();
  throwIf(error, "Unable to load site.");
  return data;
}

export async function createSite(payload) {
  const { data, error } = await supabase.from("sites").insert(pickSitePayload(payload)).select("*");
  throwIf(error, "Unable to create site.");
  return firstRow(data);
}

export async function updateSite(id, payload) {
  const { data, error } = await supabase.from("sites").update(pickSitePayload(payload)).eq("id", id).select("*");
  throwIf(error, "Unable to update site.");
  return firstRow(data);
}

export async function deleteSite(id) {
  const { error } = await supabase.from("sites").delete().eq("id", id);
  throwIf(error, "Unable to delete site.");
}

export async function listSiteDesignations(siteId) {
  const { data, error } = await supabase
    .from("site_designations")
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return data || [];
}

export async function listDesignationMaster() {
  const names = new Set(DEFAULT_SITE_DESIGNATIONS);
  const { data, error } = await supabase.from("designation_master").select("designation_name").order("designation_name");
  if (!error) {
    (data || []).forEach((row) => {
      if (row.designation_name) names.add(String(row.designation_name).trim());
    });
  }
  const { data: siteRows } = await supabase.from("site_designations").select("designation_name");
  (siteRows || []).forEach((row) => {
    if (row.designation_name) names.add(String(row.designation_name).trim());
  });
  return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export async function saveSiteDesignations(siteId, rows) {
  const selected = (rows || []).filter((row) => row.isSelected && row.designation);
  const names = [...new Set(selected.map((r) => r.designation).filter(Boolean))];
  for (const name of names) {
    await supabase.from("designation_master").upsert({ designation_name: name }, { onConflict: "designation_name" });
  }
  await supabase.from("site_designations").delete().eq("site_id", siteId);
  if (selected.length) {
    const payloads = selected.map((row, index) => {
      const dutyRaw = row.requiredDuty;
      const strengthRaw = row.totalStrength;
      const duty = dutyRaw === "" || dutyRaw == null ? null : parseInt(dutyRaw, 10);
      const strength = strengthRaw === "" || strengthRaw == null ? null : parseInt(strengthRaw, 10);
      return {
        site_id: siteId,
        designation_name: row.designation,
        shift_type: row.shiftType || null,
        total_strength: Number.isNaN(strength) ? null : strength,
        required_duty_per_day: Number.isNaN(duty) ? null : duty,
        sort_order: index,
      };
    });
    const { error } = await supabase.from("site_designations").insert(payloads);
    throwIf(error, "Unable to save designations.");
  }
  await supabase.from("sites").update({ site_designations: names }).eq("id", siteId);
}

export async function listSupervisors(siteId) {
  const { data, error } = await supabase.from("site_supervisors").select("id,username,site_id").eq("site_id", siteId);
  if (error) return [];
  return data || [];
}

export async function saveSupervisors(siteId, supervisors) {
  const existing = await listSupervisors(siteId);
  const currentIds = new Set((supervisors || []).filter((s) => s.id).map((s) => s.id));
  for (const row of existing) {
    if (!currentIds.has(row.id)) {
      await supabase.from("site_supervisors").delete().eq("id", row.id);
    }
  }
  for (const supervisor of supervisors || []) {
    const username = String(supervisor.username || "").trim();
    if (!username) continue;
    if (supervisor.id) {
      const patch = { username };
      if (supervisor.password) patch.password_hash = await hashPassword(supervisor.password);
      const { error } = await supabase.from("site_supervisors").update(patch).eq("id", supervisor.id);
      throwIf(error, "Unable to update supervisor.");
    } else if (supervisor.password) {
      const { error } = await supabase.from("site_supervisors").insert({
        site_id: siteId,
        username,
        password_hash: await hashPassword(supervisor.password),
      });
      throwIf(error, "Unable to create supervisor.");
    }
  }
}

export async function listHrManagers() {
  const { data, error } = await supabase.from("hr_managers").select("*").order("full_name", { ascending: true });
  throwIf(error, "Unable to load HR managers.");
  return data || [];
}

export async function createHrManager(payload) {
  const { data, error } = await supabase.from("hr_managers").insert(payload).select("*");
  throwIf(error, "Unable to create HR manager.");
  return firstRow(data);
}

export async function updateHrManager(id, payload) {
  const { data, error } = await supabase.from("hr_managers").update(payload).eq("id", id).select("*");
  throwIf(error, "Unable to update HR manager.");
  return firstRow(data);
}

export async function deleteHrManager(id) {
  const { error } = await supabase.from("hr_managers").delete().eq("id", id);
  throwIf(error, "Unable to delete HR manager.");
}

export async function listSiteHrAssignments(siteId) {
  const { data, error } = await supabase.from("site_hr_managers").select("*").eq("site_id", siteId);
  if (error) return [];
  return data || [];
}

async function ensureHrManagerRow(person) {
  const email = String(person?.email_id || "").trim();
  const username = (email.split("@")[0] || person?.employee_code || "hr").slice(0, 80);
  if (email) {
    const { data: byEmail } = await supabase.from("hr_managers").select("id").ilike("email_id", email).limit(1);
    if (byEmail?.[0]?.id) return byEmail[0].id;
  }
  const { data: byName } = await supabase
    .from("hr_managers")
    .select("id")
    .eq("full_name", person?.full_name || "")
    .limit(1);
  if (byName?.[0]?.id) return byName[0].id;
  const { data, error } = await supabase
    .from("hr_managers")
    .insert({
      full_name: person?.full_name || username,
      email_id: email || null,
      username,
      role: "executive",
      is_active: true,
    })
    .select("id");
  if (error) return null;
  return firstRow(data)?.id || null;
}

export async function saveSiteHrAssignments(siteId, assignments, hrTeam = []) {
  const existing = await listSiteHrAssignments(siteId);
  const keep = new Set((assignments || []).filter((a) => a.id).map((a) => a.id));
  for (const row of existing) {
    if (!keep.has(row.id)) await supabase.from("site_hr_managers").delete().eq("id", row.id);
  }
  const team = Array.isArray(hrTeam) ? hrTeam : [];
  for (const row of assignments || []) {
    const code = String(row.employee_code || "").trim();
    if (!code || !row.from_date) continue;
    const person = team.find((p) => String(p.employee_code) === code) || { employee_code: code, full_name: code };
    const managerId = row.hr_manager_id ? Number(row.hr_manager_id) : await ensureHrManagerRow(person);
    const payload = {
      site_id: siteId,
      from_date: row.from_date,
      to_date: row.to_date || null,
      employee_code: code,
    };
    if (managerId) payload.hr_manager_id = managerId;
    const write = async (body) => {
      if (row.id) {
        const { error } = await supabase.from("site_hr_managers").update(body).eq("id", row.id);
        throwIf(error, "Unable to update HR assignment.");
      } else {
        const { error } = await supabase.from("site_hr_managers").insert(body);
        throwIf(error, "Unable to save HR assignment.");
      }
    };
    try {
      await write(payload);
    } catch (err) {
      if (!/employee_code|schema cache|column/i.test(String(err?.message || ""))) throw err;
      const fallback = { site_id: siteId, from_date: row.from_date, to_date: row.to_date || null };
      if (managerId) fallback.hr_manager_id = managerId;
      await write(fallback);
    }
  }
}

export async function listPeoplePage({ search = "", from = 0, to = 49 } = {}) {
  let query = supabase.from("people").select("*", { count: "exact" }).order("full_name", { ascending: true });
  const term = String(search || "").trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,unique_code.ilike.%${term}%`);
  const { data, error, count } = await query.range(from, to);
  throwIf(error, "Unable to load people.");
  return { rows: data || [], count: count ?? (data || []).length };
}

export async function listPeopleByIds(ids) {
  const unique = [...new Set((ids || []).filter((id) => id != null))];
  if (!unique.length) return [];
  const all = [];
  for (let i = 0; i < unique.length; i += 80) {
    const chunk = unique.slice(i, i + 80);
    const { data, error } = await supabase.from("people").select("*").in("id", chunk);
    throwIf(error, "Unable to load people.");
    all.push(...(data || []));
  }
  return all;
}

export async function createPerson(payload) {
  const { data, error } = await supabase.from("people").insert(payload).select("*");
  throwIf(error, "Unable to create person.");
  return firstRow(data);
}

export async function updatePerson(id, payload) {
  const { data, error } = await supabase.from("people").update(payload).eq("id", id).select("*");
  throwIf(error, "Unable to update person.");
  return firstRow(data);
}

export async function generateUniqueCode() {
  const { data, error } = await supabase.from("people").select("unique_code,id").order("id", { ascending: false }).limit(100);
  throwIf(error, "Unable to generate code.");
  let maxNumber = 0;
  (data || []).forEach((person) => {
    const match = String(person.unique_code || "").match(/(\d+)/);
    if (match) maxNumber = Math.max(maxNumber, parseInt(match[1], 10));
  });
  let nextNumber = maxNumber > 0 ? maxNumber + 1 : 1;
  if (maxNumber === 0) {
    const { count } = await supabase.from("people").select("id", { count: "exact", head: true });
    nextNumber = (count || 0) + 1;
  }
  return `EMP${String(nextNumber).padStart(3, "0")}`;
}

export async function listAssignments({ personId, personIds, siteId } = {}) {
  let query = supabase.from("site_assignments").select("*");
  if (personIds?.length) query = query.in("person_id", personIds);
  else if (personId) query = query.eq("person_id", personId);
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  throwIf(error, "Unable to load assignments.");
  return data || [];
}

export async function createAssignment(payload) {
  const { data, error } = await supabase.from("site_assignments").insert(payload).select("*");
  throwIf(error, "Unable to create assignment.");
  return firstRow(data);
}

export async function updateAssignment(id, payload) {
  const { data, error } = await supabase.from("site_assignments").update(payload).eq("id", id).select("*");
  throwIf(error, "Unable to update assignment.");
  return firstRow(data);
}

export async function validateMaxWorkers(siteId, fromDate, toDate, excludePersonId, endingPersonId) {
  const site = await getSite(siteId);
  if (!site) return { allowed: false, message: "Site not found" };
  const allAssignments = await listAssignments({ siteId });
  const newFrom = new Date(fromDate);
  const newTo = toDate ? new Date(toDate) : new Date("2099-12-31");
  const activeAssignments = allAssignments.filter((assignment) => {
    if (excludePersonId && assignment.person_id === excludePersonId) return false;
    if (endingPersonId && assignment.person_id === endingPersonId) return false;
    const assignFrom = new Date(assignment.from_date);
    const assignTo = assignment.to_date ? new Date(assignment.to_date) : new Date("2099-12-31");
    return assignFrom <= newTo && assignTo >= newFrom;
  });
  const currentCount = new Set(activeAssignments.map((a) => a.person_id)).size;
  const newCount = currentCount + 1;
  if (site.max_workers != null && newCount > site.max_workers) {
    return {
      allowed: false,
      message: `Cannot assign: Site "${site.site_name}" has reached maximum capacity (${site.max_workers} workers). Currently has ${currentCount} active assignments.`,
    };
  }
  return { allowed: true };
}

export async function listAttendance({ siteId, month, year, from, to }) {
  let query = supabase.from("attendance").select("*").eq("site_id", siteId);
  if (month != null) query = query.eq("month", month);
  if (year != null) query = query.eq("year", year);
  if (from) query = query.gte("att_date", from);
  if (to) query = query.lte("att_date", to);
  const { data, error } = await query.limit(20000);
  throwIf(error, "Unable to load attendance.");
  return data || [];
}

export async function createAttendance(payload) {
  const { data, error } = await supabase.from("attendance").insert(payload).select("*");
  throwIf(error, "Unable to save attendance.");
  return firstRow(data);
}

export async function updateAttendance(id, payload) {
  const { id: _omit, ...body } = payload || {};
  const { data, error } = await supabase.from("attendance").update(body).eq("id", id).select("*");
  throwIf(error, "Unable to update attendance.");
  return firstRow(data);
}

export async function deleteAttendance(id) {
  const { error } = await supabase.from("attendance").delete().eq("id", id);
  throwIf(error, "Unable to clear attendance.");
}

export async function lockAttendanceMonth(siteId, month, year) {
  const { error } = await supabase
    .from("attendance")
    .update({ is_locked: true })
    .eq("site_id", siteId)
    .eq("month", month)
    .eq("year", year);
  throwIf(error, "Unable to lock month.");
}

export async function loadGridPlacements(siteId, cycleMonth, cycleYear) {
  const { data, error } = await supabase
    .from("site_grid_placements")
    .select("id,person_id,grid_designation,is_primary,cycle_month,cycle_year")
    .eq("site_id", siteId)
    .eq("cycle_month", cycleMonth)
    .eq("cycle_year", cycleYear)
    .order("grid_designation", { ascending: true });
  if (error) return null;
  return data || [];
}

export async function ensureGridPlacements(siteId, employees, cycleMonth, cycleYear) {
  const dbRows = await loadGridPlacements(siteId, cycleMonth, cycleYear);
  if (dbRows === null) return buildDefaultPlacementsFromEmployees(employees);

  const missingDefaults = [];
  (employees || []).forEach((emp) => {
    if (!dbRows.some((r) => r.person_id === emp.id)) {
      missingDefaults.push({
        person_id: emp.id,
        grid_designation: normalizeGridDesignation(emp.designation),
        is_primary: true,
      });
    }
  });

  if (missingDefaults.length) {
    await supabase.from("site_grid_placements").insert(
      missingDefaults.map((p) => ({
        site_id: siteId,
        person_id: p.person_id,
        grid_designation: p.grid_designation,
        is_primary: true,
        cycle_month: cycleMonth,
        cycle_year: cycleYear,
      }))
    );
  }

  const refreshed = await loadGridPlacements(siteId, cycleMonth, cycleYear);
  if (refreshed === null) return mergePlacementsWithRoster(employees, [...dbRows, ...missingDefaults]);
  return mergePlacementsWithRoster(employees, refreshed);
}

export async function addGridPlacement(siteId, personId, gridDesignation, cycleMonth, cycleYear) {
  const desig = normalizeGridDesignation(gridDesignation);
  const existing = await loadGridPlacements(siteId, cycleMonth, cycleYear);
  if (
    existing &&
    existing.some((p) => p.person_id === personId && normalizeGridDesignation(p.grid_designation) === desig)
  ) {
    return false;
  }
  const { error } = await supabase.from("site_grid_placements").insert({
    site_id: siteId,
    person_id: personId,
    grid_designation: desig,
    is_primary: false,
    cycle_month: cycleMonth,
    cycle_year: cycleYear,
  });
  throwIf(error, "Unable to add designation row.");
  return true;
}

export async function listSummaryRemarks(siteId, month, year) {
  const { data, error } = await supabase
    .from("summary_remarks")
    .select("designation,remarks,custom_days")
    .eq("site_id", siteId)
    .eq("month", month)
    .eq("year", year);
  if (error) return [];
  return data || [];
}

export async function upsertSummaryRemark(payload) {
  const { error } = await supabase.from("summary_remarks").upsert(payload, {
    onConflict: "site_id,designation,month,year",
  });
  throwIf(error, "Unable to save remarks.");
}

export async function pingSiteAttendanceTables() {
  const results = [];
  for (const table of SITE_ATTENDANCE_TABLES) {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    results.push({
      table,
      ok: !error,
      count: error ? null : count ?? 0,
      error: error ? error.message : null,
    });
  }
  return results;
}

export function userFriendlyError(err) {
  const msg = String(err?.message || err || "").trim();
  if (/permission|rls|policy|jwt/i.test(msg)) return "You do not have permission to change this data.";
  if (/relation|does not exist|schema cache/i.test(msg)) {
    return "This record type is not available yet. Ask an administrator to finish the site attendance setup.";
  }
  return msg || "Something went wrong.";
}
