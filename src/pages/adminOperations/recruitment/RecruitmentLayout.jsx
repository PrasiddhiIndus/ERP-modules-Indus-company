import React, { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  FileCheck2,
  FileSignature,
  LayoutDashboard,
  Lock,
  Mail,
  Settings2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import PageLoader from "../../../components/PageLoader";
import { useAuth } from "../../../contexts/AuthContext";
import { getVisibleRecruitmentTabs } from "../../../config/roles";
import { RECRUITMENT_SECTIONS } from "./recruitmentConfig";
import { RECRUITMENT_DATA_EVENT, getCapabilities, getNavBadges } from "./recruitmentService";
import { EmptyState } from "./RecruitmentUi";

const SECTION_ICONS = {
  dashboard: LayoutDashboard,
  requisitions: ClipboardList,
  candidates: Users,
  interviews: CalendarClock,
  offers: FileSignature,
  documents: FileCheck2,
  joining: UserPlus,
  conversion: UserCheck,
  communication: Mail,
  reports: BarChart3,
  settings: Settings2,
};

const navClass = ({ isActive }) =>
  `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-border ${
    isActive ? "bg-accent text-white" : "text-ink-secondary hover:bg-surface-sunken hover:text-ink"
  }`;

export default function RecruitmentLayout() {
  const [badges, setBadges] = useState({});
  const [caps, setCaps] = useState(null);
  const { userProfile, accessibleModules, user } = useAuth();
  const userMetadata = user?.user_metadata ?? null;
  const allowedTabs = useMemo(
    () => new Set(getVisibleRecruitmentTabs(userProfile, accessibleModules, userMetadata, "admin").map((t) => t.tabTo)),
    [userProfile, accessibleModules, userMetadata]
  );

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="type-page-title text-ink">In-house Recruitment</h1>
          <p className="type-meta mt-1 max-w-3xl text-ink-secondary">
            Track every candidate from requisition to Employee Master in one pipeline.
          </p>
        </div>
      </header>

      <nav
        aria-label="Recruitment sections"
        className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1.5 shadow-card"
      >
        {RECRUITMENT_SECTIONS.filter((s) => allowedTabs.has(s.to) && (!caps || caps[s.cap] !== false)).map((s) => {
          const Icon = SECTION_ICONS[s.key];
          const count = badges[s.key];
          return (
            <NavLink key={s.key} to={s.to} end={s.end} className={navClass}>
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              <span className="whitespace-nowrap">{s.label}</span>
              {count > 0 ? (
                <span className="ml-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-warning px-1 text-[10px] font-semibold leading-4 text-white">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

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
