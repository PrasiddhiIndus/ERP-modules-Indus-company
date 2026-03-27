/** Sidebar groups for Admin Operations command center */

export const ADMIN_OPS_NAV = [
  {
    title: "Admin Operations",
    items: [{ label: "Dashboard", path: "dashboard" }],
  },
  {
    title: "Employee Administration",
    items: [
      { label: "Employee Master", path: "employee-master" },
      { label: "Onboarding", path: "employee-onboarding" },
      { label: "Attendance Inputs", path: "employee-attendance-inputs" },
      { label: "Leaves", path: "employee-leaves" },
      { label: "Permissions / Short Leave", path: "employee-permissions" },
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
      { label: "Alerts & Notifications", path: "alerts" },
      { label: "Reports & Analytics", path: "reports" },
      { label: "Settings / Masters", path: "settings" },
    ],
  },
];
