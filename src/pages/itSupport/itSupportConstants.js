/** IT Support — statuses, priorities, impact, and badge colours. */

export const IT_SUPPORT_BASE = "/app/it-support";

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

export const ACCESS_KEYS = {
  raise: "itIs.helpdesk",
  agent: "itIs.helpdesk-agent",
  admin: "itIs.helpdesk-admin",
};

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
