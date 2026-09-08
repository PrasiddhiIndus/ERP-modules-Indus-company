import React, { Suspense, createContext, useContext, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import PageLoader from "../../../components/PageLoader";
import {
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Table2,
  Users,
} from "lucide-react";
import { TinySelect } from "../../adminOperations/components/AdminUi";
import {
  SITE_TYPES,
  getSelectedSiteType,
  setSelectedSiteType,
} from "../../../lib/siteAttendance/siteTypes";
import { useAuth } from "../../../contexts/AuthContext";
import { resolveSiteAttendanceAccess } from "../../../lib/siteAttendance/siteAttendanceAccess";

const TABS = [
  { to: "dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "sites", label: "Site Master", icon: Building2 },
  { to: "people", label: "People Master", icon: Users },
  { to: "attendance", label: "Attendance", icon: ClipboardList },
  { to: "admin-view", label: "Admin view", icon: Table2 },
  { to: "summary", label: "Summary", icon: FileText },
];

const tabClass = ({ isActive }) =>
  `inline-flex h-9 items-center gap-2 px-3.5 rounded-md text-sm font-medium border transition-colors ${
    isActive
      ? "bg-accent text-white border-accent"
      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-300"
  }`;

const SiteTypeContext = createContext({
  siteType: "",
  setSiteType: () => {},
});

const SiteAttendanceAccessContext = createContext({
  loading: true,
  canAssignHr: false,
  seesAllSites: true,
  allowedSiteIds: null,
  hrTeam: [],
  employeeCode: null,
});

export function useSiteAttendanceType() {
  return useContext(SiteTypeContext);
}

export function useSiteAttendanceAccess() {
  return useContext(SiteAttendanceAccessContext);
}

export default function SiteAttendanceLayout() {
  const { user, userProfile } = useAuth();
  const [siteType, setSiteTypeState] = useState(() => getSelectedSiteType());
  const setSiteType = (value) => {
    setSiteTypeState(setSelectedSiteType(value));
  };
  const typeValue = useMemo(() => ({ siteType, setSiteType }), [siteType]);
  const [access, setAccess] = useState({
    loading: true,
    canAssignHr: false,
    seesAllSites: true,
    allowedSiteIds: null,
    hrTeam: [],
    employeeCode: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await resolveSiteAttendanceAccess({
          userId: user?.id,
          email: user?.email,
          role: userProfile?.role,
        });
        if (!cancelled) setAccess({ loading: false, ...next });
      } catch {
        if (!cancelled) {
          setAccess({
            loading: false,
            canAssignHr: false,
            seesAllSites: false,
            allowedSiteIds: [],
            hrTeam: [],
            employeeCode: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, userProfile?.role]);

  return (
    <SiteTypeContext.Provider value={typeValue}>
      <SiteAttendanceAccessContext.Provider value={access}>
        <div className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
            <div>
              <h1 className="type-page-title text-ink">Site attendance</h1>
              <p className="type-meta mt-1.5 max-w-3xl text-ink-secondary">
                Contract-site roster, daily marks, and monthly summaries. Same site and people records used by Site Employee IOM.
              </p>
            </div>
            <label className="flex flex-col gap-1 min-w-[160px]">
              <span className="text-[11px] font-medium text-ink-secondary">Site type</span>
              <TinySelect value={siteType} onChange={(e) => setSiteType(e.target.value)}>
                <option value="">Select type</option>
                {SITE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </TinySelect>
            </label>
          </div>

          <div className="shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <nav className="flex flex-wrap gap-2 px-3 py-3 sm:px-4" aria-label="Site attendance">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {!siteType ? (
            <p className="type-meta rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
              Showing all site types. Choose Safety or Fire to filter (most live sites are Fire).
            </p>
          ) : null}
          {!access.loading && !access.seesAllSites ? (
            <p className="type-meta rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
              Showing sites assigned to you.
            </p>
          ) : null}

          <div className="min-h-0 min-w-0 flex-1">
            <Suspense fallback={<PageLoader />}>
              {access.loading ? <PageLoader /> : <Outlet />}
            </Suspense>
          </div>
        </div>
      </SiteAttendanceAccessContext.Provider>
    </SiteTypeContext.Provider>
  );
}
