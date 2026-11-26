import { ROLES } from "../../config/roles";
import { ACCESS_KEYS, QA_BASE } from "./qaConstants";

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === "") return [];
  return [String(value)];
}

function isSuperAdmin(userProfile) {
  const role = userProfile?.role;
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

function hasFullQa(userProfile) {
  return asList(userProfile?.allowed_modules).includes(ACCESS_KEYS.module);
}

function hasSub(userProfile, key) {
  return asList(userProfile?.allowed_sub_modules).includes(key);
}

/** ERP User Management: can open the QA module at all. */
export function canOpenQa(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (isSuperAdmin(userProfile) || hasFullQa(userProfile)) return true;
  return Object.values(ACCESS_KEYS).some((k) => k !== ACCESS_KEYS.module && hasSub(userProfile, k));
}

export function canSeeQaPage(userProfile, pageKey) {
  if (!canOpenQa(userProfile)) return false;
  if (isSuperAdmin(userProfile) || hasFullQa(userProfile)) return true;
  return hasSub(userProfile, pageKey);
}

/**
 * Action permissions from qa.members.qa_role (DB is still authoritative).
 * @param {string|null|undefined} qaRole
 */
export function resolveQaActions(qaRole) {
  const role = qaRole || null;
  const isLead = role === "qa_lead";
  const isTester = role === "tester";
  const isDev = role === "developer";
  const isPo = role === "product_owner";
  const isBo = role === "business_owner";
  const isViewer = role === "viewer";
  const member = Boolean(role);

  return {
    role,
    isMember: member,
    isViewerOnly: isViewer,
    canCreateRequest: isLead || isTester || isDev || isPo,
    canTriageRequest: isLead,
    canCreateCase: isLead || isTester,
    canApproveCase: isLead,
    canCreateRun: isLead || isTester,
    canRecordResult: isLead || isTester,
    canTriageDefect: isLead,
    canMarkReadyForRetest: isLead || isDev,
    canCloseDefect: isLead || isTester,
    canWaive: isLead,
    canEditRules: isLead,
    canManageMembers: isLead,
    canCreateRelease: isLead,
    canSignAs: (signerRole) => member && role === signerRole && !isViewer,
    canWrite: member && !isViewer,
  };
}

export function resolveQaAccess(userProfile, qaRole) {
  const open = canOpenQa(userProfile);
  const actions = resolveQaActions(qaRole);
  return {
    canOpen: open,
    pages: {
      dashboard: canSeeQaPage(userProfile, ACCESS_KEYS.dashboard) || open,
      requests: canSeeQaPage(userProfile, ACCESS_KEYS.requests) || open,
      cases: canSeeQaPage(userProfile, ACCESS_KEYS.cases) || open,
      execution: canSeeQaPage(userProfile, ACCESS_KEYS.execution) || open,
      defects: canSeeQaPage(userProfile, ACCESS_KEYS.defects) || open,
      traceability: canSeeQaPage(userProfile, ACCESS_KEYS.traceability) || open,
      releaseGate: canSeeQaPage(userProfile, ACCESS_KEYS.releaseGate) || open,
      audit: canSeeQaPage(userProfile, ACCESS_KEYS.audit) || open,
      standards: canSeeQaPage(userProfile, ACCESS_KEYS.standards) || open,
      manual: canSeeQaPage(userProfile, ACCESS_KEYS.manual) || open,
    },
    ...actions,
  };
}

export function qaLandingPath(userProfile) {
  if (canSeeQaPage(userProfile, ACCESS_KEYS.dashboard) || canOpenQa(userProfile)) return QA_BASE;
  if (canSeeQaPage(userProfile, ACCESS_KEYS.requests)) return `${QA_BASE}/requests`;
  return QA_BASE;
}

/** Friendly reason when an action is blocked. */
export function blockedReason(actionKey, qaRole) {
  const actions = resolveQaActions(qaRole);
  if (!actions.isMember) return "You are not enrolled as a QA member.";
  if (actions.isViewerOnly) return "Viewers have read-only access.";
  const map = {
    canCreateRequest: "Testers, QA Lead, Developers, or Product Owners can create requests.",
    canTriageRequest: "Only the QA Lead can triage intake requests.",
    canCreateCase: "Only Testers or the QA Lead can create test cases.",
    canApproveCase: "Only the QA Lead can approve test cases (not their own).",
    canCreateRun: "Only Testers or the QA Lead can create test runs.",
    canRecordResult: "Only Testers or the QA Lead can record results.",
    canTriageDefect: "Only the QA Lead can triage new defects.",
    canMarkReadyForRetest: "Developers or the QA Lead mark fixes ready for retest.",
    canCloseDefect: "Testers or the QA Lead close defects after retest.",
    canWaive: "Only the QA Lead can waive exit criteria.",
    canEditRules: "Only the QA Lead can edit rule tables.",
    canManageMembers: "Only the QA Lead can manage QA members.",
    canCreateRelease: "Only the QA Lead can create releases.",
  };
  return map[actionKey] || "You do not have permission for this action.";
}
