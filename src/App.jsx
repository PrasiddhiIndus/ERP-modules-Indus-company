import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuditConsoleProvider } from "./contexts/AuditConsoleContext";
import Layout from "./contexts/Layout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import FireTender from "./pages/projects/FireTender";
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
import TenderList from "./pages/projects/TenderList";
import ManpowerEnquiry from "./pages/manpowerProject/ManpowerEnquiry";
import ManpowerEnquiryList from "./pages/manpowerProject/enquiryProjects/ManpowerEnquiryList";
import InternalQuotationList from "./pages/manpowerProject/enquiryProjects/InternalQuotationList";
import InternalQuotationForm from "./pages/manpowerProject/enquiryProjects/InternalQuotationForm";

// New module imports
import Billing from "./pages/billing/Billing";
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
import FireTenderManufacturing from "./pages/fireTenderManufacturing/FireTenderManufacturing";
import AMC from "./pages/amc/AMC";
import Settings from "./pages/Settings";

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


function App() {
  return (
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
            <Route path="fire-tender" element={<FireTender />} />
            <Route path="fire-tender/list" element={<TenderList />} />
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

            <Route path="manpower" element={<ManpowerEnquiry />} />
            <Route path="manpower/list" element={<ManpowerEnquiryList />} />
            <Route path="manpower/:id" element={<ManpowerEnquiry />} />
            <Route path="manpower/internal-quotation" element={<InternalQuotationList />} />
            <Route path="manpower/internal-quotation/:id" element={<InternalQuotationForm />} />

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
            
            {/* Sales */}
            {/* Manpower Enquiry already exists above */}
            
            {/* Billing */}
            <Route path="billing" element={<Billing />} />
            
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

            {/* Settings */}
            <Route path="settings" element={<Settings />} />





          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuditConsoleProvider>
    </AuthProvider>
  );
}

export default App;
