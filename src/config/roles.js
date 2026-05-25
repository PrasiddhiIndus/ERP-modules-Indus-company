/**
 * Role-based access: teams, roles, and module keys used for sidebar and route guards.
 * - Executive: team module + optional extra modules from profile; can view/edit within that scope (no approvals).
 * - Manager: team module + optional extra modules from profile; can view/edit and approve within that scope.
 * - Admin: dashboard + assigned team/extra modules; can approve workflows only inside those modules.
 * - Super Admin: full module access including User Management and software subscriptions.
 * - Fire Tender (`fireTender` routes): Super Admin tiers, or profile `team` / `allowed_modules` includes `fireTender`.
 * - IT/IS (`itIs` routes): Super Admin tiers, or profile `team` / `allowed_modules` includes `itIs`.
 * Legacy users with no `role` in profile still receive broad access except Super Admin-only modules.
 */

export const ROLES = {
  EXECUTIVE: "executive",
  MANAGER: "manager",
  ADMIN: "admin",
  /** Super Admin (Management) */
  SUPER_ADMIN: "super_admin",
  /** Super Admin Pro (full access + bootstrap owner) */
  SUPER_ADMIN_PRO: "super_admin_pro",
};

export const TEAMS = [
  { value: "hr", label: "HR" },
  { value: "compliance", label: "Compliance" },
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "commercial", label: "Commercial" },
  { value: "billing", label: "Billing" },
  { value: "tracking", label: "Tracking" },
  { value: "operations", label: "Operations" },
  { value: "projects", label: "Projects" },
  { value: "procurement", label: "Procurement" },
  { value: "amc", label: "AMC" },
  { value: "finance", label: "Finance/Accounts" },
  { value: "fireTender", label: "Fire Tender" },
  { value: "indusLms", label: "Indus LMS / Trainings" },
  { value: "itIs", label: "IT/IS" },
];

/** Module keys that appear in the sidebar (for extra module checklist and access checks). */
export const MODULES = [
  { value: "hr", label: "HR" },
  { value: "compliance", label: "Compliance" },
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  // Commercial is split into two nav sub-modules
  { value: "commercialMt", label: "Commercial ΓÇö Manpower / Training" },
  { value: "commercialRm", label: "Commercial ΓÇö R&M / M&M / AMC / IEV" },
  { value: "billing", label: "Billing" },
  { value: "tracking", label: "Tracking" },
  { value: "operations", label: "Operations" },
  { value: "projects", label: "Projects" },
  { value: "procurement", label: "Procurement" },
  { value: "amc", label: "AMC" },
  { value: "finance", label: "Finance/Accounts" },
  { value: "fireTender", label: "Fire Tender" },
  { value: "itIs", label: "IT/IS" },
];

/** Path prefixes that belong to each module (for route guard). */
export const MODULE_PATH_PREFIXES = {
  overview: ["/app/dashboard"],
  hr: ["/app/hr", "/app/hr/payroll", "/app/attendance", "/app/salary", "/app/payroll", "/app/people-management"],
  compliance: ["/app/ifsp-employee-compliance", "/app/general-compliance"],
  admin: ["/app/ifsp-employee", "/app/store-inventory", "/app/gate-pass", "/app/admin"],
  // Legacy bucket: Sales historically owned /manpower + /commercial routes.
  // Keep this broad so refresh/deep-links don't get redirected to /app/dashboard.
  sales: ["/app/manpower", "/app/commercial"],
  marketing: ["/app/marketing"],
  /** Commercial ΓÇö Manpower / Training (includes legacy manpower module routes) */
  commercialMt: ["/app/commercial/manpower-training", "/app/commercial/manpower", "/app/manpower"],
  /** Commercial ΓÇö R&M / M&M / AMC / IEV */
  commercialRm: ["/app/commercial/rm-mm-amc-iev"],
  billing: ["/app/billing"],
  tracking: ["/app/billing/tracking"],
  operations: ["/app/fire-tender-vehicle", "/app/operations"],
  projects: ["/app/projects/po", "/app/projects-management", "/app/projects-billing"],
  procurement: ["/app/procurement"],
  amc: ["/app/amc"],
  finance: ["/app/accounts-finance"],
  fireTender: ["/app/fire-tender", "/app/fire-tender-manufacturing"],
  indusLms: ["/app/indus-lms-trainings"],
  settings: ["/app/settings"],
  userManagement: ["/app/user-management"],
  softwareSubscriptions: ["/app/software-subscriptions-reminders"],
  /** IT/IS team home — same routes as software subscriptions (not Super Admin–only module key). */
  itIs: ["/app/software-subscriptions-reminders"],
};

const SUPER_ADMIN_ONLY_MODULES = new Set(["userManagement", "softwareSubscriptions"]);
const SCOPED_ROLE_MODULES = new Set([ROLES.EXECUTIVE, ROLES.MANAGER]);

/** Fire Tender (tenders, costing, quotations, configuration, manufacturing UI) — not part of generic/Admin bundles. */
const FIRE_TENDER_MODULE_KEY = "fireTender";

/**
 * Map User Management `team` values to real module keys in MODULE_PATH_PREFIXES.
 * e.g. TEAMS uses "commercial" but routes are under commercialMt / commercialRm.
 */
const TEAM_VALUE_ALIASES = {
  commercial: "commercialMt",
  firetender: FIRE_TENDER_MODULE_KEY,
  itis: "itIs",
  it_is: "itIs",
  "it/is": "itIs",
  "it-is": "itIs",
};

/**
 * Canonical module key for routing/RLS (case-insensitive; fixes "Billing" vs "billing").
 */
export function normalizeTeamModuleKey(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return "";
  if (TEAM_VALUE_ALIASES[t]) return TEAM_VALUE_ALIASES[t];
  const exact = Object.keys(MODULE_PATH_PREFIXES).find((k) => k.toLowerCase() === t);
  if (exact) return exact;
  return t;
}

function userHasFireTenderTeam(profile) {
  return normalizeTeamModuleKey(profile?.team) === FIRE_TENDER_MODULE_KEY;
}

/**
 * Remove Fire Tender from the module set unless the user is Super Admin or the module is explicitly selected.
 */
function applyFireTenderModuleGate(profile, moduleSet) {
  if (!moduleSet?.delete) return;
  const role = profile?.role;
  if (role === ROLES.SUPER_ADMIN_PRO || role === ROLES.SUPER_ADMIN) return;
  const hasFireTenderModule =
    userHasFireTenderTeam(profile) ||
    normalizedAllowedModuleKeys(profile).includes(FIRE_TENDER_MODULE_KEY);
  if (hasFireTenderModule) return;
  moduleSet.delete(FIRE_TENDER_MODULE_KEY);
}

function normalizedAllowedModuleKeys(profile) {
  return (profile?.allowed_modules || [])
    .map((m) => normalizeTeamModuleKey(m))
    .filter(Boolean);
}

function hasAssignedScopedModules(profile) {
  return Boolean(normalizeTeamModuleKey(profile?.team) || normalizedAllowedModuleKeys(profile).length);
}

function buildScopedModuleSet(profile, { includeOverview = false } = {}) {
  const scoped = new Set(includeOverview ? ["overview", "settings"] : ["settings"]);
  const teamKey = normalizeTeamModuleKey(profile?.team);
  if (teamKey) scoped.add(teamKey);
  normalizedAllowedModuleKeys(profile).forEach((key) => scoped.add(key));
  SUPER_ADMIN_ONLY_MODULES.forEach((m) => scoped.delete(m));
  applyFireTenderModuleGate(profile, scoped);
  return scoped;
}

/**
 * Pick a safe landing path for users who don't have `overview` access.
 * Preference: user's team module (normalized) → allowed_modules → stable rest → settings → dashboard.
 * Executive/Manager never use "first key in Set" (which was often `hr`) when team/allowed are set wrong.
 */
export function getLandingPathForUser(userProfile, accessibleModules) {
  const mods = accessibleModules && accessibleModules.size ? accessibleModules : new Set();

  const pickFirstPrefix = (modKey) => {
    const arr = MODULE_PATH_PREFIXES[modKey];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  };

  const role = userProfile?.role;
  const teamKey = normalizeTeamModuleKey(userProfile?.team);
  const allowedKeys = (userProfile?.allowed_modules || [])
    .map((m) => normalizeTeamModuleKey(m))
    .filter(Boolean);

  const tryKey = (k) => {
    if (!k || !mods.has(k)) return null;
    return pickFirstPrefix(k);
  };

  // 1) Primary team (normalized)
  const fromTeam = tryKey(teamKey);
  if (fromTeam) return fromTeam;

  // 2) Explicit extra modules from User Management
  for (const k of allowedKeys) {
    const p = tryKey(k);
    if (p) return p;
  }

  // 3) Executive / Manager with no team + no allowed_modules: don't guess (legacy "all modules" used to land on /app/hr).
  if (
    (role === ROLES.EXECUTIVE || role === ROLES.MANAGER) &&
    !teamKey &&
    allowedKeys.length === 0
  ) {
    if (mods.has("settings")) {
      const p = pickFirstPrefix("settings");
      if (p) return p;
    }
    return "/app/dashboard";
  }

  // 4) Executive / Manager: do not walk Set insertion order (was sending users to /app/hr).
  if (role === ROLES.EXECUTIVE || role === ROLES.MANAGER) {
    const rest = [...mods]
      .filter(
        (k) =>
          k !== "overview" &&
          k !== "settings" &&
          !SUPER_ADMIN_ONLY_MODULES.has(k) &&
          k !== teamKey &&
          !allowedKeys.includes(k),
      )
      .sort();
    for (const k of rest) {
      const p = tryKey(k);
      if (p) return p;
    }
    if (mods.has("settings")) {
      const p = pickFirstPrefix("settings");
      if (p) return p;
    }
    return "/app/dashboard";
  }

  // 5) Other roles: first non-overview module in stable order
  const rest = [...mods]
    .filter((k) => k !== "overview" && k !== "settings" && !SUPER_ADMIN_ONLY_MODULES.has(k))
    .sort();
  for (const k of rest) {
    const p = tryKey(k);
    if (p) return p;
  }

  if (mods.has("settings")) {
    const p = pickFirstPrefix("settings");
    if (p) return p;
  }

  return "/app/dashboard";
}

/**
 * Where to send the user immediately after login.
 * Admin + Super Admin → main dashboard (/app/dashboard).
 * Executive + Manager → first allowed team/module home via getLandingPathForUser.
 */
export function getLoginRedirectPath(userProfile, accessibleModules) {
  const role = userProfile?.role;
  if (
    role === ROLES.ADMIN ||
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.SUPER_ADMIN_PRO
  ) {
    return "/app/dashboard";
  }
  return getLandingPathForUser(userProfile, accessibleModules);
}

/** Manager needs one of these in `accessibleModules` to approve Commercial ΓÇö Manpower/Training PO workflows. */
export const COMMERCIAL_MT_APPROVER_MODULE_KEYS = ["commercialMt", "sales"];

/** Manager needs one of these to approve Commercial ΓÇö R&M / M&M / AMC / IEV PO workflows. */
export const COMMERCIAL_RM_APPROVER_MODULE_KEYS = ["commercialRm", "sales"];

/** PO/WO approval in Projects → PO Entry (same workflow as Commercial R&M). */
export const PROJECTS_PO_APPROVER_MODULE_KEYS = ["projects", "sales"];

/**
 * Universal approval gate: Super Admin tiers and Admin approve anywhere; Managers only within listed module keys.
 * @param {{ role?: string }} userProfile - from AuthContext
 * @param {Set<string>|undefined|null} accessibleModules
 * @param {string[]} moduleKeysAnyOf - e.g. COMMERCIAL_MT_APPROVER_MODULE_KEYS or ["billing"]
 */
export function userCanApproveInModules(userProfile, accessibleModules, moduleKeysAnyOf) {
  const role = userProfile?.role;
  const keys = Array.isArray(moduleKeysAnyOf) ? moduleKeysAnyOf : [];

  if (
    role === ROLES.SUPER_ADMIN_PRO ||
    role === ROLES.SUPER_ADMIN
  ) {
    return true;
  }

  // Executives submit work for approval; they do not approve in-app workflows.
  if (role === ROLES.EXECUTIVE) return false;

  if ((role === ROLES.ADMIN || role === ROLES.MANAGER) && accessibleModules?.size) {
    return keys.some((k) => accessibleModules.has(k));
  }

  // Legacy profiles with no `role` in metadata/DB: anyone who can open the module may approve (previous behaviour for broad legacy access).
  if (!role && accessibleModules?.size) {
    return keys.some((k) => accessibleModules.has(k));
  }

  return false;
}

/**
 * Edit gate for module-scoped roles. Executives and Managers can edit anything inside
 * their selected Team / Extra modules; approvals remain Manager/Admin/Super Admin only.
 * @param {{ role?: string }} userProfile - from AuthContext
 * @param {Set<string>|undefined|null} accessibleModules
 * @param {string[]} moduleKeysAnyOf
 */
export function userCanEditInModules(userProfile, accessibleModules, moduleKeysAnyOf) {
  const role = userProfile?.role;
  const keys = Array.isArray(moduleKeysAnyOf) ? moduleKeysAnyOf : [];

  if (
    role === ROLES.SUPER_ADMIN_PRO ||
    role === ROLES.SUPER_ADMIN
  ) {
    return true;
  }

  if (
    role === ROLES.ADMIN ||
    role === ROLES.MANAGER ||
    role === ROLES.EXECUTIVE ||
    !role
  ) {
    return Boolean(accessibleModules?.size && keys.some((k) => accessibleModules.has(k)));
  }

  return false;
}

/**
 * Returns the set of module keys the user is allowed to access.
 * @param {{ role: string, team?: string, allowed_modules?: string[] }} profile - from user_metadata
 * @returns {Set<string>} - module keys (always includes 'settings'; Admin/Super Admin include 'overview')
 */
export function getAccessibleModules(profile) {
  const allModules = new Set([
    "overview",
    "settings",
    ...Object.keys(MODULE_PATH_PREFIXES).filter((k) => k !== "overview" && k !== "settings"),
  ]);
  // ΓÇ£overviewΓÇ¥ (main dashboard) is restricted to Admin + Super Admin only.
  // Everyone can still access Settings.
  const always = new Set(["settings"]);
  // Lock down: these modules are only for Super Admin. Even legacy "no role" should not see them.
  const allWithoutSuperAdminOnly = new Set([...allModules].filter((m) => !SUPER_ADMIN_ONLY_MODULES.has(m)));

  if (!profile?.role) {
    // no role = legacy: allow all except Super Admin-only modules
    const legacy = new Set(allWithoutSuperAdminOnly);
    applyFireTenderModuleGate(profile, legacy);
    return legacy;
  }
  if (profile.role === ROLES.SUPER_ADMIN_PRO) return allModules;
  if (profile.role === ROLES.SUPER_ADMIN) return allModules;

  // Admin/HOD with configured modules is scoped to those modules, with dashboard access.
  // Legacy Admin profiles without team/modules keep broad operational access.
  if (profile.role === ROLES.ADMIN) {
    const adminSet = hasAssignedScopedModules(profile)
      ? buildScopedModuleSet(profile, { includeOverview: true })
      : new Set(allWithoutSuperAdminOnly);
    applyFireTenderModuleGate(profile, adminSet);
    return adminSet;
  }

  if (SCOPED_ROLE_MODULES.has(profile.role)) {
    // If team metadata is missing, don't accidentally lock the user to dashboard-only access.
    // Treat it like legacy access (except Super Admin-only modules).
    if (!hasAssignedScopedModules(profile)) {
      const legacyExec = new Set(allWithoutSuperAdminOnly);
      applyFireTenderModuleGate(profile, legacyExec);
      return legacyExec;
    }
    return buildScopedModuleSet(profile);
  }
  applyFireTenderModuleGate(profile, always);
  return always;
}

/**
 * Check if path is allowed for the given set of accessible module keys.
 */
export function isPathAllowed(pathname, accessibleModules) {
  if (!pathname || !pathname.startsWith("/app")) return false;
  if (accessibleModules.has("overview") && pathname === "/app/dashboard") return true;
  if (accessibleModules.has("settings") && pathname.startsWith("/app/settings")) return true;
  for (const mod of accessibleModules) {
    const prefixes = MODULE_PATH_PREFIXES[mod];
    if (!prefixes) continue;
    for (const p of prefixes) {
      if (pathname.startsWith(p)) return true;
    }
  }
  return false;
}
