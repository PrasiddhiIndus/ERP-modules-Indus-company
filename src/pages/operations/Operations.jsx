import React from "react";
import { Bell } from "lucide-react";
import { OperationsProvider, useOperations } from "./contexts/OperationsContext";
import { getOperationsPageFromPath } from "./navConfig";
import {
  GlobalSearchBar,
  NotificationPanel,
  ThemeToggle,
  useThemeClasses,
} from "./components/OperationsUi";

import Dashboard from "./pages/Dashboard";
import ExpenseList from "./pages/expenses/ExpenseList";
import ExpenseMonthlySummary from "./pages/expenses/ExpenseMonthlySummary";
import ExpenseSiteDashboard from "./pages/expenses/ExpenseSiteDashboard";
import AdvanceList from "./pages/advances/AdvanceList";
import AdvanceApproval from "./pages/advances/AdvanceApproval";
import AdvanceSettlement from "./pages/advances/AdvanceSettlement";
import AdvanceOutstandingDashboard from "./pages/advances/AdvanceOutstandingDashboard";
import PmeTracker from "./pages/medical/PmeTracker";
import PmeDueDashboard from "./pages/medical/PmeDueDashboard";
import MedicalRecordDetails from "./pages/medical/MedicalRecordDetails";
import MedicalCenterSelect from "./pages/medical/MedicalCenterSelect";
import PropertyList from "./pages/accommodation/PropertyList";
import PropertyDetails from "./pages/accommodation/PropertyDetails";
import RentPaymentEntry from "./pages/accommodation/RentPaymentEntry";
import RentMonthlyDashboard from "./pages/accommodation/RentMonthlyDashboard";
import RentPaymentHistory from "./pages/accommodation/RentPaymentHistory";
import DahejExpensesHub from "./dahej/pages/DahejExpensesHub";
import { useLocation } from "react-router-dom";

const PAGE_MAP = {
  dashboard: Dashboard,
  expenses: ExpenseList,
  "expense-summary": ExpenseMonthlySummary,
  "expense-site-dashboard": ExpenseSiteDashboard,
  advances: AdvanceList,
  "advance-approval": AdvanceApproval,
  "advance-settlement": AdvanceSettlement,
  "advance-outstanding": AdvanceOutstandingDashboard,
  "pme-tracker": PmeTracker,
  "pme-due": PmeDueDashboard,
  "medical-record": MedicalRecordDetails,
  "medical-centers": MedicalCenterSelect,
  properties: PropertyList,
  "property-details": PropertyDetails,
  "rent-entry": RentPaymentEntry,
  "rent-dashboard": RentMonthlyDashboard,
  "rent-history": RentPaymentHistory,
  "dahej-expenses": DahejExpensesHub,
};

function OperationsShell() {
  const location = useLocation();
  const {
    theme,
    toggleTheme,
    globalSearch,
    setGlobalSearch,
    notificationsOpen,
    setNotificationsOpen,
    data,
    markNotificationRead,
    markAllNotificationsRead,
    unreadCount,
    navigateTo,
  } = useOperations();

  const t = useThemeClasses(theme);
  const activePageId = getOperationsPageFromPath(location.pathname);
  const ActivePage = PAGE_MAP[activePageId] || Dashboard;

  const handleGlobalSearch = (q) => {
    setGlobalSearch(q);
    if (!q.trim()) return;
    const lower = q.toLowerCase();
    const expense = data?.expenses?.find((e) => e.expense_no.toLowerCase().includes(lower));
    if (expense) { navigateTo("expenses"); return; }
    const advance = data?.advances?.find((a) => a.request_no.toLowerCase().includes(lower));
    if (advance) { navigateTo("advances"); return; }
    const emp = data?.employees?.find((e) => e.name.toLowerCase().includes(lower) || e.employeeCode.includes(lower));
    if (emp) { navigateTo("medical-record", { id: emp.id, name: emp.name }); return; }
    const site = data?.sites?.find((s) => s.site_name.toLowerCase().includes(lower) || s.site_code.toLowerCase().includes(lower));
    if (site) { navigateTo("expense-site-dashboard"); }
  };

  return (
    <div className={`min-h-full flex flex-col ${t.shell}`}>
      <header className={`sticky top-0 z-20 border-b shadow-sm ${t.header}`}>
        <div className="px-3 sm:px-4 py-2 flex items-center gap-2">
          <GlobalSearchBar
            value={globalSearch}
            onChange={handleGlobalSearch}
            onClear={() => setGlobalSearch("")}
            theme={theme}
          />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            type="button"
            onClick={() => setNotificationsOpen(true)}
            className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg border ${t.dark ? "border-slate-600" : "border-gray-300"}`}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 px-3 sm:px-4 py-4 max-w-[1600px] w-full mx-auto overflow-x-hidden">
        <ActivePage />
      </main>

      <NotificationPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={data?.notifications || []}
        onMarkRead={markNotificationRead}
        onMarkAllRead={markAllNotificationsRead}
        theme={theme}
      />
    </div>
  );
}

export default function Operations() {
  return (
    <OperationsProvider>
      <OperationsShell />
    </OperationsProvider>
  );
}
