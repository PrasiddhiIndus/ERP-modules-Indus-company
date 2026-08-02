import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, Clock3, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import {
  buildPunchLookupByEmpDate,
  fetchActiveEmployees,
  fetchAttendancePunchesInRange,
  isPurplePresentPunch,
  normalizeAttendanceEmpCode,
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

function readSeen(userId) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(seenStorageKey(userId)) || "[]"));
  } catch {
    return new Set();
  }
}

function writeSeen(userId, keys) {
  try {
    window.localStorage.setItem(seenStorageKey(userId), JSON.stringify(Array.from(keys).slice(-400)));
  } catch {
    /* ignore */
  }
}

function readDismissedPopups(userId) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(dismissedPopupStorageKey(userId)) || "[]"));
  } catch {
    return new Set();
  }
}

function writeDismissedPopup(userId, key) {
  try {
    const next = readDismissedPopups(userId);
    next.add(key);
    window.localStorage.setItem(
      dismissedPopupStorageKey(userId),
      JSON.stringify(Array.from(next).slice(-400))
    );
  } catch {
    /* ignore */
  }
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Admin module users only (full admin or any admin.* submodule). */
export function isAdminModuleUser(accessibleModules) {
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
  const from = fromDate || isoDaysAgo(LOOKBACK_DAYS);
  const to = toDate || todayIso();

  for (const [key, info] of lookup.entries()) {
    const [empCode, date] = String(key).split("|");
    if (!empCode || !date || date < from || date > to) continue;
    if (!isPurplePresentPunch({ punchIn: info?.punchIn, punchOut: info?.punchOut })) continue;

    const name = employeeNameByCode?.[empCode] || empCode;
    const reason = purpleReason({ punchIn: info.punchIn, punchOut: info.punchOut });
    notifications.push({
      key: `purple-p:${empCode}:${date}:${info.punchIn || ""}:${info.punchOut || ""}`,
      at: `${date}T${info.punchOut || info.punchIn || "12:00"}:00`,
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

const AdminPurplePresentBell = () => {
  const navigate = useNavigate();
  const { user, accessibleModules } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [seen, setSeen] = useState(() => readSeen(user?.id));
  const [dismissedPopups, setDismissedPopups] = useState(() => readDismissedPopups(user?.id));

  const shouldShow = isAdminModuleUser(accessibleModules);

  useEffect(() => {
    setSeen(readSeen(user?.id));
    setDismissedPopups(readDismissedPopups(user?.id));
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!shouldShow) {
      setNotifications([]);
      return;
    }
    try {
      const fromDate = isoDaysAgo(LOOKBACK_DAYS);
      const toDate = todayIso();
      const [punches, employees] = await Promise.all([
        fetchAttendancePunchesInRange(supabase, { fromDate, toDate }),
        fetchActiveEmployees(supabase),
      ]);
      const names = {};
      for (const e of employees || []) {
        const code = normalizeAttendanceEmpCode(e.empCode);
        if (code) names[code] = e.employeeName || e.name || code;
      }
      setNotifications(
        buildPurplePresentNotifications({
          punches,
          employeeNameByCode: names,
          fromDate,
          toDate,
        })
      );
    } catch {
      setNotifications([]);
    }
  }, [shouldShow]);

  useEffect(() => {
    if (!shouldShow || !user?.id) return undefined;
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, [refresh, shouldShow, user?.id]);

  const unread = useMemo(() => notifications.filter((n) => !seen.has(n.key)), [notifications, seen]);

  const popupItem = useMemo(() => {
    return unread.find((n) => !dismissedPopups.has(n.key)) || null;
  }, [dismissedPopups, unread]);

  const markSeen = (keys) => {
    const next = new Set([...seen, ...keys]);
    setSeen(next);
    writeSeen(user?.id, next);
  };

  const dismissPopup = (key) => {
    writeDismissedPopup(user?.id, key);
    setDismissedPopups((prev) => new Set([...prev, key]));
    markSeen([key]);
  };

  if (!shouldShow) return null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-purple-200 bg-purple-50 text-purple-900 hover:bg-purple-100"
          aria-label="Purple present alerts"
          title="Afternoon / early-exit Present alerts"
        >
          <Bell className="h-5 w-5" />
          {unread.length > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </button>

        {open ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close purple present alerts"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Purple Present alerts</p>
                  <p className="text-[11px] text-slate-500">First punch 12:00–15:00 or last punch before 12:00</p>
                </div>
                {unread.length > 0 ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-blue-700 hover:underline"
                    onClick={() => markSeen(unread.map((n) => n.key))}
                  >
                    Mark all read
                  </button>
                ) : null}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">No purple Present alerts.</div>
                ) : (
                  notifications.slice(0, 25).map((n) => (
                    <button
                      key={n.key}
                      type="button"
                      className={`flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                        seen.has(n.key) ? "opacity-60" : "bg-purple-50/40"
                      }`}
                      onClick={() => {
                        markSeen([n.key]);
                        setOpen(false);
                        navigate(n.route);
                      }}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-800">
                        <Clock3 className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-900">{n.title}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-600">{n.message}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {popupItem && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed bottom-5 right-5 z-[70] w-[min(92vw,380px)] rounded-2xl border border-purple-200 bg-white shadow-2xl">
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 rounded-full bg-purple-100 p-2 text-purple-800">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">Purple Present (P)</p>
                  <p className="mt-1 text-sm text-gray-700">{popupItem.message}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dismissPopup(popupItem.key);
                        navigate(popupItem.route);
                      }}
                      className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-800"
                    >
                      Open register
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissPopup(popupItem.key)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissPopup(popupItem.key)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export default AdminPurplePresentBell;
