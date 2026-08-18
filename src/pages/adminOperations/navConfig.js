/** Sidebar groups for Admin Operations command center */

export const ADMIN_OPS_NAV = [
  {
    title: "Admin Operations",
    flat: true,
    items: [
      { label: "Dashboard", path: "dashboard" },
      { label: "Employee Master", path: "employee-master" },
      // NAV_HIDDEN (Aug 2026): Onboarding — re-enable when ready
      // { label: "Onboarding", path: "employee-onboarding" },
      { label: "Raw Attendance Data", path: "employee-attendance-inputs" },
      { label: "Daily Attendance Register", path: "employee-attendance-daily" },
      { label: "National / Public Holidays", path: "employee-national-holidays" },
      // NAV_HIDDEN: Attendance Sheets
      // { label: "Attendance Sheets", path: "employee-attendance-sheets" },
      { label: "Leaves", path: "employee-leaves" },
      { label: "Permissions / Short Leave", path: "employee-permissions" },
<<<<<<< Updated upstream
      // NAV_HIDDEN: Compliance & Documents
      // { label: "Compliance & Documents", path: "employee-compliance" },
      // NAV_HIDDEN: Salary Inputs
      // { label: "Salary Inputs", path: "employee-salary-inputs" },
      // NAV_HIDDEN: Exit & F&F
      // { label: "Exit & F&F", path: "employee-exit" },
=======
      { label: "Compliance & Documents", path: "employee-compliance" },
      { label: "Salary Inputs", path: "employee-salary-inputs" },
      { label: "Exit & F&F", path: "employee-exit" },
    ],
  },
  {
    title: "Store & Issue Control",
    items: [
      { label: "Item Master", path: "store-item-master" },
      { label: "Store Master", path: "store-master" },
      { label: "Site Stock", path: "store-site-stock" },
      { label: "Issue Entry", path: "store-issue" },
      { label: "Return Entry", path: "store-return" },
      { label: "Transfer / Transit", path: "store-transfer" },
      { label: "Requirement Planner", path: "store-planner" },
      { label: "Reconciliation", path: "store-reconciliation" },
    ],
  },
  {
    title: "Gate Pass & Movement",
    items: [
      { label: "Employee Movement", path: "gate-employee-movement" },
      { label: "Goods In / Out", path: "gate-goods" },
      { label: "Visitor / Guest Passes", path: "gate-visitors" },
      { label: "Vehicle Passes", path: "gate-vehicles" },
      { label: "Delivery / Courier / Post", path: "gate-delivery" },
      { label: "Security Console", path: "gate-security" },
    ],
  },
  {
    title: "Salary Admin",
    /** Nav filtered client-side to salaryAccess allowlist emails only. */
    salaryAdminOnly: true,
    items: [
      { label: "Dashboard", path: "salary-admin/dashboard" },
      { label: "Salary Master", path: "salary-admin/salary-master" },
      { label: "Salary Components", path: "salary-admin/salary-components" },
      { label: "Salary Processing", path: "salary-admin/salary-processing" },
    ],
  },
  {
    title: "Miscellaneous Admin",
    items: [
      { label: "Events Coordination", path: "misc-events" },
      { label: "Tour / Travel", path: "misc-travel" },
      { label: "Admin Tasks / Requests", path: "misc-tasks" },
    ],
  },
  {
    title: "Intelligence",
    items: [
>>>>>>> Stashed changes
      { label: "Alerts & Notifications", path: "alerts" },
      { label: "Reports & Analytics", path: "reports" },
      // Single entry — modules switch on the Salary Admin page itself
      { label: "Salary Admin", path: "salary-admin/dashboard", salaryAdminOnly: true },
      // NAV_HIDDEN: Settings / Masters
      // { label: "Settings / Masters", path: "settings" },
    ],
  },
];
