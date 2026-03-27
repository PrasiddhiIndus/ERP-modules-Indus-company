/** Mock domain data for Admin Operations (frontend-only; API-ready shapes). */

export const companies = ["IFSPL", "IEVPL"];

export const mockEmployees = [
  {
    id: "e1",
    code: "IFS-10482",
    name: "Amit Verma",
    company: "IFSPL",
    department: "Fire Ops",
    designation: "Site Supervisor",
    manager: "R. Mehta",
    joiningDate: "2021-04-12",
    status: "Active",
    salaryBand: "L3 / Structure B",
    compliance: "Gap: ESIC nominee",
    phone: "+91 98xxx 11220",
    email: "amit.verma@ifspl.example",
  },
  {
    id: "e2",
    code: "IEV-22011",
    name: "Neha Kulkarni",
    company: "IEVPL",
    department: "Admin",
    designation: "Executive – Admin",
    manager: "S. Patil",
    joiningDate: "2024-11-01",
    status: "Probation",
    salaryBand: "L2 / Structure A",
    compliance: "Complete",
    phone: "+91 90xxx 88331",
    email: "neha.k@ievpl.example",
  },
  {
    id: "e3",
    code: "IFS-08991",
    name: "Ravi Nair",
    company: "IFSPL",
    department: "Manufacturing",
    designation: "Technician",
    manager: "Plant Manager",
    joiningDate: "2019-08-19",
    status: "Exit – Notice",
    salaryBand: "L2 / Structure B",
    compliance: "Bank re-KYC pending",
    phone: "+91 88xxx 44102",
    email: "ravi.nair@ifspl.example",
  },
];

export const mockOnboarding = [
  { id: "ob1", name: "Karan Shah", company: "IFSPL", stage: "Documents", pct: 45, pending: "PF, Medical", activation: false },
  { id: "ob2", name: "Priya Das", company: "IEVPL", stage: "Salary setup", pct: 72, pending: "Structure approval", activation: false },
];

export const mockLeaveRequests = [
  {
    id: "lv1",
    emp: "Amit Verma",
    type: "Casual",
    from: "2025-03-28",
    to: "2025-03-29",
    mgr: "Approved",
    admin: "Pending validation",
    attendanceImpact: "2 days absent",
    payrollImpact: null,
  },
  {
    id: "lv2",
    emp: "Neha Kulkarni",
    type: "Unpaid",
    from: "2025-04-02",
    to: "2025-04-02",
    mgr: "Approved",
    admin: "Pending",
    attendanceImpact: "1 day LOP",
    payrollImpact: "LOP",
  },
];

export const mockPermissions = [
  { id: "p1", emp: "Amit Verma", kind: "Early exit", hrs: "1.5h", mgr: "Approved", admin: "OK", date: "2025-03-25" },
  { id: "p2", emp: "Ravi Nair", kind: "Late arrival", hrs: "0.5h", mgr: "Pending", admin: "-", date: "2025-03-25" },
];

export const mockComplianceRows = [
  { id: "c1", emp: "Amit Verma", aadhaar: "OK", pan: "OK", bank: "OK", pf: "OK", esic: "Missing", uan: "OK", nominee: "Missing" },
  { id: "c2", emp: "Neha Kulkarni", aadhaar: "OK", pan: "OK", bank: "OK", pf: "Pending", esic: "NA", uan: "Pending", nominee: "OK" },
];

export const mockSalaryInputs = [
  { id: "s1", emp: "Amit Verma", month: "2025-03", unpaidLeave: 0, corrections: 1, joinAdj: 0, deductions: 0, advanceRec: 500, remarks: "Attendance correction Mar-12" },
  { id: "s2", emp: "Ravi Nair", month: "2025-03", unpaidLeave: 2, corrections: 0, joinAdj: 0, deductions: 1200, advanceRec: 0, remarks: "Notice period recovery" },
];

export const mockExits = [
  {
    id: "x1",
    emp: "Ravi Nair",
    resignDate: "2025-02-10",
    notice: "60d",
    lwd: "2025-04-10",
    clearance: "Store: 1 PPE pending",
    gate: "Closure scheduled",
    fnf: "Blocked – assets",
  },
];

export const mockStoreItems = [
  { id: "i1", code: "PPE-SET", name: "PPE Set", category: "PPE", uom: "set", type: "Returnable", annual: true, defQty: 2, reorder: 120, active: true },
  { id: "i2", code: "HELM-01", name: "Safety Helmet", category: "Safety", uom: "nos", type: "Semi-returnable", annual: true, defQty: 1, reorder: 80, active: true },
  { id: "i3", code: "GLV-N", name: "Nitrile Gloves", category: "PPE", uom: "pair", type: "Consumable", annual: true, defQty: 24, reorder: 400, active: true },
];

export const mockStores = [
  { id: "st1", code: "STR-CEN", name: "Central Main", type: "Main", site: "-", location: "HO", incharge: "Store Admin", active: true },
  { id: "st2", code: "STR-SA", name: "Site Alpha Store", type: "Site", site: "Plant Alpha", location: "Pune", incharge: "J. Khan", active: true },
];

export const mockSiteStock = [
  { id: "ss1", site: "Plant Alpha", store: "STR-SA", personnel: 52, item: "PPE Set", entitled: 104, issued: 96, returned: 8, balance: 40, shortage: 0, excess: 0 },
  { id: "ss2", site: "Plant Alpha", store: "STR-SA", personnel: 52, item: "Helmet", entitled: 52, issued: 48, returned: 3, balance: 12, shortage: 1, excess: 0 },
  { id: "ss3", site: "Depot Bravo", store: "STR-DB", personnel: 80, item: "PPE Set", entitled: 160, issued: 140, returned: 10, balance: 55, shortage: 5, excess: 0 },
];

export const mockTransfers = [
  { id: "t1", from: "STR-CEN", to: "STR-SA", status: "In transit", dispatched: "2025-03-24 09:10", eta: "2025-03-24 18:00", disc: false, lines: "PPE Set × 20" },
  { id: "t2", from: "STR-SA", to: "STR-CEN", status: "Received", dispatched: "2025-03-20", eta: "-", disc: true, lines: "Helmet × 5 (1 short)" },
];

export const mockGateEmployeeMoves = [
  { id: "g1", emp: "Amit Verma", reason: "Client visit", dest: "MIDC Bhosari", expReturn: "17:30", mgr: "Approved", sec: "Verified", out: "14:02", inn: null, status: "Outside" },
  { id: "g2", emp: "Neha Kulkarni", reason: "Bank work", dest: "SBI Camp", expReturn: "13:00", mgr: "Approved", sec: "Verified", out: "11:10", inn: "12:40", status: "Closed" },
];

export const mockVisitors = [
  { id: "v1", name: "Vendor – ABC Safety", host: "Store Admin", idType: "GSTIN", exp: "2h", in: "10:05", out: null, status: "Inside" },
  { id: "v2", name: "Auditor – Deloitte", host: "CFO", idType: "PAN", exp: "4h", in: "09:00", out: "13:10", status: "Closed" },
];

export const mockVehicles = [
  { id: "vh1", reg: "MH-12-AB-1022", type: "Delivery", driver: "Transporter", linked: "Transfer t1", in: "08:40", out: null, status: "Inside" },
  { id: "vh2", reg: "MH-14-CD-8891", type: "Employee", driver: "Self", linked: "-", in: "09:15", out: "18:02", status: "Closed" },
];

export const mockDeliveries = [
  { id: "d1", kind: "Courier in", carrier: "BlueDart", ref: "BD882991", recvBy: "Reception", status: "Pending pickup", item: "Documents – HR" },
  { id: "d2", kind: "E-comm", carrier: "Amazon", ref: "AMZ-22109", recvBy: "Admin", status: "Handed over", item: "IT accessory" },
];

export const mockEvents = [
  { id: "ev1", name: "Fire drill – Alpha", date: "2025-03-27", venue: "Plant Alpha", coord: "HSE", status: "Planned", tasks: "PPE check, muster" },
  { id: "ev2", name: "Townhall Q1", date: "2025-04-05", venue: "HO Auditorium", coord: "Admin", status: "Draft", tasks: "Travel blocks" },
];

export const mockTravel = [
  { id: "tr1", emp: "Amit Verma", dest: "Nagpur", purpose: "Shutdown support", from: "2025-04-01", to: "2025-04-04", status: "Pending approval", advance: "₹12,000" },
  { id: "tr2", emp: "Neha Kulkarni", dest: "Mumbai", purpose: "Vendor meet", from: "2025-03-26", to: "2025-03-26", status: "Approved", advance: "-" },
];

export const mockAdminTasks = [
  { id: "at1", title: "Meeting room + VC – Client X", assignee: "Admin A", due: "2025-03-26", status: "Open", type: "Meeting" },
  { id: "at2", title: "Guest house booking – audit team", assignee: "Admin B", due: "2025-03-28", status: "In progress", type: "Accommodation" },
];

export const mockAlerts = [
  { id: "a1", tab: "employee", severity: "warning", title: "Leave pending admin validation", due: "Today", link: "Leaves", assign: "Admin Lead" },
  { id: "a2", tab: "store", severity: "high", title: "Site shortage: Helmets @ Alpha", due: "Today", link: "Site Stock", assign: "Store Manager" },
  { id: "a3", tab: "gate", severity: "critical", title: "Employee outside beyond expected return", due: "Overdue", link: "Employee Movement", assign: "Security" },
  { id: "a4", tab: "compliance", severity: "warning", title: "ESIC nominee missing – 4 employees", due: "This week", link: "Compliance", assign: "HR-Admin" },
  { id: "a5", tab: "misc", severity: "info", title: "Townhall logistics not confirmed", due: "Apr 5", link: "Events", assign: "Admin" },
  { id: "a6", tab: "overdue", severity: "critical", title: "Transit not received – STR-CEN → SA", due: "2d overdue", link: "Transfer", assign: "Ops" },
];

export const mockActivity = [
  { t: "10:42", msg: "Gate pass GP-9921 verified (Goods out – repair)", user: "Security-1" },
  { t: "10:18", msg: "Leave LV-441 validated → attendance impact posted", user: "Admin B" },
  { t: "09:55", msg: "Reconciliation REC-SA-03 approved (+2 helmet variance)", user: "Store Manager" },
  { t: "09:12", msg: "Employee movement EM-221 closed (Neha K.)", user: "Security-2" },
];

export const mockPriorities = [
  { id: "pr1", label: "Validate 6 leave requests before payroll lock", owner: "Admin", due: "Today 16:00" },
  { id: "pr2", label: "Close transit discrepancy t2 line items", owner: "Store", due: "Today" },
  { id: "pr3", label: "F&F asset recovery – Ravi Nair (PPE set)", owner: "Admin + Store", due: "This week" },
];

export const mockPlannerRows = [
  { id: "pl1", site: "Plant Alpha", personnel: 52, item: "PPE Set", entitledY: 104, issuedY: 96, stock: 40, shortage: 12, recDispatch: "Central → 20 nos" },
  { id: "pl2", site: "Depot Bravo", personnel: 80, item: "PPE Set", entitledY: 160, issuedY: 140, stock: 55, shortage: 25, recDispatch: "Central → 40 nos" },
];

export const mockReconciliation = [
  { id: "r1", site: "Plant Alpha", item: "Helmet", sys: 48, phys: 47, var: -1, reason: "Damaged write-off", approval: "Pending" },
  { id: "r2", site: "Central", item: "Gloves", sys: 1000, phys: 1002, var: 2, reason: "GRN lag", approval: "Approved" },
];
