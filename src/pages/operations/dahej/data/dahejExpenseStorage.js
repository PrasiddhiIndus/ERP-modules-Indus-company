import { emptyDahejExpenseRow, DAHEJ_BOOKING_LOCATION_TYPES } from "../constants/columns";

const KEYS = {
  entries: "dahej-expenses-entries-v1",
  vehicles: "dahej-expenses-vehicles-v1",
  bookingLocations: "dahej-expenses-booking-locations-v1",
  monthClosings: "dahej-expenses-month-closings-v1",
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function loadDahejEntries(includeDeleted = false) {
  const list = read(KEYS.entries);
  return includeDeleted ? list : list.filter((e) => !e.deleted_at);
}

export function saveDahejEntries(list) {
  write(KEYS.entries, list);
}

export function upsertDahejEntry(entry, actor = "System") {
  const list = read(KEYS.entries);
  const now = new Date().toISOString();
  const idx = list.findIndex((e) => e.id === entry.id);
  const prev = idx >= 0 ? list[idx] : null;
  const base = prev || emptyDahejExpenseRow({ id: entry.id || `de-${Date.now()}` });
  const next = {
    ...base,
    ...entry,
    modified_by: actor,
    modified_at: now,
    change_log: [
      ...(prev?.change_log || base.change_log || []),
      { at: now, by: actor, action: prev ? "updated" : "created" },
    ],
  };
  if (!prev) {
    next.created_by = actor;
    next.created_at = now;
  }
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  write(KEYS.entries, list);
  return next;
}

export function softDeleteDahejEntry(id, actor = "System") {
  const list = read(KEYS.entries);
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  list[idx] = {
    ...list[idx],
    deleted_at: now,
    modified_by: actor,
    modified_at: now,
    change_log: [...(list[idx].change_log || []), { at: now, by: actor, action: "soft_deleted" }],
  };
  write(KEYS.entries, list);
  return list[idx];
}

export function bulkUpsertDahejEntries(rows, actor = "System") {
  return rows.map((r) => upsertDahejEntry(r, actor));
}

/** Vehicle Master — configurable; no sheet row data */
export function loadDahejVehicles() {
  return read(KEYS.vehicles);
}

export function saveDahejVehicles(list) {
  write(KEYS.vehicles, list);
}

export function upsertDahejVehicle(vehicle, actor = "System") {
  const list = read(KEYS.vehicles);
  const now = new Date().toISOString();
  const id = vehicle.id || `veh-${Date.now()}`;
  const idx = list.findIndex((v) => v.id === id);
  const row = {
    id,
    name: vehicle.name || "",
    registration_no: vehicle.registration_no || "",
    vehicle_type: vehicle.vehicle_type || "",
    is_active: vehicle.is_active !== false,
    created_at: idx >= 0 ? list[idx].created_at : now,
    modified_at: now,
    modified_by: actor,
  };
  if (idx >= 0) list[idx] = row;
  else list.push(row);
  write(KEYS.vehicles, list);
  return row;
}

/** Booking location master — links to Site Master where applicable */
export function loadDahejBookingLocations() {
  const saved = read(KEYS.bookingLocations);
  if (saved.length) return saved;
  return DAHEJ_BOOKING_LOCATION_TYPES.map((label, i) => ({
    id: `bl-default-${i}`,
    name: label,
    location_type: label,
    site_id: "",
    is_active: true,
  }));
}

export function saveDahejBookingLocations(list) {
  write(KEYS.bookingLocations, list);
}

export function upsertDahejBookingLocation(loc, actor = "System") {
  const list = read(KEYS.bookingLocations);
  const hasSaved = list.length > 0;
  const base = hasSaved ? list : DAHEJ_BOOKING_LOCATION_TYPES.map((label, i) => ({
    id: `bl-default-${i}`,
    name: label,
    location_type: label,
    site_id: "",
    is_active: true,
  }));
  const working = hasSaved ? [...list] : [...base];
  const id = loc.id || `bl-${Date.now()}`;
  const idx = working.findIndex((l) => l.id === id);
  const row = {
    id,
    name: loc.name || "",
    location_type: loc.location_type || "",
    site_id: loc.site_id || "",
    is_active: loc.is_active !== false,
    modified_by: actor,
    modified_at: new Date().toISOString(),
  };
  if (idx >= 0) working[idx] = row;
  else working.push(row);
  write(KEYS.bookingLocations, working);
  return row;
}

export function loadMonthClosings() {
  return read(KEYS.monthClosings);
}

export function closeDahejMonth(monthKey, actor = "System", summary = {}) {
  const list = read(KEYS.monthClosings);
  const now = new Date().toISOString();
  const row = {
    id: `mc-${monthKey}`,
    month_key: monthKey,
    closed_at: now,
    closed_by: actor,
    summary,
  };
  const idx = list.findIndex((m) => m.month_key === monthKey);
  if (idx >= 0) list[idx] = row;
  else list.push(row);
  write(KEYS.monthClosings, list);
  return row;
}

export function isMonthClosed(monthKey) {
  return loadMonthClosings().some((m) => m.month_key === monthKey);
}

export function entriesForMonth(monthKey) {
  return loadDahejEntries().filter((e) => e.month_key === monthKey);
}

export function sumCurrency(row, keys) {
  return keys.reduce((s, k) => s + (Number(row[k]) || 0), 0);
}

export function rowTotalExpense(row) {
  const keys = [
    "amount",
    "inventory_item",
    "fuel_camper",
    "service_camper",
    "fuel_maruti_eco",
    "service_maruti_eco",
    "fuel_bike",
    "service_bike",
    "fuel_fire_tender",
    "service_fire_tender",
    "other_service_supplies",
  ];
  return sumCurrency(row, keys);
}

export function computeRunningBalance(rows) {
  let balance = 0;
  return rows.map((row) => {
    const advance = Number(row.advance_amount_paid) || 0;
    const expense = rowTotalExpense(row);
    if (advance) balance += advance;
    balance -= expense;
    return { ...row, _row_expense_total: expense, _running_balance: balance };
  });
}
