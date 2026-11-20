import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  ClipboardList,
  FileBarChart2,
  Headphones,
  LayoutDashboard,
  ListTodo,
  PlusCircle,
  Settings2,
} from "lucide-react";
import { PageShell } from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import { resolveItSupportAccess, itSupportLandingPath } from "./itSupportAccess";
import {
  createItSupportRefreshScheduler,
  listNotifications,
  markNotificationRead,
  subscribeItSupportRealtime,
} from "./itSupportApi";

const ALL_TABS = [
  { to: "/app/it-support/raise", label: "Raise", icon: PlusCircle, need: "raise" },
  { to: "/app/it-support/my", label: "My Tickets", icon: ClipboardList, need: "raise" },
  { to: "/app/it-support", label: "Dashboard", icon: LayoutDashboard, need: "agent", end: true },
  { to: "/app/it-support/queue", label: "Queue", icon: ListTodo, need: "agent" },
  { to: "/app/it-support/masters", label: "Masters", icon: Settings2, need: "admin" },
  { to: "/app/it-support/reports", label: "Reports", icon: FileBarChart2, need: "admin" },
];

const tabClass = ({ isActive }) =>
  `inline-flex h-9 items-center gap-2 px-3.5 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

export default function ItSupportLayout() {
  const { user, userProfile } = useAuth();
  const { pathname } = useLocation();
  const access = useMemo(() => resolveItSupportAccess(userProfile), [userProfile]);
  const [notifs, setNotifs] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);

  const tabs = useMemo(() => {
    return ALL_TABS.filter((t) => {
      if (t.need === "raise") return access.canRaise;
      if (t.need === "agent") return access.canAgent || access.canAdmin;
      if (t.need === "admin") return access.canAdmin;
      return false;
    });
  }, [access]);

  const loadNotifs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const rows = await listNotifications({ userId: user.id, limit: 20 });
      setNotifs(rows);
    } catch {
      /* bell is best-effort */
    }
  }, [user?.id]);

  useEffect(() => {
    loadNotifs();
    const scheduler = createItSupportRefreshScheduler(loadNotifs, 400);
    const unsub = subscribeItSupportRealtime(() => scheduler.schedule(), {
      channelName: "it-support-notifs-live",
      includeNotifications: true,
    });
    const onFocus = () => scheduler.schedule();
    window.addEventListener("focus", onFocus);
    const t = setInterval(loadNotifs, 120_000);
    return () => {
      scheduler.cancel();
      unsub();
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [loadNotifs]);

  const unread = notifs.filter((n) => !n.is_read).length;

  if (!access.hasAny) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Index route is dashboard — employees without agent access should land on raise/my
  const onIndex = pathname === "/app/it-support" || pathname === "/app/it-support/";
  if (onIndex && !access.canAgent && !access.canAdmin) {
    return <Navigate to={itSupportLandingPath(userProfile)} replace />;
  }

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="min-w-0 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent border border-accent-border/40 shrink-0">
            <Headphones className="w-5 h-5" />
          </span>
          <div>
            <h1 className="type-page-title text-ink">IT Support</h1>
            <p className="type-meta text-ink-secondary mt-1">
              Raise issues, track progress, and get help from the IT team.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          <div className="relative">
            <button
              type="button"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              aria-label="Notifications"
              onClick={() => setBellOpen((v) => !v)}
            >
              <Bell className="w-4 h-4" />
              {unread > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-[1.1rem] text-center">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </button>
            {bellOpen ? (
              <div className="absolute right-0 mt-1 w-80 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg z-20">
                <div className="px-3 py-2 border-b border-slate-100 text-xs font-semibold text-slate-600">
                  Notifications
                </div>
                {notifs.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">No notifications yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {notifs.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 ${
                            n.is_read ? "opacity-70" : ""
                          }`}
                          onClick={async () => {
                            if (!n.is_read) {
                              try {
                                await markNotificationRead(n.id);
                                setNotifs((prev) =>
                                  prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
                                );
                              } catch {
                                /* ignore */
                              }
                            }
                            setBellOpen(false);
                          }}
                        >
                          <p className="text-sm font-medium text-ink">{n.title}</p>
                          {n.body ? <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{n.body}</p> : null}
                          {n.ticket_id ? (
                            <Link
                              to={`/app/it-support/tickets/${n.ticket_id}`}
                              className="text-[11px] text-accent mt-1 inline-block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open ticket
                            </Link>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {tabs.map((t) => (
          <NavLink key={t.to + t.label} to={t.to} end={Boolean(t.end)} className={tabClass}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </PageShell>
  );
}
