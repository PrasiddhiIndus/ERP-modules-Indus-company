import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import * as XLSX from "xlsx";
import {
  LayoutDashboard, Building2, ClipboardList, History as HistoryIcon,
  BarChart3, Settings2, Plus, X, GripVertical, Search, ChevronDown,
  ChevronRight, Calendar, Download, Pause, Play, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, TrendingDown, ArrowLeft, Save,
  IndianRupee, Menu, FileWarning, Wallet, Landmark, ShieldAlert,
  UserRound, ChevronLeft, Trash2, PencilLine, FolderPlus, FileSpreadsheet,
  MapPin, PauseCircle, Bell, RefreshCw, ArrowRightLeft, Columns3,
  FunctionSquare, ClipboardCheck, Info, Zap, CalendarClock, Repeat,
} from "lucide-react";

/* ============================================================================
   DESIGN TOKENS
   Fire & safety contract-workforce payroll back office. Industrial /
   operations tone: steel-navy chrome, safety-amber for primary action,
   signal red/green for held/processed states. Condensed grotesque for
   numerals & headings (site-signage feel), workhorse sans for body copy.
=========================================================================== */
const C = {
  bg: "#EEF1F0",
  panel: "#FFFFFF",
  panelAlt: "#F6F8F7",
  ink: "#131C24",
  inkSoft: "#5B6B74",
  inkFaint: "#8B99A1",
  border: "#DEE4E3",
  borderStrong: "#C4CDCB",
  navy: "#0E1B2B",
  navySoft: "#1B3049",
  navyLine: "#28405C",
  amber: "#E2A020",
  amberDeep: "#B87A11",
  amberInk: "#221703",
  red: "#C63B33",
  redSoft: "#FBEAE8",
  green: "#1D7A5F",
  greenSoft: "#E7F4EF",
  blue: "#2C6E8F",
  blueSoft: "#EAF3F7",
  violet: "#6E5A96",
  violetSoft: "#EFEBF5",
};

const FONT_STACK = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
:root{ --font-body: 'Inter', system-ui, sans-serif; --font-head: 'Barlow Condensed', system-ui, sans-serif; }
* { box-sizing: border-box; }
.hrsm-root { font-family: var(--font-body); color: ${C.ink}; }
.hrsm-head { font-family: var(--font-head); letter-spacing: 0.01em; }
.hrsm-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
.hrsm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.hrsm-scroll::-webkit-scrollbar-thumb { background: ${C.borderStrong}; border-radius: 4px; }
.hrsm-scroll::-webkit-scrollbar-track { background: transparent; }
.hrsm-row-drag.dragging { opacity: 0.4; }
.hrsm-focus:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 1px; }
/* No spinner arrows on numeric cells — auto-fetched values, edit by typing/backspacing */
input[type=number] { -moz-appearance: textfield; }
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.hrsm-card-hover { transition: box-shadow 0.15s ease, border-color 0.15s ease, transform 0.15s ease; }
.hrsm-card-hover:hover { box-shadow: 0 4px 14px rgba(14,27,43,0.08); transform: translateY(-1px); }
.hrsm-pulse { animation: hrsm-pulse 2s ease-in-out infinite; }
@keyframes hrsm-pulse { 0%,100%{ opacity:1; } 50%{ opacity:0.45; } }
`;

/* ============================================================================
   MOCK DATA — modeled on the uploaded Sajjan India Ltd, Ankleshwar sheet
=========================================================================== */

const DESIGNATIONS = ["DCPO", "Fire Watcher", "Security Supervisor", "Safety Officer", "Security Guard"];

const DEFAULT_COMPONENTS = [
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

const SITES = [
  {
    id: "s1", name: "Sajjan India Ltd, Ankleshwar", ocNo: "S33/890",
    client: "Sajjan India Limited", location: "Ankleshwar, Gujarat",
    cycleDay: 4, status: "processed",
    sheets: ["Special Incentive – Fire Tender Maintenance Allow."],
    attendanceCycleStart: 26, attendanceCycleEnd: 25,
    expectedDisbursement: "2026-09-04",
  },
  {
    id: "s2", name: "GACL, Dahej", ocNo: "GC-114",
    client: "Gujarat Alkalies & Chemicals Ltd", location: "Dahej, Gujarat",
    cycleDay: 7, status: "pending",
    sheets: ["OT Sheet", "Conveyance Allowance"],
    attendanceCycleStart: 1, attendanceCycleEnd: 31,
    expectedDisbursement: "2026-09-07",
  },
  {
    id: "s3", name: "ONGC, Hazira", ocNo: "ONG-77",
    client: "Oil & Natural Gas Corporation", location: "Hazira, Surat",
    cycleDay: 2, status: "held",
    sheets: ["OT Sheet", "TPT Allowance", "Admin & Mobile Allowance"],
    attendanceCycleStart: 21, attendanceCycleEnd: 20,
    expectedDisbursement: "2026-09-02",
  },
  {
    id: "s4", name: "Reliance, Jamnagar", ocNo: "REL-221",
    client: "Reliance Industries Ltd", location: "Jamnagar, Gujarat",
    cycleDay: 5, status: "in-progress",
    sheets: ["OT Sheet", "TPT Allowance"],
    attendanceCycleStart: 16, attendanceCycleEnd: 15,
    expectedDisbursement: "2026-09-05",
  },
];

function attendanceCycleLabel(s) {
  const ord = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : n === 21 ? "21st" : n === 22 ? "22nd" : n === 23 ? "23rd" : n === 31 ? "31st" : `${n}th`);
  return `${ord(s.attendanceCycleStart)} – ${ord(s.attendanceCycleEnd)} monthly`;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
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
    code, name, acc, ifsc, desig, workingDays: wd, salaryRate: rate,
    basicRate: +basicRate.toFixed(2), pDays, wOffOt: ot, totalDuty,
    earnedBasic: +earnedBasic.toFixed(2), hra: +hra.toFixed(2), leave: +leave.toFixed(2),
    other: +other.toFixed(2), gross: +gross.toFixed(2), pf, esi, ptax, loan, lwf,
    canteen, held, totalDed: +totalDed.toFixed(2), net: +net.toFixed(2),
    ...meta,
  };
}

const EMPLOYEES = {
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

const EMP_EXTRAS = {
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

const SALARY_HISTORY = {
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

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const ATTENDANCE_SYNCED_AT = "04 Sep 2026, 09:12 AM";

const COMPLIANCE = {
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

const EMP_COMPLIANCE_FLAGS = {
  21032: ["ESI number not mapped in attendance system"],
  11024: ["UAN not linked to PF portal"],
};

/* ---- Notification generation: disbursement dates, attendance transfers,
   dual-designation conflicts, compliance overdue items ---- */
function buildNotifications(sites) {
  const list = [];
  sites.forEach((s) => {
    if (s.status === "processed") return;
    const d = daysUntil(s.expectedDisbursement);
    if (d < 0) {
      list.push({ id: `dis-${s.id}`, type: "disbursement", severity: "danger", siteId: s.id,
        message: `${s.name.split(",")[0]} salary is ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue for disbursement (expected ${s.expectedDisbursement}).` });
    } else if (d <= 3) {
      list.push({ id: `dis-${s.id}`, type: "disbursement", severity: "warning", siteId: s.id,
        message: `${s.name.split(",")[0]} salary is due for disbursement in ${d} day${d === 1 ? "" : "s"} (${s.expectedDisbursement}).` });
    }
  });
  Object.values(EMPLOYEES).flat().forEach((e) => {
    if (e.transferred) {
      list.push({ id: `xfer-${e.code}`, type: "transfer", severity: "info", siteId: e.transferred.toSite,
        message: `${e.name} was moved from ${e.transferred.fromSiteName} to ${e.transferred.toSiteName} in the attendance system on ${e.transferred.date} — salary site updated automatically.` });
    }
    if (e.dualDesignation) {
      list.push({ id: `dual-${e.code}`, type: "dual-designation", severity: "warning", siteId: e.dualDesignation.site,
        message: `${e.name} is recorded under two designations: current site vs. ${e.dualDesignation.desig} at ${e.dualDesignation.siteName} (noted ${e.dualDesignation.notedOn}). Salary can still be processed — please verify.` });
    }
  });
  Object.entries(COMPLIANCE).forEach(([siteId, rows]) => {
    const site = sites.find((s) => s.id === siteId);
    rows.forEach((r) => {
      if (r.status === "Overdue") {
        list.push({ id: `comp-${siteId}-${r.item}`, type: "compliance", severity: "danger", siteId,
          message: `${site ? site.name.split(",")[0] : siteId}: ${r.item} is overdue (was due ${r.due}).` });
      }
    });
  });
  const order = { danger: 0, warning: 1, info: 2 };
  return list.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ============================================================================
   SMALL UI PRIMITIVES
=========================================================================== */

function inr(n) {
  const v = Math.round(n || 0);
  return "₹" + v.toLocaleString("en-IN");
}

function StatusBadge({ status }) {
  const map = {
    processed: { bg: C.greenSoft, fg: C.green, label: "Processed", Icon: CheckCircle2 },
    Processed: { bg: C.greenSoft, fg: C.green, label: "Processed", Icon: CheckCircle2 },
    "in-progress": { bg: C.blueSoft, fg: C.blue, label: "In Progress", Icon: Clock },
    pending: { bg: "#F3EFE6", fg: C.amberDeep, label: "Not Started", Icon: Clock },
    held: { bg: C.redSoft, fg: C.red, label: "Held", Icon: PauseCircle },
    Held: { bg: C.redSoft, fg: C.red, label: "Held", Icon: PauseCircle },
    Filed: { bg: C.greenSoft, fg: C.green, label: "Filed", Icon: CheckCircle2 },
    Overdue: { bg: C.redSoft, fg: C.red, label: "Overdue", Icon: AlertTriangle },
    Upcoming: { bg: C.blueSoft, fg: C.blue, label: "Upcoming", Icon: CalendarClock },
  };
  const m = map[status] || map.pending;
  const { Icon } = m;
  return (
    <span
      className="hrsm-head"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 8px",
        borderRadius: 3, background: m.bg, color: m.fg, fontSize: 13, fontWeight: 600,
        letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.6,
      }}
    >
      <Icon size={13} strokeWidth={2.5} /> {m.label}
    </span>
  );
}

function Panel({ children, style, className }) {
  return (
    <div
      className={className}
      style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, ...style }}
    >
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "default", size = "md", icon: Icon, disabled, style }) {
  const sizes = { sm: "6px 10px", md: "9px 14px" };
  const variants = {
    default: { background: C.panel, color: C.ink, border: `1px solid ${C.borderStrong}` },
    primary: { background: C.amber, color: C.amberInk, border: `1px solid ${C.amberDeep}` },
    dark: { background: C.navy, color: "#fff", border: `1px solid ${C.navy}` },
    danger: { background: C.redSoft, color: C.red, border: `1px solid #EFC7C3` },
    ghost: { background: "transparent", color: C.inkSoft, border: "1px solid transparent" },
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="hrsm-focus"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, padding: sizes[size],
        borderRadius: 4, fontSize: 13.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "filter 0.12s", ...variants[variant], ...style,
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.filter = "brightness(0.96)")}
      onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
    >
      {Icon && <Icon size={15} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

function SectionLabel({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <h2 className="hrsm-head" style={{ fontSize: 22, fontWeight: 600, margin: 0, color: C.ink }}>{children}</h2>
      {right}
    </div>
  );
}

function KpiCard({ label, value, sub, trend, accent }) {
  return (
    <Panel style={{ padding: "16px 18px", borderLeft: `3px solid ${accent || C.navy}` }}>
      <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div className="hrsm-head hrsm-num" style={{ fontSize: 30, fontWeight: 600, marginTop: 4, color: C.ink }}>{value}</div>
      {sub && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 12.5, color: trend === "down" ? C.red : trend === "up" ? C.green : C.inkFaint }}>
          {trend === "up" && <TrendingUp size={13} />}
          {trend === "down" && <TrendingDown size={13} />}
          {sub}
        </div>
      )}
    </Panel>
  );
}

function CycleSelector({ month, setMonth, year, setYear, payDate, setPayDate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 10px" }}>
        <Calendar size={14} color={C.inkSoft} />
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 13.5, fontWeight: 600, color: C.ink, cursor: "pointer" }}>
          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 13.5, fontWeight: 600, color: C.ink, cursor: "pointer" }}>
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {setPayDate && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 10px" }}>
          <span style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>Disbursal date</span>
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 13.5, fontWeight: 600, color: C.ink }} />
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   SIDEBAR
=========================================================================== */

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "sites", label: "Sites", Icon: Building2 },
  { id: "process", label: "Process Salary", Icon: ClipboardList },
  { id: "history", label: "Salary History", Icon: HistoryIcon },
  { id: "reports", label: "Reports", Icon: BarChart3 },
  { id: "compliance", label: "Compliance", Icon: ClipboardCheck },
  { id: "setup", label: "Site Setup", Icon: Settings2 },
];

function Sidebar({ nav, setNav, collapsed, setCollapsed }) {
  return (
    <div style={{
      width: collapsed ? 64 : 224, flexShrink: 0, background: C.navy, minHeight: "100vh",
      display: "flex", flexDirection: "column", transition: "width 0.15s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: collapsed ? "20px 16px" : "20px 18px", borderBottom: `1px solid ${C.navyLine}` }}>
        <div style={{ width: 30, height: 30, borderRadius: 4, background: C.amber, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <ShieldAlert size={17} color={C.amberInk} strokeWidth={2.4} />
        </div>
        {!collapsed && (
          <div style={{ lineHeight: 1.1 }}>
            <div className="hrsm-head" style={{ color: "#fff", fontSize: 16.5, fontWeight: 600 }}>PAYROLL OPS</div>
            <div style={{ color: "#7C93A8", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em" }}>ON-SITE WORKFORCE HR</div>
          </div>
        )}
      </div>
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = nav === id;
          return (
            <button
              key={id}
              onClick={() => setNav(id)}
              className="hrsm-focus"
              title={collapsed ? label : undefined}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 11,
                padding: "10px 12px", marginBottom: 3, borderRadius: 5, border: "none",
                background: active ? C.navySoft : "transparent",
                color: active ? "#fff" : "#93A8BB", cursor: "pointer",
                fontSize: 14, fontWeight: 600, textAlign: "left",
                borderLeft: active ? `2px solid ${C.amber}` : "2px solid transparent",
              }}
              onMouseEnter={(e) => !active && (e.currentTarget.style.background = "#152841")}
              onMouseLeave={(e) => !active && (e.currentTarget.style.background = "transparent")}
            >
              <Icon size={17} strokeWidth={2.1} />
              {!collapsed && label}
            </button>
          );
        })}
      </nav>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{ margin: 10, padding: "8px", background: "transparent", border: `1px solid ${C.navyLine}`, borderRadius: 4, color: "#7C93A8", cursor: "pointer", display: "flex", justifyContent: "center" }}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
      </button>
    </div>
  );
}

/* ============================================================================
   TOP BAR + NOTIFICATIONS
=========================================================================== */

const SEV_STYLE = {
  danger: { bg: C.redSoft, fg: C.red, Icon: AlertTriangle },
  warning: { bg: "#FBF1DE", fg: C.amberDeep, Icon: AlertTriangle },
  info: { bg: C.blueSoft, fg: C.blue, Icon: Info },
};

function NotificationBell({ notifications, onJump }) {
  const [open, setOpen] = useState(false);
  const dangerCount = notifications.filter((n) => n.severity === "danger").length;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} className="hrsm-focus"
        style={{ position: "relative", width: 36, height: 36, borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <Bell size={16} color={C.ink} className={dangerCount ? "hrsm-pulse" : ""} />
        {notifications.length > 0 && (
          <span className="hrsm-num" style={{ position: "absolute", top: -5, right: -5, background: dangerCount ? C.red : C.amber, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 9, minWidth: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
            {notifications.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div className="hrsm-scroll" style={{ position: "absolute", right: 0, top: 44, width: 380, maxHeight: 440, overflow: "auto", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 30px rgba(14,27,43,0.18)", zIndex: 50 }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 13.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Notifications
              <span style={{ fontSize: 11.5, color: C.inkFaint, fontWeight: 600 }}>{notifications.length} active</span>
            </div>
            {notifications.length === 0 ? (
              <Empty text="You're all caught up." />
            ) : notifications.map((n) => {
              const st = SEV_STYLE[n.severity];
              return (
                <button key={n.id} onClick={() => { onJump(n); setOpen(false); }}
                  style={{ display: "flex", gap: 10, padding: "11px 14px", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = C.panelAlt} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: st.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <st.Icon size={13} color={st.fg} />
                  </div>
                  <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.4 }}>{n.message}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const NAV_TITLES = {
  dashboard: ["Overview", "Consolidated payroll snapshot across deployed sites"],
  sites: ["All Sites", "Manage deployed sites and queue salary runs"],
  process: ["Process Salary", "Run and edit the salary cycle for a site"],
  history: ["Salary History", "Previously processed and held cycles"],
  reports: ["Reports & Cost Insights", "Spend patterns and cost-reduction flags"],
  compliance: ["Compliance", "Statutory filings and employee compliance flags"],
  setup: ["Site Setup", "Onboard sites and configure salary components"],
};

function TopBar({ nav, notifications, onJump }) {
  const [title, sub] = NAV_TITLES[nav] || ["", ""];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", background: "#fff", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 30 }}>
      <div>
        <div className="hrsm-head" style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.inkFaint }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.inkFaint }}>
          <Repeat size={12} /> Attendance synced {ATTENDANCE_SYNCED_AT}
        </div>
        <NotificationBell notifications={notifications} onJump={onJump} />
      </div>
    </div>
  );
}

/* ============================================================================
   DASHBOARD
=========================================================================== */

function Dashboard({ sites, month, year, setMonth, setYear, openEmployee, setNav, setProcessingSite }) {
  const totalDisbursed = useMemo(() => {
    let t = 0;
    Object.entries(SALARY_HISTORY).forEach(([, rows]) => {
      rows.forEach((r) => { if (r.month === month && r.year === Number(year)) t += r.amount; });
    });
    return t;
  }, [month, year]);

  const totalEmployees = Object.values(EMPLOYEES).reduce((a, e) => a + e.length, 0);
  const heldSites = sites.filter((s) => s.status === "held").length;
  const pendingSites = sites.filter((s) => s.status === "pending" || s.status === "in-progress").length;

  const trend = useMemo(() => {
    const months6 = ["March", "April", "May", "June", "July"];
    return months6.map((m) => {
      let t = 0;
      Object.values(SALARY_HISTORY).forEach((rows) => rows.forEach((r) => { if (r.month === m) t += r.amount; }));
      return { month: m.slice(0, 3), Disbursed: Math.round(t) };
    });
  }, []);

  const bySite = useMemo(() => sites.map((s) => {
    const rows = SALARY_HISTORY[s.id] || [];
    const row = rows.find((r) => r.month === month && r.year === Number(year));
    return { name: s.name.split(",")[0], amount: row ? Math.round(row.amount) : 0 };
  }), [sites, month, year]);

  const deductionMix = useMemo(() => sites.map((s) => {
    const emps = EMPLOYEES[s.id] || [];
    const t = { name: s.name.split(",")[0], PF: 0, ESI: 0, "P.Tax": 0, Loan: 0, Other: 0 };
    emps.forEach((e) => { t.PF += e.pf; t.ESI += e.esi; t["P.Tax"] += e.ptax; t.Loan += e.loan; t.Other += (e.lwf + e.canteen + e.held); });
    Object.keys(t).forEach((k) => { if (k !== "name") t[k] = Math.round(t[k]); });
    return t;
  }), [sites]);

  const otTrend = useMemo(() => {
    const months6 = ["March", "April", "May", "June", "July"];
    const base = { March: 2.1, April: 2.6, May: 3.0, June: 3.4, July: 3.8 };
    return months6.map((m) => ({ month: m.slice(0, 3), "Avg OT hrs/employee": base[m] }));
  }, []);

  const attendanceUtil = useMemo(() => sites.map((s) => {
    const emps = EMPLOYEES[s.id] || [];
    const workingDays = emps.reduce((a, e) => a + e.workingDays, 0) || 1;
    const pDays = emps.reduce((a, e) => a + e.pDays, 0);
    return { name: s.name.split(",")[0], "Attendance %": Math.round((pDays / workingDays) * 1000) / 10 };
  }), [sites]);

  const complianceSnapshot = useMemo(() => {
    const c = { Filed: 0, Pending: 0, Upcoming: 0, Overdue: 0 };
    Object.values(COMPLIANCE).forEach((items) => items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; }));
    return [
      { name: "Filed", value: c.Filed, fill: C.green },
      { name: "Pending", value: c.Pending, fill: C.amber },
      { name: "Upcoming", value: c.Upcoming, fill: C.blue },
      { name: "Overdue", value: c.Overdue, fill: C.red },
    ];
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <SectionLabel>Overview</SectionLabel>
          <p style={{ margin: 0, color: C.inkSoft, fontSize: 13.5 }}>Consolidated payroll snapshot across all deployed sites.</p>
        </div>
        <CycleSelector month={month} year={year} setMonth={setMonth} setYear={setYear} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <KpiCard label="Disbursed this cycle" value={inr(totalDisbursed)} sub={`${month} ${year} across ${sites.length} sites`} accent={C.green} />
        <KpiCard label="Active workforce" value={totalEmployees} sub="On-site deployed employees" accent={C.blue} />
        <KpiCard label="Sites on hold" value={heldSites} sub={heldSites ? "Needs review" : "None held"} trend={heldSites ? "down" : undefined} accent={C.red} />
        <KpiCard label="Pending processing" value={pendingSites} sub="Sites yet to be run this cycle" accent={C.amberDeep} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12, marginBottom: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Disbursal trend — last 5 months</div>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trend}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.inkSoft }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Line type="monotone" dataKey="Disbursed" stroke={C.blue} strokeWidth={2.5} dot={{ r: 3.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Disbursed by site — {month.slice(0,3)} {year}</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={bySite} layout="vertical" margin={{ left: 6 }}>
              <CartesianGrid stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: C.ink }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Bar dataKey="amount" radius={[0, 3, 3, 0]}>
                {bySite.map((_, i) => <Cell key={i} fill={[C.amber, C.blue, C.green, C.navySoft][i % 4]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Deduction composition by site — current cycle</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deductionMix}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: C.inkSoft }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="PF" stackId="d" fill={C.blue} radius={[0,0,0,0]} />
              <Bar dataKey="ESI" stackId="d" fill={C.green} />
              <Bar dataKey="P.Tax" stackId="d" fill={C.amber} />
              <Bar dataKey="Loan" stackId="d" fill={C.violet} />
              <Bar dataKey="Other" stackId="d" fill={C.red} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Average OT hours / employee — trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={otTrend}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.inkSoft }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Line type="monotone" dataKey="Avg OT hrs/employee" stroke={C.amberDeep} strokeWidth={2.5} dot={{ r: 3.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12, marginBottom: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Attendance utilization by site — P.Days vs. Working Days</div>
          <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 10 }}>Fetched live from the HR Attendance database this cycle.</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={attendanceUtil}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: C.inkSoft }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} domain={[80, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Bar dataKey="Attendance %" radius={[3, 3, 0, 0]}>
                {attendanceUtil.map((_, i) => <Cell key={i} fill={C.green} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Statutory compliance snapshot</div>
            <button onClick={() => setNav("compliance")} className="hrsm-focus" style={{ background: "none", border: "none", color: C.blue, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>View →</button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={complianceSnapshot} layout="vertical" margin={{ left: 6 }}>
              <CartesianGrid stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 12, fill: C.ink }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {complianceSnapshot.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Site status this cycle</div>
          <button onClick={() => setNav("sites")} className="hrsm-focus" style={{ background: "none", border: "none", color: C.blue, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>View all sites →</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {sites.map((s) => {
            const d = daysUntil(s.expectedDisbursement);
            const overdue = d < 0 && s.status !== "processed";
            return (
              <div key={s.id} onClick={() => { setProcessingSite(s.id); setNav("process"); }}
                className="hrsm-card-hover"
                style={{ border: `1px solid ${overdue ? "#EFC7C3" : C.border}`, borderRadius: 5, padding: 12, cursor: "pointer" }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.name.split(",")[0]}</div>
                <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 8 }}>{s.location}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <StatusBadge status={s.status} />
                  {s.status !== "processed" && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: overdue ? C.red : C.inkFaint, display: "flex", alignItems: "center", gap: 3 }}>
                      <CalendarClock size={11} /> {overdue ? `${Math.abs(d)}d overdue` : `due in ${d}d`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================================
   SITES LIST — multi-select for batch salary processing
=========================================================================== */

function SitesList({ sites, selected, setSelected, setNav, setProcessingSite, setBatch }) {
  const [q, setQ] = useState("");
  const filtered = sites.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.client.toLowerCase().includes(q.toLowerCase()));

  const toggle = (id) => setSelected((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((s) => s.id));

  return (
    <div>
      <SectionLabel right={
        <Btn variant="primary" icon={ClipboardList} disabled={selected.length === 0}
          onClick={() => { setBatch(selected); setProcessingSite(selected[0]); setNav("process"); }}>
          Process salary {selected.length > 0 && `(${selected.length})`}
        </Btn>
      }>All Sites</SectionLabel>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 12px", flex: 1, maxWidth: 320 }}>
          <Search size={15} color={C.inkFaint} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search site or client..." style={{ border: "none", outline: "none", fontSize: 13.5, flex: 1 }} />
        </div>
        <Btn variant="dark" icon={Building2} onClick={() => setNav("setup")}>New site</Btn>
      </div>

      <Panel>
        <div className="hrsm-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
            <thead>
              <tr style={{ background: C.panelAlt, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "10px 12px", width: 36 }}>
                  <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                {["Site", "Client / Location", "Employees", "Attendance cycle", "Expected disbursement", "Additional sheets", "Status", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11.5, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.03em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const d = daysUntil(s.expectedDisbursement);
                const overdue = d < 0 && s.status !== "processed";
                const dueSoon = d >= 0 && d <= 3 && s.status !== "processed";
                return (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "12px" }}><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} /></td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: C.inkFaint }}>OC No. {s.ocNo}</div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontSize: 13 }}>{s.client}</div>
                    <div style={{ fontSize: 11.5, color: C.inkFaint, display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {s.location}</div>
                  </td>
                  <td style={{ padding: "12px", fontSize: 13.5 }} className="hrsm-num">{(EMPLOYEES[s.id] || []).length}</td>
                  <td style={{ padding: "12px", fontSize: 12.5, color: C.inkSoft, whiteSpace: "nowrap" }}>{attendanceCycleLabel(s)}</td>
                  <td style={{ padding: "12px", whiteSpace: "nowrap" }}>
                    <div className="hrsm-num" style={{ fontSize: 13, fontWeight: 600 }}>{s.expectedDisbursement}</div>
                    {s.status !== "processed" && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: overdue ? C.red : dueSoon ? C.amberDeep : C.inkFaint, display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                        {(overdue || dueSoon) && <Bell size={10} />}
                        {overdue ? `${Math.abs(d)}d overdue` : dueSoon ? `due in ${d}d` : `in ${d}d`}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px", fontSize: 12.5, color: C.inkSoft }}>{s.sheets.length} extra{s.sheets.length !== 1 ? "s" : ""}</td>
                  <td style={{ padding: "12px" }}><StatusBadge status={s.status} /></td>
                  <td style={{ padding: "12px" }}>
                    <Btn size="sm" onClick={() => { setProcessingSite(s.id); setBatch([s.id]); setNav("process"); }}>Open →</Btn>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================================
   PROCESS SALARY — cycle setup, editable sheet grid, additional sheets,
   add-sheet builder with editable headers, per-site export
=========================================================================== */

function EditableCell({ value, onChange, width = 90, prefix }) {
  return (
    <input
      type="number"
      className="hrsm-num hrsm-focus"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{ width, border: `1px solid transparent`, background: "transparent", padding: "4px 6px", borderRadius: 3, fontSize: 12.5, textAlign: "right" }}
      onFocus={(e) => e.target.style.border = `1px solid ${C.amber}`}
      onBlur={(e) => e.target.style.border = `1px solid transparent`}
    />
  );
}

function AddColumnPopover({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("number");
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen((o) => !o)} className="hrsm-focus"
        style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: `1px dashed #4A6480`, borderRadius: 4, padding: "6px 10px", color: "#B9CADA", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
        <Plus size={12} /> Add column
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: 30, right: 0, width: 230, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(14,27,43,0.18)", padding: 12, zIndex: 50 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkSoft, marginBottom: 6 }}>New column header</div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Site Allowance" autoFocus
              className="hrsm-focus" style={{ width: "100%", padding: "7px 9px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5, marginBottom: 8 }} />
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, marginBottom: 10 }}>
              <option value="number">Number</option>
              <option value="text">Text</option>
            </select>
            <Btn size="sm" variant="primary" style={{ width: "100%", justifyContent: "center" }}
              onClick={() => { if (!label.trim()) return; onAdd({ key: label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: label.trim(), type }); setLabel(""); setOpen(false); }}>
              Add to sheet
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

function MainSheet({ site, employees, setEmployees, openEmployee, customColumns, setCustomColumns, lastSynced, onResync, syncing }) {
  const update = (idx, field, val) => {
    setEmployees((cur) => {
      const next = [...cur];
      const emp = { ...next[idx], [field]: val };
      emp.totalDed = +(emp.pf + emp.esi + emp.ptax + emp.loan + emp.lwf + emp.canteen + emp.held).toFixed(2);
      emp.net = +(emp.gross - emp.totalDed).toFixed(2);
      next[idx] = emp;
      return next;
    });
  };
  const updateCustom = (idx, key, val) => {
    setEmployees((cur) => {
      const next = [...cur];
      next[idx] = { ...next[idx], custom: { ...(next[idx].custom || {}), [key]: val } };
      return next;
    });
  };

  const totals = useMemo(() => {
    const t = { gross: 0, pf: 0, esi: 0, ptax: 0, loan: 0, lwf: 0, canteen: 0, held: 0, totalDed: 0, net: 0 };
    employees.forEach((e) => {
      t.gross += e.gross; t.pf += e.pf; t.esi += e.esi; t.ptax += e.ptax; t.loan += e.loan;
      t.lwf += e.lwf; t.canteen += e.canteen; t.held += e.held; t.totalDed += e.totalDed; t.net += e.net;
    });
    return t;
  }, [employees]);

  const cols = [
    { k: "code", h: "Emp Code" }, { k: "name", h: "Name of Employee" }, { k: "desig", h: "Desig" },
    { k: "workingDays", h: "Working Days" }, { k: "salaryRate", h: "Salary Rate" }, { k: "pDays", h: "P. Days" },
    { k: "wOffOt", h: "OT" }, { k: "earnedBasic", h: "Earned Basic" }, { k: "hra", h: "HRA @40%" },
    { k: "leave", h: "Leave Sal.@5%" }, { k: "other", h: "Other Allow." }, { k: "gross", h: "Gross Salary" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.inkSoft }}>
          <Zap size={12} color={C.green} /> P.Days / working days auto-fetched from HR Attendance DB · synced {lastSynced}
          <button onClick={onResync} disabled={syncing} className="hrsm-focus" style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", color: C.blue, fontWeight: 700, cursor: syncing ? "default" : "pointer", fontSize: 11.5, opacity: syncing ? 0.6 : 1 }}>
            <RefreshCw size={11} className={syncing ? "hrsm-pulse" : ""} /> {syncing ? "Syncing…" : "Re-sync"}
          </button>
        </div>
      </div>
      <div className="hrsm-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1500 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {cols.map((c) => (
                <th key={c.k} style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: c.k === "name" ? "left" : "right", whiteSpace: "nowrap" }}>
                  {(c.k === "pDays" || c.k === "wOffOt") && <Zap size={9} style={{ marginRight: 3, verticalAlign: -1 }} />}
                  {c.h}
                </th>
              ))}
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>PF</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>ESI</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>P.Tax</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>Loan</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>LWF</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>Canteen</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>Held</th>
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: "right" }}>Total Ded.</th>
              {customColumns.map((c) => (
                <th key={c.key} style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#F0D9A8", textAlign: c.type === "number" ? "right" : "left", whiteSpace: "nowrap" }}>{c.label}</th>
              ))}
              <th style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "right", background: C.navySoft }}>Net Payable</th>
              <th style={{ padding: "6px 8px", background: C.navy }}><AddColumnPopover onAdd={(c) => {
                setCustomColumns((cur) => [...cur, c]);
                setEmployees((cur) => cur.map((e) => ({ ...e, custom: { ...(e.custom || {}), [c.key]: c.type === "number" ? 0 : "" } })));
              }} /></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e, idx) => (
              <tr key={e.code} style={{ borderBottom: `1px solid ${C.border}` }}
                onMouseEnter={(ev) => ev.currentTarget.style.background = C.panelAlt}
                onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{e.code}</td>
                <td style={{ padding: "7px 10px", fontSize: 13 }}>
                  <button onClick={() => openEmployee(e)} className="hrsm-focus" style={{ background: "none", border: "none", color: C.blue, fontWeight: 600, cursor: "pointer", padding: 0, textAlign: "left", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {e.name}
                    {e.transferred && <ArrowRightLeft size={12} color={C.blue} title={`Transferred from ${e.transferred.fromSiteName}`} />}
                    {e.dualDesignation && <AlertTriangle size={12} color={C.amberDeep} title={`Also recorded as ${e.dualDesignation.desig} at ${e.dualDesignation.siteName}`} />}
                  </button>
                </td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right", color: C.inkSoft }}>{e.desig}</td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{e.workingDays}</td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{inr(e.salaryRate)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.pDays} onChange={(v) => update(idx, "pDays", v)} width={50} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.wOffOt} onChange={(v) => update(idx, "wOffOt", v)} width={45} /></td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{inr(e.earnedBasic)}</td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{inr(e.hra)}</td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{inr(e.leave)}</td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right" }} className="hrsm-num">{inr(e.other)}</td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right", fontWeight: 700 }} className="hrsm-num">{inr(e.gross)}</td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.pf} onChange={(v) => update(idx, "pf", v)} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.esi} onChange={(v) => update(idx, "esi", v)} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.ptax} onChange={(v) => update(idx, "ptax", v)} width={55} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.loan} onChange={(v) => update(idx, "loan", v)} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.lwf} onChange={(v) => update(idx, "lwf", v)} width={55} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.canteen} onChange={(v) => update(idx, "canteen", v)} /></td>
                <td style={{ padding: "7px 10px", textAlign: "right" }}><EditableCell value={e.held} onChange={(v) => update(idx, "held", v)} /></td>
                <td style={{ padding: "7px 10px", fontSize: 12.5, textAlign: "right", fontWeight: 700, color: C.red }} className="hrsm-num">{inr(e.totalDed)}</td>
                {customColumns.map((c) => (
                  <td key={c.key} style={{ padding: "7px 10px", textAlign: c.type === "number" ? "right" : "left" }}>
                    {c.type === "number" ? (
                      <EditableCell value={(e.custom && e.custom[c.key]) || 0} onChange={(v) => updateCustom(idx, c.key, v)} width={90} />
                    ) : (
                      <input value={(e.custom && e.custom[c.key]) || ""} onChange={(ev) => updateCustom(idx, c.key, ev.target.value)} className="hrsm-focus"
                        style={{ border: "1px solid transparent", background: "transparent", fontSize: 12.5, padding: "4px 6px", width: 100 }}
                        onFocus={(ev) => ev.target.style.border = `1px solid ${C.amber}`} onBlur={(ev) => ev.target.style.border = "1px solid transparent"} />
                    )}
                  </td>
                ))}
                <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", fontWeight: 700, color: C.green, background: C.greenSoft }} className="hrsm-num">{inr(e.net)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: C.panelAlt, borderTop: `2px solid ${C.borderStrong}` }}>
              <td colSpan={11} style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }}>TOTAL</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.gross)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.pf)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.esi)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.ptax)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.loan)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.lwf)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.canteen)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.held)}</td>
              <td style={{ padding: "10px", fontSize: 12.5, fontWeight: 700, textAlign: "right" }} className="hrsm-num">{inr(totals.totalDed)}</td>
              {customColumns.map((c) => <td key={c.key}></td>)}
              <td style={{ padding: "10px", fontSize: 13.5, fontWeight: 700, textAlign: "right", background: C.green, color: "#fff" }} className="hrsm-num">{inr(totals.net)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function ExtraSheetGrid({ sheet, setSheet }) {
  const updateCell = (r, key, val) => {
    setSheet((cur) => {
      const rows = [...cur.rows];
      rows[r] = { ...rows[r], [key]: val };
      return { ...cur, rows };
    });
  };
  const addRow = () => setSheet((cur) => ({ ...cur, rows: [...cur.rows, Object.fromEntries(cur.columns.map((c) => [c.key, c.type === "number" ? 0 : ""]))] }));
  const removeRow = (r) => setSheet((cur) => ({ ...cur, rows: cur.rows.filter((_, i) => i !== r) }));

  return (
    <div>
      <div className="hrsm-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {sheet.columns.map((c) => (
                <th key={c.key} style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#B9CADA", textAlign: c.type === "number" ? "right" : "left" }}>{c.label}</th>
              ))}
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <tr key={r} style={{ borderBottom: `1px solid ${C.border}` }}>
                {sheet.columns.map((c) => (
                  <td key={c.key} style={{ padding: "6px 10px", textAlign: c.type === "number" ? "right" : "left" }}>
                    {c.type === "number" ? (
                      <EditableCell value={row[c.key] || 0} onChange={(v) => updateCell(r, c.key, v)} width={100} />
                    ) : (
                      <input value={row[c.key] || ""} onChange={(e) => updateCell(r, c.key, e.target.value)} className="hrsm-focus"
                        style={{ border: "1px solid transparent", background: "transparent", fontSize: 12.5, padding: "4px 6px", width: "100%" }}
                        onFocus={(e) => e.target.style.border = `1px solid ${C.amber}`} onBlur={(e) => e.target.style.border = "1px solid transparent"} />
                    )}
                  </td>
                ))}
                <td style={{ textAlign: "center" }}>
                  <button onClick={() => removeRow(r)} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="hrsm-focus" style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: `1px dashed ${C.borderStrong}`, borderRadius: 4, padding: "6px 12px", fontSize: 12.5, color: C.inkSoft, cursor: "pointer" }}>
        <Plus size={13} /> Add row
      </button>
    </div>
  );
}

function NewSheetModal({ onClose, onCreate, employees }) {
  const [name, setName] = useState("");
  const [columns, setColumns] = useState([
    { key: "code", label: "Emp Code", type: "text" },
    { key: "name", label: "Name of Employee", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
  ]);

  const updateCol = (i, field, val) => setColumns((cur) => cur.map((c, idx) => idx === i ? { ...c, [field]: val, key: field === "label" ? val.toLowerCase().replace(/[^a-z0-9]+/g, "_") : c.key } : c));
  const addCol = () => setColumns((cur) => [...cur, { key: `field_${cur.length}`, label: "New column", type: "number" }]);
  const removeCol = (i) => setColumns((cur) => cur.filter((_, idx) => idx !== i));

  const create = () => {
    if (!name.trim()) return;
    const rows = employees.map((e) => {
      const row = {};
      columns.forEach((c) => {
        if (c.key === "code") row[c.key] = e.code;
        else if (c.key === "name" || c.key === "name_of_employee") row[c.key] = e.name;
        else row[c.key] = c.type === "number" ? 0 : "";
      });
      return row;
    });
    onCreate({ name: name.trim(), columns, rows });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,27,43,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, borderRadius: 8, width: 560, maxHeight: "85vh", overflow: "auto" }} className="hrsm-scroll">
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="hrsm-head" style={{ fontSize: 18, fontWeight: 600 }}>Create additional sheet</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, display: "block", marginBottom: 5 }}>Sheet name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. TPT Allowance, OT Sheet, Conveyance..."
            className="hrsm-focus" style={{ width: "100%", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13.5, marginBottom: 16 }} />

          <label style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft, display: "block", marginBottom: 6 }}>Columns (editable headers)</label>
          {columns.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={c.label} onChange={(e) => updateCol(i, "label", e.target.value)} className="hrsm-focus"
                style={{ flex: 1, padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13 }} />
              <select value={c.type} onChange={(e) => updateCol(i, "type", e.target.value)}
                style={{ padding: "7px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }}>
                <option value="number">Number</option>
                <option value="text">Text</option>
              </select>
              <button onClick={() => removeCol(i)} disabled={columns.length <= 1} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, opacity: columns.length <= 1 ? 0.3 : 1 }}><Trash2 size={15} /></button>
            </div>
          ))}
          <button onClick={addCol} className="hrsm-focus" style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: `1px dashed ${C.borderStrong}`, borderRadius: 4, padding: "6px 12px", fontSize: 12.5, color: C.inkSoft, cursor: "pointer" }}>
            <Plus size={13} /> Add column
          </button>
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={FolderPlus} onClick={create}>Create sheet & save</Btn>
        </div>
      </div>
    </div>
  );
}

function ProcessSalary({ siteId, setSiteId, batch, sites, month, year, setMonth, setYear, openEmployee }) {
  const site = sites.find((s) => s.id === siteId) || sites[0];
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [employeesBySite, setEmployeesBySite] = useState(() => JSON.parse(JSON.stringify(EMPLOYEES)));
  const [extraSheets, setExtraSheets] = useState(() => {
    const init = {};
    Object.entries(EMPLOYEES).forEach(([sid]) => {
      init[sid] = (SITES.find((s) => s.id === sid).sheets || []).map((name) => ({
        name,
        columns: [{ key: "code", label: "Emp Code", type: "text" }, { key: "name", label: "Name of Employee", type: "text" }, { key: "amount", label: "Amount", type: "number" }],
        rows: EMPLOYEES[sid].map((e) => ({ code: e.code, name: e.name, amount: 0 })),
      }));
    });
    return init;
  });
  const [activeTab, setActiveTab] = useState("main");
  const [modalOpen, setModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [status, setStatus] = useState(site.status);
  const [customColumnsBySite, setCustomColumnsBySite] = useState({});
  const [lastSyncedBySite, setLastSyncedBySite] = useState(() => {
    const init = {};
    Object.keys(EMPLOYEES).forEach((sid) => { init[sid] = ATTENDANCE_SYNCED_AT; });
    return init;
  });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { setActiveTab("main"); setStatus((sites.find((s) => s.id === siteId) || sites[0]).status); }, [siteId]);

  const employees = employeesBySite[siteId] || [];
  const setEmployees = (updater) => setEmployeesBySite((cur) => ({ ...cur, [siteId]: typeof updater === "function" ? updater(cur[siteId]) : updater }));
  const sheets = extraSheets[siteId] || [];
  const customColumns = customColumnsBySite[siteId] || [];
  const setCustomColumns = (updater) => setCustomColumnsBySite((cur) => ({ ...cur, [siteId]: typeof updater === "function" ? updater(cur[siteId] || []) : updater }));

  const onResync = () => {
    setSyncing(true);
    setTimeout(() => {
      setLastSyncedBySite((cur) => ({ ...cur, [siteId]: new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) }));
      setSyncing(false);
    }, 700);
  };

  const MAIN_EXPORT_FIELDS = [
    { key: "code", label: "Emp Code" }, { key: "name", label: "Name" }, { key: "desig", label: "Designation" },
    { key: "workingDays", label: "Working Days" }, { key: "salaryRate", label: "Salary Rate" }, { key: "pDays", label: "P.Days" },
    { key: "wOffOt", label: "OT" }, { key: "earnedBasic", label: "Earned Basic" }, { key: "hra", label: "HRA @40%" },
    { key: "leave", label: "Leave Salary @5%" }, { key: "other", label: "Other Allow." }, { key: "gross", label: "Gross Salary" },
    { key: "pf", label: "PF" }, { key: "esi", label: "ESI" }, { key: "ptax", label: "P.Tax" }, { key: "loan", label: "Loan" },
    { key: "lwf", label: "LWF" }, { key: "canteen", label: "Canteen" }, { key: "held", label: "Held" },
    { key: "totalDed", label: "Total Ded." }, { key: "net", label: "Net Payable" },
  ];
  const [exportFields, setExportFields] = useState(MAIN_EXPORT_FIELDS.map((f) => f.key));
  const [exportSheets, setExportSheets] = useState(true);

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const activeFields = MAIN_EXPORT_FIELDS.filter((f) => exportFields.includes(f.key));
    const mainData = employees.map((e) => {
      const row = {};
      activeFields.forEach((f) => { row[f.label] = e[f.key]; });
      customColumns.forEach((c) => { if (exportFields.includes(`custom:${c.key}`)) row[c.label] = (e.custom && e.custom[c.key]) ?? ""; });
      return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainData), `${month.slice(0,3)} ${year}`.slice(0, 31));
    if (exportSheets) {
      sheets.forEach((s) => {
        const data = s.rows.map((r) => Object.fromEntries(s.columns.map((c) => [c.label, r[c.key]])));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), s.name.slice(0, 31));
      });
    }
    XLSX.writeFile(wb, `${site.name.split(",")[0].replace(/\s+/g, "_")}_Salary_${month}_${year}.xlsx`);
    setExportModalOpen(false);
  };

  const totalNet = employees.reduce((a, e) => a + e.net, 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="hrsm-head hrsm-focus"
              style={{ fontSize: 22, fontWeight: 600, border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <StatusBadge status={status} />
            {batch && batch.length > 1 && (
              <span style={{ fontSize: 11.5, color: C.inkFaint, fontWeight: 600 }}>· batch of {batch.length} sites selected</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.inkFaint }}>OC No. {site.ocNo} · {site.client} · {site.location}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <CycleSelector month={month} year={year} setMonth={setMonth} setYear={setYear} payDate={payDate} setPayDate={setPayDate} />
        </div>
      </div>

      {batch && batch.length > 1 && (
        <Panel style={{ padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", background: C.blueSoft, borderColor: "#BFD9E5" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.blue }}>Queued for this batch run:</span>
          {batch.map((id) => {
            const s = sites.find((x) => x.id === id);
            return (
              <button key={id} onClick={() => setSiteId(id)} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 12, border: `1px solid ${id === siteId ? C.blue : "#BFD9E5"}`, background: id === siteId ? C.blue : "#fff", color: id === siteId ? "#fff" : C.blue, cursor: "pointer", fontWeight: 600 }}>
                {s.name.split(",")[0]}
              </button>
            );
          })}
        </Panel>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "stretch" }}>
        <Panel style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <IndianRupee size={16} color={C.green} />
          <div>
            <div style={{ fontSize: 11, color: C.inkFaint, fontWeight: 700 }}>NET PAYABLE THIS CYCLE</div>
            <div className="hrsm-num" style={{ fontSize: 17, fontWeight: 700, color: C.green }}>{inr(totalNet)}</div>
          </div>
        </Panel>
        <div style={{ flex: 1 }} />
        <Btn icon={Columns3} onClick={() => setExportModalOpen(true)}>Export .xlsx</Btn>
        <Btn variant={status === "held" ? "primary" : "danger"} icon={status === "held" ? Play : Pause}
          onClick={() => setStatus((s) => s === "held" ? "in-progress" : "held")}>
          {status === "held" ? "Release hold" : "Hold salary"}
        </Btn>
        <Btn variant="primary" icon={Save} onClick={() => setStatus("processed")}>Process & disburse</Btn>
      </div>

      <Panel>
        <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }} className="hrsm-scroll">
          <button onClick={() => setActiveTab("main")} style={{ padding: "8px 14px", borderRadius: 4, border: "none", background: activeTab === "main" ? C.navy : "transparent", color: activeTab === "main" ? "#fff" : C.inkSoft, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>
            Main Salary Sheet
          </button>
          {sheets.map((s, i) => (
            <button key={i} onClick={() => setActiveTab(i)} style={{ padding: "8px 14px", borderRadius: 4, border: "none", background: activeTab === i ? C.navy : "transparent", color: activeTab === i ? "#fff" : C.inkSoft, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>
              {s.name}
            </button>
          ))}
          <button onClick={() => setModalOpen(true)} style={{ marginLeft: 4, display: "flex", alignItems: "center", gap: 4, padding: "8px 12px", borderRadius: 4, border: `1px dashed ${C.borderStrong}`, background: "transparent", color: C.inkSoft, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>
            <Plus size={13} /> Add sheet
          </button>
        </div>
        <div style={{ padding: 14 }}>
          {activeTab === "main" ? (
            <MainSheet site={site} employees={employees} setEmployees={setEmployees} openEmployee={openEmployee}
              customColumns={customColumns} setCustomColumns={setCustomColumns}
              lastSynced={lastSyncedBySite[siteId] || ATTENDANCE_SYNCED_AT} onResync={onResync} syncing={syncing} />
          ) : (
            <ExtraSheetGrid
              sheet={sheets[activeTab]}
              setSheet={(updater) => setExtraSheets((cur) => {
                const list = [...(cur[siteId] || [])];
                list[activeTab] = typeof updater === "function" ? updater(list[activeTab]) : updater;
                return { ...cur, [siteId]: list };
              })}
            />
          )}
        </div>
      </Panel>

      {modalOpen && (
        <NewSheetModal
          employees={employees}
          onClose={() => setModalOpen(false)}
          onCreate={(sheet) => {
            setExtraSheets((cur) => ({ ...cur, [siteId]: [...(cur[siteId] || []), sheet] }));
            setActiveTab((sheets.length));
            setModalOpen(false);
          }}
        />
      )}

      {exportModalOpen && (
        <ExportColumnModal
          fields={MAIN_EXPORT_FIELDS}
          customColumns={customColumns}
          selected={exportFields}
          setSelected={setExportFields}
          includeSheets={exportSheets}
          setIncludeSheets={setExportSheets}
          sheetCount={sheets.length}
          onClose={() => setExportModalOpen(false)}
          onExport={exportXLSX}
        />
      )}
    </div>
  );
}

function ExportColumnModal({ fields, customColumns, selected, setSelected, includeSheets, setIncludeSheets, sheetCount, onClose, onExport }) {
  const allKeys = [...fields.map((f) => f.key), ...customColumns.map((c) => `custom:${c.key}`)];
  const allChecked = allKeys.every((k) => selected.includes(k));
  const toggle = (k) => setSelected((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  const toggleAll = () => setSelected(allChecked ? [] : allKeys);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(14,27,43,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 8, width: 440, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(14,27,43,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="hrsm-head" style={{ fontSize: 16, fontWeight: 600 }}>Choose columns to export</div>
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 2 }}>Only the checked columns are included in the workbook.</div>
          </div>
          <button onClick={onClose} className="hrsm-focus" style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint }}><X size={18} /></button>
        </div>
        <div className="hrsm-scroll" style={{ padding: "12px 18px", overflow: "auto", flex: 1 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, fontWeight: 700, borderBottom: `1px solid ${C.border}`, marginBottom: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={allChecked} onChange={toggleAll} /> Select all
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
            {fields.map((f) => (
              <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.includes(f.key)} onChange={() => toggle(f.key)} /> {f.label}
              </label>
            ))}
            {customColumns.map((c) => (
              <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5, cursor: "pointer", color: C.amberDeep }}>
                <input type="checkbox" checked={selected.includes(`custom:${c.key}`)} onChange={() => toggle(`custom:${c.key}`)} /> {c.label} <span style={{ fontSize: 10, color: C.inkFaint }}>(custom)</span>
              </label>
            ))}
          </div>
          {sheetCount > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 4px", fontSize: 12.5, borderTop: `1px solid ${C.border}`, marginTop: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={includeSheets} onChange={(e) => setIncludeSheets(e.target.checked)} /> Include {sheetCount} additional sheet{sheetCount !== 1 ? "s" : ""} in the workbook
            </label>
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" icon={Download} disabled={selected.length === 0} onClick={onExport}>Export .xlsx</Btn>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   EMPLOYEE PROFILE DRAWER
=========================================================================== */

function EmployeeDrawer({ employee, onClose }) {
  const [tab, setTab] = useState("overview");
  if (!employee) return null;
  const extra = EMP_EXTRAS[employee.code] || { deductions: [], loans: [], advances: [], warnings: [], suspensions: [] };
  const tabs = [
    { id: "overview", label: "Overview", Icon: UserRound },
    { id: "deductions", label: "Deductions", Icon: Wallet, count: extra.deductions.length },
    { id: "loans", label: "Loans", Icon: Landmark, count: extra.loans.length },
    { id: "advances", label: "Advances", Icon: IndianRupee, count: extra.advances.length },
    { id: "warnings", label: "Warnings", Icon: FileWarning, count: extra.warnings.length },
    { id: "suspensions", label: "Suspensions", Icon: ShieldAlert, count: extra.suspensions.length },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(14,27,43,0.5)" }} onClick={onClose} />
      <div className="hrsm-scroll" style={{ position: "relative", width: 460, maxWidth: "94vw", height: "100vh", background: C.panel, overflow: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.15)" }}>
        <div style={{ background: C.navy, padding: "20px 22px", color: "#fff" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#93A8BB", cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600 }}>
            <ArrowLeft size={14} /> Close profile
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: C.amber, display: "flex", alignItems: "center", justifyContent: "center", color: C.amberInk, fontWeight: 700, fontSize: 17 }}>
              {employee.name.trim()[0]}
            </div>
            <div>
              <div className="hrsm-head" style={{ fontSize: 19, fontWeight: 600 }}>{employee.name}</div>
              <div style={{ fontSize: 12.5, color: "#93A8BB" }}>{employee.desig} · Emp Code {employee.code}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 4, border: "none", background: tab === t.id ? C.panelAlt : "transparent", color: tab === t.id ? C.ink : C.inkSoft, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <t.Icon size={13} /> {t.label} {t.count > 0 && <span style={{ background: t.id === "warnings" || t.id === "suspensions" ? C.red : C.blue, color: "#fff", borderRadius: 8, fontSize: 10, padding: "0 5px" }}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {tab === "overview" && (
            <div>
              <Row label="Account Number" value={employee.acc} />
              <Row label="IFSC Code" value={employee.ifsc} />
              <Row label="Designation" value={employee.desig} />
              <Row label="Working Days" value={employee.workingDays} />
              <Row label="Present Days" value={employee.pDays} />
              <Row label="Salary Rate" value={inr(employee.salaryRate)} />
              <Row label="Gross Salary (last cycle)" value={inr(employee.gross)} />
              <Row label="Net Payable (last cycle)" value={inr(employee.net)} strong />
            </div>
          )}
          {tab === "deductions" && (
            extra.deductions.length ? extra.deductions.map((d, i) => (
              <Panel key={i} style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{d.label}</span>
                  <span className="hrsm-num" style={{ fontSize: 13, fontWeight: 700, color: C.red }}>-{inr(d.amount)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.inkFaint }}>{d.month}</div>
              </Panel>
            )) : <Empty text="No deductions on record." />
          )}
          {tab === "loans" && (
            extra.loans.length ? extra.loans.map((l, i) => (
              <Panel key={i} style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Loan · {inr(l.amount)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: l.status === "Active" ? C.blue : C.green }}>{l.status}</span>
                </div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>Disbursed {l.disbursed} · EMI {inr(l.emi)}/mo</div>
                <div style={{ fontSize: 12, color: C.inkSoft }}>Balance outstanding: <b className="hrsm-num">{inr(l.balance)}</b></div>
              </Panel>
            )) : <Empty text="No active or past loans." />
          )}
          {tab === "advances" && (
            extra.advances.length ? extra.advances.map((a, i) => (
              <Panel key={i} style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }} className="hrsm-num">{inr(a.amount)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.recovered ? C.green : C.amberDeep }}>{a.recovered ? "Recovered" : "Pending recovery"}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.inkFaint }}>Applied {a.date}</div>
              </Panel>
            )) : <Empty text="No advance requests." />
          )}
          {tab === "warnings" && (
            extra.warnings.length ? extra.warnings.map((w, i) => (
              <Panel key={i} style={{ padding: 12, marginBottom: 8, borderLeft: `3px solid ${C.red}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{w.type}</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>{w.reason}</div>
                <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 4 }}>{w.date} · Issued by {w.issuedBy}</div>
              </Panel>
            )) : <Empty text="No warning letters issued." />
          )}
          {tab === "suspensions" && (
            extra.suspensions.length ? extra.suspensions.map((s, i) => (
              <Panel key={i} style={{ padding: 12, marginBottom: 8, borderLeft: `3px solid ${C.red}` }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.from} → {s.to}</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>{s.reason}</div>
                <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 4 }}>Status: {s.status}</div>
              </Panel>
            )) : <Empty text="No suspension record." />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12.5, color: C.inkSoft }}>{label}</span>
      <span className="hrsm-num" style={{ fontSize: 13, fontWeight: strong ? 700 : 500, color: strong ? C.green : C.ink }}>{value}</span>
    </div>
  );
}
function Empty({ text }) {
  return <div style={{ padding: "30px 0", textAlign: "center", color: C.inkFaint, fontSize: 13 }}>{text}</div>;
}

/* ============================================================================
   SALARY HISTORY
=========================================================================== */

function SalaryHistory({ sites, holds, setHolds }) {
  const [siteId, setSiteId] = useState(sites[0].id);
  const site = sites.find((s) => s.id === siteId);
  const rows = SALARY_HISTORY[siteId] || [];
  const totalAll = Object.values(SALARY_HISTORY).flat().reduce((a, r) => a + r.amount, 0);

  const toggleHold = (idx) => setHolds((cur) => ({ ...cur, [`${siteId}-${idx}`]: !cur[`${siteId}-${idx}`] }));

  return (
    <div>
      <SectionLabel>Salary History</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
        <KpiCard label="Total disbursed to date (all sites)" value={inr(totalAll)} sub="Across every processed cycle" accent={C.green} />
        <Panel style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.inkSoft }}>Site:</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sites.map((s) => (
              <button key={s.id} onClick={() => setSiteId(s.id)} style={{ padding: "6px 12px", borderRadius: 14, border: `1px solid ${siteId === s.id ? C.navy : C.border}`, background: siteId === s.id ? C.navy : "#fff", color: siteId === s.id ? "#fff" : C.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {s.name.split(",")[0]}
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>{site.name}</div>
            <div style={{ fontSize: 12, color: C.inkFaint }}>{site.client}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.inkFaint, fontWeight: 700 }}>TOTAL DISBURSED — THIS SITE</div>
            <div className="hrsm-num" style={{ fontSize: 17, fontWeight: 700, color: C.green }}>{inr(rows.reduce((a, r) => a + r.amount, 0))}</div>
          </div>
        </div>
        <div className="hrsm-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.panelAlt }}>
                {["Cycle", "Amount disbursed", "Processed on", "Status", ""].map((h) => (
                  <th key={h} style={{ textAlign: h === "Amount disbursed" || h === "Processed on" ? "right" : "left", padding: "10px 14px", fontSize: 11.5, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const held = holds[`${siteId}-${idx}`] ?? (r.status === "Held");
                return (
                  <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "12px 14px", fontSize: 13.5, fontWeight: 600 }}>{r.month} {r.year}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13.5, textAlign: "right" }} className="hrsm-num">{held ? "—" : inr(r.amount)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13, textAlign: "right", color: C.inkSoft }}>{held ? "Awaiting release" : r.processedOn}</td>
                    <td style={{ padding: "12px 14px" }}><StatusBadge status={held ? "Held" : "Processed"} /></td>
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <Btn size="sm" variant={held ? "primary" : "danger"} icon={held ? Play : Pause} onClick={() => toggleHold(idx)}>
                        {held ? "Release" : "Hold"}
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================================
   REPORTS
=========================================================================== */

function Reports({ sites }) {
  const siteTotals = useMemo(() => sites.map((s) => ({
    name: s.name.split(",")[0],
    total: (SALARY_HISTORY[s.id] || []).reduce((a, r) => a + r.amount, 0),
  })).sort((a, b) => b.total - a.total), [sites]);

  const designationBySite = useMemo(() => {
    const rows = [];
    sites.forEach((s) => {
      const emps = EMPLOYEES[s.id] || [];
      const byDesig = {};
      emps.forEach((e) => {
        byDesig[e.desig] = byDesig[e.desig] || { sum: 0, count: 0 };
        byDesig[e.desig].sum += e.gross;
        byDesig[e.desig].count += 1;
      });
      Object.entries(byDesig).forEach(([desig, v]) => rows.push({ site: s.name.split(",")[0], desig, avg: v.sum / v.count }));
    });
    return rows;
  }, [sites]);

  const highestPerSite = useMemo(() => {
    const bySite = {};
    designationBySite.forEach((r) => {
      if (!bySite[r.site] || r.avg > bySite[r.site].avg) bySite[r.site] = r;
    });
    return Object.values(bySite);
  }, [designationBySite]);

  const avgTotal = siteTotals.reduce((a, s) => a + s.total, 0) / siteTotals.length;
  const overBenchmark = siteTotals.filter((s) => s.total > avgTotal * 1.15);

  return (
    <div>
      <SectionLabel>Reports & Cost Insights</SectionLabel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Total disbursed per site (cumulative)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={siteTotals}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: C.inkSoft }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                {siteTotals.map((s, i) => <Cell key={i} fill={s.total > avgTotal * 1.15 ? C.red : C.blue} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 6 }}><span style={{ display: "inline-block", width: 9, height: 9, background: C.red, borderRadius: 2, marginRight: 4 }} />Sites 15%+ above the average spend — review for cost reduction</div>
        </Panel>

        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Highest-paid designation, by site (avg. gross)</div>
          <div className="hrsm-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.panelAlt }}>
                  {["Site", "Designation", "Avg. Gross"].map((h) => <th key={h} style={{ textAlign: h === "Avg. Gross" ? "right" : "left", padding: "9px 12px", fontSize: 11.5, fontWeight: 700, color: C.inkSoft }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {highestPerSite.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>{r.site}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{r.desig}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "right" }} className="hrsm-num">{inr(r.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel style={{ padding: 16 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Cost-reduction flags</div>
        {overBenchmark.length === 0 ? (
          <Empty text="No site is currently running significantly above the average spend." />
        ) : overBenchmark.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: i < overBenchmark.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <AlertTriangle size={17} color={C.amberDeep} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
              <div style={{ fontSize: 12.5, color: C.inkSoft }}>
                Cumulative disbursal is {(((s.total / avgTotal) - 1) * 100).toFixed(0)}% above the cross-site average
                (<span className="hrsm-num">{inr(s.total)}</span> vs. avg <span className="hrsm-num">{inr(avgTotal)}</span>).
                Review headcount mix and OT hours at this site for potential savings.
              </div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/* ============================================================================
   COMPLIANCE — statutory filings per site + employee-level compliance flags
   (dual designation, unmapped ESI/UAN, etc. — informational, non-blocking)
=========================================================================== */

function Compliance({ sites }) {
  const [siteId, setSiteId] = useState("__all__");

  const rows = useMemo(() => {
    const out = [];
    Object.entries(COMPLIANCE).forEach(([sid, items]) => {
      if (siteId !== "__all__" && sid !== siteId) return;
      const site = sites.find((s) => s.id === sid);
      items.forEach((it) => out.push({ ...it, siteId: sid, siteName: site ? site.name.split(",")[0] : sid }));
    });
    const order = { Overdue: 0, Pending: 1, Upcoming: 2, Filed: 3 };
    return out.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || new Date(a.due) - new Date(b.due));
  }, [sites, siteId]);

  const counts = useMemo(() => {
    const c = { Overdue: 0, Pending: 0, Upcoming: 0, Filed: 0 };
    Object.entries(COMPLIANCE).forEach(([sid, items]) => {
      if (siteId !== "__all__" && sid !== siteId) return;
      items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; });
    });
    return c;
  }, [siteId]);

  const empFlags = useMemo(() => {
    const out = [];
    Object.entries(EMPLOYEES).forEach(([sid, emps]) => {
      if (siteId !== "__all__" && sid !== siteId) return;
      const site = sites.find((s) => s.id === sid);
      emps.forEach((e) => {
        const notes = [...(EMP_COMPLIANCE_FLAGS[e.code] || [])];
        if (e.dualDesignation) notes.push(`Also recorded as ${e.dualDesignation.desig} at ${e.dualDesignation.siteName} (noted ${e.dualDesignation.notedOn})`);
        if (notes.length) out.push({ code: e.code, name: e.name, site: site ? site.name.split(",")[0] : sid, desig: e.desig, notes, dual: !!e.dualDesignation });
      });
    });
    return out;
  }, [sites, siteId]);

  const complianceChart = useMemo(() => {
    return sites.map((s) => {
      const items = COMPLIANCE[s.id] || [];
      const c = { name: s.name.split(",")[0], Filed: 0, Pending: 0, Upcoming: 0, Overdue: 0 };
      items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; });
      return c;
    });
  }, [sites]);

  return (
    <div>
      <SectionLabel right={
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="hrsm-focus"
          style={{ padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, fontWeight: 600, background: "#fff" }}>
          <option value="__all__">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
        </select>
      }>Compliance</SectionLabel>
      <p style={{ marginTop: -6, marginBottom: 16, color: C.inkSoft, fontSize: 13.5 }}>Statutory filings and employee-level compliance flags for site workforce, sourced from the HR Attendance database.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <KpiCard label="Overdue filings" value={counts.Overdue} accent={C.red} sub={counts.Overdue ? "Needs immediate action" : "None overdue"} trend={counts.Overdue ? "down" : undefined} />
        <KpiCard label="Pending" value={counts.Pending} accent={C.amberDeep} sub="Due this cycle" />
        <KpiCard label="Upcoming" value={counts.Upcoming} accent={C.blue} sub="Scheduled ahead" />
        <KpiCard label="Filed" value={counts.Filed} accent={C.green} sub="Completed" trend="up" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Statutory filing status by site</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={complianceChart}>
              <CartesianGrid stroke={C.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11.5, fill: C.inkSoft }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12.5, borderRadius: 4, border: `1px solid ${C.border}` }} />
              <Legend wrapperStyle={{ fontSize: 11.5 }} />
              <Bar dataKey="Filed" stackId="c" fill={C.green} radius={[0,0,0,0]} />
              <Bar dataKey="Upcoming" stackId="c" fill={C.blue} />
              <Bar dataKey="Pending" stackId="c" fill={C.amber} />
              <Bar dataKey="Overdue" stackId="c" fill={C.red} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Employee compliance flags — awareness only</div>
          <div style={{ fontSize: 11.5, color: C.inkFaint, marginBottom: 10 }}>Flagged for visibility; does not block salary processing.</div>
          {empFlags.length === 0 ? (
            <Empty text="No employee-level flags for this selection." />
          ) : (
            <div className="hrsm-scroll" style={{ maxHeight: 220, overflow: "auto" }}>
              {empFlags.map((f) => (
                <div key={f.code} style={{ display: "flex", gap: 9, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                  <AlertTriangle size={15} color={f.dual ? C.amberDeep : C.blue} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{f.name} <span style={{ fontWeight: 500, color: C.inkFaint }}>· {f.site} · {f.desig}</span></div>
                    {f.notes.map((n, i) => <div key={i} style={{ fontSize: 12, color: C.inkSoft }}>{n}</div>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 13.5, fontWeight: 700 }}>Filing register</div>
        <div className="hrsm-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ background: C.panelAlt, borderBottom: `1px solid ${C.border}` }}>
                {["Site", "Filing", "Due date", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: 11.5, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.03em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>{r.siteName}</td>
                  <td style={{ padding: "10px 12px", fontSize: 13 }}>{r.item}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12.5 }} className="hrsm-num">{r.due}</td>
                  <td style={{ padding: "10px 12px" }}><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================================
   SITE SETUP — create/configure a site's salary components (draggable)
   and its additional-sheet templates
=========================================================================== */

function DraggableComponentList({ components, setComponents }) {
  const dragIdx = useRef(null);

  const onDragStart = (i) => (e) => { dragIdx.current = i; e.currentTarget.classList.add("dragging"); };
  const onDragEnd = (e) => e.currentTarget.classList.remove("dragging");
  const onDragOver = (i) => (e) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    setComponents((cur) => {
      const next = [...cur];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(i, 0, moved);
      dragIdx.current = i;
      return next;
    });
  };

  const toggleEnabled = (id) => setComponents((cur) => cur.map((c) => c.id === id ? { ...c, enabled: !c.enabled } : c));
  const toggleAutoAdjust = (id) => setComponents((cur) => cur.map((c) => c.id === id ? { ...c, autoAdjust: !c.autoAdjust } : c));
  const removeComponent = (id) => setComponents((cur) => cur.filter((c) => c.id !== id));
  const updateFormula = (id, formula) => setComponents((cur) => cur.map((c) => c.id === id ? { ...c, formula } : c));

  return (
    <div>
      {components.map((c, i) => (
        <div
          key={c.id}
          draggable
          onDragStart={onDragStart(i)}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver(i)}
          className="hrsm-row-drag"
          style={{
            padding: "10px 12px", marginBottom: 6,
            background: c.enabled === false ? C.panelAlt : "#fff", border: `1px solid ${C.border}`, borderRadius: 5,
            cursor: "grab",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GripVertical size={15} color={C.inkFaint} />
            <span className="hrsm-num" style={{ fontSize: 11, color: C.inkFaint, width: 18 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: c.enabled === false ? C.inkFaint : C.ink }}>{c.label}</div>
            </div>
            <span className="hrsm-head" style={{
              fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 3, textTransform: "uppercase",
              background: c.type === "earning" ? C.greenSoft : C.redSoft, color: c.type === "earning" ? C.green : C.red,
            }}>{c.type}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.inkSoft, cursor: "pointer" }}>
              <input type="checkbox" checked={c.enabled !== false} onChange={() => toggleEnabled(c.id)} /> Enabled
            </label>
            {c.custom && (
              <button onClick={() => removeComponent(c.id)} className="hrsm-focus" style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, display: "flex" }} title="Remove component">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {c.custom && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, marginLeft: 33 }}>
              <FunctionSquare size={13} color={C.violet} style={{ flexShrink: 0 }} />
              <input value={c.formula || ""} onChange={(e) => updateFormula(c.id, e.target.value)} placeholder="e.g. 40% of Earned Basic, or a fixed ₹ amount"
                className="hrsm-focus" style={{ flex: 1, fontSize: 12, padding: "5px 8px", border: `1px solid ${C.border}`, borderRadius: 4 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.inkSoft, cursor: "pointer", whiteSpace: "nowrap" }} title="When on, this component recalculates automatically whenever Basic/Gross changes; when off it stays a fixed editable value">
                <input type="checkbox" checked={!!c.autoAdjust} onChange={() => toggleAutoAdjust(c.id)} /> Auto-adjust
              </label>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AddComponentForm({ onAdd }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("earning");
  const [formula, setFormula] = useState("");
  const [autoAdjust, setAutoAdjust] = useState(true);

  const submit = () => {
    if (!label.trim()) return;
    onAdd({
      id: "custom_" + label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString().slice(-4),
      label: label.trim(), type, formula: formula.trim(), autoAdjust, enabled: true, custom: true, editable: true,
    });
    setLabel(""); setFormula("");
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 10, background: C.panelAlt, border: `1px dashed ${C.borderStrong}`, borderRadius: 5, marginBottom: 12 }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Component name, e.g. Site Risk Allowance"
        className="hrsm-focus" style={{ flex: "1 1 190px", padding: "7px 9px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
      <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: "7px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }}>
        <option value="earning">Earning</option>
        <option value="deduction">Deduction</option>
      </select>
      <input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="Formula, e.g. 40% of Earned Basic"
        className="hrsm-focus" style={{ flex: "1 1 190px", padding: "7px 9px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12.5 }} />
      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.inkSoft, cursor: "pointer" }} title="Recalculate automatically when Basic/Gross changes">
        <input type="checkbox" checked={autoAdjust} onChange={(e) => setAutoAdjust(e.target.checked)} /> Auto-adjust
      </label>
      <Btn size="sm" variant="primary" icon={Plus} onClick={submit}>Add component</Btn>
    </div>
  );
}

function SiteSetup({ sites, setSites }) {
  const [siteId, setSiteId] = useState("__new__");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [ocNo, setOcNo] = useState("");
  const [cycleDay, setCycleDay] = useState(5);
  const [components, setComponents] = useState(DEFAULT_COMPONENTS.map((c) => ({ ...c, enabled: true })));
  const [sheetTemplates, setSheetTemplates] = useState(["OT Sheet"]);
  const [newSheetName, setNewSheetName] = useState("");
  const [saved, setSaved] = useState(false);

  const loadSite = (id) => {
    setSiteId(id);
    setSaved(false);
    if (id === "__new__") {
      setName(""); setClient(""); setLocation(""); setOcNo(""); setCycleDay(5);
      setComponents(DEFAULT_COMPONENTS.map((c) => ({ ...c, enabled: true })));
      setSheetTemplates([]);
    } else {
      const s = sites.find((x) => x.id === id);
      setName(s.name); setClient(s.client); setLocation(s.location); setOcNo(s.ocNo); setCycleDay(s.cycleDay);
      setComponents(DEFAULT_COMPONENTS.map((c) => ({ ...c, enabled: true })));
      setSheetTemplates(s.sheets);
    }
  };

  const addSheetTemplate = () => {
    if (!newSheetName.trim()) return;
    setSheetTemplates((cur) => [...cur, newSheetName.trim()]);
    setNewSheetName("");
  };

  const save = () => {
    if (!name.trim()) return;
    if (siteId === "__new__") {
      const id = "s" + (sites.length + 1) + "_" + Date.now().toString().slice(-4);
      setSites((cur) => [...cur, { id, name, client, location, ocNo, cycleDay: Number(cycleDay), status: "pending", sheets: sheetTemplates }]);
      EMPLOYEES[id] = [];
      setSiteId(id);
    } else {
      setSites((cur) => cur.map((s) => s.id === siteId ? { ...s, name, client, location, ocNo, cycleDay: Number(cycleDay), sheets: sheetTemplates } : s));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div>
      <SectionLabel right={saved && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.green, fontSize: 13, fontWeight: 700 }}><CheckCircle2 size={15} /> Saved</span>
      )}>Site Setup</SectionLabel>
      <p style={{ marginTop: -6, marginBottom: 16, color: C.inkSoft, fontSize: 13.5 }}>Configure component structure once, at site onboarding — reorder and enable/disable the salary line-items this site uses.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => loadSite("__new__")} style={{ padding: "8px 14px", borderRadius: 4, border: `1px solid ${siteId === "__new__" ? C.amberDeep : C.border}`, background: siteId === "__new__" ? C.amber : "#fff", color: siteId === "__new__" ? C.amberInk : C.ink, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <Plus size={14} /> New site
        </button>
        {sites.map((s) => (
          <button key={s.id} onClick={() => loadSite(s.id)} style={{ padding: "8px 14px", borderRadius: 4, border: `1px solid ${siteId === s.id ? C.navy : C.border}`, background: siteId === s.id ? C.navy : "#fff", color: siteId === s.id ? "#fff" : C.ink, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {s.name.split(",")[0]}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel style={{ padding: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Site details</div>
          <Field label="Site name"><input className="hrsm-focus" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Sajjan India Ltd, Ankleshwar" /></Field>
          <Field label="Client"><input className="hrsm-focus" value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} /></Field>
          <Field label="Location"><input className="hrsm-focus" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Field label="OC / Contract No." style={{ flex: 1 }}><input className="hrsm-focus" value={ocNo} onChange={(e) => setOcNo(e.target.value)} style={inputStyle} /></Field>
            <Field label="Salary cycle day" style={{ width: 140 }}><input type="number" className="hrsm-focus" value={cycleDay} onChange={(e) => setCycleDay(e.target.value)} style={inputStyle} /></Field>
          </div>

          <div style={{ fontSize: 13.5, fontWeight: 700, margin: "18px 0 10px" }}>Additional sheet templates</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {sheetTemplates.map((s, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: C.blueSoft, color: C.blue, padding: "5px 10px", borderRadius: 14, fontSize: 12, fontWeight: 600 }}>
                <FileSpreadsheet size={12} /> {s}
                <button onClick={() => setSheetTemplates((cur) => cur.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: C.blue, display: "flex" }}><X size={12} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={newSheetName} onChange={(e) => setNewSheetName(e.target.value)} placeholder="e.g. TPT Allowance, Conveyance..." className="hrsm-focus" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addSheetTemplate()} />
            <Btn size="sm" icon={Plus} onClick={addSheetTemplate}>Add</Btn>
          </div>

          <Btn variant="primary" icon={Save} onClick={save} style={{ marginTop: 20, width: "100%", justifyContent: "center" }}>
            {siteId === "__new__" ? "Create site" : "Save changes"}
          </Btn>
        </Panel>

        <Panel style={{ padding: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Salary component structure</div>
          <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 12 }}>Drag to reorder how components appear on this site's payslip and salary sheet. Add a component with a formula, and toggle auto-adjust so it recalculates on its own when Basic or Gross changes.</div>
          <AddComponentForm onAdd={(c) => setComponents((cur) => [...cur, c])} />
          <DraggableComponentList components={components} setComponents={setComponents} />
        </Panel>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13.5 };
function Field({ label, children, style }) {
  return <div style={{ marginBottom: 12, ...style }}><label style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft, display: "block", marginBottom: 4 }}>{label}</label>{children}</div>;
}

/* ============================================================================
   APP SHELL
=========================================================================== */

export default function App() {
  const [nav, setNav] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [sites, setSites] = useState(SITES);
  const [selectedSites, setSelectedSites] = useState([]);
  const [processingSite, setProcessingSite] = useState("s1");
  const [batch, setBatch] = useState(["s1"]);
  const [month, setMonth] = useState("July");
  const [year, setYear] = useState(2026);
  const [openEmp, setOpenEmp] = useState(null);
  const [holds, setHolds] = useState({});

  const notifications = useMemo(() => buildNotifications(sites), [sites]);

  const onJumpNotification = (n) => {
    if (n.type === "disbursement") { setProcessingSite(n.siteId); setBatch([n.siteId]); setNav("process"); }
    else if (n.type === "transfer") { setProcessingSite(n.siteId); setBatch([n.siteId]); setNav("process"); }
    else if (n.type === "dual-designation") { setNav("compliance"); }
    else if (n.type === "compliance") { setNav("compliance"); }
  };

  return (
    <div className="hrsm-root" style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
      <style>{FONT_STACK}</style>
      <Sidebar nav={nav} setNav={setNav} collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopBar nav={nav} notifications={notifications} onJump={onJumpNotification} />
        <div style={{ padding: "22px 28px 60px", maxWidth: 1400 }}>
          {nav === "dashboard" && (
            <Dashboard sites={sites} month={month} year={year} setMonth={setMonth} setYear={setYear}
              openEmployee={setOpenEmp} setNav={setNav} setProcessingSite={(id) => { setProcessingSite(id); setBatch([id]); }} />
          )}
          {nav === "sites" && (
            <SitesList sites={sites} selected={selectedSites} setSelected={setSelectedSites} setNav={setNav}
              setProcessingSite={setProcessingSite} setBatch={setBatch} />
          )}
          {nav === "process" && (
            <ProcessSalary siteId={processingSite} setSiteId={setProcessingSite} batch={batch} sites={sites}
              month={month} year={year} setMonth={setMonth} setYear={setYear} openEmployee={setOpenEmp} />
          )}
          {nav === "history" && <SalaryHistory sites={sites} holds={holds} setHolds={setHolds} />}
          {nav === "reports" && <Reports sites={sites} />}
          {nav === "compliance" && <Compliance sites={sites} />}
          {nav === "setup" && <SiteSetup sites={sites} setSites={setSites} />}
        </div>
      </div>
      <EmployeeDrawer employee={openEmp} onClose={() => setOpenEmp(null)} />
    </div>
  );
}
