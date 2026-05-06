import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { MODULES as FALLBACK_MODULES, TEAMS as FALLBACK_TEAMS, MODULE_PATH_PREFIXES as FALLBACK_PREFIXES } from "../config/roles";

const Ctx = createContext(null);
export const useAppAccessConfig = () => useContext(Ctx);

const normalizeList = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => ({
      value: String(x?.value || "").trim(),
      label: String(x?.label || "").trim() || String(x?.value || "").trim(),
    }))
    .filter((x) => x.value);
};

export function AppAccessConfigProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("erp_app_access_config")
          .select("id, teams, modules, module_path_prefixes, updated_at")
          .eq("id", "default")
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setRaw(null);
          return;
        }
        setRaw(data);
      } catch {
        if (!cancelled) setRaw(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Realtime: reflect backend changes automatically
    const channel = supabase
      .channel("erp_app_access_config_default")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "erp_app_access_config", filter: "id=eq.default" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const teams = useMemo(() => normalizeList(raw?.teams) || FALLBACK_TEAMS, [raw?.teams]);
  const modules = useMemo(() => normalizeList(raw?.modules) || FALLBACK_MODULES, [raw?.modules]);
  const modulePathPrefixes = useMemo(() => {
    const p = raw?.module_path_prefixes;
    if (p && typeof p === "object") return p;
    return FALLBACK_PREFIXES;
  }, [raw?.module_path_prefixes]);

  const value = useMemo(
    () => ({
      loading,
      teams,
      modules,
      modulePathPrefixes,
      updatedAt: raw?.updated_at || null,
      source: raw ? "supabase" : "fallback",
    }),
    [loading, teams, modules, modulePathPrefixes, raw]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

