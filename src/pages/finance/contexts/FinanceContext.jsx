import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { fetchFinanceModuleData, financeErrorMsg, invalidateFinanceCache, subscribeFinanceRefresh } from "../../../services/financeApi";
import { buildMonthOptions, currentPeriodKey, getPeriodRange } from "../lib/periods";
import {
  calcSite,
  estimateFor,
  estTotals,
  isPending,
  pendingPeriods,
  parentTotalsSite,
} from "../lib/calculations";
import {
  canEditMasters,
  canEditSite,
  canImportExport,
  isFinanceAdmin,
} from "../constants/permissions";

const FinanceContext = createContext(null);

export function FinanceProvider({ children }) {
  const { userProfile, accessibleModules } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const months = useMemo(() => buildMonthOptions({ count: 36 }), []);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await fetchFinanceModuleData({ force });
      setData(bundle);
    } catch (e) {
      setError(financeErrorMsg(e, "Load finance data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return subscribeFinanceRefresh(() => load(true));
  }, [load]);

  const refresh = useCallback(() => {
    invalidateFinanceCache();
    return load(true);
  }, [load]);

  const periodMode = searchParams.get("periodMode") || "monthly";
  const periodKey = searchParams.get("period") || currentPeriodKey();
  const siteFilter = searchParams.get("siteId") || "";

  const setFilters = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([k, v]) => {
        if (v == null || v === "") next.delete(k);
        else next.set(k, String(v));
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const periodKeys = useMemo(
    () => getPeriodRange(periodMode, periodKey, months),
    [periodMode, periodKey, months],
  );

  const permissions = useMemo(
    () => ({
      isAdmin: isFinanceAdmin(userProfile, accessibleModules),
      canEditMasters: canEditMasters(userProfile, accessibleModules),
      canImportExport: canImportExport(userProfile, accessibleModules),
      canEditSite: (siteId) =>
        canEditSite(userProfile, accessibleModules, siteId, data?.userSiteAccess),
    }),
    [userProfile, accessibleModules, data?.userSiteAccess],
  );

  const siteRows = useMemo(() => {
    if (!data) return [];
    const { sites, records, revenueHeads, spreads, targetMargin, warnMargin } = data;
    const filtered = siteFilter
      ? sites.filter((s) => s.id === siteFilter)
      : sites;

    return filtered.map((s) => {
      const periodAgg = periodKeys.reduce(
        (acc, pk) => {
          const c = calcSite(s, pk, records, revenueHeads, spreads, months);
          return {
            revenue: acc.revenue + c.revenue,
            expense: acc.expense + c.expense,
            profit: acc.profit + c.profit,
          };
        },
        { revenue: 0, expense: 0, profit: 0 },
      );
      periodAgg.margin =
        periodAgg.revenue > 0 ? (periodAgg.profit / periodAgg.revenue) * 100 : 0;

      const estVer = estimateFor(s, periodKey, months);
      const est = estTotals(estVer, revenueHeads);
      const profitVar = est ? periodAgg.profit - est.profit * periodKeys.length : null;
      const pending = isPending(s, records, periodKey, months);
      const pendingCount = pendingPeriods(s, records, periodKey, months).length;
      const hasData = periodKeys.some((pk) => records[`${s.id}__${pk}`]);

      return {
        ...s,
        ...periodAgg,
        est,
        profitVar,
        pending,
        pendingCount,
        hasData,
        targetMargin,
        warnMargin,
      };
    });
  }, [data, periodKeys, periodKey, siteFilter, months]);

  const portfolio = useMemo(() => {
    const withData = siteRows.filter((r) => r.hasData);
    const totals = withData.reduce(
      (a, r) => ({
        revenue: a.revenue + r.revenue,
        expense: a.expense + r.expense,
        profit: a.profit + r.profit,
      }),
      { revenue: 0, expense: 0, profit: 0 },
    );
    totals.margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

    const estAgg = withData.filter((r) => r.est).length
      ? withData
          .filter((r) => r.est)
          .reduce(
            (a, r) => ({
              revenue: a.revenue + r.est.revenue * periodKeys.length,
              expense: a.expense + r.est.expense * periodKeys.length,
              profit: a.profit + r.est.profit * periodKeys.length,
            }),
            { revenue: 0, expense: 0, profit: 0 },
          )
      : null;

    const lossCount = withData.filter((r) => r.profit < 0).length;
    const thinCount = withData.filter(
      (r) => r.profit >= 0 && r.margin < (data?.warnMargin || 8),
    ).length;
    const belowEst = withData.filter((r) => r.est && r.profit < r.est.profit * periodKeys.length).length;
    const pendingSites = siteRows.filter((r) => r.pending).sort((a, b) => b.pendingCount - a.pendingCount);

    return { totals, withData, estAgg, lossCount, thinCount, belowEst, pendingSites };
  }, [siteRows, periodKeys, data?.warnMargin]);

  const expenseBreakdown = useMemo(() => {
    if (!data) return [];
    const { expenseParentHeads, records, spreads } = data;
    const withData = siteRows.filter((r) => r.hasData);
    const agg = Object.fromEntries(expenseParentHeads.map((p) => [p.id, 0]));
    withData.forEach((r) => {
      periodKeys.forEach((pk) => {
        const pt = parentTotalsSite(r, pk, records, expenseParentHeads, spreads, months);
        expenseParentHeads.forEach((p) => {
          agg[p.id] += pt[p.id] || 0;
        });
      });
    });
    return expenseParentHeads
      .map((p) => ({ name: p.label, value: agg[p.id], color: p.color }))
      .filter((d) => d.value > 0);
  }, [data, siteRows, periodKeys, months]);

  const trendData = useMemo(() => {
    if (!data) return [];
    const activeMonths = months.filter((m) =>
      data.sites.some((s) => {
        const c = calcSite(s, m.key, data.records, data.revenueHeads, data.spreads, months);
        return c.revenue || c.expense;
      }),
    );
    return (activeMonths.length ? activeMonths : months.slice(-6)).map((m) => {
      const arr = data.sites
        .map((s) => calcSite(s, m.key, data.records, data.revenueHeads, data.spreads, months))
        .filter((c) => c.revenue || c.expense);
      const t = arr.reduce(
        (a, c) => ({
          revenue: a.revenue + c.revenue,
          expense: a.expense + c.expense,
          profit: a.profit + c.profit,
        }),
        { revenue: 0, expense: 0, profit: 0 },
      );
      return { name: m.label, key: m.key, ...t };
    });
  }, [data, months]);

  const value = {
    data,
    loading,
    error,
    refresh,
    months,
    periodMode,
    periodKey,
    periodKeys,
    siteFilter,
    setFilters,
    permissions,
    siteRows,
    portfolio,
    expenseBreakdown,
    trendData,
    targetMargin: data?.targetMargin ?? 12,
    warnMargin: data?.warnMargin ?? 8,
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
  return ctx;
}
