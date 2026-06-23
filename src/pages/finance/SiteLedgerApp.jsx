import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { loadLedgerStore, saveLedgerPartial, saveLedgerStore, REIMBURSEMENT_TYPES, reimbursementRowLabel } from "./api/siteLedgerStore";
import { subscribeFinanceRefresh } from "../../services/financeApi";
import { useNavigate } from "react-router-dom";
import { financePath } from "./navConfig";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, Building2, PlusCircle, Search, AlertTriangle,
  TrendingUp, Wallet, Receipt, Percent, IndianRupee, ChevronLeft,
  ArrowUpRight, ArrowDownRight, Download, Upload, Copy, X, Pencil,
  Trash2, CircleDot, Sliders, GripVertical, CalendarClock, Plus,
  Target, FileClock, ChevronRight, ChevronDown, RotateCcw, FileBarChart, AlertCircle, Settings, History,
} from "lucide-react";

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
  { key: "facilities", label: "Facilities & Site Upkeep", color: "#C97A12" },
  { key: "vehicle", label: "Vehicle & Transport", color: "#3E6B89" },
  { key: "maintenance", label: "Maintenance & Equipment", color: "#8E6FB0" },
  { key: "admin", label: "Admin, Statutory & Other", color: "#9A4A3A" },
];
const PARENT_PALETTE = ["#1F6F4E", "#2F7D9E", "#C97A12", "#3E6B89", "#8E6FB0", "#9A4A3A", "#B08D2E", "#6B7C3A", "#8A4F9E", "#3E8979", "#A9842B", "#577590"];
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
  { key: "uniform", label: "Uniform / PPE", parent: "empBenefit" },
  { key: "houseRent", label: "House Rent", parent: "facilities" },
  { key: "cook", label: "Cook Salary", parent: "facilities" },
  { key: "housekeeping", label: "Housekeeping salary & material", parent: "facilities" },
  { key: "vehicleRent", label: "Vehicle rent (temporary)", parent: "vehicle" },
  { key: "vehicleRepair", label: "Vehicle repair & maintenance", parent: "vehicle" },
  { key: "vehicleEMI", label: "Vehicle EMI / Reg / Insurance", parent: "vehicle" },
  { key: "fuel", label: "Petrol & Diesel", parent: "vehicle" },
  { key: "purchaseRepair", label: "Purchase / repair & maint.", parent: "maintenance" },
  { key: "equipment", label: "Equipment / Tools purchase", parent: "maintenance" },
  { key: "labourLicence", label: "Labour Licence fees", parent: "admin" },
  { key: "indirect", label: "Indirect expenses", parent: "admin" },
  { key: "bankCharges", label: "Bank charges / BG", parent: "admin" },
  { key: "bizPromo", label: "Business Promotion", parent: "admin" },
];
const DEFAULT_KEYS = CHILD_HEADS.map((c) => c.key);

const TARGET_MARGIN = 12;
const WARN_MARGIN = 8;

/* ───────────────────────── MONTHS ───────────────────────── */
function buildMonths() {
  const out = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(2024, 3 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "short" }) + "-" + String(d.getFullYear()).slice(2);
    out.push({ key, label });
  }
  return out;
}
const MONTHS = buildMonths();
const monthIdx = (k) => MONTHS.findIndex((m) => m.key === k);
const monthLabelOf = (k) => MONTHS.find((m) => m.key === k)?.label || k;

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
function recognizedExpenses(site, mk, records, directOverride) {
  const rec = directOverride || records[`${site.id}__${mk}`] || {};
  const keys = new Set(siteChildKeys(site));
  (site.spreads || []).forEach((s) => keys.add(s.head));
  const direct = {}, amort = {}, total = {};
  keys.forEach((k) => { direct[k] = Number(rec[k]) || 0; amort[k] = 0; });
  (site.spreads || []).forEach((sp) => {
    const si = monthIdx(sp.start), ci = monthIdx(mk), m = Number(sp.months) || 0;
    if (si >= 0 && m > 0 && ci >= si && ci < si + m) amort[sp.head] = (amort[sp.head] || 0) + Number(sp.total) / m;
  });
  keys.forEach((k) => { total[k] = (direct[k] || 0) + (amort[k] || 0); });
  return { direct, amort, total, keys: [...keys] };
}
function calcSite(site, mk, records, directOverride) {
  const rec = directOverride || records[`${site.id}__${mk}`] || {};
  const revenue = REVENUE_ITEMS.reduce((s, it) => s + it.sign * (Number(rec[it.key]) || 0), 0);
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
  const lib = (site._lib || CHILD_HEADS).find((c) => c.key === key);
  return lib?.label || CHILD_HEADS.find((c) => c.key === key)?.label || key;
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
const contractEndIdx = (site) => site.contractEnd ? monthIdx(site.contractEnd) : MONTHS.length - 1;
const remainingMonths = (site, startMk) => Math.max(1, contractEndIdx(site) - monthIdx(startMk) + 1);
const inContract = (site, mk) => { const i = monthIdx(mk); const s = site.contractStart ? monthIdx(site.contractStart) : 0; return i >= s && i <= contractEndIdx(site); };
// months a site is expected to have reported, up to (and incl.) a cut-off month
function expectedMonths(site, uptoMk) {
  const s = site.contractStart ? monthIdx(site.contractStart) : 0;
  const e = Math.min(contractEndIdx(site), monthIdx(uptoMk));
  const out = []; for (let i = s; i <= e; i++) if (i >= 0) out.push(MONTHS[i].key);
  return out;
}
const pendingMonths = (site, records, uptoMk) => expectedMonths(site, uptoMk).filter((mk) => !records[`${site.id}__${mk}`]);
const isPending = (site, records, mk) => inContract(site, mk) && !records[`${site.id}__${mk}`];

/* ───────────────────────── NORMALIZE / STORAGE ───────────────────────── */
function grp(parent, children) { return { parent, children }; }
function structureFromKeys(keys) {
  return PARENTS.map((p) => grp(p.key, keys.filter((k) => (CHILD_HEADS.find((c) => c.key === k)?.parent || "admin") === p.key))).filter((g) => g.children.length);
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
      // migrate from older flat headKeys, else default
      const keys = (s.headKeys && s.headKeys.length) ? s.headKeys : [...DEFAULT_KEYS];
      structure = structureFromKeys(keys);
    }
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
  let label = "On target", cls = "pill-ok";
  if (profit < 0) { label = "Loss"; cls = "pill-loss"; } else if (margin < WARN_MARGIN) { label = "Thin"; cls = "pill-warn"; } else if (margin < TARGET_MARGIN) { label = "Watch"; cls = "pill-watch"; }
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
    <td className="r mono dim">{hasEst ? inr(est) : "—"}</td>
    <td className="r mono">{inr(actual)}</td>
    <td className="r mono" style={{ color: hasEst ? (c.fav ? "var(--profit)" : "var(--loss)") : "var(--muted)" }}>{hasEst ? `${c.v >= 0 ? "+" : ""}${inr(c.v)}` : "—"}</td>
    <td className="r mono dim">{c.vp == null ? "—" : `${c.vp >= 0 ? "+" : ""}${c.vp.toFixed(0)}%`}</td>
  </>);
}

/* ───────────────────────── MAIN ───────────────────────── */
export default function SiteLedgerApp({ embedded = true }) {
  const navigate = useNavigate();
  const [sites, setSites] = useState([]);
  const [records, setRecords] = useState({});
  const [library, setLibrary] = useState(CHILD_HEADS);
  const [parents, setParents] = useState(() => DEFAULT_PARENTS.map((p) => ({ ...p })));
  const [view, setView] = useState("overview");
  const [activeSite, setActiveSite] = useState(null);
  const [month, setMonth] = useState("2025-09");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showHistorical, setShowHistorical] = useState(false);
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
  const sitesL = useMemo(() => operationalSites.map((s) => ({ ...s, _lib: library })), [operationalSites, library]);
  const sitesAllL = useMemo(() => sitesEnriched.map((s) => ({ ...s, _lib: library })), [sitesEnriched, library]);

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
    if (!needsPortfolio) return MONTHS.slice(15, 18);
    const have = new Set();
    Object.keys(records).forEach((k) => have.add(k.split("__")[1]));
    sites.forEach((s) => (s.spreads || []).forEach((sp) => { const si = monthIdx(sp.start), m = Number(sp.months) || 0; for (let i = si; i < si + m && i < MONTHS.length; i++) if (i >= 0) have.add(MONTHS[i].key); }));
    const list = MONTHS.filter((m) => have.has(m.key));
    return list.length ? list : MONTHS.slice(15, 18);
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

  const prevKey = useMemo(() => { const i = monthIdx(month); return i > 0 ? MONTHS[i - 1].key : null; }, [month]);

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
  const saveRecord = useCallback((siteId, mk, rec) => setRecords((prev) => ({ ...prev, [`${siteId}__${mk}`]: rec })), []);
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
    setView(id);
  }, []);

  if (!loaded) return <div style={{ fontFamily: "var(--body)", padding: 40, color: "var(--muted)" }}><Styles />Loading your sites…</div>;

  return (
    <div className={`app${embedded ? " embedded stacked" : ""}`}>
      <Styles />
      {!embedded && (
        <aside className="side">
          <div className="brand"><div className="brand-mark">P&L</div><div><div className="brand-name">SiteLedger</div><div className="brand-sub">Multi-site P&amp;L</div></div></div>
          <nav>
            <button className={view === "overview" ? "nav on" : "nav"} onClick={() => setView("overview")}><LayoutDashboard size={17} /> Overview</button>
            <button className={view === "sites" ? "nav on" : "nav"} onClick={() => setView("sites")}><Building2 size={17} /> All Sites <span className="count">{activeSiteCount}</span></button>
            <button className={view === "config" ? "nav on" : "nav"} onClick={() => setView("config")}><Sliders size={17} /> Site Setup</button>
            <button className={view === "entry" ? "nav on" : "nav"} onClick={() => setView("entry")}><Pencil size={17} /> Enter / Edit Figures</button>
            <button className={view === "reports" ? "nav on" : "nav"} onClick={() => setView("reports")}><FileBarChart size={17} /> Reports</button>
          </nav>
          <div className="side-foot">
            <button className="ghost" onClick={() => setIoOpen(true)}><Download size={14} /> Backup / Import</button>
            <div className={"save " + saveState}>{saveState === "saving" && "Saving…"}{saveState === "saved" && "✓ Saved to cloud"}{saveState === "local" && "Save failed — use Backup"}{saveState === "idle" && "Ready"}</div>
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
                <button type="button" className="ghost sl-btn" onClick={() => setIoOpen(true)}>
                  <Download size={14} /> Backup
                </button>
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
            {view !== "config" && (
              <div className="month-pick">
                <label>Period</label>
                <select value={month} onChange={(e) => setMonth(e.target.value)}>
                  {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
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
              goEntry={(id) => { setActiveSite(id); setView("entry"); }}
              onViewHistory={(group) => setHistoryGroup(group)}
            />
          )}
          {view === "sites" && (
            <SitesTable
              rows={rows}
              query={query}
              setQuery={setQuery}
              showHistorical={showHistorical}
              setShowHistorical={setShowHistorical}
              inactiveCount={sitesEnriched.length - activeSiteCount}
              openSite={(id) => { setActiveSite(id); setView("site"); }}
              onEdit={(id) => { setActiveSite(id); setView("entry"); }}
              onConfig={(id) => { setActiveSite(id); setView("config"); }}
              onDelete={removeSite}
              onViewHistory={(group) => setHistoryGroup(group)}
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
          {view === "entry" && <EntryForm sites={sitesL} library={library} records={records} month={month} setMonth={setMonth} activeSite={activeSite} setActiveSite={setActiveSite} libMap={libMap} onSave={saveRecord} onPatchSite={patchSite} onAdd={() => setShowAdd(true)} goConfig={(id) => { setActiveSite(id); setView("config"); }} />}
          {view === "config" && <SiteConfig sites={sitesL} library={library} parents={parents} activeSite={activeSite} setActiveSite={setActiveSite} records={records} month={month} onPatchSite={patchSite} onApplySetupChange={applySiteSetupChange} onRemoveHead={removeLibraryHead} onRenameHead={renameLibraryHead} onAdd={() => setShowAdd(true)} onRenameParent={renameParent} onAddParent={addParent} onSetParentColor={setParentColor} onRemoveParent={removeParent} />}
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

      {showAdd && (
        <AddSiteModal
          existing={sitesEnriched}
          onClose={() => setShowAdd(false)}
          onSave={(s) => {
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
      {ioOpen && <IoModal sites={sites} records={records} library={library} parents={parents} onClose={() => setIoOpen(false)} onImport={(d) => { const n = normalize(d); setSites(n.sites); setRecords(n.records); setLibrary(n.library); let ps = (d.parents && d.parents.length) ? d.parents : DEFAULT_PARENTS.map((p) => ({ ...p })); if (d.parentLabels) ps = ps.map((p) => d.parentLabels[p.key] ? { ...p, label: d.parentLabels[p.key] } : p); syncParents(ps); setParents(ps); setIoOpen(false); }} />}
    </div>
  );
}

/* ───────────────────────── OVERVIEW ───────────────────────── */
const PORTFOLIO_FILTERS_INIT = {
  search: "", status: "all", service: "all", contract: "all",
  revMin: "", revMax: "", marginMin: "", marginMax: "",
};

function portfolioDelta(cur, prev) {
  if (prev == null || prev === 0) return null;
  return { val: ((cur - prev) / Math.abs(prev)) * 100, dir: cur - prev >= 0 ? "up" : "down" };
}

function applyPortfolioFilters(rows, filters, month) {
  let list = rows;
  const q = filters.search.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => r.name.toLowerCase().includes(q) || (r.service || "").toLowerCase().includes(q));
  }
  if (filters.service !== "all") list = list.filter((r) => (r.service || "") === filters.service);
  if (filters.contract === "in") list = list.filter((r) => inContract(r, month));
  if (filters.contract === "out") list = list.filter((r) => !inContract(r, month));
  if (filters.status === "reporting") list = list.filter((r) => r.hasData);
  if (filters.status === "pending") list = list.filter((r) => r.pending);
  if (filters.status === "loss") list = list.filter((r) => r.hasData && r.profit < 0);
  if (filters.status === "thin") list = list.filter((r) => r.hasData && r.profit >= 0 && r.margin < WARN_MARGIN);
  if (filters.status === "below-est") list = list.filter((r) => r.hasData && r.est && r.profit < r.est.profit);
  if (filters.revMin !== "") list = list.filter((r) => r.hasData && r.revenue >= Number(filters.revMin));
  if (filters.revMax !== "") list = list.filter((r) => r.hasData && r.revenue <= Number(filters.revMax));
  if (filters.marginMin !== "") list = list.filter((r) => r.hasData && r.margin >= Number(filters.marginMin));
  if (filters.marginMax !== "") list = list.filter((r) => r.hasData && r.margin <= Number(filters.marginMax));
  return list;
}

function Overview({ rows, sitesL, sitesAll, records, month, mLabel, activeMonths, siteCount, totalSiteCount, showHistorical, setShowHistorical, openSite, goEntry, onViewHistory }) {
  const [filters, setFilters] = useState(PORTFOLIO_FILTERS_INIT);
  const setF = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const services = useMemo(
    () => [...new Set(rows.map((r) => r.service).filter(Boolean))].sort(),
    [rows],
  );

  const filteredRows = useMemo(
    () => applyPortfolioFilters(rows, filters, month),
    [rows, filters, month],
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
  const thinCount = useMemo(() => withData.filter((r) => r.profit >= 0 && r.margin < WARN_MARGIN).length, [withData]);

  const prevKey = useMemo(() => { const i = monthIdx(month); return i > 0 ? MONTHS[i - 1].key : null; }, [month]);
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
    () => [...withData].filter((r) => r.profit < 0 || r.margin < WARN_MARGIN).sort((a, b) => a.profit - b.profit),
    [withData],
  );

  const hasActiveFilters = filters.search || filters.status !== "all" || filters.service !== "all"
    || filters.contract !== "all" || filters.revMin || filters.revMax || filters.marginMin || filters.marginMax;

  return (
    <>
      <div className="ov-filters">
        <div className="ov-filter search">
          <Search size={14} />
          <input value={filters.search} onChange={(e) => setF({ search: e.target.value })} placeholder="Search sites…" />
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
          <span>Service</span>
          <select value={filters.service} onChange={(e) => setF({ service: e.target.value })}>
            <option value="all">All services</option>
            {services.map((s) => <option key={s} value={s}>{s}</option>)}
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
        <label className="ov-filter range">
          <span>Margin (%)</span>
          <div className="ov-range">
            <input type="number" value={filters.marginMin} onChange={(e) => setF({ marginMin: e.target.value })} placeholder="Min" />
            <span>–</span>
            <input type="number" value={filters.marginMax} onChange={(e) => setF({ marginMax: e.target.value })} placeholder="Max" />
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

      <Card title="Sites Needing Attention" right={<span className="muted-s">{attention.length} flagged · loss or margin &lt; {WARN_MARGIN}%</span>}>
        {attention.length === 0 ? (
          <div className="all-clear"><TrendingUp size={16} /> Every reporting site cleared the {WARN_MARGIN}% margin floor this period.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Site</th><th>Service</th><th className="r">Revenue</th><th className="r">Profit</th><th className="r">Margin</th><th>Status</th><th />
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
                  <td className="muted-s">{r.service || "—"}</td>
                  <td className="r mono">{inr(r.revenue)}</td>
                  <td className="r mono" style={{ color: r.profit < 0 ? "var(--loss)" : "var(--ink)" }}>{inr(r.profit)}</td>
                  <td className="r mono" style={{ color: r.margin < 0 ? "var(--loss)" : r.margin < WARN_MARGIN ? "var(--warn)" : "var(--ink)" }}>{pct(r.margin)}</td>
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
    </>
  );
}


/* ───────────────────────── SITES TABLE ───────────────────────── */
function SitesTable({ rows, query, setQuery, showHistorical, setShowHistorical, inactiveCount, openSite, onEdit, onConfig, onDelete, onViewHistory, mLabel }) {
  const [sort, setSort] = useState({ key: "profit", dir: "desc" });
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()) || (r.service || "").toLowerCase().includes(query.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => { const m = sort.dir === "asc" ? 1 : -1; return sort.key === "name" ? m * a.name.localeCompare(b.name) : m * ((a[sort.key] || 0) - (b[sort.key] || 0)); });
  const setS = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const arr = (k) => sort.key === k ? (sort.dir === "desc" ? " ▾" : " ▴") : "";
  return (
    <Card
      title={`All Sites · ${mLabel}`}
      right={(
        <div className="sites-head-actions">
          <button type="button" className={"hist-scope-btn sm" + (showHistorical ? " on" : "")} onClick={() => setShowHistorical((v) => !v)}>
            <History size={13} />
            {showHistorical ? "Hide inactive" : `Show inactive${inactiveCount ? ` (${inactiveCount})` : ""}`}
          </button>
          <div className="search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sites…" /></div>
        </div>
      )}
    >
      <table className="tbl">
        <thead><tr><th className="click" onClick={() => setS("name")}>Site{arr("name")}</th><th>Contract</th><th>Service</th><th>Lines</th><th className="r click" onClick={() => setS("revenue")}>Revenue{arr("revenue")}</th><th className="r click" onClick={() => setS("expense")}>Expense{arr("expense")}</th><th className="r click" onClick={() => setS("profit")}>Profit{arr("profit")}</th><th className="r click" onClick={() => setS("margin")}>Margin{arr("margin")}</th><th className="r click" onClick={() => setS("profitVar")}>vs Est{arr("profitVar")}</th><th>Status</th><th></th></tr></thead>
        <tbody>{sorted.map((r) => (
          <tr key={r.id} className={`${r.pending ? "row-pending" : ""}${!isSiteActive(r) ? " row-inactive" : ""}`}>
            <td className="strong click" onClick={() => openSite(r.id)}>
              {r.name}
              <span className={"ver-pill" + (!isSiteActive(r) ? " inactive" : "")}>{versionLabel(r)}{!isSiteActive(r) ? " · Inactive" : ""}</span>
            </td>
            <td className="muted-s mono">{r.contractStart ? `${monthLabelOf(r.contractStart)}–${monthLabelOf(r.contractEnd)}` : "—"}{r.wo ? ` · ${r.wo}` : ""}</td>
            <td className="muted-s">{r.service || "—"}</td>
            <td className="muted-s mono">{siteChildKeys(r).length}{(r.spreads || []).length ? ` · ${r.spreads.length}⏳` : ""}</td>
            {r.hasData ? <>
              <td className="r mono">{inr(r.revenue)}</td><td className="r mono">{inr(r.expense)}</td>
              <td className="r mono" style={{ color: r.profit < 0 ? "var(--loss)" : "var(--profit)" }}>{inr(r.profit)}</td>
              <td className="r mono" style={{ color: r.margin < 0 ? "var(--loss)" : r.margin < WARN_MARGIN ? "var(--warn)" : "var(--ink)" }}>{pct(r.margin)}</td>
              <td className="r mono" style={{ color: r.profitVar == null ? "var(--muted)" : r.profitVar >= 0 ? "var(--profit)" : "var(--loss)" }}>{r.profitVar == null ? "—" : `${r.profitVar >= 0 ? "+" : ""}${inrShort(r.profitVar)}`}</td>
              <td><StatusPill margin={r.margin} profit={r.profit} /></td>
            </> : <>
              <td className="r muted-s" colSpan={4} style={{ textAlign: "center" }}>{r.pending ? <span className="pend-inline"><AlertCircle size={12} /> awaiting {mLabel}{r.pendingCount > 1 ? ` · ${r.pendingCount} mo behind` : ""}</span> : `not in contract for ${mLabel}`}</td>
              <td>{r.pending ? <span className="pill pill-pending"><CircleDot size={9} /> Pending</span> : <span className="muted-s">—</span>}</td>
            </>}
            <td className="r nowrap">
              <button className="icon-btn" title="View version history" onClick={() => onViewHistory(r.siteGroup)}><History size={14} /></button>
              {isSiteActive(r) && (
                <>
                  <button className="icon-btn" title="Configure structure" onClick={() => onConfig(r.id)}><Sliders size={14} /></button>
                  <button className={"icon-btn" + (r.pending ? " accent" : "")} title="Enter figures" onClick={() => onEdit(r.id)}><Pencil size={14} /></button>
                </>
              )}
              <button className="icon-btn" title="View P&L" onClick={() => openSite(r.id)}><FileBarChart size={14} /></button>
              {isSiteActive(r) && (
                <button className="icon-btn danger" title="Delete" onClick={() => { if (confirm(`Delete "${r.name}" (${versionLabel(r)}) and all its data?`)) onDelete(r.id); }}><Trash2 size={14} /></button>
              )}
            </td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
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
  const revBreak = REVENUE_ITEMS.map((it) => ({
    ...it,
    label: revenueDisplayLabel(it, rec),
    raw: Number(rec?.[it.key]) || 0,
    est: Number(estVer?.revenue?.[it.key]) || 0,
  }));
  const tree = expenseTree(site, month, records, estVer).filter((g) => g.actual !== 0 || g.est !== 0);
  const cats = parentTotalsSite(site, month, records);
  const catData = PARENTS.map((p) => ({ name: parentLabel(p.key), value: cats[p.key] || 0, color: p.color })).filter((d) => d.value > 0);
  const siteTrend = MONTHS.filter((m) => { const cc = calcSite(site, m.key, records); return cc.revenue || cc.expense; }).map((m) => { const cc = calcSite(site, m.key, records); const e = estTotals(estimateFor(site, m.key)); return { name: m.label, profit: cc.profit, estProfit: e ? e.profit : null }; });
  const profitVar = est ? c.profit - est.profit : null;
  const toggle = (k) => setExpanded((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allExpanded = tree.length > 0 && tree.every((g) => expanded.has(g.parent));
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(tree.map((g) => g.parent)));

  return (
    <>
      <button className="back" onClick={back}><ChevronLeft size={16} /> Back to overview</button>
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
        <div>
          <h2>{site.name} <span className="ver-pill inline">{versionLabel(site)}{historical ? " · Inactive" : " · Active"}</span></h2>
          <p>{site.service || "—"}{site.wo ? ` · W.O. ${site.wo}` : ""}{site.contractStart ? ` · contract ${monthLabelOf(site.contractStart)}–${monthLabelOf(site.contractEnd)}` : ""} · {mLabel}</p>
        </div>
        <div className="site-head-right">
          <StatusPill margin={c.margin} profit={c.profit} />
          <button className="ghost-d" onClick={() => onViewHistory(site.siteGroup)}><History size={14} /> History</button>
          {!historical && <button className="ghost-d" onClick={onConfig}><Sliders size={14} /> Setup</button>}
          {!historical && <button className="primary" onClick={onEdit}><Pencil size={14} /> Edit figures</button>}
        </div>
      </div>
      <div className="kpi-row">
        <Kpi icon={IndianRupee} label="Total Revenue (a)" value={inrShort(c.revenue)} sub={est ? `est ${inrShort(est.revenue)}` : null} />
        <Kpi icon={Receipt} label="Sub-total Expenses (b)" value={inrShort(c.expense)} sub={est ? `est ${inrShort(est.expense)}` : (c.revenue ? `${pct((c.expense / c.revenue) * 100)} of revenue` : null)} />
        <Kpi icon={Wallet} label="Profit (a − b)" value={inrShort(c.profit)} tone={c.profit >= 0 ? "profit" : "loss"} sub={est ? `est ${inrShort(est.profit)}` : null} />
        <Kpi icon={Target} label="Profit vs Estimate" value={profitVar == null ? "—" : `${profitVar >= 0 ? "+" : ""}${inrShort(profitVar)}`} tone={profitVar == null ? "ink" : profitVar >= 0 ? "profit" : "loss"} sub={profitVar == null ? "no estimate" : profitVar >= 0 ? "favourable" : "adverse"} trend={profitVar == null ? undefined : profitVar >= 0 ? "up" : "down"} />
        <Kpi icon={Percent} label="Margin" value={pct(c.margin)} tone={c.margin >= TARGET_MARGIN ? "profit" : c.margin >= WARN_MARGIN ? "warn" : "loss"} sub={est ? `est ${pct(est.margin)}` : `target ${TARGET_MARGIN}%`} />
      </div>
      {!rec && tree.length === 0 ? <div className="empty"><Receipt size={30} /><h3>No figures for {mLabel}</h3><p>Click <b>Edit figures</b> to add this period.</p></div> : (
        <>
          <Card title="Income – Expenditure · Actual vs Estimate" pad={false} right={<span className="muted-s" style={{ display: "flex", gap: 12, alignItems: "center" }}><button className="link" onClick={toggleAll}>{allExpanded ? "Collapse all" : "Expand all"}</button>{estVer ? <span><FileClock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />budget {monthLabelOf(estVer.effectiveFrom)}{estVer.note ? ` · ${estVer.note}` : ""}</span> : "no estimate"}</span>}>
            <table className="tbl vtbl">
              <thead><tr><th>Particulars</th><th className="r">Estimate</th><th className="r">Actual</th><th className="r">Variance</th><th className="r">Var %</th></tr></thead>
              <tbody>
                <tr className="vsec"><td colSpan={5}>Revenue</td></tr>
                {revBreak.map((it) => (<tr key={it.key}><td>{it.label}</td><VarCells est={it.sign * it.est} actual={it.sign * it.raw} lowerIsBetter={false} hasEst={!!it.est} /></tr>))}
                <tr className="vtot green"><td>Total Revenue (a)</td><VarCells est={est?.revenue || 0} actual={c.revenue} lowerIsBetter={false} hasEst={!!est} /></tr>
                <tr className="vsec"><td colSpan={5}>Expenses <span className="vhint">— click a head to expand its components</span></td></tr>
                {tree.map((g) => (
                  <React.Fragment key={g.parent}>
                    <tr className="vparent" onClick={() => toggle(g.parent)} onDoubleClick={() => toggle(g.parent)}>
                      <td><span className="pchev">{expanded.has(g.parent) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span><span className="pdot" style={{ background: g.color }} /><b>{g.label}</b>{g.amort > 0 && <em className="amort-tag">⏳ {inr(g.amort)} spread</em>}<span className="pcount">{g.children.length}</span></td>
                      <VarCells est={g.est} actual={g.actual} lowerIsBetter={true} hasEst={g.est > 0} />
                    </tr>
                    {expanded.has(g.parent) && g.children.filter((ch) => ch.actual !== 0 || ch.est !== 0).map((ch) => (
                      <tr className="vchild" key={ch.key}><td><span className="cbranch" />{ch.label}{ch.amort > 0 && <em className="amort-tag">⏳ {inr(ch.amort)}</em>}</td><VarCells est={ch.est} actual={ch.actual} lowerIsBetter={true} hasEst={ch.est > 0} /></tr>
                    ))}
                  </React.Fragment>
                ))}
                <tr className="vtot green"><td>Sub-total (b)</td><VarCells est={est?.expense || 0} actual={c.expense} lowerIsBetter={true} hasEst={!!est} /></tr>
                <tr className={"vtot " + (c.profit >= 0 ? "profit" : "loss")}><td>Profit (a − b)</td><VarCells est={est?.profit || 0} actual={c.profit} lowerIsBetter={false} hasEst={!!est} /></tr>
                <tr className="vmargin"><td>Margin %</td><td className="r mono dim">{est ? pct(est.margin) : "—"}</td><td className="r mono">{pct(c.margin)}</td><td className="r mono" style={{ color: est ? (c.margin >= est.margin ? "var(--profit)" : "var(--loss)") : "var(--muted)" }}>{est ? `${c.margin - est.margin >= 0 ? "+" : ""}${(c.margin - est.margin).toFixed(1)} pp` : "—"}</td><td className="r mono dim">—</td></tr>
              </tbody>
            </table>
          </Card>
          <div className="grid-2">
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
    </>
  );
}

/* ───────────────────────── SITE CONFIG (parent → child builder) ───────────────────────── */
function SiteConfig({ sites, library, parents, activeSite, setActiveSite, records, month, onPatchSite, onApplySetupChange, onRemoveHead, onRenameHead, onAdd, onRenameParent, onAddParent, onSetParentColor, onRemoveParent }) {
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

  const structure = displayStructure(site);
  const structureWithChildren = structure.filter((g) => g.children.length);
  const used = new Set(siteChildKeys(site));
  const available = library.filter((h) => !used.has(h.key));
  const libMap = Object.fromEntries(library.map((h) => [h.key, h]));
  const rec = records[`${siteId}__${month}`] || {};
  const c = calcSite(site, month, records, rec);
  const parentSub = (g) => g.children.reduce((a, k) => a + (c.ex.total[k] || 0), 0);

  const moveChild = (childKey, fromParent, toParent, beforeKey) => {
    const libraryChanged = (library.find((h) => h.key === childKey)?.parent !== toParent);
    onApplySetupChange(({ sites: allSites, library: lib }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      let nextStructure = displayStructure(target).map((g) => ({ parent: g.parent, children: [...g.children] }));
      nextStructure.forEach((g) => { g.children = g.children.filter((k) => k !== childKey); });
      const tg = nextStructure.find((g) => g.parent === toParent);
      if (!tg) return {};
      if (beforeKey) { const i = tg.children.indexOf(beforeKey); tg.children.splice(i < 0 ? tg.children.length : i, 0, childKey); }
      else tg.children.push(childKey);
      const nextLibrary = libraryChanged
        ? lib.map((h) => (h.key === childKey ? { ...h, parent: toParent } : h))
        : lib;
      return {
        sites: allSites.map((site) => (site.id === siteId ? { ...site, structure: compactStructure(nextStructure) } : site)),
        library: nextLibrary,
      };
    }, { scope: "structure", siteCode: siteId, libraryChanged });
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

  const commitChildRename = (key) => {
    onRenameHead(key, editChildVal);
    setEditingChild(null);
  };
  const deleteHead = (key) => {
    const h = libMap[key];
    if (!h) return;
    if (!h.custom && !confirm(`Delete "${h.label}" from the library? It will be removed from all sites.`)) return;
    onRemoveHead(key);
  };

  const addCustom = () => {
    if (!newLabel.trim()) return;
    let key = slug(newLabel); let n = 1;
    while (library.some((h) => h.key === key)) key = slug(newLabel) + "-" + (++n);
    const head = { key, label: newLabel.trim(), parent: newParent, custom: true };
    onApplySetupChange(({ sites: allSites, library: lib }) => {
      const target = allSites.find((s) => s.id === siteId);
      if (!target) return {};
      const nextStructure = displayStructure(target).map((g) => (
        g.parent === newParent ? { parent: g.parent, children: [...g.children, key] } : g
      ));
      return {
        library: lib.some((h) => h.key === key) ? lib : [...lib, head],
        sites: allSites.map((site) => (site.id === siteId ? { ...site, structure: compactStructure(nextStructure) } : site)),
      };
    }, { scope: "structure", siteCode: siteId, libraryChanged: true });
    setNewLabel("");
  };

  return (
    <>
      <div className="entry-bar">
        <div className="entry-sel"><label>Configure site</label><select value={siteId} onChange={(e) => { setSiteId(e.target.value); setActiveSite(e.target.value); }}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="cfg-hint"><GripVertical size={14} /> Drag cost lines between parents to reorder; double-click a parent name to rename it. Changes save automatically.</div>
        <button className="ghost-d" onClick={onAdd}><PlusCircle size={14} /> New site</button>
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

      <div className="pmanage">
        <span className="blab">Parent heads</span>
        <input value={newPName} onChange={(e) => setNewPName(e.target.value)} placeholder="New parent head (e.g. Statutory Costs)" onKeyDown={(e) => { if (e.key === "Enter" && newPName.trim()) { onAddParent(newPName, newPColor); setNewPName(""); } }} />
        <div className="swatches">{PARENT_PALETTE.map((c) => <button key={c} className={"sw" + (newPColor === c ? " on" : "")} style={{ background: c }} onClick={() => setNewPColor(c)} />)}</div>
        <button className="primary sm" disabled={!newPName.trim()} onClick={() => { if (newPName.trim()) { onAddParent(newPName, newPColor); setNewPName(""); } }}><Plus size={14} /> Add parent</button>
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
                  <b className="pname" title="Double-click to rename" onDoubleClick={() => { setEditing(g.parent); setEditVal(parentLabel(g.parent)); }}>{parentLabel(g.parent)}</b>
                  <button className="chip-act pname-edit" title="Rename head" onClick={() => { setEditing(g.parent); setEditVal(parentLabel(g.parent)); }}><Pencil size={11} /></button>
                  {g.children.length === 0 && <button className="chip-act danger" title="Delete this parent head" onClick={() => onRemoveParent(g.parent)}><Trash2 size={11} /></button>}
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
      <div className="grid-2 entry-cols">
        <div className="entry-col">
          <div className="entry-totals rev-totals">
            <div className="entry-totals-h">Revenue Totals</div>
            <table className="entry-totals-tbl">
              <tbody>
                {REVENUE_ITEMS.map((it) => (
                  <tr key={it.key}>
                    <td>{revenueDisplayLabel(it, rec)}</td>
                    <td className="r mono">{inr(it.sign * (Number(rec[it.key]) || 0))}</td>
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
            {structureWithChildren.length === 0 ? (
              <p className="muted-s" style={{ margin: 0, fontSize: 12.5 }}>Configure cost lines to see section totals.</p>
            ) : (
              <table className="entry-totals-tbl">
                <tbody>
                  {structureWithChildren.map((g) => (
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
        <label className="sf"><span>Contract start</span><select value={site.contractStart || ""} onChange={(e) => setContract({ contractStart: e.target.value })}><option value="">—</option>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
        <label className="sf"><span>Contract end</span><select value={site.contractEnd || ""} onChange={(e) => setContract({ contractEnd: e.target.value })}><option value="">—</option>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
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
            <label className="sf"><span>Effective from</span><select value={effFrom} onChange={(e) => setEffFrom(e.target.value)}>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
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
                <td className="mono">{monthLabelOf(sp.start)}</td>
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
        <label className="sf"><span>Arrives / starts</span><select value={start} onChange={(e) => setStart(e.target.value)}>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}{entryMonth && m.key === entryMonth ? " (this entry)" : ""}</option>)}</select></label>
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
function entryRecordClean(form) {
  const clean = {};
  Object.entries(form).forEach(([k, v]) => {
    if (k === "reimbursementType") {
      if (v) clean[k] = String(v);
      return;
    }
    if (v !== undefined && v !== null && v !== 0 && !Number.isNaN(v)) clean[k] = Number(v);
  });
  return clean;
}

function revenueDisplayLabel(it, rec) {
  if (it.key === "esicBill") return reimbursementRowLabel(rec);
  return it.label;
}

function EntryForm({ sites, library, records, month, setMonth, activeSite, setActiveSite, libMap, onSave, onPatchSite, onAdd, goConfig }) {
  const [siteId, setSiteId] = useState(activeSite || sites[0]?.id || "");
  const [mk, setMk] = useState(month);
  const [form, setForm] = useState({});
  const [saveUi, setSaveUi] = useState("idle");
  const skipAutoSave = useRef(true);
  const autoSaveTimer = useRef(null);
  useEffect(() => { if (activeSite) setSiteId(activeSite); }, [activeSite]);
  useEffect(() => { setMk(month); }, [month]);
  useEffect(() => {
    skipAutoSave.current = true;
    setForm(records[`${siteId}__${mk}`] ? { ...records[`${siteId}__${mk}`] } : {});
    setSaveUi("idle");
  }, [siteId, mk, records]);
  const saveUiTimer = useRef(null);
  const persistForm = useCallback((data, { manual = false } = {}) => {
    onSave(siteId, mk, entryRecordClean(data));
    setMonth(mk);
    setActiveSite(siteId);
    setSaveUi(manual ? "saved" : "autosaved");
    if (saveUiTimer.current) clearTimeout(saveUiTimer.current);
    saveUiTimer.current = setTimeout(() => setSaveUi("idle"), manual ? 2500 : 1800);
  }, [siteId, mk, onSave, setMonth, setActiveSite]);
  useEffect(() => {
    if (skipAutoSave.current) {
      skipAutoSave.current = false;
      return undefined;
    }
    setSaveUi("pending");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => persistForm(form), 700);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [form, persistForm]);
  if (!sites.length) return <div className="empty"><Building2 size={30} /><h3>No sites yet</h3><p>Add your first site to start recording figures.</p><button className="primary" onClick={onAdd} style={{ marginTop: 12 }}><PlusCircle size={15} /> Add Site</button></div>;
  const site = sites.find((s) => s.id === siteId);
  const structure = displayStructure(site).filter((g) => g.children.length);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v === "" ? undefined : Number(v) }));
  const setStr = (k, v) => setForm((f) => ({ ...f, [k]: v || undefined }));
  const c = calcSite(site, mk, records, form);
  const parentSub = (g) => g.children.reduce((a, k) => a + (c.ex.total[k] || 0), 0);
  const copyPrev = () => { const idx = monthIdx(mk); for (let i = idx - 1; i >= 0; i--) { const r = records[`${siteId}__${MONTHS[i].key}`]; if (r) { setForm({ ...r }); return; } } alert("No earlier month found for this site."); };
  const save = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    persistForm(form, { manual: true });
  };
  const renderField = (key, label) => (<label className="field" key={key}><span>{label}</span><div className="field-in"><i>₹</i><input type="number" inputMode="numeric" value={form[key] ?? ""} placeholder="0" onChange={(e) => set(key, e.target.value)} /></div></label>);
  const renderReimbursementField = () => (
    <label className="field field-reimb" key="esicBill">
      <span>Reimbursement</span>
      <div className="reimb-row">
        <select
          className="reimb-sel"
          value={form.reimbursementType || ""}
          onChange={(e) => setStr("reimbursementType", e.target.value)}
        >
          <option value="">Select type…</option>
          {REIMBURSEMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div className="field-in reimb-amt">
          <i>₹</i>
          <input
            type="number"
            inputMode="numeric"
            value={form.esicBill ?? ""}
            placeholder="0"
            onChange={(e) => set("esicBill", e.target.value)}
          />
        </div>
      </div>
    </label>
  );
  const pend = site ? pendingMonths(site, records, month) : [];
  const monthFilled = (k) => !!records[`${siteId}__${k}`];
  const saveLabel = saveUi === "saved" ? "✓ Saved" : saveUi === "autosaved" ? "✓ Auto-saved" : saveUi === "pending" ? "Saving…" : "Save figures";

  return (
    <div className="entry">
      <div className="entry-bar">
        <div className="entry-sel"><label>Site</label><select value={siteId} onChange={(e) => setSiteId(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="entry-sel"><label>Period</label><select value={mk} onChange={(e) => setMk(e.target.value)}>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}{monthFilled(m.key) ? " ✓" : inContract(site, m.key) && monthIdx(m.key) <= monthIdx(month) ? " • pending" : ""}</option>)}</select></div>
        <button className="ghost-d" onClick={copyPrev}><Copy size={14} /> Copy previous</button>
        <button className="ghost-d" onClick={() => goConfig(siteId)}><Sliders size={14} /> Structure</button>
        <div className="entry-live"><span>Rev <b>{inrShort(c.revenue)}</b></span><span>Exp <b>{inrShort(c.expense)}</b></span><span style={{ color: c.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>Profit <b>{inrShort(c.profit)}</b> ({pct(c.margin)})</span></div>
        <button className="primary" onClick={save} disabled={saveUi === "pending"}>{saveLabel}</button>
      </div>
      {pend.length > 0 && (
        <div className="pend-strip">
          <span className="pend-strip-lbl"><AlertCircle size={14} /> Pending for this site:</span>
          {pend.map((k) => <button key={k} className={"pend-chip" + (k === mk ? " on" : "")} onClick={() => setMk(k)}>{monthLabelOf(k)}</button>)}
        </div>
      )}
      {c.ex && Object.values(c.ex.amort).some((v) => v > 0) && (
        <div className="amort-note"><CalendarClock size={15} /> This period includes <b>{inr(Object.values(c.ex.amort).reduce((a, b) => a + b, 0))}</b> of spread costs (recognised automatically below).</div>
      )}
      <Card
        title={`Deferred / Spread Costs · ${monthLabelOf(mk)}`}
        right={site.contractEnd ? <span className="muted-s">contract through {monthLabelOf(site.contractEnd)}</span> : <span className="muted-s warn-s">no contract end set</span>}
      >
        <SpreadEditor site={site} library={library} onPatchSite={onPatchSite} entryMonth={mk} />
      </Card>
      <div className="grid-2 entry-cols">
        <div className="entry-col">
          <Card title="Revenue">
            <div className="fields">
              {REVENUE_ITEMS.map((it) => (
                it.key === "esicBill" ? renderReimbursementField() : renderField(it.key, it.label)
              ))}
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
  const { sites, records, dim, measures, scope, periodMode, month, from, to, filter } = cfg;
  const scopeSites = scope === "all" ? sites : sites.filter((s) => s.id === scope);
  let mks = periodMode === "single" && dim !== "month" ? [month] : MONTHS.slice(Math.min(monthIdx(from), monthIdx(to)), Math.max(monthIdx(from), monthIdx(to)) + 1).map((m) => m.key);
  if (dim === "month" && periodMode === "single") mks = [month];
  const reported = (s, mk) => !!records[`${s.id}__${mk}`];

  if (dim === "pending") {
    const cols = ["Site", "Contract", "Expected", "Filled", "Pending", `Pending months (to ${monthLabelOf(month)})`];
    const rows = scopeSites.map((s) => {
      const exp = expectedMonths(s, month);
      const pend = exp.filter((mk) => !records[`${s.id}__${mk}`]);
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

  useEffect(() => { setMonth(defaultMonth); }, [defaultMonth]);

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
    () => buildReport({ sites, records, dim, measures, scope, periodMode, month, from, to, filter }),
    [sites, records, dim, measures, scope, periodMode, month, from, to, filter, parents],
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
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
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
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span>–</span>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
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
                  <select value={month} onChange={(e) => setMonth(e.target.value)}>
                    {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
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
                      <select value={month} onChange={(e) => setMonth(e.target.value)}>
                        {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="ov-filter range">
                      <span>Range</span>
                      <div className="ov-range">
                        <select value={from} onChange={(e) => setFrom(e.target.value)}>
                          {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                        <span>–</span>
                        <select value={to} onChange={(e) => setTo(e.target.value)}>
                          {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
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
function AddSiteModal({ onClose, onSave, existing }) {
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [wo, setWo] = useState("");
  const [tmpl, setTmpl] = useState("default");
  const [cStart, setCStart] = useState("2025-04");
  const [cEnd, setCEnd] = useState("2026-03");
  const [renewalMode, setRenewalMode] = useState(false);
  const templates = {
    default: DEFAULT_KEYS,
    security: ["salaries", "salariesOT", "holiday", "gratuity", "pf", "esicEmp", "uniform", "empBenefit", "houseRent", "fuel", "labourLicence", "indirect", "bankCharges", "bizPromo"],
    housekeeping: ["salaries", "salariesOT", "pf", "esicEmp", "empBenefit", "uniform", "cook", "housekeeping", "houseRent", "purchaseRepair", "indirect", "bankCharges", "bizPromo"],
    fire: ["salaries", "salariesOT", "holiday", "bonus", "gratuity", "pf", "esicEmp", "insurance", "empBenefit", "uniform", "houseRent", "fuel", "vehicleRepair", "equipment", "labourLicence", "indirect", "bankCharges", "bizPromo"],
  };
  const nameMatches = useMemo(
    () => existing.filter((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()),
    [existing, name],
  );
  const priorActive = useMemo(
    () => nameMatches.find(isSiteActive) || nameMatches[0] || null,
    [nameMatches],
  );
  const isRenewal = renewalMode && nameMatches.length > 0;
  const submit = () => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    let id = slug(trimmed);
    let n = 1;
    while (existing.some((s) => s.id === id)) id = slug(trimmed) + "-" + (++n);
    const base = {
      id,
      name: trimmed,
      service: (service || priorActive?.service || "").trim(),
      wo: wo.trim(),
      structure: isRenewal && priorActive?.structure?.length
        ? priorActive.structure.map((g) => ({ parent: g.parent, children: [...g.children] }))
        : structureFromKeys(templates[tmpl]),
      spreads: [],
      estimates: [],
      contractStart: cStart,
      contractEnd: cEnd,
      siteGroup: priorActive?.siteGroup || slug(trimmed),
      version: 1,
      status: "active",
      isRenewal: !!isRenewal,
    };
    onSave(base);
  };
  return (
    <Modal onClose={onClose} title={isRenewal ? "New Contract / PO Version" : "Add Site"}>
      <label className="m-field"><span>Site / client name *</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lalitpur Power Generation" autoFocus /></label>
      {nameMatches.length > 0 && (
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
      <label className="m-field"><span>Service type</span><input value={service} onChange={(e) => setService(e.target.value)} placeholder="Fire Fighting / Security / Housekeeping…" /></label>
      <label className="m-field"><span>Work order / PO no.</span><input value={wo} onChange={(e) => setWo(e.target.value)} placeholder="e.g. PO-2026-0142" /></label>
      <div style={{ display: "flex", gap: 10 }}>
        <label className="m-field" style={{ flex: 1 }}><span>Contract start</span><select value={cStart} onChange={(e) => setCStart(e.target.value)}>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
        <label className="m-field" style={{ flex: 1 }}><span>Contract end</span><select value={cEnd} onChange={(e) => setCEnd(e.target.value)}>{MONTHS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
      </div>
      {!isRenewal && (
        <label className="m-field"><span>Start from a structure template</span><select value={tmpl} onChange={(e) => setTmpl(e.target.value)}><option value="default">All standard lines</option><option value="security">Security</option><option value="housekeeping">Housekeeping</option><option value="fire">Fire Fighting</option></select></label>
      )}
      {isRenewal && priorActive && (
        <p className="m-note">Structure will be copied from {versionLabel(priorActive)}. Adjust rates and heads in Site Setup after creating.</p>
      )}
      <p className="m-note">Next, in Site Setup you can arrange parent → child lines (drag &amp; drop) and set the <b>estimate / budget</b>.</p>
      <div className="m-actions"><button className="ghost-d" onClick={onClose}>Cancel</button><button className="primary" onClick={submit}>{isRenewal ? "Create new version" : "Add & configure"}</button></div>
    </Modal>
  );
}

function SiteVersionHistoryModal({ siteGroup, sites, records, month, onClose, onOpenSite }) {
  const versions = useMemo(() => sitesInGroup(sites, siteGroup), [sites, siteGroup]);
  const siteName = versions[0]?.name || "Site";
  const mLabel = monthLabelOf(month);
  return (
    <Modal onClose={onClose} title={`Version History · ${siteName}`} wide>
      <p className="m-note">Complete audit trail of PO / contract versions. Historical versions are read-only and excluded from active portfolio totals by default.</p>
      <table className="tbl hist-tbl">
        <thead>
          <tr>
            <th>Version</th>
            <th>PO / W.O.</th>
            <th>Contract</th>
            <th>Service</th>
            <th>Status</th>
            <th className="r">P&L · {mLabel}</th>
            <th className="r">Estimates</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {versions.map((s) => {
            const c = calcSite(s, month, records);
            const hasData = !!records[`${s.id}__${month}`];
            const estCount = (s.estimates || []).length;
            return (
              <tr key={s.id} className={!isSiteActive(s) ? "row-inactive" : ""}>
                <td className="strong">{versionLabel(s)}</td>
                <td className="mono">{s.wo || "—"}</td>
                <td className="mono muted-s">{s.contractStart ? `${monthLabelOf(s.contractStart)}–${monthLabelOf(s.contractEnd)}` : "—"}</td>
                <td className="muted-s">{s.service || "—"}</td>
                <td>
                  <span className={"pill " + (isSiteActive(s) ? "pill-ok" : "pill-inactive")}>
                    <CircleDot size={9} /> {isSiteActive(s) ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="r mono" style={{ color: hasData ? (c.profit < 0 ? "var(--loss)" : "var(--ink)") : "var(--muted)" }}>
                  {hasData ? inr(c.profit) : "—"}
                </td>
                <td className="r mono muted-s">{estCount || "—"}</td>
                <td className="r">
                  <button type="button" className="link" onClick={() => onOpenSite(s.id)}>View P&L →</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="m-actions">
        <button className="ghost-d" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

function IoModal({ sites, records, library, parents, onClose, onImport }) {
  const [text, setText] = useState("");
  const json = JSON.stringify({ sites, records, library, parents }, null, 2);
  const copy = () => navigator.clipboard?.writeText(json);
  const download = () => { try { const b = new Blob([json], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "siteledger-backup.json"; a.click(); URL.revokeObjectURL(u); } catch (e) { copy(); } };
  const doImport = () => { try { const d = JSON.parse(text); if (!d.sites || !Array.isArray(d.sites)) throw 0; onImport(d); } catch (e) { alert("Could not read that JSON. Paste a valid backup."); } };
  return (
    <Modal onClose={onClose} title="Backup / Import" wide>
      <p className="m-note">Data is saved to the ERP database automatically. Use backup to export or restore a JSON copy.</p>
      <div className="m-actions" style={{ justifyContent: "flex-start", marginTop: 4 }}><button className="primary" onClick={download}><Download size={14} /> Download backup</button><button className="ghost-d" onClick={copy}><Copy size={14} /> Copy to clipboard</button></div>
      <div className="m-divider">Restore / import</div>
      <textarea className="m-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a backup JSON here to restore…" />
      <div className="m-actions"><button className="ghost-d" onClick={onClose}>Close</button><button className="primary" onClick={doImport}><Upload size={14} /> Import &amp; replace</button></div>
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
    :root{--paper:#f8fafc;--surface:#ffffff;--ink:#111827;--ink-soft:#4b5563;--muted:#6b7280;--line:#e5e7eb;--accent:#b91c1c;--accent-soft:#fef2f2;--accent-mid:#dc2626;--profit:#15803d;--loss:#b91c1c;--warn:#d97706;--gold:#b45309;--display:system-ui,-apple-system,sans-serif;--body:system-ui,-apple-system,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,monospace;}
    *{box-sizing:border-box}
    .app{display:flex;min-height:640px;background:var(--paper);color:var(--ink);font-family:var(--body);font-size:14px;}
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
    /* variance table */
    .vtbl td:first-child{color:var(--ink-soft);}
    .vtbl tr.vsec td{background:var(--paper);font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;padding:8px 12px;}
    .vhint{text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted);}
    .vtbl tr.vparent{cursor:pointer;}.vtbl tr.vparent td:first-child{color:var(--ink);display:flex;align-items:center;gap:7px;}
    .vtbl tr.vparent:hover td{background:#f9fafb;}
    .pchev{display:inline-flex;color:var(--muted);}
    .pdot{width:9px;height:9px;border-radius:3px;display:inline-block;flex-shrink:0;}
    .pcount{margin-left:6px;font-family:var(--mono);font-size:10.5px;color:var(--muted);background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:0 7px;}
    .vtbl tr.vchild td:first-child{color:var(--ink-soft);padding-left:34px;font-size:12.5px;}
    .vtbl tr.vchild td{background:rgba(0,0,0,.012);border-bottom:1px solid var(--line);}
    .cbranch{display:inline-block;width:10px;border-left:2px solid var(--line);border-bottom:2px solid var(--line);height:8px;margin-right:8px;vertical-align:middle;}
    .vtbl tr.vtot td{font-weight:700;}.vtbl tr.vtot td:first-child{color:var(--ink);}
    .vtbl tr.vtot.green td{background:#f3f4f6;}
    .vtbl tr.vtot.profit td{background:rgba(22,119,78,.13);color:var(--profit);}.vtbl tr.vtot.loss td{background:rgba(178,63,42,.11);color:var(--loss);}
    .vtbl tr.vmargin td{font-weight:600;border-top:2px solid var(--line);}
    .amort-tag{display:inline-block;margin-left:8px;font-style:normal;font-size:10.5px;color:var(--gold);background:rgba(169,132,43,.12);padding:1px 7px;border-radius:20px;font-family:var(--mono);}
    .back{background:none;border:none;color:var(--accent);display:flex;align-items:center;gap:4px;cursor:pointer;font-family:var(--body);font-size:13px;font-weight:600;margin-bottom:14px;padding:0;}
    .site-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px;}
    .site-head h2{font-family:var(--display);font-size:26px;font-weight:700;margin:0;letter-spacing:-.02em;}
    .site-head p{margin:4px 0 0;color:var(--muted);font-size:13px;}
    .site-head-right{display:flex;align-items:center;gap:10px;}
    .primary{display:inline-flex;align-items:center;gap:7px;background:var(--accent-mid);color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;}
    .primary:hover{background:var(--accent);}.primary.sm{padding:8px 13px;}
    .entry-bar{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:18px;}
    .entry-sel{display:flex;flex-direction:column;gap:4px;}
    .entry-sel label{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;}
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
    `}</style>
  );
}
