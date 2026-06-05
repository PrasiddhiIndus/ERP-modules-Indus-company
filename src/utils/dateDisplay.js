/**
 * Canonical UI + export date format: dd-mm-yyyy
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_DASH_RE = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const DMY_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export const UI_DATE_FORMAT_LABEL = "dd-mm-yyyy";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDdMmYyyy(dd, mm, yyyy) {
  return `${pad2(dd)}-${pad2(mm)}-${yyyy}`;
}

/** yyyy-mm-dd, ISO datetime, dd/mm/yyyy, dd-mm-yyyy, or Date → dd-mm-yyyy */
export function formatDateDdMmYyyy(value) {
  if (value == null || String(value).trim() === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toDdMmYyyy(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }
  const s = String(value).trim();
  const dash = s.match(DMY_DASH_RE);
  if (dash) return toDdMmYyyy(dash[1], dash[2], dash[3]);
  const slash = s.match(DMY_SLASH_RE);
  if (slash) return toDdMmYyyy(slash[1], slash[2], slash[3]);
  const iso = s.match(ISO_DATE_RE);
  if (iso) return toDdMmYyyy(iso[3], iso[2], iso[1]);
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return toDdMmYyyy(dt.getDate(), dt.getMonth() + 1, dt.getFullYear());
  }
  return s;
}

/** Alias for exports and shared display. */
export const formatDateForDisplay = formatDateDdMmYyyy;
export const formatDateForExport = formatDateDdMmYyyy;

const DATE_FIELD_KEY_RE =
  /(date|_at$|_on$|from$|to$|dob$|expiry|valid_until|valid_until|invoice_date|punch_date|enquiry_date|quotation_date|follow_up_date|revision_date|awarded_date|delivery_date|start_date|end_date|service_period|billing_month)/i;

export function isDateLikeFieldKey(key) {
  return DATE_FIELD_KEY_RE.test(String(key || ""));
}

export function isDateLikeValue(value) {
  if (value == null || value === "") return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const s = String(value).trim();
  if (ISO_DATE_RE.test(s)) return true;
  if (DMY_DASH_RE.test(s)) return true;
  if (DMY_SLASH_RE.test(s)) return true;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return true;
  return false;
}

/** Format date-like values in export row objects. */
export function formatDatesInExportRow(row, { extraKeys = [] } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (extraKeys.includes(key) || isDateLikeFieldKey(key) || isDateLikeValue(value)) {
      const formatted = formatDateDdMmYyyy(value);
      if (formatted) out[key] = formatted;
    }
  }
  return out;
}

export function formatDatesInExportRows(rows, options) {
  return (rows || []).map((row) => formatDatesInExportRow(row, options));
}
