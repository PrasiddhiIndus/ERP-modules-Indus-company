import { lazy } from "react";

/** Load a module re-export as default (named export pages). */
function lazyNamed(importFn, exportName) {
  return lazy(() =>
    importFn().then((module) => ({
      default: module[exportName],
    }))
  );
}

// Demo / static data (small — keep eager)
export { default as demoTenders } from "../pages/projects/demoTenders";
export { default as demoQuotations } from "../pages/projects/demoQuotations";

// Shell & auth (loaded with app shell)
export { default as Layout } from "../contexts/Layout";

// Public
export const Login = lazy(() => import("../pages/Login"));
export const Register = lazy(() => import("../pages/Register"));

// Core
export const Dashboard = lazy(() => import("../pages/Dashboard"));

// Projects — Fire tender
export const FireTender = lazy(() => import("../pages/projects/FireTender"));
export const FireTenderDashboard = lazy(() => import("../pages/projects/FireTenderDashboard"));
export const FireTenderCostingHub = lazy(() => import("../pages/projects/FireTenderCostingHub"));
export const CostingList = lazy(() => import("../pages/projects/CostingList"));
export const CostingSheet = lazy(() => import("../pages/projects/CostingSheet"));
export const QuotationList = lazy(() => import("../pages/projects/QuotationList"));
export const QuotationDetail = lazy(() => import("../pages/projects/QuotationDetail"));
export const MainComponentPage = lazy(() => import("../pages/projects/configurationTender/MainComponentPage"));
export const ManualSubCategoryPage = lazy(() => import("../pages/projects/configurationTender/ManualSubCategoryPage"));
export const FireTenderMailTemplatePage = lazy(() => import("../pages/projects/configurationTender/FireTenderMailTemplatePage"));
export const PriceMasterPage = lazy(() => import("../pages/projects/configurationTender/PriceMasterPage"));
export const AccessoriesPage = lazy(() => import("../pages/projects/configurationTender/AccessoriesPage"));
export const FinalComponentsPage = lazy(() => import("../pages/projects/configurationTender/FinalComponentsPage"));
export const VehicleTypePage = lazy(() => import("../pages/projects/configurationTender/VehicleTypePage"));

// Manpower
export const ManpowerManagement = lazy(() => import("../pages/manpowerProject/ManpowerManagement"));
export const InternalQuotationList = lazy(() => import("../pages/manpowerProject/enquiryProjects/InternalQuotationList"));
export const InternalQuotationForm = lazy(() => import("../pages/manpowerProject/enquiryProjects/InternalQuotationForm"));
export const ManpowerQuotationList = lazy(() => import("../pages/manpowerProject/quotation/ManpowerQuotationList"));
export const ManpowerConfiguration = lazy(() => import("../pages/manpowerProject/configuration/ManpowerConfiguration"));

// Business modules
export const Billing = lazy(() => import("../pages/billing/Billing"));
export const Commercial = lazy(() => import("../pages/sales/Commercial"));
export const CommercialRmMmAmcIev = lazy(() => import("../pages/commercial-rm-mm-amc-iev/CommercialRmMmAmcIev"));
export const CommercialRmManpowerManagement = lazy(() => import("../pages/commercial-rm-mm-amc-iev/ManpowerManagement"));
export const CommercialRmInternalQuotation = lazy(() => import("../pages/commercial-rm-mm-amc-iev/InternalQuotation"));
export const FireTenderVehicleManagement = lazy(() => import("../pages/fireTenderVehicle/FireTenderVehicleManagement"));
export const Attendance = lazy(() => import("../pages/attendance/Attendance"));
export const Salary = lazy(() => import("../pages/salary/Salary"));
export const StoreInventory = lazy(() => import("../pages/store/StoreInventory"));
export const HR = lazy(() => import("../pages/hr/HR"));
export const HrEmployeeMaster = lazy(() => import("../pages/hr/HrEmployeeMaster"));
export const HrSalaryInputs = lazy(() => import("../pages/hr/HrSalaryInputs"));
export const Procurement = lazy(() => import("../pages/procurement/Procurement"));
export const Operations = lazy(() => import("../pages/operations/Operations"));
export const ProjectsBilling = lazy(() => import("../pages/projectsBilling/ProjectsBilling"));
export const ProjectsManagement = lazy(() => import("../pages/projectsManagement/ProjectsManagement"));
export const ProjectsPoHub = lazy(() => import("../pages/projects/ProjectsPoHub"));
export const ProjectsEnquiryHub = lazy(() => import("../pages/projects/enquiry/ProjectsEnquiryHub"));
export const AccountsFinance = lazy(() => import("../pages/finance/Finance"));

// HR / admin / compliance
export const PeopleManagement = lazy(() => import("../pages/peopleManagement/PeopleManagement"));
export const IfspEmployeeCompliance = lazy(() => import("../pages/compliance/IfspEmployeeCompliance"));
export const GeneralCompliance = lazy(() => import("../pages/compliance/GeneralCompliance"));
export const IfspEmployeeAttendance = lazy(() => import("../pages/admin/IfspEmployeeAttendance"));
export const IfspEmployeePayroll = lazy(() => import("../pages/admin/IfspEmployeePayroll"));
export const IfspEmployeeLeaves = lazy(() => import("../pages/admin/IfspEmployeeLeaves"));
export const IfspEmployeeMaster = lazy(() => import("../pages/admin/IfspEmployeeMaster"));
export const GatePass = lazy(() => import("../pages/admin/GatePass"));

// Admin operations
export const AdminOpsDashboard = lazy(() => import("../pages/adminOperations/AdminOpsDashboard"));
export const AdminOpsAlerts = lazy(() => import("../pages/adminOperations/AdminOpsAlerts"));
export const AdminOpsReports = lazy(() => import("../pages/adminOperations/AdminOpsReports"));
export const AdminOpsSettings = lazy(() => import("../pages/adminOperations/AdminOpsSettings"));
export const PayrollLayout = lazy(() => import("../pages/adminOperations/payroll/PayrollLayout"));
export const PayrollFormulaPage = lazy(() => import("../pages/adminOperations/payroll/PayrollFormulaPage"));
export const PayrollDashboardPage = lazyNamed(
  () => import("../pages/adminOperations/payroll/PayrollViews"),
  "PayrollDashboardPage"
);
export const PayrollMonthPage = lazyNamed(
  () => import("../pages/adminOperations/payroll/PayrollViews"),
  "PayrollMonthPage"
);
export const PayrollYearPage = lazyNamed(
  () => import("../pages/adminOperations/payroll/PayrollViews"),
  "PayrollYearPage"
);

export const SalaryManagementLayout = lazy(() => import("../pages/hr/payroll/salary/SalaryLayout"));
export const SalaryManagementDashboard = lazy(() => import("../pages/hr/payroll/salary/Dashboard"));
export const EmployeePayrollList = lazy(() => import("../pages/hr/payroll/salary/EmployeePayrollList"));
export const SalaryEmployeeMaster = lazy(() => import("../pages/hr/payroll/salary/EmployeeMaster"));
export const SalaryEmployeeMasterProfile = lazy(() => import("../pages/hr/payroll/salary/EmployeeMasterProfile"));
export const EmployeePayrollProfile = lazy(() => import("../pages/hr/payroll/salary/EmployeePayrollProfile"));
export const PayrollRunPage = lazy(() => import("../pages/hr/payroll/salary/PayrollRun"));
export const SiteFormulaSetup = lazy(() => import("../pages/hr/payroll/salary/SiteFormulaSetup"));
export const PayrollManualInputs = lazy(() => import("../pages/hr/payroll/salary/ManualInputs"));
export const StatutoryPF = lazy(() => import("../pages/hr/payroll/salary/statutory/PF"));
export const StatutoryESIC = lazy(() => import("../pages/hr/payroll/salary/statutory/ESIC"));
export const StatutoryPT = lazy(() => import("../pages/hr/payroll/salary/statutory/PT"));
export const StatutoryTDS = lazy(() => import("../pages/hr/payroll/salary/statutory/TDS"));
export const LoansRecoveries = lazy(() => import("../pages/hr/payroll/salary/LoansRecoveries"));
export const PayrollRegister = lazy(() => import("../pages/hr/payroll/salary/Register"));
export const PayrollOutputs = lazy(() => import("../pages/hr/payroll/salary/Outputs"));
export const SalaryManagementSettings = lazy(() => import("../pages/hr/payroll/salary/Settings"));
export const SalarySiteMaster = lazy(() => import("../pages/hr/payroll/salary/SiteMaster"));
export const SalaryPayrollPackageBuilder = lazy(() => import("../pages/hr/payroll/salary/PayrollPackageBuilder"));
export const SalaryAttendanceIntegration = lazy(() => import("../pages/hr/payroll/salary/AttendanceIntegration"));
export const SalaryComplianceManagement = lazy(() => import("../pages/hr/payroll/salary/ComplianceManagement"));
export const SalaryPayrollApproval = lazy(() => import("../pages/hr/payroll/salary/PayrollApproval"));
export const SalaryReportsExports = lazy(() => import("../pages/hr/payroll/salary/ReportsExports"));
export const SalaryEmployeeExit = lazy(() => import("../pages/hr/payroll/salary/EmployeeExit"));
export const SalaryFullFinalSettlement = lazy(() => import("../pages/hr/payroll/salary/FullFinalSettlement"));

export const HrSalaryLayout = lazy(() => import("../pages/hr/payroll/salary/SalaryLayout"));
export const HrSalaryDashboard = lazy(() => import("../pages/hr/payroll/salary/Dashboard"));
export const HrSalaryEmployeeList = lazy(() => import("../pages/hr/payroll/salary/EmployeePayrollList"));
export const HrSalaryEmployeeProfile = lazy(() => import("../pages/hr/payroll/salary/EmployeePayrollProfile"));
export const HrSalaryPayrollRun = lazy(() => import("../pages/hr/payroll/salary/PayrollRun"));
export const HrSalarySiteFormulas = lazy(() => import("../pages/hr/payroll/salary/SiteFormulaSetup"));
export const HrSalaryManualInputs = lazy(() => import("../pages/hr/payroll/salary/ManualInputs"));
export const HrSalaryPF = lazy(() => import("../pages/hr/payroll/salary/statutory/PF"));
export const HrSalaryESIC = lazy(() => import("../pages/hr/payroll/salary/statutory/ESIC"));
export const HrSalaryPT = lazy(() => import("../pages/hr/payroll/salary/statutory/PT"));
export const HrSalaryTDS = lazy(() => import("../pages/hr/payroll/salary/statutory/TDS"));
export const HrSalaryLoans = lazy(() => import("../pages/hr/payroll/salary/LoansRecoveries"));
export const HrSalaryRegister = lazy(() => import("../pages/hr/payroll/salary/Register"));
export const HrSalaryOutputs = lazy(() => import("../pages/hr/payroll/salary/Outputs"));
export const HrSalarySettings = lazy(() => import("../pages/hr/payroll/salary/Settings"));

export const EmployeeOnboardingPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAdminPages"),
  "EmployeeOnboardingPage"
);
export const EmployeeAttendanceInputsPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAdminPages"),
  "EmployeeAttendanceInputsPage"
);
export const EmployeeAttendanceSheetsPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAdminPages"),
  "EmployeeAttendanceSheetsPage"
);
export const EmployeeLeavesPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeLeaveInboxPage"),
  "EmployeeLeavesPage"
);
export const EmployeeCompliancePage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAdminPages"),
  "EmployeeCompliancePage"
);
export const EmployeeSalaryInputsPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAdminPages"),
  "EmployeeSalaryInputsPage"
);
export const EmployeeExitPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAdminPages"),
  "EmployeeExitPage"
);
export const EmployeeAttendanceDailyPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeAttendanceDailyPage"),
  "EmployeeAttendanceDailyPage"
);
export const EmployeeLeaveManagementPage = lazyNamed(
  () => import("../pages/adminOperations/employee/EmployeeLeaveManagementPage"),
  "EmployeeLeaveManagementPage"
);

export const StoreItemMasterPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreItemMasterPage"
);
export const StoreMasterPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreMasterPage"
);
export const StoreSiteStockPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreSiteStockPage"
);
export const StoreIssuePage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreIssuePage"
);
export const StoreReturnPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreReturnPage"
);
export const StoreTransferPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreTransferPage"
);
export const StorePlannerPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StorePlannerPage"
);
export const StoreReconciliationPage = lazyNamed(
  () => import("../pages/adminOperations/store/StoreAdminPages"),
  "StoreReconciliationPage"
);

export const GateEmployeeMovementPage = lazyNamed(
  () => import("../pages/adminOperations/gate/GateAdminPages"),
  "GateEmployeeMovementPage"
);
export const GateGoodsPage = lazyNamed(
  () => import("../pages/adminOperations/gate/GateAdminPages"),
  "GateGoodsPage"
);
export const GateVisitorsPage = lazyNamed(
  () => import("../pages/adminOperations/gate/GateAdminPages"),
  "GateVisitorsPage"
);
export const GateVehiclesPage = lazyNamed(
  () => import("../pages/adminOperations/gate/GateAdminPages"),
  "GateVehiclesPage"
);
export const GateDeliveryPage = lazyNamed(
  () => import("../pages/adminOperations/gate/GateAdminPages"),
  "GateDeliveryPage"
);
export const GateSecurityConsolePage = lazyNamed(
  () => import("../pages/adminOperations/gate/GateAdminPages"),
  "GateSecurityConsolePage"
);

export const MiscEventsPage = lazyNamed(
  () => import("../pages/adminOperations/misc/MiscAdminPages"),
  "MiscEventsPage"
);
export const MiscTravelPage = lazyNamed(
  () => import("../pages/adminOperations/misc/MiscAdminPages"),
  "MiscTravelPage"
);
export const MiscTasksPage = lazyNamed(
  () => import("../pages/adminOperations/misc/MiscAdminPages"),
  "MiscTasksPage"
);

export const FireTenderManufacturing = lazy(() => import("../pages/fireTenderManufacturing/FireTenderManufacturing"));
export const AMC = lazy(() => import("../pages/amc/AMC"));
export const Settings = lazy(() => import("../pages/Settings"));
export const UserManagement = lazy(() => import("../pages/UserManagement"));
export const SoftwareSubscriptions = lazy(() => import("../pages/SoftwareSubscriptions"));
export const IndusLmsTrainings = lazy(() => import("../pages/IndusLmsTrainings"));

// Marketing
export const MarketingDashboard = lazy(() => import("../pages/marketing/MarketingDashboard"));
export const EnquiryMaster = lazy(() => import("../pages/marketing/EnquiryMaster"));
export const QuotationTracker = lazy(() => import("../pages/marketing/QuotationTracker"));
export const CostingSheetList = lazy(() => import("../pages/marketing/CostingSheetList"));
export const CostingSheetDetail = lazy(() => import("../pages/marketing/CostingSheetDetail"));
export const MarketingInternalQuotationList = lazy(() => import("../pages/marketing/InternalQuotationList"));
export const MarketingInternalQuotationForm = lazy(() => import("../pages/marketing/InternalQuotationForm"));
export const QuotationTemplatePage = lazy(() => import("../pages/marketing/QuotationTemplatePage"));
export const FollowUpPlanner = lazy(() => import("../pages/marketing/FollowUpPlanner"));
export const ClientMaster = lazy(() => import("../pages/marketing/ClientMaster"));
export const ProductCatalog = lazy(() => import("../pages/marketing/ProductCatalog"));
export const PurchaseOrders = lazy(() => import("../pages/marketing/PurchaseOrders"));
export const ExpoSeminar = lazy(() => import("../pages/marketing/ExpoSeminar"));
export const GSTUpload = lazy(() => import("../pages/marketing/GSTUpload"));
export const MarketingReports = lazy(() => import("../pages/marketing/MarketingReports"));
