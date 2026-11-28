import { ROLES } from "../../config/roles";
import {
  ACCESS_KEYS,
  HARDWARE_ACCESS_KEYS,
  HARDWARE_SUPPORT_PAGES,
  normalizeSupportType,
  supportTypePath,
} from "./itSupportConstants";

function asList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === "") return [];
  return [String(value)];
}

function isSuperAdmin(userProfile) {
  const role = userProfile?.role;
  return role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO;
}

function hasFullItIs(userProfile) {
  const modules = asList(userProfile?.allowed_modules);
  return modules.includes("itIs");
}

function hasSub(userProfile, key) {
  const subs = asList(userProfile?.allowed_sub_modules);
  return subs.includes(key);
}

function hasAnySub(userProfile, keys) {
  return keys.some((k) => hasSub(userProfile, k));
}

function hasHardwareParent(userProfile) {
  return hasSub(userProfile, HARDWARE_ACCESS_KEYS.parent);
}

/** Super Admin → full Software + Hardware. Full itIs module → same. */
function hasPrivilegedItAccess(userProfile) {
  return isSuperAdmin(userProfile) || hasFullItIs(userProfile);
}

/** Explicit Hardware Support page grant (or parent / privileged). */
export function canHardwarePage(userProfile, pageKey) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile) || hasHardwareParent(userProfile)) return true;
  return hasSub(userProfile, pageKey);
}

export function hasAnyHardwareSupportAccess(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile) || hasHardwareParent(userProfile)) return true;
  return hasAnySub(
    userProfile,
    HARDWARE_SUPPORT_PAGES.map((p) => p.value)
  );
}

export function hasAnySoftwareSupportAccess(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile)) return true;
  return hasAnySub(userProfile, [ACCESS_KEYS.raise, ACCESS_KEYS.agent, ACCESS_KEYS.admin]);
}

/**
 * Software raise — Super Admin, full itIs, or explicit Software Support grant.
 * Agent/admin grants also allow raise (same convention as other modules).
 */
export function canRaise(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile)) return true;
  return hasAnySub(userProfile, [ACCESS_KEYS.raise, ACCESS_KEYS.agent, ACCESS_KEYS.admin]);
}

/** Software IT agents — queue, assign, priority, internal notes. */
export function canAgent(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile)) return true;
  return hasSub(userProfile, ACCESS_KEYS.agent) || hasSub(userProfile, ACCESS_KEYS.admin);
}

/** Software admins — masters + reports. */
export function canAdmin(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile)) return true;
  return hasSub(userProfile, ACCESS_KEYS.admin);
}

export function canHardwareRaise(userProfile) {
  return canHardwarePage(userProfile, HARDWARE_ACCESS_KEYS.raise);
}

export function canHardwareAgent(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile) || hasHardwareParent(userProfile)) return true;
  return hasAnySub(userProfile, [
    HARDWARE_ACCESS_KEYS.dashboard,
    HARDWARE_ACCESS_KEYS.queue,
    HARDWARE_ACCESS_KEYS.tickets,
    HARDWARE_ACCESS_KEYS.masters,
    HARDWARE_ACCESS_KEYS.reports,
  ]);
}

export function canHardwareAdmin(userProfile) {
  if (!userProfile || userProfile.is_active === false) return false;
  if (hasPrivilegedItAccess(userProfile) || hasHardwareParent(userProfile)) return true;
  return hasAnySub(userProfile, [
    HARDWARE_ACCESS_KEYS.masters,
    HARDWARE_ACCESS_KEYS.reports,
  ]);
}

/** Software Support — grant-based (Super Admin / itIs / helpdesk keys). */
export function resolveSoftwareSupportAccess(userProfile) {
  const raise = canRaise(userProfile);
  const agent = canAgent(userProfile);
  const admin = canAdmin(userProfile);
  const hasAny = hasAnySoftwareSupportAccess(userProfile);
  return {
    supportType: "software",
    canRaise: raise,
    canAgent: agent,
    canAdmin: admin,
    canDashboard: agent || admin,
    canQueue: agent || admin,
    canTicketDetails: raise || agent || admin,
    canMasters: admin,
    canReports: admin,
    canMyTickets: raise,
    hasAny,
  };
}

/** Hardware Support — Super Admin / itIs / explicit Hardware Support grants. */
export function resolveHardwareSupportAccess(userProfile) {
  const raise = canHardwareRaise(userProfile);
  const agent = canHardwareAgent(userProfile);
  const admin = canHardwareAdmin(userProfile);
  const dashboard = canHardwarePage(userProfile, HARDWARE_ACCESS_KEYS.dashboard);
  const queue = canHardwarePage(userProfile, HARDWARE_ACCESS_KEYS.queue);
  const tickets = canHardwarePage(userProfile, HARDWARE_ACCESS_KEYS.tickets);
  const masters = canHardwarePage(userProfile, HARDWARE_ACCESS_KEYS.masters);
  const reports = canHardwarePage(userProfile, HARDWARE_ACCESS_KEYS.reports);
  return {
    supportType: "hardware",
    canRaise: raise,
    canAgent: agent,
    canAdmin: admin,
    canDashboard: dashboard,
    canQueue: queue,
    canTicketDetails: tickets || raise || agent,
    canMasters: masters,
    canReports: reports,
    canMyTickets: raise || tickets,
    hasAny: hasAnyHardwareSupportAccess(userProfile),
  };
}

export function resolveSupportTypeAccess(userProfile, supportType) {
  return normalizeSupportType(supportType) === "hardware"
    ? resolveHardwareSupportAccess(userProfile)
    : resolveSoftwareSupportAccess(userProfile);
}

/** Module-level access: software and/or hardware when granted (or Super Admin). */
export function resolveItSupportAccess(userProfile) {
  const software = resolveSoftwareSupportAccess(userProfile);
  const hardware = resolveHardwareSupportAccess(userProfile);
  return {
    canRaise: software.canRaise || hardware.canRaise,
    canAgent: software.canAgent || hardware.canAgent,
    canAdmin: software.canAdmin || hardware.canAdmin,
    hasAny: software.hasAny || hardware.hasAny,
    software,
    hardware,
  };
}

function firstHardwareLanding(hardware) {
  if (hardware.canDashboard) return supportTypePath("hardware");
  if (hardware.canRaise) return supportTypePath("hardware", "raise");
  if (hardware.canQueue) return supportTypePath("hardware", "queue");
  if (hardware.canMasters) return "/app/it-support/masters";
  if (hardware.canReports) return "/app/it-support/reports";
  if (hardware.canMyTickets) return "/app/it-support/my";
  return "/app/it-support/my";
}

/** Default landing path for a user entering IT Support. */
export function itSupportLandingPath(userProfile) {
  const access = resolveItSupportAccess(userProfile);
  if (!access.hasAny) return "/app/dashboard";
  if (access.software.canAgent || access.software.canAdmin) {
    return supportTypePath("software");
  }
  if (access.hardware.hasAny && !access.software.hasAny) {
    return firstHardwareLanding(access.hardware);
  }
  if (access.software.canRaise) return supportTypePath("software", "raise");
  if (access.hardware.hasAny) return firstHardwareLanding(access.hardware);
  return "/app/dashboard";
}

export function roleLabel(userProfile) {
  if (canAdmin(userProfile) || canHardwareAdmin(userProfile)) return "IT Admin";
  if (canAgent(userProfile) || canHardwareAgent(userProfile)) return "IT Agent";
  if (canRaise(userProfile) || canHardwareRaise(userProfile)) return "Requester";
  return "Viewer";
}

/** Whether the user may open a ticket detail for the given support type. */
export function canOpenTicketDetail(userProfile, ticket, { isOwner = false, isOnCc = false } = {}) {
  if (!userProfile) return false;
  const access = resolveItSupportAccess(userProfile);
  if (!access.hasAny) return false;
  if (isOwner || isOnCc) return true;
  const type = normalizeSupportType(ticket?.support_type);
  if (type === "hardware") {
    const hw = resolveHardwareSupportAccess(userProfile);
    return hw.canTicketDetails || hw.canAgent || hw.canAdmin;
  }
  return canAgent(userProfile) || canAdmin(userProfile) || canRaise(userProfile);
}
