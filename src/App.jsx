import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuditConsoleProvider } from "./contexts/AuditConsoleContext";
import { checkSupabaseConnection } from "./lib/supabase";
import Layout from "./contexts/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import FireTender from "./pages/projects/FireTender";
import FireTenderDashboard from "./pages/projects/FireTenderDashboard";
import CostingList from "./pages/projects/CostingList";
import CostingSheet from "./pages/projects/CostingSheet";
import demoTenders from "./pages/projects/demoTenders";
import QuotationList from "./pages/projects/QuotationList";
import QuotationDetail from "./pages/projects/QuotationDetail";
import demoQuotations from "./pages/projects/demoQuotations";
import MainComponentPage from "./pages/projects/configurationTender/MainComponentPage";
import ManualSubCategoryPage from "./pages/projects/configurationTender/ManualSubCategoryPage";
import FireTenderMailTemplatePage from "./pages/projects/configurationTender/FireTenderMailTemplatePage";
import PriceMasterPage from "./pages/projects/configurationTender/PriceMasterPage";
import AccessoriesPage from "./pages/projects/configurationTender/AccessoriesPage";
import FinalComponentsPage from "./pages/projects/configurationTender/FinalComponentsPage";
import VehicleTypePage from "./pages/projects/configurationTender/VehicleTypePage";
import ManpowerManagement from "./pages/manpowerProject/ManpowerManagement";
import InternalQuotationList from "./pages/manpowerProject/enquiryProjects/InternalQuotationList";
import InternalQuotationForm from "./pages/manpowerProject/enquiryProjects/InternalQuotationForm";

// New module imports
import Billing from "./pages/billing/Billing";
import Commercial from "./pages/sales/Commercial";
import FireTenderVehicleManagement from "./pages/fireTenderVehicle/FireTenderVehicleManagement";
import Payroll from "./pages/payroll/Payroll";
import Attendance from "./pages/attendance/Attendance";
import StoreInventory from "./pages/store/StoreInventory";
import HR from "./pages/hr/HR";
import Procurement from "./pages/procurement/Procurement";
import Operations from "./pages/operations/Operations";
import ProjectsBilling from "./pages/projectsBilling/ProjectsBilling";
import ProjectsManagement from "./pages/projectsManagement/ProjectsManagement";
import AccountsFinance from "./pages/accountsFinance/AccountsFinance";

// Additional module imports for reorganized structure
import PeopleManagement from "./pages/peopleManagement/PeopleManagement";
import IfspEmployeeCompliance from "./pages/compliance/IfspEmployeeCompliance";
import GeneralCompliance from "./pages/compliance/GeneralCompliance";
import IfspEmployeeAttendance from "./pages/admin/IfspEmployeeAttendance";
import IfspEmployeePayroll from "./pages/admin/IfspEmployeePayroll";
import IfspEmployeeLeaves from "./pages/admin/IfspEmployeeLeaves";
import IfspEmployeeMaster from "./pages/admin/IfspEmployeeMaster";
import GatePass from "./pages/admin/GatePass";
import AdminOpsDashboard from "./pages/adminOperations/AdminOpsDashboard";
import AdminOpsAlerts from "./pages/adminOperations/AdminOpsAlerts";
import AdminOpsReports from "./pages/adminOperations/AdminOpsReports";
import AdminOpsSettings from "./pages/adminOperations/AdminOpsSettings";
import {
  EmployeeOnboardingPage,
  EmployeeAttendanceInputsPage,
  EmployeeLeavesPage,
  EmployeeCompliancePage,
  EmployeeSalaryInputsPage,
  EmployeeExitPage,
} from "./pages/adminOperations/employee/EmployeeAdminPages";
import {
  StoreItemMasterPage,
  StoreMasterPage,
  StoreSiteStockPage,
  StoreIssuePage,
  StoreReturnPage,
  StoreTransferPage,
  StorePlannerPage,
  StoreReconciliationPage,
} from "./pages/adminOperations/store/StoreAdminPages";
import {
  GateEmployeeMovementPage,
  GateGoodsPage,
  GateVisitorsPage,
  GateVehiclesPage,
  GateDeliveryPage,
  GateSecurityConsolePage,
} from "./pages/adminOperations/gate/GateAdminPages";
import { MiscEventsPage, MiscTravelPage, MiscTasksPage } from "./pages/adminOperations/misc/MiscAdminPages";
import FireTenderManufacturing from "./pages/fireTenderManufacturing/FireTenderManufacturing";
import AMC from "./pages/amc/AMC";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";

// Marketing Module
import MarketingDashboard from "./pages/marketing/MarketingDashboard";
import EnquiryMaster from "./pages/marketing/EnquiryMaster";
import QuotationTracker from "./pages/marketing/QuotationTracker";
import CostingSheetList from "./pages/marketing/CostingSheetList";
import CostingSheetDetail from "./pages/marketing/CostingSheetDetail";
import MarketingInternalQuotationList from "./pages/marketing/InternalQuotationList";
import MarketingInternalQuotationForm from "./pages/marketing/InternalQuotationForm";
import QuotationTemplatePage from "./pages/marketing/QuotationTemplatePage";
import FollowUpPlanner from "./pages/marketing/FollowUpPlanner";
import ClientMaster from "./pages/marketing/ClientMaster";
import ProductCatalog from "./pages/marketing/ProductCatalog";
import PurchaseOrders from "./pages/marketing/PurchaseOrders";
import ExpoSeminar from "./pages/marketing/ExpoSeminar";
import GSTUpload from "./pages/marketing/GSTUpload";

const DATE_INPUT_MIN = "1900-01-01";
const DATE_INPUT_MAX = "9999-12-31";

function enforceDateInputRules(input) {
  if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
  input.min = DATE_INPUT_MIN;
  input.max = DATE_INPUT_MAX;
  input.lang = "en-GB";
  input.placeholder = "dd-mm-yyyy";
}


const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  // Wait for auth to finish loading before redirecting
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return children;
};


function ConnectionGuard({ children }) {
  const [status, setStatus] = useState("checking"); // 'checking' | 'ok' | 'error'
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    checkSupabaseConnection().then(({ ok, message }) => {
      if (cancelled) return;
      if (ok) setStatus("ok");
      else {
        setStatus("error");
        setErrorMessage(message || "Connection failed.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  const retry = () => {
    setStatus("checking");
    setErrorMessage("");
    checkSupabaseConnection().then(({ ok, message }) => {
      if (ok) setStatus("ok");
      else {
        setStatus("error");
        setErrorMessage(message || "Connection failed.");
      }
    });
  };

  if (status === "checking") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-700">
        <p className="text-lg">Checking connection...</p>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4 text-center">
        <h1 className="text-xl font-semibold text-red-700 mb-2">Cannot load data</h1>
        <p className="text-gray-700 max-w-md mb-4">{errorMessage}</p>
        <p className="text-sm text-gray-500 max-w-md mb-4">
          If this works on another laptop, see <strong>TROUBLESHOOTING.md</strong> in the project: check .env file, restart dev server, and network/firewall.
        </p>
        <button
          type="button"
          onClick={retry}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }
  return children;
}

function App() {
  useEffect(() => {
    const applyRulesToAllDateInputs = () => {
      document.querySelectorAll('input[type="date"]').forEach((input) => {
        enforceDateInputRules(input);
      });
    };

    const handleDateInputCapture = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
      enforceDateInputRules(input);
      const value = String(input.value || "");
      if (!value) return;
      const [year = ""] = value.split("-");
      if (year.length > 4 || value > DATE_INPUT_MAX || value < DATE_INPUT_MIN) {
        input.value = "";
      }
    };

    applyRulesToAllDateInputs();
    const observer = new MutationObserver(() => applyRulesToAllDateInputs());
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", handleDateInputCapture, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", handleDateInputCapture, true);
    };
  }, []);

  return (
    <ConnectionGuard>
    <AuthProvider>
      <AuditConsoleProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
          {/* Public */}
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected with Layout */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="fire-tender" element={<FireTenderDashboard />} />
            <Route path="fire-tender/new" element={<FireTender />} />
            <Route path="fire-tender/list" element={<Navigate to="/app/fire-tender/new" replace />} />
            <Route path="fire-tender/:id" element={<FireTender />} />
            <Route path="fire-tender/costing" element={<CostingList tenders={demoTenders} />} />
            <Route path="fire-tender/costing/:id" element={<CostingSheet tenders={demoTenders} />} />
            <Route path="fire-tender/quotation" element={<QuotationList quotations={demoQuotations} />} />
            <Route path="fire-tender/quotation/:id" element={<QuotationDetail quotations={demoQuotations} />} />
            <Route path="fire-tender/configuration/main-component" element={<MainComponentPage />} />
            <Route path="fire-tender/configuration/manual-sub-category" element={<ManualSubCategoryPage />} />
            <Route path="fire-tender/configuration/fire-tender-mail-template" element={<FireTenderMailTemplatePage />} />
            <Route path="fire-tender/configuration/price-master" element={<PriceMasterPage />} />
            <Route path="fire-tender/configuration/accessories" element={<AccessoriesPage />} />
            <Route path="fire-tender/configuration/final-components" element={<FinalComponentsPage />} />
            <Route path="fire-tender/configuration/vehicle-type" element={<VehicleTypePage />} />

            <Route path="manpower" element={<ManpowerManagement />} />
            <Route path="manpower/list" element={<Navigate to="/app/manpower" replace />} />
            <Route path="manpower/internal-quotation" element={<InternalQuotationList />} />
            <Route path="manpower/internal-quotation/:id" element={<InternalQuotationForm />} />
            <Route path="manpower/:id" element={<ManpowerManagement />} />

            {/* Reorganized Module Routes */}
            
            {/* HR & Admin */}
            <Route path="hr" element={<HR />} />
            <Route path="attendance" element={<Attendance />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="people-management" element={<PeopleManagement />} />
            
            {/* Compliance */}
            <Route path="ifsp-employee-compliance" element={<IfspEmployeeCompliance />} />
            <Route path="general-compliance" element={<GeneralCompliance />} />
            
            {/* Admin */}
            <Route path="ifsp-employee-master" element={<IfspEmployeeMaster />} />
            <Route path="ifsp-employee-attendance" element={<IfspEmployeeAttendance />} />
            <Route path="ifsp-employee-payroll" element={<IfspEmployeePayroll />} />
            <Route path="ifsp-employee-leaves" element={<IfspEmployeeLeaves />} />
            <Route path="store-inventory" element={<StoreInventory />} />
            <Route path="gate-pass" element={<GatePass />} />

            {/* Unified Admin module routes */}
            <Route path="admin" element={<Navigate to="/app/admin/dashboard" replace />} />
            <Route path="admin/dashboard" element={<AdminOpsDashboard />} />
            <Route path="admin/employee/master" element={<IfspEmployeeMaster />} />
            <Route path="admin/employee/onboarding" element={<EmployeeOnboardingPage />} />
            <Route path="admin/employee/attendance-inputs" element={<EmployeeAttendanceInputsPage />} />
            <Route path="admin/employee/leaves-permissions" element={<EmployeeLeavesPage />} />
            <Route path="admin/employee/compliance-documents" element={<EmployeeCompliancePage />} />
            <Route path="admin/employee/salary-inputs" element={<EmployeeSalaryInputsPage />} />
            <Route path="admin/employee/exit-ff" element={<EmployeeExitPage />} />
            <Route path="admin/store/item-master" element={<StoreItemMasterPage />} />
            <Route path="admin/store/store-master" element={<StoreMasterPage />} />
            <Route path="admin/store/site-stock" element={<StoreSiteStockPage />} />
            <Route path="admin/store/issue-entry" element={<StoreIssuePage />} />
            <Route path="admin/store/return-entry" element={<StoreReturnPage />} />
            <Route path="admin/store/transfer-transit" element={<StoreTransferPage />} />
            <Route path="admin/store/requirement-planner" element={<StorePlannerPage />} />
            <Route path="admin/store/reconciliation" element={<StoreReconciliationPage />} />
            <Route path="admin/gate/employee-movement" element={<GateEmployeeMovementPage />} />
            <Route path="admin/gate/goods-in-out" element={<GateGoodsPage />} />
            <Route path="admin/gate/visitor-guest-passes" element={<GateVisitorsPage />} />
            <Route path="admin/gate/vehicle-passes" element={<GateVehiclesPage />} />
            <Route path="admin/gate/delivery-courier-post" element={<GateDeliveryPage />} />
            <Route path="admin/gate/security-console" element={<GateSecurityConsolePage />} />
            <Route path="admin/misc/events-coordination" element={<MiscEventsPage />} />
            <Route path="admin/misc/tour-travel-details" element={<MiscTravelPage />} />
            <Route path="admin/misc/admin-tasks-other-requests" element={<MiscTasksPage />} />
            <Route path="admin/alerts-notifications" element={<AdminOpsAlerts />} />
            <Route path="admin/reports-analytics" element={<AdminOpsReports />} />
            <Route path="admin/settings-masters" element={<AdminOpsSettings />} />

            {/* Legacy Admin Operations URL redirect */}
            <Route path="admin-operations/*" element={<Navigate to="/app/admin/dashboard" replace />} />
            
            {/* Sales */}
            {/* Manpower Enquiry already exists above */}
            
            {/* Commercial (PO/WO – master source for Billing) */}
            <Route path="commercial" element={<Commercial />} />
            <Route path="commercial/dashboard" element={<Commercial />} />
            <Route path="commercial/po-entry" element={<Commercial />} />
            <Route path="commercial/contact-log" element={<Commercial />} />

            {/* Billing (includes Reports and Tracking as sub-tabs) */}
            <Route path="billing" element={<Billing />} />
            <Route path="billing/dashboard" element={<Billing />} />
            <Route path="billing/create-invoice" element={<Billing />} />
            <Route path="billing/add-on-invoices" element={<Billing />} />
            <Route path="billing/manage-invoices" element={<Billing />} />
            <Route path="billing/generated-e-invoice" element={<Billing />} />
            <Route path="billing/credit-notes" element={<Billing />} />
            <Route path="billing/reports" element={<Billing />} />
            <Route path="billing/tracking" element={<Billing />} />
            <Route path="billing/tracking/pa-worklist" element={<Billing />} />
            <Route path="billing/tracking/penalty-logs" element={<Billing />} />
            <Route path="billing/notifications" element={<Billing />} />

            {/* Redirect old top-level routes to Billing sub-routes */}
            <Route path="tracking" element={<Navigate to="/app/billing/tracking" replace />} />
            <Route path="tracking/pa-worklist" element={<Navigate to="/app/billing/tracking/pa-worklist" replace />} />
            <Route path="tracking/penalty-logs" element={<Navigate to="/app/billing/tracking/penalty-logs" replace />} />
            <Route path="reports" element={<Navigate to="/app/billing/reports" replace />} />
            <Route path="reports/outstanding" element={<Navigate to="/app/billing/reports" replace />} />
            <Route path="reports/deduction-analysis" element={<Navigate to="/app/billing/reports" replace />} />
            
            {/* Operations */}
            <Route path="operations" element={<Operations />} />
            <Route path="fire-tender-vehicle-management" element={<FireTenderVehicleManagement />} />
            
            {/* Projects */}
            <Route path="projects-management" element={<ProjectsManagement />} />
            <Route path="projects-billing" element={<ProjectsBilling />} />
            
            {/* Procurement */}
            <Route path="procurement" element={<Procurement />} />
            
            {/* Fire Tender */}
            {/* Fire Tender Costing already exists above */}
            <Route path="fire-tender-manufacturing" element={<FireTenderManufacturing />} />
            
            {/* AMC */}
            <Route path="amc" element={<AMC />} />
            
            {/* Finance/Accounts */}
            <Route path="accounts-finance" element={<AccountsFinance />} />

            {/* Marketing Module Routes */}
            <Route path="marketing" element={<MarketingDashboard />} />
            <Route path="marketing/enquiry-master" element={<EnquiryMaster />} />
            <Route path="marketing/quotation-tracker" element={<QuotationTracker />} />
            <Route path="marketing/quotation-tracker/costing" element={<CostingSheetList />} />
            <Route path="marketing/quotation-tracker/costing/:id" element={<CostingSheetDetail />} />
            <Route path="marketing/quotation-tracker/internal-quotation" element={<MarketingInternalQuotationList />} />
            <Route path="marketing/quotation-tracker/internal-quotation/:id" element={<MarketingInternalQuotationForm />} />
            <Route path="marketing/mail-templates" element={<QuotationTemplatePage />} />
            <Route path="marketing/follow-up-planner" element={<FollowUpPlanner />} />
            <Route path="marketing/client-master" element={<ClientMaster />} />
            <Route path="marketing/product-catalog" element={<ProductCatalog />} />
            <Route path="marketing/purchase-orders" element={<PurchaseOrders />} />
            <Route path="marketing/expo-seminar" element={<ExpoSeminar />} />
            <Route path="marketing/gst-upload" element={<GSTUpload />} />

            {/* User Management (admin only) */}
            <Route path="user-management" element={<UserManagement />} />

            {/* Settings */}
            <Route path="settings" element={<Settings />} />





          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuditConsoleProvider>
    </AuthProvider>
    </ConnectionGuard>
  );
}

export default App;
