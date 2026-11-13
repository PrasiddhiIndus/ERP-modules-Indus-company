/**
 * Fire Tender Management (Commercial) — live data model.
 *
 * Sources (all existing Fleet Management tables, shared with Fleet):
 *  - operations_fire_tender_vehicle_master  → vehicle identity, ownership, status
 *  - operations_fire_tender_vehicle_trips   → fire-tender deployments
 *      (assignment_type 'fire-tender': deployment_location, site_name,
 *       date_of_mobilisation, contract_start_date, contract_end_date,
 *       driver_name, trip_status Active / Completed / Cancelled)
 *
 * Nothing here is invented: a vehicle with no deployment records simply shows
 * no deployment.
 */
import { combineIsoDateAndTimeForStorage } from "../../../utils/dateDisplay";

export const HOME_BASE = "Indus House";
export const TRIPS_TABLE = "operations_fire_tender_vehicle_trips";
export const VEHICLES_TABLE = "operations_fire_tender_vehicle_master";

export const STATUS = {
  deployed: { label: "Deployed", severity: "live", bar: "bg-accent" },
  scheduled: { label: "Mobilization scheduled", severity: "info", bar: "bg-info" },
  "indus-house": { label: "At Indus House", severity: "neutral", bar: "bg-neutral-state" },
  maintenance: { label: "Under Maintenance", severity: "warning", bar: "bg-warning" },
  breakdown: { label: "Out for Repair", severity: "critical", bar: "bg-critical" },
  decommissioned: { label: "Decommissioned", severity: "neutral", bar: "bg-chart-inactive" },
};
export const STATUS_ORDER = ["deployed", "scheduled", "indus-house", "maintenance", "breakdown", "decommissioned"];

export const SCOPE_OPTIONS = ["Client", "Indus", "Shared"];

const FIRE_TENDER_TYPES = new Set([
  "Multipurpose",
  "Foam Tender",
  "DCP Tender",
  "Water Bowser",
  "Quick Response Vehicle",
  "Water Mist",
]);

const DAY = 86400000;

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / DAY);

/** 'YYYY-MM-DD' or ISO timestamp → local Date at midnight. */
export function toDay(v) {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m && s.length === 10) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toInputDate(d) {
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDate(d) {
  const dt = d instanceof Date ? d : toDay(d);
  if (!dt) return "—";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDuration(from, to) {
  if (!from) return "—";
  const days = Math.max(0, daysBetween(from, to || startOfToday()));
  if (days < 31) return `${days} d`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} y ${m} mo` : `${y} y`;
}

export function isFireTenderFleetRow(row) {
  return row?.vehicle_category === "fire-tender" || FIRE_TENDER_TYPES.has(row?.vehicle_type);
}

/* ------------------------------------------------------------------ */
/* Scope of fuel / firefighting media — tagged line in trip notes       */
/* ------------------------------------------------------------------ */

const SCOPE_RE = /^\s*Scope\s*[—-]\s*Fuel:\s*([A-Za-z]+)\s*\|\s*Media:\s*([A-Za-z]+)\s*$/im;

export function parseScope(notes) {
  const m = String(notes || "").match(SCOPE_RE);
  return m ? { fuel: m[1], media: m[2] } : null;
}

export function stripScope(notes) {
  return String(notes || "")
    .replace(SCOPE_RE, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function withScope(notes, fuel, media) {
  const body = stripScope(notes);
  if (!fuel && !media) return body || null;
  const line = `Scope — Fuel: ${fuel || "—"} | Media: ${media || "—"}`;
  return body ? `${body}\n${line}` : line;
}

/* ------------------------------------------------------------------ */
/* Roster                                                               */
/* ------------------------------------------------------------------ */

const MFG_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Display make month + year when known (e.g. "Nov 2008"), else year only. */
function mfgYear(row) {
  const dm = String(row.date_of_manufacture || "").trim();
  let month = null;
  let year = null;

  let m = dm.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
  } else {
    m = dm.match(/^(\d{2})-(\d{4})$/);
    if (m) {
      month = Number(m[1]);
      year = Number(m[2]);
    } else {
      m = dm.match(/^([A-Za-z]{3})[-\s/]?(\d{2}|\d{4})$/);
      if (m) {
        const idx = MFG_MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
        if (idx >= 0) month = idx + 1;
        const yy = Number(m[2]);
        year = m[2].length === 2 ? (yy >= 90 ? 1900 + yy : 2000 + yy) : yy;
      }
    }
  }

  if (!year && row.year_of_manufacture) {
    year = Number(row.year_of_manufacture) || row.year_of_manufacture;
  }
  if (!year) return null;
  if (month >= 1 && month <= 12) return `${MFG_MONTHS[month - 1]} ${year}`;
  return String(year);
}

function capacityText(row) {
  const cap = [];
  if (row.water_tank_capacity) cap.push(`${Number(row.water_tank_capacity).toLocaleString("en-IN")} L water`);
  if (row.foam_tank_capacity) cap.push(`${Number(row.foam_tank_capacity).toLocaleString("en-IN")} L foam`);
  return cap.join(" / ");
}

function describe(row) {
  const type = row.vehicle_type === "Other" ? row.vehicle_type_other || "Fire Tender" : row.vehicle_type || "Fire Tender";
  const cap = capacityText(row);
  return cap ? `${type} — ${cap}` : type;
}

function ownershipLabel(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s === "owned") return "Owned";
  if (s === "rented") return "Rented";
  return v;
}

function tripMob(t) {
  return toDay(t.date_of_mobilisation) || toDay(t.start_date_time);
}

/** Actual/expected end of a deployment record. */
function tripEnd(t) {
  if (t.trip_status !== "Completed") return null;
  const planned = toDay(t.end_date_time) || toDay(t.contract_end_date);
  const touched = toDay(t.updated_at);
  if (planned && touched) return planned < touched ? planned : touched;
  return planned || touched;
}

function isFireTenderTrip(t, vehicleIsFireTender) {
  return t.assignment_type === "fire-tender" || (!t.assignment_type && vehicleIsFireTender);
}

/**
 * Movement history from deployment records only. Between a completed
 * deployment and the next one the vehicle is at Indus House (Fleet sets it
 * back to Available on completion).
 */
function buildMovements(trips) {
  const today = startOfToday();
  const list = trips
    .filter((t) => t.trip_status !== "Cancelled" && tripMob(t))
    .sort((a, b) => tripMob(a) - tripMob(b));
  const out = [];
  list.forEach((t) => {
    const from = tripMob(t);
    const to = tripEnd(t);
    const prev = out[out.length - 1];
    if (prev && prev.to && prev.to < from) {
      out.push({ kind: "home", location: HOME_BASE, site: null, from: prev.to, to: from, label: "At base" });
    }
    out.push({
      kind: "client",
      tripId: t.id,
      location: t.deployment_location || t.origin_location || "—",
      site: t.site_name || t.destination_location || null,
      driver: t.driver_name || t.issued_to_name || null,
      from,
      to,
      status: t.trip_status,
      label: from > today ? "Mobilization scheduled" : t.trip_status === "Completed" ? "Deployment (completed)" : "Mobilization",
    });
  });
  const last = out[out.length - 1];
  if (last && last.to && last.to <= today) {
    out.push({ kind: "home", location: HOME_BASE, site: null, from: last.to, to: null, label: "Demobilized to base" });
  }
  // Mark the open stay (if any) as current.
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.from <= today && (!m.to || m.to > today)) {
      m.current = true;
      break;
    }
  }
  return out.map((m, i) => ({ ...m, seq: i + 1 }));
}

export function buildRoster(fleetRows, tripRows) {
  const tripsByVehicle = new Map();
  for (const t of tripRows || []) {
    if (t.vehicle_id == null) continue;
    const k = String(t.vehicle_id);
    if (!tripsByVehicle.has(k)) tripsByVehicle.set(k, []);
    tripsByVehicle.get(k).push(t);
  }
  const today = startOfToday();

  const out = [];
  for (const row of fleetRows || []) {
    const ft = isFireTenderFleetRow(row);
    const trips = (tripsByVehicle.get(String(row.id)) || []).filter((t) => isFireTenderTrip(t, ft));
    if (!ft && !trips.length) continue;

    const active = trips
      .filter((t) => t.trip_status === "Active" && tripMob(t))
      .sort((a, b) => tripMob(b) - tripMob(a))[0] || null;
    const mob = active ? tripMob(active) : null;

    let status;
    switch (row.vehicle_status) {
      case "Under Maintenance":
        status = "maintenance";
        break;
      case "Out for Repair":
        status = "breakdown";
        break;
      case "Decommissioned":
        status = "decommissioned";
        break;
      default:
        if (active) status = mob > today ? "scheduled" : "deployed";
        else if (row.vehicle_status === "On Duty" || row.vehicle_status === "Rented") status = "deployed";
        else status = "indus-house";
    }

    const movements = buildMovements(trips);
    const currentMove = movements.find((m) => m.current) || null;

    let current;
    if (active && mob <= today) {
      current = {
        location: active.deployment_location || active.origin_location || "—",
        site: active.site_name || active.destination_location || null,
        driver: active.driver_name || active.issued_to_name || null,
        since: mob,
        fromRecord: true,
      };
    } else if (status === "deployed") {
      // On Duty in Fleet without a deployment record: use Fleet's assignment fields.
      current = {
        location: row.assigned_location || "Not recorded",
        site: row.assigned_site || null,
        driver: row.operations_fire_tender_vehicle_drivers?.full_name || null,
        since: null,
        fromRecord: false,
      };
    } else {
      current = {
        location: row.assigned_location && status !== "indus-house" ? row.assigned_location : HOME_BASE,
        site: null,
        driver: null,
        since: currentMove?.kind === "home" ? currentMove.from : null,
        fromRecord: false,
      };
    }

    const contract = active
      ? {
          tripId: active.id,
          location: active.deployment_location || null,
          site: active.site_name || null,
          start: toDay(active.contract_start_date),
          end: toDay(active.contract_end_date),
          upcoming: mob > today,
        }
      : null;

    out.push({
      id: `fleet-${row.id}`,
      fleetId: row.id,
      registrationNumber: row.registration_number || "—",
      vehicleType: row.vehicle_type === "Other" ? row.vehicle_type_other || "Other" : row.vehicle_type || "Fire Tender",
      description: describe(row),
      makeModel: [row.make, row.model || row.chassis_model].filter(Boolean).join(" ") || null,
      mfgYear: mfgYear(row),
      ownership: ownershipLabel(row.ownership_type),
      ownerName: row.owner_name || null,
      fleetStatus: row.vehicle_status || null,
      fleetCategory: row.vehicle_category || null,
      assignedDriver: row.operations_fire_tender_vehicle_drivers?.full_name || null,
      fuelType: row.fuel_type || null,
      capacity: capacityText(row) || null,
      pump: [row.pump_make_brand, row.pump_model_number].filter(Boolean).join(" ") || null,
      registryValidity: toDay(row.registry_validity_date),
      lastService: toDay(row.last_service_date),
      nextServiceDue: toDay(row.next_service_due),
      status,
      current,
      activeTrip: active,
      trips,
      movements,
      contract,
      schedule: {
        mobilization: mob && mob > today ? mob : null,
        demobilization: active ? toDay(active.contract_end_date) : null,
      },
      scope: active ? parseScope(active.notes) : null,
    });
  }
  return out.sort((a, b) => String(a.registrationNumber).localeCompare(String(b.registrationNumber)));
}

export function contractDaysLeft(contract) {
  if (!contract?.end) return null;
  return daysBetween(startOfToday(), contract.end);
}

export function expirySeverity(daysLeft) {
  if (daysLeft == null) return null;
  if (daysLeft < 0) return { severity: "critical", label: `Expired ${Math.abs(daysLeft)}d ago` };
  if (daysLeft <= 30) return { severity: "critical", label: `${daysLeft}d left` };
  if (daysLeft <= 60) return { severity: "warning", label: `${daysLeft}d left` };
  if (daysLeft <= 90) return { severity: "info", label: `${daysLeft}d left` };
  return { severity: "success", label: `${daysLeft}d left` };
}

/**
 * Deployment record payload — same shape Fleet's VehicleTrips form writes for
 * assignment_type 'fire-tender', so the record is editable from either module.
 */
export function buildDeploymentPayload(form, userId) {
  const mob = form.mobilizationDate;
  const end = form.contractEnd || null;
  return {
    assignment_type: "fire-tender",
    vehicle_id: Number(form.fleetId),
    trip_purpose: "Fire Tender Vehicle Assignment",
    issued_to_name: form.driverName?.trim() || null,
    issued_to_department: null,
    issued_to_contact: null,
    start_date_time: combineIsoDateAndTimeForStorage(mob, "00:00"),
    end_date_time: end ? combineIsoDateAndTimeForStorage(end, "00:00") : null,
    origin_location: form.location || null,
    destination_location: form.site || null,
    trip_status: "Active",
    driver_name: form.driverName?.trim() || null,
    deployment_location: form.location || null,
    site_name: form.site || null,
    date_of_mobilisation: mob,
    contract_start_date: form.contractStart || null,
    contract_end_date: end,
    notes: withScope(form.notes, form.fuelScope, form.mediaScope),
    user_id: userId,
  };
}
