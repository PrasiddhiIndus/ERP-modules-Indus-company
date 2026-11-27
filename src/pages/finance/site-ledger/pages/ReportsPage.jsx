/**
 * Reports — one task: build, review and export portfolio / site reports for a period.
 *
 * Extracted verbatim from SiteLedgerApp.jsx. Every report template, filter, calculation
 * (buildReport / buildPortfolioPnlMatrix / aggPairs) and Excel / PDF export is unchanged;
 * all figures come from site-ledger/calculations/siteLedgerCalcs.js. Presentation chrome uses
 * the shared erpUi kit where compatible (grouped / sticky matrix tables keep their legacy markup;
 * legacy report CSS classes still come from the parent `<Styles />` block).
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, History, FileSpreadsheet, FileText, Download, Copy } from "lucide-react";
import { SectionCard, FilterBar, PrimaryButton, SecondaryButton } from "../../../../components/erpUi";
import { PeriodDateSelect } from "../../components/PeriodDateSelect";
import { MultiMonthFilter } from "../../components/MultiMonthFilter";
import { exportReportExcel, exportReportPdf } from "../../lib/reportExport";
import {
  monthLabelOf as periodMonthLabelOf,
  periodAbsoluteIndex as monthIdx,
  periodKeysBetween,
  currentPeriodKey,
  normalizeMonthSelection,
  describeMonthSelection,
} from "../../lib/periods";
import { toast } from "../../../../lib/toast";
import { PARENTS, MONTHS, parentLabel } from "../domain/constants.js";
import { childLabel } from "../domain/siteStructure.js";
import {
  isSiteActive,
  versionLabel,
  estimateFor,
  expectedMonths,
  pendingMonthsFiltered,
} from "../domain/siteLifecycle.js";
import { inr, pct } from "../domain/formatMoney.js";
import { calcSite, estTotals, expenseTree } from "../calculations/siteLedgerCalcs.js";
import { monthLabelOf } from "../components/SiteLedgerShared.jsx";

export const FIN_MEASURES = [
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "expense", label: "Expense", kind: "money" },
  { key: "profit", label: "Profit", kind: "money", profit: true },
  { key: "margin", label: "Margin %", kind: "pct" },
  { key: "estRevenue", label: "Est. Revenue", kind: "money" },
  { key: "estExpense", label: "Est. Expense", kind: "money" },
  { key: "estProfit", label: "Est. Profit", kind: "money" },
  { key: "profitVar", label: "Profit Var", kind: "money", varc: true },
  { key: "profitVarPct", label: "Var %", kind: "vpct", varc: true },
  { key: "revVar", label: "Revenue Var", kind: "money", varc: true },
  { key: "revVarPct", label: "Revenue Var %", kind: "vpct", varc: true },
  { key: "expVar", label: "Expense Var", kind: "money", varc: true, lower: true },
  { key: "expVarPct", label: "Expense Var %", kind: "vpct", varc: true, lower: true },
];
/** Report presets whose period is driven by the multi-month filter. */
export const MULTI_MONTH_PRESETS = new Set(["pnl", "ie", "bva", "under", "exp"]);
export const REPORT_PRESETS = [
  { id: "pnl", name: "Portfolio P&L Summary", desc: "One table: each site's revenue, expense, profit & margin by month, with site and portfolio totals.", cfg: { dim: "site", measures: ["revenue", "expense", "profit", "margin"], scope: "all", periodMode: "multi", filter: "none" } },
  { id: "ie", name: "Income – Expenditure (All Sites)", desc: "Consolidated site-wise income, expenditure & P/L — estimate vs actual with variance.", cfg: { dim: "site", measures: ["estRevenue", "revenue", "revVar", "revVarPct", "estExpense", "expense", "expVar", "expVarPct", "estProfit", "profit", "profitVar", "profitVarPct"], scope: "all", periodMode: "multi", filter: "none", includeEmpty: true } },
  { id: "bva", name: "Budget vs Actual (by site)", desc: "Actual vs estimate — revenue, expense & profit variance per site for the selected months.", cfg: { dim: "site", measures: ["estRevenue", "revenue", "estExpense", "expense", "estProfit", "profit", "profitVar", "profitVarPct", "margin"], scope: "all", periodMode: "multi", filter: "none" } },
  { id: "trend", name: "Monthly Consolidated Trend", desc: "Portfolio revenue, expense & profit month by month.", cfg: { dim: "month", measures: ["revenue", "expense", "profit", "margin"], scope: "all", periodMode: "range", filter: "none" } },
  { id: "exp", name: "Expense Analysis by Head", desc: "Spend by parent head across the portfolio.", cfg: { dim: "parent", measures: [], scope: "all", periodMode: "multi", filter: "none" } },
  { id: "under", name: "Underperforming Sites", desc: "Sites that are loss-making or below their budget.", cfg: { dim: "site", measures: ["profit", "margin", "estProfit", "profitVar"], scope: "all", periodMode: "multi", filter: "belowEst" } },
  { id: "spread", name: "Spread Cost Schedule", desc: "All deferred / spread costs and their monthly recognition.", cfg: { dim: "spread", measures: [], scope: "all", periodMode: "single", filter: "none" } },
  { id: "pending", name: "Data Entry Status", desc: "Which months are still pending for each site.", cfg: { dim: "pending", measures: [], scope: "all", periodMode: "single", filter: "none" } },
];

export function siteTypeLabel(siteOrType) {
  const t = typeof siteOrType === "string" ? siteOrType : siteOrType?.siteType;
  if (t === "shutdown") return "Shutdown";
  if (t === "safety") return "Safety";
  if (t === "fire") return "Fire";
  return "Regular";
}

/*
 * Report calc index: memoizes calcSite / estimate totals per (records snapshot, site object, month).
 * Records and site objects are replaced (not mutated) on edit, so WeakMap identity keys
 * invalidate automatically — filter changes reuse results instead of recomputing every site-month.
 */
const REPORT_CALC_INDEX = new WeakMap();
function cachedCalc(site, mk, records) {
  let bySite = REPORT_CALC_INDEX.get(records);
  if (!bySite) { bySite = new WeakMap(); REPORT_CALC_INDEX.set(records, bySite); }
  let byMonth = bySite.get(site);
  if (!byMonth) { byMonth = new Map(); bySite.set(site, byMonth); }
  let c = byMonth.get(mk);
  if (!c) { c = calcSite(site, mk, records); byMonth.set(mk, c); }
  return c;
}
const REPORT_EST_INDEX = new WeakMap();
function cachedEstTotals(site, mk) {
  // estimateFor() returns the contract's fixed budget (month-independent) → one entry per site object.
  if (!REPORT_EST_INDEX.has(site)) REPORT_EST_INDEX.set(site, estTotals(estimateFor(site, mk)));
  return REPORT_EST_INDEX.get(site);
}

export function aggPairs(pairs, records) {
  let rev = 0, exp = 0, profit = 0, eR = 0, eE = 0, eP = 0, he = false;
  pairs.forEach(([s, mk]) => {
    const c = cachedCalc(s, mk, records); rev += c.revenue; exp += c.expense; profit += c.profit;
    const e = cachedEstTotals(s, mk); if (e) { eR += e.revenue; eE += e.expense; eP += e.profit; he = true; }
  });
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  const profitVar = he ? profit - eP : null;
  const profitVarPct = he && eP !== 0 ? (profit - eP) / Math.abs(eP) * 100 : null;
  const revVar = he ? rev - eR : null;
  const revVarPct = he && eR !== 0 ? (rev - eR) / Math.abs(eR) * 100 : null;
  const expVar = he ? exp - eE : null;
  const expVarPct = he && eE !== 0 ? (exp - eE) / Math.abs(eE) * 100 : null;
  return { rev, exp, profit, margin, estRev: he ? eR : null, estExp: he ? eE : null, estProfit: he ? eP : null, profitVar, profitVarPct, revVar, revVarPct, expVar, expVarPct, he, n: pairs.length };
}

/** `scope`: "all" | siteId | siteId[] — empty array means all. */
export function resolveScopeSites(sites, scope) {
  if (scope == null || scope === "all") return sites;
  if (Array.isArray(scope)) {
    if (!scope.length) return sites;
    const ids = new Set(scope);
    return sites.filter((s) => ids.has(s.id));
  }
  return sites.filter((s) => s.id === scope);
}

export function describeSiteScope(scope, sites, showHistorical) {
  const list = resolveScopeSites(sites, scope);
  if (!Array.isArray(scope) && scope !== "all" && scope != null) {
    return sites.find((s) => s.id === scope)?.name || "1 site";
  }
  if (Array.isArray(scope) && scope.length) {
    if (scope.length === 1) return sites.find((s) => s.id === scope[0])?.name || "1 site";
    return `${scope.length} sites selected`;
  }
  return showHistorical ? `All ${sites.length} site versions` : `All ${sites.length} active sites`;
}

/** Site × month matrix for Portfolio P&L Summary (same calc basis as buildReport / aggPairs). */
export function buildPortfolioPnlMatrix({ sites, records, scope, mks }) {
  const scopeSites = resolveScopeSites(sites, scope);
  const months = normalizeMonthSelection(mks).map((mk) => ({
    mk,
    label: periodMonthLabelOf(mk, MONTHS),
  }));
  const rows = scopeSites.map((s) => {
    const byMonth = months.map(({ mk }) => {
      const has = !!records[`${s.id}__${mk}`];
      return { mk, has, a: has ? aggPairs([[s, mk]], records) : null };
    });
    const pairs = byMonth.filter((m) => m.has).map((m) => [s, m.mk]);
    return {
      id: s.id,
      label: s.name,
      siteType: siteTypeLabel(s),
      inactive: !isSiteActive(s),
      empty: pairs.length === 0,
      byMonth,
      total: aggPairs(pairs, records),
    };
  }).filter((r) => !r.empty);

  const monthTotals = months.map(({ mk }) => {
    const pairs = scopeSites.filter((s) => records[`${s.id}__${mk}`]).map((s) => [s, mk]);
    return { mk, a: aggPairs(pairs, records) };
  });
  const grandPairs = months.flatMap(({ mk }) =>
    scopeSites.filter((s) => records[`${s.id}__${mk}`]).map((s) => [s, mk]),
  );
  return { months, rows, monthTotals, grand: aggPairs(grandPairs, records) };
}

export function portfolioPnlExportGrid(matrix) {
  if (!matrix) return [];
  const metrics = ["Revenue", "Expenses", "Profit", "Margin %"];
  const head = [
    "Site",
    "Site Type",
    ...matrix.months.flatMap((m) => metrics.map((lab) => `${m.label} ${lab}`)),
    ...metrics.map((lab) => `Total ${lab}`),
  ];
  const money = (a, key) => (a ? Math.round(a[key] * 10) / 10 : "");
  const body = matrix.rows.map((r) => [
    r.label,
    r.siteType || "",
    ...r.byMonth.flatMap((m) => [
      m.has ? money(m.a, "rev") : "",
      m.has ? money(m.a, "exp") : "",
      m.has ? money(m.a, "profit") : "",
      m.has ? Math.round(m.a.margin * 10) / 10 : "",
    ]),
    money(r.total, "rev"),
    money(r.total, "exp"),
    money(r.total, "profit"),
    Math.round(r.total.margin * 10) / 10,
  ]);
  const tot = [
    "Portfolio total",
    "",
    ...matrix.monthTotals.flatMap((m) => [
      money(m.a, "rev"),
      money(m.a, "exp"),
      money(m.a, "profit"),
      Math.round(m.a.margin * 10) / 10,
    ]),
    money(matrix.grand, "rev"),
    money(matrix.grand, "exp"),
    money(matrix.grand, "profit"),
    Math.round(matrix.grand.margin * 10) / 10,
  ];
  return [head, ...body, tot];
}
export function measureCell(key, a) {
  const m = FIN_MEASURES.find((x) => x.key === key);
  let raw = null;
  if (key === "revenue") raw = a.rev; else if (key === "expense") raw = a.exp; else if (key === "profit") raw = a.profit;
  else if (key === "margin") raw = a.margin; else if (key === "estRevenue") raw = a.estRev; else if (key === "estExpense") raw = a.estExp;
  else if (key === "estProfit") raw = a.estProfit; else if (key === "profitVar") raw = a.profitVar; else if (key === "profitVarPct") raw = a.profitVarPct;
  else if (key === "revVar") raw = a.revVar; else if (key === "revVarPct") raw = a.revVarPct;
  else if (key === "expVar") raw = a.expVar; else if (key === "expVarPct") raw = a.expVarPct;
  let text, color = null, fav = null;
  if (raw == null) text = "—";
  else if (m.kind === "money") text = m.varc ? `${raw >= 0 ? "+" : ""}${inr(raw)}` : inr(raw);
  else if (m.kind === "pct") text = pct(raw);
  else if (m.kind === "vpct") text = `${raw >= 0 ? "+" : ""}${raw.toFixed(1)}%`;
  if (m.profit && raw != null) color = raw >= 0 ? "var(--profit)" : "var(--loss)";
  if (m.varc) {
    // Expense variance: lower is better. Revenue/profit variance: higher is better.
    fav = raw == null || Math.round(raw) === 0 ? null : m.lower ? raw < 0 : raw > 0;
    color = raw == null ? "var(--muted)" : fav == null ? "var(--ink-soft)" : fav ? "var(--profit)" : "var(--loss)";
  }
  return { raw: raw == null ? "" : Math.round(raw * 10) / 10, text, color, fav };
}
export function aggHeads(sites, mks, records, level) {
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

export function buildReport(cfg) {
  const { sites, records, dim, measures, scope, periodMode, month, from, to, filter, expandPendingHistory, selMonths, includeEmpty } = cfg;
  const scopeSites = resolveScopeSites(sites, scope);
  // Multi-month: every selected month is counted exactly once (normalized → de-duplicated + sorted).
  let mks;
  if (periodMode === "multi") mks = normalizeMonthSelection(selMonths);
  else if (periodMode === "single") mks = [month];
  else mks = periodKeysBetween(from, to);
  const reported = (s, mk) => !!records[`${s.id}__${mk}`];

  if (dim === "pending") {
    const cols = ["Site", "Site Type", "Contract", "Expected", "Filled", "Pending", `Pending periods (to ${monthLabelOf(month)})`];
    const rows = scopeSites.map((s) => {
      const exp = expectedMonths(s, month);
      const pend = pendingMonthsFiltered(s, records, month, { expandHistory: expandPendingHistory });
      return [s.name, siteTypeLabel(s), s.contractStart ? `${monthLabelOf(s.contractStart)}–${monthLabelOf(s.contractEnd)}` : "—", exp.length, exp.length - pend.length, pend.length, pend.map(monthLabelOf).join(", ") || "—"];
    }).sort((a, b) => b[5] - a[5]);
    return { kind: "pending", cols, rows };
  }

  if (dim === "spread") {
    const cols = ["Site", "Site Type", "Head", "Note", "Total", "From", "Months", "Per month", `State @ ${monthLabelOf(month)}`];
    const rows = [];
    scopeSites.forEach((s) => (s.spreads || []).forEach((sp) => {
      const si = monthIdx(sp.start), state = monthIdx(month) < si ? "upcoming" : monthIdx(month) < si + Number(sp.months) ? "active" : "ended";
      rows.push([s.name, siteTypeLabel(s), childLabel(s, sp.head), sp.note || "", sp.total, monthLabelOf(sp.start), sp.months, Math.round(sp.total / sp.months), state]);
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
    return { kind: "head", columns, rows, totals, showSiteType: false };
  }

  // dim === site | month  → financial
  const columns = measures.map((k) => FIN_MEASURES.find((m) => m.key === k)).filter(Boolean);
  let entities;
  if (dim === "site") {
    entities = scopeSites.map((s) => ({
      id: s.id,
      label: s.name,
      siteType: siteTypeLabel(s),
      inactive: !isSiteActive(s),
      pairs: mks.filter((mk) => reported(s, mk)).map((mk) => [s, mk]),
    })).filter((e) => includeEmpty || e.pairs.length);
  } else {
    entities = mks.map((mk) => ({
      id: mk,
      label: monthLabelOf(mk),
      siteType: "",
      pairs: scopeSites.filter((s) => reported(s, mk)).map((s) => [s, mk]),
    })).filter((e) => e.pairs.length);
  }
  let rows = entities.map((e) => {
    const a = aggPairs(e.pairs, records);
    return {
      id: e.id,
      label: e.label,
      siteType: e.siteType,
      inactive: !!e.inactive,
      empty: !e.pairs.length,
      below: a.he && a.profit < a.estProfit,
      a,
      cells: columns.map((m) => measureCell(m.key, a)),
    };
  });
  if (filter === "loss") rows = rows.filter((r) => r.a.profit < 0);
  else if (filter === "belowEst") rows = rows.filter((r) => r.a.he && r.a.profit < r.a.estProfit);
  const allPairs = entities.flatMap((e) => e.pairs);
  const tA = aggPairs(allPairs, records);
  const totals = { label: dim === "site" ? "Portfolio total" : "Total", siteType: "", a: tA, cells: columns.map((m) => measureCell(m.key, tA)) };
  return { kind: "fin", columns, rows, totals, showSiteType: dim === "site", mks };
}

export function Reports({ sites, sitesAll, records, parents, defaultMonth, showHistorical, setShowHistorical, onViewSite }) {
  const activeMks = useMemo(() => {
    const have = new Set();
    Object.keys(records).forEach((k) => have.add(k.split("__")[1]));
    return MONTHS.filter((m) => have.has(m.key));
  }, [records]);
  const dataKeys = useMemo(() => new Set(activeMks.map((m) => m.key)), [activeMks]);
  const fM = activeMks[0]?.key || defaultMonth;
  const lM = activeMks[activeMks.length - 1]?.key || defaultMonth;
  const [tab, setTab] = useState("standard");
  const [dim, setDim] = useState("site");
  const [measures, setMeasures] = useState(["revenue", "expense", "profit", "margin"]);
  const [scope, setScope] = useState("all"); // "all" | siteId | siteId[]
  const [periodMode, setPeriodMode] = useState("multi");
  const [month, setMonth] = useState(defaultMonth);
  const [selMonths, setSelMonths] = useState(() => [defaultMonth || currentPeriodKey()]);
  const [breakdown, setBreakdown] = useState("combined");
  const [from, setFrom] = useState(fM);
  const [to, setTo] = useState(lM);
  const [filter, setFilter] = useState("none");
  const [title, setTitle] = useState("Portfolio P&L Summary");
  const [activePreset, setActivePreset] = useState("pnl");
  const [expandPendingHistory, setExpandPendingHistory] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [siteQuery, setSiteQuery] = useState("");
  const sitePickerRef = useRef(null);

  useEffect(() => { setMonth(defaultMonth || currentPeriodKey()); }, [defaultMonth]);

  useEffect(() => {
    if (!sitePickerOpen) return undefined;
    const onDoc = (e) => {
      if (sitePickerRef.current && !sitePickerRef.current.contains(e.target)) setSitePickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [sitePickerOpen]);

  const choose = (p) => {
    setActivePreset(p.id);
    setDim(p.cfg.dim);
    setMeasures(p.cfg.measures.length ? p.cfg.measures : ["revenue", "expense", "profit", "margin"]);
    setScope(p.cfg.scope);
    setPeriodMode(p.cfg.periodMode);
    setFilter(p.cfg.filter);
    setTitle(p.name);
    setBreakdown("combined");
    setSitePickerOpen(false);
    if (p.cfg.periodMode === "single" && p.cfg.dim !== "month") setMonth(defaultMonth);
    if (p.cfg.dim === "month") { setFrom(fM); setTo(lM); }
  };

  const setDimMode = (k) => {
    setDim(k);
    setActivePreset(null);
    setTitle("Custom Report");
    if (k === "spread" || k === "pending") setBreakdown("combined");
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

  const isAsOf = dim === "spread" || dim === "pending";
  const isMulti = periodMode === "multi" && !isAsOf;
  const sel = useMemo(() => normalizeMonthSelection(selMonths), [selMonths]);
  const monthwise = isMulti && dim === "site" && breakdown === "monthwise";
  const noMonths = isMulti && sel.length === 0;
  const isIe = activePreset === "ie";

  const report = useMemo(
    () => buildReport({
      sites,
      records,
      dim: monthwise ? "month" : dim,
      measures,
      scope,
      periodMode,
      month,
      from,
      to,
      filter: monthwise ? "none" : filter,
      expandPendingHistory,
      selMonths: sel,
      includeEmpty: isIe,
    }),
    [sites, records, dim, monthwise, measures, scope, periodMode, month, from, to, filter, expandPendingHistory, sel, isIe, parents],
  );
  const reportDim = monthwise ? "month" : dim;

  const periodText = isAsOf
    ? `as of ${monthLabelOf(month)}`
    : isMulti
      ? `${describeMonthSelection(sel)}${sel.length > 1 ? ` (${sel.length} months${activePreset === "pnl" ? ", site × month" : monthwise ? ", month-wise" : ", combined"})` : ""}`
      : periodMode === "range"
        ? `${monthLabelOf(from)} – ${monthLabelOf(to)}`
        : monthLabelOf(month);
  const scopeText = describeSiteScope(scope, sites, showHistorical);
  const inactiveSites = useMemo(() => (sitesAll || sites).filter((s) => !isSiteActive(s)), [sitesAll, sites]);
  // Always show the portfolio / period total row so single-month picks still show totals.
  const showTotals = true;
  const isPnl = activePreset === "pnl";
  const selectedSiteIds = useMemo(() => {
    if (scope === "all" || scope == null) return [];
    if (Array.isArray(scope)) return scope;
    return [scope];
  }, [scope]);
  const allSitesSelected = selectedSiteIds.length === 0;
  const sitePickerList = useMemo(() => {
    const q = siteQuery.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) => `${s.name} ${versionLabel(s)} ${s.siteType || ""}`.toLowerCase().includes(q));
  }, [sites, siteQuery]);
  const pnlMatrix = useMemo(() => {
    if (!isPnl || !sel.length) return null;
    return buildPortfolioPnlMatrix({ sites, records, scope, mks: sel });
  }, [isPnl, sites, records, scope, sel]);

  const markCustomSitesIfBuilder = () => {
    if (tab === "custom") {
      setActivePreset(null);
      setTitle("Custom Report");
    }
  };
  const toggleSiteId = (id) => {
    markCustomSitesIfBuilder();
    setScope((prev) => {
      const cur = prev === "all" || prev == null ? [] : Array.isArray(prev) ? [...prev] : [prev];
      if (!cur.length) {
        // Was "all" — start from all ids then uncheck this one
        return sites.map((s) => s.id).filter((x) => x !== id);
      }
      if (cur.includes(id)) {
        const next = cur.filter((x) => x !== id);
        return next.length ? next : cur; // keep at least one site selected
      }
      const next = [...cur, id];
      return next.length >= sites.length ? "all" : next;
    });
  };
  const selectAllSites = () => {
    markCustomSitesIfBuilder();
    setScope("all");
  };

  const grid = useMemo(() => {
    if (pnlMatrix) return portfolioPnlExportGrid(pnlMatrix);
    if (report.cols) return [report.cols, ...report.rows];
    const withSiteType = !!report.showSiteType;
    const firstLabel = report.kind === "head" ? "Expense head" : reportDim === "month" ? "Month" : "Site";
    const head = withSiteType
      ? [firstLabel, "Site Type", ...report.columns.map((c) => c.label)]
      : [firstLabel, ...report.columns.map((c) => c.label)];
    const body = report.rows.map((r) => {
      const label = r.empty ? `${r.label} (no entries)` : r.label;
      return withSiteType
        ? [label, r.siteType || "", ...r.cells.map((c) => c.raw)]
        : [label, ...r.cells.map((c) => c.raw)];
    });
    if (!showTotals) return [head, ...body];
    const tot = withSiteType
      ? [report.totals.label, "", ...report.totals.cells.map((c) => c.raw)]
      : [report.totals.label, ...report.totals.cells.map((c) => c.raw)];
    return [head, ...body, tot];
  }, [report, showTotals, reportDim, pnlMatrix]);

  const csv = useMemo(
    () => grid.map((row) => row.map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n"),
    [grid],
  );
  const fileBase = `${title.replace(/[^a-z0-9]+/gi, "_")}_${periodText.replace(/[^a-z0-9]+/gi, "_")}`.slice(0, 120);
  const copyCsv = () => navigator.clipboard?.writeText(csv);
  const downloadCsv = () => {
    try {
      const b = new Blob([csv], { type: "text/csv" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = `${fileBase}.csv`;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      copyCsv();
    }
  };

  /** Export payload with every active filter written into the header lines. */
  const exportPayload = () => {
    const filterLabel = filter === "belowEst" ? "Below estimate only" : filter === "loss" ? "Loss-making only" : null;
    const meta = [
      `Sites: ${scopeText}`,
      `Period: ${periodText}`,
      ...(isMulti && sel.length > 1 ? [`Months: ${sel.map((k) => periodMonthLabelOf(k, MONTHS)).join(", ")}`] : []),
      ...(filterLabel && !monthwise && !isPnl ? [`Filter: ${filterLabel}`] : []),
      ...(isPnl
        ? ["Site × month Revenue / Expenses / Profit / Margin. Totals use the same basis as Site Ledger."]
        : report.kind === "fin"
          ? ["Estimates are counted only for months that have actual entries (same basis as Site Ledger)."]
          : []),
    ];
    const hasTotals = !!pnlMatrix || (showTotals && !report.cols);
    const head = [grid[0]];
    const body = hasTotals ? grid.slice(1, -1) : grid.slice(1);
    const foot = hasTotals ? grid[grid.length - 1] : undefined;
    const offset = report.showSiteType ? 2 : 1;
    const green = [21, 128, 61];
    const red = [185, 28, 28];
    const colorFor = !pnlMatrix && report.kind === "fin"
      ? (ri, ci) => {
        const cell = report.rows[ri]?.cells[ci - offset];
        if (!cell) return null;
        if (cell.fav === true) return green;
        if (cell.fav === false) return red;
        return null;
      }
      : null;
    return { title, meta, head, body, foot, fileBase, colorFor };
  };
  const runExport = async (kind) => {
    if (exporting) return;
    setExporting(kind);
    try {
      const payload = exportPayload();
      if (kind === "xlsx") await exportReportExcel(payload);
      else await exportReportPdf(payload);
    } catch (e) {
      (toast.error || toast.warning)("Export failed", String(e?.message || e));
    } finally {
      setExporting(null);
    }
  };

  const downloadSiteTypeCsv = (siteType, reportName) => {
    const typedSites = sites.filter((s) => s.siteType === siteType);
    const typedGrid = isPnl
      ? portfolioPnlExportGrid(buildPortfolioPnlMatrix({ sites: typedSites, records, scope: "all", mks: sel }))
      : (() => {
        const typedReport = buildReport({
          sites: typedSites,
          records,
          dim: "site",
          measures: ["revenue", "expense", "profit", "margin"],
          scope: "all",
          periodMode: isMulti ? "multi" : "single",
          month,
          from,
          to,
          filter: "none",
          expandPendingHistory: false,
          selMonths: sel,
        });
        const head = ["Site", "Site Type", ...typedReport.columns.map((c) => c.label)];
        const body = typedReport.rows.map((r) => [r.label, r.siteType || siteTypeLabel(siteType), ...r.cells.map((c) => c.raw)]);
        const tot = [typedReport.totals.label, "", ...typedReport.totals.cells.map((c) => c.raw)];
        return [head, ...body, tot];
      })();
    const typedCsv = typedGrid.map((row) => row.map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const periodPart = isMulti ? describeMonthSelection(sel) : monthLabelOf(month);
    const typedFileName = `${reportName.replace(/[^a-z0-9]+/gi, "_")}_${periodPart.replace(/[^a-z0-9]+/gi, "_")}.csv`;
    try {
      const b = new Blob([typedCsv], { type: "text/csv" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = typedFileName;
      a.click();
      URL.revokeObjectURL(u);
    } catch {
      navigator.clipboard?.writeText(typedCsv);
    }
  };

  const openSite = (id) => {
    if (!onViewSite || !id) return;
    onViewSite(id, isMulti && sel.length ? { from: sel[0], to: sel[sel.length - 1] } : null);
  };

  const dims = [
    { k: "site", l: "By Site" },
    { k: "month", l: "By Month" },
    { k: "parent", l: "By Parent Head" },
    { k: "child", l: "By Cost Line" },
    { k: "spread", l: "Spread Schedule" },
    { k: "pending", l: "Data Status" },
  ];

  const sitesSelect = (
    <div className="ov-filter site-ms" ref={sitePickerRef}>
      <span>Sites</span>
      <button
        type="button"
        className={"site-ms-btn" + (sitePickerOpen ? " open" : "")}
        aria-haspopup="listbox"
        aria-expanded={sitePickerOpen}
        onClick={() => setSitePickerOpen((o) => !o)}
      >
        <span className="site-ms-label">{allSitesSelected ? (showHistorical ? "All site versions" : "All active sites") : scopeText}</span>
        <ChevronDown size={14} />
      </button>
      {sitePickerOpen && (
        <div className="site-ms-panel" role="listbox" aria-multiselectable="true">
          <div className="site-ms-tools">
            <input
              type="search"
              className="site-ms-search"
              placeholder="Search sites…"
              value={siteQuery}
              onChange={(e) => setSiteQuery(e.target.value)}
              autoFocus
            />
            <button type="button" className="site-ms-link" onClick={selectAllSites}>Select all</button>
          </div>
                          <label className={"site-ms-row site-ms-all" + (allSitesSelected ? " on" : "")}>
            <input
              type="checkbox"
              checked={allSitesSelected}
              onChange={(e) => {
                if (e.target.checked) selectAllSites();
                else if (sites[0]) {
                  markCustomSitesIfBuilder();
                  setScope([sites[0].id]);
                }
              }}
            />
            <span>{showHistorical ? "All site versions" : "All active sites"}</span>
            <span className="muted-s">{sites.length}</span>
          </label>
          <div className="site-ms-list">
            {sitePickerList.length === 0 ? (
              <div className="site-ms-empty">No sites match.</div>
            ) : sitePickerList.map((s) => {
              const checked = allSitesSelected || selectedSiteIds.includes(s.id);
              return (
                <label key={s.id} className={"site-ms-row" + (checked ? " on" : "")}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSiteId(s.id)}
                  />
                  <span className="site-ms-name" title={s.name}>
                    {s.name}
                    <small> · {versionLabel(s)}{!isSiteActive(s) ? " · inactive" : ""}</small>
                  </span>
                  <span className="muted-s">{siteTypeLabel(s)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const breakdownToggle = isMulti && dim === "site" && (
    <label className="ov-filter">
      <span>View</span>
      <div className="seg">
        <button type="button" className={"seg-b" + (breakdown === "combined" ? " on" : "")} onClick={() => setBreakdown("combined")}>Combined</button>
        <button type="button" className={"seg-b" + (breakdown === "monthwise" ? " on" : "")} onClick={() => setBreakdown("monthwise")}>Month-wise</button>
      </div>
    </label>
  );

  // Standard reports: FY + date range only (no month-chip strip). Custom builder keeps chips.
  const multiMonthBlock = (
    <div className="ov-filter-full">
      <MultiMonthFilter value={sel} onChange={setSelMonths} dataKeys={dataKeys} showMonths={false} />
    </div>
  );
  const customMultiMonthBlock = (
    <div className="ov-filter-full">
      <MultiMonthFilter value={sel} onChange={setSelMonths} dataKeys={dataKeys} showMonths />
    </div>
  );

  const stdFilterBar = MULTI_MONTH_PRESETS.has(activePreset) && (
    <div className="rep-filterbar-wrap"><FilterBar>
      {sitesSelect}
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
      {(activePreset === "ie" || activePreset === "bva") && (
        <label className="ov-filter">
          <span>Show only</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="none">All sites</option>
            <option value="belowEst">Below estimate</option>
            <option value="loss">Loss-making</option>
          </select>
        </label>
      )}
      {!isPnl && breakdownToggle}
      {multiMonthBlock}
    </FilterBar></div>
  );

  const trendFilterBar = activePreset === "trend" && (
    <div className="rep-filterbar-wrap"><FilterBar>
      <label className="ov-filter range">
        <span>Range</span>
        <div className="ov-range">
          <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={from} onChange={setFrom} showFormattedHint={false} />
          <span>–</span>
          <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={to} onChange={setTo} showFormattedHint={false} />
        </div>
      </label>
    </FilterBar></div>
  );

  const showSummary = report.kind === "fin" && !noMonths && (isIe || activePreset === "bva" || activePreset === "under");

  return (
    <>
      <style>{`
        .rep-filterbar-wrap{margin-bottom:14px;}
        .sl-rep-card-flush .erp-card-body{padding:0;}
      `}</style>
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
        <div className="rep-filterbar-wrap"><FilterBar>
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
        </FilterBar></div>
      )}
      {activePreset === "spread" && (
        <div className="rep-filterbar-wrap"><FilterBar>
          <label className="ov-filter">
            <span>As of month</span>
            <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={month} onChange={setMonth} />
          </label>
        </FilterBar></div>
      )}
        </>
      )}

      {tab === "custom" && (
        <SectionCard title="Build a report" right={<span className="muted-s">choose what to show — the table updates live</span>}>
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
              {sitesSelect}
              {isAsOf ? (
                <label className="ov-filter">
                  <span>As of month</span>
                  <PeriodDateSelect className="ov-period-pick" inputClassName="ov-period-sel" value={month} onChange={setMonth} />
                </label>
              ) : (
                <>
                  <label className="ov-filter">
                    <span>Period</span>
                    <select value={periodMode === "single" ? "multi" : periodMode} onChange={(e) => setPeriodMode(e.target.value)}>
                      <option value="multi">Selected months</option>
                      <option value="range">Month range</option>
                    </select>
                  </label>
                  {periodMode === "range" && (
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
              {breakdownToggle}
              {isMulti && customMultiMonthBlock}
            </div>
          </div>
        </SectionCard>
      )}

      <p className="ov-meta">{scopeText} · {periodText}</p>

      {showSummary && <ReportSummary report={report} monthwise={monthwise} />}

      <SectionCard
        title={title}
        className="sl-rep-card-flush"
        right={(
          <span className="muted-s rep-actions">
            <PrimaryButton onClick={() => runExport("xlsx")} disabled={!!exporting || noMonths}>
              <FileSpreadsheet size={12} style={{ verticalAlign: "-2px" }} /> {exporting === "xlsx" ? "Exporting…" : "Excel"}
            </PrimaryButton>
            <SecondaryButton onClick={() => runExport("pdf")} disabled={!!exporting || noMonths}>
              <FileText size={12} style={{ verticalAlign: "-2px" }} /> {exporting === "pdf" ? "Exporting…" : "PDF"}
            </SecondaryButton>
            <button type="button" className="link" onClick={downloadCsv}><Download size={12} style={{ verticalAlign: "-2px" }} /> CSV</button>
            <button type="button" className="link" onClick={copyCsv}><Copy size={12} style={{ verticalAlign: "-2px" }} /> Copy</button>
            <button type="button" className="link" onClick={() => downloadSiteTypeCsv("shutdown", "Shutdown_Sites_Report")}>
              <Download size={12} style={{ verticalAlign: "-2px" }} /> Shutdown CSV
            </button>
            <button type="button" className="link" onClick={() => downloadSiteTypeCsv("safety", "Safety_Sites_Report")}>
              <Download size={12} style={{ verticalAlign: "-2px" }} /> Safety CSV
            </button>
          </span>
        )}
      >
        {noMonths ? (
          <div className="chart-empty">Select at least one month to build this report.</div>
        ) : isPnl && pnlMatrix ? (
          <PortfolioPnlTable matrix={pnlMatrix} onOpenSite={openSite} />
        ) : isIe ? (
          <IeReportTable report={report} dim={reportDim} onOpenSite={reportDim === "site" ? openSite : null} />
        ) : (
          <ReportTable
            report={report}
            showTotals={showTotals}
            dim={reportDim}
            highlightBelow={activePreset === "bva" || activePreset === "under"}
            onOpenSite={reportDim === "site" ? openSite : null}
          />
        )}
      </SectionCard>
      {(isPnl || report.kind === "fin") && !noMonths && (
        <p className="rep-foot muted-s">
          {isPnl
            ? "Each selected month is counted once. Site totals and the Portfolio total use the same figures as Site Ledger for those months."
            : "Estimates are summed only for months with actual entries, using the estimate version in force each month. Each selected month is counted once."}
          {isIe && " Sites with no entries in the selected months are listed with zero actuals."}
        </p>
      )}
    </>
  );
}

function pnlMoneyCell(a, key) {
  if (!a) return { text: "—", color: "var(--muted)", raw: "" };
  const n = a[key];
  const color = key === "profit" ? (n >= 0 ? "var(--profit)" : "var(--loss)") : undefined;
  return { text: inr(n), color, raw: Math.round(n * 10) / 10 };
}
function pnlMarginCell(a) {
  if (!a) return { text: "—", color: "var(--muted)", raw: "" };
  return { text: pct(a.margin), color: undefined, raw: Math.round(a.margin * 10) / 10 };
}

/** Unified Portfolio P&L: sites × months (Rev / Exp / Profit / Margin) + site totals + portfolio total. */
function PortfolioPnlTable({ matrix, onOpenSite }) {
  if (!matrix?.rows?.length) {
    return <div className="chart-empty">No data for this selection. Try a different month or scope.</div>;
  }
  const { months, rows, monthTotals, grand } = matrix;
  const metricLabs = ["Rev", "Exp", "Profit", "Mar%"];
  const blockCells = (a) => [
    pnlMoneyCell(a, "rev"),
    pnlMoneyCell(a, "exp"),
    pnlMoneyCell(a, "profit"),
    pnlMarginCell(a),
  ];
  return (
    <div className="pnl-matrix-wrap">
      <table className="tbl pnl-matrix erp-table-exempt">
        <thead>
          <tr className="pnl-g">
            <th rowSpan={2} className="pnl-sticky pnl-sticky-site">Site</th>
            <th rowSpan={2} className="pnl-sticky pnl-sticky-type">Type</th>
            {months.map((m) => (
              <th key={m.mk} colSpan={4} className="c pnl-gh">{m.label}</th>
            ))}
            <th colSpan={4} className="c pnl-gh pnl-total-h">Total</th>
          </tr>
          <tr>
            {months.flatMap((m) => metricLabs.map((lab) => (
              <th key={`${m.mk}-${lab}`} className="r pnl-sub">{lab}</th>
            )))}
            {metricLabs.map((lab) => (
              <th key={`tot-${lab}`} className="r pnl-sub pnl-total-h">{lab}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="strong pnl-sticky pnl-sticky-site">
                {onOpenSite ? (
                  <button type="button" className="ie-site" onClick={() => onOpenSite(r.id)} title="Open site P&L">{r.label}</button>
                ) : r.label}
                {r.inactive && <span className="ie-tag">Inactive</span>}
              </td>
              <td className="muted-s pnl-sticky pnl-sticky-type">{r.siteType || "—"}</td>
              {r.byMonth.flatMap((m) => blockCells(m.has ? m.a : null).map((c, i) => (
                <td key={`${r.id}-${m.mk}-${i}`} className={"r mono" + (i === 0 ? " pnl-gs" : "")} style={{ color: c.color }}>{c.text}</td>
              )))}
              {blockCells(r.total).map((c, i) => (
                <td key={`${r.id}-tot-${i}`} className={"r mono pnl-total-c" + (i === 0 ? " pnl-gs" : "")} style={{ color: c.color }}>{c.text}</td>
              ))}
            </tr>
          ))}
          <tr className="vtot green">
            <td className="pnl-sticky pnl-sticky-site">Portfolio total</td>
            <td className="pnl-sticky pnl-sticky-type" />
            {monthTotals.flatMap((m) => blockCells(m.a).map((c, i) => (
              <td key={`pt-${m.mk}-${i}`} className={"r mono" + (i === 0 ? " pnl-gs" : "")} style={{ color: c.color }}>{c.text}</td>
            )))}
            {blockCells(grand).map((c, i) => (
              <td key={`pt-tot-${i}`} className={"r mono pnl-total-c" + (i === 0 ? " pnl-gs" : "")} style={{ color: c.color }}>{c.text}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Compact KPI strip: portfolio Estimate vs Actual for income, expenditure and P/L over the selected months. */
function ReportSummary({ report, monthwise }) {
  const a = report.totals?.a;
  if (!a) return null;
  const siteRows = monthwise ? [] : report.rows;
  const withEst = siteRows.filter((r) => r.a.he);
  const below = withEst.filter((r) => r.below).length;
  const loss = siteRows.filter((r) => !r.empty && r.a.profit < 0).length;
  const card = (label, actual, est, v, vp, lower) => {
    const fav = v == null || Math.round(v) === 0 ? null : lower ? v < 0 : v > 0;
    return (
      <div className="rs-card">
        <div className="rs-l">{label}</div>
        <div className="rs-v">{inr(actual)}</div>
        <div className="rs-s">
          Est {est == null ? "—" : inr(est)}
          {v != null && (
            <span className={"rs-var " + (fav == null ? "" : fav ? "pos" : "neg")}>
              {v >= 0 ? "+" : ""}{inr(v)}{vp != null ? ` (${vp >= 0 ? "+" : ""}${vp.toFixed(1)}%)` : ""}
            </span>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="rs-strip">
      {card("Income", a.rev, a.estRev, a.revVar, a.revVarPct, false)}
      {card("Expenditure", a.exp, a.estExp, a.expVar, a.expVarPct, true)}
      {card(a.profit >= 0 ? "Profit" : "Loss", a.profit, a.estProfit, a.profitVar, a.profitVarPct, false)}
      <div className="rs-card">
        <div className="rs-l">Margin</div>
        <div className="rs-v" style={{ color: a.profit >= 0 ? "var(--profit)" : "var(--loss)" }}>{pct(a.margin)}</div>
        <div className="rs-s">Est {a.estRev ? pct(a.estRev > 0 ? (a.estProfit / a.estRev) * 100 : 0) : "—"}</div>
      </div>
      {!monthwise && (
        <div className={"rs-card" + (below ? " warn" : "")}>
          <div className="rs-l">Below estimate</div>
          <div className="rs-v">{below}<small> / {withEst.length}</small></div>
          <div className="rs-s">{loss} loss-making site{loss === 1 ? "" : "s"}</div>
        </div>
      )}
    </div>
  );
}

/** Income – Expenditure grouped table: Income | Expenditure | Profit/Loss, each Est · Actual · Var · Var %. */
function IeReportTable({ report, dim, onOpenSite }) {
  if (!report.rows.length) return <div className="chart-empty">No sites match this selection.</div>;
  const isSite = dim === "site";
  const groups = [
    { label: "Income", from: 0 },
    { label: "Expenditure", from: 4 },
    { label: "Profit / Loss", from: 8 },
  ];
  const sub = ["Estimate", "Actual", "Variance", "Var %"];
  const cellsOf = (r) => r.cells;
  return (
    <div className="ie-wrap">
      <table className="tbl tbl-ie">
        <thead>
          <tr className="ie-g">
            <th rowSpan={2} className="ie-sticky">{isSite ? "Site" : "Month"}</th>
            {isSite && <th rowSpan={2}>Type</th>}
            {groups.map((g) => <th key={g.label} colSpan={4} className="c ie-gh">{g.label}</th>)}
            {isSite && onOpenSite && <th rowSpan={2} />}
          </tr>
          <tr>
            {groups.flatMap((g) => sub.map((s) => <th key={g.label + s} className={"r" + (s === "Estimate" ? " ie-gs" : "")}>{s}</th>))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.id || r.label} className={(r.below ? "row-below " : "") + (r.empty ? "row-empty" : "")}>
              <td className="strong ie-sticky">
                {isSite && onOpenSite ? (
                  <button type="button" className="ie-site" onClick={() => onOpenSite(r.id)} title="Open site Income – Expenditure statement">{r.label}</button>
                ) : r.label}
                {r.empty && <span className="ie-tag">No entries</span>}
                {r.below && <span className="ie-tag warn">Below est.</span>}
                {r.inactive && <span className="ie-tag">Inactive</span>}
              </td>
              {isSite && <td className="muted-s">{r.siteType || "—"}</td>}
              {cellsOf(r).map((c, ci) => (
                <td key={ci} className={"r mono" + (ci % 4 === 0 ? " ie-gs muted-s" : "")} style={{ color: ci % 4 === 0 ? undefined : c.color || undefined }}>{c.text}</td>
              ))}
              {isSite && onOpenSite && (
                <td className="r"><button type="button" className="link" onClick={() => onOpenSite(r.id)}>Open →</button></td>
              )}
            </tr>
          ))}
          <tr className="vtot green">
            <td className="ie-sticky">{report.totals.label}</td>
            {isSite && <td />}
            {report.totals.cells.map((c, ci) => (
              <td key={ci} className={"r mono" + (ci % 4 === 0 ? " ie-gs" : "")} style={{ color: c.color || undefined }}>{c.text}</td>
            ))}
            {isSite && onOpenSite && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ReportTable({ report, showTotals = true, dim, highlightBelow = false, onOpenSite = null }) {
  if (report.kind === "pending") {
    if (report.rows.length === 0) return <div className="chart-empty">No sites to report.</div>;
    return (
      <table className="tbl">
        <thead>
          <tr>{report.cols.map((c, i) => <th key={i} className={i >= 3 && i <= 5 ? "r" : ""}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((r, ri) => (
            <tr key={ri} className={r[5] > 0 ? "row-pending" : ""}>
              <td className="strong">{r[0]}</td>
              <td className="muted-s">{r[1]}</td>
              <td className="muted-s mono">{r[2]}</td>
              <td className="r mono">{r[3]}</td>
              <td className="r mono" style={{ color: "var(--profit)" }}>{r[4]}</td>
              <td className="r mono" style={{ color: r[5] > 0 ? "var(--warn)" : "var(--muted)", fontWeight: r[5] > 0 ? 700 : 400 }}>{r[5]}</td>
              <td className="muted-s">{r[6]}</td>
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
          <tr>{report.cols.map((c, i) => <th key={i} className={i >= 4 && i <= 7 ? "r" : ""}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, ci) => (
                <td key={ci} className={(ci >= 4 && ci <= 7 ? "r mono" : "") + (ci === 8 ? " " : "")}>
                  {ci === 4 || ci === 7 ? inr(v) : ci === 8 ? <span className={"pill " + (v === "active" ? "pill-ok" : v === "upcoming" ? "pill-watch" : "pill-warn")}>{v}</span> : String(v)}
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
  const showSiteType = !!report.showSiteType;

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>{rowLabel}</th>
          {showSiteType && <th>Site Type</th>}
          {report.columns.map((c, i) => <th key={i} className="r">{report.kind === "fin" ? c.label.toUpperCase() : c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {report.rows.map((r, ri) => (
          <tr key={ri} className={highlightBelow && r.below ? "row-below" : ""}>
            <td className="strong">
              {r.color && <span className="pdot" style={{ background: r.color }} />}
              {onOpenSite && report.kind === "fin" && r.id ? (
                <button type="button" className="ie-site" onClick={() => onOpenSite(r.id)} title="Open site Income – Expenditure statement">{r.label}</button>
              ) : r.label}
              {highlightBelow && r.below && <span className="ie-tag warn">Below est.</span>}
            </td>
            {showSiteType && <td className="muted-s">{r.siteType || "—"}</td>}
            {r.cells.map((c, ci) => (
              <td key={ci} className="r mono" style={{ color: c.color || undefined }}>{c.text}</td>
            ))}
          </tr>
        ))}
        {showTotals && (
          <tr className="vtot green">
            <td>{report.totals.label}</td>
            {showSiteType && <td />}
            {report.totals.cells.map((c, ci) => (
              <td key={ci} className="r mono" style={{ color: c.color || undefined }}>{c.text}</td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default Reports;
