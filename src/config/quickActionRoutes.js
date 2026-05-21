/**
 * ERP command-center quick actions → existing module routes (no flow changes).
 */
export const QUICK_ACTION_ROUTES = {
  "Add Employee": "/app/admin/employee/onboarding",
  "Create Enquiry": "/app/marketing/enquiry-master",
  "Generate Invoice": "/app/billing/create-invoice",
  "Create Gate Pass": "/app/gate-pass",
  "Issue Stock": "/app/admin/store/issue-entry",
  "Create Travel Request": "/app/admin/misc/tour-travel-details",
  "Add Project Task": "/app/projects-management",
  "Open Reports": "/app/admin/reports-analytics",
  "Open Alerts Center": "/app/admin/alerts-notifications",
};

export const ADMIN_OPS_QUICK_ACTIONS = [
  { label: "Employee onboarding", path: "/app/admin/employee/onboarding" },
  { label: "Daily attendance", path: "/app/admin/employee/attendance-daily" },
  { label: "Issue stock", path: "/app/admin/store/issue-entry" },
  { label: "Gate pass / movement", path: "/app/admin/gate/employee-movement" },
  { label: "Payroll dashboard", path: "/app/admin/payroll/dashboard" },
  { label: "Alerts", path: "/app/admin/alerts-notifications" },
];
