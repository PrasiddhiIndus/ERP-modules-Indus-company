import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { listReleases, pickDefaultRelease } from "./qaApi";

const QaReleaseContext = createContext(null);

const STORAGE_KEY = "indus-qa-selected-release";

export function QaReleaseProvider({ children }) {
  const [releases, setReleases] = useState([]);
  const [releaseId, setReleaseIdState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listReleases();
      setReleases(rows);
      setReleaseIdState((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        const d = pickDefaultRelease(rows);
        const next = d?.id || "";
        try {
          if (next) localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
        return next;
      });
    } catch (err) {
      setError(err.message || "Could not load releases.");
      setReleases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const setReleaseId = (id) => {
    setReleaseIdState(id || "");
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const value = useMemo(
    () => ({
      releases,
      releaseId,
      setReleaseId,
      release: releases.find((r) => r.id === releaseId) || null,
      loading,
      error,
      reload,
    }),
    [releases, releaseId, loading, error]
  );

  return <QaReleaseContext.Provider value={value}>{children}</QaReleaseContext.Provider>;
}

export function useQaRelease() {
  const ctx = useContext(QaReleaseContext);
  if (!ctx) throw new Error("useQaRelease must be used within QaReleaseProvider");
  return ctx;
}
