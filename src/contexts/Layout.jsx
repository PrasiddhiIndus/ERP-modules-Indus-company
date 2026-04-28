import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuditConsole } from "../contexts/AuditConsoleContext";
import { isPathAllowed } from "../config/roles";
import { INDUS_LOGO_SRC } from "../constants/branding.js";
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
} from "lucide-react";

// Rupee Icon Component – same visual size as w-4 h-4 lucide icons
const RupeeIcon = ({ className = '' }) => {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-base font-bold leading-none ${className}`}
      style={{ fontFamily: 'Arial, sans-serif' }}
    >
      ₹
    </span>
  );
};

const topLinkBase = "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem]";
const subLinkBase = "group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors";
const activeClass = "bg-red-50 text-red-800 border-l-2 border-red-600 shadow-sm";
const topNavClass = ({ isActive }) => `${topLinkBase} ${isActive ? activeClass : "text-gray-700"}`;
const subNavClass = ({ isActive }) => `${subLinkBase} ${isActive ? activeClass : "text-gray-700"}`;

const Layout = () => {
  const { user, signOut, accessibleModules, userProfile } = useAuth();
  const can = (moduleKey) => !accessibleModules?.size || accessibleModules.has(moduleKey);
  const { isConsoleVisible } = useAuditConsole();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Route guard: redirect to dashboard if current path is not allowed for this role
  useEffect(() => {
    if (!pathname.startsWith("/app")) return;
    if (accessibleModules?.size && !isPathAllowed(pathname, accessibleModules)) {
      navigate("/app/dashboard", { replace: true });
    }
  }, [pathname, accessibleModules, navigate]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [hrAdminOpen, setHrAdminOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [fireTenderOpen, setFireTenderOpen] = useState(false);
  const [amcOpen, setAmcOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(false);
  const [adminEmployeeOpen, setAdminEmployeeOpen] = useState(true);
  const [adminStoreOpen, setAdminStoreOpen] = useState(true);
  const [adminGateOpen, setAdminGateOpen] = useState(true);
  const [adminMiscOpen, setAdminMiscOpen] = useState(true);
  const [manpowerConfigOpen, setManpowerConfigOpen] = useState(false);

  // Keep expandable section open when current path is under that section
  useEffect(() => {
    if (pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/payroll") || pathname.startsWith("/app/people-management")) setHrAdminOpen(true);
    if (pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance")) setComplianceOpen(true);
    if (pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") || pathname.startsWith("/app/admin")) setAdminOpen(true);
    if (pathname.startsWith("/app/manpower")) setSalesOpen(true);
    if (pathname.startsWith("/app/marketing")) setMarketingOpen(true);
    if (pathname.startsWith("/app/manpower") || pathname.startsWith("/app/commercial")) setSalesOpen(true);
    if (pathname.startsWith("/app/manpower/configuration")) setManpowerConfigOpen(true);
    if (pathname.startsWith("/app/billing")) setBillingOpen(true);
    if (pathname.startsWith("/app/fire-tender-vehicle") || pathname.startsWith("/app/operations")) setOperationsOpen(true);
    if (pathname.startsWith("/app/projects")) setProjectsOpen(true);
    if (pathname.startsWith("/app/fire-tender") || pathname.startsWith("/app/fire-tender-manufacturing")) setFireTenderOpen(true);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl border-r border-slate-200/80 transition-transform duration-300 ease-in-out`}
      >
        <div className="flex flex-col h-full">
          {/* Logo + Close */}
          <div className="flex items-center justify-between px-3 py-3.5 border-b border-slate-200/90 gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img src={INDUS_LOGO_SRC} alt="" className="h-9 w-9 object-contain shrink-0" width={36} height={36} />
              <h1 className="text-lg font-bold text-gray-900 truncate">INDUS OS</h1>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md hover:bg-gray-100"
            >
              ×
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {can("overview") && (
              <NavLink to="/app/dashboard" className={topNavClass}>
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span className="text-sm font-medium">Dashboard</span>
              </NavLink>
            )}

            {/* HR */}
            {can("hr") && (
            <div>
              <button
                onClick={() => setHrAdminOpen(!hrAdminOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/payroll") || pathname.startsWith("/app/people-management") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">HR</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    hrAdminOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {hrAdminOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="hr" className={subNavClass}>
                    <User className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">HR Management</span>
                  </NavLink>
                  <NavLink to="attendance" className={subNavClass}>
                    <Clock className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="text-xs">Attendance</span>
                  </NavLink>
                  <NavLink to="payroll" className={subNavClass}>
                    <CreditCard className="w-4 h-4 shrink-0 text-yellow-600" />
                    <span className="text-xs">Payroll</span>
                  </NavLink>
                  <NavLink to="people-management" className={subNavClass}>
                    <UserPlus className="w-4 h-4 shrink-0 text-pink-600" />
                    <span className="text-xs">People Management</span>
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Compliance</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    complianceOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {complianceOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="ifsp-employee-compliance" className={subNavClass}>
                    <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">IFSPL Employee Compliance</span>
                  </NavLink>
                  <NavLink to="general-compliance" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">General Compliance</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Admin */}
            {can("admin") && (
            <div>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") || pathname.startsWith("/app/admin") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Cog className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Admin</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    adminOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {adminOpen && (
                <div className="ml-6 mt-0.5 space-y-1">
                  <NavLink to="admin/dashboard" className={subNavClass}>
                    <LayoutDashboard className="h-4 w-4 shrink-0 text-[#1F3A8A]" />
                    <span className="text-xs">Dashboard</span>
                  </NavLink>

                  <button
                    onClick={() => setAdminEmployeeOpen(!adminEmployeeOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Users className="w-4 h-4 shrink-0 text-red-600" />
                      <span className="text-xs font-medium text-left leading-tight">Employee Administration</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminEmployeeOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminEmployeeOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/employee/master" className={subNavClass}>
                        <Users className="h-4 w-4 shrink-0 text-red-600" />
                        <span className="text-xs">Employee Master</span>
                      </NavLink>
                      <NavLink to="admin/employee/onboarding" className={subNavClass}>
                        <UserPlus className="h-4 w-4 shrink-0 text-indigo-600" />
                        <span className="text-xs">Onboarding</span>
                      </NavLink>
                      <NavLink to="admin/employee/attendance-inputs" className={subNavClass}>
                        <Clock className="h-4 w-4 shrink-0 text-amber-600" />
                        <span className="text-xs">Attendance Inputs</span>
                      </NavLink>
                      <NavLink to="admin/employee/leaves-permissions" className={subNavClass}>
                        <Calendar className="h-4 w-4 shrink-0 text-purple-600" />
                        <span className="text-xs">Leaves & Permissions</span>
                      </NavLink>
                      <NavLink to="admin/employee/compliance-documents" className={subNavClass}>
                        <ClipboardCheck className="h-4 w-4 shrink-0 text-green-600" />
                        <span className="text-xs">Compliance & Documents</span>
                      </NavLink>
                      <NavLink to="admin/employee/salary-inputs" className={subNavClass}>
                        <RupeeIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="text-xs">Salary Inputs</span>
                      </NavLink>
                      <NavLink to="admin/employee/exit-ff" className={subNavClass}>
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                        <span className="text-xs">Exit & F&F</span>
                      </NavLink>
                    </div>
                  )}

                  <button
                    onClick={() => setAdminStoreOpen(!adminStoreOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Package className="w-4 h-4 shrink-0 text-orange-600" />
                      <span className="text-xs font-medium text-left leading-tight">Store & Issue Control</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminStoreOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminStoreOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/store/item-master" className={subNavClass}><Package className="w-4 h-4 shrink-0 text-orange-600" /><span className="text-xs">Item Master</span></NavLink>
                      <NavLink to="admin/store/store-master" className={subNavClass}><Home className="w-4 h-4 shrink-0 text-slate-600" /><span className="text-xs">Store Master</span></NavLink>
                      <NavLink to="admin/store/site-stock" className={subNavClass}><MapPin className="w-4 h-4 shrink-0 text-red-600" /><span className="text-xs">Site Stock</span></NavLink>
                      <NavLink to="admin/store/issue-entry" className={subNavClass}><FileText className="w-4 h-4 shrink-0 text-indigo-600" /><span className="text-xs">Issue Entry</span></NavLink>
                      <NavLink to="admin/store/return-entry" className={subNavClass}><Receipt className="w-4 h-4 shrink-0 text-emerald-600" /><span className="text-xs">Return Entry</span></NavLink>
                      <NavLink to="admin/store/transfer-transit" className={subNavClass}><Truck className="w-4 h-4 shrink-0 text-amber-600" /><span className="text-xs">Transfer / Transit</span></NavLink>
                      <NavLink to="admin/store/requirement-planner" className={subNavClass}><Calculator className="w-4 h-4 shrink-0 text-purple-600" /><span className="text-xs">Requirement Planner</span></NavLink>
                      <NavLink to="admin/store/reconciliation" className={subNavClass}><CheckCircle className="w-4 h-4 shrink-0 text-teal-600" /><span className="text-xs">Reconciliation</span></NavLink>
                    </div>
                  )}

                  <button
                    onClick={() => setAdminGateOpen(!adminGateOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Shield className="w-4 h-4 shrink-0 text-teal-600" />
                      <span className="text-xs font-medium text-left leading-tight">Gate Pass & Movement Control</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminGateOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminGateOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/gate/employee-movement" className={subNavClass}><Users className="w-4 h-4 shrink-0 text-red-600" /><span className="text-xs">Employee Movement</span></NavLink>
                      <NavLink to="admin/gate/goods-in-out" className={subNavClass}><Package className="w-4 h-4 shrink-0 text-orange-600" /><span className="text-xs">Goods In / Out</span></NavLink>
                      <NavLink to="admin/gate/visitor-guest-passes" className={subNavClass}><User className="w-4 h-4 shrink-0 text-indigo-600" /><span className="text-xs">Visitor / Guest Passes</span></NavLink>
                      <NavLink to="admin/gate/vehicle-passes" className={subNavClass}><Car className="w-4 h-4 shrink-0 text-gray-700" /><span className="text-xs">Vehicle Passes</span></NavLink>
                      <NavLink to="admin/gate/delivery-courier-post" className={subNavClass}><Truck className="w-4 h-4 shrink-0 text-amber-600" /><span className="text-xs">Delivery / Courier / Post</span></NavLink>
                      <NavLink to="admin/gate/security-console" className={subNavClass}><Shield className="w-4 h-4 shrink-0 text-teal-600" /><span className="text-xs">Security Console</span></NavLink>
                    </div>
                  )}

                  <button
                    onClick={() => setAdminMiscOpen(!adminMiscOpen)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <span className="flex items-start space-x-2">
                      <Briefcase className="w-4 h-4 shrink-0 text-fuchsia-600" />
                      <span className="text-xs font-medium text-left leading-tight">Miscellaneous Admin</span>
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${adminMiscOpen ? "rotate-180" : ""}`} />
                  </button>
                  {adminMiscOpen && (
                    <div className="space-y-0.5">
                      <NavLink to="admin/misc/events-coordination" className={subNavClass}><Calendar className="w-4 h-4 shrink-0 text-purple-600" /><span className="text-xs">Events Coordination</span></NavLink>
                      <NavLink to="admin/misc/tour-travel-details" className={subNavClass}><MapPin className="w-4 h-4 shrink-0 text-red-600" /><span className="text-xs">Tour / Travel Details</span></NavLink>
                      <NavLink to="admin/misc/admin-tasks-other-requests" className={subNavClass}><ClipboardCheck className="w-4 h-4 shrink-0 text-sky-600" /><span className="text-xs">Admin Tasks / Other Requests</span></NavLink>
                    </div>
                  )}

                  <NavLink to="admin/alerts-notifications" className={subNavClass}>
                    <Bell className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="text-xs">Alerts & Notifications</span>
                  </NavLink>
                  <NavLink to="admin/reports-analytics" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="text-xs">Reports & Analytics</span>
                  </NavLink>
                  <NavLink to="admin/settings-masters" className={subNavClass}>
                    <Settings className="w-4 h-4 shrink-0 text-gray-700" />
                    <span className="text-xs">Settings / Masters</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Commercial (renamed from Sales: Manpower + PO Entry + Contact Log) */}
            {(can("sales") || can("commercial")) && (
            <div>
              <button
                onClick={() => setSalesOpen(!salesOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/manpower") || pathname.startsWith("/app/commercial") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Briefcase className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Commercial</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    salesOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {salesOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="/app/commercial/dashboard" className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="text-xs">Commercial Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/manpower" end className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Manpower Management Enquiry</span>
                  </NavLink>
                  <NavLink to="/app/manpower/internal-quotation" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-green-700" />
                    <span className="text-xs">Internal Quotation</span>
                  </NavLink>
                  <NavLink to="/app/manpower/quotation" className={subNavClass}>
                    <ReceiptIcon className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Quotation</span>
                  </NavLink>

                  <button
                    type="button"
                    onClick={() => setManpowerConfigOpen((v) => !v)}
                    className="flex items-start justify-between w-full p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
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
                        <Users className="w-4 h-4 shrink-0 text-red-600" />
                        <span className="text-xs">Roles</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/price-master" className={subNavClass}>
                        <RupeeIcon className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="text-xs">Price Master</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/mail-template" className={subNavClass}>
                        <FileText className="w-4 h-4 shrink-0 text-indigo-600" />
                        <span className="text-xs">Mail Template</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/employee-type" className={subNavClass}>
                        <UserCheck className="w-4 h-4 shrink-0 text-amber-700" />
                        <span className="text-xs">Employee Type</span>
                      </NavLink>
                      <NavLink to="/app/manpower/configuration/departments" className={subNavClass}>
                        <FolderOpen className="w-4 h-4 shrink-0 text-slate-700" />
                        <span className="text-xs">Departments</span>
                      </NavLink>
                    </div>
                  )}
                  <NavLink to="/app/commercial/po-entry" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">PO Entry</span>
                  </NavLink>
                  <NavLink to="/app/commercial/contact-log" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="text-xs">Contact Log</span>
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/marketing") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Marketing</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    marketingOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {marketingOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="/app/marketing" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Marketing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/marketing/enquiry-master" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Enquiry Master</span>
                  </NavLink>
                  <NavLink to="/app/marketing/quotation-tracker" className={subNavClass}>
                    <RupeeIcon className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">Quotation Tracker</span>
                  </NavLink>
                  <NavLink to="/app/marketing/follow-up-planner" className={subNavClass}>
                    <Calendar className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="text-xs">Follow-up Planner</span>
                  </NavLink>
                  <NavLink to="/app/marketing/client-master" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="text-xs">Client Master</span>
                  </NavLink>
                  <NavLink to="/app/marketing/product-catalog" className={subNavClass}>
                    <Package className="w-4 h-4 shrink-0 text-yellow-600" />
                    <span className="text-xs">Product Catalog</span>
                  </NavLink>
                  <NavLink to="/app/marketing/purchase-orders" className={subNavClass}>
                    <ShoppingCart className="w-4 h-4 shrink-0 text-pink-600" />
                    <span className="text-xs">Purchase Orders</span>
                  </NavLink>
                  <NavLink to="/app/marketing/expo-seminar" className={subNavClass}>
                    <MapPin className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Expo & Seminar</span>
                  </NavLink>
                  <NavLink to="/app/marketing/gst-upload" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="text-xs">GST Documents</span>
                  </NavLink>
                  <NavLink to="/app/marketing/mail-templates" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Marketing Mail Template</span>
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/billing") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <ReceiptIcon className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Billing</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    billingOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {billingOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="/app/billing" end className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Billing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/billing/create-invoice" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span className="text-xs">Create Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/add-on-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-violet-600" />
                    <span className="text-xs">Add-On Invoices</span>
                  </NavLink>
                  <NavLink to="/app/billing/manage-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Manage Invoices</span>
                  </NavLink>
                  <NavLink to="/app/billing/generated-e-invoice" className={subNavClass}>
                    <FileDigit className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">Generated E-Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/credit-notes" className={subNavClass}>
                    <Receipt className="w-4 h-4 shrink-0 text-amber-600" />
                    <span className="text-xs">Credit/Debit Notes</span>
                  </NavLink>
                  <NavLink to="/app/billing/reports" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="text-xs">Reports</span>
                  </NavLink>
                  <NavLink to="/app/billing/tracking" className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="text-xs">Tracking</span>
                  </NavLink>
                  <NavLink to="/app/billing/notifications" className={subNavClass}>
                    <Bell className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="text-xs">Notifications</span>
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
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/fire-tender-vehicle") || pathname.startsWith("/app/operations") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Wrench className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Operations</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    operationsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {operationsOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="fire-tender-vehicle-management" className={subNavClass}>
                    <Car className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="text-xs">Fire Tender/Vehicle Management</span>
                  </NavLink>
                  <NavLink to="operations" className={subNavClass}>
                    <Cog className="w-4 h-4 shrink-0 text-gray-600" />
                    <span className="text-xs">Operations</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Projects */}
            {can("projects") && (
            <div>
              <button
                onClick={() => setProjectsOpen(!projectsOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/projects") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Activity className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Projects</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    projectsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {projectsOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="projects-management" className={subNavClass}>
                    <FolderOpen className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">Projects Management</span>
                  </NavLink>
                  <NavLink to="projects-billing" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Projects Billing</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {/* Procurement */}
            {can("procurement") && (
            <NavLink to="procurement" className={topNavClass}>
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Procurement</span>
            </NavLink>
            )}

            {/* AMC */}
            {can("amc") && (
            <NavLink to="amc" className={topNavClass}>
              <FileText className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">AMC</span>
            </NavLink>
            )}

            {/* Finance/Accounts */}
            {can("finance") && (
            <NavLink to="accounts-finance" className={topNavClass}>
              <RupeeIcon className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Finance/Accounts</span>
            </NavLink>
            )}

            {/* Fire Tender */}
            {can("fireTender") && (
            <div>
              <button
                onClick={() => setFireTenderOpen(!fireTenderOpen)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg hover:bg-slate-100 transition-colors min-h-[2.35rem] ${pathname.startsWith("/app/fire-tender") || pathname.startsWith("/app/fire-tender-manufacturing") ? "bg-red-50 text-red-800 shadow-sm" : "text-gray-700"}`}
              >
                <span className="flex items-center space-x-2.5">
                  <Truck className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Fire Tender</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transform transition-transform ${
                    fireTenderOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {fireTenderOpen && (
                <div className="ml-5 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                  <NavLink to="fire-tender" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Fire Tender Dashboard</span>
                  </NavLink>
                  <NavLink to="fire-tender/new" className={subNavClass}>
                    <Truck className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="text-xs">New Tender</span>
                  </NavLink>
                  <NavLink to="fire-tender/costing" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">Costing Sheet</span>
                  </NavLink>
                  <NavLink to="fire-tender/quotation" className={subNavClass}>
                    <ReceiptIcon className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Quotation</span>
                  </NavLink>
                  <NavLink to="fire-tender-manufacturing" className={subNavClass}>
                    <Factory className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="text-xs">Fire Tender Manufacturing</span>
                  </NavLink>
                </div>
              )}
            </div>
            )}

            {can("userManagement") && (
            <NavLink to="user-management" className={topNavClass}>
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">User Management</span>
            </NavLink>
            )}

            {can("settings") && (
            <NavLink to="settings" className={topNavClass}>
              <Settings className="w-4 h-4 shrink-0" />
              <span className="text-sm font-medium">Settings</span>
            </NavLink>
            )}

          </nav>

          {/* Account Info */}
          <div className="p-3 border-t border-slate-200/90 bg-slate-50/70">
            <div className="flex items-center space-x-2 mb-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-rose-700 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 shrink-0 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {userProfile?.username || user?.email?.split("@")[0] || user?.email}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-xs font-medium shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-64">
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-slate-200/90 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md hover:bg-gray-100 shrink-0"
            >
              ☰
            </button>
            <img src={INDUS_LOGO_SRC} alt="" className="hidden sm:block h-9 w-9 object-contain shrink-0" width={36} height={36} />
            <h2 className="text-xl font-semibold text-gray-900 truncate">Welcome back!</h2>
          </div>
        </header>

        {/* Page Content */}
        <main className="erp-app-shell flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
