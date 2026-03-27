export const headerMeta = {
  title: "ERP Command Center",
  businessPeriod: "Q1 FY 2025-26",
  today: "Wed, Mar 25, 2026",
  companies: ["All", "IFSPL", "IEVPL"],
};

export const executiveSummary = [
  { id: "pri", label: "Today's priorities", value: 26, tone: "bg-blue-50 text-blue-800 border-blue-200" },
  { id: "crit", label: "Critical alerts", value: 7, tone: "bg-red-50 text-red-800 border-red-200" },
  { id: "appr", label: "Pending approvals", value: 31, tone: "bg-amber-50 text-amber-900 border-amber-200" },
  { id: "attn", label: "Departments need attention", value: 5, tone: "bg-purple-50 text-purple-900 border-purple-200" },
];

export const enterpriseKpis = [
  { id: "emp", label: "Total Active Employees", value: "1,248", sub: "Across IFSPL + IEVPL", trend: "+2.1%" },
  { id: "site", label: "Active Sites / Projects", value: "64", sub: "Operational footprint", trend: "+3" },
  { id: "approval", label: "Pending Approvals", value: "31", sub: "Cross-module queue", trend: "-4" },
  { id: "alerts", label: "Critical Alerts", value: "7", sub: "Need immediate action", trend: "+1" },
  { id: "tasks", label: "Open Action Items", value: "118", sub: "Assigned to teams", trend: "+8" },
  { id: "billing", label: "Billing In Progress", value: "₹4.2Cr", sub: "Cycle this month", trend: "+9%" },
  { id: "compliance", label: "Compliance Due", value: "19", sub: "Due within 7 days", trend: "-2" },
  { id: "store", label: "Store Shortages", value: "11", sub: "Sites below threshold", trend: "+2" },
  { id: "gate", label: "Open Movement Exceptions", value: "6", sub: "Gate anomalies", trend: "flat" },
  { id: "pipeline", label: "Revenue Pipeline", value: "₹18.6Cr", sub: "Commercial + Marketing", trend: "+6%" },
];

export const moduleHealth = [
  { module: "HR", health: "Stable", score: 84, pending: 12, alerts: 2, summary: "Leave + attendance validations pending" },
  { module: "Compliance", health: "Watch", score: 71, pending: 9, alerts: 5, summary: "Expiring docs and overdue closures" },
  { module: "Admin", health: "Watch", score: 75, pending: 8, alerts: 3, summary: "Stock return + movement closures" },
  { module: "Commercial", health: "Stable", score: 81, pending: 7, alerts: 1, summary: "Contract follow-ups aging" },
  { module: "Marketing", health: "Attention", score: 67, pending: 14, alerts: 2, summary: "Hot leads waiting response" },
  { module: "Billing", health: "Watch", score: 73, pending: 14, alerts: 4, summary: "IRN / invoice cycle bottlenecks" },
  { module: "Operations", health: "Stable", score: 79, pending: 10, alerts: 3, summary: "Site shortages and shift gaps" },
  { module: "Projects", health: "Attention", score: 69, pending: 11, alerts: 4, summary: "Milestone slippages and mobilization gaps" },
];

export const priorityActions = [
  { id: "a1", module: "HR", title: "Attendance corrections pending validation", count: 11, severity: "high", due: "Due today" },
  { id: "a2", module: "Compliance", title: "ESIC / statutory documents expiring", count: 5, severity: "critical", due: "Overdue" },
  { id: "a3", module: "Admin", title: "Site PPE shortage requires dispatch", count: 3, severity: "critical", due: "Due today" },
  { id: "a4", module: "Billing", title: "Invoices pending IRN generation", count: 9, severity: "high", due: "Due today" },
  { id: "a5", module: "Operations", title: "Gate pass not closed within SLA", count: 4, severity: "high", due: "Overdue" },
  { id: "a6", module: "Projects", title: "Mobilization tasks pending kickoff", count: 4, severity: "warning", due: "Due today" },
  { id: "a7", module: "Marketing", title: "High-value enquiry needs response", count: 2, severity: "warning", due: "Due in 4h" },
];

export const trends = [
  { id: "headcount", title: "Headcount Trend (30d)", values: [78, 80, 82, 84, 83, 85, 86] },
  { id: "approvals", title: "Approvals Trend (7d)", values: [42, 51, 49, 44, 39, 36, 31] },
  { id: "billing", title: "Billing Progress (30d)", values: [32, 36, 40, 45, 41, 47, 52] },
  { id: "enquiry", title: "Enquiry Pipeline (30d)", values: [55, 58, 61, 57, 63, 66, 70] },
  { id: "store", title: "Stock Issue/Return Trend", values: [40, 36, 32, 35, 38, 34, 30] },
  { id: "gate", title: "Gate Movement Exceptions", values: [8, 7, 9, 8, 6, 7, 6] },
];

export const snapshots = [
  { module: "HR", rows: [["Active employees", "1,248"], ["Leave pending", "12"], ["Attendance issues", "11"], ["Exits in progress", "5"], ["Onboarding pending", "14"]] },
  { module: "Compliance", rows: [["Expiring docs", "9"], ["Overdue actions", "5"], ["High-risk items", "3"], ["Audit-sensitive", "7"]] },
  { module: "Admin", rows: [["Site shortages", "11"], ["Gate exceptions", "6"], ["Employee admin issues", "8"], ["Pending returns/transit", "40"], ["Tasks due", "17"]] },
  { module: "Commercial", rows: [["Proposals under review", "12"], ["Contracts pending", "7"], ["Follow-ups", "18"]] },
  { module: "Marketing", rows: [["Active enquiries", "43"], ["Hot leads", "9"], ["Aging leads", "12"], ["Quotation pending", "8"]] },
  { module: "Billing", rows: [["Invoices generated", "126"], ["E-invoice pending", "14"], ["Payment follow-up", "27"], ["Billing delays", "6"]] },
  { module: "Operations", rows: [["Manpower shortages", "4"], ["Site issues", "9"], ["Shift exceptions", "6"], ["Escalations", "3"]] },
  { module: "Projects", rows: [["Active projects", "21"], ["Delayed milestones", "4"], ["Mobilization issues", "4"], ["Task exceptions", "11"]] },
];

export const criticalAlerts = [
  { id: "c1", severity: "critical", module: "Compliance", title: "Statutory deadline missed", record: "CMP-8821", age: "1d overdue" },
  { id: "c2", severity: "critical", module: "Admin", title: "Site shortage: Helmet stock critical", record: "STK-SA-221", age: "6h" },
  { id: "c3", severity: "high", module: "Billing", title: "IRN generation failure", record: "INV-12911", age: "3h" },
  { id: "c4", severity: "high", module: "Projects", title: "Milestone slippage warning", record: "PRJ-ALPHA-04", age: "8h" },
  { id: "c5", severity: "normal", module: "Operations", title: "Gate movement anomaly", record: "GP-9002", age: "2h" },
];

export const pendingApprovals = [
  { id: "p1", type: "Leave Approval", module: "HR", requester: "A. Verma", site: "Plant Alpha", age: "9h", status: "Pending" },
  { id: "p2", type: "Gate Pass", module: "Admin", requester: "Security Desk", site: "HO", age: "5h", status: "Pending" },
  { id: "p3", type: "Stock Issue", module: "Admin", requester: "Store Keeper", site: "Depot Bravo", age: "12h", status: "Pending" },
  { id: "p4", type: "Travel Request", module: "Admin", requester: "N. Kulkarni", site: "HO", age: "6h", status: "Pending" },
  { id: "p5", type: "Quotation Approval", module: "Commercial", requester: "Sales Team", site: "West Zone", age: "1d", status: "Escalated" },
];

export const recentActivity = [
  { id: "r1", time: "10:42", module: "Admin", text: "Stock issued to Site Alpha", record: "IS-9901" },
  { id: "r2", time: "10:18", module: "Billing", text: "Invoice generated and shared", record: "INV-12991" },
  { id: "r3", time: "09:55", module: "HR", text: "Employee onboarding moved to active", record: "EMP-2288" },
  { id: "r4", time: "09:21", module: "Projects", text: "Milestone M3 marked complete", record: "PRJ-DELTA" },
  { id: "r5", time: "08:58", module: "Compliance", text: "Compliance action closed", record: "CMP-8771" },
];

export const quickActions = [
  "Add Employee",
  "Create Enquiry",
  "Generate Invoice",
  "Create Gate Pass",
  "Issue Stock",
  "Create Travel Request",
  "Add Project Task",
  "Open Reports",
  "Open Alerts Center",
];

export const managementInsights = [
  "Top attention: Compliance SLA + Billing IRN queue",
  "Most delayed workflow: Stock return closure (avg 2.3 days)",
  "Most burdened module today: Admin (40 open actions)",
  "Highest-risk location: Plant Alpha (stock + gate anomalies)",
  "Approvals aging > 24h: 6 requests across 4 modules",
];
