/**
 * Money / label formatters used by Site Ledger (extracted verbatim from SiteLedgerApp.jsx).
 * Note: intentionally separate from ../../lib/formatters.js — slug() fallback and null handling differ.
 */
export const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
export function inrShort(n) {
  const a = Math.abs(n || 0), s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}k`;
  return `${s}₹${Math.round(a)}`;
}
export const pct = (n) => (n || 0).toFixed(1) + "%";
export const slug = (s) => (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "head");
