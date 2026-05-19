/** AMC workflow status values and UI tone mapping */

export const CONTRACT_STATUS = [
  "draft",
  "active",
  "running",
  "expiring_soon",
  "renewed",
  "expired",
  "terminated",
  "at_risk",
];

export const PM_STATUS = [
  "generated",
  "planned",
  "assigned",
  "due",
  "in_progress",
  "completed",
  "report_pending",
  "closed",
  "rescheduled",
  "cancelled",
  "overdue",
];

export const COMPLAINT_STATUS = [
  "logged",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
  "escalated",
  "on_hold",
  "revisit_required",
  "sla_breached",
];

export const VISIT_STATUS = [
  "created",
  "assigned",
  "started",
  "completed",
  "report_uploaded",
  "signoff_completed",
  "closed",
  "pending_report",
  "pending_signoff",
  "revisit_required",
];

export const SLA_STATUS = ["within_sla", "near_breach", "breached"];

export const ALERT_TYPES = [
  "pm_overdue",
  "complaint_near_breach",
  "complaint_breached",
  "contract_expiring",
  "report_pending",
  "repeat_breakdown",
  "site_not_serviced",
  "engineer_unassigned",
];

export const STATUS_TONE = {
  active: "info",
  running: "info",
  draft: "info",
  generated: "info",
  planned: "info",
  assigned: "info",
  logged: "info",
  created: "info",
  within_sla: "info",
  expiring_soon: "warning",
  due: "warning",
  near_breach: "warning",
  report_pending: "warning",
  pending_report: "warning",
  pending_signoff: "warning",
  overdue: "high",
  at_risk: "high",
  escalated: "high",
  sla_breached: "critical",
  breached: "critical",
  terminated: "critical",
  expired: "critical",
  cancelled: "info",
  closed: "info",
  completed: "info",
  resolved: "info",
};

export function formatStatusLabel(value) {
  if (!value) return "—";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
