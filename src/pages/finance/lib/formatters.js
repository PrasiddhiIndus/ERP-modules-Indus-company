import { normalizeToIsoDate } from "../../../utils/dateDisplay";

export const inr = (n) => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export function inrShort(n) {
  const num = Number(n) || 0;
  const a = Math.abs(num);
  const s = num < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}k`;
  return `${s}₹${Math.round(a)}`;
}

export const pct = (n) => (Number(n) || 0).toFixed(1) + "%";

export const slug = (s) =>
  (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item");

/** Finance UI: dd/mm/yyyy */
export function formatFinanceDate(value) {
  const iso = normalizeToIsoDate(value);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatFinanceDateTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const date = formatFinanceDate(d);
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${date} ${time}`;
  } catch {
    return "";
  }
}

export function parseFinanceDateInput(text) {
  return normalizeToIsoDate(String(text || "").trim());
}

/** Display finance head / line labels in title case when stored as ALL CAPS. */
export function formatFinanceLabel(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || letters !== letters.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^(\w)/, (c) => c.toUpperCase()))
    .join(" ");
}
