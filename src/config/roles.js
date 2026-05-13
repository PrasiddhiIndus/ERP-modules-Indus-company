/**
 * Role-based access: teams, roles, and module keys used for sidebar and route guards.
 * - Executive: team module + optional extra modules from profile; creates/edits/deletes within that scope (no approvals).
 * - Manager: team + checklist modules; can approve workflows only inside those modules.
 * - Admin: full operational module access except Super Admin-only modules.
 * - Super Admin: full module access including User Management and software subscriptions.
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
];

/** Module keys that appear in the sidebar (for Manager checklist and access checks). */
export const MODULES = [
  { value: "hr", label: "HR" },
  { value: "compliance", label: "Compliance" },
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  // Commercial is split into two nav sub-modules
  { value: "commercialMt", label: "Commercial — Manpower / Training" },
  { value: "commercialRm", label: "Commercial — R&M / M&M / AMC / IEV" },
  { value: "billing", label: "Billing" },
  { value: "tracking", label: "Tracking" },
  { value: "operations", label: "Operations" },
  { value: "projects", label: "Projects" },
  { value: "procurement", label: "Procurement" },
  { value: "amc", label: "AMC" },
  { value: "finance", label: "Finance/Accounts" },
  { value: "fireTender", label: "Fire Tender" },
];

/** Path prefixes that belong to each module (for route guard). */
export const MODULE_PATH_PREFIXES = {
  overview: ["/app/dashboard"],
  hr: ["/app/hr", "/app/attendance", "/app/payroll", "/app/people-management"],
  compliance: ["/app/ifsp-employee-compliance", "/app/general-compliance"],
  admin: ["/app/ifsp-employee", "/app/store-inventory", "/app/gate-pass", "/app/admin"],
  // Legacy bucket: Sales historically owned /manpower + /commercial routes.
  // Keep this broad so refresh/deep-links don't get redirected to /app/dashboard.
  sales: ["/app/manpower", "/app/commercial"],
  marketing: ["/app/marketing"],
  /** Commercial — Manpower / Training (includes legacy manpower module routes) */
  commercialMt: ["/app/commercial/manpower-training", "/app/commercial/manpower", "/app/manpower"],
  /** Commercial — R&M / M&M / AMC / IEV */
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
};

const SUPER_ADMIN_ONLY_MODULES = new Set(["userManagement", "softwareSubscriptions"]);

/**
 * Pick a safe landing path for users who don't have `overview` access.
 * Preference: user's team module → first non-settings module → settings → /app/dashboard.
 */
export function getLandingPathForUser(userProfile, accessibleModules) {
  const mods = accessibleModules && accessibleModules.size ? accessibleModules : new Set();

  const pickFirstPrefix = (modKey) => {
    const arr = MODULE_PATH_PREFIXES[modKey];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  };

  // 1) Team module
  const team = String(userProfile?.team || "").trim();
  if (team && mods.has(team)) {
    const p = pickFirstPrefix(team);
    if (p) return p;
  }

  // 2) First allowed module except overview/settings/Super Admin-only modules
  for (const k of mods) {
    if (k === "overview" || k === "settings" || SUPER_ADMIN_ONLY_MODULES.has(k)) continue;
    const p = pickFirstPrefix(k);
    if (p) return p;
  }

  // 3) Settings
  if (mods.has("settings")) {
    const p = pickFirstPrefix("settings");
    if (p) return p;
  }

  // 4) Fallback
  return "/app/dashboard";
}

/** Manager needs one of these in `accessibleModules` to approve Commercial — Manpower/Training PO workflows. */
export const COMMERCIAL_MT_APPROVER_MODULE_KEYS = ["commercialMt", "sales"];

/** Manager needs one of these to approve Commercial — R&M / M&M / AMC / IEV PO workflows. */
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
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.ADMIN
  ) {
    return true;
  }

  // Executives submit work for approval; they do not approve in-app workflows.
  if (role === ROLES.EXECUTIVE) return false;

  if (role === ROLES.MANAGER && accessibleModules?.size) {
    return keys.some((k) => accessibleModules.has(k));
  }

  // Legacy profiles with no `role` in metadata/DB: anyone who can open the module may approve (previous behaviour for broad legacy access).
  if (!role && accessibleModules?.size) {
    return keys.some((k) => accessibleModules.has(k));
  }

  return false;
}

/**
 * Returns the set of module keys the user is allowed to access.
 * @param {{ role: string, team?: string, allowed_modules?: string[] }} profile - from user_metadata
 * @returns {Set<string>} - module keys (includes 'overview' and 'settings' for all)
 */
export function getAccessibleModules(profile) {
  const allModules = new Set([
    "overview",
    "settings",
    ...Object.keys(MODULE_PATH_PREFIXES).filter((k) => k !== "overview" && k !== "settings"),
  ]);
  // “overview” (main dashboard) is restricted to Admin + Super Admin only.
  // Everyone can still access Settings.
  const always = new Set(["settings"]);
  // Lock down: these modules are only for Super Admin. Even legacy "no role" should not see them.
  const allWithoutSuperAdminOnly = new Set([...allModules].filter((m) => !SUPER_ADMIN_ONLY_MODULES.has(m)));

  if (!profile?.role) return allWithoutSuperAdminOnly; // no role = legacy: allow all except Super Admin-only modules
  if (profile.role === ROLES.SUPER_ADMIN_PRO) return allModules;
  if (profile.role === ROLES.SUPER_ADMIN) return allModules;
  // Admin (HOD / senior): full operational access, excluding Super Admin-only modules.
  if (profile.role === ROLES.ADMIN) return allWithoutSuperAdminOnly;
  if (profile.role === ROLES.EXECUTIVE) {
    // If team metadata is missing, don't accidentally lock the user to dashboard-only access.
    // Treat it like legacy access (except Super Admin-only modules).
    if (!profile.team) return allWithoutSuperAdminOnly;
    always.add(profile.team);
    (profile.allowed_modules || []).forEach((m) => always.add(m));
    // Never allow Super Admin-only modules for non-super-admin.
    SUPER_ADMIN_ONLY_MODULES.forEach((m) => always.delete(m));
    return always;
  }
  if (profile.role === ROLES.MANAGER) {
    if (profile.team) always.add(profile.team);
    (profile.allowed_modules || []).forEach((m) => always.add(m));
    SUPER_ADMIN_ONLY_MODULES.forEach((m) => always.delete(m));
    return always;
  }
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
