import { normalizeDbDate } from "./attendanceDaily";
import { normalizeToIsoDate } from "../utils/dateDisplay";

export const HOLIDAY_TABLE = "admin_national_public_holidays";

export const HOLIDAY_TYPE_OPTIONS = [
  { value: "NH", label: "NH — National Holiday" },
  { value: "PH", label: "PH — Public Holiday" },
];

export function normalizeHolidayType(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (v === "NH" || v === "NATIONALHOLIDAY" || v === "NATIONAL") return "NH";
  if (v === "PH" || v === "PUBLICHOLIDAY" || v === "PUBLIC") return "PH";
  return "";
}

export function holidayTypeLabel(type) {
  const t = normalizeHolidayType(type);
  return HOLIDAY_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? (t || "—");
}

function mapHolidayRow(row) {
  const holiday_date = normalizeDbDate(row?.holiday_date);
  const calendar_year = Number(row?.calendar_year) || (holiday_date ? Number(holiday_date.slice(0, 4)) : null);
  return {
    id: row.id,
    sr_no: row.sr_no ?? null,
    holiday_date,
    calendar_year,
    holiday_type: normalizeHolidayType(row.holiday_type),
    remarks: String(row.remarks ?? "").trim(),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchNationalPublicHolidays(supabase, { year = null } = {}) {
  let query = supabase
    .from(HOLIDAY_TABLE)
    .select("id,sr_no,holiday_date,calendar_year,holiday_type,remarks,created_at,updated_at")
    .order("holiday_date", { ascending: true });

  if (year != null && Number.isFinite(Number(year))) {
    query = query.eq("calendar_year", Number(year));
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapHolidayRow).filter((r) => r.holiday_date);
}

export async function fetchNationalPublicHolidayDatesInRange(supabase, fromDate, toDate) {
  const from = normalizeDbDate(fromDate);
  const to = normalizeDbDate(toDate);
  if (!from || !to) return [];

  const { data, error } = await supabase
    .from(HOLIDAY_TABLE)
    .select("holiday_date")
    .gte("holiday_date", from)
    .lte("holiday_date", to)
    .order("holiday_date", { ascending: true });

  if (error) throw error;
  return [...new Set((data || []).map((r) => normalizeDbDate(r.holiday_date)).filter(Boolean))];
}

export function collectConfiguredHolidayDates(holidayRows, year) {
  const y = String(year ?? "");
  const out = new Set();
  for (const row of holidayRows || []) {
    const d = normalizeDbDate(row.holiday_date);
    if (!d) continue;
    if (y && !d.startsWith(y)) continue;
    out.add(d);
  }
  return out;
}

export function nextHolidaySrNo(existingRows, calendarYear, { excludeId = null } = {}) {
  const y = Number(calendarYear);
  let max = 0;
  for (const row of existingRows || []) {
    if (excludeId && row?.id === excludeId) continue;
    if (Number.isFinite(y) && Number(row?.calendar_year) !== y) continue;
    const n = Number(row?.sr_no);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
}

export function buildHolidayDbRow(input) {
  const rawDate = input?.holiday_date;
  const isoCandidate =
    rawDate && typeof rawDate === "object" && rawDate.target
      ? String(rawDate.target.value || "")
      : String(rawDate ?? "");
  const holiday_date = normalizeDbDate(normalizeToIsoDate(isoCandidate) || isoCandidate);
  if (!holiday_date) return null;
  const holiday_type = normalizeHolidayType(input.holiday_type);
  if (!holiday_type) return null;
  const calendar_year = Number(input.calendar_year) || Number(holiday_date.slice(0, 4));
  const sr_no = input.sr_no == null || input.sr_no === "" ? null : Number(input.sr_no);
  return {
    sr_no: Number.isFinite(sr_no) ? Math.round(sr_no) : null,
    holiday_date,
    calendar_year,
    holiday_type,
    remarks: String(input.remarks ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };
}

export async function upsertNationalPublicHoliday(
  supabase,
  input,
  { id = null, existingRows = [] } = {}
) {
  const row = buildHolidayDbRow(input);
  if (!row) throw new Error("Date and holiday type (NH/PH) are required.");

  if (!row.sr_no) {
    if (id) {
      const existing = (existingRows || []).find((r) => r.id === id);
      row.sr_no = existing?.sr_no ?? nextHolidaySrNo(existingRows, row.calendar_year, { excludeId: id });
    } else {
      row.sr_no = nextHolidaySrNo(existingRows, row.calendar_year);
    }
  }

  if (id) {
    const { data, error } = await supabase
      .from(HOLIDAY_TABLE)
      .update(row)
      .eq("id", id)
      .select("id,sr_no,holiday_date,calendar_year,holiday_type,remarks,created_at,updated_at")
      .single();
    if (error) throw error;
    return mapHolidayRow(data);
  }

  const { data, error } = await supabase
    .from(HOLIDAY_TABLE)
    .insert(row)
    .select("id,sr_no,holiday_date,calendar_year,holiday_type,remarks,created_at,updated_at")
    .single();
  if (error) throw error;
  return mapHolidayRow(data);
}

export async function upsertNationalPublicHolidaysBatch(supabase, payloads, existingRows = []) {
  const built = (payloads || []).map(buildHolidayDbRow).filter(Boolean);
  if (!built.length) return { count: 0 };

  const byYear = new Map();
  for (const row of built) {
    const list = byYear.get(row.calendar_year) || [];
    list.push(row);
    byYear.set(row.calendar_year, list);
  }

  for (const [calendarYear, yearRows] of byYear.entries()) {
    let nextSr = nextHolidaySrNo(existingRows, calendarYear);
    const sorted = [...yearRows].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
    for (const row of sorted) {
      if (!row.sr_no) {
        row.sr_no = nextSr;
        nextSr += 1;
      }
    }
  }

  const { error } = await supabase.from(HOLIDAY_TABLE).upsert(built, { onConflict: "holiday_date" });
  if (error) throw error;
  return { count: built.length };
}

export async function deleteNationalPublicHoliday(supabase, id) {
  const { error } = await supabase.from(HOLIDAY_TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function deleteNationalPublicHolidaysByYear(supabase, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return;
  const { error } = await supabase.from(HOLIDAY_TABLE).delete().eq("calendar_year", y);
  if (error) throw error;
}
