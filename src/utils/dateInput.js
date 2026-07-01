import { normalizeToIsoDate } from "./dateDisplay";

/** Shared bounds for date fields (validated on blur, not while typing). */
export const DATE_INPUT_MIN = "1900-01-01";
export const DATE_INPUT_MAX = "9999-12-31";

const COMPLETE_ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when value is a full YYYY-MM-DD string (not an in-progress partial). */
export function isCompleteIsoDate(value) {
  return COMPLETE_ISO_DATE.test(String(value || ""));
}

/**
 * Allow empty and in-progress partial values while typing.
 * Reject only overlong values, >4-digit years, or complete dates outside min/max.
 */
export function isValidDateInputValue(value) {
  const raw = String(value ?? "");
  if (!raw) return true;
  if (raw.length > 10) return false;

  const [year = ""] = raw.split("-");
  if (year.length > 4) return false;

  if (isCompleteIsoDate(raw)) {
    return raw >= DATE_INPUT_MIN && raw <= DATE_INPUT_MAX;
  }

  return true;
}

/** Normalize a date input value for controlled React state. */
export function normalizeDateInputValue(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  if (!isValidDateInputValue(raw)) {
    if (isCompleteIsoDate(raw)) return "";
    return raw.slice(0, 10);
  }
  return raw;
}

/** ISO YYYY-MM-DD → dd/mm/yyyy for manual entry display. */
export function isoToDisplayDate(value) {
  const raw = String(value ?? "").trim();
  if (!isCompleteIsoDate(raw)) return "";
  const [year, month, day] = raw.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Parse dd-mm-yyyy (or dd/mm/yyyy, mm-dd-yyyy) to ISO.
 * Returns `null` while year is incomplete (<4 digits) so day/month are not cleared.
 */
export function parseDisplayDateToIso(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  const parts = raw.split(/[/.-]/).map((p) => p.replace(/\D/g, ""));
  const [d = "", m = "", y = ""] = parts;

  if (!d && !m && !y) return "";

  if (y.length > 0 && y.length < 4) return null;

  if (y.length === 4 && d && m) {
    const iso = normalizeToIsoDate(`${d}-${m}-${y}`);
    return iso || "";
  }

  return null;
}

/**
 * Native date inputs: do NOT set min/max while typing (browser clears day/month when
 * year starts below min, e.g. 0002-06-15). Bounds are checked on blur instead.
 */
export function enforceDateInputAttributes(input) {
  if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
  input.removeAttribute("min");
  input.removeAttribute("max");
  input.lang = "en-GB";
  input.dataset.dateMin = DATE_INPUT_MIN;
  input.dataset.dateMax = DATE_INPUT_MAX;
}

/**
 * For controlled `<input type="date">` onChange handlers.
 * Ignores spurious empty values while focused (browser drops day/month when year starts).
 */
export function resolveNativeDateInputChange(event, currentValue) {
  const next = String(event.target?.value ?? "");
  if (!next && currentValue && document.activeElement === event.target) {
    return currentValue;
  }
  return normalizeDateInputValue(next);
}

/** On blur: clear only finished dates outside allowed range. */
export function finalizeDateInputValue(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  if (!isCompleteIsoDate(raw)) return raw;
  if (raw < DATE_INPUT_MIN || raw > DATE_INPUT_MAX) return "";
  return raw;
}
