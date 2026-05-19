import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { fetchAmcModuleData, invalidateAmcCache } from "../api/amcApi";
import { amcPath } from "../navConfig";
import { filterBySearch } from "../data/mockAmcData";

const AmcContext = createContext(null);

/** Map alert / record types to AMC pages */
const RECORD_ROUTES = {
  customer: "customers",
  contract: "contracts",
  site: "sites",
  asset: "assets",
  pm: "pm-schedule",
  complaint: "complaints",
  visit: "visits",
  report: "service-reports",
};

export function AmcProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const bundle = await fetchAmcModuleData({ force });
      setData(bundle);
    } catch (e) {
      setError(e?.message || "Failed to load AMC data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    invalidateAmcCache();
    return load(true);
  }, [load]);

  const filters = useMemo(
    () => ({
      customerId: searchParams.get("customerId") || "",
      contractId: searchParams.get("contractId") || "",
      siteId: searchParams.get("siteId") || "",
      assetId: searchParams.get("assetId") || "",
      pmId: searchParams.get("pmId") || "",
      complaintId: searchParams.get("complaintId") || "",
      visitId: searchParams.get("visitId") || "",
      engineerId: searchParams.get("engineerId") || "",
      status: searchParams.get("status") || "",
      due: searchParams.get("due") || "",
      highlightId: searchParams.get("highlight") || "",
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (patch, { replace = false } = {}) => {
      const next = new URLSearchParams(replace ? undefined : searchParams);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      });
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const navigateTo = useCallback(
    (pageId, params = {}, { replace = false } = {}) => {
      const path = amcPath(pageId);
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v != null && v !== "") qs.set(k, v);
      });
      const url = qs.toString() ? `${path}?${qs}` : path;
      navigate(url, { replace });
    },
    [navigate]
  );

  const openRecord = useCallback(
    (type, id, extra = {}) => {
      const page = RECORD_ROUTES[type];
      if (!page || !id) return;
      const paramKey =
        type === "customer"
          ? "customerId"
          : type === "contract"
            ? "contractId"
            : type === "site"
              ? "siteId"
              : type === "asset"
                ? "assetId"
                : type === "pm"
                  ? "pmId"
                  : type === "complaint"
                    ? "complaintId"
                    : type === "visit"
                      ? "visitId"
                      : "highlight";
      navigateTo(page, { [paramKey]: id, highlight: id, ...extra });
    },
    [navigateTo]
  );

  const getById = useCallback(
    (collection, id) => {
      if (!data || !id) return null;
      return (data[collection] || []).find((r) => r.id === id) || null;
    },
    [data]
  );

  const related = useMemo(() => {
    if (!data) {
      return {
        contractsForCustomer: () => [],
        sitesForCustomer: () => [],
        sitesForContract: () => [],
        assetsForSite: () => [],
        assetsForContract: () => [],
        pmForContract: () => [],
        pmForSite: () => [],
        pmForAsset: () => [],
        complaintsForCustomer: () => [],
        complaintsForSite: () => [],
        visitsForPm: () => [],
        visitsForComplaint: () => [],
        reportsForVisit: () => [],
        alertsForCustomer: () => [],
        visitsForCustomer: () => [],
      };
    }

    const { contracts, sites, assets, pmSchedules, complaints, visits, reports, alerts } = data;

    return {
      contractsForCustomer: (customerId) => contracts.filter((c) => c.customer_id === customerId),
      sitesForCustomer: (customerId) => sites.filter((s) => s.customer_id === customerId),
      sitesForContract: (contractId) => sites.filter((s) => s.contract_id === contractId),
      assetsForSite: (siteId) => assets.filter((a) => a.site_id === siteId),
      assetsForContract: (contractId) => assets.filter((a) => a.contract_id === contractId),
      pmForContract: (contractId) => pmSchedules.filter((p) => p.contract_id === contractId),
      pmForSite: (siteId) => pmSchedules.filter((p) => p.site_id === siteId),
      pmForAsset: (assetId) => pmSchedules.filter((p) => p.asset_id === assetId),
      complaintsForCustomer: (customerId) => complaints.filter((c) => c.customer_id === customerId),
      complaintsForSite: (siteId) => complaints.filter((c) => c.site_id === siteId),
      complaintsForContract: (contractId) => {
        const siteIds = new Set(sites.filter((s) => s.contract_id === contractId).map((s) => s.id));
        return complaints.filter((c) => c.contract_id === contractId || siteIds.has(c.site_id));
      },
      visitsForPm: (pmId) => visits.filter((v) => v.pm_schedule_id === pmId),
      visitsForComplaint: (complaintId) => visits.filter((v) => v.complaint_id === complaintId),
      reportsForVisit: (visitId) => reports.filter((r) => r.visit_id === visitId),
      alertsForCustomer: (customerId) => alerts.filter((a) => a.customer_id === customerId),
      visitsForCustomer: (customerId) => visits.filter((v) => v.customer_id === customerId),
      engineerWorkload: (engineerId) => ({
        pm: pmSchedules.filter(
          (p) => p.assigned_engineer_id === engineerId && !["completed", "closed", "cancelled"].includes(p.status)
        ),
        complaints: complaints.filter(
          (c) => c.assigned_engineer_id === engineerId && !["closed", "resolved"].includes(c.status)
        ),
        visits: visits.filter((v) => v.engineer_id === engineerId && !["closed"].includes(v.status)),
      }),
    };
  }, [data]);

  const applyEntityFilters = useCallback(
    (rows, options = {}) => {
      if (!rows) return [];
      let list = [...rows];
      const f = { ...filters, ...options };
      if (f.customerId) list = list.filter((r) => r.customer_id === f.customerId);
      if (f.contractId) list = list.filter((r) => r.contract_id === f.contractId);
      if (f.siteId) list = list.filter((r) => r.site_id === f.siteId);
      if (f.assetId) list = list.filter((r) => r.asset_id === f.assetId);
      if (f.pmId) list = list.filter((r) => r.id === f.pmId || r.pm_schedule_id === f.pmId);
      if (f.complaintId) list = list.filter((r) => r.id === f.complaintId || r.complaint_id === f.complaintId);
      if (f.visitId) list = list.filter((r) => r.id === f.visitId || r.visit_id === f.visitId);
      if (f.engineerId) {
        list = list.filter(
          (r) =>
            r.assigned_engineer_id === f.engineerId ||
            r.engineer_id === f.engineerId
        );
      }
      const today = new Date().toISOString().slice(0, 10);
      if (f.due === "today" && options.dueField) {
        list = list.filter(
          (r) =>
            r[options.dueField] === today &&
            !["completed", "closed", "cancelled"].includes(r.status)
        );
      } else if (f.status === "overdue" && options.dueField) {
        list = list.filter(
          (r) =>
            r[options.dueField] < today &&
            !["completed", "closed", "cancelled"].includes(r.status)
        );
      } else if (f.status) {
        list = list.filter((r) => r.status === f.status || r.sla_status === f.status);
      }
      if (f.status === "pending" && !options.dueField) {
        list = list.filter((r) => r.report_status === "pending" || r.status === "pending");
      }
      return list;
    },
    [filters]
  );

  const activeFilterChips = useMemo(() => {
    if (!data) return [];
    const chips = [];
    if (filters.customerId) {
      const c = getById("customers", filters.customerId);
      chips.push({ key: "customerId", label: c?.customer_name || "Customer" });
    }
    if (filters.contractId) {
      const c = getById("contracts", filters.contractId);
      chips.push({ key: "contractId", label: c?.contract_no || "Contract" });
    }
    if (filters.siteId) {
      const s = getById("sites", filters.siteId);
      chips.push({ key: "siteId", label: s?.site_name || "Site" });
    }
    if (filters.status) chips.push({ key: "status", label: `Status: ${filters.status}` });
    if (filters.due) chips.push({ key: "due", label: `Due: ${filters.due}` });
    return chips;
  }, [filters, data, getById]);

  const value = {
    data,
    loading,
    error,
    refresh,
    filters,
    setFilters,
    clearFilters,
    activeFilterChips,
    navigateTo,
    openRecord,
    getById,
    related,
    applyEntityFilters,
    filterBySearch,
    location,
  };

  return <AmcContext.Provider value={value}>{children}</AmcContext.Provider>;
}

export function useAmc() {
  const ctx = useContext(AmcContext);
  if (!ctx) throw new Error("useAmc must be used within AmcProvider");
  return ctx;
}
