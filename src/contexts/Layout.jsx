import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuditConsole } from "../contexts/AuditConsoleContext";
import { isPathAllowed } from "../config/roles";
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

const topLinkBase = "flex items-center space-x-2.5 p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem]";
const subLinkBase = "flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 transition-colors";
const activeClass = "bg-blue-50 text-blue-700 border-l-2 border-blue-500";
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

  // Keep expandable section open when current path is under that section
  useEffect(() => {
    if (pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/payroll") || pathname.startsWith("/app/people-management")) setHrAdminOpen(true);
    if (pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance")) setComplianceOpen(true);
    if (pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass")) setAdminOpen(true);
    if (pathname.startsWith("/app/manpower")) setSalesOpen(true);
    if (pathname.startsWith("/app/marketing")) setMarketingOpen(true);
    if (pathname.startsWith("/app/manpower") || pathname.startsWith("/app/commercial")) setSalesOpen(true);
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
        } lg:translate-x-0 fixed inset-y-0 left-0 z-50 w-56 bg-white shadow-xl transition-transform duration-300 ease-in-out`}
      >
        <div className="flex flex-col h-full">
          {/* Logo + Close */}
          <div className="flex items-center justify-between p-3 border-b">
            <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md hover:bg-gray-100"
            >
              ×
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/hr") || pathname.startsWith("/app/attendance") || pathname.startsWith("/app/payroll") || pathname.startsWith("/app/people-management") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="hr" className={subNavClass}>
                    <User className="w-4 h-4 shrink-0 text-blue-600" />
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/ifsp-employee-compliance") || pathname.startsWith("/app/general-compliance") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="ifsp-employee-compliance" className={subNavClass}>
                    <CheckCircle className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">IFSPL Employee Compliance</span>
                  </NavLink>
                  <NavLink to="general-compliance" className={subNavClass}>
                    <ClipboardCheck className="w-4 h-4 shrink-0 text-blue-600" />
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/ifsp-employee") || pathname.startsWith("/app/store-inventory") || pathname.startsWith("/app/gate-pass") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="ifsp-employee-master" className={subNavClass}>
                    <Users className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="text-xs">IFSPL Employee Master</span>
                  </NavLink>
                  <NavLink to="ifsp-employee-attendance" className={subNavClass}>
                    <Clock className="w-4 h-4 shrink-0 text-indigo-600" />
                    <span className="text-xs">IFSPL Employee Attendance</span>
                  </NavLink>
                  <NavLink to="ifsp-employee-payroll" className={subNavClass}>
                    <RupeeIcon className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span className="text-xs">IFSPL Employee Payroll</span>
                  </NavLink>
                  <NavLink to="ifsp-employee-leaves" className={subNavClass}>
                    <Calendar className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">IFSPL Employee Leaves</span>
                  </NavLink>
                  <NavLink to="store-inventory" className={subNavClass}>
                    <Package className="w-4 h-4 shrink-0 text-orange-600" />
                    <span className="text-xs">Store/Inventory</span>
                  </NavLink>
                  <NavLink to="gate-pass" className={subNavClass}>
                    <Home className="w-4 h-4 shrink-0 text-teal-600" />
                    <span className="text-xs">Gate Pass</span>
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/manpower") || pathname.startsWith("/app/commercial") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="manpower" className={subNavClass}>
                    <Users className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="text-xs">Manpower Enquiry</span>
                  </NavLink>
                  <NavLink to="manpower/list" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-green-600" />
                    <span className="text-xs">Enquiry List</span>
                  </NavLink>
                  <NavLink to="manpower/internal-quotation" className={subNavClass}>
                    <Calculator className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Internal Quotation</span>
                  </NavLink>
                  <NavLink to="/app/commercial" end className={subNavClass}>
                    <FileCheck className="w-4 h-4 shrink-0 text-blue-600" />
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/marketing") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="/app/marketing" className={subNavClass}>
                    <BarChart3 className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Marketing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/marketing/enquiry-master" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-blue-600" />
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
                    <FileText className="w-4 h-4 shrink-0 text-blue-600" />
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/billing") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="/app/billing" end className={subNavClass}>
                    <LayoutDashboard className="w-4 h-4 shrink-0 text-purple-600" />
                    <span className="text-xs">Billing Dashboard</span>
                  </NavLink>
                  <NavLink to="/app/billing/create-invoice" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span className="text-xs">Create Invoice</span>
                  </NavLink>
                  <NavLink to="/app/billing/manage-invoices" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-blue-600" />
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
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
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
                <div className="ml-6 mt-0.5 space-y-0.5">
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/projects") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
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
                className={`flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 transition-colors min-h-[2.25rem] ${pathname.startsWith("/app/fire-tender") || pathname.startsWith("/app/fire-tender-manufacturing") ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
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
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <NavLink to="fire-tender" className={subNavClass}>
                    <Truck className="w-4 h-4 shrink-0 text-red-600" />
                    <span className="text-xs">Fire Tender Costing</span>
                  </NavLink>
                  <NavLink to="fire-tender/list" className={subNavClass}>
                    <FileText className="w-4 h-4 shrink-0 text-blue-600" />
                    <span className="text-xs">Fire Tender List</span>
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
          <div className="p-3 border-t bg-gray-50">
            <div className="flex items-center space-x-2 mb-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
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
      <div className="flex-1 flex flex-col lg:ml-56">
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100"
          >
            ☰
          </button>
          <h2 className="text-xl font-semibold text-gray-900">
            Welcome back!
          </h2>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
