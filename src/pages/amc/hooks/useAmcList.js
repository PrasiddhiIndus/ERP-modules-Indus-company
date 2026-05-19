import { useMemo, useState, useEffect } from "react";
import { useAmc } from "../contexts/AmcContext";

const COLLECTION_MAP = {
  customers: "customers",
  contracts: "contracts",
  sites: "sites",
  assets: "assets",
  "pm-schedule": "pmSchedules",
  pmSchedules: "pmSchedules",
  complaints: "complaints",
  visits: "visits",
  "service-reports": "reports",
  reports: "reports",
  alerts: "alerts",
};

/**
 * List hook backed by AmcContext — respects URL filters and local search/status.
 */
export function useAmcList(collection, searchKeys = [], filterOptions = {}) {
  const dataKey = COLLECTION_MAP[collection] || collection;
  const { data, loading, refresh, applyEntityFilters, filterBySearch, filters } = useAmc();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(filters.status || "");

  useEffect(() => {
    if (filters.status) setStatusFilter(filters.status);
  }, [filters.status]);

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data[dataKey] || [];
    list = applyEntityFilters(list, filterOptions);
    if (statusFilter && statusFilter !== "overdue" && filterOptions.dueField !== "special") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (statusFilter === "overdue" && filterOptions.dueField) {
      const today = new Date().toISOString().slice(0, 10);
      list = list.filter(
        (r) =>
          r[filterOptions.dueField] < today &&
          !["completed", "closed", "cancelled"].includes(r.status)
      );
    }
    return filterBySearch(list, search, searchKeys);
  }, [data, dataKey, applyEntityFilters, filterOptions, statusFilter, search, searchKeys, filterBySearch]);

  const highlightId = filters.highlightId;

  return {
    rows,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    reload: refresh,
    highlightId,
    filters,
    dataKey,
  };
}

export function useAmcSelection(collection, searchKeys = [], filterOptions = {}) {
  const list = useAmcList(collection, searchKeys, filterOptions);
  const { getById, filters } = useAmc();
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (filters.highlightId) {
      const rec = getById(COLLECTION_MAP[collection] || collection, filters.highlightId);
      if (rec) setSelected(rec);
    }
  }, [filters.highlightId, collection, getById]);

  return { ...list, selected, setSelected };
}
