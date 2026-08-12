import React, { Suspense, useMemo } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  Mail,
  PhoneCall,
  UserCheck,
  UserPlus,
} from "lucide-react";
import PageLoader from "../../../components/PageLoader";
import { useAuth } from "../../../contexts/AuthContext";
import {
  RECRUITMENT_TAB_KEYS,
  getVisibleRecruitmentTabs,
} from "../../../config/roles";

const TAB_ICONS = {
  ".": LayoutDashboard,
  candidates: PhoneCall,
  "offer-generation": FileText,
  "offer-response": ClipboardCheck,
  joining: UserPlus,
  iom: Mail,
  conversion: UserCheck,
  "dropdown-master": ListChecks,
};

const tabClass = ({ isActive }) =>
  `inline-flex h-9 items-center gap-2 px-3.5 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

export default function CallingMasterLayout() {
  const { userProfile, accessibleModules, user } = useAuth();
  const userMetadata = user?.user_metadata ?? null;

  const visibleTabs = useMemo(
    () => getVisibleRecruitmentTabs(userProfile, accessibleModules, userMetadata),
    [userProfile, accessibleModules, userMetadata]
  );

  return (
    <div className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <div className="shrink-0">
        <h1 className="type-page-title text-ink">Calling Database</h1>
        <p className="type-meta mt-1.5 max-w-3xl text-ink-secondary">
          Maintain candidate calling records through offer, joining, IOM, and Employee Master conversion.
        </p>
      </div>

      <div className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <nav className="flex flex-wrap gap-2 px-3 py-3 sm:px-4" aria-label="Calling database tabs">
          {visibleTabs.map((tab) => {
            const Icon = TAB_ICONS[tab.tabTo];
            return (
              <NavLink key={tab.value} to={tab.tabTo} end={tab.end} className={tabClass}>
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="whitespace-nowrap">{tab.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="min-h-0 min-w-0 flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
