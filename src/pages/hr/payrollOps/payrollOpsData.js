/** Frontend-only sample data for HR Payroll. No API calls. */

export const DESIGNATIONS = [
  "DCPO",
  "Fire Watcher",
  "Security Supervisor",
  "Safety Officer",
  "Security Guard",
];

export const DEFAULT_COMPONENTS = [
  { id: "basic", label: "Earned Basic", type: "earning", editable: false },
  { id: "hra", label: "HRA @ 40%", type: "earning", editable: false },
  { id: "leave", label: "Leave Salary @ 5%", type: "earning", editable: false },
  { id: "other", label: "Other Allowance", type: "earning", editable: true },
  { id: "pf", label: "PF Amount", type: "deduction", editable: false },
  { id: "esi", label: "ESI @ 0.75%", type: "deduction", editable: false },
  { id: "ptax", label: "Professional Tax", type: "deduction", editable: true },
  { id: "loan", label: "Loan Recovery", type: "deduction", editable: true },
  { id: "lwf", label: "LWF", type: "deduction", editable: true },
  { id: "canteen", label: "Canteen Recovery", type: "deduction", editable: true },
];

export const INITIAL_SITES = [
  {
    id: "s1",
    name: "Sajjan India Ltd, Ankleshwar",
    ocNo: "S33/890",
    client: "Sajjan India Limited",
    location: "Ankleshwar, Gujarat",
    cycleDay: 4,
    status: "processed",
    sheets: ["Special Incentive – Fire Tender Maintenance Allow."],
    attendanceCycleStart: 26,
    attendanceCycleEnd: 25,
    expectedDisbursement: "2026-09-04",
  },
  {
    id: "s2",
    name: "GACL, Dahej",
    ocNo: "GC-114",
    client: "Gujarat Alkalies & Chemicals Ltd",
    location: "Dahej, Gujarat",
    cycleDay: 7,
    status: "pending",
    sheets: ["OT Sheet", "Conveyance Allowance"],
    attendanceCycleStart: 1,
    attendanceCycleEnd: 31,
    expectedDisbursement: "2026-09-07",
  },
  {
    id: "s3",
    name: "ONGC, Hazira",
    ocNo: "ONG-77",
    client: "Oil & Natural Gas Corporation",
    location: "Hazira, Surat",
    cycleDay: 2,
    status: "held",
    sheets: ["OT Sheet", "TPT Allowance", "Admin & Mobile Allowance"],
    attendanceCycleStart: 21,
    attendanceCycleEnd: 20,
    expectedDisbursement: "2026-09-02",
  },
  {
    id: "s4",
    name: "Reliance, Jamnagar",
    ocNo: "REL-221",
    client: "Reliance Industries Ltd",
    location: "Jamnagar, Gujarat",
    cycleDay: 5,
    status: "in-progress",
    sheets: ["OT Sheet", "TPT Allowance"],
    attendanceCycleStart: 16,
    attendanceCycleEnd: 15,
    expectedDisbursement: "2026-09-05",
  },
];

export function attendanceCycleLabel(s) {
  const ord = (n) =>
    n === 1
      ? "1st"
      : n === 2
        ? "2nd"
        : n === 3
          ? "3rd"
          : n === 21
            ? "21st"
            : n === 22
              ? "22nd"
              : n === 23
                ? "23rd"
                : n === 31
                  ? "31st"
                  : `${n}th`;
  return `${ord(s.attendanceCycleStart)} – ${ord(s.attendanceCycleEnd)} monthly`;
}

export function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function inr(n) {
  const v = Math.round(n || 0);
  return `₹${v.toLocaleString("en-IN")}`;
}

function mkEmp(code, name, acc, ifsc, desig, wd, rate, pDays, ot, extras = {}, meta = {}) {
  const basicRate = rate / (wd >= 27 ? 27 : 26);
  const totalDuty = pDays + ot;
  const earnedBasic = basicRate * pDays;
  const hra = earnedBasic * 0.4;
  const leave = earnedBasic * 0.05;
  const other = Math.max(rate - (earnedBasic + hra + leave), 0) + ot * (basicRate / 8) * 1.5;
  const gross = earnedBasic + hra + leave + other;
  const pf = Math.round(earnedBasic * 0.12);
  const esi = Math.round(gross * 0.0075);
  const ptax = gross > 21000 ? 200 : 0;
  const loan = extras.loan || 0;
  const lwf = extras.lwf || 0;
  const canteen = extras.canteen || 0;
  const held = extras.held || 0;
  const totalDed = pf + esi + ptax + loan + lwf + canteen + held;
  const net = gross - totalDed;
  return {
    code,
    name,
    acc,
    ifsc,
    desig,
    workingDays: wd,
    salaryRate: rate,
    basicRate: +basicRate.toFixed(2),
    pDays,
    wOffOt: ot,
    totalDuty,
    earnedBasic: +earnedBasic.toFixed(2),
    hra: +hra.toFixed(2),
    leave: +leave.toFixed(2),
    other: +other.toFixed(2),
    gross: +gross.toFixed(2),
    pf,
    esi,
    ptax,
    loan,
    lwf,
    canteen,
    held,
    totalDed: +totalDed.toFixed(2),
    net: +net.toFixed(2),
    ...meta,
  };
}

export function createInitialEmployees() {
  return {
    s1: [
      mkEmp(6380, "Gajanan Shankar Patil", "30759219471", "SBIN0017314", "DCPO", 27, 24500, 26, 4, { loan: 1552 }),
      mkEmp(7687, "Nima Subhash Pardeshi", "45460100011210", "BARB0KOSAMD", "DCPO", 27, 22500, 27, 4.5, { loan: 1312 }),
      mkEmp(9849, "Patil Girish Dagadu", "36506749175", "SBIN0015616", "DCPO", 27, 21100, 27, 5, { loan: 1544 }),
      mkEmp(9955, "Ajay Kumar Yadav", "20981122334", "HDFC0002211", "Security Supervisor", 27, 26800, 27, 2, {}),
    ],
    s2: [
      mkEmp(11021, "Ramesh Bhai Solanki", "50100223344", "SBIN0011122", "DCPO", 27, 23800, 27, 6, {}),
      mkEmp(11022, "Kiran Patel", "50100223399", "SBIN0011122", "Fire Watcher", 26, 18500, 25, 4, { lwf: 20 }, {
        dualDesignation: { site: "s4", siteName: "Reliance, Jamnagar", desig: "Security Supervisor", notedOn: "29 Aug 2026" },
      }),
      mkEmp(9902, "Sunil Ramesh Vaghela", "40501229981", "SBIN0004321", "Fire Watcher", 26, 18200, 26, 3, { canteen: 400 }, {
        transferred: { fromSite: "s1", fromSiteName: "Sajjan India Ltd, Ankleshwar", toSite: "s2", toSiteName: "GACL, Dahej", date: "18 Aug 2026" },
      }),
      mkEmp(11023, "Vijay Chauhan", "50100223400", "BARB0DAHEJ0", "Security Guard", 26, 16800, 26, 3, {}),
      mkEmp(11024, "Deepak Rathwa", "50100223411", "SBIN0011122", "Safety Officer", 27, 31500, 27, 2, { loan: 900 }),
    ],
    s3: [
      mkEmp(21031, "Suresh Nair", "60011223344", "SBIN0021144", "Security Supervisor", 27, 27200, 27, 3, {}),
      mkEmp(21032, "Farhan Sheikh", "60011223355", "ICIC0002211", "DCPO", 26, 24200, 24, 5, { held: 24200 }),
      mkEmp(21033, "Mahesh Jadeja", "60011223366", "SBIN0021144", "Fire Watcher", 26, 18000, 26, 2, {}),
    ],
    s4: [
      mkEmp(31041, "Anil Chavda", "70099887766", "HDFC0003344", "DCPO", 27, 25400, 27, 5, {}),
      mkEmp(31042, "Bhavesh Rana", "70099887777", "HDFC0003344", "Fire Watcher", 26, 18900, 25, 3, {}),
      mkEmp(31043, "Chetan Mori", "70099887788", "HDFC0003344", "Safety Officer", 27, 32000, 27, 1, {}),
      mkEmp(31044, "Dilip Vasava", "70099887799", "HDFC0003344", "Security Guard", 26, 17200, 26, 2, { canteen: 350 }),
    ],
  };
}

export const EMP_EXTRAS = {
  6380: {
    deductions: [{ label: "Loan Recovery", amount: 1552, month: "Jul 2026" }],
    loans: [{ amount: 20000, disbursed: "12 Feb 2026", emi: 1552, balance: 9312, status: "Active" }],
    advances: [{ amount: 3000, date: "02 Jun 2026", recovered: true }],
    warnings: [{ type: "Verbal Warning", reason: "Late reporting to site (3 instances)", date: "18 May 2026", issuedBy: "Site HR" }],
    suspensions: [],
  },
  7687: {
    deductions: [{ label: "Loan Recovery", amount: 1312, month: "Jul 2026" }],
    loans: [{ amount: 15000, disbursed: "05 Apr 2026", emi: 1312, balance: 6560, status: "Active" }],
    advances: [],
    warnings: [],
    suspensions: [],
  },
  21032: {
    deductions: [{ label: "Salary Held", amount: 24200, month: "Jul 2026" }],
    loans: [],
    advances: [{ amount: 5000, date: "20 Jun 2026", recovered: false }],
    warnings: [
      { type: "Written Warning", reason: "Found off-post during night shift patrol", date: "11 Jul 2026", issuedBy: "Client Site Manager" },
    ],
    suspensions: [{ from: "22 Jul 2026", to: "26 Jul 2026", reason: "Under client enquiry — off-post incident", status: "Completed" }],
  },
};

export const SALARY_HISTORY = {
  s1: [
    { month: "July", year: 2026, amount: 68455.63, processedOn: "04 Aug 2026", status: "Processed" },
    { month: "June", year: 2026, amount: 66210.4, processedOn: "05 Jul 2026", status: "Processed" },
    { month: "May", year: 2026, amount: 64890.1, processedOn: "04 Jun 2026", status: "Processed" },
    { month: "April", year: 2026, amount: 61120.75, processedOn: "05 May 2026", status: "Processed" },
    { month: "March", year: 2026, amount: 60540.2, processedOn: "04 Apr 2026", status: "Processed" },
  ],
  s2: [
    { month: "June", year: 2026, amount: 91240.0, processedOn: "08 Jul 2026", status: "Processed" },
    { month: "May", year: 2026, amount: 89870.5, processedOn: "07 Jun 2026", status: "Processed" },
    { month: "April", year: 2026, amount: 88210.0, processedOn: "07 May 2026", status: "Processed" },
  ],
  s3: [
    { month: "June", year: 2026, amount: 71340.0, processedOn: "03 Jul 2026", status: "Processed" },
    { month: "May", year: 2026, amount: 0, processedOn: "—", status: "Held" },
    { month: "April", year: 2026, amount: 69800.0, processedOn: "03 May 2026", status: "Processed" },
  ],
  s4: [
    { month: "June", year: 2026, amount: 121450.0, processedOn: "06 Jul 2026", status: "Processed" },
    { month: "May", year: 2026, amount: 118900.0, processedOn: "06 Jun 2026", status: "Processed" },
  ],
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const ATTENDANCE_SYNCED_AT = "04 Sep 2026, 09:12 AM";

export const COMPLIANCE = {
  s1: [
    { item: "PF (EPFO) monthly return", due: "2026-09-15", status: "Pending" },
    { item: "ESI monthly contribution", due: "2026-09-15", status: "Pending" },
    { item: "Professional Tax return", due: "2026-09-10", status: "Filed" },
    { item: "Labour Welfare Fund (LWF)", due: "2026-12-31", status: "Upcoming" },
    { item: "Contract Labour License renewal", due: "2027-01-27", status: "Upcoming" },
  ],
  s2: [
    { item: "PF (EPFO) monthly return", due: "2026-09-15", status: "Overdue" },
    { item: "ESI monthly contribution", due: "2026-09-15", status: "Pending" },
    { item: "Professional Tax return", due: "2026-09-10", status: "Filed" },
    { item: "Contract Labour License renewal", due: "2026-10-04", status: "Upcoming" },
  ],
  s3: [
    { item: "PF (EPFO) monthly return", due: "2026-09-15", status: "Pending" },
    { item: "ESI monthly contribution", due: "2026-08-15", status: "Overdue" },
    { item: "Professional Tax return", due: "2026-09-10", status: "Pending" },
  ],
  s4: [
    { item: "PF (EPFO) monthly return", due: "2026-09-15", status: "Filed" },
    { item: "ESI monthly contribution", due: "2026-09-15", status: "Filed" },
    { item: "Professional Tax return", due: "2026-09-10", status: "Pending" },
    { item: "Contract Labour License renewal", due: "2026-11-18", status: "Upcoming" },
  ],
};

export const EMP_COMPLIANCE_FLAGS = {
  21032: ["ESI number not mapped in attendance"],
  11024: ["UAN not linked to PF portal"],
};

export function buildNotifications(sites, employeesBySite) {
  const list = [];
  sites.forEach((s) => {
    if (s.status === "processed") return;
    const d = daysUntil(s.expectedDisbursement);
    if (d < 0) {
      list.push({
        id: `dis-${s.id}`,
        type: "disbursement",
        severity: "critical",
        siteId: s.id,
        message: `${s.name.split(",")[0]} salary is ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue for disbursement (expected ${s.expectedDisbursement}).`,
      });
    } else if (d <= 3) {
      list.push({
        id: `dis-${s.id}`,
        type: "disbursement",
        severity: "warning",
        siteId: s.id,
        message: `${s.name.split(",")[0]} salary is due for disbursement in ${d} day${d === 1 ? "" : "s"} (${s.expectedDisbursement}).`,
      });
    }
  });
  Object.values(employeesBySite || {}).flat().forEach((e) => {
    if (e.transferred) {
      list.push({
        id: `xfer-${e.code}`,
        type: "transfer",
        severity: "info",
        siteId: e.transferred.toSite,
        message: `${e.name} was moved from ${e.transferred.fromSiteName} to ${e.transferred.toSiteName} on ${e.transferred.date} — salary site updated.`,
      });
    }
    if (e.dualDesignation) {
      list.push({
        id: `dual-${e.code}`,
        type: "dual-designation",
        severity: "warning",
        siteId: e.dualDesignation.site,
        message: `${e.name} is recorded under two designations: current site vs. ${e.dualDesignation.desig} at ${e.dualDesignation.siteName} (noted ${e.dualDesignation.notedOn}).`,
      });
    }
  });
  Object.entries(COMPLIANCE).forEach(([siteId, rows]) => {
    const site = sites.find((s) => s.id === siteId);
    rows.forEach((r) => {
      if (r.status === "Overdue") {
        list.push({
          id: `comp-${siteId}-${r.item}`,
          type: "compliance",
          severity: "critical",
          siteId,
          message: `${site ? site.name.split(",")[0] : siteId}: ${r.item} is overdue (was due ${r.due}).`,
        });
      }
    });
  });
  const order = { critical: 0, warning: 1, info: 2 };
  return list.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function shortSiteName(site) {
  return String(site?.name || "").split(",")[0];
}

export function statusSeverity(status) {
  const s = String(status || "").toLowerCase();
  if (s === "processed" || s === "filed") return "info";
  if (s === "held" || s === "overdue") return "critical";
  if (s === "pending" || s === "in-progress" || s === "upcoming") return "warning";
  return "neutral";
}

export function statusLabel(status) {
  const map = {
    processed: "Processed",
    Processed: "Processed",
    "in-progress": "In progress",
    pending: "Not started",
    held: "Held",
    Held: "Held",
    Filed: "Filed",
    Overdue: "Overdue",
    Upcoming: "Upcoming",
    Pending: "Pending",
  };
  return map[status] || status;
}
