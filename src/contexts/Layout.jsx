import React, { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useAuditConsole } from "../contexts/AuditConsoleContext";
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
} from "lucide-react";

// Rupee Icon Component
const RupeeIcon = ({ className = '' }) => {
  return (
    <span 
      className={`${className} inline-flex items-center justify-center`}
      style={{ 
        fontFamily: 'Arial, sans-serif', 
        fontWeight: 'bold',
        lineHeight: '1'
      }}
    >
      ₹
    </span>
  );
};

const Layout = () => {
  const { user, signOut } = useAuth();
  const { isConsoleVisible } = useAuditConsole();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
            <Link
              to="/app/dashboard"
              className="flex items-center space-x-2.5 p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              <span className="text-sm font-medium">Overview</span>
            </Link>

            {/* HR */}
            <div>
              <button
                onClick={() => setHrAdminOpen(!hrAdminOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <UserCheck className="w-4 h-4" />
                  <span className="text-sm font-medium">HR</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    hrAdminOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {hrAdminOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="hr"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">HR Management</span>
                  </Link>
                  <Link
                    to="attendance"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-xs">Attendance</span>
                  </Link>
                  <Link
                    to="payroll"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs">Payroll</span>
                  </Link>
                  <Link
                    to="people-management"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <UserPlus className="w-4 h-4 text-pink-600" />
                    <span className="text-xs">People Management</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Compliance */}
            <div>
              <button
                onClick={() => setComplianceOpen(!complianceOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm font-medium">Compliance</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    complianceOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {complianceOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="ifsp-employee-compliance"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-xs">IFSPL Employee Compliance</span>
                  </Link>
                  <Link
                    to="general-compliance"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <ClipboardCheck className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">General Compliance</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Admin */}
            <div>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <Cog className="w-4 h-4" />
                  <span className="text-sm font-medium">Admin</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    adminOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {adminOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="ifsp-employee-master"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="text-xs">IFSPL Employee Master</span>
                  </Link>
                  <Link
                    to="ifsp-employee-attendance"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs">IFSPL Employee Attendance</span>
                  </Link>
                  <Link
                    to="ifsp-employee-payroll"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <RupeeIcon className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs">IFSPL Employee Payroll</span>
                  </Link>
                  <Link
                    to="ifsp-employee-leaves"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">IFSPL Employee Leaves</span>
                  </Link>
                  <Link
                    to="store-inventory"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Package className="w-4 h-4 text-orange-600" />
                    <span className="text-xs">Store/Inventory</span>
                  </Link>
                  <Link
                    to="gate-pass"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Home className="w-4 h-4 text-teal-600" />
                    <span className="text-xs">Gate Pass</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Sales */}
            <div>
              <button
                onClick={() => setSalesOpen(!salesOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <Briefcase className="w-4 h-4" />
                  <span className="text-sm font-medium">Sales</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    salesOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {salesOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="manpower"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Users className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Manpower Enquiry</span>
                  </Link>
                  <Link
                    to="manpower/list"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-green-600" />
                    <span className="text-xs">Enquiry List</span>
                  </Link>
                  <Link
                    to="manpower/internal-quotation"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Calculator className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">Internal Quotation</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Marketing */}
            <div>
              <button
                onClick={() => setMarketingOpen(!marketingOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm font-medium">Marketing</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    marketingOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {marketingOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="/app/marketing"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <BarChart3 className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">Marketing Dashboard</span>
                  </Link>
                  <Link
                    to="/app/marketing/enquiry-master"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Enquiry Master</span>
                  </Link>
                  <Link
                    to="/app/marketing/quotation-tracker"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <RupeeIcon className="w-4 h-4 text-green-600" />
                    <span className="text-xs">Quotation Tracker</span>
                  </Link>
                  <Link
                    to="/app/marketing/follow-up-planner"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-orange-600" />
                    <span className="text-xs">Follow-up Planner</span>
                  </Link>
                  <Link
                    to="/app/marketing/client-master"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs">Client Master</span>
                  </Link>
                  <Link
                    to="/app/marketing/product-catalog"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Package className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs">Product Catalog</span>
                  </Link>
                  <Link
                    to="/app/marketing/purchase-orders"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <ShoppingCart className="w-4 h-4 text-pink-600" />
                    <span className="text-xs">Purchase Orders</span>
                  </Link>
                  <Link
                    to="/app/marketing/expo-seminar"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <MapPin className="w-4 h-4 text-red-600" />
                    <span className="text-xs">Expo & Seminar</span>
                  </Link>
                  <Link
                    to="/app/marketing/gst-upload"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Receipt className="w-4 h-4 text-teal-600" />
                    <span className="text-xs">GST Documents</span>
                  </Link>
                  <Link
                    to="/app/marketing/mail-templates"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Marketing Mail Template</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Billing */}
            <Link
              to="billing"
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 text-gray-700"
            >
              <ReceiptIcon className="w-5 h-5" />
              <span>Billing</span>
            </Link>

            {/* Operations */}
            <div>
              <button
                onClick={() => setOperationsOpen(!operationsOpen)}
                className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-gray-100 text-gray-700"
              >
                <span className="flex items-center space-x-3">
                  <Wrench className="w-5 h-5" />
                  <span>Operations</span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 transform transition-transform ${
                    operationsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {operationsOpen && (
                <div className="ml-8 mt-1 space-y-1">
                  <Link
                    to="fire-tender-vehicle-management"
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 text-gray-700"
                  >
                    <Car className="w-5 h-5 text-orange-600" />
                    <span>Fire Tender/Vehicle Management</span>
                  </Link>
                  <Link
                    to="operations"
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 text-gray-700"
                  >
                    <Cog className="w-5 h-5 text-gray-600" />
                    <span>Operations</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Projects */}
            <div>
              <button
                onClick={() => setProjectsOpen(!projectsOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm font-medium">Projects</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    projectsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {projectsOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="projects-management"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <FolderOpen className="w-4 h-4 text-green-600" />
                    <span className="text-xs">Projects Management</span>
                  </Link>
                  <Link
                    to="projects-billing"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Calculator className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">Projects Billing</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Procurement */}
            <Link
              to="procurement"
              className="flex items-center space-x-2.5 p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="text-sm font-medium">Procurement</span>
            </Link>

            {/* AMC */}
            <Link
              to="amc"
              className="flex items-center space-x-2.5 p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span className="text-sm font-medium">AMC</span>
            </Link>

            {/* Finance/Accounts */}
            <Link
              to="accounts-finance"
              className="flex items-center space-x-2.5 p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <RupeeIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Finance/Accounts</span>
            </Link>

            {/* Fire Tender */}
            <div>
              <button
                onClick={() => setFireTenderOpen(!fireTenderOpen)}
                className="flex items-center justify-between w-full p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
              >
                <span className="flex items-center space-x-2.5">
                  <Truck className="w-4 h-4" />
                  <span className="text-sm font-medium">Fire Tender</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transform transition-transform ${
                    fireTenderOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {fireTenderOpen && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  <Link
                    to="fire-tender"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Truck className="w-4 h-4 text-red-600" />
                    <span className="text-xs">Fire Tender Costing</span>
                  </Link>
                  <Link
                    to="fire-tender/list"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-xs">Fire Tender List</span>
                  </Link>
                  <Link
                    to="fire-tender/costing"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Calculator className="w-4 h-4 text-green-600" />
                    <span className="text-xs">Costing Sheet</span>
                  </Link>
                  <Link
                    to="fire-tender/quotation"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <ReceiptIcon className="w-4 h-4 text-purple-600" />
                    <span className="text-xs">Quotation</span>
                  </Link>
                  <Link
                    to="fire-tender-manufacturing"
                    className="flex items-center space-x-2.5 p-1.5 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
                  >
                    <Factory className="w-4 h-4 text-orange-600" />
                    <span className="text-xs">Fire Tender Manufacturing</span>
                  </Link>
                </div>
              )}
            </div>

            <Link
              to="settings"
              className="flex items-center space-x-2.5 p-2 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Settings</span>
            </Link>
          </nav>

          {/* Account Info */}
          <div className="p-3 border-t bg-gray-50">
            <div className="flex items-center space-x-2 mb-2.5">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">
                  {user?.email?.split('@')[0] || user?.email}
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
