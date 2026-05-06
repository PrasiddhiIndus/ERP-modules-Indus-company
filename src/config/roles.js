/**
 * Role-based access: teams, roles, and module keys used for sidebar and route guards.
 * - Executive: access only to their team's module.
 * - Manager: team module + additional modules selected via checklist.
 * - Admin: access to everything.
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
  projects: ["/app/projects"],
  procurement: ["/app/procurement"],
  amc: ["/app/amc"],
  finance: ["/app/accounts-finance"],
  fireTender: ["/app/fire-tender", "/app/fire-tender-manufacturing"],
  settings: ["/app/settings"],
  userManagement: ["/app/user-management"],
};

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
  const always = new Set(["overview", "settings"]);
  // Lock down: User Management is only for Super Admin. Even legacy "no role" should not see it.
  const allWithoutUserMgmt = new Set([...allModules].filter((m) => m !== "userManagement"));

  if (!profile?.role) return allWithoutUserMgmt; // no role = legacy: allow all (except User Management)
  if (profile.role === ROLES.SUPER_ADMIN_PRO) return allModules;
  if (profile.role === ROLES.SUPER_ADMIN) return allModules;
  if (profile.role === ROLES.ADMIN) {
    // Admin (HOD/Senior Management): team + explicitly allowed modules.
    if (profile.team) always.add(profile.team);
    (profile.allowed_modules || []).forEach((m) => always.add(m));
    always.delete("userManagement");
    return always;
  }
  if (profile.role === ROLES.EXECUTIVE) {
    if (profile.team) always.add(profile.team);
    (profile.allowed_modules || []).forEach((m) => always.add(m));
    // Never allow user management for non-super-admin.
    always.delete("userManagement");
    return always;
  }
  if (profile.role === ROLES.MANAGER) {
    if (profile.team) always.add(profile.team);
    (profile.allowed_modules || []).forEach((m) => always.add(m));
    always.delete("userManagement");
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
