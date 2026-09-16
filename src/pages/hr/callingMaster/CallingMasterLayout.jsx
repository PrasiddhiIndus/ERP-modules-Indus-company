import React, { Suspense, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ClipboardCheck,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListChecks,
  Mail,
  PhoneCall,
  Share2,
  UserCheck,
  UserPlus,
} from "lucide-react";
import PageLoader from "../../../components/PageLoader";
import { useAuth } from "../../../contexts/AuthContext";
import {
  getRecruitmentScopeFromPath,
  getVisibleRecruitmentTabs,
} from "../../../config/roles";
import { fetchPendingRequisitionCount } from "../../../lib/candidateRequisitionsApi";
import { RecruitmentUiProvider } from "./recruitmentUiContext";
import { getRecruitmentUi } from "./callingMasterConfig";

const TAB_ICONS = {
  ".": LayoutDashboard,
  requisitions: ClipboardList,
  candidates: PhoneCall,
  referral: Share2,
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
  const { pathname } = useLocation();
  const userMetadata = user?.user_metadata ?? null;
  const scope = getRecruitmentScopeFromPath(pathname);
  const [pendingRequisitions, setPendingRequisitions] = useState(0);

  const visibleTabs = useMemo(
    () => getVisibleRecruitmentTabs(userProfile, accessibleModules, userMetadata, scope),
    [userProfile, accessibleModules, userMetadata, scope]
  );
  const ui = getRecruitmentUi(scope);

  useEffect(() => {
    if (scope !== "admin") {
      setPendingRequisitions(0);
      return undefined;
    }
    let cancelled = false;
    fetchPendingRequisitionCount()
      .then((n) => {
        if (!cancelled) setPendingRequisitions(n);
      })
      .catch(() => {
        if (!cancelled) setPendingRequisitions(0);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, pathname]);

  return (
    <RecruitmentUiProvider scope={scope}>
    <div className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-col gap-4 p-4 md:p-6">
      <div className="shrink-0">
        <h1 className="type-page-title text-ink">{ui.pageTitle}</h1>
        <p className="type-meta mt-1.5 max-w-3xl text-ink-secondary">
          {ui.pageSubtitle}
        </p>
      </div>

      {scope === "admin" && pendingRequisitions > 0 ? (
        <p className="shrink-0 text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>{pendingRequisitions}</strong> manager requisition
          {pendingRequisitions === 1 ? "" : "s"} pending — open the{" "}
          <NavLink to="requisitions" className="font-medium text-accent underline">
            Requisitions
          </NavLink>{" "}
          tab to review and start calling.
        </p>
      ) : null}

      <div className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <nav className="flex flex-wrap gap-2 px-3 py-3 sm:px-4" aria-label={ui.scope === "admin" ? "In-house recruitment tabs" : "Calling database tabs"}>
          {visibleTabs.map((tab) => {
            const Icon = TAB_ICONS[tab.tabTo];
            const showBadge = tab.tabTo === "requisitions" && pendingRequisitions > 0;
            return (
              <NavLink key={tab.value} to={tab.tabTo} end={tab.end} className={tabClass}>
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span className="whitespace-nowrap">{tab.label}</span>
                {showBadge ? (
                  <span className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {pendingRequisitions > 99 ? "99+" : pendingRequisitions}
                  </span>
                ) : null}
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
    </RecruitmentUiProvider>
  );
}
