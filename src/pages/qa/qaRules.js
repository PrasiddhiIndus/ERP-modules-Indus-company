/**
 * Pure QA rule helpers (mirrors DB generated columns / rule tables).
 * Used by UI previews; database remains source of truth.
 */

/** @typedef {'low'|'medium'|'high'} RiskLevel */
/** @typedef {'feature'|'enhancement'|'bug_fix'|'config'|'hotfix'} RequestType */
/** @typedef {'A'|'B'|'C'|'D'} ChangeClass */

/**
 * @param {number} likelihood 1–3
 * @param {number} impact 1–3
 */
export function riskScore(likelihood, impact) {
  return Number(likelihood) * Number(impact);
}

/**
 * @param {number} likelihood
 * @param {number} impact
 * @returns {RiskLevel}
 */
export function riskFromLikelihoodImpact(likelihood, impact) {
  const score = riskScore(likelihood, impact);
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/**
 * Default change class from request type (user may override).
 * @param {RequestType|string} requestType
 * @returns {ChangeClass}
 */
export function defaultChangeClass(requestType) {
  switch (requestType) {
    case 'feature':
      return 'A';
    case 'enhancement':
    case 'bug_fix':
      return 'B';
    case 'config':
      return 'C';
    case 'hotfix':
      return 'D';
    default:
      return 'B';
  }
}

/**
 * Derive overall execution result from step results.
 * @param {Array<'pass'|'fail'|'blocked'|'not_run'>} stepResults
 * @returns {'pass'|'fail'|'blocked'|null}
 */
export function overallResultFromSteps(stepResults) {
  const steps = Array.isArray(stepResults) ? stepResults : [];
  if (steps.some((s) => s === 'fail')) return 'fail';
  if (steps.some((s) => s === 'blocked')) return 'blocked';
  if (steps.length > 0 && steps.every((s) => s === 'pass')) return 'pass';
  return null;
}

/**
 * Static mirror of seeded qa.rule_required_levels for live preview when offline.
 * Prefer reading rule tables from the API when available.
 */
export const DEFAULT_REQUIRED_LEVELS = {
  A: {
    low: ['unit', 'integration', 'system', 'regression', 'acceptance'],
    medium: ['unit', 'integration', 'system', 'regression', 'acceptance'],
    high: ['unit', 'integration', 'system', 'regression', 'acceptance', 'security', 'performance'],
  },
  B: {
    low: ['unit', 'system', 'regression'],
    medium: ['unit', 'integration', 'system', 'regression'],
    high: ['unit', 'integration', 'system', 'regression', 'acceptance'],
  },
  C: {
    low: ['system', 'smoke'],
    medium: ['system', 'smoke'],
    high: ['system', 'smoke', 'regression'],
  },
  D: {
    low: ['smoke', 'system', 'regression'],
    medium: ['smoke', 'system', 'regression'],
    high: ['smoke', 'system', 'regression'],
  },
};

export const DEFAULT_SIGNOFF_ROLES = {
  A: ['qa_lead', 'product_owner', 'business_owner'],
  B: ['qa_lead', 'product_owner'],
  C: ['qa_lead'],
  D: ['qa_lead', 'product_owner'],
};

/**
 * @param {ChangeClass|string} changeClass
 * @param {RiskLevel|string} risk
 * @returns {string[]}
 */
export function requiredLevelsFor(changeClass, risk) {
  return DEFAULT_REQUIRED_LEVELS[changeClass]?.[risk] || [];
}

/**
 * @param {ChangeClass|string} changeClass
 * @returns {string[]}
 */
export function signoffRolesFor(changeClass) {
  return DEFAULT_SIGNOFF_ROLES[changeClass] || [];
}

/**
 * Review rule copy for the live preview panel.
 * @param {RiskLevel|string} risk
 */
export function reviewRuleText(risk) {
  if (risk === 'high') {
    return 'High risk: independent review of every case, and a second tester must witness high-priority executions.';
  }
  return 'Peer review by someone other than the author.';
}
