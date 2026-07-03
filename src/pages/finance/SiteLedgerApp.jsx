import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { loadLedgerStore, saveLedgerPartial, saveLedgerStore, savePeriodRecord, mergePeriodEntry, REIMBURSEMENT_TYPES, REIMBURSEMENT_OTHER_KEY, newReimbursementId, normalizeReimbursementsFromRecord, reimbursementTotal, reimbursementRowLabel, reimbursementDisplayLines } from "./api/siteLedgerStore";
import { PeriodDateSelect, formatPeriodDateDDMMYYYY } from "./components/PeriodDateSelect";
import { FinanceDateInput } from "./components/FinanceDateInput";
import { DateInput } from "../../components/DateInput";
import FinanceTypographyStyles from "./components/FinanceTypographyStyles";
import { SiteClientAutocomplete } from "./components/SiteClientAutocomplete";
import { PlAuditPanel } from "./components/PlAuditPanel";
import { useFinance } from "./contexts/FinanceContext";
import { buildPeriodAuditMeta } from "./lib/plAudit";
import {
  buildMonthOptions,
  monthLabelOf as periodMonthLabelOf,
  periodAbsoluteIndex as monthIdx,
  periodKeysBetween,
  indexToPeriodKey,
  prevPeriodKey,
  PERIOD_END_YEAR,
  dateToPeriodKey,
  periodKeyToDateStart,
  currentPeriodKey,
  PENDING_HISTORY_CUTOFF_KEY,
} from "./lib/periods";
import { formatFinanceDate, formatFinanceLabel } from "./lib/formatters";
import { subscribeFinanceRefresh } from "../../services/financeApi";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { financePath } from "./navConfig";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Building2, PlusCircle, Search, AlertTriangle,
  TrendingUp, Wallet, Receipt, Percent, IndianRupee, ChevronLeft,
  ArrowUpRight, ArrowDownRight, Copy, Download, X, Pencil,
  Trash2, CircleDot, Sliders, GripVertical, CalendarClock, Plus,
  Target, FileClock, ChevronRight, ChevronDown, RotateCcw, FileBarChart, AlertCircle, Settings, History,
  Home, Eye, MoreVertical, CheckCircle, XCircle, FileCheck, Clock,
} from "lucide-react";

function contractPeriodFromDateInput(dateStr) {
  return dateToPeriodKey(dateStr) || null;
}

function contractDateInputValue(periodOrDate) {
  if (!periodOrDate) return "";
  const s = String(periodOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return periodKeyToDateStart(s) || "";
  return "";
}

/* ───────────────────────── DOMAIN MODEL ─────────────────────────
   Two-level expense hierarchy:
     PARENTS  (6 reportable heads, shown by default)
       └─ CHILD_HEADS (the atomic cost lines; data is entered here)
   A site's `structure` = ordered parents, each with ordered child keys it uses.
*/

const REVENUE_ITEMS = [
  { key: "saleRevenue", label: "Sale Revenue", sign: 1 },
  { key: "esicBill", label: "Reimbursement", sign: 1 },
  { key: "creditNote", label: "less: Credit Note / deductions", sign: -1 },
];

const DEFAULT_PARENTS = [
  { key: "salaryCost", label: "Salary Cost", color: "#1F6F4E" },
  { key: "empBenefit", label: "Employee Benefit", color: "#2F7D9E" },
  { key: "facilities", label: "Facilities & Site Keep-up", color: "#C97A12" },
  { key: "uniformPpe", label: "Uniform/PPE's", color: "#6B7C3A" },
  { key: "adminMisc", label: "Admin & Other Misc. Expenses", color: "#9A4A3A" },
  { key: "fireTenderVehicle", label: "Fire Tender & Utility Vehicle", color: "#3E6B89" },
];
/** Migrate legacy parent keys from older Site Ledger versions. */
const PARENT_KEY_MIGRATE = {
  vehicle: "fireTenderVehicle",
  maintenance: "fireTenderVehicle",
  admin: "adminMisc",
  facilities: "facilities",
};
const PARENT_PALETTE = ["#1F6F4E", "#2F7D9E", "#C97A12", "#6B7C3A", "#9A4A3A", "#3E6B89"];
// Live, mutable registry (kept in sync from App state so module helpers stay valid)
const PARENTS = DEFAULT_PARENTS.map((p) => ({ ...p }));
function syncParents(arr) { PARENTS.splice(0, PARENTS.length, ...arr.map((p) => ({ ...p }))); }
const parentDef = (k) => PARENTS.find((p) => p.key === k);
const parentColor = (k) => parentDef(k)?.color || "#9A4A3A";
const parentLabel = (k) => parentDef(k)?.label || k;

// Library of child cost lines. `parent` is the default parent (sites can move them).
const CHILD_HEADS = [
  { key: "salaries", label: "Gross Salary", parent: "salaryCost" },
  { key: "salariesOT", label: "Overtime Payment", parent: "salaryCost" },
  { key: "holiday", label: "National / Public Holiday Payment", parent: "salaryCost" },
  { key: "voucher", label: "Voucher Payment", parent: "salaryCost" },
  { key: "bonus", label: "Bonus", parent: "salaryCost" },
  { key: "gratuity", label: "Gratuity", parent: "salaryCost" },
  { key: "pf", label: "Provident Fund (PF)", parent: "empBenefit" },
  { key: "esicEmp", label: "ESI / WC", parent: "empBenefit" },
  { key: "insurance", label: "Insurance / Mediclaim", parent: "empBenefit" },
  { key: "medical", label: "Medical Expense", parent: "empBenefit" },
  { key: "empBenefit", label: "Employee welfare / benefit", parent: "empBenefit" },
  { key: "uniform", label: "Uniform / PPE", parent: "uniformPpe" },
  { key: "houseRent", label: "House Rent", parent: "facilities" },
  { key: "cook", label: "Cook Salary", parent: "facilities" },
  { key: "housekeeping", label: "Housekeeping salary & material", parent: "facilities" },
  { key: "vehicleRent", label: "Vehicle rent (temporary)", parent: "fireTenderVehicle" },
  { key: "vehicleRepair", label: "Vehicle repair & maintenance", parent: "fireTenderVehicle" },
  { key: "vehicleEMI", label: "Vehicle EMI / Reg / Insurance", parent: "fireTenderVehicle" },
  { key: "fuel", label: "Petrol & Diesel", parent: "fireTenderVehicle" },
  { key: "purchaseRepair", label: "Purchase / repair & maint.", parent: "fireTenderVehicle" },
  { key: "equipment", label: "Equipment / Tools purchase", parent: "fireTenderVehicle" },
  { key: "labourLicence", label: "Labour Licence fees", parent: "adminMisc" },
  { key: "indirect", label: "Indirect expenses", parent: "adminMisc" },
  { key: "bankCharges", label: "Bank charges / BG", parent: "adminMisc" },
  { key: "bizPromo", label: "Business Promotion", parent: "adminMisc" },
];
const DEFAULT_KEYS = CHILD_HEADS.map((c) => c.key);

const TARGET_MARGIN = 12;
const WARN_MARGIN = 8;

const PlMarginContext = React.createContext({ targetMargin: TARGET_MARGIN, warnMargin: WARN_MARGIN });
function usePlMargins() {
  return React.useContext(PlMarginContext);
}

const SL_VALID_VIEWS = new Set(["overview", "sites", "site", "config", "entry", "reports"]);

function readSlStateFromUrl(searchParams) {
  const v = searchParams.get("slView");
  const cur = currentPeriodKey();
  return {
    view: SL_VALID_VIEWS.has(v) ? v : "overview",
    activeSite: searchParams.get("slSite") || null,
    month: searchParams.get("slMonth") || cur,
    showHistorical: searchParams.get("slHist") === "1",
  };
}

/* ───────────────────────── MONTHS ───────────────────────── */
const MONTHS = buildMonthOptions();
const monthLabelOf = (k) => formatPeriodDateDDMMYYYY(k) || periodMonthLabelOf(k, MONTHS);

function migrateStructureParents(structure) {
  return (structure || []).map((g) => ({
    parent: PARENT_KEY_MIGRATE[g.parent] || g.parent,
    children: [...(g.children || [])],
  }));
}

function mergeSiteLibrary(site, globalLibrary) {
  const custom = site?.customHeads || [];
  const merged = [...globalLibrary];
  custom.forEach((h) => {
    if (!merged.some((x) => x.key === h.key)) {
      merged.push({ ...h, custom: true, siteScoped: true });
    }
  });
  return merged;
}

function pendingMonthsFiltered(site, records, uptoMk, { expandHistory = false } = {}) {
  const all = pendingMonths(site, records, uptoMk);
  if (expandHistory) return all;
  const cutoff = monthIdx(PENDING_HISTORY_CUTOFF_KEY);
  return all.filter((mk) => monthIdx(mk) >= cutoff);
}

/* ───────────────────────── FORMATTERS ───────────────────────── */
const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
function inrShort(n) {
  const a = Math.abs(n || 0), s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}k`;
  return `${s}₹${Math.round(a)}`;
}
const pct = (n) => (n || 0).toFixed(1) + "%";
const slug = (s) => (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "head");

/* ───────────────────────── SITE VERSIONING ───────────────────────── */
function contractExpired(site, asOfMonth) {
  if (!site?.contractEnd || !asOfMonth) return false;
  return monthIdx(asOfMonth) > contractEndIdx(site);
}
function isSiteActive(site) {
  return (site?.status || "active") === "active";
}
function versionLabel(site) {
  return `v${site.version || 1}`;
}
function sitesInGroup(sites, siteGroup) {
  return sites
    .filter((s) => (s.siteGroup || s.id) === siteGroup)
    .sort((a, b) => (b.version || 1) - (a.version || 1) || monthIdx(b.contractStart || "0000-00") - monthIdx(a.contractStart || "0000-00"));
}
function enrichSitesWithVersions(sites, asOfMonth) {
  if (!sites.length) return sites;
  const byName = {};
  sites.forEach((s) => {
    const nk = (s.name || "").trim().toLowerCase();
    if (!byName[nk]) byName[nk] = [];
    byName[nk].push(s);
  });
  const withMeta = sites.map((s) => {
    const nk = (s.name || "").trim().toLowerCase();
    const sameName = byName[nk] || [s];
    const siteGroup = s.siteGroup || (sameName.length > 1 ? slug(s.name) : s.id);
    return {
      ...s,
      siteGroup,
      version: s.version || 1,
      status: s.status || "active",
    };
  });
  const groups = {};
  withMeta.forEach((s) => {
    if (!groups[s.siteGroup]) groups[s.siteGroup] = [];
    groups[s.siteGroup].push(s);
  });
  const versioned = withMeta.map((s) => {
    const g = groups[s.siteGroup] || [s];
    if (g.length <= 1) return s;
    const sorted = [...g].sort((a, b) => monthIdx(a.contractStart || "0000-00") - monthIdx(b.contractStart || "0000-00"));
    const ver = sorted.findIndex((x) => x.id === s.id) + 1;
    return { ...s, version: s.version > 1 ? s.version : ver };
  });
  if (!asOfMonth) return versioned;
  return versioned.map((s) => (
    isSiteActive(s) && contractExpired(s, asOfMonth) ? { ...s, status: "inactive" } : s
  ));
}
function prepareNewSiteVersion(existingSites, newSite) {
  const group = newSite.siteGroup || slug(newSite.name);
  const siblings = existingSites.filter((s) => (s.siteGroup || s.id) === group || s.name.trim().toLowerCase() === newSite.name.trim().toLowerCase());
  const resolvedGroup = siblings[0]?.siteGroup || group;
  const maxVer = siblings.reduce((m, s) => Math.max(m, s.version || 1), 0);
  let id = `${resolvedGroup}-v${maxVer + 1}`;
  let n = maxVer + 1;
  while (existingSites.some((s) => s.id === id)) id = `${resolvedGroup}-v${++n}`;
  const deactivated = existingSites.map((s) => {
    const inGroup = (s.siteGroup || s.id) === resolvedGroup
      || s.name.trim().toLowerCase() === newSite.name.trim().toLowerCase();
    return inGroup ? { ...s, siteGroup: resolvedGroup, status: "inactive" } : s;
  });
  return [
    ...deactivated,
    {
      ...newSite,
      id,
      siteGroup: resolvedGroup,
      version: maxVer + 1,
      status: "active",
    },
  ];
}
function activeSitesOnly(sites) {
  return sites.filter(isSiteActive);
}

/* ───────────────────────── STRUCTURE HELPERS ───────────────────────── */
// Full structure incl. empty parents, in PARENTS order
function displayStructure(site) {
  return PARENTS.map((p) => {
    const g = (site.structure || []).find((x) => x.parent === p.key);
    return { parent: p.key, children: g ? [...g.children] : [] };
  });
}
/** Persist only parent groups that have assigned cost lines (matches DB shape). */
function compactStructure(structure) {
  const seen = new Set();
  return (structure || [])
    .map((g) => {
      const children = (g.children || []).filter((k) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { parent: g.parent, children };
    })
    .filter((g) => g.children.length > 0);
}
const siteChildKeys = (site) => (site.structure || []).flatMap((g) => g.children);

/* ───────────────────────── CALC (child-level + amortization) ───────────────────────── */
function parseEntryAmount(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function recognizedExpenses(site, mk, records, directOverride) {
  const rec = directOverride || records[`${site.id}__${mk}`] || {};
  const keys = new Set(siteChildKeys(site));
  (site.spreads || []).forEach((s) => keys.add(s.head));
  const direct = {}, amort = {}, total = {};
  keys.forEach((k) => { direct[k] = parseEntryAmount(rec[k]); amort[k] = 0; });
  (site.spreads || []).forEach((sp) => {
    const si = monthIdx(sp.start), ci = monthIdx(mk), m = Number(sp.months) || 0;
    if (si >= 0 && m > 0 && ci >= si && ci < si + m) amort[sp.head] = (amort[sp.head] || 0) + Number(sp.total) / m;
  });
  keys.forEach((k) => { total[k] = (direct[k] || 0) + (amort[k] || 0); });
  return { direct, amort, total, keys: [...keys] };
}
function calcSite(site, mk, records, directOverride) {
  const rec = directOverride || records[`${site.id}__${mk}`] || {};
  const revenue = REVENUE_ITEMS.reduce((s, it) => {
    if (it.key === "esicBill") return s + it.sign * reimbursementTotal(rec);
    return s + it.sign * parseEntryAmount(rec[it.key]);
  }, 0);
  const ex = recognizedExpenses(site, mk, records, directOverride);
  const expense = Object.values(ex.total).reduce((a, b) => a + b, 0);
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, expense, profit, margin, ex };
}
function parentTotalsSite(site, mk, records) {
  const ex = recognizedExpenses(site, mk, records);
  const t = {};
  displayStructure(site).forEach((g) => { t[g.parent] = g.children.reduce((a, ck) => a + (ex.total[ck] || 0), 0); });
  return t;
}
// expandable tree for the statement: parents with child est/actual/var
function expenseTree(site, mk, records, estVer) {
  const ex = recognizedExpenses(site, mk, records);
  const estByHead = estVer?.expenses || {};
  return displayStructure(site).map((g) => {
    const children = g.children.map((ck) => ({ key: ck, label: childLabel(site, ck), actual: ex.total[ck] || 0, amort: ex.amort[ck] || 0, est: Number(estByHead[ck]) || 0 }));
    const actual = children.reduce((a, c) => a + c.actual, 0);
    const est = children.reduce((a, c) => a + c.est, 0);
    const amort = children.reduce((a, c) => a + c.amort, 0);
    return { parent: g.parent, label: parentLabel(g.parent), color: parentColor(g.parent), children, actual, est, amort };
  });
}
function childLabel(site, key) {
  const lib = mergeSiteLibrary(site, site._lib || CHILD_HEADS);
  const hit = lib.find((c) => c.key === key);
  const raw = hit?.label || CHILD_HEADS.find((c) => c.key === key)?.label || key;
  return formatFinanceLabel(raw);
}

// Estimate (budget) in force for a month
function estimateFor(site, mk) {
  const versions = (site.estimates || []).slice().sort((a, b) => monthIdx(a.effectiveFrom) - monthIdx(b.effectiveFrom));
  let chosen = null;
  versions.forEach((v) => { if (monthIdx(v.effectiveFrom) <= monthIdx(mk)) chosen = v; });
  return chosen || versions[0] || null;
}
function estTotals(est) {
  if (!est) return null;
  const revenue = REVENUE_ITEMS.reduce((s, it) => s + it.sign * (Number(est.revenue?.[it.key]) || 0), 0);
  const byHead = est.expenses || {};
  const expense = Object.values(byHead).reduce((a, b) => a + (Number(b) || 0), 0);
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, expense, profit, margin, byHead };
}
// contract window
const contractEndIdx = (site) =>
  site.contractEnd ? monthIdx(site.contractEnd) : monthIdx(`${PERIOD_END_YEAR}-12`);
const remainingMonths = (site, startMk) => Math.max(1, contractEndIdx(site) - monthIdx(startMk) + 1);
const inContract = (site, mk) => {
  const i = monthIdx(mk);
  const s = site.contractStart ? monthIdx(site.contractStart) : monthIdx(MONTHS[0]?.key);
  return i >= s && i <= contractEndIdx(site);
};
function expectedMonths(site, uptoMk) {
  const start = site.contractStart || MONTHS[0]?.key;
  const end = site.contractEnd || uptoMk;
  const endCapped = monthIdx(end) > monthIdx(uptoMk) ? uptoMk : end;
  return periodKeysBetween(start, endCapped);
}
const pendingMonths = (site, records, uptoMk) => expectedMonths(site, uptoMk).filter((mk) => !records[`${site.id}__${mk}`]);
const isPending = (site, records, mk) => inContract(site, mk) && !records[`${site.id}__${mk}`];

/* ───────────────────────── NORMALIZE / STORAGE ───────────────────────── */
function grp(parent, children) { return { parent, children }; }
function structureFromKeys(keys) {
  return PARENTS.map((p) => grp(p.key, keys.filter((k) => {
    const def = CHILD_HEADS.find((c) => c.key === k);
    const parent = def?.parent || PARENT_KEY_MIGRATE[def?.parent] || "adminMisc";
    return parent === p.key;
  }))).filter((g) => g.children.length);
}

function emptyStore() {
  return {
    sites: [],
    records: {},
    library: CHILD_HEADS.map((c) => ({ ...c })),
    parents: DEFAULT_PARENTS.map((p) => ({ ...p })),
  };
}

function normalize(data) {
  const library = (data.library && data.library.length) ? [...data.library] : [...CHILD_HEADS];
  const have = new Set(library.map((h) => h.key));
  const sites = (data.sites || []).map((s) => {
    let structure = s.structure;
    if (!structure || !structure.length) {
      const keys = (s.headKeys && s.headKeys.length) ? s.headKeys : [...DEFAULT_KEYS];
      structure = structureFromKeys(keys);
    }
    structure = migrateStructureParents(structure);
    // ensure all referenced child keys exist in library
    structure.forEach((g) => g.children.forEach((k) => { if (!have.has(k)) { library.push({ key: k, label: k, parent: g.parent }); have.add(k); } }));
    return {
      ...s,
      structure,
      spreads: s.spreads || [],
      estimates: s.estimates || [],
      contractStart: s.contractStart || null,
      contractEnd: s.contractEnd || null,
      status: s.status || "active",
      siteGroup: s.siteGroup || null,
      version: s.version || 1,
      customHeads: Array.isArray(s.customHeads) ? s.customHeads : [],
    };
  });
  return { sites: enrichSitesWithVersions(sites), records: data.records || {}, library };
}

async function loadStore() {
  const defaults = emptyStore();
  const result = await loadLedgerStore(defaults.parents, defaults.library);
  if (result.data) {
    return {
      data: normalize({
        ...result.data,
        parents: result.data.parents?.length ? result.data.parents : defaults.parents,
      }),
      ok: true,
      error: null,
    };
  }
  return { data: normalize(defaults), ok: false, error: result.error || null };
}
async function saveStore(data) {
  try {
    await saveLedgerStore({
      sites: data.sites,
      records: data.records,
      library: data.library,
      parents: data.parents,
    });
    return { ok: true, error: null };
  } catch (e) {
    console.error("Finance save failed:", e);
    return { ok: false, error: e?.message || "Save failed" };
  }
}

/* ───────────────────────── SMALL UI ───────────────────────── */
function Kpi({ icon: Icon, label, value, sub, tone = "ink", trend }) {
  const c = tone === "profit" ? "var(--profit)" : tone === "loss" ? "var(--loss)" : tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    <div className="kpi">
      <div className="kpi-top"><span className="kpi-ico" style={{ color: c }}><Icon size={17} /></span><span className="kpi-label">{label}</span></div>
      <div className="kpi-value" style={{ color: c }}>{value}</div>
      {sub != null && <div className="kpi-sub">{trend === "up" && <ArrowUpRight size={13} style={{ color: "var(--profit)" }} />}{trend === "down" && <ArrowDownRight size={13} style={{ color: "var(--loss)" }} />}<span>{sub}</span></div>}
    </div>
  );
}
function Card({ title, right, children, pad = true, className = "" }) {
  return (<div className={"card " + className}>{(title || right) && <div className="card-head"><h3>{title}</h3>{right}</div>}<div style={{ padding: pad ? "0 18px 18px" : 0 }}>{children}</div></div>);
}
function StatusPill({ margin, profit }) {
  const { targetMargin, warnMargin } = usePlMargins();
  let label = "On target", cls = "pill-ok";
  if (profit < 0) { label = "Loss"; cls = "pill-loss"; }
  else if (margin < warnMargin) { label = "Thin"; cls = "pill-warn"; }
  else if (margin < targetMargin) { label = "Watch"; cls = "pill-watch"; }
  return <span className={"pill " + cls}><CircleDot size={9} /> {label}</span>;
}
function TipBox({ active, payload, fmt }) {
  if (!active || !payload || !payload.length) return null;
  return (<div className="tip">{payload[0].payload.name && <div className="tip-title">{payload[0].payload.name}</div>}{payload.map((p, i) => <div key={i} className="tip-row"><span className="tip-dot" style={{ background: p.color || p.fill }} /><span>{p.name}</span><strong>{fmt ? fmt(p.value) : p.value}</strong></div>)}</div>);
}
const vcell = (actual, estimate, lowerIsBetter) => {
  const v = actual - estimate; const fav = lowerIsBetter ? v <= 0 : v >= 0;
  const vp = estimate !== 0 ? (v / Math.abs(estimate)) * 100 : null;
  return { v, fav, vp };
};
function VarCells({ est, actual, lowerIsBetter, hasEst }) {
  const c = vcell(actual, est, lowerIsBetter);
  return (<>
    <td className="r mono dim vtbl-num">{hasEst ? inr(est) : "—"}</td>
    <td className="r mono vtbl-num">{inr(actual)}</td>
    <td className="r mono vtbl-num" style={{ color: hasEst ? (c.fav ? "var(--profit)" : "var(--loss)") : "var(--muted)" }}>{hasEst ? `${c.v >= 0 ? "+" : ""}${inr(c.v)}` : "—"}</td>
    <td className="r mono dim vtbl-num">{c.vp == null ? "—" : `${c.vp >= 0 ? "+" : ""}${c.vp.toFixed(0)}%`}</td>
  </>);
}

/* ───────────────────────── MAIN ───────────────────────── */
export default function SiteLedgerApp({ embedded = true }) {
  const navigate = useNavigate();
  const { targetMargin: ctxTarget, warnMargin: ctxWarn } = useFinance();
  const marginCtx = useMemo(
    () => ({
      targetMargin: Number(ctxTarget) || TARGET_MARGIN,
      warnMargin: Number(ctxWarn) || WARN_MARGIN,
    }),
    [ctxTarget, ctxWarn],
  );
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlInit = useMemo(() => readSlStateFromUrl(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [sites, setSites] = useState([]);
  const [records, setRecords] = useState({});
  const [library, setLibrary] = useState(CHILD_HEADS);
  const [parents, setParents] = useState(() => DEFAULT_PARENTS.map((p) => ({ ...p })));
  const [view, setView] = useState(urlInit.view);
  const [activeSite, setActiveSite] = useState(urlInit.activeSite);
  const [month, setMonth] = useState(urlInit.month);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editSite, setEditSite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showHistorical, setShowHistorical] = useState(urlInit.showHistorical);
  const [historyGroup, setHistoryGroup] = useState(null);
  const saveTimer = useRef(null);
  const saveImmediate = useRef(false);
  const skipNextAutosave = useRef(false);
  const setupPersistTimer = useRef(null);
  const setupPersistPending = useRef(null);
  const lastSaveAt = useRef(0);
  const stateRef = useRef({ sites: [], records: {}, library: [], parents: [] });
  const SETUP_PERSIST_MS = 400;

  const libMap = useMemo(() => Object.fromEntries(library.map((h) => [h.key, h])), [library]);
  const sitesEnriched = useMemo(() => enrichSitesWithVersions(sites, month), [sites, month]);
  const operationalSites = useMemo(
    () => (showHistorical ? sitesEnriched : activeSitesOnly(sitesEnriched)),
    [sitesEnriched, showHistorical],
  );
  const activeSiteCount = useMemo(() => activeSitesOnly(sitesEnriched).length, [sitesEnriched]);
  // attach library to sites so childLabel resolves custom labels
  const sitesL = useMemo(
    () => operationalSites.map((s) => ({ ...s, _lib: mergeSiteLibrary(s, library) })),
    [operationalSites, library],
  );
  const sitesAllL = useMemo(
    () => sitesEnriched.map((s) => ({ ...s, _lib: mergeSiteLibrary(s, library) })),
    [sitesEnriched, library],
  );

  const reloadLedger = useCallback(async () => {
    const { data, ok, error } = await loadStore();
    const base = normalize(data || emptyStore());
    setSites(base.sites); setRecords(base.records); setLibrary(base.library);
    let ps = (data?.parents && data.parents.length) ? data.parents : DEFAULT_PARENTS.map((p) => ({ ...p }));
    if (data?.parentLabels) ps = ps.map((p) => data.parentLabels[p.key] ? { ...p, label: data.parentLabels[p.key] } : p);
    syncParents(ps); setParents(ps);
    stateRef.current = { sites: base.sites, records: base.records, library: base.library, parents: ps };
    setLoadError(ok ? null : (error || "Could not load Site Ledger from the database."));
    setLoaded(true);
    return ok;
  }, []);

  useEffect(() => { reloadLedger(); }, [reloadLedger]);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (view && view !== "overview") next.set("slView", view);
      else next.delete("slView");
      if (activeSite) next.set("slSite", activeSite);
      else next.delete("slSite");
      if (month && month !== currentPeriodKey()) next.set("slMonth", month);
      else next.delete("slMonth");
      if (showHistorical) next.set("slHist", "1");
      else next.delete("slHist");
      if (next.toString() === prev.toString()) return prev;
      return next;
    }, { replace: true });
  }, [view, activeSite, month, showHistorical, setSearchParams]);

  useEffect(() => {
    if (!loaded) return undefined;
    const flushToDb = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const data = stateRef.current;
      saveLedgerPartial({ scope: "records", records: data.records }).catch(() => {});
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushToDb();
    };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushToDb);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushToDb);
    };
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    setSites((prev) => {
      const next = enrichSitesWithVersions(prev, month);
      const changed = next.some((s, i) => s.status !== prev[i]?.status || s.version !== prev[i]?.version || s.siteGroup !== prev[i]?.siteGroup);
      return changed ? next : prev;
    });
  }, [month, loaded]);

  useEffect(() => {
    return subscribeFinanceRefresh(() => {
      if (setupPersistPending.current || saveState === "saving" || saveState === "pending") return;
      if (Date.now() - lastSaveAt.current < 2500) return;
      reloadLedger();
    });
  }, [reloadLedger, saveState]);
  useEffect(() => {
    stateRef.current = { sites, records, library, parents };
    if (!loaded) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const delay = saveImmediate.current ? 0 : 800;
    saveImmediate.current = false;
    saveTimer.current = setTimeout(async () => {
      const result = await saveStore(stateRef.current);
      if (result.ok) {
        setSaveState("saved");
        setLoadError(null);
      } else {
        setSaveState("local");
        setLoadError(result.error);
      }
    }, delay);
  }, [sites, records, library, parents, loaded]);

  const flushSetupPersist = useCallback(async () => {
    const pending = setupPersistPending.current;
    if (!pending || !loaded) return;
    setupPersistPending.current = null;
    setSaveState("saving");
    try {
      await saveLedgerPartial(pending);
      lastSaveAt.current = Date.now();
      setSaveState("saved");
      setLoadError(null);
    } catch (e) {
      setSaveState("local");
      setLoadError(e?.message || "Save failed");
    }
  }, [loaded]);

  const scheduleSetupPersist = useCallback((opts = {}) => {
    setupPersistPending.current = {
      sites: stateRef.current.sites,
      records: stateRef.current.records,
      library: stateRef.current.library,
      parents: stateRef.current.parents,
      scope: opts.scope || "masters",
      siteCode: opts.siteCode,
      libraryChanged: !!opts.libraryChanged,
      deletedSiteCodes: opts.deletedSiteCodes,
      pruneSites: !!opts.pruneSites,
    };
    skipNextAutosave.current = true;
    setSaveState("pending");
    if (setupPersistTimer.current) clearTimeout(setupPersistTimer.current);
    setupPersistTimer.current = setTimeout(flushSetupPersist, SETUP_PERSIST_MS);
  }, [flushSetupPersist]);

  /** Optimistic Site Setup: UI updates instantly; DB write debounced + scoped. */
  const applySiteSetupChange = useCallback((updater, opts = {}) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveImmediate.current = false;

    const current = stateRef.current;
    const patch = updater({
      sites: current.sites,
      library: current.library,
      parents: current.parents,
      records: current.records,
    });
    const next = {
      sites: patch.sites ?? current.sites,
      library: patch.library ?? current.library,
      parents: patch.parents ?? current.parents,
      records: patch.records ?? current.records,
    };
    stateRef.current = next;
    if (patch.sites) setSites(next.sites);
    if (patch.library) setLibrary(next.library);
    if (patch.records) setRecords(next.records);
    if (patch.parents) {
      syncParents(next.parents);
      setParents(next.parents);
    }
    scheduleSetupPersist(opts);
  }, [scheduleSetupPersist]);

  // parent CRUD — keep the live module registry in sync so helpers (parentLabel/displayStructure…) reflect edits
  const renameParent = useCallback((key, label) => {
    applySiteSetupChange(({ parents: ps }) => ({
      parents: ps.map((p) => (p.key === key ? { ...p, label: (label && label.trim()) || p.label } : p)),
    }));
  }, [applySiteSetupChange]);
  const setParentColor = useCallback((key, color) => {
    applySiteSetupChange(({ parents: ps }) => ({
      parents: ps.map((p) => (p.key === key ? { ...p, color } : p)),
    }));
  }, [applySiteSetupChange]);
  const addParent = useCallback((label, color) => {
    applySiteSetupChange(({ parents: ps }) => {
      const base = slug(label) || "parent"; let key = base, n = 1;
      while (ps.some((p) => p.key === key)) key = base + "-" + (++n);
      return {
        parents: [...ps, {
          key,
          label: label.trim(),
          color: color || PARENT_PALETTE[ps.length % PARENT_PALETTE.length],
          custom: true,
        }],
      };
    });
  }, [applySiteSetupChange]);
  const removeParent = useCallback((key) => {
    const usedInLib = library.some((h) => h.parent === key);
    const usedInSite = sites.some((s) => (s.structure || []).some((g) => g.parent === key && g.children.length));
    if (usedInLib || usedInSite) { alert("This parent head still has cost lines (here or on another site). Move or delete them first, then delete the head."); return; }
    applySiteSetupChange(({ parents: ps, sites: allSites }) => ({
      parents: ps.filter((p) => p.key !== key),
      sites: allSites.map((s) => ({ ...s, structure: (s.structure || []).filter((g) => g.parent !== key) })),
    }));
  }, [library, sites, applySiteSetupChange]);

  const needsPortfolio = view !== "config" && view !== "entry";

  const activeMonths = useMemo(() => {
    const cap = currentPeriodKey();
    const capIdx = monthIdx(cap);
    if (!needsPortfolio) {
      return MONTHS.filter((m) => monthIdx(m.key) <= capIdx).slice(-6);
    }
    const have = new Set();
    Object.keys(records).forEach((k) => {
      const mk = k.split("__")[1];
      if (monthIdx(mk) <= capIdx) have.add(mk);
    });
    sites.forEach((s) =>
      (s.spreads || []).forEach((sp) => {
        const si = monthIdx(sp.start);
        const m = Number(sp.months) || 0;
        for (let i = 0; i < m; i++) {
          const key = indexToPeriodKey(si + i);
          if (key && monthIdx(key) <= capIdx) have.add(key);
        }
      }),
    );
    const list = MONTHS.filter((m) => have.has(m.key) && monthIdx(m.key) <= capIdx);
    return list.length ? list : MONTHS.filter((m) => monthIdx(m.key) <= capIdx).slice(-6);
  }, [records, sites, needsPortfolio]);

  const rows = useMemo(() => {
    if (!needsPortfolio) return [];
    return sitesL.map((s) => {
    const c = calcSite(s, month, records);
    const est = estTotals(estimateFor(s, month));
    const profitVar = est ? c.profit - est.profit : null;
    const pending = isPending(s, records, month);
    const pendingCount = pendingMonths(s, records, month).length;
    return { ...s, ...c, est, profitVar, pending, pendingCount, hasData: !!records[`${s.id}__${month}`] };
  });
  }, [sitesL, records, month, needsPortfolio]);

  const prevKey = useMemo(() => prevPeriodKey(month, MONTHS), [month]);

  const upsertSite = useCallback((site) => {
    saveImmediate.current = true;
    setSites((prev) => {
      if (site.isRenewal) return prepareNewSiteVersion(prev, site);
      const i = prev.findIndex((s) => s.id === site.id);
      const nextSite = {
        ...site,
        siteGroup: site.siteGroup || slug(site.name),
        version: site.version || 1,
        status: site.status || "active",
      };
      if (i === -1) return [...prev, nextSite];
      const cp = [...prev];
      cp[i] = nextSite;
      return cp;
    });
  }, []);
  const patchSite = useCallback((id, patch) => {
    saveImmediate.current = true;
    setSites((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }, []);
  const removeSite = useCallback((id) => {
    setSites((prev) => {
      const nextSites = prev.filter((s) => s.id !== id);
      setRecords((prevRec) => {
        const cp = { ...prevRec };
        Object.keys(cp).forEach((k) => { if (k.startsWith(id + "__")) delete cp[k]; });
        stateRef.current = { ...stateRef.current, sites: nextSites, records: cp };
        return cp;
      });
      return nextSites;
    });
    scheduleSetupPersist({ scope: "full", deletedSiteCodes: [id] });
  }, [scheduleSetupPersist]);
  const saveRecord = useCallback((siteId, mk, rec) => {
    saveImmediate.current = true;
    const withAudit = { ...rec, _audit: buildPeriodAuditMeta(user) };
    setRecords((prev) => {
      const key = `${siteId}__${mk}`;
      const existing = prev[key] || {};
      const merged = mergePeriodEntry(existing, withAudit);
      const next = { ...prev, [key]: merged };
      stateRef.current = { ...stateRef.current, records: next };
      return next;
    });
  }, [user]);
  const onRecordPersisted = useCallback(() => {
    lastSaveAt.current = Date.now();
  }, []);
  const renameLibraryHead = useCallback((key, label) => {
    applySiteSetupChange(({ library }) => ({
      library: library.map((h) => (h.key === key ? { ...h, label: (label && label.trim()) || h.label } : h)),
    }), { scope: "masters", libraryChanged: true });
  }, [applySiteSetupChange]);
  const removeLibraryHead = useCallback((key) => {
    applySiteSetupChange(({ sites, library, records }) => {
      const stripEst = (est) => {
        if (!est.expenses?.[key]) return est;
        const { [key]: _removed, ...expenses } = est.expenses;
        return { ...est, expenses };
      };
      const nextRecords = { ...records };
      Object.keys(nextRecords).forEach((compound) => {
        if (nextRecords[compound][key] != null) {
          const rec = { ...nextRecords[compound] };
          delete rec[key];
          nextRecords[compound] = rec;
        }
      });
      return {
        library: library.filter((h) => h.key !== key),
        sites: sites.map((s) => ({
          ...s,
          structure: compactStructure((s.structure || []).map((g) => ({
            ...g,
            children: (g.children || []).filter((k) => k !== key),
          }))),
          spreads: (s.spreads || []).filter((sp) => sp.head !== key),
          estimates: (s.estimates || []).map(stripEst),
        })),
        records: nextRecords,
      };
    });
  }, [applySiteSetupChange]);

  const mLabel = monthLabelOf(month);
  const titles = { overview: "Portfolio Overview", sites: "All Sites", config: "Site Setup", entry: "Enter / Edit Figures", reports: "Reports", site: sitesAllL.find((s) => s.id === activeSite)?.name || "Site" };
  const pageTitle = titles[view] || "Portfolio Overview";
  const ledgerNavItems = useMemo(() => [
    { id: "overview", label: "Overview", icon: LayoutDashboard, section: "portfolio" },
    { id: "sites", label: "All Sites", icon: Building2, section: "portfolio", badge: activeSiteCount || undefined },
    { id: "config", label: "Site Setup", icon: Sliders, section: "setup" },
    { id: "entry", label: "Enter Figures", icon: Pencil, section: "data" },
    { id: "reports", label: "Reports", icon: FileBarChart, section: "reports" },
  ], [activeSiteCount]);

  const handleLedgerNav = useCallback((id) => {
    if (id === "entry") {
      setActiveSite((prev) => {
        if (prev && sitesL.some((s) => s.id === prev)) return prev;
        return sitesL[0]?.id || null;
      });
    }
    setView(id);
  }, [sitesL]);

  if (!loaded) return <div style={{ fontFamily: "var(--body)", padding: 40, color: "var(--muted)" }}><Styles />Loading your sites…</div>;

  return (
    <PlMarginContext.Provider value={marginCtx}>
    <div className={`app finance-module${embedded ? " embedded stacked" : ""}`}>
      <Styles />
      <FinanceTypographyStyles />
      {!embedded && (
        <aside className="side">
          <div className="brand"><div className="brand-mark">P&L</div><div><div className="brand-name">SiteLedger</div><div className="brand-sub">Multi-site P&amp;L</div></div></div>
          <nav>
            <button className={view === "overview" ? "nav on" : "nav"} onClick={() => setView("overview")}><LayoutDashboard size={17} /> Overview</button>
            <button className={view === "sites" ? "nav on" : "nav"} onClick={() => setView("sites")}><Building2 size={17} /> All Sites <span className="count">{activeSiteCount}</span></button>
            <button className={view === "config" ? "nav on" : "nav"} onClick={() => setView("config")}><Sliders size={17} /> Site Setup</button>
            <button className={view === "entry" ? "nav on" : "nav"} onClick={() => handleLedgerNav("entry")}><Pencil size={17} /> Enter / Edit Figures</button>
            <button className={view === "reports" ? "nav on" : "nav"} onClick={() => setView("reports")}><FileBarChart size={17} /> Reports</button>
          </nav>
          <div className="side-foot">
            <div className={"save " + saveState}>{saveState === "saving" && "Saving…"}{saveState === "saved" && "✓ Saved to cloud"}{saveState === "local" && "Save failed — retry"}{saveState === "idle" && "Ready"}</div>
          </div>
        </aside>
      )}

      <div className="sl-body">
      <main className="main">
        {loadError && (
          <div style={{ margin: "12px 24px 0", padding: "12px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, lineHeight: 1.5 }}>
            <strong>Database setup required.</strong> {loadError}
          </div>
        )}
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <h1>{pageTitle}</h1>
              <p>{embedded ? `Finance · ${activeSiteCount} active site${activeSiteCount === 1 ? "" : "s"}` : `Income–Expenditure monitoring · ${activeSiteCount} active site${activeSiteCount === 1 ? "" : "s"}`}</p>
            </div>
            {embedded && (
              <div className="sl-view-nav">
                {ledgerNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = view === item.id || (item.id === "sites" && view === "site");
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={"sl-view-btn" + (isActive ? " on" : "")}
                      onClick={() => handleLedgerNav(item.id)}
                    >
                      {Icon && <Icon size={14} />}
                      {item.label}
                      {item.badge != null && item.badge !== "" && <span className="sl-view-badge">{item.badge}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="topbar-right">
            {embedded && (
              <>
                <button type="button" className="ghost sl-btn" onClick={() => navigate(financePath("settings"))}>
                  <Settings size={14} /> Settings
                </button>
                <div className={"save " + saveState}>
                  {saveState === "pending" && "Pending…"}
                  {saveState === "saving" && "Saving…"}
                  {saveState === "saved" && "✓ Saved"}
                  {saveState === "local" && "Save failed"}
                  {saveState === "idle" && "Ready"}
                </div>
              </>
            )}
          </div>
        </header>
        <div className="scroll">
          {view === "overview" && (
            <Overview
              rows={rows}
              sitesL={sitesL}
              sitesAll={sitesAllL}
              records={records}
              month={month}
              mLabel={mLabel}
              activeMonths={activeMonths}
              siteCount={activeSiteCount}
              totalSiteCount={sitesEnriched.length}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              openSite={(id) => { setActiveSite(id); setView("site"); }}
              goEntry={(id) => {
                const nextId = id || (activeSite && sitesL.some((s) => s.id === activeSite) ? activeSite : sitesL[0]?.id);
                if (nextId) setActiveSite(nextId);
                setView("entry");
              }}
              onViewHistory={(group) => setHistoryGroup(group)}
              marginCtx={marginCtx}
            />
          )}
          {view === "sites" && (
            <SitesTable
              rows={rows}
              records={records}
              month={month}
              sitesAll={sitesEnriched}
              activeSiteCount={activeSiteCount}
              query={query}
              setQuery={setQuery}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              inactiveCount={sitesEnriched.length - activeSiteCount}
              openSite={(id) => { setActiveSite(id); setView("site"); }}
              onEdit={(id) => { setActiveSite(id); setView("entry"); }}
              onEditSite={(id) => setEditSite(sitesEnriched.find((s) => s.id === id) || null)}
              onConfig={(id) => { setActiveSite(id); setView("config"); }}
              onDelete={removeSite}
              onViewHistory={(group) => setHistoryGroup(group)}
              onAdd={() => setShowAdd(true)}
              mLabel={mLabel}
            />
          )}
          {view === "site" && activeSite && (
            <SiteDetail
              site={sitesAllL.find((s) => s.id === activeSite)}
              records={records}
              month={month}
              mLabel={mLabel}
              back={() => setView("overview")}
              onEdit={() => setView("entry")}
              onConfig={() => setView("config")}
              onViewHistory={(group) => setHistoryGroup(group)}
            />
          )}
          {view === "entry" && <EntryForm sites={sitesL} library={library} records={records} month={month} setMonth={setMonth} activeSite={activeSite} setActiveSite={setActiveSite} libMap={libMap} onSave={saveRecord} onRecordPersisted={onRecordPersisted} onPatchSite={patchSite} onAdd={() => setShowAdd(true)} goConfig={(id) => { setActiveSite(id); setView("config"); }} />}
          {view === "config" && <SiteConfig sites={sitesL} library={library} parents={parents} activeSite={activeSite} setActiveSite={setActiveSite} records={records} month={month} onPatchSite={patchSite} onApplySetupChange={applySiteSetupChange} onRemoveHead={removeLibraryHead} onRenameHead={renameLibraryHead} onAdd={() => setShowAdd(true)} onRenameParent={renameParent} onSetParentColor={setParentColor} />}
          {view === "reports" && (
            <Reports
              sites={sitesL}
              sitesAll={sitesAllL}
              records={records}
              parents={parents}
              defaultMonth={month}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              onViewSite={(id) => { setActiveSite(id); setView("site"); }}
            />
          )}
        </div>
      </main>
      </div>

      {(showAdd || editSite) && (
        <AddSiteModal
          key={editSite?.id || "add"}
          editSite={editSite}
          existing={sitesEnriched}
          onClose={() => { setShowAdd(false); setEditSite(null); }}
          onSave={(s) => {
            if (s.isEdit) {
              patchSite(s.id, {
                name: s.name,
                service: s.service,
                wo: s.wo,
                ocNumber: s.ocNumber,
                contractStart: s.contractStart,
                contractEnd: s.contractEnd,
              });
              setEditSite(null);
              return;
            }
            if (s.isRenewal) {
              saveImmediate.current = true;
              const beforeIds = new Set(sites.map((x) => x.id));
              const next = prepareNewSiteVersion(sites, s);
              const newSite = next.find((x) => !beforeIds.has(x.id)) || next[next.length - 1];
              setSites(next);
              setShowAdd(false);
              setActiveSite(newSite.id);
              setView("config");
            } else {
              upsertSite(s);
              setShowAdd(false);
              setActiveSite(s.id);
              setView("config");
            }
          }}
        />
      )}
      {historyGroup && (
        <SiteVersionHistoryModal
          siteGroup={historyGroup}
          sites={sitesAllL}
          records={records}
          month={month}
          onClose={() => setHistoryGroup(null)}
          onOpenSite={(id) => { setActiveSite(id); setView("site"); setHistoryGroup(null); }}
        />
      )}
    </div>
    </PlMarginContext.Provider>
  );
}

/* ───────────────────────── OVERVIEW ───────────────────────── */
const PORTFOLIO_FILTERS_INIT = {
  search: "", status: "all", contract: "all",
  revMin: "", revMax: "",
};

function portfolioDelta(cur, prev) {
  if (prev == null || prev === 0) return null;
  return { val: ((cur - prev) / Math.abs(prev)) * 100, dir: cur - prev >= 0 ? "up" : "down" };
}

function applyPortfolioFilters(rows, filters, month) {
  let list = rows;
  const q = filters.search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.ocNumber || "").toLowerCase().includes(q) ||
        (r.wo || "").toLowerCase().includes(q) ||
        (r.client || "").toLowerCase().includes(q),
    );
  }
  if (filters.contract === "in") list = list.filter((r) => inContract(r, month));
  if (filters.contract === "out") list = list.filter((r) => !inContract(r, month));
  if (filters.status === "reporting") list = list.filter((r) => r.hasData);
  if (filters.status === "pending") list = list.filter((r) => r.pending);
  if (filters.status === "loss") list = list.filter((r) => r.hasData && r.profit < 0);
  if (filters.status === "thin") list = list.filter((r) => r.hasData && r.profit >= 0 && r.margin < (filters._warnMargin ?? WARN_MARGIN));
  if (filters.status === "below-est") list = list.filter((r) => r.hasData && r.est && r.profit < r.est.profit);
  if (filters.revMin !== "") list = list.filter((r) => r.hasData && r.revenue >= Number(filters.revMin));
  if (filters.revMax !== "") list = list.filter((r) => r.hasData && r.revenue <= Number(filters.revMax));
  return list;
}

function Overview({ rows, sitesL, sitesAll, records, month, mLabel, activeMonths, siteCount, totalSiteCount, showHistorical, setShowHistorical, openSite, goEntry, onViewHistory, marginCtx }) {
  const { targetMargin, warnMargin } = marginCtx || usePlMargins();
  const [filters, setFilters] = useState(PORTFOLIO_FILTERS_INIT);
  const setF = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const filteredRows = useMemo(
    () => applyPortfolioFilters(rows, { ...filters, _warnMargin: warnMargin }, month),
    [rows, filters, month, warnMargin],
  );

  const withData = useMemo(() => filteredRows.filter((r) => r.hasData), [filteredRows]);
  const pendingSites = useMemo(
    () => filteredRows.filter((r) => r.pending).sort((a, b) => b.pendingCount - a.pendingCount),
    [filteredRows],
  );

  const totals = useMemo(() => {
    const t = withData.reduce(
      (a, r) => ({ revenue: a.revenue + r.revenue, expense: a.expense + r.expense, profit: a.profit + r.profit }),
      { revenue: 0, expense: 0, profit: 0 },
    );
    t.margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0;
    return t;
  }, [withData]);

  const estAgg = useMemo(() => {
    const arr = withData.filter((r) => r.est);
    if (!arr.length) return null;
    return arr.reduce(
      (a, r) => ({ revenue: a.revenue + r.est.revenue, expense: a.expense + r.est.expense, profit: a.profit + r.est.profit }),
      { revenue: 0, expense: 0, profit: 0 },
    );
  }, [withData]);

  const belowEst = useMemo(() => withData.filter((r) => r.est && r.profit < r.est.profit).length, [withData]);
  const lossCount = useMemo(() => withData.filter((r) => r.profit < 0).length, [withData]);
  const thinCount = useMemo(() => withData.filter((r) => r.profit >= 0 && r.margin < warnMargin).length, [withData, warnMargin]);

  const prevKey = useMemo(() => prevPeriodKey(month, MONTHS), [month]);
  const prevTotals = useMemo(() => {
    if (!prevKey) return null;
    const ids = new Set(filteredRows.map((r) => r.id));
    const arr = sitesL
      .filter((s) => ids.has(s.id))
      .map((s) => calcSite(s, prevKey, records))
      .filter((c) => c.revenue || c.expense);
    if (!arr.length) return null;
    return arr.reduce((a, c) => ({ revenue: a.revenue + c.revenue, profit: a.profit + c.profit }), { revenue: 0, profit: 0 });
  }, [filteredRows, sitesL, records, prevKey]);

  const revD = prevTotals && portfolioDelta(totals.revenue, prevTotals.revenue);
  const proD = prevTotals && portfolioDelta(totals.profit, prevTotals.profit);
  const estVar = estAgg ? totals.profit - estAgg.profit : null;
  const estVarPct = estAgg && estAgg.profit !== 0 ? (estVar / Math.abs(estAgg.profit)) * 100 : null;
  const pendCount = pendingSites.length;

  const performersChart = useMemo(() => {
    const sorted = [...withData].sort((a, b) => b.profit - a.profit);
    if (!sorted.length) return [];
    if (sorted.length <= 16) return sorted.map((r) => ({ name: r.name, profit: r.profit }));
    return [...sorted.slice(0, 8), ...sorted.slice(-8)].map((r) => ({ name: r.name, profit: r.profit }));
  }, [withData]);

  const trendData = useMemo(() => {
    const ids = new Set(filteredRows.map((r) => r.id));
    const sites = sitesL.filter((s) => ids.has(s.id));
    return activeMonths.map((m) => {
      const arr = sites.map((s) => calcSite(s, m.key, records)).filter((c) => c.revenue || c.expense);
      const t = arr.reduce(
        (a, c) => ({ revenue: a.revenue + c.revenue, expense: a.expense + c.expense, profit: a.profit + c.profit }),
        { revenue: 0, expense: 0, profit: 0 },
      );
      return { name: m.label, ...t };
    });
  }, [activeMonths, filteredRows, sitesL, records]);

  const expenseBreakdown = useMemo(() => {
    const agg = Object.fromEntries(PARENTS.map((p) => [p.key, 0]));
    withData.forEach((r) => {
      const site = sitesL.find((s) => s.id === r.id);
      if (!site) return;
      const pt = parentTotalsSite(site, month, records);
      PARENTS.forEach((p) => { agg[p.key] += pt[p.key] || 0; });
    });
    return PARENTS
      .map((p) => ({ name: parentLabel(p.key), value: agg[p.key], color: p.color }))
      .filter((d) => d.value > 0);
  }, [withData, sitesL, records, month]);

  const attention = useMemo(
    () => [...withData].filter((r) => r.profit < 0 || r.margin < warnMargin).sort((a, b) => a.profit - b.profit),
    [withData, warnMargin],
  );

  const hasActiveFilters = filters.search || filters.status !== "all"
    || filters.contract !== "all" || filters.revMin || filters.revMax;

  const siteOptions = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  return (
    <>
      <div className="ov-hero">
        <div>
          <h2 className="ov-hero-title">Portfolio snapshot</h2>
          <p className="ov-hero-sub">Period <b>{mLabel}</b> · Target margin {targetMargin}% · Warning below {warnMargin}%</p>
        </div>
        <div className="ov-margin-legend">
          <span className="ov-margin-chip target">Target {targetMargin}%</span>
          <span className="ov-margin-chip warn">Warning {warnMargin}%</span>
        </div>
      </div>

      <div className="ov-filters ov-filters-modern">
        <div className="ov-filter ov-filter-ac">
          <SiteClientAutocomplete
            sites={siteOptions}
            value=""
            filterQuery={filters.search}
            onChange={(id) => {
              const site = siteOptions.find((s) => s.id === id);
              if (site) setF({ search: site.name });
            }}
            onSearchChange={(q) => setF({ search: q })}
            label="Search site / client"
            id="portfolio-overview-search"
            placeholder="Type site or client name…"
          />
        </div>
        <label className="ov-filter">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setF({ status: e.target.value })}>
            <option value="all">All</option>
            <option value="reporting">Reporting</option>
            <option value="pending">Pending data</option>
            <option value="loss">Loss-making</option>
            <option value="thin">Thin margin</option>
            <option value="below-est">Below estimate</option>
          </select>
        </label>
        <label className="ov-filter">
          <span>Contract</span>
          <select value={filters.contract} onChange={(e) => setF({ contract: e.target.value })}>
            <option value="all">All</option>
            <option value="in">In contract</option>
            <option value="out">Out of contract</option>
          </select>
        </label>
        <label className="ov-filter range">
          <span>Revenue (₹)</span>
          <div className="ov-range">
            <input type="number" value={filters.revMin} onChange={(e) => setF({ revMin: e.target.value })} placeholder="Min" />
            <span>–</span>
            <input type="number" value={filters.revMax} onChange={(e) => setF({ revMax: e.target.value })} placeholder="Max" />
          </div>
        </label>
        {hasActiveFilters && (
          <button type="button" className="ghost-d ov-clear" onClick={() => setFilters(PORTFOLIO_FILTERS_INIT)}>Clear filters</button>
        )}
        <label className="ov-filter hist-toggle">
          <span>Data scope</span>
          <button
            type="button"
            className={"hist-scope-btn" + (showHistorical ? " on" : "")}
            onClick={() => setShowHistorical((v) => !v)}
          >
            <History size={13} />
            {showHistorical ? "Including historical" : "Active sites only"}
          </button>
        </label>
      </div>

      <p className="ov-meta">
        {filteredRows.length} of {showHistorical ? totalSiteCount : siteCount} site{showHistorical ? " versions" : "s"} · {withData.length} reporting for {mLabel}
        {!showHistorical && totalSiteCount > siteCount && (
          <span className="hist-hint"> · {totalSiteCount - siteCount} inactive version{(totalSiteCount - siteCount) === 1 ? "" : "s"} hidden</span>
        )}
      </p>

      <div className="kpi-row">
        <Kpi icon={IndianRupee} label={`Total Revenue · ${mLabel}`} value={inrShort(totals.revenue)} sub={revD ? `${revD.val >= 0 ? "+" : ""}${revD.val.toFixed(1)}% vs last period` : `${withData.length} sites reporting`} trend={revD?.dir} />
        <Kpi icon={Receipt} label="Total Expenses" value={inrShort(totals.expense)} sub={totals.revenue > 0 ? `${pct((totals.expense / totals.revenue) * 100)} of revenue` : "—"} />
        <Kpi icon={Wallet} label="Net Profit" value={inrShort(totals.profit)} tone={totals.profit >= 0 ? "profit" : "loss"} sub={proD ? `${proD.val >= 0 ? "+" : ""}${proD.val.toFixed(1)}% vs last period` : null} trend={proD?.dir} />
        <Kpi icon={Target} label="Profit vs Estimate" value={estVar == null ? "—" : `${estVar >= 0 ? "+" : ""}${inrShort(estVar)}`} tone={estVar == null ? "ink" : estVar >= 0 ? "profit" : "loss"} sub={estAgg ? `est ${inrShort(estAgg.profit)}${estVarPct != null ? ` · ${estVarPct >= 0 ? "+" : ""}${estVarPct.toFixed(0)}%` : ""}` : "no estimate set"} trend={estVar == null ? undefined : estVar >= 0 ? "up" : "down"} />
        <Kpi icon={AlertTriangle} label="Need attention" value={`${lossCount + thinCount}`} tone={lossCount ? "loss" : thinCount ? "warn" : "profit"} sub={`${lossCount} loss · ${thinCount} thin · ${belowEst} below est`} />
        <Kpi icon={AlertCircle} label="Data pending" value={`${pendCount}`} tone={pendCount ? "warn" : "profit"} sub={pendCount ? `site${pendCount > 1 ? "s" : ""} missing ${mLabel}` : "all sites reported"} />
      </div>

      {!withData.length && (
        <div className="ov-empty-hint">
          <Building2 size={20} />
          <span>No figures for <b>{mLabel}</b> in the current filter. Change period above or enter figures in <b>Enter Figures</b>.</span>
        </div>
      )}

      {pendCount > 0 && (
        <Card title={`Awaiting Data · ${mLabel}`} right={<span className="muted-s">{pendCount} site{pendCount > 1 ? "s" : ""} in-contract with no figures yet</span>}>
          <div className="pend-grid">
            {pendingSites.map((s) => (
              <button key={s.id} type="button" className="pend-item" onClick={() => goEntry(s.id)} title="Enter figures">
                <span className="pend-dot" />
                <span className="pend-name">{s.name}</span>
                {s.pendingCount > 1 && <span className="pend-badge">{s.pendingCount} mo behind</span>}
                <span className="pend-cta">Enter →</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid-2">
        <Card title={`Profit / Loss by Site · ${mLabel}`} right={<span className="muted-s">top &amp; bottom performers</span>}>
          {performersChart.length ? (
            <ResponsiveContainer width="100%" height={Math.max(260, performersChart.length * 28)}>
              <BarChart data={performersChart} layout="vertical" margin={{ left: 4, right: 24, top: 8, bottom: 4 }}>
                <CartesianGrid horizontal stroke="var(--line)" vertical={false} />
                <XAxis type="number" tickFormatter={inrShort} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" />
                <YAxis type="category" dataKey="name" width={148} tick={{ fontSize: 11, fill: "var(--ink-soft)" }} stroke="var(--line)" />
                <Tooltip content={<TipBox fmt={inr} />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                <Bar dataKey="profit" radius={[0, 4, 4, 0]} barSize={16}>
                  {performersChart.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "var(--profit)" : "var(--loss)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="chart-empty">No site profit data for this period.</div>
          )}
        </Card>
        <Card title={`Expense Breakdown · ${mLabel}`} right={<span className="muted-s">by parent head</span>}>
          {expenseBreakdown.length ? (
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                    {expenseBreakdown.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<TipBox fmt={inr} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="legend">
                {[...expenseBreakdown].sort((a, b) => b.value - a.value).map((d) => (
                  <div key={d.name} className="legend-row">
                    <span className="legend-dot" style={{ background: d.color }} />
                    <span className="legend-name">{d.name}</span>
                    <span className="legend-val">{inrShort(d.value)}</span>
                    <span className="legend-pct">{totals.expense > 0 ? pct((d.value / totals.expense) * 100) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chart-empty">No expense data for this period.</div>
          )}
        </Card>
      </div>

      <Card title="Revenue · Expense · Profit Trend" right={<span className="muted-s">portfolio · filtered sites</span>}>
        {trendData.some((d) => d.revenue || d.expense) ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData} margin={{ left: 8, right: 20, top: 12, bottom: 4 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" />
                <YAxis tickFormatter={inrShort} tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" width={68} />
                <Tooltip content={<TipBox fmt={inr} />} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="var(--profit)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--profit)" }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="expense" name="Expense" stroke="var(--loss)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: "var(--loss)" }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--gold)" }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="trend-legend">
              <span><i style={{ background: "var(--profit)" }} />Revenue</span>
              <span><i style={{ background: "var(--loss)" }} />Expense</span>
              <span><i style={{ background: "var(--gold)" }} />Profit</span>
            </div>
          </>
        ) : (
          <div className="chart-empty">Enter monthly figures to see the trend chart.</div>
        )}
      </Card>

      <Card title="Sites Needing Attention" right={<span className="muted-s">{attention.length} flagged · loss or margin &lt; {warnMargin}%</span>}>
        {attention.length === 0 ? (
          <div className="all-clear"><TrendingUp size={16} /> Every reporting site cleared the {warnMargin}% margin floor this period.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Site</th><th className="r">Target</th><th className="r">Warning</th><th className="r">Revenue</th><th className="r">Profit</th><th className="r">Margin</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {attention.map((r) => (
                <tr key={r.id} className={!isSiteActive(r) ? "row-inactive" : ""}>
                  <td className="strong">
                    {r.name}
                    {!isSiteActive(r) && <span className="ver-pill inactive">Inactive · {versionLabel(r)}</span>}
                    {isSiteActive(r) && (sitesAll.filter((s) => s.siteGroup === r.siteGroup).length > 1) && (
                      <span className="ver-pill">{versionLabel(r)}</span>
                    )}
                  </td>
                  <td className="r mono muted-s">{targetMargin}%</td>
                  <td className="r mono muted-s">{warnMargin}%</td>
                  <td className="r mono">{inr(r.revenue)}</td>
                  <td className="r mono" style={{ color: r.profit < 0 ? "var(--loss)" : "var(--ink)" }}>{inr(r.profit)}</td>
                  <td className="r mono" style={{ color: r.margin < 0 ? "var(--loss)" : r.margin < warnMargin ? "var(--warn)" : "var(--ink)" }}>{pct(r.margin)}</td>
                  <td><StatusPill margin={r.margin} profit={r.profit} /></td>
                  <td className="r nowrap">
                    {sitesAll.filter((s) => s.siteGroup === r.siteGroup).length > 1 && (
                      <button type="button" className="link hist-link" onClick={() => onViewHistory(r.siteGroup)}>History</button>
                    )}
                    <button type="button" className="link" onClick={() => openSite(r.id)}>View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Site margin thresholds" right={<span className="muted-s">per active site · {mLabel}</span>}>
        <table className="tbl tbl-compact">
          <thead>
            <tr><th>Site</th><th className="r">Target margin</th><th className="r">Warning margin</th><th className="r">Actual margin</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.name}</td>
                <td className="r mono">{targetMargin}%</td>
                <td className="r mono">{warnMargin}%</td>
                <td className="r mono" style={{ color: !r.hasData ? "var(--muted)" : r.margin < warnMargin ? "var(--warn)" : "var(--profit)" }}>
                  {r.hasData ? pct(r.margin) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}


/* ───────────────────────── SITES TABLE ───────────────────────── */
const SITES_FILTERS_INIT = { status: "all", financial: "all" };

function pendingMonthsTone(count) {
  if (count <= 0) return "ok";
  if (count <= 3) return "low";
  if (count <= 6) return "med";
  return "high";
}

function PendingMonthsCell({ site, records, uptoMk }) {
  const pending = pendingMonths(site, records, uptoMk);
  const labels = pending.map(monthLabelOf);
  const tone = pendingMonthsTone(pending.length);
  if (!pending.length) {
    return <span className="sm-pend sm-pend-ok">0 · All data completed</span>;
  }
  const preview = labels.slice(0, 3).join(", ");
  const more = labels.length > 3 ? ` +${labels.length - 3} more` : "";
  return (
    <span className={`sm-pend sm-pend-${tone}`} title={labels.join(", ")}>
      {pending.length} Pending: {preview}{more}
    </span>
  );
}

function SitesTable({
  rows, records, month, sitesAll, activeSiteCount, query, setQuery,
  showHistorical, setShowHistorical, inactiveCount,
  openSite, onEdit, onEditSite, onConfig, onDelete, onViewHistory, onAdd, mLabel,
}) {
  const { warnMargin } = usePlMargins();
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [filters, setFilters] = useState(SITES_FILTERS_INIT);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [menuOpen, setMenuOpen] = useState(null);

  const filtered = useMemo(() => {
    let list = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        (r.ocNumber || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.wo || "").toLowerCase().includes(query.toLowerCase()),
    );
    if (filters.status === "active") list = list.filter((r) => isSiteActive(r));
    if (filters.status === "inactive") list = list.filter((r) => !isSiteActive(r));
    if (filters.financial === "completed") list = list.filter((r) => pendingMonths(r, records, month).length === 0);
    if (filters.financial === "pending") list = list.filter((r) => pendingMonths(r, records, month).length > 0);
    if (filters.financial === "loss") list = list.filter((r) => r.hasData && r.profit < 0);
    if (filters.financial === "thin") list = list.filter((r) => r.hasData && r.profit >= 0 && r.margin < warnMargin);
    return list;
  }, [rows, query, filters, records, month, warnMargin]);

  const totalSites = sitesAll.length;
  const inactiveSites = inactiveCount ?? (totalSites - activeSiteCount);
  const dataCompleted = rows.filter((r) => pendingMonths(r, records, month).length === 0).length;
  const dataPending = rows.filter((r) => pendingMonths(r, records, month).length > 0).length;
  const overdueLoss = rows.filter((r) => r.hasData && r.profit < 0).length;
  const completedPct = rows.length ? Math.round((dataCompleted / rows.length) * 100) : 0;
  const pendingPct = rows.length ? Math.round((dataPending / rows.length) * 100) : 0;

  const sorted = useMemo(() => {
    const m = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "name") return m * a.name.localeCompare(b.name);
      if (sort.key === "pendingCount") {
        const pa = pendingMonths(a, records, month).length;
        const pb = pendingMonths(b, records, month).length;
        return m * (pa - pb);
      }
      return m * ((a[sort.key] || 0) - (b[sort.key] || 0));
    });
  }, [filtered, sort, records, month]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);
  const rangeStart = sorted.length ? (safePage - 1) * rowsPerPage + 1 : 0;
  const rangeEnd = (safePage - 1) * rowsPerPage + pageRows.length;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const setF = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const setS = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const arr = (k) => (sort.key === k ? (sort.dir === "desc" ? " ▾" : " ▴") : "");
  const hasActiveFilters = filters.status !== "all" || filters.financial !== "all";

  const copySiteSummary = (r) => {
    const pend = pendingMonths(r, records, month).map(monthLabelOf).join(", ");
    const line = [
      r.name,
      r.service || "",
      r.contractStart ? `${monthLabelOf(r.contractStart)} - ${monthLabelOf(r.contractEnd)}` : "",
      inr(r.revenue),
      inr(r.profit),
      pend ? `Pending: ${pend}` : "Complete",
    ].join("\t");
    void navigator.clipboard?.writeText(line);
  };

  return (
    <div className="sm-page">
      <nav className="sm-crumb" aria-label="Breadcrumb">
        <Home size={13} />
        <ChevronRight size={12} />
        <span>Masters</span>
        <ChevronRight size={12} />
        <span className="sm-crumb-on">Sites</span>
      </nav>

      <div className="sm-head">
        <div>
          <h2 className="sm-title">Sites Master</h2>
          <p className="sm-sub">Master list of all sites and their financial data status</p>
        </div>
        <div className="sm-head-actions">
          <button type="button" className="primary sm-btn-add" onClick={onAdd}>
            <Plus size={14} /> Add Site
          </button>
        </div>
      </div>

      <div className="sm-kpi-row">
        <div className="sm-kpi">
          <div className="sm-kpi-top"><Building2 size={16} /><span>Total Sites</span></div>
          <div className="sm-kpi-val">{totalSites}</div>
          <div className="sm-kpi-sub">All locations</div>
        </div>
        <div className="sm-kpi">
          <div className="sm-kpi-top"><CheckCircle size={16} className="sm-ico-profit" /><span>Active Sites</span></div>
          <div className="sm-kpi-val">{activeSiteCount}</div>
          <div className="sm-kpi-sub">Active locations</div>
        </div>
        <div className="sm-kpi">
          <div className="sm-kpi-top"><XCircle size={16} className="sm-ico-muted" /><span>Inactive Sites</span></div>
          <div className="sm-kpi-val">{inactiveSites}</div>
          <div className="sm-kpi-sub">Inactive locations</div>
        </div>
        <div className="sm-kpi">
          <div className="sm-kpi-top"><FileCheck size={16} className="sm-ico-profit" /><span>Data Completed</span></div>
          <div className="sm-kpi-val">{dataCompleted}</div>
          <div className="sm-kpi-sub">{completedPct}% of total</div>
        </div>
        <div className="sm-kpi">
          <div className="sm-kpi-top"><Clock size={16} className="sm-ico-warn" /><span>Data Pending</span></div>
          <div className="sm-kpi-val">{dataPending}</div>
          <div className="sm-kpi-sub">{pendingPct}% of total</div>
        </div>
        <div className="sm-kpi sm-kpi-alert">
          <div className="sm-kpi-top"><AlertTriangle size={16} className="sm-ico-loss" /><span>Overdue (Loss)</span></div>
          <div className="sm-kpi-val sm-kpi-loss">{overdueLoss}</div>
          <div className="sm-kpi-sub">Require attention</div>
        </div>
      </div>

      <div className="sm-filters">
        <div className="sm-filter sm-filter-search sm-ac-wrap">
          <SiteClientAutocomplete
            sites={rows}
            value=""
            onChange={(id) => {
              const site = rows.find((s) => s.id === id);
              if (site) setQuery(site.name);
              setPage(1);
            }}
            label="Search site / client"
            id="sites-master-search"
            placeholder="Type site or client name…"
          />
        </div>
        <label className="sm-filter">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setF({ status: e.target.value })}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="sm-filter">
          <span>Financial Status</span>
          <select value={filters.financial} onChange={(e) => setF({ financial: e.target.value })}>
            <option value="all">All</option>
            <option value="completed">Data completed</option>
            <option value="pending">Data pending</option>
            <option value="loss">Loss-making</option>
            <option value="thin">Thin margin</option>
          </select>
        </label>
        {hasActiveFilters && (
          <button type="button" className="ghost-d sm-clear" onClick={() => { setFilters(SITES_FILTERS_INIT); setPage(1); }}>
            Clear Filters
          </button>
        )}
        <button
          type="button"
          className={"hist-scope-btn sm-hist" + (showHistorical ? " on" : "")}
          onClick={() => setShowHistorical((v) => !v)}
        >
          <History size={13} />
          {showHistorical ? "Hide inactive" : `Show inactive${inactiveCount ? ` (${inactiveCount})` : ""}`}
        </button>
      </div>

      <div className="sm-table-card">
        <table className="tbl sm-tbl">
          <thead>
            <tr>
              <th className="r">Sr. No.</th>
              <th className="click" onClick={() => setS("name")}>Site Name{arr("name")}</th>
              <th>Contract</th>
              <th>Client / OC</th>
              <th className="r click" onClick={() => setS("revenue")}>Revenue (₹){arr("revenue")}</th>
              <th className="r click" onClick={() => setS("expense")}>Expense (₹){arr("expense")}</th>
              <th className="r click" onClick={() => setS("profit")}>Profit (₹){arr("profit")}</th>
              <th className="r click" onClick={() => setS("margin")}>Margin (%){arr("margin")}</th>
              <th>VS EST</th>
              <th className="click" onClick={() => setS("pendingCount")}>Pending Months{arr("pendingCount")}</th>
              <th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={r.id} className={!isSiteActive(r) ? "row-inactive" : ""}>
                <td className="r mono muted-s">{(safePage - 1) * rowsPerPage + i + 1}</td>
                <td className="strong">
                  <button type="button" className="sm-site-link" onClick={() => openSite(r.id)}>{r.name}</button>
                  <span className="sm-ver">{versionLabel(r)}</span>
                </td>
                <td className="muted-s mono">
                  {r.contractStart ? `${monthLabelOf(r.contractStart)} - ${monthLabelOf(r.contractEnd)}` : "—"}
                </td>
                <td className="muted-s">{r.ocNumber || r.wo || "—"}</td>
                <td className="r mono">{inr(r.revenue)}</td>
                <td className="r mono">{inr(r.expense)}</td>
                <td className="r mono" style={{ color: r.profit < 0 ? "var(--loss)" : "var(--ink)" }}>{inr(r.profit)}</td>
                <td className="r mono" style={{ color: r.margin < 0 ? "var(--loss)" : r.margin < warnMargin ? "var(--warn)" : "var(--ink)" }}>{pct(r.margin)}</td>
                <td>
                  {r.hasData ? <StatusPill margin={r.margin} profit={r.profit} /> : <span className="muted-s">—</span>}
                </td>
                <td><PendingMonthsCell site={r} records={records} uptoMk={month} /></td>
                <td className="r nowrap sm-actions">
                  <button type="button" className="sm-act" title="View" onClick={() => openSite(r.id)}><Eye size={15} /></button>
                  <button type="button" className="sm-act" title="Edit site" onClick={() => onEditSite(r.id)}><Sliders size={15} /></button>
                  {isSiteActive(r) && (
                    <button type="button" className="sm-act" title="Edit figures" onClick={() => onEdit(r.id)}><Pencil size={15} /></button>
                  )}
                  <button type="button" className="sm-act" title="Copy summary" onClick={() => copySiteSummary(r)}><Copy size={15} /></button>
                  <div className="sm-more-wrap">
                    <button
                      type="button"
                      className="sm-act"
                      title="More"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === r.id ? null : r.id); }}
                    >
                      <MoreVertical size={15} />
                    </button>
                    {menuOpen === r.id && (
                      <div className="sm-more-menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => { onEditSite(r.id); setMenuOpen(null); }}>Edit site</button>
                        <button type="button" onClick={() => { onViewHistory(r.siteGroup); setMenuOpen(null); }}>Version history</button>
                        {isSiteActive(r) && (
                          <>
                            <button type="button" onClick={() => { onConfig(r.id); setMenuOpen(null); }}>Site setup</button>
                            <button type="button" className="danger" onClick={() => { if (confirm(`Delete "${r.name}" (${versionLabel(r)}) and all its data?`)) onDelete(r.id); setMenuOpen(null); }}>Delete site</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!pageRows.length && (
              <tr>
                <td colSpan={11} className="sm-empty">No sites match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="sm-foot">
          <span className="sm-foot-meta">
            Showing {rangeStart} to {rangeEnd} of {sorted.length} sites
          </span>
          <div className="sm-foot-right">
            <label className="sm-rpp">
              Rows per page
              <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <div className="sm-pager">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <span>{safePage} / {totalPages}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        </div>
      </div>

      <div className="sm-legend-grid">
        <div className="sm-legend-card">
          <h4>Pending Months Legend</h4>
          <ul>
            <li><span className="sm-pend sm-pend-ok">0</span> All Data Completed</li>
            <li><span className="sm-pend sm-pend-low">1–3</span> Low Pending</li>
            <li><span className="sm-pend sm-pend-med">4–6</span> Medium Pending</li>
            <li><span className="sm-pend sm-pend-high">7+</span> High Pending</li>
          </ul>
        </div>
        <div className="sm-legend-card sm-about">
          <h4>About Pending Months</h4>
          <p>
            This column shows the number of months for which financial data is not yet entered for each site,
            up to the selected period (<b>{mLabel}</b>). For example, &ldquo;Jul-25&rdquo; means July 2025 data is pending.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── SITE DETAIL (expandable parents) ───────────────────────── */
function SiteDetail({ site, records, month, mLabel, back, onEdit, onConfig, onViewHistory }) {
  const [expanded, setExpanded] = useState(() => new Set());
  if (!site) return null;
  const historical = !isSiteActive(site);
  const rec = records[`${site.id}__${month}`];
  const c = calcSite(site, month, records);
  const estVer = estimateFor(site, month);
  const est = estTotals(estVer);
  const revBreak = REVENUE_ITEMS.map((it) => {
    if (it.key === "esicBill") {
      const lines = reimbursementDisplayLines(rec || {});
      return {
        ...it,
        label: lines.length === 1 ? `Reimbursement · ${lines[0].label}` : reimbursementRowLabel(rec || {}),
        raw: reimbursementTotal(rec || {}),
        est: Number(estVer?.revenue?.[it.key]) || 0,
      };
    }
    return {
      ...it,
      label: it.label,
      raw: Number(rec?.[it.key]) || 0,
      est: Number(estVer?.revenue?.[it.key]) || 0,
    };
  });
  const tree = expenseTree(site, month, records, estVer).filter((g) => g.actual !== 0 || g.est !== 0);
  const cats = parentTotalsSite(site, month, records);
  const catData = PARENTS.map((p) => ({ name: parentLabel(p.key), value: cats[p.key] || 0, color: p.color })).filter((d) => d.value > 0);
  const siteTrend = MONTHS.filter((m) => { const cc = calcSite(site, m.key, records); return cc.revenue || cc.expense; }).map((m) => { const cc = calcSite(site, m.key, records); const e = estTotals(estimateFor(site, m.key)); return { name: m.label, profit: cc.profit, estProfit: e ? e.profit : null }; });
  const profitVar = est ? c.profit - est.profit : null;
  const toggle = (k) => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allExpanded = tree.length > 0 && tree.every((g) => expanded.has(g.parent));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(tree.map((g) => g.parent)));

  return (
    <div className="site-detail">
      <button type="button" className="back" onClick={back}><ChevronLeft size={16} /> Back</button>
      {historical && (
        <div className="hist-banner">
          <History size={16} />
          <div>
            <strong>Historical site version · {versionLabel(site)}</strong>
            <p>Read-only archive. PO {site.wo || "—"} · contract {site.contractStart ? `${monthLabelOf(site.contractStart)}–${monthLabelOf(site.contractEnd)}` : "—"}</p>
          </div>
          <button type="button" className="ghost-d sm" onClick={() => onViewHistory(site.siteGroup)}>All versions</button>
        </div>
      )}
      <div className="site-head">
        <div className="site-head-info">
          <h2>
            <span className="site-head-name">{site.name}</span>
            <span className="ver-pill inline">{versionLabel(site)}{historical ? " · Inactive" : " · Active"}</span>
          </h2>
          <div className="site-head-meta">
            {site.ocNumber && <span>Client: <b>{site.ocNumber}</b></span>}
            {site.wo && <span>W.O.: <b>{site.wo}</b></span>}
            {site.contractStart && (
              <span>Contract: <b>{monthLabelOf(site.contractStart)} – {monthLabelOf(site.contractEnd)}</b></span>
            )}
            <span>Period: <b>{mLabel}</b></span>
          </div>
        </div>
        <div className="site-head-right">
          <StatusPill margin={c.margin} profit={c.profit} />
          <button type="button" className="ghost-d" onClick={() => onViewHistory(site.siteGroup)}><History size={14} /> History</button>
          {!historical && <button type="button" className="ghost-d" onClick={onConfig}><Sliders size={14} /> Setup</button>}
          {!historical && <button type="button" className="primary" onClick={onEdit}><Pencil size={14} /> Edit figures</button>}
        </div>
      </div>
      <div className="kpi-row site-detail-kpis">
        <Kpi icon={IndianRupee} label="Total Revenue (a)" value={inrShort(c.revenue)} sub={est ? `est ${inrShort(est.revenue)}` : null} />
        <Kpi icon={Receipt} label="Sub-total Expenses (b)" value={inrShort(c.expense)} sub={est ? `est ${inrShort(est.expense)}` : (c.revenue ? `${pct((c.expense / c.revenue) * 100)} of revenue` : null)} />
        <Kpi icon={Wallet} label="Profit (a − b)" value={inrShort(c.profit)} tone={c.profit >= 0 ? "profit" : "loss"} sub={est ? `est ${inrShort(est.profit)}` : null} />
        <Kpi icon={Target} label="Profit vs Estimate" value={profitVar == null ? "—" : `${profitVar >= 0 ? "+" : ""}${inrShort(profitVar)}`} tone={profitVar == null ? "ink" : profitVar >= 0 ? "profit" : "loss"} sub={profitVar == null ? "no estimate" : profitVar >= 0 ? "favourable" : "adverse"} trend={profitVar == null ? undefined : profitVar >= 0 ? "up" : "down"} />
        <Kpi icon={Percent} label="Margin" value={pct(c.margin)} tone={c.margin >= TARGET_MARGIN ? "profit" : c.margin >= WARN_MARGIN ? "warn" : "loss"} sub={est ? `est ${pct(est.margin)}` : `target ${TARGET_MARGIN}%`} />
      </div>
      {!rec && tree.length === 0 ? <div className="empty"><Receipt size={30} /><h3>No figures for {mLabel}</h3><p>Click <b>Edit figures</b> to add this period.</p></div> : (
        <>
          <Card
            title="Income – Expenditure · Actual vs Estimate"
            pad={false}
            className="site-ie-card"
            right={(
              <div className="site-ie-card-tools">
                <button type="button" className="link" onClick={toggleAll}>{allExpanded ? "Collapse all" : "Expand all"}</button>
                {estVer ? (
                  <span className="site-ie-budget">
                    <FileClock size={12} />
                    budget {monthLabelOf(estVer.effectiveFrom)}
                    {estVer.note ? ` · ${estVer.note}` : ""}
                  </span>
                ) : (
                  <span className="muted-s">no estimate</span>
                )}
              </div>
            )}
          >
            <div className="vtbl-wrap">
            <table className="tbl vtbl">
              <colgroup>
                <col className="vtbl-col-part" />
                <col className="vtbl-col-num" />
                <col className="vtbl-col-num" />
                <col className="vtbl-col-num" />
                <col className="vtbl-col-num" />
              </colgroup>
              <thead>
                <tr>
                  <th>Particulars</th>
                  <th className="r">Estimate</th>
                  <th className="r">Actual</th>
                  <th className="r">Variance</th>
                  <th className="r">Var %</th>
                </tr>
              </thead>
              <tbody>
                <tr className="vsec"><td colSpan={5}>Revenue</td></tr>
                {revBreak.map((it) => (
                  <tr key={it.key}>
                    <td className="vtbl-part">{it.label}</td>
                    <VarCells est={it.sign * it.est} actual={it.sign * it.raw} lowerIsBetter={false} hasEst={!!it.est} />
                  </tr>
                ))}
                <tr className="vtot green"><td className="vtbl-part">Total Revenue (a)</td><VarCells est={est?.revenue || 0} actual={c.revenue} lowerIsBetter={false} hasEst={!!est} /></tr>
                <tr className="vsec"><td colSpan={5}>Expenses <span className="vhint">— click a head to expand its components</span></td></tr>
                {tree.map((g) => (
                  <React.Fragment key={g.parent}>
                    <tr className="vparent" onClick={() => toggle(g.parent)} onDoubleClick={() => toggle(g.parent)}>
                      <td className="vtbl-part">
                        <div className="vparent-label">
                          <span className="pchev">{expanded.has(g.parent) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                          <span className="pdot" style={{ background: g.color }} />
                          <b className="vparent-name">{g.label}</b>
                          <span className="pcount">{g.children.length}</span>
                          {g.amort > 0 && <em className="amort-tag">⏳ {inr(g.amort)} spread</em>}
                        </div>
                      </td>
                      <VarCells est={g.est} actual={g.actual} lowerIsBetter={true} hasEst={g.est > 0} />
                    </tr>
                    {expanded.has(g.parent) && g.children.filter((ch) => ch.actual !== 0 || ch.est !== 0).map((ch) => (
                      <tr className="vchild" key={ch.key}>
                        <td className="vtbl-part vtbl-part-child">
                          <span className="cbranch" />
                          <span className="vchild-name">{ch.label}</span>
                          {ch.amort > 0 && <em className="amort-tag">⏳ {inr(ch.amort)}</em>}
                        </td>
                        <VarCells est={ch.est} actual={ch.actual} lowerIsBetter={true} hasEst={ch.est > 0} />
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr className="vtot green"><td className="vtbl-part">Sub-total (b)</td><VarCells est={est?.expense || 0} actual={c.expense} lowerIsBetter={true} hasEst={!!est} /></tr>
                <tr className={"vtot " + (c.profit >= 0 ? "profit" : "loss")}><td className="vtbl-part">Profit (a − b)</td><VarCells est={est?.profit || 0} actual={c.profit} lowerIsBetter={false} hasEst={!!est} /></tr>
                <tr className="vmargin">
                  <td className="vtbl-part">Margin %</td>
                  <td className="r mono dim vtbl-num">{est ? pct(est.margin) : "—"}</td>
                  <td className="r mono vtbl-num">{pct(c.margin)}</td>
                  <td className="r mono vtbl-num" style={{ color: est ? (c.margin >= est.margin ? "var(--profit)" : "var(--loss)") : "var(--muted)" }}>{est ? `${c.margin - est.margin >= 0 ? "+" : ""}${(c.margin - est.margin).toFixed(1)} pp` : "—"}</td>
                  <td className="r mono dim vtbl-num">—</td>
                </tr>
              </tbody>
            </table>
            </div>
          </Card>
          <div className="grid-2 site-detail-charts">
            <Card title="Expense Mix · by parent">
              <div className="donut-wrap">
                <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">{catData.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip content={<TipBox fmt={inr} />} /></PieChart></ResponsiveContainer>
                <div className="legend">{[...catData].sort((a, b) => b.value - a.value).map((d) => <div key={d.name} className="legend-row"><span className="legend-dot" style={{ background: d.color }} /><span className="legend-name">{d.name}</span><span className="legend-val">{pct((d.value / c.expense) * 100)}</span></div>)}</div>
              </div>
            </Card>
            <div className="stack">
              {site.spreads && site.spreads.length > 0 && (
                <Card title="Active Spread Costs">
                  <div className="spread-list">{site.spreads.map((sp) => { const si = monthIdx(sp.start); const active = monthIdx(month) >= si && monthIdx(month) < si + Number(sp.months); return (
                    <div className={"spread-item" + (active ? " on" : "")} key={sp.id}><CalendarClock size={15} /><div><div className="spread-name">{childLabel(site, sp.head)}</div><div className="spread-meta">{inr(sp.total)} ÷ {sp.months}m from {monthLabelOf(sp.start)} · {inr(sp.total / sp.months)}/mo</div></div><span className="spread-state">{active ? "active" : monthIdx(month) < si ? "upcoming" : "ended"}</span></div>
                  ); })}</div>
                </Card>
              )}
              {siteTrend.length > 1 && (
                <Card title="Profit Trend · actual vs estimate">
                  <ResponsiveContainer width="100%" height={180}><LineChart data={siteTrend} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--line)" /><YAxis tickFormatter={inrShort} tick={{ fontSize: 10, fill: "var(--muted)" }} stroke="var(--line)" width={54} /><Tooltip content={<TipBox fmt={inr} />} />
                    <Line type="monotone" dataKey="profit" name="Actual" stroke="var(--green)" strokeWidth={2.4} dot={{ r: 3 }} /><Line type="monotone" dataKey="estProfit" name="Estimate" stroke="var(--gold)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5 }} connectNulls />
                  </LineChart></ResponsiveContainer>
                  <div className="trend-legend"><span><i style={{ background: "var(--green)" }} />Actual</span><span><i style={{ background: "var(--gold)" }} />Estimate</span></div>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── SITE CONFIG (parent → child builder) ───────────────────────── */
function SiteConfig({ sites, library, parents, activeSite, setActiveSite, records, month, onPatchSite, onApplySetupChange, onRemoveHead, onRenameHead, onAdd, onRenameParent, onSetParentColor }) {
  const [siteId, setSiteId] = useState(activeSite || sites[0]?.id || "");
  useEffect(() => { if (activeSite) setSiteId(activeSite); }, [activeSite]);
  const site = sites.find((s) => s.id === siteId);
  const [newLabel, setNewLabel] = useState("");
  const [newParent, setNewParent] = useState(PARENTS[0].key);
  const [editing, setEditing] = useState(null); // parent key being renamed
  const [editVal, setEditVal] = useState("");
  const [editingChild, setEditingChild] = useState(null); // child key being renamed
  const [editChildVal, setEditChildVal] = useState("");
  const [colorEdit, setColorEdit] = useState(null); // parent key whose colour swatches are open
  const [newPName, setNewPName] = useState("");
  const [newPColor, setNewPColor] = useState(PARENT_PALETTE[6]);
  const drag = useRef(null);
  if (!sites.length) return <div className="empty"><Building2 size={30} /><h3>No sites yet</h3><p>Add a site to configure its parent &amp; child cost heads.</p><button className="primary" onClick={onAdd} style={{ marginTop: 12 }}><PlusCircle size={15} /> Add Site</button></div>;
  if (!site) return null;

  const siteLib = mergeSiteLibrary(site, library);
  const structure = displayStructure(site);
  const used = new Set(siteChildKeys(site));
  const available = siteLib.filter((h) => !used.has(h.key));
  const libMap = Object.fromEntries(siteLib.map((h) => [h.key, h]));

  const moveChild = (childKey, fromParent, toParent, beforeKey) => {
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      let nextStructure = displayStructure(target).map((g) => ({ parent: g.parent, children: [...g.children] }));
      nextStructure.forEach((g) => { g.children = g.children.filter((k) => k !== childKey); });
      const tg = nextStructure.find((g) => g.parent === toParent);
      if (!tg) return {};
      if (beforeKey) { const i = tg.children.indexOf(beforeKey); tg.children.splice(i < 0 ? tg.children.length : i, 0, childKey); }
      else tg.children.push(childKey);
      return {
        sites: allSites.map((s) => (s.id === siteId ? { ...s, structure: compactStructure(nextStructure) } : s)),
      };
    }, { scope: "structure", siteCode: siteId });
  };

  const removeChild = (childKey) => {
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const s = displayStructure(target).map((g) => ({ parent: g.parent, children: g.children.filter((k) => k !== childKey) }));
      const stripEst = (est) => {
        if (!est.expenses?.[childKey]) return est;
        const { [childKey]: _removed, ...expenses } = est.expenses;
        return { ...est, expenses };
      };
      const nextSite = {
        ...target,
        structure: compactStructure(s),
        spreads: (target.spreads || []).filter((sp) => sp.head !== childKey),
        estimates: (target.estimates || []).map(stripEst),
      };
      return { sites: allSites.map((s) => (s.id === siteId ? nextSite : s)) };
    }, { scope: "structure", siteCode: siteId });
  };

  const onDragStart = (childKey, fromParent) => { drag.current = { childKey, fromParent }; };
  const onDropParent = (toParent) => { const d = drag.current; if (d) moveChild(d.childKey, d.fromParent, toParent, null); drag.current = null; };
  const onDropChild = (toParent, beforeKey) => { const d = drag.current; if (d) moveChild(d.childKey, d.fromParent, toParent, beforeKey); drag.current = null; };
  const onDropAvailable = () => { const d = drag.current; if (d && d.fromParent !== "__available__") removeChild(d.childKey); drag.current = null; };

  const deleteHead = (key) => {
    const h = libMap[key];
    if (!h) return;
    const isSiteCustom = (site.customHeads || []).some((x) => x.key === key);
    if (!isSiteCustom) {
      removeChild(key);
      return;
    }
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const nextStructure = displayStructure(target).map((g) => ({
        parent: g.parent,
        children: g.children.filter((k) => k !== key),
      }));
      return {
        sites: allSites.map((s) => (s.id === siteId ? {
          ...s,
          customHeads: (s.customHeads || []).filter((x) => x.key !== key),
          structure: compactStructure(nextStructure),
        } : s)),
      };
    }, { scope: "structure", siteCode: siteId });
  };

  const commitChildRename = (key) => {
    const isSiteCustom = (site.customHeads || []).some((x) => x.key === key);
    if (isSiteCustom) {
      onApplySetupChange(({ sites: allSites }) => ({
        sites: allSites.map((s) => (s.id === siteId ? {
          ...s,
          customHeads: (s.customHeads || []).map((h) => (h.key === key ? { ...h, label: (editChildVal && editChildVal.trim()) || h.label } : h)),
        } : s)),
      }), { scope: "structure", siteCode: siteId });
    } else {
      onRenameHead(key, editChildVal);
    }
    setEditingChild(null);
  };

  const addCustom = () => {
    if (!newLabel.trim()) return;
    let key = `${siteId}_${slug(newLabel)}`;
    let n = 1;
    while (siteLib.some((h) => h.key === key)) key = `${siteId}_${slug(newLabel)}-${++n}`;
    const head = { key, label: newLabel.trim(), parent: newParent, custom: true, siteScoped: true };
    onApplySetupChange(({ sites: allSites }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const nextStructure = displayStructure(target).map((g) => (
        g.parent === newParent ? { parent: g.parent, children: [...g.children, key] } : g
      ));
      return {
        sites: allSites.map((s) => (s.id === siteId ? {
          ...s,
          customHeads: [...(s.customHeads || []), head],
          structure: compactStructure(nextStructure),
        } : s)),
      };
    }, { scope: "structure", siteCode: siteId });
    setNewLabel("");
  };

  return (
    <>
      <div className="entry-bar">
        <div className="entry-sel">
          <label htmlFor="config-site-select">Select site</label>
          <select
            id="config-site-select"
            value={siteId}
            onChange={(e) => {
              const id = e.target.value;
              setSiteId(id);
              setActiveSite(id);
            }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.wo ? ` · ${s.wo}` : ""}</option>
            ))}
          </select>
        </div>
        <div className="cfg-hint"><GripVertical size={14} /> Components are site-specific — changes apply only to <b>{site.name}</b>.</div>
      </div>

      <Card title="Available cost lines" right={<span className="muted-s">{available.length} unused · drag into a parent below</span>}>
        <div className="tray" onDragOver={(e) => e.preventDefault()} onDrop={onDropAvailable}>
          {available.length === 0 && <div className="dnd-empty">Every cost line is assigned. Drag one back here to remove it from this site.</div>}
          {available.map((h) => (
            <div key={h.key} className="dnd-chip" draggable onDragStart={() => onDragStart(h.key, "__available__")}>
              <GripVertical size={13} className="grip" />
              <span className="cat-dot" style={{ background: parentColor(h.parent) }} title={parentLabel(h.parent)} />
              {editingChild === h.key ? (
                <input className="chip-edit" autoFocus value={editChildVal}
                  onChange={(e) => setEditChildVal(e.target.value)}
                  onBlur={() => commitChildRename(h.key)}
                  onKeyDown={(e) => { if (e.key === "Enter") commitChildRename(h.key); if (e.key === "Escape") setEditingChild(null); }}
                  onMouseDown={(e) => e.stopPropagation()} />
              ) : (
                <>
                  <span>{h.label}</span>
                  <button type="button" className="chip-act" title="Rename cost line" onMouseDown={(e) => e.stopPropagation()} onClick={() => { setEditingChild(h.key); setEditChildVal(h.label); }}><Pencil size={11} /></button>
                  <button type="button" className="chip-act danger" title="Delete cost line" onMouseDown={(e) => e.stopPropagation()} onClick={() => deleteHead(h.key)}><X size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="add-head">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="New custom cost line (e.g. Night Shift Allowance)" onKeyDown={(e) => e.key === "Enter" && addCustom()} />
          <select value={newParent} onChange={(e) => setNewParent(e.target.value)}>{PARENTS.map((p) => <option key={p.key} value={p.key}>{parentLabel(p.key)}</option>)}</select>
          <button className="primary sm" onClick={addCustom}><Plus size={14} /> Add</button>
        </div>
      </Card>

      <div className="pmanage pmanage-locked">
        <span className="blab">Parent heads</span>
        <span className="muted-s">Standardized across P&amp;L — six reportable groups</span>
      </div>

      <div className="parents-grid">
        {structure.map((g) => (
          <div key={g.parent} className="pgroup" onDragOver={(e) => e.preventDefault()} onDrop={() => onDropParent(g.parent)}>
            <div className="pgroup-h" style={{ borderColor: parentColor(g.parent) }}>
              <button className="pdot-btn" title="Change colour" onClick={() => setColorEdit(colorEdit === g.parent ? null : g.parent)}><span className="pdot" style={{ background: parentColor(g.parent) }} /></button>
              {editing === g.parent ? (
                <input className="pedit" autoFocus value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => { onRenameParent(g.parent, editVal); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { onRenameParent(g.parent, editVal); setEditing(null); } if (e.key === "Escape") setEditing(null); }} />
              ) : (
                <>
                  <b className="pname" title="Standard parent head">{parentLabel(g.parent)}</b>
                  {g.children.length === 0 && <span className="muted-s sm">No lines assigned</span>}
                </>
              )}
              <span className="pcount">{g.children.length}</span>
            </div>
            {colorEdit === g.parent && <div className="swatches inhdr">{PARENT_PALETTE.map((c) => <button key={c} className={"sw" + (parentColor(g.parent) === c ? " on" : "")} style={{ background: c }} onClick={() => { onSetParentColor(g.parent, c); setColorEdit(null); }} />)}</div>}
            <div className="pchildren">
              {g.children.length === 0 && <div className="dnd-empty sm">Drag cost lines here</div>}
              {g.children.map((k) => (
                <div key={k} className="dnd-chip on" draggable onDragStart={() => onDragStart(k, g.parent)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); onDropChild(g.parent, k); }}>
                  <GripVertical size={13} className="grip" />
                  {editingChild === k ? (
                    <input className="chip-edit" autoFocus value={editChildVal}
                      onChange={(e) => setEditChildVal(e.target.value)}
                      onBlur={() => commitChildRename(k)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitChildRename(k); if (e.key === "Escape") setEditingChild(null); }}
                      onMouseDown={(e) => e.stopPropagation()} />
                  ) : (
                    <>
                      <span>{libMap[k]?.label || k}</span>
                      <button type="button" className="chip-act" title="Rename cost line" onMouseDown={(e) => e.stopPropagation()} onClick={() => { setEditingChild(k); setEditChildVal(libMap[k]?.label || k); }}><Pencil size={11} /></button>
                      <button type="button" className="chip-act danger" title="Remove from site" onMouseDown={(e) => e.stopPropagation()} onClick={() => removeChild(k)}><X size={14} /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ContractBudgetEditor site={site} library={library} onPatchSite={onPatchSite} />
    </>
  );
}

function ContractBudgetEditor({ site, library, onPatchSite }) {
  const libMap = Object.fromEntries(library.map((h) => [h.key, h]));
  const structure = displayStructure(site).filter((g) => g.children.length);
  const estimates = (site.estimates || []).slice().sort((a, b) => monthIdx(a.effectiveFrom) - monthIdx(b.effectiveFrom));
  const [editing, setEditing] = useState(false);
  const [effFrom, setEffFrom] = useState(site.contractStart || "2025-04");
  const [note, setNote] = useState("");
  const [rev, setRev] = useState({});
  const [exp, setExp] = useState({});
  const startEdit = (base) => { setEditing(true); setEffFrom(base?.effectiveFrom || site.contractStart || "2025-04"); setNote(base?.note || ""); setRev(base?.revenue ? { ...base.revenue } : {}); setExp(base?.expenses ? { ...base.expenses } : {}); };
  const saveEst = () => { const clean = (o) => { const r = {}; Object.entries(o).forEach(([k, v]) => { if (Number(v)) r[k] = Number(v); }); return r; }; const ver = { id: "est" + Date.now(), effectiveFrom: effFrom, note: note.trim(), revenue: clean(rev), expenses: clean(exp) }; const others = (site.estimates || []).filter((e) => e.effectiveFrom !== effFrom); onPatchSite(site.id, { estimates: [...others, ver] }); setEditing(false); };
  const delEst = (id) => onPatchSite(site.id, { estimates: (site.estimates || []).filter((e) => e.id !== id) });
  const setContract = (patch) => onPatchSite(site.id, patch);

  return (
    <Card title="Contract & Estimate (Budget)" right={<span className="muted-s">monthly actuals are compared to the estimate in force</span>}>
      <div className="contract-row">
        <label className="sf"><span>Estimated contract start</span><FinanceDateInput className="sf-sel" value={contractDateInputValue(site.estContractStart)} onChange={(v) => setContract({ estContractStart: v || null })} /></label>
        <label className="sf"><span>Estimated contract end</span><FinanceDateInput className="sf-sel" value={contractDateInputValue(site.estContractEnd)} onChange={(v) => setContract({ estContractEnd: v || null })} /></label>
        <div className="contract-note">Used for variance comparison and to spread mid-contract costs across remaining months.</div>
      </div>
      {estimates.length > 0 && (
        <table className="tbl" style={{ margin: "6px 0 14px" }}>
          <thead><tr><th>Estimate version</th><th>Effective from</th><th className="r">Est. Revenue</th><th className="r">Est. Expense</th><th className="r">Est. Profit</th><th className="r">Margin</th><th></th></tr></thead>
          <tbody>{estimates.map((e) => { const t = estTotals(e); return (<tr key={e.id}><td className="strong">{e.note || "Estimate"}</td><td className="mono">{monthLabelOf(e.effectiveFrom)}</td><td className="r mono">{inr(t.revenue)}</td><td className="r mono">{inr(t.expense)}</td><td className="r mono" style={{ color: t.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>{inr(t.profit)}</td><td className="r mono">{pct(t.margin)}</td><td className="r nowrap"><button className="icon-btn" title="Edit / revise" onClick={() => startEdit(e)}><Pencil size={13} /></button><button className="icon-btn danger" onClick={() => delEst(e.id)}><Trash2 size={13} /></button></td></tr>); })}</tbody>
        </table>
      )}
      {!editing ? (
        <div className="m-actions" style={{ justifyContent: "flex-start" }}>
          <button className="primary sm" onClick={() => startEdit(estimates[estimates.length - 1])}><Plus size={14} /> {estimates.length ? "Revise estimate (renewal)" : "Set estimate / budget"}</button>
          {estimates.length > 0 && <span className="muted-s" style={{ alignSelf: "center" }}>Revising creates a new version from the chosen month — earlier months keep comparing to the prior estimate.</span>}
        </div>
      ) : (
        <div className="est-editor">
          <div className="est-bar">
            <label className="sf"><span>Effective from</span><PeriodDateSelect inputClassName="sf-sel" value={effFrom} onChange={setEffFrom} showFormattedHint={false} /></label>
            <label className="sf" style={{ flex: 2 }}><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for this estimate / revision (e.g. Renewal FY26)" /></label>
            <button className="primary sm" onClick={saveEst}>Save estimate</button><button className="ghost-d" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <div className="fgroup-h" style={{ color: "var(--green)" }}>Estimated Revenue</div>
          <div className="fields">{REVENUE_ITEMS.map((it) => (<label className="field" key={it.key}><span>{it.label}</span><div className="field-in"><i>₹</i><input type="number" value={rev[it.key] ?? ""} placeholder="0" onChange={(e) => setRev((s) => ({ ...s, [it.key]: e.target.value }))} /></div></label>))}</div>
          <div className="fgroup-h" style={{ color: "var(--loss)", marginTop: 14 }}>Estimated Expenses (by parent → line)</div>
          {structure.map((g) => (<div key={g.parent} className="fgroup"><div className="pminihead" style={{ color: parentColor(g.parent) }}><span className="pdot" style={{ background: parentColor(g.parent) }} />{parentLabel(g.parent)}</div><div className="fields">{g.children.map((k) => (<label className="field" key={k}><span>{libMap[k]?.label || k}</span><div className="field-in"><i>₹</i><input type="number" value={exp[k] ?? ""} placeholder="0" onChange={(e) => setExp((s) => ({ ...s, [k]: e.target.value }))} /></div></label>))}</div></div>))}
        </div>
      )}
    </Card>
  );
}

const spreadIsActive = (sp, mk) => {
  const si = monthIdx(sp.start), ci = monthIdx(mk), m = Number(sp.months) || 0;
  return si >= 0 && m > 0 && ci >= si && ci < si + m;
};

function SpreadEditor({ site, library, onPatchSite, entryMonth }) {
  const childKeys = siteChildKeys(site);
  const libMap = Object.fromEntries(library.map((h) => [h.key, h]));
  const [head, setHead] = useState(childKeys[0] || "");
  const [total, setTotal] = useState("");
  const [start, setStart] = useState(entryMonth || "2025-07");
  const [months, setMonths] = useState("12");
  const [mode, setMode] = useState("remaining");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  useEffect(() => { if (!childKeys.includes(head)) setHead(childKeys[0] || ""); }, [site.id]); // eslint-disable-line
  useEffect(() => { if (entryMonth && !editingId) setStart(entryMonth); }, [entryMonth, site.id, editingId]);
  const spreads = site.spreads || [];
  const hasContractEnd = !!site.contractEnd;
  const autoMonths = remainingMonths(site, start);
  const effMonths = mode === "remaining" && hasContractEnd ? autoMonths : Number(months) || 0;
  const grouped = displayStructure(site).filter((g) => g.children.length);
  const resetForm = () => {
    setEditingId(null);
    setTotal("");
    setNote("");
    setMode("remaining");
    setMonths("12");
    if (entryMonth) setStart(entryMonth);
  };
  const save = () => {
    if (!head || !Number(total) || !effMonths) return;
    const sp = { id: editingId || "sp" + Date.now(), head, total: Number(total), start, months: effMonths, mode, note: note.trim() };
    onPatchSite(site.id, { spreads: editingId ? spreads.map((s) => (s.id === editingId ? sp : s)) : [...spreads, sp] });
    resetForm();
  };
  const beginEdit = (sp) => {
    setEditingId(sp.id);
    setHead(sp.head);
    setTotal(String(sp.total));
    setStart(sp.start);
    setMonths(String(sp.months));
    setMode(sp.mode === "fixed" ? "fixed" : "remaining");
    setNote(sp.note || "");
  };
  const del = (id) => { if (editingId === id) resetForm(); onPatchSite(site.id, { spreads: spreads.filter((s) => s.id !== id) }); };
  const perMonth = Number(total) && effMonths ? inr(Number(total) / effMonths) : "₹—";
  return (
    <div>
      {spreads.length > 0 && (
        <table className="tbl" style={{ marginBottom: 14 }}>
          <thead><tr><th>Cost line</th><th>Note</th><th className="r">Total cost</th><th>From</th><th className="r">Months</th><th className="r">Per month</th>{entryMonth && <th>Active now?</th>}<th></th></tr></thead>
          <tbody>{spreads.map((sp) => {
            const active = entryMonth ? spreadIsActive(sp, entryMonth) : false;
            return (
              <tr key={sp.id} className={editingId === sp.id ? "spread-row-editing" : ""}>
                <td className="strong">{libMap[sp.head]?.label || sp.head}</td>
                <td className="muted-s">{sp.note || "—"}</td>
                <td className="r mono">{inr(sp.total)}</td>
                <td className="mono">{formatFinanceDate(periodKeyToDateStart(sp.start)) || monthLabelOf(sp.start)}</td>
                <td className="r mono">{sp.months}</td>
                <td className="r mono" style={{ color: "var(--green)" }}>{inr(sp.total / sp.months)}</td>
                {entryMonth && <td className={active ? "spread-active-yes" : "spread-active-no"}>{active ? "yes" : "no"}</td>}
                <td className="r nowrap"><button type="button" className="icon-btn" title="Edit spread" onClick={() => beginEdit(sp)}><Pencil size={13} /></button><button type="button" className="icon-btn danger" title="Delete spread" onClick={() => del(sp.id)}><Trash2 size={14} /></button></td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
      <div className="spread-form">
        <label className="sf"><span>Cost line</span><select value={head} onChange={(e) => setHead(e.target.value)}>{grouped.map((g) => <optgroup key={g.parent} label={parentLabel(g.parent)}>{g.children.map((k) => <option key={k} value={k}>{libMap[k]?.label || k}</option>)}</optgroup>)}</select></label>
        <label className="sf"><span>Total cost (₹)</span><input type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="4000" /></label>
        <label className="sf">
          <span>Arrives / starts</span>
          <FinanceDateInput
            className="sf-sel"
            value={periodKeyToDateStart(start) || ""}
            onChange={(iso) => {
              const pk = dateToPeriodKey(iso);
              if (pk) setStart(pk);
            }}
          />
        </label>
        <label className="sf"><span>Spread over</span><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="remaining" disabled={!hasContractEnd}>Remaining contract{hasContractEnd ? ` (${autoMonths} mo)` : " — set end first"}</option><option value="fixed">Fixed no. of months</option></select></label>
        {mode === "fixed" && <label className="sf sm"><span>Months</span><input type="number" value={months} onChange={(e) => setMonths(e.target.value)} placeholder="12" /></label>}
        <label className="sf"><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Extra PPE — new batch" /></label>
        {editingId ? (
          <><button type="button" className="primary sm" onClick={save}>Save changes</button><button type="button" className="ghost-d" onClick={resetForm}>Cancel</button></>
        ) : (
          <button type="button" className="primary sm" onClick={save}><Plus size={14} /> Add spread</button>
        )}
      </div>
      {!hasContractEnd && (
        <p className="m-note warn" style={{ marginTop: 10 }}>Set a <b>contract end date</b> under Site Setup → Contract &amp; Estimate so &ldquo;Remaining contract&rdquo; can calculate months automatically.</p>
      )}
      <p className="m-note" style={{ marginTop: 10 }}>
        The full cost is logged against the month it arrives; <b>{perMonth}/month</b>{" "}
        {mode === "remaining" && hasContractEnd
          ? `is recognised across the remaining ${autoMonths} contract months (through ${monthLabelOf(site.contractEnd)})`
          : `is recognised across ${effMonths || "—"} months`}
        {entryMonth ? " — multiple spreads on the same cost line stack for the monthly total." : " — and reflected in all dashboards, statements and trends."}
      </p>
    </div>
  );
}

/* ───────────────────────── ENTRY FORM ───────────────────────── */
function recordToFormFields(raw) {
  if (!raw || typeof raw !== "object") return {};
  const form = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (k === "reimbursements" || k === "reimbursementType" || k === "reimbursementOtherLabel" || k === "esicBill") {
      return;
    }
    if (k === "creditNoteRemark") {
      form.creditNoteRemark = v != null ? String(v) : "";
      return;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      form[k] = String(v);
    } else if (v != null && v !== "") {
      form[k] = v;
    }
  });
  form.reimbursements = normalizeReimbursementsFromRecord(raw).map((it) => ({
    ...it,
    amount: it.amount != null && it.amount !== 0 ? String(it.amount) : "",
  }));
  return form;
}

function entryRecordClean(form) {
  const clean = {};
  const reimbursements = (form.reimbursements || [])
    .filter((it) => it.type)
    .map((it) => ({
      id: it.id || newReimbursementId(),
      type: it.type,
      amount: parseEntryAmount(it.amount),
      ...(it.type === REIMBURSEMENT_OTHER_KEY ? { label: String(it.label ?? "").trim() } : {}),
    }));
  if (Array.isArray(form.reimbursements)) {
    clean.reimbursements = reimbursements;
    const total = reimbursements.reduce((s, it) => s + parseEntryAmount(it.amount), 0);
    if (total) clean.esicBill = total;
  }
  Object.entries(form).forEach(([k, v]) => {
    if (
      k === "reimbursements" ||
      k === "reimbursementType" ||
      k === "reimbursementOtherLabel" ||
      k === "esicBill" ||
      k === "creditNoteRemark"
    ) {
      return;
    }
    if (v === undefined || v === null || String(v).trim() === "") return;
    const n = parseEntryAmount(v);
    if (!Number.isNaN(n)) clean[k] = n;
  });
  const remark = form.creditNoteRemark != null ? String(form.creditNoteRemark).trim() : "";
  if (remark) clean.creditNoteRemark = remark;
  return clean;
}

function buildReimbursementSavePayload(existing, reimbursementItems) {
  const reimbClean = entryRecordClean({ reimbursements: reimbursementItems });
  return mergePeriodEntry(existing, reimbClean);
}

function revenueTotalRows(rec) {
  const rows = [];
  REVENUE_ITEMS.forEach((it) => {
    if (it.key === "esicBill") {
      const lines = reimbursementDisplayLines(rec);
      if (lines.length) {
        lines.forEach((ln) => rows.push({ label: `Reimbursement · ${ln.label}`, amount: ln.amount, sign: it.sign }));
      } else {
        rows.push({ label: it.label, amount: 0, sign: it.sign });
      }
    } else {
      rows.push({ label: it.label, amount: parseEntryAmount(rec[it.key]), sign: it.sign });
    }
  });
  return rows;
}

function SiteSearchSelect({ sites, value, onChange, label = "Site", id = "site-search" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selected = sites.find((s) => s.id === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) => {
      const hay = [s.name, s.service, s.wo, s.ocNumber, s.id].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [sites, query]);
  useEffect(() => {
    if (!open) setQuery(selected?.name || "");
  }, [open, selected?.name, selected?.id]);
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const pick = (siteId) => {
    onChange(siteId);
    setOpen(false);
    const site = sites.find((s) => s.id === siteId);
    setQuery(site?.name || "");
  };
  return (
    <div className="entry-sel site-search" ref={wrapRef}>
      <label htmlFor={id}>{label}</label>
      <div className="site-search-box">
        <Search className="site-search-ico" size={14} />
        <input
          id={id}
          type="text"
          value={open ? query : (selected?.name || "")}
          placeholder="Search site name, OC, PO…"
          onFocus={() => {
            setOpen(true);
            setQuery(selected?.name || "");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery(selected?.name || "");
            }
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              pick(filtered[0].id);
            }
          }}
          autoComplete="off"
        />
        {open && (
          <div className="site-search-menu" role="listbox">
            {filtered.length === 0 ? (
              <div className="site-search-empty">No sites match your search</div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={s.id === value}
                  className={"site-search-opt" + (s.id === value ? " on" : "")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s.id)}
                >
                  <span className="site-search-opt-name">{s.name}</span>
                  {(s.ocNumber || s.wo) && (
                    <span className="site-search-opt-meta">
                      {[s.ocNumber, s.wo].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryForm({ sites, library, records, month, setMonth, activeSite, setActiveSite, libMap, onSave, onRecordPersisted, onPatchSite, onAdd, goConfig }) {
  const [siteId, setSiteId] = useState(activeSite || sites[0]?.id || "");
  const [mk, setMk] = useState(month || currentPeriodKey());
  const [form, setForm] = useState({});
  const [saveUi, setSaveUi] = useState("idle");
  const [reimbSaveUi, setReimbSaveUi] = useState("idle");
  const [formDirty, setFormDirty] = useState(false);
  const [reimbDirty, setReimbDirty] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const suppressRecordReload = useRef(false);
  const formLoadKey = useRef("");
  const persistGen = useRef(0);
  useEffect(() => {
    if (activeSite && sites.some((s) => s.id === activeSite)) {
      setSiteId(activeSite);
      return;
    }
    if (siteId && sites.some((s) => s.id === siteId)) return;
    const fallback = sites[0]?.id || "";
    if (fallback) setSiteId(fallback);
  }, [activeSite, sites, siteId]);
  useEffect(() => { setMk(month); }, [month]);
  useEffect(() => {
    const loadKey = `${siteId}__${mk}`;
    if (suppressRecordReload.current) {
      suppressRecordReload.current = false;
      return;
    }
    const navigated = formLoadKey.current !== loadKey;
    formLoadKey.current = loadKey;
    const raw = records[loadKey];
    setForm((prev) => {
      const loaded = recordToFormFields(raw);
      if (!navigated) {
        return { ...loaded, ...prev, reimbursements: prev.reimbursements ?? loaded.reimbursements };
      }
      return loaded;
    });
    if (navigated) {
      setFormDirty(false);
      setReimbDirty(false);
      setSaveUi("idle");
      setReimbSaveUi("idle");
    }
  }, [siteId, mk, records]);
  const saveUiTimer = useRef(null);
  const persistForm = useCallback((data, { manual = false } = {}) => {
    const payload = data ?? formRef.current;
    const clean = entryRecordClean(payload);
    const existing = records[`${siteId}__${mk}`] || {};
    const toPersist = mergePeriodEntry(existing, clean);
    const gen = ++persistGen.current;
    suppressRecordReload.current = true;
    onSave(siteId, mk, toPersist);
    setMonth(mk);
    setActiveSite(siteId);
    setSaveUi("saving");
    savePeriodRecord(siteId, mk, toPersist)
      .then(() => {
        if (gen !== persistGen.current) return;
        onRecordPersisted?.();
        setFormDirty(false);
        setSaveUi(manual ? "saved" : "autosaved");
        if (saveUiTimer.current) clearTimeout(saveUiTimer.current);
        saveUiTimer.current = setTimeout(() => setSaveUi("idle"), manual ? 2500 : 1800);
      })
      .catch((e) => {
        if (gen !== persistGen.current) return;
        console.error("Revenue save failed:", e);
        setSaveUi("error");
      });
  }, [siteId, mk, records, onSave, onRecordPersisted, setMonth, setActiveSite]);
  const saveReimbursements = useCallback(() => {
    const existing = records[`${siteId}__${mk}`] || {};
    const merged = buildReimbursementSavePayload(existing, formRef.current.reimbursements || []);
    const gen = ++persistGen.current;
    suppressRecordReload.current = true;
    onSave(siteId, mk, merged);
    setReimbSaveUi("saving");
    savePeriodRecord(siteId, mk, merged)
      .then(() => {
        if (gen !== persistGen.current) return;
        onRecordPersisted?.();
        setForm((f) => ({
          ...f,
          reimbursements: recordToFormFields(merged).reimbursements,
        }));
        setReimbDirty(false);
        setReimbSaveUi("saved");
        if (saveUiTimer.current) clearTimeout(saveUiTimer.current);
        saveUiTimer.current = setTimeout(() => setReimbSaveUi("idle"), 2500);
      })
      .catch((e) => {
        if (gen !== persistGen.current) return;
        console.error("Reimbursement save failed:", e);
        setReimbSaveUi("error");
      });
  }, [siteId, mk, records, onSave, onRecordPersisted]);
  useEffect(() => {
    const flushForm = () => {
      if (!formDirty) return;
      persistForm(undefined, { manual: true });
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushForm();
    };
    window.addEventListener("pagehide", flushForm);
    window.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushForm);
      window.removeEventListener("visibilitychange", onHide);
    };
  }, [formDirty, persistForm]);
  if (!sites.length) return <div className="empty"><Building2 size={30} /><h3>No sites yet</h3><p>Add your first site to start recording figures.</p><button className="primary" onClick={onAdd} style={{ marginTop: 12 }}><PlusCircle size={15} /> Add Site</button></div>;
  const site = sites.find((s) => s.id === siteId);
  if (!site) return <div className="empty"><Building2 size={30} /><h3>Site not found</h3><p>Pick another site from the list.</p></div>;
  const structure = displayStructure(site).filter((g) => g.children.length);
  const patchForm = (patch) => {
    setFormDirty(true);
    setForm((f) => ({ ...f, ...patch }));
  };
  const set = (k, v) => patchForm({ [k]: v });
  const c = calcSite(site, mk, records, form);
  const parentSub = (g) => g.children.reduce((a, k) => a + (c.ex.total[k] || 0), 0);
  const save = () => {
    persistForm(undefined, { manual: true });
  };
  const renderField = (key, label) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <div className="field-in">
        <i>₹</i>
        <input
          type="text"
          inputMode="decimal"
          value={form[key] ?? ""}
          placeholder="0"
          onChange={(e) => set(key, e.target.value)}
        />
      </div>
    </label>
  );
  const renderDeductionField = () => (
    <div className="deduction-block" key="creditNote">
      <label className="field">
        <span>less: Credit Note / deductions</span>
        <div className="field-in">
          <i>₹</i>
          <input
            type="text"
            inputMode="decimal"
            value={form.creditNote ?? ""}
            placeholder="0"
            onChange={(e) => set("creditNote", e.target.value)}
          />
        </div>
      </label>
      <label className="field deduction-remark">
        <span>Remark (deduction)</span>
        <input
          type="text"
          value={form.creditNoteRemark ?? ""}
          placeholder="Reason or reference for deduction"
          onChange={(e) => set("creditNoteRemark", e.target.value)}
        />
      </label>
    </div>
  );
  const renderReimbursementSection = () => {
    const items = form.reimbursements || [];
    const selectedFixedTypes = new Set(
      items.filter((it) => it.type && it.type !== REIMBURSEMENT_OTHER_KEY).map((it) => it.type),
    );
    const available = REIMBURSEMENT_TYPES.filter(
      (t) => t.key === REIMBURSEMENT_OTHER_KEY || !selectedFixedTypes.has(t.key),
    );
    const addType = (typeKey) => {
      if (!typeKey) return;
      if (typeKey !== REIMBURSEMENT_OTHER_KEY && selectedFixedTypes.has(typeKey)) return;
      setForm((f) => ({
        ...f,
        reimbursements: [
          ...(f.reimbursements || []),
          {
            id: newReimbursementId(),
            type: typeKey,
            amount: "",
            ...(typeKey === REIMBURSEMENT_OTHER_KEY ? { label: "" } : {}),
          },
        ],
      }));
      setReimbDirty(true);
    };
    const updateItem = (idx, patch) => {
      setReimbDirty(true);
      setForm((f) => {
        const arr = [...(f.reimbursements || [])];
        arr[idx] = { ...arr[idx], ...patch };
        return { ...f, reimbursements: arr };
      });
    };
    const removeItem = (idx) => {
      setReimbDirty(true);
      setForm((f) => ({ ...f, reimbursements: (f.reimbursements || []).filter((_, i) => i !== idx) }));
    };
    const cancelReimbursements = () => {
      const raw = records[`${siteId}__${mk}`];
      setForm((f) => ({ ...f, reimbursements: recordToFormFields(raw).reimbursements }));
      setReimbDirty(false);
      setReimbSaveUi("idle");
    };
    const reimbSaveLabel = reimbSaveUi === "saved"
      ? "✓ Saved"
      : reimbSaveUi === "saving"
        ? "Saving…"
        : reimbSaveUi === "error"
          ? "Save failed — retry"
          : "Save reimbursement";
    return (
      <div className="rev-reimb-panel">
        <div className="rev-reimb-top">
          <span className="rev-reimb-title">Reimbursement</span>
          <div className="rev-reimb-actions">
            {available.length > 0 && (
              <select
                className="rev-reimb-pick"
                value=""
                onChange={(e) => addType(e.target.value)}
              >
                <option value="">+ Add type</option>
                {available.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            )}
            {reimbDirty && (
              <button type="button" className="ghost-d rev-reimb-cancel" onClick={cancelReimbursements}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className="primary sm rev-reimb-save"
              onClick={saveReimbursements}
              disabled={reimbSaveUi === "saving"}
            >
              {reimbSaveLabel}
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <p className="rev-reimb-hint">Optional — add PF, ESIC, bonus, or other items as needed.</p>
        ) : (
          <div className="rev-reimb-lines">
            {items.map((it, idx) => (
              <div className="rev-reimb-line" key={it.id || `${it.type}-${idx}`}>
                <span className="rev-reimb-tag">
                  {it.type === REIMBURSEMENT_OTHER_KEY
                    ? "Other"
                    : REIMBURSEMENT_TYPES.find((t) => t.key === it.type)?.label || it.type}
                </span>
                {it.type === REIMBURSEMENT_OTHER_KEY && (
                  <input
                    className="rev-reimb-other"
                    placeholder="Description"
                    value={it.label ?? ""}
                    onChange={(e) => updateItem(idx, { label: e.target.value })}
                  />
                )}
                <div className="field-in rev-reimb-amt">
                  <i>₹</i>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={it.amount ?? ""}
                    onChange={(e) => updateItem(idx, { amount: e.target.value })}
                  />
                </div>
                <button type="button" className="rev-reimb-del" title="Remove" onClick={() => removeItem(idx)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
  const periodStatus = records[`${siteId}__${mk}`] ? "✓ saved" : inContract(site, mk) && monthIdx(mk) <= monthIdx(month) ? "• pending" : "";
  const saveLabel = saveUi === "saved" ? "✓ Saved" : saveUi === "autosaved" ? "✓ Saved" : saveUi === "saving" ? "Saving…" : saveUi === "error" ? "Save failed — retry" : formDirty ? "Save figures" : "Save figures";
  const periodAudit = records[`${siteId}__${mk}`]?._audit;

  return (
    <div className="entry">
      <div className="entry-bar">
        <div className="entry-bar-primary">
          <SiteClientAutocomplete sites={sites} value={siteId} onChange={(id) => { setSiteId(id); setActiveSite(id); }} label="Site / Client" id="entry-site-search" />
          <div className="entry-sel entry-sel-period">
            <label>Period</label>
            <PeriodDateSelect className="sl-period-pick" inputClassName="sl-period-sel" value={mk} onChange={setMk} />
          </div>
        </div>
        <div className="entry-bar-tools">
          <button type="button" className="ghost-d" onClick={() => goConfig(siteId)}><Sliders size={14} /> Structure</button>
        </div>
        <div className="entry-live">
          <span>Rev <b>{inrShort(c.revenue)}</b></span>
          <span>Exp <b>{inrShort(c.expense)}</b></span>
          <span style={{ color: c.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>Profit <b>{inrShort(c.profit)}</b> ({pct(c.margin)})</span>
        </div>
        <div className="entry-bar-save">
          <div className="entry-bar-save-row">
            {periodStatus && <span className="entry-period-st">{periodStatus}</span>}
            <button type="button" className="primary entry-save-btn" onClick={save} disabled={saveUi === "saving"} title="Save all figures for this site and period">
              {saveLabel}
            </button>
          </div>
          {formDirty && saveUi !== "saving" && <span className="entry-unsaved">Unsaved changes</span>}
        </div>
      </div>
      <PlAuditPanel audit={periodAudit} className="entry-audit" />
      {c.ex && Object.values(c.ex.amort).some((v) => v > 0) && (
        <div className="amort-note"><CalendarClock size={15} /> This period includes <b>{inr(Object.values(c.ex.amort).reduce((a, b) => a + b, 0))}</b> of spread costs (recognised automatically below).</div>
      )}
      <Card
        title={`Deferred / Spread Costs · ${monthLabelOf(mk)}`}
        right={site.contractEnd ? <span className="muted-s">contract through {monthLabelOf(site.contractEnd)}</span> : <span className="muted-s warn-s">no contract end set</span>}
      >
        <SpreadEditor site={site} library={library} onPatchSite={onPatchSite} entryMonth={mk} />
      </Card>
      <div className="grid-2 entry-cols entry-totals-row">
        <div className="entry-col">
          <div className="entry-totals rev-totals">
            <div className="entry-totals-h">Revenue Totals</div>
            <table className="entry-totals-tbl">
              <tbody>
                {revenueTotalRows(form).map((row, i) => (
                  <tr key={`${row.label}-${i}`}>
                    <td>{row.label}</td>
                    <td className="r mono">{inr(row.sign * row.amount)}</td>
                  </tr>
                ))}
                <tr className="ect-grand">
                  <td>Total Revenue</td>
                  <td className="r mono">{inr(c.revenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="entry-col">
          <div className="entry-totals exp-totals">
            <div className="entry-totals-h">Expense Totals</div>
            {structure.length === 0 ? (
              <p className="muted-s" style={{ margin: 0, fontSize: 12.5 }}>Configure cost lines to see section totals.</p>
            ) : (
              <table className="entry-totals-tbl">
                <tbody>
                  {structure.map((g) => (
                    <tr key={g.parent}>
                      <td className="ect-label"><span className="pdot" style={{ background: parentColor(g.parent) }} />{parentLabel(g.parent)}</td>
                      <td className="r mono">{inr(parentSub(g))}</td>
                    </tr>
                  ))}
                  <tr className="ect-grand">
                    <td>Total Expenses</td>
                    <td className="r mono">{inr(c.expense)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      <div className="grid-2 entry-cols">
        <div className="entry-col">
          <Card title="Revenue">
            <div className="rev-entry-simple">
              {renderField("saleRevenue", "Sale Revenue")}
              {renderReimbursementSection()}
              {renderDeductionField()}
            </div>
          </Card>
        </div>
        <div className="entry-col">
          <Card title="Expenses" right={<span className="muted-s">{siteChildKeys(site).length} lines · {structure.length} parents</span>}>
            {structure.length === 0 ? <div className="dnd-empty">No cost lines configured. <button className="link" onClick={() => goConfig(siteId)}>Set up the structure →</button></div> :
              structure.map((g) => <div key={g.parent} className="fgroup"><div className="fgroup-h" style={{ color: parentColor(g.parent), display: "flex", justifyContent: "space-between" }}><span><span className="pdot" style={{ background: parentColor(g.parent) }} />{parentLabel(g.parent)}</span><span className="mono" style={{ color: "var(--muted)", fontWeight: 500 }}>{inr(parentSub(g))}</span></div><div className="fields">{g.children.map((k) => renderField(k, libMap[k]?.label || k))}</div></div>)}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── REPORTS ───────────────────────── */
const FIN_MEASURES = [
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "expense", label: "Expense", kind: "money" },
  { key: "profit", label: "Profit", kind: "money", profit: true },
  { key: "margin", label: "Margin %", kind: "pct" },
  { key: "estRevenue", label: "Est. Revenue", kind: "money" },
  { key: "estExpense", label: "Est. Expense", kind: "money" },
  { key: "estProfit", label: "Est. Profit", kind: "money" },
  { key: "profitVar", label: "Profit Var", kind: "money", varc: true },
  { key: "profitVarPct", label: "Var %", kind: "vpct", varc: true },
];
const REPORT_PRESETS = [
  { id: "pnl", name: "Portfolio P&L Summary", desc: "Every site's revenue, expense, profit & margin for one month.", cfg: { dim: "site", measures: ["revenue", "expense", "profit", "margin"], scope: "all", periodMode: "single", filter: "none" } },
  { id: "bva", name: "Budget vs Actual (by site)", desc: "Actual profit vs estimate, with variance, for each site.", cfg: { dim: "site", measures: ["estProfit", "profit", "profitVar", "profitVarPct", "margin"], scope: "all", periodMode: "single", filter: "none" } },
  { id: "trend", name: "Monthly Consolidated Trend", desc: "Portfolio revenue, expense & profit month by month.", cfg: { dim: "month", measures: ["revenue", "expense", "profit", "margin"], scope: "all", periodMode: "range", filter: "none" } },
  { id: "exp", name: "Expense Analysis by Head", desc: "Spend by parent head across the portfolio.", cfg: { dim: "parent", measures: [], scope: "all", periodMode: "single", filter: "none" } },
  { id: "under", name: "Underperforming Sites", desc: "Sites that are loss-making or below their budget.", cfg: { dim: "site", measures: ["profit", "margin", "estProfit", "profitVar"], scope: "all", periodMode: "single", filter: "belowEst" } },
  { id: "spread", name: "Spread Cost Schedule", desc: "All deferred / spread costs and their monthly recognition.", cfg: { dim: "spread", measures: [], scope: "all", periodMode: "single", filter: "none" } },
  { id: "pending", name: "Data Entry Status", desc: "Which months are still pending for each site.", cfg: { dim: "pending", measures: [], scope: "all", periodMode: "single", filter: "none" } },
];

function aggPairs(pairs, records) {
  let rev = 0, exp = 0, profit = 0, eR = 0, eE = 0, eP = 0, he = false;
  pairs.forEach(([s, mk]) => {
    const c = calcSite(s, mk, records); rev += c.revenue; exp += c.expense; profit += c.profit;
    const e = estTotals(estimateFor(s, mk)); if (e) { eR += e.revenue; eE += e.expense; eP += e.profit; he = true; }
  });
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  const profitVar = he ? profit - eP : null;
  const profitVarPct = he && eP !== 0 ? (profit - eP) / Math.abs(eP) * 100 : null;
  return { rev, exp, profit, margin, estRev: he ? eR : null, estExp: he ? eE : null, estProfit: he ? eP : null, profitVar, profitVarPct, he };
}
function measureCell(key, a) {
  const m = FIN_MEASURES.find((x) => x.key === key);
  let raw = null;
  if (key === "revenue") raw = a.rev; else if (key === "expense") raw = a.exp; else if (key === "profit") raw = a.profit;
  else if (key === "margin") raw = a.margin; else if (key === "estRevenue") raw = a.estRev; else if (key === "estExpense") raw = a.estExp;
  else if (key === "estProfit") raw = a.estProfit; else if (key === "profitVar") raw = a.profitVar; else if (key === "profitVarPct") raw = a.profitVarPct;
  let text, color = null;
  if (raw == null) text = "—";
  else if (m.kind === "money") text = inr(raw);
  else if (m.kind === "pct") text = pct(raw);
  else if (m.kind === "vpct") text = `${raw >= 0 ? "+" : ""}${raw.toFixed(0)}%`;
  if (m.profit && raw != null) color = raw >= 0 ? "var(--profit)" : "var(--loss)";
  if (m.varc) color = raw == null ? "var(--muted)" : raw >= 0 ? "var(--profit)" : "var(--loss)";
  return { raw: raw == null ? "" : Math.round(raw * 10) / 10, text, color };
}
function aggHeads(sites, mks, records, level) {
  const map = {}; let totalActual = 0;
  sites.forEach((s) => mks.forEach((mk) => {
    if (!records[`${s.id}__${mk}`]) return;
    expenseTree(s, mk, records, estimateFor(s, mk)).forEach((g) => {
      if (level === "parent") { if (!map[g.parent]) map[g.parent] = { label: parentLabel(g.parent), actual: 0, est: 0, color: g.color }; map[g.parent].actual += g.actual; map[g.parent].est += g.est; totalActual += g.actual; }
      else g.children.forEach((ch) => { if (!map[ch.key]) map[ch.key] = { label: ch.label, actual: 0, est: 0, color: g.color }; map[ch.key].actual += ch.actual; map[ch.key].est += ch.est; totalActual += ch.actual; });
    });
  }));
  return { map, totalActual };
}

function buildReport(cfg) {
  const { sites, records, dim, measures, scope, periodMode, month, from, to, filter, expandPendingHistory } = cfg;
  const scopeSites = scope === "all" ? sites : sites.filter((s) => s.id === scope);
  let mks = periodMode === "single" && dim !== "month" ? [month] : periodKeysBetween(from, to);
  if (dim === "month" && periodMode === "single") mks = [month];
  const reported = (s, mk) => !!records[`${s.id}__${mk}`];

  if (dim === "pending") {
    const cols = ["Site", "Contract", "Expected", "Filled", "Pending", `Pending periods (to ${monthLabelOf(month)})`];
    const rows = scopeSites.map((s) => {
      const exp = expectedMonths(s, month);
      const pend = pendingMonthsFiltered(s, records, month, { expandHistory: expandPendingHistory });
      return [s.name, s.contractStart ? `${monthLabelOf(s.contractStart)}–${monthLabelOf(s.contractEnd)}` : "—", exp.length, exp.length - pend.length, pend.length, pend.map(monthLabelOf).join(", ") || "—"];
    }).sort((a, b) => b[4] - a[4]);
    return { kind: "pending", cols, rows };
  }

  if (dim === "spread") {
    const cols = ["Site", "Head", "Note", "Total", "From", "Months", "Per month", `State @ ${monthLabelOf(month)}`];
    const rows = [];
    scopeSites.forEach((s) => (s.spreads || []).forEach((sp) => {
      const si = monthIdx(sp.start), state = monthIdx(month) < si ? "upcoming" : monthIdx(month) < si + Number(sp.months) ? "active" : "ended";
      rows.push([s.name, childLabel(s, sp.head), sp.note || "", sp.total, monthLabelOf(sp.start), sp.months, Math.round(sp.total / sp.months), state]);
    }));
    return { kind: "spread", cols, rows };
  }

  if (dim === "parent" || dim === "child") {
    const { map, totalActual } = aggHeads(scopeSites, mks, records, dim);
    const order = dim === "parent" ? PARENTS.map((p) => p.key) : Object.keys(map);
    const columns = [{ label: "Actual", k: "actual" }, { label: "Estimate", k: "est" }, { label: "Variance", k: "var" }, { label: "% of Expense", k: "pct" }];
    const rows = order.filter((k) => map[k] && (map[k].actual !== 0 || map[k].est !== 0)).map((k) => {
      const d = map[k], v = d.actual - d.est;
      return { label: d.label, color: d.color, cells: [
        { raw: Math.round(d.actual), text: inr(d.actual) },
        { raw: d.est ? Math.round(d.est) : "", text: d.est ? inr(d.est) : "—" },
        { raw: d.est ? Math.round(v) : "", text: d.est ? `${v >= 0 ? "+" : ""}${inr(v)}` : "—", color: d.est ? (v <= 0 ? "var(--profit)" : "var(--loss)") : "var(--muted)" },
        { raw: totalActual ? Math.round(d.actual / totalActual * 1000) / 10 : "", text: totalActual ? pct(d.actual / totalActual * 100) : "—" },
      ] };
    });
    const tA = rows.reduce((a, r) => a + Number(r.cells[0].raw || 0), 0);
    const tE = rows.reduce((a, r) => a + Number(r.cells[1].raw || 0), 0);
    const totals = { label: "Total Expense", cells: [{ raw: Math.round(tA), text: inr(tA) }, { raw: Math.round(tE), text: tE ? inr(tE) : "—" }, { raw: Math.round(tA - tE), text: tE ? `${tA - tE >= 0 ? "+" : ""}${inr(tA - tE)}` : "—" }, { raw: 100, text: "100%" }] };
    return { kind: "head", columns, rows, totals };
  }

  // dim === site | month  → financial
  const columns = measures.map((k) => FIN_MEASURES.find((m) => m.key === k)).filter(Boolean);
  let entities;
  if (dim === "site") entities = scopeSites.map((s) => ({ label: s.name, pairs: mks.filter((mk) => reported(s, mk)).map((mk) => [s, mk]) })).filter((e) => e.pairs.length);
  else entities = mks.map((mk) => ({ label: monthLabelOf(mk), pairs: scopeSites.filter((s) => reported(s, mk)).map((s) => [s, mk]) })).filter((e) => e.pairs.length);
  let rows = entities.map((e) => { const a = aggPairs(e.pairs, records); return { label: e.label, a, cells: columns.map((m) => measureCell(m.key, a)) }; });
  if (filter === "loss") rows = rows.filter((r) => r.a.profit < 0);
  else if (filter === "belowEst") rows = rows.filter((r) => r.a.he && r.a.profit < r.a.estProfit);
  const allPairs = entities.flatMap((e) => e.pairs);
  const tA = aggPairs(allPairs, records);
  const totals = { label: dim === "site" ? "Portfolio total" : "Total", cells: columns.map((m) => measureCell(m.key, tA)) };
  return { kind: "fin", columns, rows, totals };
}

function Reports({ sites, sitesAll, records, parents, defaultMonth, showHistorical, setShowHistorical, onViewSite }) {
  const activeMks = useMemo(() => {
    const have = new Set();
    Object.keys(records).forEach((k) => have.add(k.split("__")[1]));
    return MONTHS.filter((m) => have.has(m.key));
  }, [records]);
  const fM = activeMks[0]?.key || defaultMonth;
  const lM = activeMks[activeMks.length - 1]?.key || defaultMonth;
  const [tab, setTab] = useState("standard");
  const [dim, setDim] = useState("site");
  const [measures, setMeasures] = useState(["revenue", "expense", "profit", "margin"]);
  const [scope, setScope] = useState("all");
  const [periodMode, setPeriodMode] = useState("single");
  const [month, setMonth] = useState(defaultMonth);
  const [from, setFrom] = useState(fM);
  const [to, setTo] = useState(lM);
  const [filter, setFilter] = useState("none");
  const [title, setTitle] = useState("Portfolio P&L Summary");
  const [activePreset, setActivePreset] = useState("pnl");
  const [expandPendingHistory, setExpandPendingHistory] = useState(false);

  useEffect(() => { setMonth(defaultMonth || currentPeriodKey()); }, [defaultMonth]);

  const choose = (p) => {
    setActivePreset(p.id);
    setDim(p.cfg.dim);
    setMeasures(p.cfg.measures.length ? p.cfg.measures : ["revenue", "expense", "profit", "margin"]);
    setScope(p.cfg.scope);
    setPeriodMode(p.cfg.dim === "month" ? "range" : p.cfg.periodMode);
    setFilter(p.cfg.filter);
    setTitle(p.name);
    if (p.cfg.periodMode === "single" && p.cfg.dim !== "month") setMonth(defaultMonth);
    if (p.cfg.dim === "month") { setFrom(fM); setTo(lM); }
  };

  const setDimMode = (k) => {
    setDim(k);
    setActivePreset(null);
    setTitle("Custom Report");
    if (k === "month") setPeriodMode("range");
  };

  const toggleMeasure = (k) => {
    setActivePreset(null);
    setTitle("Custom Report");
    setMeasures((ms) => {
      if (ms.includes(k)) {
        const next = ms.filter((x) => x !== k);
        return next.length ? next : ms;
      }
      return [...ms, k];
    });
  };

  const report = useMemo(
    () => buildReport({ sites, records, dim, measures, scope, periodMode, month, from, to, filter, expandPendingHistory }),
    [sites, records, dim, measures, scope, periodMode, month, from, to, filter, expandPendingHistory, parents],
  );

  const periodText = (dim === "spread" || dim === "pending")
    ? `as of ${monthLabelOf(month)}`
    : (dim === "month" || periodMode === "range")
      ? `${monthLabelOf(from)} – ${monthLabelOf(to)}`
      : monthLabelOf(month);
  const scopeText = scope === "all"
    ? (showHistorical ? `All ${sites.length} site versions` : `All ${sites.length} active sites`)
    : sites.find((s) => s.id === scope)?.name;
  const inactiveSites = useMemo(() => (sitesAll || sites).filter((s) => !isSiteActive(s)), [sitesAll, sites]);
  const showTotals = !(dim === "site" && periodMode === "single" && activePreset === "pnl");

  const grid = useMemo(() => {
    if (report.cols) return [report.cols, ...report.rows];
    const head = ["Site", ...report.columns.map((c) => c.label)];
    const body = report.rows.map((r) => [r.label, ...r.cells.map((c) => c.raw)]);
    if (!showTotals) return [head, ...body];
    const tot = [report.totals.label, ...report.totals.cells.map((c) => c.raw)];
    return [head, ...body, tot];
  }, [report, showTotals]);

  const csv = useMemo(
    () => grid.map((row) => row.map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n"),
    [grid],
  );
  const fileName = `${title.replace(/[^a-z0-9]+/gi, "_")}_${periodText.replace(/[^a-z0-9]+/gi, "_")}.csv`;
  const copyCsv = () => navigator.clipboard?.writeText(csv);
  const downloadCsv = () => {
    try {
      const b = new Blob([csv], { type: "text/csv" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      copyCsv();
    }
  };

  const dims = [
    { k: "site", l: "By Site" },
    { k: "month", l: "By Month" },
    { k: "parent", l: "By Parent Head" },
    { k: "child", l: "By Cost Line" },
    { k: "spread", l: "Spread Schedule" },
    { k: "pending", l: "Data Status" },
  ];

  const stdFilterBar = (activePreset === "pnl" || activePreset === "bva" || activePreset === "under" || activePreset === "exp") && (
    <div className="ov-filters">
      <label className="ov-filter">
        <span>Period</span>
        <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={month} onChange={setMonth} />
      </label>
      <label className="ov-filter">
        <span>Sites</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">{showHistorical ? "All site versions" : "All active sites"}</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {versionLabel(s)}{!isSiteActive(s) ? " (inactive)" : ""}</option>)}
        </select>
      </label>
      {activePreset === "under" && (
        <label className="ov-filter">
          <span>Show only</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="belowEst">Below estimate</option>
            <option value="loss">Loss-making</option>
            <option value="none">All reporting</option>
          </select>
        </label>
      )}
    </div>
  );

  const trendFilterBar = activePreset === "trend" && (
    <div className="ov-filters">
      <label className="ov-filter range">
        <span>Range</span>
        <div className="ov-range">
          <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={from} onChange={setFrom} showFormattedHint={false} />
          <span>–</span>
          <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={to} onChange={setTo} showFormattedHint={false} />
        </div>
      </label>
    </div>
  );

  return (
    <>
      <div className="rep-hist-bar">
        <button type="button" className={"hist-scope-btn" + (showHistorical ? " on" : "")} onClick={() => setShowHistorical((v) => !v)}>
          <History size={13} />
          {showHistorical ? "Including historical versions" : "Active sites only (default)"}
        </button>
        {!showHistorical && inactiveSites.length > 0 && (
          <span className="muted-s">{inactiveSites.length} inactive version{inactiveSites.length === 1 ? "" : "s"} excluded from totals</span>
        )}
      </div>
      <div className="sl-view-nav rep-mode-nav">
        <button type="button" className={"sl-view-btn" + (tab === "standard" ? " on" : "")} onClick={() => setTab("standard")}>Standard reports</button>
        <button type="button" className={"sl-view-btn" + (tab === "custom" ? " on" : "")} onClick={() => setTab("custom")}>Custom builder</button>
      </div>

      {tab === "standard" && (
        <>
          <div className="rep-cards">
            {REPORT_PRESETS.map((p) => (
              <button key={p.id} type="button" className={"rep-card" + (activePreset === p.id ? " on" : "")} onClick={() => choose(p)}>
                <div className="rc-name">{p.name}</div>
                <div className="rc-desc">{p.desc}</div>
              </button>
            ))}
          </div>
          {stdFilterBar}
          {trendFilterBar}
      {activePreset === "pending" && (
        <div className="ov-filters">
          <label className="ov-filter">
            <span>Period (as of)</span>
            <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={month} onChange={setMonth} />
          </label>
          <button
            type="button"
            className={"hist-scope-btn" + (expandPendingHistory ? " on" : "")}
            onClick={() => setExpandPendingHistory((v) => !v)}
          >
            <History size={13} />
            {expandPendingHistory ? "Showing all pending history" : "Expand history (before Apr 2026)"}
          </button>
        </div>
      )}
        </>
      )}

      {tab === "custom" && (
        <Card title="Build a report" right={<span className="muted-s">choose what to show — the table updates live</span>}>
          <div className="builder">
            <div className="brow">
              <span className="blab">Break down by</span>
              <div className="chips">
                {dims.map((d) => (
                  <button key={d.k} type="button" className={"mch" + (dim === d.k ? " on" : "")} onClick={() => setDimMode(d.k)}>{d.l}</button>
                ))}
              </div>
            </div>
            {(dim === "site" || dim === "month") && (
              <div className="brow">
                <span className="blab">Columns</span>
                <div className="chips">
                  {FIN_MEASURES.map((m) => (
                    <button key={m.key} type="button" className={"mch" + (measures.includes(m.key) ? " on" : "")} onClick={() => toggleMeasure(m.key)}>{m.label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="ov-filters rep-builder-filters">
              <label className="ov-filter">
                <span>Sites</span>
                <select value={scope} onChange={(e) => { setScope(e.target.value); setActivePreset(null); setTitle("Custom Report"); }}>
                  <option value="all">{showHistorical ? "All site versions" : "All active sites"}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name} · {versionLabel(s)}{!isSiteActive(s) ? " (inactive)" : ""}</option>)}
                </select>
              </label>
              {(dim === "spread" || dim === "pending") ? (
                <label className="ov-filter">
                  <span>As of month</span>
                  <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={month} onChange={setMonth} />
                </label>
              ) : (
                <>
                  <label className="ov-filter">
                    <span>Period</span>
                    {dim !== "month" ? (
                      <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value)}>
                        <option value="single">Single month</option>
                        <option value="range">Month range</option>
                      </select>
                    ) : (
                      <select disabled><option>Month range</option></select>
                    )}
                  </label>
                  {(periodMode === "single" && dim !== "month") ? (
                    <label className="ov-filter">
                      <span>Month</span>
                      <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={month} onChange={setMonth} />
                    </label>
                  ) : (
                    <label className="ov-filter range">
                      <span>Range</span>
                      <div className="ov-range">
                        <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={from} onChange={setFrom} showFormattedHint={false} />
                        <span>–</span>
                        <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={to} onChange={setTo} showFormattedHint={false} />
                      </div>
                    </label>
                  )}
                </>
              )}
              {dim === "site" && (
                <label className="ov-filter">
                  <span>Show only</span>
                  <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="none">All sites</option>
                    <option value="loss">Loss-making</option>
                    <option value="belowEst">Below estimate</option>
                  </select>
                </label>
              )}
            </div>
          </div>
        </Card>
      )}

      <p className="ov-meta">{scopeText} · {periodText}</p>

      <Card
        title={title}
        pad={false}
        right={(
          <span className="muted-s" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="button" className="link" onClick={copyCsv}><Copy size={12} style={{ verticalAlign: "-2px" }} /> Copy</button>
            <button type="button" className="link" onClick={downloadCsv}><Download size={12} style={{ verticalAlign: "-2px" }} /> CSV</button>
          </span>
        )}
      >
        <ReportTable report={report} showTotals={showTotals} dim={dim} />
      </Card>
    </>
  );
}

function ReportTable({ report, showTotals = true, dim }) {
  if (report.kind === "pending") {
    if (report.rows.length === 0) return <div className="chart-empty">No sites to report.</div>;
    return (
      <table className="tbl">
        <thead>
          <tr>{report.cols.map((c, i) => <th key={i} className={i >= 2 && i <= 4 ? "r" : ""}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((r, ri) => (
            <tr key={ri} className={r[4] > 0 ? "row-pending" : ""}>
              <td className="strong">{r[0]}</td>
              <td className="muted-s mono">{r[1]}</td>
              <td className="r mono">{r[2]}</td>
              <td className="r mono" style={{ color: "var(--profit)" }}>{r[3]}</td>
              <td className="r mono" style={{ color: r[4] > 0 ? "var(--warn)" : "var(--muted)", fontWeight: r[4] > 0 ? 700 : 400 }}>{r[4]}</td>
              <td className="muted-s">{r[5]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (report.kind === "spread") {
    if (report.rows.length === 0) return <div className="chart-empty">No spread / deferred costs set up yet.</div>;
    return (
      <table className="tbl">
        <thead>
          <tr>{report.cols.map((c, i) => <th key={i} className={i >= 3 && i <= 6 ? "r" : ""}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, ci) => (
                <td key={ci} className={(ci >= 3 && ci <= 6 ? "r mono" : "") + (ci === 7 ? " " : "")}>
                  {ci === 3 || ci === 6 ? inr(v) : ci === 7 ? <span className={"pill " + (v === "active" ? "pill-ok" : v === "upcoming" ? "pill-watch" : "pill-warn")}>{v}</span> : String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (report.rows.length === 0) return <div className="chart-empty">No data for this selection. Try a different month or scope.</div>;

  const rowLabel = report.kind === "head" ? "Expense head" : dim === "month" ? "Month" : "Site";

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{rowLabel}</th>
          {report.columns.map((c, i) => <th key={i} className="r">{report.kind === "fin" ? c.label.toUpperCase() : c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((r, ri) => (
          <tr key={ri}>
            <td className="strong">
              {r.color && <span className="pdot" style={{ background: r.color }} />}
              {r.label}
            </td>
            {r.cells.map((c, ci) => (
              <td key={ci} className="r mono" style={{ color: c.color || undefined }}>{c.text}</td>
            ))}
          </tr>
        ))}
        {showTotals && (
          <tr className="vtot green">
            <td>{report.totals.label}</td>
            {report.totals.cells.map((c, ci) => (
              <td key={ci} className="r mono" style={{ color: c.color || undefined }}>{c.text}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

/* ───────────────────────── MODALS ───────────────────────── */
function AddSiteModal({ onClose, onSave, existing, editSite = null }) {
  const isEdit = !!editSite;
  const [name, setName] = useState(editSite?.name || "");
  const [wo, setWo] = useState(editSite?.wo || "");
  const [ocNumber, setOcNumber] = useState(editSite?.ocNumber || "");
  const [cStart, setCStart] = useState(() => contractDateInputValue(editSite?.contractStart) || "2025-04-01");
  const [cEnd, setCEnd] = useState(() => contractDateInputValue(editSite?.contractEnd) || "2026-03-31");
  const [renewalMode, setRenewalMode] = useState(false);
  const nameMatches = useMemo(
    () => (isEdit ? [] : existing.filter((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())),
    [existing, name, isEdit],
  );
  const priorActive = useMemo(
    () => nameMatches.find(isSiteActive) || nameMatches[0] || null,
    [nameMatches],
  );
  const isRenewal = renewalMode && nameMatches.length > 0;
  const submit = () => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    if (isEdit) {
      onSave({
        isEdit: true,
        id: editSite.id,
        name: trimmed,
        service: editSite?.service || "",
        wo: wo.trim(),
        ocNumber: ocNumber.trim(),
        contractStart: contractPeriodFromDateInput(cStart),
        contractEnd: contractPeriodFromDateInput(cEnd),
      });
      return;
    }
    let id = slug(trimmed);
    let n = 1;
    while (existing.some((s) => s.id === id)) id = slug(trimmed) + "-" + (++n);
    const base = {
      id,
      name: trimmed,
      service: (priorActive?.service || "").trim(),
      wo: wo.trim(),
      ocNumber: ocNumber.trim() || (priorActive?.ocNumber || "").trim(),
      structure: isRenewal && priorActive?.structure?.length
        ? priorActive.structure.map((g) => ({ parent: g.parent, children: [...g.children] }))
        : structureFromKeys(DEFAULT_KEYS),
      spreads: [],
      estimates: [],
      contractStart: contractPeriodFromDateInput(cStart),
      contractEnd: contractPeriodFromDateInput(cEnd),
      siteGroup: priorActive?.siteGroup || slug(trimmed),
      version: 1,
      status: "active",
      isRenewal: !!isRenewal,
    };
    onSave(base);
  };
  return (
    <Modal onClose={onClose} title={isEdit ? "Edit Site" : isRenewal ? "New Contract / PO Version" : "Add Site"}>
      <label className="m-field"><span>Site / client name *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lalitpur Power Generation" autoFocus /></label>
      {!isEdit && nameMatches.length > 0 && (
        <div className="renewal-banner">
          <History size={15} />
          <div>
            <strong>Existing site found — {nameMatches.length} version{nameMatches.length === 1 ? "" : "s"} on record</strong>
            <p>Create a new contract version with the same site name. Previous version(s) will be marked inactive.</p>
          </div>
          <label className="renewal-check">
            <input type="checkbox" checked={renewalMode} onChange={(e) => setRenewalMode(e.target.checked)} />
            New PO / contract version
          </label>
        </div>
      )}
      <label className="m-field"><span>OC Number (client ref)</span><input value={ocNumber} onChange={(e) => setOcNumber(e.target.value)} placeholder="e.g. IFSPL-MANP-OC-25/26-00001" /></label>
      <label className="m-field"><span>Work order / PO no.</span><input value={wo} onChange={(e) => setWo(e.target.value)} placeholder="e.g. PO-2026-0142" /></label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="m-field" style={{ flex: 1 }}>
          <span>Contract start</span>
          <DateInput
            value={cStart || ""}
            onChange={(v) => setCStart(v || null)}
            className="rounded-[9px] border border-[var(--line)] bg-[var(--paper)]"
          />
        </label>
        <label className="m-field" style={{ flex: 1 }}>
          <span>Contract end</span>
          <DateInput
            value={cEnd || ""}
            onChange={(v) => setCEnd(v || null)}
            className="rounded-[9px] border border-[var(--line)] bg-[var(--paper)]"
          />
        </label>
      </div>
      {!isEdit && isRenewal && priorActive && (
        <p className="m-note">Structure will be copied from {versionLabel(priorActive)}. Adjust rates and heads in Site Setup after creating.</p>
      )}
      <p className="m-note">{isEdit ? "Update site details. Cost structure and estimates are managed in Site Setup." : <>Next, in Site Setup you can arrange parent → child lines (drag &amp; drop) and set the <b>estimate / budget</b>.</>}</p>
      <div className="m-actions"><button className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>{isEdit ? "Save changes" : isRenewal ? "Create new version" : "Add & configure"}</button></div>
    </Modal>
  );
}

function SiteVersionHistoryModal({ siteGroup, sites, records, month, onClose, onOpenSite }) {
  const versions = useMemo(() => sitesInGroup(sites, siteGroup), [sites, siteGroup]);
  const siteName = versions[0]?.name || "Site";
  const clientLabel = versions[0]?.ocNumber || versions[0]?.wo || siteName;
  const mLabel = monthLabelOf(month);
  const active = versions.filter(isSiteActive);
  const historical = versions.filter((s) => !isSiteActive(s));
  const [histOpen, setHistOpen] = useState(historical.length > 0);

  const renderRow = (s, readOnly = false) => {
    const c = calcSite(s, month, records);
    const hasData = !!records[`${s.id}__${month}`];
    const estCount = (s.estimates || []).length;
    return (
      <tr key={s.id} className={!isSiteActive(s) ? "row-inactive" : ""}>
        <td className="strong">{versionLabel(s)}</td>
        <td className="mono">{s.wo || "—"}</td>
        <td className="mono muted-s">{s.contractStart ? `${monthLabelOf(s.contractStart)}–${monthLabelOf(s.contractEnd)}` : "—"}</td>
        <td className="muted-s">{s.ocNumber || clientLabel}</td>
        <td>
          <span className={"pill " + (isSiteActive(s) ? "pill-ok" : "pill-inactive")}>
            <CircleDot size={9} /> {isSiteActive(s) ? "Active" : "Historical"}
          </span>
        </td>
        <td className="r mono" style={{ color: hasData ? (c.profit < 0 ? "var(--loss)" : "var(--ink)") : "var(--muted)" }}>
          {hasData ? inr(c.profit) : "—"}
        </td>
        <td className="r mono muted-s">{estCount || "—"}</td>
        <td className="r">
          {readOnly ? (
            <span className="muted-s">Read-only</span>
          ) : (
            <button type="button" className="link" onClick={() => onOpenSite(s.id)}>View P&L →</button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <Modal onClose={onClose} title={`Contract History · ${siteName}`} wide>
      <p className="m-note">Active contract shown below. Expired or completed contracts are preserved as read-only historical records. You can add a new contract for the same site/client at any time.</p>

      <div className="hist-accordion-group">
        <div className="hist-acc-head open">
          <span className="hist-acc-title">{siteName}</span>
          <span className="hist-acc-sub">Client · {clientLabel}</span>
        </div>
        <div className="hist-acc-body">
          <h4 className="hist-section-label">Active contract</h4>
          {active.length === 0 ? (
            <p className="muted-s">No active contract — create a new version from All Sites.</p>
          ) : (
            <table className="tbl hist-tbl">
              <thead>
                <tr>
                  <th>Version</th><th>PO / W.O.</th><th>Contract</th><th>Client</th><th>Status</th>
                  <th className="r">P&L · {mLabel}</th><th className="r">Estimates</th><th />
                </tr>
              </thead>
              <tbody>{active.map((s) => renderRow(s, false))}</tbody>
            </table>
          )}

          {historical.length > 0 && (
            <>
              <button type="button" className="hist-expand-btn" onClick={() => setHistOpen((v) => !v)}>
                {histOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Historical data ({historical.length} contract{historical.length === 1 ? "" : "s"})
              </button>
              {histOpen && (
                <table className="tbl hist-tbl hist-tbl-arch">
                  <thead>
                    <tr>
                      <th>Version</th><th>PO / W.O.</th><th>Contract</th><th>Client</th><th>Status</th>
                      <th className="r">P&L · {mLabel}</th><th className="r">Estimates</th><th />
                    </tr>
                  </thead>
                  <tbody>{historical.map((s) => renderRow(s, true))}</tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      <div className="m-actions">
        <button className="ghost-d" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, title, wide }) {
  return (<div className="overlay" onClick={onClose}><div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div><div className="modal-body">{children}</div></div></div>);
}

/* ───────────────────────── STYLES ───────────────────────── */
function Styles() {
  return (
    <style>{`
    :root{--paper:#f8fafc;--surface:#ffffff;--ink:#111827;--ink-soft:#4b5563;--muted:#6b7280;--line:#e5e7eb;--accent:#b91c1c;--accent-soft:#fef2f2;--accent-mid:#dc2626;--profit:#15803d;--loss:#b91c1c;--warn:#d97706;--gold:#b45309;--display:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;--body:"Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;--mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Consolas,monospace;}
    *{box-sizing:border-box}
    .app{display:flex;min-height:640px;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:13px;}
    .app.embedded{min-height:520px;background:var(--paper);width:100%;}
    .app.stacked{flex-direction:column;}
    .sl-body{flex:1;min-width:0;width:100%;display:flex;flex-direction:column;}
    .sl-btn{padding:6px 12px;font-size:12px;}
    .topbar-left{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0;}
    .sl-view-nav{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
    .sl-view-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;}
    .sl-view-btn:hover{border-color:#d1d5db;color:var(--ink);background:#f9fafb;}
    .sl-view-btn.on{background:var(--accent-soft);border-color:#fecaca;color:var(--accent);font-weight:600;}
    .sl-view-badge{font-family:var(--mono);font-size:10px;padding:1px 6px;border-radius:10px;background:#f3f4f6;border:1px solid var(--line);color:var(--muted);}
    .sl-view-btn.on .sl-view-badge{background:#fff;border-color:#fecaca;}
    .side{width:220px;flex-shrink:0;background:var(--surface);color:var(--ink-soft);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:16px 12px;position:sticky;top:0;align-self:flex-start;min-height:calc(100vh - 168px);}
    .brand{display:flex;align-items:center;gap:10px;padding:4px 6px 16px;border-bottom:1px solid var(--line);margin-bottom:12px;}
    .brand-mark{width:36px;height:36px;border-radius:8px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:var(--accent);}
    .brand-name{font-weight:700;font-size:15px;color:var(--ink);}
    .brand-sub{font-size:11px;color:var(--muted);}
    .side nav{display:flex;flex-direction:column;gap:2px;flex:1;}
    .side .nav{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:none;border:none;color:var(--ink-soft);font-size:13px;cursor:pointer;text-align:left;width:100%;transition:.15s;border-left:2px solid transparent;}
    .side .nav:hover{background:#f3f4f6;color:var(--ink);}.side .nav.on{background:var(--accent-soft);color:var(--accent);font-weight:600;border-left-color:var(--accent-mid);}
    .side .nav .count{margin-left:auto;background:#f3f4f6;border:1px solid var(--line);border-radius:20px;padding:1px 8px;font-size:11px;font-family:var(--mono);color:var(--muted);}
    .side-foot{margin-top:auto;display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--line);}
    .app .ghost{display:flex;align-items:center;gap:7px;justify-content:center;background:#fff;border:1px solid var(--line);color:var(--ink-soft);padding:8px 10px;border-radius:8px;font-size:12.5px;cursor:pointer;}
    .app .ghost:hover{background:#f9fafb;border-color:#d1d5db;color:var(--ink);}
    .ghost-d{display:inline-flex;align-items:center;gap:7px;background:var(--paper);border:1px solid var(--line);color:var(--ink-soft);padding:8px 13px;border-radius:9px;font-size:13px;cursor:pointer;font-family:var(--body);font-weight:500;}
    .ghost-d:hover{border-color:var(--accent-mid);color:var(--accent);}
    .save{font-size:11px;text-align:center;padding:6px;border-radius:7px;color:var(--muted);}
    .save.saved{color:var(--profit);}.save.local{color:var(--warn);}.save.saving{color:var(--muted);}
    .main{flex:1;min-width:0;display:flex;flex-direction:column;}
    .app:not(.embedded) .main{min-height:calc(100vh - 168px);overflow:hidden;}
    .app.embedded .main{overflow:visible;}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap;}
    .topbar-right{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;}
    .topbar h1{font-family:var(--display);font-size:23px;font-weight:700;margin:0;letter-spacing:-.02em;}
    .topbar p{margin:2px 0 0;color:var(--muted);font-size:12.5px;}
    .month-pick{display:flex;flex-direction:column;gap:3px;}
    .month-pick label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;}
    .month-pick select,.entry-sel select,.sf select,.sf input,.add-head select,.add-head input,.spread-form select,.spread-form input,.m-field select{font-family:var(--body);font-size:14px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:500;cursor:pointer;}
    .month-pick select,.entry-sel select{font-weight:600;}
    .scroll{padding:20px 24px 40px;flex:1;}
    .app:not(.embedded) .scroll{overflow-y:auto;min-height:0;}
    .app.embedded .scroll{overflow:visible;}
    .ov-filters-modern{background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);border-color:#e2e8f0;box-shadow:0 1px 2px rgba(15,23,42,.04);}
    .ov-hero{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;padding:16px 18px;background:#fff;border:1px solid var(--line);border-radius:14px;}
    .ov-hero-title{margin:0;font-size:18px;font-weight:700;letter-spacing:-.02em;}
    .ov-hero-sub{margin:4px 0 0;font-size:13px;color:var(--muted);}
    .ov-margin-legend{display:flex;gap:8px;flex-wrap:wrap;}
    .ov-margin-chip{font-size:11px;font-weight:600;padding:5px 10px;border-radius:999px;border:1px solid var(--line);}
    .ov-margin-chip.target{background:#ecfdf5;color:#166534;border-color:#bbf7d0;}
    .ov-margin-chip.warn{background:#fffbeb;color:#92400e;border-color:#fde68a;}
    .pl-date-input,.sl-period-sel,.ov-period-sel{font-family:var(--body);font-size:14px;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:500;}
    .period-date-select .period-month-select{display:flex;gap:6px;flex-wrap:wrap;}
    .pl-date-hint{display:block;font-size:11px;color:var(--muted);margin-top:3px;}
    .period-date-select{display:flex;flex-direction:column;gap:2px;}
    .pl-audit-panel{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;margin-bottom:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:12.5px;color:var(--ink-soft);}
    .pl-audit-empty{gap:8px;color:var(--muted);}
    .pl-audit-title{font-weight:700;color:var(--ink);font-size:12px;text-transform:uppercase;letter-spacing:.06em;}
    .pl-audit-rows{display:flex;flex-wrap:wrap;gap:14px;}
    .pl-audit-row{display:flex;align-items:center;gap:6px;}
    .entry-audit{margin-top:0;margin-bottom:14px;}
    .pmanage-locked{display:flex;align-items:center;gap:12px;margin:16px 0 10px;flex-wrap:wrap;}
    .tbl-compact td,.tbl-compact th{padding-top:8px;padding-bottom:8px;}
    .hist-accordion-group{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:8px;}
    .hist-acc-head{padding:12px 14px;background:#f8fafc;border-bottom:1px solid var(--line);}
    .hist-acc-title{display:block;font-weight:700;font-size:14px;}
    .hist-acc-sub{font-size:12px;color:var(--muted);}
    .hist-acc-body{padding:14px;}
    .hist-section-label{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}
    .hist-expand-btn{display:inline-flex;align-items:center;gap:6px;margin:14px 0 8px;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;font-size:12.5px;cursor:pointer;}
    .hist-tbl-arch{opacity:.92;}
    .sm-ac-wrap{min-width:240px;flex:1;}
    .ov-filter-ac{min-width:240px;flex:1;max-width:320px;}
    .ov-filter-ac .entry-sel{margin:0;}
    .ov-filter-ac .site-search{min-width:0;max-width:none;width:100%;}
    .ov-filters{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;padding:14px 16px;margin-bottom:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;}
    .ov-filter{display:flex;flex-direction:column;gap:4px;min-width:0;}
    .ov-filter>span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .ov-filter select,.ov-filter input{font-family:var(--body);font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);}
    .ov-filter.search{flex:1;min-width:160px;max-width:240px;position:relative;}
    .ov-filter.search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;}
    .ov-filter.search input{width:100%;padding-left:30px;}
    .ov-filter.range .ov-range{display:flex;align-items:center;gap:6px;}
    .ov-filter.range input{width:72px;}
    .ov-filter.range span{color:var(--muted);font-size:12px;}
    .ov-clear{align-self:flex-end;font-size:12px;padding:7px 12px;}
    .ov-meta{margin:-4px 0 14px;font-size:12px;color:var(--muted);}
    .ov-empty-hint{display:flex;align-items:center;gap:10px;padding:12px 14px;margin-bottom:16px;background:rgba(169,132,43,.08);border:1px solid rgba(169,132,43,.2);border-radius:10px;font-size:13px;color:var(--ink-soft);}
    .chart-empty{padding:48px 16px;text-align:center;color:var(--muted);font-size:13px;}
    .kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:18px;}
    .kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px 17px;}
    .kpi-top{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
    .kpi-label{font-size:11.5px;color:var(--ink-soft);font-weight:500;}
    .kpi-value{font-family:var(--display);font-size:25px;font-weight:700;letter-spacing:-.02em;line-height:1;}
    .kpi-sub{display:flex;align-items:center;gap:4px;margin-top:7px;font-size:11.5px;color:var(--muted);font-family:var(--mono);}
    .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;margin-bottom:18px;overflow:hidden;}
    .card-head{display:flex;align-items:center;justify-content:space-between;padding:15px 18px 12px;}
    .card-head h3{font-family:var(--display);font-size:15.5px;font-weight:700;margin:0;letter-spacing:-.01em;}
    .muted-s{font-size:11.5px;color:var(--muted);}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}@media(max-width:1080px){.grid-2{grid-template-columns:1fr;}}
    .stack{display:flex;flex-direction:column;}
    .donut-wrap{display:flex;align-items:center;gap:14px;}.donut-wrap>div:first-child{flex:0 0 46%;}
    .legend{flex:1;display:flex;flex-direction:column;gap:7px;}
    .legend-row{display:flex;align-items:center;gap:8px;font-size:12.5px;}
    .legend-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
    .legend-name{flex:1;color:var(--ink-soft);}.legend-val{font-family:var(--mono);font-weight:600;font-size:12px;}.legend-pct{font-family:var(--mono);color:var(--muted);width:46px;text-align:right;font-size:11.5px;}
    .trend-legend{display:flex;gap:18px;justify-content:center;padding:4px 0 2px;font-size:12px;color:var(--ink-soft);}
    .trend-legend span{display:flex;align-items:center;gap:6px;}.trend-legend i{width:14px;height:3px;border-radius:2px;display:inline-block;}
    .tip{background:var(--ink);color:#fff;padding:9px 11px;border-radius:9px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.2);}
    .tip-title{font-weight:700;margin-bottom:5px;font-family:var(--display);}
    .tip-row{display:flex;align-items:center;gap:7px;padding:1px 0;}.tip-dot{width:8px;height:8px;border-radius:2px;}.tip-row strong{margin-left:auto;font-family:var(--mono);}
    .tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .tbl th{text-align:left;padding:9px 12px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--line);font-weight:600;white-space:nowrap;}
    .tbl th.r,.tbl td.r{text-align:right;}.tbl th.click{cursor:pointer;user-select:none;}.tbl th.click:hover{color:var(--ink);}
    .tbl td{padding:11px 12px;border-bottom:1px solid var(--line);}.tbl tr:last-child td{border-bottom:none;}
    .tbl tbody tr:hover td{background:#f9fafb;}
    .tbl tbody tr.row-inactive td{background:#f3f4f6;color:#9ca3af;}
    .tbl tbody tr.row-inactive td.strong,.tbl tbody tr.row-inactive .ver-pill{color:#6b7280;}
    .tbl tbody tr.row-inactive:hover td{background:#eceff3;}
    .ver-pill{display:inline-block;margin-left:8px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:#f3f4f6;border:1px solid var(--line);color:var(--muted);font-family:var(--mono);vertical-align:middle;}
    .ver-pill.inactive,.ver-pill.inactive{background:#e5e7eb;color:#6b7280;}
    .ver-pill.inline{margin-left:10px;font-size:11px;}
    .hist-scope-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:#fff;color:var(--ink-soft);font-size:12px;font-weight:500;cursor:pointer;font-family:var(--body);white-space:nowrap;}
    .hist-scope-btn.sm{padding:6px 10px;font-size:11.5px;}
    .hist-scope-btn.on{background:var(--accent-soft);border-color:#fecaca;color:var(--accent);font-weight:600;}
    .hist-scope-btn:hover{border-color:#d1d5db;color:var(--ink);}
    .hist-hint{color:var(--muted);}
    .hist-banner{display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:12px;color:var(--ink-soft);}
    .hist-banner strong{display:block;color:var(--ink);font-size:13px;margin-bottom:2px;}
    .hist-banner p{margin:0;font-size:12px;color:var(--muted);}
    .hist-banner .ghost-d.sm{padding:6px 12px;font-size:12px;margin-left:auto;flex-shrink:0;}
    .renewal-banner{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:12px;background:rgba(31,111,78,.08);border:1px solid rgba(31,111,78,.2);border-radius:10px;font-size:12.5px;color:var(--ink-soft);}
    .renewal-banner strong{display:block;color:var(--ink);font-size:13px;}
    .renewal-banner p{margin:4px 0 0;font-size:12px;color:var(--muted);}
    .renewal-check{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap;}
    .sites-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .rep-hist-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
    .pill-inactive{background:#e5e7eb;color:#6b7280;}
    .hist-tbl{margin-top:8px;}
    .hist-link{margin-right:10px;}
    .strong{font-weight:600;}.click{cursor:pointer;}td.click:hover{color:var(--accent);}
    .mono{font-family:var(--mono);font-size:12.5px;font-variant-numeric:tabular-nums;}.nowrap{white-space:nowrap;}
    .link{background:none;border:none;color:var(--accent);font-weight:600;cursor:pointer;font-family:var(--body);font-size:inherit;padding:0;}
    .icon-btn{background:none;border:1px solid var(--line);border-radius:7px;padding:5px;cursor:pointer;color:var(--ink-soft);margin-left:4px;}
    .icon-btn:hover{background:var(--paper);color:var(--ink);}.icon-btn.danger:hover{color:var(--loss);border-color:var(--loss);}
    .all-clear{display:flex;align-items:center;gap:9px;color:var(--profit);font-size:13px;padding:6px 0;}
    .pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;}
    .pill-ok{background:rgba(22,119,78,.12);color:var(--profit);}.pill-watch{background:rgba(169,132,43,.14);color:var(--gold);}.pill-warn{background:rgba(194,130,15,.15);color:var(--warn);}.pill-loss{background:rgba(178,63,42,.13);color:var(--loss);}
    .search{display:flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:9px;padding:6px 11px;color:var(--muted);background:var(--paper);}
    .search input{border:none;background:none;outline:none;font-family:var(--body);font-size:13px;width:160px;color:var(--ink);}
    /* variance table (site detail · Income – Expenditure) */
    .site-ie-card .vtbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-top:1px solid var(--line);}
    .site-ie-card .vtbl{table-layout:fixed;width:100%;min-width:640px;border-collapse:separate;border-spacing:0;}
    .site-ie-card .vtbl col.vtbl-col-part{width:36%;}
    .site-ie-card .vtbl col.vtbl-col-num{width:16%;}
    .site-ie-card .vtbl thead th{background:#f8fafc;font-size:12px;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:600;padding:10px 12px;border-bottom:2px solid var(--line);white-space:nowrap;}
    .site-ie-card .vtbl thead th:first-child{padding-left:14px;text-align:left;}
    .site-ie-card .vtbl th.r,.site-ie-card .vtbl td.r{text-align:right;}
    .site-ie-card .vtbl tbody td{padding:9px 12px;vertical-align:middle;border-bottom:1px solid #f0f1f3;}
    .site-ie-card .vtbl .vtbl-part{padding-left:14px;padding-right:12px;color:var(--ink-soft);font-size:13px;line-height:1.45;word-break:normal;overflow-wrap:break-word;}
    .site-ie-card .vtbl-num{white-space:nowrap;font-size:13px;padding-right:14px!important;}
    .site-ie-card .vtbl tr.vsec td{background:#f3f4f6;font-size:12px;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:600;padding:8px 14px;border-bottom:1px solid var(--line);}
    .site-ie-card .vhint{text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted);font-size:11px;}
    .site-ie-card .vtbl tr.vparent{cursor:pointer;}
    .site-ie-card .vtbl tr.vparent td.vtbl-part{color:var(--ink);}
    .site-ie-card .vtbl tr.vparent:hover td,.site-ie-card .vtbl tbody tr:not(.vsec):not(.vtot):hover td{background:#fafbfc;}
    .site-ie-card .vparent-label{display:grid;grid-template-columns:auto auto 1fr auto;grid-template-rows:auto auto;gap:2px 6px;align-items:start;min-width:0;width:100%;}
    .site-ie-card .vparent-name{grid-column:3;grid-row:1;font-weight:600;line-height:1.4;font-size:13px;min-width:0;word-break:normal;overflow-wrap:break-word;}
    .site-ie-card .pcount{grid-column:4;grid-row:1;justify-self:end;font-family:var(--mono);font-size:9.5px;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:20px;padding:0 5px;line-height:1.5;}
    .site-ie-card .vparent-label .amort-tag{grid-column:3 / -1;grid-row:2;}
    .site-ie-card .pchev{display:inline-flex;flex-shrink:0;color:var(--muted);margin-top:2px;grid-column:1;grid-row:1;}
    .site-ie-card .pdot{width:8px;height:8px;border-radius:3px;display:inline-block;flex-shrink:0;margin-top:5px;grid-column:2;grid-row:1;}
    .site-ie-card .vchild-name{flex:1;min-width:0;line-height:1.45;font-size:13px;color:var(--ink);word-break:normal;overflow-wrap:break-word;}
    .site-ie-card .vtbl tr.vchild td{background:#fafbfc;}
    .site-ie-card .vtbl tr.vchild td.vtbl-part{color:var(--ink);}
    .site-ie-card .cbranch{display:inline-block;flex-shrink:0;width:8px;border-left:2px solid var(--line);border-bottom:2px solid var(--line);height:8px;margin-top:4px;}
    .site-ie-card .vtbl tr.vtot td{font-weight:700;border-bottom:1px solid var(--line);}
    .site-ie-card .vtbl tr.vtot td.vtbl-part{color:var(--ink);font-size:12.5px;}
    .site-ie-card .vtbl tr.vtot.green td{background:#f3f4f6;}
    .site-ie-card .vtbl tr.vtot.profit td{background:rgba(22,119,78,.1);color:var(--profit);}
    .site-ie-card .vtbl tr.vtot.loss td{background:rgba(178,63,42,.09);color:var(--loss);}
    .site-ie-card .vtbl tr.vmargin td{font-weight:600;border-top:2px solid var(--line);border-bottom:none;background:#fff;}
    .site-ie-card .amort-tag{display:inline-flex;align-items:center;flex-shrink:1;max-width:100%;margin-top:2px;font-style:normal;font-size:9.5px;color:var(--gold);background:rgba(169,132,43,.1);padding:1px 5px;border-radius:4px;font-family:var(--mono);white-space:normal;line-height:1.3;word-break:break-word;}
    .site-ie-card .vtbl-part-child{display:flex;align-items:flex-start;gap:8px;padding-left:28px!important;min-width:12rem;}
    /* site detail view */
    .site-detail{display:flex;flex-direction:column;gap:0;}
    .site-detail .back{align-self:flex-start;margin-bottom:12px;}
    .site-detail .site-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--line);}
    .site-detail .site-head-info{flex:1;min-width:min(100%,280px);}
    .site-detail .site-head h2{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;font-family:var(--display);font-size:26px;font-weight:700;margin:0;letter-spacing:-.02em;line-height:1.25;}
    .site-detail .site-head-name{word-break:break-word;}
    .site-detail .site-head-meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:10px;font-size:13px;color:var(--muted);line-height:1.45;}
    .site-detail .site-head-meta b{color:var(--ink);font-weight:600;}
    .site-detail .site-head-right{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;flex-shrink:0;}
    .site-detail-kpis{margin-bottom:18px;}
    .site-detail .site-ie-card{margin-bottom:18px;}
    .site-detail .site-ie-card .card-head{display:flex;align-items:center;justify-content:space-between;}
    .site-ie-card-tools{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px 14px;margin-left:auto;}
    .site-ie-budget{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);white-space:nowrap;}
    .site-detail-charts{align-items:start;}
    .back{background:none;border:none;color:var(--accent);display:flex;align-items:center;gap:4px;cursor:pointer;font-family:var(--body);font-size:13px;font-weight:600;margin-bottom:14px;padding:0;}
    .site-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px;}
    .site-head h2{font-family:var(--display);font-size:26px;font-weight:700;margin:0;letter-spacing:-.02em;}
    .site-head p{margin:4px 0 0;color:var(--muted);font-size:13px;}
    .site-head-right{display:flex;align-items:center;gap:10px;}
    .primary{display:inline-flex;align-items:center;gap:7px;background:var(--accent-mid);color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;}
    .primary:hover{background:var(--accent);}.primary.sm{padding:8px 13px;}
    .entry{display:flex;flex-direction:column;gap:16px;}
    .entry>.entry-bar,.entry>.pend-strip,.entry>.amort-note,.entry>.card,.entry>.grid-2{margin-bottom:0;}
    .entry .entry-bar{
      display:grid;
      grid-template-columns:minmax(280px,1.4fr) auto minmax(220px,1fr) auto;
      grid-template-areas:"primary tools live save";
      align-items:end;
      gap:12px 16px;
      padding:16px 18px;
      background:var(--surface);
      border:1px solid var(--line);
      border-radius:14px;
      margin-bottom:0;
    }
    .entry .entry-bar-primary{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 16px;grid-area:primary;min-width:0;}
    .entry .entry-bar-primary .site-search{flex:1 1 240px;max-width:360px;min-width:200px;}
    .entry .entry-bar-primary .entry-sel-period{flex:0 1 200px;min-width:170px;}
    .entry .entry-bar-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;grid-area:tools;}
    .entry .entry-bar-tools .ghost-d{height:38px;white-space:nowrap;}
    .entry .entry-live{
      grid-area:live;
      margin-left:0;
      display:flex;
      align-items:center;
      justify-content:flex-end;
      flex-wrap:wrap;
      gap:8px 18px;
      padding:8px 12px;
      background:var(--paper);
      border:1px solid var(--line);
      border-radius:9px;
      min-height:38px;
      box-sizing:border-box;
    }
    .entry .entry-bar-save{
      grid-area:save;
      display:flex;
      flex-direction:column;
      align-items:flex-end;
      gap:4px;
      justify-self:end;
    }
    .entry .entry-bar-save-row{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;}
    .entry .entry-bar-save .entry-save-btn{height:38px;min-width:132px;flex-shrink:0;}
    .entry .entry-bar-save .entry-period-st{
      font-size:11px;
      font-weight:600;
      white-space:nowrap;
      line-height:1;
      padding:7px 11px;
      border-radius:20px;
      border:1px solid var(--line);
      background:var(--paper);
      color:var(--muted);
    }
    .entry .entry-bar-save .entry-unsaved{align-self:center;}
    @media(max-width:1100px){
      .entry .entry-bar{grid-template-columns:1fr 1fr;grid-template-areas:"primary primary" "tools tools" "live live" "save save";}
      .entry .entry-bar-save{align-items:stretch;}
      .entry .entry-bar-save-row{justify-content:flex-end;}
      .entry .entry-bar-save .entry-save-btn{width:auto;}
      .entry .entry-live{justify-content:flex-start;}
    }
    .entry .entry-cols{align-items:stretch;gap:16px;}
    .entry .entry-col{min-width:0;}
    .entry .entry-col>.card{height:100%;margin-bottom:0;display:flex;flex-direction:column;}
    .entry .entry-col>.card>div:last-child{flex:1;}
    .entry .entry-totals{height:100%;box-sizing:border-box;}
    .entry .entry-totals-tbl td:last-child{text-align:right;white-space:nowrap;}
    .entry .entry-totals-tbl td:first-child{padding-right:12px;}
    .entry .fields{align-items:end;gap:10px 14px;}
    .entry .field{min-height:58px;justify-content:flex-end;}
    .entry .field>span{line-height:1.35;min-height:2.7em;display:flex;align-items:flex-end;}
    .entry .field-in{min-height:38px;box-sizing:border-box;}
    .entry .field-in input{min-height:36px;box-sizing:border-box;}
    .entry .deduction-block{width:100%;gap:10px;}
    .entry .deduction-remark>span{font-size:12px;color:var(--ink-soft);display:block;margin-bottom:4px;line-height:1.35;}
    .entry .rev-entry-simple{gap:14px;padding:2px 0;}
    .entry .rev-reimb-panel{padding:12px 14px;}
    .entry .rev-reimb-top{align-items:flex-start;margin-bottom:10px;}
    .entry .rev-reimb-title{line-height:38px;}
    .entry .rev-reimb-line{
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:nowrap;
    }
    .entry .rev-reimb-tag{
      width:132px;
      flex-shrink:0;
      line-height:1.3;
    }
    .entry .rev-reimb-other{
      flex:1;
      min-width:120px;
      box-sizing:border-box;
      height:38px;
    }
    .entry .rev-reimb-amt{
      width:132px;
      flex-shrink:0;
      margin-left:auto;
    }
    .entry .rev-reimb-line:has(.rev-reimb-other) .rev-reimb-amt{margin-left:0;}
    .entry .rev-reimb-del{flex-shrink:0;}
    .entry .rev-reimb-actions{align-items:center;}
    .entry .rev-reimb-pick{min-width:140px;height:34px;}
    .entry .rev-reimb-save,.entry .rev-reimb-cancel{height:34px;display:inline-flex;align-items:center;}
    .entry .fgroup{margin-bottom:16px;}
    .entry .fgroup:last-child{margin-bottom:0;}
    .entry .fgroup-h{align-items:center;min-height:28px;margin-bottom:10px;}
    .entry .pend-strip{margin-bottom:0;}
    .entry .amort-note{margin-bottom:0;}
    .entry-bar{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:18px;}
    .entry-sel{display:flex;flex-direction:column;gap:4px;min-width:200px;}
    .entry-sel label{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .site-search{position:relative;min-width:220px;max-width:320px;}
    .site-search-box{position:relative;}
    .site-search-box input{width:100%;font-family:var(--body);font-size:14px;font-weight:600;padding:8px 12px 8px 32px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);}
    .site-search-ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none;}
    .site-search-menu{position:absolute;z-index:40;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.12);}
    .site-search-opt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;padding:9px 12px;border:none;background:transparent;cursor:pointer;font-family:var(--body);}
    .site-search-opt:hover,.site-search-opt.on{background:var(--accent-soft);}
    .site-search-opt-name{font-size:13px;font-weight:600;color:var(--ink);}
    .site-search-opt-meta{font-size:11px;color:var(--muted);}
    .site-search-empty{padding:12px;font-size:12px;color:var(--muted);}
    .entry-save-btn{min-width:120px;}
    .entry-unsaved{font-size:11px;color:var(--warn);font-weight:600;align-self:center;}
    .deduction-block{display:flex;flex-direction:column;gap:8px;}
    .deduction-remark input{width:100%;font-family:var(--body);font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);}
    .entry-live{margin-left:auto;display:flex;gap:16px;font-size:12.5px;color:var(--ink-soft);font-family:var(--mono);}.entry-live b{font-weight:600;}
    .entry-cols{align-items:start;}
    .entry-col{display:flex;flex-direction:column;gap:12px;}
    .entry-totals{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:12px 14px;}
    .entry-totals-h{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
    .ect-draft{font-size:10px;text-transform:none;letter-spacing:0;color:var(--warn);background:rgba(194,130,15,.12);padding:2px 7px;border-radius:20px;font-weight:600;}
    .entry-totals-tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .entry-totals-tbl td{padding:5px 4px;border-bottom:1px solid var(--line);color:var(--ink-soft);vertical-align:middle;}
    .entry-totals-tbl td.ect-label{display:flex;align-items:center;gap:7px;}
    .entry-totals-tbl tr:last-child td{border-bottom:none;}
    .entry-totals-tbl tr.ect-grand td{font-weight:700;color:var(--ink);border-top:2px solid var(--line);padding-top:8px;}
    .entry-totals-tbl tr.ect-grand td:last-child{color:var(--loss);}
    .rev-totals .entry-totals-tbl tr.ect-grand td:last-child{color:var(--profit);}
    .cfg-hint{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:12.5px;flex:1;}
    .amort-note{display:flex;align-items:center;gap:9px;background:rgba(169,132,43,.1);border:1px solid rgba(169,132,43,.25);color:var(--gold);padding:11px 15px;border-radius:11px;margin-bottom:16px;font-size:13px;}.amort-note b{color:var(--ink);}
    .fgroup{margin-bottom:14px;}.fgroup-h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:9px;display:flex;align-items:center;gap:7px;}
    .pminihead{font-size:11.5px;font-weight:700;margin:6px 0 8px;display:flex;align-items:center;gap:7px;}
    .fields{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px;}@media(max-width:560px){.fields{grid-template-columns:1fr;}}
    .field{display:flex;flex-direction:column;gap:4px;}.field>span{font-size:12px;color:var(--ink-soft);}
    .field-in{display:flex;align-items:center;border:1px solid var(--line);border-radius:8px;background:var(--paper);overflow:hidden;}
    .field-in:focus-within{border-color:var(--accent-mid);}.field-in i{padding:0 8px;color:var(--muted);font-style:normal;font-family:var(--mono);font-size:13px;}
    .field-in input{border:none;background:none;outline:none;padding:8px 10px 8px 0;width:100%;font-family:var(--mono);font-size:13px;text-align:right;color:var(--ink);}
    .field-reimb{grid-column:1/-1;}
    .reimb-row{display:flex;align-items:stretch;gap:10px;width:100%;}
    .reimb-sel{flex:1;min-width:0;font-family:var(--body);font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);cursor:pointer;}
    .reimb-sel:focus{outline:none;border-color:var(--accent-mid);}
    .reimb-amt{flex:0 0 148px;}
    .rev-entry-simple{display:flex;flex-direction:column;gap:12px;padding:4px 2px 2px;}
    .rev-entry-simple>.field{margin:0;}
    .rev-reimb-panel{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:#fafbfc;}
    .rev-reimb-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap;}
    .rev-reimb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-left:auto;}
    .rev-reimb-cancel{font-size:12px;padding:5px 10px;}
    .rev-reimb-save{white-space:nowrap;}
    .rev-reimb-title{font-size:12px;font-weight:600;color:var(--ink-soft);}
    .rev-reimb-pick{font-family:var(--body);font-size:12px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);cursor:pointer;max-width:160px;}
    .rev-reimb-hint{margin:0;font-size:12px;color:var(--muted);}
    .rev-reimb-lines{display:flex;flex-direction:column;gap:8px;}
    .rev-reimb-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
    .rev-reimb-tag{font-size:12px;font-weight:600;color:var(--ink);min-width:88px;flex-shrink:0;}
    .rev-reimb-other{flex:1;min-width:120px;font-family:var(--body);font-size:13px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;}
    .rev-reimb-amt{flex:0 0 120px;min-width:100px;}
    .rev-reimb-del{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:7px;background:transparent;color:var(--muted);cursor:pointer;flex-shrink:0;}
    .rev-reimb-del:hover{background:#fee2e2;color:var(--loss);}
    .period-month-select{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
    .sl-period-sel,.sf-sel,.ov-period-sel,.m-field-sel{font-family:var(--body);font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font-weight:500;cursor:pointer;}
    .entry-sel-period{display:flex;flex-direction:column;gap:4px;}
    .entry-period-st{font-size:11px;color:var(--muted);font-weight:600;}
    .entry-totals-row{margin-bottom:14px;}
    /* config builder */
    .tray{display:flex;flex-wrap:wrap;gap:7px;min-height:54px;padding:10px;border:1px dashed var(--line);border-radius:11px;background:var(--paper);}
    .parents-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px;}
    @media(max-width:1080px){.parents-grid{grid-template-columns:repeat(2,1fr);}}@media(max-width:680px){.parents-grid{grid-template-columns:1fr;}}
    .pgroup{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:12px;min-height:120px;}
    .pgroup-h{display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 4px 10px;border-bottom:2px solid;margin:-2px -2px 10px;}
    .pgroup-h .pname{cursor:text;}
    .pgroup-h .pname-edit{opacity:0;transition:.12s;}
    .pgroup-h:hover .pname-edit{opacity:1;}
    .pgroup-h .pcount{margin-left:auto;}
    .pdot-btn{background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;}
    .pmanage{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:12px 16px;margin:0 0 16px;}
    .pmanage input{flex:1;min-width:200px;font-family:var(--body);font-size:13.5px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);outline:none;}
    .pmanage input:focus{border-color:var(--accent-mid);}
    .swatches{display:flex;gap:5px;flex-wrap:wrap;}
    .swatches.inhdr{padding:0 0 10px;}
    .sw{width:18px;height:18px;border-radius:5px;border:2px solid transparent;cursor:pointer;padding:0;}
    .sw.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--surface) inset;}
    .primary.sm:disabled{opacity:.4;cursor:not-allowed;}
    .pedit{flex:1;min-width:0;font-weight:700;font-size:13px;border:1px solid var(--accent-mid);border-radius:6px;padding:3px 7px;outline:none;background:var(--surface);color:var(--ink);}
    .pgroup-h b{flex:1;}
    .pchildren{display:flex;flex-direction:column;gap:6px;min-height:40px;}
    .dnd-chip{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:12.5px;cursor:grab;}
    .tray .dnd-chip{background:var(--surface);}
    .dnd-chip:active{cursor:grabbing;}.dnd-chip.on{border-color:rgba(31,111,78,.25);}
    .dnd-chip .grip{color:var(--muted);flex-shrink:0;}
    .dnd-chip span:not(.cat-dot){flex:1;color:var(--ink);}
    .cat-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0;}
    .chip-act{background:none;border:none;cursor:pointer;color:var(--muted);padding:2px;display:flex;border-radius:6px;flex-shrink:0;}
    .chip-act:hover{color:var(--accent);background:var(--paper);}.chip-act.danger:hover{color:var(--loss);}
    .chip-edit{flex:1;min-width:60px;font-size:12.5px;border:1px solid var(--accent-mid);border-radius:6px;padding:2px 6px;outline:none;background:var(--surface);color:var(--ink);font-family:var(--body);}
    .dnd-empty{color:var(--muted);font-size:12.5px;text-align:center;padding:14px 10px;}.dnd-empty.sm{padding:8px;font-size:12px;}
    .add-head{display:flex;gap:8px;margin-top:12px;}.add-head input{flex:1;}
    .spread-form{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;}
    .sf{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px;}.sf.sm{flex:0 0 90px;min-width:90px;}
    .sf span{font-size:11px;color:var(--ink-soft);font-weight:500;}
    .spread-list{display:flex;flex-direction:column;gap:8px;}
    .spread-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;color:var(--muted);}
    .spread-item.on{border-color:rgba(169,132,43,.4);background:rgba(169,132,43,.07);color:var(--ink);}
    .spread-item svg{color:var(--gold);flex-shrink:0;}
    .spread-name{font-weight:600;font-size:13px;color:var(--ink);}.spread-meta{font-size:11.5px;color:var(--muted);font-family:var(--mono);}
    .spread-item>div{flex:1;}.spread-state{font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600;}
    .spread-active-yes{font-size:12px;font-weight:600;color:var(--profit);text-transform:lowercase;}
    .spread-active-no{font-size:12px;color:var(--muted);text-transform:lowercase;}
    .spread-row-editing td{background:rgba(31,111,78,.06);}
    .m-note.warn{color:var(--gold);}
    .warn-s{color:var(--gold);}
    .contract-row{display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;}
    .contract-note{flex:1;min-width:200px;font-size:12px;color:var(--muted);}
    .est-editor{border-top:1px solid var(--line);padding-top:14px;margin-top:4px;}
    .est-bar{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;}
    .rep-mode-nav{margin-bottom:16px;}
    .rep-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:16px;}
    .rep-card{text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:15px 16px;cursor:pointer;transition:.14s;font-family:var(--body);}
    .rep-card:hover{border-color:var(--accent-mid);transform:translateY(-1px);}
    .rep-card.on{border-color:var(--accent-mid);box-shadow:0 0 0 2px rgba(220,38,38,.12);background:var(--accent-soft);}
    .rc-name{font-family:var(--display);font-weight:700;font-size:14.5px;margin-bottom:5px;color:var(--ink);}
    .rc-desc{font-size:12px;color:var(--muted);line-height:1.45;}
    .builder{display:flex;flex-direction:column;gap:14px;}
    .brow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .blab{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700;}
    .builder select{font-family:var(--body);font-size:13px;padding:7px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-weight:500;}
    .chips{display:flex;flex-wrap:wrap;gap:6px;}
    .mch{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;color:var(--ink-soft);font-family:var(--body);}
    .mch:hover{border-color:#d1d5db;color:var(--ink);}
    .mch.on{background:var(--accent-soft);border-color:var(--accent-mid);color:var(--accent);font-weight:600;}
    .rep-builder-filters{margin-bottom:0;background:transparent;border:none;padding:0;}
    .ov-filter.range select{min-width:100px;}
    .row-pending td{background:rgba(194,130,15,.06)!important;box-shadow:inset 3px 0 0 var(--warn);}
    .pill-pending{background:rgba(194,130,15,.16);color:var(--warn);}
    .pend-inline{display:inline-flex;align-items:center;gap:5px;color:var(--warn);font-weight:500;}
    .icon-btn.accent{border-color:var(--warn);color:var(--warn);}
    .pend-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;}
    .pend-item{display:flex;align-items:center;gap:9px;text-align:left;background:rgba(194,130,15,.07);border:1px solid rgba(194,130,15,.25);border-radius:10px;padding:9px 12px;cursor:pointer;font-family:var(--body);transition:.12s;}
    .pend-item:hover{background:rgba(194,130,15,.13);}
    .pend-dot{width:8px;height:8px;border-radius:50%;background:var(--warn);flex-shrink:0;}
    .pend-name{flex:1;font-size:13px;font-weight:600;color:var(--ink);}
    .pend-badge{font-size:10.5px;font-family:var(--mono);color:var(--warn);background:rgba(194,130,15,.15);padding:1px 7px;border-radius:20px;}
    .pend-cta{font-size:12px;color:var(--accent);font-weight:600;}
    .pend-strip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(194,130,15,.08);border:1px solid rgba(194,130,15,.25);border-radius:11px;padding:10px 14px;margin-bottom:16px;}
    .pend-strip-lbl{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--warn);}
    .pend-chip{background:var(--surface);border:1px solid rgba(194,130,15,.4);color:var(--warn);border-radius:7px;padding:4px 11px;font-size:12px;font-family:var(--mono);cursor:pointer;}
    .pend-chip:hover,.pend-chip.on{background:var(--warn);color:#fff;}
    .empty{text-align:center;padding:60px 20px;color:var(--muted);}
    .empty svg{color:var(--line);margin-bottom:14px;}.empty h3{font-family:var(--display);color:var(--ink);margin:0 0 6px;font-size:18px;}.empty p{margin:0;font-size:13.5px;}
    .overlay{position:fixed;inset:0;background:rgba(20,30,25,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;}
    .modal{background:var(--surface);border-radius:16px;width:440px;max-width:100%;max-height:88vh;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);}.modal.wide{width:560px;}
    .modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 12px;border-bottom:1px solid var(--line);}
    .modal-head h3{font-family:var(--display);font-size:18px;margin:0;font-weight:700;}
    .modal-body{padding:18px 20px 20px;}
    .m-field{display:flex;flex-direction:column;gap:5px;margin-bottom:13px;}.m-field span{font-size:12px;color:var(--ink-soft);font-weight:500;}
    .m-field input{border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-family:var(--body);font-size:14px;outline:none;background:var(--paper);color:var(--ink);}.m-field input:focus{border-color:var(--green);}
    .m-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;}
    .m-note{font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.5;}
    .m-divider{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin:18px 0 10px;border-top:1px solid var(--line);padding-top:14px;}
    .m-text{width:100%;height:120px;border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-family:var(--mono);font-size:12px;resize:vertical;outline:none;background:var(--paper);color:var(--ink);}.m-text:focus{border-color:var(--green);}
    /* Sites Master (All Sites) */
    .sm-page{display:flex;flex-direction:column;gap:16px;}
    .sm-crumb{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);}
    .sm-crumb-on{color:var(--ink);font-weight:600;}
    .sm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}
    .sm-title{font-family:var(--display);font-size:24px;font-weight:700;margin:0;letter-spacing:-.02em;color:var(--ink);}
    .sm-sub{margin:4px 0 0;font-size:13px;color:var(--muted);}
    .sm-head-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .sm-btn-outline{padding:8px 14px;font-size:13px;}
    .sm-btn-add{padding:8px 16px;font-size:13px;background:#2563eb;border-radius:8px;}
    .sm-btn-add:hover{background:#1d4ed8;}
    .sm-kpi-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;}
    @media(max-width:1200px){.sm-kpi-row{grid-template-columns:repeat(3,minmax(0,1fr));}}
    @media(max-width:640px){.sm-kpi-row{grid-template-columns:repeat(2,minmax(0,1fr));}}
    .sm-kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .sm-kpi-alert{border-color:#fecaca;background:#fffbfb;}
    .sm-kpi-top{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-soft);font-weight:500;margin-bottom:8px;}
    .sm-kpi-val{font-family:var(--display);font-size:28px;font-weight:700;line-height:1;color:var(--ink);}
    .sm-kpi-loss{color:var(--loss);}
    .sm-kpi-sub{margin-top:6px;font-size:11.5px;color:var(--muted);}
    .sm-ico-profit{color:var(--profit);}.sm-ico-loss{color:var(--loss);}.sm-ico-warn{color:var(--warn);}.sm-ico-muted{color:var(--muted);}
    .sm-filters{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;}
    .sm-filter{display:flex;flex-direction:column;gap:4px;min-width:0;}
    .sm-filter>span{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
    .sm-filter select{font-family:var(--body);font-size:13px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);min-width:130px;}
    .sm-filter-search{flex:1;min-width:180px;max-width:260px;}
    .sm-search{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:var(--paper);color:var(--muted);}
    .sm-search input{border:none;background:none;outline:none;font-size:13px;width:100%;color:var(--ink);}
    .sm-clear{align-self:flex-end;font-size:12px;padding:8px 12px;}
    .sm-hist{align-self:flex-end;margin-left:auto;}
    .sm-table-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;}
    .sm-tbl thead th{background:#f9fafb;}
    .sm-site-link{background:none;border:none;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left;display:block;}
    .sm-site-link:hover{color:#2563eb;}
    .sm-ver{display:inline-block;margin-top:4px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;background:#eff6ff;border:1px solid #bfdbfe;color:#2563eb;font-family:var(--mono);}
    .sm-pend{display:inline-block;font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;line-height:1.35;max-width:220px;}
    .sm-pend-ok{background:rgba(22,119,78,.12);color:var(--profit);}
    .sm-pend-low{background:rgba(194,130,15,.15);color:#b45309;}
    .sm-pend-med{background:rgba(234,88,12,.14);color:#c2410c;}
    .sm-pend-high{background:rgba(178,63,42,.13);color:var(--loss);}
    .sm-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px;}
    .sm-act{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:8px;background:transparent;color:var(--ink-soft);cursor:pointer;}
    .sm-act:hover{background:#f3f4f6;color:var(--ink);}
    .sm-more-wrap{position:relative;display:inline-flex;}
    .sm-more-menu{position:absolute;right:0;top:100%;z-index:20;min-width:160px;margin-top:4px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.1);padding:4px;}
    .sm-more-menu button{display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;font-size:13px;color:var(--ink);cursor:pointer;border-radius:6px;}
    .sm-more-menu button:hover{background:#f3f4f6;}
    .sm-more-menu button.danger{color:var(--loss);}
    .sm-empty{text-align:center;padding:32px;color:var(--muted);}
    .sm-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line);background:#fafafa;font-size:12.5px;color:var(--muted);}
    .sm-foot-right{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
    .sm-rpp{display:flex;align-items:center;gap:8px;font-size:12px;}
    .sm-rpp select{padding:4px 8px;border:1px solid var(--line);border-radius:6px;font-size:12px;background:#fff;}
    .sm-pager{display:flex;align-items:center;gap:8px;}
    .sm-pager button{padding:5px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;font-size:12px;cursor:pointer;color:var(--ink-soft);}
    .sm-pager button:disabled{opacity:.45;cursor:not-allowed;}
    .sm-pager button:not(:disabled):hover{border-color:#d1d5db;color:var(--ink);}
    .sm-legend-grid{display:grid;grid-template-columns:1fr 1.4fr;gap:14px;}
    @media(max-width:900px){.sm-legend-grid{grid-template-columns:1fr;}}
    .sm-legend-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;}
    .sm-legend-card h4{margin:0 0 10px;font-size:13px;font-weight:700;color:var(--ink);}
    .sm-legend-card ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--ink-soft);}
    .sm-legend-card li{display:flex;align-items:center;gap:10px;}
    .sm-about p{margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-soft);}
    `}</style>
  );
}
