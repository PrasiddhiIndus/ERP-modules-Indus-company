/** QA module — statuses, badges, access keys, environments. */

export const QA_BASE = "/app/qa";
export const QA_SCHEMA = "qa";

export const ACCESS_KEYS = {
  module: "qa",
  dashboard: "qa.dashboard",
  requests: "qa.requests",
  cases: "qa.cases",
  execution: "qa.execution",
  defects: "qa.defects",
  traceability: "qa.traceability",
  releaseGate: "qa.release-gate",
  audit: "qa.audit",
  standards: "qa.standards",
  manual: "qa.manual",
};

export const QA_ROLES = [
  { value: "tester", label: "Tester" },
  { value: "qa_lead", label: "QA Lead" },
  { value: "developer", label: "Developer" },
  { value: "product_owner", label: "Product Owner" },
  { value: "business_owner", label: "Business Owner" },
  { value: "viewer", label: "Viewer" },
];

export const STAGES = [
  { value: "intake", label: "Intake" },
  { value: "plan", label: "Plan" },
  { value: "design", label: "Design" },
  { value: "execute", label: "Execute" },
  { value: "close", label: "Close" },
];
export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.value, s]));
export const KANBAN_STAGES = STAGES.map((s) => s.value);

export const REQUEST_TYPES = [
  { value: "feature", label: "Feature" },
  { value: "enhancement", label: "Enhancement" },
  { value: "bug_fix", label: "Bug fix" },
  { value: "config", label: "Config / content" },
  { value: "hotfix", label: "Hotfix" },
];

export const CHANGE_CLASSES = [
  { value: "A", label: "A — New module / feature" },
  { value: "B", label: "B — Enhancement / bug fix" },
  { value: "C", label: "C — Config / text / report" },
  { value: "D", label: "D — Production hotfix" },
];

export const RISK_LEVELS = [
  {
    value: "low",
    label: "Low",
    tone: "bg-success-soft text-success border-success-border",
  },
  {
    value: "medium",
    label: "Medium",
    tone: "bg-warning-soft text-warning border-warning-border",
  },
  {
    value: "high",
    label: "High",
    tone: "bg-critical-soft text-critical border-critical-border",
  },
];
export const RISK_MAP = Object.fromEntries(RISK_LEVELS.map((r) => [r.value, r]));

export const CASE_STATUSES = [
  { value: "draft", label: "Draft", tone: "bg-neutral-state-soft text-neutral-state border-neutral-state-border" },
  { value: "changes_requested", label: "Changes requested", tone: "bg-warning-soft text-warning border-warning-border" },
  { value: "approved", label: "Approved", tone: "bg-success-soft text-success border-success-border" },
  { value: "obsolete", label: "Obsolete", tone: "bg-surface-sunken text-ink-muted border-border" },
];
export const CASE_STATUS_MAP = Object.fromEntries(CASE_STATUSES.map((s) => [s.value, s]));

export const RESULTS = [
  { value: "pass", label: "Pass", tone: "bg-success-soft text-success border-success-border" },
  { value: "fail", label: "Fail", tone: "bg-critical-soft text-critical border-critical-border" },
  { value: "blocked", label: "Blocked", tone: "bg-warning-soft text-warning border-warning-border" },
  { value: "not_run", label: "Not run", tone: "bg-neutral-state-soft text-neutral-state border-neutral-state-border" },
];
export const RESULT_MAP = Object.fromEntries(RESULTS.map((r) => [r.value, r]));

export const COVERAGE_TONES = {
  pass: "bg-success-soft text-success border-success-border",
  open: "bg-info-soft text-info border-info-border",
  draft: "bg-warning-soft text-warning border-warning-border",
  fail: "bg-critical-soft text-critical border-critical-border",
  gap: "bg-neutral-state-soft text-neutral-state border-neutral-state-border",
};

export const DEFECT_STATUSES = [
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "in_progress", label: "In progress" },
  { value: "ready_for_retest", label: "Ready for retest" },
  { value: "closed", label: "Closed" },
];
export const DEFECT_KANBAN = DEFECT_STATUSES.map((s) => s.value);

export const SEVERITIES = [
  { value: "S1", label: "S1 Critical", help: "Payroll/statutory miscalculation, data loss, security breach, outage with no workaround." },
  { value: "S2", label: "S2 Major", help: "Key function fails; costly workaround." },
  { value: "S3", label: "S3 Minor", help: "Easy workaround." },
  { value: "S4", label: "S4 Trivial", help: "Cosmetic." },
];

export const PRIORITIES = [
  { value: "P1", label: "P1 — Now / blocks release" },
  { value: "P2", label: "P2 — This release" },
  { value: "P3", label: "P3 — Next release" },
  { value: "P4", label: "P4 — Backlog" },
];

export const TEST_LEVELS = [
  { value: "unit", label: "Unit" },
  { value: "integration", label: "Integration" },
  { value: "system", label: "System" },
  { value: "acceptance", label: "Acceptance" },
];

export const TEST_TYPES = [
  { value: "functional", label: "Functional" },
  { value: "regression", label: "Regression" },
  { value: "smoke", label: "Smoke" },
  { value: "security", label: "Security" },
  { value: "performance", label: "Performance" },
];

export const ISO25010 = [
  { value: "functional_suitability", label: "Functional suitability" },
  { value: "performance_efficiency", label: "Performance efficiency" },
  { value: "compatibility", label: "Compatibility" },
  { value: "interaction_capability", label: "Interaction capability" },
  { value: "reliability", label: "Reliability" },
  { value: "security", label: "Security" },
  { value: "maintainability", label: "Maintainability" },
  { value: "flexibility", label: "Flexibility" },
  { value: "safety", label: "Safety" },
];

export const TECHNIQUES = [
  { value: "equivalence_partitioning", label: "Equivalence partitioning" },
  { value: "boundary_value_analysis", label: "Boundary value analysis" },
  { value: "decision_table", label: "Decision table" },
  { value: "state_transition", label: "State transition" },
  { value: "use_case", label: "Use case / scenario" },
  { value: "exploratory", label: "Exploratory" },
  { value: "error_guessing", label: "Error guessing" },
];

export const RCA_CATEGORIES = [
  { value: "requirement_gap", label: "Requirement gap" },
  { value: "design", label: "Design" },
  { value: "coding", label: "Coding" },
  { value: "configuration", label: "Configuration" },
  { value: "data", label: "Data" },
  { value: "environment", label: "Environment" },
  { value: "test_gap", label: "Test gap" },
];

export const RESOLUTIONS = [
  { value: "fixed", label: "Fixed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "not_a_defect", label: "Not a defect" },
  { value: "deferred", label: "Deferred" },
  { value: "cannot_reproduce", label: "Cannot reproduce" },
];

/** Configurable execution environments (seed defaults). */
export const ENVIRONMENTS = [
  { value: "QA-01", label: "QA-01" },
  { value: "UAT-02", label: "UAT-02" },
  { value: "PERF-01", label: "PERF-01" },
];

export function stageLabel(value) {
  return STAGE_MAP[value]?.label || value || "—";
}

export function riskTone(value) {
  return RISK_MAP[value]?.tone || "bg-neutral-state-soft text-neutral-state border-neutral-state-border";
}

export function resultTone(value) {
  return RESULT_MAP[value]?.tone || COVERAGE_TONES.gap;
}

export function caseStatusTone(value) {
  return CASE_STATUS_MAP[value]?.tone || COVERAGE_TONES.gap;
}
