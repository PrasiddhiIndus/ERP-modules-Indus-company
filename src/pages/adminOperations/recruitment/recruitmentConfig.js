/**
 * In-house Recruitment (Admin) — UI configuration: pipeline stages, status vocabularies and tones.
 * Keys match the workflow statuses enforced on the server.
 */

export const RECRUITMENT_BASE = "/app/admin/recruitment";

export const RECRUITMENT_SECTIONS = [
  { key: "dashboard", label: "Dashboard", to: ".", end: true, cap: "view" },
  { key: "requisitions", label: "Requisitions", to: "requisitions", cap: "view" },
  { key: "candidates", label: "Candidates", to: "candidates", cap: "view" },
  { key: "interviews", label: "Interviews", to: "interviews", cap: "view" },
  { key: "offers", label: "Offers", to: "offers", cap: "offers" },
  { key: "documents", label: "Documents", to: "documents", cap: "documents" },
  { key: "joining", label: "Joining", to: "joining", cap: "view" },
  { key: "conversion", label: "Employee Conversion", to: "conversion", cap: "view" },
  { key: "communication", label: "Communication", to: "communication", cap: "view" },
  { key: "reports", label: "Reports", to: "reports", cap: "view" },
  { key: "settings", label: "Settings", to: "settings", cap: "settings" },
];

/** Severity → token classes (matches the ERP semantic palette). */
export const TONE_CLASSES = {
  neutral: "bg-surface-sunken text-ink-secondary border-border",
  info: "bg-info-soft text-info border-info-border",
  accent: "bg-accent-soft text-accent-deep border-accent-border",
  success: "bg-success-soft text-success border-success-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  critical: "bg-critical-soft text-critical border-critical-border",
};

export const TONE_DOT = {
  neutral: "bg-ink-muted",
  info: "bg-info",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
};

export const PIPELINE_STAGES = [
  { key: "new", label: "New", tone: "neutral" },
  { key: "screening", label: "Screening", tone: "info" },
  { key: "shortlisted", label: "Shortlisted", tone: "info" },
  { key: "interview", label: "Interview", tone: "accent" },
  { key: "selected", label: "Selected", tone: "accent" },
  { key: "offer", label: "Offer", tone: "warning" },
  { key: "offer_accepted", label: "Offer Accepted", tone: "success" },
  { key: "appointment", label: "Appointment", tone: "warning" },
  { key: "documents", label: "Documents", tone: "warning" },
  { key: "ready_to_join", label: "Ready to Join", tone: "success" },
  { key: "joined", label: "Joined", tone: "success" },
  { key: "employee_created", label: "Employee Created", tone: "success" },
];

export const STAGE_INDEX = Object.fromEntries(PIPELINE_STAGES.map((s, i) => [s.key, i]));

/** Stages a recruiter can move a candidate to by hand (others follow from workflow actions). */
export const MANUAL_STAGES = ["screening", "shortlisted", "selected"];

export const CANDIDATE_OUTCOMES = [
  { key: "rejected", label: "Rejected", tone: "critical" },
  { key: "withdrawn", label: "Withdrawn", tone: "neutral" },
  { key: "no_show", label: "No-show", tone: "critical" },
  { key: "offer_declined", label: "Offer Declined", tone: "critical" },
  { key: "offer_expired", label: "Offer Expired", tone: "warning" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
];

/** Outcomes a recruiter can choose when closing a candidate. */
export const CLOSE_OUTCOMES = ["rejected", "withdrawn", "cancelled"];

export const INTERVIEW_STATUSES = [
  { key: "scheduled", label: "Scheduled", tone: "info" },
  { key: "attended", label: "Attended", tone: "accent" },
  { key: "evaluated", label: "Evaluated", tone: "success" },
  { key: "no_show", label: "No-show", tone: "critical" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
  { key: "rescheduled", label: "Rescheduled", tone: "warning" },
];

export const INTERVIEW_MODES = [
  { key: "office", label: "Office" },
  { key: "online", label: "Online" },
  { key: "phone", label: "Phone" },
];

export const INTERVIEW_RECOMMENDATIONS = [
  { key: "strong_hire", label: "Strong hire", tone: "success" },
  { key: "hire", label: "Hire", tone: "success" },
  { key: "hold", label: "Hold", tone: "warning" },
  { key: "reject", label: "Reject", tone: "critical" },
];

export const CALL_OUTCOMES = [
  { key: "connected", label: "Connected" },
  { key: "no_answer", label: "No answer" },
  { key: "busy", label: "Busy" },
  { key: "switched_off", label: "Switched off" },
  { key: "wrong_number", label: "Wrong number" },
  { key: "call_back", label: "Asked to call back" },
  { key: "not_interested", label: "Not interested" },
];

export const SCREENING_RESULTS = [
  { key: "pass", label: "Pass", tone: "success" },
  { key: "hold", label: "Hold", tone: "warning" },
  { key: "fail", label: "Fail", tone: "critical" },
];

export const OFFER_STATUSES = [
  { key: "draft", label: "Draft", tone: "neutral" },
  { key: "generated", label: "Generated", tone: "info" },
  { key: "sent", label: "Sent", tone: "accent" },
  { key: "viewed", label: "Viewed", tone: "warning" },
  { key: "accepted", label: "Accepted", tone: "success" },
  { key: "declined", label: "Declined", tone: "critical" },
  { key: "expired", label: "Expired", tone: "critical" },
  { key: "withdrawn", label: "Withdrawn", tone: "neutral" },
];

export const APPOINTMENT_STATUSES = [
  { key: "generated", label: "Generated", tone: "info" },
  { key: "sent", label: "Sent", tone: "accent" },
  { key: "viewed", label: "Viewed", tone: "warning" },
  { key: "signed", label: "Signed", tone: "success" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
];

export const DOCUMENT_STATUSES = [
  { key: "pending", label: "Pending", tone: "neutral" },
  { key: "submitted", label: "Submitted", tone: "info" },
  { key: "under_review", label: "Under Review", tone: "warning" },
  { key: "verified", label: "Verified", tone: "success" },
  { key: "rejected", label: "Rejected", tone: "critical" },
];

export const REQUISITION_STATUSES = [
  { key: "draft", label: "Draft", tone: "neutral" },
  { key: "submitted", label: "Submitted", tone: "info" },
  { key: "pending_approval", label: "Pending Approval", tone: "warning" },
  { key: "approved", label: "Approved", tone: "info" },
  { key: "rejected", label: "Rejected", tone: "critical" },
  { key: "open", label: "Open", tone: "accent" },
  { key: "filled", label: "Filled", tone: "success" },
  { key: "cancelled", label: "Cancelled", tone: "neutral" },
];

export const REQUISITION_PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];

export const EMPLOYMENT_TYPES = ["Permanent", "Probation", "Contract", "Consultant", "Voucher"];

export const DELIVERY_STATUSES = [
  { key: "queued", label: "Queued", tone: "neutral" },
  { key: "sending", label: "Sending", tone: "info" },
  { key: "sent", label: "Sent", tone: "success" },
  { key: "failed", label: "Failed", tone: "critical" },
  { key: "skipped", label: "Skipped", tone: "neutral" },
];

export const CONVERSION_STATUSES = [
  { key: "pending", label: "Pending", tone: "warning" },
  { key: "converted", label: "Converted", tone: "success" },
];

export const TEMPLATE_CATEGORIES = [
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "appointment", label: "Appointment" },
  { key: "documents", label: "Documents" },
  { key: "joining", label: "Joining" },
  { key: "general", label: "General" },
];

export const TEMPLATE_PLACEHOLDERS = [
  "{{candidate_name}}",
  "{{company_name}}",
  "{{position}}",
  "{{location}}",
  "{{interview_date}}",
  "{{interview_time}}",
  "{{interview_mode}}",
  "{{interview_location}}",
  "{{offer_ref}}",
  "{{expiry_date}}",
  "{{appointment_ref}}",
  "{{joining_date}}",
  "{{pending_documents}}",
  "{{portal_link}}",
];

/** Timeline vocabulary for recorded workflow events. */
export const ACTIVITY_TYPES = {
  candidate_added: { label: "Candidate added", tone: "neutral" },
  imported: { label: "Imported", tone: "neutral" },
  profile_updated: { label: "Profile updated", tone: "neutral" },
  resume_uploaded: { label: "Resume uploaded", tone: "neutral" },
  note: { label: "Note", tone: "neutral" },
  called: { label: "Call logged", tone: "info" },
  screened: { label: "Screening", tone: "info" },
  stage_changed: { label: "Stage changed", tone: "accent" },
  closed: { label: "Closed", tone: "critical" },
  reopened: { label: "Reopened", tone: "info" },
  interview_scheduled: { label: "Interview scheduled", tone: "accent" },
  interview_rescheduled: { label: "Interview rescheduled", tone: "warning" },
  interview_attended: { label: "Interview attended", tone: "success" },
  interview_no_show: { label: "Interview no-show", tone: "critical" },
  interview_cancelled: { label: "Interview cancelled", tone: "neutral" },
  interview_evaluated: { label: "Interview evaluated", tone: "success" },
  interview_evaluation_updated: { label: "Evaluation updated", tone: "info" },
  offer_drafted: { label: "Offer drafted", tone: "neutral" },
  offer_generated: { label: "Offer generated", tone: "info" },
  offer_letter_created: { label: "Offer letter prepared", tone: "neutral" },
  offer_sent: { label: "Offer sent", tone: "accent" },
  offer_viewed: { label: "Offer viewed", tone: "info" },
  offer_accepted: { label: "Offer accepted", tone: "success" },
  offer_declined: { label: "Offer declined", tone: "critical" },
  offer_expired: { label: "Offer expired", tone: "warning" },
  offer_withdrawn: { label: "Offer withdrawn", tone: "neutral" },
  offer_discarded: { label: "Offer draft discarded", tone: "neutral" },
  offer_signed_copy: { label: "Signed offer received", tone: "success" },
  appointment_generated: { label: "Appointment letter generated", tone: "info" },
  appointment_letter_created: { label: "Appointment letter prepared", tone: "neutral" },
  appointment_sent: { label: "Appointment letter sent", tone: "accent" },
  appointment_viewed: { label: "Appointment letter viewed", tone: "info" },
  appointment_signed: { label: "Appointment letter signed", tone: "success" },
  appointment_cancelled: { label: "Appointment letter cancelled", tone: "neutral" },
  document_submitted: { label: "Document submitted", tone: "info" },
  document_resubmitted: { label: "Document resubmitted", tone: "info" },
  document_review_started: { label: "Document under review", tone: "warning" },
  document_verified: { label: "Document verified", tone: "success" },
  document_rejected: { label: "Document rejected", tone: "critical" },
  joining_planned: { label: "Joining date planned", tone: "info" },
  joining_no_show: { label: "Did not join", tone: "critical" },
  employee_created: { label: "Employee created", tone: "success" },
  employee_linked: { label: "Linked to employee", tone: "success" },
  conversion_failed: { label: "Conversion needs attention", tone: "critical" },
  conversion_needs_review: { label: "Conversion needs review", tone: "warning" },
  email_sent: { label: "Email sent", tone: "success" },
  email_failed: { label: "Email failed", tone: "critical" },
  created: { label: "Created", tone: "neutral" },
  updated: { label: "Updated", tone: "neutral" },
  returned_to_draft: { label: "Revised after rejection", tone: "info" },
  submitted: { label: "Submitted", tone: "info" },
  routed: { label: "Sent for approval", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "critical" },
  opened: { label: "Opened for recruitment", tone: "accent" },
  filled: { label: "Filled", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function lookup(list, key) {
  return list.find((s) => s.key === key) || { key, label: key ? String(key).replace(/_/g, " ") : "—", tone: "neutral" };
}

export const stageMeta = (key) => lookup(PIPELINE_STAGES, key);
export const outcomeMeta = (key) => lookup(CANDIDATE_OUTCOMES, key);
export const interviewStatusMeta = (key) => lookup(INTERVIEW_STATUSES, key);
export const offerStatusMeta = (key) => lookup(OFFER_STATUSES, key);
export const appointmentStatusMeta = (key) => lookup(APPOINTMENT_STATUSES, key);
export const documentStatusMeta = (key) => lookup(DOCUMENT_STATUSES, key);
export const requisitionStatusMeta = (key) => lookup(REQUISITION_STATUSES, key);
export const deliveryStatusMeta = (key) => lookup(DELIVERY_STATUSES, key);
export const conversionStatusMeta = (key) => lookup(CONVERSION_STATUSES, key);
export const recommendationMeta = (key) => lookup(INTERVIEW_RECOMMENDATIONS, key);
export const modeLabel = (key) => lookup(INTERVIEW_MODES, key).label;

/** Candidate status pill: a closed outcome wins over the stage it stopped at. */
export const candidateStatusMeta = (c) => (c?.outcome ? outcomeMeta(c.outcome) : stageMeta(c?.stage));
