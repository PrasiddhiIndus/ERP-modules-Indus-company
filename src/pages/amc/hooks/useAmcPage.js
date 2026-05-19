import { useCallback, useEffect, useMemo, useState } from "react";
import { filterBySearch } from "../data/mockAmcData";

export function useAmcPage(fetchFn, searchKeys = []) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFn();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = filterBySearch(rows, search, searchKeys);
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    return list;
  }, [rows, search, statusFilter, searchKeys]);

  return {
    rows: filtered,
    allRows: rows,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    reload: load,
  };
}
