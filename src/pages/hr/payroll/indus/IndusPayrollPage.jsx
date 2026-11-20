import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useAuth } from "../../../../contexts/AuthContext";
import { listAllSites } from "../../../../lib/siteAttendance/siteAttendanceApi";
import { browserDownloads, openLocalPayrollDb } from "./payDb";
import { fetchSiteAttendanceSummary } from "./siteAttSummary";
import "./indusPayroll.css";
import engineSource from "./runtime/engine.js?raw";
import structureSource from "./runtime/structure.js?raw";
import sitesSource from "./runtime/sites.js?raw";
import appSource from "./runtime/app.js?raw";

/** Must match `window.__indusPayrollBuild` in runtime/app.js — bump both when app.js changes. */
const PAYROLL_APP_BUILD = 10;

const BASE = "/app/hr/payroll/salary";

export const PAYROLL_VIEWS = [
  "dashboard",
  "process",
  "employees",
  "held",
  "loans",
  "revisions",
  "reports",
  "compliance",
  "masters",
  "setup",
  "components",
  "formulas",
];

const VIEW_SET = new Set(PAYROLL_VIEWS);

/** Old Salary Management paths, kept so existing links open the matching screen. */
const ALIAS = {
  sites: "setup",
  slips: "compliance",
  "site-master": "setup",
  "formula-library": "formulas",
  "payroll-package-builder": "setup",
  "people-master": "employees",
  "attendance-integration": "process",
  "compliance-management": "masters",
  "payroll-processing": "process",
  "payroll-approval": "process",
  payslips: "compliance",
  "reports-exports": "reports",
  "employee-exit": "employees",
  "full-final-settlement": "process",
  settings: "masters",
  "employee-master": "employees",
  run: "process",
  "site-formulas": "formulas",
  "manual-inputs": "process",
  pf: "masters",
  esic: "masters",
  pt: "masters",
  tds: "masters",
  register: "compliance",
  outputs: "compliance",
};

const SHELL = `<div class="app">
  <main><div class="top"><div><h1 id="ptitle">Dashboard</h1><div class="ctx" id="pctx"></div></div><span class="sp"></span>
    <span id="dbstate" class="dbs"><i></i>Connecting…</span></div>
    <div class="page" id="page"></div></main>
</div>
<div id="modal"></div>`;

export function viewFromPath(pathname) {
  const path = (pathname || "").replace(/\/$/, "");
  const rest = path.startsWith(BASE) ? path.slice(BASE.length).replace(/^\//, "") : "";
  const first = rest.split("/")[0] || "dashboard";
  if (ALIAS[first]) return ALIAS[first];
  return VIEW_SET.has(first) ? first : "dashboard";
}

function runClassic(code) {
  const script = document.createElement("script");
  script.textContent = code;
  document.body.appendChild(script);
  script.remove();
}

let dbPromise = null;
let payrollRootEl = null;

function ensurePayrollRoot() {
  if (payrollRootEl && payrollRootEl.isConnected === false) {
    /* parked between routes — keep the same node so salary state stays */
  }
  if (!payrollRootEl) {
    payrollRootEl = document.createElement("div");
    payrollRootEl.id = "indus-payroll-root";
    payrollRootEl.className = "indus-payroll";
  }
  payrollRootEl.querySelectorAll("nav, #nav").forEach((node) => node.remove());
  return payrollRootEl;
}

export function PayrollScreen({ view }) {
  const { user, userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const slotRef = useRef(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const actorRef = useRef({ id: user?.id || null, name: "" });
  actorRef.current = {
    id: user?.id || null,
    name: userProfile?.username || user?.email || "User",
    email: user?.email || "",
  };

  useEffect(() => {
    const id = "indus-payroll-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    const canonical = `${BASE}/${view}`;
    if (location.pathname.replace(/\/$/, "") !== canonical) {
      navigate(canonical, { replace: true });
    }
  }, [view, location.pathname, navigate]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    const root = ensurePayrollRoot();
    slot.appendChild(root);
    let cancelled = false;
    if (!root.querySelector("#page")) root.innerHTML = SHELL;
    root.querySelectorAll("nav, #nav").forEach((node) => node.remove());
    window.XLSX = XLSX;

    const actor = () => actorRef.current;
    window.claude = {
      use: async (name) => {
        if (name === "db") {
          if (!dbPromise) dbPromise = openLocalPayrollDb();
          return dbPromise;
        }
        if (name === "downloads") return browserDownloads();
        if (name === "user") return actor();
        return null;
      },
    };
    window.__indusPayrollOnView = (next) => {
      if (!VIEW_SET.has(next)) return;
      const path = `${BASE}/${next}`;
      if (window.location.pathname.replace(/\/$/, "") !== path) navigate(path);
    };
    window.__indusPayrollFetchSiteAttSummary = (args) => fetchSiteAttendanceSummary(args);

    if (!window.PayEngine) runClassic(engineSource);
    if (!window.STRUCT) runClassic(structureSource);
    if (!window.SITES) runClassic(sitesSource);
    if (window.__indusPayrollBoot && window.__indusPayrollBuild !== PAYROLL_APP_BUILD) {
      window.location.reload();
      return;
    }
    if (!window.__indusPayrollBoot) runClassic(appSource);

    const bootPayroll = async () => {
      const bootOpts = { user: actor(), view: viewRef.current, attendanceSites: [] };
      try {
        bootOpts.attendanceSites = await listAllSites();
      } catch (err) {
        console.error("Process salary could not load attendance sites", err);
        bootOpts.attendanceSites = [];
      }
      if (cancelled) return;
      if (window.__indusPayrollBoot) window.__indusPayrollBoot(bootOpts);
    };
    bootPayroll();

    return () => {
      cancelled = true;
      if (root.parentNode === slot) root.remove();
    };
  }, [navigate, user?.id]);

  useEffect(() => {
    if (window.__indusPayrollSetView) window.__indusPayrollSetView(view);
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    const refreshAttendanceSites = async () => {
      if (!window.__indusPayrollSetAttendanceSites) return;
      try {
        // Same source as Attendance / Site Master — every site added there appears here.
        const attendanceSites = await listAllSites();
        if (!cancelled) window.__indusPayrollSetAttendanceSites(attendanceSites);
      } catch (err) {
        console.error("Process salary could not refresh attendance sites", err);
      }
    };
    refreshAttendanceSites();
    const onFocus = () => refreshAttendanceSites();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAttendanceSites();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view, user?.id]);

  return <div ref={slotRef} className="indus-payroll-host" />;
}

export default function IndusPayrollPage() {
  const location = useLocation();
  return <PayrollScreen view={viewFromPath(location.pathname)} />;
}
