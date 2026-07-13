import { API_STATUS_LABELS } from "../config/apiConstants";

export function formatMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return `${n} ms`;
}

export function uptimeBarColor(percent, t) {
  const n = Number(percent) || 0;
  if (n >= 99) return t.progressGreen;
  if (n >= 95) return t.progressAmber;
  return t.progressRed;
}

export function statusTone(status, t) {
  if (status === "online") return t.statusOnline;
  if (status === "degraded") return t.statusDegraded;
  if (status === "offline") return t.statusOffline;
  return t.badgeNeutral;
}

export function statusDotColor(status) {
  if (status === "online") return "bg-emerald-500";
  if (status === "degraded") return "bg-amber-500";
  if (status === "offline") return "bg-red-500";
  return "bg-gray-400";
}

export function statusLabel(status) {
  return API_STATUS_LABELS[status] || status || "Unknown";
}
