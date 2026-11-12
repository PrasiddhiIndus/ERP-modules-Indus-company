import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileSignature,
  LayoutDashboard,
  Lock,
  Settings2,
  UserPlus,
  Users,
} from "lucide-react";
import PageLoader from "../../../components/PageLoader";
import { useAuth } from "../../../contexts/AuthContext";
import { getVisibleRecruitmentTabs } from "../../../config/roles";
import { RECRUITMENT_BASE, RECRUITMENT_NAV, RECRUITMENT_SECTIONS } from "./recruitmentConfig";
import { RECRUITMENT_DATA_EVENT, getCapabilities, getNavBadges } from "./recruitmentService";
import { EmptyState, RecruitmentBusyHost } from "./RecruitmentUi";

const GROUP_ICONS = {
  dashboard: LayoutDashboard,
  requisitions: ClipboardList,
  candidates: Users,
  interviews: CalendarClock,
  offers: FileSignature,
  onboarding: UserPlus,
  reports: BarChart3,
  settings: Settings2,
};

const SECTION_BY_KEY = Object.fromEntries(RECRUITMENT_SECTIONS.map((s) => [s.key, s]));

function memberHref(member) {
  const section = SECTION_BY_KEY[member.section];
  const path = section.to === "." ? RECRUITMENT_BASE : `${RECRUITMENT_BASE}/${section.to}`;
  return member.query ? `${path}?${member.query}` : path;
}

/** Which nav group + member the current URL belongs to. */
function resolveActive(pathname, search) {
  const rest = pathname.startsWith(RECRUITMENT_BASE) ? pathname.slice(RECRUITMENT_BASE.length).replace(/^\/+/, "") : "";
  const segment = rest.split("/")[0] || "";
  const sectionKey = segment ? RECRUITMENT_SECTIONS.find((s) => s.to === segment)?.key : "dashboard";
  const isTemplates = new URLSearchParams(search).get("tab") === "templates";
  for (const group of RECRUITMENT_NAV) {
    const member = group.members.find((m) => {
      if (m.section !== sectionKey) return false;
      if (m.section !== "communication") return true;
      return isTemplates ? m.query === "tab=templates" : m.query !== "tab=templates";
    });
    if (member) return { group, member };
  }
  return { group: null, member: null };
}

const navClass = (isActive) =>
  `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border ${
    isActive ? "bg-accent text-white" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
  }`;

export default function RecruitmentLayout() {
  const [badges, setBadges] = useState({});
  const [caps, setCaps] = useState(null);
  const { userProfile, accessibleModules, user } = useAuth();
  const location = useLocation();
  const userMetadata = user?.user_metadata ?? null;
  const allowedTabs = useMemo(
    () => new Set(getVisibleRecruitmentTabs(userProfile, accessibleModules, userMetadata, "admin").map((t) => t.tabTo)),
    [userProfile, accessibleModules, userMetadata]
  );

  const sectionVisible = (key) => {
    const s = SECTION_BY_KEY[key];
    return Boolean(s) && allowedTabs.has(s.to) && (!caps || caps[s.cap] !== false);
  };
  const groups = RECRUITMENT_NAV.map((g) => ({ ...g, members: g.members.filter((m) => sectionVisible(m.section)) })).filter(
    (g) => g.members.length > 0
  );
  const active = resolveActive(location.pathname, location.search);
  const activeGroup = active.group ? groups.find((g) => g.key === active.group.key) : null;

  useEffect(() => {
    let cancelled = false;
    getCapabilities()
      .then((c) => !cancelled && setCaps(c || {}))
      .catch(() => !cancelled && setCaps({}));
    const load = () =>
      getNavBadges()
        .then((b) => !cancelled && setBadges(b))
        .catch(() => {});
    load();
    window.addEventListener(RECRUITMENT_DATA_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(RECRUITMENT_DATA_EVENT, load);
    };
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-col gap-4 p-4 md:p-6">
      <RecruitmentBusyHost />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-page-title text-ink">
          In-house Recruitment
          {active.group && active.group.key !== "dashboard" ? (
            <span className="font-normal text-ink-muted"> / {active.group.label}</span>
          ) : null}
        </h1>
      </header>

      <nav
        aria-label="Recruitment sections"
        className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1.5 shadow-card"
      >
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.key];
          const count = g.members.reduce((sum, m) => sum + (badges[m.section] || 0), 0);
          const isActive = active.group?.key === g.key;
          return (
            <Link
              key={g.key}
              to={memberHref(g.members[0])}
              className={`${navClass(isActive)}${g.iconOnly ? " ml-auto" : ""}`}
              aria-current={isActive ? "page" : undefined}
              aria-label={g.iconOnly ? g.label : undefined}
              title={g.iconOnly ? g.label : undefined}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              {g.iconOnly ? null : <span className="whitespace-nowrap">{g.label}</span>}
              {count > 0 ? (
                <span className="ml-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-4 text-white">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {activeGroup && activeGroup.members.length > 1 ? (
        <nav aria-label={`${activeGroup.label} sections`} className="-mt-1 flex gap-1 overflow-x-auto border-b border-divider">
          {activeGroup.members.map((m) => {
            const on = active.member === m;
            const count = badges[m.section] || 0;
            return (
              <Link
                key={`${m.section}-${m.query || ""}`}
                to={memberHref(m)}
                aria-current={on ? "page" : undefined}
                className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border ${
                  on ? "border-accent text-accent-deep" : "border-transparent text-ink-secondary hover:text-ink"
                }`}
              >
                {m.label}
                {count > 0 ? <span className="rounded-full bg-warning px-1.5 text-[10px] font-semibold text-white">{count > 99 ? "99+" : count}</span> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="min-w-0">
        {caps && caps.view === false ? (
          <EmptyState icon={Lock} title="No access to In-house Recruitment" message="Ask an administrator to grant recruitment access to your account." />
        ) : (
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        )}
      </div>
    </div>
  );
}
