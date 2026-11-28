import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ClipboardList,
  FileBarChart2,
  Headphones,
  LayoutDashboard,
  ListTodo,
  Monitor,
  PlusCircle,
  Settings2,
  Wrench,
} from "lucide-react";
import { PageShell } from "../../components/erpUi";
import { useAuth } from "../../contexts/AuthContext";
import {
  itSupportLandingPath,
  resolveItSupportAccess,
  resolveSupportTypeAccess,
} from "./itSupportAccess";
import {
  IT_SUPPORT_BASE,
  SUPPORT_TYPES,
  normalizeSupportType,
  supportTypePath,
} from "./itSupportConstants";
import {
  createItSupportRefreshScheduler,
  listNotifications,
  markNotificationRead,
  subscribeItSupportRealtime,
} from "./itSupportApi";
import { SupportTypeProvider, useSupportType } from "./SupportTypeContext";

const secondaryTabClass = ({ isActive }) =>
  `inline-flex h-9 items-center gap-2 px-3.5 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

const primaryTabClass = (active) =>
  `inline-flex min-h-[2.75rem] flex-1 sm:flex-none items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
    active
      ? "bg-ink text-white border-ink shadow-sm"
      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
  }`;

function secondaryPath(supportType, key) {
  if (key === "my") return `${IT_SUPPORT_BASE}/my`;
  if (key === "masters") return `${IT_SUPPORT_BASE}/masters`;
  if (key === "reports") return `${IT_SUPPORT_BASE}/reports`;
  if (key === "dashboard") return supportTypePath(supportType);
  if (key === "raise") return supportTypePath(supportType, "raise");
  if (key === "queue") return supportTypePath(supportType, "queue");
  return supportTypePath(supportType);
}

function ItSupportChrome() {
  const { user, userProfile } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const moduleAccess = useMemo(() => resolveItSupportAccess(userProfile), [userProfile]);
  const { supportType, setSupportType } = useSupportType();
  const typeAccess = useMemo(
    () => resolveSupportTypeAccess(userProfile, supportType),
    [userProfile, supportType]
  );
  const [notifs, setNotifs] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);

  const visibleSupportTypes = useMemo(() => {
    return SUPPORT_TYPES.filter((t) => {
      if (t.value === "hardware") return moduleAccess.hardware.hasAny;
      return moduleAccess.software.hasAny;
    });
  }, [moduleAccess]);

  const secondaryTabs = useMemo(() => {
    const tabs = [];
    if (typeAccess.canRaise) {
      tabs.push({ key: "raise", label: "Raise", icon: PlusCircle, end: true });
    }
    if (typeAccess.canMyTickets || moduleAccess.software.canMyTickets || moduleAccess.hardware.canMyTickets) {
      tabs.push({ key: "my", label: "My Tickets", icon: ClipboardList, end: false });
    }
    if (typeAccess.canDashboard) {
      tabs.push({ key: "dashboard", label: "Dashboard", icon: LayoutDashboard, end: true });
    }
    if (typeAccess.canQueue) {
      tabs.push({ key: "queue", label: "Queue", icon: ListTodo, end: false });
    }
    if (typeAccess.canMasters) {
      tabs.push({ key: "masters", label: "Masters", icon: Settings2, end: false });
    }
    if (typeAccess.canReports) {
      tabs.push({ key: "reports", label: "Reports", icon: FileBarChart2, end: false });
    }
    return tabs.map((t) => ({
      ...t,
      to: secondaryPath(supportType, t.key),
    }));
  }, [typeAccess, supportType, moduleAccess]);

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

  // If current primary tab is not allowed, bounce to a type the user can open.
  useEffect(() => {
    if (!moduleAccess.hasAny) return;
    if (supportType === "hardware" && !moduleAccess.hardware.hasAny && moduleAccess.software.hasAny) {
      setSupportType("software");
      if (pathname.includes("/hardware")) {
        navigate(itSupportLandingPath(userProfile), { replace: true });
      }
    }
  }, [
    moduleAccess.hasAny,
    moduleAccess.hardware.hasAny,
    moduleAccess.software.hasAny,
    supportType,
    setSupportType,
    pathname,
    navigate,
    userProfile,
  ]);

  const unread = notifs.filter((n) => !n.is_read).length;

  const switchSupportType = (nextType) => {
    const type = normalizeSupportType(nextType);
    if (type === "hardware" && !moduleAccess.hardware.hasAny) return;
    if (type === "software" && !moduleAccess.software.hasAny) return;
    setSupportType(type);
    const nextAccess = resolveSupportTypeAccess(userProfile, type);
    const shared =
      pathname.startsWith(`${IT_SUPPORT_BASE}/my`) ||
      pathname.startsWith(`${IT_SUPPORT_BASE}/tickets/`) ||
      pathname.startsWith(`${IT_SUPPORT_BASE}/masters`) ||
      pathname.startsWith(`${IT_SUPPORT_BASE}/reports`);
    if (shared) return;
    const rest = pathname.replace(/^\/app\/it-support\/(software|hardware)/, "") || "";
    if ((rest === "/raise" || rest.startsWith("/raise?")) && nextAccess.canRaise) {
      navigate(supportTypePath(type, "raise"));
      return;
    }
    if ((rest === "/queue" || rest.startsWith("/queue?")) && nextAccess.canQueue) {
      const qs = rest.includes("?") ? rest.slice(rest.indexOf("?")) : window.location.search || "";
      navigate(`${supportTypePath(type, "queue")}${qs}`);
      return;
    }
    if (nextAccess.canDashboard) {
      navigate(supportTypePath(type));
      return;
    }
    if (nextAccess.canRaise) {
      navigate(supportTypePath(type, "raise"));
      return;
    }
    if (nextAccess.canQueue) {
      navigate(supportTypePath(type, "queue"));
      return;
    }
    navigate(`${IT_SUPPORT_BASE}/my`);
  };

  if (!moduleAccess.hasAny) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const onIndex = pathname === IT_SUPPORT_BASE || pathname === `${IT_SUPPORT_BASE}/`;
  if (onIndex) {
    return <Navigate to={itSupportLandingPath(userProfile)} replace />;
  }

  if (pathname === `${IT_SUPPORT_BASE}/raise`) {
    return <Navigate to={supportTypePath(supportType, "raise")} replace />;
  }
  if (pathname === `${IT_SUPPORT_BASE}/queue` || pathname.startsWith(`${IT_SUPPORT_BASE}/queue?`)) {
    const qs = pathname.includes("?") ? pathname.slice(pathname.indexOf("?")) : window.location.search;
    return <Navigate to={`${supportTypePath(supportType, "queue")}${qs}`} replace />;
  }

  // Block hardware routes when the user has no hardware grant.
  if (
    (pathname === `${IT_SUPPORT_BASE}/hardware` || pathname.startsWith(`${IT_SUPPORT_BASE}/hardware/`))
    && !moduleAccess.hardware.hasAny
  ) {
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
              Software and hardware help — raise issues, track progress, and get support from IT.
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
                              to={`${IT_SUPPORT_BASE}/tickets/${n.ticket_id}`}
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

      {visibleSupportTypes.length > 0 ? (
        <div
          className="mb-3 grid grid-cols-2 gap-2 sm:inline-flex sm:w-auto"
          role="tablist"
          aria-label="Support type"
        >
          {visibleSupportTypes.map((t) => {
            const active = supportType === t.value;
            const Icon = t.value === "hardware" ? Wrench : Monitor;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                className={primaryTabClass(active)}
                onClick={() => switchSupportType(t.value)}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-left leading-tight">
                  <span className="block">{t.label}</span>
                  <span className={`block text-[10px] font-normal ${active ? "text-white/80" : "text-slate-500"}`}>
                    {t.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 mb-2">
        {secondaryTabs.map((t) => (
          <NavLink key={t.key} to={t.to} end={Boolean(t.end)} className={secondaryTabClass}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </PageShell>
  );
}

export default function ItSupportLayout() {
  return (
    <SupportTypeProvider>
      <ItSupportChrome />
    </SupportTypeProvider>
  );
}
