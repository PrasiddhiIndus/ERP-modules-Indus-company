import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRulesConsole } from "./rulesApi";

const EMPTY = { rules: [], values: [], departments: [] };

/** Loads rules, values and departments; `reload()` refreshes quietly after a save. */
export function useRulesConsoleData() {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const mounted = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    setError("");
    try {
      const next = await fetchRulesConsole();
      if (!mounted.current) return;
      setData(next);
      setStatus("ready");
    } catch (e) {
      if (!mounted.current) return;
      setError(e?.message || "Could not load rules.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const reload = useCallback(() => load({ silent: true }), [load]);

  return { ...data, status, error, retry: load, reload };
}
