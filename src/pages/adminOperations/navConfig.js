/** Sidebar groups for Admin Operations command center */

export const ADMIN_OPS_NAV = [
  {
    title: "Admin Operations",
    flat: true,
    items: [
      { label: "Dashboard", path: "dashboard" },
      { label: "Recruitment", path: "recruitment" },
      { label: "Employee Master", path: "employee-master" },
      { label: "Onboarding", path: "employee-onboarding" },
      { label: "Policies & Terms", path: "employee-policies" },
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
      { label: "F & F", path: "employee-exit" },
      { label: "Alerts & Notifications", path: "alerts" },
      { label: "Reports & Analytics", path: "reports" },
      // Single entry — modules switch on the Salary Admin page itself
      { label: "Salary Admin", path: "salary-admin/dashboard", salaryAdminOnly: true },
      // NAV_HIDDEN: Settings / Masters
      // { label: "Settings / Masters", path: "settings" },
    ],
  },
];
