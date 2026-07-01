/**
 * Canonical ERP date format: DD/MM/YYYY (en-GB display, locale-independent).
 * Storage remains ISO YYYY-MM-DD everywhere.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const DMY_DASH_RE = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const DMY_SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export const ERP_DATE_LOCALE = "en-GB";
export const UI_DATE_FORMAT_LABEL = "dd/mm/yyyy";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDdMmYyyy(dd, mm, yyyy) {
  return `${pad2(dd)}/${pad2(mm)}/${yyyy}`;
}

function isoFromParts(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
}

/** Resolve d-m-y / m-d-y — default dd/mm/yyyy; swap when a part is > 12. */
function isoFromAmbiguousParts(a, b, year) {
  const n1 = Number(a);
  const n2 = Number(b);
  let day;
  let month;
  if (n1 > 12 && n2 <= 12) {
    day = n1;
    month = n2;
  } else if (n2 > 12 && n1 <= 12) {
    month = n1;
    day = n2;
  } else if (n1 > 12 && n2 > 12) {
    return "";
  } else {
    day = n1;
    month = n2;
  }
  return isoFromParts(day, month, year);
}

/**
 * Parse assorted date strings → ISO YYYY-MM-DD (storage).
 * Handles ISO, dd/mm/yyyy, dd-mm-yyyy, mm-dd-yyyy (Excel US export), and datetimes.
 */
export function normalizeToIsoDate(value) {
  if (value == null || String(value).trim() === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoFromParts(value.getDate(), value.getMonth() + 1, value.getFullYear());
  }

  const s = String(value).trim();

  const iso = s.match(ISO_DATE_RE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  const dash = s.match(DMY_DASH_RE);
  if (dash) return isoFromAmbiguousParts(dash[1], dash[2], dash[3]);

  const slash = s.match(DMY_SLASH_RE);
  if (slash) return isoFromAmbiguousParts(slash[1], slash[2], slash[3]);

  const short = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (short) {
    const year = short[3].length === 2 ? `20${short[3]}` : short[3];
    return isoFromAmbiguousParts(short[1], short[2], year);
  }

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return isoFromParts(dt.getDate(), dt.getMonth() + 1, dt.getFullYear());
  }
  return "";
}

/** yyyy-mm-dd, ISO datetime, dd/mm/yyyy, dd-mm-yyyy, mm-dd-yyyy, or Date → dd/mm/yyyy */
export function formatDateDdMmYyyy(value) {
  if (value == null || String(value).trim() === "") return "";
  const iso = normalizeToIsoDate(value);
  if (iso) {
    const [y, m, d] = iso.split("-");
    return toDdMmYyyy(d, m, y);
  }
  return String(value).trim();
}

/** Alias for exports and shared display. */
export const formatDateForDisplay = formatDateDdMmYyyy;
export const formatDateForExport = formatDateDdMmYyyy;

/** Date + 24h time as dd/mm/yyyy HH:mm (en-GB, not OS locale). */
export function formatDateTimeDdMmYyyy(value) {
  if (value == null || String(value).trim() === "") return "";
  const s = String(value).trim();
  const isoDate = normalizeToIsoDate(s);
  if (!isoDate && !/T/.test(s)) {
    return formatDateDdMmYyyy(value);
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return formatDateDdMmYyyy(value) || "";
  const datePart = formatDateDdMmYyyy(dt);
  const timePart = dt.toLocaleTimeString(ERP_DATE_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}

/** Month label e.g. "June 2025" — English month names, not OS-dependent short dates. */
export function formatMonthYearLabel(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || m < 1 || m > 12) return "";
  const d = new Date(y, m - 1, 1);
  const monthName = d.toLocaleString(ERP_DATE_LOCALE, { month: "long" });
  return `${monthName} ${y}`;
}

/** From ISO date or Date — month + year only. */
export function formatMonthYearFromValue(value) {
  const iso = normalizeToIsoDate(value);
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return formatMonthYearLabel(y, m);
}

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
