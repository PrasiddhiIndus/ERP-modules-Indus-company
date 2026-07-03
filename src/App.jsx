import { useState, useEffect, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PageLoader from "./components/PageLoader";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import { AuditConsoleProvider } from "./contexts/AuditConsoleContext";
import { AppAccessConfigProvider } from "./contexts/AppAccessConfigContext";
import { checkSupabaseConnection } from "./lib/supabase";
import { runBackendDiagnostics } from "./lib/backendDiagnostics";
import {
  Layout,
  demoTenders,
  demoQuotations,
  Login,
  Register,
  ForgotPassword,
  ResetPassword,
  Dashboard,
  FireTender,
  FireTenderDashboard,
  FireTenderCostingHub,
  CostingList,
  CostingSheet,
  QuotationList,
  QuotationDetail,
  MainComponentPage,
  ManualSubCategoryPage,
  FireTenderMailTemplatePage,
  PriceMasterPage,
  AccessoriesPage,
  FinalComponentsPage,
  VehicleTypePage,
  ManpowerManagement,
  InternalQuotationList,
  InternalQuotationForm,
  ManpowerQuotationList,
  ManpowerConfiguration,
  Billing,
  Commercial,
  CommercialRmMmAmcIev,
  CommercialRmManpowerManagement,
  CommercialRmInternalQuotation,
  FireTenderVehicleManagement,
  Attendance,
  StoreInventory,
  HR,
  HrEmployeeMaster,
  HrSalaryInputs,
  Procurement,
  Operations,
  ProjectsBilling,
  ProjectsManagement,
  ProjectsPoHub,
  ProjectsEnquiryHub,
  AccountsFinance,
  PeopleManagement,
  IfspEmployeeCompliance,
  GeneralCompliance,
  IfspEmployeeAttendance,
  IfspEmployeePayroll,
  IfspEmployeeLeaves,
  IfspEmployeeMaster,
  GatePass,
  AdminOpsDashboard,
  AdminOpsAlerts,
  AdminOpsReports,
  AdminOpsSettings,
  PayrollLayout,
  PayrollFormulaPage,
  PayrollDashboardPage,
  PayrollMonthPage,
  PayrollYearPage,
  SalaryManagementLayout,
  SalaryManagementDashboard,
  EmployeePayrollList,
  SalaryEmployeeMaster,
  SalaryEmployeeMasterProfile,
  EmployeePayrollProfile,
  PayrollRunPage,
  SiteFormulaSetup,
  FormulaLibrary,
  PayrollManualInputs,
  StatutoryPF,
  StatutoryESIC,
  StatutoryPT,
  StatutoryTDS,
  LoansRecoveries,
  PayrollOutputs,
  SalaryManagementSettings,
  SalarySiteMaster,
  SalaryPayrollPackageBuilder,
  SalaryAttendanceIntegration,
  SalaryComplianceManagement,
  SalaryPayrollApproval,
  SalaryReportsExports,
  SalaryEmployeeExit,
  SalaryFullFinalSettlement,
  EmployeeOnboardingPage,
  EmployeeAttendanceInputsPage,
  EmployeeAttendanceSheetsPage,
  EmployeeLeavesPage,
  EmployeeCompliancePage,
  EmployeeSalaryInputsPage,
  EmployeeExitPage,
  EmployeeAttendanceDailyPage,
  EmployeeLeaveManagementPage,
  StoreItemMasterPage,
  StoreMasterPage,
  StoreSiteStockPage,
  StoreIssuePage,
  StoreReturnPage,
  StoreTransferPage,
  StorePlannerPage,
  StoreReconciliationPage,
  GateEmployeeMovementPage,
  GateGoodsPage,
  GateVisitorsPage,
  GateVehiclesPage,
  GateDeliveryPage,
  GateSecurityConsolePage,
  MiscEventsPage,
  MiscTravelPage,
  MiscTasksPage,
  FireTenderManufacturing,
  AMC,
  Settings,
  UserManagement,
  SoftwareSubscriptions,
  IndusLmsTrainings,
  MarketingDashboard,
  EnquiryMaster,
  QuotationTracker,
  CostingSheetList,
  CostingSheetDetail,
  MarketingInternalQuotationList,
  MarketingInternalQuotationForm,
  QuotationTemplatePage,
  FollowUpPlanner,
  ClientMaster,
  ProductCatalog,
  PurchaseOrders,
  ExpoSeminar,
  GSTUpload,
  MarketingReports,
} from "./routes/lazyPages";

import {
  enforceDateInputAttributes,
  finalizeDateInputValue,
  isCompleteIsoDate,
} from "./utils/dateInput";

function ConnectionGuard({ children }) {
  useEffect(() => {
    let cancelled = false;
    checkSupabaseConnection().then(({ ok, message }) => {
      if (cancelled || ok) return;
      console.warn('Supabase health check failed:', message);
    });
    return () => { cancelled = true; };
  }, []);

  return children;
}

function RedirectEmployeeMasterId() {
  const { id } = useParams();
  return <Navigate to={`/app/hr/payroll/salary/people-master/${id}`} replace />;
}

function App() {
  useEffect(() => {
    const applyRulesToAllDateInputs = () => {
      document.querySelectorAll('input[type="date"]').forEach((input) => {
        enforceDateInputAttributes(input);
      });
    };

    // Blur only: reject finished dates outside range. Never validate while typing segments.
    const handleDateInputBlur = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
      enforceDateInputAttributes(input);

      const value = String(input.value || "");
      if (!value || !isCompleteIsoDate(value)) return;

      const finalized = finalizeDateInputValue(value);
      if (finalized !== value) {
        input.value = finalized;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    const lastDateValue = new WeakMap();

    const handleDateInputWhileTyping = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "date") return;
      enforceDateInputAttributes(input);

      const value = String(input.value || "");
      if (value) {
        lastDateValue.set(input, value);
        return;
      }

      if (document.activeElement !== input) return;
      const previous = lastDateValue.get(input);
      if (!previous) return;

      queueMicrotask(() => {
        if (document.activeElement !== input || input.value) return;
        input.value = previous;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    applyRulesToAllDateInputs();
    let debounceId = null;
    const scheduleApplyRules = () => {
      if (debounceId != null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        debounceId = null;
        applyRulesToAllDateInputs();
      }, 100);
    };
    const observer = new MutationObserver(scheduleApplyRules);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", handleDateInputWhileTyping, true);
    document.addEventListener("change", handleDateInputWhileTyping, true);
    document.addEventListener("blur", handleDateInputBlur, true);

    return () => {
      if (debounceId != null) window.clearTimeout(debounceId);
      observer.disconnect();
      document.removeEventListener("input", handleDateInputWhileTyping, true);
      document.removeEventListener("change", handleDateInputWhileTyping, true);
      document.removeEventListener("blur", handleDateInputBlur, true);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Dev-only: allow quickly testing network/schema/RLS from console.
    // Usage:
    // - In console: await window.runBackendDiagnostics()
    // - Or add `?diag=1` to the URL to auto-run once.
    window.runBackendDiagnostics = runBackendDiagnostics;
    const params = new URLSearchParams(window.location.search);
    if (params.get("diag") === "1") {
      runBackendDiagnostics()
        .then((rows) => {
          // eslint-disable-next-line no-console
          console.table(rows);
          return rows;
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error("Backend diagnostics failed:", e);
        });
    }
  }, []);

  return (
    <ConnectionGuard>
    <AuthProvider>
      <AppAccessConfigProvider>
        <AuditConsoleProvider>
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <RouteErrorBoundary>
              <Suspense fallback={<PageLoader fullScreen />}>
                <Routes>
          {/* Public */}
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

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
            <Route path="fire-tender/costing-hub" element={<Navigate to="/app/fire-tender/costing-hub/tender" replace />} />
            <Route path="fire-tender/costing-hub/:tab" element={<FireTenderCostingHub />} />
            <Route path="fire-tender/new" element={<Navigate to="/app/fire-tender/costing-hub/tender" replace />} />
            <Route path="fire-tender/list" element={<Navigate to="/app/fire-tender/costing-hub/tender" replace />} />
            <Route path="fire-tender/costing" element={<Navigate to="/app/fire-tender/costing-hub/costing" replace />} />
            <Route path="fire-tender/costing/:id" element={<CostingSheet tenders={demoTenders} />} />
            <Route path="fire-tender/quotation" element={<Navigate to="/app/fire-tender/costing-hub/quotation" replace />} />
            <Route path="fire-tender/:id" element={<FireTender />} />
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
            {/* Flow: Enquiry -> Internal Quotation -> Quotation */}
            <Route path="manpower/internal-quotation" element={<InternalQuotationList />} />
            <Route path="manpower/internal-quotation/:id" element={<InternalQuotationForm />} />
            <Route path="manpower/quotation" element={<ManpowerQuotationList />} />

            {/* Manpower configuration */}
            <Route path="manpower/configuration" element={<Navigate to="/app/manpower/configuration/roles" replace />} />
            <Route path="manpower/configuration/:section" element={<ManpowerConfiguration />} />
            <Route path="manpower/:id" element={<ManpowerManagement />} />

            <Route path="commercial/manpower-training/manpower-management/dashboard" element={<ManpowerManagement />} />
            <Route path="commercial/manpower-training/manpower-management" element={<ManpowerManagement />} />
            <Route path="commercial/manpower-training/manpower-management/:id" element={<ManpowerManagement />} />
            <Route path="commercial/manpower-training/internal-quotation" element={<InternalQuotationList />} />
            <Route path="commercial/manpower-training/internal-quotation/:id" element={<InternalQuotationForm />} />

            {/* Reorganized Module Routes */}
            
            {/* HR & Admin */}
            <Route path="hr" element={<HR />}>
              <Route index element={<Navigate to="employee-master" replace />} />
              <Route path="employee-master" element={<HrEmployeeMaster />} />
              <Route path="salary-inputs" element={<HrSalaryInputs />} />
            </Route>
            <Route path="attendance" element={<Attendance />} />
            <Route path="salary" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="payroll" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="hr/payroll" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="hr/payroll/dashboard" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="hr/payroll/entry" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="hr/payroll/year" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="hr/payroll/formula" element={<Navigate to="/app/hr/payroll/salary/dashboard" replace />} />
            <Route path="hr/payroll/salary" element={<SalaryManagementLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<SalaryManagementDashboard />} />
              <Route path="site-master" element={<SalarySiteMaster />} />
              <Route path="formula-library" element={<FormulaLibrary />} />
              <Route path="payroll-package-builder" element={<SalaryPayrollPackageBuilder />} />
              <Route path="people-master" element={<SalaryEmployeeMaster />} />
              <Route path="people-master/new" element={<SalaryEmployeeMasterProfile />} />
              <Route path="people-master/:id" element={<SalaryEmployeeMasterProfile />} />
              <Route path="attendance-integration" element={<SalaryAttendanceIntegration />} />
              <Route path="compliance-management" element={<SalaryComplianceManagement />} />
              <Route path="compliance/pf" element={<StatutoryPF />} />
              <Route path="compliance/esic" element={<StatutoryESIC />} />
              <Route path="compliance/pt" element={<StatutoryPT />} />
              <Route path="compliance/tds" element={<StatutoryTDS />} />
              <Route path="compliance/loans" element={<LoansRecoveries />} />
              <Route path="payroll-processing" element={<PayrollRunPage />} />
              <Route path="payroll-approval" element={<SalaryPayrollApproval />} />
              <Route path="payslips" element={<PayrollOutputs />} />
              <Route path="reports-exports" element={<SalaryReportsExports />} />
              <Route path="employee-exit" element={<SalaryEmployeeExit />} />
              <Route path="full-final-settlement" element={<SalaryFullFinalSettlement />} />
              <Route path="settings" element={<SalaryManagementSettings />} />
              {/* Legacy redirects */}
              <Route path="employee-master" element={<Navigate to="../people-master" replace />} />
              <Route path="employee-master/new" element={<Navigate to="../people-master/new" replace />} />
              <Route path="employee-master/:id" element={<RedirectEmployeeMasterId />} />
              <Route path="run" element={<Navigate to="../payroll-processing" replace />} />
              <Route path="site-formulas" element={<Navigate to="../formula-library" replace />} />
              <Route path="employees" element={<EmployeePayrollList />} />
              <Route path="employees/:id" element={<EmployeePayrollProfile />} />
              <Route path="manual-inputs" element={<Navigate to="../attendance-integration" replace />} />
              <Route path="pf" element={<Navigate to="../compliance/pf" replace />} />
              <Route path="esic" element={<Navigate to="../compliance/esic" replace />} />
              <Route path="pt" element={<Navigate to="../compliance/pt" replace />} />
              <Route path="tds" element={<Navigate to="../compliance/tds" replace />} />
              <Route path="loans" element={<Navigate to="../compliance/loans" replace />} />
              <Route path="register" element={<Navigate to="../reports-exports" replace />} />
              <Route path="outputs" element={<Navigate to="../payslips" replace />} />
            </Route>
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
            <Route path="admin/payroll" element={<PayrollLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<PayrollDashboardPage />} />
              <Route path="entry" element={<PayrollMonthPage />} />
              <Route path="month" element={<Navigate to="/app/admin/payroll/entry" replace />} />
              <Route path="year" element={<PayrollYearPage />} />
              <Route path="formula" element={<PayrollFormulaPage />} />
            </Route>
            <Route path="admin/employee/master" element={<IfspEmployeeMaster />} />
            <Route path="admin/employee/onboarding" element={<EmployeeOnboardingPage />} />
            <Route path="admin/employee/attendance-inputs" element={<EmployeeAttendanceInputsPage />} />
            <Route path="admin/employee/attendance-daily" element={<EmployeeAttendanceDailyPage />} />
            <Route path="admin/employee/leave-management" element={<EmployeeLeaveManagementPage />} />
            <Route path="admin/employee/attendance-sheets" element={<EmployeeAttendanceSheetsPage />} />
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
            
            {/* Commercial — Manpower / Training */}
            <Route path="commercial/manpower-training" element={<Commercial />} />
            <Route path="commercial/manpower-training/dashboard" element={<Commercial />} />
            <Route path="commercial/manpower-training/po-entry" element={<Commercial />} />
            <Route path="commercial/manpower-training/contact-log" element={<Commercial />} />

            {/* Commercial — R&M / M&M / AMC / IEV */}
            <Route path="commercial/rm-mm-amc-iev" element={<CommercialRmMmAmcIev />} />
            <Route path="commercial/rm-mm-amc-iev/dashboard" element={<CommercialRmMmAmcIev />} />
            <Route path="commercial/rm-mm-amc-iev/po-entry" element={<CommercialRmMmAmcIev />} />
            <Route path="commercial/rm-mm-amc-iev/contact-log" element={<CommercialRmMmAmcIev />} />
            <Route path="commercial/rm-mm-amc-iev/manpower-management" element={<CommercialRmManpowerManagement />} />
            <Route path="commercial/rm-mm-amc-iev/manpower-management/:id" element={<CommercialRmManpowerManagement />} />
            <Route path="commercial/rm-mm-amc-iev/internal-quotation" element={<CommercialRmInternalQuotation />} />
            <Route path="commercial/rm-mm-amc-iev/internal-quotation/:id" element={<CommercialRmInternalQuotation />} />

            <Route path="commercial" element={<Navigate to="/app/commercial/manpower-training/po-entry" replace />} />
            <Route path="commercial/dashboard" element={<Navigate to="/app/commercial/manpower-training/dashboard" replace />} />
            <Route path="commercial/po-entry" element={<Navigate to="/app/commercial/manpower-training/po-entry" replace />} />
            <Route path="commercial/contact-log" element={<Navigate to="/app/commercial/manpower-training/contact-log" replace />} />

            {/* Billing (includes Reports and Tracking as sub-tabs) — single route keeps module mounted across tab URLs */}
            <Route path="billing/*" element={<Billing />} />

            {/* Redirect old top-level routes to Billing sub-routes */}
            <Route path="tracking" element={<Navigate to="/app/billing/tracking" replace />} />
            <Route path="tracking/pa-worklist" element={<Navigate to="/app/billing/tracking/pa-worklist" replace />} />
            <Route path="tracking/penalty-logs" element={<Navigate to="/app/billing/tracking/penalty-logs" replace />} />
            <Route path="reports" element={<Navigate to="/app/billing/reports" replace />} />
            <Route path="reports/outstanding" element={<Navigate to="/app/billing/reports" replace />} />
            <Route path="reports/deduction-analysis" element={<Navigate to="/app/billing/reports" replace />} />
            
            {/* Operations */}
            <Route path="operations" element={<Operations />} />
            <Route path="operations/expenses" element={<Operations />} />
            <Route path="operations/expenses/summary" element={<Operations />} />
            <Route path="operations/expenses/site-dashboard" element={<Operations />} />
            <Route path="operations/advances" element={<Operations />} />
            <Route path="operations/advances/approval" element={<Operations />} />
            <Route path="operations/advances/settlement" element={<Operations />} />
            <Route path="operations/advances/outstanding" element={<Operations />} />
            <Route path="operations/medical" element={<Operations />} />
            <Route path="operations/medical/due" element={<Operations />} />
            <Route path="operations/medical/centers" element={<Operations />} />
            <Route path="operations/medical/:id" element={<Operations />} />
            <Route path="operations/accommodation" element={<Operations />} />
            <Route path="operations/accommodation/rent-entry" element={<Operations />} />
            <Route path="operations/accommodation/dashboard" element={<Operations />} />
            <Route path="operations/accommodation/history" element={<Operations />} />
            <Route path="operations/accommodation/:id" element={<Operations />} />
            <Route path="operations/dahej-expenses" element={<Navigate to="/app/operations/dahej-expenses/register" replace />} />
            <Route path="operations/dahej-expenses/register" element={<Operations />} />
            <Route path="operations/dahej-expenses/dashboard" element={<Operations />} />
            <Route path="operations/dahej-expenses/monthly-register" element={<Operations />} />
            <Route path="operations/dahej-expenses/vehicle-master" element={<Operations />} />
            <Route path="operations/dahej-expenses/booking-locations" element={<Operations />} />
            <Route path="operations/dahej-expenses/reports" element={<Operations />} />
            <Route path="fire-tender-vehicle-management" element={<FireTenderVehicleManagement />} />
            
            {/* Projects */}
            <Route path="projects-management" element={<ProjectsManagement />} />
            <Route path="projects-billing" element={<ProjectsBilling />} />
            <Route path="projects/po" element={<ProjectsPoHub />} />
            <Route path="projects/po/po-entry" element={<ProjectsPoHub />} />
            <Route path="projects/po/contact-log" element={<ProjectsPoHub />} />
            <Route path="projects/enquiry" element={<ProjectsEnquiryHub />} />
            <Route path="projects/enquiry/enquiry-dashboard" element={<ProjectsEnquiryHub />} />
            <Route path="projects/enquiry/enquiry-entry" element={<ProjectsEnquiryHub />} />
            <Route path="projects/enquiry/enquiry-database" element={<ProjectsEnquiryHub />} />
            <Route path="projects/enquiry/enquiry-dropdown" element={<ProjectsEnquiryHub />} />
            
            {/* Procurement */}
            <Route path="procurement" element={<Procurement />} />
            
            {/* Fire Tender */}
            {/* Fire Tender Costing already exists above */}
            <Route path="fire-tender-manufacturing" element={<FireTenderManufacturing />} />
            
            {/* AMC Management */}
            <Route path="amc" element={<AMC />} />
            <Route path="amc/customers" element={<AMC />} />
            <Route path="amc/contracts" element={<AMC />} />
            <Route path="amc/sites" element={<AMC />} />
            <Route path="amc/assets" element={<AMC />} />
            <Route path="amc/pm-schedule" element={<AMC />} />
            <Route path="amc/complaints" element={<AMC />} />
            <Route path="amc/visits" element={<AMC />} />
            <Route path="amc/technicians" element={<AMC />} />
            <Route path="amc/service-reports" element={<AMC />} />
            <Route path="amc/alerts" element={<AMC />} />
            <Route path="amc/reports" element={<AMC />} />
            <Route path="amc/settings" element={<AMC />} />
            
            {/* Finance/Accounts */}
            <Route path="accounts-finance" element={<AccountsFinance />} />
            <Route path="accounts-finance/sites" element={<AccountsFinance />} />
            <Route path="accounts-finance/revenue-heads" element={<AccountsFinance />} />
            <Route path="accounts-finance/expense-heads" element={<AccountsFinance />} />
            <Route path="accounts-finance/budget-versions" element={<AccountsFinance />} />
            <Route path="accounts-finance/revenue" element={<AccountsFinance />} />
            <Route path="accounts-finance/expenses" element={<AccountsFinance />} />
            <Route path="accounts-finance/budget-vs-actual" element={<AccountsFinance />} />
            <Route path="accounts-finance/cost-allocation" element={<AccountsFinance />} />
            <Route path="accounts-finance/import-export" element={<AccountsFinance />} />
            <Route path="accounts-finance/reports" element={<AccountsFinance />} />
            <Route path="accounts-finance/reports/site-ledger" element={<AccountsFinance />} />
            <Route path="accounts-finance/settings" element={<AccountsFinance />} />

            {/* Indus LMS / Trainings */}
            <Route path="indus-lms-trainings" element={<IndusLmsTrainings />} />

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
            <Route path="marketing/reports-analytics" element={<MarketingReports />} />

            {/* Super Admin-only modules */}
            <Route path="user-management" element={<UserManagement />} />
            <Route path="software-subscriptions-reminders" element={<SoftwareSubscriptions />} />

            {/* Settings */}
            <Route path="settings" element={<Settings />} />





          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </Router>
        </AuditConsoleProvider>
      </AppAccessConfigProvider>
    </AuthProvider>
    </ConnectionGuard>
  );
}

export default App;
