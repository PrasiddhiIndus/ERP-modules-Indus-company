import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fetchCommercialPOs, fetchInvoices } from "../services/billingApi";
import { getCommercialPOs as getCommercialPOsLocal, getInvoices as getInvoicesLocal } from "../data/billingStore";
import { fetchFinanceModuleData, invalidateFinanceCache, subscribeFinanceRefresh } from "../services/financeApi";
import { countPendingLeaveRequests } from "../lib/adminLeaveRequests";
import { calcSite } from "./finance/lib/calculations";
import { filterSitesByFinancePlAccess } from "./finance/constants/financePlSiteAccess";
import { useAuth } from "../contexts/AuthContext";
import {
  buildMonthOptions,
  comparePeriodKeys,
  currentPeriodKey,
  dateToPeriodKey,
  monthLabelOf,
  periodKeysBetween,
} from "./finance/lib/periods";
import { inrShort, pct } from "./finance/lib/formatters";
import { resolveContractForBillingParentPo } from "../utils/billingInvoiceRollup";
import { PageTaskHeader, PageShell, KpiTile } from "../components/erpUi";

const DashboardChartsIsland = lazy(() => import("./dashboard/DashboardChartsIsland"));

function ChartsFallback() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" aria-hidden>
      <div className="lg:col-span-2 h-[280px] rounded-card border border-border bg-surface-sunken/50 animate-pulse" />
      <div className="h-[280px] rounded-card border border-border bg-surface-sunken/50 animate-pulse" />
    </div>
  );
}

const LEDGER_BASE = "/app/accounts-finance/reports/site-ledger";
const BILLING_BASE = "/app/billing";
const META_PREFIX = "__META__:";
const DAY_MS = 24 * 60 * 60 * 1000;
const BID_DEADLINE_ALERT_DAYS = [7, 3, 1];

const EMPTY_MODULES = {
  people: 0,
  leavePending: 0,
  marketing: 0,
  maintenance: 0,
  projects: 0,
  manpowerTotal: 0,
  manpowerPending: 0,
  manpowerApproved: 0,
  manpowerDueSoon: 0,
  fireTenderTotal: 0,
  fireTenderPending: 0,
  amcActive: 0,
  amcAtRisk: 0,
  amcComplaints: 0,
  commercialPending: 0,
};

function invAmount(inv) {
  return Number(inv?.totalAmount ?? inv?.total_amount ?? inv?.calculatedInvoiceAmount ?? 0) || 0;
}

function isTaxInvoice(inv) {
  if (!inv || inv.isCancelled) return false;
  const k = String(inv.invoiceKind || inv.invoice_kind || "tax").toLowerCase();
  return k !== "proforma";
}

function formatMonthShort(key) {
  if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || "";
  const [y, m] = key.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m) - 1] || m} ${String(y).slice(2)}`;
}

function ledgerUrl({ month, siteId } = {}) {
  const q = new URLSearchParams();
  if (month) {
    q.set("slMonth", month);
    q.set("slFrom", month);
    q.set("slTo", month);
  }
  if (siteId) q.set("slSite", siteId);
  const s = q.toString();
  return s ? `${LEDGER_BASE}?${s}` : LEDGER_BASE;
}

function parseMeta(raw) {
  if (!raw || typeof raw !== "string" || !raw.startsWith(META_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(META_PREFIX.length)) || {};
  } catch {
    return {};
  }
}

function toLocalDateStart(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countManpowerDueSoon(rows) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let n = 0;
  for (const row of rows || []) {
    const status = String(row.status || "").trim().toLowerCase();
    if (["approved", "rejected", "cancelled", "canceled"].includes(status)) continue;
    const meta = parseMeta(row.authorization_to);
    const deadline = toLocalDateStart(meta.submissionBidDeadline || row.due_date);
    if (!deadline) continue;
    const daysUntil = Math.round((deadline.getTime() - start.getTime()) / DAY_MS);
    if (BID_DEADLINE_ALERT_DAYS.includes(daysUntil)) n += 1;
  }
  return n;
}

async function safeHeadCount(query) {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

async function loadModuleFootprint() {
  const out = { ...EMPTY_MODULES };

  const peopleP = safeHeadCount(
    supabase.from("admin_ifsp_employee_master").select("id", { count: "exact", head: true }).eq("status", "Active")
  );
  const leaveP = (async () => {
    try {
      return await countPendingLeaveRequests();
    } catch {
      return 0;
    }
  })();
  const marketingP = safeHeadCount(supabase.from("marketing_enquiries").select("id", { count: "exact", head: true }));
  // maintenance_* tables are not deployed on this project — never probe (avoids console 404).
  const maintenanceP = Promise.resolve(0);
  const fireTotalP = safeHeadCount(supabase.from("tenders").select("id", { count: "exact", head: true }));
  const firePendingP = safeHeadCount(
    supabase.from("tenders").select("id", { count: "exact", head: true }).eq("status", "Pending")
  );
  // projects.enquiries needs the `projects` API schema. This host does not expose it
  // (HEAD /rest/v1/enquiries → 403), so do not probe from the home dashboard.
  const projectsP = Promise.resolve(0);
  const manpowerP = (async () => {
    try {
      const { data, error } = await supabase
        .from("manpower_enquiries")
        .select("id, status, due_date, authorization_to")
        .limit(800);
      if (error) return { total: 0, pending: 0, approved: 0, dueSoon: 0 };
      const rows = data || [];
      const approved = rows.filter((r) => String(r.status || "").toLowerCase() === "approved").length;
      const rejected = rows.filter((r) => String(r.status || "").toLowerCase() === "rejected").length;
      return {
        total: rows.length,
        approved,
        pending: Math.max(0, rows.length - approved - rejected),
        dueSoon: countManpowerDueSoon(rows),
      };
    } catch {
      return { total: 0, pending: 0, approved: 0, dueSoon: 0 };
    }
  })();
  const amcP = (async () => {
    try {
      const { data, error } = await supabase.from("vw_amc_dashboard_summary").select("*").maybeSingle();
      if (error || !data) return { active: 0, atRisk: 0, complaints: 0 };
      return {
        active: Number(data.active_contracts) || 0,
        atRisk: Number(data.contracts_at_risk) || 0,
        complaints: Number(data.open_complaints) || 0,
      };
    } catch {
      return { active: 0, atRisk: 0, complaints: 0 };
    }
  })();

  const [people, leavePending, marketing, maintenance, fireTotal, firePending, projects, manpower, amc] =
    await Promise.all([
      peopleP,
      leaveP,
      marketingP,
      maintenanceP,
      fireTotalP,
      firePendingP,
      projectsP,
      manpowerP,
      amcP,
    ]);

  out.people = people;
  out.leavePending = leavePending;
  out.marketing = marketing;
  out.maintenance = maintenance;
  out.projects = projects;
  out.fireTenderTotal = fireTotal;
  out.fireTenderPending = firePending;
  out.manpowerTotal = manpower.total;
  out.manpowerPending = manpower.pending;
  out.manpowerApproved = manpower.approved;
  out.manpowerDueSoon = manpower.dueSoon;
  out.amcActive = amc.active;
  out.amcAtRisk = amc.atRisk;
  out.amcComplaints = amc.complaints;
  return out;
}

function indiaFyStartKey(anchor = new Date()) {
  const y = anchor.getFullYear();
  const m = anchor.getMonth() + 1;
  return m >= 4 ? `${y}-04` : `${y - 1}-04`;
}

function buildRecentMonthOptions(monthsBack = 36) {
  const end = currentPeriodKey();
  const endIdx = (() => {
    const [y, m] = end.split("-").map(Number);
    return y * 12 + (m - 1);
  })();
  const startIdx = endIdx - (monthsBack - 1);
  const out = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const year = Math.floor(i / 12);
    const month = (i % 12) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const d = new Date(year, month - 1, 1);
    const label = d.toLocaleString("en-US", { month: "short" }) + "-" + String(year).slice(2);
    out.push({ key, label, year, month });
  }
  return out;
}

function invoicePeriodKey(inv) {
  return dateToPeriodKey(inv?.invoiceDate || inv?.invoice_date || inv?.created_at || inv?.createdAt || "");
}

function inMonthRange(periodKey, fromKey, toKey) {
  if (!periodKey) return false;
  return comparePeriodKeys(periodKey, fromKey) >= 0 && comparePeriodKeys(periodKey, toKey) <= 0;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [financeError, setFinanceError] = useState("");
  const [fromKey, setFromKey] = useState(() => indiaFyStartKey());
  const [toKey, setToKey] = useState(() => currentPeriodKey());
  const [finance, setFinance] = useState(null);
  const [modules, setModules] = useState(EMPTY_MODULES);
  const [commercial, setCommercial] = useState({
    contractBook: 0,
    parents: [],
    invoices: [],
    poCount: 0,
  });
  const mountedRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const monthChoices = useMemo(() => buildRecentMonthOptions(48), []);
  const months = useMemo(() => buildMonthOptions(), []);

  const rangeKeys = useMemo(() => {
    let from = fromKey;
    let to = toKey;
    if (comparePeriodKeys(from, to) > 0) {
      const swap = from;
      from = to;
      to = swap;
    }
    return periodKeysBetween(from, to);
  }, [fromKey, toKey]);

  const goLedger = useCallback(
    (opts = {}) => navigate(ledgerUrl({ month: toKey, ...opts })),
    [navigate, toKey]
  );
  const goBilling = useCallback(() => navigate(BILLING_BASE), [navigate]);
  const goBillingReports = useCallback(() => navigate(`${BILLING_BASE}/reports`), [navigate]);
  const go = useCallback((path) => navigate(path), [navigate]);

  const load = useCallback(async ({ showLoading = true, force = false } = {}) => {
    try {
      if (showLoading) setLoading(true);
      setFinanceError("");

      const financeP = (async () => {
        try {
          // First paint uses cache when warm; Refresh / realtime can force.
          if (force) invalidateFinanceCache({ notify: false });
          return await fetchFinanceModuleData({ force });
        } catch (e) {
          setFinanceError(e?.message || "Finance figures unavailable");
          return null;
        }
      })();

      const posP = (async () => {
        try {
          return await fetchCommercialPOs({ includeChildren: false });
        } catch {
          return getCommercialPOsLocal();
        }
      })();

      const invP = (async () => {
        try {
          return await fetchInvoices();
        } catch {
          return getInvoicesLocal();
        }
      })();

      const modulesP = loadModuleFootprint();

      const [fin, posRaw, invRaw, footprint] = await Promise.all([financeP, posP, invP, modulesP]);
      if (!mountedRef.current) return;

      setFinance(fin);

      const parents = (posRaw || []).filter((po) => !po?.isSupplementary && !po?.is_supplementary);
      const allTax = (invRaw || []).filter(isTaxInvoice);
      const commercialPending = parents.filter((po) =>
        ["sent_for_approval", "pending_approval"].includes(
          String(po.approvalStatus || po.approval_status || "").toLowerCase()
        )
      ).length;

      let contractBook = 0;
      for (const po of parents) {
        contractBook += resolveContractForBillingParentPo(po).contract || 0;
      }

      // Range filter applied in render against live from/to; store full invoice set on commercial via billedAll then recompute? 
      // Store all tax invoices amounts keyed — simpler: store raw lists in state for range filter.
      setModules({ ...footprint, commercialPending });
      setCommercial({
        contractBook,
        parents,
        invoices: allTax,
        poCount: parents.length,
      });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    const schedule = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        load({ showLoading: false });
      }, 350);
    };

    const unsubFinance = subscribeFinanceRefresh(schedule);

    const channel = supabase
      .channel("executive-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "finance", table: "period_entries" }, schedule)
      .on("postgres_changes", { event: "*", schema: "finance", table: "revenue_entry_lines" }, schedule)
      .on("postgres_changes", { event: "*", schema: "finance", table: "expense_entry_lines" }, schedule)
      .on("postgres_changes", { event: "*", schema: "billing", table: "po_wo" }, schedule)
      .on("postgres_changes", { event: "*", schema: "billing", table: "invoice" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_ifsp_employee_master" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_enquiries" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "manpower_enquiries" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenders" }, schedule)
      .subscribe();
    // Note: maintenance_* tables are not deployed on all projects — footprint uses safeHeadCount.

    const interval = window.setInterval(() => load({ showLoading: false }), 45000);
    window.addEventListener("erp-dashboard-refresh", schedule);
    window.addEventListener("focus", schedule);
    const onVis = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.clearInterval(interval);
      window.removeEventListener("erp-dashboard-refresh", schedule);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVis);
      unsubFinance();
      channel.unsubscribe();
    };
  }, [load]);

  const rangeLabel = useMemo(() => {
    const a = monthLabelOf(fromKey, monthChoices) || formatMonthShort(fromKey);
    const b = monthLabelOf(toKey, monthChoices) || formatMonthShort(toKey);
    return a === b ? a : `${a} → ${b}`;
  }, [fromKey, monthChoices, toKey]);

  const commercialStats = useMemo(() => {
    const from = comparePeriodKeys(fromKey, toKey) <= 0 ? fromKey : toKey;
    const to = comparePeriodKeys(fromKey, toKey) <= 0 ? toKey : fromKey;
    const invoices = (commercial.invoices || []).filter((inv) => {
      const pk = invoicePeriodKey(inv);
      if (!pk) return true;
      return inMonthRange(pk, from, to);
    });
    let billed = 0;
    let collected = 0;
    let outstanding = 0;
    for (const inv of invoices) {
      const amt = invAmount(inv);
      billed += amt;
      if (inv.paymentStatus === true || inv.payment_status === true) collected += amt;
      else outstanding += Number(inv.pendingAmount ?? inv.pending_amount) || amt;
    }
    const contractBook = commercial.contractBook || 0;
    return {
      contractBook,
      billed,
      unbilled: Math.max(0, contractBook - billed),
      collected,
      outstanding,
      invoiceCount: invoices.length,
      poCount: commercial.poCount || 0,
    };
  }, [commercial, fromKey, toKey]);

  const pl = useMemo(() => {
    if (!finance?.sites?.length) {
      return {
        revenue: 0,
        expense: 0,
        profit: 0,
        margin: 0,
        sitesReporting: 0,
        lossSites: 0,
        thinSites: 0,
        siteRows: [],
        trend: [],
        expenseMix: [],
        warnMargin: 8,
      };
    }
    const keys = rangeKeys.length ? rangeKeys : [currentPeriodKey()];
    const { records, revenueHeads, spreads, expenseParentHeads, warnMargin = 8 } = finance;
    const sites = filterSitesByFinancePlAccess(finance.sites, userProfile);

    const siteRows = sites
      .map((s) => {
        const agg = keys.reduce(
          (acc, pk) => {
            const c = calcSite(s, pk, records, revenueHeads, spreads, months);
            return {
              revenue: acc.revenue + c.revenue,
              expense: acc.expense + c.expense,
              profit: acc.profit + c.profit,
            };
          },
          { revenue: 0, expense: 0, profit: 0 }
        );
        const hasData = keys.some((pk) => {
          const rec = records[`${s.id}__${pk}`];
          return rec && Object.keys(rec).length > 0;
        }) || !!(agg.revenue || agg.expense);
        const margin = agg.revenue > 0 ? (agg.profit / agg.revenue) * 100 : 0;
        return {
          id: s.id,
          name: s.name || s.code || s.id,
          ...agg,
          margin,
          hasData,
        };
      })
      .filter((r) => r.hasData);

    const totals = siteRows.reduce(
      (a, r) => ({
        revenue: a.revenue + r.revenue,
        expense: a.expense + r.expense,
        profit: a.profit + r.profit,
      }),
      { revenue: 0, expense: 0, profit: 0 }
    );
    const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

    const trend = keys.map((pk) => {
      const t = sites
        .map((s) => calcSite(s, pk, records, revenueHeads, spreads, months))
        .reduce(
          (a, c) => ({
            revenue: a.revenue + c.revenue,
            expense: a.expense + c.expense,
            profit: a.profit + c.profit,
          }),
          { revenue: 0, expense: 0, profit: 0 }
        );
      return {
        name: formatMonthShort(pk),
        key: pk,
        fullName: monthLabelOf(pk, months) || formatMonthShort(pk),
        _hint: "Click to open site ledger for this month",
        ...t,
      };
    });

    const expenseMix = [];
    if (expenseParentHeads?.length) {
      const agg = Object.fromEntries(expenseParentHeads.map((p) => [p.id, { name: p.label, value: 0 }]));
      for (const s of sites) {
        for (const pk of keys) {
          const c = calcSite(s, pk, records, revenueHeads, spreads, months);
          if (!(c.revenue || c.expense)) continue;
          const structure = s.structure || [];
          for (const p of expenseParentHeads) {
            const childIds = structure.filter((row) => row.parent_head_id === p.id).map((row) => row.child_head_id);
            const sum = childIds.reduce((a, id) => a + (Number(c.ex?.total?.[id]) || 0), 0);
            if (agg[p.id]) agg[p.id].value += sum;
          }
        }
      }
      expenseMix.push(...Object.values(agg).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6));
    }

    return {
      revenue: totals.revenue,
      expense: totals.expense,
      profit: totals.profit,
      margin,
      sitesReporting: siteRows.length,
      lossSites: siteRows.filter((r) => r.profit < 0).length,
      thinSites: siteRows.filter((r) => r.profit >= 0 && r.margin < warnMargin).length,
      siteRows: [...siteRows].sort((a, b) => b.profit - a.profit),
      trend,
      expenseMix,
      warnMargin,
    };
  }, [finance, months, rangeKeys, userProfile]);


  const billingBars = useMemo(
    () => [
      { name: "Contract book", fullName: "Contract book", value: commercialStats.contractBook, _hint: "Open billing", _to: "billing" },
      { name: "Billed", fullName: "Billed in range", value: commercialStats.billed, _hint: "Open billing", _to: "billing" },
      { name: "Unbilled", fullName: "Unbilled backlog", value: commercialStats.unbilled, _hint: "Open billing", _to: "billing" },
      { name: "Outstanding", fullName: "Receivables outstanding", value: commercialStats.outstanding, _hint: "Open outstanding reports", _to: "reports" },
    ],
    [commercialStats]
  );

  const collectionMix = useMemo(
    () =>
      [
        { name: "Collected", fullName: "Collected", value: commercialStats.collected, _hint: "Open billing" },
        { name: "Outstanding", fullName: "Outstanding receivables", value: commercialStats.outstanding, _hint: "Open outstanding reports" },
      ].filter((x) => x.value > 0),
    [commercialStats.collected, commercialStats.outstanding]
  );

  const plMix = useMemo(
    () =>
      [
        { name: "Revenue", fullName: "Revenue", value: Math.max(0, pl.revenue), _hint: "Open site ledger" },
        { name: "Expense", fullName: "Expenses", value: Math.max(0, pl.expense), _hint: "Open site ledger" },
        { name: "Profit", fullName: "Net profit", value: Math.max(0, pl.profit), _hint: "Open site ledger" },
      ].filter((x) => x.value > 0),
    [pl.expense, pl.profit, pl.revenue]
  );

  const topSites = useMemo(
    () =>
      pl.siteRows.slice(0, 8).map((r) => ({
        id: r.id,
        name: String(r.name),
        fullName: String(r.name),
        profit: r.profit,
        revenue: r.revenue,
        _hint: "Click to open this site in the ledger",
      })),
    [pl.siteRows]
  );

  const bottomSites = useMemo(
    () =>
      [...pl.siteRows]
        .sort((a, b) => a.profit - b.profit)
        .slice(0, 6)
        .map((r) => ({
          id: r.id,
          name: String(r.name),
          fullName: String(r.name),
          profit: r.profit,
          _hint: "Click to open this site in the ledger",
        })),
    [pl.siteRows]
  );

  const billRate = commercialStats.contractBook > 0 ? Math.round((commercialStats.billed / commercialStats.contractBook) * 100) : 0;
  const collectRate =
    commercialStats.billed > 0 ? Math.round((commercialStats.collected / commercialStats.billed) * 100) : 0;

  const openSite = useCallback(
    (row) => {
      if (row?.id) goLedger({ siteId: row.id });
      else goLedger();
    },
    [goLedger]
  );

  const openTrendMonth = useCallback(
    (row) => {
      const month = row?.key || toKey;
      navigate(ledgerUrl({ month }));
    },
    [navigate, toKey]
  );

  const openBillingBar = useCallback(
    (row) => {
      if (row?._to === "reports" || row?.name === "Outstanding") goBillingReports();
      else goBilling();
    },
    [goBilling, goBillingReports]
  );

  const moduleVolume = useMemo(() => {
    const rows = [
      { name: "Admin people", fullName: "Active employees (Admin)", value: modules.people, path: "/app/admin/dashboard", _hint: "Open Admin" },
      { name: "Manpower", fullName: "Manpower enquiries", value: modules.manpowerTotal, path: "/app/commercial/manpower-training/manpower-management/dashboard", _hint: "Open Manpower" },
      { name: "Marketing", fullName: "Marketing enquiries", value: modules.marketing, path: "/app/marketing", _hint: "Open Marketing" },
      { name: "Maintenance", fullName: "Maintenance enquiries", value: modules.maintenance, path: "/app/maintenance", _hint: "Open Maintenance" },
      { name: "Projects", fullName: "Project enquiries", value: modules.projects, path: "/app/projects/enquiry/enquiry-dashboard", _hint: "Open Projects" },
      { name: "Fire tender", fullName: "Fire tender records", value: modules.fireTenderTotal, path: "/app/fire-tender", _hint: "Open Fire Tender" },
      { name: "Commercial", fullName: "Commercial PO/WO", value: commercialStats.poCount, path: "/app/commercial/manpower-training/dashboard", _hint: "Open Commercial" },
      { name: "Billing", fullName: "Tax invoices in range", value: commercialStats.invoiceCount, path: BILLING_BASE, _hint: "Open Billing" },
      { name: "AMC", fullName: "Active AMC contracts", value: modules.amcActive, path: "/app/amc", _hint: "Open AMC" },
      { name: "Finance sites", fullName: "Sites with P&L figures", value: pl.sitesReporting, path: ledgerUrl({ month: toKey }), _hint: "Open Site Ledger" },
    ].filter((x) => x.value > 0);
    return rows.sort((a, b) => b.value - a.value);
  }, [commercialStats.invoiceCount, commercialStats.poCount, modules, toKey, pl.sitesReporting]);

  const pipelineMix = useMemo(
    () =>
      [
        { name: "Marketing", fullName: "Marketing enquiries", value: modules.marketing, path: "/app/marketing", _hint: "Open Marketing" },
        { name: "Manpower", fullName: "Manpower enquiries", value: modules.manpowerTotal, path: "/app/commercial/manpower-training/manpower-management/dashboard", _hint: "Open Manpower" },
        { name: "Projects", fullName: "Project enquiries", value: modules.projects, path: "/app/projects/enquiry/enquiry-dashboard", _hint: "Open Projects" },
        { name: "Maintenance", fullName: "Maintenance enquiries", value: modules.maintenance, path: "/app/maintenance", _hint: "Open Maintenance" },
        { name: "Fire tender", fullName: "Fire tenders", value: modules.fireTenderTotal, path: "/app/fire-tender", _hint: "Open Fire Tender" },
      ].filter((x) => x.value > 0),
    [modules]
  );

  const attentionBars = useMemo(
    () =>
      [
        { name: "Leave queue", fullName: "Pending leave approvals", value: modules.leavePending, path: "/app/admin/employee/leaves-permissions", _hint: "Open leave queue" },
        { name: "Manpower wait", fullName: "Manpower pending decision", value: modules.manpowerPending, path: "/app/commercial/manpower-training/manpower-management/dashboard", _hint: "Open Manpower" },
        { name: "Bids due soon", fullName: "Manpower bids due soon", value: modules.manpowerDueSoon, path: "/app/commercial/manpower-training/manpower-management/dashboard", _hint: "Open Manpower" },
        { name: "PO waiting", fullName: "Commercial PO waiting approval", value: modules.commercialPending, path: "/app/commercial/manpower-training/dashboard", _hint: "Open Commercial" },
        { name: "FT pending", fullName: "Fire tenders pending", value: modules.fireTenderPending, path: "/app/fire-tender", _hint: "Open Fire Tender" },
        { name: "AMC risk", fullName: "AMC contracts at risk", value: modules.amcAtRisk, path: "/app/amc", _hint: "Open AMC" },
        { name: "AMC calls", fullName: "Open AMC complaints", value: modules.amcComplaints, path: "/app/amc", _hint: "Open AMC" },
        { name: "Sites in loss", fullName: "P&L sites in loss", value: pl.lossSites, path: ledgerUrl({ month: toKey }), _hint: "Open Site Ledger" },
      ].filter((x) => x.value > 0),
    [modules, toKey, pl.lossSites]
  );

  const manpowerMix = useMemo(
    () =>
      [
        { name: "Approved", fullName: "Manpower approved", value: modules.manpowerApproved, _hint: "Open Manpower" },
        { name: "Pending", fullName: "Manpower pending", value: modules.manpowerPending, _hint: "Open Manpower" },
        {
          name: "Other",
          fullName: "Other manpower statuses",
          value: Math.max(0, modules.manpowerTotal - modules.manpowerApproved - modules.manpowerPending),
          _hint: "Open Manpower",
        },
      ].filter((x) => x.value > 0),
    [modules]
  );

  const openModuleBar = useCallback(
    (row) => {
      if (row?.path) navigate(row.path);
    },
    [navigate]
  );

  return (
    <PageShell className="erp-page-stack max-w-[1600px] mx-auto erp-stagger">
      <div className="bg-surface rounded-card border border-border/80 shadow-card p-5 sm:p-6 relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-accent via-accent-electric to-teal"
          aria-hidden
        />
        <PageTaskHeader
          title="Executive P&L"
          subtitle="P&L and commercial book · ERP footprint across Admin, Manpower, Marketing, Projects and more"
          className="mb-4"
        >
            <label className="type-mono-caption text-ink-muted inline-flex items-center gap-2">
              From
              <select
                value={fromKey}
                onChange={(e) => {
                  const next = e.target.value;
                  setFromKey(next);
                  if (comparePeriodKeys(next, toKey) > 0) setToKey(next);
                }}
                className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-ink"
              >
                {monthChoices.map((m) => (
                  <option key={`from-${m.key}`} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="type-mono-caption text-ink-muted inline-flex items-center gap-2">
              To
              <select
                value={toKey}
                onChange={(e) => {
                  const next = e.target.value;
                  setToKey(next);
                  if (comparePeriodKeys(fromKey, next) > 0) setFromKey(next);
                }}
                className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-ink"
              >
                {monthChoices.map((m) => (
                  <option key={`to-${m.key}`} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => load({ force: true })}
              disabled={loading}
              className="h-9 px-3 rounded-lg border border-border text-sm inline-flex items-center gap-2 text-ink hover:bg-row-hover disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              to={ledgerUrl({ month: toKey })}
              className="h-9 px-3 rounded-control border border-accent-border bg-accent-soft text-sm inline-flex items-center text-accent font-medium"
            >
              Open site ledger
            </Link>
        </PageTaskHeader>
        {financeError ? (
          <p className="mt-3 text-sm text-warning bg-warning-soft border border-warning-border rounded-lg px-3 py-2">
            {financeError}. Billing figures below still load from commercial data.
          </p>
        ) : null}
      </div>

      <section>
        <h2 className="type-card-title text-ink-strong mb-3">P&amp;L · {rangeLabel}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 erp-stagger">
          <KpiTile
            label="Revenue"
            value={loading ? "—" : inrShort(pl.revenue)}
            sub={`${pl.sitesReporting} sites reporting`}
            onClick={() => goLedger()}
          />
          <KpiTile
            label="Expenses"
            value={loading ? "—" : inrShort(pl.expense)}
            sub={pl.revenue ? `${pct((pl.expense / pl.revenue) * 100)} of revenue` : "—"}
            onClick={() => goLedger()}
          />
          <KpiTile
            label="Net profit"
            value={loading ? "—" : inrShort(pl.profit)}
            sub={pl.revenue ? `Margin ${pct(pl.margin)}` : "—"}
            onClick={() => goLedger()}
          />
          <KpiTile
            label="Gross margin"
            value={loading ? "—" : pct(pl.margin)}
            sub={pl.thinSites ? `${pl.thinSites} thin-margin sites` : "On target band"}
            onClick={() => goLedger()}
          />
          <KpiTile
            label="Sites in loss"
            value={loading ? "—" : pl.lossSites}
            sub={`of ${pl.sitesReporting} with figures`}
            onClick={() => goLedger()}
          />
          <KpiTile
            label="Thin margin"
            value={loading ? "—" : pl.thinSites}
            sub={`Below ${pl.warnMargin}% warn`}
            onClick={() => goLedger()}
          />
        </div>
      </section>

      <section>
        <h2 className="type-card-title text-ink mb-3">Commercial book</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <KpiTile
            label="Contract book"
            value={loading ? "—" : inrShort(commercialStats.contractBook)}
            sub={`${commercialStats.poCount} active PO/WO`}
            onClick={goBilling}
          />
          <KpiTile
            label="Billed in range"
            value={loading ? "—" : inrShort(commercialStats.billed)}
            sub={`${commercialStats.invoiceCount} tax invoices`}
            onClick={goBilling}
          />
          <KpiTile
            label="Unbilled backlog"
            value={loading ? "—" : inrShort(commercialStats.unbilled)}
            sub="Contract less billed"
            onClick={goBilling}
          />
          <KpiTile
            label="Collected"
            value={loading ? "—" : inrShort(commercialStats.collected)}
            sub={`Collection ${collectRate}%`}
            onClick={goBilling}
          />
          <KpiTile
            label="Receivables"
            value={loading ? "—" : inrShort(commercialStats.outstanding)}
            sub="Unpaid invoices"
            onClick={goBillingReports}
          />
          <KpiTile
            label="Billing coverage"
            value={loading ? "—" : `${billRate}%`}
            sub="Billed ÷ contract"
            onClick={goBilling}
          />
        </div>

      </section>

      <section>
        <h2 className="type-card-title text-ink mb-1">Enterprise footprint</h2>
        <p className="type-meta text-ink-muted mb-3">
          Bird&apos;s-eye across Admin, Manpower, Marketing, Maintenance, Projects, Commercial, Billing, AMC and Finance
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          <KpiTile
            label="Active people"
            value={loading ? "—" : modules.people.toLocaleString("en-IN")}
            sub="Admin headcount"
            onClick={() => go("/app/admin/dashboard")}
          />
          <KpiTile
            label="Leave queue"
            value={loading ? "—" : modules.leavePending}
            sub="Pending approvals"
            onClick={() => go("/app/admin/employee/leaves-permissions")}
          />
          <KpiTile
            label="Manpower pipeline"
            value={loading ? "—" : modules.manpowerTotal}
            sub={`${modules.manpowerPending} waiting · ${modules.manpowerDueSoon} due soon`}
            onClick={() => go("/app/commercial/manpower-training/manpower-management/dashboard")}
          />
          <KpiTile
            label="Marketing asks"
            value={loading ? "—" : modules.marketing}
            sub="Enquiries on record"
            onClick={() => go("/app/marketing")}
          />
          <KpiTile
            label="Project enquiries"
            value={loading ? "—" : modules.projects}
            sub="Projects module"
            onClick={() => go("/app/projects/enquiry/enquiry-dashboard")}
          />
          <KpiTile
            label="AMC active"
            value={loading ? "—" : modules.amcActive}
            sub={`${modules.amcAtRisk} at risk · ${modules.amcComplaints} open calls`}
            onClick={() => go("/app/amc")}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiTile
            label="Maintenance"
            value={loading ? "—" : modules.maintenance}
            sub="Enquiries"
            onClick={() => go("/app/maintenance")}
          />
          <KpiTile
            label="IEV"
            value={loading ? "—" : modules.fireTenderTotal}
            sub={`${modules.fireTenderPending} pending`}
            onClick={() => go("/app/fire-tender")}
          />
          <KpiTile
            label="Commercial PO/WO"
            value={loading ? "—" : commercialStats.poCount}
            sub={`${modules.commercialPending} waiting approval`}
            onClick={() => go("/app/commercial/manpower-training/dashboard")}
          />
          <KpiTile
            label="Finance sites"
            value={loading ? "—" : pl.sitesReporting}
            sub={`${pl.lossSites} in loss this period`}
            onClick={() => goLedger()}
          />
        </div>
      </section>

      <Suspense fallback={<ChartsFallback />}>
        <DashboardChartsIsland
          rangeLabel={rangeLabel}
          pl={pl}
          plMix={plMix}
          topSites={topSites}
          bottomSites={bottomSites}
          billingBars={billingBars}
          collectionMix={collectionMix}
          commercialStats={commercialStats}
          billRate={billRate}
          loading={loading}
          moduleVolume={moduleVolume}
          pipelineMix={pipelineMix}
          attentionBars={attentionBars}
          manpowerMix={manpowerMix}
          modules={modules}
          goLedger={goLedger}
          goBilling={goBilling}
          goBillingReports={goBillingReports}
          go={go}
          openTrendMonth={openTrendMonth}
          openSite={openSite}
          openBillingBar={openBillingBar}
          openModuleBar={openModuleBar}
        />
      </Suspense>

    </PageShell>
  );
};

export default Dashboard;
