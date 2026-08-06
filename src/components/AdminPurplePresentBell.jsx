import { ROLES, normalizeAppRole } from "../config/roles";
import {
  buildPunchLookupByEmpDate,
  isPurplePresentPunch,
} from "../lib/attendanceDaily";
import { formatDateDdMmYyyy } from "../utils/dateDisplay";

const REGISTER_ROUTE = "/app/admin/employee/attendance-daily";
const LOOKBACK_DAYS = 1;

function seenStorageKey(userId) {
  return `admin_purple_present_seen:${userId || "anonymous"}`;
}

function dismissedPopupStorageKey(userId) {
  return `admin_purple_present_popup_dismissed:${userId || "anonymous"}`;
}

export function readPurplePresentSeen(userId) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(seenStorageKey(userId)) || "[]"));
  } catch {
    return new Set();
  }
}

export function writePurplePresentSeen(userId, keys) {
  try {
    window.localStorage.setItem(seenStorageKey(userId), JSON.stringify(Array.from(keys).slice(-400)));
  } catch {
    /* ignore */
  }
}

export function readPurplePresentDismissedPopups(userId) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(dismissedPopupStorageKey(userId)) || "[]"));
  } catch {
    return new Set();
  }
}

export function writePurplePresentDismissedPopup(userId, key) {
  try {
    const next = readPurplePresentDismissedPopups(userId);
    next.add(key);
    window.localStorage.setItem(
      dismissedPopupStorageKey(userId),
      JSON.stringify(Array.from(next).slice(-400))
    );
  } catch {
    /* ignore */
  }
}

export function purplePresentIsoDaysAgo(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function purplePresentTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const PURPLE_PRESENT_LOOKBACK_DAYS = LOOKBACK_DAYS;

/** Admin module users only (full admin or any admin.* submodule). Super admins excluded. */
export function isAdminModuleUser(accessibleModules, profile = null) {
  const role = normalizeAppRole(profile?.role);
  if (role === ROLES.SUPER_ADMIN || role === ROLES.SUPER_ADMIN_PRO) return false;
  if (!accessibleModules?.size) return false;
  if (accessibleModules.has("admin")) return true;
  for (const key of accessibleModules) {
    if (String(key).startsWith("admin.")) return true;
  }
  return false;
}

function purpleReason({ punchIn, punchOut }) {
  const inMin = punchIn || "";
  const outMin = punchOut || "";
  const parts = [];
  if (inMin >= "12:00" && inMin <= "15:00") {
    parts.push(`first punch ${inMin}`);
  }
  if (outMin && outMin < "12:00") {
    parts.push(`last punch ${outMin}`);
  }
  return parts.join(" · ") || "unusual punch window";
}

export function buildPurplePresentNotifications({
  punches,
  employeeNameByCode,
  fromDate,
  toDate,
} = {}) {
  const lookup = buildPunchLookupByEmpDate(punches || []);
  const notifications = [];
  const from = fromDate || purplePresentIsoDaysAgo(LOOKBACK_DAYS);
  const to = toDate || purplePresentTodayIso();

  for (const [key, info] of lookup.entries()) {
    const [empCode, date] = String(key).split("|");
    if (!empCode || !date || date < from || date > to) continue;
    if (!isPurplePresentPunch({ punchIn: info?.punchIn, punchOut: info?.punchOut })) continue;

    const name = employeeNameByCode?.[empCode] || empCode;
    const reason = purpleReason({ punchIn: info.punchIn, punchOut: info.punchOut });
    notifications.push({
      key: `purple-p:${empCode}:${date}:${info.punchIn || ""}:${info.punchOut || ""}`,
      at: `${date}T${info.punchOut || info.punchIn || "12:00"}:00`,
      source: "purple",
      empCode,
      date,
      title: "Purple Present (P)",
      message: `${name} (${empCode}) · ${formatDateDdMmYyyy(date)} · ${reason}`,
      route: `${REGISTER_ROUTE}?month=${date.slice(0, 7)}&highlight=${encodeURIComponent(empCode)}`,
    });
  }

  return notifications.sort((a, b) => {
    const at = new Date(a.at || 0).getTime() || 0;
    const bt = new Date(b.at || 0).getTime() || 0;
    return bt - at;
  });
}

/** @deprecated Bell UI lives in PoApprovalBell — kept so existing imports do not break. */
const AdminPurplePresentBell = () => null;

export default AdminPurplePresentBell;
