import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getLinkedEmployees, getLinkedSites } from "../data/linkedData";
import { buildMockOperationsData } from "../data/mockOperationsData";
import { getOperationsPageFromPath, operationsPath } from "../navConfig";

const OperationsContext = createContext(null);

const THEME_KEY = "operations-ui-theme";

export function OperationsProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setThemeState] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sites, employees] = await Promise.all([getLinkedSites(), getLinkedEmployees()]);
      setData(buildMockOperationsData(sites, employees));
    } catch (e) {
      setError(e?.message || "Failed to load operations data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const refresh = useCallback(() => load(), [load]);

  const setTheme = useCallback((next) => {
    setThemeState(next === "dark" ? "dark" : "light");
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const activePageId = useMemo(
    () => getOperationsPageFromPath(location.pathname),
    [location.pathname]
  );

  const navigateTo = useCallback(
    (pageId, params = {}) => {
      navigate(operationsPath(pageId, params));
    },
    [navigate]
  );

  const filters = useMemo(
    () => ({
      siteId: searchParams.get("siteId") || "",
      status: searchParams.get("status") || "",
      employeeId: searchParams.get("employeeId") || "",
      month: searchParams.get("month") || "",
      highlight: searchParams.get("highlight") || "",
    }),
    [searchParams]
  );

  const setFilters = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      });
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const getSite = useCallback(
    (id) => data?.sites?.find((s) => String(s.id) === String(id)),
    [data]
  );

  const getEmployee = useCallback(
    (id) => data?.employees?.find((e) => String(e.id) === String(id)),
    [data]
  );

  const getProperty = useCallback(
    (id) => data?.properties?.find((p) => String(p.id) === String(id)),
    [data]
  );

  const markNotificationRead = useCallback((id) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === id ? { ...n, unread: false } : n
        ),
      };
    });
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        notifications: prev.notifications.map((n) => ({ ...n, unread: false })),
      };
    });
  }, []);

  const unreadCount = useMemo(
    () => (data?.notifications || []).filter((n) => n.unread).length,
    [data]
  );

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
      theme,
      setTheme,
      toggleTheme,
      activePageId,
      navigateTo,
      filters,
      setFilters,
      getSite,
      getEmployee,
      getProperty,
      globalSearch,
      setGlobalSearch,
      notificationsOpen,
      setNotificationsOpen,
      markNotificationRead,
      markAllNotificationsRead,
      unreadCount,
    }),
    [
      data,
      loading,
      error,
      refresh,
      theme,
      setTheme,
      toggleTheme,
      activePageId,
      navigateTo,
      filters,
      setFilters,
      getSite,
      getEmployee,
      getProperty,
      globalSearch,
      notificationsOpen,
      markNotificationRead,
      markAllNotificationsRead,
      unreadCount,
    ]
  );

  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const ctx = useContext(OperationsContext);
  if (!ctx) throw new Error("useOperations must be used within OperationsProvider");
  return ctx;
}
