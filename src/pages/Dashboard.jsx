import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchCommercialPOs, fetchInvoices } from "../services/billingApi";
import { getCommercialPOs as getCommercialPOsLocal, getInvoices as getInvoicesLocal } from "../data/billingStore";
import { fetchFinanceModuleData, invalidateFinanceCache, subscribeFinanceRefresh } from "../services/financeApi";
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
import { resolveContractForBillingParentPo } from "../utils/billingInvoiceRollup";
import { PageShell } from "../components/erpUi";
import { isPathAllowed } from "../config/roles";
import CompanyPulse from "./dashboard/CompanyPulse";
import { buildTimelinePresets } from "./dashboard/companyPulseModel";
import { loadCompanyAttendance } from "./dashboard/companyAttendance";
import {
  collectPulseRealtimeTables,
  emptyPulseFootprint,
  loadPulseFootprint,
} from "./dashboard/pulseRegistry";

const EMPTY_MODULES = emptyPulseFootprint();

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
  const { user, userProfile, accessibleModules, subModulePaths } = useAuth();
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
  const [attendance, setAttendance] = useState(null);
  const mountedRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const attendanceLoadedRef = useRef(false);
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

  const allowPath = useCallback(
    (path) =>
      isPathAllowed(path, accessibleModules || new Set(), subModulePaths || new Set(), {
        email: user?.email || userProfile?.email,
      }),
    [accessibleModules, subModulePaths, user?.email, userProfile?.email]
  );
  const go = useCallback(
    (path) => {
      if (path && allowPath(path)) navigate(path);
    },
    [allowPath, navigate]
  );

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

      const modulesP = loadPulseFootprint();

      if (force || !attendanceLoadedRef.current) {
        attendanceLoadedRef.current = true;
        loadCompanyAttendance(undefined, {
          onUpdate: (snapshot) => {
            if (mountedRef.current) setAttendance(snapshot);
          },
        }).catch(() => {
          /* spark stays empty when attendance is unavailable */
        });
      }

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

    let channel = supabase.channel("executive-dashboard-live");
    const pulseTables = collectPulseRealtimeTables();
    const fallbackTables = [
      { schema: "finance", table: "period_entries" },
      { schema: "finance", table: "revenue_entry_lines" },
      { schema: "finance", table: "expense_entry_lines" },
      { schema: "billing", table: "po_wo" },
      { schema: "billing", table: "invoice" },
    ];
    const seen = new Set();
    for (const spec of [...pulseTables, ...fallbackTables]) {
      const key = `${spec.schema}.${spec.table}`;
      if (seen.has(key)) continue;
      seen.add(key);
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: spec.schema, table: spec.table },
        schedule
      );
    }
    channel.subscribe();

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


  const billRate = commercialStats.contractBook > 0 ? Math.round((commercialStats.billed / commercialStats.contractBook) * 100) : 0;
  const collectRate =
    commercialStats.billed > 0 ? Math.round((commercialStats.collected / commercialStats.billed) * 100) : 0;

  const presets = useMemo(() => buildTimelinePresets(), []);
  const activePresetId = presets.find((preset) => preset.from === fromKey && preset.to === toKey)?.id || "";

  return (
    <PageShell className="erp-page-stack max-w-[1400px] mx-auto min-h-0 h-full space-y-0">
      <CompanyPulse
        loading={loading}
        financeError={financeError}
        rangeLabel={rangeLabel}
        fromKey={fromKey}
        toKey={toKey}
        monthChoices={monthChoices}
        presets={presets}
        activePresetId={activePresetId}
        onPreset={(preset) => {
          setFromKey(preset.from);
          setToKey(preset.to);
        }}
        onFrom={(next) => {
          setFromKey(next);
          if (comparePeriodKeys(next, toKey) > 0) setToKey(next);
        }}
        onTo={(next) => {
          setToKey(next);
          if (comparePeriodKeys(fromKey, next) > 0) setFromKey(next);
        }}
        onRefresh={() => load({ force: true })}
        profile={userProfile}
        allowPath={allowPath}
        modules={modules}
        commercialStats={commercialStats}
        invoices={commercial.invoices || []}
        pl={pl}
        billRate={billRate}
        collectRate={collectRate}
        onOpen={go}
        attendance={attendance}
        onOpenAttendance={
          allowPath("/app/hr/site-attendance")
            ? () => go("/app/hr/site-attendance")
            : allowPath("/app/hr")
              ? () => go("/app/hr")
              : null
        }
      />
    </PageShell>
  );
};

export default Dashboard;
