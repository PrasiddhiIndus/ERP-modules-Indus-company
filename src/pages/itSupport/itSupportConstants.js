/** IT Support — statuses, priorities, impact, and badge colours. */

export const IT_SUPPORT_BASE = "/app/it-support";

/** Primary module split — same ticket engine, separate queues. */
export const SUPPORT_TYPES = [
  {
    value: "software",
    label: "Software Support",
    short: "Software",
    hint: "ERP, Indus One, apps, login, data errors",
  },
  {
    value: "hardware",
    label: "Hardware Support",
    short: "Hardware",
    hint: "Laptops, printers, networking, peripherals, repairs",
  },
];

export const SUPPORT_TYPE_MAP = Object.fromEntries(SUPPORT_TYPES.map((t) => [t.value, t]));

export function normalizeSupportType(value) {
  return value === "hardware" ? "hardware" : "software";
}

export function supportTypeLabel(value) {
  return SUPPORT_TYPE_MAP[normalizeSupportType(value)]?.label || "Software Support";
}

/** Build a path under /app/it-support/software|hardware[/suffix]. */
export function supportTypePath(type, suffix = "") {
  const base = `${IT_SUPPORT_BASE}/${normalizeSupportType(type)}`;
  const clean = String(suffix || "").replace(/^\/+/, "");
  return clean ? `${base}/${clean}` : base;
}

export const IMPACT_OPTIONS = [
  { value: "only_me", label: "Only me" },
  { value: "my_team", label: "My team" },
  { value: "whole_office", label: "Whole office" },
];

export const IMPACT_LABELS = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label]));

export const PRIORITIES = [
  { value: "critical", label: "Critical", tone: "bg-critical-soft text-critical border-critical-border" },
  { value: "high", label: "High", tone: "bg-warning-soft text-warning border-warning-border" },
  { value: "medium", label: "Medium", tone: "bg-info-soft text-info border-info-border" },
  { value: "low", label: "Low", tone: "bg-neutral-state-soft text-neutral-state border-neutral-state-border" },
];

export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.value, p]));

/** Critical=red, High=orange, Medium=blue, Low=grey — also used for inline chips. */
export const PRIORITY_BADGE_CLASS = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export const STATUSES = [
  { value: "new", label: "New", tone: "bg-violet-50 text-violet-700 border-violet-200", severity: "info" },
  { value: "open", label: "Open", tone: "bg-sky-50 text-sky-700 border-sky-200", severity: "info" },
  { value: "in_progress", label: "In progress", tone: "bg-amber-50 text-amber-800 border-amber-200", severity: "warning" },
  { value: "on_hold", label: "On hold", tone: "bg-slate-100 text-slate-700 border-slate-300", severity: "neutral" },
  { value: "resolved", label: "Resolved", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", severity: "info" },
  { value: "closed", label: "Closed", tone: "bg-zinc-100 text-zinc-600 border-zinc-200", severity: "neutral" },
  { value: "reopened", label: "Reopened", tone: "bg-rose-50 text-rose-700 border-rose-200", severity: "high" },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.value, s]));

/** Kanban column order (active work). */
export const KANBAN_STATUSES = ["new", "open", "in_progress", "on_hold", "resolved", "reopened"];

export const QUEUE_STATUSES = STATUSES.map((s) => s.value);

/** Software Support — existing User Management keys (unchanged). */
export const ACCESS_KEYS = {
  raise: "itIs.helpdesk",
  agent: "itIs.helpdesk-agent",
  admin: "itIs.helpdesk-admin",
};

/** Hardware Support — parent + page keys (User Management under IT/IS). */
export const HARDWARE_SUPPORT_PARENT_KEY = "itIs.hardware-support";

export const HARDWARE_ACCESS_KEYS = {
  parent: HARDWARE_SUPPORT_PARENT_KEY,
  raise: "itIs.hardware-support.raise",
  dashboard: "itIs.hardware-support.dashboard",
  queue: "itIs.hardware-support.queue",
  tickets: "itIs.hardware-support.tickets",
  masters: "itIs.hardware-support.masters",
  reports: "itIs.hardware-support.reports",
};

/** Page grants shown under Hardware Support in User Management. */
export const HARDWARE_SUPPORT_PAGES = [
  {
    value: HARDWARE_ACCESS_KEYS.raise,
    label: "Raise Ticket",
    paths: [`${IT_SUPPORT_BASE}/hardware/raise`],
  },
  {
    value: HARDWARE_ACCESS_KEYS.dashboard,
    label: "Dashboard",
    paths: [`${IT_SUPPORT_BASE}/hardware`],
  },
  {
    value: HARDWARE_ACCESS_KEYS.queue,
    label: "Queue",
    paths: [`${IT_SUPPORT_BASE}/hardware/queue`],
  },
  {
    value: HARDWARE_ACCESS_KEYS.tickets,
    label: "Ticket Details",
    paths: [`${IT_SUPPORT_BASE}/tickets`],
  },
  {
    value: HARDWARE_ACCESS_KEYS.masters,
    label: "Masters",
    paths: [`${IT_SUPPORT_BASE}/masters`],
  },
  {
    value: HARDWARE_ACCESS_KEYS.reports,
    label: "Reports",
    paths: [`${IT_SUPPORT_BASE}/reports`],
  },
];

export function statusLabel(value) {
  return STATUS_MAP[value]?.label || value || "—";
}

export function priorityLabel(value) {
  if (!value) return "Unset";
  return PRIORITY_MAP[value]?.label || value;
}

export function impactLabel(value) {
  return IMPACT_LABELS[value] || value || "—";
}
