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
      // NAV_HIDDEN: Compliance & Documents
      // { label: "Compliance & Documents", path: "employee-compliance" },
      // NAV_HIDDEN: Salary Inputs
      // { label: "Salary Inputs", path: "employee-salary-inputs" },
      // NAV_HIDDEN: Exit & F&F
      // { label: "Exit & F&F", path: "employee-exit" },
      { label: "Salary Dashboard", path: "salary-admin/dashboard", salaryAdminOnly: true },
      { label: "Salary Components", path: "salary-admin/salary-components", salaryAdminOnly: true },
      { label: "Salary Processing", path: "salary-admin/salary-processing", salaryAdminOnly: true },
      { label: "Alerts & Notifications", path: "alerts" },
      { label: "Reports & Analytics", path: "reports" },
      // NAV_HIDDEN: Settings / Masters
      // { label: "Settings / Masters", path: "settings" },
    ],
  },
  // NAV_HIDDEN (Aug 2026): Store & Issue Control — entire section hidden
  // {
  //   title: "Store & Issue Control",
  //   items: [
  //     { label: "Item Master", path: "store-item-master" },
  //     { label: "Store Master", path: "store-master" },
  //     { label: "Site Stock", path: "store-site-stock" },
  //     { label: "Issue Entry", path: "store-issue" },
  //     { label: "Return Entry", path: "store-return" },
  //     { label: "Transfer / Transit", path: "store-transfer" },
  //     { label: "Requirement Planner", path: "store-planner" },
  //     { label: "Reconciliation", path: "store-reconciliation" },
  //   ],
  // },
  // NAV_HIDDEN (Aug 2026): Gate Pass & Movement — entire section hidden
  // {
  //   title: "Gate Pass & Movement",
  //   items: [
  //     { label: "Employee Movement", path: "gate-employee-movement" },
  //     { label: "Goods In / Out", path: "gate-goods" },
  //     { label: "Visitor / Guest Passes", path: "gate-visitors" },
  //     { label: "Vehicle Passes", path: "gate-vehicles" },
  //     { label: "Delivery / Courier / Post", path: "gate-delivery" },
  //     { label: "Security Console", path: "gate-security" },
  //   ],
  // },
  // NAV_HIDDEN (Aug 2026): Miscellaneous Admin
  // {
  //   title: "Miscellaneous Admin",
  //   items: [
  //     { label: "Events Coordination", path: "misc-events" },
  //     { label: "Tour / Travel", path: "misc-travel" },
  //     { label: "Admin Tasks / Requests", path: "misc-tasks" },
  //   ],
  // },
];
