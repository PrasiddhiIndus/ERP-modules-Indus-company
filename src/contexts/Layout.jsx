import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import PageLoader from "../components/PageLoader";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuditConsole } from "../contexts/AuditConsoleContext";
import { ROLES, getLandingPathForUser, isPathAllowed, canSeeSubModule, isRecruitmentIndexPath, isAdminRecruitmentIndexPath, hasAnyRecruitmentTabAccess, getRecruitmentLandingPath, getOpenableIevCostingTabs, getOpenableProjectsEnquiryTabs, FINANCE_MASTER_PO_AT_GLANCE_SUBMODULE_KEY } from "../config/roles";
import {
  canAccessSalaryAdmin,
  EMPLOYEE_MASTER_SUBMODULE_KEY,
} from "../pages/adminOperations/salaryAdmin/salaryAccess";
import { canAccessRulesConsole } from "../pages/adminOperations/rulesConsole/rulesConsoleAccess";
import { syncSalaryFiguresHidden } from "../pages/adminOperations/salaryAdmin/salaryPrivacy";
import { canAccessCompliance } from "../pages/compliance/payroll/complianceAccess";
import { fetchMyMisAccess } from "../pages/adminOperations/salaryAdmin/mis/misDb";
import { useProbationReviewsAccess } from "../pages/adminOperations/probationReviews/probationAccess";
import { INDUS_LOGO_SRC } from "../constants/branding.js";
import { resolveModule } from "../lib/activityDescriptors";
import ActivityLogDrawer from "../components/ActivityLogDrawer";
import { SALARY_SUB_NAV, HR_SALARY_BASE, salaryNavIsActive, salaryNavPath } from "../pages/hr/payroll/salary/salaryNav";
import { OPERATIONS_NAV, operationsNavHref, operationsNavIsActive } from "../pages/operations/navConfig";
import { MARKETING_NAV_ITEMS } from "../pages/marketing/marketingNav";
import PoApprovalBell from "../components/PoApprovalBell";
import CommandPalette from "../components/CommandPalette";
import { COMMAND_DESTINATIONS } from "../lib/commandDestinations";
import { prefetchRouteModule } from "../lib/routePrefetch";
import { prefetchAllDashboards } from "../lib/prefetchDashboards";
import { useTheme } from "./ThemeContext";
import { Breadcrumbs } from "../components/erpUi";

const EnquiryDueSoonPopup = lazy(() => import("../pages/projects/enquiry/EnquiryDueSoonPopup"));
const EnquiryOverduePopup = lazy(() => import("../pages/projects/enquiry/EnquiryOverduePopup"));
const EnquiryCompletedPopup = lazy(() => import("../pages/projects/enquiry/EnquiryCompletedPopup"));
import { beginProjectsVisit, endProjectsVisit } from "../pages/projects/enquiry/enquiryPopupVisit";
import {
  LogOut,
  User,
  BarChart3,
  Activity,
  Settings,
  Truck,
  Users,
  ChevronDown,
  TrendingUp,
  FileText,
  DollarSign,
  Calendar,
  CalendarDays,
  Package,
  ShoppingCart,
  MapPin,
  Receipt,
  Receipt as ReceiptIcon,
  Car,
  CreditCard,
  Clock,
  UserCheck,
  Wrench,
  Calculator,
  FolderOpen,
  Shield,
  ClipboardCheck,
  Factory,
  UserPlus,
  CheckCircle,
  AlertTriangle,
  Home,
  Briefcase,
  Cog,
  LayoutDashboard,
  FileCheck,
  FileDigit,
  Bell,
  BookOpen,
  History,
  Wallet,
  UserX,
  ClipboardList,
  Building2,
  PhoneCall,
  Layers,
  FileSpreadsheet,
  Mail,
  SlidersHorizontal,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeft,
  Search as SearchIcon,
} from "lucide-react";

// Rupee Icon Component – same visual size as w-4 h-4 lucide icons
const RupeeIcon = ({ className = '' }) => {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-base font-bold leading-none ${className}`}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      ₹
    </span>
  );
};

const topLinkBase =
  "group flex flex-none items-center gap-2.5 px-2.5 py-2 rounded-control transition-[background-color,border-color,box-shadow,color,transform] duration-theme ease-theme min-h-[2.35rem] border border-transparent text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong";
const subLinkBase =
  "group flex flex-none items-center gap-2.5 px-2.5 py-1.5 rounded-control transition-[background-color,border-color,box-shadow,color] duration-theme ease-theme border border-transparent text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-strong";
const activeClass =
  "bg-sidebar-active text-sidebar-strong border border-transparent border-l-[3px] border-l-sidebar-accent shadow-nav-active";
const sectionOpenClass =
  "bg-sidebar-active text-sidebar-strong shadow-nav-active border border-transparent border-l-[3px] border-l-sidebar-accent";
const topNavClass = ({ isActive }) => `${topLinkBase} ${isActive ? activeClass : ""}`;
const subNavClass = ({ isActive }) => `${subLinkBase} ${isActive ? activeClass : ""}`;
const sectionBtnClass = (open) =>
  `flex items-center justify-between w-full px-2.5 py-2 rounded-control transition-[background-color,color,border-color] duration-theme ease-theme min-h-[2.35rem] border border-transparent text-sidebar-strong hover:bg-sidebar-hover ${
    open ? sectionOpenClass : ""
  }`;

/** Parse activity route label (`Module · Page`) into app-bar eyebrow + title. */
function workspaceFromModuleLabel(label) {
  const text = String(label || "").trim();
  if (!text) return null;
  const sep = text.indexOf(" · ");
  if (sep !== -1) {
    return {
      eyebrow: text.slice(0, sep),
      title: text.slice(sep + 3),
    };
  }
  const eyebrowByTitle = {
    Billing: "Finance",
    Marketing: "Go-to-market",
    Operations: "Operations",
    Compliance: "Compliance",
    Settings: "System",
    Dashboard: "Overview",
    Procurement: "Procurement",
    Projects: "Projects",
    HR: "People",
  };
  return {
    eyebrow: eyebrowByTitle[text] || text,
    title: text,
  };
}

/** Compact workspace label for the top app bar (presentation only). */
function resolveWorkspaceContext(pathname) {
  const p = (pathname || "").replace(/\/$/, "") || "/app";
  if (p === "/app" || p.startsWith("/app/dashboard")) {
    return { eyebrow: "Overview", title: "Command centre" };
  }

  const moduleLabel = resolveModule(p);
  if (moduleLabel && !moduleLabel.startsWith("App ·")) {
    const fromRoute = workspaceFromModuleLabel(moduleLabel);
    if (fromRoute) return fromRoute;
  }

  const rules = [
    [/\/app\/hr|\/app\/attendance|\/app\/salary|\/app\/people-management/, "People", "HR & workforce"],
    [/\/app\/ifsp-employee-compliance|\/app\/general-compliance|\/app\/compliance(\/|$)/, "Compliance", "Statutory & registers"],
    [/\/app\/admin\/employee|\/app\/ifsp-employee|\/app\/all-employees/, "Admin", "Employees & HR"],
    [/\/app\/admin\/salary-admin/, "Admin", "Salary administration"],
    [/\/app\/admin/, "Admin", "Operations"],
    [/\/app\/store-inventory|\/app\/gate-pass/, "Admin", "Store & gate pass"],
    [/\/app\/commercial\/rm-mm-amc-iev/, "R&M", "R&M"],
    [/\/app\/commercial|\/app\/manpower/, "Commercial", "Manpower & training"],
    [/\/app\/marketing/, "Go-to-market", "Marketing"],
    [/\/app\/crm-outreach/, "Go-to-market", "Client/In-House Mail Outreach"],
    [/\/app\/maintenance/, "Service", "Maintenance"],
    [/\/app\/billing|\/app\/projects-billing/, "Finance", "Billing"],
    [/\/app\/operations|\/app\/fire-tender-vehicle/, "Operations", "Sites & fleet"],
    [/\/app\/projects|\/app\/fire-tender/, "Projects", "Delivery & costing"],
    [/\/app\/procurement/, "Procurement", "Vendors & POs"],
    [/\/app\/finance|\/app\/accounts/, "Finance", "Accounts"],
    [/\/app\/settings|\/app\/user-management|\/app\/all-employees/, "System", "Settings"],
    [/\/app\/api-monitoring/, "System", "API health"],
  ];
  for (const [re, eyebrow, title] of rules) {
    if (re.test(p)) return { eyebrow, title };
  }
  return { eyebrow: "INDUS OS", title: "Workspace" };
}

function formatToolbarDate(d = new Date()) {
  try {
    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const Layout = () => {
  const { user, signOut, accessibleModules, subModulePaths, navVisibleModules, userProfile } = useAuth();
  syncSalaryFiguresHidden(userProfile, user);
  const can = (moduleKey) => Boolean(navVisibleModules?.has(moduleKey));
  const canSub = (subModuleKey) =>
    canSeeSubModule(userProfile, accessibleModules, subModuleKey, {
      ...(user?.user_metadata || {}),
      email: userProfile?.email || user?.email,
    });
  const canOpenPath = (path) => isPathAllowed(path, accessibleModules || new Set(), subModulePaths);
  const ievCostingTabs = getOpenableIevCostingTabs(userProfile, accessibleModules, subModulePaths);
  const enquiryTabs = getOpenableProjectsEnquiryTabs(userProfile, accessibleModules, subModulePaths);
  const hasFullAdmin = Boolean(accessibleModules?.has("admin"));
  // Probation Reviews: L1 managers with reportees + HR 10935 only (not implied by Admin access).
  const { canAccess: canSeeProbationReviews } = useProbationReviewsAccess();
  const { isConsoleVisible } = useAuditConsole();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("indus-erp-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [navFilter, setNavFilter] = useState("");
  const { theme, toggleTheme } = useTheme();
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [pendingRequisitionCount, setPendingRequisitionCount] = useState(0);
  const canSeeActivityLog =
    userProfile?.role === ROLES.SUPER_ADMIN || userProfile?.role === ROLES.SUPER_ADMIN_PRO;
  const workspace = resolveWorkspaceContext(pathname);
  const displayName =
    userProfile?.username || user?.email?.split("@")[0] || user?.email || "User";
  const initials = String(displayName)
    .split(/[\s._@-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "U";
  const todayLabel = formatToolbarDate();

  const allowedCommands = useMemo(() => {
    return COMMAND_DESTINATIONS.filter((d) =>
      isPathAllowed(d.path, accessibleModules || new Set(), subModulePaths, {
        ...(userProfile || {}),
        email: userProfile?.email || user?.email || "",
      })
    );
  }, [accessibleModules, subModulePaths, userProfile, user?.email]);

  useEffect(() => {
    try {
      localStorage.setItem("indus-erp-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && String(e.key || "").toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warm all dashboard modules as soon as the shell is up.
  useEffect(() => {
    prefetchAllDashboards();
  }, []);

  // One Projects visit id for overdue reminder: set on entry, clear on leave (not on in-module refresh).
  useEffect(() => {
    if (pathname.startsWith("/app/projects")) beginProjectsVisit();
    else endProjectsVisit();
  }, [pathname]);

  // Warm likely destination chunks on sidebar hover/focus (no behavior change).
  useEffect(() => {
    const onIntent = (e) => {
      const a = e.target?.closest?.("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.includes("/app")) return;
      prefetchRouteModule(href);
    };
    document.addEventListener("pointerover", onIntent, { passive: true });
    document.addEventListener("focusin", onIntent, { passive: true });
    return () => {
      document.removeEventListener("pointerover", onIntent);
      document.removeEventListener("focusin", onIntent);
    };
  }, []);

  const navFilterNorm = navFilter.trim().toLowerCase();
  const navMatch = (label) => {
    if (!navFilterNorm) return true;
    return String(label || "").toLowerCase().includes(navFilterNorm);
  };

  // Route guard:
  // - For /app/dashboard, if user doesn't have overview, auto-redirect to their module home.
  // - For other deep links, show Access denied (helps debugging and avoids surprise redirects).
  useEffect(() => {
    if (!pathname.startsWith("/app")) return;
    if (!accessibleModules?.size) {
      setIsAccessDenied(false);
      return;
    }
    const allowed = isPathAllowed(pathname, accessibleModules, subModulePaths, {
      ...(userProfile || {}),
      email: userProfile?.email || user?.email || "",
    });
    if (!allowed && pathname === "/app/dashboard") {
      const landing = getLandingPathForUser(userProfile, accessibleModules);
      navigate(landing, { replace: true });
      setIsAccessDenied(false);
      return;
    }
    if (
      !allowed &&
      isRecruitmentIndexPath(pathname) &&
      hasAnyRecruitmentTabAccess(userProfile, accessibleModules, user?.user_metadata)
    ) {
      navigate(getRecruitmentLandingPath(userProfile, accessibleModules, user?.user_metadata), {
        replace: true,
      });
      setIsAccessDenied(false);
      return;
    }
    if (
      !allowed &&
      isAdminRecruitmentIndexPath(pathname) &&
      hasAnyRecruitmentTabAccess(userProfile, accessibleModules, user?.user_metadata, "admin")
    ) {
      navigate(
        getRecruitmentLandingPath(userProfile, accessibleModules, user?.user_metadata, "admin"),
        { replace: true }
      );
      setIsAccessDenied(false);
      return;
    }
    if (!allowed && pathname.replace(/\/$/, "") === "/app/projects/enquiry") {
      const enquiryTabs = getOpenableProjectsEnquiryTabs(userProfile, accessibleModules, subModulePaths);
      if (enquiryTabs.length) {
        navigate(`/app/projects/enquiry/${enquiryTabs[0]}`, { replace: true });
        setIsAccessDenied(false);
        return;
      }
    }
    setIsAccessDenied(!allowed);
  }, [pathname, accessibleModules, subModulePaths, navigate, userProfile, user?.email]);

  useEffect(() => {
    const canSeeRecruitmentNav =
      canSub("admin.recruitment") ||
      canSub("admin.employee") ||
      hasAnyRecruitmentTabAccess(userProfile, accessibleModules, user?.user_metadata, "admin");
    if (!canSeeRecruitmentNav) {
      setPendingRequisitionCount(0);
      return undefined;
    }
    let cancelled = false;
    import("../pages/adminOperations/recruitment/recruitmentService")
      .then((m) => m.countPendingApprovals())
      .then((n) => {
        if (!cancelled) setPendingRequisitionCount(n);
      })
      .catch(() => {
        if (!cancelled) setPendingRequisitionCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [userProfile, accessibleModules, user?.user_metadata, pathname]);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const [hrAdminOpen, setHrAdminOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [misScopedOnly, setMisScopedOnly] = useState(false);
  useEffect(() => {
    if (!user?.id || canAccessSalaryAdmin(userProfile, user)) {
      setMisScopedOnly(false);
      return undefined;
    }
    let cancelled = false;
    fetchMyMisAccess().then((a) => {
      if (!cancelled) setMisScopedOnly(!a.full && a.scopes.length > 0);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, userProfile?.email]);
  const [commercialMtOpen, setCommercialMtOpen] = useState(false);
  const [commercialRmOpen, setCommercialRmOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [fireTenderOpen, setFireTenderOpen] = useState(false);
  const [amcOpen, setAmcOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [adminStoreOpen, setAdminStoreOpen] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminMiscOpen, setAdminMiscOpen] = useState(false);
  const [hrSalaryOpen, setHrSalaryOpen] = useState(false);
  const [manpowerOperationsOpen, setManpowerOperationsOpen] = useState(false);
  const [manpowerConfigOpen, setManpowerConfigOpen] = useState(false);

  // Auto-expand Admin when user has partial sub-module access only
  useEffect(() => {
    if (!userProfile?.allowed_sub_modules?.length) return;
    const partialAdmin = userProfile.allowed_sub_modules.some((k) => String(k).startsWith("admin."));
    if (partialAdmin && can("admin")) {
      setAdminOpen(true);
    }
  }, [userProfile?.allowed_sub_modules, accessibleModules, navVisibleModules]);

  // Keep expandable section open when current path is under that section
  useEffect(() => {
    if (pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/salary") || pathname.startsWith("/app/people-management") || pathname.startsWith("/app/hr/payroll/salary")) setHrAdminOpen(true);
    if (pathname.startsWith("/app/hr/payroll/salary")) setHrSalaryOpen(true);
    if (pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance") || pathname === "/app/compliance" || pathname.startsWith("/app/compliance/")) setComplianceOpen(true);
    if (pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") || pathname.startsWith("/app/admin")) setAdminOpen(true);
    if (pathname.startsWith("/app/marketing")) setMarketingOpen(true);
    if (pathname.startsWith("/app/maintenance")) setMaintenanceOpen(true);
    if (pathname.startsWith("/app/manpower") || pathname.startsWith("/app/commercial/manpower-training")) setCommercialMtOpen(true);
    if (pathname.startsWith("/app/commercial/rm-mm-amc-iev")) setCommercialRmOpen(true);
    if (pathname.startsWith("/app/manpower/configuration")) setManpowerConfigOpen(true);
    if (pathname.startsWith("/app/billing")) setBillingOpen(true);
    if (pathname.startsWith("/app/fire-tender-vehicle") || pathname.startsWith("/app/operations")) setOperationsOpen(true);
    if (pathname.startsWith("/app/operations")) setManpowerOperationsOpen(true);
    if (
      pathname.startsWith("/app/projects/dashboard") ||
      pathname.startsWith("/app/projects/reports") ||
      pathname.startsWith("/app/projects/po") ||
      pathname.startsWith("/app/projects/enquiry") ||
      pathname.startsWith("/app/projects/quotation") ||
      pathname.startsWith("/app/projects-management") ||
      pathname.startsWith("/app/projects-billing") ||
      pathname.startsWith("/app/projects-po-at-glance")
    ) {
      setProjectsOpen(true);
    }
    if (pathname.startsWith("/app/fire-tender") || pathname.startsWith("/app/fire-tender-manufacturing")) setFireTenderOpen(true);
    if (pathname.startsWith("/app/amc")) setAmcOpen(true);
    if (pathname.startsWith("/app/accounts-finance")) setFinanceOpen(true);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const collapseAdminSubmodules = () => {
    setAdminStoreOpen(false);
    setAdminGateOpen(false);
    setAdminMiscOpen(false);
  };

  const [activityLogOpen, setActivityLogOpen] = useState(false);

  if (isAccessDenied) {
    const landing = getLandingPathForUser(userProfile, accessibleModules);
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-surface border border-border rounded-card shadow-card p-6">
          <h1 className="text-lg font-semibold text-ink">Access denied</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            You don&apos;t have permission to open this page.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate(landing)}
              className="erp-btn-primary px-4 py-2 rounded-control"
            >
              Go to Home
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="erp-btn-secondary px-4 py-2 rounded-control"
            >
              Sign out
            </button>
          </div>
          <p className="mt-4 text-xs text-ink-muted break-words font-mono">
            Current URL: <span>{pathname}</span>
          </p>
        </div>
      </div>
    );
  }

  const sidebarWidthClass = sidebarCollapsed ? "lg:w-sidebar-collapsed w-64" : "w-64 lg:w-sidebar";
  const mainOffsetClass = sidebarCollapsed ? "lg:ml-sidebar-collapsed" : "lg:ml-sidebar";

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed inset-y-0 left-0 z-50 ${sidebarWidthClass} bg-sidebar border-r border-sidebar-border transition-[transform,width] duration-theme-slow ease-theme shadow-[4px_0_24px_rgba(23,29,53,0.12)]`}
      >
        <div className="flex flex-col h-full">
          {/* Logo + Close */}
          <div className="flex items-center justify-between px-3 py-3.5 border-b border-sidebar-border gap-2 bg-sidebar-elevated/40 min-h-topbar">
            <div className={`flex items-center gap-2.5 min-w-0 flex-1 ${sidebarCollapsed ? "lg:justify-center" : ""}`}>
              <img
                src={INDUS_LOGO_SRC}
                alt=""
                className="h-9 w-9 object-contain shrink-0 rounded-full ring-2 ring-sidebar-accent/40 bg-sidebar-elevated"
                width={36}
                height={36}
              />
              {!sidebarCollapsed ? (
                <div className="min-w-0">
                  <h1 className="type-card-title text-sidebar-strong type-truncate tracking-tight">INDUS OS</h1>
                  <p className="type-mono-micro text-sidebar-muted type-truncate">Enterprise ERP</p>
                </div>
              ) : (
                <h1 className="type-card-title text-sidebar-strong type-truncate lg:hidden">INDUS OS</h1>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden lg:inline-flex p-1.5 rounded-control text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-strong border border-transparent"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-control hover:bg-sidebar-hover text-sidebar-muted"
            >
              ×
            </button>
          </div>

          {!sidebarCollapsed ? (
            <div className="px-3 pt-3">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-sidebar-muted pointer-events-none" />
                <input
                  type="search"
                  value={navFilter}
                  onChange={(e) => setNavFilter(e.target.value)}
                  placeholder="Filter menu…"
                  className="w-full h-9 pl-8 pr-2 rounded-control border border-sidebar-border bg-sidebar-elevated text-sidebar-strong type-meta placeholder:text-sidebar-muted focus:outline-none focus:ring-2 focus:ring-sidebar-accent/40"
                  aria-label="Filter navigation"
                />
              </div>
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="mt-2 w-full flex items-center justify-between gap-2 h-9 px-2.5 rounded-control border border-sidebar-border bg-sidebar-elevated text-sidebar-muted type-meta hover:bg-sidebar-hover hover:text-sidebar-strong transition-colors duration-theme"
              >
                <span>Jump to page</span>
                <kbd className="type-mono-micro border border-sidebar-border rounded px-1.5 py-0.5 text-sidebar-muted">⌘K</kbd>
              </button>
            </div>
          ) : (
            <div className="hidden lg:flex px-2 pt-3 justify-center">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-control border border-sidebar-border bg-sidebar-elevated text-sidebar-muted hover:bg-sidebar-hover"
                aria-label="Jump to page"
                title="Jump to page (⌘K)"
              >
                <SearchIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Nav Links */}
          <nav className={`flex-1 p-3 space-y-1.5 overflow-y-auto ${sidebarCollapsed ? "lg:px-2" : ""}`}>
            {navFilterNorm ? (
              <div className="space-y-0.5">
                <p className="px-2 pb-1 type-mono-micro text-sidebar-muted">Matching pages</p>
                {allowedCommands.filter((d) => navMatch(`${d.label} ${d.group} ${d.keywords}`)).length === 0 ? (
                  <p className="px-2 py-4 type-meta text-sidebar-muted">No matches</p>
                ) : (
                  allowedCommands
                    .filter((d) => navMatch(`${d.label} ${d.group} ${d.keywords}`))
                    .map((d) => (
                      <NavLink
                        key={d.path}
                        to={d.path}
                        className={subNavClass}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <span className="type-meta type-truncate">{d.label}</span>
                      </NavLink>
                    ))
                )}
              </div>
            ) : null}
            {!navFilterNorm && can("overview") && (
              <NavLink to="/app/dashboard" className={topNavClass} title="Dashboard">
                <BarChart3 className="w-4 h-4 shrink-0" />
                {!sidebarCollapsed ? (
                  <span className="type-body-medium type-truncate">Dashboard</span>
                ) : (
                  <span className="type-body-medium type-truncate lg:hidden">Dashboard</span>
                )}
              </NavLink>
            )}
            {!navFilterNorm && (
            <div className={sidebarCollapsed ? "lg:hidden space-y-1.5" : "space-y-1.5"}>
            {/* HR */}
            {can("hr") && (
            <div>
              <button
                onClick={() => setHrAdminOpen(!hrAdminOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/salary") || pathname.startsWith("/app/people-management") || pathname.startsWith("/app/hr/payroll/salary") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">HR</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    hrAdminOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {hrAdminOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  {canSub("hr.dashboard") && (
                  <NavLink to="hr/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  )}
                  {canSub("hr.employee-master") && (
                  <NavLink
                    to="hr/employee-master"
                    className={() => {
                      const path = pathname;
                      const active =
                        path.startsWith("/app/hr/employee-master") ||
                        path === "/app/hr";
                      return subNavClass({ isActive: active });
                    }}
                  >
                    <User className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">HR Management</span>
                  </NavLink>
                  )}
                  {(canSub("hr.calling-master") ||
                    hasAnyRecruitmentTabAccess(userProfile, accessibleModules, user?.user_metadata)) && (
                  <NavLink
                    to={getRecruitmentLandingPath(userProfile, accessibleModules, user?.user_metadata).replace(
                      /^\/app\//,
                      ""
                    )}
                    className={() =>
                      subNavClass({
                        isActive: pathname.startsWith("/app/hr/calling-master"),
                      })
                    }
                  >
                    <PhoneCall className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Recruitment</span>
                  </NavLink>
                  )}
                  {canSub("hr.attendance") && (
                  <NavLink to="attendance" className={subNavClass}>
                    <Clock className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Attendance</span>
                  </NavLink>
                  )}
                  {canSub("hr.salary-management") && (
                  <>
                  <button
                    type="button"
                    onClick={() => setHrSalaryOpen(!hrSalaryOpen)}
                    className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${
                      pathname.startsWith(`/app/${HR_SALARY_BASE}`)
                        ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent"
                        : "text-sidebar-strong"
                    }`}
                    aria-expanded={hrSalaryOpen}
                    aria-label="Toggle salary management menu"
                  >
                    <span className="flex items-center space-x-2.5 min-w-0">
                      <Wallet className="w-4 h-4 shrink-0 text-sidebar-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Salary Management</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${hrSalaryOpen ? "rotate-180" : ""}`} />
                  </button>
                  {hrSalaryOpen && (
                    <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                      {SALARY_SUB_NAV.map((item) => (
                        <NavLink
                          key={item.to}
                          to={salaryNavPath(item.to).replace(/^\/app\//, "")}
                          className={() => subNavClass({ isActive: salaryNavIsActive(item, location) })}
                        >
                          <span className="type-meta type-truncate">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                  </>
                  )}
                  {canSub("hr.site-attendance") && (
                  <NavLink
                    to="hr/site-attendance"
                    className={() =>
                      subNavClass({
                        isActive: pathname.startsWith("/app/hr/site-attendance"),
                      })
                    }
                  >
                    <Building2 className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Site Attendance</span>
                  </NavLink>
                  )}
                  {canSub("hr.people-management") && (
                  <NavLink to="people-management" className={subNavClass}>
                    <UserPlus className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">People Management</span>
                  </NavLink>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Compliance */}
            {canAccessCompliance(userProfile, user) && (
            <div>
              <button
                onClick={() => setComplianceOpen(!complianceOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance") || pathname === "/app/compliance" || pathname.startsWith("/app/compliance/") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Compliance</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    complianceOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {complianceOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  {canSub("compliance.payroll") && (
                  <>
                  <NavLink
                    to="compliance/dashboard"
                    className={() =>
                      `${subLinkBase} ${
                        pathname === "/app/compliance" ||
                        pathname === "/app/compliance/" ||
                        pathname === "/app/compliance/dashboard"
                          ? activeClass
                          : "text-sidebar-strong"
                      }`
                    }
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  <NavLink
                    to="compliance/forms"
                    className={() =>
                      `${subLinkBase} ${
                        pathname.startsWith("/app/compliance/forms")
                          ? activeClass
                          : "text-sidebar-strong"
                      }`
                    }
                  >
                    <FileText className="w-4 h-4 shrink-0 text-ink-muted" />
                    <span className="type-meta type-truncate">Compliance Forms</span>
                  </NavLink>
                  <NavLink
                    to="compliance/payroll-process"
                    className={() =>
                      `${subLinkBase} ${
                        pathname.startsWith("/app/compliance/payroll-process")
                          ? activeClass
                          : "text-sidebar-strong"
                      }`
                    }
                  >
                    <FileSpreadsheet className="w-4 h-4 shrink-0 text-ink-muted" />
                    <span className="type-meta type-truncate">Payroll Compliance</span>
                  </NavLink>
                  </>
                  )}
                  {canSub("compliance.ifspl") && (
                  <NavLink to="ifsp-employee-compliance" className={subNavClass}>
                    <CheckCircle className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">IFSPL Employee Compliance</span>
                  </NavLink>
                  )}
                  {canSub("compliance.general") && (
                  <NavLink to="general-compliance" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">General Compliance</span>
                  </NavLink>
                  )}
                </div>
              )}
            </div>
            )}

            {misScopedOnly && (
              <NavLink
                to="admin/payroll-mis"
                className={`flex items-center space-x-2.5 w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/admin/payroll-mis") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span className="type-body-medium type-truncate">Payroll reports</span>
              </NavLink>
            )}

            {/* Admin */}
            {(can("admin") || canAccessSalaryAdmin(userProfile, user) || canSeeProbationReviews) && (
            <div>
              <button
                onClick={() => {
                  if (!adminOpen) collapseAdminSubmodules();
                  setAdminOpen(!adminOpen);
                }}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") || pathname.startsWith("/app/admin") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Cog className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Corporate HR/Admin</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    adminOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {adminOpen && (
                <div className="ml-6 mt-0.5 space-y-1">
                  {canSub("admin.dashboard") && (
                  <NavLink to="admin/dashboard" className={subNavClass}>
                    <LayoutDashboard className="h-4 w-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  )}

                  {(canSub("admin.recruitment") ||
                    canSub("admin.employee") ||
                    hasAnyRecruitmentTabAccess(userProfile, accessibleModules, user?.user_metadata, "admin")) && (
                  <NavLink
                    to={getRecruitmentLandingPath(userProfile, accessibleModules, user?.user_metadata, "admin").replace(
                      /^\/app\//,
                      ""
                    )}
                    className={() =>
                      subNavClass({
                        isActive: pathname.startsWith("/app/admin/recruitment"),
                      })
                    }
                  >
                    <PhoneCall className="h-4 w-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Recruitment</span>
                    {pendingRequisitionCount > 0 ? (
                      <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        {pendingRequisitionCount > 99 ? "99+" : pendingRequisitionCount}
                      </span>
                    ) : null}
                  </NavLink>
                  )}

                  {canSub(EMPLOYEE_MASTER_SUBMODULE_KEY) && (
                      <NavLink to="admin/employee/master" className={subNavClass}>
                        <Users className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Employee Master</span>
                      </NavLink>
                  )}

                  {canSub("admin.employee") && (
                  <>
                      <NavLink to="admin/employee/onboarding" className={subNavClass}>
                        <UserPlus className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Onboarding</span>
                      </NavLink>
                      <NavLink to="admin/employee/policies" className={subNavClass}>
                        <BookOpen className="h-4 w-4 shrink-0 text-sky-700" />
                        <span className="type-meta type-truncate">Policies &amp; Terms</span>
                      </NavLink>
                      <NavLink to="admin/employee/official-letters" className={subNavClass}>
                        <FileText className="h-4 w-4 shrink-0 text-indigo-700" />
                        <span className="type-meta type-truncate">Official Letters</span>
                      </NavLink>
                      <NavLink to="admin/employee/surveys" className={subNavClass}>
                        <ClipboardList className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Surveys</span>
                      </NavLink>
                      <NavLink to="admin/employee/attendance-inputs" className={subNavClass}>
                        <Clock className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Raw Attendance Data</span>
                      </NavLink>
                      <NavLink to="admin/employee/attendance-daily" className={subNavClass}>
                        <Calendar className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Daily Attendance Register</span>
                      </NavLink>
                      <NavLink to="admin/employee/national-holidays" className={subNavClass}>
                        <CalendarDays className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">National / Public Holidays</span>
                      </NavLink>
                      {/* NAV_HIDDEN: Attendance Sheets */}
                      {/* <NavLink to="admin/employee/attendance-sheets" className={subNavClass}>
                        <FileText className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Attendance Sheets</span>
                      </NavLink> */}
                      <NavLink to="admin/employee/leaves-permissions" className={subNavClass}>
                        <Calendar className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Leave Approvals</span>
                      </NavLink>
                      <NavLink to="admin/employee/tour-approvals" className={subNavClass}>
                        <MapPin className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Tour Approvals</span>
                      </NavLink>
                      <NavLink to="admin/employee/leave-management" className={subNavClass}>
                        <CalendarDays className="h-4 w-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Leave Management</span>
                      </NavLink>
                      <NavLink to="admin/employee/inactive" className={subNavClass}>
                        <UserX className="h-4 w-4 shrink-0 text-ink-muted" />
                        <span className="type-meta type-truncate">Inactive Employees</span>
                      </NavLink>
                      <NavLink to="admin/employee/exit-ff" className={subNavClass}>
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-rose-700" />
                        <span className="type-meta type-truncate">F &amp; F</span>
                      </NavLink>
                      {/* NAV_HIDDEN: Compliance & Documents, Salary Inputs */}
                  </>
                  )}

                  {canSeeProbationReviews && (
                  <NavLink to="admin/probation-reviews" className={subNavClass}>
                    <UserCheck className="h-4 w-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Probation Reviews</span>
                  </NavLink>
                  )}

                  {canSub("admin.salary-admin") && (
                  <NavLink
                    to="admin/salary-admin/dashboard"
                    className={() =>
                      `${subLinkBase} ${
                        pathname.startsWith("/app/admin/salary-admin")
                          ? activeClass
                          : "text-sidebar-strong"
                      }`
                    }
                  >
                    <Wallet className="h-4 w-4 shrink-0 text-ink-muted" />
                    <span className="type-meta type-truncate">Salary Admin</span>
                  </NavLink>
                  )}

                  {canAccessRulesConsole(userProfile, accessibleModules) && (
                  <NavLink to="admin/rules-console" className={subNavClass}>
                    <SlidersHorizontal className="h-4 w-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Rules Console</span>
                  </NavLink>
                  )}

                  {/* NAV_HIDDEN (Aug 2026): Store & Issue Control */}
                  {false && canSub("admin.store") && (
                  <>
                  <button
                    type="button"
                    onClick={() => setAdminStoreOpen(!adminStoreOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-sidebar-hover text-sidebar-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Package className="w-4 h-4 shrink-0 text-sidebar-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Store & Issue Control</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminStoreOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminStoreOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/store/item-master" className={subNavClass}><Package className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Item Master</span></NavLink>
                      <NavLink to="admin/store/store-master" className={subNavClass}><Home className="w-4 h-4 shrink-0 text-ink-muted" /><span className="type-meta type-truncate">Store Master</span></NavLink>
                      <NavLink to="admin/store/site-stock" className={subNavClass}><MapPin className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Site Stock</span></NavLink>
                      <NavLink to="admin/store/issue-entry" className={subNavClass}><FileText className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Issue Entry</span></NavLink>
                      <NavLink to="admin/store/return-entry" className={subNavClass}><Receipt className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Return Entry</span></NavLink>
                      <NavLink to="admin/store/transfer-transit" className={subNavClass}><Truck className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Transfer / Transit</span></NavLink>
                      <NavLink to="admin/store/requirement-planner" className={subNavClass}><Calculator className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Requirement Planner</span></NavLink>
                      <NavLink to="admin/store/reconciliation" className={subNavClass}><CheckCircle className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Reconciliation</span></NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {/* NAV_HIDDEN (Aug 2026): Gate Pass & Movement Control */}
                  {false && canSub("admin.gate") && (
                  <>
                  <button
                    onClick={() => setAdminGateOpen(!adminGateOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-sidebar-hover text-sidebar-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Shield className="w-4 h-4 shrink-0 text-sidebar-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Gate Pass & Movement Control</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminGateOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminGateOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/gate/employee-movement" className={subNavClass}><Users className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Employee Movement</span></NavLink>
                      <NavLink to="admin/gate/goods-in-out" className={subNavClass}><Package className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Goods In / Out</span></NavLink>
                      <NavLink to="admin/gate/visitor-guest-passes" className={subNavClass}><User className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Visitor / Guest Passes</span></NavLink>
                      <NavLink to="admin/gate/vehicle-passes" className={subNavClass}><Car className="w-4 h-4 shrink-0 text-sidebar-strong" /><span className="type-meta type-truncate">Vehicle Passes</span></NavLink>
                      <NavLink to="admin/gate/delivery-courier-post" className={subNavClass}><Truck className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Delivery / Courier / Post</span></NavLink>
                      <NavLink to="admin/gate/security-console" className={subNavClass}><Shield className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Security Console</span></NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {/* NAV_HIDDEN (Aug 2026): Miscellaneous Admin */}
                  {false && canSub("admin.misc") && (
                  <>
                  <button
                    onClick={() => setAdminMiscOpen(!adminMiscOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-sidebar-hover text-sidebar-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Briefcase className="w-4 h-4 shrink-0 text-sidebar-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Miscellaneous Admin</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminMiscOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminMiscOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/misc/events-coordination" className={subNavClass}><Calendar className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Events Coordination</span></NavLink>
                      <NavLink to="admin/misc/tour-travel-details" className={subNavClass}><MapPin className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Tour / Travel Details</span></NavLink>
                      <NavLink to="admin/misc/admin-tasks-other-requests" className={subNavClass}><ClipboardCheck className="w-4 h-4 shrink-0 text-sidebar-accent" /><span className="type-meta type-truncate">Admin Tasks / Other Requests</span></NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {canSub("admin.alerts") && (
                  <NavLink to="admin/alerts-notifications" className={subNavClass}>
                    <Bell className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Alerts & Notifications</span>
                  </NavLink>
                  )}
                  {canSub("admin.reports") && (
                  <NavLink to="admin/reports-analytics" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Reports & Analytics</span>
                  </NavLink>
                  )}
                  {/* NAV_HIDDEN: Settings / Masters */}
                  {false && canSub("admin.settings") && (
                  <NavLink to="admin/settings-masters" className={subNavClass}>
                    <Settings className="w-4 h-4 shrink-0 text-sidebar-strong" />
                    <span className="type-meta type-truncate">Settings / Masters</span>
                  </NavLink>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Commercial — Manpower / Training */}
            {(can("commercialMt") || can("sales")) && (
            <div>
              <button
                type="button"
                onClick={() => setCommercialMtOpen(!commercialMtOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${
                  pathname.startsWith("/app/commercial/manpower-training")
                    ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent"
                    : "text-sidebar-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <Briefcase className="w-4 h-4 shrink-0" />
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block text-sm font-medium">Commercial</span>
                    <span className="block text-xs">Manpower / Training</span>
                  </span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${commercialMtOpen ? "rotate-180" : ""}`}
                />
              </button>

              {commercialMtOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="/app/commercial/manpower-training/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/manpower" end className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Enquiry</span>
                  </NavLink>
                  <NavLink to="/app/manpower/internal-quotation" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-green-700" />
                    <span className="type-meta type-truncate">Internal Quotation</span>
                  </NavLink>
                  <NavLink to="/app/manpower/quotation" className={subNavClass}>
                    <ReceiptIcon className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Quotation</span>
                  </NavLink>

                  <button
                    type="button"
                    onClick={() => setManpowerConfigOpen((v) => !v)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-sidebar-hover text-sidebar-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Cog className="w-4 h-4 shrink-0 text-blue-700" />
                      <span className="text-xs font-medium text-left leading-tight">Manpower Configuration</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${manpowerConfigOpen ? "rotate-180" : ""}`} />
                  </button>
                  {manpowerConfigOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="/app/manpower/configuration/roles" className={subNavClass}>
                        <Users className="w-4 h-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Roles</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/price-master" className={subNavClass}>
                        <RupeeIcon className="w-4 h-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Price Master</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/mail-template" className={subNavClass}>
                        <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                        <span className="type-meta type-truncate">Mail Template</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/employee-type" className={subNavClass}>
                        <UserCheck className="w-4 h-4 shrink-0 text-amber-700" />
                        <span className="type-meta type-truncate">Employee Type</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/departments" className={subNavClass}>
                        <FolderOpen className="w-4 h-4 shrink-0 text-sidebar-strong" />
                        <span className="type-meta type-truncate">Departments</span>
                      </NavLink>
                    </div>
                  )}
                  <NavLink to="/app/commercial/manpower-training/po-entry" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Contract Management</span>
                  </NavLink>
                  <NavLink to="/app/commercial/manpower-training/contact-log" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Contact Log</span>
                  </NavLink>
                  <NavLink to="/app/commercial/manpower-training/fire-tender-management" className={subNavClass}>
                    <Truck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Fire Tender Management</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* R&M */}
            {(can("commercialRm") || can("sales")) && (
            <div>
              <button
                type="button"
                onClick={() => setCommercialRmOpen(!commercialRmOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${
                  pathname.startsWith("/app/commercial/rm-mm-amc-iev") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <Briefcase className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">R&amp;M</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${commercialRmOpen ? "rotate-180" : ""}`}
                />
              </button>

              {commercialRmOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="/app/commercial/rm-mm-amc-iev/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/manpower-management" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Enquiry</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/internal-quotation" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Internal Quotation</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/po-entry" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">PO Entry</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/contact-log" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Contact Log</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/po-at-glance" end className={subNavClass}>
                    <ClipboardList className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="type-meta type-truncate">PO At Glance</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Marketing */}
            {can("marketing") && (
            <div>
              <button
                onClick={() => setMarketingOpen(!marketingOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/marketing") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Marketing</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    marketingOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {marketingOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  {MARKETING_NAV_ITEMS.map((item) => {
                    if (!canSub(item.subModule)) return null;
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        end={Boolean(item.end)}
                        className={subNavClass}
                      >
                        {item.useRupee ? (
                          <RupeeIcon className={`w-4 h-4 ${item.iconClass}`} />
                        ) : Icon ? (
                          <Icon className={`w-4 h-4 shrink-0 ${item.iconClass}`} />
                        ) : null}
                        <span className="type-meta type-truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* Maintenance */}
            {can("maintenance") && (
            <div>
              <button
                onClick={() => setMaintenanceOpen(!maintenanceOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/maintenance") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Wrench className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Maintenance</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    maintenanceOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {maintenanceOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="/app/maintenance" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Maintenance Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/enquiry-master" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Enquiry Master</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/quotation-tracker" className={subNavClass}>
                    <RupeeIcon className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Quotation Tracker</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/follow-up-planner" className={subNavClass}>
                    <Calendar className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Follow-up Planner</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/client-master" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Client Master</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/product-catalog" className={subNavClass}>
                    <Package className="w-4 h-4 shrink-0 text-yellow-600" />
                    <span className="type-meta type-truncate">Product Catalog</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/purchase-orders" className={subNavClass}>
                    <ShoppingCart className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Purchase Orders</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/mm-po-entry" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">PO Entry</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/po-at-glance" end className={subNavClass}>
                    <ClipboardList className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="type-meta type-truncate">PO At Glance</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/expo-seminar" className={subNavClass}>
                    <MapPin className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Expo & Seminar</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/gst-upload" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">GST Documents</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/mail-templates" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Maintenance Mail Template</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/reports-analytics" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Reports & Analytics</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Billing */}
            {can("billing") && (
            <div>
              <button
                onClick={() => setBillingOpen(!billingOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/billing") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <ReceiptIcon className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Billing</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    billingOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {billingOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="/app/billing" end className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Billing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/billing/create-invoice" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Create Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/add-on-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Add-On Invoices</span>
                  </NavLink>
                  <NavLink to="/app/billing/manage-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Manage Invoices</span>
                  </NavLink>
                  <NavLink to="/app/billing/generated-e-invoice" className={subNavClass}>
                    <FileDigit className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Generated E-Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/credit-notes" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Credit/Debit Notes</span>
                  </NavLink>
                  <NavLink to="/app/billing/reports" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Reports</span>
                  </NavLink>
                  <NavLink to="/app/billing/tracking" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Tracking</span>
                  </NavLink>
                  <NavLink to="/app/billing/notifications" className={subNavClass}>
                    <Bell className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Notifications</span>
                  </NavLink>
                  <NavLink to="/app/billing/tracker" className={subNavClass}>
                    <CalendarDays className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Billing Tracker</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Operations */}
            {can("operations") && (
            <div>
              <button
                onClick={() => setOperationsOpen(!operationsOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/fire-tender-vehicle") || pathname.startsWith("/app/operations") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Wrench className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Operations</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    operationsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {operationsOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="fire-tender-vehicle-management" className={subNavClass}>
                    <Car className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Fleet Management</span>
                  </NavLink>

                  <div className="flex items-stretch w-full rounded-md hover:bg-surface transition-colors">
                    <NavLink
                      to="operations"
                      end
                      className={({ isActive }) =>
                        `${subLinkBase} flex-1 min-w-0 rounded-md ${isActive && pathname === "/app/operations" ? activeClass : pathname.startsWith("/app/operations") ? activeClass : "text-sidebar-strong"}`
                      }
                      onClick={() => setManpowerOperationsOpen(true)}
                    >
                      <Users className="w-4 h-4 shrink-0 text-sidebar-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Manpower Operations</span>
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => setManpowerOperationsOpen(!manpowerOperationsOpen)}
                      className="flex items-center px-1.5 rounded-md hover:bg-sidebar-hover shrink-0 self-stretch"
                      aria-expanded={manpowerOperationsOpen}
                      aria-label="Toggle manpower operations menu"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                          manpowerOperationsOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {manpowerOperationsOpen && (
                    <div className="space-y-0.5 ml-2 border-l border-sidebar-border pl-2 max-h-[min(60vh,24rem)] overflow-y-auto">
                      {OPERATIONS_NAV.map((entry) =>
                        entry.section ? (
                          <div key={entry.section}>
                            <p className="px-2.5 pt-2 pb-0.5 type-mono-micro text-sidebar-muted type-truncate">
                              {entry.section}
                            </p>
                            {entry.items.map((item) => {
                              const Icon = item.icon;
                              return (
                                <NavLink
                                  key={item.id}
                                  to={operationsNavHref(item.path)}
                                  end={!item.path}
                                  className={() => subNavClass({ isActive: operationsNavIsActive(item, pathname) })}
                                >
                                  {Icon && <Icon className="w-4 h-4 shrink-0 text-sidebar-accent" />}
                                  <span className="type-meta type-truncate">{item.label}</span>
                                </NavLink>
                              );
                            })}
                          </div>
                        ) : (
                          <NavLink
                            key={entry.id}
                            to={operationsNavHref(entry.path)}
                            end={!entry.path}
                            className={() => subNavClass({ isActive: operationsNavIsActive(entry, pathname) })}
                          >
                            {entry.icon && <entry.icon className="w-4 h-4 shrink-0 text-sidebar-accent" />}
                            <span className="type-meta type-truncate">{entry.label}</span>
                          </NavLink>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Projects */}
            {can("projects") && (
            <div>
              <button
                onClick={() => setProjectsOpen(!projectsOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${
                  pathname.startsWith("/app/projects/dashboard") ||
                  pathname.startsWith("/app/projects/reports") ||
                  pathname.startsWith("/app/projects/po") ||
                  pathname.startsWith("/app/projects/enquiry") ||
                  pathname.startsWith("/app/projects/quotation") ||
                  pathname.startsWith("/app/projects-management") ||
                  pathname.startsWith("/app/projects-billing") ||
                  pathname.startsWith("/app/projects-po-at-glance")
                    ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent"
                    : "text-sidebar-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5">
                  <Activity className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Projects</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    projectsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {projectsOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="projects/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Project Dashboard</span>
                  </NavLink>
                  <NavLink
                    to={enquiryTabs.length ? `projects/enquiry/${enquiryTabs[0]}` : "projects/enquiry"}
                    className={() => subNavClass({ isActive: pathname.startsWith("/app/projects/enquiry") })}
                  >
                    <FileText className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Enquiry Master</span>
                  </NavLink>
                  <NavLink to="projects/quotation" className={subNavClass}>
                    <ClipboardList className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Quotation Master</span>
                  </NavLink>
                  <NavLink to="/app/projects-po-at-glance" end className={subNavClass}>
                    <ClipboardList className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="type-meta type-truncate">PO at Glance</span>
                  </NavLink>
                  <NavLink to="projects/po" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Contract Management</span>
                  </NavLink>
                  <NavLink to="projects-management" className={subNavClass}>
                    <FolderOpen className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Management / Planning</span>
                  </NavLink>
                  <NavLink to="projects/reports" className={subNavClass}>
                    <FileSpreadsheet className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">Project Reports</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Procurement */}
            {can("procurement") && (
            <NavLink to="procurement" className={topNavClass}>
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">Procurement</span>
            </NavLink>
            )}

            {/* AMC Management */}
            {can("amc") && (
            <div>
              <button
                type="button"
                onClick={() => setAmcOpen(!amcOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${
                  pathname.startsWith("/app/amc") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">AMC Management</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${amcOpen ? "rotate-180" : ""}`} />
              </button>
              {amcOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2 max-h-64 overflow-y-auto">
                  <NavLink to="/app/amc" end className={subNavClass}>
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/amc/customers" className={subNavClass}>
                    <span className="type-meta type-truncate">Customers</span>
                  </NavLink>
                  <NavLink to="/app/amc/contracts" className={subNavClass}>
                    <span className="type-meta type-truncate">Contracts</span>
                  </NavLink>
                  <NavLink to="/app/amc/sites" className={subNavClass}>
                    <span className="type-meta type-truncate">Covered Sites</span>
                  </NavLink>
                  <NavLink to="/app/amc/assets" className={subNavClass}>
                    <span className="type-meta type-truncate">Covered Assets</span>
                  </NavLink>
                  <NavLink to="/app/amc/pm-schedule" className={subNavClass}>
                    <span className="type-meta type-truncate">PM Schedule</span>
                  </NavLink>
                  <NavLink to="/app/amc/complaints" className={subNavClass}>
                    <span className="type-meta type-truncate">Complaint Calls</span>
                  </NavLink>
                  <NavLink to="/app/amc/visits" className={subNavClass}>
                    <span className="type-meta type-truncate">Service Visits</span>
                  </NavLink>
                  <NavLink to="/app/amc/technicians" className={subNavClass}>
                    <span className="type-meta type-truncate">Technician Allocation</span>
                  </NavLink>
                  <NavLink to="/app/amc/service-reports" className={subNavClass}>
                    <span className="type-meta type-truncate">Service Reports</span>
                  </NavLink>
                  <NavLink to="/app/amc/alerts" className={subNavClass}>
                    <span className="type-meta type-truncate">Alerts & SLA</span>
                  </NavLink>
                  <NavLink to="/app/amc/reports" className={subNavClass}>
                    <span className="type-meta type-truncate">Reports</span>
                  </NavLink>
                  <NavLink to="/app/amc/settings" className={subNavClass}>
                    <span className="type-meta type-truncate">Settings</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {can("finance") && (
            <div>
              <button
                type="button"
                onClick={() => setFinanceOpen(!financeOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${
                  pathname.startsWith("/app/accounts-finance") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <RupeeIcon className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Finance/Accounts</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${financeOpen ? "rotate-180" : ""}`} />
              </button>
              {financeOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  <NavLink to="/app/accounts-finance/reports/site-ledger" className={subNavClass}>
                    <span className="type-meta type-truncate">P&amp;L</span>
                  </NavLink>
                  <NavLink to="/app/accounts-finance/bank-formats" className={subNavClass}>
                    <span className="type-meta type-truncate">Bank formats</span>
                  </NavLink>
                  {canSub(FINANCE_MASTER_PO_AT_GLANCE_SUBMODULE_KEY) && (
                  <NavLink to="/app/accounts-finance/po-at-glance" className={subNavClass}>
                    <span className="type-meta type-truncate">Master PO At Glance</span>
                  </NavLink>
                  )}
                </div>
              )}
            </div>
            )}

            {can("indusLms") && (
            <NavLink to="indus-lms-trainings" className={topNavClass}>
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">Indus LMS / trainings</span>
            </NavLink>
            )}

            {/* IEV */}
            {can("fireTender") && (
            <div>
              <button
                onClick={() => setFireTenderOpen(!fireTenderOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-sidebar-hover transition-colors duration-theme min-h-[2.35rem] ${pathname.startsWith("/app/fire-tender") || pathname.startsWith("/app/fire-tender-manufacturing") ? "bg-sidebar-active text-sidebar-strong shadow-nav-active border-l-[3px] border-l-sidebar-accent" : "text-sidebar-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">IEV</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    fireTenderOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {fireTenderOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
                  {canOpenPath("/app/fire-tender") && (
                  <NavLink to="fire-tender" end className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">IEV Dashboard</span>
                  </NavLink>
                  )}
                  {ievCostingTabs.length > 0 && (
                  <NavLink
                    to={`fire-tender/costing-hub/${ievCostingTabs[0]}`}
                    className={() => {
                      const p = pathname.replace(/\/$/, "");
                      const active =
                        p !== "/app/fire-tender" &&
                        !p.startsWith("/app/fire-tender/configuration") &&
                        !p.startsWith("/app/fire-tender-manufacturing") &&
                        p.startsWith("/app/fire-tender");
                      return subNavClass({ isActive: active });
                    }}
                  >
                    <Calculator className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">IEV Costing</span>
                  </NavLink>
                  )}
                  {canOpenPath("/app/fire-tender-manufacturing") && (
                  <NavLink to="fire-tender-manufacturing" className={subNavClass}>
                    <Factory className="w-4 h-4 shrink-0 text-sidebar-accent" />
                    <span className="type-meta type-truncate">IEV Manufacturing</span>
                  </NavLink>
                  )}
                </div>
              )}
            </div>
            )}

            {userProfile?.role === ROLES.SUPER_ADMIN && (
            <NavLink to="all-employees" className={topNavClass}>
              <Users className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">All Employees</span>
            </NavLink>
            )}

            {(can("crmOutreach") || can("marketing")) && (
            <NavLink to="crm-outreach" className={topNavClass}>
              <Mail className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">Client/In-House Mail Outreach</span>
            </NavLink>
            )}

            {can("userManagement") && (
            <NavLink to="user-management" className={topNavClass}>
              <Users className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">User Management</span>
            </NavLink>
            )}

            {(userProfile?.role === ROLES.SUPER_ADMIN ||
              userProfile?.role === ROLES.SUPER_ADMIN_PRO ||
              can("itIs")) && (
            <NavLink to="software-subscriptions-reminders" className={topNavClass}>
              <Bell className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">Software subscriptions/reminders</span>
            </NavLink>
            )}

            {(userProfile?.role === ROLES.SUPER_ADMIN ||
              userProfile?.role === ROLES.SUPER_ADMIN_PRO ||
              can("itIs")) && (
            <NavLink to="api-health" className={topNavClass}>
              <Activity className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">API Health</span>
            </NavLink>
            )}

            {can("settings") && (
            <NavLink to="settings" className={topNavClass}>
              <Settings className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">Settings</span>
            </NavLink>
            )}
            </div>
            )}

          </nav>

          {/* Account Info */}
          <div className={`p-3 border-t border-sidebar-border bg-sidebar-elevated/50 ${sidebarCollapsed ? "lg:px-2" : ""}`}>
            {!sidebarCollapsed ? (
              <div className="flex items-center space-x-2 mb-2.5">
                <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 shrink-0 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="type-body-medium text-sidebar-strong type-truncate">
                    {userProfile?.username || user?.email?.split("@")[0] || user?.email}
                  </p>
                  <p className="type-meta text-sidebar-muted type-truncate">{user?.email}</p>
                </div>
              </div>
            ) : (
              <div className="hidden lg:flex justify-center mb-2" title={displayName}>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-white type-mono-caption">
                  {initials}
                </span>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className={`w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-critical/90 text-white rounded-control hover:bg-critical transition-colors duration-theme type-body-medium ${
                sidebarCollapsed ? "lg:px-0" : ""
              }`}
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              {!sidebarCollapsed ? <span>Sign Out</span> : <span className="lg:hidden">Sign Out</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 ${mainOffsetClass} bg-canvas transition-[margin] duration-theme-slow ease-theme`}>
        {/* Compact SaaS app bar — context + actions (not a welcome banner) */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-border/80 backdrop-blur-md" style={{ background: "var(--topbar-bg)" }}>
          <div className="flex items-center justify-between gap-4 px-5 sm:px-8 h-topbar">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-control border border-border bg-surface text-ink-muted hover:bg-surface-sunken shrink-0"
                aria-label="Open menu"
              >
                ☰
              </button>
              <div className="min-w-0">
                <Breadcrumbs
                  className="mb-0.5"
                  items={[
                    { label: workspace.eyebrow, path: "/app/dashboard" },
                    { label: workspace.title },
                  ]}
                />
                <p className="type-body-medium text-ink type-truncate leading-tight">
                  {workspace.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="hidden md:inline-flex items-center gap-2 rounded-control border border-border bg-surface shadow-sm px-2.5 h-9 type-meta text-ink-muted hover:border-accent-border hover:bg-accent-soft/50 hover:text-ink transition-colors duration-theme min-w-[10rem]"
                aria-label="Open command palette"
              >
                <SearchIcon className="w-3.5 h-3.5 text-accent" />
                <span className="flex-1 text-left">Search…</span>
                <kbd className="type-mono-micro border border-border rounded px-1 py-0.5 bg-surface-sunken/80">⌘K</kbd>
              </button>
              {todayLabel ? (
                <p className="hidden xl:block type-code-meta text-ink-muted tabular-nums pr-1">
                  {todayLabel}
                </p>
              ) : null}
              <div className="hidden sm:block h-6 w-px bg-border shrink-0" aria-hidden />
              <PoApprovalBell />
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center justify-center h-9 w-9 rounded-control border border-border bg-surface shadow-sm text-ink-muted hover:border-accent-border hover:bg-accent-soft/50 hover:text-accent transition-colors duration-theme"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              {canSeeActivityLog ? (
                <button
                  type="button"
                  onClick={() => setActivityLogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-control border border-border bg-surface shadow-sm px-2.5 sm:px-3 h-9 type-body-medium text-ink hover:border-accent-border hover:bg-accent-soft/50 transition-[background-color,border-color] duration-theme"
                  aria-label="Open activity log"
                >
                  <Clock className="w-4 h-4 text-ink-muted" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Activity</span>
                </button>
              ) : null}
              <div
                className="hidden sm:flex items-center gap-2 rounded-control border border-border bg-surface shadow-sm pl-1 pr-2.5 h-9 max-w-[11rem]"
                title={user?.email || displayName}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white type-mono-caption tracking-normal normal-case shrink-0">
                  {initials}
                </span>
                <span className="type-meta text-ink type-truncate">{displayName}</span>
              </div>
            </div>
          </div>
        </header>

        <main
          className={
            pathname.startsWith("/app/software-subscriptions-reminders")
              ? "erp-app-shell erp-workspace-glow flex-1 overflow-y-auto px-3 py-4 sm:px-4 sm:py-5"
              : "erp-app-shell erp-workspace-glow flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7"
          }
        >
          <Suspense fallback={<PageLoader delayMs={160} label="Opening…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {pathname.startsWith("/app/projects") && enquiryTabs.includes("enquiry-database") ? (
        <div className="fixed bottom-4 right-4 z-[900] flex w-[340px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex-col gap-3 overflow-y-auto">
          <Suspense fallback={null}>
            <EnquiryCompletedPopup />
            {/* Overdue: only on Enquiry Master Dashboard, once per Projects visit */}
            {pathname.includes("/projects/enquiry/enquiry-dashboard") ? <EnquiryOverduePopup /> : null}
            <EnquiryDueSoonPopup />
          </Suspense>
        </div>
      ) : null}

      {canSeeActivityLog ? (
        <ActivityLogDrawer open={activityLogOpen} onClose={() => setActivityLogOpen(false)} />
      ) : null}

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        destinations={allowedCommands}
        onNavigate={(path) => {
          navigate(path);
          setSidebarOpen(false);
        }}
      />
    </div>
  );
};

export default Layout;
