import React, { useState, useEffect, Suspense } from "react";
import PageLoader from "../components/PageLoader";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuditConsole } from "../contexts/AuditConsoleContext";
import { ROLES, getLandingPathForUser, isPathAllowed, canSeeSubModule } from "../config/roles";
import { canAccessSalaryAdmin } from "../pages/adminOperations/salaryAdmin/salaryAccess";
import { INDUS_LOGO_SRC } from "../constants/branding.js";
import ActivityLogDrawer from "../components/ActivityLogDrawer";
import { SALARY_SUB_NAV, HR_SALARY_BASE, HR_SALARY_DASHBOARD, salaryNavIsActive, salaryNavPath } from "../pages/hr/payroll/salary/salaryNav";
import { OPERATIONS_NAV, operationsNavHref, operationsNavIsActive } from "../pages/operations/navConfig";
import PoApprovalBell from "../components/PoApprovalBell";
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
  PhoneCall,
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

const topLinkBase = "group flex flex-none items-center gap-2.5 px-2.5 py-2 rounded-control hover:bg-surface hover:border-neutral-border transition-[background-color,border-color,box-shadow] duration-theme ease-theme min-h-[2.35rem] border border-transparent";
const subLinkBase = "group flex flex-none items-center gap-2.5 px-2.5 py-1.5 rounded-control hover:bg-surface hover:border-neutral-border transition-[background-color,border-color,box-shadow] duration-theme ease-theme border border-transparent";
const activeClass = "bg-surface text-ink-strong border border-accent-border border-l-[3px] border-l-accent shadow-nav-active";
const sectionOpenClass = "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border";
const topNavClass = ({ isActive }) => `${topLinkBase} ${isActive ? activeClass : "text-ink-strong"}`;
const subNavClass = ({ isActive }) => `${subLinkBase} ${isActive ? activeClass : "text-ink-strong"}`;

/** Compact workspace label for the top app bar (presentation only). */
function resolveWorkspaceContext(pathname) {
  const p = (pathname || "").replace(/\/$/, "") || "/app";
  if (p === "/app" || p.startsWith("/app/dashboard")) {
    return { eyebrow: "Overview", title: "Command centre" };
  }
  const rules = [
    [/\/app\/hr|\/app\/attendance|\/app\/salary|\/app\/people-management/, "People", "HR & workforce"],
    [/\/app\/ifsp-employee-compliance|\/app\/general-compliance/, "Compliance", "Statutory & registers"],
    [/\/app\/admin|\/app\/ifsp-employee|\/app\/store-inventory|\/app\/gate-pass/, "Admin", "Assets & stores"],
    [/\/app\/commercial\/rm-mm-amc-iev/, "Commercial", "R&M / M&M / AMC / IEV"],
    [/\/app\/commercial|\/app\/manpower/, "Commercial", "Manpower & training"],
    [/\/app\/marketing/, "Go-to-market", "Marketing"],
    [/\/app\/maintenance/, "Service", "Maintenance"],
    [/\/app\/billing|\/app\/projects-billing/, "Finance", "Billing"],
    [/\/app\/operations|\/app\/fire-tender-vehicle/, "Operations", "Sites & fleet"],
    [/\/app\/projects|\/app\/fire-tender/, "Projects", "Delivery & costing"],
    [/\/app\/procurement/, "Procurement", "Vendors & POs"],
    [/\/app\/finance|\/app\/accounts/, "Finance", "Accounts"],
    [/\/app\/settings|\/app\/user-management/, "System", "Settings"],
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
  const can = (moduleKey) => Boolean(navVisibleModules?.has(moduleKey));
  const canSub = (subModuleKey) =>
    canSeeSubModule(userProfile, accessibleModules, subModuleKey, {
      ...(user?.user_metadata || {}),
      email: userProfile?.email || user?.email,
    });
  const hasFullAdmin = Boolean(accessibleModules?.has("admin"));
  const { isConsoleVisible } = useAuditConsole();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
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
      email: userProfile?.email || user?.email || "",
    });
    if (!allowed && pathname === "/app/dashboard") {
      const landing = getLandingPathForUser(userProfile, accessibleModules);
      navigate(landing, { replace: true });
      setIsAccessDenied(false);
      return;
    }
    setIsAccessDenied(!allowed);
  }, [pathname, accessibleModules, subModulePaths, navigate, userProfile, user?.email]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [hrAdminOpen, setHrAdminOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
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
  const [adminEmployeeOpen, setAdminEmployeeOpen] = useState(false);
  const [adminStoreOpen, setAdminStoreOpen] = useState(false);
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const [adminMiscOpen, setAdminMiscOpen] = useState(false);
  const [adminSalaryOpen, setAdminSalaryOpen] = useState(false);
  const [hrSalaryOpen, setHrSalaryOpen] = useState(false);
  const [manpowerOperationsOpen, setManpowerOperationsOpen] = useState(false);
  const [manpowerConfigOpen, setManpowerConfigOpen] = useState(false);

  // Auto-expand Admin when user has partial sub-module access only
  useEffect(() => {
    if (!userProfile?.allowed_sub_modules?.length) return;
    const partialAdmin = userProfile.allowed_sub_modules.some((k) => String(k).startsWith("admin."));
    if (partialAdmin && can("admin")) {
      setAdminOpen(true);
      if (canSub("admin.salary-admin") && !hasFullAdmin) setAdminSalaryOpen(true);
    }
  }, [userProfile?.allowed_sub_modules, accessibleModules, navVisibleModules]);

  // Keep expandable section open when current path is under that section
  useEffect(() => {
    if (pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/salary") || pathname.startsWith("/app/people-management") || pathname.startsWith("/app/hr/payroll/salary")) setHrAdminOpen(true);
    if (pathname.startsWith("/app/hr/payroll/salary")) setHrSalaryOpen(true);
    if (pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance")) setComplianceOpen(true);
    if (pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") || pathname.startsWith("/app/admin")) setAdminOpen(true);
    if (pathname.startsWith("/app/admin/salary-admin")) setAdminSalaryOpen(true);
    if (pathname.startsWith("/app/marketing")) setMarketingOpen(true);
    if (pathname.startsWith("/app/maintenance")) setMaintenanceOpen(true);
    if (pathname.startsWith("/app/manpower") || pathname.startsWith("/app/commercial/manpower-training")) setCommercialMtOpen(true);
    if (pathname.startsWith("/app/commercial/rm-mm-amc-iev")) setCommercialRmOpen(true);
    if (pathname.startsWith("/app/manpower/configuration")) setManpowerConfigOpen(true);
    if (pathname.startsWith("/app/billing")) setBillingOpen(true);
    if (pathname.startsWith("/app/fire-tender-vehicle") || pathname.startsWith("/app/operations")) setOperationsOpen(true);
    if (pathname.startsWith("/app/operations")) setManpowerOperationsOpen(true);
    if (
      pathname.startsWith("/app/projects/po") ||
      pathname.startsWith("/app/projects/enquiry") ||
      pathname.startsWith("/app/projects/quotation") ||
      pathname.startsWith("/app/projects-management") ||
      pathname.startsWith("/app/projects-billing")
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
    setAdminEmployeeOpen(false);
    setAdminStoreOpen(false);
    setAdminGateOpen(false);
    setAdminMiscOpen(false);
    setAdminSalaryOpen(false);
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

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed inset-y-0 left-0 z-50 w-64 bg-canvas border-r border-border-strong transition-transform duration-theme ease-theme`}
      >
        <div className="flex flex-col h-full">
          {/* Logo + Close */}
          <div className="flex items-center justify-between px-3 py-3.5 border-b border-border gap-2 bg-canvas">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img src={INDUS_LOGO_SRC} alt="" className="h-9 w-9 object-contain shrink-0 rounded-full bg-accent-deep" width={36} height={36} />
              <h1 className="type-card-title text-ink type-truncate">INDUS OS</h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-control hover:bg-surface text-ink-muted"
            >
              ×
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {can("overview") && (
              <NavLink to="/app/dashboard" className={topNavClass}>
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span className="type-body-medium type-truncate">Dashboard</span>
              </NavLink>
            )}

            {/* HR */}
            {can("hr") && (
            <div>
              <button
                onClick={() => setHrAdminOpen(!hrAdminOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/salary") || pathname.startsWith("/app/people-management") || pathname.startsWith("/app/hr/payroll/salary") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="hr/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
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
                    <User className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">HR Management</span>
                  </NavLink>
                  <NavLink
                    to="hr/calling-master"
                    className={() =>
                      subNavClass({
                        isActive: pathname.startsWith("/app/hr/calling-master"),
                      })
                    }
                  >
                    <PhoneCall className="w-4 h-4 shrink-0 text-sky-600" />
                    <span className="type-meta type-truncate">Recruitment</span>
                  </NavLink>
                  <NavLink to="attendance" className={subNavClass}>
                    <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="type-meta type-truncate">Attendance</span>
                  </NavLink>
                  <div className="flex items-stretch w-full rounded-md hover:bg-surface transition-colors">
                    <NavLink
                      to={salaryNavPath(HR_SALARY_DASHBOARD)}
                      className={() => {
                        const path = pathname.replace(/\/$/, "");
                        const active =
                          path === `/app/${HR_SALARY_BASE}/${HR_SALARY_DASHBOARD}` ||
                          path === `/app/${HR_SALARY_BASE}`;
                        return `${subLinkBase} flex-1 min-w-0 rounded-md ${active ? activeClass : "text-ink-strong"}`;
                      }}
                      onClick={() => setHrSalaryOpen(true)}
                    >
                      <Wallet className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span className="text-xs font-medium text-left leading-tight">Salary Management</span>
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => setHrSalaryOpen(!hrSalaryOpen)}
                      className="flex items-center px-1.5 rounded-md hover:bg-surface-sunken shrink-0 self-stretch"
                      aria-expanded={hrSalaryOpen}
                      aria-label="Toggle salary management menu"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${hrSalaryOpen ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {hrSalaryOpen && (
                    <div className="space-y-0.5 ml-2 border-l border-border pl-2">
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
                  <NavLink
                    to="hr/site-iom"
                    className={() =>
                      subNavClass({
                        isActive: pathname.startsWith("/app/hr/site-iom"),
                      })
                    }
                  >
                    <FileText className="w-4 h-4 shrink-0 text-violet-600" />
                    <span className="type-meta type-truncate">Site Employee IOM</span>
                  </NavLink>
                  <NavLink to="people-management" className={subNavClass}>
                    <UserPlus className="w-4 h-4 shrink-0 text-pink-600" />
                    <span className="type-meta type-truncate">People Management</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Compliance */}
            {can("compliance") && (
            <div>
              <button
                onClick={() => setComplianceOpen(!complianceOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="ifsp-employee-compliance" className={subNavClass}>
                    <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="type-meta type-truncate">IFSPL Employee Compliance</span>
                  </NavLink>
                  <NavLink to="general-compliance" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">General Compliance</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Admin */}
            {(can("admin") || canAccessSalaryAdmin(userProfile, user)) && (
            <div>
              <button
                onClick={() => {
                  if (!adminOpen) collapseAdminSubmodules();
                  setAdminOpen(!adminOpen);
                }}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") || pathname.startsWith("/app/admin") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Cog className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Admin</span>
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
                    <LayoutDashboard className="h-4 w-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  )}

                  {canSub("admin.employee") && (
                  <>
                  <button
                    onClick={() => setAdminEmployeeOpen(!adminEmployeeOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-surface text-ink-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Users className="w-4 h-4 shrink-0 text-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Employee Administration</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminEmployeeOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminEmployeeOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/employee/master" className={subNavClass}>
                        <Users className="h-4 w-4 shrink-0 text-accent" />
                        <span className="type-meta type-truncate">Employee Master</span>
                      </NavLink>
                      <NavLink to="admin/employee/onboarding" className={subNavClass}>
                        <UserPlus className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span className="type-meta type-truncate">Onboarding</span>
                      </NavLink>
                      <NavLink to="admin/employee/attendance-inputs" className={subNavClass}>
                        <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                        <span className="type-meta type-truncate">Raw Attendance Data</span>
                      </NavLink>
                      <NavLink to="admin/employee/attendance-daily" className={subNavClass}>
                        <Calendar className="h-4 w-4 shrink-0 text-teal-600" />
                        <span className="type-meta type-truncate">Daily Attendance Register</span>
                      </NavLink>
                      <NavLink to="admin/employee/national-holidays" className={subNavClass}>
                        <CalendarDays className="h-4 w-4 shrink-0 text-orange-600" />
                        <span className="type-meta type-truncate">National / Public Holidays</span>
                      </NavLink>
                      <NavLink to="admin/employee/attendance-sheets" className={subNavClass}>
                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="type-meta type-truncate">Attendance Sheets</span>
                      </NavLink>
                      <NavLink to="admin/employee/leaves-permissions" className={subNavClass}>
                        <Calendar className="h-4 w-4 shrink-0 text-purple-600" />
                        <span className="type-meta type-truncate">Leave Approvals</span>
                      </NavLink>
                      <NavLink to="admin/employee/tour-approvals" className={subNavClass}>
                        <MapPin className="h-4 w-4 shrink-0 text-teal-600" />
                        <span className="type-meta type-truncate">Tour Approvals</span>
                      </NavLink>
                      <NavLink to="admin/employee/leave-management" className={subNavClass}>
                        <CalendarDays className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span className="type-meta type-truncate">Leave Management</span>
                      </NavLink>
                      <NavLink to="admin/employee/compliance-documents" className={subNavClass}>
                        <ClipboardCheck className="h-4 w-4 shrink-0 text-green-600" />
                        <span className="type-meta type-truncate">Compliance & Documents</span>
                      </NavLink>
                      <NavLink to="admin/employee/salary-inputs" className={subNavClass}>
                        <RupeeIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="type-meta type-truncate">Salary Inputs</span>
                      </NavLink>
                      <NavLink to="admin/employee/exit-ff" className={subNavClass}>
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                        <span className="type-meta type-truncate">Exit & F&F</span>
                      </NavLink>
                      <NavLink to="admin/employee/inactive" className={subNavClass}>
                        <UserX className="h-4 w-4 shrink-0 text-ink-muted" />
                        <span className="type-meta type-truncate">Inactive Employees</span>
                      </NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {canSub("admin.salary-admin") && (
                  <>
                  <button
                    type="button"
                    onClick={() => setAdminSalaryOpen(!adminSalaryOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-surface text-ink-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Wallet className="w-4 h-4 shrink-0 text-emerald-700" />
                      <span className="text-xs font-medium text-left leading-tight">Salary Admin</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminSalaryOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminSalaryOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/salary-admin/dashboard" className={subNavClass}>
                        <LayoutDashboard className="h-4 w-4 shrink-0 text-emerald-700" />
                        <span className="type-meta type-truncate">Dashboard</span>
                      </NavLink>
                      <NavLink to="admin/salary-admin/salary-master" className={subNavClass}>
                        <RupeeIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="type-meta type-truncate">Salary Master</span>
                      </NavLink>
                      <NavLink to="admin/salary-admin/salary-processing" className={subNavClass}>
                        <Calculator className="h-4 w-4 shrink-0 text-teal-600" />
                        <span className="type-meta type-truncate">Salary Processing</span>
                      </NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {canSub("admin.store") && (
                  <>
                  <button
                    type="button"
                    onClick={() => setAdminStoreOpen(!adminStoreOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-surface text-ink-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Package className="w-4 h-4 shrink-0 text-orange-600" />
                      <span className="text-xs font-medium text-left leading-tight">Store & Issue Control</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminStoreOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminStoreOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/store/item-master" className={subNavClass}><Package className="w-4 h-4 shrink-0 text-orange-600" /><span className="type-meta type-truncate">Item Master</span></NavLink>
                      <NavLink to="admin/store/store-master" className={subNavClass}><Home className="w-4 h-4 shrink-0 text-ink-muted" /><span className="type-meta type-truncate">Store Master</span></NavLink>
                      <NavLink to="admin/store/site-stock" className={subNavClass}><MapPin className="w-4 h-4 shrink-0 text-accent" /><span className="type-meta type-truncate">Site Stock</span></NavLink>
                      <NavLink to="admin/store/issue-entry" className={subNavClass}><FileText className="w-4 h-4 shrink-0 text-indigo-600" /><span className="type-meta type-truncate">Issue Entry</span></NavLink>
                      <NavLink to="admin/store/return-entry" className={subNavClass}><Receipt className="w-4 h-4 shrink-0 text-emerald-600" /><span className="type-meta type-truncate">Return Entry</span></NavLink>
                      <NavLink to="admin/store/transfer-transit" className={subNavClass}><Truck className="w-4 h-4 shrink-0 text-amber-600" /><span className="type-meta type-truncate">Transfer / Transit</span></NavLink>
                      <NavLink to="admin/store/requirement-planner" className={subNavClass}><Calculator className="w-4 h-4 shrink-0 text-purple-600" /><span className="type-meta type-truncate">Requirement Planner</span></NavLink>
                      <NavLink to="admin/store/reconciliation" className={subNavClass}><CheckCircle className="w-4 h-4 shrink-0 text-teal-600" /><span className="type-meta type-truncate">Reconciliation</span></NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {canSub("admin.gate") && (
                  <>
                  <button
                    onClick={() => setAdminGateOpen(!adminGateOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-surface text-ink-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Shield className="w-4 h-4 shrink-0 text-teal-600" />
                      <span className="text-xs font-medium text-left leading-tight">Gate Pass & Movement Control</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminGateOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminGateOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/gate/employee-movement" className={subNavClass}><Users className="w-4 h-4 shrink-0 text-accent" /><span className="type-meta type-truncate">Employee Movement</span></NavLink>
                      <NavLink to="admin/gate/goods-in-out" className={subNavClass}><Package className="w-4 h-4 shrink-0 text-orange-600" /><span className="type-meta type-truncate">Goods In / Out</span></NavLink>
                      <NavLink to="admin/gate/visitor-guest-passes" className={subNavClass}><User className="w-4 h-4 shrink-0 text-indigo-600" /><span className="type-meta type-truncate">Visitor / Guest Passes</span></NavLink>
                      <NavLink to="admin/gate/vehicle-passes" className={subNavClass}><Car className="w-4 h-4 shrink-0 text-ink-strong" /><span className="type-meta type-truncate">Vehicle Passes</span></NavLink>
                      <NavLink to="admin/gate/delivery-courier-post" className={subNavClass}><Truck className="w-4 h-4 shrink-0 text-amber-600" /><span className="type-meta type-truncate">Delivery / Courier / Post</span></NavLink>
                      <NavLink to="admin/gate/security-console" className={subNavClass}><Shield className="w-4 h-4 shrink-0 text-teal-600" /><span className="type-meta type-truncate">Security Console</span></NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {canSub("admin.misc") && (
                  <>
                  <button
                    onClick={() => setAdminMiscOpen(!adminMiscOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-surface text-ink-strong transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Briefcase className="w-4 h-4 shrink-0 text-fuchsia-600" />
                      <span className="text-xs font-medium text-left leading-tight">Miscellaneous Admin</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminMiscOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminMiscOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/misc/events-coordination" className={subNavClass}><Calendar className="w-4 h-4 shrink-0 text-purple-600" /><span className="type-meta type-truncate">Events Coordination</span></NavLink>
                      <NavLink to="admin/misc/tour-travel-details" className={subNavClass}><MapPin className="w-4 h-4 shrink-0 text-accent" /><span className="type-meta type-truncate">Tour / Travel Details</span></NavLink>
                      <NavLink to="admin/misc/admin-tasks-other-requests" className={subNavClass}><ClipboardCheck className="w-4 h-4 shrink-0 text-sky-600" /><span className="type-meta type-truncate">Admin Tasks / Other Requests</span></NavLink>
                    </div>
                  )}
                  </>
                  )}

                  {canSub("admin.alerts") && (
                  <NavLink to="admin/alerts-notifications" className={subNavClass}>
                    <Bell className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="type-meta type-truncate">Alerts & Notifications</span>
                  </NavLink>
                  )}
                  {canSub("admin.reports") && (
                  <NavLink to="admin/reports-analytics" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Reports & Analytics</span>
                  </NavLink>
                  )}
                  {canSub("admin.settings") && (
                  <NavLink to="admin/settings-masters" className={subNavClass}>
                    <Settings className="w-4 h-4 shrink-0 text-ink-strong" />
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${
                  pathname.startsWith("/app/commercial/manpower-training")
                    ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border"
                    : "text-ink-strong"
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="/app/commercial/manpower-training/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/manpower" end className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Manpower Management Enquiry</span>
                  </NavLink>
                  <NavLink to="/app/manpower/internal-quotation" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-green-700" />
                    <span className="type-meta type-truncate">Internal Quotation</span>
                  </NavLink>
                  <NavLink to="/app/manpower/quotation" className={subNavClass}>
                    <ReceiptIcon className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="type-meta type-truncate">Quotation</span>
                  </NavLink>

                  <button
                    type="button"
                    onClick={() => setManpowerConfigOpen((v) => !v)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-surface text-ink-strong transition-colors"
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
                        <Users className="w-4 h-4 shrink-0 text-accent" />
                        <span className="type-meta type-truncate">Roles</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/price-master" className={subNavClass}>
                        <RupeeIcon className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="type-meta type-truncate">Price Master</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/mail-template" className={subNavClass}>
                        <FileText className="w-4 h-4 shrink-0 text-indigo-600" />
                        <span className="type-meta type-truncate">Mail Template</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/employee-type" className={subNavClass}>
                        <UserCheck className="w-4 h-4 shrink-0 text-amber-700" />
                        <span className="type-meta type-truncate">Employee Type</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/departments" className={subNavClass}>
                        <FolderOpen className="w-4 h-4 shrink-0 text-ink-strong" />
                        <span className="type-meta type-truncate">Departments</span>
                      </NavLink>
                    </div>
                  )}
                  <NavLink to="/app/commercial/manpower-training/po-entry" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">PO Entry</span>
                  </NavLink>
                  <NavLink to="/app/commercial/manpower-training/contact-log" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Contact Log</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Commercial — R&M / M&M / AMC / IEV */}
            {(can("commercialRm") || can("sales")) && (
            <div>
              <button
                type="button"
                onClick={() => setCommercialRmOpen(!commercialRmOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${
                  pathname.startsWith("/app/commercial/rm-mm-amc-iev") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <Briefcase className="w-4 h-4 shrink-0" />
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block text-sm font-medium">Commercial</span>
                    <span className="block text-xs">R&amp;M / M&amp;M / AMC / IEV</span>
                  </span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${commercialRmOpen ? "rotate-180" : ""}`}
                />
              </button>

              {commercialRmOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="/app/commercial/rm-mm-amc-iev/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="type-meta type-truncate">Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/manpower-management" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Enquiry (R&amp;M / AMC / IEV)</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/internal-quotation" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="type-meta type-truncate">Internal Quotation</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/po-entry" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">PO Entry</span>
                  </NavLink>
                  <NavLink to="/app/commercial/rm-mm-amc-iev/contact-log" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Contact Log</span>
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/marketing") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="/app/marketing" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="type-meta type-truncate">Marketing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/marketing/enquiry-master" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Enquiry Master</span>
                  </NavLink>
                  <NavLink to="/app/marketing/quotation-tracker" className={subNavClass}>
                    <RupeeIcon className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="type-meta type-truncate">Quotation Tracker</span>
                  </NavLink>
                  <NavLink to="/app/marketing/follow-up-planner" className={subNavClass}>
                    <Calendar className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="type-meta type-truncate">Follow-up Planner</span>
                  </NavLink>
                  <NavLink to="/app/marketing/client-master" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Client Master</span>
                  </NavLink>
                  <NavLink to="/app/marketing/product-catalog" className={subNavClass}>
                    <Package className="w-4 h-4 shrink-0 text-yellow-600" />
                    <span className="type-meta type-truncate">Product Catalog</span>
                  </NavLink>
                  <NavLink to="/app/marketing/purchase-orders" className={subNavClass}>
                    <ShoppingCart className="w-4 h-4 shrink-0 text-pink-600" />
                    <span className="type-meta type-truncate">Purchase Orders</span>
                  </NavLink>
                  <NavLink to="/app/marketing/expo-seminar" className={subNavClass}>
                    <MapPin className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Expo & Seminar</span>
                  </NavLink>
                  <NavLink to="/app/marketing/gst-upload" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="type-meta type-truncate">GST Documents</span>
                  </NavLink>
                  <NavLink to="/app/marketing/mail-templates" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Marketing Mail Template</span>
                  </NavLink>
                  <NavLink to="/app/marketing/reports-analytics" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Reports & Analytics</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Maintenance */}
            {can("maintenance") && (
            <div>
              <button
                onClick={() => setMaintenanceOpen(!maintenanceOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/maintenance") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="/app/maintenance" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="type-meta type-truncate">Maintenance Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/enquiry-master" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Enquiry Master</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/quotation-tracker" className={subNavClass}>
                    <RupeeIcon className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="type-meta type-truncate">Quotation Tracker</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/follow-up-planner" className={subNavClass}>
                    <Calendar className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="type-meta type-truncate">Follow-up Planner</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/client-master" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Client Master</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/product-catalog" className={subNavClass}>
                    <Package className="w-4 h-4 shrink-0 text-yellow-600" />
                    <span className="type-meta type-truncate">Product Catalog</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/purchase-orders" className={subNavClass}>
                    <ShoppingCart className="w-4 h-4 shrink-0 text-pink-600" />
                    <span className="type-meta type-truncate">Purchase Orders</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/expo-seminar" className={subNavClass}>
                    <MapPin className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Expo & Seminar</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/gst-upload" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="type-meta type-truncate">GST Documents</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/mail-templates" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Maintenance Mail Template</span>
                  </NavLink>
                  <NavLink to="/app/maintenance/reports-analytics" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-accent" />
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/billing") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="/app/billing" end className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="type-meta type-truncate">Billing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/billing/create-invoice" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span className="type-meta type-truncate">Create Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/add-on-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-violet-600" />
                    <span className="type-meta type-truncate">Add-On Invoices</span>
                  </NavLink>
                  <NavLink to="/app/billing/manage-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Manage Invoices</span>
                  </NavLink>
                  <NavLink to="/app/billing/generated-e-invoice" className={subNavClass}>
                    <FileDigit className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="type-meta type-truncate">Generated E-Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/credit-notes" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="type-meta type-truncate">Credit/Debit Notes</span>
                  </NavLink>
                  <NavLink to="/app/billing/reports" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Reports</span>
                  </NavLink>
                  <NavLink to="/app/billing/tracking" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="type-meta type-truncate">Tracking</span>
                  </NavLink>
                  <NavLink to="/app/billing/notifications" className={subNavClass}>
                    <Bell className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="type-meta type-truncate">Notifications</span>
                  </NavLink>
                  {/* After manage workflow: list of IRN-generated invoices */}
                 
                </div>
              )}
            </div>
            )}

            {/* Operations */}
            {can("operations") && (
            <div>
              <button
                onClick={() => setOperationsOpen(!operationsOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/fire-tender-vehicle") || pathname.startsWith("/app/operations") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="fire-tender-vehicle-management" className={subNavClass}>
                    <Car className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="type-meta type-truncate">Fleet Management</span>
                  </NavLink>

                  <div className="flex items-stretch w-full rounded-md hover:bg-surface transition-colors">
                    <NavLink
                      to="operations"
                      end
                      className={({ isActive }) =>
                        `${subLinkBase} flex-1 min-w-0 rounded-md ${isActive && pathname === "/app/operations" ? activeClass : pathname.startsWith("/app/operations") ? activeClass : "text-ink-strong"}`
                      }
                      onClick={() => setManpowerOperationsOpen(true)}
                    >
                      <Users className="w-4 h-4 shrink-0 text-accent" />
                      <span className="text-xs font-medium text-left leading-tight">Manpower Operations</span>
                    </NavLink>
                    <button
                      type="button"
                      onClick={() => setManpowerOperationsOpen(!manpowerOperationsOpen)}
                      className="flex items-center px-1.5 rounded-md hover:bg-surface-sunken shrink-0 self-stretch"
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
                    <div className="space-y-0.5 ml-2 border-l border-border pl-2 max-h-[min(60vh,24rem)] overflow-y-auto">
                      {OPERATIONS_NAV.map((entry) =>
                        entry.section ? (
                          <div key={entry.section}>
                            <p className="px-2.5 pt-2 pb-0.5 type-mono-micro text-gray-400 type-truncate">
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
                                  {Icon && <Icon className="w-4 h-4 shrink-0 text-accent" />}
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
                            {entry.icon && <entry.icon className="w-4 h-4 shrink-0 text-accent" />}
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${
                  pathname.startsWith("/app/projects/po") ||
                  pathname.startsWith("/app/projects/enquiry") ||
                  pathname.startsWith("/app/projects/quotation") ||
                  pathname.startsWith("/app/projects-management") ||
                  pathname.startsWith("/app/projects-billing")
                    ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border"
                    : "text-ink-strong"
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
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="projects-management" className={subNavClass}>
                    <FolderOpen className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="type-meta type-truncate">Projects Management</span>
                  </NavLink>
                  <NavLink to="projects-billing" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="type-meta type-truncate">Projects Billing</span>
                  </NavLink>
                  <NavLink to="projects/enquiry" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="type-meta type-truncate">Enquiry Master</span>
                  </NavLink>
                  <NavLink to="projects/quotation" className={subNavClass}>
                    <ClipboardList className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="type-meta type-truncate">Quotation Master</span>
                  </NavLink>
                  <NavLink to="projects/po" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="type-meta type-truncate">PO / WO Entry</span>
                  </NavLink>
                  <NavLink to="projects/po/contact-log" className={subNavClass}>
                    <History className="w-4 h-4 shrink-0 text-ink-muted" />
                    <span className="type-meta type-truncate">PO Contact Log</span>
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${
                  pathname.startsWith("/app/amc") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">AMC Management</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${amcOpen ? "rotate-180" : ""}`} />
              </button>
              {amcOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2 max-h-64 overflow-y-auto">
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${
                  pathname.startsWith("/app/accounts-finance") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"
                }`}
              >
                <span className="flex items-center space-x-2.5 min-w-0">
                  <RupeeIcon className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Finance/Accounts</span>
                </span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${financeOpen ? "rotate-180" : ""}`} />
              </button>
              {financeOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="/app/accounts-finance/reports/site-ledger" className={subNavClass}>
                    <span className="type-meta type-truncate">P&amp;L</span>
                  </NavLink>
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

            {/* Fire Tender */}
            {can("fireTender") && (
            <div>
              <button
                onClick={() => setFireTenderOpen(!fireTenderOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-surface transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/fire-tender") || pathname.startsWith("/app/fire-tender-manufacturing") ? "bg-accent-soft text-ink-strong shadow-nav-active border border-accent-border" : "text-ink-strong"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span className="type-body-medium type-truncate">Fire Tender</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    fireTenderOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {fireTenderOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
                  <NavLink to="fire-tender" end className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Fire Tender Dashboard</span>
                  </NavLink>
                  <NavLink
                    to="fire-tender/costing-hub/tender"
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
                    <Calculator className="w-4 h-4 shrink-0 text-accent" />
                    <span className="type-meta type-truncate">Fire Tender Costing</span>
                  </NavLink>
                  <NavLink to="fire-tender-manufacturing" className={subNavClass}>
                    <Factory className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="type-meta type-truncate">Fire Tender Manufacturing</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {can("userManagement") && (
            <NavLink to="user-management" className={topNavClass}>
              <Users className="w-4 h-4 shrink-0" />
              <span className="type-body-medium type-truncate">User Management</span>
            </NavLink>
            )}

            {(userProfile?.role === ROLES.SUPER_ADMIN || userProfile?.role === ROLES.SUPER_ADMIN_PRO) && (
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

          </nav>

          {/* Account Info */}
          <div className="p-3 border-t border-border bg-canvas">
            <div className="flex items-center space-x-2 mb-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-rose-700 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 shrink-0 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="type-body-medium text-ink type-truncate">
                  {userProfile?.username || user?.email?.split("@")[0] || user?.email}
                </p>
                <p className="type-meta text-gray-500 type-truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors type-body-medium shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 bg-canvas">
        {/* Compact SaaS app bar — context + actions (not a welcome banner) */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-canvas/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-5 sm:px-8 h-14">
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
                <p className="type-mono-micro text-ink-muted type-truncate">{workspace.eyebrow}</p>
                <p className="type-body-medium text-ink type-truncate leading-tight mt-0.5">
                  {workspace.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {todayLabel ? (
                <p className="hidden md:block type-code-meta text-ink-muted tabular-nums pr-1">
                  {todayLabel}
                </p>
              ) : null}
              <div className="hidden sm:block h-6 w-px bg-border shrink-0" aria-hidden />
              <PoApprovalBell />
              {canSeeActivityLog ? (
                <button
                  type="button"
                  onClick={() => setActivityLogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 sm:px-3 h-9 type-body-medium text-ink-strong hover:bg-surface-sunken transition-[background-color,border-color] duration-theme"
                  aria-label="Open activity log"
                >
                  <Clock className="w-4 h-4 text-ink-muted" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Activity</span>
                </button>
              ) : null}
              <div
                className="hidden sm:flex items-center gap-2 rounded-control border border-border bg-surface pl-1 pr-2.5 h-9 max-w-[11rem]"
                title={user?.email || displayName}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-deep text-surface-raised type-mono-caption tracking-normal normal-case shrink-0">
                  {initials}
                </span>
                <span className="type-meta text-ink type-truncate">{displayName}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="erp-app-shell flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-7">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {canSeeActivityLog ? (
        <ActivityLogDrawer open={activityLogOpen} onClose={() => setActivityLogOpen(false)} />
      ) : null}
    </div>
  );
};

export default Layout;
